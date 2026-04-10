import { create } from "zustand";
import type { Project, ProjectVersion } from "../types/api.types";
import { setApiBaseUrl } from "../lib/api/client";

const DEFAULT_BASE_URL = "https://apihub.berlin.document360.net";
const DEFAULT_API_VERSION = "v3";

interface SetupState {
  projects: Project[];
  versions: ProjectVersion[];
  selectedProjectId: string;
  selectedVersionId: string;
  langCode: string;
  baseUrl: string;
  apiVersion: string;
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

// Apply saved base URL immediately so the client is configured before any API calls.
const initialBaseUrl = (saved.baseUrl as string) || DEFAULT_BASE_URL;
setApiBaseUrl(initialBaseUrl);

function persist(state: Partial<SetupState>) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({
    selectedProjectId: state.selectedProjectId ?? "",
    selectedVersionId: state.selectedVersionId ?? "",
    langCode: state.langCode ?? "en",
    baseUrl: state.baseUrl ?? DEFAULT_BASE_URL,
    apiVersion: state.apiVersion ?? DEFAULT_API_VERSION,
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
    set({ apiVersion });
    persist({ ...get(), apiVersion });
  },

  setLoadingProjects: (v) => set({ loadingProjects: v }),
  setLoadingVersions: (v) => set({ loadingVersions: v }),
  setError: (error) => set({ error }),
}));
