import { useState } from "react";
import { ContextMenu, MenuIcons } from "../common/ContextMenu";
import { useRunnerStore } from "../../store/runner.store";
import { useSpecStore } from "../../store/spec.store";
import { useFlowStatusStore } from "../../store/flowStatus.store";
import { useExplorerUIStore } from "../../store/explorerUI.store";
import { useUserStore } from "../../store/user.store";
import { StatusIcon } from "./StatusIcon";
import { OperationNode } from "./OperationNode";
import { unregisterWhere } from "../../lib/tests/registry";
import { buildParsedTagsFromRegistry } from "../../lib/tests/buildParsedTags";
import { deactivateFlow } from "../../lib/tests/flowXml/activeTests";
import { lockFlow, unlockFlow } from "../../lib/api/flowFilesApi";
import type { ParsedTag } from "../../types/spec.types";
import type { TestDef } from "../../types/test.types";

interface TagNodeProps {
  tag: ParsedTag;
  tests: TestDef[];
}

export function TagNode({ tag, tests }: TagNodeProps) {
  const open = useExplorerUIStore((s) => s.expandedTags.has(tag.name));
  const toggleTag = useExplorerUIStore((s) => s.toggleTag);
  const [deleting, setDeleting] = useState(false);
  const [locking, setLocking] = useState(false);
  const { tagResults, selectedTags, toggleFlowSelection } = useRunnerStore();
  const { setSpec } = useSpecStore();
  const tagResult = tagResults[tag.name];
  const status = tagResult?.status ?? "idle";
  const isSelected = selectedTags.has(tag.name);
  // Every test in a flow carries the same flowFileName — grab the first.
  const flowFileName = tests[0]?.flowFileName;

  // Lock info from flow status store
  const flowEntry = useFlowStatusStore((s) => flowFileName ? s.byName[flowFileName] : undefined);
  const lockedBy = flowEntry?.lockedBy;
  const lockedAt = flowEntry?.lockedAt;
  const isLocked = !!lockedBy;

  // Role check
  const canLockUnlock = useUserStore((s) => s.hasRole("qa_manager"));
  const isQaEngineer = useUserStore((s) => {
    if (s.status === "dev-mode") return false;
    return s.user?.role === "qa_engineer";
  });

  async function handleDelete() {
    if (!flowFileName) return;
    if (!window.confirm(`Delete scenario "${tag.name}"?\n\nThis unregisters the scenario from the runner. The flow XML file is preserved and can be reused.`)) return;
    setDeleting(true);
    try {
      // Unregister only — flow XML is a reusable asset and must be preserved.
      await deactivateFlow(flowFileName);
      unregisterWhere((def) => def.flowFileName === flowFileName);
      const status = useFlowStatusStore.getState();
      const remaining = new Set(
        Object.keys(status.byName).filter((n) => n !== flowFileName),
      );
      status.pruneTo(remaining);
      const built = buildParsedTagsFromRegistry();
      setSpec(null as never, built, null as never);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("[TagNode] delete failed:", err);
      alert(`Failed to delete scenario: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeleting(false);
    }
  }

  async function handleLock() {
    if (!flowFileName) return;
    setLocking(true);
    try {
      const result = await lockFlow(flowFileName);
      // Update store
      const store = useFlowStatusStore.getState();
      const entry = store.byName[flowFileName];
      if (entry) store.setEntry({ ...entry, lockedBy: result.lockedBy, lockedAt: result.lockedAt });
    } catch (err) {
      alert(`Failed to lock: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocking(false);
    }
  }

  async function handleUnlock() {
    if (!flowFileName) return;
    setLocking(true);
    try {
      await unlockFlow(flowFileName);
      // Update store
      const store = useFlowStatusStore.getState();
      const entry = store.byName[flowFileName];
      if (entry) store.setEntry({ ...entry, lockedBy: undefined, lockedAt: undefined });
    } catch (err) {
      alert(`Failed to unlock: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setLocking(false);
    }
  }

  // Build context menu items
  const menuItems: Array<{ label: string; icon: React.ReactNode; onClick: () => void; danger?: boolean; disabled?: boolean }> = [];

  if (canLockUnlock && flowFileName) {
    if (isLocked) {
      menuItems.push({
        label: "Unlock scenario",
        icon: <LockOpenIcon />,
        onClick: () => void handleUnlock(),
        disabled: locking,
      });
    } else {
      menuItems.push({
        label: "Lock scenario",
        icon: <LockIcon />,
        onClick: () => void handleLock(),
        disabled: locking,
      });
    }
  }

  // Delete: disabled if locked and user is qa_engineer
  const deleteDisabled = deleting || (isLocked && isQaEngineer);
  menuItems.push({
    label: "Delete scenario",
    icon: MenuIcons.trash,
    onClick: () => void handleDelete(),
    danger: true,
    disabled: deleteDisabled,
  });

  // Format lock tooltip
  const lockTooltip = lockedBy
    ? `Locked by ${lockedBy.name}${lockedAt ? ` on ${new Date(lockedAt).toLocaleDateString()}` : ""}`
    : undefined;

  return (
    <div className="mb-px">
      <div className="group flex items-center gap-1">
        <button
          onClick={() => toggleTag(tag.name)}
          className="text-[#656d76] hover:text-[#1f2328] w-4 flex items-center justify-center shrink-0"
        >
          <svg className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`} fill="currentColor" viewBox="0 0 20 20">
            <path fillRule="evenodd" d="M7.21 14.77a.75.75 0 0 1 .02-1.06L11.168 10 7.23 6.29a.75.75 0 1 1 1.04-1.08l4.5 4.25a.75.75 0 0 1 0 1.08l-4.5 4.25a.75.75 0 0 1-1.06-.02Z" clipRule="evenodd" />
          </svg>
        </button>
        <div
          onClick={() => toggleFlowSelection(tag.name, tests.map((t) => t.id))}
          className={`flex items-center gap-2 flex-1 px-2 py-1.5 rounded-md cursor-pointer transition-colors text-xs ${
            isSelected ? "bg-[#ddf4ff] border border-[#b6e3ff]" : "hover:bg-[#f6f8fa] border border-transparent"
          }`}
        >
          <svg className="w-4 h-4 text-[#656d76] shrink-0" fill="currentColor" viewBox="0 0 16 16">
            <path d="M.513 1.513A1.75 1.75 0 0 1 1.75 0h3.5c.465 0 .91.185 1.239.513l.61.61c.109.109.257.17.411.17h6.74a1.75 1.75 0 0 1 1.75 1.75v10.5A1.75 1.75 0 0 1 14.25 15.5H1.75A1.75 1.75 0 0 1 0 13.75V1.75c0-.465.185-.91.513-1.237Z" />
          </svg>
          <StatusIcon status={status} />
          <span className="font-medium text-[13px] text-[#1f2328] truncate">{tag.name}</span>
          {isLocked && (
            <span title={lockTooltip} className="shrink-0 text-[#bf8700]">
              <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 16 16">
                <path fillRule="evenodd" d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4Zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25ZM10.5 4a2.5 2.5 0 1 0-5 0v2h5Z" clipRule="evenodd" />
              </svg>
            </span>
          )}
          {flowFileName && (
            <span className="shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <ContextMenu items={menuItems} align="left" />
            </span>
          )}
          <span className="text-xs text-[#656d76] ml-auto shrink-0">
            {tests.length}
          </span>
          {tagResult?.durationMs !== undefined && (
            <span className="text-xs text-[#afb8c1] shrink-0">{tagResult.durationMs}ms</span>
          )}
        </div>
      </div>

      {open && tests.length > 0 && (
        <div className="mt-px ml-5 space-y-px">
          {tests.map((t) => (
            <OperationNode key={t.id} test={t} />
          ))}
        </div>
      )}

      {open && tests.length === 0 && (
        <div className="ml-7 px-2 py-1 text-xs text-[#656d76] italic">No steps</div>
      )}
    </div>
  );
}

function LockIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}

function LockOpenIcon() {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 10.5V6.75a4.5 4.5 0 1 1 9 0v3.75M3.75 21.75h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H3.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
    </svg>
  );
}
