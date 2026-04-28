import {
  extractCommonRequiredFields,
  analyzeCrossStepDependencies,
  injectSpecRequiredFields,
  injectCrossStepCaptures,
  injectEndpointRefs,
  stripExtraRequestFields,
} from "../lib/specRequiredFields";
import { filterRelevantSpecs } from "../lib/specFileSelection";

// ── extractCommonRequiredFields ──────────────────────────────────────

describe("extractCommonRequiredFields", () => {
  it("extracts id/version fields from REQUIRED FIELDS line", () => {
    const spec = `
## Endpoint: POST /v2/articles
**REQUIRED FIELDS: \`title\`, \`category_id\`, \`project_version_id\`**
`;
    const result = extractCommonRequiredFields(spec);
    expect(result).toContain("category_id");
    expect(result).toContain("project_version_id");
  });

  it("extracts id/version fields from table rows with **YES**", () => {
    const spec = `
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`title\` | string | **YES** | The title |
| \`category_id\` | string | **YES** | Category ref |
| \`content\` | string | no | Body content |
| \`version_number\` | integer | **YES** | Version |
`;
    const result = extractCommonRequiredFields(spec);
    expect(result).toContain("category_id");
    expect(result).toContain("version_number");
  });

  it("filters out non-id/version fields like title and name", () => {
    const spec = `
**REQUIRED FIELDS: \`title\`, \`name\`, \`category_id\`, \`content\`**
`;
    const result = extractCommonRequiredFields(spec);
    expect(result).not.toContain("title");
    expect(result).not.toContain("name");
    expect(result).not.toContain("content");
    expect(result).toContain("category_id");
  });

  it("returns empty array when no matches", () => {
    const spec = `
## Endpoint: GET /v2/articles
### Response (200)
No required fields here.
`;
    const result = extractCommonRequiredFields(spec);
    expect(result).toEqual([]);
  });

  it("extracts from REQUIRED FIELDS (per item) line", () => {
    const spec = `
**REQUIRED FIELDS (per item): \`article_id\`, \`title\`, \`status\`**
`;
    const result = extractCommonRequiredFields(spec);
    expect(result).toContain("article_id");
    expect(result).not.toContain("title");
    expect(result).not.toContain("status");
  });
});

// ── analyzeCrossStepDependencies ─────────────────────────────────────

describe("analyzeCrossStepDependencies", () => {
  const distilledContext = `
## Endpoint: POST /v2/categories
**Create a category**

### Request Body (CreateCategoryRequest)
**REQUIRED FIELDS: \`name\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **YES** | Category name |

### Response (200)
**Response fields available for capture** (use \`<capture variable="state.xxx" source="response.data.xxx"/>\`):
- \`response.data.id\`
- \`response.data.version_number\`

## Endpoint: PUT /v2/categories/{id}
**Update a category**

### Request Body (UpdateCategoryRequest)
**REQUIRED FIELDS: \`name\`, \`version_number\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **YES** | Category name |
| \`version_number\` | integer | **YES** | Current version |

### Response (200)
**Response fields available for capture** (use \`<capture variable="state.xxx" source="response.data.xxx"/>\`):
- \`response.data.id\`
- \`response.data.version_number\`
`;

  it("detects cross-endpoint dependency for version_number", () => {
    const result = analyzeCrossStepDependencies(distilledContext);
    expect(result).toContain("Cross-Step Data Dependencies");
    expect(result).toContain("version_number");
    expect(result).toContain("state.versionNumber");
    expect(result).toContain("POST /v2/categories");
    expect(result).toContain("PUT /v2/categories/{id}");
  });

  it("returns empty string when no dependencies found", () => {
    const simpleSpec = `
## Endpoint: GET /v2/articles
### Response (200)
- \`response.data.id\`
`;
    const result = analyzeCrossStepDependencies(simpleSpec);
    expect(result).toBe("");
  });

  it("skips fields covered by project variables", () => {
    const spec = `
## Endpoint: POST /v2/projects
### Response (200)
- \`response.data.api_key\`

## Endpoint: PUT /v2/settings
**REQUIRED FIELDS: \`api_key\`**
### Response (200)
`;
    const result = analyzeCrossStepDependencies(spec, [
      { name: "api_key", value: "my-key" },
    ]);
    expect(result).toBe("");
  });
});

