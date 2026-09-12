# Phase 18: Merge, Precedence & Unified Payload Schema - Pattern Map

**Mapped:** 2026-09-05
**Files analyzed:** 3 (1 new, 2 modified)
**Analogs found:** 3 / 3

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `hazardTaxonomy.js` (new) | config / static data table | transform (lookup, no logic) | `productRegistry.js` | exact — same "pure static config" role RESEARCH.md's Architectural Responsibility Map assigns it, D-06 explicitly modeled on 15 D-02 |
| `node_helper.js` — grid-anchor extraction (new, ~inside the day1 inline block, node_helper.js:3048-3086) | utility / extraction function | transform (reads an already-fetched winning polygon) | `node_helper.js:302-369` `_runArcGisDayProduct`'s `_validTimeOfWinner` call (line 353-355) | exact — same helper, same call idiom, different caller (inline vs. registry-driven) |
| `node_helper.js` — SPC-grid day-window normalization (new function family, parallel to `_hazardDayOffset`/`_bucketHazardMatch`) | utility | transform | `node_helper.js:2342` `_hazardDayOffset`, `node_helper.js:2495` `_bucketHazardMatch` | role-match — same shape, reused with a redirected anchor per RESEARCH.md's "Day-Window Normalization Mechanics" |
| `node_helper.js` — per-day precedence/suppression resolver (new) | service | transform (annotate, no I/O) | No direct analog exists (first precedence-resolution code in the codebase) — closest structural cousin is `evaluatePolygons`'s comparator-reduce shape and the `NO_RISK_FLOOR` table sketched in RESEARCH.md | no analog — build from RESEARCH.md's Precedence Table / No-Risk Floor Table directly |
| `node_helper.js` — `days`/`summary`/`sources` assembly (new, inserted at/around the return statement, node_helper.js:3685) | service / aggregation | transform, read-only over existing locals | `node_helper.js:3685-3801` the existing return-statement assembly itself (its OWN legacy-block-building code is the analog for "read already-computed locals, don't refetch") | role-match — same function, same locals, additive sibling block |
| `node_helper.js` — PERF-03 timing instrumentation (extend `memberTimings`, wrap `GET_SPC_DATA`/`SPC_DATA_RESULT`) | middleware / instrumentation | event-driven (socket handler bracket) | `node_helper.js:3632-3660` existing `memberTimings` block (PERF-01) | exact — same object, same pattern, this phase only widens it |
| `node_helper.js` — once-per-cold-start summary log (D-18) | utility | event-driven | `this._loggedIntervalFallback` / `this._loggedMultiInstance` boolean-guard pattern (node_helper.js:191, :1563-1570) | exact — identical "log once, guard with a helper-global boolean" idiom |
| `scripts/probe-payload-resilience.js` — new merge/precedence/day-window probe scenarios | test (probe scenario) | request-response (simulated HTTP + payload assertion) | `scripts/probe-payload-resilience.js:5155-5227` (`hazards-idp-filedate-is-evaluated-per-layer-not-shared`) and `:5229-5299` (`hazards-stale-layer-ages-out-even-when-nothing-contains-the-user`) | exact — same `{ name, run }` shape, same reset/route/assert/precondition/control structure |

## Pattern Assignments

### `hazardTaxonomy.js` (new — config, transform)

**Analog:** `productRegistry.js` (573 lines, pure static config, D-06 is explicitly modeled on 15 D-02's "registry rows are pure static config" rule)

**File header pattern** (`productRegistry.js:1-8`):
```javascript
// productRegistry.js — product-descriptor table for WPC/CPC hazard products (D-07)
// and the single shared ArcGIS query builder (D-09).
//
// This file covers new WPC/CPC products only. It does not move, reference, or
// refactor the existing SPC URL constants, riskToValue, fireRiskToValue, or
// dnToFireValue defined in node_helper.js (D-08) — those stay exactly where
// they are.
```
`hazardTaxonomy.js` should open with the equivalent scope statement: it covers every product's `(source, label) -> dimension` mapping AND the precedence table AND the `NO_RISK_FLOOR` table, per D-06 — "the precedence table beside the map" is the load-bearing design choice to restate up top, plus an explicit note (per RESEARCH.md's refinement) that HeatRisk's day-offset needs NO interval-overlap logic while `wpc-hazards`' does, so a future maintainer doesn't "fix" HeatRisk into matching the other.

