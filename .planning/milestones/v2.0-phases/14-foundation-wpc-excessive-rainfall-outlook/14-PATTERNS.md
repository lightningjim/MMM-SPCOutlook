# Phase 14: Foundation & WPC Excessive Rainfall Outlook - Pattern Map

**Mapped:** 2026-08-17
**Files analyzed:** 3 (2 modified, 1 new)
**Analogs found:** 2 exact (self-file precedent) / 1 no-analog (new architecture)

All line numbers below were re-verified live against the current on-disk source during this mapping pass (not taken on faith from RESEARCH.md, though they match it).

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|--------------------|------|-----------|-----------------|----------------|
| `node_helper.js` (modified) | service (backend fetch/parse orchestrator invoked via socket notification) | request-response, wrapping per-product file/network fetch (conditional-GET) | itself — fire-weather Day 3-8 block (`node_helper.js:792-834`) + the `extended` fork (`node_helper.js:836-1130`) | exact (same file, same author, same idiom) |
| `MMM-SPCOutlook.js` (modified) | component (MagicMirror frontend module: config, socket send/receive, DOM render) | request-response (sends `GET_SPC_DATA`, receives `SPC_DATA_RESULT`, renders) | itself — `defaults:`/socket-send block (`MMM-SPCOutlook.js:2-17`) + the `fireWeather` render block (`MMM-SPCOutlook.js:172-192`) + the day1-3 `!= "NONE"` gate (`MMM-SPCOutlook.js:135`) | exact (same file, same idiom) |
| `productRegistry.js` (new) | config/registry (product-descriptor table: id, config flag, URL builder, parser, label map) | transform (pure data/function definitions; no I/O of its own — `node_helper.js` calls into it) | none — no registry-table pattern exists yet; closest *content* precedent is the scattered static URL constants + label maps (`node_helper.js:456-481`, `riskToValue` at `:445-447`, `dnToFireValue` at `:736`), which D-08 explicitly forbids migrating wholesale | no analog (see below) |

## Pattern Assignments

### `node_helper.js` (service, request-response) — modifications

**Analog:** itself (existing idioms in the same file)

**Imports pattern** (lines 1-12, unchanged — new code adds no new imports; `productRegistry.js` is required alongside these):
```javascript
const NodeHelper = require("node_helper");
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
const turf = require("@turf/turf"); // or another geometry librarykmz-
const Log = require("logger");
const crypto = require("crypto");
const ZIP = require("adm-zip");
const { DOMParser } = require("@xmldom/xmldom");
const KMLtoGJ = require("@tmcw/togeojson");
const xpath    = require("xpath");
const select = xpath.useNamespaces({
  k: "http://www.opengis.net/kml/2.2"
});
```
Add `const PRODUCT_REGISTRY = require("./productRegistry");` in this same block (top of file, alongside the other `require`s) — matches "no barrel files, single responsibility per file" from CONVENTIONS.md.

**Socket-receive / defensive defaulting pattern** (lines 31-49, verbatim — the D-06/A3 analog):
```javascript
socketNotificationReceived: async function(notification, payload) {
    if (notification === "GET_SPC_DATA") {
      const { lat, lon, extended, updateInterval, proximityWeighting } = payload;
      if (updateInterval === undefined) {
        if (!this._loggedIntervalFallback) {
          Log.info("MMM-SPCOutlook: GET_SPC_DATA missing updateInterval, defaulting to 60 minutes");
          this._loggedIntervalFallback = true;
        }
        this._updateInterval = 60;
      } else {
        this._updateInterval = updateInterval;
      }
      this._proximityWeighting = proximityWeighting === true;
      const md = await this.getMesoscaleDiscussion(lat, lon);
      const outlook = await this.getSpcOutlook(lat, lon, extended);
      // Send the results back to your front-end module
      this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
    }
  },
```
This is the exact precedent for D-06/D-07's `products` destructuring: `const { lat, lon, extended, updateInterval, proximityWeighting, products } = payload;` followed by `this._products = { showExcessiveRain: products?.showExcessiveRain === true };` — copy the `proximityWeighting === true` coercion idiom verbatim (V5 input-validation control per RESEARCH.md's Security Domain section), one line per registry-row flag.

**"Declare defaults, conditionally fetch, always return" skeleton** — the exact precedent CFG-02/D-01/D-05 must follow, already proven twice in this file:

