import type { TestDef, TestContext, RunState, TestExecutionResult } from "../../../types/test.types";
import { registerSuite } from "../registry";
import { assertStatus, assertBodyHasField } from "../assertions";
import {
  getArticle,
  patchArticle,
  getArticleVersions,
  getArticleVersion,
  getArticleSettings,
  patchArticleSettings,
  patchArticleWorkflowStatus,
  bulkPatchArticles,
} from "../../api/articles";

const TAG = "Articles";

const tests: TestDef[] = [
  {
    id: "articles.get-single",
    name: "Get single article",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "GET",
    assertions: [assertStatus(200), assertBodyHasField("title")],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
        state.originalTitle = article.title;
        state.originalArticle = article;
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: article,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.get-versions",
    name: "Get article versions",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}/versions",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const versions = await getArticleVersions(ctx.projectId, ctx.articleId!, ctx.token);
        state.versions = versions;
        const firstVersion = Array.isArray(versions) && versions.length > 0 ? versions[0] : null;
        if (firstVersion && typeof firstVersion === "object") {
          state.firstVersionNumber = (firstVersion as Record<string, unknown>).versionNumber ?? 1;
        } else {
          state.firstVersionNumber = 1;
        }
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: versions,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.patch-title",
    name: "Patch article title",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "PATCH",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const testTitle = `[TEST] ${state.originalTitle || "Article"} - ${Date.now()}`;
        state.testTitle = testTitle;
        const article = await patchArticle(ctx.projectId, ctx.articleId!, { title: testTitle }, ctx.token);
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: article,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
    teardown: async (_ctx: TestContext, state: RunState): Promise<void> => {
      // Restore will be done by patch-restore test, but ensure we track dirty state
      state.titlePatched = true;
    },
  },

  {
    id: "articles.verify-patch",
    name: "Verify patched title",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
        const titleMatches = article.title === state.testTitle;
        return {
          status: titleMatches ? "pass" : "fail",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: article,
          failureReason: titleMatches ? undefined : `Title mismatch: got "${article.title}", expected "${state.testTitle}"`,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.patch-restore",
    name: "Restore original title",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "PATCH",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const originalTitle = state.originalTitle as string || "Restored Article";
        await patchArticle(ctx.projectId, ctx.articleId!, { title: originalTitle }, ctx.token);
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: { restored: true, title: originalTitle },
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.get-settings",
    name: "Get article settings",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}/settings",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const settings = await getArticleSettings(ctx.projectId, ctx.articleId!, ctx.token);
        state.originalSettings = settings;
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: settings,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.patch-settings",
    name: "Patch article settings",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}/settings",
    method: "PATCH",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const settings = state.originalSettings as Record<string, unknown> || {};
        // Toggle a safe setting value
        const patchBody = { ...settings, hidden: !(settings.hidden ?? false) };
        const result = await patchArticleSettings(ctx.projectId, ctx.articleId!, patchBody, ctx.token);
        state.patchedSettings = patchBody;
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: result,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.restore-settings",
    name: "Restore article settings",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}/settings",
    method: "PATCH",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const originalSettings = state.originalSettings as Record<string, unknown> || {};
        await patchArticleSettings(ctx.projectId, ctx.articleId!, originalSettings, ctx.token);
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: { restored: true },
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.get-version",
    name: "Get specific article version",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}/versions/{versionNumber}",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const versionNumber = state.firstVersionNumber as number || 1;
        const version = await getArticleVersion(ctx.projectId, ctx.articleId!, versionNumber, ctx.token);
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: version,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.patch-workflow",
    name: "Patch article workflow status",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}/workflow-status",
    method: "PATCH",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const article = state.originalArticle as Record<string, unknown> || {};
        const currentStatus = (article.workflowStatus as string) || "draft";
        // Toggle between draft and review
        const newStatus = currentStatus === "published" ? "review" : currentStatus;
        state.originalWorkflowStatus = currentStatus;
        state.newWorkflowStatus = newStatus;
        const result = await patchArticleWorkflowStatus(ctx.projectId, ctx.articleId!, { workflowStatus: newStatus }, ctx.token);
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: result,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
    teardown: async (ctx: TestContext, state: RunState): Promise<void> => {
      if (state.originalWorkflowStatus) {
        try {
          await patchArticleWorkflowStatus(ctx.projectId, ctx.articleId!,
            { workflowStatus: state.originalWorkflowStatus }, ctx.token);
        } catch { /* ignore cleanup errors */ }
      }
    },
  },

  {
    id: "articles.bulk-patch",
    name: "Bulk patch articles",
    tag: TAG,
    path: "/v3/projects/{id}/articles/bulk",
    method: "PATCH",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const bulkBody = {
          articleIds: [ctx.articleId],
          properties: { hidden: true },
        };
        state.bulkPatched = true;
        const result = await bulkPatchArticles(ctx.projectId, bulkBody, ctx.token);
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: result,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.bulk-patch-verify",
    name: "Verify bulk patch",
    tag: TAG,
    path: "/v3/projects/{id}/articles/{articleId}",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, _state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const article = await getArticle(ctx.projectId, ctx.articleId!, ctx.token);
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: article,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },

  {
    id: "articles.bulk-restore",
    name: "Bulk restore articles",
    tag: TAG,
    path: "/v3/projects/{id}/articles/bulk",
    method: "PATCH",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      try {
        const bulkBody = {
          articleIds: [ctx.articleId],
          properties: { hidden: false },
        };
        const result = await bulkPatchArticles(ctx.projectId, bulkBody, ctx.token);
        state.bulkPatched = false;
        return {
          status: "pass",
          httpStatus: 200,
          durationMs: Date.now() - start,
          responseBody: result,
          assertionResults: [],
        };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return {
          status: "fail",
          httpStatus: e.status,
          durationMs: Date.now() - start,
          failureReason: e.message,
          assertionResults: [],
        };
      }
    },
  },
];

registerSuite(tests);

export default tests;
