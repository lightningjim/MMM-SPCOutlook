---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
plan: 04
subsystem: frontend
tags: [MMM-SPCOutlook.js, hazards-outlook, no-risk-gate, config, wpc, cpc]

# Dependency graph
requires:
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-03)
    provides: "this.spcrisk.hazardsOutlook payload block (day3..day14 + windowBand), always present regardless of the toggle"
provides:
  - "defaults.showHazardsOutlook / defaults.showDrought (both default false, CFG-01/D-10)"
  - "buildRequestPayload().products.showHazardsOutlook / .showDrought (WR-15 single write site)"
  - "hazardsOutlookHasAnyDay(block) — true when any day3..day14 entry's hazards array is non-empty"
  - "hazardsOutlookHasWindowEntries(block) — true when windowBand is a non-empty array"
  - "two independent && gate terms in getDom's no-risk short-circuit, one per predicate, both gated on showHazardsOutlook"
affects: [16-05, 16-06, 16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two independent gate terms for two independently renderable things — never one OR'd predicate — the structural fix for the Phase 15 getDom no-risk gate regression class"
    - "WR-08 span derivation: day keys read off the block's own keys via /^day\\d+$/, never a literal 3..14 range, disjoint from dayRiskCount's /^day\\d+Risk$/"

key-files:
  created: []
  modified:
    - MMM-SPCOutlook.js

key-decisions:
  - "None - plan executed exactly as written"

patterns-established:
  - "hazardsOutlookHasAnyDay / hazardsOutlookHasWindowEntries predicate pair sits beside dayRiskCount/blockHasRisk, same version-skew tolerance discipline (missing/non-object block -> false, non-array hazards/windowBand -> skipped, never throws)"

requirements-completed: [HAZ-01, HAZ-02]

# Metrics
duration: ~25min
completed: 2026-08-26
---

# Phase 16 Plan 04: Hazards Outlook Frontend Wiring Summary

**Wired `showHazardsOutlook`/`showDrought` into the frontend config surface and, critically, into `getDom`'s no-risk short-circuit as two independent `&&` terms — one for the day3-day14 grid, one for the window band — closing the exact regression class that made Phase 15's MPD invisible, now proven against this product by three restored mutations.**

## Performance

- **Duration:** ~25 min
- **Completed:** 2026-08-26
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`MMM-SPCOutlook.js`)

