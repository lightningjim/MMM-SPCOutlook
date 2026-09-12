---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
plan: 03
subsystem: backend
tags: [node_helper, arcgis, hazards-outlook, caching, freshness, wpc, cpc]

# Dependency graph
requires:
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-01)
    provides: PRODUCT_REGISTRY.hazardsOutlook row (six layers, D-09/D-10 label sets, D-02 order, palette, maxDataAgeHours)
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-02)
    provides: "_nowMs/_todayUtcMs/_hazardDayOffset/_utcDateString/_isFullNominalWindow/_bucketHazardMatch date-bucketing primitives; evaluatePolygonsCollectAll collect-all evaluator"
provides:
  - "_hazardMatchesFromHits(hits) — pure normalizer to the clock-independent four-field match shape"
  - "_cacheHazardMatches(url, fetchResult, matches) — the sole hazards cache-write site, whitelisted by field name"
  - "_runArcGisHazardWindowProduct(row, loc, productToggles) — per-poll fetch/filter/cache/re-bucket/assemble runner"
  - "getSpcOutlook's hazardsOutlook payload key (day3..day14 + windowBand), always present regardless of the toggle"
  - "SUB_TOGGLES-threaded showDrought sub-toggle on _productToggles"
affects: [16-04, 16-05, 16-06, 16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clock-independent cache contract: cache only { label, startDate, endDate, idpFiledate } by explicit field whitelist (never spread), with a defensive throw on any day-keyed or offset field, so a day-resolved value can never be cached and replayed against a later clock"
    - "Signature-level clock isolation: the runner computes its own todayUtcMs internally and accepts no clock parameter, so a caller cannot hand it a stale value"
    - "Re-bucket every poll, cache hit or miss, strictly outside the cache-write branch — the bucketing step re-derives day/window placement fresh each time against the current poll's clock"
    - "Sub-toggles (showDrought) threaded through _productToggles via a SUB_TOGGLES list, distinct from registry-derived configFlags, because they gate display within an already-fetched product rather than gating a fetch"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "None - plan executed exactly as written"

patterns-established:
  - "arcgis-hazard-window runner shape: { payload, anyStale } matching every other product runner in this file, dispatched by direct named call (not a kind-loop) because the row is singular"

requirements-completed: [HAZ-01, HAZ-02, HAZ-03, HAZ-04, DATA-02]

# Metrics
duration: ~25min
completed: 2026-08-26
---

# Phase 16 Plan 03: Hazards Outlook Runner Summary

**Added `_runArcGisHazardWindowProduct` to `node_helper.js` — the Hazards Outlook's fetch/filter/cache/re-bucket runner, with a structurally clock-independent cache contract (whitelisted match fields, no day key or offset ever writable) that eliminates the phase's #1 risk: a cache hit silently replaying yesterday's day assignment.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-26
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments
- The cache write for this product can never contain a day key or day offset: `_cacheHazardMatches` copies exactly four whitelisted fields per match and throws immediately if a smuggled `day\d+`/`offsetStart`/`offsetEnd`/`dayOffset` key is ever present, converting a future refactor mistake from a silent misdating bug into a loud failure
- `_runArcGisHazardWindowProduct`'s three-parameter signature (no `todayUtcMs`) makes a clock-dependent input structurally unpassable — the runner computes `_todayUtcMs()` once, internally, at the top of every poll
- Re-bucketing (`_bucketHazardMatch`) runs on every poll, on both the cache-hit and cache-miss paths, always against the current poll's own clock — proven end-to-end by the Task 2 fixture and the plan's source-level check that the bucketing call sits lexically outside the `fetchResult.data !== null` branch
- D-09 (Flooding hard exclusion) and D-10 (Drought gated by `showDrought`, strict `=== true`) are enforced in a request-scoped `includesFeat` closure built at call time, never on the static registry row
- Per-layer freshness (D-13/D-14/D-15): a layer's own `idp_filedate` older than 84h sets `anyStale` without ever calling `_noteStaleEntry`, verified both by the fixture and by a source-level grep gate that strips comments before searching
- The full `hazardsOutlook` payload block (`day3`..`day14` + `windowBand`, 13 keys) is always present regardless of the `showHazardsOutlook` toggle (Phase 14 D-05), verified by the toggle-off branch of the Task 2 fixture
- `showDrought` now threads through `_productToggles` via a new `SUB_TOGGLES` list, defaulting to `false` and requiring a strict `true`
- Probe suite stayed 48/48 passing throughout; no existing scenario needed a hazards route because none of them enable `showHazardsOutlook`, so the new six-layer fetch loop is dormant in all of them (see "Probe Suite Impact" below — input for 16-06)

## Task Commits

Each task was committed atomically:

1. **Task 1: Clock-independent cache contract — `_hazardMatchesFromHits` and `_cacheHazardMatches`** - `892b4d7` (feat)
2. **Task 2: `_runArcGisHazardWindowProduct` — fetch, filter, freshness, re-bucket, assemble** - `52d7f6c` (feat)
3. **Task 3: Dispatch the row, thread `showDrought`, emit the `hazardsOutlook` payload key** - `f5936f6` (feat)

## Files Created/Modified
- `node_helper.js` — added `SUB_TOGGLES` constant and threaded it through `_productToggles`; added `_hazardMatchesFromHits`, `_cacheHazardMatches`, and `_runArcGisHazardWindowProduct` after `_runArcGisDayProduct`; added the `hazardsResult` dispatch call and `hazardsOutlook: hazardsPayload` key inside `getSpcOutlook`, plus a JSDoc entry documenting the new payload shape. 326 lines added, 0 removed, across the whole plan.

## Decisions Made
None - followed plan as specified. Every structural choice (whitelist-not-spread, no-clock-parameter signature, re-bucket-outside-the-cache-branch, sub-toggle list) was specified explicitly in the plan's `<action>` text and implemented as written.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Single-lined the hazards dispatch call to satisfy the plan's own literal grep**
- **Found during:** Task 3, second automated verify command
- **Issue:** The plan's `<action>` text for Task 3 gives the dispatch call as one logical statement (`const hazardsResult = await this._runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook, loc, productToggles);`) but the codebase's own style wraps long calls like this across three lines (see the adjacent `eroResult`/`wssiResult` calls). Written that way, the plan's own acceptance-criteria grep — `grep -q "_runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook"` — failed, because the matched substring was split across two lines.
- **Fix:** Kept the dispatch call on one line, matching the plan's literal `<action>` text and its own grep. The explanatory comment above it (dispatch rationale, D-15 asymmetry note) is unaffected and still precedes the call.
- **Files modified:** `node_helper.js`
- **Verification:** `grep -q "_runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook" node_helper.js` passes; full probe suite still 48/48.
- **Committed in:** `f5936f6` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — formatting-only, to satisfy the plan's own literal verification command)
**Impact on plan:** No scope creep, no behavior change. Purely a line-wrapping choice to match an exact-substring grep the plan itself specifies.

## Issues Encountered
None.

## Probe Suite Impact (input for 16-06)

The full probe suite (`node scripts/probe-payload-resilience.js`) was run after every task and reports **48 passed, 0 failed, 0 skipped** both before and after every edit in this plan — no regression in any existing scenario.

**No existing scenario's route table needs a hazards entry.** Investigated directly: `getSpcOutlook` now calls `_runArcGisHazardWindowProduct`, which only enters its six-layer fetch loop when `productToggles.showHazardsOutlook` is truthy. `_productToggles` defaults every registry-derived flag (including `showHazardsOutlook`) to `false` unless the caller's `products` object explicitly sets it `=== true`. Every scenario in `scripts/probe-payload-resilience.js` was inspected via `grep -n "showHazardsOutlook" scripts/probe-payload-resilience.js` — zero matches. Therefore the six new hazards fetches are dormant in all 48 existing scenarios; `installFetch`'s unrouted-URL default (`{ data: null, cachedResult: null, stale: false, failed: true }`) is never reached by any hazards URL in the current suite, and no scenario's `_stale`/`anyStale` assertion is at risk.

**This is 16-06's job, not deferred debt:** any new scenario in 16-06 that sets `showHazardsOutlook: true` (or exercises `getSpcOutlook` with the default `productToggles` object, once a scenario turns the flag on) will need its route table (`installFetch`/`installHttp` calls) extended with entries for the six hazards layer URLs (`row.buildUrl(layer.id)` for `layer.id` in `[1, 3, 4, 6, 7, 8]` against `HAZARDS_BASE_URL`), or those scenarios will observe the hard-failure default and `anyStale === true` for every hazards-enabled run.

## Known Stubs

None. `_hazardMatchesFromHits`, `_cacheHazardMatches`, and `_runArcGisHazardWindowProduct` are fully implemented and exercised end-to-end by this plan's own fixtures (fresh fetch, `showDrought` opt-in, toggle-off). Frontend rendering of the new `hazardsOutlook` payload key is explicitly out of scope for this plan (16-04/16-05), and the payload itself is complete and non-empty-shaped in every toggle state, so nothing here is a placeholder.

## Threat Flags

None new beyond the plan's own `<threat_model>` register (T-16-09 through T-16-14, T-16-SC), all of which this plan implements as specified: URL construction stays exclusively through `row.buildUrl`, D-09/D-10 filtering is unconditional/strict as required, the unmapped-label log is bounded and once-per-process, and no npm/pip/cargo package was installed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getSpcOutlook`'s payload now always carries a complete `hazardsOutlook` block (`day3`..`day14` + `windowBand`), ready for 16-04/16-05's frontend rendering work.
- 16-06/16-07 (probe scenarios) can build directly on `_runArcGisHazardWindowProduct`'s `{ payload, anyStale }` contract and the documented route-table gap above — no hazards route entries exist in the harness yet because no existing scenario turns the toggle on.
- No blockers. The cache contract, the freshness write site, and the D-16 no-suppression rule are all structurally enforced (whitelist + assertion, no-clock-parameter signature, unconditional block assembly) rather than resting on comments alone.

---
*Phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook*
*Completed: 2026-08-26*
