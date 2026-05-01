import {
  validateFlowXml,
  detectStructuralIssues,
  detectMissingRequiredFields,
  detectExtraFields,
  detectBadCaptures,
  detectMissingCaptures,
  detectCircularAssertions,
  detectTimestampAssertions,
  detectBareAssertionFields,
  detectMissingPrerequisites,
  detectMissingTeardown,
  detectUnresolvedVariables,
  detectMismatchedEndpointRefs,
  detectPathParamIssues,
} from "../lib/flowValidator";
import { parseFlowXml } from "../lib/flowRunner/parser";

// ── Test fixtures ──────────────────────────────────────────────────────────

const VALID_FLOW = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test Flow</name>
  <entity>articles</entity>
  <description>A simple test flow</description>
  <stopOnFailure>true</stopOnFailure>
  <steps>
    <step number="1">
      <name>Create Article</name>
      <method>POST</method>
      <path>/v2/articles</path>
      <endpointRef>articles/create-article.md</endpointRef>
      <body><![CDATA[{"title": "Test", "content": "Hello", "category_id": "{{state.categoryId}}"}]]></body>
      <captures>
        <capture variable="articleId" source="data.id" />
      </captures>
      <assertions>
        <assertion type="status" code="201" />
        <assertion type="field-exists" field="response.data.id" />
      </assertions>
    </step>
    <step number="2">
      <name>Delete Article</name>
      <method>DELETE</method>
      <path>/v2/articles/{article_id}</path>
      <pathParams>
        <param name="article_id">{{state.articleId}}</param>
      </pathParams>
      <assertions>
        <assertion type="status" code="204" />
      </assertions>
      <flags teardown="true" />
    </step>
  </steps>
</flow>`;

const SPEC_CONTEXT = `## articles/create-article.md

## Endpoint: POST /v2/articles

### Request Body

| Field | Type | Required |
|-------|------|----------|
| \`title\` | string | **YES** |
| \`content\` | string | **YES** |
| \`category_id\` | string | **YES** |
| \`status\` | integer | No |

**REQUIRED FIELDS: \`title\`, \`content\`, \`category_id\`**

Key fields: response.data.id, response.data.title, response.data.content

## articles/delete-article.md

## Endpoint: DELETE /v2/articles/{article_id}

Key fields: (none)
`;

// ── Tests ──────────────────────────────────────────────────────────────────

describe("detectStructuralIssues", () => {
  it("returns no issues for valid flow XML", () => {
    const { issues, flow } = detectStructuralIssues(VALID_FLOW);
    expect(flow).not.toBeNull();
    expect(issues.filter((i) => i.severity === "error")).toHaveLength(0);
  });

  it("reports parse errors for invalid XML", () => {
    const { issues, flow } = detectStructuralIssues("<not-a-flow></not-a-flow>");
    expect(flow).toBeNull();
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("parse-error");
  });

  it("reports missing description as info", () => {
    const xml = VALID_FLOW.replace("<description>A simple test flow</description>", "");
    const { issues } = detectStructuralIssues(xml);
    const descIssues = issues.filter((i) => i.category === "missing-description");
    expect(descIssues).toHaveLength(1);
    expect(descIssues[0].severity).toBe("info");
  });

  it("flags empty objects in request body", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity><description>Test</description>
  <steps>
    <step number="1">
      <name>Bulk Create</name><method>POST</method><path>/v2/articles/bulk</path>
      <body><![CDATA[{"articles": [{}, {}]}]]></body>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
  </steps>
</flow>`;
    const { issues } = detectStructuralIssues(xml);
    const emptyObj = issues.filter((i) => i.category === "empty-body-objects");
    expect(emptyObj).toHaveLength(1);
    expect(emptyObj[0].severity).toBe("error");
  });
});

describe("detectMissingRequiredFields", () => {
  it("finds missing required fields", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/articles</path>
      <endpointRef>articles/create-article.md</endpointRef>
      <body><![CDATA[{"title": "Test"}]]></body>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
  </steps>
</flow>`);
    const { parseSpecEndpoints } = require("../lib/specRequiredFields");
    const endpoints = parseSpecEndpoints(SPEC_CONTEXT);
    const issues = detectMissingRequiredFields(flow, endpoints);
    // Should report content and category_id as missing
    expect(issues.length).toBeGreaterThanOrEqual(2);
    expect(issues.some((i) => i.field === "content")).toBe(true);
    expect(issues.some((i) => i.field === "category_id")).toBe(true);
  });

  it("does not flag steps without endpointRef", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Create prereq</name><method>POST</method><path>/v2/categories</path>
      <body><![CDATA[{"name": "Test"}]]></body>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
  </steps>
</flow>`);
    const { parseSpecEndpoints } = require("../lib/specRequiredFields");
    const endpoints = parseSpecEndpoints(SPEC_CONTEXT);
    const issues = detectMissingRequiredFields(flow, endpoints);
    expect(issues).toHaveLength(0);
  });
});

describe("detectExtraFields", () => {
  it("flags hallucinated fields", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/articles</path>
      <endpointRef>articles/create-article.md</endpointRef>
      <body><![CDATA[{"title": "Test", "content": "x", "category_id": "1", "fake_field": "bad"}]]></body>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
  </steps>
</flow>`);
    const { parseSpecEndpoints } = require("../lib/specRequiredFields");
    const endpoints = parseSpecEndpoints(SPEC_CONTEXT);
    const issues = detectExtraFields(flow, endpoints);
    expect(issues.some((i) => i.field === "fake_field")).toBe(true);
  });
});

