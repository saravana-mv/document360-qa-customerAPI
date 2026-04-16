import { useState, useCallback } from "react";
import { useExplorerUIStore } from "../../store/explorerUI.store";
import { useScenarioOrgStore } from "../../store/scenarioOrg.store";
import { getAllTests } from "../../lib/tests/registry";
import { ContextMenu, MenuIcons } from "../common/ContextMenu";
import { TagNode } from "./TagNode";
import { NEWLY_ADDED, depthOf, isNewlyAdded } from "../../lib/treeUtils";
import type { ParsedTag } from "../../types/spec.types";

// Stable fallback — must be a module-level constant so Zustand's Object.is
// check doesn't see a "new" array on every selector call (which causes an
// infinite re-render loop).
const EMPTY_FOLDERS: string[] = [];

interface ScenarioFolderTreeProps {
  version: string;
  tags: ParsedTag[];
  sortOrder: "asc" | "desc";
}

interface FolderTreeNode {
  name: string;
  fullPath: string;
  children: FolderTreeNode[];
  flowPaths: string[];
}

/** Build a nested tree from flat folder list */
function buildFolderTree(
  folders: string[],
  placements: Record<string, string>,
  allFlowPaths: string[],
): FolderTreeNode[] {
  // Collect flows per folder for this version
  const flowsByFolder = new Map<string, string[]>();
  for (const fp of allFlowPaths) {
    const folder = placements[fp] ?? NEWLY_ADDED;
    if (!flowsByFolder.has(folder)) flowsByFolder.set(folder, []);
    flowsByFolder.get(folder)!.push(fp);
  }

  // Build tree from flat folder paths
  const roots: FolderTreeNode[] = [];
  const nodeMap = new Map<string, FolderTreeNode>();

  // Sort folders: NEWLY-ADDED first, then alphabetical
  const sorted = [...folders].sort((a, b) => {
    if (isNewlyAdded(a)) return -1;
    if (isNewlyAdded(b)) return 1;
    return a.localeCompare(b);
  });

  for (const folderPath of sorted) {
    const segments = folderPath.split("/");
    const name = segments[segments.length - 1];
    const node: FolderTreeNode = {
      name,
      fullPath: folderPath,
      children: [],
      flowPaths: flowsByFolder.get(folderPath) ?? [],
    };
    nodeMap.set(folderPath, node);

    if (segments.length === 1) {
      roots.push(node);
    } else {
      const parentPath = segments.slice(0, -1).join("/");
      const parent = nodeMap.get(parentPath);
      if (parent) parent.children.push(node);
      else roots.push(node);
    }
  }

  return roots;
}

function countFlowsInTree(node: FolderTreeNode): number {
  let count = node.flowPaths.length;
  for (const child of node.children) count += countFlowsInTree(child);
  return count;
}

export function ScenarioFolderTree({ version, tags, sortOrder }: ScenarioFolderTreeProps) {
  const folders = useScenarioOrgStore((s) => s.folders[version] ?? EMPTY_FOLDERS);
  const placements = useScenarioOrgStore((s) => s.placements);
  const allTests = getAllTests();

  // All flow paths for this version
  const versionFlowPaths = Object.keys(placements).filter(
    (fp) => fp.startsWith(version + "/"),
  );

  const tree = buildFolderTree(folders, placements, versionFlowPaths);

  const cmp = sortOrder === "asc"
    ? (a: string, b: string) => a.localeCompare(b)
    : (a: string, b: string) => b.localeCompare(a);

  return (
    <div className="ml-2 space-y-px">
      {tree.map((node) => (
        <FolderNode
          key={node.fullPath}
          node={node}
          version={version}
          tags={tags}
          allTests={allTests}
          sortCmp={cmp}
        />
      ))}
      {/* Unplaced scenarios (no folder assignment) — render at root */}
      {renderUnplacedTags(tags, versionFlowPaths, placements, allTests, cmp)}
    </div>
  );
}

