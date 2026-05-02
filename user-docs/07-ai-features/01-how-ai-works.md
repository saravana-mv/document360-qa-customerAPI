# How AI works in FlowForge

FlowForge uses Claude, Anthropic's AI assistant, to power several features across the platform. This guide explains how AI is integrated, what context it uses, and how to get the best results.

## AI-powered features

| Feature | Where | What it does |
|---|---|---|
| **Idea generation** | Spec Manager > Ideas tab | Analyzes API specs and suggests test scenarios |
| **Flow generation** | Spec Manager > Ideas tab | Creates detailed flow XML from selected ideas |
| **Flow Designer chat** | Spec Manager > Chat tab | Refines flows through natural-language conversation |
| **Ideas chat** | Spec Manager > Chat tab | Explores test strategy through conversation |
| **Flow editing** | Spec Manager > Flow viewer | AI-assisted XML modifications |
| **AI diagnosis** | Scenario Manager > Diagnose tab | Analyzes test failures and suggests fixes |

## How AI context works

Every AI operation receives a rich context to produce accurate results. The context includes:

### 1. API specifications

The AI reads your endpoint specs to understand:
- Available endpoints (method, path)
- Request body schemas (required and optional fields)
- Response schemas and status codes
- Path and query parameters

For efficiency, FlowForge uses **distilled specs** (~50-100 lines per endpoint) instead of raw OpenAPI specs. For large folders (>20 endpoints), a **digest** (~2-3 lines per endpoint) is used.

### 2. API rules

Your custom rules from `_system/_rules.json` are injected into every AI prompt. These tell the AI about your API's specific conventions, quirks, and requirements that aren't in the spec.

### 3. Diagnostic lessons

Previously learned patterns from `_system/_skills.md` are included automatically. Each time the AI successfully fixes a test failure, the lesson is recorded and used in future operations.

### 4. Project variables

The AI knows about your project variables (`{{proj.*}}`) so it can reference them correctly in generated flows.

### 5. Entity dependencies

The AI understands relationships between resources (e.g., articles depend on categories) and automatically includes setup and teardown steps.

## The AI pipeline

```
Your request
    ↓
Context assembly (specs + rules + lessons + variables)
    ↓
Claude AI processes the request
    ↓
Post-processing pipeline (11 validators/fixers for flow generation)
    ↓
Result delivered to you
```

The post-processing pipeline is critical for flow generation — it validates XML structure, injects required fields from the spec, fixes endpoint references, and ensures capture chains are correct.

## Cost tracking

Every AI operation consumes tokens, which are tracked in two ways:

- **Session cost pill** — In the TopBar, shows cumulative AI spend for the current session
- **Credit budget** — Per-project AI credit limit, also shown in the TopBar (turns red when exhausted)

When credits are exhausted, AI features are temporarily disabled until the budget is increased by a Project Owner.

## Tips for better AI results

### Write good API rules

The AI follows your rules verbatim. Specific, actionable rules produce better results:

- **Good**: "The `status` field in article responses returns integers: Draft=0, Published=1, Archived=2"
- **Less effective**: "Status is sometimes a number"

### Start with focused scopes

Generate ideas for a single resource folder before tackling the entire version. Focused scopes give the AI more detail per endpoint.

### Use the chat for refinement

If a generated flow isn't quite right, use the Flow Designer chat to make targeted changes rather than regenerating from scratch.

### Let lessons accumulate

Run your tests, use the Diagnose feature on failures, and apply fixes. Each successful fix teaches the AI something new about your API, improving future generations.

## Related articles

- [How to select an AI model](../07-ai-features/02-select-ai-model.md) — Model options and trade-offs
- [Understanding flow XML structure](../07-ai-features/03-flow-xml-structure.md) — What the AI generates
- [How to configure API rules and diagnostic lessons](../02-spec-manager/06-configure-api-rules.md) — Improving AI context
- [How to manage AI credits](../06-settings-and-administration/06-manage-ai-credits.md) — Budget management