**No-`this`, no-network discipline** — `productRegistry.js`'s own row-level comments state this repeatedly (e.g. `productRegistry.js:365-368`: "Pure static configuration (D-02): no `this`, no network call, no `require`."). `hazardTaxonomy.js` must hold the same discipline: plain object literals and arrow functions closing only over module constants, never `this`.

**Data-table shape to copy** — `PRODUCT_REGISTRY`'s row-of-object-literals-keyed-by-id shape (`productRegistry.js:298-520`), e.g.:
```javascript
const PRODUCT_REGISTRY = {
  excessiveRain: {
    id: "excessiveRain",
    kind: "arcgis-day-layers",
    configFlag: "showExcessiveRain",
    ...
    toValue: (label, f) => eroDnToValue[f.properties.dn] || 0,
    includesFeat: (label, val) => val > 0,
    ...
  },
  ...
};
```
`hazardTaxonomy.js` should mirror this with three parallel exported tables (RESEARCH.md's "Primary recommendation"):
```javascript
// (source, label) -> { dimension, ... }
const HAZARD_TAXONOMY = { "spc-convective": { TSTM: { dimension: "convective" }, ... }, ... };
// dimension -> ordered source-id array (rank 1 first)
const PRECEDENCE = { convective: ["spc-convective", "wpc-hazards"], ... };
// source -> predicate, or source -> { categorical, probabilistic } for spc-convective's two floors
const NO_RISK_FLOOR = { "spc-convective": { categorical: (v) => v > 1, probabilistic: (r) => r !== "NONE" }, ... };
```

**Load-time validation pattern** (`productRegistry.js:34-74`, `daySpanOf`, and the module-load-time call at `productRegistry.js:568` `assertNoSharedRegistryMaps(PRODUCT_REGISTRY);`) — throw at `require()` time on a structurally invalid table rather than degrading silently at poll time:
```javascript
// productRegistry.js:53-74 — the pattern to copy for any hazardTaxonomy.js structural
// invariant (e.g. "every PRECEDENCE dimension key must also appear in D-05's roster",
// "every NO_RISK_FLOOR key must be one of the 8 source ids").
function daySpanOf(dayLayers) {
  if (!dayLayers || typeof dayLayers !== "object") {
    throw new Error("productRegistry: dayLayers must be an object, got " + JSON.stringify(dayLayers));
  }
  ...
}
```

**Export style** (`productRegistry.js:570-573`):
```javascript
module.exports = {
  buildArcGisQuery, daySpanOf, dayRangeOf, hazardLabelKey, normalizeHazardLabel,
  MPD_FILENAME_PATTERN, PRODUCT_REGISTRY, buildHeatRiskIdentifyUrl, assertNoSharedRegistryMaps
};
```
`hazardTaxonomy.js` should export a named CJS object the same way — `module.exports = { HAZARD_TAXONOMY, PRECEDENCE, NO_RISK_FLOOR, ... }` — never `export default`.

**Import/consumption site in `node_helper.js`** (`node_helper.js:26`):
```javascript
const { PRODUCT_REGISTRY, MPD_FILENAME_PATTERN, hazardLabelKey } = require("./productRegistry");
```
`hazardTaxonomy.js` gets the identical top-of-file destructured `require`, e.g. `const { HAZARD_TAXONOMY, PRECEDENCE, NO_RISK_FLOOR } = require("./hazardTaxonomy");` — D-06's note "imported by `node_helper.js` only" means no other file needs this require.

---

### `node_helper.js` — grid-anchor extraction (D-12, new)

**Analog:** the existing `_validTimeOfWinner` call inside `_runArcGisDayProduct` (`node_helper.js:349-355`):
```javascript
validTime = value > 0
  ? this._validTimeOfWinner(polys, loc, value, row.validTimeField)
  : null;
```

**`_validTimeOfWinner` itself, verbatim** (`node_helper.js:2000-2033`):
```javascript
/**
 * Read a validity-window property off the polygon that produced the winning tier.
 * @param items - array of { label, value, poly, feature } from extractPolygons
 * @param loc - turf point representing the query location
 * @param winningValue - the tier value evaluatePolygons resolved for `loc`
 * @param field - the feature property to read (e.g. the ERO registry row's validTimeField)
 * @returns the property value from the first item whose value equals `winningValue` and
 *   whose polygon contains `loc`, or null when there is no such item or it carries no
 *   usable `properties`. Never throws...
 */
_validTimeOfWinner(items, loc, winningValue, field){
  if (!Array.isArray(items) || !field) return null;
  for (const item of items) {
    if (!item || item.value !== winningValue || !item.poly) continue;
    if (!turf.booleanPointInPolygon(loc, item.poly)) continue;
    const props = item.feature && item.feature.properties;
    if (!props || typeof props !== "object") continue;
    const v = props[field];
    if (v !== undefined && v !== null) return v;
  }
  return null;
},
```

**CRITICAL — structural gotcha for the plan, found while extracting this pattern:** unlike ERO/WSSI, SPC's day1 categorical block does NOT keep its winning-polygon array (`day1RiskPoly`) in function-level scope. Read `node_helper.js:3044-3086` verbatim:
```javascript
let day1RiskResult;
let day1Risk;
let day1CatProximity = null;
{
  const fetchResult = await this.fetchGeoJsonCached(day1CatURL);
  ...
  if (fetchResult.data === null && fetchResult.cachedResult !== null) {
    day1RiskResult = fetchResult.cachedResult;
    // NOTE: no `day1RiskPoly` exists on this branch at all — it is a cache-hit,
    // and only `this._geoJsonCache.get(day1CatURL).polys` exists, and ONLY when
    // this._proximityWeighting is true.
    ...
  } else if (fetchResult.data === null) {
    day1RiskResult = 0;
    // NOTE: no polygons at all on this branch — a hard fetch failure with nothing cached.
  } else {
    const gj = fetchResult.data;
    const day1RiskPoly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0, day1CatURL);
    day1RiskResult = this.evaluatePolygons(day1RiskPoly, loc, catComparator);
    // `day1RiskPoly` is scoped to this `{ }` block via `const` — it does NOT survive
    // past line 3086's closing brace today.
    ...
  }
  day1Risk = day1RiskResult === 0 ? "NONE" : valueToRisk[day1RiskResult];
}
```
RESEARCH.md's suggested call site (`this._validTimeOfWinner(day1RiskPoly, loc, day1Risk, "VALID_ISO")` "immediately after day1RiskPoly and day1RiskResult are computed, ~node_helper.js:3065") is only reachable from INSIDE the fresh-fetch branch as written. The plan must do one of: (a) call `_validTimeOfWinner` for `VALID_ISO`/`EXPIRE_ISO` right inside that `else` branch and hoist the two resulting values to `let` locals declared alongside `day1RiskResult`/`day1Risk` at line 3044-3047 (so they survive to the return-statement assembly point), with `null` on the cache-hit and hard-failure branches (matching D-12's `'estimated'` clock-fallback intent — no anchor read possible without polys); or (b) also read `VALID_ISO`/`EXPIRE_ISO` off the cache entry's stored `polys` when `this._proximityWeighting` is on and a cache hit occurred (mirroring how `day1CatProximity` is recomputed on that branch) and accept `null` when it is off. Either way, `gridWindowStart`/`gridWindowEnd`/`gridAnchor` need the SAME three-branch treatment `day1CatProximity` already gets (three separate assignment sites, not one).

