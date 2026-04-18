// API key CRUD for the FlowForge Public API.
//
// Keys are stored in the Cosmos "api-keys" container, partitioned by projectId.
// The raw key is only returned at creation time — we persist a SHA-256 hash.

import { createHash, randomBytes } from "node:crypto";
import { getApiKeysContainer } from "./cosmosClient";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ApiKeyDocument {
  id: string;
  projectId: string;
  type: "api_key";
  name: string;
  keyPrefix: string;
  keyHash: string;
  createdBy: { oid: string; name: string };
  createdAt: string;
  lastUsedAt?: string;
  revoked: boolean;
  /** Which version's D360 credentials to use when running scenarios. */
  versionId: string;
  authMethod: "oauth" | "apikey";
}

/** Returned only once — at creation time. */
export interface ApiKeyCreateResult {
  key: string;
  doc: ApiKeyDocument;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function hashKey(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

function generateKey(): string {
  // ff_ prefix + 40 hex chars = 43 chars total
  return `ff_${randomBytes(20).toString("hex")}`;
}

// ── Public API ──────────────────────────────────────────────────────────────

export async function createApiKey(
  projectId: string,
  name: string,
  versionId: string,
  authMethod: "oauth" | "apikey",
  createdBy: { oid: string; name: string },
): Promise<ApiKeyCreateResult> {
  const container = await getApiKeysContainer();
  const raw = generateKey();
  const doc: ApiKeyDocument = {
    id: `apikey:${randomBytes(8).toString("hex")}`,
    projectId,
    type: "api_key",
    name,
    keyPrefix: raw.slice(0, 8),
    keyHash: hashKey(raw),
    createdBy,
    createdAt: new Date().toISOString(),
    revoked: false,
    versionId,
    authMethod,
  };
  await container.items.upsert(doc);
  return { key: raw, doc };
}

export async function listApiKeys(projectId: string): Promise<ApiKeyDocument[]> {
  const container = await getApiKeysContainer();
  const { resources } = await container.items
    .query<ApiKeyDocument>({
      query: "SELECT * FROM c WHERE c.projectId = @pid AND c.type = 'api_key' AND c.revoked = false",
      parameters: [{ name: "@pid", value: projectId }],
    })
    .fetchAll();
  return resources;
}

export async function revokeApiKey(id: string, projectId: string): Promise<boolean> {
  const container = await getApiKeysContainer();
  try {
    const { resource } = await container.item(id, projectId).read<ApiKeyDocument>();
    if (!resource) return false;
    resource.revoked = true;
    await container.items.upsert(resource);
    return true;
  } catch {
    return false;
  }
}

/** Look up an active key by its SHA-256 hash. Returns null if not found or revoked. */
export async function findApiKeyByHash(keyHash: string): Promise<ApiKeyDocument | null> {
  const container = await getApiKeysContainer();
  const { resources } = await container.items
    .query<ApiKeyDocument>({
      query: "SELECT * FROM c WHERE c.type = 'api_key' AND c.keyHash = @hash AND c.revoked = false",
      parameters: [{ name: "@hash", value: keyHash }],
    })
    .fetchAll();
  return resources.length > 0 ? resources[0] : null;
}

/** Update the lastUsedAt timestamp. Fire-and-forget — errors are swallowed. */
export async function touchApiKey(doc: ApiKeyDocument): Promise<void> {
  try {
    const container = await getApiKeysContainer();
    await container.items.upsert({ ...doc, lastUsedAt: new Date().toISOString() });
  } catch {
    // Non-critical — swallow
  }
}

export { hashKey };
