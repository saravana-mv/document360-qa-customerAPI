import { useState } from "react";
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
}

export function FlowsPanel({ flows, ideas, generating, progress }: Props) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const doneFlows = flows.filter((f) => f.status === "done");

  function downloadFlow(flow: GeneratedFlow) {
    const idea = ideas.find((i) => i.id === flow.ideaId);
    const filename = (idea?.title ?? flow.ideaId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 35) + ".flow.xml";
    const blob = new Blob([flow.xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAll() {
    for (const f of doneFlows) {
      downloadFlow(f);
    }
  }

  const STATUS_ICON: Record<string, JSX.Element> = {
    pending: (
      <span className="w-5 h-5 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
        <span className="w-2 h-2 rounded-full bg-gray-300" />
      </span>
    ),
    generating: (
      <svg className="w-5 h-5 text-blue-500 animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
      </svg>
    ),
    done: (
      <span className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3 text-green-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
        </svg>
      </span>
    ),
    error: (
      <span className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center shrink-0">
        <svg className="w-3 h-3 text-red-600" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </span>
    ),
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Progress bar when generating */}
      {generating && progress && (
        <div className="shrink-0 px-4 py-2 border-b border-gray-100 bg-blue-50">
          <div className="flex items-center justify-between text-xs text-blue-700 mb-1">
            <span>Generating flows...</span>
            <span>{progress.current} / {progress.total}</span>
          </div>
          <div className="w-full bg-blue-200 rounded-full h-1.5">
            <div
              className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
              style={{ width: `${(progress.current / progress.total) * 100}%` }}
            />
          </div>
        </div>
      )}

      {/* Flows list */}
      <div className="flex-1 overflow-y-auto p-4">
        {flows.length === 0 && (
          <div className="text-center py-16">
            <p className="text-sm text-gray-400">No flows generated yet.</p>
            <p className="text-xs text-gray-400 mt-1">Select ideas and click "Generate Flows" to create them.</p>
          </div>
        )}

        {flows.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs text-gray-500 mb-3">
              {doneFlows.length} of {flows.length} flow{flows.length !== 1 ? "s" : ""} generated
            </p>

            {flows.map((flow) => {
              const isExpanded = expandedId === flow.ideaId;
              return (
                <div
                  key={flow.ideaId}
                  className={`border rounded-lg transition-colors ${
                    flow.status === "done" ? "border-green-200" :
                    flow.status === "error" ? "border-red-200" :
                    flow.status === "generating" ? "border-blue-200" :
                    "border-gray-200"
                  }`}
                >
                  {/* Flow header */}
                  <div className="flex items-center gap-2 px-3 py-2.5">
                    {STATUS_ICON[flow.status]}
                    <button
                      onClick={() => flow.status === "done" && setExpandedId(isExpanded ? null : flow.ideaId)}
                      className="flex-1 text-left min-w-0"
                      disabled={flow.status !== "done"}
                    >
                      <span className="text-sm font-medium text-gray-800 truncate block">{flow.title}</span>
                      {flow.status === "generating" && (
                        <span className="text-xs text-blue-500">Generating...</span>
                      )}
                      {flow.status === "error" && (
                        <span className="text-xs text-red-500">{flow.error}</span>
                      )}
                      {flow.status === "done" && (
                        <span className="text-xs text-gray-400">
                          {flow.xml.length.toLocaleString()} chars — click to preview
                        </span>
                      )}
                    </button>
                    {flow.status === "done" && (
                      <button
                        onClick={() => downloadFlow(flow)}
                        title="Download XML"
                        className="text-gray-400 hover:text-blue-600 rounded p-1 hover:bg-blue-50 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                        </svg>
                      </button>
                    )}
                  </div>

                  {/* XML preview */}
                  {isExpanded && flow.status === "done" && (
                    <div className="border-t border-gray-100 px-3 pb-3 pt-2">
                      <pre className="text-[11px] font-mono text-gray-700 bg-gray-50 rounded p-3 overflow-x-auto max-h-80 overflow-y-auto leading-relaxed whitespace-pre">{flow.xml}</pre>
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
        <div className="shrink-0 border-t border-gray-200 bg-gray-50 px-4 py-3">
          <button
            onClick={downloadAll}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 text-white text-sm font-medium rounded-lg px-4 py-2 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download All ({doneFlows.length} flow{doneFlows.length !== 1 ? "s" : ""})
          </button>
        </div>
      )}
    </div>
  );
}
