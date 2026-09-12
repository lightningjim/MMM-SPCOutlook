---
phase: 18-merge-precedence-unified-payload-schema
plan: 04
subsystem: data
tags: [merge-precedence, day-grid, spc-convective, spc-fire, wpc-ero, wpc-wssi, node.js]

# Dependency graph
requires:
  - phase: 18-01
    provides: hazardTaxonomy.js (dimensionOf, NO_RISK_FLOOR, FLOOR_PREBAKED, DAY_SOURCE_IDS)
  - phase: 18-02
    provides: _spcGridAnchor/_gridDayOf/_buildGridDays, the fourteen-key `days` skeleton, the reportedDays/activeDays/unmappedLabels accumulators and their noteReported/noteActive/noteUnmapped helpers
  - phase: 18-03
    provides: the (gridDays, rawSideChannel, anchorInfo, notes) grid-entry-builder shape, first proven on wpc-hazards/heatrisk
provides:
  - "staleBySource { [sourceId]: boolean } and noteStale(sourceId), giving spc-convective/spc-fire independent stale attribution while leaving anyStale/_stale/_staleAsOf trip conditions unchanged"
  - "_addSpcGridEntries(gridDays, spcLocals, notes): buckets SPC convective (days 1-8) and SPC fire weather (days 1-8) straight onto the grid from the existing inline locals, applying NO_RISK_FLOOR's categorical/probabilistic/fire predicates at entry-creation time"
  - "_addRegistryDayGridEntries(gridDays, sourceId, payload, row, notes): shared grid-entry builder for wpc-ero and wpc-wssi, reading their existing flat day{N}Risk/Text/Color payload blocks"
  - "All six day-scoped sources (spc-convective, spc-fire, wpc-ero, wpc-wssi, wpc-hazards, heatrisk) now populate reportedDays/activeDays; sources[]'s remaining gap is spc-md/wpc-mpd, which never participate in day-level suppression by design"
