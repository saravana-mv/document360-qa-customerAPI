import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Layout } from "../components/common/Layout";
import { ResizeHandle } from "../components/common/ResizeHandle";
import { ContextMenu, MenuIcons, type MenuItem } from "../components/common/ContextMenu";
import { FlowIdeasPanel } from "../components/specfiles/FlowIdeasPanel";
import { GenerateIdeasModal } from "../components/specfiles/GenerateIdeasModal";
import { FlowsPanel, type GeneratedFlow } from "../components/specfiles/FlowsPanel";
import { DetailPanel } from "../components/specfiles/DetailPanel";
import { MarkConflictModal } from "../components/specfiles/MarkConflictModal";
import { CreateScenariosModal } from "../components/specfiles/CreateScenariosModal";
import { CreateFolderModal } from "../components/specfiles/CreateFolderModal";
import { IdeasChatPanel } from "../components/specfiles/IdeasChatPanel";
import type { ChatIdea } from "../lib/api/flowChatApi";
import {
  generateFlowIdeas,
  type FlowIdea,
  type FlowIdeasUsage,
  type FlowUsage,
  type IdeaMode,
} from "../lib/api/specFilesApi";
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
import { buildFlowPrompt } from "../lib/flow/buildPrompt";
import { loadFlowsFromQueue } from "../lib/tests/flowXml/loader";
import { activateFlow, activateFlows, getActiveFlows } from "../lib/tests/flowXml/activeTests";
import { buildParsedTagsFromRegistry } from "../lib/tests/buildParsedTags";
import { useSpecStore } from "../store/spec.store";
import { useFlowStatusStore } from "../store/flowStatus.store";
import { useScenarioOrgStore } from "../store/scenarioOrg.store";
import { useSetupStore } from "../store/setup.store";
import { useWorkshopStore } from "../store/workshop.store";
import { useIdeaFoldersStore } from "../store/ideaFolders.store";
import type { IdeaFolderDoc } from "../lib/api/ideaFoldersApi";
import { aggregateForPath } from "../lib/api/ideasApi";

const MAX_IDEAS_PER_RUN = 5;
const MAX_IDEAS_TOTAL = 30;

