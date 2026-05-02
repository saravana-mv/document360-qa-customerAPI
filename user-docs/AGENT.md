# User Docs Agent Instructions

This file contains everything needed to maintain FlowForge user documentation. Any developer with Claude Code and the Document360 MCP connected can use these instructions.

## How to Trigger

Say anything like:
- "check for doc changes and update user docs"
- "update the user guide for [feature]"
- "we shipped [feature] — update the docs"

## Workflow

### For ongoing maintenance (weekly check)

1. Read `user-docs/d360-category-map.json` to see all existing articles and their D360 IDs
2. Scan recent git commits (`git log --since="1 week ago"`) to identify codebase changes
3. Read affected articles in `user-docs/` to see what's outdated
4. Present a plan: which articles to create/update
5. After user approval, dual-write to `user-docs/` AND D360
6. Update `d360-category-map.json` with any new article IDs
7. Commit and push

### For new articles

1. Write full article to `user-docs/{folder}/{file}.md` (with screenshot placeholders)
2. Create in D360 via MCP with `contentType=0` (Markdown), same content minus HTML comments
3. Add the new article ID to `d360-category-map.json`
4. Commit and push

### For updating existing articles

1. Edit the local `.md` file in `user-docs/`
2. Update in D360 via `document360-mcp-update-article` using the article ID from `d360-category-map.json`
3. Commit and push

---

## Document360 Config

- **Project**: eos (`fba8847e-edd4-4b69-9ad0-b11bf7b33994`)
- **Version**: flowforge (`e569dd91-49a1-4485-8a26-3fe71e95cb01`)
- **Content type**: Markdown (`contentType = 0`)
- **Articles**: Created as drafts (user publishes manually in D360 portal)
- **MCP tools**: `document360-mcp-create-article`, `document360-mcp-update-article`, `document360-mcp-create-category`, `document360-mcp-get-categories`

## Category IDs

| Folder | D360 Category ID | Name |
|---|---|---|
| `01-getting-started` | `2de50781-a5d6-4957-b2fb-a77abf0a0ffe` | Getting Started |
| `02-spec-manager` | `da343f71-786f-48f2-b942-7612ac386d51` | Spec Manager |
| `03-ideas-and-flows` | `c4b0ed7c-6491-4811-9e94-7d441fd05d92` | Ideas & Flows |
| `04-scenario-manager` | `b89bafbe-3bfc-4968-88d8-4d73a33f22c5` | Scenario Manager |
| `05-connections-and-authentication` | `960925ba-34db-42aa-8e2c-83d329ffb576` | Connections & Authentication |
| `06-settings-and-administration` | `42cfeb57-5110-4847-95e8-6683e2c38f70` | Settings & Administration |
| `07-ai-features` | `a3782c50-74ea-4e20-b911-caf6916d586a` | AI Features |
| `08-public-api` | `57d4552d-26ad-4b2b-9c73-be9f90c86ab5` | Public API |
| `09-troubleshooting-and-faq` | `c144c8a6-fc79-4857-925f-10b5c6606da4` | Troubleshooting & FAQ |

All article IDs are in `d360-category-map.json` (the machine-readable source of truth).

---

## Writing Conventions

### Article Structure

Every article follows: **Introduction > Prerequisites > Steps > Tips/Notes > Related articles**

### Screenshot Placeholders

Use structured HTML comments in the git version (stripped for D360):

```markdown
<!-- SCREENSHOT
id: unique-id
alt: Description
page: /url/path
preconditions:
  - Required state
actions:
  - Steps to reach screen state
highlight: Area to emphasize
annotations: Callouts/arrows
crop: full-page | main-content | modal | panel-left | panel-right
-->
[Screenshot: Description]
```

### Terminology

- **Spec Manager context**: say "flow" (the XML authoring artifact)
- **Scenario Manager context**: say "scenario" (with steps)
- Never cross the vocabulary

### Role Awareness

Note required role/permissions in Prerequisites:
- 5-tier hierarchy: Super Owner > Project Owner > QA Manager > QA Engineer > Member

### D360 vs Git Differences

The git version is the source of truth. When creating/updating in D360:
- Strip the `# Title` heading (D360 uses the `title` field)
- Strip HTML comment screenshot blocks (keep only `[Screenshot: ...]` text)
- Convert relative `../` links to plain text references (D360 handles linking separately)

---

## Key Source Files for Accuracy

When writing articles, read these to ensure accuracy:
- `src/pages/` — Page components (SpecFilesPage, TestPage, SettingsPage, ProjectSelectionPage)
- `src/components/common/SideNav.tsx` — Navigation structure
- `src/components/common/TopBar.tsx` — TopBar elements
- `src/store/` — Store files for feature behavior
- `CLAUDE.md` — Authoritative architecture reference
