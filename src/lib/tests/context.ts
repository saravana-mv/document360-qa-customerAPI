import type { TestContext, AuthType } from "../../types/test.types";
import type { TokenSet } from "../../types/auth.types";
import { useSetupStore } from "../../store/setup.store";
import { useProjectVariablesStore } from "../../store/projectVariables.store";

export interface BuildContextOptions {
  token: TokenSet;
  projectId: string;
  versionId: string;
  langCode: string;
  apiVersion: string;
  baseUrl?: string;
  authType?: AuthType;
  authVersion?: string;
  authHeaderName?: string;
  authQueryParam?: string;
  connectionId?: string;
}

export function buildTestContext(opts: BuildContextOptions): TestContext {
  const projectVariables = useProjectVariablesStore.getState().asRecord();
  return {
    projectId: opts.projectId,
    versionId: opts.versionId,
    langCode: opts.langCode,
    token: opts.token.access_token,
    baseUrl: opts.baseUrl ?? useSetupStore.getState().baseUrl,
    apiVersion: opts.apiVersion,
    authType: opts.authType,
    authVersion: opts.authVersion,
    authHeaderName: opts.authHeaderName,
    authQueryParam: opts.authQueryParam,
    connectionId: opts.connectionId,
    projectVariables: Object.keys(projectVariables).length > 0 ? projectVariables : undefined,
  };
}