// ── injectSpecRequiredFields ─────────────────────────────────────────

describe("injectSpecRequiredFields", () => {
  const specContext = `
## Endpoint: POST /v2/articles
**Create an article**

### Request Body (CreateArticleRequest)
**REQUIRED FIELDS: \`title\`, \`category_id\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`title\` | string | **YES** | The title |
| \`category_id\` | string | **YES** | Category ref |
| \`content\` | string | no | Body content |

### Response (200)
- \`response.data.id\`
`;

  const wrapFlowXml = (stepXml: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <meta>
    <name>Test Flow</name>
  </meta>
  <steps>
    ${stepXml}
  </steps>
</flow>`;

  it("injects missing required field into step body", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create Article</name>
      <method>POST</method>
      <path>/v2/articles</path>
      <body><![CDATA[{
  "title": "Test Article"
}]]></body>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>`);

    const result = injectSpecRequiredFields(xml, specContext, []);
    expect(result).toContain('"category_id"');
  });

  it("uses project variable when field matches", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create Article</name>
      <method>POST</method>
      <path>/v2/articles</path>
      <body><![CDATA[{
  "title": "Test Article"
}]]></body>
    </step>`);

    const result = injectSpecRequiredFields(xml, specContext, [
      { name: "category_id", value: "cat-123" },
    ]);
    expect(result).toContain("{{proj.category_id}}");
  });

  it("uses state variable when captured earlier in the XML", () => {
    // Simulate an earlier step that captured state.categoryId
    const xml = wrapFlowXml(`
    <step>
      <name>Create Category</name>
      <method>POST</method>
      <path>/v2/categories</path>
      <body><![CDATA[{
  "name": "Test Cat"
}]]></body>
      <captures>
        <capture variable="state.categoryId" source="response.data.id"/>
      </captures>
    </step>
    <step>
      <name>Create Article</name>
      <method>POST</method>
      <path>/v2/articles</path>
      <body><![CDATA[{
  "title": "Test Article"
}]]></body>
    </step>`);

    const result = injectSpecRequiredFields(xml, specContext, []);
    expect(result).toContain("{{state.categoryId}}");
  });

  it("skips fields already present in the body", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create Article</name>
      <method>POST</method>
      <path>/v2/articles</path>
      <body><![CDATA[{
  "title": "Test Article",
  "category_id": "{{state.categoryId}}"
}]]></body>
    </step>`);

    const result = injectSpecRequiredFields(xml, specContext, []);
    // Should not duplicate category_id
    const matches = result.match(/"category_id"/g);
    expect(matches).toHaveLength(1);
  });

  it("does not modify GET steps", () => {
    const getSpec = `
## Endpoint: GET /v2/articles/{id}
**REQUIRED FIELDS: \`article_id\`**
### Response (200)
`;
    const xml = wrapFlowXml(`
    <step>
      <name>Get Article</name>
      <method>GET</method>
      <path>/v2/articles/{id}</path>
    </step>`);

    const result = injectSpecRequiredFields(xml, getSpec, []);
    expect(result).toBe(xml);
  });

  it("returns xml unchanged when specContext is empty", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create</name>
      <method>POST</method>
      <path>/v2/articles</path>
      <body><![CDATA[{}]]></body>
    </step>`);

    const result = injectSpecRequiredFields(xml, "", []);
    expect(result).toBe(xml);
  });
});

// ── injectCrossStepCaptures ──────────────────────────────────────────

describe("injectCrossStepCaptures", () => {
  const specContext = `
## Endpoint: POST /v2/categories
**Create a category**

### Request Body (CreateCategoryRequest)
**REQUIRED FIELDS: \`name\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **YES** | Category name |

### Response (200)
**Response fields available for capture** (use \`<capture variable="state.xxx" source="response.data.xxx"/>\`):
- \`response.data.id\`
- \`response.data.version_number\`

## Endpoint: PUT /v2/categories/{id}
**Update a category**

### Request Body (UpdateCategoryRequest)
**REQUIRED FIELDS: \`name\`, \`version_number\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **YES** | Category name |
| \`version_number\` | integer | **YES** | Current version |

### Response (200)
**Response fields available for capture** (use \`<capture variable="state.xxx" source="response.data.xxx"/>\`):
- \`response.data.id\`
- \`response.data.version_number\`
`;

  const wrapFlowXml = (stepsXml: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <meta>
    <name>Category CRUD</name>
  </meta>
  <steps>
${stepsXml}
  </steps>
</flow>`;

  it("injects capture in producer and body ref in consumer", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create Category</name>
      <method>POST</method>
      <path>/v2/categories</path>
      <body><![CDATA[{
  "name": "Test Category"
}]]></body>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
    <step>
      <name>Update Category</name>
      <method>PUT</method>
      <path>/v2/categories/{id}</path>
      <body><![CDATA[{
  "name": "Updated Category"
}]]></body>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>`);

    const result = injectCrossStepCaptures(xml, specContext, []);

    // Producer step should get a capture for version_number
    expect(result).toContain(
      'capture variable="state.versionNumber" source="response.data.version_number"'
    );
    // Consumer step body should reference the captured value
    expect(result).toContain('"version_number": "{{state.versionNumber}}"');
  });

  it("does not duplicate existing captures", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create Category</name>
      <method>POST</method>
      <path>/v2/categories</path>
      <body><![CDATA[{
  "name": "Test Category"
}]]></body>
      <captures>
        <capture variable="state.versionNumber" source="response.data.version_number"/>
      </captures>
    </step>
    <step>
      <name>Update Category</name>
      <method>PUT</method>
      <path>/v2/categories/{id}</path>
      <body><![CDATA[{
  "name": "Updated Category"
}]]></body>
    </step>`);

    const result = injectCrossStepCaptures(xml, specContext, []);
    // Should have exactly one capture for versionNumber (the existing one)
    const captureMatches = result.match(/state\.versionNumber/g);
    // The existing capture + the body reference = at least 2
    // But the capture itself should not be duplicated
    const captureElements = result.match(
      /capture variable="state\.versionNumber"/g
    );
    expect(captureElements).toHaveLength(1);
  });

  it("skips fields covered by project variables", () => {
    const specWithProjField = `
## Endpoint: POST /v2/items
### Response (200)
- \`response.data.api_key\`

## Endpoint: PUT /v2/items/{id}
**REQUIRED FIELDS: \`api_key\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`api_key\` | string | **YES** | Key |

### Response (200)
`;
    const xml = wrapFlowXml(`
    <step>
      <name>Create Item</name>
      <method>POST</method>
      <path>/v2/items</path>
      <body><![CDATA[{
  "name": "item"
}]]></body>
    </step>
    <step>
      <name>Update Item</name>
      <method>PUT</method>
      <path>/v2/items/{id}</path>
      <body><![CDATA[{
  "name": "updated"
}]]></body>
    </step>`);

    const result = injectCrossStepCaptures(xml, specWithProjField, [
      { name: "api_key", value: "key-123" },
    ]);
    // Should not inject capture for api_key since it's a project variable
    expect(result).not.toContain('source="response.data.api_key"');
  });

  it("returns xml unchanged when specContext is empty", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create</name>
      <method>POST</method>
      <path>/v2/things</path>
      <body><![CDATA[{}]]></body>
    </step>`);

    const result = injectCrossStepCaptures(xml, "", []);
    expect(result).toBe(xml);
  });

  it("returns xml unchanged when no cross-step dependencies exist", () => {
    const independentSpec = `
## Endpoint: GET /v2/articles
### Response (200)
- \`response.data.id\`
`;
    const xml = wrapFlowXml(`
    <step>
      <name>List Articles</name>
      <method>GET</method>
      <path>/v2/articles</path>
    </step>`);

    const result = injectCrossStepCaptures(xml, independentSpec, []);
    expect(result).toBe(xml);
  });
});

