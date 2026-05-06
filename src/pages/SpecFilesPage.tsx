import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Layout } from "../components/common/Layout";
import { ResizeHandle } from "../components/common/ResizeHandle";
import { FileTree, buildTree, flattenVisiblePaths, type TreeNode, type FolderNode } from "../components/specfiles/FileTree";
import { MarkdownViewer } from "../components/specfiles/MarkdownViewer";
import { FileUploadModal } from "../components/specfiles/FileUploadModal";
import { ImportFromUrlModal } from "../components/specfiles/ImportFromUrlModal";
import { SyncFolderModal } from "../components/specfiles/SyncFolderModal";
import { SkillsEditor } from "../components/specfiles/SkillsEditor";
import { JsonCodeBlock } from "../components/common/JsonCodeBlock";
import { SearchModal } from "../components/specfiles/SearchModal";
import {
  listSpecFiles,
  getSpecFileContent,
  uploadSpecFile,
  deleteSpecFile,
  deleteSpecFolder,
  renameSpecFile,
  importSpecFileFromUrl,
  syncSpecFiles,
  getSourcesManifest,
  updateSourceUrl,
  type SpecFileItem,
} from "../lib/api/specFilesApi";
import type { SourceEntry } from "../types/spec.types";
import { NewVersionModal } from "../components/specfiles/NewVersionModal";
import { splitSwagger, reimportSpec, type SuggestedVariable, type SuggestedConnection, type ProcessingReport } from "../lib/api/specFilesApi";
import { ImportResultModal } from "../components/specfiles/ImportResultModal";
import { ReimportSpecModal } from "../components/specfiles/ReimportSpecModal";
import { useProjectVariablesStore } from "../store/projectVariables.store";
import { useConnectionsStore } from "../store/connections.store";
import { detectEndpointFromSpec, type DetectedEndpoint } from "../lib/spec/autoDetectEndpoint";
import { useScenarioOrgStore } from "../store/scenarioOrg.store";
import { ConnectEndpointModal } from "../components/explorer/ConnectEndpointModal";
import { getOAuthStatus, type OAuthStatus } from "../lib/api/oauthApi";
import { useWorkshopStore } from "../store/workshop.store";
import { renameIdeas } from "../lib/api/ideasApi";
import { buildVariableLine } from "../lib/skillsVariables";
import { EndpointDocView } from "../components/apidocs/EndpointDocView";
import { MethodBadge } from "../components/apidocs/MethodBadge";
import { TryItPanel } from "../components/apidocs/TryItPanel";
import { parseSwaggerSpec, buildEndpointFileMap, type ParsedSpec, type ParsedEndpointDoc } from "../lib/spec/swaggerParser";
import { computeSpecQuality } from "../lib/spec/specQuality";

