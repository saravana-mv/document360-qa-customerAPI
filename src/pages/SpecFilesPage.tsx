import { useCallback, useEffect, useRef, useState } from "react";
import { Layout } from "../components/common/Layout";
import { FileTree } from "../components/specfiles/FileTree";
import { MarkdownEditor } from "../components/specfiles/MarkdownEditor";
import {
  listSpecFiles,
  getSpecFileContent,
  uploadSpecFile,
  deleteSpecFile,
  renameSpecFile,
  type SpecFileItem,
} from "../lib/api/specFilesApi";
import { useAuthGuard } from "../hooks/useAuthGuard";

const NEW_FILE_TEMPLATE = `# New Document

Start writing here.
`;

export function SpecFilesPage() {
  useAuthGuard();

  const [files, setFiles] = useState<SpecFileItem[]>([]);
  const [loadingFiles, setLoadingFiles] = useState(false);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [loadingContent, setLoadingContent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingSelectRef = useRef<string | null>(null);

  const dirty = content !== savedContent;

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
    if (dirty) {
      if (!confirm("You have unsaved changes. Discard and open another file?")) return;
    }
    setSelectedPath(path);
    setContent("");
    setSavedContent("");
    setLoadingContent(true);
    try {
      const text = await getSpecFileContent(path);
      setContent(text);
      setSavedContent(text);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingContent(false);
    }
  }

  // ── Save ───────────────────────────────────────────────────────────────────

  async function handleSave() {
    if (!selectedPath) return;
    setSaving(true);
    try {
      await uploadSpecFile(selectedPath, content);
      setSavedContent(content);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  function handleDiscard() {
    setContent(savedContent);
  }

  // ── Create file ────────────────────────────────────────────────────────────

  async function handleCreateFile(path: string) {
    const fullPath = path.endsWith(".md") || path.endsWith(".xml") ? path : `${path}.md`;
    setError(null);
    try {
      await uploadSpecFile(fullPath, NEW_FILE_TEMPLATE);
      await loadFiles();
      // Select the new file
      pendingSelectRef.current = fullPath;
      setSelectedPath(fullPath);
      setContent(NEW_FILE_TEMPLATE);
      setSavedContent(NEW_FILE_TEMPLATE);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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

  // ── Delete file ────────────────────────────────────────────────────────────

  async function handleDeleteFile(path: string) {
    setError(null);
    try {
      await deleteSpecFile(path);
      if (selectedPath === path) {
        setSelectedPath(null);
        setContent("");
        setSavedContent("");
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
        setSavedContent("");
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
      // For folders, rename all blobs under the prefix
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
            onCreateFile={(path) => handleCreateFile(path)}
            onCreateFolder={(path) => handleCreateFolder(path)}
            onDeleteFile={(path) => handleDeleteFile(path)}
            onDeleteFolder={(path) => handleDeleteFolder(path)}
            onRenameFile={(oldPath, newPath) => handleRename(oldPath, newPath)}
            onRefresh={loadFiles}
          />
        </aside>

        {/* RHS editor */}
        <div className="flex-1 flex flex-col overflow-hidden bg-white">
          {loadingContent && (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">Loading…</div>
          )}
          {!loadingContent && selectedPath && (
            <MarkdownEditor
              path={selectedPath}
              content={content}
              dirty={dirty}
              saving={saving}
              onChange={setContent}
              onSave={() => void handleSave()}
              onDiscard={handleDiscard}
            />
          )}
          {!loadingContent && !selectedPath && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-2 text-gray-300">
                <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" strokeWidth={0.8} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
                </svg>
                <p className="text-sm">Select a file to edit</p>
                <p className="text-xs">or use + File to create a new one</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
