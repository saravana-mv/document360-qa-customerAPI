import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Layout } from "../components/common/Layout";
import { ResizeHandle } from "../components/common/ResizeHandle";
import { FileTree } from "../components/specfiles/FileTree";
import { MarkdownViewer } from "../components/specfiles/MarkdownViewer";
import { FileUploadModal } from "../components/specfiles/FileUploadModal";
import { ImportFromUrlModal } from "../components/specfiles/ImportFromUrlModal";
import { FlowIdeasPanel } from "../components/specfiles/FlowIdeasPanel";
import { FlowsPanel, type GeneratedFlow } from "../components/specfiles/FlowsPanel";
import { DetailPanel } from "../components/specfiles/DetailPanel";
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
  type SpecFileItem,
  type FlowIdea,
  type FlowIdeasUsage,
  type FlowUsage,
} from "../lib/api/specFilesApi";
import { generateFlowXml } from "../lib/api/flowApi";
import { validateFlowXml } from "../lib/tests/flowXml/validate";
import {
  saveFlowFile,
  listFlowFiles,
  FlowFileConflictError,
  parentFolderOf,
  buildFlowFilePath,
  slugifyFlowTitle,
} from "../lib/api/flowFilesApi";
import { buildFlowPrompt } from "../lib/flow/buildPrompt";
import { loadFlowsFromQueue } from "../lib/tests/flowXml/loader";
import { MarkConflictModal } from "../components/specfiles/MarkConflictModal";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useSetupStore } from "../store/setup.store";

// ── localStorage persistence helpers (multi-context map) ─────────────────────

const STORAGE_KEY_V2 = "specfiles_workshop_v2";
const STORAGE_KEY_V1 = "specfiles_workshop"; // legacy key for migration

interface ContextData {
  ideas: FlowIdea[];
  usage: FlowIdeasUsage | null;
  flowsUsage: FlowUsage | null;
  generatedFlows: GeneratedFlow[];
}

type WorkshopMap = Record<string, ContextData>;

function loadWorkshopMap(): WorkshopMap {
  // Try v2 first
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V2);
    if (raw) return JSON.parse(raw) as WorkshopMap;
  } catch { /* ignore */ }

  // Migrate from v1 single-context format
  try {
    const raw = localStorage.getItem(STORAGE_KEY_V1);
    if (raw) {
      const v1 = JSON.parse(raw);
      if (v1.ideasFolderPath && v1.ideas?.length > 0) {
        const map: WorkshopMap = {
          [v1.ideasFolderPath]: {
            ideas: v1.ideas,
            usage: v1.ideasUsage ?? null,
            flowsUsage: null,
            generatedFlows: (v1.generatedFlows ?? []).filter(
              (f: GeneratedFlow) => f.status === "done" || f.status === "error"
            ),
          },
        };
        localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(map));
        localStorage.removeItem(STORAGE_KEY_V1);
        return map;
      }
    }
  } catch { /* ignore */ }

  return {};
}

function saveWorkshopMap(map: WorkshopMap) {
  try {
    localStorage.setItem(STORAGE_KEY_V2, JSON.stringify(map));
  } catch { /* quota exceeded — ignore */ }
}

