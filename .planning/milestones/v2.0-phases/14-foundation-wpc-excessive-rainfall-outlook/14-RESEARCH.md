# Phase 14: Foundation & WPC Excessive Rainfall Outlook - Research

**Researched:** 2026-08-18
**Domain:** NOAA WPC Excessive Rainfall Outlook (ArcGIS MapServer GeoJSON) ingestion into an existing turf.js point-in-polygon MagicMirror² module; payload/config-toggle foundation for five later products
**Confidence:** HIGH (ERO endpoint, schema, CRS, and ETag behavior all live-verified this session; codebase claims verified via direct source read with line citations)

## Summary

Phase 14 has two halves that are easy to conflate but structurally independent: (1) remove the `if (!extended)` early-return fork from `getSpcOutlook` so the payload always carries `day1`–`day8`/`day48Risk`/`fireWeather` regardless of config, extended by the same "always carry the block, gate the fetch" rule to six new `products.*` toggles and a new `excessiveRain` sibling block; and (2) ship WPC ERO as the first row in a new product registry, reusing the existing fetch/cache/turf pattern almost verbatim.

The WPC ERO ArcGIS service (`hazards/wpc_precip_hazards/MapServer`, layers 0–4 = Days 1–5) was live-queried this session and confirmed: `dn` domain is `{1:Marginal, 2:Slight, 3:Moderate, 4:High}` — a completely different domain from fire weather's `DN` `{5,8,10}`, confirmed both by field-name case (`dn` vs `DN`) and value range. The service's native spatial reference is Web Mercator (3857); `f=geojson` reprojects server-side to WGS84 — raw `f=json` was directly tested and returns meter-scale coordinates that would silently corrupt turf math if ever used. ETag support was live-confirmed present and stable across repeated identical requests, meaning `fetchGeoJsonCached` will use its ETag branch for ERO (not the SHA256 fallback ARCHITECTURE.md speculated about). `extractPolygons` already supports ERO's exact shape today without modification — the fire-weather Day 3-8 code (`node_helper.js:808`) already reads a non-`LABEL` DN-style field through the `toValue(label, f)` callback's second argument; ERO's parser is the same pattern with `f.properties.dn` substituted for `f.properties.DN`.

**Primary recommendation:** Remove the `extended` early-return fork; add a `PRODUCT_REGISTRY` object (new file, not inlined in `node_helper.js`) with one row for ERO; build ERO's fetch via a shared `buildArcGisQuery(baseUrl, layerId)` returning `${baseUrl}/${layerId}/query?where=1%3D1&outFields=*&f=geojson` with no caller-supplied override of `f`; reuse `extractPolygons`/`evaluatePolygons` unchanged, passing ERO's own `dn`-keyed `toValue` callback; gate ERO-03's "no row" behavior at the frontend via the exact same `risk != "NONE"` convention day1–day3 already use, not a new payload-shape mechanism.

## User Constraints (from CONTEXT.md)

<user_constraints>

### Locked Decisions

**Payload decoupling shape**
- **D-01:** `extended` gates **fetching only**. The payload always carries `day4`–`day8` and `day48Risk` keys; when `extended: false` those keys hold zero/no-risk values and Days 4–8 are not fetched. The frontend keeps using `config.extended` to decide rendering. This is the concrete satisfaction of CFG-02 — the payload shape no longer forks on `extended`.
- **D-02:** ERO data sits as a sibling block mirroring `fireWeather`: `excessiveRain: { day1Risk, day1Text, … day5Risk, day5Text }`. Do **not** pre-emptively adopt Phase 18's `days`/`summary`/`sources` structure — Phase 18 migrates this block.
- **D-03:** Carry the raw `valid_time` string per day into the payload even though nothing displays it, so Phase 18's MERGE-01 inherits real captured window data rather than re-deriving ERO Day 1's partial 01Z–12Z window from documentation.
- **D-04:** ERO fetch results roll into the existing global `anyStale` flag exactly like SPC layers. Per-row / per-product staleness UX is out of scope for this phase.

**Config toggle convention**
- **D-05:** A product toggle being off never changes the payload shape. When `showExcessiveRain: false`, the payload still carries the full `excessiveRain` block populated with zero/no-risk values — the same rule as D-01, extended from `extended` to all six product flags. One payload shape regardless of configuration; the frontend gates rendering on the flag. Phase 18's merge logic must never null-check for a missing product key.
- **D-06:** User-facing config stays flat booleans per CFG-01 (`showExcessiveRain: true`, each new product flag defaulting to `false`). The **socket payload** groups them into a nested `products: { … }` object rather than adding six more top-level fields to the `GET_SPC_DATA` notification. This keeps the wire contract from growing to 11+ flat fields and gives Phase 17's `Promise.all` parallelization a single list to iterate.
- **D-07:** New products are defined in a **product registry table** — one row per product carrying: product id, its config flag, URL builder, parser function, and its own label→value map. ERO is row one; Phases 15–17 add rows. The per-row label map is the structural mechanism that satisfies DATA-03 (no vocabulary reuse across products) and prevents ERO's `dn` domain from being fed through the fire weather `DN` table (ERO-02).
- **D-08:** The registry covers **new WPC/CPC products only**. Existing SPC and fire-weather URL constants and mappings are left untouched this phase — migrating working v1.x code into the registry would stack regression risk onto the foundation phase, and Phase 19 already carries the milestone's display-rewrite risk.
- **D-09:** All ArcGIS URLs are built by a single shared `buildArcGisQuery(layer, opts)` helper with a **fixed parameter order** and `f=geojson` **hardcoded and non-overridable** — callers cannot inject or override params. This makes DATA-01 structurally unsatisfiable to violate (no code path can emit `f=json`) and makes PERF-02 hold by construction: the query string is byte-identical on every poll, so the existing ETag/SHA256 cache hits instead of re-running turf on unchanged data.

### Claude's Discretion

- Where toggle defaults are defensively applied — frontend `defaults:` block only, or also node_helper-side fallbacks in the style of today's `_updateInterval` / `_proximityWeighting` handling (`node_helper.js:34–43`).
- Whether a product that is toggled off is excluded from the `anyStale` roll-up. D-04 establishes that ERO *when fetched* feeds `anyStale`; a disabled product is not fetched, so the natural reading is that it contributes nothing — confirm this rather than letting a never-fetched product register as stale.
- The registry's exact shape (object map vs array of descriptors), the ERO tier→color mapping values, and where the registry module physically lives.

