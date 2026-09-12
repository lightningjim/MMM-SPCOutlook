---
phase: 18-merge-precedence-unified-payload-schema
plan: 08
subsystem: testing
tags: [probe-suite, merge-precedence, summary-verdict, mutation-testing, spc-outlook]

# Dependency graph
requires:
  - phase: 18-01
    provides: hazardTaxonomy.js (PRECEDENCE, NO_RISK_FLOOR, DIMENSION_ORDER, SOURCE_IDS, dimensionOf)
  - phase: 18-05
    provides: _resolveGridDayPrecedence, _buildGridSummary, _buildSourceHealth, the summary/sources payload keys
  - phase: 18-07
    provides: the merge-grid-* scenario family and its two-phase run/control closure idiom
provides:
  - "18 mutation-proven probe scenarios (merge-precedence-*, merge-flash-flood-*, merge-distinct-*, merge-unmapped-*, merge-summary-*, merge-sources-*, merge-parity-*) pinning MERGE-02, MERGE-03, MERGE-04 and RPT-07"
  - "The legacy-versus-unified parity cross-check (merge-parity-unified-days-agree-with-legacy-blocks), constructible only while both payload representations coexist"
  - "An eighteen-row mutation inventory proving every new scenario individually, with two adapted mutations recorded where the plan's generic description didn't match the code's actual layered structure"
