# How to configure project variables

Project variables are shared key-value pairs that can be referenced in flow XML using the `{{proj.variableName}}` syntax. They're ideal for values that stay constant across test runs — like workspace IDs, default settings, or environment-specific identifiers.

## Prerequisites

- Logged in with **QA Manager** role or above
- A project selected

## Viewing variables

1. Click the **gear icon** in the SideNav to open Settings
2. Select the **Variables** tab

The page shows all configured variables with their names and values.

<!-- SCREENSHOT
id: variables-page
alt: Settings Variables page showing project variables table
page: /settings
preconditions:
  - Logged in as QA Manager or above
  - At least two variables exist
actions:
  - Click Settings > Variables tab
highlight: Variables table and Add variable button
annotations: Labels for name/value columns and usage syntax hint
crop: main-content
-->
[Screenshot: Settings Variables page showing project variables table]

## Adding a variable

### 1. Click Add variable

Click the **Add variable** link (blue text with plus icon) below the existing variables.

### 2. Enter name and value

| Field | Rules | Example |
|---|---|---|
| **Name** | Letters, numbers, underscores only. Must start with a letter or underscore. | `workspace_id` |
| **Value** | Any string | `abc-123-def-456` |

### 3. Save

Click **Save variables** (green button). The button is disabled until you make a change.

## Editing a variable

1. Click on the value field of the variable you want to change
2. Type the new value
3. Click **Save variables**

## Deleting a variable

1. Hover over the variable row — a trash icon appears
2. Click the trash icon
3. Click **Save variables** to confirm

> **Warning:** If a deleted variable is still referenced in flow XML (`{{proj.variableName}}`), those flows will fail at runtime with a "missing variable" error.

## How variables work in flows

Variables are referenced using mustache syntax in flow XML:

```xml
<body>
{
  "workspace_id": "{{proj.workspace_id}}",
  "title": "Test Article"
}
</body>
```

At runtime, `{{proj.workspace_id}}` is replaced with the actual value from the Variables page.

Variables can appear in:
- Request bodies (`<body>`)
- URL paths (`<path>/articles/{{proj.default_category}}</path>`)
- Query parameters (`<param name="lang" value="{{proj.lang_code}}"/>`)
- Assertion values (`<field path="response.data.workspace_id" value="{{proj.workspace_id}}"/>`)

## Variable validation

FlowForge validates variables at two stages:

### Design-time (before running)

The Scenario Manager checks all active flows for `{{proj.*}}` references. If a referenced variable is missing or empty:
- A red banner appears with a link to Settings > Variables
- Run buttons are disabled until the issue is resolved

### Runtime (during execution)

If a step contains an unresolved `{{proj.*}}` reference, that step is blocked with an error. FlowForge suggests similar variable names if a close match exists.

## Tips

- **Use for environment-specific values**: Workspace IDs, project IDs, default categories — values that differ between environments but stay constant within one.
- **Don't store secrets**: Variables are visible to all project members. Use Connections for API credentials.
- **Check after importing**: When importing specs from a new API, review auto-detected path parameters — they may need to be added as project variables.

## Related articles

- [Understanding flow XML structure](../07-ai-features/03-flow-xml-structure.md) — Variable syntax reference
- [Key concepts and terminology](../01-getting-started/05-key-concepts-and-terminology.md) — Variable types explained
- [How to run test scenarios](../04-scenario-manager/03-run-test-scenarios.md) — Runtime variable resolution
