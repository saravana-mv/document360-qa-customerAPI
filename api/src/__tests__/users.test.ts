/**
 * Unit tests for api/src/functions/users.ts
 *
 * Covers: GET /me, GET /users, POST /users/invite, PUT /users/:id/role,
 * DELETE /users/:id, OPTIONS preflight.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockQuery = jest.fn();
const mockCreate = jest.fn();
const mockRead = jest.fn();
const mockReplace = jest.fn();
const mockItemDelete = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getUsersContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockQuery() }),
      create: (...args: any[]) => mockCreate(...args),
    },
    item: () => ({
      read: () => mockRead(),
      replace: (...args: any[]) => mockReplace(...args),
      delete: () => mockItemDelete(),
    }),
  }),
}));

const mockLookupUser = jest.fn();
jest.mock("../lib/auth", () => ({
  withAuth: (fn: any) => fn,
  withRole: (_roles: any, fn: any) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  lookupUser: (...args: any[]) => mockLookupUser(...args),
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

import { app } from "@azure/functions";

// Import the module to trigger app.http registrations
import "../functions/users";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeReq(method: string, body?: unknown, path = "/api/users/") {
  return {
    method,
    headers: new Map([
      ["x-flowforge-projectid", "test-project"],
      [
        "x-ms-client-principal",
        Buffer.from(
          JSON.stringify({
            userId: "test-oid",
            userDetails: "test@example.com",
          }),
        ).toString("base64"),
      ],
    ]),
    params: {},
    json: () => Promise.resolve(body),
    query: new URLSearchParams(),
    url: `https://example.com${path}`,
  };
}

// Extract handlers from app.http registrations
const registrations = (app.http as jest.Mock).mock.calls;
const usersMeReg = registrations.find(
  ([name]) => name === "usersMe",
);
const usersReg = registrations.find(([name]) => name === "users");

const getMeHandler = usersMeReg![1].handler;
const usersRouter = usersReg![1].handler;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  jest.clearAllMocks();
});

describe("GET /api/users/me", () => {
  it("returns user doc when found", async () => {
    const userDoc = {
      id: "test-oid",
      email: "test@example.com",
      role: "owner",
      _rid: "r",
      _self: "s",
      _etag: "e",
      _attachments: "a",
      _ts: 1,
    };
    mockLookupUser.mockResolvedValue(userDoc);

    const res = await getMeHandler(makeReq("GET", undefined, "/api/users/me"), {});
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.id).toBe("test-oid");
    expect(body.email).toBe("test@example.com");
    // Cosmos metadata stripped
    expect(body._rid).toBeUndefined();
    expect(body._self).toBeUndefined();
  });

  it("returns 403 not_registered when lookupUser returns null", async () => {
    mockLookupUser.mockResolvedValue(null);

    const res = await getMeHandler(makeReq("GET", undefined, "/api/users/me"), {});
    expect(res.status).toBe(403);
    const body = JSON.parse(res.body as string);
    expect(body.error).toBe("not_registered");
  });
});

describe("GET /api/users", () => {
  it("lists all users", async () => {
    const users = [
      { id: "u1", displayName: "Alice", role: "owner", _rid: "r", _self: "s", _etag: "e", _attachments: "a", _ts: 1 },
      { id: "u2", displayName: "Bob", role: "member", _rid: "r", _self: "s", _etag: "e", _attachments: "a", _ts: 2 },
    ];
    mockQuery.mockResolvedValue({ resources: users });

    const res = await usersRouter(makeReq("GET", undefined, "/api/users"), {});
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body).toHaveLength(2);
    expect(body[0].id).toBe("u1");
    // Cosmos metadata stripped
    expect(body[0]._rid).toBeUndefined();
  });
});

describe("POST /api/users/invite", () => {
  it("creates invite and returns 201", async () => {
    mockQuery.mockResolvedValue({ resources: [] });
    mockCreate.mockResolvedValue({});

    const res = await usersRouter(
      makeReq("POST", { email: "new@example.com", role: "qa_engineer" }, "/api/users/invite"),
      {},
    );
    expect(res.status).toBe(201);
    const body = JSON.parse(res.body as string);
    expect(body.email).toBe("new@example.com");
    expect(body.role).toBe("qa_engineer");
    expect(body.status).toBe("invited");
    expect(mockCreate).toHaveBeenCalled();
  });

  it("returns 400 when email is missing", async () => {
    const res = await usersRouter(
      makeReq("POST", { role: "member" }, "/api/users/invite"),
      {},
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/email/i);
  });

  it("returns 409 for duplicate email", async () => {
    mockQuery.mockResolvedValue({ resources: [{ id: "existing" }] });

    const res = await usersRouter(
      makeReq("POST", { email: "dup@example.com", role: "member" }, "/api/users/invite"),
      {},
    );
    expect(res.status).toBe(409);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/already exists/i);
  });
});

describe("PUT /api/users/:id/role", () => {
  it("changes role successfully", async () => {
    const user = {
      id: "u1",
      tenantId: "kovai",
      role: "member",
      email: "u1@example.com",
      _rid: "r",
      _self: "s",
      _etag: "e",
      _attachments: "a",
      _ts: 1,
    };
    mockRead.mockResolvedValue({ resource: user });
    mockReplace.mockResolvedValue({});

    const res = await usersRouter(
      makeReq("PUT", { role: "qa_manager" }, "/api/users/u1/role"),
      {},
    );
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(body.role).toBe("qa_manager");
    expect(mockReplace).toHaveBeenCalled();
  });

  it("returns 400 for invalid role", async () => {
    mockRead.mockResolvedValue({ resource: { id: "u1", role: "member" } });

    const res = await usersRouter(
      makeReq("PUT", { role: "superadmin" }, "/api/users/u1/role"),
      {},
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/invalid role/i);
  });

  it("prevents removing last owner", async () => {
    const user = {
      id: "u1",
      tenantId: "kovai",
      role: "owner",
      email: "u1@example.com",
    };
    mockRead.mockResolvedValue({ resource: user });
    // Only one owner exists
    mockQuery.mockResolvedValue({ resources: [{ id: "u1" }] });

    const res = await usersRouter(
      makeReq("PUT", { role: "member" }, "/api/users/u1/role"),
      {},
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/owner/i);
  });
});

describe("DELETE /api/users/:id", () => {
  it("removes user successfully", async () => {
    mockRead.mockResolvedValue({ resource: { id: "other-user", role: "member", email: "other@example.com" } });
    mockItemDelete.mockResolvedValue({});

    const res = await usersRouter(
      makeReq("DELETE", undefined, "/api/users/other-user"),
      {},
    );
    expect(res.status).toBe(204);
    expect(mockItemDelete).toHaveBeenCalled();
  });

  it("returns 400 when trying to remove self", async () => {
    const res = await usersRouter(
      makeReq("DELETE", undefined, "/api/users/test-oid"),
      {},
    );
    expect(res.status).toBe(400);
    const body = JSON.parse(res.body as string);
    expect(body.error).toMatch(/yourself/i);
  });
});

describe("OPTIONS preflight", () => {
  it("returns 204 with CORS headers", async () => {
    const res = await usersRouter(makeReq("OPTIONS"), {});
    expect(res.status).toBe(204);
    expect(res.headers).toBeDefined();
  });
});
