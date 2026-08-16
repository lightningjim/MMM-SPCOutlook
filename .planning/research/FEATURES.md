# Feature Research

**Domain:** MagicMirror² weather-hazard display module — WPC/CPC product integration (v2.0)
**Researched:** 2026-08-15
**Confidence:** MEDIUM (product structure, day ranges, and probability/severity scales are HIGH confidence from official NOAA sources; exact hex/RGB symbology for several products is LOW-MEDIUM confidence — embedded in PNG legend swatches, not published as text — and should be visually verified during implementation)

---

## Part A — Product Reference

For each product: hazard types encoded, severity/probability scale with canonical short labels and colors, meaning, and issuance cadence. "Confidence" reflects source strength per finding.

### A1. WPC Day 3–7 U.S. Hazards Outlook

**What it is:** A composite categorical map assembled by WPC from SPC, CPC, and WPC's own guidance, showing *named hazard areas* (presence/absence, not a probability tier scale) for the Day 3–7 period. It is explicitly a downstream repackaging of other centers' products — e.g., its severe-weather layer is "based on Storm Prediction Center medium range severe weather outlooks of 15% or greater" (HIGH confidence, official WPC source: wpc.ncep.noaa.gov/threats/threats.php).

**Layer structure (from live ArcGIS MapServer `hazards/cpc_weather_hazards`, layer id 1 "3-7 Day Temperature Outlook" and id 4 "3-7 Day Precipitation Outlook" and id 7 "3-7 Day WildFire/Drought"; HIGH confidence, fetched directly):**

| Group layer | Named hazard categories (exact legend labels) |
|---|---|
| Temperature | Frost/Freeze · Hazardous Heat · Hazardous Cold · High Winds · Significant Waves |
| Precipitation | Flooding Likely · Flooding Occurring or Imminent · Flooding Possible · Freezing Rain · Heavy Precipitation · Heavy Rain · Heavy Snow · **Severe Weather** |
| Wildfire/Drought | Critical Wildfire Risk · Severe Drought |

**Scale:** No probability tiers — each hazard is a binary "this named threat is expected here" polygon. Multiple hazard types are multiplexed into one MapServer layer distinguished by an attribute/label field, not one-endpoint-per-hazard like SPC's cigtorn/cighail/cigwind pattern the module already uses. This is a real parsing-complexity delta versus existing code.

**Colors:** Not documented in accessible text form (legend swatches are embedded PNGs in the ArcGIS legend endpoint). LOW confidence on exact hex; MEDIUM confidence that the product uses one fixed color per hazard *type* (not a severity gradient), consistent with it being a presence/absence map. Flag for visual verification against `wpc.ncep.noaa.gov/threats/threats.php` at implementation time.

**Issuance:** Updated **twice daily, 7 days/week** for CONUS; Alaska/Hawaii discussions updated once daily. (HIGH confidence, official WPC page.)

**User-facing meaning:** "A hazard of this named type is plausible somewhere in this area 3–7 days out." No further granularity — no percent, no tor/hail/wind breakdown, no low/high tier.

