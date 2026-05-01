import { useMemo, useState } from "react";
import { XmlCodeBlock } from "../common/XmlCodeBlock";
import { ResizeHandle } from "../common/ResizeHandle";
import type { ValidationResult, ValidationIssue } from "../../lib/api/validateFlowApi";

interface Props {
  flowTitle: string;
  flowXml: string;
  result: ValidationResult;
  onClose: () => void;
}

const SEVERITY_ICON: Record<string, React.ReactNode> = {
  error: (
    <span className="w-5 h-5 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
      <svg className="w-3 h-3 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
      </svg>
    </span>
  ),
  warning: (
    <span className="w-5 h-5 rounded-full bg-[#fff8c5] flex items-center justify-center shrink-0">
      <svg className="w-3 h-3 text-[#9a6700]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A9.05 9.05 0 0 0 11.484 21h.032A9.05 9.05 0 0 0 12 2.714ZM12 17.25h.008v.008H12v-.008Z" />
      </svg>
    </span>
  ),
  info: (
    <span className="w-5 h-5 rounded-full bg-[#ddf4ff] flex items-center justify-center shrink-0">
      <svg className="w-3 h-3 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z" />
      </svg>
    </span>
  ),
};

function groupByStep(issues: ValidationIssue[]): Map<number | null, ValidationIssue[]> {
  const map = new Map<number | null, ValidationIssue[]>();
  for (const issue of issues) {
    const key = issue.step;
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(issue);
  }
  return map;
}

function formatIssuesAsText(issues: ValidationIssue[]): string {
  const grouped = groupByStep(issues);
  const keys = [...grouped.keys()].sort((a, b) => (a ?? -1) - (b ?? -1));
  const lines: string[] = [];
  for (const key of keys) {
    lines.push(key === null ? "--- Flow-level ---" : `--- Step ${key} ---`);
    for (const issue of grouped.get(key)!) {
      const sev = issue.severity.toUpperCase();
      lines.push(`[${sev}] ${issue.message}`);
      if (issue.suggestion) lines.push(`       ${issue.suggestion}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
      title={copied ? "Copied!" : label}
      className="p-1 rounded-md text-[#afb8c1] hover:text-[#656d76] hover:bg-[#eef1f6] transition-colors shrink-0"
    >
      {copied ? (
        <svg className="w-3.5 h-3.5 text-[#1a7f37]" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
      ) : (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 0 1-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 0 1 1.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 0 0-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 0 1-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 0 0-3.375-3.375h-1.5a1.125 1.125 0 0 1-1.125-1.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H9.75" />
        </svg>
      )}
    </button>
  );
}

export function FlowValidationModal({ flowTitle, flowXml, result, onClose }: Props) {
  const { summary, issues } = result;
  const grouped = useMemo(() => groupByStep(issues), [issues]);
  const sortedKeys = useMemo(
    () => [...grouped.keys()].sort((a, b) => (a ?? -1) - (b ?? -1)),
    [grouped],
  );
  const issuesText = useMemo(() => formatIssuesAsText(issues), [issues]);

  const [issuesPanelWidth, setIssuesPanelWidth] = useState(420);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div
        className="bg-white rounded-xl shadow-2xl flex flex-col overflow-hidden"
        style={{ width: "90vw", maxWidth: 1200, height: "85vh" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <span className="text-sm font-semibold text-[#1f2328] truncate">Validate Flow XML</span>
            <span className="text-xs text-[#656d76] truncate">{flowTitle}</span>
          </div>

          {/* Summary badge */}
          {summary.errors > 0 ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#ffebe9] text-[#d1242f] border border-[#ffcecb] shrink-0">
              {summary.errors} error{summary.errors !== 1 ? "s" : ""}{summary.warnings > 0 ? `, ${summary.warnings} warning${summary.warnings !== 1 ? "s" : ""}` : ""}
            </span>
          ) : summary.warnings > 0 ? (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#fff8c5] text-[#9a6700] border border-[#f5e0a0] shrink-0">
              {summary.warnings} warning{summary.warnings !== 1 ? "s" : ""}
            </span>
          ) : (
            <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-[#dafbe1] text-[#1a7f37] border border-[#aceebb] shrink-0">
              All checks passed
            </span>
          )}
          {summary.info > 0 && (
            <span className="text-xs text-[#656d76] shrink-0">{summary.info} info</span>
          )}

          <button
            onClick={onClose}
            className="p-1.5 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] transition-colors shrink-0"
            title="Close"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Body: XML left, Issues right */}
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {/* Left: Flow XML */}
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex items-center gap-2 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
              <svg className="w-3.5 h-3.5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
              </svg>
              <span className="text-xs font-semibold text-[#656d76] uppercase tracking-wider flex-1">Flow XML</span>
              <CopyButton value={flowXml} label="Copy Flow XML" />
            </div>
            <div className="flex-1 min-h-0 overflow-auto">
              <XmlCodeBlock value={flowXml} className="h-full" height="100%" />
            </div>
          </div>

          {/* Resizable splitter */}
          <ResizeHandle width={issuesPanelWidth} onResize={setIssuesPanelWidth} side="right" minWidth={280} maxWidth={700} />

          {/* Right: Validation Issues */}
          <div className="flex flex-col overflow-hidden shrink-0" style={{ width: issuesPanelWidth }}>
            <div className="flex items-center gap-2 px-4 h-9 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
              <svg className="w-3.5 h-3.5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9 3.75h.008v.008H12v-.008Z" />
              </svg>
              <span className="text-xs font-semibold text-[#656d76] uppercase tracking-wider flex-1">Issues</span>
              <span className="text-xs text-[#afb8c1]">{issues.length}</span>
              {issues.length > 0 && (
                <CopyButton value={issuesText} label="Copy issues as text" />
              )}
            </div>
            <div className="flex-1 overflow-y-auto">
              {issues.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-full text-center px-6">
                  <svg className="w-10 h-10 text-[#1a7f37] mb-2" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                  </svg>
                  <p className="text-sm font-medium text-[#1a7f37]">No issues found</p>
                  <p className="text-xs text-[#656d76] mt-1">This flow passes all validation checks</p>
                </div>
              ) : (
                <div className="divide-y divide-[#d1d9e0]/50">
                  {sortedKeys.map((stepNum) => {
                    const stepIssues = grouped.get(stepNum)!;
                    return (
                      <div key={stepNum ?? "flow"} className="px-4 py-3">
                        <div className="text-xs font-semibold text-[#656d76] uppercase tracking-wider mb-2">
                          {stepNum === null ? "Flow-level" : `Step ${stepNum}`}
                        </div>
                        <div className="space-y-2.5">
                          {stepIssues.map((issue, i) => (
                            <div key={i} className="flex items-start gap-2">
                              {SEVERITY_ICON[issue.severity]}
                              <div className="min-w-0 flex-1">
                                <div className="text-sm text-[#1f2328] leading-snug">{issue.message}</div>
                                {issue.suggestion && (
                                  <div className="text-xs text-[#656d76] mt-0.5 leading-snug">{issue.suggestion}</div>
                                )}
                                <span className="text-xs text-[#afb8c1] font-mono">{issue.category}</span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end px-5 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
          <button
            onClick={onClose}
            className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-4 py-1.5 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
