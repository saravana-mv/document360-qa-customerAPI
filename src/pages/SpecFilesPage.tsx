import { useCallback, useEffect, useState } from "react";
import { Layout } from "../components/common/Layout";
import { FileTree } from "../components/specfiles/FileTree";
import { MarkdownViewer } from "../components/specfiles/MarkdownViewer";
import { FileUploadModal } from "../components/specfiles/FileUploadModal";
import { FlowIdeasPanel } from "../components/specfiles/FlowIdeasPanel";
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
import { useAuthGuard } from "../hooks/useAuthGuard";

export function SpecFilesPage() {
  useAuthGuard();

  const [files, setFiles] = useState<SpecFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadFolderPath, setUploadFolderPath] = useState<string | null>(null);

  // Flow ideas state
  const [flowIdeasFolder, setFlowIdeasFolder] = useState<string | null>(null);
  const [flowIdeas, setFlowIdeas] = useState<FlowIdea[] | null>(null);
  const [flowIdeasUsage, setFlowIdeasUsage] = useState<FlowIdeasUsage | null>(null);
  const [flowIdeasLoading, setFlowIdeasLoading] = useState(false);
  const [flowIdeasError, setFlowIdeasError] = useState<string | null>(null);
  const [flowIdeasRawText, setFlowIdeasRawText] = useState<string | undefined>();

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
    // Close flow ideas panel when selecting a file
    setFlowIdeasFolder(null);
    setSelectedPath(path);
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

  // ── Create folder (creates a .keep sentinel blob) ─────────────────────────

  async function handleCreateFolder(folderPath: string) {
    setError(null);
    try {
      await uploadSpecFile(`${folderPath}/.keep`, "");
      await loadFiles();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  // ── Upload files ───────────────────────────────────────────────────────────

  async function handleUpload(name: string, fileContent: string, contentType: string) {
    await uploadSpecFile(name, fileContent, contentType);
    await loadFiles();
  }

  // ── Delete file ────────────────────────────────────────────────────────────

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

  // ── Delete folder (delete all blobs under prefix) ─────────────────────────

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

  // ── Rename ─────────────────────────────────────────────────────────────────

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
    setFlowIdeasFolder(folderPath);
    setFlowIdeas(null);
    setFlowIdeasUsage(null);
    setFlowIdeasError(null);
    setFlowIdeasRawText(undefined);
    setFlowIdeasLoading(true);
    // Clear file viewer when showing flow ideas
    setSelectedPath(null);
    setContent("");
    try {
      const result = await generateFlowIdeas(folderPath);
      setFlowIdeas(result.ideas);
      setFlowIdeasUsage(result.usage);
      if (result.parseError && result.rawText) {
        setFlowIdeasRawText(result.rawText);
      }
    } catch (e) {
      setFlowIdeasError(e instanceof Error ? e.message : String(e));
    } finally {
      setFlowIdeasLoading(false);
    }
  }

  // ── Determine RHS content ─────────────────────────────────────────────────

  const showFlowIdeas = flowIdeasFolder !== null;
  const showViewer = !showFlowIdeas && selectedPath && !loadingContent;
  const showEmpty = !showFlowIdeas && !selectedPath && !loadingContent;

  // ── Render ─────────────────────────────────────────────────────────────────

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
            onSelectFile={(path) => void selectFile(path)}
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
          {loadingContent && !showFlowIdeas && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
          {showFlowIdeas && (
            <FlowIdeasPanel
              folderPath={flowIdeasFolder}
              ideas={flowIdeas}
              usage={flowIdeasUsage}
              loading={flowIdeasLoading}
              error={flowIdeasError}
              rawText={flowIdeasRawText}
              onClose={() => setFlowIdeasFolder(null)}
            />
          )}
          {showViewer && (
            <MarkdownViewer path={selectedPath!} content={content} />
          )}
          {showEmpty && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2 text-gray-300">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm">Select a file to view</p>
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
