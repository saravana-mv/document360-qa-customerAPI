# Claude Code Instructions — FlowForge

## Project Overview

FlowForge is a generic AI-assisted API testing platform. It lets QA teams import API specs, connect any REST endpoint (with flexible auth), generate test flow ideas and XML definitions using Claude, execute tests against live endpoints, and track results — all from a single web app. Fully generic — no vendor-specific context in the test execution pipeline. Path parameters in flow XML (e.g., `{project_id}`) resolve from `{{proj.*}}` project variables at runtime.

**Stack:** React 19 + Vite 8 + Tailwind v4 + Zustand | Azure Functions v4 (Node.js) + Cosmos DB | Entra ID auth | Anthropic Claude API
**Deployed:** Azure Static Web Apps — Staging: `https://purple-mud-0bc0f5203.7.azurestaticapps.net` | Production: `https://delightful-smoke-0a3c52a03.7.azurestaticapps.net`

---

## Architecture Quick Reference

### Pages
- **Project Selection** (`src/pages/ProjectSelectionPage.tsx`) — Full-screen project tile grid (first screen after login), create project, visibility toggle
- **Spec Manager** (`src/pages/SpecFilesPage.tsx`) — Spec files, AI ideas, flow XML authoring, interactive flow chat. `ImportResultModal` after OpenAPI import shows stats + auto-detected path parameters (as project variable suggestions) and security schemes (as draft connection suggestions).
- **Scenario Manager** (`src/pages/TestPage.tsx`) — Version-based test tree, runner, run history, breakpoints
- **Settings** (`src/pages/SettingsPage.tsx`) — General, API Keys, Variables, Connections, Members, Users, Audit Log (role-gated tabs)

### Data Layer
- **Cosmos DB** (13 containers, all partitioned by `/projectId`): `flows`, `ideas`, `test-runs`, `settings` (`/userId`), `users` (`/tenantId`), `api-keys`, `audit-log`, `flow-chat-sessions`, `projects` (`/tenantId`), `project-members`, `ai-usage`, `connections`
- **Blob Storage**: Only `spec-files` container remains (reference docs, `_sources.json` manifests). Each version folder has a `_system/` subfolder containing internal files: `_rules.json` (API rules + enum aliases), `_skills.md` (diagnostic lessons), `_digest.md` (spec digest), `_swagger.json` (original spec). Distilled spec blobs (stored under `_distilled/` subfolders alongside their source specs) are remapped into `_system/_distilled/` in the file tree for browsability (read requests reverse-map the path back to the actual blob location). The `_system` folder, `_distilled` folders, and their children are marked `isSystem` in the file tree (rendered first, lock icon, muted text, no context menu, no drag-drop). System `.json` files open in a read-only CodeMirror JSON viewer. `getFileContent` returns 404 (not 500) for missing blobs. All blobs scoped under `{projectId}/` prefix for multi-tenant isolation.
- **localStorage**: Pure UI state only (tree expansion, panel widths, breakpoints)

### Key Stores (Zustand)
`auth.store` (Entra ID session), `setup.store` (project ID, base URL, API version, AI model), `user.store` (role), `project.store` (project list/selection), `flowStatus.store` (flow activation), `runner.store` (test execution), `scenarioOrg.store` (folder tree, versionConfigs, scenarioConfigs, detectedEndpoint), `aiCost.store` (spend tracking), `aiCredits.store` (credit budgets/usage), `breakpoints.store` (step pause/resume), `projectVariables.store` (project-level key/value variables), `connections.store` (connection CRUD, OAuth status polling, health checks)