Sources: [About the WPC Day 3-7 Hazards Outlook](https://www.wpc.ncep.noaa.gov/threats/about_hazards.pdf), [Day 3-7 Hazards Outlook](https://www.wpc.ncep.noaa.gov/threats/threats.php), [hazards/cpc_weather_hazards MapServer](https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer)

---

### A2. CPC Day 8–14 U.S. Hazards Outlook

**What it is:** The Week-2 extension of the same composite hazards concept, issued by CPC rather than WPC, sharing the same underlying MapServer service group (`cpc_weather_hazards`, layer ids 3/6/8 = "8-14 Day" variants of Temperature/Precipitation/Wildfire-Drought).

**Layer structure (HIGH confidence, fetched directly):**

| Group layer | Named hazard categories (exact legend labels) |
|---|---|
| Temperature | Excessive Heat · High Winds · Much Above Normal Temperatures · Much Below Normal Temperatures · Significant Waves |
| Precipitation | Flooding Likely · Flooding Occurring or Imminent · Flooding Possible · Freezing Rain · **Heavy Ice** · Heavy Precipitation · Heavy Rain · Heavy Snow · Severe Weather |
| Wildfire/Drought | Critical Wildfire Risk · Severe Drought · **Rapid Onset Drought Risk** |

**Scale:** Same presence/absence categorical model as WPC Day 3-7 for the GIS/map product. Note: an older CPC text-product description (2021 PDF) describes a **Slight (20–40%) / Moderate (40–60%) / High (≥60%)** probability scale for temperature, precipitation, and wind specifically, with Rapid Onset Drought, frozen precipitation, and flooding kept categorical without percentages. MEDIUM confidence — this may describe the underlying data model behind the named-hazard polygons (i.e., a "Heavy Snow" polygon is only drawn where that hazard exceeds some probability threshold) rather than something displayed to the end user as a percent. Recommend treating the CPC output the same as WPC's — named hazard presence, no user-visible percent — unless implementation-time inspection of the live GeoJSON attributes shows an explicit probability field.

**Colors:** Same caveat as A1 — not available as text; LOW-MEDIUM confidence.

**Issuance:** Documented as "released every weekday" in the 2021 product description PDF, but a live fetch on 2026-08-15 (a Saturday) showed a same-day issuance timestamp. LOW-MEDIUM confidence on exact cadence — recommend the module treat it as "daily, ETag-gated" (consistent with the project's existing caching strategy) rather than hard-coding a weekday-only assumption.

**User-facing meaning:** Same as A1, shifted to the 8–14 day window — outlook-grade, low-confidence, "watch this space" signal rather than an actionable forecast.

Sources: [hazards/cpc_weather_hazards MapServer](https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer), [Week-2 US Hazards Outlook description (2021)](https://www.cpc.ncep.noaa.gov/products/predictions/threats/week2_hazards_info_May2021.pdf), [CPC Probabilistic Hazards Outlook](https://www.cpc.ncep.noaa.gov/products/predictions/threats/threats.php)

---

### A3. WPC Excessive Rainfall Outlook (ERO)

**What it is:** WPC's purpose-built flash-flood-risk forecast — the probability that rainfall will exceed Flash Flood Guidance (FFG) within 40 km of a point. This is the rainfall analog to SPC's convective outlook: a real 4-tier probability scale, forecaster-issued, with its own discussion product.

**Scale (HIGH confidence — official WPC ERO page + live MapServer legend, both agree):**

| Label | Threshold | Color (as documented) |
|---|---|---|
| Marginal | ≥5% | Green contour |
| Slight | ≥15% | Yellow contour |
| Moderate | ≥40% | Red contour |
| High | ≥70% | Pink/magenta (MEDIUM confidence — described qualitatively as "pink" by a secondary source; not found as hex) |

**Day range — important boundary detail:** The product natively covers **Day 1 through Day 5** (confirmed via live `hazards/wpc_precip_hazards` MapServer: 5 layers, "Excessive Rainfall Day 1"–"Day 5"). The **High** category is **only issued for Days 1–3**; Day 4 and Day 5 legends omit it entirely (3 categories only). The milestone's stated scope is **"Days 1–3"** — narrower than the product's actual Day 1–5 range. This is a deliberate scope choice, not a product limitation; see Part B precedence table for the consequence.

**Issuance cadence (HIGH confidence, official MapServer description):** Day 1 updated 3×/day (0100Z, 0830Z, 1500Z); Days 2–3 updated 2×/day (0830Z, 2030Z); Days 4–5 cadence not documented in the fetched source, presumed once daily.

**User-facing meaning:** "There is at least an N% chance that rain in this area will exceed the amount needed to cause flash flooding." High risk is rare and severe — WPC's own framing: issued only when widespread, significant flash flooding is expected, and historically associated with a large share of flood fatalities/damage.

Sources: [WPC ERO Interactive Display](https://www.wpc.ncep.noaa.gov/qpf/excessive_rainfall_outlook_ero.php), [hazards/wpc_precip_hazards MapServer](https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer), [PDD ERO Days 4-5](https://www.weather.gov/media/notification/PDDs/PDD_ERO_Days_4_5_T2O.pdf), [Weather.com: Why High Risk matters](https://weather.com/safety/floods/news/2024-08-05-high-risk-flood-excessive-rainfall-outlook-noaa)

---

### A4. WPC Winter Weather Outlook — Winter Storm Severity Index (WSSI), Days 1–3

**What it is:** WPC's impact-based winter forecast, combining NDFD forecast fields with climatological/population data. Distinct from the separate **WSSI-P** (probabilistic, Days 1–7, updated every 6 hours) — the milestone's "Days 1-3" scope matches the deterministic **WSSI**, not WSSI-P.

**Scale (MEDIUM-HIGH confidence, multiple agreeing sources):** Six-level impact scale: **Winter Weather Area** (hazard expected but not expected to disrupt daily life) → **Limited** → **Minor** → **Moderate** → **Major** → **Extreme**. Exact hex colors not found in text form; the product is documented to have a color legend but only as an image swatch — LOW confidence on hex, flag for visual verification.

**Hazard components (HIGH confidence, fetched directly from live MapServer `outlooks/wpc_wssi`):** Not a single severity value — five separate breakdown layers, each with Day 1 / Day 2 / Day 3 / Days 1-3 composite sub-layers:
- Overall Impact
- Snow Amount
- Snow Load
- Ice Accumulation
- Blowing Snow

**Issuance:** Updates every **2 hours**. (MEDIUM confidence, single secondary source; recommend treating as "frequent enough that ETag-gating is essential," consistent with existing caching approach.)

**User-facing meaning:** Not "how much snow" but "how much this snow will disrupt daily life" — Major/Extreme implies widespread travel disruption, infrastructure strain, or life-threatening conditions; Minor/Limited implies a nuisance-level event.

Sources: [WSSI Web Display](https://www.wpc.ncep.noaa.gov/wwd/wssi/wssi.php), [outlooks/wpc_wssi MapServer](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer), [WSSI Primer](http://www.wpc.ncep.noaa.gov/wwd/wssi/WSSI_Primer.pdf), [WSSI-P Web Display](https://www.wpc.ncep.noaa.gov/wwd/wssi/prob_wssi.php)

---

### A5. WPC Mesoscale Precipitation Discussion (MPD)

**What it is:** WPC's short-fuse (1–6 hour lead time) heavy-rain/flash-flood discussion product — the precipitation-focused analog to SPC's Mesoscale Discussion (MCD), which the module already consumes via `ActiveMD.kmz`. **Not day-scoped** — it describes an imminent, currently-unfolding mesoscale event, typically covering an area "roughly half the size of Kansas."

**Formats (HIGH confidence, official WPC page):** Text (WMO header AWUS01 KWNH), Shapefile (via WPC FTP), and KML — same shapefile/KML availability pattern the existing SPC MD handling already parses, meaning this is architecturally the closest new product to something already built.

**Comparison to SPC MCD (MEDIUM confidence, multiple agreeing sources):** SPC MCDs cover convective hazards (tornado/hail/wind) *and* can cover winter mesoscale events; WPC MPDs cover heavy-rain/flash-flood mesoscale events specifically. They are issued independently by different desks — an MPD in effect does not imply or exclude a concurrent SPC MD.

**Issuance:** As-needed, no fixed schedule — issued when a flash-flood-relevant mesoscale feature is identified, ideally 1–6 hours ahead of onset. Two sub-types exist (general flood threat since 2013; atmospheric-river-specific since 2015) — not necessary to distinguish for display purposes.

Sources: [WPC Mesoscale Precip. Discussions](https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php), [IEM WPC MPD Shapefile Download](https://mesonet.agron.iastate.edu/request/gis/wpc_mpd.phtml), [SPC Mesoscale Discussions](https://www.spc.noaa.gov/products/md/)

---

### A6. NWS/WPC HeatRisk

**What it is:** A joint NWS/CDC 5-level, health-impact-framed daily heat forecast — graduated, not binary, and the most informative heat product of the six.

**Scale (HIGH confidence, multiple agreeing official/near-official sources):**

| Level | Label | Color | Meaning |
|---|---|---|---|
| 0 | Little to No Risk | Green | Little to no risk from expected heat |
| 1 | Minor | Yellow | Affects primarily heat-sensitive individuals, especially without cooling/hydration |
| 2 | Moderate | Orange | Affects most heat-sensitive individuals; possible impacts on some health systems/heat-sensitive industries |
| 3 | Major | Red | Affects anyone without effective cooling/hydration; impacts likely on some health systems, heat-sensitive industries, infrastructure |
| 4 | Extreme | Magenta | Rare/long-duration extreme heat with little overnight relief; impacts likely on most health systems, industries, infrastructure |

Approximate hex (LOW-MEDIUM confidence — corroborated by a search summary, not fetched from an official swatch table): Green ≈ `#00FF00`/light green, Yellow `#FFFF00`, Orange `#FFA500`, Red `#FF0000`, Magenta `#8B00FF`/`#C31CE5`-family. Verify visually before hard-coding.

**Forecast range:** 7 days (Day 1–7). Level 4/Extreme specifically requires both overnight lows and daytime highs to be in roughly the top 5% of the historical distribution for ≥72 hours, or near all-time records.

**Data delivery — critical architecture finding (HIGH confidence, fetched directly):** HeatRisk is a **raster product**, served via ArcGIS **ImageServer** (`https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer`), not a feature/vector service. No GeoJSON or shapefile point-query endpoint exists. This confirms PROJECT.md's framing ("raster product, needs point-queryable endpoint"). However, ArcGIS ImageServer REST APIs universally expose an `/identify` operation that accepts a point geometry and returns the pixel value at that location in a single JSON response — no polygon math or turf.js needed for this one product, just an HTTP GET per configured lat/lon, once per day layer. (MEDIUM-HIGH confidence — this is standard Esri ImageServer REST behavior per general documentation knowledge; the exact query parameters for *this* endpoint were not live-tested and should be verified at implementation time.) This is architecturally simpler than every other product in this milestone, but represents a different integration pattern (single point identify vs. point-in-polygon against a fetched-and-cached GeoJSON).

**Issuance:** Not explicitly documented in fetched sources; follows the NDFD grid refresh cycle — recommend treating as daily with the module's existing ETag-based cache, same as other sources. MEDIUM confidence.

Sources: [NWS HeatRisk Fact Sheet](https://www.weather.gov/media/mlb/pdfs/NWS%20HeatRisk%20Fact%20Sheet.pdf), [Understanding HeatRisk](https://www.weather.gov/media/aly/FactSheets/Understanding-HeatRisk.pdf), [WPC HeatRisk](https://www.wpc.ncep.noaa.gov/heatrisk/), [NWS_HeatRisk ImageServer](https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer), [HeatRisk Data/KML page](https://www.wpc.ncep.noaa.gov/heatrisk/data.html)

---

## Part B — Cross-Source Overlap Map (highest-value output)

### B1. Full coverage matrix

Rows = hazard *type* as actually used by a data source (not raw product name — several products bundle multiple hazard types). Columns = forecast day. ● = source has coverage for that day at that granularity.

| Hazard type | Source | Days 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9–14 | Granularity |
|---|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|---|
| Severe convective (tor/hail/wind) | **SPC Convective Outlook** (existing) | ● | ● | ● | ● | ● | ● | ● | ● | — | Categorical (TSTM–HIGH) + probabilistic CIG1-3 tiers, days 1-2 full breakdown, day 3 CIG-only, days 4-8 categorical only |
| Severe weather (binary) | WPC Day 3-7 Hazards Outlook | | | ● | ● | ● | ● | ● | | | Presence/absence only |
| Fire weather | **SPC Fire Weather Outlook** (existing) | ● | ● | ● | ● | ● | ● | ● | ● | — | 3-tier (Elevated/Critical/Extreme) |
| Critical Wildfire Risk (binary) | WPC Day 3-7 Hazards Outlook | | | ● | ● | ● | ● | ● | | | Presence/absence only |
| Critical Wildfire Risk (binary) | CPC Day 8-14 Hazards Outlook | | | | | | | | | ● | Presence/absence only |
| Excessive rain / flash flood probability | WPC ERO | ● | ● | ● | ●¹ | ●¹ | | | | | 4-tier (Marginal/Slight/Moderate) + High on days 1-3 only |
| Heavy Rain / Heavy Precipitation (binary) | WPC Day 3-7 Hazards Outlook | | | ● | ● | ● | ● | ● | | | Presence/absence only |
| Heavy Rain / Heavy Precipitation (binary) | CPC Day 8-14 Hazards Outlook | | | | | | | | | ● | Presence/absence only |
| "Flooding" (river/actual flood status) | WPC/CPC Hazards Outlook | | | ● | ● | ● | ● | ● | | ● | Sourced from National Flood Outlook (not one of the 6 target products) |
| Winter impact (snow/ice/blowing snow/load) | **WPC Winter Weather Outlook (WSSI)** | ● | ● | ● | | | | | | | 6-level impact scale, 5 hazard components each |
| Heavy Snow / Freezing Rain (binary) | WPC Day 3-7 Hazards Outlook | | | ● | ● | ● | ● | ● | | | Presence/absence only |
| Heavy Snow / Freezing Rain / Heavy Ice (binary) | CPC Day 8-14 Hazards Outlook | | | | | | | | | ● | Presence/absence only |
| Heat | **NWS HeatRisk** | ● | ● | ● | ● | ● | ● | ● | | | 5-level graduated (0-4) |
| Hazardous Heat (binary) | WPC Day 3-7 Hazards Outlook | | | ● | ● | ● | ● | ● | | | Presence/absence only |
| Excessive Heat / Much Above Normal (binary) | CPC Day 8-14 Hazards Outlook | | | | | | | | | ● | Presence/absence only |
| Cold / Frost-Freeze | WPC Day 3-7 Hazards Outlook | | | ● | ● | ● | ● | ● | | | Presence/absence only — no graduated cold product exists |
| Much Below Normal Temps (binary) | CPC Day 8-14 Hazards Outlook | | | | | | | | | ● | Presence/absence only |
| High Winds / Significant Waves (non-convective) | WPC Day 3-7 Hazards Outlook | | | ● | ● | ● | ● | ● | | | Presence/absence only — distinct phenomenon from SPC windCig (convective gusts) |
| High Winds / Significant Waves (non-convective) | CPC Day 8-14 Hazards Outlook | | | | | | | | | ● | Presence/absence only |
| Drought / Rapid Onset Drought | WPC/CPC Hazards Outlook | | | ● | ● | ● | ● | ● | | ● | Bundled into same layer as Wildfire; not a milestone target |
| Short-fuse flash flood (not day-scoped) | SPC MD (existing) + **WPC MPD** | current only, no day dimension | | | | | | | | | Text/shape/KML discussion, 1-6 hr lead |

¹ ERO natively covers Days 4-5 too, but the milestone's stated target scope is "Days 1-3" — see B3 for the consequence of that scope choice.

**Every cell is accounted for.** Cells with no entry for a hazard/day combination (e.g., no cold-hazard product for Days 1-2, no non-convective-wind product for Days 1-2) are genuine gaps in the six-product set — SPC's existing products don't cover those hazard types at all, so there is nothing to supersede or fall back to. These are noted explicitly in B2.

### B2. Precedence table (proposed — for user approval)

| Hazard type | Preferred source | Day range (preferred) | Why preferred | Gap-filler / next source | Days covered by gap-filler | Residual gap |
|---|---|---|---|---|---|---|
| Severe convective (tornado/hail/wind/general severe) | **SPC Convective Outlook** (existing) | 1–8 | Categorical (TSTM–HIGH) *plus* probabilistic per-hazard CIG tiers on days 1-3, forecaster-authored, updated multiple times/day; WPC's flag is literally derived from SPC's own Day 4-8 outlook at the 15% threshold — SPC is the primary source, not a peer | *(none needed)* | — | None — SPC's existing 1-8 range fully contains and exceeds WPC's 3-7 "Severe Weather" flag. **WPC's Severe Weather category should be suppressed entirely, on every day it appears.** |
| Fire weather / wildfire | **SPC Fire Weather Outlook** (existing) | 1–8 | 3-tier categorical (Elevated/Critical/Extreme), per-day granularity, existing DN-based parsing already built | CPC Day 8-14 "Critical Wildfire Risk" | 9–14 | None — SPC doesn't reach past day 8, CPC's binary flag is the only source there; clean handoff |
| Excessive rain / flash-flood risk | **WPC ERO** | 1–3 *(milestone scope)* | Purpose-built 4-tier probability (Marginal/Slight/Moderate/High) tied to Flash Flood Guidance exceedance, updated up to 3×/day, forecaster discussion attached | WPC Day 3-7 "Heavy Rain"/"Heavy Precipitation" (binary) | 4–7 | **Day 4-5 quality dip is self-imposed**: ERO natively supports Days 4-5 at the same 3-tier granularity (minus High), but milestone scope caps it at Day 3. If ERO scope is not widened, Days 4-5 fall back to WPC's binary flag even though a better source exists and could be fetched with the same integration pattern. Recommend flagging this explicitly for the roadmap decision: extend ERO to Day 5, or accept the coarser Day 4-5 fallback. |
| Winter impact (snow/ice/blowing snow) | **WPC Winter Weather Outlook (WSSI)** | 1–3 | 6-level impact scale across 5 separate hazard components (overall/snow amount/snow load/ice/blowing snow), 2-hour update cadence — far more granular than a binary flag | WPC Day 3-7 "Heavy Snow"/"Freezing Rain" (binary) → then CPC Day 8-14 "Heavy Snow"/"Freezing Rain"/"Heavy Ice" (binary) | 4–7, then 8–14 | None — clean 3-way handoff: WSSI(1-3) → WPC(4-7, since day 3 is deduped to WSSI) → CPC(8-14) |
| Extreme/hazardous heat | **NWS HeatRisk** | 1–7 | 5-level graduated, health-impact-framed scale vs. a binary "Hazardous Heat"/"Excessive Heat" flag; also the *only* heat source for Days 1-2, since no hazards-outlook product exists before Day 3 | CPC Day 8-14 "Excessive Heat"/"Much Above Normal Temperatures" (binary) | 8–14 | None — HeatRisk(1-7) → CPC(8-14). **WPC Day 3-7 "Hazardous Heat" should be suppressed entirely** (fully superseded by HeatRisk across its whole 3-7 window). |
| Extreme/hazardous cold, frost/freeze | **WPC Day 3-7 Hazards Outlook** "Hazardous Cold"/"Frost/Freeze" | 3–7 | No graduated-severity cold analog exists among these six products — this is the first/only available source in its window | CPC Day 8-14 "Much Below Normal Temperatures" (binary) | 8–14 | **Days 1-2 are an accepted gap** — no product in this milestone's scope covers cold hazard that close-in. Not fillable without adding a 7th data source (e.g. NDFD min-temp grid), which is out of scope. |
| Non-convective high wind / significant waves | **WPC Day 3-7 Hazards Outlook** "High Winds"/"Significant Waves" | 3–7 | No existing analog — SPC's `windCig` is convective-gust risk only, a materially different phenomenon (thunderstorm-driven vs. synoptic/gradient wind), so this is *not* a true overlap with existing SPC data despite the similar-sounding name | CPC Day 8-14 "High Winds"/"Significant Waves" (binary) | 8–14 | **Days 1-2 are an accepted gap**, same reasoning as cold. Do not conflate with SPC's existing windCig — they represent different hazards and both should be shown if both are present. |
| River/actual flood status ("Flooding Likely/Occurring/Possible") | **Deprioritized — recommend omitting from v2.0** | n/a | Sourced from WPC's National Flood Outlook, a *seventh* product not named in this milestone's six targets; conceptually distinct from ERO (actual/imminent flood status vs. forward-looking pre-event probability) — including it without also integrating its actual source risks misattributing data provenance | n/a | n/a | Recommend explicitly filtering these labels out when parsing the Precipitation layer of the Hazards Outlook, so they don't leak into the merged day report as if they were ERO or WPC-native data |
| Drought / Rapid Onset Drought | **Deprioritized — anti-feature for this milestone** | n/a | Slow-onset, non-actionable for a daily-glance safety display; not named in the milestone's target feature list; bundled in the same "Wildfire_Drought" layer as wildfire risk, so implementing wildfire-only requires attribute-level label filtering anyway | n/a | n/a | Filter out at parse time alongside the wildfire feature extraction |
| Short-fuse flash-flood discussion (not day-scoped) | **WPC MPD**, alongside existing SPC MD | n/a (current-conditions product) | Not a peer-vs-peer overlap — MPD (heavy rain/flash flood) and SPC MD (convective/winter mesoscale) cover different phenomena and can both be active simultaneously; no precedence needed, just co-display | n/a | n/a | Both render together in a non-day-scoped "active discussions" block (see Part C) |

### B3. Key decision points this table surfaces for requirements/roadmap

1. **WPC Day 3-7 "Severe Weather" and "Hazardous Heat" categories should be fully suppressed**, not merely de-prioritized — SPC and HeatRisk respectively already cover their entire day windows at strictly higher granularity. Parsing these two sub-categories from the Hazards Outlook feed would be wasted implementation effort with zero net display value; recommend NOT building parsers for these two specific labels at all (skip them at the label-filter stage), rather than fetching-then-discarding.
2. **ERO's Day 4-5 native coverage vs. the milestone's stated Day 1-3 scope** is a real gap the user should decide on explicitly — it's cheap to extend (same endpoint, same parsing, two more MapServer layers) since Days 4-5 lack only the High tier.
3. **"Flooding" (river/actual) and "Drought" sub-categories** are recommended anti-features for this milestone — both are attribute-level labels bundled inside layers the module does need to parse (Precipitation, Wildfire/Drought), so the requirement is a *filter*, not a *fetch*.
4. **Days 1-2 have zero coverage for cold and non-convective-wind hazards** across all six new products plus existing SPC data. This is a structural gap in NOAA's own product suite (WPC Hazards Outlook starts at Day 3 by definition), not a module oversight — worth stating explicitly in requirements so it isn't mistaken for a bug later.
5. **WPC/CPC Hazards Outlook layers multiplex several hazard types per single MapServer layer**, distinguished by an attribute/label field — unlike existing SPC endpoints (one hazard per URL). This is new parsing complexity: label-based filtering per feature, not just "does this layer have any features here."
6. **HeatRisk's raster/ImageServer delivery** is architecturally different from every other source (point-identify REST call vs. fetch-GeoJSON-then-turf-point-in-polygon). It's simpler in principle (no polygon math for this one product) but is a distinct code path, not a drop-in reuse of `fetchAndEvaluateHazard`.

---

## Part C — Unified per-day report design

### C1. Ordering within a day

**Recommendation: fixed category order, not per-day re-sorted by computed severity.** Reasoning (MEDIUM confidence — informed by general dashboard/scanability practice and NWS's own hazard-prioritization convention, not a single documented external standard):
- A fixed order (e.g., Severe Convective → Excessive Rain/Flood → Winter → Fire → Heat/Cold → Wind/Waves) lets a user glance at the same screen position every day for "is there a tornado risk," rather than having to re-locate it because yesterday Fire was on top and today Heat is.
- This mirrors the existing module's own current top-to-bottom order (categorical risk → per-hazard CIG breakdown → fire weather), which the display should extend rather than replace.
- Severity should still control *whether* a hazard row/segment renders at all (existing no-risk guards) and *visual weight* (color, bolding) — but not *position*.

### C2. "Nothing to report" handling

The existing module already solves this correctly at the whole-module level (`"No Severe Weather Risk"` wrapper message, with an explicit `hasAnyRenderableProximity` predicate to avoid a bare "(Day N): None" line — see code comment at `MMM-SPCOutlook.js:55-59`, "day2-none-still-displays" bug). **This pattern should extend, not be replaced:**
- **Per-day suppression**: a day with nothing above every source's no-risk threshold across every hazard type renders no row at all — never a "Day N: Nothing" line. Table stakes; already the established pattern.
- **Whole-window suppression**: if literally every configured day and every configured source is at no-risk, keep a single top-level "No Weather Hazards" message rather than an empty list of days. Table stakes; already built, just needs its guard condition widened to the new sources.

### C3. Placement of non-day-scoped items (MD, MPD)

Mesoscale Discussions and MPDs are not tied to a forecast day — they describe *right now, next few hours*. Comparable products (SPC's own web page, NWS alert aggregators) consistently place short-fuse/nowcast items **above** the day-by-day forecast list, not interleaved into a specific day's row. Recommendation:
- Keep both MD and MPD in a shared "active discussions" block at the top of the report (the existing module already renders MDs first, before Day 1 — this is the correct precedent to extend to MPD).
- Do not attempt to fold an MPD into "Day 1"'s row even though it temporally overlaps today — it's a categorically different kind of information (nowcast discussion vs. day-scoped categorical/probabilistic forecast) and merging it would make the day row inconsistent in meaning from day to day.

### C4. Detail toggle behavior

- **detail OFF (compact):** one line per day, hazard segments in the fixed category order, using the shortest canonical label for each (e.g. `ENH`, `SLGT`, `Elevated`, `Minor`, HeatRisk level name) — this matches the existing terse categorical style (`this.spcrisk.day1.text`) already used for SPC risk labels.
- **detail ON (expanded):** same day grouping, but each hazard segment becomes a source-labeled sub-row (e.g. `SPC: ENH ①②③`, `WPC ERO: SLGT`, `WSSI: Minor (snow)`), preserving the same fixed order. This is the natural place to *also* show a suppressed/deduped source's data if a future config flag ever wants "show everything, don't dedupe" — but that flag is explicitly out of scope per PROJECT.md's precedence-table decision.
- Both modes should share the same underlying per-day data structure and per-day filtering/precedence logic — the toggle only changes rendering, not data fetching or precedence resolution. This keeps the "detail" flag cheap (no extra network/compute cost) and avoids a second render path maintenance burden, consistent with the "no legacy path" decision already recorded in PROJECT.md.

---

## Feature Landscape

### Table Stakes (Users Expect These)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| SPC-vs-WPC/CPC dedup via precedence (no duplicate/conflicting hazard shown twice for the same day) | Existing module already dedupes proximity vs. categorical risk; showing "ENH" from SPC and a redundant "Severe Weather" flag from WPC on the same day would look broken, not thorough | MEDIUM | Implements Part B's precedence table; mostly a filtering/suppression layer over new fetches, not new math |
| Per-day "nothing to report" suppression (no empty day rows) | Direct extension of existing `hasAnyRenderableProximity`-style guard pattern already in the codebase | LOW | Reuse existing guard pattern, widen predicate to cover new sources |
| Canonical short labels matching each source's own terminology (MRGL/SLGT/MDT/ENH/HIGH for SPC/ERO-style, Minor/Moderate/Major/Extreme for WSSI/HeatRisk) | A user glancing at a mirror needs the label to match what they'd see on the official product if they looked it up | LOW | Labels documented in Part A; no invented terminology |
| MD + MPD both surfaced in a shared, non-day-scoped "active discussions" block | Existing module already does this for MD; MPD is the direct precipitation analog | LOW-MEDIUM | Shapefile/KML pattern already proven for SPC MD; new fetch+parse for a second endpoint, same shape |
| Detail toggle (off=compact / on=expanded) sharing one data model | Explicit milestone requirement; also the only way to keep two render modes maintainable long-term | MEDIUM | Data layer produces one normalized per-day structure; two renderers consume it |

### Differentiators (Competitive Advantage)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| HeatRisk 5-level graduated heat display | Most weather dashboards either omit heat entirely or show only a temperature number; a health-impact-framed 0-4 scale is materially more actionable | MEDIUM | New raster/ImageServer integration pattern — different code path from existing GeoJSON+turf approach; recommend isolating behind its own fetch helper rather than forcing it through `fetchAndEvaluateHazard` |
| WSSI 5-component winter breakdown (snow amount/load/ice/blowing snow) instead of a single "winter risk" flag | Distinguishes "a little snow" from "a dangerous ice storm" in one glance, which none of the WPC/CPC binary flags can do | MEDIUM-HIGH | 5 hazard sub-layers × 3 days = up to 15 feature fetches/parses if implemented at full fidelity; consider whether "Overall Impact" alone is sufficient for v2.0 and defer per-component breakdown |
| Explicit precedence-driven merge (vs. showing every source's raw output) | This is the module's actual point per PROJECT.md — most weather apps just stack unrelated panels; a deduped, ranked merge is the differentiator | HIGH | This *is* the milestone; Part B's table is the concrete spec |

### Anti-Features (Commonly Requested, Often Problematic)

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|------------------|-------------|
| Parsing WPC/CPC "Flooding" (river/actual-flood-status) sub-category | Seems like free coverage since it's in the same layer being fetched anyway | Sourced from a *different* product (National Flood Outlook) not in this milestone's 6-product scope; displaying it without integrating its real source risks misattributing provenance and confusing it with ERO's forward-looking probability | Filter it out at label-parse time; revisit as its own future milestone if the National Flood Outlook is explicitly researched |
| Parsing "Drought"/"Rapid Onset Drought" sub-category | Bundled in the same Wildfire/Drought layer as the wanted wildfire data | Slow-onset, non-actionable for a daily safety glance; not named in milestone scope; adds label-filtering surface area for no display value | Filter out alongside wildfire extraction |
| Showing WPC Day 3-7 "Severe Weather" or "Hazardous Heat" flags even when SPC/HeatRisk data is also present | Seems safer to "show everything WPC says, just in case" | Pure redundancy — these two categories are, by WPC's own documentation, *derived from* the more granular sources already in the module; showing both adds visual clutter without adding information, and risks apparent (but not real) disagreement if the coarse flag and granular data ever render with different colors | Suppress entirely per Part B; if the user wants a "confirms SPC" signal, that's better expressed as increased confidence styling on the existing SPC row, not a second row |
| Per-day computed severity re-sorting (hazard with highest tier always shown first, order varies day to day) | Feels "smart" — surface the scariest thing first | Breaks scan consistency — the same hazard type moves position from day to day, forcing the user to re-read the whole row instead of glancing at a fixed spot; also adds a sort/comparison step across heterogeneous severity scales (SPC's 6-tier categorical vs. HeatRisk's 0-4 vs. WSSI's 6-level — these aren't directly comparable numbers) | Fixed category order (Part C1); let color/weight communicate severity within a fixed slot |

## Feature Dependencies

```
Unified per-day report (data model)
    └──requires──> Cross-source precedence/dedup logic (Part B)
                       └──requires──> Per-product fetch+parse for all 6 new sources
                                          ├──requires──> WPC ERO fetch (extends existing fetchAndEvaluateHazard pattern — GeoJSON, one layer per day)
                                          ├──requires──> WSSI fetch (GeoJSON, multi-layer per hazard component)
                                          ├──requires──> WPC Day 3-7 Hazards Outlook fetch (GeoJSON, multi-hazard-per-layer — needs NEW label-filtering step, not just presence check)
                                          ├──requires──> CPC Day 8-14 Hazards Outlook fetch (same schema/pattern as WPC Day 3-7)
                                          ├──requires──> WPC MPD fetch (Shapefile/KML — same integration shape as existing SPC MD/ActiveMD.kmz)
                                          └──requires──> HeatRisk point-identify (ImageServer REST — DIFFERENT pattern, not GeoJSON+turf)

Detail toggle (off/on rendering)
    └──requires──> Unified per-day report (data model)
                       (toggle only changes rendering of the same normalized structure)

WPC Day 3-7 "Severe Weather"/"Hazardous Heat" suppression
    ──enhances──> Cross-source precedence/dedup logic
                       (this is a specific, pre-decided instance of the general precedence rule)

WPC ERO Day 4-5 extension (future consideration)
    ──conflicts──> Milestone's stated "Days 1-3" scope
                       (not a code conflict — a scope decision that should be made explicitly, see B3.2)
```

### Dependency Notes

- **Unified per-day report requires precedence/dedup logic:** the milestone's entire point is a *merged* day, not a stacked list of per-product sections — so precedence must be resolved before or during data assembly, not left to the renderer.
- **Precedence logic requires all 6 fetches to exist first:** you cannot dedupe SPC vs. WPC "Severe Weather" until WPC's Day 3-7 data is actually being fetched and parsed with label-level granularity.
- **HeatRisk conflicts architecturally with the other 5:** it's the only ImageServer/raster source; every other product (existing + new) is GeoJSON + point-in-polygon via turf. Recommend building HeatRisk's fetch helper as a genuinely separate function rather than trying to force-fit it into `fetchAndEvaluateHazard`.
- **WPC Day 3-7 / CPC Day 8-14 fetch requires new label-filtering, not just layer presence:** unlike every existing SPC endpoint (one hazard type per URL), these two products multiplex many hazard types into one layer via an attribute field — this is new parsing logic, not a copy of the existing pattern.
- **ERO Day 4-5 extension conflicts with stated milestone scope:** flagged as a decision point (B3.2), not asserted as a requirement — the user should explicitly accept or reject the Day 4-5 quality gap before roadmap phases are cut.

## MVP Definition

### Launch With (v2.0 core)

- [ ] WPC ERO Days 1-3 fetch + 4-tier categorical display — direct extension of existing `fetchAndEvaluateHazard` GeoJSON pattern, highest-fidelity new source, cleanest day-range boundary (no overlap ambiguity within its own scope)
- [ ] WPC Winter Weather Outlook (WSSI) Days 1-3, "Overall Impact" component only — defer the 4 sub-component breakdowns (snow amount/load/ice/blowing snow) to a later milestone; Overall Impact alone already beats every WPC/CPC binary winter flag
- [ ] WPC MPD detection — closest architectural match to existing SPC MD handling, low incremental complexity
- [ ] Cross-source precedence/dedup for the hazard types with a genuinely competing pair (severe weather, wildfire, heat, winter) per Part B's table, including explicit suppression of WPC Day 3-7 "Severe Weather" and "Hazardous Heat"
- [ ] Unified per-day report data model + compact (detail-off) rendering — this is the milestone's stated core deliverable

### Add After Validation (v2.x)

- [ ] Detail-ON expanded/source-labeled sub-row rendering — build once the compact merge is proven correct; expanding a validated data model is low-risk
- [ ] WPC Day 3-7 Hazards Outlook non-suppressed categories (Cold/Frost-Freeze, non-convective High Winds/Waves) for days 3-7 — genuinely new hazard types with no existing analog, but lower urgency than the four "competing pair" hazards above
- [ ] CPC Day 8-14 Hazards Outlook (all surviving categories after suppression/filtering) — extends the day-3-7 pattern outward once it's proven at the nearer range
- [ ] NWS HeatRisk (ImageServer point-identify) — highest differentiator value but a genuinely new integration pattern; sequence after the GeoJSON-based sources are stable so the codebase isn't absorbing two new architectures at once

### Future Consideration (v3+)

- [ ] WSSI's 4 additional hazard components (snow amount, snow load, ice accumulation, blowing snow) beyond Overall Impact — defer until user feedback indicates Overall Impact alone is insufficient
- [ ] ERO Day 4-5 extension — explicitly flagged decision point (B3.2); revisit once Days 1-3 are shipped and validated
- [ ] WSSI-P (probabilistic, Days 1-7) as an alternative/supplement to deterministic WSSI — only if the Days 1-3 deterministic product proves insufficient for user needs
- [ ] National Flood Outlook (river/actual flood status) as its own researched, integrated product — currently recommended as an anti-feature specifically because it would be under-researched if bolted on via the Hazards Outlook's "Flooding" labels

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|----------------------|----------|
| WPC ERO Days 1-3 | HIGH | LOW-MEDIUM | P1 |
| WSSI Overall Impact Days 1-3 | HIGH | MEDIUM | P1 |
| WPC MPD | MEDIUM-HIGH | LOW-MEDIUM | P1 |
| Precedence/dedup (severe/fire/heat/winter) | HIGH | MEDIUM | P1 |
| Unified per-day report, compact mode | HIGH | MEDIUM-HIGH | P1 |
| Detail-ON expanded mode | MEDIUM | LOW (once data model exists) | P2 |
| WPC Day 3-7 Cold/Wind/Waves (net-new hazard types) | MEDIUM | MEDIUM | P2 |
| CPC Day 8-14 (all surviving categories) | MEDIUM | MEDIUM | P2 |
| NWS HeatRisk | HIGH | MEDIUM-HIGH (new architecture) | P2 |
| WSSI additional components (snow load/ice/blowing snow) | LOW-MEDIUM | MEDIUM-HIGH | P3 |
| ERO Day 4-5 extension | MEDIUM | LOW (same pattern as Days 1-3) | P3 |
| National Flood Outlook (separate future research) | LOW (for this milestone) | HIGH (unresearched) | P3 |

**Priority key:**
- P1: Must have for v2.0 launch
- P2: Should have, add once P1 is validated
- P3: Nice to have, future consideration

## Competitor / Comparable-Product Feature Analysis

| Feature | NWS/weather.gov own dashboards | Commercial aggregators (weather.com, AccuWeather-style) | Our approach |
|---------|-------------------------------|----------------------------------------------------------|--------------|
| Multi-hazard-per-day ordering | Fixed hazard-priority ordering (tornado > svr t-storm > flash flood > winter > heat > wind) in Hazardous Weather Outlook text products | Severity-color-first, often per-alert-type icon strips | Fixed category order (Part C1), matching NWS's own convention, extending existing module order |
| Short-fuse discussion placement | Always above/separate from day-by-day forecast (Hazardous Weather Outlook lists current watches/warnings before the 7-day narrative) | Push notification / banner, separate from forecast grid | Shared "active discussions" block above Day 1, extending existing MD placement |
| Cross-source dedup | Not attempted — NWS text products from different centers (SPC/WPC/CPC) are published as separate documents, no unified merge exists anywhere in NOAA's own tooling | Not attempted — commercial apps typically pick one hazard data feed per hazard type and don't cross-reference NOAA's overlapping centers | **This is the actual differentiator** — no comparable product (NOAA or commercial) merges SPC+WPC+CPC with an explicit precedence table; Part B is genuinely novel work, not a known pattern to copy |

## Sources

- [About the WPC Day 3-7 Hazards Outlook (PDF)](https://www.wpc.ncep.noaa.gov/threats/about_hazards.pdf)
- [WPC Day 3-7 U.S. Hazards Outlook](https://www.wpc.ncep.noaa.gov/threats/threats.php)
- [CPC Day 8-14 Probabilistic Hazards Outlook](https://www.cpc.ncep.noaa.gov/products/predictions/threats/threats.php)
- [CPC Week-2 US Hazards Outlook Description (2021, PDF)](https://www.cpc.ncep.noaa.gov/products/predictions/threats/week2_hazards_info_May2021.pdf)
- [ArcGIS MapServer: hazards/cpc_weather_hazards](https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer) (fetched directly, layer/legend structure)
- [WPC Excessive Rainfall Outlook (ERO) Interactive Display](https://www.wpc.ncep.noaa.gov/qpf/excessive_rainfall_outlook_ero.php)
- [ArcGIS MapServer: hazards/wpc_precip_hazards](https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer) (fetched directly)
- [PDD: ERO Days 4-5 (T2O)](https://www.weather.gov/media/notification/PDDs/PDD_ERO_Days_4_5_T2O.pdf)
- [Weather.com: Why "High Risk" flood forecasts matter](https://weather.com/safety/floods/news/2024-08-05-high-risk-flood-excessive-rainfall-outlook-noaa)
- [WPC Winter Storm Severity Index (WSSI) Web Display](https://www.wpc.ncep.noaa.gov/wwd/wssi/wssi.php)
- [ArcGIS MapServer: outlooks/wpc_wssi](https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer) (fetched directly)
- [WSSI Primer (PDF)](http://www.wpc.ncep.noaa.gov/wwd/wssi/WSSI_Primer.pdf)
- [WSSI-P (Probabilistic) Web Display](https://www.wpc.ncep.noaa.gov/wwd/wssi/prob_wssi.php)
- [WPC Mesoscale Precipitation Discussions](https://www.wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php)
- [IEM: Download WPC MPD Shapefile](https://mesonet.agron.iastate.edu/request/gis/wpc_mpd.phtml)
- [SPC Mesoscale Discussions](https://www.spc.noaa.gov/products/md/)
- [NWS HeatRisk Fact Sheet (PDF)](https://www.weather.gov/media/mlb/pdfs/NWS%20HeatRisk%20Fact%20Sheet.pdf)
- [Understanding HeatRisk (PDF)](https://www.weather.gov/media/aly/FactSheets/Understanding-HeatRisk.pdf)
- [WPC HeatRisk](https://www.wpc.ncep.noaa.gov/heatrisk/)
- [NWS_HeatRisk ImageServer (ArcGIS REST)](https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer)
- [HeatRisk Data/KML page](https://www.wpc.ncep.noaa.gov/heatrisk/data.html)
- Existing codebase: `MMM-SPCOutlook.js` (getDom rendering, existing risk-label and no-risk-guard patterns), `.planning/PROJECT.md` (v2.0 milestone scope and key decisions)

---
*Feature research for: MagicMirror² weather-hazard display module (MMM-SPCOutlook v2.0)*
*Researched: 2026-08-15*
