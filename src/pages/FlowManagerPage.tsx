import { useCallback, useEffect, useState } from "react";
import { Layout } from "../components/common/Layout";
import { ResizeHandle } from "../components/common/ResizeHandle";
import { FlowFileTree } from "../components/flowmanager/FlowFileTree";
import { XmlViewer } from "../components/flowcreator/XmlViewer";
import {
  listFlowFiles,
  getFlowFileContent,
  deleteFlowFile,
  type FlowFileItem,
} from "../lib/api/flowFilesApi";
import { useAuthGuard } from "../hooks/useAuthGuard";

export function FlowManagerPage() {
  useAuthGuard();

  const [files, setFiles] = useState<FlowFileItem[]>([]);
  const [loadingList, setLoadingList] = useState(true);
  const [listError, setListError] = useState<string | null>(null);

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedXml, setSelectedXml] = useState<string>("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState<string | null>(null);

  const [removeConfirm, setRemoveConfirm] = useState<string | null>(null);
  const [treeWidth, setTreeWidth] = useState(320);

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
              onClick={() => void loadFiles()}
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
              <FlowFileTree
                files={files}
                activePath={selectedPath}
                onSelectFile={setSelectedPath}
                onRemoveFile={setRemoveConfirm}
              />
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
                <span className="text-xs text-[#656d76]">{selectedName}</span>
              </div>
              <div className="flex-1 flex flex-col overflow-hidden">
                {loadingContent ? (
                  <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading XML…</div>
                ) : contentError ? (
                  <div className="flex-1 flex items-center justify-center text-[#d1242f] text-sm p-4">{contentError}</div>
                ) : (
                  <XmlViewer xml={selectedXml} streaming={false} />
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
