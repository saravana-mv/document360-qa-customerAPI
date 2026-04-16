#!/usr/bin/env node
/**
 * One-time migration: copies all flow XML blobs from Azure Blob Storage
 * ("flow-files" container) into Cosmos DB ("flows" container).
 *
 * Usage:
 *   AZURE_STORAGE_CONNECTION_STRING="..." \
 *   COSMOS_CONNECTION_STRING="..." \
 *   PROJECT_ID="<your-d360-project-id>" \
 *   node scripts/migrate-flows-to-cosmos.mjs
 *
 * Optional:
 *   MIGRATOR_NAME="Your Name"   — name recorded as createdBy/updatedBy
 *   DRY_RUN=true                — list blobs without writing to Cosmos
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const BLOB_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const COSMOS_CONN = process.env.COSMOS_CONNECTION_STRING;
const PROJECT_ID = process.env.PROJECT_ID;
const MIGRATOR_NAME = process.env.MIGRATOR_NAME || "migration-script";
const DRY_RUN = process.env.DRY_RUN === "true";

if (!BLOB_CONN) { console.error("AZURE_STORAGE_CONNECTION_STRING required"); process.exit(1); }
if (!COSMOS_CONN) { console.error("COSMOS_CONNECTION_STRING required"); process.exit(1); }
if (!PROJECT_ID) { console.error("PROJECT_ID required"); process.exit(1); }

const BLOB_CONTAINER = "flow-files";
const COSMOS_DB = "flowforge";
const COSMOS_CONTAINER = "flows";

async function main() {
  console.log(`Migrating flow blobs → Cosmos DB`);
  console.log(`  Project ID:  ${PROJECT_ID}`);
  console.log(`  Dry run:     ${DRY_RUN}`);
  console.log();

  // Connect to blob storage
  const blobService = BlobServiceClient.fromConnectionString(BLOB_CONN);
  const blobContainer = blobService.getContainerClient(BLOB_CONTAINER);

  // Connect to Cosmos
  const cosmosClient = new CosmosClient(COSMOS_CONN);
  const { database } = await cosmosClient.databases.createIfNotExists({ id: COSMOS_DB });
  const { container } = await database.containers.createIfNotExists({
    id: COSMOS_CONTAINER,
    partitionKey: { paths: ["/projectId"] },
  });

  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for await (const blob of blobContainer.listBlobsFlat()) {
    const name = blob.name;
    if (!name.endsWith(".flow.xml")) {
      console.log(`  SKIP (not flow XML): ${name}`);
      skipped++;
      continue;
    }

    const docId = "flow:" + name;

    // Check if already migrated
    try {
      const { resource } = await container.item(docId, PROJECT_ID).read();
      if (resource) {
        console.log(`  SKIP (exists): ${name}`);
        skipped++;
        continue;
      }
    } catch {
      // Not found — proceed
    }

    if (DRY_RUN) {
      console.log(`  WOULD migrate: ${name} (${blob.properties.contentLength} bytes)`);
      migrated++;
      continue;
    }

    // Download blob content
    try {
      const blobClient = blobContainer.getBlobClient(name);
      const downloaded = await blobClient.downloadToBuffer();
      const xml = downloaded.toString("utf8");
      const now = new Date().toISOString();

      const doc = {
        id: docId,
        projectId: PROJECT_ID,
        type: "flow",
        path: name,
        xml,
        size: blob.properties.contentLength || Buffer.byteLength(xml, "utf8"),
        createdAt: blob.properties.createdOn?.toISOString() || now,
        createdBy: { oid: "migration", name: MIGRATOR_NAME },
        updatedAt: blob.properties.lastModified?.toISOString() || now,
        updatedBy: { oid: "migration", name: MIGRATOR_NAME },
      };

      await container.items.upsert(doc);
      console.log(`  OK: ${name} (${doc.size} bytes)`);
      migrated++;
    } catch (e) {
      console.error(`  ERROR: ${name} — ${e.message}`);
      errors++;
    }
  }

  console.log();
  console.log(`Done. Migrated: ${migrated}, Skipped: ${skipped}, Errors: ${errors}`);
}

main().catch((e) => {
  console.error("Fatal:", e);
  process.exit(1);
});
