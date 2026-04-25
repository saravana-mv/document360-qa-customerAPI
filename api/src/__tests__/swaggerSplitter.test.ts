/**
 * Unit tests for the OpenAPI/Swagger spec splitter.
 */

import {
  splitSwagger,
  tagToFolder,
  operationToFilename,
  resolveRefs,
  buildEndpointMarkdown,
} from "../lib/swaggerSplitter";

// ── tagToFolder ──────────────────────────────────────────────────────────────

describe("tagToFolder", () => {
  test("PascalCase → kebab-case", () => {
    expect(tagToFolder("AISearchAnalytics")).toBe("ai-search-analytics");
  });

  test("camelCase → kebab-case", () => {
    expect(tagToFolder("articleAnalytics")).toBe("article-analytics");
  });

  test("spaces → hyphens", () => {
    expect(tagToFolder("Drive Module")).toBe("drive-module");
  });

  test("underscores → hyphens", () => {
    expect(tagToFolder("api_references")).toBe("api-references");
  });

  test("already lowercase", () => {
    expect(tagToFolder("articles")).toBe("articles");
  });

  test("strips non-alphanumeric chars", () => {
    expect(tagToFolder("My (API) v2")).toBe("my-api-v2");
  });
});

// ── operationToFilename ──────────────────────────────────────────────────────

describe("operationToFilename", () => {
  test("GET without trailing param → list.md", () => {
    const existing = new Set<string>();
    expect(operationToFilename("GET", "/v3/articles", existing)).toBe("list.md");
  });

  test("GET with trailing param → get.md", () => {
    const existing = new Set<string>();
    expect(operationToFilename("GET", "/v3/articles/{id}", existing)).toBe("get.md");
  });

  test("POST → create.md", () => {
    const existing = new Set<string>();
    expect(operationToFilename("POST", "/v3/articles", existing)).toBe("create.md");
  });

  test("PUT → update.md", () => {
    const existing = new Set<string>();
    expect(operationToFilename("PUT", "/v3/articles/{id}", existing)).toBe("update.md");
  });

  test("PATCH → patch.md", () => {
    const existing = new Set<string>();
    expect(operationToFilename("PATCH", "/v3/articles/{id}", existing)).toBe("patch.md");
  });

  test("DELETE → delete.md", () => {
    const existing = new Set<string>();
    expect(operationToFilename("DELETE", "/v3/articles/{id}", existing)).toBe("delete.md");
  });

  test("collision adds path discriminator", () => {
    const existing = new Set<string>();
    const first = operationToFilename("GET", "/v3/articles", existing);
    expect(first).toBe("list.md");

    const second = operationToFilename("GET", "/v3/articles/search", existing);
    expect(second).not.toBe("list.md");
    expect(second).toMatch(/^list-.+\.md$/);
  });

  test("multiple collisions get unique names", () => {
    const existing = new Set<string>();
    const names = [
      operationToFilename("GET", "/v3/articles", existing),
      operationToFilename("GET", "/v3/articles/top", existing),
      operationToFilename("GET", "/v3/articles/recent", existing),
    ];
    const unique = new Set(names);
    expect(unique.size).toBe(3);
  });
});

// ── resolveRefs ──────────────────────────────────────────────────────────────

describe("resolveRefs", () => {
  const spec = {
    components: {
      schemas: {
        Article: {
          type: "object",
          properties: {
            id: { type: "string" },
            category: { "$ref": "#/components/schemas/Category" },
          },
        },
        Category: {
          type: "object",
          properties: {
            id: { type: "string" },
            name: { type: "string" },
          },
        },
        Unrelated: {
          type: "object",
        },
      },
      parameters: {
        ProjectId: {
          name: "project_id",
          in: "path",
          schema: { type: "string" },
        },
      },
    },
  };

  test("collects directly referenced schemas", () => {
    const operation = {
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: { "$ref": "#/components/schemas/Article" },
            },
          },
        },
      },
    };

    const result = resolveRefs(operation, undefined, spec as Record<string, unknown>);
    expect(result.schemas).toHaveProperty("Article");
    // Should also collect nested ref to Category
    expect(result.schemas).toHaveProperty("Category");
    // Should not include unrelated schemas
    expect(result.schemas).not.toHaveProperty("Unrelated");
  });

  test("collects referenced parameters", () => {
    const operation = {
      parameters: [{ "$ref": "#/components/parameters/ProjectId" }],
    };

    const result = resolveRefs(operation, undefined, spec as Record<string, unknown>);
    expect(result.parameters).toHaveProperty("ProjectId");
  });

  test("handles circular refs without infinite loop", () => {
    const circularSpec = {
      components: {
        schemas: {
          Node: {
            type: "object",
            properties: {
              child: { "$ref": "#/components/schemas/Node" },
            },
          },
        },
      },
    };

    const operation = {
      responses: {
        "200": {
          content: {
            "application/json": {
              schema: { "$ref": "#/components/schemas/Node" },
            },
          },
        },
      },
    };

    // Should not throw
    const result = resolveRefs(operation, undefined, circularSpec as Record<string, unknown>);
    expect(result.schemas).toHaveProperty("Node");
  });

  test("collects refs from path-level parameters", () => {
    const operation = {};
    const pathParams = [{ "$ref": "#/components/parameters/ProjectId" }];

    const result = resolveRefs(operation, pathParams, spec as Record<string, unknown>);
    expect(result.parameters).toHaveProperty("ProjectId");
  });
});

