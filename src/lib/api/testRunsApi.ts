// Test run persistence API — save, list, get, delete completed runs.

import { getProjectHeaders } from "./projectHeader";
import type { TestResult, TagResult, RunSummary, LogEntry } from "../../types/test.types";

/** Step result from server-side API runs */
export interface ApiStepResult {
  number: number;
  name: string;
  status: "pass" | "fail" | "skip" | "error";
  httpStatus?: number;
  durationMs: number;
  failureReason?: string;
  assertionResults: Array<{ id: string; description: string; passed: boolean }>;
  requestUrl?: string;
  requestBody?: unknown;
  responseBody?: unknown;
}

export interface SavedTestRun {
  id: string;
  projectId: string;
  triggeredBy: { oid: string; name: string };
  startedAt: string;
  completedAt: string;
  summary: RunSummary;
  // UI runs
  tagResults?: Record<string, TagResult>;
  testResults?: Record<string, TestResult>;
  log?: LogEntry[];
  // API runs
  source?: "api" | "ui";
  scenarioId?: string;
  scenarioName?: string;
  steps?: ApiStepResult[];
}

export interface TestRunListItem {
  id: string;
  triggeredBy: { oid: string; name: string };
  startedAt: string;
  completedAt: string;
  summary: RunSummary;
  source?: "api" | "ui";
  scenarioName?: string;
  apiKeyName?: string;
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getProjectHeaders(), ...init?.headers };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

/** Save a completed test run */
export async function saveTestRun(run: {
  id: string;
  startedAt: string;
  completedAt: string;
  summary: RunSummary;
  tagResults: Record<string, TagResult>;
  testResults: Record<string, TestResult>;
  log: LogEntry[];
}): Promise<void> {
  await apiFetch("/api/test-runs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(run),
  });
}

/** List recent test runs (most recent first) */
export async function listTestRuns(limit = 20): Promise<TestRunListItem[]> {
  const res = await apiFetch(`/api/test-runs?limit=${limit}`);
  return res.json() as Promise<TestRunListItem[]>;
}

/** Get full details of a specific run */
export async function getTestRun(id: string): Promise<SavedTestRun> {
  const res = await apiFetch(`/api/test-runs/${encodeURIComponent(id)}`);
  return res.json() as Promise<SavedTestRun>;
}

/** Delete a test run */
export async function deleteTestRun(id: string): Promise<void> {
  await apiFetch(`/api/test-runs/${encodeURIComponent(id)}`, { method: "DELETE" });
}