/** Aggregate ideas + flows from a path and all descendant paths */
function aggregateForPath(map: WorkshopMap, path: string | null): ContextData {
  if (!path) return { ideas: [], usage: null, flowsUsage: null, generatedFlows: [] };
  const prefix = path.endsWith("/") ? path : `${path}/`;
  const matchingKeys = Object.keys(map).filter(k => k === path || k.startsWith(prefix));

  if (matchingKeys.length === 0) return { ideas: [], usage: null, flowsUsage: null, generatedFlows: [] };
  if (matchingKeys.length === 1) {
    const ctx = map[matchingKeys[0]];
    return { ...ctx, flowsUsage: ctx.flowsUsage ?? null };
  }

  const allIdeas: FlowIdea[] = [];
  const allFlows: GeneratedFlow[] = [];
  let totalUsage: FlowIdeasUsage | null = null;
  let totalFlowsUsage: FlowUsage | null = null;

  for (const key of matchingKeys) {
    const ctx = map[key];
    allIdeas.push(...ctx.ideas);
    allFlows.push(...ctx.generatedFlows);
    if (ctx.usage) {
      if (!totalUsage) {
        totalUsage = { ...ctx.usage };
      } else {
        totalUsage = {
          inputTokens: totalUsage.inputTokens + ctx.usage.inputTokens,
          outputTokens: totalUsage.outputTokens + ctx.usage.outputTokens,
          totalTokens: totalUsage.totalTokens + ctx.usage.totalTokens,
          costUsd: parseFloat((totalUsage.costUsd + ctx.usage.costUsd).toFixed(6)),
          filesAnalyzed: totalUsage.filesAnalyzed + ctx.usage.filesAnalyzed,
          totalSpecCharacters: totalUsage.totalSpecCharacters + ctx.usage.totalSpecCharacters,
        };
      }
    }
    if (ctx.flowsUsage) {
      if (!totalFlowsUsage) {
        totalFlowsUsage = { ...ctx.flowsUsage };
      } else {
        totalFlowsUsage = {
          inputTokens: totalFlowsUsage.inputTokens + ctx.flowsUsage.inputTokens,
          outputTokens: totalFlowsUsage.outputTokens + ctx.flowsUsage.outputTokens,
          totalTokens: totalFlowsUsage.totalTokens + ctx.flowsUsage.totalTokens,
          costUsd: parseFloat((totalFlowsUsage.costUsd + ctx.flowsUsage.costUsd).toFixed(6)),
        };
      }
    }
  }

  return { ideas: allIdeas, usage: totalUsage, flowsUsage: totalFlowsUsage, generatedFlows: allFlows };
}

/** Get next globally unique idea index across all contexts */
function nextGlobalIdeaIndex(map: WorkshopMap): number {
  let max = 0;
  for (const ctx of Object.values(map)) {
    for (const idea of ctx.ideas) {
      const match = idea.id.match(/^idea-(\d+)$/);
      if (match) max = Math.max(max, parseInt(match[1]));
    }
  }
  return max + 1;
}

const MAX_IDEAS_PER_RUN = 10;  // Must match backend MAX_IDEAS_PER_RUN
const MAX_IDEAS_TOTAL = 30;    // Hard cap to prevent over-engineering

