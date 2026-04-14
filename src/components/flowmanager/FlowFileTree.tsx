// Read-only folder tree for Flow Manager. Mirrors the visual language of
// the Spec Manager FileTree so the two views feel identical — same indent,
// same chevron + yellow folder icon, same selected/hover states. The only
// flow-specific additions are the implementation status badge and a
// delete-from-queue button on each file row.

import { useEffect, useState } from "react";
import { ContextMenu, MenuIcons } from "../common/ContextMenu";
import type { FlowFileItem } from "../../lib/api/flowFilesApi";
import type { FlowImplStatus, FlowStatusEntry } from "../../store/flowStatus.store";

// ── Tree data model ──────────────────────────────────────────────────────────

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

// ── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status, error }: { status: FlowImplStatus; error?: string }) {
  if (status === "loading") {
    return (
      <span title="Parsing…" className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-px rounded-full bg-[#eef1f6] text-[#656d76] border border-[#d1d9e0]">
        <svg className="w-2.5 h-2.5 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        Loading
      </span>
    );
  }
  if (status === "implemented") {
    return (
      <span title="Parsed and registered as runnable test(s)" className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-px rounded-full bg-[#dafbe1] text-[#1a7f37] border border-[#1a7f37]/30">
        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
        </svg>
        Implemented
      </span>
    );
  }
  return (
    <span
      title={error ? `Invalid flow XML: ${error}` : "Invalid flow XML"}
      className="shrink-0 inline-flex items-center gap-0.5 text-[10px] font-medium px-1.5 py-px rounded-full bg-[#ffebe9] text-[#d1242f] border border-[#d1242f]/30"
    >
      <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m0-10.036A9.05 9.05 0 0 0 11.484 21h.032A9.05 9.05 0 0 0 12 2.714ZM12 17.25h.008v.008H12v-.008Z" />
      </svg>
      Invalid
    </span>
  );
}

// ── Component ────────────────────────────────────────────────────────────────

interface Props {
  files: FlowFileItem[];
  activePath: string | null;
  onSelectFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  statusByName: Record<string, FlowStatusEntry>;
}

export function FlowFileTree({ files, activePath, onSelectFile, onRemoveFile, statusByName }: Props) {
  // Persist expanded folders — use a separate key from Spec Manager so the
  // two views can track their own open state.
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem("flowmanager_expanded_folders");
      if (raw) return new Set(JSON.parse(raw) as string[]);
    } catch { /* ignore */ }
    // First run: expand every folder so new users see the whole tree.
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

  useEffect(() => {
    localStorage.setItem("flowmanager_expanded_folders", JSON.stringify(Array.from(expanded)));
  }, [expanded]);

  // Ensure ancestors of the active file are expanded.
  useEffect(() => {
    if (!activePath) return;
    const parts = activePath.split("/").filter(Boolean);
    if (parts.length <= 1) return;
    setExpanded(prev => {
      const next = new Set(prev);
      let changed = false;
      for (let i = 0; i < parts.length - 1; i++) {
        const p = parts.slice(0, i + 1).join("/");
        if (!next.has(p)) { next.add(p); changed = true; }
      }
      return changed ? next : prev;
    });
  }, [activePath]);

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
        <NodeRow
          key={node.path}
          node={node}
          depth={0}
          expanded={expanded}
          activePath={activePath}
          onToggle={toggle}
          onSelectFile={onSelectFile}
          onRemoveFile={onRemoveFile}
          statusByName={statusByName}
        />
      ))}
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

interface NodeRowProps {
  node: TreeNode;
  depth: number;
  expanded: Set<string>;
  activePath: string | null;
  onToggle: (path: string) => void;
  onSelectFile: (path: string) => void;
  onRemoveFile: (path: string) => void;
  statusByName: Record<string, FlowStatusEntry>;
}

function NodeRow({ node, depth, expanded, activePath, onToggle, onSelectFile, onRemoveFile, statusByName }: NodeRowProps) {
  const indent = depth * 12;
  const isFolder = node.type === "folder";
  const isExpanded = isFolder && expanded.has(node.path);
  const isSelected = !isFolder && activePath === node.path;
  const statusEntry = !isFolder ? statusByName[node.path] : undefined;

  return (
    <>
      <div
        className={`group flex items-center gap-1 py-[3px] pr-1 cursor-pointer select-none text-[14px] rounded-md mx-1 transition-colors ${
          isSelected
            ? "bg-[#0969da] text-white"
            : "text-[#1f2328] hover:bg-[#eef1f6]"
        }`}
        style={{ paddingLeft: indent + 4 }}
        onClick={() => {
          if (isFolder) onToggle(node.path);
          else onSelectFile(node.path);
        }}
      >
        {/* Chevron (folders only) */}
        {isFolder ? (
          <svg
            className={`w-3 h-3 shrink-0 transition-transform text-[#656d76] ${isExpanded ? "rotate-90" : ""}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        ) : (
          <span className="w-3 shrink-0" />
        )}

        {/* Icon */}
        {isFolder ? (
          <svg className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-yellow-300" : "text-yellow-500"}`} fill="currentColor" viewBox="0 0 20 20">
            <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
          </svg>
        ) : (
          <svg className={`w-3.5 h-3.5 shrink-0 ${isSelected ? "text-white" : "text-orange-400"}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M4.5 2A1.5 1.5 0 0 0 3 3.5v13A1.5 1.5 0 0 0 4.5 18h11a1.5 1.5 0 0 0 1.5-1.5V7.621a1.5 1.5 0 0 0-.44-1.06l-4.12-4.122A1.5 1.5 0 0 0 11.379 2H4.5Zm2.25 8.5a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Zm0 3a.75.75 0 0 0 0 1.5h6.5a.75.75 0 0 0 0-1.5h-6.5Z" clipRule="evenodd" />
          </svg>
        )}

        {/* Name */}
        <span className="flex-1 truncate">{node.name}</span>

        {/* Status badge + delete (files only) */}
        {!isFolder && statusEntry && <StatusBadge status={statusEntry.status} error={statusEntry.error} />}
        {!isFolder && (
          <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
            <ContextMenu
              items={[
                { label: "Remove from queue", icon: MenuIcons.remove, onClick: () => onRemoveFile(node.path), danger: true },
              ]}
              triggerClass={`rounded p-0.5 transition-colors ${
                isSelected ? "hover:bg-[#0969da] text-white" : "text-[#656d76] hover:bg-[#eef1f6] hover:text-[#1f2328]"
              }`}
            />
          </span>
        )}
      </div>

      {/* Children */}
      {isFolder && isExpanded && node.children.map((child) => (
        <NodeRow
          key={child.path}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          activePath={activePath}
          onToggle={onToggle}
          onSelectFile={onSelectFile}
          onRemoveFile={onRemoveFile}
          statusByName={statusByName}
        />
      ))}
    </>
  );
}
