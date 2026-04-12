import { useCallback, useRef, useState } from "react";

interface UploadFile {
  file: File;
  status: "pending" | "uploading" | "done" | "error";
  error?: string;
}

interface Props {
  folderPath: string; // target folder in blob storage, e.g. "v3/articles"
  onUpload: (name: string, content: string, contentType: string) => Promise<void>;
  onClose: () => void;
}

function contentTypeFor(name: string): string {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "md") return "text/markdown";
  if (ext === "xml" || ext === "xsd") return "application/xml";
  return "text/plain";
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = () => reject(reader.error);
    reader.readAsText(file, "utf-8");
  });
}

export function FileUploadModal({ folderPath, onUpload, onClose }: Props) {
  const [items, setItems] = useState<UploadFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  function addFiles(fileList: FileList | null) {
    if (!fileList) return;
    const newItems: UploadFile[] = Array.from(fileList).map((file) => ({
      file,
      status: "pending",
    }));
    setItems((prev) => {
      // Deduplicate by name
      const existing = new Set(prev.map((i) => i.file.name));
      return [...prev, ...newItems.filter((i) => !existing.has(i.file.name))];
    });
  }

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    addFiles(e.dataTransfer.files);
  }, []);

  function removeItem(name: string) {
    setItems((prev) => prev.filter((i) => i.file.name !== name));
  }

  async function handleUpload() {
    if (items.length === 0 || uploading) return;
    setUploading(true);

    for (const item of items) {
      if (item.status === "done") continue;

      setItems((prev) =>
        prev.map((i) => (i.file.name === item.file.name ? { ...i, status: "uploading" } : i))
      );

      try {
        const content = await readAsText(item.file);
        const blobName = folderPath ? `${folderPath}/${item.file.name}` : item.file.name;
        await onUpload(blobName, content, contentTypeFor(item.file.name));
        setItems((prev) =>
          prev.map((i) => (i.file.name === item.file.name ? { ...i, status: "done" } : i))
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setItems((prev) =>
          prev.map((i) =>
            i.file.name === item.file.name ? { ...i, status: "error", error: msg } : i
          )
        );
      }
    }

    setUploading(false);
  }

  const allDone = items.length > 0 && items.every((i) => i.status === "done");
  const hasErrors = items.some((i) => i.status === "error");
  const hasPending = items.some((i) => i.status === "pending");

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-md mx-4 flex flex-col" style={{ maxHeight: "80vh" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#d1d9e0]">
          <div>
            <h2 className="text-sm font-semibold text-[#1f2328]">Upload files</h2>
            <p className="text-xs text-[#656d76] mt-0.5">
              → <span className="font-mono">{folderPath || "/"}</span>
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 rounded p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Drop zone */}
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={handleDrop}
          onClick={() => inputRef.current?.click()}
          className={`mx-4 mt-4 flex flex-col items-center justify-center gap-2 rounded-md border-2 border-dashed py-8 cursor-pointer transition-colors ${
            dragOver ? "border-[#0969da] bg-[#ddf4ff]" : "border-[#d1d9e0] hover:border-[#afb8c1] hover:bg-[#f6f8fa]"
          }`}
        >
          <svg className="w-8 h-8 text-[#afb8c1]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
          </svg>
          <p className="text-xs text-[#656d76]">
            Drop files here or <span className="text-[#0969da]">browse</span>
          </p>
          <p className="text-xs text-[#afb8c1]">.md · .xml · .xsd · .txt</p>
          <input
            ref={inputRef}
            type="file"
            multiple
            accept=".md,.xml,.xsd,.txt"
            className="hidden"
            onChange={(e) => addFiles(e.target.files)}
          />
        </div>

        {/* File list */}
        {items.length > 0 && (
          <div className="flex-1 overflow-y-auto mx-4 mt-3 space-y-1">
            {items.map((item) => (
              <div key={item.file.name} className="flex items-center gap-2 text-xs rounded-md px-2 py-1.5 bg-[#f6f8fa]">
                {item.status === "pending" && <span className="w-4 h-4 rounded-full border-2 border-[#afb8c1] shrink-0" />}
                {item.status === "uploading" && (
                  <svg className="w-4 h-4 text-[#0969da] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                  </svg>
                )}
                {item.status === "done" && (
                  <svg className="w-4 h-4 text-[#1a7f37] shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                )}
                {item.status === "error" && (
                  <svg className="w-4 h-4 text-[#d1242f] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126Z" />
                  </svg>
                )}
                <span className="flex-1 truncate font-mono text-[#1f2328]">{item.file.name}</span>
                {item.status === "error" && (
                  <span className="text-[#d1242f] truncate max-w-24" title={item.error}>{item.error}</span>
                )}
                {item.status === "pending" && (
                  <button
                    onClick={() => removeItem(item.file.name)}
                    className="text-[#656d76] hover:text-[#d1242f] rounded p-0.5 shrink-0"
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] mt-3 shrink-0">
          <button
            onClick={onClose}
            disabled={uploading}
            className="text-xs text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-1.5 hover:bg-[#f6f8fa] disabled:opacity-40"
          >
            {allDone ? "Close" : "Cancel"}
          </button>
          {!allDone && (
            <button
              onClick={() => void handleUpload()}
              disabled={uploading || items.length === 0 || !hasPending}
              className="text-xs font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors"
            >
              {uploading ? "Uploading…" : hasErrors ? "Retry failed" : `Upload ${items.length} file${items.length !== 1 ? "s" : ""}`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
