import { create } from "zustand";
import {
  getProjectVariables,
  saveProjectVariables,
  uploadFileVariable,
  deleteFileVariable,
  type ProjectVariable,
} from "../lib/api/projectVariablesApi";

interface ProjectVariablesState {
  variables: ProjectVariable[];
  loading: boolean;
  saving: boolean;
  error: string | null;

  /** Load variables from API */
  load: () => Promise<void>;

  /** Save variables to API (replaces all) */
  save: (variables: ProjectVariable[]) => Promise<void>;

  /** Upload a file variable */
  uploadFile: (name: string, file: File) => Promise<ProjectVariable>;

  /** Delete a file variable */
  deleteFile: (name: string) => Promise<void>;

  /** Get variables as a flat record for runtime interpolation */
  asRecord: () => Record<string, string>;

  /** Clear state (e.g., on project switch) */
  clear: () => void;
}

export const useProjectVariablesStore = create<ProjectVariablesState>((set, get) => ({
  variables: [],
  loading: false,
  saving: false,
  error: null,

  load: async () => {
    set({ loading: true, error: null });
    try {
      const variables = await getProjectVariables();
      set({ variables, loading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), loading: false });
    }
  },

  save: async (variables: ProjectVariable[]) => {
    set({ saving: true, error: null });
    try {
      await saveProjectVariables(variables);
      set({ variables, saving: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), saving: false });
      throw e;
    }
  },

  uploadFile: async (name: string, file: File) => {
    set({ saving: true, error: null });
    try {
      const updated = await uploadFileVariable(name, file);
      // Replace or add the variable in the local list
      const variables = get().variables.slice();
      const idx = variables.findIndex(v => v.name === name);
      if (idx >= 0) {
        variables[idx] = updated;
      } else {
        variables.push(updated);
      }
      set({ variables, saving: false });
      return updated;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), saving: false });
      throw e;
    }
  },

  deleteFile: async (name: string) => {
    set({ saving: true, error: null });
    try {
      await deleteFileVariable(name);
      const variables = get().variables.filter(v => v.name !== name);
      set({ variables, saving: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e), saving: false });
      throw e;
    }
  },

  asRecord: () => {
    const rec: Record<string, string> = {};
    for (const v of get().variables) {
      rec[v.name] = v.value;
    }
    return rec;
  },

  clear: () => set({ variables: [], loading: false, saving: false, error: null }),
}));
