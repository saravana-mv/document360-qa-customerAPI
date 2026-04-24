import { create } from "zustand";
import type { Project } from "../types/api.types";
import { setApiBaseUrl, setApiVersion } from "../lib/api/client";
import { loadSettings, saveSettings, migrateFromLocalStorage } from "../lib/api/settingsApi";

const DEFAULT_BASE_URL = "";
const DEFAULT_API_VERSION = "v3";

export const AI_MODELS = [
  { id: "claude-opus-4-6",           label: "Opus 4.6 ($15 / $75 per Mtok)" },
  { id: "claude-sonnet-4-6",         label: "Sonnet 4.6 ($3 / $15 per Mtok)" },
  { id: "claude-haiku-4-5-20251001", label: "Haiku 4.5 ($1 / $5 per Mtok)" },
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
  loadingProjects: boolean;
  /** True while loading settings from server on first auth */
  settingsLoaded: boolean;
  error: string | null;
  setProjects: (projects: Project[]) => void;
  selectProject: (id: string) => void;
  setBaseUrl: (url: string) => void;
  setApiVersion: (version: string) => void;
  setAiModel: (model: AiModelId) => void;
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
    }));
  } catch { /* quota exceeded — ignore */ }
}

function persistServer(state: Partial<SetupState>) {
  saveSettings({
    selectedProjectId: state.selectedProjectId ?? "",
    baseUrl: state.baseUrl ?? DEFAULT_BASE_URL,
    apiVersion: state.apiVersion ?? DEFAULT_API_VERSION,
    aiModel: state.aiModel ?? DEFAULT_AI_MODEL,
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

      set({ ...updates, settingsLoaded: true });
      // Update local cache with server values
      persistLocal({ ...get(), ...updates });
    } catch (e) {
      console.warn("[setup.store] Failed to load settings from server:", e);
      set({ settingsLoaded: true });
    }
  },
}));
