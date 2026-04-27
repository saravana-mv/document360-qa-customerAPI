const mockUpsert = jest.fn().mockResolvedValue({});
const mockFetchAll = jest.fn().mockResolvedValue({ resources: [] });
const mockRead = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getApiKeysContainer: jest.fn().mockResolvedValue({
    items: {
      upsert: (...args: unknown[]) => mockUpsert(...args),
      query: () => ({ fetchAll: () => mockFetchAll() }),
    },
    item: () => ({ read: () => mockRead() }),
  }),
}));

import {
  hashKey,
  createApiKey,
  listApiKeys,
  revokeApiKey,
  findApiKeyByHash,
  touchApiKey,
} from "../lib/apiKeyStore";
import type { ApiKeyDocument } from "../lib/apiKeyStore";

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchAll.mockResolvedValue({ resources: [] });
});

/* ------------------------------------------------------------------ */
/*  hashKey                                                           */
/* ------------------------------------------------------------------ */
describe("hashKey", () => {
  it("produces a 64-char hex string (SHA-256)", () => {
    const result = hashKey("test-input");
    expect(result).toMatch(/^[0-9a-f]{64}$/);
  });

  it("is deterministic for the same input", () => {
    expect(hashKey("same")).toBe(hashKey("same"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashKey("alpha")).not.toBe(hashKey("beta"));
  });
});

/* ------------------------------------------------------------------ */
/*  createApiKey                                                      */
/* ------------------------------------------------------------------ */
describe("createApiKey", () => {
  it("returns a key starting with 'ff_' and a well-shaped doc", async () => {
    const result = await createApiKey(
      "proj-1",
      "My Key",
      "v1",
      "oauth",
      { oid: "user-oid", name: "Alice" },
    );

    expect(result.key).toMatch(/^ff_[0-9a-f]{40}$/);

    const { doc } = result;
    expect(doc.projectId).toBe("proj-1");
    expect(doc.type).toBe("api_key");
    expect(doc.name).toBe("My Key");
    expect(doc.keyPrefix).toBe(result.key.slice(0, 8));
    expect(doc.keyHash).toBe(hashKey(result.key));
    expect(doc.revoked).toBe(false);
    expect(doc.versionId).toBe("v1");
    expect(doc.authMethod).toBe("oauth");
    expect(doc.createdBy).toEqual({ oid: "user-oid", name: "Alice" });
    expect(doc.createdAt).toBeDefined();
    expect(doc.id).toMatch(/^apikey:/);
  });

  it("calls upsert with the doc", async () => {
    const { doc } = await createApiKey(
      "proj-2",
      "Key 2",
      "v2",
      "apikey",
      { oid: "u2", name: "Bob" },
    );
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    expect(mockUpsert).toHaveBeenCalledWith(doc);
  });
});

/* ------------------------------------------------------------------ */
/*  listApiKeys                                                       */
/* ------------------------------------------------------------------ */
describe("listApiKeys", () => {
  it("returns resources from the query", async () => {
    const fakeDoc = { id: "apikey:abc", projectId: "p1" } as ApiKeyDocument;
    mockFetchAll.mockResolvedValueOnce({ resources: [fakeDoc] });

    const result = await listApiKeys("p1");
    expect(result).toEqual([fakeDoc]);
  });

  it("returns an empty array when no keys exist", async () => {
    const result = await listApiKeys("p-empty");
    expect(result).toEqual([]);
  });
});

/* ------------------------------------------------------------------ */
/*  revokeApiKey                                                      */
/* ------------------------------------------------------------------ */
describe("revokeApiKey", () => {
  it("reads the doc, sets revoked=true, upserts, and returns true", async () => {
    const existing = {
      id: "apikey:x",
      projectId: "p1",
      revoked: false,
    } as ApiKeyDocument;

    mockRead.mockResolvedValueOnce({ resource: existing });

    const result = await revokeApiKey("apikey:x", "p1");

    expect(result).toBe(true);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upserted = mockUpsert.mock.calls[0][0] as ApiKeyDocument;
    expect(upserted.revoked).toBe(true);
  });

  it("returns false when the document is not found", async () => {
    mockRead.mockResolvedValueOnce({ resource: undefined });

    const result = await revokeApiKey("apikey:missing", "p1");
    expect(result).toBe(false);
    expect(mockUpsert).not.toHaveBeenCalled();
  });

  it("returns false when read throws", async () => {
    mockRead.mockRejectedValueOnce(new Error("cosmos error"));

    const result = await revokeApiKey("apikey:err", "p1");
    expect(result).toBe(false);
  });
});

/* ------------------------------------------------------------------ */
/*  findApiKeyByHash                                                  */
/* ------------------------------------------------------------------ */
describe("findApiKeyByHash", () => {
  it("returns the first document when found", async () => {
    const doc = { id: "apikey:found", keyHash: "abc" } as ApiKeyDocument;
    mockFetchAll.mockResolvedValueOnce({ resources: [doc] });

    const result = await findApiKeyByHash("abc");
    expect(result).toEqual(doc);
  });

  it("returns null when no documents match", async () => {
    const result = await findApiKeyByHash("no-match");
    expect(result).toBeNull();
  });
});

/* ------------------------------------------------------------------ */
/*  touchApiKey                                                       */
/* ------------------------------------------------------------------ */
describe("touchApiKey", () => {
  it("upserts the doc with an updated lastUsedAt", async () => {
    const doc = {
      id: "apikey:t",
      projectId: "p1",
      lastUsedAt: undefined,
    } as unknown as ApiKeyDocument;

    await touchApiKey(doc);

    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upserted = mockUpsert.mock.calls[0][0] as ApiKeyDocument;
    expect(upserted.lastUsedAt).toBeDefined();
    expect(upserted.id).toBe("apikey:t");
  });

  it("swallows errors silently", async () => {
    mockUpsert.mockRejectedValueOnce(new Error("boom"));

    const doc = { id: "apikey:err" } as ApiKeyDocument;
    await expect(touchApiKey(doc)).resolves.toBeUndefined();
  });
});
