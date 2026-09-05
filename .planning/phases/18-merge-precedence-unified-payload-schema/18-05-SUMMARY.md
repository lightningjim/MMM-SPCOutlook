---
phase: 18-merge-precedence-unified-payload-schema
plan: 05
subsystem: data
tags: [merge-precedence, day-grid, payload-schema, node.js]

# Dependency graph
requires:
  - phase: 18-01
    provides: hazardTaxonomy.js (PRECEDENCE, DIMENSION_ORDER, SOURCE_IDS, DAY_SOURCE_IDS, ADVISORY_SOURCE_IDS, NO_RISK_FLOOR, dimensionOf)
  - phase: 18-02
    provides: _spcGridAnchor/_gridDayOf/_buildGridDays, the fourteen-key `days` skeleton, GRID_DAY_COUNT
  - phase: 18-03
    provides: _addHazardsOutlookGridEntries, _addHeatRiskGridEntries, and the reportedDays/activeDays/unmappedLabels accumulators
  - phase: 18-04
    provides: _addSpcGridEntries, _addRegistryDayGridEntries, staleBySource/noteStale per-source stale attribution
provides:
  - "_resolveGridDayPrecedence(day, dayNumber, reportedDays): per-dimension winner-take-suppression resolver, dimension-keyed only, plus D-15's total deterministic ordering"
  - "_buildGridSummary(gridDays, windowBand, advisories, sourceHealth, anchorInfo): D-16/D-20 rollup, never a second precedence pass"
  - "_buildSourceHealth(productToggles, reportedDays, activeDays, unmappedLabels, staleBySource, gridAnchorInfo, results): per-source health for all eight hazardTaxonomy.SOURCE_IDS"
  - "getSpcOutlook's return object gains exactly two new keys, summary and sources, beside the untouched days/legacy blocks"
