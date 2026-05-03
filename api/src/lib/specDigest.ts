/**
 * Spec Digest — a lightweight endpoint index for idea generation.
 *
 * When a version folder has many spec files (200-300), sending the full
 * distilled content to the AI for idea generation is wasteful — the AI
 * only needs method, path, summary, and key parameters to design test
 * journeys.
 *
 * The digest is stored as `_digest.md` in the version folder and rebuilt
 * whenever spec files change. Idea generation reads the digest instead
 * of all individual files, keeping prompt size manageable.
 *
 * Format (per endpoint, ~2-3 lines each):
 *   ### POST /v3/projects/{project_id}/articles
 *   Create a new article. Body: title*, content*, project_version_id*, category_id
 *   → 201 (id, title, slug, created_at)
 */

import { downloadBlob, uploadBlob, listBlobs, deleteBlob } from "./blobClient";
import { readDistilledContent } from "./specDistillCache";

const DIGEST_FILENAME = "_system/_digest.md";
const DIGEST_VERSION = 1;
const DIGEST_HEADER = `<!-- digest-v${DIGEST_VERSION} -->`;

// ── Types ──────────────────────────────────────────────────────────────

interface DigestEntry {
  method: string;
  path: string;
  summary: string;
  requiredFields: string[];
  optionalFields: string[];
  successStatus: string;
  responseFields: string[];
}

// ── Build digest from distilled specs ──────────────────────────────────

/**
 * Parse a single distilled spec file and extract the endpoint digest entry.
 */
