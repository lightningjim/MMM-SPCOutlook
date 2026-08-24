---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 03
subsystem: api+frontend
tags: [wssi, arcgis-day-layers, refactor, node_helper, MMM-SPCOutlook]

# Dependency graph
requires:
  - phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
    plan: 01
    provides: PRODUCT_REGISTRY.winterImpact row (kind arcgis-day-layers, MINOR-floor includesFeat, case-folding toValue)
  - phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
    plan: 02
    provides: probe harness real KML/ZIP deps and 16-scenario baseline used as the regression net
provides:
  - "_runArcGisDayProduct(row, loc, comparator, productToggles) shared fetch/cache/evaluate runner in node_helper.js"
  - "winterImpact block in getSpcOutlook's return payload, always present regardless of toggle (D-05)"
  - "showWinterImpact frontend toggle: defaults, buildRequestPayload, WSSI render rows, no-risk gate extension"
affects: [15-04, 15-05, 15-06, 16, 17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "arcgis-day-layers products share one fetch/cache/evaluate runner keyed by registry row, not duplicated per product (D-02)"
    - "runner returns { payload, anyStale } rather than mutating caller state, keeping it pure w.r.t. helper-global fields"

key-files:
  created: []
  modified:
    - node_helper.js
    - MMM-SPCOutlook.js

key-decisions:
  - "_runArcGisDayProduct signature is (row, loc, comparator, productToggles) per the plan's fourth-parameter instruction, reading the toggle from the passed snapshot rather than this._products (WR-13 discipline)"
  - "WSSI render gate uses only \"!= NONE\", relying on productRegistry.js's includesFeat (val >= 2) to keep WINTER WEATHER AREA out of the payload entirely rather than adding a second WWA check in the frontend"

patterns-established:
  - "A registry row's fetch/cache/evaluate lifecycle is expressed once in node_helper.js and reused by every arcgis-day-layers row, so Phase 16/17 additions of this kind extend the same runner rather than copying a loop"

requirements-completed: [WSSI-01, WSSI-02, WSSI-03]

# Metrics
duration: ~25min
completed: 2026-08-24
---

# Phase 15 Plan 03: WSSI Overall Impact via a shared arcgis-day-layers runner Summary

**Extracted the ERO day-loop into `_runArcGisDayProduct`, drove both `excessiveRain` and `winterImpact` through it, and wired `showWinterImpact` end to end so Days 1-3 WSSI rows render MINOR and above while every shipped ERO scenario and golden snapshot stayed byte-identical.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-08-24 (post wave-1 merge)
- **Completed:** 2026-08-24
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments

- Added `_runArcGisDayProduct(row, loc, comparator, productToggles)` to `node_helper.js`, a generalized version of the former ERO-only day-loop that fetches/caches/evaluates any `arcgis-day-layers` registry row and returns `{ payload, anyStale }`. Carried forward every load-bearing comment from the original block (WR-16 day-span rationale, PERF-02 "convert exactly once", WR-01 no-second-shape-check, CR-03/WR-06 rejected-body-sets-anyStale).
- Routed both `PRODUCT_REGISTRY.excessiveRain` and `PRODUCT_REGISTRY.winterImpact` through the shared runner at the `getSpcOutlook` call site, OR-ing each returned `anyStale` into the existing local.
- Added `winterImpact: wssiPayload` to `getSpcOutlook`'s return object and extended its JSDoc contract to describe the new block (always present regardless of `showWinterImpact`, D-05).
- Confirmed WSSI-03 needs no new code: the shared runner's existing fetch/parse/evaluate path already turns a zero-feature `FeatureCollection` into tier `NONE` with no row; recorded that as a comment at the call site so a future reader does not add a redundant guard.
- Added `showWinterImpact: false` to `MMM-SPCOutlook.js` `defaults`, threaded it through `buildRequestPayload`'s `products` object (the single source of truth per WR-15), added the Days 1-3 WSSI render block (gated on `!= "NONE"`, relying on the registry's MINOR floor rather than a second WWA check), and extended the no-risk short-circuit gate with a `winterImpact` term so an active winter impact alone defeats it.

## Task Commits

Each task was committed atomically:

1. **Task 1: Extract the shared arcgis-day-layers runner and add the winterImpact block** - `5501ec6` (feat)
2. **Task 2: Wire the showWinterImpact toggle and render Days 1-3 winter rows** - `915f147` (feat)

## Files Created/Modified

- `node_helper.js` - added `_runArcGisDayProduct`; replaced the ERO-only day-loop at the `getSpcOutlook` call site with two calls to the shared runner (`excessiveRain`, `winterImpact`); added `winterImpact` to the return object and its JSDoc
- `MMM-SPCOutlook.js` - added `showWinterImpact` default, wired it into `buildRequestPayload`, added the WSSI Days 1-3 render block, extended the no-risk short-circuit gate

## Decisions Made

None beyond what the plan specified — followed the plan's `decision_record` (flat, ERO-shaped `winterImpact` payload; extract-not-duplicate the ERO loop) as written.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

The worktree's initial `HEAD` was found ahead of the wave's expected base commit (`cd75acd`, wave-1's tracking-update commit) on this branch; corrected via the sanctioned startup `git reset --hard` to the expected base before any file was read or edited, per the `worktree_branch_check` protocol. `git status --short` was empty at that point, so no uncommitted work was at risk.

## User Setup Required

None - no external service configuration required.

## Verification Performed

- `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 16 passed, 0 failed, 0 skipped`, exit 0, observed after Task 1 and again after Task 2. All 11 `ero-*` scenarios and both golden snapshots (`spc-wellformed-baseline`, `frontend-total-outage-still-shows-the-outage`) passed unchanged.
- `grep -c 'eroDays' node_helper.js` → `0`, confirming the ERO-specific loop locals no longer exist outside the shared runner.
- `node -e` hard-fail check (every layer failing): `out.winterImpact` has exactly the 12 keys `day1Risk,day1Text,day1Color,day1ValidTime,day2Risk,...,day3ValidTime` in that order, every `day{N}Risk` is `"NONE"`, every `day{N}Text` is `"None"`, and `_stale` is `true` — printed `OK hard-fail check`.
- `node -e` toggle-off check: with `showWinterImpact: false`, `out.winterImpact` still carries the full 12-key zero-valued block and no URL containing `wpc_wssi` appears among recorded fetch calls — printed `OK toggle-off check, winterImpact still full 12-key block, no WSSI fetch`.
- Task 2's `node -e` frontend command exited 0 and printed `OK`, covering: all-NONE short-circuits to `"No Severe Weather Risk"`; a `MAJOR` Day 2 winter impact defeats the gate and renders `Winter Impact (Day 2)` with text `Major` and colour `e61f26`; a `NONE` day renders no row; `showWinterImpact: false` suppresses both the row and the gate term.
- `grep -c 'showWinterImpact' MMM-SPCOutlook.js` → `4` (defaults, buildRequestPayload, no-risk gate, render gate) — no fifth copy of the flag on the wire.
- `git diff <wave-1-base> HEAD -- node_helper.js` inspected by hunk: the only removed calls to `extractPolygons`/`evaluatePolygons`/`_validTimeOfWinner` are inside the moved ERO block (now inside `_runArcGisDayProduct`); the function *definitions* of `extractPolygons`, `evaluatePolygons`, and `_validTimeOfWinner` are outside every changed hunk range and were not touched.
- `grep` for stub markers (`TODO`, `FIXME`, `coming soon`, `placeholder`, `not available`) in the two modified files found only one pre-existing, unrelated match (`dayFireRisks` placeholder array in the fire-weather block, untouched by this plan).

## Next Phase Readiness

- `_runArcGisDayProduct` is now the shared extension point for any future `arcgis-day-layers` product (Phase 16/17 candidates land by adding a registry row and one call site, not a copied loop).
- `winterImpact` is live end-to-end: fetched, cached, evaluated, and rendered behind `showWinterImpact`, with the MINOR floor (D-09 AMENDED) enforced entirely in `productRegistry.js`.
- No blockers for downstream plans in this phase (15-04 through 15-06 build the `kml-advisory` side, unaffected by this plan's files).

## Self-Check: PASSED

- FOUND: node_helper.js
- FOUND: MMM-SPCOutlook.js
- FOUND: .planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-03-SUMMARY.md
- FOUND commit: 5501ec6 (Task 1)
- FOUND commit: 915f147 (Task 2)

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Completed: 2026-08-24*
