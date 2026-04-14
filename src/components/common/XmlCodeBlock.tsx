// Read-only XML viewer backed by CodeMirror 6.
// Line numbers, syntax highlighting, code folding — used in the Flow Manager
// XML viewer and the Spec Manager flow detail panel.

import CodeMirror from "@uiw/react-codemirror";
import { xml } from "@codemirror/lang-xml";
import { githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  /** Tailwind class applied to the outer wrapper. Controls height, border, etc. */
  className?: string;
  /** If set, editor height is fixed to this value (e.g. "100%", "400px"). Default: "100%". */
  height?: string;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "12px" },
  "&.cm-editor": { height: "100%" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", overflow: "auto" },
  ".cm-gutters": { backgroundColor: "#f6f8fa", borderRight: "1px solid #d1d9e0" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-activeLine": { backgroundColor: "transparent" },
});

export function XmlCodeBlock({ value, className, height = "100%" }: Props) {
  return (
    <div className={className}>
      <CodeMirror
        value={value}
        height={height}
        theme={githubLight}
        extensions={[xml(), baseTheme, EditorView.lineWrapping]}
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
