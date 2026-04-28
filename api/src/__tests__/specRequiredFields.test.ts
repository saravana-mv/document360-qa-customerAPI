import {
  extractCommonRequiredFields,
  analyzeCrossStepDependencies,
  injectSpecRequiredFields,
  injectCrossStepCaptures,
  injectEndpointRefs,
} from "../lib/specRequiredFields";

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
