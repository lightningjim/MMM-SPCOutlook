# Phase 17: NWS/WPC HeatRisk & Parallelized Fetching - Research

**Researched:** 2026-08-31
**Domain:** ArcGIS ImageServer raster `identify` point-query ingestion (a genuinely new code
path — every prior product in this milestone is fetch-GeoJSON-then-`turf.booleanPointInPolygon`)
plus intra-run `Promise.allSettled` batching of six independent product runners inside a single
`getSpcOutlook` invocation.
**Confidence:** HIGH for everything below marked `[LIVE 2026-08-31]` (fetched against the
production endpoint this session) or `[CODE]` (read directly from this repo's current
`main` this session). `[CARRIED: STACK/PITFALLS/FEATURES/SUMMARY]` = unchanged from the
2026-08-15 research round, not re-derived. `[ASSUMED]` = training-knowledge inference, not
verified either session.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**HeatRisk display floor**
- **D-01:** Display floor at category 2 (Moderate); a flat `showMinorHeat` boolean, default
  `false`, drops it to 1.
- **D-02:** The floor is applied frontend-only. The backend always emits the full `day1`–`day7`
  block carrying the raw `0`–`4` category. `showMinorHeat` never enters `SUB_TOGGLES`, never
  enters the `products` object in `buildRequestPayload`, and never reaches `node_helper.js`.
- **D-03:** One shared predicate is the sole source of both the `getDom()` render loop and the
  no-risk short-circuit term (e.g. `heatRiskDaysToRender(payload, showMinorHeat)`).

**NoData, day gaps, and pairing**
- **D-04:** Partial `NoData` is silence; all-days-`NoData` sets `anyStale` and logs once.
- **D-05:** Day gaps are handled position-aware. A tail gap (highest day(s) unresolved) is
  silence with no badge. A gap at Day 1, or any interior gap with resolved days on both sides,
  sets `anyStale` and logs once. Both branches must be mutation-proven separately per 15 D-10.
- **D-06:** Zip before sorting, then guard. Build `{item, value}` tuples from
  `catalogItems.features` and `properties.Values` before any sort. Precondition guard on entry:
  if `properties.Values` is absent, or its length differs from `catalogItems.features`, abandon
  HeatRisk for this poll — emit the zero-valued block, set `anyStale`, log once. Rejected:
  zipping to the shorter length; falling back to the top-level `value` as Day 1.
- **D-07:** `maxDataAgeHours = 12`, applied per item surviving HEAT-04's dedupe. 16 D-15's
  asymmetry carries forward unchanged: a data-age trip sets `anyStale` but is excluded from
  `_staleAsOf`, and that exclusion must be commented at the write site.

**Parallelization**
- **Analysis result, established during discussion — do not re-litigate.** `_inFlight`
  (`node_helper.js:196`, `:1180`) serializes *across* `socketNotificationReceived` invocations,
  not within one; batching inside a single run does not touch it. `_unusableFeatureCount` is a
  monotone counter sampled start-vs-end, and `_oldestStaleAt` is an order-independent min-reduce
  — both survive intra-run concurrency on their own merits. Planning should **verify** this
  rather than assume it (this research does so below — see "Concurrency Safety, Verified").
- **D-08:** `Promise.allSettled`, not `Promise.all`. Each product settles independently; a
  rejection is handled per-product — emit that row's zero-valued block, set `anyStale`, log
  once — while every other product's payload survives.
- **D-09:** All six calls join one flat batch: ERO, WSSI, hazardsOutlook, HeatRisk, spcMD and
  mpd each become one member, replacing both the three named awaits and the `kml-advisory`
  for-loop (which becomes a map over `kind === "kml-advisory"` rows). *Consequence for
  planning:* `advisories[row.id] = …` currently assigns inside the loop; under a batch, results
  must be collected and assigned after settlement.
- **D-10:** PERF-01 is proven by a probe scenario plus a per-run timing log. The scenario drives
  the real path through the existing `_fetch(url, options)` transport seam, records request
  issue order, and asserts a later member's first request is issued before an earlier member's
  response resolves — cleanly mutation-provable per 15 D-10 (revert to sequential awaits → RED
  with a diagnosable message). The log line carries each member's elapsed ms and the batch's
  wall clock.
- **D-11:** DATA-03 is enforced by a load-time identity assertion plus a recorded spot check. A
  fourth validator beside `daySpanOf`/`dayRangeOf`/`dayRangeSpanning`: at module load, assert
  that no two `PRODUCT_REGISTRY` rows share object identity on any value/tier/text/color map,
  throwing with both row ids named. Paired with an explicit spot-check table in phase
  verification covering what identity **cannot** see — a `toValue` closure reading a foreign
  constant directly.

### Claude's Discretion

- Whether HeatRisk gets a `PRODUCT_REGISTRY` row at all, and if so its `kind` name and dispatch
  shape.
- Concurrency depth — product-level fan-out (≤6 concurrent chains, each keeping its internal
  loop sequential) is the default unless planning finds evidence it is insufficient.
- Row wording, per-day row layout, and where the HeatRisk block sits relative to the SPC day
  rows.
- Palette source of truth and its provenance citation.
- Bounding of the once-only log keys introduced by D-04, D-05 and D-06.
- Where the HeatRisk parse/sort/dedupe helper physically lives, and whether the day-offset
  computation reuses the existing `_todayUtcMs()` seam.

### Deferred Ideas (OUT OF SCOPE)

- Flattening concurrency inside the runners (~20 concurrent sockets) — revisit only if Phase
  18's PERF-03 Pi measurement shows the batch is still the bottleneck.
- Parallelizing the existing ~25-hop SPC/fire-weather await chain — explicitly out of scope for
  PERF-01; candidate for v2.x.
- A semaphore-based concurrency cap on the batch.
- Smoothing/hysteresis for HeatRisk's ~2540 m pixel boundary jitter — no turf-side fix; the
  v1.2 `PROX_MIN_WEIGHT` noise-floor precedent is the model if live flicker appears.
- HeatRisk row density during a sustained 7-day heat wave — superseded by Phase 19's rewrite.
- A startup control-query against a known-hot reference point to disambiguate D-04's
  all-NoData case — rejected as over-engineering.
- Per-product staleness UX, National Flood Outlook, `Severe Weather` suppression — all deferred
  from prior phases, unchanged.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HEAT-01 | HeatRisk category (0–4) for Days 1–7 when `showHeatRisk` is enabled | Live `identify` capture confirms `properties.Values[i]` is index-aligned to `catalogItems.features[i]`; the Parse/Sort/Dedupe/Bucket Algorithm section gives the exact zip→sort→dedupe→bucket implementation, reusing the existing `_todayUtcMs()`/`MS_PER_DAY` seam unchanged |
