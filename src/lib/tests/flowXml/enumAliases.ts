// Enum aliases for field-equals assertions. When an API returns integers where
// the spec uses strings (e.g. "draft" vs 0), aliases let assertions match
// transparently in either direction.
//
// Aliases are configurable per project via Settings → API Rules → Enum Aliases.
// Format: one "name=value" per line, e.g. "draft=0", "published=3"

interface EnumEntry { name: string; value: number; }

/** Parse enum aliases from a multi-line "name=value" string. */
export function parseEnumAliases(raw: string): EnumEntry[] {
  if (!raw || !raw.trim()) return [];
  const entries: EnumEntry[] = [];
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx < 1) continue;
    const name = trimmed.slice(0, eqIdx).trim();
    const val = Number(trimmed.slice(eqIdx + 1).trim());
    if (name && !Number.isNaN(val)) {
      entries.push({ name, value: val });
    }
  }
  return entries;
}

// Active enum map — starts empty; populated via setEnumAliases()
let byName = new Map<string, number[]>();

/** Set the active enum aliases (call after loading from project API rules). */
export function setEnumAliases(raw: string): void {
  byName = new Map<string, number[]>();
  for (const { name, value } of parseEnumAliases(raw)) {
    const lower = name.toLowerCase();
    if (!byName.has(lower)) byName.set(lower, []);
    byName.get(lower)!.push(value);
  }
}

/**
 * Return true when `name` (a string like "draft") and `value` (a number like 0)
 * are known aliases of the same enum member.
 */
export function enumMatches(name: string, value: number): boolean {
  const matches = byName.get(name.toLowerCase());
  return matches ? matches.includes(value) : false;
}

/** Extract enum aliases from a _skills.md markdown file's code block under "## Enum Aliases". */
export function parseEnumAliasesFromMarkdown(md: string): string {
  const aliasSection = md.match(/##\s*Enum\s*Aliases[\s\S]*?```\n?([\s\S]*?)```/i);
  if (!aliasSection) return "";
  return aliasSection[1]
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("<!--") && !l.startsWith("-->") && l.includes("="))
    .join("\n");
}
