# Pitfalls Research

**Domain:** MagicMirror² weather-risk module — adding WPC Day 3-7 Hazards, CPC Day 8-14 Hazards, WPC Excessive Rainfall Outlook (ERO), WPC Winter Storm Outlook (WSO), WPC Mesoscale Precipitation Discussion (MPD), and NWS/WPC HeatRisk to an existing turf.js point-in-polygon module; rewriting `getDom()` into a unified per-day report.
**Researched:** 2026-08-15
**Confidence:** HIGH (data-format and geometry findings verified against live payloads fetched during research; temporal and merge findings are HIGH for the specific facts observed, MEDIUM for their downstream implications; display-rewrite findings are HIGH, derived directly from reading `MMM-SPCOutlook.js`)

All endpoint URLs, field names, and sample values below were pulled from live NOAA GeoJSON/KMZ/ImageServer responses on 2026-08-15/16, not from documentation. Where docs and payloads disagreed, the payload is quoted.

---

## Critical Pitfalls

### Pitfall 1: WPC/CPC hazard `label` is a free-text hazard *type*, not a severity tier

**What goes wrong:**
The existing SPC pattern (`extractPolygons` in `node_helper.js`) assumes a feature's `LABEL` maps to an ordinal risk value via a lookup table (`TSTM→1 ... HIGH→6`, `ELEV/CRIT/EXTM→1/2/3`). The combined WPC/CPC hazards MapServer (`hazards/cpc_weather_hazards`, layers 0-8, serving BOTH the Day 3-7 and Day 8-14 hazards outlooks from one service) instead returns `label` values like `"Hazardous Heat"`, `"Extreme Heat"`, `"Severe Drought"`, `"Rapid Onset Drought Risk"`, `"Flooding Possible"`, `"Flooding Occurring or Imminent"`, `"Heavy Rain"`, `"Severe Weather"`. There is no ordinal severity encoded anywhere in the schema — each polygon is a hazard-type flag, not a graded risk level. There is nothing analogous to `DN` (fire weather) or `dn` (ERO, see Pitfall 2) to fall back on.

**Why it happens:**
The name "Hazards Outlook" invites the assumption it behaves like SPC's categorical outlook (ranked risk). It doesn't — it's a set of independent boolean hazard flags per day-window, closer to a checklist than a gradient.

**How to avoid:**
Treat each `label` string as an independent boolean hazard indicator, not a point on a severity scale. Build an explicit `label → {hazardType, displayText}` map (not a `label → severity int` map) confirmed against a live payload pull before writing `evaluatePolygons`/comparator logic — a single-max comparator (`Math.max`) is meaningless here since there is no ordering.

**Warning signs:**
Code that does `riskToValue[label] || 0` against this service's `label` field will silently produce `0` for every real feature (since none of these strings are dictionary keys), making the hazard permanently invisible — a false negative that manual UAT is unlikely to catch because "no output" looks identical to "correctly evaluated no risk."

**Phase to address:** Data-source integration (WPC Day 3-7 / CPC Day 8-14 phase)

---

### Pitfall 2: Ordinal-encoding field (`DN`/`dn`) has a different value domain per product — cannot reuse the fire-weather mapping

**What goes wrong:**
Fire weather Day 3-8 encodes severity in `DN` with domain `{5, 8, 10}` (`dnToFireValue` in `node_helper.js`). The WPC Excessive Rainfall Outlook (ERO) also encodes severity in a same-named-in-spirit field — but lowercase `dn`, and with domain `{1, 2, 3, ...}` mapping to `Marginal(1)/Slight(2)/Moderate(3)/...`. Confirmed live: ERO Day 1 layer, `outlook: "Marginal (At Least 5%)"` paired with `dn: 1`; `outlook: "Slight (At Least 15%)"` with `dn: 2`; `outlook: "Moderate (At Least 40%)"` with `dn: 3`. These are unrelated integer domains that happen to share a field-name pattern with fire weather's `DN`.

**Why it happens:**
Both are Esri raster-to-vector conversion byproducts (`DN` = "data number," a generic GIS raster-value field name) — the field name similarity is coincidental, not a shared schema convention across NOAA products. Reusing `dnToFireValue = {5:1, 8:2, 10:3}` against ERO's payload (`dn` values 1/2/3) would map ERO's Moderate(3) to fire weather's Elevated(1) tier — an inverted, silently wrong severity.

**How to avoid:**
Never assume a `DN`/`dn` mapping generalizes across products. Derive and hardcode a distinct mapping per product from a live payload, and prefer parsing the accompanying human-readable field (`outlook`, `label`) when present as a cross-check, since it's less likely to silently shift than a bare integer domain.

**Warning signs:**
Reusing constant names or copy-pasting the `fetchAndEvaluateHazard`/`dnToFireValue` pattern verbatim for ERO without re-deriving the mapping from a live fetch.

**Phase to address:** Data-source integration (ERO phase); also applies narrowly to any future product using `DN`/`dn`.

---

### Pitfall 3: WPC Day 3-7 Hazards Outlook has NO uniform per-day polygon structure — some hazard types cannot be assigned to a single day at all

**What goes wrong:**
This is the pitfall most likely to invalidate the "unified per-day report" premise for two of the six products. Live payload inspection of the combined `hazards/cpc_weather_hazards` MapServer shows radically different temporal granularity *within the same service*:
- **Temperature** and **Wildfire/Drought** layers (3-7 day): a single polygon's `start_date`/`end_date` spans the *entire* 5-day window (e.g. `start_date: 2026-08-18T00:00:00Z`, `end_date: 2026-08-22T00:00:00Z` for one "Hazardous Heat" feature) — there is no way to say "this hazard is on Day 5 specifically," only "sometime in Days 3-7."
- **Precipitation** layer (3-7 day): the *same* label (`"Heavy Rain"`) appears as multiple separate polygon features, each with its own single-day `start_date`/`end_date` window (Aug 18, Aug 19, Aug 21-22 seen live) — this layer *can* be date-bucketed per day.
- The **8-14 day** counterpart layers (Temperature/Precipitation/Wildfire-Drought, same service) showed single features spanning only part of the nominal 7-day window in the live pull (`Extreme Heat`, Aug 23 - Aug 24, a 1-day span inside the nominal Day 8-14 bucket) — granularity is not fixed even within one product across different issuances.