### API Functions (`api/src/functions/`)
25+ Azure Functions. All wrapped with `withAuth()`. Key routes: `/api/spec-files/*`, `/api/spec-files/rules`, `/api/spec-files/split-swagger`, `/api/flow-files`, `/api/flow-chat`, `/api/generate-flow-ideas`, `/api/generate-flow`, `/api/debug-analyze` (AI step debugging), `/api/run-scenario`, `/api/proxy/*` (generic API proxy), `/api/active-tests`, `/api/test-runs`, `/api/users`, `/api/api-keys`, `/api/audit-log`, `/api/projects`, `/api/project-members`, `/api/ai-credits`, `/api/project-variables`, `/api/version-auth/credential`, `/api/api-rules`, `/api/connections`

### Auth Flow
Entra ID SSO → `EntraGate` auto-login → `ProjectGate` redirects to `/projects` if no project selected → `withAuth()` extracts OID/project from claims → `withProjectRole()` enforces per-project membership → credentials in Azure Table Storage → generic proxy at `/api/proxy/*` injects auth based on stored credential type (reads base URL from `X-FF-Base-Url`, connection from `X-FF-Connection-Id`) → browser never holds real API credentials

### Connections (Generic Auth)
Connections are managed centrally in Settings → Connections (`ConnectionsPage`, `ConnectionFormModal`). Supported provider types: `"oauth2"` | `"bearer"` | `"apikey_header"` | `"apikey_query"` | `"basic"` | `"cookie"`. Each connection stores its credential server-side (never returned to browser; `sanitize()` strips secrets, returns `hasSecret`/`hasCredential` booleans). Connections are stored in the `connections` Cosmos container. `connections.store.ts` manages CRUD and OAuth status polling (only OAuth connections are polled). **Draft connections**: Auto-detected connections from OpenAPI security schemes are created with `draft: true`, which skips credential validation (credentials must be filled in later via Settings → Connections).

### Connect Endpoint Modal
`ConnectEndpointModal` (`src/components/explorer/ConnectEndpointModal.tsx`) is simplified to just Base URL, API Version, and a Connection picker dropdown (shows all connection types with status indicators). Label is auto-derived from the selected connection's name. Generic proxy (`/api/proxy/*`) injects auth based on the connection's provider type (looks up connection doc from Cosmos via `X-FF-Connection-Id` header). Legacy per-user credential path (Azure Table Storage) preserved as fallback when no connectionId.

### OpenAPI Auto-Detection
`autoDetectEndpoint.ts` (`src/lib/spec/autoDetectEndpoint.ts`) detects endpoint config (base URL, auth type) from uploaded/imported OpenAPI 3.x and Swagger 2.x spec files. When detection succeeds, a blue notification banner appears in Spec Manager with an "Apply" action. Detected config is stored in `scenarioOrg.store.detectedEndpoint` for cross-page access and shown in `ConnectEndpointModal` as a pre-fill option.

### Per-Scenario Environment Overrides
Individual scenarios can override the version-level endpoint config via `ScenarioEnvOverrideModal` (accessible from TagNode context menu). Overrides stored as `scenarioConfigs: Record<flowPath, ScenarioEnvOverride>` in `scenarioOrg.store` and persisted server-side. Override hierarchy: scenario config > version config > global defaults. `buildContextByTag` merges scenario overrides into test context at runtime. Scenarios with active overrides show a blue slider icon badge.

### Role Hierarchy
5-tier hierarchy: `owner`(5) > `project_owner`(4) > `qa_manager`(3) > `qa_engineer`(2) > `member`(1). Super Owners bypass all checks and see all projects; other users see only projects they are members of. Project creation requires `project_owner`+. When a project owner invites someone who doesn't have a tenant-level `users` doc, one is auto-created with role `member`.

---

## Coding Conventions

### TypeScript
- `erasableSyntaxOnly: true` — No enums, no constructor parameter properties, no namespaces. Use `const` objects with `as const`.
- CI runs `tsc -b` which is stricter than `tsc --noEmit`. Always run `npx tsc -b` locally before pushing.

