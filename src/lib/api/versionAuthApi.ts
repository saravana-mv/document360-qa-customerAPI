// Client-side API for per-version auth (credential storage + status)

import type { AuthType } from "../../types/test.types";

export interface SaveCredentialPayload {
  version: string;
  authType: AuthType;
  credential: string;
  authHeaderName?: string;
  authQueryParam?: string;
}

export async function saveCredential(payload: SaveCredentialPayload): Promise<void> {
  const res = await fetch("/api/version-auth/credential", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) ?? `HTTP ${res.status}`);
  }
}

export async function deleteCredential(version: string): Promise<void> {
  const res = await fetch(`/api/version-auth/credential?version=${encodeURIComponent(version)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) ?? `HTTP ${res.status}`);
  }
}

export interface VersionAuthStatus {
  configured: boolean;
  authType: AuthType;
  version: string;
}

export async function getVersionAuthStatus(version: string): Promise<VersionAuthStatus> {
  const res = await fetch(`/api/version-auth/status?version=${encodeURIComponent(version)}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as VersionAuthStatus;
}

// Legacy aliases for backward compatibility during migration
export const saveApiKey = (version: string, apiKey: string) =>
  saveCredential({ version, authType: "apikey_header", credential: apiKey, authHeaderName: "api_token" });
export const deleteApiKey = (version: string) => deleteCredential(version);
