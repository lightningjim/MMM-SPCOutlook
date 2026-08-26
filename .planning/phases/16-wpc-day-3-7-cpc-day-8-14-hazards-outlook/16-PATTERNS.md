# Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook - Pattern Map

**Mapped:** 2026-08-26
**Files analyzed:** 3 (all existing files receive edits — no new files are created; this is a
vanilla-JS, no-build-step module where a "new product" is new exported symbols inside the three
existing files, not new files)
**Analogs found:** 3 / 3 (every planned addition has a same-file or cross-file analog to copy from)

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `productRegistry.js` — new `hazardsOutlookLayers`/`hazardsExcludedLabels`/`hazardsDroughtLabels`/`hazardsOrder`/`hazardsDisplayColor` constants + `PRODUCT_REGISTRY.hazardsOutlook` row + `dayRangeOf` sibling validator | config (registry row) | CRUD (static descriptor, no data flow of its own) | `PRODUCT_REGISTRY.excessiveRain`/`.winterImpact` (`arcgis-day-layers` shape) for the row skeleton; `PRODUCT_REGISTRY.spcMD`/`.mpd` (`kml-advisory` shape) for "what a row looks like when it is NOT day-layer shaped"; `daySpanOf` for the load-time-validation idiom | exact (row skeleton) + role-match (validator) |
| `node_helper.js` — new `_runArcGisHazardWindowProduct(row, loc, todayUtcMs, productToggles)` sibling runner | controller/service (backend fetch-evaluate-assemble orchestrator) | request-response, batch (6-layer fetch, per-poll collect-all evaluate + bucket) | `_runArcGisDayProduct` (`node_helper.js:213-307`) — structural template, **NOT literal cache-write template** (see Shared Patterns note below); `_runKmlAdvisoryRow` (`node_helper.js:505-588`) — closest analog for "runner returns a LIST, not a single tier" | role-match (structure), explicit-deviation (cache contract) |
| `node_helper.js` — new `evaluatePolygonsCollectAll(items, loc)` sibling | utility (geometry evaluation) | transform | `evaluatePolygons` (`node_helper.js:1042-1051`) | exact (same input contract, different reduce) |
| `node_helper.js` — new `dayOffset`/`todayUtcMs`/`isFullNominalWindow`/`bucketPrecipitationFeature`/`bucketWindowFeature` date-bucketing helpers | utility (transform) | transform | No direct analog exists in this codebase (first date-bucketing logic backend-side) — nearest structural precedent is `daySpanOf`'s "make the invalid state unrepresentable" instinct and RESEARCH.md's fully-specified implementation (see RESEARCH.md "Date Bucketing Algorithm") | no analog (see "No Analog Found") |
| `node_helper.js` — dispatch branch inside `getSpcOutlook` (`row.kind === "arcgis-hazard-window"`) + freshness write site (`maxDataAgeHours` vs `idp_filedate`) | controller (dispatch) / middleware (freshness gate) | request-response | Existing `eroResult`/`wssiResult` call sites (`node_helper.js:2186-2202`) for dispatch shape; `_noteStaleEntry`/`_oldestStaleAt` write sites (`node_helper.js:1329-1335`, `:2224-2227`) for the freshness plumbing, with D-15's deliberate one-line omission | role-match |
| `MMM-SPCOutlook.js` — `defaults:` block gains `showHazardsOutlook: false`, `showDrought: false` | config | CRUD | Existing `showExcessiveRain`/`showWinterImpact`/`showMPD` entries (`MMM-SPCOutlook.js:8-10`) | exact |
| `MMM-SPCOutlook.js` — `buildRequestPayload`'s `products:` object gains `showHazardsOutlook`/`showDrought` | config (request builder) | request-response | `MMM-SPCOutlook.js:49-54` | exact |
| `MMM-SPCOutlook.js` — new `hazardsOutlookHasAnyDay(block)` / `hazardsOutlookHasWindowEntries(block)` predicates + two new terms in the `getDom` no-risk short-circuit | component (render-gate predicate) | transform | `dayRiskCount`/`blockHasRisk` (`MMM-SPCOutlook.js:225-238`) for predicate shape; the ERO/WSSI/advisory terms at `:293`/`:299`/`:311` for the gate-term shape | role-match |
| `MMM-SPCOutlook.js` — new day-grid renderer (`day3`..`day14`, `hazards` array) | component (DOM string-concat renderer) | transform | `renderDayBlock` (`MMM-SPCOutlook.js:427-437`) — does not fit the nested shape, but is the closest same-role precedent for "iterate a day span read off the block's own keys, escape, colorize" | role-match (shape differs, discipline transfers) |
| `MMM-SPCOutlook.js` — new window-band renderer (below day rows, sorted by span start) | component (DOM string-concat renderer) | transform | The advisory band loop (`MMM-SPCOutlook.js:350-363`) — closest same-role precedent for "iterate an array of entries, escape each field, one `<span>` per entry, one color" | role-match |
| `scripts/probe-payload-resilience.js` + `scripts/probe-lib/module-stubs.js` — new hazards-outlook scenarios (synthetic Precipitation fixture, day-offset-drift-on-cache-hit mutation, zero-feature layers, `idp_filedate` per-layer staleness, D-09/D-10 filtering) | test | transform/event-driven | `ero-rejected-body-serves-last-known-good` (`scripts/probe-payload-resilience.js:1450-1505`) — cache-hit scenario, **flagged as the WRONG invariant to copy verbatim** (see below); `eroHttpRoutes`/`advisoryRoutes` (`:680-690`, `:445-461`) for route-list-building shape | role-match (structure), explicit-deviation (assertion) |

