#!/usr/bin/env node
/**
 * Full data reset — wipes ALL Cosmos DB documents and ALL spec-files blobs.
 * Use this to start completely fresh.
 *
 * Prerequisites:
 *   - AZURE_STORAGE_CONNECTION_STRING
 *   - COSMOS_CONNECTION_STRING
 *
 * Optional:
 *   DRY_RUN=true — preview what would be deleted
 *
 * Usage:
 *   AZURE_STORAGE_CONNECTION_STRING="..." COSMOS_CONNECTION_STRING="..." \
 *   node scripts/reset-all-data.mjs
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const BLOB_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const COSMOS_CONN = process.env.COSMOS_CONNECTION_STRING;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!BLOB_CONN) { console.error("AZURE_STORAGE_CONNECTION_STRING required"); process.exit(1); }
if (!COSMOS_CONN) { console.error("COSMOS_CONNECTION_STRING required"); process.exit(1); }

const DB_NAME = "flowforge";
const COSMOS_CONTAINERS = [
  { id: "flows", partitionKey: "projectId" },
  { id: "ideas", partitionKey: "projectId" },
  { id: "test-runs", partitionKey: "projectId" },
  { id: "settings", partitionKey: "userId" },
  { id: "users", partitionKey: "tenantId" },
  { id: "api-keys", partitionKey: "projectId" },
  { id: "audit-log", partitionKey: "projectId" },
  { id: "flow-chat-sessions", partitionKey: "projectId" },
  { id: "projects", partitionKey: "tenantId" },
  { id: "project-members", partitionKey: "projectId" },
];

const BLOB_CONTAINERS = ["spec-files"];

async function main() {
  console.log("=== FlowForge Full Data Reset ===");
  console.log(`  Dry run: ${DRY_RUN}\n`);

  // ── 1. Clear all Cosmos DB containers ──
  console.log("--- Cosmos DB ---\n");
  const cosmosClient = new CosmosClient(COSMOS_CONN);
  const db = cosmosClient.database(DB_NAME);

  for (const def of COSMOS_CONTAINERS) {
    const container = db.container(def.id);
    try {
      const { resources } = await container.items
        .query({ query: "SELECT c.id, c[\"" + def.partitionKey + "\"] AS pk FROM c" })
        .fetchAll();

      if (resources.length === 0) {
        console.log(`  ${def.id}: empty`);
        continue;
      }

      if (DRY_RUN) {
        console.log(`  ${def.id}: WOULD delete ${resources.length} documents`);
      } else {
        let deleted = 0;
        for (const doc of resources) {
          try {
            await container.item(doc.id, doc.pk).delete();
            deleted++;
          } catch (e) {
            // Try without partition key value as fallback
            try { await container.item(doc.id, undefined).delete(); deleted++; } catch { /* skip */ }
          }
        }
        console.log(`  ${def.id}: deleted ${deleted}/${resources.length} documents`);
      }
    } catch (e) {
      if (e.code === 404) {
        console.log(`  ${def.id}: container does not exist — skipping`);
      } else {
        console.error(`  ${def.id}: ERROR — ${e.message}`);
      }
    }
  }

  // ── 2. Clear all blob containers ──
  console.log("\n--- Blob Storage ---\n");
  const blobService = BlobServiceClient.fromConnectionString(BLOB_CONN);

  for (const name of BLOB_CONTAINERS) {
    const container = blobService.getContainerClient(name);
    let count = 0;
    try {
      for await (const blob of container.listBlobsFlat()) {
        if (DRY_RUN) {
          if (count < 10) console.log(`  ${name}: WOULD delete ${blob.name}`);
          else if (count === 10) console.log(`  ${name}: ... and more`);
        } else {
          await container.getBlobClient(blob.name).deleteIfExists();
        }
        count++;
      }
      if (count === 0) {
        console.log(`  ${name}: empty`);
      } else if (DRY_RUN) {
        console.log(`  ${name}: WOULD delete ${count} blobs total`);
      } else {
        console.log(`  ${name}: deleted ${count} blobs`);
      }
    } catch (e) {
      console.error(`  ${name}: ERROR — ${e.message}`);
    }
  }

  console.log("\n=== Reset complete ===");
  if (!DRY_RUN) {
    console.log("All data has been wiped. The app will auto-create containers on next access.");
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
