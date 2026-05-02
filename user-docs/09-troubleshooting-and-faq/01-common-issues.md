# Common issues and solutions

This guide covers the most frequently encountered issues in FlowForge and how to resolve them.

## Connection and authentication issues

### "OAuth sign-in required" or health check fails

**Cause:** The connection's credentials are missing, expired, or incorrect.

**Solution:**
1. Go to **Settings** > **Connections**
2. Check the status indicator on the affected connection
3. For OAuth: Verify Client ID, Client Secret, and Token URL
4. For Bearer/API Key: Re-enter the credential value
5. Save and retry

### 401 Unauthorized during test runs

**Cause:** The API rejected the authentication credentials.

**Solution:**
- Check that the connection is configured correctly in Settings > Connections
- For OAuth connections, verify scopes include the permissions needed for the endpoints being tested
- For Bearer tokens, ensure the token hasn't expired
- Check the connection dropdown in the Scenario Manager — make sure the correct connection is selected for the version

### Run buttons are disabled

**Cause:** One of several pre-run validations is failing.

**Checks to perform:**
1. **Connection health**: A red error banner indicates connection issues — click the "Settings > Connections" link to fix
2. **Missing project variables**: A red banner lists `{{proj.*}}` variables referenced in flows but not defined — go to Settings > Variables
3. **Empty project variables**: Variables exist but have empty values — fill them in at Settings > Variables

## Spec and import issues

### OpenAPI import shows 0 endpoints

**Cause:** The spec file format isn't recognized or the paths section is empty.

**Solution:**
- Verify the URL returns valid JSON or YAML
- Check that the spec has a `paths` section with at least one endpoint
- FlowForge supports OpenAPI 3.x and Swagger 2.x formats
- If behind a CDN (like Cloudflare), the URL may need special headers — try downloading the file and uploading manually

### "Spec sync failed" when reimporting

**Cause:** The source URL is unreachable or returns a different format.

**Solution:**
1. Test the URL directly in a browser to confirm it's accessible
2. Check if the API requires authentication to access the spec URL
3. If the URL changed, delete the old source and import from the new URL

## Flow and scenario issues

### Flow validation fails (red error badge)

**Cause:** The flow XML doesn't match the expected schema.

**Common fixes:**
- Check for `<assertion>` vs `<assert>` — must be `<assertion>`
- Ensure `<steps>` wrapper exists around all `<step>` elements
- Verify `<status code="200"/>` (not `value="200"`)
- Check that `<field>` assertions have both `path` and `value` attributes
- Ensure all `{{...}}` variable references use double curly braces

### "Scenario not found" when running via API

**Cause:** The scenario ID is incorrect or the scenario has been deactivated.

**Solution:**
1. In the Scenario Manager, verify the scenario exists and is active
2. Right-click the scenario and copy the scenario ID
3. Check that the API key's project matches the scenario's project

### Steps fail with "missing variable" error

**Cause:** A `{{proj.variableName}}` reference in the flow XML doesn't have a matching project variable.

**Solution:**
1. Read the error message — it shows the variable name and may suggest a similar one
2. Go to **Settings** > **Variables**
3. Add the missing variable or fix the typo in the flow XML

## AI feature issues

### AI features are disabled

**Cause:** AI credits are exhausted for the project or your user account.

**Solution:**
- Check the credit pill in the TopBar — if red, credits are exhausted
- Ask a Super Owner to increase the project or user AI credit budget
- Go to **Settings** > **AI Credits** to see current usage

### AI generates incorrect flows

**Cause:** Missing or incomplete context.

**Solutions:**
- **Add API rules**: Go to Spec Manager > version folder > API Rules and add specific rules about your API's behavior (enum values, required fields, conventions)
- **Use focused scopes**: Generate ideas for a single resource folder rather than the entire version
- **Try a different model**: Switch to Opus for complex APIs (Settings > General > AI Model)
- **Use the chat**: Refine flows through the Flow Designer chat rather than regenerating

### "Credits exhausted" banner

**Cause:** The project or user AI budget has been fully consumed.

**Solution:**
- Contact a Super Owner (their email is shown in the banner)
- Super Owners can increase budgets at Settings > AI Credits

## Performance issues

### Test runs are slow

**Cause:** Network latency, rate limiting, or step delays.

**Solutions:**
- Check **Settings** > **General** > **Test Run Settings** — reduce delay between steps if set
- If the API has rate limits, increase the delay between scenarios
- Run fewer scenarios at once

### UI feels sluggish with many scenarios

**Cause:** Large scenario trees can slow rendering.

**Solution:**
- Collapse version folders you're not actively working with
- Use the search/filter features in the Scenario Manager

## Tips

- **Check the audit log**: If something changed unexpectedly, the audit log (Settings > Audit Log) shows who did what.
- **Use AI diagnosis**: For failed steps, the Diagnose tab in the Scenario Manager can analyze failures and suggest fixes.
- **Read error messages carefully**: FlowForge error messages include specific details about what went wrong and often suggest a fix.

## Related articles

- [Understanding error messages](../09-troubleshooting-and-faq/02-error-messages.md) — Error reference
- [Frequently asked questions](../09-troubleshooting-and-faq/03-faq.md) — Quick answers
- [How to use AI diagnosis for failed steps](../04-scenario-manager/06-ai-diagnosis.md) — Automated troubleshooting
