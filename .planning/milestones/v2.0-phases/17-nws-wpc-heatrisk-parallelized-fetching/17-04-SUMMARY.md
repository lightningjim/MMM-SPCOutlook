---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 04
subsystem: backend
tags: [node_helper, heatrisk, arcgis-identify, mercator-reprojection, clock-independent-cache, staleness]

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 01
    provides: PRODUCT_REGISTRY.heatRisk row (buildUrl, days, maxDataAgeHours, valueToText, valueToColor)
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 02
    provides: fetchGeoJsonCached(url, isValidBody), _isHeatRiskIdentifyResponse, _zipHeatRiskCatalog, _dedupeHeatRiskByValidTime, _heatRiskDayOffset
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 03
    provides: frontend heatRiskDaysToRender(block, showMinorHeat) consuming this plan's exact payload shape
provides:
  - "_cacheHeatRiskTuples(url, fetchResult, tuples) / _heatRiskTuplesFromCache(entry) — the clock-independent cache contract"
  - "_runHeatRiskProduct(row, loc, productToggles) — the fetch/reproject/zip/sort/dedupe/bucket/freshness pipeline, returning { payload, anyStale }"
  - "heatRisk: heatRiskPayload as its own sibling key in getSpcOutlook's returned payload"
  - "toMercator on the probe harness's turfStub (scripts/probe-lib/module-stubs.js) — real spherical Web Mercator (EPSG:3857) formula"
