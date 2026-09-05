---
phase: 18-merge-precedence-unified-payload-schema
plan: 03
subsystem: data
tags: [merge-precedence, day-grid, hazards-outlook, heatrisk, node.js]

# Dependency graph
requires:
  - phase: 18-01
    provides: hazardTaxonomy.js (dimensionOf, NO_RISK_FLOOR, DIMENSIONS) — this plan is its first consumer
  - phase: 18-02
    provides: _spcGridAnchor/_gridDayOf/_buildGridDays, the fourteen-key `days` skeleton, and the reportedDays/activeDays/unmappedLabels accumulators with their noteReported/noteActive/noteUnmapped helpers
provides:
  - "_runArcGisHazardWindowProduct and _runHeatRiskProduct each return an additive gridMatches/gridTuples side-channel plus idpFiledate, built from the SAME in-memory values their legacy blocks were built from"
  - "_addHazardsOutlookGridEntries(gridDays, gridMatches, anchorInfo, notes): re-buckets wpc-hazards day-scoped labels onto the SPC 12Z grid, D-10 forward-aligned"
  - "_addHeatRiskGridEntries(gridDays, gridTuples, anchorInfo, notes): re-buckets HeatRisk's 12Z point samples onto the SPC grid, applying D-13's no-risk floor at entry-creation time"
  - "Both wave-2 sources now populate reportedDays/activeDays/unmappedLabels, so sources['wpc-hazards'/'heatrisk'].reporting will not be permanently false once 18-05 reads these accumulators"