### Deferred Ideas (OUT OF SCOPE)

- **Migrating existing SPC / fire-weather endpoints and mappings into the product registry** — deliberately declined for this phase (D-08). A reasonable v2.x cleanup once Phase 19's rewrite has settled; not currently in the backlog.
- Per-product / per-row staleness UX — out of scope per D-04; `anyStale` stays global this milestone.
- Everything already recorded in `.planning/REQUIREMENTS.md` §"Future Requirements" (WSSIX-01, MERGEX-01/02, COVX-01) and §"Out of Scope" remains deferred; nothing in this discussion changed those.

</user_constraints>

## Phase Requirements

<phase_requirements>

| ID | Description | Research Support |
|----|-------------|------------------|
| CFG-01 | User enables each new product independently via its own boolean, all defaulting to false | "Payload/Socket Contract" pattern below: `defaults:` block gains six `show*` booleans; node_helper-side defensive re-default recommended (mirrors `_updateInterval`/`_proximityWeighting`) |
| CFG-02 | Existing SPC/fire-weather config continues to work; `extended` no longer gates payload shape | "Removing the `extended` Fork" pattern below — concrete before/after structure |
| DATA-01 | Coordinates always evaluated against WGS84 geometry; `f=geojson` requested for every ArcGIS endpoint, no raw `f=json` fallback | Live-verified CRS behavior (Web Mercator native, `f=geojson` reprojects); `buildArcGisQuery` hardcodes `f=geojson` non-overridable |
| PERF-02 | ETag/SHA256 cache stays effective via consistent ArcGIS query-string construction | Live-verified ETag presence/stability on the ERO endpoint; `buildArcGisQuery`'s fixed 3-param string prevents cache-key drift |
| ERO-01 | User sees ERO risk tier for Days 1–5 when `showExcessiveRain` enabled | Confirmed live: layers 0–4 = Excessive Rainfall Day 1–5 on `hazards/wpc_precip_hazards/MapServer` |
| ERO-02 | Correct tier label matched against ERO's own `dn` domain, not fire weather's `DN` mapping | Live-confirmed `dn` domain `{1,2,3,4}`→`{Marginal,Slight,Moderate,High}`; distinct field case and value range from `dnToFireValue` |
| ERO-03 | No ERO row for a day where location falls outside all ERO polygons | "ERO-03: No Row vs Empty Row" pitfall below — reuse existing `risk != "NONE"` display gate, not a payload-shape mechanism |

</phase_requirements>

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Config toggle definition (`show*` defaults) | Browser/Client | — | `MMM-SPCOutlook.js` `defaults:` block; user-facing config lives entirely client-side per MagicMirror convention |
| Toggle transport (`products` nested object) | Browser/Client → API/Backend | — | Assembled client-side, sent once via `GET_SPC_DATA` socket notification; node_helper is a passive consumer |
| ERO fetch (ArcGIS query construction, HTTP) | API/Backend | — | `node_helper.js` — all external NOAA calls are backend-only, matching every existing SPC/fire-weather fetch |
| ETag/hash caching | API/Backend | — | `_geoJsonCache` (in-memory `Map`, ephemeral — no persistent Database/Storage tier exists in this app) |
| Point-in-polygon tier evaluation (`dn`→tier) | API/Backend | — | `extractPolygons`/`evaluatePolygons` + turf; domain vocabulary (`dn` mapping) must never leak to the client per D-07/DATA-03 |
| Payload shape assembly (`excessiveRain` block, `day1`–`day8` always-present) | API/Backend | — | `getSpcOutlook`'s return object; CFG-02's "shape never forks" rule is enforced here, not client-side |
| Render gating (NONE-check, no-risk combinatorial gate) | Browser/Client | — | `MMM-SPCOutlook.js` `getDom()` — all display logic, including ERO-03's "no row" behavior, is a client-side gate over an always-present payload field |

**Note:** This app has no SSR, CDN, or persistent Database/Storage tier — it is a two-tier MagicMirror module (Browser/Client `MMM-SPCOutlook.js` + a Node "API/Backend" `node_helper.js` process) communicating over Socket.IO-style notifications, not HTTP.

## Standard Stack

### Core

No new npm dependencies are required or recommended for this phase. Every dependency ERO needs is already installed and used by the existing SPC/fire-weather fetch path.

| Library | Version (verified) | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `node-fetch` | 2.7.0 installed (package.json requires `^2.6.1`) [VERIFIED: package.json + node_modules] | HTTP GET to the ERO ArcGIS endpoint | Already the sole HTTP client in `node_helper.js`; `fetchGeoJsonCached` is protocol-agnostic and needs no change |
| `@turf/turf` | 7.3.4 installed (package.json requires `^7.2.0`) [VERIFIED: package.json + node_modules] | `turf.point`, `turf.polygon`/`turf.multiPolygon`, `turf.booleanPointInPolygon` | Already used identically for SPC/fire-weather point-in-polygon; ERO's GeoJSON parses into the same `Polygon`/`MultiPolygon` feature shapes `extractPolygons` already handles |
| `crypto` (Node builtin) | Node 25.9.0 installed locally [VERIFIED: `node --version`] | SHA256 fallback path in `fetchGeoJsonCached` | Not expected to engage for ERO (ETag confirmed present, see Pitfalls), but present as the existing fallback with zero new code |

### Supporting

