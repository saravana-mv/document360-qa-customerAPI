import type { HttpRequest, HttpResponseInit } from "@azure/functions";

const mockFindApiKeyByHash = jest.fn();
const mockTouchApiKey = jest.fn();
const mockHashKey = jest.fn().mockReturnValue("hashed-key");

jest.mock("../lib/apiKeyStore", () => ({
  hashKey: (...args: unknown[]) => mockHashKey(...args),
  findApiKeyByHash: (...args: unknown[]) => mockFindApiKeyByHash(...args),
  touchApiKey: (...args: unknown[]) => mockTouchApiKey(...args),
}));

const mockGetApiKeyForVersion = jest.fn();
jest.mock("../lib/versionApiKeyStore", () => ({
  getApiKeyForVersion: (...args: unknown[]) => mockGetApiKeyForVersion(...args),
}));

import { withApiKey, getApiKeyDoc, resolveCredentials } from "../lib/apiKeyAuth";

function mockRequest(method: string, headers: Record<string, string> = {}) {
  return {
    method,
    headers: { get: (name: string) => headers[name.toLowerCase()] ?? null },
  };
}

const SAMPLE_DOC = {
  id: "apikey:abc123",
  projectId: "proj-1",
  type: "api_key" as const,
  name: "Test Key",
  keyPrefix: "ff_12345",
  keyHash: "hashed",
  createdBy: { oid: "user-1", name: "Test User" },
  createdAt: "2024-01-01T00:00:00Z",
  revoked: false,
  versionId: "v1",
  authMethod: "apikey" as const,
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("withApiKey", () => {
  const mockHandler = jest.fn().mockResolvedValue({ status: 200, body: "ok" });
  const wrapped = withApiKey(mockHandler);

  it("returns 204 for OPTIONS requests", async () => {
    const req = mockRequest("OPTIONS");
    const res = await wrapped(req as unknown as HttpRequest);
    expect(res.status).toBe(204);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("returns 401 when X-API-Key header is missing", async () => {
    const req = mockRequest("POST");
    const res = await wrapped(req as unknown as HttpRequest);
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/Missing or invalid/);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("returns 401 when key does not start with ff_", async () => {
    const req = mockRequest("POST", { "x-api-key": "bad_key_123" });
    const res = await wrapped(req as unknown as HttpRequest);
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/Missing or invalid/);
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("returns 401 when key is not found in store", async () => {
    mockFindApiKeyByHash.mockResolvedValue(null);
    const req = mockRequest("POST", { "x-api-key": "ff_notfound" });
    const res = await wrapped(req as unknown as HttpRequest);
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body as string);
    expect(body.error).toBe("Invalid API key");
    expect(mockHashKey).toHaveBeenCalledWith("ff_notfound");
    expect(mockFindApiKeyByHash).toHaveBeenCalledWith("hashed-key");
    expect(mockHandler).not.toHaveBeenCalled();
  });

  it("calls handler and stashes doc for a valid key", async () => {
    mockFindApiKeyByHash.mockResolvedValue(SAMPLE_DOC);
    const req = mockRequest("POST", { "x-api-key": "ff_valid123" });
    const res = await wrapped(req as unknown as HttpRequest);
    expect(res.status).toBe(200);
    expect(mockHandler).toHaveBeenCalledWith(req);
    expect((req as Record<string, unknown>).__apiKeyDoc).toBe(SAMPLE_DOC);
  });

  it("calls touchApiKey with the doc", async () => {
    mockFindApiKeyByHash.mockResolvedValue(SAMPLE_DOC);
    const req = mockRequest("POST", { "x-api-key": "ff_valid123" });
    await wrapped(req as unknown as HttpRequest);
    expect(mockTouchApiKey).toHaveBeenCalledWith(SAMPLE_DOC);
  });
});

describe("getApiKeyDoc", () => {
  it("retrieves the stashed doc from the request", () => {
    const req = { __apiKeyDoc: SAMPLE_DOC } as unknown as HttpRequest;
    const doc = getApiKeyDoc(req);
    expect(doc).toBe(SAMPLE_DOC);
  });
});

describe("resolveCredentials", () => {
  it("throws for OAuth auth method", async () => {
    const oauthDoc = { ...SAMPLE_DOC, authMethod: "oauth" as const };
    await expect(resolveCredentials(oauthDoc)).rejects.toThrow(/OAuth auth method/);
    expect(mockGetApiKeyForVersion).not.toHaveBeenCalled();
  });

  it("returns the stored API key for apikey auth method", async () => {
    mockGetApiKeyForVersion.mockResolvedValue("stored-api-key-value");
    const result = await resolveCredentials(SAMPLE_DOC);
    expect(result).toEqual({ apiKey: "stored-api-key-value" });
    expect(mockGetApiKeyForVersion).toHaveBeenCalledWith("user-1", "v1");
  });

  it("throws when no key is configured for the version", async () => {
    mockGetApiKeyForVersion.mockResolvedValue(null);
    await expect(resolveCredentials(SAMPLE_DOC)).rejects.toThrow(/No API key configured/);
  });
});
