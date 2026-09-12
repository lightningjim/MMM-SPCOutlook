---
phase: 18-merge-precedence-unified-payload-schema
plan: 15
subsystem: api
tags: [node_helper, spc-outlook, heatrisk, merge-precedence, mutation-testing]

# Dependency graph
requires:
  - phase: 18-merge-precedence-unified-payload-schema
    provides: "18-14's rejected-elapsed-EXPIRE_ISO fix and the pinned-clock idiom every merge-grid-* scenario now follows"
provides:
  - "_addHeatRiskGridEntries bounded only by GRID_DAY_COUNT, closing the CR-02 unit-mismatch drop of HeatRisk's outermost tile for the 00Z-12Z half of every UTC day"
  - "the probe suite's first sub-12Z clock (HEATRISK_MORNING_NOW_MS) and first scenario reaching _spcGridAnchor's sub-12Z anchor branch"
affects: [19-getdom-rewrite]

# Tech tracking
tech-stack:
  added: []
  patterns: ["two-run shared-closure scenario (runAtClock) pinning a sub-12Z clock and a post-12Z control, mirroring the existing merge-grid-* two-phase idiom"]

key-files:
  created: []
  modified: [node_helper.js, scripts/probe-payload-resilience.js]

key-decisions:
  - "Dropped the `gridDay > row.days` term outright rather than translating row.days into grid-day units, matching _addHazardsOutlookGridEntries's existing GRID_DAY_COUNT-only clamp on the same grid"
  - "WR-09's full remedy (duplicating the SPC straight-through and parity scenarios against a morning clock) was NOT attempted -- only the one sub-12Z scenario gap 2's own missing: list required was added"

patterns-established:
  - "runAtClock(nowMs) shared closure for two-run (subject clock + control clock) HeatRisk scenarios"

requirements-completed: [MERGE-03]

# Metrics
duration: 25min
completed: 2026-09-06
---

# Phase 18 Plan 15: HeatRisk Grid Loop Unit-Mismatch Fix (CR-02) Summary

**`_addHeatRiskGridEntries`'s range check no longer compares an SPC-anchored `gridDay` against `row.days` (HeatRisk's own UTC-midnight-anchored product-day count) — bounded by `GRID_DAY_COUNT` alone, and mutation-proven with the probe suite's first sub-12Z scenario.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-09-06T14:08:00Z
- **Completed:** 2026-09-06T14:33:40Z
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- Removed the `gridDay > row.days` term from `_addHeatRiskGridEntries`'s range check (node_helper.js:3007), replacing the WR-16 provenance comment with one stating the unit mismatch that caused CR-02
- Added `HEATRISK_MORNING_NOW_MS` (06:00Z) — the probe suite's first clock inside the 00Z-12Z half of a UTC day — and a new scenario, `merge-grid-heatrisk-all-seven-tiles-land-under-a-sub-12z-clock`, proving all seven HeatRisk tiles reach `days[]` and `sources['heatrisk'].reportedDays` on grid days 2-8 under that clock, with a post-12Z control proving only the grid index moves
- Corrected the `MERGE_NOW_MS` comment's factually wrong description of 13:00Z as "inside the 00Z-12Z-past window" (it is post-12Z) — the false statement is exactly what let all 37 pre-existing `merge-*` scenarios miss this branch (WR-09)
- Both mutations proven: restoring the removed term turns the new scenario's morning half RED naming the missing grid day 8; forcing the post-12Z anchor arm unconditionally trips the scenario's own precondition guard

## Task Commits

Each task was committed atomically:

1. **Task 1: Bound the HeatRisk grid loop by GRID_DAY_COUNT alone** - `9483b72` (fix)
2. **Task 2: Add the suite's first sub-12Z scenario and mutation-prove the fix** - `9e43da3` (test)

**Plan metadata:** committed separately by the orchestrator after wave merge (worktree mode — this executor does not write STATE.md/ROADMAP.md)

## Files Created/Modified
- `node_helper.js` - `_addHeatRiskGridEntries`'s range check at line 3007 now reads `if (gridDay < 1 || gridDay > GRID_DAY_COUNT) continue;`; the comment above it explains the unit mismatch (grid-day vs. UTC-midnight-anchored product-day numbering) rather than justifying the old term
- `scripts/probe-payload-resilience.js` - Added `HEATRISK_MORNING_NOW_MS` constant (line 340) and the `merge-grid-heatrisk-all-seven-tiles-land-under-a-sub-12z-clock` scenario (appended immediately after `merge-grid-heatrisk-12z-sample-maps-to-its-own-grid-day`); corrected the `MERGE_NOW_MS` comment block's wrong "00Z-12Z-past" description