### Font Sizing (CRITICAL — recurring issue)
- HTML root is 15px. Use Tailwind defaults only.
- `text-sm` (~13.1px) for primary content (labels, body, buttons)
- `text-xs` (~11.25px) for metadata (timestamps, counts, hints)
- **NEVER use `text-[10px]`, `text-[11px]`, `text-[12px]`, or `text-[13px]`**. Minimum is `text-xs`.
- Exception: FileTree uses `text-[14px]` per user request.

### Design Language — GitHub Primer Tokens
```
Foreground:  #1f2328    Muted:     #656d76    Borders:   #d1d9e0
Canvas bg:   #f6f8fa    Accent:    #0969da    Green/CTA: #1a7f37
Error red:   #d1242f    Icon grey: #656d76 / #8b949e
```
No generic Tailwind colors (`text-blue-600`, `bg-purple-100`). Always use exact hex tokens. No purple/violet anywhere.

### Icons
- Delete/remove: Always **trash-bin** icon, never red X (X is for error/fail status)
- Tree icons: Greyscale only, `w-4 h-4`
- Context menus: "..." ellipsis trigger, grey icons, GitHub dropdown. No inline action icons.
- Toggle buttons (select/expand all): Icon buttons with title tooltips, not text links

### Modals
- Every modal and confirmation dialog **must have an X close button** in the header. No modal should be dismissable only via Cancel/action buttons.

### React State
- **Never seed `useState` from module-level constants** — always call loader inside initializer: `useState(() => loadFromStorage())`
- View state persistence must include ALL UI state (tree expansion, tabs, selections)

### Terminology
- In **Test Manager**: say "scenario" (with steps). Never "test" or "flow" in UI strings.
- In **Spec Manager**: say "flow" (the XML authoring artifact)

---

## Domain Rules

### Flow Dependencies (CRITICAL)
- Flows that create dependent entities must set up prerequisites first and tear them down after (e.g., Create Category → Create Article → Delete Article → Delete Category).
- Prerequisite endpoints may reside in **sibling resource folders** — cross-folder setup/teardown is expected even when generating from a single folder's specs.
- **Optional/nullable foreign keys still need setup** — Fields like `category_id`, `parent_id`, `folder_id`, `group_id` often appear as optional or nullable in the spec schema, but realistic test flows should still create and supply these entities. The AI must not skip prerequisite creation just because a foreign-key field is not marked required.
- Check for entity dependencies whenever writing new flows.

### Flow File Rules
- Names: max 80 chars including `.flow.xml`
- Never replace existing flow file without asking user first
- Flow XML must pass schema validation before tests can be created
- Flows with active tests cannot be deleted — must delete tests first
- Deleting tests must NOT delete flow XML files (flows are reusable)

### Flow XML Schema
Three authoritative sources must stay in sync: `FLOW_SYSTEM_PROMPT` in `generateFlow.ts`, `flow.xsd`, `parser.ts`. Common AI mistakes: wrong element names (`<assert>` vs `<assertion>`), wrong attributes (`value` vs `code` on status), steps not in `<steps>` wrapper. Flow XML namespace: `https://flowforge.io/qa/flow/v1`.

### Variable Syntax — Mustache Braces (CRITICAL)
ALL variable references in flow XML must use `{{…}}` mustache syntax everywhere — `{{proj.xxx}}`, `{{state.xxx}}`, `{{ctx.xxx}}`. This applies uniformly to pathParams, queryParams, body content, and assertions. Never use bare `proj.xxx` without braces in flow XML. Runtime `resolveParam()` still accepts bare `proj.xxx` for backward compatibility with existing flows, but all new flows and AI-generated XML must use `{{…}}`.

### API Rules (Version-Folder Scoped)
Per-version-folder configurable rules injected into all AI system prompts (flow generation, editing, ideas, chat). Stored as `_system/_rules.json` blobs in `spec-files` container under the version folder path. Managed via `FolderRulesPanel` in Spec Manager (inline editor on top-level version folders). Includes free-text rules and enum alias definitions. Settings → General shows a deprecation notice for the old project-level API Rules card. Helper: `api/src/lib/apiRules.ts` (`loadApiRules(projectId, versionFolder?)` — tries `_system/` path first, falls back to legacy paths then Cosmos; `injectApiRules`; `extractVersionFolder`). AI functions extract version folder from spec file paths.