**Why it happens:**
These layers are GIS exports of a hand-drawn forecaster graphic with heterogeneous valid windows per hazard category, not a fixed daily grid like SPC's `day1CatURL`...`day8URL` series. The existing codebase's entire per-day fetch model (`day1CatURL`, `day2CatURL`, ... one URL = one day) has no analog here: WPC 3-7 hazards is *one* URL covering *five* days with per-feature date ranges baked into properties, not into the endpoint.

**How to avoid:**
Do not attempt to bucket Temperature/Wildfire-Drought hazard types into individual `day3`...`day7` slots — display them as a single "sometime in Days 3-7" (or "Days 8-14") badge instead, separate from the per-day-bucketed rows. For Precipitation-layer hazards, explicitly date-bucket each feature by comparing `start_date`/`end_date` (epoch ms, UTC) against each calendar day's 00Z-00Z window (see Pitfall 4 for why 00Z, not 12Z) before assigning it to a `dayN` slot — do not assume one feature = one day. Verify this behavior against a fresh live payload at implementation time, since granularity may not be stable across all hazard categories or seasons.

**Warning signs:**
Any code path that does `dayN.hazard = geojson.features[0]` (assumes single feature) or extends `extractPolygons`'s label-only grouping without also grouping by `start_date`/`end_date` will either drop hazards silently (if it only reads the first feature) or mis-assign a Day 3-7-window hazard to every day equally (if it treats presence at all as "true for day3 AND day4 AND ... day7").

**Phase to address:** Data-source integration AND merge/display logic (the date-bucketing logic and the "windowed, not per-day" display fallback both need to exist before the unified day report can consume this product correctly) — flag for deeper research at phase-planning time; this is not a "standard patterns" phase.

---

### Pitfall 4: "Day N" is not a stable concept across agencies OR across WPC's own products — 00Z-00Z vs 12Z-12Z vs partial-day windows, confirmed live

**What goes wrong:**
This directly threatens the "merge products into a single per-day report" premise. Confirmed from live payloads on the same day:
- **SPC** (existing): `VALID`/`EXPIRE` pairs are 12Z-to-12Z (`202608171200` → `202608181200` for Day 3).
- **WPC ERO Day 3+**: `valid_time: "12Z 08/17/26 - 12Z 08/18/26"` — matches SPC's 12Z-12Z convention.
- **WPC ERO Day 1**: `valid_time: "01Z 08/16/26 - 12Z 08/16/26"` — an *11-hour partial day*, because Day 1 ERO is reissued three times daily (0100Z/0830Z/1500Z) and the valid window is truncated to "now through the next 12Z," not a full 24h span.
- **WPC/CPC Day 3-7 & 8-14 Hazards Outlook**: `start_date`/`end_date` fall on exact UTC midnight boundaries (`2026-08-18T00:00:00Z` → `2026-08-19T00:00:00Z`) — a **00Z-to-00Z calendar-day** convention, which does *not* line up with SPC's or ERO's 12Z-12Z windows. A location's "Day 3" under the Hazards Outlook covers a 12-hour-shifted window relative to SPC's "Day 3," meaning a hazard occurring between 00Z and 12Z on a given UTC date could appear in the Hazards Outlook's "Day 3" bucket while SPC would attribute the same instant to its "Day 2" bucket (or vice versa).

**Why it happens:**
Each product's valid-time convention was set by its own issuing desk (WPC forecast-shift schedule vs. SPC's convective-day convention) independently of the others; there is no cross-agency standard being followed.

**How to avoid:**
Do not merge by ordinal day index (`day3` + `day3` + `day3`) alone. When building the unified day report, derive each product's day bucket from its own `VALID`/`EXPIRE`/`start_date`/`end_date` fields and align by actual UTC time window overlap, not by matching field names like "day3URL". At minimum, document (and likely surface in the UI, e.g. via a footnote or tooltip) that "Day 3" boundaries differ by up to 12 hours between the convective outlook and the hazards outlook. Treat this as a modeling decision requiring explicit design, not a detail to patch in during the merge-logic phase.

**Warning signs:**
Any implementation that keys merge logic purely off a `dayN` object property name shared across product result shapes, assuming they were pre-aligned by the fetch layer.

**Phase to address:** Merge logic phase — this is the single highest-risk finding for that phase and should be resolved with an explicit design decision (documented time-window alignment strategy) before implementation, not discovered mid-phase.

---

### Pitfall 5: MPD has no "Active" aggregator like SPC's `ActiveMD.kmz` — naive "latest" fetch silently drops concurrently active MPDs, and MPD numbers reset annually

**What goes wrong:**
SPC's existing MD flow (`getMesoscaleDiscussion`) works because `ActiveMD.kmz` is a KML `NetworkLink` index that enumerates *all* currently active MDs. WPC's MPD directory (`https://www.wpc.ncep.noaa.gov/kml/mpd/`) has no equivalent — only individually numbered files (`MPD_1007_final.kmz` ... `MPD_1063_final.kmz`) plus a `MPD_latest.kmz` that resolves to just the single most recent MPD. Live check on 2026-08-15/16: the WPC metwatch page (`metwatch_mpd.php`) listed **two** simultaneously active MPDs (`md=1062` and `md=1063`); `MPD_latest.kmz` alone would surface only `1063`, silently dropping `1062`. Additionally, MPD numbering is **not globally monotonic** — the directory listing shows `MPD_1281_final.kmz` dated `2026-01-23` sitting alongside `MPD_1007`...`MPD_1063` dated `2026-08-11` through `2026-08-16` (numbering resets each calendar year), so "highest number = most recent" is false across a year boundary.

