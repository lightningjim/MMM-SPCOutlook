# Stack Research — v2.0 WPC & CPC Integration

**Domain:** NOAA WPC/CPC hazard product ingestion for point-in-polygon and point-value lookup, layered onto an existing MagicMirror² SPC module
**Researched:** 2026-08-15
**Confidence:** HIGH (every endpoint below was hit with a live HTTP request during this research session; status codes and sample payloads are pasted from real responses, not documentation)

## Bottom Line

**Zero new npm dependencies are required.** Every one of the six requested products is either:
- plain GeoJSON served directly by an ArcGIS `MapServer` (`f=geojson`) — parses with the existing `fetch` + `JSON.parse` path already inside `fetchGeoJsonCached`, or
- a KMZ containing one `.kml` (WPC MPD) — parses with the existing `adm-zip` + `@xmldom/xmldom` + `@tmcw/togeojson` + `xpath` stack, with one code-path caveat (below), or
- a single scalar pixel value from an ArcGIS `ImageServer` `identify` call (HeatRisk) — needs a Web Mercator reprojection, which `@turf/turf` v7.2.0 (already a dependency) provides via `turf.toMercator()`, verified locally (`node -e` call below).

The "minimize dependency tree" constraint is fully satisfiable.

## Recommended Stack

### Data Sources (all verified live, 2026-08-15)

| # | Product | Endpoint | Format | Status |
|---|---------|----------|--------|--------|
| 1 | WPC Day 3–7 US Hazards Outlook | `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{1,4,7}/query?where=1%3D1&outFields=*&f=geojson` | GeoJSON | 200 (all 3 layers) |
| 2 | CPC Day 8–14 US Hazards Outlook | `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{3,6,8}/query?where=1%3D1&outFields=*&f=geojson` | GeoJSON | 200 (all 3 layers) |
| 3 | WPC Excessive Rainfall Outlook (Days 1–3) | `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/{0,1,2}/query?where=1%3D1&outFields=*&f=geojson` | GeoJSON | 200 (all 3 layers) |
| 4 | WPC Winter Weather Outlook (Days 1–3) — via WSSI Overall Impact | `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/{1,2,3}/query?where=1%3D1&outFields=*&f=geojson` | GeoJSON | 200 (all 3 layers) |
| 5 | WPC Mesoscale Precipitation Discussion | Discovery: `https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php` (HTML). Fetch: `https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_{num}_final.kmz` | HTML (discovery) + KMZ→KML (data) | 200 for both |
| 6 | NWS/WPC HeatRisk | `https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify?geometry={x,y,spatialReference:{wkid:102100}}&geometryType=esriGeometryPoint&returnGeometry=false&f=json` | JSON (scalar pixel value + catalog metadata) | 200 |

One important structural discovery: **products 1 and 2 are the same ArcGIS service** (`hazards/cpc_weather_hazards`), just different layer IDs. WPC took over authorship of the Day 3-7 product from CPC in 2019 but both day ranges are still published together in one MapServer (per its own `serviceDescription`). This means Day 3-7 and Day 8-14 can share one fetch pattern and, if useful, one cache-invalidation sweep.

### Supporting Libraries — none needed

| Library | Already present? | Covers |
|---------|-------------------|--------|
| `@turf/turf` v7.2.0 | Yes | `booleanPointInPolygon`, `polygonToLine`, `pointToLineDistance` (existing); **`toMercator()`** (new use, already bundled — verified: `turf.toMercator(turf.point([-90.05,35.15]))` → `[-10024320.14, 4184284.27]`, matches the manual EPSG:3857 formula) |
| `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson`, `xpath` | Yes | KMZ/KML parsing for MPD, same as existing SPC ActiveMD.kmz path |
| `node-fetch` v2 | Yes | All new HTTP fetches (JSON, KMZ binary, and the MPD discovery HTML page) |

## Per-Product Detail

### 1 & 2. WPC Day 3–7 / CPC Day 8–14 US Hazards Outlook

