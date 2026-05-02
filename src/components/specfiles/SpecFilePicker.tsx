import { useEffect, useState } from "react";
import { listSpecFiles, type SpecFileItem } from "../../lib/api/specFilesApi";

interface Props {
  currentPaths: string[];
  onSave: (paths: string[]) => void;
  onClose: () => void;
}

export function SpecFilePicker({ currentPaths, onSave, onClose }: Props) {
  const [specFiles, setSpecFiles] = useState<SpecFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentPaths));
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  useEffect(() => {
    void (async () => {
      try {
        const files = await listSpecFiles();
        const mdFiles = files.filter((f) => {
          if (!f.name.endsWith(".md")) return false;
          const segments = f.name.split("/");
          return !segments.some((s) => s === "_system" || s === "_distilled");
        });
        setSpecFiles(mdFiles);
        // Auto-expand folders that have selected files
        const folders = new Set<string>();
        for (const f of mdFiles) {
          const lastSlash = f.name.lastIndexOf("/");
          if (lastSlash >= 0) {
            const folder = f.name.substring(0, lastSlash);
            if (currentPaths.some((p) => p.startsWith(folder + "/") || p.startsWith(folder))) {
              folders.add(folder);
            }
          }
        }
        setExpandedFolders(folders);
      } catch (e) {
        console.warn("[SpecFilePicker] Failed to load spec files:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Group files by folder
  const groups = new Map<string, string[]>();
  for (const f of specFiles) {
    const lastSlash = f.name.lastIndexOf("/");
    const folder = lastSlash >= 0 ? f.name.substring(0, lastSlash) : "(root)";
    if (!groups.has(folder)) groups.set(folder, []);
    groups.get(folder)!.push(f.name);
  }
  const sortedGroups = [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0]));

  function toggleFile(path: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  function toggleFolder(folderFiles: string[]) {
    const allSelected = folderFiles.every((f) => selected.has(f));
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of folderFiles) {
        if (allSelected) next.delete(f);
        else next.add(f);
      }
      return next;
    });
  }

  function toggleFolderExpand(folder: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  function expandAll() {
    setExpandedFolders(new Set(sortedGroups.map(([f]) => f)));
  }

  function collapseAll() {
    setExpandedFolders(new Set());
  }

  function handleConfirm() {
    onSave([...selected]);
    onClose();
  }

  const allExpanded = sortedGroups.length > 0 && sortedGroups.every(([f]) => expandedFolders.has(f));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/30">
      <div
        className="w-[520px] max-w-[92vw] max-h-[80vh] bg-white rounded-xl shadow-xl border border-[#d1d9e0]/70 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-sm font-semibold text-[#1f2328]">
            Select spec files
            <span className="ml-2 text-xs font-normal text-[#656d76]">
              ({selected.size} selected)
            </span>
          </h2>
          <div className="flex items-center gap-1">
            <button
              onClick={allExpanded ? collapseAll : expandAll}
              className="p-1 rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] transition-colors"
              title={allExpanded ? "Collapse all" : "Expand all"}
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="text-[#656d76] hover:text-[#1f2328] transition-colors p-1 rounded-md hover:bg-[#f6f8fa]"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* File tree */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-[#656d76]">Loading spec files...</div>
          ) : sortedGroups.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#656d76]">No spec files found</div>
          ) : (
            sortedGroups.map(([folder, files]) => {
              const allChecked = files.every((f) => selected.has(f));
              const someChecked = !allChecked && files.some((f) => selected.has(f));
              const isExpanded = expandedFolders.has(folder);
              const checkedCount = files.filter((f) => selected.has(f)).length;

              return (
                <div key={folder} className="mb-1">
                  {/* Folder header with chevron + checkbox + name */}
                  <div className="flex items-center gap-1 py-1 hover:bg-[#f6f8fa] rounded -mx-1 px-1">
                    {/* Chevron */}
                    <button
                      onClick={() => toggleFolderExpand(folder)}
                      className="w-4 h-4 flex items-center justify-center shrink-0 text-[#656d76] hover:text-[#1f2328]"
                    >
                      <svg className={`w-3 h-3 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 16 16">
                        <path d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" />
                      </svg>
                    </button>
                    {/* Checkbox */}
                    <label className="flex items-center gap-2 flex-1 cursor-pointer" onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={allChecked}
                        ref={(el) => { if (el) el.indeterminate = someChecked; }}
                        onChange={() => toggleFolder(files)}
                        className="rounded border-[#d1d9e0] text-[#0969da] focus:ring-[#0969da]/30"
                      />
                      <svg className="w-3.5 h-3.5 text-[#656d76] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
                      </svg>
                      <span className="text-sm font-semibold text-[#656d76] flex-1 truncate text-left">{folder}</span>
                      <span className="text-xs text-[#8b949e]">{checkedCount}/{files.length}</span>
                    </label>
                  </div>
                  {/* Individual files — collapsible */}
                  {isExpanded && (
                    <div className="ml-6 space-y-0.5">
                      {files.map((filePath) => {
                        const fileName = filePath.substring(filePath.lastIndexOf("/") + 1);
                        return (
                          <label
                            key={filePath}
                            className="flex items-center gap-2 py-0.5 text-sm text-[#1f2328] cursor-pointer hover:bg-[#f6f8fa] rounded px-1 -ml-1"
                          >
                            <input
                              type="checkbox"
                              checked={selected.has(filePath)}
                              onChange={() => toggleFile(filePath)}
                              className="rounded border-[#d1d9e0] text-[#0969da] focus:ring-[#0969da]/30"
                            />
                            {fileName}
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-3 border-t border-[#d1d9e0] shrink-0">
          <button
            onClick={onClose}
            className="text-sm font-medium text-[#656d76] hover:text-[#1f2328] px-3 py-1.5 rounded-md hover:bg-[#f6f8fa] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            className="text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] px-3 py-1.5 rounded-md transition-colors"
          >
            Confirm ({selected.size})
          </button>
        </div>
      </div>
    </div>
  );
}
