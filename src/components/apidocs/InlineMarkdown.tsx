/**
 * Lightweight inline markdown renderer for API doc descriptions.
 *
 * Handles only what's needed to make descriptions readable:
 *   • `code`       → green monospaced text  (#1a7f37)
 *   • **bold**     → semibold span
 *
 * Deliberately tiny — no full markdown grammar (no headings, lists, links,
 * images, HTML escapes etc.) so we have zero XSS surface and zero deps.
 *
 * Backslash escapes (e.g. `\\b` in regex hints) are preserved verbatim;
 * a literal backtick can be written as `` ` `` if ever needed later.
 */

interface Props {
  text: string;
  className?: string;
}

type Token =
  | { kind: "text"; value: string }
  | { kind: "code"; value: string }
  | { kind: "bold"; value: string };

// Tokenize on `code` and **bold**. Single pass — order of regex alternates
// matters: backtick code is greedy/non-overlapping, bold non-greedy.
const TOKEN_RE = /`([^`\n]+?)`|\*\*([^*\n]+?)\*\*/g;

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  let last = 0;
  let m: RegExpExecArray | null;
  TOKEN_RE.lastIndex = 0;
  while ((m = TOKEN_RE.exec(text)) !== null) {
    if (m.index > last) {
      out.push({ kind: "text", value: text.slice(last, m.index) });
    }
    if (m[1] !== undefined) {
      out.push({ kind: "code", value: m[1] });
    } else if (m[2] !== undefined) {
      out.push({ kind: "bold", value: m[2] });
    }
    last = m.index + m[0].length;
  }
  if (last < text.length) {
    out.push({ kind: "text", value: text.slice(last) });
  }
  return out;
}

/** Inline code — green text only, no background or border. */
export function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-[#1a7f37]">
      {children}
    </code>
  );
}

export function InlineMarkdown({ text, className }: Props) {
  const tokens = tokenize(text);
  return (
    <span className={className}>
      {tokens.map((t, i) => {
        if (t.kind === "code") return <InlineCode key={i}>{t.value}</InlineCode>;
        if (t.kind === "bold") return <strong key={i} className="font-semibold text-[#1f2328]">{t.value}</strong>;
        return <span key={i}>{t.value}</span>;
      })}
    </span>
  );
}
