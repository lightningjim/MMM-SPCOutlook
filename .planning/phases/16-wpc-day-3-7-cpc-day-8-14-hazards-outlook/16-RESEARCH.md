# Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook - Research

**Researched:** 2026-08-26
**Domain:** NOAA ArcGIS MapServer hazard ingestion (multi-label, multi-day-window, no-severity-ladder product) layered onto an existing turf.js point-in-polygon MagicMirror² module
**Confidence:** HIGH for everything live-verified this session (live HTTP against the production MapServer); carried-forward findings from the 2026-08-15 research round are cited with their original confidence level, not re-elevated

**Provenance key used throughout:** `[LIVE 2026-08-26]` = fetched/verified this session · `[CARRIED: STACK/PITFALLS/FEATURES/SUMMARY]` = unchanged from the prior research round, not re-derived · `[CODE]` = read directly from this repo this session · `[ASSUMED]` = training-knowledge inference, not verified either session

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Day bucketing & payload shape**
- **D-01:** Payload carries offset keys `day3`…`day14` in its own sibling block (mirroring `excessiveRain` / `winterImpact` per Phase 14 D-02), and **each day additionally carries its resolved UTC `date`**. The frontend labels weekdays from that date rather than computing `dowToText(dow + N)`.
- **D-02:** A day carries **every** hazard covering the location, as an array, ordered by an explicit order list declared on the registry row — e.g. `day5: { date, hazards: ["Heavy Rain", "Severe Weather"] }`. Not a single winner. *Consequence for planning:* `evaluatePolygons`' max-comparator contract does not apply. This product needs a collect-all evaluator that returns the set of matching features.
- **D-03:** Bucket on the **UTC calendar date** in `start_date`/`end_date`; the offset is that date minus today's UTC date.
- **D-04:** A Precipitation feature spanning multiple days appears on **every day in its span**. **Guard:** if a Precipitation feature's span equals its layer's full nominal window (D3–7 / D8–14), it is window-level, not per-day — route it to the window band instead.

**Window band for Temperature / Wildfire**
- **D-05:** Window-spanning hazards render in their **own labeled region, below the day rows** — not folded into the 15 D-05 advisory band.
- **D-06:** The band labels each entry with its **observed span**, derived from the feature's own `start_date`/`end_date`, not the layer's nominal window.
- **D-07:** **One band**, entries sorted by span start, each self-labeling its span. Both day ranges share it; no per-range subheadings.
- **D-08:** Entry wording carries **both** weekday and offset: `Thu–Mon (D3–7): Hazardous Heat`.

**Label filtering & vocabulary**
- **D-09:** **Flooding labels are hard-excluded in the registry row, in code, with no config override.** Comment cites the National Flood Outlook as the real source.
- **D-10:** **Drought is a preference, gated not filtered** — a new flat boolean `showDrought`, defaulting `false`.
- **D-11:** A label that is neither excluded nor in the registry's display map **renders verbatim in the default style and logs once**.
- **D-12:** The Precipitation layer's **`Severe Weather` label renders verbatim** this phase. Suppression is Phase 18's, per HAZ-04's boundary and Pitfall 10.

**Freshness (DATA-02)**
- **D-13:** A **flat `maxDataAgeHours` on `idp_filedate`**, declared per registry row.
- **D-14:** `maxDataAgeHours = 84`.
- **D-15:** A tripped data-age check **sets the global `anyStale` flag but is excluded from `_staleAsOf`**.
- **D-16:** When judged data-stale, **the Hazards rows still render their content.**

### Claude's Discretion

- The registry `kind` for this product — a third kind is needed; its name, and whether dispatch is a switch, a handler map, or per-row function references, is open.
- Whether the D-02 collect-all evaluator sits beside `evaluatePolygons` or replaces it for this kind, and where the D-03/D-04 date-bucketing helper physically lives.
- Whether the six layers are one registry row with a layer list, or two rows sharing constants.
- Exact row wording for per-day entries, and the separator between multiple hazards on one day.
- Color treatment — cite provenance in the row per D-08 rather than repeating IN-01's uncited-palette finding.
- Whether the `showHazardsOutlook` / `showDrought` defaults are applied frontend-only or also re-defaulted node_helper-side.

### Deferred Ideas (OUT OF SCOPE)

