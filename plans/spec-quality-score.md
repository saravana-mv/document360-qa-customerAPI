# Plan: Spec Quality Score

## Context

After importing an OpenAPI spec, FlowForge currently gives QAs no signal about whether the spec is well-documented enough for AI flow generation to produce reliable output. The same per-endpoint MD files power the Documentation tab AND every AI surface (idea generation, flow XML synthesis, debug analysis), so silent gaps in the spec — missing field descriptions, no error responses, no examples — silently degrade AI quality. QAs notice when a generated flow hallucinates field names but don't know which spec deficits caused it.

This feature adds a **client-side, on-the-fly quality score (0–100%) for each spec MD** plus an aggregated roll-up at every folder level. The score appears as a pill in the file tree and as a banner with a collapsible breakdown on the Documentation tab. Every "Enhance Docs example" save (already shipped) refreshes the parsed swagger and the score updates automatically.

**Why this matters:**
- Makes spec quality **actionable**: the breakdown tells QAs exactly which factors are missing on which endpoint, with a "fix hint" pointing at Enhance Docs example or direct MD edit.
- Reinforces the self-improving loop: enhance → score climbs → AI flow generation gets better → fewer post-processor patches needed.
- Surfaces portfolio health: at a glance, a manager can see `v3 = 62%` vs `v3.1 = 91%` and prioritize where to invest QA time.

## User decisions (locked)

| Decision | Choice |
|---|---|
| Granularity | Per-endpoint AND per-folder aggregate |
| Compute & storage | Pure function over already-parsed `_swagger.json`; no persistence, no server changes. *Rationale:* per-browser compute is ms-level, doesn't multiply with team size (each engineer's browser does its own work), and there's no shared cache to invalidate. Server-side caching is deferred to a follow-up if/when the project-tile portfolio view becomes a priority — the same pure function lifts directly into an Azure Function then. |
| Display surfaces | Spec Manager file tree (per-file + per-folder pills) AND Documentation tab banner (with collapsible breakdown) |
| Folder pill scope | **Every** non-system folder, including tag subfolders (e.g., `v3 = 62%`, `v3/articles = 78%`) |
| Breakdown UX | Hover tooltip (native `title`) for one-line summary; click-to-expand panel for full factor list |
| Frontend tests | **Defer**: no vitest infra exists in `src/`; ship with manual QA, add vitest in a follow-up PR if regressions appear |
| Bands | red < 50, amber 50–79, green ≥ 80 |
| Aggregate roll-up | Plain arithmetic mean over endpoints under the folder (no method weighting — keeps math predictable) |

## Scoring algorithm

### Factors (weights sum to 100)

Each factor is one of: `pass` (earned ≥ 0.95), `partial` (0.05 < earned < 0.95), `fail` (earned ≤ 0.05), or `skipped` (not applicable to this endpoint). Skipped factors are excluded from the denominator.

| Group | ID | Label | Weight | Applies when | Earns |
|---|---|---|---:|---|---|
| Operation | `op.summary` | Summary present | 4 | always | non-blank, ≥10 chars |
| | `op.description` | Operation description | 8 | always | trimmed length ≥30; rejects "OK"/"TODO"/"-" via deny-set |
| | `op.operationId` | OperationId set | 2 | always | non-blank |
| | `op.tags` | Tag assigned | 1 | always | `tags[0] !== "Other"` (parser default for untagged) |
| Parameters | `params.descriptions` | Parameters described | 7 | `parameters.length > 0` | fraction = (params with description ≥10 chars) / total |
| | `params.examples` | Parameters typed/examplified | 6 | `parameters.length > 0` | fraction = (params with `example` OR `schema.format` OR `schema.enum`) / total |
| | `params.pathConsistency` | Path placeholders declared | 2 | path contains `{…}` | every `{x}` in path matches a declared `in:"path"` param marked `required:true` |
| Request body | `body.schema` | Body schema present | 4 | `requestBody` exists | `requestBody.schema` defined |
| | `body.example` | Body example present | 8 | `requestBody` exists | singular `example` truthy OR `examples` map non-empty |
| | `body.description` | Body description | 3 | `requestBody` exists | `requestBody.description` ≥10 chars OR top-level schema description ≥10 |
| | `body.requiredFields` | Required fields documented | 5 | `requestBody.schema.properties` exists | (every name in `schema.required[]` exists in `properties`) AND (described/total of those required fields) |
| Responses | `responses.success` | 2xx documented | 12 | always | needs (status `^2`) AND (description ≥10, not in deny-set) AND (schema OR example). 0 / 0.33 / 0.66 / 1.0 by partial credit |
| | `responses.error` | Error response declared | 8 | always | at least one 4xx OR 5xx with description ≥10 chars |
| | `responses.descriptions` | Every response described | 8 | `responses.length > 0` | fraction = (responses with meaningful description) / total |
| | `responses.examples` | Every response has an example | 7 | `responses.length > 0` | fraction = (response with explicit example: 1.0; with schema only: 0.5; with neither: 0) / total |
| Schema depth | `schema.fieldDescriptions` | Schema field descriptions | 6 | any schema present | recursive (depth ≤ 5): fraction = (props with description) / (total props traversed) |
| | `schema.enums` | Enums enumerated | 2 | any string field with enum-shaped name (e.g. `status`, `type`, `kind`) | enum array present |
| | `schema.requiredAccuracy` | `required` array declared | 2 | object schema with ≥3 properties | `required` array exists (empty array allowed; missing → fail) |
| Security | `security.declared` | Security declared | 5 | always | `security` array exists (including explicit `[]` for "no auth") |
| **Total** | | | **100** | | |

