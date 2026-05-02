import { useState } from "react";

interface SyncEntry {
  filename: string;
  folderPath: string;
  sourceUrl: string;
  status: "pending" | "syncing" | "done" | "error" | "warning";
  error?: string;
}

interface Props {
  folderPath: string;
  /** Files to sync: map of relative path → source URL */
  filesToSync: Record<string, string>;
  initialAccessToken?: string;
  onSync: (folderPath: string, filename?: string, accessToken?: string) => Promise<{
    synced: Array<{ name: string; updated: boolean; error?: string }>;
  }>;
  onTokenChange: (token: string) => void;
  onClose: () => void;
  onComplete: () => void;
}

export function SyncFolderModal({
  folderPath, filesToSync, initialAccessToken, onSync, onTokenChange, onClose, onComplete,
}: Props) {
  const [phase, setPhase] = useState<"review" | "syncing" | "done">("review");
  const [accessToken, setAccessToken] = useState(initialAccessToken ?? "");
  const [tokenExpanded, setTokenExpanded] = useState(!!initialAccessToken);
  const [entries, setEntries] = useState<SyncEntry[]>(() =>
    Object.entries(filesToSync).map(([path, sourceUrl]) => {
      const lastSlash = path.lastIndexOf("/");
      const filename = lastSlash === -1 ? path : path.slice(lastSlash + 1);
      const folder = lastSlash === -1 ? "" : path.slice(0, lastSlash);
      return { filename, folderPath: folder, sourceUrl, status: "pending" as const };
    }),
  );
  const [syncing, setSyncing] = useState(false);

  async function handleSyncAll(retryOnly = false) {
    setSyncing(true);
    setPhase("syncing");
    const token = accessToken.trim() || undefined;
    if (token) onTokenChange(token);

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      if (retryOnly && entry.status !== "warning" && entry.status !== "error") continue;
      if (!retryOnly && entry.status !== "pending") continue;

      setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "syncing", error: undefined } : e));
      try {
        const result = await onSync(entry.folderPath, entry.filename, token);
        const fileResult = result.synced.find((r) => r.name.endsWith(entry.filename));
        if (fileResult && !fileResult.updated && fileResult.error) {
          const isAuth = fileResult.error.includes("authentication may be required") ||
            fileResult.error.includes("Redirection detected") || fileResult.error.includes("HTML");
          setEntries((prev) => prev.map((e, idx) => idx === i
            ? { ...e, status: isAuth ? "warning" : "error", error: fileResult.error }
            : e));
        } else {
          setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "done" } : e));
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setEntries((prev) => prev.map((e, idx) => idx === i ? { ...e, status: "error", error: msg } : e));
      }
    }
    setSyncing(false);
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
            <h2 className="text-sm font-semibold text-[#1f2328]">Sync URL Sources</h2>
            <p className="text-sm text-[#656d76] mt-0.5">
              {phase === "review"
                ? `${entries.length} file${entries.length !== 1 ? "s" : ""} to sync under ${folderPath || "/"}`
                : phase === "syncing"
                  ? "Syncing..."
                  : `Sync complete — ${doneCount} updated${warningCount > 0 ? `, ${warningCount} auth failed` : ""}${errorCount > 0 ? `, ${errorCount} failed` : ""}`}
            </p>
          </div>
          <button
            onClick={() => { if (phase === "done") onComplete(); onClose(); }}
            disabled={syncing}
            className="text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 rounded p-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 overflow-y-auto flex-1">
          {/* File list */}
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
                        : entry.status === "syncing"
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
                {entry.status === "syncing" && (
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
                  <p className="text-sm text-[#656d76] truncate">{entry.sourceUrl}</p>
                  {entry.error && (
                    <p className={`text-sm mt-0.5 ${entry.status === "warning" ? "text-[#9a6700]" : "text-[#d1242f]"}`}>{entry.error}</p>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Token input on done phase when there are failures */}
          {phase === "done" && failedCount > 0 && (
            <div className="mt-3 border border-[#d4a72c] rounded-md bg-[#fff8c5] px-3 py-2.5 space-y-2">
              <p className="text-sm text-[#9a6700] font-medium">
                {failedCount} file{failedCount !== 1 ? "s" : ""} failed — paste an access token to retry
              </p>
              <div className="bg-white border border-[#d1d9e0] rounded-md px-2.5 py-2 text-sm text-[#656d76] space-y-1.5">
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

          {/* Token section on review phase */}
          {phase === "review" && (
            <div className="mt-3 border border-[#d1d9e0] rounded-md overflow-hidden">
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
                  <p className="text-sm text-[#656d76] mt-2 leading-relaxed">
                    If the source URLs require authentication, paste a session cookie or bearer token below.
                  </p>
                  <div className="bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-2 text-sm text-[#656d76] space-y-1.5">
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
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] shrink-0">
          <button
            onClick={() => { if (phase === "done") onComplete(); onClose(); }}
            disabled={syncing}
            className="text-sm text-[#656d76] hover:text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-1.5 hover:bg-[#f6f8fa] disabled:opacity-40"
          >
            {phase === "done" ? "Close" : "Cancel"}
          </button>
          {phase === "review" && (
            <button
              onClick={() => void handleSyncAll()}
              className="text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
              Sync {entries.length} file{entries.length !== 1 ? "s" : ""}
            </button>
          )}
          {phase === "done" && failedCount > 0 && (
            <button
              onClick={() => void handleSyncAll(true)}
              disabled={syncing || !accessToken.trim()}
              className="text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] disabled:bg-[#eef1f6] disabled:text-[#656d76] rounded-md px-3 py-1.5 transition-colors flex items-center gap-1.5"
            >
              {syncing && (
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
