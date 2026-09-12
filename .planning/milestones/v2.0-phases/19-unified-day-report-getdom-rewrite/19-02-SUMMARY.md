---
phase: 19-unified-day-report-getdom-rewrite
plan: 02
subsystem: api
tags: [node_helper, spc-proximity, unified-grid, mutation-testing]

# Dependency graph
requires:
  - phase: 18-unified-payload-schema
    provides: the unified `days[]`/`summary`/`sources`/`advisories` payload and `_addSpcGridEntries`'s grid-day attachment loop
provides:
  - "days[1..3].proximity present on the unified grid, identical to the legacy day1/day2/day3 proximity block, derived once"
  - "proximity present on a NONE-risk day (D-08's proximity-only exception now has data)"
  - "three mutation-proven probe scenarios pinning the unified proximity path"
affects: [19-05-getdom-proximity-badges, 19-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single named-const derivation spread into two consumers (spcLocals + legacy literal) to satisfy the WR-06 twin-drift rule"
    - "Probe fixture ring-identity trick: freshFetch preserves object reference identity end-to-end, so a scenario-local turfStub.pointInPolygon override can distinguish an 'active' polygon from a 'higher tier' polygon by array identity rather than real geometry"

key-files:
  created: []
  modified:
    - node_helper.js
    - scripts/probe-payload-resilience.js

key-decisions:
  - "Attachment site placed immediately after notes.noteReported and before the value/unmapped/floor logic, so it always runs whenever the containment guard (typeof day.risk === 'string') passes, regardless of downstream risk classification"
  - "Probe scenarios use installFetch/freshFetch (which preserves body object-reference identity), not installHttp (which JSON round-trips and would break the ring-identity pointInPolygon trick)"
  - "turfStub.pointToLineDistance overridden to a flat in-range constant per scenario, since only genuine 'higher tier, not yet inside' candidates ever reach it once the comparator/pointInPolygon gates are correct"

requirements-completed: [RPT-03, RPT-06]

# Metrics
duration: ~35min
completed: 2026-09-06
---

# Phase 19 Plan 02: Thread SPC proximity subtree into the unified grid Summary

**`days[1..3].proximity` now carries the exact same SPC proximity subtree as the legacy `dayN.proximity` block, derived once via three named consts and attached in `_addSpcGridEntries` above the no-risk floor gate, with three new mutation-proven probe scenarios pinning the path (suite 123 -> 126 passing).**

## Performance

- **Duration:** ~35 min
- **Started:** ~2026-09-06T21:03Z (after worktree branch reset to `f6fc111`)
- **Completed:** 2026-09-06T21:30:21-05:00 (last task commit)
- **Tasks:** 2 completed
- **Files modified:** 2

## Accomplishments
- `day1ProximitySubtree`, `day2ProximitySubtree`, `day3ProximitySubtree` are now the single derivation point for SPC proximity, spread into both `spcLocals.categorical[1..3]` (feeding the unified grid) and the legacy `day1`/`day2`/`day3` payload literals — zero duplicate `buildProximitySubtree` calls, legacy output byte-identical.
- `_addSpcGridEntries` attaches `gridDays[String(d)].proximity` above both the unmapped-passthrough branch and the no-risk floor gate, so a day whose convective risk resolves to `NONE` still carries its proximity subtree — the exact data D-08's proximity-only exception needs to render.
- Three new probe scenarios mutation-proven individually, each restored after producing a diagnosable RED failure, probe suite now at 126 passed / 0 failed / 0 skipped.

## Task Commits

Each task was committed atomically:

1. **Task 1: Derive each day's proximity subtree once and attach it to the unified grid** - `895ee48` (feat)
2. **Task 2: Mutation-prove the unified proximity path with three probe scenarios** - `321fe91` (test)

**Plan metadata:** (this commit, made by the orchestrator after merge — worktree mode does not update STATE.md/ROADMAP.md)

## Files Created/Modified
- `node_helper.js` - Introduced `day1ProximitySubtree`/`day2ProximitySubtree`/`day3ProximitySubtree` consts before `spcLocals` construction; spread them into `spcLocals.categorical[1..3]` and into the legacy `day1`/`day2`/`day3` literals (replacing the inline `buildProximitySubtree({...})` calls); extended the `spcLocals` JSDoc; added the `gridDays[String(d)].proximity` attachment in `_addSpcGridEntries`, placed after the `typeof day.risk !== "string"` containment guard and `notes.noteReported`, before the unmapped-passthrough branch and the `floor.categorical(value)` gate.
- `scripts/probe-payload-resilience.js` - Added three scenarios: `rpt03-unified-grid-carries-spc-proximity-subtree` (active risk + proximity, with an off-flag control), `rpt03-unified-grid-keeps-proximity-on-a-no-risk-day` (the D-08 enabler, with a zero-spc-convective-hazards precondition guard), `rpt03-unified-grid-day3-proximity-uses-the-cig-key-not-the-per-type-keys` (pins day 3's `cig`-only shape).

## Decisions Made
- The attachment site reads `spcLocals.categorical[d].proximity` (the already-spread value) rather than re-deriving from the three named consts inside `_addSpcGridEntries` — that function receives `spcLocals` as its only day-shaped input and has no access to the consts directly; this keeps the single-derivation invariant intact since `spcLocals.categorical[d].proximity` and `day1ProximitySubtree`'s `.proximity` key are the same object reference.
- Probe fixtures for proximity needed a way to make `evaluatePolygons`' and `computeProximity`'s shared `turfStub.pointInPolygon` global stub return different answers for different polygons in the same run (an "active/contained" polygon vs. a "higher-tier/not-contained" one) — solved by using `installFetch`/`freshFetch` (which passes the fixture body by direct object reference, per `freshFetch`'s `data: body`) and writing a scenario-local `pointInPolygon` override that compares `poly.__stubPoly[0]` against the fixture's own ring array by identity, reusing the module-level `SAMPLE_RING` as the shared "active" ring across all three new scenarios.

## Deviations from Plan

None - plan executed exactly as written. No auto-fixes were required; both tasks' verification commands passed on the first implementation attempt.

## Mutation Proofs (Task 2, D-10 requirement)

All three mutations were applied directly to `node_helper.js`, confirmed RED with a diagnosable failure message, then restored via `git checkout -- node_helper.js` (discarding only that file's uncommitted mutation, per the destructive-git-prohibition's sanctioned single-file restore) and the suite re-run to confirm return to green before the next mutation.

**Mutation 1 — moved the `gridDays[String(d)].proximity` assignment in `_addSpcGridEntries` to below the `if (!floor.categorical(value)) continue;` gate.**
- Observed RED: `FAIL rpt03-unified-grid-keeps-proximity-on-a-no-risk-day: days["1"].proximity expected present on a NONE-risk day, got undefined`
- Blast radius: 1/126 scenarios failed (only its own target).
- Restore confirmed: `126 passed, 0 failed, 0 skipped`.

**Mutation 2 — deleted the `...day1ProximitySubtree` spread from `spcLocals.categorical[1]`.**
- Observed RED (two failures):
  - `FAIL rpt03-unified-grid-carries-spc-proximity-subtree: out.days["1"].proximity expected a non-null object, got undefined`
  - `FAIL rpt03-unified-grid-keeps-proximity-on-a-no-risk-day: days["1"].proximity expected present on a NONE-risk day, got undefined`
- Blast radius: 2/126 scenarios failed — wider than "its own scenario" alone, but both failures are the two scenarios that legitimately depend on day 1's proximity subtree reaching `spcLocals.categorical[1]`; both messages are individually diagnosable. Accepted per the plan's own "more than its own target may fail" allowance (mirrors the Phase 18-07 precedent cited in the plan).
- Restore confirmed: `126 passed, 0 failed, 0 skipped`.

**Mutation 3 — changed `_addSpcGridEntries`'s day-3 attachment to read `spcLocals.categorical[1].proximity` instead of `day.proximity` (i.e. day 1's subtree const) when `d === 3`.**
- Observed RED: `FAIL rpt03-unified-grid-day3-proximity-uses-the-cig-key-not-the-per-type-keys: days["3"].proximity expected present, got undefined`
- Note on the exact failure shape: because scenario 3 does not fetch day 1's categorical URL (it is out of scope for that scenario and gets a hard-failure default), `spcLocals.categorical[1].proximity` is `undefined` in that run — so the mutation surfaced as "proximity missing entirely" rather than "proximity carries the wrong (day 1) shape." The failure is still directly attributable to the mutated line and unambiguous once traced.
- Blast radius: 1/126 scenarios failed (only its own target).
- Restore confirmed: `126 passed, 0 failed, 0 skipped`.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `days["1"]`, `days["2"]`, `days["3"]` now carry `proximity` whenever the legacy blocks do, including on a `NONE`-risk day — unblocks plan 19-05's `getDom()` proximity-badge rendering (RPT-03 detail sub-rows, RPT-06 PROXUI parity) since it can read `this.spcrisk.days[n].proximity` with no legacy fallback.
- Day 3's `cig`-only proximity shape (vs. days 1-2's `torCig`/`hailCig`/`windCig`) is now explicitly pinned by a probe scenario, closing the exact gap RESEARCH.md's Pitfall 1 warned a renderer would assume away.
- No blockers identified for downstream plans.

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: `node_helper.js`
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/19-unified-day-report-getdom-rewrite/19-02-SUMMARY.md`
- FOUND commit `895ee48` (Task 1)
- FOUND commit `321fe91` (Task 2)
- FOUND commit `b42efa9` (metadata)
