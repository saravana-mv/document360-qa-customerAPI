import type { TestContext } from "../../types/test.types";
import type { TokenSet } from "../../types/auth.types";
import { getApiBaseUrl } from "../api/client";

export function buildTestContext(
  token: TokenSet,
  projectId: string,
  versionId: string,
  langCode: string,
  apiVersion: string,
  articleId?: string,
): TestContext {
  return {
    projectId,
    versionId,
    langCode,
    token: token.access_token,
    baseUrl: getApiBaseUrl(),
    apiVersion,
    articleId: articleId?.trim() || undefined,
  };
}