- National Flood Outlook as a 7th data source — its own phase, this milestone (successor to D-09's interim exclusion).
- Color treatment for hazard labels — deferred to planning/implementation discretion (this research resolves it live below; see Colors section).
- Whether `Much Above/Below Normal Temperatures` are actionable enough to render — surfaced, not pursued; renders verbatim under D-11 by default.
- Resolving the cadence conflict (STACK's Mon–Fri 17:00Z vs FEATURES' twice-daily 7-day) — this research resolves it live below.
- Per-product staleness UX — deferred to Phase 18+.
- `Severe Weather` suppression — Phase 18's, per D-12.

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| HAZ-01 | Per-day hazard entries for Days 3–14 from the Precipitation layer's per-feature date stamps, when `showHazardsOutlook` is enabled | Live payload pull confirms Precipitation layers (4, 6) are reachable and schema-correct; the Date Bucketing Algorithm section gives the exact UTC-offset arithmetic; Registry Kind & Row Design gives the row/runner shape. Live pull returned 0 features on both Precipitation layers today — the per-day spread/full-window-guard logic (D-04) is therefore *specified* but not *empirically exercised* this session; flagged in Open Questions with a synthetic-fixture recommendation for the probe suite. |
| HAZ-02 | Temperature and Wildfire hazards in a non-day-scoped band, labeled with observed window (e.g. `D3–7`) | Live pull confirms Temperature/Wildfire layers return features with **varying, non-uniform spans** (1-day, 4-day, 5-day, 6-day observed today) — refines Pitfall 3, and confirms D-06's "label with observed span, never the nominal window" design is correct, since the nominal-window assumption the original research built on is not reliably true even within one layer. |
| HAZ-03 | Hazards matched against lowercase `label`, not silently dropped | `extractPolygons` in `node_helper.js:1005` hardcodes `f.properties.LABEL \|\| ""` — confirmed by direct code read this session, unchanged since the original research. The Registry Kind & Row Design section shows the exact `toValue` idiom (read `f.properties.label` directly off `f`, ignore the broken positional `label` param) that ERO/WSSI already use and this row must copy. |
| HAZ-04 | Flooding/Drought never appear (Flooding: no override; Drought: `showDrought` gate, default false) | Live `drawingInfo` confirms the exact Flooding label set per layer (3 labels × 2 day-ranges) and the exact Drought label set (2 labels D3-7, 1 additional D8-14) with live hex colors for both, so the registry's `excludedLabels`/`droughtLabels` arrays can be written directly from this session's findings, not estimated. See note on ROADMAP criterion 4 vs D-10 in Open Questions. |
| DATA-02 | Stale indicator survives the Mon–Fri-only cadence, no weekend false alarm | Live `serviceDescription` **re-confirms today** "Update Frequency: Daily Monday-Friday at 17:00Z" — resolves the STACK/FEATURES cadence conflict in STACK's favor (see Cadence Conflict Resolution). Freshness Integration section gives the exact write-site design for D-13/14/15's `anyStale`/`_oldestStaleAt` asymmetry, plus a **newly identified, previously undocumented pitfall** (day-offset cache staleness, distinct from network staleness) that DATA-02's implementation must also handle. |

</phase_requirements>

## Summary

Every fact the 2026-08-15 research round asserted about this product's endpoint, schema, and field names checked out again today, live, eleven days later: same six layers, same `label`/`start_date`/`end_date`/`idp_filedate` fields, same host, same `f=geojson` requirement. Three things changed or sharpened this session. First, the live `drawingInfo.renderer` on all six layers turned out to be fully machine-readable — FEATURES.md's "colors are PNG swatches only, LOW confidence" finding was **wrong**; every hazard label in both day-ranges has an exact `[r,g,b]` triple from the service's own legend metadata, fetched directly, no visual verification needed. Second, today's live pull caught the Temperature layer producing hazards with genuinely different span lengths within the same layer (1-day, 4-day, and one exact-full-window 5-day span, all under "Hazardous Heat" alone) — this refines Pitfall 3's "Temperature always spans the whole window" claim from wrong-but-harmless (HAZ-02 routes it to the window band regardless of span) into evidence that D-06's "label with the feature's own observed span" design is not just cautious but *necessary*. Third, and most consequential for planning: this session's direct read of `node_helper.js`'s cache-write pattern surfaces a pitfall CONTEXT.md's sixteen decisions do not address — the standard `_runArcGisDayProduct` cache-write shape (cache a final, day-keyed *result*) is unsafe for this product, because "today" advances independently of whether WPC's byte content changes, and this product computes its day keys *at read time* from a live clock against static feature dates. A cache HIT on a weekend poll must still re-run day-bucketing against the current UTC date, not replay yesterday's day assignment.

Both Precipitation layers (4, 6) returned zero features today, so HAZ-01's day-bucketing/spread/full-window-guard logic is specified precisely below but could not be exercised against a live multi-day-span example this session — the probe suite needs a synthetic fixture to cover it (see Probe Suite Extension). Every other layer had usable live data: Temperature (4 features), Wildfire/Drought D3-7 (26 features, all `Severe Drought`), Temperature D8-14 (1 feature), Wildfire/Drought D8-14 (1 feature, `Rapid Onset Drought Risk`).

**Primary recommendation:** Add one new registry `kind` (e.g. `"arcgis-hazard-window"`) with a sibling `node_helper.js` runner that (a) reuses `extractPolygons` unmodified with a `toValue` that reads `f.properties.label` directly off `f` (same idiom as ERO/WSSI, since `extractPolygons`'s own `label` extraction is hardcoded to the SPC-only uppercase `LABEL` field and cannot be parameterized away), (b) adds a new `evaluatePolygonsCollectAll` sibling to `evaluatePolygons` that returns every containing feature rather than reducing to one, (c) buckets that per-poll result set into `day3`…`day14` **fresh on every poll, including cache hits**, using UTC millisecond arithmetic with no date library, and (d) checks `idp_filedate` against a flat `maxDataAgeHours: 84` per layer, setting `anyStale` without touching `_oldestStaleAt` (D-15).

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch + ETag/hash caching (6 ArcGIS layers) | Backend (`node_helper.js`) | — | `fetchGeoJsonCached` already owns this; reused unmodified |
| Label filtering (Flooding exclude, Drought gate) | Backend (`node_helper.js`, via registry-declared static arrays read at runtime) | Registry (`productRegistry.js`, static data only) | Registry rows are pure static config (15 D-02) — the `showDrought` *toggle* can only be applied where request-scoped state (`productToggles`) is visible, which is `node_helper.js`, not the row itself |
| Collect-all point-in-polygon evaluation | Backend | — | New sibling to `evaluatePolygons`; turf/geometry work never belongs in the frontend |
| Day-offset bucketing (UTC date arithmetic) | Backend | — | Must run at fetch/poll time using the *current* clock, never cached as a final day-keyed result (see Freshness Integration) |
| Freshness / staleness (`idp_filedate` vs `maxDataAgeHours`) | Backend | — | Same `_oldestStaleAt`/`anyStale` machinery every other product uses; D-15's asymmetry is a one-line omission at the write site, not new plumbing |
| Color/display-map lookup (label → hex, label → verbatim fallback) | Backend (data association) | Frontend (CSS interpolation `color:#...`) | Backend attaches the resolved hex/text to each payload entry (matches ERO/WSSI's `tierToColor` pattern); frontend only interpolates the string, exactly as today |
| Day-row + window-band DOM rendering, no-risk gate participation | Frontend (`MMM-SPCOutlook.js`) | — | New renderer functions — the existing `dayRiskCount`/`blockHasRisk`/`renderDayBlock` helpers assume the flat `dayNRisk/Text/Color` shape ERO/WSSI use and **do not fit** this product's nested `day3: {date, hazards:[...]}` shape (see Frontend Integration Risk) |
| Config defaults (`showHazardsOutlook`, `showDrought`) | Frontend (`config.js` defaults) | Backend (`_productToggles`, already generic per row) | `_productToggles` already derives every toggle from `PRODUCT_REGISTRY` rows generically (WR-16) — `showHazardsOutlook` needs no new code there; `showDrought` is NOT a row `configFlag` (it doesn't gate a fetch) and needs its own explicit read, flagged in Open Questions |

## Live Verification Session (2026-08-26)

All of the following was fetched live during this research session, ~4 hours after the 17:00Z issuance window, on a Wednesday.

### 1. Live payload pull — all six layers

```
GET https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{layer}/query?where=1%3D1&outFields=*&f=geojson
```

| Layer | Product | Count | Labels observed | Span examples (UTC) | `idp_filedate` |
|---|---|---|---|---|---|
| 1 | D3-7 Temperature | 4 | `High Winds`, `Hazardous Heat` ×3 | High Winds: **Aug29–Aug29 (1 day)**; Hazardous Heat: Aug29–Sep2 (5 days, exact D3-7 window), Aug30–Sep2 (4 days, partial) | 2026-08-26T17:45:20Z (today, all 4 features share this exact timestamp) |
| 4 | D3-7 Precipitation | **0** | — | — | n/a — no feature to read it from (see Freshness Integration note on this) |
| 7 | D3-7 Wildfire/Drought | 26 | `Severe Drought` ×26 (no `Critical Wildfire Risk` observed) | all Aug29–Sep2 (5 days, exact D3-7 window) | 2026-08-26T17:45:20Z (today, all 26 share it) |
| 3 | D8-14 Temperature | 1 | `Extreme Heat` | Sep2–Sep3 (1 day) | 2026-08-25T19:15:15Z (**yesterday**, Tue) |
| 6 | D8-14 Precipitation | **0** | — | — | n/a |
| 8 | D8-14 Wildfire/Drought | 1 | `Rapid Onset Drought Risk` | Sep3–Sep9 (6 days, inside the nominal 7-day D8-14 window but not the full 7) | 2026-08-26T18:22:29Z (today, ~40 min after layer 1/7's filedate) |

**Key findings from this pull:**
- **Zero-feature layers are real and must be planned for, not just tolerated.** Both Precipitation layers (the ones HAZ-01 depends on for per-day bucketing) returned zero features today. This is the same "legitimate empty result" shape WSSI-03 already established for winter off-season — `_isFeatureCollection` and `extractPolygons` already handle it correctly (empty array in, empty array out, no error) — but it means **HAZ-01's per-day spread and D-04's full-window guard have no live example to validate against this session.** Flagged in Open Questions.
- **`idp_filedate` is NOT a single shared timestamp across the service.** Three distinct filedates were observed across the six layers today (17:45:20Z, 19:15:15Z — a full day stale relative to the others, and 18:22:29Z), even though `label` fields document this as one MapServer service. **The freshness check must read `idp_filedate` per layer, independently, never assumed shared across the row.** Layer 3's filedate is already ~23 hours old at the moment of this fetch — well inside the 84h budget, but it demonstrates each of the 6 layers ages independently and a row-level "any layer aged out" check (not "one shared filedate") is required.
- **`idp_filedate` is uniform within a single layer's feature set** (all 4 layer-1 features and all 26 layer-7 features carry the byte-identical timestamp) — safe to read off `features[0]` when `features.length > 0`, no need to scan/max across a layer's features.
- **Temperature-layer spans are NOT uniformly "whole window."** `[CARRIED: PITFALLS.md Pitfall 3]` asserted "a single polygon's start_date/end_date spans the entire 5-day window" for Temperature/Wildfire layers, based on one August sample. Today's Temperature layer alone shows a 1-day span (`High Winds`), a 4-day partial span, and a 5-day exact-window span, all under the same layer in one poll. **This refines Pitfall 3**: granularity is not just "different between layers" as originally stated, it is *unpredictable within the same layer between features*. This doesn't change the implementation (Temperature/Wildfire always route to the window band per HAZ-02, regardless of span), but it confirms D-06's per-feature observed-span labeling is load-bearing, not a defensive nicety — a design that assumed "the window layer's spans are always ~5/7 days so a nominal label is close enough" would have been visibly wrong today.

### 2. Service-level metadata (`?f=json`)

`GET https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer?f=json`

- Confirms the six-layer structure exactly as `[CARRIED: STACK.md]` described: layer group `Temperature` (0) → `1` (D3-7) / `3` (D8-14); group `Precipitation` (2) → `4` (D3-7) / `6` (D8-14); group `Wildfire_Drought` (5) → `7` (D3-7) / `8` (D8-14).
- **`serviceDescription` live text, verified again today:** *"Update Frequency: Daily Monday-Friday at 17:00Z"*. This is the identical phrase STACK.md quoted on 2026-08-15. **Cadence conflict resolved in STACK's favor** — FEATURES.md's competing "twice daily, 7 days/week" claim was sourced from WPC's *product page prose* (a different, non-authoritative source per FEATURES.md's own citation), not this live service description, and it does not survive a second live check eleven days apart. D-13/D-14's Mon-Fri-aware `maxDataAgeHours = 84` design remains correctly targeted; no change needed.
- The service description's embedded "Hazard Criteria Chart" enumerates every label this MapServer can emit, including three not observed live in either research session (`Frost/Freeze`, `Hazardous Cold`, `Severe Thunderstorms`\*) — cross-checked against `drawingInfo` below, all are present in the legend even when never observed live, consistent with D-11's "unmapped-but-legend-known label must still render, not be dropped."
  \* "Severe Thunderstorms" in the criteria chart's prose corresponds to the `Severe Weather` legend label (the chart's row describes the *criterion*, not the exact field value — confirmed by cross-referencing against `drawingInfo`, which has no separate "Severe Thunderstorms" class).
- **`"This service is not time enabled."`** — confirms there is no ArcGIS time-filter parameter (`time=`) available for this service; the fetch pattern must stay `where=1=1` (whole layer), matching every other product this module already fetches this way.

### 3. Colors — `drawingInfo.renderer`, live, all six layers

`GET .../MapServer/{layer}?f=json` → `drawingInfo.renderer.uniqueValueGroups[].classes[].symbol.color`

**FEATURES.md's claim that this service's colors are "PNG swatches only... LOW confidence... flag for visual verification" is superseded.** Every layer exposes a `uniqueValue` renderer keyed on `field1: "label"`, with an exact `[r,g,b,a]` per class. No visual verification against `wpc.ncep.noaa.gov/threats/threats.php` is needed — this is the authoritative, machine-readable palette, live-fetched, `[LIVE 2026-08-26]`.

| Label | Layer(s) | Hex | Disposition |
|---|---|---|---|
| Frost/Freeze | 1 | `c500ff` | display map (unobserved live, in legend) |
| Hazardous Heat | 1 | `a80000` | display map |
| Hazardous Cold | 1 | `005ce6` | display map (unobserved live, in legend) |
| High Winds | 1, 3 | `cdaa66` | display map |
| Significant Waves | 1, 3 | `ffd37f` | display map (unobserved live, in legend) |
| Flooding Likely | 4, 6 | `df73ff` | **D-09 excluded — no color needed** |
| Flooding Occurring or Imminent | 4, 6 | `4c0073` | **D-09 excluded** |
| Flooding Possible | 4, 6 | `e8beff` | **D-09 excluded** |
| Freezing Rain | 4, 6 | `ff00c5` | display map |
| Heavy Precipitation | 4, 6 | `00e6a9` | display map |
| Heavy Rain | 4, 6 | `267300` | display map |
| Heavy Snow | 4, 6 | `0084a8` | display map |
| Severe Weather | 4, 6 | `e69800` | display map (D-12: renders, not suppressed) |
| Heavy Ice | 6 only | `ff00c5` | display map (identical hex to Freezing Rain — WPC's own legend, not a bug) |
| Critical Wildfire Risk | 7, 8 | `000000` | display map |
| Severe Drought | 7, 8 | `732600` | **D-10 gated on `showDrought`** |
| Rapid Onset Drought Risk | 8 only | `ffd37f` | **D-10 gated** (same hex as Significant Waves — different layer's renderer, harmless) |
| Excessive Heat | 3 only | `a80000` | display map |
| Much Above Normal Temperatures | 3 only | `ff0000` | display map |
| Much Below Normal Temperatures | 3 only | `005ce6` | display map |

This table is a direct, complete replacement for FEATURES.md's Part A1/A2 label lists — same labels (cross-checked, identical to the live-fetched set), now with a verified hex per label and a verified source URL per layer (see Sources). Cite `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{layerId}?f=json` as the palette-source comment in the registry row per D-08 — do not repeat 14-REVIEW.md IN-01's uncited-palette mistake.

### 4. Field inventory — Precipitation layers (4, 6)

`?f=json` on layers 4 and 6 shows fields beyond the four documented in the 2026-08-15 round: `start_dt2`, `end_dt2`, `valid_time_dt`, `validendtime_dt` (all present on Precipitation layers only, not on Temperature/Wildfire layers 1/3/7/8). None of these were populated in a live feature this session (both layers returned 0 features) so their value shape is unverified — `[ASSUMED]` that `start_date`/`end_date` (the fields this phase is scoped to per CONTEXT.md's Phase Boundary) remain the correct fields to bucket on; the `_dt2`/`_dt` variants are very likely ArcGIS's parallel `esriFieldTypeDate` representations of the same values (a common pattern on these services) and out of scope for this phase regardless.

## Standard Stack

**No change from `[CARRIED: STACK.md]`. Zero new npm dependencies confirmed necessary this session** — this phase's data is GeoJSON over the same `fetchGeoJsonCached` path every other WPC/CPC product already uses.

| Capability | Library | Status |
|---|---|---|
| Fetch + ETag/hash cache | `node-fetch` v2 via `fetchGeoJsonCached` | Reused unmodified |
| Point-in-polygon | `@turf/turf` v7.2.0 (`turf.polygon`, `turf.multiPolygon`, `turf.booleanPointInPolygon`) | Reused unmodified via `extractPolygons`; a new `evaluatePolygonsCollectAll` sibling calls the same turf primitives `evaluatePolygons` does |
| Date arithmetic | None — vanilla `Date`/`Date.UTC` | **Confirmed `[CODE]`:** `node_helper.js` has zero `moment`/date-library `require`. `moment` appears only in `MMM-SPCOutlook.js` (frontend, for the stale-badge "N minutes ago" string) and is not in `package.json` `dependencies` — it is a MagicMirror-core-bundled global available only in the browser context. **The backend date-bucketing helper this phase needs must use only `Date.UTC()`/`getUTCFullYear()`/`getUTC*()` — no library, and never the local-time `Date` constructor/getters (`getFullYear()` etc.), which would silently reintroduce a timezone bug on a Pi not running UTC as its system clock.** |

**Installation:** none required.

## Package Legitimacy Audit

**Not applicable.** This phase installs zero new packages (project constraint: "Zero new npm dependencies. turf.js stays." — confirmed satisfiable; every capability needed is already present in `package.json`, verified by direct read this session). The Package Legitimacy Gate protocol has no `npm install` target to run against.

## Registry Kind & Row Design

Neither existing `kind` fits, exactly as CONTEXT.md's Phase Boundary states: `arcgis-day-layers` (`productRegistry.js:159-224`, template `excessiveRain`/`winterImpact`) maps one URL per day via `row.buildUrl(day)`; this product is the inverse — one fixed URL per hazard-family layer, with the day baked into each *feature's* `start_date`/`end_date`, not the URL.

**Recommended `kind`: `"arcgis-hazard-window"`.** (Naming is Claude's Discretion per CONTEXT.md — this is a proposal, not a lock.) Dispatch should follow the existing pattern exactly: a new `if (row.kind === "arcgis-hazard-window")` branch inside `getSpcOutlook`, calling a new sibling method `_runArcGisHazardWindowProduct(row, loc, todayUtcMs, productToggles)` — mirroring how `_runArcGisDayProduct` and `_runKmlAdvisoryRow` are both plain sibling methods dispatched by `kind`, not a handler-map or class hierarchy. This matches the codebase's existing "no `this`-bound polymorphism, straight-line dispatch" style (`CONVENTIONS.md`).

**One row, not two**, covering all six layers via a `layers` list. Rationale: `showHazardsOutlook` and `showDrought` are single flat booleans per CONTEXT.md D-10/discretion note; day3–day14 is presented as one continuous grid per D-01; and the live `serviceDescription`'s cadence applies to the whole MapServer, not per day-range, so `maxDataAgeHours` has no reason to differ between D3-7 and D8-14. Two rows sharing constants would duplicate `excludedLabels`/`droughtLabels`/`hazardOrder` for no behavioral gain.

Proposed row shape (illustrative — `[CODE]`-style, 2-space indent, matches `productRegistry.js` conventions; not a literal diff):

```js
const HAZARDS_BASE_URL = "https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer";

// layer.group drives window-band-vs-day-bucket routing (HAZ-01/HAZ-02).
// layer.dayRange is the layer's nominal [firstOffset, lastOffset] — used only
// by D-04's full-window guard (temperature/wildfireDrought groups ignore it
// entirely; they always route to the window band regardless of span, per HAZ-02).
const hazardsOutlookLayers = [
  { id: 1, group: "temperature",     dayRange: [3, 7] },
  { id: 4, group: "precipitation",   dayRange: [3, 7] },
  { id: 7, group: "wildfireDrought", dayRange: [3, 7] },
  { id: 3, group: "temperature",     dayRange: [8, 14] },
  { id: 6, group: "precipitation",   dayRange: [8, 14] },
  { id: 8, group: "wildfireDrought", dayRange: [8, 14] }
];

// D-09: hard exclusion, no config override. Live-verified 2026-08-26 —
// identical across both day-ranges' Precipitation layers.
const hazardsExcludedLabels = [
  "Flooding Likely", "Flooding Occurring or Imminent", "Flooding Possible"
  // Source: National Flood Outlook, not this product — see D-09's comment
  // requirement in CONTEXT.md. Interim exclusion; successor is COVX-01.
];

// D-10: gated by showDrought (default false), not excluded. Live-verified —
// "Critical Wildfire Risk" is NOT drought and is never gated.
const hazardsDroughtLabels = ["Severe Drought", "Rapid Onset Drought Risk"];

// D-02: registry-declared order for same-day co-occurring hazards. Unlisted
// (but not excluded/gated) labels sort after every listed one, alphabetically
// among themselves for determinism (avoids ArcGIS response-order flicker,
// the exact failure D-02's rationale names).
const hazardsOrder = [
  "Severe Weather", "Heavy Rain", "Heavy Precipitation", "Heavy Snow",
  "Freezing Rain", "Heavy Ice"
];

// Label -> hex, live-verified 2026-08-26 from drawingInfo.renderer on all six
// layers (see RESEARCH.md Colors table). A label absent from this map still
// renders per D-11 (verbatim, default style, logged once) — this map is not
// a filter.
const hazardsDisplayColor = {
  "Frost/Freeze": "c500ff", "Hazardous Heat": "a80000", "Hazardous Cold": "005ce6",
  "High Winds": "cdaa66", "Significant Waves": "ffd37f", "Freezing Rain": "ff00c5",
  "Heavy Precipitation": "00e6a9", "Heavy Rain": "267300", "Heavy Snow": "0084a8",
  "Severe Weather": "e69800", "Heavy Ice": "ff00c5", "Critical Wildfire Risk": "000000",
  "Excessive Heat": "a80000", "Much Above Normal Temperatures": "ff0000",
  "Much Below Normal Temperatures": "005ce6"
  // Severe Drought / Rapid Onset Drought Risk intentionally omitted here even
  // though drawingInfo has hex for them — they render only when showDrought
  // gates them through, at which point they can read the same drawingInfo
  // fetch's values; keeping this map "labels that can actually be displayed"
  // avoids a color entry for a label that's excluded/gated elsewhere.
};

PRODUCT_REGISTRY.hazardsOutlook = {
  id: "hazardsOutlook",
  kind: "arcgis-hazard-window",
  configFlag: "showHazardsOutlook",
  baseUrl: HAZARDS_BASE_URL,
  layers: hazardsOutlookLayers,
  dayRangeTotal: [3, 14],           // replaces daySpanOf's 1..N assumption
  excludedLabels: hazardsExcludedLabels,
  droughtLabels: hazardsDroughtLabels,
  order: hazardsOrder,
  displayColor: hazardsDisplayColor,
  // toValue reads f.properties.label DIRECTLY (lowercase, off `f`) — the
  // `label` positional parameter extractPolygons passes in is always "" for
  // this service, because extractPolygons hardcodes `f.properties.LABEL`
  // (node_helper.js:1005, uppercase, SPC-only). Same idiom eroDnToValue and
  // wssiRawToValue already use to route around the same broken extraction.
  toValue: (label, f) => (typeof f.properties.label === "string" ? f.properties.label : ""),
  // D-09 (hard) then D-10 (toggle-gated) — the toggle itself is read where
  // this closure is BUILT (inside the new runner, which has productToggles),
  // not baked into this static row (15 D-02: no `this`, no closures over
  // request state in the registry).
  maxDataAgeHours: 84  // D-14. Applied per layer's own idp_filedate (see
                        // Freshness Integration — idp_filedate is NOT shared
                        // across layers, confirmed live).
};
```

**`daySpanOf` does not apply** — it asserts a contiguous `1..N` map (`productRegistry.js:57-77`); this row's range is `3..14`. Recommend a lightweight sibling validator, e.g. `dayRangeOf([first, last])` that asserts `Number.isInteger(first) && Number.isInteger(last) && last > first`, called at module load the same way `daySpanOf(eroDayLayers)` is — same "make the invalid state unrepresentable, fail at load time" instinct, different shape because the domain is different (a range, not a map).

**Why `includesFeat`/`toValue` for D-09/D-10 cannot live purely in the static row:** `showDrought` is request-scoped (it can differ between the two rare-but-acknowledged concurrent-instance cases documented at `node_helper.js:660-691`), and registry rows are pure static configuration with no `this` (15 D-02). The new runner must build its own `includesFeat` closure at call time, over the row's static `excludedLabels`/`droughtLabels` arrays plus the request's `productToggles.showDrought`:

```js
// Built inside the new _runArcGisHazardWindowProduct runner, not in the registry row.
const includesFeat = (label, val) => {
  if (row.excludedLabels.includes(label)) return false;               // D-09, unconditional
  if (row.droughtLabels.includes(label) && !productToggles.showDrought) return false; // D-10
  return true;
};
```

## Collect-All Evaluator

`extractPolygons` is fully reusable as-is (`node_helper.js:997-1034`) — it is comparator-agnostic; it just builds `[{label, value, poly, feature}, ...]` filtered by `includesFeat`. Only `evaluatePolygons`'s max-reduce (`node_helper.js:1042-1051`) needs a sibling, per D-02's own note. Recommend `evaluatePolygonsCollectAll`, sitting **beside** `evaluatePolygons`, never replacing it (every other product's max-comparator usage is unaffected):

```js
// New sibling to evaluatePolygons (node_helper.js:1042). Returns every item
// whose polygon contains loc, not the single best. Per-item containment
// isolation (CR-02 lesson): evaluatePolygons never wrapped
// turf.booleanPointInPolygon in try/catch because a malformed geometry could
// not reach it (extractPolygons already screens geometry construction at
// node_helper.js:1018-1030). booleanPointInPolygon can still throw
// independently of construction (e.g. self-intersecting rings) — with
// evaluatePolygons's single-value reduce, an uncaught throw here would have
// discarded the whole product's evaluation; with collect-all, it must not
// discard sibling hazards for the same day. Wrap per item.
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

This directly answers the research question: yes, it reuses `extractPolygons`'s `toValue`/`includesFeat` contract unchanged — the divergence is entirely in the reduce step, which is exactly what D-02 identified.

## Date Bucketing Algorithm (D-03/D-04)

**Verified `[CODE]`: `node_helper.js` has no date library.** The algorithm below uses only `Date`/`Date.UTC`/`getUTC*` — confirmed necessary and sufficient by this session's live data, since every `start_date`/`end_date` observed today was exact UTC midnight (`...T00:00:00.000Z`), with no fractional-day or non-midnight-aligned value in any of the 32 features pulled.

```js
// "Today" at UTC midnight, computed once per poll (NOT cached across polls —
// see Freshness Integration for why this matters more than it looks).
function todayUtcMs() {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Feature's own start_date/end_date are already UTC-midnight-aligned epoch ms
// (live-confirmed on all 32 features pulled this session — no case needed
// fractional-day rounding, but Math.round is kept as a defensive guard
// against a future WPC payload that isn't exactly midnight-aligned).
function dayOffset(epochMs, todayMs) {
  return Math.round((epochMs - todayMs) / MS_PER_DAY);
}
```

**D-04's per-day spread** (Precipitation layers only — Temperature/Wildfire always route to the window band per HAZ-02, regardless of this logic):

```js
function isFullNominalWindow(offsetStart, offsetEnd, dayRange) {
  // CONTEXT.md D-04's exact wording is "span equals its layer's full nominal
  // window" — this reads that as EXACT alignment to the layer's own
  // [first, last] range, not merely "same duration, any position." See Open
  // Questions: this reading is a recommendation, not confirmed by live data
  // (both Precipitation layers returned 0 features this session).
  return offsetStart === dayRange[0] && offsetEnd === dayRange[1];
}

function bucketPrecipitationFeature(hit, layer, todayMs, dayBuckets, windowEntries) {
  const props = hit.feature.properties;
  if (typeof props.start_date !== "number" || typeof props.end_date !== "number") {
    // Malformed feature — contained here, not thrown; the sibling day/window
    // entries for other features must not be lost (CR-02 lesson, extended).
    return;
  }
  const offsetStart = dayOffset(props.start_date, todayMs);
  const offsetEnd = dayOffset(props.end_date, todayMs);
  if (isFullNominalWindow(offsetStart, offsetEnd, layer.dayRange)) {
    windowEntries.push({ label: hit.value, offsetStart, offsetEnd });
    return;
  }
  for (let d = offsetStart; d <= offsetEnd; d++) {
    if (d < 3 || d > 14) continue; // outside this product's displayed range
    if (!dayBuckets[d]) dayBuckets[d] = [];
    dayBuckets[d].push(hit.value);
  }
}
```

**Temperature/Wildfire always go to the window band**, unconditionally, with their own observed span (D-06) — no offset-range comparison needed at all, since HAZ-02 routes them there regardless of length:

```js
function bucketWindowFeature(hit, todayMs, windowEntries) {
  const props = hit.feature.properties;
  if (typeof props.start_date !== "number" || typeof props.end_date !== "number") return;
  windowEntries.push({
    label: hit.value,
    offsetStart: dayOffset(props.start_date, todayMs),
    offsetEnd: dayOffset(props.end_date, todayMs)
  });
}
```

**No DST pitfall exists for this specific arithmetic** — every timestamp involved is UTC (`Date.UTC`/`getUTC*` never touch the process's local timezone or DST rules), and `MS_PER_DAY` division is exact because the observed data is exactly midnight-aligned. The pitfall this project's own conventions warn about — using the local-time `Date` constructor/getters — is avoidable by code review discipline (grep for bare `getFullYear()`/`new Date(y,m,d)` in the new helper) since there is no library to enforce it.

## Freshness Integration (DATA-02, D-13/D-14/D-15)

### Write-site design for D-15's asymmetry

Exact call sites, `[CODE]`-verified this session:
- `_isWithinStaleWindow` — `node_helper.js:1305-1308` (network/fetch-age staleness; unrelated to this check, unchanged)
- `_noteStaleEntry` — `node_helper.js:1329-1335` (the function that writes `_oldestStaleAt`; **must NOT be called** for a data-age trip, per D-15)
- `_oldestStaleAt` field — `node_helper.js:177` (init), `:1331-1333` (write)
- Final assembly — `node_helper.js:2224-2227`: `...(anyStale ? { _stale: true, _staleAsOf: this._oldestStaleAt } : {})`

The data-age check is a **new, independent axis** layered on top of a *successful* fetch (the layer returned real features; this has nothing to do with `fetchResult.stale`/`fetchResult.failed`, which the row still checks and folds into `anyStale` exactly like `_runArcGisDayProduct` does at `:237`). Design:

```js
// Inside the new per-layer loop, after a successful fetch + extractPolygons +
// evaluatePolygonsCollectAll for that layer (hits.length may be 0 legitimately —
// see the zero-feature note below):
if (hits.length > 0) {
  const filedate = hits[0].feature.properties.idp_filedate;
  if (typeof filedate === "number" &&
      (Date.now() - filedate) > row.maxDataAgeHours * 60 * 60 * 1000) {
    anyStale = true;
    // Deliberately NOT this._noteStaleEntry(...) — D-15's asymmetry. Comment
    // this at the write site: a data-age trip must reach the ⚠ badge without
    // dragging the "N minutes ago" figure, which describes fetch/network
    // recency (Phase 14 D-04's global-only rule), not WPC's own publish age.
  }
}
```

**Confirmed live this session: `idp_filedate` is per-layer, not per-service** (three distinct filedates across six layers today, one nearly 24h stale relative to its siblings) — the check above correctly runs inside the per-layer loop, reading that layer's own first feature. This also confirms it is safe to read `hits[0]` rather than scanning for a max, since every feature within one layer shares an identical `idp_filedate` (verified across all 30 non-empty-layer features pulled today).

**Zero-feature layers have no `idp_filedate` to check.** Both Precipitation layers returned 0 features today. There is no ArcGIS metadata call this phase's scope covers that would surface a layer-level "last generated" timestamp independent of a feature (a service-level `?f=json` call returns `serviceDescription` prose, not a per-layer freshness timestamp). Recommend the same precedent WSSI-03 already established: **a genuinely empty layer is a real answer, not a staleness signal** — skip the age check entirely for a layer with zero returned features, exactly as WSSI's off-season empty-array handling does today (no special-case code needed; the `if (hits.length > 0)` guard above already produces this behavior for free).

### Newly identified pitfall: day-offset drift on a cache hit

**Not addressed by any of CONTEXT.md's sixteen decisions — surfaced by this session's direct code read, HIGH confidence, derived from the existing cache-write contract.**

Every other `arcgis-day-layers` product caches a **final, already-resolved** value per day (`_runArcGisDayProduct`, `node_helper.js:267-273`: `this._geoJsonCache.set(url, { ..., result: { value, validTime }, ... })`). That is safe for ERO/WSSI because their day-to-URL mapping is what changes: `dayLayers[1]` is *always* "Day 1," and WPC republishes fresh Day-1 content under that same URL each cycle — the cached `{value}` for "Day 1" stays correct for as long as the ETag says the bytes are unchanged, because "Day 1" is a property of the URL, not of the clock.

This product is structurally different: the day key (`day3`…`day14`) is derived from comparing a feature's **static** `start_date`/`end_date` against **today's live UTC date** — a value that advances every 24 hours regardless of whether WPC's bytes changed. Concretely: a `Heavy Rain` feature with `start_date`/`end_date` fixed at epoch `1787990400000` (Aug 29 00:00Z) is "day3" on Wed Aug 26 but would be "day2" on Thu Aug 27 — **even though the feature's bytes never changed and the ETag never fired.** Given this product's confirmed Mon-Fri-only cadence, this is not a rare edge case: **every weekend poll, and every poll between issuances on a business day, is exactly this scenario** — the cache legitimately 304s (or serves the stale-fallback body) while "today" has moved.

**If the new runner follows `_runArcGisDayProduct`'s pattern literally** — caching a final `{day3: [...], day4: [...], ...}` object per layer and reusing it verbatim on a cache hit — every hazard silently shifts one day earlier for every day that passes without a fresh WPC issuance. This produces a wrong-but-confident render with no error, no ⚠, and no test that reuses the existing pattern would catch it (the existing probe scenarios that exercise cache hits assert byte-identical *tier* output across a hit, which is the correct invariant for ERO/WSSI but is exactly the wrong invariant here).

**Recommendation:** the cache write for this product's kind must store the **pre-bucketing** extracted result (the `hits` array, or the raw `fetchResult.data`/`cachedResult`), and day-bucketing (`dayOffset`, the full-window guard, and window-band routing) must be **recomputed on every poll — cache hit or miss — against that poll's `todayUtcMs()`**, never persisted as a day-keyed final value. This is the single highest-value architectural finding of this research session; flag it prominently in the plan and in the probe suite (a mutation-provable scenario: freeze the cache with a "yesterday's day-bucketing" fixture, advance the simulated clock by 24h with no upstream change, assert the rendered day keys shifted correctly — see Probe Suite Extension #3).

## Frontend Integration Risk

`MMM-SPCOutlook.js`'s existing helpers **do not fit this product's payload shape** and cannot be reused as-is:

- `dayRiskCount` (`:225-228`) and `blockHasRisk` (`:232-238`) assume a flat `day{N}Risk`/`day{N}Text`/`day{N}Color` block — exactly ERO's/WSSI's shape. This product's payload (per D-01) is `day3: { date, hazards: [...] }` — nested objects, not flat `dayNRisk` keys. `dayRiskCount`'s regex `/^day\d+Risk$/` correctly does **not** match `day3`/`day14` keys, so there is no risk of silent cross-contamination, but there is also no free reuse — a new pair of predicates is needed:
  - a day-grid predicate, e.g. `hazardsOutlookHasAnyDay(block)` — true if any `day3`..`day14` entry's `hazards` array is non-empty
  - a window-band predicate, e.g. `hazardsOutlookHasWindowEntries(block)` — true if the window band array is non-empty
- **Both must be added as new terms in the `getDom` no-risk short-circuit** (`:263-312`), each gated on `this.config.showHazardsOutlook`, following the exact pattern the ERO term (`:293`) and WSSI term (`:299`) already establish: `!(this.config.showHazardsOutlook && (hazardsOutlookHasAnyDay(...) || hazardsOutlookHasWindowEntries(...)))`. **This is the same regression class that shipped in Phase 15** — a location can be inside a window-band `Hazardous Heat` polygon with every day3-day14 hazard array empty, and the gate must not show "No Severe Weather Risk" in that state. Two independently-renderable things (day rows, window band) means two independent terms, not one OR'd predicate that only checks one of them.
- `renderDayBlock` (`:427-437`) — reads `block["day" + d + "Risk"]`/`Color`/`Text`; does not apply. A new renderer is needed that iterates `day3`..`day14`, reads each day's `hazards` array (empty → render nothing for that day, per "absence is silence"), and for each hazard resolves its display color via the payload's own per-entry color/text (mirroring how `renderDayBlock` reads `block["day"+d+"Color"]` off the payload rather than recomputing from a frontend-side map — keep the color-resolution logic backend-side, matching D-01's "carry raw + resolved data into the payload" precedent).
- **No frontend loop is bounded at day 8 that this phase must widen.** The `if (this.config.extended)` block at `:393-400` (`day4`..`day8`) and the `for (let d = 3; d <= 8; d++)` fire-weather loop at `:413` are both genuinely day-1-through-8-scoped products (SPC categorical Day 4-8, fire weather Day 3-8) — neither is a stale bound that silently truncates this new product; this product needs an entirely separate `day3`..`day14` render path, not an extension of either existing loop.
- **`escapeHtml` (`:205-207`) must wrap every rendered hazard label**, not just the advisory band's `label`/`hazardType`. D-11 makes an unmapped label reach `innerHTML` verbatim by design — that is precisely the case `escapeHtml` exists for (WR-12's reasoning, extended one more source). This is the phase's clearest security-relevant surface (see Security Domain).
- **`ADVISORY_SOURCES`-style single-source-of-truth mapping is not needed here** — Hazards Outlook is not a `kml-advisory` row, so it doesn't participate in `enabledAdvisories()`. It needs its own, separate config-flag read (`this.config.showHazardsOutlook`), same as ERO/WSSI's direct `this.config.showExcessiveRain`/`showWinterImpact` reads at `:438`/`:441`.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point-in-polygon containment | A new turf wrapper | `turf.booleanPointInPolygon` via `evaluatePolygonsCollectAll` (new, reuses `extractPolygons`'s output contract) | Same primitive every other product already uses; no new geometry code needed |
| GeoJSON fetch/cache/ETag | A parallel fetch path | `fetchGeoJsonCached` unchanged | ETag confirmed present live (`[CARRIED: STACK.md]`, service still on the same allowlisted host); reusing it is free |
| Date/time parsing | A vendored `moment` require on the backend, or a new date library | `Date.UTC()`/`getUTC*()` only | Backend has zero date-lib dependency today; every timestamp involved is already epoch ms, UTC-midnight-aligned — no parsing needed, only arithmetic |
| Color legend | Visual inspection / hardcoded guesses from a screenshot | `drawingInfo.renderer` fetched live (see Colors table) | Fully machine-readable this session; visual verification (which CONTEXT.md's Deferred Ideas flagged as necessary) turns out to be unnecessary |

**Key insight:** this phase needs exactly two genuinely new pieces of logic — the collect-all evaluator and the day-bucketing arithmetic — and both are small, isolated functions layered on primitives (`turf`, `Date.UTC`) the codebase already trusts. Every other piece (fetch, cache, staleness plumbing, escaping) is a straight reuse of an existing pattern with one parameter changed.

## Common Pitfalls

Carried forward from `[CARRIED: PITFALLS.md]`, re-verified or refined where noted:

1. **`LABEL` vs `label` (Pitfall 8)** — `[CODE]`-reconfirmed this session: `extractPolygons` still hardcodes `f.properties.LABEL` at `node_helper.js:1005`. The registry row's `toValue` must read `f.properties.label` directly off the `f` argument (see Registry Kind & Row Design) — this is the exact idiom ERO/WSSI already use to route around the same trap.
2. **No severity ladder (Pitfall 1)** — unchanged; D-02's collect-all design is the correct response, confirmed by this session's live data (multiple co-occurring hazard *types*, e.g. today's Temperature layer had both `High Winds` and `Hazardous Heat` active simultaneously — a real example of the "carries every hazard" requirement, not a hypothetical).
3. **Non-uniform per-day resolution (Pitfall 3)** — **refined this session**: the claim that Temperature/Wildfire layers always span the *entire* nominal window is empirically false as of today's live pull (spans of 1, 4, 5, and 6 days observed, not always 5 or 7). Does not change the implementation (HAZ-02 routes these unconditionally to the window band) but strengthens the case that D-06's per-feature observed-span labeling is necessary, not conservative.
4. **`idp_filedate` per-layer, not per-service** — **new finding this session**, not previously documented: three distinct filedates observed across six layers in one poll. The freshness check must never assume one shared timestamp for the row.
5. **Day-offset cache staleness** — **new finding this session** (see Freshness Integration) — the single highest-priority pitfall this research surfaces. Reusing `_runArcGisDayProduct`'s "cache the final resolved value" pattern verbatim would silently misdate every hazard by one day per elapsed day without a fresh WPC issuance.
6. **Zero-feature layers** — confirmed live and real (both Precipitation layers, today). Must render no rows and raise no error/stale signal, per the WSSI-03 precedent already established in this codebase.
7. **Cache-key drift (Pitfall 11)** — applies unchanged: the six layer URLs must be fixed constants (as shown in `hazardsOutlookLayers` above), built once via the existing non-overridable `buildArcGisQuery`, never constructed inline at a second call site.
8. **CRS (Pitfall 6)** — not applicable to this specific service: `[CARRIED: PITFALLS.md]` already confirmed `hazards/cpc_weather_hazards`'s native SR is `wkid: 4326` (unlike ERO/WSO), so `f=geojson` is a formality here rather than a reprojection-correctness requirement — still mandatory per the project's non-overridable `buildArcGisQuery` (Phase 14 D-09), just lower marginal risk than it was for ERO.

## State of the Art

| Old Approach (this codebase, ERO/WSSI) | New Approach (this product) | Why Changed | Impact |
|---|---|---|---|
| `evaluatePolygons` reduces to one winning tier via a comparator | `evaluatePolygonsCollectAll` returns the full containing set | No severity ladder exists in this product's schema (D-02) | New sibling function, not a modification — every existing comparator-based product is unaffected |
| Day key ↔ URL (`dayLayers[d]` → a fixed layer id per day) | Day key ↔ **live clock comparison against a static feature date**, re-derived every poll | This product's URL is per hazard-family, not per day; the day is inside the feature, not the endpoint | Cache-write shape must change from "cache the final resolved value" to "cache the pre-bucketing extracted set" — see Freshness Integration |
| Palette sourced from a PNG legend, visually verified (`[CARRIED: FEATURES.md]`'s stated plan) | Palette sourced from live `drawingInfo.renderer`, machine-read | The prior research round's LOW-confidence assumption ("colors are PNG-only") was wrong when actually queried | No visual-verification step needed at implementation time; cite the live JSON URL instead |

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `start_dt2`/`end_dt2`/`valid_time_dt`/`validendtime_dt` (seen in the Precipitation layers' field list but never populated in a live feature this session) are parallel date-typed representations of `start_date`/`end_date` and are out of scope for this phase | Live Verification §4 | Low — this phase is explicitly scoped to `start_date`/`end_date` per CONTEXT.md's Phase Boundary; if these fields turn out to carry different information (e.g., a revision timestamp) it would only matter for a future phase, not this one |
| A2 | D-04's "span equals its layer's full nominal window" means *exact offset alignment* to `[3,7]`/`[8,14]`, not merely "same duration, any position" | Date Bucketing Algorithm | Medium — untested against live data this session (Precipitation layers returned 0 features); a duration-only reading would route a 5-day Precipitation feature spanning e.g. day4-day8 to the window band even though it doesn't cover day3 or day9-14, which may or may not be the intended behavior. Flagged explicitly in Open Questions for discuss-phase/planner confirmation |
| A3 | A zero-feature layer should skip the `maxDataAgeHours` check entirely rather than being treated as maximally stale or maximally fresh | Freshness Integration | Low-Medium — matches the WSSI-03 precedent this codebase already ships, but that precedent was for a genuinely seasonal product; if WPC's zero-feature response for this product ever means "the file exists but this hazard-type wasn't drawn this cycle" rather than "the whole layer's issuance is current," the distinction is invisible to this phase's data (no layer-level filedate is fetched when features is empty) |

## Open Questions

1. **D-04's "full nominal window" exact-match semantics (see A2 above).**
   - What we know: the guard exists to keep a window-level Precipitation hazard from spreading identically across every day (Pitfall 3's spread failure mode).
   - What's unclear: whether "equals its layer's full nominal window" means exact offset alignment (`[3,7]` precisely) or just "5 (or 7) days long, wherever positioned."
   - Recommendation: implement exact-alignment (this research's Date Bucketing Algorithm does), and confirm with the user during planning/discuss-phase before implementation — this is untestable against live data this session since both Precipitation layers were empty. The probe suite needs a synthetic fixture regardless of which reading is chosen.

2. **ROADMAP success criterion 4 vs D-10's `showDrought` toggle.**
   - What we know: ROADMAP.md's Phase 16 criterion 4 states "Flooding and Drought sub-labels never appear," unqualified. CONTEXT.md's D-10 makes Drought a user-facing opt-in (`showDrought`, default `false`).
   - What's unclear: whether the roadmap criterion should be read as "at default config" (which D-10 satisfies) or as an absolute constraint the toggle would violate.
   - Recommendation: CONTEXT.md's additional_context section already flags this explicitly ("the criterion holds at default config and drought display is an explicit opt-in") — the planner should carry this note into the plan and the verifier's success-criteria checklist should test criterion 4 at `showDrought: false` (the shipped default), not as an absolute prohibition.

3. **Where the day-offset re-bucketing (Freshness Integration's headline finding) is enforced structurally, not just by convention.**
   - What we know: the correct behavior is "recompute day-bucketing from cached raw features on every poll."
   - What's unclear: whether to enforce this by simply never writing a day-keyed cache entry (only caching pre-bucketing `hits`/raw geojson, same shape `fetchGeoJsonCached`'s own cache already produces), or by writing a day-keyed cache entry but stamping it with the `todayUtcMs()` it was computed against and invalidating on mismatch.
   - Recommendation: the former is simpler and matches this project's stated preference for "structural enforcement over convention" (CONTEXT.md's Specific Ideas section) — don't cache a value whose correctness depends on an external clock; cache only clock-independent data (the raw feature set) and recompute the clock-dependent step every time.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| `mapservices.weather.noaa.gov` reachability | All six layer fetches | ✓ (live-verified this session, 200 on every layer + service + drawingInfo call) | ArcGIS REST `currentVersion: 11.3` (unchanged from `[CARRIED: STACK.md]`) | `fetchGeoJsonCached`'s existing stale-fallback/hard-failure handling (unchanged) |
| Node.js `Date`/`Date.UTC` | Day-bucketing arithmetic | ✓ (built-in, no install) | n/a | n/a |
| `@turf/turf` `booleanPointInPolygon` | Collect-all evaluator | ✓ (already a dependency, unchanged) | `^7.2.0` per `package.json` | n/a |

No missing dependencies, no fallback needed — this phase adds no new external dependency of any kind.

## Security Domain

`workflow.security_enforcement` is enabled (ASVS L1, block on `high`) per this session's read of `.planning/config.json`.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | Yes | `_isFeatureCollection` gate (unchanged, reused) before any feature reaches `extractPolygons`; `buildArcGisQuery`'s non-overridable `layerId`/`baseUrl` validation (unchanged, reused — the six new layer ids `1,4,7,3,6,8` pass its existing `Number.isInteger(layerId) && layerId >= 0` check) |
| V4 Access Control (host allowlisting) | Yes | `buildArcGisQuery` already restricts `baseUrl` to `https://mapservices.weather.noaa.gov/` (Phase 14 D-09, unchanged) — the new `HAZARDS_BASE_URL` constant must be that exact host, no new allowlist entry needed since it's the same MapServer host `hazards/wpc_precip_hazards` and `outlooks/wpc_wssi` already use |
| — Redirect handling | Yes | `redirect: "error"` applies to every fetch via `withTimeout`/`_fetch` (unchanged, reused; this phase adds no new fetch call site outside that helper) |
| — Output encoding (XSS) | Yes | **This phase's clearest new surface.** D-11 means an unmapped hazard `label` string (attacker-influenceable only in the sense that it's unauthenticated remote text from a NOAA endpoint, same trust boundary as every other `label`/`outlook`/description field this module already renders) reaches `innerHTML` verbatim by design. **Every hazard label rendered in the new day-row and window-band renderers must pass through `escapeHtml`** (`MMM-SPCOutlook.js:205-207`), exactly as advisory `label`/`hazardType` already do (WR-12's established pattern) — this is not optional styling, it is the same control class 15's WR-08 finding already established as load-bearing for this codebase |
| V6 Cryptography | No | No crypto/secrets surface in this phase |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Unescaped remote label string reaching `innerHTML` | Tampering / Spoofing (a hostile or compromised upstream response injects markup) | `escapeHtml` on every label before concatenation into `wrapper.innerHTML` — same control already proven in this codebase for advisory entries |
| Off-host redirect from a compromised/hijacked NOAA DNS entry | Spoofing | `redirect: "error"` (existing, unchanged) |
| Oversized/malformed response body exhausting memory or causing a partial-write geometry corruption | Denial of Service | `_isFeatureCollection` + per-feature `try/catch` around `turf.polygon`/`turf.multiPolygon` construction (existing, unchanged, extended to the new collect-all evaluator's own `turf.booleanPointInPolygon` call per the per-item isolation shown above) |
| Cross-layer response confusion (a bad actor or misconfigured proxy serving one layer's content for another layer's URL) | Tampering | Not newly introduced by this phase — the same risk (and the same mitigation, none beyond HTTPS + the fixed host allowlist) exists for every other ArcGIS layer this module already fetches; out of scope to solve here |

## Sources

### Primary (HIGH confidence, `[LIVE 2026-08-26]`, this session)
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{1,4,7,3,6,8}/query?where=1%3D1&outFields=*&f=geojson` — live queried, all six layers, full feature/property dump
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer?f=json` — live queried, `serviceDescription` (cadence re-confirmation), layer inventory
- `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{1,4,7,3,6,8}?f=json` — live queried, `drawingInfo.renderer.uniqueValueGroups` (full color table), field inventory
- `node_helper.js` (this repo, read in full for the sections cited above: `:160-450`, `:660-750`, `:960-1090`, `:1295-1450`, `:2150-2250`) — `[CODE]`
- `MMM-SPCOutlook.js` (this repo, read in full) — `[CODE]`
- `productRegistry.js` (this repo, read in full) — `[CODE]`
- `.planning/config.json` — `[CODE]`, confirms `nyquist_validation: false`, `security_enforcement` absent (treated as enabled per this agent's own instructions)

### Secondary (carried forward, `[CARRIED]`, not re-verified this session where noted)
- `.planning/research/STACK.md` §"1 & 2" — endpoint discovery, schema, ETag confirmation
- `.planning/research/PITFALLS.md` Pitfalls 1, 3, 4, 8, 9, 10 — refined/reconfirmed above where noted
- `.planning/research/FEATURES.md` §A1/A2 — label domain (fully reconfirmed live this session); color claims superseded (see Colors)
- `.planning/research/SUMMARY.md` Conflict 2, Conflict 3 — decision framing, superseded by CONTEXT.md's locked D-01..D-16

### Tertiary (LOW confidence)
- None newly introduced this session — every claim above is either live-verified or a direct code read.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — zero new dependencies, live-reconfirmed endpoint/schema stability across an 11-day gap
- Architecture (registry kind, collect-all evaluator, date bucketing, freshness): HIGH — derived from direct reads of the exact functions being extended (`extractPolygons`, `evaluatePolygons`, `_runArcGisDayProduct`, `fetchGeoJsonCached`, `_noteStaleEntry`), not inferred
- Colors: HIGH — live `drawingInfo` fetch, supersedes the prior round's LOW-confidence PNG-swatch assumption
- Day-offset cache staleness pitfall: HIGH confidence in the mechanism (directly derived from reading the existing cache-write code), MEDIUM confidence in exact severity/frequency without a live weekend observation (the mechanism is proven; the "how often does it actually bite" question needs the same live-idp_filedate weekend observation CONTEXT.md's Deferred Ideas already flags for tightening D-14)
- Pitfalls: HIGH for data-format/geometry (all live-verified), MEDIUM for the untested D-04 full-window-guard semantics (Open Question 1) since no live Precipitation feature existed to test against this session

**Research date:** 2026-08-26
**Valid until:** ~7 days for the live-data-dependent claims (feature counts/spans/idp_filedate values will change on WPC's next business-day issuance); ~30 days for the schema/endpoint/color findings, which have now been independently confirmed stable across two live sessions 11 days apart
