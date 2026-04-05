import { apiClient } from "./client";

export async function getCategories(projectId: string, versionId: string, token: string): Promise<unknown[]> {
  const resp = await apiClient.get<{ data: unknown[] }>(`/v2/projects/${projectId}/categories?version=${versionId}`, token);
  return resp.data || [];
}
