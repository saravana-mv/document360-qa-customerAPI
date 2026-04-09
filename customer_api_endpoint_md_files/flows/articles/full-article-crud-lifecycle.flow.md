---
flow: Full Article CRUD Lifecycle
group: Articles
description: >
  Reads the test article to capture its current title and content,
  applies a timestamped title change to verify the PATCH endpoint works,
  reads back to confirm the change took effect, then restores the
  original title — leaving the article exactly as it was found.
stop_on_failure: true
---

## Step 1 · Get Single Article

**Endpoint ref:** `articles/get-an-article-by-id.md`
**Method:** GET
**Path:** `/v3/projects/{project_id}/articles/{article_id}`

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
| `state.originalTitle` | `response.data.title` |
| `state.originalContent` | `response.data.content` |
| `state.originalArticle` | `response.data` |

### Assertions
- Status 200
- Response has field `title`

---

## Step 2 · Update Article Title

**Endpoint ref:** `articles/update-an-article.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/{article_id}`

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
  "title": "[TEST] {{state.originalTitle}} - {{timestamp}}",
  "content": "{{state.originalContent}}",
  "auto_fork": true
}
```

> `auto_fork: true` — if the article version is published, the API
> automatically creates a new draft and applies the update to it.
> Without this flag, updating a published version returns 422.

### Captures
| State Variable | Source |
|----------------|--------|
| `state.testTitle` | request body field `title` (the value sent) |

### Assertions
- Status 200

---

## Step 3 · Verify Title Was Updated

**Endpoint ref:** `articles/get-an-article-by-id.md`
**Method:** GET
**Path:** `/v3/projects/{project_id}/articles/{article_id}`

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
_None_

### Assertions
- Status 200
- Response field `title` equals `{{state.testTitle}}`

---

## Step 4 · Restore Original Title

**Endpoint ref:** `articles/update-an-article.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/{article_id}`

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
  "title": "{{state.originalTitle}}",
  "content": "{{state.originalContent}}",
  "auto_fork": true
}
```

### Captures
_None_

### Assertions
- Status 200

### Notes
- `teardown: true` — this step must run even if Steps 2 or 3 failed,
  to ensure the article is not left with a test title.
