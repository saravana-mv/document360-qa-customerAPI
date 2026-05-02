# How to reimport and sync spec files

When your API evolves, you need to update FlowForge's spec files to match. The reimport feature safely updates your specs while preserving your existing flows and scenarios.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected
- Specs previously imported from a URL

## How reimport works

Reimport is a **validate-before-wipe** process:

1. FlowForge downloads the new spec from the original URL
2. Validates the spec is parseable and has endpoints
3. Compares against existing specs to identify changes
4. If validation passes, replaces the old spec files with the new ones
5. Re-runs distillation and digest generation for AI operations

> **Important:** Reimport replaces the split spec files. Your flows, scenarios, and test runs are **not** affected — they are stored separately.

## Steps

### 1. Open the reimport option

1. In the **Spec Manager**, right-click (or click "...") on the version folder that was imported from a URL
2. Select **Reimport** from the context menu

Alternatively, if a sync source is configured, you may see a **Sync** option.

<!-- SCREENSHOT
id: spec-reimport-menu
alt: Context menu on a version folder showing the Reimport option
page: /spec-manager
preconditions:
  - A version folder with URL-imported specs
actions:
  - Right-click on the version folder
highlight: Reimport option in context menu
annotations: Arrow pointing to Reimport
crop: panel-left
-->
[Screenshot: Context menu on a version folder showing the Reimport option]

### 2. Confirm the reimport

A confirmation dialog explains what will happen:

- New spec will be downloaded from the original URL
- Existing spec files in the folder will be replaced
- Flows and scenarios remain untouched

Click **Reimport** to proceed.

### 3. Review the results

After reimport completes, the Import Result modal shows:

- Number of endpoints found in the updated spec
- New endpoints added
- Endpoints removed (no longer in the spec)
- Any new path parameters or security schemes detected

### 4. Check your flows

After reimport, some existing flows may reference endpoints that changed. Check for:

- **Renamed endpoints** — Flow steps may reference old endpoint paths
- **Changed request schemas** — Required fields may have been added or removed
- **Removed endpoints** — Steps targeting deleted endpoints will fail at runtime

> **Tip:** Run your test scenarios after reimport to catch any mismatches early. The AI diagnosis feature can help identify and fix issues caused by spec changes.

## Source tracking with `_sources.json`

FlowForge tracks where specs were imported from using a `_sources.json` manifest in each version folder. This file records:

- The original import URL
- Import timestamp
- Version information

This manifest enables reimport to fetch from the correct URL without you needing to re-enter it.

## Sync vs. reimport

| Feature | Reimport | Sync |
|---|---|---|
| **Trigger** | Manual (context menu) | Manual or on-demand |
| **Source** | Original import URL | `_sources.json` manifest |
| **Scope** | Full replacement | Incremental updates |
| **Validation** | Validates before replacing | Validates before applying |

## Tips

- **Test after reimport**: Always run a quick test pass after reimporting to catch breaking changes.
- **Version folder per release**: If the API has breaking changes between versions, consider importing into a new version folder rather than reimporting over the old one.
- **Flows are resilient**: Flow XML references endpoint paths, not spec files. Minor spec changes (like adding a new optional field) won't break existing flows.

## Related articles

- [How to import API specs from an OpenAPI URL](../02-spec-manager/01-import-specs-from-url.md) — Initial import
- [How to organize specs with version folders](../02-spec-manager/03-organize-specs-with-version-folders.md) — Version management
- [How to use AI diagnosis for failed steps](../04-scenario-manager/06-ai-diagnosis.md) — Fixing issues after spec changes
