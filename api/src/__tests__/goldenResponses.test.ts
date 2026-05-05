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
  normalizePath,
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

describe("normalizePath", () => {
  it("strips version prefix", () => {
    expect(normalizePath("/v3/projects/articles")).toBe("/projects/articles");
  });

  it("replaces {placeholders} with *", () => {
    expect(normalizePath("/v3/projects/{project_id}/articles")).toBe("/projects/*/articles");
  });

  it("replaces UUID segments with *", () => {
    expect(normalizePath("/v3/projects/72df837d-80a0-403d-ac30-93c328a7a57c/articles"))
      .toBe("/projects/*/articles");
  });

  it("replaces long numeric IDs with *", () => {
    expect(normalizePath("/v3/projects/123456/articles")).toBe("/projects/*/articles");
  });

  it("normalized template and resolved paths match", () => {
    const template = normalizePath("/v3/projects/{project_id}/categories/{category_id}");
    const resolved = normalizePath("/v3/projects/72df837d-80a0-403d-ac30-93c328a7a57c/categories/045d432b-ecc6-4bee-b6af-68c3d34abf29");
    expect(template).toBe(resolved);
  });

  it("strips query strings", () => {
    expect(normalizePath("/v3/articles?limit=10")).toBe("/articles");
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

  it("extracts passing steps from server-side runs (steps array)", async () => {
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

  it("extracts passing steps from browser-side runs (testResults object)", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [{
        id: "run-2",
        testResults: {
          "xml:flow.s1": {
            status: "pass",
            method: "GET",
            path: "/v3/articles",
            httpStatus: 200,
            responseBody: { data: [{ id: "a1" }] },
          },
          "xml:flow.s2": {
            status: "fail",
            method: "DELETE",
            path: "/v3/articles/{id}",
            httpStatus: 500,
            responseBody: { error: "internal" },
          },
        },
      }],
    });

    const result = await loadGoldenResponses("proj1", ["/v3/articles"]);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("GET");
  });

  it("falls back to tagResults when testResults is missing", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [{
        id: "run-3",
        tagResults: {
          "My Flow": {
            tests: [{
              status: "pass",
              method: "POST",
              path: "/v3/categories",
              httpStatus: 201,
              responseBody: { data: { id: "c1" } },
            }],
          },
        },
      }],
    });

    const result = await loadGoldenResponses("proj1", ["/v3/categories"]);
    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("POST");
  });

  it("matches resolved URLs against template endpoints via normalization", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [{
        id: "run-4",
        testResults: {
          "xml:flow.s1": {
            status: "pass",
            method: "POST",
            path: "/v3/projects/{project_id}/categories",
            httpStatus: 201,
            responseBody: { data: { id: "cat-1", name: "Test" } },
            requestUrl: "https://api.example.com/v3/projects/72df837d-80a0-403d-ac30-93c328a7a57c/categories",
          },
        },
      }],
    });

    // Spec endpoint has {placeholders}
    const result = await loadGoldenResponses("proj1", ["/v3/projects/{project_id}/categories"]);
    expect(result).toHaveLength(1);
    expect(result[0].statusCode).toBe(201);
  });

  it("deduplicates by method+normalized path (keeps first/most recent)", async () => {
    mockFetchAll.mockResolvedValue({
      resources: [
        {
          id: "run-new",
          testResults: {
            "s1": {
              status: "pass",
              method: "POST",
              path: "/v3/articles",
              httpStatus: 201,
              responseBody: { data: { id: "newer" } },
            },
          },
        },
        {
          id: "run-old",
          testResults: {
            "s1": {
              status: "pass",
              method: "POST",
              path: "/v3/articles",
              httpStatus: 201,
              responseBody: { data: { id: "older" } },
            },
          },
        },
      ],
    });

    const result = await loadGoldenResponses("proj1", ["/v3/articles"]);
    expect(result).toHaveLength(1);
    expect(result[0].responseBody).toContain("newer");
  });

  it("limits to 5 golden responses", async () => {
    const testResults = {};
    for (let i = 0; i < 10; i++) {
      (testResults as any)[`s${i}`] = {
        status: "pass",
        method: "GET",
        path: `/v3/endpoint${i}`,
        httpStatus: 200,
        responseBody: { data: { id: `item${i}` } },
      };
    }

    mockFetchAll.mockResolvedValue({
      resources: [{ id: "run-1", testResults }],
    });

    const endpoints = Array.from({ length: 10 }, (_, i) => `/v3/endpoint${i}`);
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
  it("extracts from distilled '## Endpoint: METHOD /path' headers", () => {
    const ctx = "## Endpoint: GET /v3/projects/{project_id}/articles\nSome description\n## Endpoint: POST /v3/projects/{project_id}/articles\n";
    const result = extractEndpointsFromContext([], ctx);
    expect(result).toContain("/v3/projects/{project_id}/articles");
  });

  it("extracts from digest '**METHOD /path**' format", () => {
    const ctx = "- **GET /v3/projects/{project_id}/articles** — List all articles\n";
    const result = extractEndpointsFromContext([], ctx);
    expect(result).toContain("/v3/projects/{project_id}/articles");
  });

  it("extracts from bare method+path patterns", () => {
    const ctx = "GET /v3/projects/{project_id}/articles\nPOST /v3/projects/{project_id}/articles";
    const result = extractEndpointsFromContext([], ctx);
    expect(result).toContain("/v3/projects/{project_id}/articles");
  });

  it("extracts from Path: markdown patterns", () => {
    const ctx = "**Path**: `/v3/categories/{id}`\n";
    const result = extractEndpointsFromContext([], ctx);
    expect(result).toContain("/v3/categories/{id}");
  });

  it("deduplicates paths", () => {
    const ctx = "## Endpoint: GET /v3/articles\nGET /v3/articles\n**Path**: `/v3/articles`";
    const result = extractEndpointsFromContext([], ctx);
    expect(result.filter(p => p === "/v3/articles")).toHaveLength(1);
  });
});
