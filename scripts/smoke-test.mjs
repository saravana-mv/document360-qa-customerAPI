#!/usr/bin/env node
/**
 * Post-deployment smoke test.
 *
 * Usage:  node scripts/smoke-test.mjs https://jolly-flower-0e2e3bd10.1.azurestaticapps.net
 *
 * Exits 0 if all checks pass, 1 if any fail.
 * Run this in CI immediately after the Azure SWA deploy step.
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

  // ── spec-files GET (this was the broken route) ────────────────────────────
  {
    label: "GET /api/spec-files returns 200 with array",
    path: "/api/spec-files",
    expectStatus: 200,
    expectArray: true,
  },

  // ── spec-files OPTIONS (CORS preflight) ───────────────────────────────────
  {
    label: "OPTIONS /api/spec-files returns 204",
    path: "/api/spec-files",
    method: "OPTIONS",
    expectStatus: 204,
  },

  // ── spec-files POST with invalid body → 400 (confirms function is reachable)
  {
    label: "POST /api/spec-files with empty body returns 400",
    path: "/api/spec-files",
    method: "POST",
    body: {},
    expectStatus: 400,
  },

  // ── spec-files/content missing name → 400 ────────────────────────────────
  {
    label: "GET /api/spec-files/content without name returns 400",
    path: "/api/spec-files/content",
    expectStatus: 400,
  },

  // ── generate-flow POST with invalid body → 400 ───────────────────────────
  {
    label: "POST /api/generate-flow with empty body returns 400",
    path: "/api/generate-flow",
    method: "POST",
    body: {},
    expectStatus: 400,
  },
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
    });

    if (res.status !== check.expectStatus) {
      console.error(`  FAIL  ${check.label}`);
      console.error(`        expected HTTP ${check.expectStatus}, got HTTP ${res.status}`);
      console.error(`        ${method} ${url}`);
      return false;
    }

    if (check.expectArray) {
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch {
        console.error(`  FAIL  ${check.label} — response is not JSON`);
        return false;
      }
      if (!Array.isArray(parsed)) {
        console.error(`  FAIL  ${check.label} — expected JSON array, got: ${text.slice(0, 200)}`);
        return false;
      }
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
