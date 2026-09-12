---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
plan: 01

subsystem: data
tags: [arcgis, productRegistry, wpc, cpc, hazards-outlook, noaa]

# Dependency graph
requires:
  - phase: 14-wpc-excessive-rainfall-outlook
    provides: buildArcGisQuery (allowlisted ArcGIS query builder), daySpanOf load-time validator idiom, PRODUCT_REGISTRY shape
  - phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
    provides: kind-based row dispatch precedent (arcgis-day-layers / kml-advisory), registry-row-is-pure-static-config convention (15 D-02)
provides:
  - "PRODUCT_REGISTRY.hazardsOutlook row — the single owner of the Hazards Outlook product's vocabulary (six layer ids, Flooding exclusion, Drought label set, same-day ordering, live-sourced palette, maxDataAgeHours)"
  - "Third registry kind, arcgis-hazard-window, ready for a node_helper.js sibling runner to dispatch on"
  - "dayRangeOf load-time validator for [first,last] range shapes (sibling to daySpanOf's contiguous 1..N shape)"
affects: [16-02, 16-03, 16-04, 16-05, 16-06, 16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "arcgis-hazard-window: a registry kind whose day lives inside each feature's start_date/end_date, not in the URL — buildUrl takes a layer id, not a day"
    - "Registry rows with no includesFeat/valueToTier/tierToText/tierToColor when the product has no severity ladder and its filtering is request-scoped (built by the runner, not the static row)"

key-files:
  created: []
  modified: [productRegistry.js]

key-decisions:
  - "Exported dayRangeOf in Task 1 rather than deferring the module.exports update to Task 2 as the plan's task split implied — Task 1's own acceptance criteria and verify command require `require('./productRegistry.js').dayRangeOf` to already be callable, which is only true if the export exists. Task 2 also updates the same export line per its own action, which is now a no-op confirmation rather than a net-new change."

patterns-established:
  - "dayRangeOf([first,last]) — sibling load-time validator for range shapes, alongside daySpanOf's contiguous-map shape"

requirements-completed: [HAZ-01, HAZ-02, HAZ-03, HAZ-04, DATA-02]

# Metrics
duration: ~15min
completed: 2026-08-26
---

# Phase 16 Plan 01: Hazards Outlook Registry Row Summary

**Added the `hazardsOutlook` registry row to `productRegistry.js` — a third registry kind (`arcgis-hazard-window`) declaring all six WPC/CPC hazard layers, the D-09 Flooding hard-exclusion, the D-10 Drought gated set, D-02 deterministic same-day ordering, and D-13/D-14's 84-hour per-layer freshness threshold, with every hex color's provenance cited.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-26
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`productRegistry.js`)

