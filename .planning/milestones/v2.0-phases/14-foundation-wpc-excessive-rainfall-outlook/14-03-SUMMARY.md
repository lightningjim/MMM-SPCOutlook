---
phase: 14-foundation-wpc-excessive-rainfall-outlook
plan: 03
subsystem: api
tags: [node-helper, wpc-ero, product-registry, socket-contract]

# Dependency graph
requires:
  - phase: 14-01
    provides: "productRegistry.js exporting PRODUCT_REGISTRY.excessiveRain"
  - phase: 14-02
    provides: "single unconditional return shape from getSpcOutlook"
provides:
  - "GET_SPC_DATA socket contract carrying a nested products object, re-defaulted backend-side with === true"
  - "excessiveRain payload block (20 fields, days 1-5), always present regardless of the toggle"
  - "ERO fetch/evaluate loop wired through PRODUCT_REGISTRY.excessiveRain, reusing extractPolygons/evaluatePolygons/fetchGeoJsonCached unmodified"
affects: [14-04, 14-05]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "declare defaults, conditionally fetch, always return — applied a third time, for excessiveRain"
    - "single downstream numeric-to-tier conversion site, placed after the cache-hit/fresh-data branch closes, so cache hits and fresh fetches produce identical payload values"

key-files:
  created: []
  modified: [node_helper.js]

key-decisions:
  - "excessiveRain section placed immediately before the return statement (after the day4-8 SPC block), keeping the SPC/fire-weather/day4-8 sequence intact and putting the newest product closest to its emission site"
  - "Reworded two plan-mandated comments (the ERO-02 dn/DN warning and the JSDoc excessiveRain description) to avoid literal 'dnToFireValue' and 'day5ValidTime' substrings, which would have false-positived the plan's own occurrence-count acceptance criteria — mirrors the identical fix documented in 14-01-SUMMARY.md"

requirements-completed: [CFG-01, ERO-01, ERO-02, PERF-02, DATA-01]

# Metrics
duration: ~40min
completed: 2026-08-19
---

# Phase 14 Plan 03: Wire WPC ERO into node_helper.js Summary

**`node_helper.js` now accepts a nested `products.showExcessiveRain` toggle (strict `=== true` re-default), fetches WPC ERO Days 1-5 through the registry's own `buildUrl`/`dn` vocabulary only when enabled, and always emits a 20-field `excessiveRain` block whose tier conversion survives an ETag cache hit unchanged.**

## Performance

- **Duration:** ~40 min
- **Completed:** 2026-08-19
- **Tasks:** 3 completed (3/3)
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments
- `socketNotificationReceived` destructures `products` from the socket payload and re-defaults `this._products.showExcessiveRain` with strict `=== true` (never truthiness), mirroring the existing `_proximityWeighting` idiom; `this._products` is also initialized in `start()` so a payload with no `products` key never leaves it undefined
- `getSpcOutlook` fetches ERO Days 1-5 only when the toggle is on, via `PRODUCT_REGISTRY.excessiveRain.buildUrl(d)` exclusively (one construction site), evaluated through the registry's own lowercase `dn` map via unmodified `extractPolygons`/`evaluatePolygons`, with `anyStale` confined strictly inside the toggle gate
- The raw numeric tier is cached under `value` (not a pre-converted string), and `ero.valueToTier[...]` is called exactly once, downstream of the cache-hit/fresh-data branch — live-verified: a same-process repeat call reproduces a byte-identical `excessiveRain` block
- `excessiveRain` is emitted unconditionally as a sibling of `fireWeather`, with all 20 fields present and NONE/None/afddf6/null defaults when the toggle is off — same shape either way (D-05)

## Task Commits

Each task was committed atomically:

1. **Task 1: Accept the nested `products` toggle object with defensive `=== true` defaults** - `2434de6` (feat)
2. **Task 2: Fetch, evaluate, and emit the always-present excessiveRain block** - `f2b5df4` (feat)
3. **Task 3: Probe the ERO-enabled backend across the toggle and extended matrix** - no source changes (verification-only task; harness lived entirely in the session scratchpad; findings below)

**Plan metadata:** committed alongside this SUMMARY (see final commit)

## Files Created/Modified
- `node_helper.js` - Requires `productRegistry.js`; `start()` initializes `this._products`; `socketNotificationReceived` destructures and re-defaults `products.showExcessiveRain`; `getSpcOutlook` gains the ERO fetch/evaluate loop and the unconditional `excessiveRain` payload block; JSDoc updated

