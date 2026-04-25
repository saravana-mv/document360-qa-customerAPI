# FlowForge

A generic AI-assisted API testing platform. Import API specifications, connect any REST endpoint, generate test scenarios with Claude AI, execute tests against live endpoints, and track results — all from a single web app. Fully generic — no vendor-specific context in the test execution pipeline. Path parameters in flow XML resolve from project variables (`proj.*`) at runtime.

**Staging:** https://purple-mud-0bc0f5203.7.azurestaticapps.net
**Production:** https://delightful-smoke-0a3c52a03.7.azurestaticapps.net
**GitHub:** https://github.com/saravana-mv/document360-qa-customerAPI

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Frontend | React 19 + Vite 8 + TypeScript 5.9 |
| Styling | Tailwind CSS v4 (GitHub Primer design language) |
| State | Zustand (15 stores) |
| Routing | React Router v7 (BrowserRouter) |
| Backend | Azure Functions v4 (Node.js, esbuild bundled) |
| Database | Azure Cosmos DB (serverless, 13 containers) |
| File Storage | Azure Blob Storage (spec files only) |
| Auth | Entra ID (Azure AD) SSO + generic OAuth/credential proxy |
| AI | Anthropic Claude API (Sonnet 4.6 default, Opus 4.6, Haiku 4.5) |
| Deployment | Azure Static Web Apps + GitHub Actions CI/CD |
| Editor | CodeMirror 6 (XML viewer/editor) |

---

## Features

### Spec Manager
- Upload, browse, and view API specification files (Markdown)
- Import specs from external URLs with sync-from-source
- **Full spec splitting** — Upload or import an OpenAPI 3.x / Swagger 2.x JSON spec and auto-split into per-endpoint .md files organized by tag-based folders (handles $ref resolution, collision avoidance, batch upload)
- Drag-and-drop file/folder management with rename and move
- Version history for synced files (`_versions/` subfolder)

### AI Flow Workshop
- **Idea Generation** — Generate test flow ideas from spec context using Claude
- **Interactive Flow Designer** — ChatGPT-style multi-turn conversation to design flows
- **XML Generation** — Convert plans into validated `.flow.xml` definitions
- **AI Edit Mode** — Modify existing flows with natural language instructions + diff review
- Cost tracking with per-call and cumulative spend display
- AI credit budgets per project/user with enforcement (402 when exhausted) and Super Owner management

### Scenario Manager
- Version-based accordion layout with folder trees
- Drag-and-drop scenario organization (qa_manager role)
- Per-step breakpoint debugging (pause/resume)
- Live execution console with step-grouped log output
- Clickable run history with past result replay

### Connections & Connect Endpoint (Generic API Support)
- Centralized connection management in Settings → Connections (all auth types)
- Supported providers: OAuth 2.0, Bearer, API Key (header/query), Basic, Cookie
- Credentials stored server-side — browser never holds API secrets (`hasCredential` flag only)
- Simplified Connect Endpoint modal: Base URL, API Version, Connection picker
- Version accordion shows connection status badge ("Not connected" / endpoint label)
- Run gating — prompts Connect Endpoint modal if version not connected
- **OpenAPI auto-detection** — Automatically detects endpoint config from uploaded/imported OpenAPI 3.x / Swagger 2.x specs, shown as pre-fill in Connect modal
- **Per-scenario environment overrides** — Override version-level endpoint config on individual scenarios (TagNode context menu), with blue badge indicator

### Authentication & Access Control
- Entra ID SSO (single-tenant) with role-based access
- Five roles: Owner (Super) > Project Owner > QA Manager > QA Engineer > Member
- Per-project membership with `ProjectGate` route guard
- Centralized Connections (Settings → Connections) supporting all auth types — credentials stored server-side
- Generic proxy (`/api/proxy/*`) injects appropriate auth based on connection provider type via `X-FF-Connection-Id` lookup

### Public API
- `POST /api/run-scenario` with `X-API-Key` authentication
- Server-side flow execution engine
- Run persistence with API vs UI source badges
- API key management in Settings (SHA-256 hashed, `ff_` prefix)

### Team & Audit
- User management with role assignment (owner only)
- Scenario locking (owner/qa_manager can lock flows)
- Full audit log with filtering, pagination, and search
- Multi-project support with full-screen Project Selection page (tile grid, create, team/personal visibility)
- Per-project membership management via Settings > Members tab (add/remove members, assign roles)
- Project-level variables (`proj.varName`) — shared key/value pairs interpolated at runtime in both browser and server runners; also used to resolve `{any_name}` path parameters in flow XML (e.g., `{project_id}` maps to `proj.project_id`)
- **API Rules (version-folder scoped)** — per-version-folder configurable rules and enum aliases (stored as `_rules.json` in blob storage), injected into AI prompts; enum aliases loaded at runtime by both browser and server runners; inline editor in Spec Manager on top-level version folders
- Project reset (owner only — wipes flows, ideas, runs)

### Deployment Intelligence
- Auto-update detection with "Relaunch" banner (polls `version.json`)
- Semantic versioning: `MAJOR.MINOR.BUILD` (BUILD = git commit count)

---

## Local Development

### Prerequisites
- Node.js 20+
- Azure Functions Core Tools v4 (`npm i -g azure-functions-core-tools@4`)
- Azure Cosmos DB connection string
- Azure Storage connection string
- Anthropic API key

