# Claude Code Instructions — FlowForge

## Project Overview

FlowForge is an AI-assisted API testing platform for Document360. It lets QA teams import API specs, generate test flow ideas and XML definitions using Claude, execute tests against live endpoints, and track results — all from a single web app.

**Stack:** React 19 + Vite 8 + Tailwind v4 + Zustand | Azure Functions v4 (Node.js) + Cosmos DB | Entra ID auth | Anthropic Claude API
**Deployed:** Azure Static Web Apps at `https://jolly-flower-0e2e3bd10.1.azurestaticapps.net/`

---

## Architecture Quick Reference

### Pages
- **Spec Manager** (`src/pages/SpecFilesPage.tsx`) — Spec files, AI ideas, flow XML authoring, interactive flow chat
- **Scenario Manager** (`src/pages/TestPage.tsx`) — Version-based test tree, runner, run history, breakpoints
- **Settings** (`src/pages/SettingsPage.tsx`) — General, API Keys, Users, Audit Log (role-gated tabs)

### Data Layer
- **Cosmos DB** (8 containers, all partitioned by `/projectId`): `flows`, `ideas`, `test-runs`, `settings` (`/userId`), `users` (`/tenantId`), `api-keys`, `audit-log`, `flow-chat-sessions`
- **Blob Storage**: Only `spec-files` container remains (reference docs, `_sources.json` manifests)
- **localStorage**: Pure UI state only (tree expansion, panel widths, breakpoints)

### Key Stores (Zustand)
`auth.store` (OAuth session), `setup.store` (project/version/AI model), `user.store` (role), `flowStatus.store` (flow activation), `runner.store` (test execution), `scenarioOrg.store` (folder tree), `aiCost.store` (spend tracking), `breakpoints.store` (step pause/resume)

### API Functions (`api/src/functions/`)
25+ Azure Functions. All wrapped with `withAuth()`. Key routes: `/api/spec-files/*`, `/api/flow-files`, `/api/flow-chat`, `/api/generate-flow-ideas`, `/api/generate-flow`, `/api/run-scenario`, `/api/d360/*` (proxy), `/api/active-tests`, `/api/test-runs`, `/api/users`, `/api/api-keys`, `/api/audit-log`

### Auth Flow
Entra ID SSO → `EntraGate` auto-login → `withAuth()` extracts OID/project from claims → D360 tokens in Azure Table Storage → proxy injects bearer at `/api/d360/*` → browser never holds real D360 token

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

### React State
- **Never seed `useState` from module-level constants** — always call loader inside initializer: `useState(() => loadFromStorage())`
- View state persistence must include ALL UI state (tree expansion, tabs, selections)

### Terminology
- In **Test Manager**: say "scenario" (with steps). Never "test" or "flow" in UI strings.
- In **Spec Manager**: say "flow" (the XML authoring artifact)

---

## Domain Rules

### Flow Dependencies (CRITICAL)
- Every flow that creates an article MUST start with: Create Category → Create Article. End with teardown: Delete Article → Delete Category.
- The D360 API requires `category_id` even though spec marks it nullable.
- Check for entity dependencies whenever writing new flows.

### Flow File Rules
- Names: max 80 chars including `.flow.xml`
- Never replace existing flow file without asking user first
- Flow XML must pass schema validation before tests can be created
- Flows with active tests cannot be deleted — must delete tests first
- Deleting tests must NOT delete flow XML files (flows are reusable)

### Flow XML Schema
Three authoritative sources must stay in sync: `FLOW_SYSTEM_PROMPT` in `generateFlow.ts`, `flow.xsd`, `parser.ts`. Common AI mistakes: wrong element names (`<assert>` vs `<assertion>`), wrong attributes (`value` vs `code` on status), steps not in `<steps>` wrapper.

### API Version
`apiVersion` in settings rewrites ALL `/vN/` request paths at runtime. No hardcoded version segments anywhere.

---

## Hard-Won Gotchas (Read Before Debugging)

### Azure Functions 204 Body Bug
Status 204/205/304 MUST have `body: undefined` in Azure Functions v4. Even `Buffer.from(new ArrayBuffer(0))` triggers `TypeError` in undici during response serialization — producing a bare 500 with no diagnostic info. Always check null-body statuses.

### SWA 5xx Masking
Azure SWA strips body + custom headers from 5xx responses. Workaround: remap to 502 (passes through). Store original status in `X-D360-Upstream-Status`.

### Azure Functions Route Sharing
On SWA, multiple functions sharing the same route path with different HTTP methods causes GET 404. Consolidate into a single router function dispatching by `req.method`.

### SWA Config Placement
`staticwebapp.config.json` MUST live at **repo root** (not `public/` or `dist/`). SWA validates config before build runs. Never use catch-all `routes` (intercepts `/api/*`). Use `navigationFallback` only.

### Package.json Commits
Always commit `package.json` AND `package-lock.json` after installing packages. Without this, CI's `npm ci` fails silently and Oryx deploys raw source HTML → white screen.

### Cloudflare Browser Headers
Server-side fetch to Document360 endpoints needs browser User-Agent, Accept, and cookie jar. Bare `fetch()` gets rejected. Use `browserFetch()` from `api/src/lib/browserFetch.ts`.

### TestExplorer Race Conditions
Must wait for `useFlowStatusStore` to finish loading before building `parsedTags`. Gate on `loading` state, not just data presence.

### Batch Save Pattern
Never call `loadFlowsFromQueue` in a loop after parallel saves. Batch all saves, activate all, then load once.

### Enum Aliases
D360 API returns enum fields as integers at runtime (spec uses strings). `enumAliases.ts` + bidirectional `jsonEqual` handles name↔ordinal.

### Debugging 500s
For Azure Functions 500 with empty body: enable **Application Insights first** before theorizing. It reveals runtime exceptions invisible to browser.

---

## AI Integration Rules

### Cost Tracking (MANDATORY)
Every AI API call must report cost to `useAiCostStore`. Never add AI calls without wiring cost tracking. TopBar shows cumulative spend.

### Model Selection
Shared registry at `api/src/lib/modelPricing.ts`. Default: Sonnet 4.6 ($3/$15 per Mtok). Opus overkill for structured output.

### Spec Context Optimization
Max 5 files, 50k chars sent to AI. `filterRelevantSpecs()` on frontend. Reduced cost from ~$0.70 to ~$0.05–0.10 per flow.

### No Regeneration Waste
Never regenerate ideas or flows that already exist. Cache, lock completed items, skip in batch ops.

### AI Idea Scoping
Ideas strictly scoped to endpoints in provided spec files. Never reference external endpoints.

---

## Deployment & CI/CD

- `git push` to `main` triggers GitHub Actions → builds frontend + API → deploys to Azure SWA
- Frontend pre-built in CI (`skip_app_build: true`, `app_location: "dist"`)
- API bundled with esbuild to stay under 250MB SWA free-tier limit
- Jest unit tests run before deploy; smoke tests run after
- Version format: `MAJOR.MINOR.BUILD` where BUILD = git commit count
- `version.json` written to `dist/` during CI for update detection

### Environment Variables (Azure Portal → SWA → Settings → Environment variables)
`ANTHROPIC_API_KEY`, `COSMOS_CONNECTION_STRING`, `AZURE_STORAGE_CONNECTION_STRING`, `AAD_CLIENT_ID`, `AAD_CLIENT_SECRET`, `D360_API_BASE_URL`, `D360_TOKEN_URL`, `D360_CLIENT_ID`, `D360_CLIENT_SECRET`, `SEED_OWNER_OID`, `AUTH_ENABLED`

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

