#!/usr/bin/env node
/**
 * FlowForge Unified Diagnostic Script
 *
 * Two entry modes:
 *
 *   1. By Flow XML ID (blob path):
 *      node scripts/diagnose.mjs --flow <flowXmlId> ["problem statement"]
 *      node scripts/diagnose.mjs --flow V3/bulk-create.flow.xml "step 3 returns 404"
 *
 *   2. By Scenario ID:
 *      node scripts/diagnose.mjs --scenario <scenarioId> [stepNumber] ["problem statement"]
 *      node scripts/diagnose.mjs --scenario ebeb00a9-... 3
 *
 * Environment (auto-loaded from api/local.settings.json if not set):
 *   COSMOS_CONNECTION_STRING
 *   AZURE_STORAGE_CONNECTION_STRING
 *
 * Optionally set PROJECT_ID if multiple projects exist (auto-detected otherwise).
 */

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";

// Resolve deps from api/node_modules regardless of cwd
const __dirname = dirname(fileURLToPath(import.meta.url));
const require = createRequire(resolve(__dirname, "../api/node_modules/") + "/");
const { CosmosClient } = require("@azure/cosmos");
const { BlobServiceClient } = require("@azure/storage-blob");

// ── Load settings ──────────────────────────────────────────────────────────

function loadSettings() {
  const localSettingsPath = resolve(__dirname, "../api/local.settings.json");
  if (existsSync(localSettingsPath)) {
    try {
      const settings = JSON.parse(readFileSync(localSettingsPath, "utf-8"));
      return settings?.Values ?? {};
    } catch { /* ignore */ }
  }
  return {};
}

const settings = loadSettings();
const COSMOS_CS = process.env.COSMOS_CONNECTION_STRING || settings.COSMOS_CONNECTION_STRING || "";
const BLOB_CS = process.env.AZURE_STORAGE_CONNECTION_STRING || settings.AZURE_STORAGE_CONNECTION_STRING || "";

if (!COSMOS_CS) {
  console.error("Error: Set COSMOS_CONNECTION_STRING (env or api/local.settings.json).");
  process.exit(1);
}

const hasBlobAccess = !!BLOB_CS;
if (!hasBlobAccess) {
  console.error("Warning: AZURE_STORAGE_CONNECTION_STRING not set — blob-based sections (specs, rules, skills) will be skipped.");
}

const cosmos = new CosmosClient(COSMOS_CS);
const db = cosmos.database("flowforge");
const blobService = hasBlobAccess ? BlobServiceClient.fromConnectionString(BLOB_CS) : null;

// ── Parse CLI args ─────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let mode = "scenario"; // default
let flowXmlId = null;
let scenarioId = null;
let stepNumber = null;
let problemStatement = null;

if (args[0] === "--flow") {
  mode = "flow";
  flowXmlId = args[1];
  problemStatement = args.slice(2).join(" ") || null;
  if (!flowXmlId) {
    console.error("Usage: node scripts/diagnose.mjs --flow <flowXmlId> [problem statement]");
    process.exit(1);
  }
} else if (args[0] === "--scenario") {
  mode = "scenario";
  scenarioId = args[1];
  stepNumber = args[2] ? parseInt(args[2], 10) : null;
  problemStatement = args.slice(stepNumber ? 3 : 2).join(" ") || null;
  if (!scenarioId) {
    console.error("Usage: node scripts/diagnose.mjs --scenario <scenarioId> [stepNumber] [problem statement]");
    process.exit(1);
  }
} else {
  // Show help if no recognized flag
  console.error("FlowForge Diagnostic Script");
  console.error("");
  console.error("Usage:");
  console.error("  node scripts/diagnose.mjs --flow <flowXmlId> [problem statement]");
  console.error("  node scripts/diagnose.mjs --scenario <scenarioId> [stepNumber] [problem statement]");
  console.error("");
  console.error("Examples:");
  console.error("  node scripts/diagnose.mjs --flow V3/articles/create-article.flow.xml \"step 3 returns 404\"");
  console.error("  node scripts/diagnose.mjs --scenario ebeb00a9-b3ef-45f4-9cde-7631d4bb9adb 3");
  process.exit(1);
}

