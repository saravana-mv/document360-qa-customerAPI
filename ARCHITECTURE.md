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

1. **Spec Import** — Upload markdown files or import from URLs (with sync-from-source)
2. **Idea Generation** — Claude analyzes spec context (max 5 files, 50k chars) and proposes test ideas
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
| Settings | `src/pages/SettingsPage.tsx` | Tabs: General, API Keys (qa_manager+), Variables (qa_manager+), Members (project_owner+), Users (owner), Audit Log (qa_manager+) |
| Variables | `src/pages/ProjectVariablesPage.tsx` | Project-level key/value variables (qa_manager+), `proj.varName` interpolation |
| Members | `src/pages/MembersPage.tsx` | Per-project member list, add/remove members, role assignment |
| Audit Log | `src/pages/AuditLogPage.tsx` | Full audit viewer with filters and pagination |
| Users | `src/pages/UsersPage.tsx` | Team management, role assignment |

### Zustand Stores

| Store | Key State | Notes |
|-------|-----------|-------|
| `auth.store` | `status`, `token`, `projectId` | OAuth session. Synchronous init from sessionStorage. |
| `setup.store` | `selectedProjectId`, `selectedVersionId`, `aiModel`, `baseUrl`, `apiVersion` | Persisted to Cosmos `/settings`. `apiVersion` rewrites all request paths. |
| `user.store` | `user`, `role`, `status` | Roles: owner / project_owner / qa_manager / qa_engineer / member. `AccessGate` enforces. |
| `flowStatus.store` | `byName: Record<string, FlowStatusEntry>` | Flow activation state. Must finish loading before TestExplorer builds tags. |
| `runner.store` | `running`, `paused`, `pausedAt`, `tagResults`, `log[]` | Test execution. Breakpoints stored separately. |
| `scenarioOrg.store` | `versionConfigs`, `folders`, `placements` | Single `__scenario_org__` doc in Cosmos. NEWLY-ADDED pinned folder per version. |
| `explorerUI.store` | `expandedVersions`, `expandedFolders`, `rearrangeMode` | UI-only state for tree expansion and drag-drop mode. |
| `aiCost.store` | `workshopCostUsd`, `adhocCostUsd` | Every AI call must report here. TopBar shows total. |
| `breakpoints.store` | `ids: Set<testId>` | Per-step pause/resume. Persisted in localStorage. |
| `aiCredits.store` | `projectCredits`, `userCredits`, `loading` | Loads project + user credit budgets/usage from `/api/ai-credits`. Refreshed after cost events. |
| `project.store` | `projects`, `selectedProject`, `loading` | Project list, selection, CRUD. ProjectPicker in TopBar. |
| `entraAuth.store` | `tenant`, `clientId`, `redirectUri` | Entra ID configuration. |
| `projectVariables.store` | `variables`, `loading` | Project-level key/value pairs. Loaded from `/api/project-variables`. Used as `proj.varName` in flow interpolation. |

### Component Organization

```
src/components/
├── auth/           # EntraGate (SSO wrapper), ProjectGate (project selection guard), AccessGate (role check), LoginScreen, OAuthCallback
├── common/         # Layout, TopBar, SideNav, Modal, ContextMenu, XmlCodeBlock, XmlEditor, ResizeHandle, ProjectPicker
├── specfiles/      # FileTree, FlowChatPanel, FlowIdeasPanel, FlowsPanel, DetailPanel, ImportFromUrlModal
├── explorer/       # TestExplorer, VersionAccordion, ScenarioFolderTree, TagNode, ConnectEndpointModal
├── runner/         # RunControls, LiveLog, ProgressBar, RunHistory
├── results/        # ResultsPanel, DetailPane, SummaryDrawer, DiffModal
└── setup/          # SetupPanel, ProjectSettingsCard, ApiKeysCard
```

### API Client Layer (`src/lib/api/`)

All API calls go through `client.ts` which adds auth headers and rewrites `/vN/` paths based on `apiVersion`.

| Module | Key Functions |
|--------|---------------|
| `specFilesApi.ts` | `listSpecFiles`, `importSpecFileFromUrl`, `syncSpecFiles`, `getSourcesManifest`, `updateSourceUrl`, `generateFlowIdeas` |
| `flowApi.ts` | `generateFlowXml` (AI generation from plan) |
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

