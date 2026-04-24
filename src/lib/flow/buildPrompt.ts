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
 * Parse idea steps to find exactly the spec files needed for each endpoint.
 *
 * Each step like "POST /v3/projects/{project_id}/categories" is parsed to
 * extract the HTTP method and resource name, then matched against available
 * spec filenames by (action, resource) pair. This gives precise results
 * (typically 4-6 files) instead of flooding the AI with irrelevant specs.
 */
export function filterRelevantSpecs(idea: FlowIdea, allSpecFiles: string[]): string[] {
  const needed = new Set<string>();

  // Map HTTP methods to typical spec filename action prefixes
  const methodToActions: Record<string, string[]> = {
    POST: ["create-", "bulk-create-"],
    GET: ["get-"],
    DELETE: ["delete-", "bulk-delete-"],
    PUT: ["update-", "bulk-update-"],
    PATCH: ["update-"],
  };

  for (const step of idea.steps) {
    // Parse: "POST /v3/projects/{project_id}/categories (description)"
    // or:   "GET /v3/projects/{project_id}/articles/{article_id}"
    const stepMatch = step.match(/(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);
    if (!stepMatch) continue;

    const method = stepMatch[1].toUpperCase();
    const path = stepMatch[2];

    // Extract meaningful segments (skip version, "projects", path params)
    const segments = path.split("/").filter(
      (s) => s && !s.startsWith("{") && !/^v\d+$/i.test(s) && s !== "projects"
    );
    // "/v3/projects/{id}/categories"       → ["categories"]
    // "/v3/projects/{id}/articles/bulk"     → ["articles", "bulk"]
    // "/v3/projects/{id}/articles/{art_id}" → ["articles"]

    const resource = segments[0]?.toLowerCase();
    if (!resource) continue;

    const isBulk = segments.includes("bulk");
    const actions = methodToActions[method] ?? [];

    // Find the best matching spec file
    for (const file of allSpecFiles) {
      const lower = file.toLowerCase();
      const filename = lower.split("/").pop() ?? "";

      // Must relate to this resource (folder name or filename)
      if (!lower.includes(`/${resource}/`) && !filename.includes(resource)) continue;

      // Match action prefix to method, respecting bulk vs single
      for (const action of actions) {
        const isBulkAction = action.startsWith("bulk-");
        if (isBulk !== isBulkAction) continue;
        if (filename.startsWith(action)) {
          needed.add(file);
          break;
        }
      }
    }
  }

  if (needed.size > 0) return Array.from(needed);

  // Fallback: if step parsing found nothing (unusual), use keyword matching
  const stepText = idea.steps.join(" ").toLowerCase() + " " + idea.description.toLowerCase();
  const keywords = new Set<string>();
  for (const entity of idea.entities) keywords.add(entity.toLowerCase());
  const pathRe = /\/(?:v\d+\/)?(?:projects\/\{[^}]+\}\/)?([\w-]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = pathRe.exec(stepText)) !== null) keywords.add(m[1].toLowerCase());

  return allSpecFiles
    .filter((name) => {
      const lower = name.toLowerCase();
      for (const kw of keywords) { if (lower.includes(kw)) return true; }
      return false;
    })
    .slice(0, 10);
}
