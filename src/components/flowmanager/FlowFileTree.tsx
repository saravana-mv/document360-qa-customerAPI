import { useState } from "react";
import type { FlowFileItem } from "../../lib/api/flowFilesApi";

// ── Tree model ────────────────────────────────────────────────────────────────

interface FileNode { type: "file"; name: string; path: string; size: number; }
interface FolderNode { type: "folder"; name: string; path: string; children: TreeNode[]; }
type TreeNode = FileNode | FolderNode;

function buildTree(files: FlowFileItem[]): TreeNode[] {
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
    if (filename) level.push({ type: "file", name: filename, path: file.name, size: file.size });
  }
  return sort(root);
}

function sort(nodes: TreeNode[]): TreeNode[] {
  return nodes
    .sort((a, b) => (a.type !== b.type ? (a.type === "folder" ? -1 : 1) : a.name.localeCompare(b.name)))
    .map((n) => (n.type === "folder" ? { ...n, children: sort(n.children) } : n));
}

// ── Icons ─────────────────────────────────────────────────────────────────────

const FolderIcon = ({ open }: { open: boolean }) => (
  <svg className="w-4 h-4 text-[#54aeff] shrink-0" fill="currentColor" viewBox="0 0 24 24">
    {open ? (
      <path d="M19.5 21a3 3 0 0 0 2.83-2l2.25-6.75A1.5 1.5 0 0 0 23.16 10H8.25a3 3 0 0 0-2.83 2l-1.83 5.49L3 18V6a1.5 1.5 0 0 1 1.5-1.5h4.88l3 3h7.62A1.5 1.5 0 0 1 21 9v1.5" />
    ) : (
      <path d="M20 6h-8l-2-2H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2z" />
    )}
  </svg>
);

const FlowIcon = () => (
  <svg className="w-4 h-4 text-[#0969da] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
    <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
  </svg>
);

// ── Component ─────────────────────────────────────────────────────────────────

interface Props {
  files: FlowFileItem[];
  activePath: string | null;
  onSelectFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
}

export function FlowFileTree({ files, activePath, onSelectFile, onRemoveFile }: Props) {
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    // Start with all folders expanded
    const s = new Set<string>();
    for (const f of files) {
      const parts = f.name.split("/");
      let prefix = "";
      for (let i = 0; i < parts.length - 1; i++) {
        prefix = prefix ? `${prefix}/${parts[i]}` : parts[i];
        s.add(prefix);
      }
    }
    return s;
  });

  const tree = buildTree(files);

  function toggle(path: string) {
    setExpanded(prev => {
      const n = new Set(prev);
      if (n.has(path)) n.delete(path); else n.add(path);
      return n;
    });
  }

  if (files.length === 0) {
    return (
      <div className="p-4 text-center">
        <svg className="w-10 h-10 mx-auto text-[#d1d9e0] mb-2" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
        </svg>
        <p className="text-sm text-[#656d76]">No flows marked yet</p>
        <p className="text-xs text-[#afb8c1] mt-1 leading-relaxed">
          Generate flows in Spec Manager and<br />mark them for implementation
        </p>
      </div>
    );
  }

  return (
    <div className="py-1">
      {tree.map((node) => (
        <NodeView
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          onToggle={toggle}
          onSelectFile={onSelectFile}
          onRemoveFile={onRemoveFile}
        />
      ))}
    </div>
  );
}

interface NodeViewProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onSelectFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
}

function NodeView({ node, depth, expanded, activePath, onToggle, onSelectFile, onRemoveFile }: NodeViewProps) {
  const padding = 8 + depth * 12;

  if (node.type === "folder") {
    const isOpen = expanded.has(node.path);
    return (
      <>
        <div
          onClick={() => onToggle(node.path)}
          className="flex items-center gap-1.5 py-1 cursor-pointer hover:bg-[#f6f8fa] group"
          style={{ paddingLeft: padding }}
        >
          <svg
            className={`w-3 h-3 text-[#656d76] shrink-0 transition-transform ${isOpen ? "rotate-90" : ""}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d="M8 5v14l11-7z" />
          </svg>
          <FolderIcon open={isOpen} />
          <span className="text-sm text-[#1f2328] truncate">{node.name}</span>
        </div>
        {isOpen && node.children.map((child) => (
          <NodeView
            key={child.path}
            node={child}
            depth={depth + 1}
            expanded={expanded}
            activePath={activePath}
            onToggle={onToggle}
            onSelectFile={onSelectFile}
            onRemoveFile={onRemoveFile}
          />
        ))}
      </>
    );
  }

  // file
  const isActive = activePath === node.path;
  return (
    <div
      onClick={() => onSelectFile(node.path)}
      className={`flex items-center gap-1.5 py-1 pr-2 cursor-pointer group ${
        isActive ? "bg-[#ddf4ff] border-l-2 border-l-[#0969da]" : "border-l-2 border-l-transparent hover:bg-[#f6f8fa]"
      }`}
      style={{ paddingLeft: padding + 14 /* indent for chevron width on sibling folders */ }}
    >
      <FlowIcon />
      <span className={`text-sm truncate flex-1 ${isActive ? "text-[#1f2328] font-medium" : "text-[#1f2328]"}`}>
        {node.name}
      </span>
      <button
        onClick={(e) => { e.stopPropagation(); onRemoveFile(node.path); }}
        title="Remove from implementation list"
        className="opacity-0 group-hover:opacity-100 text-[#afb8c1] hover:text-[#d1242f] rounded-md p-0.5 hover:bg-[#ffebe9] transition-colors"
      >
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}
