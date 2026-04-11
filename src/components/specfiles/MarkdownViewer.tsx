import { useState } from "react";
import MDEditor from "@uiw/react-md-editor";

interface Props {
  path: string;
  content: string;
}

export function MarkdownViewer({ path, content }: Props) {
  const [raw, setRaw] = useState(false);
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];
  const folder = parts.slice(0, -1).join(" / ");
  const isMarkdown = fileName.endsWith(".md");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex-1 min-w-0">
          <span className="text-sm font-medium text-gray-800 truncate block">{fileName}</span>
          {folder && <p className="text-xs text-gray-400 truncate">{folder}</p>}
        </div>
        {/* Raw / Rendered toggle — only meaningful for markdown */}
        {isMarkdown && (
          <div className="flex items-center shrink-0 rounded overflow-hidden border border-gray-200 text-xs">
            <button
              onClick={() => setRaw(false)}
              className={`px-2.5 py-1 transition-colors ${!raw ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Rendered
            </button>
            <button
              onClick={() => setRaw(true)}
              className={`px-2.5 py-1 transition-colors ${raw ? "bg-blue-600 text-white" : "text-gray-500 hover:bg-gray-50"}`}
            >
              Raw
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {isMarkdown && !raw ? (
          <div className="p-6 max-w-4xl" data-color-mode="light">
            <MDEditor.Markdown
              source={content}
              style={{ background: "transparent", fontFamily: "inherit" }}
            />
          </div>
        ) : (
          <pre className="p-6 text-xs font-mono text-gray-700 whitespace-pre-wrap break-words leading-relaxed">
            {content}
          </pre>
        )}
      </div>
    </div>
  );
}