### Diagnostic Lessons (Auto-Learned Skills)
When the Diagnose tab's "Fix it" succeeds, a lesson is auto-appended to `{versionFolder}/_system/_skills.md` in blob storage under a `## Lessons Learned` section. Each lesson records the endpoint, category, problematic fields, fix description, and date. Deduplication prevents the same endpoint+field combination from being recorded twice. `loadApiRules()` automatically picks up `_system/_skills.md` content (with legacy `Skills.md` fallback) alongside `_rules.json`, so lessons are injected into all AI prompts (flow generation, ideas, chat, edit, **and diagnosis**) without any extra wiring.

### Diagnosis Anti-Hallucination Policy
`debugAnalyze` enforces strict rules when the matching spec is unavailable: the AI must never fabricate schemas, field names, or claim "no body" without spec evidence. When spec is missing, confidence is forced low, `canYouFixIt` is set to `false`, category becomes `no_spec`, and the user message explicitly marks the spec as NOT AVAILABLE. This prevents the AI from suggesting incorrect fixes based on hallucinated API schemas. The `_debug` response field (`specFound`, `specSource`, `hasApiRules`, `model`) provides transparency into what context was available during diagnosis.

### Pre-Run Connection Health Check
`RunControls` runs a one-time health check on mount validating ALL connection types: OAuth connections verified via `/api/oauth/health-check/{connectionId}`, non-OAuth checked for `hasCredential`. Red error banner per version with "Settings → Connections" link. Run buttons disabled until health check passes. Replaces the previous 60-second OAuth status polling approach.

### Project Variable Validation (Two Layers)
- **Design-time** (`RunControls`): On every render, `findMissingProjVars()` + `findEmptyProjVars()` scan active flows for `{{proj.*}}` references. Missing or empty variables show a red banner with link to Settings → Variables; Run buttons are disabled until resolved.
- **Runtime** (`runner.ts`): Steps with unresolved `{{proj.*}}` placeholders are blocked individually with `suggestSimilarVar()` hints.

### API Version
`apiVersion` in settings rewrites ALL `/vN/` request paths at runtime. No hardcoded version segments anywhere.

---

## Hard-Won Gotchas (Read Before Debugging)

### Azure Functions 204 Body Bug
Status 204/205/304 MUST have `body: undefined` in Azure Functions v4. Even `Buffer.from(new ArrayBuffer(0))` triggers `TypeError` in undici during response serialization — producing a bare 500 with no diagnostic info. Always check null-body statuses.

### SWA 5xx Masking
Azure SWA strips body + custom headers from 5xx responses. Workaround: remap to 502 (passes through). Store original status in `X-FF-Upstream-Status`.

### Azure Functions Route Sharing
On SWA, multiple functions sharing the same route path with different HTTP methods causes GET 404. Consolidate into a single router function dispatching by `req.method`.

### SWA Config Placement
`staticwebapp.config.json` MUST live at **repo root** (not `public/` or `dist/`). SWA validates config before build runs. Never use catch-all `routes` (intercepts `/api/*`). Use `navigationFallback` only.

### Package.json Commits
Always commit `package.json` AND `package-lock.json` after installing packages. Without this, CI's `npm ci` fails silently and Oryx deploys raw source HTML → white screen.

### Cloudflare Browser Headers
Server-side fetch to Cloudflare-fronted endpoints needs browser User-Agent, Accept, and cookie jar. Bare `fetch()` gets rejected. Use `browserFetch()` from `api/src/lib/browserFetch.ts`.

### TestExplorer Race Conditions
Must wait for `useFlowStatusStore` to finish loading before building `parsedTags`. Gate on `loading` state, not just data presence.

