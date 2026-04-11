import { useRef, useState } from "react";
import type { SpecFileItem } from "../../lib/api/specFilesApi";

// ── Tree data model ───────────────────────────────────────────────────────────

export interface FileNode {
  type: "file";
  name: string;
  path: string;
  size: number;
}

export interface FolderNode {
  type: "folder";
  name: string;
  path: string; // full prefix, e.g. "v3/articles"
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

/** Build a nested tree from flat blob list. Hides .keep sentinel files. */
export function buildTree(files: SpecFileItem[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.name.split("/");
    let level = root;
    let prefix = "";

    for (let i = 0; i < parts.length - 1; i++) {
      prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
      let folder = level.find((n): n is FolderNode => n.type === "folder" && n.name === parts[i]);
      if (!folder) {
        folder = { type: "folder", name: parts[i], path: prefix, children: [] };
        level.push(folder);
      }
      level = folder.children;
    }

    const filename = parts[parts.length - 1];
    if (filename && filename !== ".keep") {
      level.push({ type: "file", name: filename, path: file.name, size: file.size });
    }
  }

  return sortLevel(root);
}

function sortLevel(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .sort((a, b) => {
      if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
      return a.name.localeCompare(b.name);
    })
    .map((n) => (n.type === "folder" ? { ...n, children: sortLevel(n.children) } : n));
}

// ── File icon helpers ─────────────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "xml")
    return (
      <svg className="w-3.5 h-3.5 text-orange-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.379 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
      </svg>
    );
  return (
    <svg className="w-3.5 h-3.5 text-blue-400 shrink-0" fill="currentColor" viewBox="0 0 20 20">
      <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.379 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
    </svg>
  );
}

// ── Inline input (create / rename) ────────────────────────────────────────────

interface InlineInputProps {
  defaultValue?: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}

function InlineInput({ defaultValue = "", onCommit, onCancel }: InlineInputProps) {
  const [value, setValue] = useState(defaultValue);
  const ref = useRef<HTMLInputElement>(null);

  return (
    <input
      ref={ref}
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) { onCommit(value.trim()); }
        if (e.key === "Escape") { onCancel(); }
        e.stopPropagation();
      }}
      onBlur={() => { if (value.trim()) onCommit(value.trim()); else onCancel(); }}
      className="flex-1 min-w-0 text-xs border border-blue-400 rounded px-1 py-0.5 outline-none bg-white text-gray-800"
    />
  );
}

// ── Tree node rendering ───────────────────────────────────────────────────────

interface NodeProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  expandedFolders: Set<string>;
  renamingPath: string | null;
  creatingUnder: string | null; // folder path where new item is being created
  creatingType: "file" | "folder" | null;
  onSelect: (path: string) => void;
  onToggle: (path: string) => void;
  onRenameStart: (path: string) => void;
  onRenameCommit: (node: TreeNode, newName: string) => void;
  onRenameCancel: () => void;
  onDelete: (node: TreeNode) => void;
  onCreateCommit: (parentPath: string, name: string, type: "file" | "folder") => void;
  onCreateCancel: () => void;
}

