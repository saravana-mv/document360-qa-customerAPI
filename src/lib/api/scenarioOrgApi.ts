import { getProjectHeaders } from "./projectHeader";

interface ScenarioOrgPayload {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  versionConfigs: Record<string, any>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  scenarioConfigs?: Record<string, any>;
  folders: Record<string, string[]>;
  placements: Record<string, string>;
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

export async function getScenarioOrg(): Promise<ScenarioOrgPayload> {
  const res = await apiFetch("/api/scenario-org");
  return res.json() as Promise<ScenarioOrgPayload>;
}

export async function saveScenarioOrg(doc: ScenarioOrgPayload): Promise<void> {
  await apiFetch("/api/scenario-org", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  });
}
