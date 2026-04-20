import { create } from "zustand";
import type { TestResult, TagResult, RunSummary, LogEntry, TestStatus, RollupStatus } from "../types/test.types";
import { getAllTests } from "../lib/tests/registry";

export interface PausedAt {
  testId: string;
  testName: string;
  tag: string;
}

export interface HistoryRunMeta {
  runId: string;
  startedAt: string;
  completedAt: string;
  triggeredBy: string;
  source?: "api" | "ui";
  scenarioName?: string;
}

interface RunnerState {
  running: boolean;
  cancelled: boolean;
  paused: boolean;
  pausedAt: PausedAt | null;
  tagResults: Record<string, TagResult>;
  testResults: Record<string, TestResult>;
  log: LogEntry[];
  summary: RunSummary | null;
  selectedTags: Set<string>;
  selectedTests: Set<string>;
  selectedTestId: string | null;
  /** Non-null when viewing a past run from Run History */
  viewingHistory: HistoryRunMeta | null;

  startRun: () => void;
  cancelRun: () => void;
  enterPause: (info: PausedAt) => Promise<void>;
  resume: () => void;
  resetRun: () => void;
  fullReset: () => void;
  loadHistoryRun: (meta: HistoryRunMeta, data: {
    testResults: Record<string, TestResult>;
    tagResults: Record<string, TagResult>;
    log: LogEntry[];
    summary: RunSummary;
  }) => void;
  clearHistoryView: () => void;
  selectTest: (id: string | null) => void;
  selectSingleTest: (id: string) => void;
  updateTestStatus: (testId: string, update: Partial<TestResult>) => void;
  updateTagStatus: (tag: string, status: RollupStatus, durationMs?: number) => void;
  appendLog: (entry: Omit<LogEntry, "id" | "timestamp">) => void;
  setSummary: (summary: RunSummary) => void;
  toggleTagSelection: (tag: string) => void;
  /** Exclusive select: clear all, select only this flow */
  selectFlow: (tag: string, testIds: string[]) => void;
  /** Additive toggle: add/remove flow from selection (Ctrl+click) */
  toggleFlowSelection: (tag: string, testIds: string[]) => void;
  toggleTestSelection: (testId: string) => void;
  selectAll: () => void;
  clearSelection: () => void;
  initTests: (tests: Array<{ id: string; name: string; tag: string; path: string; method: string }>) => void;
}

let logIdCounter = 0;

// Resolver for the in-flight pause. Held outside the store so the store stays
// JSON-serialisable for devtools. enterPause() creates a new promise + resolver
// pair; resume() invokes the resolver to release the awaiting runner step.
let pauseResolver: (() => void) | null = null;

export const useRunnerStore = create<RunnerState>((set) => ({
  running: false,
  cancelled: false,
  paused: false,
  pausedAt: null,
  tagResults: {},
  testResults: {},
  log: [],
  summary: null,
  selectedTags: new Set(),
  selectedTests: new Set(),
  selectedTestId: null,
  viewingHistory: null,

  startRun: () => set({ running: true, cancelled: false, paused: false, pausedAt: null, summary: null, viewingHistory: null }),
  cancelRun: () => {
    // If we're paused waiting on a breakpoint, releasing the resolver lets the
    // runner loop wake up and observe `cancelled` so it can skip cleanly.
    if (pauseResolver) {
      const r = pauseResolver;
      pauseResolver = null;
      r();
    }
    set({ cancelled: true, paused: false, pausedAt: null });
  },
  enterPause: (info) => {
    set({ paused: true, pausedAt: info });
    return new Promise<void>((resolve) => {
      pauseResolver = resolve;
    });
  },
  resume: () => {
    const r = pauseResolver;
    pauseResolver = null;
    set({ paused: false, pausedAt: null });
    if (r) r();
  },
  resetRun: () => {
    pauseResolver = null;
    set({ running: false, cancelled: false, paused: false, pausedAt: null, tagResults: {}, testResults: {}, log: [], summary: null, viewingHistory: null });
  },
  fullReset: () => {
    pauseResolver = null;
    set({
      running: false,
      cancelled: false,
      paused: false,
      pausedAt: null,
      tagResults: {},
      testResults: {},
      log: [],
      summary: null,
      selectedTags: new Set(),
      selectedTests: new Set(),
      selectedTestId: null,
      viewingHistory: null,
    });
  },
  loadHistoryRun: (meta, data) => {
    pauseResolver = null;
    // Derive selections from the loaded results so the tree highlights them
    const selectedTests = new Set(Object.keys(data.testResults));
    const selectedTags = new Set(Object.keys(data.tagResults));
    set({
      running: false,
      cancelled: false,
      paused: false,
      pausedAt: null,
      testResults: data.testResults,
      tagResults: data.tagResults,
      log: data.log,
      summary: data.summary,
      viewingHistory: meta,
      selectedTests,
      selectedTags,
      selectedTestId: null,
    });
  },
  clearHistoryView: () => {
    pauseResolver = null;
    set({
      running: false,
      cancelled: false,
      paused: false,
      pausedAt: null,
      tagResults: {},
      testResults: {},
      log: [],
      summary: null,
      viewingHistory: null,
      selectedTestId: null,
    });
  },
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

  selectFlow: (tag, testIds) =>
    set(() => ({
      selectedTags: new Set([tag]),
      selectedTests: new Set(testIds),
      selectedTestId: testIds[0] ?? null,
    })),

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
