import { useCallback, useEffect, useState } from "react";
import { useUserStore, type AppRole } from "../store/user.store";
import { Navigate } from "react-router-dom";

interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: "active" | "invited" | "disabled";
  invitedAt?: string;
  acceptedAt?: string;
}

const ROLE_COLOR: Record<AppRole, string> = {
  owner: "bg-[#fbefff] text-[#8250df] border-[#8250df]/30",
  project_owner: "bg-[#fff8c5] text-[#9a6700] border-[#9a6700]/30",
  qa_manager: "bg-[#ddf4ff] text-[#0969da] border-[#0969da]/30",
  qa_engineer: "bg-[#dafbe1] text-[#1a7f37] border-[#1a7f37]/30",
  member: "bg-[#f6f8fa] text-[#656d76] border-[#d1d9e0]",
};
const STATUS_COLOR: Record<string, string> = {
  active: "text-[#1a7f37]",
  invited: "text-[#9a6700]",
  disabled: "text-[#656d76]",
};

function formatDate(iso?: string): string {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleDateString(); } catch { return iso; }
}

/** Standalone page — redirects unauthorized users. */
export function UsersPage() {
  const { hasRole } = useUserStore();
  if (!hasRole("owner")) return <Navigate to="/spec-files" replace />;
  return <UsersContent />;
}

/** Content-only — used inside the Settings layout. */
export function UsersContent() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<AppRole>("qa_engineer");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(await res.text());
      setUsers(await res.json() as UserRow[]);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: inviteRole }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      setInviteEmail("");
      setShowInvite(false);
      await load();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
    } finally {
      setInviting(false);
    }
  }

  async function handleChangeRole(userId: string, role: AppRole) {
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (!res.ok) throw new Error(await res.text());
      await load();
    } catch (e) {
      console.error("Failed to change role:", e);
    }
  }

  async function handleRemove(userId: string, displayName: string) {
    if (!window.confirm(`Remove "${displayName}" from FlowForge? They will no longer be able to access the application.`)) return;
    try {
      const res = await fetch(`/api/users/${userId}`, { method: "DELETE" });
      if (!res.ok && res.status !== 204) throw new Error(await res.text());
      await load();
    } catch (e) {
      console.error("Failed to remove user:", e);
    }
  }

  const ownerCount = users.filter((u) => u.role === "owner" && u.status !== "disabled").length;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-5 h-5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
        </svg>
        <span className="text-sm font-bold text-[#1f2328]">Users</span>
        <div className="flex-1" />
        <button
          onClick={() => { setShowInvite(true); setInviteError(null); }}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-sm font-medium rounded-md transition-colors border border-[#1a7f37]/80"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
          Invite user
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-sm text-[#656d76]">Loading users…</div>
        ) : error ? (
          <div className="text-sm text-[#d1242f]">{error}</div>
        ) : (
          <div className="bg-white border border-[#d1d9e0] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-[#f6f8fa] border-b border-[#d1d9e0]">
                <tr>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">User</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Email</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Role</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Status</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Invited</th>
                  <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Accepted</th>
                  <th className="px-4 py-2.5"></th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const isSoleOwner = u.role === "owner" && ownerCount <= 1;
                  return (
                  <tr key={u.id} className="border-b border-[#d1d9e0] last:border-0 hover:bg-[#f6f8fa]">
                    <td className="px-4 py-2.5 font-medium text-[#1f2328]">{u.displayName}</td>
                    <td className="px-4 py-2.5 text-[#656d76]">{u.email}</td>
                    <td className="px-4 py-2.5">
                      {isSoleOwner ? (
                        <span
                          title="At least one owner is required"
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border ${ROLE_COLOR[u.role]}`}
                        >
                          Owner
                        </span>
                      ) : (
                        <select
                          value={u.role}
                          onChange={(e) => handleChangeRole(u.id, e.target.value as AppRole)}
                          className={`text-xs font-medium px-2 py-0.5 rounded-full border cursor-pointer ${ROLE_COLOR[u.role]}`}
                        >
                          <option value="owner">Owner</option>
                          <option value="project_owner">Project Owner</option>
                          <option value="qa_manager">QA Manager</option>
                          <option value="qa_engineer">QA Engineer</option>
                          <option value="member">Member</option>
                        </select>
                      )}
                    </td>
                    <td className={`px-4 py-2.5 text-xs font-medium capitalize ${STATUS_COLOR[u.status] ?? ""}`}>
                      {u.status}
                    </td>
                    <td className="px-4 py-2.5 text-[#656d76] text-xs">{formatDate(u.invitedAt)}</td>
                    <td className="px-4 py-2.5 text-[#656d76] text-xs">{formatDate(u.acceptedAt)}</td>
                    <td className="px-4 py-2.5 text-right">
                      {isSoleOwner ? (
                        <span
                          title="Cannot remove the last owner"
                          className="text-[#d1d9e0] p-1 inline-block"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </span>
                      ) : (
                        <button
                          onClick={() => handleRemove(u.id, u.displayName)}
                          title="Remove user"
                          className="text-[#656d76] hover:text-[#d1242f] p-1 rounded-md hover:bg-[#ffebe9] transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </td>
                  </tr>
                  );
                })}
                {users.length === 0 && (
                  <tr><td colSpan={7} className="px-4 py-8 text-center text-[#656d76]">No users yet</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Invite modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowInvite(false)}>
          <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-4 py-3 border-b border-[#d1d9e0]">
              <span className="text-base font-semibold text-[#1f2328]">Invite user</span>
            </div>
            <div className="px-4 py-4 space-y-3">
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  placeholder="name@kovai.co"
                  className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                  autoFocus
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1">Role</label>
                <select
                  value={inviteRole}
                  onChange={(e) => setInviteRole(e.target.value as AppRole)}
                  className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                >
                  <option value="member">Member</option>
                  <option value="qa_engineer">QA Engineer</option>
                  <option value="qa_manager">QA Manager</option>
                  <option value="project_owner">Project Owner</option>
                  <option value="owner">Owner</option>
                </select>
              </div>
              {inviteError && (
                <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
                  {inviteError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
              <button
                onClick={() => setShowInvite(false)}
                className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleInvite()}
                disabled={inviting || !inviteEmail.trim()}
                className="text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 disabled:opacity-50 rounded-md px-3 py-1.5 transition-colors border border-[#1a7f37]/80"
              >
                {inviting ? "Inviting…" : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
