# FlowForge Architecture

Deep reference for developers working on the FlowForge codebase. For quick-start and conventions, see [CLAUDE.md](CLAUDE.md).

---

## Data Flow

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌───────────────┐
│  Spec Files  │───>│  AI Ideas    │───>│  Flow XML    │───>│  Test Runner  │
│  (Blob)      │    │  (Cosmos)    │    │  (Cosmos)    │    │  (Browser/API)│
└─────────────┘    └──────────────┘    └──────────────┘    └───────────────┘
     Upload/         Claude AI          Chat/batch           Activate →
     Import URL      generation         generation           Execute →
                                        + validation         Results (Cosmos)
```

1. **Spec Import** — Upload markdown files, import from URLs (with sync-from-source), or split full OpenAPI/Swagger specs into per-endpoint files
2. **Idea Generation** — Claude analyzes spec context (digest for large folders >20 specs, full distilled for small) and proposes test ideas
3. **Flow Authoring** — Interactive chat or batch generation produces `.flow.xml` files, validated against XSD
4. **Test Execution** — Activated flows are parsed into TestDef arrays at runtime (no code generation), executed with setup/teardown semantics

---

## Frontend Architecture

### Pages

| Page | File | Purpose |
|------|------|---------|
| Project Selection | `src/pages/ProjectSelectionPage.tsx` | Full-screen tile grid — first screen after login, create project, team/personal visibility |
| Spec Manager | `src/pages/SpecFilesPage.tsx` | Central hub — spec files, AI workshop (ideas + flows), flow chat panel |
| Scenario Manager | `src/pages/TestPage.tsx` | Version accordions, folder tree, test runner, run history |
| Settings | `src/pages/SettingsPage.tsx` | Tabs: General, API Keys (qa_manager+), Variables (qa_manager+), Connections (qa_manager+), Members (project_owner+), Users (owner), Audit Log (qa_manager+) |
| Variables | `src/pages/ProjectVariablesPage.tsx` | Project-level key/value variables (qa_manager+), `proj.varName` interpolation |
| Connections | `src/pages/ConnectionsPage.tsx` | Centralized connection management — all auth types with provider badges, OAuth status indicators |
| Members | `src/pages/MembersPage.tsx` | Per-project member list, add/remove members, role assignment |
| Audit Log | `src/pages/AuditLogPage.tsx` | Full audit viewer with filters and pagination |
| Users | `src/pages/UsersPage.tsx` | Team management, role assignment |

### Zustand Stores

| Store | Key State | Notes |
|-------|-----------|-------|
| `auth.store` | `status`, `token`, `projectId` | Entra ID session. Auto-authenticates after Entra (no separate API login gate). |
| `setup.store` | `selectedProjectId`, `aiModel`, `baseUrl`, `apiVersion` | Persisted to Cosmos `/settings`. `apiVersion` rewrites all request paths. D360-specific fields (`selectedVersionId`, `langCode`) removed — use project variables instead. |
| `user.store` | `user`, `role`, `status` | Roles: owner / project_owner / qa_manager / qa_engineer / member. `AccessGate` enforces. |
| `flowStatus.store` | `byName: Record<string, FlowStatusEntry>` | Flow activation state. Must finish loading before TestExplorer builds tags. |
| `runner.store` | `running`, `paused`, `pausedAt`, `tagResults`, `log[]` | Test execution. Breakpoints stored separately. |
| `scenarioOrg.store` | `versionConfigs`, `folders`, `placements`, `scenarioConfigs`, `detectedEndpoint` | Single `__scenario_org__` doc in Cosmos. Per-version config, per-scenario env overrides (`ScenarioEnvOverride`), auto-detected endpoint from OpenAPI specs. |
| `explorerUI.store` | `expandedVersions`, `expandedFolders`, `rearrangeMode` | UI-only state for tree expansion and drag-drop mode. |
| `aiCost.store` | `workshopCostUsd`, `adhocCostUsd` | Every AI call must report here. TopBar shows total. |
| `breakpoints.store` | `ids: Set<testId>` | Per-step pause/resume. Persisted in localStorage. |
| `aiCredits.store` | `projectCredits`, `userCredits`, `loading` | Loads project + user credit budgets/usage from `/api/ai-credits`. Refreshed after cost events. |
| `project.store` | `projects`, `selectedProject`, `loading` | Project list, selection, CRUD. ProjectPicker in TopBar. |
| `entraAuth.store` | `tenant`, `clientId`, `redirectUri` | Entra ID configuration. |
| `projectVariables.store` | `variables`, `loading` | Project-level key/value pairs. Loaded from `/api/project-variables`. Used as `{{proj.varName}}` in flow XML interpolation and `{name}` path parameter resolution. |
| `connections.store` | `connections`, `authStatus`, `healthChecks`, `loading` | Connection CRUD via `/api/connections`. `fetchAllStatuses()` polls OAuth connections only (token-based don't need status). Health check support. |

### Component Organization

```
src/components/
├── auth/           # EntraGate (SSO wrapper), ProjectGate (project selection guard), AccessGate (role check), LoginScreen, OAuthCallback
├── common/         # Layout, TopBar, SideNav, Modal, ContextMenu, XmlCodeBlock, XmlEditor, ResizeHandle, ProjectPicker
├── specfiles/      # FileTree (with _system and _distilled folder support: isSystem flag, lock icon, read-only), FlowChatPanel, FlowIdeasPanel, FlowsPanel, DetailPanel, ImportFromUrlModal, ImportResultModal (post-import stats + variable/connection auto-detect + processing health banner), FolderRulesPanel, NewVersionModal
├── connections/    # ConnectionFormModal (provider-specific fields, ProviderBadge), ConnectionsPage
├── explorer/       # TestExplorer, VersionAccordion, ScenarioFolderTree, TagNode, ConnectEndpointModal (simplified: Base URL + Connection picker), ScenarioEnvOverrideModal
├── runner/         # RunControls (pre-run connection health check + variable validation + run buttons), LiveLog, ProgressBar, RunHistory
├── results/        # ResultsPanel, DetailPane, SummaryDrawer, DiffModal
└── setup/          # SetupPanel, ApiKeysCard
```

### API Client Layer (`src/lib/api/`)

All API calls go through `client.ts` which adds auth headers and rewrites `/vN/` paths based on `apiVersion`.

| Module | Key Functions |
|--------|---------------|
| `specFilesApi.ts` | `listSpecFiles`, `importSpecFileFromUrl`, `syncSpecFiles`, `getSourcesManifest`, `updateSourceUrl`, `generateFlowIdeas`, `splitSwagger` — `SplitSwaggerResult` includes `suggestedVariables` (`SuggestedVariable[]`), `suggestedConnections` (`SuggestedConnection[]`), and optional `processing` (`ProcessingReport`: distillation totals/errors + digest build status). Uses raw `fetch()` (not `apiClient`), so includes its own 401→`session-expired` event dispatch. |
| `flowApi.ts` | `generateFlowXml` (AI generation from plan), `editFlowXml` (accepts optional `method` and `path` for spec-aware editing) |
| `flowFilesApi.ts` | `saveFlowFile`, `deleteFlowFile`, `listFlowFiles`, `unlockFlow` |
| `flowChatApi.ts` | `sendFlowChatMessage` (multi-turn conversation) |
| `flowChatSessionsApi.ts` | `listChatSessions`, `getChatSession`, `createChatSession`, `updateChatSession`, `deleteChatSession` |
| `activeTestsApi.ts` | `activateFlow`, `deactivateFlow`, `getActiveFlows` |
| `testRunsApi.ts` | `saveTestRun`, `getTestRuns` |
| `scenarioOrgApi.ts` | `loadScenarioOrg`, `saveScenarioOrg` |
| `versionAuthApi.ts` | `getVersionAuth`, `saveVersionAuth`, `saveCredential`, `deleteCredential` |
| `apiKeysApi.ts` | `listApiKeys`, `createApiKey`, `revokeApiKey` |
| `auditLogApi.ts` | `queryAuditLog` |
| `projectsApi.ts` | `listProjects`, `createProject`, `updateProject`, `archiveProject` |
| `projectMembersApi.ts` | `listProjectMembers`, `addProjectMember`, `updateProjectMember`, `removeProjectMember` |
| `aiCreditsApi.ts` | `getCredits`, `updateProjectBudget`, `updateUserBudget`, `listUserCredits` |
| `projectVariablesApi.ts` | `getProjectVariables`, `saveProjectVariables` |
| `apiRulesApi.ts` | `getApiRules`, `saveApiRules`, `fetchFolderApiRules(folder)`, `saveFolderApiRules(folder, data)` |
| `connectionsApi.ts` | `listConnections`, `createConnection`, `updateConnection`, `deleteConnection` — `ConnectionProvider` type, `Connection` interface with optional OAuth fields and `hasCredential`. `CreateConnectionPayload` supports `draft: true` for auto-detected connections. |
| `debugApi.ts` | `analyzeFailedStep` — sends failed step request/response to `/api/debug-analyze` for AI-powered diagnosis. Returns structured `DebugDiagnosis` with `summary`, `whatWentWrong`, `canYouFixIt`, `howToFix`, `fixPrompt`, `developerNote`, plus `_debug` metadata (`specFound`, `specSource`, `hasApiRules`, `model`). When spec is unavailable, `canYouFixIt` is forced `false` and category is `no_spec`. DiagnoseTab offers "Fix it automatically" (editFlowXml with `method`/`path` for spec-aware editing → validate → save → activate → reload pipeline). |

### Test Execution Engine (`src/lib/tests/`)

```
tests/
├── registry.ts         # Global test registry (getAllTests, registerTest)
├── runner.ts           # Execution loop: setup → execute → teardown (with pause/resume)
├── context.ts          # Runtime context (auth type/tokens/headers, captures, project variables) — buildTestContext takes options object. Path params resolve generically from `{{proj.*}}` variables.
├── assertions.ts       # status, field-exists, field-equals, field-contains, etc.
├── validateProjVars.ts # Design-time validation: findMissingProjVars (undefined) + findEmptyProjVars (blank values)
├── buildParsedTags.ts  # Build tag tree from registry for TestExplorer
└── flowXml/
    ├── parser.ts       # Parse .flow.xml → TestDef[]
    ├── builder.ts      # Build individual TestDef from XML element
    ├── loader.ts       # Load flows from Cosmos active queue
    ├── validate.ts     # XSD schema validation
    ├── activeTests.ts  # Cosmos activation/deactivation
    ├── enumAliases.ts  # Bidirectional enum name ↔ ordinal mapping (configurable per version folder via _system/_rules.json)
    └── types.ts        # FlowElement, FlowStep, FlowAssertion, etc.
