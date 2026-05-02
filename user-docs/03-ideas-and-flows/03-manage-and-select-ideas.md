# How to manage and select ideas

After generating test ideas, you can review, select, and organize them before generating flow XML definitions. This guide covers managing your idea backlog.

## Prerequisites

- Logged in with **QA Engineer** role or above
- Test ideas already generated (see [How to generate test ideas](../03-ideas-and-flows/01-generate-test-ideas.md))

## Viewing ideas

1. In the **Spec Manager**, select the folder you generated ideas for
2. Click the **Ideas** tab in the right panel
3. Ideas are listed with their titles and descriptions

Each idea card shows:
- **Checkbox** — For selection
- **Title** — Descriptive scenario name
- **Description** — What the test validates
- **Status** — Whether a flow has been generated from this idea

<!-- SCREENSHOT
id: ideas-manage-list
alt: Ideas panel showing a list of ideas with selection checkboxes and status indicators
page: /spec-manager
preconditions:
  - Ideas generated for a folder
actions:
  - Select the folder
  - Click Ideas tab
highlight: Idea list with checkboxes and status badges
annotations: Labels for checkbox, title, status badge
crop: panel-right
-->
[Screenshot: Ideas panel showing a list of ideas with selection checkboxes and status indicators]

## Selecting ideas

### Individual selection

Click the checkbox next to each idea you want to generate a flow for.

### Bulk selection

Use the toggle buttons at the top of the Ideas panel:

- **Select All** — Check all ideas
- **Deselect All** — Uncheck all ideas

> **Tip:** Select only the ideas you need before generating flows. Each flow generation uses AI credits, so being selective saves budget.

## Idea lifecycle

Ideas move through these states:

| State | Meaning |
|---|---|
| **New** | Just generated, no flow created yet |
| **Flow generated** | A flow XML has been created from this idea |
| **Implemented** | Flow has been registered as a test scenario |

Once a flow is generated from an idea, the idea is marked as completed. It won't be regenerated if you click Generate Ideas again.

## Deleting ideas

To remove unwanted ideas:

1. Select the ideas you want to delete
2. Use the delete action to remove them

Deleted ideas free up visual space but don't refund AI credits. If you generate ideas again later, new ones will be created (not duplicates of deleted ones).

## Best practices for idea selection

### Prioritize by test value

1. **Happy path scenarios** — Basic CRUD operations that verify core functionality
2. **Dependency chains** — Multi-step workflows (create → update → verify → delete)
3. **Error cases** — Invalid input, missing fields, unauthorized access
4. **Edge cases** — Boundary values, empty collections, special characters

### Avoid redundancy

If multiple ideas test similar things (e.g., "Create article with title" and "Create article with all fields"), pick the more comprehensive one.

### Consider dependencies

Ideas that involve multiple resources (e.g., create a category, then create an article in it) are valuable because they test real-world usage patterns and validate entity relationships.

## Tips

- **Don't generate flows for everything**: Start with the highest-priority ideas. You can always come back for more.
- **Ideas persist**: Ideas are saved to the project. You can close the browser and return later — they'll still be there.
- **Credit awareness**: Check the AI credit pill in the TopBar before generating a large batch of flows.

## Related articles

- [How to generate test ideas from API specs](../03-ideas-and-flows/01-generate-test-ideas.md) — Creating ideas
- [How to generate flow XML from ideas](../03-ideas-and-flows/04-generate-flow-xml.md) — Next step: creating flows
- [How to manage AI credits](../06-settings-and-administration/06-manage-ai-credits.md) — Budget management
