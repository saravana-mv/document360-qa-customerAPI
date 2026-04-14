# Flow Definition Schema

A **flow** is a named, ordered sequence of API calls that together verify a business scenario.
Each step can pass data forward to subsequent steps via **state variables**.

QA engineers write flow files; developers use them as the authoritative spec to generate test code.

---

## File naming

```
customer_api_endpoint_md_files/flows/{domain}/{flow-name}.flow.md
```

Examples:
```
flows/articles/full-article-crud-lifecycle.flow.md
flows/categories/category-crud.flow.md
```

---

## File structure

```
---                            ← YAML front-matter (flow metadata)
flow: <name>
entity: <domain entity>
description: <what this flow tests>
stop_on_failure: true|false    ← if a step fails, skip remaining steps
---

## Step N · <Step Name>        ← one H2 section per step

**Endpoint ref:** `<path to endpoint MD file>`
**Method:** GET | POST | PATCH | PUT | DELETE
**Path:** `/v3/...`

### Path Parameters
### Query Parameters
### Request Body
### Captures
### Assertions
### Notes (optional)

---                            ← horizontal rule separates steps
```

---

## Context variables

These are always available — they come from the test setup screen.

| Variable | Description |
|----------|-------------|
| `ctx.projectId` | Selected project UUID |
| `ctx.versionId` | Selected project version UUID |
| `ctx.langCode` | Language code (e.g. `en`) |
| `ctx.token` | Bearer token (injected automatically) |
| `ctx.baseUrl` | API base URL |

---

## State variables

State is flow-scoped: it starts empty and accumulates values as steps execute.

- **Capturing** — extract a value from a response and store it for later steps:
  ```
  | state.myVar | response.data.someField |
  ```
- **Using** — reference a captured value in a later step's params or body:
  ```
  {{state.myVar}}
  ```

State is declared in the **Captures** table of whichever step produces it,
and referenced with `{{state.*}}` in any subsequent step.

---

## Special interpolation tokens

| Token | Resolves to |
|-------|-------------|
| `{{ctx.projectId}}` | Project UUID from setup |
| `{{ctx.langCode}}` | Language code from setup |
| `{{state.*}}` | Value captured in a previous step |
| `{{timestamp}}` | Unix timestamp at execution time (for unique values) |
| `{{$index}}` | Zero-based step index |

---

## Assertions syntax

Each bullet is one assertion. Supported forms:

```
- Status 200
- Status 201
- Status 204
- Status 404
- Response has field `<fieldName>`
- Response field `<fieldName>` equals `{{state.myVar}}`
- Response field `<fieldName>` equals `true`
- Response array `data` is not empty
- Response field `success` equals `true`
```

---

## Step behaviour flags (optional Notes section)

| Flag | Meaning |
|------|---------|
| `optional: true` | Step is skipped if a precondition isn't met (no failure) |
| `teardown: true` | Step always runs even if earlier steps failed (cleanup) |
| `delay_ms: 500` | Wait N ms before executing this step |

---

## Full example (see flow files in `articles/`)

- `articles/full-article-crud-lifecycle.flow.md` — GET → PATCH title → GET verify → PATCH restore
- `articles/article-settings-flow.flow.md` — GET settings → PATCH toggle → PATCH restore
- `articles/version-management.flow.md` — GET versions → GET specific → DELETE draft → GET verify 404
- `articles/publish-unpublish-flow.flow.md` — GET statuses → PATCH workflow status → PATCH restore
- `articles/bulk-operations.flow.md` — PATCH bulk hide → GET verify → PATCH bulk restore
