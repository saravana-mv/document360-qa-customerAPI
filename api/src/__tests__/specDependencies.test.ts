/**
 * Unit tests for extractDependencies() — pure function, no mocks needed.
 */
import { extractDependencies } from "../lib/specDependencies";

// ── Helper: minimal OAS 3.x spec builder ─────────────────────────────

function oas3(opts: {
  paths: Record<string, unknown>;
  schemas?: Record<string, unknown>;
}): Record<string, unknown> {
  return {
    openapi: "3.0.1",
    info: { title: "Test API", version: "1.0" },
    paths: opts.paths,
    components: { schemas: opts.schemas ?? {} },
  };
}

function jsonBody(
  schemaOrRef: Record<string, unknown>,
): Record<string, unknown> {
  return {
    requestBody: {
      content: { "application/json": { schema: schemaOrRef } },
    },
  };
}

// ── Tests ─────────────────────────────────────────────────────────────

describe("extractDependencies", () => {
  // ------------------------------------------------------------------ 1
  it("detects _id dependency with verified setup and teardown paths", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              required: ["title", "category_id"],
              properties: {
                title: { type: "string" },
                category_id: { type: "string", description: "The category" },
              },
            }),
          },
        },
        "/v3/categories": {
          post: { responses: { "201": { description: "Created" } } },
        },
        "/v3/categories/{id}": {
          get: { responses: { "200": { description: "OK" } } },
          delete: { responses: { "204": { description: "Deleted" } } },
        },
      },
    });

    const result = extractDependencies(spec);

    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("POST");
    expect(result[0].path).toBe("/v3/articles");
    expect(result[0].fields).toHaveLength(1);

    const dep = result[0].fields[0];
    expect(dep.field).toBe("category_id");
    expect(dep.resource).toBe("categories");
    expect(dep.required).toBe(true);
    expect(dep.setupPath).toBe("/v3/categories");
    expect(dep.teardownPath).toBe("/v3/categories/{id}");
    expect(dep.verified).toBe(true);
  });

  // ------------------------------------------------------------------ 2
  it("skips project_id", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              properties: {
                title: { type: "string" },
                project_id: { type: "string", description: "Project" },
              },
            }),
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 3
  it("skips self-references (article_id in /articles)", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              properties: {
                title: { type: "string" },
                article_id: {
                  type: "string",
                  description: "Self-ref article",
                },
              },
            }),
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 4
  describe("required vs optional fields", () => {
    it("marks field as required when listed in required array", () => {
      const spec = oas3({
        paths: {
          "/v3/articles": {
            post: {
              ...jsonBody({
                type: "object",
                required: ["category_id"],
                properties: {
                  category_id: { type: "string", description: "" },
                },
              }),
            },
          },
        },
      });

      const result = extractDependencies(spec);
      expect(result).toHaveLength(1);
      expect(result[0].fields[0].required).toBe(true);
    });

    it("marks field as optional when not in required array", () => {
      const spec = oas3({
        paths: {
          "/v3/articles": {
            post: {
              ...jsonBody({
                type: "object",
                properties: {
                  category_id: { type: "string", description: "" },
                },
              }),
            },
          },
        },
      });

      const result = extractDependencies(spec);
      expect(result).toHaveLength(1);
      expect(result[0].fields[0].required).toBe(false);
    });
  });

  // ------------------------------------------------------------------ 5
  it("returns empty when no _id fields exist", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              properties: {
                title: { type: "string" },
                content: { type: "string" },
                status: { type: "integer" },
              },
            }),
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 6
  it("normalizes Swagger 2.x and detects dependencies", () => {
    const spec: Record<string, unknown> = {
      swagger: "2.0",
      info: { title: "Test API", version: "1.0" },
      basePath: "/v3",
      paths: {
        "/articles": {
          post: {
            parameters: [
              {
                in: "body",
                name: "body",
                schema: { $ref: "#/definitions/CreateArticle" },
              },
            ],
          },
        },
        "/categories": {
          post: { responses: { "201": { description: "Created" } } },
        },
        "/categories/{id}": {
          delete: { responses: { "204": { description: "Deleted" } } },
        },
      },
      definitions: {
        CreateArticle: {
          type: "object",
          required: ["category_id"],
          properties: {
            title: { type: "string" },
            category_id: { type: "string", description: "Category ref" },
          },
        },
      },
    };

    const result = extractDependencies(spec);

    expect(result).toHaveLength(1);
    expect(result[0].method).toBe("POST");
    expect(result[0].path).toBe("/v3/articles");

    const dep = result[0].fields[0];
    expect(dep.field).toBe("category_id");
    expect(dep.resource).toBe("categories");
    expect(dep.setupPath).toBe("/v3/categories");
    expect(dep.teardownPath).toBe("/v3/categories/{id}");
    expect(dep.verified).toBe(true);
    expect(dep.required).toBe(true);
  });

  // ------------------------------------------------------------------ 7
  it("skips array-typed _id fields", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              properties: {
                tag_id: {
                  type: "array",
                  items: { type: "string" },
                  description: "Bulk tags",
                },
              },
            }),
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 8
  it("skips auth-related _id fields based on description", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              properties: {
                token_id: {
                  type: "string",
                  description: "API key authentication token",
                },
              },
            }),
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 9
  it("scans PUT and PATCH operations too", () => {
    const spec = oas3({
      paths: {
        "/v3/articles/{article_id}": {
          put: {
            ...jsonBody({
              type: "object",
              properties: {
                category_id: { type: "string", description: "" },
              },
            }),
          },
          patch: {
            ...jsonBody({
              type: "object",
              properties: {
                folder_id: { type: "string", description: "" },
              },
            }),
          },
        },
        "/v3/categories": {
          post: { responses: { "201": { description: "Created" } } },
        },
        "/v3/categories/{id}": {
          delete: { responses: { "204": { description: "Deleted" } } },
        },
        "/v3/folders": {
          post: { responses: { "201": { description: "Created" } } },
        },
        "/v3/folders/{id}": {
          delete: { responses: { "204": { description: "Deleted" } } },
        },
      },
    });

    const result = extractDependencies(spec);

    // PUT and PATCH both produce results
    expect(result).toHaveLength(2);

    const putResult = result.find((r) => r.method === "PUT");
    expect(putResult).toBeDefined();
    expect(putResult!.fields[0].field).toBe("category_id");

    const patchResult = result.find((r) => r.method === "PATCH");
    expect(patchResult).toBeDefined();
    expect(patchResult!.fields[0].field).toBe("folder_id");
    expect(patchResult!.fields[0].resource).toBe("folders");
    expect(patchResult!.fields[0].verified).toBe(true);
  });

  // ------------------------------------------------------------------ 10
  it("sets verified=false when resource paths are not in spec", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              properties: {
                author_id: { type: "string", description: "" },
              },
            }),
          },
        },
        // No /v3/authors or /v3/authors/{id} paths
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(1);

    const dep = result[0].fields[0];
    expect(dep.field).toBe("author_id");
    expect(dep.resource).toBe("authors");
    expect(dep.verified).toBe(false);
    // Still provides constructed paths as fallback
    expect(dep.setupPath).toBe("/v3/authors");
    expect(dep.teardownPath).toBe("/v3/authors/{id}");
  });

  // ------------------------------------------------------------------ 11
  it("resolves $ref schemas in OAS 3.x", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({ $ref: "#/components/schemas/CreateArticle" }),
          },
        },
        "/v3/categories": {
          post: { responses: { "201": { description: "Created" } } },
        },
        "/v3/categories/{category_id}": {
          delete: { responses: { "204": { description: "Deleted" } } },
        },
      },
      schemas: {
        CreateArticle: {
          type: "object",
          required: ["category_id"],
          properties: {
            title: { type: "string" },
            category_id: { type: "string", description: "Category" },
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(1);

    const dep = result[0].fields[0];
    expect(dep.field).toBe("category_id");
    expect(dep.verified).toBe(true);
    expect(dep.setupPath).toBe("/v3/categories");
    expect(dep.teardownPath).toBe("/v3/categories/{category_id}");
  });

  // ------------------------------------------------------------------ 12
  it("pluralizes -y words correctly (category → categories)", () => {
    const spec = oas3({
      paths: {
        "/v3/items": {
          post: {
            ...jsonBody({
              type: "object",
              properties: {
                category_id: { type: "string", description: "" },
                monkey_id: { type: "string", description: "" },
              },
            }),
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(1);

    const catDep = result[0].fields.find((f) => f.field === "category_id");
    expect(catDep!.resource).toBe("categories");

    // "monkey" ends in "ey" — should just get "s"
    const monkeyDep = result[0].fields.find((f) => f.field === "monkey_id");
    expect(monkeyDep!.resource).toBe("monkeys");
  });

  // ------------------------------------------------------------------ 13
  it("ignores GET operations", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          get: {
            parameters: [
              {
                in: "query",
                name: "category_id",
                schema: { type: "string" },
              },
            ],
            responses: { "200": { description: "OK" } },
          },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(0);
  });

  // ------------------------------------------------------------------ 14
  it("handles multiple _id fields in one operation", () => {
    const spec = oas3({
      paths: {
        "/v3/articles": {
          post: {
            ...jsonBody({
              type: "object",
              required: ["category_id"],
              properties: {
                category_id: { type: "string", description: "" },
                folder_id: { type: "string", description: "" },
              },
            }),
          },
        },
        "/v3/categories": {
          post: { responses: {} },
        },
        "/v3/categories/{id}": {
          delete: { responses: {} },
        },
      },
    });

    const result = extractDependencies(spec);
    expect(result).toHaveLength(1);
    expect(result[0].fields).toHaveLength(2);

    const catField = result[0].fields.find((f) => f.field === "category_id");
    expect(catField!.required).toBe(true);
    expect(catField!.verified).toBe(true);

    const folderField = result[0].fields.find((f) => f.field === "folder_id");
    expect(folderField!.required).toBe(false);
    expect(folderField!.verified).toBe(false);
  });
});
