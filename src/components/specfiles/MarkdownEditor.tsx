import MDEditor from "@uiw/react-md-editor";

interface Props {
  path: string;
  content: string;
  dirty: boolean;
  saving: boolean;
  onChange: (value: string) => void;
  onSave: () => void;
  onDiscard: () => void;
}

export function MarkdownEditor({ path, content, dirty, saving, onChange, onSave, onDiscard }: Props) {
  const parts = path.split("/");
  const fileName = parts[parts.length - 1];
  const folder = parts.slice(0, -1).join(" / ");

  function handleKeyDown(e: React.KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === "s") {
      e.preventDefault();
      if (dirty && !saving) onSave();
    }
  }

  return (
    <div className="flex flex-col h-full overflow-hidden" onKeyDown={handleKeyDown}>
      {/* File header */}
      <div className="flex items-center gap-3 px-4 py-2 border-b border-gray-200 bg-white shrink-0">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-sm font-medium text-gray-800 truncate">{fileName}</span>
            {dirty && <span className="w-1.5 h-1.5 rounded-full bg-orange-400 shrink-0" title="Unsaved changes" />}
          </div>
          {folder && <p className="text-xs text-gray-400 truncate">{folder}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {dirty && (
            <button
              onClick={onDiscard}
              disabled={saving}
              className="text-xs text-gray-500 hover:text-gray-800 border border-gray-200 rounded px-2.5 py-1 hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              Discard
            </button>
          )}
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-200 disabled:text-gray-400 rounded px-3 py-1 transition-colors"
          >
            {saving ? "Saving…" : "Save"}
          </button>
          <span className="text-xs text-gray-400">Ctrl+S</span>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 overflow-hidden" data-color-mode="light">
        <MDEditor
          value={content}
          onChange={(val) => onChange(val ?? "")}
          height="100%"
          preview="live"
          visibleDragbar={false}
          style={{ height: "100%", borderRadius: 0, border: "none" }}
        />
      </div>
    </div>
  );
}
