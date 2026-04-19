import { useCallback, useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { useUserStore } from "../store/user.store";
import { fetchAuditLog, type AuditEntry } from "../lib/api/auditLogApi";

const PAGE_SIZE = 50;

const ACTION_GROUPS: Record<string, string[]> = {
  Flows: ["flow.create", "flow.update", "flow.delete", "flow.lock", "flow.unlock"],
  Scenarios: ["scenario.activate", "scenario.deactivate", "scenario.run"],
  Specs: ["spec.upload", "spec.update", "spec.rename", "spec.delete", "spec.import_url", "spec.sync"],
  "API Keys": ["apikey.create", "apikey.revoke"],
  Users: ["user.invite", "user.role_change", "user.remove"],
  Project: ["project.reset"],
};

const ACTION_LABELS: Record<string, string> = {
  "flow.create": "Flow created",
  "flow.update": "Flow updated",
  "flow.delete": "Flow deleted",
  "flow.lock": "Flow locked",
  "flow.unlock": "Flow unlocked",
  "scenario.activate": "Scenario activated",
  "scenario.deactivate": "Scenario deactivated",
  "scenario.run": "Scenario run",
  "spec.upload": "Spec uploaded",
  "spec.update": "Spec updated",
  "spec.rename": "Spec renamed",
  "spec.delete": "Spec deleted",
  "spec.import_url": "Spec imported",
  "spec.sync": "Spec synced",
  "apikey.create": "API key created",
  "apikey.revoke": "API key revoked",
  "user.invite": "User invited",
  "user.role_change": "Role changed",
  "user.remove": "User removed",
  "project.reset": "Project reset",
};

const ACTION_COLORS: Record<string, string> = {
  flow: "bg-[#ddf4ff] text-[#0969da]",
  scenario: "bg-[#dafbe1] text-[#1a7f37]",
  spec: "bg-[#fff8c5] text-[#9a6700]",
  apikey: "bg-[#fbefff] text-[#8250df]",
  user: "bg-[#ffebe9] text-[#d1242f]",
  project: "bg-[#ffebe9] text-[#d1242f]",
};

function actionColor(action: string): string {
  const prefix = action.split(".")[0];
  return ACTION_COLORS[prefix] ?? "bg-[#f6f8fa] text-[#656d76]";
}

function formatTimestamp(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
  } catch {
    return iso;
  }
}

function formatDetails(entry: AuditEntry): string {
  if (!entry.details) return "";
  const parts: string[] = [];
  for (const [k, v] of Object.entries(entry.details)) {
    if (v === undefined || v === null) continue;
    parts.push(`${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`);
  }
  return parts.join(", ");
}

/** Standalone page — redirects unauthorized users. */
export function AuditLogPage() {
  const { hasRole } = useUserStore();
  if (!hasRole("qa_manager")) return <Navigate to="/spec-files" replace />;
  return <AuditLogContent />;
}

