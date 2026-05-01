// Editable markdown editor for _skills.md files.
// Provides rendered/raw view toggle, search, save, AI editing, and version history with diff.

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import MDEditor from "@uiw/react-md-editor";
import { diffLines } from "diff";
import { uploadSpecFile, getSpecFileContent, listSkillsVersions, sendSkillsChat } from "../../lib/api/specFilesApi";
import type { SkillsVersion } from "../../lib/api/specFilesApi";
import { useAiCostStore } from "../../store/aiCost.store";

interface Props {
  path: string;
  content: string;
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
          className="ml-auto px-2 py-0.5 text-xs font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
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
      <div className="flex-1 overflow-auto">
        <pre className="p-4 text-[13px] font-mono text-[#1f2328] whitespace-pre-wrap break-words leading-relaxed">
          {content}
        </pre>
      </div>
    </div>
  );
}

// ── AI Chat Panel ─────────────────────────────────────────────────────────────

interface AIPanelProps {
  currentContent: string;
  onApply: (updatedContent: string) => void;
}

interface AIHistoryEntry {
  id: string;
  instruction: string;
  status: "pending" | "done" | "error";
  /** Proposed updated content (when status=done) */
  result?: string;
  /** Error message (when status=error) */
  error?: string;
  /** Diff stats */
  additions?: number;
  deletions?: number;
  costUsd?: number;
}

function SparkleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
    </svg>
  );
}

function computeDiffStats(before: string, after: string): { additions: number; deletions: number } {
  const changes = diffLines(before, after);
  let additions = 0;
  let deletions = 0;
  for (const c of changes) {
    const lineCount = (c.value.match(/\n/g) ?? []).length + (c.value.endsWith("\n") ? 0 : 1);
    if (c.added) additions += lineCount;
    if (c.removed) deletions += lineCount;
  }
  return { additions, deletions };
}