export function SpecFilesPage() {
  useAuthGuard();

  const aiModel = useSetupStore((s) => s.aiModel);

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
  const [sourcedPaths, setSourcedPaths] = useState<Set<string>>(new Set());

  // ── Multi-context workshop state ──────────────────────────────────────────
  // Read localStorage on every mount (not a module-level snapshot) so that
  // edits persisted in an earlier mount are picked up when the page remounts
  // (e.g. after navigating to Flow Manager and back).
  const [workshopMap, setWorkshopMap] = useState<WorkshopMap>(() => loadWorkshopMap());

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

  // Persist workshopMap to localStorage whenever it changes
  useEffect(() => {
    saveWorkshopMap(workshopMap);
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

  // ── Sync marked-for-implementation state from the server ────────────────────
  // Source of truth is the flow-files blob container. If a flow file has been
  // deleted in Flow Manager, its idea gets automatically unblocked here.
  const syncMarkedFromServer = useCallback(async () => {
    if (generatedFlows.length === 0) {
      setMarkedIds(new Set());
      return;
    }
    const folder = parentFolderOf(activePath);
    try {
      const items = await listFlowFiles(folder || undefined);
      const existingPaths = new Set(items.map(i => i.name));
      const next = new Set<string>();
      for (const flow of generatedFlows) {
        if (flow.status !== "done") continue;
        const target = buildFlowFilePath(folder, flow.title);
        if (existingPaths.has(target)) next.add(flow.ideaId);
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
      setSourcedPaths(new Set(Object.keys(manifest)));
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
    if (loadingFiles || files.length === 0) return;
    didRehydrateRef.current = true;

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

  async function selectFile(path: string) {
    setSelectedPath(path);
    setSelectedFolderPath(null);
    setViewingContent(false);
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
    setSelectedFolderPath(path);
    setSelectedPath(null);
    setViewingContent(false);
    setContent("");
    loadWorkingSet(path);
  }

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  async function handleCreateFolder(folderPath: string) {
    setError(null);
    try {
      await uploadSpecFile(`${folderPath}/.keep`, "");
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleUpload(name: string, fileContent: string, contentType: string) {
    await uploadSpecFile(name, fileContent, contentType);
    await loadFiles();
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

  async function handleImportFromUrl(url: string, folderPath: string, filename?: string) {
    await importSpecFileFromUrl(url, folderPath, filename);
    await loadFiles();
    await loadSourcedPaths();
  }

  // ── Sync from URL source ──────────────────────────────────────────────────

  async function handleSyncFile(folderPath: string, filename: string) {
    try {
      const result = await syncSpecFiles(folderPath, filename);
      const failed = result.synced.filter((r) => !r.updated);
      if (failed.length > 0) {
        alert(`Sync failed for: ${failed.map((f) => `${f.name}: ${f.error}`).join("\n")}`);
      }
      await loadFiles();
      await loadSourcedPaths();
      // Refresh content if the synced file is currently viewed
      const syncedPath = folderPath ? `${folderPath}/${filename}` : filename;
      if (selectedPath === syncedPath) {
        const fresh = await getSpecFileContent(syncedPath);
        setContent(fresh);
      }
    } catch (e) {
      alert(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function handleSyncFolder(folderPath: string) {
    if (!confirm(`Sync all URL-sourced files under "${folderPath || "/"}"?\n\nPrevious versions will be preserved.`)) return;
    try {
      const result = await syncSpecFiles(folderPath);
      const updated = result.synced.filter((r) => r.updated).length;
      const failed = result.synced.filter((r) => !r.updated);
      if (failed.length > 0) {
        alert(`Synced ${updated} file(s). Failed:\n${failed.map((f) => `${f.name}: ${f.error}`).join("\n")}`);
      }
      await loadFiles();
      await loadSourcedPaths();
    } catch (e) {
      alert(`Sync failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // ── Generate flow ideas (AI) ──────────────────────────────────────────────

  async function handleGenerateFlowIdeas(contextPath: string) {
    // contextPath can be a folder path or a file path (.md)
    if (contextPath.endsWith(".md")) {
      setSelectedPath(contextPath);
      setSelectedFolderPath(null);
    } else {
      setSelectedFolderPath(contextPath);
      setSelectedPath(null);
    }
    setViewingContent(false);

    // ── Guard: skip API call if ideas already exist for this context ──
    const existing = aggregateForPath(workshopMap, contextPath);
    if (existing.ideas.length > 0) {
      // Just load existing ideas — no API call, no cost
      setIdeas(existing.ideas);
      setIdeasUsage(existing.usage);
      setFlowsUsage(existing.flowsUsage);
      setGeneratedFlows(existing.generatedFlows.filter(f => f.status === "done" || f.status === "error"));
      setSelectedIdeaIds(new Set());
      setIdeasError(null);
      setIdeasRawText(undefined);
      setIdeasMessage(null);
      setActiveIdeaId(null);
      setActiveFlowId(null);
      return;
    }

    setIdeas([]);
    setIdeasUsage(null);
    setFlowsUsage(null);
    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasMessage(null);
    setIdeasExhausted(false);
    setSelectedIdeaIds(new Set());
    setGeneratedFlows([]);
    setActiveIdeaId(null);
    setActiveFlowId(null);
    setIdeasLoading(true);
    try {
      const result = await generateFlowIdeas(contextPath, [], undefined, aiModel);
      // Assign globally unique IDs to avoid collisions across contexts
      const startIdx = nextGlobalIdeaIndex(workshopMap);
      const newIdeas = result.ideas.map((idea, i) => ({
        ...idea,
        id: `idea-${startIdx + i}`,
      }));
      // Save to workshopMap under this context
      if (newIdeas.length > 0) {
        setWorkshopMap(prev => ({
          ...prev,
          [contextPath]: {
            ideas: newIdeas,
            usage: result.usage,
            flowsUsage: null,
            generatedFlows: [],
          },
        }));
      }
      // Update flat working set
      setIdeas(newIdeas);
      setIdeasUsage(result.usage);
      // Mark exhausted if AI returned fewer than max
      if (newIdeas.length < MAX_IDEAS_PER_RUN) {
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
      setIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasLoading(false);
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
        const startIdx = nextGlobalIdeaIndex(workshopMap);
        const newIdeas = result.ideas.map((idea, i) => ({
          ...idea,
          id: `idea-${startIdx + i}`,
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

  function handleClickIdea(id: string) {
    // If this idea has a completed flow, auto-show the flow in detail panel
    if (completedFlowIdeaIds.has(id)) {
      setActiveFlowId(id);
      setActiveIdeaId(null);
    } else {
      setActiveIdeaId(id);
      setActiveFlowId(null);
    }
  }

  function handleDeleteFlow(ideaId: string) {
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
    setGeneratedFlows([]);
    setActiveFlowId(null);
    setFlowsUsage(null);
    // Remove all flows from workshopMap
    setWorkshopMap(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        if (next[key].generatedFlows.length > 0) {
          next[key] = { ...next[key], generatedFlows: [], flowsUsage: null };
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

  // ── Generate flows from selected ideas ────────────────────────────────────

  function handleGenerateFlowForIdea(ideaId: string) {
    setSelectedIdeaIds(new Set([ideaId]));
    // Defer to next tick so state update is picked up by handleGenerateFlows
    setTimeout(() => void handleGenerateFlows(new Set([ideaId])), 0);
  }

  async function handleGenerateFlows(overrideIds?: Set<string>) {
    // Guard against React event objects being passed as overrideIds (e.g. from onClick)
    const idsToUse = overrideIds instanceof Set ? overrideIds : selectedIdeaIds;
    if (idsToUse.size === 0 || !activePath) return;

    // Filter out ideas that already have completed flows — don't waste resources
    const selectedIdeas = ideas.filter(
      (i) => idsToUse.has(i.id) && !completedFlowIdeaIds.has(i.id)
    );
    if (selectedIdeas.length === 0) return;

    // Get spec file names for context — depends on whether context is a file or folder
    let specFileNames: string[];
    if (activePath.endsWith(".md")) {
      specFileNames = [activePath];
    } else {
      const prefix = activePath.endsWith("/") ? activePath : `${activePath}/`;
      specFileNames = files
        .filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md"))
        .map((f) => f.name);
    }

    // Preserve existing completed flows, add pending entries for new ones
    const newPending: GeneratedFlow[] = selectedIdeas.map((idea) => ({
      ideaId: idea.id,
      title: idea.title,
      status: "pending" as const,
      xml: "",
    }));
    const existingCompleted = generatedFlows.filter(f => f.status === "done" || f.status === "error");
    setGeneratedFlows([...existingCompleted, ...newPending]);
    setGeneratingFlows(true);
    setFlowProgress({ current: 0, total: selectedIdeas.length });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    for (let i = 0; i < selectedIdeas.length; i++) {
      if (ctrl.signal.aborted) break;

      const idea = selectedIdeas[i];
      const prompt = buildFlowPrompt(idea);

      setGeneratedFlows((prev) =>
        prev.map((f) => f.ideaId === idea.id ? { ...f, status: "generating" as const } : f)
      );
      // Auto-select the currently generating flow in the detail panel
      setActiveFlowId(idea.id);
      setActiveIdeaId(null);

      try {
        const result = await generateFlowXml(prompt, specFileNames, aiModel, ctrl.signal);
        setGeneratedFlows((prev) =>
          prev.map((f) => f.ideaId === idea.id ? { ...f, status: "done" as const, xml: result.xml, usage: result.usage } : f)
        );
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
        if (ctrl.signal.aborted) break;
        setGeneratedFlows((prev) =>
          prev.map((f) => f.ideaId === idea.id
            ? { ...f, status: "error" as const, error: e instanceof Error ? e.message : String(e) }
            : f
          )
        );
      }

      setFlowProgress({ current: i + 1, total: selectedIdeas.length });
    }

    setGeneratingFlows(false);
    abortRef.current = null;
  }

  // ── Generate a flow from a manually entered prompt ────────────────────────

  async function handleCreateManualFlow(title: string, prompt: string) {
    if (!activePath) return;

    // Resolve spec files from the current context (same logic as handleGenerateFlows)
    let specFileNames: string[];
    if (activePath.endsWith(".md")) {
      specFileNames = [activePath];
    } else {
      const prefix = activePath.endsWith("/") ? activePath : `${activePath}/`;
      specFileNames = files
        .filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md"))
        .map((f) => f.name);
    }

    const manualId = `manual-${Date.now()}`;
    const pending: GeneratedFlow = {
      ideaId: manualId,
      title,
      status: "generating",
      xml: "",
    };
    setGeneratedFlows((prev) => [...prev, pending]);
    setActiveFlowId(manualId);
    setActiveIdeaId(null);

    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setGeneratingFlows(true);
    setFlowProgress({ current: 0, total: 1 });

    try {
      const result = await generateFlowXml(prompt, specFileNames, aiModel, ctrl.signal);
      setGeneratedFlows((prev) =>
        prev.map((f) => f.ideaId === manualId ? { ...f, status: "done", xml: result.xml, usage: result.usage } : f)
      );
      if (result.usage) {
        setFlowsUsage(prev => prev ? {
          inputTokens: prev.inputTokens + result.usage!.inputTokens,
          outputTokens: prev.outputTokens + result.usage!.outputTokens,
          totalTokens: prev.totalTokens + result.usage!.totalTokens,
          costUsd: parseFloat((prev.costUsd + result.usage!.costUsd).toFixed(6)),
        } : result.usage!);
      }
    } catch (e) {
      if (!ctrl.signal.aborted) {
        setGeneratedFlows((prev) =>
          prev.map((f) => f.ideaId === manualId
            ? { ...f, status: "error", error: e instanceof Error ? e.message : String(e) }
            : f
          )
        );
      }
    }

    setFlowProgress({ current: 1, total: 1 });
    setGeneratingFlows(false);
    abortRef.current = null;
  }

  // ── Create tests — save flow XML to blob and register as runnable tests ──

  async function markFlow(flow: GeneratedFlow, targetName: string, overwrite: boolean) {
    setMarkingIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
    try {
      await saveFlowFile(targetName, flow.xml, overwrite);
      setMarkedIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
      // Immediately register the saved flow as runnable tests
      void loadFlowsFromQueue();
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
    void markFlow(flow, target, false);
  }

  function handleMarkSelectedForImplementation() {
    const folder = parentFolderOf(activePath);
    const toMark = generatedFlows.filter(
      (f) =>
        f.status === "done" &&
        selectedFlowIds.has(f.ideaId) &&
        !markedIds.has(f.ideaId) &&
        validateFlowXml(f.xml).ok,
    );
    for (const flow of toMark) {
      const target = buildFlowFilePath(folder, flow.title);
      void markFlow(flow, target, false);
    }
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

  // ── Derived header info ──────────────────────────────────────────────────

  const isFileContext = !!selectedPath;
  const hasSelection = !!activePath;

  // Count .md spec files under the active folder (recursive)
  const folderMdCount = (!isFileContext && activePath)
    ? (() => {
        const prefix = activePath.endsWith("/") ? activePath : `${activePath}/`;
        return files.filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md")).length;
      })()
    : 0;

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
          <FileTree
            files={files}
            loading={loadingFiles}
            selectedPath={selectedPath}
            selectedFolderPath={selectedFolderPath}
            pathsWithIdeas={pathsWithIdeas}
            sourcedPaths={sourcedPaths}
            onSelectFile={(path) => void selectFile(path)}
            onSelectFolder={selectFolder}
            onCreateFolder={(path) => handleCreateFolder(path)}
            onDeleteFile={(path) => handleDeleteFile(path)}
            onDeleteFolder={(path) => handleDeleteFolder(path)}
            onRenameFile={(oldPath, newPath) => handleRename(oldPath, newPath)}
            onUploadFiles={(folderPath) => setUploadFolderPath(folderPath)}
            onImportFromUrl={(folderPath) => setImportUrlFolderPath(folderPath)}
            onSyncFile={(folderPath, filename) => void handleSyncFile(folderPath, filename)}
            onSyncFolder={(folderPath) => void handleSyncFolder(folderPath)}
            onGenerateFlowIdeas={(folderPath) => void handleGenerateFlowIdeas(folderPath)}
            onRefresh={loadFiles}
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
                {/* Cost summary — right side */}
                {(ideasUsage || flowsUsage) && (() => {
                  const totalCost = (ideasUsage?.costUsd ?? 0) + (flowsUsage?.costUsd ?? 0);
                  return (
                    <div className="ml-auto flex items-center gap-3 text-xs text-[#656d76]">
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

              {/* Content area — either markdown viewer or workshop */}
              {viewingContent && isFileContext ? (
                /* Markdown content viewer (replaces workshop when filename link is clicked) */
                loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                ) : (
                  <MarkdownViewer path={selectedPath!} content={content} onClose={() => setViewingContent(false)} />
                )
              ) : showWorkshop ? (
                /* Three-column workshop: Ideas | Flows | Detail */
                <div className="flex-1 flex overflow-hidden">
                  {/* Column 1 — Ideas */}
                  <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: ideasWidth }}>
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
                      onToggleThisLevel={hasSubLevelIdeas ? () => setThisLevelOnly((v) => !v) : undefined}
                    />
                  </div>
                  <ResizeHandle width={ideasWidth} onResize={setIdeasWidth} minWidth={200} maxWidth={500} />

                  {/* Column 2 — Flows */}
                  <div className="shrink-0 flex flex-col overflow-hidden" style={{ width: flowsWidth }}>
                    <FlowsPanel
                      flows={generatedFlows}
                      ideas={ideas}
                      generating={generatingFlows}
                      progress={flowProgress}
                      activeFlowId={activeFlowId}
                      onClickFlow={handleClickFlow}
                      onDownloadFlow={downloadFlow}
                      onDownloadAll={downloadAllFlows}
                      onDeleteFlow={handleDeleteFlow}
                      onDeleteAllFlows={handleDeleteAllFlows}
                      onCreateManualFlow={handleCreateManualFlow}
                      onMarkForImplementation={handleMarkForImplementation}
                      onMarkSelectedForImplementation={handleMarkSelectedForImplementation}
                      markedIds={markedIds}
                      markingIds={markingIds}
                      selectedFlowIds={selectedFlowIds}
                      onToggleSelectFlow={toggleSelectFlow}
                      onSelectAllFlows={selectAllFlows}
                      onDeselectAllFlows={deselectAllFlows}
                    />
                  </div>
                  <ResizeHandle width={flowsWidth} onResize={setFlowsWidth} minWidth={180} maxWidth={500} />

                  {/* Column 3 — Detail (takes remaining space) */}
                  <div className="flex-1 flex flex-col overflow-hidden min-w-[200px]">
                    <DetailPanel
                      selectedIdea={selectedIdea}
                      selectedFlow={selectedFlow}
                      flowIdea={selectedFlow ? ideas.find((i) => i.id === selectedFlow.ideaId) ?? null : null}
                      onDownloadFlow={downloadFlow}
                      onGenerateFlow={handleGenerateFlowForIdea}
                      generatingFlows={generatingFlows}
                    />
                  </div>
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
                        {!isFileContext && folderMdCount === 0
                          ? "No spec files (.md) found in this folder. Upload spec files to generate ideas."
                          : isFileContext
                            ? "AI will analyze this spec file and suggest test scenarios."
                            : `AI will analyze ${folderMdCount} spec file${folderMdCount === 1 ? "" : "s"} in this folder and suggest test scenarios.`}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleGenerateFlowIdeas(activePath!)}
                      disabled={!isFileContext && folderMdCount === 0}
                      className="inline-flex items-center gap-2 bg-[#0969da] hover:bg-[#0860ca] text-white text-sm font-medium rounded-md px-4 py-2 transition-colors border border-[#0969da]/80 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      Generate ideas
                    </button>
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
          onImport={handleImportFromUrl}
          onClose={() => setImportUrlFolderPath(null)}
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
    </Layout>
  );
}

