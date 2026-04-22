#!/usr/bin/env node
/**
 * Migration: Move existing spec-files blobs under a project prefix and create
 * project-members docs in Cosmos for existing users.
 *
 * Prerequisites:
 *   - AZURE_STORAGE_CONNECTION_STRING
 *   - COSMOS_CONNECTION_STRING
 *   - PROJECT_ID  (the default project ID to scope blobs under)
 *   - TENANT_ID   (defaults to "kovai")
 *
 * Optional:
 *   DRY_RUN=true   — preview changes without writing
 *
 * Usage:
 *   AZURE_STORAGE_CONNECTION_STRING="..." COSMOS_CONNECTION_STRING="..." \
 *   PROJECT_ID="my-project-id" node scripts/migrate-project-scoping.mjs
 */

import { BlobServiceClient } from "@azure/storage-blob";
import { CosmosClient } from "@azure/cosmos";

const BLOB_CONN = process.env.AZURE_STORAGE_CONNECTION_STRING;
const COSMOS_CONN = process.env.COSMOS_CONNECTION_STRING;
const PROJECT_ID = process.env.PROJECT_ID;
const TENANT_ID = process.env.TENANT_ID || "kovai";
const DRY_RUN = process.env.DRY_RUN === "true";

if (!BLOB_CONN) { console.error("AZURE_STORAGE_CONNECTION_STRING required"); process.exit(1); }
if (!COSMOS_CONN) { console.error("COSMOS_CONNECTION_STRING required"); process.exit(1); }
if (!PROJECT_ID) { console.error("PROJECT_ID required (the default project to scope blobs under)"); process.exit(1); }

const SPEC_CONTAINER = "spec-files";
const DB_NAME = "flowforge";

async function main() {
  console.log("=== FlowForge Project Scoping Migration ===");
  console.log(`  Project ID: ${PROJECT_ID}`);
  console.log(`  Tenant ID:  ${TENANT_ID}`);
  console.log(`  Dry run:    ${DRY_RUN}\n`);

  // ── 1. Move spec-files blobs under project prefix ──
  console.log("--- Phase 1: Scope spec-files blobs ---\n");
  const blobService = BlobServiceClient.fromConnectionString(BLOB_CONN);
  const specContainer = blobService.getContainerClient(SPEC_CONTAINER);

  let movedBlobs = 0;
  let skippedBlobs = 0;

  for await (const blob of specContainer.listBlobsFlat()) {
    // Skip blobs already under a project prefix
    if (blob.name.startsWith(`${PROJECT_ID}/`)) {
      skippedBlobs++;
      continue;
    }

    const newName = `${PROJECT_ID}/${blob.name}`;
    if (DRY_RUN) {
      console.log(`  WOULD move: ${blob.name} -> ${newName}`);
    } else {
      // Copy to new location, then delete original
      const sourceClient = specContainer.getBlobClient(blob.name);
      const destClient = specContainer.getBlobClient(newName);
      const poller = await destClient.beginCopyFromURL(sourceClient.url);
      await poller.pollUntilDone();
      await sourceClient.deleteIfExists();
      console.log(`  MOVED: ${blob.name} -> ${newName}`);
    }
    movedBlobs++;
  }

  console.log(`\n  Blobs moved: ${movedBlobs}, already scoped: ${skippedBlobs}\n`);

  // ── 2. Ensure default project exists in Cosmos ──
  console.log("--- Phase 2: Ensure project document ---\n");
  const cosmosClient = new CosmosClient(COSMOS_CONN);
  const db = cosmosClient.database(DB_NAME);
  const projectsContainer = db.container("projects");

  try {
    const { resource } = await projectsContainer.item(PROJECT_ID, TENANT_ID).read();
    if (resource) {
      console.log(`  Project "${PROJECT_ID}" already exists — skipping\n`);
    }
  } catch (e) {
    if (e.code === 404) {
      const projectDoc = {
        id: PROJECT_ID,
        tenantId: TENANT_ID,
        name: "Default Project",
        description: "Migrated from pre-project era",
        visibility: "team",
        createdBy: "migration",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        memberCount: 0,
      };
      if (DRY_RUN) {
        console.log(`  WOULD create project doc: ${JSON.stringify(projectDoc, null, 2)}\n`);
      } else {
        await projectsContainer.items.create(projectDoc);
        console.log(`  Created project: "${PROJECT_ID}"\n`);
      }
    } else {
      throw e;
    }
  }

  // ── 3. Create project-members docs for existing users ──
  console.log("--- Phase 3: Create project-members from existing users ---\n");
  const usersContainer = db.container("users");
  const membersContainer = db.container("project-members");

  const { resources: users } = await usersContainer.items
    .query({ query: "SELECT * FROM c WHERE c.status = 'active'" })
    .fetchAll();

  let createdMembers = 0;
  let skippedMembers = 0;
  let memberCount = 0;

  for (const user of users) {
    const memberId = `${user.userId || user.id}_${PROJECT_ID}`;

    // Check if already exists
    try {
      const { resource } = await membersContainer.item(memberId, PROJECT_ID).read();
      if (resource) {
        skippedMembers++;
        memberCount++;
        continue;
      }
    } catch (e) {
      if (e.code !== 404) throw e;
    }

    // Map tenant role to project role
    let projectRole = "qa_engineer";
    if (user.role === "owner") projectRole = "owner";
    else if (user.role === "project_owner") projectRole = "owner";
    else if (user.role === "qa_manager") projectRole = "qa_manager";

    const memberDoc = {
      id: memberId,
      projectId: PROJECT_ID,
      userId: user.userId || user.id,
      email: user.email || "",
      displayName: user.displayName || user.email?.split("@")[0] || "Unknown",
      role: projectRole,
      status: "active",
      addedBy: "migration",
      addedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (DRY_RUN) {
      console.log(`  WOULD create member: ${memberDoc.email} (${projectRole})`);
    } else {
      await membersContainer.items.create(memberDoc);
      console.log(`  Created member: ${memberDoc.email} (${projectRole})`);
    }
    createdMembers++;
    memberCount++;
  }

  console.log(`\n  Members created: ${createdMembers}, already existed: ${skippedMembers}\n`);

  // Update member count on project
  if (!DRY_RUN && memberCount > 0) {
    try {
      const { resource: proj } = await projectsContainer.item(PROJECT_ID, TENANT_ID).read();
      if (proj) {
        proj.memberCount = memberCount;
        await projectsContainer.item(PROJECT_ID, TENANT_ID).replace(proj);
        console.log(`  Updated project memberCount to ${memberCount}\n`);
      }
    } catch { /* best-effort */ }
  }

  console.log("=== Migration complete ===");
}

main().catch((e) => { console.error("Fatal:", e); process.exit(1); });
