import { useEffect, useRef, useState } from "react";
import { ContextMenu, MenuIcons } from "../common/ContextMenu";
import type { MenuItem } from "../common/ContextMenu";
import type { SpecFileItem } from "../../lib/api/specFilesApi";
import { QualityScorePill } from "../common/QualityScorePill";
import type { SpecQuality } from "../../lib/spec/specQuality";

// ── Tree data model ───────────────────────────────────────────────────────────

export interface FileNode {
  type: "file";
  name: string;
  path: string;
  size: number;
  httpMethod?: string;
  isSystem?: boolean;
}

export interface FolderNode {
  type: "folder";
  name: string;
  path: string;
  children: TreeNode[];
  isSystem?: boolean;
}

export type TreeNode = FileNode | FolderNode;

/** Flatten the tree into a list of paths in display order (for Shift+click range). */
export function flattenVisiblePaths(
  nodes: TreeNode[],
  expandedFolders: Set<string>,
  folderSortOrder: Record<string, SortOrder> = {},
  parentPath?: string,
): string[] {
  const sorted = parentPath
    ? sortChildren(nodes, folderSortOrder[parentPath] ?? "name")
    : nodes;
  const result: string[] = [];
  for (const node of sorted) {
    result.push(node.path);
    if (node.type === "folder" && expandedFolders.has(node.path)) {
      result.push(...flattenVisiblePaths(node.children, expandedFolders, folderSortOrder, node.path));
    }
  }
  return result;
}

export function buildTree(files: SpecFileItem[]): TreeNode[] {
  const root: TreeNode[] = [];

  for (const file of files) {
    const parts = file.name.split("/");
    const filename = parts[parts.length - 1];

    // Skip internal folders entirely
    if (parts.includes("_versions") || parts.includes("_variables")) continue;

    // Skip files with no name
    if (!filename) continue;

    // Build folder nodes for the path
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

    // Skip metadata leaf nodes — folders are already created above
    if (filename === ".keep" || filename === "_sources.json") continue;

    level.push({ type: "file", name: filename, path: file.name, size: file.size, httpMethod: file.httpMethod });
  }

  // Mark _system folders and their children as system nodes
  markSystemNodes(root);

  return sortLevel(root);
}

/** Recursively mark _system and _distilled folders and all their children as isSystem. */
function markSystemNodes(nodes: TreeNode[]): void {
  for (const node of nodes) {
    if (node.type === "folder" && (node.name === "_system" || node.name === "_distilled")) {
      node.isSystem = true;
      markAllChildren(node.children);
    } else if (node.type === "folder") {
      markSystemNodes(node.children);
    }
  }
}

function markAllChildren(nodes: TreeNode[]): void {
  for (const node of nodes) {
    node.isSystem = true;
    if (node.type === "folder") markAllChildren(node.children);
  }
}