affects: [18-05, 18-06, 18-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-source staleness attribution via a lazily-keyed side accumulator (staleBySource) that never feeds the payload-wide _stale trip condition, mirroring reportedDays/activeDays' own lazy-keying rule from 18-02"
    - "Inline-locals grid-entry builder: for sources that predate the registry (14 D-08) and have no results.<id>.payload, the caller builds one plain object from its own named locals at the call site and hands it to a pure grid-entry function — the shared-in-memory-values constraint made concrete for the two sources where a results.<id>.payload does not exist"
    - "Tier-to-taxonomy-vocabulary translation derived from the SAME registry map the payload field was already built from (row.valueToTier, fireRiskToValue), rather than a second (source,label)->dimension map, when a payload field's short form does not match hazardTaxonomy.js's canonical label"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "ERO's hazardTaxonomy.js vocabulary (\"Marginal (At Least 5%)\") does not match any field _runArcGisDayProduct's payload carries or any map productRegistry.js exports (only the short tier \"MRGL\" survives to the payload). Rather than adding a second full label map, _addRegistryDayGridEntries carries a small eroTierToOutlookLabel translation table keyed on the SAME tier string the payload field was already built from (row.valueToTier's output), scoped inside the function and commented as a translation, not a dimension map. WSSI needed no such table: its uppercase tier already equals its raw `impact` vocabulary verbatim."
  - "spc-fire's taxonomy label (ELEV/CRIT/EXTM) is recovered by reversing fireRiskToValue at the call site (fireValueToRisk), per the plan's own sanctioned option, rather than inventing a parallel value->token table."
  - "fireRiskToColor (0/1/2/3 -> hex) is declared fresh in node_helper.js, mirroring MMM-SPCOutlook.js's own render-path map verbatim, since the frontend and backend are separate processes with no shared module — the same reasoning riskToColor's own SPC palette duplication already rests on."
  - "_addRegistryDayGridEntries throws if NO_RISK_FLOOR[sourceId] is ever not FLOOR_PREBAKED, rather than silently misinterpreting a future non-prebaked floor as always-active — a defensive integrity check on this function's own two-caller contract, not a new user-facing behavior."

patterns-established:
  - "For a source with no results.<id>.payload (predates the registry per 14 D-08), build the grid-entry function's second argument as a plain object assembled from the caller's own named locals at the call site — the same (gridDays, rawSideChannel, anchorInfo/notes) shape 18-03 established, adapted for the case where the 'raw side-channel' is a set of named locals rather than a runner-returned array."

requirements-completed: [MERGE-01, MERGE-04]

# Metrics
duration: ~20min
completed: 2026-09-05
---

# Phase 18 Plan 04: SPC/Fire/ERO/WSSI Day-Grid Wiring Summary

**All four remaining 12Z-native sources — spc-convective, spc-fire, wpc-ero, wpc-wssi — now populate the Phase 18 day grid straight from their existing in-memory locals/payloads, with SPC's tornado/hail/wind breakdown riding as a `detail` sub-object and per-source stale attribution added for the two SPC inline products.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-05T17:28:58Z
- **Completed:** 2026-09-05T17:48:57Z
- **Tasks:** 3 completed
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments

- Every inline `anyStale = true` site inside the SPC convective (days 1-8) and fire-weather (days 1-8) blocks now names its own source via `noteStale("spc-convective"|"spc-fire")` — 16 convective sites, 6 fire sites, 22 total. `anyStale`/`_stale`/`_staleAsOf`'s trip conditions are byte-identical to before; `staleBySource` is populated beside (never instead of) the six existing payload-wide reads (`excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`, and the two kml-advisory rows via a small registry-id -> source-id translation).
- `_addSpcGridEntries` buckets SPC convective days 1-8 and fire weather days 1-8 directly onto grid days 1-8 (D-11, no `_gridDayOf` call), reading the exact locals the legacy `day1`..`day8`/`fireWeather` return-statement literals are built from. Categorical days 1-3 carry an optional `detail` sub-object (tornado/hail/wind for days 1-2, probRisk/cig for day 3); probabilistic days 4-8 carry `detail: { probRisk, sign }`. Both floors (`NO_RISK_FLOOR["spc-convective"].categorical`/`.probabilistic`) and fire's `value > 0` floor are applied at entry-creation time, with `reportedDays` recorded for every fetched day (including a clean "NONE"/0 answer) and gated off entirely for days that were never fetched under `extended: false`.
- `_addRegistryDayGridEntries` buckets `wpc-ero` and `wpc-wssi` onto the grid from their existing `excessiveRain`/`winterImpact` payload blocks, iterating `1..row.days` only. `FLOOR_PREBAKED` is checked explicitly against the taxonomy sentinel rather than hardcoded. ERO's short tier is translated to hazardTaxonomy.js's long-form outlook vocabulary via a small table derived from the same `row.valueToTier` domain the payload field itself was built from; WSSI needs no translation.
- `excessiveRain.day1ValidTime` — flagged on STATE.md as unexercised end-to-end since 14 D-03 — is now read and logged once per process (`_loggedEroValidTimeSample`), closing that gap.
- All 91 pre-existing probe scenarios pass after every task; `git diff` against the pre-plan baseline shows no deletions inside the return object literal's existing keys and no changes to `percToRisk`, `riskToValue`, `fireRiskToValue`, or `_runArcGisDayProduct` beyond the `noteStale` substitutions.

## Task Commits

1. **Task 1: Attribute staleness per SPC source and stand up the reporting accumulators** — `4d958be` (feat)
2. **Task 2: Emit spc-convective and spc-fire grid entries from the existing inline locals** — `c9528cb` (feat)
3. **Task 3: Emit wpc-ero and wpc-wssi grid entries from their registry payloads** — `f78ac31` (feat)

**Plan metadata:** (this commit) `docs(18-04): complete SPC/fire/ERO/WSSI day-grid wiring plan`

## Files Created/Modified

- `node_helper.js` — Added `staleBySource`/`noteStale` beside `anyStale`; replaced 22 inline `anyStale = true` sites with `noteStale` calls; added `staleBySource` population for the four registry products and two kml-advisory rows; added `_addSpcGridEntries` and `_addRegistryDayGridEntries`; added `fireRiskToColor` and `_loggedEroValidTimeSample`; wired all three new calls into `getSpcOutlook` beside the plan 18-03 calls; imported `FLOOR_PREBAKED` from `hazardTaxonomy.js`.

## Scratch Harness Evidence

All harnesses were run via `node <script>` from the repo root against the real `node_helper.js` through the probe suite's `loadNodeHelper`/`resetHelper`/`turfStub`/`logCalls` seams (`scripts/probe-lib/module-stubs.js`), plus a minimal local `installHttp`/`httpResponse` for the end-to-end runs. Scripts lived under the session scratchpad directory, never inside the repo, and were deleted after use — the working tree carries no scratch files.

### Task 1: `anyStale` site enumeration and `staleBySource` population

`grep -n "anyStale = true" node_helper.js` after Task 1: only payload-wide sites remain outside the SPC/fire blocks — the four `results.<id>.anyStale` reads, the `kmlRows` loop, the `_unusableFeatureCount` guard, the runner-rejected-outcome branch, the assignment inside `noteStale` itself, and every runner-internal local (`_runArcGisDayProduct`, `fetchAndEvaluateHazard`, etc.). `grep -c 'noteStale("spc-convective")'` = 16, `grep -c 'noteStale("spc-fire")'` = 6, sum 22 matching the enumerated site count (11 convective days 1-3 + 5 convective days 4-8 + 4 fire days 1-2 + 2 fire days 3-8 loop body). `git diff node_helper.js | grep -cE "^\+.*(const|let) (reportedDays|activeDays|unmappedLabels)"` = 0.

Direct-call harness against `_addHazardsOutlookGridEntries`/`_addHeatRiskGridEntries` (unaffected by Task 1's edits) confirmed both still write into a hand-built `reportedDays`/`activeDays` bundle after the change:
```
reportedDays keys: ["wpc-hazards","heatrisk"]
activeDays keys: ["wpc-hazards","heatrisk"]
PASS: reportedDays contains both wpc-hazards and heatrisk keys after Task 1's noteStale changes
```

### Task 2: SPC convective/fire grid entries

Full-pipeline run (`getSpcOutlook`) with day1 categorical SLGT plus non-zero tor/hail/wind fixtures, `extended: false`:
```
days.1.hazards: [{"dimension":"convective","source":"spc-convective","label":"SLGT","text":"Slight",
  "value":3,"color":"f7f690","suppressedBy":null,
  "detail":{"probRisk":true,"torRisk":0.05,"torCig":0,"hailRisk":0.05,"hailCig":0,"windRisk":0.05,"windCig":0}}]
PASS: day1 SLGT -> exactly one spc-convective entry, dimension convective, value 3, detail carries tor/hail/wind
```
Full-pipeline run with day1 categorical TSTM (below floor):
```
days.1.hazards (spc-convective only): []
PASS: TSTM produces no entry (below-floor recorded but not rendered; legacy day1.risk = TSTM)
```
Direct calls to `_addSpcGridEntries` (hand-built `spcLocals`/`notes`):
```
=== day5 NONE ===
days.5.hazards: []
PASS: day5 NONE -> no entry, but reportedDays[spc-convective] contains 5

=== day5 SLGT (15%) ===
days.5.hazards: [{"dimension":"convective","source":"spc-convective","label":"SLGT","text":"Slight",
  "value":3,"color":"f7f690","suppressedBy":null,"detail":{"probRisk":0.15,"sign":false}}]
PASS: day5 SLGT (15%) -> one entry with detail.probRisk=0.15, detail.sign=false, activeDays contains 5

=== extended: false ===
reportedDays[spc-convective]: [1,2,3]
reportedDays[spc-fire]: [1,2]
PASS: extended:false -> spc-convective reported days [1,2,3], spc-fire reported days [1,2]

=== extended: true ===
reportedDays[spc-convective]: [1,2,3,4,5,6,7,8]
reportedDays[spc-fire]: [1,2,3,4,5,6,7,8]
PASS: extended:true -> both sources report their full 1-8 span

=== Fire weather states ===
days.1.hazards (fire): [{"dimension":"fire","source":"spc-fire","label":"CRIT","text":"Critical",
  "value":2,"color":"FF0000","suppressedBy":null}]
days.2.hazards (fire): []
PASS: fire value 2 -> ACTIVE entry (CRIT); fire value 0 -> ANSWERED-NO-AREA (reported, not active, no entry)
```
`grep -n "_gridDayOf" node_helper.js` shows no call inside `_addSpcGridEntries`. `grep -n "torRisk:"` shows it only inside `detail` construction sites. `grep -n "dimension: \"tornado\"\|dimension: \"hail\""` produced no output.

### Task 3: ERO/WSSI grid entries and the ERO `day1ValidTime` sample

Direct calls to `_addRegistryDayGridEntries`:
```
=== ERO Slight @ day1 ===
days.1.hazards (wpc-ero): {"dimension":"flash-flood","source":"wpc-ero","label":"Slight (At Least 15%)",
  "text":"Slight","value":2,"color":"f7f690","suppressedBy":null}
PASS: ERO Slight -> days[1].hazards entry {source: wpc-ero, dimension: flash-flood, value>0};
      day2 NONE -> no entry, reportedDays[wpc-ero] contains 2

=== WSSI Minor @ day1 ===
days.1.hazards (wpc-wssi): {"dimension":"winter","source":"wpc-wssi","label":"MINOR",
  "text":"Minor","value":2,"color":"faf5a3","suppressedBy":null}
PASS: WSSI Minor -> days[1].hazards entry {source: wpc-wssi, dimension: winter, label: MINOR}
```
Full-pipeline run through `getSpcOutlook` with a real ERO day-1 feature carrying `outlook`/`dn`/`valid_time` properties:
```
excessiveRain.day1ValidTime: "12Z 09/05/26 - 12Z 09/06/26"
log line: MMM-SPCOutlook: excessiveRain.day1ValidTime sample: "12Z 09/05/26 - 12Z 09/06/26"
days.1.hazards (wpc-ero): {"dimension":"flash-flood","source":"wpc-ero","label":"Slight (At Least 15%)", ...}
PASS: excessiveRain.day1ValidTime sample logged once per process, legacy block intact, grid entry present
```
The observed sample: **`"12Z 09/05/26 - 12Z 09/06/26"`** (the fixture's own `valid_time`, a composite display string as documented — no attribution is built on it, per plan instruction).

`grep -n "row.days" node_helper.js` shows the iteration bound inside `_addRegistryDayGridEntries`; `grep -nE "d <= (3|5);" node_helper.js` shows only `_addSpcGridEntries`'s own legitimate `d <= 3` convective-categorical bound (SPC-specific, not the new registry function) — no such literal exists inside `_addRegistryDayGridEntries`. `grep -c "FLOOR_PREBAKED" node_helper.js` = 6 (import comment, destructure, hazardTaxonomy.js's own declarations excluded — count is within `node_helper.js` and includes the throw-guard's two comparisons plus the two callers' comments).

### Probe suite (run after every task)

`node scripts/probe-payload-resilience.js | tail -3` → `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0, after Task 1, Task 2, and Task 3 individually and once more after all three commits. `git diff dfb2544 -- node_helper.js | grep -E "^-"` shows only the 22 `noteStale` substitutions and one import-comment line — no deletion inside the return object literal, `percToRisk`, `riskToValue`, `fireRiskToValue`, or `_runArcGisDayProduct`.

## Decisions Made

See `key-decisions` in the frontmatter. In brief: ERO's long-form taxonomy vocabulary has no existing registry map to read verbatim, so a small translation table derived from the same tier value the payload was already built from bridges the gap without declaring a second dimension map; `spc-fire`'s tier token is recovered the same way by reversing `fireRiskToValue`; `fireRiskToColor` is a fresh backend-side declaration mirroring the frontend's own render-path palette (the two processes share no module); `_addRegistryDayGridEntries` throws on an unexpected non-`FLOOR_PREBAKED` floor as a defensive integrity check on its own two-caller contract.

## Deviations from Plan

None — plan executed as written. The verbatim acceptance-criteria assertions (site enumeration counts, grid day placement, floor application, `detail` sub-object shape, the `extended` gate on both sources' reporting, the fire-weather three-state model, the ERO label translation, the registry-derived span bound, and the `day1ValidTime` sample) all passed on first implementation; no auto-fix rules were triggered.

## Assumption Drift (advisory)

None material. One cosmetic note, same shape as 18-03's own: the plan's acceptance criteria describe the scratch harnesses generically as run "through the probe's seams"; for the accumulator-specific assertions (`reportedDays`/`activeDays`, internal closures with no payload-visible surface) the harness called `_addSpcGridEntries`/`_addRegistryDayGridEntries` directly with a hand-built `notes` bundle, while the grid-placement and end-to-end wiring assertions ran through the full `getSpcOutlook` HTTP-stub pipeline. This is the stronger, more direct proof for each claim, not a weaker one.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- All six day-scoped sources (`spc-convective`, `spc-fire`, `wpc-ero`, `wpc-wssi`, `wpc-hazards`, `heatrisk`) now write into `days[].hazards`, `reportedDays`, and `activeDays`. `days[].hazards` is complete but unresolved — every surviving entry so far carries `suppressedBy: null` unconditionally.
- `staleBySource` now has real writers for all six day-scoped sources plus the two kml-advisory rows (`spc-md`, `wpc-mpd`); plan 18-05's `sources[]` assembly can read it directly for every `SOURCE_IDS` entry.
- No blockers. `node scripts/probe-payload-resilience.js` remains at `91 passed, 0 failed, 0 skipped` — the eight legacy payload blocks are provably untouched.
- Deferred item carried forward unchanged from 18-03/CONTEXT.md: "how 16 D-04's multi-day span features re-map onto the 12Z grid" remains on the legacy `_todayUtcMs`-anchored window-band decision, untouched by this plan.
- PERF-03's cold-cache Pi measurement remains an open milestone-close item per D-19, unaffected by this plan.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: node_helper.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-04-SUMMARY.md
- FOUND: 4d958be (Task 1 feat commit)
- FOUND: c9528cb (Task 2 feat commit)
- FOUND: f78ac31 (Task 3 feat commit)
