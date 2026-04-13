import { useState } from "react";
import type { FlowIdea, FlowUsage } from "../../lib/api/specFilesApi";

export interface GeneratedFlow {
  ideaId: string;
  title: string;
  status: "pending" | "generating" | "done" | "error";
  xml: string;
  error?: string;
  usage?: FlowUsage | null;
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
  onCreateManualFlow: (title: string, prompt: string) => void;
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

export function FlowsPanel({ flows, generating, progress, activeFlowId, onClickFlow, onDownloadFlow, onDownloadAll, onDeleteFlow, onDeleteAllFlows, onCreateManualFlow, onMarkForImplementation, onMarkSelectedForImplementation, markedIds, markingIds, selectedFlowIds, onToggleSelectFlow, onSelectAllFlows, onDeselectAllFlows }: Props) {
  const [showDeleteAllConfirm, setShowDeleteAllConfirm] = useState(false);
  const [deleteFlowId, setDeleteFlowId] = useState<string | null>(null);
  const [showNewFlow, setShowNewFlow] = useState(false);
  const [newFlowTitle, setNewFlowTitle] = useState("");
  const [newFlowPrompt, setNewFlowPrompt] = useState("");

  const EXAMPLE_PROMPT = `Create a detailed test flow XML for the following test scenario:

Title: Article settings configuration and SEO optimization
Description: Creates article, configures comprehensive settings including tags, SEO metadata, and related articles
Complexity: moderate
Entities involved: articles

Expected steps:
  1. POST /v3/projects/{project_id}/articles
  2. PATCH /v3/projects/{project_id}/articles/{article_id}/settings
  3. GET /v3/projects/{project_id}/articles/{article_id}/settings

Generate the complete flow XML with proper step IDs, request bodies, path parameters, captures, and assertions. Include setup and teardown steps where needed (e.g., create category before article, delete in reverse order).`;
  const EXAMPLE_TITLE = "Article settings configuration and SEO optimization";
  const doneFlows = flows.filter((f) => f.status === "done");
  const completedFlows = flows.filter((f) => f.status === "done" || f.status === "error");
  const selectedCount = doneFlows.filter((f) => selectedFlowIds.has(f.ideaId)).length;
  const allDoneSelected = doneFlows.length > 0 && selectedCount === doneFlows.length;
  const selectedUnmarkedCount = doneFlows.filter(
    (f) => selectedFlowIds.has(f.ideaId) && !markedIds.has(f.ideaId),
  ).length;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
        <span className="text-sm font-semibold text-[#1f2328]">Flows</span>
        {flows.length > 0 && (
          <span className="text-xs px-1.5 py-px rounded-full font-medium bg-[#0969da]/10 text-[#0969da] border border-[#0969da]/20">
            {doneFlows.length}/{flows.length}
          </span>
        )}
        <div className="flex-1" />
        {!generating && (
          <button
            onClick={() => setShowNewFlow(true)}
            title="Generate a flow from a custom prompt"
            className="text-sm font-medium text-[#0969da] hover:text-[#0969da]/80 flex items-center gap-1 px-1.5 py-0.5 rounded-md hover:bg-[#ddf4ff] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
            </svg>
            New flow
          </button>
        )}
        {doneFlows.length > 0 && !generating && (
          <button
            onClick={allDoneSelected ? onDeselectAllFlows : onSelectAllFlows}
            className="text-sm text-[#0969da] hover:underline"
          >
            {allDoneSelected ? "Deselect all" : "Select all"}
          </button>
        )}
        {completedFlows.length > 0 && !generating && (
          <button
            onClick={() => setShowDeleteAllConfirm(true)}
            className="text-sm text-[#d1242f] hover:text-[#d1242f]/80 flex items-center gap-0.5"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            Delete all
          </button>
        )}
      </div>

      {/* Progress bar */}
      {generating && progress && (
        <div className="shrink-0 px-3 py-1.5 border-b border-[#d1d9e0]/60 bg-[#ddf4ff]/40">
          <div className="flex items-center justify-between text-xs text-[#0969da] mb-1">
            <span>Generating...</span>
            <span className="font-medium">{progress.current}/{progress.total}</span>
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
                  {isDone ? (
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
                    <span className="text-sm font-medium text-[#1f2328] truncate block">{flow.title}</span>
                    <span className="text-sm text-[#656d76]">
                      {flow.status === "generating" && "Generating..."}
                      {flow.status === "pending" && "Queued"}
                      {flow.status === "done" && `${flow.xml.length.toLocaleString()} chars${flow.usage ? ` · $${flow.usage.costUsd.toFixed(4)}` : ""}`}
                      {flow.status === "error" && <span className="text-[#d1242f]">Failed</span>}
                    </span>
                  </div>
                  {(flow.status === "done" || flow.status === "error") && !generating && (
                    <div className="flex items-center gap-0.5 shrink-0">
                      {flow.status === "done" && (() => {
                        const isMarked = markedIds.has(flow.ideaId);
                        const isMarking = markingIds.has(flow.ideaId);
                        return (
                          <button
                            onClick={(e) => { e.stopPropagation(); if (!isMarking) onMarkForImplementation(flow); }}
                            title={
                              isMarked
                                ? "In Flow Manager implementation queue — click to push again"
                                : "Mark this flow for implementation (adds it to the Flow Manager queue)"
                            }
                            disabled={isMarking}
                            className={`rounded-md p-0.5 transition-colors ${
                              isMarked
                                ? "text-[#1a7f37] hover:text-[#1a7f37] hover:bg-[#dafbe1]"
                                : "text-[#afb8c1] hover:text-[#1a7f37] hover:bg-[#dafbe1]"
                            } ${isMarking ? "opacity-50 cursor-wait" : ""}`}
                          >
                            {isMarking ? (
                              <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                              </svg>
                            ) : isMarked ? (
                              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
                                <path fillRule="evenodd" clipRule="evenodd" d="M20.03 6.53a.75.75 0 0 1 0 1.06l-11 11a.75.75 0 0 1-1.06 0l-4.5-4.5a.75.75 0 1 1 1.06-1.06L8.5 16.94 18.97 6.47a.75.75 0 0 1 1.06.06Z" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                              </svg>
                            )}
                          </button>
                        );
                      })()}
                      {flow.status === "done" && (
                        <button
                          onClick={(e) => { e.stopPropagation(); onDownloadFlow(flow); }}
                          title="Download XML"
                          className="text-[#afb8c1] hover:text-[#0969da] rounded-md p-0.5 hover:bg-[#ddf4ff] transition-colors"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                          </svg>
                        </button>
                      )}
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteFlowId(flow.ideaId); }}
                        title="Delete flow"
                        className="text-[#afb8c1] hover:text-[#d1242f] rounded-md p-0.5 hover:bg-[#ffebe9] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Bottom action bar */}
      {doneFlows.length > 0 && !generating && (
        <div className="shrink-0 border-t border-[#d1d9e0] bg-[#f6f8fa] px-3 py-2 flex gap-2">
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
                ? "Select one or more flows to mark for implementation"
                : selectedUnmarkedCount === 0
                  ? "All selected flows are already marked"
                  : `Push ${selectedUnmarkedCount} selected flow${selectedUnmarkedCount !== 1 ? "s" : ""} to the implementation queue`
            }
            className="flex-1 flex items-center justify-center gap-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 disabled:bg-[#eef1f6] disabled:text-[#656d76] disabled:border-[#d1d9e0] text-white text-sm font-medium rounded-md px-3 py-1.5 transition-colors border border-[#1a7f37]/80"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
            </svg>
            {selectedCount === 0
              ? "Mark for implementation"
              : selectedUnmarkedCount === 0
                ? `${selectedCount} already marked`
                : `Mark ${selectedUnmarkedCount} for implementation`}
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
                <span className="text-base font-semibold text-[#1f2328]">Delete flow?</span>
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

      {/* New flow modal */}
      {showNewFlow && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => { setShowNewFlow(false); }}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[640px] max-w-[92vw] max-h-[88vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
              <div className="w-8 h-8 rounded-full bg-[#ddf4ff] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.456 2.456L21.75 6l-1.035.259a3.375 3.375 0 0 0-2.456 2.456ZM16.894 20.567 16.5 21.75l-.394-1.183a2.25 2.25 0 0 0-1.423-1.423L13.5 18.75l1.183-.394a2.25 2.25 0 0 0 1.423-1.423l.394-1.183.394 1.183a2.25 2.25 0 0 0 1.423 1.423l1.183.394-1.183.394a2.25 2.25 0 0 0-1.423 1.423Z" />
                </svg>
              </div>
              <span className="text-base font-semibold text-[#1f2328]">New flow from custom prompt</span>
            </div>
            <div className="px-4 py-3 space-y-3 overflow-y-auto">
              <p className="text-sm text-[#656d76] leading-relaxed">
                Paste a prompt from an idea (or write your own). The current spec context will be attached automatically.
              </p>
              <div>
                <label className="block text-sm font-medium text-[#1f2328] mb-1">Flow title</label>
                <input
                  type="text"
                  value={newFlowTitle}
                  onChange={(e) => setNewFlowTitle(e.target.value)}
                  placeholder="e.g. Create and publish an article"
                  className="w-full text-sm border border-[#d1d9e0] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
                />
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-[#1f2328]">Prompt</label>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => {
                        setNewFlowPrompt(EXAMPLE_PROMPT);
                        if (!newFlowTitle.trim()) setNewFlowTitle(EXAMPLE_TITLE);
                      }}
                      className="text-xs font-medium text-[#0969da] hover:underline"
                    >
                      Insert example
                    </button>
                    {newFlowPrompt && (
                      <button
                        type="button"
                        onClick={() => setNewFlowPrompt("")}
                        className="text-xs font-medium text-[#656d76] hover:text-[#d1242f] hover:underline"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                </div>
                <textarea
                  value={newFlowPrompt}
                  onChange={(e) => setNewFlowPrompt(e.target.value)}
                  rows={12}
                  placeholder="Describe the test flow: title, steps, expected results..."
                  className="w-full text-sm font-mono border border-[#d1d9e0] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] resize-y leading-relaxed"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
              <button
                onClick={() => setShowNewFlow(false)}
                className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                disabled={!newFlowTitle.trim() || !newFlowPrompt.trim()}
                onClick={() => {
                  onCreateManualFlow(newFlowTitle.trim(), newFlowPrompt.trim());
                  setShowNewFlow(false);
                  setNewFlowTitle("");
                  setNewFlowPrompt("");
                }}
                className="text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 border border-[#1a7f37]/80 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate flow
              </button>
            </div>
          </div>
        </div>
      )}

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
              <span className="text-base font-semibold text-[#1f2328]">Delete all {completedFlows.length} flows?</span>
            </div>
            <div className="px-4 py-3">
              <p className="text-sm text-[#656d76] leading-relaxed">
                This will delete all generated flows. The ideas will be unlocked so you can regenerate flows for them.
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