describe("detectMissingCaptures", () => {
  it("finds unresolved state references", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Get</name><method>GET</method><path>/v2/articles/{id}</path>
      <pathParams><param name="id">{{state.missingVar}}</param></pathParams>
      <assertions><assertion type="status" code="200" /></assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectMissingCaptures(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("state.missingVar");
  });

  it("does not flag resolved state references", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/articles</path>
      <body><![CDATA[{"title": "Test"}]]></body>
      <captures><capture variable="articleId" source="data.id" /></captures>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
    <step number="2">
      <name>Get</name><method>GET</method><path>/v2/articles/{id}</path>
      <pathParams><param name="id">{{state.articleId}}</param></pathParams>
      <assertions><assertion type="status" code="200" /></assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectMissingCaptures(flow);
    expect(issues).toHaveLength(0);
  });
});

describe("detectCircularAssertions", () => {
  it("flags assertions that compare against same-step captures", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/articles</path>
      <body><![CDATA[{"title": "Test"}]]></body>
      <captures><capture variable="state.theId" source="data.id" /></captures>
      <assertions>
        <assertion type="status" code="201" />
        <assertion type="field-equals" field="response.data.id" value="{{state.theId}}" />
      </assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectCircularAssertions(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("circular-assertion");
  });
});

describe("detectTimestampAssertions", () => {
  it("flags exact equality on timestamp fields", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Get</name><method>GET</method><path>/v2/articles/1</path>
      <assertions>
        <assertion type="field-equals" field="response.data.created_at" value="2024-01-01" />
      </assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectTimestampAssertions(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("timestamp-assertion");
  });
});

describe("detectBareAssertionFields", () => {
  it("flags fields without response. prefix", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Get</name><method>GET</method><path>/v2/articles/1</path>
      <assertions>
        <assertion type="field-exists" field="title" />
      </assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectBareAssertionFields(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0].suggestion).toContain("response.data.title");
  });

  it("does not flag data[N].field array access patterns", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Bulk</name><method>POST</method><path>/v2/articles/bulk</path>
      <body><![CDATA[{"articles": [{"title": "A"}]}]]></body>
      <assertions>
        <assertion type="field-exists" field="data[0].id" />
        <assertion type="field-equals" field="data[0].success" value="true" />
      </assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectBareAssertionFields(flow);
    expect(issues).toHaveLength(0);
  });
});

describe("detectMissingTeardown", () => {
  it("warns when POST has no matching DELETE", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/articles</path>
      <body><![CDATA[{"title": "Test"}]]></body>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectMissingTeardown(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("no-teardown");
  });

  it("does not warn when DELETE exists", () => {
    const flow = parseFlowXml(VALID_FLOW);
    const issues = detectMissingTeardown(flow);
    expect(issues).toHaveLength(0);
  });
});

