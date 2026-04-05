import type { TestContext } from "../../types/test.types";
import type { TokenSet } from "../../types/auth.types";
import { BASE_URL } from "../api/client";

export function buildTestContext(
  token: TokenSet,
  projectId: string,
  versionId: string,
  langCode: string,
  articleId?: string
): TestContext {
  return {
    projectId,
    versionId,
    langCode,
    token: token.access_token,
    baseUrl: BASE_URL,
    articleId,
  };
}
