/**
 * Moves every flow blob that lives at a top-level folder (e.g. articles/)
 * under v3/ so the Flow Manager tree mirrors the Spec Manager tree.
 *
 * Example: articles/foo.flow.xml → v3/articles/foo.flow.xml
 * Files already under v2/ or v3/ are left alone.
 *
 * Usage:
 *   node scripts/migrate-flows-to-v3.mjs
 *   node scripts/migrate-flows-to-v3.mjs http://localhost:7071
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

async function listFlows() {
  const res = await api("/api/flow-files");
  return res.json();
}

async function getFlow(name) {
  const res = await api(`/api/flow-files/content?name=${encodeURIComponent(name)}`);
  return res.text();
}

async function uploadFlow(name, xml, overwrite = false) {
  await api("/api/flow-files", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, xml, overwrite }),
  });
}

async function deleteFlow(name) {
  await api(`/api/flow-files?name=${encodeURIComponent(name)}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------

const all = await listFlows();
const toMigrate = all.filter((f) => {
  if (!f.name.endsWith(".flow.xml")) return false;
  // Skip anything already under v2/ or v3/
  if (/^v\d+\//.test(f.name)) return false;
  // Skip root-level files (no folder) — they stay where they are
  return f.name.includes("/");
});

if (toMigrate.length === 0) {
  console.log("No flow files need migrating.");
  process.exit(0);
}

console.log(`\nMigrating ${toMigrate.length} flow file(s) → v3/…\n`);

let ok = 0, fail = 0;
for (const file of toMigrate) {
  const oldName = file.name;
  const newName = `v3/${oldName}`;
  process.stdout.write(`  ${oldName} → ${newName} … `);
  try {
    const xml = await getFlow(oldName);
    await uploadFlow(newName, xml, false);
    await deleteFlow(oldName);
    console.log("done");
    ok++;
  } catch (err) {
    console.error(`FAILED: ${err.message}`);
    fail++;
  }
}

console.log(`\n${ok} migrated, ${fail} failed.\n`);
if (fail > 0) process.exit(1);
