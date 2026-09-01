---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 01
subsystem: data
tags: [productRegistry, heatrisk, arcgis-identify, load-time-validation, data-integrity]

# Dependency graph
requires:
  - phase: 16-nws-cpc-hazards-outlook
    provides: productRegistry.js's three prior load-time validators (daySpanOf/dayRangeOf/dayRangeSpanning) and the arcgis-hazard-window kind, whose idiom this plan extends
provides:
  - PRODUCT_REGISTRY.heatRisk row (fourth kind, arcgis-identify-point)
  - buildHeatRiskIdentifyUrl(mercatorX, mercatorY) — host-allowlisted, finite-coord-guarded, byte-stable ImageServer identify URL builder
  - assertNoSharedRegistryMaps(registry) — D-11's load-time cross-row map-identity assertion, exported for probe-suite fixture use
affects: [17-02, 17-03, 17-04, 17-05, 17-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "arcgis-identify-point: a fourth registry `kind` for a single-URL, all-days-in-one-response product, distinct from arcgis-day-layers (one URL per day) and arcgis-hazard-window (label-driven window/day routing)"
    - "Load-time cross-row identity assertion (Map<object, rowId>) as a fourth registry validator beside daySpanOf/dayRangeOf/dayRangeSpanning"

key-files:
  created: []
  modified: [productRegistry.js]

key-decisions:
  - "paletteSource sourced from step 1 of the plan's three-step order: decoded PNG pixel RGB from the service's own /legend?f=json raster-class swatches, cross-confirmed byte-for-byte against the identical hex table embedded in the same ImageServer's /?f=json serviceDescription HTML (both live-retrieved 2026-09-01). No fallback to the module-authored ladder was needed."
  - "MAP_FIELDS = the RESEARCH.md-proposed 8 base fields (valueToTier, tierToText, tierToColor, displayColor, excludedLabels, droughtLabels, excludedLabelKeys, droughtLabelKeys) plus toValue, valueToText, valueToColor per the plan's explicit instruction — scoped to value/tier/text/colour maps only, not every object-shaped row field (dayLayers, layers, order, dayRangeTotal, and the buildUrl/includesFeat/toEntry functions were considered and excluded as structural/dispatch fields outside DATA-03's semantic target, not label-to-value ladders)."

requirements-completed: [HEAT-03, DATA-03]

# Metrics
duration: ~11min
completed: 2026-09-01
---

# Phase 17 Plan 01: HeatRisk Registry Row & D-11 Identity Assertion Summary

**Added `PRODUCT_REGISTRY.heatRisk` (a new `arcgis-identify-point` kind) with a dedicated, byte-stable ImageServer identify URL builder, and a fourth load-time validator (`assertNoSharedRegistryMaps`) that throws at module load if any two registry rows share a value/tier/text/colour map by object identity.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-09-01T13:31:49Z (phase execution start per STATE.md)
- **Completed:** 2026-09-01T13:42:51Z
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`productRegistry.js`)

## Accomplishments

