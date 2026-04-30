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

  const varList = variables.map((v) => {
    const hint = v.value ? ` — current value: \`${v.value}\`` : "";
    return `| \`{{proj.${v.name}}}\` |${hint} |`;
  });

  return `${basePrompt}

## Available Project Variables — MANDATORY (read before writing ANY XML)

**CRITICAL**: You MUST use the EXACT variable names listed below with \`{{…}}\` braces. These are the ONLY valid \`proj.*\` references. Do NOT invent, rename, abbreviate, expand, or convert the case of variable names. Using a variable name not in this list will cause a runtime failure.

| Variable | Notes |
|----------|-------|
${varList.join("\n")}

**Examples of CORRECT usage** (assuming a variable named \`projectId\`):
\`\`\`xml
<param name="project_id">{{proj.projectId}}</param>      <!-- ✅ correct -->
<param name="project_id">proj.projectId</param>          <!-- ❌ WRONG — missing {{…}} braces -->
<param name="project_id">{{proj.project_id}}</param>     <!-- ❌ WRONG — no such variable -->
<param name="project_id">{{proj.projectID}}</param>      <!-- ❌ WRONG — case mismatch -->
\`\`\`

**PREREQUISITE SKIP RULE**: For each variable listed above, do NOT generate a setup/prerequisite step to create that entity. The resource already exists in the test environment and its ID is pre-configured. Reference the variable directly wherever that ID appears. Only create prerequisites for entities whose IDs are NOT in this list.`;
}
