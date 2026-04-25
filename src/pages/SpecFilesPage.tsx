import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "../components/common/Layout";
import { ResizeHandle } from "../components/common/ResizeHandle";
import { FileTree, buildTree, flattenVisiblePaths, type TreeNode, type FolderNode } from "../components/specfiles/FileTree";
import { MarkdownViewer } from "../components/specfiles/MarkdownViewer";
import { FileUploadModal } from "../components/specfiles/FileUploadModal";
import { ImportFromUrlModal } from "../components/specfiles/ImportFromUrlModal";
import { SyncFolderModal } from "../components/specfiles/SyncFolderModal";
import { FlowIdeasPanel } from "../components/specfiles/FlowIdeasPanel";
import { FlowsPanel, type GeneratedFlow } from "../components/specfiles/FlowsPanel";
import { DetailPanel } from "../components/specfiles/DetailPanel";
import { FlowChatPanel } from "../components/specfiles/FlowChatPanel";
import { SkillsEditor } from "../components/specfiles/SkillsEditor";
import { JsonCodeBlock } from "../components/common/JsonCodeBlock";
import {
  listSpecFiles,
  getSpecFileContent,
  uploadSpecFile,
  deleteSpecFile,
  renameSpecFile,
  generateFlowIdeas,
  importSpecFileFromUrl,
  syncSpecFiles,
  getSourcesManifest,
  updateSourceUrl,
  type SpecFileItem,
  type FlowIdea,
  type FlowIdeasUsage,
  type FlowUsage,
} from "../lib/api/specFilesApi";
import type { SourceEntry } from "../types/spec.types";
import { generateFlowXml } from "../lib/api/flowApi";
import { validateFlowXml } from "../lib/tests/flowXml/validate";
import {
  saveFlowFile,
  deleteFlowFile,
  listFlowFiles,
  FlowFileConflictError,
  parentFolderOf,
  buildFlowFilePath,
  slugifyFlowTitle,
  unlockFlow,
} from "../lib/api/flowFilesApi";
import { useUserStore } from "../store/user.store";
import { buildFlowPrompt, filterRelevantSpecs } from "../lib/flow/buildPrompt";
import { loadFlowsFromQueue } from "../lib/tests/flowXml/loader";
import { activateFlow, activateFlows, getActiveFlows } from "../lib/tests/flowXml/activeTests";
import { buildParsedTagsFromRegistry } from "../lib/tests/buildParsedTags";
import { useSpecStore } from "../store/spec.store";
import { useFlowStatusStore } from "../store/flowStatus.store";
import { useScenarioOrgStore } from "../store/scenarioOrg.store";
import { useAiCostStore } from "../store/aiCost.store";
import { MarkConflictModal } from "../components/specfiles/MarkConflictModal";
import { NewVersionModal } from "../components/specfiles/NewVersionModal";
import { splitSwagger, type SuggestedVariable, type SuggestedConnection, type ProcessingReport } from "../lib/api/specFilesApi";
import { ImportResultModal } from "../components/specfiles/ImportResultModal";
import { useProjectVariablesStore } from "../store/projectVariables.store";
import { useConnectionsStore } from "../store/connections.store";

import { useSetupStore } from "../store/setup.store";
import { detectEndpointFromSpec, type DetectedEndpoint } from "../lib/spec/autoDetectEndpoint";
import {
  getAllIdeas,
  saveIdeas,
  deleteIdeas,
  aggregateForPath,
  migrateFromLocalStorage as migrateIdeasFromLocalStorage,
  type WorkshopMap,
} from "../lib/api/ideasApi";

const MAX_IDEAS_PER_RUN = 5;   // Default max per generation run
const MAX_IDEAS_TOTAL = 30;    // Hard cap to prevent over-engineering

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
          <div className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-2 text-xs text-[#656d76] space-y-1.5">
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
            className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors"
          >
            Retry with token
          </button>
        </div>
      </div>
    </div>
  );
}