### Normalization

```
applicableWeight = sum(weight)         where factor.applicable
earnedWeight     = sum(weight*earned)  where factor.applicable
score            = round(earnedWeight / applicableWeight * 100)
```

A GET with no body skips the four `body.*` factors (4+8+3+5 = 20 pts); the remaining 80 pts renormalize to 100. Score is always 0–100 — no method bias.

### `isMeaningful(text, minLen=10)` helper

- Trim, lowercase, then reject if length < minLen OR text is in deny-set: `["", "ok", "error", "success", "todo", "tbd", "-", "n/a"]`.
- Used by every description factor.

### Aggregate roll-up

For a folder path:
```
folderScore = round(mean(score) for every endpoint under folder, recursively)
endpointCount = count of those endpoints
```
`_system/` and `_distilled/` paths are naturally excluded — `buildEndpointFileMap` only contains operation MDs.

## File-by-file changes

### Files to create

| Path | Purpose |
|---|---|
| `src/lib/spec/specQuality.ts` | Pure scoring logic. Public API: `computeEndpointScore(endpoint)`, `computeSpecQuality(spec, versionFolder)`, `bandFor(score)`. Exports types: `EndpointScore`, `FolderScore`, `FactorResult`, `FactorStatus`. |
| `src/components/common/QualityScorePill.tsx` | Reusable colored percentage pill. Props: `score: number`, `endpointCount?: number` (folders show count in tooltip), `size?: 'xs' \| 'sm'`. Uses CLAUDE.md hex tokens directly. Native `title` for hover summary. |
| `src/components/specfiles/QualityScoreBanner.tsx` | EndpointDocView banner. Props: `score: EndpointScore`. Header row: pill + band label + chevron toggle. Expanded body: factor cards grouped by status (passing / partial / failing / skipped), each row shows label, weight earned, detail string, and optional `fixHint`. |

### Files to modify

| Path | Change |
|---|---|
| `src/pages/SpecFilesPage.tsx` (~line 200, 967, 1124) | (a) Import `computeSpecQuality`. (b) `useMemo` after the swagger-load effect: `const qualityScores = useMemo(() => parsedSpec && versionFolder ? computeSpecQuality(parsedSpec, versionFolder) : undefined, [parsedSpec, versionFolder])`. (c) Pass `qualityScores={qualityScores}` to `<FileTree/>`. (d) Pass `qualityScore={selectedPath ? qualityScores?.perEndpoint.get(selectedPath) : undefined}` to `<EndpointDocView/>`. |
| `src/components/specfiles/FileTree.tsx` (lines 317, 472–478, 543–544, 721, 756, 990) | Thread `qualityScores?` prop through `FileTreeProps`, `NodeProps`, recursive `TreeNodeRow` calls, and `sharedProps`. Render `<QualityScorePill/>` inside the `flex-1` name span (after the truncated name, before action menu) only when `!node.isSystem` and a score is available for that path (perEndpoint for files, perFolder for folders). |
| `src/components/apidocs/EndpointDocView.tsx` (Props at line 12, render at ~line 106) | Add `qualityScore?: EndpointScore` to `Props`. Render `<QualityScoreBanner score={qualityScore}/>` between the method/path box and the `endpoint.description` block. |

