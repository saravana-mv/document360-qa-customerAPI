/**
 * Unit tests for api/src/lib/auth.ts
 *
 * Covers the pure/sync helpers and the withAuth wrapper.
 * Cosmos DB is mocked out so no real DB connections are needed.
 */

// Mock cosmosClient before importing auth (prevents real DB init)
jest.mock("../lib/cosmosClient", () => ({
  getUsersContainer: jest.fn(),
  getProjectMembersContainer: jest.fn(),
}));

import {
  parseClientPrincipal,
  getUserInfo,
  getProjectId,
  ProjectIdMissingError,
  withAuth,
} from "../lib/auth";
import type { HttpRequest, HttpResponseInit } from "@azure/functions";

// ---------------------------------------------------------------------------
// Helper: build a minimal mock HttpRequest with configurable headers
// ---------------------------------------------------------------------------
function mockRequest(
  headers: Record<string, string> = {},
  method = "GET",
): HttpRequest {
  const headersMap = new Map<string, string>(
    Object.entries(headers).map(([k, v]) => [k.toLowerCase(), v]),
  );
  return {
    method,
    headers: {
      get: (name: string) => headersMap.get(name.toLowerCase()) ?? null,
    },
    query: new URLSearchParams(),
    json: jest.fn(),
  } as unknown as HttpRequest;
}

/** Encode a JS object as the base64 x-ms-client-principal header value. */
function encodePrincipal(obj: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(obj)).toString("base64");
}

// Save and restore AUTH_ENABLED between tests
const originalAuthEnabled = process.env.AUTH_ENABLED;
afterEach(() => {
  if (originalAuthEnabled === undefined) {
    delete process.env.AUTH_ENABLED;
  } else {
    process.env.AUTH_ENABLED = originalAuthEnabled;
  }
});

// ===== parseClientPrincipal ================================================

describe("parseClientPrincipal", () => {
  it("returns null when x-ms-client-principal header is missing", () => {
    const req = mockRequest({});
    expect(parseClientPrincipal(req)).toBeNull();
  });

  it("parses a valid base64-encoded principal", () => {
    const principal = {
      userId: "abc-123",
      userDetails: "alice@example.com",
      identityProvider: "aad",
      userRoles: ["authenticated"],
    };
    const req = mockRequest({
      "x-ms-client-principal": encodePrincipal(principal),
    });

    const result = parseClientPrincipal(req);
    expect(result).not.toBeNull();
    expect(result!.userId).toBe("abc-123");
    expect(result!.userDetails).toBe("alice@example.com");
    expect(result!.identityProvider).toBe("aad");
    expect(result!.userRoles).toEqual(["authenticated"]);
  });

  it("returns null for invalid base64 (not valid JSON)", () => {
    const req = mockRequest({
      "x-ms-client-principal": "not-valid-base64!!!",
    });
    expect(parseClientPrincipal(req)).toBeNull();
  });

  it("returns null when decoded JSON has no userId", () => {
    const req = mockRequest({
      "x-ms-client-principal": encodePrincipal({
        userId: "",
        userDetails: "bob@example.com",
        identityProvider: "aad",
        userRoles: [],
      }),
    });
    expect(parseClientPrincipal(req)).toBeNull();
  });

  it("returns null when decoded JSON has userId as undefined", () => {
    const req = mockRequest({
      "x-ms-client-principal": encodePrincipal({
        userDetails: "nooid@example.com",
        identityProvider: "aad",
        userRoles: [],
      }),
    });
    expect(parseClientPrincipal(req)).toBeNull();
  });

  it("preserves optional claims array", () => {
    const principal = {
      userId: "oid-456",
      userDetails: "carol@example.com",
      identityProvider: "aad",
      userRoles: ["authenticated"],
      claims: [{ typ: "email", val: "carol@example.com" }],
    };
    const req = mockRequest({
      "x-ms-client-principal": encodePrincipal(principal),
    });
    const result = parseClientPrincipal(req);
    expect(result!.claims).toEqual([{ typ: "email", val: "carol@example.com" }]);
  });
});

// ===== getUserInfo ==========================================================

