// Server-backed active-tests API. Replaces localStorage-based activeTests.ts.
// All functions are async (API calls) — callers must await.

import { getProjectHeaders } from "./projectHeader";

const LEGACY_KEY = "flowforge:active-tests";

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

export async function getActiveFlows(): Promise<Set<string>> {
  const res = await apiFetch("/api/active-tests");
  const data = await res.json() as { flows: string[] };
  return new Set(data.flows);
}

export async function isFlowActive(name: string): Promise<boolean> {
  const set = await getActiveFlows();
  return set.has(name);
}

export async function activateFlow(name: string): Promise<void> {
  await apiFetch("/api/active-tests/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flows: [name] }),
  });
}

export async function activateFlows(names: string[]): Promise<void> {
  if (names.length === 0) return;
  await apiFetch("/api/active-tests/activate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flows: names }),
  });
}

export async function deactivateFlow(name: string): Promise<void> {
  await apiFetch("/api/active-tests/deactivate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flows: [name] }),
  });
}

export async function deactivateAll(): Promise<void> {
  await apiFetch("/api/active-tests", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ flows: [] }),
  });
}

/**
 * Client-side migration: if localStorage still has the old key,
 * push it to the server and delete it. Call once on app startup.
 */
export async function migrateFromLocalStorage(): Promise<void> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return;
    const arr = JSON.parse(raw) as string[];
    if (arr.length > 0) {
      await apiFetch("/api/active-tests/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flows: arr }),
      });
    }
    localStorage.removeItem(LEGACY_KEY);
    console.log(`[activeTestsApi] Migrated ${arr.length} active tests from localStorage`);
  } catch (e) {
    console.warn("[activeTestsApi] Migration from localStorage failed:", e);
  }
}