/** Content-only — used inside the Settings layout. */
export function AuditLogContent() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(0);

  // Filters
  const [actionFilter, setActionFilter] = useState("");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const load = useCallback(async (pageNum: number) => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchAuditLog({
        action: actionFilter || undefined,
        search: search || undefined,
        from: fromDate ? new Date(fromDate).toISOString() : undefined,
        to: toDate ? new Date(toDate + "T23:59:59").toISOString() : undefined,
        limit: PAGE_SIZE,
        offset: pageNum * PAGE_SIZE,
      });
      setEntries(result.entries);
      setTotal(result.total);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [actionFilter, search, fromDate, toDate]);

  useEffect(() => {
    setPage(0);
    load(0);
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const handlePageChange = useCallback((newPage: number) => {
    setPage(newPage);
    load(newPage);
  }, [load]);

  const handleSearch = useCallback(() => {
    setSearch(searchInput);
  }, [searchInput]);

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 px-6 h-14 border-b border-[#d1d9e0] bg-[#f6f8fa] shrink-0">
        <svg className="w-5 h-5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
        </svg>
        <span className="text-sm font-bold text-[#1f2328]">Audit Log</span>
        <span className="text-xs text-[#656d76] ml-1">
          {total} {total === 1 ? "entry" : "entries"}
        </span>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 px-6 py-2.5 border-b border-[#d1d9e0] bg-white flex-wrap">
        {/* Search */}
        <div className="flex items-center gap-1.5">
          <div className="relative">
            <input
              type="text"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleSearch(); }}
              placeholder="Search actions, targets, users…"
              className="w-64 pl-8 pr-3 py-1.5 border border-[#d1d9e0] rounded-md text-sm focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none bg-[#f6f8fa]"
            />
            <svg className="w-4 h-4 text-[#656d76] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
            </svg>
          </div>
        </div>

        {/* Action filter */}
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3 py-1.5 border border-[#d1d9e0] rounded-md text-sm bg-white focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
        >
          <option value="">All actions</option>
          {Object.entries(ACTION_GROUPS).map(([group, actions]) => (
            <optgroup key={group} label={group}>
              {actions.map((a) => (
                <option key={a} value={a}>{ACTION_LABELS[a] ?? a}</option>
              ))}
            </optgroup>
          ))}
        </select>

        {/* Date range */}
        <div className="flex items-center gap-1.5">
          <input
            type="date"
            value={fromDate}
            onChange={(e) => setFromDate(e.target.value)}
            className="px-2 py-1.5 border border-[#d1d9e0] rounded-md text-sm bg-white focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
          />
          <span className="text-xs text-[#656d76]">to</span>
          <input
            type="date"
            value={toDate}
            onChange={(e) => setToDate(e.target.value)}
            className="px-2 py-1.5 border border-[#d1d9e0] rounded-md text-sm bg-white focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da] outline-none"
          />
        </div>

        {/* Clear filters */}
        {(actionFilter || search || fromDate || toDate) && (
          <button
            onClick={() => {
              setActionFilter("");
              setSearch("");
              setSearchInput("");
              setFromDate("");
              setToDate("");
            }}
            className="text-xs text-[#0969da] hover:underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="text-sm text-[#656d76]">Loading audit log…</div>
        ) : error ? (
          <div className="text-sm text-[#d1242f]">{error}</div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-[#656d76]">
            <svg className="w-12 h-12 mb-3 opacity-40" fill="none" stroke="currentColor" strokeWidth={1} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
            </svg>
            <p className="text-sm">No audit entries found</p>
            {(actionFilter || search || fromDate || toDate) && (
              <p className="text-xs mt-1">Try adjusting your filters</p>
            )}
          </div>
        ) : (
          <>
            <div className="bg-white border border-[#d1d9e0] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-[#f6f8fa] border-b border-[#d1d9e0]">
                  <tr>
                    <th className="text-left px-4 py-2.5 font-medium text-[#1f2328] w-40">Time</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#1f2328] w-44">Action</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#1f2328] w-36">User</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Target</th>
                    <th className="text-left px-4 py-2.5 font-medium text-[#1f2328]">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => (
                    <tr key={entry.id} className="border-b border-[#d1d9e0] last:border-0 hover:bg-[#f6f8fa]">
                      <td className="px-4 py-2.5 text-xs text-[#656d76] whitespace-nowrap">
                        {formatTimestamp(entry.timestamp)}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${actionColor(entry.action)}`}>
                          {ACTION_LABELS[entry.action] ?? entry.action}
                        </span>
                      </td>
                      <td className="px-4 py-2.5 text-[#1f2328] text-xs font-medium">
                        {entry.actor.name}
                      </td>
                      <td className="px-4 py-2.5 text-[#656d76] text-xs font-mono truncate max-w-[300px]" title={entry.target}>
                        {entry.target ?? "—"}
                      </td>
                      <td className="px-4 py-2.5 text-[#656d76] text-xs truncate max-w-[250px]" title={formatDetails(entry)}>
                        {formatDetails(entry) || "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4">
                <span className="text-xs text-[#656d76]">
                  Showing {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handlePageChange(page - 1)}
                    disabled={page === 0}
                    className="px-3 py-1.5 text-sm border border-[#d1d9e0] rounded-md bg-white hover:bg-[#f6f8fa] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Previous
                  </button>
                  <span className="px-3 py-1.5 text-xs text-[#656d76]">
                    Page {page + 1} of {totalPages}
                  </span>
                  <button
                    onClick={() => handlePageChange(page + 1)}
                    disabled={page >= totalPages - 1}
                    className="px-3 py-1.5 text-sm border border-[#d1d9e0] rounded-md bg-white hover:bg-[#f6f8fa] disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