### Reused existing code (no rebuilding)

| Component / helper | Where | Used for |
|---|---|---|
| `parseSwaggerSpec`, `buildEndpointFileMap`, `ParsedEndpointDoc`, `ParsedSpec` | `src/lib/spec/swaggerParser.ts:7-49, 411-425` | Source of all data the scorer reads. `buildEndpointFileMap` returns keys without the version prefix; we re-prefix with `versionFolder` to match file-tree paths. |
| `Schema` type | `src/types/spec.types.ts:58-83` | Already has `description`, `enum`, `format`, `required`, `properties`, `items`, `oneOf/anyOf/allOf` — everything needed for schema-depth scoring. |
| Color tokens (green `#1a7f37`/`#dafbe1`/`#aceebb`, amber `#9a6700`/`#fff8c5`/`#f5e0a0`, red `#d1242f`/`#ffebe9`/`#ffcecb`) | CLAUDE.md design language | Used directly in `QualityScorePill` and `QualityScoreBanner`. |
| `swaggerReloadKey` cache-bust | `src/pages/SpecFilesPage.tsx:203, 226, 1323` | Already triggers parsed-spec refresh after Enhance Docs example save. Score recomputes via `useMemo([parsedSpec])` — no new wiring needed. |
| `_system` / `_distilled` `isSystem` flag | `src/components/specfiles/FileTree.tsx:80-95` | Already gates system files from context-menu and styling. We reuse the same flag to suppress score pills. |

## UI mockups

### File tree row
```
   📄  POST  create-article.md                          [78%]   ⋯
   📄  GET   get-article.md                             [92%]   ⋯
   📄  POST  create-article-bulk-publish.md             [34%]   ⋯
   📁  articles                                         [68% (12)]
   📁  v3                                               [71% (47)]
   📁  _system                          🔒                          (no pill)
```
Pill colors: green ≥80, amber 50–79, red <50. Folder tooltips include endpoint count: `"Average quality across 12 endpoints"`.

### Documentation tab banner (collapsed)
```
┌───────────────────────────────────────────────────────────────────┐
│ Spec Quality:  [78%]  Good                  [▶ Show breakdown]    │
│ This score predicts how well AI can generate flows for this       │
│ endpoint. Click to see what's missing.                            │
└───────────────────────────────────────────────────────────────────┘
```

### Banner (expanded)
```
┌───────────────────────────────────────────────────────────────────┐
│ Spec Quality:  [78%]  Good                  [▼ Hide breakdown]    │
│                                                                   │
│   PASSING (12)                                                    │
│   ✓ Summary present                                       4 / 4   │
│   ✓ Operation description                                 8 / 8   │
│   ✓ Tag assigned                                          1 / 1   │
│   …                                                               │
│                                                                   │
│   PARTIAL (2)                                                     │
│   ◐ Parameters described    3 of 5 parameters have desc  4.2 / 7  │
│     Hint: Add description to remaining 2 query parameters.        │
│                                                                   │
│   FAILING (3)                                                     │
│   ✗ Body example present    requestBody has no example   0 / 8    │
│     Hint: Click 'Enhance Docs example' after a Try-it call.       │
│   ✗ Response 422 description "Error" is too generic      0 / 1.6  │
│                                                                   │
│   SKIPPED (1)                                                     │
│   – Schema enums                  no enum-shaped fields           │
└───────────────────────────────────────────────────────────────────┘
```

## Edge cases (handling)

| Case | Behavior |
|---|---|
| Spec with zero endpoints | `qualityScores` is empty maps; no pills, no banner |
| GET with no params and no body | Skips `body.*` and `params.*` factor groups; renormalizes over remaining ~65 weight |
| Description = `"OK"` / `"TODO"` / 5 chars | `isMeaningful` rejects (length or deny-set) |
| Schema with circular `$ref` | Parser already inlines with circular marker; recursion capped at depth 5 |
| Deprecated endpoint | Score normally; banner shows a small "Note: deprecated" subtitle but no penalty |
| `versionFolder` undefined (no version selected) | `qualityScores` is `undefined`; FileTree renders no pills; once user selects, pills appear |
| Operation with no tags (parser → `["Other"]`) | `op.tags` factor fails (intentional — encourages tagging) |
| `security: []` (explicit no-auth) | Counts as pass for `security.declared` (per OAS spec, `[]` is intentional) |

## Implementation order (3 incremental PRs)

