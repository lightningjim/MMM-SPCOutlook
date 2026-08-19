---
phase: 14-foundation-wpc-excessive-rainfall-outlook
plan: 05
subsystem: docs
tags: [uat, wpc-ero, fixtures, human-verification]
status: paused

# Dependency graph
requires:
  - phase: 14-01
    provides: "productRegistry.js buildArcGisQuery / PRODUCT_REGISTRY.excessiveRain"
  - phase: 14-03
    provides: "excessiveRain payload block, always present"
  - phase: 14-04
    provides: "showExcessiveRain toggle, ERO render block, extended no-risk gate"
provides:
  - "14-UAT-FIXTURES.md: turf-confirmed inside/outside coordinates, per-day expected tiers, four config scenarios"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixture generation reuses the exact PRODUCT_REGISTRY.excessiveRain.buildUrl / toValue / valueToTier / turf.booleanPointInPolygon the product itself uses, so fixtures cannot silently disagree with the implementation (T-14-02)"

key-files:
  created: [.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-UAT-FIXTURES.md]
  modified: []

key-decisions:
  - "Task 2 (checkpoint:human-verify, gate=blocking) NOT executed this run — plan explicitly requires it stay blocking regardless of workflow.auto_advance, because this project has no automated test framework and human observation is the only acceptance path for phase success criteria 1-4"

requirements-completed: []

# Metrics
duration: ~10min (Task 1 only; Task 2 pending)
completed: 2026-08-19
---

# Phase 14 Plan 05: WPC ERO UAT Fixtures and Human Verification Summary

**Task 1 complete: live-derived, turf-confirmed inside/outside ERO test coordinates and four ready-to-paste config scenarios written to `14-UAT-FIXTURES.md`. Task 2 (the blocking human-verification checkpoint covering all five ROADMAP Phase 14 success criteria) is PENDING — this plan is paused, not complete.**

## Performance

- **Duration:** ~10 min (Task 1 only)
- **Completed:** Task 1 only, 2026-08-19
- **Tasks:** 1 of 2 completed (1/2)
- **Files modified:** 1 new (`14-UAT-FIXTURES.md`)

## Status: PAUSED at blocking checkpoint

This plan has two tasks. Task 1 (`type="auto"`) is complete and committed. Task 2
(`type="checkpoint:human-verify"`, `gate="blocking"`) has **not** been executed. Per the plan's
own action text: "Do not proceed, do not mark the phase complete, and do not auto-approve — this
checkpoint is blocking regardless of `workflow.auto_advance`." No MagicMirror display is
reachable from this execution context, so criteria 1-4 (which require observing a live rendered
DOM) cannot be verified by this agent without fabricating an observation. This SUMMARY records
Task 1's real output and defers Task 2 to the developer.

## Task 1: Derive live inside/outside test coordinates and write the UAT fixtures

**Commit:** `7114afe` (docs)

Fetched all five live ERO layers via `PRODUCT_REGISTRY.excessiveRain.buildUrl(1..5)` at
2026-08-19T14:41:33.487Z and derived two coordinates, confirmed by the same
`turf.booleanPointInPolygon` containment check the backend's `extractPolygons`/`evaluatePolygons`
use:

- **Inside-polygon:** lat `31.88325443422137`, lon `-111.53990732097623` (southern Arizona) —
  confirmed inside at least one polygon on **all five** days (Day 1 `dn: 2`/SLGT, Days 2-5
  `dn: 1`/MRGL). Stronger than the plan's minimum requirement (only one day needed).
- **Outside-all-polygons:** lat `47.61`, lon `-122.33` (Seattle, WA) — re-confirmed outside
  every polygon on all five days at generation time (not reused from an earlier session's
  assumption), with non-null `valid_time` on every day.

