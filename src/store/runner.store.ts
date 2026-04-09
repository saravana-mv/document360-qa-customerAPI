import { create } from "zustand";
import type { TestResult, TagResult, RunSummary, LogEntry, TestStatus, RollupStatus } from "../types/test.types";
import { getAllTests } from "../lib/tests/registry";

interface RunnerState {
  running: boolean;
  cancelled: boolean;
  tagResults: Record<string, TagResult>;
  testResults: Record<string, TestResult>;
  log: LogEntry[];
  summary: RunSummary | null;
  selectedTags: Set<string>;
  selectedTests: Set<string>;
  selectedTestId: string | null;

  startRun: () => void;
  cancelRun: () => void;
  resetRun: () => void;
  selectTest: (id: string | null) => void;
  selectSingleTest: (id: string) => void;
  updateTestStatus: (testId: string, update: Partial<TestResult>) => void;
  updateTagStatus: (tag: string, status: RollupStatus, durationMs?: number) => void;
  appendLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  setSummary: (summary: RunSummary) => void;
  toggleTagSelection: (tag: string) => void;
  toggleFlowSelection: (tag: string, testIds: string[]) => void;
  toggleTestSelection: (testId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  initTests: (tests: Array<{ id: string; name: string; tag: string; path: string; method: string }>) => void;
}

let logIdCounter = 0;

export const useRunnerStore = create<RunnerState>((set) => ({
  running: false,
  cancelled: false,
  tagResults: {},
  testResults: {},
  log: [],
  summary: null,
  selectedTags: new Set(),
  selectedTests: new Set(),
  selectedTestId: null,

  startRun: () => set({ running: true, cancelled: false, summary: null }),
  cancelRun: () => set({ cancelled: true }),
  resetRun: () => set({ running: false, cancelled: false, tagResults: {}, testResults: {}, log: [], summary: null }),
  selectTest: (id) => set({ selectedTestId: id }),

  // Exclusive: deselects everything, selects only this test, opens detail pane
  selectSingleTest: (id) => set({
    selectedTests: new Set([id]),
    selectedTags: new Set(),
    selectedTestId: id,
  }),

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

  toggleFlowSelection: (tag, testIds) =>
    set((state) => {
      const tags = new Set(state.selectedTags);
      const tests = new Set(state.selectedTests);
      if (tags.has(tag)) {
        tags.delete(tag);
        for (const id of testIds) tests.delete(id);
      } else {
        tags.add(tag);
        for (const id of testIds) tests.add(id);
      }
      // Close detail pane when switching to flow-level selection
      return { selectedTags: tags, selectedTests: tests, selectedTestId: null };
    }),

  toggleTestSelection: (testId) =>
    set((state) => {
      const next = new Set(state.selectedTests);
      if (next.has(testId)) next.delete(testId);
      else next.add(testId);
      return { selectedTests: next };
    }),

  selectAll: () => {
    const all = getAllTests();
    set({
      selectedTests: new Set(all.map((t) => t.id)),
      selectedTags: new Set(all.map((t) => t.tag)),
    });
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
