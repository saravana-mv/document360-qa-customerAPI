import type { TestContext } from "../../types/test.types";
import type { TokenSet } from "../../types/auth.types";
import { useSetupStore } from "../../store/setup.store";

export function buildTestContext(
  token: TokenSet,
  projectId: string,
  versionId: string,
  langCode: string,
  apiVersion: string,
): TestContext {
  // Use the upstream D360 host as ctx.baseUrl. The built-in proxy at
  // /api/d360/proxy/* is an internal detail — rewriting happens in builder.ts
  // just before fetch(). Keeping ctx.baseUrl upstream means captured
  // requestUrls shown in the Detail pane match the D360 docs.
  return {
    projectId,
    versionId,
    langCode,
    token: token.access_token,
    baseUrl: useSetupStore.getState().baseUrl,
    apiVersion,
  };
}
