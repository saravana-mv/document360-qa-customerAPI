import { buildStepContext, formatStepContext } from "../lib/stepContext";

// ── Sample distilled spec context ────────────────────────────────────

const SAMPLE_SPEC_CONTEXT = `## V3/categories/create-category.md

## Endpoint: POST /v3/projects/{project_id}/categories
**Create a new category**

### Request Body (CreateCategoryRequest)
**REQUIRED FIELDS: \`name\`, \`workspace_id\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **YES** | Category name |
| \`workspace_id\` | string | **YES** | Workspace ID |
| \`order\` | integer | no | Display order |

### Response (201)
**Response fields available for capture** (use \`<capture variable="state.xxx" source="response.data.xxx"/>\`):
- \`response.data.id\` — Category ID
- \`response.data.name\` — Category name
Key fields: response.data.id, response.data.name

---

## V3/articles/create-article.md

## Endpoint: POST /v3/projects/{project_id}/articles
**Create a new article**

### Request Body (CreateArticleRequest)
**REQUIRED FIELDS: \`title\`, \`category_id\`, \`workspace_id\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`title\` | string | **YES** | Article title |
| \`category_id\` | string | **YES** | Parent category |
| \`workspace_id\` | string | **YES** | Workspace ID |
| \`content\` | string | no | HTML content |

### Response (201)
**Response fields available for capture** (use \`<capture variable="state.xxx" source="response.data.xxx"/>\`):
- \`response.data.id\` — Article ID
- \`response.data.title\` — Article title
- \`response.data.category_id\` — Category ID
- \`response.data.workspace_id\` — Workspace ID
Key fields: response.data.id, response.data.title, response.data.category_id, response.data.workspace_id

---

## V3/articles/get-article.md

## Endpoint: GET /v3/projects/{project_id}/articles/{article_id}
**Get article by ID**

### Response (200)
**Response fields available for capture** (use \`<capture variable="state.xxx" source="response.data.xxx"/>\`):
- \`response.data.id\` — Article ID
- \`response.data.title\` — Article title
- \`response.data.category_id\` — Category
- \`response.data.workspace_id\` — Workspace ID
Key fields: response.data.id, response.data.title, response.data.category_id, response.data.workspace_id`;

// ── Tests ────────────────────────────────────────────────────────────

describe("buildStepContext", () => {
  const projVars = [
    { name: "projectId", value: "proj-123" },
    { name: "workspaceId", value: "ws-456" },
  ];

  const specFiles = [
    "V3/categories/create-category.md",
    "V3/articles/create-article.md",
    "V3/articles/get-article.md",
  ];

  it("matches idea steps to spec endpoints", () => {
    const steps = [
      "POST /v3/projects/{project_id}/categories",
      "POST /v3/projects/{project_id}/articles",
      "GET /v3/projects/{project_id}/articles/{article_id}",
    ];

    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, specFiles, projVars);

    expect(entries).toHaveLength(3);
    expect(entries[0].specFile).toBe("V3/categories/create-category.md");
    expect(entries[1].specFile).toBe("V3/articles/create-article.md");
    expect(entries[2].specFile).toBe("V3/articles/get-article.md");
  });

  it("extracts required fields with proper value sources", () => {
    const steps = [
      "POST /v3/projects/{project_id}/categories",
      "POST /v3/projects/{project_id}/articles",
    ];

    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, specFiles, projVars);

    // Category step: name → literal, workspace_id → proj var
    const catFields = entries[0].requiredBodyFields;
    const nameField = catFields.find(f => f.name === "name");
    expect(nameField).toBeDefined();
    expect(nameField?.valueSource).toContain("{{timestamp}}");

    const wsField = catFields.find(f => f.name === "workspace_id");
    expect(wsField).toBeDefined();
    expect(wsField?.valueSource).toBe("{{proj.workspaceId}}");

    // Article step: category_id → state from step 1
    const artFields = entries[1].requiredBodyFields;
    const catIdField = artFields.find(f => f.name === "category_id");
    expect(catIdField).toBeDefined();
    expect(catIdField?.valueSource).toContain("{{state.");
  });

  it("marks step without matching spec with notes", () => {
    const steps = [
      "DELETE /v3/projects/{project_id}/articles/{article_id}",
    ];

    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, specFiles, projVars);
    expect(entries[0].specFile).toBeNull();
    expect(entries[0].purpose).toBe("teardown");
  });

  it("classifies step purposes correctly", () => {
    const steps = [
      "POST /v3/projects/{project_id}/categories",
      "POST /v3/projects/{project_id}/articles",
      "GET /v3/projects/{project_id}/articles/{article_id}",
      "DELETE /v3/projects/{project_id}/articles/{article_id}",
      "DELETE /v3/projects/{project_id}/categories/{category_id}",
    ];

    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, specFiles, projVars);

    // Categories is prerequisite (articles is primary resource — more references)
    expect(entries[0].purpose).toBe("prerequisite");
    // Articles are primary
    expect(entries[1].purpose).toBe("primary");
    expect(entries[2].purpose).toBe("primary");
    // DELETEs are teardown
    expect(entries[3].purpose).toBe("teardown");
    expect(entries[4].purpose).toBe("teardown");
  });

  it("builds capture hints for downstream consumption", () => {
    const steps = [
      "POST /v3/projects/{project_id}/categories",
      "POST /v3/projects/{project_id}/articles",
    ];

    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, specFiles, projVars);

    // Category step should capture id (needed by article step for category_id)
    const catCaptures = entries[0].responseCaptures;
    const idCapture = catCaptures.find(c => c.field === "id");
    expect(idCapture).toBeDefined();
    expect(idCapture?.stateVar).toContain("category");
  });

  it("builds path param hints from state", () => {
    const steps = [
      "POST /v3/projects/{project_id}/categories",
      "GET /v3/projects/{project_id}/articles/{article_id}",
    ];

    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, specFiles, projVars);

    const getEntry = entries[1];
    const articleIdParam = getEntry.pathParamHints.find(p => p.name === "article_id");
    expect(articleIdParam).toBeDefined();
    // project_id should map to proj var
    const projIdParam = getEntry.pathParamHints.find(p => p.name === "project_id");
    expect(projIdParam?.value).toBe("{{proj.projectId}}");
  });

  it("returns empty array for empty steps", () => {
    const entries = buildStepContext([], SAMPLE_SPEC_CONTEXT, specFiles, projVars);
    expect(entries).toHaveLength(0);
  });

  it("handles steps that don't parse as method+path", () => {
    const steps = ["Some weird step description"];
    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, specFiles, projVars);
    expect(entries).toHaveLength(1);
    expect(entries[0].method).toBe("GET");
    expect(entries[0].specFile).toBeNull();
  });
});

