import { useState } from "react";
import type { IdeaFolderDoc } from "../../lib/api/ideaFoldersApi";

interface Props {
  folders: IdeaFolderDoc[];
  presetParentPath?: string | null;
  onSave: (name: string, parentPath: string | null) => Promise<void>;
  onClose: () => void;
}

function slugify(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

export function CreateFolderModal({ folders, presetParentPath, onSave, onClose }: Props) {
  const [name, setName] = useState("");
  const [parentPath, setParentPath] = useState<string | null>(presetParentPath ?? null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const slug = slugify(name);
  const computedPath = parentPath ? `${parentPath}/${slug}` : slug;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !slug) return;
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim(), parentPath);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  // Build parent options from existing folders
  const parentOptions = folders
    .slice()
    .sort((a, b) => a.path.localeCompare(b.path));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="w-[420px] max-w-[92vw] bg-white rounded-xl shadow-xl border border-[#d1d9e0]/70 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 pt-4 pb-2">
          <h2 className="text-sm font-semibold text-[#1f2328]">New folder</h2>
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

        <form onSubmit={handleSubmit} className="px-5 pb-4 space-y-3">
          {/* Name input */}
          <div>
            <label className="block text-xs font-medium text-[#656d76] mb-1">Folder name</label>
            <input
              autoFocus
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Articles"
              className="w-full text-sm px-3 py-1.5 border border-[#d1d9e0] rounded-md outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30 text-[#1f2328]"
            />
          </div>

          {/* Parent folder dropdown */}
          <div>
            <label className="block text-xs font-medium text-[#656d76] mb-1">Parent folder</label>
            <select
              value={parentPath ?? ""}
              onChange={(e) => setParentPath(e.target.value || null)}
              className="w-full text-sm px-3 py-1.5 border border-[#d1d9e0] rounded-md outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30 text-[#1f2328] bg-white"
            >
              <option value="">(Root level)</option>
              {parentOptions.map((f) => (
                <option key={f.id} value={f.path}>{f.path}</option>
              ))}
            </select>
          </div>

          {/* Path preview */}
          {slug && (
            <p className="text-xs text-[#656d76]">
              Path: <span className="font-mono text-[#1f2328]">{computedPath}</span>
            </p>
          )}

          {error && (
            <p className="text-xs text-[#d1242f]">{error}</p>
          )}

          {/* Footer */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="text-sm font-medium text-[#656d76] hover:text-[#1f2328] px-3 py-1.5 rounded-md hover:bg-[#f6f8fa] transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={!slug || saving}
              className="text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] px-3 py-1.5 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {saving ? "Creating..." : "Create"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
