# How to select an AI model

FlowForge lets you choose which Claude model to use for AI operations. Different models offer different trade-offs between quality, speed, and cost.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected

## Selecting a model

The AI model selector is available in the setup panel. Select your preferred model from the dropdown — it takes effect immediately for all subsequent AI operations.

## Available models

| Model | Best for | Cost | Quality |
|---|---|---|---|
| **Claude Sonnet 4.6** (default) | General use — ideas, flows, chat, diagnosis | Moderate ($3/$15 per Mtok) | High |
| **Claude Opus 4.6** | Complex scenarios requiring maximum accuracy | Higher | Highest |
| **Claude Haiku 4.5** | Not recommended for FlowForge | Lower | Lower |

> **Recommendation:** Claude Sonnet 4.6 is the default and recommended model for all FlowForge operations. It provides an excellent balance of quality and cost. Opus offers marginal improvement at significantly higher cost. Haiku is not recommended — its lower accuracy can produce incorrect flows and diagnoses.

## How model selection affects features

The selected model is used for all AI operations:

- Idea generation
- Flow generation
- Flow Designer chat
- Ideas chat
- Flow editing (AI-assisted)
- AI diagnosis

All operations use the same model — you cannot select different models for different features.

## Cost implications

| Model | Input cost (per Mtok) | Output cost (per Mtok) | Typical flow generation |
|---|---|---|---|
| Sonnet 4.6 | $3.00 | $15.00 | ~$0.05-0.10 |
| Opus 4.6 | Higher | Higher | ~$0.15-0.30 |

Costs are tracked against your project's AI credit budget. Monitor usage via the credit pill in the TopBar.

## Tips

- **Stick with Sonnet**: For the vast majority of use cases, Sonnet 4.6 produces excellent results at reasonable cost.
- **Try Opus for complex APIs**: If you have a large, complex API with many entity dependencies and Sonnet produces inconsistent results, try Opus.
- **Monitor costs**: Higher-tier models consume credits faster. Check the credit pill before large batch operations.

## Related articles

- [How AI works in FlowForge](../07-ai-features/01-how-ai-works.md) — Understanding AI context and pipeline
- [How to manage AI credits](../06-settings-and-administration/06-manage-ai-credits.md) — Budget management
