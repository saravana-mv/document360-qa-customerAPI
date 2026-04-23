import { create } from "zustand";
import { getScenarioOrg, saveScenarioOrg } from "../lib/api/scenarioOrgApi";
import { getActiveFlows } from "../lib/api/activeTestsApi";
import { useSetupStore } from "./setup.store";
import { NEWLY_ADDED, depthOf } from "../lib/treeUtils";

interface VersionConfig {
  baseUrl: string;
  apiVersion: string;
  authMethod?: "oauth" | "apikey";  // default "oauth"
  apiKeyConfigured?: boolean;       // read-only — true when server has a stored key
}

interface ScenarioOrgState {
  loaded: boolean;
  loading: boolean;
  versionConfigs: Record<string, VersionConfig>;
  folders: Record<string, string[]>;
  placements: Record<string, string>;

  // Actions
  load: () => Promise<void>;
  save: () => Promise<void>;

  // Version config
  setVersionConfig: (version: string, config: VersionConfig) => void;

  // Folder CRUD
  createFolder: (version: string, folderPath: string) => void;
  renameFolder: (version: string, oldPath: string, newPath: string) => void;
  deleteFolder: (version: string, folderPath: string) => void;

  // Folder move
  moveFolder: (version: string, sourcePath: string, targetPath: string) => void;

  // Scenario placement
  moveScenario: (flowPath: string, targetFolder: string) => void;
  placeNewScenarios: (flowPaths: string[]) => void;

  // Clear placements (for delete-all)
  clearPlacements: () => void;

  // Full reset (for project switch)
  reset: () => void;

  // Derived helpers
  getVersionForFlow: (flowPath: string) => string | null;
  getFolderForFlow: (flowPath: string) => string;
  getFlowsInFolder: (version: string, folder: string) => string[];
  getVersions: () => string[];
}

/** Extract version prefix from flow path (e.g. "v3/Articles/foo.flow.xml" → "v3") */
function extractVersion(flowPath: string): string | null {
  const idx = flowPath.indexOf("/");
  if (idx === -1) return null;
  return flowPath.slice(0, idx);
}

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let loadStarted = false;

