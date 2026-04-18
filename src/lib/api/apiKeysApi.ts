// Frontend API client for FlowForge API key management.

import { getProjectHeaders } from "./projectHeader";

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getProjectHeaders(), ...init?.headers };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.clone().json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch {
      /* ignore */
    }
    throw new Error(msg);
  }
  return res;
}

export interface ApiKeyInfo {
  id: string;
  name: string;
  keyPrefix: string;
  versionId: string;
  authMethod: "oauth" | "apikey";
  createdBy: { oid: string; name: string };
  createdAt: string;
  lastUsedAt?: string;
}

export interface ApiKeyCreateResponse extends ApiKeyInfo {
  key: string;
}

export async function createApiKey(
  name: string,
  versionId: string,
  authMethod: "oauth" | "apikey",
): Promise<ApiKeyCreateResponse> {
  const res = await apiFetch("/api/api-keys", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, versionId, authMethod }),
  });
  return res.json() as Promise<ApiKeyCreateResponse>;
}

export async function listApiKeys(): Promise<ApiKeyInfo[]> {
  const res = await apiFetch("/api/api-keys");
  return res.json() as Promise<ApiKeyInfo[]>;
}

export async function revokeApiKey(id: string): Promise<void> {
  await apiFetch(`/api/api-keys/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