// ── injectEndpointRefs ─────────────────────────────────────────────

describe("injectEndpointRefs", () => {
  const wrapFlowXml = (stepXml: string) =>
    `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <meta>
    <name>Test Flow</name>
  </meta>
  <steps>
    ${stepXml}
  </steps>
</flow>`;

  const specContext = `## V3/categories/post.md

## Endpoint: POST /v3/projects/{project_id}/categories

## V3/categories/patch.md

## Endpoint: PATCH /v3/projects/{project_id}/categories/{id}

## V3/categories/get.md

## Endpoint: GET /v3/projects/{project_id}/categories/{id}
`;

  it("injects missing endpointRef", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Create Category</name>
      <method>POST</method>
      <path>/v3/projects/{project_id}/categories</path>
    </step>`);

    const result = injectEndpointRefs(xml, specContext);
    expect(result).toContain("<endpointRef>V3/categories/post.md</endpointRef>");
  });

  it("keeps correct existing endpointRef", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Update Category</name>
      <endpointRef>V3/categories/patch.md</endpointRef>
      <method>PATCH</method>
      <path>/v3/projects/{project_id}/categories/{id}</path>
    </step>`);

    const result = injectEndpointRefs(xml, specContext);
    expect(result).toContain("<endpointRef>V3/categories/patch.md</endpointRef>");
    // Should not duplicate
    expect(result.match(/<endpointRef>/g)?.length).toBe(1);
  });

  it("corrects hallucinated endpointRef to the right spec file", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Update Category</name>
      <endpointRef>V3/categories/update-categories.md</endpointRef>
      <method>PATCH</method>
      <path>/v3/projects/{project_id}/categories/{id}</path>
    </step>`);

    const result = injectEndpointRefs(xml, specContext);
    // Hallucinated "update-categories.md" should be replaced with "patch.md"
    expect(result).not.toContain("update-categories.md");
    expect(result).toContain("<endpointRef>V3/categories/patch.md</endpointRef>");
  });

  it("leaves hallucinated ref unchanged if no method+path match found", () => {
    const xml = wrapFlowXml(`
    <step>
      <name>Delete Category</name>
      <endpointRef>V3/categories/delete.md</endpointRef>
      <method>DELETE</method>
      <path>/v3/projects/{project_id}/categories/{id}</path>
    </step>`);

    const result = injectEndpointRefs(xml, specContext);
    // DELETE is not in our specContext, so hallucinated ref stays (no match to correct to)
    expect(result).toContain("V3/categories/delete.md");
  });

  it("corrects known file used on wrong method (create.md on PATCH step)", () => {
    // Splitter-style context: create.md is POST, patch.md is PATCH
    const splitterContext = `## V3/categories/create.md

## Endpoint: POST /v3/projects/{project_id}/categories

## V3/categories/patch.md

## Endpoint: PATCH /v3/projects/{project_id}/categories/{id}

## V3/categories/get.md

## Endpoint: GET /v3/projects/{project_id}/categories/{id}
`;
    const xml = wrapFlowXml(`
    <step>
      <name>Update Category</name>
      <endpointRef>V3/categories/create.md</endpointRef>
      <method>PATCH</method>
      <path>/v3/projects/{project_id}/categories/{id}</path>
    </step>`);

    const result = injectEndpointRefs(xml, splitterContext);
    // create.md is a known file but maps to POST, not PATCH — must be corrected
    expect(result).not.toContain("<endpointRef>V3/categories/create.md</endpointRef>");
    expect(result).toContain("<endpointRef>V3/categories/patch.md</endpointRef>");
  });

  it("picks non-bulk file when multiple files share the same endpoint", () => {
    const collisionContext = `## V3/categories/create.md

## Endpoint: POST /v3/projects/{project_id}/categories

## V3/categories/create-categories-bulk.md

## Endpoint: POST /v3/projects/{project_id}/categories
`;
    const xml = wrapFlowXml(`
    <step>
      <name>Create Category</name>
      <method>POST</method>
      <path>/v3/projects/{project_id}/categories</path>
      <body>{"name": "Test"}</body>
    </step>`);

    const result = injectEndpointRefs(xml, collisionContext);
    // Should prefer create.md (non-bulk, shorter) over create-categories-bulk.md
    expect(result).toContain("<endpointRef>V3/categories/create.md</endpointRef>");
    expect(result).not.toContain("create-categories-bulk.md");
  });
});

// ── Integration: Full CRUD Lifecycle Pipeline ──────────────────────────
// Reproduces the exact scenario: splitter-generated filenames, AI-generated
// XML with wrong/bare endpointRefs, workspace_id in PATCH body.
// Tests filterRelevantSpecs → stripExtraRequestFields → injectEndpointRefs.

describe("CRUD lifecycle integration (splitter filenames)", () => {
  // Simulate blob listing: splitter-generated files (descriptive naming)
  const allBlobFiles = [
    "V3/categories/create-category.md",
    "V3/categories/create-categories-bulk.md",
    "V3/categories/get-category.md",
    "V3/categories/list-categories.md",
    "V3/categories/update-category.md",
    "V3/categories/delete-category.md",
    "V3/articles/create-article.md",
    "V3/articles/get-article.md",
    "V3/articles/update-article.md",
    "V3/articles/delete-article.md",
    "V3/_system/_rules.json",
    "V3/_system/_digest.md",
  ];

  // Idea steps for a CRUD lifecycle
  const crudIdea = {
    steps: [
      "POST /v3/projects/{project_id}/categories (Create a test category)",
      "GET /v3/projects/{project_id}/categories/{id} (Read it back)",
      "PATCH /v3/projects/{project_id}/categories/{id} (Update name and icon)",
      "GET /v3/projects/{project_id}/categories/{id} (Confirm update)",
      "DELETE /v3/projects/{project_id}/categories/{id} (Teardown)",
    ],
    entities: ["categories"],
    description: "Full CRUD lifecycle for categories",
  };

  // Helper: strip inner "## filename.md" headers — same logic as buildSpecContext
  function stripInnerHeaders(content: string): string {
    let c = content.replace(/^<!--[^>]*-->\n/m, "");
    c = c.replace(/^## [\w.-]+\.md\s*$/gm, "");
    return c;
  }

  // Raw distilled content as readDistilledContent returns it — includes DOUBLE
  // inner headers from distillAndStore wrapping + splitter original
  const rawDistilledCreate = `<!-- distill-v6 -->
## create-category.md

## create-category.md

## Endpoint: POST /v3/projects/{project_id}/categories
**Create a category**

### Request Body (CreateCategoryRequest)
**REQUIRED FIELDS: \`name\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **YES** | Category name |
| \`order\` | integer | no | Display order |
| \`category_type\` | integer | no | Type |
| \`icon\` | string | no | Icon class |

### Response (201)
Key fields: response.data.id, response.data.name, response.data.order, response.data.icon`;

  const rawDistilledBulk = `<!-- distill-v6 -->
## create-categories-bulk.md

## create-categories-bulk.md

## Endpoint: POST /v3/projects/{project_id}/categories
**Bulk create categories**

### Request Body (BulkCreateCategoriesRequest)
**REQUIRED FIELDS: \`categories\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`categories\` | array | **YES** | Array of category objects |`;

  const rawDistilledGet = `<!-- distill-v6 -->
## get-category.md

## get-category.md

## Endpoint: GET /v3/projects/{project_id}/categories/{id}
**Get a single category**

### Response (200)
Key fields: response.data.id, response.data.name, response.data.order, response.data.icon, response.data.workspace_id`;

  const rawDistilledPatch = `<!-- distill-v6 -->
## update-category.md

## update-category.md

## Endpoint: PATCH /v3/projects/{project_id}/categories/{id}
**Update a category**

### Request Body (UpdateCategoryRequest)
**REQUIRED FIELDS: \`name\`**

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| \`name\` | string | **YES** | Updated name |
| \`icon\` | string | no | Updated icon |
| \`order\` | integer | no | Updated order |

### Response (200)
Key fields: response.data.id, response.data.name, response.data.icon`;

  const rawDistilledDelete = `<!-- distill-v6 -->
## delete-category.md

## delete-category.md

## Endpoint: DELETE /v3/projects/{project_id}/categories/{id}
**Delete a category**

### Response (204)
No content.`;

  // BAD spec context: inner headers NOT stripped — reproduces the actual bug
  const specContextWithInnerHeaders = [
    `## V3/categories/create-category.md\n\n${rawDistilledCreate}`,
    `## V3/categories/create-categories-bulk.md\n\n${rawDistilledBulk}`,
    `## V3/categories/get-category.md\n\n${rawDistilledGet}`,
    `## V3/categories/update-category.md\n\n${rawDistilledPatch}`,
    `## V3/categories/delete-category.md\n\n${rawDistilledDelete}`,
  ].join("\n\n---\n\n");

  // GOOD spec context: inner headers stripped — what buildSpecContext now produces
  const specContext = [
    `## V3/categories/create-category.md\n\n${stripInnerHeaders(rawDistilledCreate)}`,
    `## V3/categories/create-categories-bulk.md\n\n${stripInnerHeaders(rawDistilledBulk)}`,
    `## V3/categories/get-category.md\n\n${stripInnerHeaders(rawDistilledGet)}`,
    `## V3/categories/update-category.md\n\n${stripInnerHeaders(rawDistilledPatch)}`,
    `## V3/categories/delete-category.md\n\n${stripInnerHeaders(rawDistilledDelete)}`,
  ].join("\n\n---\n\n");

  // Verify the bug: double inner headers cause endpointMap to use bare filenames
  it("BUG REPRO: double inner headers cause injectEndpointRefs to use bare filenames", () => {
    const result = injectEndpointRefs(aiGeneratedXml, specContextWithInnerHeaders);
    // With double inner headers, the endpoint maps to bare "create-category.md"
    const step1 = result.match(/<step number="1">[\s\S]*?<\/step>/)?.[0] ?? "";
    // The bare name is in knownFiles AND is a valid candidate → kept as-is!
    expect(step1).toContain("<endpointRef>create-category.md</endpointRef>");
    expect(step1).not.toContain("V3/categories/");
  });

  // Now verify all the fixes work with the CORRECT spec context (inner headers stripped)

  // AI-generated XML with typical issues: bare endpointRefs, wrong file on wrong
  // method, missing ref on DELETE. Uses new descriptive naming from splitter.
  const aiGeneratedXml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Full Category CRUD Lifecycle</name>
  <entity>categories</entity>
  <description>Exercise the complete CRUD lifecycle.</description>
  <stopOnFailure>true</stopOnFailure>
  <steps>
    <step number="1">
      <name>Create Category</name>
      <endpointRef>create-category.md</endpointRef>
      <method>POST</method>
      <path>/v3/projects/{project_id}/categories</path>
      <body><![CDATA[
{
  "name": "[TEST] CRUD - {{timestamp}}",
  "order": 0,
  "category_type": 0
}
      ]]></body>
      <captures>
        <capture variable="state.categoryId" source="response.data.id"/>
      </captures>
      <assertions>
        <assertion type="status" code="201"/>
        <assertion type="field-exists" field="data.id"/>
      </assertions>
    </step>
    <step number="2">
      <name>Read Category</name>
      <endpointRef>get-category.md</endpointRef>
      <method>GET</method>
      <path>/v3/projects/{project_id}/categories/{category_id}</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
    <step number="3">
      <name>Update Category</name>
      <endpointRef>V3/categories/create-category.md</endpointRef>
      <method>PATCH</method>
      <path>/v3/projects/{project_id}/categories/{category_id}</path>
      <body><![CDATA[
{
  "name": "[TEST] CRUD Updated - {{timestamp}}",
  "icon": "icon-star",
  "workspace_id": "{{proj.workspace_id}}"
}
      ]]></body>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
    <step number="4">
      <name>Confirm Update</name>
      <endpointRef>get-category.md</endpointRef>
      <method>GET</method>
      <path>/v3/projects/{project_id}/categories/{category_id}</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
    <step number="5">
      <name>Delete Category (teardown)</name>
      <endpointRef>V3/categories/create-category.md</endpointRef>
      <method>DELETE</method>
      <path>/v3/projects/{project_id}/categories/{category_id}</path>
      <assertions>
        <assertion type="status" code="204"/>
      </assertions>
      <flags teardown="true"/>
    </step>
  </steps>
</flow>`;

  it("filterRelevantSpecs selects all CRUD spec files", () => {
    const selected = filterRelevantSpecs(crudIdea, allBlobFiles);
    expect(selected).toContain("V3/categories/create-category.md");
    expect(selected).toContain("V3/categories/get-category.md");
    expect(selected).toContain("V3/categories/update-category.md");
    expect(selected).toContain("V3/categories/delete-category.md");
  });

  it("stripExtraRequestFields removes workspace_id from PATCH body", () => {
    const result = stripExtraRequestFields(aiGeneratedXml, specContext);
    // Step 3 (PATCH) body should NOT have workspace_id — it's not in the PATCH spec
    const step3 = result.match(/<step number="3">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step3).not.toContain("workspace_id");
    // Step 3 should still have the valid fields
    expect(step3).toContain('"name"');
    expect(step3).toContain('"icon"');
  });

  it("injectEndpointRefs corrects all 5 steps", () => {
    const result = injectEndpointRefs(aiGeneratedXml, specContext);

    // Step 1: bare "create-category.md" → full path "V3/categories/create-category.md"
    const step1 = result.match(/<step number="1">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step1).toContain("<endpointRef>V3/categories/create-category.md</endpointRef>");
    expect(step1).not.toMatch(/<endpointRef>create-category\.md<\/endpointRef>/);

    // Step 2: bare "get-category.md" → full path "V3/categories/get-category.md"
    const step2 = result.match(/<step number="2">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step2).toContain("<endpointRef>V3/categories/get-category.md</endpointRef>");

    // Step 3: wrong "V3/categories/create-category.md" (POST file) → "V3/categories/update-category.md" (PATCH file)
    const step3 = result.match(/<step number="3">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step3).toContain("<endpointRef>V3/categories/update-category.md</endpointRef>");
    expect(step3).not.toContain("<endpointRef>V3/categories/create-category.md</endpointRef>");

    // Step 4: bare "get-category.md" → full path "V3/categories/get-category.md"
    const step4 = result.match(/<step number="4">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step4).toContain("<endpointRef>V3/categories/get-category.md</endpointRef>");

    // Step 5: wrong "V3/categories/create-category.md" (POST file) → "V3/categories/delete-category.md" injected
    const step5 = result.match(/<step number="5">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step5).toContain("<endpointRef>V3/categories/delete-category.md</endpointRef>");
  });

  it("full pipeline: strip + inject produces correct final XML", () => {
    // Run in the same order as generateFlow.ts (strip THEN inject refs)
    let xml = stripExtraRequestFields(aiGeneratedXml, specContext);
    xml = injectEndpointRefs(xml, specContext);

    // Step 1: POST → create-category.md, body intact
    const step1 = xml.match(/<step number="1">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step1).toContain("<endpointRef>V3/categories/create-category.md</endpointRef>");

    // Step 3: PATCH → update-category.md, workspace_id stripped
    const step3 = xml.match(/<step number="3">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step3).toContain("<endpointRef>V3/categories/update-category.md</endpointRef>");
    expect(step3).not.toContain("workspace_id");

    // Step 5: DELETE → delete-category.md injected
    const step5 = xml.match(/<step number="5">[\s\S]*?<\/step>/)?.[0] ?? "";
    expect(step5).toContain("<endpointRef>V3/categories/delete-category.md</endpointRef>");
  });
});
