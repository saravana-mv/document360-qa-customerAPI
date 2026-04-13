// Read-only JSON viewer backed by CodeMirror 6.
// Line numbers, syntax highlighting, code folding — used for request/response
// bodies in the test-run detail panes.

import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";

interface Props {
  /** Either a pre-formatted JSON string, or any JS value to be stringified. */
  value: unknown;
  /** Tailwind class applied to the outer wrapper. Controls height, border, etc. */
  className?: string;
  /** If set, editor height is fixed to this value. Default: "100%". */
  height?: string;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "12px" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
  ".cm-gutters": { backgroundColor: "#f6f8fa", borderRight: "1px solid #d1d9e0" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-activeLine": { backgroundColor: "transparent" },
});

function stringify(value: unknown): string {
  if (typeof value === "string") {
    // If it parses, pretty-print it; otherwise display as-is.
    try {
      return JSON.stringify(JSON.parse(value), null, 2);
    } catch {
      return value;
    }
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function JsonCodeBlock({ value, className, height = "100%" }: Props) {
  const text = useMemo(() => stringify(value), [value]);
  return (
    <div className={className}>
      <CodeMirror
        value={text}
        height={height}
        theme={githubLight}
        extensions={[json(), baseTheme, EditorView.lineWrapping]}
        editable={false}
        readOnly
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: false,
          highlightActiveLineGutter: false,
          highlightSelectionMatches: false,
          searchKeymap: true,
        }}
      />
    </div>
  );
}
