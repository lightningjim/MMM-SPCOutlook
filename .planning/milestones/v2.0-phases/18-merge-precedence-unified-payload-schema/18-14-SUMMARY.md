---
phase: 18-merge-precedence-unified-payload-schema
plan: 14
subsystem: api
tags: [node_helper, spc-convective, grid-anchor, mutation-testing]

# Dependency graph
requires:
  - phase: 18-13
    provides: "_addHazardsOutlookGridEntries inclusive end_date reading (D-21), the other half of 18-VERIFICATION.md gap 1"
provides:
  - "_spcGridAnchor rejects an already-elapsed EXPIRE_ISO instead of anchoring the fourteen-day grid on it"
  - "gridAnchor: 'estimated' now covers absent, unparseable, AND elapsed EXPIRE_ISO"
  - "fallback log names both causes instead of misdescribing an elapsed-window fallback as an absent-field one"
affects: [18-VERIFICATION, 18-REVIEW]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "strict-inequality clock-vs-window guard on a remote-supplied timestamp before it anchors dependent computation"
    - "primary/control probe assertions run in independent try/catch blocks with collected errors, so an inversion mutation that breaks BOTH halves still surfaces the control's own failure message instead of being masked by whichever half throws first"

key-files:
  created: []
  modified:
    - node_helper.js
    - scripts/probe-payload-resilience.js

key-decisions:
  - "Reject an elapsed EXPIRE_ISO and fall through to the already-correct clock rule, rather than advancing the anchor by a day or widening tolerance with a grace window (per the plan's <decision> block)"
  - "Strict > (not >=): at the instant expireMs === now the outlook period has just ended, so the anchor it names is the previous period"

requirements-completed: [MERGE-01]

# Metrics
duration: ~25min
completed: 2026-09-06
---

# Phase 18 Plan 14: Reject an elapsed EXPIRE_ISO in `_spcGridAnchor` Summary

**`_spcGridAnchor`'s observed branch now rejects an `EXPIRE_ISO` whose window has already ended (`expireMs > this._nowMs()`), falling through to the existing clock fallback instead of anchoring the whole fourteen-day grid one day early while still reporting `gridAnchor: "observed"`.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-06T14:00:00Z (approximate)
- **Completed:** 2026-09-06T14:26:00Z
- **Tasks:** 2 completed
- **Files modified:** 2 (`node_helper.js`, `scripts/probe-payload-resilience.js`)

## Accomplishments

- Closed the CR-04 half of `18-VERIFICATION.md` gap 1: an already-elapsed `EXPIRE_ISO` no longer anchors the grid; the clock estimate is used instead, and `sources["spc-convective"].gridAnchor` correctly reads `"estimated"` in that case.
- Extended `_spcGridAnchor`'s JSDoc and reworded the once-per-process fallback log so `"estimated"` and its diagnostic both name all three causes (absent, unparseable, elapsed) instead of only the first two.
- Added a mutation-proven probe scenario (`merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated`) with a precondition guard, a still-in-force control, and a `requireLog` assertion on the reworded diagnostic.
- Fixed a pre-existing probe scenario (`merge-grid-anchor-observed-reads-spc-valid-and-expire`) that read the real system clock instead of pinning it, which had begun failing as real time crossed its hardcoded `EXPIRE_ISO` fixture — exactly the class of bug this plan's fix targets, now surfaced by the fix itself.

## Task Commits

1. **Task 1: Reject an already-elapsed EXPIRE_ISO and correct the fallback diagnostic** - `59af1c8` (fix)
2. **Task 2: Pin the elapsed-anchor degrade with a scenario, its still-in-force control, and a mutation proof** - `ea05c49` (test)

**Plan metadata:** (this commit, docs)

## Files Created/Modified

- `node_helper.js` - `_spcGridAnchor`'s observed branch guard changed from `if (Number.isFinite(expireMs))` to `if (Number.isFinite(expireMs) && expireMs > this._nowMs())` (line 2541); added a D-11/T-18-03 comment above it; extended the `@returns` JSDoc for `anchor`; reworded the `_loggedGridAnchorFallback` log line to name both absent/unparseable and already-elapsed causes.
- `scripts/probe-payload-resilience.js` - added `merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated` (two-run scenario with precondition guard, control, and log assertion); pinned the clock in the pre-existing `merge-grid-anchor-observed-reads-spc-valid-and-expire` scenario.

## Decisions Made

- **The guard's exact final form:** `if (Number.isFinite(expireMs) && expireMs > this._nowMs())`. Strict `>`, not `>=` — at the instant `expireMs === now` the outlook period has just ended, so the anchor it names is the previous period, and treating that instant as still-valid would be off by exactly one tick at the boundary. This matches the plan's `<decision>` block verbatim; no alternative (day-advance, grace window, second re-entry path) was adopted.
- **Reworded fallback log line (verbatim, as shipped):**
  `"MMM-SPCOutlook: SPC grid anchor unavailable (VALID_ISO/EXPIRE_ISO from the day-1 categorical outlook were absent/unparseable, or EXPIRE_ISO had already elapsed); falling back to the clock-derived estimate."`
