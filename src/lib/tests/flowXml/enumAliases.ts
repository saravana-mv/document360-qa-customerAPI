// Document360's swagger spec declares enums as strings (e.g. "draft",
// "published") but the API serialises them to integers at runtime. This
// table lets `field-equals` assertions written with either the name or the
// integer match the other form transparently.
//
// Extend this as new mismatches surface. Keys are case-insensitive.

interface EnumEntry { name: string; value: number; }

export const ENUM_ALIASES: EnumEntry[] = [
  // ArticleStatus — spec: "0 = Draft, 3 = Published"
  { name: "draft", value: 0 },
  { name: "new", value: 1 },
  { name: "updated", value: 2 },
  { name: "published", value: 3 },
  { name: "forked", value: 4 },
  { name: "unpublished", value: 5 },

  // CategoryType
  { name: "folder", value: 0 },
  { name: "page", value: 1 },
  { name: "index", value: 2 },

  // ContentType
  { name: "markdown", value: 0 },
  { name: "wysiwyg", value: 1 },
  { name: "block", value: 2 },

  // ContentMode
  { name: "raw", value: 0 },
  { name: "display", value: 1 },

  // SecurityVisibility
  { name: "public", value: 0 },
  { name: "protected", value: 1 },
  { name: "mixed", value: 2 },
];

const byName = new Map<string, number[]>();
const byValue = new Map<number, string[]>();
for (const { name, value } of ENUM_ALIASES) {
  const lower = name.toLowerCase();
  if (!byName.has(lower)) byName.set(lower, []);
  byName.get(lower)!.push(value);
  if (!byValue.has(value)) byValue.set(value, []);
  byValue.get(value)!.push(lower);
}

/**
 * Return true when `name` (a string like "draft") and `value` (a number like 0)
 * are known aliases of the same enum member.
 */
export function enumMatches(name: string, value: number): boolean {
  const matches = byName.get(name.toLowerCase());
  return matches ? matches.includes(value) : false;
}
