# How to generate test ideas from API specs

FlowForge's AI analyzes your API specifications and suggests meaningful test scenarios — covering happy paths, error cases, edge cases, and multi-step workflows. This is the starting point for building your test suite.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected with imported specs
- AI credits available (check the credit pill in the TopBar)

## Steps

### 1. Select a folder in the Spec Manager

1. Navigate to the **Spec Manager**
2. In the file tree, click on a **resource folder** (e.g., `articles/`) or a **version folder** (e.g., `v3/`)
3. The **Ideas** tab becomes available in the right panel

> **Tip:** Selecting a resource folder generates ideas scoped to those endpoints. Selecting a version folder generates ideas across all endpoints in that version.

<!-- SCREENSHOT
id: ideas-select-folder
alt: Spec Manager with a resource folder selected and Ideas tab visible
page: /spec-manager
preconditions:
  - Specs imported
  - A version folder with resource subfolders exists
actions:
  - Click on a resource folder like "articles"
  - Click the Ideas tab
highlight: Selected folder and Ideas tab
annotations: Arrow pointing to the Ideas tab
crop: main-content
-->
[Screenshot: Spec Manager with a resource folder selected and Ideas tab visible]

### 2. Click Generate Ideas

1. Click the **Ideas** tab in the right panel
2. Click the **Generate Ideas** button
3. AI analyzes the endpoint specs in the selected folder and generates test scenario suggestions

<!-- SCREENSHOT
id: ideas-generate-button
alt: Ideas tab with Generate Ideas button
page: /spec-manager
preconditions:
  - Resource folder selected
  - Ideas tab active
  - No ideas generated yet
actions:
  - Click Ideas tab
highlight: Generate Ideas button
annotations: Arrow pointing to Generate Ideas button
crop: panel-right
-->
[Screenshot: Ideas tab with Generate Ideas button]

### 3. Review generated ideas

Each idea includes:

- **Title** — A descriptive name for the test scenario (e.g., "Create and retrieve an article with all optional fields")
- **Description** — A natural-language summary of what the test does
- **Steps outline** — The sequence of API calls involved
- **Checkbox** — For selecting ideas to generate flows from

Ideas are scoped strictly to the endpoints in the selected folder — they never reference external endpoints.

<!-- SCREENSHOT
id: ideas-list
alt: List of generated test ideas with titles, descriptions, and checkboxes
page: /spec-manager
preconditions:
  - Ideas have been generated
actions:
  - Generate ideas for a folder
highlight: Idea cards with titles and descriptions
annotations: Labels for title, description, and checkbox
crop: panel-right
-->
[Screenshot: List of generated test ideas with titles, descriptions, and checkboxes]

### 4. Manage ideas

- **Select/Deselect all** — Use the toggle button at the top to select or deselect all ideas
- **Individual selection** — Click checkboxes to pick specific ideas
- **Delete ideas** — Remove unwanted ideas
- **Regenerate** — Generate additional ideas (existing ideas are preserved, not regenerated)

> **Important:** FlowForge never regenerates ideas that already exist. If you click Generate Ideas again, only new ideas are created. This prevents wasting AI credits on duplicate work.

## How AI generates ideas

The AI considers:

1. **Endpoint specs** — Request/response schemas, parameters, status codes
2. **Entity dependencies** — If creating an article requires a category, the idea includes category setup and teardown
3. **API rules** — Your custom rules from `_system/_rules.json`
4. **Diagnostic lessons** — Previously learned patterns from `_system/_skills.md`
5. **Spec digest** — For large folders (>20 endpoints), a lightweight digest is used to stay within token limits

## Cost considerations

- Idea generation uses AI tokens, which count against your project's credit budget
- The credit pill in the TopBar shows current usage
- Larger folders with more endpoints cost more to analyze
- FlowForge uses the spec digest for large folders to keep costs manageable

## Tips

- **Start with a single resource folder** — Generate ideas for one resource (e.g., `articles/`) before tackling the entire version. This gives you focused, high-quality scenarios.
- **Review before generating flows** — Not every idea needs a flow. Deselect ideas that overlap or aren't relevant to your testing priorities.
- **Dependencies are included** — If an endpoint depends on another resource (e.g., articles need categories), the AI automatically includes setup and teardown steps.

## Related articles

- [Understanding idea generation modes](../03-ideas-and-flows/02-idea-generation-modes.md) — Different modes for different needs
- [How to manage and select ideas](../03-ideas-and-flows/03-manage-and-select-ideas.md) — Organizing your idea backlog
- [How to generate flow XML from ideas](../03-ideas-and-flows/04-generate-flow-xml.md) — Next step after ideas
