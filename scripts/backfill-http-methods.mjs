#!/usr/bin/env node
/**
 * One-time migration: backfill httpmethod metadata on existing .md blobs.
 *
 * Usage:
 *   AZURE_STORAGE_CONNECTION_STRING="..." node scripts/backfill-http-methods.mjs
 *
 * For each .md blob in the spec-files container that lacks httpmethod metadata,
 * downloads the first 2 KB, detects the HTTP method from content patterns,
 * and sets the metadata (without re-uploading the content).
 */

import { BlobServiceClient } from "@azure/storage-blob";

const CONNECTION_STRING = process.env.AZURE_STORAGE_CONNECTION_STRING;
if (!CONNECTION_STRING) {
  console.error("Set AZURE_STORAGE_CONNECTION_STRING");
  process.exit(1);
}

const CONTAINER = "spec-files";

function detectHttpMethod(content) {
  const fenced = content.match(/```\w*\s+(GET|POST|PUT|PATCH|DELETE)\s+\//i);
  if (fenced) return fenced[1].toUpperCase();
  const heading = content.match(/^#{1,3}\s+(GET|POST|PUT|PATCH|DELETE)\b/im);
  if (heading) return heading[1].toUpperCase();
  const bold = content.match(/\*\*(GET|POST|PUT|PATCH|DELETE)\*\*/i);
  if (bold) return bold[1].toUpperCase();
  const json = content.match(/"method"\s*:\s*"(GET|POST|PUT|PATCH|DELETE)"/i);
  if (json) return json[1].toUpperCase();
  return null;
}

const svc = BlobServiceClient.fromConnectionString(CONNECTION_STRING);
const container = svc.getContainerClient(CONTAINER);

let updated = 0;
let skipped = 0;
let noMethod = 0;

for await (const blob of container.listBlobsFlat({ includeMetadata: true })) {
  if (!blob.name.endsWith(".md")) continue;
  if (blob.name.includes("_versions/")) continue;

  // Already has metadata
  if (blob.metadata?.httpmethod) {
    skipped++;
    continue;
  }

  // Download first 2KB to detect method
  const blobClient = container.getBlobClient(blob.name);
  const dl = await blobClient.download(0, 2048);
  const chunks = [];
  for await (const chunk of dl.readableStreamBody) {
    chunks.push(chunk);
  }
  const text = Buffer.concat(chunks).toString("utf-8");
  const method = detectHttpMethod(text);

  if (!method) {
    noMethod++;
    console.log(`  SKIP (no method found): ${blob.name}`);
    continue;
  }

  // Set metadata without re-uploading content
  const blockBlob = container.getBlockBlobClient(blob.name);
  const existing = blob.metadata || {};
  await blockBlob.setMetadata({ ...existing, httpmethod: method });
  updated++;
  console.log(`  SET ${method}: ${blob.name}`);
}

console.log(`\nDone. Updated: ${updated}, Already set: ${skipped}, No method: ${noMethod}`);
