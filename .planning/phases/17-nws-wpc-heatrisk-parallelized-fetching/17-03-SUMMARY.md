---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 03
subsystem: frontend
tags: [heatrisk, config-flags, shared-predicate, no-risk-gate, getDom]

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 01
    provides: PRODUCT_REGISTRY.heatRisk row with configFlag "showHeatRisk", consumed here only by name-matching the config flag (this plan does not read productRegistry.js directly)
provides:
  - MMM-SPCOutlook.js defaults.showHeatRisk / defaults.showMinorHeat
  - buildRequestPayload's products.showHeatRisk (showMinorHeat deliberately absent)
  - heatRiskDaysToRender(block, showMinorHeat) — D-03's sole source of both the no-risk gate term and the HeatRisk render loop
affects: [17-04, 17-08, 17-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "heatRiskDaysToRender(block, showMinorHeat): a shared predicate deriving day keys from the block's own keys (no hardcoded 1..7), feeding both the getDom no-risk gate term and the render loop, so the two cannot disagree about what is displayable (D-03)"
    - "Frontend-only display-floor config flag (showMinorHeat): first config flag in this file whose entire contract is 'exists in defaults, read only inside getDom's own predicate' — never in buildRequestPayload's products object, never in SUB_TOGGLES, never reaches node_helper.js"

key-files:
  created: []
  modified: [MMM-SPCOutlook.js]

key-decisions:
  - "Render placement: HeatRisk block sits immediately after the showWinterImpact renderDayBlock call and before the showHazardsOutlook block — HeatRisk is a Days 1-7 product like ERO/WSSI, while Hazards Outlook covers Days 3-14, so the near-term day grids group together before the longer-range band. Placed before the contentMarker comparison (D-16, CR-01) so a stale payload carrying real heat risk renders its content rather than a bare warning badge."
  - "heatRiskDaysToRender derives its day span from Object.keys(block) matching /^day\\d+$/, sorted ascending numerically, rather than a literal 1..7 loop bound — mirrors hazardsOutlookHasAnyDay's WR-08 discipline and keeps the predicate correct if PRODUCT_REGISTRY.heatRisk.days ever changes without a second frontend edit."

requirements-completed: [HEAT-01]

# Metrics
duration: ~35min
completed: 2026-09-01
---

# Phase 17 Plan 03: HeatRisk Config Flags & Shared Gate/Render Predicate Summary

**Added `showHeatRisk`/`showMinorHeat` config defaults, threaded `showHeatRisk` into the backend payload, and added `heatRiskDaysToRender` as the single shared source for both the `getDom()` no-risk gate term and the HeatRisk render loop — the structural fix for the exact defect class (a gate/render disagreement) that shipped as a production bug in Phase 15.**

## Performance

- **Duration:** ~35 min
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`MMM-SPCOutlook.js`)

## Accomplishments

- `defaults.showHeatRisk: false` (backend-reaching, standard product flag) and `defaults.showMinorHeat: false` (frontend-only display floor, D-01/D-02) added with full rationale comments.
- `buildRequestPayload`'s `products` object gains `showHeatRisk: this.config.showHeatRisk`; `showMinorHeat` is provably absent from that object, from `SUB_TOGGLES`, and from `node_helper.js`/`productRegistry.js` entirely (grep-verified, `0` matches in both files).
- `heatRiskDaysToRender(block, showMinorHeat)` added alongside `hazardsOutlookHasAnyDay`/`hazardsOutlookHasWindowEntries` — derives the day span from the block's own keys (no hardcoded day count), applies the D-01 floor (`showMinorHeat === true ? 1 : 2`), and treats `category: null` as distinct from `category: 0` (neither renders).
- One gate term added to the no-risk short-circuit, placed after the two `showHazardsOutlook` terms and before `enabledAdvisories()`, calling the exact same `heatRiskDaysToRender` expression the render loop calls.
- One render block added, gated on `this.config.showHeatRisk`, iterating `heatRiskDaysToRender`, escaping `text` via `escapeHtml` and validating `color` via `validHazardColor` on every rendered field, with a `String(category)` fallback if `text` is falsy for an included day.

