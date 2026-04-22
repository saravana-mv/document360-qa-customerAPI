// Project switcher in the TopBar — dropdown to switch between projects.
// Creating new projects is done on the /projects page.

import { useState, useRef, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../../store/project.store";
import { useSetupStore } from "../../store/setup.store";

export function ProjectPicker() {
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const loadProjects = useProjectStore((s) => s.load);
  const selectProject = useProjectStore((s) => s.select);
  const selectedProjectId = useSetupStore((s) => s.selectedProjectId);
  const navigate = useNavigate();

  const [open, setOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const selected = projects.find((p) => p.id === selectedProjectId);

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium text-[#e6edf3] bg-[#2d333b] border border-[#3d444d] hover:border-[#525964] transition-colors max-w-[200px]"
      >
        <svg className="w-3.5 h-3.5 text-[#8b949e] shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
        </svg>
        <span className="truncate">{selected?.name ?? (loading ? "Loading…" : "No project")}</span>
        <svg className="w-3 h-3 text-[#8b949e] shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 w-64 bg-[#2d333b] border border-[#3d444d] rounded-lg shadow-xl z-50 overflow-hidden">
          <div className="max-h-60 overflow-y-auto">
            {projects.length === 0 && !loading && (
              <div className="px-3 py-4 text-xs text-[#8b949e] text-center">No projects</div>
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
                {p.id === selectedProjectId ? (
                  <svg className="w-3.5 h-3.5 text-[#0969da] shrink-0" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                ) : (
                  <span className="w-3.5 shrink-0" />
                )}
                <span className="truncate font-medium">{p.name}</span>
              </button>
            ))}
          </div>

          {/* Link to project management page */}
          <div className="border-t border-[#3d444d]">
            <button
              onClick={() => { setOpen(false); navigate("/projects"); }}
              className="w-full text-left px-3 py-2 text-xs text-[#0969da] hover:bg-[#3d444d] flex items-center gap-2 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 0 1 6 3.75h2.25A2.25 2.25 0 0 1 10.5 6v2.25a2.25 2.25 0 0 1-2.25 2.25H6a2.25 2.25 0 0 1-2.25-2.25V6ZM3.75 15.75A2.25 2.25 0 0 1 6 13.5h2.25a2.25 2.25 0 0 1 2.25 2.25V18a2.25 2.25 0 0 1-2.25 2.25H6A2.25 2.25 0 0 1 3.75 18v-2.25ZM13.5 6a2.25 2.25 0 0 1 2.25-2.25H18A2.25 2.25 0 0 1 20.25 6v2.25A2.25 2.25 0 0 1 18 10.5h-2.25a2.25 2.25 0 0 1-2.25-2.25V6ZM13.5 15.75a2.25 2.25 0 0 1 2.25-2.25H18a2.25 2.25 0 0 1 2.25 2.25V18A2.25 2.25 0 0 1 18 20.25h-2.25A2.25 2.25 0 0 1 13.5 18v-2.25Z" />
              </svg>
              All projects
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
