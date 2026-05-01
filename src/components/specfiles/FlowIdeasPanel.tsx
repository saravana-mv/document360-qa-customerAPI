import { useState } from "react";
import { ContextMenu, MenuIcons } from "../common/ContextMenu";
import type { FlowIdea, IdeaMode } from "../../lib/api/specFilesApi";
import { GenerateIdeasModal } from "./GenerateIdeasModal";
import { getIdeasTrace, getLatestIdeasTrace, type IdeasTrace } from "../../lib/api/flowTraceApi";
import IdeasTraceModal from "./IdeasTraceModal";

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return "just now";
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
  moderate: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  complex: "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
};

interface Props {
  ideas: FlowIdea[] | null;
  /** Initial generation loading (no ideas yet) */
  loading: boolean;
  /** Appending more ideas (existing ideas stay visible) */
  appending?: boolean;
  error: string | null;
  rawText?: string;
  message?: string | null;
  selectedIds: Set<string>;
  /** Ideas that already have completed flows — visually locked */
  lockedIds: Set<string>;
  activeIdeaId: string | null;
  /** Currently active flow (to highlight its source idea) */
  activeFlowId: string | null;
  onToggleSelect: (id: string) => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onGenerateFlows: () => void;
  /** Generate flow for a single idea (from context menu) */
  onGenerateFlowForIdea: (id: string) => void;
  onGenerateMore: (count: number, specFiles: string[], prompt?: string) => void;
  onDeleteSelected: (ids: Set<string>) => void;
  /** Per-row delete — removes a single idea (and its flow, if any) */
  onDeleteIdea: (id: string) => void;
  onClickIdea: (id: string) => void;
  /** ideaIds whose generated flow has been marked for implementation */
  markedIds: Set<string>;
  generatingFlows: boolean;
  /** AI returned fewer ideas than the max — no more unique scenarios */
  ideasExhausted?: boolean;
  /** Hard cap on total ideas per context */
  maxIdeasTotal?: number;
  /** Whether "this level only" filter is active */
  thisLevelOnly?: boolean;
  /** Toggle handler — only provided when sub-level ideas exist */
  onToggleThisLevel?: () => void;
  /** Current idea generation mode */
  ideaMode: IdeaMode;
  /** Mode change handler */
  onModeChange: (mode: IdeaMode) => void;
  /** Folder path for idea generation context */
  folderPath: string;
  /** Human-friendly folder display name */
  folderDisplayName?: string;
}

