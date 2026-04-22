// Project management store for FlowForge.
//
// Manages the list of projects and the currently selected project.
// The selected project ID is also kept in sync with setup.store
// (which provides it via the X-FlowForge-ProjectId header).

import { create } from "zustand";
import { listProjects, createProject, updateProject, archiveProject } from "../lib/api/projectsApi";
import type { ProjectDoc } from "../lib/api/projectsApi";
import { useSetupStore } from "./setup.store";

interface ProjectState {
  projects: ProjectDoc[];
  loading: boolean;
  error: string | null;
  /** Load projects from server */
  load: () => Promise<void>;
  /** Create a new project and select it */
  create: (name: string, description?: string) => Promise<ProjectDoc>;
  /** Update a project */
  update: (id: string, data: { name?: string; description?: string }) => Promise<void>;
  /** Archive (soft-delete) a project */
  archive: (id: string) => Promise<void>;
  /** Select a project — updates setup.store's selectedProjectId */
  select: (id: string) => void;
}

export const useProjectStore = create<ProjectState>((set, get) => ({
  projects: [],
  loading: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const projects = await listProjects();
      set({ projects, loading: false });

      // Auto-select if current selection is empty or doesn't exist in list
      const currentId = useSetupStore.getState().selectedProjectId;
      if (projects.length > 0 && (!currentId || !projects.some((p) => p.id === currentId))) {
        useSetupStore.getState().selectProject(projects[0].id);
      }
    } catch (e) {
      set({ loading: false, error: e instanceof Error ? e.message : String(e) });
    }
  },

  create: async (name, description) => {
    const doc = await createProject(name, description);
    set({ projects: [...get().projects, doc] });
    // Auto-select the newly created project
    useSetupStore.getState().selectProject(doc.id);
    return doc;
  },

  update: async (id, data) => {
    await updateProject(id, data);
    set({
      projects: get().projects.map((p) =>
        p.id === id ? { ...p, ...data, updatedAt: new Date().toISOString() } : p,
      ),
    });
  },

  archive: async (id) => {
    await archiveProject(id);
    const remaining = get().projects.filter((p) => p.id !== id);
    set({ projects: remaining });

    // If we archived the selected project, switch to first available
    const currentId = useSetupStore.getState().selectedProjectId;
    if (currentId === id && remaining.length > 0) {
      useSetupStore.getState().selectProject(remaining[0].id);
    }
  },

  select: (id) => {
    useSetupStore.getState().selectProject(id);
  },
}));