**Schema (verified via live query, `outFields=*`):** every layer (Temperature, Precipitation, Wildfire/Drought, ×2 day-ranges = 6 layers total) shares one field set: `label` (string), `start_date`/`end_date` (epoch ms — the specific day within the window this polygon covers), `idp_filedate`/`idp_ingestdate` (epoch ms — issuance/ingest staleness), `issue_time_dt` (present in schema but returned `null` in every sample — do not rely on it).

**`label` is directly the hazard type as human text — NOT a day identifier or a DN-style numeric code.** Confirmed live values:
- 3-7 Day Temperature: `"Hazardous Heat"`
- 8-14 Day Temperature: `"Extreme Heat"`
- 3-7 Day Precipitation: `"Flooding Possible"`, `"Severe Weather"`, `"Heavy Rain"`, `"Flooding Occurring or Imminent"`
- 3-7 Day Wildfire/Drought: `"Severe Drought"`
- 8-14 Day Wildfire/Drought: `"Rapid Onset Drought Risk"`

This is the opposite of the SPC fire-weather trap (where `LABEL` held a day ID and `DN` held severity) — here `label` is self-describing and there is no severity-tiering field to decode. There is no ranked "None/Marginal/.../High" ladder in this product; it is a flat set of named hazard flags. A location either has a named hazard polygon covering it for a given day-in-window (derivable from `start_date`) or it doesn't. Treat this as presence/absence + hazard name, not a comparator-based tier like `catComparator`.