export function FlowIdeasPanel({
  ideas, loading, appending, error, rawText, message,
  selectedIds, lockedIds, activeIdeaId, activeFlowId,
  onToggleSelect, onSelectAll, onDeselectAll,
  onGenerateFlows, onGenerateFlowForIdea, onGenerateMore, onDeleteSelected, onDeleteIdea, onClickIdea, generatingFlows,
  ideasExhausted, maxIdeasTotal = 30, markedIds,
  thisLevelOnly, onToggleThisLevel,
  ideaMode, onModeChange, folderPath, folderDisplayName,
}: Props) {
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [rowDeleteId, setRowDeleteId] = useState<string | null>(null);
  const [showGenerateModal, setShowGenerateModal] = useState(false);
  const [traceData, setTraceData] = useState<IdeasTrace | null>(null);
  const [traceLoading, setTraceLoading] = useState<string | null>(null);
  const [showTrace, setShowTrace] = useState(false);

  async function handleShowTrace(ideaId: string, traceId?: string) {
    if (traceLoading) return;
    setTraceLoading(ideaId);
    try {
      const data = traceId
        ? await getIdeasTrace(traceId)
        : await getLatestIdeasTrace(folderPath);
      if (data) { setTraceData(data); setShowTrace(true); }
    } catch { /* ignore */ }
    setTraceLoading(null);
  }
  const totalIdeas = ideas?.length ?? 0;
  const lockedCount = ideas?.filter(i => lockedIds.has(i.id)).length ?? 0;
  const selectedCount = selectedIds.size;
  const allSelected = totalIdeas > 0 && selectedCount === totalIdeas;
  const unlockedSelectedCount = ideas?.filter(i => selectedIds.has(i.id) && !lockedIds.has(i.id)).length ?? 0;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-4 h-4 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
        </svg>
        <span className="text-sm font-semibold text-[#1f2328]">Ideas</span>
        {totalIdeas > 0 && (
          <span className="text-xs px-1.5 py-px rounded-full font-medium bg-[#656d76]/10 text-[#656d76] border border-[#656d76]/20">{totalIdeas}</span>
        )}
        {lockedCount > 0 && (
          <span className="text-xs px-1.5 py-px rounded-full font-medium bg-[#dafbe1] text-[#1a7f37] border border-[#aceebb]">{lockedCount} done</span>
        )}
        {ideaMode !== "full" && (
          <span
            title={ideaMode === "no-prereqs" ? "No prerequisites (with teardown)" : "No prerequisites, no teardown"}
            className="text-xs px-1.5 py-px rounded-full font-medium bg-[#ddf4ff] text-[#0969da] border border-[#b6e3ff] truncate max-w-[100px]"
          >
            {ideaMode === "no-prereqs" ? "no prereqs" : "minimal"}
          </span>
        )}
        {onToggleThisLevel && (
          <button
            onClick={onToggleThisLevel}
            title={thisLevelOnly ? "Showing this level only — click for all" : "Showing all levels — click for this level only"}
            className={`text-xs px-1.5 py-0.5 rounded-md font-medium border transition-colors ${
              thisLevelOnly
                ? "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]"
                : "bg-white text-[#656d76] border-[#d1d9e0] hover:bg-[#f6f8fa]"
            }`}
          >
            {thisLevelOnly ? "This level" : "All levels"}
          </button>
        )}
        <div className="flex-1" />
        {totalIdeas > 0 && (
          <button
            onClick={allSelected ? onDeselectAll : onSelectAll}
            title={allSelected ? "Deselect all" : "Select all"}
            className="rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
          >
            {allSelected ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            )}
          </button>
        )}
        {totalIdeas > 0 && (
          <button
            onClick={() => setShowDeleteConfirm(true)}
            disabled={selectedCount === 0 || generatingFlows}
            title={selectedCount > 0 ? `Delete ${selectedCount} selected idea${selectedCount !== 1 ? "s" : ""}` : "Select ideas to delete"}
            className={`rounded-md p-1 transition-colors ${
              selectedCount > 0
                ? "text-[#d1242f] hover:bg-[#ffebe9]"
                : "text-[#d1d9e0] cursor-not-allowed"
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
          </button>
        )}
        {totalIdeas > 0 && (() => {
          const atCap = totalIdeas >= maxIdeasTotal;
          const moreDisabled = generatingFlows || !!appending || !!ideasExhausted || atCap;
          const moreTooltip = atCap
            ? `Maximum of ${maxIdeasTotal} ideas reached`
            : ideasExhausted
              ? "AI has covered all identifiable scenarios"
              : appending
                ? "Generation in progress..."
                : generatingFlows
                  ? "Wait for flow generation to complete"
                  : "Generate more ideas";
          return (
            <button
              onClick={() => !moreDisabled && setShowGenerateModal(true)}
              disabled={moreDisabled}
              title={moreTooltip}
              className="rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
              </svg>
            </button>
          );
        })()}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        {/* Loading */}
        {loading && (
          <div className="flex flex-col items-center justify-center py-12 gap-2">
            <svg className="w-5 h-5 text-[#0969da] animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
            <p className="text-sm text-[#656d76]">Generating ideas...</p>
          </div>
        )}

        {/* Error */}
        {!loading && error && (
          <div className="m-3 bg-[#ffebe9] border border-[#ffcecb] rounded-md p-3">
            <p className="text-sm text-[#d1242f] font-medium">Generation failed</p>
            <p className="text-sm text-[#d1242f]/80 mt-1">{error}</p>
          </div>
        )}

        {/* Raw text fallback */}
        {!loading && !error && rawText && (
          <div className="m-3 bg-[#fff8c5] border border-[#f5e0a0] rounded-md p-3">
            <p className="text-sm text-[#9a6700] font-medium mb-1">Could not parse ideas:</p>
            <pre className="text-sm text-[#1f2328] whitespace-pre-wrap font-mono bg-white rounded p-2 border border-[#f5e0a0] max-h-40 overflow-y-auto">{rawText}</pre>
          </div>
        )}

        {/* Ideas list — visible during appending (existing ideas stay) */}
        {!error && ideas && ideas.length > 0 && !loading && (
          <div>
            {ideas.map((idea) => {
              const isLocked = lockedIds.has(idea.id);
              const isChecked = selectedIds.has(idea.id);
              const isActive = activeIdeaId === idea.id || (isLocked && activeFlowId === idea.id);
              const isMarked = markedIds.has(idea.id);
              return (
                <div
                  key={idea.id}
                  className={`group flex items-start gap-2 px-3 py-2.5 cursor-pointer border-b border-[#d1d9e0]/50 transition-colors ${
                    isActive
                      ? "bg-[#ddf4ff] border-l-2 border-l-[#0969da]"
                      : isLocked
                        ? "bg-[#dafbe1]/30 border-l-2 border-l-[#1a7f37]/40"
                        : isChecked
                          ? "bg-[#ddf4ff]/40 border-l-2 border-l-[#0969da]/40"
                          : "border-l-2 border-l-transparent hover:bg-[#f6f8fa]"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isChecked}
                    onChange={() => onToggleSelect(idea.id)}
                    className={`mt-0.5 shrink-0 ${isLocked ? "accent-[#1a7f37]" : "accent-[#0969da]"}`}
                  />
                  {isLocked && (
                    <span title="Flow already generated for this idea" className="shrink-0 mt-0.5 flex items-center">
                      <svg className="w-3.5 h-3.5 text-[#1a7f37]" fill="currentColor" viewBox="0 0 16 16">
                        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
                      </svg>
                    </span>
                  )}
                  <button
                    onClick={() => onClickIdea(idea.id)}
                    className="flex-1 text-left min-w-0"
                  >
                    <div className="flex items-center gap-1.5">
                      <span className={`text-sm font-medium truncate ${isLocked ? "text-[#656d76]" : "text-[#1f2328]"}`}>{idea.title}</span>
                      <span className={`text-xs px-1.5 py-px rounded-full font-medium shrink-0 border ${COMPLEXITY_COLORS[idea.complexity] ?? "bg-[#eef1f6] text-[#656d76] border-[#d1d9e0]"}`}>
                        {idea.complexity}
                      </span>
                      {isMarked && (
                        <span
                          title="Scenario has been created for this flow"
                          className="text-xs px-1.5 py-px rounded-full font-medium shrink-0 border bg-[#ddf4ff] text-[#0969da] border-[#54aeff]/40 inline-flex items-center gap-0.5"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                          </svg>
                          Scenario
                        </span>
                      )}
                    </div>
                    {(idea.costUsd != null || idea.createdAt) && (
                      <span className="text-xs text-[#656d76] mt-0.5 block">
                        {idea.costUsd != null && `$${idea.costUsd.toFixed(4)}`}
                        {idea.costUsd != null && idea.createdAt && " · "}
                        {idea.createdAt && formatRelativeTime(idea.createdAt)}
                      </span>
                    )}
                  </button>
                  <span className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
                    <ContextMenu
                      items={[
                        ...(!isLocked ? [{ label: "Generate flow", icon: MenuIcons.sparkle, onClick: () => onGenerateFlowForIdea(idea.id), disabled: generatingFlows }] : []),
                        { label: "View generation trace", icon: MenuIcons.inspect, onClick: () => handleShowTrace(idea.id, idea.traceId) },
                        { label: "Delete idea", icon: MenuIcons.trash, onClick: () => setRowDeleteId(idea.id), danger: true },
                      ]}
                    />
                  </span>
                </div>
              );
            })}

            {/* Appending spinner — shown at bottom of list while loading more */}
            {appending && (
              <div className="flex items-center gap-2 px-3 py-3 border-b border-[#d1d9e0]/50 bg-[#f6f8fa]/50">
                <svg className="w-4 h-4 text-[#0969da] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                <span className="text-sm text-[#656d76]">Generating more ideas...</span>
              </div>
            )}
          </div>
        )}

        {/* Empty / message */}
        {!loading && !error && (!ideas || ideas.length === 0) && !rawText && (
          <div className="flex flex-col items-center justify-center py-12 px-4 gap-3">
            <div className="w-10 h-10 rounded-full bg-[#fff8c5] flex items-center justify-center">
              <svg className="w-5 h-5 text-[#9a6700]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[#1f2328] mb-1">No ideas generated</p>
              <p className="text-sm text-[#656d76] leading-relaxed">
                {message || "AI could not generate scenario flow ideas for this context."}
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {!loading && ideas && ideas.length > 0 && (
        <div className="shrink-0 border-t border-[#d1d9e0] bg-[#f6f8fa] px-3 py-2 flex justify-center">
          <button
            onClick={onGenerateFlows}
            disabled={unlockedSelectedCount === 0 || generatingFlows}
            className="flex items-center justify-center gap-1.5 bg-[#1f883d] hover:bg-[#1a7f37] disabled:bg-[#eef1f6] disabled:text-[#656d76] disabled:border-[#d1d9e0] text-white text-sm font-medium rounded-md px-3 py-1.5 transition-colors border border-[#1f883d]/80 disabled:border-[#d1d9e0]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            {unlockedSelectedCount === 0
              ? (lockedCount === totalIdeas ? "All flows generated" : "Select ideas")
              : `Generate ${unlockedSelectedCount} flow${unlockedSelectedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}

      {/* Delete confirmation modal */}
      {showDeleteConfirm && (() => {
        const deletingIds = selectedIds;
        const deletingCount = deletingIds.size;
        const flowsToDelete = ideas?.filter(i => deletingIds.has(i.id) && lockedIds.has(i.id)).length ?? 0;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
                <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </div>
                <span className="text-base font-semibold text-[#1f2328] flex-1">Delete {deletingCount} idea{deletingCount !== 1 ? "s" : ""}?</span>
                <button onClick={() => setShowDeleteConfirm(false)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-sm text-[#656d76] leading-relaxed">
                  This will permanently remove the selected idea{deletingCount !== 1 ? "s" : ""} and all associated flows from this context.
                </p>
                {flowsToDelete > 0 && (
                  <div className="flex items-start gap-2 bg-[#fff8c5] border border-[#f5e0a0] rounded-md px-3 py-2">
                    <svg className="w-4 h-4 text-[#9a6700] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-[#9a6700] leading-relaxed">
                      <strong>{flowsToDelete}</strong> of the selected idea{flowsToDelete !== 1 ? "s have" : " has"} completed flow{flowsToDelete !== 1 ? "s" : ""} that will also be deleted.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
                  className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    onDeleteSelected(deletingIds);
                    setShowDeleteConfirm(false);
                  }}
                  className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
                >
                  Delete{flowsToDelete > 0 ? " ideas & flows" : ""}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Single-row delete confirmation */}
      {rowDeleteId && (() => {
        const idea = ideas?.find(i => i.id === rowDeleteId);
        const hasFlow = idea ? lockedIds.has(idea.id) : false;
        const isQueued = idea ? markedIds.has(idea.id) : false;
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
            <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[420px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
                <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </div>
                <span className="text-base font-semibold text-[#1f2328] flex-1">Delete idea?</span>
                <button onClick={() => setRowDeleteId(null)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-4 py-3 space-y-2">
                <p className="text-sm text-[#656d76] leading-relaxed">
                  This will permanently remove <strong className="text-[#1f2328]">{idea?.title ?? "this idea"}</strong>
                  {hasFlow ? " and its generated flow" : ""} from this context.
                </p>
                {isQueued && (
                  <div className="flex items-start gap-2 bg-[#fff8c5] border border-[#f5e0a0] rounded-md px-3 py-2">
                    <svg className="w-4 h-4 text-[#9a6700] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                    </svg>
                    <p className="text-sm text-[#9a6700] leading-relaxed">
                      A scenario has been created from this flow. Deleting the idea does not remove the registered scenario — delete it from the Scenario Manager if you no longer need it.
                    </p>
                  </div>
                )}
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
                <button
                  onClick={() => setRowDeleteId(null)}
                  className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onDeleteIdea(rowDeleteId); setRowDeleteId(null); }}
                  className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
                >
                  {hasFlow ? "Delete idea & flow" : "Delete idea"}
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Generate Ideas modal */}
      {showGenerateModal && (
        <GenerateIdeasModal
          folderPath={folderPath}
          folderDisplayName={folderDisplayName}
          currentMode={ideaMode}
          onGenerate={(count, mode, specFiles, prompt) => {
            onModeChange(mode);
            onGenerateMore(count, specFiles, prompt);
          }}
          onClose={() => setShowGenerateModal(false)}
          disabled={generatingFlows || !!appending}
        />
      )}

      {/* Ideas trace modal */}
      {showTrace && traceData && (
        <IdeasTraceModal trace={traceData} onClose={() => setShowTrace(false)} />
      )}

    </div>
  );
}
