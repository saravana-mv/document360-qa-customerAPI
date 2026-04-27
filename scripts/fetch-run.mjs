#!/usr/bin/env node
// Fetch a test run from Cosmos DB and output it as JSON for diagnostic analysis.
//
// Usage:
//   node scripts/fetch-run.mjs <run-id> [--summary] [--output <file>]
//
// Environment:
//   COSMOS_CONNECTION_STRING — required (env var or api/local.settings.json)
//
// Examples:
//   node scripts/fetch-run.mjs run:ca94a18d-a623-4094-9098-0c1d8a5a725a
//   node scripts/fetch-run.mjs run:ca94a18d-a623-4094-9098-0c1d8a5a725a --summary
//   node scripts/fetch-run.mjs run:ca94a18d-a623-4094-9098-0c1d8a5a725a --output run.json

import { createRequire } from "module";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";
import { writeFileSync, readFileSync, existsSync } from "fs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../api/node_modules/") + "/");
const { CosmosClient } = require("@azure/cosmos");

function loadConnectionString() {
  if (process.env.COSMOS_CONNECTION_STRING) return process.env.COSMOS_CONNECTION_STRING;
  const localSettingsPath = resolve(__dirname, "../api/local.settings.json");
  if (existsSync(localSettingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(localSettingsPath, "utf-8"));
      if (settings?.Values?.COSMOS_CONNECTION_STRING) return settings.Values.COSMOS_CONNECTION_STRING;
    } catch { /* ignore */ }
  }
  return "";
}

function printSummary(run) {
  const s = run.summary ?? {};
  const ctx = run.context ?? {};
  const log = console.error.bind(console);

  log("\n─── Run Summary ───────────────────────────────────────");
  log(`  Run ID:      ${run.id}`);
  log(`  Project:     ${run.projectId}`);
  log(`  Started:     ${run.startedAt}`);
  log(`  Completed:   ${run.completedAt}`);
  log(`  Duration:    ${s.durationMs}ms`);
  log(`  Source:      ${run.source ?? "ui"}`);
  log(`  Triggered:   ${run.triggeredBy?.name ?? "Unknown"}`);
  log(`  Results:     ${s.total} total — ${s.pass} pass, ${s.fail} fail, ${s.skip} skip, ${s.error} error`);

  if (ctx.baseUrl) log(`  Base URL:    ${ctx.baseUrl}`);
  if (ctx.apiVersion) log(`  API Version: ${ctx.apiVersion}`);
  if (ctx.connectionId) log(`  Connection:  ${ctx.connectionId}`);

  if (ctx.projectVariables && Object.keys(ctx.projectVariables).length > 0) {
    log(`  Variables:   ${Object.keys(ctx.projectVariables).length} project variables captured`);
  }

  if (run.flowSnapshots && Object.keys(run.flowSnapshots).length > 0) {
    log(`  Flows:       ${Object.keys(run.flowSnapshots).length} flow XML snapshots captured`);
  }

  const tagResults = run.tagResults ?? {};
  const tags = Object.keys(tagResults);
  if (tags.length > 0) {
    log("\n─── Scenarios ─────────────────────────────────────────");
    for (const tag of tags) {
      const tr = tagResults[tag];
      const icon = tr.status === "pass" ? "✓" : tr.status === "fail" ? "✗" : "◌";
      log(`  ${icon} ${tag} [${tr.status}] ${tr.durationMs}ms`);
      const tests = tr.tests ?? [];
      for (const t of tests) {
        if (t.status === "fail" || t.status === "error") {
          log(`    ✗ ${t.testName} [${t.status}] HTTP ${t.httpStatus ?? "—"}`);
          if (t.failureReason) log(`      → ${t.failureReason.slice(0, 200)}`);
        }
      }
    }
  }

  if (run.steps && run.steps.length > 0) {
    log("\n─── Steps ─────────────────────────────────────────────");
    for (const step of run.steps) {
      const icon = step.status === "pass" ? "✓" : step.status === "fail" ? "✗" : "◌";
      log(`  ${icon} Step ${step.number}: ${step.name} [${step.status}] HTTP ${step.httpStatus ?? "—"} ${step.durationMs}ms`);
      if (step.failureReason) log(`    → ${step.failureReason.slice(0, 200)}`);
    }
  }

  log("───────────────────────────────────────────────────────\n");
}

async function main() {
  const connectionString = loadConnectionString();
  if (!connectionString) {
    console.error("Error: COSMOS_CONNECTION_STRING not found.");
    console.error("Set it as an environment variable or in api/local.settings.json");
    return process.exit(1);
  }

  const args = process.argv.slice(2);
  const runId = args.find((a) => !a.startsWith("--"));
  const summaryMode = args.includes("--summary");
  const outputIdx = args.indexOf("--output");
  const outputFile = outputIdx >= 0 ? args[outputIdx + 1] : null;

  if (!runId) {
    console.error("Usage: node scripts/fetch-run.mjs <run-id> [--summary] [--output <file>]");
    return process.exit(1);
  }

  const databaseName = process.env.COSMOS_DATABASE_NAME ?? "flowforge";
  const client = new CosmosClient(connectionString);
  const container = client.database(databaseName).container("test-runs");

  console.error(`Fetching ${runId}...`);
  const { resources } = await container.items.query({
    query: "SELECT * FROM c WHERE c.id = @id",
    parameters: [{ name: "@id", value: runId }],
  }).fetchAll();

  if (resources.length === 0) {
    console.error(`Run not found: ${runId}`);
    return process.exit(1);
  }

  const run = resources[0];

  if (summaryMode) {
    printSummary(run);
    return;
  }

  const json = JSON.stringify(run, null, 2);

  if (outputFile) {
    writeFileSync(outputFile, json, "utf-8");
    console.error(`Written to ${outputFile} (${(json.length / 1024).toFixed(1)} KB)`);
    printSummary(run);
  } else {
    console.log(json);
  }
}

main().catch((err) => {
  console.error("Error:", err.message ?? err);
  process.exit(1);
});
