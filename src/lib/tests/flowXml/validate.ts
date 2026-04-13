// Thin validation facade over parseFlowXml — used by UI components that want
// a "did this parse?" answer without throwing.

import { parseFlowXml } from "./parser";
import type { ParsedFlow } from "./types";

export interface ValidationResult {
  ok: boolean;
  error?: string;
  flow?: ParsedFlow;
}

/** Validate a flow XML string against the runtime parser/schema. Pure, sync. */
export function validateFlowXml(xml: string): ValidationResult {
  if (!xml || !xml.trim()) {
    return { ok: false, error: "XML is empty" };
  }
  try {
    const flow = parseFlowXml(xml);
    return { ok: true, flow };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
