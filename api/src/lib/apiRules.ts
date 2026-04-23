// Shared helper to load project-level API rules from Cosmos DB
// and inject them into AI system prompts.

import { getSettingsContainer } from "./cosmosClient";

interface ApiRulesDoc {
  rules: string;
  enumAliases: string;
}

/** Load API rules for a project. Returns empty strings if none configured. */
export async function loadApiRules(projectId: string): Promise<{ rules: string; enumAliases: string }> {
  if (!projectId || projectId === "unknown") return { rules: "", enumAliases: "" };
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
