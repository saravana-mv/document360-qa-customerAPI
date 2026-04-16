import { create } from "zustand";

type SortOrder = "asc" | "desc";

const SORT_KEY = "explorerSortOrder";
const VERSIONS_KEY = "explorerExpandedVersions";
const FOLDERS_KEY = "explorerExpandedFolders";

function loadSetFromStorage(key: string): Set<string> {
  try {
    const raw = localStorage.getItem(key);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set<string>();
}

function loadFoldersFromStorage(): Record<string, Set<string>> {
  try {
    const raw = localStorage.getItem(FOLDERS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, string[]>;
      const result: Record<string, Set<string>> = {};
      for (const [k, v] of Object.entries(parsed)) {
        result[k] = new Set(v);
      }
      return result;
    }
  } catch { /* ignore */ }
  return {};
}

function persistSet(key: string, s: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...s]));
}

function persistFolders(folders: Record<string, Set<string>>): void {
  const obj: Record<string, string[]> = {};
  for (const [k, v] of Object.entries(folders)) {
    obj[k] = [...v];
  }
  localStorage.setItem(FOLDERS_KEY, JSON.stringify(obj));
}

interface ExplorerUIState {
  /** @deprecated — use expandedVersions + expandedFolders instead */
  expandedEntities: Set<string>;
  expandedTags: Set<string>;
  showSettings: boolean;
  sortOrder: SortOrder;

  // Version accordion state
  expandedVersions: Set<string>;
  expandedFolders: Record<string, Set<string>>;

  toggleEntity: (name: string) => void;
  toggleTag: (name: string) => void;
  setShowSettings: (v: boolean) => void;
  expandAll: (entities: string[], tags: string[]) => void;
  collapseAll: () => void;
  toggleSortOrder: () => void;

  // Version/folder toggles
  toggleVersion: (version: string) => void;
  toggleFolder: (version: string, folder: string) => void;
  expandAllVersions: (versions: string[], folders: Record<string, string[]>, tags: string[]) => void;
  collapseAllVersions: () => void;
}

export const useExplorerUIStore = create<ExplorerUIState>((set) => ({
  expandedEntities: new Set<string>(),
  expandedTags: new Set<string>(),
  showSettings: false,
  sortOrder: (localStorage.getItem(SORT_KEY) as SortOrder) || "asc",
  expandedVersions: loadSetFromStorage(VERSIONS_KEY),
  expandedFolders: loadFoldersFromStorage(),

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

  toggleSortOrder: () =>
    set((s) => {
      const next: SortOrder = s.sortOrder === "asc" ? "desc" : "asc";
      localStorage.setItem(SORT_KEY, next);
      return { sortOrder: next };
    }),

  toggleVersion: (version) =>
    set((s) => {
      const next = new Set(s.expandedVersions);
      if (next.has(version)) next.delete(version);
      else next.add(version);
      persistSet(VERSIONS_KEY, next);
      return { expandedVersions: next };
    }),

  toggleFolder: (version, folder) =>
    set((s) => {
      const vFolders = new Set(s.expandedFolders[version] ?? []);
      if (vFolders.has(folder)) vFolders.delete(folder);
      else vFolders.add(folder);
      const next = { ...s.expandedFolders, [version]: vFolders };
      persistFolders(next);
      return { expandedFolders: next };
    }),

  expandAllVersions: (versions, folders, tags) =>
    set(() => {
      const ev = new Set(versions);
      const ef: Record<string, Set<string>> = {};
      for (const [v, paths] of Object.entries(folders)) {
        ef[v] = new Set(paths);
      }
      const et = new Set(tags);
      persistSet(VERSIONS_KEY, ev);
      persistFolders(ef);
      return {
        expandedVersions: ev,
        expandedFolders: ef,
        expandedTags: et,
      };
    }),

  collapseAllVersions: () =>
    set(() => {
      const ev = new Set<string>();
      const ef: Record<string, Set<string>> = {};
      const et = new Set<string>();
      persistSet(VERSIONS_KEY, ev);
      persistFolders(ef);
      return {
        expandedVersions: ev,
        expandedFolders: ef,
        expandedTags: et,
      };
    }),
}));