Both the raw `turf.booleanPointInPolygon` output and the derived expected tier/text/color/
valid_time table for every day are recorded verbatim in `14-UAT-FIXTURES.md`, along with four
ready-to-paste `config.js` scenario blocks (Scenario 2 deliberately omits `showExcessiveRain`
entirely, verified by direct inspection of that scenario's code block).

**Old coordinates from `14-03-SUMMARY.md`** (lat `31.955228625073847`, lon `-111.58296797339065`)
were NOT reused as-is — per the plan's `<task_1_note>`, ERO polygons reissue on a cycle, so this
run re-derived from live geometry rather than trusting the earlier probe. The new point is in the
same general region (southern Arizona) but is a freshly-computed `turf.pointOnFeature()` result
against the current issuance's polygons, independently confirmed inside on all five days.

**Verification run (plan's exact `<verify>` command):**
```
test -f .../14-UAT-FIXTURES.md && echo "file exists"        -> file exists
grep -q 'showExcessiveRain' .../14-UAT-FIXTURES.md            -> match found (grep exit 0)
node -e '... buildUrl(1..5) ...'                              -> printed all 5 live URLs, no error
```
All three parts of the compound verify command passed as observed (not inferred).

**Acceptance criteria checked directly:**
- File exists with a generation timestamp — confirmed (`2026-08-19T14:41:33.487Z` in the file header).
- Inside coordinate: `turf.booleanPointInPolygon` returns `true` for at least one day (in fact all
  five), command output recorded in the fixture file — confirmed.
- Outside coordinate: returns `false` for all five days, output recorded — confirmed.
- Per-day expected tier for the inside location drawn from `{NONE, MRGL, SLGT, MDT, HIGH}`, at
  least one non-`NONE` — confirmed (all five are non-`NONE`: one `SLGT`, four `MRGL`).
- Every expected tier has a matching display text from the registry's `tierToText` map — confirmed
  (`Slight`/`Marginal` used verbatim from `eroTierToText`).
- All four scenario config blocks reference only real `defaults:` keys — confirmed by grepping the
  key set used (`lat`, `lon`, `extended`, `updateInterval`, `showExcessiveRain`) against
  `MMM-SPCOutlook.js`'s `defaults:` block (`lat`, `lon`, `extended`, `updateInterval`,
  `proximityWeighting`, `showExcessiveRain`) — all four fixture keys are a subset.
- Scenario 2's config block does not contain `showExcessiveRain` — confirmed by isolating that
  scenario's fenced code block and inspecting it directly (the two `showExcessiveRain` matches in
  that section are the heading and prose, not the code block).
- No source file modified: `git diff --name-only` before commit showed only the pre-existing
  unrelated `.idea/workspace-dialetics-safeBackup-0001.xml` deletion (noise present at session
  start, not touched by this task) plus the new fixtures file — no `.js` source file appears.

## Task 2: Human verification of the five phase success criteria — PENDING

**Status:** Not started. Blocking checkpoint, `gate="blocking"`.

This task requires a developer to run a live MagicMirror instance, apply each of the four fixture
config scenarios, restart the module between changes, and report pass/fail against all five
ROADMAP Phase 14 success criteria (payload-shape decoupling, toggle independence/default,
correct tier label vs. NOAA's public map, clean absence outside all polygons, and an `f=geojson`/
ETag-cache network trace). None of this is executable by this agent — it requires a physical or
emulated display, human visual confirmation, and cross-checking a public NOAA map by eye. The
full "what-built", numbered "how-to-verify" steps, and "resume-signal" text from the plan are
relayed verbatim in the checkpoint response accompanying this SUMMARY.

**Per-criterion pass/fail table:** not yet available — pending developer report per the plan's
`<output>` requirement. This SUMMARY will be superseded (or a Task 2 addendum will be added) once
the developer's per-criterion results are known.

## Deviations from Plan

None — Task 1 executed exactly as written, including the fresh-coordinate re-derivation the
`<task_1_note>` explicitly required.

## Issues Encountered

None for Task 1. Task 2 is intentionally unexecuted per the checkpoint contract — this is the
expected flow for a `gate="blocking"` human-verify task, not an error.

## User Setup Required

Yes — see Task 2 above. The developer must run a live MagicMirror instance with the four fixture
config scenarios and report per-criterion pass/fail.

## Next Phase Readiness

- Phase 14 is **not** complete. `14-UAT-FIXTURES.md` is ready for the developer to use.
- Once the developer reports pass/fail for all five criteria, a continuation run should append the
  results to this SUMMARY (or a Task 2 addendum) and only then can the phase be marked complete.
- No blockers beyond the pending human verification itself.

---
*Phase: 14-foundation-wpc-excessive-rainfall-outlook*
*Task 1 completed: 2026-08-19 — Task 2 pending developer sign-off*

## Self-Check: PASSED (Task 1 scope only)

- FOUND: `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-UAT-FIXTURES.md`
- FOUND: commit `7114afe` (Task 1)
- Task 2: not applicable — correctly unexecuted per blocking-checkpoint contract
