# How to organize specs with version folders

Version folders help you manage API specifications across different releases. Each version folder acts as an independent workspace with its own specs, flows, connections, and AI context.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected

## Understanding the folder structure

When you import an OpenAPI spec, FlowForge automatically creates a structure like this:

```
v3/                          <- Version folder
  _system/                   <- System files (auto-generated, read-only)
    _digest.md               <- Endpoint index for AI
    _swagger.json            <- Original imported spec
    _rules.json              <- API rules configuration
    _skills.md               <- Diagnostic lessons
    _distilled/              <- AI-optimized spec summaries
      articles/
        create-article.md
        get-article.md
        ...
  articles/                  <- Resource folder
    create-article.md        <- Endpoint spec file
    get-article.md
    update-article.md
    delete-article.md
  categories/                <- Resource folder
    create-category.md
    get-category.md
    ...
```

### Folder types

| Type | Example | Description |
|---|---|---|
| **Version folder** | `v3/` | Top-level container for an API version |
| **Resource folder** | `articles/` | Groups endpoints by API resource |
| **System folder** | `_system/` | Auto-generated internal files (read-only) |
| **Distilled folder** | `_distilled/` | AI-optimized spec summaries |

## Creating a new version folder

1. Right-click (or click "...") on the root of the file tree
2. Select **New Folder** from the context menu
3. Enter the folder name (e.g., `v4`)
4. Press Enter

<!-- SCREENSHOT
id: spec-create-folder
alt: Context menu on file tree root showing New Folder option
page: /spec-manager
preconditions:
  - Logged in as QA Engineer or above
actions:
  - Right-click on the file tree root area
highlight: New Folder option in context menu
annotations: Arrow pointing to New Folder option
crop: panel-left
-->
[Screenshot: Context menu on file tree root showing New Folder option]

## Organizing within version folders

### Creating subfolders

1. Right-click a version folder
2. Select **New Folder**
3. Name it after the API resource (e.g., `users`, `orders`)

### Moving files between folders

- **Drag and drop**: Click and drag a file or folder onto another folder
- Files can be moved between resource folders and version folders
- Blob storage paths update automatically

### Renaming files and folders

1. Right-click the item
2. Select **Rename**
3. Enter the new name

## System files

System files appear in the `_system/` subfolder with a lock icon and muted text. They are:

- **Read-only** — Cannot be edited or deleted through the UI
- **Auto-generated** — Created during import and updated during reimport
- **Displayed first** — Always appear at the top of the folder
- **No drag-drop** — Cannot be moved or reorganized

| File | Purpose |
|---|---|
| `_digest.md` | Lightweight endpoint index (~2-3 lines each) for AI idea generation |
| `_swagger.json` | Original imported OpenAPI/Swagger spec backup |
| `_rules.json` | API rules and enum aliases injected into AI prompts |
| `_skills.md` | Diagnostic lessons auto-learned from successful AI fixes |
| `_distilled/*.md` | Condensed endpoint specs (~50-100 lines) used by AI for flow generation |

> **Tip:** System `.json` files open in a read-only JSON viewer (CodeMirror). You cannot edit them directly — use the API Rules panel for `_rules.json` configuration.

## Working with multiple API versions

Common patterns for multi-version testing:

1. **Side-by-side versions**: Import `v2` and `v3` specs into separate version folders. Create flows and scenarios independently for each.

2. **Migration testing**: Keep both versions active and create flows that test backward compatibility or migration paths.

3. **Per-version connections**: Each version folder can have its own API connection with a different base URL or API version path. Configure these in Scenario Manager when connecting.

## Tips

- **Naming convention**: Use the API version as the folder name (e.g., `v3`, `v2.1`) for clarity.
- **Don't modify system files**: The `_system/` folder is managed automatically. Changes to the API spec should go through reimport.
- **Flat is fine**: If you only test one API version, a single version folder with resource subfolders is all you need.

## Related articles

- [How to import API specs from an OpenAPI URL](../02-spec-manager/01-import-specs-from-url.md) — Initial spec import
- [How to reimport and sync spec files](../02-spec-manager/05-reimport-and-sync-spec-files.md) — Updating specs when the API changes
- [How to configure API rules and diagnostic lessons](../02-spec-manager/06-configure-api-rules.md) — Customizing AI behavior per version