function TreeNodeRow({
  node, depth, selectedPath, expandedFolders, renamingPath,
  creatingUnder, creatingType,
  onSelect, onToggle, onRenameStart, onRenameCommit, onRenameCancel,
  onDelete, onCreateCommit, onCreateCancel,
}: NodeProps) {
  const indent = depth * 12;
  const isSelected = node.path === selectedPath;
  const isExpanded = node.type === "folder" && expandedFolders.has(node.path);
  const isRenaming = node.path === renamingPath;

  return (
    <>
      <div
        className={`group flex items-center gap-1 py-0.5 pr-1 cursor-pointer select-none text-xs rounded mx-1 ${
          isSelected ? "bg-blue-600 text-white" : "text-gray-700 hover:bg-gray-100"
        }`}
        style={{ paddingLeft: indent + 4 }}
        onClick={() => {
          if (node.type === "folder") onToggle(node.path);
          else onSelect(node.path);
        }}
      >
        {/* Expand/collapse arrow for folders */}
        {node.type === "folder" ? (
          <svg
            className={`w-3 h-3 shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""} ${isSelected ? "text-white" : "text-gray-400"}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {node.type === "folder" ? (
          <svg className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-yellow-300" : "text-yellow-500"}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
          </svg>
        ) : (
          <FileIcon name={node.name} />
        )}

        {/* Name or rename input */}
        {isRenaming ? (
          <InlineInput
            defaultValue={node.name}
            onCommit={(name) => onRenameCommit(node, name)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="flex-1 truncate">{node.name}</span>
        )}

        {/* Hover action buttons */}
        {!isRenaming && (
          <span className={`flex items-center gap-0.5 shrink-0 ${isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            <button
              title="Rename"
              onClick={(e) => { e.stopPropagation(); onRenameStart(node.path); }}
              className={`rounded p-0.5 ${isSelected ? "hover:bg-blue-500" : "hover:bg-gray-200"}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
              </svg>
            </button>
            <button
              title="Delete"
              onClick={(e) => { e.stopPropagation(); onDelete(node); }}
              className={`rounded p-0.5 ${isSelected ? "hover:bg-red-500" : "hover:bg-red-100 text-red-500"}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        )}
      </div>

      {/* Children */}
      {node.type === "folder" && isExpanded && (
        <>
          {node.children.map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              expandedFolders={expandedFolders}
              renamingPath={renamingPath}
              creatingUnder={creatingUnder}
              creatingType={creatingType}
              onSelect={onSelect}
              onToggle={onToggle}
              onRenameStart={onRenameStart}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDelete={onDelete}
              onCreateCommit={onCreateCommit}
              onCreateCancel={onCreateCancel}
            />
          ))}
          {/* Inline create row */}
          {creatingUnder === node.path && creatingType && (
            <div className="flex items-center gap-1 py-0.5 pr-1 mx-1" style={{ paddingLeft: (depth + 1) * 12 + 4 }}>
              <span className="w-3 shrink-0" />
              {creatingType === "folder" ? (
                <svg className="w-3.5 h-3.5 shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5 shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.379 2H4.5Z" clipRule="evenodd" />
                </svg>
              )}
              <InlineInput
                onCommit={(name) => onCreateCommit(node.path, name, creatingType)}
                onCancel={onCreateCancel}
              />
            </div>
          )}
        </>
      )}
    </>
  );
}

// ── Main FileTree component ───────────────────────────────────────────────────

interface FileTreeProps {
  files: SpecFileItem[];
  loading: boolean;
  selectedPath: string | null;
  onSelectFile: (path: string) => void;
  onCreateFile: (path: string) => Promise<void>;
  onCreateFolder: (path: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<void>;
  onRefresh: () => void;
}

export function FileTree({
  files, loading, selectedPath,
  onSelectFile, onCreateFile, onCreateFolder,
  onDeleteFile, onDeleteFolder, onRenameFile, onRefresh,
}: FileTreeProps) {
  const tree = buildTree(files);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(files.map((f) => f.name.split("/").slice(0, -1).join("/")).filter(Boolean))
  );
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [creatingType, setCreatingType] = useState<"file" | "folder" | null>(null);

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function startCreate(type: "file" | "folder") {
    // Create under the currently selected folder (or the folder containing selected file)
    let parent = "";
    if (selectedPath) {
      const parts = selectedPath.split("/");
      // If selected is a file, parent is its containing folder
      const isFile = files.some((f) => f.name === selectedPath);
      parent = isFile ? parts.slice(0, -1).join("/") : selectedPath;
    }
    setCreatingUnder(parent || "__root__");
    setCreatingType(type);
    // Ensure the parent folder is expanded
    if (parent) {
      setExpandedFolders((prev) => new Set([...prev, parent]));
    }
  }

  async function handleCreateCommit(parentPath: string, name: string, type: "file" | "folder") {
    const fullPath = parentPath && parentPath !== "__root__"
      ? `${parentPath}/${name}`
      : name;
    setCreatingUnder(null);
    setCreatingType(null);
    if (type === "folder") {
      await onCreateFolder(fullPath);
    } else {
      await onCreateFile(fullPath);
    }
  }

  async function handleRenameCommit(node: TreeNode, newName: string) {
    setRenamingPath(null);
    const parts = node.path.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    if (newPath === node.path) return;
    await onRenameFile(node.path, newPath);
  }

  async function handleDelete(node: TreeNode) {
    const label = node.type === "folder"
      ? `Delete folder "${node.name}" and all its contents?`
      : `Delete "${node.name}"?`;
    if (!confirm(label)) return;
    if (node.type === "folder") {
      await onDeleteFolder(node.path);
    } else {
      await onDeleteFile(node.path);
    }
  }

  // Root-level create row
  const showRootCreate = creatingUnder === "__root__" && creatingType;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <button
          onClick={() => startCreate("folder")}
          title="New Folder"
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded px-1.5 py-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
          Folder
        </button>
        <button
          onClick={() => startCreate("file")}
          title="New File"
          className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 hover:bg-gray-200 rounded px-1.5 py-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 0 0-3.375-3.375h-1.5A1.125 1.125 0 0 1 13.5 7.125v-1.5a3.375 3.375 0 0 0-3.375-3.375H8.25m3.75 9v6m3-3H9m1.5-12H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 0 0-9-9Z" />
          </svg>
          File
        </button>
        <div className="flex-1" />
        <button
          onClick={onRefresh}
          title="Refresh"
          disabled={loading}
          className="text-gray-400 hover:text-gray-700 disabled:opacity-40 rounded p-1 hover:bg-gray-200 transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>

      {/* Tree */}
      <div className="flex-1 overflow-y-auto py-1 text-xs">
        {loading && files.length === 0 && (
          <p className="text-gray-400 text-center py-8">Loading…</p>
        )}
        {!loading && tree.length === 0 && !showRootCreate && (
          <div className="text-center py-8 px-4">
            <p className="text-gray-400 text-xs">No files yet.</p>
            <p className="text-gray-400 text-xs mt-1">Use + Folder or + File to get started.</p>
          </div>
        )}

        {/* Root-level inline create */}
        {showRootCreate && (
          <div className="flex items-center gap-1 py-0.5 pr-1 mx-1 pl-1">
            <span className="w-3 shrink-0" />
            {creatingType === "folder" ? (
              <svg className="w-3.5 h-3.5 shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5 shrink-0 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.379 2H4.5Z" clipRule="evenodd" />
              </svg>
            )}
            <InlineInput
              onCommit={(name) => void handleCreateCommit("__root__", name, creatingType!)}
              onCancel={() => { setCreatingUnder(null); setCreatingType(null); }}
            />
          </div>
        )}

        {tree.map((node) => (
          <TreeNodeRow
            key={node.path}
            node={node}
            depth={0}
            selectedPath={selectedPath}
            expandedFolders={expandedFolders}
            renamingPath={renamingPath}
            creatingUnder={creatingUnder}
            creatingType={creatingType}
            onSelect={onSelectFile}
            onToggle={toggleFolder}
            onRenameStart={(path) => setRenamingPath(path)}
            onRenameCommit={(node, name) => void handleRenameCommit(node, name)}
            onRenameCancel={() => setRenamingPath(null)}
            onDelete={(node) => void handleDelete(node)}
            onCreateCommit={(parent, name, type) => void handleCreateCommit(parent, name, type)}
            onCreateCancel={() => { setCreatingUnder(null); setCreatingType(null); }}
          />
        ))}
      </div>
    </div>
  );
}
