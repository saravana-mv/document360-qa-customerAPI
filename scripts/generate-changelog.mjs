#!/usr/bin/env node
/**
 * Generate changelog.json from git commit history for the WhatsNewModal.
 *
 * Usage (in CI):
 *   node scripts/generate-changelog.mjs <build_number>
 *
 * Reads the last 50 commits, groups them by date, categorizes by message
 * prefix, and merges with existing public/changelog.json entries.
 * Writes the result to dist/changelog.json.
 */

import { execSync } from "node:child_process";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const buildNum = parseInt(process.argv[2], 10);
if (!buildNum) {
  console.error("Usage: generate-changelog.mjs <build_number>");
  process.exit(1);
}

// ── Read existing static changelog (curated entries) ──────────────────
const staticPath = resolve(ROOT, "public/changelog.json");
let staticEntries = [];
if (existsSync(staticPath)) {
  try {
    staticEntries = JSON.parse(readFileSync(staticPath, "utf8"));
  } catch { /* ignore parse errors */ }
}
const lastStaticBuild = staticEntries.length > 0
  ? Math.max(...staticEntries.map((e) => e.build))
  : 0;

// ── Read git log ──────────────────────────────────────────────────────
// Format: "YYYY-MM-DD||commit subject"
const separator = "||";
const rawLog = execSync(
  `git log --format="%ad${separator}%s" --date=short -50`,
  { cwd: ROOT, encoding: "utf8" },
).trim();

if (!rawLog) {
  console.log("No commits found — using static changelog only.");
  writeOutput(staticEntries);
  process.exit(0);
}

const commits = rawLog
  .split("\n")
  .map((line) => {
    const idx = line.indexOf(separator);
    if (idx < 0) return null;
    return { date: line.slice(0, idx), message: line.slice(idx + separator.length) };
  })
  .filter(Boolean)
  // Skip noise and internal-only commits
  .filter((c) => {
    const msg = c.message.toLowerCase();
    if (msg.startsWith("merge ")) return false;
    if (msg.startsWith("co-authored-by:")) return false;
    if (msg.length < 10) return false;
    // Skip test fixture / CI-only changes
    if (/^fix test|test fixture|update test|bump version/i.test(c.message)) return false;
    return true;
  });

// ── Categorize commits ───────────────────────────────────────────────
function categorize(message) {
  const lower = message.toLowerCase();
  if (/^fix\b/.test(lower) || (/\bfix\b/.test(lower) && /\bbug\b|error|crash|broken|issue/.test(lower))) return "fix";
  if (/^add\b/.test(lower) || /^new\b/.test(lower) || /^feat/.test(lower) || /^implement/.test(lower)) return "feature";
  return "improvement";
}

function cleanMessage(message) {
  // Strip conventional commit prefix if present
  let cleaned = message.replace(/^(fix|feat|feature|improve|refactor|chore|docs|test|ci)[\s:()]*\s*/i, "");
  // Capitalize first letter
  cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  // Strip trailing Co-Authored-By
  cleaned = cleaned.replace(/\s*Co-Authored-By:.*$/i, "");
  return cleaned.trim();
}

// ── Build a single changelog entry for this deploy ───────────────────
// All commits in the fetch window become one entry for this build number.
// Use the most recent commit's date as the entry date.
const today = commits.length > 0 ? commits[0].date : new Date().toISOString().slice(0, 10);

const changes = commits
  .map((c) => ({
    type: categorize(c.message),
    text: cleanMessage(c.message),
  }))
  // Deduplicate by text (case-insensitive)
  .filter((c, i, arr) => arr.findIndex((x) => x.text.toLowerCase() === c.text.toLowerCase()) === i)
  // Cap at 15 changes per entry to keep the modal readable
  .slice(0, 15);

const currentDeploy = changes.length > 0 ? [{ build: buildNum, date: today, changes }] : [];

// ── Merge: current deploy first, then static history ─────────────────
const merged = [...currentDeploy, ...staticEntries].slice(0, 20); // cap at 20 entries

writeOutput(merged);
console.log(
  `Generated changelog: ${changes.length} changes for build ${buildNum}, ${staticEntries.length} historic entries.`,
);

function writeOutput(entries) {
  const outPath = resolve(ROOT, "dist/changelog.json");
  writeFileSync(outPath, JSON.stringify(entries, null, 2));
}
