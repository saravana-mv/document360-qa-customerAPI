import { getProjectHeaders } from "./projectHeader";

export interface ProjectVariable {
  name: string;
  value: string;
}

export async function getProjectVariables(): Promise<ProjectVariable[]> {
  const res = await fetch("/api/project-variables", {
    headers: getProjectHeaders(),
  });
  if (!res.ok) throw new Error(await res.text());
  const data = (await res.json()) as { variables: ProjectVariable[] };
  return data.variables;
}

export async function saveProjectVariables(variables: ProjectVariable[]): Promise<void> {
  const res = await fetch("/api/project-variables", {
    method: "PUT",
    headers: { ...getProjectHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ variables }),
  });
  if (!res.ok) {
    let msg = res.statusText;
    try {
      const body = (await res.clone().json()) as { error?: string };
      if (body.error) msg = body.error;
    } catch { /* ignore */ }
    throw new Error(msg);
  }
}
