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

  // Build a concrete skip list: derive the snake_case field name from each variable
  // (e.g. workspaceId → workspace_id) and call out exactly what NOT to create.
  const skipLines = variables
    .map((v) => {
      const snakeField = v.name.replace(/([A-Z])/g, "_$1").toLowerCase();
      if (!snakeField.endsWith("_id")) return null;
      const entity = snakeField.slice(0, -3); // strip '_id'
      return `- \`${snakeField}\` in any path or body → use \`{{proj.${v.name}}}\` — do NOT add a "Create ${entity}" setup step`;
    })
    .filter(Boolean);
  const skipList = skipLines.length > 0 ? `\n${skipLines.join("\n")}` : "";

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

**PREREQUISITE SKIP RULE — MANDATORY**: The variables above represent pre-provisioned resources in the test environment. You MUST NOT generate setup steps to create these entities.${skipList}
Only generate prerequisites for entities whose IDs are NOT covered by a project variable.`;
}