// ── buildEndpointMarkdown ────────────────────────────────────────────────────

describe("buildEndpointMarkdown", () => {
  test("produces valid markdown with JSON block", () => {
    const spec = {
      info: { title: "Test API", version: "v3" },
      components: { schemas: {} },
    };

    const operation = {
      summary: "Get an article",
      parameters: [
        { name: "id", in: "path", schema: { type: "string" } },
      ],
      responses: {
        "200": { description: "Success" },
      },
    };

    const md = buildEndpointMarkdown(
      "GET", "/v3/articles/{id}", operation, undefined,
      spec as Record<string, unknown>, "get.md",
    );

    expect(md).toContain("## get.md");
    expect(md).toContain("```json GET /v3/articles/{id}");
    expect(md).toContain('"openapi": "3.0.1"');
    expect(md).toContain("```\n");
  });
});

// ── splitSwagger (integration) ───────────────────────────────────────────────

describe("splitSwagger", () => {
  test("splits OpenAPI 3.x spec into per-endpoint files", () => {
    const spec = {
      openapi: "3.0.1",
      info: { title: "Test API", version: "1.0" },
      paths: {
        "/v3/articles": {
          get: {
            tags: ["Articles"],
            summary: "List articles",
            responses: { "200": { description: "Success" } },
          },
          post: {
            tags: ["Articles"],
            summary: "Create article",
            responses: { "201": { description: "Created" } },
          },
        },
        "/v3/articles/{id}": {
          get: {
            tags: ["Articles"],
            summary: "Get article",
            responses: { "200": { description: "Success" } },
          },
          delete: {
            tags: ["Articles"],
            summary: "Delete article",
            responses: { "204": { description: "Deleted" } },
          },
        },
        "/v3/categories": {
          get: {
            tags: ["Categories"],
            summary: "List categories",
            responses: { "200": { description: "Success" } },
          },
        },
      },
      components: { schemas: {} },
    };

    const result = splitSwagger(spec as Record<string, unknown>);

    expect(result.stats.endpoints).toBe(5);
    expect(result.stats.folders).toBe(2);
    expect(result.stats.skipped).toBe(0);

    const folders = new Set(result.files.map(f => f.folder));
    expect(folders).toContain("articles");
    expect(folders).toContain("categories");

    const articleFiles = result.files.filter(f => f.folder === "articles");
    const articleNames = articleFiles.map(f => f.filename);
    expect(articleNames).toContain("list.md");
    expect(articleNames).toContain("create.md");
    expect(articleNames).toContain("get.md");
    expect(articleNames).toContain("delete.md");
  });

  test("handles Swagger 2.x with definitions", () => {
    const spec = {
      swagger: "2.0",
      info: { title: "Old API", version: "1.0" },
      basePath: "/api",
      paths: {
        "/users": {
          get: {
            tags: ["Users"],
            summary: "List users",
            responses: {
              "200": {
                schema: { "$ref": "#/definitions/UserList" },
              },
            },
          },
        },
      },
      definitions: {
        UserList: {
          type: "object",
          properties: {
            items: { type: "array", items: { "$ref": "#/definitions/User" } },
          },
        },
        User: {
          type: "object",
          properties: { id: { type: "string" }, name: { type: "string" } },
        },
      },
    };

    const result = splitSwagger(spec as Record<string, unknown>);

    expect(result.stats.endpoints).toBe(1);
    expect(result.files[0].folder).toBe("users");
    expect(result.files[0].filename).toBe("list.md");
    // Content should reference the full path with basePath
    expect(result.files[0].content).toContain("/api/users");
  });

  test("untagged endpoints go to 'other' folder", () => {
    const spec = {
      openapi: "3.0.1",
      info: { title: "Test", version: "1.0" },
      paths: {
        "/health": {
          get: {
            summary: "Health check",
            responses: { "200": { description: "OK" } },
          },
        },
      },
    };

    const result = splitSwagger(spec as Record<string, unknown>);
    expect(result.files[0].folder).toBe("other");
  });

  test("handles allOf/oneOf refs", () => {
    const spec = {
      openapi: "3.0.1",
      info: { title: "Test", version: "1.0" },
      paths: {
        "/items": {
          post: {
            tags: ["Items"],
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { "$ref": "#/components/schemas/BaseItem" },
                      { "$ref": "#/components/schemas/ItemExtension" },
                    ],
                  },
                },
              },
            },
            responses: { "201": { description: "Created" } },
          },
        },
      },
      components: {
        schemas: {
          BaseItem: { type: "object", properties: { id: { type: "string" } } },
          ItemExtension: { type: "object", properties: { extra: { type: "string" } } },
        },
      },
    };

    const result = splitSwagger(spec as Record<string, unknown>);
    expect(result.stats.endpoints).toBe(1);
    // The markdown should contain the resolved schemas
    expect(result.files[0].content).toContain("BaseItem");
  });
});
