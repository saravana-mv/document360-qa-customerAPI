import { useMemo, useState } from "react";
import { ContextMenu, MenuIcons } from "../common/ContextMenu";
import type { MenuItem } from "../common/ContextMenu";
import type { FlowIdea, FlowUsage } from "../../lib/api/specFilesApi";
import { validateFlowXml } from "../../lib/tests/flowXml/validate";

export interface GeneratedFlow {
  ideaId: string;
  title: string;
  status: "pending" | "generating" | "done" | "error";
  xml: string;
  error?: string;
  usage?: FlowUsage | null;
  createdAt?: string;
  traceId?: string;
}

interface Props {
  flows: GeneratedFlow[];
  ideas: FlowIdea[];
  generating: boolean;
  progress: { current: number; total: number } | null;
  activeFlowId: string | null;
  onClickFlow: (ideaId: string) => void;
  onDownloadFlow: (flow: GeneratedFlow) => void;
  onDownloadAll: () => void;
  onDeleteFlow: (ideaId: string) => void;
  onDeleteAllFlows: () => void;
  onStartFlowChat: () => void;
  onMarkForImplementation: (flow: GeneratedFlow) => void;
  /** Batch mark: mark every currently-selected done flow for implementation */
  onMarkSelectedForImplementation: () => void;
  /** ideaIds that have already been marked for implementation this session */
  markedIds: Set<string>;
  /** ideaIds currently being marked (in-flight) */
  markingIds: Set<string>;
  /** ideaIds selected via the row checkbox (done flows only) */
  selectedFlowIds: Set<string>;
  onToggleSelectFlow: (ideaId: string) => void;
  onSelectAllFlows: () => void;
  onDeselectAllFlows: () => void;
  /** Whether to show only this-level flows (vs aggregated from all sub-levels) */
  thisLevelOnly?: boolean;
  /** If set, renders the "This level / All levels" toggle button */
  onToggleThisLevel?: () => void;
  /** Cancel the in-progress batch flow generation */
  onCancelGeneration?: () => void;
  /** Copy the flow XML blob path to clipboard */
  onCopyFlowId?: (flow: GeneratedFlow) => void;
}

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

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: (
    <span className="w-4 h-4 rounded-full bg-[#eef1f6] flex items-center justify-center shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-[#afb8c1]" />
    </span>
  ),
  generating: (
    <svg className="w-4 h-4 text-[#0969da] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  done: (
    <span className="w-4 h-4 rounded-full bg-[#dafbe1] flex items-center justify-center shrink-0">
      <svg className="w-2.5 h-2.5 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </span>
  ),
  error: (
    <span className="w-4 h-4 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
      <svg className="w-2.5 h-2.5 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  ),
};