None needed — no new npm packages for Phase 14 (confirmed by STACK.md's "zero new npm dependencies required" v2.0-wide finding, and independently re-confirmed here: ERO is plain GeoJSON over HTTPS with a real ETag, the simplest of the six v2.0 products).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Fetch-whole-layer + local turf evaluation (matches existing SPC pattern) | Server-side spatial point query (`geometry=`, `geometryType=esriGeometryPoint`, `spatialRel=esriSpatialRelIntersects`) | Server-side query was never live-tested by any prior research round (SUMMARY.md Conflict 1) and would require a different, unproven query shape mid-`buildArcGisQuery` design; fetch-whole-layer is proven (SPC has used it since v1.0) and ERO's layers are small (live volume: single-digit to low-dozens of features per layer) — no measurable cost difference. Out of scope for this phase; flagged as a cheap future spike in REQUIREMENTS.md's "Out of Scope" table. |
| `buildArcGisQuery` as one shared helper (D-09, locked) | Per-product hardcoded URL constants (existing SPC style) | Explicitly rejected by the user in discussion (Q8) — SPC's literal-constant style doesn't generalize to a `where`-clause-varying multi-day/multi-product future without duplicating boilerplate six times |

**Installation:**
```bash
# No installation needed — zero new dependencies this phase.
```

**Version verification:**
```bash
npm view node-fetch version   # not run — already installed at 2.7.0, satisfies ^2.6.1
npm view @turf/turf version   # not run — already installed at 7.3.4, satisfies ^2.6.1... (^7.2.0)
```
Both packages were confirmed installed and functional via direct `node_modules` inspection and a local `require()` smoke test (`turf.booleanPointInPolygon`, `turf.polygon`, `turf.multiPolygon` all resolve to functions) — no registry lookup needed since no new install occurs.

## Package Legitimacy Audit

**Not applicable this phase — no external packages are installed.** Phase 14 adds zero new npm dependencies (confirmed above and independently by `.planning/research/STACK.md`'s v2.0-wide "zero new npm dependencies required" finding). No `pip install slopcheck` / registry verification step is needed. If a future phase (15–17) introduces a new package (none currently anticipated — MPD/HeatRisk/WSSI/Hazards Outlook all resolve to the existing GeoJSON/KMZ/scalar-JSON stack per STACK.md), run the full Package Legitimacy Gate at that time.

## Architecture Patterns

### System Architecture Diagram

```
Browser/Client (MMM-SPCOutlook.js)
  defaults{} — showExcessiveRain: false (+ 5 future flags, all false)
        │
        │ start() / setInterval → sendSocketNotification("GET_SPC_DATA", {
        │   lat, lon, extended, updateInterval, proximityWeighting,
        │   products: { showExcessiveRain: this.config.showExcessiveRain, ... }
        │ })
        ▼
API/Backend (node_helper.js) socketNotificationReceived
        │ destructure { ..., products } from payload
        │ defensively re-default: this._products.showExcessiveRain = products?.showExcessiveRain === true
        ▼
getSpcOutlook(lat, lon, extended)                 ┌─ PRODUCT_REGISTRY (new file)
        │  ...existing day1–day8/fireWeather...    │   excessiveRain: {
        │                                           │     id, configFlag: "showExcessiveRain",
        │  if (this._products.showExcessiveRain) ──▶│     baseUrl, days:{1:0,...,5:4},
        │    for day in 1..5:                       │     dnToValue:{1:1,2:2,3:3,4:4},
        │      url = buildArcGisQuery(baseUrl, ─────▶│     valueToTier, tierToText, tierToColor }
        │            registry.days[day])            └──────────┬──────────────────────────────
        │      fetchGeoJsonCached(url) ──ETag 304 or 200───▶ mapservices.weather.noaa.gov
        │                                                     hazards/wpc_precip_hazards/MapServer
        │      extractPolygons(data, (label,f)=>dnToValue[f.properties.dn]||0, (l,v)=>v>0)
        │      evaluatePolygons(polys, loc, catComparator)  ← turf.booleanPointInPolygon
        │      tier = valueToTier[value] || "NONE"
        │  else:
        │      tier = "NONE" for all 5 days (never fetched)
        │
        │  excessiveRain: { day1Risk, day1Text, day1Color, day1ValidTime, ..., day5* }
        │  (ALWAYS present — D-05; day1–day8/fireWeather ALWAYS present — D-01/CFG-02)
        ▼
sendSocketNotification("SPC_DATA_RESULT", [outlook, md])   ← unchanged wire shape this phase
        │
        ▼
Browser/Client socketNotificationReceived → this.spcrisk = payload[0]
        │
        ▼
getDom() — existing NONE-gate pattern reused for ERO:
    if (this.spcrisk.excessiveRain.day1Risk != "NONE") { render Day 1 ERO row }
    ... (no row rendered when tier is NONE — ERO-03)
    no-risk combinatorial gate (L95-113) extended with excessiveRain day1..day5 != "NONE" checks
```

### Recommended Project Structure

```
MMM-SPCOutlook.js       # unchanged file, additive: defaults{}, products{} in socket sends, ERO render block, no-risk gate extension
node_helper.js          # unchanged file, additive: extended-fork removal, excessiveRain block, buildArcGisQuery call sites
productRegistry.js      # NEW — one row (excessiveRain); required by node_helper.js via require("./productRegistry")
```

**Why a new file, not inlined in `node_helper.js`:** `.planning/codebase/CONCERNS.md` already flags `node_helper.js` for having an oversized `getSpcOutlook` (330+ lines) as a known, tracked tech-debt item. D-08 explicitly scopes the registry to *new* products only — it is not a refactor of the existing file. Adding the registry as a second file avoids compounding the existing file-size concern and gives Phases 15–17 a natural place to add rows without touching `node_helper.js`'s already-large body more than necessary (they still need a small registry-consumption loop inside `node_helper.js`, but not per-product inline blocks). This is a discretion call (registry's physical location) — the standalone-file approach is the recommendation, not a lock.

### Pattern 1: `buildArcGisQuery(baseUrl, layerId)` — fixed, non-overridable query construction

**What:** A single helper that returns the ArcGIS `/query` URL with exactly three params, in a fixed order, every time: `where=1%3D1`, `outFields=*`, `f=geojson`. No `opts` parameter accepts overrides of any of these three; `f=geojson` is a literal in the return template, never a variable.

**When to use:** Every new WPC/CPC ArcGIS-backed product (ERO this phase; WSSI/Hazards Outlook in Phases 15–16 reuse the same helper against their own layers).

**Example:**
```javascript
// New — productRegistry.js or a small helper near the top of node_helper.js
function buildArcGisQuery(baseUrl, layerId) {
  // Fixed param order, f=geojson hardcoded — D-09. Never accept a caller-supplied
  // `f` value; never omit `where` (confirmed live: omitting it returns HTTP 400).
  return `${baseUrl}/${layerId}/query?where=1%3D1&outFields=*&f=geojson`;
}
```

**Live-verified evidence backing the fixed-3-param design (2026-08-18, `curl` against production):**
- Omitting `where` entirely (`?f=geojson`) returns `HTTP 400 {"error":{"code":400,"message":"","details":[]}}` — `where` is mandatory, not optional-with-a-safe-default.
- `returnGeometry` was **not** passed in the verification query and full ring geometry was still returned — the ArcGIS default for this param is `true`; do not add it explicitly (fewer params = less to drift, and D-09 wants a minimal fixed set).
- `outSR` is unnecessary: `f=geojson` reprojects server-side to WGS84 regardless of the layer's native spatial reference (native SR here is Web Mercator, `wkid: 102100`/`3857`, confirmed via `MapServer?f=json`'s `spatialReference` block) — confirmed by directly comparing a `f=geojson` response (plausible `-103.x, 28.x` lon/lat coordinates) against the same query with `f=json` (raw esriJSON `rings` in the `-11,514,460 / 3,360,207` meter range). **Never fall back to raw `f=json`** — this is DATA-01's hard requirement, reproduced live, not just documented.