*Fire-weather Day 3-8 (extended-gated fetch, `node_helper.js:792-834`):*
```javascript
// Fire Weather Days 3-8 (extended only)
let day3FireRisk = 0, day4FireRisk = 0, day5FireRisk = 0,
    day6FireRisk = 0, day7FireRisk = 0, day8FireRisk = 0;
if (extended) {
  const dayFireRisks = [null, null, null]; // placeholders for index alignment (0,1,2 unused)
  for (let d = 3; d <= 8; d++) {
    let dayRisk = 0;
    const windRHUrl = `https://www.spc.noaa.gov/products/exper/fire_wx/day${d}fw_windrhcat.lyr.geojson`;
    const dryTUrl = `https://www.spc.noaa.gov/products/exper/fire_wx/day${d}fw_drytcat.lyr.geojson`;
    {
      const fetchResult = await this.fetchGeoJsonCached(windRHUrl);
      if (fetchResult.stale) anyStale = true;
      if (fetchResult.data === null && fetchResult.cachedResult !== null) {
        dayRisk = Math.max(dayRisk, fetchResult.cachedResult);
      } else if (fetchResult.data !== null) {
        const polys = this.extractPolygons(fetchResult.data, (label, f) => dnToFireValue[f.properties.DN] || 0, (label, val) => val > 0);
        const val = this.evaluatePolygons(polys, loc, fireComparator);
        dayRisk = Math.max(dayRisk, val);
        this._geoJsonCache.set(windRHUrl, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: Date.now() });
      }
    }
    // ...dryTUrl block, identical shape...
    dayFireRisks.push(dayRisk);
  }
  day3FireRisk = dayFireRisks[3]; // ...through day8FireRisk
}
```
This is the direct template for `excessiveRain`: declare `day1..day5` locals defaulted to `0`/`"NONE"` *before* any `if` gate, wrap only the fetch calls in `if (this._products.showExcessiveRain) { ... }`, and compute tier strings unconditionally afterward — exactly mirroring D-05's "one payload shape regardless of configuration."

*The `extended` fork ITSELF is the anti-pattern being removed (`node_helper.js:836-906` vs `node_helper.js:1021-1124`)* — read both return objects side by side; the `!extended` branch (838-905) omits `day48Risk`/`day4`-`day8` entirely and hardcodes `fireWeather.day3Risk` through `day8Risk` to `0`/`"None"` inline, while the `extended` branch (1021-1124) has the full keys. CFG-02/D-01 require collapsing these into one `return` reached unconditionally, with `day4`-`day8` locals declared/defaulted above the `if (extended) { ...fetch blocks... }` gate (RESEARCH.md Pattern 2 has the full before/after — do not re-derive it, the shape is already fully specified there and consistent with what's on disk).

**ETag/cache fetch pattern — reused unmodified** (`node_helper.js:260-320`):
```javascript
async fetchGeoJsonCached(url) {
  const entry = this._geoJsonCache.get(url);
  const headers = {};
  if (entry && entry.mode === 'etag' && entry.etag) {
    headers['If-None-Match'] = entry.etag;
  }
  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    if (entry && this._isWithinStaleWindow(entry.timestamp, this._updateInterval)) {
      Log.info('MMM-SPCOutlook: stale fallback for ' + url);
      return { data: null, cachedResult: entry.result, stale: true };
    }
    return { data: null, cachedResult: null, stale: false };
  }
  if (res.status === 304) {
    Log.info('MMM-SPCOutlook: cache hit (ETag) for ' + url);
    return { data: null, cachedResult: entry.result, stale: false };
  }
  // ...non-ok handling, then HTTP 200: ETag branch (skip hash) or SHA256-hash fallback branch...
}
```
RESEARCH.md confirms ERO's endpoint emits a stable ETag, so ERO's new fetch calls (`fetchGeoJsonCached(buildArcGisQuery(...))`) will exercise the ETag branch (lines 299-308), not the SHA256 fallback (309-318). Call this exactly like every other `fetchGeoJsonCached` call site — no modification to the function itself.

**Parser callback pattern — the D-07 template, one field/map swap** (`node_helper.js:808`, live in production today):
```javascript
const polys = this.extractPolygons(
  fetchResult.data,
  (label, f) => dnToFireValue[f.properties.DN] || 0,   // reads DN, ignores the forced `label` var
  (label, val) => val > 0
);
```
`extractPolygons`'s full signature (`node_helper.js:91-105`):
```javascript
extractPolygons(geojson, toValue, includesFeat){
  const polygons = [];
  geojson.features.forEach(f =>{
    const label = f.properties.LABEL || "";
    const value = toValue(label, f);
    if (!includesFeat(label, value)) return;
    let poly;
    if (f.geometry.type === "Polygon") { poly = turf.polygon(f.geometry.coordinates);}
    else if (f.geometry.type === "MultiPolygon") { poly = turf.multiPolygon(f.geometry.coordinates);}
    else return;
    polygons.push({ label, value, poly });
  });
  return polygons;
},
```
ERO's row-level parser is the identical `(label, f) => eroDnToValue[f.properties.dn] || 0` shape — lowercase `dn`, ERO's own map (never `dnToFireValue` — ERO-02). `extractPolygons`'s hardcoded `f.properties.LABEL || ""` read is harmless for ERO features (produces `label: ""`, unused by the comparator).

**Tier-ladder comparator — reused unmodified** (`node_helper.js:429-432`):
```javascript
const catComparator = {
  initial: 0,
  comparator: (best, val) => Math.max(best, val)
};
```
ERO's "highest tier wins" evaluation reuses this exact object shape (`evaluatePolygons(polys, loc, catComparator)`), same as SPC categorical and fire weather already do.

**Static URL constants — the pattern D-09 explicitly departs from** (`node_helper.js:456-481`):
```javascript
const day1CatURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson"
const day1TorURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.lyr.geojson";
// ...literal `.lyr.geojson` strings, one const per layer, D-08 leaves these untouched...
```
Do **not** add another literal-constant block for ERO. ERO's five URLs are built at call time via `buildArcGisQuery(baseUrl, layerId)` (new — see productRegistry.js below), because the SPC endpoints are static file-style URLs while ERO is a parameterized ArcGIS `/query` endpoint. Note the contrast explicitly in code comments so a future contributor doesn't "helpfully" collapse the two styles.

**Error handling pattern** (`node_helper.js:416-417`, `1126-1129` — wraps the entire `getSpcOutlook` body):
```javascript
async getSpcOutlook(lat, lon, extended) {
  try {
    // ...entire body, including the new excessiveRain block...
  } catch (err) {
    Log.error("Error fetching or parsing SPC data", err);
    return { error: err.toString() };
  }
},
```
No new try/catch needed around the ERO-specific code — it lives inside this existing outer wrapper. Individual `fetchGeoJsonCached` calls already swallow their own network errors (returns `{data: null, ...}` rather than throwing).

**`anyStale` gating — confined to the fetch-gate, per Pitfall 5** (pattern already used by fire weather Day 3-8's `if (extended) { ... if (fetchResult.stale) anyStale = true; ... }`, lines 795-834): ERO's `if (fetchResult.stale) anyStale = true;` calls must live strictly inside `if (this._products.showExcessiveRain) { ... }` — never outside it — so a disabled product contributes nothing to the roll-up (resolves the Claude's-Discretion item the same way fire weather Day 3-8 already resolves it for `extended`).

---

### `MMM-SPCOutlook.js` (component, request-response) — modifications

**Analog:** itself (existing idioms in the same file)

**`defaults:` block + socket-send pattern** (lines 1-17, verbatim — the CFG-01/D-06 analog):
```javascript
Module.register("MMM-SPCOutlook", {
  defaults: {
    lat: 35.22,    // e.g. Norman OK
    lon: -97.44,
    extended: false,
    updateInterval: 60,
    proximityWeighting: false
  },

  start: function() {
    // Request data once the module starts
    Log.info(`Starting module: ${this.name}`);
    Log.info("SPC-Outlook: GET_SPC_DATA - " + this.config.lat + "," + this.config.lon + "," + this.config.extended);
    this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting });
    // Set an interval to update every hour (3600000 milliseconds)
    setInterval(() => {this.sendSocketNotification("GET_SPC_DATA", { lat: this.config.lat, lon: this.config.lon, extended: this.config.extended, updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting });}, this.config.updateInterval * 60000);
  },
