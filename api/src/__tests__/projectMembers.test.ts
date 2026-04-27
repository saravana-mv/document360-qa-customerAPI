import type { HttpRequest, HttpResponseInit } from "@azure/functions";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockMemberQuery = jest.fn();
const mockMemberCreate = jest.fn();
const mockMemberRead = jest.fn();
const mockMemberReplace = jest.fn();
const mockMemberDelete = jest.fn();
const mockUserQuery = jest.fn();
const mockUserCreate = jest.fn();
const mockProjectRead = jest.fn();
const mockProjectReplace = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getProjectMembersContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockMemberQuery() }),
      create: (...args: unknown[]) => mockMemberCreate(...args),
    },
    item: () => ({
      read: () => mockMemberRead(),
      replace: (...args: unknown[]) => mockMemberReplace(...args),
      delete: () => mockMemberDelete(),
    }),
  }),
  getUsersContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockUserQuery() }),
      create: (...args: unknown[]) => mockUserCreate(...args),
    },
  }),
  getProjectsContainer: jest.fn().mockResolvedValue({
    item: () => ({
      read: () => mockProjectRead(),
      replace: (...args: unknown[]) => mockProjectReplace(...args),
    }),
  }),
}));

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
  lookupUser: jest.fn().mockResolvedValue({ role: "owner" }),
  isSuperOwner: jest.fn().mockResolvedValue(true),
  lookupProjectMember: jest.fn().mockResolvedValue({ role: "owner" }),
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

// ── Import handlers (after mocks) ───────────────────────────────────────────

import "../functions/projectMembers";
import { app } from "@azure/functions";

const registeredHandlers: Record<string, Function> = {};
const calls = (app.http as jest.Mock).mock.calls;
for (const call of calls) {
  const [name, opts] = call;
  registeredHandlers[name] = opts.handler;
}

const membersHandler = registeredHandlers["projectMembers"] as (
  req: unknown,
  ctx: unknown,
) => Promise<HttpResponseInit>;

const membersItemHandler = registeredHandlers["projectMembersItem"] as (
  req: unknown,
  ctx: unknown,
) => Promise<HttpResponseInit>;

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  body?: unknown,
  urlPath = "/api/project-members",
  queryParams?: Record<string, string>,
) {
  const query = new URLSearchParams(queryParams);
  return {
    method,
    headers: new Map([["x-flowforge-projectid", "test-project"]]),
    params: {},
    json: () => Promise.resolve(body),
    query,
    url: `https://example.com${urlPath}${query.toString() ? "?" + query.toString() : ""}`,
  };
}

const mockCtx = {} as unknown;

function parseBody(res: HttpResponseInit): unknown {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

// ── Tests ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  // Sensible defaults
  mockMemberQuery.mockResolvedValue({ resources: [] });
  mockMemberCreate.mockResolvedValue({});
  mockMemberRead.mockResolvedValue({ resource: null });
  mockMemberReplace.mockResolvedValue({});
  mockMemberDelete.mockResolvedValue({});
  mockUserQuery.mockResolvedValue({ resources: [] });
  mockUserCreate.mockResolvedValue({});
  mockProjectRead.mockResolvedValue({ resource: { memberCount: 1 } });
  mockProjectReplace.mockResolvedValue({});
});

describe("projectMembers — collection router", () => {
  it("OPTIONS returns 204", async () => {
    const req = makeReq("OPTIONS");
    const res = await membersHandler(req, mockCtx);
    expect(res.status).toBe(204);
  });

  it("GET lists members for super owner", async () => {
    const members = [
      { id: "m1", projectId: "test-project", email: "a@b.com", role: "owner", displayName: "A" },
      { id: "m2", projectId: "test-project", email: "c@d.com", role: "qa_engineer", displayName: "C" },
    ];
    mockMemberQuery.mockResolvedValue({ resources: members });

    const req = makeReq("GET", undefined, "/api/project-members", { projectId: "test-project" });
    const res = await membersHandler(req, mockCtx);

    expect(res.status).toBe(200);
    const body = parseBody(res) as unknown[];
    expect(body).toHaveLength(2);
  });

  it("GET returns 400 when projectId missing", async () => {
    const req = makeReq("GET");
    const res = await membersHandler(req, mockCtx);
    expect(res.status).toBe(400);
    expect(parseBody(res)).toEqual(expect.objectContaining({ error: expect.stringContaining("projectId") }));
  });

  it("POST adds a member and creates membership doc", async () => {
    mockMemberQuery.mockResolvedValue({ resources: [] }); // no duplicate
    mockUserQuery.mockResolvedValue({ resources: [{ id: "existing-user" }] }); // user exists at tenant level

    const req = makeReq("POST", {
      projectId: "test-project",
      email: "new@user.com",
      role: "qa_engineer",
    });
    const res = await membersHandler(req, mockCtx);

    expect(res.status).toBe(201);
    expect(mockMemberCreate).toHaveBeenCalledTimes(1);
    const createdDoc = mockMemberCreate.mock.calls[0][0];
    expect(createdDoc.email).toBe("new@user.com");
    expect(createdDoc.role).toBe("qa_engineer");
    expect(createdDoc.projectId).toBe("test-project");
  });

  it("POST returns 400 when required fields missing", async () => {
    const req = makeReq("POST", { projectId: "test-project" }); // missing email, role
    const res = await membersHandler(req, mockCtx);
    expect(res.status).toBe(400);
  });

  it("POST returns 409 for duplicate member", async () => {
    mockMemberQuery.mockResolvedValue({
      resources: [{ id: "existing", email: "dup@user.com" }],
    });

    const req = makeReq("POST", {
      projectId: "test-project",
      email: "dup@user.com",
      role: "qa_engineer",
    });
    const res = await membersHandler(req, mockCtx);

    expect(res.status).toBe(409);
    expect(parseBody(res)).toEqual(expect.objectContaining({ error: expect.stringContaining("already a member") }));
  });

  it("POST auto-creates tenant-level user doc when user does not exist", async () => {
    mockMemberQuery.mockResolvedValue({ resources: [] }); // no duplicate
    mockUserQuery.mockResolvedValue({ resources: [] }); // user NOT at tenant level

    const req = makeReq("POST", {
      projectId: "test-project",
      email: "brand-new@user.com",
      role: "qa_engineer",
    });
    const res = await membersHandler(req, mockCtx);

    expect(res.status).toBe(201);
    expect(mockUserCreate).toHaveBeenCalledTimes(1);
    const userDoc = mockUserCreate.mock.calls[0][0];
    expect(userDoc.email).toBe("brand-new@user.com");
    expect(userDoc.role).toBe("member");
    expect(userDoc.tenantId).toBe("kovai");
  });

  it("unsupported method returns 405", async () => {
    const req = makeReq("PATCH");
    const res = await membersHandler(req, mockCtx);
    expect(res.status).toBe(405);
  });
});

