// Editable XML editor backed by CodeMirror 6. Mirror of XmlCodeBlock but
// writable and emits every keystroke to the parent via onChange.

import CodeMirror from "@uiw/react-codemirror";
import { xml } from "@codemirror/lang-xml";
import { githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  onChange: (next: string) => void;
  className?: string;
  height?: string;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "12px" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
  ".cm-gutters": { backgroundColor: "#f6f8fa", borderRight: "1px solid #d1d9e0" },
});

export function XmlEditor({ value, onChange, className, height = "100%" }: Props) {
  return (
    <div className={className}>
      <CodeMirror
        value={value}
        height={height}
        theme={githubLight}
        extensions={[xml(), baseTheme, EditorView.lineWrapping]}
        onChange={onChange}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: true,
          searchKeymap: true,
          autocompletion: true,
          closeBrackets: true,
          bracketMatching: true,
          indentOnInput: true,
        }}
      />
    </div>
  );
}
