# Architecture Research — v2.0 WPC & CPC Integration + Unified Day Report

**Domain:** MagicMirror² module — backend (`node_helper.js`) + frontend (`MMM-SPCOutlook.js`) over socket notifications
**Researched:** 2026-08-15
**Confidence:** HIGH on existing-code claims (full source read, line-cited). MEDIUM on new-product endpoint shapes (WebSearch-verified against multiple independent NOAA sources — `idpgis.ncep.noaa.gov`, `mapservices.weather.noaa.gov`, `noaa.hub.arcgis.com` — but exact layer IDs / field schemas / query-capability flags are NOT live-verified and need a phase-specific spike before implementation).
**Scope:** Six new WPC/CPC/NWS products, merged day-report payload, `getDom()` rewrite, build sequencing.

---

## 0. What Changed Since the v1.2 Baseline (superseded research)

`.planning/research/ARCHITECTURE.md` previously held v1.2 proximity/stale research (now overwritten by this file — see git history if needed). That research's core lesson carries forward and is cited below: **land backend data shape and validate it via logging before writing any frontend render code that consumes it.**

Current file sizes (verified): `node_helper.js` = 1149 lines, `MMM-SPCOutlook.js` = 196 lines. `package.json` confirms `@turf/turf ^7.2.0`, `node-fetch ^2.6.1` (dynamic-import ESM shim already in place at line 2), `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson`, `xpath`.

---

## 1. Existing Architecture (Baseline, Verified)

```
┌──────────────────────────────────────────────────────────────────────┐
│  Frontend (browser) — MMM-SPCOutlook.js                              │
│  defaults (L2-8) → start() (L10-17) sends GET_SPC_DATA on load +     │
│  setInterval(updateInterval*60000)                                    │
│  socketNotificationReceived (L19-27) → this.spcrisk = payload[0]     │
│                                        this.mds     = payload[1]     │
│  getDom() (L35-195): loading/error/no-risk gates, then per-product   │
│    sections: stale banner → MD banner → day1 → day2 → day3 →         │
│    (if extended) day4..day8 → fireWeather (day1-2 always, day3-8     │
│    if extended)                                                      │
│  Helpers: proximityBadge (L81-89), cigLabel (L41-46),                │
│    cigLabelFromTierString (L49-54), fireRiskToColor (L47),           │
│    hasRenderableProximity/hasAnyRenderableProximity (L60-80)         │
└──────────────────────────────┬─────────────────────────────────────┘
                                │ socket: GET_SPC_DATA / SPC_DATA_RESULT
┌──────────────────────────────▼─────────────────────────────────────┐
│  Backend (Node) — node_helper.js                                     │
│  socketNotificationReceived (L31-49): reads {lat,lon,extended,       │
│    updateInterval,proximityWeighting} → getMesoscaleDiscussion() →   │
│    getSpcOutlook() → sendSocketNotification([outlook, md])           │
│  getSpcOutlook(lat,lon,extended) (L416-1130): sequential per-day,    │
│    per-hazard fetch/evaluate blocks, THEN a hard fork at L836:       │
│      if (!extended) return {day1,day2,day3,fireWeather}   (L836-906)│
│      else            return {day1..day8,fireWeather,day48Risk}      │
│                              (L1021-1124)                            │
│  fetchGeoJsonCached(url) (L260-320): ETag-first / SHA256-fallback,   │
│    stale-window fallback keyed on this._updateInterval               │
│  fetchAndEvaluateHazard(url,cigUrl,loc,percComparator,cigComparator, │
│    cigToTier) (L332-400): SPC-specific — fetch prob layer, if risk>0 │
│    conditionally fetch+evaluate a SECOND "CIG" tier layer             │
│  checkInPolygon(geojson,lat,lon) (L1132-1148): used by MD flow only  │
│  computeProximity/deriveLinesIfMissing (L142-201): v1.2 proximity    │
│  State: _geoJsonCache (Map<url,{mode,etag,hash,result,timestamp,     │
│    polys?,lines?}>), _cachedLat/_cachedLon (location-change wipe,    │
│    L419-427), _updateInterval, _proximityWeighting                   │
└────────────────────────────────────────────────────────────────────┘
```

**Existing fetch inventory per cycle** (counted from source, non-extended vs extended):
- Day1/Day2 severe: 4 URLs each (cat + tor + hail + wind) = 8, plus up to 6 more CIG fetches conditionally when a hazard's risk > 0 (tor/hail/wind × 2 days)
- Day3: cat + prob = 2, plus 1 CIG fetch conditionally
- Day4-8 (extended only): 5 URLs
- Fire weather Day1-2: 4 URLs unconditional
- Fire weather Day3-8 (extended only): 12 URLs (2 per day × 6 days)
- Mesoscale Discussion: 1 "active" KMZ + 1 KMZ per currently-active MD (typically 0-3)

**Baseline totals: ~15-17 requests non-extended, ~32-40 requests extended**, before any cache hits reduce it to conditional-GET 304s. This baseline matters for Part A's cost quantification below — six more products is a smaller relative jump than it first appears.