export function SpecFilesPage() {
  const aiModel = useSetupStore((s) => s.aiModel);
  const setSpec = useSpecStore((s) => s.setSpec);

  // ── File tree state ────────────────────────────────────────────────────────
  const [files, setFiles] = useState<SpecFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  // Restore the last-viewed file/folder so navigating to Flow Manager and
  // back doesn't lose the user's place in the tree.
  const [selectedPath, setSelectedPath] = useState<string | null>(
    () => localStorage.getItem("specfiles_selected_path") || null
  );
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
    () => localStorage.getItem("specfiles_selected_folder_path") || null
  );
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [viewingContent, setViewingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFolderPath, setUploadFolderPath] = useState<string | null>(null);
  const [importUrlFolderPath, setImportUrlFolderPath] = useState<string | null>(null);
  const [showNewVersionModal, setShowNewVersionModal] = useState(false);
  const [sourcesManifest, setSourcesManifest] = useState<Record<string, SourceEntry>>({});
  const sourcedPaths = useMemo(() => new Set(Object.keys(sourcesManifest)), [sourcesManifest]);

  // Source URL editing state
  const [editingSourceUrl, setEditingSourceUrl] = useState(false);
  const [sourceUrlDraft, setSourceUrlDraft] = useState("");
  // Paths currently being synced (for spinner indicators)
  const [syncingPaths, setSyncingPaths] = useState<Set<string>>(new Set());

  // ── Source access token (persisted in-memory for sync/import) ──────────────
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

  // ── Multi-select state ─────────────────────────────────────────────────────
  const [multiSelectedPaths, setMultiSelectedPaths] = useState<Set<string>>(new Set());
  const lastClickedPathRef = useRef<string | null>(null);

  // ── Multi-context workshop state ──────────────────────────────────────────
  // Loaded from Cosmos DB on mount, saved back per-folder on mutation.
  const [workshopMap, setWorkshopMap] = useState<WorkshopMap>({});
  const workshopLoadedRef = useRef(false);
  const [workshopLoaded, setWorkshopLoaded] = useState(false);

  // Paths (file or folder) that have generated ideas — for tree indicators.
  // For folder-level entries, mark all child .md files so individual file
  // icons turn green even when ideas were generated at the folder level.
  const pathsWithIdeas = useMemo(() => {
    const s = new Set<string>();
    for (const [key, ctx] of Object.entries(workshopMap)) {
      if (ctx.ideas.length > 0) s.add(key);
    }
    return s;
  }, [workshopMap]);

  // Push total workshop cost to global store whenever workshopMap changes
  useEffect(() => {
    let total = 0;
    for (const ctx of Object.values(workshopMap)) {
      if (ctx.usage) total += ctx.usage.costUsd;
      if (ctx.flowsUsage) total += ctx.flowsUsage.costUsd;
    }
    useAiCostStore.getState().setWorkshopCost(parseFloat(total.toFixed(6)));
  }, [workshopMap]);

  // Working set — flat state loaded from workshopMap when navigating
  const [ideas, setIdeas] = useState<FlowIdea[]>([]);
  const [ideasUsage, setIdeasUsage] = useState<FlowIdeasUsage | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasAppending, setIdeasAppending] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasRawText, setIdeasRawText] = useState<string | undefined>();
  const [ideasMessage, setIdeasMessage] = useState<string | null>(null);
  const [ideasExhausted, setIdeasExhausted] = useState(false);
  const [selectedIdeaIds, setSelectedIdeaIds] = useState<Set<string>>(new Set());
  const [chatActive, setChatActive] = useState(false);

  // ── Flow generation state ─────────────────────────────────────────────────
  const [generatedFlows, setGeneratedFlows] = useState<GeneratedFlow[]>([]);
  const [generatingFlows, setGeneratingFlows] = useState(false);
  const [flowsUsage, setFlowsUsage] = useState<FlowUsage | null>(null);
  const [flowProgress, setFlowProgress] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Detail panel state ─────────────────────────────────────────────────────
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);

  // ── Mark-for-implementation state ─────────────────────────────────────────
  const [markedIds, setMarkedIds] = useState<Set<string>>(new Set());
  const [markingIds, setMarkingIds] = useState<Set<string>>(new Set());
  const [selectedFlowIds, setSelectedFlowIds] = useState<Set<string>>(new Set());
  const [thisLevelOnly, setThisLevelOnly] = useState(false);
  const [conflict, setConflict] = useState<{
    flow: GeneratedFlow;
    existingName: string;
    suggestedNewName: string;
  } | null>(null);

  // ── Auto-detected endpoint notification ──────────────────────────────────
  const [specDetection, setSpecDetection] = useState<DetectedEndpoint | null>(null);

  // ── Resizable panel widths ────────────────────────────────────────────────
  const [treeWidth, setTreeWidth] = useState(240);
  // Default: split the area right of the tree into three equal columns
  // (ideas / flows / detail). Detail uses flex-1 so only ideas & flows
  // need an explicit width.
  const [ideasWidth, setIdeasWidth] = useState(() => {
    const available = (typeof window !== "undefined" ? window.innerWidth : 1440) - 240;
    return Math.max(240, Math.floor(available / 3));
  });
  const [flowsWidth, setFlowsWidth] = useState(() => {
    const available = (typeof window !== "undefined" ? window.innerWidth : 1440) - 240;
    return Math.max(240, Math.floor(available / 3));
  });

  // Workshop is visible when aggregated data exists for the current path (or loading/error)
  const activePath = selectedPath ?? selectedFolderPath;
  const showWorkshop = ideas.length > 0 || ideasLoading || ideasAppending || ideasError !== null || ideasMessage !== null;
  const hasIdeas = ideas.length > 0 || ideasLoading || ideasAppending;

  // Load workshop data from API on mount (+ migrate from localStorage if needed)
  useEffect(() => {
    if (workshopLoadedRef.current) return;
    workshopLoadedRef.current = true;
    (async () => {
      try {
        // Skip Cosmos-backed ideas loading if no project is selected yet
        const { hasProject } = await import("../lib/api/projectHeader");
        if (!hasProject()) {
          setWorkshopLoaded(true);
          return;
        }
        await migrateIdeasFromLocalStorage();
        const rawMap = await getAllIdeas();
        // Normalize — ensure arrays are never null/undefined
        const map: WorkshopMap = {};
        for (const [key, ctx] of Object.entries(rawMap)) {
          map[key] = {
            ideas: ctx.ideas ?? [],
            usage: ctx.usage ?? null,
            flowsUsage: ctx.flowsUsage ?? null,
            generatedFlows: (ctx.generatedFlows ?? []) as GeneratedFlow[],
          };
        }
        console.log("[SpecFilesPage] Loaded workshopMap from API:", Object.keys(map).length, "entries",
          Object.entries(map).map(([k, v]) => `${k}: ${v.ideas.length} ideas, ${v.generatedFlows.length} flows`));
        // Clean up orphaned flows — flows whose ideaId doesn't match any idea
        // across the ENTIRE map (ideas may live under a child key while flows
        // are stored at a parent folder key).
        const allIdeaIds = new Set<string>();
        for (const ctx of Object.values(map)) {
          for (const idea of ctx.ideas) allIdeaIds.add(idea.id);
        }
        let cleaned = false;
        for (const [key, ctx] of Object.entries(map)) {
          const orphans = ctx.generatedFlows.filter(f => !allIdeaIds.has(f.ideaId));
          if (orphans.length > 0) {
            console.warn(`[SpecFilesPage] Removing ${orphans.length} orphaned flows from "${key}"`,
              orphans.map(f => f.ideaId));
            ctx.generatedFlows = ctx.generatedFlows.filter(f => allIdeaIds.has(f.ideaId));
            cleaned = true;
          }
        }
        setWorkshopMap(map);
        setWorkshopLoaded(true);
        // Persist cleaned data
        if (cleaned) {
          for (const [folder, ctx] of Object.entries(map)) {
            saveIdeas(folder, ctx).catch(e => console.warn("[SpecFilesPage] Failed to save cleaned ideas:", e));
          }
        }
      } catch (e) {
        console.warn("[SpecFilesPage] Failed to load ideas from API:", e);
        setWorkshopLoaded(true);
      }
    })();
  }, []);

  // Re-populate the working set when workshopMap loads from API and we have
  // an active path. This fixes the flash of "generate ideas" on initial nav
  // from another page (workshopMap starts empty, then fills from the API).
  // IMPORTANT: Skip while flow generation is running — the async loop manages
  // generatedFlows directly via localFlows mirror. Letting this effect fire
  // mid-batch would overwrite pending/generating placeholders with only the
  // done/error entries from workshopMap, causing them to vanish.
  useEffect(() => {
    if (!workshopLoaded || !activePath || generatingFlows) return;
    const agg = aggregateForPath(workshopMap, activePath);
    console.log("[SpecFilesPage] Re-populate working set for", activePath,
      "→", agg.ideas.length, "ideas,", agg.generatedFlows.length, "flows");
    if (agg.ideas.length > 0 || agg.generatedFlows.length > 0) {
      setIdeas(agg.ideas);
      setIdeasUsage(agg.usage);
      setFlowsUsage(agg.flowsUsage);
      setGeneratedFlows(agg.generatedFlows.filter(f => f.status === "done" || f.status === "error"));
    }
  }, [workshopLoaded, workshopMap, activePath, generatingFlows]);

  // Persist workshopMap changes to API (debounced, per-folder diff)
  const prevMapRef = useRef<WorkshopMap>({});
  useEffect(() => {
    const prev = prevMapRef.current;
    // Save changed or new entries
    for (const [folder, data] of Object.entries(workshopMap)) {
      if (data !== prev[folder]) {
        saveIdeas(folder, data).catch(e => console.warn("[SpecFilesPage] Failed to save ideas:", e));
      }
    }
    // Delete entries that were removed from the map
    for (const folder of Object.keys(prev)) {
      if (!(folder in workshopMap)) {
        deleteIdeas(folder).catch(e => console.warn("[SpecFilesPage] Failed to delete ideas:", e));
      }
    }
    prevMapRef.current = workshopMap;
  }, [workshopMap]);

  // Persist tree selection so the view survives navigation away and back
  useEffect(() => {
    if (selectedPath) localStorage.setItem("specfiles_selected_path", selectedPath);
    else localStorage.removeItem("specfiles_selected_path");
  }, [selectedPath]);
  useEffect(() => {
    if (selectedFolderPath) localStorage.setItem("specfiles_selected_folder_path", selectedFolderPath);
    else localStorage.removeItem("specfiles_selected_folder_path");
  }, [selectedFolderPath]);

  // ── Sync marked-for-implementation state ────────────────────────────────────
  // "Marked" means "registered as an active test" — NOT merely "XML file exists
  // on the server". Flow XML files are preserved when tests are deleted (they
  // are reusable assets), so we can't use blob existence as the signal or the
  // user would be stuck unable to re-create a test after deletion.
  //
  // The active-tests set (localStorage-backed) is the authoritative source:
  // activateFlow adds to it, deactivateFlow removes, and the Test Manager
  // updates it directly.
  const syncMarkedFromServer = useCallback(async () => {
    if (generatedFlows.length === 0) {
      setMarkedIds(new Set());
      return;
    }
    const folder = parentFolderOf(activePath);
    try {
      // We still confirm the blob exists — a flow with no XML can't actually
      // be active even if its name lingers in the set.
      const items = await listFlowFiles(folder || undefined);
      const existingPaths = new Set(items.map(i => i.name));
      const activeSet = await getActiveFlows();
      const next = new Set<string>();
      for (const flow of generatedFlows) {
        if (flow.status !== "done") continue;
        const target = buildFlowFilePath(folder, flow.title);
        if (existingPaths.has(target) && activeSet.has(target)) next.add(flow.ideaId);
      }
      setMarkedIds(next);
    } catch {
      // Leave existing markedIds in place on network failure
    }
  }, [activePath, generatedFlows]);

  useEffect(() => { void syncMarkedFromServer(); }, [syncMarkedFromServer]);

  // Re-sync when the window regains focus (covers the case where the user
  // removed a flow in Flow Manager and came back to Spec Manager).
  useEffect(() => {
    const onFocus = () => { void syncMarkedFromServer(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [syncMarkedFromServer]);

  // Persist generated flows + flowsUsage back to workshopMap when flow generation completes
  useEffect(() => {
    if (!generatingFlows && generatedFlows.length > 0 && activePath) {
      const flowsToSave = generatedFlows.filter(f => f.status === "done" || f.status === "error");
      if (flowsToSave.length > 0) {
        // Compute cumulative flow usage from all done flows
        const cumulativeFlowsUsage = flowsToSave.reduce<FlowUsage | null>((acc, f) => {
          if (!f.usage) return acc;
          if (!acc) return { ...f.usage };
          return {
            inputTokens: acc.inputTokens + f.usage.inputTokens,
            outputTokens: acc.outputTokens + f.usage.outputTokens,
            totalTokens: acc.totalTokens + f.usage.totalTokens,
            costUsd: parseFloat((acc.costUsd + f.usage.costUsd).toFixed(6)),
          };
        }, null);
        setWorkshopMap(prev => ({
          ...prev,
          [activePath]: {
            ...(prev[activePath] ?? { ideas: [], usage: null, flowsUsage: null, generatedFlows: [] }),
            generatedFlows: flowsToSave,
            flowsUsage: cumulativeFlowsUsage,
          },
        }));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [generatingFlows]);

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
      // Non-critical — sourced indicators just won't show
    }
  }, []);

  useEffect(() => { void loadFiles(); void loadSourcedPaths(); }, [loadFiles, loadSourcedPaths]);

  // After the file list loads for the first time, rehydrate the restored
  // selection: drop it if the file/folder no longer exists, otherwise
  // pre-load the working set (and content for a file) so the panels appear
  // as the user left them.
  const didRehydrateRef = useRef(false);
  useEffect(() => {
    if (didRehydrateRef.current) return;
    if (loadingFiles) return;
    didRehydrateRef.current = true;

    // Empty project — clear any stale paths from localStorage
    if (files.length === 0) {
      if (selectedPath) setSelectedPath(null);
      if (selectedFolderPath) setSelectedFolderPath(null);
      return;
    }

    if (selectedPath) {
      const stillExists = files.some(f => f.name === selectedPath);
      if (!stillExists) {
        setSelectedPath(null);
        return;
      }
      loadWorkingSet(selectedPath);
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
      if (!stillExists) {
        setSelectedFolderPath(null);
        return;
      }
      loadWorkingSet(selectedFolderPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingFiles, files]);

  // ── Select file ────────────────────────────────────────────────────────────

  /** Load aggregated workshop data into the flat working set for a given path */
  function loadWorkingSet(path: string) {
    const agg = aggregateForPath(workshopMap, path);
    setIdeas(agg.ideas);
    setIdeasUsage(agg.usage);
    setFlowsUsage(agg.flowsUsage);
    setGeneratedFlows(agg.generatedFlows.filter(f => f.status === "done" || f.status === "error"));
    setSelectedIdeaIds(new Set());
    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasMessage(null);
    setIdeasExhausted(false);
    setActiveIdeaId(null);
    setActiveFlowId(null);
  }

  /**
   * Guard: navigation while flow generation is running is unsafe — the async
   * loop keeps writing to generatedFlows state, which loadWorkingSet has just
   * overwritten with the destination path's data. Results end up mixed
   * between paths or lost entirely. Confirm, abort, then proceed.
   */
  function confirmLeaveGeneration(): boolean {
    if (!generatingFlows) return true;
    const ok = window.confirm(
      "Flow generation is still running. Switching now will cancel it and any " +
      "flows not yet completed will be lost.\n\nContinue anyway?",
    );
    if (!ok) return false;
    abortRef.current?.abort();
    return true;
  }

  function handleCancelGeneration() {
    abortRef.current?.abort();
  }

  async function selectFile(path: string) {
    if (!confirmLeaveGeneration()) return;
    setMultiSelectedPaths(new Set());
    setSelectedPath(path);
    setSelectedFolderPath(null);
    const isSystemFile = path.includes("/_system/");
    const isSkills = path.endsWith("/_skills.md") || path.endsWith("/Skills.md");
    setViewingContent(isSkills || isSystemFile); // Auto-open for Skills or any system file
    setEditingSourceUrl(false);
    loadWorkingSet(path);
    // Pre-load content for when user clicks the filename link
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
    if (!confirmLeaveGeneration()) return;
    setMultiSelectedPaths(new Set());
    setSelectedFolderPath(path);
    setSelectedPath(null);
    setViewingContent(false);
    setContent("");
    loadWorkingSet(path);
  }

  // ── Multi-select handlers ────────────────────────────────────────────────

  /** Collect all descendant paths (files + subfolders) under a folder path from the tree. */
  function collectDescendants(folderPath: string, tree: TreeNode[]): string[] {
    const results: string[] = [];
    function walk(nodes: TreeNode[]) {
      for (const n of nodes) {
        results.push(n.path);
        if (n.type === "folder") walk(n.children);
      }
    }
    // Find the target folder node in the tree
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

  /** Check if all descendants of a folder are currently selected. */
  function allDescendantsSelected(folderPath: string, tree: TreeNode[]): boolean {
    const descendants = collectDescendants(folderPath, tree);
    return descendants.length > 0 && descendants.every(p => multiSelectedPaths.has(p));
  }

  function handleMultiSelect(path: string, e: React.MouseEvent) {
    const tree = buildTree(files);
    if (e.shiftKey && lastClickedPathRef.current) {
      // Shift+click: range select
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
            // If range includes a folder, also select all its descendants
            const isFolder = !files.some(f => f.name === p);
            if (isFolder) {
              for (const d of collectDescendants(p, tree)) next.add(d);
            }
          }
          return next;
        });
      }
    } else {
      // Toggle single item — if folder, also toggle all descendants
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
            // Deselect folder + all descendants
            next.delete(path);
            for (const d of descendants) next.delete(d);
          } else {
            // Select folder + all descendants
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

  function handleClearMultiSelect() {
    setMultiSelectedPaths(new Set());
  }

  function handleSelectAll() {
    // Select all visible tree nodes (files + folders) — not raw blob names
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
    // Resolve selected paths to actual blob names to delete
    const allBlobsToDelete = new Set<string>();
    for (const p of multiSelectedPaths) {
      // Check if it's an actual file blob
      if (files.some(f => f.name === p)) {
        allBlobsToDelete.add(p);
      }
      // Also find any blobs under this path (folder expansion)
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

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  async function handleCreateFolder(folderPath: string) {
    console.log("[SpecFilesPage] handleCreateFolder:", folderPath);
    setError(null);
    try {
      await uploadSpecFile(`${folderPath}/.keep`, "");
      // Auto-create _skills.md under _system/ for top-level version folders
      if (!folderPath.includes("/")) {
        const skillsContent = `# API Skills — ${folderPath}\n\nDescribe your API's rules, quirks, and conventions below.\nThese are injected into AI prompts when generating ideas, flows, and edits.\n\n## API Rules\n\n<!-- Add rules here, e.g.:\n- NEVER use PUT — this API uses PATCH for all updates\n- DELETE returns 204 with no body\n-->\n\n## Context Variables\n\nFlow XML uses \`{variable_name}\` in URL paths and \`proj.variableName\` in expressions.\nThese map to project variables defined in Settings → Variables.\n\nDefault mappings for this project:\n- \`{project_id}\` → use \`proj.project_id\`\n- \`{version_id}\` → use \`proj.version_id\`\n- \`{lang_code}\` → use \`proj.lang_code\`\n\nWhen generating flows, always use \`proj.*\` syntax for dynamic values.\nNever hardcode project-specific IDs in flow XML.\n\n## Enum Aliases\n\n\`\`\`\n<!-- name=value, one per line, e.g.:\ndraft=0\npublished=3\nmarkdown=0\nwysiwyg=1\n-->\n\`\`\`\n`;
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
      // Create the folder with .keep + _skills.md (same as handleCreateFolder for root)
      await handleCreateFolder(folderName);

      if (specContent) {
        // Upload spec as _system/_swagger.json
        await uploadSpecFile(`${folderName}/_system/_swagger.json`, specContent, "application/json");
        // Split into per-endpoint .md files
        const result = await splitSwagger(folderName);
        await loadFiles();
        setShowNewVersionModal(false);
        setError(null);
        // Load project variables + connections so modal can check existing names
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
        // Backend fetches URL, saves as _system/_swagger.json, and splits
        const result = await splitSwagger(folderName, { specUrl });
        await loadFiles();
        setShowNewVersionModal(false);
        // Load project variables + connections so modal can check existing names
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
        // Just create the folder (already done above)
        setShowNewVersionModal(false);
      }
    } catch (e) {
      throw e; // Let the modal handle the error display
    }
  }

  async function handleImportDone(selectedVarNames: string[], selectedConnections: SuggestedConnection[]) {
    // Save project variables
    const varStore = useProjectVariablesStore.getState();
    const existing = varStore.variables;
    const existingNames = new Set(existing.map(v => v.name));
    const newVars = selectedVarNames
      .filter(n => !existingNames.has(n))
      .map(n => ({ name: n, value: "" }));
    if (newVars.length > 0) {
      await varStore.save([...existing, ...newVars]);
    }

    // Create draft connections
    const connStore = useConnectionsStore.getState();
    for (const conn of selectedConnections) {
      try {
        await connStore.add({
          name: conn.name,
          provider: conn.provider,
          draft: true,
          ...(conn.authorizationUrl ? { authorizationUrl: conn.authorizationUrl } : {}),
          ...(conn.tokenUrl ? { tokenUrl: conn.tokenUrl } : {}),
          ...(conn.scopes ? { scopes: conn.scopes } : {}),
          ...(conn.authHeaderName ? { authHeaderName: conn.authHeaderName } : {}),
          ...(conn.authQueryParam ? { authQueryParam: conn.authQueryParam } : {}),
        });
      } catch {
        // Connection creation failed — skip silently (user can create manually)
      }
    }

    setImportResult(null);
  }

  function handleImportSkip() {
    setImportResult(null);
  }

  async function handleUpload(name: string, fileContent: string, contentType: string) {
    await uploadSpecFile(name, fileContent, contentType);
    await loadFiles();

    // Try auto-detecting endpoint config from uploaded JSON spec
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
      if (selectedPath === path) {
        setSelectedPath(null);
        setContent("");
      }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteFolder(folderPath: string) {
    setError(null);
    try {
      const toDelete = files.filter((f) => f.name.startsWith(`${folderPath}/`));
      await Promise.all(toDelete.map((f) => deleteSpecFile(f.name)));
      if (selectedPath?.startsWith(`${folderPath}/`)) {
        setSelectedPath(null);
        setContent("");
      }
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
          toRename.map((f) => renameSpecFile(f.name, f.name.replace(oldPath, newPath)))
        );
        if (selectedPath?.startsWith(`${oldPath}/`)) {
          setSelectedPath(selectedPath.replace(oldPath, newPath));
        }
      } else {
        await renameSpecFile(oldPath, newPath);
        if (selectedPath === oldPath) setSelectedPath(newPath);
      }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Import from URL ────────────────────────────────────────────────────────

  async function handleImportFromUrl(url: string, folderPath: string, filename?: string, userAccessToken?: string) {
    // If user provided an explicit access token, persist it for future sync/import
    if (userAccessToken) {
      setSourceAccessToken(userAccessToken);
      await importSpecFileFromUrl(url, folderPath, filename, userAccessToken);
      await loadFiles();
      await loadSourcedPaths();
      // Try auto-detect on imported JSON files
      await tryDetectAfterImport(url, folderPath, filename);
      return;
    }

    // Use stored token if available
    const effectiveToken = sourceAccessToken.trim() || "";

    // Try client-side fetch first — the browser may have session cookies for this URL
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
      } catch {
        // CORS or network error — will fall back to server-side fetch
      }
    }

    await importSpecFileFromUrl(url, folderPath, filename, effectiveToken, clientContent);
    await loadFiles();
    await loadSourcedPaths();

    // Try auto-detect: use clientContent if available, otherwise read back
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

  /** Read back an imported JSON file and try endpoint auto-detection. */
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
    } catch {
      // Not critical — silently skip detection
    }
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
    // Open the sync modal — it handles progress, auth, and retry
    setSyncFolderPath(folderPath);
  }

  /** Called by SyncFolderModal for individual file sync. */
  async function handleSyncForModal(
    folderPath: string,
    filename?: string,
    accessToken?: string,
  ): Promise<{ synced: Array<{ name: string; updated: boolean; error?: string }> }> {
    const token = accessToken || sourceAccessToken.trim() || "";
    return syncSpecFiles(folderPath, filename, token);
  }

  // ── Update source URL ──────────────────────────────────────────────────────

  async function handleSaveSourceUrl(filePath: string, newUrl: string) {
    try {
      await updateSourceUrl(filePath, newUrl);
      setEditingSourceUrl(false);
      await loadSourcedPaths();
    } catch (e) {
      alert(`Failed to update source URL: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Generate flow ideas (AI) ──────────────────────────────────────────────

  async function handleGenerateFlowIdeas(contextPath: string, maxCount?: number, filePaths?: string[]) {
    // contextPath can be a folder path or a file path (.md)
    if (contextPath.endsWith(".md")) {
      setSelectedPath(contextPath);
      setSelectedFolderPath(null);
    } else {
      setSelectedFolderPath(contextPath);
      setSelectedPath(null);
    }
    setViewingContent(false);

    // Collect existing idea titles so the AI generates different ones
    const existing = aggregateForPath(workshopMap, contextPath);
    const existingTitles = existing.ideas.map(i => i.title);

    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasMessage(null);
    setIdeasExhausted(false);
    if (existing.ideas.length > 0) {
      // Keep existing ideas visible while generating new ones
      setIdeas(existing.ideas);
      setIdeasUsage(existing.usage);
      setFlowsUsage(existing.flowsUsage);
      setGeneratedFlows(existing.generatedFlows.filter(f => f.status === "done" || f.status === "error"));
      setIdeasAppending(true);
    } else {
      setIdeas([]);
      setIdeasUsage(null);
      setFlowsUsage(null);
      setGeneratedFlows([]);
      setSelectedIdeaIds(new Set());
      setActiveIdeaId(null);
      setActiveFlowId(null);
      setIdeasLoading(true);
    }
    try {
      const result = await generateFlowIdeas(contextPath, existingTitles, undefined, aiModel, maxCount ?? MAX_IDEAS_PER_RUN, filePaths);
      const perIdeaCost = result.usage && result.ideas.length > 0
        ? parseFloat((result.usage.costUsd / result.ideas.length).toFixed(6))
        : undefined;
      const now = new Date().toISOString();
      const base = Date.now();
      const newIdeas = result.ideas.map((idea, i) => ({
        ...idea,
        id: `idea-${base}-${i}`,
        costUsd: perIdeaCost,
        createdAt: now,
      }));
      // Save to workshopMap under this context
      if (newIdeas.length > 0) {
        setWorkshopMap(prev => {
          const prevCtx = prev[contextPath];
          const mergedIdeas = [...(prevCtx?.ideas ?? []), ...newIdeas];
          const mergedUsage = result.usage && prevCtx?.usage
            ? {
                inputTokens: prevCtx.usage.inputTokens + result.usage.inputTokens,
                outputTokens: prevCtx.usage.outputTokens + result.usage.outputTokens,
                totalTokens: prevCtx.usage.totalTokens + result.usage.totalTokens,
                costUsd: parseFloat((prevCtx.usage.costUsd + result.usage.costUsd).toFixed(6)),
                filesAnalyzed: result.usage.filesAnalyzed,
                totalSpecCharacters: result.usage.totalSpecCharacters,
              }
            : result.usage;
          return {
            ...prev,
            [contextPath]: {
              ideas: mergedIdeas,
              usage: mergedUsage,
              flowsUsage: prevCtx?.flowsUsage ?? null,
              generatedFlows: prevCtx?.generatedFlows ?? [],
            },
          };
        });
      }
      // Update flat working set — merge with existing ideas from aggregate
      const allIdeas = [...existing.ideas, ...newIdeas];
      setIdeas(allIdeas);
      const mergedUsage = result.usage && existing.usage
        ? {
            inputTokens: existing.usage.inputTokens + result.usage.inputTokens,
            outputTokens: existing.usage.outputTokens + result.usage.outputTokens,
            totalTokens: existing.usage.totalTokens + result.usage.totalTokens,
            costUsd: parseFloat((existing.usage.costUsd + result.usage.costUsd).toFixed(6)),
            filesAnalyzed: result.usage.filesAnalyzed,
            totalSpecCharacters: result.usage.totalSpecCharacters,
          }
        : result.usage;
      setIdeasUsage(mergedUsage);
      // Mark exhausted if AI returned fewer than requested
      const requested = maxCount ?? MAX_IDEAS_PER_RUN;
      if (newIdeas.length < requested) {
        setIdeasExhausted(true);
      }
      if (result.parseError && result.rawText) {
        setIdeasRawText(result.rawText);
      }
      // Show message when API returns 0 ideas
      if (newIdeas.length === 0) {
        setIdeasMessage(result.message || "AI could not generate any test flow ideas for this specification. The file may be too short or not contain enough API detail.");
      }
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[SpecFiles] generateFlowIdeas failed", e);
      setIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasLoading(false);
      setIdeasAppending(false);
    }
  }

  async function handleGenerateMoreIdeas(count?: number) {
    const currentPath = activePath;
    if (!currentPath) return;
    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasAppending(true);
    // Exclude ALL visible idea titles (including from child contexts)
    const existingTitles = ideas.map((i) => i.title);
    try {
      const result = await generateFlowIdeas(currentPath, existingTitles, undefined, aiModel, count);
      if (result.ideas.length > 0) {
        const perIdeaCost = result.usage && result.ideas.length > 0
          ? parseFloat((result.usage.costUsd / result.ideas.length).toFixed(6))
          : undefined;
        const now = new Date().toISOString();
        const base = Date.now();
        const newIdeas = result.ideas.map((idea, i) => ({
          ...idea,
          id: `idea-${base}-${i}`,
          costUsd: perIdeaCost,
          createdAt: now,
        }));
        // Save to workshopMap under this exact context
        setWorkshopMap(prev => {
          const existing = prev[currentPath] ?? { ideas: [], usage: null, flowsUsage: null, generatedFlows: [] };
          const mergedUsage = result.usage
            ? existing.usage
              ? {
                  inputTokens: existing.usage.inputTokens + result.usage.inputTokens,
                  outputTokens: existing.usage.outputTokens + result.usage.outputTokens,
                  totalTokens: existing.usage.totalTokens + result.usage.totalTokens,
                  costUsd: parseFloat((existing.usage.costUsd + result.usage.costUsd).toFixed(6)),
                  filesAnalyzed: result.usage.filesAnalyzed,
                  totalSpecCharacters: result.usage.totalSpecCharacters,
                }
              : result.usage
            : existing.usage;
          return {
            ...prev,
            [currentPath]: {
              ...existing,
              ideas: [...existing.ideas, ...newIdeas],
              usage: mergedUsage,
            },
          };
        });
        // Update flat working set
        setIdeas((prev) => [...prev, ...newIdeas]);
      }
      if (result.usage) {
        setIdeasUsage((prev) => prev ? {
          inputTokens: prev.inputTokens + result.usage.inputTokens,
          outputTokens: prev.outputTokens + result.usage.outputTokens,
          totalTokens: prev.totalTokens + result.usage.totalTokens,
          costUsd: parseFloat((prev.costUsd + result.usage.costUsd).toFixed(6)),
          filesAnalyzed: result.usage.filesAnalyzed,
          totalSpecCharacters: result.usage.totalSpecCharacters,
        } : result.usage);
      }
      // Mark exhausted if AI returned fewer than requested
      const requested = count ?? MAX_IDEAS_PER_RUN;
      if (result.ideas.length < requested) {
        setIdeasExhausted(true);
      }
      if (result.parseError && result.rawText) {
        setIdeasRawText(result.rawText);
      }
    } catch (e) {
      setIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasAppending(false);
    }
  }

  // ── Idea/flow locking — ideas with completed flows are locked ────────────

  const completedFlowIdeaIds = new Set(
    generatedFlows.filter(f => f.status === "done").map(f => f.ideaId)
  );

  // ── Idea selection ──────────────────────────────────────────────────────

  function toggleIdeaSelect(id: string) {
    setSelectedIdeaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllIdeas() {
    setSelectedIdeaIds(new Set(ideas.map(i => i.id)));
  }

  function deselectAllIdeas() {
    setSelectedIdeaIds(new Set());
  }

  function handleDeleteSelectedIdeas(ids: Set<string>) {
    if (ids.size === 0) return;

    // Remove ideas from flat working set
    setIdeas(prev => prev.filter(i => !ids.has(i.id)));
    // Remove corresponding flows
    setGeneratedFlows(prev => prev.filter(f => !ids.has(f.ideaId)));
    // Clear selection
    setSelectedIdeaIds(new Set());
    // Clear detail panel if showing a deleted item
    if (activeIdeaId && ids.has(activeIdeaId)) setActiveIdeaId(null);
    if (activeFlowId && ids.has(activeFlowId)) setActiveFlowId(null);

    // Remove from workshopMap (persist to localStorage)
    setWorkshopMap(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const ctx = next[key];
        const hadIdeas = ctx.ideas.some(i => ids.has(i.id));
        if (hadIdeas) {
          const remainingIdeas = ctx.ideas.filter(i => !ids.has(i.id));
          const remainingFlows = ctx.generatedFlows.filter(f => !ids.has(f.ideaId));
          if (remainingIdeas.length === 0 && remainingFlows.length === 0) {
            // Remove context entirely if empty
            delete next[key];
          } else {
            next[key] = { ...ctx, ideas: remainingIdeas, generatedFlows: remainingFlows };
          }
        }
      }
      return next;
    });

    // Reset exhausted flag — deletion opens room for more ideas
    setIdeasExhausted(false);
  }

  // ── Detail panel click handlers ───────────────────────────────────────────

  const flowIdeaIds = new Set(
    generatedFlows.filter(f => f.status === "done" || f.status === "error").map(f => f.ideaId)
  );

  function handleClickIdea(id: string) {
    // If this idea has a completed or errored flow, show the flow view (so errors are visible)
    if (flowIdeaIds.has(id)) {
      setActiveFlowId(id);
      setActiveIdeaId(null);
    } else {
      setActiveIdeaId(id);
      setActiveFlowId(null);
    }
  }

  function handleDeleteFlow(ideaId: string) {
    // Prevent deletion of flows that have active tests
    if (markedIds.has(ideaId)) return;

    // Clean up orphaned Cosmos doc (best-effort, fire-and-forget)
    const flow = generatedFlows.find(f => f.ideaId === ideaId);
    if (flow?.status === "done" && flow.title) {
      const folder = parentFolderOf(activePath);
      const blobName = buildFlowFilePath(folder, flow.title);
      void deleteFlowFile(blobName).catch(() => { /* orphan already gone or never saved */ });
    }

    setGeneratedFlows(prev => prev.filter(f => f.ideaId !== ideaId));
    if (activeFlowId === ideaId) setActiveFlowId(null);
    // Remove from workshopMap
    setWorkshopMap(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const ctx = next[key];
        const had = ctx.generatedFlows.some(f => f.ideaId === ideaId);
        if (had) {
          const remaining = ctx.generatedFlows.filter(f => f.ideaId !== ideaId);
          // Recompute flowsUsage from remaining done flows
          const recomputed = remaining.reduce<FlowUsage | null>((acc, f) => {
            if (!f.usage || f.status !== "done") return acc;
            if (!acc) return { ...f.usage };
            return {
              inputTokens: acc.inputTokens + f.usage.inputTokens,
              outputTokens: acc.outputTokens + f.usage.outputTokens,
              totalTokens: acc.totalTokens + f.usage.totalTokens,
              costUsd: parseFloat((acc.costUsd + f.usage.costUsd).toFixed(6)),
            };
          }, null);
          next[key] = { ...ctx, generatedFlows: remaining, flowsUsage: recomputed };
        }
      }
      return next;
    });
    // Recompute flat flowsUsage
    setFlowsUsage(() => {
      const remaining = generatedFlows.filter(f => f.ideaId !== ideaId && f.status === "done");
      return remaining.reduce<FlowUsage | null>((acc, f) => {
        if (!f.usage) return acc;
        if (!acc) return { ...f.usage };
        return {
          inputTokens: acc.inputTokens + f.usage.inputTokens,
          outputTokens: acc.outputTokens + f.usage.outputTokens,
          totalTokens: acc.totalTokens + f.usage.totalTokens,
          costUsd: parseFloat((acc.costUsd + f.usage.costUsd).toFixed(6)),
        };
      }, null);
    });
  }

  function handleDeleteAllFlows() {
    // Keep flows that have active tests (markedIds) — they can't be deleted
    const keep = generatedFlows.filter(f => markedIds.has(f.ideaId));

    // Clean up orphaned Cosmos docs for all deleted flows (best-effort)
    const folder = parentFolderOf(activePath);
    for (const f of generatedFlows) {
      if (!markedIds.has(f.ideaId) && f.status === "done" && f.title) {
        const blobName = buildFlowFilePath(folder, f.title);
        void deleteFlowFile(blobName).catch(() => { /* orphan already gone or never saved */ });
      }
    }

    setGeneratedFlows(keep);
    if (activeFlowId && !markedIds.has(activeFlowId)) setActiveFlowId(null);
    // Recompute usage from remaining
    const keepUsage = keep.reduce<FlowUsage | null>((acc, f) => {
      if (!f.usage || f.status !== "done") return acc;
      if (!acc) return { ...f.usage };
      return {
        inputTokens: acc.inputTokens + f.usage.inputTokens,
        outputTokens: acc.outputTokens + f.usage.outputTokens,
        totalTokens: acc.totalTokens + f.usage.totalTokens,
        costUsd: parseFloat((acc.costUsd + f.usage.costUsd).toFixed(6)),
      };
    }, null);
    setFlowsUsage(keepUsage);
    // Remove non-marked flows from workshopMap
    setWorkshopMap(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const ctx = next[key];
        if (ctx.generatedFlows.length > 0) {
          const remaining = ctx.generatedFlows.filter(f => markedIds.has(f.ideaId));
          const recomputed = remaining.reduce<FlowUsage | null>((acc, f) => {
            if (!f.usage || f.status !== "done") return acc;
            if (!acc) return { ...f.usage };
            return {
              inputTokens: acc.inputTokens + f.usage.inputTokens,
              outputTokens: acc.outputTokens + f.usage.outputTokens,
              totalTokens: acc.totalTokens + f.usage.totalTokens,
              costUsd: parseFloat((acc.costUsd + f.usage.costUsd).toFixed(6)),
            };
          }, null);
          next[key] = { ...ctx, generatedFlows: remaining, flowsUsage: recomputed };
        }
      }
      return next;
    });
  }

  function handleClickFlow(ideaId: string) {
    setActiveFlowId(ideaId);
    setActiveIdeaId(null);
  }

  // ── Download helpers ──────────────────────────────────────────────────────

  function downloadFlow(flow: GeneratedFlow) {
    const idea = ideas.find((i) => i.id === flow.ideaId);
    const filename = (idea?.title ?? flow.ideaId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80 - ".flow.xml".length) + ".flow.xml";
    const blob = new Blob([flow.xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllFlows() {
    for (const f of generatedFlows.filter((f) => f.status === "done")) {
      downloadFlow(f);
    }
  }

  // ── Update flow XML (manual or AI edit) ──────────────────────────────────

  function handleUpdateFlowXml(ideaId: string, newXml: string) {
    setGeneratedFlows((prev) =>
      prev.map((f) => (f.ideaId === ideaId ? { ...f, xml: newXml } : f))
    );
    // Persist to workshopMap
    if (activePath) {
      const updated = generatedFlows.map((f) =>
        f.ideaId === ideaId ? { ...f, xml: newXml } : f
      );
      persistFlowsForPath(activePath, updated);
    }
  }

  // ── Generate flows from selected ideas ────────────────────────────────────

  function handleGenerateFlowForIdea(ideaId: string) {
    setSelectedIdeaIds(new Set([ideaId]));
    // Defer to next tick so state update is picked up by handleGenerateFlows
    setTimeout(() => void handleGenerateFlows(new Set([ideaId])), 0);
  }

  /**
   * Write completed flows straight to workshopMap for a specific path, so we
   * never lose progress mid-batch. Called after each flow completes.
   */
  function persistFlowsForPath(path: string, flows: GeneratedFlow[]) {
    const flowsToSave = flows.filter((f) => f.status === "done" || f.status === "error");
    if (flowsToSave.length === 0) return;
    console.log("[SpecFilesPage] persistFlowsForPath:", path, flowsToSave.length, "flows",
      flowsToSave.map(f => `${f.ideaId}:${f.status}`));
    const cumulativeFlowsUsage = flowsToSave.reduce<FlowUsage | null>((acc, f) => {
      if (!f.usage) return acc;
      if (!acc) return { ...f.usage };
      return {
        inputTokens: acc.inputTokens + f.usage.inputTokens,
        outputTokens: acc.outputTokens + f.usage.outputTokens,
        totalTokens: acc.totalTokens + f.usage.totalTokens,
        costUsd: parseFloat((acc.costUsd + f.usage.costUsd).toFixed(6)),
      };
    }, null);
    setWorkshopMap((prev) => ({
      ...prev,
      [path]: {
        ...(prev[path] ?? { ideas: [], usage: null, flowsUsage: null, generatedFlows: [] }),
        generatedFlows: flowsToSave,
        flowsUsage: cumulativeFlowsUsage,
      },
    }));
  }

  async function handleGenerateFlows(overrideIds?: Set<string>) {
    // Guard against React event objects being passed as overrideIds (e.g. from onClick)
    const idsToUse = overrideIds instanceof Set ? overrideIds : selectedIdeaIds;
    if (idsToUse.size === 0 || !activePath) return;
    // Capture the path at generation start — if the user navigates away mid-batch
    // we still persist completed flows into this originating path's workshop.
    const generationPath = activePath;

    // Filter out ideas that already have completed flows — don't waste resources
    const selectedIdeas = ideas.filter(
      (i) => idsToUse.has(i.id) && !completedFlowIdeaIds.has(i.id)
    );
    if (selectedIdeas.length === 0) return;

    // Get spec file names for context — the primary set comes from the active
    // folder, but we also include the full version folder so that prerequisite
    // endpoint specs (e.g. categories when generating article flows) can be
    // found by filterRelevantSpecs.
    const allMdFiles = files.filter((f) => f.name.endsWith(".md")).map((f) => f.name);
    let specFileNames: string[];
    if (activePath.endsWith(".md")) {
      specFileNames = allMdFiles;
    } else {
      // Use all .md files under the version root (e.g. V3/) so dependency
      // specs from sibling folders are available for prerequisite steps.
      const versionRoot = activePath.split("/")[0];
      const versionPrefix = versionRoot ? `${versionRoot}/` : "";
      specFileNames = versionPrefix
        ? allMdFiles.filter((f) => f.startsWith(versionPrefix))
        : allMdFiles;
    }

    // Preserve existing completed flows, add pending entries for new ones
    const newPending: GeneratedFlow[] = selectedIdeas.map((idea) => ({
      ideaId: idea.id,
      title: idea.title,
      status: "pending" as const,
      xml: "",
    }));
    const existingCompleted = generatedFlows.filter(f => f.status === "done" || f.status === "error");

    // Local mirror of flow state — we maintain this alongside React state so we
    // always have the latest snapshot available for persistence without relying
    // on state updater timing.
    let localFlows: GeneratedFlow[] = [...existingCompleted, ...newPending];
    setGeneratedFlows(localFlows);
    setGeneratingFlows(true);
    setFlowProgress({ current: 0, total: selectedIdeas.length });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    console.log(`[FlowGen] Starting batch: ${selectedIdeas.length} ideas`, selectedIdeas.map(i => i.id));

    try {
      for (let i = 0; i < selectedIdeas.length; i++) {
        if (ctrl.signal.aborted) {
          console.warn(`[FlowGen] Aborted before idea ${i + 1}/${selectedIdeas.length}`);
          break;
        }

        const idea = selectedIdeas[i];
        console.log(`[FlowGen] Processing idea ${i + 1}/${selectedIdeas.length}: ${idea.id} — "${idea.title}"`);

        localFlows = localFlows.map((f) =>
          f.ideaId === idea.id ? { ...f, status: "generating" as const } : f
        );
        setGeneratedFlows(localFlows);
        // Auto-select the currently generating flow in the detail panel
        setActiveFlowId(idea.id);
        setActiveIdeaId(null);

        try {
          const prompt = buildFlowPrompt(idea);
          const relevantSpecs = filterRelevantSpecs(idea, specFileNames);
          console.log(`[FlowGen] Calling API for "${idea.title}" with ${relevantSpecs.length} spec files:`, relevantSpecs, `(from ${specFileNames.length} total:`, specFileNames, `)`);
          const result = await generateFlowXml(prompt, relevantSpecs, aiModel, ctrl.signal);
          console.log(`[FlowGen] Success for "${idea.title}" — ${result.xml.length} chars`);

          localFlows = localFlows.map((f) =>
            f.ideaId === idea.id
              ? { ...f, status: "done" as const, xml: result.xml, usage: result.usage, createdAt: new Date().toISOString() }
              : f
          );
          setGeneratedFlows(localFlows);
          persistFlowsForPath(generationPath, localFlows);

          // Auto-select the newly generated flow
          setSelectedFlowIds((prev) => { const n = new Set(prev); n.add(idea.id); return n; });
          // Accumulate flow usage
          if (result.usage) {
            setFlowsUsage(prev => prev ? {
              inputTokens: prev.inputTokens + result.usage!.inputTokens,
              outputTokens: prev.outputTokens + result.usage!.outputTokens,
              totalTokens: prev.totalTokens + result.usage!.totalTokens,
              costUsd: parseFloat((prev.costUsd + result.usage!.costUsd).toFixed(6)),
            } : result.usage!);
          }
        } catch (e) {
          const errMsg = e instanceof Error ? e.message : String(e);
          console.error(`[FlowGen] Error for idea ${i + 1} "${idea.title}":`, errMsg);
          if (ctrl.signal.aborted) {
            console.warn("[FlowGen] Signal was aborted — stopping batch");
            break;
          }
          localFlows = localFlows.map((f) =>
            f.ideaId === idea.id
              ? { ...f, status: "error" as const, error: errMsg }
              : f
          );
          setGeneratedFlows(localFlows);
          persistFlowsForPath(generationPath, localFlows);
          // Auto-open the errored flow so the user sees the error message
          setActiveFlowId(idea.id);
          setActiveIdeaId(null);
          // Continue to next idea — don't stop the batch on individual failures
        }

        setFlowProgress({ current: i + 1, total: selectedIdeas.length });
        console.log(`[FlowGen] Progress: ${i + 1}/${selectedIdeas.length} complete`);
      }
    } finally {
      console.log("[FlowGen] Batch complete — cleaning up");
      // Clean up any flows still stuck in "pending" or "generating" state
      localFlows = localFlows.map((f) =>
        f.status === "pending" || f.status === "generating"
          ? { ...f, status: "error" as const, error: "Generation interrupted" }
          : f
      );
      setGeneratedFlows(localFlows);
      persistFlowsForPath(generationPath, localFlows);
      setGeneratingFlows(false);
      abortRef.current = null;
      console.log("[FlowGen] Final state:", localFlows.map(f => `${f.ideaId}: ${f.status}`));
    }
  }



  // ── Spec files for current context (used by flow chat) ────────────────────

  const contextSpecFiles = useMemo(() => {
    if (!activePath) return [];
    if (activePath.endsWith(".md")) return [activePath];
    const prefix = activePath.endsWith("/") ? activePath : `${activePath}/`;
    return files
      .filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md"))
      .map((f) => f.name)
      .slice(0, 5);
  }, [activePath, files]);

  // ── Handle flow generated from chat panel ─────────────────────────────────

  function handleChatFlowGenerated(title: string, xml: string, usage: FlowUsage | null) {
    const chatId = `chat-${Date.now()}`;
    const newFlow: GeneratedFlow = {
      ideaId: chatId,
      title,
      status: "done",
      xml,
      usage,
      createdAt: new Date().toISOString(),
    };
    setGeneratedFlows((prev) => [...prev, newFlow]);
    setActiveFlowId(chatId);
    setActiveIdeaId(null);

    // Persist to workshopMap
    if (activePath) {
      persistFlowsForPath(activePath, [...generatedFlows, newFlow]);
    }

    // Accumulate flow usage
    if (usage) {
      setFlowsUsage(prev => prev ? {
        inputTokens: prev.inputTokens + usage.inputTokens,
        outputTokens: prev.outputTokens + usage.outputTokens,
        totalTokens: prev.totalTokens + usage.totalTokens,
        costUsd: parseFloat((prev.costUsd + usage.costUsd).toFixed(6)),
      } : usage);
    }
  }

  // ── Create tests — save flow XML to blob and register as runnable tests ──

  async function markFlow(flow: GeneratedFlow, targetName: string, overwrite: boolean) {
    setMarkingIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
    try {
      await saveFlowFile(targetName, flow.xml, overwrite);
      // Mark this flow as an active test so the loader picks it up
      await activateFlow(targetName);
      useScenarioOrgStore.getState().placeNewScenarios([targetName]);
      setMarkedIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
      // Immediately register the saved flow as runnable tests and rebuild
      // the Test Manager's tag list so new tests appear without a refresh.
      await loadFlowsFromQueue();
      const built = buildParsedTagsFromRegistry();
      setSpec(null as never, built, null as never);
    } catch (e) {
      if (e instanceof FlowFileConflictError) {
        // Suggest `<slug>-2.flow.xml`, `-3.flow.xml`, etc. when collisions occur
        const folder = parentFolderOf(activePath);
        const slug = slugifyFlowTitle(flow.title);
        const maxBase = 80 - ".flow.xml".length;
        let n = 2;
        let suggestedBase = `${slug}-${n}`.slice(0, maxBase);
        let suggested = folder ? `${folder}/${suggestedBase}.flow.xml` : `${suggestedBase}.flow.xml`;
        // Not perfect (no server-side re-check) but good enough UX — user can edit freely
        while (suggested === targetName && n < 99) {
          n += 1;
          suggestedBase = `${slug}-${n}`.slice(0, maxBase);
          suggested = folder ? `${folder}/${suggestedBase}.flow.xml` : `${suggestedBase}.flow.xml`;
        }
        setConflict({ flow, existingName: targetName, suggestedNewName: suggested });
      } else {
        console.error("Failed to mark flow for implementation:", e);
      }
    } finally {
      setMarkingIds(prev => { const n = new Set(prev); n.delete(flow.ideaId); return n; });
    }
  }

  function handleMarkForImplementation(flow: GeneratedFlow) {
    // Defensive: UI already blocks this, but don't let an invalid flow slip into the queue.
    if (!validateFlowXml(flow.xml).ok) return;
    if (!activePath && flow.ideaId.startsWith("manual-")) {
      // manual flow with no active path — drop at root
    }
    const folder = parentFolderOf(activePath);
    const target = buildFlowFilePath(folder, flow.title);
    void markFlow(flow, target, true);
  }

  async function handleMarkSelectedForImplementation() {
    const folder = parentFolderOf(activePath);
    const toMark = generatedFlows.filter(
      (f) =>
        f.status === "done" &&
        selectedFlowIds.has(f.ideaId) &&
        !markedIds.has(f.ideaId) &&
        validateFlowXml(f.xml).ok,
    );
    if (toMark.length === 0) return;

    // Mark all as "in progress" up-front so the UI reflects the batch.
    setMarkingIds(prev => {
      const n = new Set(prev);
      for (const f of toMark) n.add(f.ideaId);
      return n;
    });

    const jobs = toMark.map((flow) => ({
      flow,
      target: buildFlowFilePath(folder, flow.title),
    }));

    // Save all flows in parallel but DON'T trigger per-flow loads — that
    // creates a race where the first load's listFlowFiles snapshot misses
    // flows that are still saving, and their registrations get discarded
    // when the shared in-flight promise resolves.
    const results = await Promise.allSettled(
      jobs.map((j) => saveFlowFile(j.target, j.flow.xml, true)),
    );

    let firstConflict: { flow: GeneratedFlow; existingName: string; suggestedNewName: string } | null = null;
    const succeededIds: string[] = [];
    const toActivate: string[] = [];

    for (let i = 0; i < jobs.length; i += 1) {
      const { flow, target } = jobs[i];
      const result = results[i];
      if (result.status === "fulfilled") {
        toActivate.push(target);
        succeededIds.push(flow.ideaId);
      } else if (result.reason instanceof FlowFileConflictError) {
        // Only surface the first conflict — the user will resolve it through
        // the modal and can retry the remaining items.
        if (!firstConflict) {
          const slug = slugifyFlowTitle(flow.title);
          const maxBase = 80 - ".flow.xml".length;
          let n = 2;
          let suggestedBase = `${slug}-${n}`.slice(0, maxBase);
          let suggested = folder ? `${folder}/${suggestedBase}.flow.xml` : `${suggestedBase}.flow.xml`;
          while (suggested === target && n < 99) {
            n += 1;
            suggestedBase = `${slug}-${n}`.slice(0, maxBase);
            suggested = folder ? `${folder}/${suggestedBase}.flow.xml` : `${suggestedBase}.flow.xml`;
          }
          firstConflict = { flow, existingName: target, suggestedNewName: suggested };
        }
      } else {
        console.error("Failed to mark flow for implementation:", result.reason);
      }
    }

    // Batch-activate all succeeded flows in a single API call
    if (toActivate.length > 0) {
      await activateFlows(toActivate);
      useScenarioOrgStore.getState().placeNewScenarios(toActivate);
    }

    // Mark succeeded flows and clear "in progress" state in one go.
    setMarkedIds(prev => {
      const n = new Set(prev);
      for (const id of succeededIds) n.add(id);
      return n;
    });
    setMarkingIds(prev => {
      const n = new Set(prev);
      for (const f of toMark) n.delete(f.ideaId);
      return n;
    });

    // Now that every blob is on disk and every name is in the active set,
    // do exactly ONE load + rebuild so all new tests appear together.
    if (succeededIds.length > 0) {
      await loadFlowsFromQueue();
      const built = buildParsedTagsFromRegistry();
      setSpec(null as never, built, null as never);
    }

    if (firstConflict) setConflict(firstConflict);
  }

  function toggleSelectFlow(ideaId: string) {
    setSelectedFlowIds(prev => {
      const n = new Set(prev);
      if (n.has(ideaId)) n.delete(ideaId); else n.add(ideaId);
      return n;
    });
  }

  function selectAllFlows() {
    setSelectedFlowIds(new Set(generatedFlows.filter(f => f.status === "done").map(f => f.ideaId)));
  }

  function deselectAllFlows() {
    setSelectedFlowIds(new Set());
  }

  function handleConflictResolve(resolution: import("../components/specfiles/MarkConflictModal").ConflictResolution) {
    if (!conflict) return;
    const { flow, existingName } = conflict;
    setConflict(null);
    if (resolution.kind === "keep") {
      // User kept existing — treat this as "marked"
      setMarkedIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
      return;
    }
    if (resolution.kind === "overwrite") {
      void markFlow(flow, existingName, true);
      return;
    }
    // rename
    void markFlow(flow, resolution.newName, false);
  }

  // ── Derived detail data ───────────────────────────────────────────────────

  const selectedIdea = activeIdeaId ? ideas.find((i) => i.id === activeIdeaId) ?? null : null;
  const selectedFlow = activeFlowId ? generatedFlows.find((f) => f.ideaId === activeFlowId) ?? null : null;

  // ── Lock status for the selected flow ──────────────────────────────────
  const flowStatusByName = useFlowStatusStore((s) => s.byName);
  const canUnlockFlow = useUserStore((s) => s.hasRole("qa_manager"));
  const selectedFlowLock = useMemo(() => {
    if (!selectedFlow || selectedFlow.status !== "done") return null;
    const folder = parentFolderOf(activePath);
    const target = buildFlowFilePath(folder, selectedFlow.title);
    const entry = flowStatusByName[target];
    return entry?.lockedBy ? { lockedBy: entry.lockedBy, lockedAt: entry.lockedAt, filePath: target } : null;
  }, [selectedFlow, activePath, flowStatusByName]);

  async function handleUnlockSelectedFlow() {
    if (!selectedFlowLock) return;
    try {
      await unlockFlow(selectedFlowLock.filePath);
      const store = useFlowStatusStore.getState();
      const entry = store.byName[selectedFlowLock.filePath];
      if (entry) store.setEntry({ ...entry, lockedBy: undefined, lockedAt: undefined });
    } catch (err) {
      alert(`Failed to unlock: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // ── Derived header info ──────────────────────────────────────────────────

  const isFileContext = !!selectedPath;
  const hasSelection = !!activePath;

  // Project-wide: any .md spec files at all?
  const projectHasSpecFiles = files.some(f => f.name.endsWith(".md"));

  // Count .md spec files under the active folder (recursive)
  const folderMdCount = (!isFileContext && activePath)
    ? (() => {
        const prefix = activePath.endsWith("/") ? activePath : `${activePath}/`;
        return files.filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md")).length;
      })()
    : 0;

  // True when the active context has no spec files to work with
  const noSpecFiles = !projectHasSpecFiles
    || (isFileContext ? !files.some(f => f.name === selectedPath) : folderMdCount === 0);
  const noSpecFilesTooltip = !projectHasSpecFiles
    ? "Upload spec files (.md) to your project first"
    : "No spec files (.md) in this folder";

  // Multi-select: count of selected .md files
  const multiSelectedMdPaths = useMemo(() =>
    [...multiSelectedPaths].filter(p => p.endsWith(".md")),
    [multiSelectedPaths],
  );

  // For file context: split path into parent + filename (without extension)
  const fileDisplayName = isFileContext && selectedPath
    ? selectedPath.replace(/\.md$/i, "").split("/").pop() ?? ""
    : "";
  const fileParentPath = isFileContext && selectedPath
    ? selectedPath.replace(/\.md$/i, "").split("/").slice(0, -1).join("/")
    : "";

  // Spec file count for folder context
  const specFileCount = selectedFolderPath
    ? files.filter((f) => f.name.startsWith(`${selectedFolderPath}/`) && f.name.endsWith(".md")).length
    : 0;

  // Filter ideas when "this level only" is active — show only ideas stored
  // directly under the current path, not aggregated from sub-paths.
  const thisLevelIdeas = (!isFileContext && activePath && thisLevelOnly)
    ? workshopMap[activePath]?.ideas ?? []
    : ideas;
  // Show the toggle only when there are sub-level ideas (i.e. aggregated > this level)
  const hasSubLevelIdeas = !isFileContext && activePath
    && (workshopMap[activePath]?.ideas.length ?? 0) < ideas.length;

  // Filter flows the same way — "this level only" shows only this folder's flows.
  // During active generation, always show the full generatedFlows (includes pending/generating placeholders).
  const thisLevelFlows = (!isFileContext && activePath && thisLevelOnly && !generatingFlows)
    ? (workshopMap[activePath]?.generatedFlows ?? []).filter(f => f.status === "done" || f.status === "error")
    : generatedFlows;
  const hasSubLevelFlows = !isFileContext && activePath
    && ((workshopMap[activePath]?.generatedFlows ?? []).filter(f => f.status === "done" || f.status === "error").length) < generatedFlows.length;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="h-full flex overflow-hidden">
        {/* LHS tree */}
        <aside className="shrink-0 bg-white flex flex-col overflow-hidden" style={{ width: treeWidth }}>
          {error && (
            <div className="mx-2 mt-2 text-xs text-[#d1242f] bg-[#ffebe9] border border-[#ffcecb] rounded-md px-2 py-1.5 shrink-0">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-[#d1242f]/60 hover:text-[#d1242f]">✕</button>
            </div>
          )}
          {specDetection && (
            <div className="mx-2 mt-2 text-xs bg-[#ddf4ff] border border-[#54aeff66] rounded-md px-2.5 py-2 shrink-0">
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
            onGenerateFlowIdeas={(path, count) => void handleGenerateFlowIdeas(path, count)}
            onRefresh={loadFiles}
            onNewVersion={() => setShowNewVersionModal(true)}
          />
        </aside>
        <ResizeHandle width={treeWidth} onResize={setTreeWidth} minWidth={160} maxWidth={400} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {hasSelection ? (
            <>
              {/* Header bar */}
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
                {/* New Flow button */}
                <button
                  onClick={() => setChatActive(true)}
                  disabled={chatActive || noSpecFiles}
                  title={noSpecFiles ? noSpecFilesTooltip : chatActive ? "Flow chat is already open" : "Design a new flow interactively"}
                  className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[#0969da] hover:text-[#0860ca] px-2 py-1 rounded-md hover:bg-[#ddf4ff] transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  New Flow
                </button>

                {/* Cost summary */}
                {(ideasUsage || flowsUsage) && (() => {
                  const totalCost = (ideasUsage?.costUsd ?? 0) + (flowsUsage?.costUsd ?? 0);
                  return (
                    <div className="flex items-center gap-3 text-xs text-[#656d76]">
                      {ideasUsage && (
                        <span>Ideas <span className="font-medium text-[#1f2328]">${ideasUsage.costUsd.toFixed(4)}</span></span>
                      )}
                      {flowsUsage && (
                        <span>Flows <span className="font-medium text-[#1f2328]">${flowsUsage.costUsd.toFixed(4)}</span></span>
                      )}
                      {ideasUsage && flowsUsage && (
                        <>
                          <span className="text-[#d1d9e0]">|</span>
                          <span className="font-semibold text-[#1f2328]">${totalCost.toFixed(4)}</span>
                        </>
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Source URL info bar — shown for URL-sourced files */}
              {isFileContext && selectedPath && sourcesManifest[selectedPath] && (
                <div className="flex items-center gap-2 px-4 h-8 border-b border-[#d1d9e0] bg-[#ddf4ff]/50 shrink-0">
                  <svg className="w-3.5 h-3.5 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
                  </svg>
                  <span className="text-xs text-[#656d76]">Source:</span>
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
                        className="flex-1 min-w-0 text-xs border border-[#0969da] rounded px-1.5 py-0.5 outline-none bg-white text-[#1f2328]"
                        placeholder="https://..."
                      />
                      <button type="submit" className="text-xs text-white bg-[#0969da] hover:bg-[#0860ca] rounded px-2 py-0.5 font-medium">Save</button>
                      <button type="button" onClick={() => setEditingSourceUrl(false)} className="text-xs text-[#656d76] hover:text-[#1f2328]">Cancel</button>
                    </form>
                  ) : (
                    <>
                      <a
                        href={sourcesManifest[selectedPath].sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-[#0969da] hover:underline truncate flex-1 min-w-0"
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

              {/* Content area — Skills editor, JSON viewer, markdown viewer, or workshop */}
              {viewingContent && isFileContext && (selectedPath?.endsWith("/_skills.md") || selectedPath?.endsWith("/Skills.md")) ? (
                /* _skills.md — editable CodeMirror markdown editor */
                loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                ) : (
                  <SkillsEditor path={selectedPath!} content={content} onSaved={() => void loadFiles()} />
                )
              ) : viewingContent && isFileContext && selectedPath?.includes("/_system/") && selectedPath?.endsWith(".json") ? (
                /* System JSON files — read-only CodeMirror JSON viewer */
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
                /* Markdown content viewer (replaces workshop when filename link is clicked) */
                loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                ) : (
                  <MarkdownViewer path={selectedPath!} content={content} onClose={selectedPath?.includes("/_system/") ? undefined : () => setViewingContent(false)} />
                )
              ) : showWorkshop ? (
                /* Workshop layout — full-width Ideas panel when no ideas, 3-column when ideas exist */
                <div className="flex-1 flex overflow-hidden">
                  {/* Column 1 — Ideas (full width when no ideas to show empty state) */}
                  <div className={`flex flex-col overflow-hidden ${hasIdeas ? "shrink-0" : "flex-1"}`} style={hasIdeas ? { width: ideasWidth } : undefined}>
                    <FlowIdeasPanel
                      ideas={thisLevelIdeas.length > 0 ? thisLevelIdeas : null}
                      loading={ideasLoading}
                      appending={ideasAppending}
                      error={ideasError}
                      rawText={ideasRawText}
                      message={ideasMessage}
                      selectedIds={selectedIdeaIds}
                      lockedIds={completedFlowIdeaIds}
                      activeIdeaId={activeIdeaId}
                      activeFlowId={activeFlowId}
                      onToggleSelect={toggleIdeaSelect}
                      onSelectAll={selectAllIdeas}
                      onDeselectAll={deselectAllIdeas}
                      onGenerateFlows={handleGenerateFlows}
                      onGenerateFlowForIdea={handleGenerateFlowForIdea}
                      onGenerateMore={handleGenerateMoreIdeas}
                      onDeleteSelected={handleDeleteSelectedIdeas}
                      onDeleteIdea={(id) => handleDeleteSelectedIdeas(new Set([id]))}
                      onClickIdea={handleClickIdea}
                      markedIds={markedIds}
                      generatingFlows={generatingFlows}
                      ideasExhausted={ideasExhausted}
                      maxIdeasTotal={MAX_IDEAS_TOTAL}
                      thisLevelOnly={thisLevelOnly}
                      onToggleThisLevel={(hasSubLevelIdeas || hasSubLevelFlows) ? () => setThisLevelOnly((v) => !v) : undefined}
                    />
                  </div>

                  {/* Flows + Detail columns — only shown when ideas exist */}
                  {hasIdeas && (
                    <>
                      <ResizeHandle width={ideasWidth} onResize={setIdeasWidth} minWidth={200} maxWidth={500} />

                      {/* Column 2 — Flows */}
                      <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: flowsWidth }}>
                        <FlowsPanel
                          flows={thisLevelFlows}
                          ideas={ideas}
                          generating={generatingFlows}
                          progress={flowProgress}
                          activeFlowId={activeFlowId}
                          onClickFlow={handleClickFlow}
                          onDownloadFlow={downloadFlow}
                          onDownloadAll={downloadAllFlows}
                          onDeleteFlow={handleDeleteFlow}
                          onDeleteAllFlows={handleDeleteAllFlows}
                          onStartFlowChat={() => setChatActive(true)}
                          onMarkForImplementation={handleMarkForImplementation}
                          onMarkSelectedForImplementation={handleMarkSelectedForImplementation}
                          markedIds={markedIds}
                          markingIds={markingIds}
                          selectedFlowIds={selectedFlowIds}
                          onToggleSelectFlow={toggleSelectFlow}
                          onSelectAllFlows={selectAllFlows}
                          onDeselectAllFlows={deselectAllFlows}
                          thisLevelOnly={thisLevelOnly}
                          onToggleThisLevel={(hasSubLevelFlows || hasSubLevelIdeas) ? () => setThisLevelOnly((v) => !v) : undefined}
                          onCancelGeneration={generatingFlows ? handleCancelGeneration : undefined}
                        />
                      </div>
                      <ResizeHandle width={flowsWidth} onResize={setFlowsWidth} minWidth={180} maxWidth={500} />

                      {/* Column 3 — Detail or Chat (takes remaining space) */}
                      <div className="flex-1 flex flex-col overflow-hidden min-w-[200px]">
                        {chatActive ? (
                          <FlowChatPanel
                            specFiles={contextSpecFiles}
                            allSpecFiles={files}
                            aiModel={aiModel}
                            onFlowGenerated={handleChatFlowGenerated}
                            onClose={() => setChatActive(false)}
                          />
                        ) : (
                        <DetailPanel
                          selectedIdea={selectedIdea}
                          selectedFlow={selectedFlow}
                          flowIdea={selectedFlow ? ideas.find((i) => i.id === selectedFlow.ideaId) ?? null : null}
                          onDownloadFlow={downloadFlow}
                          onGenerateFlow={handleGenerateFlowForIdea}
                          generatingFlows={generatingFlows}
                          isFlowMarked={selectedFlow ? markedIds.has(selectedFlow.ideaId) : false}
                          onCreateTest={handleMarkForImplementation}
                          creatingTest={selectedFlow ? markingIds.has(selectedFlow.ideaId) : false}
                          onUpdateFlowXml={handleUpdateFlowXml}
                          isFlowLocked={!!selectedFlowLock}
                          flowLockTooltip={selectedFlowLock ? `Locked by ${selectedFlowLock.lockedBy.name}${canUnlockFlow ? " — click to unlock" : ". Unlock the scenario before editing."}` : undefined}
                          canUnlockFlow={canUnlockFlow}
                          onUnlockFlow={selectedFlowLock ? () => void handleUnlockSelectedFlow() : undefined}
                        />
                        )}
                      </div>
                    </>
                  )}
                </div>
              ) : chatActive ? (
                /* Full-width chat panel on landing page */
                <div className="flex-1 flex overflow-hidden">
                  <FlowChatPanel
                    specFiles={contextSpecFiles}
                    allSpecFiles={files}
                    aiModel={aiModel}
                    onFlowGenerated={handleChatFlowGenerated}
                    onClose={() => setChatActive(false)}
                  />
                </div>
              ) : (
                /* Generate Ideas landing */
                <div className="flex-1 flex items-center justify-center bg-white">
                  <div className="text-center space-y-4 max-w-sm">
                    <div className={`w-14 h-14 rounded-full flex items-center justify-center mx-auto ${
                      !isFileContext && folderMdCount === 0 ? "bg-[#656d76]/10" : "bg-[#0969da]/10"
                    }`}>
                      <svg className={`w-7 h-7 ${!isFileContext && folderMdCount === 0 ? "text-[#656d76]" : "text-[#0969da]"}`} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1f2328] mb-1">Generate test flow ideas</p>
                      <p className="text-sm text-[#656d76]">
                        {multiSelectedMdPaths.length > 0
                          ? `${multiSelectedMdPaths.length} spec file${multiSelectedMdPaths.length > 1 ? "s" : ""} selected — AI will use them as combined context.`
                          : noSpecFiles
                            ? (!projectHasSpecFiles
                                ? "Upload spec files (.md) to your project to get started with AI-powered test flow generation."
                                : "No spec files (.md) found in this folder. Upload spec files to generate ideas.")
                            : isFileContext
                              ? "AI will analyze this spec file and suggest test scenarios."
                              : `AI will analyze ${folderMdCount} spec file${folderMdCount === 1 ? "" : "s"} in this folder and suggest test scenarios.`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      {multiSelectedMdPaths.length > 0 ? (
                        /* Multi-select: generate from selected files */
                        [1, 3, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => {
                              const folder = activePath ?? multiSelectedMdPaths[0].split("/").slice(0, -1).join("/");
                              void handleGenerateFlowIdeas(folder, n, multiSelectedMdPaths);
                            }}
                            className="inline-flex items-center gap-1.5 bg-[#0969da] hover:bg-[#0860ca] text-white text-sm font-medium rounded-md px-3 py-2 transition-colors border border-[#0969da]/80"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                            </svg>
                            {n} idea{n > 1 ? "s" : ""} from {multiSelectedMdPaths.length} file{multiSelectedMdPaths.length > 1 ? "s" : ""}
                          </button>
                        ))
                      ) : (
                        [1, 3, 5].map((n) => (
                          <button
                            key={n}
                            onClick={() => void handleGenerateFlowIdeas(activePath!, n)}
                            disabled={noSpecFiles}
                            title={noSpecFiles ? noSpecFilesTooltip : `Generate ${n} test flow idea${n > 1 ? "s" : ""}`}
                            className="inline-flex items-center gap-1.5 bg-[#0969da] hover:bg-[#0860ca] text-white text-sm font-medium rounded-md px-3 py-2 transition-colors border border-[#0969da]/80 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                            </svg>
                            {n} idea{n > 1 ? "s" : ""}
                          </button>
                        ))
                      )}
                    </div>
                    <div className="flex flex-col items-center gap-2 pt-2">
                      <span className="text-xs text-[#656d76]">or design a flow interactively</span>
                      <button
                        onClick={() => setChatActive(true)}
                        disabled={noSpecFiles}
                        title={noSpecFiles ? noSpecFilesTooltip : "Design a new flow interactively"}
                        className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md px-3 py-2 transition-colors border border-[#1a7f37]/80 disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                        </svg>
                        New Flow
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Nothing selected — empty state */
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
      </div>

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

      {/* Access token prompt (shown when single-file sync fails with auth error) */}
      {tokenPrompt && (
        <AccessTokenPrompt
          message={tokenPrompt.message}
          initialToken={sourceAccessToken}
          onSubmit={tokenPrompt.onRetry}
          onClose={() => setTokenPrompt(null)}
        />
      )}

      {/* Mark-for-implementation conflict modal */}
      {conflict && (
        <MarkConflictModal
          flowTitle={conflict.flow.title}
          existingName={conflict.existingName}
          suggestedNewName={conflict.suggestedNewName}
          onResolve={handleConflictResolve}
          onCancel={() => setConflict(null)}
        />
      )}

      {/* CustomPromptModal removed — replaced by inline FlowChatPanel */}
    </Layout>
  );
}

