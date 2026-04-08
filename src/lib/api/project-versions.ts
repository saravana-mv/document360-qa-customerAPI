import { apiClient } from "./client";
import type { ProjectVersion } from "../../types/api.types";

export async function fetchProjectVersions(projectId: string, token: string): Promise<ProjectVersion[]> {
  const raw = await apiClient.get<unknown[]>(`/v3/projects/${projectId}/project-versions`, token);
  const list = Array.isArray(raw) ? raw : [];
  return list.map((v) => {
    const r = v as Record<string, unknown>;
    const id = (r.id ?? r.Id) as string;
    const name = (r.name ?? r.Name ?? r.version_code_name ?? r.VersionCodeName) as string;
    const versionNumber = (r.version_number ?? r.VersionNumber ?? "") as string;
    const isDefault = Boolean(r.is_default ?? r.IsDefault ?? r.is_main_version ?? r.IsMainVersion);
    return { id, name: name || `v${versionNumber}` || id, versionNumber: String(versionNumber), isDefault };
  });
}