## Task Commits

1. **Task 1: showHeatRisk and showMinorHeat config flags** - `e2e8789` (feat)
2. **Task 2: D-03 shared predicate, the no-risk gate term, and the render block** - `7c94770` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `MMM-SPCOutlook.js` — added `showHeatRisk`/`showMinorHeat` defaults (lines 18, 32), `showHeatRisk` in `buildRequestPayload`'s `products` object (line 73), `heatRiskDaysToRender` predicate (line 361), one no-risk gate term (line 456), one render block (after the Winter Impact `renderDayBlock` call, before the Hazards Outlook block).

## `heatRiskDaysToRender` — three occurrences, verbatim line numbers

```
361:    const heatRiskDaysToRender = (block, showMinorHeat) => {
456:      !(this.config.showHeatRisk && heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat).length > 0) &&
731:        for (const { d } of heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat)) {
```

`grep -c 'heatRiskDaysToRender' MMM-SPCOutlook.js` → `3` (declaration, gate term, render loop). No fourth occurrence; no second expression computes the floor.

`sed -n '/heatRiskDaysToRender = /,/};/p' MMM-SPCOutlook.js | grep -cE '(<=|<) *7'` → `0` (no literal day-span number in the predicate).

`grep -n 'showMinorHeat' MMM-SPCOutlook.js` shows it only in: `defaults:` (2 lines — the default and a comment reference), the predicate's own parameter/floor lines, comments, and the two `heatRiskDaysToRender` call sites — never inside `buildRequestPayload`.

## Final render placement and rationale

HeatRisk's render block sits **immediately after** the `showWinterImpact` `renderDayBlock` call and **before** the `showHazardsOutlook` block (`renderHazardsDays`/`renderHazardsWindowBand`). Rationale recorded in-code: HeatRisk is a Days 1–7 product like ERO and WSSI, whereas Hazards Outlook covers Days 3–14, so this groups the near-term day grids together ahead of the longer-range band. The block sits before the `wrapper.innerHTML === contentMarker` comparison (set at line 446, well upstream), matching D-16/CR-01's rule that a stale payload carrying real heat risk must render its content instead of a bare warning badge.

## Behaviour Proofs — verbatim output

Run via `loadFrontendModule()`/`renderDom(frontend, { config, spcrisk })` from `scripts/probe-lib/module-stubs.js`, with a minimal `spcrisk` fixture (`day1`/`day2`/`day3` all `NONE`, no other product blocks present) plus a `heatRisk` block populated per each assertion. Script executed from the scratchpad, requiring the module-stubs harness directly (no changes made to `scripts/probe-payload-resilience.js` in this plan — the four proofs below are ad hoc verification, not a permanent probe-suite scenario; adding a permanent `heatrisk-*` scenario is scoped to a later plan per PATTERNS.md).

```
Rendered 1: Heat Risk (Day 3): <span style="color:#e22f33">Major</span><br/>
OK: assertion 1: contains Heat Risk (Day 3)
OK: assertion 1: does not contain No Severe Weather Risk

Rendered 2: No Severe Weather Risk
OK: assertion 2: does NOT contain Heat Risk (Day 3)
OK: assertion 2: DOES contain No Severe Weather Risk

Rendered 3: Heat Risk (Day 3): <span style="color:#f4f257">Minor</span><br/>
OK: assertion 3: contains Heat Risk (Day 3)

Rendered 4a: No Severe Weather Risk
OK: assertion 4a: does NOT contain Heat Risk (Day 3)
OK: assertion 4a: DOES contain No Severe Weather Risk

OK: assertion 4b: absent heatRisk key does not throw
Rendered 4b: No Severe Weather Risk
OK: assertion 4b: renders all-clear when heatRisk key absent

ALL ASSERTIONS PASSED
```

