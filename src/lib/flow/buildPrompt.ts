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
 * extract the HTTP method, resource name, and optional action sub-path,
 * then matched against available spec filenames. This gives precise results
 * (typically 4-8 files) instead of flooding the AI with irrelevant specs.
 *
 * Handles:
 * - Standard CRUD: POST /articles → create-article.md
 * - Action endpoints: POST /articles/{id}/publish → publish-article.md
 * - Bulk operations: POST /articles/bulk/publish → bulk-publish-article.md
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
    // or:   "POST /v3/projects/{project_id}/articles/{article_id}/publish"
    const stepMatch = step.match(/(GET|POST|PUT|PATCH|DELETE)\s+(\/\S+)/i);
    if (!stepMatch) continue;

    const method = stepMatch[1].toUpperCase();
    const path = stepMatch[2];

    // Extract meaningful segments (skip version, "projects", path params)
    const segments = path.split("/").filter(
      (s) => s && !s.startsWith("{") && !/^v\d+$/i.test(s) && s !== "projects"
    );
    // "/v3/projects/{id}/categories"                → ["categories"]
    // "/v3/projects/{id}/articles/bulk"              → ["articles", "bulk"]
    // "/v3/projects/{id}/articles/{art_id}"          → ["articles"]
    // "/v3/projects/{id}/articles/{art_id}/publish"  → ["articles", "publish"]
    // "/v3/projects/{id}/articles/bulk/publish"      → ["articles", "bulk", "publish"]

    const resource = segments[0]?.toLowerCase();
    if (!resource) continue;

    const isBulk = segments.includes("bulk");

    // Detect action sub-paths: the last segment after a path param or "bulk"
    // e.g. /articles/{id}/publish → action = "publish"
    // e.g. /articles/bulk/publish → action = "publish"
    const lastSegment = segments[segments.length - 1]?.toLowerCase();
    const isActionEndpoint = segments.length >= 2 && lastSegment !== resource && lastSegment !== "bulk";
    const actionName = isActionEndpoint ? lastSegment : null;

    // Build the set of filename prefixes to match
    let actions: string[];
    if (actionName) {
      // Action endpoint: POST /articles/{id}/publish → look for "publish-"
      // Also include bulk variant if applicable
      actions = isBulk ? [`bulk-${actionName}-`] : [`${actionName}-`];
    } else {
      actions = methodToActions[method] ?? [];
    }

    // Find the best matching spec file
    for (const file of allSpecFiles) {
      const lower = file.toLowerCase();
      const filename = lower.split("/").pop() ?? "";

      // Must relate to this resource (folder name or filename)
      if (!lower.includes(`/${resource}/`) && !filename.includes(resource)) continue;

      // Match action prefix to method, respecting bulk vs single
      for (const action of actions) {
        const isBulkAction = action.startsWith("bulk-");
        if (isBulk !== isBulkAction && !isActionEndpoint) continue;
        if (filename.startsWith(action)) {
          needed.add(file);
          break;
        }
      }

      // Fallback: if no action matched yet and this is an action endpoint,
      // try matching the action name anywhere in the filename
      if (actionName && !needed.has(file) && filename.includes(actionName)) {
        needed.add(file);
      }
    }
  }

  if (needed.size > 0) {
    // Auto-include create/delete specs from sibling resource folders
    // so the flow generator has context for prerequisite steps.
    const primaryFolders = new Set<string>();
    for (const f of needed) {
      const parts = f.split("/");
      if (parts.length >= 2) primaryFolders.add(parts.slice(0, -1).join("/"));
    }
    for (const file of allSpecFiles) {
      if (needed.has(file)) continue;
      const filename = file.toLowerCase().split("/").pop() ?? "";
      const fileParts = file.split("/");
      const fileFolder = fileParts.length >= 2 ? fileParts.slice(0, -1).join("/") : "";
      // Skip files in the same folder (already matched above)
      if (primaryFolders.has(fileFolder)) continue;
      // Include create/delete specs from other resource folders (dependencies)
      if (filename.startsWith("create-") || filename.startsWith("delete-")) {
        needed.add(file);
      }
    }

    // Also include create specs from the SAME resource folder when we have
    // action endpoints. E.g., if we matched publish-article.md, also include
    // create-article.md so the AI can see the response schema for captures.
    for (const file of allSpecFiles) {
      if (needed.has(file)) continue;
      const lower = file.toLowerCase();
      const filename = lower.split("/").pop() ?? "";
      // Check if this file is a create spec for a resource we already have
      if (filename.startsWith("create-")) {
        for (const folder of primaryFolders) {
          if (lower.includes(folder.toLowerCase() + "/")) {
            needed.add(file);
            break;
          }
        }
      }
    }

    return Array.from(needed);
  }

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
