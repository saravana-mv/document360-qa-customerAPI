import { useState, useEffect, useCallback, useRef } from "react";
import { useProjectVariablesStore } from "../store/projectVariables.store";
import type { ProjectVariable } from "../lib/api/projectVariablesApi";
import { listSpecFiles, getSpecFileContent, uploadSpecFile } from "../lib/api/specFilesApi";
import { patchSkillsVariables } from "../lib/skillsVariables";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isFileVariable(v: ProjectVariable): boolean {
  return v.type === "file" || v.value.startsWith("__ff_file__:");
}

export function ProjectVariablesPage() {
  const { variables, loading, saving, error, load, save, uploadFile, deleteFile } = useProjectVariablesStore();
  const [draft, setDraft] = useState<ProjectVariable[]>([]);
  const [dirty, setDirty] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [skillsWarnings, setSkillsWarnings] = useState<string[]>([]);
  const [uploadingVar, setUploadingVar] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingFileVarRef = useRef<string | null>(null);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    setDraft(variables.length > 0 ? variables.map(v => ({ ...v })) : []);
    setDirty(false);
  }, [variables]);

  const addRow = useCallback(() => {
    setDraft(prev => [...prev, { name: "", value: "" }]);
    setDirty(true);
  }, []);

  const addFileRow = useCallback(() => {
    setDraft(prev => [...prev, { name: "", value: "", type: "file" as const }]);
    setDirty(true);
  }, []);

  const updateRow = useCallback((index: number, field: "name" | "value", val: string) => {
    setDraft(prev => prev.map((row, i) => i === index ? { ...row, [field]: val } : row));
    setDirty(true);
    setSaveSuccess(false);
  }, []);

  const removeRow = useCallback((index: number) => {
    const row = draft[index];
    if (row && isFileVariable(row) && row.name) {
      // Delete file from server
      deleteFile(row.name).catch(() => {});
    }
    setDraft(prev => prev.filter((_, i) => i !== index));
    setDirty(true);
    setSaveSuccess(false);
  }, [draft, deleteFile]);

  const handleFileSelect = useCallback(async (varName: string, file: File) => {
    if (!varName.trim()) {
      setSaveError("Enter a variable name before uploading a file");
      return;
    }
    if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(varName)) {
      setSaveError(`Invalid variable name: "${varName}". Use letters, numbers, and underscores only.`);
      return;
    }
    setUploadingVar(varName);
    setSaveError(null);
    try {
      const updated = await uploadFile(varName, file);
      // Update draft with the server response
      setDraft(prev => prev.map(row =>
        row.name === varName ? { ...updated } : row
      ));
      setDirty(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setUploadingVar(null);
    }
  }, [uploadFile]);

  const triggerFileInput = useCallback((varName: string) => {
    pendingFileVarRef.current = varName;
    fileInputRef.current?.click();
  }, []);

  const onFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const varName = pendingFileVarRef.current;
    if (file && varName) {
      handleFileSelect(varName, file);
    }
    // Reset input so the same file can be re-selected
    e.target.value = "";
    pendingFileVarRef.current = null;
  }, [handleFileSelect]);

  const handleSave = useCallback(async () => {
    setSaveError(null);
    setSaveSuccess(false);
    // Filter out completely empty rows (but keep file rows that have a name)
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
          } catch { /* skip */ }
        }),
      );
    } catch { /* best-effort */ }
  }, []);

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
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={onFileInputChange}
      />

      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <h2 className="text-sm font-bold text-[#1f2328]">Project Variables</h2>
        <span className="text-sm text-[#656d76]">
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

          {/* Text Variables Table */}
          {draft.length > 0 && (
            <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
              {/* Header row */}
              <div className="flex items-center bg-[#f6f8fa] border-b border-[#d1d9e0] text-sm font-semibold text-[#656d76] uppercase tracking-wide">
                <div className="w-64 px-3 py-2">Name</div>
                <div className="flex-1 px-3 py-2">Value</div>
                <div className="w-10 shrink-0" />
              </div>
              {/* Rows */}
              {draft.map((row, i) => {
                const isFile = isFileVariable(row);
                return (
                  <div key={i} className="flex items-center border-b border-[#d1d9e0] last:border-b-0 group">
                    <div className="w-64 px-2 py-1.5">
                      <input
                        type="text"
                        value={row.name}
                        onChange={e => updateRow(i, "name", e.target.value)}
                        placeholder="variable_name"
                        spellCheck={false}
                        disabled={isFile && !!row.fileName}
                        className="w-full text-sm font-mono px-2 py-1 rounded border border-[#d1d9e0] bg-white text-[#1f2328] placeholder:text-[#8b949e] focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] disabled:bg-[#f6f8fa] disabled:text-[#656d76]"
                      />
                    </div>
                    <div className="flex-1 px-2 py-1.5">
                      {isFile ? (
                        <div className="flex items-center gap-2">
                          {row.fileName ? (
                            <>
                              <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#ddf4ff] border border-[#54aeff]/30 text-sm text-[#0969da]">
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                                </svg>
                                {row.fileName}
                                {row.fileSize ? ` (${formatFileSize(row.fileSize)})` : ""}
                              </span>
                              <button
                                onClick={() => triggerFileInput(row.name)}
                                disabled={uploadingVar === row.name}
                                className="text-sm text-[#0969da] hover:text-[#0860ca] font-medium"
                              >
                                Replace
                              </button>
                            </>
                          ) : (
                            <button
                              onClick={() => {
                                if (!row.name.trim()) {
                                  setSaveError("Enter a variable name first");
                                  return;
                                }
                                triggerFileInput(row.name);
                              }}
                              disabled={uploadingVar === row.name}
                              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-md border border-[#d1d9e0] text-sm text-[#656d76] hover:text-[#1f2328] hover:border-[#8b949e] transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
                              </svg>
                              {uploadingVar === row.name ? "Uploading..." : "Choose file"}
                            </button>
                          )}
                          {row.mimeType && (
                            <span className="text-xs text-[#8b949e]">{row.mimeType}</span>
                          )}
                        </div>
                      ) : (
                        <input
                          type="text"
                          value={row.value}
                          onChange={e => updateRow(i, "value", e.target.value)}
                          placeholder="value"
                          spellCheck={false}
                          className="w-full text-sm px-2 py-1 rounded border border-[#d1d9e0] bg-white text-[#1f2328] placeholder:text-[#8b949e] focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
                        />
                      )}
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
                );
              })}
            </div>
          )}

          {/* Add buttons */}
          <div className="flex items-center gap-4">
            <button
              onClick={addRow}
              className="inline-flex items-center gap-1.5 text-sm text-[#0969da] hover:text-[#0860ca] font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Add variable
            </button>
            <button
              onClick={addFileRow}
              className="inline-flex items-center gap-1.5 text-sm text-[#0969da] hover:text-[#0860ca] font-medium"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
              </svg>
              Add file variable
            </button>
          </div>

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
              <p className="text-sm font-semibold text-[#9a6700]">Review _skills.md — orphaned rules detected</p>
              {skillsWarnings.map((w, i) => (
                <p key={i} className="text-sm text-[#9a6700]">{w}</p>
              ))}
              <p className="text-sm text-[#9a6700] mt-1">Open the file in Spec Manager and remove any rules that reference the deleted variable.</p>
              <button
                onClick={() => setSkillsWarnings([])}
                className="text-sm text-[#9a6700] underline mt-1"
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
              <span className="text-sm text-[#9a6700]">Unsaved changes</span>
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
                    {isFileVariable(v) ? (
                      <span className="text-[#1f2328]">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#ddf4ff] text-[#0969da] text-xs font-sans">
                          FILE
                        </span>
                        {" "}{v.fileName}
                        {v.fileSize ? ` (${formatFileSize(v.fileSize)})` : ""}
                      </span>
                    ) : (
                      <span className="text-[#1f2328]">{v.value}</span>
                    )}
                  </div>
                ))}
              </div>
              {variables.some(v => isFileVariable(v)) && (
                <p className="text-sm text-[#656d76] mt-3 font-sans">
                  File variables require <code className="px-1 py-0.5 bg-[#eff1f3] rounded text-[#1f2328] font-mono">{'<body contentType="multipart/form-data">'}</code> in flow XML.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
