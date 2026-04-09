---
flow: Bulk Operations
group: Articles
description: >
  Hides the test article using the bulk update endpoint, reads it back
  to confirm the hidden flag changed, then restores it to visible —
  verifying the bulk PATCH endpoint works for a single article.
stop_on_failure: true
---

## Step 1 · Bulk Update — Set Hidden

**Endpoint ref:** `articles/bulk-update-articles.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/bulk`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |

### Query Parameters
_None_

### Request Body
```json
{
  "articles": [
    {
      "article_id": "{{ctx.articleId}}",
      "lang_code": "{{ctx.langCode}}",
      "hidden": true,
      "auto_fork": false
    }
  ]
}
```

> Each item in `articles` is independent. If one fails, others still
> apply. Check `response.data[].success` per item, not just top-level.

### Captures
_None_

### Assertions
- Status 200
- Response field `success` equals `true`

---

## Step 2 · Verify Article is Hidden

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
- Response field `hidden` equals `true`

---

## Step 3 · Bulk Update — Restore Visible

**Endpoint ref:** `articles/bulk-update-articles.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/bulk`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |

### Query Parameters
_None_

### Request Body
```json
{
  "articles": [
    {
      "article_id": "{{ctx.articleId}}",
      "lang_code": "{{ctx.langCode}}",
      "hidden": false,
      "auto_fork": false
    }
  ]
}
```

### Captures
_None_

### Assertions
- Status 200
- Response field `success` equals `true`

### Notes
- `teardown: true` — must run even if Step 2 failed to ensure the
  article is not left hidden after the test run.
