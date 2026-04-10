import { apiClient } from "./client";

export async function getCategories(projectId: string, versionId: string, token: string): Promise<unknown[]> {
  const resp = await apiClient.get<{ data: unknown[] }>(`/v2/projects/${projectId}/categories?version=${versionId}`, token);
  return resp.data || [];
}

export async function createCategory(projectId: string, body: Record<string, unknown>, token: string): Promise<{ id: string; name: string }> {
  const resp = await apiClient.post<{ data: { id: string; name: string } }>(`/v2/projects/${projectId}/categories`, body, token);
  return resp.data;
}

export async function deleteCategory(projectId: string, categoryId: string, versionId: string, token: string): Promise<void> {
  await apiClient.delete<void>(`/v2/projects/${projectId}/categories/${categoryId}?project_version_id=${versionId}`, token);
}
