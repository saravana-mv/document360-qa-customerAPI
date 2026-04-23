// Generic OAuth token store, backed by Azure Table Storage.
// Row key format: {oid}:{connectionId} — one row per user per connection.
//
// This generalizes the D360-specific tokenStore.ts to support any OAuth
// connection registered in the connections Cosmos container.

import { TableClient, RestError } from "@azure/data-tables";

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
