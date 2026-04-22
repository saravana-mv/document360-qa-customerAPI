// Full-screen project selection page — the first screen after login.
// Shows a tile grid of projects the user has access to.
// No TopBar, no SideNav — standalone page.

import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { useProjectStore } from "../store/project.store";
import { useSetupStore } from "../store/setup.store";
import { useUserStore } from "../store/user.store";
import { useEntraAuthStore } from "../store/entraAuth.store";
import { Spinner } from "../components/common/Spinner";
import type { ProjectDoc } from "../lib/api/projectsApi";

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString();
}

const VISIBILITY_LABEL = { team: "Team", personal: "Personal" } as const;

export function ProjectSelectionPage() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const loadProjects = useProjectStore((s) => s.load);
  const createProject = useProjectStore((s) => s.create);
  const selectProject = useProjectStore((s) => s.select);
  const entraStatus = useEntraAuthStore((s) => s.status);
  const principal = useEntraAuthStore((s) => s.principal);
  const entraLogout = useEntraAuthStore((s) => s.logout);
  const isSuperOwner = useUserStore((s) => s.user?.role === "owner");

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [newVisibility, setNewVisibility] = useState<"team" | "personal">("team");
  const [createError, setCreateError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  useEffect(() => {
    if (creating && inputRef.current) inputRef.current.focus();
  }, [creating]);

  function handleSelectProject(project: ProjectDoc) {
    selectProject(project.id);
    useSetupStore.getState().selectProject(project.id);
    navigate("/spec-files");
  }

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreateError(null);
    try {
      const doc = await createProject(name, newDesc.trim() || undefined, newVisibility);
      setNewName("");
      setNewDesc("");
      setCreating(false);
      // Navigate into the new project
      useSetupStore.getState().selectProject(doc.id);
      navigate("/spec-files");
    } catch (e) {
      setCreateError(e instanceof Error ? e.message : String(e));
    }
  }

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex flex-col">
      {/* Minimal header */}
      <header className="h-14 bg-[#1f2328] text-[#e6edf3] flex items-center px-6 shrink-0">
        <span className="text-sm font-bold tracking-[-0.01em]">FLOW FORGE</span>
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
      <div className="flex-1 flex flex-col items-center px-6 py-12">
        <div className="w-full max-w-4xl">
          {/* Heading */}
          <div className="flex items-end justify-between mb-8">
            <div>
              <h1 className="text-2xl font-semibold text-[#1f2328]">Projects</h1>
              <p className="text-sm text-[#656d76] mt-1">
                {isSuperOwner
                  ? "You have Super Owner access to all projects."
                  : "Select a project to get started, or create a new one."}
              </p>
            </div>
            {!creating && (
              <button
                onClick={() => setCreating(true)}
                className="flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1f883d] rounded-md transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
                </svg>
                New project
              </button>
            )}
          </div>

          {/* Create project card */}
          {creating && (
            <div className="bg-white rounded-lg border border-[#d1d9e0] shadow-sm p-5 mb-6">
              <h3 className="text-sm font-semibold text-[#1f2328] mb-4">Create a new project</h3>
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-medium text-[#656d76] mb-1">Project name</label>
                  <input
                    ref={inputRef}
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); if (e.key === "Escape") setCreating(false); }}
                    placeholder="My API Project"
                    className="w-full text-sm bg-white text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#656d76] mb-1">Description (optional)</label>
                  <input
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                    placeholder="Brief description of this project"
                    className="w-full text-sm bg-white text-[#1f2328] border border-[#d1d9e0] rounded-md px-3 py-2 outline-none focus:border-[#0969da] focus:ring-1 focus:ring-[#0969da]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-[#656d76] mb-1">Visibility</label>
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 text-sm text-[#1f2328] cursor-pointer">
                      <input
                        type="radio" name="visibility" checked={newVisibility === "team"}
                        onChange={() => setNewVisibility("team")}
                        className="accent-[#0969da]"
                      />
                      Team — members you invite can access
                    </label>
                    <label className="flex items-center gap-1.5 text-sm text-[#1f2328] cursor-pointer">
                      <input
                        type="radio" name="visibility" checked={newVisibility === "personal"}
                        onChange={() => setNewVisibility("personal")}
                        className="accent-[#0969da]"
                      />
                      Personal — only you
                    </label>
                  </div>
                </div>
                {createError && <p className="text-xs text-[#d1242f]">{createError}</p>}
                <div className="flex items-center gap-2 pt-1">
                  <button
                    onClick={handleCreate}
                    disabled={!newName.trim()}
                    className="px-4 py-2 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1f883d] disabled:opacity-40 disabled:cursor-not-allowed rounded-md transition-colors"
                  >
                    Create project
                  </button>
                  <button
                    onClick={() => { setCreating(false); setNewName(""); setNewDesc(""); setCreateError(null); }}
                    className="px-4 py-2 text-sm font-medium text-[#656d76] hover:text-[#1f2328] bg-white border border-[#d1d9e0] hover:bg-[#f6f8fa] rounded-md transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Loading */}
          {loading && projects.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 gap-3">
              <Spinner size="lg" className="text-[#0969da]" />
              <span className="text-sm text-[#656d76]">Loading projects…</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-[#ffebe9] border border-[#d1242f]/30 rounded-lg px-4 py-3 mb-6">
              <p className="text-sm text-[#d1242f]">{error}</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && projects.length === 0 && !creating && (
            <div className="bg-white rounded-lg border border-[#d1d9e0] shadow-sm p-12 text-center">
              <div className="w-16 h-16 bg-[#ddf4ff] rounded-xl flex items-center justify-center mx-auto mb-5">
                <svg className="w-8 h-8 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                </svg>
              </div>
              <h3 className="text-lg font-semibold text-[#1f2328] mb-1">No projects yet</h3>
              <p className="text-sm text-[#656d76] mb-6">Create your first project to start managing API tests.</p>
              <button
                onClick={() => setCreating(true)}
                className="px-4 py-2 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1f883d] rounded-md transition-colors"
              >
                Create a project
              </button>
            </div>
          )}

          {/* Project tiles */}
          {projects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <button
                  key={project.id}
                  onClick={() => handleSelectProject(project)}
                  className="bg-white rounded-lg border border-[#d1d9e0] shadow-sm p-5 text-left hover:border-[#0969da] hover:shadow-md transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    {/* Folder icon */}
                    <div className="w-10 h-10 bg-[#ddf4ff] rounded-lg flex items-center justify-center shrink-0 group-hover:bg-[#0969da]/15 transition-colors">
                      <svg className="w-5 h-5 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                      </svg>
                    </div>
                    {/* Visibility badge */}
                    <span className={`text-[11px] font-medium px-1.5 py-0.5 rounded-full border ${
                      project.visibility === "personal"
                        ? "bg-[#fff8c5] text-[#9a6700] border-[#9a6700]/20"
                        : "bg-[#ddf4ff] text-[#0969da] border-[#0969da]/20"
                    }`}>
                      {VISIBILITY_LABEL[project.visibility ?? "team"]}
                    </span>
                  </div>
                  <h3 className="text-sm font-semibold text-[#1f2328] mb-1 truncate group-hover:text-[#0969da] transition-colors">
                    {project.name}
                  </h3>
                  {project.description && (
                    <p className="text-xs text-[#656d76] mb-3 line-clamp-2">{project.description}</p>
                  )}
                  {!project.description && <div className="mb-3" />}
                  <div className="flex items-center gap-3 text-[11px] text-[#8b949e]">
                    {/* Member count */}
                    <span className="flex items-center gap-1">
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15 19.128a9.38 9.38 0 0 0 2.625.372 9.337 9.337 0 0 0 4.121-.952 4.125 4.125 0 0 0-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 0 1 8.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0 1 11.964-3.07M12 6.375a3.375 3.375 0 1 1-6.75 0 3.375 3.375 0 0 1 6.75 0Zm8.25 2.25a2.625 2.625 0 1 1-5.25 0 2.625 2.625 0 0 1 5.25 0Z" />
                      </svg>
                      {project.memberCount ?? 1}
                    </span>
                    {/* Updated */}
                    <span>Updated {timeAgo(project.updatedAt)}</span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
