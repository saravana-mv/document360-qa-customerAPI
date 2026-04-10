# Claude Code Instructions — Document360 QA Customer API

## Memory Manager

After completing **any substantive response** (code changes, new findings, decisions, feedback received, API behaviours discovered, file locations learned), always spawn the Memory Manager agent **in the background** before finishing your reply.

Call it like this:

```
Agent tool:
  subagent_type: "general-purpose"
  run_in_background: true
  description: "Memory manager — detect and save"
  prompt: [see template below]
```

### What counts as "substantive"

Spawn the agent if any of the following happened in this turn:
- A file was created, renamed, or moved
- A new API behaviour or constraint was discovered (e.g. "category_id is required")
- The user corrected an approach or said "don't do X" / "always do Y"
- A new flow dependency was identified
- A deployment URL, environment detail, or external reference was mentioned
- The user described their role, preferences, or goals
- A project decision was made (naming convention, architecture choice, etc.)

Skip it for: pure read/explanation turns where nothing new was learned.

---

### Memory Manager Agent Prompt Template

Fill in `{{USER_MESSAGE}}` and `{{WORK_SUMMARY}}` before sending.

```
You are the Memory Manager for this Claude Code project.

Your job: read the turn summary below, decide if any memory files need to be
created or updated, and make the changes. Do nothing if nothing new was learned.

## Memory location
C:\Users\SaravanaKumar\.claude\projects\C--SK-02-Claude-document360-QA-CustomerAPI\memory\

## Memory types
- user       → user's role, goals, knowledge, preferences
- feedback   → corrections, "don't do X", "always do Y", rules
- project    → ongoing work, decisions, bugs, timelines
- reference  → pointers to files, URLs, external systems

## File format (every memory file must start with this frontmatter)
---
name: <short name>
description: <one-line description used to judge relevance in future sessions>
type: <user | feedback | project | reference>
---

<memory content>

## MEMORY.md rules
- MEMORY.md is an index only — never write memory content directly into it
- Each entry: `- [filename.md](filename.md) — one-line description`
- Keep total lines under 200

## What the user said
{{USER_MESSAGE}}

## What was done this turn
{{WORK_SUMMARY}}

## Your instructions
1. Read C:\Users\SaravanaKumar\.claude\projects\C--SK-02-Claude-document360-QA-CustomerAPI\memory\MEMORY.md
2. For each candidate memory, check if a relevant file already exists (read it)
3. Create new files or update existing ones as needed
4. Update MEMORY.md index if you added a new file
5. If nothing new to save, output "No memory updates needed" and stop
```

---

## Other standing rules

- Always `git push` after every commit (Azure SWA deploys on push)
- Flow file names: 40 characters max including `.flow.xml`
- Never replace an existing flow file without asking the user first
- When designing any flow that creates an article, always add a prerequisite
  step to create a category first, and a teardown step to delete the category
  last (the API requires category_id even though the spec marks it nullable)
- Check for entity dependencies whenever writing a new flow spec