function AIPanel({ currentContent, onApply }: AIPanelProps) {
  const [instruction, setInstruction] = useState("");
  const [history, setHistory] = useState<AIHistoryEntry[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const addAdhocCost = useAiCostStore((s) => s.addAdhocCost);

  const handleSubmit = useCallback(async () => {
    const text = instruction.trim();
    if (!text) return;

    const id = `ai-${Date.now()}`;
    const entry: AIHistoryEntry = { id, instruction: text, status: "pending" };
    setHistory((prev) => [entry, ...prev]);
    setInstruction("");
    setExpandedId(id);

    try {
      const res = await sendSkillsChat(currentContent, text);
      const stats = computeDiffStats(currentContent, res.updatedContent);
      setHistory((prev) =>
        prev.map((e) =>
          e.id === id
            ? { ...e, status: "done" as const, result: res.updatedContent, costUsd: res.usage.costUsd, ...stats }
            : e,
        ),
      );
      if (res.usage.costUsd > 0) addAdhocCost(res.usage.costUsd);
    } catch (e) {
      setHistory((prev) =>
        prev.map((en) =>
          en.id === id
            ? { ...en, status: "error" as const, error: e instanceof Error ? e.message : String(e) }
            : en,
        ),
      );
    }
  }, [instruction, currentContent, addAdhocCost]);

  const handleApply = useCallback((entry: AIHistoryEntry) => {
    if (entry.result) onApply(entry.result);
  }, [onApply]);

  return (
    <div className="w-[380px] border-l border-[#d1d9e0] bg-white flex flex-col shrink-0">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <SparkleIcon className="w-4 h-4 text-[#0969da]" />
        <span className="text-sm font-semibold text-[#1f2328]">AI Rules Editor</span>
      </div>

      {/* Input area */}
      <div className="px-3 py-3 border-b border-[#d1d9e0]">
        <textarea
          ref={inputRef}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void handleSubmit();
            }
          }}
          placeholder="Describe the rule you want to add or change..."
          rows={3}
          className="w-full text-sm border border-[#d1d9e0] rounded-md px-3 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] resize-none bg-white text-[#1f2328] placeholder:text-[#656d76]"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-[#656d76]">Enter to send, Shift+Enter for newline</span>
          <button
            onClick={() => void handleSubmit()}
            disabled={!instruction.trim()}
            className="px-3 py-1 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Generate
          </button>
        </div>
      </div>

      {/* History / results */}
      <div className="flex-1 overflow-y-auto">
        {history.length === 0 ? (
          <div className="p-4 text-sm text-[#656d76]">
            <p className="font-medium text-[#1f2328] mb-2">Examples:</p>
            <ul className="space-y-1.5 text-xs">
              <li className="cursor-pointer hover:text-[#0969da]" onClick={() => setInstruction("Do not create project versions, instead use the version specified in the project variable")}>
                &bull; Do not create project versions, use project variable instead
              </li>
              <li className="cursor-pointer hover:text-[#0969da]" onClick={() => setInstruction("Always include project_version_id in article creation requests")}>
                &bull; Always include project_version_id in article creation
              </li>
              <li className="cursor-pointer hover:text-[#0969da]" onClick={() => setInstruction("DELETE endpoints return 204 with no body, never assert body fields on DELETE responses")}>
                &bull; DELETE returns 204 with no body
              </li>
            </ul>
          </div>
        ) : (
          history.map((entry) => (
            <AIHistoryCard
              key={entry.id}
              entry={entry}
              expanded={expandedId === entry.id}
              currentContent={currentContent}
              onToggle={() => setExpandedId(expandedId === entry.id ? null : entry.id)}
              onApply={() => handleApply(entry)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface AIHistoryCardProps {
  entry: AIHistoryEntry;
  expanded: boolean;
  currentContent: string;
  onToggle: () => void;
  onApply: () => void;
}

function AIHistoryCard({ entry, expanded, currentContent, onToggle, onApply }: AIHistoryCardProps) {
  const changes = useMemo(
    () => (entry.result ? diffLines(currentContent, entry.result) : []),
    [currentContent, entry.result],
  );

  return (
    <div className="border-b border-[#d1d9e0]/50">
      {/* Summary row */}
      <div
        className="flex items-start gap-2 px-3 py-2.5 cursor-pointer hover:bg-[#f6f8fa] transition-colors"
        onClick={onToggle}
      >
        <svg
          className={`w-3 h-3 mt-1 shrink-0 transition-transform text-[#656d76] ${expanded ? "rotate-90" : ""}`}
          fill="currentColor" viewBox="0 0 20 20"
        >
          <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
        </svg>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-[#1f2328] line-clamp-2">{entry.instruction}</p>
          <div className="flex items-center gap-2 mt-1">
            {entry.status === "pending" && (
              <span className="text-xs text-[#656d76]">Generating...</span>
            )}
            {entry.status === "error" && (
              <span className="text-xs text-[#d1242f]">Error: {entry.error}</span>
            )}
            {entry.status === "done" && (
              <>
                {(entry.additions ?? 0) > 0 && <span className="text-xs text-[#1a7f37]">+{entry.additions}</span>}
                {(entry.deletions ?? 0) > 0 && <span className="text-xs text-[#d1242f]">&minus;{entry.deletions}</span>}
                {entry.additions === 0 && entry.deletions === 0 && <span className="text-xs text-[#656d76]">No changes</span>}
                {entry.costUsd != null && <span className="text-xs text-[#656d76]">${entry.costUsd.toFixed(4)}</span>}
              </>
            )}
          </div>
        </div>
      </div>

      {/* Expanded diff + apply */}
      {expanded && entry.status === "done" && entry.result && (
        <div className="border-t border-[#d1d9e0]/50">
          {/* Diff */}
          <div className="max-h-[300px] overflow-y-auto font-mono text-xs leading-5">
            {changes.map((part, i) => {
              const lines = part.value.split("\n");
              if (lines.length > 0 && lines[lines.length - 1] === "") lines.pop();
              return lines.map((line, j) => {
                let bg = "";
                let textColor = "text-[#1f2328]";
                let prefix = " ";
                if (part.added) { bg = "bg-[#dafbe1]"; textColor = "text-[#1a7f37]"; prefix = "+"; }
                else if (part.removed) { bg = "bg-[#ffebe9]"; textColor = "text-[#d1242f]"; prefix = "-"; }
                return (
                  <div key={`${i}-${j}`} className={`${bg} ${textColor} px-3 whitespace-pre-wrap break-all`}>
                    <span className="inline-block w-3 select-none text-[#656d76]">{prefix}</span>
                    {line}
                  </div>
                );
              });
            })}
          </div>
          {/* Apply button */}
          <div className="flex items-center gap-2 px-3 py-2 bg-[#f6f8fa] border-t border-[#d1d9e0]/50">
            <button
              onClick={onApply}
              className="px-3 py-1 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors"
            >
              Apply changes
            </button>
            <span className="text-xs text-[#656d76]">Applies to editor (still needs Save)</span>
          </div>
        </div>
      )}

      {/* Loading spinner */}
      {expanded && entry.status === "pending" && (
        <div className="px-3 py-4 flex items-center gap-2 text-sm text-[#656d76]">
          <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          AI is refining your rule...
        </div>
      )}
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function SkillsEditor({ path, content, onSaved }: Props) {
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View mode: rendered markdown vs raw editor
  const [raw, setRaw] = useState(true); // default to raw (editable)

  // Search state
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [matchIndex, setMatchIndex] = useState(0);
  const [matchCount, setMatchCount] = useState(0);
  const contentRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Version history state
  const [historyOpen, setHistoryOpen] = useState(false);
  const [versions, setVersions] = useState<SkillsVersion[]>([]);
  const [versionsLoading, setVersionsLoading] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [previewContent, setPreviewContent] = useState<string | null>(null);
  const [previewLabel, setPreviewLabel] = useState("");
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());

  // AI panel state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

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

  // ── Search helpers (mirrors MarkdownViewer) ──────────────────────────────

  const clearHighlights = useCallback(() => {
    if (!contentRef.current) return;
    const marks = contentRef.current.querySelectorAll("mark[data-search-highlight]");
    marks.forEach((mark) => {
      const parent = mark.parentNode;
      if (parent) {
        parent.replaceChild(document.createTextNode(mark.textContent ?? ""), mark);
        parent.normalize();
      }
    });
  }, []);

  const highlight = useCallback((term: string, scrollToIdx: number) => {
    if (!contentRef.current) return 0;
    clearHighlights();
    if (!term) return 0;

    const walker = document.createTreeWalker(contentRef.current, NodeFilter.SHOW_TEXT);
    const textNodes: Text[] = [];
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) textNodes.push(node);

    const lowerTerm = term.toLowerCase();
    let totalMatches = 0;

    for (const textNode of textNodes) {
      const text = textNode.textContent ?? "";
      const lowerText = text.toLowerCase();
      if (!lowerText.includes(lowerTerm)) continue;

      const frag = document.createDocumentFragment();
      let lastIdx = 0;
      let searchIdx = lowerText.indexOf(lowerTerm, lastIdx);

      while (searchIdx !== -1) {
        if (searchIdx > lastIdx) frag.appendChild(document.createTextNode(text.slice(lastIdx, searchIdx)));
        const mark = document.createElement("mark");
        mark.setAttribute("data-search-highlight", "true");
        mark.textContent = text.slice(searchIdx, searchIdx + term.length);
        mark.style.backgroundColor = totalMatches === scrollToIdx ? "#fff176" : "#fff9c4";
        mark.style.color = "#1f2328";
        mark.style.borderRadius = "2px";
        mark.style.padding = "0 1px";
        if (totalMatches === scrollToIdx) {
          mark.style.outline = "2px solid #f9a825";
          mark.setAttribute("data-active", "true");
        }
        frag.appendChild(mark);
        totalMatches++;
        lastIdx = searchIdx + term.length;
        searchIdx = lowerText.indexOf(lowerTerm, lastIdx);
      }

      if (lastIdx < text.length) frag.appendChild(document.createTextNode(text.slice(lastIdx)));
      textNode.parentNode?.replaceChild(frag, textNode);
    }

    const active = contentRef.current.querySelector("mark[data-active]");
    active?.scrollIntoView({ block: "center", behavior: "smooth" });
    return totalMatches;
  }, [clearHighlights]);

  // Run highlight when search term, index, or view mode changes
  useEffect(() => {
    // Only highlight in rendered mode (DOM-based search)
    if (!raw && searchTerm) {
      const count = highlight(searchTerm, matchIndex);
      setMatchCount(count);
    } else if (!searchTerm) {
      setMatchCount(0);
    }
  }, [searchTerm, matchIndex, highlight, raw, draft]);

  // For raw mode, count matches in the text directly
  useEffect(() => {
    if (raw && searchTerm) {
      const lowerTerm = searchTerm.toLowerCase();
      const lowerDraft = draft.toLowerCase();
      let count = 0;
      let idx = lowerDraft.indexOf(lowerTerm);
      while (idx !== -1) {
        count++;
        idx = lowerDraft.indexOf(lowerTerm, idx + 1);
      }
      setMatchCount(count);
    }
  }, [raw, searchTerm, draft]);

  // Ctrl+F to open search
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key === "f") {
        e.preventDefault();
        setSearchOpen(true);
        setTimeout(() => searchInputRef.current?.focus(), 0);
      }
      if (e.key === "Escape" && searchOpen) {
        setSearchOpen(false);
        setSearchTerm("");
        setMatchIndex(0);
        clearHighlights();
      }
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, clearHighlights]);

  function handleSearchNext() {
    if (matchCount === 0) return;
    setMatchIndex((prev) => (prev + 1) % matchCount);
  }

  function handleSearchPrev() {
    if (matchCount === 0) return;
    setMatchIndex((prev) => (prev - 1 + matchCount) % matchCount);
  }

  function handleSearchClose() {
    setSearchOpen(false);
    setSearchTerm("");
    setMatchIndex(0);
    clearHighlights();
  }

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

        {/* Rendered / Raw toggle */}
        <div className="flex items-center shrink-0 rounded-md overflow-hidden border border-[#d1d9e0] text-[13px] ml-3">
          <button
            onClick={() => setRaw(false)}
            className={`px-2.5 py-1 transition-colors ${!raw ? "bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#f6f8fa]"}`}
          >
            Rendered
          </button>
          <button
            onClick={() => setRaw(true)}
            className={`px-2.5 py-1 transition-colors ${raw ? "bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#f6f8fa]"}`}
          >
            Raw
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {error && <span className="text-sm text-[#d1242f]">{error}</span>}
          {saved && <span className="text-sm text-[#1a7f37] font-medium">Saved</span>}
          <button
            onClick={() => { setSearchOpen(!searchOpen); setTimeout(() => searchInputRef.current?.focus(), 0); }}
            title="Search (Ctrl+F)"
            className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-md transition-colors border ${searchOpen ? "text-[#0969da] bg-[#ddf4ff] border-[#b6e3ff]" : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] border-transparent hover:border-[#d1d9e0]"}`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </button>
          <button
            onClick={() => { setAiPanelOpen(!aiPanelOpen); if (!aiPanelOpen) { setHistoryOpen(false); setDiffMode(false); } }}
            className={`p-1.5 rounded-md transition-colors ${
              aiPanelOpen
                ? "text-[#0969da] bg-[#ddf4ff]"
                : "text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa]"
            }`}
            title="AI Rules Editor"
          >
            <SparkleIcon className="w-4 h-4" />
          </button>
          <button
            onClick={() => { toggleHistory(); if (!historyOpen) setAiPanelOpen(false); }}
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
            className="px-3 py-1 text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>

      {/* Search bar */}
      {searchOpen && (
        <div className="flex items-center gap-2 px-4 py-1.5 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <svg className="w-3.5 h-3.5 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setMatchIndex(0); }}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.shiftKey ? handleSearchPrev() : handleSearchNext(); }
              if (e.key === "Escape") handleSearchClose();
            }}
            placeholder="Search..."
            className="flex-1 text-sm border border-[#d1d9e0] rounded-md px-2 py-1 focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
          />
          {searchTerm && (
            <span className="text-xs text-[#656d76] shrink-0 tabular-nums">
              {matchCount > 0 ? `${matchIndex + 1} / ${matchCount}` : "No results"}
            </span>
          )}
          <button onClick={handleSearchPrev} disabled={matchCount === 0} title="Previous (Shift+Enter)" className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] disabled:opacity-30 disabled:pointer-events-none transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m4.5 15.75 7.5-7.5 7.5 7.5" /></svg>
          </button>
          <button onClick={handleSearchNext} disabled={matchCount === 0} title="Next (Enter)" className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] disabled:opacity-30 disabled:pointer-events-none transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" /></svg>
          </button>
          <button onClick={handleSearchClose} title="Close search" className="shrink-0 w-6 h-6 flex items-center justify-center rounded text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {/* Body: editor/preview/diff + optional sidebar */}
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* Main area */}
        <div className="flex-1 min-w-0 flex flex-col min-h-0">
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
          ) : raw ? (
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              spellCheck={false}
              className="flex-1 w-full p-4 text-[13px] font-mono text-[#1f2328] leading-relaxed bg-white resize-none outline-none border-none"
              style={{ tabSize: 2 }}
            />
          ) : (
            <div className="flex-1 overflow-auto" ref={contentRef}>
              <div className="p-6 md-wrap-fix" data-color-mode="light">
                <style>{`
                  .md-wrap-fix .wmde-markdown pre > code { white-space: pre-wrap !important; word-break: break-word !important; overflow-wrap: break-word !important; }
                  .md-wrap-fix .wmde-markdown pre { white-space: pre-wrap !important; overflow-wrap: break-word !important; }
                  .md-wrap-fix .wmde-markdown table { table-layout: fixed; width: 100%; }
                  .md-wrap-fix .wmde-markdown td, .md-wrap-fix .wmde-markdown th { white-space: normal !important; word-break: break-word !important; }
                  .md-wrap-fix .wmde-markdown p, .md-wrap-fix .wmde-markdown li, .md-wrap-fix .wmde-markdown blockquote { overflow-wrap: break-word !important; word-break: break-word !important; }
                `}</style>
                <MDEditor.Markdown
                  source={draft}
                  style={{ background: "transparent", fontFamily: "inherit" }}
                />
              </div>
            </div>
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

        {/* AI Rules Editor panel */}
        {aiPanelOpen && (
          <AIPanel
            currentContent={draft}
            onApply={(updated) => setDraft(updated)}
          />
        )}
      </div>
    </div>
  );
}
