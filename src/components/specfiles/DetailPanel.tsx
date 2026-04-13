import { useState } from "react";
import type { FlowIdea } from "../../lib/api/specFilesApi";
import type { GeneratedFlow } from "./FlowsPanel";
import { buildFlowPrompt } from "../../lib/flow/buildPrompt";
import { XmlCodeBlock } from "../common/XmlCodeBlock";

const COMPLEXITY_COLORS: Record<string, string> = {
  simple: "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
  moderate: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  complex: "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
};

interface Props {
  selectedIdea: FlowIdea | null;
  selectedFlow: GeneratedFlow | null;
  onDownloadFlow?: (flow: GeneratedFlow) => void;
}

export function DetailPanel({ selectedIdea, selectedFlow, onDownloadFlow }: Props) {
  const [promptCopied, setPromptCopied] = useState(false);
  // Nothing selected
  if (!selectedIdea && !selectedFlow) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center space-y-2">
          <svg className="w-10 h-10 mx-auto text-[#d1d9e0]" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          <p className="text-xs text-[#656d76]">Select an idea or flow</p>
        </div>
      </div>
    );
  }

  // Show flow XML
  if (selectedFlow) {
    return (
      <div className="flex flex-col h-full overflow-hidden">
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <svg className="w-4 h-4 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
          </svg>
          <span className="text-[13px] font-semibold text-[#1f2328] truncate flex-1">{selectedFlow.title}</span>
          {selectedFlow.status === "done" && onDownloadFlow && (
            <button
              onClick={() => onDownloadFlow(selectedFlow)}
              title="Download XML"
              className="text-[#656d76] hover:text-[#0969da] rounded-md p-1 hover:bg-[#ddf4ff] transition-colors shrink-0"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
              </svg>
            </button>
          )}
        </div>
        <div className="flex-1 flex flex-col overflow-hidden p-4">
          {selectedFlow.status === "done" && (
            <XmlCodeBlock
              value={selectedFlow.xml}
              className="flex-1 min-h-0 overflow-hidden border border-[#d1d9e0] rounded-md bg-white"
            />
          )}
          {selectedFlow.status === "generating" && (
            <div className="flex items-center gap-2 py-8 justify-center">
              <svg className="w-5 h-5 text-[#0969da] animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <span className="text-sm text-[#656d76]">Generating XML...</span>
            </div>
          )}
          {selectedFlow.status === "pending" && (
            <p className="text-sm text-[#656d76] text-center py-8">Waiting to generate...</p>
          )}
          {selectedFlow.status === "error" && (
            <div className="bg-[#ffebe9] border border-[#ffcecb] rounded-md p-3">
              <p className="text-sm text-[#d1242f]">{selectedFlow.error}</p>
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
        <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 18v-5.25m0 0a6.01 6.01 0 0 0 1.5-.189m-1.5.189a6.01 6.01 0 0 1-1.5-.189m3.75 7.478a12.06 12.06 0 0 1-4.5 0m3.75 2.383a14.406 14.406 0 0 1-3 0M14.25 18v-.192c0-.983.658-1.823 1.508-2.316a7.5 7.5 0 1 0-7.517 0c.85.493 1.509 1.333 1.509 2.316V18" />
          </svg>
          <span className="text-[13px] font-semibold text-[#1f2328] flex-1">Idea details</span>
          <span className={`text-[10px] px-1.5 py-px rounded-full font-medium border ${COMPLEXITY_COLORS[selectedIdea.complexity] ?? "bg-[#eef1f6] text-[#656d76] border-[#d1d9e0]"}`}>
            {selectedIdea.complexity}
          </span>
        </div>
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* Title & description */}
          <div>
            <h3 className="text-sm font-semibold text-[#1f2328]">{selectedIdea.title}</h3>
            <p className="text-sm text-[#656d76] mt-1.5 leading-relaxed">{selectedIdea.description}</p>
          </div>

          {/* Entities */}
          {selectedIdea.entities.length > 0 && (
            <div>
              <h4 className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider mb-2">Entities</h4>
              <div className="flex items-center gap-1.5 flex-wrap">
                {selectedIdea.entities.map((e) => (
                  <span key={e} className="text-[11px] px-2 py-0.5 rounded-full bg-[#ddf4ff] text-[#0969da] font-medium border border-[#b6e3ff]">{e}</span>
                ))}
              </div>
            </div>
          )}

          {/* Steps */}
          <div>
            <h4 className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider mb-2">Steps</h4>
            <ol className="space-y-2">
              {selectedIdea.steps.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-[#1f2328]">
                  <span className="w-5 h-5 rounded-full bg-[#eef1f6] text-[#656d76] flex items-center justify-center text-[11px] font-medium shrink-0 mt-0.5 border border-[#d1d9e0]">
                    {i + 1}
                  </span>
                  <code className="font-mono text-[12px] leading-relaxed text-[#1f2328]">{step}</code>
                </li>
              ))}
            </ol>
          </div>

          {/* Flow-generation prompt */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <h4 className="text-[11px] font-semibold text-[#656d76] uppercase tracking-wider">Prompt (Flow generation)</h4>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(buildFlowPrompt(selectedIdea));
                    setPromptCopied(true);
                    setTimeout(() => setPromptCopied(false), 1500);
                  } catch { /* ignore */ }
                }}
                title="Copy prompt"
                className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#0969da] rounded-md px-1.5 py-0.5 hover:bg-[#ddf4ff] transition-colors"
              >
                {promptCopied ? (
                  <>
                    <svg className="w-3.5 h-3.5 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    <span className="text-[#1a7f37]">Copied</span>
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
                    </svg>
                    <span>Copy</span>
                  </>
                )}
              </button>
            </div>
            <pre className="text-sm font-mono text-[#1f2328] bg-[#f6f8fa] border border-[#d1d9e0] rounded-md p-3 whitespace-pre-wrap leading-relaxed">{buildFlowPrompt(selectedIdea)}</pre>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
