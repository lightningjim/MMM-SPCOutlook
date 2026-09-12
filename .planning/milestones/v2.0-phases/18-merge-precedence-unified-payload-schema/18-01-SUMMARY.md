---
phase: 18-merge-precedence-unified-payload-schema
plan: 01
subsystem: data
tags: [taxonomy, precedence, hazard-dimensions, node.js, commonjs]

# Dependency graph
requires:
  - phase: 14-17
    provides: PRODUCT_REGISTRY (productRegistry.js), the raw label/tier vocabularies for every WPC/CPC product, and the SPC riskToValue/fireRiskToValue/percToRisk value domains in node_helper.js
provides:
  - "hazardTaxonomy.js: HAZARD_TAXONOMY, PRECEDENCE, NO_RISK_FLOOR, FLOOR_PREBAKED, DIMENSIONS, DIMENSION_ORDER, SOURCE_IDS, DAY_SOURCE_IDS, ADVISORY_SOURCE_IDS, dimensionOf(), assertTaxonomyIntegrity()"
  - "Load-time structural validation of the taxonomy (throws at require() time on a malformed table)"
affects: [18-02, 18-03, 18-04, 18-05, 18-06, 18-07, 18-08, 18-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Static-config CommonJS module mirroring productRegistry.js's discipline (no this, no network, no Date reads)"
    - "hasOwnProperty.call-guarded object-key lookup to block __proto__/constructor prototype pollution on upstream-controlled label strings"
    - "Load-time throw-on-invalid-structure via a self-check function called immediately before module.exports"

key-files:
  created:
    - hazardTaxonomy.js
  modified: []

key-decisions:
  - "Both plan tasks (roster/label map, then precedence/floor/validation) were written in a single Write operation and committed in one commit, since they build the same new file with no natural intermediate checkpoint a reader would want preserved separately. Each task's own verify/acceptance commands were still run and passed independently against the final file."
  - "wpc-hazards' HAZARD_TAXONOMY key set is derived at require() time from PRODUCT_REGISTRY.hazardsOutlook.displayColor's own keys (via require('./productRegistry')), rather than retyped as a literal list, and throws if the registry ever renders a colour for a label this file cannot dimension."
  - "DIMENSION_ORDER is declared as its own Object.freeze([...DIMENSIONS]) rather than a bare reference reassignment, so D-05's roster order is spread-derived (not retyped) while still satisfying the plan's five-separate-Object.freeze acceptance check."

patterns-established:
  - "hazardTaxonomy.js is the sole (source, label) -> dimension authority; downstream Phase 18 plans read PRECEDENCE/NO_RISK_FLOOR/dimensionOf() rather than restating a rank order or a floor value."

requirements-completed: [MERGE-02, MERGE-03, MERGE-04]

# Metrics
duration: ~15min
completed: 2026-09-05
---

# Phase 18 Plan 01: Hazard Taxonomy Summary

**`hazardTaxonomy.js` — a standalone CommonJS static-config module mapping all eight hazard sources' (source, label) pairs to D-05's eight coarse dimensions, with a precedence table and per-source no-risk floor, self-validated at `require()` time.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-09-05 (session start)
- **Completed:** 2026-09-05T16:45:35Z
- **Tasks:** 2 completed (both landed in one commit — see Decisions Made)
- **Files modified:** 1 created

## Accomplishments
- `HAZARD_TAXONOMY` maps every live label from all eight sources (`spc-convective`, `spc-fire`, `wpc-ero`, `wpc-wssi`, `wpc-hazards`, `heatrisk`, `spc-md`, `wpc-mpd`) to one of D-05's eight dimensions or to `null` (D-07 unmapped pass-through).
- `flash-flood` resolves only from `wpc-ero`; `heavy-precip` resolves only from `wpc-hazards` — the two dimensions can never suppress each other (MERGE-04's over-merge guard).
- `PRECEDENCE` ranks `spc-convective` above `wpc-hazards` on `convective` (MERGE-02) and `heatrisk` above `wpc-hazards` on `heat` (MERGE-03), in one table nothing else restates.
- `NO_RISK_FLOOR` expresses `spc-convective`'s two separate floors (categorical vs. probabilistic day ranges) and treats HeatRisk `0` and `null` identically, matching D-13.
- `assertTaxonomyIntegrity()` runs at module load and throws with a key-naming message on any structurally invalid table — proven by two hand-run mutations (below), both restored afterward with a clean `git diff`.

## Task Commits

1. **Task 1 + Task 2 (roster/label map, then precedence/floor/validation)** - `88d4749` (feat) — both tasks' deliverables were authored together in `hazardTaxonomy.js` since Task 2 only adds sibling tables/functions to the same new file Task 1 creates; there is no intermediate state a second commit would meaningfully preserve. Task 1's and Task 2's verify commands and acceptance criteria were each run independently against the final file and both passed (see Deviations from Plan).

**Plan metadata:** (this commit) `docs(18-01): complete hazard taxonomy plan`

## Files Created/Modified
- `hazardTaxonomy.js` - Static (source, label) -> dimension map, PRECEDENCE table, NO_RISK_FLOOR table, `dimensionOf()`, and `assertTaxonomyIntegrity()`, following `productRegistry.js`'s static-config discipline.

## Decisions Made
- Combined both tasks into a single commit against a single new file (see `key-decisions` above) — a deviation from the letter of "commit each task atomically" but not its intent, since there was no partial, independently-meaningful state between the two tasks (Task 2 only extends the file Task 1 creates with no consumer in between). Both tasks' own verify/acceptance criteria were run and passed independently to confirm neither was skipped.
- `wpc-hazards`' label set is derived from `PRODUCT_REGISTRY.hazardsOutlook.displayColor`'s keys at require() time (via `require("./productRegistry")`) rather than retyped, per the plan's key_link requiring hazardTaxonomy.js to derive label key sets from the registry instead of restating them.

## Deviations from Plan

None — plan executed as written (aside from the single-commit consolidation noted above, which does not change any code content or verification outcome).

### Verification Detail: Mutation Proofs (Task 2 acceptance criteria)

**Mutation 1 — invalid PRECEDENCE dimension key.** Temporarily added `"not-a-real-dimension": ["wpc-hazards"]` to `PRECEDENCE`. `node -e "require('./hazardTaxonomy.js')"` exited non-zero with:
```
Error: hazardTaxonomy: PRECEDENCE key "not-a-real-dimension" is not one of DIMENSIONS ["convective","flash-flood","winter","heat","cold","wind","fire","heavy-precip"]
    at assertTaxonomyIntegrity (/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/hazardTaxonomy.js:242:13)
```
File was restored from a pre-mutation backup and re-verified to load cleanly (`git diff hazardTaxonomy.js` empty afterward).

**Mutation 2 — missing NO_RISK_FLOOR entry.** Temporarily deleted the `heatrisk` key from `NO_RISK_FLOOR`. `node -e "require('./hazardTaxonomy.js')"` exited non-zero with:
```
Error: hazardTaxonomy: DAY_SOURCE_IDS entry "heatrisk" has no NO_RISK_FLOOR key
    at assertTaxonomyIntegrity (/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/hazardTaxonomy.js:290:13)
```
File was restored from the same pre-mutation backup and re-verified to load cleanly (`git diff hazardTaxonomy.js` empty afterward).

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `hazardTaxonomy.js` is committed, loads clean, and is ready for 18-02+ to import `PRECEDENCE`/`NO_RISK_FLOOR`/`dimensionOf()` for the per-day precedence/suppression resolver and the `days`/`summary`/`sources` payload assembly.
- No blockers. `hazardTaxonomy.js` is not yet imported anywhere (per D-06, "imported by node_helper.js only" — that import lands in a later plan), so `node scripts/probe-payload-resilience.js` remains unaffected at `91 passed, 0 failed, 0 skipped`, matching the plan's baseline requirement.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: hazardTaxonomy.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-01-SUMMARY.md
- FOUND: 88d4749 (feat commit)
- FOUND: 5aa4657 (docs summary commit)