describe("getUserInfo", () => {
  it("returns oid and name from a valid principal", () => {
    const req = mockRequest({
      "x-ms-client-principal": encodePrincipal({
        userId: "oid-789",
        userDetails: "Dave Smith",
        identityProvider: "aad",
        userRoles: [],
      }),
    });
    const info = getUserInfo(req);
    expect(info.oid).toBe("oid-789");
    expect(info.name).toBe("Dave Smith");
  });

  it("returns anonymous defaults when no principal header", () => {
    const req = mockRequest({});
    const info = getUserInfo(req);
    expect(info.oid).toBe("anonymous");
    expect(info.name).toBe("Anonymous");
  });

  it("returns anonymous defaults when principal is invalid", () => {
    const req = mockRequest({
      "x-ms-client-principal": "garbage!!!",
    });
    const info = getUserInfo(req);
    expect(info.oid).toBe("anonymous");
    expect(info.name).toBe("Anonymous");
  });
});

// ===== getProjectId =========================================================

describe("getProjectId", () => {
  it("returns the project ID from the header", () => {
    const req = mockRequest({ "x-flowforge-projectid": "proj-42" });
    expect(getProjectId(req)).toBe("proj-42");
  });

  it("throws ProjectIdMissingError when header is absent", () => {
    const req = mockRequest({});
    expect(() => getProjectId(req)).toThrow(ProjectIdMissingError);
  });

  it("throws with the correct error message", () => {
    const req = mockRequest({});
    expect(() => getProjectId(req)).toThrow(
      "X-FlowForge-ProjectId header is required",
    );
  });
});

// ===== ProjectIdMissingError ================================================

describe("ProjectIdMissingError", () => {
  it("is an instance of Error", () => {
    const err = new ProjectIdMissingError();
    expect(err).toBeInstanceOf(Error);
  });

  it("has the expected message", () => {
    const err = new ProjectIdMissingError();
    expect(err.message).toBe("X-FlowForge-ProjectId header is required");
  });

  it("has a name that includes 'Error'", () => {
    const err = new ProjectIdMissingError();
    // class name is ProjectIdMissingError, which ends with Error
    expect(err.name).toContain("Error");
  });
});

// ===== withAuth =============================================================

describe("withAuth", () => {
  const dummyResponse: HttpResponseInit = { status: 200, body: "ok" };
  const handler = jest.fn<Promise<HttpResponseInit>, [HttpRequest]>().mockResolvedValue(dummyResponse);

  beforeEach(() => {
    handler.mockClear();
  });

  it("passes OPTIONS requests through without checking auth", async () => {
    process.env.AUTH_ENABLED = "true";
    const req = mockRequest({}, "OPTIONS");
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    expect(handler).toHaveBeenCalledWith(req);
    expect(res).toBe(dummyResponse);
  });

  it("passes requests through when AUTH_ENABLED is false", async () => {
    process.env.AUTH_ENABLED = "false";
    const req = mockRequest({}, "GET");
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    expect(handler).toHaveBeenCalledWith(req);
    expect(res).toBe(dummyResponse);
  });

  it("passes requests through when AUTH_ENABLED is FALSE (case-insensitive)", async () => {
    process.env.AUTH_ENABLED = "FALSE";
    const req = mockRequest({}, "POST");
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    expect(handler).toHaveBeenCalledWith(req);
    expect(res).toBe(dummyResponse);
  });

  it("returns 401 when auth is enabled and no principal header", async () => {
    process.env.AUTH_ENABLED = "true";
    const req = mockRequest({}, "GET");
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/Unauthorized/);
  });

  it("returns 401 when auth is enabled and principal is invalid", async () => {
    process.env.AUTH_ENABLED = "true";
    const req = mockRequest(
      { "x-ms-client-principal": "not-valid-json-base64!!!" },
      "GET",
    );
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("calls handler when auth is enabled and principal is valid", async () => {
    process.env.AUTH_ENABLED = "true";
    const req = mockRequest(
      {
        "x-ms-client-principal": encodePrincipal({
          userId: "valid-oid",
          userDetails: "user@example.com",
          identityProvider: "aad",
          userRoles: ["authenticated"],
        }),
      },
      "GET",
    );
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    expect(handler).toHaveBeenCalledWith(req);
    expect(res).toBe(dummyResponse);
  });

  it("defaults to auth enabled when AUTH_ENABLED is unset", async () => {
    delete process.env.AUTH_ENABLED;
    const req = mockRequest({}, "GET");
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    // No principal => should be 401
    expect(handler).not.toHaveBeenCalled();
    expect(res.status).toBe(401);
  });

  it("401 response includes CORS headers", async () => {
    process.env.AUTH_ENABLED = "true";
    const req = mockRequest({}, "DELETE");
    const wrapped = withAuth(handler);

    const res = await wrapped(req);

    expect(res.status).toBe(401);
    const headers = res.headers as Record<string, string>;
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Content-Type"]).toBe("application/json");
  });
});