**PR 1 — Pure scoring logic (no UI)**
1. Create `src/lib/spec/specQuality.ts` with all factor helpers + `computeEndpointScore` + `computeSpecQuality` + `bandFor` + types.
2. Temporarily `console.log` scores from `SpecFilesPage` `useMemo` against a real Document360 v3 spec; eyeball results for 2–3 endpoints and tune weights/`isMeaningful` thresholds if needed.
3. Remove the `console.log` before commit.

**PR 2 — File tree pills**
4. Create `src/components/common/QualityScorePill.tsx`.
5. Modify `FileTree.tsx` (props through, render pill in row).
6. Modify `SpecFilesPage.tsx` (`useMemo`, pass prop).

**PR 3 — Endpoint banner + breakdown**
7. Create `src/components/specfiles/QualityScoreBanner.tsx`.
8. Modify `EndpointDocView.tsx` (add prop, render banner).
9. Modify `SpecFilesPage.tsx` (pass score to `EndpointDocView`).

Each PR is independently mergeable and visually verifiable.

## Verification

**Manual QA checklist:**

1. Import a freshly-pulled Document360 v3 swagger.
2. Confirm pills appear on every `.md` file in `v3/articles/`, `v3/categories/`, etc.
3. Confirm `_system/` and `_distilled/` folders/files have NO pills.
4. Confirm `v3/` folder pill shows aggregate (e.g., "62%") with `endpointCount` tooltip.
5. Confirm tag subfolders (`v3/articles/`) also show their own aggregate pill.
6. Open one well-documented endpoint → banner shows green/amber score.
7. Open one poorly-documented endpoint → banner red.
8. Click "Show breakdown" → verify factor rows render in 4 sections (passing / partial / failing / skipped) with weights and details.
9. Hover a file-tree pill → native title shows summary.
10. Run "Enhance Docs example" on a Try-it call for a low-scoring endpoint, save → confirm pill in tree updates immediately, and the open endpoint's banner score increases by the expected delta.
11. Confirm `v3` folder aggregate updates after that save (one endpoint changes by +X / endpointCount → folder mean changes by ~X/N).
12. Run `npx tsc -b` — clean.
13. Confirm no `text-[10px]/[11px]/[12px]/[13px]` introduced (CLAUDE.md font rule).
14. Confirm only approved hex tokens used (`#1a7f37`, `#9a6700`, `#d1242f` and matching bg/border tokens).

**Sanity numbers** (loose expectations to verify on real Document360 v3 spec):
- Articles folder: 60–80% (good descriptions, often missing examples)
- Bulk endpoints: lower (often missing examples and detailed descriptions)
- Average across the version after a few Enhance Docs runs: should climb 5–15 points each save

## Risks & open follow-ups

1. **Weight tuning is a first guess.** The proposed weights are educated estimates. After PR 1 lands and we eyeball scores against real Document360 specs, expect 1–2 small adjustments (e.g., `body.example` may deserve more weight than `body.schema` if missing examples turn out to dominate AI hallucinations).
2. **`isMeaningful` deny-list is heuristic.** Currently `["", "ok", "error", "success", "todo", "tbd", "-", "n/a"]`. If Document360 uses common stock phrases that are technically meaningful (e.g., "Returns the requested resource"), they'll pass — fine. If we discover false-pass phrases ("the response", "it returns"), expand the deny-list.
3. **Pill density in narrow tree panel.** Tree width is user-resizable, default 280px. With pills on every folder + every file, long names plus method tag plus pill could overflow. Mitigation: `shrink-0` on pill, `truncate` on filename clips first. Verify visually in QA — easy to tune by hiding pills below a certain tree width if needed.
4. **Folder pill flicker on expand/collapse**: pills are derived from `parsedSpec` not from expanded state, so they don't flicker. Confirmed by design.
5. **Tests deferred.** No vitest infra in `src/` today; ship with manual QA. If algorithm regressions appear (likely after weight tuning iterations), add vitest in a follow-up PR with synthetic ParsedSpec fixtures (empty spec, all-100 spec, GET-only spec, missing-everything spec).
6. **Score on the project tile**: out of scope for this PR. The tile data comes from `ProjectDoc` which has no quality field today. Adding a project-level aggregate would require either: (a) computing on the Project Selection page by fetching every project's `_swagger.json` (slow at scale), or (b) caching server-side. Defer to a follow-up if the user wants portfolio-level visibility.
