// Client-side API for per-version auth (API key storage + status)

export async function saveApiKey(version: string, apiKey: string): Promise<void> {
  const res = await fetch("/api/version-auth/apikey", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ version, apiKey }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) ?? `HTTP ${res.status}`);
  }
}

export async function deleteApiKey(version: string): Promise<void> {
  const res = await fetch(`/api/version-auth/apikey?version=${encodeURIComponent(version)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) ?? `HTTP ${res.status}`);
  }
}

export interface VersionAuthStatus {
  configured: boolean;
  method: "oauth" | "apikey";
  version: string;
}

export async function getVersionAuthStatus(version: string): Promise<VersionAuthStatus> {
  const res = await fetch(`/api/version-auth/status?version=${encodeURIComponent(version)}`);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return (await res.json()) as VersionAuthStatus;
}
