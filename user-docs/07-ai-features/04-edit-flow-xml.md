# How to edit flow XML manually

While AI generates most flow XML automatically, you may need to make manual adjustments — adding assertions, fixing capture paths, modifying request bodies, or tweaking step sequences.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A flow XML file in the Spec Manager

## Editing options

FlowForge offers two ways to edit flow XML:

### 1. Manual editing (XML editor)

Direct editing of the XML source code with syntax highlighting.

### 2. AI-assisted editing

Describe the change in natural language and let the AI modify the XML for you.

## Manual editing

### 1. Open the flow

1. In the **Spec Manager**, click the **Flows** tab
2. Select the flow you want to edit

### 2. Enter edit mode

Click the **Edit** button (pencil icon) on the flow viewer. The read-only viewer switches to a CodeMirror XML editor with full syntax highlighting.

### 3. Make your changes

Edit the XML directly. Common modifications:

- **Add an assertion**: Insert an `<assertion>` element inside `<assertions>`
- **Change a capture path**: Update the `path` attribute on a `<capture>`
- **Modify a request body**: Edit the JSON inside `<body>`
- **Add a step**: Insert a new `<step>` element inside `<steps>`
- **Reorder steps**: Cut and paste `<step>` blocks

### 4. Save

Click **Save** (or press Ctrl+Enter). FlowForge validates the XML before saving:

- If valid: Changes are saved
- If invalid: Error messages show what needs to be fixed

## AI-assisted editing

### 1. Open the flow and click AI Edit

Select a flow, then click the **AI Edit** button.

### 2. Describe the change

Type a natural-language description of what you want to change:

> "Add an assertion to step 2 that checks response.data.status equals 1"

> "Remove the query parameter from the GET step"

> "Change the DELETE step to expect status 204 instead of 200"

### 3. Review the diff

The AI generates the modified XML and shows a **diff view**:

- **Green** lines: Added content
- **Red** lines: Removed content

### 4. Accept or reject

- **Accept**: Apply the AI's changes
- **Edit manually**: Switch to the manual editor with the AI's changes loaded
- **Retry**: Ask the AI to try again with different instructions
- **Discard**: Revert to the original XML

## Validation

After any edit, FlowForge validates the flow XML against the schema:

| Check | What it validates |
|---|---|
| XML structure | Well-formed XML, correct namespace |
| Required elements | `<name>` and `<steps>` present |
| Assertion syntax | Valid `<status>` and `<field>` elements |
| Capture syntax | Valid `name` and `path` attributes |
| Variable references | Correct `{{...}}` mustache syntax |

Invalid flows show a red error badge and cannot be registered as scenarios until fixed.

## Common edits

### Adding a status code assertion

```xml
<assertions>
  <assertion><status code="200"/></assertion>
  <!-- Add this line: -->
  <assertion><field path="response.success" value="true"/></assertion>
</assertions>
```

### Fixing a capture path

```xml
<!-- Before (wrong): -->
<capture name="id" path="response.id"/>
<!-- After (correct): -->
<capture name="id" path="response.data.id"/>
```

### Adding a query parameter

```xml
<step>
  <method>GET</method>
  <path>/articles</path>
  <queryParams>
    <param name="page_size" value="10"/>
    <param name="sort" value="created_at"/>
  </queryParams>
</step>
```

### Using a project variable in the body

```xml
<body>
{
  "title": "Test Article",
  "workspace_id": "{{proj.workspace_id}}"
}
</body>
```

## Tips

- **Validate often**: Save after each significant change to catch errors early.
- **Use AI edit for complex changes**: Restructuring steps or adding multiple elements is faster via AI.
- **Use manual edit for small fixes**: Changing a single value or fixing a typo is faster in the editor.
- **Check captures**: After editing, verify that capture names used in later steps still match.

## Related articles

- [Understanding flow XML structure](../07-ai-features/03-flow-xml-structure.md) — XML format reference
- [How to use the Flow Designer chat](../03-ideas-and-flows/05-flow-designer-chat.md) — Conversational editing
- [How to generate flow XML from ideas](../03-ideas-and-flows/04-generate-flow-xml.md) — AI-generated flows
