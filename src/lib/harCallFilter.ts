/**
 * Client-side keyword matching to auto-select relevant HAR calls
 * based on a QA description string. Replaces the AI-based classifier.
 */

import type { ParsedApiCall } from "./harParser";

/** Common words that match too broadly — shared with harSpecMatcher.ts */
const STOP_WORDS = new Set([
  "get", "set", "add", "put", "post", "patch", "delete", "remove",
  "list", "create", "update", "fetch", "find", "search", "all",
  "by", "the", "for", "from", "with", "project", "setting", "settings",
  "was", "were", "been", "being", "have", "has", "had", "having",
  "that", "this", "then", "than", "them", "they", "their", "there",
  "what", "when", "where", "which", "who", "whom", "how", "not",
  "and", "but", "also", "just", "only", "should", "would", "could",
  "into", "after", "before", "about", "some", "other", "each", "every",
]);

/** Extract meaningful keywords from a QA description string */
export function extractKeywords(description: string): string[] {
  const words = description
    .toLowerCase()
    .split(/[\s,.\-_;:!?()[\]{}'"\/\\]+/)
    .filter(w => w.length > 2 && !STOP_WORDS.has(w));
  return [...new Set(words)];
}

/** Extract keywords from a URL path (split camelCase, hyphens, filter noise) */
export function extractPathKeywords(pathTemplate: string): string[] {
  const segments = pathTemplate
    .split("/")
    .filter(s => s && s !== "api" && !/^v\d+$/i.test(s) && !s.startsWith("{"));

  const keywords = new Set<string>();
  for (const seg of segments) {
    const subWords = splitCamelAndHyphen(seg)
      .map(w => w.toLowerCase())
      .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    for (const w of subWords) {
      keywords.add(w);
    }
  }
  return [...keywords];
}

/**
 * Given HAR API calls and a description, return indices of calls
 * whose path keywords overlap with description keywords.
 * Returns all indices if no matches found (graceful fallback).
 */
export function filterHarCallsByDescription(
  calls: ParsedApiCall[],
  description: string,
): number[] {
  const descKeywords = extractKeywords(description);
  if (descKeywords.length === 0) {
    return calls.map((_, i) => i);
  }

  const matched: number[] = [];
  for (let i = 0; i < calls.length; i++) {
    const pathKeywords = extractPathKeywords(calls[i].pathTemplate);
    const hit = descKeywords.some(dk =>
      pathKeywords.some(pk => pk.includes(dk) || dk.includes(pk))
    );
    if (hit) matched.push(i);
  }

  // Fallback: if nothing matched, return all
  return matched.length > 0 ? matched : calls.map((_, i) => i);
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
