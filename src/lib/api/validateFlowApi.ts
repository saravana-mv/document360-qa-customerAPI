import { getProjectHeaders } from "./projectHeader";

export interface ValidationIssue {
  severity: "error" | "warning" | "info";
  step: number | null;
  category: string;
  message: string;
  field?: string;
  suggestion?: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
  summary: { errors: number; warnings: number; info: number };
}

export async function validateFlow(
  flowXml: string,
  versionFolder: string,
): Promise<ValidationResult> {
  const res = await fetch("/api/validate-flow", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...getProjectHeaders() },
    body: JSON.stringify({ flowXml, versionFolder }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "Unknown error");
    throw new Error(`Validation failed: ${res.status} — ${text}`);
  }

  return res.json();
}
