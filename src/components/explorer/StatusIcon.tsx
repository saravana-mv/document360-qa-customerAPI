import type { TestStatus, RollupStatus } from "../../types/test.types";

type AnyStatus = TestStatus | RollupStatus;

interface StatusIconProps {
  status: AnyStatus;
  size?: "sm" | "md";
}

export function StatusIcon({ status, size = "sm" }: StatusIconProps) {
  const cls = size === "sm" ? "text-base w-4 text-center" : "text-lg w-5 text-center";

  switch (status) {
    case "pass": return <span className={`${cls} text-green-600`}>✓</span>;
    case "fail":
    case "error": return <span className={`${cls} text-red-500`}>✗</span>;
    case "running": return <span className={`${cls} text-blue-500 animate-spin inline-block`}>⟳</span>;
    case "skip": return <span className={`${cls} text-gray-400`}>—</span>;
    case "partial": return <span className={`${cls} text-yellow-500`}>△</span>;
    default: return <span className={`${cls} text-gray-300`}>○</span>;
  }
}
