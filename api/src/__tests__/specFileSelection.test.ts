import { filterRelevantSpecs } from "../lib/specFileSelection";

// Legacy-style filenames (prefixed: create-article.md, get-category.md)
const allFiles = [
  "V3/articles/create-article.md",
  "V3/articles/get-article.md",
  "V3/articles/update-article.md",
  "V3/articles/delete-article.md",
  "V3/articles/publish-article.md",
  "V3/articles/bulk-publish-article.md",
  "V3/categories/create-category.md",
  "V3/categories/get-category.md",
  "V3/categories/update-category.md",
  "V3/categories/delete-category.md",
  "V3/projects/get-project.md",
  "V3/projects/update-project.md",
  "V3/_system/_rules.json",
  "V3/_system/_distilled/articles/create-article.md",
  "V3/articles/_distilled/get-article.md",
];

// Splitter-generated filenames (exact: create.md, patch.md, get.md, list.md)
const splitterFiles = [
  "V3/categories/create.md",
  "V3/categories/create-categories-bulk.md",
  "V3/categories/get.md",
  "V3/categories/list.md",
  "V3/categories/patch.md",
  "V3/categories/delete.md",
  "V3/articles/create.md",
  "V3/articles/get.md",
  "V3/articles/list.md",
  "V3/articles/update.md",
  "V3/articles/delete.md",
  "V3/_system/_rules.json",
];

function idea(
  steps: string[],
  entities: string[] = [],
  description = ""
) {
  return { steps, entities, description };
}

