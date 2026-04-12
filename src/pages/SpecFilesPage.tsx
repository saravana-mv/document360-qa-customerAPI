import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "../components/common/Layout";
import { FileTree } from "../components/specfiles/FileTree";
import { MarkdownViewer } from "../components/specfiles/MarkdownViewer";
import { FileUploadModal } from "../components/specfiles/FileUploadModal";
import { FlowIdeasPanel } from "../components/specfiles/FlowIdeasPanel";
import { FlowsPanel, type GeneratedFlow } from "../components/specfiles/FlowsPanel";
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

type RhsTab = "viewer" | "ideas" | "flows";

export function SpecFilesPage() {
  useAuthGuard();

  // ── File tree state ────────────────────────────────────────────────────────
  const [files, setFiles] = useState<SpecFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedFolderPath, setSelectedFolderPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFolderPath, setUploadFolderPath] = useState<string | null>(null);

  // ── Tab state ──────────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<RhsTab>("viewer");

  // ── Flow ideas state ───────────────────────────────────────────────────────
  const [ideasFolderPath, setIdeasFolderPath] = useState<string | null>(null);
  const [ideas, setIdeas] = useState<FlowIdea[]>([]);
  const [ideasUsage, setIdeasUsage] = useState<FlowIdeasUsage | null>(null);
  const [ideasLoading, setIdeasLoading] = useState(false);
  const [ideasError, setIdeasError] = useState<string | null>(null);
  const [ideasRawText, setIdeasRawText] = useState<string | undefined>();
  const [selectedIdeaIds, setSelectedIdeaIds] = useState<Set<string>>(new Set());

  // ── Flow generation state ──────────────────────────────────────────────────
  const [generatedFlows, setGeneratedFlows] = useState<GeneratedFlow[]>([]);
  const [generatingFlows, setGeneratingFlows] = useState(false);
  const [flowProgress, setFlowProgress] = useState<{ current: number; total: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Tab bar is visible once ideas have been generated at least once
  const showTabs = ideas.length > 0 || ideasLoading || ideasError !== null;

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
    setActiveTab("viewer");
    setSelectedPath(path);
    setSelectedFolderPath(null);
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
    setContent("");
    // If this is the same folder that already has ideas, keep existing state
    // Otherwise switch to the folder view tab
    if (path !== ideasFolderPath) {
      setActiveTab("viewer");
    }
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

  async function handleGenerateFlowIdeas(folderPath: string) {
    // Fresh generation — reset everything
    setSelectedFolderPath(folderPath);
    setSelectedPath(null);
    setIdeasFolderPath(folderPath);
    setIdeas([]);
    setIdeasUsage(null);
    setIdeasError(null);
    setIdeasRawText(undefined);
    setSelectedIdeaIds(new Set());
    setGeneratedFlows([]);
    setIdeasLoading(true);
    setActiveTab("ideas");
    try {
      const result = await generateFlowIdeas(folderPath, []);
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
    if (!ideasFolderPath) return;
    setIdeasError(null);
    setIdeasRawText(undefined);
    setIdeasLoading(true);
    // Pass existing idea titles so Claude avoids duplicates
    const existingTitles = ideas.map((i) => i.title);
    try {
      const result = await generateFlowIdeas(ideasFolderPath, existingTitles);
      if (result.ideas.length > 0) {
        // Re-number new idea IDs to avoid collisions
        const offset = ideas.length;
        const newIdeas = result.ideas.map((idea, i) => ({
          ...idea,
          id: `idea-${offset + i + 1}`,
        }));
        setIdeas((prev) => [...prev, ...newIdeas]);
      }
      // Accumulate usage
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

  // ── Generate flows from selected ideas ────────────────────────────────────

  async function handleGenerateFlows() {
    if (selectedIdeaIds.size === 0 || !ideasFolderPath) return;

    const selectedIdeas = ideas.filter((i) => selectedIdeaIds.has(i.id));

    // Get spec file names for context
    const prefix = ideasFolderPath.endsWith("/") ? ideasFolderPath : `${ideasFolderPath}/`;
    const specFileNames = files
      .filter((f) => f.name.startsWith(prefix) && f.name.endsWith(".md"))
      .map((f) => f.name);

    // Initialize flow entries
    const initialFlows: GeneratedFlow[] = selectedIdeas.map((idea) => ({
      ideaId: idea.id,
      title: idea.title,
      status: "pending" as const,
      xml: "",
    }));
    setGeneratedFlows(initialFlows);
    setGeneratingFlows(true);
    setFlowProgress({ current: 0, total: selectedIdeas.length });
    setActiveTab("flows");

    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Generate sequentially
    for (let i = 0; i < selectedIdeas.length; i++) {
      if (ctrl.signal.aborted) break;

      const idea = selectedIdeas[i];
      const prompt = buildFlowPrompt(idea);

      // Mark as generating
      setGeneratedFlows((prev) =>
        prev.map((f) => f.ideaId === idea.id ? { ...f, status: "generating" as const } : f)
      );

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

  // ── Render ─────────────────────────────────────────────────────────────────

  const ideasCount = ideas.length;
  const flowsDoneCount = generatedFlows.filter((f) => f.status === "done").length;
  const flowsTotalCount = generatedFlows.length;

  return (
    <Layout>
      <div className="h-full flex overflow-hidden">
        {/* LHS tree */}
        <aside className="w-64 shrink-0 border-r border-gray-200 bg-white flex flex-col overflow-hidden">
          <div className="flex items-center px-3 py-2 border-b border-gray-200 bg-gray-900 shrink-0">
            <span className="text-xs font-semibold text-gray-300 uppercase tracking-wide">Spec Files</span>
          </div>
          {error && (
            <div className="mx-2 mt-2 text-xs text-red-600 bg-red-50 rounded px-2 py-1 shrink-0">
              {error}
              <button onClick={() => setError(null)} className="ml-2 text-red-400 hover:text-red-600">✕</button>
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

        {/* RHS content */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {/* Folder container page */}
          {selectedFolderPath && !selectedPath ? (
            <>
              {/* Folder header */}
              <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-200 bg-gray-50 shrink-0">
                <svg className="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
                </svg>
                <span className="text-sm font-medium text-gray-800">{selectedFolderPath}</span>
                <span className="text-xs text-gray-400">
                  ({files.filter((f) => f.name.startsWith(`${selectedFolderPath}/`) && f.name.endsWith(".md")).length} spec files)
                </span>
              </div>

              {/* Tab bar for folder — Ideas / Flows (visible once ideas pipeline started) */}
              {showTabs ? (
                <div className="flex items-center border-b border-gray-200 bg-white shrink-0 px-1">
                  <TabButton
                    active={activeTab === "ideas"}
                    onClick={() => setActiveTab("ideas")}
                    badge={ideasCount > 0 ? ideasCount : undefined}
                  >
                    Ideas
                  </TabButton>
                  <TabButton
                    active={activeTab === "flows"}
                    onClick={() => setActiveTab("flows")}
                    badge={flowsTotalCount > 0 ? `${flowsDoneCount}/${flowsTotalCount}` : undefined}
                  >
                    Flows
                  </TabButton>

                  <div className="flex-1" />
                  <button
                    onClick={() => {
                      if (generatingFlows) {
                        abortRef.current?.abort();
                      }
                      setIdeasFolderPath(null);
                      setIdeas([]);
                      setIdeasUsage(null);
                      setIdeasError(null);
                      setIdeasRawText(undefined);
                      setSelectedIdeaIds(new Set());
                      setGeneratedFlows([]);
                      setGeneratingFlows(false);
                      setFlowProgress(null);
                      setActiveTab("viewer");
                    }}
                    title="Close workshop"
                    className="text-xs text-gray-400 hover:text-gray-600 px-2 py-1 rounded hover:bg-gray-100 mr-1"
                  >
                    Close workshop
                  </button>
                </div>
              ) : null}

              {/* Folder tab content */}
              {showTabs && activeTab === "ideas" && ideasFolderPath === selectedFolderPath && (
                <FlowIdeasPanel
                  ideas={ideas.length > 0 ? ideas : null}
                  usage={ideasUsage}
                  loading={ideasLoading}
                  error={ideasError}
                  rawText={ideasRawText}
                  selectedIds={selectedIdeaIds}
                  onToggleSelect={toggleIdeaSelect}
                  onSelectAll={selectAllIdeas}
                  onDeselectAll={deselectAllIdeas}
                  onGenerateFlows={handleGenerateFlows}
                  onGenerateMore={handleGenerateMoreIdeas}
                  generatingFlows={generatingFlows}
                />
              )}

              {showTabs && activeTab === "flows" && (
                <FlowsPanel
                  flows={generatedFlows}
                  ideas={ideas}
                  generating={generatingFlows}
                  progress={flowProgress}
                />
              )}

              {/* Default folder landing — Generate Flow Ideas button */}
              {!showTabs && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-4">
                    <svg className="w-16 h-16 mx-auto text-purple-200" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z" />
                    </svg>
                    <div>
                      <p className="text-sm text-gray-500 mb-1">Analyze spec files and generate test flow ideas</p>
                      <p className="text-xs text-gray-400">AI will read all .md files in this folder and suggest test scenarios</p>
                    </div>
                    <button
                      onClick={() => void handleGenerateFlowIdeas(selectedFolderPath)}
                      className="inline-flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white text-sm font-medium rounded-lg px-5 py-2.5 transition-colors"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
                      </svg>
                      Generate Flow Ideas (AI)
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            /* File viewer / empty state */
            <>
              {loadingContent && (
                <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
              )}
              {!loadingContent && selectedPath && (
                <MarkdownViewer path={selectedPath} content={content} />
              )}
              {!loadingContent && !selectedPath && (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-2 text-gray-300">
                    <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                    </svg>
                    <p className="text-sm">Select a file or folder</p>
                  </div>
                </div>
              )}
            </>
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

// ── Tab button component ──────────────────────────────────────────────────────

function TabButton({ active, onClick, badge, children }: {
  active: boolean;
  onClick: () => void;
  badge?: number | string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
        active
          ? "border-blue-600 text-blue-600"
          : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
      }`}
    >
      {children}
      {badge !== undefined && (
        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${
          active ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-600"
        }`}>
          {badge}
        </span>
      )}
    </button>
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
