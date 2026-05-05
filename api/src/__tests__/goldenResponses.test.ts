/**
 * Unit tests for api/src/lib/goldenResponses.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

const mockFetchAll = jest.fn();
jest.mock("../lib/cosmosClient", () => ({
  getTestRunsContainer: jest.fn().mockResolvedValue({
    items: {
      query: () => ({ fetchAll: mockFetchAll }),
    },
  }),
}));

import {
  truncateBody,
  formatGoldenResponses,
  loadGoldenResponses,
  extractEndpointsFromContext,
} from "../lib/goldenResponses";

describe("truncateBody", () => {
  it("formats valid JSON with indentation", () => {
    const result = truncateBody('{"a":1,"b":2}');
    expect(result).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it("truncates long bodies", () => {
    const long = JSON.stringify({ data: "x".repeat(3000) });
    const result = truncateBody(long, 100);
    expect(result.length).toBeLessThanOrEqual(120); // 100 + "... (truncated)"
    expect(result).toContain("... (truncated)");
  });

  it("handles invalid JSON gracefully", () => {
    const result = truncateBody("not json at all");
    expect(result).toBe("not json at all");
  });
});

describe("formatGoldenResponses", () => {
  it("returns empty string for no responses", () => {
    expect(formatGoldenResponses([])).toBe("");
  });

  it("formats responses with header and code blocks", () => {
    const responses = [{
      method: "POST",
      path: "/v3/articles",
      statusCode: 201,
      responseBody: '{"data":{"id":"abc"}}',
      _runId: "run-1",
      _stepIndex: 0,
    }];
    const result = formatGoldenResponses(responses);
    expect(result).toContain("## Real API Response Examples");
    expect(result).toContain("### POST /v3/articles");
    expect(result).toContain("Status: 201");
    expect(result).toContain("```json");
  });

  it("includes request body when present", () => {
    const responses = [{
      method: "POST",
      path: "/v3/articles",
      statusCode: 201,
      responseBody: '{"data":{"id":"abc"}}',
      requestBody: '{"title":"Test"}',
      _runId: "run-1",
      _stepIndex: 0,
    }];
    const result = formatGoldenResponses(responses);
    expect(result).toContain("Request body:");
    expect(result).toContain('"title"');
  });

  it("respects total block size limit", () => {
    const responses = Array.from({ length: 20 }, (_, i) => ({
      method: "GET",
      path: `/v3/endpoint${i}`,
      statusCode: 200,
      responseBody: JSON.stringify({ data: "x".repeat(1500) }),
      _runId: "run-1",
      _stepIndex: i,
    }));
    const result = formatGoldenResponses(responses);
    expect(result.length).toBeLessThanOrEqual(12_000); // some slack for headers
  });
});

describe("loadGoldenResponses", () => {
  beforeEach(() => {
    mockFetchAll.mockReset();
  });

  it("returns empty array when no runs exist", async () => {
    mockFetchAll.mockResolvedValue({ resources: [] });
    const result = await loadGoldenResponses("proj1", ["/v3/articles"]);
    expect(result).toEqual([]);
  });

  it("extracts passing steps from server-side runs", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [{
        id: "run-1",
        steps: [
          {
            status: "pass",
            method: "POST",
            requestUrl: "https://api.example.com/v3/articles",
            httpStatus: 201,
            responseBody: { data: { id: "abc" } },
          },
          {
            status: "fail",
            method: "GET",
            requestUrl: "https://api.example.com/v3/articles/abc",
            httpStatus: 404,
            responseBody: { error: "not found" },
          },
        ],
      }],
    });

    const result = await loadGoldenResponses("proj1", ["/v3/articles"]);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("POST");
    expect(result[0].statusCode).toBe(201);
  });

  it("extracts passing steps from browser-side runs", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [{
        id: "run-2",
        tagResults: [{
          tests: [{
            status: "pass",
            method: "GET",
            path: "/v3/articles",
            httpStatus: 200,
            responseBody: { data: [{ id: "a1" }] },
          }],
        }],
      }],
    });

    const result = await loadGoldenResponses("proj1", ["/v3/articles"]);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("GET");
  });

  it("deduplicates by method+path (keeps first/most recent)", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [
        {
          id: "run-new",
          steps: [{
            status: "pass",
            method: "POST",
            requestUrl: "https://api.example.com/v3/articles",
            httpStatus: 201,
            responseBody: { data: { id: "newer" } },
          }],
        },
        {
          id: "run-old",
          steps: [{
            status: "pass",
            method: "POST",
            requestUrl: "https://api.example.com/v3/articles",
            httpStatus: 201,
            responseBody: { data: { id: "older" } },
          }],
        },
      ],
    });

    const result = await loadGoldenResponses("proj1", ["/v3/articles"]);
    expect(result).toHaveLength(1);
    expect(result[0].responseBody).toContain("newer");
  });

  it("limits to 5 golden responses", async () => {
    const steps = Array.from({ length: 10 }, (_, i) => ({
      status: "pass",
      method: "GET",
      path: `/v3/endpoint${i}`,
      httpStatus: 200,
      responseBody: { data: { id: `item${i}` } },
    }));

    mockFetchAll.mockResolvedValue({
      resources: [{ id: "run-1", tagResults: [{ tests: steps }] }],
    });

    const endpoints = steps.map(s => s.path);
    const result = await loadGoldenResponses("proj1", endpoints);
    expect(result.length).toBeLessThanOrEqual(5);
  });

  it("returns empty on Cosmos error", async () => {
    mockFetchAll.mockRejectedValue(new Error("Cosmos down"));
    const result = await loadGoldenResponses("proj1", ["/v3/articles"]);
    expect(result).toEqual([]);
  });
});

describe("extractEndpointsFromContext", () => {
  it("extracts paths from method+path patterns", () => {
    const ctx = "GET /v3/projects/{project_id}/articles\nPOST /v3/projects/{project_id}/articles";
    const result = extractEndpointsFromContext([], ctx);
    expect(result).toContain("/v3/projects/{project_id}/articles");
  });

  it("extracts from Path: markdown patterns", () => {
    const ctx = "**Path**: `/v3/categories/{id}`\n";
    const result = extractEndpointsFromContext([], ctx);
    expect(result).toContain("/v3/categories/{id}");
  });
});
