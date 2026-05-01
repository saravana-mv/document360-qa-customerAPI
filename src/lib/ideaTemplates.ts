export interface IdeaTemplate {
  key: string;
  label: string;
  prompt: string;
}

export const IDEA_TEMPLATES: IdeaTemplate[] = [
  {
    key: "random",
    label: "Random",
    prompt: "__random__",
  },
  {
    key: "crud",
    label: "CRUD lifecycle",
    prompt: "Generate CRUD lifecycle flows for each entity — create, read, update, delete with proper setup and teardown.",
  },
  {
    key: "errors",
    label: "Error handling",
    prompt: "Focus on error scenarios: missing required fields (400), unauthorized access (401), resource not found (404), and validation errors (422).",
  },
  {
    key: "cross-entity",
    label: "Cross-entity deps",
    prompt: "Test foreign key relationships between resources — verify that child resources correctly reference parent entities and that cascading operations work.",
  },
  {
    key: "bulk",
    label: "Bulk operations",
    prompt: "Test bulk create/update/delete endpoints and verify their interaction with single-resource CRUD endpoints.",
  },
  {
    key: "state",
    label: "State transitions",
    prompt: "Test state transition workflows: publish/unpublish, lock/unlock, draft/active, enable/disable — verify correct status changes and constraints.",
  },
  {
    key: "auth",
    label: "Auth & permissions",
    prompt: "Test authentication and authorization: missing token (401), invalid token (401), insufficient permissions (403), expired token scenarios.",
  },
];
