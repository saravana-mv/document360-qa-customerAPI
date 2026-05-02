# How to use per-scenario environment overrides

Individual scenarios can override the version-level endpoint configuration. This lets you test the same scenario against different environments, API versions, or auth methods without changing the version-wide settings.

## Prerequisites

- Logged in with **QA Manager** role or above
- At least one scenario created in the Scenario Manager

## When to use overrides

- **Testing against a different environment**: Run one scenario against staging while others use production
- **Testing a different API version**: Override the API version path for a specific scenario
- **Testing with different credentials**: Use a different auth method for a particular scenario
- **A/B testing**: Compare behavior between endpoints

## Setting an override

### 1. Open the override modal

1. In the **Scenario Manager**, right-click (or click "...") on a scenario
2. Select **Override environment** from the context menu

<!-- SCREENSHOT
id: env-override-menu
alt: Scenario context menu with Override environment option
page: /test-manager
preconditions:
  - Logged in as QA Manager
  - At least one scenario exists
actions:
  - Right-click on a scenario
highlight: Override environment option
annotations: Arrow pointing to Override environment
crop: panel-left
-->
[Screenshot: Scenario context menu with Override environment option]

### 2. Configure the override

The override modal shows optional fields — only fill in what you want to override:

| Field | Description | Example |
|---|---|---|
| **Base URL** | Override the version's base URL | `https://staging.example.com` |
| **API Version** | Override the version path | `v4-beta` |
| **Auth Type** | Override the auth method | Bearer Token, API Key, etc. |
| **Endpoint Label** | Custom label for this override | "Staging environment" |

Leave fields empty to use the version-level defaults.

<!-- SCREENSHOT
id: env-override-modal
alt: Scenario environment override modal with optional fields
page: /test-manager
preconditions:
  - Override environment clicked on a scenario
actions:
  - Open override modal
highlight: Override fields
annotations: Labels for each field, note about empty = use default
crop: modal
-->
[Screenshot: Scenario environment override modal with optional fields]

### 3. Save

Click **Save** to apply the override. A **blue slider icon** badge appears on the scenario in the tree, indicating it has an active override.

## Override hierarchy

When a scenario runs, FlowForge resolves its configuration in this order (highest priority first):

1. **Scenario override** — Values set in the override modal
2. **Version config** — Connection selected for the version in the Scenario Manager
3. **Global defaults** — Fallback values

Only non-empty override fields take effect. Empty fields fall through to the next level.

## Viewing and editing overrides

- Scenarios with overrides show a **blue slider icon** badge
- Right-click and select **Edit env override** to modify existing overrides
- To remove an override, clear all fields and save

## Tips

- **Use sparingly**: Overrides add complexity. For most testing, the version-level connection is sufficient.
- **Label your overrides**: Use the endpoint label field to document why the override exists.
- **QA Manager required**: Only QA Managers and above can set overrides, preventing accidental misconfiguration.

## Related articles

- [How to connect an API endpoint](../04-scenario-manager/02-connect-api-endpoint.md) — Version-level connections
- [How to create and manage connections](../05-connections-and-authentication/01-create-manage-connections.md) — Connection setup
- [How to navigate the Scenario Manager](../04-scenario-manager/01-navigate-scenario-manager.md) — Finding scenarios with overrides
