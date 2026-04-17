// Per-version API key store, backed by Azure Table Storage.
// Shared lib — imported by both versionAuth function and d360Proxy.

import { TableClient, RestError } from "@azure/data-tables";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const TABLE_NAME = "versionapikeys";

interface ApiKeyEntity {
  partitionKey: string;
  rowKey: string;
  apiKey: string;
  version: string;
  createdAt: number;
  updatedAt: number;
}

let _client: TableClient | null = null;
let _tableEnsured = false;

export function getClient(): TableClient {
  if (_client) return _client;
  if (!CONNECTION_STRING) throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  _client = TableClient.fromConnectionString(CONNECTION_STRING, TABLE_NAME, {
    allowInsecureConnection: CONNECTION_STRING.includes("UseDevelopmentStorage=true"),
  });
  return _client;
}

export async function ensureTable(): Promise<void> {
  if (_tableEnsured) return;
  try {
    await getClient().createTable();
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 409) {
      // already exists
    } else {
      throw e;
    }
  }
  _tableEnsured = true;
}

export function makeRowKey(oid: string, version: string): string {
  return `${oid}:${version}`;
}

/** Fetches the stored API key for a user+version. Returns null if none. */
export async function getApiKeyForVersion(oid: string, version: string): Promise<string | null> {
  await ensureTable();
  try {
    const entity = await getClient().getEntity<ApiKeyEntity>(oid, makeRowKey(oid, version));
    return entity.apiKey ?? null;
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return null;
    throw e;
  }
}

/** Stores an API key for a user+version. */
export async function putApiKey(oid: string, version: string, apiKey: string): Promise<void> {
  await ensureTable();
  const rk = makeRowKey(oid, version);
  const now = Date.now();
  let createdAt = now;
  try {
    const existing = await getClient().getEntity<ApiKeyEntity>(oid, rk);
    createdAt = existing.createdAt ?? now;
  } catch { /* new entry */ }

  const entity: ApiKeyEntity = {
    partitionKey: oid,
    rowKey: rk,
    apiKey,
    version,
    createdAt,
    updatedAt: now,
  };
  await getClient().upsertEntity(entity, "Replace");
}

/** Removes a stored API key for a user+version. */
export async function deleteApiKey(oid: string, version: string): Promise<void> {
  await ensureTable();
  try {
    await getClient().deleteEntity(oid, makeRowKey(oid, version));
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) {
      // already gone
    } else {
      throw e;
    }
  }
}

/** Checks if an API key is configured for a user+version. */
export async function hasApiKey(oid: string, version: string): Promise<boolean> {
  const key = await getApiKeyForVersion(oid, version);
  return key !== null;
}
