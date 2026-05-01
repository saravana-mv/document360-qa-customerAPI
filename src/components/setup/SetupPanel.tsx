import { useState } from "react";
import { useSetupStore, AI_MODELS, type AiModelId } from "../../store/setup.store";
import { useUserStore } from "../../store/user.store";
import { fullProjectReset } from "../../lib/api/resetApi";



export function SetupPanel() {
  const setup = useSetupStore();
  const isOwner = useUserStore((s) => s.hasRole("owner"));

  // ── Draft state for Application settings card ─────────────────────────
  const [draftAiModel, setDraftAiModel] = useState<AiModelId>(setup.aiModel);
  const [aiModelSaved, setAiModelSaved] = useState(false);
  const aiModelDirty = draftAiModel !== setup.aiModel;

  function saveAppSettings() {
    setup.setAiModel(draftAiModel);
    setAiModelSaved(true);
    setTimeout(() => setAiModelSaved(false), 2000);
  }

  // ── Draft state for Test run settings card ────────────────────────────
  const [draftStepDelay, setDraftStepDelay] = useState(setup.delayBetweenStepsMs);
  const [draftScenarioDelay, setDraftScenarioDelay] = useState(setup.delayBetweenScenariosMs);
  const [runSettingsSaved, setRunSettingsSaved] = useState(false);
  const runSettingsDirty =
    draftStepDelay !== setup.delayBetweenStepsMs ||
    draftScenarioDelay !== setup.delayBetweenScenariosMs;

  function saveRunSettings() {
    setup.setDelayBetweenStepsMs(draftStepDelay);
    setup.setDelayBetweenScenariosMs(draftScenarioDelay);
    setRunSettingsSaved(true);
    setTimeout(() => setRunSettingsSaved(false), 2000);
  }

  // ── Reset project state ───────────────────────────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-start justify-center px-4 py-8">
      <div className="flex flex-col gap-4 w-full max-w-md">

        {/* ── Application settings ──────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#1f2328] mb-0.5">Application settings</h2>
          <p className="text-sm text-[#656d76] mb-5">Preferences that apply across all projects.</p>

          <div>
            <label className="block text-sm font-medium text-[#1f2328] mb-1">
              AI Model
            </label>
            <select
              value={draftAiModel}
              onChange={(e) => { setDraftAiModel(e.target.value as AiModelId); setAiModelSaved(false); }}
              className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328]"
            >
              {AI_MODELS.map((m) => (
                <option key={m.id} value={m.id}>{m.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-[#656d76] mt-1">
              Used for flow generation, ideas, chat, editing, and diagnosis. Sonnet is recommended — 5× cheaper than Opus with reliable results.
            </p>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={saveAppSettings}
              disabled={!aiModelDirty}
              className="px-3 py-[6px] text-sm font-medium text-white bg-[#1a7f37] border border-[#1f883d]/80 rounded-md hover:bg-[#1a7f37]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            {aiModelSaved && (
              <span className="text-xs text-[#1a7f37] font-medium">Saved</span>
            )}
          </div>
        </div>

        {/* ── Test run settings ──────────────────────────────────── */}
        <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-6">
          <h2 className="text-base font-semibold text-[#1f2328] mb-0.5">Test run settings</h2>
          <p className="text-sm text-[#656d76] mb-5">Configure pacing between steps and scenarios during test execution.</p>

          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-sm font-medium text-[#1f2328] mb-1">
                Delay between steps <span className="text-[#656d76] font-normal">(ms)</span>
              </label>
              <input
                type="number"
                min={0}
                max={30000}
                step={100}
                value={draftStepDelay}
                onChange={(e) => { setDraftStepDelay(Math.max(0, Math.min(30000, Number(e.target.value) || 0))); setRunSettingsSaved(false); }}
                className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328]"
              />
              <p className="text-[11px] text-[#656d76] mt-1">
                Wait time between each step within a scenario. Useful for APIs with rate limits. Default: 0 (no delay).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-[#1f2328] mb-1">
                Delay between scenarios <span className="text-[#656d76] font-normal">(ms)</span>
              </label>
              <input
                type="number"
                min={0}
                max={60000}
                step={500}
                value={draftScenarioDelay}
                onChange={(e) => { setDraftScenarioDelay(Math.max(0, Math.min(60000, Number(e.target.value) || 0))); setRunSettingsSaved(false); }}
                className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328]"
              />
              <p className="text-[11px] text-[#656d76] mt-1">
                Wait time between scenarios. Helps avoid overwhelming the target API. Default: 0 (no delay).
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 mt-5">
            <button
              onClick={saveRunSettings}
              disabled={!runSettingsDirty}
              className="px-3 py-[6px] text-sm font-medium text-white bg-[#1a7f37] border border-[#1f883d]/80 rounded-md hover:bg-[#1a7f37]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            {runSettingsSaved && (
              <span className="text-xs text-[#1a7f37] font-medium">Saved</span>
            )}
          </div>
        </div>

        {/* ── Danger zone (owner only) ──────────────────────────── */}
        {isOwner && (
          <div className="bg-white rounded-xl border border-[#d1242f]/40 shadow-sm p-6">
            <h2 className="text-base font-semibold text-[#d1242f] mb-0.5">Danger zone</h2>
            <p className="text-sm text-[#656d76] mb-5">
              Irreversible actions that affect the entire project.
            </p>

            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-[#1f2328]">Reset project data</p>
                <p className="text-xs text-[#656d76]">
                  Delete all flows, ideas, test runs, and local caches. Spec files are preserved.
                </p>
              </div>
              <button
                onClick={() => { setShowResetConfirm(true); setResetError(null); }}
                className="ml-4 shrink-0 px-3 py-[6px] text-sm font-medium text-[#d1242f] bg-white border border-[#d1242f]/40 rounded-md hover:bg-[#ffebe9] hover:border-[#d1242f] transition-colors"
              >
                Reset project…
              </button>
            </div>

            {resetError && (
              <p className="mt-3 text-xs text-[#d1242f]">{resetError}</p>
            )}
          </div>
        )}
      </div>

      {/* ── Confirmation modal ──────────────────────────────── */}
      {showResetConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-lg p-6 w-full max-w-sm">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 bg-[#ffebe9] rounded-lg flex items-center justify-center shrink-0">
                <svg className="w-5 h-5 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <div className="flex-1">
                <h3 className="text-base font-semibold text-[#1f2328]">Reset project?</h3>
                <p className="text-sm text-[#656d76]">This cannot be undone.</p>
              </div>
              <button onClick={() => setShowResetConfirm(false)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors self-start">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-[#656d76] mb-5 leading-relaxed">
              All flows, ideas, active tests, and test run history will be permanently deleted.
              Spec files and user accounts are preserved.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                disabled={resetting}
                onClick={() => setShowResetConfirm(false)}
                className="px-3 py-[6px] text-sm font-medium text-[#1f2328] bg-white border border-[#d1d9e0] rounded-md hover:bg-[#f6f8fa] transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                disabled={resetting}
                onClick={async () => {
                  setResetting(true);
                  setResetError(null);
                  try {
                    await fullProjectReset();
                    // fullProjectReset reloads the page, so we won't reach here
                  } catch (e) {
                    setResetError(e instanceof Error ? e.message : String(e));
                    setResetting(false);
                  }
                }}
                className="px-3 py-[6px] text-sm font-medium text-white bg-[#d1242f] border border-[#d1242f] rounded-md hover:bg-[#a40e26] transition-colors disabled:opacity-50"
              >
                {resetting ? "Resetting…" : "Yes, reset everything"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
