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
  hidden?: boolean;
  project_version_id?: string;
  current_workflow_status_id?: string;
  lang_code?: string;
  version_number?: number;
  public_version?: number;
  latest_version?: number;
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
