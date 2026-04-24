/**
 * Manages pre-processed (distilled) versions of OpenAPI spec files.
 *
 * When a spec .md file is uploaded, imported, or synced, we distill it
 * into a compact AI-friendly format and store the result as a companion
 * blob under `_distilled/` in the same folder.
 *
 * Lifecycle:
 *   create/update spec → distill + store companion
 *   rename spec        → rename companion
 *   delete spec        → delete companion
 *
 * At AI call time, read the companion blob instead of the raw spec.
 * Falls back to runtime distillation if the companion is missing.
 */

import { uploadBlob, deleteBlob, renameBlob, downloadBlob } from "./blobClient";
import { distillSpecContext } from "./specRequiredFields";

/** Bump this when distill logic changes to invalidate stale caches. */
const DISTILL_VERSION = 2;

// ── Path helpers ──────────────────────────────────────────────────────

/** Convert a spec blob path to its distilled companion path.
 *  e.g. "V3/articles/create.md" → "V3/articles/_distilled/create.md"
 */
export function distilledPath(specPath: string): string {
  const lastSlash = specPath.lastIndexOf("/");
  if (lastSlash < 0) return `_distilled/${specPath}`;
  const folder = specPath.slice(0, lastSlash);
  const filename = specPath.slice(lastSlash + 1);
  return `${folder}/_distilled/${filename}`;
}

// ── Lifecycle hooks ───────────────────────────────────────────────────

/**
 * Distill a spec markdown string and store the result as a companion blob.
 * Call this after uploading or updating a .md spec file.
 */
export async function distillAndStore(blobPath: string, rawContent: string): Promise<void> {
  // Only process .md files (not .json manifests, _versions, _distilled, etc.)
  if (!blobPath.endsWith(".md")) return;
  if (blobPath.includes("/_distilled/")) return;
  if (blobPath.includes("/_versions/")) return;
  if (blobPath.includes("/_sources.json")) return;

  try {
    // Wrap content in the section format that distillSpecContext expects
    const filename = blobPath.split("/").pop() ?? blobPath;
    const wrapped = `## ${filename}\n\n${rawContent}`;
    const distilled = distillSpecContext(wrapped);

    // Only store if distillation actually transformed something
    // (i.e., the file contained OpenAPI JSON blocks)
    if (distilled !== wrapped) {
      const companionPath = distilledPath(blobPath);
      const versioned = `<!-- distill-v${DISTILL_VERSION} -->\n${distilled}`;
      await uploadBlob(companionPath, versioned, "text/markdown");
    }
  } catch (e) {
    // Distillation is best-effort — don't block the upload
    console.warn(`[distillAndStore] failed for ${blobPath}:`, e);
  }
}

/**
 * Delete the distilled companion blob when a spec file is deleted.
 */
export async function deleteDistilled(blobPath: string): Promise<void> {
  if (!blobPath.endsWith(".md")) return;
  if (blobPath.includes("/_distilled/")) return;

  try {
    const companionPath = distilledPath(blobPath);
    await deleteBlob(companionPath);
  } catch {
    // Companion may not exist — ignore
  }
}

/**
 * Rename the distilled companion blob when a spec file is renamed.
 */
export async function renameDistilled(oldBlobPath: string, newBlobPath: string): Promise<void> {
  if (!oldBlobPath.endsWith(".md")) return;
  if (oldBlobPath.includes("/_distilled/")) return;

  try {
    const oldCompanion = distilledPath(oldBlobPath);
    const newCompanion = distilledPath(newBlobPath);
    await renameBlob(oldCompanion, newCompanion);
  } catch {
    // Old companion may not exist — ignore
  }
}

// ── Reader ────────────────────────────────────────────────────────────

/**
 * Read a spec file's distilled content if available, otherwise fall back
 * to reading the raw spec and distilling at runtime.
 *
 * Returns the distilled content (without section header wrapper — caller
 * adds their own `## filename` header as needed).
 */
export async function readDistilledContent(blobPath: string): Promise<string> {
  // Try the pre-computed companion first
  try {
    const companionPath = distilledPath(blobPath);
    const cached = await downloadBlob(companionPath);
    // Check version — stale caches are re-distilled
    if (cached.startsWith(`<!-- distill-v${DISTILL_VERSION} -->`)) {
      return cached;
    }
    // Stale version — fall through to re-distill
  } catch {
    // Companion doesn't exist — fall back to runtime distillation
  }

  // Read raw and distill on the fly
  const raw = await downloadBlob(blobPath);
  const distilled = distillSpecContext(raw);

  // Store for next time (fire-and-forget) — distillAndStore adds version tag
  if (distilled !== raw) {
    distillAndStore(blobPath, raw).catch(() => {});
  }

  return distilled !== raw ? `<!-- distill-v${DISTILL_VERSION} -->\n${distilled}` : raw;
}