affects: [18-04, 18-05, 18-06, 18-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Additive runner side-channel: a runner keeps its own payload assembly byte-for-byte and hands the merge stage the same raw values via a new return key, never a second fetch/parse (D-01)"
    - "Legacy-anchored band-routing decision preserved verbatim while day-grid placement re-anchors onto a different clock (D-09 moves WHICH day, not WHETHER a match is day-scoped)"
    - "Entry-creation-time floor test with a load-bearing reported-vs-active split, reusing hazardTaxonomy.js's NO_RISK_FLOOR rather than re-deriving a threshold"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "hazardTaxonomy.js's require() (D-06's first and only consumer) landed in this plan, destructuring only dimensionOf and NO_RISK_FLOOR — the two exports this plan's code actually reads."
  - "Task 2 and Task 3 were committed as two separate atomic commits despite both needing the same import line and getSpcOutlook wiring block: the NO_RISK_FLOOR import and the _addHeatRiskGridEntries method/wiring call were temporarily withheld after being authored, verified independently against Task 2's own acceptance criteria with them absent, then re-added and re-verified for Task 3's commit — so each commit's diff maps 1:1 to its task's stated deliverable rather than being a single combined drop."
  - "wpc-hazards' unmapped-label detection reuses the exact resolveStyle idiom the legacy block already uses (hasOwnProperty against row.displayColor) rather than testing dimensionOf's null return directly, since hazardTaxonomy.js's own buildWpcHazardsMap guarantees the two are equivalent — this keeps one visible convention for 'is this label styled' across both the legacy and grid code paths."
  - "HeatRisk's collision handling (two tuples resolving to the same grid day) is expressed as a single 'skip if an existing entry's value already beats this tuple's category' guard before the floor test, rather than a floor-test-then-separately-handle-collision two-step — the naive two-step produced dead code (an existing entry's value is never below the floor by construction, since entries are only ever created after passing the floor), so the guard was collapsed to the one reachable branch."

patterns-established:
  - "A grid-entry builder for a wave-2/3 source is a pure function of (gridDays, rawSideChannel, anchorInfo, notes) — no `this` state beyond registry/taxonomy lookups and the grid-math helpers 18-02 already exposed — mutating gridDays in place and calling the shared notes bundle. 18-04 should follow the same shape for its four remaining sources."

requirements-completed: [MERGE-01, MERGE-04]

# Metrics
duration: ~20min
completed: 2026-09-05
---

# Phase 18 Plan 03: Wave-2 Day-Grid Re-Bucketing (wpc-hazards, heatrisk) Summary

**wpc-hazards and HeatRisk each hand the merge stage the raw values their legacy blocks were built from, and both are re-bucketed onto the SPC 12Z grid (D-09/D-10) with resolved dimensions, an explicit null pass-through for unmapped labels, and full reportedDays/activeDays bookkeeping.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-09-05T17:00:00Z (following 18-02)
- **Completed:** 2026-09-05T17:19:15Z
- **Tasks:** 3 completed
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments

- `_runArcGisHazardWindowProduct` now returns `gridMatches` (the same normalized match objects the legacy re-bucket loop already consumed, pushed from the same loop iteration, same `displayable()` gate) and `idpFiledate` (the newest per-layer publish timestamp), with zero changes to the runner's own `payload`/`block` assembly.
- `_runHeatRiskProduct` now returns `gridTuples` (every deduped catalog tuple, pushed BEFORE the `_todayUtcMs`-relative span filter that would otherwise wrongly discard the tile covering grid day 1 during the 00Z–12Z window) and `idpFiledate`, with zero changes to the runner's own `payload` assembly.
- `_addHazardsOutlookGridEntries` re-anchors day-scoped (Precipitation-layer, non-full-nominal-window) `wpc-hazards` matches from their native 00Z–00Z span onto the SPC grid day(s) they forward-align onto (D-10), using `anchorInfo.nominalStartMs` per 18-02's established rule. Window-band routing stays on the legacy `_todayUtcMs`-anchored decision, unchanged.
- `_addHeatRiskGridEntries` re-anchors HeatRisk's 12Z point-sample `idp_validtime` values onto the SPC grid — a near-identity mapping requiring no interval-overlap logic. A category that fails `NO_RISK_FLOOR.heatrisk` (0 or non-numeric/`null`) produces no renderable entry but still records `reportedDays`, keeping "said Little to No Risk" distinguishable from "had nothing" in a captured payload.
- Both sources call `noteReported`/`noteActive` (and `noteUnmapped` where applicable) from 18-02's accumulator bundle, so neither reads as permanently non-reporting once 18-05 assembles `sources[]`.
- `hazardTaxonomy.js` is imported for the first time (`dimensionOf`, `NO_RISK_FLOOR`), fulfilling D-06.
- All 91 pre-existing probe scenarios still pass after every task; `hazardsOutlook`/`heatRisk` legacy blocks confirmed byte-for-byte unchanged (see scratch harness outputs below).

## Task Commits

1. **Task 1: Add raw side-channels to the hazards-outlook and heatrisk runners without touching their payloads** - `f89183d` (feat)
2. **Task 2: Bucket wpc-hazards onto the SPC grid and emit its hazard entries** - `585ccfb` (feat)
3. **Task 3: Bucket heatrisk onto the SPC grid, and stand up the unmapped-label accumulator** - `cf17a98` (feat)

**Plan metadata:** (this commit) `docs(18-03): complete wave-2 day-grid re-bucketing plan`

## Files Created/Modified

- `node_helper.js` — Added `gridMatches`/`idpFiledate` to `_runArcGisHazardWindowProduct`'s return and `gridTuples`/`idpFiledate` to `_runHeatRiskProduct`'s return (every return path on both runners); imported `dimensionOf`/`NO_RISK_FLOOR` from `hazardTaxonomy.js`; added `_addHazardsOutlookGridEntries` and `_addHeatRiskGridEntries`; wired both into `getSpcOutlook` immediately before the return statement.

## Scratch Harness Evidence

All harnesses were run via `node <script>` from the repo root against the real `node_helper.js` through the probe suite's `loadNodeHelper`/`resetHelper`/`installHttp`/`turfStub` seams (`scripts/probe-lib/module-stubs.js`). Scripts lived under the session scratchpad directory, never inside the repo, and were not committed.

### Near-boundary Heavy Rain (Task 2, MERGE-01's boundary case)

Command: `node harness-task2.js` (Scenario 1), SPC day-1 fixture pinned to `VALID_ISO 2026-09-05T13:00:00Z` / `EXPIRE_ISO 2026-09-06T12:00:00Z`, a Precipitation-layer `Heavy Rain` feature at `start_date=Date.UTC(2026,8,6)` / `end_date=Date.UTC(2026,8,7)`, driven through the real `getSpcOutlook`.

```
days.1.hazards: []
days.2.hazards: [{"dimension":"heavy-precip","source":"wpc-hazards","label":"Heavy Rain","text":"Heavy Rain","value":null,"color":"267300","suppressedBy":null}]
days.1.windowStart/windowEnd: 2026-09-05T13:00:00.000Z 2026-09-06T12:00:00.000Z
days.2.windowStart/windowEnd: 2026-09-06T12:00:00.000Z 2026-09-07T12:00:00.000Z
PASS: Heavy Rain lands on grid day 2 only, dimension heavy-precip
```

### Severe Weather → convective; Temperature → no day-grid entry (Task 2)

Same command, Scenario 2: a `Severe Weather` Precipitation-layer feature and a `Much Above Normal Temperatures` Temperature-layer feature on the same days, same anchor.

```
days.2.hazards: [{"dimension":"convective","source":"wpc-hazards","label":"Severe Weather","text":"Severe Weather","value":null,"color":"e69800","suppressedBy":null}]
PASS: Severe Weather -> convective; Temperature produced NO day-grid entry anywhere
```

### Unrecognised label → dimension null + verbatim render (Task 2)

Same command, Scenario 3: a `Volcanic Ash` Precipitation-layer feature.

```
days.2 Volcanic Ash entry: {"dimension":null,"source":"wpc-hazards","label":"Volcanic Ash","text":"Volcanic Ash","value":null,"color":"aaaaaa","suppressedBy":null}
PASS: unrecognised label renders verbatim with dimension: null
```

### reportedDays/activeDays/unmappedLabels (Task 2, direct unit call)

Same command, Scenario 4: `_addHazardsOutlookGridEntries` called directly with a hand-built `notes` bundle backed by local Sets/arrays (since the real accumulators are internal to `getSpcOutlook` and not exposed on the payload).

```
reportedDays: {"wpc-hazards":[2]}
activeDays: {"wpc-hazards":[2]}
unmappedLabels: {"wpc-hazards":["Volcanic Ash"]}
PASS: reportedDays and activeDays both contain grid day 2; unmappedLabels recorded 'Volcanic Ash'
```

### HeatRisk category mapping (Task 3)

Command: `node harness-task3.js` (Scenario 1), SPC anchor pinned to nominal `2026-09-05T12:00:00Z` (via `_spcGridAnchor(null, "2026-09-06T12:00:00Z")`), HeatRisk tuples at `idp_validtime = Date.UTC(2026,8,5,12)` category 3 and `Date.UTC(2026,8,6,12)` category 1, called directly against `_addHeatRiskGridEntries`.

```
days.1.hazards: [{"dimension":"heat","source":"heatrisk","label":"3","text":"Major","value":3,"color":"e22f33","suppressedBy":null}]
days.2.hazards: [{"dimension":"heat","source":"heatrisk","label":"1","text":"Minor","value":1,"color":"f4f257","suppressedBy":null}]
PASS: day1 value=3/Major, day2 value=1/Minor
```

### HeatRisk category 0 and null: no entry, but reported (Task 3, D-13's floor at the entry-creation boundary)

Same command, Scenarios 2a/2b, same anchor.

```
=== category 0 ===
days.1.hazards: []
reportedDays: {"heatrisk":[1]}
activeDays: {"heatrisk":[]}
PASS: category 0 -> no entry, reported=true, active=false

=== category null ===
days.1.hazards: []
reportedDays: {"heatrisk":[1]}
activeDays: {"heatrisk":[]}
PASS: category null -> no entry, reported=true, active=false
```

### HeatRisk category-3 run: both accumulators contain grid day 1 (Task 3)

Same command, Scenario 3 (re-using Scenario 1's category-3 tuple's accumulator state).

```
reportedDays: {"heatrisk":[1,2]}
activeDays: {"heatrisk":[1,2]}
PASS: reportedDays and activeDays both contain grid day 1 for the category-3 tuple
```

### The 00Z–12Z window: the legacy-discarded tile still reaches grid day 1 (Task 3)

Same command, Scenario 4: SPC anchor's `nominalStartMs` pinned to `2026-09-05T12:00:00Z`, `helper._nowMs` pinned to `2026-09-06T06:00:00Z`. A precondition guard confirms the legacy `_heatRiskDayOffset` against `_todayUtcMs()` at that clock reading actually computes offset `0` for the `2026-09-05T12:00:00Z` tuple — i.e., that the legacy runner's `if (d < 1 || d > row.days) continue;` really would have discarded it — before asserting the grid-side outcome.

```
legacy _todayUtcMs: 2026-09-06T00:00:00.000Z legacy dayOffset for Sep-5-12Z tuple: -0 (0 means the legacy runner's `if (d < 1 ...) continue;` DISCARDS this tuple)
days.1.hazards: [{"dimension":"heat","source":"heatrisk","label":"2","text":"Moderate","value":2,"color":"f69632","suppressedBy":null}]
PASS: grid day 1 has a heatrisk entry (value 2) even though the legacy runner would have discarded this exact tuple as day offset 0
```

### End-to-end wiring (Task 3, full `getSpcOutlook` pipeline, both wave-2 sources enabled)

Command: `node harness-task3-e2e.js` — SPC day-1 fixture (`SLGT`, `VALID_ISO 2026-09-05T13:00:00Z` / `EXPIRE_ISO 2026-09-06T12:00:00Z`), HeatRisk identify response with two tuples (category 3 on `2026-09-05T12:00:00Z`, category 0 on `2026-09-06T12:00:00Z`), `showHazardsOutlook`/`showHeatRisk` both true, driven through the real `getSpcOutlook`.

```
legacy heatRisk.day1: {"category":3,"text":"Major","color":"e22f33"}
legacy heatRisk.day2: {"category":0,"text":"Little to No Risk","color":"e8f9e7"}
days.1.hazards: [{"dimension":"heat","source":"heatrisk","label":"3","text":"Major","value":3,"color":"e22f33","suppressedBy":null}]
days.2.hazards: []
PASS: end-to-end wiring confirmed -- gridTuples flow from _runHeatRiskProduct through to days[].hazards, legacy heatRisk block unchanged
```

### Probe suite (run after every task)

`node scripts/probe-payload-resilience.js | tail -3` → `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0, after Task 1, Task 2, and Task 3 individually. `assertHazardsBlockIntact`/`assertHeatRiskBlockIntact` (part of `assertPayloadIntact`'s per-`kind` dispatch) run in every scenario, so a green run is the D-01 byte-for-byte guarantee.

## Decisions Made

See `key-decisions` in the frontmatter. In brief: `hazardTaxonomy.js`'s `require()` landed here (D-06's first consumer); Task 2/Task 3 were kept as genuinely separate commits by temporarily withholding Task 3's `NO_RISK_FLOOR` import, method, and wiring call until Task 2's own acceptance criteria had been independently verified without them; the HeatRisk collision guard was collapsed to its one reachable branch after tracing through that an "existing entry below the floor" state is unreachable by construction.

## Deviations from Plan

None — plan executed as written. The verbatim acceptance-criteria assertions (grid day placement, dimension resolution, unmapped-label recording, `reportedDays`/`activeDays` bookkeeping, the 00Z–12Z HeatRisk case, the registry-derived span bound, the clamped loop headers) all passed on first implementation; no auto-fix rules were triggered.

## Assumption Drift (advisory)

None material. One cosmetic note: the plan's acceptance criteria described the near-boundary and category-mapping scratch harnesses as run "through the probe's `loadNodeHelper`/`installHttp` seams" generically; for the accumulator-specific assertions (`reportedDays`/`activeDays`/`unmappedLabels`, which are internal closures inside `getSpcOutlook` with no payload-visible surface) the harness called `_addHazardsOutlookGridEntries`/`_addHeatRiskGridEntries` directly with a hand-built `notes` bundle rather than routing through a full `getSpcOutlook` HTTP-stub pipeline. This is a stronger, more direct proof of the exact behavior under test (the day-grid placement scenarios were separately proven end-to-end through the full pipeline), not a weaker one — noted here only because the plan's prose implied one harness shape throughout.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `_addHazardsOutlookGridEntries`/`_addHeatRiskGridEntries` are stable per-source grid-entry builders; 18-04 can follow the identical `(gridDays, rawSideChannel, anchorInfo, notes)` shape for the remaining four sources (`spc-convective`, `spc-fire`, `wpc-ero`, `wpc-wssi`).
- `reportedDays`/`activeDays`/`unmappedLabels` now have real writers for two of six day-scoped sources; 18-05's `sources[]` assembly can read them for `wpc-hazards`/`heatrisk` today and will gain the other four from 18-04.
- No blockers. `node scripts/probe-payload-resilience.js` remains at `91 passed, 0 failed, 0 skipped` — the eight legacy payload blocks are provably untouched.
- Deferred item carried forward unchanged from CONTEXT.md: "how 16 D-04's multi-day span features re-map onto the 12Z grid" — this plan deliberately left window-band membership on the legacy `_todayUtcMs`-anchored decision, per the plan's own explicit instruction.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: node_helper.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-03-SUMMARY.md
- FOUND: f89183d (Task 1 feat commit)
- FOUND: 585ccfb (Task 2 feat commit)
- FOUND: cf17a98 (Task 3 feat commit)
- FOUND: 34874eb (docs summary commit)