affects: [18-06, 18-07, 18-08, 19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Per-grid-day, per-dimension winner resolution: walk PRECEDENCE[dimension] and take the first source with an entry; every other entry on that dimension gets suppressedBy = winner's id. Absent-vs-below-floor is preserved as two distinct, individually commented branches that both reduce to 'the walk continues' rather than diverging in outcome."
    - "Rollup-not-second-pass: _buildGridSummary counts over already-resolved days/sourceHealth and never re-derives from raw values, so summary and days cannot disagree about what is present."
    - "reporting means 'we got an answer', gated on enabled for every source uniformly, distinct from activeDays which means 'found a hazard'."

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "_resolveGridDayPrecedence's reportedDays parameter does not change which source wins (a source with no entry cannot win either way); it exists solely to keep 'rank source absent' and 'rank source reported below floor' as two distinct, separately commented code branches per D-14's RESEARCH.md requirement, since both currently produce the identical visible outcome."
  - "_buildGridSummary accepts an anchorInfo parameter per the plan's stated signature but does not use it: windowStart/windowEnd are read from gridDays itself (already anchored by 18-02), so summary and days can never disagree about a boundary the anchor would otherwise have to re-derive. Documented as parameter-contract-only in the JSDoc and marked with `void anchorInfo`."
  - "[Rule 1 - Bug] _buildSourceHealth's `reporting` field is gated on `enabled` for every source, not only the two advisory ones the plan's literal formula named. wpc-ero/wpc-wssi's toggle-off default ('NONE' seeded before the fetch gate in 18-04's _runArcGisDayProduct) makes _addRegistryDayGridEntries call noteReported for every day even when never fetched, unlike HeatRisk's empty-gridTuples-when-off path. Without this gate a disabled product would report `reporting: true`. The underlying reportedDays-array over-population (a lower-severity cosmetic symptom of the same root cause, invisible to any caller reading `reporting`) is logged in deferred-items.md rather than fixed here, since its root cause lives in 18-04's already-committed _addRegistryDayGridEntries and is out of this task's scope."

patterns-established:
  - "A merge-stage resolver/rollup function takes only its own resolved inputs (a grid day, the sourceHealth object, etc.) and never reaches into PRECEDENCE/NO_RISK_FLOOR a second time once entry-creation-time floor tests have already run -- the discipline 18-06/18-07/18-08 should hold to for any further payload-shape work in this phase."

requirements-completed: [MERGE-02, MERGE-03, MERGE-04, RPT-07]

# Metrics
duration: ~30min
completed: 2026-09-05
---

# Phase 18 Plan 05: Merge Precedence Resolution and Unified Payload Schema Summary

**Cross-source precedence is now resolved per grid day (dimension-keyed, never label-string matching), each day's survivors are ordered into a deterministic taxonomy-fixed array, and the payload gains `summary`/`sources` siblings beside the untouched legacy blocks -- closing RPT-07's "no precedence logic left to recompute downstream."**

## Performance

- **Duration:** ~30 min
- **Started:** 2026-09-05T17:51:00Z (following 18-04)
- **Completed:** 2026-09-05T18:20:45Z
- **Tasks:** 3 completed
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments

- `_resolveGridDayPrecedence` mutates one grid day's `hazards` array in place: per dimension, the first source in `PRECEDENCE[dimension]` with an entry wins (`suppressedBy: null`); every other entry on that dimension is marked `suppressedBy: <winner's source id>`. `dimension: null` (D-07 unmapped) entries never participate. Entries are then sorted by `DIMENSION_ORDER`, survivors before suppressed within a dimension, then `PRECEDENCE` rank, then label -- a total, deterministic order proven byte-identical across repeated runs of the same fixture.
- The "rank-1 absent" and "rank-1 reported-below-floor" cases are kept as two distinct, individually commented branches inside the resolver's rank walk, per D-14's explicit requirement, without letting the distinction change which source wins (both reduce to "the walk continues to the next rank").
- `_buildGridSummary` rolls up the fourteen already-resolved grid days, the Hazards Outlook window band, and both advisory arrays into D-16's `summary` shape with D-20's `bandDiagnostics` nested extension. `anyHazard` is a union over all three signals so an advisory-only or band-only state can never read as an all-clear (the Phase 15 MPD-01 and Phase 16 no-risk-gate shapes). Never calls `_resolveGridDayPrecedence` or reads `PRECEDENCE`/`NO_RISK_FLOOR` -- a rollup, not a second pass.
- `_buildSourceHealth` returns all eight `hazardTaxonomy.SOURCE_IDS` always, regardless of any toggle, with `enabled`/`reporting`/`stale`/`idpFiledate`/`reportedDays`/`activeDays`/`unmappedLabels` and `gridAnchor` (spc-convective only).
- The return statement gains exactly two new sibling keys, `summary` and `sources`, after `days`; `git diff` confirms no deletion inside the return object literal's existing keys.
- The `@returns` JSDoc block now documents the resolved `days[].hazards` shape, `summary`, and `sources` in full, plus a closing paragraph stating D-01's "two representations of the same poll" invariant.
- All 91 pre-existing probe scenarios pass after every task.

## Task Commits

1. **Task 1: Resolve per-day precedence and order each day's hazards** - `04031d8` (feat)
2. **Task 2: Build the root summary rollup** - `9f366d4` (feat)
3. **Task 3: Build per-source health, wire summary and sources into the payload, and complete the JSDoc contract** - `d3575ff` (feat)

**Plan metadata:** (this commit) `docs(18-05): complete merge precedence resolution and unified payload schema plan`

## Files Created/Modified

- `node_helper.js` -- Added `_resolveGridDayPrecedence`, `_buildGridSummary`, `_buildSourceHealth`; wired all three into `getSpcOutlook` immediately before the return statement; added `summary`/`sources` to the return object literal; extended the `@returns` JSDoc; extended the `hazardTaxonomy.js` import to include `PRECEDENCE`, `DIMENSION_ORDER`, `SOURCE_IDS`, `ADVISORY_SOURCE_IDS`.
- `.planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md` (new) -- logs the `wpc-ero`/`wpc-wssi` `reportedDays`-array over-population quirk found during Task 3, out of scope for this plan.

## Scratch Harness Evidence

All harnesses were run via `node <script>` from the repo root against the real `node_helper.js` through the probe suite's `loadNodeHelper`/`resetHelper`/`turfStub` seams (`scripts/probe-lib/module-stubs.js`), plus minimal local `installHttp`/`httpResponse` for the full-pipeline runs. Scripts lived under the session scratchpad directory, never inside the repo, and were not committed.

### Task 1: precedence resolution (direct calls to the real grid-entry-builder functions, then `_resolveGridDayPrecedence`)

MERGE-02, SPC SLGT + WPC Severe Weather on grid day 1:
```
Scenario 1 pre-resolution days.1.hazards: [{"dimension":"convective","source":"spc-convective","label":"SLGT",...,"suppressedBy":null},{"dimension":"convective","source":"wpc-hazards","label":"Severe Weather",...,"suppressedBy":null}]
Scenario 1 post-resolution days.1.hazards: [{...,"source":"spc-convective",...,"suppressedBy":null},{...,"source":"wpc-hazards",...,"suppressedBy":"spc-convective"}]
PASS: Scenario1: spc-convective entry present with suppressedBy null
PASS: Scenario1: wpc-hazards entry survives with suppressedBy spc-convective
```

MERGE-02 control, SPC TSTM (below floor) + WPC Severe Weather:
```
PASS: Scenario2 precondition: TSTM produced no spc-convective entry
PASS: Scenario2 precondition: reportedDays[spc-convective] contains day 1
PASS: Scenario2: wpc-hazards entry survives (suppressedBy null) via reported-below-floor path
```

MERGE-02 second control, grid day SPC never covers (feature landed on grid day 9):
```
PASS: Scenario3 precondition: wpc-hazards feature landed on some grid day
PASS: Scenario3 precondition: feature landed on grid day 9 or later (SPC's uncovered range), landed on 9
PASS: Scenario3 precondition: reportedDays[spc-convective] does NOT contain day 9
PASS: Scenario3: wpc-hazards entry on day 9 survives (suppressedBy null) via absent path
```

MERGE-03, HeatRisk 0/null/2 alongside WPC Hazardous Heat:
```
PASS: Scenario4 (category 0) precondition: no heatrisk entry created (below floor)
PASS: Scenario4 (category 0): wpc-hazards Hazardous Heat survives (suppressedBy null)
PASS: Scenario4 (category null) precondition: no heatrisk entry created (below floor)
PASS: Scenario4 (category null): wpc-hazards Hazardous Heat survives (suppressedBy null)
PASS: Scenario4 (category 2) precondition: heatrisk entry created
PASS: Scenario4 (category 2): heatrisk entry survives (suppressedBy null)
PASS: Scenario4 (category 2): wpc-hazards Hazardous Heat suppressed by heatrisk
```

MERGE-04, ERO flash-flood + WPC Heavy Rain heavy-precip, same day:
```
PASS: Scenario5 precondition: ERO entry is flash-flood
PASS: Scenario5 precondition: WPC Heavy Rain entry is heavy-precip
PASS: Scenario5: flash-flood (ERO) entry carries suppressedBy null
PASS: Scenario5: heavy-precip (WPC) entry carries suppressedBy null
```

Determinism, same fixture run twice:
```
PASS: Scenario6: determinism -- two polls over the unchanged fixture produce byte-identical days
Scenario6 run1 length: 1963 run2 length: 1963 equal: true
```

Label-matching grep gate: `awk` over `_resolveGridDayPrecedence`'s body + `grep -nE "label ?===|label ?\.includes\(|indexOf\(label"` -> no matches (clean).

Probe suite after Task 1: `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0.

### Task 2: `_buildGridSummary` (direct calls with a hand-built `sourceHealth` stub)

All-quiet:
```
Scenario1 out: {"anyHazard":false,"dimensions":[],"activeDays":[],"windowStart":"2026-09-05T13:00:00.000Z","windowEnd":"2026-09-19T12:00:00.000Z","enabledSourceCount":0,"reportingSourceCount":0,"bandDiagnostics":{"windowBandCount":0,"advisoryCount":0}}
```

D-20 shape check:
```
Scenario2 keys: ["anyHazard","dimensions","activeDays","windowStart","windowEnd","enabledSourceCount","reportingSourceCount","bandDiagnostics"]
PASS: Scenario2: Object.keys exactly matches D-16's seven flat fields + bandDiagnostics
```

Advisory-only:
```
Scenario3 out: {"anyHazard":true,...,"bandDiagnostics":{"windowBandCount":0,"advisoryCount":1}}
```

Band-only:
```
Scenario4 out: {"anyHazard":true,...,"bandDiagnostics":{"windowBandCount":1,"advisoryCount":0}}
```

Unmapped-only:
```
Scenario5 out: {"anyHazard":true,"dimensions":[],"activeDays":[1],...}
```

`activeDays`/`days` cross-check (a suppressed day-7 entry does NOT count):
```
Scenario6 activeDays: [3]
PASS: Scenario6: activeDays lists only day 3 (day 7's entry is suppressed)
PASS: Scenario6 cross-check: day 3 has a surviving entry, matching summary/days agreement invariant
```

`enabledSourceCount`/`reportingSourceCount` over `sourceHealth`:
```
Scenario7 counts: 2 1
```

`grep -n "PRECEDENCE\|NO_RISK_FLOOR"` restricted to `_buildGridSummary`'s body -> no matches (clean).

Probe suite after Task 2: `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0.

### Task 3: `_buildSourceHealth` and full-pipeline wiring

Every toggle OFF:
```
ScenarioA sources keys: ["spc-convective","spc-fire","wpc-ero","wpc-wssi","wpc-hazards","heatrisk","spc-md","wpc-mpd"]
PASS: ScenarioA: exactly 8 sources keys
PASS: ScenarioA: sources keys match SOURCE_IDS element for element
PASS: ScenarioA: days still has all fourteen keys
PASS: ScenarioA: sources.heatrisk.enabled is false (toggle off)
PASS: ScenarioA: sources.heatrisk.reporting is false (toggle off)
```

Every toggle ON, real fixtures (SPC day1 SLGT with VALID_ISO/EXPIRE_ISO, ERO day1 SLGT, WSSI day1 MINOR, a Hazards Outlook layer-4 "Severe Weather" + unrecognised "Volcanic Ash" feature, a healthy 7-day HeatRisk identify response):
```
ScenarioB sources.heatrisk: {"id":"heatrisk",...,"enabled":true,"reporting":true,...,"reportedDays":[1,2,3,4,5,6,7],"activeDays":[1,2,3,4,5,6,7],"unmappedLabels":[]}
ScenarioB sources['wpc-hazards']: {"id":"wpc-hazards",...,"enabled":true,"reporting":true,...,"reportedDays":[4],"activeDays":[4],"unmappedLabels":["Volcanic Ash"]}
PASS: ScenarioB: sources.heatrisk.reporting is true
PASS: ScenarioB: sources['wpc-hazards'].reporting is true
PASS: ScenarioB: sources.heatrisk.reportedDays is non-empty
PASS: ScenarioB: sources['wpc-hazards'].reportedDays is non-empty
PASS: ScenarioB: summary.reportingSourceCount (6) equals independently-counted reporting sources (6)
PASS: ScenarioB: sources['spc-convective'].gridAnchor is 'observed' with VALID_ISO/EXPIRE_ISO supplied
PASS: ScenarioB: 'Volcanic Ash' appears in sources['wpc-hazards'].unmappedLabels
PASS: ScenarioB: 'Volcanic Ash' appears as a days[N].hazards entry
PASS: ScenarioB: 'Volcanic Ash' entry carries dimension: null
PASS: ScenarioB: 'Volcanic Ash' entry carries suppressedBy: null (never suppressed)
ScenarioB Volcanic Ash entry: {"day":"4","entry":{"dimension":null,"source":"wpc-hazards","label":"Volcanic Ash","text":"Volcanic Ash","value":null,"color":"aaaaaa","suppressedBy":null}}
```

Forced SPC day-1 fetch failure:
```
ScenarioC sources['spc-convective']: {..."stale":true,"gridAnchor":"estimated",...}
ScenarioC sources['wpc-ero']: {..."stale":false,...}
PASS: ScenarioC: gridAnchor is 'estimated' on a hard day-1 fetch failure
PASS: ScenarioC: sources['spc-convective'].stale is true
PASS: ScenarioC: sources['wpc-ero'].stale is false (per-source attribution, unaffected by SPC's failure)
```

Toggle-off `reportedDays` quirk found and mitigated (see Deviations below):
```
Before the Rule 1 fix: sources['wpc-ero'] with toggle OFF: {"enabled":false,"reporting":true,...,"reportedDays":[1,2,3,4,5],...}
After the Rule 1 fix:  sources['wpc-ero'] with toggle OFF: {"enabled":false,"reporting":false,...,"reportedDays":[1,2,3,4,5],...}
```

JSDoc/legacy-preservation grep gates: `grep -c "suppressedBy" node_helper.js` = 18 (includes JSDoc hits); the `@returns` block contains both `reportedDays` and `activeDays`; `git diff node_helper.js | grep '^-'` inside the return object literal shows only the rewritten JSDoc paragraph and the reformatted `days: gridDays` line (now followed by `summary:`/`sources:`), no deletion of an existing key.

Probe suite after Task 3: `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0.

### RPT-07 self-check

Ran a full pipeline (SPC day1 SLGT with VALID_ISO/EXPIRE_ISO, `wpc-hazards` layer 4 "Severe Weather" landing on the same grid day) and derived both render levels from the payload alone:
```
days.1.hazards: [{"dimension":"convective","source":"spc-convective","label":"SLGT",...,"suppressedBy":null},{"dimension":"convective","source":"wpc-hazards","label":"Severe Weather",...,"suppressedBy":"spc-convective"}]
compact render (day 1): ["SLGT"]
detailed render (day 1): [{"label":"SLGT","sourceLabel":"SPC Convective Outlook","suppressedBy":null},{"label":"Severe Weather","sourceLabel":"WPC/CPC Hazards Outlook","suppressedBy":"spc-convective"}]
RPT-07 self-check: PASS -- both render levels derived from days[]+sources[] alone, no PRECEDENCE/NO_RISK_FLOOR/raw-value read required.
```
**Answer:** compact = `days[N].hazards.filter(h => h.suppressedBy === null)` in array order; detailed = the same array unfiltered, each entry labelled via `sources[h.source].displayName`. No remaining question requires reading `PRECEDENCE`, `NO_RISK_FLOOR`, or any raw source value from the frontend. The one field a renderer would still have to derive on its own is purely presentational and out of this phase's scope by design (D-15): how to lay out/truncate a day's compact line when it has many survivors, and how to join multiple days into the eventual Phase 19 display -- row budget was deliberately left undefined here as a layout concern, not a precedence one.

## Decisions Made

See `key-decisions` in the frontmatter. In brief: the `reportedDays` parameter to `_resolveGridDayPrecedence` never changes the winner, only keeps the absent-vs-below-floor distinction visible in code structure per D-14; `_buildGridSummary`'s `anchorInfo` parameter is accepted (per the plan's own signature) but intentionally unused, since `windowStart`/`windowEnd` are read from `gridDays`; `_buildSourceHealth`'s `reporting` field is gated on `enabled` for every source (Rule 1 fix, detailed below) rather than only the two advisory sources the plan's literal formula named.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Gated `sources[].reporting` on `enabled` for every source, not only the two advisory ones**
- **Found during:** Task 3, while writing the ScenarioC-adjacent toggle-off check for `wpc-ero`
- **Issue:** `_runArcGisDayProduct` (used by `wpc-ero`/`wpc-wssi`) seeds every `day{N}Risk` to the string `"NONE"` before checking its toggle, so `_addRegistryDayGridEntries` (18-04) calls `notes.noteReported` for every day even when the product's toggle is off and no fetch ever ran. The plan's literal formula for day-scoped `reporting` (`(reportedDays[id] ? reportedDays[id].size : 0) > 0`, with no `enabled` gate) would therefore have produced `sources['wpc-ero'] = { enabled: false, reporting: true, ... }` for a disabled product -- a source claiming "we got an answer" it never asked for.
- **Fix:** `reporting` is now `!enabled ? false : <the plan's original per-kind test>` for every source, day-scoped or advisory alike. Verified with a standalone check: toggle off now correctly yields `reporting: false` for `wpc-ero` while the raw `reportedDays` array (a lower-severity, invisible-behind-`reporting` cosmetic symptom of the same root cause) is left as-is and logged to `deferred-items.md` rather than fixed, since its root cause lives in 18-04's already-committed `_addRegistryDayGridEntries`, out of this task's scope per the Scope Boundary rule.
- **Files modified:** `node_helper.js`
- **Verification:** `node scripts/probe-payload-resilience.js` -> 91/0/0 unaffected; standalone before/after check recorded above; ScenarioA/B/C in the harness all still pass with the gate in place.
- **Committed in:** `d3575ff` (Task 3 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Necessary for `sources[].reporting`'s own stated correctness contract ("we got an answer"); no scope creep -- the fix is fully contained inside the new `_buildSourceHealth` function this task itself introduces, and does not touch any prior plan's code.

## Assumption Drift (advisory)

None material. As with 18-03/18-04, every scratch-harness assertion that targets an internal-closure-only value (`reportedDays`/`activeDays`, or `_resolveGridDayPrecedence`/`_buildGridSummary` called directly) used a direct call with hand-built inputs rather than routing every single assertion through a full HTTP-stubbed `getSpcOutlook` pipeline. Task 3's wiring/toggle-shape assertions (ScenarioA/B/C) and the RPT-07 self-check DID run through the full pipeline. This is the stronger, more direct proof for each claim, not a weaker one -- noted only because the plan's prose describes the harnesses generically.

## Issues Encountered

None beyond the Rule 1 fix documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The payload now carries the complete `days`/`summary`/`sources` block beside the untouched eight legacy blocks; `git diff` confirms zero deletions inside the return object literal's existing keys.
- Phase 19's `getDom()` rewrite can consume `days[N].hazards.filter(h => h.suppressedBy === null)` for compact rendering and the full array plus `sources[h.source].displayName` for detail, with no precedence recomputation (RPT-07 confirmed above).
- `deferred-items.md` (new, this plan) carries forward the `wpc-ero`/`wpc-wssi` `reportedDays`-array over-population quirk for a future cleanup pass or for 18-08's mutation-proof scenario authoring to account for explicitly.
- No blockers. `node scripts/probe-payload-resilience.js` remains at `91 passed, 0 failed, 0 skipped`.
- PERF-03's cold-cache Pi measurement remains an open milestone-close item per D-19, unaffected by this plan.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: node_helper.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-05-SUMMARY.md
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md
- FOUND: 04031d8 (Task 1 feat commit)
- FOUND: 9f366d4 (Task 2 feat commit)
- FOUND: d3575ff (Task 3 feat commit)
