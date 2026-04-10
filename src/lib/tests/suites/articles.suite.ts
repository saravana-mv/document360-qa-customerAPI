import type { TestDef, TestContext, RunState, TestExecutionResult } from "../../../types/test.types";
import { registerSuite } from "../registry";
import { assertStatus, assertBodyHasField } from "../assertions";
import {
  getArticle,
  patchArticle,
  getArticleVersions,
  getArticleVersion,
  deleteArticleVersion,
  getArticleSettings,
  patchArticleSettings,
  getWorkflowStatuses,
  patchArticleWorkflowStatus,
  bulkPatchArticles,
  createArticle,
  publishArticle,
  forkArticle,
  deleteArticle,
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
const FLOW_VERSIONS = "Version Management";
const FLOW_BULK = "Bulk Operations";
const FLOW_LIFECYCLE = "Article Version Lifecycle";

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

  // ── Version Management ────────────────────────────────────────────────────
  // Source: version-management.flow.xml

  {
    // Step 1: List Article Versions
    // Captures state.versions (full array) and state.firstVersionNumber
    id: "articles.get-versions",
    name: "List article versions",
    tag: FLOW_VERSIONS,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions",
    method: "GET",
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const requestUrl = `${articleBase(ctx)}/versions`;
      try {
        const versions = await getArticleVersions(ctx.projectId, ctx.articleId!, ctx.token);
        state.versions = versions;
        const first = Array.isArray(versions) && versions.length > 0
          ? (versions[0] as Record<string, unknown>).version_number
          : undefined;
        state.firstVersionNumber = first;
        if (!versions || (versions as unknown[]).length === 0) {
          return { status: "fail", httpStatus: 200, durationMs: Date.now() - start, failureReason: "Expected non-empty versions array", requestUrl, assertionResults: [] };
        }
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: versions, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 2: Get Specific Article Version using firstVersionNumber captured in Step 1
    id: "articles.get-version",
    name: "Get specific article version",
    tag: FLOW_VERSIONS,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}",
    method: "GET",
    pathParamsMeta: {
      version_number: { value: "{{state.firstVersionNumber}}", tooltip: "Captured in Step 1 · response.data[0].version_number" },
    },
    assertions: [assertStatus(200)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const versionNumber = state.firstVersionNumber as number;
      const requestUrl = `${articleBase(ctx)}/versions/${versionNumber}`;
      try {
        const version = await getArticleVersion(ctx.projectId, ctx.articleId!, versionNumber, ctx.token);
        return { status: "pass", httpStatus: 200, durationMs: Date.now() - start, responseBody: version, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 3: Delete Draft Version (optional — skip gracefully if no draft exists)
    // state.draftVersionNumber is derived by scanning state.versions for is_draft === true
    // state.deletedVersionNumber is captured from the request path param used
    id: "articles.delete-version",
    name: "Delete draft article version",
    tag: FLOW_VERSIONS,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}",
    method: "DELETE",
    pathParamsMeta: {
      version_number: { value: "{{state.draftVersionNumber}}", tooltip: "Derived at runtime · first entry in state.versions where is_draft === true" },
    },
    assertions: [assertStatus(204)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      const versions = state.versions as Array<Record<string, unknown>> | undefined;
      const draftVersion = versions?.find((v) => v.is_draft === true);
      if (!draftVersion) {
        return {
          status: "skip",
          durationMs: Date.now() - start,
          failureReason: `No version with is_draft=true found among ${(versions ?? []).length} version(s) — deletion skipped`,
          requestUrl: `${articleBase(ctx)}/versions/{draft_version_number}`,
          stateSnapshot: {
            versions_scanned: (versions ?? []).length,
            versions,
            draft_version_found: null,
          },
          assertionResults: [],
        };
      }
      const versionNumber = draftVersion.version_number as number;
      state.deletedVersionNumber = versionNumber;
      const requestUrl = `${articleBase(ctx)}/versions/${versionNumber}`;
      try {
        await deleteArticleVersion(ctx.projectId, ctx.articleId!, versionNumber, ctx.token);
        return { status: "pass", httpStatus: 204, durationMs: Date.now() - start, requestUrl, assertionResults: [] };
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string };
        return { status: "fail", httpStatus: e.status, durationMs: Date.now() - start, failureReason: e.message, requestUrl, assertionResults: [] };
      }
    },
  },

  {
    // Step 4: Verify the deleted version now returns 404 (optional — skip if Step 3 was skipped)
    id: "articles.delete-version-verify",
    name: "Verify deleted version returns 404",
    tag: FLOW_VERSIONS,
    group: GROUP,
    path: "/v3/projects/{project_id}/articles/{article_id}/versions/{version_number}",
    method: "GET",
    pathParamsMeta: {
      version_number: { value: "{{state.deletedVersionNumber}}", tooltip: "Captured from Step 3 · version number that was deleted" },
    },
    assertions: [assertStatus(404)],
    execute: async (ctx: TestContext, state: RunState): Promise<TestExecutionResult> => {
      const start = Date.now();
      if (!state.deletedVersionNumber) {
        return {
          status: "skip",
          durationMs: Date.now() - start,
          failureReason: "Step 3 was skipped (no draft found) — 404 verification not applicable",
          stateSnapshot: {
            deletedVersionNumber: null,
            note: "state.deletedVersionNumber was not set because Step 3 found no draft version to delete",
          },
          assertionResults: [],
        };
      }
      const versionNumber = state.deletedVersionNumber as number;
      const requestUrl = `${articleBase(ctx)}/versions/${versionNumber}`;
      try {
        await getArticleVersion(ctx.projectId, ctx.articleId!, versionNumber, ctx.token);
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
