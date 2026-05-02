# Quick start: Your first API test in 10 minutes

This guide walks you through the complete FlowForge workflow — from creating a project to running your first API test. By the end, you'll have imported an API spec, generated a test scenario, and executed it against a live endpoint.

## Prerequisites

- A FlowForge account with at least **QA Engineer** role
- An OpenAPI/Swagger spec URL for the API you want to test
- API credentials (token, API key, or OAuth client) for the target endpoint

## Step 1: Create a project

Projects are the top-level containers in FlowForge. Each project holds its own specs, flows, scenarios, connections, and settings.

1. After logging in, you'll land on the **Project Selection** page
2. Click the **Create Project** button
3. Enter a project name (e.g., "My API Tests")
4. Click **Create**

<!-- SCREENSHOT
id: quickstart-create-project
alt: Project Selection page with Create Project dialog open
page: /projects
preconditions:
  - Logged in as Project Owner or above
actions:
  - Click "Create Project" button
  - Type project name in the dialog
highlight: Create Project dialog
annotations: Arrow pointing to Create Project button and the name input field
crop: main-content
-->
[Screenshot: Project Selection page with Create Project dialog open]

5. Click the new project tile to select it — you'll be taken to the Spec Manager

## Step 2: Import an API spec

1. In the **Spec Manager**, click the **Import from URL** button in the toolbar
2. Paste your OpenAPI/Swagger spec URL
3. Click **Import**
4. FlowForge downloads the spec, splits it into per-endpoint files, and organizes them into folders

<!-- SCREENSHOT
id: quickstart-import-spec
alt: Import from URL dialog with a Swagger URL entered
page: /spec-manager
preconditions:
  - Project selected
  - No specs imported yet
actions:
  - Click Import from URL button
  - Paste a Swagger/OpenAPI URL
highlight: Import dialog with URL input
annotations: Arrow pointing to Import button
crop: modal
-->
[Screenshot: Import from URL dialog with a Swagger URL entered]

5. After import completes, the **Import Result** modal shows statistics and may suggest project variables (for path parameters) and draft connections (from security schemes detected in the spec)

> **Tip:** Review the suggested project variables and connections — they save you setup time. You can configure them later in Settings.

## Step 3: Set up a connection

Before running tests, you need to connect FlowForge to your API endpoint.

1. Go to **Settings** (gear icon in the sidebar) > **Connections** tab
2. If the import auto-detected a connection, you'll see a draft connection — click it to add your credentials
3. Otherwise, click **Add Connection** and fill in:
   - **Name** — A label for this connection (e.g., "Production API")
   - **Provider type** — Choose your auth method (OAuth 2.0, Bearer Token, API Key, etc.)
   - **Base URL** — The API's base URL (e.g., `https://api.example.com`)
   - **API Version** — The version path segment (e.g., `v2`)
   - **Credentials** — Your token, API key, or OAuth client details
4. Click **Save**

<!-- SCREENSHOT
id: quickstart-add-connection
alt: Connection form showing fields for name, provider type, base URL, and credentials
page: /settings
preconditions:
  - Project selected
  - On Settings > Connections tab
actions:
  - Click Add Connection
  - Fill in connection details
highlight: Connection form fields
annotations: Numbers labeling each field
crop: main-content
-->
[Screenshot: Connection form showing fields for name, provider type, base URL, and credentials]

## Step 4: Generate test ideas

1. Navigate back to **Spec Manager**
2. Select a folder of endpoint specs (e.g., "articles") by clicking on it
3. Click the **Ideas** tab in the right panel
4. Click **Generate Ideas**
5. AI analyzes the selected endpoints and suggests test scenarios — each idea describes a multi-step workflow

<!-- SCREENSHOT
id: quickstart-generate-ideas
alt: Ideas panel showing AI-generated test scenario suggestions
page: /spec-manager
preconditions:
  - Specs imported
  - A folder with endpoint specs selected
actions:
  - Select a spec folder
  - Click Ideas tab
  - Click Generate Ideas
highlight: List of generated ideas with checkboxes
annotations: Arrow pointing to Generate Ideas button
crop: panel-right
-->
[Screenshot: Ideas panel showing AI-generated test scenario suggestions]

## Step 5: Generate a flow from an idea

1. Check the box next to one or more ideas
2. Click **Generate Flows**
3. AI creates a detailed flow XML for each selected idea — this defines the exact API calls, assertions, and data captures
4. Review the generated flow in the XML viewer

<!-- SCREENSHOT
id: quickstart-generated-flow
alt: Flow XML viewer showing a generated flow with steps, assertions, and captures
page: /spec-manager
preconditions:
  - At least one idea generated
actions:
  - Select an idea
  - Click Generate Flows
  - Click on the generated flow to view XML
highlight: Flow XML content in the viewer
crop: panel-right
-->
[Screenshot: Flow XML viewer showing a generated flow with steps, assertions, and captures]

## Step 6: Create a test scenario

1. With a flow selected, click **Create Tests**
2. FlowForge registers the flow as a runnable scenario in the Scenario Manager

> **Note:** "Flow" is the term used in Spec Manager (the authoring artifact). Once registered for execution, it becomes a "scenario" in the Scenario Manager.

## Step 7: Run your test

1. Navigate to **Scenario Manager** (test tube icon in the sidebar)
2. Expand the version tree to find your scenario
3. Click **Connect** and select your API connection from the dropdown
4. Click the **Run** button

<!-- SCREENSHOT
id: quickstart-run-test
alt: Scenario Manager showing a scenario ready to run with connection selected
page: /test-manager
preconditions:
  - At least one scenario created
  - A connection configured
actions:
  - Navigate to Scenario Manager
  - Expand version tree
  - Select connection
highlight: Run button and scenario tree
annotations: Arrow pointing to Run button
crop: main-content
-->
[Screenshot: Scenario Manager showing a scenario ready to run with connection selected]

5. Watch the real-time results as each step executes — green checkmarks for passes, red X marks for failures

## Step 8: Review results

1. Click on any step to see its details:
   - **Request** — Method, URL, headers, body sent
   - **Response** — Status code, headers, response body
   - **Assertions** — Each assertion's expected vs. actual value and pass/fail status
2. If a step failed, click the **Diagnose** tab to get AI-powered root cause analysis

<!-- SCREENSHOT
id: quickstart-results
alt: Test results showing step-level pass/fail with assertion details
page: /test-manager
preconditions:
  - A test run has completed
actions:
  - Click on a completed scenario
  - Expand a step to see details
highlight: Step results with assertion outcomes
annotations: Labels for request, response, and assertions sections
crop: main-content
-->
[Screenshot: Test results showing step-level pass/fail with assertion details]

Congratulations — you've completed your first API test with FlowForge!

## What's next?

- [Navigating the FlowForge interface](../01-getting-started/03-navigating-the-interface.md) — Explore the full UI
- [How to generate test ideas from API specs](../03-ideas-and-flows/01-how-to-generate-test-ideas.md) — Deep dive into idea generation
- [How to create and manage connections](../05-connections-and-authentication/01-how-to-create-and-manage-connections.md) — Learn all auth options
- [Understanding roles and permissions](../01-getting-started/04-roles-and-permissions.md) — Set up your team
