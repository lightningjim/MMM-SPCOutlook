---
phase: 19-unified-day-report-getdom-rewrite
reviewed: 2026-09-08T00:00:00Z
depth: standard
iteration: 4
files_reviewed: 5
files_reviewed_list:
  - hazardTaxonomy.js
  - MMM-SPCOutlook.js
  - node_helper.js
  - scripts/probe-lib/module-stubs.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 1
  warning: 2
  info: 6
  total: 9
status: issues_found
---

# Phase 19: Code Review Report (iteration 4)

**Reviewed:** 2026-09-08
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found
**Harness:** `node scripts/probe-payload-resilience.js` → `181 passed, 0 failed, 0 skipped` (re-run and confirmed). No duplicate scenario names.

## Summary

The ten iteration-3 fixes (`5efe2ce..bd28b32`) all landed and **nine of the ten verify sound under direct execution**. Specifically, on the three items flagged for scrutiny:

- **BL-01 (`gridReadable` carve-out) — logic verified correct in BOTH directions.** I traced every way `summary.anyHazard` can be `true` against `_buildGridSummary` (node_helper.js:3698-3767) and confirmed the narrowing reads the summary's own other two terms exactly: `activeDays.length === 0` is definitionally `!anyDayHazard` (the same day scan populates both, :3715-3718), and `bandDiagnostics.advisoryCount` is the same counter that feeds the flag (:3722-3726). The `gridReadable` term is not RED on a healthy poll — `_buildGridDays` (:2614-2627) unconditionally emits all fourteen keys with `hazards: []`, so an empty-but-well-formed grid passes. I also checked the case the carve-out most plausibly over-serves — a *renderable* band entry hidden by `showHazardsOutlook: false` — and confirmed it correctly falls to `"(filtered by settings)"` via the second ladder branch rather than to the confident string. The probe composition (h)/(i)/(j)/(k)/(l) genuinely pins both directions.
- **BL-03 (open-at-the-low-end window) — verified; band and grid cannot disagree at any offset.** `off()` is only ever asked for `offsetEnd` on the `startedInPast` branch, and `renderableWindowEntries` has already dropped `offsetEnd < 0`, so the `Math.max(1, …)` floor is genuinely inert second-line defence rather than a load-bearing clamp; on the non-elapsed branch `offsetStart >= 0` makes the floor inert too. No offset value produces a `D<n>` the grid lacks.
- **WR-07 (observable timer stub) — verified non-vacuous.** `liveTimers` is a real `Map` mutated by both `setInterval` and `clearInterval` in the sandbox, scoped per loaded module; parts (a)–(e) each read a value only the fix can produce, and (e) additionally invokes the retained callback.

**However, the BL-01 fix introduced one new BLOCKER.** `bandIsTheOnlySummaryTerm` dereferences `summary` without the `summaryOk` guard that every other read on this branch carries. When `summary` is absent/null and the raw `windowBand` is non-empty over a readable, empty grid, `getDom()` throws a `TypeError` and the module's entire render is lost — reproduced by direct execution. This is the exact failure class this phase's own CR-03 was raised for, and it directly contradicts the invariant asserted 300 lines above it at `MMM-SPCOutlook.js:1049-1054` ("an absent or malformed summary **can never throw out of getDom()**").

One probe sub-assertion passes for the wrong reason (WR-01 below); its parent scenario still goes RED under the stated mutation, so it is a WARNING rather than a BLOCKER.

The four iteration-3 Info items are all still present and still valid; they are re-reported unchanged at CONVENTION tier, with `IN-04`'s line references refreshed against the rewritten BL-01 block as requested.

---

## Structural Findings (fallow)

No `<structural_findings>` block was supplied for this iteration.

---

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: `bandIsTheOnlySummaryTerm` dereferences an unguarded `summary` and takes the whole render down

**Classification:** BLOCKER
**File:** `MMM-SPCOutlook.js:1353-1356`

**Issue:** The BL-01 fix added three new `summary.*` reads inside the `wrapper.innerHTML === contentMarker` ladder:

```js
const bandIsTheOnlySummaryTerm =
  rawWindowBandCount > 0 && gridReadable &&
  Array.isArray(summary.activeDays) && summary.activeDays.length === 0 &&
  !!summary.bandDiagnostics && summary.bandDiagnostics.advisoryCount === 0;
```

