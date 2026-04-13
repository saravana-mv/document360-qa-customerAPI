# Prompt for Claude Code

## Context

This is an existing React SPA for running automated tests against the Document360 Customer API (v3). It's already deployed and working with OAuth2 (PKCE), a setup flow, and a basic test runner. The full project README is in `./README.md` — read it first to understand the current architecture, routing, stores, and conventions.

The OpenAPI spec is at `./document360.swagger.v3.json`. Read this file thoroughly before making any changes — it is the single source of truth for endpoint paths, request/response schemas, required fields, data types, and error formats.

**Do not change the existing tech stack, project structure conventions, OAuth flow, deployment config, or routing setup.** Build on top of what's already there.

---

## What Already Works

- React 19 + Vite 8 + TypeScript (strict) + Tailwind CSS v4
- Zustand stores: `auth.store.ts`, `spec.store.ts`, `setup.store.ts`, `runner.store.ts`
- React Router v7 with routes: `/` (login), `/callback` (OAuth), `/setup`, `/test`
- OAuth2 Authorization Code + PKCE flow (config in `src/config/oauth.ts`)
- JWT-based project detection (`doc360_project_id` claim)
- API client with Bearer auth and 429 retry (`src/lib/api/client.ts`)
- Test runner with sequential execution, shared `RunState`, teardown in `finally`, cancellation support (`src/lib/tests/runner.ts`)
- Test registry and explorer tree built from `buildParsedTagsFromRegistry()` — no spec fetch needed
- Assertion helpers in `src/lib/tests/assertions.ts`
- Test context builder in `src/lib/tests/context.ts`
- Existing articles suite (`src/lib/tests/suites/articles.suite.ts`) with 13 tests
- Explorer UI components: `TestExplorer`, `TagNode`, `EndpointNode`, `OperationNode`, `StatusIcon`
- Runner UI: `RunControls`, `LiveLog`, `ProgressBar`
- Results UI: `ResultsPanel`, `SummaryDrawer`
- Azure Static Web Apps deployment via GitHub Actions

---

## V1 Scope

For this iteration, focus **only** on these API tags: **Projects**, **ProjectVersions**, **Languages**, **Categories**, and **Articles**. Do not implement tests for Drive, Readers, Users, Translations, License, or ApiReferences — those will come in V2.

---

## Key API Patterns (from the OpenAPI spec)

**Base path:** All endpoints are under `/v3/projects/{project_id}/...` where `project_id` comes from the JWT claim.

**Success responses:** Wrapped in `{ data: T, success: true, request_id: string, errors: null, warnings: null }`. For bulk operations, `data` is an array of `BulkOperationResult` with per-item `success`, `index`, `id`, and `details` fields.

**Error responses:** Use RFC 7807 `V3ProblemDetails` with content type `application/problem+json`:
```typescript
{
  type: string,       // e.g. "https://developer.document360.com/errors/not-found"
  title: string,      // e.g. "Not Found."
  status: number,     // HTTP status code
  detail: string,     // Human-readable explanation
  trace_id: string,
  errors: Array<{ code: string, message: string, field: string | null, details: string | null }> | null,
  warnings: Array<{ code: string, message: string }> | null
}
```
Error codes to test: `UNAUTHORIZED` (401), `FORBIDDEN` (403), `RESOURCE_NOT_FOUND` (404), `CONFLICT` (409 — on fork when draft exists), `VALIDATION_ERROR` (422), `TOO_MANY_REQUESTS` (429), `INTERNAL_SERVER_ERROR` (500).

**Pagination:** List endpoints support `page`, `page_size`, `cursor`, and `include_total_count` query parameters. Response includes `pagination: { page, page_size, total_count, has_more, next_cursor }`.

**Partial updates:** PATCH endpoints only modify fields included in the request body. Omitted fields remain unchanged.

**auto_fork:** Article and category update endpoints support `auto_fork: true` which automatically creates a draft version when the target is published, instead of returning 422.

---

## New Test Suites

Add new suite files in `src/lib/tests/suites/` following the same patterns as `articles.suite.ts`. Each suite should register its tests with the existing test registry. Use the existing `RunState` pattern to pass data between steps within a chain.

---

### Articles Suites

