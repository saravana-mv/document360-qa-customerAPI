import { useState, useEffect } from "react";
import { useSetupStore, AI_MODELS, type AiModelId } from "../../store/setup.store";
import { useUserStore } from "../../store/user.store";
import { fullProjectReset } from "../../lib/api/resetApi";
import { fetchApiRules, saveApiRules, type ApiRulesData } from "../../lib/api/apiRulesApi";
import { setEnumAliases } from "../../lib/tests/flowXml/enumAliases";



export function SetupPanel() {
  const setup = useSetupStore();
  const isOwner = useUserStore((s) => s.hasRole("owner"));
  const canManage = useUserStore((s) => s.hasRole("qa_manager"));
  const selectedProjectId = setup.selectedProjectId;

  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [resetError, setResetError] = useState<string | null>(null);

  // API Rules state
  const [apiRules, setApiRules] = useState("");
  const [enumAliasText, setEnumAliasText] = useState("");
  const [rulesLoading, setRulesLoading] = useState(true);
  const [rulesSaving, setRulesSaving] = useState(false);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesOriginal, setRulesOriginal] = useState<ApiRulesData>({ rules: "", enumAliases: "" });

  useEffect(() => {
    if (!selectedProjectId) return;
    setRulesLoading(true);
    fetchApiRules()
      .then((data) => {
        setApiRules(data.rules);
        setEnumAliasText(data.enumAliases);
        setRulesOriginal(data);
        setEnumAliases(data.enumAliases);
      })
      .catch(() => { /* ok — new project */ })
      .finally(() => setRulesLoading(false));
  }, [selectedProjectId]);

  const rulesChanged = apiRules !== rulesOriginal.rules || enumAliasText !== rulesOriginal.enumAliases;

  async function handleSaveRules() {
    setRulesSaving(true);
    setRulesError(null);
    setRulesSaved(false);
    try {
      await saveApiRules({ rules: apiRules, enumAliases: enumAliasText });
      setRulesOriginal({ rules: apiRules, enumAliases: enumAliasText });
      setEnumAliases(enumAliasText);
      setRulesSaved(true);
      setTimeout(() => setRulesSaved(false), 2000);
    } catch (e) {
      setRulesError(e instanceof Error ? e.message : String(e));
    } finally {
      setRulesSaving(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex items-start justify-center px-4 py-8">
      <div className="flex flex-col gap-4 w-full max-w-md">

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
        {/* ── API Rules (for AI generation — qa_manager+) ────────────────── */}
        {canManage && (
          <div className="bg-white rounded-xl border border-[#d1d9e0] shadow-sm p-6">
            <h2 className="text-base font-semibold text-[#1f2328] mb-0.5">API Rules</h2>
            <p className="text-sm text-[#656d76] mb-5">
              Rules that describe your API's quirks, dependencies, and conventions. These are injected into AI prompts when generating ideas, flows, and edits.
            </p>

            {rulesLoading ? (
              <p className="text-sm text-[#656d76]">Loading…</p>
            ) : (
              <>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-[#1f2328] mb-1">
                    API-Specific Rules
                  </label>
                  <textarea
                    value={apiRules}
                    onChange={(e) => setApiRules(e.target.value)}
                    rows={8}
                    placeholder={"Example:\n- NEVER use PUT — this API only supports PATCH for updates.\n- Articles require a category_id (create Category first).\n- DELETE returns 204 with no body.\n- The PATCH body only accepts: title, content, category_id."}
                    className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328] font-mono resize-y"
                  />
                  <p className="text-[11px] text-[#656d76] mt-1">
                    Free-text rules appended to the AI system prompt. Describe HTTP method restrictions, entity dependencies, required fields, etc.
                  </p>
                </div>

                <div className="mb-4">
                  <label className="block text-sm font-medium text-[#1f2328] mb-1">
                    Enum Aliases <span className="text-[#656d76] font-normal">(optional)</span>
                  </label>
                  <textarea
                    value={enumAliasText}
                    onChange={(e) => setEnumAliasText(e.target.value)}
                    rows={4}
                    placeholder={"# name=value (one per line)\ndraft=0\npublished=3\nfolder=0\npage=1"}
                    className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm bg-[#f6f8fa] focus:bg-white text-[#1f2328] font-mono resize-y"
                  />
                  <p className="text-[11px] text-[#656d76] mt-1">
                    If the API returns enums as integers but the spec uses strings, map them here. Format: <code className="text-[11px]">name=value</code> per line. Lines starting with # are comments.
                  </p>
                </div>

                {rulesError && (
                  <p className="text-xs text-[#d1242f] mb-3">{rulesError}</p>
                )}

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleSaveRules}
                    disabled={rulesSaving || !rulesChanged}
                    className="px-3 py-[6px] text-sm font-medium text-white bg-[#1a7f37] border border-[#1a7f37]/80 rounded-md hover:bg-[#1a7f37]/90 transition-colors disabled:opacity-50"
                  >
                    {rulesSaving ? "Saving…" : "Save rules"}
                  </button>
                  {rulesSaved && (
                    <span className="text-xs text-[#1a7f37]">Saved</span>
                  )}
                </div>
              </>
            )}
          </div>
        )}

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
              <div>
                <h3 className="text-base font-semibold text-[#1f2328]">Reset project?</h3>
                <p className="text-sm text-[#656d76]">This cannot be undone.</p>
              </div>
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