`summary` is `this.spcrisk.summary` (`:1055`) and is explicitly allowed to be absent — that is precisely what `summaryOk` (`:1056`) exists to express, and what the block comment at `:1049-1054` promises is survivable:

> "summary is read defensively everywhere below — an absent or malformed summary **can never throw out of getDom()**"

It is no longer read defensively here. `&&` short-circuits on `rawWindowBandCount > 0` and `gridReadable`, so the crash needs all three of: a non-empty top-level `windowBand`, a readable fourteen-day grid, and nothing rendered. Every one of those is an ordinary state (`showHazardsOutlook` defaults to `false`, so a non-empty band routinely renders nothing).

Reproduced by direct execution against the real `getDom` through the probe harness's own `renderDom`:

```
THREW: TypeError Cannot read properties of undefined (reading 'activeDays')
```

with `spcrisk = { days: <14 well-formed empty days>, advisories: {spcMD:[],mpd:[]}, windowBand: [<one future entry>] }` and default config. The consequence is total: `getDom()` throws past every day block, the advisory band and the window band, and MagicMirror renders nothing at all — the identical blast radius this phase's CR-03 (`DIMENSION_LABELS["toString"].padEnd`) and WR-07 (`advisories.mpd is not iterable`) were both raised for.

Today's backend cannot emit a summary-less non-error payload (the hard-failure path emits `{ error }`, which the `:1059` branch takes first), so this is version-skew / shape-drift reachable rather than remote-triggerable. That is exactly the standard this file applies to itself: CR-03's own note (`:355-359`) states the defect was "that the containment posture was asserted rather than implemented", and `:1049-1054` asserts this posture in so many words.

**Fix:**

```js
const bandIsTheOnlySummaryTerm =
  summaryOk && rawWindowBandCount > 0 && gridReadable &&
  Array.isArray(summary.activeDays) && summary.activeDays.length === 0 &&
  !!summary.bandDiagnostics && summary.bandDiagnostics.advisoryCount === 0;
```

`summaryOk` leading the conjunction is also semantically right, not merely defensive: the carve-out's whole claim is "the summary's *own other two terms* are empty", which is unassertable when there is no summary. With `summaryOk` false, `unconfirmed` is already true at `:1360`, so the corrected expression changes no reachable output — it only removes the throw.

Add a probe scenario alongside `cr02-…` (h)-(l): `unifiedPayload({ windowBand: [futureBandEntry()] })` with `delete payload.summary`, asserting `"No Hazards Forecast (unconfirmed)"` rather than a throw. Mutation to prove RED: drop the `summaryOk &&` term.

---

## Warnings

### WR-01: `wr03-a-malformed-advisory-array-is-never-blamed-on-settings` part (b) passes for the wrong reason

**Classification:** WARNING
**File:** `scripts/probe-payload-resilience.js:12693-12703` (the `honest` fixture)

**Issue:** Part (b) builds `unifiedPayload({ advisories: { spcMD: [null, {}], mpd: [] } })` and asserts `"No Hazards Forecast"`. `unifiedPayload`'s default summary carries `anyHazard: false`, so this payload never reaches the `contentMarker` ladder at all — it is answered by the confident short-circuit at `MMM-SPCOutlook.js:1090` (`summaryOk && summary.anyHazard === false && !_stale && !anyProximityOnlyDay()`) before `enabledAdvisories`, `advisoryEntryDisplayable` or the three-way ladder are consulted. The scenario's own stated mutation ("drop the `.filter(advisoryEntryDisplayable)` from `enabledAdvisories`") cannot turn part (b) red.

I verified this by applying the stated mutation: the scenario fails, but on part **(a)** only. Parts (a) and (c) carry the whole scenario; (b) contributes no signal while reading as though it does.

This matters beyond tidiness: the comment on (b) claims it proves "the same malformed array under an HONEST summary is simply a quiet poll", i.e. an assertion *about the advisory predicate*. It proves only that `anyHazard: false` short-circuits, which a dozen other scenarios already establish.

**Fix:** make (b) reach the ladder, so the advisory predicate is actually the thing under test:

```js
const honest = unifiedPayload({ advisories: { spcMD: [null, {}], mpd: [] } });
// A band entry the render legitimately drops sets anyHazard without adding renderable
// content, so the ladder — not the anyHazard short-circuit — has to answer this one.
honest.windowBand = [elapsedBandEntry()];
honest.summary.anyHazard = true;
honest.summary.bandDiagnostics = { windowBandCount: 1, advisoryCount: 0 };
```

