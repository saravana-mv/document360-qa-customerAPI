import { parseFlowXml, FlowXmlParseError } from "../lib/flowRunner/parser";

const VALID_FLOW_XML = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test Flow</name>
  <entity>TestEntity</entity>
  <description>A test flow</description>
  <stopOnFailure>true</stopOnFailure>
  <steps>
    <step number="1">
      <name>Create item</name>
      <method>POST</method>
      <path>/v3/items</path>
      <body><![CDATA[{"name": "test"}]]></body>
      <captures>
        <capture variable="state.itemId" source="response.data.id"/>
      </captures>
      <assertions>
        <assertion type="status" code="201"/>
        <assertion type="field-exists" field="data.id"/>
      </assertions>
    </step>
    <step number="2">
      <name>Delete item</name>
      <method>DELETE</method>
      <path>/v3/items/{item_id}</path>
      <pathParams>
        <param name="item_id">{{state.itemId}}</param>
      </pathParams>
      <assertions>
        <assertion type="status" code="204"/>
      </assertions>
      <flags teardown="true"/>
    </step>
  </steps>
</flow>`;

describe("parseFlowXml", () => {
  // 1. Parses valid flow XML — name, entity, description, stopOnFailure, step count
  it("parses valid flow XML top-level fields", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.name).toBe("Test Flow");
    expect(flow.entity).toBe("TestEntity");
    expect(flow.description).toBe("A test flow");
    expect(flow.stopOnFailure).toBe(true);
    expect(flow.steps).toHaveLength(2);
  });

  // 2. Parses steps — number, name, method, path
  it("parses step number, name, method, path", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    const step1 = flow.steps[0];
    expect(step1.number).toBe(1);
    expect(step1.name).toBe("Create item");
    expect(step1.method).toBe("POST");
    expect(step1.path).toBe("/v3/items");

    const step2 = flow.steps[1];
    expect(step2.number).toBe(2);
    expect(step2.name).toBe("Delete item");
    expect(step2.method).toBe("DELETE");
    expect(step2.path).toBe("/v3/items/{item_id}");
  });

  // 3. Parses body from CDATA
  it("parses body from CDATA section", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.steps[0].body).toBe('{"name": "test"}');
  });

  // 4. Parses captures — variable, source
  it("parses captures with variable and source", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    const captures = flow.steps[0].captures;
    expect(captures).toHaveLength(1);
    expect(captures[0].variable).toBe("state.itemId");
    expect(captures[0].source).toBe("response.data.id");
    expect(captures[0].from).toBe("response");
  });

  // 5. Parses assertions — type, code, field, value
  it("parses assertions with type, code, and field", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    const assertions = flow.steps[0].assertions;
    expect(assertions).toHaveLength(2);

    const statusAssertion = assertions[0];
    expect(statusAssertion.type).toBe("status");
    if (statusAssertion.type === "status") {
      expect(statusAssertion.code).toBe(201);
    }

    const fieldAssertion = assertions[1];
    expect(fieldAssertion.type).toBe("field-exists");
    if (fieldAssertion.type === "field-exists") {
      expect(fieldAssertion.field).toBe("data.id");
    }
  });

  it("parses field-equals assertion with value", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Equals Test</name>
  <steps>
    <step number="1">
      <name>Check value</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="field-equals" field="data.status" value="active"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    const a = flow.steps[0].assertions[0];
    expect(a.type).toBe("field-equals");
    if (a.type === "field-equals") {
      expect(a.field).toBe("data.status");
      expect(a.value).toBe("active");
    }
  });

  // 6. Parses pathParams
  it("parses pathParams", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    const step2 = flow.steps[1];
    expect(step2.pathParams).toEqual({ item_id: "{{state.itemId}}" });
  });

  it("parses queryParams", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Query Test</name>
  <steps>
    <step number="1">
      <name>List items</name>
      <method>GET</method>
      <path>/v3/items</path>
      <queryParams>
        <param name="page">1</param>
        <param name="limit">10</param>
      </queryParams>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    expect(flow.steps[0].queryParams).toEqual({ page: "1", limit: "10" });
  });

  // 7. Parses flags (teardown, noAuth)
  it("parses flags — teardown=true", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.steps[0].teardown).toBe(false);
    expect(flow.steps[1].teardown).toBe(true);
  });

  it("parses flags — noAuth=true", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>NoAuth Test</name>
  <steps>
    <step number="1">
      <name>Public endpoint</name>
      <method>GET</method>
      <path>/v3/public</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
      <flags noAuth="true"/>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    expect(flow.steps[0].noAuth).toBe(true);
  });

  it("defaults flags to false when <flags> is absent", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.steps[0].teardown).toBe(false);
    expect(flow.steps[0].noAuth).toBe(false);
  });

  // 8. FlowXmlParseError for malformed XML
  it("throws for malformed XML", () => {
    const badXml = "<flow><name>Broken</name><steps><step number";
    expect(() => parseFlowXml(badXml)).toThrow();
  });

  it("throws FlowXmlParseError when xmldom embeds parsererror", () => {
    // xmldom embeds <parsererror> for some classes of malformed XML
    const badXml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Test</name>
  <steps>
    <step number="1">
      <name>Step</name>
      <method>GET</method>
      <path>/test</path>
      <body><![CDATA[unterminated
    </step>
  </steps>
</flow>`;
    expect(() => parseFlowXml(badXml)).toThrow();
  });

  // 9. FlowXmlParseError when root is not <flow>
  it("throws FlowXmlParseError when root is not <flow>", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<notflow>
  <name>Bad Root</name>
</notflow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow("Root element must be <flow>");
  });

  // 10. FlowXmlParseError when <name> is missing
  it("throws FlowXmlParseError when <name> is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <entity>NoName</entity>
  <steps>
    <step number="1">
      <name>Step</name>
      <method>GET</method>
      <path>/test</path>
    </step>
  </steps>
</flow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow("<flow> requires a <name>");
  });

  // 11. FlowXmlParseError when <steps> is missing
  it("throws FlowXmlParseError when <steps> is missing", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>No Steps Flow</name>
</flow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow("<flow> requires a <steps> element");
  });

  // 12. FlowXmlParseError when no steps inside <steps>
  it("throws FlowXmlParseError when <steps> is empty", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Empty Steps</name>
  <steps></steps>
</flow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow("<steps> must contain at least one <step>");
  });

  // 13. FlowXmlParseError for unsupported method
  it("throws FlowXmlParseError for unsupported HTTP method", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Bad Method</name>
  <steps>
    <step number="1">
      <name>Options call</name>
      <method>OPTIONS</method>
      <path>/v3/items</path>
    </step>
  </steps>
</flow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow('unsupported method "OPTIONS"');
  });

  // 14. FlowXmlParseError for missing step number
  it("throws FlowXmlParseError for missing step number attribute", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>No Number</name>
  <steps>
    <step>
      <name>Unnumbered</name>
      <method>GET</method>
      <path>/v3/items</path>
    </step>
  </steps>
</flow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow("requires a numeric 'number' attribute");
  });

  // 15. Default entity is "Untagged" when omitted
  it('defaults entity to "Untagged" when omitted', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>No Entity</name>
  <steps>
    <step number="1">
      <name>Step one</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    expect(flow.entity).toBe("Untagged");
  });

  // 16. stopOnFailure defaults to true when omitted
  it("defaults stopOnFailure to true when omitted", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>No StopOnFailure</name>
  <steps>
    <step number="1">
      <name>Step one</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    expect(flow.stopOnFailure).toBe(true);
  });

  it("sets stopOnFailure to false when explicitly set", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Continue On Fail</name>
  <stopOnFailure>false</stopOnFailure>
  <steps>
    <step number="1">
      <name>Step one</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="status" code="200"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    expect(flow.stopOnFailure).toBe(false);
  });

  // Additional edge cases

  it("returns undefined body when <body> is absent", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.steps[1].body).toBeUndefined();
  });

  it("returns empty captures array when <captures> is absent", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.steps[1].captures).toEqual([]);
  });

  it("returns empty pathParams when <pathParams> is absent", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.steps[0].pathParams).toEqual({});
  });

  it("returns empty queryParams when <queryParams> is absent", () => {
    const flow = parseFlowXml(VALID_FLOW_XML);
    expect(flow.steps[0].queryParams).toEqual({});
  });

  it("parses array-not-empty assertion type", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Array Test</name>
  <steps>
    <step number="1">
      <name>List items</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="array-not-empty" field="data"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    const a = flow.steps[0].assertions[0];
    expect(a.type).toBe("array-not-empty");
    if (a.type === "array-not-empty") {
      expect(a.field).toBe("data");
    }
  });

  it("throws FlowXmlParseError for unknown assertion type", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Bad Assertion</name>
  <steps>
    <step number="1">
      <name>Step</name>
      <method>GET</method>
      <path>/v3/items</path>
      <assertions>
        <assertion type="bogus" field="x"/>
      </assertions>
    </step>
  </steps>
</flow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow('unknown assertion type "bogus"');
  });

  it("uses <group> as entity fallback", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Group Fallback</name>
  <group>LegacyGroup</group>
  <steps>
    <step number="1">
      <name>Step</name>
      <method>GET</method>
      <path>/v3/items</path>
    </step>
  </steps>
</flow>`;
    const flow = parseFlowXml(xml);
    expect(flow.entity).toBe("LegacyGroup");
  });

  it("throws FlowXmlParseError for capture missing variable attribute", () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<flow version="1.0" xmlns="https://flowforge.io/qa/flow/v1">
  <name>Bad Capture</name>
  <steps>
    <step number="1">
      <name>Step</name>
      <method>POST</method>
      <path>/v3/items</path>
      <captures>
        <capture source="response.data.id"/>
      </captures>
    </step>
  </steps>
</flow>`;
    expect(() => parseFlowXml(xml)).toThrow(FlowXmlParseError);
    expect(() => parseFlowXml(xml)).toThrow("requires 'variable' and 'source' attributes");
  });
});
