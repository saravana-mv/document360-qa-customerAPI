import { apiClient, getApiVersion } from "./client";
import type { Project } from "../../types/api.types";

/**
 * Returns the project ID. With Entra ID SSO, the project ID is managed
 * by the setup store — this function is kept for call-site compatibility
 * but always returns an empty string (callers should use setup.selectedProjectId).
 */
export function getProjectIdFromToken(_accessToken: string): string {
  return "";
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
