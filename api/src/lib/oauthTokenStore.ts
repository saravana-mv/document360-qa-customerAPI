// Generic OAuth token store, backed by Azure Table Storage.
// Row key format: {oid}:{connectionId} — one row per user per connection.
//
// This supports any OAuth
// connection registered in the connections Cosmos container.

import { TableClient, RestError } from "@azure/data-tables";
import { getConnectionsContainer } from "./cosmosClient";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const TABLE_NAME = "oauthtokens";

export interface OAuthTokenRow {
  oid: string;
  connectionId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

interface OAuthTokenEntity {
  partitionKey: string;   // oid
  rowKey: string;         // connectionId
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  createdAt: number;
  updatedAt: number;
}

let _cachedClient: TableClient | null = null;
let _tableEnsured = false;

function getClient(): TableClient {
  if (_cachedClient) return _cachedClient;
  if (!CONNECTION_STRING) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  _cachedClient = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME, {
    allowInsecureConnection: CONNECTION_STRING.includes("UseDevelopmentStorage=true"),
  });
  return _cachedClient;
}

async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await getClient().createTable();
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 409) { /* already exists */ }
    else throw e;
  }
  _tableEnsured = true;
}

function entityToRow(e: OAuthTokenEntity): OAuthTokenRow {
  return {
    oid: e.partitionKey,
    connectionId: e.rowKey,
    accessToken: e.accessToken,
    refreshToken: e.refreshToken,
    expiresAt: e.expiresAt,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

export async function getOAuthToken(oid: string, connectionId: string): Promise<OAuthTokenRow | null> {
  await ensureTable();
  try {
    const entity = await getClient().getEntity<OAuthTokenEntity>(oid, connectionId);
    return entityToRow(entity);
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return null;
    throw e;
  }
}

export async function putOAuthToken(
  oid: string,
  connectionId: string,
  data: { accessToken: string; refreshToken?: string; expiresAt: number },
): Promise<void> {
  await ensureTable();
  const now = Date.now();
  const existing = await getOAuthToken(oid, connectionId);
  const entity: OAuthTokenEntity = {
    partitionKey: oid,
    rowKey: connectionId,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await getClient().upsertEntity(entity, "Replace");
}

export async function deleteOAuthToken(oid: string, connectionId: string): Promise<void> {
  await ensureTable();
  try {
    await getClient().deleteEntity(oid, connectionId);
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return;
    throw e;
  }
}

// ── Auto-refresh helper ─────────────────────────────────────────────────────

const REFRESH_SKEW_MS = 60_000;

interface ConnectionDoc {
  id: string;
  tokenUrl: string;
  clientId: string;
  clientSecret?: string;
}

async function getConnectionDoc(connectionId: string): Promise<ConnectionDoc | null> {
  const container = await getConnectionsContainer();
  const { resources } = await container.items
    .query<ConnectionDoc>({
      query: "SELECT c.id, c.tokenUrl, c.clientId, c.clientSecret FROM c WHERE c.id = @id AND c.type = 'connection'",
      parameters: [{ name: "@id", value: connectionId }],
    })
    .fetchAll();
  return resources[0] ?? null;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
}

/**
 * Returns a valid access token for the given user + connection.
 * Auto-refreshes if expired and a refresh token is available.
 */
export async function getValidOAuthToken(
  oid: string,
  connectionId: string,
): Promise<{ accessToken: string }> {
  const row = await getOAuthToken(oid, connectionId);
  if (!row) throw new Error("OAUTH_NOT_AUTHENTICATED");

  if (row.expiresAt - REFRESH_SKEW_MS > Date.now()) {
    return { accessToken: row.accessToken };
  }

  if (!row.refreshToken) throw new Error("OAUTH_REFRESH_UNAVAILABLE");

  const conn = await getConnectionDoc(connectionId);
  if (!conn) throw new Error("OAUTH_CONNECTION_NOT_FOUND");

  const params = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: row.refreshToken,
    client_id: conn.clientId,
  });
  if (conn.clientSecret) params.set("client_secret", conn.clientSecret);

  const res = await fetch(conn.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params.toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`OAuth refresh failed (${res.status}): ${text}`);
  }
  const tokenRes = (await res.json()) as TokenResponse;
  const expiresAt = Date.now() + (tokenRes.expires_in ?? 3600) * 1000;

  await putOAuthToken(oid, connectionId, {
    accessToken: tokenRes.access_token,
    refreshToken: tokenRes.refresh_token ?? row.refreshToken,
    expiresAt,
  });

  return { accessToken: tokenRes.access_token };
}