function renderUnplacedTags(
  tags: ParsedTag[],
  versionFlowPaths: string[],
  placements: Record<string, string>,
  allTests: ReturnType<typeof getAllTests>,
  sortCmp: (a: string, b: string) => number,
) {
  const placedFlowPaths = new Set(versionFlowPaths.filter((fp) => placements[fp]));
  const unplacedFlows = versionFlowPaths.filter((fp) => !placedFlowPaths.has(fp));
  if (unplacedFlows.length === 0) return null;

  const unplacedFlowSet = new Set(unplacedFlows);
  const matchingTags = tags.filter((t) => {
    const tests = allTests.filter((test) => test.tag === t.name);
    return tests.some((test) => test.flowFileName && unplacedFlowSet.has(test.flowFileName));
  }).sort((a, b) => sortCmp(a.name, b.name));

  if (matchingTags.length === 0) return null;

  return (
    <>
      {matchingTags.map((tag) => {
        const tests = allTests.filter((t) => t.tag === tag.name);
        return <TagNode key={tag.name} tag={tag} tests={tests} />;
      })}
    </>
  );
}

interface FolderNodeProps {
  node: FolderTreeNode;
  version: string;
  tags: ParsedTag[];
  allTests: ReturnType<typeof getAllTests>;
  sortCmp: (a: string, b: string) => number;
}

/** Yellow folder icon — matches FileTree */
function FolderIcon({ className }: { className?: string }) {
  return (
    <svg className={`w-3.5 h-3.5 shrink-0 ${className ?? "text-yellow-500"}`} fill="currentColor" viewBox="0 0 20 20">
      <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
    </svg>
  );
}