function extractDigestEntry(content: string): DigestEntry | null {
  // Match endpoint header: "## Endpoint: METHOD /path" or "METHOD /path"
  const endpointMatch = content.match(/##\s*(?:Endpoint:\s*)?(GET|POST|PUT|PATCH|DELETE)\s+(\S+)/i);
  if (!endpointMatch) return null;

  const method = endpointMatch[1].toUpperCase();
  const path = endpointMatch[2];

  // Extract summary — first line after the endpoint header, or **bold** summary
  let summary = "";
  const summaryMatch = content.match(/\*\*([^*]+)\*\*/);
  if (summaryMatch) summary = summaryMatch[1].trim();
  if (!summary) {
    const descMatch = content.match(/^>\s*(.+)/m);
    if (descMatch) summary = descMatch[1].trim();
  }

  // Extract required fields from "**REQUIRED FIELDS: `field1`, `field2`**"
  const requiredFields: string[] = [];
  const reqMatch = content.match(/\*\*REQUIRED FIELDS:\s*([^*]+)\*\*/);
  if (reqMatch) {
    const fields = reqMatch[1].match(/`([^`]+)`/g);
    if (fields) requiredFields.push(...fields.map(f => f.replace(/`/g, "")));
  }

  // Extract optional fields from field table (rows without **YES**)
  const optionalFields: string[] = [];
  const fieldTableRows = content.matchAll(/\|\s*`([^`]+)`\s*\|\s*(\S+)\s*\|\s*(no|\*\*YES\*\*)\s*\|/gi);
  for (const row of fieldTableRows) {
    const fieldName = row[1];
    const isRequired = row[3].includes("YES");
    if (!isRequired && !requiredFields.includes(fieldName)) {
      optionalFields.push(fieldName);
    }
  }

  // Extract success status
  const statusMatch = content.match(/###\s*Response\s*\((\d+)\)/);
  const successStatus = statusMatch ? statusMatch[1] : "";

  // Extract response fields
  const responseFields: string[] = [];
  const respMatch = content.match(/Key fields?:\s*(.+)/i);
  if (respMatch) {
    const fields = respMatch[1].match(/`([^`]+)`/g);
    if (fields) responseFields.push(...fields.map(f => f.replace(/`/g, "").replace(/^response\.data\./, "")));
  }

  return { method, path, summary, requiredFields, optionalFields, successStatus, responseFields };
}

/**
 * Format a digest entry into compact markdown.
 */
function formatEntry(e: DigestEntry): string {
  const bodyParts: string[] = [];
  if (e.requiredFields.length > 0) {
    bodyParts.push(`Required: ${e.requiredFields.join(", ")}`);
  }
  if (e.optionalFields.length > 0) {
    const shown = e.optionalFields.slice(0, 5);
    const suffix = e.optionalFields.length > 5 ? ` (+${e.optionalFields.length - 5} more)` : "";
    bodyParts.push(`Optional: ${shown.join(", ")}${suffix}`);
  }
  const bodyStr = bodyParts.length > 0 ? ` | ${bodyParts.join(" | ")}` : "";

  const responseParts: string[] = [];
  if (e.successStatus) responseParts.push(e.successStatus);
  if (e.responseFields.length > 0) {
    const shown = e.responseFields.slice(0, 5);
    responseParts.push(shown.join(", "));
  }
  const responseStr = responseParts.length > 0 ? `\n→ ${responseParts.join(" — ")}` : "";

  return `- **${e.method} ${e.path}** — ${e.summary || "(no description)"}${bodyStr}${responseStr}`;
}

// ── Public API ─────────────────────────────────────────────────────────

/**
 * Build or rebuild the digest for a version folder.
 * Called after spec file upload/delete/rename.
 */
export async function rebuildDigest(projectId: string, folderPath: string): Promise<string> {
  const prefix = projectId !== "unknown" ? `${projectId}/${folderPath}` : folderPath;
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;

  const allBlobs = await listBlobs(normalizedPrefix);
  const mdBlobs = allBlobs.filter(b =>
    b.name.endsWith(".md") &&
    !b.name.includes("/_distilled/") &&
    !b.name.includes("/_versions/") &&
    !b.name.includes("/_system/") &&
    !b.name.endsWith("/_digest.md") &&
    !b.name.endsWith("/.keep"),
  );

  const entries: DigestEntry[] = [];

  // Read distilled content in parallel batches for performance on large specs
  const BATCH_SIZE = 30;
  for (let i = 0; i < mdBlobs.length; i += BATCH_SIZE) {
    const batch = mdBlobs.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map(async (blob) => {
        const content = await readDistilledContent(blob.name);
        return extractDigestEntry(content);
      }),
    );
    for (const result of results) {
      if (result.status === "fulfilled" && result.value) {
        entries.push(result.value);
      } else if (result.status === "rejected") {
        console.warn(`[specDigest] failed to read blob:`, result.reason);
      }
    }
  }

  // Sort by path for consistent ordering
  entries.sort((a, b) => a.path.localeCompare(b.path));

  // Group by resource (first path segment after version)
  const groups = new Map<string, DigestEntry[]>();
  for (const e of entries) {
    const parts = e.path.split("/").filter(Boolean);
    // Skip version prefix and project params to find the resource
    const resourceIdx = parts.findIndex((p, i) => i > 0 && !p.startsWith("{") && !p.match(/^v\d+$/i));
    const resource = resourceIdx >= 0 ? parts[resourceIdx] : "other";
    if (!groups.has(resource)) groups.set(resource, []);
    groups.get(resource)!.push(e);
  }

  // Build markdown
  const sections: string[] = [];
  for (const [resource, resourceEntries] of groups) {
    sections.push(`## ${resource}\n${resourceEntries.map(formatEntry).join("\n")}`);
  }

  const digest = `${DIGEST_HEADER}\n# API Endpoint Digest — ${mdBlobs.length} endpoints\n\n${sections.join("\n\n")}`;

  // Store the digest blob
  const digestPath = `${normalizedPrefix}${DIGEST_FILENAME}`;
  await uploadBlob(digestPath, digest, "text/markdown");

  return digest;
}

/**
 * Delete the digest for a folder so it rebuilds on next idea generation.
 * Called when any spec file in the folder changes.
 * Accepts a full blob path (e.g. "projectId/V3/articles/create.md")
 * and derives the folder from it.
 */
export async function invalidateDigest(blobPath: string): Promise<void> {
  // Derive the version folder from the spec blob path
  // e.g. "projId/V3/articles/create.md" → "projId/V3/"
  const parts = blobPath.split("/");
  // Find the version-level folder (e.g. "V3") — first segment matching /^v\d+$/i
  let versionIdx = -1;
  for (let i = 0; i < parts.length; i++) {
    if (/^v\d+$/i.test(parts[i])) { versionIdx = i; break; }
  }
  if (versionIdx < 0) return; // Can't determine folder — skip
  const digestFolder = parts.slice(0, versionIdx + 1).join("/") + "/";
  const digestPath = `${digestFolder}${DIGEST_FILENAME}`;
  try {
    await deleteBlob(digestPath);
  } catch {
    // Digest may not exist yet — ignore
  }
}

/**
 * Read the digest for a version folder. Returns null if not found.
 * Does NOT auto-build — call rebuildDigest explicitly when specs change.
 */
export async function readDigest(projectId: string, folderPath: string): Promise<string | null> {
  const prefix = projectId !== "unknown" ? `${projectId}/${folderPath}` : folderPath;
  const normalizedPrefix = prefix.endsWith("/") ? prefix : `${prefix}/`;
  const digestPath = `${normalizedPrefix}${DIGEST_FILENAME}`;

  try {
    const content = await downloadBlob(digestPath);
    if (content.startsWith(DIGEST_HEADER)) return content;
    // Stale version — return null so caller rebuilds
    return null;
  } catch {
    return null;
  }
}
