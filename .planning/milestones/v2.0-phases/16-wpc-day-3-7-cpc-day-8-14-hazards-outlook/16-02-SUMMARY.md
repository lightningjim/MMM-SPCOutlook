---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
plan: 02
subsystem: backend
tags: [node_helper, date-bucketing, geometry, hazards-outlook]
dependency-graph:
  requires: []
  provides:
    - "_nowMs() clock seam"
    - "_todayUtcMs() / _hazardDayOffset() / _utcDateString() UTC date arithmetic"
    - "_isFullNominalWindow() D-04 exact-alignment guard"
    - "_bucketHazardMatch() per-feature day/window router"
    - "evaluatePolygonsCollectAll() collect-all point-in-polygon evaluator"
    - "_loggedUnmappedHazardLabels once-per-process ledger (init in start())"
  affects:
    - "node_helper.js (16-03's fetch/dispatch/cache runner will call these helpers)"
tech-stack:
  added: []
  patterns:
    - "Clock seam (_nowMs) restored automatically by the probe harness's ORIGINAL_SEAMS mechanism, no harness change needed"
    - "Per-item containment (CR-02) extended one level deeper into collect-all containment and per-feature date bucketing"
key-files:
  created: []
  modified:
    - node_helper.js
decisions:
  - "Combined Task 1 (date helpers) and Task 3 (_bucketHazardMatch) into a single commit — see Deviations"
metrics:
  duration: "~35 minutes"
  completed: "2026-08-26"
---

# Phase 16 Plan 02: Hazards Outlook Bucketing Primitives Summary

