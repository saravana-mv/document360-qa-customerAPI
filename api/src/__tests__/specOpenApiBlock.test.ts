import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  extractOpenApiBlock,
  spliceOpenApiBlock,
  findOperation,
  extractTargetSlice,
  applyTargetSlice,
} from "../lib/specOpenApiBlock";

function makeMd(fenceChars: string, method: string, path: string, json: unknown): string {
  return `# Title\n\n> Description.\n\n## OpenAPI\n\n${fenceChars}json ${method} ${path}\n${JSON.stringify(json, null, 2)}\n${fenceChars}\n`;
}

const sampleSpec = {
  openapi: "3.0.1",
  paths: {
    "/v3/articles/{article_id}": {
      post: {
        operationId: "createArticleAction",
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              examples: {
                "default": { value: { title: "old" } },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object" },
                examples: {
                  "Success": { value: { id: "old-id" } },
                },
              },
            },
          },
          "400": {
            description: "Bad Request",
            content: {
              "application/json": {
                schema: { type: "object" },
              },
            },
          },
        },
      },
    },
  },
};

describe("extractOpenApiBlock", () => {
  test("extracts a 4-backtick block", () => {
    const md = makeMd("````", "POST", "/v3/articles/{article_id}", sampleSpec);
    const parts = extractOpenApiBlock(md);
    expect(parts).not.toBeNull();
    expect(parts!.fenceChars).toBe("````");
    expect(parts!.infostring).toBe("json POST /v3/articles/{article_id}");
    expect(parts!.json).toEqual(sampleSpec);
  });

  test("extracts a 3-backtick block", () => {
    const md = makeMd("```", "GET", "/v3/articles", sampleSpec);
    const parts = extractOpenApiBlock(md);
    expect(parts).not.toBeNull();
    expect(parts!.fenceChars).toBe("```");
    expect(parts!.json).toEqual(sampleSpec);
  });

  test("returns null when no block is present", () => {
    expect(extractOpenApiBlock("# Title\nNo block here.\n")).toBeNull();
  });

  test("returns null when block JSON is invalid", () => {
    const md = "## OpenAPI\n\n````json POST /v3/items\nnot valid json\n````\n";
    expect(extractOpenApiBlock(md)).toBeNull();
  });

  test("preserves before and after content", () => {
    const md = `Hello\n\n${makeMd("````", "POST", "/v3/items", { paths: {} })}World\n`;
    const parts = extractOpenApiBlock(md);
    expect(parts!.before.startsWith("Hello\n\n")).toBe(true);
    expect(parts!.before).toContain("## OpenAPI");
    expect(parts!.after).toContain("World");
  });
});

describe("spliceOpenApiBlock", () => {
  test("round-trip is byte-equal when JSON is unchanged", () => {
    const md = makeMd("````", "POST", "/v3/items", sampleSpec);
    const parts = extractOpenApiBlock(md)!;
    const rebuilt = spliceOpenApiBlock(parts, parts.json);
    expect(rebuilt).toBe(md);
  });

  test("preserves 3-backtick fence character count", () => {
    const md = makeMd("```", "POST", "/v3/items", sampleSpec);
    const parts = extractOpenApiBlock(md)!;
    const rebuilt = spliceOpenApiBlock(parts, { paths: {} });
    expect(rebuilt).toMatch(/^[\s\S]*```json POST \/v3\/items\n[\s\S]*```\n/);
    expect(rebuilt).not.toContain("````");
  });

  test("only replaces the JSON block content", () => {
    const md = makeMd("````", "POST", "/v3/items", sampleSpec);
    const parts = extractOpenApiBlock(md)!;
    const newJson = { ...sampleSpec, openapi: "3.1.0" };
    const rebuilt = spliceOpenApiBlock(parts, newJson);
    expect(rebuilt).toContain("# Title");
    expect(rebuilt).toContain('"openapi": "3.1.0"');
    expect(rebuilt).not.toContain('"openapi": "3.0.1"');
  });
});

describe("findOperation", () => {
  test("matches static path", () => {
    const spec = { paths: { "/v3/articles": { get: { operationId: "list" } } } };
    const found = findOperation(spec, "GET", "https://api.example.com/v3/articles");
    expect(found).not.toBeNull();
    expect(found!.pathTemplate).toBe("/v3/articles");
    expect(found!.method).toBe("get");
  });

  test("matches single path parameter", () => {
    const spec = { paths: { "/v3/articles/{article_id}": { get: { operationId: "getArticle" } } } };
    const found = findOperation(spec, "GET", "https://api.example.com/v3/articles/abc-123");
    expect(found).not.toBeNull();
    expect(found!.pathTemplate).toBe("/v3/articles/{article_id}");
  });

  test("matches multiple path parameters", () => {
    const spec = {
      paths: { "/v3/projects/{project_id}/articles/{article_id}": { get: { operationId: "getArticle" } } },
    };
    const found = findOperation(spec, "GET", "/v3/projects/p-1/articles/a-2");
    expect(found).not.toBeNull();
    expect(found!.pathTemplate).toBe("/v3/projects/{project_id}/articles/{article_id}");
  });

  test("ignores query string", () => {
    const spec = { paths: { "/v3/articles": { get: {} } } };
    expect(findOperation(spec, "GET", "/v3/articles?limit=10")).not.toBeNull();
  });

  test("tolerates trailing slash", () => {
    const spec = { paths: { "/v3/articles": { get: {} } } };
    expect(findOperation(spec, "GET", "/v3/articles/")).not.toBeNull();
  });

  test("returns null when method missing", () => {
    const spec = { paths: { "/v3/articles": { get: {} } } };
    expect(findOperation(spec, "POST", "/v3/articles")).toBeNull();
  });

  test("returns null when path not in spec", () => {
    const spec = { paths: { "/v3/articles": { get: {} } } };
    expect(findOperation(spec, "GET", "/v3/categories")).toBeNull();
  });

  test("falls back to version-stripped match", () => {
    const spec = { paths: { "/articles": { get: {} } } };
    expect(findOperation(spec, "GET", "/v3/articles")).not.toBeNull();
  });

  test("works on a real Document360 swagger fixture", () => {
    const swagger = JSON.parse(
      readFileSync(resolve(__dirname, "../../../sample_data/document360.v3.swagger.json"), "utf8"),
    );
    const found = findOperation(
      swagger,
      "GET",
      "https://apihub.berlin.document360.net/v3/projects/abc-123/analytics/ai-search/summary",
    );
    expect(found).not.toBeNull();
    expect(found!.pathTemplate).toBe("/v3/projects/{project_id}/analytics/ai-search/summary");
    expect(found!.method).toBe("get");
  });
});

