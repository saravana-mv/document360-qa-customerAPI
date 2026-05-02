# How to generate flow XML from ideas

Flow XML is the heart of FlowForge testing — a structured definition of API calls, assertions, and data captures. This guide shows how to generate flows from your selected ideas.

## Prerequisites

- Logged in with **QA Engineer** role or above
- Test ideas generated and selected (see [How to manage and select ideas](../03-ideas-and-flows/03-manage-and-select-ideas.md))
- AI credits available

## Steps

### 1. Select ideas to generate flows for

1. In the **Spec Manager**, navigate to the folder with generated ideas
2. Click the **Ideas** tab
3. Check the boxes next to the ideas you want to create flows for

### 2. Click Generate Flows

Click the **Generate Flows** button. FlowForge processes each selected idea sequentially:

1. The AI reads the relevant endpoint specs (distilled versions for efficiency)
2. It generates a complete flow XML file defining the test scenario
3. Post-processors validate and enhance the XML (inject required fields, fix references, validate captures)

<!-- SCREENSHOT
id: flows-generate-button
alt: Ideas tab with selected ideas and Generate Flows button
page: /spec-manager
preconditions:
  - Ideas generated
  - At least one idea selected
actions:
  - Select one or more ideas
  - Click Generate Flows
highlight: Generate Flows button with selected ideas
annotations: Arrow pointing to Generate Flows button
crop: panel-right
-->
[Screenshot: Ideas tab with selected ideas and Generate Flows button]

### 3. Monitor generation progress

During generation, each idea shows a status indicator:

- **Spinner** — Currently generating
- **Green checkmark** — Flow generated successfully
- **Red X** — Generation failed (hover for error details)

Generation happens sequentially (one at a time) to maintain quality and manage API costs.

### 4. Review generated flows

After generation completes:

1. Click the **Flows** tab to see all generated flow XML files
2. Click a flow to view its XML in the CodeMirror viewer with syntax highlighting
3. Review the steps, assertions, and captures

<!-- SCREENSHOT
id: flows-xml-viewer
alt: Flows tab showing a generated flow XML with syntax-highlighted code
page: /spec-manager
preconditions:
  - At least one flow generated
actions:
  - Click Flows tab
  - Click on a flow file
highlight: Flow XML content in the viewer
annotations: Labels for steps, assertions, and captures sections
crop: panel-right
-->
[Screenshot: Flows tab showing a generated flow XML with syntax-highlighted code]

## What's in a generated flow

A typical flow XML includes:

```xml
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Create and retrieve an article</name>
  <description>Creates an article, retrieves it, verifies fields, then cleans up</description>
  <steps>
    <!-- Step 1: Create prerequisite (category) -->
    <step>
      <method>POST</method>
      <path>/categories</path>
      <body>{"name": "Test Category"}</body>
      <assertions>
        <assertion><status code="201"/></assertion>
      </assertions>
      <captures>
        <capture name="category_id" path="response.data.id"/>
      </captures>
    </step>
    <!-- Step 2: Create the article -->
    <step>
      <method>POST</method>
      <path>/articles</path>
      <body>{"title": "Test Article", "category_id": "{{state.category_id}}"}</body>
      <assertions>
        <assertion><status code="201"/></assertion>
        <assertion><field path="response.data.title" value="Test Article"/></assertion>
      </assertions>
      <captures>
        <capture name="article_id" path="response.data.id"/>
      </captures>
    </step>
    <!-- Teardown steps... -->
  </steps>
</flow>
```

Key elements:
- **Steps** — Sequential API calls with method, path, and body
- **Assertions** — Expected status codes and response field values
- **Captures** — Values extracted from responses (using `{{state.variable}}` syntax)
- **Prerequisites** — Setup steps for dependent entities
- **Teardown** — Cleanup steps to delete created entities

## Post-processing pipeline

After AI generates the raw XML, FlowForge runs 11 post-processors to improve quality:

1. Fix mismatched endpoint references
2. Inject cross-step data captures
3. Add missing required fields from the spec
4. Validate and correct field names
5. Remove extra fields not in the spec
6. Inject correct endpoint references
7. Apply rules-based required fields
8. Validate capture chains
9. Fix timestamp assertions
10. Fix circular assertions
11. Fix bare assertion field paths

This pipeline ensures the generated flow is spec-compliant and ready to execute.

## Batch generation

When multiple ideas are selected:

- Flows generate **sequentially** (one at a time)
- Each completed flow is immediately available in the Flows tab
- If one flow fails to generate, others continue
- Already-generated flows are skipped (no duplicate generation)

## Tips

- **Start small**: Generate 1-2 flows first to verify quality before batching.
- **Check AI rules**: If generated flows have recurring issues, add API rules to guide the AI (see [How to configure API rules](../02-spec-manager/06-configure-api-rules.md)).
- **Review captures**: Ensure data flows correctly between steps — the AI usually gets this right, but complex chains may need manual review.
- **Cost awareness**: Each flow costs approximately $0.05-$0.10 in AI tokens. Check your credit budget before large batches.

## Related articles

- [How to use the Flow Designer chat](../03-ideas-and-flows/05-flow-designer-chat.md) — Refine flows through conversation
- [How to create test scenarios from flows](../03-ideas-and-flows/07-create-test-scenarios-from-flows.md) — Register flows for execution
- [Understanding flow XML structure](../07-ai-features/03-flow-xml-structure.md) — Deep dive into the XML format