// ── Helpers ────────────────────────────────────────────────────────────────

async function downloadBlob(container, name) {
  if (!blobService) throw new Error("Blob storage not configured");
  const client = blobService.getContainerClient(container);
  const blob = client.getBlobClient(name);
  const res = await blob.download();
  const chunks = [];
  for await (const chunk of res.readableStreamBody) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf-8");
}

async function listBlobs(container, prefix) {
  if (!blobService) throw new Error("Blob storage not configured");
  const client = blobService.getContainerClient(container);
  const names = [];
  for await (const item of client.listBlobsFlat({ prefix })) {
    names.push(item.name);
  }
  return names;
}

function hr(title) {
  console.log(`\n${"=".repeat(80)}`);
  console.log(`  ${title}`);
  console.log("=".repeat(80));
}

function section(title) {
  console.log(`\n-- ${title} ${"--".repeat(Math.max(0, Math.floor((74 - title.length) / 2)))}`);
}

// ── Resolve flow doc ───────────────────────────────────────────────────────

hr("FLOWFORGE DIAGNOSTIC REPORT");

let flowDoc = null;
let projectId = process.env.PROJECT_ID || null;
let flowPath = null;
let flowXml = null;

if (mode === "flow") {
  console.log(`Mode:          Flow XML ID`);
  console.log(`Flow XML ID:   ${flowXmlId}`);
  if (problemStatement) console.log(`Problem:       ${problemStatement}`);

  section("1. Looking up flow document by path");

  // Look up flow doc — try exact match first, then fuzzy by path CONTAINS
  const cosmosId = "flow:" + flowXmlId.replace(/\//g, "|");

  if (!projectId) {
    // Exact match across all projects
    const { resources: exactMatches } = await db.container("flows").items.query({
      query: "SELECT * FROM c WHERE c.id = @id AND c.type = 'flow'",
      parameters: [{ name: "@id", value: cosmosId }],
    }).fetchAll();

    if (exactMatches.length > 0) {
      flowDoc = exactMatches[0];
      projectId = flowDoc.projectId;
    } else {
      // Fuzzy: search by path CONTAINS
      const searchTerm = flowXmlId.split("/").pop().replace(".flow.xml", "");
      console.log(`  Exact match not found. Searching for flows containing "${searchTerm}"...`);
      const { resources: fuzzyMatches } = await db.container("flows").items.query({
        query: "SELECT * FROM c WHERE c.type = 'flow' AND CONTAINS(c.path, @term)",
        parameters: [{ name: "@term", value: searchTerm }],
      }).fetchAll();

      if (fuzzyMatches.length === 1) {
        flowDoc = fuzzyMatches[0];
        projectId = flowDoc.projectId;
        flowXmlId = flowDoc.path;
        console.log(`  Found 1 match: ${flowDoc.path} (project: ${projectId})`);
      } else if (fuzzyMatches.length > 1) {
        console.log(`  Found ${fuzzyMatches.length} possible matches:`);
        for (const f of fuzzyMatches) {
          console.log(`    - ${f.path}  (project: ${f.projectId})`);
        }
        console.error("  Ambiguous — set PROJECT_ID or use a more specific flow path.");
        process.exit(1);
      } else {
        console.error("  No flow found matching that path.");
        process.exit(1);
      }
    }
  } else {
    // Exact match within the specified project
    const { resources } = await db.container("flows").items.query({
      query: "SELECT * FROM c WHERE c.id = @id AND c.projectId = @pid",
      parameters: [{ name: "@id", value: cosmosId }, { name: "@pid", value: projectId }],
    }).fetchAll();
    flowDoc = resources[0] ?? null;
  }

  flowPath = flowXmlId;
  console.log(`  Project ID:  ${projectId}`);

  if (flowDoc) {
    console.log(`  Cosmos doc:  found (id: ${flowDoc.id})`);
    console.log(`  Scenario ID: ${flowDoc.scenarioId ?? "not assigned"}`);
    console.log(`  Created by:  ${flowDoc.createdBy?.name ?? "unknown"}`);
    if (flowDoc.lockedBy) console.log(`  LOCKED by:   ${flowDoc.lockedBy.name}`);
    scenarioId = flowDoc.scenarioId ?? null;
  } else {
    console.log(`  Cosmos doc:  not found (flow may not have a scenario yet)`);
  }

} else {
  // Scenario mode
  console.log(`Mode:          Scenario ID`);
  console.log(`Scenario ID:   ${scenarioId}`);
  if (stepNumber) console.log(`Step focus:    ${stepNumber}`);
  if (problemStatement) console.log(`Problem:       ${problemStatement}`);

  section("1. Looking up flow document in Cosmos DB");

  const { resources: flowDocs } = await db.container("flows").items.query({
    query: 'SELECT * FROM c WHERE c.type="flow" AND c.scenarioId=@sid',
    parameters: [{ name: "@sid", value: scenarioId }],
  }).fetchAll();

  if (flowDocs.length === 0) {
    console.error(`  No flow found with scenarioId=${scenarioId}`);
    process.exit(1);
  }

  flowDoc = flowDocs[0];
  projectId = flowDoc.projectId;
  flowPath = flowDoc.path;

  console.log(`  Flow path:   ${flowPath}`);
  console.log(`  Project ID:  ${projectId}`);
  console.log(`  Created by:  ${flowDoc.createdBy?.name ?? "unknown"}`);
  console.log(`  Updated at:  ${flowDoc.updatedAt ?? "unknown"}`);
  if (flowDoc.lockedBy) console.log(`  LOCKED by:   ${flowDoc.lockedBy.name}`);
}

// ── 2. Get the flow XML ──────────────────────────────────────────────────

section("2. Flow XML content");

if (flowDoc?.xml) {
  flowXml = flowDoc.xml;
  console.log(`  Source: Cosmos flows container (inline xml field, ${flowXml.length} chars)`);
} else {
  // Try blob storage
  try {
    const blobPath = `${projectId}/${flowPath}`;
    flowXml = await downloadBlob("spec-files", blobPath);
    console.log(`  Source: Blob spec-files/${blobPath} (${flowXml.length} chars)`);
  } catch (e) {
    console.error(`  Failed to get flow XML: ${e.message}`);
    console.log("  Continuing without flow XML...");
  }
}

if (flowXml) {
  // Parse steps from XML
  const stepRegex = /<step\b[^>]*>([\s\S]*?)<\/step>/gi;
  const steps = [];
  let match;
  while ((match = stepRegex.exec(flowXml)) !== null) steps.push(match[0]);
  console.log(`  Total steps: ${steps.length}`);

  if (stepNumber && steps[stepNumber - 1]) {
    section(`2a. Step ${stepNumber} XML`);
    console.log(steps[stepNumber - 1]);
  }

  section("2b. Full Flow XML");
  console.log(flowXml);
}

// ── 3. Project variable analysis ────────────────────────────────────────

section("3. Project variable analysis");

const projVarRegex = /\{\{proj\.(\w+)\}\}/g;
const bareVarRegex = /proj\.(\w+)/g;
const templateVars = new Set();
const bareVars = new Set();

if (flowXml) {
  let m;
  while ((m = projVarRegex.exec(flowXml)) !== null) templateVars.add(m[1]);
  while ((m = bareVarRegex.exec(flowXml)) !== null) bareVars.add(m[1]);
}

const unwrapped = [...bareVars].filter(v => {
  const wrappedCount = (flowXml?.match(new RegExp(`\\{\\{proj\\.${v}\\}\\}`, "g")) || []).length;
  const allCount = (flowXml?.match(new RegExp(`proj\\.${v}`, "g")) || []).length;
  return allCount > wrappedCount;
});

console.log(`  Template vars ({{proj.*}}): ${[...templateVars].join(", ") || "none"}`);
if (unwrapped.length > 0) {
  console.log(`  !! UNWRAPPED proj vars:     ${unwrapped.join(", ")}`);
}

// Load actual project variables from Cosmos
let projectVars = {};
try {
  const { resource } = await db.container("settings").item("project_variables", projectId).read();
  if (resource?.variables) {
    if (Array.isArray(resource.variables)) {
      for (const v of resource.variables) {
        if (v.name && v.value !== undefined) projectVars[v.name] = v.value;
      }
    } else {
      projectVars = resource.variables;
    }
  }
} catch { /* no vars doc */ }

console.log(`\n  Defined project variables:`);
if (Object.keys(projectVars).length === 0) {
  console.log("    (none found)");
} else {
  for (const [k, v] of Object.entries(projectVars)) {
    console.log(`    ${k} = ${typeof v === "string" && v.length > 80 ? v.slice(0, 80) + "..." : v}`);
  }
}

const allReferenced = new Set([...templateVars, ...bareVars]);
const undefinedVars = [...allReferenced].filter(v => !(v in projectVars));
if (undefinedVars.length > 0) {
  console.log(`\n  !! UNDEFINED project vars: ${undefinedVars.join(", ")}`);
}

// ── 4. Connections ──────────────────────────────────────────────────────

section("4. Connections");

try {
  const { resources: connections } = await db.container("connections").items.query({
    query: "SELECT c.id, c.name, c.provider, c.baseUrl, c.draft FROM c WHERE c.projectId = @pid AND c.type = 'connection'",
    parameters: [{ name: "@pid", value: projectId }],
  }).fetchAll();

  if (connections.length === 0) {
    console.log("  No connections configured.");
  } else {
    for (const conn of connections) {
      console.log(`  ${conn.name} (${conn.provider}) — ${conn.baseUrl ?? "no base URL"}${conn.draft ? " [DRAFT]" : ""}`);
    }
  }
} catch (e) {
  console.log(`  Could not load connections: ${e.message}`);
}

// ── 5. Relevant spec files (distilled) ──────────────────────────────────

section("5. Relevant spec files");

const versionFolder = flowPath?.split("/")[0];
if (versionFolder && projectId) {
  const distilledPrefix = `${projectId}/${versionFolder}/_system/_distilled/`;
  try {
    const distilledBlobs = await listBlobs("spec-files", distilledPrefix);
    console.log(`  Found ${distilledBlobs.length} distilled spec(s) in ${versionFolder}`);

    // Determine which specs are relevant based on flow XML endpoint references
    let relevantBlobs = distilledBlobs;
    if (flowXml && distilledBlobs.length > 5) {
      // Extract paths from flow XML to narrow down relevant specs
      const pathRegex = /path="([^"]+)"/g;
      const flowPaths = new Set();
      let pm;
      while ((pm = pathRegex.exec(flowXml)) !== null) flowPaths.add(pm[1]);

      if (flowPaths.size > 0) {
        const scored = distilledBlobs.map(b => {
          const blobName = b.split("/").pop().replace(/\.md$/, "").replace(/---/g, "/");
          const score = [...flowPaths].filter(fp => {
            const fpNorm = fp.replace(/\{[^}]+\}/g, "").replace(/\/+/g, "/");
            return blobName.includes(fpNorm.split("/").slice(-2).join("/")) ||
                   fpNorm.includes(blobName.split("/").slice(-2).join("/"));
          }).length;
          return { blob: b, score };
        });
        const matched = scored.filter(s => s.score > 0).map(s => s.blob);
        if (matched.length > 0) {
          relevantBlobs = matched;
          console.log(`  Narrowed to ${relevantBlobs.length} relevant spec(s) based on flow paths`);
        }
      }
    }

    // Show up to 10 distilled specs
    const toShow = relevantBlobs.slice(0, 10);
    for (const blobName of toShow) {
      const shortName = blobName.replace(distilledPrefix, "");
      section(`5a. Spec: ${shortName}`);
      try {
        const content = await downloadBlob("spec-files", blobName);
        // Truncate very long specs
        if (content.length > 3000) {
          console.log(content.slice(0, 3000));
          console.log(`  ... (truncated, ${content.length} chars total)`);
        } else {
          console.log(content);
        }
      } catch (e) {
        console.log(`  Failed to download: ${e.message}`);
      }
    }
    if (relevantBlobs.length > 10) {
      console.log(`  ... and ${relevantBlobs.length - 10} more spec files`);
    }
  } catch (e) {
    console.log(`  Failed to list distilled specs: ${e.message}`);
  }
} else {
  console.log("  Could not determine version folder.");
}

