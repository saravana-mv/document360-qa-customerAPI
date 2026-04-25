import { tryGetProjectHeaders } from "./projectHeader";

export interface ProblematicField {
  field: string;
  issue: string;
  suggestion: string;
}

export interface SuggestedFix {
  description: string;
  before: string;
  after: string;
}

export interface DebugDiagnosis {
  // New fields (v2)
  summary: string;
  whatWentWrong: string;
  category: "extra_field" | "missing_field" | "wrong_value" | "schema_mismatch" | "auth_error" | "upstream_error" | "other";
  canYouFixIt: boolean;
  howToFix?: string | null;
  fixPrompt?: string | null;
  developerNote?: string;
  problematicFields?: ProblematicField[];
  suggestedFix?: SuggestedFix;
  confidence: "high" | "medium" | "low";
  // Legacy fields (backward compat for cached responses)
  rootCause?: string;
  details?: string;
}

export interface DebugAnalyzeResult {
  diagnosis: DebugDiagnosis;
  usage: {
    inputTokens: number;
    outputTokens: number;
    totalTokens: number;
    costUsd: number;
  };
}

export interface DebugAnalyzeRequest {
  step: {
    name: string;
    method: string;
    path: string;
    requestUrl?: string;
    requestBody?: unknown;
    responseBody?: unknown;
    httpStatus?: number;
    failureReason?: string;
    assertionResults?: Array<{ description: string; passed: boolean }>;
  };
  flowXml?: string;
  model?: string;
}

export async function analyzeFailure(request: DebugAnalyzeRequest): Promise<DebugAnalyzeResult> {
  const projectHeaders = tryGetProjectHeaders();
  const res = await fetch("/api/debug-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...projectHeaders },
    body: JSON.stringify(request),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = await res.clone().json() as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return res.json() as Promise<DebugAnalyzeResult>;
}
