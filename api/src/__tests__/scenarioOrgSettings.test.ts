/* eslint-disable @typescript-eslint/no-explicit-any */
import { app } from "@azure/functions";

const mockFlowsRead = jest.fn();
const mockFlowsUpsert = jest.fn();
const mockSettingsRead = jest.fn();
const mockSettingsUpsert = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getFlowsContainer: jest.fn().mockResolvedValue({
    items: { upsert: (...args: unknown[]) => mockFlowsUpsert(...args) },
    item: () => ({ read: () => mockFlowsRead() }),
  }),
  getSettingsContainer: jest.fn().mockResolvedValue({
    items: { upsert: (...args: unknown[]) => mockSettingsUpsert(...args) },
    item: () => ({ read: () => mockSettingsRead() }),
  }),
}));

jest.mock("../lib/auth", () => ({
  withAuth: (fn: Function) => fn,
  getUserInfo: () => ({ oid: "test-oid", name: "Test User" }),
  getProjectId: () => "test-project",
  ProjectIdMissingError: class extends Error {
    constructor() {
      super("X-FlowForge-ProjectId header is required");
    }
  },
}));

type Handler = (req: any, ctx: any) => Promise<any>;
const handlers: Record<string, Handler> = {};

(app.http as jest.Mock).mockImplementation((name: string, opts: any) => {
  handlers[name] = opts.handler;
});

// Import after mocks are in place
require("../functions/scenarioOrg");
require("../functions/settings");

/* ---------- helpers ---------- */
function makeReq(method: string, body?: unknown) {
  return {
    method,
    headers: new Map([["x-flowforge-projectid", "test-project"]]),
    json: body !== undefined
      ? () => Promise.resolve(body)
      : () => Promise.reject(new Error("no body")),
  };
}

const ctx = {} as any;

function parseBody(res: any): any {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFlowsRead.mockResolvedValue({ resource: null });
  mockFlowsUpsert.mockResolvedValue({});
  mockSettingsRead.mockResolvedValue({ resource: null });
  mockSettingsUpsert.mockResolvedValue({});
});

