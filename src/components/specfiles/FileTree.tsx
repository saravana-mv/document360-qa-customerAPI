import { useEffect, useRef, useState } from "react";
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
  path: string;
  children: TreeNode[];
}

export type TreeNode = FileNode | FolderNode;

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

// ── Drop validation ───────────────────────────────────────────────────────────

/** Returns the parent folder path of a node ("" means root level). */
function parentOf(path: string): string {
  const idx = path.lastIndexOf("/");
  return idx === -1 ? "" : path.slice(0, idx);
}

/**
 * Can we drop `drag` onto `targetFolderPath`?
 * targetFolderPath: "" = root, otherwise a folder path.
 */
function canDrop(drag: TreeNode, targetFolderPath: string): boolean {
  // Can't drop a folder into itself
  if (drag.type === "folder" && targetFolderPath === drag.path) return false;
  // Can't drop a folder into one of its own descendants
  if (drag.type === "folder" && targetFolderPath.startsWith(drag.path + "/")) return false;
  // Already in this location — no-op
  if (parentOf(drag.path) === targetFolderPath) return false;
  return true;
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function FileIcon({ name }: { name: string }) {
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "xml" || ext === "xsd")
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

function InlineInput({ defaultValue = "", onCommit, onCancel }: {
  defaultValue?: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) onCommit(value.trim());
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
      onBlur={() => { if (value.trim()) onCommit(value.trim()); else onCancel(); }}
      className="flex-1 min-w-0 text-[13px] border border-[#0969da] rounded px-1 py-0.5 outline-none bg-white text-[#1f2328]"
    />
  );
}

// ── Folder context menu ───────────────────────────────────────────────────────