### Batch Save Pattern
Never call `loadFlowsFromQueue` in a loop after parallel saves. Batch all saves, activate all, then load once.

### Enum Aliases
Some APIs return enum fields as integers at runtime (spec uses strings). `enumAliases.ts` + bidirectional `jsonEqual` handles name↔ordinal. Aliases are configurable per version folder via API Rules (`_system/_rules.json` in blob storage). Both browser and server runners load aliases from version folder context at startup via `setEnumAliases(raw)` which parses `name=value` format.

### Spec Distillation Backtick Format
Distilled spec markdown uses 4-backtick fenced blocks (````json) as the canonical format. `specRequiredFields.ts` regex accepts both 3 and 4 backticks for backward compatibility. If the distillation output looks wrong, check `DISTILL_VERSION` in `specDistillCache.ts` — bumping it forces re-distillation of all cached specs.

### Session-Expired Handling for Raw Fetch Modules
Any API module that uses raw `fetch()` instead of `apiClient` (e.g., `specFilesApi.ts`) must dispatch a `session-expired` custom event on 401 responses — otherwise expired Entra sessions cause blank screens instead of login redirects. The global `session-expired` handler in `App.tsx` must call both `useAuthStore.getState().logout()` AND `useEntraAuthStore.getState().check()` to trigger Entra re-authentication.

### Debugging 500s
For Azure Functions 500 with empty body: enable **Application Insights first** before theorizing. It reveals runtime exceptions invisible to browser.

---

## AI Integration Rules

### Cost Tracking (MANDATORY)
Every AI API call must report cost to `useAiCostStore`. Never add AI calls without wiring cost tracking. TopBar shows cumulative spend.

### Credit Enforcement
AI endpoints (`generateFlowIdeas`, `generateFlow`, `flowChat`, `debugAnalyze`) check project/user credit budgets before calling Claude (returns 402 if exhausted) and record usage after. Credits are seeded on project creation. Super Owners manage budgets via `/api/ai-credits`. TopBar shows project credit usage pill with red "exhausted" state.

### Model Selection
Shared registry at `api/src/lib/modelPricing.ts`. Default: Sonnet 4.6 ($3/$15 per Mtok). Opus overkill for structured output. All AI endpoints use the user-selected model (no hardcoded Haiku anywhere).

### Unified AI Context Builder
All AI functions (`generateFlow`, `generateFlowIdeas`, `flowChat`, `editFlow`, `debugAnalyze`) share a single context loader: `api/src/lib/aiContext.ts`. `loadAiContext()` returns an `AiContext` object that centralizes loading of spec context, API rules, project variables, and entity dependencies. Helpers: `enrichSystemPrompt()` appends rules/vars/deps to system prompts; `formatUserContext()` builds the user-facing context block. Also exports `findMatchingSpec()` (moved from `debugAnalyze.ts`). When adding a new AI endpoint, use `loadAiContext()` instead of independently loading context pieces.

### Spec Context Optimization
Three tiers of spec context: **Raw** (source) → **Distilled** (~50-100 lines/endpoint, for flow generation, max 15 files) → **Digest** (~2-3 lines/endpoint, for idea generation). `_digest.md` blob per version folder is a lightweight endpoint index grouped by resource. Folders with >20 specs (`DIGEST_THRESHOLD`) use digest; <=20 use full distilled specs. Digest auto-invalidated when spec files change. **Eagerly rebuilt during OpenAPI import** (`split-swagger` awaits `batchDistillAll` then calls `rebuildDigest`); lazy rebuild in `generateFlowIdeas` remains as fallback. Helper: `api/src/lib/specDigest.ts`. **Server-side spec selection**: `/api/generate-flow` accepts `ideaId` + `versionFolder` + `folderPath` and resolves relevant specs server-side (looks up idea from Cosmos, lists blob specs filtering `_system/_distilled/`, runs `filterRelevantSpecs` from `api/src/lib/specFileSelection.ts`). Falls back to client-provided `specFiles` for backward compatibility (e.g., ad-hoc prompts without an idea). Reduced cost from ~$0.70 to ~$0.05-0.10 per flow.

