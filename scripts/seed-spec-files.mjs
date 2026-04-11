/**
 * Seeds Azure Blob Storage with all local spec files under customer_api_endpoint_md_files/.
 * Uploads via the live /api/spec-files endpoint.
 *
 * Usage:
 *   node scripts/seed-spec-files.mjs
 *   node scripts/seed-spec-files.mjs http://localhost:7071  (local Functions dev)
 */

import { readFileSync, readdirSync, statSync } from "fs";
import { join, relative } from "path";
import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");
const SOURCE_DIR = join(ROOT, "customer_api_endpoint_md_files");
const API_BASE = process.argv[2]?.replace(/\/$/, "") ?? "https://jolly-flower-0e2e3bd10.1.azurestaticapps.net";

// Files to skip
const SKIP = new Set(["document360.swagger.v3.json"]);
const ALLOWED_EXTS = new Set([".md", ".xml", ".xsd", ".txt"]);

function walkFiles(dir) {
  const results = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      results.push(...walkFiles(full));
    } else {
      results.push(full);
    }
  }
  return results;
}

async function upload(blobName, content, contentType) {
  const url = `${API_BASE}/api/spec-files`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: blobName, content, contentType }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body}`);
  }
}

function contentType(filename) {
  if (filename.endsWith(".md")) return "text/markdown";
  if (filename.endsWith(".xml")) return "application/xml";
  if (filename.endsWith(".xsd")) return "application/xml";
  return "text/plain";
}

async function main() {
  console.log(`API: ${API_BASE}`);
  console.log(`Source: ${SOURCE_DIR}\n`);

  const allFiles = walkFiles(SOURCE_DIR);
  const toUpload = allFiles.filter((f) => {
    const name = f.split(/[\\/]/).pop();
    const ext = "." + name.split(".").pop();
    return !SKIP.has(name) && ALLOWED_EXTS.has(ext);
  });

  console.log(`Found ${toUpload.length} files to upload.\n`);

  let ok = 0;
  let fail = 0;

  for (const fullPath of toUpload) {
    const relPath = relative(SOURCE_DIR, fullPath).replace(/\\/g, "/");
    try {
      const content = readFileSync(fullPath, "utf-8");
      await upload(relPath, content, contentType(fullPath));
      console.log(`  ✓  ${relPath}`);
      ok++;
    } catch (err) {
      console.error(`  ✗  ${relPath} — ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} uploaded, ${fail} failed.`);
}

main().catch((err) => { console.error(err); process.exit(1); });
