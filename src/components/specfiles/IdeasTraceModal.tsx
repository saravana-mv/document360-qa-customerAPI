import { useState } from "react";
import type { IdeasTrace } from "../../lib/api/flowTraceApi";

interface Props {
  trace: IdeasTrace;
  onClose: () => void;
}

function Section({ title, defaultOpen = false, badge, children }: {
  title: string;
  defaultOpen?: boolean;
  badge?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ borderBottom: "1px solid #d1d9e0" }}>
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center gap-2 px-4 py-2.5 text-sm font-semibold hover:bg-[#f6f8fa] transition-colors"
        style={{ color: "#1f2328" }}
      >
        <svg width="12" height="12" viewBox="0 0 12 12" className={`transition-transform ${open ? "rotate-90" : ""}`}>
          <path d="M4.5 2L8.5 6L4.5 10" stroke="#656d76" strokeWidth="1.5" fill="none" strokeLinecap="round" />
        </svg>
        {title}
        {badge && (
          <span className="text-xs px-1.5 py-0.5 rounded-full" style={{ background: "#ddf4ff", color: "#0969da" }}>
            {badge}
          </span>
        )}
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-2 text-sm py-0.5">
      <span className="text-sm font-medium shrink-0" style={{ color: "#656d76", minWidth: 120 }}>{label}</span>
      <span style={{ color: "#1f2328" }}>{value}</span>
    </div>
  );
}

/** Convert a slugified folder path to a human-friendly display name. */
function humanizePath(path: string): string {
  return path
    .split("/")
    .map(seg =>
      seg
        .split("-")
        .map(w => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" "),
    )
    .join(" / ");
}

