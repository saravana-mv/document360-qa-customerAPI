// Per-user Document360 OAuth token store, backed by Azure Table Storage.
// Row partition + row key is the Entra object ID (oid) — one row per user.
//
// Design notes:
//   - Table Storage is chosen for low cost and tiny latency. Cosmos DB can be
//     swapped in later (Phase 4) for cross-region replication and richer
//     queries; this module's public API should remain stable across that move.
//   - Tokens are stored verbatim. Table Storage is encrypted at rest by the
//     storage account key, so this is equivalent protection to our blob data.
//     If stricter separation is ever required, the row shape supports moving
//     to a KV-wrapped value without API changes.

import { TableClient, RestError } from "@azure/data-tables";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING ?? "";
const TABLE_NAME = "d360tokens";

export interface D360TokenRow {
  /** Entra object ID — stable user identifier. */
  oid: string;
  /** D360 access token (Bearer). */
  accessToken: string;
  /** D360 refresh token — may be undefined if user never consented to offline_access. */
  refreshToken?: string;
  /** Epoch ms at which the access token expires. */
  expiresAt: number;
  /** D360 project UUID extracted from the access token's JWT claims. */
  projectId?: string;
  /** Epoch ms when the row was first created. */
  createdAt: number;
  /** Epoch ms of last update (exchange or refresh). */
  updatedAt: number;
}

/** Entity shape persisted to the Table. Must be flat per Table Storage rules. */
interface D360TokenEntity {
  partitionKey: string;
  rowKey: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
  projectId?: string;
  createdAt: number;
  updatedAt: number;
}

let _cachedClient: TableClient | null = null;
let _tableEnsured = false;

function getClient(): TableClient {
  if (_cachedClient) return _cachedClient;
  if (!CONNECTION_STRING) {
    throw new Error("AZURE_STORAGE_CONNECTION_STRING is not set");
  }
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
    // 409 (Conflict) is expected when the table already exists.
    if (e instanceof RestError && e.statusCode === 409) {
      // already exists — ignore
    } else {
      throw e;
    }
  }
  _tableEnsured = true;
}

function entityToRow(e: D360TokenEntity): D360TokenRow {
  return {
    oid: e.rowKey,
    accessToken: e.accessToken,
    refreshToken: e.refreshToken,
    expiresAt: e.expiresAt,
    projectId: e.projectId,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

/** Fetches the stored D360 token row for a user. Returns null if none. */
export async function getTokenRow(oid: string): Promise<D360TokenRow | null> {
  await ensureTable();
  try {
    const entity = await getClient().getEntity<D360TokenEntity>(oid, oid);
    return entityToRow(entity);
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return null;
    throw e;
  }
}

/**
 * Upserts the token row for a user. Preserves `createdAt` when updating;
 * always refreshes `updatedAt`.
 */
export async function putTokenRow(
  oid: string,
  data: Omit<D360TokenRow, "oid" | "createdAt" | "updatedAt">,
): Promise<void> {
  await ensureTable();
  const now = Date.now();
  const existing = await getTokenRow(oid);
  const entity: D360TokenEntity = {
    partitionKey: oid,
    rowKey: oid,
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresAt: data.expiresAt,
    projectId: data.projectId,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await getClient().upsertEntity(entity, "Replace");
}

/** Removes the stored token row for a user. No-op if none exists. */
export async function deleteTokenRow(oid: string): Promise<void> {
  await ensureTable();
  try {
    await getClient().deleteEntity(oid, oid);
  } catch (e) {
    if (e instanceof RestError && e.statusCode === 404) return;
    throw e;
  }
}
