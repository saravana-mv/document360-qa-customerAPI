import { create } from "zustand";
import {
  listFolders,
  createFolder as apiCreateFolder,
  updateFolder as apiUpdateFolder,
  deleteFolder as apiDeleteFolder,
  type IdeaFolderDoc,
} from "../lib/api/ideaFoldersApi";
import { listSpecFiles } from "../lib/api/specFilesApi";

interface IdeaFoldersState {
  folders: IdeaFolderDoc[];
  loaded: boolean;
  loading: boolean;

  loadAll(): Promise<void>;
  create(name: string, parentPath: string | null, specFilePaths?: string[]): Promise<IdeaFolderDoc>;
  rename(id: string, newName: string): Promise<void>;
  setSpecFilePaths(id: string, paths: string[]): Promise<void>;
  reorder(id: string, order: number): Promise<void>;
  remove(id: string): Promise<void>;

  byPath(path: string): IdeaFolderDoc | undefined;
  childrenOf(parentPath: string | null): IdeaFolderDoc[];

  syncFromSpecs(): Promise<void>;
}

export const useIdeaFoldersStore = create<IdeaFoldersState>((set, get) => ({
  folders: [],
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
      const folders = await listFolders();
      set({ folders, loaded: true, loading: false });
    } catch (e) {
      console.warn("[ideaFolders.store] Failed to load folders:", e);
      set({ loaded: true, loading: false });
    }
  },

  create: async (name, parentPath, specFilePaths) => {
    const doc = await apiCreateFolder(name, parentPath, specFilePaths);
    set((s) => ({ folders: [...s.folders, doc] }));
    return doc;
  },

  rename: async (id, newName) => {
    await apiUpdateFolder(id, { name: newName });
    // Reload all — cascade may have changed descendant paths
    const folders = await listFolders();
    set({ folders });
  },

  setSpecFilePaths: async (id, paths) => {
    const updated = await apiUpdateFolder(id, { specFilePaths: paths });
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? updated : f)),
    }));
  },

  reorder: async (id, order) => {
    const updated = await apiUpdateFolder(id, { order });
    set((s) => ({
      folders: s.folders.map((f) => (f.id === id ? updated : f)),
    }));
  },

  remove: async (id) => {
    const folder = get().folders.find((f) => f.id === id);
    await apiDeleteFolder(id);
    // Remove folder + descendants from local state
    if (folder) {
      const prefix = folder.path + "/";
      set((s) => ({
        folders: s.folders.filter(
          (f) => f.id !== id && !f.path.startsWith(prefix),
        ),
      }));
      // Clean up workshop store entries
      try {
        const { useWorkshopStore } = await import("./workshop.store");
        const ws = useWorkshopStore.getState();
        ws.deleteFolder(folder.path);
        // Also delete descendants
        for (const key of Object.keys(ws.workshopMap)) {
          if (key.startsWith(prefix)) ws.deleteFolder(key);
        }
      } catch { /* ignore */ }
    } else {
      set((s) => ({ folders: s.folders.filter((f) => f.id !== id) }));
    }
  },

  byPath: (path) => get().folders.find((f) => f.path === path),

  childrenOf: (parentPath) =>
    get()
      .folders.filter((f) => f.parentPath === parentPath)
      .sort((a, b) => a.order - b.order),

  syncFromSpecs: async () => {
    const specFiles = await listSpecFiles();
    const mdFiles = specFiles.filter((f) => f.name.endsWith(".md"));

    // Group by parent folder path
    const folderMap = new Map<string, string[]>();
    for (const f of mdFiles) {
      const lastSlash = f.name.lastIndexOf("/");
      if (lastSlash < 0) continue; // skip root-level files
      const folder = f.name.substring(0, lastSlash);
      if (!folderMap.has(folder)) folderMap.set(folder, []);
      folderMap.get(folder)!.push(f.name);
    }

    // Collect all unique folder paths including ancestors
    const allPaths = new Set<string>();
    for (const folder of folderMap.keys()) {
      const parts = folder.split("/");
      for (let i = 1; i <= parts.length; i++) {
        allPaths.add(parts.slice(0, i).join("/"));
      }
    }

    // Sort by depth (parents first)
    const sorted = [...allPaths].sort(
      (a, b) => a.split("/").length - b.split("/").length,
    );

    const existing = get().folders;
    const existingPaths = new Set(existing.map((f) => f.path));

    for (const folderPath of sorted) {
      if (existingPaths.has(folderPath)) continue;
      const parts = folderPath.split("/");
      const name = parts[parts.length - 1];
      const parentPath = parts.length > 1 ? parts.slice(0, -1).join("/") : null;
      const specs = folderMap.get(folderPath) ?? [];
      try {
        await apiCreateFolder(name, parentPath, specs);
        existingPaths.add(folderPath);
      } catch (e) {
        // 409 = already exists, skip
        if (e instanceof Error && e.message.includes("409")) {
          existingPaths.add(folderPath);
        } else {
          console.warn(`[ideaFolders.store] Failed to create folder "${folderPath}":`, e);
        }
      }
    }

    // Reload all folders
    const folders = await listFolders();
    set({ folders, loaded: true });
  },
}));