## Accomplishments
- `defaults.showHazardsOutlook` and `defaults.showDrought` both default `false` (CFG-01, D-10), verified via `loadFrontendModule()` reading `f.defaults` directly
- Both fields round-trip through `buildRequestPayload()`'s single `products:` write site (WR-15) — one control assertion proves `true` travels as `true` and a second proves `false` travels as `false`, not a hardcoded value
- `showDrought: this.config.showDrought` appears exactly once in the file (`grep -c` == 1), confirming no second write site was introduced
- `hazardsOutlookHasAnyDay(block)` derives the day span from the block's own `/^day\d+$/` keys, never a literal `3..14` range, and is regex-disjoint from `dayRiskCount`'s `/^day\d+Risk$/` (no `Risk` suffix on this product's nested shape) — confirmed by inspection, not just by the plan's assertion
- Both predicates tolerate a missing/non-object block, a missing/non-array `hazards`, and a missing/non-array `windowBand`, returning `false` rather than throwing — verified directly: a payload with `hazardsOutlook` deleted, and a payload with `{day3: 'junk', windowBand: 'junk'}`, both render `"No Severe Weather Risk"` cleanly with no throw out of `getDom`
- The two new gate terms are written as **two separate `&&`-joined lines**, not one OR'd predicate — verified by a source-level grep that fails the check if `hazardsOutlookHasAnyDay(...) || hazardsOutlookHasWindowEntries(...)` appears anywhere in non-comment source
- Both new gate terms are placed immediately after the WSSI term and before the advisory term, each carrying its own `this.config.showHazardsOutlook &&` guard (WR-09) so content the user disabled cannot disqualify the short-circuit
- `dayRiskCount` and `blockHasRisk` are byte-unchanged — confirmed via `git diff MMM-SPCOutlook.js`, which shows no line inside either function body, only additions before/after
- Probe suite stayed 48/48 passing throughout; no existing scenario sets `showHazardsOutlook`, so this plan's new code paths were dormant in every scenario except the plan's own dedicated fixture

## Task Commits

Each task was committed atomically:

1. **Task 1: Config defaults and request payload** - `c951c45` (feat)
2. **Task 2: The two no-risk gate predicates and their two independent gate terms** - `d9bdbc1` (feat)

## Mutation Proof (Task 2, recorded per plan's `<output>` requirement)

All three mutations were applied to a working-tree copy, run against the plan's Task 2 automated check, confirmed RED with the exact required message, then restored from a byte-identical backup (verified by `md5sum` before and after each restore) before the next mutation.

**Mutation 1 — deleted the `hazardsOutlookHasWindowEntries` gate term line.**
RED, exact message:
```
HAZ-02: window-band-only content short-circuited to a confident all-clear — this is the Phase 15 getDom regression, reproduced
```
Restored. Confirmed identical via `md5sum` match against the pre-mutation backup.

**Mutation 2 — deleted the `hazardsOutlookHasAnyDay` gate term line.**
RED, exact message:
```
HAZ-01: a day-grid hazard short-circuited to a confident all-clear
```
Restored. Confirmed identical via `md5sum` match.

**Mutation 3 — changed `hazardsOutlookHasWindowEntries` to `return true;` unconditionally.**
RED, on the CONTROL assertion, exact message:
```
CONTROL FAILED: an empty hazards block no longer short-circuits — the gate terms fire unconditionally and the positive assertions below prove nothing
```
Restored. Confirmed identical via `md5sum` match.

After the third restore, both Task 2 automated checks were re-run and printed `OK`, and the full probe suite was re-run and reported 48/48 passing before the Task 2 commit was made.

## Decisions Made
None - followed plan as specified. The gate-term placement (after WSSI, before advisory), the two-predicate/two-term structure (not one OR'd predicate), and the WR-08 key-derivation discipline were all specified explicitly in the plan's `<action>` text and implemented as written.

## Deviations from Plan

### Auto-fixed Issues

None. Both tasks executed exactly as the plan's `<action>` text specified — insertion points, predicate signatures, comment content, and gate-term wording all matched the plan verbatim.

**Total deviations:** 0

## Assumption Drift (advisory)

None. No material drift from the plan's `<action>` prose or the phase CONTEXT.md decisions surfaced during execution — the day-key regex, the version-skew tolerance shape, the two-independent-terms requirement, and the WSSI/advisory insertion point all matched what the plan specified without adjustment.

## Issues Encountered

**Executor self-correction (not a deviation from the shipped code, recorded for process transparency):** during Mutation 1's restore step, an initial `git checkout -- MMM-SPCOutlook.js` was used, which reverted the file to `HEAD` (Task 1's commit) rather than restoring just the mutated line — this discarded Task 2's uncommitted predicates and gate terms entirely. Caught immediately by re-reading the file and finding the gate terms absent. Task 2's edits were reapplied identically (confirmed by re-running both automated checks, which passed), and for Mutations 2 and 3 a scratchpad file backup (outside the repo, restored via `cp` + `md5sum` verification) was used instead of `git checkout`, since Task 2's work was still uncommitted at mutation time. No product code was affected — the final committed state matches what both automated checks and the mutation proofs validated.

## Probe Suite Impact

The full probe suite (`node scripts/probe-payload-resilience.js`) was run after Task 1, after Task 2, and after each of the three mutation restores, reporting **48 passed, 0 failed, 0 skipped** every time — no regression in any existing scenario. No existing scenario needed a hazards route: none of the 48 scenarios set `showHazardsOutlook`, so the new predicates and gate terms are dormant in all of them (consistent with 16-03's SUMMARY, which found the same for the backend runner). New hazards-specific scenarios are 16-06/16-07's job, not this plan's.

## Known Stubs

None. Both predicates (`hazardsOutlookHasAnyDay`, `hazardsOutlookHasWindowEntries`) and both gate terms are fully implemented and exercised end-to-end by this plan's own fixture (control, HAZ-01, HAZ-02, toggle-off, and two version-skew cases). Day-row and window-band **rendering** (the actual `<span>`/markup output) is explicitly out of scope for this plan — that is 16-05's job per the plan's own `<objective>` ("No rendering — that is 16-05"). Nothing here is a placeholder; the gate correctly disqualifies the short-circuit for content that has no renderer yet, which is the correct and intended state until 16-05 lands.

## Threat Flags

None new beyond the plan's own `<threat_model>` register (T-16-15 through T-16-17, T-16-SC), all implemented as specified: both predicates tolerate a missing/non-object block, a non-object day entry, and a non-array `hazards`/`windowBand`, returning `false` rather than throwing (T-16-15, verified by the version-skew assertions above); the gate only lets content disqualify the short-circuit, never suppress a genuine risk (T-16-16); no npm/pip/cargo package was installed (T-16-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getDom`'s no-risk short-circuit now correctly accounts for both Hazards Outlook renderable surfaces (day grid, window band), ready for 16-05's day-row and window-band renderers to be added without needing to revisit the gate.
- `defaults.showHazardsOutlook` / `defaults.showDrought` and their payload wiring are complete and match the shape 16-05's renderer will consume off `this.spcrisk.hazardsOutlook`.
- No blockers. The gate's two-independent-terms structure is mutation-proofed against the exact Phase 15 regression shape, not resting on comments alone.

---
*Phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook*
*Completed: 2026-08-26*
