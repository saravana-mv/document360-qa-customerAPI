import { useState } from "react";

interface Props {
  folderPath: string;
  onImport: (url: string, folderPath: string, filename?: string) => Promise<void>;
  onClose: () => void;
}

/** Derive a filename from a URL path segment. */
function filenameFromUrl(url: string): string {
  try {
    const u = new URL(url);
    const segments = u.pathname.split("/").filter(Boolean);
    const last = segments[segments.length - 1] ?? "imported.md";
    return last.endsWith(".md") ? last : `${last}.md`;
  } catch {
    return "imported.md";
  }
}

function isValidUrl(s: string): boolean {
  try {
    const u = new URL(s);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

export function ImportFromUrlModal({ folderPath, onImport, onClose }: Props) {
  const [url, setUrl] = useState("");
  const [filename, setFilename] = useState("");
  const [autoFilename, setAutoFilename] = useState("imported.md");
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const validUrl = isValidUrl(url);
  const effectiveFilename = filename.trim() || autoFilename;

  function handleUrlChange(value: string) {
    setUrl(value);
    setError(null);
    if (isValidUrl(value)) {
      setAutoFilename(filenameFromUrl(value));
    }
  }

  async function handleImport() {
    if (!validUrl || importing) return;
    setImporting(true);
    setError(null);
    try {
      const fn = filename.trim() || undefined;
      await onImport(url, folderPath, fn);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#d1d9e0]">
          <div>
            <h2 className="text-sm font-semibold text-[#1f2328]">Import from URL</h2>
            <p className="text-xs text-[#656d76] mt-0.5">
              Download a Markdown file from an HTTP URL
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={importing}
            className="text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 rounded p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Target folder */}
          <div>
            <label className="block text-sm font-medium text-[#656d76] mb-1">Target folder</label>
            <div className="flex items-center gap-1.5 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5">
              <svg className="w-4 h-4 text-yellow-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
              </svg>
              <span className="font-mono">{folderPath || "/"}</span>
            </div>
          </div>

          {/* URL input */}
          <div>
            <label className="block text-sm font-medium text-[#656d76] mb-1">URL</label>
            <input
              type="url"
              value={url}
              onChange={(e) => handleUrlChange(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && validUrl) void handleImport(); }}
              placeholder="https://example.com/spec.md"
              disabled={importing || done}
              className="w-full text-sm border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] placeholder-[#afb8c1] disabled:opacity-60"
              autoFocus
            />
            {url && !validUrl && (
              <p className="text-xs text-[#d1242f] mt-1">Enter a valid HTTP or HTTPS URL</p>
            )}
          </div>

          {/* Filename override */}
          <div>
            <label className="block text-sm font-medium text-[#656d76] mb-1">
              Filename <span className="text-[#afb8c1] font-normal">(optional override)</span>
            </label>
            <input
              type="text"
              value={filename}
              onChange={(e) => setFilename(e.target.value)}
              placeholder={autoFilename}
              disabled={importing || done}
              className="w-full text-sm border border-[#d1d9e0] rounded-md px-2.5 py-1.5 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] placeholder-[#afb8c1] disabled:opacity-60"
            />
            {validUrl && (
              <p className="text-xs text-[#656d76] mt-1">
                Will be saved as <span className="font-mono">{folderPath ? `${folderPath}/` : ""}{effectiveFilename}</span>
              </p>
            )}
          </div>

          {/* Error */}
          {error && (
            <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
              {error}
            </div>
          )}

          {/* Success */}
          {done && (
            <div className="px-3 py-2 bg-[#dafbe1] border border-[#aceebb] rounded-md text-sm text-[#1a7f37] flex items-center gap-2">
              <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
              </svg>
              File imported successfully
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] shrink-0">
          <button
            onClick={onClose}
            disabled={importing}
            className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-1.5 hover:bg-[#f6f8fa] disabled:opacity-40"
          >
            {done ? "Close" : "Cancel"}
          </button>
          {!done && (
            <button
              onClick={() => void handleImport()}
              disabled={!validUrl || importing}
              className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
            >
              {importing && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
              )}
              {importing ? "Importing…" : "Import"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
