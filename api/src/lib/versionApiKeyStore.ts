// Per-version credential store, backed by Azure Table Storage.
// Stores generic credentials (bearer tokens, API keys, basic auth, cookies)
// for any auth type. Shared lib — imported by versionAuth function and proxy.

import { TableClient, RestError } from "@azure/data-tables";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const TABLE_NAME = "versionapikeys";

type AuthType = "bearer" | "apikey_header" | "apikey_query" | "basic" | "cookie" | "oauth" | "none";

interface CredentialEntity {
  partitionKey: string;
  rowKey: string;
  credential: string;
  version: string;
  authType: string;
  authHeaderName?: string;
  authQueryParam?: string;
  createdAt: number;
  updatedAt: number;
  // Legacy field — kept for backward compat reads
  apiKey?: string;
}

export interface StoredCredential {
  credential: string;
  authType: AuthType;
  authHeaderName?: string;
  authQueryParam?: string;
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

/** Fetches the stored credential for a user+version. Returns null if none. */
export async function getCredentialForVersion(oid: string, version: string): Promise<StoredCredential | null> {
  await ensureTable();
  try {
    const entity = await getClient().getEntity<CredentialEntity>(oid, makeRowKey(oid, version));
    // Backward compat: old rows have apiKey but no credential/authType
    const credential = entity.credential ?? entity.apiKey ?? null;
    if (!credential) return null;
    return {
      credential,
      authType: (entity.authType as AuthType) ?? "apikey_header",
      authHeaderName: entity.authHeaderName,
      authQueryParam: entity.authQueryParam,
    };
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return null;
    throw e;
  }
}

/** Legacy helper — fetches just the raw API key string. */
export async function getApiKeyForVersion(oid: string, version: string): Promise<string | null> {
  const cred = await getCredentialForVersion(oid, version);
  return cred?.credential ?? null;
}

/** Stores a credential for a user+version. */
export async function putCredential(
  oid: string,
  version: string,
  credential: string,
  authType: AuthType,
  authHeaderName?: string,
  authQueryParam?: string,
): Promise<void> {
  await ensureTable();
  const rk = makeRowKey(oid, version);
  const now = Date.now();
  let createdAt = now;
  try {
    const existing = await getClient().getEntity<CredentialEntity>(oid, rk);
    createdAt = existing.createdAt ?? now;
  } catch { /* new entry */ }

  const entity: CredentialEntity = {
    partitionKey: oid,
    rowKey: rk,
    credential,
    apiKey: credential, // backward compat for old proxy reads during deploy
    version,
    authType,
    authHeaderName,
    authQueryParam,
    createdAt,
    updatedAt: now,
  };
  await getClient().upsertEntity(entity, "Replace");
}

/** Legacy alias for storing API keys. */
export async function putApiKey(oid: string, version: string, apiKey: string): Promise<void> {
  return putCredential(oid, version, apiKey, "apikey_header", "api_token");
}

/** Removes a stored credential for a user+version. */
export async function deleteCredential(oid: string, version: string): Promise<void> {
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

/** Legacy alias. */
export const deleteApiKey = deleteCredential;

/** Checks if a credential is configured for a user+version. */
export async function hasCredential(oid: string, version: string): Promise<boolean> {
  const cred = await getCredentialForVersion(oid, version);
  return cred !== null;
}

/** Legacy alias. */
export const hasApiKey = hasCredential;
