# How to import API specs from an OpenAPI URL

Import your API specification directly from a URL to quickly populate FlowForge with per-endpoint reference files. This is the fastest way to get started with a new API.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected
- A publicly accessible OpenAPI 3.x or Swagger 2.0 spec URL

## Steps

### 1. Open the import dialog

In the **Spec Manager**, click the **Import from URL** button in the toolbar above the file tree.

<!-- SCREENSHOT
id: spec-import-url-button
alt: Spec Manager toolbar with Import from URL button highlighted
page: /spec-manager
preconditions:
  - Logged in as QA Engineer or above
  - Project selected
actions:
  - Navigate to Spec Manager
highlight: Import from URL button in the toolbar
annotations: Arrow pointing to the Import from URL button
crop: panel-left
-->
[Screenshot: Spec Manager toolbar with Import from URL button highlighted]

### 2. Enter the spec URL

1. Paste the full URL to your OpenAPI/Swagger JSON file (e.g., `https://api.example.com/swagger/v3/swagger.json`)
2. Click **Import**

<!-- SCREENSHOT
id: spec-import-url-dialog
alt: Import from URL dialog with URL input field and Import button
page: /spec-manager
preconditions:
  - Import from URL dialog open
actions:
  - Paste a valid Swagger/OpenAPI URL
highlight: URL input field and Import button
annotations: Number labels for URL field and Import button
crop: modal
-->
[Screenshot: Import from URL dialog with URL input field and Import button]

### 3. Wait for processing

FlowForge downloads the spec and performs several operations:

- **Splits** the monolithic spec into individual per-endpoint Markdown files
- **Organizes** endpoints into resource folders (e.g., `articles/`, `categories/`)
- **Distills** each endpoint spec into an AI-optimized summary
- **Builds** a digest index for idea generation
- **Detects** path parameters and security schemes

### 4. Review the import results

After import completes, the **Import Result** modal shows:

- **Statistics** — Number of endpoints imported, files created, folders organized
- **Path parameters detected** — Any `{parameter}` placeholders found in endpoint paths are suggested as project variables (e.g., `{project_id}` becomes a suggested `project_id` variable)
- **Security schemes detected** — Auth methods found in the spec (e.g., OAuth 2.0, API key) are created as draft connections

<!-- SCREENSHOT
id: spec-import-result-modal
alt: Import Result modal showing import statistics, detected path parameters, and security schemes
page: /spec-manager
preconditions:
  - Import just completed
actions:
  - Wait for import to finish
highlight: Statistics section, path parameters list, and security schemes list
annotations: Labels for each section
crop: modal
-->
[Screenshot: Import Result modal showing import statistics, detected path parameters, and security schemes]

### 5. Configure detected settings

- **Path parameters**: Click to add them as project variables in Settings > Variables. These are needed at runtime when flows reference `{{proj.parameter_name}}`
- **Draft connections**: Go to Settings > Connections to fill in credentials for the auto-detected connections. Draft connections have the base URL and API version pre-filled from the spec but need your actual credentials

### 6. Browse the imported specs

The file tree now shows a version folder (e.g., `v3/`) containing resource subfolders, each with individual endpoint spec files. Click any file to view its contents in the right panel.

<!-- SCREENSHOT
id: spec-import-file-tree
alt: File tree showing imported spec files organized into version and resource folders
page: /spec-manager
preconditions:
  - Specs have been imported
actions:
  - Expand the version folder in the file tree
highlight: Version folder with resource subfolders and spec files
annotations: Labels for version folder, resource folder, and individual spec file
crop: panel-left
-->
[Screenshot: File tree showing imported spec files organized into version and resource folders]

## What gets created

| Item | Location | Purpose |
|---|---|---|
| Endpoint spec files | `v3/articles/create-article.md` | Per-endpoint API reference |
| Distilled specs | `_system/_distilled/` | AI-optimized summaries for flow generation |
| Digest | `_system/_digest.md` | Lightweight endpoint index for idea generation |
| Original spec | `_system/_swagger.json` | Backup of the imported OpenAPI file |
| Source manifest | `_sources.json` | Tracks import URL for future sync/reimport |

## Tips

- **Large specs**: FlowForge handles specs with hundreds of endpoints. The distillation and digest systems ensure AI operations stay efficient regardless of spec size.
- **Multiple versions**: You can import different API versions into separate version folders within the same project.
- **Re-importing**: If the API spec changes, use the reimport feature to update — see [How to reimport and sync spec files](../02-spec-manager/05-reimport-and-sync-spec-files.md).

## Related articles

- [How to upload spec files manually](../02-spec-manager/02-upload-spec-files.md) — Alternative to URL import
- [How to organize specs with version folders](../02-spec-manager/03-organize-specs-with-version-folders.md) — Managing multiple API versions
- [How to configure project variables](../06-settings-and-administration/03-configure-project-variables.md) — Setting up path parameter variables
- [How to create and manage connections](../05-connections-and-authentication/01-create-manage-connections.md) — Configuring detected auth schemes
