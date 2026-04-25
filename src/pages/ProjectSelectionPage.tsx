// Full-screen project selection page — the first screen after login.
// Shows a tile grid of projects the user has access to.
// No TopBar, no SideNav — standalone page.

import { useState, useEffect, useRef, useCallback } from "react";
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

export function ProjectSelectionPage() {
  const navigate = useNavigate();
  const projects = useProjectStore((s) => s.projects);
  const loading = useProjectStore((s) => s.loading);
  const error = useProjectStore((s) => s.error);
  const loadProjects = useProjectStore((s) => s.load);
  const createProject = useProjectStore((s) => s.create);
  const removeProject = useProjectStore((s) => s.remove);
  const selectProject = useProjectStore((s) => s.select);
  const entraStatus = useEntraAuthStore((s) => s.status);
  const principal = useEntraAuthStore((s) => s.principal);
  const entraLogout = useEntraAuthStore((s) => s.logout);
  const isSuperOwner = useUserStore((s) => s.user?.role === "owner");
  const canCreateProject = useUserStore((s) => s.hasRole("project_owner"));

  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ProjectDoc | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [confirmName, setConfirmName] = useState("");
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
      const doc = await createProject(name, newDesc.trim() || undefined);
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

  const handleDelete = useCallback(async () => {
    if (!deleteTarget || confirmName !== deleteTarget.name) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await removeProject(deleteTarget.id);
      setDeleteTarget(null);
      setConfirmName("");
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleting(false);
    }
  }, [deleteTarget, confirmName, removeProject]);

  return (
    <div className="min-h-screen bg-[#f6f8fa] flex flex-col">
      {/* Minimal header */}
      <header className="h-14 bg-[#1f2328] text-[#e6edf3] flex items-center px-6 shrink-0">
        <span className="text-sm font-bold tracking-[-0.01em]">FLOW FORGE</span>
        <div className="flex-1" />
        {isSuperOwner && (
          <button
            onClick={() => navigate("/global-settings")}
            title="Global Settings"
            className="p-1.5 rounded-md text-[#7d8590] hover:text-[#e6edf3] hover:bg-[#2d333b] transition-colors mr-2"
          >
            <svg className="w-4.5 h-4.5" fill="none" stroke="currentColor" strokeWidth={1.75} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 0 1 1.37.49l1.296 2.247a1.125 1.125 0 0 1-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 0 1 0 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 0 1-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 0 1-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.94-1.11.94h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 0 1-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 0 1-1.369-.49l-1.297-2.247a1.125 1.125 0 0 1 .26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 0 1 0-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 0 1-.26-1.43l1.297-2.247a1.125 1.125 0 0 1 1.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.086.22-.128.332-.183.582-.495.644-.869l.214-1.28Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
            </svg>
          </button>
        )}
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
                  : canCreateProject
                    ? "Select a project to get started, or create a new one."
                    : "Select a project to get started."}
              </p>
            </div>
            {!creating && canCreateProject && (
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
              <p className="text-sm text-[#656d76] mb-6">
                {canCreateProject
                  ? "Create your first project to start managing API tests."
                  : "You don't have access to any projects yet. Ask a project owner to invite you."}
              </p>
              {canCreateProject && (
                <button
                  onClick={() => setCreating(true)}
                  className="px-4 py-2 text-sm font-medium text-white bg-[#1a7f37] hover:bg-[#1f883d] rounded-md transition-colors"
                >
                  Create a project
                </button>
              )}
            </div>
          )}

          {/* Project tiles */}
          {projects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {projects.map((project) => (
                <div
                  key={project.id}
                  className="bg-white rounded-lg border border-[#d1d9e0] shadow-sm p-5 text-left hover:border-[#0969da] hover:shadow-md transition-all group relative cursor-pointer"
                  onClick={() => handleSelectProject(project)}
                >
                  <div className="flex items-start justify-between mb-3">
                    {/* Folder icon */}
                    <div className="w-10 h-10 bg-[#ddf4ff] rounded-lg flex items-center justify-center shrink-0 group-hover:bg-[#0969da]/15 transition-colors">
                      <svg className="w-5 h-5 text-[#0969da]" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 12.75V12A2.25 2.25 0 0 1 4.5 9.75h15A2.25 2.25 0 0 1 21.75 12v.75m-8.69-6.44-2.12-2.12a1.5 1.5 0 0 0-1.061-.44H4.5A2.25 2.25 0 0 0 2.25 6v12a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9a2.25 2.25 0 0 0-2.25-2.25h-5.379a1.5 1.5 0 0 1-1.06-.44Z" />
                      </svg>
                    </div>
                    <div className="flex items-center gap-2">
                      {/* Delete button — Super Owner only */}
                      {isSuperOwner && (
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteTarget(project); setDeleteError(null); setConfirmName(""); }}
                          title="Delete project"
                          className="p-1 rounded-md text-[#8b949e] hover:text-[#d1242f] hover:bg-[#ffebe9] transition-colors opacity-0 group-hover:opacity-100"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                          </svg>
                        </button>
                      )}
                    </div>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete confirmation modal */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setDeleteTarget(null)}>
          <div className="bg-white rounded-lg shadow-xl border border-[#d1d9e0] w-[480px] max-w-[90vw]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-5 py-4 border-b border-[#d1d9e0]">
              <div className="w-8 h-8 rounded-full bg-[#ffebe9] flex items-center justify-center shrink-0">
                <svg className="w-4 h-4 text-[#d1242f]" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126ZM12 15.75h.007v.008H12v-.008Z" />
                </svg>
              </div>
              <span className="text-base font-semibold text-[#d1242f] flex-1">Delete project</span>
              <button onClick={() => setDeleteTarget(null)} className="p-1 rounded-md text-[#656d76] hover:text-[#1f2328] hover:bg-[#f6f8fa] transition-colors">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="px-5 py-4 space-y-3">
              <p className="text-sm text-[#1f2328]">
                This will <strong>permanently delete</strong> the project <strong>{deleteTarget.name}</strong> and all its resources:
              </p>
              <ul className="text-xs text-[#656d76] list-disc ml-4 space-y-1">
                <li>All spec files and imported documents</li>
                <li>All flow definitions and chat sessions</li>
                <li>All test ideas and generated content</li>
                <li>All test runs and execution history</li>
                <li>All API keys and audit logs</li>
                <li>All project member assignments</li>
              </ul>
              <p className="text-sm text-[#d1242f] font-medium">This action cannot be undone.</p>
              <div>
                <label className="block text-xs font-medium text-[#1f2328] mb-1">
                  Type <strong>{deleteTarget.name}</strong> to confirm
                </label>
                <input
                  type="text"
                  value={confirmName}
                  onChange={(e) => setConfirmName(e.target.value)}
                  placeholder={deleteTarget.name}
                  className="w-full px-3 py-2 border border-[#d1d9e0] rounded-md text-sm focus:border-[#d1242f] focus:ring-1 focus:ring-[#d1242f] outline-none"
                  autoFocus
                />
              </div>
              {deleteError && (
                <div className="px-3 py-2 bg-[#ffebe9] border border-[#ffcecb] rounded-md text-sm text-[#d1242f]">
                  {deleteError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-[#d1d9e0] bg-[#f6f8fa] rounded-b-lg">
              <button
                onClick={() => setDeleteTarget(null)}
                className="text-sm font-medium text-[#1f2328] border border-[#d1d9e0] bg-white hover:bg-[#f6f8fa] rounded-md px-3 py-1.5 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={deleting || confirmName !== deleteTarget.name}
                className="text-sm font-medium text-white bg-[#d1242f] hover:bg-[#cf222e] disabled:opacity-40 disabled:cursor-not-allowed rounded-md px-3 py-1.5 transition-colors"
              >
                {deleting ? "Deleting..." : "Delete this project"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
