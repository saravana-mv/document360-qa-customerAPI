# How to configure API rules and diagnostic lessons

API rules let you teach FlowForge's AI about your API's specific behaviors, conventions, and quirks that aren't captured in the OpenAPI spec. Diagnostic lessons are auto-learned patterns from successful test fixes.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected with imported specs

## What are API rules?

API rules are free-text instructions injected into every AI prompt — flow generation, idea generation, flow chat, flow editing, and AI diagnosis. They help the AI generate more accurate flows by providing context that the spec alone doesn't convey.

**Examples of useful rules:**

- "Always include `workspace_id` in POST request bodies"
- "The `status` field returns integer values (0=Draft, 1=Published), not strings"
- "DELETE endpoints return 204 with no body"
- "All list endpoints support `page` and `page_size` query parameters"
- "The `parent_id` field is optional in the schema but should always be provided for realistic tests"

## Configuring API rules

API rules are configured **per version folder** — each version folder can have its own set of rules.

### 1. Open the rules panel

1. In the **Spec Manager**, select a top-level **version folder** (e.g., `v3/`)
2. The **Rules** panel appears in the right side, showing the current rules for that folder

<!-- SCREENSHOT
id: spec-rules-panel
alt: API Rules panel showing the inline editor for a version folder
page: /spec-manager
preconditions:
  - A version folder with imported specs exists
actions:
  - Click on a top-level version folder
  - The Rules panel appears on the right
highlight: Rules panel with text editor
annotations: Labels for the rules text area and save button
crop: panel-right
-->
[Screenshot: API Rules panel showing the inline editor for a version folder]

### 2. Write your rules

Enter rules as plain text in the editor. Each rule should be a clear, specific instruction. The AI reads these verbatim, so be explicit.

### 3. Save

Click **Save** to persist the rules. They're stored as `_system/_rules.json` in the version folder's blob storage and take effect immediately for all subsequent AI operations.

## Enum aliases

Some APIs return enum fields as integers at runtime even though the spec defines them as strings. Enum aliases let you define the mapping so FlowForge's assertion engine can match both representations.

### Configuring enum aliases

Enum aliases are part of the API rules configuration. Add them in the rules panel using `name=value` format:

```
status: Draft=0, Published=1, Archived=2
visibility: Public=0, Private=1
```

### How they work

When assertions compare response values, FlowForge's bidirectional matching (`jsonEqual`) checks both the string name and the integer ordinal. So an assertion expecting `"Published"` will also accept `1`, and vice versa.

## Diagnostic lessons

Diagnostic lessons are **auto-learned** — you don't write them manually. They're captured when the AI diagnosis feature successfully fixes a failing test step.

### How lessons are learned

1. A test step fails
2. You open the **Diagnose** tab and click **Fix it**
3. The AI analyzes the failure, identifies the issue, and applies a fix
4. If the fix succeeds, a lesson is automatically recorded

### What gets recorded

Each lesson includes:
- The endpoint involved
- The category of issue (e.g., missing field, wrong value format)
- The problematic fields
- A description of the fix
- The date learned

### Where lessons are stored

Lessons are appended to `_system/_skills.md` in the version folder. You can view this file in the Spec Manager (it appears in the `_system/` folder with a lock icon).

### How lessons are used

Lessons are automatically injected into all AI prompts alongside API rules. This means:

- **Flow generation** avoids known mistakes from the start
- **Idea generation** accounts for API quirks
- **AI diagnosis** recognizes previously seen patterns faster
- **Flow chat** benefits from accumulated knowledge

> **Tip:** Lessons accumulate over time, making the AI progressively better at generating correct flows for your specific API. The more you use the diagnosis feature, the smarter it gets.

### Deduplication

The same endpoint + field combination won't be recorded twice. If the AI learns a lesson about `POST /articles` and the `status` field, it won't create a duplicate entry if the same issue is encountered again.

## How rules and lessons flow into AI operations

```
API Rules (_rules.json)  ──┐
                            ├──> Injected into all AI system prompts
Diagnostic Lessons          │
(_skills.md)             ──┘
                            │
                            ├──> Flow generation
                            ├──> Idea generation
                            ├──> Flow Designer chat
                            ├──> Flow editing
                            └──> AI diagnosis
```

## Tips

- **Start with common patterns**: After your first few test runs, note which assertions fail and add rules to prevent those issues.
- **Be specific**: "Status is an integer" is less helpful than "The `status` field in article responses returns integers: Draft=0, Published=1, Archived=2".
- **Rules are version-scoped**: Different API versions can have different rules. A rule in `v3/` won't affect `v2/` flows.
- **Check lessons periodically**: Review `_system/_skills.md` to see what the AI has learned. If a lesson is outdated (e.g., the API was fixed), the accumulated knowledge still applies but won't cause harm — it's additive context, not restrictive.

## Related articles

- [How AI works in FlowForge](../07-ai-features/01-how-ai-works.md) — Understanding AI context and prompts
- [How to use AI diagnosis for failed steps](../04-scenario-manager/06-ai-diagnosis.md) — How diagnostic lessons are generated
- [How to organize specs with version folders](../02-spec-manager/03-organize-specs-with-version-folders.md) — Rules are per version folder
