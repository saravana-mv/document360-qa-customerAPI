/**
 * Auto-match HAR API calls to spec files by two-level filtering:
 * 1. Folder gate — spec's parent folder matches a HAR call's resource folder
 * 2. Keyword gate — spec filename contains at least one action keyword from the HAR call
 */

import type { ParsedApiCall } from "./harParser";

interface HarCallContext {
  resourceFolder: string;
  actionKeywords: string[];
}

/**
 * Given HAR API calls and a list of all spec file paths,
 * returns the subset of spec files that are relevant to the HAR calls.
 */
export function matchHarToSpecs(apiCalls: ParsedApiCall[], allSpecFiles: string[]): string[] {
  // Filter to only raw spec files (exclude system/distilled)
  const eligible = allSpecFiles.filter(f =>
    f.endsWith(".md") &&
    !f.includes("/_system/") &&
    !f.includes("/_distilled/")
  );

  const callContexts = apiCalls.map(parseCallContext);
  // Remove calls with no resource folder
  const validContexts = callContexts.filter(c => c.resourceFolder);
  if (validContexts.length === 0) return [];

  const matched = new Set<string>();

  for (const spec of eligible) {
    const specLower = spec.toLowerCase();
    const parts = specLower.split("/");
    if (parts.length < 2) continue;

    const specFolder = parts[parts.length - 2];
    const specFilename = parts[parts.length - 1];

    for (const ctx of validContexts) {
      // Gate 1: folder must match
      if (specFolder !== ctx.resourceFolder) continue;

      // Gate 2: filename must contain at least one keyword,
      // OR the call has no action keywords (root CRUD like GET /settings)
      if (ctx.actionKeywords.length === 0 || ctx.actionKeywords.some(kw => specFilename.includes(kw))) {
        matched.add(spec);
        break;
      }
    }
  }

  return Array.from(matched);
}

/**
 * Parse a HAR API call into a resource folder and action keywords.
 *
 * Example: POST /api/v2/Settings/addSnippet
 *   → resourceFolder: "settings"
 *   → actionKeywords: ["addsnippet", "snippet", "add"]
 */
function parseCallContext(call: ParsedApiCall): HarCallContext {
  const segments = call.pathTemplate
    .split("/")
    .filter(s => s && s !== "api" && !/^v\d+$/i.test(s) && !s.startsWith("{"));

  if (segments.length === 0) return { resourceFolder: "", actionKeywords: [] };

  // First non-api, non-version segment is the resource folder
  const resourceFolder = toKebab(segments[0]);

  // Remaining segments are action segments
  const actionSegments = segments.slice(1);
  const keywords = new Set<string>();

  for (const seg of actionSegments) {
    const lower = seg.toLowerCase();
    // Full segment as keyword (lowercased, kebab-stripped)
    keywords.add(lower.replace(/-/g, ""));

    // Split on camelCase boundaries and hyphens, keep words > 2 chars
    const subWords = splitCamelAndHyphen(seg)
      .map(w => w.toLowerCase())
      .filter(w => w.length > 2);

    for (const w of subWords) {
      keywords.add(w);
    }
  }

  return { resourceFolder, actionKeywords: Array.from(keywords) };
}

/** Convert a PascalCase/camelCase/kebab-case string to lowercase kebab-case */
function toKebab(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, "$1-$2")
    .replace(/[_\s]+/g, "-")
    .toLowerCase();
}

/** Split a string on camelCase boundaries and hyphens */
function splitCamelAndHyphen(s: string): string[] {
  // First split on hyphens
  const parts = s.split("-");
  const result: string[] = [];
  for (const part of parts) {
    // Split camelCase: "addSnippet" → ["add", "Snippet"]
    const camelParts = part.replace(/([a-z])([A-Z])/g, "$1\x00$2").split("\x00");
    result.push(...camelParts);
  }
  return result;
}