```
Add `showExcessiveRain: true` (and five future `show*: false` flags) to `defaults:`; add `products: { showExcessiveRain: this.config.showExcessiveRain }` to **both** `sendSocketNotification` call sites (start() and the `setInterval` callback are two separate literal object constructions — both must be updated identically, exactly as `updateInterval`/`proximityWeighting` are duplicated in both today).

**Day1-3 `risk != "NONE"` display-gate convention — the ERO-03 analog** (`MMM-SPCOutlook.js:135`):
```javascript
if(this.spcrisk.day1.risk != "NONE" || hasRenderableProximity(this.spcrisk.day1.proximity?.categorical))
{
  wrapper.innerHTML += dowToText(dow) + " (Day 1): <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span>" + proximityBadge(...) + "<br/>";
  ...
}
```
ERO rows copy this exact `!= "NONE"` value-check shape (no proximity subtree needed for ERO): `if (this.spcrisk.excessiveRain.day1Risk != "NONE") { ...render... }`. Do **not** copy the `fireWeather` block's convention instead — it gates on `> 0` (numeric risk), a different vocabulary from ERO's `"NONE"`-string tier, because D-02 makes `excessiveRain` mirror `fireWeather`'s *field-name* shape (`dayNRisk`/`dayNText`) but ERO's `dayNRisk` values are tier strings like day1-3's `risk`, not fire weather's 0-3 integers — confirm this distinction explicitly in the plan, since it is the one place D-02's "mirrors fireWeather" instruction and Pitfall 3's "reuse day1-3's gate" instruction could be conflated.

**`fireWeather` render block — the structural sibling ERO rows sit alongside** (`MMM-SPCOutlook.js:172-192`):
```javascript
if (this.spcrisk.fireWeather) {
  if (this.spcrisk.fireWeather.day1Risk > 0) {
    wrapper.innerHTML += "Fire Wx (Day 1): <span style=\"color:#" +
      fireRiskToColor[this.spcrisk.fireWeather.day1Risk] + "\">" +
      this.spcrisk.fireWeather.day1Text + "</span><br/>";
  }
  if (this.spcrisk.fireWeather.day2Risk > 0) { /* ...day2... */ }
  if (this.config.extended) {
    for (let d = 3; d <= 8; d++) {
      if (this.spcrisk.fireWeather["day" + d + "Risk"] > 0) {
        wrapper.innerHTML += "Fire Wx (Day " + d + "): <span style=\"color:#" +
          fireRiskToColor[this.spcrisk.fireWeather["day" + d + "Risk"]] + "\">" +
          this.spcrisk.fireWeather["day" + d + "Text"] + "</span><br/>";
      }
    }
  }
}
```
ERO's render block is the same shape but with 5 days (no `extended` gate — ERO-01 covers Days 1-5 unconditionally per this phase) and using the `excessiveRain.color` field already carried in the payload (D-02) rather than a local `fireRiskToColor` lookup table, since ERO's colors are precomputed server-side like `day1.color`/`day2.color` already are. Use `this.spcrisk.excessiveRain` as the existence guard (mirrors `if (this.spcrisk.fireWeather)`), then the per-day `!= "NONE"` gate from the pattern above for ERO-03.

**No-risk combinatorial gate — the extension point** (`MMM-SPCOutlook.js:95-113`):
```javascript
} else if (
  this.spcrisk.day1.risk == "NONE" &&
  this.spcrisk.day2.risk == "NONE" &&
  this.spcrisk.day3.risk == "NONE" &&
  !hasAnyRenderableProximity(this.spcrisk.day1.proximity) &&
  !hasAnyRenderableProximity(this.spcrisk.day2.proximity) &&
  !hasAnyRenderableProximity(this.spcrisk.day3.proximity) &&
  !( this.config.extended && this.spcrisk.day48Risk ) &&
  !(this.spcrisk.fireWeather && (this.spcrisk.fireWeather.day1Risk > 0 || this.spcrisk.fireWeather.day2Risk > 0)) &&
  !(this.config.extended && this.spcrisk.fireWeather && (
    this.spcrisk.fireWeather.day3Risk > 0 || this.spcrisk.fireWeather.day4Risk > 0 ||
    this.spcrisk.fireWeather.day5Risk > 0 || this.spcrisk.fireWeather.day6Risk > 0 ||
    this.spcrisk.fireWeather.day7Risk > 0 || this.spcrisk.fireWeather.day8Risk > 0
  ))
) {
  wrapper.innerHTML = "No Severe Weather Risk"
}
```
Add `this.spcrisk.excessiveRain.day1Risk == "NONE" && ... day5Risk == "NONE"` (all five days, `&&`-chained, `== "NONE"` per the day1-3 vocabulary this pattern follows for ERO) into this chain — same technique already used to fold in `day48Risk` and `fireWeather`. This is Pitfall 4 in RESEARCH.md and RPT-06's regression target; verify with a manual UAT case (known active ERO risk + everything else clear must NOT show "No Severe Weather Risk").

---

### `productRegistry.js` (new file — config/registry, transform)

**Analog:** none (no registry-table pattern exists yet in this codebase). Closest *content* precedents, each partially reused inside the new row's fields — not migrated, per D-08:

- URL-building style being replaced: static constants at `node_helper.js:456-481` (see "Static URL constants" excerpt above).
- Label-map style being followed (own map per product, D-07/ERO-02): `dnToFireValue = { 5: 1, 8: 2, 10: 3 }` (`node_helper.js:736`) and `riskToValue = { TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }` (`node_helper.js:445-447`) — same flat-object shape, new file, new ERO-specific values (`{ 1: 1, 2: 2, 3: 3, 4: 4 }` per RESEARCH.md's live-verified `dn` legend).
- Parser-callback shape being followed: `extractPolygons`'s `(label, f) => map[f.properties.FIELD] || 0` callback (`node_helper.js:808`, quoted in full above) — the registry row's `parser` field is this same callback with `f.properties.dn` substituted, stored as a function value in the row rather than inlined at a call site.

**No prior module boundary to imitate for CommonJS export shape** — follow the project's one existing precedent for a plain data/utility export, `module.exports = NodeHelper.create({ ... })` in `node_helper.js:20`, generalized to `module.exports = { ... }` (a plain object or array, per Claude's Discretion — RESEARCH.md's Recommended Project Structure suggests an object map keyed by product id, e.g. `{ excessiveRain: { id, configFlag, baseUrl, days, dnToValue, valueToTier, tierToText, tierToColor, parser } }`).

**`buildArcGisQuery` — no analog, this is genuinely new code** (per D-09, quoted from RESEARCH.md verbatim since it is the authoritative source and no equivalent exists on disk to re-derive from):
```javascript
function buildArcGisQuery(baseUrl, layerId) {
  // Fixed param order, f=geojson hardcoded — D-09. Never accept a caller-supplied
  // `f` value; never omit `where` (confirmed live: omitting it returns HTTP 400).
  return `${baseUrl}/${layerId}/query?where=1%3D1&outFields=*&f=geojson`;
}
```
Live-verified: omitting `where` → HTTP 400; `outSR`/`returnGeometry` intentionally omitted (ArcGIS defaults already correct — full ring geometry, and `f=geojson` reprojects server-side to WGS84 regardless of native SR). This function's physical location (`productRegistry.js` vs. a small helper near the top of `node_helper.js`) is Claude's Discretion per CONTEXT.md; co-locating it in `productRegistry.js` next to the row that uses it keeps `node_helper.js`'s already-oversized `getSpcOutlook` (flagged in CONCERNS.md) from growing further, per RESEARCH.md's stated rationale for the new file.

## Shared Patterns

### ETag/hash conditional-fetch caching
**Source:** `node_helper.js:260-320` (`fetchGeoJsonCached`)
**Apply to:** Every new ERO fetch call site (5 of them, Days 1-5) — call unmodified, same as every existing SPC/fire-weather fetch.

### Declare-defaults / conditionally-fetch / always-return
**Source:** `node_helper.js:792-834` (fire weather Day 3-8) and `node_helper.js:908-928` (Day 4 in the `extended` branch)
**Apply to:** (1) the `excessiveRain` block itself — five day locals defaulted to `"NONE"`/zero-risk before the `if (this._products.showExcessiveRain)` gate; (2) the `extended`-fork removal for `day4`-`day8`/`day48Risk` (CFG-02/D-01) — same shape, existing code, different gate variable.

### `=== true` defensive coercion for boolean flags from the socket payload
**Source:** `node_helper.js:43` (`this._proximityWeighting = proximityWeighting === true;`)
**Apply to:** `this._products.showExcessiveRain = products?.showExcessiveRain === true;` and each future product flag (D-06/D-07, and RESEARCH.md's V5 input-validation note).

### `anyStale` confined strictly to the fetch-gate
**Source:** `node_helper.js:795-834` (`if (extended) { ... if (fetchResult.stale) anyStale = true; ... }`)
**Apply to:** ERO's `if (this._products.showExcessiveRain) { ... if (fetchResult.stale) anyStale = true; ... }` — never set `anyStale` outside this gate (Pitfall 5).

### `risk != "NONE"` / `== "NONE"` value-gate (not existence-gate)
**Source:** `MMM-SPCOutlook.js:95-113` (no-risk gate), `MMM-SPCOutlook.js:135` (Day 1 render gate)
**Apply to:** All five ERO render rows and the no-risk combinatorial gate extension — the payload always carries `excessiveRain.dayNRisk`; only the *value* (`"NONE"` vs a tier string) decides render/no-render (ERO-03, Pitfall 3).

### Centralized try/catch + `Log.error`
**Source:** `node_helper.js:416-417, 1126-1129`
**Apply to:** No new wrapper needed — ERO code lives inside the existing `getSpcOutlook` try block. Use `Log.info`/`Log.error` with a `MMM-SPCOutlook` (or `MMM-SPCOutlook:`) prefix for any new log lines, matching CONVENTIONS.md.

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `productRegistry.js` (whole file) | config/registry | transform | No product-registry-table pattern exists anywhere in the codebase yet — this is genuinely new architecture per D-07. Individual pieces (label maps, parser callback shape) have strong analogs, listed above; the *table* structure itself does not. Plan this file against RESEARCH.md's Architecture Patterns / Recommended Project Structure section rather than an in-repo analog. |
| `buildArcGisQuery(baseUrl, layerId)` | utility | transform (pure string builder) | No ArcGIS query-building code exists yet — all five existing SPC/fire-weather URL groups are static literals (D-08 leaves them untouched, and D-09 explicitly departs from that style for new products). Use RESEARCH.md's live-verified 3-param spec (`where=1%3D1&outFields=*&f=geojson`, fixed order, `f` non-overridable) as the source of truth. |

## Conventions

Derived via the shared deterministic module (`bin/gsd-tools.cjs verify conventions --derive`) run repo-wide from the project root (no narrower scope was meaningful — the repo has exactly two hand-written source files at root scope; an absolute `--scope` path outside the tool's expected relative form was rejected as `unsafe-scope`, so this was re-run with cwd set to the repo root and no `--scope` flag).

| Axis | Dominant | Share | Entropy | Status |
|------|----------|-------|---------|--------|
| File-name casing | — | 0% | — | insufficient-data (2 files total: `other` 1, `snake` 1) |
| Identifier casing | — | 0% | — | insufficient-data (0 files scanned) |
| Export style | `cjs` | — | — | insufficient-data (1 sample: `module.exports = NodeHelper.create({...})`) |
| Import style | — | 0% | — | insufficient-data (`cjs` 1, `esm` 1 — the dynamic `import('node-fetch')` inside a `require()`-based file) |

**Interpretation:** the tool's own axis counts confirm what a manual read already showed — this is a two-file project (`MMM-SPCOutlook.js`, `node_helper.js`), too small for a majority-vote/entropy derivation to produce a `status: named contract` result on any axis. Fall back to CONVENTIONS.md and the concrete excerpts above as the ground truth: CommonJS (`require`/`module.exports`) throughout `node_helper.js`, one intentional exception (the dynamic `import('node-fetch')` used to load an ESM-only dependency from CJS — line 2), 2-space indentation, no formatter, camelCase identifiers, `Log.info`/`Log.error` with an `MMM-SPCOutlook` prefix.

**Contested hotspots (author's choice):** none exist in this repo at the scale the derivation tool measures (no directory-level CJS/ESM split analogous to a `bin/lib` vs `sdk/src` boundary — the one CJS/ESM mixing point, `node_helper.js:2`'s dynamic `import()` inside an otherwise-CJS file, is a single-line interop shim, not a per-directory convention split). The general principle such splits illustrate still applies here in miniature: `productRegistry.js` should pick one style (CommonJS, to match `node_helper.js`, its sole consumer) and be internally consistent, rather than importing a contested convention from elsewhere in the ecosystem.

## Metadata

**Analog search scope:** repo root (`MMM-SPCOutlook.js`, `node_helper.js`) — the entire hand-written source surface of this project; no `src/`, `controllers/`, `services/` subtree exists to search further.
**Files scanned:** 2 (both read in full across this and the upstream research pass), plus `.planning/codebase/CONVENTIONS.md` for naming/style ground truth.
**Pattern extraction date:** 2026-08-17

---

*Phase: 14-foundation-wpc-excessive-rainfall-outlook*
*Patterns mapped: 2026-08-17*
