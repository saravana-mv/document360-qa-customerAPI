import type { TestDef, TestContext, RunState, TestExecutionResult } from "../../../types/test.types";
import { registerSuite } from "../registry";
import { assertStatus, assertBodyHasField } from "../assertions";
import {
  getArticle,
  patchArticle,
  getArticleSettings,
  patchArticleSettings,
  getWorkflowStatuses,
  patchArticleWorkflowStatus,
  bulkPatchArticles,
} from "../../api/articles";

function articleBase(ctx: TestContext) {
  return `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles/${ctx.articleId}`;
}
function projectBase(ctx: TestContext) {
  return `${ctx.baseUrl}/v3/projects/${ctx.projectId}`;
}

const GROUP = "Articles";
const FLOW_CRUD = "Full Article CRUD Lifecycle";
const FLOW_SETTINGS = "Article Settings Flow";
const FLOW_WORKFLOW = "Publish / Unpublish Flow";
const FLOW_BULK = "Bulk Operations";

const tests: TestDef[] = [
  // ── Full Article CRUD Lifecycle ───────────────────────────────────────────

  {
    id: "articles.get-single",
    name: "Get single article",
    tag: FLOW_CRUD,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "GET",
    assertions: [assertStatus(200), assertBodyHasField("title")],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = articleBase(ctx);
      try {
        const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
        state.originalTitle = article.title;
        state.originalArticle = article;
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: article, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    id: "articles.patch-title",
    name: "Update article title",
    tag: FLOW_CRUD,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "PATCH",
    description: "Partial update — sets a timestamped test title. Includes original content (required by API). auto_fork:true creates a new draft if the version is published.",
    queryParams: { lang_code: "{ctx.langCode}" },
    sampleRequestBody: { title: "[TEST] Article title - <timestamp>", content: "<original content>", auto_fork: true },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articleBase(ctx)}?lang_code=${ctx.langCode}`;
      try {
        const testTitle = `[TEST] ${state.originalTitle || "Article"} - ${Date.now()}`;
        state.testTitle = testTitle;
        const originalArticle = state.originalArticle as Record<string, unknown>;
        // content is required by the API; auto_fork creates a draft if the version is published
        const requestBody = { title: testTitle, content: originalArticle?.content ?? "", auto_fork: true };
        const article = await patchArticle(ctx.projectId, ctx.articleId!, requestBody, ctx.token, ctx.langCode);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: article, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
    teardown: async (_ctx: TestContext, state: RunState): Promise<void> => {
      state.titlePatched = true;
    },
  },

  {
    id: "articles.verify-patch",
    name: "Verify patched title",
    tag: FLOW_CRUD,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = articleBase(ctx);
      try {
        const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
        const titleMatches = article.title === state.testTitle;
        return {
          status: titleMatches ? "pass" : "fail",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: article,
          requestUrl,
          failureReason: titleMatches ? undefined : `Title mismatch: got "${article.title}", expected "${state.testTitle}"`,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    id: "articles.patch-restore",
    name: "Restore original title",
    tag: FLOW_CRUD,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "PATCH",
    description: "Restores the article title to its original value captured in the GET step.",
    queryParams: { lang_code: "{ctx.langCode}" },
    sampleRequestBody: { title: "<original title>", content: "<original content>", auto_fork: true },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articleBase(ctx)}?lang_code=${ctx.langCode}`;
      try {
        const originalTitle = state.originalTitle as string || "Restored Article";
        const originalArticle = state.originalArticle as Record<string, unknown>;
        const requestBody = { title: originalTitle, content: originalArticle?.content ?? "", auto_fork: true };
        const article = await patchArticle(ctx.projectId, ctx.articleId!, requestBody, ctx.token, ctx.langCode);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: article, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  // ── Article Settings Flow ─────────────────────────────────────────────────

  {
    id: "articles.get-settings",
    name: "Get article settings",
    tag: FLOW_SETTINGS,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}/settings",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articleBase(ctx)}/settings?lang_code=${ctx.langCode}`;
      try {
        const settings = await getArticleSettings(ctx.projectId, ctx.articleId!, ctx.token, ctx.langCode);
        state.originalSettings = settings;
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: settings, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    id: "articles.patch-settings",
    name: "Update article settings",
    tag: FLOW_SETTINGS,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}/settings",
    method: "PATCH",
    description: "Toggles allow_comments to the opposite of its current value.",
    queryParams: { lang_code: "{ctx.langCode}" },
    sampleRequestBody: { allow_comments: true },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articleBase(ctx)}/settings?lang_code=${ctx.langCode}`;
      try {
        const settings = state.originalSettings as Record<string, unknown> || {};
        // Toggle allow_comments (valid settings field)
        const newAllowComments = !(settings.allow_comments ?? false);
        state.patchedAllowComments = newAllowComments;
        const requestBody = { allow_comments: newAllowComments };
        const result = await patchArticleSettings(ctx.projectId, ctx.articleId!, requestBody, ctx.token, ctx.langCode);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: result, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    id: "articles.restore-settings",
    name: "Restore article settings",
    tag: FLOW_SETTINGS,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}/settings",
    method: "PATCH",
    description: "Restores allow_comments to its original value captured in the GET settings step.",
    queryParams: { lang_code: "{ctx.langCode}" },
    sampleRequestBody: { allow_comments: "<original value>" },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articleBase(ctx)}/settings?lang_code=${ctx.langCode}`;
      try {
        const settings = state.originalSettings as Record<string, unknown> || {};
        const requestBody = { allow_comments: settings.allow_comments ?? false };
        const result = await patchArticleSettings(ctx.projectId, ctx.articleId!, requestBody, ctx.token, ctx.langCode);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: result, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  // ── Publish / Unpublish Flow ──────────────────────────────────────────────

  {
    id: "articles.patch-workflow",
    name: "Update workflow status",
    tag: FLOW_WORKFLOW,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}/workflow-status",
    method: "PATCH",
    description: "Fetches available workflow statuses, then transitions the article to a different status. Skips if no workflow statuses are configured.",
    sampleRequestBody: { project_version_id: "<uuid>", lang_code: "en", workflow_status_info: { status_id: "<uuid>" } },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articleBase(ctx)}/workflow-status`;
      try {
        // Get article to find project_version_id and current workflow status
        const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
        const projectVersionId = article.project_version_id;
        const currentStatusId = article.current_workflow_status_id;
        state.originalWorkflowStatusId = currentStatusId;

        // Get available workflow statuses for this project
        const statuses = await getWorkflowStatuses(ctx.projectId, ctx.token) as Array<Record<string, unknown>>;

        if (!statuses || statuses.length === 0) {
          return { status: "skip", durationMs: Date.now() - start, failureReason: "No workflow statuses configured for this project", requestUrl, assertionResults: [] };
        }

        // Pick a different status (or the first one if none set)
        const targetStatus = statuses.find((s) => s.id !== currentStatusId) ?? statuses[0];
        const targetStatusId = targetStatus.id as string;
        state.newWorkflowStatusId = targetStatusId;

        const requestBody = {
          project_version_id: projectVersionId,
          lang_code: ctx.langCode,
          workflow_status_info: {
            status_id: targetStatusId,
          },
        };
        const result = await patchArticleWorkflowStatus(ctx.projectId, ctx.articleId!, requestBody, ctx.token);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: result, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
    teardown: async (ctx: TestContext, state: RunState): Promise<void> => {
      if (state.originalWorkflowStatusId) {
        try {
          const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
          await patchArticleWorkflowStatus(ctx.projectId, ctx.articleId!, {
            project_version_id: article.project_version_id,
            lang_code: ctx.langCode,
            workflow_status_info: { status_id: state.originalWorkflowStatusId },
          }, ctx.token);
        } catch { /* ignore cleanup errors */ }
      }
    },
  },

  // ── Bulk Operations ───────────────────────────────────────────────────────

  {
    id: "articles.bulk-patch",
    name: "Bulk update articles",
    tag: FLOW_BULK,
    group: GROUP,
    path: "/v3/projects/{id}/articles/bulk",
    method: "PATCH",
    description: "Sets hidden:true on the test article using the bulk update endpoint.",
    sampleRequestBody: { articles: [{ article_id: "<uuid>", lang_code: "en", hidden: true, auto_fork: false }] },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${projectBase(ctx)}/articles/bulk`;
      try {
        const requestBody = {
          articles: [
            {
              article_id: ctx.articleId,
              lang_code: ctx.langCode,
              hidden: true,
              auto_fork: false,
            },
          ],
        };
        state.bulkPatched = true;
        const result = await bulkPatchArticles(ctx.projectId, requestBody, ctx.token);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: result, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    id: "articles.bulk-patch-verify",
    name: "Verify bulk update",
    tag: FLOW_BULK,
    group: GROUP,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, _state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = articleBase(ctx);
      try {
        const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: article, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    id: "articles.bulk-restore",
    name: "Bulk restore articles",
    tag: FLOW_BULK,
    group: GROUP,
    path: "/v3/projects/{id}/articles/bulk",
    method: "PATCH",
    description: "Restores hidden:false on the test article using the bulk update endpoint.",
    sampleRequestBody: { articles: [{ article_id: "<uuid>", lang_code: "en", hidden: false, auto_fork: false }] },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${projectBase(ctx)}/articles/bulk`;
      try {
        const requestBody = {
          articles: [
            {
              article_id: ctx.articleId,
              lang_code: ctx.langCode,
              hidden: false,
              auto_fork: false,
            },
          ],
        };
        const result = await bulkPatchArticles(ctx.projectId, requestBody, ctx.token);
        state.bulkPatched = false;
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: result, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },
];

registerSuite(tests);

export default tests;