#### `article-crud.suite.ts` — Full Article CRUD Lifecycle
The spec confirms `POST /v3/projects/{project_id}/articles` exists and returns 201.
1. Create a new article → assert 201, `data.id` exists, `data.title` matches, `data.status` is `draft`, `data.version_number` is 1
2. Get article by ID → assert 200, fields match, `data.content`, `data.html_content`, `data.category_id` present
3. Get article with `content_mode=display` → assert 200, verify `html_content` is rendered
4. Get article with `published=true` → verify behaviour for unpublished article
5. Update article (change title, content) → assert 200, updated fields in response
6. Get article again → assert updated values persisted
7. Delete article → assert 204 (no body)
8. Get deleted article → assert 404 with `V3ProblemDetails` shape, error code `RESOURCE_NOT_FOUND`
**Teardown:** If the test fails partway and the article was created, delete it.

#### `article-versioning.suite.ts` — Version & Fork Lifecycle
1. Create article → assert 201, note `version_number: 1`
2. Publish article → assert 200 (`{ success: true }`)
3. Fork article (`POST .../fork`) → assert 201, new `version_number`, `status` is `draft`
4. Fork again (should conflict) → assert 409 with error code `CONFLICT`
5. List versions (`GET .../versions`) → assert 200, both versions present, check pagination shape
6. Get specific version by number → assert 200, verify `version_number` matches
7. Update draft version (with explicit `version_number`) → assert 200
8. Delete draft version → assert 204
9. List versions again → assert only published version remains
10. Unpublish → assert 200
11. Delete article → assert 204
**Teardown:** Delete article.

#### `article-settings.suite.ts` — Article Settings
1. Create article
2. Get settings (`GET .../settings`) → assert 200, verify `ArticleSettingsResponse` shape: slug, seo_title, description, allow_comments, show_table_of_contents, tags, status_indicator, exclude flags, related_articles, is_acknowledgement_enabled, url
3. Update settings — change seo_title, description, tags, allow_comments, show_table_of_contents, exclude flags, status_indicator → assert 200
4. Get settings → verify all changes persisted
5. Restore original settings → assert 200
6. Delete article
**Teardown:** Delete article.

#### `article-workflow.suite.ts` — Workflow Status
1. Fetch workflow statuses (`GET .../workflow-statuses`) → note IDs
2. If none configured, skip chain with descriptive message
3. Create article
4. Update workflow status (`PATCH .../workflow-status`) with valid status ID → assert 200
5. Get article → verify `current_workflow_status_id` changed
6. Update workflow with invalid status ID → assert 422
7. Delete article
**Teardown:** Delete article.

#### `article-publishing.suite.ts` — Publish/Unpublish Flow
1. Create article (draft)
2. Publish with `version_number: 1` → assert 200
3. Get article → verify published state
4. Get article with `published=true` → should return published content
5. Unpublish → assert 200
6. Get article → verify draft/unpublished state
7. Publish again → assert 200
8. Delete article
**Teardown:** Delete article.

#### `article-bulk.suite.ts` — Bulk Operations
1. Bulk create 3 articles (`POST .../articles/bulk`) → assert 201, `data` array has 3 items, each `success: true`, `id` not null, `index` matches position
2. Bulk update all 3 (`PATCH .../articles/bulk`) — change titles → assert 200, per-item success
3. Get each individually → verify titles updated
4. Bulk publish all 3 → assert 200
5. Bulk unpublish all 3 → assert 200
6. Bulk delete all 3 (`DELETE .../articles/bulk`) → assert 200, per-item success
7. Get each → assert 404
**Teardown:** Best-effort bulk delete of any created articles.

#### `article-bulk-versions.suite.ts` — Bulk Version Delete
1. Create article, publish, fork (creates draft v2)
2. List versions → note version numbers
3. Bulk delete versions (`DELETE .../articles/bulk/versions?article_id=X&version_numbers=...`) for draft versions → assert 200
4. List versions → verify deleted versions gone
5. Delete article
**Teardown:** Delete article.

---

### Categories Suites

#### `category-crud.suite.ts` — Full Category CRUD Lifecycle
The spec confirms `POST /v3/projects/{project_id}/categories` exists.
1. Create category → assert 201, response has `id`, `name`, `order`
2. Get category by ID → assert 200, verify `name`, `description`, `articles`, `child_categories` fields
3. Update category (`PATCH`) — change name, order, icon → assert 200
4. Get category → verify updates persisted
5. Create child category (nested under parent using `parent_category_id`) → assert 201
6. Get parent category → verify `child_categories` includes child
7. Delete child → assert 204
8. Delete parent → assert 204
9. Get deleted category → assert 404
**Teardown:** Delete categories.