1. `heatRisk.day3.category = 3`, everything else no-risk, `showHeatRisk: true` → rendered HTML contains `Heat Risk (Day 3)` and does not contain `No Severe Weather Risk`. PASS.
2. `heatRisk.day3.category = 1`, `showHeatRisk: true`, `showMinorHeat: false` → rendered HTML does NOT contain `Heat Risk (Day 3)` AND DOES contain `No Severe Weather Risk`. PASS — this is D-03's whole point and the exact assertion that would have caught Phase 15's MPD-invisible defect: the row is filtered out and the all-clear is restored, never blank.
3. Same payload with `showMinorHeat: true` → HTML contains `Heat Risk (Day 3)`. PASS.
4. `heatRisk.day3.category = null` with `showHeatRisk: true, showMinorHeat: true` → HTML does not contain `Heat Risk (Day 3)` and does contain `No Severe Weather Risk` (4a, PASS); a payload with the entire `heatRisk` key absent renders without throwing and shows the all-clear (4b, PASS).

## Probe Suite

`node scripts/probe-payload-resilience.js` — **67 passed, 0 failed, 0 skipped** both before Task 1 and after Task 2 (pass count unchanged, as required). Per `project_test_note`, this project's baseline is 67 scenarios, not the plan's stated "79/79 at plan time" — that figure was already flagged as a stale planning estimate in 17-01-SUMMARY.md's own Assumption Drift section and is not something this plan caused or could affect (this plan adds zero probe scenarios).

## Acceptance Criteria Verified

- `node --check MMM-SPCOutlook.js` → syntax OK.
- Task 1 `<verify>` inline script → `OK`.
- `grep -c 'showMinorHeat' node_helper.js productRegistry.js` → `0` for both files.
- `grep -n 'SUB_TOGGLES' node_helper.js` → still only `showDrought`.
- `git diff --stat` (both commits) → `MMM-SPCOutlook.js` the only modified file.
- `grep -c 'heatRiskDaysToRender' MMM-SPCOutlook.js` → `3`.
- Day-span literal check (`sed`/`grep -cE '(<=|<) *7'`) → `0`.
- All four behaviour proofs → PASS (verbatim output above).

## Deviations from Plan

None — plan executed exactly as written. `node_helper.js` and `productRegistry.js` were not touched, per the plan's explicit scope boundary and the parallel-execution constraint (a concurrent agent owns `node_helper.js` under plan 17-02).

## Issues Encountered

- `node_helper.js` in this worktree does not yet emit a `heatRisk` block on `getSpcOutlook`'s real payload (that runner is 17-02/17-04's scope, executed by a concurrent worktree agent not yet merged here). The four behaviour proofs therefore construct a minimal synthetic `spcrisk` fixture directly (matching the `<interfaces>` contract's stated shape exactly: `day1..day7` each `{ category, text, color }`) rather than driving them through a live `helper.getSpcOutlook()` call, since that call cannot yet produce a `heatRisk` key in this worktree's state. This is consistent with the plan's own instruction to use `loadFrontendModule()`/`renderDom()` — those helpers take an arbitrary `spcrisk` object and do not require it to have come from a live backend call.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- `heatRiskDaysToRender`, the gate term, and the render block are all live and exercised against the exact payload contract stated in this plan's `<interfaces>` section. Once 17-02/17-04's backend runner lands (merged separately), the real `getSpcOutlook()` payload will carry a `heatRisk` block matching that same shape, and no frontend change is anticipated to consume it correctly — the four behaviour proofs above already prove the frontend's handling of every category value the interface contract allows (0-4, null, and the whole block absent).
- No blockers for 17-08 (probe-suite scenario plan), which can promote the four ad hoc proofs above into permanent `heatrisk-*` scenarios in `scripts/probe-payload-resilience.js` using the same `loadFrontendModule()`/`renderDom()` mechanism and fixture shape.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `MMM-SPCOutlook.js`
- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-03-SUMMARY.md`
- FOUND: commit `e2e8789` (Task 1)
- FOUND: commit `7c94770` (Task 2)
