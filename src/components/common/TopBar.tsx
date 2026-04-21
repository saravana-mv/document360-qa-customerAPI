import { useEntraAuthStore } from "../../store/entraAuth.store";
import { useAiCostStore } from "../../store/aiCost.store";

export function TopBar() {
  const entraStatus = useEntraAuthStore((s) => s.status);
  const entraPrincipal = useEntraAuthStore((s) => s.principal);
  const entraLogout = useEntraAuthStore((s) => s.logout);
  const totalCostUsd = useAiCostStore((s) => s.totalCostUsd);

  return (
    <header className="h-12 bg-[#1f2328] text-[#e6edf3] flex items-center px-4 gap-3 shrink-0 border-b border-[#31363b]">
      {/* App title */}
      <span className="flex items-baseline gap-1.5 shrink-0">
        <span className="text-[13px] font-bold tracking-[-0.01em]">FLOW FORGE</span>
        <span className="text-xs font-medium text-[#8b949e] tracking-wide">(Document360 API Chaining and Composite Testing Engine)</span>
      </span>

      <div className="flex-1" />

      {totalCostUsd > 0 && (
        <span
          title="Cumulative AI cost this session (ideas + flows + edits)"
          className="text-[11px] font-medium text-[#8b949e] px-2 py-0.5 rounded-full bg-[#2d333b] border border-[#31363b] shrink-0"
        >
          Total AI cost: <span className="text-[#e6edf3]">${totalCostUsd.toFixed(4)}</span>
        </span>
      )}

      {/* Entra (corporate) user — always on the right */}
      {entraStatus === "authenticated" && entraPrincipal && (
        <>
          <span
            title={entraPrincipal.userDetails}
            className="text-xs text-[#e6edf3] font-medium max-w-[180px] truncate"
          >
            {entraPrincipal.userDetails}
          </span>
          <button
            onClick={entraLogout}
            title="Sign out of FlowForge"
            className="text-xs text-[#7d8590] hover:text-[#e6edf3] transition-colors px-2 py-1 rounded-md hover:bg-[#2d333b]"
          >
            Sign out
          </button>
        </>
      )}
      {entraStatus === "dev-mode" && (
        <span
          title="Entra login not active — running in local dev mode"
          className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#2d333b] text-[#7d8590] border border-[#31363b]"
        >
          dev
        </span>
      )}
    </header>
  );
}
