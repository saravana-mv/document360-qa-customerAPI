// Editable JSON editor backed by CodeMirror 6.
// Same styling as JsonCodeBlock but with editing enabled.

import CodeMirror from "@uiw/react-codemirror";
import { json } from "@codemirror/lang-json";
import { githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";

interface Props {
  value: string;
  onChange: (value: string) => void;
  height?: string;
  placeholder?: string;
}

const baseTheme = EditorView.theme({
  "&": { fontSize: "12px" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" },
  ".cm-gutters": { backgroundColor: "#f6f8fa", borderRight: "1px solid #d1d9e0" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-activeLine": { backgroundColor: "#ddf4ff33" },
  ".cm-content": { caretColor: "#0969da" },
  "&.cm-focused": { outline: "none" },
});

export function JsonEditor({ value, onChange, height = "12rem", placeholder }: Props) {
  return (
    <div className="border border-[#d1d9e0] rounded-md overflow-hidden focus-within:border-[#0969da] focus-within:ring-1 focus-within:ring-[#0969da] transition-colors">
      <CodeMirror
        value={value}
        height={height}
        theme={githubLight}
        extensions={[json(), baseTheme, EditorView.lineWrapping]}
        onChange={onChange}
        placeholder={placeholder}
        basicSetup={{
          lineNumbers: true,
          foldGutter: true,
          highlightActiveLine: true,
          highlightActiveLineGutter: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
          bracketMatching: true,
          closeBrackets: true,
          autocompletion: false,
        }}
      />
    </div>
  );
}
