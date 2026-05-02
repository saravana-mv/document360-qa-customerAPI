# How to use the Ideas chat

The Ideas chat lets you discuss test strategy with FlowForge's AI assistant before or after generating ideas. Use it to explore testing approaches, ask about API behavior, or request specific types of test scenarios.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A folder selected in the Spec Manager with imported specs
- AI credits available

## Opening the chat

1. In the **Spec Manager**, select a resource or version folder
2. Click the **Chat** tab in the right panel
3. The chat opens with context about the selected folder's endpoints

## What you can do

### Explore test strategy

> "What edge cases should I consider for the articles endpoints?"

> "Are there any cross-resource dependencies I should test?"

### Request specific ideas

> "Generate an idea for testing article publishing with invalid status transitions"

> "I need a test scenario that creates articles in bulk and verifies pagination"

### Ask about the API

> "What required fields does the POST /articles endpoint need?"

> "What status codes can the DELETE /categories endpoint return?"

### Refine existing ideas

> "The 'Create and retrieve' idea is too basic — can you make it more comprehensive?"

> "Combine the create and update ideas into a single end-to-end flow"

## Context available to the AI

During chat, the AI can see:

- Endpoint specs in the selected folder
- API rules and diagnostic lessons
- Previously generated ideas
- Your conversation history

## Tips

- **Use before generating**: Chat first to understand the API surface, then generate ideas with better context.
- **Use after generating**: If generated ideas miss important scenarios, describe what you need in the chat.
- **Be specific about your testing goals**: "I need to test error handling for unauthorized access" gives the AI clear direction.

## Related articles

- [How to generate test ideas from API specs](../03-ideas-and-flows/01-generate-test-ideas.md) — Automated idea generation
- [How to use the Flow Designer chat](../03-ideas-and-flows/05-flow-designer-chat.md) — Chat for flow refinement
- [How to configure API rules and diagnostic lessons](../02-spec-manager/06-configure-api-rules.md) — Enriching AI context