### Pattern 2: Removing the `extended` Fork (CFG-02, D-01)

**What:** `getSpcOutlook` currently has a hard `if (!extended) { return {...} }` at `node_helper.js:836` that returns a *structurally different* object (no `day4`–`day8`, no `day48Risk`) than the `extended: true` path. CFG-02 requires collapsing this into one return shape.

**Current shape (verified, `node_helper.js:836-1124`):**
```javascript
if (!extended) {
  return { ...(anyStale?{...}:{}) , day1, day2, day3, fireWeather /* day3-8 hardcoded to 0/"None" */ };
}
// ...day4-8 fetch blocks, all gated by having reached this point (i.e. implicitly gated by `extended`)...
return { ...(anyStale?{...}:{}), day48Risk, day1, day2, day3, day4, day5, day6, day7, day8, fireWeather };
```

**Recommended shape:** default day4–day8 locals to zero/no-risk *before* the fetch blocks, wrap only the **fetch calls** (not the variable declarations or the final risk computation) in `if (extended) { ... }`, and always build one return object:
```javascript
// Always declared, always zero/no-risk by default:
let day4ProbRisk = 0, day4Sign = false;
// ...day5-day8 identical...

if (extended) {
  // existing fetch blocks for day4URL..day8URL — UNCHANGED internals, just no longer
  // gated by an early return; they simply don't run when extended is false.
  { const fetch4 = await this.fetchGeoJsonCached(day4URL); /* ...existing body... */ }
  // ...day5-day8...
}

// Always computed — "NONE" when defaults (0, false) are used:
const day4Risk = this.percToRisk(day4ProbRisk, day4Sign);
// ...day5-day8...

let day48Risk = false;
if (extended) {
  day48Risk = day4ProbRisk > 0 || day5ProbRisk > 0 || day6ProbRisk > 0 || day7ProbRisk > 0 || day8ProbRisk > 0;
}

return {
  ...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {}),
  day48Risk, day1, day2, day3, day4, day5, day6, day7, day8,
  fireWeather: { /* existing conditional day3-8 fire logic, already correctly structured this way */ },
  excessiveRain: { /* new — see Pattern 3 */ }
};
```
Note the existing fire-weather Day 3-8 block (`node_helper.js:792-834`) is **already written in exactly this style** — declare-then-conditionally-fetch — it is only the top-level `day1`–`day8` return object that has the offending hard fork. This is the direct precedent to follow, not a new pattern to invent.

**Anti-pattern to avoid:** Do not gate the *existence* of `day4`–`day8` keys on `extended` (the current bug); only gate whether their fetch calls run. Do not introduce a second parallel fork for the six new `products.*` flags — apply the identical "declare defaults, conditionally fetch, always return" shape to `excessiveRain` (and to each future product in Phases 15–17).

### Pattern 3: ERO Fetch/Parse — reusing `extractPolygons` unmodified

**What:** `extractPolygons(geojson, toValue, includesFeat)` at `node_helper.js:91-105` unconditionally reads `f.properties.LABEL` into a local `label` variable it returns per-item — but the `toValue(label, f)` callback receives the **full feature `f`** as its second argument, and the existing fire-weather Day 3-8 code already exploits this to read a non-`LABEL` field:

```javascript
// EXISTING code, node_helper.js:808 (fire weather Day 3-8, already in production)
const polys = this.extractPolygons(
  fetchResult.data,
  (label, f) => dnToFireValue[f.properties.DN] || 0,   // reads DN, ignores the forced `label` var
  (label, val) => val > 0
);
```

**ERO's parser is the identical pattern, one field-name and one map swapped:**
```javascript
// NEW — ERO, same call shape as the existing fire-weather Day 3-8 pattern above
const eroDnToValue = { 1: 1, 2: 2, 3: 3, 4: 4 };  // ERO's OWN dn domain — never dnToFireValue (ERO-02)
const polys = this.extractPolygons(
  fetchResult.data,
  (label, f) => eroDnToValue[f.properties.dn] || 0,   // lowercase dn — NOT f.properties.DN
  (label, val) => val > 0
);
const value = this.evaluatePolygons(polys, loc, catComparator);  // catComparator: {initial:0, comparator:Math.max} — existing, reused as-is
const eroValueToTier = { 1: "MRGL", 2: "SLGT", 3: "MDT", 4: "HIGH" };
const tier = value === 0 ? "NONE" : eroValueToTier[value];
```
`extractPolygons`'s hardcoded `f.properties.LABEL || ""` read still executes for ERO features (producing `label: ""` on every item, since ERO has no `LABEL` field) — this is harmless because `evaluatePolygons`'s comparator only inspects `value`, never `label`. No modification to `extractPolygons` is needed or recommended.

