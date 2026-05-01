import { useCallback, useEffect, useState } from "react";
import { useSetupStore } from "../store/setup.store";
import { useUserStore } from "../store/user.store";
import type { ProjectRole, ProjectMember } from "../lib/api/projectMembersApi";
import {
  listProjectMembers,
  addProjectMember,
  changeProjectMemberRole,
  removeProjectMember,
} from "../lib/api/projectMembersApi";

const ROLE_COLOR: Record<ProjectRole, string> = {
  owner: "bg-[#fbefff] text-[#8250df] border-[#8250df]/30",
  qa_manager: "bg-[#ddf4ff] text-[#0969da] border-[#0969da]/30",
  qa_engineer: "bg-[#dafbe1] text-[#1a7f37] border-[#1a7f37]/30",
};

const ROLE_LABEL: Record<ProjectRole, string> = {
  owner: "Project Owner",
  qa_manager: "QA Manager",
  qa_engineer: "QA Engineer",
};

const STATUS_COLOR: Record<string, string> = {
  active: "text-[#1a7f37]",
  invited: "text-[#9a6700]",
};

function formatDate(iso?: string): string {
  if (!iso) return "\u2014";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

export function MembersContent() {
  const selectedProjectId = useSetupStore((s) => s.selectedProjectId);
  const { hasRole } = useUserStore();
  const canManage = hasRole("qa_manager"); // qa_manager+ can manage project members

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addEmail, setAddEmail] = useState("");
  const [addRole, setAddRole] = useState<ProjectRole>("qa_engineer");
  const [addDisplayName, setAddDisplayName] = useState("");
  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!selectedProjectId) return;
    setLoading(true);
    setError(null);
    try {
      const data = await listProjectMembers(selectedProjectId);
      setMembers(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [selectedProjectId]);

  useEffect(() => { load(); }, [load]);

  async function handleAdd() {
    if (!addEmail.trim() || !selectedProjectId) return;
    setAdding(true);
    setAddError(null);
    try {
      await addProjectMember(
        selectedProjectId,
        addEmail.trim(),
        addRole,
        addDisplayName.trim() || undefined,
      );
      setAddEmail("");
      setAddDisplayName("");
      setShowAdd(false);
      await load();
    } catch (e) {
      setAddError(e instanceof Error ? e.message : String(e));
    } finally {
      setAdding(false);
    }
  }

  async function handleRoleChange(memberId: string, role: ProjectRole) {
    if (!selectedProjectId) return;
    try {
      await changeProjectMemberRole(memberId, selectedProjectId, role);
      await load();
    } catch (e) {
      console.error("Failed to change role:", e);
    }
  }

  async function handleRemove(memberId: string, displayName: string) {
    if (!selectedProjectId) return;
    if (!window.confirm(`Remove "${displayName}" from this project? They will lose access to project resources.`)) return;
    try {
      await removeProjectMember(memberId, selectedProjectId);
      await load();
    } catch (e) {
      console.error("Failed to remove member:", e);
    }
  }

  const ownerCount = members.filter((m) => m.role === "owner" && m.status === "active").length;

  if (!selectedProjectId) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-[#656d76]">
        Select a project to manage members
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-5 h-5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
        </svg>
        <span className="text-sm font-bold text-[#1f2328]">Project Members</span>
        <span className="text-xs text-[#656d76]">({members.length})</span>
        <div className="flex-1" />
        {canManage && (
          <button
            onClick={() => { setShowAdd(true); setAddError(null); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1f883d] hover:bg-[#1a7f37] text-white text-sm font-medium rounded-md transition-colors border border-[#1f883d]/80"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            Add member
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-sm text-[#656d76]">Loading members...</div>
        ) : error ? (
          <div className="text-sm text-[#d1242f]">{error}</div>
        ) : (
          <div className="bg-white border border-[#d1d9e0] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f6f8fa] border-b border-[#d1d9e0]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Member</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Project Role</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Added</th>
                  {canManage && <th className="px-4 py-2.5"></th>}
                </tr>
              </thead>
              <tbody>
                {members.map((m) => {
                  const isSoleOwner = m.role === "owner" && ownerCount <= 1;
                  return (
                    <tr key={m.id} className="border-b border-[#d1d9e0] last:border-0 hover:bg-[#f6f8fa]">
                      <td className="px-4 py-2.5 font-medium text-[#1f2328]">{m.displayName}</td>
                      <td className="px-4 py-2.5 text-[#656d76]">{m.email}</td>
                      <td className="px-4 py-2.5">
                        {!canManage || isSoleOwner ? (
                          <span
                            title={isSoleOwner ? "At least one project owner is required" : ""}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLOR[m.role]}`}
                          >
                            {ROLE_LABEL[m.role]}
                          </span>
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.id, e.target.value as ProjectRole)}
                            className={`text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer ${ROLE_COLOR[m.role]}`}
                          >
                            <option value="owner">Project Owner</option>
                            <option value="qa_manager">QA Manager</option>
                            <option value="qa_engineer">QA Engineer</option>
                          </select>
                        )}
                      </td>
                      <td className={`px-4 py-2.5 text-xs font-medium capitalize ${STATUS_COLOR[m.status] ?? ""}`}>
                        {m.status}
                      </td>
                      <td className="px-4 py-2.5 text-[#656d76] text-xs">{formatDate(m.addedAt)}</td>
                      {canManage && (
                        <td className="px-4 py-2.5 text-right">
                          {isSoleOwner ? (
                            <span
                              title="Cannot remove the last project owner"
                              className="text-[#d1d9e0] p-1 inline-block"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </span>
                          ) : (
                            <button
                              onClick={() => handleRemove(m.id, m.displayName)}
                              title="Remove member"
                              className="text-[#656d76] hover:text-[#d1242f] p-1 rounded-md hover:bg-[#ffebe9] transition-colors"
                            >
                              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                              </svg>
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  );
                })}
                {members.length === 0 && (
                  <tr><td colSpan={canManage ? 6 : 5} className="px-4 py-8 text-center text-[#656d76]">No members yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add member modal */}
      {showAdd && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#d1d9e0]">
              <span className="text-base font-semibold text-[#1f2328]">Add project member</span>
              <button onClick={() => setShowAdd(false)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1">Email address</label>
                <input
                  type="email"
                  value={addEmail}
                  onChange={(e) => setAddEmail(e.target.value)}
                  placeholder="name@kovai.co"
                  className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1">Display name (optional)</label>
                <input
                  type="text"
                  value={addDisplayName}
                  onChange={(e) => setAddDisplayName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1">Project role</label>
                <select
                  value={addRole}
                  onChange={(e) => setAddRole(e.target.value as ProjectRole)}
                  className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                >
                  <option value="qa_engineer">QA Engineer</option>
                  <option value="qa_manager">QA Manager</option>
                  <option value="owner">Project Owner</option>
                </select>
              </div>
              {addError && (
                <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
                  {addError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
              <button
                onClick={() => setShowAdd(false)}
                className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleAdd()}
                disabled={adding || !addEmail.trim()}
                className="text-sm font-medium text-white bg-[#1f883d] hover:bg-[#1a7f37] disabled:opacity-50 rounded-md px-3 py-1.5 transition-colors border border-[#1f883d]/80"
              >
                {adding ? "Adding..." : "Add member"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
