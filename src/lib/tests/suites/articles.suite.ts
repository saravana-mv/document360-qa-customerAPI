import type { TestDef, TestContext, RunState, TestExecutionResult } from "../../../types/test.types";
import { registerSuite } from "../registry";
import { assertStatus, assertBodyHasField } from "../assertions";
import {
  getArticle,
  getArticleVersion,
  deleteArticleVersion,
  createArticle,
  publishArticle,
  forkArticle,
  deleteArticle,
} from "../../api/articles";

const GROUP = "Articles";
const FLOW_LIFECYCLE = "Article Version Lifecycle";

const tests: TestDef[] = [
  // ── Article Version Lifecycle ─────────────────────────────────────────────
  // Source: article-version-lifecycle.flow.xml

  {
    // Step 1: Create a fresh article in draft status. Captures the new article's id,
    // version_number, and project_version_id for use in all subsequent steps.
    id: "articles.create",
    name: "Create article",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles",
    method: "POST",
    sampleRequestBody: {
      title: "[TEST] Version Lifecycle - <timestamp>",
      content: "Test article created by the Article Version Lifecycle flow.",
      project_version_id: "<ctx.versionId>",
    },
    assertions: [assertStatus(201), assertBodyHasField("id")],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles`;
      try {
        const requestBody = {
          title: `[TEST] Version Lifecycle - ${Date.now()}`,
          content: "Test article created by the Article Version Lifecycle flow.",
          project_version_id: ctx.versionId,
        };
        const article = await createArticle(ctx.projectId, requestBody, ctx.token);
        state.createdArticleId = article.id;
        state.createdVersionNumber = article.version_number;
        state.projectVersionId = article.project_version_id;
        state.createdTitle = article.title;
        return { status: "pass", httpStatus: 201, durationMs: Date.now() - start, responseBody: article, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 2: Publish the draft created in Step 1.
    id: "articles.publish",
    name: "Publish article",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/publish",
    method: "POST",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 1 · response.data.id" },
    },
    sampleRequestBody: {
      project_version_id: "<state.projectVersionId>",
      version_number: "<state.createdVersionNumber>",
      message: "Publishing article for version lifecycle test",
    },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const requestUrl = `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles/${articleId}/publish`;
      try {
        const requestBody = {
          project_version_id: state.projectVersionId,
          version_number: state.createdVersionNumber,
          message: "Publishing article for version lifecycle test",
        };
        await publishArticle(ctx.projectId, articleId, requestBody, ctx.token);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 3: Fork the published version, creating a new draft.
    // Captures state.draftVersionNumber (the new draft) and state.publishedVersionNumber.
    id: "articles.fork",
    name: "Fork published version (create draft)",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/fork",
    method: "POST",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 1 · response.data.id" },
    },
    assertions: [assertStatus(201), assertBodyHasField("version_number")],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const requestUrl = `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles/${articleId}/fork`;
      try {
        const article = await forkArticle(ctx.projectId, articleId, ctx.token);
        state.draftVersionNumber = article.version_number;
        state.publishedVersionNumber = article.public_version;
        return { status: "pass", httpStatus: 201, durationMs: Date.now() - start, responseBody: article, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 4: GET the article and assert it surfaces the forked draft as the current version.
    id: "articles.get-forked",
    name: "Retrieve article — verify draft exists",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}",
    method: "GET",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 1 · response.data.id" },
    },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const requestUrl = `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles/${articleId}?lang_code=${ctx.langCode}`;
      try {
        const article = await getArticle(ctx.projectId, articleId, ctx.token);
        const versionMatches = article.version_number === (state.draftVersionNumber as number);
        if (!versionMatches) {
          return {
            status: "fail",
            httpStatus: 200,
            durationMs: Date.now() - start,
            responseBody: article,
            requestUrl,
            failureReason: `Expected version_number ${state.draftVersionNumber as number} (forked draft) but got ${article.version_number}`,
            assertionResults: [],
          };
        }
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: article, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 5: Delete the draft version created by the fork.
    // Captures state.deletedVersionNumber for verification in Step 6.
    id: "articles.delete-draft-version",
    name: "Delete draft version",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}",
    method: "DELETE",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 1 · response.data.id" },
      version_number: { value: "{{state.draftVersionNumber}}", tooltip: "Captured in Step 3 (fork) · response.data.version_number" },
    },
    assertions: [assertStatus(204)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const versionNumber = state.draftVersionNumber as number;
      const requestUrl = `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles/${articleId}/versions/${versionNumber}`;
      try {
        await deleteArticleVersion(ctx.projectId, articleId, versionNumber, ctx.token);
        state.deletedVersionNumber = versionNumber;
        return { status: "pass", httpStatus: 204, durationMs: Date.now() - start, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 6: Confirm the deleted version now returns 404.
    id: "articles.verify-draft-deleted",
    name: "Verify deleted version returns 404",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}",
    method: "GET",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 1 · response.data.id" },
      version_number: { value: "{{state.deletedVersionNumber}}", tooltip: "Captured from Step 5 request · version number that was deleted" },
    },
    assertions: [assertStatus(404)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const versionNumber = state.deletedVersionNumber as number;
      const requestUrl = `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles/${articleId}/versions/${versionNumber}`;
      try {
        await getArticleVersion(ctx.projectId, articleId, versionNumber, ctx.token);
        return { status: "fail", httpStatus: 200, durationMs: Date.now() - start, failureReason: "Expected 404 but version still exists", requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        if (e.status === 404) {
          return { status: "pass", httpStatus: 404, durationMs: Date.now() - start, requestUrl, assertionResults: [] };
        }
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: `Expected 404 but got: ${e.message}`, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 7: Delete the entire article created in Step 1. Skips gracefully if Step 1 failed
    // (no createdArticleId set). Note: if the flow fails mid-run this step is skipped by the
    // runner — the [TEST]-prefixed article will need manual cleanup in that case.
    id: "articles.delete-created",
    name: "Delete test article (cleanup)",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}",
    method: "DELETE",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 1 · response.data.id" },
    },
    assertions: [assertStatus(204)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string | undefined;
      if (!articleId) {
        return { status: "skip", durationMs: Date.now() - start, failureReason: "state.createdArticleId not set — Step 1 did not succeed", assertionResults: [] };
      }
      const requestUrl = `${ctx.baseUrl}/v3/projects/${ctx.projectId}/articles/${articleId}`;
      try {
        await deleteArticle(ctx.projectId, articleId, ctx.token);
        state.articleDeleted = true;
        return { status: "pass", httpStatus: 204, durationMs: Date.now() - start, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },
];

registerSuite(tests);

export default tests;
