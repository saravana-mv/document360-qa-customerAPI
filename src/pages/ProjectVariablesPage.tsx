import { useState, useEffect, useCallback } from "react";
import { useProjectVariablesStore } from "../store/projectVariables.store";
import type { ProjectVariable } from "../lib/api/projectVariablesApi";
import { listSpecFiles, getSpecFileContent, uploadSpecFile } from "../lib/api/specFilesApi";
import { patchSkillsVariables } from "../lib/skillsVariables";

export function ProjectVariablesPage() {
  const { variables, loading, saving, error, load, save } = useProjectVariablesStore();
  const [draft, setDraft] = useState<ProjectVariable[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [skillsWarnings, setSkillsWarnings] = useState<string[]>([]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setDraft(variables.length > 0 ? variables.map(v => ({ ...v })) : []);
    setDirty(false);
  }, [variables]);

  const addRow = useCallback(() => {
    setDraft(prev => [...prev, { name: "", value: "" }]);
    setDirty(true);
  }, []);

  const updateRow = useCallback((index: number, field: "name" | "value", val: string) => {
    setDraft(prev => prev.map((row, i) => i === index ? { ...row, [field]: val } : row));
    setDirty(true);
    setSaveSuccess(false);
  }, []);

  const removeRow = useCallback((index: number) => {
    setDraft(prev => prev.filter((_, i) => i !== index));
    setDirty(true);
    setSaveSuccess(false);
  }, []);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveSuccess(false);
    // Filter out completely empty rows
    const cleaned = draft.filter(v => v.name.trim() || v.value.trim());
    // Validate names
    for (const v of cleaned) {
      if (!v.name.trim()) {
        setSaveError("Variable name cannot be empty");
        return;
      }
      if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(v.name)) {
        setSaveError(`Invalid variable name: "${v.name}". Use letters, numbers, and underscores only.`);
        return;
      }
    }
    // Check duplicates
    const names = cleaned.map(v => v.name);
    const dupes = names.filter((n, i) => names.indexOf(n) !== i);
    if (dupes.length > 0) {
      setSaveError(`Duplicate variable name: "${dupes[0]}"`);
      return;
    }
    try {
      const prevNames = new Set(variables.map((v) => v.name));
      const newNames = new Set(cleaned.map((v) => v.name));
      const added = cleaned.map((v) => v.name).filter((n) => !prevNames.has(n));
      const removed = variables.map((v) => v.name).filter((n) => !newNames.has(n));

      await save(cleaned);

      // Sync added/removed variable lines into every version folder's _skills.md
      // and warn about orphaned references for removed variables
      if (added.length > 0 || removed.length > 0) {
        void syncSkillsFiles(added, removed);
      }
      if (removed.length > 0) {
        void checkOrphanedSkillsRules(removed);
      }

      setDirty(false);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    }
  }, [draft, save, variables]);

  const syncSkillsFiles = useCallback(async (added: string[], removed: string[]) => {
    try {
      const allFiles = await listSpecFiles();
      const skillsFiles = allFiles.filter((f) => f.name.endsWith("/_system/_skills.md"));
      await Promise.all(
        skillsFiles.map(async (f) => {
          try {
            const content = await getSpecFileContent(f.name);
            const patched = patchSkillsVariables(content, added, removed);
            if (patched !== content) {
              await uploadSpecFile(f.name, patched);
            }
          } catch { /* skip files that can't be read/written */ }
        }),
      );
    } catch { /* best-effort — don't surface skills sync errors to the user */ }
  }, []);

  /** After deleting variables, scan _skills.md files for any remaining references
   *  to {{proj.NAME}} and warn the user to review them manually. */
  const checkOrphanedSkillsRules = useCallback(async (removed: string[]) => {
    try {
      const allFiles = await listSpecFiles();
      const skillsFiles = allFiles.filter((f) => f.name.endsWith("/_system/_skills.md"));
      const warnings: string[] = [];
      await Promise.all(
        skillsFiles.map(async (f) => {
          try {
            const content = await getSpecFileContent(f.name);
            for (const name of removed) {
              if (content.includes(`{{proj.${name}}}`)) {
                // Extract the version folder name for a friendly label
                const folder = f.name.split("/")[0] ?? f.name;
                warnings.push(`"${name}" is still referenced in ${folder}/_skills.md — review and remove any rules that mention {{proj.${name}}}.`);
              }
            }
          } catch { /* skip */ }
        }),
      );
      if (warnings.length > 0) setSkillsWarnings(warnings);
    } catch { /* best-effort */ }
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[#656d76]">
        Loading variables...
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <h2 className="text-sm font-bold text-[#1f2328]">Project Variables</h2>
        <span className="text-xs text-[#656d76]">
          Use <code className="px-1 py-0.5 bg-[#eff1f3] rounded text-[#1f2328] font-mono">{"{{proj.variableName}}"}</code> in flow XML
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        <div className="max-w-2xl space-y-4">
          {/* Description */}
          <p className="text-sm text-[#656d76]">
            Define project-level variables that can be referenced in flow XML using the <code className="px-1 py-0.5 bg-[#eff1f3] rounded text-[#1f2328] font-mono">proj.</code> prefix.
            These are shared across all team members and test runs in this project.
          </p>

          {/* Table */}
          {draft.length > 0 && (
            <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
              {/* Header row */}
              <div className="flex items-center bg-[#f6f8fa] border-b border-[#d1d9e0] text-xs font-semibold text-[#656d76] uppercase tracking-wide">
                <div className="w-64 px-3 py-2">Name</div>
                <div className="flex-1 px-3 py-2">Value</div>
                <div className="w-10 shrink-0" />
              </div>
              {/* Rows */}
              {draft.map((row, i) => (
                <div key={i} className="flex items-center border-b border-[#d1d9e0] last:border-b-0 group">
                  <div className="w-64 px-2 py-1.5">
                    <input
                      type="text"
                      value={row.name}
                      onChange={e => updateRow(i, "name", e.target.value)}
                      placeholder="variable_name"
                      spellCheck={false}
                      className="w-full text-sm font-mono px-2 py-1 rounded border border-[#d1d9e0] bg-white text-[#1f2328] placeholder:text-[#8b949e] focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
                    />
                  </div>
                  <div className="flex-1 px-2 py-1.5">
                    <input
                      type="text"
                      value={row.value}
                      onChange={e => updateRow(i, "value", e.target.value)}
                      placeholder="value"
                      spellCheck={false}
                      className="w-full text-sm px-2 py-1 rounded border border-[#d1d9e0] bg-white text-[#1f2328] placeholder:text-[#8b949e] focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
                    />
                  </div>
                  <div className="w-10 shrink-0 flex items-center justify-center">
                    <button
                      onClick={() => removeRow(i)}
                      title="Remove variable"
                      className="p-1 rounded text-[#656d76] hover:text-[#d1242f] hover:bg-[#ffebe9] transition-colors opacity-0 group-hover:opacity-100"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add button */}
          <button
            onClick={addRow}
            className="inline-flex items-center gap-1.5 text-sm text-[#0969da] hover:text-[#0860ca] font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add variable
          </button>

          {/* Error / Success messages */}
          {(error || saveError) && (
            <div className="text-sm text-[#d1242f] bg-[#ffebe9] border border-[#d1242f]/20 rounded-md px-3 py-2">
              {saveError || error}
            </div>
          )}
          {saveSuccess && (
            <div className="text-sm text-[#1a7f37] bg-[#dafbe1] border border-[#1a7f37]/20 rounded-md px-3 py-2">
              Variables saved successfully.
            </div>
          )}
          {skillsWarnings.length > 0 && (
            <div className="border border-[#9a6700]/30 bg-[#fff8c5] rounded-md px-3 py-2.5 space-y-1">
              <p className="text-xs font-semibold text-[#9a6700]">Review _skills.md — orphaned rules detected</p>
              {skillsWarnings.map((w, i) => (
                <p key={i} className="text-xs text-[#9a6700]">{w}</p>
              ))}
              <p className="text-xs text-[#9a6700] mt-1">Open the file in Spec Manager and remove any rules that reference the deleted variable.</p>
              <button
                onClick={() => setSkillsWarnings([])}
                className="text-xs text-[#9a6700] underline mt-1"
              >
                Dismiss
              </button>
            </div>
          )}

          {/* Save button */}
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSave}
              disabled={!dirty || saving}
              className="px-4 py-1.5 text-sm font-medium rounded-md bg-[#1a7f37] text-white hover:bg-[#178533] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {saving ? "Saving..." : "Save variables"}
            </button>
            {dirty && (
              <span className="text-xs text-[#9a6700]">Unsaved changes</span>
            )}
          </div>

          {/* Usage hint */}
          {variables.length > 0 && (
            <div className="mt-6 border border-[#d1d9e0] rounded-lg bg-[#f6f8fa] p-4">
              <h3 className="text-sm font-semibold text-[#1f2328] mb-2">Usage in flow XML</h3>
              <div className="space-y-1.5 text-sm text-[#656d76] font-mono">
                {variables.map(v => (
                  <div key={v.name}>
                    <code className="text-[#0969da]">{`{{proj.${v.name}}}`}</code>
                    <span className="text-[#8b949e] mx-2">&rarr;</span>
                    <span className="text-[#1f2328]">{v.value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
