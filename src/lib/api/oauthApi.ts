// Frontend API client for generic OAuth endpoints.

export interface OAuthStatus {
  authenticated: boolean;
  expiresAt?: number;
  expired?: boolean;
  expiresInMs?: number;
  hasRefreshToken?: boolean;
  canAutoRefresh?: boolean;
  lastRefreshedAt?: number;
}

export interface HealthCheckResult {
  healthy: boolean;
  reason?: string;
  accessTokenValid?: boolean;
  expiresAt?: number;
  expiresInMs?: number;
  hasRefreshToken?: boolean;
  lastRefreshedAt?: number;
  checkedAt?: number;
}

export async function exchangeOAuthCode(payload: {
  connectionId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
}): Promise<{ authenticated: boolean; expiresAt: number }> {
  const res = await fetch("/api/oauth/exchange", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ authenticated: boolean; expiresAt: number }>;
}

export async function getOAuthStatus(connectionId: string): Promise<OAuthStatus> {
  const res = await fetch(`/api/oauth/status/${connectionId}`);
  if (!res.ok) return { authenticated: false };
  return res.json() as Promise<OAuthStatus>;
}

export async function logoutOAuth(connectionId: string): Promise<void> {
  await fetch(`/api/oauth/logout/${connectionId}`, { method: "POST" });
}

export async function refreshOAuth(connectionId: string): Promise<{ refreshed: boolean; expiresAt: number }> {
  const res = await fetch(`/api/oauth/refresh/${connectionId}`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Refresh failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<{ refreshed: boolean; expiresAt: number }>;
}

export async function healthCheckOAuth(connectionId: string): Promise<HealthCheckResult> {
  const res = await fetch(`/api/oauth/health-check/${connectionId}`, { method: "POST" });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Health check failed: ${res.status} ${text}`);
  }
  return res.json() as Promise<HealthCheckResult>;
}
