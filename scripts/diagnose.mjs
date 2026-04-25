#!/usr/bin/env node
/**
 * FlowForge Diagnostic Script
 *
 * Usage (run from the api/ directory so Azure SDK deps resolve):
 *   cd api && node ../scripts/diagnose.mjs <scenarioId> [stepNumber]
 *
 * Environment variables required:
 *   COSMOS_CONNECTION_STRING    — Azure Cosmos DB connection string
 *   AZURE_STORAGE_CONNECTION_STRING — Azure Blob Storage connection string
 *
 * Optionally set PROJECT_ID if multiple projects exist (auto-detected otherwise).
 *
 * Example:
 *   cd api && node ../scripts/diagnose.mjs ebeb00a9-b3ef-45f4-9cde-7631d4bb9adb 3
 */

import { CosmosClient } from "@azure/cosmos";
import { BlobServiceClient } from "@azure/storage-blob";

const COSMOS_CS = process.env.COSMOS_CONNECTION_STRING;
const BLOB_CS = process.env.AZURE_STORAGE_CONNECTION_STRING;

if (!COSMOS_CS || !BLOB_CS) {
  console.error("Error: Set COSMOS_CONNECTION_STRING and AZURE_STORAGE_CONNECTION_STRING env vars.");
  process.exit(1);
}

const scenarioId = process.argv[2];
const stepNumber = process.argv[3] ? parseInt(process.argv[3], 10) : null;

if (!scenarioId) {
  console.error("Usage: node scripts/diagnose.mjs <scenarioId> [stepNumber]");
  process.exit(1);
}

const cosmos = new CosmosClient(COSMOS_CS);
const db = cosmos.database("flowforge");
const blobService = BlobServiceClient.fromConnectionString(BLOB_CS);

// ── Helpers ──────────────────────────────────────────────────────────────────

