import { useRef, useState } from "react";
import { Modal } from "../common/Modal";

interface ReimportSpecModalProps {
  open: boolean;
  folderPath: string;
  onClose: () => void;
  onReimport: (specContent?: string, specUrl?: string) => Promise<void>;
}

type ImportMode = "file" | "url";

export function ReimportSpecModal({ open, folderPath, onClose, onReimport }: ReimportSpecModalProps) {
  const [importMode, setImportMode] = useState<ImportMode>("file");
  const [specFile, setSpecFile] = useState<File | null>(null);
  const [specUrl, setSpecUrl] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setImportMode("file");
    setSpecFile(null);
    setSpecUrl("");
    setConfirmation("");
    setBusy(false);
    setError(null);
  }

  function handleClose() {
    if (busy) return;
    reset();
    onClose();
  }

  const hasSpec = importMode === "file" ? !!specFile : specUrl.trim().length > 0;
  const confirmed = confirmation.trim() === folderPath;
  const canReimport = hasSpec && confirmed && !busy;

  async function handleReimport() {
    if (!canReimport) return;
    setBusy(true);
    setError(null);

    try {
      let specContent: string | undefined;
      let specUrlToPass: string | undefined;

      if (importMode === "file" && specFile) {
        specContent = await specFile.text();
        // Validate JSON
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

      await onReimport(specContent, specUrlToPass);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={handleClose}
      title="Reimport OpenAPI Spec"
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
            onClick={() => void handleReimport()}
            disabled={!canReimport}
            className="px-3 py-1.5 text-sm rounded-md bg-[#d1242f] text-white hover:bg-[#b91c1c] disabled:opacity-50 transition-colors"
          >
            {busy ? (
              <span className="flex items-center gap-1.5">
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Reimporting…
              </span>
            ) : (
              "Reimport"
            )}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        {/* Warning banner */}
        <div className="bg-[#ffebe9] border border-[#d1242f]/20 rounded-md px-3 py-2.5 text-sm text-[#1f2328]">
          <div className="flex gap-2">
            <svg className="w-4 h-4 text-[#d1242f] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
            <div>
              This will <strong>delete all spec files, ideas, flows, and scenarios</strong> under <strong>{folderPath}</strong>.
              <br />
              <span className="text-[#656d76]">Project variables, connections, and learned skills (_skills.md, _rules.json) will be preserved.</span>
            </div>
          </div>
        </div>

        {/* Import mode toggle */}
        <div>
          <label className="block text-sm font-medium text-[#1f2328] mb-2">New OpenAPI Spec</label>
          <div className="flex gap-1 mb-3">
            {(["file", "url"] as ImportMode[]).map((mode) => (
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
                {mode === "file" ? "Upload File" : "From URL"}
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

        {/* Confirmation */}
        <div>
          <label className="block text-sm font-medium text-[#1f2328] mb-1">
            Type <code className="bg-[#f6f8fa] px-1.5 py-0.5 rounded text-[#d1242f] font-mono text-xs">{folderPath}</code> to confirm
          </label>
          <input
            type="text"
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            placeholder={folderPath}
            disabled={busy}
            className={`w-full px-3 py-1.5 text-sm rounded-md border bg-white text-[#1f2328] placeholder:text-[#656d76] focus:outline-none focus:ring-2 focus:border-transparent disabled:opacity-50 ${
              confirmation.trim().length > 0 && !confirmed
                ? "border-[#d1242f] focus:ring-[#d1242f]"
                : "border-[#d1d9e0] focus:ring-[#0969da]"
            }`}
          />
        </div>

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