export const useScenarioOrgStore = create<ScenarioOrgState>((set, get) => ({
  loaded: false,
  loading: false,
  versionConfigs: {},
  folders: {},
  placements: {},

  load: async () => {
    if (get().loading || get().loaded || loadStarted) return;
    loadStarted = true;
    set({ loading: true });
    try {
      const data = await getScenarioOrg();
      const hasData = Object.keys(data.folders).length > 0 ||
                      Object.keys(data.placements).length > 0;

      if (hasData) {
        set({
          versionConfigs: data.versionConfigs,
          folders: data.folders,
          placements: data.placements,
          loaded: true,
          loading: false,
        });
        return;
      }

      // Auto-migration: seed from active flows
      const activeFlows = await getActiveFlows();
      const folders: Record<string, string[]> = {};
      const placements: Record<string, string> = {};
      const versionConfigs: Record<string, VersionConfig> = {};

      const setup = useSetupStore.getState();
      const defaultConfig: VersionConfig = {
        baseUrl: setup.baseUrl,
        apiVersion: setup.apiVersion,
      };

      for (const flowPath of activeFlows) {
        const version = extractVersion(flowPath);
        if (!version) continue;

        if (!folders[version]) {
          folders[version] = [NEWLY_ADDED];
          versionConfigs[version] = { ...defaultConfig };
        }
        placements[flowPath] = NEWLY_ADDED;
      }

      set({
        versionConfigs,
        folders,
        placements,
        loaded: true,
        loading: false,
      });

      // Persist the seeded data
      await saveScenarioOrg({ versionConfigs, folders, placements });
    } catch (e) {
      console.warn("[scenarioOrg] Failed to load:", e);
      set({ loading: false, loaded: true });
    }
  },

  save: async () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      const { versionConfigs, folders, placements } = get();
      try {
        await saveScenarioOrg({ versionConfigs, folders, placements });
      } catch (e) {
        console.warn("[scenarioOrg] Failed to save:", e);
      }
    }, 500);
  },

  setVersionConfig: (version, config) => {
    set((s) => ({
      versionConfigs: { ...s.versionConfigs, [version]: config },
    }));
    get().save();
  },

  createFolder: (version, folderPath) => {
    if (depthOf(folderPath) > 4) return;
    set((s) => {
      const existing = s.folders[version] ?? [NEWLY_ADDED];
      if (existing.includes(folderPath)) return s;
      return {
        folders: { ...s.folders, [version]: [...existing, folderPath] },
      };
    });
    get().save();
  },

  renameFolder: (version, oldPath, newPath) => {
    set((s) => {
      const folderList = s.folders[version] ?? [];
      const newFolders = folderList.map((f) => {
        if (f === oldPath) return newPath;
        if (f.startsWith(oldPath + "/")) return newPath + f.slice(oldPath.length);
        return f;
      });
      const newPlacements = { ...s.placements };
      for (const [flowPath, folder] of Object.entries(newPlacements)) {
        if (folder === oldPath) {
          newPlacements[flowPath] = newPath;
        } else if (folder.startsWith(oldPath + "/")) {
          newPlacements[flowPath] = newPath + folder.slice(oldPath.length);
        }
      }
      return {
        folders: { ...s.folders, [version]: newFolders },
        placements: newPlacements,
      };
    });
    get().save();
  },

  deleteFolder: (version, folderPath) => {
    set((s) => {
      const folderList = s.folders[version] ?? [];
      const newFolders = folderList.filter(
        (f) => f !== folderPath && !f.startsWith(folderPath + "/"),
      );
      return {
        folders: { ...s.folders, [version]: newFolders },
      };
    });
    get().save();
  },

  moveFolder: (version, sourcePath, targetPath) => {
    // Reparent folder: move sourcePath under targetPath
    const newBasePath = targetPath ? `${targetPath}/${sourcePath.split("/").pop()}` : sourcePath.split("/").pop()!;
    if (depthOf(newBasePath) > 4) return;
    // Prevent moving into self or descendant
    if (targetPath === sourcePath || targetPath.startsWith(sourcePath + "/")) return;
    set((s) => {
      const folderList = s.folders[version] ?? [];
      const newFolders = folderList.map((f) => {
        if (f === sourcePath) return newBasePath;
        if (f.startsWith(sourcePath + "/")) return newBasePath + f.slice(sourcePath.length);
        return f;
      });
      const newPlacements = { ...s.placements };
      for (const [flowPath, folder] of Object.entries(newPlacements)) {
        if (folder === sourcePath) {
          newPlacements[flowPath] = newBasePath;
        } else if (folder.startsWith(sourcePath + "/")) {
          newPlacements[flowPath] = newBasePath + folder.slice(sourcePath.length);
        }
      }
      return {
        folders: { ...s.folders, [version]: newFolders },
        placements: newPlacements,
      };
    });
    get().save();
  },

  moveScenario: (flowPath, targetFolder) => {
    set((s) => ({
      placements: { ...s.placements, [flowPath]: targetFolder },
    }));
    get().save();
  },

  placeNewScenarios: (flowPaths) => {
    set((s) => {
      const newPlacements = { ...s.placements };
      const newFolders = { ...s.folders };
      const newConfigs = { ...s.versionConfigs };
      const setup = useSetupStore.getState();

      for (const fp of flowPaths) {
        const version = extractVersion(fp);
        if (!version) continue;
        if (!newFolders[version]) {
          newFolders[version] = [NEWLY_ADDED];
          newConfigs[version] = {
            baseUrl: setup.baseUrl,
            apiVersion: setup.apiVersion,
          };
        }
        newPlacements[fp] = NEWLY_ADDED;
      }

      return {
        placements: newPlacements,
        folders: newFolders,
        versionConfigs: newConfigs,
      };
    });
    get().save();
  },

  clearPlacements: () => {
    set({ placements: {} });
    get().save();
  },

  reset: () => {
    loadStarted = false;
    set({ loaded: false, loading: false, versionConfigs: {}, folders: {}, placements: {} });
  },

  getVersionForFlow: (flowPath) => extractVersion(flowPath),

  getFolderForFlow: (flowPath) => {
    return get().placements[flowPath] ?? NEWLY_ADDED;
  },

  getFlowsInFolder: (version, folder) => {
    const { placements } = get();
    return Object.entries(placements)
      .filter(([fp, f]) => extractVersion(fp) === version && f === folder)
      .map(([fp]) => fp);
  },

  getVersions: () => {
    const { folders, placements } = get();
    const versions = new Set<string>();
    for (const v of Object.keys(folders)) versions.add(v);
    for (const fp of Object.keys(placements)) {
      const v = extractVersion(fp);
      if (v) versions.add(v);
    }
    return Array.from(versions).sort((a, b) => b.localeCompare(a));
  },
}));