```

**Flow XML → Test pipeline** (deterministic, no AI):
1. `loader.ts` fetches active flows from Cosmos
2. `parser.ts` parses XML into `FlowElement` tree
3. `builder.ts` converts to `TestDef` with assertions, captures, flags
4. `registry.ts` stores definitions
5. `runner.ts` executes: merges scenario env overrides into context, resolves `{{state.*}}`, `{{proj.*}}`, and `{{ctx.*}}` interpolation uniformly (all use mustache braces), resolves `{any_name}` path params from `{{proj.*}}` variables, runs HTTP calls via generic proxy (with `X-FF-Auth-Type` / `X-FF-Base-Url` / `X-FF-Connection-Id` headers), evaluates assertions
6. Teardown steps run even if prior steps fail

---

## Backend Architecture

### Azure Functions (`api/src/functions/`)

| Function | Route | Methods | Purpose |
|----------|-------|---------|---------|
| `specFiles` | `/api/spec-files` | GET/POST/PUT/DELETE | Spec file CRUD + content download. Listing remaps `_distilled/` blobs into `_system/_distilled/` virtual paths; read requests reverse-map back to actual blob locations. Returns 404 (not 500) for missing blobs. |
| `specFilesImportUrl` | `/api/spec-files/import-url` | POST | Import from external URL (cookie jar + browser headers) |
| `specFilesSync` | `/api/spec-files/sync` | POST | Re-fetch URL-sourced files |
| `specFilesSources` | `/api/spec-files/sources` | GET/PUT | Read/update `_sources.json` manifests |
| `flowFiles` | `/api/flow-files` | GET/POST/DELETE | Flow XML CRUD in Cosmos |
| `flowLocks` | `/api/flow-locks` | POST/DELETE | Lock/unlock flows (role-gated) |
| `flowChat` | `/api/flow-chat` | POST | Multi-turn Claude conversation for flow design |
| `flowChatSessions` | `/api/flow-chat-sessions` | GET/POST/PUT/DELETE | Persist chat history |
| `generateFlowIdeas` | `/api/generate-flow-ideas` | POST | AI idea generation from spec context |
| `generateFlow` | `/api/generate-flow` | POST | AI XML generation from confirmed plan |
| `editFlow` | `/api/edit-flow` | POST | AI-assisted flow editing. Accepts optional `method` and `path` body params for spec-aware editing (used by Fix-it path). |
| `debugAnalyze` | `/api/debug-analyze` | POST | AI step debugging — analyzes failed test steps using user-selected model (Sonnet default). Spec matching via `findMatchingSpec()` (from `aiContext.ts`) uses normalized path params (`{param}` → `{*}`) with raw spec fallback when distilled content is unavailable. Full AI context (spec, API rules, project variables, entity dependencies) loaded via `loadAiContext()`. **Anti-hallucination policy**: when spec is missing, AI must not fabricate schemas or field names — `canYouFixIt` forced to `false`, category set to `no_spec`, confidence lowered. Returns structured JSON: `summary`, `whatWentWrong`, `canYouFixIt`, `howToFix`, `fixPrompt`, `developerNote`, plus `_debug` field (`specFound`, `specSource`, `hasApiRules`, `model`). DiagnoseTab supports auto-fix via edit→validate→save→activate pipeline. |
| `activeTests` | `/api/active-tests` | GET/PUT/POST | Manage active flow set |
| `testRuns` | `/api/test-runs` | GET/POST | Persist/query run results |
| `runScenario` | `/api/run-scenario` | POST | **Public API**: Server-side test execution |
| `oauthAuth` | `/api/oauth-auth` | POST/GET | Generic OAuth code exchange + token refresh |
| `proxy` | `/api/proxy/{*path}` | All | Generic API proxy — reads base URL from `X-FF-Base-Url`, connection ID from `X-FF-Connection-Id`, injects stored auth |
| `users` | `/api/users` | GET/POST/PUT | User CRUD + `/users/me` |
| `apiKeys` | `/api/api-keys` | GET/POST/DELETE | API key management |
| `versionAuth` | `/api/version-auth`, `/api/version-auth/credential` | GET/POST/DELETE | Per-version auth config + generic credential storage (any auth type) |
| `settings` | `/api/settings` | GET/POST | User settings |
| `scenarioOrg` | `/api/scenario-org` | GET/POST | Folder organization |
| `auditLog` | `/api/audit-log` | GET | Query audit entries |
| `ideas` | `/api/ideas` | GET/POST/DELETE | Flow ideas CRUD |
| `projects` | `/api/projects` | GET/POST/PUT/DELETE | Project CRUD (GET filtered by membership, POST project_owner+, PUT/DELETE project_owner+) |
| `projectMembers` | `/api/project-members` | GET/POST/PUT/DELETE | Project membership CRUD (project_owner+). POST auto-creates tenant `users` doc with role `member` if invitee doesn't exist. |
| `resetProject` | `/api/reset-project` | POST | Owner-only project wipe |
| `aiCredits` | `/api/ai-credits` | GET/PUT | Credit status (GET), update project budget (PUT `/project`), update user budget (PUT `/user/{userId}`), list user credits (GET `/users`) — Super Owner only for writes |
| `projectVariables` | `/api/project-variables` | GET/PUT | Project-level key/value variables stored in `settings` container. GET returns all variables; PUT saves (qa_manager+). Audit action: `project.variables.update`. |
| `specFilesRules` | `/api/spec-files/rules` | GET/PUT | Version-folder-scoped API rules and enum aliases stored as `_system/_rules.json` blobs (legacy `_rules.json` fallback on read). GET/PUT by folder path query param. |
| `specFilesSplitSwagger` | `/api/spec-files/split-swagger` | POST | Split OpenAPI 3.x / Swagger 2.x JSON spec into per-endpoint .md files by tag. Stores original spec at `_system/_swagger.json` (with legacy fallback read). Resolves $refs, creates tag-based folders, uploads through `distillAndStore` pipeline. Awaits `batchDistillAll` to collect per-file results, then eagerly calls `rebuildDigest()`. Returns `suggestedVariables` (path parameters), `suggestedConnections` (security schemes), and `processing` report (`{ distillation: { total, distilled, unchanged, errors, errorDetails }, digest: { built, error? } }`). |
| `connections` | `/api/connections` | GET/POST/PUT/DELETE | Connection CRUD. Providers: `oauth2`, `bearer`, `apikey_header`, `apikey_query`, `basic`, `cookie`. `sanitize()` strips `clientSecret`/`credential`, returns `hasSecret`/`hasCredential`. Stored in `connections` Cosmos container. Supports `draft: true` flag for auto-detected connections (skips credential validation). |
| `apiRules` | `/api/api-rules` | GET/PUT | **Deprecated (fallback only)** — Legacy per-project API rules in `settings` container. `loadApiRules` tries blob `_rules.json` first, falls back here. |

### Shared Libraries (`api/src/lib/`)

| Module | Purpose |
|--------|---------|
| `auth.ts` | `withAuth()` wrapper, `withProjectRole()` per-project access control, `getUserInfo(req)`, `getProjectId(req)`, `lookupProjectMember()`, `isSuperOwner()` — extracts Entra ID claims |
| `apiKeyAuth.ts` | `validateApiKey()` for public API endpoints |
| `cosmosClient.ts` | Lazy-init Cosmos client + `ensureContainer()` for all 13 containers |
| `blobClient.ts` | Azure Blob Storage (upload, download, list, delete, exists) |
| `browserFetch.ts` | `fetchWithCookieJar()` + browser User-Agent headers for Cloudflare-fronted URLs |
| `oauthTokenStore.ts` | Azure Table Storage for OAuth tokens (`oauthtokens` table) + `getValidOAuthToken()` with auto-refresh |
| `versionApiKeyStore.ts` | Table Storage for per-version credentials (any auth type — bearer, API key, basic, cookie, etc.) |
| `modelPricing.ts` | `resolveModel()`, `computeCost()`, pricing for Opus/Sonnet/Haiku |
| `aiCredits.ts` | `checkCredits()`, `recordUsage()`, `seedProjectCredits()`, `seedUserCredits()`, `updateProjectBudget()`, `updateUserBudget()` — credit enforcement for AI endpoints |
| `auditLog.ts` | Fire-and-forget `audit()` function, writes to Cosmos `audit-log` container. Actions include `project.member_add`, `project.member_remove`, `project.member_role_change`, `project.variables.update`, `project.apiRules.update`. |
| `aiContext.ts` | Unified AI context builder. `loadAiContext(projectId, versionFolder, specFiles?)` returns `AiContext` with `enrichSystemPrompt()` and `formatUserContext()` helpers. Centralizes loading of spec context, API rules, project variables, and entity dependencies for all AI functions. Also exports `findMatchingSpec()` for spec lookup by method+path. |
| `apiRules.ts` | `loadApiRules(projectId, versionFolder?)` fetches API rules — tries `_system/_rules.json` first, falls back to legacy `_rules.json` then Cosmos; also loads `_system/_skills.md` (with legacy `Skills.md` fallback) and merges into rules context. `injectApiRules(systemPrompt, projectId, versionFolder?)` appends rules + lessons to AI system prompts; `extractVersionFolder(paths)` derives version folder from spec file paths. |
| `specDigest.ts` | Scalable spec context for large projects. Three tiers: Raw → Distilled → Digest (~2-3 lines/endpoint). Builds `_system/_digest.md` blob per version folder (lightweight endpoint index grouped by resource). Filters out `_system/` files from digest builds. Threshold: >20 specs use digest. Auto-invalidated on spec file changes. **Eagerly rebuilt during OpenAPI import** (split-swagger awaits distillation then calls `rebuildDigest`); lazy rebuild in `generateFlowIdeas` remains as fallback. |
| `swaggerSplitter.ts` | Core OpenAPI/Swagger splitting logic: recursive $ref resolution (with circular detection), tag-to-folder kebab-case naming, method-to-filename with collision handling, Swagger 2.x→3.x normalization, per-endpoint markdown builder. `extractPathParameters()` extracts path params from all endpoints as `SuggestedVariable[]`. `extractSecuritySchemes()` extracts OAuth2/Bearer/API Key/Basic/Cookie auth from security definitions as `SuggestedConnection[]`. |

### Server-Side Flow Runner (`api/src/lib/flowRunner/`)

Used by the Public API (`/api/run-scenario`) to execute flows without a browser:

| Module | Purpose |
|--------|---------|
| `parser.ts` | Parse flow XML into step instructions |
| `executor.ts` | Execute steps (HTTP calls, assertions, captures) |
| `interpolation.ts` | Replace `{{state.key}}`, `{{proj.*}}`, and `{{ctx.*}}` placeholders (all use mustache `{{…}}` syntax uniformly). `ctx.projectId`/`ctx.versionId`/`ctx.langCode` are backward-compatible aliases for `proj.project_id`/`proj.version_id`/`proj.lang_code`. Runtime `resolveParam()` still accepts bare `proj.xxx` for backward compatibility with existing flows. |
| `scenarioResolver.ts` | Resolve scenario GUID → flow XML from Cosmos |
| `types.ts` | `RunContext` (token, baseUrl, apiVersion, auth fields, projectVariables — no D360-specific fields), `ScenarioResult`, step types |

### Cosmos DB Schema

| Container | Partition Key | Document Shape |
|-----------|---------------|----------------|
| `flows` | `/projectId` | `{ id, projectId, name, path, xml, lockedBy?, lockedAt?, createdBy, ... }` |
| `ideas` | `/projectId` | `{ id, projectId, contextPath, ideas[], ... }` |
| `test-runs` | `/projectId` | `{ id, projectId, summary, tagResults, testResults, log[], source, ... }` |
| `settings` | `/userId` | `{ id, userId, selectedProjectId, aiModel, baseUrl, apiVersion, ... }` |
| `users` | `/tenantId` | `{ id, tenantId, oid, name, email, role, status, ... }` |
| `api-keys` | `/projectId` | `{ id, projectId, name, keyHash, prefix, createdBy, ... }` |
| `audit-log` | `/projectId` | `{ id, projectId, action, actor, target, details, timestamp }` |
| `flow-chat-sessions` | `/projectId` | `{ id, projectId, userId, title, messages[], confirmedPlan?, totalCost, ... }` |
| `projects` | `/tenantId` | `{ id, tenantId, name, description?, visibility (team/personal), memberCount, createdBy, createdAt, status, ... }` |
| `project-members` | `/projectId` | `{ id, projectId, userId, role (project_owner/qa_manager/qa_engineer/member), addedBy, addedAt, ... }` |
| `ai-usage` | `/projectId` | `project_credits`: `{ id, projectId, type, budgetUsd, usedUsd, ... }` / `user_credits`: `{ id, projectId, type, userId, budgetUsd, usedUsd, ... }` |
| `connections` | `/projectId` | `{ id, projectId, name, provider ("oauth2"\|"bearer"\|"apikey_header"\|"apikey_query"\|"basic"\|"cookie"), credential? (server-only), authHeaderName?, authQueryParam?, clientId?, authUrl?, tokenUrl?, scopes?, hasSecret, hasCredential, ... }` |

### Blob Storage Layout

```
spec-files/
├── {projectId}/                    # All blobs scoped by project for multi-tenant isolation
│   ├── v3/
│   │   ├── articles/
│   │   │   ├── create-article.md
│   │   │   ├── _sources.json      # Manifest: { "create-article.md": { sourceUrl, importedAt, lastSyncedAt } }
│   │   │   ├── _distilled/        # Distilled spec blobs (actual storage location, per-resource subfolder)
│   │   │   │   └── create.md      # Distilled version of create-article.md
│   │   │   ├── _system/           # Internal system files (isSystem flag in tree — lock icon, muted, no context menu, no drag-drop)
│   │   │   │   ├── _rules.json    # Version-folder API rules: { rules, enumAliases }
│   │   │   │   ├── _skills.md     # Auto-saved diagnostic lessons (from successful "Fix it") — injected into AI prompts
│   │   │   │   ├── _digest.md     # Lightweight endpoint index (~2-3 lines/endpoint) for scalable idea generation
│   │   │   │   ├── _swagger.json  # Original OpenAPI/Swagger spec (preserved when using split-swagger)
│   │   │   │   └── _distilled/    # Virtual folder — remaps _distilled/ blobs from resource subfolders for browsing in file tree
│   │   │   └── _versions/         # Hidden from UI — auto-preserved on sync
│   │   │       └── create-article.md.2025-02-15T14-30-45-123Z
│   │   └── categories/
│   │       └── ...
```

---

## Authentication Architecture

### Entra ID Flow
```
Browser → SWA /.auth/login/aad → Microsoft login → SWA sets cookie
       → EntraGate checks /.auth/me → auto-login if no principal
       → withAuth() extracts claims from x-ms-client-principal header
       → getUserInfo() returns { oid, name, email }
       → On 401: apiClient (and raw-fetch modules) dispatch `session-expired` event
       → App.tsx handler calls auth.logout() + entraAuth.check() → login redirect