## Decisions Made
- Followed the plan's `<decision>` block verbatim: dropped the `row.days` term rather than converting it into grid-day units, since `GRID_DAY_COUNT` already bounds the loop safely and `_addHazardsOutlookGridEntries` is the established precedent for a GRID_DAY_COUNT-only clamp on this same grid
- Did not attempt WR-09's broader remedy (duplicating the SPC straight-through/parity scenarios against a morning clock) — out of scope for this gap, explicitly left recorded per the plan's Review-warning rider

## Deviations from Plan

None - plan executed exactly as written.

## Mutation Proofs

**M1 — restore the removed term** (`if (gridDay < 1 || gridDay > GRID_DAY_COUNT || gridDay > row.days) continue;`):
- Applied to `node_helper.js` line 3007
- Ran `node scripts/probe-payload-resilience.js`
- Result: `PROBE RESULT: 121 passed, 1 failed, 0 skipped`
- Failure text (verbatim): `FAIL merge-grid-heatrisk-all-seven-tiles-land-under-a-sub-12z-clock: CR-02: expected exactly one heatrisk entry on each of grid days 2-8, got mismatches [{"gridDay":8,"count":0}] out of 7 tiles supplied`
- The morning half went RED naming the exact missing grid day (8), matching the plan's acceptance criterion. The scenario's control run (post-12Z, grid days 1-7 only) is unreachable once the morning assertions throw — the shared `runAtClock` closure runs sequentially and the throw stops execution before the control call. This is consistent with the mutation's actual reach: on the post-12Z clock the scenario only ever supplies grid days 1-7, so `gridDay > row.days` (`row.days` = 7) is never true there, and the control assertions would have passed unchanged had they run. Restored, re-ran: `PROBE RESULT: 122 passed, 0 failed, 0 skipped`.

**M2 — force the post-12Z anchor arm unconditionally** (`_spcGridAnchor`'s clock fallback changed from `now.getUTCHours() >= 12 ? todayMidnightMs + 12h : todayMidnightMs - 1d + 12h` to unconditionally `todayMidnightMs + 12h`):
- Applied to `node_helper.js` lines 2559-2561
- Ran `node scripts/probe-payload-resilience.js`
- Result: `PROBE RESULT: 120 passed, 2 failed, 0 skipped`
- Failure text (verbatim, new scenario): `FAIL merge-grid-heatrisk-all-seven-tiles-land-under-a-sub-12z-clock: precondition failed: expected days["1"].date "2026-08-30" under the 06:00Z clock (sub-12Z anchor branch), got "2026-08-31" -- the pinned clock never reached _spcGridAnchor's sub-12Z fallback`
- The scenario's own precondition guard fired exactly as designed, confirming the morning run genuinely depends on the sub-12Z branch rather than passing by coincidence. Blast radius: one other pre-existing scenario also failed (`merge-grid-heatrisk-yesterday-noon-tile-still-covers-grid-day-1`, which also depends on the sub-12Z clock fallback) — a narrow but real blast radius, evidence the anchor branch is load-bearing for both HeatRisk scenarios that pin a sub-12Z clock. Restored, re-ran: `PROBE RESULT: 122 passed, 0 failed, 0 skipped`.

Post-restoration check: `git diff HEAD~1 HEAD -- node_helper.js` shows only Task 1's intended change (the range-check line and its comment) — no mutation left in the tree, confirmed against the committed history since the mutations were reverted before either task's commit.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- MERGE-03 (`18-VERIFICATION.md` gap 2 / CR-02) is closed: all seven HeatRisk tiles now reach `days[]` and `sources['heatrisk'].reportedDays` regardless of the hour of day.
- Probe suite: 119 (pre-18-13/14) baseline entering this plan was recorded as 121 (post-18-14); this plan adds 1 scenario, ending at 122 passed, 0 failed, 0 skipped.
- Two other blocking gaps from `18-VERIFICATION.md` (MERGE-01/criterion 1 via 18-13, RPT-07/criterion 5) are out of this plan's scope — this plan closes MERGE-03 only, as its frontmatter states.
- The already-filed, differently-shaped Phase 17 legacy `heatRisk.day1..day7` day-7 drop (routed to Phase 19) was not touched, per the plan's explicit scope boundary.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-06*