export function IdeasFlowsPage() {
  const aiModel = useSetupStore((s) => s.aiModel);
  const setSpec = useSpecStore((s) => s.setSpec);
  const [searchParams] = useSearchParams();

  // Workshop store
  const workshopMap = useWorkshopStore((s) => s.workshopMap);
  const workshopLoaded = useWorkshopStore((s) => s.loaded);
  const setWorkshopMap = useWorkshopStore((s) => s.setWorkshopMap);

  // ── Idea folders store ──────────────────────────────────────────────────────
  const folders = useIdeaFoldersStore((s) => s.folders);
  const foldersLoaded = useIdeaFoldersStore((s) => s.loaded);
  const foldersLoading = useIdeaFoldersStore((s) => s.loading);

  useEffect(() => { void useIdeaFoldersStore.getState().loadAll(); }, []);

  // ── Create/edit folder modal state ─────────────────────────────────────────
  const [showCreateFolder, setShowCreateFolder] = useState<{ parentPath: string | null } | null>(null);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; currentName: string } | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [treeExpandAll, setTreeExpandAll] = useState(false);
  const [treeSortAZ, setTreeSortAZ] = useState(false);
  const [showIdeasChat, setShowIdeasChat] = useState(false);

  // ── Selection state ────────────────────────────────────────────────────────
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(
    () => {
      const fromUrl = searchParams.get("folder");
      if (fromUrl) return fromUrl;
      return localStorage.getItem("ideasflows_selected_folder") || null;
    },
  );

  // ── Working set — flat state loaded from workshopMap when navigating ──────
  const [ideas, setIdeas] = useState<FlowIdea[]>([]);
  const [ideasUsage, setIdeasUsage] = useState<FlowIdeasUsage | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasAppending, setIdeasAppending] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasRawText, setIdeasRawText] = useState<string | undefined>();
  const [ideasMessage, setIdeasMessage] = useState<string | null>(null);
  const [ideasExhausted, setIdeasExhausted] = useState(false);
  const [ideaMode, setIdeaMode] = useState<IdeaMode>("full");
  const [showLandingModal, setShowLandingModal] = useState(false);
  const [selectedIdeaIds, setSelectedIdeaIds] = useState<Set<string>>(new Set());
  const [showNewIdeasModal, setShowNewIdeasModal] = useState(false);

  // ── Flow generation state ─────────────────────────────────────────────────
  const [generatedFlows, setGeneratedFlows] = useState<GeneratedFlow[]>([]);
  const [generatingFlows, setGeneratingFlows] = useState(false);
  const [flowsUsage, setFlowsUsage] = useState<FlowUsage | null>(null);
  const [flowProgress, setFlowProgress] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Detail panel state (persisted) ────────────────────────────────────────
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(() => {
    try { return localStorage.getItem("ideasflows_active_idea_id") || null; } catch { return null; }
  });
  const [activeFlowId, setActiveFlowId] = useState<string | null>(() => {
    try { return localStorage.getItem("ideasflows_active_flow_id") || null; } catch { return null; }
  });
  useEffect(() => { try { if (activeIdeaId) localStorage.setItem("ideasflows_active_idea_id", activeIdeaId); else localStorage.removeItem("ideasflows_active_idea_id"); } catch { /* ignore */ } }, [activeIdeaId]);
  useEffect(() => { try { if (activeFlowId) localStorage.setItem("ideasflows_active_flow_id", activeFlowId); else localStorage.removeItem("ideasflows_active_flow_id"); } catch { /* ignore */ } }, [activeFlowId]);

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

  // ── Resizable panel widths (persisted) ───────────────────────────────────
  const [treeWidth, setTreeWidth] = useState(() => {
    try { const v = localStorage.getItem("ideasflows_tree_width"); if (v) return parseInt(v, 10); } catch { /* ignore */ }
    return 220;
  });
  const [ideasWidth, setIdeasWidth] = useState(() => {
    try { const v = localStorage.getItem("ideasflows_ideas_width"); if (v) return parseInt(v, 10); } catch { /* ignore */ }
    const available = (typeof window !== "undefined" ? window.innerWidth : 1440) - 220;
    return Math.max(240, Math.floor(available / 3));
  });
  const [flowsWidth, setFlowsWidth] = useState(() => {
    try { const v = localStorage.getItem("ideasflows_flows_width"); if (v) return parseInt(v, 10); } catch { /* ignore */ }
    const available = (typeof window !== "undefined" ? window.innerWidth : 1440) - 220;
    return Math.max(240, Math.floor(available / 3));
  });
  useEffect(() => { try { localStorage.setItem("ideasflows_tree_width", String(treeWidth)); } catch { /* ignore */ } }, [treeWidth]);
  useEffect(() => { try { localStorage.setItem("ideasflows_ideas_width", String(ideasWidth)); } catch { /* ignore */ } }, [ideasWidth]);
  useEffect(() => { try { localStorage.setItem("ideasflows_flows_width", String(flowsWidth)); } catch { /* ignore */ } }, [flowsWidth]);

  // Workshop is visible when aggregated data exists for the current path
  const activePath = selectedFolderPath;
  const showWorkshop = ideas.length > 0 || ideasLoading || ideasAppending || ideasError !== null || ideasMessage !== null;
  const hasIdeas = ideas.length > 0 || ideasLoading || ideasAppending;

  // Persist folder selection
  useEffect(() => {
    if (selectedFolderPath) localStorage.setItem("ideasflows_selected_folder", selectedFolderPath);
    else localStorage.removeItem("ideasflows_selected_folder");
  }, [selectedFolderPath]);

  // Load workshop data on mount
  useEffect(() => {
    void useWorkshopStore.getState().loadAll();
  }, []);

  // Re-populate working set when workshopMap loads or activePath changes
  useEffect(() => {
    if (!workshopLoaded || !activePath || generatingFlows) return;
    const agg = aggregateForPath(workshopMap, activePath);
    if (agg.ideas.length > 0 || agg.generatedFlows.length > 0) {
      setIdeas(agg.ideas);
      setIdeasUsage(agg.usage);
      setFlowsUsage(agg.flowsUsage);
      setGeneratedFlows(agg.generatedFlows.filter(f => f.status === "done" || f.status === "error"));
    }
  }, [workshopLoaded, workshopMap, activePath, generatingFlows]);

  // Rehydrate selection on first folder load
  const didRehydrateRef = useRef(false);
  useEffect(() => {
    if (didRehydrateRef.current || !foldersLoaded || folders.length === 0) return;
    didRehydrateRef.current = true;
    if (selectedFolderPath) {
      const stillExists = folders.some((f) => f.path === selectedFolderPath);
      if (!stillExists) {
        setSelectedFolderPath(null);
        return;
      }
      loadWorkingSet(selectedFolderPath);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [foldersLoaded, folders]);

  // ── Sync marked-for-implementation state ──────────────────────────────────
  const syncMarkedFromServer = useCallback(async () => {
    if (generatedFlows.length === 0) {
      setMarkedIds(new Set());
      return;
    }
    const folder = parentFolderOf(activePath);
    try {
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
      // Leave existing markedIds in place
    }
  }, [activePath, generatedFlows]);

  useEffect(() => { void syncMarkedFromServer(); }, [syncMarkedFromServer]);

  useEffect(() => {
    const onFocus = () => { void syncMarkedFromServer(); };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [syncMarkedFromServer]);

  // Persist generated flows back to workshopMap when flow generation completes
  useEffect(() => {
    if (!generatingFlows && generatedFlows.length > 0 && activePath) {
      const flowsToSave = generatedFlows.filter(f => f.status === "done" || f.status === "error");
      if (flowsToSave.length > 0) {
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

  // ── Select folder ─────────────────────────────────────────────────────────

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

  function selectFolder(path: string) {
    if (!confirmLeaveGeneration()) return;
    setSelectedFolderPath(path);
    loadWorkingSet(path);
  }

  // ── Generate flow ideas (AI) ──────────────────────────────────────────────

  async function handleGenerateFlowIdeas(contextPath: string, maxCount?: number, filePaths?: string[], prompt?: string) {
    setSelectedFolderPath(contextPath);

    const existing = aggregateForPath(workshopMap, contextPath);
    const existingTitles = existing.ideas.map(i => i.title);

    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasMessage(null);
    setIdeasExhausted(false);
    if (existing.ideas.length > 0) {
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
      const result = await generateFlowIdeas(contextPath, existingTitles, undefined, aiModel, maxCount ?? MAX_IDEAS_PER_RUN, filePaths, ideaMode, prompt);
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
      const requested = maxCount ?? MAX_IDEAS_PER_RUN;
      if (newIdeas.length < requested) setIdeasExhausted(true);
      if (result.parseError && result.rawText) setIdeasRawText(result.rawText);
      if (newIdeas.length === 0) {
        setIdeasMessage(result.message || "AI could not generate any test flow ideas for this specification.");
      }
    } catch (e) {
      console.error("[IdeasFlows] generateFlowIdeas failed", e);
      setIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasLoading(false);
      setIdeasAppending(false);
    }
  }

  async function handleGenerateMoreIdeas(count?: number, specFiles?: string[], prompt?: string) {
    const currentPath = activePath;
    if (!currentPath) return;
    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasAppending(true);
    const existingTitles = ideas.map((i) => i.title);
    try {
      const result = await generateFlowIdeas(currentPath, existingTitles, undefined, aiModel, count, specFiles, ideaMode, prompt);
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
      const requested = count ?? MAX_IDEAS_PER_RUN;
      if (result.ideas.length < requested) setIdeasExhausted(true);
      if (result.parseError && result.rawText) setIdeasRawText(result.rawText);
    } catch (e) {
      setIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasAppending(false);
    }
  }

  // ── Idea/flow locking ─────────────────────────────────────────────────────

  const completedFlowIdeaIds = new Set(
    generatedFlows.filter(f => f.status === "done").map(f => f.ideaId),
  );

  // ── Idea selection ────────────────────────────────────────────────────────

  function toggleIdeaSelect(id: string) {
    setSelectedIdeaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllIdeas() { setSelectedIdeaIds(new Set(ideas.map(i => i.id))); }
  function deselectAllIdeas() { setSelectedIdeaIds(new Set()); }

  function handleDeleteSelectedIdeas(ids: Set<string>) {
    if (ids.size === 0) return;
    setIdeas(prev => prev.filter(i => !ids.has(i.id)));
    setGeneratedFlows(prev => prev.filter(f => !ids.has(f.ideaId)));
    setSelectedIdeaIds(new Set());
    if (activeIdeaId && ids.has(activeIdeaId)) setActiveIdeaId(null);
    if (activeFlowId && ids.has(activeFlowId)) setActiveFlowId(null);
    setWorkshopMap(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const ctx = next[key];
        const hadIdeas = ctx.ideas.some(i => ids.has(i.id));
        if (hadIdeas) {
          const remainingIdeas = ctx.ideas.filter(i => !ids.has(i.id));
          const remainingFlows = ctx.generatedFlows.filter(f => !ids.has(f.ideaId));
          if (remainingIdeas.length === 0 && remainingFlows.length === 0) {
            delete next[key];
          } else {
            next[key] = { ...ctx, ideas: remainingIdeas, generatedFlows: remainingFlows };
          }
        }
      }
      return next;
    });
    setIdeasExhausted(false);
  }

  // ── Detail panel click handlers ───────────────────────────────────────────

  const flowIdeaIds = new Set(
    generatedFlows.filter(f => f.status === "done" || f.status === "error").map(f => f.ideaId),
  );

  function handleClickIdea(id: string) {
    if (flowIdeaIds.has(id)) {
      setActiveFlowId(id);
      setActiveIdeaId(null);
    } else {
      setActiveIdeaId(id);
      setActiveFlowId(null);
    }
  }

  function handleDeleteFlow(ideaId: string) {
    if (markedIds.has(ideaId)) return;
    const flow = generatedFlows.find(f => f.ideaId === ideaId);
    if (flow?.status === "done" && flow.title) {
      const folder = parentFolderOf(activePath);
      const blobName = buildFlowFilePath(folder, flow.title);
      void deleteFlowFile(blobName).catch(() => {});
    }
    setGeneratedFlows(prev => prev.filter(f => f.ideaId !== ideaId));
    if (activeFlowId === ideaId) setActiveFlowId(null);
    setWorkshopMap(prev => {
      const next = { ...prev };
      for (const key of Object.keys(next)) {
        const ctx = next[key];
        const had = ctx.generatedFlows.some(f => f.ideaId === ideaId);
        if (had) {
          const remaining = ctx.generatedFlows.filter(f => f.ideaId !== ideaId);
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
    const keep = generatedFlows.filter(f => markedIds.has(f.ideaId));
    const folder = parentFolderOf(activePath);
    for (const f of generatedFlows) {
      if (!markedIds.has(f.ideaId) && f.status === "done" && f.title) {
        const blobName = buildFlowFilePath(folder, f.title);
        void deleteFlowFile(blobName).catch(() => {});
      }
    }
    setGeneratedFlows(keep);
    if (activeFlowId && !markedIds.has(activeFlowId)) setActiveFlowId(null);
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
    for (const f of generatedFlows.filter((f) => f.status === "done")) downloadFlow(f);
  }

  // ── Update flow XML ───────────────────────────────────────────────────────

  function handleUpdateFlowXml(ideaId: string, newXml: string) {
    const flow = generatedFlows.find((f) => f.ideaId === ideaId);
    setGeneratedFlows((prev) =>
      prev.map((f) => (f.ideaId === ideaId ? { ...f, xml: newXml } : f)),
    );
    if (activePath) {
      const updated = generatedFlows.map((f) =>
        f.ideaId === ideaId ? { ...f, xml: newXml } : f,
      );
      persistFlowsForPath(activePath, updated);
      if (flow?.title) {
        const flowBlobName = buildFlowFilePath(activePath, flow.title);
        void saveFlowFile(flowBlobName, newXml, true).catch(() => {});
      }
    }
  }

  // ── Generate flows from selected ideas ────────────────────────────────────

  function handleGenerateFlowForIdea(ideaId: string) {
    setSelectedIdeaIds(new Set([ideaId]));
    setTimeout(() => void handleGenerateFlows(new Set([ideaId])), 0);
  }

  function persistFlowsForPath(path: string, flows: GeneratedFlow[]) {
    const flowsToSave = flows.filter((f) => f.status === "done" || f.status === "error");
    if (flowsToSave.length === 0) return;
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
    const idsToUse = overrideIds instanceof Set ? overrideIds : selectedIdeaIds;
    if (idsToUse.size === 0 || !activePath) return;
    const generationPath = activePath;
    const selectedIdeas = ideas.filter(
      (i) => idsToUse.has(i.id) && !completedFlowIdeaIds.has(i.id),
    );
    if (selectedIdeas.length === 0) return;

    const versionRoot = activePath.split("/")[0] ?? "";
    const regenIds = new Set(selectedIdeas.map(i => i.id));
    const newPending: GeneratedFlow[] = selectedIdeas.map((idea) => ({
      ideaId: idea.id,
      title: idea.title,
      status: "pending" as const,
      xml: "",
    }));
    const existingCompleted = generatedFlows.filter(
      f => (f.status === "done" || f.status === "error") && !regenIds.has(f.ideaId),
    );

    let localFlows: GeneratedFlow[] = [...existingCompleted, ...newPending];
    setGeneratedFlows(localFlows);
    setGeneratingFlows(true);
    setFlowProgress({ current: 0, total: selectedIdeas.length });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    try {
      for (let i = 0; i < selectedIdeas.length; i++) {
        if (ctrl.signal.aborted) break;
        const idea = selectedIdeas[i];
        localFlows = localFlows.map((f) =>
          f.ideaId === idea.id ? { ...f, status: "generating" as const } : f,
        );
        setGeneratedFlows(localFlows);
        setActiveFlowId(idea.id);
        setActiveIdeaId(null);

        try {
          const prompt = buildFlowPrompt(idea);
          const result = await generateFlowXml(
            prompt, [], aiModel, ctrl.signal,
            idea.id, versionRoot, generationPath,
          );
          localFlows = localFlows.map((f) =>
            f.ideaId === idea.id
              ? { ...f, status: "done" as const, xml: result.xml, usage: result.usage, traceId: result.traceId, createdAt: new Date().toISOString() }
              : f,
          );
          setGeneratedFlows(localFlows);
          persistFlowsForPath(generationPath, localFlows);

          const flowBlobName = buildFlowFilePath(generationPath, idea.title);
          void saveFlowFile(flowBlobName, result.xml, true).catch((e) =>
            console.warn(`[FlowGen] Failed to persist flow XML for "${idea.title}":`, e),
          );

          setSelectedFlowIds((prev) => { const n = new Set(prev); n.add(idea.id); return n; });
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
          if (ctrl.signal.aborted) break;
          localFlows = localFlows.map((f) =>
            f.ideaId === idea.id
              ? { ...f, status: "error" as const, error: errMsg }
              : f,
          );
          setGeneratedFlows(localFlows);
          persistFlowsForPath(generationPath, localFlows);
          setActiveFlowId(idea.id);
          setActiveIdeaId(null);
        }

        setFlowProgress({ current: i + 1, total: selectedIdeas.length });
      }
    } finally {
      localFlows = localFlows.map((f) =>
        f.status === "pending" || f.status === "generating"
          ? { ...f, status: "error" as const, error: "Generation interrupted" }
          : f,
      );
      setGeneratedFlows(localFlows);
      persistFlowsForPath(generationPath, localFlows);
      setGeneratingFlows(false);
      abortRef.current = null;
    }
  }

  // ── Create tests ──────────────────────────────────────────────────────────

  async function markFlow(flow: GeneratedFlow, targetName: string, overwrite: boolean) {
    setMarkingIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
    try {
      await saveFlowFile(targetName, flow.xml, overwrite);
      await activateFlow(targetName);
      useScenarioOrgStore.getState().placeNewScenarios([targetName]);
      setMarkedIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
      await loadFlowsFromQueue();
      const built = buildParsedTagsFromRegistry();
      setSpec(null as never, built, null as never);
    } catch (e) {
      if (e instanceof FlowFileConflictError) {
        const folder = parentFolderOf(activePath);
        const slug = slugifyFlowTitle(flow.title);
        const maxBase = 80 - ".flow.xml".length;
        let n = 2;
        let suggestedBase = `${slug}-${n}`.slice(0, maxBase);
        let suggested = folder ? `${folder}/${suggestedBase}.flow.xml` : `${suggestedBase}.flow.xml`;
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
    if (!validateFlowXml(flow.xml).ok) return;
    setPendingCreateScenarios([flow]);
  }

  const [pendingCreateScenarios, setPendingCreateScenarios] = useState<GeneratedFlow[] | null>(null);

  function handleMarkSelectedForImplementation() {
    const toMark = generatedFlows.filter(
      (f) =>
        f.status === "done" &&
        selectedFlowIds.has(f.ideaId) &&
        !markedIds.has(f.ideaId) &&
        validateFlowXml(f.xml).ok,
    );
    if (toMark.length === 0) return;
    setPendingCreateScenarios(toMark);
  }

  async function executeCreateScenarios(flowsToCreate: GeneratedFlow[], scenarioTargetFolder?: string) {
    const folder = parentFolderOf(activePath);
    setMarkingIds(prev => {
      const n = new Set(prev);
      for (const f of flowsToCreate) n.add(f.ideaId);
      return n;
    });

    const jobs = flowsToCreate.map((flow) => ({
      flow,
      target: buildFlowFilePath(folder, flow.title),
    }));

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

    if (toActivate.length > 0) {
      await activateFlows(toActivate);
      useScenarioOrgStore.getState().placeNewScenarios(toActivate, scenarioTargetFolder);
    }

    setMarkedIds(prev => {
      const n = new Set(prev);
      for (const id of succeededIds) n.add(id);
      return n;
    });
    setMarkingIds(prev => {
      const n = new Set(prev);
      for (const f of flowsToCreate) n.delete(f.ideaId);
      return n;
    });

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
    setSelectedFlowIds(new Set(generatedFlows.filter(f => f.status === "done" || f.status === "error").map(f => f.ideaId)));
  }

  function deselectAllFlows() { setSelectedFlowIds(new Set()); }

  function handleConflictResolve(resolution: import("../components/specfiles/MarkConflictModal").ConflictResolution) {
    if (!conflict) return;
    const { flow, existingName } = conflict;
    setConflict(null);
    if (resolution.kind === "keep") {
      setMarkedIds(prev => { const n = new Set(prev); n.add(flow.ideaId); return n; });
      return;
    }
    if (resolution.kind === "overwrite") {
      void markFlow(flow, existingName, true);
      return;
    }
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

  // ── Derived header info ───────────────────────────────────────────────────

  const hasSelection = !!activePath;

  // Filter ideas when "this level only"
  const thisLevelIdeas = (activePath && thisLevelOnly)
    ? workshopMap[activePath]?.ideas ?? []
    : ideas;
  const hasSubLevelIdeas = activePath
    && (workshopMap[activePath]?.ideas.length ?? 0) < ideas.length;

  const thisLevelFlows = (activePath && thisLevelOnly && !generatingFlows)
    ? (workshopMap[activePath]?.generatedFlows ?? []).filter(f => f.status === "done" || f.status === "error")
    : generatedFlows;
  const hasSubLevelFlows = activePath
    && ((workshopMap[activePath]?.generatedFlows ?? []).filter(f => f.status === "done" || f.status === "error").length) < generatedFlows.length;

  // ── Folder nav tree (filtered: only version folders + resource subfolders) ─
  const pathsWithIdeas = useMemo(() => {
    const s = new Set<string>();
    for (const [key, ctx] of Object.entries(workshopMap)) {
      if (ctx.ideas.length > 0) s.add(key);
    }
    return s;
  }, [workshopMap]);

  // ── Folder action handlers ────────────────────────────────────────────────

  async function handleCreateFolder(name: string, parentPath: string | null) {
    await useIdeaFoldersStore.getState().create(name, parentPath);
  }

  async function handleRenameFolder(id: string, newName: string) {
    await useIdeaFoldersStore.getState().rename(id, newName);
    setRenamingFolder(null);
  }

  async function handleDeleteFolder(id: string, path: string) {
    const ok = window.confirm(`Delete folder "${path}" and all its ideas? This cannot be undone.`);
    if (!ok) return;
    await useIdeaFoldersStore.getState().remove(id);
    if (selectedFolderPath === path || selectedFolderPath?.startsWith(path + "/")) {
      setSelectedFolderPath(null);
      setIdeas([]);
      setGeneratedFlows([]);
    }
  }

  async function handleSyncFromSpecs() {
    setSyncing(true);
    try {
      await useIdeaFoldersStore.getState().syncFromSpecs();
    } catch (e) {
      console.error("[IdeasFlows] syncFromSpecs failed:", e);
    } finally {
      setSyncing(false);
    }
  }

  function handleChatIdeaAccepted(chatIdea: ChatIdea) {
    if (!activePath) return;
    const newIdea: FlowIdea = {
      id: `idea-${Date.now()}-chat`,
      title: chatIdea.title,
      description: chatIdea.description,
      steps: chatIdea.steps,
      entities: [],
      complexity: "moderate",
      specFiles: chatIdea.specFiles ?? [],
      createdAt: new Date().toISOString(),
    };
    setIdeas((prev) => [...prev, newIdea]);
    setWorkshopMap((prev) => {
      const existing = prev[activePath] ?? { ideas: [], usage: null, flowsUsage: null, generatedFlows: [] };
      return {
        ...prev,
        [activePath]: { ...existing, ideas: [...existing.ideas, newIdea] },
      };
    });
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="h-full flex overflow-hidden">
        {/* LHS folder nav */}
        <aside className="shrink-0 bg-white flex flex-col overflow-hidden border-r border-[#d1d9e0]" style={{ width: treeWidth }}>
          <div className="flex items-center gap-1 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
            <svg className="w-4 h-4 text-[#9a6700] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
            </svg>
            <span className="text-sm font-semibold text-[#1f2328] flex-1">Folders</span>
            {/* Expand all */}
            <button
              onClick={() => setTreeExpandAll((p) => !p)}
              className="p-1 rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] transition-colors"
              title={treeExpandAll ? "Collapse all" : "Expand all"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                {treeExpandAll ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                )}
              </svg>
            </button>
            {/* Sort A-Z */}
            <button
              onClick={() => setTreeSortAZ((p) => !p)}
              className={`p-1 rounded transition-colors ${treeSortAZ ? "text-[#0969da] bg-[#ddf4ff]" : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6]"}`}
              title={treeSortAZ ? "Sort by order" : "Sort A-Z"}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25H12" />
              </svg>
            </button>
            {/* New folder */}
            <button
              onClick={() => setShowCreateFolder({ parentPath: null })}
              className="p-1 rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] transition-colors"
              title="New folder"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {foldersLoading ? (
              <div className="flex items-center justify-center py-8 text-[#656d76] text-sm">Loading…</div>
            ) : foldersLoaded && folders.length === 0 ? (
              <div className="px-4 py-8 text-center space-y-3">
                <p className="text-sm text-[#656d76]">No folders yet</p>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleSyncFromSpecs}
                    disabled={syncing}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] rounded-md px-3 py-1.5 transition-colors disabled:opacity-50"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
                    </svg>
                    {syncing ? "Syncing..." : "Sync from spec structure"}
                  </button>
                  <button
                    onClick={() => setShowCreateFolder({ parentPath: null })}
                    className="inline-flex items-center justify-center gap-1.5 text-sm font-medium text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-1.5 hover:bg-[#f6f8fa] transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                    </svg>
                    Create folder
                  </button>
                </div>
              </div>
            ) : (
              <IdeaFolderNavTree
                folders={folders}
                parentPath={null}
                selectedPath={selectedFolderPath}
                pathsWithIdeas={pathsWithIdeas}
                onSelectFolder={selectFolder}
                onCreateSubfolder={(pp) => setShowCreateFolder({ parentPath: pp })}
                onRenameFolder={(id, name) => setRenamingFolder({ id, currentName: name })}
                onDeleteFolder={handleDeleteFolder}
                onGenerateIdeas={(path) => { selectFolder(path); setShowNewIdeasModal(true); }}
                onGenerateIdeasChat={(path) => { selectFolder(path); setShowIdeasChat(true); }}
                expandAll={treeExpandAll}
                sortAZ={treeSortAZ}
              />
            )}
          </div>
        </aside>
        <ResizeHandle width={treeWidth} onResize={setTreeWidth} minWidth={140} maxWidth={350} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {hasSelection ? (
            <>
              {/* Header bar */}
              <div className="flex items-center gap-1.5 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                <svg className="w-4 h-4 text-[#9a6700] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                  <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
                </svg>
                <span className="text-sm font-semibold text-[#1f2328]">{selectedFolderPath}</span>
                {/* Generate ideas button */}
                <button
                  onClick={() => setShowNewIdeasModal(true)}
                  title="Generate test ideas with AI"
                  className="ml-auto inline-flex items-center gap-1 text-sm font-medium text-[#0969da] hover:text-[#0860ca] px-2 py-1 rounded-md hover:bg-[#ddf4ff] transition-colors shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                  </svg>
                  Generate ideas
                </button>
                {/* Ideas chat button */}
                <button
                  onClick={() => setShowIdeasChat(true)}
                  title="Create ideas interactively via chat"
                  className="inline-flex items-center gap-1 text-sm font-medium text-[#656d76] hover:text-[#1f2328] px-2 py-1 rounded-md hover:bg-[#f6f8fa] transition-colors shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
                  </svg>
                  Chat
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

              {/* Content area — workshop or empty state */}
              {showWorkshop ? (
                <div className="flex-1 flex overflow-hidden">
                  {/* Column 1 — Ideas */}
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
                      ideaMode={ideaMode}
                      onModeChange={setIdeaMode}
                      folderPath={activePath!}
                    />
                  </div>

                  {hasIdeas && (
                    <>
                      <ResizeHandle width={ideasWidth} onResize={setIdeasWidth} minWidth={200} maxWidth={500} />
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
                          onStartNewIdeas={() => setShowNewIdeasModal(true)}
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
                          onCopyFlowId={(flow) => {
                            const folder = parentFolderOf(activePath);
                            const path = buildFlowFilePath(folder, flow.title);
                            navigator.clipboard.writeText(path);
                          }}
                        />
                      </div>
                      <ResizeHandle width={flowsWidth} onResize={setFlowsWidth} minWidth={180} maxWidth={500} />
                      <div className="flex-1 flex flex-col overflow-hidden min-w-[200px]">
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
                          folderPath={parentFolderOf(activePath)}
                        />
                      </div>
                    </>
                  )}
                </div>
              ) : (
                /* Generate Ideas landing */
                <div className="flex-1 flex items-center justify-center bg-white">
                  <div className="text-center space-y-4 max-w-sm">
                    <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto bg-[#0969da]/10">
                      <svg className="w-7 h-7 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1f2328] mb-1">Generate test flow ideas</p>
                      <p className="text-sm text-[#656d76]">
                        Select spec files and let AI suggest test scenarios.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 justify-center">
                      <button
                        onClick={() => setShowLandingModal(true)}
                        title="Generate test flow ideas with AI"
                        className="inline-flex items-center gap-1.5 bg-[#0969da] hover:bg-[#0860ca] text-white text-sm font-medium rounded-md px-3 py-2 transition-colors border border-[#0969da]/80"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                        </svg>
                        Generate ideas
                      </button>
                      {showLandingModal && (
                        <GenerateIdeasModal
                          folderPath={activePath!}
                          currentMode={ideaMode}
                          onGenerate={(count, mode, specFiles, prompt) => {
                            setIdeaMode(mode);
                            void handleGenerateFlowIdeas(activePath!, count, specFiles, prompt);
                          }}
                          onClose={() => setShowLandingModal(false)}
                        />
                      )}
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
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
                </svg>
                <p className="text-sm text-[#656d76]">Select a folder to view ideas and flows</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Create scenarios folder picker modal */}
      {pendingCreateScenarios && pendingCreateScenarios.length > 0 && (
        <CreateScenariosModal
          flows={pendingCreateScenarios}
          version={activePath?.split("/")[0] ?? ""}
          onConfirm={(targetFolder) => {
            const flows = pendingCreateScenarios;
            setPendingCreateScenarios(null);
            void executeCreateScenarios(flows, targetFolder);
          }}
          onClose={() => setPendingCreateScenarios(null)}
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

      {/* Generate Ideas modal (from header bar "New Ideas" button) */}
      {showNewIdeasModal && (
        <GenerateIdeasModal
          folderPath={activePath!}
          currentMode={ideaMode}
          onGenerate={(count, mode, specFiles, prompt) => {
            setIdeaMode(mode);
            void handleGenerateFlowIdeas(activePath!, count, specFiles, prompt);
          }}
          onClose={() => setShowNewIdeasModal(false)}
        />
      )}

      {/* Create folder modal */}
      {showCreateFolder && (
        <CreateFolderModal
          folders={folders}
          presetParentPath={showCreateFolder.parentPath}
          onSave={handleCreateFolder}
          onClose={() => setShowCreateFolder(null)}
        />
      )}

      {/* Ideas chat panel */}
      {showIdeasChat && (
        <IdeasChatPanel
          aiModel={aiModel}
          onIdeaAccepted={handleChatIdeaAccepted}
          onClose={() => setShowIdeasChat(false)}
        />
      )}

      {/* Inline rename prompt */}
      {renamingFolder && (() => {
        const rf = renamingFolder;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
            <div className="w-[360px] bg-white rounded-xl shadow-xl border border-[#d1d9e0]/70 p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-[#1f2328]">Rename folder</h2>
                <button onClick={() => setRenamingFolder(null)} className="text-[#656d76] hover:text-[#1f2328] p-1 rounded-md hover:bg-[#f6f8fa]" title="Close">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
                </button>
              </div>
              <form onSubmit={(e) => { e.preventDefault(); const input = (e.target as HTMLFormElement).elements.namedItem("name") as HTMLInputElement; void handleRenameFolder(rf.id, input.value); }}>
                <input name="name" autoFocus defaultValue={rf.currentName} className="w-full text-sm px-3 py-1.5 border border-[#d1d9e0] rounded-md outline-none focus:border-[#0969da] text-[#1f2328] mb-3" />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setRenamingFolder(null)} className="text-sm text-[#656d76] hover:text-[#1f2328] px-3 py-1.5 rounded-md hover:bg-[#f6f8fa]">Cancel</button>
                  <button type="submit" className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] px-3 py-1.5 rounded-md">Rename</button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </Layout>
  );
}

// ── IdeaFolderNavTree — collapsible folder tree with context menus ──────────

const chatIcon = (
  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l2.755-4.133a1.14 1.14 0 0 1 .865-.501 48.172 48.172 0 0 0 3.423-.379c1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z" />
  </svg>
);

function IdeaFolderNavTree({ folders, parentPath, selectedPath, pathsWithIdeas, onSelectFolder, onCreateSubfolder, onRenameFolder, onDeleteFolder, onGenerateIdeas, onGenerateIdeasChat, expandAll, sortAZ, depth = 0 }: {
  folders: IdeaFolderDoc[];
  parentPath: string | null;
  selectedPath: string | null;
  pathsWithIdeas: Set<string>;
  onSelectFolder: (path: string) => void;
  onCreateSubfolder: (parentPath: string) => void;
  onRenameFolder: (id: string, currentName: string) => void;
  onDeleteFolder: (id: string, path: string) => void;
  onGenerateIdeas?: (path: string) => void;
  onGenerateIdeasChat?: (path: string) => void;
  expandAll?: boolean;
  sortAZ?: boolean;
  depth?: number;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (depth > 0) return new Set<string>(); // Only top-level manages localStorage
    try {
      const raw = localStorage.getItem("ideasflows_expanded_folders");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    // Auto-expand root folders
    return new Set(folders.filter(f => f.parentPath === null).map(f => f.path));
  });

  // Respond to expandAll toggle from toolbar
  const prevExpandAll = useRef(expandAll);
  useEffect(() => {
    if (expandAll === prevExpandAll.current) return;
    prevExpandAll.current = expandAll;
    if (expandAll) {
      setExpanded(new Set(folders.map(f => f.path)));
    } else {
      setExpanded(new Set());
    }
  }, [expandAll, folders]);

  useEffect(() => {
    if (depth === 0) {
      try { localStorage.setItem("ideasflows_expanded_folders", JSON.stringify([...expanded])); } catch { /* ignore */ }
    }
  }, [expanded, depth]);

  function toggleExpand(path: string) {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  const children = folders
    .filter(f => f.parentPath === parentPath)
    .sort((a, b) => sortAZ ? a.name.localeCompare(b.name) : a.order - b.order);

  return (
    <>
      {children.map(folder => {
        const isExpanded = expanded.has(folder.path);
        const isSelected = selectedPath === folder.path;
        const hasIdeas = pathsWithIdeas.has(folder.path);
        const hasChildren = folders.some(f => f.parentPath === folder.path);
        const hasDescendantIdeas = (() => {
          const prefix = folder.path + "/";
          for (const p of pathsWithIdeas) {
            if (p.startsWith(prefix)) return true;
          }
          return false;
        })();

        const menuItems: MenuItem[] = [
          { label: "Generate ideas", icon: MenuIcons.sparkle, onClick: () => onGenerateIdeas?.(folder.path) },
          { label: "Ideas chat", icon: chatIcon, onClick: () => onGenerateIdeasChat?.(folder.path) },
          "separator",
          { label: "Rename", icon: MenuIcons.rename, onClick: () => onRenameFolder(folder.id, folder.name) },
          { label: "New subfolder", icon: MenuIcons.folder, onClick: () => onCreateSubfolder(folder.path) },
          "separator",
          { label: "Delete", icon: MenuIcons.trash, danger: true, onClick: () => onDeleteFolder(folder.id, folder.path) },
        ];

        return (
          <div key={folder.id}>
            <div
              className={[
                "group w-full flex items-center gap-1.5 px-2 py-1.5 text-left transition-colors cursor-pointer",
                isSelected
                  ? "bg-[#ddf4ff] text-[#0969da]"
                  : "text-[#1f2328] hover:bg-[#f6f8fa]",
              ].join(" ")}
              style={{ paddingLeft: `${8 + depth * 16}px` }}
              onClick={() => {
                onSelectFolder(folder.path);
                if (hasChildren && !isExpanded) toggleExpand(folder.path);
              }}
            >
              {/* Expand/collapse chevron */}
              {hasChildren ? (
                <button
                  onClick={(e) => { e.stopPropagation(); toggleExpand(folder.path); }}
                  className="w-4 h-4 flex items-center justify-center shrink-0 text-[#656d76] hover:text-[#1f2328]"
                >
                  <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 16 16">
                    <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                  </svg>
                </button>
              ) : (
                <span className="w-4 shrink-0" />
              )}
              {/* Folder icon */}
              <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
              </svg>
              <span className="text-sm truncate flex-1">{folder.name}</span>
              {/* Ideas indicator */}
              {(hasIdeas || hasDescendantIdeas) && (
                <span className={`w-2 h-2 rounded-full shrink-0 ${hasIdeas ? "bg-[#1a7f37]" : "bg-[#1a7f37]/40"}`} />
              )}
              {/* Context menu */}
              <span className="opacity-0 group-hover:opacity-100 shrink-0" onClick={(e) => e.stopPropagation()}>
                <ContextMenu items={menuItems} align="left" />
              </span>
            </div>
            {isExpanded && hasChildren && (
              <IdeaFolderNavTree
                folders={folders}
                parentPath={folder.path}
                selectedPath={selectedPath}
                pathsWithIdeas={pathsWithIdeas}
                onSelectFolder={onSelectFolder}
                onCreateSubfolder={onCreateSubfolder}
                onRenameFolder={onRenameFolder}
                onDeleteFolder={onDeleteFolder}
                onGenerateIdeas={onGenerateIdeas}
                onGenerateIdeasChat={onGenerateIdeasChat}
                expandAll={expandAll}
                sortAZ={sortAZ}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </>
  );
}
