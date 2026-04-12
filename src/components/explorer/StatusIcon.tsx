import type { TestStatus, RollupStatus } from "../../types/test.types";

type AnyStatus = TestStatus | RollupStatus;

interface StatusIconProps {
  status: AnyStatus;
  size?: "sm" | "md";
}

export function StatusIcon({ status, size = "sm" }: StatusIconProps) {
  const s = size === "sm" ? "w-4 h-4" : "w-5 h-5";
  const dot = size === "sm" ? "w-2 h-2" : "w-2.5 h-2.5";
  const inner = size === "sm" ? "w-2.5 h-2.5" : "w-3 h-3";

  switch (status) {
    case "pass":
      return (
        <span className={`${s} rounded-full bg-[#dafbe1] flex items-center justify-center shrink-0`}>
          <svg className={`${inner} text-[#1a7f37]`} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
          </svg>
        </span>
      );
    case "fail":
    case "error":
      return (
        <span className={`${s} rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0`}>
          <svg className={`${inner} text-[#d1242f]`} fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </span>
      );
    case "running":
      return (
        <svg className={`${s} text-[#0969da] animate-spin shrink-0`} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      );
    case "skip":
      return (
        <span className={`${s} rounded-full bg-[#eef1f6] flex items-center justify-center shrink-0`}>
          <span className={`block w-1.5 h-[2px] rounded-full bg-[#656d76]`} />
        </span>
      );
    case "partial":
      return (
        <span className={`${s} rounded-full bg-[#fff8c5] flex items-center justify-center shrink-0`}>
          <span className={`${dot} rounded-full bg-[#9a6700]`} />
        </span>
      );
    default:
      return (
        <span className={`${s} rounded-full bg-[#eef1f6] flex items-center justify-center shrink-0`}>
          <span className={`${dot} rounded-full bg-[#d1d9e0]`} />
        </span>
      );
  }
}
