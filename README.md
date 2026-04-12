# FlowForge

A React SPA for generating and managing API test flows. Analyses API specifications, generates test flow ideas using AI, and produces structured XML flow definitions for automated testing.

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
| Backend | Azure Functions v4 (Node.js) |
| AI | Anthropic Claude API (Sonnet 4 for ideas, Opus 4 for flows) |
| Storage | Azure Blob Storage (spec files) |
| Deployment | Azure Static Web Apps |
| CI/CD | GitHub Actions |

---

## Features

- **Spec Manager** — Upload, browse, and view API specification files (Markdown)
- **AI Flow Ideas** — Generate test flow ideas from spec files using Claude Sonnet 4
- **Flow Generation** — Convert selected ideas into structured XML flow definitions using Claude Opus 4
- **Test Runner** — Execute tests against live API endpoints with live pass/fail reporting
- **Spec Change Detection** — Fingerprint and diff API specs to catch breaking changes

---

## OAuth2 — Authorization Code + PKCE

- Credentials configured in `src/config/oauth.ts`
- `code_verifier` / `code_challenge` generated with the **Web Crypto API** — no libraries
- Token stored in **sessionStorage** (cleared on tab close)
- No client secret — PKCE provides the security guarantee

---

## Local Development

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build to /dist
```

### API Functions (local)

```bash
cd api
npm install
npm run build
func start         # http://localhost:7071
```

---

## Deployment

Pushes to `main` trigger the GitHub Actions workflow which builds and deploys to Azure Static Web Apps automatically.
