import { useRef } from "react";

interface Props {
  xml: string;
  streaming: boolean;
}

export function XmlViewer({ xml, streaming }: Props) {
  const preRef = useRef<HTMLPreElement>(null);

  function copyToClipboard() {
    void navigator.clipboard.writeText(xml);
  }

  function download() {
    const blob = new Blob([xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "flow.xml";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (!xml && !streaming) {
    return (
      <div className="flex-1 flex items-center justify-center text-[#afb8c1] border border-dashed border-[#d1d9e0] rounded-md m-4">
        <div className="text-center space-y-1">
          <svg className="w-10 h-10 mx-auto" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
          </svg>
          <p className="text-sm">Generated XML will appear here</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 m-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-2 shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-[#656d76]">Generated Flow XML</span>
          {streaming && (
            <span className="inline-flex items-center gap-1 text-xs text-[#0969da]">
              <span className="w-1.5 h-1.5 rounded-full bg-[#0969da] animate-pulse" />
              Generating…
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={copyToClipboard}
            disabled={!xml}
            className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 border border-[#d1d9e0] rounded-md px-2 py-1 hover:bg-[#f6f8fa] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
            </svg>
            Copy
          </button>
          <button
            onClick={download}
            disabled={!xml}
            className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 border border-[#d1d9e0] rounded-md px-2 py-1 hover:bg-[#f6f8fa] transition-colors"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
            </svg>
            Download
          </button>
        </div>
      </div>

      {/* XML content */}
      <pre
        ref={preRef}
        className="flex-1 overflow-auto bg-[#0d1117] text-[#7ee787] rounded-md p-4 text-xs font-mono leading-relaxed whitespace-pre-wrap break-all border border-[#30363d]"
      >
        {xml}
        {streaming && <span className="inline-block w-1.5 h-3.5 bg-[#7ee787] animate-pulse ml-0.5 align-middle" />}
      </pre>
    </div>
  );
}
