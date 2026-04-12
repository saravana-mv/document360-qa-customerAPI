import type { FlowIdea } from "../../lib/api/specFilesApi";
import type { GeneratedFlow } from "./FlowsPanel";

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: "bg-green-100 text-green-700",
  moderate: "bg-yellow-100 text-yellow-700",
  complex: "bg-orange-100 text-orange-700",
};

interface Props {
  selectedIdea: FlowIdea | null;
  selectedFlow: GeneratedFlow | null;
  onDownloadFlow?: (flow: GeneratedFlow) => void;
}

export function DetailPanel({ selectedIdea, selectedFlow, onDownloadFlow }: Props) {
  // Nothing selected
  if (!selectedIdea && !selectedFlow) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center space-y-2 text-gray-300">
          <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-xs">Select an idea or flow to view details</p>
        </div>
      </div>
    );
  }

  // Show flow XML
  if (selectedFlow) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
          <svg className="w-3.5 h-3.5 text-blue-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
          </svg>
          <span className="text-xs font-medium text-gray-800 truncate flex-1">{selectedFlow.title}</span>
          {selectedFlow.status === "done" && onDownloadFlow && (
            <button
              onClick={() => onDownloadFlow(selectedFlow)}
              title="Download XML"
              className="text-gray-400 hover:text-blue-600 rounded p-1 hover:bg-blue-50 transition-colors shrink-0"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex-1 overflow-auto p-3">
          {selectedFlow.status === "done" && (
            <pre className="text-[11px] font-mono text-gray-700 bg-gray-50 rounded p-3 overflow-x-auto leading-relaxed whitespace-pre">{selectedFlow.xml}</pre>
          )}
          {selectedFlow.status === "generating" && (
            <div className="flex items-center gap-2 py-8 justify-center">
              <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-xs text-gray-500">Generating XML...</span>
            </div>
          )}
          {selectedFlow.status === "pending" && (
            <p className="text-xs text-gray-400 text-center py-8">Waiting to generate...</p>
          )}
          {selectedFlow.status === "error" && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3">
              <p className="text-xs text-red-700">{selectedFlow.error}</p>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Show idea details
  if (selectedIdea) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-200 bg-gray-50 shrink-0">
          <svg className="w-3.5 h-3.5 text-purple-500 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <span className="text-xs font-medium text-gray-800 truncate flex-1">Idea Details</span>
          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${COMPLEXITY_COLORS[selectedIdea.complexity] ?? "bg-gray-100 text-gray-600"}`}>
            {selectedIdea.complexity}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-3 space-y-4">
          {/* Title & description */}
          <div>
            <h3 className="text-sm font-semibold text-gray-800">{selectedIdea.title}</h3>
            <p className="text-xs text-gray-500 mt-1 leading-relaxed">{selectedIdea.description}</p>
          </div>

          {/* Entities */}
          {selectedIdea.entities.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Entities</p>
              <div className="flex items-center gap-1 flex-wrap">
                {selectedIdea.entities.map((e) => (
                  <span key={e} className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{e}</span>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          <div>
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wide mb-1.5">Steps</p>
            <ol className="space-y-1">
              {selectedIdea.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-gray-700">
                  <span className="w-4 h-4 rounded-full bg-gray-100 text-gray-500 flex items-center justify-center text-[10px] font-medium shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <code className="font-mono text-[11px] leading-relaxed">{step}</code>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
