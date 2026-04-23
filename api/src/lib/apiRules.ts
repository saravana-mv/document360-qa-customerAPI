// Shared helper to load API rules (version-folder blob → project-level Cosmos fallback)
// and inject them into AI system prompts.

import { getSettingsContainer } from "./cosmosClient";
import { downloadBlob } from "./blobClient";

interface ApiRulesDoc {
  rules: string;
  enumAliases: string;
}

/** Extract version folder (first path segment) from a file/folder path, e.g. "v2/Articles/foo.md" → "v2". */
export function extractVersionFolder(pathOrPaths: string | string[]): string | null {
  const paths = Array.isArray(pathOrPaths) ? pathOrPaths : [pathOrPaths];
  for (const p of paths) {
    const trimmed = p.replace(/^\/+/, "");
    const first = trimmed.split("/")[0];
    if (first) return first;
  }
  return null;
}

/** Load API rules. Tries version-folder blob first, falls back to project-level Cosmos. */
export async function loadApiRules(projectId: string, versionFolder?: string): Promise<{ rules: string; enumAliases: string }> {
  if (!projectId || projectId === "unknown") return { rules: "", enumAliases: "" };

  // Try version-folder blob first
  if (versionFolder) {
    try {
      const blobPath = `${projectId}/${versionFolder}/_rules.json`;
      const content = await downloadBlob(blobPath);
      const data = JSON.parse(content) as Partial<ApiRulesDoc>;
      if (data.rules || data.enumAliases) {
        return { rules: data.rules ?? "", enumAliases: data.enumAliases ?? "" };
      }
    } catch {
      // Blob doesn't exist — fall through to Cosmos
    }
  }

  // Fallback: project-level Cosmos
  try {
    const container = await getSettingsContainer();
    const { resource } = await container.item("api_rules", projectId).read<ApiRulesDoc>();
    return { rules: resource?.rules ?? "", enumAliases: resource?.enumAliases ?? "" };
  } catch {
    return { rules: "", enumAliases: "" };
  }
}

/** Append project-specific API rules to a system prompt if they exist. */
export function injectApiRules(basePrompt: string, rules: string): string {
  if (!rules || !rules.trim()) return basePrompt;
  return `${basePrompt}\n\n## Project-Specific API Rules\n\nThe following rules are specific to the API being tested in this project. Follow them carefully:\n\n${rules.trim()}`;
}