describe("detectUnresolvedVariables", () => {
  it("flags undefined proj vars", () => {
    const xml = `<body>{{proj.myVar}}</body>`;
    const issues = detectUnresolvedVariables(xml, []);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("unresolved-variable");
  });

  it("warns on empty proj vars", () => {
    const xml = `<body>{{proj.myVar}}</body>`;
    const issues = detectUnresolvedVariables(xml, [{ name: "myVar", value: "" }]);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("empty-variable");
  });

  it("passes for defined proj vars", () => {
    const xml = `<body>{{proj.myVar}}</body>`;
    const issues = detectUnresolvedVariables(xml, [{ name: "myVar", value: "abc" }]);
    expect(issues).toHaveLength(0);
  });
});

describe("detectMismatchedEndpointRefs", () => {
  it("flags path/ref resource mismatch", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/categories</path>
      <endpointRef>articles/create-article.md</endpointRef>
      <body><![CDATA[{"name": "Test"}]]></body>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectMismatchedEndpointRefs(flow, []);
    expect(issues).toHaveLength(1);
    expect(issues[0].category).toBe("mismatched-ref");
  });

  it("does not flag matching resources with projects/{id} scoping", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>categories</entity>
  <steps>
    <step number="1">
      <name>Create Category</name><method>POST</method>
      <path>/v3/projects/{project_id}/categories</path>
      <endpointRef>V3/categories/create-category.md</endpointRef>
      <pathParams><param name="project_id">{{proj.project_id}}</param></pathParams>
      <body><![CDATA[{"name": "Test"}]]></body>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectMismatchedEndpointRefs(flow, []);
    expect(issues).toHaveLength(0);
  });
});

describe("detectPathParamIssues", () => {
  it("flags missing path param entries", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name><entity>articles</entity>
  <steps>
    <step number="1">
      <name>Get</name><method>GET</method><path>/v2/articles/{article_id}</path>
      <assertions><assertion type="status" code="200" /></assertions>
    </step>
  </steps>
</flow>`);
    const issues = detectPathParamIssues(flow);
    expect(issues).toHaveLength(1);
    expect(issues[0].field).toBe("article_id");
  });

  it("passes when pathParams are provided", () => {
    const flow = parseFlowXml(VALID_FLOW);
    const issues = detectPathParamIssues(flow);
    expect(issues).toHaveLength(0);
  });
});

describe("validateFlowXml (integration)", () => {
  it("detects missing state refs in the fixture flow", () => {
    const result = validateFlowXml(VALID_FLOW, SPEC_CONTEXT, []);
    // VALID_FLOW uses {{state.categoryId}} in step 1 with no prior capture — that's an error
    expect(result.summary.errors).toBeGreaterThan(0);
    expect(result.issues.some((i) => i.category === "missing-capture" && i.field === "state.categoryId")).toBe(true);
  });

  it("returns valid=true for a clean flow", () => {
    const cleanFlow = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Clean Flow</name><entity>articles</entity><description>Test</description>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/articles</path>
      <endpointRef>articles/create-article.md</endpointRef>
      <body><![CDATA[{"title": "Test", "content": "x", "category_id": "{{proj.categoryId}}"}]]></body>
      <captures><capture variable="articleId" source="data.id" /></captures>
      <assertions><assertion type="status" code="201" /></assertions>
    </step>
    <step number="2">
      <name>Delete</name><method>DELETE</method><path>/v2/articles/{article_id}</path>
      <pathParams><param name="article_id">{{state.articleId}}</param></pathParams>
      <assertions><assertion type="status" code="204" /></assertions>
      <flags teardown="true" />
    </step>
  </steps>
</flow>`;
    const result = validateFlowXml(cleanFlow, SPEC_CONTEXT, [{ name: "categoryId", value: "cat-123" }]);
    expect(result.summary.errors).toBe(0);
    expect(result.valid).toBe(true);
  });

  it("returns valid=false for unparseable XML", () => {
    const result = validateFlowXml("<garbage", "", []);
    expect(result.valid).toBe(false);
    expect(result.summary.errors).toBeGreaterThan(0);
  });

  it("handles empty spec context gracefully", () => {
    const result = validateFlowXml(VALID_FLOW, "", []);
    expect(result).toBeDefined();
    // Should still validate structural issues
    expect(result.issues).toBeDefined();
  });
});
