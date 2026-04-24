// Editable markdown editor for Skills.md files using CodeMirror 6.
// Provides syntax highlighting, line numbers, save functionality, and version history with diff.

import { useState, useCallback, useEffect, useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { githubLight } from "@uiw/codemirror-theme-github";
import { EditorView } from "@codemirror/view";
import { diffLines } from "diff";
import { uploadSpecFile, getSpecFileContent, listSkillsVersions } from "../../lib/api/specFilesApi";
import type { SkillsVersion } from "../../lib/api/specFilesApi";

interface Props {
  path: string;
  content: string;
  onClose: () => void;
  onSaved?: () => void;
}

// ── Relative time helper ─────────────────────────────────────────────────────

function relativeTime(iso: string): string {
  const now = Date.now();
  const then = new Date(iso).getTime();
  const diffMs = now - then;
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (seconds < 60) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}

function formatTimestamp(iso: string): string {
  return new Date(iso).toLocaleString();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${(bytes / 1024).toFixed(1)} KB`;
}

// ── Version entry (includes "Current" pseudo-version) ────────────────────────

interface VersionEntry {
  id: string;        // unique key for React
  label: string;     // display label
  timestamp: string; // ISO string
  size: number;
  blobName: string | null; // null = current draft
  isCurrent: boolean;
}

// ── CodeMirror theme ─────────────────────────────────────────────────────────

const baseTheme = EditorView.theme({
  "&": { fontSize: "13px" },
  "&.cm-editor": { height: "100%", overflow: "hidden" },
  ".cm-scroller": { fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", overflow: "auto !important" },
  ".cm-gutters": { backgroundColor: "#f6f8fa", borderRight: "1px solid #d1d9e0" },
  ".cm-activeLineGutter": { backgroundColor: "#ddf4ff" },
  ".cm-activeLine": { backgroundColor: "#ddf4ff50" },
  ".cm-content": { padding: "8px 0" },
});

// ── Icons ────────────────────────────────────────────────────────────────────

function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
    </svg>
  );
}

function DiffIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 21 3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 12M21 7.5H7.5" />
    </svg>
  );
}

// ── Diff View Component ──────────────────────────────────────────────────────

interface DiffViewProps {
  labelA: string;
  labelB: string;
  textA: string;
  textB: string;
  onClose: () => void;
}

function DiffView({ labelA, labelB, textA, textB, onClose }: DiffViewProps) {
  const changes = useMemo(() => diffLines(textA, textB), [textA, textB]);

  const stats = useMemo(() => {
    let additions = 0;
    let deletions = 0;
    for (const c of changes) {
      const lineCount = (c.value.match(/\n/g) ?? []).length + (c.value.endsWith("\n") ? 0 : 1);
      if (c.added) additions += lineCount;
      if (c.removed) deletions += lineCount;
    }
    return { additions, deletions };
  }, [changes]);

  return (
    <div className="flex flex-col h-full">
      {/* Diff header */}
      <div className="flex items-center gap-3 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <DiffIcon className="w-4 h-4 text-[#656d76] shrink-0" />
        <span className="text-sm text-[#1f2328]">
          <span className="font-medium">{labelA}</span>
          <span className="text-[#656d76] mx-2">&rarr;</span>
          <span className="font-medium">{labelB}</span>
        </span>
        <span className="text-xs text-[#1a7f37]">+{stats.additions}</span>
        <span className="text-xs text-[#d1242f]">&minus;{stats.deletions}</span>
        <button
          onClick={onClose}
          className="ml-auto px-3 py-1 text-sm font-medium text-[#1f2328] bg-white border border-[#d1d9e0] hover:bg-[#f6f8fa] rounded-md transition-colors"
        >
          Close diff
        </button>
      </div>

      {/* Diff body */}
      <div className="flex-1 overflow-auto font-mono text-sm leading-6">
        {changes.map((part, i) => {
          const lines = part.value.split("\n");
          // Remove trailing empty string from split if value ends with newline
          if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();

          return lines.map((line, j) => {
            let bg = "";
            let textColor = "text-[#1f2328]";
            let prefix = " ";

            if (part.added) {
              bg = "bg-[#dafbe1]";
              textColor = "text-[#1a7f37]";
              prefix = "+";
            } else if (part.removed) {
              bg = "bg-[#ffebe9]";
              textColor = "text-[#d1242f]";
              prefix = "-";
            }

            return (
              <div key={`${i}-${j}`} className={`${bg} ${textColor} px-4 whitespace-pre-wrap break-all`}>
                <span className="inline-block w-4 select-none text-[#656d76]">{prefix}</span>
                {line}
              </div>
            );
          });
        })}
      </div>
    </div>
  );
}

// ── Version History Sidebar ──────────────────────────────────────────────────

interface VersionSidebarProps {
  versions: VersionEntry[];
  loading: boolean;
  selectedId: string | null;
  checkedIds: Set<string>;
  onSelect: (v: VersionEntry) => void;
  onToggleCheck: (id: string) => void;
  onCompare: () => void;
}

function VersionSidebar({ versions, loading, selectedId, checkedIds, onSelect, onToggleCheck, onCompare }: VersionSidebarProps) {
  return (
    <div className="w-[280px] border-l border-[#d1d9e0] bg-white flex flex-col shrink-0">
      {/* Sidebar header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <ClockIcon className="w-4 h-4 text-[#656d76]" />
        <span className="text-sm font-semibold text-[#1f2328]">History</span>
        <button
          onClick={onCompare}
          disabled={checkedIds.size !== 2}
          className="ml-auto px-2 py-0.5 text-xs font-medium text-white bg-[#0969da] hover:bg-[#0969da]/90 rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
        >
          Compare
        </button>
      </div>

      {/* Version list */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-4 text-sm text-[#656d76]">Loading versions...</div>
        ) : versions.length === 0 ? (
          <div className="p-4 text-sm text-[#656d76]">No version history available.</div>
        ) : (
          versions.map((v) => {
            const isSelected = selectedId === v.id;
            const isChecked = checkedIds.has(v.id);
            return (
              <div
                key={v.id}
                className={`flex items-start gap-2 px-3 py-2 cursor-pointer border-b border-[#d1d9e0]/50 transition-colors ${
                  isSelected ? "bg-[#ddf4ff]" : "hover:bg-[#f6f8fa]"
                }`}
                onClick={() => onSelect(v)}
              >
                {/* Checkbox for diff comparison */}
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={(e) => {
                    e.stopPropagation();
                    onToggleCheck(v.id);
                  }}
                  onClick={(e) => e.stopPropagation()}
                  className="mt-0.5 shrink-0 accent-[#0969da]"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm text-[#1f2328] font-medium truncate">
                    {v.isCurrent ? (
                      <span className="inline-flex items-center gap-1">
                        Current
                        <span className="text-xs font-normal text-[#656d76]">(unsaved)</span>
                      </span>
                    ) : (
                      relativeTime(v.timestamp)
                    )}
                  </div>
                  <div className="text-xs text-[#656d76]">
                    {v.isCurrent ? "Live editor content" : (
                      <>
                        {formatTimestamp(v.timestamp)}
                        <span className="mx-1">&middot;</span>
                        {formatSize(v.size)}
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Hint */}
      {!loading && versions.length > 1 && (
        <div className="px-3 py-2 border-t border-[#d1d9e0] bg-[#f6f8fa]">
          <span className="text-xs text-[#656d76]">Select 2 versions to compare</span>
        </div>
      )}
    </div>
  );
}

// ── Read-Only Preview ────────────────────────────────────────────────────────

function ReadOnlyPreview({ content, label }: { content: string; label: string }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 h-8 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <span className="text-xs text-[#656d76]">Viewing: {label}</span>
      </div>
      <div className="flex-1 overflow-hidden">
        <CodeMirror
          value={content}
          height="100%"
          theme={githubLight}
          extensions={[markdown(), baseTheme, EditorView.lineWrapping]}
          editable={false}
          basicSetup={{
            lineNumbers: true,
            foldGutter: true,
            highlightActiveLine: false,
            highlightActiveLineGutter: false,
          }}
        />
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SkillsEditor({ path, content, onClose, onSaved }: Props) {
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Version history state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<SkillsVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // Diff state
  const [diffMode, setDiffMode] = useState(false);
  const [diffA, setDiffA] = useState({ label: "", text: "" });
  const [diffB, setDiffB] = useState({ label: "", text: "" });

  // Reset draft when content changes externally
  useEffect(() => { setDraft(content); setSaved(false); }, [content]);

  const changed = draft !== content;

  // Build version entries with "Current" pseudo-entry
  const versionEntries = useMemo<VersionEntry[]>(() => {
    const current: VersionEntry = {
      id: "__current__",
      label: "Current",
      timestamp: new Date().toISOString(),
      size: new Blob([draft]).size,
      blobName: null,
      isCurrent: true,
    };
    const hist: VersionEntry[] = versions.map((v) => ({
      id: v.name,
      label: relativeTime(v.timestamp),
      timestamp: v.timestamp,
      size: v.size,
      blobName: v.name,
      isCurrent: false,
    }));
    return [current, ...hist];
  }, [versions, draft]);

  // Load versions when history panel opens
  const loadVersions = useCallback(async () => {
    setVersionsLoading(true);
    try {
      const list = await listSkillsVersions(path);
      setVersions(list);
    } catch {
      setVersions([]);
    } finally {
      setVersionsLoading(false);
    }
  }, [path]);

  const toggleHistory = useCallback(() => {
    const opening = !historyOpen;
    setHistoryOpen(opening);
    if (opening) {
      void loadVersions();
      // Reset selection state
      setSelectedVersionId(null);
      setPreviewContent(null);
      setCheckedIds(new Set());
      setDiffMode(false);
    } else {
      setSelectedVersionId(null);
      setPreviewContent(null);
      setCheckedIds(new Set());
      setDiffMode(false);
    }
  }, [historyOpen, loadVersions]);

  // Select a version to preview
  const handleSelectVersion = useCallback(async (v: VersionEntry) => {
    if (v.isCurrent) {
      setSelectedVersionId(v.id);
      setPreviewContent(null);
      setPreviewLabel("");
      return;
    }
    setSelectedVersionId(v.id);
    try {
      const text = await getSpecFileContent(v.blobName!);
      setPreviewContent(text);
      setPreviewLabel(formatTimestamp(v.timestamp));
    } catch {
      setPreviewContent("Error loading version content.");
      setPreviewLabel("Error");
    }
  }, []);

  // Toggle checkbox for diff selection (max 2)
  const handleToggleCheck = useCallback((id: string) => {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        if (next.size >= 2) {
          // Replace the oldest checked (first in set iteration)
          const first = next.values().next().value as string;
          next.delete(first);
        }
        next.add(id);
      }
      return next;
    });
  }, []);

  // Compare two checked versions
  const handleCompare = useCallback(async () => {
    const ids = Array.from(checkedIds);
    if (ids.length !== 2) return;

    // Find version entries for both
    const entryA = versionEntries.find((v) => v.id === ids[0]);
    const entryB = versionEntries.find((v) => v.id === ids[1]);
    if (!entryA || !entryB) return;

    // Sort so older is A, newer is B
    const [older, newer] = entryA.timestamp <= entryB.timestamp ? [entryA, entryB] : [entryB, entryA];

    const fetchText = async (entry: VersionEntry): Promise<string> => {
      if (entry.isCurrent) return draft;
      try {
        return await getSpecFileContent(entry.blobName!);
      } catch {
        return "(Error loading version)";
      }
    };

    const [textA, textB] = await Promise.all([fetchText(older), fetchText(newer)]);

    setDiffA({
      label: older.isCurrent ? "Current" : relativeTime(older.timestamp),
      text: textA,
    });
    setDiffB({
      label: newer.isCurrent ? "Current" : relativeTime(newer.timestamp),
      text: textB,
    });
    setDiffMode(true);
  }, [checkedIds, versionEntries, draft]);

  const handleSave = useCallback(async () => {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      await uploadSpecFile(path, draft);
      setSaved(true);
      onSaved?.();
      setTimeout(() => setSaved(false), 2000);
      // Reload versions if history panel is open
      if (historyOpen) void loadVersions();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }, [path, draft, onSaved, historyOpen, loadVersions]);

  // Ctrl+S to save
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        if (changed && !saving) void handleSave();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [changed, saving, handleSave]);

  const fileName = path.split("/").pop() ?? "Skills.md";

  // Determine what to show in the main area
  const showPreview = selectedVersionId !== null && selectedVersionId !== "__current__" && previewContent !== null;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
        </svg>
        <span className="text-sm font-semibold text-[#1f2328]">{fileName}</span>
        <span className="text-xs text-[#656d76]">API rules and enum aliases for AI generation</span>

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-sm text-[#d1242f]">{error}</span>}
          {saved && <span className="text-sm text-[#1a7f37] font-medium">Saved</span>}
          <button
            onClick={toggleHistory}
            className={`p-1.5 rounded-md transition-colors ${
              historyOpen
                ? "text-[#0969da] bg-[#ddf4ff]"
                : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa]"
            }`}
            title="Version history"
          >
            <ClockIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => void handleSave()}
            disabled={!changed || saving}
            className="px-3 py-1 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
          <button
            onClick={onClose}
            className="p-1 text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] rounded-md transition-colors"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Body: editor/preview/diff + optional sidebar */}
      <div className="flex flex-1 overflow-hidden">
        {/* Main area */}
        <div className="flex-1 overflow-hidden">
          {diffMode ? (
            <DiffView
              labelA={diffA.label}
              labelB={diffB.label}
              textA={diffA.text}
              textB={diffB.text}
              onClose={() => setDiffMode(false)}
            />
          ) : showPreview ? (
            <ReadOnlyPreview content={previewContent!} label={previewLabel} />
          ) : (
            <CodeMirror
              value={draft}
              height="100%"
              theme={githubLight}
              extensions={[markdown(), baseTheme, EditorView.lineWrapping]}
              onChange={setDraft}
              basicSetup={{
                lineNumbers: true,
                foldGutter: true,
                highlightActiveLine: true,
                highlightActiveLineGutter: true,
                searchKeymap: true,
              }}
            />
          )}
        </div>

        {/* Version history sidebar */}
        {historyOpen && (
          <VersionSidebar
            versions={versionEntries}
            loading={versionsLoading}
            selectedId={selectedVersionId}
            checkedIds={checkedIds}
            onSelect={(v) => void handleSelectVersion(v)}
            onToggleCheck={handleToggleCheck}
            onCompare={() => void handleCompare()}
          />
        )}
      </div>
    </div>
  );
}
