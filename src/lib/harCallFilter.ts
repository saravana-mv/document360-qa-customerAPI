/**
 * Client-side keyword matching to select relevant HAR calls.
 * Keywords are extracted by AI from the QA description, then matched
 * against URL path segments deterministically.
 */

import type { ParsedApiCall } from "./harParser";

/**
 * Given HAR API calls and AI-extracted keywords, return indices of calls
 * whose path keywords overlap with the provided keywords.
 * Returns all indices if no matches found (graceful fallback).
 */
export function filterHarCallsByKeywords(
  calls: ParsedApiCall[],
  keywords: string[],
): number[] {
  if (keywords.length === 0) {
    return calls.map((_, i) => i);
  }

  const lcKeywords = keywords.map(k => k.toLowerCase());

  const matched: number[] = [];
  for (let i = 0; i < calls.length; i++) {
    const pathKeywords = extractPathKeywords(calls[i].pathTemplate);
    const hit = lcKeywords.some(dk =>
      pathKeywords.some(pk => pk.includes(dk) || dk.includes(pk))
    );
    if (hit) matched.push(i);
  }

  // Fallback: if nothing matched, return all
  return matched.length > 0 ? matched : calls.map((_, i) => i);
}

/** Extract keywords from a URL path (split camelCase, hyphens, filter noise) */
function extractPathKeywords(pathTemplate: string): string[] {
  const segments = pathTemplate
    .split("/")
    .filter(s => s && s !== "api" && !/^v\d+$/i.test(s) && !s.startsWith("{"));

  const keywords = new Set<string>();
  for (const seg of segments) {
    const subWords = splitCamelAndHyphen(seg)
      .map(w => w.toLowerCase())
      .filter(w => w.length > 2);
    for (const w of subWords) {
      keywords.add(w);
    }
  }
  return [...keywords];
}

/** Split a string on camelCase boundaries and hyphens */
function splitCamelAndHyphen(s: string): string[] {
  const parts = s.split("-");
  const result: string[] = [];
  for (const part of parts) {
    const camelParts = part.replace(/([a-z])([A-Z])/g, "$1\x00$2").split("\x00");
    result.push(...camelParts);
  }
  return result;
}
