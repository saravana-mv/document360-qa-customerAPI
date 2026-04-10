import { apiClient, getApiVersion } from "./client";
import type { Article } from "../../types/api.types";

const p = (projectId: string) => `/${getApiVersion()}/projects/${projectId}`;

export async function getArticle(projectId: string, articleId: string, token: string): Promise<Article> {
  const resp = await apiClient.get<{ data: Article }>(`${p(projectId)}/articles/${articleId}`, token);
  return resp.data;
}

export async function patchArticle(projectId: string, articleId: string, body: Record<string, unknown>, token: string, langCode = "en"): Promise<Article> {
  const resp = await apiClient.patch<{ data: Article }>(`${p(projectId)}/articles/${articleId}?lang_code=${langCode}`, body, token);
  return resp.data;
}

export async function getArticleVersions(projectId: string, articleId: string, token: string): Promise<unknown[]> {
  const resp = await apiClient.get<{ data: unknown[] }>(`${p(projectId)}/articles/${articleId}/versions`, token);
  return resp.data || [];
}

export async function getArticleVersion(projectId: string, articleId: string, versionNumber: number, token: string): Promise<unknown> {
  const resp = await apiClient.get<{ data: unknown }>(`${p(projectId)}/articles/${articleId}/versions/${versionNumber}`, token);
  return resp.data;
}

export async function getArticleSettings(projectId: string, articleId: string, token: string, langCode = "en"): Promise<unknown> {
  const resp = await apiClient.get<{ data: unknown }>(`${p(projectId)}/articles/${articleId}/settings?lang_code=${langCode}`, token);
  return resp.data;
}

export async function patchArticleSettings(projectId: string, articleId: string, body: unknown, token: string, langCode = "en"): Promise<unknown> {
  const resp = await apiClient.patch<{ data: unknown }>(`${p(projectId)}/articles/${articleId}/settings?lang_code=${langCode}`, body, token);
  return resp.data;
}

export async function getWorkflowStatuses(projectId: string, token: string): Promise<unknown[]> {
  const resp = await apiClient.get<{ data: unknown[] }>(`${p(projectId)}/workflow-statuses`, token);
  return resp.data || [];
}

export async function patchArticleWorkflowStatus(projectId: string, articleId: string, body: unknown, token: string): Promise<unknown> {
  const resp = await apiClient.patch<{ data: unknown }>(`${p(projectId)}/articles/${articleId}/workflow-status`, body, token);
  return resp.data;
}

export async function bulkPatchArticles(projectId: string, body: unknown, token: string): Promise<unknown> {
  const resp = await apiClient.patch<{ data: unknown }>(`${p(projectId)}/articles/bulk`, body, token);
  return resp.data;
}

export async function deleteArticleVersion(projectId: string, articleId: string, versionNumber: number, token: string): Promise<void> {
  await apiClient.delete<void>(`${p(projectId)}/articles/${articleId}/versions/${versionNumber}`, token);
}

export async function createArticle(projectId: string, body: Record<string, unknown>, token: string): Promise<Article> {
  const resp = await apiClient.post<{ data: Article }>(`${p(projectId)}/articles`, body, token);
  return resp.data;
}

export async function publishArticle(projectId: string, articleId: string, body: Record<string, unknown>, token: string): Promise<void> {
  await apiClient.post<{ success: boolean }>(`${p(projectId)}/articles/${articleId}/publish`, body, token);
}

export async function forkArticle(projectId: string, articleId: string, token: string): Promise<Article> {
  const resp = await apiClient.post<{ data: Article }>(`${p(projectId)}/articles/${articleId}/fork`, {}, token);
  return resp.data;
}

export async function deleteArticle(projectId: string, articleId: string, token: string): Promise<void> {
  await apiClient.delete<void>(`${p(projectId)}/articles/${articleId}`, token);
}
