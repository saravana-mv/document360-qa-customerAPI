import { useSetupStore, AI_MODELS, type AiModelId } from "../../store/setup.store";

const API_VERSIONS = ["v3", "v2"];

export function SetupPanel() {
  const setup = useSetupStore();

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-start justify-center px-4 py-8">
      <div className="flex flex-col gap-4 w-full max-w-md">

        {/* ── Environment ─────────────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#1f2328] mb-0.5">Environment</h2>
          <p className="text-sm text-[#656d76] mb-5">API host and version used by every request.</p>

          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-[#1f2328] mb-1">Base URL</label>
              <input
                type="url"
                value={setup.baseUrl}
                onChange={(e) => setup.setBaseUrl(e.target.value)}
                placeholder="https://apihub.berlin.document360.net"
                className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white font-mono text-[#1f2328] placeholder:text-[#afb8c1]"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-[#1f2328] mb-1">API Version</label>
              <select
                value={setup.apiVersion}
                onChange={(e) => setup.setApiVersion(e.target.value)}
                className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328]"
              >
                {API_VERSIONS.map((v) => (
                  <option key={v} value={v}>{v}</option>
                ))}
              </select>
              <p className="text-[11px] text-[#656d76] mt-1">
                All endpoints use the selected version at runtime.
              </p>
            </div>
          </div>
        </div>

        {/* ── Application settings (cross-cutting, not per-project) ──────────── */}
        <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#1f2328] mb-0.5">Application settings</h2>
          <p className="text-sm text-[#656d76] mb-5">Preferences that apply across all projects.</p>

          <div>
            <label className="block text-sm font-medium text-[#1f2328] mb-1">
              AI Model <span className="text-[#656d76] font-normal">(flow ideas + XML generation)</span>
            </label>
            <select
              value={setup.aiModel}
              onChange={(e) => setup.setAiModel(e.target.value as AiModelId)}
              className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328]"
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-[#656d76] mt-1">
              Sonnet 4.6 is the recommended default — 5× cheaper than Opus and produces valid flow XML reliably.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