## Accomplishments
- `PRODUCT_REGISTRY.hazardsOutlook` is the single call site for hazards-outlook URL construction and the single declaration of the product's vocabulary (labels, order, colors, day range) — no later plan in this phase may restate a layer id, label, hex, or day count
- `dayRangeOf([3, 14])` runs at module load, so a malformed day range fails immediately, not silently in the field
- HAZ-03's lowercase-`label` read is provably correct at the registry level: `toValue` ignores the broken positional `label` param `extractPolygons` always passes as `""` and reads `f.properties.label` directly
- D-09 (Flooding, hard exclusion) and D-10 (Drought, gated) label sets are declared, verified disjoint, and each carries its provenance comment
- Existing probe suite (48 scenarios, grown from the 32 the plan's `<verification>` cites) stays 48/48 green — this plan's registry addition does not perturb any existing product

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the hazards static constants and the dayRangeOf load-time validator** - `c352d5d` (feat)
2. **Task 2: Add PRODUCT_REGISTRY.hazardsOutlook and export dayRangeOf** - `e7a906c` (feat)

_Note: Task 1 also updated `module.exports` to include `dayRangeOf` (see Deviations) — Task 2's own action item to update the same export line landed as a no-op confirmation._

## Files Created/Modified
- `productRegistry.js` - Added `HAZARDS_BASE_URL`, `hazardsOutlookLayers` (6 layers), `hazardsExcludedLabels` (D-09), `hazardsDroughtLabels` (D-10), `hazardsOrder` (D-02), `HAZARDS_DEFAULT_COLOR`, `hazardsDisplayColor` (15 entries), `dayRangeOf` validator, and `PRODUCT_REGISTRY.hazardsOutlook` row; updated `module.exports`

## Decisions Made
- See `key-decisions` in frontmatter — moved the `module.exports` update for `dayRangeOf` into Task 1 since Task 1's own verify command depends on the export existing.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Exported `dayRangeOf` in Task 1, not deferred to Task 2**
- **Found during:** Task 1 (verification step)
- **Issue:** Task 1's `<verify>` command is `node -e "const r=require('./productRegistry.js'); const {dayRangeOf}=r; ..."` and its acceptance criteria explicitly state `require('./productRegistry.js').dayRangeOf` must be exported and behave per that check. But the plan's Task 2 action is the one that formally updates `module.exports` to include `dayRangeOf`. Run as written, Task 1's own verify would throw `TypeError: dayRangeOf is not a function` because the function existed in the module but was not yet exported.
- **Fix:** Added `dayRangeOf` to the `module.exports` line as part of Task 1's commit. Task 2's action item (same export-line edit) then landed as a no-op — the line already matched the target state, confirmed unchanged.
- **Files modified:** `productRegistry.js`
- **Verification:** Both Task 1 automated verify commands pass (`dayRangeOf` round-trip, throw-on-inverted-range, throw-on-non-integer; hex/label presence grep).
- **Committed in:** `c352d5d` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — sequencing of an export line between two tasks in the same file)
**Impact on plan:** No scope creep. The row shape, constants, and comments match the plan's `<action>` text verbatim; only the timing of one export-line edit moved earlier by one task.

## Issues Encountered
- The plan's overall `<verification>` section includes `node -e "require('./node_helper.js')"` and Task 2's acceptance criteria include the same command. This command cannot succeed standalone in any state of this repository — `node_helper` is a MagicMirror-core-provided global module, not an npm package, and `node_helper.js`'s own first line (`require('node_helper')`) fails with `MODULE_NOT_FOUND` identically before and after this plan's changes (confirmed by `git stash` and re-running). The repository's own probe harness (`scripts/probe-lib/module-stubs.js`) exists specifically to resolve this by registering a `node_helper` stub before loading `node_helper.js`. I verified the equivalent intent two ways instead: (a) `loadNodeHelper()` from the probe harness successfully loads `node_helper.js` and exposes `getSpcOutlook`, confirming the registry change did not break the module; (b) the full probe suite (`node scripts/probe-payload-resilience.js`, which internally requires `node_helper.js` via the same stub loader) reports 48/48 scenarios passing, 0 failed, 0 skipped. This is not a Rule 1/3 fix — nothing in the plan's `<action>` or my changes could make the literal bare command succeed; it is a plan-verification-command limitation pre-existing across all phases that touch `node_helper.js` this way.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `PRODUCT_REGISTRY.hazardsOutlook` is ready for plan 16-02+ to build the `node_helper.js` sibling runner (`_runArcGisHazardWindowProduct`) that dispatches on `kind === "arcgis-hazard-window"`, per RESEARCH.md's Registry Kind & Row Design.
- No blockers. The row intentionally has no `includesFeat` (D-10's Drought gate is request-scoped and must be built by the runner over `excludedLabels`/`droughtLabels` at call time, per 15 D-02) and no severity-ladder fields (`valueToTier`/`tierToText`/`tierToColor`) — both are correct per this plan's scope and confirmed absent by Task 2's third verify command.

---
*Phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook*
*Completed: 2026-08-26*

## Self-Check: PASSED

- FOUND: productRegistry.js
- FOUND: .planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-01-SUMMARY.md
- FOUND: c352d5d (Task 1 commit)
- FOUND: e7a906c (Task 2 commit)
- FOUND: 6360bad (plan metadata commit)
