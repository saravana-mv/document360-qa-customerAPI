import { create } from "zustand";
import type { Project } from "../types/api.types";
import { setApiBaseUrl, setApiVersion } from "../lib/api/client";
import { loadSettings, saveSettings, migrateFromLocalStorage } from "../lib/api/settingsApi";

const DEFAULT_BASE_URL = "";
const DEFAULT_API_VERSION = "v3";

export const AI_MODELS = [
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6 — recommended ($3 / $15 per Mtok)" },
  { id: "claude-opus-4-6",           label: "Opus 4.6 — most capable ($15 / $75 per Mtok)" },
] as const;
export type AiModelId = typeof AI_MODELS[number]["id"];
const DEFAULT_AI_MODEL: AiModelId = "claude-sonnet-4-6";

interface SetupState {
  projects: Project[];
  selectedProjectId: string;
  baseUrl: string;
  apiVersion: string;
  /** Model used for AI generation (flow ideas + flow XML). Persisted. */
  aiModel: AiModelId;
  /** Delay (ms) between steps within a scenario. 0 = no delay. */
  delayBetweenStepsMs: number;
  /** Delay (ms) between scenarios. 0 = no delay. */
  delayBetweenScenariosMs: number;
  /** Pre-configured base URL for HAR file filtering. Empty = show dropdown. */
  harBaseUrl: string;
  loadingProjects: boolean;
  /** True while loading settings from server on first auth */
  settingsLoaded: boolean;
  error: string | null;
  setProjects: (projects: Project[]) => void;
  selectProject: (id: string) => void;
  setBaseUrl: (url: string) => void;
  setApiVersion: (version: string) => void;
  setAiModel: (model: AiModelId) => void;
  setDelayBetweenStepsMs: (ms: number) => void;
  setDelayBetweenScenariosMs: (ms: number) => void;
  setHarBaseUrl: (url: string) => void;
  setLoadingProjects: (v: boolean) => void;
  setError: (error: string | null) => void;
  /** Call once after Entra auth is confirmed — loads settings from Cosmos */
  loadFromServer: () => Promise<void>;
}

// localStorage is still used as a fast local cache so the UI doesn't flash
// defaults on every page load. The server is the source of truth.
const LOCAL_CACHE_KEY = "setup_config";

