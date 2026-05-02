# Understanding flow XML structure

Flow XML is the format FlowForge uses to define test scenarios. Each flow describes a sequence of API calls, what to assert about the responses, and how to pass data between steps. This guide explains the XML structure so you can read, review, and modify flows.

## Basic structure

```xml
<flow xmlns="https://flowforge.io/qa/flow/v1">
  <name>Create and retrieve an article</name>
  <description>Creates an article, retrieves it, verifies fields, then cleans up</description>
  <steps>
    <step>
      <!-- Step definition -->
    </step>
    <step>
      <!-- Another step -->
    </step>
  </steps>
</flow>
```

### Top-level elements

| Element | Required | Description |
|---|---|---|
| `<flow>` | Yes | Root element with namespace `https://flowforge.io/qa/flow/v1` |
| `<name>` | Yes | Scenario name (displayed in the Scenario Manager) |
| `<description>` | No | Human-readable description of what the test does |
| `<steps>` | Yes | Container for all step definitions |

## Step definition

Each `<step>` represents one API call:

```xml
<step>
  <name>Create article</name>
  <method>POST</method>
  <path>/articles</path>
  <body>
  {
    "title": "Test Article",
    "category_id": "{{state.category_id}}",
    "workspace_id": "{{proj.workspace_id}}"
  }
  </body>
  <assertions>
    <assertion><status code="201"/></assertion>
    <assertion><field path="response.data.title" value="Test Article"/></assertion>
  </assertions>
  <captures>
    <capture name="article_id" path="response.data.id"/>
  </captures>
  <endpointRef>articles/create-article.md</endpointRef>
</step>
```

### Step elements

| Element | Required | Description |
|---|---|---|
| `<name>` | No | Human-readable step label |
| `<method>` | Yes | HTTP method: GET, POST, PUT, PATCH, DELETE |
| `<path>` | Yes | Endpoint path (e.g., `/articles`, `/categories/{{state.category_id}}`) |
| `<body>` | No | Request body (JSON) for POST/PUT/PATCH |
| `<queryParams>` | No | Query parameters |
| `<pathParams>` | No | Path parameter mappings |
| `<assertions>` | No | Expected outcomes to verify |
| `<captures>` | No | Values to extract from the response |
| `<endpointRef>` | No | Reference to the spec file for this endpoint |

## Assertions

Assertions verify expected outcomes:

### Status code assertion

```xml
<assertion><status code="201"/></assertion>
```

Checks the HTTP response status code.

### Field value assertion

```xml
<assertion><field path="response.data.title" value="Test Article"/></assertion>
```

Checks that a specific field in the response matches an expected value. The `path` uses dot notation starting with `response.` to navigate the JSON structure.

### Common assertion paths

| Path | Checks |
|---|---|
| `response.data.id` | The `id` field in `data` |
| `response.data.name` | The `name` field in `data` |
| `response.success` | A top-level `success` field |
| `response.data[0].title` | First item's title in a list |

## Captures

Captures extract values from a step's response for use in later steps:

```xml
<captures>
  <capture name="article_id" path="response.data.id"/>
</captures>
```

This captures the `id` field from the response and stores it as `state.article_id`. Later steps reference it as `{{state.article_id}}`.

## Variable syntax

All variable references use double curly braces (mustache syntax):

| Syntax | Source | Example |
|---|---|---|
| `{{proj.variable}}` | Project variables (Settings > Variables) | `{{proj.workspace_id}}` |
| `{{state.variable}}` | Captured from previous steps | `{{state.article_id}}` |
| `{{ctx.variable}}` | Runtime context | `{{ctx.timestamp}}` |

Variables can appear in `<path>`, `<body>`, `<queryParams>`, `<pathParams>`, and assertion `value` attributes.

## Common flow patterns

### CRUD lifecycle

```xml
<steps>
  <!-- 1. Create -->
  <step>
    <method>POST</method>
    <path>/articles</path>
    <captures>
      <capture name="id" path="response.data.id"/>
    </captures>
  </step>
  <!-- 2. Read -->
  <step>
    <method>GET</method>
    <path>/articles/{{state.id}}</path>
    <assertions>
      <assertion><status code="200"/></assertion>
    </assertions>
  </step>
  <!-- 3. Update -->
  <step>
    <method>PUT</method>
    <path>/articles/{{state.id}}</path>
  </step>
  <!-- 4. Delete (teardown) -->
  <step>
    <method>DELETE</method>
    <path>/articles/{{state.id}}</path>
    <assertions>
      <assertion><status code="204"/></assertion>
    </assertions>
  </step>
</steps>
```

### Prerequisite setup and teardown

Flows that test one resource often need to set up dependencies first:

```xml
<steps>
  <!-- Setup: Create category (prerequisite) -->
  <step>
    <method>POST</method>
    <path>/categories</path>
    <captures>
      <capture name="category_id" path="response.data.id"/>
    </captures>
  </step>
  <!-- Main: Create article in category -->
  <step>
    <method>POST</method>
    <path>/articles</path>
    <body>{"category_id": "{{state.category_id}}"}</body>
    <captures>
      <capture name="article_id" path="response.data.id"/>
    </captures>
  </step>
  <!-- Teardown: Delete article, then category -->
  <step>
    <method>DELETE</method>
    <path>/articles/{{state.article_id}}</path>
  </step>
  <step>
    <method>DELETE</method>
    <path>/categories/{{state.category_id}}</path>
  </step>
</steps>
```

## Tips

- **Order matters**: Steps execute sequentially. Captures must happen before they're referenced.
- **Teardown at the end**: Always clean up created entities to avoid test data buildup.
- **Use project variables**: For values that don't change between runs (workspace IDs, default settings), use `{{proj.*}}` variables.
- **Validate before running**: Use the Spec Manager's validation feature to catch XML errors before creating scenarios.

## Related articles

- [How to edit flow XML manually](../07-ai-features/04-edit-flow-xml.md) — Making changes to flow XML
- [How to generate flow XML from ideas](../03-ideas-and-flows/04-generate-flow-xml.md) — AI-generated flows
- [Key concepts and terminology](../01-getting-started/05-key-concepts-and-terminology.md) — Variable types and definitions