**Confirmed live field schema** (`hazards/wpc_precip_hazards/MapServer/0/query?outFields=*`, 2026-08-18): `objectid`, `product`, `valid_time` (string, e.g. `"01Z 08/18/26 - 12Z 08/18/26"` for Day 1, `"12Z 08/21/26 - 12Z 08/22/26"` for Day 5 — confirms D-03's partial-window claim exactly), `outlook` (human string, e.g. `"Marginal (At Least 5%)"`), `issue_time`/`start_time`/`end_time` (human date strings), `idp_source`, `idp_filedate`/`idp_ingestdate` (epoch ms), `dn` (integer 1-4), `snippet`.

### Pattern 4: Payload/Socket Contract — request side vs response side

Two distinct payload directions exist and D-06/D-02 apply to different ones — do not conflate them:

**Request (frontend → backend, `GET_SPC_DATA`):** D-06 applies here. Add a nested `products` object:
```javascript
// MMM-SPCOutlook.js — both the start() call and the setInterval callback
this.sendSocketNotification("GET_SPC_DATA", {
  lat: this.config.lat, lon: this.config.lon, extended: this.config.extended,
  updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting,
  products: { showExcessiveRain: this.config.showExcessiveRain }  // + 5 future flags
});
```
```javascript
// node_helper.js socketNotificationReceived
const { lat, lon, extended, updateInterval, proximityWeighting, products } = payload;
// Defensive re-default, mirroring the existing _updateInterval/_proximityWeighting pattern
// (node_helper.js:34-43) — recommended resolution of the "Claude's Discretion" item:
this._products = { showExcessiveRain: products?.showExcessiveRain === true };
```

**Response (backend → frontend, `SPC_DATA_RESULT`):** D-02/D-05 apply here — NOT D-06 (D-06 is about the *request* wire contract). Recommend leaving the existing `sendSocketNotification("SPC_DATA_RESULT", [outlook, md])` positional-array shape **untouched this phase**. CFG-02 requires the payload's *internal* shape (inside `outlook`) to stop forking on `extended`; it does not require the outer `[outlook, md]` transport format to change. ARCHITECTURE.md's recommendation to switch to a single named socket object is explicitly a Phase 18 concern (that research predates this phase's CONTEXT.md and describes the *eventual* `days`/`summary`/`sources`/`advisories` schema) — changing it now would exceed D-08's "existing SPC/fire-weather... left untouched this phase" boundary for zero benefit, since nothing in Phase 14's requirements needs it. Add `excessiveRain` as a new sibling key inside `outlook`, mirroring `fireWeather`'s shape:
```javascript
excessiveRain: {
  day1Risk: "MRGL", day1Text: "Marginal", day1Color: "7ac687", day1ValidTime: "01Z 08/18/26 - 12Z 08/18/26",
  // ... day2..day5, same 4 fields each
}
```
Populated with `{ dayNRisk: "NONE", dayNText: "None", dayNColor: <gray/no-data color>, dayNValidTime: null }` for all 5 days when `showExcessiveRain` is false (D-05) — same shape either way, never a different key set.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| ArcGIS query-string construction | Ad hoc template strings at each fetch call site | `buildArcGisQuery(baseUrl, layerId)`, one call site per layer | Prevents the exact cache-key-multiplication failure PITFALLS.md Pitfall 11 documents — any drift in param order/presence creates a distinct `_geoJsonCache` key for identical data |
| Conditional-GET / staleness caching | A new caching layer for ERO | `fetchGeoJsonCached` (`node_helper.js:260-320`), unmodified | Already fully protocol-agnostic (works on any JSON-returning URL); live-confirmed ERO's ETag support makes this a genuine cache-hit path, not a fallback |
| Point-in-polygon evaluation | A new turf wrapper for ERO's `Polygon`/`MultiPolygon` features | `extractPolygons`/`evaluatePolygons` (`node_helper.js:91-122`), unmodified | Already handles both GeoJSON geometry types; the fire-weather Day 3-8 code already proves the `toValue(label, f)` callback pattern works for non-`LABEL` fields |
| Tier-ladder "highest wins" logic | A new comparator for ERO's 4-tier domain | `catComparator = { initial: 0, comparator: (best, val) => Math.max(best, val) }`, existing, reused as-is | ERO's `dn` domain is a simple ordinal ladder (1-4) exactly like SPC's `riskToValue`; no new comparison logic needed |
| Registry-driven product iteration for future parallelization (Phase 17 PERF-01) | A bespoke fetch-orchestration function this phase | `Object.values(PRODUCT_REGISTRY)` as the iterable list | D-07's registry is explicitly designed so Phase 17's `Promise.all` has "a single list to iterate" (CONTEXT.md D-06) — build the registry now in the shape that supports that later, even though Phase 14 itself only has one row and stays sequential |

**Key insight:** Every mechanism ERO needs already exists in this codebase in a proven, production form (fetch/cache, turf evaluation, tier comparator) — the fire-weather Day 3-8 integration in v1.1 already solved "read a non-LABEL ordinal field through `extractPolygons`" for a structurally identical problem. Phase 14's genuinely new code is: the registry itself, `buildArcGisQuery`, the extended-fork removal, and the `products` socket-contract addition — not a new geometry/caching layer.

## Common Pitfalls

### Pitfall 1: ERO's `dn` field colliding with fire weather's `DN` mapping (ERO-02)

**What goes wrong:** Copy-pasting `dnToFireValue = { 5: 1, 8: 2, 10: 3 }` (fire weather's existing map, `node_helper.js:736`) or its call pattern without re-deriving ERO's own domain would silently produce wrong tiers — ERO's `dn` values (1-4) don't overlap fire weather's `DN` values (5, 8, 10) at all, so `dnToFireValue[f.properties.dn]` would evaluate to `undefined || 0` for every ERO feature, silently reporting "no risk" everywhere (a false negative, not a crash).

**Why it happens:** Both fields are Esri raster-to-vector "data number" byproducts that happen to share a name pattern (`DN`/`dn`) coincidentally, not because of a shared NOAA schema convention (PITFALLS.md Pitfall 2).

**How to avoid:** Define `eroDnToValue = { 1: 1, 2: 2, 3: 3, 4: 4 }` as its own named constant (confirmed live against the layer's `drawingInfo.renderer` legend AND against live feature attributes: `dn:1`↔`outlook:"Marginal (At Least 5%)"`, `dn:2`↔`"Slight (At Least 15%)"`), stored in the registry row, never referencing `dnToFireValue`.

**Warning signs:** ERO always reports "None" for a location known (via NOAA's own ERO web page) to have active risk — this is the exact false-negative signature Pitfall 8 describes for the `LABEL`/`label` case mismatch, and the same signature would appear here if the wrong map is used.

### Pitfall 2: Raw `f=json` (esriJSON) "fallback" corrupting turf geometry (DATA-01)

**What goes wrong:** ERO's native spatial reference is Web Mercator (`wkid: 102100`/`3857`, confirmed via `MapServer?f=json`). A future "simplify the fetch" refactor that drops `f=geojson` in favor of raw `f=json` (e.g., to read `spatialReference` metadata) would feed turf coordinates in the `-11,000,000`/`3,000,000` range — syntactically valid `Polygon` rings, geographically meaningless, and turf raises no exception.

**Why it happens:** `f=json` and `f=geojson` are both "valid" ArcGIS response formats; only `f=geojson` triggers server-side reprojection to WGS84.

**How to avoid:** `buildArcGisQuery` hardcodes `f=geojson` as a template literal, never a variable — no caller-reachable code path can override it (D-09). Add a comment at the builder call site citing this pitfall so a future refactor doesn't "helpfully" add an `f` override.

**Warning signs:** Any coordinate value with `|value| > 180` flowing into `turf.polygon`/`turf.multiPolygon` is an immediate tripwire — consider a cheap bounds assertion at `extractPolygons`'s geometry-construction step (`node_helper.js:98-101`) given this project has no automated test suite to catch a CRS regression otherwise (PITFALLS.md Pitfall 6's recommendation).

### Pitfall 3: ERO-03 "no row" — a display-gate requirement, not a payload-shape requirement

**What goes wrong:** Reading ERO-03 ("User sees no ERO row for a day where their location falls outside all ERO polygons") in isolation could suggest omitting the day's key from the payload when there's no risk — but this directly contradicts D-05's "always carry the block" rule and would reintroduce exactly the shape-forks-on-condition anti-pattern CFG-02 exists to eliminate.

**How to avoid:** ERO-03 is satisfied entirely at the frontend, by reusing the existing convention day1–day3 SPC rows already use: `if (this.spcrisk.excessiveRain.day1Risk != "NONE") { /* render */ }` (mirrors `MMM-SPCOutlook.js:135`, `this.spcrisk.day1.risk != "NONE"`). The payload always has `excessiveRain.day1Risk === "NONE"` for an outside-all-polygons day; the frontend's `!= "NONE"` check is what produces "no row" in the rendered DOM. Do not invent a new "omit vs. render empty" mechanism for ERO — it already exists in this codebase for exactly this purpose.

**Warning signs:** Any ERO render code that checks `if (this.spcrisk.excessiveRain)` (existence) rather than `if (this.spcrisk.excessiveRain.dayNRisk != "NONE")` (value) will render an empty/malformed row instead of no row, since the block is always present per D-05.

### Pitfall 4: No-risk combinatorial gate (L95-113) not extended to include ERO

**What goes wrong:** The existing "No Severe Weather Risk" gate is one large `&&`-chained boolean checking `day1.risk`, `day2.risk`, `day3.risk`, proximity renderability, `day48Risk`, and fire weather across 8 days. If ERO ships without extending this gate, a location with an active ERO risk but no SPC/fire-weather risk would incorrectly display "No Severe Weather Risk" while an ERO row exists nowhere to contradict it (or the gate could be extended incorrectly and suppress an ERO row that should render).

**How to avoid:** Add `this.spcrisk.excessiveRain.day1Risk == "NONE" && ... day5Risk == "NONE"` into the existing `&&`-chain (all conditions in that block are already "and this is also true" checks for the no-risk state), consistent with how `day48Risk` and `fireWeather` were each folded in as the codebase grew. This is display-layer work (`MMM-SPCOutlook.js`), separate from and in addition to the payload-layer work in Patterns 2-4.

**Warning signs:** A manual UAT test with a known-active ERO risk and everything else clear still shows "No Severe Weather Risk" — the single most likely regression class for this phase, per RPT-06's broader "no-risk gate" theme already documented in PITFALLS.md Pitfall 9.

### Pitfall 5: Disabled product silently registering as stale in the `anyStale` roll-up

**What goes wrong:** If the `showExcessiveRain: false` code path accidentally routes through any of the `fetchGeoJsonCached`/`_isWithinStaleWindow` logic (e.g., a leftover call that still executes even when the flag is off), a never-fetched product could set `anyStale = true` spuriously, showing a "stale" banner for data that was never fetched at all — actively misleading, not just cosmetically wrong.

**How to avoid:** The recommended resolution to the Claude's-Discretion item: `anyStale` should only ever be touched inside the `if (this._products.showExcessiveRain) { ... }` block, exactly mirroring how `if (extended) { ... }` already gates fire-weather Day 3-8's contribution to `anyStale`. A disabled product contributes nothing to `anyStale`, consistent with D-04's framing ("ERO fetch results roll into `anyStale`" — implicitly conditioned on being fetched at all).

**Warning signs:** `_stale` becomes `true` immediately on first load with `showExcessiveRain: false` and no other product active — this would be the observable symptom of this bug.

## Code Examples

### buildArcGisQuery — verified request/response round trip

```bash
# Verified live, 2026-08-18 — confirms the exact 3-param query this phase needs
curl -s "https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query?where=1%3D1&outFields=*&f=geojson"
# → HTTP 200, Content-Type: application/geo+json;charset=UTF-8
# → etag: "14910dbc" (identical across two immediately-repeated requests — ETag mode confirmed)
```

### ERO feature schema (live sample, Day 1, properties only)

```json
{
  "objectid": 1,
  "product": "Day 1 Excessive Rainfall Potential Forecast",
  "valid_time": "01Z 08/18/26 - 12Z 08/18/26",
  "outlook": "Marginal (At Least 5%)",
  "issue_time": "2026-08-18 00:32:00",
  "start_time": "2026-08-18 01:00:00",
  "end_time": "2026-08-18 12:00:00",
  "idp_source": "94e1801until",
  "idp_filedate": 1787014082000,
  "idp_ingestdate": 1787014154000,
  "dn": 1,
  "snippet": "01Z 08/18/26 - 12Z 08/18/26"
}
```
Source: `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=geojson`, fetched 2026-08-18.

### `dn` legend (live, layer metadata `drawingInfo.renderer`)

| `dn` | `outlook` label | Recommended tier string |
|------|------------------|--------------------------|
| 1 | "Marginal (At Least 5%)" | `MRGL` |
| 2 | "Slight (At Least 15%)" | `SLGT` |
| 3 | "Moderate (At Least 40%)" | `MDT` |
| 4 | "High (At Least 70%)" | `HIGH` |

Source: `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0?f=json`, `drawingInfo.renderer.uniqueValueGroups[0].classes`, fetched 2026-08-18.

## State of the Art

| Old Approach | Current/Recommended Approach | When Changed | Impact |
|--------------|------------------------------|---------------|--------|
| `if (!extended) { return <smaller object> }` fork at `node_helper.js:836` | Always return one shape; `extended` gates fetch calls only | This phase (Phase 14) | Directly satisfies CFG-02; removes the branching-on-config anti-pattern ARCHITECTURE.md's A.4 flagged as "not tenable" for 5+ future toggles |
| Per-call-site inline ArcGIS query strings (would have been the naive approach for 6 new products) | `buildArcGisQuery(baseUrl, layerId)`, one shared builder | This phase (Phase 14) | Prevents PITFALLS.md Pitfall 11's cache-key-multiplication failure before it can occur |
| `[outlook, md]` positional socket response array | Unchanged this phase | Deferred to Phase 18 | ARCHITECTURE.md recommends a single named response object, but that is explicitly Phase 18/19 scope (the `days`/`summary`/`sources`/`advisories` schema) — out of Phase 14's boundary per D-08 |

**Deprecated/outdated:** ARCHITECTURE.md's MEDIUM-confidence claim that "ArcGIS REST query/identify endpoints commonly don't emit `ETag` headers on dynamic query responses" does **not** hold for the ERO endpoint specifically — live-verified 2026-08-18: `etag: "14910dbc"` present and stable across two immediately-repeated identical requests. `fetchGeoJsonCached` will use its ETag branch (not the SHA256 fallback) for ERO. This correction is noted here since it changes the expected cache-hit-rate profile the CONTEXT.md research-focus item #4 asked about.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|----------------|
| A1 | ERO's tier→color mapping values (`MRGL`→`7ac687`, `SLGT`→`f7f690`, `MDT`→`eb7e82`, `HIGH`→`ff81f8`) reusing SPC's existing hex values as a starting default, stored in a separate `eroRiskToColor` object | Code Examples / Pattern 3 | Low — purely cosmetic; explicitly flagged as Claude's Discretion in CONTEXT.md; needs a visual UAT check, easy to adjust post-ship without touching data logic |
| A2 | Registry physically lives in a new standalone file (`productRegistry.js`) rather than inline in `node_helper.js` | Architecture Patterns / Recommended Project Structure | Low-Medium — a pure code-organization choice (also Claude's Discretion per CONTEXT.md); if wrong, easy to move without touching the registry's shape or ERO's fetch/parse logic |
| A3 | `products` socket-request keys are named identically to the `defaults:` config flags (e.g. `products.showExcessiveRain`), rather than a separate id→flag translation | Architecture Patterns / Pattern 4 | Low — internal wire-format choice; D-06 only specifies the object must be nested, not the exact key-naming convention inside it; a mismatch would surface immediately as "toggle has no effect," easy to catch in UAT |
| A4 | Disabled products should be excluded from `anyStale` (Pitfall 5's recommendation) | Common Pitfalls / Pitfall 5 | Low-Medium — this is one of CONTEXT.md's two explicit "Claude's Discretion" items; if the planner/user prefers a different resolution, this is a one-line change confined to the `if (this._products.showExcessiveRain)` gate boundary |

## Open Questions (RESOLVED)

1. **Does `outlook`'s "High" tier ever appear live?** — **RESOLVED** (accepted as structurally-verified-only; recorded in plan 14-05) STACK.md's earlier research session (2026-08-15) noted no live polygon carried `dn: 4`/High at fetch time, only inferring its existence from the service description. This session's `drawingInfo.renderer` metadata confirms the legend entry exists (`"label": "High (At Least 70%)"`, `"values": [["4"]]`), but no live *feature* with `dn: 4` was observed either session.
   - What we know: The tier is defined in the service schema and legend.
   - What's unclear: Whether the mapping code will ever be exercised against a real `dn: 4` feature before a genuine High-risk day occurs.
   - Recommendation: Treat as structurally correct (schema-verified) rather than requiring a live-feature UAT pass before shipping; this mirrors how WSSI-03's out-of-season empty-result handling is already accepted as structurally-verified-only in REQUIREMENTS.md's quality notes.

2. **Exact wire-key naming for the `products` object (A3 above).** — **RESOLVED** (flag-keyed `products.showExcessiveRain` adopted; recorded in plan 14-03) CONTEXT.md's D-06 mandates the nesting but not the internal key convention.
   - What we know: A `products: {...}` object must exist; `showExcessiveRain` is the confirmed frontend config-flag name (from ROADMAP.md/REQUIREMENTS.md's literal requirement text).
   - What's unclear: Whether Phases 15-17 will want product-id-keyed (`products.excessiveRain`) rather than flag-keyed (`products.showExcessiveRain`) — a purely internal convention choice.
   - Recommendation: Use the flag name directly as the object key (as shown in Pattern 4) — it requires no translation layer and is the simplest option consistent with D-06's stated goal ("keeps the wire payload from growing... gives Phase 17's `Promise.all` a single list to iterate," which the registry's `configFlag` field already provides independent of this naming choice).

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Backend runtime | ✓ | v25.9.0 (local dev machine) [VERIFIED] | — |
| npm | Dependency management | ✓ | 11.13.0 [VERIFIED] | — |
| `@turf/turf` | Point-in-polygon evaluation | ✓ | 7.3.4 installed [VERIFIED] | — |
| `node-fetch` | HTTP fetch | ✓ | 2.7.0 installed [VERIFIED] | — |
| `mapservices.weather.noaa.gov` (NOAA ArcGIS service) | ERO data source | ✓ | Service currentVersion 11.3 [VERIFIED, live HTTP 200] | None — this is the sole authoritative ERO source; a NOAA outage has no in-project fallback beyond the existing stale-cache/`_isWithinStaleWindow` mechanism, which already applies uniformly |

**Missing dependencies with no fallback:** None.

**Missing dependencies with fallback:** None — every dependency this phase needs is already installed and live-reachable.

*Note: the local dev machine's Node v25.9.0 is far ahead of the project's actual Raspberry Pi deployment target; this table reflects only "is the dependency present and functional in principle," not a Pi-specific version audit, which is out of this phase's scope (no Pi-specific behavior is introduced — ERO uses the identical fetch/parse/turf code paths already running in production on the target hardware).*

## Security Domain

`security_enforcement` is not set in `.planning/config.json`, so per protocol it is treated as enabled.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-------------------|
| V2 Authentication | No | No authentication surface exists anywhere in this module — NOAA endpoints are public, unauthenticated GET requests |
| V3 Session Management | No | No session concept; MagicMirror socket notifications are a local IPC-style channel between two trusted local processes |
| V4 Access Control | No | Single-user local display appliance; no access-control boundary within scope |
| V5 Input Validation | Yes | `products.showExcessiveRain` must be coerced with `=== true` (not merely truthy) before use, exactly matching the existing `proximityWeighting === true` pattern (`node_helper.js:43`) — prevents a malformed/unexpected value type from silently enabling a fetch path. `lat`/`lon` bounds validation is a pre-existing, documented gap (CONCERNS.md "No Input Validation for Coordinates") that this phase does not need to newly introduce but should not make worse — ERO's `loc` point reuses the same `turf.point([lon, lat])` already constructed once per `getSpcOutlook` call, no new coordinate-handling code path is added |
| V6 Cryptography | No (informational only) | The SHA256 hash in `fetchGeoJsonCached` is a content-fingerprinting cache key, not a security control — no secrets, no integrity/authenticity guarantee is claimed or needed for it. No new cryptographic code is introduced this phase. |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|-----------------------|
| Raw `f=json` reintroducing Web Mercator coordinates into turf as if they were WGS84 degrees (a data-integrity failure, not a classic injection) | Tampering (of geometric interpretation, not of the request itself — NOAA is a trusted source) | `f=geojson` hardcoded non-overridable in `buildArcGisQuery` (Pitfall 2) |
| Malformed/unexpected `products` payload shape from a stale or hand-edited frontend config | Tampering | Defensive `=== true` coercion + default-false on missing keys (Pattern 4) — this module has no untrusted external caller (the socket channel is local-process-to-local-process), so this is a robustness control, not a hard security boundary |
| Unbounded/hanging fetch to `mapservices.weather.noaa.gov` (pre-existing project-wide gap, not new to this phase) | Denial of Service (self-inflicted, event-loop occupancy) | CONCERNS.md already documents "No Network Timeout Configuration" as an existing gap across all fetches, including the new `fetchGeoJsonCached`-mediated ERO calls; out of this phase's scope to fix (D-08's "existing... untouched" spirit extends to not silently expanding this phase to include a timeout refactor), but the planner should not introduce new *untimed* fetch call sites beyond what `fetchGeoJsonCached` already provides |

## Sources

### Primary (HIGH confidence — live-verified this session, 2026-08-18)
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer?f=json` — service-level metadata: 5 layers (Days 1-5), native SR Web Mercator (102100/3857), full ERO category-ladder prose (MRGL/SLGT/MDT/HIGH with percentage thresholds), cadence documentation, "not time enabled"
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0?f=json` — layer-level schema: field list, `drawingInfo.renderer` `dn`→label legend (1-4), `advancedQueryCapabilities`, extent
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query?where=1%3D1&outFields=*&returnGeometry=false&f=geojson` — live feature sample: confirmed `valid_time` partial-window string for Day 1 (`"01Z 08/18/26 - 12Z 08/18/26"`), `dn: 1`, all other fields
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/4/query?...` — Day 5 sample confirming full 12Z-12Z window (`"12Z 08/21/26 - 12Z 08/22/26"`)
- `curl -sI` against the same query endpoint, twice in succession — confirmed `etag: "14910dbc"` present and stable
- `curl` comparison of `f=geojson` vs raw `f=json` on the same query — confirmed WGS84 reprojection occurs only under `f=geojson`; raw `f=json` returns Web Mercator meter-scale `rings`
- `curl` against the query endpoint with `where`/`outFields` omitted — confirmed HTTP 400, `where` is mandatory
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/node_helper.js` (1149 lines, full read) — `extractPolygons`, `evaluatePolygons`, `fetchGeoJsonCached`, the `extended` fork at L836, fire-weather Day 3-8's `DN`-field pattern at L808
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/MMM-SPCOutlook.js` (196 lines, full read) — `defaults{}`, socket send/receive, no-risk gate (L95-113), `risk != "NONE"` render-gate convention (L135)
- `package.json` + `node_modules` inspection + local `node -e` smoke test — confirmed `@turf/turf` 7.3.4, `node-fetch` 2.7.0 installed and functional; `node --version` (v25.9.0), `npm --version` (11.13.0)

### Secondary (MEDIUM confidence)
- `.planning/research/STACK.md`, `.planning/research/PITFALLS.md`, `.planning/research/ARCHITECTURE.md`, `.planning/research/SUMMARY.md` — v2.0 milestone-scoping research (2026-08-15), largely corroborated by this session's live re-verification; one correction applied (ETag presence on the ERO endpoint — see State of the Art)

### Tertiary (LOW confidence)
- ERO tier→color hex values (`eroRiskToColor`) — no authoritative NOAA color source consulted this session; recommendation reuses SPC's existing palette as a starting point, flagged in Assumptions Log as A1

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies; existing versions directly inspected in `node_modules`
- Architecture: HIGH — endpoint, schema, CRS, and ETag behavior all live-verified this session; codebase integration points read directly from source with line citations
- Pitfalls: HIGH — `dn`/`DN` collision, CRS mismatch, and ERO-03 display-gate pattern all either live-verified or directly derived from reading existing, already-shipped code (fire-weather Day 3-8, the day1-3 NONE-gate)

**Research date:** 2026-08-18
**Valid until:** 30 days (NOAA ArcGIS service schemas are stable production infrastructure; re-verify if implementation is delayed past mid-September 2026)
