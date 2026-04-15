// Persists the set of test IDs that should pause the runner BEFORE executing.
// Lives in localStorage so breakpoints survive refreshes and re-registrations.
//
// Semantics: when a test whose id is in this set is about to run, the runner
// stops and waits for the user to click "Resume" in the Run Console. Useful
// for poking at external state (e.g. the Document360 admin UI) between steps.

import { create } from "zustand";

const STORAGE_KEY = "test_breakpoints";

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? new Set(arr.filter((x): x is string => typeof x === "string")) : new Set();
  } catch {
    return new Set();
  }
}

function save(ids: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    /* quota or privacy mode — fine to lose on next refresh */
  }
}

interface BreakpointsState {
  ids: Set<string>;
  has: (testId: string) => boolean;
  toggle: (testId: string) => void;
  clear: () => void;
}

export const useBreakpointsStore = create<BreakpointsState>((set, get) => ({
  ids: load(),
  has: (testId) => get().ids.has(testId),
  toggle: (testId) => {
    const next = new Set(get().ids);
    if (next.has(testId)) next.delete(testId); else next.add(testId);
    save(next);
    set({ ids: next });
  },
  clear: () => {
    save(new Set());
    set({ ids: new Set() });
  },
}));

/** Non-reactive read — use inside the runner loop. */
export function isBreakpointSet(testId: string): boolean {
  return useBreakpointsStore.getState().ids.has(testId);
}
