// Centralized audit log for FlowForge.
//
// Every significant mutation is recorded as a document in the "audit-log"
// Cosmos container, partitioned by projectId. Writes are fire-and-forget
// so they never block the main request.

import { randomUUID } from "node:crypto";
import { getAuditLogContainer } from "./cosmosClient";

export type AuditAction =
  | "flow.create"
  | "flow.update"
  | "flow.delete"
  | "flow.lock"
  | "flow.unlock"
  | "scenario.activate"
  | "scenario.deactivate"
  | "scenario.run"
  | "apikey.create"
  | "apikey.revoke"
  | "user.invite"
  | "user.role_change"
  | "user.remove"
  | "project.reset"
  | "spec.upload"
  | "spec.update"
  | "spec.rename"
  | "spec.delete"
  | "spec.import_url"
  | "spec.sync";

interface AuditEntry {
  id: string;
  projectId: string;
  type: "audit";
  action: AuditAction;
  actor: { oid: string; name: string };
  target?: string;
  details?: Record<string, unknown>;
  timestamp: string;
}

/**
 * Write an audit log entry. Fire-and-forget — errors are swallowed
 * so audit logging never breaks the main request flow.
 */
export function audit(
  projectId: string,
  action: AuditAction,
  actor: { oid: string; name: string },
  target?: string,
  details?: Record<string, unknown>,
): void {
  const entry: AuditEntry = {
    id: `audit:${randomUUID()}`,
    projectId,
    type: "audit",
    action,
    actor,
    target,
    details,
    timestamp: new Date().toISOString(),
  };

  // Fire-and-forget — log errors but never block the request
  getAuditLogContainer()
    .then((c) => c.items.upsert(entry))
    .catch((e) => console.error("[audit] write failed:", action, e instanceof Error ? e.message : String(e)));
}
