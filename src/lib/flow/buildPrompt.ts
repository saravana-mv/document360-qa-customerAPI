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
