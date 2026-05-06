import { useMemo, useState } from "react";
import { bandFor, type EndpointScore, type FactorResult, type FactorStatus } from "../../lib/spec/specQuality";
import { QualityScorePill } from "../common/QualityScorePill";

interface Props {
  score: EndpointScore;
}

const BAND_LABEL: Record<"green" | "amber" | "red", string> = {
  green: "Excellent",
  amber: "Needs work",
  red: "Poor",
};

const BAND_BANNER: Record<"green" | "amber" | "red", { bg: string; border: string }> = {
  green: { bg: "bg-[#f6fff8]", border: "border-[#aceebb]" },
  amber: { bg: "bg-[#fffdf5]", border: "border-[#f5e0a0]" },
  red: { bg: "bg-[#fff5f5]", border: "border-[#ffcecb]" },
};

const STATUS_ORDER: FactorStatus[] = ["fail", "partial", "pass", "skipped"];
const STATUS_LABEL: Record<FactorStatus, string> = {
  fail: "Failing",
  partial: "Partial",
  pass: "Passing",
  skipped: "Skipped",
};

function StatusGlyph({ status }: { status: FactorStatus }) {
  if (status === "pass") {
    return (
      <svg className="w-4 h-4 text-[#1a7f37] shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
      </svg>
    );
  }
  if (status === "fail") {
    return (
      <svg className="w-4 h-4 text-[#d1242f] shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z" />
      </svg>
    );
  }
  if (status === "partial") {
    return (
      <svg className="w-4 h-4 text-[#9a6700] shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
        <path d="M8 1a7 7 0 1 0 0 14A7 7 0 0 0 8 1Zm0 1.5V13.5a5.5 5.5 0 0 1 0-11Z" />
      </svg>
    );
  }
  return (
    <svg className="w-4 h-4 text-[#8b949e] shrink-0" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M3.75 7.25a.75.75 0 0 0 0 1.5h8.5a.75.75 0 0 0 0-1.5h-8.5Z" />
    </svg>
  );
}

function FactorRow({ factor }: { factor: FactorResult }) {
  const earnedPoints = factor.applicable ? factor.weight * factor.earned : 0;
  return (
    <div className="flex items-start gap-2 py-1.5 text-sm">
      <StatusGlyph status={factor.status} />
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline justify-between gap-3 flex-wrap">
          <span className="font-medium text-[#1f2328]">{factor.label}</span>
          <span className="text-xs text-[#656d76] tabular-nums shrink-0">
            {factor.applicable
              ? `${earnedPoints.toFixed(earnedPoints === Math.round(earnedPoints) ? 0 : 1)} / ${factor.weight} pts`
              : "skipped"}
          </span>
        </div>
        <p className="text-xs text-[#656d76] leading-relaxed">{factor.detail}</p>
        {factor.fixHint && (
          <p className="text-xs text-[#0969da] mt-0.5">Hint: {factor.fixHint}</p>
        )}
      </div>
    </div>
  );
}

export function QualityScoreBanner({ score }: Props) {
  const [expanded, setExpanded] = useState(false);
  const band = bandFor(score.score);
  const palette = BAND_BANNER[band];

  const grouped = useMemo(() => {
    const groups = new Map<FactorStatus, FactorResult[]>();
    for (const status of STATUS_ORDER) groups.set(status, []);
    for (const f of score.factors) groups.get(f.status)?.push(f);
    return groups;
  }, [score.factors]);

  const failing = grouped.get("fail")?.length ?? 0;
  const partial = grouped.get("partial")?.length ?? 0;

  return (
    <div className={`border ${palette.border} ${palette.bg} rounded-lg px-4 py-3`}>
      <div className="flex items-center gap-3 flex-wrap">
        <span className="text-sm font-semibold text-[#1f2328] shrink-0">Spec Quality:</span>
        <QualityScorePill score={score.score} size="sm" />
        <span className="text-sm font-medium text-[#1f2328] shrink-0">{BAND_LABEL[band]}</span>
        <span className="text-xs text-[#656d76] flex-1 min-w-0">
          {failing + partial === 0
            ? "All scored factors are passing — this endpoint is well-grounded for AI flow generation."
            : `${failing} failing, ${partial} partial — predicts AI flow generation quality. Click to see what's missing.`}
        </span>
        <button
          onClick={() => setExpanded((v) => !v)}
          className="text-sm font-medium text-[#0969da] hover:underline shrink-0"
        >
          {expanded ? "Hide breakdown" : "Show breakdown"}
        </button>
      </div>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-[#d1d9e0] space-y-3">
          {STATUS_ORDER.map((status) => {
            const items = grouped.get(status) ?? [];
            if (items.length === 0) return null;
            return (
              <div key={status}>
                <div className="text-xs font-semibold text-[#656d76] uppercase tracking-wide mb-1">
                  {STATUS_LABEL[status]} ({items.length})
                </div>
                <div className="space-y-0.5">
                  {items.map((f) => (
                    <FactorRow key={f.id} factor={f} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
