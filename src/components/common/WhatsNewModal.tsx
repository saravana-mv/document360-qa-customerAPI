import { useEffect, useMemo, useState } from "react";

interface ChangelogEntry {
  build: number;
  date: string;
  changes: { type: string; text: string }[];
}

interface Props {
  newVersion: string;
  currentVersion: string;
  onRelaunch: () => void;
  onClose: () => void;
}

/** Extract the build number (last segment) from a version like "1.0.388". Returns 0 for "dev". */
function extractBuild(version: string): number {
  const parts = version.split(".");
  const last = parseInt(parts[parts.length - 1], 10);
  return Number.isFinite(last) ? last : 0;
}

const TYPE_STYLES: Record<string, { label: string; bg: string; text: string }> = {
  feature:     { label: "New",         bg: "#ddf4ff", text: "#0969da" },
  fix:         { label: "Fix",         bg: "#ffebe9", text: "#d1242f" },
  improvement: { label: "Improved",    bg: "#dafbe1", text: "#1a7f37" },
};

export function WhatsNewModal({ newVersion, currentVersion, onRelaunch, onClose }: Props) {
  const [allEntries, setAllEntries] = useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const currentBuild = useMemo(() => extractBuild(currentVersion), [currentVersion]);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`/changelog.json?t=${Date.now()}`, { cache: "no-store" });
        if (res.ok) {
          const data = (await res.json()) as ChangelogEntry[];
          setAllEntries(data);
        }
      } catch { /* silent */ }
      setLoading(false);
    })();
  }, []);

  // Only show entries with a build number greater than what the user is currently running
  const entries = useMemo(
    () => allEntries.filter((e) => e.build > currentBuild),
    [allEntries, currentBuild],
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: 480, maxHeight: "80vh", border: "1px solid #d1d9e0" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #d1d9e0" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ddf4ff] flex items-center justify-center">
              <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
              </svg>
            </div>
            <div>
              <h2 className="text-sm font-semibold text-[#1f2328]">What's new</h2>
              <p className="text-xs text-[#656d76]">Version {newVersion} is ready</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {loading ? (
            <p className="text-sm text-[#656d76] text-center py-6">Loading changelog...</p>
          ) : entries.length === 0 ? (
            <p className="text-sm text-[#656d76] text-center py-6">A new version is available with bug fixes and improvements.</p>
          ) : (
            <div className="space-y-5">
              {entries.map((entry) => (
                <div key={entry.build}>
                  <div className="flex items-center gap-2 mb-2.5">
                    <span className="text-xs font-semibold text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-full px-2 py-0.5">
                      Build {entry.build}
                    </span>
                    <span className="text-xs text-[#656d76]">{entry.date}</span>
                  </div>
                  <ul className="space-y-2">
                    {entry.changes.map((change, i) => {
                      const style = TYPE_STYLES[change.type] ?? { label: change.type, bg: "#f6f8fa", text: "#656d76" };
                      return (
                        <li key={i} className="flex items-start gap-2">
                          <span
                            className="text-xs font-medium px-1.5 py-0.5 rounded shrink-0 mt-0.5"
                            style={{ background: style.bg, color: style.text }}
                          >
                            {style.label}
                          </span>
                          <span className="text-sm text-[#1f2328] leading-snug">{change.text}</span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid #d1d9e0" }}>
          <button
            onClick={onClose}
            className="text-sm font-medium text-[#656d76] hover:text-[#1f2328] px-3 py-1.5 rounded-md hover:bg-[#f6f8fa] transition-colors"
          >
            Later
          </button>
          <button
            onClick={onRelaunch}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] px-4 py-1.5 rounded-md transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182" />
            </svg>
            Relaunch now
          </button>
        </div>
      </div>
    </div>
  );
}