### Test Execution Engine (`src/lib/tests/`)

```
tests/
├── registry.ts         # Global test registry (getAllTests, registerTest)
├── runner.ts           # Execution loop: setup → execute → teardown (with pause/resume)
├── context.ts          # Runtime context (project, version, auth type/tokens/headers, captures) — buildTestContext takes options object
├── assertions.ts       # status, field-exists, field-equals, field-contains, etc.
├── buildParsedTags.ts  # Build tag tree from registry for TestExplorer
└── flowXml/
    ├── parser.ts       # Parse .flow.xml → TestDef[]
    ├── builder.ts      # Build individual TestDef from XML element
    ├── loader.ts       # Load flows from Cosmos active queue
    ├── validate.ts     # XSD schema validation
    ├── activeTests.ts  # Cosmos activation/deactivation
    ├── enumAliases.ts  # Bidirectional enum name ↔ ordinal mapping
    └── types.ts        # FlowElement, FlowStep, FlowAssertion, etc.
```

**Flow XML → Test pipeline** (deterministic, no AI):
1. `loader.ts` fetches active flows from Cosmos
2. `parser.ts` parses XML into `FlowElement` tree
3. `builder.ts` converts to `TestDef` with assertions, captures, flags
4. `registry.ts` stores definitions
5. `runner.ts` executes: resolves `{{state.*}}`, `{{proj.*}}` (project variables) interpolation, runs HTTP calls via proxy (with `X-D360-Auth-Type` header), evaluates assertions
6. Teardown steps run even if prior steps fail

---

## Backend Architecture

### Azure Functions (`api/src/functions/`)

| Function | Route | Methods | Purpose |
|----------|-------|---------|---------|
| `specFiles` | `/api/spec-files` | GET/POST/PUT/DELETE | Spec file CRUD + content download |
| `specFilesImportUrl` | `/api/spec-files/import-url` | POST | Import from external URL (cookie jar + browser headers) |
| `specFilesSync` | `/api/spec-files/sync` | POST | Re-fetch URL-sourced files |
| `specFilesSources` | `/api/spec-files/sources` | GET/PUT | Read/update `_sources.json` manifests |
| `flowFiles` | `/api/flow-files` | GET/POST/DELETE | Flow XML CRUD in Cosmos |
| `flowLocks` | `/api/flow-locks` | POST/DELETE | Lock/unlock flows (role-gated) |
| `flowChat` | `/api/flow-chat` | POST | Multi-turn Claude conversation for flow design |
| `flowChatSessions` | `/api/flow-chat-sessions` | GET/POST/PUT/DELETE | Persist chat history |
| `generateFlowIdeas` | `/api/generate-flow-ideas` | POST | AI idea generation from spec context |
| `generateFlow` | `/api/generate-flow` | POST | AI XML generation from confirmed plan |
| `editFlow` | `/api/edit-flow` | POST | AI-assisted flow editing |
| `activeTests` | `/api/active-tests` | GET/PUT/POST | Manage active flow set |
| `testRuns` | `/api/test-runs` | GET/POST | Persist/query run results |
| `runScenario` | `/api/run-scenario` | POST | **Public API**: Server-side test execution |
| `d360Auth` | `/api/d360-auth` | POST/GET | D360 OAuth code exchange + token refresh |
| `d360Proxy` | `/api/d360/*` | All | Proxy to D360 API with injected bearer |
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

### Shared Libraries (`api/src/lib/`)

