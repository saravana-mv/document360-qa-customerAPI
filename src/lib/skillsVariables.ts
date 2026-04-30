// Utilities for syncing project variable entries in _skills.md files.
//
// Each variable gets a canonical line in the "Context Variables" section that
// tells the AI both the syntax mapping and that the entity is pre-provisioned
// (so it skips generating prerequisite setup steps).

/** The canonical line written for a variable in _skills.md. */
export function buildVariableLine(name: string): string {
  return `- \`{${name}}\` → use \`{{proj.${name}}}\` — pre-provisioned, do NOT create a setup step for this entity`;
}

/**
 * Patch the content of a _skills.md file by adding lines for new variables
 * and removing lines for deleted variables.
 *
 * - Removal matches any line that starts with `- \`{NAME}\`` regardless of
 *   what follows, so it handles both old and new line formats.
 * - Addition inserts after the last existing variable line under
 *   "Default mappings for this project:", or appends before "## Enum Aliases"
 *   if no variable lines exist yet.
 */
export function patchSkillsVariables(
  content: string,
  added: string[],
  removed: string[],
): string {
  let lines = content.split("\n");

  // ── Remove deleted variables ──────────────────────────────────────────────
  for (const name of removed) {
    // Match lines like: - `{name}` → …  (any format)
    const pattern = new RegExp(`^- \`\\{${escapeRegex(name)}\\}\``);
    lines = lines.filter((l) => !pattern.test(l));
  }

  // ── Add new variables ─────────────────────────────────────────────────────
  for (const name of added) {
    // Skip if already present (idempotent)
    const pattern = new RegExp(`^- \`\\{${escapeRegex(name)}\\}\``);
    if (lines.some((l) => pattern.test(l))) continue;

    const newLine = buildVariableLine(name);

    // Find the last existing variable line under "Default mappings" and insert after it
    const defaultMappingsIdx = lines.findIndex((l) =>
      l.trim().startsWith("Default mappings for this project:"),
    );

    if (defaultMappingsIdx !== -1) {
      // Scan forward from that line to find the last variable bullet
      let lastVarIdx = defaultMappingsIdx;
      for (let i = defaultMappingsIdx + 1; i < lines.length; i++) {
        if (lines[i].startsWith("- `{")) {
          lastVarIdx = i;
        } else if (lines[i].startsWith("##") || lines[i].startsWith("<!--")) {
          break;
        }
      }
      lines.splice(lastVarIdx + 1, 0, newLine);
    } else {
      // No "Default mappings" section — insert before "## Enum Aliases" or append
      const enumIdx = lines.findIndex((l) => l.startsWith("## Enum Aliases"));
      if (enumIdx !== -1) {
        lines.splice(enumIdx, 0, newLine, "");
      } else {
        lines.push(newLine);
      }
    }
  }

  return lines.join("\n");
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