#### `category-content.suite.ts` — Category Content & Versions
1. Create category with initial content
2. Get content (`GET .../content`) → assert 200, verify `content`, `html_content`, `version_number`
3. Get content with `content_mode=display` → assert rendered HTML
4. Get content with `published=true` → verify behaviour for unpublished
5. Update content (`PATCH .../content`) → assert 200
6. Get content → verify update persisted
7. Fork category (`POST .../fork`) → assert 201
8. Fork again → assert 409 `CONFLICT`
9. List versions (`GET .../versions`) → assert multiple versions, check pagination shape
10. Get specific version → assert 200
11. Delete draft version → assert 204
12. Delete category
**Teardown:** Delete category.

#### `category-settings.suite.ts` — Category Settings
1. Create category
2. Get settings → assert 200, verify shape: slug, seo_title, description, allow_comments, show_table_of_contents, tags, status_indicator, exclude flags, is_acknowledgement_enabled
3. Update settings → assert 200
4. Get settings → verify persistence
5. Delete category
**Teardown:** Delete category.

#### `category-publishing.suite.ts` — Category Publish/Unpublish
1. Create category with content
2. Publish (`POST .../publish`) → assert 200
3. Get content with `published=true` → verify published content
4. Unpublish (`POST .../unpublish`) → assert 200
5. Delete category
**Teardown:** Delete category.

#### `category-bulk.suite.ts` — Category Bulk Operations
1. Bulk create 2 categories (`POST .../categories/bulk`) → assert 201
2. Update content for both (`PATCH .../categories/bulk/content`) → assert 200
3. Bulk publish both → assert 200
4. Bulk unpublish both → assert 200
5. Delete categories individually (no bulk delete endpoint for categories in spec)
**Teardown:** Delete categories.

#### `category-workflow.suite.ts` — Category Workflow
1. Fetch workflow statuses (skip if none)
2. Create category
3. Update workflow status (`PATCH .../workflow-status`) → assert 200
4. Delete category
**Teardown:** Delete category.

---

### Projects & Infrastructure Suites

#### `projects.suite.ts` — Project Endpoints
1. Get all projects (`GET /v3/projects`) → assert 200, verify pagination shape
2. Get current project by ID → assert 200, verify `name`, `description`, `sub_domain_name`, `status`
3. Get project with non-existent UUID → assert 404

#### `project-versions.suite.ts` — Project Version Endpoints
1. Get all versions (`GET .../project-versions`) → assert 200, verify items have `id`, `name`, `slug`, `order`, `is_default`, `version_type`
2. Get specific version by ID → assert 200, verify extra fields: `language_code`, `enable_rtl`
3. Get version with non-existent UUID → assert 404
4. Get categories within version → assert 200, verify hierarchical shape with `child_categories`
5. Get articles within version → assert 200, verify pagination

#### `languages.suite.ts` — Language Endpoints
1. Get languages (`GET .../languages`) → assert 200, verify items have `code`, `name`, `is_default`
2. Verify at least one language with `is_default: true`
3. Get languages with specific `project_version_id` query param → assert 200

---

### Error & Edge Case Suites

#### `error-conditions.suite.ts` — Cross-Endpoint Error Cases
Parameterised tests:

**404 Not Found:**
- GET/PATCH/DELETE article with non-existent UUID → 404, `RESOURCE_NOT_FOUND`
- GET/PATCH/DELETE category with non-existent UUID → 404
- GET project with non-existent UUID → 404
- GET project version with non-existent UUID → 404

**422 Validation:**
- Create article missing required `title` → 422, `VALIDATION_ERROR` with `field: "title"`
- Create article missing `project_version_id` → 422
- Create category missing `name` → 422
- Create category missing `project_version_id` → 422
- Update article with `auto_fork: false` on published version → 422
- Bulk create with item missing required fields → partial failure

**400 Bad Request:**
- Send malformed JSON body to PATCH article → 400

**409 Conflict:**
- Fork article that already has draft → 409, `CONFLICT`
- Fork category that already has draft → 409, `CONFLICT`

