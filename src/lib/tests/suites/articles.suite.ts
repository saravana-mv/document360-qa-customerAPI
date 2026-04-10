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
import { createCategory, deleteCategory } from "../../api/categories";

const GROUP = "Articles";
const FLOW_LIFECYCLE = "Article Version Lifecycle";

/** Base URL for article endpoints using the configured API version (e.g. v3). */
function articlesBase(ctx: TestContext) {
  return `${ctx.baseUrl}/${ctx.apiVersion}/projects/${ctx.projectId}`;
}

const tests: TestDef[] = [
  // ── Article Version Lifecycle ─────────────────────────────────────────────
  // Source: article-version-lifecycle.flow.xml
  //
  // Dependency chain:
  //   Step 1: Create Category  ──► state.createdCategoryId
  //   Step 2: Create Article   ──► state.createdArticleId  (uses category_id from Step 1)
  //   Steps 3–7: publish / fork / verify / delete draft version
  //   Step 8: Delete Article   (teardown — must run before Step 9)
  //   Step 9: Delete Category  (teardown — category must be empty first)

  {
    // Step 1: Create a category. Required because the API enforces category_id on article creation.
    id: "articles.create-category",
    name: "Create category",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/{apiVersion}/projects/{project_id}/categories",
    method: "POST",
    sampleRequestBody: {
      name: "[TEST] Version Lifecycle - <timestamp>",
      project_version_id: "<ctx.versionId>",
    },
    assertions: [assertStatus(201), assertBodyHasField("id")],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${ctx.baseUrl}/${ctx.apiVersion}/projects/${ctx.projectId}/categories`;
      try {
        const requestBody = {
          name: `[TEST] Version Lifecycle - ${Date.now()}`,
          project_version_id: ctx.versionId,
        };
        const category = await createCategory(ctx.projectId, requestBody, ctx.token);
        state.createdCategoryId = category.id;
        state.createdCategoryName = category.name;
        return { status: "pass", httpStatus: 201, durationMs: Date.now() - start, responseBody: category, requestUrl, requestBody, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 2: Create a fresh article using the category from Step 1.
    id: "articles.create",
    name: "Create article",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles",
    method: "POST",
    pathParamsMeta: {
      // no path params beyond project_id
    },
    sampleRequestBody: {
      title: "[TEST] Version Lifecycle - <timestamp>",
      content: "Test article created by the Article Version Lifecycle flow.",
      category_id: "<state.createdCategoryId>",
      project_version_id: "<ctx.versionId>",
    },
    assertions: [assertStatus(201), assertBodyHasField("id")],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articlesBase(ctx)}/articles`;
      try {
        const requestBody = {
          title: `[TEST] Version Lifecycle - ${Date.now()}`,
          content: "Test article created by the Article Version Lifecycle flow.",
          category_id: state.createdCategoryId,
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
    // Step 3: Publish the draft created in Step 2.
    id: "articles.publish",
    name: "Publish article",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/publish",
    method: "POST",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 2 · response.data.id" },
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
      const requestUrl = `${articlesBase(ctx)}/articles/${articleId}/publish`;
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
    // Step 4: Fork the published version, creating a new draft.
    id: "articles.fork",
    name: "Fork published version (create draft)",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/fork",
    method: "POST",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 2 · response.data.id" },
    },
    assertions: [assertStatus(201), assertBodyHasField("version_number")],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const requestUrl = `${articlesBase(ctx)}/articles/${articleId}/fork`;
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
    // Step 5: GET the article and assert it surfaces the forked draft as the current version.
    id: "articles.get-forked",
    name: "Retrieve article — verify draft exists",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}",
    method: "GET",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 2 · response.data.id" },
    },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const requestUrl = `${articlesBase(ctx)}/articles/${articleId}?lang_code=${ctx.langCode}`;
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
    // Step 6: Delete the draft version created by the fork.
    id: "articles.delete-draft-version",
    name: "Delete draft version",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}",
    method: "DELETE",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 2 · response.data.id" },
      version_number: { value: "{{state.draftVersionNumber}}", tooltip: "Captured in Step 4 (fork) · response.data.version_number" },
    },
    assertions: [assertStatus(204)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const versionNumber = state.draftVersionNumber as number;
      const requestUrl = `${articlesBase(ctx)}/articles/${articleId}/versions/${versionNumber}`;
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
    // Step 7: Confirm the deleted version now returns 404.
    id: "articles.verify-draft-deleted",
    name: "Verify deleted version returns 404",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}",
    method: "GET",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 2 · response.data.id" },
      version_number: { value: "{{state.deletedVersionNumber}}", tooltip: "Captured from Step 6 · version number that was deleted" },
    },
    assertions: [assertStatus(404)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string;
      const versionNumber = state.deletedVersionNumber as number;
      const requestUrl = `${articlesBase(ctx)}/articles/${articleId}/versions/${versionNumber}`;
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
    // Step 8: Delete the article before the category (category must be empty first).
    id: "articles.delete-created",
    name: "Delete test article (cleanup)",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}",
    method: "DELETE",
    pathParamsMeta: {
      article_id: { value: "{{state.createdArticleId}}", tooltip: "Created in Step 2 · response.data.id" },
    },
    assertions: [assertStatus(204)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const articleId = state.createdArticleId as string | undefined;
      if (!articleId) {
        return { status: "skip", durationMs: Date.now() - start, failureReason: "state.createdArticleId not set — Step 2 did not succeed", assertionResults: [] };
      }
      const requestUrl = `${articlesBase(ctx)}/articles/${articleId}`;
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

  {
    // Step 9: Delete the category created in Step 1.
    id: "articles.delete-category",
    name: "Delete test category (cleanup)",
    tag: FLOW_LIFECYCLE,
    group: GROUP,
    path: "/{apiVersion}/projects/{project_id}/categories/{category_id}",
    method: "DELETE",
    pathParamsMeta: {
      category_id: { value: "{{state.createdCategoryId}}", tooltip: "Created in Step 1 · response.data.id" },
    },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const categoryId = state.createdCategoryId as string | undefined;
      if (!categoryId) {
        return { status: "skip", durationMs: Date.now() - start, failureReason: "state.createdCategoryId not set — Step 1 did not succeed", assertionResults: [] };
      }
      const requestUrl = `${ctx.baseUrl}/${ctx.apiVersion}/projects/${ctx.projectId}/categories/${categoryId}?project_version_id=${ctx.versionId}`;
      try {
        await deleteCategory(ctx.projectId, categoryId, ctx.versionId, ctx.token);
        state.categoryDeleted = true;
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },
];

registerSuite(tests);

export default tests;
