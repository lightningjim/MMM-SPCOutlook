---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
plan: 06
subsystem: testing
tags: [probe-suite, hazards-outlook, mutation-testing, node_helper, MMM-SPCOutlook.js]

# Dependency graph
requires:
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-03)
    provides: "_runArcGisHazardWindowProduct, the hazardsOutlook payload block, and the documented route-table gap (no existing scenario enables showHazardsOutlook)"
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-05)
    provides: "renderHazardsDays/renderHazardsWindowBand frontend renderers, gated on showHazardsOutlook"
provides:
  - "HAZARDS_URLS, HAZARDS_NOW_MS, hazardsRoutes/hazardsFeature/hazardsCollection fixture infrastructure in scripts/probe-payload-resilience.js"
  - "assertHazardsBlockIntact — the hazardsOutlook block's own D-05 shape gate (13 keys: day3..day14 + windowBand)"
  - "10 hazards-* probe scenarios covering HAZ-01 day-bucketing, HAZ-03 lowercase-label read, D-02 ordering, D-11 unmapped-label logging, zero-feature/toggle-off cases, and HAZ-04 Flooding/Drought filtering at both the payload and the DOM"
  - "11 mutation proofs (file:line, verbatim RED message) as input to 16-08's phase mutation inventory"
affects: [16-07, 16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Fixture literals for a filter's own excluded-value set, not derived from the same mutable registry field the filter reads — validated against the registry as a staleness guard, not used as the fixture's input, to avoid the 'fixture that cannot express its own condition' vacuity mode (Phase 15 D-10)"
    - "Three-run toggle sweep (bare true / explicit sub-toggle true / truthy non-boolean sub-toggle) to prove a strict === true gate cannot be defeated by a truthy-but-not-boolean value, with a same-run control asserting the unrelated positive case still renders"

key-files:
  created: []
  modified:
    - scripts/probe-payload-resilience.js

key-decisions:
  - "Used a genuinely unmapped label (\"Dense Fog\") instead of the plan's suggested \"Frost/Freeze\" for the D-11 scenario, because PRODUCT_REGISTRY.hazardsOutlook.displayColor already maps \"Frost/Freeze\" in the current registry — see Assumption Drift below"
  - "Built the Flooding-labels fixture from literal strings validated against the registry (equality check, not fixture input) rather than reading PRODUCT_REGISTRY.hazardsOutlook.excludedLabels directly into the fixture — self-caught via mutation-proofing before commit, see Deviations"

patterns-established:
  - "Registry-derived fixture labels are safe for assertions/expectations but NOT for building the fixture that tests a filter over that same field — a literal-with-staleness-check pattern is required when a mutation must be able to empty the field under test"

requirements-completed: [HAZ-01, HAZ-03, HAZ-04, DATA-02]

# Metrics
duration: ~45min
completed: 2026-08-26
---

# Phase 16 Plan 06: Hazards Outlook Probe Scenarios (Part 1) Summary

**Added the Hazards Outlook fixture/route infrastructure and 10 mutation-proven probe scenarios to `scripts/probe-payload-resilience.js`, covering HAZ-01 day-bucketing, HAZ-03's lowercase-label read, D-02 ordering, D-11 unmapped-label logging, the zero-feature/toggle-off cases, and HAZ-04's Flooding exclusion and Drought opt-in gate at both the payload and the real DOM renderer.**

## Performance

- **Duration:** ~45 min
- **Completed:** 2026-08-26
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments

- `HAZARDS_URLS` is derived exclusively from `PRODUCT_REGISTRY.hazardsOutlook.layers`/`buildUrl` — no hazards URL literal appears anywhere in the probe file (verified by the plan's own automated grep-style check)
- `hazardsRoutes(overrides)` covers all six hazards URLs plus every ERO/WSSI URL and the `.lyr.geojson` catch-all, mirroring `eroHttpRoutes`/`wssiRoutes`'s WR-02 discipline; `hazards-routes-are-quiet-by-default` pins that the default (zero-override) table cannot itself set `anyStale`
- `hazardsFeature`/`hazardsCollection` build fixtures carrying only a lowercase `label` (never uppercase `LABEL`), matching HAZ-03/Pitfall 8's exact trap
- `assertHazardsBlockIntact` is the hazardsOutlook block's own D-05 shape gate (13 keys), independent of `assertPayloadIntact`'s top-level day1-day8 coverage
- Confirmed (Part B) that **no existing scenario needs a hazards route repair**: zero pre-16-06 scenarios enable `showHazardsOutlook`, matching 16-03's own investigation exactly — nothing to touch, nothing broken
- HAZ-01's day-bucketing is proven end to end with no live example available (both live Precipitation layers returned zero features on 2026-08-26): a two-day span buckets onto both days, a one-day span onto one, with a precondition guard proving the fixture actually reached the payload
- HAZ-03's lowercase-`label` read is proven with a control feature carrying ONLY an uppercase `LABEL` producing no entry
- D-02 ordering is proven across two differently-wrong response orderings producing the identical registry-declared output order
- D-11's once-per-process unmapped-label log is proven with a mapped-label control producing no log line
- HAZ-04's Flooding exclusion is proven across three toggle combinations (including a truthy non-boolean `showDrought`) with a Heavy Rain control in every run; Drought's strict `=== true` gate is proven hidden at default, immune to a truthy non-boolean opt-in, and shown only on explicit opt-in, with `Critical Wildfire Risk` (a co-labeled, non-drought hazard on the same layer) as the control that catches a filter mistakenly dropping the whole layer instead of just the drought labels
- HAZ-04 is additionally proven at the real DOM renderer (`renderDom`), not just the payload, per CR-01's lesson that a payload-only assertion can report a guarantee met while the display shows something else
- Probe suite: 48 (pre-existing baseline) → 58 passed, 0 failed, 0 skipped after all three tasks

## Task Commits

Each task was committed atomically:

1. **Task 1: Hazards route table, fixture builder, and the existing-suite route repair** - `32ef9b4` (feat)
2. **Task 2: HAZ-01 day-bucketing and HAZ-03 lowercase-label scenarios** - `af9d091` (feat)
3. **Task 3: HAZ-04 Flooding and Drought scenarios** - `0aec941` (feat)

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — added `HAZARDS_URLS`, `HAZARDS_NOW_MS`, `hazardsRoutes`, `hazardsFeature`, `hazardsCollection`, `assertHazardsBlockIntact`, and 10 `hazards-*` scenarios. 659 lines added across the whole plan, 0 removed (pure additions, confirmed by `git diff --stat` after each task).

## Probe Suite Scenario Counts

| Point in plan | Passed | Failed | Skipped |
|---|---|---|---|
| Baseline (pre-16-06) | 48 | 0 | 0 |
| After Task 1 | 49 | 0 | 0 |
| After Task 2 | 55 | 0 | 0 |
| After Task 3 | 58 | 0 | 0 |

## Existing-Suite Route Repair (Task 1, Part B)

**None needed.** Investigated directly: `grep -n "showHazardsOutlook" scripts/probe-payload-resilience.js` against the pre-16-06 file returned zero matches. This confirms 16-03-SUMMARY.md's own finding — `_runArcGisHazardWindowProduct` only enters its six-layer fetch loop when `productToggles.showHazardsOutlook` is truthy, and every scenario before this plan defaults every registry-derived toggle to false, so the six hazards fetches were dormant in all 48 pre-existing scenarios. No route table needed extending; `git diff` after Task 1 shows additions only (120 insertions, 0 deletions).

## Mutation Inventory (input for 16-08's phase mutation inventory)

All mutations were applied to the working tree, run against the target scenario, confirmed RED with a diagnosable message, then restored from a byte-identical scratchpad backup (`md5sum` match verified before and after every restore) before the next mutation.

### Task 2 (six mutations)

**#1 — `node_helper.js` `_bucketHazardMatch`'s day loop, changed `for (let d = Math.max(offsetStart, 3); d <= Math.min(offsetEnd, 14); d++)` to `for (let d = offsetStart; d <= offsetStart; d++)`.**
Target: `hazards-precip-spread-buckets-every-day-in-span`. RED:
```
day4 expected to contain Heavy Rain, got []
```

**#2 — `productRegistry.js` `hazardsOutlook.toValue`, changed to `(label, f) => label` (trusting the broken positional parameter).**
Target: `hazards-lowercase-label-is-read-not-dropped`. RED (naming the missing Heavy Rain):
```
expected day3.hazards to contain Heavy Rain (the lowercase-label feature), got [{"label":"Heavy Snow","color":"0084a8","mapped":true}]
```
(Collateral: 3 other hazards-* scenarios that build fixtures via `hazardsFeature` also failed under this shared-helper mutation — expected, since `toValue` is used by every hazards scenario; the target scenario's own message names the missing label as required.)

**#3 — `node_helper.js`, removed the `hazards.sort((a, b) => compareLabels(a.label, b.label));` comparator call so hazards keep response order.**
Target: `hazards-day-order-follows-the-registry-not-the-response`. RED on the first ordering:
```
first response order: expected day3 order ["Severe Weather","Heavy Rain","Heavy Ice"], got ["Heavy Ice","Heavy Rain","Severe Weather"]
```

**#4 — `node_helper.js`, removed the `_loggedUnmappedHazardLabels` guard (`if (!mapped)` instead of `if (!mapped && !this._loggedUnmappedHazardLabels.has(label))`), so the log fires per feature.**
Target: `hazards-unmapped-label-renders-verbatim-and-logs-once`. RED naming the log count:
```
expected exactly one log line naming Dense Fog, got 2: [...]
```

**#5 — `node_helper.js`, added an `else { anyStale = true; }` to the freshness check so a zero-feature layer is treated as maximally stale.**
Target: `hazards-zero-feature-layers-render-nothing-and-are-not-stale`. RED on `_stale`:
```
a zero-feature response on every layer must not be flagged stale
```
(Collateral: `hazards-routes-are-quiet-by-default` also failed under this mutation, as expected — same code path.)

**#6 — `node_helper.js`, removed the `productToggles[row.configFlag]` guard (`if (true) { ... }` instead of `if (productToggles[row.configFlag]) { ... }`) from the hazards runner's fetch loop.**
Target: `hazards-toggle-off-emits-the-full-block-and-fetches-nothing`. RED naming a fetched URL:
```
fetchGeoJsonCached was called with a hazards URL while the toggle was off: https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/1/query?where=1%3D1&outFields=*&f=geojson
```

### Task 3 (five mutations)

**#1 — `productRegistry.js`, emptied `hazardsExcludedLabels` to `[]`.**
Target: `hazards-flooding-labels-never-appear-under-any-toggle`. RED naming the Flooding labels (via the scenario's own literal/registry staleness guard — see Deviations below for why this scenario's fixture is literal-based):
```
this scenario's literal Flooding label set has drifted from the registry's excludedLabels — update both: literal=["Flooding Likely","Flooding Occurring or Imminent","Flooding Possible"], registry=[]
```

**#1b — `node_helper.js`, changed the runner's `includesFeat` Flooding check to also consult `productToggles.showDrought` (`if (row.excludedLabels.includes(val) && productToggles.showDrought !== true) return false;`).**
Target: same scenario, RED on its second run (`showDrought:true`), proving the three-run structure is load-bearing:
```
toggles={"showHazardsOutlook":true,"showDrought":true}: a Flooding label reached the payload: {"day3":{"date":"2026-08-29","hazards":[{"label":"Heavy Rain",...},{"label":"Flooding Likely","color":"aaaaaa","mapped":false},{"label":"Flooding Occurring or Imminent","color":"aaaaaa","mapped":false},{"label":"Flooding Possible","color":"aaaaaa","mapped":false}]},...}
```

**#2 — `node_helper.js`, loosened the D-10 gate from `productToggles.showDrought !== true` to `!productToggles.showDrought`.**
Target: `hazards-drought-is-hidden-at-the-default-and-shown-only-on-opt-in`. RED on the truthy non-boolean run:
```
showDrought:"yes" (truthy non-boolean): a drought label reached windowBand: [{"label":"Critical Wildfire Risk",...},{"label":"Severe Drought",...},{"label":"Rapid Onset Drought Risk",...}]
```
This confirms the plan's own warning that a naive two-run version of this scenario would NOT catch this mutation — the truthy-non-boolean run was included proactively in the scenario as written (not added after a failed mutation check) and is exactly what catches it.

**#2b — `node_helper.js`, replaced the label-level drought filter with a layer-level skip (`if (layer.group === "wildfireDrought" && productToggles.showDrought !== true) continue;`), dropping the entire wildfireDrought group rather than just the drought labels within it.**
Target: same scenario, RED on the `Critical Wildfire Risk` control at the default toggles:
```
default toggles: control failed — Critical Wildfire Risk did not reach windowBand: []
```

**#3 — `MMM-SPCOutlook.js`, removed the `renderHazardsWindowBand(this.spcrisk.hazardsOutlook);` call from `getDom`.**
Target: `hazards-frontend-renders-no-flooding-or-drought-at-the-default`. RED on the `Critical Wildfire Risk` control:
```
control failed: Critical Wildfire Risk missing from rendered markup: Hazards (Sat, Day 3): <span style="color:#267300">Heavy Rain</span><br/>
```

## Decisions Made

- Used "Dense Fog" instead of the plan's "Frost/Freeze" for the D-11 unmapped-label scenario — see Assumption Drift below.
- Built the Flooding-labels fixture (Task 3, scenario 1) from literal strings validated against `PRODUCT_REGISTRY.hazardsOutlook.excludedLabels` via an equality check, rather than reading the registry field directly into the fixture — see Deviations below.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught] Fixed a fixture-vacuity bug in `hazards-flooding-labels-never-appear-under-any-toggle` before commit**
- **Found during:** Task 3, mutation-proof step for mutation #1 (empty `hazardsExcludedLabels`)
- **Issue:** The scenario's first draft built its Flooding fixture by mapping over `PRODUCT_REGISTRY.hazardsOutlook.excludedLabels` directly (following the plan's acceptance criteria wording "read from the registry, not literals"). Running mutation #1 against this draft produced an unexpected **PASS** instead of the required RED: emptying the registry's `excludedLabels` array also emptied the scenario's own fixture (since it iterated the same, now-empty, array), so the fixture never sent any Flooding feature and the assertion "no Flooding reached the payload" was trivially true. This is exactly the "fixture that cannot express its own condition" vacuity mode named in STATE.md (Phase 15 D-10, from the 15-02 KMZ round-trip precedent).
- **Fix:** Rewrote the fixture to use three literal label strings (`"Flooding Likely"`, `"Flooding Occurring or Imminent"`, `"Flooding Possible"`), independent of the mutable registry field under test. Added an equality check at the top of the scenario comparing the literals against `PRODUCT_REGISTRY.hazardsOutlook.excludedLabels` (sorted, `JSON.stringify` comparison) as a staleness guard — this satisfies the acceptance criteria's underlying intent (a registry change cannot leave the scenario silently asserting a stale expectation) without reintroducing the vacuity, because the guard is read for *validation*, not used to *build the fixture*.
- **Files modified:** `scripts/probe-payload-resilience.js`
- **Verification:** Re-ran mutation #1 after the fix — RED, naming the drifted literal/registry sets (see Mutation Inventory #1 above). Full suite green (58/0/0) with the fix in place before mutation testing, and green again after every restore.
- **Committed in:** `0aec941` (Task 3 commit — the fixture was written and fixed before the task's single commit, so no separate fix commit exists)

---

**Total deviations:** 1 auto-fixed (1 self-caught bug, found via the plan's own required mutation-proof step)
**Impact on plan:** No scope creep. The fix is exactly what the plan's mutation-proof requirement exists to catch, and it was caught during execution rather than shipped as a silent gap. `hazards-drought-is-hidden-at-the-default-and-shown-only-on-opt-in`'s drought-label assertions still read expected values from `PRODUCT_REGISTRY.hazardsOutlook.droughtLabels` directly (not literals) because no mutation in this plan targets emptying that array — only the label-filtering *logic* (mutations #2/#2b), so no equivalent vacuity risk exists there.

## Assumption Drift (advisory)

- **Found during:** Task 2, writing `hazards-unmapped-label-renders-verbatim-and-logs-once`.
- **Planned:** The plan names `"Frost/Freeze"` as a "never-observed-live" label to use as the D-11 unmapped-label fixture, implying it is absent from `PRODUCT_REGISTRY.hazardsOutlook.displayColor`.
- **Actual:** The current registry (`productRegistry.js` line 184) already maps `"Frost/Freeze": "c500ff"` in `hazardsDisplayColor`. Running the scenario as planned produced `mapped: true`, not the required `mapped: false` — this was caught immediately on the first suite run (before any mutation testing), not silently shipped.
- **Why:** Environmental/documentation drift — the registry evidently gained a `Frost/Freeze` display-color entry (RESEARCH.md's live Colors table, 16-01) after the phase's plan text was drafted with an older assumption about which labels were mapped. Non-blocking: switched to `"Dense Fog"`, confirmed absent from `displayColor`, `excludedLabels`, `droughtLabels`, and `order` at the time this scenario was written, and documented here per the assumption-drift advisory protocol rather than treated as a fixture defect requiring a plan change.

## Issues Encountered

None beyond the self-caught fixture-vacuity bug documented above, which the plan's own mutation-proof requirement is designed to surface and did.

## Probe Suite Impact

The full probe suite (`node scripts/probe-payload-resilience.js`) was run after every task and after every one of the 11 mutation restores, reporting **58 passed, 0 failed, 0 skipped** at every green checkpoint (48 baseline, 49 after Task 1, 55 after Task 2, 58 after Task 3). No pre-existing scenario regressed at any point.

## Known Stubs

None. Every new scenario drives the real `_runArcGisHazardWindowProduct`/`extractPolygons`/`evaluatePolygonsCollectAll` path via the `installHttp` HTTP seam (never a higher-level stub), and the Task 3 end-to-end scenario additionally drives the real `getDom` renderer via `renderDom`. No placeholder data or unwired assertion exists in any of the 10 new scenarios.

## Threat Flags

None new beyond the plan's own `<threat_model>` register (T-16-23 through T-16-26, T-16-SC). T-16-23 (a scenario green while proving nothing) is the exact threat the self-caught fixture-vacuity deviation above demonstrates and closes — every new scenario carries either a control assertion or a precondition guard as specified, and the one gap found was found by the plan's own required mechanism before commit, not after. No npm/pip/cargo package was installed.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-07 can build directly on `HAZARDS_URLS`, `HAZARDS_NOW_MS`, `hazardsRoutes`, `hazardsFeature`, `hazardsCollection`, and `assertHazardsBlockIntact` for its two highest-risk regressions (day-offset drift on a cache hit, and the window-band gate), deliberately left out of this plan's scope.
- 16-08's phase mutation inventory can consume the 11 mutations recorded above verbatim (file:line, verbatim RED message).
- No blockers. The Flooding/Drought filtering guarantees (HAZ-04) are now proven at both the payload and the DOM, closing the exact class of gap CR-01 named (a payload-only assertion reporting a guarantee met while the display disagrees).

---
*Phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook*
*Completed: 2026-08-26*

## Self-Check: PASSED
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `32ef9b4` (Task 1 commit)
- FOUND: `af9d091` (Task 2 commit)
- FOUND: `0aec941` (Task 3 commit)
- FOUND: `.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-06-SUMMARY.md`
- Probe suite re-run at self-check time: 58 passed, 0 failed, 0 skipped
