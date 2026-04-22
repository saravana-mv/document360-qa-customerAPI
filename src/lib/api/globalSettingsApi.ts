// API client for global (tenant-level) settings — Super Owner only.

export interface AiCreditDefaults {
  projectDefault: number;
  userDefault: number;
}

export interface GlobalSettings {
  aiCredits: AiCreditDefaults;
  updatedAt: string;
  updatedBy: string;
}

const BASE = "/api/global-settings";

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`);
  }
  return res;
}

export async function getGlobalSettings(): Promise<GlobalSettings> {
  const res = await apiFetch(BASE);
  return res.json() as Promise<GlobalSettings>;
}

export async function updateGlobalSettings(data: { aiCredits?: Partial<AiCreditDefaults> }): Promise<GlobalSettings> {
  const res = await apiFetch(BASE, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return res.json() as Promise<GlobalSettings>;
}