// ── 6. API Rules & Skills ───────────────────────────────────────────────

section("6. API Rules (_rules.json)");

if (versionFolder && projectId) {
  try {
    const rules = await downloadBlob("spec-files", `${projectId}/${versionFolder}/_system/_rules.json`);
    console.log(rules);
  } catch {
    console.log("  No _rules.json found.");
  }
}

section("7. Learned Skills (_skills.md)");

if (versionFolder && projectId) {
  try {
    const skills = await downloadBlob("spec-files", `${projectId}/${versionFolder}/_system/_skills.md`);
    console.log(skills);
  } catch {
    try {
      const skills = await downloadBlob("spec-files", `${projectId}/${versionFolder}/Skills.md`);
      console.log(skills);
    } catch {
      console.log("  No _skills.md found.");
    }
  }
}

// ── 8. Related idea (if any) ────────────────────────────────────────────

section("8. Related idea");

if (flowDoc?.ideaId && projectId) {
  try {
    const { resources: ideas } = await db.container("ideas").items.query({
      query: "SELECT * FROM c WHERE c.id = @id AND c.projectId = @pid",
      parameters: [{ name: "@id", value: flowDoc.ideaId }, { name: "@pid", value: projectId }],
    }).fetchAll();
    if (ideas.length > 0) {
      const idea = ideas[0];
      // Find the specific idea entry
      const ideaEntries = idea.ideas ?? [];
      const entry = ideaEntries.find(i => i.id === flowDoc.ideaId.replace(/^ideas:/, "").split(":").pop());
      if (entry) {
        console.log(`  Title:       ${entry.title}`);
        console.log(`  Description: ${entry.description ?? ""}`);
        console.log(`  Method:      ${entry.method ?? ""} ${entry.endpoint ?? ""}`);
      } else {
        console.log(`  Idea doc found but entry not matched. Idea doc keys: ${Object.keys(idea).join(", ")}`);
      }
    } else {
      console.log("  Idea not found in Cosmos.");
    }
  } catch (e) {
    console.log(`  Could not load idea: ${e.message}`);
  }
} else {
  console.log("  No linked idea.");
}