…then keep the existing `!== "No Hazards Forecast"` assertion. Under the stated mutation the unrenderable `[null, {}]` entries become ungated content and (b) flips to `"(filtered by settings)"` — which is the claim its comment already makes.

### WR-02: `also:` competitor rows are indented to the nominal dimension width while winner rows are indented to the actual one

**Classification:** WARNING
**File:** `MMM-SPCOutlook.js:604-618` vs `:651-665`

**Issue:** WR-04 (iteration 2) made the winner/co-winner rows resilient to an unmapped `dimension` whose payload string overruns the field. `dimensionField` is `truncateHazardLabel(...)` (up to 60 chars) `.padEnd(DIMENSION_FIELD_WIDTH)` — so it can be **wider** than `DIMENSION_FIELD_WIDTH` — and the co-winner row correctly pads to `dimensionField.length` (`:618`), with the comment stating exactly why:

> "Padded to the first row's own rendered width rather than to `DIMENSION_FIELD_WIDTH`, so an unmapped dimension whose payload string overruns the field … still columns correctly."

The `also:` rows two blocks below do **not** get that treatment:

```js
const alsoIndent = " ".repeat(2 + DIMENSION_FIELD_WIDTH + 2);
const alsoLabelFieldWidth = DETAIL_LABEL_FIELD_WIDTH - 2 - "also: ".length;
```

Both are derived from the nominal `DIMENSION_FIELD_WIDTH` (13). For a mapped dimension the winner's em dash lands at column 38 and so does the competitor's — correct. For an unmapped 30-character passthrough dimension the winner row's em dash moves to column 55 while its own `also:` rows stay at 38, so the suppressed competitor detaches from the block it belongs to. This is the same class of column-grid break WR-04 named as its reason for existing ("the '…' landed mid-field and destroyed the column grid the whole detail layout exists to maintain"), left unfixed in one of the two row kinds. `dimension: null` unmapped entries are a shipped path (18 D-07) and `truncateHazardLabel`'s presence on `:604` is an explicit acknowledgement that the string is unbounded.

**Fix:** derive both from the group's own rendered width, exactly as `blankDimensionField` already does:

```js
const alsoIndent = " ".repeat(2 + dimensionField.length + 2);
const alsoLabelFieldWidth = DETAIL_LABEL_FIELD_WIDTH - 2 - "also: ".length;
```

(`alsoLabelFieldWidth` is already relative to the label field and needs no change; only the indent is measured against the wrong quantity.) Pin it with a probe: an unmapped `dimension: null`-adjacent group whose winner carries a >13-char dimension string plus one suppressed competitor, asserting both em dashes land on the same column.

---

## Info

### IN-01: the `DIMENSION_ORDER` permutation assertion is vacuous

**Classification:** CONVENTION
**File:** `hazardTaxonomy.js:363-372` (checks a value declared at `:32`)
**Status:** unchanged since iteration 3; `hazardTaxonomy.js` was not touched by the fix pass. Re-reported because it is still valid.

**Issue:** `DIMENSION_ORDER` is `Object.freeze([...DIMENSIONS])`, so the sorted-equality check at load time can never fail.

**Convention violated:** this file's own "assertions fail loudly on a bad edit" discipline (`assertTaxonomyIntegrity`'s stated purpose at `:264-267`) — an assertion that cannot fail is not one.

**Fix (recommend):** delete it, or make it load-bearing by declaring `DIMENSION_ORDER` as its own explicit literal and letting the check enforce the permutation relationship it claims to.

### IN-02: `hasConvectiveDetail` is set by any entry carrying a `detail` object

**Classification:** CONVENTION
**File:** `node_helper.js:3652-3658`

**Issue:** The loop sets `hasConvectiveDetail = true` for `entry.detail && typeof entry.detail === "object"` regardless of `entry.dimension`/`entry.source`. Correct today only because convective is the sole dimension with a `detail` sub-object; the name asserts a check the code does not perform.

**Convention violated:** the codebase's "name the predicate after what it tests" habit (`hasRenderableProximity`, `hazardEntryDisplayable`, `hasTorFamily`).

**Fix (recommend):** `if (entry.dimension === "convective" && entry.detail && typeof entry.detail === "object")`, or rename to `hasDetailSubObject`.

### IN-03: `buildWpcHazardsMap` validates only registry → taxonomy

