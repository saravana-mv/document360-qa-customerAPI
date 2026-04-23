// Project management store for FlowForge.
//
// Manages the list of projects and the currently selected project.
// The selected project ID is also kept in sync with setup.store
// (which provides it via the X-FlowForge-ProjectId header).

import { create } from "zustand";
import { listProjects, createProject, updateProject, deleteProject } from "../lib/api/projectsApi";
import type { ProjectDoc } from "../lib/api/projectsApi";
import { useSetupStore } from "./setup.store";
import { useAiCreditsStore } from "./aiCredits.store";
import { useProjectVariablesStore } from "./projectVariables.store";
import { useFlowStatusStore } from "./flowStatus.store";
import { useSpecStore } from "./spec.store";
import { useScenarioOrgStore } from "./scenarioOrg.store";
import { useRunnerStore } from "./runner.store";
import { useAiCostStore } from "./aiCost.store";
import { clearRegistry } from "../lib/tests/registry";
import { loadFlowsFromQueue } from "../lib/tests/flowXml/loader";

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
  /** Permanently delete a project and all its resources */
  remove: (id: string) => Promise<void>;
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
        useAiCreditsStore.getState().loadCredits(projects[0].id);
        useProjectVariablesStore.getState().load();
      } else if (currentId) {
        useAiCreditsStore.getState().loadCredits(currentId);
        useProjectVariablesStore.getState().load();
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
    useAiCreditsStore.getState().loadCredits(doc.id);
    useProjectVariablesStore.getState().load();
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

  remove: async (id) => {
    await deleteProject(id);
    const remaining = get().projects.filter((p) => p.id !== id);
    set({ projects: remaining });

    // If we deleted the selected project, switch to first available or clear
    const currentId = useSetupStore.getState().selectedProjectId;
    if (currentId === id) {
      if (remaining.length > 0) {
        useSetupStore.getState().selectProject(remaining[0].id);
      } else {
        useSetupStore.getState().selectProject("");
      }
    }
  },

  select: (id) => {
    const prevId = useSetupStore.getState().selectedProjectId;
    useSetupStore.getState().selectProject(id);

    if (id) {
      // Reset all project-scoped stores when switching to a different project
      if (id !== prevId) {
        // Clear test registry and flow statuses
        clearRegistry();
        useFlowStatusStore.getState().reset();
        // Clear spec/parsed tags
        useSpecStore.getState().setSpec(null, [], null);
        // Reset scenario org (clears loadStarted guard)
        useScenarioOrgStore.getState().reset();
        // Reset runner state
        useRunnerStore.getState().resetRun();
        useRunnerStore.getState().clearSelection();
        useRunnerStore.getState().clearHistoryView();
        // Reset AI cost tracking
        useAiCostStore.getState().setWorkshopCost(0);
      }

      // Load fresh data for the new project
      useAiCreditsStore.getState().loadCredits(id);
      useProjectVariablesStore.getState().load();

      // Reload flow files for the new project
      if (id !== prevId) {
        void loadFlowsFromQueue();
      }
    } else {
      useAiCreditsStore.getState().clear();
      useProjectVariablesStore.getState().clear();
    }
  },
}));