// ── 9. Latest test runs ─────────────────────────────────────────────────

section("9. Latest test runs");

const runsContainer = db.container("test-runs");

if (scenarioId) {
  const { resources: scenarioRuns } = await runsContainer.items.query({
    query: 'SELECT * FROM c WHERE c.type="test_run" AND c.projectId=@pid AND c.scenarioId=@sid ORDER BY c.startedAt DESC OFFSET 0 LIMIT 3',
    parameters: [{ name: "@pid", value: projectId }, { name: "@sid", value: scenarioId }],
  }, { partitionKey: projectId }).fetchAll();

  if (scenarioRuns.length === 0) {
    console.log("  No test runs found for this scenario.");
  } else {
    console.log(`  Found ${scenarioRuns.length} run(s) for scenario ${scenarioId}`);

    for (const run of scenarioRuns) {
      section(`9a. Run ${run.id}`);
      console.log(`  Started:      ${run.startedAt}`);
      console.log(`  Completed:    ${run.completedAt}`);
      console.log(`  Source:        ${run.source ?? "browser"}`);
      console.log(`  Triggered by: ${run.triggeredBy?.name ?? "unknown"}`);

      if (run.summary) {
        console.log(`  Summary:      ${JSON.stringify(run.summary)}`);
      }

      // API-originated runs store steps directly
      if (run.steps && Array.isArray(run.steps)) {
        for (let i = 0; i < run.steps.length; i++) {
          const s = run.steps[i];
          const marker = s.status === "pass" ? "+" : s.status === "fail" ? "X" : "?";
          console.log(`    [${marker}] Step ${i + 1}: ${s.name ?? "(unnamed)"} -- ${s.method ?? ""} ${s.path ?? ""} -> HTTP ${s.httpStatus ?? "?"}`);
          if (s.failureReason) console.log(`        Failure: ${s.failureReason}`);

          if (stepNumber && i + 1 === stepNumber) {
            console.log(`\n    -- Step ${stepNumber} FULL DATA --`);
            console.log(JSON.stringify(s, null, 2));
          }
        }
      }

      // Browser runs — tagResults + testResults
      if (run.tagResults) {
        const flowNameMatch = flowXml?.match(/<flow[^>]*name="([^"]+)"/);
        const flowName = flowNameMatch ? flowNameMatch[1] : null;

        for (const [tag, result] of Object.entries(run.tagResults)) {
          if (!flowName || tag.includes(flowName) || tag.includes(scenarioId)) {
            console.log(`\n    [Tag: ${tag}]`);
            const tr = result;
            const tests = tr.tests ?? [];
            for (const t of tests) {
              const marker = t.status === "pass" ? "+" : t.status === "fail" ? "X" : "?";
              console.log(`      [${marker}] ${t.testName ?? ""} -- HTTP ${t.httpStatus ?? "?"}`);
              if (t.failureReason) console.log(`          Failure: ${t.failureReason}`);
            }
          }
        }
      }
    }
  }
} else {
  // No scenario — check for project-wide recent runs
  const { resources: recentRuns } = await runsContainer.items.query({
    query: 'SELECT c.id, c.startedAt, c.completedAt, c.source, c.summary FROM c WHERE c.type="test_run" AND c.projectId=@pid ORDER BY c.startedAt DESC OFFSET 0 LIMIT 3',
    parameters: [{ name: "@pid", value: projectId }],
  }, { partitionKey: projectId }).fetchAll();

  if (recentRuns.length === 0) {
    console.log("  No test runs found (no scenario assigned to this flow yet).");
  } else {
    console.log(`  No scenario ID — showing ${recentRuns.length} recent project-wide run(s):`);
    for (const r of recentRuns) {
      console.log(`    ${r.id} | ${r.startedAt} | ${r.source ?? "browser"} | ${JSON.stringify(r.summary ?? {})}`);
    }
  }
}

// ── 10. Digest (endpoint index) ─────────────────────────────────────────

section("10. Spec Digest (_digest.md)");

if (versionFolder && projectId) {
  try {
    const digest = await downloadBlob("spec-files", `${projectId}/${versionFolder}/_system/_digest.md`);
    console.log(digest);
  } catch {
    console.log("  No _digest.md found.");
  }
}

// ── Summary ─────────────────────────────────────────────────────────────

hr("DIAGNOSTIC SUMMARY");

const issues = [];
if (unwrapped.length > 0) issues.push(`${unwrapped.length} unwrapped proj.* variable(s) -- missing {{ }} template syntax`);
if (undefinedVars.length > 0) issues.push(`${undefinedVars.length} undefined project variable(s): ${undefinedVars.join(", ")}`);
if (!flowXml) issues.push("Flow XML not found -- cannot perform structural analysis");
if (problemStatement) issues.push(`User-reported problem: ${problemStatement}`);

if (issues.length > 0) {
  console.log("\n  Issues / Notes:");
  for (const issue of issues) console.log(`  >> ${issue}`);
} else {
  console.log("\n  No obvious issues detected in static analysis.");
}

console.log(`\n  Full data above -- provide this output to Claude Code for diagnosis.\n`);
