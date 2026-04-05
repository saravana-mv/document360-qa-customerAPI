const SPEC_URL = "https://apihub.berlin.document360.net/swagger/v3/swagger.json";

export async function loadSpec(bustCache = false): Promise<unknown> {
  const url = bustCache ? `${SPEC_URL}?t=${Date.now()}` : SPEC_URL;
  const response = await fetch(url, { cache: bustCache ? "no-store" : "default" });
  if (!response.ok) {
    throw new Error(`Failed to fetch spec: ${response.status} ${response.statusText}`);
  }
  return response.json();
}
