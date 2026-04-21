# FlowForge

An AI-assisted API testing platform for Document360. Import API specifications, generate test scenarios with Claude AI, execute tests against live endpoints, and track results — all from a single web app.

**Live:** https://jolly-flower-0e2e3bd10.1.azurestaticapps.net
**GitHub:** https://github.com/saravana-mv/document360-qa-customerAPI

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Frontend | React 19 + Vite 8 + TypeScript 5.9 |
| Styling | Tailwind CSS v4 (GitHub Primer design language) |
| State | Zustand (11 stores) |
| Routing | React Router v7 (BrowserRouter) |
| Backend | Azure Functions v4 (Node.js, esbuild bundled) |
| Database | Azure Cosmos DB (serverless, 8 containers) |
| File Storage | Azure Blob Storage (spec files only) |
| Auth | Entra ID (Azure AD) SSO + D360 OAuth proxy |
| AI | Anthropic Claude API (Sonnet 4.6 default, Opus 4.6, Haiku 4.5) |
| Deployment | Azure Static Web Apps + GitHub Actions CI/CD |
| Editor | CodeMirror 6 (XML viewer/editor) |

---

## Features

### Spec Manager
- Upload, browse, and view API specification files (Markdown)
- Import specs from external URLs with sync-from-source
- Drag-and-drop file/folder management with rename and move
- Version history for synced files (`_versions/` subfolder)

### AI Flow Workshop
- **Idea Generation** — Generate test flow ideas from spec context using Claude
- **Interactive Flow Designer** — ChatGPT-style multi-turn conversation to design flows
- **XML Generation** — Convert plans into validated `.flow.xml` definitions
- **AI Edit Mode** — Modify existing flows with natural language instructions + diff review
- Cost tracking with per-call and cumulative spend display

### Scenario Manager
- Version-based accordion layout with folder trees
- Drag-and-drop scenario organization (qa_manager role)
- Per-step breakpoint debugging (pause/resume)
- Live execution console with step-grouped log output
- Clickable run history with past result replay

### Authentication & Access Control
- Entra ID SSO (single-tenant) with role-based access
- Three roles: Owner > QA Manager > QA Engineer
- Per-version D360 auth (OAuth or API Key) — tokens stored server-side
- Server-side proxy injects bearer tokens (browser never holds D360 credentials)

### Public API
- `POST /api/run-scenario` with `X-API-Key` authentication
- Server-side flow execution engine
- Run persistence with API vs UI source badges
- API key management in Settings (SHA-256 hashed, `ff_` prefix)

### Team & Audit
- User management with role assignment (owner only)
- Scenario locking (owner/qa_manager can lock flows)
- Full audit log with filtering, pagination, and search
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
    "D360_API_BASE_URL": "https://apihub.document360.io",
    "SEED_OWNER_OID": "your-entra-oid"
  }
}
```

Set `AUTH_ENABLED=false` for local dev to bypass Entra ID.

---

## Deployment

Pushes to `main` trigger the GitHub Actions workflow:

1. `npm test` — API unit tests
2. `npm run build` (API) — esbuild bundle + prune devDependencies
3. `npm run build` (Frontend) — Vite production build
4. Write `version.json` to `dist/` for update detection
5. Copy `staticwebapp.config.json` into `dist/`
6. Deploy to Azure SWA with `skip_app_build: true`
7. Smoke test deployed endpoints

### Azure Portal Configuration

**Static Web App → Settings → Environment variables:**

| Variable | Purpose |
|----------|---------|
| `ANTHROPIC_API_KEY` | Claude API access |
| `COSMOS_CONNECTION_STRING` | Cosmos DB serverless |
| `AZURE_STORAGE_CONNECTION_STRING` | Blob storage for spec files |
| `AAD_CLIENT_ID` | Entra ID app registration |
| `AAD_CLIENT_SECRET` | Entra ID secret |
| `D360_API_BASE_URL` | Document360 API upstream URL |
| `D360_TOKEN_URL` | D360 OAuth token endpoint |
| `D360_CLIENT_ID` | D360 OAuth client ID |
| `D360_CLIENT_SECRET` | D360 OAuth client secret |
| `SEED_OWNER_OID` | Entra OID for initial owner account |
| `AUTH_ENABLED` | `true` in production |

---

## Project Structure

```
├── src/                        # React frontend
│   ├── pages/                  # SpecFilesPage, TestPage, SettingsPage, etc.
│   ├── components/             # auth/, common/, specfiles/, explorer/, runner/, results/, setup/
│   ├── store/                  # 11 Zustand stores
│   ├── lib/
│   │   ├── api/                # 20 API client modules
│   │   ├── tests/              # Test execution engine + flow XML system
│   │   ├── oauth/              # OAuth PKCE flow
│   │   ├── flow/               # AI prompt builder
│   │   └── spec/               # OpenAPI parser, fingerprinting, diffing
│   ├── types/                  # TypeScript interfaces
│   └── hooks/                  # Auth guard, version check
│
├── api/src/                    # Azure Functions backend
│   ├── functions/              # 25+ HTTP endpoint handlers
│   ├── lib/
│   │   ├── flowRunner/         # Server-side XML→test execution engine
│   │   ├── cosmosClient.ts     # 8 Cosmos containers
│   │   ├── auth.ts             # Entra ID claim extraction
│   │   ├── browserFetch.ts     # Cookie jar + browser headers for URL fetching
│   │   └── modelPricing.ts     # Claude model token costs
│   └── __tests__/              # Jest unit tests
│
├── scripts/                    # smoke-test, seed-spec-files, cleanup
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
