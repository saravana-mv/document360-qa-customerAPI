# How to browse and search spec files

The Spec Manager provides a file tree for navigating your API specifications and a viewer for reading endpoint details.

## Prerequisites

- Logged in with any role (Member or above)
- A project selected with imported specs

## Browsing the file tree

### Expanding and collapsing folders

- Click the **arrow icon** next to a folder to expand or collapse it
- Use **keyboard arrow keys** to navigate the tree
- The tree remembers your expansion state between sessions

### Viewing a file

Click any spec file in the tree to open it in the right panel's **Viewer** tab. The viewer displays the Markdown content with formatted headings, tables, and code blocks.

<!-- SCREENSHOT
id: spec-browse-viewer
alt: Spec Manager with a file selected in the tree and its content displayed in the Viewer tab
page: /spec-manager
preconditions:
  - Specs imported
  - A version folder expanded
actions:
  - Click on a spec file in the tree
highlight: Selected file in tree and content in Viewer tab
annotations: Labels for file tree selection and Viewer tab content
crop: main-content
-->
[Screenshot: Spec Manager with a file selected in the tree and its content displayed in the Viewer tab]

### File tree visual indicators

| Indicator | Meaning |
|---|---|
| Folder icon | Regular folder (version or resource) |
| File icon | Spec file (Markdown) |
| Lock icon + muted text | System file (read-only, auto-generated) |
| Greyscale icons | Standard tree icons are always greyscale, `w-4 h-4` size |

### Context menu actions

Right-click (or click the "..." button) on any file or folder to access actions:

| Action | Available on | Description |
|---|---|---|
| **New Folder** | Folders | Create a subfolder |
| **Rename** | Files and folders | Change the name |
| **Delete** | Files and folders | Remove the item |
| **Move** | Files and folders | Also available via drag-and-drop |

<!-- SCREENSHOT
id: spec-context-menu
alt: Context menu showing available actions on a spec file
page: /spec-manager
preconditions:
  - Specs imported
actions:
  - Right-click on a spec file in the tree
highlight: Context menu dropdown
annotations: Labels for each menu option
crop: panel-left
-->
[Screenshot: Context menu showing available actions on a spec file]

> **Note:** System files (`_system/` folder contents) do not show a context menu — they cannot be renamed, moved, or deleted.

## Searching spec files

FlowForge includes a search feature in the Spec Manager for finding files across your spec library.

1. Click the **search icon** in the toolbar or use the search input above the file tree
2. Type your search query (endpoint name, HTTP method, path, etc.)
3. Results filter the file tree in real time, showing matching files
4. Click a result to view the file

<!-- SCREENSHOT
id: spec-search
alt: Spec Manager search showing filtered results in the file tree
page: /spec-manager
preconditions:
  - Specs imported
  - Multiple folders with specs
actions:
  - Click search icon or focus search input
  - Type a search term like "create" or "article"
highlight: Search input and filtered results
annotations: Arrow pointing to search input and matching files
crop: panel-left
-->
[Screenshot: Spec Manager search showing filtered results in the file tree]

## Viewing different file types

The right panel adapts based on the file type:

| File type | Viewer |
|---|---|
| Markdown (`.md`) | Formatted Markdown viewer |
| JSON (`.json`) | Read-only CodeMirror JSON viewer |
| Flow XML (`.flow.xml`) | CodeMirror XML viewer with syntax highlighting |

## Understanding spec file content

Each endpoint spec file contains:

- **Endpoint** — HTTP method and URL path (e.g., `POST /v3/articles`)
- **Description** — What the endpoint does
- **Parameters** — Path, query, and header parameters with types
- **Request body** — Schema for POST/PUT/PATCH requests, including required fields
- **Response codes** — Expected status codes with response body schemas
- **Examples** — Sample request/response data when available

This information is what AI uses to generate test ideas and flow definitions.

## Tips

- **Select folders for AI operations**: When you select a folder (not just a file), the Ideas and Flows tabs become available for generating test content for all endpoints in that folder.
- **System files for debugging**: If AI-generated flows seem incorrect, check the `_system/_distilled/` files to see what the AI is working with.
- **Tree state persists**: Your folder expansion state and selected file are saved in local storage and restored when you return.

## Related articles

- [How to import API specs from an OpenAPI URL](../02-spec-manager/01-import-specs-from-url.md) — Getting specs into the tree
- [How to generate test ideas from API specs](../03-ideas-and-flows/01-generate-test-ideas.md) — Using specs for AI idea generation
- [How to organize specs with version folders](../02-spec-manager/03-organize-specs-with-version-folders.md) — Folder structure explained
