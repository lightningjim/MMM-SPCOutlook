# Phase 12: Proximity Backend Foundation - Pattern Map

**Mapped:** 2026-04-25
**Files analyzed:** 2 (both modified, no new files)
**Analogs found:** 2 / 2 (exact, in-repo, recently shipped)

## File Classification

| Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---------------|------|-----------|----------------|---------------|
| `MMM-SPCOutlook.js` | frontend module (config + IPC payload) | request-response (sendSocketNotification) | Phase 11 commit `88121c2` (same file, same lines, same pattern — `updateInterval` threading) | exact |
| `node_helper.js` | backend helper (socket handler + geometry compute) | request-response + cached-fetch | Phase 11 commit `c9d4b2b` / current `socketNotificationReceived` lines 30–47, plus `evaluatePolygons` lines 111–120 (sibling helper) | exact |

Both target files are **modify-in-place**. No new files are created in this phase.

## Pattern Assignments

### `MMM-SPCOutlook.js` — defaults + dual-payload threading

**Analog:** Phase 11 commit `88121c2` (same file, the exact pattern Phase 12 must mirror for `proximityWeighting`).

**Defaults pattern** — current state, lines 1–7:
```js
 Module.register("MMM-SPCOutlook", {
  defaults: {
    lat: 35.22,    // e.g. Norman OK
    lon: -97.44,
    extended: false,
    updateInterval: 60
  },
```
**Action:** Append `proximityWeighting: false` as a sibling (same indentation, trailing comma after `updateInterval: 60`).