### Frontend

```bash
npm install
npm run dev          # http://localhost:5173
npm run build        # production build → /dist
npx tsc -b           # type-check (must pass before pushing)
```

### Backend (Azure Functions)

```bash
cd api
npm install
npm run build        # esbuild bundle
npm test             # Jest unit tests
func start           # http://localhost:7071
```

Vite proxies `/api/*` to `localhost:7071` during development (see `vite.config.ts`).

### Environment Variables

Create `api/local.settings.json`:

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "ANTHROPIC_API_KEY": "sk-ant-...",
    "COSMOS_CONNECTION_STRING": "AccountEndpoint=...",
    "AZURE_STORAGE_CONNECTION_STRING": "DefaultEndpointsProtocol=...",
    "AUTH_ENABLED": "false",
    "SEED_OWNER_OID": "your-entra-oid"
  }
}
```

Set `AUTH_ENABLED=false` for local dev to bypass Entra ID.

---

## Deployment

### Environments

| Environment | SWA Resource | Trigger |
|-------------|-------------|---------|
| Staging | `flowforge-document360-staging` | Auto on push to `main` |
| Production | `flowforge-document360-production` | Manual (`workflow_dispatch`, type "deploy" to confirm) |

### CI/CD Pipeline

Both environments follow the same build steps:

1. `npm test` — API unit tests
2. `npm run build` (API) — esbuild bundle + prune devDependencies
3. `npm run build` (Frontend) — Vite production build
4. Write `version.json` to `dist/` for update detection
5. Copy `staticwebapp.config.json` into `dist/`
6. Deploy to Azure SWA with `skip_app_build: true`
7. Smoke test deployed endpoints

### GitHub Secrets & Variables

| Name | Type | Purpose |
|------|------|---------|
| `SWA_TOKEN_STAGING` | Secret | Staging SWA deployment token |
| `SWA_TOKEN_PRODUCTION` | Secret | Production SWA deployment token |
| `STAGING_URL` | Variable | Staging URL for smoke tests |
| `PRODUCTION_URL` | Variable | Production URL for smoke tests |

### Azure Portal Configuration

**Static Web App → Settings → Environment variables:**

| Variable | Required | Purpose |
|----------|----------|---------|
| `ANTHROPIC_API_KEY` | Yes | Claude API access |
| `COSMOS_CONNECTION_STRING` | Yes | Cosmos DB serverless |
| `AZURE_STORAGE_CONNECTION_STRING` | Yes | Blob storage for spec files |
| `AAD_CLIENT_ID` | Yes | Entra ID app registration |
| `AAD_CLIENT_SECRET` | Yes | Entra ID secret |
| `SEED_OWNER_OID` | Yes | Entra OID for initial owner account |
| `AUTH_ENABLED` | Yes | `false` staging, `true` production |
| _(none currently)_ | — | All endpoint config is per-version via Connections |

---

## Project Structure

```
├── src/                        # React frontend
│   ├── pages/                  # ProjectSelectionPage, SpecFilesPage, TestPage, SettingsPage, etc.
│   ├── components/             # auth/, common/, specfiles/, explorer/, runner/, results/, setup/
│   ├── store/                  # 15 Zustand stores
│   ├── lib/
│   │   ├── api/                # 22 API client modules
│   │   ├── tests/              # Test execution engine + flow XML system
│   │   ├── oauth/              # OAuth PKCE flow
│   │   ├── flow/               # AI prompt builder
│   │   ├── spec/               # OpenAPI parser, fingerprinting, diffing, autoDetectEndpoint
│   │   └── curlParser.ts       # cURL command parser for Connect Endpoint auto-detection
│   ├── types/                  # TypeScript interfaces
│   └── hooks/                  # Auth guard, version check
│
├── api/src/                    # Azure Functions backend
│   ├── functions/              # 25+ HTTP endpoint handlers
│   ├── lib/
│   │   ├── flowRunner/         # Server-side XML→test execution engine
│   │   ├── cosmosClient.ts     # 12 Cosmos containers
│   │   ├── auth.ts             # Entra ID claim extraction
│   │   ├── browserFetch.ts     # Cookie jar + browser headers for URL fetching
│   │   └── modelPricing.ts     # Claude model token costs
│   └── __tests__/              # Jest unit tests
│
├── scripts/                    # smoke-test, seed-spec-files, cleanup, migrate-project-scoping
├── .github/workflows/          # CI/CD pipeline
├── staticwebapp.config.json    # SWA routing + Entra ID auth
├── vite.config.ts              # Build config with version injection
└── CLAUDE.md                   # Claude Code instructions (read this!)
```

See [ARCHITECTURE.md](ARCHITECTURE.md) for detailed component documentation.

---

## Working with Claude Code

This project is optimized for development with [Claude Code](https://claude.com/claude-code). The `CLAUDE.md` file contains:

- Architecture quick reference
- Coding conventions (TypeScript, font sizing, design tokens)
- Domain rules (flow dependencies, validation requirements)
- Hard-won gotchas (Azure Functions quirks, SWA routing, Cloudflare headers)
- AI integration rules (cost tracking, model selection)
- Deployment instructions

A new developer should read `CLAUDE.md` before starting — it captures months of accumulated knowledge that prevents repeating solved problems.
