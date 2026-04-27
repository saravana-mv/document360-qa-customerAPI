/**
 * Unit tests for api/src/functions/projects.ts
 *
 * Two routers:
 *   projects      — GET (handleList), POST (handleCreate), OPTIONS
 *   projectsItem  — PUT (handleUpdate), DELETE (handleDelete), OPTIONS
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { app } from "@azure/functions";

// ── Mock fns ──────────────────────────────────────────────────────────────────

const mockProjectQuery = jest.fn();
const mockProjectCreate = jest.fn();
const mockProjectUpsert = jest.fn();
const mockProjectRead = jest.fn();
const mockProjectReplace = jest.fn();
const mockProjectDelete = jest.fn();
const mockMemberQuery = jest.fn();
const mockMemberCreate = jest.fn();
const mockMemberUpsert = jest.fn();
const mockGenericQuery = jest.fn();
const mockGenericDelete = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getProjectsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockProjectQuery() }),
      create: (...args: unknown[]) => mockProjectCreate(...args),
      upsert: (...args: unknown[]) => mockProjectUpsert(...args),
    },
    item: () => ({
      read: () => mockProjectRead(),
      replace: (...args: unknown[]) => mockProjectReplace(...args),
      delete: () => mockProjectDelete(),
    }),
  }),
  getProjectMembersContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockMemberQuery() }),
      create: (...args: unknown[]) => mockMemberCreate(...args),
      upsert: (...args: unknown[]) => mockMemberUpsert(...args),
    },
    item: () => ({ read: jest.fn(), delete: jest.fn() }),
  }),
  getFlowsContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
  getIdeasContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
  getTestRunsContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
  getAuditLogContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
  getFlowChatSessionsContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
  getApiKeysContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
  getSettingsContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
  getAiUsageContainer: jest.fn().mockResolvedValue({ items: { query: () => ({ fetchAll: () => mockGenericQuery() }) }, item: () => ({ delete: () => mockGenericDelete() }) }),
}));

const mockLookupUser = jest.fn().mockResolvedValue({ role: "owner", status: "active" });
const mockIsSuperOwner = jest.fn().mockResolvedValue(true);
const mockLookupProjectMember = jest.fn().mockResolvedValue({ role: "owner" });

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  withRole: (_roles: string[], fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
  lookupUser: (...args: unknown[]) => mockLookupUser(...args),
  isSuperOwner: (...args: unknown[]) => mockIsSuperOwner(...args),
  lookupProjectMember: (...args: unknown[]) => mockLookupProjectMember(...args),
}));

jest.mock("../lib/blobClient", () => ({
  listBlobs: jest.fn().mockResolvedValue([]),
  deleteBlob: jest.fn().mockResolvedValue(undefined),
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));
jest.mock("../lib/aiCredits", () => ({ seedProjectCredits: jest.fn().mockResolvedValue(undefined) }));

// ── Capture registered handlers ───────────────────────────────────────────────

type Handler = (req: any, ctx: any) => Promise<any>;
const handlers: Record<string, Handler> = {};

(app.http as jest.Mock).mockImplementation((name: string, opts: any) => {
  handlers[name] = opts.handler;
});

// Import after mocks are in place
require("../functions/projects");

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(method: string, body?: unknown, urlPath = "/api/projects") {
  return {
    method,
    headers: new Map<string, string>([
      ["x-flowforge-projectid", "test-project"],
      ["x-ms-client-principal", ""],
    ]),
    params: {},
    json: () => Promise.resolve(body),
    query: new URLSearchParams(),
    url: `https://example.com${urlPath}`,
  };
}

const ctx = {} as any;

function parseBody(res: any): any {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuperOwner.mockResolvedValue(true);
  mockLookupUser.mockResolvedValue({ role: "owner", status: "active" });
  mockLookupProjectMember.mockResolvedValue({ role: "owner" });
  mockGenericQuery.mockResolvedValue({ resources: [] });
});

// ── Tests: projects router (GET / POST / OPTIONS) ─────────────────────────────

describe("projects router", () => {
  const call = (req: any) => handlers["projects"](req, ctx);

  test("OPTIONS returns 204", async () => {
    const res = await call(makeReq("OPTIONS"));
    expect(res.status).toBe(204);
  });

  test("GET — super owner sees all projects", async () => {
    const projects = [
      { id: "p1", name: "Project 1", tenantId: "kovai", status: "active" },
      { id: "p2", name: "Project 2", tenantId: "kovai", status: "active" },
    ];
    mockProjectQuery.mockResolvedValue({ resources: projects });

    const res = await call(makeReq("GET"));
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body).toHaveLength(2);
    expect(body[0].name).toBe("Project 1");
    expect(body[1].name).toBe("Project 2");
  });

  test("GET — auto-seeds default project when none exist", async () => {
    mockProjectQuery.mockResolvedValue({ resources: [] });

    const res = await call(makeReq("GET"));
    expect(res.status).toBe(200);
    // Should have upserted the project and a membership
    expect(mockProjectUpsert).toHaveBeenCalledTimes(1);
    expect(mockMemberUpsert).toHaveBeenCalledTimes(1);
    const body = parseBody(res);
    expect(body).toHaveLength(1);
    expect(body[0].name).toBe("Default Project");
    expect(body[0].id).toBe("test-project");
  });

  test("POST — creates project with membership and AI credits", async () => {
    mockProjectCreate.mockResolvedValue({});
    mockMemberCreate.mockResolvedValue({});

    const res = await call(makeReq("POST", { name: "My Project", description: "Desc" }));
    expect(res.status).toBe(201);
    const body = parseBody(res);
    expect(body.name).toBe("My Project");
    expect(body.description).toBe("Desc");
    expect(mockProjectCreate).toHaveBeenCalledTimes(1);
    expect(mockMemberCreate).toHaveBeenCalledTimes(1);
    // AI credits seeded
    const { seedProjectCredits } = require("../lib/aiCredits");
    expect(seedProjectCredits).toHaveBeenCalledTimes(1);
  });

  test("POST — missing name returns 400", async () => {
    const res = await call(makeReq("POST", {}));
    expect(res.status).toBe(400);
    const body = parseBody(res);
    expect(body.error).toContain("name is required");
  });

  test("POST — insufficient role returns 403", async () => {
    mockLookupUser.mockResolvedValue({ role: "qa_engineer", status: "active" });

    const res = await call(makeReq("POST", { name: "Nope" }));
    expect(res.status).toBe(403);
    const body = parseBody(res);
    expect(body.error).toContain("Project Owner role");
  });

  test("unsupported method returns 405", async () => {
    const res = await call(makeReq("PATCH"));
    expect(res.status).toBe(405);
    const body = parseBody(res);
    expect(body.error).toBe("Method Not Allowed");
  });
});

// ── Tests: projectsItem router (PUT / DELETE / OPTIONS) ───────────────────────

describe("projectsItem router", () => {
  const call = (req: any) => handlers["projectsItem"](req, ctx);

  test("OPTIONS returns 204", async () => {
    const res = await call(makeReq("OPTIONS", undefined, "/api/projects/p1"));
    expect(res.status).toBe(204);
  });

  test("PUT — updates project name and description", async () => {
    mockProjectRead.mockResolvedValue({
      resource: { id: "p1", tenantId: "kovai", name: "Old", description: "Old desc", status: "active" },
    });
    mockProjectReplace.mockResolvedValue({});

    const res = await call(
      makeReq("PUT", { name: "New Name", description: "New desc" }, "/api/projects/p1"),
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.name).toBe("New Name");
    expect(body.description).toBe("New desc");
    expect(mockProjectReplace).toHaveBeenCalledTimes(1);
  });

  test("PUT — project not found returns 404", async () => {
    mockProjectRead.mockResolvedValue({ resource: null });

    const res = await call(
      makeReq("PUT", { name: "X" }, "/api/projects/missing"),
    );
    expect(res.status).toBe(404);
    const body = parseBody(res);
    expect(body.error).toBe("Project not found");
  });

  test("DELETE — deletes project and all related resources", async () => {
    mockProjectRead.mockResolvedValue({
      resource: { id: "p1", tenantId: "kovai", name: "Doomed", status: "active" },
    });
    mockGenericQuery.mockResolvedValue({ resources: [{ id: "doc1" }] });
    mockGenericDelete.mockResolvedValue({});
    mockProjectDelete.mockResolvedValue({});

    const res = await call(
      makeReq("DELETE", undefined, "/api/projects/p1"),
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.deleted).toBe(true);
    expect(body.id).toBe("p1");
    expect(body.cleanup).toBeDefined();
    // Project doc itself should be deleted
    expect(mockProjectDelete).toHaveBeenCalled();
  });

  test("DELETE — non-super-owner returns 403", async () => {
    mockIsSuperOwner.mockResolvedValue(false);

    const res = await call(
      makeReq("DELETE", undefined, "/api/projects/p1"),
    );
    expect(res.status).toBe(403);
    const body = parseBody(res);
    expect(body.error).toContain("Super Owners");
  });

  test("unsupported method returns 405", async () => {
    const res = await call(makeReq("GET", undefined, "/api/projects/p1"));
    expect(res.status).toBe(405);
    const body = parseBody(res);
    expect(body.error).toBe("Method Not Allowed");
  });
});