affects: [18-09, 19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mergeGridWindow(n) fixture helper: a single-calendar-day [start, end) window computed from a shared pinned MERGE_NOMINAL_MS anchor, so any wpc-hazards feature built from it lands squarely on Phase 18 grid day n without ever satisfying _isFullNominalWindow's window-band routing test"
    - "hazardsRoutes() as a universal 'quiet everything' base: its own .lyr.geojson catch-all covers SPC/fire-weather layers too, so a scenario only needs to override the specific URL(s) under test and spread hazardsRoutes(...) after them -- except HEATRISK_URL, whose hazardsRoutes() default is a HEALTHY category-1 response, not a quiet one, and must be overridden explicitly whenever a fixture needs HeatRisk genuinely quiet"
    - "Every resetHelper() call resets turfStub.pointInPolygon to its default (false) via TURF_DEFAULTS -- a second resetHelper() call mid-scenario (for a control run) must re-set turfStub.pointInPolygon = () => true before the next getSpcOutlook call, or every polygon-contained feature silently vanishes"

key-files:
  created: []
  modified:
    - scripts/probe-payload-resilience.js

key-decisions:
  - "[Rule 1 - Bug] Fixed a self-inflicted harness bug found while writing Task 1: three two-phase scenarios (merge-precedence-heatrisk-zero-does-not-suppress-wpc-heat, merge-precedence-heatrisk-null-does-not-suppress-wpc-heat, merge-flash-flood-and-heavy-precip-never-cross-suppress) called resetHelper() a second time for their control run without re-setting turfStub.pointInPolygon = () => true afterward, so the control run's WPC feature silently failed polygon containment and never reached the grid. Fixed by adding the re-set after every second resetHelper() call. This is a probe-harness authoring bug, not a product defect."
  - "[Rule 1 - Bug] Fixed a second harness bug found while writing Task 2: merge-summary-band-only-is-not-an-all-clear never set turfStub.pointInPolygon at all, so its window-band feature never reached extractPolygons's containment check and the scenario's own primary assertion failed. Added the missing turfStub.pointInPolygon = () => true / restore pair."
  - "[Rule 1 - Bug] Fixed a third harness bug: merge-summary-all-quiet-is-an-all-clear toggled showHeatRisk on but relied on hazardsRoutes()'s HEATRISK_URL default (okEmptyHeatRisk), which is a HEALTHY category-1 response by design (documented in its own comment as the reciprocal of WR-02's trap) -- not a quiet one. This produced an unintended active heatrisk entry and a false anyHazard: true. Fixed by overriding HEATRISK_URL in this scenario with an explicit all-category-0 identify response."
  - "Adapted the plan's suggested mutation for merge-precedence-heatrisk-null-does-not-suppress-wpc-heat. The literal suggestion (change NO_RISK_FLOOR.heatrisk to `category !== undefined`) cannot redden this scenario: `_addHeatRiskGridEntries`'s own `if (typeof tuple.category !== \"number\") continue;` guard filters out every null category BEFORE the floor function is ever called, and even if that guard were bypassed, HeatRisk's dimension resolution hardcodes `dimension: null` for any category outside 0-4 (the `hasText && hasColor` branch never matches null). Null is therefore protected by three independent, redundant layers, not one. The mutation that actually exercises the scenario's own precondition guard is collapsing the null-producing parse branch into 0 (`_zipHeatRiskCatalog`'s caller, the `category = ... : null` ternary), which makes the fixture unable to express category:null at all -- caught by the scenario's own \"expected heatRisk.day3.category to be null\" precondition guard. Recorded here rather than silently substituted, per 18-07's own precedent for describing an adapted mutation."
  - "Combined mutation 7 (map \"Heavy Rain\" to \"flash-flood\") with a companion edit adding \"wpc-hazards\" to PRECEDENCE[\"flash-flood\"], because hazardTaxonomy.js's own assertTaxonomyIntegrity() throws at require() time on the single-line mutation alone (a mapped source that isn't in its dimension's PRECEDENCE list) -- the load-time throw is itself a valid, diagnosable RED result (T-18-06 working as designed), but the plan's intent was to exercise the suppression resolver, which requires the taxonomy to stay internally self-consistent under the mutation."

patterns-established:
  - "Every merge-*/flash-flood-*/distinct-*/unmapped-*/summary-*/sources-*/parity-* scenario follows the five-part shape: pinned clock (MERGE_NOW_MS), resetHelper/resetLogs (with turfStub.pointInPolygon re-armed after every resetHelper call, including a second one mid-scenario), a precondition guard, the primary assertion, and a control assertion -- the same discipline 18-07 established, now applied to precedence/summary/parity rather than grid-anchor/day-window."

requirements-completed: [MERGE-02, MERGE-03, MERGE-04, RPT-07]

# Metrics
duration: ~2h10min
completed: 2026-09-05
---

# Phase 18 Plan 08: MERGE-02/03/04 and RPT-07 Probe Scenarios Summary

**Eighteen mutation-proven `merge-precedence-*`/`merge-flash-flood-*`/`merge-distinct-*`/`merge-unmapped-*`/`merge-summary-*`/`merge-sources-*`/`merge-parity-*` scenarios pin cross-source suppression (dimension-keyed, never label-matched), the three empty-state causes, every day-scoped source's reporting state, and the legacy-versus-unified parity cross-check — raising the probe suite from 98 to 116 passing scenarios.**

## Performance

- **Duration:** ~2h10min
- **Started:** 2026-09-05T19:10:00Z (following 18-07)
- **Completed:** 2026-09-05T21:20:00Z
- **Tasks:** 3 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments

- **Task 1 (8 scenarios):** `merge-precedence-spc-suppresses-wpc-severe-weather`, `merge-precedence-spc-below-floor-does-not-suppress-wpc`, `merge-precedence-spc-absent-day-is-not-the-floor-path` (the rank-1-absent vs. rank-1-below-floor pair kept structurally separate per D-14), `merge-precedence-heatrisk-suppresses-wpc-hazardous-heat`, `merge-precedence-heatrisk-zero-does-not-suppress-wpc-heat`, `merge-precedence-heatrisk-null-does-not-suppress-wpc-heat` (kept separate from the zero scenario per D-13), `merge-flash-flood-and-heavy-precip-never-cross-suppress` (MERGE-04's over-merge half, with a live-suppression control on the same day), and `merge-distinct-hazards-on-one-day-both-survive` (MERGE-04's under-merge half, with DIMENSION_ORDER-sourced ordering control). 98 → 106 passed, 0 failed.
- **Task 2 (10 scenarios):** `merge-unmapped-label-passes-through-and-is-recorded` and `merge-unmapped-label-counts-toward-anyhazard` (D-07's two-sided pass-through claim), `merge-summary-band-only-is-not-an-all-clear` and `merge-summary-advisory-only-is-not-an-all-clear` (closing the Phase 16/15 deferred no-risk-gate items at the payload level), `merge-sources-reporting-true-for-wave2-sources` (the exact wiring gap the plan-checker found), `merge-sources-spc-fire-reporting-tracks-answering-not-finding` and `merge-sources-spc-fire-absent-day-is-not-the-floor-path` (spc-fire's three-state ACTIVE/ANSWERED-NO-AREA/ABSENT distinction), `merge-sources-heatrisk-absent-day-is-not-the-floor-path`, `merge-summary-all-quiet-is-an-all-clear` (the third empty-state cause, distinct from all-failed and all-disabled), and `merge-parity-unified-days-agree-with-legacy-blocks` (RESEARCH.md's Pitfall 9 cross-check, deliberately excluding `wpc-hazards`/`heatrisk` per D-09). 106 → 116 passed, 0 failed.
- **Task 3:** all eighteen new scenarios individually mutation-proven; every mutation applied to `node_helper.js` or `hazardTaxonomy.js`, run, observed RED with a diagnosable message, and reverted. `git diff node_helper.js hazardTaxonomy.js MMM-SPCOutlook.js` is empty at the end of the plan.
- **No day-scoped source is proven only by a sibling's coverage:** `spc-convective` (the `merge-precedence-spc-*` family + `merge-parity-*`), `wpc-ero`/`wpc-wssi` (`merge-flash-flood-*`/`merge-distinct-*` + `merge-parity-*`), `heatrisk`/`wpc-hazards` (`merge-sources-reporting-true-for-wave2-sources`), and `spc-fire` (`merge-sources-spc-fire-reporting-tracks-answering-not-finding` + `merge-sources-spc-fire-absent-day-is-not-the-floor-path`) each has an independent reporting assertion.

## Task Commits

1. **Task 1: Add the precedence, floor and over/under-merge scenarios** - `638b289` (feat)
2. **Task 2: Add the D-07 pass-through, summary-verdict and legacy-parity scenarios** - `d3ed0d1` (feat)
3. **Task 3: Mutation-prove every scenario added in Tasks 1 and 2** - no code commit; every mutation was applied to `node_helper.js`/`hazardTaxonomy.js`, run, observed, and reverted. The working tree carries none of them — the mutation table below, recorded in this SUMMARY, is the task's deliverable (matching 18-07's own precedent).

**Plan metadata:** (this commit) `docs(18-08): complete MERGE-02/03/04 and RPT-07 probe scenarios plan`

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — Appended 18 scenarios across two tasks (1258 insertions total) plus the shared `MERGE_NOW_MS`/`MERGE_NOMINAL_MS`/`mergeGridWindow()` fixture helpers and a `hazardTaxonomy.js` `DIMENSION_ORDER` import; no other file changed.

## Acceptance Criteria Verification

- `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 116 passed, 0 failed, 0 skipped`, exit 0 (98 entering + 18 new).
- `node scripts/probe-payload-resilience.js | grep -cE '^PASS merge-(precedence|flash-flood|distinct)-'` → `8`.
- `node scripts/probe-payload-resilience.js | grep -cE '^PASS merge-(unmapped|summary|parity|sources)-'` → `10`.
- `awk '/name: "merge-precedence-/,/^  },/' scripts/probe-payload-resilience.js | grep -nE 'suppressedBy.*(includes|indexOf)'` → no output (no scenario asserts suppression via a label-string match).
- `awk '/name: "merge-precedence-spc-(below-floor|absent)/,/^  },/' scripts/probe-payload-resilience.js | grep -c 'reportedDays'` → `6` (≥2 required).
- `grep -nE "summary\.(windowBandCount|advisoryCount)" scripts/probe-payload-resilience.js` → no output (D-20's `bandDiagnostics` nesting is respected everywhere).
- `awk '/name: "merge-parity-/,/^  },/' scripts/probe-payload-resilience.js | grep -c 'D-09'` → `1` (≥1 required).
- `awk '/name: "merge-parity-/,/^  },/' scripts/probe-payload-resilience.js | grep -c 'precondition failed:'` → `1` (≥1 required).
- Every one of the 18 new scenarios contains both `precondition failed:` and `control:` strings (verified individually per scenario, see table below for a representative sample; full per-scenario check run during execution).
- `git diff --stat node_helper.js hazardTaxonomy.js MMM-SPCOutlook.js` → empty at plan end.

## Mutation Inventory (Task 3)

Every mutation was applied one at a time to `node_helper.js` or `hazardTaxonomy.js`, the full suite was run, the exact `FAIL` line(s) recorded verbatim below, the mutation reverted, and the suite re-run to confirm `116 passed, 0 failed, 0 skipped` before moving to the next mutation. `git diff` was empty after every restore and is empty at the end of the plan.

| # | Scenario | File:line mutated | Mutation description | Verbatim `FAIL` message | Restored |
|---|---|---|---|---|---|
| 1 | `merge-precedence-spc-suppresses-wpc-severe-weather` | `hazardTaxonomy.js:169` | Reversed `PRECEDENCE.convective` to `["wpc-hazards", "spc-convective"]` | `FAIL merge-precedence-spc-suppresses-wpc-severe-weather: MERGE-02: expected spc-convective entry suppressedBy null, got "wpc-hazards"` (also failed `merge-flash-flood-and-heavy-precip-never-cross-suppress`'s control) | Yes |
| 2 | `merge-precedence-spc-below-floor-does-not-suppress-wpc` | `hazardTaxonomy.js:192` | Changed `NO_RISK_FLOOR['spc-convective'].categorical` from `value > 1` to `value > 0`, so `TSTM` becomes active | `FAIL merge-precedence-spc-below-floor-does-not-suppress-wpc: D-13: expected NO spc-convective entry on day 1 (TSTM is below floor), got {"dimension":"convective","source":"spc-convective","label":"TSTM",...,"value":1,...}` | Yes |
| 3 | `merge-precedence-spc-absent-day-is-not-the-floor-path` | `node_helper.js:3199` (`_addSpcGridEntries`) | Added an unconditional `notes.noteReported("spc-convective", d)` loop for grid days 9-14 | `FAIL merge-precedence-spc-absent-day-is-not-the-floor-path: precondition failed: sources['spc-convective'].reportedDays includes day 9: [1,2,3,9,10,11,12,13,14]` | Yes |
| 4 | `merge-precedence-heatrisk-suppresses-wpc-hazardous-heat` | `hazardTaxonomy.js:171` | Reversed `PRECEDENCE.heat` to `["wpc-hazards", "heatrisk"]` | `FAIL merge-precedence-heatrisk-suppresses-wpc-hazardous-heat: MERGE-03: expected heatrisk entry suppressedBy null, got "wpc-hazards"` (also failed 3 sibling scenarios whose controls exercise the same PRECEDENCE.heat rank) | Yes |
| 5 | `merge-precedence-heatrisk-zero-does-not-suppress-wpc-heat` | `hazardTaxonomy.js:218` | Changed `NO_RISK_FLOOR.heatrisk` from `category !== null && category >= 1` to `category !== null` | `FAIL merge-precedence-heatrisk-zero-does-not-suppress-wpc-heat: D-13: expected NO heatrisk entry on day 3 (category 0 is below floor), got {"dimension":"heat","source":"heatrisk","label":"0","text":"Little to No Risk","value":0,...}` (also failed `merge-summary-all-quiet-is-an-all-clear`, since its all-category-0 HeatRisk fixture became active under this floor) | Yes |
| 6 | `merge-precedence-heatrisk-null-does-not-suppress-wpc-heat` | `node_helper.js:629` (`_zipHeatRiskCatalog`'s caller, the category-parse ternary) | **Adapted from the plan's literal suggestion** (see key-decisions): the plan's `NO_RISK_FLOOR.heatrisk` → `category !== undefined` change cannot reach this scenario at all, because `_addHeatRiskGridEntries`'s `typeof tuple.category !== "number"` guard and the entry's hardcoded `dimension: null` on an out-of-range category both independently block null from ever suppressing, regardless of the floor predicate. The mutation that actually exercises the scenario is collapsing the null-producing parse branch to `0` instead of `null` | `FAIL merge-precedence-heatrisk-null-does-not-suppress-wpc-heat: precondition failed: heatRisk.day3.category is 0, expected null` (also failed 4 pre-existing HeatRisk `_04`-family scenarios, since this branch is a widely-shared parse path — an example of the mutation's blast radius exceeding its own target, per 18-07's own accepted precedent) | Yes |
| 7 | `merge-flash-flood-and-heavy-precip-never-cross-suppress` | `hazardTaxonomy.js:81` + `hazardTaxonomy.js:175` (companion edit) | Mapped `"Heavy Rain"` to `"flash-flood"` in `hazardsOutlookDimensionByLabel`, paired with adding `"wpc-hazards"` to `PRECEDENCE["flash-flood"]` so `assertTaxonomyIntegrity()`'s load-time check does not abort the run before the resolver is ever exercised (see key-decisions) | `FAIL merge-flash-flood-and-heavy-precip-never-cross-suppress: precondition failed: expected a wpc-hazards Heavy Rain entry with dimension heavy-precip on day 3, got {"dimension":"flash-flood","source":"wpc-hazards","label":"Heavy Rain",...,"suppressedBy":"wpc-ero"}` (also failed `merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day`, a pre-existing 18-07 scenario built on the same "Heavy Rain" label) | Yes |
| 8 | `merge-distinct-hazards-on-one-day-both-survive` | `node_helper.js:3360` (`_resolveGridDayPrecedence`) | Forced every dimensioned entry into a single `"convective"` bucket regardless of its real dimension, so cross-dimension entries suppress each other | `FAIL merge-distinct-hazards-on-one-day-both-survive: MERGE-04: expected all three distinct-dimension entries to survive, got [...,{"dimension":"flash-flood","source":"wpc-ero",...,"suppressedBy":"spc-convective"},{"dimension":"wind","source":"wpc-hazards",...,"suppressedBy":"spc-convective"}]` (also failed 6 other scenarios spanning every precedence family — the widest blast radius in this inventory, expected for a mutation to the shared resolver itself) | Yes |
| 9 | `merge-unmapped-label-passes-through-and-is-recorded` | `node_helper.js:2908` (`_addHazardsOutlookGridEntries`) | Added `if (dimension === null) continue;` immediately before the day-grid push loop, dropping every unmapped label | `FAIL merge-unmapped-label-passes-through-and-is-recorded: D-07: expected a "Volcanic Ash" entry with dimension null on day 3, got undefined` (also failed `merge-unmapped-label-counts-toward-anyhazard`) | Yes |
| 10 | `merge-unmapped-label-counts-toward-anyhazard` | `node_helper.js:3484` (`_buildGridSummary`) | Added `if (entry.dimension === null) continue;` before `dayHasSurvivor = true`, requiring a non-null dimension for `anyHazard` | `FAIL merge-unmapped-label-counts-toward-anyhazard: D-07: expected summary.anyHazard true from an unmapped-only survivor, got false` | Yes |
| 11 | `merge-summary-band-only-is-not-an-all-clear` | `node_helper.js:3501` (`_buildGridSummary`) | Dropped the `windowBandCount > 0` term from `anyHazard`'s union | `FAIL merge-summary-band-only-is-not-an-all-clear: RPT-07/D-20: expected summary.anyHazard true with a window-band entry present, got false` | Yes |
| 12 | `merge-summary-advisory-only-is-not-an-all-clear` | `node_helper.js:3501` (`_buildGridSummary`) | Dropped the `advisoryCount > 0` term from `anyHazard`'s union | `FAIL merge-summary-advisory-only-is-not-an-all-clear: RPT-07/D-20: expected summary.anyHazard true with an advisory-only state, got false` | Yes |
| 13 | `merge-summary-all-quiet-is-an-all-clear` | `node_helper.js:3501` (`_buildGridSummary`) | Made `anyHazard` unconditionally `true` | `FAIL merge-summary-all-quiet-is-an-all-clear: expected summary.anyHazard false with every product quiet, got true` (also failed 3 sibling scenarios' control assertions) | Yes |
| 14 | `merge-parity-unified-days-agree-with-legacy-blocks` | `node_helper.js:3276` (`_addRegistryDayGridEntries`) | Added `if (sourceId === "wpc-ero" && d === 1) continue;` to the per-day loop, skipping ERO day 1 in the unified grid only | `FAIL merge-parity-unified-days-agree-with-legacy-blocks: parity mismatch (grid day, source, legacy value, unified presence): day 1 wpc-ero: legacy risk="SLGT" (above floor=true) vs unified presence=false` (also failed `merge-grid-12z-products-map-straight-through`) | Yes |
| 15 | `merge-sources-reporting-true-for-wave2-sources` | `node_helper.js:2994` (`_addHeatRiskGridEntries`) | Deleted the `notes.noteReported("heatrisk", gridDay)` call — the exact wiring gap the plan-checker found | `FAIL merge-sources-reporting-true-for-wave2-sources: expected sources.heatrisk.reporting and sources['wpc-hazards'].reporting both true, got {"heatrisk":false,"wpcHazards":true}` (also failed `merge-sources-heatrisk-absent-day-is-not-the-floor-path`'s own precondition guard) | Yes |
| 16 | `merge-sources-heatrisk-absent-day-is-not-the-floor-path` | `node_helper.js:3059` (`_addHeatRiskGridEntries`) | Added an unconditional `notes.noteReported("heatrisk", d)` loop for all fourteen grid days | `FAIL merge-sources-heatrisk-absent-day-is-not-the-floor-path: precondition failed: sources.heatrisk.reportedDays includes day 8, so this is not the absent path: [1,2,...,14]` | Yes |
| 17 | `merge-sources-spc-fire-reporting-tracks-answering-not-finding` | `node_helper.js:3212` (`_addSpcGridEntries`) | Moved `notes.noteReported("spc-fire", d)` to after the `fireFloor(value)` check, collapsing ANSWERED-NO-AREA into ABSENT | `FAIL merge-sources-spc-fire-reporting-tracks-answering-not-finding: control: expected sources['spc-fire'].reporting to STAY true on an answered-no-area day, got false` (the scenario's own primary assertion still passed under this mutation, exactly as the plan predicted — the control is what catches it) — also failed `merge-sources-spc-fire-absent-day-is-not-the-floor-path`'s own control | Yes |
| 18 | `merge-sources-spc-fire-absent-day-is-not-the-floor-path` | `node_helper.js:3230` (`_addSpcGridEntries`) | Added an unconditional `notes.noteReported("spc-fire", d)` loop for grid days 9-14 | `FAIL merge-sources-spc-fire-absent-day-is-not-the-floor-path: precondition failed: sources['spc-fire'].reportedDays includes day 9, so this is not the absent path: [1,2,...,14]` | Yes |

Every row reports a genuine `FAIL`, none report "no scenario failed," and every message names the grid day, source, dimension, or field involved. `git diff node_helper.js hazardTaxonomy.js` after the last restore:

```
$ git diff --stat node_helper.js hazardTaxonomy.js
$ git diff node_helper.js hazardTaxonomy.js | wc -l
0
```

Final suite state after all eighteen mutation cycles: `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 116 passed, 0 failed, 0 skipped`, exit 0.

## Decisions Made

See `key-decisions` in the frontmatter. In brief: three probe-harness authoring bugs were found and fixed while writing Tasks 1-2 (all three were the same class of mistake — `turfStub.pointInPolygon` not re-armed after a second `resetHelper()` call, or never armed at all — none touched product code); two mutations (#6 and #7) needed adaptation from the plan's literal generic description because the actual code has more layered/redundant protection (or a load-time integrity check) than the plan's one-line suggestion accounted for, mirroring 18-07's own precedent for documenting such adaptations rather than silently forcing the plan's literal wording.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Three probe-harness scenarios failed to re-arm `turfStub.pointInPolygon` after a second `resetHelper()` call**
- **Found during:** Task 1, first suite run after adding all 8 scenarios
- **Issue:** `resetHelper()` resets `turfStub.pointInPolygon` to its default (`() => false`) via `TURF_DEFAULTS`. `merge-precedence-heatrisk-zero-does-not-suppress-wpc-heat`, `merge-precedence-heatrisk-null-does-not-suppress-wpc-heat`, and `merge-flash-flood-and-heavy-precip-never-cross-suppress` each call `resetHelper()` a second time inline for their control run but only set `turfStub.pointInPolygon = () => true` once, at the top of the scenario — so every polygon-contained feature in the control run silently failed containment and the control's WPC/ERO entries never reached the grid, producing `undefined` where an entry was expected.
- **Fix:** Added `turfStub.pointInPolygon = () => true;` immediately after each scenario's second `resetHelper()` call.
- **Files modified:** `scripts/probe-payload-resilience.js`
- **Verification:** All three scenarios pass; full suite returns to `106 passed, 0 failed, 0 skipped` after Task 1.
- **Committed in:** `638b289` (Task 1 commit)

**2. [Rule 1 - Bug] `merge-summary-band-only-is-not-an-all-clear` never armed `turfStub.pointInPolygon` at all**
- **Found during:** Task 2, first suite run after adding all 10 scenarios
- **Issue:** The scenario's own window-band feature never reached `extractPolygons`'s containment check, so `windowBand` stayed empty and the scenario's own primary assertion (`summary.anyHazard` true) failed.
- **Fix:** Wrapped the scenario body in a `try/finally` with `turfStub.pointInPolygon = () => true` set at the top and restored at the end, matching every other scenario's convention.
- **Files modified:** `scripts/probe-payload-resilience.js`
- **Verification:** Scenario passes; full suite returns to `116 passed, 0 failed, 0 skipped`.
- **Committed in:** `d3ed0d1` (Task 2 commit)

**3. [Rule 1 - Bug] `merge-summary-all-quiet-is-an-all-clear` relied on `hazardsRoutes()`'s HeatRisk default, which is a healthy active response, not a quiet one**
- **Found during:** Task 2, same suite run
- **Issue:** `hazardsRoutes()`'s own `HEATRISK_URL` default is `okEmptyHeatRisk()`, a HEALTHY category-1 (above-floor) response — documented in its own source comment as existing so a sixth product cannot silently 503 when a Hazards Outlook scenario enables it too. This scenario toggled `showHeatRisk: true` without overriding that default, producing an unintended active `heatrisk` entry and `summary.anyHazard: true` where the scenario's whole point is an all-quiet fixture.
- **Fix:** Added an explicit `HEATRISK_URL` override supplying a 7-day, all-category-0 identify response, placed before `...hazardsRoutes()` in the route array so it takes precedence.
- **Files modified:** `scripts/probe-payload-resilience.js`
- **Verification:** Scenario passes; full suite returns to `116 passed, 0 failed, 0 skipped`.
- **Committed in:** `d3ed0d1` (Task 2 commit)

---

**Total deviations:** 3 auto-fixed (3 probe-harness authoring bugs, all Rule 1)
**Impact on plan:** All three fixes are entirely contained inside this plan's own new scenarios — no prior plan's code or scenario was touched, and no product code changed. Necessary for each scenario's own stated correctness contract.

## Assumption Drift (advisory)

None material. Two cosmetic notes, both recorded in the mutation table above rather than repeated here: mutation #6 (heatrisk-null) and mutation #7 (flash-flood) both required adapting the plan's literal one-line mutation description to the code's actual structure (redundant layered guards in one case, a load-time integrity check in the other) — the underlying scenario and its assertions are unchanged from the plan's specification; only the *mechanism* used to redden it during Task 3 differs from the plan's generic suggestion.

## Issues Encountered

None beyond the three Rule 1 fixes documented above, and the two mutation adaptations documented in the mutation table. Both classes of finding were investigated to confirm they were probe-authoring/mutation-description issues rather than product defects or fixture vacuity: in every case the target scenario's own precondition or primary assertion, once the harness bug was fixed or the mutation adapted, produced a genuine, clearly diagnosable RED result.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- MERGE-02, MERGE-03, MERGE-04 and RPT-07 are now permanently pinned by 18 mutation-proven probe scenarios, closing this phase's executable half of ROADMAP success criteria 2 and 4 (plan 18-09 does the live-payload half).
- The legacy-versus-unified parity cross-check (`merge-parity-unified-days-agree-with-legacy-blocks`) exists while both payload representations still coexist, per RESEARCH.md's Pitfall 9 — it becomes impossible to construct once Phase 19 removes the legacy blocks, so this is the only phase in which it could be built.
- `scripts/probe-payload-resilience.js` stands at 116 scenarios, 0 failed, 0 skipped; `node_helper.js`, `MMM-SPCOutlook.js`, and `hazardTaxonomy.js` are byte-identical to their pre-plan state (this plan's only `files_modified` is the probe script, as required).
- No blockers for 18-09. PERF-03's cold-cache Pi measurement remains an open milestone-close item per D-19, unaffected by this plan.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-05*

## Self-Check: PASSED

- FOUND: scripts/probe-payload-resilience.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-08-SUMMARY.md
- FOUND: 638b289 (Task 1 feat commit)
- FOUND: d3ed0d1 (Task 2 feat commit)
- FOUND: df6fee4 (plan metadata docs commit)
- Re-ran suite: PROBE RESULT: 116 passed, 0 failed, 0 skipped
