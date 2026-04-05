import { apiClient } from "./client";
import type { Project } from "../../types/api.types";

interface ProjectsResponse {
  data: Project[];
}

export async function fetchProjects(token: string): Promise<Project[]> {
  const response = await apiClient.get<ProjectsResponse>("/v2/projects", token);
  return response.data || [];
}
