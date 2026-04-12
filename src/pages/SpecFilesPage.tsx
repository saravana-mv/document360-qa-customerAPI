import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "../components/common/Layout";
import { ResizeHandle } from "../components/common/ResizeHandle";
import { FileTree } from "../components/specfiles/FileTree";
import { MarkdownViewer } from "../components/specfiles/MarkdownViewer";
import { FileUploadModal } from "../components/specfiles/FileUploadModal";
import { FlowIdeasPanel } from "../components/specfiles/FlowIdeasPanel";
import { FlowsPanel, type GeneratedFlow } from "../components/specfiles/FlowsPanel";
import { DetailPanel } from "../components/specfiles/DetailPanel";
import {
  listSpecFiles,
  getSpecFileContent,
  uploadSpecFile,
  deleteSpecFile,
  renameSpecFile,
  generateFlowIdeas,
  type SpecFileItem,
  type FlowIdea,
  type FlowIdeasUsage,
} from "../lib/api/specFilesApi";
import { generateFlowXml } from "../lib/api/flowApi";
import { useAuthGuard } from "../hooks/useAuthGuard";

// ── localStorage persistence helpers ────────────────────────────────────────

const STORAGE_KEY = "specfiles_workshop";

interface WorkshopSnapshot {
  ideasFolderPath: string | null;
  ideas: FlowIdea[];
  ideasUsage: FlowIdeasUsage | null;
  selectedIdeaIds: string[];
  generatedFlows: GeneratedFlow[];
}

function loadWorkshop(): WorkshopSnapshot | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as WorkshopSnapshot;
  } catch {
    return null;
  }
}

function saveWorkshop(snap: WorkshopSnapshot) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(snap));
  } catch { /* quota exceeded — ignore */ }
}

function clearWorkshop() {
  localStorage.removeItem(STORAGE_KEY);
}

// Load snapshot once at module level to avoid repeated parsing
const _initialSnap = loadWorkshop();