**Boundary Tests:**
- Create article with very long title (10,000 chars)
- Create article with special characters (unicode, emoji, HTML)
- Bulk create with 101 items (over max 100) → check rejection
- Pagination: `page_size=0`, `page_size=101`
- List versions with `include_total_count=true` → verify `total_count` populated

#### `auth-errors.suite.ts` — Authentication Failure Cases
Make isolated fetch calls with overridden headers (do NOT modify stored token):
1. GET request with no Authorization header → 401, `UNAUTHORIZED`, check `WWW-Authenticate` header
2. GET request with `Authorization: Bearer invalid-token` → 401
3. POST request with no auth → 401

---

## Data Factories (`src/lib/tests/factories.ts`)

Create a factories module derived from the OpenAPI spec schemas:

```typescript
// Articles
function createArticlePayload(overrides?: Partial<CreateArticleRequest>): CreateArticleRequest
function updateArticlePayload(overrides?: Partial<UpdateArticleRequest>): UpdateArticleRequest
function publishPayload(versionNumber: number): PublishRequest
function unpublishPayload(versionNumber: number): UnpublishRequest
function updateArticleSettingsPayload(overrides?: Partial<UpdateArticleSettingsRequest>): UpdateArticleSettingsRequest
function updateWorkflowPayload(statusId: string): UpdateWorkflowRequest

// Categories
function createCategoryPayload(overrides?: Partial<CreateCategoryRequest>): CreateCategoryRequest
function updateCategoryPayload(overrides?: Partial<UpdateCategoryRequest>): UpdateCategoryRequest
function updateCategoryContentPayload(overrides?: Partial<UpdateCategoryContentRequest>): UpdateCategoryContentRequest
function updateCategorySettingsPayload(overrides?: Partial<UpdateCategorySettingsRequest>): UpdateCategorySettingsRequest

// Error testing
function invalidArticlePayloads(): Array<{ name: string; payload: unknown; expectedStatus: number; expectedErrorCode: string }>
function invalidCategoryPayloads(): Array<{ name: string; payload: unknown; expectedStatus: number; expectedErrorCode: string }>
```

All factory functions should source `project_version_id` and `category_id` from the test context (setup store). Article/category names should always include `[QA Test]` prefix and `Date.now()` for uniqueness.

---

## API Client Expansion

Expand existing API client modules to cover all V1 endpoints:

**`src/lib/api/articles.ts`** — add missing methods:
- `createArticle`, `deleteArticle`
- `forkArticle`, `publishArticle`, `unpublishArticle`
- `getArticleSettings`, `updateArticleSettings`
- `updateWorkflowStatus`
- `bulkCreateArticles`, `bulkUpdateArticles`, `bulkDeleteArticles`
- `bulkPublishArticles`, `bulkUnpublishArticles`
- `bulkDeleteArticleVersions`

**`src/lib/api/categories.ts`** — replace placeholder:
- CRUD: `createCategory`, `getCategory`, `updateCategory`, `deleteCategory`
- Content: `getCategoryContent`, `updateCategoryContent`
- Settings: `getCategorySettings`, `updateCategorySettings`
- Versions: `listCategoryVersions`, `getCategoryVersion`, `deleteCategoryVersion`
- Workflow: `updateCategoryWorkflowStatus`
- Fork: `forkCategory`
- Publish: `publishCategory`, `unpublishCategory`
- Bulk: `bulkCreateCategories`, `bulkUpdateCategoryContent`, `bulkPublishCategories`, `bulkUnpublishCategories`, `bulkDeleteCategoryVersions`

**`src/lib/api/projects.ts`** — add:
- `getProjects`, `getProject`
- `getWorkflowStatuses`, `getSsoSchemes`
- `getLanguages`

**`src/lib/api/project-versions.ts`** — add:
- `getProjectVersions`, `getProjectVersion`
- `getVersionCategories`, `getVersionArticles`

---

## Assertion Enhancements (`src/lib/tests/assertions.ts`)

Add assertion helpers for new test patterns:

```typescript
// Assert V3ProblemDetails shape
function assertProblemDetails(response, expectedStatus: number, expectedErrorCode?: string)

// Assert bulk operation results
function assertBulkSuccess(response, expectedCount: number)
function assertBulkPartialFailure(response, expectedSuccessCount: number, expectedFailureCount: number)

// Assert pagination shape
function assertPagination(response, expectations?: { hasMore?: boolean; pageSize?: number })

// Assert field value at path
function assertFieldEquals(data: unknown, path: string, expected: unknown)

// Assert field type at path
function assertFieldType(data: unknown, path: string, expectedType: 'string' | 'number' | 'boolean' | 'array' | 'object')
```

---

## UI Enhancements

### Enhance the Test Page (`/test`)

**Chained test visualisation:**
- Show a vertical connector line between steps within a chain to communicate dependency
- When a step fails, visually distinguish failed (red) from skipped downstream steps (amber with "skipped due to prior failure" label)

**Expanded step detail view:**
- When expanding a completed step, show:
  - Full request: method, URL, headers (token redacted), body (formatted JSON)
  - Full response: status, headers, body (formatted JSON)
  - Duration in ms
  - All assertions with pass/fail, expected vs actual
- Monospace font for JSON
- "Copy as cURL" button (with token placeholder)

**Live log improvements:**
- Timestamps on each entry
- Colour-code: green pass, red fail, amber skip, grey info
- Filter to show only failures
- Auto-scroll to latest, but stop if user scrolls up

### Enhance the Results Panel

**Run summary:**
- Total: passed / failed / skipped / errors
- Total duration
- Breakdown by suite: collapsible section per suite with its own counts and duration
- Highlight slowest and fastest tests

**Export:**
- "Export as JSON" — full run results with all steps, assertions, request/response
- "Export as Markdown" — human-readable test report

### Enhance the Setup Page (`/setup`)

- Add "Delay between API calls" input (default 500ms) — stored in `setup.store.ts`, used by runner
- Add "Request timeout" input (default 30000ms) — used by API client
- Show summary of available suites and test counts
- Add "Test Connection" button that makes a lightweight GET call to verify token validity

### Dark Mode

- Default to dark mode
- Light/dark toggle in `TopBar`
- Store preference in localStorage
- Use Tailwind dark mode (`dark:` variants) or CSS variables

---

## Implementation Guidelines

1. **Follow existing patterns exactly.** Match the style of `articles.suite.ts`, `runner.ts`, `assertions.ts`. New suites should be indistinguishable from existing code.
2. **The OpenAPI spec is authoritative.** If this prompt conflicts with the spec, trust the spec. If an endpoint doesn't exist, add a `// TODO: endpoint not in spec` comment and skip.
3. **Cleanup always runs.** Use `try/finally`. Every chain that creates resources must delete them, even on failure.
4. **Timestamped names.** All test-created resources use `[QA Test] ${Date.now()}` naming for uniqueness and easy identification.
5. **Handle rate limiting.** The existing API client handles 429 retries. The configurable delay should be integrated into the runner's sequential execution loop.
6. **TypeScript strict.** All new code must satisfy the existing strict configuration. Define proper types for all payloads, factory outputs, and chain state.
7. **No new dependencies** unless absolutely necessary. If needed, add a comment explaining why.
8. **Register all new suites.** Ensure tests are imported and registered in the test registry so they appear in the explorer.

## OpenAPI Spec

The full OpenAPI spec is located at `./document360.swagger.v3.json`. Read this file first before writing any code. Use it as the single source of truth for:

- Exact endpoint paths, HTTP methods, and query parameters
- Request body schemas (required fields, data types, enums, constraints)
- Response schemas for each status code (200, 201, 204, 400, 401, 404, 409, 422, etc.)
- Authentication method and required headers

**Before writing any code**, read the OpenAPI spec thoroughly and:
1. Generate the API client wrapper methods directly from the spec — match every parameter, field name, and type exactly.
2. Build the data factories based on the spec's schema definitions — use the spec's required/optional field annotations to know what valid vs invalid payloads look like.
3. Base the assertion checks on the spec's response schemas — verify that response bodies conform to the documented shapes.
4. Use the spec's documented error response formats (`V3ProblemDetails`) to write accurate error condition tests.
5. If the spec documents additional endpoints or parameters beyond what's described in this prompt, incorporate those into the test chains as well.
6. **The OpenAPI spec is authoritative** — if anything in this prompt conflicts with the spec (endpoint paths, field names, required parameters, available operations), trust the spec.