| HEAT-02 | Category attributed to the correct day via valid-time sort, not array order | Live-reconfirmed `[LIVE 2026-08-31]`: catalog order was `2,4,5,7,1,3,6` (not `1..7`), matching Pitfall 7's arbitrary-order finding from 2026-08-15. Also newly confirmed: `idp_validtime` sits at exact `12:00:00.000Z` on every observed item (not midnight), which makes `Math.round((validtime - todayUtcMs)/MS_PER_DAY)` produce the day key **directly**, with no `+1` adjustment — see Day-Offset Arithmetic |
| HEAT-03 | Web Mercator reprojection returns a real category, not `NoData` | `turf.toMercator()` confirmed installed and working locally; live testing this session isolates the true root cause of `NoData` (a spatialReference/coordinate-unit **mismatch**, not `sr=4326` per se) — see Common Pitfalls #2. The locked reprojection approach (`turf.toMercator()` before the call) is confirmed to work end-to-end, live |
| HEAT-04 | Current mosaic tile displayed, not a stale duplicate, on a response with duplicate `idp_validtime` | No live duplicate was observable this session (see Open Questions #1); STACK.md's 2026-08-15 captured duplicate example is the reference case. This session's live data adds a new, load-bearing finding: `catalogItemVisibilities` marks the single scalar `value`'s source tile, **not** "today" (visible index pointed at Day 2, not Day 1) — it is not a reliable per-duplicate discriminator and `idp_filedate` (most recently ingested) is the recommended tiebreak, consistent with STACK.md |
| PERF-01 | New product fetches issued concurrently via `Promise.allSettled` | Exact parallelization site identified: `node_helper.js:2921-2963` (three named awaits + a `kml-advisory` for-loop). Concurrency Safety, Verified section confirms by direct code read that `_unusableFeatureCount`/`_oldestStaleAt`'s write sites are synchronous (no `await` inside their mutation) and therefore safe under `Promise.allSettled` |
| DATA-03 | No label-to-value mapping reused across any of the six new products | `PRODUCT_REGISTRY` currently has **no** load-time identity validator (only `daySpanOf`/`dayRangeOf`/`dayRangeSpanning`, all span-shape validators, not identity checks) — D-11's fourth validator is genuinely new code, not an extension of an existing one. HeatRisk itself introduces no label-to-value map at all (its "value" is a raw numeric category, no vocabulary table), so it cannot itself be a DATA-03 violation source, but its registry row still needs the identity assertion applied to every OTHER row's maps |

</phase_requirements>

## Summary

This phase's research surfaced one finding severe enough to reorder the plan's priorities: **`fetchGeoJsonCached` as it exists today would reject every single HeatRisk `identify` response.** CONTEXT.md's Reusable Assets note ("`fetchGeoJsonCached` works for HeatRisk's ETag/hash caching mechanics unchanged... calls generic `JSON.parse(rawText)` and never validates FeatureCollection shape") was true when STACK.md was researched on 2026-08-15, but Phase 14's WR-08/CR-02 hardening subsequently moved that exact validation *into* `fetchGeoJsonCached` itself (`node_helper.js:2193`, `:2209`: `if (!this._isFeatureCollection(parsed.value)) return rejectBody('not a usable FeatureCollection')`). `_isFeatureCollection` (`node_helper.js:1448-1451`) requires `Array.isArray(body.features)` at the top level. The HeatRisk `identify` response has no top-level `features` key at all (its features live at `body.catalogItems.features`) — every cache-miss poll would therefore call `rejectBody`, meaning HeatRisk could never populate a cache entry and would present as a permanent, silent fetch failure. This is not a hypothetical: verified directly against this session's live capture and the current `main` branch source. See "Architecture Patterns" for the recommended fix (an injectable shape-validator parameter on `fetchGeoJsonCached`, not a duplicate function — this codebase's established anti-duplication convention).

The second major finding refines, rather than overturns, HEAT-03. STACK.md's 2026-08-15 claim ("`sr=4326` returns `NoData` even for points with real data") is real but imprecisely attributed. Live testing this session isolated the actual failure condition: `NoData` results from a **coordinate/spatialReference-unit mismatch** — passing degree-scale numbers while the geometry's `spatialReference.wkid` claims Web Mercator (meter-scale) — not from `sr=4326` as a *correctly formed* request. A well-formed `{x: -97.44, y: 35.22, spatialReference: {wkid: 4326}}` geometry, tested live this session, returned the identical correct payload a Mercator-projected point does. This does not change the plan: HEAT-03 and the ROADMAP's own success criterion both name Web Mercator reprojection via `turf.toMercator()` explicitly, and that remains the correct, locked implementation path — `turf.toMercator()` is confirmed installed (`@turf/turf` `^7.2.0`) and produces correct output locally. The nuance matters only defensively: a caller must keep the geometry's declared coordinates and its declared `spatialReference` in agreement, in either direction.

Third: this session's live capture (`[LIVE 2026-08-31]`, no duplicate `idp_validtime` observed) reconfirms and sharpens Pitfall 7's warning that the top-level `value`/`catalogItemVisibilities` cannot be trusted for "today." In this poll the visible index pointed at `HeatRisk_2_Mercator` (Day 2 by valid-time), not `HeatRisk_1_Mercator` (Day 1/today) — live, concrete evidence that D-06's design (never read the top-level `value`, always zip-then-sort by `idp_validtime`) is correct and necessary, not merely cautious.

Fourth: this session's direct code read confirms CONTEXT.md's parallelization-safety analysis holds. `_unusableFeatureCount`'s two write sites (`node_helper.js:1501`, `:1557`) and `_oldestStaleAt`'s write site (`_noteStaleEntry`, `:1853-1859`) are all synchronous mutations inside `forEach` callbacks with no `await` between the read and the write — under JS's single-threaded event loop, this makes each individual increment/min-reduce atomic with respect to any other concurrently-running runner, so a `Promise.allSettled` batch cannot interleave a torn read-modify-write on either field. `_inFlight` (`:196`, `:1180`) is confirmed to guard only across `socketNotificationReceived` invocations (set once per invocation, checked once per invocation), never touched inside `getSpcOutlook` itself — batching *inside* one `getSpcOutlook` call cannot bypass it because it was never in that call's path to begin with.

Fifth: HeatRisk's day-offset arithmetic can reuse the Hazards Outlook's exact clock-seam pattern (`_todayUtcMs()`, `MS_PER_DAY`, and even `_hazardDayOffset`'s formula verbatim) with no new function needed — and, separately, the exact same "day-offset cache staleness" pitfall Phase 16 discovered (16-RESEARCH.md's headline finding) applies here too and for the identical reason: HeatRisk's day key is derived by comparing a static `idp_validtime` against a live clock, so a naive cache-the-resolved-value write would silently misdate every category by one day per elapsed day with no error. The `_cacheHazardMatches`/`_hazardMatchesFromHits` whitelist pattern (`node_helper.js:391-506`) is the direct, load-bearing analog to copy.

**Primary recommendation:** (1) generalize `fetchGeoJsonCached`'s shape-validator into an optional parameter (default `this._isFeatureCollection`, unchanged for every existing caller) so HeatRisk can pass its own identify-response validator; (2) give HeatRisk its own `PRODUCT_REGISTRY` row, a fourth `kind` (e.g. `"arcgis-identify-point"`), with a sibling runner that reuses `_todayUtcMs()`/`MS_PER_DAY` for day-offset arithmetic and follows the Hazards Outlook's clock-independent cache-write whitelist pattern; (3) fold it, ERO, WSSI, hazardsOutlook, spcMD and mpd into one `Promise.allSettled` batch at `node_helper.js:2921-2963` per D-08/D-09; (4) add D-11's load-time identity assertion as a fourth `productRegistry.js` validator.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| ImageServer `identify` fetch + ETag/hash caching | Backend (`node_helper.js`) | — | `fetchGeoJsonCached` reused via a generalized shape-validator parameter — see Summary's headline finding |
| Web Mercator reprojection (`turf.toMercator()`) | Backend | — | Coordinates are backend-resolved (`lat`/`lon` from config); reprojection happens once per poll before the identify URL is built, never in the browser |
| Parse/sort/dedupe/bucket (zip, sort by `idp_validtime`, dedupe by `idp_filedate`, day-offset) | Backend | — | Pure data transform on the fetch result; no turf/geometry math involved (HeatRisk is the one product in this milestone with no `booleanPointInPolygon` call at all) |
| Freshness (`idp_filedate` vs `maxDataAgeHours = 12`, D-07) | Backend | — | Same `anyStale`/`_oldestStaleAt` asymmetry pattern every other product uses (16 D-15 precedent) |
| Display floor (`showMinorHeat`, D-01/D-02) | Frontend (`MMM-SPCOutlook.js`) | — | D-02 locks this frontend-only; the backend never sees `showMinorHeat` |
| Shared render/gate predicate (D-03) | Frontend | — | `heatRiskDaysToRender(payload, showMinorHeat)` is the single source for both the `getDom()` loop and the no-risk gate term, mirroring the existing `dayRiskCount`/`blockHasRisk`/`hazardsOutlookHasAnyDay` pattern at `MMM-SPCOutlook.js:229-323` |
| Parallelized batch orchestration (PERF-01) | Backend (`getSpcOutlook`) | — | `node_helper.js:2921-2963` is the exact site; no frontend involvement |
| DATA-03 identity assertion (D-11) | Backend (`productRegistry.js`, module-load time) | — | Same "make the invalid state unrepresentable, throw at load time" pattern as `daySpanOf`/`dayRangeOf`/`dayRangeSpanning` (`productRegistry.js:53-74`, `:229-264`) |

## Standard Stack

**No new npm dependency.** Confirmed this session:

```
$ node -e "const turf=require('@turf/turf'); console.log(typeof turf.toMercator)"
function
```

| Capability | Library | Status |
|---|---|---|
| Fetch + ETag/hash cache | `node-fetch` v2 via `fetchGeoJsonCached`, generalized (see Architecture Patterns) | Reused, requires one signature change (backward-compatible default parameter) |
| Web Mercator reprojection | `@turf/turf` v7.2.0, `turf.toMercator()` | Confirmed installed (`package.json` `"@turf/turf": "^7.2.0"`) and functionally correct — `turf.toMercator(turf.point([-97.44, 35.22]))` → `[-10846971.18, 4193818.60]`, `[LIVE 2026-08-31]` locally executed |
| Date arithmetic | None — vanilla `Date`/`Date.UTC`, reusing `_todayUtcMs()` (`node_helper.js:1892`), `MS_PER_DAY` (`:137`) | No new code needed; the day-offset formula already exists as `_hazardDayOffset` (`:1907`) and can be called directly or trivially renamed to something HeatRisk-agnostic |
| Point-in-polygon | Not used | HeatRisk is a scalar raster lookup; `extractPolygons`/`evaluatePolygons`/`turf.booleanPointInPolygon` do not apply at all |

**Installation:** none required.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero new packages. `turf.toMercator()` is already a
function of the installed `@turf/turf` dependency, live-confirmed this session. The Package
Legitimacy Gate protocol has no `npm install` target to run against.

## Endpoint Contract — Live-Verified This Session

`GET https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify`

**Working query-parameter set** (`[LIVE 2026-08-31]`, HTTP 200, tested multiple times):

```
?geometry={"x":<mercatorX>,"y":<mercatorY>,"spatialReference":{"wkid":102100}}
&geometryType=esriGeometryPoint
&sr=102100
&returnGeometry=false
&returnCatalogItems=true
&f=json
```

`returnCatalogItems=true` was tested both present and absent; `catalogItems.features` was
present in the response either way — Esri's default for this service appears to already return
it. **Recommend keeping it explicit anyway** (do not rely on an unconfirmed default), matching
this codebase's convention of never omitting a parameter whose presence changes semantics
elsewhere (Phase 14 D-09's `f=geojson`).

**Live captured response** (Norman, OK — `lat: 35.22, lon: -97.44` — this project's fixed
deployment coordinate; trimmed for brevity, full JSON in scratch during this session):

```json
{
  "objectId": 0, "name": "Pixel", "value": "4",
  "location": { "x": -10846971.18, "y": 4193818.60, "spatialReference": { "wkid": 102100, "latestWkid": 3857 } },
  "properties": { "Values": ["4","3","3","3","4","3","3"] },
  "catalogItems": {
    "objectIdFieldName": "objectid",
    "features": [
      { "attributes": { "objectid": 26635603, "name": "HeatRisk_2_Mercator", "category": 1,
          "idp_ingestdate": 1788217070000, "idp_filedate": 1788217066000, "idp_validtime": 1788264000000 } },
      { "attributes": { "objectid": 26636403, "name": "HeatRisk_4_Mercator", "category": 1,
          "idp_ingestdate": 1788217129000, "idp_filedate": 1788217066000, "idp_validtime": 1788436800000 } },
      { "attributes": { "objectid": 26637203, "name": "HeatRisk_5_Mercator", "category": 1,
          "idp_ingestdate": 1788217214000, "idp_filedate": 1788217066000, "idp_validtime": 1788523200000 } },
      { "attributes": { "objectid": 26634403, "name": "HeatRisk_7_Mercator", "category": 1,
          "idp_ingestdate": 1788213962000, "idp_filedate": 1788213785000, "idp_validtime": 1788696000000 } },
      { "attributes": { "objectid": 26636003, "name": "HeatRisk_1_Mercator", "category": 1,
          "idp_ingestdate": 1788217103000, "idp_filedate": 1788217065000, "idp_validtime": 1788177600000 } },
      { "attributes": { "objectid": 26636803, "name": "HeatRisk_3_Mercator", "category": 1,
          "idp_ingestdate": 1788217173000, "idp_filedate": 1788217066000, "idp_validtime": 1788350400000 } },
      { "attributes": { "objectid": 26637603, "name": "HeatRisk_6_Mercator", "category": 1,
          "idp_ingestdate": 1788217254000, "idp_filedate": 1788217067000, "idp_validtime": 1788609600000 } }
    ]
  },
  "catalogItemVisibilities": [1, 0, 0, 0, 0, 0, 0]
}
```

**Fields confirmed live, index alignment confirmed:**
- Top-level `value` — the pixel category at the **currently visible mosaic tile**, a string
  (`"0"`–`"4"` or the literal string `"NoData"`). **Do not treat as "today's" value** — see
  Common Pitfalls #3.
- `properties.Values` — an array of stringified categories, **index-aligned to
  `catalogItems.features`** in array order (confirmed by cross-checking `Values[0] === "4"`
  against `HeatRisk_2_Mercator`'s own category once independently verified via a single-item
  identify — see Day-Offset Arithmetic below for the full cross-check).
- `catalogItems.features[].attributes.idp_validtime` — epoch ms. **Always exactly `12:00:00.000Z`**
  on every one of 14 features observed across two live sessions (7 today, 7 on 2026-08-15) —
  `epochMs % 86400000 === 43200000` on all of them. This is a new finding this session; STACK.md
  did not note the exact time-of-day alignment.
- `catalogItems.features[].attributes.idp_filedate` — epoch ms, the ingest/publish timestamp.
  Varied slightly across features in this poll (`1788213785000`–`1788217067000`, a ~15-minute
  spread across the 7 items) — **not** uniform across the whole catalog the way Hazards
  Outlook's `idp_filedate` is uniform within one layer. Treat as per-item.
- `catalogItems.features[].attributes.category` — present on every feature, value `1` on all
  seven in this poll. **This is not the pixel category at the query point** — it appears to be
  a fixed per-item mosaic-dataset attribute (possibly "band count" or a raster-catalog category
  unrelated to HeatRisk's 0-4 risk scale). Do not confuse with `properties.Values[i]`, the
  actual per-day risk category. Flagged `[ASSUMED]` — meaning of this field beyond "not the
  risk value" was not confirmed against any documentation this session.
- `catalogItemVisibilities` — an array, length matching `catalogItems.features`, exactly one
  `1` and the rest `0` in every poll observed this session (3 consecutive polls, 1s apart,
  identical result). **Confirmed NOT "today":** the visible index (0) corresponded to
  `HeatRisk_2_Mercator`, whose `idp_validtime` sorts to Day 2, not Day 1. See Common Pitfalls #3.
- No `"NoData"` value or empty `catalogItems.features` was observed at this live, in-coverage,
  in-season coordinate — see the `NoData` reproduction under Common Pitfalls #2 for how that
  sentinel was actually triggered this session.

## Day-Offset Arithmetic — Verified This Session

Sorting the seven live features by `idp_validtime` ascending and computing
`Math.round((idp_validtime - todayUtcMs) / MS_PER_DAY)` against `_todayUtcMs()`'s definition
(`node_helper.js:1892-1895`, UTC midnight of the current day) produces the day key **directly,
with no `+1` adjustment**, for every observed item:

| Sorted by `idp_validtime` | UTC time | `Values[i]` (pre-sort index) | Computed day offset |
|---|---|---|---|
| HeatRisk_1_Mercator | Aug 31 12:00:00Z | 4 | **1** |
| HeatRisk_2_Mercator | Sep 1 12:00:00Z | 4 | **2** |
| HeatRisk_3_Mercator | Sep 2 12:00:00Z | 3 | **3** |
| HeatRisk_4_Mercator | Sep 3 12:00:00Z | 3 | **4** |
| HeatRisk_5_Mercator | Sep 4 12:00:00Z | 3 | **5** |
| HeatRisk_6_Mercator | Sep 5 12:00:00Z | 3 | **6** |
| HeatRisk_7_Mercator | Sep 6 12:00:00Z | 3 | **7** |

(Poll executed 2026-08-31T23:10:56Z; `_todayUtcMs()` at that instant = `2026-08-31T00:00:00Z`.)

This works because every `idp_validtime` sits exactly at `12:00:00.000Z` — half a day past UTC
midnight — so `Math.round(0.5) === 1` (JS always rounds `.5` toward `+Infinity`) lands "today's"
tile at day offset `1`, "tomorrow's" at `2`, etc. **This is the exact same formula
`_hazardDayOffset` already implements** (`node_helper.js:1907-1909`:
`Math.round((epochMs - todayUtcMs) / MS_PER_DAY)`), reusable verbatim or via a trivial rename —
no new arithmetic needs to be written. `_todayUtcMs()`/`MS_PER_DAY` are already exposed as
probe-pinnable seams (16-REVIEW WR-05's fix), so a HeatRisk day-offset probe scenario gets clock
control for free.

**Boundary robustness, reasoned from the fixed 12:00Z alignment (not separately live-tested at
every hour):** because `_todayUtcMs()` only changes at midnight and `idp_validtime` sits at a
constant 12 hours past it, the offset for "today's" tile is `Math.round(0.5) = 1` at every
instant from `00:00:00.000Z` through `23:59:59.999Z` — the mapping is stable across an entire
UTC calendar day, not just at the moment of this capture. `[ASSUMED: reasoned from the fixed
12:00Z alignment observed on 14/14 features across two sessions, not independently verified by
polling at multiple times of day this session]`.

**What a duplicate `idp_validtime` would do to this table:** two features sharing one
`idp_validtime` would compute the identical day offset, and the zip step (before sorting, per
D-06) would carry both `{item, value}` tuples into the same day slot — this is exactly what
HEAT-04's dedupe step must resolve before bucketing, not after (see Common Pitfalls #4).

## Concurrency Safety, Verified

Direct read of the current `main` branch confirms CONTEXT.md's pre-discussion analysis holds,
with exact citations:

- **`_inFlight`** (`node_helper.js:196`, guard checked/set at `:1180-1184`, cleared in a
  `finally` at `:1262-1264`) is read and written **only** inside `socketNotificationReceived`,
  which wraps the single call to `getSpcOutlook` per invocation. `getSpcOutlook` itself
  (`:2336-2970`+) never reads or writes `_inFlight`. A `Promise.allSettled` batch built entirely
  *inside* `getSpcOutlook` therefore cannot observe or bypass this guard — it was never in that
  function's call graph to begin with. This is a structural fact of the current code, not
  something that could regress by an unrelated future edit inside `getSpcOutlook`.
- **`_unusableFeatureCount`** has two write sites, both `this._unusableFeatureCount =
  (this._unusableFeatureCount || 0) + 1` inside synchronous `.forEach()` callbacks with **no
  `await` between the read and the write**: `extractPolygons` (`node_helper.js:1501`) and
  `evaluatePolygonsCollectAll` (`:1557`). Under JS's single-threaded, run-to-completion
  semantics, a synchronous statement inside a `.forEach()` callback cannot be preempted by
  another concurrently-running `async` function's continuation — the two can only interleave at
  an `await` boundary, and neither of these lines contains one. The read site (`getSpcOutlook`,
  `:2348`, `:2968`) samples start-vs-end across the whole run, and because every individual
  increment is atomic with respect to every other runner's increments, the final count after a
  `Promise.allSettled` batch equals the sum of every runner's own increments regardless of
  interleaving order — the property CONTEXT.md's "monotone counter" framing already claimed.
- **`_oldestStaleAt`** has one write site, `_noteStaleEntry` (`node_helper.js:1853-1859`), a
  min-reduce (`if (... entry.timestamp < this._oldestStaleAt) this._oldestStaleAt =
  entry.timestamp`) — also synchronous, also with no `await` inside it. A min-reduce is
  commutative and order-independent by construction, so concurrent callers converging on this
  field cannot produce a result dependent on which runner "won" a race — there is no race to
  win; JS never actually executes two of these statements simultaneously.
- **Where an `await` genuinely does sit inside a runner** (every `fetchGeoJsonCached` call, and
  therefore every `_fetch` call): this is exactly where `Promise.allSettled` intentionally lets
  runners interleave, and none of the three fields above are touched across that boundary in a
  way that depends on a *specific* runner having finished first.

**Net finding:** the parallelization-safety concern flagged in STATE.md's Blockers/Concerns is
resolved, matching CONTEXT.md's pre-discussion analysis — verified by direct code read this
session rather than assumed. No remediation (threading, per-run accumulator objects, a
post-hoc reduce) is needed for `_unusableFeatureCount` or `_oldestStaleAt` specifically. This
does **not** generalize to every field in the file — any future helper-global field added
without the same "synchronous write, no `await` inside the mutation, commutative reduce"
properties would need the same audit repeated, not assumed inherited.

## Standard Stack — Parallelization Site

`node_helper.js:2921-2963`, exact current shape:

```javascript
const eroResult = await this._runArcGisDayProduct(
  PRODUCT_REGISTRY.excessiveRain, loc, catComparator, productToggles
);
const eroPayload = eroResult.payload;
if (eroResult.anyStale) anyStale = true;

const wssiResult = await this._runArcGisDayProduct(
  PRODUCT_REGISTRY.winterImpact, loc, catComparator, productToggles
);
const wssiPayload = wssiResult.payload;
if (wssiResult.anyStale) anyStale = true;

const hazardsResult = await this._runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook, loc, productToggles);
const hazardsPayload = hazardsResult.payload;
if (hazardsResult.anyStale) anyStale = true;

const advisories = { spcMD: [], mpd: [] };
for (const row of Object.values(PRODUCT_REGISTRY)) {
  if (row.kind !== "kml-advisory") continue;
  const advisoryResult = await this._runKmlAdvisoryRow(row, lat, lon, productToggles);
  advisories[row.id] = advisoryResult.entries;
  if (advisoryResult.anyStale) anyStale = true;
}
```

**Recommended shape** (D-08/D-09 — six flat members, `Promise.allSettled`, per-member try/catch
folded into a uniform `{ payload, anyStale }`-or-`{ entries, anyStale }` normalization):

```javascript
// Every runner already returns { payload, anyStale } except _runKmlAdvisoryRow, which
// returns { entries, anyStale } — D-09's own note that kml-advisory rows need one
// normalization point under a flat batch. Wrap kml-advisory calls so every batch member
// settles to the same shape.
const kmlRows = Object.values(PRODUCT_REGISTRY).filter((row) => row.kind === "kml-advisory");

const members = [
  { id: "excessiveRain", run: () => this._runArcGisDayProduct(PRODUCT_REGISTRY.excessiveRain, loc, catComparator, productToggles) },
  { id: "winterImpact",  run: () => this._runArcGisDayProduct(PRODUCT_REGISTRY.winterImpact, loc, catComparator, productToggles) },
  { id: "hazardsOutlook", run: () => this._runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook, loc, productToggles) },
  { id: "heatRisk",      run: () => this._runHeatRiskProduct(PRODUCT_REGISTRY.heatRisk, loc, productToggles) },
  ...kmlRows.map((row) => ({
    id: row.id,
    run: async () => {
      const r = await this._runKmlAdvisoryRow(row, lat, lon, productToggles);
      return { entries: r.entries, anyStale: r.anyStale };
    }
  }))
];

// D-08: allSettled, not all — a rejection from a runner that is DOCUMENTED to never throw
// (every runner already wraps its own fetch/parse/evaluate in a per-item try/catch) must
// still not be allowed to discard five healthy payloads if that documented invariant is
// ever violated by a future edit. Each member's own start-time is logged here (D-10) —
// BEFORE the await, so an overlap probe can observe issue order independent of resolve order.
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

const results = {};
for (let i = 0; i < members.length; i++) {
  const outcome = settled[i];
  if (outcome.status === "fulfilled") {
    results[members[i].id] = outcome.value;
  } else {
    // A runner is documented to never throw; reaching here means that invariant broke.
    // Degrade this member alone — never let it discard its five siblings (D-08).
    Log.error("MMM-SPCOutlook " + members[i].id + ": runner rejected unexpectedly", outcome.reason);
    anyStale = true;
    results[members[i].id] = { payload: null, entries: [], anyStale: true };
  }
}
Log.info("MMM-SPCOutlook: new-product batch settled in " + (this._nowMs() - settleStart) +
         "ms " + JSON.stringify(memberTimings));

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
```

This is illustrative — the planner should confirm exact variable naming against the surrounding
code (`day48Risk`, `catComparator`, etc., already established above this block) rather than
treat this as a literal diff. The load-bearing structural points are: (1) member `run()`
closures are built but not invoked until `Promise.allSettled(members.map(...))`, so nothing
awaits sequentially before the batch; (2) each member's own elapsed time is captured via
`_nowMs()` inside a `finally`, satisfying D-10's per-member timing log; (3) a rejection degrades
only its own member's result, never the whole batch (D-08); (4) `advisories[row.id]` assignment
moves to after settlement (D-09's stated consequence).

## Architecture Patterns

### System Data Flow

```
socketNotificationReceived (GET_SPC_DATA)
  └─ getSpcOutlook(lat, lon, extended, productToggles)
       ├─ [existing ~25-hop sequential SPC/fire-weather chain — UNCHANGED, out of scope]
       │
       └─ NEW PRODUCT BATCH (Promise.allSettled, this phase's PERF-01 target)
            ├─ excessiveRain  ──▶ _runArcGisDayProduct        ──▶ { payload, anyStale }
            ├─ winterImpact   ──▶ _runArcGisDayProduct        ──▶ { payload, anyStale }
            ├─ hazardsOutlook ──▶ _runArcGisHazardWindowProduct ─▶ { payload, anyStale }
            ├─ heatRisk (NEW) ──▶ _runHeatRiskProduct (NEW)
            │      │                 ├─ turf.toMercator(loc)
            │      │                 ├─ fetchGeoJsonCached(identifyUrl, isHeatRiskResponse)  [generalized validator]
            │      │                 ├─ zip(catalogItems.features, properties.Values)  (D-06)
            │      │                 ├─ sort by idp_validtime
            │      │                 ├─ dedupe by idp_validtime, keep max idp_filedate  (HEAT-04)
            │      │                 ├─ bucket via Math.round((validtime - todayUtcMs)/MS_PER_DAY)  (HEAT-01/02)
            │      │                 └─ per-item maxDataAgeHours=12 check (D-07)
            │      └─────────────▶ { payload, anyStale }
            ├─ spcMD (kml-advisory) ──▶ _runKmlAdvisoryRow    ──▶ { entries, anyStale }
            └─ mpd (kml-advisory)   ──▶ _runKmlAdvisoryRow    ──▶ { entries, anyStale }
       │
       └─ assemble payload { ..., heatRisk: {...}, advisories: {spcMD, mpd}, _stale?, _staleAsOf? }
  └─ sendSocketNotification("SPC_DATA_RESULT", [outlook, seq, meta])
       │
MMM-SPCOutlook.js: socketNotificationReceived ─▶ this.spcrisk = outlook ─▶ getDom()
  ├─ heatRiskDaysToRender(payload.heatRisk, showMinorHeat)  (D-03, shared predicate)
  │     ├─ used by no-risk gate term
  │     └─ used by render loop
  └─ renderDayBlock-style day1..day7 rows, floor applied via showMinorHeat (D-01/D-02)
```

### `fetchGeoJsonCached` Generalization — the Headline Fix

**Current signature** (`node_helper.js:2039`): `async fetchGeoJsonCached(url)`. Two call sites
inside it hard-code the shape check (`:2193`, `:2209`):
```javascript
if (!this._isFeatureCollection(parsed.value)) return rejectBody('not a usable FeatureCollection');
```

**Recommended change** — an optional validator parameter, defaulting to the current behavior so
every existing caller (`_runArcGisDayProduct:298`, `_runArcGisHazardWindowProduct:584`,
`fetchAndEvaluateHazard:2230`) needs zero changes:

```javascript
// isValidBody defaults to this._isFeatureCollection so every existing caller (SPC,
// fire weather, ERO, WSSI, Hazards Outlook — every product before this phase) is
// byte-identical in behavior. HeatRisk is the first caller to pass a different
// validator, because its identify response has no top-level `features` array at all
// (features live at body.catalogItems.features) — _isFeatureCollection would reject
// every single HeatRisk response as an unusable body, permanently.
async fetchGeoJsonCached(url, isValidBody = (body) => this._isFeatureCollection(body)) {
  // ...
  if (!isValidBody(parsed.value)) return rejectBody('not a usable body');
  // ... (both call sites, :2193 and :2209, updated identically)
}
```

HeatRisk's own validator, matching this project's "guard against a malformed body, never throw
into the shared catch" convention:

```javascript
function isHeatRiskIdentifyResponse(body) {
  return !!body && typeof body === "object" &&
    typeof body.value === "string" &&
    !!body.properties && Array.isArray(body.properties.Values) &&
    !!body.catalogItems && Array.isArray(body.catalogItems.features);
}
```

**Why a parameter, not a duplicate function:** this codebase's established convention (WR-06's
lesson, repeated in 16-REVIEW: "a fix applied to one twin and not the other") is structural
reuse over copy-paste. `fetchGeoJsonCached` is ~170 lines of ETag/hash/stale-fallback/body-size
logic that must not fork into two maintained copies for one shape-check difference.

### Registry Row & Runner Design

**Recommended `kind`: `"arcgis-identify-point"`** — a fourth kind beside `arcgis-day-layers`,
`kml-advisory`, `arcgis-hazard-window` (Claude's Discretion per CONTEXT.md; this is a proposal).
Dispatch follows the established straight-line pattern: a plain `_runHeatRiskProduct(row, loc,
productToggles)` sibling method, called by name (this row is singular, like
`_runArcGisHazardWindowProduct`, not looped like `kml-advisory`).

Illustrative row shape (matches `productRegistry.js` conventions — arrow-closure fields,
2-space indent, `// D-XX:` comments citing the locked decision each field encodes):

```javascript
const HEATRISK_BASE_URL = "https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer";

// Builds the identify URL. Deliberately its own function, not a bent buildArcGisQuery —
// that builder is hardcoded to /{layerId}/query?...&f=geojson (a MapServer feature-layer
// query); this is an ImageServer identify call with a completely different parameter
// shape (geometry/geometryType/returnGeometry, f=json not f=geojson). Same host allowlist
// instinct as buildArcGisQuery (Phase 14 D-09), applied to a different URL shape.
// mercatorX/mercatorY are already turf.toMercator()'d by the caller — this function does
// no reprojection itself, matching buildArcGisQuery's "URL builder does not fetch or
// transform" role.
function buildHeatRiskIdentifyUrl(mercatorX, mercatorY) {
  if (!(Number.isFinite(mercatorX) && Number.isFinite(mercatorY))) {
    throw new Error("buildHeatRiskIdentifyUrl: mercatorX/mercatorY must be finite numbers");
  }
  // Object key order fixed at (x, y, spatialReference) on every call — PERF-02 requires
  // the query string be byte-stable across polls for the same location so the ETag/hash
  // cache is not defeated by incidental key reordering.
  const geometry = JSON.stringify({ x: mercatorX, y: mercatorY, spatialReference: { wkid: 102100 } });
  return `${HEATRISK_BASE_URL}/identify?geometry=${encodeURIComponent(geometry)}` +
         `&geometryType=esriGeometryPoint&sr=102100&returnGeometry=false&returnCatalogItems=true&f=json`;
}

PRODUCT_REGISTRY.heatRisk = {
  id: "heatRisk",
  kind: "arcgis-identify-point",
  configFlag: "showHeatRisk",
  baseUrl: HEATRISK_BASE_URL,
  buildUrl: buildHeatRiskIdentifyUrl,
  // D-07: hourly cadence ("Data is updated hourly", live serviceDescription, [CARRIED:
  // STACK.md]) — 12h allows ~11 missed cycles.
  maxDataAgeHours: 12
  // Deliberately NO toValue/includesFeat/valueToTier/tierToColor here: HeatRisk carries
  // no label vocabulary at all (its "value" is a raw numeric category straight off the
  // service), so there is nothing for D-11's identity assertion to compare THIS row
  // against — it can only ever be the row every OTHER row's maps are checked against.
};
```

**Parse/sort/dedupe/bucket algorithm** (D-06's zip-before-sort, HEAT-04's dedupe, HEAT-01/02's
bucketing, all in one pass over the response):

```javascript
// D-06: build {item, value} tuples BEFORE any sort, so no positional index survives into
// the sort and desync between catalogItems.features and properties.Values is
// unrepresentable rather than guarded against.
function zipHeatRiskResponse(body) {
  const features = body.catalogItems.features;
  const values = body.properties.Values;
  // D-06 precondition guard: absent or mismatched Values abandons HeatRisk for this poll.
  if (!Array.isArray(values) || values.length !== features.length) {
    return null; // caller emits the zero-valued block, sets anyStale, logs once
  }
  return features.map((f, i) => ({
    attrs: f && f.attributes,
    rawValue: values[i]
  }));
}

// HEAT-04: two items sharing idp_validtime are deduped, keeping the one with the greatest
// idp_filedate (most recently ingested) — the stated tiebreak per STACK.md's live-observed
// duplicate example. catalogItemVisibilities is NOT used for this: this session's live
// data confirms it marks the single tile behind the top-level scalar `value`, not "today",
// and would typically show 0 for BOTH items of a duplicate pair unless one happens to also
// be the globally-visible tile — an unreliable signal for a per-pair decision.
function dedupeByValidTime(tuples) {
  const byValidTime = new Map();
  for (const t of tuples) {
    const vt = t.attrs && t.attrs.idp_validtime;
    if (typeof vt !== "number") continue; // malformed item, drop (contained, not thrown)
    const existing = byValidTime.get(vt);
    if (!existing || (t.attrs.idp_filedate || 0) > (existing.attrs.idp_filedate || 0)) {
      byValidTime.set(vt, t);
    }
  }
  return Array.from(byValidTime.values());
}

// HEAT-01/02: reuses the EXACT formula _hazardDayOffset already implements
// (node_helper.js:1907-1909) — HeatRisk's idp_validtime sits at 12:00Z, which makes this
// formula produce the 1-indexed day key directly (see "Day-Offset Arithmetic" above).
function heatRiskDayOffset(idpValidTimeMs, todayUtcMs) {
  return Math.round((idpValidTimeMs - todayUtcMs) / MS_PER_DAY);
}
```

**Cache-write contract — reuse the Hazards Outlook whitelist pattern, not
`_runArcGisDayProduct`'s.** HeatRisk has the identical "day key is a live-clock comparison
against a static remote timestamp" property Phase 16 discovered for Hazards Outlook
(16-RESEARCH.md's "Freshness Integration" section, the phase's highest-severity finding). The
direct analog to copy is `_cacheHazardMatches`/`_hazardMatchesFromHits`
(`node_helper.js:391-506`): cache only the clock-independent zipped-and-deduped tuples (label→
category, `idp_validtime`, `idp_filedate`) under a field-whitelist that makes a day-offset or
day-key value structurally unable to enter the cache, and recompute `heatRiskDayOffset` fresh on
every poll — cache hit or miss — against that poll's own `_todayUtcMs()`. **Do not** follow
`_runArcGisDayProduct`'s cache-write pattern (`node_helper.js:267-273`, `result: { value,
validTime }`) — that pattern is safe only when the day key is a property of the URL, which it is
for ERO/WSSI but is not for HeatRisk (one URL covers all seven days).

### `getDom()` Shared Predicate (D-03)

Direct analog: `hazardsOutlookHasAnyDay`/`hazardsOutlookHasWindowEntries`
(`MMM-SPCOutlook.js:313-323`), which already solve the identical "one predicate must answer both
the gate and the loop" problem for a different product. HeatRisk's version must additionally
thread the floor (`showMinorHeat`):

```javascript
// D-03: the SOLE source of both the getDom() render loop and the no-risk gate term. A
// Level 1 day with showMinorHeat off must render nothing AND must not suppress the
// all-clear — the same disagreement class the ERO/WSSI/hazardsOutlook gate terms above
// already had to get right (Phase 15's MPD-invisible defect).
const heatRiskDaysToRender = (block, showMinorHeat) => {
  if (!block || typeof block !== "object") return [];
  const floor = showMinorHeat === true ? 1 : 2; // D-01
  const days = [];
  for (let d = 1; d <= 7; d++) {
    const day = block["day" + d];
    if (day && typeof day.category === "number" && day.category >= floor) {
      days.push({ d, category: day.category });
    }
  }
  return days;
};
```

Gate term: `!(this.config.showHeatRisk && heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat).length > 0) &&`
— placed alongside the existing ERO/WSSI/hazardsOutlook terms (`MMM-SPCOutlook.js:378-394`).
Render loop: `if (this.config.showHeatRisk) { for (const { d, category } of
heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat)) { ... } }`.

### D-11 Load-Time Identity Assertion

`productRegistry.js` currently has three load-time validators (`daySpanOf`, `dayRangeOf`,
`dayRangeSpanning`, `:53-74`, `:229-264`), all shape validators — **none check for shared object
identity across rows.** D-11's assertion is genuinely new code, not an extension:

```javascript
// D-11 (DATA-03 enforcement): asserts no two PRODUCT_REGISTRY rows share object identity
// on any value/tier/text/color map. Catches the shared-reference reuse DATA-03's own
// example describes (ERO's dn fed through fire weather's DN table) at load time, on the
// first run, rather than in the field — same "make the invalid state unrepresentable"
// instinct as daySpanOf/dayRangeOf/dayRangeSpanning above.
//
// What this CANNOT see, and must be stated in its own comment: a toValue/includesFeat
// closure that reads a foreign constant directly (e.g. `eroDnToValue[...]` typed inside
// a DIFFERENT row's toValue) rather than sharing the map object by reference. This is a
// point-in-time structural check, not a data-flow analysis — pair it with the recorded
// spot-check table CONTEXT.md's D-11 also requires.
const MAP_FIELDS = ["valueToTier", "tierToText", "tierToColor", "displayColor",
                     "excludedLabels", "droughtLabels", "excludedLabelKeys", "droughtLabelKeys"];
function assertNoSharedRegistryMaps(registry) {
  const seen = new Map(); // object identity -> row id
  for (const [rowId, row] of Object.entries(registry)) {
    for (const field of MAP_FIELDS) {
      const value = row[field];
      if (value === undefined || value === null) continue;
      const prior = seen.get(value);
      if (prior) {
        throw new Error(
          `productRegistry: rows "${prior}" and "${rowId}" share the SAME ${field} object ` +
          `by reference — this is DATA-03's exact failure shape (a label-to-value mapping ` +
          `reused across products). Give "${rowId}" its own ${field}.`
        );
      }
      seen.set(value, rowId);
    }
  }
}
assertNoSharedRegistryMaps(PRODUCT_REGISTRY); // called at module load, same as daySpanOf(...) calls above
```

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Web Mercator reprojection | Manual EPSG:3857 math | `turf.toMercator()` | Already a dependency, confirmed working this session, correct to the same precision the original 2026-08-15 research verified |
| Day-offset-from-today arithmetic | A new date-bucketing function | `_todayUtcMs()` / `MS_PER_DAY` / `_hazardDayOffset`'s exact formula (`node_helper.js:1892-1909`) | Verified this session to produce the correct 1-7 day key directly for HeatRisk's 12:00Z-aligned `idp_validtime`, with no new math |
| ETag/hash HTTP caching | A parallel fetch/cache path for the identify endpoint | `fetchGeoJsonCached`, generalized with an injectable shape validator | The ETag/hash/stale-fallback/body-size logic is ~170 lines already proven correct for five other products; duplicating it is the exact WR-06 anti-pattern this codebase has fixed twice already |
| Concurrent batch orchestration | A semaphore, a task queue, a custom scheduler | `Promise.allSettled` over six member closures | Six independent async operations with no data dependency between them — the textbook `Promise.allSettled` case; no library or custom primitive needed |
| Cross-product map-sharing detection | A manual code-review checklist item | D-11's load-time `assertNoSharedRegistryMaps` | Matches this codebase's own established instinct (three prior load-time validators) — a checklist item is forgettable, a throw at module load is not |

**Key insight:** every piece of genuinely new logic this phase needs (the identify-response
validator, the zip/dedupe/bucket transform, the identity assertion) is a small, isolated
function layered on primitives this codebase already trusts (`turf.toMercator`, `_todayUtcMs`,
`fetchGeoJsonCached`'s ETag machinery). The one piece of *existing* code that must change is
`fetchGeoJsonCached`'s signature — and that change is additive (an optional parameter), not a
rewrite.

## Common Pitfalls

### Pitfall 1: `fetchGeoJsonCached` silently rejects the HeatRisk response as-is (this session's headline finding)

**What goes wrong:** `fetchGeoJsonCached` (`node_helper.js:2039-2212`) validates every parsed
body against `_isFeatureCollection` (`Array.isArray(body.features)`) before returning it as
usable data — on both the ETag-mode and hash-mode cache-miss paths (`:2193`, `:2209`). The
HeatRisk identify response has no top-level `features` array (its features live at
`body.catalogItems.features`). Reusing `fetchGeoJsonCached(url)` unmodified for HeatRisk means
`_isFeatureCollection` returns `false` on every single cache-miss poll, `rejectBody('not a
usable FeatureCollection')` fires every time, and HeatRisk presents as a permanent fetch failure
— `failed: true`, never cached, `anyStale` set forever.

**Why it happens:** CONTEXT.md's Reusable Assets section describes `fetchGeoJsonCached` as
calling "generic `JSON.parse(rawText)` and never validat[ing] FeatureCollection shape," which
was accurate against the 2026-08-15 codebase STACK.md researched. Phase 14's WR-08/CR-02 review
fixes (documented in `14-REVIEW-FIX.md`) subsequently moved exactly that validation into
`fetchGeoJsonCached` itself, to stop a malformed ArcGIS body from reaching `extractPolygons` and
being cached as a false "no risk" read. The fix was correct for every product that existed at
the time; HeatRisk is the first product whose legitimate response shape isn't a FeatureCollection
at all.

**How to avoid:** generalize `fetchGeoJsonCached`'s shape check into an injectable validator
parameter, defaulting to the current `_isFeatureCollection` behavior (see Architecture Patterns).
Do not special-case HeatRisk inside `_isFeatureCollection` itself — that function's contract
("is this a usable GeoJSON FeatureCollection") should stay exactly what its name says.

**Warning signs:** a probe scenario or live UAT check that only exercises "does the fetch
succeed" (a 200 status, a parseable JSON body) without asserting the returned `data` field is
non-null would pass even with this bug present, because `rejectBody` still returns HTTP-200-shaped
data (`{ data: null, cachedResult: null, stale: false, failed: true }`) rather than throwing. The
only way to catch this is to assert `fetchResult.data !== null` (or the higher-level payload
carries a real category) against a live or realistically-shaped fixture.

**Phase to address:** this phase, first — every other HeatRisk plan item depends on this fetch
path actually returning data.

### Pitfall 2: `NoData` is a coordinate/spatialReference-unit mismatch, not `sr=4326` per se

**What goes wrong:** Passing raw degree-scale coordinates (e.g. `x: -97.44, y: 35.22`) while the
geometry's `spatialReference.wkid` claims `102100` (Web Mercator, meter-scale) returns
`"NoData"` and an empty `catalogItems.features` array — live-reproduced this session (see below).
STACK.md's 2026-08-15 framing ("`sr=4326` returns `NoData` even for points with real data")
attributes this to the choice of `sr=4326`, which this session's testing found imprecise: a
**correctly-formed** `sr=4326` request (degree coordinates, `spatialReference.wkid: 4326`,
matching units and declaration) returns the identical correct payload a Mercator-projected point
does.

**Live reproduction this session:**
```
# Degrees mislabeled as Mercator meters (spatialReference.wkid: 102100, x/y in degrees) → NoData
$ curl ".../identify?geometry=%7B%22x%22%3A-97.44%2C%22y%22%3A35.22%2C%22spatialReference%22%3A%7B%22wkid%22%3A102100%7D%7D&geometryType=esriGeometryPoint&returnGeometry=false&f=json"
{"objectId":0,"name":"Pixel","value":"NoData","location":{...},"properties":{},"catalogItems":{"features":[]},"catalogItemVisibilities":[]}

# Well-formed sr=4326 (degrees, spatialReference.wkid: 4326, matching) → correct value
$ curl ".../identify?geometry=%7B%22x%22%3A-97.44%2C%22y%22%3A35.22%2C%22spatialReference%22%3A%7B%22wkid%22%3A4326%7D%7D&geometryType=esriGeometryPoint&returnGeometry=false&f=json"
{"objectId":0,"name":"Pixel","value":"4",...}   # identical payload to the Mercator-projected request
```

**Why it happens:** ArcGIS ImageServer `identify` interprets the geometry's coordinates using
whatever `spatialReference` the caller declares — it does not independently sanity-check that
`x`/`y` magnitude is plausible for the declared SR. Degree-scale numbers under a Mercator
declaration land near the coordinate-system origin (roughly the Gulf of Guinea's meter-equivalent
position), far outside the CONUS extent, and correctly return `NoData` for a location with no
data at that (mis)interpreted position.

**How to avoid:** this does not change the recommended implementation — `turf.toMercator()`
before the call remains correct, required by HEAT-03's own wording and the ROADMAP's success
criterion, and confirmed working live this session. The practical guard: always construct the
geometry object's `x`/`y` and its `spatialReference.wkid` together, from the same reprojection
call, never independently — e.g. never accept a raw `lat`/`lon` pair with a hardcoded
`wkid: 102100` literal elsewhere in the code (a mismatch bug would be silent, since the request
succeeds with HTTP 200 and a well-formed-looking `"NoData"` response).

**Warning signs:** every day comes back `NoData` for an in-coverage, in-season location — this
is exactly D-04's "all-days-`NoData` sets `anyStale`" trigger condition, and this pitfall is the
concrete failure mode D-04 exists to catch.

**Phase to address:** this phase (HEAT-03) — the fix is already the locked approach; this
pitfall entry exists to correct the mental model of *why* it works, not to change what to build.

### Pitfall 3: `value`/`catalogItemVisibilities` do not mean "today" — reconfirmed live, with a concrete example

**What goes wrong:** [CARRIED: PITFALLS.md Pitfall 7, RECONFIRMED LIVE 2026-08-31] Indexing
`properties.Values[0]` or trusting the top-level `value` field as "Day 1" attributes the wrong
day's category. This session's live capture makes this concrete: `catalogItemVisibilities` was
`[1, 0, 0, 0, 0, 0, 0]` — index 0 marked visible — and index 0's feature was
`HeatRisk_2_Mercator`, whose `idp_validtime` sorts to **Day 2** by valid-time, not Day 1. The
top-level `value` ("4") matched `properties.Values[0]` (also "4"), so the two are internally
consistent with each other, but both are the value for tomorrow's tile, not today's.

**Why it happens:** the mosaic dataset's default rendering rule selects whichever raster it
considers "most relevant" for a bare identify call with no `time` filter — this is an ArcGIS
mosaic-rule artifact unrelated to calendar alignment with the query's issue time.

**How to avoid:** D-06's zip-then-sort-by-`idp_validtime` design already avoids this entirely by
never reading `value` or using `catalogItemVisibilities` to select "today" — this pitfall entry
exists to document the live evidence that makes D-06's design necessary, not merely cautious, for
whoever reviews the implementation against this research.

**Warning signs:** any code path that reads `body.value` or `body.properties.Values[0]` directly
without first sorting the full `catalogItems.features` array by `idp_validtime`.

**Phase to address:** this phase (HEAT-02).

### Pitfall 4: duplicate `idp_validtime` — no live example this session; dedupe rule design

**What goes wrong:** [CARRIED: STACK.md, 2026-08-15 live capture] two catalog items sharing an
identical `idp_validtime` — STACK.md's original session observed exactly this
(`HeatRisk_2_Mercator`/`HeatRisk_3_Mercator` both timestamped `2026-08-17 12:00:00 UTC`). This
session's poll (2026-08-31) had **no** duplicate among its 7 items — confirmed by direct
`Set`-size comparison against the 7 `idp_validtime` values.

**How to avoid — dedupe rule, this session's recommendation:** keep the item with the greatest
`idp_filedate` (most recently ingested) when two share `idp_validtime`. `catalogItemVisibilities`
was investigated as a candidate discriminator per CONTEXT.md's research focus — this session's
live evidence (Pitfall 3, above) shows it marks the single tile behind the top-level scalar
`value`, which is typically only ONE index across all seven regardless of whether a duplicate
pair exists elsewhere in the array; for a duplicate pair that isn't also the globally-visible
tile, both members would show `catalogItemVisibilities = 0`, making it an unreliable per-pair
signal. `idp_filedate` (present and independently varying on every item, confirmed this session:
a ~15-minute spread across the 7 items) is the more generally applicable tiebreak and matches
STACK.md's original recommendation.

**Warning signs:** a day row's rendered category flips between two values on consecutive polls
with no corresponding change in `idp_filedate`'s age — would indicate the dedupe is picking
inconsistently (e.g., array order rather than a deterministic field).

**Phase to address:** this phase (HEAT-04). Flagged in Open Questions as needing a synthetic
fixture — no live duplicate was observable this session (see Open Questions #1).

### Pitfall 5: `idp_filedate` is per-item here, not per-layer-uniform (unlike Hazards Outlook)

**What goes wrong:** Phase 16's Hazards Outlook found `idp_filedate` uniform *within* one layer's
feature set (safe to read `features[0]`). HeatRisk's live capture this session shows the
opposite: `idp_filedate` varied by up to ~15 minutes across the 7 catalog items in one response
(`1788213785000` to `1788217067000`). D-07's freshness check must therefore be applied
**per-item**, exactly as CONTEXT.md's D-07 already states ("applied per item surviving HEAT-04's
dedupe") — this pitfall entry confirms that requirement against live data rather than leaving it
as an unverified assumption.

**How to avoid:** never read a single `idp_filedate` off the first item and apply it to the whole
row; check each surviving (post-dedupe) item's own `idp_filedate` against `maxDataAgeHours = 12`
independently.

**Phase to address:** this phase (D-07).

## Code Examples

See "Architecture Patterns" above for the full `fetchGeoJsonCached` generalization,
`buildHeatRiskIdentifyUrl`, `zipHeatRiskResponse`/`dedupeByValidTime`/`heatRiskDayOffset`, the
`Promise.allSettled` batch, `heatRiskDaysToRender`, and `assertNoSharedRegistryMaps` — all
verified against this session's live capture and the current `main` branch source, not
hypothetical sketches.

## State of the Art

| Old Approach (this codebase, ERO/WSSI/Hazards Outlook) | New Approach (this phase) | Why Changed | Impact |
|---|---|---|---|
| `fetchGeoJsonCached(url)` with a hardcoded `_isFeatureCollection` shape check | `fetchGeoJsonCached(url, isValidBody)` with an injectable, defaulted validator | HeatRisk's identify response is not a FeatureCollection at all — the hardcoded check would reject it permanently | One signature change, zero behavior change for every existing caller |
| `_runArcGisDayProduct`'s day↔URL mapping (day key is a property of the URL) | HeatRisk's day key is a property of comparing a static `idp_validtime` against the live clock, from ONE URL covering all 7 days | Structurally identical to Phase 16's Hazards Outlook finding, now confirmed to apply to a second product | Cache-write contract must follow the Hazards Outlook whitelist pattern (`_cacheHazardMatches`), not `_runArcGisDayProduct`'s |
| Three sequential named awaits + a `kml-advisory` for-loop inside `getSpcOutlook` | Six-member `Promise.allSettled` batch | PERF-01 | Cold-start latency for the new-product section no longer grows linearly with enabled toggles |
| Three load-time shape validators in `productRegistry.js` (`daySpanOf`, `dayRangeOf`, `dayRangeSpanning`) | A fourth, identity-based validator (`assertNoSharedRegistryMaps`) | D-11/DATA-03 | Catches a shared-map-object bug (the exact ERO-`dn`-through-fire-weather-`DN` shape DATA-03 names) at module load rather than in the field |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `idp_validtime`'s constant `12:00:00.000Z` alignment (and therefore the "no `+1` needed" day-offset formula) holds at every hour of the day, not just at the moment of this session's capture (23:10 UTC) | Day-Offset Arithmetic | Medium — reasoned from the field being a fixed constant across 14/14 observed features spanning two sessions 16 days apart, not independently polled at multiple hours; if wrong, day1 could misattribute near a UTC-hour boundary. A mutation-proof probe scenario pinning `_nowMs()` at several hours across a day (00:00Z, 12:00Z, 23:59Z) would close this gap cheaply |
| A2 | The `attributes.category` field (value `1` on all 7 observed features) is unrelated to the pixel risk category and safe to ignore | Endpoint Contract | Low — `properties.Values[i]` is confirmed (by cross-reference with the top-level `value` field, which matched `Values[0]`) to be the actual risk category; `category` was not independently documented, but nothing in the recommended implementation reads it |
| A3 | `idp_filedate` (not `catalogItemVisibilities`) is the correct HEAT-04 dedupe tiebreak | Common Pitfalls #4 | Medium — no live duplicate was observable this session to test directly; the recommendation is reasoned from (a) STACK.md's original live-observed duplicate example, which recommended the same tiebreak, and (b) this session's live evidence that `catalogItemVisibilities` marks only one globally-visible tile, not a per-day/per-pair signal. A synthetic fixture (two items sharing `idp_validtime`, differing `idp_filedate`) closes this before implementation |
| A4 | A well-formed `sr=4326` request (matching coordinate units and declared SR) works as reliably as the Mercator path for this endpoint long-term | Common Pitfalls #2 | Low — does not affect the plan (Web Mercator reprojection remains the locked, implemented path per HEAT-03/ROADMAP); this is a corrected mental model only, not a proposed implementation change |

## Open Questions

1. **No live duplicate `idp_validtime` was observable this session to validate the HEAT-04
   dedupe rule end-to-end.**
   - What we know: STACK.md's 2026-08-15 session captured one real duplicate example and
     recommended an `idp_filedate` tiebreak; this session's poll (2026-08-31) had none among its
     7 items.
   - What's unclear: whether `idp_filedate` is reliably present and distinct on every genuine
     duplicate pair (this session only confirms it varies across non-duplicate items).
   - Recommendation: build a synthetic fixture for the probe suite (two zipped tuples sharing
     `idp_validtime`, differing `idp_filedate`) rather than waiting for a live mid-rotation
     window — consistent with this project's established practice (16-RESEARCH.md did the same
     for HAZ-01's zero-live-feature Precipitation layers).

2. **Whether HeatRisk should get its own `PRODUCT_REGISTRY` row (Claude's Discretion, per
   CONTEXT.md) — this research recommends yes, but flags the tradeoff explicitly.**
   - What we know: a row gives D-11's identity assertion and D-07's `maxDataAgeHours` something
     to live on, and matches every other product's pattern; but the row would carry no
     `buildUrl(day)` in the `arcgis-day-layers` sense (HeatRisk's `buildUrl` takes mercator
     x/y, not a day number) and no label vocabulary at all (nothing for D-11's
     `MAP_FIELDS` check to compare against, since HeatRisk introduces zero maps).
   - Recommendation: give it a row anyway (as sketched above) — the `maxDataAgeHours`/`configFlag`
     fields alone justify it, and a standalone function loses the "every product is a registry
     row" invariant `productRegistry.js:450`'s own comment already promises ("Future row
     (HeatRisk) lands in Phase 17").

3. **The exact frontend row wording/placement for `heatRiskDaysToRender`'s output** — explicitly
   left to planning per CONTEXT.md's Claude's Discretion (row wording, per-day layout, block
   placement). Not researched further here since it carries no technical risk.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `mapservices.weather.noaa.gov/experimental/...` reachability | HeatRisk identify fetch | ✓ (live-verified this session, HTTP 200 on every test) | ArcGIS ImageServer REST | `fetchGeoJsonCached`'s existing stale-fallback/hard-failure handling, once its shape-validator is generalized |
| `@turf/turf` `toMercator()` | HEAT-03 reprojection | ✓ (confirmed installed, `^7.2.0`, functionally correct locally) | `^7.2.0` per `package.json` | n/a |
| Node.js `Date`/`Date.UTC` | Day-offset arithmetic | ✓ (built-in) | n/a | n/a |
| `Promise.allSettled` | PERF-01 | ✓ (Node.js built-in since 12.9, this project already targets a modern Node) | n/a | n/a |

No missing dependencies, no fallback needed.

## Validation Architecture

> `workflow.nyquist_validation` is `false` in `.planning/config.json`. This project's verification
> strategy is manual UAT plus mutation-proven probe scenarios (`scripts/probe-payload-resilience.js`),
> not an automated test framework — the same approach every prior v2.0 phase used. This section
> is included per the orchestrator's explicit instruction (plan-checker Dimension 8), adapted to
> that reality rather than a formal test-framework table.

### Probe Harness

| Property | Value |
|----------|-------|
| Harness | `scripts/probe-payload-resilience.js` (custom, no framework — 79 scenarios as of Phase 16 close) |
| Run command | `node scripts/probe-payload-resilience.js` |
| Transport seam | `helper._fetch` (installed via `installHttp(helper, routes)`, `scripts/probe-payload-resilience.js:699-710`) |
| Clock seams | `_nowMs()` (`node_helper.js:1879`), `_todayUtcMs()` (`:1892`) — both already probe-pinnable |
| Route-builder pattern to follow | `hazardsRoutes(overrides)` (`scripts/probe-payload-resilience.js:755-768`) — every OTHER product's URL must answer 200-with-quiet-default so the scenario's own subject is the only thing that can set `anyStale` (WR-02's trap, repeated in every prior phase's scenario set) |

### Phase Requirements → Scenario Map

| Req ID | Behavior | Scenario name (proposed) | Mutation to prove RED |
|--------|----------|---------------------------|------------------------|
| HEAT-01/02 | Categories attributed to correct days after sorting by `idp_validtime` | `heatrisk-day-order-follows-validtime-not-array-order` | Fixture with catalog order `5,7,1,4,6,2,3` (matching STACK.md's live-observed order); break the sort step (index into the unsorted array) → wrong day gets the wrong category, RED with a diagnosable message |
| HEAT-03 | Web Mercator reprojection used, real category not `NoData` | `heatrisk-geometry-uses-mercator-not-raw-degrees` | Assert the constructed URL's geometry contains `wkid":102100` and mercator-scale (not degree-scale) `x`/`y`; break by reverting `buildHeatRiskIdentifyUrl` to pass raw `lat`/`lon` → assertion fails RED |
| HEAT-04 | Duplicate `idp_validtime` resolved to the most-recently-ingested item | `heatrisk-duplicate-validtime-keeps-latest-filedate` | Synthetic fixture: two items, same `idp_validtime`, different `idp_filedate`/`category`; break by reverting the dedupe to "keep first" → wrong category selected, RED |
| D-04/D-05 (NoData/gap handling) | Partial `NoData` silent; all-`NoData` sets `anyStale`; tail gap silent, Day-1/interior gap sets `anyStale` | `heatrisk-partial-nodata-is-silent` / `heatrisk-all-nodata-sets-stale` / `heatrisk-tail-gap-is-silent` / `heatrisk-day1-gap-sets-stale` — **four separate scenarios**, per CONTEXT.md's explicit "both branches must be mutation-proven separately" instruction | Each scenario breaks its own specific branch of the position-aware gap logic |
| D-06 | Zip-before-sort precondition guard | `heatrisk-mismatched-values-length-abandons-poll` | Fixture with `properties.Values.length !== catalogItems.features.length`; break the guard (remove the length check) → a wrong pairing renders instead of the zero-valued block, RED |
| D-07 | `maxDataAgeHours = 12` per surviving item | `heatrisk-stale-item-sets-badge-not-staleAsOf` | Mirrors `hazards-data-age-sets-the-badge-but-not-the-age-figure` (`scripts/probe-payload-resilience.js:4940`) — pin `_nowMs()` 13h past a fixture's `idp_filedate`; break by reverting the age check → no badge, RED |
| PERF-01 | Six-member batch issued concurrently | `new-product-batch-fetches-issue-before-siblings-resolve` | D-10's own design: install a deferred `_fetch` per member (resolves only when manually triggered), assert a later member's request is recorded in `helper._fetch.calls` before an earlier member's deferred resolver is invoked; break by reverting to sequential `await`s → the later member's call never appears before resolution, RED |
| DATA-03 | No two registry rows share a map object by reference | `registry-rejects-shared-label-maps-at-load-time` | Temporarily alias two rows' `valueToTier` to the same object in a scenario-local copy of the registry (not the real `PRODUCT_REGISTRY` — a probe-local fixture), assert `assertNoSharedRegistryMaps` throws with both row ids named; this is a unit-style test of the validator itself, run once, not per-poll |

### Sampling Rate

- **Per task commit:** `node scripts/probe-payload-resilience.js` (full suite — this project has
  no "quick" subset; 79+ scenarios currently run in well under a second, no network I/O)
- **Phase gate:** full suite green, plus the live-UAT check below, before `/bm:verify-work`

### Wave 0 Gaps

- [ ] `heatrisk-*` route-builder helper (`heatRiskRoutes(overrides)`), mirroring `hazardsRoutes` —
      needed before any HeatRisk scenario can be written
- [ ] A `heatRiskIdentifyResponse({...})` fixture builder, mirroring `hazardsFeature({...})`
      (`scripts/probe-payload-resilience.js:778-789`) — builds a full identify-shaped body with
      configurable `catalogItems`/`Values`/duplicate injection
- [ ] A deferred-resolution `_fetch` stub for the PERF-01 overlap scenario — no existing helper in
      this file supports a manually-triggered promise resolution; this is new harness
      infrastructure, not a reuse

### Live UAT Check

Per STATE.md's Blockers/Concerns and CONTEXT.md's seasonal caveat: HeatRisk is a summer product
and today (2026-08-31) is within season — this session's live capture (a real, non-`NoData`
category returned for the deployment's actual coordinate) **is** a positive live confirmation
that HEAT-01/02/03 work end-to-end against production data, unlike Phase 16's zero-feature
Precipitation-layer gap. What this live check does **not** and cannot prove: HEAT-04's dedupe
(no live duplicate was present), D-05's gap-handling branches (this poll had a complete 7-day
catalog, no gap of either kind), or PERF-01 (a single identify call proves nothing about
concurrent issuance). Those three require the synthetic fixtures and the deferred-fetch scenario
listed above — live data cannot substitute for them this session, and per the documented
procedure for location-gated products (STATE.md), there is no location-shift maneuver that would
manufacture a duplicate or a gap on demand; they must be fixture-driven.

## Security Domain

`workflow.security_enforcement` is absent from `.planning/config.json` — treated as enabled
(ASVS L1) per this agent's own default, matching every prior phase's research in this project.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | The generalized `isHeatRiskIdentifyResponse` validator (see Architecture Patterns) before any data reaches the parse/sort/dedupe pipeline — the same role `_isFeatureCollection` plays for every other product |
| V4 Access Control (host allowlisting) | Yes | `buildHeatRiskIdentifyUrl` must apply the same `https://mapservices.weather.noaa.gov/` prefix check `buildArcGisQuery` already enforces (`productRegistry.js:28-30`) — the identify endpoint shares the host, just a different subpath (`/experimental/...`) |
| — Redirect handling | Yes | `redirect: "error"` applies via `withTimeout`/`_fetch` unchanged — this phase adds no new fetch call site outside `fetchGeoJsonCached` |
| — Output encoding (XSS) | No new surface | HeatRisk's payload is entirely numeric (`0`–`4` categories, epoch-ms timestamps) — no free-text label reaches `innerHTML`, unlike every prior phase's hazard-label surface. `escapeHtml` is not load-bearing for this specific product's own rendered content (though any static row-heading text the frontend adds is module-authored, not remote) |
| V6 Cryptography | No | No crypto/secrets surface in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed/hostile identify response (missing `catalogItems`, non-array `Values`, oversized body) | Denial of Service / Tampering | `isHeatRiskIdentifyResponse` shape guard + D-06's zip-length precondition guard + existing `GEOJSON_MAX_BODY_BYTES` bound (unchanged, `node_helper.js:175`, applied uniformly by `fetchGeoJsonCached` regardless of validator) |
| Off-host redirect from a compromised/hijacked NOAA DNS entry | Spoofing | `redirect: "error"` (existing, unchanged) |
| A future edit accidentally reuses another row's label/value map on the HeatRisk row (or any row) | Tampering (data-integrity, DATA-03's own threat model) | D-11's `assertNoSharedRegistryMaps`, throwing at module load |

## Sources

### Primary (HIGH confidence, `[LIVE 2026-08-31]`, this session)
- `https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify` —
  live queried multiple times (Mercator geometry, mismatched-SR reproduction, well-formed
  `sr=4326`, `returnCatalogItems` present/absent), full response captured
- `https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer?f=json` —
  live queried, `serviceDescription`, `minValues`/`maxValues`, `pixelSizeX`/`pixelSizeY`,
  `timeInfo`
- `node -e "require('@turf/turf').toMercator(...)"` — locally executed this session, confirmed
  installed and correct
- `node_helper.js` (this repo, read in full for the sections cited above:
  `:130-260`, `:390-660`, `:520-980`, `:1260-1330`, `:1440-1600`, `:1800-2000`, `:2030-2400`,
  `:2880-2970`) — `[CODE]`
- `MMM-SPCOutlook.js` (this repo, read in full) — `[CODE]`
- `productRegistry.js` (this repo, read in full) — `[CODE]`
- `scripts/probe-payload-resilience.js` (this repo, targeted reads: `:660-790`, `:990-1000`,
  scenario-name index, `:5075-5130`) — `[CODE]`
- `.planning/config.json` — `[CODE]`, confirms `nyquist_validation: false`,
  `security_enforcement` absent (treated as enabled)

### Secondary (carried forward, `[CARRIED]`, not re-verified this session where noted)
- `.planning/research/STACK.md` §"6. NWS/WPC HeatRisk" — original endpoint discovery, the
  duplicate-`idp_validtime` live example, `turf.toMercator()` verification
- `.planning/research/PITFALLS.md` Pitfall 7 (day-index alignment, boundary jitter) and
  Pitfall 12 (parallelization argument) — refined/reconfirmed above where noted
- `.planning/research/FEATURES.md` §A6 — the 5-level ladder's health-impact framing, the
  ImageServer-vs-feature-service architecture finding
- `.planning/research/SUMMARY.md` — HeatRisk's per-product integration table, Decision Queue #7
  (parallelization)
- `16-RESEARCH.md`/`16-PATTERNS.md` (this repo) — the direct structural analog for the
  day-offset-cache-staleness pitfall and its whitelist-based remediation, `_cacheHazardMatches`/
  `_hazardMatchesFromHits` cited by line number above

### Tertiary (LOW confidence)
- None newly introduced this session — every claim above is either live-verified, a direct code
  read, or explicitly carried forward and marked as such.

## Metadata

**Confidence breakdown:**
- Endpoint contract / day-offset arithmetic: HIGH — live-verified this session against the
  production endpoint, cross-checked index alignment and 12:00Z timestamp alignment directly
- `fetchGeoJsonCached` incompatibility finding: HIGH — direct code read of the current `main`
  branch, not inferred; the exact rejecting line and condition are cited
- Concurrency safety (`_inFlight`/`_unusableFeatureCount`/`_oldestStaleAt`): HIGH — direct code
  read of every write site and their synchronous-vs-`await` boundaries, not assumed from
  CONTEXT.md's pre-discussion analysis alone
- HEAT-04 dedupe rule: MEDIUM — no live duplicate observable this session to test the exact rule
  end-to-end; recommendation is reasoned from a carried-forward live example plus this session's
  live evidence about `catalogItemVisibilities`'s actual scope
- Registry row / `kind` design: MEDIUM-HIGH — follows established patterns precisely, but the
  row's existence is Claude's Discretion per CONTEXT.md, not a locked requirement

**Research date:** 2026-08-31
**Valid until:** ~7 days for the live-data-dependent claims (catalog order, specific
`idp_validtime`/`idp_filedate` values will change on WPC's next hourly issuance); ~30 days for
the endpoint contract, schema, and code-structure findings (the `fetchGeoJsonCached` shape
mismatch and the concurrency-safety analysis are structural facts of the current codebase, not
time-sensitive, and remain valid until the cited functions themselves are edited)
