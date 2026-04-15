#!/usr/bin/env node
/**
 * Post-deployment smoke test.
 *
 * Usage:  node scripts/smoke-test.mjs https://jolly-flower-0e2e3bd10.1.azurestaticapps.net
 *
 * Exits 0 if all checks pass, 1 if any fail.
 * Run this in CI immediately after the Azure SWA deploy step.
 *
 * After the Entra ID gate was added (Phase 1), the smoke test verifies that:
 *   1. The SPA HTML is still served.
 *   2. Every /api/* route rejects anonymous requests with HTTP 401 — proving
 *      the SWA auth policy (allowedRoles: authenticated) is active AND the
 *      withAuth() wrapper is blocking calls at the function level.
 * Functional checks that require an authenticated session must run against a
 * separate pre-prod environment (or be driven by an integration test that
 * obtains an Entra session token) — they're no longer appropriate here.
 */

const BASE_URL = process.argv[2]?.replace(/\/$/, "");

if (!BASE_URL) {
  console.error("Usage: smoke-test.mjs <base-url>");
  process.exit(1);
}

const checks = [
  // ── Static app ────────────────────────────────────────────────────────────
  {
    label: "SPA root returns 200",
    path: "/",
    expectStatus: 200,
  },

  // ── API routes must reject anonymous callers with 401 ────────────────────
  // One check per registered route to confirm the Entra gate is in front of
  // every function. Expect 401 regardless of method — the auth policy short-
  // circuits before the function handler runs.
  { label: "GET /api/spec-files is gated (401)",             path: "/api/spec-files",              expectStatus: 401 },
  { label: "GET /api/spec-files/content is gated (401)",     path: "/api/spec-files/content",      expectStatus: 401 },
  { label: "GET /api/spec-files/sources is gated (401)",     path: "/api/spec-files/sources",      expectStatus: 401 },
  { label: "POST /api/spec-files/import-url is gated (401)", path: "/api/spec-files/import-url",   method: "POST", body: {}, expectStatus: 401 },
  { label: "POST /api/spec-files/sync is gated (401)",       path: "/api/spec-files/sync",         method: "POST", body: {}, expectStatus: 401 },
  { label: "GET /api/flow-files is gated (401)",             path: "/api/flow-files",              expectStatus: 401 },
  { label: "GET /api/flow-files/content is gated (401)",     path: "/api/flow-files/content",      expectStatus: 401 },
  { label: "POST /api/generate-flow is gated (401)",         path: "/api/generate-flow",           method: "POST", body: {}, expectStatus: 401 },
  { label: "POST /api/generate-flow-ideas is gated (401)",   path: "/api/generate-flow-ideas",     method: "POST", body: {}, expectStatus: 401 },

  // D360 server-side auth + proxy (Phase 2). All of these sit behind the
  // Entra gate — the catch-all proxy route must also be protected.
  { label: "POST /api/d360/auth/exchange is gated (401)",    path: "/api/d360/auth/exchange",      method: "POST", body: {}, expectStatus: 401 },
  { label: "GET /api/d360/auth/status is gated (401)",       path: "/api/d360/auth/status",        expectStatus: 401 },
  { label: "POST /api/d360/auth/logout is gated (401)",      path: "/api/d360/auth/logout",        method: "POST", body: {}, expectStatus: 401 },
  { label: "GET /api/d360/proxy/v3/ping is gated (401)",     path: "/api/d360/proxy/v3/ping",      expectStatus: 401 },
];

async function runCheck(check) {
  const url = `${BASE_URL}${check.path}`;
  const method = check.method ?? (check.body !== undefined ? "POST" : "GET");
  const hasBody = check.body !== undefined;

  try {
    const res = await fetch(url, {
      method,
      headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      body: hasBody ? JSON.stringify(check.body) : undefined,
      redirect: "manual", // don't follow auth redirects
    });

    if (res.status !== check.expectStatus) {
      console.error(`  FAIL  ${check.label}`);
      console.error(`        expected HTTP ${check.expectStatus}, got HTTP ${res.status}`);
      console.error(`        ${method} ${url}`);
      return false;
    }

    console.log(`  pass  ${check.label}  (HTTP ${res.status})`);
    return true;
  } catch (err) {
    console.error(`  FAIL  ${check.label} — network error: ${err}`);
    return false;
  }
}

console.log(`\nSmoke test: ${BASE_URL}\n`);
const results = await Promise.all(checks.map(runCheck));
const failed = results.filter((r) => !r).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
if (failed > 0) {
  console.error(`${failed} check(s) failed — deployment is broken\n`);
  process.exit(1);
}
console.log("All checks passed\n");
