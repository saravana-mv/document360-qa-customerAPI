import { apiClient } from "./client";
import type { ProjectVersion } from "../../types/api.types";

export async function fetchProjectVersions(projectId: string, token: string): Promise<ProjectVersion[]> {
  const json = await apiClient.get<unknown>(`/v3/projects/${projectId}/project-versions`, token);

  // API may wrap the array in data / result / versions, or return it directly
  const envelope = json as Record<string, unknown>;
  const raw = (envelope.data ?? envelope.result ?? envelope.versions ?? json) as unknown[];

  if (!Array.isArray(raw)) return [];

  const get = (o: Record<string, unknown>, snake: string, pascal: string) => o[snake] ?? o[pascal];

  // Log raw version data so we can see VersionType values in the debug panel
  console.log("[versions] raw:", raw.map((v) => {
    const r = v as Record<string, unknown>;
    return {
      name: get(r, "version_code_name", "VersionCodeName"),
      slug: get(r, "slug", "Slug"),
      versionType: get(r, "version_type", "VersionType"),
      isDefault: get(r, "is_default", "IsDefault") ?? get(r, "is_main_version", "IsMainVersion"),
    };
  }));

  return raw
    .filter((v) => {
      const r = v as Record<string, unknown>;
      const slug = ((get(r, "slug", "Slug") as string) || "").toLowerCase();
      // Exclude API Reference versions — their slug ends with "-api"
      return !slug.endsWith("-api");
    })
    .map((v) => {
      const r = v as Record<string, unknown>;
      const id = get(r, "id", "Id") as string;
      const name = (get(r, "name", "Name") ?? get(r, "version_code_name", "VersionCodeName")) as string;
      const versionNumber = (get(r, "version_number", "VersionNumber") ?? "") as string | number;
      const isDefault = Boolean(get(r, "is_default", "IsDefault") ?? get(r, "is_main_version", "IsMainVersion"));
      return {
        id,
        name: name || (versionNumber ? `v${versionNumber}` : id),
        versionNumber: String(versionNumber),
        isDefault,
      };
    });
}
