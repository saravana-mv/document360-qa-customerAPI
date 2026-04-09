# Document360 QA Customer API Test Runner

A React SPA for running automated tests against the Document360 Customer API (QA / Berlin environment). Tests are organised hierarchically by tag → endpoint → operation, with live pass/fail rollup, per-level timing, and a post-run summary.

**Deployed:** https://jolly-flower-0e2e3bd10.1.azurestaticapps.net
**GitHub:** https://github.com/saravana-mv/document360-qa-customerAPI

---

## Tech Stack

| Concern | Choice |
|---------|--------|
| Framework | React 19 + Vite 8 |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS v4 |
| State | Zustand (4 stores) |
| Routing | React Router v7 |
| Deployment | Azure Static Web Apps |
| CI/CD | GitHub Actions |

**No backend.** The entire app is a pure SPA — no Express, no Azure Functions, no server of any kind.

---

## OAuth2 — Authorization Code + PKCE

- Credentials are hardcoded in `src/config/oauth.ts` (Berlin QA identity server)
- `code_verifier` / `code_challenge` generated with the **Web Crypto API** (`crypto.subtle`) — no libraries
- `acr_values=project_select` is added to the authorisation request so the identity server prompts the user to select a project and embeds `doc360_project_id` in the JWT
- Token stored in **sessionStorage** (cleared on tab close); no refresh token needed for short test sessions
- No client secret — PKCE provides the security guarantee

### OAuth endpoints (`src/config/oauth.ts`)
```
clientId:         apiHubWordClient
authorizationUrl: https://identity.berlin.document360.net/connect/authorize
tokenUrl:         https://identity.berlin.document360.net/connect/token
scope:            openid profile email customerApi offline_access
redirectUri:      <origin>/callback  (auto-set from window.location.origin)
```

---

## Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `LoginScreen` | OAuth sign-in button |
| `/callback` | `OAuthCallback` | Handles auth code exchange after redirect |
| `/setup` | `SetupPage` | Project/version/article config |
| `/test` | `TestPage` | Test explorer + runner + results |

All routes fall back to `/index.html` via `staticwebapp.config.json` (SPA routing).

---

## Project Structure

```
src/
├── config/
│   └── oauth.ts                  # OAuth credentials
├── types/
│   ├── auth.types.ts             # OAuthConfig, TokenSet, AuthStatus
│   ├── spec.types.ts             # SwaggerSpec, ParsedTag, SpecDiff
│   ├── test.types.ts             # TestDef, TestResult, RunSummary, LogEntry
│   └── api.types.ts              # Project, ProjectVersion, Article, ApiError
├── store/                        # Zustand global state
│   ├── auth.store.ts             # Token, auth status
│   ├── spec.store.ts             # Parsed tags, fingerprint, diff
│   ├── setup.store.ts            # Project/version/articleId (localStorage)
│   └── runner.store.ts           # Test results, live log, selection, summary
├── lib/
│   ├── oauth/
│   │   ├── pkce.ts               # Web Crypto: code_verifier, code_challenge, state
│   │   ├── flow.ts               # startAuthFlow(), handleCallback()
│   │   └── session.ts            # sessionStorage wrappers
│   ├── api/
│   │   ├── client.ts             # fetch wrapper: Bearer auth, 429 retry
│   │   ├── projects.ts           # JWT decode → project ID; GET /v3/projects/{id}
│   │   ├── project-versions.ts   # GET /v3/.../project-versions (KnowledgeBase only)
│   │   ├── articles.ts           # GET/PATCH article, versions, settings, workflow, bulk
│   │   ├── categories.ts         # Placeholder
│   │   └── drive.ts              # Placeholder
│   ├── spec/
│   │   ├── loader.ts             # Fetch swagger.json with auth header
│   │   ├── parser.ts             # SwaggerSpec → ParsedTag[]
│   │   ├── fingerprint.ts        # SHA-256 hash of normalised spec → localStorage
│   │   └── differ.ts             # Diff two specs → added/removed/changed
│   └── tests/
│       ├── registry.ts           # In-memory test registry
│       ├── runner.ts             # Sequential execution, setup/teardown, cancellation
│       ├── assertions.ts         # assertStatus(), assertBodyHasField(), etc.
│       ├── context.ts            # buildTestContext() from token + setup state
│       ├── buildParsedTags.ts    # Build explorer tree from registry (no spec fetch)
│       └── suites/
│           ├── articles.suite.ts # 13 tests: GET/PATCH article, settings, workflow, bulk
│           ├── categories.suite.ts  # Placeholder
│           └── drive.suite.ts       # Placeholder
├── components/
│   ├── auth/         LoginScreen.tsx, OAuthCallback.tsx
│   ├── common/       Layout, TopBar, Badge, Modal, Spinner, ErrorBoundary
│   ├── setup/        SetupPanel.tsx
│   ├── explorer/     TestExplorer, TagNode, EndpointNode, OperationNode, StatusIcon
│   ├── runner/       RunControls, LiveLog, ProgressBar
│   └── results/      ResultsPanel, SummaryDrawer, TagSummaryRow, DiffModal
├── pages/
│   ├── SetupPage.tsx
│   └── TestPage.tsx
└── hooks/
    └── useAuthGuard.ts           # Redirect to / if not authenticated
```

---

## Key Design Decisions

### Project detection from JWT
There is no "list projects" API endpoint. The project ID is decoded directly from the `doc360_project_id` claim in the JWT — the same approach used by the Document360 Word plugin. The project name is then fetched from `GET /v3/projects/{id}`.

### Version filtering
`GET /v3/projects/{id}/project-versions` returns both `KnowledgeBase` and `ApiDocumentation` version types. Only `KnowledgeBase` versions are shown in the setup screen.

### No spec fetch for the test explorer
The Swagger spec endpoint (`/swagger/v3/swagger.json`) blocks CORS from external domains. Since all tests are hardcoded in suites, the explorer tree is built directly from the test registry via `buildParsedTagsFromRegistry()` — no external fetch needed.

### Test runner
- Tests run **sequentially within a tag**, sharing a `RunState` object (e.g. article ID created in step 1 reused in step 2)
- **Teardown always runs** (in a `finally` block) to ensure cleanup even if a test throws
- **Cancellation** is checked before each test; remaining tests are marked `skip`
- Live events are emitted to `runner.store` → React re-renders in real time

### Articles suite — non-destructive
The spec has no `POST /articles`, so tests require a pre-existing test article ID entered on the setup screen. All tests modify then restore the original state (title, settings, workflow status, bulk hidden flag).

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to /dist
```

### OAuth redirect for local dev
Add `http://localhost:5173/callback` (and `http://localhost:5174/callback`) to the allowed redirect URIs for `apiHubWordClient` in the Document360 identity server.

---

## Deployment

Pushes to `main` trigger the GitHub Actions workflow (`.github/workflows/azure-static-web-apps-jolly-flower-0e2e3bd10.yml`) which builds and deploys to Azure Static Web Apps automatically.

The OAuth redirect URI registered for the deployed app:
```
https://jolly-flower-0e2e3bd10.1.azurestaticapps.net/callback
```
