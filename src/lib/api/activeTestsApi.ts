// Server-backed active-tests API (Cosmos DB).
// All functions are async (API calls) — callers must await.

import { getProjectHeaders } from "./projectHeader";

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