**Why it happens:**
WPC's product infrastructure for MPD was never built with an SPC-style network-link aggregator; it's a flat KMZ archive plus an HTML index page intended for humans.

**How to avoid:**
Do not port `getMesoscaleDiscussion`'s network-link-parsing pattern directly. Instead, parse the actual set of currently-active MPD identifiers from `metwatch_mpd.php` (or find and use a proper GIS/vector endpoint if one exists at implementation time — none was found for MPD specifically, unlike SPC's `spc_mesoscale_discussion` MapServer) and fetch each active MPD's KMZ individually. Never rely on `MPD_latest.kmz` alone. Sort/select "latest" by file modification date or embedded issuance timestamp, never by the numeric MPD ID.

**Warning signs:**
HTML-scraping fragility: `metwatch_mpd.php`'s markup could change without notice (no API contract), so this integration needs a defensive parse (fail closed to "no MPD" rather than crash) and should be flagged for revisit if WPC changes their site.

**Phase to address:** Data-source integration (MPD phase) — flag for deeper research; this is a nonstandard integration pattern relative to the other five products.

---

### Pitfall 6: CRS mismatches between agencies/products — confirmed live, not all default to WGS84 the way SPC does

**What goes wrong:**
SPC's existing GeoJSON endpoints are natively WGS84 (EPSG:4326) — no reprojection needed. Live inspection of the new services shows this is NOT universal:
- **WPC ERO** (`hazards/wpc_precip_hazards`): native spatial reference is **Web Mercator** (`wkid: 102100` / `latestWkid: 3857`).
- **WPC Winter Storm Outlook** (`experimental/.../wpc_winter_storm_outlook`): native spatial reference is a **sphere-based Lambert Conformal Conic** with no EPSG code at all (`GCS_Coordinate_System_imported_from_GRIB_file`, a GRIB-derived unprojected sphere) — raw (non-GeoJSON) query results returned coordinates like `[705146.53, 18208.31]` (meters on the LCC grid, not degrees).
- **WPC/CPC combined hazards service** (`hazards/cpc_weather_hazards`): native spatial reference IS `wkid: 4326` — matches SPC, no issue.
- Requesting `f=geojson` on all of the above correctly triggers server-side reprojection to WGS84 lon/lat (verified: WSO's `f=geojson` output for the same feature returned plausible `[-88.0, 25.0]`-range coordinates, consistent with the ArcGIS REST GeoJSON output spec mandating CRS84). This *works* today, but is an implicit, unstated contract.

**Why it happens:**
Different NOAA production pipelines (vector-optimized services vs. raster/GRIB-derived services) choose different native storage projections; `f=geojson` papers over this by reprojecting on the server, but only if the request explicitly asks for `f=geojson` (or `f=json&outSR=4326`).

**How to avoid:**
Always request `f=geojson` (never fall back to raw `f=json`/esriJSON for these two services) and treat this as a hard requirement in code comments, since a future refactor "simplifying" the fetch to raw esriJSON (e.g. to read `spatialReference` metadata, or because some other endpoint needed it) would silently feed turf.js meters-as-degrees with no error thrown — turf would produce a syntactically valid but geographically nonsensical polygon.

**Warning signs:**
Any coordinate value with magnitude > 180/90 flowing into `turf.point`/`turf.polygon` without an explicit reprojection step is a red flag; add a lightweight bounds sanity check (`Math.abs(lon) <= 180 && Math.abs(lat) <= 90`) at the `extractPolygons` boundary as a cheap tripwire specifically because this project has no automated test suite to catch a CRS regression otherwise.

**Phase to address:** Data-source integration (ERO and WSO phases specifically).

---

### Pitfall 7: HeatRisk is a raster ImageServer, not a polygon service — day-index alignment requires sorting an unordered `catalogItems` array, and pixel resolution creates its own boundary-jitter class distinct from the polygon-epsilon bug already fixed

**What goes wrong:**
HeatRisk (`experimental/.../NWS_HeatRisk/ImageServer`) has no GeoJSON polygon layer at all — it's a multi-day raster mosaic queried via the `identify` operation. Live `identify` call at a test point returned:
```json
{"value":"3", "properties":{"Values":["3","2","3","3","3","2","2"]},
 "catalogItems":{"features":[
   {"attributes":{"name":"HeatRisk_5_Mercator","idp_validtime":1787140800000}},
   {"attributes":{"name":"HeatRisk_7_Mercator","idp_validtime":1787313600000}},
   {"attributes":{"name":"HeatRisk_1_Mercator","idp_validtime":1786881600000}},
   {"attributes":{"name":"HeatRisk_4_Mercator","idp_validtime":1787054400000}},
   {"attributes":{"name":"HeatRisk_6_Mercator","idp_validtime":1787227200000}},
   {"attributes":{"name":"HeatRisk_2_Mercator","idp_validtime":1786968000000}},
   {"attributes":{"name":"HeatRisk_3_Mercator","idp_validtime":1786968000000}}
 ]},
 "catalogItemVisibilities":[1,0,0,0,0,0,0]}
```
The `catalogItems` array — and therefore the parallel `Values` array — is returned in **arbitrary order** (`5, 7, 1, 4, 6, 2, 3`, not `1..7`), not sorted by `idp_validtime`. The top-level `value` field (`"3"`) reflects whichever mosaic item is currently the "visible" one per `catalogItemVisibilities` (here, item index 0 = `HeatRisk_5`), not "today." Mapping `Values[i]` to a specific forecast day *requires* sorting `catalogItems` by `idp_validtime` first and matching indices — reading `Values[0]` naively would attribute Day 5's category to Day 1.

Separately, the raster's native pixel resolution is ~2540 m (`pixelSizeX: 2539.7`). A location near a HeatRisk category boundary can land in different pixels (and thus different categories) between forecast refreshes purely from resampling, independent of any turf-side geometry issue — this is a *new* class of boundary flakiness, distinct from (and not fixed by) the `booleanPointInPolygon` pre-check this project already added for polygon-edge epsilon errors in v1.2.

**Why it happens:**
HeatRisk publishes a gridded raster product (derived from a heat-index model), not a forecaster-drawn vector outlook; NOAA exposes it via `ImageServer`/`identify` (the standard Esri raster-query pattern) rather than `MapServer`/`query`.

**How to avoid:**
Sort `catalogItems` by `idp_validtime` ascending before indexing into `Values`; never trust array position or the top-level `value` field for anything beyond "today, whatever mosaic rule picked." Treat HeatRisk as fundamentally different plumbing from the other five (turf-free — a numeric category lookup, not a `booleanPointInPolygon` call) and isolate it behind its own small fetch/parse function rather than trying to force it through `extractPolygons`/`evaluatePolygons`.

**Warning signs:**
Any code that indexes `Values[dayIndex]` directly without a sort step; treating a category flip near a boundary as a "bug" to fix with a turf-side epsilon pre-check (it isn't — it's raster resampling, no turf fix applies).

**Phase to address:** Data-source integration (HeatRisk phase) — flag for deeper research; this phase has fundamentally different mechanics (raster identify vs. vector point-in-polygon) from every other product this project has integrated to date.

---

### Pitfall 8: `LABEL` vs `label` — field-name case mismatch produces a silent false negative, not a crash

**What goes wrong:**
`extractPolygons` reads `f.properties.LABEL || ""`. SPC's services use uppercase `LABEL`. Every WPC/CPC service inspected live (combined hazards service, ERO) uses **lowercase** `label`/`outlook`/`dn` field names. If a new fetch path reuses `extractPolygons` unmodified against a WPC/CPC payload, `f.properties.LABEL` is `undefined`, the `|| ""` fallback silently converts it to `""`, and the `includesFeat` predicate (`val > 0`) evaluates to `false` for every feature — the hazard is present in the data but the module reports it as absent. This is functionally identical in shape to the fire-weather `LABEL`-encodes-day-not-risk trap already burned once on this project (documented in PROJECT.md), but on the opposite failure mode: there, a real field was misinterpreted; here, the field is simply absent under that name and degrades to a default that looks like a valid "no risk" result.

**Why it happens:**
Copy-paste reuse of a working helper without re-verifying field names against the new payload; JavaScript's silent `undefined` property access plus a `|| ""` fallback masks the mistake instead of throwing.

**How to avoid:**
Do not reuse `extractPolygons` as-is for WPC/CPC field-name variants; parameterize the property-name lookup explicitly per product (it already takes a `toValue(label, f)` callback — use `f.properties.label` for WPC/CPC, not the shared default-y pattern that assumes `LABEL`). Add a one-time startup/log-level sanity check per new endpoint (log the raw `Object.keys(f.properties)` of the first feature on first successful fetch) so a schema mismatch surfaces in logs rather than as silent zero-risk everywhere.

**Warning signs:**
A new product always reports "no risk" even when the live web page for that product shows an active hazard for the configured location — since this produces *no error*, only manual cross-checking against the source website will catch it, and only if someone thinks to look.

**Phase to address:** Data-source integration (every new-product phase) — this is a generic-but-recurring trap; call it out explicitly in each phase's acceptance criteria as "verify field names via a raw payload dump, not by pattern-matching the SPC code."

---

### Pitfall 9: Display-rewrite regressions that manual-UAT-only verification is structurally likely to miss

**What goes wrong:**
`getDom()` is being replaced wholesale with no legacy fallback, discarding the byte-identity invariant v1.2 verified (per PROJECT.md's explicit Key Decision: "Default-off byte-identity invariant does NOT carry forward past v1.2"). The current `getDom()` (117-196 lines in `MMM-SPCOutlook.js`) encodes a large amount of interdependent conditional logic:
- The "No Severe Weather Risk" branch (lines 95-113) is a single large boolean expression checking `NONE` state across day1/day2/day3 risk, proximity renderability across three days, `day48Risk`, and fire weather across 8 days — a rewrite must reproduce *every* one of these conditions in the new unified structure or the "no risk" state will falsely show partial data (or the reverse: falsely suppress a real hazard).
- The stale-indicator injection (`_stale`/`_staleAsOf`, lines 117-129) and the MD-list injection (lines 130-134) both run *before* the per-day loop and are string-concatenated onto `wrapper.innerHTML` — a rewrite that restructures per-day rendering into a different control-flow shape (e.g., building day objects first, then rendering) risks losing the position/order of these prefix elements relative to day rows.
- Day-of-week computation (`dowToText(dow + N)`) assumes each `dayN` object represents a *contiguous* calendar offset from `dow` (today). Pitfall 3/4 above establish that WPC/CPC's "Day 3-7" is not cleanly per-day and its boundary convention differs from SPC's — if the unified day report reuses `dowToText(dow + N)` against a WPC-sourced day bucket, the weekday label will be off relative to what WPC actually means by "Day N."
- Ten proximity-badge call sites (`torCig`, `hailCig`, `windCig` × Day1/Day2, plus Day3's dual categorical+cig badges) each pass a `mode` ("inside"/"outside") computed from a different local condition per site (`this.spcrisk.dayN.torCig === 0`, etc.) — a rewrite that centralizes this logic must replicate each site's specific inside/outside condition, not just the general pattern, or badges will silently show the wrong mode for specific hazard types.

**Why it happens:**
Three prior milestones of incremental patches (v1.0 BUG-01..04, v1.1 FWXT-01..05, v1.2 PROX-01..06/PROXUI-01..05) each added a narrow, specific fix to `getDom()`'s conditional logic in response to a real bug or edge case. A wholesale rewrite re-derives this logic from scratch, and the original bug reports/edge cases that motivated each fix are not necessarily re-derivable from reading the current code — some exist only as tribal knowledge in git history and PROJECT.md's changelog.

**Regression classes manual-UAT-only verification will structurally miss:**
1. **Combinatorial state coverage** — the "no risk" condition alone has roughly 15+ independently-toggleable boolean inputs (3 days × risk+proximity, day48Risk, fire weather × 8 days). Manual UAT exercises whatever the live sky happens to be doing that day plus a handful of hand-constructed scenarios; it will not exercise the full cross-product of states, so a regression in a rare combination (e.g., Day 2 has renderable proximity but Day 1 and Day 3 don't, while extended fire weather Day 6 is active) can ship undetected, exactly as already happened once with the documented `day2-none-still-displays` bug the `hasRenderableProximity`/`hasAnyRenderableProximity` helpers were added to fix.
2. **Order/whitespace/formatting drift** — since `innerHTML` is built by string concatenation, subtle regressions (missing `<br/>`, doubled space, wrong separator) produce a rendered page that *looks* approximately right in a screenshot-level manual check but differs at the DOM/string level. PROJECT.md already accepts two such artifacts as known tech debt from the *current* code (`double-space` and `missing space before percent`) — a full rewrite risks silently introducing more of exactly this class, and without automated snapshot/byte comparison (explicitly out of scope), only a human noticing an extra space during UAT would catch it, which the project's own accepted-tech-debt history shows doesn't reliably happen.
3. **Error/loading/no-data branch parity across all six new sources** — the existing code has exactly one `Loading SPC Outlook...` and one `Error: ...` branch, gating on `!this.spcrisk` / `this.spcrisk.error`. Adding six sources with independent fetch success/failure/staleness raises the question of whether a partial failure (e.g. HeatRisk's `identify` call fails while everything else succeeds) should show a global "Error" or degrade gracefully per-section — this branch-interaction surface grows combinatorially and manual UAT (which requires provoking live network failures per source) is unlikely to cover it systematically.
4. **Regression in a feature not being actively worked on** — a v2.0 rewrite focused on the new unified day-report structure could easily regress a v1.1/v1.2-era feature (e.g., fire weather Day 3-8 display, or the stale-indicator wording) simply because attention is on the new products, and nothing forces a systematic re-check of every prior requirement's exact rendered output.

**How to avoid:**
Before starting the rewrite, enumerate every conditional branch currently in `getDom()` (there are roughly a dozen independent gates) as an explicit checklist tied back to its originating requirement ID (BUG-01..04, FWXT-01..05, PROX-01..06, PROXUI-01..05, STALE-01..03) and verify each one has an equivalent path in the new structure — do not rely on "it looks right" against a single live data pull. Since automated testing is explicitly out of scope, compensate with a written manual test matrix (not just ad hoc UAT) enumerating the state combinations above, and treat "no risk anywhere" and "everything active at once" as two mandatory manual test runs in addition to whatever the sky is doing on test day.

**Phase to address:** Display rewrite phase — this should be the first item in that phase's plan, before any new-product rendering code is written, precisely because the existing behavior must be inventoried before it can be safely discarded.

---

### Pitfall 10: Cross-source dedup by label text will both over-merge and under-merge

**What goes wrong:**
The combined WPC/CPC hazards service includes a precipitation-layer feature explicitly labeled `"Severe Weather"` (live payload, Day 3-7 Precipitation layer) alongside `"Heavy Rain"` and flood-labeled features. This is easy to conflate with SPC's convective (tornado/hail/wind) outlook, which is conceptually "severe weather" too — but WPC's "Severe Weather" label here specifically flags *precipitation associated with* severe convection (feeding into excessive-rainfall/flood risk), not an independent tornado/hail/wind forecast. A precedence/dedup rule keyed on label-text similarity (e.g., "if WPC says severe weather and SPC has a categorical risk for the same day, suppress the WPC row as redundant") would over-merge two genuinely different hazard dimensions (flood-relevant heavy rain vs. convective wind/hail/tornado risk) into one, hiding the flood angle entirely.

Conversely, ERO's `outlook: "Marginal (At Least 5%)"` for flash-flood risk and SPC's `MRGL` categorical risk for severe convection are also different hazards that happen to share the word "Marginal" — a naive string-similarity dedup could falsely conflate these too, in the opposite direction (treating them as duplicates when they are not), suppressing one when both should display.

**Why it happens:**
NOAA's various centers reuse the same small vocabulary (Marginal/Slight/Moderate/High, "Severe Weather") for structurally different phenomena across products (excessive rainfall vs. convective severe weather vs. general hazard flags) because the vocabulary itself (based on the SPC 5-tier categorical scale) has become a de facto shared convention across centers even where the underlying physical hazard differs.

**How to avoid:**
Never dedup or apply precedence based on label-string matching alone. Precedence/dedup rules must be keyed on the *hazard dimension* (e.g., `convective-tornado`, `convective-hail`, `convective-wind`, `flash-flood`, `winter-snow`, `winter-ice`, `heat`, `drought`) as an explicit taxonomy built during the merge-logic design step, with each of the six new products' labels mapped into that taxonomy up front — not inferred at render time from string content. Per PROJECT.md's own Key Decision, the precedence table must be "derived from research, not assumed" — this finding is exactly why: the assumed seed example ("SPC convective supersedes the WPC thunderstorm hazard") is only valid for the convective dimension specifically, and does not generalize to flood/heat/winter/drought dimensions where SPC has no opinion at all and suppression would be pure information loss.

**Warning signs:**
Any precedence rule expressed as a simple lookup on the two products' names alone (e.g., "SPC always wins") rather than on hazard dimension + product name; a day row that silently drops a flood or heat warning because a convective outlook was present for the same day.

**Phase to address:** Merge logic phase — build the hazard-dimension taxonomy as an explicit up-front artifact (not inferred ad hoc during implementation) before writing dedup code.

---

### Pitfall 11: Cache-key strategy assumes stable, static URLs — new products' query-string-based endpoints risk defeating the ETag/hash cache

**What goes wrong:**
`_geoJsonCache` is keyed by the exact URL string (`this._geoJsonCache.get(url)` / `.set(url, ...)`). SPC's endpoints are static file-like URLs (`.../day1otlk_cat.lyr.geojson`) — one URL always means the same layer. The new WPC/CPC/ERO/WSO products are ArcGIS REST **query** endpoints requiring explicit query-string parameters (`?where=1=1&outFields=*&f=geojson`) to return data at all (confirmed live — omitting these produces service metadata, not features). If different code paths construct this query string slightly differently (parameter order, `outFields=*` vs an explicit field list, an added `returnGeometry=true` some call sites include and others omit), each variant becomes a *distinct* cache key even though it fetches the same underlying data — silently multiplying redundant fetches and turf evaluations per cycle, undermining the ETag/hash caching this project relies on to keep RPi cost near-flat (an explicit v2.0 Key Decision: "ETag/SHA256 cache already skips turf work when data is unchanged").

**How to avoid:**
Define each new product's exact, fixed query URL as a single constant (mirroring the existing `day1CatURL` etc. pattern) built once and reused everywhere that product is fetched — never construct the query string inline at multiple call sites. Audit for this specifically since six new products means six-plus new constants to get right consistently.

**Warning signs:**
Cache hit-rate logging (already present via `Log.info` cache-hit/miss messages) showing repeated cache *misses* for a product across consecutive update cycles when the underlying NOAA data hasn't actually changed (check via the product's own `idp_filedate`/`issue_time` field, which is stable between real updates) is the concrete tripwire.

**Phase to address:** Data-source integration (apply to each new-product phase as a standing checklist item).

---

### Pitfall 12: Six additional fetch chains materially increase per-cycle latency and event-loop occupancy on a cold cache

**What goes wrong:**
The existing `getSpcOutlook` already performs on the order of 19 sequentially-awaited fetches for the non-extended path (more with `extended: true`). Each of the six new products requires multiple layers to cover its own day range: ERO alone is 5 layers (Day 1-5), WSO is at minimum 8-10 relevant layers (snow + freezing rain × Day 1-4, plus summary layers), the combined WPC/CPC hazards service is 6 layers (3 hazard types × 2 windows), MPD requires an unknown-count set of individual KMZ fetches driven by however many MPDs are currently active (Pitfall 5), and HeatRisk is 1 `identify` call. On a cold cache (module start, or after any cache invalidation such as a location change — see `getSpcOutlook`'s existing `locationChanged` cache-wipe logic, which will now invalidate all six new products' cache entries too) this could roughly double-to-triple the number of sequential awaited round-trips in a single `socketNotificationReceived` handler invocation, all still running on Node's single event loop with synchronous `JSON.parse` and synchronous turf evaluation in between each await. On a Raspberry Pi (the project's explicit target platform, PROJECT.md constraint: "avoid blocking the event loop"), this raises real risk of a single update cycle taking long enough to visibly delay the Pi's ability to service its own display refresh or other MagicMirror modules' timers, especially on a cold start (all six new products' caches empty, e.g. right after a Pi reboot) where the ETag/hash caching this project relies on provides no benefit yet.

**How to avoid:**
Where the six products' fetches have no data dependency on each other (they don't — each is independent), consider `Promise.all`/parallel fetch batching for the new products specifically, rather than extending the existing purely-sequential `await` chain further (note: parallelizing the *existing* SPC chain is out of scope/risky to touch, but the new products can be added as a separate parallel batch without touching proven code). At minimum, measure actual cold-cache wall-clock time for a full six-product cycle on real Pi hardware before considering the feature complete — the RPi constraint is explicit in PROJECT.md but there is no existing instrumentation for per-cycle latency to validate against.

**Warning signs:**
Anecdotal "MagicMirror feels laggy after adding v2.0 products" reports from manual UAT (the only verification mechanism available) — since there's no automated performance test, this needs to be checked with an explicit manual latency measurement (e.g., timestamp logging around the full `socketNotificationReceived` handler) as part of UAT, not left to be discovered from user complaints post-ship.

**Phase to address:** Data-source integration (parallelization strategy) and a dedicated verification step at the end of the milestone (cold-cache timing check) — call out explicitly since RPi performance has no automated safety net in this project.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|-----------------|------------------|
| Reuse `extractPolygons`/`evaluatePolygons` unmodified against WPC/CPC's `label` (lowercase) field via the existing `LABEL`-keyed default path | Less new code | Silent false-negative (Pitfall 8) — hazard always reports absent | Never — always pass an explicit per-product property accessor |
| Treat WPC Day 3-7 Temperature/Wildfire hazard types as if they had per-day resolution (assign the whole-window blob to every day3..day7 slot) | Simpler unified-day-report code, ships faster | Misleading "hazard active every day" display when it may only be one day within the window (Pitfall 3) | Only as an explicit, documented, user-visible "Days 3-7" badge distinct from per-day rows — never silently spread across all five days |
| Fetch `MPD_latest.kmz` only instead of discovering all active MPDs | Much simpler than SPC's ActiveMD network-link pattern | Silently drops concurrently active MPDs (confirmed live: 2 active, latest.kmz surfaces only 1) (Pitfall 5) | Never |
| Sequential (not parallelized) fetch of the six new products, bolted onto the existing await chain | Minimal risk to existing proven fetch code | RPi latency/event-loop occupancy grows roughly linearly with each new product (Pitfall 12) | Acceptable only if a cold-cache latency measurement confirms it stays well within an acceptable cycle time; otherwise batch the new products via `Promise.all` |
| Precedence/dedup keyed on label-string similarity across products | Fast to implement, no taxonomy design needed | Over-merges or under-merges distinct hazard dimensions that share vocabulary (Pitfall 10) | Never |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|-----------------|-------------------|
| WPC/CPC combined hazards MapServer (`hazards/cpc_weather_hazards`) | Assuming `label` encodes severity like SPC's `LABEL` | Treat `label` as an independent boolean hazard-type flag; build an explicit hazard-type taxonomy, not a severity ranking |
| WPC ERO (`hazards/wpc_precip_hazards`) | Reusing fire weather's `dnToFireValue` mapping against ERO's `dn` field | Derive ERO's own `dn→outlook` mapping from a live payload (`1→Marginal, 2→Slight, 3→Moderate` confirmed; verify High/other tiers similarly before shipping) |
| WPC ERO native CRS | Assuming WGS84 like SPC | Native SR is Web Mercator (3857); always request `f=geojson` explicitly, never raw `f=json` |
| WPC Winter Storm Outlook native CRS | Assuming WGS84 or a standard EPSG projection | Native SR is a GRIB-derived sphere-based Lambert Conformal Conic with no EPSG code; `f=geojson` reprojects correctly — verified live — but this must never be bypassed |
| WPC MPD discovery | Porting SPC's `ActiveMD.kmz` NetworkLink pattern directly, or using `MPD_latest.kmz` alone | No network-link aggregator exists for MPD; discover the active set via `metwatch_mpd.php` parsing (defensive, fail-closed) and fetch each active MPD's KMZ individually; sort by date, never by MPD number (resets annually) |
| NWS HeatRisk (`NWS_HeatRisk/ImageServer`) | Treating it like a vector polygon service (`query` + `booleanPointInPolygon`) | It's a raster `ImageServer`; use `identify` with an explicit `spatialReference` on the point geometry, then sort the returned `catalogItems` by `idp_validtime` before reading the parallel `Values` array |
| All six new products | Constructing the ArcGIS REST query string inline at multiple call sites | Define one fixed URL constant per product/layer, reused everywhere, to preserve `_geoJsonCache` key stability |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|-----------------|
| Sequential await chain grows by ~6 products × multiple layers each | Slow cold-cache update cycle, delayed display refresh on RPi | Batch the six new products' independent fetches via `Promise.all`; measure cold-cache wall-clock time explicitly | First cold start after adding all six products, or after any `locationChanged` cache wipe |
| Cache-key drift from inconsistent query-string construction across call sites | Repeated cache misses in logs for a product whose underlying data hasn't changed (cross-check via `idp_filedate`) | One fixed URL constant per product/layer (Pitfall 11) | As soon as more than one code path fetches the same layer |
| `_geoJsonCache` grows unbounded (no eviction) as ~6 new products × multiple layers each add entries, each potentially carrying a `polys`/`lines` proximity-memoization payload if proximity weighting is ever extended to new products | RPi memory growth over long uptimes | Keep new products' cache entries lean (no `polys`/`lines` unless proximity weighting is explicitly extended to them, which is currently out of scope per PROJECT.md); consider whether an eviction/TTL policy is warranted once total cached-layer count roughly triples | Long-running Pi uptime (weeks) with all six products enabled |
| Raster `identify` resolution (~2.5 km pixels) causes HeatRisk category flips near boundaries independent of any turf logic | User near a HeatRisk category edge sees the badge change between refreshes with no polygon-boundary explanation | Document as expected raster behavior, distinct from the polygon-epsilon issue already fixed via `booleanPointInPolygon`; do not attempt a turf-side fix | Any location within roughly one pixel-width of a HeatRisk category boundary |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-------------------|
| Merging WPC Day 3-7 Temperature/Wildfire hazards into per-day rows as if they had daily resolution | User sees "Hazardous Heat" repeated identically on Day 3, 4, 5, 6, and 7 rows when the source data can't actually distinguish which specific day(s) it applies to within the window | Render these as a distinct "Days 3-7" window badge, separate from strictly-per-day rows, and say so explicitly in the label |
| Applying a precedence rule that fully suppresses a WPC/CPC hazard row because SPC has *any* opinion for that day, regardless of hazard dimension | User loses a genuine flood/heat/winter/drought warning because an unrelated convective outlook happened to exist for the same day (Pitfall 10) | Precedence must be scoped to the same hazard dimension only; cross-dimension hazards should always both display |
| Detail-toggle default-off compact single line per day, when the day's true status is "multiple distinct hazard types active, spanning different day-windows" | A compact single-line summary that picks just one hazard to show could misrepresent a day with e.g. both a flash-flood risk and a heat risk active | Compact mode should indicate "N hazards" or use a combined/highest-precedence-within-a-well-defined-taxonomy summary, not silently pick one hazard type at random based on code order |

## "Looks Done But Isn't" Checklist

- [ ] **WPC/CPC Day 3-7/8-14 hazards integration:** Often missing the date-bucketing step entirely — verify by checking whether Temperature/Wildfire-Drought hazard types are being spread identically across all days in the window (wrong) vs. shown as a window-level badge (right), and whether Precipitation-layer features are actually being bucketed by their individual `start_date`/`end_date` rather than lumped.
- [ ] **ERO/fire-weather-style `dn` field reuse:** Often missing a fresh live-payload check — verify the `dn→outlook` mapping was derived from ERO's own payload, not copied from `dnToFireValue`.
- [ ] **MPD integration:** Often missing multi-MPD coverage — verify by checking WPC's `metwatch_mpd.php` for the current count of active MPDs and confirming the module surfaces all of them, not just `MPD_latest.kmz`.
- [ ] **WSO/ERO CRS handling:** Often missing an explicit `f=geojson` requirement — verify no code path falls back to raw `f=json`/esriJSON for these two services, and add the lon/lat bounds sanity check at the `extractPolygons` boundary.
- [ ] **HeatRisk day alignment:** Often missing the `catalogItems` sort step — verify `Values[i]` is read only after sorting `catalogItems` by `idp_validtime`, not by raw array position.
- [ ] **`getDom()` rewrite parity:** Often missing full reproduction of the "no risk" combinatorial gate and the ten proximity-badge mode conditions — verify against the explicit checklist of prior requirement IDs (BUG-01..04, FWXT-01..05, PROX-01..06, PROXUI-01..05, STALE-01..03), not just a visual spot-check.
- [ ] **Cross-source precedence table:** Often missing dimension-scoping — verify the table is keyed on (hazard dimension, product) pairs, not (product, product) pairs or label-text matching.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|-----------------|------------------|
| Silent false-negative from `LABEL`/`label` case mismatch (Pitfall 8) | LOW | Once identified (via a raw `Object.keys(properties)` log or a user report of "no risk shown but NOAA's site shows one"), it's a one-line fix to the property accessor per affected product |
| MPD missing a concurrently active discussion (Pitfall 5) | LOW-MEDIUM | Swap `MPD_latest.kmz`-only logic for the `metwatch_mpd.php`-driven active-set discovery; low code cost but requires re-verifying the HTML-parsing approach against the live page structure |
| Day-window misalignment discovered post-ship in the merged report (Pitfall 4) | HIGH | Requires revisiting the merge/date-bucketing design, not a local patch — likely touches the unified day-report's core data model; better to resolve at design time (see Pitfall 4's phase assignment) than recover post-ship |
| Over-aggressive precedence suppression hiding a real hazard (Pitfall 10) | MEDIUM-HIGH | Requires redesigning the precedence table around a hazard-dimension taxonomy rather than product-name pairs; moderate rework but isolated to the merge-logic module if that module was reasonably decoupled from fetch/display |
| RPi latency regression from unparallelized new fetches (Pitfall 12) | LOW-MEDIUM | Refactor the six new products' fetch calls into a `Promise.all` batch; does not require touching the existing proven SPC fetch chain |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|-------------------|----------------|
| 1. WPC/CPC `label` is hazard-type, not severity | Data-source integration (Hazards Outlook) | Live payload pull confirms `label` values map into an explicit hazard-type taxonomy, not a severity lookup returning nonzero |
| 2. `DN`/`dn` domain differs per product | Data-source integration (ERO) | ERO's `dn→outlook` mapping is derived from a live payload dump, documented in code comments distinct from `dnToFireValue` |
| 3. No uniform per-day structure in Day 3-7/8-14 hazards | Data-source integration + Merge logic | Manual UAT confirms Temperature/Wildfire-Drought hazards render as a window badge, not repeated identically across days; Precipitation-layer hazards are correctly date-bucketed |
| 4. "Day N" valid-window misalignment across products | Merge logic (explicit design decision, pre-implementation) | Written documentation of each product's day-boundary convention exists before merge code is written; UAT includes a scenario where a hazard falls near a day boundary in one product's convention but not another's |
| 5. MPD missing concurrent discussions | Data-source integration (MPD) | Manual check against `metwatch_mpd.php`'s live active-MPD count matches the module's surfaced count on a day with 2+ active MPDs |
| 6. CRS mismatches (ERO Mercator, WSO LCC) | Data-source integration (ERO, WSO) | Bounds sanity check (`|lon|<=180, |lat|<=90`) present at `extractPolygons` boundary for these two products; code review confirms no raw `f=json` fallback exists |
| 7. HeatRisk raster/catalogItems ordering | Data-source integration (HeatRisk) | Code explicitly sorts `catalogItems` by `idp_validtime` before indexing `Values`; verified against a live multi-day `identify` response |
| 8. `LABEL`/`label` case mismatch | Every new-product phase | Each new product's fetch/parse code is checked against a raw live payload dump of `Object.keys(properties)`, not assumed from the SPC pattern |
| 9. Display-rewrite regression classes manual UAT misses | Display rewrite | Written manual test matrix covering the ~15+ combinatorial "no risk" gate inputs and all ten proximity-badge mode conditions, executed and signed off before considering the rewrite complete |
| 10. Cross-source dedup false merge/miss | Merge logic | Explicit hazard-dimension taxonomy document exists and precedence table is reviewed against it before implementation; UAT includes a same-day flood-plus-convective scenario to confirm both surface |
| 11. Cache-key drift from inconsistent query strings | Data-source integration (all six) | One fixed URL constant per product/layer in code; cache-hit-rate log spot-check across consecutive cycles with unchanged upstream `idp_filedate` |
| 12. Cold-cache latency / event-loop occupancy | Data-source integration (parallelization) + final milestone verification | Explicit timestamped measurement of full cold-cache cycle time on real Pi hardware, logged and reviewed against an acceptable threshold before milestone sign-off |

## Sources

- Live payload inspection, 2026-08-15/16 (all via `curl` against production NOAA endpoints during this research session):
  - `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer` (layers 0-8) — combined WPC Day 3-7 / CPC Day 8-14 Hazards Outlook
  - `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer` (layers 0-4) — WPC Excessive Rainfall Outlook
  - `https://mapservices.weather.noaa.gov/experimental/rest/services/wpc_winter_storm_outlook/MapServer` (layers 0-11) — WPC Winter Storm Outlook
  - `https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer` (`identify` operation) — NWS/WPC HeatRisk
  - `https://www.wpc.ncep.noaa.gov/kml/mpd/` and `https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php` — WPC Mesoscale Precipitation Discussion
  - `https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson` and `day3otlk_cat.lyr.geojson` — SPC baseline for comparison
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/node_helper.js` — existing fetch/parse/geometry handling (read in full)
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/MMM-SPCOutlook.js` — existing renderer being replaced (read in full)
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/.planning/PROJECT.md` — project history, known tech debt, and v2.0 Key Decisions
- WebSearch discovery of endpoint URLs (WPC/CPC/NWS product pages), used only to locate services subsequently verified by direct live payload fetch — not relied upon as authoritative without payload confirmation

---
*Pitfalls research for: MMM-SPCOutlook v2.0 — WPC & CPC Integration + Unified Day Report*
*Researched: 2026-08-15*
