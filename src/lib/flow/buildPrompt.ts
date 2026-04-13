import type { FlowIdea } from "../api/specFilesApi";

/** Build the prompt sent to the flow-XML generator for a given idea. */
export function buildFlowPrompt(idea: FlowIdea): string {
  const steps = idea.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
  return `Create a detailed test flow XML for the following test scenario:

Title: ${idea.title}
Description: ${idea.description}
Complexity: ${idea.complexity}
Entities involved: ${idea.entities.join(", ")}

Expected steps:
${steps}

Generate the complete flow XML with proper step IDs, request bodies, path parameters, captures, and assertions. Include setup and teardown steps where needed (e.g., create category before article, delete in reverse order).`;
}