- **Primary/control assertions run in independent try/catch blocks** rather than one linear sequence, because a strict-inequality inversion mutation misclassifies every case in the partition (both the elapsed and still-in-force sides flip), so a single linear throw would only ever surface the primary half's message and mask the control's own failure text. Errors from each half are collected and joined so both are visible in one FAIL line when both break.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Pinned the clock in a pre-existing probe scenario that read real system time**
- **Found during:** Task 1 verification (`node scripts/probe-payload-resilience.js` after the guard change)
- **Issue:** `merge-grid-anchor-observed-reads-spc-valid-and-expire` never pinned `helper._nowMs`, instead reading the real system clock. Its fixture's `EXPIRE_ISO` (`"2026-09-06T12:00:00Z"`) was in the future when the scenario was originally written, but real time had since crossed that boundary (current wall clock ~2026-09-06T14:xx UTC), so Task 1's new elapsed-window guard correctly classified this now-elapsed fixture as `"estimated"` where the scenario still asserted `"observed"`. This is precisely the class of defect the plan's fix targets — an unpinned clock made a previously-"observed" fixture silently decay into the exact failure mode being fixed.
- **Fix:** Added `helper._nowMs = () => Date.UTC(2026, 8, 5, 13, 0);` at the top of the scenario's `run`, matching the clock-pinning idiom every sibling scenario in the file already uses. This is strictly before the fixture's `EXPIRE_ISO`, so the scenario is deterministic and no longer decays with the passage of real time.
- **Files modified:** `scripts/probe-payload-resilience.js`
- **Verification:** `node scripts/probe-payload-resilience.js` returned to `PROBE RESULT: 120 passed, 0 failed, 0 skipped` after the fix, matching Task 1's acceptance criterion exactly.
- **Committed in:** `59af1c8` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Necessary for Task 1's acceptance criterion (`PROBE RESULT: 120 passed, 0 failed, 0 skipped`) to be met at all under the current real-world date; without it the suite would show 1 failure unrelated to any code defect in the guard itself, just an unpinned-clock test bug. No scope creep — fix is scoped to the exact file/task boundary already in `files_modified`.

## Issues Encountered

**Primary/control message masking under the inverted-guard mutation.** When first mutation-testing the guard inversion (`expireMs < this._nowMs()`), the scenario's original linear structure (await primary, assert, await control, assert) meant the primary half's assertion threw before the control half ever ran, so only the primary's failure text appeared in the `FAIL` line — even though the control half was, by the math of inverting a strict inequality across a two-case partition, guaranteed to also be wrong. This didn't fail the acceptance criteria on its own (a `FAIL` line for the scenario did appear), but it would not have let the SUMMARY show the control's own failure text as the plan's acceptance criteria requires ("the inverted-guard mutation must turn the CONTROL half red specifically"). Resolved by restructuring the scenario so primary and control assertions each run inside their own try/catch, with failures collected into an array and joined at the end — this let the control's own message (`control: expected a still-in-force EXPIRE_ISO to resolve "observed", got "estimated"`) appear in the same run where the primary's message also appears, verified below.

## Mutation Rows

**Mutation 1 — remove the elapsed-window guard** (`&& expireMs > this._nowMs()` deleted, leaving `if (Number.isFinite(expireMs))`):
- RED scenario: `merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated`
- Verbatim failure message: `FAIL merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated: CR-04: expected an elapsed EXPIRE_ISO to degrade to "estimated", got "observed"`
- Full count under mutation: `PROBE RESULT: 120 passed, 1 failed, 0 skipped`
- Restored count: `PROBE RESULT: 121 passed, 0 failed, 0 skipped`
- Only the primary half broke — the control's `EXPIRE_ISO` was never elapsed, so removing the guard doesn't change its (already-correct) `"observed"` outcome; this is expected, not a coverage gap.

**Mutation 2 — invert the guard** (`&& expireMs > this._nowMs()` changed to `&& expireMs < this._nowMs()`):
- RED scenarios: `merge-grid-anchor-observed-reads-spc-valid-and-expire`, `merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated`, `merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day` (collateral — these three all depend on the observed branch resolving correctly for a still-in-force window)
- Verbatim failure message for this plan's own scenario (both halves visible in one line, per the try/catch restructuring above): `FAIL merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated: CR-04: expected an elapsed EXPIRE_ISO to degrade to "estimated", got "observed" | control: expected a still-in-force EXPIRE_ISO to resolve "observed", got "estimated"`
- Full count under mutation: `PROBE RESULT: 118 passed, 3 failed, 0 skipped`
- Restored count: `PROBE RESULT: 121 passed, 0 failed, 0 skipped`
- The `control:`-prefixed half of the message is the CONTROL turning red specifically, as required — proving a fix that simply deleted/disabled the observed branch (rather than correctly gating it) could not pass this scenario.

**Entering/leaving suite figures for the plan as a whole:** entering 120 passed / 0 failed / 0 skipped (per the prior-wave context baseline); leaving 121 passed / 0 failed / 0 skipped (one new scenario added, one pre-existing scenario's clock-pinning bug fixed).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Both halves of `18-VERIFICATION.md` gap 1 (CR-03 in 18-13, CR-04 here) are now closed at the code and probe level. `18-VERIFICATION.md`'s recorded blocking status for gap 1 should be re-validated against this fix in the phase's next verification pass.
- No new blockers introduced. The `merge-grid-anchor-observed-reads-spc-valid-and-expire` clock-pinning fix removes a latent flakiness source that would otherwise have silently started failing again as real time advances past any future hardcoded `EXPIRE_ISO` fixture in this suite — worth a light audit of any other scenario reading `_nowMs()` without pinning it, though none surfaced during this plan's own verification runs.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: `node_helper.js`
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/18-merge-precedence-unified-payload-schema/18-14-SUMMARY.md`
- FOUND: commit `59af1c8` (Task 1)
- FOUND: commit `ea05c49` (Task 2)
- Final full-suite run: `node scripts/probe-payload-resilience.js` -> `PROBE RESULT: 121 passed, 0 failed, 0 skipped`, exit 0
