---
flow: Version Management
group: Articles
description: >
  Lists all versions of the test article, fetches the first version in
  detail, then optionally deletes a draft version (skipped safely if no
  draft exists) and verifies it returns 404 afterwards.
stop_on_failure: true
---

## Step 1 · List Article Versions

**Endpoint ref:** `articles/list-versions-of-an-article.md`
**Method:** GET
**Path:** `/v3/projects/{project_id}/articles/{article_id}/versions`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |

### Query Parameters
_None_

### Request Body
_None_

### Captures
| State Variable | Source in Response |
|----------------|--------------------|
| `state.versions` | `response.data` (array of version objects) |
| `state.firstVersionNumber` | `response.data[0].version_number` |

### Assertions
- Status 200
- Response array `data` is not empty

---

## Step 2 · Get Specific Article Version

**Endpoint ref:** `articles/get-a-specific-version-of-an-article.md`
**Method:** GET
**Path:** `/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |
| `version_number` | `{{state.firstVersionNumber}}` |

### Query Parameters
_None_

### Request Body
_None_

### Captures
_None_

### Assertions
- Status 200

---

## Step 3 · Delete Draft Version

**Endpoint ref:** `articles/delete-a-specific-article-version.md`
**Method:** DELETE
**Path:** `/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |
| `version_number` | `{{state.draftVersionNumber}}` |

> `state.draftVersionNumber` is derived at runtime by scanning
> `state.versions` for the first entry where `is_draft === true`.
> If no draft version exists this step is skipped gracefully.

### Query Parameters
_None_

### Request Body
_None_

### Captures
| State Variable | Source |
|----------------|--------|
| `state.deletedVersionNumber` | path param `version_number` used in request |

### Assertions
- Status 204

### Notes
- `optional: true` — skip if `state.versions` contains no draft entry.

---

## Step 4 · Verify Deleted Version Returns 404

**Endpoint ref:** `articles/get-a-specific-version-of-an-article.md`
**Method:** GET
**Path:** `/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |
| `version_number` | `{{state.deletedVersionNumber}}` |

### Query Parameters
_None_

### Request Body
_None_

### Captures
_None_

### Assertions
- Status 404

### Notes
- `optional: true` — skip if Step 3 was skipped (no draft was deleted).
