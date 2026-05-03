import { useState, useCallback } from "react";
import { useSetupStore, AI_MODELS, type AiModelId } from "../../store/setup.store";
import { useUserStore } from "../../store/user.store";
import { useProjectStore } from "../../store/project.store";
import { fullProjectReset } from "../../lib/api/resetApi";

// ── Accordion primitive ──────────────────────────────────────────────

function AccordionSection({
  title,
  description,
  open,
  onToggle,
  variant = "default",
  children,
}: {
  title: string;
  description: string;
  open: boolean;
  onToggle: () => void;
  variant?: "default" | "danger";
  children: React.ReactNode;
}) {
  const borderClass = variant === "danger" ? "border-[#d1242f]/40" : "border-[#d1d9e0]";
  const titleClass = variant === "danger" ? "text-[#d1242f]" : "text-[#1f2328]";

  return (
    <div className={`bg-white rounded-xl border ${borderClass} shadow-sm overflow-hidden`}>
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-[#f6f8fa]/50 transition-colors"
      >
        <div className="min-w-0">
          <h2 className={`text-base font-semibold ${titleClass}`}>{title}</h2>
          <p className="text-sm text-[#656d76] mt-0.5">{description}</p>
        </div>
        <svg
          className={`w-4 h-4 text-[#656d76] shrink-0 ml-3 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>
      {open && (
        <div className="px-6 pb-6 pt-1 border-t border-[#d1d9e0]/60">
          {children}
        </div>
      )}
    </div>
  );
}

// ── Main panel ───────────────────────────────────────────────────────

export function SetupPanel() {
  const setup = useSetupStore();
  const isOwner = useUserStore((s) => s.hasRole("owner"));
  const selectedProjectId = useSetupStore((s) => s.selectedProjectId);
  const projects = useProjectStore((s) => s.projects);
  const updateProject = useProjectStore((s) => s.update);

  // Accordion open state — all closed by default
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({});
  const toggle = useCallback((key: string) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  // ── Project settings ────────────────────────────────────────────────
  const currentProject = projects.find((p) => p.id === selectedProjectId);
  const [draftName, setDraftName] = useState(currentProject?.name ?? "");
  const [draftDescription, setDraftDescription] = useState(currentProject?.description ?? "");
  const [projectSaved, setProjectSaved] = useState(false);
  const [projectSaving, setProjectSaving] = useState(false);
  const projectDirty =
    draftName.trim() !== (currentProject?.name ?? "") ||
    draftDescription.trim() !== (currentProject?.description ?? "");

  async function saveProjectSettings() {
    if (!selectedProjectId || !draftName.trim()) return;
    setProjectSaving(true);
    try {
      await updateProject(selectedProjectId, {
        name: draftName.trim(),
        description: draftDescription.trim(),
      });
      setProjectSaved(true);
      setTimeout(() => setProjectSaved(false), 2000);
    } catch {
      // error handled by store
    } finally {
      setProjectSaving(false);
    }
  }

  // ── Application settings ────────────────────────────────────────────
  const [draftAiModel, setDraftAiModel] = useState<AiModelId>(setup.aiModel);
  const [aiModelSaved, setAiModelSaved] = useState(false);
  const aiModelDirty = draftAiModel !== setup.aiModel;

  function saveAppSettings() {
    setup.setAiModel(draftAiModel);
    setAiModelSaved(true);
    setTimeout(() => setAiModelSaved(false), 2000);
  }

  // ── Test run settings ───────────────────────────────────────────────
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

  // ── HAR recording settings ──────────────────────────────────────────
  const [draftHarBaseUrl, setDraftHarBaseUrl] = useState(setup.harBaseUrl);
  const [harSaved, setHarSaved] = useState(false);
  const harDirty = draftHarBaseUrl !== setup.harBaseUrl;

  function saveHarSettings() {
    setup.setHarBaseUrl(draftHarBaseUrl.replace(/\/$/, ""));
    setHarSaved(true);
    setTimeout(() => setHarSaved(false), 2000);
  }

  // ── Reset project state ─────────────────────────────────────────────
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-start justify-center px-4 py-8">
      <div className="flex flex-col gap-3 w-full max-w-md">

        {/* ── Project ──────────────────────────────────── */}
        {currentProject && (
          <AccordionSection
            title="Project"
            description="Rename or describe this project."
            open={!!openSections.project}
            onToggle={() => toggle("project")}
          >
            <div className="flex flex-col gap-4 mt-3">
              <div>
                <label className="block text-sm font-medium text-[#1f2328] mb-1">
                  Project name
                </label>
                <input
                  type="text"
                  value={draftName}
                  onChange={(e) => { setDraftName(e.target.value); setProjectSaved(false); }}
                  maxLength={100}
                  className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328] outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-[#1f2328] mb-1">
                  Description <span className="text-[#656d76] font-normal">(optional)</span>
                </label>
                <textarea
                  value={draftDescription}
                  onChange={(e) => { setDraftDescription(e.target.value); setProjectSaved(false); }}
                  rows={2}
                  maxLength={500}
                  className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328] outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30 resize-none"
                />
              </div>
            </div>
            <div className="flex items-center gap-2 mt-4">
              <button
                onClick={() => void saveProjectSettings()}
                disabled={!projectDirty || !draftName.trim() || projectSaving}
                className="px-3 py-[6px] text-sm font-medium text-white bg-[#1a7f37] border border-[#1f883d]/80 rounded-md hover:bg-[#1a7f37]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {projectSaving ? "Saving…" : "Save"}
              </button>
              {projectSaved && (
                <span className="text-xs text-[#1a7f37] font-medium">Saved</span>
              )}
            </div>
          </AccordionSection>
        )}

        {/* ── Application settings ──────────────────────── */}
        <AccordionSection
          title="Application settings"
          description="Preferences that apply across all projects."
          open={!!openSections.app}
          onToggle={() => toggle("app")}
        >
          <div className="mt-3">
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
            <p className="text-xs text-[#656d76] mt-1">
              Used for flow generation, ideas, chat, editing, and diagnosis. Sonnet is recommended — 5x cheaper than Opus with reliable results.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-4">
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
        </AccordionSection>

        {/* ── Test run settings ──────────────────────────── */}
        <AccordionSection
          title="Test run settings"
          description="Configure pacing between steps and scenarios during test execution."
          open={!!openSections.run}
          onToggle={() => toggle("run")}
        >
          <div className="flex flex-col gap-4 mt-3">
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
              <p className="text-xs text-[#656d76] mt-1">
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
              <p className="text-xs text-[#656d76] mt-1">
                Wait time between scenarios. Helps avoid overwhelming the target API. Default: 0 (no delay).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 mt-4">
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
        </AccordionSection>

        {/* ── HAR recording ──────────────────────────── */}
        <AccordionSection
          title="HAR recording"
          description="Pre-configure the API base URL for HAR file filtering."
          open={!!openSections.har}
          onToggle={() => toggle("har")}
        >
          <div className="mt-3">
            <label className="block text-sm font-medium text-[#1f2328] mb-1">
              API Base URL for HAR filtering
            </label>
            <input
              type="url"
              placeholder="https://portal.document360.io"
              value={draftHarBaseUrl}
              onChange={(e) => { setDraftHarBaseUrl(e.target.value); setHarSaved(false); }}
              className="w-full px-3 py-[7px] border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328] outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]/30"
            />
            <p className="text-xs text-[#656d76] mt-1">
              Enter the base URL of your API. HAR recordings will auto-filter to this URL, skipping the dropdown. Leave empty to choose each time.
            </p>
          </div>
          <div className="flex items-center gap-2 mt-4">
            <button
              onClick={saveHarSettings}
              disabled={!harDirty}
              className="px-3 py-[6px] text-sm font-medium text-white bg-[#1a7f37] border border-[#1f883d]/80 rounded-md hover:bg-[#1a7f37]/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Save
            </button>
            {harSaved && (
              <span className="text-xs text-[#1a7f37] font-medium">Saved</span>
            )}
          </div>
        </AccordionSection>

        {/* ── Danger zone (owner only) ──────────────────── */}
        {isOwner && (
          <AccordionSection
            title="Danger zone"
            description="Irreversible actions that affect the entire project."
            open={!!openSections.danger}
            onToggle={() => toggle("danger")}
            variant="danger"
          >
            <div className="flex items-center justify-between mt-3">
              <div>
                <p className="text-sm font-medium text-[#1f2328]">Reset project data</p>
                <p className="text-sm text-[#656d76]">
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
              <p className="mt-3 text-sm text-[#d1242f]">{resetError}</p>
            )}
          </AccordionSection>
        )}
      </div>

      {/* ── Reset confirmation modal ──────────────────────────── */}
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
