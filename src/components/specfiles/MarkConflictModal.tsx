import { useEffect, useState } from "react";

export type ConflictResolution =
  | { kind: "keep" }
  | { kind: "overwrite" }
  | { kind: "rename"; newName: string };

interface Props {
  existingName: string;      // full blob path of the existing flow
  suggestedNewName: string;  // suggested full blob path for "save as new"
  flowTitle: string;
  onResolve: (resolution: ConflictResolution) => void;
  onCancel: () => void;
}

export function MarkConflictModal({ existingName, suggestedNewName, flowTitle, onResolve, onCancel }: Props) {
  const [renameValue, setRenameValue] = useState(suggestedNewName);

  // reset when a different conflict is shown
  useEffect(() => { setRenameValue(suggestedNewName); }, [suggestedNewName]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div
        className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[520px] max-w-[92vw]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
          <div className="w-8 h-8 rounded-full bg-[#fff8c5] flex items-center justify-center shrink-0">
            <svg className="w-4 h-4 text-[#9a6700]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
            </svg>
          </div>
          <span className="text-base font-semibold text-[#1f2328] flex-1">A flow already exists</span>
          <button onClick={onCancel} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        <div className="px-4 py-3 space-y-3">
          <p className="text-sm text-[#656d76] leading-relaxed">
            You're trying to mark <strong className="text-[#1f2328]">{flowTitle}</strong> for implementation, but the
            Flow Manager queue already has a flow at:
          </p>
          <code className="block text-sm font-mono bg-[#f6f8fa] border border-[#d1d9e0] rounded-md px-2.5 py-1.5 text-[#1f2328] break-all">
            {existingName}
          </code>

          <div className="pt-1">
            <label className="block text-sm font-medium text-[#1f2328] mb-1">Save as new name</label>
            <input
              type="text"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              className="w-full text-sm font-mono border border-[#d1d9e0] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
            />
            <p className="text-xs text-[#656d76] mt-1">Used only if you pick "Save as new".</p>
          </div>
        </div>

        <div className="flex flex-wrap justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
          <button
            onClick={onCancel}
            className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => onResolve({ kind: "keep" })}
            className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
          >
            Keep existing
          </button>
          <button
            disabled={!renameValue.trim() || renameValue === existingName}
            onClick={() => onResolve({ kind: "rename", newName: renameValue.trim() })}
            className="text-sm font-medium text-white bg-[#0969da] hover:bg-[#0969da]/90 border border-[#0969da]/80 rounded-md px-3 py-1.5 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Save as new
          </button>
          <button
            onClick={() => onResolve({ kind: "overwrite" })}
            className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#d1242f]/90 border border-[#d1242f]/80 rounded-md px-3 py-1.5 transition-colors"
          >
            Overwrite
          </button>
        </div>
      </div>
    </div>
  );
}
