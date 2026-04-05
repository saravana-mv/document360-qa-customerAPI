export interface Project {
  id: string;
  name: string;
  description?: string;
}

export interface ProjectVersion {
  id: string;
  name: string;
  versionNumber: string;
  isDefault: boolean;
}

export interface Article {
  id: string;
  title: string;
  content?: string;
  status?: string;
  workflowStatus?: string;
  langCode?: string;
  versionId?: string;
}

export interface ApiResponse<T> {
  data: T;
  success: boolean;
  message?: string;
}

export interface ApiError {
  status: number;
  message: string;
  raw?: unknown;
}
