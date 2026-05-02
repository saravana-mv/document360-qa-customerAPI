# How to use the Flow Designer chat

The Flow Designer chat lets you refine and modify flow XML through natural-language conversation with FlowForge's AI assistant. Instead of editing XML manually, describe what you want to change and the AI updates the flow for you.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A flow XML file selected in the Spec Manager
- AI credits available

## Opening the chat

1. In the **Spec Manager**, navigate to the **Flows** tab
2. Select a flow XML file
3. Click the **Chat** tab in the right panel

The chat opens with the current flow XML as context. The AI can see the full flow definition and your API specs.

<!-- SCREENSHOT
id: flow-chat-panel
alt: Flow Designer chat panel showing conversation with the AI about a flow
page: /spec-manager
preconditions:
  - A flow XML exists
  - Flow is selected in the Flows tab
actions:
  - Click Chat tab
highlight: Chat input and message history
annotations: Labels for message input, AI response, and flow XML context
crop: panel-right
-->
[Screenshot: Flow Designer chat panel showing conversation with the AI about a flow]

## What you can do

### Modify existing steps

> "Add a query parameter `page_size=10` to the list articles step"

> "Change the assertion on step 3 to expect status 200 instead of 201"

### Add new steps

> "Add a step after the create article step that updates the article title"

> "Add a teardown step to delete the category at the end"

### Fix issues

> "The category_id capture path is wrong — fix it to use response.data.id"

> "Step 2 is missing the required workspace_id field in the body"

### Ask questions

> "What does step 4 do?"

> "Why is there a DELETE step at the end?"

## Plan confirmation

For significant changes, the AI may present a plan before modifying the flow:

1. The AI describes what it will change
2. You confirm or adjust the plan
3. The AI applies the changes to the flow XML

This prevents unexpected modifications to complex flows.

## Chat sessions

Chat sessions are **persistent** — your conversation history is saved per flow. If you close the browser and return later, the chat history is still there.

Each flow has its own independent chat session. Starting a chat on a different flow begins a fresh conversation.

## Context the AI uses

During chat, the AI has access to:

- The current flow XML
- Relevant endpoint specs (distilled)
- API rules for the version folder
- Diagnostic lessons
- Your conversation history

This rich context allows the AI to make informed changes that align with your API's specific behavior.

## Tips

- **Be specific**: "Change the body" is less effective than "Add the `status` field with value `1` to the POST body in step 2".
- **One change at a time**: For complex modifications, make one request per message. This keeps the conversation clear and makes it easier to review changes.
- **Review the XML**: After each AI change, review the updated flow XML to confirm it's correct.
- **Save your work**: After satisfactory changes, make sure the flow is saved.

## Related articles

- [How to generate flow XML from ideas](../03-ideas-and-flows/04-generate-flow-xml.md) — Initial flow creation
- [How to edit flow XML manually](../07-ai-features/04-edit-flow-xml.md) — Direct XML editing
- [How to create test scenarios from flows](../03-ideas-and-flows/07-create-test-scenarios-from-flows.md) — Register flows for testing
