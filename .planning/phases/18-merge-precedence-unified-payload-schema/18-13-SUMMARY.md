---
phase: 18-merge-precedence-unified-payload-schema
plan: 13
subsystem: backend
tags: [node_helper, hazards-outlook, wpc-hazards, merge-precedence, mutation-testing]

# Dependency graph
requires:
  - phase: 18-10
    provides: "the prior Math.max(gridStart, gridEnd - 1) fix this plan supersedes"
provides:
  - "inclusive end_date reading in _addHazardsOutlookGridEntries, closing MERGE-01's multi-day gap"
  - "a live-parity multi-day probe scenario cross-checking days[] against the legacy hazardsOutlook block"
  - "a disclosed coverage hole in the bound-safety clamp (M3), not closed by this plan"
affects: [19-getdom-rewrite]

# Tech tracking
tech-stack:
  added: []
  patterns: ["mutation-proof every re-pointed/added probe scenario before treating a plan as done"]

key-files:
  created: []
  modified:
    - node_helper.js
    - scripts/probe-payload-resilience.js

key-decisions:
  - "D-21: the Hazards Outlook end_date endpoint is read INCLUSIVELY on the day-grid path (const lastGridDay = gridEnd), superseding 18-10's Math.max(gridStart, gridEnd - 1)"

patterns-established:
  - "Pattern: when reversing a locked decision, name the superseded decision explicitly in the code comment so a history reader finds the reversal rather than assuming a regression"

requirements-completed: [MERGE-01]

# Metrics
duration: 30min
completed: 2026-09-06
---

# Phase 18 Plan 13: Inclusive Hazards Outlook end_date bound (D-21) Summary

**`_addHazardsOutlookGridEntries` now reads the Hazards Outlook `end_date` endpoint inclusively (`lastGridDay = gridEnd`), closing the multi-day trailing-day-loss gap CR-03/18-VERIFICATION.md gap 1 identified, with a new live-parity probe scenario and a four-row mutation table proving the fix and its guard rails.**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-06T13:47:00Z (approx, from worktree base commit)
- **Completed:** 2026-09-06T14:17:13Z
- **Tasks:** 3 completed (Task 3 is verification-only, no code changes to commit)
- **Files modified:** 2 (`node_helper.js`, `scripts/probe-payload-resilience.js`)

## Accomplishments
- Reversed the 18-10 `Math.max(gridStart, gridEnd - 1)` bound to an inclusive `gridEnd`, matching `_bucketHazardMatch`'s own inclusive day loop (D-21), so a multi-day Precipitation span no longer loses its final calendar day from the unified `days[]` grid
- Re-pointed the three probe assertions that encoded the superseded exclusive reading, preserving every mutation pin they carried (none deleted)
- Added `merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block`, the genuinely-multi-day live-parity coverage `18-VERIFICATION.md` gap 1 named as missing
- Ran and recorded four mutations proving the fix and its guard rails are load-bearing, disclosing one genuine coverage hole (M3) rather than glossing it

## Task Commits

Each task was committed atomically:

