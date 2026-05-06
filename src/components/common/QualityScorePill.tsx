import type { ReactNode } from "react";
import { bandFor } from "../../lib/spec/specQuality";

interface Props {
  score: number;
  /** When set, renders a count next to the percentage and includes it in the tooltip (used for folder rows). */
  endpointCount?: number;
  /** Tooltip override; default is computed from score and endpointCount. */
  title?: string;
  size?: "xs" | "sm";
}

const BAND_COLORS = {
  green: { bg: "bg-[#dafbe1]", border: "border-[#aceebb]", text: "text-[#1a7f37]" },
  amber: { bg: "bg-[#fff8c5]", border: "border-[#f5e0a0]", text: "text-[#9a6700]" },
  red: { bg: "bg-[#ffebe9]", border: "border-[#ffcecb]", text: "text-[#d1242f]" },
} as const;

export function QualityScorePill({ score, endpointCount, title, size = "xs" }: Props): ReactNode {
  const colors = BAND_COLORS[bandFor(score)];
  const label = endpointCount !== undefined ? `${score}% (${endpointCount})` : `${score}%`;
  const computedTitle =
    title ??
    (endpointCount !== undefined
      ? `Average spec quality across ${endpointCount} endpoint${endpointCount === 1 ? "" : "s"}: ${score}%`
      : `Spec quality: ${score}%`);
  const sizeClass = size === "sm" ? "text-xs px-2 py-0.5 min-w-[5.5rem]" : "text-xs px-1.5 py-px min-w-[5rem]";
  return (
    <span
      title={computedTitle}
      className={`shrink-0 inline-flex items-center justify-center tabular-nums font-semibold rounded-full border ${sizeClass} ${colors.bg} ${colors.border} ${colors.text}`}
    >
      {label}
    </span>
  );
}