/* ====================================================================== */
/*  scenarioOrg                                                           */
/* ====================================================================== */
describe("scenarioOrg", () => {
  it("OPTIONS returns 204", async () => {
    const res = await handlers["scenarioOrg"](makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  it("GET returns defaults when no doc exists", async () => {
    mockFlowsRead.mockRejectedValueOnce(new Error("not found"));
    const res = await handlers["scenarioOrg"](makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body).toEqual({
      versionConfigs: {},
      scenarioConfigs: {},
      folders: {},
      placements: {},
    });
  });

  it("GET returns saved doc data", async () => {
    const doc = {
      id: "__scenario_org__",
      projectId: "test-project",
      type: "scenario_org",
      versionConfigs: { v1: { baseUrl: "https://api.example.com", apiVersion: "v1" } },
      scenarioConfigs: { "flow.xml": { env: "staging" } },
      folders: { root: ["child1"] },
      placements: { child1: "root" },
      updatedAt: "2026-01-01T00:00:00.000Z",
      updatedBy: { oid: "test-oid", name: "Test User" },
    };
    mockFlowsRead.mockResolvedValueOnce({ resource: doc });

    const res = await handlers["scenarioOrg"](makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body.versionConfigs).toEqual(doc.versionConfigs);
    expect(body.scenarioConfigs).toEqual(doc.scenarioConfigs);
    expect(body.folders).toEqual(doc.folders);
    expect(body.placements).toEqual(doc.placements);
  });

  it("PUT saves and returns doc", async () => {
    const payload = {
      versionConfigs: { v2: { baseUrl: "https://api.test.com", apiVersion: "v2" } },
      folders: { root: ["a"] },
      placements: { a: "root" },
    };

    const res = await handlers["scenarioOrg"](makeReq("PUT", payload), ctx);
    expect(res.status).toBe(200);
    expect(mockFlowsUpsert).toHaveBeenCalledTimes(1);

    const upserted = mockFlowsUpsert.mock.calls[0][0];
    expect(upserted.id).toBe("__scenario_org__");
    expect(upserted.projectId).toBe("test-project");
    expect(upserted.versionConfigs).toEqual(payload.versionConfigs);
    expect(upserted.folders).toEqual(payload.folders);
    expect(upserted.placements).toEqual(payload.placements);

    const body = parseBody(res);
    expect(body.versionConfigs).toEqual(payload.versionConfigs);
    expect(body.folders).toEqual(payload.folders);
    expect(body.placements).toEqual(payload.placements);
  });

  it("PUT with missing required fields returns 400", async () => {
    const res = await handlers["scenarioOrg"](
      makeReq("PUT", { versionConfigs: {} }),
      ctx,
    );
    expect(res.status).toBe(400);
    const body = parseBody(res);
    expect(body.error).toMatch(/required/i);
  });

  it("unsupported method returns 405", async () => {
    const res = await handlers["scenarioOrg"](makeReq("DELETE"), ctx);
    expect(res.status).toBe(405);
    const body = parseBody(res);
    expect(body.error).toBe("Method Not Allowed");
  });
});

/* ====================================================================== */
/*  settings                                                              */
/* ====================================================================== */
describe("settings", () => {
  it("OPTIONS returns 204", async () => {
    const res = await handlers["settings"](makeReq("OPTIONS"), ctx);
    expect(res.status).toBe(204);
  });

  it("GET returns empty object when no settings exist", async () => {
    mockSettingsRead.mockRejectedValueOnce(new Error("not found"));
    const res = await handlers["settings"](makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);
    expect(body).toEqual({});
  });

  it("GET returns settings with Cosmos metadata stripped", async () => {
    mockSettingsRead.mockResolvedValueOnce({
      resource: {
        id: "user_settings",
        userId: "test-oid",
        selectedProjectId: "proj-1",
        baseUrl: "https://api.example.com",
        apiVersion: "v2",
        aiModel: "claude-sonnet-4-20250514",
        updatedAt: "2026-01-01T00:00:00.000Z",
        _rid: "abc123",
        _self: "dbs/db/colls/col/docs/doc",
        _etag: "\"etag\"",
        _attachments: "attachments/",
        _ts: 1700000000,
      },
    });

    const res = await handlers["settings"](makeReq("GET"), ctx);
    expect(res.status).toBe(200);
    const body = parseBody(res);

    // App fields present
    expect(body.selectedProjectId).toBe("proj-1");
    expect(body.baseUrl).toBe("https://api.example.com");
    expect(body.aiModel).toBe("claude-sonnet-4-20250514");

    // Cosmos metadata and key fields stripped
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("userId");
    expect(body).not.toHaveProperty("_rid");
    expect(body).not.toHaveProperty("_self");
    expect(body).not.toHaveProperty("_etag");
    expect(body).not.toHaveProperty("_attachments");
    expect(body).not.toHaveProperty("_ts");
  });

  it("PUT upserts settings merged with existing", async () => {
    // Existing doc in Cosmos
    mockSettingsRead.mockResolvedValueOnce({
      resource: {
        id: "user_settings",
        userId: "test-oid",
        selectedProjectId: "proj-old",
        baseUrl: "https://old.example.com",
        updatedAt: "2025-12-01T00:00:00.000Z",
      },
    });

    const payload = { selectedProjectId: "proj-new", aiModel: "claude-sonnet-4-20250514" };
    const res = await handlers["settings"](makeReq("PUT", payload), ctx);
    expect(res.status).toBe(200);
    expect(mockSettingsUpsert).toHaveBeenCalledTimes(1);

    const upserted = mockSettingsUpsert.mock.calls[0][0];
    // Merged: old baseUrl preserved, new fields applied
    expect(upserted.baseUrl).toBe("https://old.example.com");
    expect(upserted.selectedProjectId).toBe("proj-new");
    expect(upserted.aiModel).toBe("claude-sonnet-4-20250514");
    // Fixed fields
    expect(upserted.id).toBe("user_settings");
    expect(upserted.userId).toBe("test-oid");

    const body = parseBody(res);
    expect(body.selectedProjectId).toBe("proj-new");
    expect(body).not.toHaveProperty("id");
    expect(body).not.toHaveProperty("userId");
  });

  it("unsupported method returns 405", async () => {
    const res = await handlers["settings"](makeReq("PATCH"), ctx);
    expect(res.status).toBe(405);
    const body = parseBody(res);
    expect(body.error).toBe("Method Not Allowed");
  });
});
