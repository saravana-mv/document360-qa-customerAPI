/**
 * Unit tests for api/src/lib/aiContext.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

jest.mock("../lib/blobClient", () => ({
  listBlobs: jest.fn().mockResolvedValue([]),
  downloadBlob: jest.fn().mockResolvedValue("raw content"),
}));

jest.mock("../lib/apiRules", () => ({
  loadApiRules: jest.fn().mockResolvedValue({ rules: "", enumAliases: "" }),
  injectApiRules: jest.fn((base: string, rules: string) =>
    rules ? `${base}\n\nRULES: ${rules}` : base,
  ),
  extractVersionFolder: jest.fn((paths: string | string[]) => {
    const arr = Array.isArray(paths) ? paths : [paths];
    for (const p of arr) {
      const first = p.replace(/^\/+/, "").split("/")[0];
      if (first) return first;
    }
    return null;
  }),
}));

jest.mock("../lib/projectVariables", () => ({
  loadProjectVariables: jest.fn().mockResolvedValue([]),
  injectProjectVariables: jest.fn((base: string) => base),
}));

jest.mock("../lib/specDependencies", () => ({
  loadOrRebuildDependencies: jest.fn().mockResolvedValue(null),
}));

jest.mock("../lib/specDistillCache", () => ({
  readDistilledContent: jest.fn().mockResolvedValue("# Distilled spec content"),
}));

jest.mock("../lib/flowRunner/parser", () => ({
  parseFlowXml: jest.fn().mockReturnValue({
    name: "Test",
    entity: "Test",
    steps: [
      { number: 1, name: "Step 1", method: "GET", path: "/v3/items" },
    ],
  }),
}));

import { loadAiContext, findMatchingSpec } from "../lib/aiContext";
import { loadApiRules } from "../lib/apiRules";
import { loadProjectVariables } from "../lib/projectVariables";
import { loadOrRebuildDependencies } from "../lib/specDependencies";
import { listBlobs } from "../lib/blobClient";
import { readDistilledContent } from "../lib/specDistillCache";

const mockLoadApiRules = loadApiRules as jest.MockedFunction<typeof loadApiRules>;
const mockLoadProjectVariables = loadProjectVariables as jest.MockedFunction<typeof loadProjectVariables>;
const mockLoadOrRebuildDependencies = loadOrRebuildDependencies as jest.MockedFunction<typeof loadOrRebuildDependencies>;
const mockListBlobs = listBlobs as jest.MockedFunction<typeof listBlobs>;
const mockReadDistilledContent = readDistilledContent as jest.MockedFunction<typeof readDistilledContent>;

beforeEach(() => {
  jest.clearAllMocks();
});

// ── loadAiContext ───────────────────────────────────────────────────────

describe("loadAiContext", () => {
  test("returns default empty context when all loading disabled", async () => {
    const ctx = await loadAiContext({
      projectId: "proj1",
      loadRules: false,
      loadVariables: false,
      loadDependencies: false,
      loadSpec: false,
    });

    expect(ctx.rules).toBe("");
    expect(ctx.enumAliases).toBe("");
    expect(ctx.projectVariables).toEqual([]);
    expect(ctx.dependencyInfo).toBeNull();
    expect(ctx.specContext).toBe("");
    expect(ctx.specSource).toBe("none");
    expect(ctx.flowStepSpecs).toEqual([]);
    expect(mockLoadApiRules).not.toHaveBeenCalled();
    expect(mockLoadProjectVariables).not.toHaveBeenCalled();
    expect(mockLoadOrRebuildDependencies).not.toHaveBeenCalled();
  });

  test("loads rules when doRules=true", async () => {
    mockLoadApiRules.mockResolvedValueOnce({
      rules: "No trailing slashes",
      enumAliases: "status=1:active,2:inactive",
    });

    const ctx = await loadAiContext({
      projectId: "proj1",
      versionFolder: "V3",
      loadRules: true,
      loadVariables: false,
      loadDependencies: false,
      loadSpec: false,
    });

    expect(mockLoadApiRules).toHaveBeenCalledWith("proj1", "V3");
    expect(ctx.rules).toBe("No trailing slashes");
    expect(ctx.enumAliases).toBe("status=1:active,2:inactive");
  });

  test("skips rules when projectId is 'unknown'", async () => {
    const ctx = await loadAiContext({
      projectId: "unknown",
      loadRules: true,
      loadVariables: false,
      loadDependencies: false,
      loadSpec: false,
    });

    expect(mockLoadApiRules).not.toHaveBeenCalled();
    expect(ctx.rules).toBe("");
  });

  test("loads project variables", async () => {
    mockLoadProjectVariables.mockResolvedValueOnce([
      { name: "base_url", value: "https://api.example.com" },
    ]);

    const ctx = await loadAiContext({
      projectId: "proj1",
      loadRules: false,
      loadVariables: true,
      loadDependencies: false,
      loadSpec: false,
    });

    expect(mockLoadProjectVariables).toHaveBeenCalledWith("proj1");
    expect(ctx.projectVariables).toEqual([
      { name: "base_url", value: "https://api.example.com" },
    ]);
  });

  test("loads dependencies when versionFolder present", async () => {
    mockLoadOrRebuildDependencies.mockResolvedValueOnce("## Dependencies\n- Article depends on Category");

    const ctx = await loadAiContext({
      projectId: "proj1",
      versionFolder: "V3",
      loadRules: false,
      loadVariables: false,
      loadDependencies: true,
      loadSpec: false,
    });

    expect(mockLoadOrRebuildDependencies).toHaveBeenCalledWith("proj1", "V3");
    expect(ctx.dependencyInfo).toBe("## Dependencies\n- Article depends on Category");
  });

  test("derives versionFolder from specFiles", async () => {
    mockLoadOrRebuildDependencies.mockResolvedValueOnce("deps-info");

    const ctx = await loadAiContext({
      projectId: "proj1",
      specFiles: ["V3/articles/get-articles.md"],
      loadRules: false,
      loadVariables: false,
      loadDependencies: true,
      loadSpec: false,
    });

    expect(mockLoadOrRebuildDependencies).toHaveBeenCalledWith("proj1", "V3");
    expect(ctx.dependencyInfo).toBe("deps-info");
  });

  test("derives versionFolder from endpointHint path", async () => {
    mockLoadOrRebuildDependencies.mockResolvedValueOnce("dep-data");

    const ctx = await loadAiContext({
      projectId: "proj1",
      endpointHint: { method: "GET", path: "/v3/articles" },
      loadRules: false,
      loadVariables: false,
      loadDependencies: true,
      loadSpec: false,
    });

    expect(mockLoadOrRebuildDependencies).toHaveBeenCalledWith("proj1", "V3");
    expect(ctx.dependencyInfo).toBe("dep-data");
  });
});

// ── enrichSystemPrompt ──────────────────────────────────────────────────

describe("enrichSystemPrompt", () => {
  test("injects rules and appends dependency info", async () => {
    mockLoadApiRules.mockResolvedValueOnce({ rules: "Use snake_case", enumAliases: "" });
    mockLoadOrRebuildDependencies.mockResolvedValueOnce("## Entity Dependencies\n- A -> B");

    const ctx = await loadAiContext({
      projectId: "proj1",
      versionFolder: "V3",
      loadRules: true,
      loadVariables: false,
      loadDependencies: true,
      loadSpec: false,
    });

    const result = ctx.enrichSystemPrompt("Base prompt");
    expect(result).toContain("RULES: Use snake_case");
    expect(result).toContain("## Entity Dependencies\n- A -> B");
  });
});

// ── formatUserContext ───────────────────────────────────────────────────

describe("formatUserContext", () => {
  test("includes spec context with source label", async () => {
    // Set up findMatchingSpec to return a result via endpointHint
    mockListBlobs.mockResolvedValueOnce([
      { name: "proj1/V3/get-articles.md", httpMethod: "GET" },
    ] as any);
    mockReadDistilledContent.mockResolvedValueOnce("GET /v3/articles\nReturns list of articles");

    const ctx = await loadAiContext({
      projectId: "proj1",
      versionFolder: "V3",
      endpointHint: { method: "GET", path: "/v3/articles" },
      loadRules: false,
      loadVariables: false,
      loadDependencies: false,
      loadSpec: true,
    });

    const result = ctx.formatUserContext();
    expect(result).toContain("## Endpoint Specification (source: distilled)");
    expect(result).toContain("GET /v3/articles");
  });
});

// ── formatFlowStepSpecs ─────────────────────────────────────────────────

describe("formatFlowStepSpecs", () => {
  test("formats all step specs with labels", async () => {
    // findMatchingSpec for flowXml steps — mock listBlobs to return a blob
    mockListBlobs.mockResolvedValue([
      { name: "proj1/V3/get-items.md", httpMethod: "GET" },
    ] as any);
    mockReadDistilledContent.mockResolvedValue(
      "GET /v3/items\n### Request Body\nSome body spec",
    );

    const ctx = await loadAiContext({
      projectId: "proj1",
      versionFolder: "V3",
      flowXml: "<flow></flow>", // parseFlowXml is mocked
      loadRules: false,
      loadVariables: false,
      loadDependencies: false,
      loadSpec: true,
    });

    const result = ctx.formatFlowStepSpecs(1);
    expect(result).toContain("## API Specifications for All Flow Steps");
    expect(result).toContain("### Step 1: GET /v3/items");
    expect(result).toContain("FAILING STEP");
  });
});

// ── findMatchingSpec ────────────────────────────────────────────────────

describe("findMatchingSpec", () => {
  test("returns null for path without version prefix", async () => {
    const result = await findMatchingSpec("proj1", "GET", "/articles");
    expect(result).toBeNull();
    expect(mockListBlobs).not.toHaveBeenCalled();
  });

  test("returns null when no blobs listed", async () => {
    mockListBlobs.mockResolvedValueOnce([]);

    const result = await findMatchingSpec("proj1", "GET", "/v3/articles");
    expect(result).toBeNull();
  });

  test("does not match shorter path against a longer-path endpoint (prefix collision)", async () => {
    // Regression: searching for POST /v3/articles must NOT match a blob that
    // documents POST /v3/articles/bulk (the bulk endpoint). String.includes
    // would silently return the wrong blob because the shorter path is a
    // substring of the longer one.
    const mockReadDistilled = readDistilledContent as jest.MockedFunction<typeof readDistilledContent>;
    mockListBlobs.mockResolvedValueOnce([
      { name: "proj1/V3/articles/bulk-create-article-articles.md", size: 100, lastModified: "", contentType: "text/markdown", httpMethod: "POST" },
      { name: "proj1/V3/articles/create-article-article.md", size: 100, lastModified: "", contentType: "text/markdown", httpMethod: "POST" },
    ]);
    mockReadDistilled
      .mockResolvedValueOnce("## bulk-create-article-articles.md\n\n## Endpoint: POST /v3/projects/{project_id}/articles/bulk\n\n[bulk content]")
      .mockResolvedValueOnce("## create-article-article.md\n\n## Endpoint: POST /v3/projects/{project_id}/articles\n\n[single create content]");

    const result = await findMatchingSpec("proj1", "POST", "/v3/projects/{project_id}/articles");
    expect(result).not.toBeNull();
    // Must return the SINGLE-create blob, not the bulk one
    expect(result!.content).toContain("create-article-article.md");
    expect(result!.content).not.toContain("bulk-create-article-articles.md");
  });
});