---

## Part A — Backend Integration of the Six New Products

### A.1 — External product shape is fundamentally different from SPC's static files (verified via WebSearch, MEDIUM confidence on specifics)

Every existing SPC fetch target (`day1otlk_cat.lyr.geojson`, etc.) is a **pre-rendered static GeoJSON file** — the whole national polygon layer, downloaded in full, filtered locally by `extractPolygons` + `turf.booleanPointInPolygon`. The six new products are **not** static files of this kind:

| Product | Backing service (verified) | Query model |
|---|---|---|
| WPC Day 3-7 Hazards Outlook | `idpgis.ncep.noaa.gov/.../NWS_Forecasts_Guidance_Warnings/wpc_precip_hazards` and/or `mapservices.weather.noaa.gov/vector/.../hazards/wpc_precip_hazards` (ArcGIS MapServer) | ArcGIS REST `/query` — supports server-side spatial filter |
| CPC Day 8-14 Hazards Outlook | `mapservices.weather.noaa.gov/vector/.../hazards/cpc_weather_hazards` (ArcGIS MapServer) | ArcGIS REST `/query` |
| WPC Excessive Rainfall Outlook | `idpgis.ncep.noaa.gov/.../wpc_precip_hazards` MapServer (day-indexed sublayers, per WPC's own GIS docs) | ArcGIS REST `/query`, likely one layer per day (1/2/3) |
| WPC Winter Weather Outlook | `mapservices.weather.noaa.gov/vector/.../precip/wpc_prob_winter_precip` MapServer | ArcGIS REST `/query` |
| WPC Mesoscale Precipitation Discussion | WPC's MPD product page (`wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php`) — KMZ/KML "active" list pattern not confirmed identical to SPC's `ActiveMD.kmz`, needs a phase-specific spike | Likely KMZ, analogous to existing `getMesoscaleDiscussion()` |
| NWS/WPC HeatRisk | `mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk` (ArcGIS **ImageServer**, i.e. a raster, not a polygon layer) | ArcGIS REST `identify` operation, NOT `/query` (no vector features) |

**This is the load-bearing finding for Part A:** five of the six products are ArcGIS REST services with **server-side spatial query support** (`geometry=<lon>,<lat>&geometryType=esriGeometryPoint&spatialRel=esriSpatialRelIntersects&f=geojson`), and the sixth (HeatRisk) is a raster queried via `identify` at a point. None of them require downloading a national polygon layer and running local `turf.booleanPointInPolygon` the way SPC's static files do — **the server can do the point-in-polygon test itself.**

This should change the implementation approach, not just extend the existing one. Recommend point-server-side querying over the "download whole layer, filter locally" pattern SPC currently uses, for three concrete reasons:
1. **Network cost.** Old research (`git log`) already flagged SPC Day1 cat layer alone as "tens of KB." A point-filtered ArcGIS query response for a single hazard is typically under a few KB (0-1 matching features + their properties). Adding six products via point-query is materially cheaper than adding six more "download the whole country" fetches.
2. **CPU cost.** No local `extractPolygons`/`evaluatePolygons`/turf work needed at all for these six — the response either has a matching feature or doesn't. This is a genuine CPU win over generalizing the existing pattern.
3. **Consistency with the constraint.** PROJECT.md's decision table explicitly notes "ETag/SHA256 cache already skips turf work when data is unchanged, so slow-updating products cost ~one conditional GET per cycle" — point-query pushes that further: even on a cache MISS, there's no turf work to pay for on these six.

Caveat (flag honestly): I could not verify from public search results whether every one of these five vector services has `supportsAdvancedQueries`/spatial-query enabled on the specific sublayer needed (vs., say, being export-only). This needs a live `curl`/browser check against each service's `?f=json` capabilities response early in the implementation phase — treat as MEDIUM confidence, not a blocker, but the first task of Phase 1 (see Part D) should be "confirm point-query works against all 6 live endpoints" before writing product-specific parsers.

### A.2 — Does `fetchAndEvaluateHazard` generalize, or does it need a sibling?

**Needs a sibling abstraction. Do not force-fit `fetchAndEvaluateHazard`.**

`fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator, cigToTier)` (node_helper.js L332-400) encodes two SPC-specific assumptions that don't hold for the new products:
1. It downloads a full polygon layer and calls `extractPolygons`/`evaluatePolygons` against a local `loc` point — the point-query products don't need this at all.
2. Its defining behavior is the **conditional second fetch**: "if risk > 0, also fetch a CIG confidence-tier layer." CIG tiers are an SPC tornado/hail/wind-specific concept. None of the six new products have a documented analogous two-fetch pattern.

Recommend a new sibling, e.g. `fetchAndEvaluatePointQuery(url, loc, parseFeature)`:
- Reuses `fetchGeoJsonCached(url)` unmodified (see A.3 — it's already generic enough).
- On a fetch hit (`data !== null`): checks `data.features?.length > 0` (vector) or reads `data.value`/`data.results[0].value` (HeatRisk `identify` JSON shape — verify exact field name live). No turf call.
- Delegates the "what does this feature mean" step to a small product-specific `parseFeature(feature.properties)` callback (mirrors how `extractPolygons` already takes a `toValue`/`includesFeat` callback pair — same DI pattern, just no polygon math).
- Caches the **parsed result** (not raw polygons) in `_geoJsonCache`, same shape as existing scalar-result cache entries (`{mode, etag, hash, result, timestamp}`) — no schema change needed to the cache Map itself.
- Returns `{ value, raw, stale }`.

This keeps `fetchAndEvaluateHazard` completely untouched (it's still correct and needed for SPC Day1/Day2 tor/hail/wind — zero regression risk there) and adds ONE new function that all six new products share, rather than six bespoke per-product fetch blocks or a forced generalization that adds unused parameters to the existing SPC-specific helper.

**Exception — MPD:** if WPC's MPD "active discussion" list turns out to be KMZ-based (as WPC's own product page suggests, analogous to SPC's `ActiveMD.kmz`), it should reuse the existing `getMesoscaleDiscussion()` pattern (KMZ→KML→GeoJSON→`checkInPolygon`) almost verbatim rather than the point-query sibling — recommend a small `getActiveDiscussions(activeUrl, kmlFilenameFn, lat, lon)` generalization of `getMesoscaleDiscussion` (L209-226) parameterized by URL and product label, called once for SPC MD and once for WPC MPD. This is a **third**, small abstraction, not a stretch of either of the other two.

### A.3 — Is `fetchGeoJsonCached` reusable as-is?

**Yes, unmodified.** It is already fully protocol-agnostic: it does `fetch(url, {headers})` → checks `304`/ETag → falls back to `res.text()` + SHA256 hash comparison → `JSON.parse(rawText)` (L260-320). It doesn't know or care whether the URL is a static `.lyr.geojson` file or an ArcGIS `/query`/`identify` endpoint — both return JSON text. This is confirmed by reading the function body directly; no speculative claim here.

One real risk worth flagging: **ArcGIS REST query/identify endpoints commonly don't emit `ETag` headers on dynamic query responses** (unlike SPC's static files, which do support conditional GET). If so, `fetchGeoJsonCached` will silently fall through to its **SHA256 hash-mode** path (L309-319) for all six new products — which already exists and works, but means every cycle pays one full GET (small payload, but still round-trip latency) rather than getting 304s. This is not a code change, just a cost-model note: **expect these six products to behave like "hash mode, always-fetch" rather than "ETag mode, mostly-304" in practice.** Confirm live; do not assume ETag support without checking response headers from the actual endpoints.

### A.4 — Where day-range assumptions break

Current payload hard-codes exactly `day1`...`day8` as named object keys (plus `fireWeather.day1Text`...`day8Text`). Two of the new products break this directly:

- **CPC Day 8-14 Hazards Outlook** needs `day9`...`day14` — six entirely new day keys that don't exist anywhere in the current schema, named-property or otherwise.
- **WPC Day 3-7 Hazards Outlook** overlaps `day3` (exists) through `day7` (exists, but only populated **when `extended === true`**) — this is the deeper break, covered next.

**The `extended` flag currently gates existence, not just optional detail.** Look at the fork at L836 (`if (!extended) { return {day1,day2,day3,fireWeather} }`): when `extended` is false, `day4`...`day8` are **absent from the payload entirely**, not present-but-empty. PROJECT.md's v2.0 decision table specifies "per-product config toggles, all default false" for the new sources — meaning a user could enable "WPC Day3-7 Hazards" **without** enabling SPC's `extended` flag. That user needs `day4`-`day7` rows to exist and render WPC data, even though the existing code has no code path that produces those keys when `extended === false`.

**This directly answers "is the branching structure still tenable": no.** A binary `if (!extended)` fork made sense when exactly one feature (SPC Day4-8) controlled exactly one day range. With five independent per-product toggles (`spcExtended`, `wpcDay3to7`, `cpcDay8to14`, `wpcERO`, `wpcWinter`) each potentially needing different day-key subsets to exist, a boolean fork (or worse, nested forks — 2^5 = 32 combinations) is not maintainable and directly contradicts the milestone's own stated goal of consolidating toward one merged day-report shape.

**Recommended consolidation:** collapse the two return branches into one. Always build all `day1`...`day14` keys unconditionally (this is cheap — an empty/no-data day object is a handful of scalar fields, not a fetch); gate only the **fetches** per source-specific toggle, not the **shape** of the return object. A day with no enabled sources reporting anything for it simply has an empty `sources: []` and a `summary` of "no data" — the frontend's existing no-risk suppression logic (`hasAnyRenderableProximity`, the "No Severe Weather Risk" gate) generalizes to "does any day have a non-empty `sources` array" rather than checking named fields per day. This removes the branch entirely rather than trying to generalize it into N branches.

### A.5 — Quantified marginal cost on RPi

**Additional HTTP requests per cycle:** Given the point-query architecture (A.1) and per-day-sublayer patterns WPC already documents for ERO/Winter (mirroring SPC's own day1/day2/day3-per-URL convention), estimate:

| Product | Estimated fetches/cycle | Basis |
|---|---|---|
| WPC Day 3-7 Hazards | 1-3 | Single combined-hazard MapServer layer (1) vs. per-hazard-type sublayers (up to 3) — unconfirmed, needs live check |
| CPC Day 8-14 Hazards | 1 | Single MapServer layer analogous to WPC's, by structural analogy |
| WPC Excessive Rainfall (Day 1-3) | 3 | Day-indexed sublayers, matching SPC's own day1/2/3-per-URL convention |
| WPC Winter Weather (Day 1-3) | 3 | Same day-indexed pattern |
| WPC MPD | 1 + N active (typically 0-3) | Directly analogous to existing `getMesoscaleDiscussion()` cost, already proven acceptable on RPi since v1.0 |
| NWS HeatRisk | 1-7 | Single multi-day `identify` call (best case) vs. one call per forecast day (worst case) — needs live verification of whether ImageServer `identify` accepts a time-series/mosaic query |

**Range: roughly 10-18 additional requests per cycle** (using best-case single-fetch-per-product assumptions where structurally plausible), **up to ~24 in the worst case** (per-hazard-type sublayers everywhere + per-day HeatRisk). Against the existing baseline of ~15-40 requests/cycle, this is a **25-60% increase in request count**, not an order-of-magnitude change — because the baseline is already large (SPC alone issues 15-40 requests today).

**Marginal CPU cost:** Near-zero beyond JSON parse + SHA256 hash of small payloads (microseconds on RPi-class ARM cores; the existing code already does this same hash work for every non-ETag SPC fetch, so this isn't new categories of work, just more of the same small operation). The point-query architecture (A.1) **eliminates** the turf point-in-polygon cost these six products would otherwise have added — this is the single biggest cost-avoidance decision available and should be treated as load-bearing for the RPi constraint, not optional polish.

**Marginal network cost:** Small in bytes (point-filtered responses are ~1-5 KB typically vs. the "tens of KB" SPC full-layer downloads), but the **request count** increase does add wall-clock latency proportionally (sequential `await` chains, per the existing CONCERNS.md-documented pattern of sequential rather than parallelized fetches — see A.6).

**Does the current cache design absorb this?** Structurally yes — `_geoJsonCache` is a plain `Map<url, entry>`; adding ~10-24 more keys is trivial memory overhead (each entry is a few scalar fields plus a small `result`, well under 1 KB per entry even generously estimated — total well under 50 KB added to the Map). No redesign needed for the cache **mechanism**.

One real caveat for cache **correctness**, not capacity: if a point-query URL embeds `lat`/`lon` in its query string (required, since the server does the spatial filter), then each location produces a **distinct cache key**. The existing location-change invalidation loop (L419-427: `for (const [url, entry] of this._geoJsonCache) { ...null out result... }`) assumes URLs are location-independent — true for all existing SPC static files, **not** true for these new point-query URLs. Two consequences: (a) the explicit invalidation loop is a no-op for these entries (harmless — a location change naturally produces a fresh cache miss under the new URL, which is actually correct behavior for free), but (b) old entries under the previous location's URL become orphaned and are **never evicted** — an unbounded (if slow) memory leak across repeated location changes over the module's lifetime. Given this is a single long-running process on a typically-fixed-location Pi, and location changes are rare in practice, recommend accepting this as a documented, low-severity risk rather than building LRU eviction now — but it should be an explicit call-out in the phase plan, not silently discovered later.

### A.6 — Existing sequential-fetch pattern still applies (pre-existing, not new)

CONCERNS.md already flags that all existing fetches run sequentially via `await` in a straight-line function body, not `Promise.all`-batched. This pattern will be inherited by however the six new products are wired in. It's out of scope to fix as part of this milestone (not called for in PROJECT.md's target features), but worth noting it compounds: 10-24 more sequential awaited fetches add roughly that many round-trip latencies to `getSpcOutlook()`'s total wall-clock time, which is a UX/staleness concern (how long until `SPC_DATA_RESULT` arrives) more than a CPU concern. Flag as a candidate future-phase item if update latency becomes noticeably long in practice; not a blocker for this milestone.

---

## Part B — Payload Schema for the Merged Day Report

### B.1 — Where precedence/dedup logic lives: **backend**, not frontend

Three concrete reasons, grounded in this codebase's own established pattern (not a generic best-practice claim):

1. **The project already draws this exact boundary once, successfully.** The superseded v1.2 proximity research (cited above) states the principle explicitly: "Frontend stays dumb... a future 'test the math' path can mock the socket payload without bringing turf into the browser bundle." Precedence-across-sources is the same category of domain computation as proximity-across-tiers — it belongs where the domain vocabulary (`riskToValue`, `cigToTier`, and now cross-product hazard-code mappings) already lives, which is `node_helper.js`.
2. **The domain vocabulary needed to rank sources doesn't exist on the frontend and shouldn't be duplicated there.** Deciding "does SPC's Enhanced beat WPC's Severe Thunderstorm hazard code" requires the same kind of lookup tables (`riskToValue`, `cigToTier`) that are already backend-only. Shipping those tables to the frontend to re-derive precedence would violate the DRY principle this codebase already enforces (per PROJECT.md's `fetchAndEvaluateHazard` DRY refactor decision) and risks drift between backend truth and frontend re-derivation.
3. **PROJECT.md's own decision table already commits to this**, unprompted by this research: "Cross-source precedence table derived from research, not assumed... seed example is SPC convective superseding the WPC thunderstorm hazard" is listed as a v2.0 backend-facing decision, not a display decision.

### B.2 — Recommended schema

Two structural moves beyond the current shape: (1) collapse `day1`...`day8` named-property sprawl into a uniform per-day object so `day1`...`day14` don't require 14 hand-written blocks (mirrors the existing `for (let d = 3; d <= 8; d++)` loop pattern already used for fire weather Day3-8, L797-834 and getDom L184-190 — this project already knows how to do N-day loops, just hasn't applied it to the top-level day keys yet); (2) add `summary` (compact-mode data, backend-precomputed, zero frontend logic) alongside `sources` (expanded-mode data, all raw per-product entries, precedence-annotated).

```js
{
  // unchanged top-level staleness flag
  _stale: false,
  _staleAsOf: null,

  // NEW — advisories are NOT day-scoped; see B.3
  advisories: [
    { type: "MD",  product: "SPC Mesoscale Discussion",            text: "MD 1234 in effect" },
    { type: "MPD", product: "WPC Mesoscale Precipitation Discussion", text: "MPD #45 in effect" }
  ],

  // day1..day14 — uniform shape, always present regardless of which
  // per-product toggles are enabled (A.4 consolidation)
  days: {
    "1": {
      dow: "Mon",              // pre-resolved; frontend no longer computes dowToText offsets across 14 days
      summary: {
        // THE compact-mode line — single worst-case entry across ALL axes/sources for this day.
        // Frontend renders this directly; zero precedence logic needed client-side.
        text: "Enhanced Risk",
        color: "e9c188",
        axis: "severeConvective",     // which hazard axis produced the headline
        sourceProduct: "spcCategorical",
        proximity: { value: 4.7, nextTier: "MDT" }   // same {value,nextTier} shape as existing proximity subtree — proximityBadge() reusable verbatim
      },
      // ALL per-product entries, across ALL axes, for expanded/detail mode.
      // Includes non-winning entries so expanded view is fully transparent.
      sources: [
        {
          product: "spcCategorical", label: "SPC Convective",
          axis: "severeConvective", winner: true,
          text: "Enhanced", color: "e9c188",
          raw: { risk: "ENH" },
          proximity: { value: 4.7, nextTier: "MDT" }
        },
        {
          product: "wpcDay3to7", label: "WPC Day 3-7 Severe",
          axis: "severeConvective", winner: false,   // superseded by SPC on same axis
          text: "Severe Thunderstorms", color: "d2ffa6",
          raw: { hazardCode: "SVR" }
        },
        {
          product: "spcTorn", label: "SPC Tornado",
          axis: "severeConvective", winner: null,     // null = not competing (sub-hazard detail, not an axis headline)
          text: "10% (CIG2)", color: null,
          raw: { risk: 0.10, cig: 2 },
          proximity: { value: 2.6, nextTier: "CIG3" }
        },
        {
          product: "wpcERO", label: "WPC Excessive Rainfall",
          axis: "excessiveRain", winner: true,        // different axis — not competing with severeConvective entries
          text: "Slight", color: "f7f690",
          raw: { risk: "SLGT" }
        },
        {
          product: "fireWx", label: "Fire Weather",
          axis: "fire", winner: true,
          text: "Elevated", color: "FF7F00",
          raw: { risk: 1 }
        }
      ]
    },
    "2": { ... },
    ...
    "14": { dow: "Sun", summary: null, sources: [] }   // no data for this day — summary null, not absent key
  },

  fireWeather: { /* deprecated top-level shape — folded into days[N].sources with axis:"fire" (see B.4) */ }
}
```

### B.3 — Mesoscale Discussions and MPDs: NOT day-keyed

MD/MPD are short-fuse, valid-now advisories, not tied to any forecast day — the current code already gets this right by keeping `mds` as a **separate top-level array**, not nested inside `day1`. Recommendation: **preserve and extend this precedent**, don't nest short-fuse products into the day structure just because a merge is happening elsewhere. Concretely: unify the existing `mds` array and the new WPC MPD array into a single top-level `advisories: [{type, product, text}]` array (see schema above), rendered as banner lines above the per-day list — exactly where the stale banner and MD banner already render today (`getDom()` L117-134). This also lets the render code use **one** loop instead of the current MD-only loop plus a new near-duplicate MPD loop.

### B.4 — Fire weather folds into the per-day merge

PROJECT.md's milestone text is explicit: "one block per day merging severe, fire, rainfall, winter, and extended hazards." This is a change from v1.2, where fire weather is its own bottom-of-wrapper section (`getDom()` L172-192), entirely separate from the day1/day2/day3 rows. Under the new schema, fire weather becomes just another `axis: "fire"` entry inside each day's `sources` array (as shown above), and the standalone `fireWeather` top-level object should be **removed**, not kept as a parallel legacy structure — keeping both would reintroduce exactly the kind of dual-representation drift risk this milestone is trying to eliminate.

### B.5 — Socket contract itself should change shape

Current: `sendSocketNotification("SPC_DATA_RESULT", [outlook, md])` — a positional 2-element array (node_helper.js L47; consumed at MMM-SPCOutlook.js L23-24 as `payload[0]`/`payload[1]`). With `advisories` absorbing what `md` used to carry, and the payload growing an order of magnitude in conceptual surface (14 days × sources arrays vs. 3-8 named day objects), recommend switching to a **single named object**: `sendSocketNotification("SPC_DATA_RESULT", { days, advisories, _stale, _staleAsOf })`. This is a small, explicit, one-line change at both the send site and the receive site, but it's a breaking wire-format change worth calling out as its own line item (see New vs. Modified table, Part E) since it touches the socket contract itself, not just payload internals.

---

## Part C — Frontend Render Restructure

### C.1 — Structure: one small dispatcher, two thin render modes sharing one atomic helper layer

```js
getDom() {
  // ... unchanged: loading guard, error guard ...
  // no-risk guard generalizes to: no day has a non-null summary AND advisories is empty

  renderAdvisoryBanner(wrapper, this.spcrisk.advisories);   // unifies old MD-only loop
  renderStaleBanner(wrapper, this.spcrisk._stale, this.spcrisk._staleAsOf);  // unchanged logic, extracted

  for (const dayKey of Object.keys(this.spcrisk.days)) {
    const day = this.spcrisk.days[dayKey];
    if (!day.summary && day.sources.length === 0) continue;  // nothing to show this day
    renderDayBlock(wrapper, dayKey, day, this.detailOn);
  }
  return wrapper;
}

function renderDayBlock(wrapper, dayKey, day, detailOn) {
  wrapper.innerHTML += renderCompactLine(dayKey, day.summary);   // ALWAYS rendered — the headline
  if (detailOn) {
    for (const source of day.sources) {
      wrapper.innerHTML += renderSourceRow(source);              // only in expanded mode
    }
  }
}
```

**How compact and expanded share code, concretely:** they are not two parallel implementations — `renderCompactLine` and `renderSourceRow` both bottom out in the SAME small set of atomic formatters (`colorSpan(text,color)`, `proximityBadge(prox,mode)`, `cigLabel(cig)`), because `summary` and each entry in `sources` are shaped identically (`{text, color, proximity?, raw?}`). The only difference between detail-off and detail-on is **whether the `sources` loop runs at all** — a single boolean branch at the block level, not divergent per-mode rendering logic. This is the direct architectural answer to "how do the two detail levels share code rather than duplicating."

### C.2 — Existing helpers fold in as follows

| Helper | Current role | v2.0 role |
|---|---|---|
| `proximityBadge(prox, mode)` (L81-89) | Formats `day1.proximity?.categorical` etc. | **Unchanged, reused verbatim.** Called on `summary.proximity` (compact) and on each `source.proximity` (expanded) — same `{value, nextTier}` input shape either way. |
| `cigLabel(cig)` (L41-46) | Renders `①②③` next to tor/hail/wind rows | **Unchanged.** Called from `renderSourceRow` only for sources whose `raw.cig` is present (SPC hazard rows). |
| `fireRiskToColor` (L47) | Maps fire integer 0-3 to color | Becomes one of two color tables a new `colorFor(source)` dispatcher picks between (the other being the existing `riskToColor` string-keyed table), keyed on `source.axis === "fire"`. This dispatch is new, small, and prevents every call site from re-implementing "if fire use this table else that one." |
| `hasRenderableProximity`/`hasAnyRenderableProximity` (L60-80) | Noise-floor gating for the old per-field proximity checks | Generalizes to a single `Object.values(day.sources).some(s => hasRenderableProximity(s.proximity))` plus the summary check — same `PROX_MIN_WEIGHT` constant and gating logic, just iterated over the new array shape instead of named fields. |
| `dowToText(day)` (L36-40) | Computes weekday label with mod-7 wraparound | Superseded by backend-precomputed `day.dow` (B.2) — removes the frontend's day-of-week arithmetic entirely, including its existing `if (day >= 7) day -= 7` wraparound, which only handled up to Day 8; a 14-day range needs `day % 7`, and doing this once on the backend avoids duplicating/fixing that logic on the frontend. |

### C.3 — Migration risk and how to contain it

`getDom()` is the single most heavily-verified surface in the project's history — v1.2's own audit records "7/7 live UAT tests pass" and a deliberate byte-identity invariant for the default-off proximity case; CONCERNS.md separately flags "No Unit Tests... Priority: High" for exactly this file. Rewriting it wholesale means every existing behavior must be either faithfully reproduced or deliberately, visibly changed:

- Loading/error/no-risk early-return gates (`getDom()` L91-113)
- Stale banner with relative-time formatting via vendored `moment` (L117-129)
- MD banner (L130-134) → generalizes to `advisories` loop
- Per-day risk/proximity rendering, including the `PROX_MIN_WEIGHT` noise-floor suppression that exists specifically to prevent a documented bug (`day2-none-still-displays`, per the comment at L55-59)
- Day-of-week off-by-one arithmetic, now extended from 8 days to 14
- The `extended` toggle's current effect on which days render at all — semantics changing per Part A.4's consolidation

**Given no legacy path exists for this rewrite (per PROJECT.md's explicit decision — "no third render state"), the safest way to contain this risk is sequencing, not code structure alone: do not touch `getDom()` until the new backend payload has been produced and eyeballed against live data for multiple real-world scenarios first.** This is the direct link into Part D.

---

## Part D — Suggested Build Order

### Recommendation: **YES — six data sources first, in the existing per-product row layout; unified day-report rewrite as a strictly later, separate phase.**

**Phase 1 — Six new data sources, additive, no display rewrite.**
- Backend: implement `fetchAndEvaluatePointQuery` sibling (A.2) + per-product parsers for the 5 point-query products, plus the MPD KMZ-analog helper. Gate every product behind its own config toggle, default `false` (per PROJECT.md decision).
- Frontend: bolt each new product on as its own **new, independent section** in the existing `getDom()` layout — exactly the same low-risk pattern already used successfully for Fire Weather in v1.0/v1.1 (a new bottom-of-wrapper block, zero changes to the existing day1/day2/day3 rendering code).
- Also in this phase: capture real response samples from each live endpoint across a range of actual weather situations. This is the evidence PROJECT.md's own decision table says the precedence table must be "derived from research, not assumed" — Phase 1's live data collection **is** that research, not a separate task.

**Phase 2 — Unified day-report rewrite (backend schema consolidation + `getDom()` rewrite), strictly after Phase 1 is live and stable.**
- Backend: implement `days`/`summary`/`sources`/`advisories` schema (Part B) and the precedence table, now informed by real captured data from Phase 1 rather than assumptions.
- Frontend: the `getDom()` rewrite (Part C), against a payload shape that has already been observed to be correct in production-like conditions.

### Why NOT interleave or reverse the order

**Two categorically different kinds of risk, and mixing them multiplies debugging cost.** Phase 1's risk is *integration risk* — does this external ArcGIS endpoint work as documented, is the field/schema assumption correct, does the point-query capability actually exist on this sublayer (A.1's explicitly-flagged unverified assumption). Phase 2's risk is *regression risk* — does the rewritten, always-fragile `getDom()` correctly reproduce every existing verified behavior (C.3). If both ship in the same phase and something looks wrong in the running module, every bug report requires ruling out **both** layers simultaneously — is the WPC endpoint returning something unexpected, or did the render rewrite mishandle it? Isolating these lets each phase have its own clean verification method: Phase 1 verifies via `Log.info(JSON.stringify(...))` payload inspection against live NOAA data (no UI dependency); Phase 2 verifies via UAT against a payload already known to be correct.

**Rewrite-first (the "do the hard part first" alternative) is strictly worse, not just differently risky.** Without live data from the six new products, the `summary`/`sources`/precedence design would be built against assumed response shapes. When live endpoint quirks surface later — a service needs 3 fetches instead of 1, a field name doesn't match what the docs implied, HeatRisk's `identify` response doesn't support the assumed multi-day query — the payload schema (and the render code that was just built against it) would need reworking **after** the highest-risk, no-legacy-path rewrite has already shipped. That's the most expensive point in the project to discover a schema mistake.

**Fully interleaved (wire each product into the unified render as it's built, one at a time) reintroduces the exact problem this milestone exists to fix.** Building the day-report rewrite incrementally across six+ small touches means there's no single clean before/after cutover point — "when did the old per-product sections stop being used" becomes genuinely ambiguous mid-sequence, and the unified structure ends up accreting the same per-product branching pattern PROJECT.md is explicitly trying to consolidate away from (the `extended`/non-extended fork, generalized to N forks). This is the same anti-pattern flagged in A.4, just relocated to the frontend.

**Practical secondary benefit:** Phase 1 ships six small, independently reviewable, individually toggle-off-able increments (each new product's own section, own config flag) — low blast radius per change, easy to bisect if one product's live endpoint behaves unexpectedly. Phase 2 is then one focused, high-scrutiny effort with a single clear "is this correct" verification pass, rather than six diffuse ones.

---

## Part E — New vs. Modified Components (concrete list for roadmap)

### `node_helper.js`

| Component | Status | Notes |
|---|---|---|
| `fetchGeoJsonCached` | **UNCHANGED** | Already generic enough (A.3); no modification needed |
| `fetchAndEvaluateHazard` | **UNCHANGED** | Stays SPC-tor/hail/wind-specific; do not generalize (A.2) |
| `fetchAndEvaluatePointQuery` | **NEW** | Sibling to `fetchAndEvaluateHazard`; serves all 5 ArcGIS-query-based new products (A.2) |
| `getActiveDiscussions` (generalized `getMesoscaleDiscussion`) | **NEW** (refactor of existing) | Parameterized by URL + label; serves both SPC MD and WPC MPD |
| `getSpcOutlook` extended/non-extended fork (L836) | **REMOVED** | Collapsed into single unconditional-shape return (A.4) |
| Per-day return object construction | **MODIFIED (major)** | `day1`...`day8` named properties → `days["1"]`...`days["14"]` uniform loop-built objects (B.2) |
| Precedence/dedup logic | **NEW** | Backend-only; axis-grouped ranking producing `summary` + `winner`-annotated `sources` (B.1) |
| `socketNotificationReceived` (L31-49) | **MODIFIED (small)** | Reads new per-product toggles from payload; sends single named object instead of positional array (B.5) |
| Fire weather fetch/evaluate logic (L727-834) | **UNCHANGED logic, MODIFIED integration point** | Fetch/evaluate code stays; output folds into `days[N].sources` with `axis:"fire"` instead of a separate `fireWeather` object (B.4) |

### `MMM-SPCOutlook.js`

| Component | Status | Notes |
|---|---|---|
| `proximityBadge`, `cigLabel`, `cigLabelFromTierString` | **UNCHANGED** | Reused verbatim against the new schema's shape-compatible fields (C.2) |
| `hasRenderableProximity`/`hasAnyRenderableProximity` | **MODIFIED (small)** | Iterate over `sources` array instead of named per-day fields |
| `fireRiskToColor` | **MODIFIED (small)** | Becomes one branch of a new `colorFor(source)` dispatcher |
| `dowToText` | **REMOVED** | Superseded by backend-precomputed `day.dow` (C.2) |
| `getDom()` | **REWRITTEN (major, no legacy path)** | Entire function restructured around `days`/`advisories`/detail-toggle (Part C); highest-risk single change in the milestone |
| `renderDayBlock`, `renderCompactLine`, `renderSourceRow`, `renderAdvisoryBanner`, `colorSpan`, `colorFor` | **NEW** | Small render helpers extracted to keep compact/expanded modes sharing code (C.1) |
| `defaults` | **MODIFIED (small)** | New per-product config toggles (all default `false`), plus a `detail`/`detailOn` toggle |
| Socket receive (`socketNotificationReceived`, L19-27) | **MODIFIED (small)** | Reads single named object instead of `payload[0]`/`payload[1]` (B.5) |

---

## Sources

- Direct source read: `node_helper.js` (1149 lines, full read), `MMM-SPCOutlook.js` (196 lines, full read), `package.json`, `.planning/PROJECT.md`, `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md` — all HIGH confidence, verified against actual code with line citations
- [NWS_Forecasts_Guidance_Warnings/wpc_precip_hazards (MapServer)](https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Forecasts_Guidance_Warnings/wpc_precip_hazards/MapServer) — MEDIUM confidence, service exists and documents GeoJSON query support; exact sublayer/field schema not live-verified
- [hazards/wpc_precip_hazards (MapServer)](https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer) — MEDIUM confidence
- [hazards/cpc_weather_hazards (MapServer)](https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer) — MEDIUM confidence
- [NWS_Climate_Outlooks/cpc_8_14_day_outlk (MapServer)](https://idpgis.ncep.noaa.gov/arcgis/rest/services/NWS_Climate_Outlooks/cpc_8_14_day_outlk/MapServer) — MEDIUM confidence
- [NWS_HeatRisk (ImageServer)](https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer) — MEDIUM confidence; confirmed as ImageServer (raster), `identify` operation is the correct point-query mechanism per ArcGIS REST conventions, but exact response field name for the risk value is unverified
- [outlooks/wpc_prob_winter_precip (MapServer)](https://mapservices.weather.noaa.gov/vector/rest/services/precip/wpc_prob_winter_precip/MapServer) — MEDIUM confidence
- [WPC Mesoscale Precip. Discussions](https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php) — LOW-MEDIUM confidence; product page located, exact KMZ "active list" URL/format not confirmed — needs a phase-specific spike, analogous to how SPC's `ActiveMD.kmz` URL is hardcoded today (node_helper.js L210)
- [Day 3-7 U.S. Hazards Outlook — drought.gov](https://www.drought.gov/data-maps-tools/day-3-7-us-hazards-outlook) — supporting context, LOW confidence (not the authoritative GIS source)
- [Day 8-14 U.S. Hazards Outlook — drought.gov](https://www.drought.gov/data-maps-tools/day-8-14-us-hazards-outlook-rapid-onset-drought) — supporting context, LOW confidence
- Prior project research: `.planning/research/ARCHITECTURE.md` (v1.2, superseded by this file, preserved principle: land backend shape before frontend consumes it) — HIGH confidence as an internal precedent

---
*Architecture research for: MMM-SPCOutlook v2.0 WPC & CPC Integration + Unified Day Report*
*Researched: 2026-08-15*
