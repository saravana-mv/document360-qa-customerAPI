/**
 * Unit tests for api/src/functions/apiKeys.ts
 *
 * Two routers:
 *   apiKeys       — GET (list), POST (create), OPTIONS
 *   apiKeysDelete — DELETE (revoke), OPTIONS
 */

import type { HttpResponseInit, InvocationContext } from "@azure/functions";
import { app } from "@azure/functions";

// ── Mocks ──────────────────────────────────────────────────────────────────

const mockCreateApiKey = jest.fn();
const mockListApiKeys = jest.fn();
const mockRevokeApiKey = jest.fn();

jest.mock("../lib/apiKeyStore", () => ({
  createApiKey: (...args: unknown[]) => mockCreateApiKey(...args),
  listApiKeys: (...args: unknown[]) => mockListApiKeys(...args),
  revokeApiKey: (...args: unknown[]) => mockRevokeApiKey(...args),
}));

jest.mock("../lib/auth", () => ({
  withRole: (_roles: string[], fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

// ── Helpers ─────────────────────────────────────────────────────────────────

function makeReq(method: string, url?: string, body?: unknown) {
  return {
    method,
    url: url ?? "https://localhost/api/api-keys",
    headers: { get: () => null },
    query: new URLSearchParams(),
    params: {},
    json: async () => body ?? {},
    text: async () => "",
  };
}

const ctx = {} as InvocationContext;

function parseBody(res: HttpResponseInit): unknown {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

// ── Import module & extract handlers ────────────────────────────────────────

let apiKeysHandler: Function;
let apiKeysDeleteHandler: Function;

beforeAll(async () => {
  await import("../functions/apiKeys");

  const calls = (app.http as jest.Mock).mock.calls;
  for (const call of calls) {
    const [name, opts] = call;
    if (name === "apiKeys") apiKeysHandler = opts.handler;
    if (name === "apiKeysDelete") apiKeysDeleteHandler = opts.handler;
  }
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe("apiKeys router", () => {
  beforeEach(() => jest.clearAllMocks());

  test("OPTIONS returns 204", async () => {
    const res = await apiKeysHandler(makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  test("POST creates key and returns key + doc fields", async () => {
    const now = new Date().toISOString();
    mockCreateApiKey.mockResolvedValue({
      key: "ff_live_abc123",
      doc: {
        id: "key-1",
        name: "My Key",
        keyPrefix: "ff_live_a",
        versionId: "v3",
        authMethod: "oauth",
        createdAt: now,
      },
    });

    const res = await apiKeysHandler(
      makeReq("POST", undefined, { name: "My Key", versionId: "v3" }),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = parseBody(res) as Record<string, unknown>;
    expect(body.key).toBe("ff_live_abc123");
    expect(body.id).toBe("key-1");
    expect(body.name).toBe("My Key");
    expect(body.keyPrefix).toBe("ff_live_a");
    expect(body.versionId).toBe("v3");
    expect(body.authMethod).toBe("oauth");
    expect(body.createdAt).toBe(now);
    expect(mockCreateApiKey).toHaveBeenCalledWith(
      "test-project",
      "My Key",
      "v3",
      "oauth",
      { oid: "test-oid", name: "Test User" },
    );
  });

  test("POST with missing name returns 400", async () => {
    const res = await apiKeysHandler(
      makeReq("POST", undefined, { versionId: "v3" }),
      ctx,
    );

    expect(res.status).toBe(400);
    const body = parseBody(res) as Record<string, unknown>;
    expect(body.error).toMatch(/name/i);
  });

  test("POST with missing versionId returns 400", async () => {
    const res = await apiKeysHandler(
      makeReq("POST", undefined, { name: "Key" }),
      ctx,
    );

    expect(res.status).toBe(400);
    const body = parseBody(res) as Record<string, unknown>;
    expect(body.error).toMatch(/versionId/i);
  });

  test("GET lists keys with safe field mapping (no keyHash)", async () => {
    mockListApiKeys.mockResolvedValue([
      {
        id: "key-1",
        name: "Key One",
        keyPrefix: "ff_live_a",
        keyHash: "secret-hash-should-not-leak",
        versionId: "v3",
        authMethod: "oauth",
        createdBy: "test-oid",
        createdAt: "2026-01-01T00:00:00Z",
        lastUsedAt: null,
      },
    ]);

    const res = await apiKeysHandler(makeReq("GET"), ctx);

    expect(res.status).toBe(200);
    const body = parseBody(res) as Record<string, unknown>[];
    expect(body).toHaveLength(1);
    expect(body[0].id).toBe("key-1");
    expect(body[0].name).toBe("Key One");
    expect(body[0].keyPrefix).toBe("ff_live_a");
    expect(body[0].createdBy).toBe("test-oid");
    expect(body[0]).not.toHaveProperty("keyHash");
  });

  test("unsupported method returns 405", async () => {
    const res = await apiKeysHandler(makeReq("PATCH"), ctx);

    expect(res.status).toBe(405);
    const body = parseBody(res) as Record<string, unknown>;
    expect(body.error).toMatch(/method not allowed/i);
  });
});

describe("apiKeysDelete router", () => {
  beforeEach(() => jest.clearAllMocks());

  test("OPTIONS returns 204", async () => {
    const res = await apiKeysDeleteHandler(
      makeReq("OPTIONS", "https://localhost/api/api-keys/key-1"),
      ctx,
    );
    expect(res.status).toBe(204);
  });

  test("DELETE revokes key successfully", async () => {
    mockRevokeApiKey.mockResolvedValue(true);

    const res = await apiKeysDeleteHandler(
      makeReq("DELETE", "https://localhost/api/api-keys/key-1"),
      ctx,
    );

    expect(res.status).toBe(200);
    const body = parseBody(res) as Record<string, unknown>;
    expect(body.revoked).toBe(true);
    expect(mockRevokeApiKey).toHaveBeenCalledWith("key-1", "test-project");
  });

  test("DELETE returns 404 when key not found", async () => {
    mockRevokeApiKey.mockResolvedValue(false);

    const res = await apiKeysDeleteHandler(
      makeReq("DELETE", "https://localhost/api/api-keys/no-such-key"),
      ctx,
    );

    expect(res.status).toBe(404);
    const body = parseBody(res) as Record<string, unknown>;
    expect(body.error).toMatch(/not found/i);
  });

  test("unsupported method returns 405", async () => {
    const res = await apiKeysDeleteHandler(
      makeReq("GET", "https://localhost/api/api-keys/key-1"),
      ctx,
    );

    expect(res.status).toBe(405);
  });
});