async function downloadBlob(container, name) {
  const client = blobService.getContainerClient(container);
  const blob = client.getBlobClient(name);
  const res = await blob.download();
  const chunks = [];
  for await (const chunk of res.readableStreamBody) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

function hr(title) {
  console.log(`\n${"═".repeat(80)}`);
  console.log(`  ${title}`);
  console.log("═".repeat(80));
}

function section(title) {
  console.log(`\n── ${title} ${"─".repeat(Math.max(0, 74 - title.length))}`);
}

// ── 1. Find the flow doc by scenarioId ───────────────────────────────────────

hr("FLOWFORGE DIAGNOSTIC REPORT");
console.log(`Scenario ID: ${scenarioId}`);
if (stepNumber) console.log(`Step focus:   ${stepNumber}`);

section("1. Looking up flow document in Cosmos DB");

const flowsContainer = db.container("flows");
const { resources: flowDocs } = await flowsContainer.items.query({
  query: 'SELECT * FROM c WHERE c.type="flow" AND c.scenarioId=@sid',
  parameters: [{ name: "@sid", value: scenarioId }],
}).fetchAll();

if (flowDocs.length === 0) {
  console.error(`  No flow found with scenarioId=${scenarioId}`);
  process.exit(1);
}

const flowDoc = flowDocs[0];
const projectId = flowDoc.projectId;
const flowPath = flowDoc.path; // e.g. "V3/category-publish-unpublish-lifecycle-with-settings-update.flow.xml"

console.log(`  Flow path:   ${flowPath}`);
console.log(`  Project ID:  ${projectId}`);
console.log(`  Created by:  ${flowDoc.createdBy?.name ?? "unknown"}`);
console.log(`  Updated at:  ${flowDoc.updatedAt ?? "unknown"}`);
if (flowDoc.lockedBy) console.log(`  LOCKED by:   ${flowDoc.lockedBy.name}`);

// ── 2. Download the flow XML ─────────────────────────────────────────────────

section("2. Flow XML content");

let flowXml;
try {
  const blobPath = `${projectId}/${flowPath}`;
  flowXml = await downloadBlob("spec-files", blobPath);
  console.log(`  Blob: spec-files/${blobPath} (${flowXml.length} chars)`);
} catch (e) {
  console.error(`  Failed to download flow XML: ${e.message}`);
  process.exit(1);
}

// Parse steps from XML
const stepRegex = /<step\b[^>]*>([\s\S]*?)<\/step>/gi;
const steps = [];
let match;
while ((match = stepRegex.exec(flowXml)) !== null) {
  steps.push(match[0]);
}
console.log(`  Total steps: ${steps.length}`);

// If a step number is specified, show that step in detail
if (stepNumber && steps[stepNumber - 1]) {
  section(`2a. Step ${stepNumber} XML`);
  console.log(steps[stepNumber - 1]);
} else if (stepNumber) {
  console.log(`  Step ${stepNumber} not found (only ${steps.length} steps)`);
}

// Show full XML
section("2b. Full Flow XML");
console.log(flowXml);

// ── 3. Check for project variable issues ─────────────────────────────────────

section("3. Project variable analysis");

// Find all proj.* references in the XML
const projVarRegex = /\{\{proj\.(\w+)\}\}/g;
const bareVarRegex = /proj\.(\w+)/g;
const templateVars = new Set();
const bareVars = new Set();

let m;
while ((m = projVarRegex.exec(flowXml)) !== null) templateVars.add(m[1]);

// Reset and find bare (non-template) references
const flowXmlCopy = flowXml;
while ((m = bareVarRegex.exec(flowXmlCopy)) !== null) bareVars.add(m[1]);

// Bare vars that aren't wrapped in {{ }}
const unwrapped = [...bareVars].filter(v => {
  // Check if this var appears somewhere WITHOUT {{ }} wrapping
  const wrappedPattern = new RegExp(`\\{\\{proj\\.${v}\\}\\}`, "g");
  const allPattern = new RegExp(`proj\\.${v}`, "g");
  const wrappedCount = (flowXml.match(wrappedPattern) || []).length;
  const allCount = (flowXml.match(allPattern) || []).length;
  return allCount > wrappedCount;
});

console.log(`  Template vars ({{proj.*}}): ${[...templateVars].join(", ") || "none"}`);
console.log(`  All proj.* refs:            ${[...bareVars].join(", ") || "none"}`);
if (unwrapped.length > 0) {
  console.log(`  ⚠ UNWRAPPED proj vars:     ${unwrapped.join(", ")}`);
  console.log(`    These use proj.X instead of {{proj.X}} — they won't resolve at runtime!`);
}

// Load actual project variables from Cosmos
const settingsContainer = db.container("settings");
let projectVars = {};
try {
  const { resource } = await settingsContainer.item("project_variables", projectId).read();
  if (resource?.variables) {
    projectVars = resource.variables;
  }
} catch { /* no vars doc */ }

// Try project-variables container too
try {
  const pvContainer = db.container("project-variables");
  const { resources: pvDocs } = await pvContainer?.items?.query?.({
    query: 'SELECT * FROM c WHERE c.projectId=@pid',
    parameters: [{ name: "@pid", value: projectId }],
  })?.fetchAll?.() ?? { resources: [] };
  if (pvDocs.length > 0) {
    // merge
    for (const doc of pvDocs) {
      if (doc.key && doc.value !== undefined) projectVars[doc.key] = doc.value;
    }
  }
} catch { /* container may not exist */ }

console.log(`\n  Defined project variables:`);
if (Object.keys(projectVars).length === 0) {
  console.log("    (none found)");
} else {
  for (const [k, v] of Object.entries(projectVars)) {
    console.log(`    ${k} = ${typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "..." : v}`);
  }
}

// Check for undefined references
const allReferenced = new Set([...templateVars, ...bareVars]);
const undefined_ = [...allReferenced].filter(v => !(v in projectVars));
if (undefined_.length > 0) {
  console.log(`\n  ⚠ UNDEFINED project vars: ${undefined_.join(", ")}`);
  console.log(`    These are referenced in the flow XML but not defined in project variables.`);
}

// ── 4. Find the latest test run ──────────────────────────────────────────────

section("4. Latest test run");

const runsContainer = db.container("test-runs");
const { resources: runs } = await runsContainer.items.query({
  query: 'SELECT * FROM c WHERE c.type="test_run" AND c.projectId=@pid ORDER BY c.startedAt DESC OFFSET 0 LIMIT 5',
  parameters: [{ name: "@pid", value: projectId }],
}, { partitionKey: projectId }).fetchAll();

if (runs.length === 0) {
  console.log("  No test runs found.");
} else {
  const latestRun = runs[0];
  console.log(`  Run ID:      ${latestRun.id}`);
  console.log(`  Started:     ${latestRun.startedAt}`);
  console.log(`  Completed:   ${latestRun.completedAt}`);
  console.log(`  Triggered by: ${latestRun.triggeredBy?.name ?? "unknown"}`);

  if (latestRun.summary) {
    section("4a. Run Summary");
    console.log(JSON.stringify(latestRun.summary, null, 2));
  }

  // Find test results for this scenario's tag
  if (latestRun.testResults) {
    section("4b. Test Results for this scenario");
    const results = Object.entries(latestRun.testResults);

    // Filter results that match this flow's tag (flow name from XML)
    const flowNameMatch = flowXml.match(/<flow[^>]*name="([^"]+)"/);
    const flowName = flowNameMatch ? flowNameMatch[1] : null;
    console.log(`  Flow name: ${flowName ?? "(not found)"}`);

    const relevantResults = flowName
      ? results.filter(([key]) => key.includes(flowName) || key.includes(scenarioId))
      : results;

    if (relevantResults.length === 0) {
      console.log("  No matching test results found. Showing all:");
      for (const [key, val] of results.slice(0, 10)) {
        console.log(`\n  [${key}]`);
        console.log(JSON.stringify(val, null, 2));
      }
    } else {
      for (const [key, val] of relevantResults) {
        console.log(`\n  [${key}]`);
        console.log(JSON.stringify(val, null, 2));
      }
    }
  }

  // Show relevant log entries
  if (latestRun.log && Array.isArray(latestRun.log)) {
    section("4c. Run Log (last 30 entries)");
    const logEntries = latestRun.log.slice(-30);
    for (const entry of logEntries) {
      if (typeof entry === "string") {
        console.log(`  ${entry}`);
      } else {
        console.log(`  ${JSON.stringify(entry)}`);
      }
    }
  }
}

// ── 5. Check Skills.md for existing lessons ──────────────────────────────────

section("5. Existing lessons (Skills.md)");

const versionFolder = flowPath.split("/")[0];
try {
  const skills = await downloadBlob("spec-files", `${projectId}/${versionFolder}/Skills.md`);
  console.log(skills);
} catch {
  console.log("  No Skills.md found for this version folder.");
}

// ── 6. Summary ───────────────────────────────────────────────────────────────

hr("DIAGNOSTIC SUMMARY");

const issues = [];
if (unwrapped.length > 0) issues.push(`${unwrapped.length} unwrapped proj.* variable(s) — missing {{ }} template syntax`);
if (undefined_.length > 0) issues.push(`${undefined_.length} undefined project variable(s): ${undefined_.join(", ")}`);

if (issues.length > 0) {
  console.log("\n  Issues found:");
  for (const issue of issues) console.log(`  ⚠ ${issue}`);
} else {
  console.log("\n  No obvious issues detected in static analysis.");
}

console.log(`\n  Full data above — provide this output to Claude Code for diagnosis.\n`);
