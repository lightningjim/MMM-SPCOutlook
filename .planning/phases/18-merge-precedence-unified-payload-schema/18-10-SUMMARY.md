---
phase: 18-merge-precedence-unified-payload-schema
plan: 10
subsystem: testing
tags: [probe-suite, merge-precedence, mutation-testing, hazards-outlook, spc-outlook, gap-closure]

# Dependency graph
requires:
  - phase: 18-08
    provides: the merge-grid-* scenario family idiom (pinned clock, resetHelper/resetLogs, precondition guard, primary assertion, control assertion) and 116 mutation-proven scenarios
provides:
  - "Corrected emission bound in _addHazardsOutlookGridEntries (Math.max(gridStart, gridEnd - 1)) that tolerates both the inclusive/zero-duration and exclusive end_date conventions the live feed mixes"
  - "Two new mutation-proven probe scenarios (merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day, merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day) built on the live-captured feature values"
  - "The deterministic replay of the live MERGE-01 defect (Task 1's pre-fix RED line), standing evidence for plan 18-12's criterion 1 re-validation"
affects: [18-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Live-value-literal fixtures: the exact live-captured epoch value (1788998400000) is used verbatim rather than recomputed from a Date.UTC expression, so the fixture cannot silently drift from the captured defect it reproduces"
    - "Two-phase run/control closure with the second run in a SEPARATE poll (never a combined feature collection), because _addHazardsOutlookGridEntries dedupes by (source, label) within a grid day and a single combined poll would collapse two same-label features and make the control vacuous"

key-files:
  created: []
  modified:
    - node_helper.js
    - scripts/probe-payload-resilience.js

key-decisions:
  - "Reworded the new node_helper.js comment block to avoid literally quoting the expression 'Math.max(gridStart, gridEnd - 1)' inside prose, so the acceptance criterion's grep count (expects exactly 1 occurrence, the code line itself) is not inflated by the comment's own explanation of that code"
  - "Trimmed the replacement comment block to fit the plan's 20-changed-line diff budget (final diff: 11 insertions, 7 deletions = 18 changed lines) while still covering the disproven upstream-convention claim, the Math.max rationale, the _bucketHazardMatch mirror, and the T-18-03/T-16-05 clamp-placement rule"

patterns-established:
  - "A grid-emission bound must be verified against both conventions a live feed can mix, not the single convention the fixture suite historically encoded — Math.max(gridStart, gridEnd - 1) collapses to gridStart on a zero-duration span and to the prior gridEnd - 1 behavior on every wider span, so no existing exclusive-convention fixture needed to change"

requirements-completed: [MERGE-01]

# Metrics
duration: ~1h
completed: 2026-09-06
---

# Phase 18 Plan 10: MERGE-01 Gap Closure — Emission Bound Fix and Live-Shaped Probe Scenarios Summary

**Fixed `_addHazardsOutlookGridEntries`'s emission bound (`Math.max(gridStart, gridEnd - 1)`) to stop silently dropping a live-observed `wpc-hazards` Precipitation feature with `start_date === end_date`, and added two mutation-proven probe scenarios built on the 2026-09-05 Kotzebue, AK live capture, raising the suite from 116 to 118 passing scenarios.**

## Performance

- **Duration:** ~1h
- **Started:** 2026-09-05 (following 18-09's live capture and this plan's own context load)
- **Completed:** 2026-09-06T00:24:52Z
- **Tasks:** 3 completed
- **Files modified:** 2 (`node_helper.js`, `scripts/probe-payload-resilience.js`)

## Accomplishments

- **Task 1:** Added two scenarios to `scripts/probe-payload-resilience.js` — `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day` (built on the live-captured feature: objectid 7917, "Heavy Rain", `start_date === end_date === 1788998400000`) and `merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day` (the regression guard for the exclusive convention). Ran against the then-unfixed `node_helper.js`: Scenario A reproduced the live defect as a RED, Scenario B stayed GREEN, confirming both fixtures were not vacuous. 116 → 117 passed, 1 failed.
- **Task 2:** Changed exactly one expression in `_addHazardsOutlookGridEntries` — `const lastGridDay = gridEnd - 1;` → `const lastGridDay = Math.max(gridStart, gridEnd - 1);` — and rewrote the comment block above it to state the disproven single-convention assumption, citing `18-LIVE-CAPTURE.md`. Scenario A flipped RED to GREEN; all 116 pre-existing scenarios plus both new ones stayed/turned green. 117 → 118 passed, 0 failed.
- **Task 3:** Mutation-proved both new scenarios (M1: restore the exact pre-fix `gridEnd - 1` expression; M2: switch wholesale to `Math.max(gridStart, gridEnd)`). Both produced genuine, diagnosable RED results; both were reverted, restoring the suite to `118 passed, 0 failed, 0 skipped` with an empty `git diff node_helper.js`.

## Task Commits

1. **Task 1: Add the two live-shaped scenarios and record them RED against the unfixed code** - `627164c` (test)
2. **Task 2: Correct the emission bound in `_addHazardsOutlookGridEntries`** - `87f41dd` (fix)
3. **Task 3: Mutation-prove both new scenarios** - no code commit; every mutation was applied to `node_helper.js`, run, observed, and reverted. The working tree carries none of them — the mutation table below, recorded in this SUMMARY, is the task's deliverable (matching 18-07/18-08's own precedent).

