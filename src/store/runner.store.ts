import { create } from "zustand";
import type { TestResult, TagResult, RunSummary, LogEntry, TestStatus, RollupStatus } from "../types/test.types";

interface RunnerState {
  running: boolean;
  cancelled: boolean;
  tagResults: Record<string, TagResult>;
  testResults: Record<string, TestResult>;
  log: LogEntry[];
  summary: RunSummary | null;
  selectedTags: Set<string>;
  selectedTests: Set<string>;

  startRun: () => void;
  cancelRun: () => void;
  resetRun: () => void;
  updateTestStatus: (testId: string, update: Partial<TestResult>) => void;
  updateTagStatus: (tag: string, status: RollupStatus, durationMs?: number) => void;
  appendLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  setSummary: (summary: RunSummary) => void;
  toggleTagSelection: (tag: string) => void;
  toggleTestSelection: (testId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  initTests: (tests: Array<{ id: string; name: string; tag: string; path: string; method: string }>) => void;
}

let logIdCounter = 0;

export const useRunnerStore = create<RunnerState>((set, get) => ({
  running: false,
  cancelled: false,
  tagResults: {},
  testResults: {},
  log: [],
  summary: null,
  selectedTags: new Set(),
  selectedTests: new Set(),

  startRun: () => set({ running: true, cancelled: false, summary: null }),
  cancelRun: () => set({ cancelled: true }),
  resetRun: () => set({ running: false, cancelled: false, tagResults: {}, testResults: {}, log: [], summary: null }),

  updateTestStatus: (testId, update) =>
    set((state) => ({
      testResults: {
        ...state.testResults,
        [testId]: { ...state.testResults[testId], ...update },
      },
    })),

  updateTagStatus: (tag, status, durationMs) =>
    set((state) => ({
      tagResults: {
        ...state.tagResults,
        [tag]: { ...state.tagResults[tag], tag, status, ...(durationMs !== undefined ? { durationMs } : {}) },
      },
    })),

  appendLog: (entry) => {
    const logEntry: LogEntry = {
      ...entry,
      id: `log-${++logIdCounter}`,
      timestamp: Date.now(),
    };
    set((state) => ({ log: [...state.log, logEntry] }));
  },

  setSummary: (summary) => set({ summary, running: false }),

  toggleTagSelection: (tag) =>
    set((state) => {
      const next = new Set(state.selectedTags);
      if (next.has(tag)) next.delete(tag);
      else next.add(tag);
      return { selectedTags: next };
    }),

  toggleTestSelection: (testId) =>
    set((state) => {
      const next = new Set(state.selectedTests);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return { selectedTests: next };
    }),

  selectAll: () => {
    const allTestIds = Object.keys(get().testResults);
    const allTags = Object.keys(get().tagResults);
    set({ selectedTests: new Set(allTestIds), selectedTags: new Set(allTags) });
  },

  clearSelection: () => set({ selectedTags: new Set(), selectedTests: new Set() }),

  initTests: (tests) => {
    const testResults: Record<string, TestResult> = {};
    const tagResults: Record<string, TagResult> = {};

    for (const t of tests) {
      testResults[t.id] = {
        testId: t.id,
        testName: t.name,
        tag: t.tag,
        path: t.path,
        method: t.method as never,
        status: "idle" as TestStatus,
        assertionResults: [],
      };
      if (!tagResults[t.tag]) {
        tagResults[t.tag] = { tag: t.tag, status: "idle" as RollupStatus, tests: [] };
      }
      tagResults[t.tag].tests.push(testResults[t.id]);
    }

    set({ testResults, tagResults });
  },
}));
