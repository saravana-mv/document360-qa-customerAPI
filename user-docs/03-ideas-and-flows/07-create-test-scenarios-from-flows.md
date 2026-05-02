# How to create test scenarios from flows

Once you have a flow XML definition, the next step is to register it as a runnable test scenario in the Scenario Manager. This is a deterministic process (no AI involved) that converts the flow XML into an executable scenario.

## Prerequisites

- Logged in with **QA Engineer** role or above
- At least one flow XML file that passes validation
- The flow must be saved in the Spec Manager

## Steps

### 1. Select a flow

1. In the **Spec Manager**, navigate to the **Flows** tab
2. Select the flow XML file you want to register as a scenario

### 2. Validate the flow

Before creating a scenario, the flow XML must pass schema validation. FlowForge validates:

- XML structure conforms to the flow schema
- Required elements are present (name, steps)
- Assertions and captures have valid syntax
- Variable references use correct `{{…}}` mustache syntax

If validation fails, you'll see error messages indicating what needs to be fixed.

### 3. Click Create Tests

Click the **Create Tests** button. FlowForge:

1. Parses the flow XML into a structured test definition
2. Registers it as a scenario in the Cosmos DB database
3. Makes it available in the Scenario Manager

<!-- SCREENSHOT
id: flows-create-tests
alt: Flow viewer with Create Tests button highlighted
page: /spec-manager
preconditions:
  - A valid flow XML selected
actions:
  - Select a flow in the Flows tab
  - Click Create Tests
highlight: Create Tests button
annotations: Arrow pointing to Create Tests button
crop: panel-right
-->
[Screenshot: Flow viewer with Create Tests button highlighted]

### 4. Find your scenario in the Scenario Manager

1. Navigate to the **Scenario Manager** (test tube icon in the sidebar)
2. Expand the version accordion that matches your flow's version folder
3. Navigate the folder tree to find your scenario
4. The scenario name matches the flow's `<name>` element

> **Terminology note:** In the Spec Manager, you work with "flows" (the XML authoring artifact). In the Scenario Manager, they become "scenarios" (the runnable test instance).

## Creating multiple scenarios

You can create scenarios from multiple flows at once:

1. In the Flows tab, select multiple flow files
2. Click **Create Tests**
3. All selected flows are registered as scenarios

## What happens during creation

The process is **deterministic** — no AI is involved. FlowForge:

1. Parses the flow XML using the schema parser
2. Extracts steps, assertions, captures, and metadata
3. Generates stable GUIDs for the scenario and each step
4. Saves the scenario definition to Cosmos DB
5. Activates the scenario in the Scenario Manager tree

## Flow-scenario relationship

- **One flow → one scenario**: Each flow XML creates exactly one scenario
- **Flows are reusable**: The same flow XML can be re-registered if the scenario is deleted
- **Updates propagate**: If you edit a flow XML and re-create the scenario, it overwrites the existing one
- **Deleting scenarios preserves flows**: Removing a scenario from the Scenario Manager does not delete the flow XML file

## Validation errors

Common validation issues:

| Error | Cause | Fix |
|---|---|---|
| Missing `<name>` element | Flow XML doesn't have a name | Add `<name>Your Scenario Name</name>` |
| Invalid assertion syntax | Malformed assertion element | Check assertion format against the schema |
| Undefined variable reference | `{{state.x}}` used before being captured | Ensure the capture step comes before the usage step |
| Invalid XML structure | Mismatched tags or namespace issues | Fix XML syntax; ensure namespace is `https://flowforge.io/qa/flow/v1` |

## Tips

- **Validate first**: Always check for validation errors before creating tests. Invalid flows won't execute correctly.
- **Name flows clearly**: The flow's `<name>` becomes the scenario name in the Scenario Manager, so use descriptive names.
- **Batch creation**: If you've generated multiple flows, create all scenarios at once to save time.

## Related articles

- [How to generate flow XML from ideas](../03-ideas-and-flows/04-generate-flow-xml.md) — Creating flow XML
- [How to navigate the Scenario Manager](../04-scenario-manager/01-navigate-scenario-manager.md) — Finding your scenarios
- [How to run test scenarios](../04-scenario-manager/03-run-test-scenarios.md) — Executing scenarios
