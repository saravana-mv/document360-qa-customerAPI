import { apiClient, getApiVersion } from "./client";
import { getProjectId as getStoredProjectId } from "../oauth/session";
import type { Project } from "../../types/api.types";

/**
 * Phase 2: the browser no longer has the D360 JWT, so we can't decode it
 * client-side. The exchange endpoint extracts `doc360_project_id` server-side
 * and returns it, and the SPA caches it in sessionStorage. This helper now
 * just reads that cached value — the `accessToken` parameter is ignored and
 * kept only for call-site compatibility.
 */
export function getProjectIdFromToken(_accessToken: string): string {
  return getStoredProjectId();
}

export async function fetchProject(projectId: string, token: string): Promise<Project> {
  const response = await apiClient.get<{ data: Project }>(`/${getApiVersion()}/projects/${projectId}`, token);
  const project = response.data;
  return {
    id: projectId,
    name: (project as unknown as Record<string, unknown>)?.name as string
      || (project as unknown as Record<string, unknown>)?.project_name as string
      || (project as unknown as Record<string, unknown>)?.site_name as string
      || projectId,
  };
}
