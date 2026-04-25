// Global Settings page — Super Owner only.
// Accessible from the Projects page. Manages tenant-wide defaults
// (AI credit budgets) and Super Owner assignments.

import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useEntraAuthStore } from "../store/entraAuth.store";
import type { AppRole } from "../store/user.store";
import {
  getGlobalSettings,
  updateGlobalSettings,
  type GlobalSettings,
} from "../lib/api/globalSettingsApi";

// ── Types for the Users API (reuse existing endpoint) ──
interface UserRow {
  id: string;
  email: string;
  displayName: string;
  role: AppRole;
  status: "active" | "invited" | "disabled";
}

export function GlobalSettingsPage() {
  const navigate = useNavigate();
  const entraStatus = useEntraAuthStore((s) => s.status);
  const principal = useEntraAuthStore((s) => s.principal);
  const entraLogout = useEntraAuthStore((s) => s.logout);

  // ── AI Credits state ──
  const [settings, setSettings] = useState<GlobalSettings | null>(null);
  const [loadingSettings, setLoadingSettings] = useState(true);
  const [projectBudget, setProjectBudget] = useState("");
  const [userBudget, setUserBudget] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  // ── Super Owners state ──
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [usersError, setUsersError] = useState<string | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);

  // ── Load global settings ──
  const loadSettings = useCallback(async () => {
    setLoadingSettings(true);
    try {
      const data = await getGlobalSettings();
      setSettings(data);
      setProjectBudget(String(data.aiCredits.projectDefault));
      setUserBudget(String(data.aiCredits.userDefault));
    } catch {
      // Use defaults on error
      setProjectBudget("10");
      setUserBudget("5");
    } finally {
      setLoadingSettings(false);
    }
  }, []);

  // ── Load users (filter to Super Owners) ──
  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    setUsersError(null);
    try {
      const res = await fetch("/api/users");
      if (!res.ok) throw new Error(await res.text());
      const all = (await res.json()) as UserRow[];
      setUsers(all);
    } catch (e) {
      setUsersError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingUsers(false);
    }
  }, []);

  useEffect(() => { loadSettings(); loadUsers(); }, [loadSettings, loadUsers]);

  // ── Save AI credits ──
  async function handleSaveCredits() {
    const projVal = parseFloat(projectBudget);
    const userVal = parseFloat(userBudget);
    if (isNaN(projVal) || projVal < 0) return;
    if (isNaN(userVal) || userVal < 0) return;

    setSaving(true);
    setSaveMsg(null);
    try {
      const updated = await updateGlobalSettings({
        aiCredits: { projectDefault: projVal, userDefault: userVal },
      });
      setSettings(updated);
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  // ── Change user role ──
  async function handleChangeRole(userId: string, newRole: AppRole) {
    try {
      const res = await fetch(`/api/users/${userId}/role`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: newRole }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: res.statusText }));
        alert((body as { error?: string }).error ?? "Failed to change role");
        return;
      }
      await loadUsers();
    } catch (e) {
      console.error("Failed to change role:", e);
    }
  }

  // ── Invite as Super Owner ──
  async function handleInvite() {
    if (!inviteEmail.trim()) return;
    setInviting(true);
    setInviteError(null);
    try {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: inviteEmail.trim(), role: "owner" }),
      });
      if (!res.ok) {
        const body = await res.json() as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      setInviteEmail("");
      setShowInvite(false);
      await loadUsers();
    } catch (e) {
      setInviteError(e instanceof Error ? e.message : String(e));
    } finally {
      setInviting(false);
    }
  }

  const superOwners = users.filter((u) => u.role === "owner");
  const nonOwners = users.filter((u) => u.role !== "owner");
  const ownerCount = superOwners.filter((u) => u.status === "active").length;

  const ROLE_LABELS: Record<AppRole, string> = {
    owner: "Super Owner",
    project_owner: "Project Owner",
    qa_manager: "QA Manager",
    qa_engineer: "QA Engineer",
    member: "Member",
  };

  const ROLE_COLORS: Record<AppRole, string> = {
    owner: "bg-[#ffebe9] text-[#d1242f] border-[#ffcecb]",
    project_owner: "bg-[#ddf4ff] text-[#0969da] border-[#b6e3ff]",
    qa_manager: "bg-[#fff8c5] text-[#9a6700] border-[#f5e0a0]",
    qa_engineer: "bg-[#dafbe1] text-[#1a7f37] border-[#aceebb]",
    member: "bg-[#f6f8fa] text-[#656d76] border-[#d1d9e0]",
  };

  /** Roles available for assignment (excluding owner — handled separately) */
  const ASSIGNABLE_ROLES: AppRole[] = ["project_owner", "qa_manager", "qa_engineer", "member"];

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex flex-col">
      {/* Header */}
      <header className="h-14 bg-[#1f2328] text-[#e6edf3] flex items-center px-6 shrink-0">
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-2 text-sm font-bold tracking-[-0.01em] hover:text-white transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 19.5 8.25 12l7.5-7.5" />
          </svg>
          FLOW FORGE
        </button>
        <div className="flex-1" />
        {entraStatus === "authenticated" && principal && (
          <>
            <span className="text-xs text-[#8b949e] mr-3">{principal.userDetails}</span>
            <button
              onClick={entraLogout}
              className="text-xs text-[#7d8590] hover:text-[#e6edf3] transition-colors px-2 py-1 rounded-md hover:bg-[#2d333b]"
            >
              Sign out
            </button>
          </>
        )}
      </header>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center px-6 py-10">
        <div className="w-full max-w-3xl space-y-8">
          <div>
            <h1 className="text-2xl font-semibold text-[#1f2328]">Global Settings</h1>
            <p className="text-sm text-[#656d76] mt-1">Tenant-wide defaults applied to all new projects.</p>
          </div>

          {/* ── AI Credit Defaults ── */}
          <section className="bg-white rounded-lg border border-[#d1d9e0] shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#d1d9e0] bg-[#f6f8fa]">
              <svg className="w-5 h-5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0 1 15.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 0 1 3 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 0 0-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 0 1-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 0 0 3 15h-.75M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm3 0h.008v.008H18V10.5Zm-12 0h.008v.008H6V10.5Z" />
              </svg>
              <span className="text-sm font-semibold text-[#1f2328]">AI Credit Defaults</span>
            </div>
            <div className="px-5 py-5 space-y-4">
              <p className="text-xs text-[#656d76]">
                Default AI spending limits applied when creating new projects. These can be overridden per project later.
              </p>
              {loadingSettings ? (
                <div className="text-sm text-[#656d76]">Loading...</div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-[#1f2328] mb-1">
                        Project budget (USD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#656d76]">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={projectBudget}
                          onChange={(e) => setProjectBudget(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                        />
                      </div>
                      <p className="text-xs text-[#8b949e] mt-1">Max AI spend per project per month</p>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-[#1f2328] mb-1">
                        User budget (USD)
                      </label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#656d76]">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.5"
                          value={userBudget}
                          onChange={(e) => setUserBudget(e.target.value)}
                          className="w-full pl-7 pr-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                        />
                      </div>
                      <p className="text-xs text-[#8b949e] mt-1">Max AI spend per user per month</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => void handleSaveCredits()}
                      disabled={saving}
                      className="px-4 py-2 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1f883d] disabled:opacity-50 rounded-md transition-colors"
                    >
                      {saving ? "Saving..." : "Save defaults"}
                    </button>
                    {saveMsg && (
                      <span className={`text-xs font-medium ${saveMsg === "Saved" ? "text-[#1a7f37]" : "text-[#d1242f]"}`}>
                        {saveMsg}
                      </span>
                    )}
                    {settings?.updatedAt && (
                      <span className="text-xs text-[#8b949e] ml-auto">
                        Last updated: {new Date(settings.updatedAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </>
              )}
            </div>
          </section>

          {/* ── Super Owners ── */}
          <section className="bg-white rounded-lg border border-[#d1d9e0] shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#d1d9e0] bg-[#f6f8fa]">
              <svg className="w-5 h-5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
              </svg>
              <span className="text-sm font-semibold text-[#1f2328]">Super Owners</span>
              <span className="text-xs text-[#656d76]">({superOwners.length})</span>
              <div className="flex-1" />
              <button
                onClick={() => { setShowInvite(true); setInviteError(null); setInviteEmail(""); }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                Add Super Owner
              </button>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-[#656d76] mb-3">
                Super Owners have unrestricted access to all projects and can manage global settings.
              </p>
              {loadingUsers ? (
                <div className="text-sm text-[#656d76]">Loading users...</div>
              ) : usersError ? (
                <div className="text-sm text-[#d1242f]">{usersError}</div>
              ) : (
                <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f6f8fa] border-b border-[#d1d9e0]">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-[#1f2328]">Name</th>
                        <th className="text-left px-4 py-2 font-medium text-[#1f2328]">Email</th>
                        <th className="text-left px-4 py-2 font-medium text-[#1f2328]">Status</th>
                        <th className="px-4 py-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {superOwners.map((u) => {
                        const isSole = u.status === "active" && ownerCount <= 1;
                        return (
                          <tr key={u.id} className="border-b border-[#d1d9e0] last:border-0 hover:bg-[#f6f8fa]">
                            <td className="px-4 py-2.5 font-medium text-[#1f2328]">{u.displayName}</td>
                            <td className="px-4 py-2.5 text-[#656d76]">{u.email}</td>
                            <td className="px-4 py-2.5">
                              <span className={`text-xs font-medium capitalize ${u.status === "active" ? "text-[#1a7f37]" : "text-[#9a6700]"}`}>
                                {u.status}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              {isSole ? (
                                <span className="text-xs text-[#8b949e]" title="At least one Super Owner is required">Last owner</span>
                              ) : (
                                <button
                                  onClick={() => handleChangeRole(u.id, "project_owner")}
                                  title="Demote to Project Owner"
                                  className="text-xs text-[#656d76] hover:text-[#d1242f] px-2 py-1 rounded-md hover:bg-[#ffebe9] transition-colors"
                                >
                                  Remove
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {superOwners.length === 0 && (
                        <tr><td colSpan={4} className="px-4 py-6 text-center text-[#656d76]">No Super Owners</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Promote existing user */}
              {nonOwners.filter(u => u.status === "active").length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-medium text-[#1f2328] mb-2">Promote an existing user to Super Owner</p>
                  <div className="flex flex-wrap gap-2">
                    {nonOwners.filter(u => u.status === "active").map((u) => (
                      <button
                        key={u.id}
                        onClick={() => handleChangeRole(u.id, "owner")}
                        className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs text-[#656d76] border border-[#d1d9e0] rounded-md hover:border-[#0969da] hover:text-[#0969da] hover:bg-[#ddf4ff] transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
                        </svg>
                        {u.displayName || u.email}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </section>

          {/* ── All Tenant Users ── */}
          <section className="bg-white rounded-lg border border-[#d1d9e0] shadow-sm overflow-hidden">
            <div className="flex items-center gap-2.5 px-5 py-3.5 border-b border-[#d1d9e0] bg-[#f6f8fa]">
              <svg className="w-5 h-5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
              </svg>
              <span className="text-sm font-semibold text-[#1f2328]">Tenant Users</span>
              <span className="text-xs text-[#656d76]">({nonOwners.length})</span>
            </div>
            <div className="px-5 py-4">
              <p className="text-xs text-[#656d76] mb-3">
                All registered users. Change their tenant-level role to control what they can do across projects.
              </p>
              {loadingUsers ? (
                <div className="text-sm text-[#656d76]">Loading users...</div>
              ) : nonOwners.length === 0 ? (
                <div className="text-sm text-[#656d76] py-4 text-center">No non-owner users registered yet.</div>
              ) : (
                <div className="border border-[#d1d9e0] rounded-lg overflow-hidden">
                  <table className="w-full text-sm">
                    <thead className="bg-[#f6f8fa] border-b border-[#d1d9e0]">
                      <tr>
                        <th className="text-left px-4 py-2 font-medium text-[#1f2328]">Name</th>
                        <th className="text-left px-4 py-2 font-medium text-[#1f2328]">Email</th>
                        <th className="text-left px-4 py-2 font-medium text-[#1f2328]">Status</th>
                        <th className="text-left px-4 py-2 font-medium text-[#1f2328]">Role</th>
                      </tr>
                    </thead>
                    <tbody>
                      {nonOwners.map((u) => (
                        <tr key={u.id} className="border-b border-[#d1d9e0] last:border-0 hover:bg-[#f6f8fa]">
                          <td className="px-4 py-2.5 font-medium text-[#1f2328]">{u.displayName}</td>
                          <td className="px-4 py-2.5 text-[#656d76]">{u.email}</td>
                          <td className="px-4 py-2.5">
                            <span className={`text-xs font-medium capitalize ${u.status === "active" ? "text-[#1a7f37]" : u.status === "invited" ? "text-[#9a6700]" : "text-[#656d76]"}`}>
                              {u.status}
                            </span>
                          </td>
                          <td className="px-4 py-2.5">
                            <select
                              value={u.role}
                              onChange={(e) => handleChangeRole(u.id, e.target.value as AppRole)}
                              className={`text-xs font-medium rounded-full px-2.5 py-1 border cursor-pointer outline-none ${ROLE_COLORS[u.role]}`}
                            >
                              {ASSIGNABLE_ROLES.map((r) => (
                                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                              ))}
                            </select>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </section>
        </div>
      </div>

      {/* Invite Super Owner modal */}
      {showInvite && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={() => setShowInvite(false)}>
          <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[420px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-3 border-b border-[#d1d9e0]">
              <span className="text-base font-semibold text-[#1f2328]">Invite Super Owner</span>
              <button onClick={() => setShowInvite(false)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-4 py-4 space-y-3">
              <p className="text-xs text-[#656d76]">This person will have access to all projects and global settings.</p>
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1">Email address</label>
                <input
                  type="email"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") void handleInvite(); }}
                  placeholder="name@kovai.co"
                  className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
                  autoFocus
                />
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
                className="text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1a7f37]/90 disabled:opacity-50 rounded-md px-3 py-1.5 transition-colors"
              >
                {inviting ? "Inviting..." : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
