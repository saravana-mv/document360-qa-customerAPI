import { useState } from "react";

interface Props {
  folderPath: string;
  onImport: (url: string, folderPath: string, filename?: string, accessToken?: string) => Promise<void>;
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
    const u = new URL(s.trim());
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

interface UrlEntry {
  url: string;
  filename: string;
  status: "pending" | "importing" | "done" | "error" | "warning";
  error?: string;
}

export function ImportFromUrlModal({ folderPath, onImport, onClose }: Props) {
  const [rawText, setRawText] = useState("");
  const [entries, setEntries] = useState<UrlEntry[]>([]);
  const [importing, setImporting] = useState(false);
  const [phase, setPhase] = useState<"input" | "review" | "done">("input");
  const [accessToken, setAccessToken] = useState("");
  const [tokenExpanded, setTokenExpanded] = useState(false);

  // Parse URLs from raw text
  function handleContinue() {
    const lines = rawText.split("\n").map((l) => l.trim()).filter(Boolean);
    const parsed: UrlEntry[] = [];
    for (const line of lines) {
      if (isValidUrl(line)) {
        parsed.push({ url: line, filename: filenameFromUrl(line), status: "pending" });
      }
    }
    if (parsed.length > 0) {
      setEntries(parsed);
      setPhase("review");
    }
  }

  const validCount = rawText.split("\n").map((l) => l.trim()).filter((l) => l && isValidUrl(l)).length;
  const invalidCount = rawText.split("\n").map((l) => l.trim()).filter((l) => l && !isValidUrl(l)).length;

  async function handleImportAll() {
    setImporting(true);
    const token = accessToken.trim() || undefined;
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.status !== "pending") continue;
      setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "importing" } : e));
      try {
        await onImport(entry.url, folderPath, undefined, token);
        setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "done" } : e));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isAuthWarning = msg.includes("authentication may be required") || msg.includes("Redirection detected") || msg.includes("HTML");
        setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: isAuthWarning ? "warning" : "error", error: msg } : e));
      }
    }
    setImporting(false);
    setPhase("done");
  }

  // Retry only failed/warning entries with updated token
  async function handleRetryFailed() {
    setImporting(true);
    setPhase("review");
    const token = accessToken.trim() || undefined;
    // Reset warning/error entries back to pending
    setEntries((prev) => prev.map((e) =>
      e.status === "warning" || e.status === "error" ? { ...e, status: "pending", error: undefined } : e,
    ));
    // Small delay so state updates
    await new Promise((r) => setTimeout(r, 50));
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (entry.status !== "pending" && entry.status !== "warning" && entry.status !== "error") continue;
      setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "importing" } : e));
      try {
        await onImport(entry.url, folderPath, undefined, token);
        setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "done" } : e));
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        const isAuthWarning = msg.includes("authentication may be required") || msg.includes("Redirection detected") || msg.includes("HTML");
        setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: isAuthWarning ? "warning" : "error", error: msg } : e));
      }
    }
    setImporting(false);
    setPhase("done");
  }

  const doneCount = entries.filter((e) => e.status === "done").length;
  const errorCount = entries.filter((e) => e.status === "error").length;
  const warningCount = entries.filter((e) => e.status === "warning").length;
  const failedCount = errorCount + warningCount;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-lg mx-4 flex flex-col max-h-[80vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-[#d1d9e0] shrink-0">
          <div>
            <h2 className="text-sm font-semibold text-[#1f2328]">Import from URL</h2>
            <p className="text-xs text-[#656d76] mt-0.5">
              {phase === "input"
                ? "Paste one URL per line"
                : phase === "review"
                  ? `${entries.length} file${entries.length !== 1 ? "s" : ""} to import into ${folderPath || "/"}`
                  : `Import complete — ${doneCount} succeeded${warningCount > 0 ? `, ${warningCount} skipped (auth required)` : ""}${errorCount > 0 ? `, ${errorCount} failed` : ""}`}
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
        <div className="px-4 py-4 overflow-y-auto flex-1">
          {phase === "input" && (
            <div className="space-y-3">
              {/* Target folder */}
              <div>
                <label className="block text-sm font-medium text-[#656d76] mb-1">Target folder</label>
                <div className="flex items-center gap-1.5 text-sm text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5">
                  <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
                  </svg>
                  <span className="font-mono">{folderPath || "/"}</span>
                </div>
              </div>

              {/* URLs textarea */}
              <div>
                <label className="block text-sm font-medium text-[#656d76] mb-1">URLs</label>
                <textarea
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={"https://example.com/articles/create-article.md\nhttps://example.com/articles/update-article.md\nhttps://example.com/articles/delete-article.md"}
                  rows={6}
                  className="w-full text-sm border border-[#d1d9e0] rounded-md px-2.5 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] placeholder-[#afb8c1] font-mono resize-y"
                  autoFocus
                />
                <div className="flex items-center gap-3 mt-1.5">
                  {validCount > 0 && (
                    <span className="text-xs text-[#1a7f37]">{validCount} valid URL{validCount !== 1 ? "s" : ""}</span>
                  )}
                  {invalidCount > 0 && (
                    <span className="text-xs text-[#d1242f]">{invalidCount} invalid line{invalidCount !== 1 ? "s" : ""} (will be skipped)</span>
                  )}
                  {validCount === 0 && rawText.trim() && (
                    <span className="text-xs text-[#d1242f]">No valid URLs found</span>
                  )}
                </div>
              </div>

              {/* Access Token — expandable */}
              <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
                <button
                  type="button"
                  onClick={() => setTokenExpanded(!tokenExpanded)}
                  className="w-full flex items-center gap-2 px-2.5 py-2 text-sm text-[#656d76] hover:bg-[#f6f8fa] transition-colors"
                >
                  <svg
                    className={`w-3.5 h-3.5 shrink-0 transition-transform ${tokenExpanded ? "rotate-90" : ""}`}
                    fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="m8.25 4.5 7.5 7.5-7.5 7.5" />
                  </svg>
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                  </svg>
                  <span className="font-medium">Authentication</span>
                  {accessToken.trim() && (
                    <span className="text-xs text-[#1a7f37] ml-auto mr-1">Token provided</span>
                  )}
                </button>
                {tokenExpanded && (
                  <div className="px-2.5 pb-2.5 space-y-2 border-t border-[#d1d9e0]">
                    <p className="text-xs text-[#656d76] mt-2 leading-relaxed">
                      If the URLs require authentication, paste a session cookie or bearer token below.
                      The token will be sent as a <code className="bg-[#f6f8fa] px-1 rounded text-xs">Cookie</code> header with each request.
                    </p>
                    <div className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-2 text-xs text-[#656d76] space-y-1.5">
                      <p className="font-medium text-[#1f2328]">How to get the token:</p>
                      <ol className="list-decimal list-inside space-y-0.5">
                        <li>Open the URL in your browser (where you're logged in)</li>
                        <li>Open DevTools (<code className="bg-white px-1 rounded">F12</code>) → <strong>Network</strong> tab</li>
                        <li>Reload the page and click the first request</li>
                        <li>Under <strong>Request Headers</strong>, copy the <code className="bg-white px-1 rounded">Cookie</code> value</li>
                      </ol>
                    </div>
                    <textarea
                      value={accessToken}
                      onChange={(e) => setAccessToken(e.target.value)}
                      placeholder="Paste cookie or bearer token here..."
                      rows={2}
                      className="w-full text-sm border border-[#d1d9e0] rounded-md px-2.5 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] placeholder-[#afb8c1] font-mono resize-y"
                    />
                  </div>
                )}
              </div>
            </div>
          )}

          {(phase === "review" || phase === "done") && (
            <div className="space-y-1.5">
              {entries.map((entry, i) => (
                <div
                  key={i}
                  className={`flex items-center gap-2 px-2.5 py-2 rounded-md border text-sm ${
                    entry.status === "done"
                      ? "bg-[#dafbe1] border-[#aceebb]"
                      : entry.status === "warning"
                        ? "bg-[#fff8c5] border-[#d4a72c]"
                        : entry.status === "error"
                          ? "bg-[#ffebe9] border-[#ffcecb]"
                          : entry.status === "importing"
                            ? "bg-[#ddf4ff] border-[#54aeff]"
                            : "bg-white border-[#d1d9e0]"
                  }`}
                >
                  {/* Status icon */}
                  {entry.status === "done" && (
                    <svg className="w-4 h-4 text-[#1a7f37] shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                    </svg>
                  )}
                  {entry.status === "warning" && (
                    <svg className="w-4 h-4 text-[#9a6700] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                  )}
                  {entry.status === "error" && (
                    <svg className="w-4 h-4 text-[#d1242f] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
                    </svg>
                  )}
                  {entry.status === "importing" && (
                    <svg className="w-4 h-4 text-[#0969da] shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                    </svg>
                  )}
                  {entry.status === "pending" && (
                    <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-[#1f2328] font-medium truncate">{entry.filename}</p>
                    <p className="text-xs text-[#656d76] truncate">{entry.url}</p>
                    {entry.error && (
                      <p className={`text-xs mt-0.5 ${entry.status === "warning" ? "text-[#9a6700]" : "text-[#d1242f]"}`}>{entry.error}</p>
                    )}
                  </div>
                </div>
              ))}

              {/* Token input on done phase when there are failures */}
              {phase === "done" && failedCount > 0 && (
                <div className="mt-3 border border-[#d4a72c] rounded-md bg-[#fff8c5] px-3 py-2.5 space-y-2">
                  <p className="text-xs text-[#9a6700] font-medium">
                    {failedCount} file{failedCount !== 1 ? "s" : ""} failed — paste an access token to retry
                  </p>
                  <div className="bg-white border border-[#d1d9e0] rounded-md px-2.5 py-2 text-xs text-[#656d76] space-y-1.5">
                    <p className="font-medium text-[#1f2328]">How to get the token:</p>
                    <ol className="list-decimal list-inside space-y-0.5">
                      <li>Open the URL in your browser (where you're logged in)</li>
                      <li>Open DevTools (<code className="bg-[#f6f8fa] px-1 rounded">F12</code>) → <strong>Network</strong> tab</li>
                      <li>Reload the page and click the first request</li>
                      <li>Under <strong>Request Headers</strong>, copy the <code className="bg-[#f6f8fa] px-1 rounded">Cookie</code> value</li>
                    </ol>
                  </div>
                  <textarea
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    placeholder="Paste cookie or bearer token here..."
                    rows={2}
                    className="w-full text-sm border border-[#d1d9e0] rounded-md px-2.5 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] bg-white text-[#1f2328] placeholder-[#afb8c1] font-mono resize-y"
                  />
                </div>
              )}
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
            {phase === "done" ? "Close" : "Cancel"}
          </button>
          {phase === "input" && (
            <button
              onClick={handleContinue}
              disabled={validCount === 0}
              className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors"
            >
              Continue ({validCount})
            </button>
          )}
          {phase === "review" && (
            <>
              <button
                onClick={() => { setPhase("input"); setEntries([]); }}
                disabled={importing}
                className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-1.5 hover:bg-[#f6f8fa] disabled:opacity-40"
              >
                Back
              </button>
              <button
                onClick={() => void handleImportAll()}
                disabled={importing}
                className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#0969da]/70 rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
              >
                {importing && (
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                  </svg>
                )}
                {importing ? "Importing…" : `Import ${entries.length} file${entries.length !== 1 ? "s" : ""}`}
              </button>
            </>
          )}
          {phase === "done" && failedCount > 0 && (
            <button
              onClick={() => void handleRetryFailed()}
              disabled={importing || !accessToken.trim()}
              className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0860ca] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
            >
              {importing && (
                <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 0 1 8-8V0C5.373 0 0 5.373 0 12h4Z" />
                </svg>
              )}
              Retry failed ({failedCount})
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