- `HEATRISK_BASE_URL` + `buildHeatRiskIdentifyUrl(mercatorX, mercatorY)`: a standalone ImageServer identify URL builder (not a bent `buildArcGisQuery`), host-allowlist-checked against the literal `https://mapservices.weather.noaa.gov/` prefix, `Number.isFinite`-guarded on both coordinates, and byte-stable across calls (fixed key order in the `geometry` JSON, fixed query-parameter order) for PERF-02's cache-key stability.
- `PRODUCT_REGISTRY.heatRisk`: the fourth registry `kind` (`arcgis-identify-point`), `configFlag: "showHeatRisk"` (picked up by `_productToggles` with zero edits to `node_helper.js`), `days: 7` (the sole declaration of HeatRisk's span), `maxDataAgeHours: 12` (D-07), 0-4 keyed `valueToText`/`valueToColor`, and a cited `paletteSource`.
- `assertNoSharedRegistryMaps(registry)`: walks every row's `MAP_FIELDS` entries, records object identity in a `Map`, and throws naming both offending row ids and the field on a collision — called at module load beside `daySpanOf`/`dayRangeOf`/`dayRangeSpanning`, and passes cleanly against the real (now 6-row) registry.

## Task Commits

1. **Task 1: HeatRisk registry row and its dedicated identify URL builder** - `8ddbf8f` (feat)
2. **Task 2: D-11 load-time cross-row map-identity assertion** - `2689541` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `productRegistry.js` - added `HEATRISK_BASE_URL`, `buildHeatRiskIdentifyUrl`, `PRODUCT_REGISTRY.heatRisk`, `MAP_FIELDS`, `assertNoSharedRegistryMaps`; exported `buildHeatRiskIdentifyUrl` and `assertNoSharedRegistryMaps`

## Decisions Made

- **Palette sourcing (step 1 reached):** Fetched `https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/legend?f=json`, decoded each of the 5 base64 PNG swatch images with Pillow, and read the center-pixel RGB: `0: e8f9e7, 1: f4f257, 2: f69632, 3: e22f33, 4: 7a0e7f`. Cross-confirmed byte-for-byte identical against the `background-color:#XXXXXX` values embedded in the same ImageServer's `/?f=json` `serviceDescription` HTML table (Green-0/Yellow-1/Orange-2/Red-3/Magenta-4). Both retrieved live 2026-09-01. No fallback ladder was needed.
- **MAP_FIELDS scope:** Extended the base 8 fields from RESEARCH.md/PATTERNS.md §9 with `toValue`, `valueToText`, `valueToColor` per the plan's explicit instruction. Did NOT add `includesFeat` (a threshold predicate, not a label/value map, and not named by the plan), nor `dayLayers`/`layers`/`order`/`dayRangeTotal` (day-scheduling/ordering config, not value/tier/text/colour maps — see the diff below).

## `buildArcGisQuery` count (Task 1 acceptance criterion)

- **Before:** 11 (lines 24, 26, 29, 39, 65, 125, 310, 335, 440, 441, 523 in the pre-edit file)
- **After:** 12 — the +1 is a single new comment line (`// its OWN function, not a bent buildArcGisQuery: buildArcGisQuery is hardcoded to a MapServer`) that mentions the identifier twice on one line; `grep -c` counts matching lines, not occurrences. This line exists because the plan's own `<action>` text explicitly requires `buildHeatRiskIdentifyUrl`'s comment to state "It is a SEPARATE builder, not a bent `buildArcGisQuery`" and give the reason — the acceptance criterion's literal "count unchanged" wording and the action's mandated comment content are in tension; I followed the action's explicit prose requirement. `buildArcGisQuery`'s own definition (line 24) and all its original call/error-message sites (11 of them) are verified byte-identical to the pre-edit file — the function itself was not modified.

## `MAP_FIELDS` diff (Task 2 acceptance criterion)

Per-row map-shaped field inventory (value/tier/text/colour maps only, per D-11's stated scope
— "share a value/tier/text/colour map"):

| Row | Map-shaped fields present |
|---|---|
| excessiveRain | `toValue`, `valueToTier`, `tierToText`, `tierToColor` |
| winterImpact | `toValue`, `valueToTier`, `tierToText`, `tierToColor` |
| spcMD | none (`toEntry` composes a label/hazardType pair directly, no ladder) |
| mpd | none (same as spcMD) |
| hazardsOutlook | `excludedLabels`, `droughtLabels`, `excludedLabelKeys`, `droughtLabelKeys`, `displayColor`, `toValue` |
| heatRisk | `valueToText`, `valueToColor` |

Union of all rows' map-shaped fields: `valueToTier, tierToText, tierToColor, excludedLabels, droughtLabels, excludedLabelKeys, droughtLabelKeys, displayColor, toValue, valueToText, valueToColor` (11 names).

`MAP_FIELDS` (11): `valueToTier, tierToText, tierToColor, displayColor, excludedLabels, droughtLabels, excludedLabelKeys, droughtLabelKeys, toValue, valueToText, valueToColor`.

**Diff: empty.** Fields deliberately excluded as out-of-scope structural/dispatch config (not value/tier/text/colour maps): `dayLayers` (day→layerId scheduling, per-row distinct, never a shareable ladder), `layers`/`dayRangeTotal` (hazardsOutlook's own layer/span config), `order` (display sort priority, not a value translation), `includesFeat`/`buildUrl`/`toEntry` (dispatch/predicate functions, not label-to-value tables).

## Deviations from Plan

### Auto-corrected process error (not a code deviation)

**1. Ran `git stash -u` during exploratory work, then immediately reverted it**
- **Found during:** Task 2, while investigating the probe suite's historical scenario count (79 vs. observed 67)
- **Issue:** I ran `git stash -u` to compare against a prior commit's probe file, which is a prohibited operation in worktree mode (shared `refs/stash` across worktrees, #3542) — it silently un-staged my uncommitted Task 2 edits to `productRegistry.js`.
- **Fix:** Immediately ran `git stash list` (confirmed exactly one entry, matching my own worktree branch and the commit I had just made), inspected its contents with `git stash show -p` to confirm it was my own Task 2 diff, then `git stash pop` to restore it. Re-ran `node --check`, the load-time assertion, and the `foreign constant` grep to confirm the file was byte-identical to its pre-stash state before committing.
- **Files affected:** `productRegistry.js` (working-tree only; no commit was ever made on the stashed state)
- **Verification:** `git stash list` empty afterward; `node -e "require('./productRegistry')"` exits 0; Task 2's `<verify>` command re-run and passed identically to its first run.
- **Committed in:** N/A (recovered before the Task 2 commit `2689541` was made)

### Auto-fixed Issues

None — no Rule 1/2/3 code fixes were needed; the plan's `<action>` text was followed directly for both tasks.

---

**Total deviations:** 1 self-corrected process error (git stash misuse, recovered with no data loss and no commit ever made on the erroneous state). Zero code-level deviations.
**Impact on plan:** None on the shipped code. `productRegistry.js` matches the plan's `<action>` and `<interfaces>` sections exactly.

## Issues Encountered

- The plan's `<verification>` section states the probe suite should report "79/79 scenarios passing"; the actual live run reports `67 passed, 0 failed, 0 skipped`. This mismatch predates this plan (this plan touches only `productRegistry.js`, never `scripts/probe-payload-resilience.js`), and the project's hard verification bar per `project_test_note` — `0 failed, 0 skipped`, exit 0 — is satisfied. Flagging as an assumption-drift advisory below rather than treating it as a regression, since neither task in this plan added or removed a probe scenario.

## Assumption Drift (advisory)

- **Planned:** Plan `<verification>` expected `node scripts/probe-payload-resilience.js` to report 79/79 scenarios passing, unchanged by this purely-additive registry plan.
- **Actual:** The suite reports `67 passed, 0 failed, 0 skipped` both before and after this plan's two commits (registry-only changes cannot affect probe-suite scenario count either way).
- **Why:** The 79-scenario figure in the plan appears to be stale relative to the current `main` branch scenario count at the time this plan was authored/executed; it is not something this plan's tasks caused or could have caused. The bar that actually matters — `0 failed, 0 skipped`, exit 0 — is met.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `PRODUCT_REGISTRY.heatRisk`, `buildHeatRiskIdentifyUrl`, and `assertNoSharedRegistryMaps` are all live, exported, and load-time-verified against the real (now 6-row) registry — every downstream plan in this phase (17-02 through 17-09) can read `row.buildUrl`, `row.maxDataAgeHours`, `row.days`, `row.valueToText`, `row.valueToColor` from this row, and `_productToggles` picks up `configFlag: "showHeatRisk"` with zero edits.
- No blockers identified for 17-02 (the runner/dispatch plan) or 17-04 (the parse/zip/dedupe/bucket plan) — both interfaces this plan defines are exercised and passing under their own `<verify>` commands.
- `assertNoSharedRegistryMaps` is exported specifically so 17-08's probe scenario can call it against a scenario-local fixture registry without mutating the real `PRODUCT_REGISTRY`, per the plan's stated intent.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*
