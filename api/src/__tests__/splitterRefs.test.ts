/**
 * Regression: distillSpecContext + parseSpecEndpoints must surface every
 * field of a Document360-style ApiResponse wrapper, including fields nested
 * under `data: { allOf: [<inlined schema>] }`. Previously
 * extractResponseKeyFields only descended into allOf entries that were
 * `{$ref}` objects, but the splitter's inlineRefs replaces the ref with the
 * full inline schema body — so the function silently emitted only
 * `response.data (object)` and downstream validateCaptures rejected real
 * captures like `response.data.id` as hallucinated.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { splitSwagger } from "../lib/swaggerSplitter";
import { distillSpecContext, parseSpecEndpoints } from "../lib/specRequiredFields";

describe("Document360 createArticleArticle — full response field discovery", () => {
  test("splitter bundles ArticleDetailResponse in components.schemas", () => {
    const spec = JSON.parse(
      readFileSync(resolve(__dirname, "../../../sample_data/document360.v3.swagger.json"), "utf8"),
    );
    const { files } = splitSwagger(spec);
    const f = files.find((f) => f.filename === "create-article-article.md");
    expect(f).toBeDefined();

    const m = f!.content.match(/`{3,4}json\s+\S+\s+\S+\n([\s\S]+?)\n`{3,4}/);
    const op = JSON.parse(m![1]);
    const schemas = (op.components?.schemas ?? {}) as Record<string, unknown>;
    expect(schemas).toHaveProperty("ArticleDetailResponseApiResponse");
    expect(schemas).toHaveProperty("ArticleDetailResponse");
  });

  test("distilled response field list includes nested data.* fields", () => {
    const spec = JSON.parse(
      readFileSync(resolve(__dirname, "../../../sample_data/document360.v3.swagger.json"), "utf8"),
    );
    const { files } = splitSwagger(spec);
    const f = files.find((f) => f.filename === "create-article-article.md")!;

    const distilled = distillSpecContext(f.content);
    const endpoints = parseSpecEndpoints(distilled);
    expect(endpoints).toHaveLength(1);

    const fields = endpoints[0].responseFields;
    // The fields the user's flow captures via `<capture source="response.data.X"/>`.
    // If any of these are missing, validateCaptures will falsely flag them as
    // hallucinated and remove them, breaking downstream {{state.X}} refs.
    expect(fields).toContain("id");
    expect(fields).toContain("title");
    expect(fields).toContain("slug");
    // And the array-item recursion that already worked before this fix:
    expect(fields).toContain("code");
    expect(fields).toContain("message");
  });
});
