import type { FlowPlan, FlowPlanStep } from "../../lib/api/flowChatApi";

const METHOD_STYLES: Record<string, string> = {
  GET: "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
  POST: "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]",
  PATCH: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
  DELETE: "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
};

function StepNode({ step }: { step: FlowPlanStep }) {
  const isTeardown = step.flags.includes("teardown");
  const isSetup = step.name.toLowerCase().includes("create category") ||
    step.name.toLowerCase().includes("setup");
  const methodStyle = METHOD_STYLES[step.method] ?? "bg-[#eef1f6] text-[#656d76] border-[#d1d9e0]";

  return (
    <div className="flex items-start gap-2 py-1.5 pl-4 pr-2 group">
      {/* Step number */}
      <span className="text-xs font-mono text-[#8b949e] w-5 text-right shrink-0 pt-0.5">
        {step.number}.
      </span>

      {/* Connector line */}
      <div className="flex flex-col items-center shrink-0 pt-1">
        <div className={`w-2 h-2 rounded-full border ${isTeardown ? "border-[#d1242f] bg-[#ffebe9]" : isSetup ? "border-[#0969da] bg-[#ddf4ff]" : "border-[#d1d9e0] bg-white"}`} />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          {/* Flag badges */}
          {isTeardown && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#ffebe9] text-[#d1242f] border border-[#ffcecb] uppercase tracking-wide">
              teardown
            </span>
          )}
          {isSetup && !isTeardown && (
            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-[#ddf4ff] text-[#0969da] border border-[#b6e3ff] uppercase tracking-wide">
              setup
            </span>
          )}

          {/* Method badge */}
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${methodStyle}`}>
            {step.method}
          </span>

          {/* Step name */}
          <span className="text-sm font-medium text-[#1f2328] truncate">{step.name}</span>
        </div>

        {/* Path */}
        <div className="text-xs font-mono text-[#656d76] mt-0.5 truncate">{step.path}</div>

        {/* Captures & assertions — compact */}
        {(step.captures.length > 0 || step.assertions.length > 0) && (
          <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1 text-[11px] text-[#8b949e]">
            {step.captures.map((c, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                </svg>
                {c}
              </span>
            ))}
            {step.assertions.map((a, i) => (
              <span key={i} className="flex items-center gap-0.5">
                <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                </svg>
                {a}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

interface FlowPlanTreeProps {
  plan: FlowPlan;
}

export function FlowPlanTree({ plan }: FlowPlanTreeProps) {
  return (
    <div className="border border-[#d1d9e0] rounded-lg bg-white overflow-hidden my-2">
      {/* Header */}
      <div className="px-3 py-2 bg-[#f6f8fa] border-b border-[#d1d9e0]">
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-[#8250df] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 12h16.5m-16.5 3.75h16.5M3.75 19.5h16.5M5.625 4.5h12.75a1.875 1.875 0 0 1 0 3.75H5.625a1.875 1.875 0 0 1 0-3.75Z" />
          </svg>
          <span className="text-sm font-semibold text-[#1f2328]">{plan.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-sm text-[#656d76]">{plan.entity}</span>
          <span className="text-[#d1d9e0]">·</span>
          <span className="text-xs text-[#656d76]">{plan.steps.length} steps</span>
        </div>
        {plan.description && (
          <p className="text-sm text-[#656d76] mt-1">{plan.description}</p>
        )}
      </div>

      {/* Steps */}
      <div className="divide-y divide-[#d1d9e0]/50 py-1">
        {plan.steps.map((step) => (
          <StepNode key={step.number} step={step} />
        ))}
      </div>
    </div>
  );
}
