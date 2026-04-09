---
flow: Publish / Unpublish Flow
group: Articles
description: >
  Fetches the article and available workflow statuses, transitions the
  article to a different workflow status, then restores the original —
  verifying the workflow status PATCH endpoint works. Skipped gracefully
  if no workflow statuses are configured for the project.
stop_on_failure: true
---

## Step 1 · Get Article (capture current state)

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
| `state.projectVersionId` | `response.data.project_version_id` |
| `state.currentWorkflowStatusId` | `response.data.current_workflow_status_id` |

### Assertions
- Status 200

---

## Step 2 · Get Available Workflow Statuses

**Endpoint ref:** _(no dedicated MD file yet — endpoint: `GET /v3/projects/{project_id}/workflow-statuses`)_
**Method:** GET
**Path:** `/v3/projects/{project_id}/workflow-statuses`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |

### Query Parameters
_None_

### Request Body
_None_

### Captures
| State Variable | Source in Response |
|----------------|--------------------|
| `state.workflowStatuses` | `response.data` (array of status objects) |
| `state.targetStatusId` | First entry in `response.data` where `id !== state.currentWorkflowStatusId` |

### Assertions
- Status 200

### Notes
- `optional: true` — if `response.data` is empty, skip Steps 3 and 4
  (project has no workflow statuses configured).

---

## Step 3 · Transition to New Workflow Status

**Endpoint ref:** `articles/update-workflow-status-for-an-article.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/{article_id}/workflow-status`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |

### Query Parameters
_None_

### Request Body
```json
{
  "project_version_id": "{{state.projectVersionId}}",
  "lang_code": "{{ctx.langCode}}",
  "workflow_status_info": {
    "status_id": "{{state.targetStatusId}}"
  }
}
```

### Captures
_None_

### Assertions
- Status 200

### Notes
- `optional: true` — skip if Step 2 found no available target status.

---

## Step 4 · Restore Original Workflow Status

**Endpoint ref:** `articles/update-workflow-status-for-an-article.md`
**Method:** PATCH
**Path:** `/v3/projects/{project_id}/articles/{article_id}/workflow-status`

### Path Parameters
| Param | Value |
|-------|-------|
| `project_id` | `ctx.projectId` |
| `article_id` | `ctx.articleId` |

### Query Parameters
_None_

### Request Body
```json
{
  "project_version_id": "{{state.projectVersionId}}",
  "lang_code": "{{ctx.langCode}}",
  "workflow_status_info": {
    "status_id": "{{state.currentWorkflowStatusId}}"
  }
}
```

### Captures
_None_

### Assertions
- Status 200

### Notes
- `teardown: true` — always attempt to restore even if Step 3 failed.
- `optional: true` — skip if `state.currentWorkflowStatusId` is null
  (article had no workflow status to restore to).