**No-throw-on-malformed-input guard needed** (per RESEARCH.md's Security Domain table): `new Date(str)` on a malformed `VALID_ISO` yields `Invalid Date`, not a throw — guard with `Number.isFinite(d.getTime())` before treating the anchor as `'observed'`, falling back to `'estimated'` on failure, matching the existing per-feature containment idiom (`extractPolygons`/`evaluatePolygons` never let one malformed input crash the whole payload).

---

### `node_helper.js` — SPC-grid day-window normalization (D-09/D-10/D-11, new function family)

**Analog:** `_hazardDayOffset` and `_bucketHazardMatch`, both reused (not rewritten) per RESEARCH.md's explicit recommendation — both already take an arbitrary anchor as a parameter.

**`_hazardDayOffset`, verbatim** (`node_helper.js:2332-2344`):
```javascript
/**
 * The signed day offset of an epoch-ms value relative to today's UTC midnight. Every
 * `start_date`/`end_date` observed live on 2026-08-26 across 32 Hazards Outlook
 * features was exact UTC midnight, so this division is exact; `Math.round` is a
 * defensive guard against a future WPC payload that is not midnight-aligned...
 * @param epochMs - a feature's start_date/end_date, epoch milliseconds
 * @param todayUtcMs - this poll's `_todayUtcMs()` value
 * @returns integer day offset (0 = today, negative = past, positive = future)
 */
_hazardDayOffset(epochMs, todayUtcMs) {
  return Math.round((epochMs - todayUtcMs) / MS_PER_DAY);
},
```
Call this with the NEW SPC-grid anchor (D-12's `gridWindowStart`, or the clock-fallback estimate) in place of `_todayUtcMs()` — the function itself needs no edit. `_heatRiskDayOffset` (`node_helper.js:2413-2435`) is a thin wrapper around the identical call and should get the same redirected-anchor treatment, not a parallel reimplementation.

**`_bucketHazardMatch`, verbatim** (`node_helper.js:2470-2554`, header + body through the clamp) — takes `todayUtcMs` as a plain parameter already; same reuse path. Full function was read at `node_helper.js:2495-2554+`; its signature:
```javascript
_bucketHazardMatch(match, layer, todayUtcMs, dayBuckets, windowEntries, dayRangeTotal) {
  if (!match || typeof match.startDate !== "number" || typeof match.endDate !== "number" ||
      !Number.isFinite(match.startDate) || !Number.isFinite(match.endDate)) {
    return;
  }
  const offsetStart = this._hazardDayOffset(match.startDate, todayUtcMs);
  const offsetEnd = this._hazardDayOffset(match.endDate, todayUtcMs);
  if (offsetEnd < offsetStart) return;
  ...
}
```
Note the malformed-input containment at the top (`return` rather than `throw`) — any new SPC-grid-anchored day-bucketing code the plan adds must keep this same per-feature containment discipline (CR-02 lesson, explicitly flagged as still applicable in RESEARCH.md's Security Domain section).

**Open Question 1 from RESEARCH.md is NOT yet resolved** — the plan should schedule the unit-level check RESEARCH.md recommends (verify `_hazardDayOffset` against both a clean `12:00:00Z` anchor and a truncated anchor, e.g. `13:00Z` as observed live today) before relying on the reused function unmodified for the SPC-anchored grid.

---

### `node_helper.js` — per-day precedence/suppression resolver (D-13/D-14, new, no analog)

No existing code in this repo resolves cross-source precedence — this is genuinely new. Build directly from RESEARCH.md's **Precedence Table**, **No-Risk Floor Table**, and the **D-14 nuance** paragraph (Rank-1-absent-for-this-day is a DIFFERENT code path than Rank-1-present-but-below-floor — keep these as two structurally distinct branches, or one branch where "Rank 1 absent" short-circuits before the floor table is ever consulted, so "SPC forgot to report" is never conflated with "SPC reported below-floor").

**Nearest structural cousin for the "malformed input never crashes a sibling" discipline** — `evaluatePolygons`' comparator-reduce error handling (`node_helper.js:1990-1998`, `evaluatePolygonsCollectAll`):
```javascript
} catch (err) {
  Log.error("MMM-SPCOutlook evaluatePolygonsCollectAll: containment check failed for " +
            (item.label || item.value || "unlabeled feature"), err);
  this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
  return;
}
if (contains) hits.push(item);
```
The precedence resolver should apply the same per-hazard-entry containment: a single malformed `(source, label)` pair that doesn't resolve cleanly must degrade that ONE entry (fall through to D-07's `dimension: null` unmapped-label path), never abort the whole day's `hazards[]` list.

---

### `node_helper.js` — `days`/`summary`/`sources` assembly (D-01/D-02/D-03/D-04, new, inserted at the return statement)

**Analog:** the function's OWN existing return-statement assembly, `node_helper.js:3685-3801` — this IS the shared-in-memory-values source the new block must read from, per D-01's "planning constraint."

**The exact insertion point and the locals available there** (`node_helper.js:3662-3801`):
```javascript
const eroPayload = results.excessiveRain.payload;
if (results.excessiveRain.anyStale) anyStale = true;

const wssiPayload = results.winterImpact.payload;
if (results.winterImpact.anyStale) anyStale = true;

const hazardsPayload = results.hazardsOutlook.payload;
if (results.hazardsOutlook.anyStale) anyStale = true;

const heatRiskPayload = results.heatRisk.payload;
if (results.heatRisk.anyStale) anyStale = true;

const advisories = { spcMD: [], mpd: [] };
for (const row of kmlRows) {
  advisories[row.id] = results[row.id].entries;
  if (results[row.id].anyStale) anyStale = true;
}
...
return {
  ...(anyStale ? { _stale: true, _staleAsOf: this._oldestStaleAt } : {}),
  "day48Risk": day48Risk,
  day1: { "risk": day1Risk, "text": valueToFullRisk[day1Risk], ... },
  day2: { ... }, day3: { ... },
  day4: { "risk": day4Risk, "probRisk": day4ProbRisk, "sign": day4Sign, ... }, ... day8: { ... },
  fireWeather: { day1Risk: day1FireRisk, day1Text: fireValueToFull[day1FireRisk], ... day8Risk, day8Text },
  excessiveRain: eroPayload,
  winterImpact: wssiPayload,
  hazardsOutlook: hazardsPayload,
  heatRisk: heatRiskPayload,
  advisories: advisories
};
```

**THE ASYMMETRY that governs this file's shape (per the pattern-mapping task's question 2) — two genuinely different access patterns feed the same return statement:**

1. **Uniform-accessor sources (4 of 8, registry-driven, Phases 15-17):** `wpc-ero`, `wpc-wssi`, `wpc-hazards`, `heatrisk` — each is a single local already holding `{ ...blockShape }` read straight off `results.<id>.payload` (`eroPayload`, `wssiPayload`, `hazardsPayload`, `heatRiskPayload` above). The `days[]` assembly for these four dimensions (`flash-flood`, `winter`, `cold`, `wind`, `heavy-precip`, and `wpc-hazards`' contribution to `convective`/`fire`/`heat`) can iterate `eroPayload.day1`..`dayN`, `wssiPayload.day1`..`day3`, `hazardsPayload.day3`..`day14`, `heatRiskPayload.day1`..`dayN` directly — one shape, one loop per source.

2. **Inline-locals sources (2 of 8, predate the registry per 14 D-08):** `spc-convective` and `spc-fire`. There is NO `results.spcConvective.payload` or `results.spcFire.payload` — these two dimensions must be assembled by reading roughly a dozen individually-named `let`/`const` locals directly, e.g. `day1Risk`, `day1TorRisk`, `day1TorCig`, `day1HailRisk`, `day1WindRisk`, `day1ProbRisk` (day 1); `day2Risk`...`day2WindRisk` (day 2); `day3Risk`, `day3ProbRisk`, `day3Cig` (day 3); `day4Risk`/`day4ProbRisk`/`day4Sign` through `day8Risk`/`day8ProbRisk`/`day8Sign` (days 4-8, probabilistic-only, verified at `node_helper.js:3381-3494`); and `day1FireRisk`...`day8FireRisk` for fire. **This is exactly the two dimensions (`convective`, `fire`) RESEARCH.md flags as needing real two-source suppression (MERGE-02's target), so the plan cannot write one generic "read `results.<id>.payload`" loop across all eight source ids — it needs an explicit SPC/fire branch that reads these named locals.**

**Preserve byte-for-byte requirement (D-01):** every existing key in the return object above (`day48Risk`, `day1`-`day8`, `fireWeather`, `excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`, `advisories`, `_stale`/`_staleAsOf`) is untouched; `days`, `summary`, `sources` are new sibling keys added to the SAME object literal, built from the SAME locals shown above (`day1Risk` etc. AND `eroPayload`/`wssiPayload`/`hazardsPayload`/`heatRiskPayload`) — never a second pass that re-fetches or re-derives.

**JSDoc contract to extend, not replace** (`node_helper.js:2886-2926`) — the existing `@returns` doc block documents every legacy key; add `days`/`summary`/`sources` to it in the same enumerated style, including the explicit "`null` and `0` are DELIBERATELY DISTINCT" callout this doc already makes for HeatRisk (line 2917-2919), since D-13 revises WHY that distinction matters (floor test, not null/0 split) without retiring the distinction itself.

---

### `node_helper.js` — PERF-03 timing instrumentation (D-17/D-18)

**Analog:** the EXISTING `memberTimings` block, already built for PERF-01 (`node_helper.js:3629-3660`):
```javascript
const memberTimings = {};
const settleStart = this._nowMs();
const settled = await Promise.allSettled(members.map(async (m) => {
  const t0 = this._nowMs();
  try {
    return await m.run();
  } finally {
    memberTimings[m.id] = this._nowMs() - t0;
  }
}));
...
Log.info("MMM-SPCOutlook: new-product batch settled in " + (this._nowMs() - settleStart) +
         "ms " + JSON.stringify(memberTimings));
```
D-17's "per-product breakdown naming the slowest fetch" extends this SAME object — add entries for the SPC/fire-weather inline block's own elapsed time (not part of the `Promise.allSettled` batch today, per RESEARCH.md) rather than building a parallel timing structure.

**Backend-interval bracket analog** — the `GET_SPC_DATA` handler already has exactly the entry/exit shape a `_nowMs()` bracket needs (`node_helper.js:1574-1673`, `socketNotificationReceived`): entry at `if (notification === "GET_SPC_DATA") {`, exit immediately before `this.sendSocketNotification("SPC_DATA_RESULT", ...)` at line 1667. The existing `_inFlight`/`try`/`finally` structure already brackets this exact span — wrap timing around the SAME span, no new overlap handling needed.

**Once-per-cold-start log guard, verbatim analog** (`node_helper.js:191`, declared in `start()`, and its read/set site at `node_helper.js:1601-1606`):
```javascript
// start():
this._loggedIntervalFallback = false;
...
// socketNotificationReceived, guarded read+set:
if (!this._loggedIntervalFallback) {
  Log.warn("MMM-SPCOutlook: invalid updateInterval " + JSON.stringify(updateInterval) +
           ", defaulting to 60 minutes");
  this._loggedIntervalFallback = true;
}
```
D-18's "once per cold start" summary log is the identical idiom: declare a new `this._loggedColdStartTiming = false` in `start()`, guard the one-time `Log.info` summary block with it after the first successful `SPC_DATA_RESULT` emit.

---

### `scripts/probe-payload-resilience.js` — new merge/precedence/day-window probe scenarios

**Analog scenario 1 (precondition guard + control assertion, full worked example):** `hazards-idp-filedate-is-evaluated-per-layer-not-shared` (`scripts/probe-payload-resilience.js:5155-5228`):
```javascript
{
  name: "hazards-idp-filedate-is-evaluated-per-layer-not-shared",
  run: async (helper) => {
    const maxAgeHours = PRODUCT_REGISTRY.hazardsOutlook.maxDataAgeHours;
    const nowMs = HAZARDS_NOW_MS;
    const freshFiledate = nowMs - 1 * 60 * 60 * 1000;
    const staleFiledate = nowMs - (maxAgeHours + 5) * 60 * 60 * 1000;

    const originalPointInPolygon = turfStub.pointInPolygon;
    const runWithLayer3Filedate = async (layer3Filedate) => {
      resetHelper(helper);
      resetLogs();
      turfStub.pointInPolygon = () => true;
      helper._nowMs = () => nowMs;
      helper._products = { showHazardsOutlook: true };
      installHttp(helper, hazardsRoutes({ /* per-layer route overrides */ }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
      assertPayloadIntact(out);
      assertHazardsBlockIntact(out);
      return out;
    };

    try {
      const staleOut = await runWithLayer3Filedate(staleFiledate);
      // Precondition guard: the feature actually reached the payload — "stale"
      // cannot be explained by the layer having failed to parse.
      const staleBandLabels = staleOut.hazardsOutlook.windowBand.map((e) => e.label);
      if (!staleBandLabels.includes("Much Above Normal Temperatures")) {
        throw new Error(`precondition failed: layer 3's feature did not reach windowBand: ${JSON.stringify(staleBandLabels)}`);
      }
      if (staleOut._stale !== true) {
        throw new Error(`D-13: ... _stale was not set ...`);
      }

      // Control: the identical fixture with the filedate fresh must produce a falsy
      // _stale, proving the trip came from THIS specifically and not from anything
      // else in the run.
      const freshOut = await runWithLayer3Filedate(freshFiledate);
      if (freshOut._stale) {
        throw new Error("control: with every layer's idp_filedate fresh, _stale was still set — the earlier trip is not attributable to layer 3 specifically");
      }
    } finally {
      turfStub.pointInPolygon = originalPointInPolygon;
    }
  }
},
```
This is the canonical shape 15 D-10 requires and the pattern-mapping task's blocking standard: (a) pinned clock (`helper._nowMs = () => nowMs`), (b) `resetHelper`/`resetLogs` at the top of every re-run closure, (c) a **precondition guard** proving the fixture actually produced the state under test (`throw new Error("precondition failed: ...")`), (d) the PRIMARY assertion, (e) a **control assertion** proving the gate is not vacuously always-true (`throw new Error("control: ...")`), (f) `finally` restoring any hand-mutated stub (`turfStub.pointInPolygon`).

**Analog scenario 2 (same shape, isolation-focused precondition):** `scripts/probe-payload-resilience.js:4903-4912`:
```javascript
// Precondition guard: prove the fixture actually produced an empty day grid before
// [asserting on the window band] — otherwise the day-grid gate term is untested.
for (let d = 3; d <= 14; d++) {
  if (windowOnlyBlock[`day${d}`].hazards.length !== 0) {
    throw new Error(`precondition failed: day${d} is not empty, so this scenario would pass through the day-grid gate term and prove nothing about the window-band term`);
  }
}
if (windowOnlyBlock.windowBand.length !== 1) {
  throw new Error(`precondition failed: expected exactly one windowBand entry, got ${windowOnlyBlock.windowBand.length}`);
}
```

**Scenario registration point:** `scripts/probe-payload-resilience.js:1283`, `const scenarios = [`. New Phase 18 scenarios append to this SAME array — no separate file, no separate array, matching every prior phase's own additions (14-17 all landed their scenarios in this one array).

**Concrete new scenarios this phase needs (derived from RESEARCH.md, not invented here):**
- MERGE-01's near-boundary case: a Hazards Outlook feature with `start_date: 2026-09-06T00:00:00Z` under an SPC grid-day-1 window of `2026-09-05T13:00:00Z`→`2026-09-06T12:00:00Z` must bucket onto grid day 1, not grid day 2 (RESEARCH.md's "Live Field Formats" section names this exact case as "worth encoding as a mutation-proven probe scenario").
- MERGE-02: SPC `SLGT` (above floor) present alongside `wpc-hazards` "Severe Weather" on the same day → SPC's entry survives with `suppressedBy: null`, WPC's carries `suppressedBy: "spc-convective"`. Control: SPC absent (days 9-14) → WPC's entry survives with `suppressedBy: null` via the D-14 "Rank 1 absent, not below-floor" path, not the floor test — these need to be TWO separate scenarios per RESEARCH.md's explicit warning not to conflate them.
- MERGE-03: HeatRisk `0` (explicit no-risk, below D-13's `>= 1` floor) alongside `wpc-hazards` "Hazardous Heat" → WPC's entry survives (`suppressedBy: null`), proving D-13's "null and 0 both fail the floor" rule, distinct from a genuine HeatRisk `null` (no reading) doing the same.
- MERGE-04 over/under-merge: a `wpc-hazards` "Heavy Rain" feature must land in `heavy-precip`, never `flash-flood`, even when an ERO feature is ALSO active that day on `flash-flood` — proving the two dimensions never cross-suppress (RESEARCH.md's "Why `flash-flood` and `heavy-precip` are kept separate" section is the rationale to encode as the control).
- D-07 unmapped label: an unrecognized `wpc-hazards` label passes through with `dimension: null`, is never suppressed/suppressing, and is recorded in `sources['wpc-hazards'].unmappedLabels[]`.

## Shared Patterns

### Per-feature containment (never let one malformed entry take down its siblings)
**Source:** `node_helper.js:1990-1998` (`evaluatePolygonsCollectAll`), `node_helper.js:2496-2502` (`_bucketHazardMatch`'s guard), `node_helper.js:2013-2032` (`_validTimeOfWinner`'s `continue`-not-`return null` scan)
**Apply to:** the grid-anchor extraction, the day-window normalization, and the precedence resolver — all three are new code touching per-feature/per-entry data, and CR-01/CR-02's established lesson (a rejected shape must degrade ONE entry, never collapse the whole payload) applies identically here.
```javascript
// The idiom: contain at the smallest unit, never propagate past it.
if (!match || typeof match.startDate !== "number" || !Number.isFinite(match.startDate)) {
  return; // or `continue` in a loop — never throw past this point
}
```

### Registry-row-as-single-source-of-truth (never restate a derived value)
**Source:** `productRegistry.js:34-74` (`daySpanOf`), cited by its own comment as closing a real historical bug (a day-span restated twice drifted and rendered a permanent stale badge)
**Apply to:** `hazardTaxonomy.js`'s `PRECEDENCE`/`NO_RISK_FLOOR` tables — day ranges (e.g. `spc-convective`'s categorical-vs-probabilistic split at day 3/4, `wpc-wssi`'s stop at day 3) should be derivable from `PRODUCT_REGISTRY.<row>.days` wherever that value already exists in the registry, not re-typed as a literal in `hazardTaxonomy.js`.

### Once-per-process boolean-guarded logging
**Source:** `node_helper.js:191`, `:1563-1570`, `:1601-1606` (`_loggedIntervalFallback`, `_loggedMultiInstance`)
**Apply to:** D-18's cold-start timing summary log — same guard-in-`start()`, check-and-set-at-call-site idiom.

### CommonJS module shape (no ESM anywhere in this repo's backend/data files)
**Source:** `productRegistry.js:570-573`, `node_helper.js:1` (`const NodeHelper = require("node_helper");`)
**Apply to:** `hazardTaxonomy.js` — `require()`/`module.exports`, never `import`/`export`.

## No Analog Found

| File | Role | Data Flow | Reason |
|---|---|---|---|
| `node_helper.js` — precedence/suppression resolver body | service | transform | First cross-source precedence-resolution code in this codebase (RESEARCH.md: "no prior phase had a mechanism for this"). Build from RESEARCH.md's Precedence Table, No-Risk Floor Table, and D-14's absent-vs-below-floor nuance directly; the "Shared Patterns" containment idiom above is the closest reusable discipline, not a structural template. |

## Metadata

**Analog search scope:** `node_helper.js` (full file, targeted reads at lines 1-260, 280-370, 1560-1675, 1990-2560, 2880-3200, 3370-3430, 3550-3810), `productRegistry.js` (full file), `scripts/probe-payload-resilience.js` (targeted reads at lines 1283, 4900-4920, 5140-5300, plus grep survey of every `precondition failed`/`control` site)
**Files scanned:** 3 (all files this phase creates or modifies, per CONTEXT.md's file list; no other codebase files matched Phase 18's role/data-flow classifications)
**Pattern extraction date:** 2026-09-05
**CodeGraph note:** `codegraph_explore` queries for `_validTimeOfWinner`/`_hazardDayOffset` returned adjacent probe-script symbols but not the underscore-prefixed `node_helper.js` object-literal methods themselves (likely an indexing gap for `this`-bound method-shorthand properties); direct `Read` at the researched line numbers (2013, 2342, 2433, 2495) was used instead and is reflected above.

## Conventions

Derived via the shared deterministic module (`bin/gsd-tools.cjs verify conventions --derive`, run repo-wide — a `--scope` limited to this repo's own root returned `{"skipped":true,"reason":"unsafe-scope"}`, so the unscoped repo-wide run is used below).

| Axis | Dominant | Share | Entropy | Status |
|---|---|---|---|---|
| File-name casing | none (3 files sampled: 1 snake, 1 camel, 1 "other") | 0% | n/a (insufficient-data) | contested hotspot |
| Identifier casing | camelCase (7/7 sampled) | 100%* | n/a (insufficient-data, tool floor not met) | named contract |
| Export style | CJS (`module.exports`) (2/2 sampled) | 100%* | n/a (insufficient-data) | named contract |
| Import style | split: 1 CJS `require`, 1 dynamic ESM `import()` | 50% | n/a (insufficient-data) | contested hotspot |

*The derivation tool reported every axis as `insufficient-data` (sample sizes of 2-7 files/identifiers — this repo has no `src/`/`sdk/` tree the tool's default heuristics expect, so its file walk under-sampled relative to the repo's real size: `node_helper.js` alone is 3,855 lines). Reading the actual source directly (this pattern-mapping pass) confirms the tool's small sample is representative of the true pattern: **the entire backend (`node_helper.js`, `productRegistry.js`, `scripts/*.js`) is CommonJS** (`require`/`module.exports`, zero `import`/`export` statements) with **camelCase identifiers throughout** (`day1Risk`, `hazardsPayload`, `_hazardDayOffset`) and `SCREAMING_SNAKE_CASE` reserved for true module-level constants (`PRODUCT_REGISTRY`, `MS_PER_DAY`). The one ESM signal the tool caught is `node_helper.js:2`'s dynamic `import('node-fetch')` inside a CJS file — a deliberate seam (node-fetch v3+ is ESM-only), not a second module system; it does not make import style genuinely contested in practice.

**Contested hotspots (author's choice):** the tooling's own prototype example of an intentional, repo-wide-contested-but-locally-consistent split is the CJS<->SDK dual resolver (`bin/lib/**` is CJS `module.exports`/`require`; `sdk/src/**` is ESM `export`/`import`): each half is internally consistent per-directory, contested only when compared repo-wide, and reviewers/planners match the directory's local style rather than picking a repo-wide winner. This repo's real (mild) analog is **file-name casing**, not import style: `node_helper.js` (snake_case) and `MMM-SPCOutlook.js` (PascalCase-with-hyphen) are both fixed by external contracts — MagicMirror²'s own `node_helper.js` filename requirement and its `MMM-<ModuleName>.js` module-file convention — not repo-authored choices, while `productRegistry.js`/`hazardTaxonomy.js` (camelCase) are the actual free choice this project makes for its own new files. `hazardTaxonomy.js`'s camelCase name is therefore the locally-consistent choice, matching its one true sibling, `productRegistry.js`, not a repo-wide vote.
