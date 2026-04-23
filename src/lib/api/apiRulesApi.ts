// Client-side API for project-level API Rules.

import { getProjectHeaders } from "./projectHeader";

export interface ApiRulesData {
  rules: string;
  enumAliases: string;
}

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
