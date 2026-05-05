import { readFileSync } from "fs";
import { join } from "path";
import { distillSpecContext } from "../lib/specRequiredFields";

describe("distillSpecContext — detect-image (inline schemas)", () => {
  // Extract only the detect-image endpoint from the full swagger
  const full = JSON.parse(readFileSync(
    join(__dirname, "../../../sample_data/datascience.PII-detection-swagger.json"),
    "utf8",
  ));
  // Build a single-endpoint spec like the swagger splitter would produce
  const detectImageSpec = {
    openapi: full.openapi || "3.0.1",
    info: { title: "Detect PII in an image", version: "1.0.0" },
    paths: { "/detect-image": full.paths["/detect-image"] },
    components: full.components,
  };

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

  it("prints full distilled output for inspection", () => {
    console.log("=== DISTILLED OUTPUT ===\n");
    console.log(result);
  });
});
