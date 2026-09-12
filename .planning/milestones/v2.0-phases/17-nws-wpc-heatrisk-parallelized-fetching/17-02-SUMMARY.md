---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 02
subsystem: backend
tags: [node_helper, fetchGeoJsonCached, heatrisk, pure-transforms, injectable-validator]

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching (plan 01)
    provides: PRODUCT_REGISTRY.heatRisk row, buildHeatRiskIdentifyUrl, assertNoSharedRegistryMaps
provides:
  - "fetchGeoJsonCached(url, isValidBody) — injectable body-shape validator, defaulted to _isFeatureCollection"
  - "_isHeatRiskIdentifyResponse(body) — HeatRisk identify-response shape validator"
  - "_zipHeatRiskCatalog(body) — zip-before-sort tuple builder, D-06's abandon-signal guard"
  - "_dedupeHeatRiskByValidTime(tuples) — HEAT-04 idp_validtime dedupe, greatest idp_filedate wins"
  - "_heatRiskDayOffset(idpValidTimeMs, todayUtcMs) — thin _hazardDayOffset delegate"
affects: [17-04, 17-06, 17-07, 17-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Injected validator function with a behavior-preserving default parameter, generalizing a hardcoded shape check without forking the ~170-line function it lives in"
    - "Zip-before-sort tuple construction so a positional-index desync between two parallel arrays is structurally unrepresentable, not merely guarded against"

key-files:
  created: []
  modified: [node_helper.js, scripts/probe-payload-resilience.js]

key-decisions:
  - "rejectBody's diagnostic reason string changed from the FeatureCollection-specific 'not a usable FeatureCollection' to the generic 'not a usable body', per the plan's explicit action text, since the same rejection path now serves two structurally different validators."

requirements-completed: [HEAT-02, HEAT-04]

# Metrics
duration: ~22min
completed: 2026-09-01
---

# Phase 17 Plan 02: fetchGeoJsonCached Generalization & HeatRisk Pure Transforms Summary

**Generalized `fetchGeoJsonCached`'s hardcoded FeatureCollection check into an injectable, defaulted `isValidBody` parameter, added the sibling `_isHeatRiskIdentifyResponse` validator, and added three pure zip/dedupe/day-offset transforms that 17-04's runner will compose — no behavior reaches any user in this plan.**

## Performance

- **Duration:** ~22 min
- **Started:** 2026-09-01T13:31:49Z (phase execution start per STATE.md)
- **Completed:** 2026-09-01T13:53:26Z
- **Tasks:** 2/2 completed
- **Files modified:** 2 (`node_helper.js`, `scripts/probe-payload-resilience.js`)

## Accomplishments

- `fetchGeoJsonCached(url, isValidBody = (body) => this._isFeatureCollection(body))`: both cache-miss validator lines (`:2193`/`:2209` pre-edit) now call the injected `isValidBody`, byte-identical to each other. All 20 existing call sites pass no second argument, confirmed by `grep -c` matching only the definition line.
- `_isHeatRiskIdentifyResponse(body)`: added as a sibling method beside `_isFeatureCollection`, validating `body.value` is a string, `body.properties.Values` and `body.catalogItems.features` are arrays, and rejecting any body carrying an `error` key.
- `_zipHeatRiskCatalog(body)`: builds `{ attrs, rawValue }` tuples from `catalogItems.features`/`properties.Values` before any sort; returns `null` (D-06's abandon signal) on a length mismatch or non-array `Values`. Does not sort.
- `_dedupeHeatRiskByValidTime(tuples)`: collapses tuples sharing `idp_validtime`, keeping the greatest `idp_filedate` (treating missing/non-finite as `-Infinity`); drops non-finite `idp_validtime` tuples via `continue`, never throws. Does not sort.
- `_heatRiskDayOffset(idpValidTimeMs, todayUtcMs)`: delegates to `_hazardDayOffset` verbatim — no restated formula.

## Task Commits

1. **Task 1: Injectable body-shape validator on fetchGeoJsonCached** - `f8e3146` (feat)
2. **Task 2: HeatRisk zip / dedupe / day-offset pure transforms** - `3f2d955` (feat)

**Plan metadata:** pending (this commit, made by the orchestrator after merge)

## Files Created/Modified

- `node_helper.js` — signature change on `fetchGeoJsonCached`, two validator-line edits, new `_isHeatRiskIdentifyResponse`, three new transform helpers (`_zipHeatRiskCatalog`, `_dedupeHeatRiskByValidTime`, `_heatRiskDayOffset`) placed immediately after `_hazardDayOffset`.
- `scripts/probe-payload-resilience.js` — two log-line assertions updated to match the new generic `rejectBody` reason text (Rule 3 fix, see Deviations).

## Probe Suite Pass Counts

- **Before this plan (17-01 baseline):** 67 passed, 0 failed, 0 skipped.
- **After Task 1 (before the Rule 3 fix):** 65 passed, 2 failed, 0 skipped — both failures were log-line assertions expecting the literal old string `"not a usable FeatureCollection"`.
- **After Task 1's Rule 3 fix:** 67 passed, 0 failed, 0 skipped.
- **After Task 2:** 67 passed, 0 failed, 0 skipped — unchanged, as expected for purely-additive pure functions with zero call sites yet.

(The plan's own verification text cites "79/79 at plan time"; per 17-01-SUMMARY's own recorded assumption drift, the live baseline on this branch is 67 scenarios. The hard bar — `0 failed, 0 skipped`, exit 0 — is met at every checkpoint above.)

## `git diff --stat` for `node_helper.js` (both tasks combined, against the 17-01 base commit)

```
node_helper.js | 124 +++++++++++++++++++++++++++++++++++++++++++++++++++++++--
1 file changed, 121 insertions(+), 3 deletions(-)
```

Task 1's diff touches only: the `fetchGeoJsonCached` signature line, the two mirrored `isValidBody(parsed.value)` lines, the new `_isHeatRiskIdentifyResponse` method, and comments. No other branch inside `fetchGeoJsonCached` appears in the diff — confirmed by direct read of `git diff node_helper.js` after Task 1 (the network-error, 304, non-ok-HTTP, `rejectBody`'s own stale-fallback, body-size-bound, and both cache-hit branches are all absent from the diff). `_isFeatureCollection`'s own body (`node_helper.js:1448-1451` pre-edit) is unchanged — no `-` line appears inside it.

Task 2's diff is purely additive: three new methods inserted after `_hazardDayOffset`, nothing else touched.

## Behavior Spot-Proof Results (Task 2 acceptance criterion)

Run via a scratch script in the executor's own scratchpad (not committed), loading the helper through `scripts/probe-lib/module-stubs.js`'s `loadNodeHelper()`:

1. `_zipHeatRiskCatalog` on a body with 7 features and 6 `Values` → `null`. **Result: `null`.** ✓
2. `_zipHeatRiskCatalog` on a matched 7/7 body → 7 tuples in RAW response order, `result[0].attrs.name === "Feature0"` (the FIRST feature, not valid-time-earliest). **Result: length 7, `result[0].attrs.name === "Feature0"`.** ✓
3. `_dedupeHeatRiskByValidTime` on two tuples sharing `idp_validtime` with `idp_filedate` 100 and 200 → length 1, keeps the 200 tuple. **Result: length 1, kept `idp_filedate: 200`.** ✓
4. `_heatRiskDayOffset(Date.UTC(2026,7,31,12,0), Date.UTC(2026,7,31)) === 1` and `_heatRiskDayOffset(Date.UTC(2026,8,6,12,0), Date.UTC(2026,7,31)) === 7`. **Result: `1` and `7`.** ✓

## Mechanical Acceptance Checks

- `grep -c 'fetchGeoJsonCached(.*,' node_helper.js` → 1, matching only the definition line (`isValidBody = ...` default). No existing call site was given a second argument.
- `grep -n 'isValidBody(parsed.value)' node_helper.js` → exactly 2 lines, byte-identical apart from leading whitespace.
- `grep -n '_isFeatureCollection(parsed.value)' node_helper.js` → no matches; both hardcoded sites are gone.
- `grep -n 'Math.round((.*MS_PER_DAY' node_helper.js` → exactly 1 line, inside `_hazardDayOffset`. `_heatRiskDayOffset` delegates and its docblock was worded to avoid literally restating the formula text (see Deviations).
- `grep -c 'Date.now()' node_helper.js` → 10 before this plan, 10 after. No new direct `Date.now()` call site; the three new helpers route through `_todayUtcMs()`/`_nowMs()`.
- `sed -n '/_zipHeatRiskCatalog/,/^  },/p' node_helper.js | grep -c '\.sort('` → 0. Same check for `_dedupeHeatRiskByValidTime` → 0.
- `grep -n 'shorter length' node_helper.js` and `grep -n 'catalogItemVisibilities' node_helper.js` → both return matches inside `_zipHeatRiskCatalog`'s and `_dedupeHeatRiskByValidTime`'s doc comments, naming both rejected alternatives.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Two probe-suite log-line assertions broke on the intentional `rejectBody` reason-string change**
- **Found during:** Task 1's `<verify>` run (`node scripts/probe-payload-resilience.js`)
- **Issue:** The plan's `<action>` explicitly requires changing `rejectBody`'s diagnostic reason from `'not a usable FeatureCollection'` to a generic `'not a usable body'`, since the same rejection path now serves both `_isFeatureCollection` and HeatRisk's future validator. Two existing probe scenarios (`ero-arcgis-error-body`, `ero-rejected-body-serves-last-known-good`) asserted on the literal old string in their `requireLog(...)` checks, so they went RED the moment Task 1's intended text change landed — 65 passed, 2 failed.
- **Fix:** Updated both `requireLog([...])` calls in `scripts/probe-payload-resilience.js` (lines that previously read `"not a usable FeatureCollection"`) to expect `"not a usable body"`, matching the new generic diagnostic text. No behavioral change to what the scenarios test — both still assert that a rejected body is logged with a diagnosable reason naming the URL.
- **Files modified:** `scripts/probe-payload-resilience.js`
- **Verification:** Re-ran `node scripts/probe-payload-resilience.js` — 67 passed, 0 failed, 0 skipped, matching the 17-01 baseline exactly.
- **Committed in:** `f8e3146` (same commit as Task 1's `node_helper.js` change, since the probe fix was required for Task 1's own `<verify>` to pass)

**2. [Rule 1 - Bug] Two doc-comment strings literally matched the mechanical grep patterns their own acceptance criteria check against**
- **Found during:** Task 2's acceptance-criteria verification
- **Issue:** `_heatRiskDayOffset`'s docblock originally restated the literal text `Math.round((epochMs - todayUtcMs) / MS_PER_DAY)` while explaining why the wrapper does NOT restate the formula in code — this satisfied the intent but tripped the mechanical `grep -n 'Math.round((.*MS_PER_DAY' node_helper.js` check (2 lines instead of the required 1). Separately, a doc comment stating the wrapper "never calls `Date.now()` directly" added a new textual match for `grep -c 'Date.now()'`, moving the count from 10 to 11 even though no new code path calls it.
- **Fix:** Reworded both comments to describe the same rationale without literally quoting the grep-target strings (e.g. "restating its day-offset division a second time" instead of the literal formula; "never reads the raw system clock directly" instead of the literal `Date.now()` text).
- **Files modified:** `node_helper.js`
- **Verification:** Re-ran both grep checks — `Math.round((.*MS_PER_DAY` returns exactly 1 line (inside `_hazardDayOffset`); `Date.now()` count is 10 before and 10 after. Re-ran `node --check node_helper.js` and the full probe suite — 67 passed, 0 failed, 0 skipped.
- **Committed in:** `3f2d955` (Task 2's commit; the reword happened before the commit, so no separate fix commit was needed)

## Issues Encountered

None beyond the two deviations above, both resolved before their respective task's commit.

## User Setup Required

None — no external service configuration required. Both tasks are backend-only pure code additions/generalizations with no new dependencies.

## Next Phase Readiness

- `fetchGeoJsonCached(url, isValidBody)` and `_isHeatRiskIdentifyResponse` are live and exercised by the full existing probe suite (every pre-phase caller passes through the defaulted validator path); 17-04's runner can call `fetchGeoJsonCached(identifyUrl, (body) => this._isHeatRiskIdentifyResponse(body))` directly.
- `_zipHeatRiskCatalog`, `_dedupeHeatRiskByValidTime`, `_heatRiskDayOffset` are pure, non-throwing, and spot-proof-verified against the exact shapes 17-04's parse/sort/dedupe/bucket pipeline needs — 17-04 composes them (zip → sort by `idp_validtime` → dedupe → bucket via `_heatRiskDayOffset`) without needing to touch their internals.
- No blockers for 17-04 (the HeatRisk runner) or 17-06/17-07/17-08 (frontend/probe-suite plans consuming this plan's interfaces).
- This plan touches only `node_helper.js` and (via a required deviation) `scripts/probe-payload-resilience.js` — `MMM-SPCOutlook.js` and `productRegistry.js` were not modified, honoring the parallel-execution file-ownership boundary with plan 17-03.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `node_helper.js`
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-02-SUMMARY.md`
- FOUND: commit `f8e3146` (Task 1)
- FOUND: commit `3f2d955` (Task 2)
