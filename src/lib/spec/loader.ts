const SPEC_URL = "https://apihub.berlin.document360.net/swagger/v3/swagger.json";

export async function loadSpec(bustCache = false, token?: string): Promise<unknown> {
  const url = bustCache ? `${SPEC_URL}?t=${Date.now()}` : SPEC_URL;
  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const response = await fetch(url, {
    cache: bustCache ? "no-store" : "default",
    headers,
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
