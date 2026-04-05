import { apiClient } from "./client";
import type { ProjectVersion } from "../../types/api.types";

interface VersionsResponse {
  data: ProjectVersion[];
}

export async function fetchProjectVersions(projectId: string, token: string): Promise<ProjectVersion[]> {
  const response = await apiClient.get<VersionsResponse>(`/v2/projects/${projectId}/versions`, token);
  return response.data || [];
}