### No Regeneration Waste
Never regenerate ideas or flows that already exist. Cache, lock completed items, skip in batch ops.

### AI Idea Scoping
Ideas strictly scoped to endpoints in provided spec files. Never reference external endpoints.

---

## Deployment & CI/CD

### Environments
- **Staging** (`flowforge-document360-staging`) — auto-deploys on every push to `main`
- **Production** (`flowforge-document360-production`) — manual promote via GitHub Actions `workflow_dispatch`

### Pipeline
- `deploy-staging.yml`: push → build → test → deploy → smoke test
- `deploy-production.yml`: manual trigger (type "deploy" to confirm) → build → test → deploy → smoke test
- Frontend pre-built in CI (`skip_app_build: true`, `app_location: "dist"`)
- API bundled with esbuild to stay under 250MB SWA free-tier limit
- Jest unit tests run before deploy; smoke tests run after
- Version format: `MAJOR.MINOR.BUILD` where BUILD = git commit count
- `version.json` written to `dist/` during CI for update detection

### GitHub Secrets & Variables
- Secrets: `SWA_TOKEN_STAGING`, `SWA_TOKEN_PRODUCTION`
- Variables: `STAGING_URL`, `PRODUCTION_URL`

### Environment Variables (Azure Portal → SWA → Settings → Environment variables)
Required: `ANTHROPIC_API_KEY`, `COSMOS_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING`, `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`, `SEED_OWNER_OID`, `AUTH_ENABLED`
Optional (have defaults): none currently — all endpoint config is per-version via Connections

---

## Standing Rules

- Always `git push` after every commit (Azure SWA deploys on push)
- Always scan for file changes before editing — another Claude instance may have modified code
- After 2+ failed fix attempts, stop guessing — add console debug output, ask user to paste results
- Don't add guardrails or restrictions the user didn't ask for — implement exactly what was requested
- Split actions with different consequences into separate explicit buttons
- Every new Azure Function needs Jest unit tests

---

## Documentation Auto-Maintenance

After completing work that changes the project's structure, conventions, or architecture, spawn the **Docs Updater** agent in the background. This keeps `CLAUDE.md`, `README.md`, and `ARCHITECTURE.md` in sync with the actual codebase.

### When to trigger

Spawn after any of these:
- New page, store, API endpoint, or Cosmos container added
- New coding convention or gotcha discovered
- Existing architecture changed (e.g., store renamed, route moved, auth flow altered)
- New environment variable or deployment step introduced
- Domain rule added or changed (flow dependencies, validation, etc.)

Skip for: bug fixes, styling tweaks, or changes that don't affect the documented architecture.

### Docs Updater Agent

```
Agent tool:
  subagent_type: "general-purpose"
  run_in_background: true
  description: "Docs updater — sync project docs"
  prompt: |
    You are the Documentation Updater for FlowForge.

    Your job: review the changes described below and update the project
    documentation files to reflect them. Only touch sections that are
    affected — do not rewrite unchanged content.

    ## Files to maintain
    1. CLAUDE.md — Architecture quick reference, conventions, gotchas, rules
    2. README.md — Feature list, tech stack, setup, project structure
    3. ARCHITECTURE.md — Stores, endpoints, schema, data flow, patterns

    ## What changed this turn
    {{WORK_SUMMARY}}

    ## Instructions
    1. Read the three doc files
    2. Identify which sections are outdated or missing info
    3. Apply minimal, targeted edits (don't rewrite entire files)
    4. If a new store/endpoint/container/page was added, add it to the
       relevant table in ARCHITECTURE.md
    5. If a new convention or gotcha was discovered, add it to CLAUDE.md
    6. If a user-visible feature was added, update the Features section
       in README.md
    7. Do NOT commit — the main conversation will handle the commit
```

