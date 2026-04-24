// Shared helper to load project variables from Cosmos and inject them
// into AI system prompts so the model uses the correct variable names.

import { getSettingsContainer } from "./cosmosClient";

interface ProjectVariable {
  name: string;
  value: string;
}

interface ProjectVariablesDoc {
  variables: ProjectVariable[];
}

/** Load project variables from Cosmos. Returns empty array on any error. */
export async function loadProjectVariables(projectId: string): Promise<ProjectVariable[]> {
  if (!projectId || projectId === "unknown") return [];
  try {
    const container = await getSettingsContainer();
    const { resource } = await container.item("project_variables", projectId).read<ProjectVariablesDoc>();
    return resource?.variables ?? [];
  } catch {
    return [];
  }
}

/**
 * Append a "Project Variables" section to a system prompt listing the
 * actual variable names defined for this project. This tells the AI
 * exactly which `proj.*` tokens are available.
 */
export function injectProjectVariables(basePrompt: string, variables: ProjectVariable[]): string {
  if (variables.length === 0) return basePrompt;
  const lines = variables.map((v) => {
    const hint = v.value ? ` (current value: "${v.value}")` : "";
    return `- \`proj.${v.name}\` → use as \`{{proj.${v.name}}}\` in expressions or \`proj.${v.name}\` in pathParam values${hint}`;
  });
  return `${basePrompt}\n\n## Available Project Variables\n\nThe following project variables are defined. Use these EXACT names (case-sensitive) when referencing project variables — do NOT rename or convert them:\n\n${lines.join("\n")}`;
}
