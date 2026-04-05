import { apiClient } from "./client";

export async function getDriveFiles(projectId: string, token: string): Promise<unknown[]> {
  const resp = await apiClient.get<{ data: unknown[] }>(`/v2/projects/${projectId}/drives`, token);
  return resp.data || [];
}
