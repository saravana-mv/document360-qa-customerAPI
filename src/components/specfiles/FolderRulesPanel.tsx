// Inline rules editor for a version folder — API rules + enum aliases.
// Shown in the Spec Manager folder header when a top-level version folder is selected.

import { useState, useEffect, useCallback } from "react";
import { fetchFolderApiRules, saveFolderApiRules } from "../../lib/api/apiRulesApi";
import { setEnumAliases } from "../../lib/tests/flowXml/enumAliases";

interface FolderRulesPanelProps {
  folder: string;
}

export function FolderRulesPanel({ folder }: FolderRulesPanelProps) {
  const [rules, setRules] = useState("");
  const [enumAliasText, setEnumAliasText] = useState("");
  const [original, setOriginal] = useState({ rules: "", enumAliases: "" });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFolderApiRules(folder);
      setRules(data.rules);
      setEnumAliasText(data.enumAliases);
      setOriginal({ rules: data.rules, enumAliases: data.enumAliases });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [folder]);

  useEffect(() => { void load(); }, [load]);

  const changed = rules !== original.rules || enumAliasText !== original.enumAliases;

  async function handleSave() {
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await saveFolderApiRules(folder, { rules, enumAliases: enumAliasText });
      setOriginal({ rules, enumAliases: enumAliasText });
      setEnumAliases(enumAliasText);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="px-4 py-3 text-sm text-[#656d76]">Loading rules...</div>
    );
  }

  return (
    <div className="px-4 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa]">
      <div className="space-y-3">
        {/* Rules textarea */}
        <div>
          <label className="block text-sm font-medium text-[#1f2328] mb-1">
            API Rules
          </label>
          <p className="text-xs text-[#656d76] mb-1.5">
            Rules for your API's quirks, dependencies, and conventions. Injected into AI prompts when generating ideas, flows, and edits for this version folder.
          </p>
          <textarea
            value={rules}
            onChange={(e) => setRules(e.target.value)}
            rows={6}
            className="w-full rounded-md border border-[#d1d9e0] bg-white px-3 py-2 text-sm text-[#1f2328] placeholder:text-[#656d76] focus:border-[#0969da] focus:outline-none focus:ring-1 focus:ring-[#0969da] resize-y"
            placeholder="e.g. NEVER use PUT — this API uses PATCH for all updates..."
          />
        </div>

        {/* Enum Aliases textarea */}
        <div>
          <label className="block text-sm font-medium text-[#1f2328] mb-1">
            Enum Aliases
          </label>
          <p className="text-xs text-[#656d76] mb-1.5">
            Map enum names to integer values (one per line, name=value). Used by the test runner for assertions.
          </p>
          <textarea
            value={enumAliasText}
            onChange={(e) => setEnumAliasText(e.target.value)}
            rows={4}
            className="w-full rounded-md border border-[#d1d9e0] bg-white px-3 py-2 text-sm font-mono text-[#1f2328] placeholder:text-[#656d76] focus:border-[#0969da] focus:outline-none focus:ring-1 focus:ring-[#0969da] resize-y"
            placeholder={"draft=0\npublished=3\nmarkdown=0\nwysiwyg=1"}
          />
        </div>

        {/* Error */}
        {error && (
          <div className="text-sm text-[#d1242f]">{error}</div>
        )}

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => void handleSave()}
            disabled={!changed || saving}
            className="px-3 py-1.5 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save rules"}
          </button>
          {saved && (
            <span className="text-sm text-[#1a7f37] font-medium">Saved</span>
          )}
        </div>
      </div>
    </div>
  );
}
