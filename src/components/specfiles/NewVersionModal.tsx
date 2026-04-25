import { useRef, useState } from "react";
import { Modal } from "../common/Modal";

interface NewVersionModalProps {
  open: boolean;
  onClose: () => void;
  onCreate: (folderName: string, specContent?: string, specUrl?: string) => Promise<void>;
}

type ImportMode = "none" | "file" | "url";

export function NewVersionModal({ open, onClose, onCreate }: NewVersionModalProps) {
  const [name, setName] = useState("");
  const [importMode, setImportMode] = useState<ImportMode>("none");
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [specUrl, setSpecUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setName("");
    setImportMode("none");
    setSpecFile(null);
    setSpecUrl("");
    setBusy(false);
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  const nameValid = /^[a-zA-Z0-9_-]+$/.test(name.trim());
  const hasSpec = importMode === "file" ? !!specFile : importMode === "url" ? specUrl.trim().length > 0 : false;
  const canCreate = name.trim().length > 0 && nameValid && !busy;

  async function handleCreate() {
    if (!canCreate) return;
    setBusy(true);
    setError(null);

    try {
      let specContent: string | undefined;
      let specUrlToPass: string | undefined;

      if (importMode === "file" && specFile) {
        specContent = await specFile.text();
        // Validate it's valid JSON
        try {
          const parsed = JSON.parse(specContent);
          if (!parsed.openapi && !parsed.swagger) {
            setError("File is not a valid OpenAPI 3.x or Swagger 2.x spec");
            setBusy(false);
            return;
          }
        } catch {
          setError("File is not valid JSON");
          setBusy(false);
          return;
        }
      } else if (importMode === "url" && specUrl.trim()) {
        specUrlToPass = specUrl.trim();
      }

      await onCreate(name.trim(), specContent, specUrlToPass);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && canCreate) {
      e.preventDefault();
      void handleCreate();
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="New API Version"
      footer={
        <>
          <button
            onClick={handleClose}
            disabled={busy}
            className="px-3 py-1.5 text-sm rounded-md border border-[#d1d9e0] text-[#1f2328] hover:bg-[#f6f8fa] disabled:opacity-50 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => void handleCreate()}
            disabled={!canCreate}
            className="px-3 py-1.5 text-sm rounded-md bg-[#1a7f37] text-white hover:bg-[#178534] disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                {hasSpec ? "Creating & splitting…" : "Creating…"}
              </span>
            ) : (
              hasSpec ? "Create & Import" : "Create"
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4" onKeyDown={handleKeyDown}>
        {/* Version Name */}
        <div>
          <label className="block text-sm font-medium text-[#1f2328] mb-1">
            Version Name <span className="text-[#d1242f]">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. V3, V2"
            autoFocus
            disabled={busy}
            className="w-full px-3 py-1.5 text-sm rounded-md border border-[#d1d9e0] bg-white text-[#1f2328] placeholder:text-[#656d76] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent disabled:opacity-50"
          />
          {name.trim() && !nameValid && (
            <p className="text-xs text-[#d1242f] mt-1">
              Only letters, numbers, hyphens, and underscores allowed
            </p>
          )}
        </div>

        {/* Import OpenAPI Spec */}
        <div>
          <label className="block text-sm font-medium text-[#1f2328] mb-2">
            Import OpenAPI Spec <span className="text-xs text-[#656d76] font-normal">(optional)</span>
          </label>

          {/* Toggle buttons */}
          <div className="flex gap-1 mb-3">
            {(["none", "file", "url"] as ImportMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => {
                  setImportMode(mode);
                  setError(null);
                }}
                disabled={busy}
                className={`px-2.5 py-1 text-xs rounded-md border transition-colors ${
                  importMode === mode
                    ? "bg-[#ddf4ff] border-[#0969da] text-[#0969da]"
                    : "border-[#d1d9e0] text-[#656d76] hover:bg-[#f6f8fa]"
                } disabled:opacity-50`}
              >
                {mode === "none" ? "None" : mode === "file" ? "Upload File" : "From URL"}
              </button>
            ))}
          </div>

          {/* File upload */}
          {importMode === "file" && (
            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json"
                onChange={(e) => {
                  setSpecFile(e.target.files?.[0] ?? null);
                  setError(null);
                }}
                disabled={busy}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={busy}
                className="w-full px-3 py-6 text-sm rounded-md border-2 border-dashed border-[#d1d9e0] text-[#656d76] hover:border-[#0969da] hover:text-[#0969da] hover:bg-[#f6f8fa] transition-colors disabled:opacity-50 cursor-pointer"
              >
                {specFile ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="w-4 h-4 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span className="text-[#1f2328]">{specFile.name}</span>
                    <span className="text-xs text-[#656d76]">({(specFile.size / 1024).toFixed(0)} KB)</span>
                  </span>
                ) : (
                  <span className="flex flex-col items-center gap-1">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                    </svg>
                    Click to select OpenAPI/Swagger JSON file
                  </span>
                )}
              </button>
            </div>
          )}

          {/* URL input */}
          {importMode === "url" && (
            <input
              type="url"
              value={specUrl}
              onChange={(e) => {
                setSpecUrl(e.target.value);
                setError(null);
              }}
              placeholder="https://api.example.com/swagger.json"
              disabled={busy}
              className="w-full px-3 py-1.5 text-sm rounded-md border border-[#d1d9e0] bg-white text-[#1f2328] placeholder:text-[#656d76] focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-transparent disabled:opacity-50"
            />
          )}
        </div>

        {/* Info text */}
        {importMode !== "none" && (
          <p className="text-xs text-[#656d76]">
            The spec will be split into individual per-endpoint .md files organized by tag folders.
            The original file is preserved as <code className="bg-[#f6f8fa] px-1 rounded">_system/_swagger.json</code>.
          </p>
        )}

        {/* Error */}
        {error && (
          <div className="text-sm text-[#d1242f] bg-[#ffebe9] border border-[#d1242f]/20 rounded-md px-3 py-2">
            {error}
          </div>
        )}
      </div>
    </Modal>
  );
}