describe("extractTargetSlice", () => {
  const op = sampleSpec.paths["/v3/articles/{article_id}"].post;

  test("identifies existing response example name", () => {
    const slice = extractTargetSlice(op as Record<string, unknown>, 200);
    expect(slice.responseStatusExisted).toBe(true);
    expect(slice.existingResponseExampleName).toBe("Success");
  });

  test("identifies existing request example name", () => {
    const slice = extractTargetSlice(op as Record<string, unknown>, 200);
    expect(slice.existingRequestExampleName).toBe("default");
  });

  test("flags missing status as not existing", () => {
    const slice = extractTargetSlice(op as Record<string, unknown>, 422);
    expect(slice.responseStatusExisted).toBe(false);
    expect(slice.existingResponseExampleName).toBeNull();
  });

  test("returns null examples when status exists but has none", () => {
    const slice = extractTargetSlice(op as Record<string, unknown>, 400);
    expect(slice.responseStatusExisted).toBe(true);
    expect(slice.existingResponseExampleName).toBeNull();
  });

  test("computes media-type hint from sibling responses", () => {
    const slice = extractTargetSlice(op as Record<string, unknown>, 422);
    expect(slice.responseMediaTypeHint).toBe("application/json");
  });
});

describe("applyTargetSlice", () => {
  test("updates existing response status without adding new", () => {
    const result = applyTargetSlice(
      sampleSpec as unknown as Record<string, unknown>,
      {
        pathTemplate: "/v3/articles/{article_id}",
        method: "post",
        op: sampleSpec.paths["/v3/articles/{article_id}"].post as unknown as Record<string, unknown>,
      },
      {
        requestBody: null,
        response: {
          status: "200",
          value: { description: "OK", content: { "application/json": { examples: { Success: { value: { id: "{{proj.articleId}}" } } } } } },
        },
        summary: { requestBodyExampleName: null, responseExampleName: "Success", addedNewExample: false },
      },
      true,
    );
    expect(result.addedNewResponseStatus).toBe(false);
    const newOp = (result.newSpec.paths as any)["/v3/articles/{article_id}"].post;
    expect(newOp.responses["200"].content["application/json"].examples.Success.value.id).toBe("{{proj.articleId}}");
    // Original spec untouched
    expect((sampleSpec.paths["/v3/articles/{article_id}"].post as any).responses["200"].content["application/json"].examples.Success.value.id).toBe("old-id");
  });

  test("adds new response status when not present", () => {
    const result = applyTargetSlice(
      sampleSpec as unknown as Record<string, unknown>,
      {
        pathTemplate: "/v3/articles/{article_id}",
        method: "post",
        op: sampleSpec.paths["/v3/articles/{article_id}"].post as unknown as Record<string, unknown>,
      },
      {
        requestBody: null,
        response: {
          status: "422",
          value: { description: "Unprocessable Entity", content: { "application/json": { examples: { "tryit-422": { value: { error: "validation failed" } } } } } },
        },
        summary: { requestBodyExampleName: null, responseExampleName: "tryit-422", addedNewExample: true },
      },
      false,
    );
    expect(result.addedNewResponseStatus).toBe(true);
    const newOp = (result.newSpec.paths as any)["/v3/articles/{article_id}"].post;
    expect(newOp.responses["422"]).toBeDefined();
    expect(newOp.responses["422"].description).toBe("Unprocessable Entity");
  });

  test("updates requestBody when AI returned non-null", () => {
    const result = applyTargetSlice(
      sampleSpec as unknown as Record<string, unknown>,
      {
        pathTemplate: "/v3/articles/{article_id}",
        method: "post",
        op: sampleSpec.paths["/v3/articles/{article_id}"].post as unknown as Record<string, unknown>,
      },
      {
        requestBody: {
          content: {
            "application/json": {
              schema: { type: "object" },
              examples: { default: { value: { title: "{{proj.articleTitle}}" } } },
            },
          },
        },
        response: {
          status: "200",
          value: { description: "OK", content: { "application/json": { examples: { Success: { value: { id: "x" } } } } } },
        },
        summary: { requestBodyExampleName: "default", responseExampleName: "Success", addedNewExample: false },
      },
      true,
    );
    const newOp = (result.newSpec.paths as any)["/v3/articles/{article_id}"].post;
    expect(newOp.requestBody.content["application/json"].examples.default.value.title).toBe("{{proj.articleTitle}}");
  });
});
