import { create } from "zustand";

interface ExplorerUIState {
  /** Set of expanded entity names */
  expandedEntities: Set<string>;
  /** Set of expanded tag (flow) names */
  expandedTags: Set<string>;
  /** Whether settings panel is visible */
  showSettings: boolean;

  toggleEntity: (name: string) => void;
  toggleTag: (name: string) => void;
  setShowSettings: (v: boolean) => void;
  expandAll: (entities: string[], tags: string[]) => void;
  collapseAll: () => void;
}

export const useExplorerUIStore = create<ExplorerUIState>((set) => ({
  expandedEntities: new Set<string>(),
  expandedTags: new Set<string>(),
  showSettings: false,

  toggleEntity: (name) =>
    set((s) => {
      const next = new Set(s.expandedEntities);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { expandedEntities: next };
    }),

  toggleTag: (name) =>
    set((s) => {
      const next = new Set(s.expandedTags);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return { expandedTags: next };
    }),

  setShowSettings: (v) => set({ showSettings: v }),

  expandAll: (entities, tags) =>
    set({ expandedEntities: new Set(entities), expandedTags: new Set(tags) }),

  collapseAll: () =>
    set({ expandedEntities: new Set(), expandedTags: new Set() }),
}));