function sortLevel(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .sort((a, b) => {
      // _system folder always first
      if (a.isSystem && !b.isSystem) return -1;
      if (!a.isSystem && b.isSystem) return 1;
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
  // Can't drag system nodes
  if (drag.isSystem) return false;
  // Can't drop into _system folder
  if (targetFolderPath.endsWith("/_system") || targetFolderPath === "_system") return false;
  // Can't drop a folder into itself
  if (drag.type === "folder" && targetFolderPath === drag.path) return false;
  // Can't drop a folder into one of its own descendants
  if (drag.type === "folder" && targetFolderPath.startsWith(drag.path + "/")) return false;
  // Already in this location — no-op
  if (parentOf(drag.path) === targetFolderPath) return false;
  return true;
}

// ── Sorting ──────────────────────────────────────────────────────────────────

type SortOrder = "name" | "method";

const METHOD_RANK: Record<string, number> = { GET: 0, POST: 1, PUT: 2, PATCH: 3, DELETE: 4 };

function sortChildren(nodes: TreeNode[], order: SortOrder): TreeNode[] {
  return [...nodes].sort((a, b) => {
    // _system folder always first
    if (a.isSystem && !b.isSystem) return -1;
    if (!a.isSystem && b.isSystem) return 1;
    // Folders before other files
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    if (order === "method" && a.type === "file" && b.type === "file") {
      const ma = a.httpMethod ? (METHOD_RANK[a.httpMethod] ?? 99) : 100;
      const mb = b.httpMethod ? (METHOD_RANK[b.httpMethod] ?? 99) : 100;
      if (ma !== mb) return ma - mb;
    }
    return a.name.localeCompare(b.name);
  });
}

// ── HTTP method tag ───────────────────────────────────────────────────────────

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-[#ddf4ff] text-[#0969da]",
  POST: "bg-[#dafbe1] text-[#1a7f37]",
  PUT: "bg-[#fff8c5] text-[#9a6700]",
  DELETE: "bg-[#ffebe9] text-[#d1242f]",
  PATCH: "bg-[#fff8c5] text-[#9a6700]",
};

function HttpMethodTag({ method }: { method: string }) {
  return (
    <span className={`text-[9px] font-bold leading-none w-[34px] text-center py-[2px] rounded ${METHOD_COLORS[method] ?? ""} shrink-0 inline-block`}>
      {method}
    </span>
  );
}

// ── Icons ─────────────────────────────────────────────────────────────────────

function SyncSpinner() {
  return (
    <svg className="w-4 h-4 text-[#0969da] shrink-0 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

function FileIcon({ name, hasIdeas, isSourced }: { name: string; hasIdeas?: boolean; isSourced?: boolean }) {
  // Skills file — gear icon
  if (name === "_skills.md" || name === "Skills.md")
    return (
      <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
      </svg>
    );
  const ext = name.split(".").pop()?.toLowerCase();
  if (ext === "xml" || ext === "xsd")
    return (
      <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.379 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
      </svg>
    );
  // MD files: slightly different grey if ideas generated
  const color = hasIdeas ? "text-[#57606a]" : "text-[#8b949e]";
  return (
    <span className="relative shrink-0 flex items-center">
      <svg className={`w-4 h-4 ${color}`} fill="currentColor" viewBox="0 0 20 20">
        <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.379 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
      </svg>
      {isSourced && (
        <svg className="w-2 h-2 text-[#0969da] absolute -bottom-0.5 -right-0.5" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 0 1 1.242 7.244l-4.5 4.5a4.5 4.5 0 0 1-6.364-6.364l1.757-1.757m13.35-.622 1.757-1.757a4.5 4.5 0 0 0-6.364-6.364l-4.5 4.5a4.5 4.5 0 0 0 1.242 7.244" />
        </svg>
      )}
    </span>
  );
}

// ── Inline input (create / rename) ────────────────────────────────────────────

function InlineInput({ defaultValue = "", onCommit, onCancel }: {
  defaultValue?: string;
  onCommit: (v: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);
  const committed = { current: false };
  const doCommit = (v: string) => {
    if (committed.current) return;
    committed.current = true;
    onCommit(v);
  };
  return (
    <input
      autoFocus
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter" && value.trim()) doCommit(value.trim());
        if (e.key === "Escape") onCancel();
        e.stopPropagation();
      }}
      onBlur={() => {
        if (committed.current) return;
        if (value.trim()) doCommit(value.trim()); else onCancel();
      }}
      className="flex-1 min-w-0 text-sm border border-[#0969da] rounded px-1 py-0.5 outline-none bg-white text-[#1f2328]"
    />
  );
}

// ── Folder context menu ───────────────────────────────────────────────────────

interface FolderMenuProps {
  folderPath: string;
  isSelected: boolean;
  hasSourcedFiles: boolean;
  hasSpecFiles: boolean;
  isVersionFolder: boolean;
  currentSort: SortOrder;
  onSort: (order: SortOrder) => void;
  onNewSubfolder: () => void;
  onUploadFiles: () => void;
  onImportFromUrl: () => void;
  onSyncFolder: () => void;
  onReimportSpec?: () => void;
  onGenerateFlowIdeas: () => void;
  onRename: () => void;
  onDelete: () => void;
}

function FolderMenu({ isSelected, hasSourcedFiles, hasSpecFiles, isVersionFolder, currentSort, onSort, onNewSubfolder, onUploadFiles, onImportFromUrl, onSyncFolder, onReimportSpec, onGenerateFlowIdeas, onRename, onDelete }: FolderMenuProps) {
  const noSpecTip = "Upload spec files (.md) first";
  const items: MenuItem[] = [
    { label: "New subfolder", icon: MenuIcons.folder, onClick: onNewSubfolder },
    { label: "Upload files", icon: MenuIcons.upload, onClick: onUploadFiles },
    { label: "Import from URL", icon: MenuIcons.link, onClick: onImportFromUrl },
    { label: "Sync URL sources", icon: MenuIcons.sync, onClick: onSyncFolder, disabled: !hasSourcedFiles, tooltip: hasSourcedFiles ? undefined : "No URL-sourced files in this folder" },
    ...(isVersionFolder && onReimportSpec ? [
      { label: "Reimport OpenAPI Spec", icon: MenuIcons.refresh, onClick: onReimportSpec } as MenuItem,
    ] : []),
    "separator",
    { label: `Sort by name${currentSort === "name" ? "  ✓" : ""}`, icon: MenuIcons.sortAZ, onClick: () => onSort("name") },
    { label: `Sort by method${currentSort === "method" ? "  ✓" : ""}`, icon: MenuIcons.sortMethod, onClick: () => onSort("method"), disabled: !hasSpecFiles, tooltip: hasSpecFiles ? undefined : noSpecTip },
    "separator",
    { label: "Generate ideas", icon: MenuIcons.sparkle, onClick: onGenerateFlowIdeas, disabled: !hasSpecFiles, tooltip: hasSpecFiles ? undefined : noSpecTip },
    "separator",
    { label: "Rename", icon: MenuIcons.rename, onClick: onRename },
    { label: "Delete folder", icon: MenuIcons.trash, onClick: onDelete, danger: true },
  ];
  return (
    <ContextMenu
      items={items}
      triggerClass={`rounded p-0.5 transition-colors ${
        isSelected ? "hover:bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#eef1f6] hover:text-[#1f2328]"
      }`}
    />
  );
}

/** Recursively count .md files under a folder node (excluding system files) */
function countMdFiles(node: TreeNode): number {
  if (node.isSystem) return 0;
  if (node.type === "file") return node.name.endsWith(".md") ? 1 : 0;
  return node.children.reduce((sum, child) => sum + countMdFiles(child), 0);
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
  /** Paths that have generated ideas */
  pathsWithIdeas?: Set<string>;
  /** Paths that are sourced from URLs */
  sourcedPaths?: Set<string>;
  /** Paths currently being synced */
  syncingPaths?: Set<string>;
  /** Quality scores keyed by full tree path (file paths and folder paths) */
  qualityScores?: SpecQuality;
  /** Per-folder sort order */
  folderSortOrder: Record<string, SortOrder>;
  /** Multi-selected paths */
  multiSelectedPaths: Set<string>;
  /** Whether multi-select mode is active (size > 0) */
  multiSelectActive: boolean;
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
  onSetSort: (folderPath: string, order: SortOrder) => void;
  onMultiSelect: (path: string, e: React.MouseEvent) => void;
  onRenameStart: (path: string) => void;
  onRenameCommit: (node: TreeNode, newName: string) => void;
  onRenameCancel: () => void;
  onDeleteNode: (node: TreeNode) => void;
  onStartSubfolder: (parentPath: string) => void;
  onUploadFiles: (folderPath: string) => void;
  onImportFromUrl: (folderPath: string) => void;
  onSyncFile: (folderPath: string, filename: string) => void;
  onSyncFolder: (folderPath: string) => void;
  onReimportSpec?: (folderPath: string) => void;
  onGenerateFlowIdeas: (path: string) => void;
  onCreateCommit: (parentPath: string, name: string) => void;
  onCreateCancel: () => void;
}

function TreeNodeRow({
  node, depth, selectedPath, selectedFolderPath, expandedFolders, renamingPath,
  creatingUnder, pathsWithIdeas, sourcedPaths, syncingPaths, qualityScores, folderSortOrder,
  multiSelectedPaths, multiSelectActive,
  draggingPath, dropTargetPath,
  onDragStart, onDragOver, onDrop, onDragEnd,
  onSelect, onSelectFolder, onToggle, onSetSort, onMultiSelect, onRenameStart, onRenameCommit, onRenameCancel,
  onDeleteNode, onStartSubfolder, onUploadFiles, onImportFromUrl, onSyncFile, onSyncFolder,
  onReimportSpec,
  onGenerateFlowIdeas, onCreateCommit, onCreateCancel,
}: NodeProps) {
  const indent = depth * 12;
  const isSelected = node.type === "file" ? node.path === selectedPath : node.path === selectedFolderPath;
  const isMultiSelected = multiSelectedPaths.has(node.path);
  const isExpanded = node.type === "folder" && expandedFolders.has(node.path);
  const isRenaming = node.path === renamingPath;
  const isDragging = node.path === draggingPath;
  const isDropTarget = node.type === "folder" && dropTargetPath === node.path;

  return (
    <>
      <div
        draggable={!isRenaming && !multiSelectActive && !node.isSystem}
        onDragStart={(e) => { e.stopPropagation(); if (node.isSystem) return; onDragStart(node); }}
        onDragOver={(e) => { e.stopPropagation(); onDragOver(e, node); }}
        onDrop={(e) => { e.stopPropagation(); onDrop(e, node); }}
        onDragEnd={(e) => { e.stopPropagation(); onDragEnd(); }}
        className={`group flex items-center gap-1 py-[3px] pr-1 cursor-pointer select-none text-[14px] rounded-md mx-1 transition-colors ${
          isDragging ? "opacity-40" : ""
        } ${
          isDropTarget
            ? "ring-2 ring-[#0969da]/30 bg-[#ddf4ff] text-[#1f2328]"
            : isMultiSelected
              ? "bg-[#ddf4ff] text-[#1f2328]"
              : isSelected
                ? "bg-[#0969da] text-white"
                : "text-[#1f2328] hover:bg-[#eef1f6]"
        }`}
        style={{ paddingLeft: indent + 4 }}
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey) {
            onMultiSelect(node.path, e);
          } else if (multiSelectActive) {
            // In select mode, clicking the row toggles selection
            onMultiSelect(node.path, e);
          } else if (node.type === "folder") {
            onSelectFolder(node.path);
          } else {
            onSelect(node.path);
          }
        }}
      >
        {/* Checkbox — shown during multi-select */}
        {multiSelectActive && (
          <span
            className="shrink-0 flex items-center justify-center w-4 h-4 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); onMultiSelect(node.path, e); }}
          >
            {isMultiSelected ? (
              <svg className="w-4 h-4 text-[#0969da]" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M3 4.5A2.5 2.5 0 0 1 5.5 2h9A2.5 2.5 0 0 1 17 4.5v11a2.5 2.5 0 0 1-2.5 2.5h-9A2.5 2.5 0 0 1 3 15.5v-11Zm10.28 3.22a.75.75 0 0 1 0 1.06l-4 4a.75.75 0 0 1-1.06 0l-2-2a.75.75 0 1 1 1.06-1.06L8.75 11.19l3.47-3.47a.75.75 0 0 1 1.06 0Z" clipRule="evenodd" />
              </svg>
            ) : (
              <svg className="w-4 h-4 text-[#d1d9e0]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 20 20">
                <rect x="3" y="3" width="14" height="14" rx="2.5" />
              </svg>
            )}
          </span>
        )}

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
        {syncingPaths?.has(node.path) ? (
          <SyncSpinner />
        ) : node.type === "folder" && node.isSystem ? (
          /* Lock icon for _system folder */
          <svg className={`w-4 h-4 shrink-0 ${isSelected && !isDropTarget ? "text-[#8b949e]" : "text-[#8b949e]"}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
        ) : node.type === "folder" ? (
          <svg className={`w-4 h-4 shrink-0 ${isSelected && !isDropTarget ? "text-[#8b949e]" : "text-[#656d76]"}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
          </svg>
        ) : (
          <FileIcon name={node.name} hasIdeas={pathsWithIdeas?.has(node.path) === true} isSourced={sourcedPaths?.has(node.path) === true} />
        )}

        {/* Name or rename input */}
        {isRenaming ? (
          <InlineInput
            defaultValue={node.name}
            onCommit={(name) => onRenameCommit(node, name)}
            onCancel={onRenameCancel}
          />
        ) : (
          <span className="flex-1 flex items-center gap-1.5 min-w-0">
            {node.type === "file" && node.httpMethod && (
              <HttpMethodTag method={node.httpMethod} />
            )}
            <span className={`truncate ${node.isSystem && !isSelected ? "text-[#8b949e]" : ""}`}>{node.name}</span>
            {!node.isSystem && qualityScores && (() => {
              if (node.type === "file") {
                const ep = qualityScores.perEndpoint.get(node.path);
                if (ep) return <QualityScorePill score={ep.score} />;
              } else {
                const fold = qualityScores.perFolder.get(node.path);
                if (fold) return <QualityScorePill score={fold.score} endpointCount={fold.endpointCount} />;
              }
              return null;
            })()}
          </span>
        )}

        {/* Actions */}
        {!isRenaming && !node.isSystem && (
          <span className={`flex items-center gap-0.5 shrink-0 ${isSelected && !isDropTarget ? "opacity-100" : "opacity-0 group-hover:opacity-100"}`}>
            {node.type === "folder" ? (
              <FolderMenu
                folderPath={node.path}
                isSelected={isSelected && !isDropTarget}
                hasSourcedFiles={sourcedPaths ? Array.from(sourcedPaths).some((p) => p.startsWith(node.path + "/")) : false}
                hasSpecFiles={countMdFiles(node) > 0}
                isVersionFolder={!node.path.includes("/")}
                currentSort={folderSortOrder[node.path] ?? "name"}
                onSort={(order) => onSetSort(node.path, order)}
                onNewSubfolder={() => onStartSubfolder(node.path)}
                onUploadFiles={() => onUploadFiles(node.path)}
                onImportFromUrl={() => onImportFromUrl(node.path)}
                onSyncFolder={() => onSyncFolder(node.path)}
                onReimportSpec={onReimportSpec ? () => onReimportSpec(node.path) : undefined}
                onGenerateFlowIdeas={() => onGenerateFlowIdeas(node.path)}
                onRename={() => onRenameStart(node.path)}
                onDelete={() => onDeleteNode(node)}
              />
            ) : (
              <ContextMenu
                items={[
                  ...(sourcedPaths?.has(node.path) ? [{
                    label: "Sync from source",
                    icon: MenuIcons.sync,
                    onClick: () => {
                      const lastSlash = node.path.lastIndexOf("/");
                      const folder = lastSlash === -1 ? "" : node.path.slice(0, lastSlash);
                      onSyncFile(folder, node.name);
                    },
                  }] : []),
                  ...(node.name.endsWith(".md") ? [
                    "separator" as const,
                    { label: "Generate ideas", icon: MenuIcons.sparkle, onClick: () => onGenerateFlowIdeas(node.path) },
                    "separator" as const,
                  ] : ["separator" as const]),
                  { label: "Rename", icon: MenuIcons.rename, onClick: () => onRenameStart(node.path) },
                  { label: "Delete file", icon: MenuIcons.trash, onClick: () => onDeleteNode(node), danger: true },
                ]}
                triggerClass={`rounded p-0.5 transition-colors ${
                  isSelected ? "hover:bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#eef1f6] hover:text-[#1f2328]"
                }`}
              />
            )}
          </span>
        )}
      </div>

      {/* Children */}
      {node.type === "folder" && isExpanded && (
        <>
          {sortChildren(node.children, folderSortOrder[node.path] ?? "name").map((child) => (
            <TreeNodeRow
              key={child.path}
              node={child}
              depth={depth + 1}
              selectedPath={selectedPath}
              selectedFolderPath={selectedFolderPath}
              expandedFolders={expandedFolders}
              renamingPath={renamingPath}
              creatingUnder={creatingUnder}
              pathsWithIdeas={pathsWithIdeas}
              sourcedPaths={sourcedPaths}
              syncingPaths={syncingPaths}
              qualityScores={qualityScores}
              folderSortOrder={folderSortOrder}
              multiSelectedPaths={multiSelectedPaths}
              multiSelectActive={multiSelectActive}
              draggingPath={draggingPath}
              dropTargetPath={dropTargetPath}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
              onSelect={onSelect}
              onSelectFolder={onSelectFolder}
              onToggle={onToggle}
              onSetSort={onSetSort}
              onMultiSelect={onMultiSelect}
              onRenameStart={onRenameStart}
              onRenameCommit={onRenameCommit}
              onRenameCancel={onRenameCancel}
              onDeleteNode={onDeleteNode}
              onStartSubfolder={onStartSubfolder}
              onUploadFiles={onUploadFiles}
              onImportFromUrl={onImportFromUrl}
              onSyncFile={onSyncFile}
              onSyncFolder={onSyncFolder}
              onReimportSpec={onReimportSpec}
              onGenerateFlowIdeas={onGenerateFlowIdeas}
              onCreateCommit={onCreateCommit}
              onCreateCancel={onCreateCancel}
            />
          ))}
          {/* Inline subfolder create row */}
          {creatingUnder === node.path && (
            <div className="flex items-center gap-1 py-0.5 pr-1 mx-1" style={{ paddingLeft: (depth + 1) * 12 + 4 }}>
              <span className="w-3 shrink-0" />
              <svg className="w-4 h-4 shrink-0 text-[#656d76]" fill="currentColor" viewBox="0 0 20 20">
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

// ── Delete confirmation modal ─────────────────────────────────────────────────

function DeleteConfirmModal({ node, confirmText, onConfirmTextChange, onConfirm, onCancel, deleting, error }: {
  node: TreeNode;
  confirmText: string;
  onConfirmTextChange: (v: string) => void;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
  error: string | null;
}) {
  const isVersionFolder = node.type === "folder" && !node.path.includes("/");
  const needsTypedConfirm = isVersionFolder;
  const canConfirm = !deleting && (needsTypedConfirm ? confirmText === node.name : true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
      <div className="bg-white rounded-xl shadow-2xl flex flex-col" style={{ width: 440, border: "1px solid #d1d9e0" }}>
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4" style={{ borderBottom: "1px solid #d1d9e0" }}>
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#ffebe9] flex items-center justify-center">
              {deleting ? (
                <svg className="w-4 h-4 text-[#d1242f] animate-spin" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                </svg>
              )}
            </div>
            <h2 className="text-sm font-semibold text-[#1f2328]">
              {deleting
                ? `Deleting ${node.name}…`
                : isVersionFolder ? "Delete version folder" : node.type === "folder" ? "Delete folder" : "Delete file"}
            </h2>
          </div>
          {!deleting && (
            <button
              onClick={onCancel}
              className="p-1.5 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors"
              title="Close"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>

        {/* Body */}
        <div className="px-5 py-4 space-y-3">
          {deleting ? (
            <div className="flex items-center gap-3 py-2">
              <svg className="w-5 h-5 text-[#656d76] animate-spin shrink-0" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
              <p className="text-sm text-[#656d76]">
                Deleting all files in <strong className="text-[#1f2328]">{node.name}</strong>… This may take a moment for large folders.
              </p>
            </div>
          ) : isVersionFolder ? (
            <>
              <p className="text-sm text-[#1f2328]">
                This will permanently delete <strong>{node.name}</strong> and all its contents including spec files, distilled specs, and system files.
              </p>
              <p className="text-sm text-[#656d76]">
                Type <strong className="text-[#1f2328] font-mono bg-[#f6f8fa] px-1 py-0.5 rounded">{node.name}</strong> to confirm:
              </p>
              <input
                type="text"
                autoFocus
                value={confirmText}
                onChange={(e) => onConfirmTextChange(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && canConfirm) onConfirm(); if (e.key === "Escape") onCancel(); }}
                className="w-full text-sm px-3 py-1.5 border rounded-md outline-none focus:ring-2 focus:ring-[#0969da]/30 focus:border-[#0969da]"
                style={{ borderColor: "#d1d9e0" }}
                placeholder={node.name}
              />
            </>
          ) : (
            <p className="text-sm text-[#1f2328]">
              Are you sure you want to delete <strong>{node.name}</strong>{node.type === "folder" ? " and all its contents" : ""}? This action cannot be undone.
            </p>
          )}

          {error && (
            <div className="flex items-start gap-2 text-sm text-[#d1242f] bg-[#ffebe9] rounded-md px-3 py-2">
              <svg className="w-4 h-4 shrink-0 mt-0.5" fill="currentColor" viewBox="0 0 16 16">
                <path d="M2.343 13.657A8 8 0 1 1 13.66 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
              </svg>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4" style={{ borderTop: "1px solid #d1d9e0" }}>
          {!deleting && (
            <>
              <button
                onClick={onCancel}
                className="text-sm font-medium text-[#656d76] hover:text-[#1f2328] px-3 py-1.5 rounded-md hover:bg-[#f6f8fa] transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={onConfirm}
                disabled={!canConfirm}
                className="text-sm font-medium text-white px-4 py-1.5 rounded-md transition-colors disabled:opacity-40"
                style={{ background: "#d1242f" }}
              >
                Delete
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

interface FileTreeProps {
  files: SpecFileItem[];
  loading: boolean;
  selectedPath: string | null;
  selectedFolderPath: string | null;
  /** Paths (file or folder) that have generated ideas in the workshop */
  pathsWithIdeas?: Set<string>;
  /** Paths that are sourced from URLs */
  sourcedPaths?: Set<string>;
  /** Paths currently being synced */
  syncingPaths?: Set<string>;
  /** Spec quality scores indexed by full tree path */
  qualityScores?: SpecQuality;
  /** Multi-selected paths (managed by parent) */
  multiSelectedPaths: Set<string>;
  onSelectFile: (path: string) => void;
  onSelectFolder: (path: string) => void;
  onMultiSelect: (path: string, e: React.MouseEvent) => void;
  onSelectAll: () => void;
  onClearMultiSelect: () => void;
  onBulkDelete: () => void;
  onCreateFolder: (path: string) => Promise<void>;
  onDeleteFile: (path: string) => Promise<void>;
  onDeleteFolder: (folderPath: string) => Promise<void>;
  onRenameFile: (oldPath: string, newPath: string) => Promise<void>;
  onUploadFiles: (folderPath: string) => void;
  onImportFromUrl: (folderPath: string) => void;
  onSyncFile: (folderPath: string, filename: string) => void;
  onSyncFolder: (folderPath: string) => void;
  onReimportSpec?: (folderPath: string) => void;
  onGenerateFlowIdeas: (path: string) => void;
  onRefresh: () => void;
  onNewVersion: () => void;
  onSearch: () => void;
}

export function FileTree({
  files, loading, selectedPath, selectedFolderPath, pathsWithIdeas, sourcedPaths, syncingPaths,
  qualityScores,
  multiSelectedPaths, onSelectFile, onSelectFolder, onMultiSelect, onSelectAll, onClearMultiSelect, onBulkDelete,
  onCreateFolder, onDeleteFile, onDeleteFolder, onRenameFile,
  onUploadFiles, onImportFromUrl, onSyncFile, onSyncFolder,
  onReimportSpec, onGenerateFlowIdeas, onRefresh, onNewVersion, onSearch,
}: FileTreeProps) {
  const tree = buildTree(files);

  // Persist expanded folders across navigation so the user's tree view
  // survives jumping to Flow Manager and back. On first mount `files` is
  // empty (data not loaded yet), so fall back to stored selection. When
  // files arrive, ensure ancestors of the selected path are expanded so
  // the user sees their place in the tree.
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("specfiles_expanded_folders");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    return new Set();
  });

  useEffect(() => {
    localStorage.setItem(
      "specfiles_expanded_folders",
      JSON.stringify(Array.from(expandedFolders)),
    );
  }, [expandedFolders]);

  // When files (or the active selection) load, auto-expand ancestors of
  // the selected path so the user can see where they are.
  useEffect(() => {
    const path = selectedPath ?? selectedFolderPath;
    if (!path) return;
    const parts = path.split("/").filter(Boolean);
    const ancestors: string[] = [];
    for (let i = 0; i < parts.length - (selectedPath ? 1 : 0); i++) {
      ancestors.push(parts.slice(0, i + 1).join("/"));
    }
    if (ancestors.length === 0) return;
    setExpandedFolders(prev => {
      const next = new Set(prev);
      let changed = false;
      for (const a of ancestors) {
        if (!next.has(a)) { next.add(a); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [files, selectedPath, selectedFolderPath]);
  const [renamingPath, setRenamingPath] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null>(null);
  const [deletingNode, setDeletingNode] = useState<TreeNode | null>(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteInProgress, setDeleteInProgress] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Per-folder sort order (persisted)
  const [folderSortOrder, setFolderSortOrder] = useState<Record<string, SortOrder>>(() => {
    try {
      const raw = localStorage.getItem("specfiles_folder_sort");
      if (raw) return JSON.parse(raw) as Record<string, SortOrder>;
    } catch { /* ignore */ }
    return {};
  });

  function handleSetSort(folderPath: string, order: SortOrder) {
    setFolderSortOrder((prev) => {
      const next = { ...prev };
      if (order === "name") delete next[folderPath]; // "name" is default, no need to store
      else next[folderPath] = order;
      localStorage.setItem("specfiles_folder_sort", JSON.stringify(next));
      return next;
    });
  }

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

  function handleDeleteNode(node: TreeNode) {
    setDeletingNode(node);
    setDeleteConfirmText("");
    setDeleteInProgress(false);
    setDeleteError(null);
  }

  async function confirmDelete() {
    if (!deletingNode) return;
    setDeleteInProgress(true);
    setDeleteError(null);
    try {
      if (deletingNode.type === "folder") await onDeleteFolder(deletingNode.path);
      else await onDeleteFile(deletingNode.path);
      setDeletingNode(null);
      setDeleteConfirmText("");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteInProgress(false);
    }
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

  const [selectMode, setSelectMode] = useState(false);
  const multiSelectActive = selectMode || multiSelectedPaths.size > 0;

  // Count all tree nodes to determine "all selected" state
  const totalTreeNodes = (() => {
    let count = 0;
    function walk(nodes: TreeNode[]) { for (const n of nodes) { count++; if (n.type === "folder") walk(n.children); } }
    walk(tree);
    return count;
  })();
  const allSelected = multiSelectedPaths.size > 0 && multiSelectedPaths.size >= totalTreeNodes;

  const sharedProps = {
    selectedPath,
    selectedFolderPath,
    expandedFolders,
    renamingPath,
    creatingUnder,
    pathsWithIdeas,
    sourcedPaths,
    syncingPaths,
    qualityScores,
    folderSortOrder,
    multiSelectedPaths,
    multiSelectActive,
    draggingPath: draggingNode?.path ?? null,
    dropTargetPath,
    onDragStart: handleDragStart,
    onDragOver: handleDragOver,
    onDrop: handleDrop,
    onDragEnd: handleDragEnd,
    onSelect: onSelectFile,
    onSelectFolder: onSelectFolder,
    onToggle: toggleFolder,
    onSetSort: handleSetSort,
    onMultiSelect,
    onRenameStart: (path: string) => setRenamingPath(path),
    onRenameCommit: (n: TreeNode, name: string) => void handleRenameCommit(n, name),
    onRenameCancel: () => setRenamingPath(null),
    onDeleteNode: (n: TreeNode) => void handleDeleteNode(n),
    onStartSubfolder: startSubfolder,
    onUploadFiles,
    onImportFromUrl,
    onSyncFile,
    onSyncFolder,
    onReimportSpec,
    onGenerateFlowIdeas,
    onCreateCommit: (parent: string, name: string) => void handleCreateCommit(parent, name),
    onCreateCancel: () => setCreatingUnder(null),
  };

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Title header */}
      <div className="flex items-center gap-2 px-4 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <span className="text-sm font-bold text-[#1f2328]">Spec Manager (Ideas & Flows)</span>
      </div>
      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 h-10 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        {multiSelectActive ? (
          <>
            <span className="text-xs font-medium text-[#0969da]">{multiSelectedPaths.size} selected</span>
            <div className="flex-1" />
            {/* Select All / Deselect All toggle — matches Ideas panel pattern */}
            <button
              onClick={() => {
                if (allSelected) {
                  // Deselect all AND exit select mode (hide checkboxes)
                  onClearMultiSelect();
                  setSelectMode(false);
                } else {
                  onSelectAll();
                }
              }}
              title={allSelected ? "Deselect all" : "Select all"}
              className="rounded-md p-1 text-[#656d76] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
            >
              {allSelected ? (
                /* Deselect all — minimize arrows (same as Ideas panel) */
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 3.75v4.5m0-4.5h4.5m-4.5 0L9 9M3.75 20.25v-4.5m0 4.5h4.5m-4.5 0L9 15M20.25 3.75h-4.5m4.5 0v4.5m0-4.5L15 9m5.25 11.25h-4.5m4.5 0v-4.5m0 4.5L15 15" />
                </svg>
              ) : (
                /* Select all — circle check (same as Ideas panel) */
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                </svg>
              )}
            </button>
            {/* Trash — delete selected */}
            <button
              onClick={onBulkDelete}
              disabled={multiSelectedPaths.size === 0}
              title={multiSelectedPaths.size > 0 ? `Delete ${multiSelectedPaths.size} selected` : "Select files to delete"}
              className={`rounded-md p-1 transition-colors ${
                multiSelectedPaths.size > 0
                  ? "text-[#d1242f] hover:bg-[#ffebe9]"
                  : "text-[#d1d9e0] cursor-not-allowed"
              }`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
              </svg>
            </button>
          </>
        ) : (
          <>
            <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v8.25m19.5 0v2.25a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 16.5v-2.25" />
            </svg>
            <span className="text-sm font-semibold text-[#1f2328]">Spec Files</span>
            <div className="flex-1" />
            <button
              onClick={onSearch}
              title="Search spec files (Ctrl+K)"
              disabled={files.length === 0}
              className="text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 rounded-md p-1 hover:bg-[#eef1f6] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
            </button>
            <button
              onClick={() => setSelectMode(true)}
              title="Select files"
              disabled={files.length === 0}
              className="text-[#656d76] hover:text-[#1f2328] disabled:opacity-40 rounded-md p-1 hover:bg-[#eef1f6] transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
              </svg>
            </button>
            <button
              onClick={onNewVersion}
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
          </>
        )}
      </div>

      {/* Tree — acts as root drop zone when dragging */}
      <div
        className={`flex-1 overflow-y-auto py-1 text-[14px] transition-colors ${
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
          <div className={`mx-2 mt-2 mb-1 rounded border-2 border-dashed px-3 py-2 text-center text-sm transition-colors ${
            dropTargetPath === ""
              ? "border-[#0969da] text-blue-500 bg-blue-50"
              : "border-[#d1d9e0] text-[#656d76]"
          }`}>
            Drop here to move to root
          </div>
        )}
      </div>

      {/* Delete confirmation modal */}
      {deletingNode && (
        <DeleteConfirmModal
          node={deletingNode}
          confirmText={deleteConfirmText}
          onConfirmTextChange={setDeleteConfirmText}
          onConfirm={() => void confirmDelete()}
          onCancel={() => { setDeletingNode(null); setDeleteConfirmText(""); setDeleteError(null); }}
          deleting={deleteInProgress}
          error={deleteError}
        />
      )}
    </div>
  );
}
