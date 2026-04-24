import { useEffect, useState, useCallback } from "react";
import { useAiCreditsStore } from "../../store/aiCredits.store";
import { useSetupStore } from "../../store/setup.store";
import { useUserStore, type AppRole } from "../../store/user.store";

interface UserCreditRow {
  userId: string;
  displayName: string;
  totalBudgetUsd: number;
  usedUsd: number;
  remainingUsd: number;
  callCount: number;
  lastUsedAt?: string;
}

export function AiCreditsPage() {
  const projectId = useSetupStore((s) => s.selectedProjectId);
  const { projectCredits, userCredits, loadCredits } = useAiCreditsStore();
  const hasRole = useUserStore((s) => s.hasRole);
  const isSuperOwner = hasRole("owner" as AppRole);

  const [budgetInput, setBudgetInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  const [userRows, setUserRows] = useState<UserCreditRow[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Editing user budget
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [userBudgetInput, setUserBudgetInput] = useState("");
  const [savingUser, setSavingUser] = useState(false);

  useEffect(() => {
    if (projectId) loadCredits(projectId);
  }, [projectId, loadCredits]);

  useEffect(() => {
    if (projectCredits) setBudgetInput(String(projectCredits.totalBudgetUsd));
  }, [projectCredits]);

  const loadUserCredits = useCallback(async () => {
    if (!projectId || !isSuperOwner) return;
    setLoadingUsers(true);
    try {
      const res = await fetch("/api/ai-credits/users", {
        headers: { "X-FlowForge-ProjectId": projectId },
      });
      if (!res.ok) throw new Error(await res.text());
      const data = (await res.json()) as UserCreditRow[];
      setUserRows(data);
    } catch {
      // silent
    } finally {
      setLoadingUsers(false);
    }
  }, [projectId, isSuperOwner]);

  useEffect(() => { loadUserCredits(); }, [loadUserCredits]);

  async function handleSaveBudget() {
    const val = parseFloat(budgetInput);
    if (isNaN(val) || val < 0 || !projectId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/ai-credits/project", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-FlowForge-ProjectId": projectId,
        },
        body: JSON.stringify({ totalBudgetUsd: val }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      setSaveMsg("Saved");
      setTimeout(() => setSaveMsg(null), 2000);
      loadCredits(projectId);
    } catch (e) {
      setSaveMsg(e instanceof Error ? e.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveUserBudget(userId: string) {
    const val = parseFloat(userBudgetInput);
    if (isNaN(val) || val < 0 || !projectId) return;
    setSavingUser(true);
    try {
      const res = await fetch(`/api/ai-credits/user/${userId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          "X-FlowForge-ProjectId": projectId,
        },
        body: JSON.stringify({ totalBudgetUsd: val }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? res.statusText);
      }
      setEditingUser(null);
      loadUserCredits();
      loadCredits(projectId);
    } catch {
      // silent
    } finally {
      setSavingUser(false);
    }
  }

  function formatUsd(n: number) {
    return `$${n.toFixed(2)}`;
  }

  function usagePercent(used: number, total: number) {
    if (total <= 0) return 100;
    return Math.min(100, Math.round((used / total) * 100));
  }

  function barColor(pct: number) {
    if (pct >= 90) return "bg-[#d1242f]";
    if (pct >= 70) return "bg-[#bf8700]";
    return "bg-[#1a7f37]";
  }

  const projPct = projectCredits ? usagePercent(projectCredits.usedUsd, projectCredits.totalBudgetUsd) : 0;
  const userPct = userCredits ? usagePercent(userCredits.usedUsd, userCredits.totalBudgetUsd) : 0;

  return (
    <div className="p-6 max-w-2xl overflow-y-auto h-full">
      <h2 className="text-sm font-bold text-[#1f2328] mb-1">AI Credits</h2>
      <p className="text-xs text-[#656d76] mb-6">
        Manage AI credit budgets for this project. Credits are consumed by flow generation, editing, chat, and idea generation.
      </p>

      {/* Project credits card */}
      <div className="border border-[#d1d9e0] rounded-lg bg-white mb-6">
        <div className="px-4 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa] rounded-t-lg">
          <h3 className="text-sm font-semibold text-[#1f2328]">Project Budget</h3>
        </div>
        <div className="p-4">
          {projectCredits ? (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-[#656d76]">
                  {formatUsd(projectCredits.usedUsd)} used of {formatUsd(projectCredits.totalBudgetUsd)}
                </span>
                <span className="text-xs font-medium text-[#1f2328]">
                  {formatUsd(projectCredits.remainingUsd)} remaining
                </span>
              </div>
              <div className="h-2 bg-[#eaeef2] rounded-full overflow-hidden mb-4">
                <div
                  className={`h-full rounded-full transition-all ${barColor(projPct)}`}
                  style={{ width: `${projPct}%` }}
                />
              </div>
              <div className="flex items-center gap-3 text-xs text-[#656d76]">
                <span>{projectCredits.callCount} API call{projectCredits.callCount !== 1 ? "s" : ""}</span>
                {projectCredits.lastUsedAt && (
                  <span>Last used {new Date(projectCredits.lastUsedAt).toLocaleDateString()}</span>
                )}
              </div>

              {/* Budget editor — Super Owner only */}
              {isSuperOwner && (
                <div className="mt-4 pt-4 border-t border-[#d1d9e0]">
                  <label className="block text-xs font-medium text-[#1f2328] mb-1">
                    Budget (USD)
                  </label>
                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 max-w-[200px]">
                      <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[#656d76]">$</span>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        value={budgetInput}
                        onChange={(e) => setBudgetInput(e.target.value)}
                        className="w-full pl-6 pr-3 py-1.5 text-sm border border-[#d1d9e0] rounded-md bg-white focus:outline-none focus:ring-2 focus:ring-[#0969da] focus:border-[#0969da]"
                      />
                    </div>
                    <button
                      onClick={handleSaveBudget}
                      disabled={saving}
                      className="px-3 py-1.5 bg-[#1a7f37] hover:bg-[#1a7f37]/90 text-white text-xs font-medium rounded-md transition-colors disabled:opacity-50 border border-[#1a7f37]/80"
                    >
                      {saving ? "Saving..." : "Update"}
                    </button>
                    {saveMsg && (
                      <span className={`text-xs ${saveMsg === "Saved" ? "text-[#1a7f37]" : "text-[#d1242f]"}`}>
                        {saveMsg}
                      </span>
                    )}
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="text-xs text-[#656d76]">Loading...</p>
          )}
        </div>
      </div>

      {/* Your credits card */}
      {userCredits && (
        <div className="border border-[#d1d9e0] rounded-lg bg-white mb-6">
          <div className="px-4 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa] rounded-t-lg">
            <h3 className="text-sm font-semibold text-[#1f2328]">Your Usage</h3>
          </div>
          <div className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-[#656d76]">
                {formatUsd(userCredits.usedUsd)} used of {formatUsd(userCredits.totalBudgetUsd)}
              </span>
              <span className="text-xs font-medium text-[#1f2328]">
                {formatUsd(userCredits.remainingUsd)} remaining
              </span>
            </div>
            <div className="h-2 bg-[#eaeef2] rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all ${barColor(userPct)}`}
                style={{ width: `${userPct}%` }}
              />
            </div>
            <div className="text-xs text-[#656d76]">
              {userCredits.callCount} API call{userCredits.callCount !== 1 ? "s" : ""}
            </div>
          </div>
        </div>
      )}

      {/* User credits table — Super Owner only */}
      {isSuperOwner && (
        <div className="border border-[#d1d9e0] rounded-lg bg-white">
          <div className="px-4 py-3 border-b border-[#d1d9e0] bg-[#f6f8fa] rounded-t-lg">
            <h3 className="text-sm font-semibold text-[#1f2328]">User Credits</h3>
          </div>
          <div className="p-4">
            {loadingUsers ? (
              <p className="text-xs text-[#656d76]">Loading...</p>
            ) : userRows.length === 0 ? (
              <p className="text-xs text-[#656d76]">No user credit records yet. Credits are created on each user's first AI call.</p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-xs text-[#656d76] border-b border-[#d1d9e0]">
                    <th className="text-left py-2 font-medium">User</th>
                    <th className="text-right py-2 font-medium">Used</th>
                    <th className="text-right py-2 font-medium">Budget</th>
                    <th className="text-right py-2 font-medium">Calls</th>
                    <th className="text-right py-2 font-medium w-24"></th>
                  </tr>
                </thead>
                <tbody>
                  {userRows.map((row) => (
                    <tr key={row.userId} className="border-b border-[#d1d9e0] last:border-0">
                      <td className="py-2 text-sm text-[#1f2328]">{row.displayName || row.userId}</td>
                      <td className="py-2 text-sm text-right text-[#1f2328]">{formatUsd(row.usedUsd)}</td>
                      <td className="py-2 text-sm text-right">
                        {editingUser === row.userId ? (
                          <div className="flex items-center justify-end gap-1">
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={userBudgetInput}
                              onChange={(e) => setUserBudgetInput(e.target.value)}
                              className="w-20 px-2 py-1 text-xs border border-[#d1d9e0] rounded-md text-right focus:outline-none focus:ring-2 focus:ring-[#0969da]"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveUserBudget(row.userId);
                                if (e.key === "Escape") setEditingUser(null);
                              }}
                            />
                            <button
                              onClick={() => handleSaveUserBudget(row.userId)}
                              disabled={savingUser}
                              className="px-2 py-1 bg-[#1a7f37] text-white text-xs rounded-md disabled:opacity-50"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingUser(null)}
                              className="px-2 py-1 text-xs text-[#656d76] hover:text-[#1f2328]"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <span
                            className="text-[#1f2328] cursor-pointer hover:text-[#0969da]"
                            onClick={() => {
                              setEditingUser(row.userId);
                              setUserBudgetInput(String(row.totalBudgetUsd));
                            }}
                            title="Click to edit budget"
                          >
                            {formatUsd(row.totalBudgetUsd)}
                          </span>
                        )}
                      </td>
                      <td className="py-2 text-sm text-right text-[#656d76]">{row.callCount}</td>
                      <td className="py-2 text-right">
                        <div className="w-16 h-1.5 bg-[#eaeef2] rounded-full overflow-hidden inline-block">
                          <div
                            className={`h-full rounded-full ${barColor(usagePercent(row.usedUsd, row.totalBudgetUsd))}`}
                            style={{ width: `${usagePercent(row.usedUsd, row.totalBudgetUsd)}%` }}
                          />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
