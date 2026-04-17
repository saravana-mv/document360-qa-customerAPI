import { useAuthStore } from "../../store/auth.store";
import { useEntraAuthStore } from "../../store/entraAuth.store";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { useAiCostStore } from "../../store/aiCost.store";
import { Spinner } from "./Spinner";

interface TopBarProps {
  showTestControls?: boolean;
}

export function TopBar({ showTestControls }: TopBarProps) {
  const { status, token, logout } = useAuthStore();
  const entraStatus = useEntraAuthStore((s) => s.status);
  const entraPrincipal = useEntraAuthStore((s) => s.principal);
  const entraLogout = useEntraAuthStore((s) => s.logout);
  const { selectedProjectId, selectedVersionId, projects, versions } = useSetupStore();
  const { loading: specLoading } = useSpecStore();
  const totalCostUsd = useAiCostStore((s) => s.totalCostUsd);

  const project = projects.find((p) => p.id === selectedProjectId);
  const version = versions.find((v) => v.id === selectedVersionId);

  return (
    <header className="h-12 bg-[#1f2328] text-[#e6edf3] flex items-center px-4 gap-3 shrink-0 border-b border-[#31363b]">
      {/* App title */}
      <span className="flex items-baseline gap-1.5 shrink-0">
        <span className="text-[13px] font-bold tracking-[-0.01em]">FLOW FORGE</span>
        <span className="text-xs font-medium text-[#8b949e] tracking-wide">(Document360 API Chaining and Composite Testing Engine)</span>
      </span>

      {status === "authenticated" && project && (
        <>
          <span className="text-[#484f58]">/</span>
          <span className="text-[13px] text-[#7d8590] font-normal">
            {project.name}
            {version && (
              <>
                <span className="text-[#484f58] mx-1">/</span>
                <span className="text-[#e6edf3] font-medium">{version.name}</span>
              </>
            )}
          </span>
        </>
      )}

      {specLoading && showTestControls && <Spinner size="sm" className="text-[#58a6ff]" />}

      <div className="flex-1" />

      {totalCostUsd > 0 && (
        <span
          title="Cumulative AI cost this session (ideas + flows + edits)"
          className="text-[11px] font-medium text-[#8b949e] px-2 py-0.5 rounded-full bg-[#2d333b] border border-[#31363b] shrink-0"
        >
          Total AI cost: <span className="text-[#e6edf3]">${totalCostUsd.toFixed(4)}</span>
        </span>
      )}

      {status === "authenticated" && (
        <button
          onClick={logout}
          title="Disconnect from the current Document360 project (keeps you signed in to FlowForge)"
          className="text-xs text-[#7d8590] hover:text-[#e6edf3] transition-colors px-2 py-1 rounded-md hover:bg-[#2d333b]"
        >
          Disconnect project
        </button>
      )}

      {/* D360 project auth status pill */}
      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
        status === "authenticated"
          ? "bg-[#1a7f37]/15 text-[#3fb950] border border-[#238636]/40"
          : status === "error"
            ? "bg-[#d1242f]/15 text-[#f85149] border border-[#da3633]/40"
            : "bg-[#2d333b] text-[#7d8590] border border-[#31363b]"
      }`}>
        {status === "authenticated" ? token?.token_type || "Bearer" : status}
      </span>

      {/* Entra (corporate) user — always on the right */}
      {entraStatus === "authenticated" && entraPrincipal && (
        <>
          <span className="text-[#484f58] mx-1">|</span>
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
        <>
          <span className="text-[#484f58] mx-1">|</span>
          <span
            title="Entra login not active — running in local dev mode"
            className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-[#2d333b] text-[#7d8590] border border-[#31363b]"
          >
            dev
          </span>
        </>
      )}
    </header>
  );
}
