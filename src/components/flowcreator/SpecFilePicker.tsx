import { useEffect, useRef, useState } from "react";
import { listSpecFiles, uploadSpecFile, deleteSpecFile, type SpecFileItem } from "../../lib/api/specFilesApi";

interface Props {
  selected: Set<string>;
  onToggle: (name: string) => void;
}

interface FolderNode {
  name: string;
  files: SpecFileItem[];
  open: boolean;
}

function buildTree(files: SpecFileItem[]): FolderNode[] {
  const map = new Map<string, SpecFileItem[]>();
  for (const f of files) {
    const slash = f.name.indexOf("/");
    const folder = slash >= 0 ? f.name.slice(0, slash) : "(root)";
    if (!map.has(folder)) map.set(folder, []);
    map.get(folder)!.push(f);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, fs]) => ({ name, files: fs, open: true }));
}

export function SpecFilePicker({ selected, onToggle }: Props) {
  const [tree, setTree] = useState<FolderNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [folderInput, setFolderInput] = useState("");
  const [openFolders, setOpenFolders] = useState<Set<string>>(new Set());
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function load() {
    setLoading(true);
    setError(null);
    try {
      const files = await listSpecFiles();
      const t = buildTree(files);
      setTree(t);
      setOpenFolders(new Set(t.map((f) => f.name)));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { void load(); }, []);

  function toggleFolder(folder: string) {
    setOpenFolders((prev) => {
      const next = new Set(prev);
      if (next.has(folder)) next.delete(folder);
      else next.add(folder);
      return next;
    });
  }

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      const content = ev.target?.result as string;
      const folder = folderInput.trim().replace(/\/$/, "");
      const blobName = folder ? `${folder}/${file.name}` : file.name;
      setUploading(true);
      try {
        await uploadSpecFile(blobName, content);
        await load();
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      } finally {
        setUploading(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    };
    reader.readAsText(file);
  }

  async function handleDelete(name: string) {
    if (!confirm(`Delete "${name}"?`)) return;
    try {
      await deleteSpecFile(name);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  }

  const totalCount = tree.reduce((s, f) => s + f.files.length, 0);

  return (
    <div className="flex flex-col gap-2">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Spec Context {totalCount > 0 && <span className="text-gray-400 normal-case font-normal">({selected.size}/{totalCount})</span>}
        </span>
        <button
          onClick={load}
          disabled={loading}
          className="text-xs text-blue-500 hover:text-blue-700 disabled:opacity-40"
        >
          {loading ? "Loading…" : "Refresh"}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-xs text-red-500 bg-red-50 rounded px-2 py-1">{error}</p>
      )}

      {/* File tree */}
      <div className="flex-1 overflow-y-auto max-h-64 border border-gray-200 rounded text-xs">
        {tree.length === 0 && !loading && (
          <p className="text-gray-400 p-3 text-center">No spec files uploaded yet</p>
        )}
        {tree.map((folder) => (
          <div key={folder.name}>
            {/* Folder header */}
            <button
              onClick={() => toggleFolder(folder.name)}
              className="w-full flex items-center gap-1 px-2 py-1 bg-gray-50 hover:bg-gray-100 text-gray-600 font-medium border-b border-gray-100 text-left"
            >
              <svg className={`w-3 h-3 shrink-0 transition-transform ${openFolders.has(folder.name) ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
              </svg>
              <svg className="w-3 h-3 shrink-0 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
              </svg>
              {folder.name}
            </button>
            {/* Files */}
            {openFolders.has(folder.name) && folder.files.map((file) => {
              const shortName = file.name.includes("/") ? file.name.split("/").pop()! : file.name;
              const isChecked = selected.has(file.name);
              return (
                <div key={file.name} className="flex items-center gap-2 px-3 py-1 hover:bg-gray-50 group border-b border-gray-50">
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggle(file.name)}
                    className="accent-blue-600 shrink-0"
                  />
                  <span className="flex-1 truncate text-gray-700" title={file.name}>{shortName}</span>
                  <button
                    onClick={() => void handleDelete(file.name)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 transition-opacity shrink-0"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Upload */}
      <div className="flex flex-col gap-1">
        <input
          type="text"
          placeholder="Folder (e.g. articles)"
          value={folderInput}
          onChange={(e) => setFolderInput(e.target.value)}
          className="border border-gray-200 rounded px-2 py-1 text-xs text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
        <label className={`flex items-center justify-center gap-1.5 cursor-pointer rounded border border-dashed border-gray-300 px-3 py-1.5 text-xs text-gray-500 hover:border-blue-400 hover:text-blue-600 transition-colors ${uploading ? "opacity-50 pointer-events-none" : ""}`}>
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          {uploading ? "Uploading…" : "Upload .md / .xml"}
          <input
            ref={fileInputRef}
            type="file"
            accept=".md,.xml,.txt"
            className="hidden"
            onChange={handleUpload}
          />
        </label>
      </div>
    </div>
  );
}
