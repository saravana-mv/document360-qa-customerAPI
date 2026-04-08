import { apiClient } from "./client";
import type { Project } from "../../types/api.types";

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split(".")[1];
    const padded = part.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(padded));
  } catch {
    return {};
  }
}

export function getProjectIdFromToken(accessToken: string): string {
  const claims = decodeJwtPayload(accessToken);
  return (claims.doc360_project_id as string) || "";
}

export async function fetchProject(projectId: string, token: string): Promise<Project> {
  const response = await apiClient.get<{ data: Project }>(`/v3/projects/${projectId}`, token);
  const project = response.data;
  return {
    id: projectId,
    name: (project as unknown as Record<string, unknown>)?.name as string
      || (project as unknown as Record<string, unknown>)?.project_name as string
      || (project as unknown as Record<string, unknown>)?.site_name as string
      || projectId,
  };
}