## Decisions Made
- ERO block placed right before the `return` statement (after the day4-8 SPC block), not immediately after the fire-weather Day 3-8 block — both positions satisfy the plan's "after fire-weather Day 3-8, before the return object" instruction; this placement keeps the file's existing SPC → fire-weather → day4-8 sequence intact
- Two plan-specified comments were reworded (not removed) to dodge a literal-substring false-positive against the plan's own `grep -c` acceptance criteria — see Deviations below

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded two plan-mandated comments to avoid false-positives in the plan's own acceptance-criteria grep**
- **Found during:** Task 2
- **Issue:** The plan's Task 2 action required a code comment stating ERO's `dn` map "must never be the fire-weather `DN` map" and a JSDoc line enumerating `day1ValidTime` through `day5ValidTime`. The acceptance criteria then assert `grep -c 'dnToFireValue' node_helper.js` returns exactly `3` (the pre-existing declaration + 2 call sites) and `grep -c 'day5ValidTime' node_helper.js` returns exactly `1` (the payload field itself). Writing the comment with the literal substrings `dnToFireValue` and `day5ValidTime` pushed both counts to 4 and 2 respectively, failing the plan's own fixed acceptance thresholds.
- **Fix:** Reworded both comments to preserve the identical warning/documentation intent without using the literal substrings — "fire weather's uppercase-DN-keyed value map" instead of `dnToFireValue`, and "per-day Risk/Text/Color/ValidTime fields for days 1 through 5" instead of spelling out `day5ValidTime`.
- **Files modified:** `node_helper.js`
- **Verification:** Re-ran both acceptance-criteria grep commands after the reword; `dnToFireValue` returns `3`, `day5ValidTime` returns `1`, `node --check` still passes. Same class of interaction plan 14-01 already documented and fixed for a different literal substring (`f=json`).
- **Committed in:** `f2b5df4` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — verification-script/comment-content interaction, same class as 14-01's documented fix)
**Impact on plan:** Cosmetic wording change only; no behavioral or contract change. The ERO-02 dn/DN separation and the D-03 valid_time carry-through are both still fully documented in the surrounding code, just phrased to avoid the specific literal token collision.

## Probe Evidence (Task 3)

**Harness:** Extended the plan 14-02 probe (`probe.js` + `stubs/node_modules/{node_helper,logger}/index.js`, all in the session scratchpad, nothing added to the repository) to also set `helper._products = { showExcessiveRain: <bool> }` after `helper.start()` and before `getSpcOutlook`.

**Exact probe command line (re-runnable form, one run shown; `<extended>`/`<showExcessiveRain>` vary per configuration):**
```bash
NODE_PATH="<scratch>/stubs/node_modules:<repo-root>/node_modules" \
NODE_HELPER_PATH="<repo-root>/node_helper.js" \
PROBE_LAT=35.22 PROBE_LON=-97.44 PROBE_REPEAT=1 PROBE_LOG_INFO=1 \
node <scratch>/probe.js <extended:true|false> <showExcessiveRain:true|false>
```
`<scratch>` = session scratchpad directory; `<repo-root>` = this worktree's absolute path. `PROBE_REPEAT=1` additionally triggers a second in-process `getSpcOutlook` call and prints the `excessiveRain` comparison plus the `_geoJsonCache` ERO-key list; `PROBE_LOG_INFO=1` routes the stubbed `logger.info` to stderr so `cache hit (ETag)` lines are visible.

### Four-configuration key-set comparison (lat 35.22, lon -97.44 — project default)

All four runs returned no `error` key and an **identical sorted top-level key set**:
```
day1, day2, day3, day4, day48Risk, day5, day6, day7, day8, excessiveRain, fireWeather
```

| Run | extended | showExcessiveRain | Top-level keys match | `excessiveRain` present |
|-----|----------|--------------------|------------------------|---------------------------|
| A | false | false | yes (11 keys, identical set) | yes, all 5 days NONE/None/afddf6/null |
| B | false | true  | yes (11 keys, identical set) | yes, all 5 days NONE/None/afddf6, non-null `valid_time` |
| C | true  | false | yes (11 keys, identical set) | yes, all 5 days NONE/None/afddf6/null |
| D | true  | true  | yes (11 keys, identical set) | yes, all 5 days NONE/None/afddf6, non-null `valid_time` |

Runs A and C issued **zero** requests to `mapservices.weather.noaa.gov` — confirmed both structurally (the entire ERO fetch loop lives inside `if (this._products.showExcessiveRain)`, live in the Task 2 diff) and empirically (`grep -c "wpc_precip_hazards" runA.log` / `runC.log` both return `0`, i.e. no cache-hit/miss log line ever mentions an ERO URL).

**Run A — toggle-off `excessiveRain` block** (`extended: false`, `showExcessiveRain: false`):
```json
{
  "day1Risk": "NONE", "day1Text": "None", "day1Color": "afddf6", "day1ValidTime": null,
  "day2Risk": "NONE", "day2Text": "None", "day2Color": "afddf6", "day2ValidTime": null,
  "day3Risk": "NONE", "day3Text": "None", "day3Color": "afddf6", "day3ValidTime": null,
  "day4Risk": "NONE", "day4Text": "None", "day4Color": "afddf6", "day4ValidTime": null,
  "day5Risk": "NONE", "day5Text": "None", "day5Color": "afddf6", "day5ValidTime": null
}
```