| Module | Purpose |
|--------|---------|
| `auth.ts` | `withAuth()` wrapper, `withProjectRole()` per-project access control, `getUserInfo(req)`, `getProjectId(req)`, `lookupProjectMember()`, `isSuperOwner()` — extracts Entra ID claims |
| `apiKeyAuth.ts` | `validateApiKey()` for public API endpoints |
| `cosmosClient.ts` | Lazy-init Cosmos client + `ensureContainer()` for all 12 containers |
| `blobClient.ts` | Azure Blob Storage (upload, download, list, delete, exists) |
| `browserFetch.ts` | `fetchWithCookieJar()` + browser User-Agent headers for Cloudflare-fronted URLs |
| `tokenStore.ts` | Azure Table Storage for D360 OAuth tokens |
| `versionApiKeyStore.ts` | Table Storage for per-version credentials (any auth type — bearer, API key, basic, cookie, etc.) |
| `d360Token.ts` | Fetch/cache D360 tokens from Table Storage |
| `modelPricing.ts` | `resolveModel()`, `computeCost()`, pricing for Opus/Sonnet/Haiku |
| `aiCredits.ts` | `checkCredits()`, `recordUsage()`, `seedProjectCredits()`, `seedUserCredits()`, `updateProjectBudget()`, `updateUserBudget()` — credit enforcement for AI endpoints |
| `auditLog.ts` | Fire-and-forget `audit()` function, writes to Cosmos `audit-log` container. Actions include `project.member_add`, `project.member_remove`, `project.member_role_change`, `project.variables.update`. |

### Server-Side Flow Runner (`api/src/lib/flowRunner/`)

Used by the Public API (`/api/run-scenario`) to execute flows without a browser:

| Module | Purpose |
|--------|---------|
| `parser.ts` | Parse flow XML into step instructions |
| `executor.ts` | Execute steps (HTTP calls, assertions, captures) |
| `interpolation.ts` | Replace `{{state.key}}`, `{{ctx.*}}`, and `{{proj.*}}` placeholders |
| `scenarioResolver.ts` | Resolve scenario GUID → flow XML from Cosmos |
| `types.ts` | `RunContext`, `ScenarioResult`, step types |

### Cosmos DB Schema

| Container | Partition Key | Document Shape |
|-----------|---------------|----------------|
| `flows` | `/projectId` | `{ id, projectId, name, path, xml, lockedBy?, lockedAt?, createdBy, ... }` |
| `ideas` | `/projectId` | `{ id, projectId, contextPath, ideas[], ... }` |
| `test-runs` | `/projectId` | `{ id, projectId, summary, tagResults, testResults, log[], source, ... }` |
| `settings` | `/userId` | `{ id, userId, selectedProjectId, selectedVersionId, aiModel, ... }` |
| `users` | `/tenantId` | `{ id, tenantId, oid, name, email, role, status, ... }` |
| `api-keys` | `/projectId` | `{ id, projectId, name, keyHash, prefix, createdBy, ... }` |
| `audit-log` | `/projectId` | `{ id, projectId, action, actor, target, details, timestamp }` |
| `flow-chat-sessions` | `/projectId` | `{ id, projectId, userId, title, messages[], confirmedPlan?, totalCost, ... }` |
| `projects` | `/tenantId` | `{ id, tenantId, name, description?, visibility (team/personal), memberCount, createdBy, createdAt, status, ... }` |
| `project-members` | `/projectId` | `{ id, projectId, userId, role (project_owner/qa_manager/qa_engineer/member), addedBy, addedAt, ... }` |
| `ai-usage` | `/projectId` | `project_credits`: `{ id, projectId, type, budgetUsd, usedUsd, ... }` / `user_credits`: `{ id, projectId, type, userId, budgetUsd, usedUsd, ... }` |

### Blob Storage Layout

```
spec-files/
├── {projectId}/                    # All blobs scoped by project for multi-tenant isolation
│   ├── v3/
│   │   ├── articles/
│   │   │   ├── create-article.md
│   │   │   ├── _sources.json      # Manifest: { "create-article.md": { sourceUrl, importedAt, lastSyncedAt } }
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
```

### API Proxy (Generic Auth Injection)
```
Browser → ConnectEndpointModal (cURL paste / manual form) → POST /api/version-auth/credential
       → Credential stored in Azure Table Storage (keyed by OID + version)
       → Auth types: bearer | apikey_header | apikey_query | basic | cookie | oauth | none
       → GET /api/d360/{path} → proxy reads stored credential → injects appropriate auth
       → Forwards to configured endpoint (D360 or any REST API)
       → builder.ts sends X-D360-Auth-Type header to tell proxy which injection to use
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

### Version Polling
`useVersionCheck` hook polls `/version.json` every 60s (first check at 10s). Compares against baked-in `__BUILD_VERSION__`. Shows green "Relaunch" banner in TopBar when mismatch detected.
