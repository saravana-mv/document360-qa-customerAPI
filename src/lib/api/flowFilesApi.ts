import { getProjectHeaders } from "./projectHeader";

export interface FlowFileItem {
  name: string;
  size: number;
  lastModified: string;
  contentType: string;
}

/** Thrown when POST /api/flow-files returns 409 (file already exists). */
export class FlowFileConflictError extends Error {
  readonly conflictName: string;
  constructor(conflictName: string) {
    super(`A flow already exists at ${conflictName}`);
    this.conflictName = conflictName;
    this.name = "FlowFileConflictError";
  }
}

async function apiFetch(url: string, init?: RequestInit): Promise<Response> {
  const headers = { ...getProjectHeaders(), ...init?.headers };
  const res = await fetch(url, { ...init, headers });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res;
}

export async function listFlowFiles(prefix?: string): Promise<FlowFileItem[]> {
  const url = prefix ? `/api/flow-files?prefix=${encodeURIComponent(prefix)}` : `/api/flow-files`;
  const res = await apiFetch(url);
  return res.json() as Promise<FlowFileItem[]>;
}

export async function getFlowFileContent(name: string): Promise<string> {
  const res = await apiFetch(`/api/flow-files/content?name=${encodeURIComponent(name)}`);
  return res.text();
}

/** Create a flow file. Throws FlowFileConflictError on 409. */
export async function saveFlowFile(name: string, xml: string, overwrite = false): Promise<void> {
  const res = await fetch(`/api/flow-files`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getProjectHeaders() },
    body: JSON.stringify({ name, xml, overwrite }),
  });
  if (res.status === 409) {
    throw new FlowFileConflictError(name);
  }
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
}

export async function deleteFlowFile(name: string): Promise<void> {
  await apiFetch(`/api/flow-files?name=${encodeURIComponent(name)}`, { method: "DELETE" });
}

// ── Path / filename helpers ──────────────────────────────────────────────────

const FLOW_SUFFIX = ".flow.xml";
const MAX_FILENAME_LEN = 80; // includes the .flow.xml suffix

/** Slugify an idea title into a filesystem-safe kebab-case name. */
export function slugifyFlowTitle(title: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-");
  const maxBase = MAX_FILENAME_LEN - FLOW_SUFFIX.length;
  return slug.slice(0, maxBase) || "flow";
}

/** Resolve the parent folder for a given active path (file or folder). */
export function parentFolderOf(activePath: string | null): string {
  if (!activePath) return "";
  // File → strip filename
  if (activePath.endsWith(".md")) {
    const idx = activePath.lastIndexOf("/");
    return idx === -1 ? "" : activePath.slice(0, idx);
  }
  // Folder — strip trailing slash
  return activePath.replace(/\/$/, "");
}

/** Compose the full blob name for a flow file at the given folder + title. */
export function buildFlowFilePath(folder: string, title: string): string {
  const base = slugifyFlowTitle(title) + FLOW_SUFFIX;
  return folder ? `${folder}/${base}` : base;
}
