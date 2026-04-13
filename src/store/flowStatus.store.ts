// Tracks the runtime status of each .flow.xml file in the queue:
//   loading      → fetch in progress
//   implemented  → parsed and registered as runnable test(s)
//   invalid      → parse or registration failed (see error)

import { create } from "zustand";

export type FlowImplStatus = "loading" | "implemented" | "invalid";

export interface FlowStatusEntry {
  /** Blob name, e.g. "articles/article-version-lifecycle.flow.xml" */
  name: string;
  status: FlowImplStatus;
  /** Number of TestDefs registered (for implemented flows). */
  testCount?: number;
  /** Tag/flow display name (parsed from <name>). */
  flowName?: string;
  /** Human-readable error (for invalid flows). */
  error?: string;
}

interface FlowStatusState {
  /** Keyed by blob name. */
  byName: Record<string, FlowStatusEntry>;
  /** True while the loader is running. */
  loading: boolean;
  setEntry: (entry: FlowStatusEntry) => void;
  setLoading: (loading: boolean) => void;
  /** Drop status entries whose blob name is not in the given set. */
  pruneTo: (keepNames: Set<string>) => void;
  reset: () => void;
}

export const useFlowStatusStore = create<FlowStatusState>((set) => ({
  byName: {},
  loading: false,
  setEntry: (entry) => set((s) => ({ byName: { ...s.byName, [entry.name]: entry } })),
  setLoading: (loading) => set({ loading }),
  pruneTo: (keepNames) => set((s) => {
    const next: Record<string, FlowStatusEntry> = {};
    for (const [name, entry] of Object.entries(s.byName)) {
      if (keepNames.has(name)) next[name] = entry;
    }
    return { byName: next };
  }),
  reset: () => set({ byName: {}, loading: false }),
}));
