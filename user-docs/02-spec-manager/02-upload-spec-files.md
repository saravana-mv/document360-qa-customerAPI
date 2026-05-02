# How to upload spec files manually

If your API spec isn't available at a public URL, you can upload files directly into FlowForge using drag-and-drop or the upload dialog.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected
- API spec files in a supported format (Markdown, JSON, or OpenAPI/Swagger)

## Steps

### 1. Open the upload area

In the **Spec Manager**, you can upload files in two ways:

- **Drag and drop** — Drag files from your file explorer directly onto the file tree panel
- **Upload button** — Click the **Upload** button in the toolbar above the file tree

<!-- SCREENSHOT
id: spec-upload-button
alt: Spec Manager toolbar with Upload button highlighted
page: /spec-manager
preconditions:
  - Logged in as QA Engineer or above
  - Project selected
actions:
  - Navigate to Spec Manager
highlight: Upload button in toolbar
annotations: Arrow pointing to Upload button
crop: panel-left
-->
[Screenshot: Spec Manager toolbar with Upload button highlighted]

### 2. Select files to upload

In the upload dialog:

1. Click to browse or drag files into the drop zone
2. Select one or more files
3. Choose the target folder in the file tree (or upload to root)
4. Click **Upload**

<!-- SCREENSHOT
id: spec-upload-dialog
alt: Upload dialog with drag-and-drop zone and file list
page: /spec-manager
preconditions:
  - Upload dialog open
actions:
  - Click Upload button
  - Drag files into the dialog
highlight: Drop zone and file list
annotations: Labels for drop zone, file list, and target folder selector
crop: modal
-->
[Screenshot: Upload dialog with drag-and-drop zone and file list]

### 3. Upload an OpenAPI/Swagger file

If you upload a `.json` file that contains an OpenAPI 3.x or Swagger 2.0 specification, FlowForge offers to **split** it automatically — the same processing that happens with URL import:

- Splits into per-endpoint Markdown files
- Organizes into resource folders
- Creates distilled specs and digest
- Detects path parameters and security schemes

> **Tip:** If you just want to store the file as-is without splitting, you can decline the split and upload it as a reference document.

### 4. Upload individual spec files

You can also upload individual Markdown (`.md`) files. These are useful for:

- Custom endpoint documentation not in your OpenAPI spec
- Test notes or reference materials
- Manually authored spec files for endpoints that aren't in the spec

### 5. Verify the upload

After upload, the files appear in the file tree. Click any file to preview its contents in the right panel.

## Supported file types

| Type | Extension | Behavior |
|---|---|---|
| OpenAPI/Swagger | `.json` | Optionally split into per-endpoint files |
| Markdown | `.md` | Uploaded as-is |
| JSON | `.json` | Uploaded as-is (if not a valid OpenAPI spec) |

## Moving uploaded files

After upload, you can reorganize files by **dragging and dropping** them within the file tree:

- Drag a file onto a folder to move it
- Drag a folder onto another folder to nest it
- The underlying blob storage paths are updated automatically

## Tips

- **Batch upload**: You can select and upload multiple files at once.
- **Folder creation**: Create new folders via the context menu (right-click or "..." on a folder) before uploading.
- **Version organization**: Upload files into version folders to keep different API versions separate.

## Related articles

- [How to import API specs from an OpenAPI URL](../02-spec-manager/01-import-specs-from-url.md) — Faster import from a URL
- [How to organize specs with version folders](../02-spec-manager/03-organize-specs-with-version-folders.md) — Structuring your spec library
- [How to browse and search spec files](../02-spec-manager/04-browse-and-search-spec-files.md) — Finding files after upload
