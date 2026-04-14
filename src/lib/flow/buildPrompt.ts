import type { FlowIdea } from "../api/specFilesApi";

/**
 * Build the user prompt sent to the flow-XML generator for a given idea.
 *
 * All boilerplate instructions (XML schema, assertion rules, teardown
 * conventions, output format, etc.) live in the system prompt on the
 * backend (FLOW_SYSTEM_PROMPT in generateFlow.ts). This function only
 * emits the scenario-specific details so QA users see a clean, concise
 * prompt they can easily understand and tweak.
 */
export function buildFlowPrompt(idea: FlowIdea): string {
  const steps = idea.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
  return `Title: ${idea.title}
Description: ${idea.description}
Entities: ${idea.entities.join(", ")}

Steps:
${steps}`;
}

/**
 * Extract relevant spec file names from the available files based on the
 * idea's steps. Matches endpoint paths mentioned in steps (e.g.
 * "POST /v3/projects/{project_id}/articles") against spec filenames.
 * Returns a filtered list so only relevant specs are sent as context.
 */
export function filterRelevantSpecs(idea: FlowIdea, allSpecFiles: string[]): string[] {
  // Extract endpoint keywords from the idea's steps
  // Steps typically mention paths like "/articles", "/categories", "/versions", etc.
  const stepText = idea.steps.join(" ").toLowerCase() + " " + idea.description.toLowerCase();

  // Build a set of entity keywords from the idea
  const keywords = new Set<string>();
  for (const entity of idea.entities) {
    keywords.add(entity.toLowerCase());
  }

  // Extract path segments that look like API resource names
  const pathPattern = /\/(?:v\d+\/)?(?:projects\/\{[^}]+\}\/)?([\w-]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = pathPattern.exec(stepText)) !== null) {
    keywords.add(match[1].toLowerCase());
  }

  // Match spec files that contain any of these keywords in their filename
  const matched = allSpecFiles.filter((name) => {
    const lower = name.toLowerCase();
    for (const kw of keywords) {
      if (lower.includes(kw)) return true;
    }
    return false;
  });

  // Always return at least the original list if nothing matched (fallback),
  // but cap at a reasonable number to control token usage
  const MAX_SPEC_FILES = 5;
  return (matched.length > 0 ? matched : allSpecFiles).slice(0, MAX_SPEC_FILES);
}
