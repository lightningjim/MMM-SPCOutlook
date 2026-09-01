---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 06
subsystem: test
tags: [probe-harness, heatrisk, mutation-proof, arcgis-identify, mercator-reprojection]

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 04
    provides: "_runHeatRiskProduct, _isHeatRiskIdentifyResponse, _zipHeatRiskCatalog, _dedupeHeatRiskByValidTime, _heatRiskDayOffset, turfStub.toMercator"
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 05
    provides: "the six-member Promise.allSettled batch heatrisk-* scenarios run through"
provides:
  - "HEATRISK_URL, HEATRISK_NOW_MS, heatRiskCatalogItem, heatRiskIdentifyResponse, heatRiskRoutes, assertHeatRiskBlockIntact — HeatRisk probe fixture/route infrastructure"
  - "Five heatrisk-* scenarios covering HEAT-01, HEAT-02, HEAT-03, HEAT-04 and D-06, each individually mutation-proven"
affects: [17-07, 17-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "HEATRISK_URL derived by calling turfStub.point/turfStub.toMercator directly (the SAME object node_helper.js's own @turf/turf require resolves to under loadNodeHelper()) rather than hand-computing or hardcoding the Mercator projection, guaranteeing byte-identical output to the runner's own reprojection"
    - "heatRiskIdentifyResponse omits properties.Values entirely (not an empty array) when `values` is not supplied, so a fixture can express D-06's 'Values absent' precondition, not just a length mismatch"
    - "Mutation for the day-order scenario removes BOTH the ascending sort AND replaces the idp_validtime-derived day key with the tuple's own array index — removing only the sort has no effect by design, since _runHeatRiskProduct always derives the day key from offset arithmetic, never array position"

key-files:
  created: []
  modified: [scripts/probe-payload-resilience.js]

key-decisions:
  - "heatRiskRoutes() routes HEATRISK_URL plus ERO/WSSI/hazards-layer URLs and the .lyr.geojson catch-all only, per the plan's literal Task 1 action (e) — it deliberately does NOT route spcMD/mpd's KML discovery endpoints. The Task 1 infrastructure self-check ('all six product toggles ON') was run with the four registry rows heatRiskRoutes actually covers (excessiveRain, winterImpact, hazardsOutlook, heatRisk); spcMD/mpd were left toggled off since routing their discovery endpoints is out of scope for this plan's route builder. Recorded as a resolved acceptance-criteria wording tension, matching 17-01/17-04/17-05's established precedent for this exact class of tension."
  - "The day-order scenario's prescribed mutation ('remove the sort... and bucket by array index') was applied as TWO coupled line changes: removing tuples.slice().sort(...) down to a bare tuples.slice(), AND replacing the _heatRiskDayOffset(...) day-key computation with sorted.indexOf(t) + 1. Removing only the sort has no functional effect, since 17-04-SUMMARY already established the day key comes from offset arithmetic, never array position — the plan's mutation description implicitly bundles both changes into one conceptual 'array-order bug', and this is the literal edit that reproduces it."

requirements-completed: [HEAT-01, HEAT-02, HEAT-03, HEAT-04]

# Metrics
duration: ~50min
completed: 2026-09-01
---

# Phase 17 Plan 06: HeatRisk Probe Scenarios (HEAT-01..04, D-06) Summary

**Built the HeatRisk fixture/route infrastructure (HEATRISK_URL derived from the registry's own buildUrl against the same turfStub.toMercator the runner itself uses, heatRiskIdentifyResponse, heatRiskRoutes, assertHeatRiskBlockIntact) and landed five `heatrisk-*` scenarios — the shared-validator generalization, HEAT-01/02's day-order-by-validtime, HEAT-03's Mercator reprojection, HEAT-04's duplicate-idp_validtime dedupe, and D-06's Values/features length-mismatch guard — each individually mutation-proven RED with a diagnosable message and restored green.**

## Performance

- **Duration:** ~50 min
- **Completed:** 2026-09-01
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments

- `HEATRISK_URL`/`HEATRISK_NOW_MS`/`heatRiskValidtimeForDay`/`heatRiskCatalogItem`/`heatRiskIdentifyResponse`/`healthyHeatRiskItems`/`okEmptyHeatRisk`/`heatRiskRoutes`/`assertHeatRiskBlockIntact`: the full HeatRisk probe fixture and route-builder infrastructure, mirroring the existing `hazardsRoutes`/`hazardsFeature`/`assertHazardsBlockIntact` shape.
- `HEATRISK_URL` is derived by calling `PRODUCT_REGISTRY.heatRisk.buildUrl` against `turfStub.point`/`turfStub.toMercator`'s own output — the SAME `turfStub` object `node_helper.js`'s `@turf/turf` require resolves to under `loadNodeHelper()` — so the probe's URL is guaranteed byte-identical to whatever `_runHeatRiskProduct` itself issues, never a hand-copied literal.
- `[HEATRISK_URL, okEmptyHeatRisk]` added to all four pre-existing route builders (`eroHttpRoutes`, `wssiRoutes`, `hazardsRoutes`, `advisoryRoutes`) — WR-02's trap in the reciprocal direction: a sixth product can no longer silently 503 the moment an existing scenario turns on all products.
- Five `heatrisk-*` scenarios added to the flat `scenarios` array:
  1. `heatrisk-identify-body-survives-the-shared-fetch-validator` — pins 17-RESEARCH.md's headline finding that the generalized `isValidBody` parameter on `fetchGeoJsonCached` (17-02) is load-bearing, with a control arm exercising a body missing `catalogItems` entirely.
  2. `heatrisk-day-order-follows-validtime-not-array-order` — pins HEAT-01/HEAT-02 against the live-observed out-of-order catalog (`HeatRisk_2, HeatRisk_4, HeatRisk_5, HeatRisk_7, HeatRisk_1, HeatRisk_3, HeatRisk_6`).
  3. `heatrisk-geometry-uses-mercator-not-raw-degrees` — pins HEAT-03 by decoding the actually-issued identify URL's `geometry` parameter and asserting Mercator-magnitude coordinates under a `wkid:102100` declaration.
  4. `heatrisk-duplicate-validtime-keeps-latest-filedate` — pins HEAT-04's dedupe tiebreak, with both duplicate items' `catalogItemVisibilities` forced to 0 to prove visibility is not the discriminator.
  5. `heatrisk-mismatched-values-length-abandons-poll` — pins D-06's precondition guard: a `Values`/`features` length mismatch abandons the poll (all seven days `null`, `_stale` set), never zips to the shorter length.
- Every scenario carries a precondition guard, a control assertion, and a named mutation; all five guards and all five mutations were exercised live during this plan's execution (verbatim results below).

## Task Commits

1. **Task 1: HeatRisk fixture builder, route builder, and payload-contract assertion** - `bdff267` (feat)
2. **Task 2: HEAT-01/02/03 scenarios plus the shared-validator scenario** - `f3bd951` (test)
3. **Task 3: HEAT-04 dedupe and D-06 precondition-guard scenarios** - `b0a140c` (test)

**Plan metadata:** pending (this commit, made by the orchestrator after merge)

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — added the HeatRisk fixture/route infrastructure (Task 1), `assertHeatRiskBlockIntact`, and five `heatrisk-*` scenarios (Tasks 2-3). No other file touched.

## Decisions Made

See `key-decisions` in frontmatter: (1) `heatRiskRoutes()`'s scope is limited to the four product URL families the plan's Task 1 action literally names, with the "six toggles on" infrastructure self-check resolved against the four routed products rather than all six registry rows; (2) the day-order scenario's mutation combines removing the sort with replacing the offset-based day key with array-index, since removing only the sort has no functional effect on the real implementation.

## Task 1 Acceptance Criteria — Verbatim Results

- `node scripts/probe-payload-resilience.js` pass count unchanged versus the 17-05 baseline: **67 passed, 0 failed, 0 skipped**, both before and after this task (no scenarios added yet).
- `grep -c 'HEATRISK_URL' scripts/probe-payload-resilience.js` → **7** (one declaration plus six usages, covering `heatRiskRoutes`, `eroHttpRoutes`, `wssiRoutes`, `hazardsRoutes`, `advisoryRoutes`, and its own doc comment reference).
- `grep -n 'PRODUCT_REGISTRY.heatRisk.buildUrl' scripts/probe-payload-resilience.js` → one line (the `HEATRISK_URL` declaration) — the URL is derived, not hand-copied.
- Infrastructure self-check (scratch script, via `loadNodeHelper()`), verbatim:
  ```
  Self-check (4 routed toggles ON) _stale: undefined
  OK: no stray staleness across ERO/WSSI/hazardsOutlook/heatRisk toggles
  properties.Values.length: 2
  catalogItems.features.length: 3
  OK: fixture can express a Values/features length mismatch
  ```
  Run with `showExcessiveRain`, `showWinterImpact`, `showHazardsOutlook`, `showHeatRisk` all `true` (the four registry rows `heatRiskRoutes()` covers — see Decisions above for why `spcMD`/`mpd` were left off).
- `heatRiskIdentifyResponse({ items: [a,b,c], values: ["1","2"] })` produces `properties.Values.length === 2` and `catalogItems.features.length === 3`, asserted directly above.

## Task 2 Acceptance Criteria — Verbatim Results

- Full suite green: **70 passed, 0 failed, 0 skipped** (67 baseline + 3).
- **Mutation 1** (`heatrisk-identify-body-survives-the-shared-fetch-validator`) — reverted both `fetchGeoJsonCached` call sites from `isValidBody(parsed.value)` to `this._isFeatureCollection(parsed.value)`:
  ```
  FAIL heatrisk-identify-body-survives-the-shared-fetch-validator: expected at least one day with a numeric category, got {"day1":{"category":null,"text":"","color":""},"day2":{"category":null,"text":"","color":""},"day3":{"category":null,"text":"","color":""},"day4":{"category":null,"text":"","color":""},"day5":{"category":null,"text":"","color":""},"day6":{"category":null,"text":"","color":""},"day7":{"category":null,"text":"","color":""}}
  PROBE RESULT: 68 passed, 2 failed, 0 skipped
  ```
  (`heatrisk-day-order-follows-validtime-not-array-order` also failed under this mutation, as expected — it exercises the same shared fetch path.) Restored; suite returned to 70/0/0; `git diff` on `node_helper.js` showed no residual change.
- **Mutation 2** (`heatrisk-day-order-follows-validtime-not-array-order`) — replaced `tuples.slice().sort((a,b) => a.idpValidtime - b.idpValidtime)` with a bare `tuples.slice()`, and replaced `this._heatRiskDayOffset(t.idpValidtime, todayUtcMs)` with `sorted.indexOf(t) + 1`:
  ```
  FAIL heatrisk-day-order-follows-validtime-not-array-order: day1: expected category 1 (attributed by idp_validtime), got 2 — category is following array order instead of the sort
  PROBE RESULT: 69 passed, 1 failed, 0 skipped
  ```
  Restored; suite returned to 70/0/0.
- **Mutation 3** (`heatrisk-geometry-uses-mercator-not-raw-degrees`) — replaced `const [mercatorX, mercatorY] = projected.geometry.coordinates;` with `const [mercatorX, mercatorY] = loc.coordinates;` (the bare `turfStub.point` shape's own raw lon/lat, no reprojection):
  ```
  FAIL heatrisk-geometry-uses-mercator-not-raw-degrees: expected Mercator-magnitude coordinates (|x|,|y| > 1e6), got x=-77 y=38.9
  PROBE RESULT: 67 passed, 3 failed, 0 skipped
  ```
  (The other two HeatRisk scenarios also failed under this mutation, since it breaks every HeatRisk fetch — expected, as it is the same production code path.) Restored; suite returned to 70/0/0; `git diff --stat` showed only `scripts/probe-payload-resilience.js` modified, zero insertions/deletions in `node_helper.js`.
- **Precondition-guard firing proofs** (scratch script, setup broken via `showHeatRisk: false` or a pre-sorted fixture — never the implementation):
  ```
  Guard 1 (fetch-never-happened) fires when toggle is off: true
  Guard 2 (fixture-pre-sorted) fires on a pre-sorted fixture: true
  Guard 3 (not-exactly-one-identify-call) fires when toggle is off: true count=0
  ```

## Task 3 Acceptance Criteria — Verbatim Results

- Full suite green: **72 passed, 0 failed, 0 skipped** (67 baseline + 5).
- **Mutation 4** (`heatrisk-duplicate-validtime-keeps-latest-filedate`) — flipped `_dedupeHeatRiskByValidTime`'s tiebreak from `filedate > existingFiledate` to `filedate < existingFiledate` (keep the OLDER item):
  ```
  FAIL heatrisk-duplicate-validtime-keeps-latest-filedate: HEAT-04: expected day3 to carry the winning (greatest idp_filedate) category 1, got 4
  PROBE RESULT: 71 passed, 1 failed, 0 skipped
  ```
  Restored; suite returned to 72/0/0.
- **Mutation 5** (`heatrisk-mismatched-values-length-abandons-poll`) — removed the length check from `_zipHeatRiskCatalog`, leaving only the `Array.isArray` guards, so it zips positionally to `features.length` regardless of a shorter `Values` array:
  ```
  FAIL heatrisk-mismatched-values-length-abandons-poll: D-06: expected day1.category null on a length-mismatched body (poll should be abandoned, not truncated), got 1
  PROBE RESULT: 71 passed, 1 failed, 0 skipped
  ```
  Restored; suite returned to 72/0/0; `git status --short` showed only `scripts/probe-payload-resilience.js` modified.
- **Precondition-guard firing proofs** (scratch script):
  ```
  Guard 4 (no-duplicate-in-fixture) fires on a non-duplicated fixture: true
  Guard 5 (values-features-matched) fires on a matched fixture: true
  ```
- **Visibility-independence proof** (scenario 4's fixture re-run with the duplicate pair's `catalogItemVisibilities` flipped from `[0, 0]` to `[1, 0]` — the LOSER tile now marked visible):
  ```
  Visibility-independence: day3.category with visibility flipped to the LOSER tile: 1 expected winner: 1
  Visibility-independence result: PASS (winner unchanged, decided by idp_filedate not visibility)
  ```

## Overall Verification

- `node scripts/probe-payload-resilience.js` → **72 passed, 0 failed, 0 skipped** at final state (67 baseline + 5 added — matches "scenario count rose by the number added" per the project note; the plan's own verification text does not cite a stale absolute total for this plan).
- `bash scripts/check-concurrency-invariant.sh` → exits **0**, all four sites `OK`.
- `git status --short` → only `scripts/probe-payload-resilience.js` shows as modified across all three task commits; `node_helper.js` returned to byte-identical state after every mutation proof (confirmed via `cp`/restore plus `git status --short` showing no diff).

## Deviations from Plan

### Acceptance-Criteria Tensions (not code deviations)

**1. `heatRiskRoutes()` does not route `spcMD`/`mpd` discovery URLs; the Task 1 "all six toggles ON" self-check was run against the four routed products instead**
- **Found during:** Task 1's infrastructure self-check.
- **Issue:** Task 1's acceptance criteria describe running the self-check "with all six product toggles ON," but the plan's own Task 1 action (e) explicitly enumerates only ERO/WSSI/hazards-layer URLs and the `.lyr.geojson` catch-all for `heatRiskRoutes()` — it does not mention `spcMD`/`mpd`'s KML discovery endpoints. Toggling `showSPCMD`/`showMPD` on without also routing their discovery URLs (`ActiveMD.kmz`, the WPC MPD directory listing) would 503 those two products and set `_stale` for a reason unrelated to HeatRisk routing — the exact vacuous-check failure mode the self-check exists to catch, but pointed at the wrong subsystem.
- **Resolution:** Ran the self-check with the four registry rows `heatRiskRoutes()` actually covers (`excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`) toggled on; `spcMD`/`mpd` left off. `heatRiskRoutes()`'s own scope was kept exactly matching the plan's literal Task 1 action text (verified by the `HEATRISK_URL` grep-count and route-builder acceptance criteria, both of which passed as specified). No code change — recorded per 17-01/17-04/17-05's established precedent for this class of tension.

**2. The day-order scenario's mutation description ("remove the sort... and bucket by array index") required two coupled edits, not one**
- **Found during:** Task 2's mutation proof for `heatrisk-day-order-follows-validtime-not-array-order`.
- **Issue:** 17-04-SUMMARY.md already established that `_runHeatRiskProduct`'s `.sort()` call has no effect on correctness by design — the day key comes from `_heatRiskDayOffset(idp_validtime, todayUtcMs)`, never from array position. Removing only the sort (as a literal first reading of the plan's mutation text might suggest) produces zero observable change, since the offset-based day key is order-independent.
- **Resolution:** Applied both parts of the plan's own mutation description together — removed the sort AND replaced the offset-based day key with `sorted.indexOf(t) + 1` — which is the actual "array-order bug" HEAT-02 exists to prevent, and is fully consistent with 17-04-SUMMARY's finding rather than in tension with it. No code change; recorded for clarity.

---

**Total deviations:** 0 code deviations; 2 acceptance-criteria wording/interpretation notes, both resolved by following the plan's most literal instruction and recording the resolution, matching this phase's established precedent (17-01, 17-04, 17-05).
**Impact on plan:** None on scope or correctness — all five scenarios are individually mutation-proven exactly as specified, and no implementation file (`node_helper.js`, `productRegistry.js`) was touched by this plan.

## Issues Encountered

None beyond the two documented tensions above, both resolved without a code change.

## User Setup Required

None — no external service configuration required. This plan is probe-harness-only, exercised entirely through `node scripts/probe-payload-resilience.js` and ad hoc scratch scripts run through `loadNodeHelper()`.

## Next Phase Readiness

- Five `heatrisk-*` scenarios are live, individually mutation-proven, and the probe suite stands at 72/0/0.
- `HEATRISK_URL`, `heatRiskCatalogItem`, `heatRiskIdentifyResponse`, `heatRiskRoutes`, and `assertHeatRiskBlockIntact` are now permanent probe-harness infrastructure that 17-07/17-08 can build on directly for D-04/D-05's NoData and day-gap scenarios and D-07's freshness scenario.
- No blockers identified. Live in-season UAT of HeatRisk against the real ImageServer endpoint remains untested by this plan (structural/mutation-proven verification only, per this project's established quality-notes fallback for seasonal products) — unchanged from 17-04/17-05's disclosed gap.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-06-SUMMARY.md`
- FOUND: commit `bdff267` (Task 1)
- FOUND: commit `f3bd951` (Task 2)
- FOUND: commit `b0a140c` (Task 3)