1. **Task 1: Read the endpoint inclusively and re-point every assertion that encoded the exclusive reading** - `443f977` (fix)
2. **Task 2: Add the multi-day inclusive span scenario that cross-checks days[] against the legacy block** - `6161c23` (test)
3. **Task 3: Mutation-prove every scenario this plan added or re-pointed** - no commit (verification-only; the working tree was restored to Task 2's state after each of the four mutations, `git diff --stat` confirms clean)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `node_helper.js` - `_addHazardsOutlookGridEntries`'s `lastGridDay` bound changed from `Math.max(gridStart, gridEnd - 1)` to `gridEnd`; header comment rewritten to state D-21 and name 18-10 as the superseded decision. Header clamp (`clampedStart`/`clampedEnd`) untouched.
- `scripts/probe-payload-resilience.js` - `mergeGridWindow` retargeted onto the zero-duration inclusive form; three existing scenarios corrected in place (see below); one new scenario appended (`merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block`)

## D-21 Decision Record

**LOCKED DECISION D-21: the Hazards Outlook `end_date` endpoint is read INCLUSIVELY on the day-grid path.**

`const lastGridDay = gridEnd;` — wholesale, with no `start_date === end_date` special case and no per-group branch. This supersedes 18-10's `Math.max(gridStart, gridEnd - 1)`, which tolerated both the inclusive/zero-duration and exclusive `end_date` conventions the live feed mixes, but only for a span confined to a single grid day — for any longer span it silently resolved to the exclusive reading, which was the still-open defect.

**Rationale (four independent grounds, from the plan's locked decision):**
1. Only the Precipitation group reaches this grid (`match.group !== "precipitation"` routes everything else to the window band unconditionally), and Precipitation was the group observed live using the inclusive form. The Temperature feature the live capture recorded using the exclusive form never reaches this code path.
2. Parity with the legacy block (D-01's whole point): `_bucketHazardMatch`'s day loop is inclusive on both ends. Inclusive reading here makes the two representations agree by construction rather than by coincidence.
3. The project's no-false-negative rule breaks the tie: over-reporting one day is cosmetic; under-reporting one day is a hazard that fails to display.
4. `18-VERIFICATION.md`'s own `missing:` entry asked for exactly this reading.

**Bound safety unchanged and non-negotiable:** the clamp stays at the loop header (`clampedStart = Math.max(gridStart, 1)`, `clampedEnd = Math.min(lastGridDay, GRID_DAY_COUNT)`), never in the body. Widening `lastGridDay` from `gridEnd - 1` to `gridEnd` does not touch that clamp — a hostile `end_date` still yields at most fourteen iterations (T-18-03/T-16-05).

## Fate of the Three Re-pointed Assertions

1. **`merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day`** — CORRECTED AND RENAMED to `merge-grid-hazards-multi-day-span-covers-through-its-end-date`. Under D-21 a Sep 10 -> Sep 12 span now covers grid days 6, 7 AND 8 (matching the legacy block), with the anti-over-reach mutation pin preserved and moved one day outward: grid day 9 must stay empty.
2. **`merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day`'s control** — CONTROL CORRECTED, PRIMARY UNTOUCHED. The primary live-shape pin (objectid-7917 landing on grid day 6) is unchanged. The control (the exclusive-form Sep 10 -> Sep 11 feature) now asserts grid days 6 AND 7, with the comment rewritten from "the fix must carry both conventions" to record that both live-observed forms are read through one inclusive bound, and that a Temperature-group feature carrying the exclusive form never reaches this grid.
3. **`merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day`'s control** — FIXTURE FORM CORRECTED, ASSERTIONS UNTOUCHED. Both features rebuilt in the live-observed zero-duration inclusive form (`startDate === endDate`). Every assertion, including the `nominalStartMs`-vs-`day1StartMs` mutation pin, stays exactly as written.

Additionally, `mergeGridWindow(n)` was retargeted from the exclusive `{ start, start + 86400000 }` form to the zero-duration inclusive form (`start === end`), so a "single grid day" fixture used by ~18 `merge-*` scenarios still resolves to exactly one grid day under D-21.

## Mutation Table (Task 3)

All four mutations were applied one at a time, run against the full suite, the exact `FAIL` line recorded, then reverted and the suite re-confirmed green (`120 passed, 0 failed, 0 skipped`) before the next mutation.

| # | Mutation | Edit | Expected RED | Observed | Restored suite state |
|---|----------|------|---------------|----------|----------------------|
| M1 | Restore shipped exclusive bound | `const lastGridDay = Math.max(gridStart, gridEnd - 1);` | `merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block` (parity naming 2026-09-10) AND `merge-grid-hazards-multi-day-span-covers-through-its-end-date` (grid-day-8) | **3 FAILED** (both required scenarios RED, plus `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day`'s control): <br>`FAIL merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block: parity mismatch (date: which side lacks it): 2026-09-10: present in legacy hazardsOutlook, absent from days[]`<br>`FAIL merge-grid-hazards-multi-day-span-covers-through-its-end-date: D-21: expected exactly one wpc-hazards "Heavy Rain" entry on grid day 8 (the span's end_date-named day), got []`<br>`FAIL merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day: control: D-21 reads the Sep 10-11 exclusive-form span inclusively, expected it on grid days 6 AND 7 and NOT on grid day 5, got day5=[] day6=[...] day7=[]`<br>`PROBE RESULT: 117 passed, 3 failed, 0 skipped` | `120 passed, 0 failed, 0 skipped` |
| M2 | Over-inclusive bound | `const lastGridDay = gridEnd + 1;` | `merge-grid-hazards-multi-day-span-covers-through-its-end-date` (grid-day-9 control) AND `merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block` (grid-day-7 control) | **4 FAILED** (both required scenarios RED, plus `merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day` and `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day`): <br>`FAIL merge-grid-hazards-multi-day-span-covers-through-its-end-date: expected NO wpc-hazards "Heavy Rain" entry on grid day 9 -- a bound beyond gridEnd, or a clamp moved out of the loop header, would populate it. Got [...]`<br>`FAIL merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block: parity mismatch (date: which side lacks it): 2026-09-11: present in days[], absent from legacy hazardsOutlook`<br>`FAIL merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day: control: expected the Sep 5 00Z-00Z feature on grid day 1 only, got day1=[...] day2=[...]`<br>`FAIL merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day: MERGE-01: expected NO wpc-hazards "Heavy Rain" entry on grid day 5 or 7, got day5=[] day7=[...]`<br>`PROBE RESULT: 116 passed, 4 failed, 0 skipped` | `120 passed, 0 failed, 0 skipped` |
| M3 | Move clamp out of loop header | `const clampedEnd = lastGridDay;` (removes `Math.min(lastGridDay, GRID_DAY_COUNT)`) | (open — per plan, disclose if none) | **0 FAILED.** `PROBE RESULT: 120 passed, 0 failed, 0 skipped` — no scenario in the suite constructs an `end_date` whose resolved `gridEnd` exceeds `GRID_DAY_COUNT` (14), so removing the upper clamp is undetected by the current suite. | `120 passed, 0 failed, 0 skipped` (unchanged — mutation was already green) |
| M4 | Forward-align pin still holds | `anchorInfo.day1StartMs` instead of `anchorInfo.nominalStartMs` in both `_gridDayOf` calls | `merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day` | **1 FAILED** as expected: <br>`FAIL merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day: D-10: expected exactly one wpc-hazards "Heavy Rain" entry on grid day 2 with dimension heavy-precip, got []`<br>`PROBE RESULT: 119 passed, 1 failed, 0 skipped` | `120 passed, 0 failed, 0 skipped` |

**M1, M2 and M4 each produced at least one RED scenario, as required.** M3 produced zero — this is a genuine, disclosed coverage hole, not a fixture defect: `T-18-03`/`T-16-05`'s bound-safety constraint (the fourteen-day iteration cap) is enforced by `Math.min(lastGridDay, GRID_DAY_COUNT)`, but no probe scenario in the 120-scenario suite constructs a `wpc-hazards` feature whose `end_date` resolves to a `gridEnd` beyond day 14 — every fixture's `end_date` lands well inside the fourteen-day window. Per the plan's explicit instruction, this hole is disclosed here rather than closed with a new scenario in this plan.

After the final restore, `git diff --stat node_helper.js scripts/probe-payload-resilience.js` showed no output (clean — no mutation left in the tree), and `git status --short` was empty.

**Entering baseline:** `PROBE RESULT: 119 passed, 0 failed, 0 skipped` (measured at plan start, HEAD 2026-09-06).
**Leaving state:** `PROBE RESULT: 120 passed, 0 failed, 0 skipped`.

## Decisions Made
- D-21 (see above): inclusive `end_date` reading on the Hazards Outlook day-grid path, superseding 18-10's tolerant-of-both-conventions bound. Recorded verbatim in the plan's `<decision>` block and reproduced in the `node_helper.js` header comment above `const lastGridDay = gridEnd;`.

## Deviations from Plan

None — plan executed exactly as written, including the M3 disclosure the plan explicitly anticipated as a possible outcome ("If none does, that is a coverage hole ... must be disclosed in the SUMMARY rather than glossed — do not add a scenario for it in this plan; note it and move on").

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MERGE-01/`18-VERIFICATION.md` gap 1's CR-03 half is closed: the unified `days[]` grid now agrees with the legacy `hazardsOutlook` block on every calendar date a multi-day Precipitation span covers, mutation-proven.
- CR-04 (the elapsed-`EXPIRE_ISO` anchor half of the same gap) is deliberately NOT addressed here — it touches `_spcGridAnchor`, a different function with an independent mutation, and is planned separately as 18-14.
- The M3 coverage hole (no scenario exercises `end_date` resolving past grid day 14) is disclosed but not closed in this plan; it does not block MERGE-01 and is not required by this plan's success criteria, which name only the emission-bound reversal and its mutation-proof, not new bound-overflow coverage.
- Suite is green at 120 scenarios (up from 119 entering), ready for whichever plan runs next in wave 11+.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-06*
