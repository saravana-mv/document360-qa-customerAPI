/**
 * Unit tests for the Azure Function routers:
 *   - api/src/functions/projectVariables.ts  (GET / PUT /api/project-variables)
 *   - api/src/functions/aiCredits.ts         (GET /api/ai-credits, PUT project/user, GET users)
 *
 * erasableSyntaxOnly — no enums.
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

import { app } from "@azure/functions";

// ── Cosmos mocks ─────────────────────────────────────────────────────────────

const mockSettingsRead = jest.fn();
const mockSettingsUpsert = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getSettingsContainer: jest.fn().mockResolvedValue({
    item: (_id: string, _pk: string) => ({ read: () => mockSettingsRead() }),
    items: { upsert: (...args: unknown[]) => mockSettingsUpsert(...args) },
  }),
  getAiUsageContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: () => mockAiUsageQuery() }),
    },
  }),
}));

const mockAiUsageQuery = jest.fn();

// ── Auth mocks ───────────────────────────────────────────────────────────────

const mockIsSuperOwner = jest.fn().mockResolvedValue(true);
const mockLookupProjectMember = jest.fn().mockResolvedValue({ role: "owner" });

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: (req: any) => {
    const hdr = req.headers?.get?.("x-flowforge-projectid");
    if (!hdr) throw new Error("X-FlowForge-ProjectId header is required");
    return hdr;
  },
  parseClientPrincipal: () => ({ userDetails: "test@example.com" }),
  isSuperOwner: (...args: unknown[]) => mockIsSuperOwner(...args),
  lookupProjectMember: (...args: unknown[]) => mockLookupProjectMember(...args),
}));

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

// ── AI credits lib mocks ─────────────────────────────────────────────────────

const mockGetProjectCredits = jest.fn();
const mockGetUserCredits = jest.fn();
const mockSeedProjectCredits = jest.fn();
const mockUpdateProjectBudget = jest.fn();
const mockUpdateUserBudget = jest.fn();

jest.mock("../lib/aiCredits", () => ({
  getProjectCredits: (...args: unknown[]) => mockGetProjectCredits(...args),
  getUserCredits: (...args: unknown[]) => mockGetUserCredits(...args),
  seedProjectCredits: (...args: unknown[]) => mockSeedProjectCredits(...args),
  updateProjectBudget: (...args: unknown[]) => mockUpdateProjectBudget(...args),
  updateUserBudget: (...args: unknown[]) => mockUpdateUserBudget(...args),
}));

// ── Capture registered handlers ──────────────────────────────────────────────

type Handler = (req: any, ctx: any) => Promise<any>;
const handlers: Record<string, Handler> = {};

(app.http as jest.Mock).mockImplementation((name: string, opts: any) => {
  handlers[name] = opts.handler;
});

// Import after mocks are in place — triggers app.http registration
require("../functions/projectVariables");
require("../functions/aiCredits");

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeReq(
  method: string,
  body?: unknown,
  urlPath = "/api/project-variables",
  headers?: [string, string][]
) {
  const hdrMap = new Map<string, string>([
    ["x-flowforge-projectid", "test-project"],
    ["x-ms-client-principal", ""],
    ...(headers ?? []),
  ]);
  return {
    method,
    headers: hdrMap,
    params: {},
    json: () => Promise.resolve(body),
    query: new URLSearchParams(),
    url: `https://example.com${urlPath}`,
  };
}

function parseBody(res: any): any {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

const ctx = {} as any;

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockIsSuperOwner.mockResolvedValue(true);
  mockLookupProjectMember.mockResolvedValue({ role: "owner" });
});

// ═══════════════════════════════════════════════════════════════════════════════
// projectVariables
// ═══════════════════════════════════════════════════════════════════════════════

describe("projectVariables router", () => {
  const handler = () => handlers["projectVariables"];

  it("OPTIONS returns 204 with CORS headers", async () => {
    const res = await handler()(makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
    expect(res.headers["Access-Control-Allow-Origin"]).toBe("*");
  });

  it("GET returns variables from Cosmos doc", async () => {
    const vars = [{ name: "baseUrl", value: "https://api.example.com" }];
    mockSettingsRead.mockResolvedValueOnce({ resource: { variables: vars } });

    const res = await handler()(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ variables: vars });
  });

  it("GET returns empty array when Cosmos doc is missing", async () => {
    mockSettingsRead.mockResolvedValueOnce({ resource: undefined });

    const res = await handler()(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ variables: [] });
  });

  it("GET returns empty array when Cosmos read throws", async () => {
    mockSettingsRead.mockRejectedValueOnce(new Error("not found"));

    const res = await handler()(makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ variables: [] });
  });

  it("GET returns 400 when project ID header is missing", async () => {
    const req = { ...makeReq("GET"), headers: new Map<string, string>() };
    const res = await handler()(req, ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toContain("Project ID");
  });

  it("PUT saves variables and returns them", async () => {
    const vars = [{ name: "token", value: "abc123" }];
    mockSettingsUpsert.mockResolvedValueOnce({});

    const res = await handler()(makeReq("PUT", { variables: vars }), ctx);
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ variables: vars });
    expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);
  });

  it("PUT rejects invalid variable names", async () => {
    const vars = [{ name: "123bad", value: "x" }];

    const res = await handler()(makeReq("PUT", { variables: vars }), ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toContain("Invalid variable name");
  });

  it("PUT rejects duplicate variable names", async () => {
    const vars = [
      { name: "foo", value: "1" },
      { name: "foo", value: "2" },
    ];

    const res = await handler()(makeReq("PUT", { variables: vars }), ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toContain("Duplicate");
  });

  it("PUT rejects non-string variable values", async () => {
    const vars = [{ name: "num", value: 42 }];

    const res = await handler()(makeReq("PUT", { variables: vars }), ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toContain("must be a string");
  });

  it("PUT returns 403 for non-super-owner member role", async () => {
    mockIsSuperOwner.mockResolvedValueOnce(false);
    mockLookupProjectMember.mockResolvedValueOnce({ role: "member" });

    const res = await handler()(makeReq("PUT", { variables: [] }), ctx);
    expect(res.status).toBe(403);
    expect(parseBody(res).error).toContain("QA Manager or above");
  });

  it("PUT allows qa_manager role when not super owner", async () => {
    mockIsSuperOwner.mockResolvedValueOnce(false);
    mockLookupProjectMember.mockResolvedValueOnce({ role: "qa_manager" });
    mockSettingsUpsert.mockResolvedValueOnce({});

    const res = await handler()(makeReq("PUT", { variables: [] }), ctx);
    expect(res.status).toBe(200);
  });

  it("PUT returns 400 for invalid JSON body", async () => {
    const req = makeReq("PUT");
    req.json = () => Promise.reject(new Error("bad json"));

    const res = await handler()(req, ctx);
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toContain("Invalid JSON");
  });

  it("unsupported method returns 405", async () => {
    const res = await handler()(makeReq("DELETE"), ctx);
    expect(res.status).toBe(405);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// aiCredits
// ═══════════════════════════════════════════════════════════════════════════════

describe("aiCredits router (GET /api/ai-credits)", () => {
  const handler = () => handlers["aiCredits"];

  it("OPTIONS returns 204", async () => {
    const res = await handler()(makeReq("OPTIONS", undefined, "/api/ai-credits"), ctx);
    expect(res.status).toBe(204);
  });

  it("GET returns project and user credits", async () => {
    mockGetProjectCredits.mockResolvedValueOnce({
      totalBudgetUsd: 5.0,
      usedUsd: 1.0,
      callCount: 10,
      lastUsedAt: "2026-04-01",
    });
    mockGetUserCredits.mockResolvedValueOnce({
      totalBudgetUsd: 2.0,
      usedUsd: 0.5,
      callCount: 3,
      lastUsedAt: "2026-04-02",
    });

    const res = await handler()(makeReq("GET", undefined, "/api/ai-credits"), ctx);
    expect(res.status).toBe(200);

    const body = parseBody(res);
    expect(body.project.totalBudgetUsd).toBe(5.0);
    expect(body.project.remainingUsd).toBe(4.0);
    expect(body.user.totalBudgetUsd).toBe(2.0);
    expect(body.user.remainingUsd).toBe(1.5);
  });

  it("GET seeds project credits when missing", async () => {
    mockGetProjectCredits.mockResolvedValueOnce(null); // first call
    mockSeedProjectCredits.mockResolvedValueOnce(undefined);
    mockGetProjectCredits.mockResolvedValueOnce({
      totalBudgetUsd: 5.0,
      usedUsd: 0,
      callCount: 0,
      lastUsedAt: null,
    });
    mockGetUserCredits.mockResolvedValueOnce(null);

    const res = await handler()(makeReq("GET", undefined, "/api/ai-credits"), ctx);
    expect(res.status).toBe(200);
    expect(mockSeedProjectCredits).toHaveBeenCalledTimes(1);
  });

  it("unsupported method returns 405", async () => {
    const res = await handler()(makeReq("PUT", {}, "/api/ai-credits"), ctx);
    expect(res.status).toBe(405);
  });
});

describe("aiCreditsProject router (PUT /api/ai-credits/project)", () => {
  const handler = () => handlers["aiCreditsProject"];

  it("PUT updates project budget for Super Owner", async () => {
    mockUpdateProjectBudget.mockResolvedValueOnce({
      totalBudgetUsd: 10.0,
      usedUsd: 1.0,
    });

    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: 10.0 }, "/api/ai-credits/project"),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.totalBudgetUsd).toBe(10.0);
    expect(body.remainingUsd).toBe(9.0);
  });

  it("PUT returns 403 for non-Super Owner", async () => {
    mockIsSuperOwner.mockResolvedValueOnce(false);

    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: 10.0 }, "/api/ai-credits/project"),
      ctx
    );
    expect(res.status).toBe(403);
    expect(parseBody(res).error).toContain("Super Owner");
  });

  it("PUT returns 400 for invalid budget", async () => {
    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: -5 }, "/api/ai-credits/project"),
      ctx
    );
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toContain("non-negative");
  });

  it("PUT returns 404 when project credits not found", async () => {
    mockUpdateProjectBudget.mockResolvedValueOnce(null);

    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: 10.0 }, "/api/ai-credits/project"),
      ctx
    );
    expect(res.status).toBe(404);
  });
});

describe("aiCreditsUser router (PUT /api/ai-credits/user/{userId})", () => {
  const handler = () => handlers["aiCreditsUser"];

  it("PUT updates user budget for Super Owner", async () => {
    mockUpdateUserBudget.mockResolvedValueOnce({
      totalBudgetUsd: 3.0,
      usedUsd: 0.5,
    });

    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: 3.0 }, "/api/ai-credits/user/user-42"),
      ctx
    );
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.totalBudgetUsd).toBe(3.0);
    expect(body.remainingUsd).toBe(2.5);
  });

  it("PUT returns 403 for non-Super Owner", async () => {
    mockIsSuperOwner.mockResolvedValueOnce(false);

    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: 3.0 }, "/api/ai-credits/user/user-42"),
      ctx
    );
    expect(res.status).toBe(403);
  });

  it("PUT returns 400 when userId is missing from path", async () => {
    // URL has no user segment after /user/
    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: 3.0 }, "/api/ai-credits/user"),
      ctx
    );
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toContain("User ID");
  });

  it("PUT returns 400 for negative budget", async () => {
    const res = await handler()(
      makeReq("PUT", { totalBudgetUsd: -1 }, "/api/ai-credits/user/user-42"),
      ctx
    );
    expect(res.status).toBe(400);
  });
});

describe("aiCreditsUsers router (GET /api/ai-credits/users)", () => {
  const handler = () => handlers["aiCreditsUsers"];

  it("GET returns list of user credit docs for Super Owner", async () => {
    const docs = [
      {
        userId: "u1",
        displayName: "Alice",
        totalBudgetUsd: 2.0,
        usedUsd: 0.5,
        callCount: 3,
        lastUsedAt: "2026-04-01",
      },
    ];
    mockAiUsageQuery.mockResolvedValueOnce({ resources: docs });

    const res = await handler()(makeReq("GET", undefined, "/api/ai-credits/users"), ctx);
    expect(res.status).toBe(200);

    const body = parseBody(res);
    expect(body).toHaveLength(1);
    expect(body[0].userId).toBe("u1");
    expect(body[0].remainingUsd).toBe(1.5);
  });

  it("GET returns 403 for non-Super Owner", async () => {
    mockIsSuperOwner.mockResolvedValueOnce(false);

    const res = await handler()(makeReq("GET", undefined, "/api/ai-credits/users"), ctx);
    expect(res.status).toBe(403);
    expect(parseBody(res).error).toContain("Super Owner");
  });

  it("unsupported method returns 405", async () => {
    const res = await handler()(makeReq("DELETE", undefined, "/api/ai-credits/users"), ctx);
    expect(res.status).toBe(405);
  });
});
