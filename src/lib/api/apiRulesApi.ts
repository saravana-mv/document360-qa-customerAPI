// Client-side API for API Rules — version-folder-level (blob) and project-level (Cosmos) fallback.

import { getProjectHeaders } from "./projectHeader";

export interface ApiRulesData {
  rules: string;
  enumAliases: string;
}

// ── Project-level (legacy fallback) ──────────────────────────────────────────

export async function fetchApiRules(): Promise<ApiRulesData> {
  const headers = getProjectHeaders();
  const res = await fetch("/api/api-rules", { headers: { "Content-Type": "application/json", ...headers } });
  if (!res.ok) return { rules: "", enumAliases: "" };
  return res.json();
}

export async function saveApiRules(data: ApiRulesData): Promise<void> {
  const headers = getProjectHeaders();
  const res = await fetch("/api/api-rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to save API rules");
  }
}

// ── Version-folder-level (blob-based, preferred) ────────────────────────────

export async function fetchFolderApiRules(folder: string): Promise<ApiRulesData> {
  const headers = getProjectHeaders();
  const res = await fetch(`/api/spec-files/rules?folder=${encodeURIComponent(folder)}`, {
    headers: { "Content-Type": "application/json", ...headers },
  });
  if (!res.ok) return { rules: "", enumAliases: "" };
  return res.json();
}

export async function saveFolderApiRules(folder: string, data: ApiRulesData): Promise<void> {
  const headers = getProjectHeaders();
  const res = await fetch("/api/spec-files/rules", {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ folder, ...data }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error?: string }).error ?? "Failed to save API rules");
  }
}