Added the two genuinely new pure-function primitives this phase needs — the UTC
date-bucketing arithmetic (`_nowMs`/`_todayUtcMs`/`_hazardDayOffset`/`_utcDateString`/
`_isFullNominalWindow`/`_bucketHazardMatch`) and the collect-all point-in-polygon evaluator
(`evaluatePolygonsCollectAll`) — as independently testable sibling methods on `node_helper.js`,
with no fetch, dispatch, or payload assembly (that is 16-03's job).

## What Was Built

**Task 1 — UTC date-bucketing helpers and the `_nowMs` clock seam** (`node_helper.js`):
- `_nowMs()` — a one-line `Date.now()` seam, restored automatically between probe scenarios
  by the existing `ORIGINAL_SEAMS` mechanism in `scripts/probe-lib/module-stubs.js`. Exists so
  a probe can advance the simulated clock without touching the system clock — the phase's
  highest-risk regression (day-offset drift on a cache hit) is untestable without it.
- `_todayUtcMs()` — UTC midnight of the current day, derived from `_nowMs()`, using only
  `Date.UTC()`/`getUTC*()` getters.
- `_hazardDayOffset(epochMs, todayUtcMs)` — signed day offset via `Math.round((epochMs -
  todayUtcMs) / MS_PER_DAY)`. Added a new module-level `MS_PER_DAY` constant (none existed).
- `_utcDateString(epochMs)` — `YYYY-MM-DD` UTC calendar date, zero-padded, `null` on a
  non-finite input.
- `_isFullNominalWindow(offsetStart, offsetEnd, dayRange)` — the D-04 LOCKED exact-alignment
  reading: `offsetStart === dayRange[0] && offsetEnd === dayRange[1]`, not a duration check.
- `start()` now initializes `this._loggedUnmappedHazardLabels = new Set()` beside
  `_unusableFeatureCount`/`_oldestStaleAt`, so `resetHelper` clears the D-11 once-per-process
  unmapped-label ledger between probe scenarios.

**Task 2 — `evaluatePolygonsCollectAll(items, loc)`** (`node_helper.js`, immediately after
`evaluatePolygons`, which is unmodified): iterates `items`, calls
`turf.booleanPointInPolygon` inside a per-item `try/catch`, pushes every containing item onto
a `hits` array, and returns the full set — not a single max-reduced winner. A caught throw
logs via `Log.error`, increments `this._unusableFeatureCount`, and skips only that item
(CR-02, extended one level deeper than `evaluatePolygons` ever needed, since D-02 makes a day
a set of hazards rather than one winner).

**Task 3 — `_bucketHazardMatch(match, layer, todayUtcMs, dayBuckets, windowEntries)`**
(`node_helper.js`, immediately after the Task 1 date helpers): routes one normalized
`{label, startDate, endDate, idpFiledate}` match into either the per-day bucket grid or the
window band, mutating both accumulators in place. Malformed or inverted-span matches are
contained (returned early) without throwing or logging. Temperature/Wildfire-Drought layers
route unconditionally to the window band (HAZ-02); Precipitation features spanning their
layer's exact nominal window also route to the window band (D-04 guard); all other
Precipitation features spread across `dayBuckets[offsetStart..offsetEnd]`, clamped at the loop
header to `[3, 14]` (T-16-05) so a hostile `[-1e9, 1e9]` span cannot iterate unbounded.

## Verification Performed

All automated `<verify>` commands from the plan were run and observed to print `OK` or the
expected pass counts — not inferred from code review:

- Task 1 assertion script (clock seam, UTC arithmetic, D-04 LOCKED reading, `start()` reset
  behavior): **OK**
- Task 1 grep gate (no `getFullYear(`/`getMonth(`/`getDate(`/`getHours(`/`new Date(<digit>` in
  the new date helpers' bodies, comments stripped): **OK**
- `grep -c "require(\"moment\")\|require('moment')" node_helper.js`: **0**
- Task 2 assertion script (D-02 full containing set, CR-02 per-item isolation, control
  assertion, empty-input case): **OK**
- Task 2 signature-preservation check (`evaluatePolygons(items, loc, comparator)` unchanged in
  the diff): **0** changed occurrences, confirming no modification
- Task 3 assertion script (D-04 spread, D-04 full-window guard, LOCKED exact-alignment reading
  for an off-window 5-day span, HAZ-02 unconditional window routing for both `temperature` and
  `wildfireDrought`, D-06 observed-span + date strings, 3..14 grid clamp, five malformed-input
  containment cases): **OK**
- T-16-05 clamp check (`[1971, 2200]` span, 229 years): completed in **0ms**, produced exactly
  **12** day keys (not thousands), confirming the loop header is clamped, not filtered inside
  the body
- `_bucketHazardMatch` body grep (no `sort(`/`row.order`, no `.feature`/`.properties`
  references): **OK**
- Full probe suite (`node scripts/probe-payload-resilience.js`) run after every task: **48
  passed, 0 failed, 0 skipped**, both before and after each edit — no regression in any
  existing scenario
- Plan-level verification: `node_helper.js` loads with no syntax/reference errors (see
  Deviations for the loader substitution this required in this sandbox)

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Worktree had no `node_modules`**
- **Found during:** Task 1, first verification attempt
- **Issue:** This worktree checkout has no `node_modules` directory (it is untracked in the
  parent repo and git worktrees do not copy untracked files). Running any verification command
  failed immediately with `Cannot find module '@turf/turf'` (and similar) before reaching any
  of this plan's code.
- **Fix:** Symlinked `node_modules` from the parent repository's checkout
  (`/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/node_modules`) into this worktree.
  This is not a package install — it reuses dependencies already installed and audited in the
  parent checkout — and the symlink is untracked, so it cannot be committed.
- **Files modified:** none (symlink only, outside git)
- **Commit:** n/a (untracked)

**2. [Rule 3 - Blocking issue] No MagicMirror installation on this machine, so `require("node_helper")` cannot resolve outside the probe harness**
- **Found during:** Task 1, running the plan's literal `node -e "require('./node_helper.js')..."` verification command
- **Issue:** `node_helper.js`'s first line is `require("node_helper")`, which resolves against
  a real MagicMirror core installation at runtime (on the Raspberry Pi target). No MagicMirror
  installation exists anywhere on this development machine, and `node_helper` is not an npm
  package in `node_modules`, so the plan's verification commands as literally written
  (`node -e "require('./node_helper.js')..."`) fail with `Cannot find module 'node_helper'`
  before reaching any of this plan's actual assertions — a pre-existing environment gap
  unrelated to any change in this plan.
- **Fix:** Ran every verification command with one extra line prepended:
  `require('./scripts/probe-lib/module-stubs.js').installStubs();` — this is the codebase's
  own sanctioned mechanism for loading `node_helper.js` standalone (used internally by
  `loadNodeHelper()`, which Task 2's own `<verify>` command already calls directly), not an
  ad-hoc workaround. Every assertion in every verify command then ran and printed its expected
  output. `node_helper.js` itself needed no change for this.
- **Files modified:** none (test invocation only)
- **Commit:** n/a

### Process Deviations

**Combined Task 1 and Task 3 into one commit.** Both were added as adjacent additions in the
same method-neighborhood of `node_helper.js` (`_bucketHazardMatch` is specified to sit
"immediately after the Task 1 date helpers"), and were implemented in a single `Edit` call
before the first commit checkpoint. The commit `8b9b675` therefore covers both Task 1's five
date helpers plus the `start()` reset and Task 3's `_bucketHazardMatch`. All of Task 1's and
Task 3's individual `<verify>` commands were run and passed independently after the combined
commit, so no verification coverage was lost — only the one-commit-per-task granularity was
collapsed to two commits for three tasks. Task 2 (`evaluatePolygonsCollectAll`) was committed
separately as planned.

## Assumption Drift (advisory)

None material — implementation follows the plan's `<action>` text and 16-CONTEXT.md's D-03,
D-04, D-06, D-11, HAZ-01, HAZ-02, T-16-05, T-16-06, T-16-07 verbatim.

## Known Stubs

None. This plan adds pure, fully-implemented helper functions with no placeholder behavior —
they are not yet called by any runner (that wiring is 16-03), which is the plan's explicitly
stated scope boundary, not a stub.

## Threat Flags

None new. This plan implements exactly the mitigations the plan's own `<threat_model>` assigns
to `_bucketHazardMatch` (T-16-05, clamped loop bounds) and `evaluatePolygonsCollectAll`
(T-16-06, per-item try/catch) — no additional network endpoints, auth paths, or trust-boundary
surface is introduced.

## Self-Check: PASSED

- `node_helper.js` exists and contains `evaluatePolygonsCollectAll`: confirmed via
  `grep -c evaluatePolygonsCollectAll node_helper.js` (see below)
- Commit `8b9b675` exists in `git log`: confirmed
- Commit `0e3f2a0` exists in `git log`: confirmed
