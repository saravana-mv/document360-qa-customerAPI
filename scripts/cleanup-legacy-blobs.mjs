#!/usr/bin/env node
/**
 * Cleanup: delete all blobs in the legacy "flow-files" container.
 *
 * Usage:
 *   AZURE_STORAGE_CONNECTION_STRING="..." node scripts/cleanup-legacy-blobs.mjs
 *
 * Optional:
 *   DRY_RUN=true   — list blobs without deleting
 */

import { BlobServiceClient } from "@azure/storage-blob";

const BLOB_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const DRY_RUN = process.env.DRY_RUN === "true";

if (!BLOB_CONN) { console.error("AZURE_STORAGE_CONNECTION_STRING required"); process.exit(1); }

const CONTAINER = "flow-files";

async function main() {
  console.log(`Cleaning up legacy blob container: ${CONTAINER}`);
  console.log(`  Dry run: ${DRY_RUN}\n`);

  const blobService = BlobServiceClient.fromConnectionString(BLOB_CONN);
  const container = blobService.getContainerClient(CONTAINER);

  let deleted = 0;
  for await (const blob of container.listBlobsFlat()) {
    if (DRY_RUN) {
      console.log(`  WOULD delete: ${blob.name}`);
    } else {
      await container.getBlobClient(blob.name).deleteIfExists();
      console.log(`  DELETED: ${blob.name}`);
    }
    deleted++;
  }

  console.log(`\nDone. ${DRY_RUN ? "Would delete" : "Deleted"}: ${deleted} blobs`);

  // Delete the container itself if empty and not dry run
  if (!DRY_RUN && deleted > 0) {
    try {
      await container.deleteIfExists();
      console.log(`Container "${CONTAINER}" deleted.`);
    } catch (e) {
      console.warn(`Could not delete container: ${e.message}`);
    }
  }
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