interface FolderMenuProps {
  folderPath: string;
  isSelected: boolean;
  onNewSubfolder: () => void;
  onUploadFiles: () => void;
  onGenerateFlowIdeas: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function FolderContextMenu({ folderPath: _, isSelected, onNewSubfolder, onUploadFiles, onGenerateFlowIdeas, onRename, onDelete }: FolderMenuProps) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (!menuRef.current?.contains(e.target as Node) && !btnRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  function action(fn: () => void) {
    setOpen(false);
    fn();
  }

  return (
    <div className="relative shrink-0">
      <button
        ref={btnRef}
        title="More actions"
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        className={`rounded p-0.5 transition-colors ${
          isSelected ? "hover:bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#eef1f6] hover:text-[#1f2328]"
        }`}
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path d="M10 3a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM10 8.5a1.5 1.5 0 1 1 0 3 1.5 1.5 0 0 1 0-3ZM11.5 15.5a1.5 1.5 0 1 0-3 0 1.5 1.5 0 0 0 3 0Z" />
        </svg>
      </button>

      {open && (
        <div
          ref={menuRef}
          className="absolute right-0 top-full mt-0.5 z-50 bg-white border border-[#d1d9e0] rounded shadow-lg py-0.5 min-w-36"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => action(onNewSubfolder)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1f2328] hover:bg-[#f6f8fa]"
          >
            <svg className="w-3.5 h-3.5 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
            </svg>
            New subfolder
          </button>
          <button
            onClick={() => action(onUploadFiles)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1f2328] hover:bg-[#f6f8fa]"
          >
            <svg className="w-3.5 h-3.5 text-blue-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5m-13.5-9L12 3m0 0 4.5 4.5M12 3v13.5" />
            </svg>
            Upload files
          </button>
          <button
            onClick={() => action(onGenerateFlowIdeas)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1f2328] hover:bg-[#f6f8fa]"
          >
            <svg className="w-3.5 h-3.5 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09Z" />
            </svg>
            Generate Flow Ideas (AI)
          </button>
          <div className="border-t border-[#d8dee4] my-0.5" />
          <button
            onClick={() => action(onRename)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#1f2328] hover:bg-[#f6f8fa]"
          >
            <svg className="w-3.5 h-3.5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
            </svg>
            Rename
          </button>
          <button
            onClick={() => action(onDelete)}
            className="w-full flex items-center gap-2 px-3 py-1.5 text-[13px] text-[#d1242f] hover:bg-[#ffebe9]"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
            </svg>
            Delete folder
          </button>
        </div>
      )}
    </div>
  );
}

// ── Tree node row ─────────────────────────────────────────────────────────────

interface NodeProps {
  node: TreeNode;
  depth: number;
  selectedPath: string | null;
  selectedFolderPath: string | null;
  expandedFolders: Set<string>;
  renamingPath: string | null;
  creatingUnder: string | null;
  // Drag state
  draggingPath: string | null;
  dropTargetPath: string | null; // "" = root, folder path = that folder
  onDragStart: (node: TreeNode) => void;
  onDragOver: (e: React.DragEvent, node: TreeNode) => void;
  onDrop: (e: React.DragEvent, node: TreeNode) => void;
  onDragEnd: () => void;
  // Other
  onSelect: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onToggle: (path: string) => void;
  onRenameStart: (path: string) => void;
  onRenameCommit: (node: TreeNode, newName: string) => void;
  onRenameCancel: () => void;
  onDeleteNode: (node: TreeNode) => void;
  onStartSubfolder: (parentPath: string) => void;
  onUploadFiles: (folderPath: string) => void;
  onGenerateFlowIdeas: (folderPath: string) => void;
  onCreateCommit: (parentPath: string, name: string) => void;
  onCreateCancel: () => void;
}

function TreeNodeRow({
  node, depth, selectedPath, selectedFolderPath, expandedFolders, renamingPath,
  creatingUnder,
  draggingPath, dropTargetPath,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onSelect, onSelectFolder, onToggle, onRenameStart, onRenameCommit, onRenameCancel,
  onDeleteNode, onStartSubfolder, onUploadFiles, onGenerateFlowIdeas,
  onCreateCommit, onCreateCancel,
}: NodeProps) {
  const indent = depth * 12;
  const isSelected = node.type === "file" ? node.path === selectedPath : node.path === selectedFolderPath;
  const isExpanded = node.type === "folder" && expandedFolders.has(node.path);
  const isRenaming = node.path === renamingPath;
  const isDragging = node.path === draggingPath;
  const isDropTarget = node.type === "folder" && dropTargetPath === node.path;

  return (
    <>
      <div
        draggable={!isRenaming}
        onDragStart={(e) => { e.stopPropagation(); onDragStart(node); }}
        onDragOver={(e) => { e.stopPropagation(); onDragOver(e, node); }}
        onDrop={(e) => { e.stopPropagation(); onDrop(e, node); }}
        onDragEnd={(e) => { e.stopPropagation(); onDragEnd(); }}
        className={`group flex items-center gap-1 py-[3px] pr-1 cursor-pointer select-none text-[13px] rounded-md mx-1 transition-colors ${
          isDragging ? "opacity-40" : ""
        } ${
          isDropTarget
            ? "ring-2 ring-[#0969da]/30 bg-[#ddf4ff] text-[#1f2328]"
            : isSelected
              ? "bg-[#0969da] text-white"
              : "text-[#1f2328] hover:bg-[#eef1f6]"
        }`}
        style={{ paddingLeft: indent + 4 }}
        onClick={() => {
          if (node.type === "folder") onSelectFolder(node.path);
          else onSelect(node.path);
        }}
      >
        {/* Expand arrow — clicking only toggles expand/collapse */}
        {node.type === "folder" ? (
          <svg
            className={`w-3 h-3 shrink-0 transition-transform cursor-pointer ${isExpanded ? "rotate-90" : ""} ${isSelected && !isDropTarget ? "text-white/70" : "text-[#656d76]"}`}
            fill="currentColor" viewBox="0 0 20 20"
            onClick={(e) => { e.stopPropagation(); onToggle(node.path); }}
          >
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {node.type === "folder" ? (
          <svg className={`w-3.5 h-3.5 shrink-0 ${isSelected && !isDropTarget ? "text-yellow-300" : "text-yellow-500"}`} fill="currentColor" viewBox="0 0 20 20">
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

        {/* Actions */}
        {!isRenaming && (
          <span className={`flex items-center gap-0.5 shrink-0 ${isSelected && !isDropTarget ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {node.type === "folder" ? (
              <FolderContextMenu
                folderPath={node.path}
                isSelected={isSelected && !isDropTarget}
                onNewSubfolder={() => onStartSubfolder(node.path)}
                onUploadFiles={() => onUploadFiles(node.path)}
                onGenerateFlowIdeas={() => onGenerateFlowIdeas(node.path)}
                onRename={() => onRenameStart(node.path)}
                onDelete={() => onDeleteNode(node)}
              />
            ) : (
              <>
                <button
                  title="Rename"
                  onClick={(e) => { e.stopPropagation(); onRenameStart(node.path); }}
                  className={`rounded p-0.5 ${isSelected ? "hover:bg-[#0969da]" : "hover:bg-[#eef1f6]"}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="m16.862 4.487 1.687-1.688a1.875 1.875 0 1 1 2.652 2.652L10.582 16.07a4.5 4.5 0 0 1-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 0 1 1.13-1.897l8.932-8.931Z" />
                  </svg>
                </button>
                <button
                  title="Delete"
                  onClick={(e) => { e.stopPropagation(); onDeleteNode(node); }}
                  className={`rounded p-0.5 ${isSelected ? "hover:bg-red-500" : "hover:bg-red-100 text-red-500"}`}
                >
                  <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              </>
            )}
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
              selectedFolderPath={selectedFolderPath}
              expandedFolders={expandedFolders}
              renamingPath={renamingPath}
              creatingUnder={creatingUnder}
              draggingPath={draggingPath}
              dropTargetPath={dropTargetPath}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onSelect={onSelect}
              onSelectFolder={onSelectFolder}
              onToggle={onToggle}
              onRenameStart={onRenameStart}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDeleteNode={onDeleteNode}
              onStartSubfolder={onStartSubfolder}
              onUploadFiles={onUploadFiles}
              onGenerateFlowIdeas={onGenerateFlowIdeas}
              onCreateCommit={onCreateCommit}
              onCreateCancel={onCreateCancel}
            />
          ))}
          {/* Inline subfolder create row */}
          {creatingUnder === node.path && (
            <div className="flex items-center gap-1 py-0.5 pr-1 mx-1" style={{ paddingLeft: (depth + 1) * 12 + 4 }}>
              <span className="w-3 shrink-0" />
              <svg className="w-3.5 h-3.5 shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
              </svg>
              <InlineInput
                onCommit={(name) => onCreateCommit(node.path, name)}
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
  selectedFolderPath: string | null;
  onSelectFile: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onCreateFolder: (path: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<void>;
  onUploadFiles: (folderPath: string) => void;
  onGenerateFlowIdeas: (folderPath: string) => void;
  onRefresh: () => void;
}

export function FileTree({
  files, loading, selectedPath, selectedFolderPath,
  onSelectFile, onSelectFolder, onCreateFolder, onDeleteFile, onDeleteFolder, onRenameFile,
  onUploadFiles, onGenerateFlowIdeas, onRefresh,
}: FileTreeProps) {
  const tree = buildTree(files);

  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(
    () => new Set(files.map((f) => f.name.split("/").slice(0, -1).join("/")).filter(Boolean))
  );
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);

  // Drag-and-drop state
  const [draggingNode, setDraggingNode] = useState<TreeNode | null>(null);
  // dropTargetPath: "" = root zone, folder path = that folder, null = no active target
  const [dropTargetPath, setDropTargetPath] = useState<string | null>(null);
  // Auto-expand timer ref
  const expandTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function clearExpandTimer() {
    if (expandTimerRef.current !== null) {
      clearTimeout(expandTimerRef.current);
      expandTimerRef.current = null;
    }
  }

  function toggleFolder(path: string) {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path); else next.add(path);
      return next;
    });
  }

  function startRootFolder() {
    setCreatingUnder("__root__");
  }

  function startSubfolder(parentPath: string) {
    setCreatingUnder(parentPath);
    setExpandedFolders((prev) => new Set([...prev, parentPath]));
  }

  async function handleCreateCommit(parentPath: string, name: string) {
    const fullPath = parentPath && parentPath !== "__root__"
      ? `${parentPath}/${name}`
      : name;
    setCreatingUnder(null);
    await onCreateFolder(fullPath);
  }

  async function handleRenameCommit(node: TreeNode, newName: string) {
    setRenamingPath(null);
    const parts = node.path.split("/");
    parts[parts.length - 1] = newName;
    const newPath = parts.join("/");
    if (newPath !== node.path) await onRenameFile(node.path, newPath);
  }

  async function handleDeleteNode(node: TreeNode) {
    const label = node.type === "folder"
      ? `Delete folder "${node.name}" and all its contents?`
      : `Delete "${node.name}"?`;
    if (!confirm(label)) return;
    if (node.type === "folder") await onDeleteFolder(node.path);
    else await onDeleteFile(node.path);
  }

  // ── Drag handlers ───────────────────────────────────────────────────────────

  function handleDragStart(node: TreeNode) {
    setDraggingNode(node);
    setDropTargetPath(null);
  }

  function handleDragOver(e: React.DragEvent, node: TreeNode) {
    if (!draggingNode) return;

    // Only folders are valid drop targets
    if (node.type !== "folder") {
      // Allow drop on the parent folder of this file by targeting its parent
      e.dataTransfer.dropEffect = "none";
      return;
    }

    if (!canDrop(draggingNode, node.path)) {
      e.dataTransfer.dropEffect = "none";
      return;
    }

    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetPath(node.path);

    // Auto-expand collapsed folders after 600 ms
    if (!expandedFolders.has(node.path)) {
      clearExpandTimer();
      expandTimerRef.current = setTimeout(() => {
        setExpandedFolders((prev) => new Set([...prev, node.path]));
      }, 600);
    } else {
      clearExpandTimer();
    }
  }

  function handleDrop(e: React.DragEvent, node: TreeNode) {
    e.preventDefault();
    if (!draggingNode || node.type !== "folder") return;
    const target = node.path;
    if (!canDrop(draggingNode, target)) return;
    void doMove(draggingNode, target);
    setDraggingNode(null);
    setDropTargetPath(null);
    clearExpandTimer();
  }

  function handleDragEnd() {
    setDraggingNode(null);
    setDropTargetPath(null);
    clearExpandTimer();
  }

  // Root zone drag handlers
  function handleRootDragOver(e: React.DragEvent) {
    if (!draggingNode) return;
    if (!canDrop(draggingNode, "")) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDropTargetPath("");
    clearExpandTimer();
  }

  function handleRootDrop(e: React.DragEvent) {
    e.preventDefault();
    if (!draggingNode || !canDrop(draggingNode, "")) return;
    void doMove(draggingNode, "");
    setDraggingNode(null);
    setDropTargetPath(null);
    clearExpandTimer();
  }

  async function doMove(node: TreeNode, targetFolderPath: string) {
    const newPath = targetFolderPath ? `${targetFolderPath}/${node.name}` : node.name;
    await onRenameFile(node.path, newPath);
    // Expand target after move
    if (targetFolderPath) {
      setExpandedFolders((prev) => new Set([...prev, targetFolderPath]));
    }
  }

  const sharedProps = {
    selectedPath,
    selectedFolderPath,
    expandedFolders,
    renamingPath,
    creatingUnder,
    draggingPath: draggingNode?.path ?? null,
    dropTargetPath,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
    onSelect: onSelectFile,
    onSelectFolder: onSelectFolder,
    onToggle: toggleFolder,
    onRenameStart: (path: string) => setRenamingPath(path),
    onRenameCommit: (n: TreeNode, name: string) => void handleRenameCommit(n, name),
    onRenameCancel: () => setRenamingPath(null),
    onDeleteNode: (n: TreeNode) => void handleDeleteNode(n),
    onStartSubfolder: startSubfolder,
    onUploadFiles,
    onGenerateFlowIdeas,
    onCreateCommit: (parent: string, name: string) => void handleCreateCommit(parent, name),
    onCreateCancel: () => setCreatingUnder(null),
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v2.25a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 16.5v-2.25" />
        </svg>
        <span className="text-[13px] font-semibold text-[#1f2328]">Spec Files</span>
        <div className="flex-1" />
        <button
          onClick={startRootFolder}
          title="New API Version"
          className="flex items-center gap-1 text-[11px] text-[#656d76] hover:text-[#1f2328] hover:bg-[#eef1f6] rounded-md px-1.5 py-1 transition-colors"
        >
          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 10.5v6m3-3H9m4.06-7.19-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
          </svg>
        </button>
        <button
          onClick={onRefresh}
          title="Refresh"
          disabled={loading}
          className="text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 rounded-md p-1 hover:bg-[#eef1f6] transition-colors"
        >
          <svg className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
          </svg>
        </button>
      </div>

      {/* Tree — acts as root drop zone when dragging */}
      <div
        className={`flex-1 overflow-y-auto py-1 text-[13px] transition-colors ${
          dropTargetPath === "" ? "bg-[#ddf4ff] ring-2 ring-inset ring-[#0969da]/30" : ""
        }`}
        onDragOver={handleRootDragOver}
        onDrop={handleRootDrop}
        onDragLeave={(e) => {
          // Only clear root highlight when leaving the whole tree area
          if (!e.currentTarget.contains(e.relatedTarget as Node)) {
            setDropTargetPath(null);
            clearExpandTimer();
          }
        }}
      >
        {loading && files.length === 0 && (
          <p className="text-[#656d76] text-center py-8">Loading…</p>
        )}
        {!loading && tree.length === 0 && !creatingUnder && (
          <div className="text-center py-8 px-4 space-y-1">
            <p className="text-[#656d76]">No files yet.</p>
            <p className="text-[#656d76]">Use <strong>New API Version</strong> to get started.</p>
          </div>
        )}

        {/* Root-level inline folder create */}
        {creatingUnder === "__root__" && (
          <div className="flex items-center gap-1 py-0.5 pr-1 mx-1 pl-1">
            <span className="w-3 shrink-0" />
            <svg className="w-3.5 h-3.5 shrink-0 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
            </svg>
            <InlineInput
              onCommit={(name) => void handleCreateCommit("__root__", name)}
              onCancel={() => setCreatingUnder(null)}
            />
          </div>
        )}

        {tree.map((node) => (
          <TreeNodeRow
            key={node.path}
            node={node}
            depth={0}
            {...sharedProps}
          />
        ))}

        {/* Root drop zone hint — shown at bottom when dragging */}
        {draggingNode && (
          <div className={`mx-2 mt-2 mb-1 rounded border-2 border-dashed px-3 py-2 text-center text-xs transition-colors ${
            dropTargetPath === ""
              ? "border-[#0969da] text-blue-500 bg-blue-50"
              : "border-[#d1d9e0] text-[#656d76]"
          }`}>
            Drop here to move to root
          </div>
        )}
      </div>
    </div>
  );
}
