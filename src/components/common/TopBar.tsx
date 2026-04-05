import { useNavigate } from "react-router-dom";
import { useAuthStore } from "../../store/auth.store";
import { useSetupStore } from "../../store/setup.store";
import { useSpecStore } from "../../store/spec.store";
import { Badge } from "./Badge";
import { Spinner } from "./Spinner";

interface TopBarProps {
  onCheckChanges?: () => void;
  onRunSelected?: () => void;
  showTestControls?: boolean;
}

export function TopBar({ onCheckChanges, onRunSelected, showTestControls }: TopBarProps) {
  const { status, token, logout } = useAuthStore();
  const { selectedProjectId, selectedVersionId, projects, versions } = useSetupStore();
  const { loading: specLoading } = useSpecStore();
  const navigate = useNavigate();

  const project = projects.find((p) => p.id === selectedProjectId);
  const version = versions.find((v) => v.id === selectedVersionId);

  return (
    <header className="h-14 bg-gray-900 text-white flex items-center px-4 gap-4 shrink-0">
      <span className="font-bold text-blue-400 text-sm tracking-wide">D360 API Test Runner</span>
      <div className="flex-1" />

      {status === "authenticated" && (
        <>
          {project && (
            <span className="text-xs text-gray-300">
              {project.name}
              {version && <span className="text-gray-500"> / {version.name}</span>}
            </span>
          )}

          {specLoading && <Spinner size="sm" className="text-blue-400" />}

          {showTestControls && (
            <>
              <button
                onClick={onCheckChanges}
                className="px-3 py-1.5 text-xs rounded-lg bg-gray-700 hover:bg-gray-600 transition-colors"
              >
                Check for Changes
              </button>
              <button
                onClick={onRunSelected}
                className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 hover:bg-blue-700 transition-colors font-medium"
              >
                Run Selected
              </button>
            </>
          )}

          <button
            onClick={() => navigate("/setup")}
            className="text-xs text-gray-400 hover:text-white transition-colors"
          >
            Setup
          </button>

          <button
            onClick={logout}
            className="text-xs text-gray-400 hover:text-red-400 transition-colors"
          >
            Logout
          </button>
        </>
      )}

      <Badge variant={status === "authenticated" ? "success" : status === "error" ? "error" : "default"}>
        {status === "authenticated"
          ? token?.token_type || "Bearer"
          : status}
      </Badge>
    </header>
  );
}