describe("projectMembersItem — item router", () => {
  it("OPTIONS returns 204", async () => {
    const req = makeReq("OPTIONS", undefined, "/api/project-members/member-123");
    const res = await membersItemHandler(req, mockCtx);
    expect(res.status).toBe(204);
  });

  it("PUT changes a member role", async () => {
    mockMemberRead.mockResolvedValue({
      resource: {
        id: "member-123",
        projectId: "test-project",
        email: "user@test.com",
        role: "qa_engineer",
      },
    });

    const req = makeReq("PUT", { projectId: "test-project", role: "qa_manager" }, "/api/project-members/member-123");
    const res = await membersItemHandler(req, mockCtx);

    expect(res.status).toBe(200);
    expect(mockMemberReplace).toHaveBeenCalledTimes(1);
    const replaced = mockMemberReplace.mock.calls[0][0];
    expect(replaced.role).toBe("qa_manager");
  });

  it("PUT returns 400 when member ID missing", async () => {
    const req = makeReq("PUT", { projectId: "test-project", role: "qa_manager" }, "/api/project-members");
    const res = await membersItemHandler(req, mockCtx);
    expect(res.status).toBe(400);
    expect(parseBody(res)).toEqual(expect.objectContaining({ error: expect.stringContaining("Member ID") }));
  });

  it("PUT prevents removing last owner", async () => {
    mockMemberRead.mockResolvedValue({
      resource: {
        id: "owner-1",
        projectId: "test-project",
        email: "owner@test.com",
        role: "owner",
      },
    });
    // Only one owner in the project
    mockMemberQuery.mockResolvedValue({ resources: [{ id: "owner-1" }] });

    const req = makeReq("PUT", { projectId: "test-project", role: "qa_engineer" }, "/api/project-members/owner-1");
    const res = await membersItemHandler(req, mockCtx);

    expect(res.status).toBe(400);
    expect(parseBody(res)).toEqual(expect.objectContaining({ error: expect.stringContaining("owner") }));
  });

  it("DELETE removes a member", async () => {
    mockMemberRead.mockResolvedValue({
      resource: {
        id: "member-456",
        projectId: "test-project",
        email: "remove@test.com",
        role: "qa_engineer",
      },
    });

    const req = makeReq(
      "DELETE",
      undefined,
      "/api/project-members/member-456",
      { projectId: "test-project" },
    );
    const res = await membersItemHandler(req, mockCtx);

    expect(res.status).toBe(200);
    expect(mockMemberDelete).toHaveBeenCalledTimes(1);
    const body = parseBody(res) as Record<string, unknown>;
    expect(body.removed).toBe(true);
  });

  it("DELETE prevents removing last owner", async () => {
    mockMemberRead.mockResolvedValue({
      resource: {
        id: "owner-only",
        projectId: "test-project",
        email: "sole-owner@test.com",
        role: "owner",
      },
    });
    mockMemberQuery.mockResolvedValue({ resources: [{ id: "owner-only" }] });

    const req = makeReq(
      "DELETE",
      undefined,
      "/api/project-members/owner-only",
      { projectId: "test-project" },
    );
    const res = await membersItemHandler(req, mockCtx);

    expect(res.status).toBe(400);
    expect(parseBody(res)).toEqual(expect.objectContaining({ error: expect.stringContaining("last project owner") }));
  });

  it("unsupported method returns 405", async () => {
    const req = makeReq("GET", undefined, "/api/project-members/member-123");
    const res = await membersItemHandler(req, mockCtx);
    expect(res.status).toBe(405);
  });
});
