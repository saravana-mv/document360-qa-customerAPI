import { create } from "zustand";
import {
  getAllIdeas,
  saveIdeas,
  deleteIdeas,
  renameIdeas,
  reKeyWorkshopMap,
  aggregateForPath,
  migrateFromLocalStorage as migrateIdeasFromLocalStorage,
  type WorkshopMap,
  type ContextData,
} from "../lib/api/ideasApi";
import type { GeneratedFlow } from "../components/specfiles/FlowsPanel";
import { useAiCostStore } from "./aiCost.store";

interface WorkshopState {
  workshopMap: WorkshopMap;
  loaded: boolean;
  loading: boolean;

  /** Load all ideas from Cosmos (with localStorage migration). Call once on app init. */
  loadAll: () => Promise<void>;

  /** Save a folder's context data (debounced by caller or immediate) */
  saveFolder: (path: string, data: ContextData) => void;

  /** Update workshopMap in-memory + persist changed entries */
  setWorkshopMap: (updater: (prev: WorkshopMap) => WorkshopMap) => void;

  /** Delete a folder's ideas from map + Cosmos */
  deleteFolder: (path: string) => void;

  /** Rename a folder path (Cosmos migration + in-memory re-key) */
  renameFolder: (oldPath: string, newPath: string) => Promise<void>;

  /** Aggregate ideas/flows for a path (includes descendants) */
  aggregateForPath: (path: string | null) => ContextData;

  /** Paths that have at least one idea — for tree indicators */
  pathsWithIdeas: () => Set<string>;
}

export const useWorkshopStore = create<WorkshopState>((set, get) => ({
  workshopMap: {},
  loaded: false,
  loading: false,

  loadAll: async () => {
    if (get().loaded || get().loading) return;
    set({ loading: true });
    try {
      const { hasProject } = await import("../lib/api/projectHeader");
      if (!hasProject()) {
        set({ loaded: true, loading: false });
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

      // Clean up orphaned flows — flows whose ideaId doesn't match any idea
      const allIdeaIds = new Set<string>();
      for (const ctx of Object.values(map)) {
        for (const idea of ctx.ideas) allIdeaIds.add(idea.id);
      }
      let cleaned = false;
      for (const [key, ctx] of Object.entries(map)) {
        const orphans = ctx.generatedFlows.filter(f => !allIdeaIds.has(f.ideaId));
        if (orphans.length > 0) {
          console.warn(`[workshop.store] Removing ${orphans.length} orphaned flows from "${key}"`);
          ctx.generatedFlows = ctx.generatedFlows.filter(f => allIdeaIds.has(f.ideaId));
          cleaned = true;
        }
      }

      set({ workshopMap: map, loaded: true, loading: false });

      // Push workshop cost to global AI cost store
      syncWorkshopCost(map);

      // Persist cleaned data
      if (cleaned) {
        for (const [folder, ctx] of Object.entries(map)) {
          saveIdeas(folder, ctx).catch(e => console.warn("[workshop.store] Failed to save cleaned ideas:", e));
        }
      }
    } catch (e) {
      console.warn("[workshop.store] Failed to load ideas:", e);
      set({ loaded: true, loading: false });
    }
  },

  saveFolder: (path, data) => {
    set(state => ({
      workshopMap: { ...state.workshopMap, [path]: data },
    }));
    saveIdeas(path, data).catch(e =>
      console.warn("[workshop.store] Failed to save ideas:", e),
    );
    // Sync cost
    syncWorkshopCost({ ...get().workshopMap, [path]: data });
  },

  setWorkshopMap: (updater) => {
    const prev = get().workshopMap;
    const next = updater(prev);
    set({ workshopMap: next });

    // Persist changed/new entries
    for (const [folder, data] of Object.entries(next)) {
      if (data !== prev[folder]) {
        saveIdeas(folder, data).catch(e =>
          console.warn("[workshop.store] Failed to save ideas:", e),
        );
      }
    }
    // Delete removed entries
    for (const folder of Object.keys(prev)) {
      if (!(folder in next)) {
        deleteIdeas(folder).catch(e =>
          console.warn("[workshop.store] Failed to delete ideas:", e),
        );
      }
    }

    syncWorkshopCost(next);
  },

  deleteFolder: (path) => {
    set(state => {
      const next = { ...state.workshopMap };
      delete next[path];
      return { workshopMap: next };
    });
    deleteIdeas(path).catch(e =>
      console.warn("[workshop.store] Failed to delete ideas:", e),
    );
    syncWorkshopCost(get().workshopMap);
  },

  renameFolder: async (oldPath, newPath) => {
    // Cosmos migration
    renameIdeas(oldPath, newPath).catch(e =>
      console.warn("[workshop.store] Ideas migration failed:", e),
    );
    // In-memory re-key
    set(state => ({
      workshopMap: reKeyWorkshopMap(state.workshopMap, oldPath, newPath),
    }));
  },

  aggregateForPath: (path) => aggregateForPath(get().workshopMap, path),

  pathsWithIdeas: () => {
    const s = new Set<string>();
    for (const [key, ctx] of Object.entries(get().workshopMap)) {
      if (ctx.ideas.length > 0) s.add(key);
    }
    return s;
  },
}));

/** Push total workshop cost to global AI cost store */
function syncWorkshopCost(map: WorkshopMap) {
  let total = 0;
  for (const ctx of Object.values(map)) {
    if (ctx.usage) total += ctx.usage.costUsd;
    if (ctx.flowsUsage) total += ctx.flowsUsage.costUsd;
  }
  useAiCostStore.getState().setWorkshopCost(parseFloat(total.toFixed(6)));
}