function loadLocalCache(): Partial<SetupState> {
  try {
    const raw = localStorage.getItem(LOCAL_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const cached = loadLocalCache();

// Apply cached config immediately so the API client is configured before any calls.
const initialBaseUrl = (cached.baseUrl as string) || DEFAULT_BASE_URL;
const initialApiVersion = (cached.apiVersion as string) || DEFAULT_API_VERSION;
setApiBaseUrl(initialBaseUrl);
setApiVersion(initialApiVersion);

function persistLocal(state: Partial<SetupState>) {
  try {
    localStorage.setItem(LOCAL_CACHE_KEY, JSON.stringify({
      selectedProjectId: state.selectedProjectId ?? "",
      baseUrl: state.baseUrl ?? DEFAULT_BASE_URL,
      apiVersion: state.apiVersion ?? DEFAULT_API_VERSION,
      aiModel: state.aiModel ?? DEFAULT_AI_MODEL,
      delayBetweenStepsMs: state.delayBetweenStepsMs ?? 0,
      delayBetweenScenariosMs: state.delayBetweenScenariosMs ?? 0,
      harBaseUrl: state.harBaseUrl ?? "",
    }));
  } catch { /* quota exceeded — ignore */ }
}

function persistServer(state: Partial<SetupState>) {
  saveSettings({
    selectedProjectId: state.selectedProjectId ?? "",
    baseUrl: state.baseUrl ?? DEFAULT_BASE_URL,
    apiVersion: state.apiVersion ?? DEFAULT_API_VERSION,
    aiModel: state.aiModel ?? DEFAULT_AI_MODEL,
    delayBetweenStepsMs: state.delayBetweenStepsMs ?? 0,
    delayBetweenScenariosMs: state.delayBetweenScenariosMs ?? 0,
    harBaseUrl: state.harBaseUrl ?? "",
  }).catch((e) => console.warn("[setup.store] Failed to save settings:", e));
}

function persist(state: Partial<SetupState>) {
  persistLocal(state);
  persistServer(state);
}

export const useSetupStore = create<SetupState>((set, get) => ({
  projects: [],
  selectedProjectId: (cached.selectedProjectId as string) || "",
  baseUrl: initialBaseUrl,
  apiVersion: (cached.apiVersion as string) || DEFAULT_API_VERSION,
  aiModel: (AI_MODELS.some((m) => m.id === cached.aiModel) ? (cached.aiModel as AiModelId) : DEFAULT_AI_MODEL),
  delayBetweenStepsMs: typeof cached.delayBetweenStepsMs === "number" ? (cached.delayBetweenStepsMs as number) : 0,
  delayBetweenScenariosMs: typeof cached.delayBetweenScenariosMs === "number" ? (cached.delayBetweenScenariosMs as number) : 0,
  harBaseUrl: (cached.harBaseUrl as string) || "",
  loadingProjects: false,
  settingsLoaded: false,
  error: null,

  setProjects: (projects) => set({ projects }),

  selectProject: (id) => {
    set({ selectedProjectId: id });
    persist({ ...get(), selectedProjectId: id });
  },
  setBaseUrl: (url) => {
    const cleaned = url.replace(/\/$/, "");
    setApiBaseUrl(cleaned);
    set({ baseUrl: cleaned });
    persist({ ...get(), baseUrl: cleaned });
  },
  setApiVersion: (apiVersion) => {
    setApiVersion(apiVersion);
    set({ apiVersion });
    persist({ ...get(), apiVersion });
  },
  setAiModel: (aiModel) => {
    set({ aiModel });
    persist({ ...get(), aiModel });
  },
  setDelayBetweenStepsMs: (delayBetweenStepsMs) => {
    set({ delayBetweenStepsMs });
    persist({ ...get(), delayBetweenStepsMs });
  },
  setDelayBetweenScenariosMs: (delayBetweenScenariosMs) => {
    set({ delayBetweenScenariosMs });
    persist({ ...get(), delayBetweenScenariosMs });
  },
  setHarBaseUrl: (harBaseUrl) => {
    set({ harBaseUrl });
    persist({ ...get(), harBaseUrl });
  },

  setLoadingProjects: (v) => set({ loadingProjects: v }),
  setError: (error) => set({ error }),

  loadFromServer: async () => {
    try {
      // Migrate localStorage → server if the old key still exists
      await migrateFromLocalStorage();

      const remote = await loadSettings();
      if (!remote || Object.keys(remote).length === 0) {
        set({ settingsLoaded: true });
        return;
      }

      const updates: Partial<SetupState> = {};
      if (remote.selectedProjectId) updates.selectedProjectId = remote.selectedProjectId;
      if (remote.baseUrl) {
        updates.baseUrl = remote.baseUrl;
        setApiBaseUrl(remote.baseUrl);
      }
      if (remote.apiVersion) {
        updates.apiVersion = remote.apiVersion;
        setApiVersion(remote.apiVersion);
      }
      if (remote.aiModel && AI_MODELS.some((m) => m.id === remote.aiModel)) {
        updates.aiModel = remote.aiModel as AiModelId;
      }
      if (typeof remote.delayBetweenStepsMs === "number") {
        updates.delayBetweenStepsMs = remote.delayBetweenStepsMs as number;
      }
      if (typeof remote.delayBetweenScenariosMs === "number") {
        updates.delayBetweenScenariosMs = remote.delayBetweenScenariosMs as number;
      }
      if (remote.harBaseUrl) {
        updates.harBaseUrl = remote.harBaseUrl as string;
      }

      set({ ...updates, settingsLoaded: true });
      // Update local cache with server values
      persistLocal({ ...get(), ...updates });
    } catch (e) {
      console.warn("[setup.store] Failed to load settings from server:", e);
      set({ settingsLoaded: true });
    }
  },
}));