**Plan metadata:** (this commit) `docs(18-10): complete MERGE-01 gap closure plan`

## Files Created/Modified

- `node_helper.js` — `_addHazardsOutlookGridEntries`'s `lastGridDay` expression changed from `gridEnd - 1` to `Math.max(gridStart, gridEnd - 1)`; the comment block above it rewritten to document the live-observed dual-convention upstream feed. 18 changed lines (11 insertions, 7 deletions), touching only this one function's comment block and `lastGridDay` line.
- `scripts/probe-payload-resilience.js` — Appended two scenarios (165 insertions) after `merge-parity-unified-days-agree-with-legacy-blocks`: the live-shaped `start_date === end_date` reproduction and the multi-day exclusive-span regression guard.

## Task 2 Arithmetic Verification

The four arithmetic cases from the plan's `<action>`, confirmed against the actual probe run (not merely asserted), all using this poll's anchor `nominalStartMs = 2026-09-05T12:00:00.000Z`:

| Case | `gridStart` | `gridEnd` | `lastGridDay` (post-fix) | Confirmed via |
|---|---|---|---|---|
| Live inclusive shape (start = end = `1788998400000`) | 6 | 6 | `max(6, 5) = 6` | `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day` primary run — grid day 6 only, matches `PASS` |
| Exclusive single day (Sep 10 → Sep 11) | 6 | 7 | `max(6, 6) = 6` | Same scenario's control run — grid day 6 only, matches `PASS` |
| Exclusive two-day (Sep 10 → Sep 12) | 6 | 8 | `max(6, 7) = 7` | `merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day` — grid days 6 and 7, day 8 empty, matches `PASS` |
| Pre-existing `merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day` fixture (Sep 6 → Sep 7) | 2 | 3 | `max(2, 2) = 2` | Stayed `PASS`, unchanged from before this plan |

## Mutation Inventory (Task 3)

Each mutation was applied one at a time to `node_helper.js`, the full suite was run, the exact `FAIL` line(s) recorded verbatim below, the mutation reverted, and the suite re-run to confirm `118 passed, 0 failed, 0 skipped` before moving to the next mutation.

| Scenario | File:line mutated | Mutation description | Verbatim `FAIL` message | Restored |
|---|---|---|---|---|
| `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day` (M1) | `node_helper.js`, the `lastGridDay` line in `_addHazardsOutlookGridEntries` | Replaced `Math.max(gridStart, gridEnd - 1)` with `gridEnd - 1` — the exact pre-fix expression, reproducing the shipped production defect verbatim | `FAIL merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day: MERGE-01: expected exactly one wpc-hazards "Heavy Rain" entry on grid day 6 with dimension heavy-precip and color 267300, got []` | Yes |
| `merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day` (M2) | Same `lastGridDay` line | Replaced `Math.max(gridStart, gridEnd - 1)` with `Math.max(gridStart, gridEnd)` — the "switch wholesale to inclusive" error the gap report forbids | `FAIL merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day: expected NO wpc-hazards "Heavy Rain" entry on grid day 8 (an always-inclusive bound would populate this day), got [{"dimension":"heavy-precip","source":"wpc-hazards","label":"Heavy Rain","text":"Heavy Rain","value":null,"color":"267300","suppressedBy":null}]` | Yes |

**M1's effect on Scenario B (cross-check note):** `merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day` stayed **GREEN** under M1, as the plan requires — confirming the two scenarios cover distinct halves of the fix rather than being redundant. (Verified directly: under M1, only `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day` appeared in the `FAIL` output; the exclusive-span scenario was not among the failures.)

**M2's blast radius (as predicted, and recorded rather than narrowed):** M2 also failed `merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day`'s control assertion (`control: expected the Sep 5 00Z-00Z feature on grid day 1 only, got day1=[...] day2=[...]`) and Scenario A's own exclusive-convention control run (`control: expected the exclusive-convention Sep 10-11 feature on grid day 6 only, got day5=[] day6=[...] day7=[...]`) — both are the exclusive-single-day case gaining a spurious trailing day under a wholesale-inclusive bound, exactly the failure mode M2 exists to catch. `PROBE RESULT: 115 passed, 3 failed, 0 skipped` under M2.

**Task 1's pre-fix RED, quoted verbatim as the deterministic replay of the 2026-09-05 live capture** (recorded before any product-code fix existed, matching Task 1's `<done>` requirement and standing evidence for plan 18-12's criterion 1 re-validation):

```
FAIL merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day: MERGE-01: expected exactly one wpc-hazards "Heavy Rain" entry on grid day 6 with dimension heavy-precip and color 267300, got []
```