```

### API Proxy (Connection-Based Auth Injection)
```
Settings → Connections → ConnectionFormModal (all auth types) → POST /api/connections
       → Connection doc stored in Cosmos `connections` container (credential server-only)
       → Providers: oauth2 | bearer | apikey_header | apikey_query | basic | cookie
ConnectEndpointModal (simplified) → Base URL + API Version + Connection picker
       → GET /api/proxy/{path} → proxy reads X-FF-Base-Url + X-FF-Connection-Id headers
       → Looks up connection doc from Cosmos (cross-partition query)
       → Injects auth based on provider: bearer→header, apikey_header→custom header,
         apikey_query→URL param, basic→header, cookie→header, oauth2→token with auto-refresh
       → Forwards to target API endpoint
       → Legacy per-user credential path (Azure Table Storage) preserved as fallback
```

### Public API Auth
```
External → POST /api/run-scenario (X-API-Key: ff_abc123...)
        → apiKeyAuth.ts SHA-256 hashes key → matches against Cosmos api-keys
        → flowRunner executes scenario server-side
```

---

## CI/CD Pipeline

### Staging (`deploy-staging.yml`) — auto on push to `main`
### Production (`deploy-production.yml`) — manual `workflow_dispatch`

Both follow the same build steps:

```
1. checkout (fetch-depth: 0 for commit count)
2. cd api && npm ci && npm test        # Unit tests
3. cd api && npm run build && npm prune --production  # esbuild bundle
4. npm ci && npm run build              # Frontend build
5. Write version.json to dist/
6. Copy staticwebapp.config.json to dist/
7. Azure SWA deploy (skip_app_build: true, app_location: "dist", api_location: "api")
8. Smoke test deployed endpoints
```

GitHub Secrets: `SWA_TOKEN_STAGING`, `SWA_TOKEN_PRODUCTION`
GitHub Variables: `STAGING_URL`, `PRODUCTION_URL`

### Build Configuration

- **Frontend**: `tsc -b && vite build` — TypeScript project build mode catches JSX errors
- **Backend**: `esbuild` bundles all functions + libs into single output. `@azure/functions` excluded (provided by SWA runtime). `@anthropic-ai/sdk` and storage SDKs inlined.
- **Version**: `__BUILD_VERSION__` injected at build time from `package.json` appVersion + `git rev-list --count HEAD`

---

## Key Design Patterns

### Fire-and-Forget Persistence
Audit logging, auto-save (chat sessions), and cost tracking use fire-and-forget — call async function without `await` so the user isn't blocked.

### Debounced Auto-Save
Chat panel auto-saves to Cosmos with 1.5s debounce on message changes. Timer ref cleared on unmount.

### Per-User Scoping
All Cosmos queries scope by `projectId` (from Entra claims). Settings use `userId`. API keys use `projectId`. Chat sessions filter by both `projectId` and `userId`.

### Overwrite-on-Create Pattern
`saveFlowFile` uses `overwrite: true` to avoid 409 conflicts from orphaned Cosmos docs (e.g., after flow deletion that left stale records).

### Multi-Tenant Blob Scoping
All spec-file blob operations are scoped with a `{projectId}/` prefix. Azure Functions (`specFiles`, `specFilesImportUrl`, `specFilesSync`, `specFilesSources`, `generateFlowIdeas`, `generateFlow`, `flowChat`) prepend the project ID from auth claims to all blob paths. Migration script at `scripts/migrate-project-scoping.mjs` moves legacy unscoped blobs under the project prefix, creates default project docs, and generates project-member records from existing users.

### Scenario Environment Override Hierarchy
Test context is built with a 3-tier merge: scenario-level overrides (from `scenarioConfigs`) > version-level config (from `versionConfigs`) > global defaults. `buildContextByTag` in `RunControls` performs the merge at runtime. `ScenarioEnvOverrideModal` (TagNode context menu) edits per-scenario overrides. Server-side `scenarioOrg.ts` persists `scenarioConfigs` alongside folders/placements.

### Pre-Run Connection Health Check
`RunControls` performs a one-time connection health check on mount that validates ALL connection types used by connected versions. OAuth connections are verified via `/api/oauth/health-check/{connectionId}` (checks token validity/refreshability); non-OAuth connections (bearer, API key, basic, cookie) are checked for `hasCredential` on the Connection object. Issues are shown in a red error banner listing version name, reason, and connection name, with a link to "Settings → Connections". A "Checking connection credentials..." spinner displays while the check runs. Run buttons are disabled until the health check completes and passes.

### Pre-Run Variable Validation
`RunControls` also performs design-time variable validation on every render: `findMissingProjVars()` detects `{{proj.*}}` references with no matching variable definition, and `findEmptyProjVars()` detects defined variables with empty/blank values. If any issues are found, a red error banner lists the problematic variables (with "not defined" / empty labels) and links to "Settings → Variables". Run buttons are disabled until all variables have values.

### OpenAPI Auto-Detection
`autoDetectEndpoint.ts` parses uploaded/imported spec files for `servers[].url` (OpenAPI 3.x) or `host`+`basePath` (Swagger 2.x) and security scheme definitions. Detected config stored in `scenarioOrg.store.detectedEndpoint` and surfaced as a blue banner in Spec Manager + pre-fill in `ConnectEndpointModal`.

### Version Polling
`useVersionCheck` hook polls `/version.json` every 60s (first check at 10s). Compares against baked-in `__BUILD_VERSION__`. Shows green "Relaunch" banner in TopBar when mismatch detected.
