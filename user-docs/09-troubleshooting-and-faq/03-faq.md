# Frequently asked questions

## General

### What is FlowForge?

FlowForge is an AI-assisted API testing platform. It helps QA teams import API specifications, generate test scenarios using AI, execute tests against live endpoints, and track results — all from a single web application.

### What APIs can FlowForge test?

Any REST API. FlowForge is completely generic — it's not tied to any specific API vendor. You import your OpenAPI/Swagger spec, configure a connection with your API's base URL and credentials, and generate tests.

### What AI model does FlowForge use?

FlowForge uses Claude by Anthropic. The default model is Claude Sonnet 4.6, which offers the best balance of quality and cost. You can also select Claude Opus 4.6 for maximum accuracy on complex APIs.

### Is my API data sent to the AI?

Your API specs (endpoint definitions, schemas) are sent to Claude for idea and flow generation. **Actual API response data from test runs is never sent to the AI** unless you explicitly use the Diagnose feature, which sends the specific failing step's request/response for analysis.

## Accounts and access

### How do I log in?

FlowForge uses Microsoft Entra ID (formerly Azure AD) for authentication. You log in with your organization's Microsoft account. There are no separate FlowForge credentials.

### I can't see any projects

You need to be invited to a project by a Project Owner or QA Manager. Contact your team lead or a Super Owner to get access.

### What's the difference between Super Owner and Project Owner?

**Super Owners** have tenant-wide access — they see all projects, manage global settings, and control AI credit budgets. **Project Owners** have full control within a single project. See [Understanding roles and permissions](../01-getting-started/04-roles-and-permissions.md) for the full hierarchy.

## Specs and imports

### What spec formats are supported?

OpenAPI 3.x (JSON or YAML) and Swagger 2.x (JSON). You can import from a URL or upload files directly.

### Can I test without an API spec?

Technically, you can create flow XML manually without importing specs. However, AI features (idea generation, flow generation, chat) require spec files to produce accurate results.

### How do I update my specs when the API changes?

Use the **Reimport** feature in the Spec Manager. It re-downloads from the original URL, compares changes, and updates the distilled specs. Existing flows are not affected — they reference endpoint specs by path, so as long as the endpoint paths haven't changed, everything continues to work.

## Flows and scenarios

### What's the difference between a flow and a scenario?

A **flow** is the XML definition of a test (authored in the Spec Manager). A **scenario** is a registered, runnable instance of a flow (managed in the Scenario Manager). Think of flows as templates and scenarios as executable instances.

### Can I run the same flow as multiple scenarios?

Yes. A flow can be registered as a scenario, and you can create multiple scenarios from the same flow with different environment overrides.

### How do I pass data between steps?

Use **captures** and **state variables**. A `<capture>` extracts a value from a step's response and stores it as `{{state.variableName}}`. Later steps reference it using the same syntax. See [Understanding flow XML structure](../07-ai-features/03-flow-xml-structure.md).

### Can I run scenarios in parallel?

Currently, scenarios run sequentially. When running multiple scenarios, each one completes before the next begins.

## Connections and credentials

### Are my API credentials safe?

Yes. Credentials are stored server-side in the database and never sent to the browser. The FlowForge proxy injects authentication headers on the server side. The browser only sees `hasCredential: true/false`.

### Can I test against multiple environments?

Yes, in two ways:
1. **Multiple connections**: Create separate connections for each environment (dev, staging, production) in Settings > Connections
2. **Per-scenario overrides**: Override the connection for individual scenarios via the context menu in the Scenario Manager

### What authentication methods are supported?

OAuth 2.0 (client credentials), Bearer Token, API Key (header), API Key (query parameter), Basic Auth, and Cookie.

## AI features

### How much do AI operations cost?

With the default Sonnet model: idea generation ~$0.02–0.05, flow generation ~$0.05–0.10, chat messages ~$0.01–0.03 each. Costs are tracked via the credit pill in the TopBar.

### How can I improve AI-generated flows?

1. **Add API rules**: Tell the AI about your API's conventions (Settings > Spec Manager > API Rules)
2. **Use AI diagnosis**: Run tests, diagnose failures, and apply fixes. Each fix teaches the AI a lesson for future operations
3. **Refine via chat**: Use the Flow Designer chat for targeted modifications
4. **Focus scope**: Generate ideas for single folders instead of entire versions

### Can I edit AI-generated flows?

Yes. You can edit flow XML manually in the Spec Manager's editor or use AI-assisted editing (describe changes in natural language). See [How to edit flow XML manually](../07-ai-features/04-edit-flow-xml.md).

## Public API and CI/CD

### Can I run tests from a CI/CD pipeline?

Yes. Create an API key in Settings > API Keys, then call `POST /api/run-scenario` with the scenario ID. See [How to integrate FlowForge with CI/CD pipelines](../08-public-api/02-cicd-integration.md).

### Do API-triggered runs appear in the UI?

Yes. Runs triggered via the Public API appear in the Scenario Manager's Run History tab, labeled with source "api".

### Can I run multiple scenarios from one API call?

Currently, each API call runs one scenario. To run multiple scenarios, make separate calls (sequentially or in parallel from your script).

## Troubleshooting

### My test was passing but now fails

Check the audit log (Settings > Audit Log) for recent changes. Common causes:
- Someone edited the flow XML
- A project variable was changed or deleted
- The target API's behavior changed
- Connection credentials expired

### Where can I see detailed error information?

1. **Scenario Manager**: Click a failed step to see the request/response details
2. **Diagnose tab**: Use AI diagnosis for automated failure analysis
3. **Audit log**: Check for recent changes that may have caused the failure

### How do I report a bug or request a feature?

Contact your FlowForge administrator. If you're a developer, check the project's issue tracker.

## Related articles

- [Common issues and solutions](../09-troubleshooting-and-faq/01-common-issues.md) — Detailed troubleshooting
- [Understanding error messages](../09-troubleshooting-and-faq/02-error-messages.md) — Error reference
- [What is FlowForge?](../01-getting-started/01-what-is-flowforge.md) — Product overview