(Identical to M1's message above, since M1 mechanically restores the exact pre-fix state Task 1 observed — this identity is itself confirmation that M1 targets the correct line.)

Final suite state after all mutation cycles and the post-Task-2 fix: `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 118 passed, 0 failed, 0 skipped`, exit 0. `git diff node_helper.js` after the last restore: empty (0 lines).

## Acceptance Criteria Verification

- `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 118 passed, 0 failed, 0 skipped`, exit 0.
- `node scripts/probe-payload-resilience.js | grep -c '^PASS merge-grid-hazards-'` → `3`.
- `grep -c 'Math.max(gridStart, gridEnd - 1)' node_helper.js` → `1`.
- `grep -c 'const lastGridDay = gridEnd - 1;' node_helper.js` → `0`.
- `sed -n '2835,2925p' node_helper.js | grep -c 'Math.min(lastGridDay, GRID_DAY_COUNT)'` → `1` (header clamp survived).
- `sed -n '2835,2925p' node_helper.js | grep -v '^\s*//' | grep -c 'exclusive end'` → `0` (superseded assertion no longer stated as executable/load-bearing).
- `git diff --stat node_helper.js` → 1 file changed, 18 changed lines (11 insertions, 7 deletions) — within the plan's ≤20-line budget, touching only the comment block and the `lastGridDay` line.
- `git diff --stat fc867ca -- node_helper.js scripts/probe-payload-resilience.js` → exactly these two files (176 insertions, 7 deletions total across the plan).
- `awk '/name: "merge-grid-hazards-start-equals-end/,/^  },/' scripts/probe-payload-resilience.js | grep -c 'precondition failed:'` → `2`; `... | grep -c 'control:'` → `2`.
- `awk '/name: "merge-grid-hazards-multi-day-exclusive/,/^  },/' scripts/probe-payload-resilience.js | grep -c 'precondition failed:'` → `1`; `... | grep -c 'control:'` → `2`.
- Both new scenarios call `assertPayloadIntact`/`assertHazardsBlockIntact` (2 occurrences each).
- `grep -c '1788998400000' scripts/probe-payload-resilience.js` → `2` (the live epoch value used literally for both `start_date` and `end_date`).

## Decisions Made

See `key-decisions` in the frontmatter. In brief: two mechanical adjustments were needed to satisfy the plan's own literal grep-based acceptance criteria without changing the substance of the fix — the comment text was reworded so it does not itself contain a second literal occurrence of the changed expression, and the comment was trimmed to fit the plan's explicit 20-changed-line diff budget. Neither adjustment changed the fix's logic, the arithmetic verified above, or the mutation results.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues were found beyond the plan's own acceptance-criteria tuning documented above (which is a wording/formatting fit, not a Rule 1/2/3 deviation).

**Total deviations:** 0
**Impact on plan:** Plan executed as specified; only cosmetic comment-wording adjustments were needed to satisfy the plan's own literal grep-based acceptance criteria (see Decisions Made).

## Assumption Drift (advisory)

- **Found during:** Task 2 acceptance-criteria verification.
- **Planned:** The acceptance criterion `sed -n '2835,2925p' node_helper.js | grep -c 'anchorInfo.day1StartMs'` is `0`, offered as evidence "D-10's nominal anchor was not disturbed."
- **Actual:** This count is `1`, both before and after Task 2's edit — the pre-existing D-10 comment at node_helper.js:2868-2870 (unmodified by this plan) reads "using the NOMINAL start, never `anchorInfo.day1StartMs`", a negative reference that predates this plan entirely.
- **Why:** The criterion's grep pattern cannot distinguish "uses day1StartMs" from "explicitly says it must never use day1StartMs" — the pre-existing comment's negation trips the same string match. The actual code (`gridStart`/`gridEnd` both still derived from `anchorInfo.nominalStartMs`, confirmed by the arithmetic table above and the diff showing zero touches to that comment line) satisfies the invariant the criterion intended to check. This is a plan-authoring artifact, not a code regression — recorded here per the advisory protocol rather than silently reinterpreting the acceptance criterion.

## Issues Encountered

None beyond the acceptance-criteria wording/budget adjustments documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- ROADMAP Phase 18 success criterion 1 (MERGE-01) now has both a corrected production fix and a mutation-proven probe scenario built on the live-captured feature values; plan 18-12 can re-run the same live-value fixture against the fixed code to re-validate criterion 1 without a second live poll.
- `node_helper.js`'s `_addHazardsOutlookGridEntries` tolerates both endpoint conventions the live feed mixes; every pre-existing exclusive-convention fixture (all 116 from before this plan) remained green throughout.
- The suite stands at 118 scenarios, 0 failed, 0 skipped.
- No blockers introduced by this plan. PERF-03's cold-cache Pi measurement remains the only open milestone-close item, unaffected by this plan.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: node_helper.js
- FOUND: scripts/probe-payload-resilience.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-10-SUMMARY.md
- FOUND: 627164c (Task 1 test commit)
- FOUND: 87f41dd (Task 2 fix commit)
- Re-ran suite: PROBE RESULT: 118 passed, 0 failed, 0 skipped
