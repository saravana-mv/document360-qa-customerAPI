---
flow: Article Settings Flow
group: Articles
description: >
  Reads the current article settings, toggles the allow_comments flag
  to its opposite value, then restores the original value — verifying
  the settings PATCH endpoint works without permanently changing anything.
stop_on_failure: true
---

## Step 1 · Get Article Settings

**Endpoint ref:** `articles/get-article-settings.md`
**Method:** GET
**Path:** `/v3/projects/{project_id}/articles/{article_id}/settings`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |

### Query Parameters
| Param | Value |
|-------|-------|
| `lang_code` | `ctx.langCode` |

### Request Body
_None_

### Captures
| State Variable | Source in Response |
|----------------|--------------------|
| `state.originalSettings` | `response.data` |
| `state.originalAllowComments` | `response.data.allow_comments` |

### Assertions
- Status 200

---

## Step 2 · Toggle allow_comments

**Endpoint ref:** `articles/update-article-settings.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/{article_id}/settings`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |

### Query Parameters
| Param | Value |
|-------|-------|
| `lang_code` | `ctx.langCode` |

### Request Body
```json
{
  "allow_comments": "{{!state.originalAllowComments}}"
}
```

> Only fields included in the body are modified — all other settings
> remain unchanged (partial update behaviour).

### Captures
| State Variable | Source |
|----------------|--------|
| `state.patchedAllowComments` | request body field `allow_comments` |

### Assertions
- Status 200
- Response field `allow_comments` equals `{{state.patchedAllowComments}}`

---

## Step 3 · Restore Original allow_comments

**Endpoint ref:** `articles/update-article-settings.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/{article_id}/settings`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |

### Query Parameters
| Param | Value |
|-------|-------|
| `lang_code` | `ctx.langCode` |

### Request Body
```json
{
  "allow_comments": "{{state.originalAllowComments}}"
}
```

### Captures
_None_

### Assertions
- Status 200

### Notes
- `teardown: true` — always restore the original value even if Step 2 failed.