**Classification:** CONVENTION
**File:** `hazardTaxonomy.js:95-108`

**Issue:** The throw fires when a `displayColor` label has no dimension entry, but nothing detects a `hazardsOutlookDimensionByLabel` entry with no `displayColor` key. Such an entry is dead — the derived key set excludes it — so a label that quietly loses its registry colour silently degrades to the D-07 unmapped path with no signal. Both sets currently match exactly (re-verified this iteration).

**Convention violated:** the file's own "never restate a derived value / catch drift at require() time" rule (`:29-32`, `:91-94`).

**Fix (recommend):** add the reverse loop and throw naming the orphaned label.

### IN-04: `anyUngatedContent()` is evaluated twice on the same branch

**Classification:** CONVENTION
**File:** `MMM-SPCOutlook.js:1358` and `:1363` (line references refreshed — the two call sites now bracket the rewritten BL-01 block at `:1341-1356`)

**Issue:** Called once inside `summaryContradictsRender` (`:1358`) and again in the `else if` (`:1363`). It walks fourteen days, the window band and both advisory arrays each time. Correctness is unaffected (it is pure over an unchanged `this.spcrisk`), but the two calls read as two different questions — and the BL-01 rewrite has now put ~15 lines of new logic between them, which makes the reader's job harder, not easier.

**Convention violated:** this file's "declared once, called from both the render-decision site and the render body (WR-04's rule) so the two can never disagree" pattern, stated at `daySurvivors` (`:950-957`).

**Fix (recommend):** `const ungated = anyUngatedContent();` above the `rawWindowBandCount` declaration and read the local at both sites.

### IN-05: `renderableWindowEntries` type-checks `label` and `offsetEnd` but not `offsetStart`/`offsetEnd` as a pair

**Classification:** CONVENTION
**File:** `MMM-SPCOutlook.js:717-722`, rendered at `:850-857`

**Issue:** The WR-01 fix made a usable `label` structural in the shared band predicate, but the offset terms remain half-checked: the elapsed filter only fires `typeof entry.offsetEnd === "number" && entry.offsetEnd < 0`, so an entry with a non-numeric or absent `offsetEnd` survives and renders `off()`'s `"?"` fallback — `Heavy Snow` at `(D?)`, or `(→D?)` when `offsetStart` is a negative number and `offsetEnd` is not. `anyUngatedContent()` reads the same predicate, so such an entry also counts as content that "settings filtered", steering the operator at a config that filtered nothing (the exact complaint WR-03 raised about the advisory path).

**Convention violated:** this file's own "no segment rather than a bad one" rule, stated at `cigLabel` (`:242-244`) and made structural for the band's `label` in this same predicate one line above.

**Fix (recommend):** add `typeof entry.offsetStart === "number" && typeof entry.offsetEnd === "number" &&` to the shared filter, and demote `off()`'s `"?"` branch to a genuinely unreachable assertion (or delete it) once the predicate owns the guarantee. Backend-unreachable today (`_hazardDayOffset` returns a `Math.round` of a validated input), so this is defence in depth in the same sense WR-01 was.

### IN-06: `100 * detail.torRisk` is rendered unrounded

**Classification:** CONVENTION
**File:** `MMM-SPCOutlook.js:466`, `:475`, `:484`

**Issue:** The probabilistic sub-line concatenates `(100 * detail.torRisk) + "% "` with no rounding. The risk value is `parseFloat` of a remote `LABEL` (`node_helper.js:4162`) reduced by `evaluatePolygons`, so any fraction upstream chooses to publish flows straight into IEEE-754 multiplication: `100 * 0.29` is `28.999999999999996`, which would reach the screen verbatim. SPC's shipped probability ladder (0.02/0.05/0.10/0.15/0.30/0.45/0.60) happens to be free of such values today, so this is latent rather than live — and it is faithful legacy parity (`9143705:MMM-SPCOutlook.js:546-548` did the same).

**Convention violated:** this file's own numeric-rendering discipline — `proximityBadge` formats with `weight.toFixed(1)` rather than raw concatenation for exactly this reason.

**Fix (recommend):** `Math.round(100 * detail.torRisk)` at all three sites (SPC's ladder is integral in percent, so rounding is lossless for every real value). This is a display change, so it belongs on the parity checklist as a deliberate deviation rather than being slipped in silently.

---

_Reviewed: 2026-09-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