export default function IdeasTraceModal({ trace, onClose }: Props) {
  const filesAnalyzed = trace.specContext.filesAnalyzed;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.4)" }}>
      <div
        className="bg-white rounded-lg shadow-xl flex flex-col"
        style={{ width: 720, maxHeight: "85vh", border: "1px solid #d1d9e0" }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #d1d9e0" }}>
          <div className="flex items-center gap-2">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#656d76">
              <path d="M4.72.22a.75.75 0 0 1 1.06 0l1 1a.75.75 0 0 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0V2.06l-.22.22A.75.75 0 0 1 2.72 1.22zM8 4a4 4 0 1 0 0 8 4 4 0 0 0 0-8M6 8a2 2 0 1 1 4 0 2 2 0 0 1-4 0m5.28-7.78a.75.75 0 0 1 1.06 0l1 1a.75.75 0 0 1-1.06 1.06l-.22-.22v1.69a.75.75 0 0 1-1.5 0V2.06l-.22.22a.75.75 0 1 1-1.06-1.06zM4.72 14.78a.75.75 0 0 1 0-1.06l.22-.22v-1.69a.75.75 0 0 1 1.5 0v1.69l.22-.22a.75.75 0 1 1 1.06 1.06l-1 1a.75.75 0 0 1-1.06 0zm6.56 0a.75.75 0 0 1 0-1.06l.22-.22v-1.69a.75.75 0 0 1 1.5 0v1.69l.22-.22a.75.75 0 1 1 1.06 1.06l-1 1a.75.75 0 0 1-1.06 0z" />
            </svg>
            <span className="text-sm font-semibold" style={{ color: "#1f2328" }}>Ideas Generation Trace</span>
          </div>
          <button onClick={onClose} className="p-1 rounded hover:bg-[#f6f8fa]" title="Close">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="#656d76">
              <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1">
          {/* Model & Cost */}
          <Section title="Model & Cost" defaultOpen>
            {trace.model ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-0.5">
                <KV label="Model" value={trace.model.name} />
                <KV label="Cost" value={`$${trace.model.costUsd.toFixed(4)}`} />
                <KV label="Input tokens" value={trace.model.inputTokens.toLocaleString()} />
                <KV label="Output tokens" value={trace.model.outputTokens.toLocaleString()} />
              </div>
            ) : (
              <span className="text-sm" style={{ color: "#656d76" }}>No model data</span>
            )}
            <div className="mt-1 grid grid-cols-2 gap-x-6 gap-y-0.5">
              <KV label="Generated" value={new Date(trace.createdAt).toLocaleString()} />
              <KV label="By" value={trace.createdBy.name} />
            </div>
          </Section>

          {/* Request */}
          <Section title="Request" defaultOpen>
            <KV label="Destination path" value={<span className="text-sm">{humanizePath(trace.request.folderPath)}</span>} />
            <KV label="Mode" value={trace.request.mode} />
            <KV label="Max count" value={trace.request.maxCount} />
            <KV label="Scope" value={trace.request.scope} />
            <KV label="Existing ideas" value={trace.request.existingIdeasCount} />
            {trace.request.prompt && (
              <KV label="Prompt" value={trace.request.prompt} />
            )}
          </Section>

          {/* Spec Context */}
          <Section title="Spec Context" defaultOpen badge={trace.specContext.usedDigest ? "DIGEST" : undefined}>
            <KV label="Source" value={trace.specContext.source} />
            <KV label="Used digest" value={trace.specContext.usedDigest ? "Yes" : "No"} />
            <KV label="Files analyzed" value={trace.specContext.filesAnalyzed} />
            <KV label="Total chars" value={trace.specContext.totalSpecCharacters.toLocaleString()} />
            {trace.specContext.fileNames.length > 0 && (
              <div className="mt-2">
                <span className="text-sm font-medium" style={{ color: "#656d76" }}>Spec files ({trace.specContext.fileNames.length}):</span>
                <div className="mt-1 text-xs font-mono space-y-0.5" style={{ color: "#1f2328" }}>
                  {trace.specContext.fileNames.map((f, i) => (
                    <div key={i}>{f}</div>
                  ))}
                </div>
              </div>
            )}
            {/* Tip: suggest more ideas when many spec files */}
            {filesAnalyzed >= 10 && trace.request.maxCount < 10 && (
              <div className="flex items-start gap-2 mt-3 px-3 py-2 rounded-md" style={{ background: "#ddf4ff", border: "1px solid #b6e3ff" }}>
                <svg className="w-3.5 h-3.5 text-[#0969da] shrink-0 mt-0.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
                </svg>
                <p className="text-xs text-[#1f2328]">
                  <strong>{filesAnalyzed} spec files</strong> were analyzed but only {trace.request.maxCount} ideas were requested.
                  With this many files the AI cost is mostly fixed — consider generating more ideas (e.g. 10) to get better coverage at the same cost.
                </p>
              </div>
            )}
          </Section>

          {/* Result */}
          <Section title="Result" defaultOpen>
            <KV label="Ideas generated" value={trace.result.ideasGenerated} />
            <KV label="Parse error" value={
              trace.result.parseError
                ? <span style={{ color: "#d1242f" }}>Yes</span>
                : <span style={{ color: "#1a7f37" }}>No</span>
            } />
            <KV label="Cross-folder augmented" value={trace.result.crossFolderAugmented} />
          </Section>

          {/* System Prompt */}
          <Section title="System Prompt" badge={`${(trace.prompt.systemPrompt.length / 1024).toFixed(0)}KB`}>
            <pre
              className="text-xs overflow-auto p-2 rounded whitespace-pre-wrap"
              style={{ background: "#f6f8fa", color: "#1f2328", maxHeight: 300, border: "1px solid #d1d9e0" }}
            >
              {trace.prompt.systemPrompt}
            </pre>
          </Section>

          {/* User Message */}
          <Section title="User Message" badge={`${(trace.prompt.userMessage.length / 1024).toFixed(0)}KB`}>
            <pre
              className="text-xs overflow-auto p-2 rounded whitespace-pre-wrap"
              style={{ background: "#f6f8fa", color: "#1f2328", maxHeight: 300, border: "1px solid #d1d9e0" }}
            >
              {trace.prompt.userMessage}
            </pre>
          </Section>
        </div>

        {/* Footer */}
        <div className="flex justify-end px-4 py-3" style={{ borderTop: "1px solid #d1d9e0" }}>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm rounded-md font-medium"
            style={{ background: "#f6f8fa", color: "#1f2328", border: "1px solid #d1d9e0" }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
