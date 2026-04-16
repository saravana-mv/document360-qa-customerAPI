// User settings API — backed by Cosmos DB settings container.
// No X-FlowForge-ProjectId needed (settings store the project selection itself).

export interface UserSettings {
  selectedProjectId: string;
  selectedVersionId: string;
  langCode: string;
  baseUrl: string;
  apiVersion: string;
  aiModel: string;
  [key: string]: unknown;
}

const LEGACY_KEY = "setup_config";

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const res = await fetch(url, init);
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

/** Load user settings from the server */
export async function loadSettings(): Promise<Partial<UserSettings>> {
  const res = await apiFetch("/api/settings");
  return res.json() as Promise<Partial<UserSettings>>;
}

/** Save user settings to the server (merge — only sends changed fields) */
export async function saveSettings(settings: Partial<UserSettings>): Promise<void> {
  await apiFetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(settings),
  });
}

/**
 * Client-side migration: if localStorage has the old key, push to server
 * then delete. Returns the migrated settings (or empty if nothing to migrate).
 */
export async function migrateFromLocalStorage(): Promise<Partial<UserSettings>> {
  try {
    const raw = localStorage.getItem(LEGACY_KEY);
    if (!raw) return {};
    const saved = JSON.parse(raw) as Partial<UserSettings>;
    if (saved.selectedProjectId || saved.apiVersion || saved.aiModel) {
      await saveSettings(saved);
      localStorage.removeItem(LEGACY_KEY);
      console.log("[settingsApi] Migrated settings from localStorage");
      return saved;
    }
  } catch (e) {
    console.warn("[settingsApi] Migration from localStorage failed:", e);
  }
  return {};
}
