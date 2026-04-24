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
 *
 * Since specs are pre-distilled (compact format), we can afford a generous
 * limit. We also include "create" and "delete" specs from sibling entity
 * folders so prerequisite/teardown steps have proper spec context.
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

  // Also include "create" and "delete" specs from sibling entity folders.
  // Flows often need prerequisite entities (e.g. article flows need category
  // creation/deletion) that aren't mentioned in the idea's steps.
  const entityFolders = new Set<string>();
  for (const f of matched) {
    const lastSlash = f.lastIndexOf("/");
    if (lastSlash > 0) entityFolders.add(f.slice(0, lastSlash).toLowerCase());
  }

  // Find the version root (e.g. "v3") from matched files
  const versionRoots = new Set<string>();
  for (const folder of entityFolders) {
    const firstSlash = folder.indexOf("/");
    if (firstSlash > 0) versionRoots.add(folder.slice(0, firstSlash));
  }

  // Collect create/delete specs from ALL sibling entity folders under the same version root
  const siblingSpecs = allSpecFiles.filter((name) => {
    const lower = name.toLowerCase();
    if (!Array.from(versionRoots).some(vr => lower.startsWith(vr + "/"))) return false;
    if (matched.includes(name)) return false;
    const filename = lower.split("/").pop() ?? "";
    return filename.startsWith("create-") || filename.startsWith("delete-");
  });

  // Priority order: sibling dependency specs are RESERVED first (they provide
  // required field context for prerequisite steps), then fill remaining slots
  // with primary matched specs. This prevents the primary entity from consuming
  // all slots and starving dependency specs.
  const MAX_SPEC_FILES = 15;
  const reservedSlots = Math.min(siblingSpecs.length, 5); // reserve up to 5 slots for dependencies
  const primarySlots = MAX_SPEC_FILES - reservedSlots;
  const combined = [
    ...matched.slice(0, primarySlots),
    ...siblingSpecs.slice(0, reservedSlots),
  ];

  return (combined.length > 0 ? combined : allSpecFiles).slice(0, MAX_SPEC_FILES);
}