**Dual-payload threading pattern** — current state, lines 9–16 (post-Phase-11):
```js
  start: function() {
    // Request data once the module starts
    Log.info(`Starting module: ${this.name}`);
    Log.info("SPC-Outlook: GET_SPC_DATA - " + this.config.lat + "," + this.config.lon + "," + this.config.extended);
    this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval });
    // Set an interval to update every hour (3600000 milliseconds)
    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval });}, this.config.updateInterval * 60000);
  },
```
**Pattern from Phase 11 commit `88121c2`** — what changed:
```diff
-    this.sendSocketNotification("GET_SPC_DATA", { lat: ..., extended: ... });
+    this.sendSocketNotification("GET_SPC_DATA", { lat: ..., extended: ..., updateInterval: this.config.updateInterval });
-    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: ..., extended: ... });}, ...);
+    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: ..., extended: ..., updateInterval: this.config.updateInterval });}, ...);
```
**Action for Phase 12:** Add `proximityWeighting: this.config.proximityWeighting` to **both** payload literals (line 13 `start` payload AND line 15 `setInterval` payload). Cross-file invariant — both sites must change together (per STATE.md's "v1.2 execution decisions").

---

### `node_helper.js` — socket destructure + cached field

**Analog:** Current `socketNotificationReceived` lines 30–47 (Phase 11 already shipped the exact destructure pattern; Phase 12 adds one more field to it).

**Cache init pattern** — current state, lines 21–27:
```js
  start: function() {
    Log.info("Starting node_helper for MMM-SPCOutlook...");
    this._geoJsonCache = new Map();  // keyed by URL string
    this._cachedLat = null;
    this._cachedLon = null;
    this._updateInterval = 60;
  },
```
**Action:** Add `this._proximityWeighting = false;` as a sibling field initializer (default-off per D-10/D-11).

**Destructure + persist pattern** — current state, lines 30–47:
```js
  socketNotificationReceived: async function(notification, payload) {
    if (notification === "GET_SPC_DATA") {
      const { lat, lon, extended, updateInterval } = payload;
      if (updateInterval === undefined) {
        if (!this._loggedIntervalFallback) {
          Log.info("MMM-SPCOutlook: GET_SPC_DATA missing updateInterval, defaulting to 60 minutes");
          this._loggedIntervalFallback = true;
        }
        this._updateInterval = 60;
      } else {
        this._updateInterval = updateInterval;
      }
      const md = await this.getMesoscaleDiscussion(lat, lon);
      const outlook = await this.getSpcOutlook(lat, lon, extended);
      this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
    }
  },
```
**Action:** Add `proximityWeighting` to the destructure list and persist on `this._proximityWeighting`. D-11 says "default false." D-14 leaves the one-shot info log to discretion — recommend matching the `_loggedIntervalFallback` shape for symmetry, gated on the first-true-arrival rather than first-undefined-arrival:
```js
const { lat, lon, extended, updateInterval, proximityWeighting } = payload;
// ... existing updateInterval handling ...
this._proximityWeighting = proximityWeighting === true;  // strict-true coerce; undefined/null → false
```

---

### `node_helper.js` — `computeProximity` helper placement

**Analog:** `evaluatePolygons` at lines 111–120 (sibling helper, same input shape, same comparator pattern).

**Sibling helper pattern** — current state, lines 104–120:
```js
  /**
   * Evaluate a list of polygon items against a location, returning the best comparator result.
   * @param items - array of { label, value, poly } from extractPolygons
   * @param loc - turf point representing the query location
   * @param comparator - object with { initial, comparator(best, value) } shape
   * @returns the accumulated best value after testing all polygons containing loc
   */
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
**Action (per D-13/D-14):** Insert `computeProximity(items, loc, currentValue, comparator)` immediately after `evaluatePolygons` (before line 122 `getMesoscaleDiscussion`). Keep the same JSDoc shape, the same `forEach` iteration over `items`, and route "higher tier" through `comparator.comparator(currentValue, value) !== currentValue` (or equivalent comparator-driven check) so the same helper works for both `catComparator` and `cigComparator`.

**Turf usage pattern** — `extractPolygons` at lines 89–103 already uses `turf.polygon` / `turf.multiPolygon`:
```js
if (f.geometry.type === "Polygon") { poly = turf.polygon(f.geometry.coordinates);}
else if (f.geometry.type === "MultiPolygon") { poly = turf.multiPolygon(f.geometry.coordinates);}
```
For the new `computeProximity`: per D-09, derive lines lazily — `turf.polygonToLine(poly)` returns a Feature or FeatureCollection of LineStrings. Use `turf.pointToLineDistance(loc, line, { units: "kilometers" })` against each derived line, take the min distance per polygon, compute `weight = max(0, 1 - d_km/40)`. D-07: pick max weight across all higher-tier polygons. Strict cap below 1: D-07 notes "the simplest implementation is to gate on `d_km > 0`" — recommended form.

---

### `node_helper.js` — categorical call sites (Day 1/2/3)

**Analog:** Day 2 cat block at lines 432–446 (representative; Day 1 lines 393–407 and Day 3 lines 470–484 are structurally identical).

**Categorical fetch+evaluate pattern** — current state, lines 432–446:
```js
{
  const fetchResult = await this.fetchGeoJsonCached(day2CatURL);
  if (fetchResult.stale) anyStale = true;
  if (fetchResult.data === null && fetchResult.cachedResult !== null) {
    day2RiskResult = fetchResult.cachedResult;
  } else if (fetchResult.data === null) {
    day2RiskResult = 0;
  } else {
    const gj = fetchResult.data;
    const poly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0);
    day2RiskResult = this.evaluatePolygons(poly, loc, catComparator);
    this._geoJsonCache.set(day2CatURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day2RiskResult, timestamp: Date.now() });
  }
  day2Risk = day2RiskResult === 0 ? "NONE" : valueToRisk[day2RiskResult];
}
```
**Action (per D-12, integration points):** When `this._proximityWeighting === true`, after `evaluatePolygons`, call `computeProximity(poly, loc, day2RiskResult, catComparator)` and capture into a `day2CatProximity` local. Also extend the `_geoJsonCache.set` call to additively store `polys: poly` (the field name is Claude's discretion — recommend `polys` for brevity) so subsequent calls (cache-hit branches) can re-derive without re-fetching. The cache-hit branches (`fetchResult.data === null && fetchResult.cachedResult !== null`) need to read `entry.polys` and call `computeProximity` against those when proximity is on. When `this._proximityWeighting === false`: do nothing — `polys` field is not written, helper is not called, default-off path stays zero-CPU (D-10).

`nextTier` for categorical: `valueToRisk[winningPolygonValue]` (line 16 map).

---

### `node_helper.js` — CIG call sites (Day 1/2 hazards via `fetchAndEvaluateHazard`, Day 3 standalone)

**Analog:** `fetchAndEvaluateHazard` at lines 251–300 (parameterized hazard fetch; called 6× for Day 1/2 tor/hail/wind).

**Per-hazard fetch+evaluate pattern** — current state, lines 277–298:
```js
if (risk > 0) {
  const cigFetch = await this.fetchGeoJsonCached(cigUrl);
  if (cigFetch.stale) stale = true;
  if (cigFetch.data === null && cigFetch.cachedResult !== null) {
    cig = cigFetch.cachedResult;
  } else if (cigFetch.data !== null) {
    const cigPolys = this.extractPolygons(
      cigFetch.data,
      label => cigToTier[label] || 0,
      (label, val) => val > 0
    );
    cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
    this._geoJsonCache.set(cigUrl, {
      mode: cigFetch.mode,
      etag: cigFetch.newEtag ?? null,
      hash: cigFetch.newHash ?? null,
      result: cig,
      timestamp: Date.now()
    });
  }
}

