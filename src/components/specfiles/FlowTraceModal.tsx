import { useState } from "react";
import type { FlowTrace } from "../../lib/api/flowTraceApi";

interface Props {
  trace: FlowTrace;
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
      <span className="text-xs font-medium shrink-0" style={{ color: "#656d76", minWidth: 120 }}>{label}</span>
      <span style={{ color: "#1f2328" }}>{value}</span>
    </div>
  );
}

export default function FlowTraceModal({ trace, onClose }: Props) {
  const survived = trace.specSelection.survivedFiles.length;
  const selected = trace.specSelection.selectedFiles.length;
  const wasCapped = selected > trace.specSelection.cappedAt;

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
            <span className="text-sm font-semibold" style={{ color: "#1f2328" }}>Flow Generation Trace</span>
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
              <div className="flex gap-6 text-sm">
                <KV label="Model" value={trace.model.name} />
                <KV label="Input tokens" value={trace.model.inputTokens.toLocaleString()} />
                <KV label="Output tokens" value={trace.model.outputTokens.toLocaleString()} />
                <KV label="Cost" value={`$${trace.model.costUsd.toFixed(4)}`} />
              </div>
            ) : (
              <span className="text-xs" style={{ color: "#656d76" }}>No model data</span>
            )}
            <div className="mt-1">
              <KV label="Generated" value={new Date(trace.createdAt).toLocaleString()} />
              <KV label="By" value={trace.createdBy.name} />
            </div>
          </Section>

          {/* Spec Selection */}
          <Section title="Spec Selection" defaultOpen badge={wasCapped ? "CAPPED" : undefined}>
            <KV label="Source" value={trace.specSelection.source} />
            <KV label="Total blob files" value={trace.specSelection.totalBlobFiles} />
            <KV label="Selected" value={`${selected} files`} />
            <KV label="Cap (MAX_SPEC_FILES)" value={trace.specSelection.cappedAt} />
            <KV label="Survived cap" value={`${survived} files`} />
            {trace.specSelection.failedFiles.length > 0 && (
              <KV label="Failed" value={
                <span style={{ color: "#d1242f" }}>{trace.specSelection.failedFiles.join(", ")}</span>
              } />
            )}
            {wasCapped && (
              <div className="mt-1 text-xs px-2 py-1 rounded" style={{ background: "#fff8c5", color: "#9a6700" }}>
                {selected - survived} files were dropped by the MAX_SPEC_FILES cap
              </div>
            )}
          </Section>

          {/* Spec Context Headers */}
          <Section title="Spec Context Headers" badge={`${trace.specContextHeaders.length}`}>
            <div className="text-xs font-mono space-y-0.5" style={{ color: "#1f2328" }}>
              {trace.specContextHeaders.map((h, i) => (
                <div key={i}>{h}</div>
              ))}
            </div>
          </Section>

          {/* Idea Reference */}
          {trace.ideaRef && (
            <Section title="Idea Reference">
              <KV label="ID" value={<span className="font-mono text-xs">{trace.ideaRef.id}</span>} />
              <KV label="Description" value={trace.ideaRef.description} />
              <div className="mt-1">
                <span className="text-xs font-medium" style={{ color: "#656d76" }}>Steps:</span>
                <ol className="list-decimal ml-5 text-xs mt-0.5 space-y-0.5" style={{ color: "#1f2328" }}>
                  {trace.ideaRef.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              {trace.ideaRef.entities.length > 0 && (
                <KV label="Entities" value={trace.ideaRef.entities.join(", ")} />
              )}
            </Section>
          )}

          {/* Post-processing */}
          <Section title="Post-processing Pipeline" defaultOpen
            badge={`${trace.postProcessing.filter(p => p.applied).length}/${trace.postProcessing.length} applied`}>
            <table className="w-full text-xs">
              <thead>
                <tr style={{ color: "#656d76" }}>
                  <th className="text-left py-1 font-medium">Processor</th>
                  <th className="text-center py-1 font-medium w-16">Status</th>
                  <th className="text-left py-1 font-medium">Changes</th>
                </tr>
              </thead>
              <tbody>
                {trace.postProcessing.map((p, i) => (
                  <tr key={i} style={{ borderTop: "1px solid #d1d9e0" }}>
                    <td className="py-1.5 font-mono" style={{ color: "#1f2328" }}>{p.name}</td>
                    <td className="text-center py-1.5">
                      {p.error ? (
                        <span style={{ color: "#d1242f" }} title={p.error}>Error</span>
                      ) : p.applied ? (
                        <span style={{ color: "#1a7f37" }}>Changed</span>
                      ) : (
                        <span style={{ color: "#656d76" }}>—</span>
                      )}
                    </td>
                    <td className="py-1.5" style={{ color: "#1f2328" }}>
                      {p.error && <div style={{ color: "#d1242f" }}>{p.error}</div>}
                      {p.changes.length > 0 && (
                        <ul className="space-y-0.5">
                          {p.changes.slice(0, 10).map((c, j) => <li key={j}>{c}</li>)}
                          {p.changes.length > 10 && (
                            <li style={{ color: "#656d76" }}>...and {p.changes.length - 10} more</li>
                          )}
                        </ul>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Section>

          {/* AI Prompts */}
          <Section title="System Prompt" badge={`${(trace.prompt.systemPrompt.length / 1024).toFixed(0)}KB`}>
            <pre
              className="text-xs overflow-auto p-2 rounded whitespace-pre-wrap"
              style={{ background: "#f6f8fa", color: "#1f2328", maxHeight: 300, border: "1px solid #d1d9e0" }}
            >
              {trace.prompt.systemPrompt}
            </pre>
          </Section>

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
