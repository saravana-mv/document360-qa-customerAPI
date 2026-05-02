# How to integrate FlowForge with CI/CD pipelines

FlowForge can be integrated into your CI/CD pipeline to automatically run API tests on every deployment, pull request, or scheduled trigger. This guide shows how to set up the integration with popular CI/CD platforms.

## Prerequisites

- A FlowForge API key (see [How to manage API keys](../06-settings-and-administration/04-manage-api-keys.md))
- Active scenarios in the Scenario Manager
- Access to your CI/CD platform's configuration

## Overview

The integration pattern is straightforward:

1. **Store** your FlowForge API key as a CI/CD secret
2. **Call** the `/api/run-scenario` endpoint after deployment
3. **Check** the response `status` field to pass or fail the pipeline

## GitHub Actions

### Step 1: Add the API key as a secret

1. Go to your GitHub repository > **Settings** > **Secrets and variables** > **Actions**
2. Click **New repository secret**
3. Name: `FLOWFORGE_API_KEY`
4. Value: Your FlowForge API key (e.g., `ff_a1b2c3...`)

### Step 2: Add a test job to your workflow

```yaml
name: Deploy and Test

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Deploy application
        run: echo "Your deploy steps here"

  api-tests:
    needs: deploy
    runs-on: ubuntu-latest
    steps:
      - name: Run FlowForge scenarios
        run: |
          RESULT=$(curl -s -X POST "${{ vars.FLOWFORGE_URL }}/api/run-scenario" \
            -H "Content-Type: application/json" \
            -H "X-Api-Key: ${{ secrets.FLOWFORGE_API_KEY }}" \
            -d '{"scenarioId": "${{ vars.SCENARIO_ID }}"}')

          echo "$RESULT" | jq .

          STATUS=$(echo "$RESULT" | jq -r '.status')
          if [ "$STATUS" != "pass" ]; then
            echo "API test failed with status: $STATUS"
            exit 1
          fi
```

### Step 3: Add variables

In **Settings** > **Secrets and variables** > **Actions** > **Variables**:
- `FLOWFORGE_URL`: Your FlowForge instance URL
- `SCENARIO_ID`: The scenario ID to run

## GitLab CI

```yaml
stages:
  - deploy
  - test

deploy:
  stage: deploy
  script:
    - echo "Your deploy steps here"

api-tests:
  stage: test
  needs: [deploy]
  image: curlimages/curl:latest
  script:
    - |
      RESULT=$(curl -s -X POST "${FLOWFORGE_URL}/api/run-scenario" \
        -H "Content-Type: application/json" \
        -H "X-Api-Key: ${FLOWFORGE_API_KEY}" \
        -d "{\"scenarioId\": \"${SCENARIO_ID}\"}")

      echo "$RESULT" | python3 -m json.tool

      STATUS=$(echo "$RESULT" | python3 -c "import sys,json; print(json.load(sys.stdin)['status'])")
      if [ "$STATUS" != "pass" ]; then
        echo "API test failed"
        exit 1
      fi
  variables:
    FLOWFORGE_URL: "https://your-flowforge-url"
    SCENARIO_ID: "your-scenario-id"
```

Store `FLOWFORGE_API_KEY` in **Settings** > **CI/CD** > **Variables** (masked).

## Azure DevOps

```yaml
trigger:
  branches:
    include:
      - main

stages:
  - stage: Deploy
    jobs:
      - job: DeployApp
        steps:
          - script: echo "Your deploy steps here"

  - stage: Test
    dependsOn: Deploy
    jobs:
      - job: APITests
        steps:
          - script: |
              RESULT=$(curl -s -X POST "$(FLOWFORGE_URL)/api/run-scenario" \
                -H "Content-Type: application/json" \
                -H "X-Api-Key: $(FLOWFORGE_API_KEY)" \
                -d '{"scenarioId": "$(SCENARIO_ID)"}')

              echo "$RESULT" | jq .

              STATUS=$(echo "$RESULT" | jq -r '.status')
              if [ "$STATUS" != "pass" ]; then
                echo "##vso[task.logissue type=error]API test failed with status: $STATUS"
                exit 1
              fi
            displayName: Run FlowForge scenarios
```

Store `FLOWFORGE_API_KEY` as a pipeline variable (secret).

## Running multiple scenarios

To run several scenarios in sequence and fail if any one fails:

```bash
#!/bin/bash
SCENARIOS=("scenario-id-1" "scenario-id-2" "scenario-id-3")
FAILED=0

for SID in "${SCENARIOS[@]}"; do
  echo "Running scenario: $SID"
  RESULT=$(curl -s -X POST "$FLOWFORGE_URL/api/run-scenario" \
    -H "Content-Type: application/json" \
    -H "X-Api-Key: $FLOWFORGE_API_KEY" \
    -d "{\"scenarioId\": \"$SID\"}")

  STATUS=$(echo "$RESULT" | jq -r '.status')
  NAME=$(echo "$RESULT" | jq -r '.scenarioName')
  echo "$NAME: $STATUS"

  if [ "$STATUS" != "pass" ]; then
    FAILED=$((FAILED + 1))
  fi
done

if [ $FAILED -gt 0 ]; then
  echo "$FAILED scenario(s) failed"
  exit 1
fi

echo "All scenarios passed"
```

## Interpreting results

| `status` value | Pipeline action |
|---|---|
| `pass` | All steps passed — continue pipeline |
| `fail` | One or more assertions failed — fail the pipeline |
| `error` | Runtime error (auth, network, parse) — fail and investigate |

For detailed diagnostics, parse the `steps` array to identify which specific step and assertion failed.

## Tips

- **Run after deploy**: Always trigger API tests after your application deployment completes, not in parallel.
- **Use dedicated API keys**: Create a separate API key named after the CI platform for easy tracking and revocation.
- **Add timeouts**: Set a curl timeout (e.g., `--max-time 60`) to prevent hanging pipelines.
- **Store scenario IDs in config**: Keep scenario IDs in a config file in your repo rather than hardcoding them in the pipeline.
- **Check run history**: API-triggered runs appear in the Scenario Manager's Run History tab for detailed investigation.

## Related articles

- [How to run scenarios via the Public API](../08-public-api/01-run-scenarios-via-api.md) — Full API reference
- [How to manage API keys for the Public API](../06-settings-and-administration/04-manage-api-keys.md) — Key management
- [How to read test results and assertions](../04-scenario-manager/04-read-test-results.md) — Understanding results
