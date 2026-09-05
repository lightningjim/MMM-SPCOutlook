---
phase: 18-merge-precedence-unified-payload-schema
plan: 02
subsystem: data
tags: [day-grid, precedence-anchor, node.js, spc-outlook]

# Dependency graph
requires:
  - phase: 18-01
    provides: hazardTaxonomy.js (not yet imported by this plan — reserved for 18-03+)
provides:
  - "_spcGridAnchor(validIso, expireIso): reads the Phase 18 grid anchor off SPC's own VALID_ISO/EXPIRE_ISO, with a marked clock fallback"
  - "_gridDayOf(epochMs, nominalStartMs) and _buildGridDays(anchorInfo): the fourteen-key day-grid builder"
  - "getSpcOutlook's return object gains a `days` key: { \"1\"..\"14\": { date, windowStart, windowEnd, hazards: [] } }"
  - "reportedDays/activeDays/unmappedLabels merge accumulators and noteReported/noteActive/noteUnmapped helpers, declared but not yet written into"
  - "Resolved 18-RESEARCH.md Open Question 1: reuse _hazardDayOffset verbatim, anchored to EXPIRE_ISO minus 24h, never raw VALID_ISO"
affects: [18-03, 18-04, 18-05, 18-06, 18-07, 18-08, 18-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Three-branch hoist: a value only computable in one branch of an if/else-if/else block is hoisted to a function-scoped let and assigned independently on each branch (mirrors day1CatProximity's existing treatment)"
    - "Clock-fallback anchor with a once-per-process log guard (this._loggedGridAnchorFallback), matching _loggedIntervalFallback/_loggedMultiInstance"
    - "Constants derived from an existing constant rather than restated (UNMAPPED_LABELS_MAX_PER_SOURCE = HAZARDS_MAX_LOGGED_UNMAPPED_LABELS)"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "Open Question 1 resolved as 'reuse verbatim with the nominal anchor' — no interval-overlap math needed. Confirmed empirically (table below), not assumed."
  - "The plan's own stated expectation for Case C (heavily truncated anchor 01:00Z) was refuted by the actual script output: Case C's Hazards Outlook feature computed grid day 2 (correct), not grid day 1 as predicted. Only Case B (the live-observed 13:00Z truncation) produced the wrong grid day. This does not change the rule or its justification — only the nominal anchor is correct unconditionally, regardless of how a truncated VALID happens to land — but the SUMMARY records the actual numbers per the plan's 'confirm or refute, do not assume' instruction."
  - "_spcGridAnchor(day1ValidIso, day1ExpireIso) is called once, immediately after the day-1 categorical block closes (not at the very end of getSpcOutlook), since 'the day-1 block' in the plan's task text refers to that block specifically, per its own read_first pointing at node_helper.js:3040-3095's three branches."
  - "Two brief textual mentions of `_validTimeOfWinner` were rephrased in new comments (without changing meaning) specifically to keep the acceptance criterion's exact grep-count delta (+4, two fields x two branches) accurate, since a comment merely naming the helper also matches that grep."

patterns-established:
  - "The day-1 categorical block's three branches (cache-hit / hard-failure / fresh-fetch) get independent per-branch treatment for any value that isn't available on every path, rather than a single post-block assignment — the same discipline day1CatProximity already established, now extended to day1ValidIso/day1ExpireIso."

requirements-completed: [MERGE-01, RPT-07]

# Metrics
duration: ~15min
completed: 2026-09-05
---

# Phase 18 Plan 02: SPC Grid Anchor & Day-Grid Shape Summary

**Reads the Phase 18 day grid's anchor from SPC's own VALID_ISO/EXPIRE_ISO (with a marked clock fallback) and adds a fourteen-key `days` skeleton to `getSpcOutlook`'s payload, alongside the merge accumulators later plans populate.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-05T16:45:35Z (immediately following 18-01)
- **Completed:** 2026-09-05T16:59:28Z
- **Tasks:** 3 completed
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments
- Resolved 18-RESEARCH.md Open Question 1 empirically with a throwaway script (deleted per Task 1's instructions) run against the real `_hazardDayOffset`, and pinned the nominal-anchor rule as a comment above that function.
- Added `_spcGridAnchor(validIso, expireIso)`, which derives the grid's nominal 12Z start from `EXPIRE_ISO` minus 24 hours and range-checks `VALID_ISO` before trusting it as day 1's actual (possibly truncated) start, falling back to a UTC-clock estimate when no usable `EXPIRE_ISO` is available.
- Hoisted `day1ValidIso`/`day1ExpireIso` alongside `day1CatProximity` in the day-1 categorical block, with independent per-branch assignment on the cache-hit, hard-failure, and fresh-fetch paths — mirroring the existing `day1CatProximity` treatment exactly.
- Added `_gridDayOf` and `_buildGridDays`, producing a fourteen-key `"1"`–`"14"` `days` skeleton with resolved `date`, ISO `windowStart`/`windowEnd`, and empty `hazards` arrays — added to the payload as `days: gridDays` after `advisories`, with no other key changed.
- Declared (but did not populate) the `reportedDays`/`activeDays`/`unmappedLabels` merge accumulators and their `noteReported`/`noteActive`/`noteUnmapped` helpers, so plans 18-03 and 18-04 write into a structure that already exists.
- All 91 pre-existing probe scenarios still pass, confirming the eight legacy payload blocks are untouched.

## Task Commits

1. **Task 1: Resolve RESEARCH.md Open Question 1 and pin the nominal-anchor rule** - `e04789c` (docs)
2. **Task 2: Extract the SPC grid anchor with a three-branch hoist and a clock fallback** - `4e7a07c` (feat)
3. **Task 3: Build the fourteen grid days and add the days key to the payload** - `3af6b51` (feat)

**Plan metadata:** (this commit) `docs(18-02): complete SPC grid anchor & day-grid shape plan`

## Files Created/Modified
- `node_helper.js` - Added the nominal-anchor rule comment above `_hazardDayOffset`; added `_spcGridAnchor`, `_gridDayOf`, `_buildGridDays`; hoisted `day1ValidIso`/`day1ExpireIso`; added `GRID_DAY_COUNT` and `UNMAPPED_LABELS_MAX_PER_SOURCE` constants; added the `days` key and the merge-accumulator declarations to `getSpcOutlook`'s return; extended the `@returns` JSDoc block with a `days` paragraph; added `this._loggedGridAnchorFallback = false` to `start()`.

## Open Question 1 Results (Task 1)

Ran a throwaway script (`scripts/check-grid-anchor-rounding.js`, deleted before this commit) that called the real `_hazardDayOffset` (via the probe harness's `loadNodeHelper` seam) against three candidate anchors and three inputs each. Actual output:

| Anchor | Input | offset | gridDay (offset+1) |
|---|---|---|---|
| Case A — clean anchor (2026-09-05T12:00:00Z) | wpc-hazards start_date (2026-09-06T00:00:00Z) | 1 | 2 |
| Case A — clean anchor (2026-09-05T12:00:00Z) | heatrisk idp_validtime Sep 5 12Z (2026-09-05T12:00:00Z) | 0 | 1 |
| Case A — clean anchor (2026-09-05T12:00:00Z) | heatrisk idp_validtime Sep 6 12Z (2026-09-06T12:00:00Z) | 1 | 2 |
| Case B — live-observed truncated anchor (2026-09-05T13:00:00Z) | wpc-hazards start_date (2026-09-06T00:00:00Z) | 0 | **1 (WRONG — D-10 requires grid day 2)** |
| Case B — live-observed truncated anchor (2026-09-05T13:00:00Z) | heatrisk idp_validtime Sep 5 12Z | 0 | 1 |
| Case B — live-observed truncated anchor (2026-09-05T13:00:00Z) | heatrisk idp_validtime Sep 6 12Z | 1 | 2 |
| Case C — heavily truncated anchor (2026-09-05T01:00:00Z) | wpc-hazards start_date (2026-09-06T00:00:00Z) | 1 | 2 (correct — see note below) |
| Case C — heavily truncated anchor (2026-09-05T01:00:00Z) | heatrisk idp_validtime Sep 5 12Z | 0 | 1 |
| Case C — heavily truncated anchor (2026-09-05T01:00:00Z) | heatrisk idp_validtime Sep 6 12Z | 1 | 2 |

**Resolution: reuse `_hazardDayOffset` verbatim with the nominal anchor.** No interval-overlap math is needed — the existing `Math.round` division is exactly right once handed `EXPIRE_ISO` minus 24 hours instead of raw `VALID_ISO`.

**Note on Case C (confirm-or-refute, per the plan's own instruction not to assume):** the plan's task text predicted Cases B *and* C would both produce grid day 1 for the Hazards Outlook feature. The actual run refutes that for Case C — a 01:00Z anchor happens to land on the correct side of the rounding boundary and produces grid day 2. Case B (13:00Z, the live-observed truncation) is the one that actually fails, producing grid day 1 when D-10 requires grid day 2. This does not weaken the rule: the coincidental correctness of one truncated value is not a reason to trust raw `VALID_ISO` in general, since a different truncation depth (Case B) demonstrably breaks it. The comment above `_hazardDayOffset` in `node_helper.js` records this exact finding rather than the plan's unverified prediction.

## RESEARCH.md Contradiction Flag (for the orchestrator)

18-RESEARCH.md's "Live Field Formats" section contains an internal contradiction in its near-boundary paragraph: one sentence correctly states that Sep 6's 00Z-00Z window forward-aligns onto the grid day starting 12Z Sep 6 (grid day 2), and the next sentence claims the same feature "must bucket onto grid day 1." D-10's own text is unambiguous, and the first sentence is the one consistent with it (confirmed empirically above — Case A, the clean/nominal anchor, produces grid day 2). This plan implements D-10 as locked (grid day 2 under a correct nominal anchor) and treats the second RESEARCH.md sentence as a research error, not a decision.

## Task 3 Scratch Harness Output

Two ad-hoc harness runs (via `loadNodeHelper`, not committed to the repo) verified the emitted `days` block shape.

**Clock-fallback run** (all fetches routed to hard 503 failures, so `gridAnchorInfo.anchor === "estimated"`):
```
Number of keys: 14
Keys: 1,2,3,4,5,6,7,8,9,10,11,12,13,14
All days well-formed: true
Days 2-13 contiguous: true
Day1 duration ms: 86400000 0 < dur <= 86400000: true
```
`days["1"]` = `{ date: "2026-09-05", windowStart: "2026-09-05T12:00:00.000Z", windowEnd: "2026-09-06T12:00:00.000Z", hazards: [] }`
`days["14"]` = `{ date: "2026-09-18", windowStart: "2026-09-18T12:00:00.000Z", windowEnd: "2026-09-19T12:00:00.000Z", hazards: [] }`

**Observed-anchor run** (day-1 categorical fixture with `VALID_ISO: "2026-09-05T13:00:00Z"`, `EXPIRE_ISO: "2026-09-06T12:00:00Z"`, `turfStub.pointInPolygon` forced true):
```
day1: { date: "2026-09-05", windowStart: "2026-09-05T13:00:00.000Z", windowEnd: "2026-09-06T12:00:00.000Z", hazards: [] }
day2: { date: "2026-09-06", windowStart: "2026-09-06T12:00:00.000Z", windowEnd: "2026-09-07T12:00:00.000Z", hazards: [] }
```
Confirms day 1's `windowStart` carries the truncated `VALID_ISO` while its `date` stays on the nominal Sep 5 label, and day 1's `windowEnd` equals day 2's `windowStart` exactly — the grid stays contiguous across the truncation boundary.

## Decisions Made

See `key-decisions` in the frontmatter above. In brief: Open Question 1 resolved as "reuse verbatim with the nominal anchor"; the plan's Case C prediction was refuted by the actual script output and the SUMMARY records the true numbers rather than the prediction; `_spcGridAnchor` is invoked immediately after the day-1 categorical block per the plan's own scoping of "the day-1 block."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Reordered `UNMAPPED_LABELS_MAX_PER_SOURCE`'s declaration relative to `HAZARDS_MAX_LOGGED_UNMAPPED_LABELS`**
- **Found during:** Task 3
- **Issue:** The plan's instruction to declare `GRID_DAY_COUNT` "next to `MS_PER_DAY`" was read literally for both new constants at first; `UNMAPPED_LABELS_MAX_PER_SOURCE` is defined in terms of `HAZARDS_MAX_LOGGED_UNMAPPED_LABELS`, which is declared later in the file (module-level `const`), so referencing it before its own declaration would throw a `ReferenceError` (temporal dead zone) the instant `node_helper.js` is required.
- **Fix:** Declared `GRID_DAY_COUNT` next to `MS_PER_DAY` as instructed, and declared `UNMAPPED_LABELS_MAX_PER_SOURCE` immediately after `HAZARDS_LOG_LABEL_MAX_CHARS` (the constant it derives from), which is the plan's own stated intent ("defined in terms of the existing `HAZARDS_MAX_LOGGED_UNMAPPED_LABELS`").
- **Files modified:** `node_helper.js`
- **Verification:** `node -e "require('./node_helper.js')"` (via the probe harness's `loadNodeHelper`) loads cleanly; full probe suite passes.
- **Committed in:** `3af6b51` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to avoid a load-time crash; no change to the constant's value or its stated derivation rule.

## Issues Encountered
- The acceptance criterion `grep -c "_validTimeOfWinner" node_helper.js` increasing by exactly 4 was initially violated by two new comments that merely *named* the helper without calling it (adding 2 extra text matches). Reworded both comments to describe the same behavior without repeating the identifier, bringing the grep delta back to exactly +4 (two fields × two branches). Same issue and same fix for the `getFullYear()`/`getMonth()`/`getDate()` count, which briefly rose from 1 to 2 due to a comment naming those methods to explain what the clock fallback does *not* use.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `getSpcOutlook`'s return object now carries a fully-shaped fourteen-key `days` block with real grid windows and empty `hazards` arrays, ready for plan 18-03 (wpc-hazards, heatrisk) and plan 18-04 (the remaining four sources) to populate.
- `reportedDays`/`activeDays`/`unmappedLabels` and their `noteReported`/`noteActive`/`noteUnmapped` helpers exist in `getSpcOutlook`'s scope, unused by this plan, ready for the next two plans to write into without needing to declare them.
- `_spcGridAnchor`, `_gridDayOf`, and `_buildGridDays` are stable interfaces per the plan's `<interfaces>` section; no signature changes anticipated.
- No blockers. `node scripts/probe-payload-resilience.js` remains at `91 passed, 0 failed, 0 skipped`, matching the plan's baseline requirement — the eight legacy payload blocks are provably untouched.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: node_helper.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-02-SUMMARY.md
- FOUND: e04789c (docs commit, Task 1)
- FOUND: 4e7a07c (feat commit, Task 2)
- FOUND: 3af6b51 (feat commit, Task 3)