**Staleness:** `idp_filedate` (ms epoch) is the authoritative "when NOAA generated this GIS file" timestamp; use it the same way `_isWithinStaleWindow` already treats cache-entry timestamps. Confirmed cadence from live `serviceDescription`: **"Daily Monday-Friday at 17:00Z"** — i.e., no weekend updates. A naive stale-window check using a fixed `updateInterval` will misfire on Saturday/Sunday; the roadmap should flag this for its own phase-specific handling (e.g., treat Friday's file as fresh through the weekend).

**ETag:** confirmed present (`etag: "36c6f118"` on a live response) — the existing ETag-first branch in `fetchGeoJsonCached` will engage with zero changes.

**Volume:** small — live counts were 1-27 features per layer, `maxRecordCount: 2000`, no pagination needed.

**What NOT to use:** `outlooks/cpc_8_14_day_outlk` (separate MapServer, confirmed live: layers `"CPC 8-14 Day Temperature Outlook"` / `"CPC 8-14 Day Precipitation Outlook"`) is CPC's standard above/below/near-normal climate outlook, not the hazards product the milestone asks for. Do not confuse the two — they sit in different ArcGIS folders (`outlooks/` vs `hazards/`) despite similar names.

### 3. WPC Excessive Rainfall Outlook (ERO), Days 1–3

**Schema (verified live):** `outlook` (string, self-describing: `"Marginal (At Least 5%)"`, `"Slight (At Least 15%)"`, `"Moderate (At Least 40%)"`), `dn` (integer tier: 1=Marginal, 2=Slight, 3=Moderate — service description confirms a 4th tier, High, exists in the category ladder though no live polygon carried it at fetch time), `issue_time`/`start_time`/`end_time` (human-readable strings, e.g. `"2026-08-16 00:43:00"`), `idp_filedate`/`idp_ingestdate` (epoch ms).

Both a human string (`outlook`) and a numeric tier (`dn`) are present — no ambiguity trap here, and `dn` maps cleanly onto the same Marginal/Slight/Moderate/High ladder the module already encodes elsewhere (`riskToValue`), so this is the easiest of the six products to integrate.

**Bonus:** the service exposes Day 1 through **Day 5** (layers 0-4), not just Days 1-3 — the milestone only asked for Days 1-3 but Day 4-5 are available at zero extra integration cost if useful later.

**Cadence:** confirmed via live `serviceDescription`: Day 1 updates at 0100Z/0830Z/1500Z; Day 2-3 at 0830Z/2030Z. Live `issue_time` values from this session (00:43Z for Day 1, 19:43Z for Day 2/3) are consistent with those cycles.

**ETag:** confirmed present.

### 4. WPC Winter Weather Outlook (Days 1–3) → Winter Storm Severity Index (WSSI) "Overall Impact"

There is no product literally named "WPC Winter Weather Outlook" with Day-1-3 categorical tiers as a standalone service. The correct live analog — confirmed by cross-referencing WPC's own winter weather page — is the **Winter Storm Severity Index (WSSI)**, service `outlooks/wpc_wssi`, layers `Overall_Impact_Day_1` (id 1), `_Day_2` (id 2), `_Day_3` (id 3) (a `Days_1-3` combined layer, id 4, also exists).

**Schema (verified live, one active feature found for "Days 1-3 Snow Amount" at fetch time since it was August/off-season for the Overall Impact layers):** `impact` (string), `component` (string, e.g. `"SNOW_AMOUNT"`), `product`, `valid_time`, `issue_time` (human string, `"2026-08-15 2214Z"`), `start_time`/`end_time`, `idp_filedate`/`idp_ingestdate`.

**Value domain trap:** the service's prose description advertises the impact levels in mixed case ("minor," "moderate," "major," "extreme"), but the live feature payload returned the field in **ALL CAPS**: `"impact": "WINTER WEATHER AREA"`. Do not hardcode a case-sensitive match against the documentation's casing — normalize (`.toUpperCase()`) before comparing. Full domain per the live service description: `WINTER WEATHER AREA` (lowest, "expect winter weather, no real disruption"), `MINOR IMPACTS`, `MODERATE IMPACTS`, `MAJOR IMPACTS`, `EXTREME IMPACTS` (mirrors the same 5-tier ladder shape as `NONE/MRGL/SLGT/ENH/MDT/HIGH` conceptually, but with its own distinct string vocabulary — do not attempt to reuse `valueToRisk`/`riskToColor`).

**Off-season caveat (real, observed):** at fetch time the Day 1/2/3 "Overall Impact" layers (ids 1, 2, 3) returned 0 features each; only the Days-1-3 combined Snow Amount sub-layer (id 9) had 1 feature. This is expected per WPC's own note that the Winter Weather Desk is not staffed through summer — it is not a bug in the fetch, and roadmap/UAT planning should account for this product being legitimately empty most of the year outside cold-season months.

**ETag:** confirmed present.

### 5. WPC Mesoscale Precipitation Discussion (MPD)

This is the product requiring the most departure from the existing SPC pattern, though still with **zero new dependencies**.

**No "ActiveMPD" index exists analogous to SPC's `ActiveMD.kmz`.** SPC's flow (`getMesoscaleDiscussion`) works because SPC publishes one KMZ containing `NetworkLink` entries pointing at each active MD. WPC has no equivalent single index file. The only live discovery mechanism found is scraping `https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php` (plain HTML, 200) for `href="/metwatch/metwatch_mpd_multi.php?md=NNNN&yr=YYYY"` links — at fetch time this returned exactly 2 active MPD numbers (1062, 1063 for yr=2026). This requires a small new helper (regex over fetched HTML, not XML — `xpath`'s namespace-aware KML selector doesn't apply here) but no new library; `node-fetch` + a regex is sufficient.

Each active MPD's KMZ is then at the deterministic URL `https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_{md}_final.kmz` (confirmed 200 for `MPD_1062_final.kmz`, 3142 bytes). Note the `_final` suffix appears even for currently-active MPDs — it is not an indicator of expiry, just WPC's fixed naming convention for the issued product file.

**Parsing trap #1 — the internal KML filename does not match the existing `kmzToKmlfilename` helper's assumption.** That helper derives the KML entry name from the KMZ URL's last path segment (`MPD_1062_final.kmz` → `MPD_1062_final.kml`), which is correct for SPC's KMZs but **wrong for WPC's**: unzipping `MPD_1062_final.kmz` shows the actual internal entry is literally named **`doc.kml`** (plus an unrelated `.xsl` stylesheet file). Calling the existing `extractKmlFromKmz(buffer, kmzToKmlfilename(url))` against a WPC MPD KMZ will throw `'KMZ downloaded has no KML'`. The fix is cheap — either hardcode `"doc.kml"` for the WPC MPD path, or (more robust against WPC changing this convention) use `ZIP.getEntries()` and pick the first entry whose name ends in `.kml` rather than deriving it from the outer filename.

**Parsing trap #2 — hazard/type data is not in KML `<name>` or `<ExtendedData>`, it's inside an HTML table embedded in `<description>` CDATA.** Confirmed via live payload: `<Placemark><name>160013</name>` (this is actually the `ValidStart` timestamp code, not a discussion label — do not reuse the SPC pattern of reading `properties.name` as the display label). The actual useful fields — `MPDType` (e.g., live value: `"Heavy rainfall, Flash flooding likely"`), `IssueTime` (e.g., `"814 PM EDT Sat Aug 15 2026"`), `MPDNumber`, `WFO`, `RFC` — are packed as `<tr><td>KEY</td><td>VALUE</td></tr>` rows inside a raw HTML string in `<description><![CDATA[...]]></description>`. `@tmcw/togeojson`'s `kml()` call (already used by `kmlToGeoJson`) will faithfully copy that whole HTML blob into `properties.description` as one long string — it does not parse the embedded table. Extracting `MPDType` (the field that answers "what hazard is this") requires a small regex against the fixed `<td>MPDType</td>\n<td>VALUE</td>` structure post-hoc — the table markup is consistent and simple enough that a regex is adequate; no HTML-parsing library is needed.

**Point-in-polygon:** once geometry is extracted, the existing `checkInPolygon`/`turf.booleanPointInPolygon` path applies unchanged — the KML's `<MultiGeometry><Polygon>` block converts cleanly via `togeojson`.

**Staleness:** use the `IssueTime` string embedded in the description HTML (human-formatted, e.g. `"814 PM EDT Sat Aug 15 2026"` — will need parsing via the already-vendored `moment`, or simpler: use the outer KMZ's HTTP `Last-Modified`/`etag` headers, which were both present and cheap to check without opening the archive). MPDs are short-fused (WPC documentation: "ideally issued 1-6 hours ahead of time" — MEDIUM confidence, WebSearch-sourced prose, not verified against a NOAA technical spec page) so staleness matters more here than for the multi-day products.

### 6. NWS/WPC HeatRisk — CRITICAL FEASIBILITY VERDICT: **YES, clean point lookup is achievable**

**Verdict: feasible, with the existing stack, at low marginal CPU cost.** This is not a polygon product and does not go through `turf.booleanPointInPolygon` at all — it is answered directly by the ArcGIS `ImageServer`'s `identify` operation, which is a first-class point-query endpoint (not a workaround).

**Evidence (live, this session):**
```
GET https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify
    ?geometry={"x":-10024320.14,"y":4184284.27,"spatialReference":{"wkid":102100}}
    &geometryType=esriGeometryPoint&returnGeometry=false&f=json
→ 200
{
  "value": "3",
  "catalogItems": { "features": [
    { "attributes": { "name": "HeatRisk_5_Mercator", "category": 1, "idp_validtime": 1787140800000, "idp_filedate": ..., "idp_ingestdate": ... } },
    ... 6 more, one per forecast day ...
  ]},
  "catalogItemVisibilities": [1,0,0,0,0,0,0]
}
```
Tested against two independent real points (Memphis, TN and Phoenix, AZ, both in August) — both correctly returned pixel value `"3"` (Red/Major), which is meteorologically plausible for both locations in peak summer.

**Requirements to make this work:**
1. **Reprojection to Web Mercator (EPSG:3857) is mandatory** — passing lat/lon degrees directly (even with `&sr=4326` on the request) returned `"NoData"` in this session; only a native-SR `{x,y,spatialReference:{wkid:102100}}` geometry object returned real pixel values. `turf.toMercator()` (already available via the installed `@turf/turf` v7.2.0) handles this with no new dependency — verified locally.
2. **The service is time-enabled and mosaic-backed with a 7-day (not 1-day) forecast window.** Omitting the `time` parameter returns a "visible" catalog item whose selection order is not reliably date-sorted (observed two different default selections across two otherwise-identical calls). The robust approach is to **omit `time` and read the full `catalogItems.features` + `properties.Values` arrays in one request** (both arrays are index-aligned), then pick the entry matching the desired day by its `idp_validtime` (epoch ms, aligned to 12:00 UTC per calendar day) — this is a *single HTTP round-trip for the full week*, which is better for the RPi CPU/network budget than firing one time-filtered request per day.
3. **Pixel value domain is `0`-`4`**, confirmed against the service's own `minValues`/`maxValues` metadata and matching the documented category ladder: `0`=Green/Little-to-no, `1`=Yellow/Minor, `2`=Orange/Moderate, `3`=Red/Major, `4`=Magenta/Extreme. A `"NoData"` string value (not a number) is the out-of-coverage/error sentinel and must be checked for explicitly before numeric parsing.

**A real trap found in the live data, worth flagging for implementation:** the 7 `catalogItems` entries did **not** represent 7 distinct calendar days — two entries (`HeatRisk_2_Mercator`, `HeatRisk_3_Mercator`) shared the identical `idp_validtime` (both `2026-08-17 12:00:00 UTC`), covering only 6 distinct days across 7 catalog items. This looks like an artifact of the mosaic dataset having a stale/duplicate raster mid-rotation (old forecast cycle's day-2 file not yet evicted). Any per-day picker must **deduplicate by `idp_validtime`, keeping the item with the greatest `idp_filedate`** (most recently ingested) — do not assume array position or count implies "day N."

**Cadence/staleness:** confirmed via live `serviceDescription`: "Data is updated hourly (most recent data should be available at the top of hour)." Use `idp_filedate`/`idp_ingestdate` from the matched catalog item for staleness, same pattern as the other products.

**Integration note:** this endpoint's JSON response shape (`{value, catalogItems, ...}`) is not a GeoJSON `FeatureCollection`. `fetchGeoJsonCached` can still be reused for its ETag/hash caching mechanics (confirmed `etag` header present on the identify response) since it only calls generic `JSON.parse(rawText)` and doesn't validate feature-collection shape — but the downstream `extractPolygons`/`evaluatePolygons`/turf pipeline does not apply at all here; HeatRisk needs its own small parse function, not a reuse of `fetchAndEvaluateHazard`.

## Alternatives Considered

| Recommended | Alternative | Why Not |
|-------------|-------------|---------|
| ArcGIS `hazards/cpc_weather_hazards` MapServer (`f=geojson`) for products 1 & 2 | Raw WPC/CPC shapefile FTP (`ftp.wpc.ncep.noaa.gov`, `cpc.ncep.noaa.gov/products/GIS/`) | Would need a shapefile-parsing dependency (e.g. `shapefile` npm package) plus FTP handling; the ArcGIS service already serves the identical data as native GeoJSON over plain HTTPS with ETag support — strictly better fit for the existing stack |
| `outlooks/wpc_wssi` (WSSI, categorical Overall Impact) for product 4 | `raster/rest/services/outlooks/winter_weather_outlook` (only covers Days 4-7, raster) or `experimental/wpc_winter_storm_outlook` (WSO, Days 1-4, but a *probabilistic* snow/ice-exceedance product, not a categorical risk-tier outlook) | Neither matches "Days 1-3 categorical outlook" as cleanly as WSSI's `Overall_Impact_Day_{1,2,3}` layers, which are genuinely the closest live analog to SPC's Day 1 categorical risk polygon |
| HTML-scrape `metwatch_mpd.php` + deterministic `/kml/mpd/MPD_{n}_final.kmz` for product 5 | IEM (Iowa Environmental Mesonet) shapefile archive/API | IEM is a well-regarded third-party GIS mirror but is not a NOAA first-party endpoint — violates the project's "NOAA SPC, WPC, and CPC endpoints only" constraint (v2.0 PROJECT.md) |
| ArcGIS `NWS_HeatRisk` ImageServer `identify` for product 6 | Nothing — this is the only point-queryable path found | See below |

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|--------------|
| Assuming HeatRisk needs raster/GeoTIFF reading (e.g. `geotiff.js`, `gdal`) | The `identify` operation on the ImageServer already returns the resolved per-point pixel value as JSON — no raster file ever needs to be downloaded or decoded client-side | ArcGIS `identify` REST call (verified above) |
| Passing lat/lon degrees with `&sr=4326` to HeatRisk's `identify` | Verified live: returns `"NoData"` even for points with confirmed data | Reproject to Web Mercator first via `turf.toMercator()`, pass native `wkid:102100` geometry |
| Reusing SPC's `kmzToKmlfilename()` unmodified for WPC MPD KMZs | Verified live: WPC's internal KML entry is always named `doc.kml`, not derived from the outer KMZ filename — the existing helper would throw | Hardcode `"doc.kml"` for the MPD path, or look up the first `.kml` entry via `ZIP.getEntries()` |
| Reading `properties.name` off a WPC MPD's `togeojson`-converted feature as the discussion label (SPC MD pattern) | Verified live: WPC's KML `<name>` holds a `ValidStart` time code, not the discussion type | Regex-extract `MPDType` from the HTML table embedded in `properties.description` |
| `outlooks/cpc_8_14_day_outlk` MapServer for the Day 8-14 *hazards* product | Verified live: this is CPC's standard temperature/precipitation climate outlook (above/below/near normal), a different product from the Day 8-14 *hazards* outlook | `hazards/cpc_weather_hazards` MapServer, layers 3/6/8 |
| Any new npm package for shapefile, raster, or HTML parsing | Every product resolved to GeoJSON, KML, or scalar JSON reachable with the existing `node-fetch` + `@turf/turf` + `adm-zip`/`@xmldom/xmldom`/`@tmcw/togeojson`/`xpath` stack | Regex for the one HTML-table-in-CDATA case (MPD) and the one HTML-link-scrape case (MPD discovery) — both simple, fixed-format, low-risk |

## Installation

```bash
# No new dependencies required for v2.0.
# All six products are servable with the packages already in package.json:
#   @tmcw/togeojson ^7.1.0, @turf/turf ^7.2.0, @xmldom/xmldom ^0.9.8,
#   adm-zip ^0.5.16, node-fetch ^2.6.1, xpath ^0.0.34
```

## Version Compatibility

| Package | Compatible With | Notes |
|---------|------------------|-------|
| `@turf/turf@7.2.0` | `turf.toMercator()` | Confirmed present and working in the currently-installed version via direct `node -e` test in this session — no upgrade needed |
| ArcGIS REST services (`mapservices.weather.noaa.gov`) | `currentVersion: 11.3` (all services queried) | Standard Esri REST API surface (`f=geojson`, `f=json`, `/identify`) — no client SDK required, plain HTTP + `node-fetch` suffices |

## Sources

- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer` — live queried, HTTP 200, full layer/field/sample inspection (products 1 & 2)
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer` — live queried, HTTP 200, full layer/field/sample inspection (product 3)
- `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer` — live queried, HTTP 200, full layer/field/sample inspection (product 4)
- `https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php` and `https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1062_final.kmz` — live fetched, HTTP 200, KMZ downloaded and unzipped locally (product 5)
- `https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer` and its `/identify` operation — live queried against two independent points, HTTP 200 (product 6, feasibility verdict)
- `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/cpc_8_14_day_outlk/MapServer` — live queried to confirm it is a different (non-hazards) product, correctly excluded
- Existing project source: `node_helper.js` (`fetchGeoJsonCached`, `getMesoscaleDiscussion`, `extractKmlFromKmz`, `kmzToKmlfilename`) — read to determine exact integration points and where WPC MPD's KMZ structure diverges from SPC's
- WebSearch (MEDIUM/LOW confidence, used only for discovery/cross-check, not as primary evidence): ERO update-cadence prose cross-checked against live `issue_time` values and found consistent; MPD "1-6 hours ahead" lead-time claim is WebSearch-only and unverified against a NOAA technical document — flagged accordingly above

---
*Stack research for: WPC/CPC hazard product integration (MMM-SPCOutlook v2.0)*
*Researched: 2026-08-15*
