---
phase: 14-foundation-wpc-excessive-rainfall-outlook
plan: 02
subsystem: api
tags: [node-helper, spc-outlook, cfg-refactor]

# Dependency graph
requires:
  - phase: 14-01
    provides: productRegistry.js (created independently, not consumed by this plan)
provides:
  - Single unconditional return shape from getSpcOutlook regardless of `extended`
  - "declare defaults, conditionally fetch, always return" precedent proven a third time in node_helper.js
affects: [14-03, 14-04, 14-05, 18-merge-logic]

# Tech tracking
tech-stack:
  added: []
  patterns: ["declare defaults, conditionally fetch, always return (extended-gated Day 4-8)"]

key-files:
  created: []
  modified: [node_helper.js]

key-decisions:
  - "Hoisted the ten Day 4-8 locals (day4ProbRisk/day4Sign .. day8ProbRisk/day8Sign) above the extended fork before deleting the fork, so Task 1 and Task 2 could each be verified independently"
  - "Kept the day48Risk truthiness expression unchanged — zero defaults already yield false, no extra guard needed"

patterns-established:
  - "Pattern: extended/product-toggle gates wrap only fetch blocks, never declarations or the return statement"

requirements-completed: [CFG-02]

# Metrics
duration: 26min
completed: 2026-08-19
---

# Phase 14 Plan 02: Collapse getSpcOutlook's extended Fork Summary

**Removed the `if (!extended)` early-return fork from `getSpcOutlook` in `node_helper.js` so the backend always returns one payload shape (day1-day8, day48Risk, full eight-day fireWeather), with `extended` now gating only the Day 4-8 SPC fetches and Day 3-8 fire weather fetches.**

## Performance

- **Duration:** 26 min
- **Started:** 2026-08-19T14:10:00Z (approx, from base commit)
- **Completed:** 2026-08-19T14:36:00Z (approx, from Task 2 commit)
- **Tasks:** 3 completed
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments
- `getSpcOutlook` now has exactly one success-path `return` statement (plus the outer catch's `{ error }` return)
- Day 4-8 locals (`day4ProbRisk`/`day4Sign` .. `day8ProbRisk`/`day8Sign`) declared and defaulted to `0`/`false` above any gate; only the five fetch blocks are wrapped in `if (extended)`
- `anyStale` contributions from the Day 4-8 fetches stay confined inside `if (extended)`, so a disabled Day 4-8 fetch never marks the payload stale
- Live probe evidence (below) confirms `extended: false` and `extended: true` produce byte-identical top-level key sets

## Task Commits

Each task was committed atomically:

1. **Task 1: Hoist Day 4-8 locals and gate only their fetch blocks on `extended`** - `46e1bb6` (refactor)
2. **Task 2: Delete the `!extended` early return and unify the payload into one return object** - `3b1cc18` (refactor)
3. **Task 3: Build the payload-shape probe and capture the extended:false vs extended:true key sets** - no repo commit (probe harness lives only in the session scratchpad per the plan's threat mitigation T-14-07; results captured below)

**Plan metadata:** commit to follow this SUMMARY.

## Files Created/Modified
- `node_helper.js` - `getSpcOutlook` restructured to the "declare defaults, conditionally fetch, always return" shape for Day 4-8; JSDoc updated to describe the non-forking contract

## Decisions Made
- Hoisted locals above the still-present early return in Task 1 (kept the plan's incremental-safety guarantee: Task 1 alone is syntax-valid and behavior-preserving), then deleted the fork in Task 2 — matches the plan's stated two-step sequencing.
- No new `if (extended)` guard was added around the `day48Risk` truthiness expression; the existing `day4ProbRisk > 0 || ...` expression already evaluates to `false` when all five locals default to `0`, exactly as the plan specified.

## Deviations from Plan

None - plan executed exactly as written. The probe harness was built in the session scratchpad exactly as specified (never added to the repository); the harness script accepts the node_helper.js path and lat/lon via environment variables rather than positional CLI args beyond `extended`, which is a mechanical detail of the throwaway harness, not a behavior change to the payload contract under test.

## Issues Encountered

**Worktree dependency resolution:** This worktree has no `node_modules` (dependencies live only in the main repo checkout). The probe's `NODE_PATH` was extended to include the main repo's `node_modules` directory alongside the stub-module directory, so `@turf/turf`, `node-fetch`, `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson`, and `xpath` resolved without installing or committing anything new. No repository file was touched to work around this.

## Probe Evidence (Task 3)

**Command used (re-runnable, plan 14-03 reuses this exact form):**

```bash
NODE_PATH="<scratch>/stubs/node_modules:<repo-root>/node_modules" \
NODE_HELPER_PATH="<repo-root>/node_helper.js" \
PROBE_LAT=35.22 PROBE_LON=-97.44 \
node <scratch>/probe.js <true|false>
```

Where `<scratch>` is the session scratchpad directory containing `probe.js` and `stubs/node_modules/{node_helper,logger}/index.js`, and `<repo-root>` is the absolute path to the checkout containing `node_helper.js`. Location used: lat `35.22`, lon `-97.44` (Norman OK, the project's default coordinates).

**Run A — `extended: false`:**

Sorted top-level keys:
```
day1, day2, day3, day4, day48Risk, day5, day6, day7, day8, fireWeather
```

`day48Risk`: `false`

`day4` sub-object (day5-day8 are identical):
```json
{ "risk": "NONE", "probRisk": 0, "sign": false, "color": "afddf6", "text": "None" }
```

No `_stale`/`_staleAsOf` present (fresh fetches, no cache miss fallback triggered).

**Run B — `extended: true`:**

Sorted top-level keys:
```
day1, day2, day3, day4, day48Risk, day5, day6, day7, day8, fireWeather
```

`day48Risk`: `false` (live SPC Day 4-8 data at this location/date carried no active risk — this is real network data, not a stub)

`day4` sub-object (day5-day8 are identical — live fetch confirmed no active Day 4-8 risk at the probe location today):
```json
{ "risk": "NONE", "probRisk": 0, "sign": false, "color": "afddf6", "text": "None" }
```

No `_stale`/`_staleAsOf` present.

**Comparison:** Run A and Run B top-level key lists are identical (10 keys each, same set, same order-independent comparison), with no `_stale`/`_staleAsOf` divergence to account for in this run. This proves `getSpcOutlook`'s payload shape does not fork on `extended` (CFG-02, D-01). Day1-3 sub-object key sets in Run A (`risk`, `text`, `color`, `probRisk`, plus `torRisk`/`torCig`/`hailRisk`/`hailCig`/`windRisk`/`windCig` on days 1-2 and `cig` on day3) match the pre-plan contract exactly — no `proximity` subtree present because `proximityWeighting` defaults to `false` and was not set by the probe.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getSpcOutlook`'s single-return-shape contract is proven live; plan 14-03 can apply the identical "declare defaults, conditionally fetch, always return" pattern to `excessiveRain` with a working precedent and a reusable probe command.
- No blockers identified for 14-03/14-04.

---
*Phase: 14-foundation-wpc-excessive-rainfall-outlook*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-02-SUMMARY.md`
- FOUND: commit `46e1bb6` (Task 1)
- FOUND: commit `3b1cc18` (Task 2)
- FOUND: commit `9337597` (SUMMARY commit)