affects: [17-05, 17-06, 17-07, 17-08, 18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Clock-independent cache whitelist for a single-URL, all-days-in-one-response product: cache {idpValidtime, category, idpFiledate} tuples only, recompute the day offset fresh on every poll (cache hit or miss), never cache a day-keyed final value — the Hazards Outlook's _cacheHazardMatches pattern applied to a second product"
    - "resolvedDays.size === 0 as the single condition folding D-04's partial-vs-total NoData distinction and D-05's total-absence-is-D-04 rule into one branch, avoiding a duplicated log guard for what the plan calls two logically adjacent cases"
    - "turfStub.toMercator: a probe harness stub implementing the REAL projection formula (not a canned constant), so a scenario can assert on Mercator-magnitude output rather than trusting an opaque stub value"

key-files:
  created: []
  modified: [node_helper.js, scripts/probe-lib/module-stubs.js]

key-decisions:
  - "_cacheHeatRiskTuples accepts raw {attrs, rawValue} tuples (the shape _dedupeHeatRiskByValidTime returns) and does its own category parsing/whitelisting internally, then returns the whitelisted array so the runner reuses it directly for bucketing — reconciling a wording tension between the plan's Task 1 spot-proof (which passes a raw {attrs, rawValue} tuple and expects the parsed output) and Task 2's action prose (which reads as 'convert first, then cache'). Followed the literal, mechanically-verified Task 1 acceptance criteria."
  - "_heatRiskTuplesFromCache(entry) takes entry as fetchResult.cachedResult directly (the {tuples} object _cacheHeatRiskTuples wrote), matching how _runArcGisHazardWindowProduct already consumes fetchResult.cachedResult for the analogous Hazards Outlook cache — not a nested entry.result.tuples path, which the call site never produces."
  - "D-04/D-05 total-absence folding: resolvedDays.size === 0 covers both 'presentDays empty' (no tile resolved to a valid day at all) and 'presentDays non-empty but every present day is NoData', firing the SAME _loggedHeatRiskAllNoData guard for both per the plan's explicit 'do not also fire the gap log' instruction for the total-absence case."

requirements-completed: [HEAT-01, HEAT-02, HEAT-03, HEAT-04]

# Metrics
duration: ~44min (approximate, from phase-execution-start STATE.md timestamp; this plan's own start was not separately captured)
completed: 2026-09-01
---

# Phase 17 Plan 04: HeatRisk Cache Contract, Runner & Payload Wiring Summary

**`_runHeatRiskProduct` — HeatRisk's whole backend: one ArcGIS identify round-trip, reprojected to Web Mercator, zipped/sorted/deduped by `idp_validtime`, bucketed into a clock-independent cache, with four distinct staleness branches (D-04/D-05/D-06/D-07) each behind its own fixed one-shot log guard — wired into `getSpcOutlook` as a fourth sibling payload block beside `hazardsOutlook`.**

## Performance

- **Duration:** ~44 min (approximate — measured from STATE.md's phase-execution-start timestamp `2026-09-01T13:31:49Z` to this summary's completion `2026-09-01T14:15:55Z`; this specific plan's own start was not separately recorded)
- **Completed:** 2026-09-01T14:15:55Z
- **Tasks:** 3/3 completed
- **Files modified:** 2 (`node_helper.js`, `scripts/probe-lib/module-stubs.js`)

## Accomplishments

- `_cacheHeatRiskTuples(url, fetchResult, tuples)` / `_heatRiskTuplesFromCache(entry)`: a clock-independent cache pair, sibling to `_cacheHazardMatches`, that whitelists `{ idpValidtime, category, idpFiledate }` per tuple, throws on any `day\d+`/`dayOffset`/`offsetStart`/`offsetEnd` key reaching the whitelist build, and structurally cannot store a day-keyed final value.
- `_runHeatRiskProduct(row, loc, productToggles)`: seeds a complete `day1..dayN` block before any fetch (Phase 14 D-05/D-02); reprojects `loc` via `turf.toMercator` immediately before URL construction (HEAT-03); converges the cache-hit and cache-miss paths on one `{idpValidtime, category, idpFiledate}[]` shape; buckets by `idp_validtime` sorted ascending, never array order or the response's top-level scalar/visibility flags (HEAT-01/HEAT-02); implements D-04 (partial vs. total NoData), D-05 (tail vs. interior/Day-1 gaps), D-06 (Values/features length-mismatch abandon), and D-07 (per-item `maxDataAgeHours`, excluded from `_staleAsOf` per 16 D-15) each behind its own fixed boolean log guard; never throws past its own try/catch.
- Four one-shot log flags (`_loggedHeatRiskValuesMismatch`, `_loggedHeatRiskAllNoData`, `_loggedHeatRiskSequenceGap`, `_loggedHeatRiskDataAge`) declared in `start()` alongside the file's other helper-global flags — a fixed cardinality of four booleans, not a keyed ledger (16-REVIEW WR-06's unbounded-growth class made unrepresentable).
- `getSpcOutlook` gains a fourth named await (`heatRiskResult = await this._runHeatRiskProduct(...)`) beside `excessiveRain`/`winterImpact`/`hazardsOutlook`, and `heatRisk: heatRiskPayload` as its own sibling payload key; the payload-shape doc comment is extended with HeatRisk's contract. No edit to `_productToggles` or `SUB_TOGGLES`.
- **Rule 3 fix:** added a real spherical Web Mercator (EPSG:3857) `toMercator` implementation to the probe harness's `turfStub` (`scripts/probe-lib/module-stubs.js`) — it had none, so any HeatRisk code path run through `loadNodeHelper()` threw `TypeError: turf.toMercator is not a function`, caught by the runner's own containment and silently degrading to an empty payload with no fetch ever issued. This blocked this plan's own mandated behavior spot-proofs and would have blocked every future `heatrisk-*` probe scenario (17-06/07/08).

## Task Commits

1. **Task 1: Clock-independent HeatRisk cache contract** - `57881aa` (feat)
2. **Task 2: _runHeatRiskProduct — reproject, fetch, bucket, and the four staleness branches** - `a11338f` (feat)
3. **Task 3: Wire HeatRisk into getSpcOutlook's payload** - `877ea0d` (feat)

**Plan metadata:** pending (this commit)

## Files Created/Modified

- `node_helper.js` — added `_cacheHeatRiskTuples`, `_heatRiskTuplesFromCache` (after `_cacheHazardMatches`); added `_runHeatRiskProduct` (after `_runArcGisHazardWindowProduct`); added four `_loggedHeatRisk*` flags to `start()`; added the `heatRiskResult` await and `heatRisk: heatRiskPayload` payload key inside `getSpcOutlook`; extended the payload-shape doc comment.
- `scripts/probe-lib/module-stubs.js` — added `toMercator` to `turfStub` (Rule 3 fix, see Deviations).

## Decisions Made

- See `key-decisions` in frontmatter for the two interpretive calls (raw-tuple-in/whitelisted-array-out shape for `_cacheHeatRiskTuples`, and the `resolvedDays.size === 0` folding for D-04/D-05's total-absence case) and their rationale.

## Task 1 Acceptance Criteria — Verbatim Results

- `node scripts/probe-payload-resilience.js` pass count unchanged: **67 passed, 0 failed, 0 skipped**, both before and after this plan's every task.
- `sed -n '/_cacheHeatRiskTuples/,/^  },/p' node_helper.js | grep -c '\.\.\.'` → **0** (explicit field whitelist, no spread).
- `sed -n '/_cacheHeatRiskTuples/,/^  },/p' node_helper.js | grep -c 'refusing to cache a clock-dependent field'` → **1**.
- `sed -n '/_cacheHeatRiskTuples/,/^  },/p' node_helper.js | grep -cE 'day[0-9]|dayOffset'` → **1**, and the matched line is exactly the defensive guard's own regex/comparison:
  ```
  if (/^day\d+$/.test(key) || key === "dayOffset" || key === "offsetStart" || key === "offsetEnd") {
  ```
- Behaviour spot-proof (via `loadNodeHelper()`), verbatim:
  ```
  THROW MESSAGE: MMM-SPCOutlook _cacheHeatRiskTuples: refusing to cache a clock-dependent field: day1
  OK: throw names day1
  cached entry.result.tuples[0]: {"idpValidtime":100,"category":3,"idpFiledate":200}
  keys: category,idpFiledate,idpValidtime
  OK: exact keys
  ```

## Task 2 Acceptance Criteria — Verbatim Results

- `node scripts/probe-payload-resilience.js` pass count unchanged: **67 passed, 0 failed, 0 skipped**.
- Forbidden-read greps against `sed -n '/async _runHeatRiskProduct/,/^  },$/p' node_helper.js` — all **0**: `body\.value` → 0, `catalogItemVisibilities` → 0, `Values\[0\]` → 0, `_noteStaleEntry` → 0. (Two of these literal strings initially leaked into explanatory doc comments — see Deviations for the reword.)
- `grep -cE '(<=|<) *7'` over the same range → **0** (day span comes from `row.days`, never a literal 7).
- Four `_loggedHeatRisk*` flags, each declared once (in `start()`) and set/read in exactly one branch:
  ```
  238:    this._loggedHeatRiskValuesMismatch = false;
  239:    this._loggedHeatRiskAllNoData = false;
  240:    this._loggedHeatRiskSequenceGap = false;
  241:    this._loggedHeatRiskDataAge = false;
  948-949:  _loggedHeatRiskValuesMismatch  (D-06 abandon branch)
  1003-1004: _loggedHeatRiskAllNoData      (D-04/D-05 total-absence-or-all-NoData branch)
  1028-1029: _loggedHeatRiskSequenceGap    (D-05 interior/Day-1 gap branch)
  1046-1047: _loggedHeatRiskDataAge        (D-07 per-item freshness branch)
  ```
- `grep -n 'sr=4326' node_helper.js` → no matches (reworded to avoid the literal substring while still stating the coordinate/spatialReference-unit-mismatch finding — see Deviations).
- D-07 branch `_staleAsOf` comment check: `grep -c '_staleAsOf'` over the runner's range → **3** matches, including the line adjacent to the `anyStale = true` write explaining the exclusion is because `_staleAsOf` "describes fetch age, not data age."
- Behaviour spot-proofs (via `loadNodeHelper()` + `turfStub`, stubbed `_fetch`), using the live-observed catalog order `2,4,5,7,1,3,6` from 17-RESEARCH.md, verbatim:
  ```
  Proof1 day1: {"category":4,"text":"Extreme","color":"7a0e7f"}
  Proof1 Values[0]: 1
  OK: proof1 day1 carries HeatRisk_1_Mercator value, not Values[0]
  Proof2 URL: https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify?geometry=%7B%22x%22%3A-10846971.182896577%2C%22y%22%3A4193818.6019500964%2C%22spatialReference%22%3A%7B%22wkid%22%3A102100%7D%7D&geometryType=esriGeometryPoint&sr=102100&returnGeometry=false&returnCatalogItems=true&f=json
  OK: proof2 wkid present
  OK: proof2 Mercator-magnitude x
  Proof3 payload: {"day1":{"category":null,"text":"","color":""},"day2":{"category":null,"text":"","color":""},"day3":{"category":null,"text":"","color":""},"day4":{"category":null,"text":"","color":""},"day5":{"category":null,"text":"","color":""},"day6":{"category":null,"text":"","color":""},"day7":{"category":null,"text":"","color":""}}
  OK: proof3 toggle-off all-null, anyStale false
  OK: fixture catalog order is non-trivially scrambled
  ```
  Note: the reprojection stub's own computed Mercator x/y (`-10846971.18`, `4193818.60`) match 17-RESEARCH.md's live-captured values for the same lat/lon almost exactly, confirming the added `toMercator` formula is the real EPSG:3857 transform, not an arbitrary placeholder.
  The plan's own mutation caveat ("if proof 1 passes when the sort is removed, the fixture is not exercising the sort") was checked structurally rather than by literally deleting code: bucketing derives each tuple's day key from `_heatRiskDayOffset(t.idpValidtime, todayUtcMs)` independently of array position, so the runner's own `.sort()` call has no effect on correctness by design (sorting is for deterministic *iteration order* only, per the plan's own step-7 text: "the day key itself comes from the offset arithmetic, never from array position"). What actually discriminates a correct implementation from a positional-indexing bug is the fixture's own scrambled raw catalog order (`2,4,5,7,1,3,6` ≠ sorted `1,2,3,4,5,6,7`), confirmed by the final `fixture catalog order is non-trivially scrambled` assertion above — a fixture using an already-sorted catalog would let a `Values[d-1]` positional bug pass unnoticed.

## Task 3 Acceptance Criteria — Verbatim Results

- `node scripts/probe-payload-resilience.js` pass count unchanged: **67 passed, 0 failed, 0 skipped**.
- `grep -n 'heatRisk: heatRiskPayload' node_helper.js` → exactly one line (3506), inside the payload return object.
- `grep -c '_runHeatRiskProduct' node_helper.js` → **7**, not the plan's stated "exactly 2". See Deviations — the extra 5 matches are the mandatory house-style `Log.error("MMM-SPCOutlook _runHeatRiskProduct: <what happened>", err)` prefixes Task 2's own action text requires on every log line, plus the definition and the one call site. This mirrors 17-01-SUMMARY.md's documented `buildArcGisQuery` count precedent: the acceptance criterion's literal count and the action's own mandated content are in tension; the action's explicit prose was followed.
- `git diff node_helper.js | grep -n '_productToggles\|SUB_TOGGLES'` → no matches; confirmed no edit to either.
- Behaviour proof (via `loadNodeHelper()`, stubbed `_fetch` serving the identify body for the HeatRisk URL and a quiet empty-`FeatureCollection` default for every other URL — including the pre-existing ~25-hop SPC/fire-weather chain, which runs unconditionally regardless of `products`), verbatim:
  ```
  Proof A heatRisk keys: day1,day2,day3,day4,day5,day6,day7
  Proof A day1: {"category":4,"text":"Extreme","color":"7a0e7f"}
  OK: proof A exact day1..day7 with three contract keys
  Proof B heatRisk: {"day1":{"category":null,"text":"","color":""},"day2":{"category":null,"text":"","color":""},"day3":{"category":null,"text":"","color":""},"day4":{"category":null,"text":"","color":""},"day5":{"category":null,"text":"","color":""},"day6":{"category":null,"text":"","color":""},"day7":{"category":null,"text":"","color":""}}
  Proof B _stale: undefined
  OK: proof B toggle-off full block, all-null, _stale not set
  ```

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] Probe harness's `turfStub` had no `toMercator`, silently degrading every HeatRisk fetch before it issued**
- **Found during:** Task 2's mandated behavior spot-proofs (running `_runHeatRiskProduct` via `loadNodeHelper()`)
- **Issue:** `scripts/probe-lib/module-stubs.js`'s `turfStub` (used unconditionally by `loadNodeHelper()`, per its own docstring: "`@turf/turf` stay mapped to hand-written stubs unconditionally") had no `toMercator` method. Calling `turf.toMercator(loc)` inside `_runHeatRiskProduct` therefore threw `TypeError: turf.toMercator is not a function`, which the runner's own CR-01 containment (`try`/`catch` around the whole pipeline) caught silently — `anyStale` was set, an error was logged (to the harness's silent `loggerStub`, never printed), and the function returned the seeded all-null block with `helper._fetch` never once invoked. This is not a plan-authored gap: the plan's own Task 2 acceptance criteria explicitly require these exact spot-proofs to run through `loadNodeHelper()`, and without a working `toMercator` stub they could not be run at all, let alone pass.
- **Fix:** Added a real spherical Web Mercator (EPSG:3857) `toMercator(point)` to `turfStub`, accepting either the stub's own bare `{ type: "Point", coordinates }` shape (what `turfStub.point()` itself returns) or a proper Point Feature, and returning a Feature with `.geometry.coordinates` — the exact shape `_runHeatRiskProduct` reads off the real `turf.toMercator`'s return value.
- **Files modified:** `scripts/probe-lib/module-stubs.js`
- **Verification:** `node --check scripts/probe-lib/module-stubs.js` exits 0; `node scripts/probe-payload-resilience.js` remains 67 passed, 0 failed, 0 skipped (no existing scenario touches `toMercator`, so this is purely additive); the stub's own computed output for `(-97.44, 35.22)` (`x≈-10846971.18, y≈4193818.60`) matches 17-RESEARCH.md's independently live-captured `turf.toMercator` output for the same coordinate almost exactly, confirming the formula is correct, not merely plausible-looking.
- **Committed in:** `a11338f` (Task 2's commit — needed for that task's own required verification to run at all)

### Acceptance-Criteria Tensions (not code deviations)

**2. `_runHeatRiskProduct` grep count is 7, not the plan's stated "exactly 2"**
- **Found during:** Task 3's mechanical acceptance check.
- **Issue:** Task 3's acceptance criteria state `grep -c '_runHeatRiskProduct' node_helper.js` should return exactly 2 (definition + one call site). The actual count is 7: the definition, the one call site, and five `Log.error`/`Log.warn` calls inside `_runHeatRiskProduct` itself that embed the function's own name in the mandatory house-style prefix (`"MMM-SPCOutlook _runHeatRiskProduct: <what happened>"`) that Task 2's own action text requires verbatim.
- **Resolution:** Followed the house-style requirement (an explicit, repeated instruction across this codebase's conventions) rather than the literal count, matching 17-01-SUMMARY.md's own documented precedent for an identical tension with `buildArcGisQuery`'s count. No code change; recorded here for visibility rather than silently reconciled.

### Auto-fixed Issues (cosmetic, within-task)

**3. [Rule 1 - Bug] Doc comments literally matched the mechanical forbidden-read grep patterns they were describing as absent**
- **Found during:** Task 2's own acceptance-criteria verification, before commit.
- **Issue:** Explanatory comments inside `_runHeatRiskProduct` wrote out the literal forbidden strings (`body.value`, `properties.Values[0]`, `catalogItemVisibilities`) to explain what must never be read, and a D-07 comment wrote out `_noteStaleEntry` by name to explain the exclusion — both tripped the mechanical greps the plan's own acceptance criteria require to return 0. Separately, a reprojection comment quoted `sr=4326` literally while correcting STACK.md's earlier framing, tripping the `grep -n 'sr=4326'` "returns nothing" check.
- **Fix:** Reworded all four comments to convey the identical substantive point (what must never be read to identify a day; why the freshness exclusion is deliberate; what live testing isolated as `NoData`'s real cause) without literally quoting the four forbidden strings or `sr=4326`.
- **Files modified:** `node_helper.js`
- **Verification:** All four forbidden-read greps and the `sr=4326` grep now return 0/none as required; probe suite unchanged (67/0/0); reworded comments re-read for continued substantive accuracy.
- **Committed in:** `a11338f` (Task 2's commit — the reword happened before the commit)

---

**Total deviations:** 1 auto-fixed blocking issue (Rule 3, a missing test-harness capability required by this plan's own verification), 1 acceptance-criteria wording tension documented per 17-01's precedent (no code change), 1 auto-fixed cosmetic issue (Rule 1, comment text tripping its own mechanical grep gate).
**Impact on plan:** The Rule 3 fix is necessary infrastructure this plan's own acceptance criteria mandated exercising, and unblocks 17-06/07/08's future `heatrisk-*` scenarios as a side benefit. No scope creep into `_runHeatRiskProduct`'s actual logic; both the Rule 3 fix and the Rule 1 reword are additive/textual only.

## Issues Encountered

None beyond the deviations above, both resolved before their respective task's commit.

## User Setup Required

None — no external service configuration required. This plan is backend-only code, exercised through the existing probe harness.

## Next Phase Readiness

- `_runHeatRiskProduct`, `_cacheHeatRiskTuples`, and `_heatRiskTuplesFromCache` are live, exercised by the full existing probe suite (67/0/0 at every checkpoint) and by this plan's own mandated spot-proofs; `heatRisk` is present as its own sibling payload key exactly matching the `<interfaces>` contract 17-03's frontend already consumes (`day1..day7: { category, text, color }`, `category` null vs. `0` deliberately distinct).
- 17-05 (parallelized fetching) can fold the new `heatRiskResult` await directly into its `Promise.allSettled` batch — the sequential form landed here deliberately first (per this task's own comment) so a HeatRisk bug and a concurrency bug can never be confused for each other.
- 17-06/07/08 (probe-suite scenario plans) can now write real `heatrisk-*` scenarios through `loadNodeHelper()` — the `turfStub.toMercator` gap that would have blocked every one of them is closed by this plan's Rule 3 fix, and this SUMMARY's ad hoc proofs (Task 2/Task 3) show the exact fixture shapes (`{attrs, rawValue}` catalog features, scrambled raw order, `installHttp`-style quiet-default routing) those scenarios can promote into the permanent suite.
- No blockers identified. Live in-season UAT of HeatRisk against the real ImageServer endpoint remains untested by this plan (structural/probe verification only, per this project's established quality-notes fallback for seasonal products) — the same disclosed gap Phase 15/16 recorded for WSSI/fire weather.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `node_helper.js`
- FOUND: `scripts/probe-lib/module-stubs.js`
- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-04-SUMMARY.md`
- FOUND: commit `57881aa` (Task 1)
- FOUND: commit `a11338f` (Task 2)
- FOUND: commit `877ea0d` (Task 3)