export function FlowsPanel({ flows, generating, progress, activeFlowId, onClickFlow, onDownloadFlow, onDownloadAll, onDeleteFlow, onDeleteAllFlows, onStartFlowChat, onMarkForImplementation, onMarkSelectedForImplementation, markedIds, markingIds, selectedFlowIds, onToggleSelectFlow, onSelectAllFlows, onDeselectAllFlows, thisLevelOnly, onToggleThisLevel, onCancelGeneration, onCopyFlowId }: Props) {
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null);

  const doneFlows = flows.filter((f) => f.status === "done");
  const completedFlows = flows.filter((f) => f.status === "done" || f.status === "error");
  // Validate every done flow once per render. Cheap — runs a DOM parser over a small string.
  const validByIdea = useMemo(() => {
    const map: Record<string, boolean> = {};
    for (const f of doneFlows) map[f.ideaId] = validateFlowXml(f.xml).ok;
    return map;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flows]);
  const selectableFlows = completedFlows;
  const selectedCount = selectableFlows.filter((f) => selectedFlowIds.has(f.ideaId)).length;
  const allDoneSelected = selectableFlows.length > 0 && selectedCount === selectableFlows.length;
  const selectedUnmarkedCount = doneFlows.filter(
    (f) => selectedFlowIds.has(f.ideaId) && !markedIds.has(f.ideaId) && validByIdea[f.ideaId],
  ).length;
  const selectedInvalidCount = doneFlows.filter(
    (f) => selectedFlowIds.has(f.ideaId) && !validByIdea[f.ideaId],
  ).length;
  const selectedDeletableCount = completedFlows.filter(
    (f) => selectedFlowIds.has(f.ideaId) && !markedIds.has(f.ideaId),
  ).length;
  const selectedMarkedCount = completedFlows.filter(
    (f) => selectedFlowIds.has(f.ideaId) && markedIds.has(f.ideaId),
  ).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-4 h-4 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
        <span className="text-sm font-semibold text-[#1f2328]">Flows</span>
        {flows.length > 0 && (
          <span className="text-xs px-1.5 py-px rounded-full font-medium bg-[#656d76]/10 text-[#656d76] border border-[#656d76]/20">
            {flows.length}
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
        {!generating && (
          <button
            onClick={onStartFlowChat}
            title="Generate a flow from a custom prompt"
            className="text-sm font-medium text-[#0969da] hover:text-[#0969da]/80 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[#ddf4ff] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
            New flow
          </button>
        )}
        {selectableFlows.length > 0 && !generating && (
          <button
            onClick={allDoneSelected ? onDeselectAllFlows : onSelectAllFlows}
            title={allDoneSelected ? "Deselect all" : "Select all"}
            className="rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
          >
            {allDoneSelected ? (
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
        {completedFlows.length > 0 && !generating && (
          <button
            onClick={() => setShowDeleteAllConfirm(true)}
            disabled={selectedDeletableCount === 0}
            title={
              selectedCount === 0
                ? "Select flows to delete"
                : selectedDeletableCount === 0
                  ? "Cannot delete — all selected flows have scenarios. Delete scenarios first from the Scenario Manager."
                  : selectedMarkedCount > 0
                    ? `Delete ${selectedDeletableCount} flow${selectedDeletableCount !== 1 ? "s" : ""} (${selectedMarkedCount} with scenarios will be skipped)`
                    : `Delete ${selectedDeletableCount} selected flow${selectedDeletableCount !== 1 ? "s" : ""}`
            }
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
      </div>

      {/* Progress bar */}
      {generating && progress && (
        <div className="shrink-0 px-3 py-1.5 border-b border-[#d1d9e0]/60 bg-[#ddf4ff]/40">
          <div className="flex items-center justify-between text-xs text-[#0969da] mb-1">
            <span>Generating...</span>
            <div className="flex items-center gap-2">
              <span className="font-medium">{progress.current}/{progress.total}</span>
              {onCancelGeneration && (
                <button
                  onClick={onCancelGeneration}
                  className="px-1.5 py-0.5 text-xs text-[#656d76] hover:text-[#d1242f] hover:bg-[#ffebe9] rounded transition-colors"
                  title="Cancel remaining flow generation"
                >
                  Cancel
                </button>
              )}
            </div>
          </div>
          <div className="w-full bg-[#0969da]/15 rounded-full h-1">
            <div
              className="bg-[#0969da] h-1 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Flows list */}
      <div className="flex-1 overflow-y-auto">
        {flows.length === 0 && (
          <div className="text-center py-12 px-3">
            <svg className="w-8 h-8 mx-auto text-[#d1d9e0] mb-2" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
            <p className="text-sm text-[#656d76]">No flows yet</p>
            <p className="text-sm text-[#afb8c1] mt-0.5">Select ideas and generate</p>
          </div>
        )}

        {flows.length > 0 && (
          <div>
            {flows.map((flow) => {
              const isActive = activeFlowId === flow.ideaId;
              const isDone = flow.status === "done";
              const isChecked = selectedFlowIds.has(flow.ideaId);
              return (
                <div
                  key={flow.ideaId}
                  onClick={() => onClickFlow(flow.ideaId)}
                  className={`flex items-center gap-2 px-3 py-2.5 cursor-pointer border-b border-[#d1d9e0]/50 transition-colors ${
                    isActive
                      ? "bg-[#ddf4ff] border-l-2 border-l-[#0969da]"
                      : isChecked
                        ? "bg-[#ddf4ff]/40 border-l-2 border-l-[#0969da]/40"
                        : "border-l-2 border-l-transparent hover:bg-[#f6f8fa]"
                  }`}
                >
                  {isDone || flow.status === "error" ? (
                    <input
                      type="checkbox"
                      checked={isChecked}
                      onClick={(e) => e.stopPropagation()}
                      onChange={() => onToggleSelectFlow(flow.ideaId)}
                      className="shrink-0 accent-[#0969da]"
                    />
                  ) : (
                    STATUS_ICON[flow.status]
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-sm font-medium text-[#1f2328] truncate">{flow.title}</span>
                      {isDone && validByIdea[flow.ideaId] === false && (
                        <span
                          title="Generated XML does not match the flow schema — cannot be marked for implementation"
                          className="text-xs px-1.5 py-px rounded-full font-medium shrink-0 border bg-[#ffebe9] text-[#d1242f] border-[#d1242f]/30 inline-flex items-center gap-0.5"
                        >
                          <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A9.05 9.05 0 0 0 11.484 21h.032A9.05 9.05 0 0 0 12 2.714ZM12 17.25h.008v.008H12v-.008Z" />
                          </svg>
                          Invalid
                        </span>
                      )}
                      {markedIds.has(flow.ideaId) && (
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
                    {flow.status !== "done" && (
                      <span className="text-sm text-[#656d76]">
                        {flow.status === "generating" && "Generating..."}
                        {flow.status === "pending" && "Queued"}
                        {flow.status === "error" && <span className="text-[#d1242f]">Failed</span>}
                      </span>
                    )}
                    {flow.status === "done" && (flow.usage || flow.createdAt) && (
                      <span
                        className="text-xs text-[#656d76] mt-0.5 block"
                        title={flow.usage ? `Input: ${flow.usage.inputTokens.toLocaleString()} tokens · Output: ${flow.usage.outputTokens.toLocaleString()} tokens` : undefined}
                      >
                        {flow.usage && `$${flow.usage.costUsd.toFixed(4)} · ${flow.usage.totalTokens.toLocaleString()} tokens`}
                        {flow.usage && flow.createdAt && " · "}
                        {flow.createdAt && formatRelativeTime(flow.createdAt)}
                      </span>
                    )}
                  </div>
                  {(flow.status === "done" || flow.status === "error") && !generating && (() => {
                    const isMarked = markedIds.has(flow.ideaId);
                    const isMarking = markingIds.has(flow.ideaId);
                    const isValid = flow.status === "done" ? validByIdea[flow.ideaId] : false;
                    const items: MenuItem[] = [];
                    if (flow.status === "done") {
                      items.push({
                        label: isMarked ? "Re-create scenario" : "Create scenario",
                        icon: MenuIcons.check,
                        onClick: () => onMarkForImplementation(flow),
                        disabled: isMarking || !isValid,
                      });
                      items.push({ label: "Download XML", icon: MenuIcons.download, onClick: () => onDownloadFlow(flow) });
                      if (onCopyFlowId) {
                        items.push({ label: "Copy Flow XML ID", icon: MenuIcons.clipboard, onClick: () => onCopyFlowId(flow) });
                      }
                      items.push("separator");
                    }
                    items.push({
                      label: "Delete flow",
                      icon: MenuIcons.trash,
                      onClick: () => setDeleteFlowId(flow.ideaId),
                      danger: true,
                      disabled: isMarked,
                      tooltip: isMarked ? "Cannot delete — a scenario depends on this flow. Delete the scenario first from the Scenario Manager." : undefined,
                    });
                    return (
                      <div className="shrink-0">
                        <ContextMenu items={items} />
                      </div>
                    );
                  })()}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {doneFlows.length > 0 && !generating && (
        <div className="shrink-0 border-t border-[#d1d9e0] bg-[#f6f8fa] px-3 py-2 flex justify-center gap-2">
          {doneFlows.length > 1 && (
            <button
              onClick={onDownloadAll}
              title="Download every generated flow as XML"
              className="flex items-center justify-center gap-1.5 bg-white hover:bg-[#f6f8fa] text-[#1f2328] text-sm font-medium rounded-md px-3 py-1.5 transition-colors border border-[#d1d9e0]"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
              Download all
            </button>
          )}
          <button
            onClick={onMarkSelectedForImplementation}
            disabled={selectedUnmarkedCount === 0 || markingIds.size > 0}
            title={
              selectedCount === 0
                ? "Select one or more flows to create scenarios"
                : selectedInvalidCount > 0 && selectedUnmarkedCount === 0
                  ? `${selectedInvalidCount} selected flow${selectedInvalidCount !== 1 ? "s are" : " is"} invalid — fix validation errors first`
                  : selectedUnmarkedCount === 0
                    ? "Scenarios already created for all selected flows"
                    : selectedInvalidCount > 0
                      ? `Create scenarios for ${selectedUnmarkedCount} valid flow${selectedUnmarkedCount !== 1 ? "s" : ""}; ${selectedInvalidCount} invalid flow${selectedInvalidCount !== 1 ? "s" : ""} will be skipped`
                      : `Create scenarios for ${selectedUnmarkedCount} selected flow${selectedUnmarkedCount !== 1 ? "s" : ""}`
            }
            className="flex items-center justify-center gap-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 disabled:bg-[#eef1f6] disabled:text-[#656d76] disabled:border-[#d1d9e0] text-white text-sm font-medium rounded-md px-3 py-1.5 transition-colors border border-[#1a7f37]/80"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {selectedCount === 0
              ? "Create scenarios"
              : selectedUnmarkedCount === 0
                ? `${selectedCount} already created`
                : `Create ${selectedUnmarkedCount} scenario${selectedUnmarkedCount !== 1 ? "s" : ""}`}
          </button>
        </div>
      )}
      {/* Delete single flow confirmation */}
      {deleteFlowId && (() => {
        const flow = flows.find(f => f.ideaId === deleteFlowId);
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setDeleteFlowId(null)}>
            <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
                <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                  <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                  </svg>
                </div>
                <span className="text-base font-semibold text-[#1f2328] flex-1">Delete flow?</span>
                <button onClick={() => setDeleteFlowId(null)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-4 py-3">
                <p className="text-sm text-[#656d76] leading-relaxed">
                  This will delete the generated flow for <strong className="text-[#1f2328]">{flow?.title}</strong>. The idea will be unlocked so you can regenerate the flow. If this flow was already marked for implementation, the copy in the Flow Manager queue is not removed — remove it from Flow Manager separately.
                </p>
              </div>
              <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
                <button
                  onClick={() => setDeleteFlowId(null)}
                  className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => { onDeleteFlow(deleteFlowId); setDeleteFlowId(null); }}
                  className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
                >
                  Delete flow
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Delete all flows confirmation */}
      {showDeleteAllConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowDeleteAllConfirm(false)}>
          <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[400px] max-w-[90vw]" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
              <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </div>
              <span className="text-base font-semibold text-[#1f2328] flex-1">Delete {selectedDeletableCount} flow{selectedDeletableCount !== 1 ? "s" : ""}?</span>
              <button onClick={() => setShowDeleteAllConfirm(false)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-[#656d76] leading-relaxed">
                This will delete {selectedDeletableCount} selected flow{selectedDeletableCount !== 1 ? "s" : ""}. The ideas will be unlocked so you can regenerate flows for them.
                {selectedMarkedCount > 0 && (
                  <span className="block mt-1 text-[#9a6700]">
                    {selectedMarkedCount} flow{selectedMarkedCount !== 1 ? "s" : ""} with active tests will be skipped.
                  </span>
                )}
              </p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
              <button
                onClick={() => setShowDeleteAllConfirm(false)}
                className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => { onDeleteAllFlows(); setShowDeleteAllConfirm(false); }}
                className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
              >
                Delete all flows
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
