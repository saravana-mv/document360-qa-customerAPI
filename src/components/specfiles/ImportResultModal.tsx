import { useState, useMemo, useCallback, useRef } from "react";
import { Modal } from "../common/Modal";
import type { SuggestedVariable, SuggestedConnection, ProcessingReport } from "../../lib/api/specFilesApi";

const PROVIDER_LABELS: Record<string, string> = {
  oauth2: "OAuth 2.0",
  bearer: "Bearer Token",
  apikey_header: "API Key (Header)",
  apikey_query: "API Key (Query)",
  basic: "Basic Auth",
  cookie: "Cookie",
};

type VarSortKey = "name" | "folder" | "type";
type SortDir = "asc" | "desc";

interface ImportResultModalProps {
  open: boolean;
  folderName: string;
  stats: { endpoints: number; folders: number };
  processing?: ProcessingReport;
  suggestedVariables: SuggestedVariable[];
  existingVariableNames: Set<string>;
  suggestedConnections: SuggestedConnection[];
  existingConnectionNames: Set<string>;
  onDone: (selectedVarNames: string[], selectedConnections: SuggestedConnection[]) => void;
  onSkip: () => void;
}

export function ImportResultModal({
  open,
  folderName,
  stats,
  processing,
  suggestedVariables,
  existingVariableNames,
  suggestedConnections,
  existingConnectionNames,
  onDone,
  onSkip,
}: ImportResultModalProps) {
  // ── Variables ───────────────────────────────────────────────────────────────
  const newVars = useMemo(
    () => suggestedVariables.filter(v => !existingVariableNames.has(v.name)),
    [suggestedVariables, existingVariableNames],
  );
  const existingVars = useMemo(
    () => suggestedVariables.filter(v => existingVariableNames.has(v.name)),
    [suggestedVariables, existingVariableNames],
  );

  const [selectedVars, setSelectedVars] = useState<Set<string>>(() => new Set(newVars.map(v => v.name)));
  const [varSearch, setVarSearch] = useState("");
  const [varSortKey, setVarSortKey] = useState<VarSortKey>("name");
  const [varSortDir, setVarSortDir] = useState<SortDir>("asc");

  // Resizable column widths (px)
  const [nameColWidth, setNameColWidth] = useState(160);
  const [folderColWidth, setFolderColWidth] = useState(200);
  // Type column takes the remainder

  const toggleVar = (name: string) => {
    setSelectedVars(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllVars = () => {
    if (selectedVars.size === newVars.length) setSelectedVars(new Set());
    else setSelectedVars(new Set(newVars.map(v => v.name)));
  };

  const handleVarSort = (key: VarSortKey) => {
    if (varSortKey === key) setVarSortDir(d => d === "asc" ? "desc" : "asc");
    else { setVarSortKey(key); setVarSortDir("asc"); }
  };

  const folderLabel = (v: SuggestedVariable) =>
    v.folders && v.folders.length > 0 ? v.folders.join(", ") : "—";

  const sortVar = useCallback((a: SuggestedVariable, b: SuggestedVariable): number => {
    let cmp: number;
    if (varSortKey === "name") cmp = a.name.localeCompare(b.name);
    else if (varSortKey === "folder") cmp = folderLabel(a).localeCompare(folderLabel(b));
    else cmp = a.type.localeCompare(b.type);
    return varSortDir === "asc" ? cmp : -cmp;
  }, [varSortKey, varSortDir]);

  const searchLower = varSearch.toLowerCase();
  const filteredNewVars = useMemo(
    () => newVars
      .filter(v =>
        !searchLower ||
        v.name.toLowerCase().includes(searchLower) ||
        (v.description !== v.name && v.description.toLowerCase().includes(searchLower)) ||
        folderLabel(v).toLowerCase().includes(searchLower)
      )
      .sort(sortVar),
    [newVars, searchLower, sortVar],
  );
  const filteredExistingVars = useMemo(
    () => existingVars
      .filter(v =>
        !searchLower ||
        v.name.toLowerCase().includes(searchLower) ||
        folderLabel(v).toLowerCase().includes(searchLower)
      )
      .sort(sortVar),
    [existingVars, searchLower, sortVar],
  );

  // ── Connections ─────────────────────────────────────────────────────────────
  const newConns = useMemo(
    () => suggestedConnections.filter(c => !existingConnectionNames.has(c.name)),
    [suggestedConnections, existingConnectionNames],
  );
  const existingConns = useMemo(
    () => suggestedConnections.filter(c => existingConnectionNames.has(c.name)),
    [suggestedConnections, existingConnectionNames],
  );

  const [selectedConns, setSelectedConns] = useState<Set<string>>(() => new Set(newConns.map(c => c.name)));

  const toggleConn = (name: string) => {
    setSelectedConns(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const toggleAllConns = () => {
    if (selectedConns.size === newConns.length) setSelectedConns(new Set());
    else setSelectedConns(new Set(newConns.map(c => c.name)));
  };

  // ── Counts ──────────────────────────────────────────────────────────────────
  const hasVariables = suggestedVariables.length > 0;
  const hasConnections = suggestedConnections.length > 0;
  const totalSelected = selectedVars.size + selectedConns.size;

  const handleDone = () => {
    const selConns = suggestedConnections.filter(c => selectedConns.has(c.name) && !existingConnectionNames.has(c.name));
    onDone(Array.from(selectedVars), selConns);
  };

  return (
    <Modal
      open={open}
      onClose={onSkip}
      title="Import Complete"
      maxWidth="max-w-3xl"
      footer={
        <div className="flex gap-2">
          <button
            onClick={onSkip}
            className="px-3 py-1.5 text-sm rounded-md border border-[#d1d9e0] text-[#1f2328] hover:bg-[#f6f8fa] transition-colors"
          >
            Skip
          </button>
          {(hasVariables || hasConnections) && (
            <button
              onClick={handleDone}
              disabled={totalSelected === 0}
              className="px-3 py-1.5 text-sm rounded-md text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: totalSelected > 0 ? "#1a7f37" : "#8b949e" }}
            >
              {totalSelected > 0 ? `Save ${totalSelected} item${totalSelected > 1 ? "s" : ""}` : "Nothing selected"}
            </button>
          )}
        </div>
      }
    >
      {/* Stats */}
      <div className="flex items-center gap-2 mb-4 px-3 py-2.5 rounded-md" style={{ backgroundColor: "#ddf4ff" }}>
        <svg className="w-4 h-4 shrink-0" style={{ color: "#1a7f37" }} viewBox="0 0 16 16" fill="currentColor">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
        </svg>
        <span className="text-sm text-[#1f2328]">
          Created <strong>{folderName}</strong> with {stats.endpoints} endpoint{stats.endpoints !== 1 ? "s" : ""} in {stats.folders} folder{stats.folders !== 1 ? "s" : ""}
        </span>
      </div>

      {/* Processing health */}
      {processing && (() => {
        const { distillation, digest } = processing;
        const hasErrors = distillation.errors > 0;
        const hasWarnings = !hasErrors && (distillation.unchanged > 0 || !digest.built);
        const allGreen = !hasErrors && !hasWarnings;

        if (allGreen) {
          return (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-md" style={{ backgroundColor: "#dafbe1" }}>
              <svg className="w-4 h-4 shrink-0" style={{ color: "#1a7f37" }} viewBox="0 0 16 16" fill="currentColor">
                <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.75.75 0 0 1 1.06-1.06L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z" />
              </svg>
              <span className="text-sm text-[#1f2328]">
                All {distillation.distilled} endpoint{distillation.distilled !== 1 ? "s" : ""} processed. Digest index built.
              </span>
            </div>
          );
        }

        if (hasWarnings) {
          return (
            <div className="flex items-center gap-2 mb-4 px-3 py-2 rounded-md" style={{ backgroundColor: "#fff8c5" }}>
              <svg className="w-4 h-4 shrink-0" style={{ color: "#9a6700" }} viewBox="0 0 16 16" fill="currentColor">
                <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm1 6a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" />
              </svg>
              <span className="text-sm text-[#1f2328]">
                {distillation.distilled} of {distillation.total} file{distillation.total !== 1 ? "s" : ""} distilled.{" "}
                {!digest.built ? "Digest will build on first use." : "Digest index built."}
              </span>
            </div>
          );
        }

        // Errors
        return (
          <div className="mb-4 rounded-md" style={{ backgroundColor: "#ffebe9" }}>
            <div className="flex items-center gap-2 px-3 py-2">
              <svg className="w-4 h-4 shrink-0" style={{ color: "#d1242f" }} viewBox="0 0 16 16" fill="currentColor">
                <path d="M2.343 13.657A8 8 0 1 1 13.66 2.343 8 8 0 0 1 2.343 13.657ZM6.03 4.97a.751.751 0 0 0-1.042.018.751.751 0 0 0-.018 1.042L6.94 8 4.97 9.97a.749.749 0 0 0 .326 1.275.749.749 0 0 0 .734-.215L8 9.06l1.97 1.97a.749.749 0 0 0 1.275-.326.749.749 0 0 0-.215-.734L9.06 8l1.97-1.97a.749.749 0 0 0-.326-1.275.749.749 0 0 0-.734.215L8 6.94Z" />
              </svg>
              <span className="text-sm text-[#1f2328]">
                {distillation.distilled} of {distillation.total} distilled. {distillation.errors} file{distillation.errors !== 1 ? "s" : ""} failed.
                {!digest.built ? " Digest will build on first use." : ""}
              </span>
            </div>
            {distillation.errorDetails.length > 0 && (
              <details className="px-3 pb-2">
                <summary className="text-sm text-[#656d76] cursor-pointer hover:text-[#1f2328]">Show errors</summary>
                <ul className="mt-1 space-y-0.5">
                  {distillation.errorDetails.map((d, i) => (
                    <li key={i} className="text-sm text-[#656d76] font-mono truncate">
                      {d.file.split("/").pop()}: {d.error}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        );
      })()}

      {/* Connections section */}
      {hasConnections && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[#1f2328]">Detected Authentication</h3>
            {newConns.length > 0 && (
              <button
                onClick={toggleAllConns}
                className="text-xs text-[#0969da] hover:underline"
              >
                {selectedConns.size === newConns.length ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          {/* Warning banner */}
          <div className="flex items-start gap-2 mb-3 px-3 py-2 rounded-md border border-[#d4a72c]" style={{ backgroundColor: "#fff8c5" }}>
            <svg className="w-4 h-4 shrink-0 mt-0.5" style={{ color: "#9a6700" }} viewBox="0 0 16 16" fill="currentColor">
              <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575ZM8 5a.75.75 0 0 0-.75.75v2.5a.75.75 0 0 0 1.5 0v-2.5A.75.75 0 0 0 8 5Zm1 6a1 1 0 1 0-2 0 1 1 0 0 0 2 0Z" />
            </svg>
            <span className="text-sm text-[#1f2328]">
              Connections will be created without credentials. You must configure them in <strong>Settings &rarr; Connections</strong> before executing scenarios.
            </span>
          </div>
          <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
            {newConns.map(c => (
              <label
                key={c.name}
                className="flex items-center gap-3 px-3 py-2 hover:bg-[#f6f8fa] transition-colors cursor-pointer border-b border-[#d1d9e0] last:border-b-0"
              >
                <input
                  type="checkbox"
                  checked={selectedConns.has(c.name)}
                  onChange={() => toggleConn(c.name)}
                  className="rounded accent-[#0969da]"
                />
                <code className="text-sm font-mono text-[#1f2328] shrink-0">{c.name}</code>
                <span className="text-sm text-[#656d76] truncate flex-1">{c.description ?? ""}</span>
                <span className="text-xs text-[#656d76] shrink-0 px-1.5 py-0.5 rounded bg-[#f6f8fa] border border-[#d1d9e0]">
                  {PROVIDER_LABELS[c.provider] ?? c.provider}
                </span>
              </label>
            ))}
            {existingConns.map(c => (
              <label
                key={c.name}
                className="flex items-center gap-3 px-3 py-2 border-b border-[#d1d9e0] last:border-b-0 opacity-50 cursor-default"
              >
                <input type="checkbox" checked disabled className="rounded" />
                <code className="text-sm font-mono text-[#656d76] shrink-0">{c.name}</code>
                <span className="text-xs text-[#656d76] italic shrink-0">(already exists)</span>
                <span className="flex-1" />
                <span className="text-xs text-[#656d76] shrink-0 px-1.5 py-0.5 rounded bg-[#f6f8fa] border border-[#d1d9e0]">
                  {PROVIDER_LABELS[c.provider] ?? c.provider}
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Variables section */}
      {hasVariables && (
        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-[#1f2328]">
              Detected Path Parameters
              <span className="text-xs font-normal text-[#656d76] ml-1.5">{suggestedVariables.length}</span>
            </h3>
            {newVars.length > 0 && (
              <button
                onClick={toggleAllVars}
                className="text-xs text-[#0969da] hover:underline"
              >
                {selectedVars.size === newVars.length ? "Deselect all" : "Select all"}
              </button>
            )}
          </div>
          <p className="text-sm text-[#656d76] mb-3">
            Selected parameters will be saved as project variables with empty values. Configure their values in Settings &rarr; Variables.
          </p>

          {/* Search */}
          {suggestedVariables.length > 5 && (
            <div className="relative mb-2">
              <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[#656d76]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
              </svg>
              <input
                type="text"
                value={varSearch}
                onChange={(e) => setVarSearch(e.target.value)}
                placeholder="Search parameters…"
                className="w-full text-sm pl-8 pr-3 py-1.5 border rounded-md outline-none focus:ring-2 focus:ring-[#0969da]/30 focus:border-[#0969da]"
                style={{ borderColor: "#d1d9e0" }}
              />
              {varSearch && (
                <button
                  onClick={() => setVarSearch("")}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#656d76] hover:text-[#1f2328]"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
          )}

          {/* Table */}
          <div className="border border-[#d1d9e0] rounded-md overflow-hidden">
            {/* Column headers with resizable splitters */}
            <div className="flex items-center bg-[#f6f8fa] border-b border-[#d1d9e0] select-none">
              <span className="w-8 shrink-0" /> {/* checkbox */}
              <div className="relative flex items-center" style={{ width: nameColWidth }}>
                <SortableHeader label="Name" sortKey="name" currentKey={varSortKey} dir={varSortDir} onClick={handleVarSort} className="flex-1" />
                <ColumnResizer onResize={(delta) => setNameColWidth(w => Math.max(80, w + delta))} />
              </div>
              <div className="relative flex items-center" style={{ width: folderColWidth }}>
                <SortableHeader label="Folder" sortKey="folder" currentKey={varSortKey} dir={varSortDir} onClick={handleVarSort} className="flex-1" />
                <ColumnResizer onResize={(delta) => setFolderColWidth(w => Math.max(80, w + delta))} />
              </div>
              <SortableHeader label="Type" sortKey="type" currentKey={varSortKey} dir={varSortDir} onClick={handleVarSort} className="w-[70px] shrink-0" />
            </div>

            {/* Scrollable rows */}
            <div className="max-h-[320px] overflow-y-auto">
              {filteredNewVars.map(v => (
                <label
                  key={v.name}
                  className="flex items-center hover:bg-[#f6f8fa] transition-colors cursor-pointer border-b border-[#d1d9e0] last:border-b-0"
                >
                  <span className="w-8 shrink-0 flex items-center justify-center">
                    <input
                      type="checkbox"
                      checked={selectedVars.has(v.name)}
                      onChange={() => toggleVar(v.name)}
                      className="rounded accent-[#0969da]"
                    />
                  </span>
                  <span className="text-sm font-mono text-[#1f2328] truncate py-2 pr-2" style={{ width: nameColWidth }} title={v.name}>{v.name}</span>
                  <span className="text-sm text-[#656d76] truncate py-2 pr-2 flex-1" style={{ minWidth: folderColWidth }} title={folderLabel(v)}>{folderLabel(v)}</span>
                  <span className="text-sm text-[#656d76] w-[70px] shrink-0 py-2 pr-3">{v.type}</span>
                </label>
              ))}
              {filteredExistingVars.map(v => (
                <label
                  key={v.name}
                  className="flex items-center border-b border-[#d1d9e0] last:border-b-0 opacity-50 cursor-default"
                >
                  <span className="w-8 shrink-0 flex items-center justify-center">
                    <input type="checkbox" checked disabled className="rounded" />
                  </span>
                  <span className="text-sm font-mono text-[#656d76] truncate py-2 pr-2" style={{ width: nameColWidth }}>{v.name}</span>
                  <span className="text-xs text-[#656d76] italic py-2 pr-2" style={{ width: folderColWidth }}>(already exists)</span>
                  <span className="text-sm text-[#656d76] w-[70px] shrink-0 py-2 pr-3">{v.type}</span>
                </label>
              ))}
              {filteredNewVars.length === 0 && filteredExistingVars.length === 0 && varSearch && (
                <div className="px-3 py-4 text-sm text-[#656d76] text-center">
                  No parameters matching "{varSearch}"
                </div>
              )}
            </div>
          </div>
          <p className="text-xs text-[#656d76] mt-2 italic">NOTE: Path parameters are standardized to camelCase</p>
        </div>
      )}

      {/* No detections at all */}
      {!hasVariables && !hasConnections && (
        <p className="text-sm text-[#656d76]">No path parameters or authentication schemes detected in this spec.</p>
      )}
    </Modal>
  );
}

// ── Sortable column header ────────────────────────────────────────────────────

function SortableHeader({ label, sortKey, currentKey, dir, onClick, className }: {
  label: string;
  sortKey: VarSortKey;
  currentKey: VarSortKey;
  dir: SortDir;
  onClick: (key: VarSortKey) => void;
  className?: string;
}) {
  const active = currentKey === sortKey;
  return (
    <button
      onClick={() => onClick(sortKey)}
      className={`flex items-center gap-1 text-xs font-medium px-2 py-1.5 transition-colors ${
        active ? "text-[#1f2328]" : "text-[#656d76] hover:text-[#1f2328]"
      } ${className ?? ""}`}
    >
      {label}
      {active && (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          {dir === "asc"
            ? <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
            : <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          }
        </svg>
      )}
    </button>
  );
}

// ── Column resizer handle ─────────────────────────────────────────────────────

function ColumnResizer({ onResize }: { onResize: (delta: number) => void }) {
  const startXRef = useRef(0);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    startXRef.current = e.clientX;

    const handleMouseMove = (ev: MouseEvent) => {
      const delta = ev.clientX - startXRef.current;
      if (delta !== 0) {
        onResize(delta);
        startXRef.current = ev.clientX;
      }
    };
    const handleMouseUp = () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  return (
    <div
      onMouseDown={handleMouseDown}
      className="absolute right-0 top-0 bottom-0 w-[5px] cursor-col-resize z-10 group"
    >
      <div className="absolute right-[2px] top-1 bottom-1 w-px bg-[#d1d9e0] group-hover:bg-[#0969da] transition-colors" />
    </div>
  );
}
