import { useState, useRef, useEffect } from "react";
import { useProjectStore } from "../../store/project.store";
import { useSetupStore } from "../../store/setup.store";

export function ProjectPicker() {
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const loadProjects = useProjectStore((s) => s.load);
  const createProject = useProjectStore((s) => s.create);
  const selectProject = useProjectStore((s) => s.select);
  const selectedProjectId = useSetupStore((s) => s.selectedProjectId);

  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load projects on mount
  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  // Close dropdown on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
        setNewName("");
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  // Focus input when creating
  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  const selected = projects.find((p) => p.id === selectedProjectId);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    try {
      await createProject(name);
      setNewName("");
      setCreating(false);
      setOpen(false);
    } catch (e) {
      console.error("[ProjectPicker] create failed:", e);
    }
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[#e6edf3] bg-[#2d333b] border border-[#3d444d] hover:border-[#525964] transition-colors max-w-[200px]"
      >
        {/* Folder icon */}
        <svg className="w-3.5 h-3.5 text-[#8b949e] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>
        <span className="truncate">{selected?.name ?? (loading ? "Loading…" : "No project")}</span>
        {/* Chevron */}
        <svg className="w-3 h-3 text-[#8b949e] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-[#2d333b] border border-[#3d444d] rounded-lg shadow-xl z-50 overflow-hidden">
          {/* Project list */}
          <div className="max-h-60 overflow-y-auto">
            {projects.length === 0 && !loading && (
              <div className="px-3 py-4 text-xs text-[#8b949e] text-center">No projects yet</div>
            )}
            {loading && projects.length === 0 && (
              <div className="px-3 py-4 text-xs text-[#8b949e] text-center">Loading…</div>
            )}
            {projects.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  selectProject(p.id);
                  setOpen(false);
                }}
                className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                  p.id === selectedProjectId
                    ? "bg-[#388bfd26] text-[#e6edf3]"
                    : "text-[#adbac7] hover:bg-[#3d444d]"
                }`}
              >
                {p.id === selectedProjectId && (
                  <svg className="w-3.5 h-3.5 text-[#0969da] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                )}
                {p.id !== selectedProjectId && <span className="w-3.5 shrink-0" />}
                <span className="truncate font-medium">{p.name}</span>
                {p.description && (
                  <span className="text-[#656d76] truncate ml-auto text-[11px]">{p.description}</span>
                )}
              </button>
            ))}
          </div>

          {/* Divider + Create new */}
          <div className="border-t border-[#3d444d]">
            {creating ? (
              <div className="p-2 flex items-center gap-2">
                <input
                  ref={inputRef}
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleCreate();
                    if (e.key === "Escape") { setCreating(false); setNewName(""); }
                  }}
                  placeholder="Project name"
                  className="flex-1 text-xs bg-[#1f2328] text-[#e6edf3] border border-[#3d444d] rounded px-2 py-1 outline-none focus:border-[#0969da]"
                />
                <button
                  onClick={handleCreate}
                  disabled={!newName.trim()}
                  className="text-xs font-medium text-[#1f2328] bg-[#1a7f37] hover:bg-[#1f883d] disabled:opacity-40 disabled:cursor-not-allowed rounded px-2 py-1 transition-colors"
                >
                  Create
                </button>
              </div>
            ) : (
              <button
                onClick={() => setCreating(true)}
                className="w-full text-left px-3 py-2 text-xs text-[#0969da] hover:bg-[#3d444d] flex items-center gap-2 transition-colors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New project
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
