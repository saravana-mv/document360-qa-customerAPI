import { useCallback, useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Layout } from "../components/common/Layout";
import { ResizeHandle } from "../components/common/ResizeHandle";
import { FlowFileTree } from "../components/flowmanager/FlowFileTree";
import { XmlViewer } from "../components/flowcreator/XmlViewer";
import { XmlEditor } from "../components/common/XmlEditor";
import {
  listFlowFiles,
  getFlowFileContent,
  deleteFlowFile,
  saveFlowFile,
  type FlowFileItem,
} from "../lib/api/flowFilesApi";
import { useAuthGuard } from "../hooks/useAuthGuard";
import { useFlowStatusStore } from "../store/flowStatus.store";
import { loadFlowsFromQueue } from "../lib/tests/flowXml/loader";
import { parseFlowXml, FlowXmlParseError } from "../lib/tests/flowXml/parser";

export function FlowManagerPage() {
  useAuthGuard();
  const location = useLocation();
  const statusByName = useFlowStatusStore((s) => s.byName);
  const statusLoading = useFlowStatusStore((s) => s.loading);

  const implementedCount = Object.values(statusByName).filter((e) => e.status === "implemented").length;
  const invalidCount = Object.values(statusByName).filter((e) => e.status === "invalid").length;

  const [files, setFiles] = useState<FlowFileItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedXml, setSelectedXml] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState(320);

  // ── Edit mode ──────────────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [draftXml, setDraftXml] = useState("");
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationOk, setValidationOk] = useState(false);
  const [saving, setSaving] = useState(false);

  // Leaving a file or changing selection cancels edit mode.
  useEffect(() => {
    setEditing(false);
    setDraftXml("");
    setValidationError(null);
    setValidationOk(false);
  }, [selectedPath]);

  function handleEdit() {
    setDraftXml(selectedXml);
    setValidationError(null);
    setValidationOk(false);
    setEditing(true);
  }

  function handleCancelEdit() {
    setEditing(false);
    setDraftXml("");
    setValidationError(null);
    setValidationOk(false);
  }

  function handleValidate() {
    try {
      parseFlowXml(draftXml);
      setValidationError(null);
      setValidationOk(true);
    } catch (err) {
      const msg = err instanceof FlowXmlParseError
        ? err.message
        : err instanceof Error ? err.message : String(err);
      setValidationError(msg);
      setValidationOk(false);
    }
  }

  async function handleSave() {
    if (!selectedPath) return;
    // Validate first — we never persist malformed XML.
    try {
      parseFlowXml(draftXml);
    } catch (err) {
      const msg = err instanceof FlowXmlParseError
        ? err.message
        : err instanceof Error ? err.message : String(err);
      setValidationError(msg);
      setValidationOk(false);
      return;
    }
    setSaving(true);
    try {
      await saveFlowFile(selectedPath, draftXml, true);
      setSelectedXml(draftXml);
      setEditing(false);
      setValidationError(null);
      setValidationOk(false);
      // Saving only persists the XML. Use the "Create tests" button to
      // re-register with the Test Manager.
    } catch (err) {
      setValidationError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  const [creatingTests, setCreatingTests] = useState(false);
  const [createTestsMsg, setCreateTestsMsg] = useState<string | null>(null);

  async function handleCreateTests() {
    setCreatingTests(true);
    setCreateTestsMsg(null);
    try {
      await loadFlowsFromQueue();
      const state = useFlowStatusStore.getState();
      const implemented = Object.values(state.byName).filter((e) => e.status === "implemented").length;
      const invalid = Object.values(state.byName).filter((e) => e.status === "invalid").length;
      setCreateTestsMsg(`Registered ${implemented} flow${implemented === 1 ? "" : "s"}${invalid > 0 ? ` · ${invalid} invalid` : ""}`);
    } catch (err) {
      setCreateTestsMsg(`Failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setCreatingTests(false);
    }
  }

  // ── Load file list ────────────────────────────────────────────────────────
  const loadFiles = useCallback(async () => {
    setLoadingList(true);
    setListError(null);
    try {
      const items = await listFlowFiles();
      setFiles(items.filter((f) => f.name.endsWith(".flow.xml")));
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingList(false);
    }
  }, []);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  // Pre-select a flow when navigated from Test Manager's edit icon.
  useEffect(() => {
    const selectPath = (location.state as { selectPath?: string } | null)?.selectPath;
    if (selectPath) setSelectedPath(selectPath);
  }, [location.state]);

  // ── Load file content on selection ────────────────────────────────────────
  useEffect(() => {
    if (!selectedPath) { setSelectedXml(""); return; }
    let cancelled = false;
    setLoadingContent(true);
    setContentError(null);
    (async () => {
      try {
        const xml = await getFlowFileContent(selectedPath);
        if (!cancelled) setSelectedXml(xml);
      } catch (e) {
        if (!cancelled) setContentError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoadingContent(false);
      }
    })();
    return () => { cancelled = true; };
  }, [selectedPath]);

  // ── Remove flow ───────────────────────────────────────────────────────────
  async function handleConfirmRemove() {
    if (!removeConfirm) return;
    const target = removeConfirm;
    setRemoveConfirm(null);
    try {
      await deleteFlowFile(target);
      if (selectedPath === target) {
        setSelectedPath(null);
        setSelectedXml("");
      }
      await loadFiles();
    } catch (e) {
      setListError(e instanceof Error ? e.message : String(e));
    }
  }

  const selectedName = selectedPath ? selectedPath.split("/").pop() : null;

  return (
    <Layout>
      <div className="h-full flex overflow-hidden bg-white">
        {/* ── LHS: file tree ── */}
        <aside
          className="shrink-0 border-r border-[#d1d9e0] bg-white flex flex-col overflow-hidden"
          style={{ width: treeWidth }}
        >
          <div className="flex items-center gap-2 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
            <svg className="w-4 h-4 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
            <span className="text-sm font-semibold text-[#1f2328]">Implementation queue</span>
            {files.length > 0 && (
              <span className="text-xs px-1.5 py-px rounded-full font-medium bg-[#0969da]/10 text-[#0969da] border border-[#0969da]/20">
                {files.length}
              </span>
            )}
            <div className="flex-1" />
            <button
              onClick={() => { void loadFiles(); void loadFlowsFromQueue(); }}
              title="Refresh"
              className="text-[#656d76] hover:text-[#0969da] rounded-md p-0.5 hover:bg-[#ddf4ff] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto">
            {loadingList ? (
              <div className="p-4 text-sm text-[#656d76]">Loading…</div>
            ) : listError ? (
              <div className="p-4 text-sm text-[#d1242f]">{listError}</div>
            ) : (
              <>
                {(implementedCount > 0 || invalidCount > 0 || statusLoading) && (
                  <div className="px-3 py-1.5 border-b border-[#d1d9e0] bg-white text-[11px] text-[#656d76] flex items-center gap-2">
                    {statusLoading && <span>Parsing flows…</span>}
                    {implementedCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#1a7f37]" />
                        {implementedCount} implemented
                      </span>
                    )}
                    {invalidCount > 0 && (
                      <span className="inline-flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-[#d1242f]" />
                        {invalidCount} invalid
                      </span>
                    )}
                  </div>
                )}
                <FlowFileTree
                  files={files}
                  activePath={selectedPath}
                  onSelectFile={setSelectedPath}
                  onRemoveFile={setRemoveConfirm}
                  statusByName={statusByName}
                />
              </>
            )}
          </div>
        </aside>

        <ResizeHandle width={treeWidth} onResize={setTreeWidth} minWidth={220} maxWidth={600} />

        {/* ── RHS: XML viewer ── */}
        <div className="flex-1 flex flex-col overflow-hidden min-w-0">
          {selectedPath ? (
            <>
              <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                <svg className="w-4 h-4 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                </svg>
                <span className="text-sm font-mono text-[#656d76] truncate" title={selectedPath}>{selectedPath}</span>
                <div className="flex-1" />
                {editing ? (
                  <>
                    <button
                      onClick={handleValidate}
                      disabled={saving}
                      className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 border border-[#d1d9e0] rounded-md px-2 py-1 hover:bg-white transition-colors"
                    >
                      Validate
                    </button>
                    <button
                      onClick={handleCancelEdit}
                      disabled={saving}
                      className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 border border-[#d1d9e0] rounded-md px-2 py-1 hover:bg-white transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => void handleSave()}
                      disabled={saving || draftXml === selectedXml}
                      className="flex items-center gap-1 text-xs text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 disabled:opacity-50 border border-[#1a7f37]/80 rounded-md px-2 py-1 transition-colors"
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={handleEdit}
                      disabled={!selectedXml}
                      className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 border border-[#d1d9e0] rounded-md px-2 py-1 hover:bg-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L6.832 19.82a4.5 4.5 0 0 1-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 0 1 1.13-1.897L16.863 4.487Zm0 0L19.5 7.125" />
                      </svg>
                      Edit
                    </button>
                    <button
                      onClick={() => void handleCreateTests()}
                      disabled={creatingTests}
                      title="Parse every flow in the queue and register its steps as runnable tests"
                      className="flex items-center gap-1 text-xs text-white bg-[#0969da] hover:bg-[#0969da]/90 disabled:opacity-50 border border-[#0969da]/80 rounded-md px-2 py-1 transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                      </svg>
                      {creatingTests ? "Creating…" : "Create tests"}
                    </button>
                    <button
                      onClick={() => { void navigator.clipboard.writeText(selectedXml); }}
                      disabled={!selectedXml}
                      className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 border border-[#d1d9e0] rounded-md px-2 py-1 hover:bg-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                      </svg>
                      Copy
                    </button>
                    <button
                      onClick={() => {
                        if (!selectedXml) return;
                        const blob = new Blob([selectedXml], { type: "application/xml" });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement("a");
                        a.href = url;
                        a.download = selectedName || "flow.xml";
                        a.click();
                        URL.revokeObjectURL(url);
                      }}
                      disabled={!selectedXml}
                      className="flex items-center gap-1 text-xs text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 border border-[#d1d9e0] rounded-md px-2 py-1 hover:bg-white transition-colors"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
                      </svg>
                      Download
                    </button>
                  </>
                )}
              </div>
              {!editing && createTestsMsg && (
                <div className="shrink-0 px-4 py-2 bg-[#ddf4ff] border-b border-[#b6e3ff] text-xs text-[#0969da] flex items-center justify-between gap-2">
                  <span>{createTestsMsg}</span>
                  <button onClick={() => setCreateTestsMsg(null)} className="text-[#0969da] hover:text-[#054da7]">
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              )}
              {editing && validationError && (
                <div className="shrink-0 px-4 py-2 bg-[#ffebe9] border-b border-[#ffcecb] text-xs text-[#d1242f] flex items-start gap-2">
                  <svg className="w-3.5 h-3.5 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A9.05 9.05 0 0 0 11.484 21h.032A9.05 9.05 0 0 0 12 2.714ZM12 17.25h.008v.008H12v-.008Z" />
                  </svg>
                  <span className="font-mono break-all">{validationError}</span>
                </div>
              )}
              {editing && validationOk && !validationError && (
                <div className="shrink-0 px-4 py-2 bg-[#dafbe1] border-b border-[#aceebb] text-xs text-[#1a7f37] flex items-center gap-2">
                  <svg className="w-3.5 h-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                  XML is valid
                </div>
              )}
              {statusByName[selectedPath]?.status === "invalid" && (
                <div className="shrink-0 px-4 py-2.5 bg-[#ffebe9] border-b border-[#ffcecb] text-sm text-[#d1242f] flex items-start gap-2">
                  <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A9.05 9.05 0 0 0 11.484 21h.032A9.05 9.05 0 0 0 12 2.714ZM12 17.25h.008v.008H12v-.008Z" />
                  </svg>
                  <div className="min-w-0">
                    <div className="font-medium">Schema validation failed</div>
                    <div className="font-mono text-xs mt-0.5 break-all">{statusByName[selectedPath]?.error ?? "Unknown error"}</div>
                  </div>
                </div>
              )}
              <div className="flex-1 flex flex-col overflow-hidden">
                {loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading XML…</div>
                ) : contentError ? (
                  <div className="flex-1 flex items-center justify-center text-[#d1242f] text-sm p-4">{contentError}</div>
                ) : editing ? (
                  <div className="flex-1 min-h-0 m-4">
                    <XmlEditor
                      value={draftXml}
                      onChange={(next) => {
                        setDraftXml(next);
                        // Any edit invalidates the last validation verdict.
                        if (validationOk) setValidationOk(false);
                        if (validationError) setValidationError(null);
                      }}
                      className="h-full border border-[#d1d9e0] rounded-md bg-white overflow-hidden"
                    />
                  </div>
                ) : (
                  <XmlViewer xml={selectedXml} streaming={false} showToolbar={false} />
                )}
              </div>
            </>
          ) : (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <svg className="w-12 h-12 mx-auto text-[#d1d9e0]" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
                </svg>
                <p className="text-sm text-[#656d76]">Select a flow to view its XML</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Remove confirmation */}
      {removeConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
          onClick={() => setRemoveConfirm(null)}
        >
          <div
            className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[420px] max-w-[92vw]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
              <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              </div>
              <span className="text-base font-semibold text-[#1f2328]">Remove from implementation queue?</span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <p className="text-sm text-[#656d76] leading-relaxed">
                This will remove <code className="text-[#1f2328] font-mono text-xs bg-[#f6f8fa] px-1 py-px rounded">{removeConfirm}</code> from
                the Flow Manager implementation queue.
              </p>
              <p className="text-sm text-[#656d76] leading-relaxed">
                If the matching idea still exists in Spec Manager, it will be unblocked automatically — you can re-mark the flow at any time.
              </p>
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
              <button
                onClick={() => setRemoveConfirm(null)}
                className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleConfirmRemove()}
                className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
              >
                Remove
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  );
}
