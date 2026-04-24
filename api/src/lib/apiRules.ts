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

/** Parse enum aliases from a Skills.md code block under "## Enum Aliases". */
function parseEnumAliasesFromMarkdown(md: string): string {
  // Look for a code block after "## Enum Aliases"
  const aliasSection = md.match(/##\s*Enum\s*Aliases[\s\S]*?```\n?([\s\S]*?)```/i);
  if (!aliasSection) return "";
  // Filter out HTML comments and blank lines
  return aliasSection[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("<!--") && !l.startsWith("-->") && l.includes("="))
    .join("\n");
}

/** Load API rules. Tries Skills.md → _rules.json → project-level Cosmos. */
export async function loadApiRules(projectId: string, versionFolder?: string): Promise<{ rules: string; enumAliases: string }> {
  if (!projectId || projectId === "unknown") return { rules: "", enumAliases: "" };

  if (versionFolder) {
    // Try Skills.md first (preferred)
    try {
      const skillsPath = `${projectId}/${versionFolder}/Skills.md`;
      console.log(`[apiRules] Loading Skills.md from: ${skillsPath}`);
      const md = await downloadBlob(skillsPath);
      if (md.trim()) {
        console.log(`[apiRules] Skills.md loaded: ${md.length} chars`);
        const enumAliases = parseEnumAliasesFromMarkdown(md);
        return { rules: md, enumAliases };
      }
      console.log("[apiRules] Skills.md was empty");
    } catch (e) {
      console.log(`[apiRules] Skills.md not found at ${projectId}/${versionFolder}/Skills.md:`, (e as Error).message);
      // Skills.md doesn't exist — try _rules.json
    }

    // Try legacy _rules.json
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