return { risk, cig, stale };
```
**Action:** Extend the return signature to `{ risk, cig, stale, cigProximity }` (or similar). When `this._proximityWeighting === true`, after `evaluatePolygons`, call `computeProximity(cigPolys, loc, cig, cigComparator)` and bind to `cigProximity`. Same cache-extension trick: store `polys: cigPolys` on the cache entry; the `cachedResult !== null` branch must re-read `entry.polys` and recompute proximity. `nextTier` for CIG: D-03 says use the CIG label string already produced — invert `cigToTier` (`{ 1: "CIG1", 2: "CIG2", 3: "CIG3" }`) at the top of the helper or inline.

**Day 3 CIG standalone pattern** — current state, lines 502–513:
```js
let day3Cig = 0;
if (day3ProbRisk > 0) {
  const fetchResult = await this.fetchGeoJsonCached(day3CigUrl);
  if (fetchResult.stale) anyStale = true;
  if (fetchResult.data === null && fetchResult.cachedResult !== null) {
    day3Cig = fetchResult.cachedResult;
  } else if (fetchResult.data !== null) {
    const cigPolys = this.extractPolygons(fetchResult.data, label => cigToTier[label] || 0, (label, val) => val > 0);
    day3Cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
    this._geoJsonCache.set(day3CigUrl, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day3Cig, timestamp: Date.now() });
  }
}
```
**Action:** Mirror the Day 1/2 CIG extension inline — emit a `day3CigProximity` local when proximity is on.

---

### `node_helper.js` — result subtree assembly

**Analog:** Result object literal at lines 626–658 (the `if (!extended)` branch — there's a parallel `extended` branch at lines 793+ that needs the same treatment).

**Result assembly pattern** — current state, lines 626–658:
```js
return {
  ...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {}),
  day1: {
   "risk": day1Risk,
   "text": valueToFullRisk[day1Risk],
   "color": riskToColor[day1Risk],
   "probRisk": day1ProbRisk,
   "torRisk": day1TorRisk,
   "torCig": day1TorCig,
   "hailRisk": day1HailRisk,
   "hailCig": day1HailCig,
   "windRisk": day1WindRisk,
   "windCig": day1WindCig
  },
  day2: { ... },
  day3: {
  "risk": day3Risk,
  ...
  "cig": day3Cig
  },
  ...
};
```
**Action (per D-04):** Append `proximity` as a sibling key inside each `dayN` literal, but **only when at least one hazard resolves non-null** for that day. Conditional-spread pattern is already established in this same return statement (`...(anyStale ? { _stale: true, ... } : {})`). Apply the same shape:
```js
day1: {
  "risk": day1Risk,
  // ... existing fields ...
  ...buildDay1Proximity(day1CatProximity, day1TorCigProximity, day1HailCigProximity, day1WindCigProximity)
}
```
Where `buildDay1Proximity` returns either `{}` (omit subtree entirely — D-04) or `{ proximity: { categorical?, torCig?, hailCig?, windCig? } }` with only the resolved hazards present (no `: null` placeholders — D-04 "no spurious subtree entries").

**Both return branches must be updated:** lines 626–678 (`!extended`) and lines 793+ (`extended`).

## Shared Patterns

### Cache entry additive extension
**Source:** Cache writers across `node_helper.js` (lines 268–274, 289–295, 404, 443, 481, 499, 511, 537+)
**Apply to:** All cache `.set` calls touched by proximity (categorical Day 1/2/3, CIG Day 1/2 via `fetchAndEvaluateHazard`, Day 3 CIG)
**Pattern:** Existing entries already extended additively (PERF-01/02 added `mode`/`etag`/`hash` over time without breaking older readers). Phase 12 adds two optional fields:
```js
this._geoJsonCache.set(url, {
  mode: fetchResult.mode,
  etag: fetchResult.newEtag ?? null,
  hash: fetchResult.newHash ?? null,
  result: <scalar>,
  timestamp: Date.now(),
  // Phase 12 additive fields — only written when this._proximityWeighting === true:
  ...(this._proximityWeighting ? { polys: <items> } : {})
});
```
**Constraint (D-10):** When `proximityWeighting === false`, `polys` is never written — default-off CPU/memory cost stays zero. Readers must tolerate `entry.polys === undefined`.

### Comparator pass-through
**Source:** `catComparator` (lines 329–332), `percComparator` (line 334), `cigComparator` (lines 337–340) all defined inside `getSpcOutlook`
**Apply to:** Every `computeProximity` invocation
**Pattern:** Pass the same comparator object that `evaluatePolygons` consumed at the same call site — `catComparator` for categorical layers, `cigComparator` for CIG layers. D-13 dictates the comparator drives the "higher tier" check inside `computeProximity` so the helper stays uniform across categorical and CIG.

### Phase 11 dual-site threading invariant
**Source:** Phase 11 commits `88121c2` (frontend) + Phase 11 backend destructure (current `node_helper.js` lines 32–41)
**Apply to:** `MMM-SPCOutlook.js` lines 13 + 15 (both payload literals) AND `node_helper.js` line 32 (destructure list)
**Pattern:** Per STATE.md: "Cross-file invariant — both sites must change together to close the contract." Phase 12's `proximityWeighting` follows the identical 3-edit shape Phase 11 used for `updateInterval`.

## No Analog Found

None. Every Phase 12 change has a direct in-repo analog — most are <2 weeks old (Phase 11). The planner should not need RESEARCH.md fallback patterns.

## Metadata

**Analog search scope:** `node_helper.js`, `MMM-SPCOutlook.js`, `git log -p -- MMM-SPCOutlook.js node_helper.js` for Phase 11 commits
**Files scanned:** 2 source files + 3 git commits (`c9d4b2b`, `88121c2`, `fd5458e`)
**Pattern extraction date:** 2026-04-25
