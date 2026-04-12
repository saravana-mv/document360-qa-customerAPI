import type { FlowIdea } from "../../lib/api/specFilesApi";

export interface GeneratedFlow {
  ideaId: string;
  title: string;
  status: "pending" | "generating" | "done" | "error";
  xml: string;
  error?: string;
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
}

const STATUS_ICON: Record<string, React.ReactNode> = {
  pending: (
    <span className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
      <span className="w-1.5 h-1.5 rounded-full bg-gray-300" />
    </span>
  ),
  generating: (
    <svg className="w-4 h-4 text-blue-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  done: (
    <span className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center shrink-0">
      <svg className="w-2.5 h-2.5 text-green-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </span>
  ),
  error: (
    <span className="w-4 h-4 rounded-full bg-red-100 flex items-center justify-center shrink-0">
      <svg className="w-2.5 h-2.5 text-red-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  ),
};

export function FlowsPanel({ flows, generating, progress, activeFlowId, onClickFlow, onDownloadFlow, onDownloadAll }: Props) {
  const doneFlows = flows.filter((f) => f.status === "done");

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
        <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
        <span className="text-xs font-semibold text-gray-700">Flows</span>
        {flows.length > 0 && (
          <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-blue-100 text-blue-700">
            {doneFlows.length}/{flows.length}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {generating && progress && (
        <div className="shrink-0 px-3 py-1.5 border-b border-gray-100 bg-blue-50">
          <div className="flex items-center justify-between text-[10px] text-blue-700 mb-1">
            <span>Generating...</span>
            <span>{progress.current}/{progress.total}</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1">
            <div
              className="bg-blue-600 h-1 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Flows list */}
      <div className="flex-1 overflow-y-auto">
        {flows.length === 0 && (
          <div className="text-center py-12 px-3">
            <svg className="w-8 h-8 mx-auto text-gray-200 mb-2" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
            <p className="text-xs text-gray-400">No flows yet</p>
            <p className="text-[10px] text-gray-300 mt-0.5">Select ideas and generate</p>
          </div>
        )}

        {flows.length > 0 && (
          <div className="py-1">
            {flows.map((flow) => {
              const isActive = activeFlowId === flow.ideaId;
              return (
                <div
                  key={flow.ideaId}
                  onClick={() => onClickFlow(flow.ideaId)}
                  className={`flex items-center gap-2 px-3 py-2 cursor-pointer border-l-2 transition-colors ${
                    isActive
                      ? "border-l-blue-500 bg-blue-50/50"
                      : "border-l-transparent hover:bg-gray-50"
                  }`}
                >
                  {STATUS_ICON[flow.status]}
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-medium text-gray-800 truncate block">{flow.title}</span>
                    <span className="text-[10px] text-gray-400">
                      {flow.status === "generating" && "Generating..."}
                      {flow.status === "pending" && "Pending"}
                      {flow.status === "done" && `${flow.xml.length.toLocaleString()} chars`}
                      {flow.status === "error" && <span className="text-red-400">Failed</span>}
                    </span>
                  </div>
                  {flow.status === "done" && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDownloadFlow(flow); }}
                      title="Download XML"
                      className="text-gray-300 hover:text-blue-600 rounded p-0.5 hover:bg-blue-50 transition-colors shrink-0"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Download all */}
      {doneFlows.length > 1 && !generating && (
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-3 py-2">
          <button
            onClick={onDownloadAll}
            className="w-full flex items-center justify-center gap-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded px-3 py-1.5 transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download All ({doneFlows.length})
          </button>
        </div>
      )}
    </div>
  );
}
