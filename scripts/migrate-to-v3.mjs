/**
 * Migrates all blobs under articles/ → v3/articles/ via the live API.
 *
 * Usage:
 *   node scripts/migrate-to-v3.mjs
 *   node scripts/migrate-to-v3.mjs http://localhost:7071  (local Functions dev)
 */

const API_BASE = (process.argv[2] ?? "https://jolly-flower-0e2e3bd10.1.azurestaticapps.net").replace(/\/$/, "");

async function api(path, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, options);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status} ${path}: ${text}`);
  }
  return res;
}

async function listFiles(prefix) {
  const res = await api(`/api/spec-files?prefix=${encodeURIComponent(prefix)}`);
  return res.json();
}

async function getContent(name) {
  const res = await api(`/api/spec-files/content?name=${encodeURIComponent(name)}`);
  return res.text();
}

async function uploadFile(name, content, contentType) {
  await api("/api/spec-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, content, contentType }),
  });
}

async function deleteFile(name) {
  await api(`/api/spec-files?name=${encodeURIComponent(name)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------

const files = await listFiles("articles/");
if (files.length === 0) {
  console.log("No files found under articles/ — nothing to migrate.");
  process.exit(0);
}

console.log(`\nMigrating ${files.length} file(s): articles/ → v3/articles/\n`);

let ok = 0, fail = 0;

for (const file of files) {
  const oldName = file.name;                              // e.g. articles/get-article.md
  const newName = `v3/${oldName}`;                        // e.g. v3/articles/get-article.md
  const contentType = file.contentType ?? "text/plain";

  process.stdout.write(`  ${oldName} → ${newName} … `);
  try {
    const content = await getContent(oldName);
    await uploadFile(newName, content, contentType);
    await deleteFile(oldName);
    console.log("done");
    ok++;
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} migrated, ${fail} failed.\n`);
if (fail > 0) process.exit(1);