export function SpecFilesPage() {
  useAuthGuard();

  // ── File tree state ────────────────────────────────────────────────────────
  const [files, setFiles] = useState<SpecFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [viewingContent, setViewingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFolderPath, setUploadFolderPath] = useState<string | null>(null);

  // ── Flow ideas state (restored from localStorage on mount) ────────────────
  // ideasContextPath can be a folder path OR a file path (.md)
  const [ideasContextPath, setIdeasContextPath] = useState<string | null>(() => _initialSnap?.ideasFolderPath ?? null);
  const [ideas, setIdeas] = useState<FlowIdea[]>(() => _initialSnap?.ideas ?? []);
  const [ideasUsage, setIdeasUsage] = useState<FlowIdeasUsage | null>(() => _initialSnap?.ideasUsage ?? null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasRawText, setIdeasRawText] = useState<string | undefined>();
  const [selectedIdeaIds, setSelectedIdeaIds] = useState<Set<string>>(
    () => new Set(_initialSnap?.selectedIdeaIds ?? [])
  );

  // ── Flow generation state (restored from localStorage on mount) ───────────
  const [generatedFlows, setGeneratedFlows] = useState<GeneratedFlow[]>(
    () => _initialSnap?.generatedFlows.filter((f) => f.status === "done" || f.status === "error") ?? []
  );
  const [generatingFlows, setGeneratingFlows] = useState(false);
  const [flowProgress, setFlowProgress] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // ── Detail panel state ─────────────────────────────────────────────────────
  const [activeIdeaId, setActiveIdeaId] = useState<string | null>(null);
  const [activeFlowId, setActiveFlowId] = useState<string | null>(null);

  // ── Resizable panel widths ────────────────────────────────────────────────
  const [treeWidth, setTreeWidth] = useState(240);
  const [ideasWidth, setIdeasWidth] = useState(320);
  const [flowsWidth, setFlowsWidth] = useState(288);

  // Workshop is visible once ideas have been generated at least once
  const showWorkshop = ideas.length > 0 || ideasLoading || ideasError !== null;

  // Persist workshop state whenever ideas or flows change
  useEffect(() => {
    if (ideas.length > 0 || generatedFlows.length > 0) {
      saveWorkshop({
        ideasFolderPath: ideasContextPath,
        ideas,
        ideasUsage,
        selectedIdeaIds: Array.from(selectedIdeaIds),
        generatedFlows: generatedFlows.filter((f) => f.status === "done" || f.status === "error"),
      });
    }
  }, [ideasContextPath, ideas, ideasUsage, selectedIdeaIds, generatedFlows]);

  // ── File list ──────────────────────────────────────────────────────────────

  const loadFiles = useCallback(async () => {
    setLoadingFiles(true);
    setError(null);
    try {
      const list = await listSpecFiles();
      setFiles(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingFiles(false);
    }
  }, []);

  useEffect(() => { void loadFiles(); }, [loadFiles]);

  // ── Select file ────────────────────────────────────────────────────────────

  async function selectFile(path: string) {
    setSelectedPath(path);
    setSelectedFolderPath(null);
    setViewingContent(false);
    // Pre-load content for when user clicks the filename link
    setContent("");
    setLoadingContent(true);
    try {
      const text = await getSpecFileContent(path);
      setContent(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingContent(false);
    }
  }

  function selectFolder(path: string) {
    setSelectedFolderPath(path);
    setSelectedPath(null);
    setViewingContent(false);
    setContent("");
  }

  // ── CRUD handlers ─────────────────────────────────────────────────────────

  async function handleCreateFolder(folderPath: string) {
    setError(null);
    try {
      await uploadSpecFile(`${folderPath}/.keep`, "");
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleUpload(name: string, fileContent: string, contentType: string) {
    await uploadSpecFile(name, fileContent, contentType);
    await loadFiles();
  }

  async function handleDeleteFile(path: string) {
    setError(null);
    try {
      await deleteSpecFile(path);
      if (selectedPath === path) {
        setSelectedPath(null);
        setContent("");
      }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleDeleteFolder(folderPath: string) {
    setError(null);
    try {
      const toDelete = files.filter((f) => f.name.startsWith(`${folderPath}/`));
      await Promise.all(toDelete.map((f) => deleteSpecFile(f.name)));
      if (selectedPath?.startsWith(`${folderPath}/`)) {
        setSelectedPath(null);
        setContent("");
      }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleRename(oldPath: string, newPath: string) {
    setError(null);
    try {
      const isFolder = !files.some((f) => f.name === oldPath);
      if (isFolder) {
        const toRename = files.filter((f) => f.name.startsWith(`${oldPath}/`));
        await Promise.all(
          toRename.map((f) => renameSpecFile(f.name, f.name.replace(oldPath, newPath)))
        );
        if (selectedPath?.startsWith(`${oldPath}/`)) {
          setSelectedPath(selectedPath.replace(oldPath, newPath));
        }
      } else {
        await renameSpecFile(oldPath, newPath);
        if (selectedPath === oldPath) setSelectedPath(newPath);
      }
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Generate flow ideas (AI) ──────────────────────────────────────────────

  async function handleGenerateFlowIdeas(contextPath: string) {
    // contextPath can be a folder path or a file path (.md)
    if (contextPath.endsWith(".md")) {
      setSelectedPath(contextPath);
      setSelectedFolderPath(null);
    } else {
      setSelectedFolderPath(contextPath);
      setSelectedPath(null);
    }
    setViewingContent(false);
    setIdeasContextPath(contextPath);
    setIdeas([]);
    setIdeasUsage(null);
    setIdeasError(null);
    setIdeasRawText(undefined);
    setSelectedIdeaIds(new Set());
    setGeneratedFlows([]);
    setActiveIdeaId(null);
    setActiveFlowId(null);
    setIdeasLoading(true);
    try {
      const result = await generateFlowIdeas(contextPath, []);
      setIdeas(result.ideas);
      setIdeasUsage(result.usage);
      if (result.parseError && result.rawText) {
        setIdeasRawText(result.rawText);
      }
    } catch (e) {
      setIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasLoading(false);
    }
  }

  async function handleGenerateMoreIdeas() {
    if (!ideasContextPath) return;
    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasLoading(true);
    const existingTitles = ideas.map((i) => i.title);
    try {
      const result = await generateFlowIdeas(ideasContextPath, existingTitles);
      if (result.ideas.length > 0) {
        const offset = ideas.length;
        const newIdeas = result.ideas.map((idea, i) => ({
          ...idea,
          id: `idea-${offset + i + 1}`,
        }));
        setIdeas((prev) => [...prev, ...newIdeas]);
      }
      if (result.usage) {
        setIdeasUsage((prev) => prev ? {
          inputTokens: prev.inputTokens + result.usage.inputTokens,
          outputTokens: prev.outputTokens + result.usage.outputTokens,
          totalTokens: prev.totalTokens + result.usage.totalTokens,
          costUsd: parseFloat((prev.costUsd + result.usage.costUsd).toFixed(6)),
          filesAnalyzed: result.usage.filesAnalyzed,
          totalSpecCharacters: result.usage.totalSpecCharacters,
        } : result.usage);
      }
      if (result.parseError && result.rawText) {
        setIdeasRawText(result.rawText);
      }
    } catch (e) {
      setIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setIdeasLoading(false);
    }
  }

  // ── Idea selection ────────────────────────────────────────────────────────

  function toggleIdeaSelect(id: string) {
    setSelectedIdeaIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllIdeas() {
    setSelectedIdeaIds(new Set(ideas.map((i) => i.id)));
  }

  function deselectAllIdeas() {
    setSelectedIdeaIds(new Set());
  }

  // ── Detail panel click handlers ───────────────────────────────────────────

  function handleClickIdea(id: string) {
    setActiveIdeaId(id);
    setActiveFlowId(null);
  }

  function handleClickFlow(ideaId: string) {
    setActiveFlowId(ideaId);
    setActiveIdeaId(null);
  }

  // ── Download helpers ──────────────────────────────────────────────────────

  function downloadFlow(flow: GeneratedFlow) {
    const idea = ideas.find((i) => i.id === flow.ideaId);
    const filename = (idea?.title ?? flow.ideaId)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 35) + ".flow.xml";
    const blob = new Blob([flow.xml], { type: "application/xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function downloadAllFlows() {
    for (const f of generatedFlows.filter((f) => f.status === "done")) {
      downloadFlow(f);
    }
  }

  // ── Generate flows from selected ideas ────────────────────────────────────

  async function handleGenerateFlows() {
    if (selectedIdeaIds.size === 0 || !ideasContextPath) return;

    const selectedIdeas = ideas.filter((i) => selectedIdeaIds.has(i.id));

    // Get spec file names for context — depends on whether context is a file or folder
    let specFileNames: string[];
    if (ideasContextPath.endsWith(".md")) {
      specFileNames = [ideasContextPath];
    } else {
      const prefix = ideasContextPath.endsWith("/") ? ideasContextPath : `${ideasContextPath}/`;
      specFileNames = files
        .filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md"))
        .map((f) => f.name);
    }

    const initialFlows: GeneratedFlow[] = selectedIdeas.map((idea) => ({
      ideaId: idea.id,
      title: idea.title,
      status: "pending" as const,
      xml: "",
    }));
    setGeneratedFlows(initialFlows);
    setGeneratingFlows(true);
    setFlowProgress({ current: 0, total: selectedIdeas.length });

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    for (let i = 0; i < selectedIdeas.length; i++) {
      if (ctrl.signal.aborted) break;

      const idea = selectedIdeas[i];
      const prompt = buildFlowPrompt(idea);

      setGeneratedFlows((prev) =>
        prev.map((f) => f.ideaId === idea.id ? { ...f, status: "generating" as const } : f)
      );
      // Auto-select the currently generating flow in the detail panel
      setActiveFlowId(idea.id);
      setActiveIdeaId(null);

      try {
        const xml = await generateFlowXml(prompt, specFileNames, ctrl.signal);
        setGeneratedFlows((prev) =>
          prev.map((f) => f.ideaId === idea.id ? { ...f, status: "done" as const, xml } : f)
        );
      } catch (e) {
        if (ctrl.signal.aborted) break;
        setGeneratedFlows((prev) =>
          prev.map((f) => f.ideaId === idea.id
            ? { ...f, status: "error" as const, error: e instanceof Error ? e.message : String(e) }
            : f
          )
        );
      }

      setFlowProgress({ current: i + 1, total: selectedIdeas.length });
    }

    setGeneratingFlows(false);
    abortRef.current = null;
  }

  // ── Close workshop ────────────────────────────────────────────────────────

  function closeWorkshop() {
    if (generatingFlows) {
      abortRef.current?.abort();
    }
    setIdeasContextPath(null);
    setIdeas([]);
    setIdeasUsage(null);
    setIdeasError(null);
    setIdeasRawText(undefined);
    setSelectedIdeaIds(new Set());
    setGeneratedFlows([]);
    setGeneratingFlows(false);
    setFlowProgress(null);
    setActiveIdeaId(null);
    setActiveFlowId(null);
    clearWorkshop();
  }

  // ── Derived detail data ───────────────────────────────────────────────────

  const selectedIdea = activeIdeaId ? ideas.find((i) => i.id === activeIdeaId) ?? null : null;
  const selectedFlow = activeFlowId ? generatedFlows.find((f) => f.ideaId === activeFlowId) ?? null : null;

  // ── Derived header info ──────────────────────────────────────────────────

  // The active context path for display (either folder or file)
  const activePath = selectedPath ?? selectedFolderPath;
  const isFileContext = !!selectedPath;
  const hasSelection = !!activePath;

  // For file context: split path into parent + filename (without extension)
  const fileDisplayName = isFileContext && selectedPath
    ? selectedPath.replace(/\.md$/i, "").split("/").pop() ?? ""
    : "";
  const fileParentPath = isFileContext && selectedPath
    ? selectedPath.replace(/\.md$/i, "").split("/").slice(0, -1).join("/")
    : "";

  // Spec file count for folder context
  const specFileCount = selectedFolderPath
    ? files.filter((f) => f.name.startsWith(`${selectedFolderPath}/`) && f.name.endsWith(".md")).length
    : 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Layout>
      <div className="h-full flex overflow-hidden">
        {/* LHS tree */}
        <aside className="shrink-0 border-r border-[#d1d9e0] bg-white flex flex-col overflow-hidden" style={{ width: treeWidth }}>
          {error && (
            <div className="mx-2 mt-2 text-xs text-[#d1242f] bg-[#ffebe9] border border-[#ffcecb] rounded-md px-2 py-1.5 shrink-0">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-[#d1242f]/60 hover:text-[#d1242f]">✕</button>
            </div>
          )}
          <FileTree
            files={files}
            loading={loadingFiles}
            selectedPath={selectedPath}
            selectedFolderPath={selectedFolderPath}
            onSelectFile={(path) => void selectFile(path)}
            onSelectFolder={selectFolder}
            onCreateFolder={(path) => handleCreateFolder(path)}
            onDeleteFile={(path) => handleDeleteFile(path)}
            onDeleteFolder={(path) => handleDeleteFolder(path)}
            onRenameFile={(oldPath, newPath) => handleRename(oldPath, newPath)}
            onUploadFiles={(folderPath) => setUploadFolderPath(folderPath)}
            onGenerateFlowIdeas={(folderPath) => void handleGenerateFlowIdeas(folderPath)}
            onRefresh={loadFiles}
          />
        </aside>
        <ResizeHandle width={treeWidth} onResize={setTreeWidth} minWidth={160} maxWidth={400} />

        {/* Main content area */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {hasSelection ? (
            <>
              {/* Header bar */}
              <div className="flex items-center gap-1.5 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
                {isFileContext ? (
                  <>
                    {/* File icon */}
                    <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z" />
                    </svg>
                    {/* Parent path */}
                    {fileParentPath && (
                      <span className="text-sm text-[#656d76]">{fileParentPath}/</span>
                    )}
                    {/* Filename as clickable link */}
                    <button
                      onClick={() => setViewingContent(true)}
                      className="text-sm font-semibold text-[#0969da] hover:underline"
                    >
                      {fileDisplayName}
                    </button>
                  </>
                ) : (
                  <>
                    {/* Folder icon */}
                    <svg className="w-4 h-4 text-[#9a6700] shrink-0" fill="currentColor" viewBox="0 0 16 16">
                      <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
                    </svg>
                    <span className="text-sm font-semibold text-[#1f2328]">{selectedFolderPath}</span>
                    <span className="text-xs text-[#656d76]">
                      ({specFileCount} spec file{specFileCount !== 1 ? "s" : ""})
                    </span>
                  </>
                )}
              </div>

              {/* Content area — either markdown viewer or workshop */}
              {viewingContent && isFileContext ? (
                /* Markdown content viewer (replaces workshop when filename link is clicked) */
                <div className="flex-1 flex flex-col overflow-hidden">
                  <div className="flex items-center px-4 py-1.5 border-b border-[#d1d9e0] bg-white shrink-0">
                    <span className="text-xs text-[#656d76]">Viewing spec content</span>
                    <div className="flex-1" />
                    <button
                      onClick={() => setViewingContent(false)}
                      className="text-xs text-[#656d76] hover:text-[#1f2328] px-2 py-1 rounded-md hover:bg-[#eef1f6] border border-transparent hover:border-[#d1d9e0] transition-colors"
                    >
                      Close
                    </button>
                  </div>
                  {loadingContent ? (
                    <div className="flex-1 flex items-center justify-center text-[#656d76] text-sm">Loading…</div>
                  ) : (
                    <MarkdownViewer path={selectedPath!} content={content} />
                  )}
                </div>
              ) : showWorkshop ? (
                /* Three-column workshop: Ideas | Flows | Detail */
                <div className="flex-1 flex overflow-hidden">
                  {/* Column 1 — Ideas */}
                  <div className="shrink-0 border-r border-[#d1d9e0] flex flex-col overflow-hidden" style={{ width: ideasWidth }}>
                    <FlowIdeasPanel
                      ideas={ideas.length > 0 ? ideas : null}
                      usage={ideasUsage}
                      loading={ideasLoading}
                      error={ideasError}
                      rawText={ideasRawText}
                      selectedIds={selectedIdeaIds}
                      activeIdeaId={activeIdeaId}
                      onToggleSelect={toggleIdeaSelect}
                      onSelectAll={selectAllIdeas}
                      onDeselectAll={deselectAllIdeas}
                      onGenerateFlows={handleGenerateFlows}
                      onGenerateMore={handleGenerateMoreIdeas}
                      onClickIdea={handleClickIdea}
                      generatingFlows={generatingFlows}
                    />
                  </div>
                  <ResizeHandle width={ideasWidth} onResize={setIdeasWidth} minWidth={200} maxWidth={500} />

                  {/* Column 2 — Flows */}
                  <div className="shrink-0 border-r border-[#d1d9e0] flex flex-col overflow-hidden" style={{ width: flowsWidth }}>
                    <FlowsPanel
                      flows={generatedFlows}
                      ideas={ideas}
                      generating={generatingFlows}
                      progress={flowProgress}
                      activeFlowId={activeFlowId}
                      onClickFlow={handleClickFlow}
                      onDownloadFlow={downloadFlow}
                      onDownloadAll={downloadAllFlows}
                    />
                  </div>
                  <ResizeHandle width={flowsWidth} onResize={setFlowsWidth} minWidth={180} maxWidth={500} />

                  {/* Column 3 — Detail (takes remaining space) */}
                  <div className="flex-1 flex flex-col overflow-hidden min-w-[200px]">
                    <DetailPanel
                      selectedIdea={selectedIdea}
                      selectedFlow={selectedFlow}
                      onDownloadFlow={downloadFlow}
                    />
                  </div>
                </div>
              ) : (
                /* Generate Ideas landing */
                <div className="flex-1 flex items-center justify-center bg-white">
                  <div className="text-center space-y-4 max-w-sm">
                    <div className="w-14 h-14 rounded-full bg-[#0969da]/10 flex items-center justify-center mx-auto">
                      <svg className="w-7 h-7 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                      </svg>
                    </div>
                    <div>
                      <p className="text-sm font-medium text-[#1f2328] mb-1">Generate test flow ideas</p>
                      <p className="text-sm text-[#656d76]">
                        {isFileContext
                          ? "AI will analyze this spec file and suggest test scenarios."
                          : "AI will analyze all spec files in this folder and suggest test scenarios."}
                      </p>
                    </div>
                    <button
                      onClick={() => void handleGenerateFlowIdeas(activePath!)}
                      className="inline-flex items-center gap-2 bg-[#0969da] hover:bg-[#0860ca] text-white text-sm font-medium rounded-md px-4 py-2 transition-colors border border-[#0969da]/80"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      Generate ideas
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* Nothing selected — empty state */
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2">
                <svg className="w-12 h-12 mx-auto text-[#d1d9e0]" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm text-[#656d76]">Select a file or folder</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Upload modal */}
      {uploadFolderPath !== null && (
        <FileUploadModal
          folderPath={uploadFolderPath}
          onUpload={handleUpload}
          onClose={() => setUploadFolderPath(null)}
        />
      )}
    </Layout>
  );
}

// ── Build prompt for flow XML generation ──────────────────────────────────────

function buildFlowPrompt(idea: FlowIdea): string {
  const steps = idea.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n");
  return `Create a detailed test flow XML for the following test scenario:

Title: ${idea.title}
Description: ${idea.description}
Complexity: ${idea.complexity}
Entities involved: ${idea.entities.join(", ")}

Expected steps:
${steps}

Generate the complete flow XML with proper step IDs, request bodies, path parameters, captures, and assertions. Include setup and teardown steps where needed (e.g., create category before article, delete in reverse order).`;
}
