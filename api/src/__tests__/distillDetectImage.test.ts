import { distillSpecContext } from "../lib/specRequiredFields";

// Minimal detect-image OpenAPI spec with inline response schema + multipart/form-data body
const detectImageSpec = {
  openapi: "3.0.1",
  info: { title: "Detect PII in an image", version: "1.0.0" },
  paths: {
    "/detect-image": {
      post: {
        summary: "Detect PII in an image or return a redacted PNG",
        operationId: "detectImage",
        requestBody: {
          required: true,
          content: {
            "multipart/form-data": {
              schema: {
                type: "object",
                required: ["file"],
                properties: {
                  file: { type: "string", format: "binary", description: "Image file (JPEG, PNG, WebP, etc.)." },
                  action: { type: "string", description: "detect or blur", enum: ["detect", "blur"] },
                  pii_types: { type: "string", description: "Comma-separated built-in type names." },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Success",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["matches"],
                  properties: {
                    matches: {
                      type: "array",
                      items: {
                        type: "object",
                        required: ["index", "pii_type", "text", "prob"],
                        properties: {
                          index: { type: "integer", description: "1-based index" },
                          pii_type: { type: "string" },
                          text: { type: "string", description: "Full OCR line text" },
                          prob: { type: "number", format: "float" },
                        },
                      },
                    },
                    _request_config: {
                      type: "object",
                      properties: {
                        pii_types: { type: "array", nullable: true, items: { type: "string" } },
                        custom_pii_rules_loaded: { type: "integer" },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
};

describe("distillSpecContext — detect-image (inline schemas)", () => {
  const wrapped = "````json POST /detect-image\n" + JSON.stringify(detectImageSpec, null, 2) + "\n````";
  const result = distillSpecContext(wrapped);

  it("should extract response fields from inline schema", () => {
    expect(result).toContain("response.matches");
  });

  it("should extract array item fields from inline schema", () => {
    expect(result).toMatch(/response\.matches\[\]\.index/);
    expect(result).toMatch(/response\.matches\[\]\.pii_type/);
    expect(result).toMatch(/response\.matches\[\]\.text/);
    expect(result).toMatch(/response\.matches\[\]\.prob/);
  });

  it("should extract request body fields from multipart/form-data", () => {
    expect(result).toContain("`file`");
    expect(result).toContain("`action`");
    expect(result).toContain("`pii_types`");
  });

  it("should NOT contain hallucinated fields", () => {
    expect(result).not.toContain("response.has_pii");
    expect(result).not.toContain("response.status");
    expect(result).not.toContain("response.redacted_image");
  });
});
