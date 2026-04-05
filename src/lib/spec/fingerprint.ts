import type { SwaggerSpec, SpecFingerprint } from "../../types/spec.types";

const STORAGE_KEY = "spec_fingerprint";

interface NormalizedOperation {
  method: string;
  path: string;
  parameters: Array<{ name: string; in: string; required: boolean; type: string }>;
  requestBodyTypes: string[];
  responseCodes: string[];
}

function normalizeSpec(spec: SwaggerSpec): NormalizedOperation[] {
  const HTTP_METHODS = ["get", "post", "put", "patch", "delete"] as const;
  const ops: NormalizedOperation[] = [];

  for (const [path, pathItem] of Object.entries(spec.paths || {})) {
    for (const method of HTTP_METHODS) {
      const operation = pathItem[method];
      if (!operation) continue;

      const parameters = (operation.parameters || [])
        .map((p) => ({
          name: p.name,
          in: p.in,
          required: p.required ?? false,
          type: p.schema?.type ?? "unknown",
        }))
        .sort((a, b) => a.name.localeCompare(b.name));

      const requestBodyTypes: string[] = [];
      if (operation.requestBody?.content) {
        for (const [contentType, media] of Object.entries(operation.requestBody.content)) {
          if (media.schema?.properties) {
            const props = Object.keys(media.schema.properties).sort();
            requestBodyTypes.push(`${contentType}:${props.join(",")}`);
          }
        }
      }

      const responseCodes = Object.keys(operation.responses || {}).sort();

      ops.push({ method, path, parameters, requestBodyTypes, responseCodes });
    }
  }

  return ops.sort((a, b) => `${a.method}${a.path}`.localeCompare(`${b.method}${b.path}`));
}

export async function computeFingerprint(spec: SwaggerSpec): Promise<SpecFingerprint> {
  const normalized = normalizeSpec(spec);
  const canonical = JSON.stringify(normalized);
  const encoder = new TextEncoder();
  const data = encoder.encode(canonical);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(digest));
  const hash = hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");

  return { hash, timestamp: Date.now(), operationCount: normalized.length };
}

export function saveFingerprint(fingerprint: SpecFingerprint): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(fingerprint));
}

export function loadFingerprint(): SpecFingerprint | null {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