## Pattern Assignments

### `productRegistry.js` — new `hazardsOutlook` row (config, static)

**Analog 1 — row skeleton:** `PRODUCT_REGISTRY.excessiveRain` / `.winterImpact` (`productRegistry.js:126-191`)

**Row shape to copy** (`productRegistry.js:126-153`, `excessiveRain`):
```javascript
excessiveRain: {
  id: "excessiveRain",
  kind: "arcgis-day-layers",
  configFlag: "showExcessiveRain",
  baseUrl: ERO_BASE_URL,
  dayLayers: eroDayLayers,
  days: daySpanOf(eroDayLayers),           // derived, never restated
  buildUrl: (day) => buildArcGisQuery(ERO_BASE_URL, eroDayLayers[day]),
  toValue: (label, f) => eroDnToValue[f.properties.dn] || 0,
  includesFeat: (label, val) => val > 0,
  valueToTier: eroValueToTier,
  tierToText: eroTierToText,
  tierToColor: eroTierToColor,
  validTimeField: "valid_time"
}
```
Copy: `id`/`kind`/`configFlag`/`baseUrl` fields, the "derived, never restated" comment style
attached to any computed field (`dayRangeOf(...)` plays `daySpanOf`'s role here), and the
`toValue`/`includesFeat` closure-over-module-constants idiom (arrow functions, not methods, so
destructuring the row still works — the module's own comment at `productRegistry.js:135-136`
states this explicitly).

**Palette citation pattern (D-08 precedent)** (`productRegistry.js:186-190`, `winterImpact`):
```javascript
// D-08: cite the palette's provenance in the row rather than leaving it
// uncited (14-REVIEW.md IN-01's complaint about ERO's palette).
// wssiTierToColor's hex values were read from this endpoint's
// drawingInfo.renderer.uniqueValueInfos.
paletteSource: "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/1?f=json"
```
Copy this exact citation shape for the hazards row's `displayColor` map — RESEARCH.md's Colors
table gives the live `drawingInfo.renderer` URL per layer to cite (`.../MapServer/{layerId}?f=json`,
six URLs, one per layer — or one representative URL with a comment noting all six were fetched
this session). Do **not** repeat IN-01's mistake of an uncited palette.

**Analog 2 — a row that is NOT day-layer shaped:** `PRODUCT_REGISTRY.spcMD` / `.mpd` (`productRegistry.js:196-238`)

```javascript
spcMD: {
  id: "spcMD",
  kind: "kml-advisory",
  configFlag: "showSPCMD",
  allowedHost: "www.spc.noaa.gov",
  discovery: "spc-active-index",
  discoveryUrl: "https://www.spc.noaa.gov/products/md/ActiveMD.kmz",
  toEntry: (feature, ctx) => { ... }
}
```
This is the precedent for adding a **third** `kind` string (`"arcgis-hazard-window"` per
RESEARCH.md's recommendation) beside `"arcgis-day-layers"` and `"kml-advisory"` — Phase 15 already
established that a row's `kind` string is what a dispatcher switches on, and that a row carrying a
different shape (no `dayLayers`, no `tierToColor`; instead `discovery`/`toEntry`) is normal, not a
special case requiring a parallel registry.

**`daySpanOf`'s load-time validation idiom to copy, NOT reuse** (`productRegistry.js:34-74`):
```javascript
function daySpanOf(dayLayers) {
  if (!dayLayers || typeof dayLayers !== "object") {
    throw new Error("productRegistry: dayLayers must be an object, got " + JSON.stringify(dayLayers));
  }
  const days = Object.keys(dayLayers).map(Number).sort((a, b) => a - b);
  if (days.length === 0) {
    throw new Error("productRegistry: dayLayers must name at least one day");
  }
  for (let i = 0; i < days.length; i++) {
    if (days[i] !== i + 1) {
      throw new Error("productRegistry: dayLayers must be a contiguous 1..N map, got " + JSON.stringify(days));
    }
    // ...
  }
  return days.length;
}
```
`daySpanOf` itself asserts a **contiguous `1..N`** map — `day3..day14` is a `[3,14]` *range*, not
that shape, so it cannot validate this row (RESEARCH.md is explicit on this). Copy the **instinct**
("make the invalid state unrepresentable, throw at load time so a bad row fails on the first run,
not as a permanent silent degrade in the field" — see the extensive comment at `productRegistry.js:34-52`
explaining WHY this matters) into a new sibling, e.g.:
```javascript
function dayRangeOf([first, last]) {
  if (!(Number.isInteger(first) && Number.isInteger(last) && last > first)) {
    throw new Error("productRegistry: dayRangeOf requires [first, last] integers with last > first, got " +
                    JSON.stringify([first, last]));
  }
  return [first, last];
}
```

---

### `node_helper.js` — new `_runArcGisHazardWindowProduct(row, loc, todayUtcMs, productToggles)` sibling runner

**Analog:** `_runArcGisDayProduct` (`node_helper.js:213-307`)

**Structure to copy** (per-day/per-layer try/catch, staleness rule, convert-once discipline):
```javascript
async _runArcGisDayProduct(row, loc, comparator, productToggles) {
  const days = row.days;
  // ... seed tiers/validTimes to NONE/null for every day ...
  let anyStale = false;
  if (productToggles[row.configFlag]) {
    for (let d = 1; d <= days; d++) {
      try {
        const url = row.buildUrl(d);
        const fetchResult = await this.fetchGeoJsonCached(url);
        if (fetchResult.stale || fetchResult.failed) anyStale = true;
        let value = 0;
        let validTime = null;
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          value = fetchResult.cachedResult.value;
          validTime = fetchResult.cachedResult.validTime;
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, row.toValue, row.includesFeat, url);
          value = this.evaluatePolygons(polys, loc, comparator);
          validTime = value > 0 ? this._validTimeOfWinner(polys, loc, value, row.validTimeField) : null;
          this._geoJsonCache.set(url, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null,
            hash: fetchResult.newHash ?? null, result: { value, validTime }, timestamp: Date.now() });
        }
        // Convert exactly once, after the branch closes.
        tiers[d] = row.valueToTier[value] || "NONE";
      } catch (err) {
        // CR-01: a contained throw is a degrade, not a clean read.
        anyStale = true;
        Log.error(`MMM-SPCOutlook ${row.id} day ${d}: fetch/parse/evaluate failed, leaving day at no risk`, err);
      }
    }
  }
  return { payload, anyStale };
}
```
Transferable, unchanged: the per-item try/catch, "a contained throw is a degrade" comment and
`anyStale = true` placement, the `fetchResult.stale || fetchResult.failed` fold, and "convert
exactly once, after the branch closes" (RESEARCH.md's Don't-Hand-Roll table and the day-offset
pitfall both depend on this discipline being preserved).

**NOT transferable — the day→URL loop.** This product loops per **layer** (six fixed URLs), not
per **day** — `row.buildUrl(d)` has no equivalent; instead loop `row.layers`, call
`row.buildUrl(layer.id)` (or an equivalent single-arg `buildArcGisQuery(row.baseUrl, layer.id)`
call) once per layer, and derive `todayUtcMs` once per poll (not per layer) before the loop starts.

**⚠ CACHE-WRITE BLOCK MUST NOT BE COPIED VERBATIM.** The line
```javascript
this._geoJsonCache.set(url, { ..., result: { value, validTime }, ... });
```
at `node_helper.js:267-273` caches a **final, already-bucketed** result — safe for ERO/WSSI because
their day key is a property of the URL (`dayLayers[1]` is always "Day 1"), not of the clock. This
product's day key (`day3`..`day14`) is derived by comparing a **static** feature date against
**today's live UTC date** — a value that advances every 24h independent of whether WPC's bytes
changed. RESEARCH.md's "Freshness Integration" section names this the single highest-value finding
of the research round: **cache only the pre-bucketing extracted result** (`hits`, or
`fetchResult.data`/`cachedResult`), and **recompute day-bucketing on every poll — cache hit or
miss — against that poll's own `todayUtcMs()`**, never persist a day-keyed final value. Treat the
excerpt above as "copy the structure, invert the cache contract," not a template to paste.

**Analog for "returns a LIST, not a per-day tier":** `_runKmlAdvisoryRow` (`node_helper.js:505-588`)
```javascript
async _runKmlAdvisoryRow(row, lat, lon, productToggles) {
  if (!productToggles[row.configFlag]) { return { entries: [], anyStale: false }; }
  // ... discover candidates, cap at ADVISORY_MAX_CANDIDATES ...
  const entries = [];
  for (const url of candidates) {
    try {
      // ... fetch, decode, checkInPolygon, toEntry ...
      if (entry === null) { anyStale = true; continue; }   // CR-03: covers but unnamed = degrade
      entries.push(entry);
    } catch (err) {
      Log.error(`MMM-SPCOutlook: skipping unreadable ${row.id} ${url}`, err);
      anyStale = true;                                     // CR-02/D-04: per-item containment
    }
  }
  return { entries, anyStale };
}
```
Copy the per-item containment discipline ("one bad feature/candidate must never discard its
siblings" — CR-02) and the `{ list, anyStale }` return shape, which is closer to D-02's per-day
`hazards` array than `_runArcGisDayProduct`'s single-tier-per-day payload is. Note the toggle-off
early return (`if (!productToggles[row.configFlag]) return { ..., anyStale: false }`) — the new
runner's toggle-off path should mirror this exactly.

---

### `node_helper.js` — new `evaluatePolygonsCollectAll(items, loc)`

**Analog:** `evaluatePolygons` (`node_helper.js:1042-1051`)
```javascript
evaluatePolygons(items, loc, comparator){
  let best = comparator.initial;
  items.forEach(({label, value, poly}) => {
    const result = turf.booleanPointInPolygon(loc, poly);
    if(result){
      best = comparator.comparator(best, value);
    }
  });
  return best;
},
```
D-02's consequence: this product has no severity ladder, so the max-reduce is meaningless. Add
`evaluatePolygonsCollectAll` **beside** `evaluatePolygons` (never replacing it — every other
product's comparator usage is unaffected), returning the full containing set instead of one
winner. RESEARCH.md gives the full implementation, including a new per-item try/catch around
`turf.booleanPointInPolygon` that `evaluatePolygons` itself never needed (because
`evaluatePolygons`'s single-value reduce meant an uncaught throw there would have discarded the
whole product anyway; collect-all must not let one throw discard sibling hazards for the same
day — the same CR-02 per-item-containment lesson `_runKmlAdvisoryRow` already applies, extended
one level deeper):
```javascript
evaluatePolygonsCollectAll(items, loc) {
  const hits = [];
  items.forEach((item) => {
    let contains;
    try {
      contains = turf.booleanPointInPolygon(loc, item.poly);
    } catch (err) {
      Log.error("MMM-SPCOutlook evaluatePolygonsCollectAll: containment check failed for " +
                (item.label || "unlabeled feature"), err);
      this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
      return;
    }
    if (contains) hits.push(item);
  });
  return hits;
}
```
`extractPolygons` (`node_helper.js:997-1034`) is reused **unmodified** — it is comparator-agnostic;
only the reduce step (`evaluatePolygons`) needs a sibling. `extractPolygons`'s `toValue` contract
must be honored by the new registry row exactly as ERO/WSSI already do:

**Pitfall 8 idiom to copy** (`node_helper.js:1005`, hardcoded uppercase `LABEL`):
```javascript
const label = f.properties.LABEL || "";   // always "" for this service — SPC-only field
const value = toValue(label, f);
```
The row's `toValue` must read `f.properties.label` (lowercase) directly off the `f` argument,
ignoring the always-`""` `label` positional parameter — the exact idiom `eroDnToValue`/
`wssiRawToValue` already use to route around this same trap (`productRegistry.js:141`, `:167-171`).

---

### `node_helper.js` — date-bucketing helpers (no direct analog; new logic)

No existing function in this codebase buckets by date — `daySpanOf` validates a static map,
`_validTimeOfWinner` reads a validity field off the winning polygon, neither buckets by a live
clock. RESEARCH.md's "Date Bucketing Algorithm" section is the authoritative reference
implementation (verified against this session's live data — every observed `start_date`/`end_date`
is exact UTC midnight). Key structural rule carried from `daySpanOf`'s instinct: **use only
`Date.UTC()`/`getUTC*()`, never the local-time `Date` constructor/getters** — confirmed by direct
code read that `node_helper.js` has zero `moment`/date-library `require` (moment is a frontend-only,
MagicMirror-core-bundled global, not available server-side).

---

### `node_helper.js` — dispatch + freshness write site

**Analog — dispatch shape:** the ERO/WSSI call sites inside `getSpcOutlook` (`node_helper.js:2186-2202`)
```javascript
const eroResult = await this._runArcGisDayProduct(
  PRODUCT_REGISTRY.excessiveRain, loc, catComparator, productToggles
);
const eroPayload = eroResult.payload;
if (eroResult.anyStale) anyStale = true;
```
Add a parallel call for `PRODUCT_REGISTRY.hazardsOutlook` using the new runner, folding
`hazardsResult.anyStale` into the same `anyStale` local the same way. RESEARCH.md recommends a
plain `if (row.kind === "arcgis-hazard-window")` branch or a direct named call (this row is
singular, unlike the `kml-advisory` loop at `:2212-2217` which iterates every row of that kind) —
either matches the codebase's "no `this`-bound polymorphism, straight-line dispatch" style
(CONVENTIONS.md).

**Analog — freshness write-site asymmetry (D-15):** `_noteStaleEntry`/`_oldestStaleAt`
(`node_helper.js:1329-1335`, write site `:2224-2227`)
```javascript
_noteStaleEntry(entry) {
  if (!entry || typeof entry.timestamp !== "number") return;
  if (this._oldestStaleAt === null || this._oldestStaleAt === undefined ||
      entry.timestamp < this._oldestStaleAt) {
    this._oldestStaleAt = entry.timestamp;
  }
},
// ...
return {
  ...(anyStale ? { _stale: true, _staleAsOf: this._oldestStaleAt } : {}),
  // ...
};
```
D-13/D-14/D-15's new data-age check must set `anyStale = true` **without** calling
`_noteStaleEntry(...)` — the asymmetry RESEARCH.md calls "the single most comment-worthy line in
the phase." RESEARCH.md's exact recommended write site (inside the new runner's per-layer loop,
after a successful fetch, reading `hits[0].feature.properties.idp_filedate` — confirmed live that
`idp_filedate` is uniform within one layer's features but NOT shared across the row's six layers):
```javascript
if (hits.length > 0) {
  const filedate = hits[0].feature.properties.idp_filedate;
  if (typeof filedate === "number" &&
      (Date.now() - filedate) > row.maxDataAgeHours * 60 * 60 * 1000) {
    anyStale = true;
    // Deliberately NOT this._noteStaleEntry(...) — D-15's asymmetry. A data-age trip
    // must reach the ⚠ badge without dragging the "N minutes ago" figure, which
    // describes fetch/network recency (Phase 14 D-04's global-only rule), not WPC's
    // own publish age.
  }
}
```
A zero-feature layer skips this check entirely (no `idp_filedate` to read) — same precedent
WSSI-03 already established for a legitimately empty off-season layer.

---

### `MMM-SPCOutlook.js` — `defaults:` / `buildRequestPayload` additions

**Analog:** `MMM-SPCOutlook.js:8-10` (defaults) and `:49-54` (payload)
```javascript
showExcessiveRain: false,   // WPC Excessive Rainfall Outlook toggle; every new product flag defaults to false
showWinterImpact: false,    // WPC WSSI Overall Impact toggle; every new product flag defaults to false
showMPD: false,             // WPC Mesoscale Precipitation Discussion toggle; every new product flag defaults to false
```
and
```javascript
products: {
  showExcessiveRain: this.config.showExcessiveRain,
  showWinterImpact: this.config.showWinterImpact,
  showMPD: this.config.showMPD,
  showSPCMD: this.config.showSPCMD
}
```
Add `showHazardsOutlook: false` (CFG-01: new product flags default false) and
`showDrought: false` (D-10) to both blocks, each with a one-line comment in the existing house
style. `showDrought` is **not** a `kml-advisory` row's `configFlag` in the `ADVISORY_SOURCES` sense
(`:214`) — it gates labels within an already-fetched product, not a fetch — so it needs its own
explicit read wherever `productToggles.showDrought` is consumed inside the new runner, matching
RESEARCH.md's `includesFeat` closure design (built at call time, not baked into the static row).

---

### `MMM-SPCOutlook.js` — no-risk gate predicates + two new gate terms

**Analog — predicate shape:** `dayRiskCount`/`blockHasRisk` (`MMM-SPCOutlook.js:225-238`)
```javascript
const dayRiskCount = (block) => {
  if (!block || typeof block !== "object") return 0;
  return Object.keys(block).filter((k) => /^day\d+Risk$/.test(k)).length;
};
const blockHasRisk = (block) => {
  const days = dayRiskCount(block);
  for (let d = 1; d <= days; d++) {
    if (block[`day${d}Risk`] !== "NONE") return true;
  }
  return false;
};
```
This regex (`/^day\d+Risk$/`) does **not** match `day3`/`day14` keys (no `Risk` suffix on this
product's nested shape), so there is no silent cross-contamination risk — but also no free reuse.
Write two new predicates following the same "derive the span from the block's own keys, never a
literal" discipline WR-08 established:
- `hazardsOutlookHasAnyDay(block)` — true if any `day3`..`day14` entry's `hazards` array is non-empty
- `hazardsOutlookHasWindowEntries(block)` — true if the window band array is non-empty

**Analog — gate term shape:** the ERO/WSSI/advisory terms (`MMM-SPCOutlook.js:293`, `:299`, `:311`)
```javascript
!(this.config.showExcessiveRain && blockHasRisk(this.spcrisk.excessiveRain)) &&
!(this.config.showWinterImpact && blockHasRisk(this.spcrisk.winterImpact)) &&
// ...
!(enabledAdvisories().length > 0)
```
**Both new predicates must become independent terms** in the gate (`MMM-SPCOutlook.js:263-312`),
each gated on `this.config.showHazardsOutlook`:
```javascript
!(this.config.showHazardsOutlook && hazardsOutlookHasAnyDay(this.spcrisk.hazardsOutlook)) &&
!(this.config.showHazardsOutlook && hazardsOutlookHasWindowEntries(this.spcrisk.hazardsOutlook))
```
This is explicitly the same regression class that shipped in Phase 15 (the `getDom` no-risk gate
that made MPD invisible) — a location can be inside a window-band `Hazardous Heat` polygon with
every `day3`-`day14` hazard array empty, and the gate must not show "No Severe Weather Risk" in
that state. Two independently-renderable things means two independent `&&`-terms, not one
OR'd predicate that only checks one of them.

---

### `MMM-SPCOutlook.js` — day-grid renderer (`day3`..`day14`, `hazards[]`)

**Analog:** `renderDayBlock` (`MMM-SPCOutlook.js:427-437`)
```javascript
const renderDayBlock = (label, block) => {
  const days = dayRiskCount(block);
  for (let d = 1; d <= days; d++) {
    if (block["day" + d + "Risk"] !== "NONE") {
      wrapper.innerHTML += label + " (Day " + d + "): <span style=\"color:#" +
        block["day" + d + "Color"] + "\">" +
        block["day" + d + "Text"] + "</span><br/>";
    }
  }
};
```
Does not fit as-is (`day{N}Risk`/`Text`/`Color` flat keys vs. this product's `day3: { date,
hazards: [...] }` nesting), but the discipline transfers directly: iterate `day3`..`day14` (a
fixed range this time, not a derived span — carry `[3,14]` as a constant local to the renderer,
matching the row's `dayRangeTotal`), read each day's `hazards` array off the payload (empty →
render nothing for that day, "absence is silence" — ERO-03, 15 D-09), and for each hazard resolve
its display color/text from the payload's own per-entry fields rather than recomputing from a
frontend-side map (mirrors how `renderDayBlock` reads `block["day"+d+"Color"]` off the payload,
keeping color-resolution logic backend-side — D-01's "carry raw + resolved data into the payload"
precedent). D-08's exact wording, `Thu–Mon (D3–7): Hazardous Heat`, should be built from D-01's
per-day `date` field, not `dowToText(dow + N)` (Pitfall 9 — WPC's Day-N boundary drifts from SPC's).

---

### `MMM-SPCOutlook.js` — window band renderer

**Analog:** the advisory band loop (`MMM-SPCOutlook.js:350-363`)
```javascript
const allAdvisories = enabledAdvisories();
for (const entry of allAdvisories) {
  if (!entry || typeof entry !== "object") continue;
  let line = escapeHtml(entry.label);
  if (typeof entry.hazardType === "string" && entry.hazardType.length > 0) {
    line += " — " + escapeHtml(entry.hazardType);
  }
  wrapper.innerHTML += "<span style=\"color: #0059E0\">" + line + " in effect.</span><br/>"
}
```
Copy the shape (guard the entry, escape every rendered field, one `<span>` per entry, no cap/
truncation) but **not** the placement or wording: D-05 requires this in its **own labeled region,
below the day rows**, not folded into this advisory band — "in effect" wording does not apply to a
5-to-7-day forecast window the way it does to a 1-6h MD/MPD nowcast. D-07's "one band, entries
sorted by span start, each self-labeling its span" governs ordering; D-06 requires each entry's
label to carry its **own observed span** (`start_date`/`end_date`), never the layer's nominal
window.

---

### `escapeHtml` — load-bearing for this phase

**Source:** `MMM-SPCOutlook.js:205-207`
```javascript
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]
));
```
D-11 makes this load-bearing rather than incidental: an unmapped label is remote text rendered
verbatim in the default style by design, which is exactly the case `escapeHtml` exists for. Every
hazard label rendered in **both** the new day-row and window-band renderers must pass through
`escapeHtml`, not just the advisory band's `label`/`hazardType` — this is the phase's clearest
security-relevant surface (WR-08/WR-12's established pattern, extended one more source).

---

### `scripts/probe-payload-resilience.js` — cache-hit scenario, flagged deviation

**Analog:** `ero-rejected-body-serves-last-known-good` (`scripts/probe-payload-resilience.js:1450-1505`)
```javascript
installHttp(helper, eroHttpRoutes(() => httpResponse({ body: ERO_SLGT_BODY, etag: "ero-v1" })));
const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
// ...
installHttp(helper, eroHttpRoutes(() => httpResponse({ body: ARCGIS_ERROR_BODY, etag: "ero-v2" })));
const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
if (out.excessiveRain.day1Risk !== "SLGT") {
  throw new Error(`a WPC hiccup blanked an active tier: expected the cached SLGT, got ${out.excessiveRain.day1Risk}`);
}
const entry = helper._geoJsonCache.get(ERO_URLS[1]);
if (!entry || entry.result.value !== 2) {
  throw new Error(`the rejected body overwrote the cached reading: ${JSON.stringify(entry && entry.result)}`);
}
```
**This asserts byte-identical tier output across a cache hit — correct for ERO/WSSI, WRONG for
this product.** RESEARCH.md's headline finding: this product's day key is derived from comparing a
**static** feature date against **today's live clock**, so a cache hit that replays yesterday's
`day3`..`day14` assignment verbatim is a silent one-day misdating bug, not a resilience feature.
Copy the route-building and warm/degrade two-phase structure, but the assertion must be inverted:
a mutation-proof scenario should freeze the cache with a "yesterday's day-bucketing" fixture,
advance the simulated clock by 24h with no upstream change, and assert the **rendered day keys
shifted** — the opposite of what `ero-rejected-body-serves-last-known-good` proves. RESEARCH.md's
Freshness Integration section names this "Probe Suite Extension #3" and calls it the single
highest-value scenario this phase must add.

**Route-list-building analog to reuse as-is:** `eroHttpRoutes`/`advisoryRoutes`
(`scripts/probe-payload-resilience.js:680-690`, `:445-461`) — the "every other layer answers 200
with an empty collection so nothing outside the scenario's subject can set `anyStale`" discipline
transfers directly to a `hazardsOutlookRoutes(...)` helper covering all six layer URLs.

## Shared Patterns

### Per-item containment (CR-02 lesson, extended one level)
**Source:** `extractPolygons` (`node_helper.js:1018-1030`), `_runKmlAdvisoryRow`'s per-candidate
catch (`node_helper.js:578-584`), `checkInPolygon`'s per-feature catch (`node_helper.js:2373-2381`)
**Apply to:** the new `evaluatePolygonsCollectAll`, and the date-bucketing helpers' per-feature
malformed-date guard (`typeof props.start_date !== "number"` → skip, don't throw). With D-02
returning a set per day, this now applies **within** a single day's hazard array too — one bad
feature must not discard its siblings on the same day.

### "Contained throw is a degrade, not a clean read" (CR-01)
**Source:** `_runArcGisDayProduct`'s per-day catch (`node_helper.js:281-290`)
**Apply to:** the new per-layer loop inside `_runArcGisHazardWindowProduct` — a caught exception
sets `anyStale = true` independently of the `fetchResult.stale || fetchResult.failed` check,
because the throw can happen before that line ever runs.

### Absence is silence (ERO-03, 15 D-09)
**Source:** stated as a general rule in RESEARCH.md's "Established Patterns," exercised by
`extractPolygons`/`_runKmlAdvisoryRow` returning empty arrays rather than placeholder rows
**Apply to:** both the day rows (an empty `hazards` array renders nothing for that day) and the
window band (zero window-spanning features renders no band at all) — no "None" row either.

### Registry rows are pure static config — no `this`, no network, no `require` (15 D-02)
**Source:** `productRegistry.js:192-195` comment above `spcMD`
**Apply to:** the new `hazardsOutlook` row. `showDrought`'s toggle must be read where the closure
is **built** (inside the new runner, which has `productToggles`), never baked into the static row.

### Non-overridable `f=geojson` / host allowlist (Phase 14 D-09, DATA-01)
**Source:** `buildArcGisQuery` (`productRegistry.js:24-32`)
**Apply to:** the hazards row's six layer URLs — built exclusively via `buildArcGisQuery`, never
constructed inline at a second call site (Pitfall 11, cache-key drift).

### Error logging with `MMM-SPCOutlook` prefix
**Source:** every `Log.error(...)` call site cited above (e.g. `node_helper.js:289`, `:1027`,
`:452`)
**Apply to:** every new log line in the runner, the collect-all evaluator, and the date-bucketing
helpers — `Log.error("MMM-SPCOutlook <function>: <what happened>", err)`, matching house style.

## No Analog Found

| File/Symbol | Role | Data Flow | Reason |
|---|---|---|---|
| `todayUtcMs()` / `dayOffset()` / `isFullNominalWindow()` / `bucketPrecipitationFeature()` / `bucketWindowFeature()` (new, `node_helper.js`) | utility | transform | No date-bucketing-by-live-clock logic exists anywhere in this codebase today — every existing product's day key is a property of a URL, not of a comparison against `Date.now()`. RESEARCH.md's "Date Bucketing Algorithm" section is the reference implementation (fully specified, `Date.UTC`-only, no library); the planner should treat that section as the template rather than searching further for a codebase analog, since none exists. |

## Conventions

Convention derivation was skipped — the installed `gsd-tools.cjs` (legacy build at
`~/.claude/get-shit-done-legacy/bin/gsd-tools.cjs`) does not expose a `verify conventions --derive`
subcommand (`Available: plan-structure, phase-completeness, references, commits, artifacts,
key-links, schema-drift, codebase-drift`), and no `gsd-plugin` cache directory was found on this
machine to source a newer build from. Falling back to `.planning/codebase/CONVENTIONS.md`'s
already-authored prose (analyzed 2026-03-04) for house style, which this pattern map's excerpts
already follow: 2-space indentation, camelCase functions/variables, arrow-function closures over
module constants for registry rows, `Log.error("MMM-SPCOutlook <fn>: ...", err)` logging, no
custom error classes, try/catch containment at the smallest reasonable scope (per-feature/
per-candidate/per-layer, never per-payload). No CJS/ESM dual-resolver split exists in this
repository (single CJS module, no `sdk/`, no `bin/lib/`) — the "contested hotspot" pattern this
section normally documents does not apply here.

## Metadata

**Analog search scope:** `productRegistry.js` (full file, 243 lines), `node_helper.js` (targeted
reads: `:1-460`, `:490-590`, `:990-1090`, `:1295-1340`, `:2160-2240`, `:2345-2386`; full file is
2386 lines), `MMM-SPCOutlook.js` (full file, 462 lines), `scripts/probe-payload-resilience.js`
(targeted reads: scenario-name index, `:1447-1512`; full file is 3600+ lines)
**Files scanned:** 4 (3 source files read via CodeGraph + targeted Read, 1 probe script scanned
by scenario name + one representative scenario read in full)
**Pattern extraction date:** 2026-08-26