function FolderNode({ node, version, tags, allTests, sortCmp }: FolderNodeProps) {
  const open = useExplorerUIStore((s) => (s.expandedFolders[version] ?? new Set()).has(node.fullPath));
  const toggleFolder = useExplorerUIStore((s) => s.toggleFolder);
  const createFolder = useScenarioOrgStore((s) => s.createFolder);
  const renameFolder = useScenarioOrgStore((s) => s.renameFolder);
  const deleteFolder = useScenarioOrgStore((s) => s.deleteFolder);
  const moveScenario = useScenarioOrgStore((s) => s.moveScenario);

  const [creating, setCreating] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameName, setRenameName] = useState(node.name);

  const reserved = isNewlyAdded(node.fullPath);
  const depth = depthOf(node.fullPath);
  const totalFlows = countFlowsInTree(node);

  // Find tags that belong to this folder's flows
  const flowSet = new Set(node.flowPaths);
  const folderTags = tags.filter((t) => {
    const tests = allTests.filter((test) => test.tag === t.name);
    return tests.some((test) => test.flowFileName && flowSet.has(test.flowFileName));
  }).sort((a, b) => sortCmp(a.name, b.name));

  const handleCreateSubfolder = useCallback(() => {
    setCreating(true);
    setNewFolderName("");
  }, []);

  const confirmCreate = useCallback(() => {
    const name = newFolderName.trim();
    if (!name) { setCreating(false); return; }
    const path = node.fullPath ? `${node.fullPath}/${name}` : name;
    createFolder(version, path);
    setCreating(false);
    if (!open) toggleFolder(version, node.fullPath);
  }, [newFolderName, node.fullPath, version, createFolder, open, toggleFolder]);

  const confirmRename = useCallback(() => {
    const name = renameName.trim();
    if (!name || name === node.name) { setRenaming(false); return; }
    const parentPath = node.fullPath.includes("/")
      ? node.fullPath.slice(0, node.fullPath.lastIndexOf("/"))
      : "";
    const newPath = parentPath ? `${parentPath}/${name}` : name;
    renameFolder(version, node.fullPath, newPath);
    setRenaming(false);
  }, [renameName, node.name, node.fullPath, version, renameFolder]);

  const handleDelete = useCallback(() => {
    if (totalFlows > 0) {
      alert("Cannot delete a folder that contains scenarios. Move the scenarios first.");
      return;
    }
    if (!window.confirm(`Delete folder "${node.name}"?`)) return;
    deleteFolder(version, node.fullPath);
  }, [totalFlows, node.name, version, node.fullPath, deleteFolder]);

  // Drag-and-drop: accept scenario drops
  const handleDragOver = useCallback((e: React.DragEvent) => {
    const flowPath = e.dataTransfer.types.includes("application/x-flow-path");
    if (flowPath) {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    const flowPath = e.dataTransfer.getData("application/x-flow-path");
    if (flowPath) {
      moveScenario(flowPath, node.fullPath);
    }
  }, [moveScenario, node.fullPath]);

  // Build context menu items — grey icons, "..." trigger, consistent style
  const menuItems: Array<{ label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }> = [];

  // NEWLY-ADDED: no subfolder, no rename, no delete
  if (!reserved && depth < 4) {
    menuItems.push({
      label: "New subfolder",
      icon: MenuIcons.folder,
      onClick: handleCreateSubfolder,
    });
  }

  if (!reserved) {
    menuItems.push({
      label: "Rename",
      icon: MenuIcons.rename,
      onClick: () => { setRenaming(true); setRenameName(node.name); },
    });
    menuItems.push({
      label: "Delete folder",
      icon: MenuIcons.trash,
      onClick: handleDelete,
      danger: true,
      disabled: totalFlows > 0,
    });
  }

  return (
    <div className="mb-px">
      <div
        className="group flex items-center gap-1"
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <button
          onClick={() => toggleFolder(version, node.fullPath)}
          className="text-[#656d76] hover:text-[#1f2328] w-4 flex items-center justify-center shrink-0"
        >
          <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        </button>
        <div className="flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md hover:bg-[#f6f8fa] border border-transparent transition-colors text-xs">
          {/* Folder icon: NEWLY-ADDED gets a distinct purple tint, others get yellow */}
          {reserved ? (
            <svg className="w-3.5 h-3.5 shrink-0 text-[#8250df]" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 6a2 2 0 0 1 2-2h5l2 2h5a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V6Z" />
            </svg>
          ) : (
            <FolderIcon />
          )}
          {renaming ? (
            <input
              autoFocus
              className="text-[13px] text-[#1f2328] bg-white border border-[#0969da] rounded px-1 py-0.5 w-32 outline-none"
              value={renameName}
              onChange={(e) => setRenameName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") confirmRename();
                if (e.key === "Escape") setRenaming(false);
              }}
              onBlur={confirmRename}
            />
          ) : (
            <span className={`font-medium text-[13px] truncate ${reserved ? "text-[#8250df]" : "text-[#1f2328]"}`} title={reserved ? "Default folder for new scenarios" : undefined}>
              {node.name}
            </span>
          )}
          <span className="text-xs text-[#656d76] ml-auto shrink-0">{totalFlows}</span>
          {menuItems.length > 0 && (
            <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ContextMenu items={menuItems} align="left" />
            </span>
          )}
        </div>
      </div>

      {open && (
        <div className="mt-px ml-5 space-y-px">
          {/* Subfolders */}
          {node.children.map((child) => (
            <FolderNode
              key={child.fullPath}
              node={child}
              version={version}
              tags={tags}
              allTests={allTests}
              sortCmp={sortCmp}
            />
          ))}
          {/* Scenarios in this folder */}
          {folderTags.map((tag) => {
            const tests = allTests.filter((t) => t.tag === tag.name);
            return <DraggableTagNode key={tag.name} tag={tag} tests={tests} />;
          })}
          {/* Inline create folder input */}
          {creating && (
            <div className="flex items-center gap-2 px-2 py-1">
              <FolderIcon />
              <input
                autoFocus
                className="text-[13px] text-[#1f2328] bg-white border border-[#0969da] rounded px-1 py-0.5 w-32 outline-none"
                placeholder="Folder name"
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") confirmCreate();
                  if (e.key === "Escape") setCreating(false);
                }}
                onBlur={confirmCreate}
              />
            </div>
          )}
          {folderTags.length === 0 && node.children.length === 0 && !creating && (
            <div className="ml-2 px-2 py-1 text-xs text-[#656d76] italic">Empty</div>
          )}
        </div>
      )}
    </div>
  );
}

/** Wrapper around TagNode that adds drag support */
function DraggableTagNode({ tag, tests }: { tag: ParsedTag; tests: ReturnType<typeof getAllTests> }) {
  const flowFileName = tests[0]?.flowFileName;

  const handleDragStart = useCallback((e: React.DragEvent) => {
    if (flowFileName) {
      e.dataTransfer.setData("application/x-flow-path", flowFileName);
      e.dataTransfer.effectAllowed = "move";
    }
  }, [flowFileName]);

  return (
    <div draggable={!!flowFileName} onDragStart={handleDragStart}>
      <TagNode tag={tag} tests={tests} />
    </div>
  );
}
