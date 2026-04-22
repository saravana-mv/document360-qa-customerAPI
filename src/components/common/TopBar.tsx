import { useEntraAuthStore } from "../../store/entraAuth.store";
import { useAiCostStore } from "../../store/aiCost.store";
import { useVersionCheck } from "../../hooks/useVersionCheck";
import { ProjectPicker } from "./ProjectPicker";

export function TopBar() {
  const entraStatus = useEntraAuthStore((s) => s.status);
  const entraPrincipal = useEntraAuthStore((s) => s.principal);
  const entraLogout = useEntraAuthStore((s) => s.logout);
  const totalCostUsd = useAiCostStore((s) => s.totalCostUsd);
  const { currentVersion, updateAvailable, newVersion, relaunch, dismiss } = useVersionCheck();

  return (
    <header className="h-12 bg-[#1f2328] text-[#e6edf3] flex items-center px-4 gap-3 shrink-0 border-b border-[#31363b]">
      {/* App title */}
      <span className="flex items-baseline gap-1.5 shrink-0">
        <span className="text-[13px] font-bold tracking-[-0.01em]">FLOW FORGE</span>
        <span className="text-[10px] font-mono text-[#656d76]">v{currentVersion}</span>
      </span>

      {/* Project picker — after app title */}
      {entraStatus === "authenticated" && <ProjectPicker />}

      <div className="flex-1" />

      {/* Update notification */}
      {updateAvailable && (
        <div className="flex items-center gap-2 px-2.5 py-1 rounded-md bg-[#2d333b] border border-[#3d444d] animate-[fadeIn_0.3s_ease-out]">
          {/* Leaf / sparkle icon */}
          <svg className="w-3.5 h-3.5 text-[#3fb950] shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <path d="M11.134 1.535C9.722 2.562 8.16 4.057 6.889 5.312 5.8 6.396 5.046 7.31 4.74 7.963c-.125.27-.201.52-.2.73a.46.46 0 0 0 .139.344.46.46 0 0 0 .344.139c.21.001.46-.075.73-.2.652-.306 1.567-1.06 2.65-2.148 1.256-1.272 2.751-2.834 3.778-4.245.173-.238.356-.48.539-.717a16 16 0 0 0-.717.539ZM3.529 9.613a2.26 2.26 0 0 1-.236-.127C2.737 9.17 2.5 8.7 2.5 8.193c0-.508.152-1.025.37-1.496.224-.483.54-.97.9-1.43.243-.31.504-.62.773-.918a36 36 0 0 0-.773.918c-.36.46-.676.947-.9 1.43-.218.471-.37.988-.37 1.496 0 .507.237.977.793 1.293.04.023.083.046.127.066l.11.052Z" />
            <path d="M5.504 9.388a.46.46 0 0 1-.344-.139.46.46 0 0 1-.139-.344c-.001-.21.075-.46.2-.73.306-.652 1.06-1.567 2.149-2.65C8.626 4.268 10.12 2.773 11.134 1.535l.054-.073c.264-.362.516-.706.785-1.013A3.04 3.04 0 0 1 13.083 0c.406 0 .753.145 1.01.402.258.258.403.605.403 1.01 0 .393-.124.776-.449 1.11-.307.269-.651.521-1.013.785l-.073.054c-1.238 1.015-2.733 2.51-3.99 3.766-1.082 1.089-1.997 1.843-2.65 2.149-.269.125-.519.201-.73.2a.46.46 0 0 1-.087-.008ZM1.334 11.198a3.15 3.15 0 0 0 1.048.135c.749 0 1.439-.204 1.998-.553.521-.326.95-.78 1.168-1.327l.076.053c.068.047.136.091.204.13.2.116.404.199.596.239l.025.005a3.67 3.67 0 0 1-.406.79c-.665 1.03-1.8 1.79-3.508 1.79-.398 0-.78-.042-1.138-.117l-.088-.02A3.17 3.17 0 0 1 0 11.06c0-.648.168-1.273.434-1.823.133-.275.29-.534.464-.777l.007-.009.019-.025c.194-.262.405-.503.624-.72C2.15 7.104 2.86 6.627 3.53 6.627c.167 0 .312.04.432.106a.67.67 0 0 1 .192.161c-.23.34-.476.71-.736 1.118a12 12 0 0 0-.408.648c-.164.287-.329.604-.43.923-.1.316-.133.616-.065.86.068.243.243.417.499.511a1.6 1.6 0 0 0 .32.076Z" />
          </svg>
          <span className="text-[11px] text-[#8b949e]">
            Updated to <span className="text-[#e6edf3] font-medium">{newVersion}</span>
          </span>
          <button
            onClick={relaunch}
            className="text-[11px] font-medium text-[#1f2328] bg-[#3fb950] hover:bg-[#46c258] rounded px-2 py-0.5 transition-colors"
          >
            Relaunch
          </button>
          <button
            onClick={dismiss}
            className="text-[#7d8590] hover:text-[#e6edf3] transition-colors p-0.5"
            title="Dismiss"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

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