describe("filterRelevantSpecs", () => {
  it("matches POST step to create-* spec", () => {
    const result = filterRelevantSpecs(
      idea(["POST /v3/projects/{project_id}/articles"]),
      allFiles
    );
    expect(result).toContain("V3/articles/create-article.md");
    expect(result).not.toContain("V3/articles/get-article.md");
  });

  it("matches GET step to get-* spec", () => {
    const result = filterRelevantSpecs(
      idea(["GET /v3/projects/{project_id}/categories/{category_id}"]),
      allFiles
    );
    expect(result).toContain("V3/categories/get-category.md");
    // Sibling folder create/delete specs are auto-included as dependencies
    expect(result).not.toContain("V3/categories/update-category.md");
  });

  it("matches DELETE step to delete-* spec", () => {
    const result = filterRelevantSpecs(
      idea(["DELETE /v3/projects/{project_id}/articles/{article_id}"]),
      allFiles
    );
    expect(result).toContain("V3/articles/delete-article.md");
  });

  it("matches PUT step to update-* spec", () => {
    const result = filterRelevantSpecs(
      idea(["PUT /v3/projects/{project_id}/categories/{category_id}"]),
      allFiles
    );
    expect(result).toContain("V3/categories/update-category.md");
  });

  it("matches PATCH step to update-* spec", () => {
    const result = filterRelevantSpecs(
      idea(["PATCH /v3/projects/{project_id}/articles/{article_id}"]),
      allFiles
    );
    expect(result).toContain("V3/articles/update-article.md");
  });

  it("matches action endpoint: POST .../publish → publish-article.md", () => {
    const result = filterRelevantSpecs(
      idea(["POST /v3/projects/{project_id}/articles/{article_id}/publish"]),
      allFiles
    );
    expect(result).toContain("V3/articles/publish-article.md");
  });

  it("matches bulk operation: POST .../bulk/publish → bulk-publish-article.md", () => {
    const result = filterRelevantSpecs(
      idea(["POST /v3/projects/{project_id}/articles/bulk/publish"]),
      allFiles
    );
    expect(result).toContain("V3/articles/bulk-publish-article.md");
  });

  it("filters out _system/ and _distilled/ files", () => {
    const result = filterRelevantSpecs(
      idea(["POST /v3/projects/{project_id}/articles"]),
      allFiles
    );
    for (const f of result) {
      expect(f).not.toMatch(/\/_system\//);
      expect(f).not.toMatch(/\/_distilled\//);
    }
  });

  it("auto-includes create/delete specs from sibling folders for dependencies", () => {
    const result = filterRelevantSpecs(
      idea(["POST /v3/projects/{project_id}/articles"]),
      allFiles
    );
    // Primary match in articles folder
    expect(result).toContain("V3/articles/create-article.md");
    // Sibling folder dependency specs auto-included
    expect(result).toContain("V3/categories/create-category.md");
    expect(result).toContain("V3/categories/delete-category.md");
    // Non-create/delete from sibling folders should NOT be included
    expect(result).not.toContain("V3/categories/get-category.md");
    expect(result).not.toContain("V3/categories/update-category.md");
  });

  it("auto-includes create spec from same folder for action endpoints", () => {
    const result = filterRelevantSpecs(
      idea(["POST /v3/projects/{project_id}/articles/{article_id}/publish"]),
      allFiles
    );
    expect(result).toContain("V3/articles/publish-article.md");
    // create-article.md from same folder included for schema context
    expect(result).toContain("V3/articles/create-article.md");
  });

  it("returns empty array when no steps match", () => {
    const result = filterRelevantSpecs(
      idea([], [], ""),
      allFiles
    );
    expect(result).toEqual([]);
  });

  it("returns empty array for unparseable steps with no keyword fallback", () => {
    const result = filterRelevantSpecs(
      idea(["some random text"]),
      allFiles
    );
    expect(result).toEqual([]);
  });

  it("falls back to keyword matching when step parsing finds nothing", () => {
    const result = filterRelevantSpecs(
      idea(
        ["Verify article publishing workflow"],
        ["articles"],
        "Test that articles can be published"
      ),
      allFiles
    );
    // No HTTP method in steps, so keyword fallback triggers
    // "articles" entity should match article-related files
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((f) => f.toLowerCase().includes("article"))).toBe(true);
  });

  it("handles multiple steps selecting specs from different folders", () => {
    const result = filterRelevantSpecs(
      idea([
        "POST /v3/projects/{project_id}/categories",
        "POST /v3/projects/{project_id}/articles",
        "DELETE /v3/projects/{project_id}/articles/{article_id}",
        "DELETE /v3/projects/{project_id}/categories/{category_id}",
      ]),
      allFiles
    );
    expect(result).toContain("V3/categories/create-category.md");
    expect(result).toContain("V3/articles/create-article.md");
    expect(result).toContain("V3/articles/delete-article.md");
    expect(result).toContain("V3/categories/delete-category.md");
  });

  it("deduplicates results", () => {
    const result = filterRelevantSpecs(
      idea([
        "POST /v3/projects/{project_id}/articles",
        "POST /v3/projects/{project_id}/articles",
      ]),
      allFiles
    );
    const unique = new Set(result);
    expect(result.length).toBe(unique.size);
  });

  it("handles case-insensitive method matching", () => {
    const result = filterRelevantSpecs(
      idea(["post /v3/projects/{project_id}/articles"]),
      allFiles
    );
    expect(result).toContain("V3/articles/create-article.md");
  });

  it("handles step descriptions in parentheses after the path", () => {
    const result = filterRelevantSpecs(
      idea(["POST /v3/projects/{project_id}/categories (Create a test category)"]),
      allFiles
    );
    expect(result).toContain("V3/categories/create-category.md");
  });

  // ── Splitter-generated filename tests ────────────────────────────

  describe("splitter-generated filenames (exact names)", () => {
    it("matches POST to create.md", () => {
      const result = filterRelevantSpecs(
        idea(["POST /v3/projects/{project_id}/categories"]),
        splitterFiles
      );
      expect(result).toContain("V3/categories/create.md");
    });

    it("matches PATCH to patch.md", () => {
      const result = filterRelevantSpecs(
        idea(["PATCH /v3/projects/{project_id}/categories/{id}"]),
        splitterFiles
      );
      expect(result).toContain("V3/categories/patch.md");
    });

    it("matches GET with path param to get.md (single resource)", () => {
      const result = filterRelevantSpecs(
        idea(["GET /v3/projects/{project_id}/categories/{id}"]),
        splitterFiles
      );
      expect(result).toContain("V3/categories/get.md");
    });

    it("matches GET without path param to list.md (collection)", () => {
      const result = filterRelevantSpecs(
        idea(["GET /v3/projects/{project_id}/categories"]),
        splitterFiles
      );
      expect(result).toContain("V3/categories/list.md");
    });

    it("matches DELETE to delete.md", () => {
      const result = filterRelevantSpecs(
        idea(["DELETE /v3/projects/{project_id}/categories/{id}"]),
        splitterFiles
      );
      expect(result).toContain("V3/categories/delete.md");
    });

    it("matches PUT to update.md", () => {
      // Add update.md to categories for this test
      const files = [...splitterFiles, "V3/categories/update.md"];
      const result = filterRelevantSpecs(
        idea(["PUT /v3/projects/{project_id}/categories/{id}"]),
        files
      );
      expect(result).toContain("V3/categories/update.md");
    });

    it("CRUD lifecycle selects all relevant splitter files", () => {
      const result = filterRelevantSpecs(
        idea([
          "POST /v3/projects/{project_id}/categories",
          "GET /v3/projects/{project_id}/categories/{id}",
          "PATCH /v3/projects/{project_id}/categories/{id}",
          "DELETE /v3/projects/{project_id}/categories/{id}",
        ]),
        splitterFiles
      );
      expect(result).toContain("V3/categories/create.md");
      expect(result).toContain("V3/categories/get.md");
      expect(result).toContain("V3/categories/patch.md");
      expect(result).toContain("V3/categories/delete.md");
    });

    it("auto-includes create/delete from sibling folders with exact names", () => {
      const result = filterRelevantSpecs(
        idea(["PATCH /v3/projects/{project_id}/categories/{id}"]),
        splitterFiles
      );
      expect(result).toContain("V3/categories/patch.md");
      // Sibling folder create/delete specs auto-included
      expect(result).toContain("V3/articles/create.md");
      expect(result).toContain("V3/articles/delete.md");
    });

    it("POST matches create.md over create-categories-bulk.md for non-bulk", () => {
      const result = filterRelevantSpecs(
        idea(["POST /v3/projects/{project_id}/categories"]),
        splitterFiles
      );
      // Both create.md and create-categories-bulk.md may match, but create.md is the primary
      expect(result).toContain("V3/categories/create.md");
    });
  });
});
