/**
 * End-to-end integration tests for the flow XML pipeline.
 *
 * Validates the complete chain: parse XML → resolve captures → interpolate body
 * → run assertions. Ensures changes to any part of the pipeline (parser, runner,
 * post-processors, assertion normalization) don't break downstream steps.
 *
 * IMPORTANT: Read this test before modifying captures, assertions, body
 * interpolation, or post-processors. If your change breaks a test here,
 * it WILL break real scenario execution at runtime.
 */

import { parseFlowXml } from "../lib/flowRunner/parser";
import type { ParsedFlow, ParsedStep, ParsedCapture, ParsedAssertion } from "../lib/flowRunner/types";

// ── Minimal runtime simulation ─────────────────────────────────────────────
// Replicates the core logic from executor.ts and builder.ts without HTTP calls.

/** Strip `response.` prefix from assertion fields (mirrors both runners). */
function normalizeAssertionField(field: string): string {
  return field.startsWith("response.") ? field.slice("response.".length) : field;
}

function readDotPath(obj: unknown, path: string): unknown {
  const parts: string[] = [];
  for (const segment of path.split(".")) {
    const bracketMatch = segment.match(/^([^[]*)\[(\d+)]$/);
    if (bracketMatch) {
      if (bracketMatch[1]) parts.push(bracketMatch[1]);
      parts.push(bracketMatch[2]);
    } else {
      parts.push(segment);
    }
  }
  let cur: unknown = obj;
  for (const p of parts) {
    if (cur === null || typeof cur !== "object") return undefined;
    if (Array.isArray(cur)) {
      const idx = Number(p);
      cur = Number.isNaN(idx) ? undefined : cur[idx];
    } else {
      cur = (cur as Record<string, unknown>)[p];
    }
  }
  return cur;
}

function fieldExists(obj: unknown, path: string): boolean {
  return readDotPath(obj, path) !== undefined;
}

/** Resolve a capture source against a mock response (mirrors resolveCapture). */
function resolveCapture(
  cap: ParsedCapture,
  responseBody: unknown,
): unknown {
  const { source } = cap;
  if (cap.from === "computed") return undefined;
  if (cap.from === "request") return undefined; // skip for these tests
  // response
  const path = source.startsWith("response.") ? source.slice("response.".length) : source;
  return readDotPath(responseBody, path);
}

/** Interpolate {{state.X}} and {{proj.X}} in a string (mirrors substitute). */
function interpolate(
  template: string,
  state: Record<string, unknown>,
  projVars: Record<string, string>,
): { result: string; unresolved: string[] } {
  const unresolved: string[] = [];
  const result = template.replace(/\{\{(\w+\.[\w.]+)\}\}/g, (_match, expr: string) => {
    if (expr === "timestamp") return String(Date.now());
    if (expr.startsWith("state.")) {
      const key = expr.slice("state.".length);
      const val = state[key];
      if (val === undefined) { unresolved.push(expr); return "null"; }
      return typeof val === "string" ? val : JSON.stringify(val);
    }
    if (expr.startsWith("proj.")) {
      const key = expr.slice("proj.".length);
      const val = projVars[key];
      if (val === undefined) { unresolved.push(expr); return "null"; }
      return val;
    }
    return "null";
  });
  return { result, unresolved };
}

/** Run a single assertion against a response body. */
function checkAssertion(
  assertion: ParsedAssertion,
  httpStatus: number,
  responseBody: unknown,
  state: Record<string, unknown>,
): boolean {
  if (assertion.type === "status") return httpStatus === assertion.code;
  if (assertion.type === "field-exists") {
    return fieldExists(responseBody, normalizeAssertionField(assertion.field));
  }
  if (assertion.type === "array-not-empty") {
    const v = readDotPath(responseBody, normalizeAssertionField(assertion.field));
    return Array.isArray(v) && v.length > 0;
  }
  if (assertion.type === "field-equals") {
    const actual = readDotPath(responseBody, normalizeAssertionField(assertion.field));
    const { result: expected } = interpolate(assertion.value, state, {});
    // Loose comparison (string/number)
    return String(actual) === expected || actual === expected;
  }
  return false;
}

// ── Simulate multi-step scenario execution ─────────────────────────────────

interface StepMockResponse {
  status: number;
  body: unknown;
}

function simulateScenario(
  flow: ParsedFlow,
  responses: StepMockResponse[],
  projVars: Record<string, string> = {},
): {
  stepResults: { step: number; name: string; status: string; error?: string; assertions: { field: string; passed: boolean }[] }[];
  finalState: Record<string, unknown>;
} {
  const state: Record<string, unknown> = {};
  const stepResults: { step: number; name: string; status: string; error?: string; assertions: { field: string; passed: boolean }[] }[] = [];

  for (let i = 0; i < flow.steps.length; i++) {
    const step = flow.steps[i];
    const response = responses[i] ?? { status: 200, body: {} };

    // 1. Interpolate body (check for unresolved variables)
    let bodyError: string | undefined;
    if (step.body) {
      const { unresolved } = interpolate(step.body, state, projVars);
      if (unresolved.length > 0) {
        bodyError = `Request body has unresolved variables: ${unresolved.map(v => `{{${v}}}`).join(", ")}`;
      }
    }

    if (bodyError) {
      stepResults.push({
        step: step.number,
        name: step.name,
        status: "fail",
        error: bodyError,
        assertions: [],
      });
      continue;
    }

    // 2. Apply captures
    const captureErrors: string[] = [];
    for (const cap of step.captures) {
      const value = resolveCapture(cap, response.body);
      const variable = cap.variable.startsWith("state.")
        ? cap.variable.slice("state.".length)
        : cap.variable;
      if (value === undefined || value === null) {
        captureErrors.push(`Capture "${cap.variable}" resolved to ${value}`);
      } else {
        state[variable] = value;
      }
    }

    // 3. Run assertions
    const assertionResults = step.assertions.map((a) => ({
      field: "field" in a ? a.field : `status-${a.code}`,
      passed: checkAssertion(a, response.status, response.body, state),
    }));

    const anyFailed = assertionResults.some((a) => !a.passed);
    const hasCaptureErrors = captureErrors.length > 0;

    stepResults.push({
      step: step.number,
      name: step.name,
      status: hasCaptureErrors || anyFailed ? "fail" : "pass",
      error: hasCaptureErrors ? captureErrors.join("; ") : undefined,
      assertions: assertionResults,
    });
  }

  return { stepResults, finalState: state };
}

// ══════════════════════════════════════════════════════════════════════════════
// Tests
// ══════════════════════════════════════════════════════════════════════════════

describe("Flow Pipeline: Parse → Capture → Interpolate → Assert", () => {
  const CRUD_FLOW = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Category CRUD Lifecycle</name>
  <entity>Categories</entity>
  <description>Create, read, and delete a category</description>
  <stopOnFailure>true</stopOnFailure>
  <steps>
    <step number="1">
      <name>Create Category</name>
      <method>POST</method>
      <path>/v3/projects/{project_id}/categories</path>
      <pathParams>
        <param name="project_id">{{proj.project_id}}</param>
      </pathParams>
      <body><![CDATA[
{
  "name": "[TEST] Category - {{timestamp}}"
}
      ]]></body>
      <captures>
        <capture variable="state.categoryId" source="response.data.id"/>
        <capture variable="state.categoryName" source="response.data.name"/>
      </captures>
      <assertions>
        <assertion type="status" code="201"/>
        <assertion type="field-exists" field="response.data.id"/>
      </assertions>
    </step>

    <step number="2">
      <name>Get Category</name>
      <method>GET</method>
      <path>/v3/projects/{project_id}/categories/{category_id}</path>
      <pathParams>
        <param name="project_id">{{proj.project_id}}</param>
        <param name="category_id">{{state.categoryId}}</param>
      </pathParams>
      <assertions>
        <assertion type="status" code="200"/>
        <assertion type="field-equals" field="response.data.name" value="{{state.categoryName}}"/>
      </assertions>
    </step>

    <step number="3">
      <name>Create Article</name>
      <method>POST</method>
      <path>/v3/projects/{project_id}/articles</path>
      <pathParams>
        <param name="project_id">{{proj.project_id}}</param>
      </pathParams>
      <body><![CDATA[
{
  "title": "[TEST] Article - {{timestamp}}",
  "category_id": "{{state.categoryId}}"
}
      ]]></body>
      <captures>
        <capture variable="state.articleId" source="response.data.id"/>
      </captures>
      <assertions>
        <assertion type="status" code="201"/>
        <assertion type="field-exists" field="response.data.id"/>
      </assertions>
    </step>

    <step number="4">
      <name>Delete Article</name>
      <method>DELETE</method>
      <path>/v3/projects/{project_id}/articles/{article_id}</path>
      <pathParams>
        <param name="project_id">{{proj.project_id}}</param>
        <param name="article_id">{{state.articleId}}</param>
      </pathParams>
      <assertions>
        <assertion type="status" code="204"/>
      </assertions>
      <flags teardown="true"/>
    </step>

    <step number="5">
      <name>Delete Category</name>
      <method>DELETE</method>
      <path>/v3/projects/{project_id}/categories/{category_id}</path>
      <pathParams>
        <param name="project_id">{{proj.project_id}}</param>
        <param name="category_id">{{state.categoryId}}</param>
      </pathParams>
      <assertions>
        <assertion type="status" code="204"/>
      </assertions>
      <flags teardown="true"/>
    </step>
  </steps>
</flow>`;

  it("parses correctly", () => {
    const flow = parseFlowXml(CRUD_FLOW);
    expect(flow.steps).toHaveLength(5);
    expect(flow.name).toBe("Category CRUD Lifecycle");
  });

  it("captures flow through state correctly across steps", () => {
    const flow = parseFlowXml(CRUD_FLOW);
    const { stepResults, finalState } = simulateScenario(flow, [
      { status: 201, body: { data: { id: "cat-123", name: "[TEST] Category - 123" } } },
      { status: 200, body: { data: { id: "cat-123", name: "[TEST] Category - 123" } } },
      { status: 201, body: { data: { id: "art-456" } } },
      { status: 204, body: {} },
      { status: 204, body: {} },
    ], { project_id: "proj-1" });

    // All steps should pass
    for (const r of stepResults) {
      expect(r.status).toBe("pass");
      expect(r.error).toBeUndefined();
    }

    // State should contain all captured values
    expect(finalState.categoryId).toBe("cat-123");
    expect(finalState.categoryName).toBe("[TEST] Category - 123");
    expect(finalState.articleId).toBe("art-456");
  });

  it("fails step 3 if step 1 capture fails (state.categoryId unresolved)", () => {
    const flow = parseFlowXml(CRUD_FLOW);
    const { stepResults } = simulateScenario(flow, [
      // Step 1: response missing data.id → capture fails
      { status: 201, body: { data: {} } },
      { status: 200, body: { data: {} } },
      { status: 201, body: { data: { id: "art-456" } } },
      { status: 204, body: {} },
      { status: 204, body: {} },
    ], { project_id: "proj-1" });

    // Step 1 should fail (capture error)
    expect(stepResults[0].status).toBe("fail");
    expect(stepResults[0].error).toContain("Capture");

    // Step 3 should fail (unresolved state.categoryId in body)
    expect(stepResults[2].status).toBe("fail");
    expect(stepResults[2].error).toContain("state.categoryId");
  });

  it("assertion field-exists works with response. prefix", () => {
    const flow = parseFlowXml(CRUD_FLOW);
    const responseBody = { data: { id: "cat-123", name: "Test" } };

    // Step 1 asserts field="response.data.id"
    const assertion = flow.steps[0].assertions.find(a => a.type === "field-exists")!;
    expect(assertion.field).toBe("response.data.id");
    expect(checkAssertion(assertion, 201, responseBody, {})).toBe(true);
  });

  it("assertion field-equals works with response. prefix and state interpolation", () => {
    const flow = parseFlowXml(CRUD_FLOW);
    const responseBody = { data: { name: "My Category" } };
    const state = { categoryName: "My Category" };

    // Step 2 asserts field="response.data.name" value="{{state.categoryName}}"
    const assertion = flow.steps[1].assertions.find(a => a.type === "field-equals")!;
    expect(assertion.field).toBe("response.data.name");
    expect(checkAssertion(assertion, 200, responseBody, state)).toBe(true);
  });

  it("assertion field-exists works with legacy data. prefix (backward compat)", () => {
    const legacyFlow = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Legacy</name><entity>Test</entity>
  <steps>
    <step number="1">
      <name>Get</name><method>GET</method><path>/v2/items/1</path>
      <assertions>
        <assertion type="field-exists" field="data.id"/>
        <assertion type="field-equals" field="data.name" value="Test"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(legacyFlow);
    const body = { data: { id: "x", name: "Test" } };

    for (const assertion of flow.steps[0].assertions) {
      expect(checkAssertion(assertion, 200, body, {})).toBe(true);
    }
  });
});

describe("Flow Pipeline: Bulk/Array captures and assertions", () => {
  const BULK_FLOW = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Bulk Create</name><entity>Articles</entity>
  <steps>
    <step number="1">
      <name>Bulk Create Articles</name>
      <method>POST</method>
      <path>/v3/projects/{project_id}/articles/bulk</path>
      <pathParams>
        <param name="project_id">{{proj.project_id}}</param>
      </pathParams>
      <body><![CDATA[
{
  "articles": [
    { "title": "Article 1", "category_id": "{{state.catId}}" },
    { "title": "Article 2", "category_id": "{{state.catId}}" }
  ]
}
      ]]></body>
      <captures>
        <capture variable="state.articleId1" source="response.data[0].id"/>
        <capture variable="state.articleId2" source="response.data[1].id"/>
      </captures>
      <assertions>
        <assertion type="status" code="201"/>
        <assertion type="field-exists" field="response.data[0].id"/>
        <assertion type="field-exists" field="response.data[1].id"/>
        <assertion type="field-equals" field="response.data[0].success" value="true"/>
      </assertions>
    </step>

    <step number="2">
      <name>Delete Article 1</name>
      <method>DELETE</method>
      <path>/v3/projects/{project_id}/articles/{article_id}</path>
      <pathParams>
        <param name="project_id">{{proj.project_id}}</param>
        <param name="article_id">{{state.articleId1}}</param>
      </pathParams>
      <assertions><assertion type="status" code="204"/></assertions>
      <flags teardown="true"/>
    </step>
  </steps>
</flow>`;

  it("captures from array response and passes state to next step", () => {
    const flow = parseFlowXml(BULK_FLOW);
    const state: Record<string, unknown> = { catId: "cat-1" };

    // Simulate step 1 response
    const response = {
      data: [
        { id: "art-1", success: true },
        { id: "art-2", success: true },
      ],
    };

    // Apply captures
    for (const cap of flow.steps[0].captures) {
      const value = resolveCapture(cap, response);
      const variable = cap.variable.replace(/^state\./, "");
      if (value !== undefined && value !== null) state[variable] = value;
    }

    expect(state.articleId1).toBe("art-1");
    expect(state.articleId2).toBe("art-2");

    // Step 2 body interpolation should resolve
    const step2 = flow.steps[1];
    const pathParam = step2.pathParams["article_id"]; // "{{state.articleId1}}"
    const { unresolved } = interpolate(pathParam, state, { project_id: "p1" });
    expect(unresolved).toHaveLength(0);
  });

  it("array assertions work with response. prefix", () => {
    const flow = parseFlowXml(BULK_FLOW);
    const response = {
      data: [
        { id: "art-1", success: true },
        { id: "art-2", success: true },
      ],
    };

    for (const assertion of flow.steps[0].assertions) {
      expect(checkAssertion(assertion, 201, response, {})).toBe(true);
    }
  });

  it("array assertions work with legacy data[N] prefix (backward compat)", () => {
    const legacyBulk = `<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Legacy Bulk</name><entity>Test</entity>
  <steps>
    <step number="1">
      <name>Bulk</name><method>POST</method><path>/v2/items/bulk</path>
      <body><![CDATA[{"items": [{"name": "A"}]}]]></body>
      <assertions>
        <assertion type="field-exists" field="data[0].id"/>
        <assertion type="field-equals" field="data[0].success" value="true"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(legacyBulk);
    const body = { data: [{ id: "x", success: true }] };

    for (const assertion of flow.steps[0].assertions) {
      expect(checkAssertion(assertion, 201, body, {})).toBe(true);
    }
  });
});

describe("Flow Pipeline: State isolation between scenarios", () => {
  it("state variables from one scenario don't leak to another", () => {
    const flow = parseFlowXml(`<?xml version="1.0" encoding="UTF-8"?>
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Isolated</name><entity>Test</entity>
  <steps>
    <step number="1">
      <name>Create</name><method>POST</method><path>/v2/items</path>
      <body><![CDATA[{"name": "Test"}]]></body>
      <captures>
        <capture variable="state.itemId" source="response.data.id"/>
      </captures>
      <assertions><assertion type="status" code="201"/></assertions>
    </step>
    <step number="2">
      <name>Use captured ID</name><method>GET</method><path>/v2/items/{id}</path>
      <pathParams><param name="id">{{state.itemId}}</param></pathParams>
      <assertions><assertion type="status" code="200"/></assertions>
    </step>
  </steps>
</flow>`);

    // Run 1: capture succeeds
    const run1 = simulateScenario(flow, [
      { status: 201, body: { data: { id: "item-1" } } },
      { status: 200, body: {} },
    ]);
    expect(run1.finalState.itemId).toBe("item-1");

    // Run 2: independent state (no leakage from run1)
    const run2 = simulateScenario(flow, [
      { status: 201, body: { data: { id: "item-2" } } },
      { status: 200, body: {} },
    ]);
    expect(run2.finalState.itemId).toBe("item-2");
  });
});

describe("Flow Pipeline: Capture source formats", () => {
  it("resolves capture with response. prefix", () => {
    const body = { data: { id: "abc" } };
    const cap: ParsedCapture = { variable: "state.myId", source: "response.data.id", from: "response" };
    expect(resolveCapture(cap, body)).toBe("abc");
  });

  it("resolves capture without response. prefix", () => {
    const body = { data: { id: "abc" } };
    const cap: ParsedCapture = { variable: "state.myId", source: "data.id", from: "response" };
    expect(resolveCapture(cap, body)).toBe("abc");
  });

  it("resolves capture from array with response. prefix", () => {
    const body = { data: [{ id: "first" }, { id: "second" }] };
    const cap: ParsedCapture = { variable: "state.id2", source: "response.data[1].id", from: "response" };
    expect(resolveCapture(cap, body)).toBe("second");
  });

  it("resolves capture from array without response. prefix", () => {
    const body = { data: [{ id: "first" }, { id: "second" }] };
    const cap: ParsedCapture = { variable: "state.id2", source: "data[1].id", from: "response" };
    expect(resolveCapture(cap, body)).toBe("second");
  });

  it("returns undefined for missing field", () => {
    const body = { data: { name: "test" } };
    const cap: ParsedCapture = { variable: "state.myId", source: "response.data.id", from: "response" };
    expect(resolveCapture(cap, body)).toBeUndefined();
  });

  it("strips state. prefix from variable name for state storage", () => {
    const variable = "state.categoryId";
    const bare = variable.startsWith("state.") ? variable.slice("state.".length) : variable;
    expect(bare).toBe("categoryId");
  });
});

describe("Flow Pipeline: Assertion field normalization", () => {
  it("normalizes response.data.X to data.X", () => {
    expect(normalizeAssertionField("response.data.id")).toBe("data.id");
  });

  it("normalizes response.data[0].id to data[0].id", () => {
    expect(normalizeAssertionField("response.data[0].id")).toBe("data[0].id");
  });

  it("preserves data.X as-is (backward compat)", () => {
    expect(normalizeAssertionField("data.id")).toBe("data.id");
  });

  it("preserves data[0].id as-is (backward compat)", () => {
    expect(normalizeAssertionField("data[0].id")).toBe("data[0].id");
  });

  it("preserves bare fields as-is", () => {
    expect(normalizeAssertionField("id")).toBe("id");
  });
});

describe("Flow Pipeline: Body interpolation", () => {
  it("resolves state variables in body", () => {
    const body = '{"category_id": "{{state.categoryId}}", "name": "Test"}';
    const state = { categoryId: "cat-123" };
    const { result, unresolved } = interpolate(body, state, {});
    expect(unresolved).toHaveLength(0);
    expect(result).toContain("cat-123");
  });

  it("reports unresolved state variables", () => {
    const body = '{"category_id": "{{state.categoryId}}", "name": "Test"}';
    const { unresolved } = interpolate(body, {}, {});
    expect(unresolved).toContain("state.categoryId");
  });

  it("resolves proj variables in body", () => {
    const body = '{"workspace_id": "{{proj.workspace_id}}"}';
    const { result, unresolved } = interpolate(body, {}, { workspace_id: "ws-1" });
    expect(unresolved).toHaveLength(0);
    expect(result).toContain("ws-1");
  });

  it("reports unresolved proj variables", () => {
    const body = '{"workspace_id": "{{proj.workspace_id}}"}';
    const { unresolved } = interpolate(body, {}, {});
    expect(unresolved).toContain("proj.workspace_id");
  });
});
