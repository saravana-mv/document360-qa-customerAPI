import { create } from "zustand";
import type { Project, ProjectVersion } from "../types/api.types";

interface SetupState {
  projects: Project[];
  versions: ProjectVersion[];
  selectedProjectId: string;
  selectedVersionId: string;
  langCode: string;
  articleId: string;
  loadingProjects: boolean;
  loadingVersions: boolean;
  error: string | null;
  setProjects: (projects: Project[]) => void;
  setVersions: (versions: ProjectVersion[]) => void;
  selectProject: (id: string) => void;
  selectVersion: (id: string) => void;
  setLangCode: (lang: string) => void;
  setArticleId: (id: string) => void;
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

export const useSetupStore = create<SetupState>((set, get) => ({
  projects: [],
  versions: [],
  selectedProjectId: (saved.selectedProjectId as string) || "",
  selectedVersionId: (saved.selectedVersionId as string) || "",
  langCode: (saved.langCode as string) || "en",
  articleId: (saved.articleId as string) || "",
  loadingProjects: false,
  loadingVersions: false,
  error: null,

  setProjects: (projects) => set({ projects }),
  setVersions: (versions) => set({ versions }),
  selectProject: (id) => {
    set({ selectedProjectId: id, selectedVersionId: "", versions: [] });
    const s = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedProjectId: id,
      selectedVersionId: s.selectedVersionId,
      langCode: s.langCode,
      articleId: s.articleId,
    }));
  },
  selectVersion: (id) => {
    set({ selectedVersionId: id });
    const s = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedProjectId: s.selectedProjectId,
      selectedVersionId: id,
      langCode: s.langCode,
      articleId: s.articleId,
    }));
  },
  setLangCode: (langCode) => {
    set({ langCode });
    const s = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedProjectId: s.selectedProjectId,
      selectedVersionId: s.selectedVersionId,
      langCode,
      articleId: s.articleId,
    }));
  },
  setArticleId: (articleId) => {
    set({ articleId });
    const s = get();
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      selectedProjectId: s.selectedProjectId,
      selectedVersionId: s.selectedVersionId,
      langCode: s.langCode,
      articleId,
    }));
  },
  setLoadingProjects: (v) => set({ loadingProjects: v }),
  setLoadingVersions: (v) => set({ loadingVersions: v }),
  setError: (error) => set({ error }),
}));
