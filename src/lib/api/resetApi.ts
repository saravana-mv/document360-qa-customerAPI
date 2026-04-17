// Full project data reset — clears all Cosmos data + localStorage caches.

import { getProjectHeaders } from "./projectHeader";

/** All localStorage keys used by the app (excluding auth which is managed separately) */
const APP_LOCAL_STORAGE_KEYS = [
  "setup_config",
  "explorerSortOrder",
  "explorerExpandedVersions",
  "explorerExpandedFolders",
  "specfiles_selected_path",
  "specfiles_selected_folder_path",
  "flowforge:active-tests",
  "specfiles_workshop_v2",
  "specfiles_workshop",
  "spec_fingerprint",
  "oauth_config",
];

/** Clear all app-related localStorage keys */
export function clearAppLocalStorage(): void {
  for (const key of APP_LOCAL_STORAGE_KEYS) {
    localStorage.removeItem(key);
  }
}

/** Reset all project data on the server (Cosmos DB) */
export async function resetProjectData(): Promise<{ deleted: { flows: number; ideas: number; testRuns: number } }> {
  const res = await fetch("/api/reset-project", {
    method: "DELETE",
    headers: { ...getProjectHeaders() },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) ?? `HTTP ${res.status}`);
  }
  return (await res.json()) as { deleted: { flows: number; ideas: number; testRuns: number } };
}

/** Full reset: server data + localStorage + page reload */
export async function fullProjectReset(): Promise<void> {
  await resetProjectData();
  clearAppLocalStorage();
  window.location.reload();
}
