import { create } from "zustand";
import type { Project, ProjectVersion } from "../types/api.types";
import { setApiBaseUrl, setApiVersion } from "../lib/api/client";

const DEFAULT_BASE_URL = "https://apihub.berlin.document360.net";
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
  versions: ProjectVersion[];
  selectedProjectId: string;
  selectedVersionId: string;
  langCode: string;
  baseUrl: string;
  apiVersion: string;
  /** Model used for AI generation (flow ideas + flow XML). Persisted. */
  aiModel: AiModelId;
  loadingProjects: boolean;
  loadingVersions: boolean;
  error: string | null;
  setProjects: (projects: Project[]) => void;
  setVersions: (versions: ProjectVersion[]) => void;
  selectProject: (id: string) => void;
  selectVersion: (id: string) => void;
  setLangCode: (lang: string) => void;
  setBaseUrl: (url: string) => void;
  setApiVersion: (version: string) => void;
  setAiModel: (model: AiModelId) => void;
  setLoadingProjects: (v: boolean) => void;
  setLoadingVersions: (v: boolean) => void;
  setError: (error: string | null) => void;
}

const STORAGE_KEY = "setup_config";

function loadSaved(): Partial<SetupState> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

const saved = loadSaved();

// Apply saved config immediately so the client is configured before any API calls.
const initialBaseUrl = (saved.baseUrl as string) || DEFAULT_BASE_URL;
const initialApiVersion = (saved.apiVersion as string) || DEFAULT_API_VERSION;
setApiBaseUrl(initialBaseUrl);
setApiVersion(initialApiVersion);

function persist(state: Partial<SetupState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    selectedProjectId: state.selectedProjectId ?? "",
    selectedVersionId: state.selectedVersionId ?? "",
    langCode: state.langCode ?? "en",
    baseUrl: state.baseUrl ?? DEFAULT_BASE_URL,
    apiVersion: state.apiVersion ?? DEFAULT_API_VERSION,
    aiModel: state.aiModel ?? DEFAULT_AI_MODEL,
  }));
}

export const useSetupStore = create<SetupState>((set, get) => ({
  projects: [],
  versions: [],
  selectedProjectId: (saved.selectedProjectId as string) || "",
  selectedVersionId: (saved.selectedVersionId as string) || "",
  langCode: (saved.langCode as string) || "en",
  baseUrl: initialBaseUrl,
  apiVersion: (saved.apiVersion as string) || DEFAULT_API_VERSION,
  aiModel: (AI_MODELS.some((m) => m.id === saved.aiModel) ? (saved.aiModel as AiModelId) : DEFAULT_AI_MODEL),
  loadingProjects: false,
  loadingVersions: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  setVersions: (versions) => set({ versions }),

  selectProject: (id) => {
    set({ selectedProjectId: id, selectedVersionId: "", versions: [] });
    persist({ ...get(), selectedProjectId: id });
  },
  selectVersion: (id) => {
    set({ selectedVersionId: id });
    persist({ ...get(), selectedVersionId: id });
  },
  setLangCode: (langCode) => {
    set({ langCode });
    persist({ ...get(), langCode });
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
  setLoadingVersions: (v) => set({ loadingVersions: v }),
  setError: (error) => set({ error }),
}));
