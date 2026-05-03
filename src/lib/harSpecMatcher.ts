/**
 * Auto-match HAR API calls to spec files by path-based heuristics.
 *
 * Extracts resource names from HAR pathTemplates and matches them
 * against spec file paths (e.g., `v2/settings/get-search-key.md`).
 */

import type { ParsedApiCall } from "./harParser";

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

  // Extract unique resource folder names from HAR paths
  const harResources = extractResourceNames(apiCalls);
  if (harResources.size === 0) return [];

  const matched = new Set<string>();

  for (const spec of eligible) {
    const specLower = spec.toLowerCase();
    // Spec path looks like "v2/settings/get-search-key.md"
    // Extract the resource folder segment (second-to-last path part)
    const parts = specLower.split("/");
    if (parts.length < 2) continue;
    const specFolder = parts[parts.length - 2];

    if (harResources.has(specFolder)) {
      matched.add(spec);
    }
  }

  return Array.from(matched);
}

/**
 * Extract unique resource folder names from HAR API call paths.
 *
 * Path like `/api/v2/Settings/search-key` → resource "settings"
 * Path like `/api/v2/Articles/{id}/versions` → resources "articles", "versions"
 */
function extractResourceNames(apiCalls: ParsedApiCall[]): Set<string> {
  const resources = new Set<string>();

  for (const call of apiCalls) {
    const segments = call.pathTemplate
      .split("/")
      .filter(s => s && s !== "api" && !/^v\d+$/i.test(s) && !s.startsWith("{"));

    for (const seg of segments) {
      resources.add(seg.toLowerCase());
    }
  }

  return resources;
}
