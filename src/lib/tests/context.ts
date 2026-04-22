import type { TestContext } from "../../types/test.types";
import type { TokenSet } from "../../types/auth.types";
import { useSetupStore } from "../../store/setup.store";
import { useProjectVariablesStore } from "../../store/projectVariables.store";

export function buildTestContext(
  token: TokenSet,
  projectId: string,
  versionId: string,
  langCode: string,
  apiVersion: string,
  baseUrl?: string,
  authMethod?: "oauth" | "apikey",
  authVersion?: string,
): TestContext {
  // Use the upstream D360 host as ctx.baseUrl. The built-in proxy at
  // /api/d360/proxy/* is an internal detail — rewriting happens in builder.ts
  // just before fetch(). Keeping ctx.baseUrl upstream means captured
  // requestUrls shown in the Detail pane match the D360 docs.
  const projectVariables = useProjectVariablesStore.getState().asRecord();
  return {
    projectId,
    versionId,
    langCode,
    token: token.access_token,
    baseUrl: baseUrl ?? useSetupStore.getState().baseUrl,
    apiVersion,
    authMethod,
    authVersion,
    projectVariables: Object.keys(projectVariables).length > 0 ? projectVariables : undefined,
  };
}
