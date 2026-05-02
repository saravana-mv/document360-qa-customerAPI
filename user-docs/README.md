# FlowForge User Documentation

Source of truth for FlowForge end-user documentation. Articles are dual-written here and to Document360 (published help center).

## Structure

Each numbered folder maps to a D360 category. Articles are numbered to control ordering.

## Screenshot Placeholders

Articles use structured HTML comment placeholders for screenshots:

```markdown
<!-- SCREENSHOT
id: unique-screenshot-id
alt: Description of what the screenshot shows
page: /relative/url/path
preconditions:
  - Required state before capture
actions:
  - Steps to reach the exact screen state
highlight: Area to emphasize
annotations: Callouts or arrows to add
crop: full-page | main-content | modal | panel-left | panel-right
-->
[Screenshot: Description of what the screenshot shows]
```

The visible `[Screenshot: ...]` text shows until images are inserted. The HTML comment provides structured capture instructions.

## Conventions

- Task-oriented titles ("How to..." not "Feature X")
- Structure: Introduction > Prerequisites > Steps > Tips > Related articles
- Terminology: "scenario" in Scenario Manager context, "flow" in Spec Manager context
- Note required role/permissions where relevant