describe("formatStepContext", () => {
  it("produces well-structured markdown", () => {
    const projVars = [
      { name: "projectId", value: "proj-123" },
      { name: "workspaceId", value: "ws-456" },
    ];

    const steps = [
      "POST /v3/projects/{project_id}/categories",
      "POST /v3/projects/{project_id}/articles",
    ];

    const entries = buildStepContext(steps, SAMPLE_SPEC_CONTEXT, [
      "V3/categories/create-category.md",
      "V3/articles/create-article.md",
    ], projVars);

    const text = formatStepContext(entries);

    // Should contain step headers
    expect(text).toContain("## Step 1:");
    expect(text).toContain("## Step 2:");
    // Should contain spec references
    expect(text).toContain("Spec: V3/categories/create-category.md");
    // Should contain field hints
    expect(text).toContain("`name`");
    expect(text).toContain("`workspace_id`");
    // Should contain capture hints
    expect(text).toContain("### Response Fields to Capture");
    expect(text).toContain("state.");
  });

  it("marks spec-less steps", () => {
    const entries = buildStepContext(
      ["DELETE /v3/projects/{project_id}/foo/{foo_id}"],
      SAMPLE_SPEC_CONTEXT,
      [],
      [],
    );
    const text = formatStepContext(entries);
    expect(text).toContain("Spec: (none available)");
  });
});

describe("buildStepContext with item schemas", () => {
  const BULK_SPEC = `## V3/articles/bulk-create-article.md

## Endpoint: POST /v3/projects/{project_id}/articles/bulk
**Bulk create articles**

### Request Body (BulkCreateRequest)
**REQUIRED FIELDS: \`articles\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`articles\` | array | **YES** | Array of articles |

### Array Item Schema: \`articles\` -> ArticleItem
**REQUIRED FIELDS (per item): \`title\`, \`category_id\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`title\` | string | **YES** | Article title |
| \`category_id\` | string | **YES** | Parent category |

### Response (201)
**Response fields available for capture**:
- \`response.data.id\` — Bulk ID
Key fields: response.data.id`;

  it("extracts item schema for bulk endpoints", () => {
    const steps = ["POST /v3/projects/{project_id}/articles/bulk"];
    const entries = buildStepContext(steps, BULK_SPEC, ["V3/articles/bulk-create-article.md"], []);

    expect(entries[0].itemSchema).not.toBeNull();
    expect(entries[0].itemSchema?.parentField).toBe("articles");
    expect(entries[0].itemSchema?.requiredFields).toHaveLength(2);
    expect(entries[0].itemSchema?.requiredFields.map(f => f.name)).toContain("title");
    expect(entries[0].itemSchema?.requiredFields.map(f => f.name)).toContain("category_id");
  });
});
