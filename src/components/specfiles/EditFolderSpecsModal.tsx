import { useEffect, useState } from "react";
import { listSpecFiles, type SpecFileItem } from "../../lib/api/specFilesApi";

interface Props {
  currentPaths: string[];
  onSave: (paths: string[]) => Promise<void>;
  onClose: () => void;
}

export function EditFolderSpecsModal({ currentPaths, onSave, onClose }: Props) {
  const [specFiles, setSpecFiles] = useState<SpecFileItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(currentPaths));
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const files = await listSpecFiles();
        setSpecFiles(files.filter((f) => f.name.endsWith(".md")));
      } catch (e) {
        console.warn("[EditFolderSpecsModal] Failed to load spec files:", e);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

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

  async function handleSave() {
    setSaving(true);
    try {
      await onSave([...selected]);
      onClose();
    } catch {
      /* ignore */
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={onClose}>
      <div
        className="w-[520px] max-w-[92vw] max-h-[80vh] bg-white rounded-xl shadow-xl border border-[#d1d9e0]/70 flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <h2 className="text-sm font-semibold text-[#1f2328]">
            Edit spec files
            <span className="ml-2 text-xs font-normal text-[#656d76]">
              ({selected.size} selected)
            </span>
          </h2>
          <button
            onClick={onClose}
            className="text-[#656d76] hover:text-[#1f2328] transition-colors p-1 -mr-1 rounded-md hover:bg-[#f6f8fa]"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* File list */}
        <div className="flex-1 overflow-y-auto px-5 pb-2">
          {loading ? (
            <div className="py-8 text-center text-sm text-[#656d76]">Loading spec files...</div>
          ) : sortedGroups.length === 0 ? (
            <div className="py-8 text-center text-sm text-[#656d76]">No spec files found</div>
          ) : (
            sortedGroups.map(([folder, files]) => {
              const allChecked = files.every((f) => selected.has(f));
              const someChecked = !allChecked && files.some((f) => selected.has(f));
              return (
                <div key={folder} className="mb-3">
                  {/* Folder header with select all */}
                  <button
                    onClick={() => toggleFolder(files)}
                    className="flex items-center gap-2 w-full text-left py-1 text-xs font-semibold text-[#656d76] hover:text-[#1f2328] transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={allChecked}
                      ref={(el) => { if (el) el.indeterminate = someChecked; }}
                      readOnly
                      className="rounded border-[#d1d9e0] text-[#0969da] focus:ring-[#0969da]/30"
                    />
                    <svg className="w-3.5 h-3.5 text-[#656d76]" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
                    </svg>
                    {folder}
                  </button>
                  {/* Individual files */}
                  <div className="ml-5 space-y-0.5">
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
            onClick={handleSave}
            disabled={saving}
            className="text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : `Save (${selected.size})`}
          </button>
        </div>
      </div>
    </div>
  );
}