/** Modal prompting the user for an access token when sync detects auth failure. */
function AccessTokenPrompt({ message, initialToken, onSubmit, onClose }: {
  message: string;
  initialToken?: string;
  onSubmit: (token: string) => void;
  onClose: () => void;
}) {
  const [token, setToken] = useState(initialToken ?? "");
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#d1d9e0]">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 text-[#9a6700]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <h2 className="text-sm font-semibold text-[#1f2328]">Authentication Required</h2>
          </div>
          <button onClick={onClose} className="text-[#656d76] hover:text-[#1f2328] rounded p-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="px-4 py-4 space-y-3">
          <p className="text-sm text-[#656d76] whitespace-pre-line">{message}</p>
          <div className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-2 text-sm text-[#656d76] space-y-1.5">
            <p className="font-medium text-[#1f2328]">How to get the token:</p>
            <ol className="list-decimal list-inside space-y-0.5">
              <li>Open the URL in your browser (where you're logged in)</li>
              <li>Open DevTools (<code className="bg-white px-1 rounded">F12</code>) → <strong>Network</strong> tab</li>
              <li>Reload the page and click the first request</li>
              <li>Under <strong>Request Headers</strong>, copy the <code className="bg-white px-1 rounded">Cookie</code> value</li>
            </ol>
          </div>
          <textarea
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste cookie or bearer token here..."
            rows={2}
            className="w-full text-sm border border-[#d1d9e0] rounded-md px-2.5 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] placeholder-[#afb8c1] font-mono resize-y"
            autoFocus
          />
        </div>
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0]">
          <button
            onClick={onClose}
            className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-1.5 hover:bg-[#f6f8fa]"
          >
            Cancel
          </button>
          <button
            onClick={() => onSubmit(token.trim())}
            disabled={!token.trim()}
            className="text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors"
          >
            Retry with token
          </button>
        </div>
      </div>
    </div>
  );
}

export function SpecFilesPage() {
  const navigate = useNavigate();

  // ── File tree state ────────────────────────────────────────────────────────
  const [files, setFiles] = useState<SpecFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(
    () => localStorage.getItem("specfiles_selected_path") || null,
  );
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
    () => localStorage.getItem("specfiles_selected_folder_path") || null,
  );
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [viewingContent, setViewingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFolderPath, setUploadFolderPath] = useState<string | null>(null);
  const [importUrlFolderPath, setImportUrlFolderPath] = useState<string | null>(null);
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [showSearch, setShowSearch] = useState(false);
  const [sourcesManifest, setSourcesManifest] = useState<Record<string, SourceEntry>>({});
  const sourcedPaths = useMemo(() => new Set(Object.keys(sourcesManifest)), [sourcesManifest]);

  // Source URL editing state
  const [editingSourceUrl, setEditingSourceUrl] = useState(false);
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  const [syncingPaths, setSyncingPaths] = useState<Set<string>>(new Set());

  // ── Source access token ──────────────────────────────────────────────────
  const [sourceAccessToken, setSourceAccessToken] = useState("");
  const [tokenPrompt, setTokenPrompt] = useState<{
    message: string;
    onRetry: (token: string) => void;
  } | null>(null);
  const [syncFolderPath, setSyncFolderPath] = useState<string | null>(null);

  // ── Import result modal state ──────────────────────────────────────────────
  const [importResult, setImportResult] = useState<{
    folderName: string;
    stats: { endpoints: number; folders: number };
    suggestedVariables: SuggestedVariable[];
    suggestedConnections: SuggestedConnection[];
    processing?: ProcessingReport;
  } | null>(null);

  // ── Reimport state ───────────────────────────────────────────────────────
  const [reimportFolderPath, setReimportFolderPath] = useState<string | null>(null);

  // ── Multi-select state ─────────────────────────────────────────────────────
  const [multiSelectedPaths, setMultiSelectedPaths] = useState<Set<string>>(new Set());
  const lastClickedPathRef = useRef<string | null>(null);

  // ── RHS content tab (Documentation / Markdown) ──────────────────────────
  const [contentTab, setContentTab] = useState<"documentation" | "markdown">(() => {
    try { const v = localStorage.getItem("specfiles_content_tab"); if (v === "markdown") return "markdown"; } catch { /* ignore */ }
    return "documentation";
  });
  useEffect(() => { try { localStorage.setItem("specfiles_content_tab", contentTab); } catch { /* ignore */ } }, [contentTab]);

  // ── RHS panel (Try It + future tabs) ──────────────────────────────────
  const [rhsPanelCollapsed, setRhsPanelCollapsed] = useState(() => {
    try { return localStorage.getItem("specfiles_rhs_collapsed") === "true"; } catch { return false; }
  });
  const [rhsTab, setRhsTab] = useState<"tryit">("tryit");
  const [rhsWidth, setRhsWidth] = useState(() => {
    try { const v = parseInt(localStorage.getItem("specfiles_rhs_width") ?? ""); return v > 0 ? v : 420; } catch { return 420; }
  });
  useEffect(() => { try { localStorage.setItem("specfiles_rhs_width", String(rhsWidth)); } catch { /* ignore */ } }, [rhsWidth]);
  useEffect(() => { try { localStorage.setItem("specfiles_rhs_collapsed", String(rhsPanelCollapsed)); } catch { /* ignore */ } }, [rhsPanelCollapsed]);

  // ── Connection status for Try It panel ──────────────────────────────
  const [showConnectModal, setShowConnectModal] = useState(false);
  const [oauthStatus, setOauthStatus] = useState<OAuthStatus | null>(null);
  const versionConfigs = useScenarioOrgStore((s) => s.versionConfigs);
  const connections = useConnectionsStore((s) => s.connections);
  const connAuthStatus = useConnectionsStore((s) => s.authStatus);

  // Derive version folder from current selection (first path segment)
  const versionFolder = useMemo(() => {
    const p = selectedFolderPath ?? selectedPath;
    if (!p) return null;
    return p.split("/")[0] ?? null;
  }, [selectedFolderPath, selectedPath]);

  // Check if swagger exists for the selected version folder
  const hasSwagger = useMemo(() => {
    if (!versionFolder) return false;
    return files.some(f => f.name === `${versionFolder}/_system/_swagger.json`);
  }, [versionFolder, files]);

  // ── Parsed swagger spec + file-to-endpoint map ─────────────────────────
  const [parsedSpec, setParsedSpec] = useState<ParsedSpec | null>(null);
  const [endpointFileMap, setEndpointFileMap] = useState<Map<string, ParsedEndpointDoc>>(new Map());
  const loadedSwaggerVersionRef = useRef<string | null>(null);
  const [swaggerReloadKey, setSwaggerReloadKey] = useState(0);

  useEffect(() => {
    if (!hasSwagger || !versionFolder) {
      setParsedSpec(null);
      setEndpointFileMap(new Map());
      loadedSwaggerVersionRef.current = null;
      return;
    }
    const cacheKey = `${versionFolder}#${swaggerReloadKey}`;
    if (loadedSwaggerVersionRef.current === cacheKey) return;
    loadedSwaggerVersionRef.current = cacheKey;
    void (async () => {
      try {
        const raw = await getSpecFileContent(`${versionFolder}/_system/_swagger.json`);
        const spec = parseSwaggerSpec(raw);
        setParsedSpec(spec);
        setEndpointFileMap(buildEndpointFileMap(spec));
      } catch {
        setParsedSpec(null);
        setEndpointFileMap(new Map());
      }
    })();
  }, [hasSwagger, versionFolder, swaggerReloadKey]);

  // Quality scores: pure derivation from parsedSpec; recomputes whenever the
  // spec reloads (e.g. after Enhance Docs example saves bumped swaggerReloadKey).
  const qualityScores = useMemo(() => {
    if (!parsedSpec || !versionFolder) return undefined;
    return computeSpecQuality(parsedSpec, versionFolder);
  }, [parsedSpec, versionFolder]);

  // ── Connection status for current version ──────────────────────────────
  const currentVersionConfig = versionFolder ? versionConfigs[versionFolder] : undefined;
  const tryItConnectionId = currentVersionConfig?.connectionId;
  const tryItConnection = connections.find((c) => c.id === tryItConnectionId);
  const tryItBaseUrl = tryItConnection?.baseUrl ?? currentVersionConfig?.baseUrl ?? "";
  const tryItIsOAuth = tryItConnection?.provider === "oauth2";

  useEffect(() => {
    if (!tryItIsOAuth || !tryItConnectionId) { setOauthStatus(null); return; }
    let cancelled = false;
    getOAuthStatus(tryItConnectionId).then((s) => { if (!cancelled) setOauthStatus(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [tryItIsOAuth, tryItConnectionId]);

  // Derive connection readiness and warning message
  const tryItStatus = useMemo<{ canSend: boolean; connected: boolean; expired: boolean; warning?: string; label: string }>(() => {
    if (!tryItConnectionId || !tryItConnection) {
      return { canSend: false, connected: false, expired: false, warning: "Connection not configured - Configure", label: "No auth" };
    }
    if (tryItIsOAuth) {
      const oaStatus = oauthStatus ?? connAuthStatus[tryItConnectionId];
      if (oaStatus?.authenticated) return { canSend: true, connected: true, expired: false, label: currentVersionConfig?.endpointLabel || "Connected" };
      if (oaStatus?.expired) return { canSend: false, connected: false, expired: true, warning: "OAuth token expired. Go to Settings \u2192 Connections to re-authenticate.", label: "Expired" };
      return { canSend: false, connected: false, expired: false, warning: "NOT AUTHENTICATED. Go to Settings > Connections to Authenticate", label: "Not connected" };
    }
    // Non-OAuth: check hasCredential on the actual connection doc
    if (tryItConnection.hasCredential) return { canSend: true, connected: true, expired: false, label: currentVersionConfig?.endpointLabel || "Connected" };
    return { canSend: false, connected: false, expired: false, warning: "No credential stored for this connection. Go to Settings \u2192 Connections to add credentials.", label: "No credential" };
  }, [tryItConnectionId, tryItConnection, tryItIsOAuth, oauthStatus, connAuthStatus, tryItBaseUrl, currentVersionConfig?.endpointLabel]);

  // Resolve the current file's endpoint (if any)
  const selectedEndpoint = useMemo<ParsedEndpointDoc | null>(() => {
    if (!selectedPath || !versionFolder || endpointFileMap.size === 0) return null;
    // Strip version folder prefix: "v3/articles/create-article.md" → "articles/create-article.md"
    const relative = selectedPath.startsWith(versionFolder + "/")
      ? selectedPath.slice(versionFolder.length + 1)
      : selectedPath;
    return endpointFileMap.get(relative) ?? null;
  }, [selectedPath, versionFolder, endpointFileMap]);

  // ── Auto-detected endpoint notification ──────────────────────────────────
  const [specDetection, setSpecDetection] = useState<DetectedEndpoint | null>(null);

  // ── Resizable panel width (persisted) ────────────────────────────────────
  const [treeWidth, setTreeWidth] = useState(() => {
    try { const v = localStorage.getItem("specfiles_tree_width"); if (v) return parseInt(v, 10); } catch { /* ignore */ }
    return 280;
  });
  useEffect(() => { try { localStorage.setItem("specfiles_tree_width", String(treeWidth)); } catch { /* ignore */ } }, [treeWidth]);

  // pathsWithIdeas from workshop store (for tree indicators)
  const workshopMap = useWorkshopStore((s) => s.workshopMap);
  const pathsWithIdeas = useMemo(() => {
    const s = new Set<string>();
    for (const [key, ctx] of Object.entries(workshopMap)) {
      if (ctx.ideas.length > 0) s.add(key);
    }
    return s;
  }, [workshopMap]);

  // Ctrl+K to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setShowSearch(s => !s);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Persist tree selection
  useEffect(() => {
    if (selectedPath) localStorage.setItem("specfiles_selected_path", selectedPath);
    else localStorage.removeItem("specfiles_selected_path");
  }, [selectedPath]);
  useEffect(() => {
    if (selectedFolderPath) localStorage.setItem("specfiles_selected_folder_path", selectedFolderPath);
    else localStorage.removeItem("specfiles_selected_folder_path");
  }, [selectedFolderPath]);

  // ── File list ──────────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const list = await listSpecFiles();
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  const loadSourcedPaths = useCallback(async () => {
    try {
      const manifest = await getSourcesManifest();
      setSourcesManifest(manifest);
    } catch {
      // Non-critical
    }
  }, []);

  useEffect(() => { void loadFiles(); void loadSourcedPaths(); }, [loadFiles, loadSourcedPaths]);

  // Rehydrate selection after file list loads
  const didRehydrateRef = useRef(false);
  useEffect(() => {
    if (didRehydrateRef.current) return;
    if (loadingFiles) return;
    didRehydrateRef.current = true;
    if (files.length === 0) {
      if (selectedPath) setSelectedPath(null);
      if (selectedFolderPath) setSelectedFolderPath(null);
      return;
    }
    if (selectedPath) {
      const stillExists = files.some(f => f.name === selectedPath);
      if (!stillExists) { setSelectedPath(null); return; }
      setLoadingContent(true);
      void (async () => {
        try {
          const text = await getSpecFileContent(selectedPath);
          setContent(text);
        } catch (e) {
          setError(e instanceof Error ? e.message : String(e));
        } finally {
          setLoadingContent(false);
        }
      })();
    } else if (selectedFolderPath) {
      const stillExists = files.some(f => f.name === selectedFolderPath || f.name.startsWith(`${selectedFolderPath}/`));
      if (!stillExists) setSelectedFolderPath(null);
    }
  }, [loadingFiles, files]);

  // ── Select file / folder ──────────────────────────────────────────────────

  async function selectFile(path: string) {
    setMultiSelectedPaths(new Set());
    setSelectedPath(path);
    setSelectedFolderPath(null);
    const isSystemFile = path.includes("/_system/");
    const isSkills = path.endsWith("/_skills.md") || path.endsWith("/Skills.md");
    setViewingContent(isSkills || isSystemFile);
    setEditingSourceUrl(false);
    setContent("");
    setLoadingContent(true);
    try {
      const text = await getSpecFileContent(path);
      setContent(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingContent(false);
    }
  }

  function selectFolder(path: string) {
    setMultiSelectedPaths(new Set());
    setSelectedFolderPath(path);
    setSelectedPath(null);
    setViewingContent(false);
    setContent("");
  }

  // ── Multi-select handlers ────────────────────────────────────────────────

  function collectDescendants(folderPath: string, tree: TreeNode[]): string[] {
    const results: string[] = [];
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        results.push(n.path);
        if (n.type === "folder") walk(n.children);
      }
    }
    function findFolder(nodes: TreeNode[]): FolderNode | undefined {
      for (const n of nodes) {
        if (n.type === "folder" && n.path === folderPath) return n;
        if (n.type === "folder") {
          const found = findFolder(n.children);
          if (found) return found;
        }
      }
      return undefined;
    }
    const folder = findFolder(tree);
    if (folder) walk(folder.children);
    return results;
  }

  function allDescendantsSelected(folderPath: string, tree: TreeNode[]): boolean {
    const descendants = collectDescendants(folderPath, tree);
    return descendants.length > 0 && descendants.every(p => multiSelectedPaths.has(p));
  }

  function handleMultiSelect(path: string, e: React.MouseEvent) {
    const tree = buildTree(files);
    if (e.shiftKey && lastClickedPathRef.current) {
      const sortState: Record<string, string> = {};
      try {
        const raw = localStorage.getItem("specfiles_folder_sort");
        if (raw) Object.assign(sortState, JSON.parse(raw));
      } catch { /* ignore */ }
      const expandedRaw = localStorage.getItem("specfiles_expanded_folders");
      const expanded = expandedRaw ? new Set(JSON.parse(expandedRaw) as string[]) : new Set<string>();
      const flat = flattenVisiblePaths(tree, expanded, sortState as Record<string, "name" | "method">);
      const startIdx = flat.indexOf(lastClickedPathRef.current);
      const endIdx = flat.indexOf(path);
      if (startIdx !== -1 && endIdx !== -1) {
        const lo = Math.min(startIdx, endIdx);
        const hi = Math.max(startIdx, endIdx);
        const range = flat.slice(lo, hi + 1);
        setMultiSelectedPaths(prev => {
          const next = new Set(prev);
          for (const p of range) {
            next.add(p);
            const isFolder = !files.some(f => f.name === p);
            if (isFolder) {
              for (const d of collectDescendants(p, tree)) next.add(d);
            }
          }
          return next;
        });
      }
    } else {
      const isFolderNode = (() => {
        function find(nodes: TreeNode[]): TreeNode | undefined {
          for (const n of nodes) {
            if (n.path === path) return n;
            if (n.type === "folder") {
              const found = find(n.children);
              if (found) return found;
            }
          }
          return undefined;
        }
        const node = find(tree);
        return node?.type === "folder";
      })();

      setMultiSelectedPaths(prev => {
        const next = new Set(prev);
        if (isFolderNode) {
          const descendants = collectDescendants(path, tree);
          const isCurrentlySelected = next.has(path) && allDescendantsSelected(path, tree);
          if (isCurrentlySelected) {
            next.delete(path);
            for (const d of descendants) next.delete(d);
          } else {
            next.add(path);
            for (const d of descendants) next.add(d);
          }
        } else {
          if (next.has(path)) next.delete(path);
          else next.add(path);
        }
        return next;
      });
    }
    lastClickedPathRef.current = path;
  }

  function handleClearMultiSelect() { setMultiSelectedPaths(new Set()); }

  function handleSelectAll() {
    const tree = buildTree(files);
    const allPaths: string[] = [];
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        allPaths.push(n.path);
        if (n.type === "folder") walk(n.children);
      }
    }
    walk(tree);
    setMultiSelectedPaths(new Set(allPaths));
  }

  async function handleBulkDelete() {
    const allBlobsToDelete = new Set<string>();
    for (const p of multiSelectedPaths) {
      if (files.some(f => f.name === p)) allBlobsToDelete.add(p);
      for (const f of files) {
        if (f.name.startsWith(p + "/")) allBlobsToDelete.add(f.name);
      }
    }
    if (allBlobsToDelete.size === 0) return;
    const count = multiSelectedPaths.size;
    if (!confirm(`Delete ${count} selected item${count !== 1 ? "s" : ""} (${allBlobsToDelete.size} blob${allBlobsToDelete.size !== 1 ? "s" : ""})?`)) return;
    setError(null);
    try {
      await Promise.all([...allBlobsToDelete].map(f => deleteSpecFile(f)));
      if (selectedPath && allBlobsToDelete.has(selectedPath)) {
        setSelectedPath(null);
        setContent("");
      }
      setMultiSelectedPaths(new Set());
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Skills template builder ───────────────────────────────────────────────

  function buildSkillsTemplate(folderPath: string, variables?: SuggestedVariable[]): string {
    const varLines = variables && variables.length > 0
      ? variables.map(v => buildVariableLine(v.name)).join("\n")
      : "<!-- No path parameters detected. Add mappings after importing an OpenAPI spec. -->";

    return [
      `# API Skills — ${folderPath}`,
      "",
      "Describe your API's rules, quirks, and conventions below.",
      "These are injected into AI prompts when generating ideas, flows, and edits.",
      "",
      "## API Rules",
      "",
      "<!-- Add project-specific rules here, e.g.:",
      "- NEVER use PUT — this API uses PATCH for all updates",
      "- DELETE returns 204 with no body",
      "-->",
      "",
      "## Context Variables",
      "",
      "Flow XML uses `{variable_name}` in URL paths and `{{proj.variableName}}` in expressions.",
      "These map to project variables defined in Settings → Variables.",
      "",
      "Default mappings for this project:",
      varLines,
      "",
      "## Enum Aliases",
      "",
      "```",
      "<!-- name=value, one per line, e.g.:",
      "draft=0",
      "published=3",
      "markdown=0",
      "wysiwyg=1",
      "-->",
      "```",
      "",
    ].join("\n");
  }

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  async function handleCreateFolder(folderPath: string) {
    setError(null);
    try {
      await uploadSpecFile(`${folderPath}/.keep`, "");
      if (!folderPath.includes("/")) {
        const skillsContent = buildSkillsTemplate(folderPath);
        await uploadSpecFile(`${folderPath}/_system/_skills.md`, skillsContent);
      }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleCreateVersion(folderName: string, specContent?: string, specUrl?: string) {
    setError(null);
    try {
      await handleCreateFolder(folderName);
      if (specContent) {
        await uploadSpecFile(`${folderName}/_system/_swagger.json`, specContent, "application/json");
        const result = await splitSwagger(folderName);
        await loadFiles();
        setShowNewVersionModal(false);
        setError(null);
        await Promise.all([
          useProjectVariablesStore.getState().load(),
          useConnectionsStore.getState().load(),
        ]);
        setImportResult({
          folderName,
          stats: result.stats,
          suggestedVariables: result.suggestedVariables ?? [],
          suggestedConnections: result.suggestedConnections ?? [],
          processing: result.processing,
        });
      } else if (specUrl) {
        const result = await splitSwagger(folderName, { specUrl });
        await loadFiles();
        setShowNewVersionModal(false);
        await Promise.all([
          useProjectVariablesStore.getState().load(),
          useConnectionsStore.getState().load(),
        ]);
        setImportResult({
          folderName,
          stats: result.stats,
          suggestedVariables: result.suggestedVariables ?? [],
          suggestedConnections: result.suggestedConnections ?? [],
          processing: result.processing,
        });
      } else {
        setShowNewVersionModal(false);
      }
    } catch (e) {
      throw e;
    }
  }

  async function handleImportDone(selectedVarNames: string[], selectedConnections: SuggestedConnection[]) {
    const varStore = useProjectVariablesStore.getState();
    const existing = varStore.variables;
    const existingNames = new Set(existing.map(v => v.name));
    const newVars = selectedVarNames
      .filter(n => !existingNames.has(n))
      .map(n => ({ name: n, value: "" }));
    if (newVars.length > 0) {
      await varStore.save([...existing, ...newVars]);
    }

    const connStore = useConnectionsStore.getState();
    for (const conn of selectedConnections) {
      try {
        await connStore.add({
          name: conn.name,
          provider: conn.provider,
          draft: true,
          ...(conn.baseUrl ? { baseUrl: conn.baseUrl } : {}),
          ...(conn.apiVersion ? { apiVersion: conn.apiVersion } : {}),
          ...(conn.authorizationUrl ? { authorizationUrl: conn.authorizationUrl } : {}),
          ...(conn.tokenUrl ? { tokenUrl: conn.tokenUrl } : {}),
          ...(conn.scopes ? { scopes: conn.scopes } : {}),
          ...(conn.authHeaderName ? { authHeaderName: conn.authHeaderName } : {}),
          ...(conn.authQueryParam ? { authQueryParam: conn.authQueryParam } : {}),
        });
      } catch { /* skip */ }
    }

    if (importResult && selectedVarNames.length > 0) {
      const selected = (importResult.suggestedVariables ?? []).filter(v => selectedVarNames.includes(v.name));
      if (selected.length > 0) {
        uploadSpecFile(
          `${importResult.folderName}/_system/_skills.md`,
          buildSkillsTemplate(importResult.folderName, selected),
        ).catch(() => {});
      }
    }

    setImportResult(null);
  }

  function handleImportSkip() { setImportResult(null); }

  async function handleReimport(specContent?: string, specUrl?: string) {
    if (!reimportFolderPath) return;
    const folderPath = reimportFolderPath;
    const result = await reimportSpec(folderPath, specContent, specUrl);
    await loadFiles();
    setReimportFolderPath(null);

    // Clear wiped ideas/flows from workshop store
    useWorkshopStore.getState().setWorkshopMap(prev => {
      const next: Record<string, typeof prev[string]> = {};
      for (const [key, val] of Object.entries(prev)) {
        if (key === folderPath || key.startsWith(folderPath + "/")) continue;
        next[key] = val;
      }
      return next;
    });

    await Promise.all([
      useProjectVariablesStore.getState().load(),
      useConnectionsStore.getState().load(),
    ]);
    setImportResult({
      folderName: folderPath,
      stats: result.stats,
      suggestedVariables: result.suggestedVariables ?? [],
      suggestedConnections: result.suggestedConnections ?? [],
      processing: result.processing,
    });
  }

  async function handleUpload(name: string, fileContent: string, contentType: string) {
    await uploadSpecFile(name, fileContent, contentType);
    await loadFiles();
    if (name.toLowerCase().endsWith(".json") && fileContent) {
      const detected = detectEndpointFromSpec(fileContent);
      if (detected) {
        setSpecDetection(detected);
        useScenarioOrgStore.getState().setDetectedEndpoint(detected);
      }
    }
  }

  async function handleDeleteFile(path: string) {
    setError(null);
    try {
      await deleteSpecFile(path);
      if (selectedPath === path) { setSelectedPath(null); setContent(""); }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteFolder(folderPath: string) {
    setError(null);
    try {
      await deleteSpecFolder(folderPath);
      if (selectedPath?.startsWith(`${folderPath}/`)) { setSelectedPath(null); setContent(""); }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRename(oldPath: string, newPath: string) {
    setError(null);
    try {
      const isFolder = !files.some((f) => f.name === oldPath);
      if (isFolder) {
        const toRename = files.filter((f) => f.name.startsWith(`${oldPath}/`));
        await Promise.all(
          toRename.map((f) => renameSpecFile(f.name, f.name.replace(oldPath, newPath))),
        );
        if (selectedPath?.startsWith(`${oldPath}/`)) {
          setSelectedPath(selectedPath.replace(oldPath, newPath));
        }
        // Migrate ideas in Cosmos + re-key in workshop store
        renameIdeas(oldPath, newPath).catch(e =>
          console.warn("[handleRename] Ideas migration failed (non-fatal):", e),
        );
        void useWorkshopStore.getState().renameFolder(oldPath, newPath);
      } else {
        await renameSpecFile(oldPath, newPath);
        if (selectedPath === oldPath) setSelectedPath(newPath);
        // Update specFiles references in workshop store
        useWorkshopStore.getState().setWorkshopMap(prev => {
          const updated: Record<string, typeof prev[string]> = {};
          for (const [key, ctx] of Object.entries(prev)) {
            const updatedIdeas = ctx.ideas.map(idea => {
              if (!idea.specFiles?.length) return idea;
              return {
                ...idea,
                specFiles: idea.specFiles.map(f => f === oldPath ? newPath : f),
              };
            });
            updated[key] = { ...ctx, ideas: updatedIdeas };
          }
          return updated;
        });
      }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Import from URL ────────────────────────────────────────────────────────

  async function handleImportFromUrl(url: string, folderPath: string, filename?: string, userAccessToken?: string) {
    if (userAccessToken) {
      setSourceAccessToken(userAccessToken);
      await importSpecFileFromUrl(url, folderPath, filename, userAccessToken);
      await loadFiles();
      await loadSourcedPaths();
      await tryDetectAfterImport(url, folderPath, filename);
      return;
    }
    const effectiveToken = sourceAccessToken.trim() || "";
    let clientContent: string | undefined;
    if (!effectiveToken) {
      try {
        const resp = await fetch(url, { credentials: "include" });
        if (resp.ok) {
          const text = await resp.text();
          if (!text.trimStart().startsWith("<!DOCTYPE") && !text.trimStart().startsWith("<html")) {
            clientContent = text;
          }
        }
      } catch { /* CORS fallback */ }
    }
    await importSpecFileFromUrl(url, folderPath, filename, effectiveToken, clientContent);
    await loadFiles();
    await loadSourcedPaths();
    const resolvedName = filename || url.split("/").pop() || "";
    if (resolvedName.toLowerCase().endsWith(".json")) {
      if (clientContent) {
        const detected = detectEndpointFromSpec(clientContent);
        if (detected) {
          setSpecDetection(detected);
          useScenarioOrgStore.getState().setDetectedEndpoint(detected);
        }
      } else {
        await tryDetectAfterImport(url, folderPath, filename);
      }
    }
  }

  async function tryDetectAfterImport(url: string, folderPath: string, filename?: string) {
    const resolvedName = filename || url.split("/").pop() || "";
    if (!resolvedName.toLowerCase().endsWith(".json")) return;
    const blobPath = folderPath ? `${folderPath}/${resolvedName}` : resolvedName;
    try {
      const content = await getSpecFileContent(blobPath);
      if (content) {
        const detected = detectEndpointFromSpec(content);
        if (detected) {
          setSpecDetection(detected);
          useScenarioOrgStore.getState().setDetectedEndpoint(detected);
        }
      }
    } catch { /* skip */ }
  }

  // ── Sync from URL source ──────────────────────────────────────────────────

  function isAuthError(msg: string): boolean {
    return msg.includes("authentication may be required") || msg.includes("Redirection detected") || msg.includes("HTML");
  }

  async function handleSyncFile(folderPath: string, filename: string, overrideToken?: string) {
    const syncedPath = folderPath ? `${folderPath}/${filename}` : filename;
    setSyncingPaths((prev) => new Set([...prev, syncedPath]));
    try {
      const token = overrideToken || sourceAccessToken.trim() || "";
      const result = await syncSpecFiles(folderPath, filename, token);
      const failed = result.synced.filter((r) => !r.updated);
      if (failed.length > 0) {
        const hasAuthFail = failed.some((f) => f.error && isAuthError(f.error));
        if (hasAuthFail) {
          setTokenPrompt({
            message: `Sync failed for "${filename}" — authentication may be required.\nProvide a fresh access token to retry.`,
            onRetry: (newToken) => {
              setSourceAccessToken(newToken);
              setTokenPrompt(null);
              void handleSyncFile(folderPath, filename, newToken);
            },
          });
        } else {
          alert(`Sync failed for: ${failed.map((f) => `${f.name}: ${f.error}`).join("\n")}`);
        }
      }
      await loadFiles();
      await loadSourcedPaths();
      if (selectedPath === syncedPath) {
        const fresh = await getSpecFileContent(syncedPath);
        setContent(fresh);
      }
    } catch (e) {
      alert(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setSyncingPaths((prev) => { const next = new Set(prev); next.delete(syncedPath); return next; });
    }
  }

  function handleSyncFolder(folderPath: string) {
    setSyncFolderPath(folderPath);
  }


  async function handleSyncForModal(
    folderPath: string,
    filename?: string,
    accessToken?: string,
  ): Promise<{ synced: Array<{ name: string; updated: boolean; error?: string }> }> {
    const token = accessToken || sourceAccessToken.trim() || "";
    return syncSpecFiles(folderPath, filename, token);
  }

  async function handleSaveSourceUrl(filePath: string, newUrl: string) {
    try {
      await updateSourceUrl(filePath, newUrl);
      setEditingSourceUrl(false);
      await loadSourcedPaths();
    } catch (e) {
      alert(`Failed to update source URL: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Navigate to Ideas & Flows page ────────────────────────────────────────

  function handleNavigateToIdeas(path: string) {
    navigate(`/ideas-flows?folder=${encodeURIComponent(path)}`);
  }

  // ── Derived info ──────────────────────────────────────────────────────────

  const activePath = selectedPath ?? selectedFolderPath;
  const isFileContext = !!selectedPath;
  const hasSelection = !!activePath;

  const fileDisplayName = isFileContext && selectedPath
    ? selectedPath.replace(/\.md$/i, "").split("/").pop() ?? ""
    : "";
  const fileParentPath = isFileContext && selectedPath
    ? selectedPath.replace(/\.md$/i, "").split("/").slice(0, -1).join("/")
    : "";

  const specFileCount = selectedFolderPath
    ? files.filter((f) => f.name.startsWith(`${selectedFolderPath}/`) && f.name.endsWith(".md")).length
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="h-full flex overflow-hidden">
        {/* LHS tree */}
        <aside className="shrink-0 bg-white flex flex-col overflow-hidden" style={{ width: treeWidth }}>
          {error && (
            <div className="mx-2 mt-2 text-sm text-[#d1242f] bg-[#ffebe9] border border-[#ffcecb] rounded-md px-2 py-1.5 shrink-0">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-[#d1242f]/60 hover:text-[#d1242f]">✕</button>
            </div>
          )}
          {specDetection && (
            <div className="mx-2 mt-2 text-sm bg-[#ddf4ff] border border-[#54aeff66] rounded-md px-2.5 py-2 shrink-0">
              <div className="flex items-start gap-2">
                <svg className="w-3.5 h-3.5 text-[#0969da] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-[#0969da] font-medium">{specDetection.summary}</p>
                  <p className="text-[#656d76] mt-0.5">
                    Connect your versions in Scenario Manager to use this endpoint.
                  </p>
                </div>
                <button
                  onClick={() => setSpecDetection(null)}
                  className="text-[#656d76] hover:text-[#1f2328] shrink-0 p-0.5"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          )}
          <FileTree
            files={files}
            loading={loadingFiles}
            selectedPath={selectedPath}
            selectedFolderPath={selectedFolderPath}
            pathsWithIdeas={pathsWithIdeas}
            sourcedPaths={sourcedPaths}
            syncingPaths={syncingPaths}
            qualityScores={qualityScores}
            multiSelectedPaths={multiSelectedPaths}
            onSelectFile={(path) => void selectFile(path)}
            onSelectFolder={selectFolder}
            onMultiSelect={handleMultiSelect}
            onSelectAll={handleSelectAll}
            onClearMultiSelect={handleClearMultiSelect}
            onBulkDelete={() => void handleBulkDelete()}
            onCreateFolder={(path) => handleCreateFolder(path)}
            onDeleteFile={(path) => handleDeleteFile(path)}
            onDeleteFolder={(path) => handleDeleteFolder(path)}
            onRenameFile={(oldPath, newPath) => handleRename(oldPath, newPath)}
            onUploadFiles={(folderPath) => setUploadFolderPath(folderPath)}
            onImportFromUrl={(folderPath) => setImportUrlFolderPath(folderPath)}
            onSyncFile={(folderPath, filename) => void handleSyncFile(folderPath, filename)}
            onSyncFolder={(folderPath) => void handleSyncFolder(folderPath)}
            onReimportSpec={(folderPath) => setReimportFolderPath(folderPath)}
            onGenerateFlowIdeas={handleNavigateToIdeas}
            onRefresh={loadFiles}
            onNewVersion={() => setShowNewVersionModal(true)}
            onSearch={() => setShowSearch(true)}
          />
        </aside>
        <ResizeHandle width={treeWidth} onResize={setTreeWidth} minWidth={160} maxWidth={500} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {hasSelection ? (
            <>
              {/* Header bar — file/folder breadcrumb */}
              <div className="flex items-center gap-1.5 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                {isFileContext ? (
                  <>
                    <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
                    </svg>
                    {fileParentPath && (
                      <span className="text-sm text-[#656d76]">{fileParentPath}/</span>
                    )}
                    <button
                      onClick={() => setViewingContent(true)}
                      className="text-sm font-semibold text-[#0969da] hover:underline"
                    >
                      {fileDisplayName}
                    </button>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 text-[#9a6700] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
                    </svg>
                    <span className="text-sm font-semibold text-[#1f2328]">{selectedFolderPath}</span>
                    <span className="text-xs text-[#656d76]">
                      ({specFileCount} spec file{specFileCount !== 1 ? "s" : ""})
                    </span>
                  </>
                )}
              </div>

              {/* Source URL info bar */}
              {isFileContext && selectedPath && sourcesManifest[selectedPath] && (
                <div className="flex items-center gap-2 px-4 h-8 border-b border-[#d1d9e0] bg-[#ddf4ff]/50 shrink-0">
                  <svg className="w-3.5 h-3.5 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                  <span className="text-sm text-[#656d76]">Source:</span>
                  {editingSourceUrl ? (
                    <form
                      className="flex items-center gap-1.5 flex-1 min-w-0"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (sourceUrlDraft.trim() && selectedPath) {
                          void handleSaveSourceUrl(selectedPath, sourceUrlDraft.trim());
                        }
                      }}
                    >
                      <input
                        autoFocus
                        value={sourceUrlDraft}
                        onChange={(e) => setSourceUrlDraft(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Escape") setEditingSourceUrl(false); }}
                        className="flex-1 min-w-0 text-sm border border-[#0969da] rounded px-1.5 py-0.5 outline-none bg-white text-[#1f2328]"
                        placeholder="https://..."
                      />
                      <button type="submit" className="text-sm text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded px-2 py-0.5 font-medium">Save</button>
                      <button type="button" onClick={() => setEditingSourceUrl(false)} className="text-sm text-[#656d76] hover:text-[#1f2328]">Cancel</button>
                    </form>
                  ) : (
                    <>
                      <a
                        href={sourcesManifest[selectedPath].sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-sm text-[#0969da] hover:underline truncate flex-1 min-w-0"
                        title={sourcesManifest[selectedPath].sourceUrl}
                      >
                        {sourcesManifest[selectedPath].sourceUrl}
                      </a>
                      <button
                        onClick={() => {
                          setSourceUrlDraft(sourcesManifest[selectedPath!]?.sourceUrl ?? "");
                          setEditingSourceUrl(true);
                        }}
                        title="Edit source URL"
                        className="text-[#656d76] hover:text-[#1f2328] rounded p-0.5 hover:bg-[#b6e3ff]/50 transition-colors shrink-0"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                        </svg>
                      </button>
                      <button
                        onClick={() => { if (selectedPath) void handleSyncFile(selectedPath.slice(0, selectedPath.lastIndexOf("/")), selectedPath.slice(selectedPath.lastIndexOf("/") + 1)); }}
                        title="Sync from source"
                        className="text-[#656d76] hover:text-[#1f2328] rounded p-0.5 hover:bg-[#b6e3ff]/50 transition-colors shrink-0"
                      >
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                        </svg>
                      </button>
                      {sourcesManifest[selectedPath].lastSyncedAt && (
                        <span className="text-xs text-[#656d76] shrink-0">
                          Synced {new Date(sourcesManifest[selectedPath].lastSyncedAt!).toLocaleDateString()}
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Documentation / Markdown tab bar — when file maps to a swagger endpoint */}
              {selectedEndpoint && (
                <div className="flex items-center gap-1 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                  {(["documentation", "markdown"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setContentTab(tab)}
                      className={`px-3 py-1 text-sm font-semibold border-b-2 transition-colors ${
                        contentTab === tab
                          ? "border-[#fd8c73] text-[#1f2328]"
                          : "border-transparent text-[#656d76] hover:text-[#1f2328]"
                      }`}
                    >
                      <span className="capitalize">{tab}</span>
                    </button>
                  ))}
                </div>
              )}

              {/* Content area */}
              {selectedEndpoint && contentTab === "documentation" ? (
                <EndpointDocView
                  endpoint={selectedEndpoint}
                  securitySchemes={parsedSpec?.securitySchemes}
                />
              ) : viewingContent && isFileContext && (selectedPath?.endsWith("/_skills.md") || selectedPath?.endsWith("/Skills.md")) ? (
                loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden min-h-0">
                    <SkillsEditor path={selectedPath!} content={content} onSaved={() => void loadFiles()} />
                  </div>
                )
              ) : viewingContent && isFileContext && selectedPath?.includes("/_system/") && selectedPath?.endsWith(".json") ? (
                loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                ) : (
                  <div className="flex-1 flex flex-col overflow-hidden">
                    <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                      <span className="text-sm font-medium text-[#1f2328]">{selectedPath!.split("/").pop()}</span>
                    </div>
                    <div className="flex-1 overflow-auto">
                      <JsonCodeBlock value={(() => { try { return JSON.parse(content); } catch { return content; } })()} height="100%" />
                    </div>
                  </div>
                )
              ) : viewingContent && isFileContext ? (
                loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                ) : (
                  <MarkdownViewer path={selectedPath!} content={content} onClose={selectedPath?.includes("/_system/") ? undefined : () => setViewingContent(false)} />
                )
              ) : isFileContext ? (
                /* File selected but not viewing content — show markdown viewer */
                loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                ) : content ? (
                  <MarkdownViewer path={selectedPath!} content={content} onClose={() => setViewingContent(false)} />
                ) : (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">
                    Select a file to view its contents
                  </div>
                )
              ) : activePath && (activePath.includes("/_system") || activePath.includes("/_distilled")) ? (
                <div className="flex-1 flex items-center justify-center bg-white">
                  <div className="text-center space-y-3 max-w-sm">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto bg-[#656d76]/10">
                      <svg className="w-7 h-7 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1f2328] mb-1">System folder</p>
                      <p className="text-sm text-[#656d76]">
                        {activePath.includes("/_distilled")
                          ? "This folder contains optimized versions of your API specs, automatically generated to reduce AI processing costs."
                          : "This folder contains internal system files such as API rules, diagnostic lessons, and spec digests."}
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                /* Folder selected without swagger — show folder info + link to Ideas */
                <div className="flex-1 flex items-center justify-center bg-white">
                  <div className="text-center space-y-4 max-w-sm">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto bg-[#0969da]/10">
                      <svg className="w-7 h-7 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v2.25a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 16.5v-2.25" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1f2328] mb-1">{selectedFolderPath}</p>
                      <p className="text-sm text-[#656d76]">
                        {specFileCount} spec file{specFileCount !== 1 ? "s" : ""} in this folder.
                        Select a file to view its API documentation, or generate ideas.
                      </p>
                    </div>
                    <button
                      onClick={() => handleNavigateToIdeas(selectedFolderPath!)}
                      className="inline-flex items-center gap-1.5 bg-[#1f883d] hover:bg-[#1a7f37] text-white text-sm font-medium rounded-md px-3 py-2 transition-colors border border-[#1f883d]/80"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                      </svg>
                      Go to Ideas & Flows
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <svg className="w-12 h-12 mx-auto text-[#d1d9e0]" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm text-[#656d76]">Select a file or folder</p>
              </div>
            </div>
          )}
        </div>

        {/* ── RHS Panel: Try It (+ future tabs) ───────────────────────── */}
        {selectedEndpoint && versionFolder && (
          rhsPanelCollapsed ? (
            /* Collapsed — show vertical "Try It" expand button */
            <div className="shrink-0 flex flex-col items-center border-l border-[#d1d9e0] bg-[#f6f8fa] w-10">
              <button
                onClick={() => setRhsPanelCollapsed(false)}
                className="flex flex-col items-center gap-1 py-3 text-[#0969da] hover:text-[#0860ca] transition-colors w-full"
                title="Open Try It panel"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.347a1.125 1.125 0 0 1 0 1.972l-11.54 6.347a1.125 1.125 0 0 1-1.667-.986V5.653Z" />
                </svg>
                <span className="text-sm font-medium [writing-mode:vertical-lr]">Try It</span>
              </button>
            </div>
          ) : (
            <>
              <ResizeHandle width={rhsWidth} onResize={setRhsWidth} minWidth={320} maxWidth={700} side="right" />
              <aside className="shrink-0 flex flex-col overflow-hidden bg-white" style={{ width: rhsWidth }}>
                {/* Row 1 — matches breadcrumb bar h-10: tab bar + connection status + connect + collapse */}
                <div className="flex items-center gap-1 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                  {(["tryit"] as const).map((tab) => (
                    <button
                      key={tab}
                      onClick={() => setRhsTab(tab)}
                      className={`px-3 py-1 text-sm font-semibold border-b-2 transition-colors ${
                        rhsTab === tab
                          ? "border-[#fd8c73] text-[#1f2328]"
                          : "border-transparent text-[#656d76] hover:text-[#1f2328]"
                      }`}
                    >
                      {tab === "tryit" ? "Try It" : tab}
                    </button>
                  ))}
                  <div className="ml-auto flex items-center gap-1.5">
                    {/* Connection status badge */}
                    {tryItStatus.connected ? (
                      <span className="text-xs text-[#1a7f37] font-medium px-1.5 py-0.5 rounded-full bg-[#dafbe1] border border-[#aceebb] truncate max-w-[120px]"
                        title={`Connected: ${tryItStatus.label}`}
                      >
                        {tryItStatus.label}
                      </span>
                    ) : tryItStatus.expired ? (
                      <span className="text-xs text-[#d1242f] font-medium px-1.5 py-0.5 rounded-full bg-[#ffebe9] border border-[#d1242f]/30">
                        {tryItStatus.label}
                      </span>
                    ) : tryItConnectionId ? (
                      <span className="text-xs text-[#9a6700] font-medium px-1.5 py-0.5 rounded-full bg-[#fff8c5] border border-[#d4a72c]/30">
                        {tryItStatus.label}
                      </span>
                    ) : (
                      <span className="text-xs text-[#656d76] font-medium px-1.5 py-0.5 rounded-full bg-[#f6f8fa] border border-[#d1d9e0]">
                        {tryItStatus.label}
                      </span>
                    )}
                    {/* Connect button — opens ConnectEndpointModal */}
                    <button
                      onClick={() => setShowConnectModal(true)}
                      className="text-[#656d76] hover:text-[#0969da] rounded p-1 hover:bg-[#ddf4ff] transition-colors"
                      title="Configure connection"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m9.86-1.135a4.5 4.5 0 0 0-1.242-7.244l-4.5-4.5a4.5 4.5 0 0 0-6.364 6.364L4.34 8.303" />
                      </svg>
                    </button>
                    {/* Collapse button */}
                    <button
                      onClick={() => setRhsPanelCollapsed(true)}
                      className="text-[#656d76] hover:text-[#1f2328] rounded p-0.5"
                      title="Collapse panel"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m5.25 4.5 7.5 7.5-7.5 7.5m6-15 7.5 7.5-7.5 7.5" />
                      </svg>
                    </button>
                  </div>
                </div>
                {/* Row 2 — matches Documentation/Markdown tab bar h-9: method + base URL + path */}
                <div className="flex items-center gap-2 px-3 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                  <MethodBadge method={selectedEndpoint.method} size="xs" />
                  <code className="text-sm font-mono text-[#656d76] truncate flex-1">
                    {tryItBaseUrl ? `${tryItBaseUrl}${selectedEndpoint.path}` : selectedEndpoint.path}
                  </code>
                </div>
                {/* Tab content */}
                <div className="flex-1 overflow-hidden">
                  {rhsTab === "tryit" && (
                    <TryItPanel
                      endpoint={selectedEndpoint}
                      connectionId={tryItConnectionId}
                      baseUrl={tryItBaseUrl}
                      canSend={tryItStatus.canSend}
                      connectionWarning={tryItStatus.warning}
                      onOpenConnect={() => setShowConnectModal(true)}
                      securitySchemes={parsedSpec?.securitySchemes}
                      specPath={selectedPath ?? undefined}
                      versionFolder={versionFolder ?? undefined}
                      onSpecRefresh={() => setSwaggerReloadKey((k) => k + 1)}
                    />
                  )}
                </div>
              </aside>
            </>
          )
        )}

        {/* ConnectEndpointModal for Try It panel */}
        {showConnectModal && versionFolder && (
          <ConnectEndpointModal version={versionFolder} onClose={() => setShowConnectModal(false)} />
        )}
      </div>

      {/* Search modal */}
      {showSearch && (
        <SearchModal
          onSelectFile={(path) => { void selectFile(path); setViewingContent(true); }}
          onClose={() => setShowSearch(false)}
        />
      )}

      {/* New Version modal */}
      <NewVersionModal
        open={showNewVersionModal}
        onClose={() => setShowNewVersionModal(false)}
        onCreate={handleCreateVersion}
      />

      {/* Import result modal */}
      {importResult && (
        <ImportResultModal
          open={true}
          folderName={importResult.folderName}
          stats={importResult.stats}
          processing={importResult.processing}
          suggestedVariables={importResult.suggestedVariables}
          existingVariableNames={new Set(useProjectVariablesStore.getState().variables.map(v => v.name))}
          suggestedConnections={importResult.suggestedConnections}
          existingConnectionNames={new Set(useConnectionsStore.getState().connections.map(c => c.name))}
          onDone={handleImportDone}
          onSkip={handleImportSkip}
        />
      )}

      {/* Reimport spec modal */}
      {reimportFolderPath && (
        <ReimportSpecModal
          open={true}
          folderPath={reimportFolderPath}
          onClose={() => setReimportFolderPath(null)}
          onReimport={handleReimport}
        />
      )}

      {/* Upload modal */}
      {uploadFolderPath !== null && (
        <FileUploadModal
          folderPath={uploadFolderPath}
          onUpload={handleUpload}
          onClose={() => setUploadFolderPath(null)}
        />
      )}

      {/* Import from URL modal */}
      {importUrlFolderPath !== null && (
        <ImportFromUrlModal
          folderPath={importUrlFolderPath}
          initialAccessToken={sourceAccessToken}
          onImport={handleImportFromUrl}
          onClose={() => setImportUrlFolderPath(null)}
        />
      )}

      {/* Sync folder modal */}
      {syncFolderPath !== null && (
        <SyncFolderModal
          folderPath={syncFolderPath}
          filesToSync={Object.fromEntries(
            Object.entries(sourcesManifest)
              .filter(([p]) => p.startsWith(syncFolderPath ? syncFolderPath + "/" : ""))
              .map(([p, entry]) => [p, entry.sourceUrl]),
          )}
          initialAccessToken={sourceAccessToken}
          onSync={handleSyncForModal}
          onTokenChange={setSourceAccessToken}
          onComplete={async () => { await loadFiles(); await loadSourcedPaths(); }}
          onClose={() => setSyncFolderPath(null)}
        />
      )}

      {/* Access token prompt */}
      {tokenPrompt && (
        <AccessTokenPrompt
          message={tokenPrompt.message}
          initialToken={sourceAccessToken}
          onSubmit={tokenPrompt.onRetry}
          onClose={() => setTokenPrompt(null)}
        />
      )}
    </Layout>
  );
}
