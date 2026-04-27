/* eslint-disable @typescript-eslint/no-explicit-any */
import { app } from "@azure/functions";

const mockRead = jest.fn();
const mockUpsert = jest.fn();

jest.mock("../lib/cosmosClient", () => ({
  getFlowsContainer: jest.fn().mockResolvedValue({
    items: { upsert: (...args: unknown[]) => mockUpsert(...args) },
    item: () => ({ read: () => mockRead() }),
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

jest.mock("../lib/auditLog", () => ({ audit: jest.fn() }));

import { audit } from "../lib/auditLog";

type Handler = (req: any, ctx: any) => Promise<any>;

const handlers: Record<string, Handler> = {};

(app.http as jest.Mock).mockImplementation((name: string, opts: any) => {
  handlers[name] = opts.handler;
});

// Import after mocks are in place
require("../functions/activeTests");

function makeReq(method: string, body?: unknown, urlSuffix = "") {
  return {
    method,
    headers: new Map([["x-flowforge-projectid", "test-project"]]),
    params: {},
    json: () => Promise.resolve(body),
    query: new URLSearchParams(),
    url: `https://example.com/api/active-tests${urlSuffix}`,
  };
}

const ctx = {} as any;

function parseBody(res: any): any {
  return typeof res.body === "string" ? JSON.parse(res.body) : res.body;
}

beforeEach(() => {
  jest.clearAllMocks();
  mockRead.mockResolvedValue({ resource: null });
  mockUpsert.mockResolvedValue({});
});

describe("activeTests router (GET/PUT/OPTIONS)", () => {
  const call = (req: any) => handlers["activeTests"](req, ctx);

  test("GET returns empty flows when no doc exists", async () => {
    mockRead.mockResolvedValue({ resource: null });
    const res = await call(makeReq("GET"));
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ flows: [] });
  });

  test("GET returns existing flows", async () => {
    mockRead.mockResolvedValue({
      resource: { flows: ["flow-a.flow.xml", "flow-b.flow.xml"] },
    });
    const res = await call(makeReq("GET"));
    expect(res.status).toBe(200);
    expect(parseBody(res)).toEqual({ flows: ["flow-a.flow.xml", "flow-b.flow.xml"] });
  });

  test("PUT replaces flows array", async () => {
    const res = await call(makeReq("PUT", { flows: ["new-flow.flow.xml"] }));
    expect(res.status).toBe(200);
    expect(mockUpsert).toHaveBeenCalledTimes(1);
    const upsertedDoc = mockUpsert.mock.calls[0][0];
    expect(upsertedDoc.flows).toEqual(["new-flow.flow.xml"]);
    expect(upsertedDoc.id).toBe("__active_tests__");
  });

  test("PUT returns 400 when flows is missing", async () => {
    const res = await call(makeReq("PUT", { notFlows: true }));
    expect(res.status).toBe(400);
    expect(parseBody(res).error).toMatch(/flows array is required/);
  });

  test("OPTIONS returns 204", async () => {
    const res = await call(makeReq("OPTIONS"));
    expect(res.status).toBe(204);
  });

  test("Method Not Allowed for unsupported methods", async () => {
    const res = await call(makeReq("DELETE"));
    expect(res.status).toBe(405);
    expect(parseBody(res).error).toBe("Method Not Allowed");
  });
});

describe("activeTestsActivate router (POST/OPTIONS)", () => {
  const call = (req: any) => handlers["activeTestsActivate"](req, ctx);

  test("POST activate adds flows to set with deduplication", async () => {
    mockRead.mockResolvedValue({
      resource: { flows: ["existing.flow.xml"] },
    });
    const res = await call(
      makeReq("POST", { flows: ["existing.flow.xml", "new.flow.xml"] }, "/activate"),
    );
    expect(res.status).toBe(200);
    const upsertedDoc = mockUpsert.mock.calls[0][0];
    expect(upsertedDoc.flows).toEqual(["existing.flow.xml", "new.flow.xml"]);
  });

  test("POST activate audits each flow", async () => {
    mockRead.mockResolvedValue({ resource: null });
    await call(makeReq("POST", { flows: ["a.flow.xml", "b.flow.xml"] }, "/activate"));
    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledWith(
      "test-project",
      "scenario.activate",
      { oid: "test-oid", name: "Test User" },
      "a.flow.xml",
    );
    expect(audit).toHaveBeenCalledWith(
      "test-project",
      "scenario.activate",
      { oid: "test-oid", name: "Test User" },
      "b.flow.xml",
    );
  });

  test("OPTIONS returns 204", async () => {
    const res = await call(makeReq("OPTIONS", undefined, "/activate"));
    expect(res.status).toBe(204);
  });
});

describe("activeTestsDeactivate router (POST/OPTIONS)", () => {
  const call = (req: any) => handlers["activeTestsDeactivate"](req, ctx);

  test("POST deactivate removes flows from set", async () => {
    mockRead.mockResolvedValue({
      resource: { flows: ["keep.flow.xml", "remove.flow.xml"] },
    });
    const res = await call(
      makeReq("POST", { flows: ["remove.flow.xml"] }, "/deactivate"),
    );
    expect(res.status).toBe(200);
    const upsertedDoc = mockUpsert.mock.calls[0][0];
    expect(upsertedDoc.flows).toEqual(["keep.flow.xml"]);
  });

  test("POST deactivate audits each flow", async () => {
    mockRead.mockResolvedValue({
      resource: { flows: ["a.flow.xml", "b.flow.xml"] },
    });
    await call(
      makeReq("POST", { flows: ["a.flow.xml", "b.flow.xml"] }, "/deactivate"),
    );
    expect(audit).toHaveBeenCalledTimes(2);
    expect(audit).toHaveBeenCalledWith(
      "test-project",
      "scenario.deactivate",
      { oid: "test-oid", name: "Test User" },
      "a.flow.xml",
    );
    expect(audit).toHaveBeenCalledWith(
      "test-project",
      "scenario.deactivate",
      { oid: "test-oid", name: "Test User" },
      "b.flow.xml",
    );
  });

  test("OPTIONS returns 204", async () => {
    const res = await call(makeReq("OPTIONS", undefined, "/deactivate"));
    expect(res.status).toBe(204);
  });
});
