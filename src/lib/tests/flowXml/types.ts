// Internal types for the runtime XML flow interpreter.

import type { HttpMethod } from "../../../types/test.types";

export interface ParsedFlow {
  name: string;             // <name> — used as the `tag` for TestDefs
  group: string;            // <group> — Test Explorer category
  description?: string;
  stopOnFailure: boolean;
  steps: ParsedStep[];
}

export interface ParsedStep {
  number: number;
  name: string;
  endpointRef?: string;
  method: HttpMethod;
  /**
   * Path template, e.g. "/v3/projects/{project_id}/articles/{article_id}".
   * Path placeholders use {snake_case} (matched against pathParams below).
   */
  path: string;
  pathParams: Record<string, string>;   // raw expression, e.g. "{{state.createdArticleId}}"
  queryParams: Record<string, string>;
  /** Raw body text as written in XML (with placeholders, before interpolation). */
  body?: string;
  captures: ParsedCapture[];
  assertions: ParsedAssertion[];
  teardown: boolean;
  notes?: string;
}

export interface ParsedCapture {
  /** State variable to write to, e.g. "state.createdArticleId". */
  variable: string;
  /** Source expression, e.g. "response.data.id" or "body.title" or "pathParam.version_number". */
  source: string;
  /** Where to read from — defaults to "response". */
  from: "response" | "request";
}

export type ParsedAssertion =
  | { type: "status"; code: number }
  | { type: "field-exists"; field: string }
  | { type: "field-equals"; field: string; value: string };
