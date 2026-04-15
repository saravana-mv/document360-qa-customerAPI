// D360 OAuth token helpers used by the proxy + auth functions.
// Handles the refresh-token dance so callers can always get a fresh access
// token without worrying about expiry.

import { getTokenRow, putTokenRow, type D360TokenRow } from "./tokenStore";

const D360_TOKEN_URL =
  process.env.D360_TOKEN_URL ?? "https://identity.berlin.document360.net/connect/token";
const D360_CLIENT_ID = process.env.D360_CLIENT_ID ?? "apiHubWordClient";

// Refresh a token that's within this many ms of expiry to avoid thrashing
// right at the boundary.
const REFRESH_SKEW_MS = 60_000;

interface D360RefreshResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
}

function extractProjectId(accessToken: string): string {
  try {
    const part = accessToken.split(".")[1];
    if (!part) return "";
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    const claims = JSON.parse(Buffer.from(padded, "base64").toString("utf8")) as Record<string, unknown>;
    return (claims.doc360_project_id as string) || "";
  } catch {
    return "";
  }
}

async function callRefreshEndpoint(refreshToken: string): Promise<D360RefreshResponse> {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    client_id: D360_CLIENT_ID,
  });
  const res = await fetch(D360_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`D360 refresh failed (${res.status}): ${text}`);
  }
  return (await res.json()) as D360RefreshResponse;
}

/**
 * Returns a currently-valid access token for the given user. Refreshes in
 * place via the stored refresh_token if the access token is expired or about
 * to expire. Throws if no row exists or refresh is impossible.
 */
export async function getValidAccessToken(oid: string): Promise<{ accessToken: string; row: D360TokenRow }> {
  const row = await getTokenRow(oid);
  if (!row) throw new Error("D360_NOT_AUTHENTICATED");

  if (row.expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return { accessToken: row.accessToken, row };
  }

  if (!row.refreshToken) {
    throw new Error("D360_REFRESH_UNAVAILABLE");
  }

  const refreshed = await callRefreshEndpoint(row.refreshToken);
  const expiresAt = Date.now() + (refreshed.expires_in ?? 3600) * 1000;
  const newRow: D360TokenRow = {
    ...row,
    accessToken: refreshed.access_token,
    // Most identity servers rotate refresh tokens; fall back to the existing
    // one if the response didn't include a fresh one.
    refreshToken: refreshed.refresh_token ?? row.refreshToken,
    expiresAt,
    projectId: extractProjectId(refreshed.access_token) || row.projectId,
    updatedAt: Date.now(),
  };
  await putTokenRow(oid, {
    accessToken: newRow.accessToken,
    refreshToken: newRow.refreshToken,
    expiresAt: newRow.expiresAt,
    projectId: newRow.projectId,
  });
  return { accessToken: newRow.accessToken, row: newRow };
}
