/**
 * Unit tests for the flow-files Azure Function router.
 */

import type { InvocationContext } from "@azure/functions";

jest.mock("../lib/blobClient", () => ({
  FLOW_CONTAINER: "flow-files",
  listBlobs: jest.fn().mockResolvedValue([
    { name: "articles/my-flow.flow.xml", size: 512, lastModified: new Date(), contentType: "application/xml" },
  ]),
  downloadBlob: jest.fn().mockResolvedValue("<?xml version=\"1.0\"?><flow/>"),
  uploadBlob: jest.fn().mockResolvedValue(undefined),
  deleteBlob: jest.fn().mockResolvedValue(undefined),
  blobExists: jest.fn().mockResolvedValue(false),
}));

import { flowFilesRouter } from "../functions/flowFiles";
import * as blobClient from "../lib/blobClient";

function mockRequest(method: string, query: Record<string, string> = {}, body?: unknown) {
  const params = new URLSearchParams(query);
  return {
    method,
    query: params,
    json: jest.fn().mockResolvedValue(body ?? {}),
  };
}

const ctx = {} as InvocationContext;

describe("CORS", () => {
  const methods = ["GET", "POST", "DELETE", "OPTIONS"];
  test.each(methods)("%s includes CORS headers", async (method) => {
    const body = method === "POST" ? { name: "x.flow.xml", xml: "<flow/>" } : undefined;
    const req = mockRequest(method, method === "DELETE" ? { name: "x.flow.xml" } : {}, body);
    const res = await flowFilesRouter(req as any, ctx);
    const headers = res.headers as Record<string, string> | undefined;
    expect(headers?.["Access-Control-Allow-Origin"]).toBe("*");
  });
});

describe("OPTIONS", () => {
  test("returns 204", async () => {
    const res = await flowFilesRouter(mockRequest("OPTIONS") as any, ctx);
    expect(res.status).toBe(204);
  });
});

describe("GET /api/flow-files", () => {
  test("returns list of flow files", async () => {
    const res = await flowFilesRouter(mockRequest("GET") as any, ctx);
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body as string);
    expect(Array.isArray(body)).toBe(true);
    expect(body[0].name).toContain(".flow.xml");
  });

  test("passes prefix and container to listBlobs", async () => {
    jest.clearAllMocks();
    (blobClient.listBlobs as jest.Mock).mockResolvedValue([]);
    await flowFilesRouter(mockRequest("GET", { prefix: "articles/" }) as any, ctx);
    expect(blobClient.listBlobs).toHaveBeenCalledWith("articles/", "flow-files");
  });
});

describe("POST /api/flow-files", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (blobClient.blobExists as jest.Mock).mockResolvedValue(false);
    (blobClient.uploadBlob as jest.Mock).mockResolvedValue(undefined);
  });

  test("returns 200 when name+xml provided and no conflict", async () => {
    const req = mockRequest("POST", {}, { name: "articles/f.flow.xml", xml: "<flow/>" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(blobClient.uploadBlob).toHaveBeenCalledWith(
      "articles/f.flow.xml",
      "<flow/>",
      "application/xml",
      "flow-files"
    );
  });

  test("returns 409 when file exists and overwrite is not set", async () => {
    (blobClient.blobExists as jest.Mock).mockResolvedValue(true);
    const req = mockRequest("POST", {}, { name: "dup.flow.xml", xml: "<flow/>" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(409);
    const body = JSON.parse(res.body as string);
    expect(body.conflict).toBe(true);
    expect(blobClient.uploadBlob).not.toHaveBeenCalled();
  });

  test("overwrites when overwrite=true even if file exists", async () => {
    (blobClient.blobExists as jest.Mock).mockResolvedValue(true);
    const req = mockRequest("POST", {}, { name: "dup.flow.xml", xml: "<flow/>", overwrite: true });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(blobClient.uploadBlob).toHaveBeenCalled();
  });

  test("returns 400 when name missing", async () => {
    const req = mockRequest("POST", {}, { xml: "<flow/>" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });

  test("returns 400 when xml missing", async () => {
    const req = mockRequest("POST", {}, { name: "x.flow.xml" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(400);
  });
});

describe("DELETE /api/flow-files", () => {
  test("returns 200 when name provided", async () => {
    const req = mockRequest("DELETE", { name: "f.flow.xml" });
    const res = await flowFilesRouter(req as any, ctx);
    expect(res.status).toBe(200);
    expect(blobClient.deleteBlob).toHaveBeenCalledWith("f.flow.xml", "flow-files");
  });

  test("returns 400 when name missing", async () => {
    const res = await flowFilesRouter(mockRequest("DELETE") as any, ctx);
    expect(res.status).toBe(400);
  });
});

describe("Unknown method", () => {
  test("returns 405 for PUT", async () => {
    const res = await flowFilesRouter(mockRequest("PUT") as any, ctx);
    expect(res.status).toBe(405);
  });
});