**Run B — toggle-on `excessiveRain` block** (`extended: false`, `showExcessiveRain: true`):
```json
{
  "day1Risk": "NONE", "day1Text": "None", "day1Color": "afddf6", "day1ValidTime": "12Z 08/19/26 - 12Z 08/20/26",
  "day2Risk": "NONE", "day2Text": "None", "day2Color": "afddf6", "day2ValidTime": "12Z 08/20/26 - 12Z 08/21/26",
  "day3Risk": "NONE", "day3Text": "None", "day3Color": "afddf6", "day3ValidTime": "12Z 08/21/26 - 12Z 08/22/26",
  "day4Risk": "NONE", "day4Text": "None", "day4Color": "afddf6", "day4ValidTime": "12Z 08/22/26 - 12Z 08/23/26",
  "day5Risk": "NONE", "day5Text": "None", "day5Color": "afddf6", "day5ValidTime": "12Z 08/23/26 - 12Z 08/24/26"
}
```
(Norman OK carried no active ERO risk at probe time — real live network data, not a stub; the non-null `valid_time` strings are the ERO-01/PERF-02 evidence that the fetch genuinely ran.)

### Inside-polygon run (ERO-01/ERO-02 evidence)

**Location:** lat `31.955228625073847`, lon `-111.58296797339065` — derived as the centroid of a live Day 4 (`dn: 2`, Slight) ERO polygon feature, confirmed inside that polygon via `turf.booleanPointInPolygon`, and independently cross-checked against all five live layer downloads with a standalone `eroDnToValue`/`eroValueToTier` script before running the probe (results matched the probe output exactly).

**Observed per-day tiers** (`extended: false`, `showExcessiveRain: true`):

| Day | Risk | Text | Color | Valid Time |
|-----|------|------|-------|------------|
| 1 | SLGT | Slight | f7f690 | `12Z 08/19/26 - 12Z 08/20/26` |
| 2 | MRGL | Marginal | 7ac687 | `12Z 08/20/26 - 12Z 08/21/26` |
| 3 | MRGL | Marginal | 7ac687 | `12Z 08/21/26 - 12Z 08/22/26` |
| 4 | MRGL | Marginal | 7ac687 | `12Z 08/22/26 - 12Z 08/23/26` |
| 5 | MRGL | Marginal | 7ac687 | `12Z 08/23/26 - 12Z 08/24/26` |

All five `dayNRisk` values are non-NONE tier strings with matching `dayNText`/`dayNColor` — this is the ERO-01/ERO-02 evidence (real risk correctly evaluated through ERO's own `dn` map, not fire weather's).

### Outside-all-polygons run (ERO-03 evidence)

**Location:** lat `47.61`, lon `-122.33` (Seattle, WA) — confirmed via `turf.booleanPointInPolygon` against all five live layer downloads to fall outside every ERO polygon on every one of the five days before running the probe.

**Result** (`extended: false`, `showExcessiveRain: true`): all five `dayNRisk` = `"NONE"` **while** all five `dayNValidTime` remained the same non-null strings as Run B (`12Z 08/19/26 - 12Z 08/20/26` through `12Z 08/23/26 - 12Z 08/24/26`) — proving the fetch happened and the location simply wasn't covered, not that the fetch silently failed.

### Repeat in-process call (PERF-02 cache-hit correctness)

Second `getSpcOutlook` call on the same helper instance (no re-`start()`), same location/config as Run B:

- Log output contained **`cache hit (ETag)`** for all five ERO URLs (layers 0-4).
- `helper._geoJsonCache` contained **exactly 5** keys containing `wpc_precip_hazards` — one per layer, confirming no cache-key multiplication (PERF-02).
- `JSON.stringify(firstCall.excessiveRain) === JSON.stringify(secondCall.excessiveRain)` → **`true`**.
- Second call's `excessiveRain` block (identical to first call's, reproduced above under Run B) — every `dayNRisk` still a tier string (`"NONE"`), every `dayNText`/`dayNColor` a non-empty string, never `undefined` — direct evidence the single downstream `ero.valueToTier` conversion runs correctly on the cache-hit path too.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `node_helper.js`'s `excessiveRain` payload block matches the `<interfaces>` contract plan 14-04 consumes verbatim (`dayNRisk`/`dayNText`/`dayNColor`/`dayNValidTime` for days 1-5, tier-string vocabulary matching day1-3's `risk` field, not fire weather's numeric gate)
- Plan 14-04 can build the frontend `defaults:`/socket-send/render-block/no-risk-gate work against the toggle-on `excessiveRain` block captured above
- Plan 14-05's UAT can reuse the inside-polygon (`31.955228625073847, -111.58296797339065`) and outside-all-polygons (`47.61, -122.33`) coordinates directly — both independently cross-verified against live layer downloads before being used in the probe
- No blockers for 14-04 or 14-05

---
*Phase: 14-foundation-wpc-excessive-rainfall-outlook*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-03-SUMMARY.md`
- FOUND: commit `2434de6` (Task 1)
- FOUND: commit `f2b5df4` (Task 2)
- FOUND: `node_helper.js`
