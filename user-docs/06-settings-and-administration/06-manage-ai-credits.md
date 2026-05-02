# How to manage AI credits

AI credits control how much each project and user can spend on AI operations (idea generation, flow generation, chat, editing, and diagnosis). When credits are exhausted, AI features are temporarily disabled until the budget is increased.

## Prerequisites

- Logged in with **QA Manager** role or above to view credits
- **Super Owner** role to modify budgets

## Viewing credit usage

1. Click the **gear icon** in the SideNav to open Settings
2. Select the **AI Credits** tab

<!-- SCREENSHOT
id: ai-credits-page
alt: Settings AI Credits page showing project budget and user usage
page: /settings
preconditions:
  - Logged in as QA Manager or above
  - Some AI operations have been performed
actions:
  - Click Settings > AI Credits tab
highlight: Project budget card and user credits table
annotations: Labels for budget bar, remaining credits, and edit controls
crop: main-content
-->
[Screenshot: Settings AI Credits page showing project budget and user usage]

## Project budget

The **Project Budget** card shows:
- **Used**: Total AI spend for this project (in USD)
- **Budget**: Maximum allowed spend
- **Remaining**: Budget minus used
- **API calls**: Total number of AI operations
- **Last used**: When the last AI operation occurred

The progress bar changes color based on usage:
- **Green**: Below 70% used
- **Amber**: 70–90% used
- **Red**: Above 90% used (approaching exhaustion)

### TopBar credit pill

The TopBar displays a credit usage pill showing the project's current usage. It turns red when credits are exhausted, alerting all team members.

## Updating budgets (Super Owner only)

### Project budget

1. In the Project Budget card, enter a new value in the **Budget (USD)** field
2. Click **Update**

### Per-user budgets

The **User Credits** table shows each user's individual AI spending:

| Column | Description |
|---|---|
| **User** | Team member name |
| **Used** | AI spend by this user |
| **Budget** | Individual spending limit |
| **Calls** | Number of AI operations |
| **Usage** | Visual progress bar |

To update a user's budget:
1. Click on the budget value in their row
2. Enter a new amount
3. Click **Save**

> **Note:** User credit records are created automatically on each user's first AI call. The table may be empty if no one has used AI features yet.

## What consumes credits

| Operation | Typical cost |
|---|---|
| Generate ideas (single folder) | ~$0.02–0.05 |
| Generate flow XML (single idea) | ~$0.05–0.10 |
| Flow Designer chat (per message) | ~$0.01–0.03 |
| AI-assisted flow edit | ~$0.02–0.05 |
| AI diagnosis | ~$0.02–0.05 |

Costs depend on the selected AI model. Opus costs roughly 3× more than Sonnet for the same operation.

## When credits are exhausted

- AI buttons are disabled across the app
- The TopBar credit pill turns red with "Exhausted" label
- Non-Super-Owner users see a banner with contact info: "To increase your credit limit, contact a Super Owner: [email]"
- Non-AI features (manual editing, running scenarios, viewing results) continue to work normally

## Tips

- **Monitor before batch operations**: Check the credit pill before generating ideas or flows for an entire version folder.
- **Start with conservative budgets**: You can always increase. Reducing a budget doesn't claw back spent credits.
- **Model choice matters**: Switching from Sonnet to Opus roughly triples AI costs. Stick with Sonnet unless you need maximum accuracy.

## Related articles

- [How to select an AI model](../07-ai-features/02-select-ai-model.md) — Model cost comparison
- [How AI works in FlowForge](../07-ai-features/01-how-ai-works.md) — Understanding AI operations
- [Super Owner: Global settings and user management](../06-settings-and-administration/08-super-owner-settings.md) — Setting default budgets
