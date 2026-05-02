# Understanding idea generation modes

FlowForge generates test ideas at different scopes depending on what you select in the Spec Manager. This guide explains the different modes and when to use each.

## Prerequisites

- Logged in with **QA Engineer** role or above
- A project selected with imported specs

## Generation scopes

### Resource folder scope

**When:** You select a resource folder (e.g., `articles/`, `categories/`)

The AI generates ideas focused on that single resource's endpoints. This produces the most specific and actionable test scenarios.

**Example ideas for an `articles/` folder:**
- Create an article with all required fields and verify the response
- Create an article, update its title, then retrieve to confirm the change
- Create an article in a specific category, then delete both (teardown)
- Attempt to create an article with missing required fields (error case)
- Retrieve a non-existent article and verify 404 response

### Version folder scope

**When:** You select a top-level version folder (e.g., `v3/`)

The AI generates ideas across all resources in the version. This is useful for discovering cross-resource workflows and integration scenarios.

**Example ideas for a version folder:**
- Create a category, create an article in it, publish the article, verify listing
- Create a project variable, use it in an article creation, verify interpolation
- Test pagination across all list endpoints

### Subfolder aggregation

**When:** You select a parent folder that contains subfolders

Ideas are generated from the consolidated set of all specs in the selected folder and its subfolders. This ensures cross-folder dependencies are considered.

## Spec context optimization

FlowForge uses different strategies depending on the number of endpoints:

| Endpoint count | Strategy | Detail level |
|---|---|---|
| 20 or fewer | **Full distilled specs** | Complete endpoint details (~50-100 lines each) |
| More than 20 | **Digest mode** | Lightweight index (~2-3 lines each) |

This optimization keeps AI costs manageable for large APIs while maintaining quality for smaller, focused scopes.

### What this means for you

- **Small folders** (1-20 endpoints): AI sees full detail of every endpoint, producing very specific ideas
- **Large folders** (20+ endpoints): AI sees a summary of each endpoint, producing broader workflow ideas. You can then drill into specific resource folders for more detailed scenarios.

## Tips

- **Start narrow, then broaden**: Begin with individual resource folders for focused testing, then generate version-level ideas for integration scenarios.
- **Ideas are additive**: Generating ideas at different scopes adds to your collection. Version-level ideas don't replace resource-level ones.
- **Check for overlap**: When generating at both levels, review for duplicate scenarios and deselect redundant ideas before generating flows.
- **AI rules matter**: Your API rules (`_system/_rules.json`) are included in every generation, so the AI accounts for your API's specific conventions regardless of scope.

## Related articles

- [How to generate test ideas from API specs](../03-ideas-and-flows/01-generate-test-ideas.md) — Step-by-step guide
- [How to manage and select ideas](../03-ideas-and-flows/03-manage-and-select-ideas.md) — Organizing generated ideas
- [How to configure API rules and diagnostic lessons](../02-spec-manager/06-configure-api-rules.md) — Customizing AI context
