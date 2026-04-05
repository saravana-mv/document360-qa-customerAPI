import { apiClient } from "./client";
import type { Article } from "../../types/api.types";

export async function getArticle(projectId: string, articleId: string, token: string): Promise<Article> {
  const resp = await apiClient.get<{ data: Article }>(`/v3/projects/${projectId}/articles/${articleId}`, token);
  return resp.data;
}

export async function patchArticle(projectId: string, articleId: string, body: Partial<Article>, token: string): Promise<Article> {
  const resp = await apiClient.patch<{ data: Article }>(`/v3/projects/${projectId}/articles/${articleId}`, body, token);
  return resp.data;
}

export async function getArticleVersions(projectId: string, articleId: string, token: string): Promise<unknown[]> {
  const resp = await apiClient.get<{ data: unknown[] }>(`/v3/projects/${projectId}/articles/${articleId}/versions`, token);
  return resp.data || [];
}

export async function getArticleVersion(projectId: string, articleId: string, versionNumber: number, token: string): Promise<unknown> {
  const resp = await apiClient.get<{ data: unknown }>(`/v3/projects/${projectId}/articles/${articleId}/versions/${versionNumber}`, token);
  return resp.data;
}

export async function getArticleSettings(projectId: string, articleId: string, token: string): Promise<unknown> {
  const resp = await apiClient.get<{ data: unknown }>(`/v3/projects/${projectId}/articles/${articleId}/settings`, token);
  return resp.data;
}

export async function patchArticleSettings(projectId: string, articleId: string, body: unknown, token: string): Promise<unknown> {
  const resp = await apiClient.patch<{ data: unknown }>(`/v3/projects/${projectId}/articles/${articleId}/settings`, body, token);
  return resp.data;
}

export async function patchArticleWorkflowStatus(projectId: string, articleId: string, body: unknown, token: string): Promise<unknown> {
  const resp = await apiClient.patch<{ data: unknown }>(`/v3/projects/${projectId}/articles/${articleId}/workflow-status`, body, token);
  return resp.data;
}

export async function bulkPatchArticles(projectId: string, body: unknown, token: string): Promise<unknown> {
  const resp = await apiClient.patch<{ data: unknown }>(`/v3/projects/${projectId}/articles/bulk`, body, token);
  return resp.data;
}
