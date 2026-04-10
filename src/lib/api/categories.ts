import { apiClient, getApiVersion } from "./client";

const p = (projectId: string) => `/${getApiVersion()}/projects/${projectId}`;

export async function getCategories(projectId: string, versionId: string, token: string): Promise<unknown[]> {
  const resp = await apiClient.get<{ data: unknown[] }>(`${p(projectId)}/categories?version=${versionId}`, token);
  return resp.data || [];
}

export async function createCategory(projectId: string, body: Record<string, unknown>, token: string): Promise<{ id: string; name: string }> {
  const resp = await apiClient.post<{ data: { id: string; name: string } }>(`${p(projectId)}/categories`, body, token);
  return resp.data;
}

export async function deleteCategory(projectId: string, categoryId: string, versionId: string, token: string): Promise<void> {
  await apiClient.delete<void>(`${p(projectId)}/categories/${categoryId}?project_version_id=${versionId}`, token);
}
