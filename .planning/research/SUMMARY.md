# Project Research Summary

**Project:** MMM-SPCOutlook
**Domain:** MagicMirror² weather-hazard display module — WPC/CPC/NWS multi-source hazard ingestion + unified per-day report (v2.0 milestone)
**Researched:** 2026-08-15
**Confidence:** MEDIUM-HIGH

## Executive Summary

v2.0 adds six new NOAA WPC/CPC/NWS hazard products to an existing SPC-only turf.js point-in-polygon module, then rewrites the display from per-product sections into a unified, deduplicated per-day report. All six products were hit with live HTTP requests during this research round (STACK.md), which is the strongest evidence in the research set and takes precedence wherever it conflicts with earlier, non-live-verified findings. Zero new npm dependencies are needed, and five of the six products fit the module's existing "fetch GeoJSON/KMZ, evaluate locally with turf" pattern rather than the server-side point-query pattern ARCHITECTURE.md assumed — only NWS HeatRisk is a genuinely different, point-identify-only code path.

The recommended approach is a strict two-macro-phase build: land all six data sources first as small, independently toggle-able, additive sections in the current display layout, and only then attempt the unified day-report rewrite (getDom() has no legacy fallback and no automated tests, so it is the single highest-regression-risk piece of this milestone). Within the six sources, sequence from cleanest/most-SPC-like (ERO, WSSI) to hardest (WPC Day 3-7 / CPC Day 8-14 Hazards Outlook, whose Temperature and Wildfire/Drought hazard types carry no per-day resolution at all) to architecturally distinct (HeatRisk).

The two biggest open risks are design decisions that must be made before implementation: (1) how to place a hazard that spans an entire 3-7 or 8-14 day window inside a day-keyed report, and (2) how to build a precedence/dedup table that doesn't over- or under-merge hazards that share vocabulary across genuinely different hazard dimensions. Both are captured as decision-ready options in this document and require a user call before roadmap phases are cut.

## Key Findings

### Recommended Stack
Every product resolves to a format the existing stack already parses: GeoJSON (products 1-4), a KMZ containing one KML (product 5, WPC MPD — two parsing-trap deviations from the existing SPC MD path), or a scalar pixel value from an ArcGIS ImageServer identify call (product 6, HeatRisk — needs turf.toMercator(), already bundled). No new dependency required.

### Expected Features
Must-have: SPC-vs-WPC/CPC dedup via precedence table; per-day nothing-to-report suppression; canonical short labels; MD+MPD shared advisories block; detail toggle sharing one data model. Should-have: HeatRisk's 5-level heat display; WSSI's impact-based winter scale; the precedence-driven merge itself (the actual differentiator — no comparable NOAA/commercial product does this). Defer: detail-ON expanded rendering, non-suppressed Day3-7/Day8-14 categories, WSSI's 4 extra components, ERO Day4-5, National Flood Outlook/Drought as separate future research.

### Architecture Approach
Precedence/dedup logic belongs backend-only (mirrors existing proximity-math pattern). Payload should collapse day1...day8 named properties into a uniform days["1"]...days["14"] loop-built object, each with a backend-precomputed summary (compact) and sources[] (expanded, precedence-annotated). Short-fuse items (MD, MPD) stay in a separate advisories array. Major components: fetchGeoJsonCached (unchanged), a new fetchAndEvaluatePointQuery-style sibling for the 4 GeoJSON point-in-polygon products, a generalized getActiveDiscussions() for MD+MPD, a standalone HeatRisk parser, and new backend precedence/dedup logic.

### Critical Pitfalls
1. LABEL (SPC) vs label (WPC/CPC) case mismatch — silently degrades every feature to "no risk," no error.
2. WPC Day3-7/CPC Day8-14 Temperature & Wildfire/Drought have no per-day resolution — one polygon spans the whole window.
3. "Day N" is not a stable concept across products (SPC 12Z-12Z, ERO Day1 partial 01Z-12Z, Hazards Outlook 00Z-00Z) — merging by ordinal day alone misattributes hazards near boundaries.
4. MPD has no ActiveMD.kmz-equivalent aggregator — MPD_latest.kmz silently drops concurrent MPDs; numbering resets annually.
5. getDom() rewrite has no legacy fallback and no automated tests — discards a ~15-input combinatorial no-risk gate and ten proximity-badge conditions from 4 prior milestones.

## Conflict Resolutions

**Conflict 1 — Access pattern (RESOLVED, STACK.md's live verification takes precedence):** ARCHITECTURE.md claimed 5/6 products support server-side point spatial query (self-reported MEDIUM confidence, not live-verified). STACK.md live-queried every endpoint with `where=1=1` (whole layer, no point filter) and describes products 1-4 as fetch-whole-layer-then-local-turf, same shape as existing SPC pattern. Resolved per-product: #1 WPC Day3-7 = (a) fetch-then-local-turf; #2 CPC Day8-14 = (a); #3 ERO = (a); #4 WSSI = (a); #5 MPD = (a)-variant KMZ-then-local-turf; #6 HeatRisk = (c) raster identify, genuine point query, no turf. ARCHITECTURE's "near-zero turf cost because server does point-in-polygon" does NOT survive for products 1-5 — turf evaluation is required, same as existing SPC pattern. Re-derived RPi cost: still manageable, but because live layer counts are small (1-27 features/layer, no pagination), not because turf work is eliminated. Request-count tally from STACK's live layer inventory: ~14-17 additional requests/cycle (products 1&2 share one MapServer = 6 layer queries; product 3 = 3 layers; product 4 = 3 layers; product 5 = 1 discovery + 0-3 active KMZ; product 6 = 1 multi-day identify call) — consistent with ARCHITECTURE/PITFALLS' independent 10-24 estimate; only the "zero turf cost" reasoning is wrong, the request-count conclusion survives. Whether server-side spatialRel point-filtering is actually available was never tested by either researcher (STACK queried where=1=1, not a geometry filter) — worth a cheap future spike, not a blocker.

**Conflict 2 — Day-window alignment vs. day-keyed report premise (RESOLVED as a decision, not silently assumed):** Live evidence: SPC 12Z-12Z; WPC ERO Day1 partial 01Z-12Z (Day2+ 12Z-12Z); WPC/CPC Hazards Outlook 00Z-00Z calendar-day. Within the Hazards Outlook itself, Temperature and Wildfire/Drought layers carry NO per-day resolution (one polygon spans the whole 3-7 or 8-14 window); the Precipitation layer CAN be date-bucketed per feature. Products resolvable to a specific day: SPC, ERO, WSSI, HeatRisk (once catalogItems sorted), Hazards-Outlook Precipitation layer. NOT resolvable: Hazards-Outlook Temperature/Wildfire-Drought layers, MPD (correctly non-day-scoped, in advisories band). Decision-ready options for window-spanning placement: (A) separate non-day-scoped band alongside advisories — honest about resolution, less scannable against the day grid; (B) repeat the hazard identically on every day it spans — fits the per-day visual model, but PITFALLS explicitly flags this as misleading (implies daily-resolved certainty that doesn't exist); (C) dedicated extended-outlook section distinct from both day grid and advisories band — architecturally cleanest, adds a third UI region. No researcher recommended one option with strong evidence — this is a genuine open decision for the user/roadmapper.

**Conflict 3 — Precedence table status (RESOLVED, split by what's decidable now vs. what needs live data):** FEATURES.md proposes suppressing WPC's Day3-7 "Severe Weather" and "Hazardous Heat" entirely (evidence: WPC documents its severe layer as derived from SPC's outlook). ARCHITECTURE.md says defer precedence to Phase 1 live data. PITFALLS.md rates merge/dedup findings MEDIUM confidence because no precedence table existed to test against, and its Pitfall 10 shows "Severe Weather" actually sits inside the flood-relevant Precipitation layer grouping, not as an isolated tor/hail/wind duplicate — naive suppression risks hiding flood signal. Resolution: Hazardous Heat suppression is decidable NOW (HIGH confidence, pure structural/coverage comparison — HeatRisk's 5-level Days1-7 scale strictly supersedes WPC's binary Day3-7 flag). Severe Weather suppression's provenance is HIGH confidence/decidable-now as a documented fact, but the mechanical suppression RULE must be validated against live Phase-1 payloads using a hazard-dimension-scoped rule (not a label-string match) before shipping. The general precedence table (FEATURES' Part B2) should be treated as a starting taxonomy/strawman, not a final spec — build the real table in a dedicated merge-logic phase from real captured data, per ARCHITECTURE and PITFALLS' shared recommendation.

## Per-Product Integration Table

| # | Product | Verified endpoint | Format | Access pattern (resolved) | Day-resolution | Specific parsing traps | Code path |
|---|---|---|---|---|---|---|---|
| 1 | WPC Day 3-7 Hazards Outlook | mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{1,4,7}/query?f=geojson | GeoJSON | (a) fetch-then-local-turf | Precipitation layer: per-day bucketable via start_date/end_date. Temperature & Wildfire/Drought: NO day resolution — one polygon spans the whole 3-7 window. | label is hazard-type text not severity (Pitfall1); LABEL vs label case mismatch (Pitfall8); must filter out Flooding/Drought sub-labels; don't confuse with separate outlooks/cpc_8_14_day_outlk climate service | New — extends fetchGeoJsonCached (reuse) but needs new label-filter + date-bucket logic, not a copy of fetchAndEvaluateHazard |
| 2 | CPC Day 8-14 Hazards Outlook | Same MapServer, layers {3,6,8} | GeoJSON | (a) fetch-then-local-turf | Same as #1; live 8-14 sample showed a partial-window (1-day) span inside the nominal 7-day bucket — granularity not fixed even within one product | Same traps as #1; entirely new day9-day14 payload keys | Extends #1's parser; new day-key range |
| 3 | WPC Excessive Rainfall Outlook (ERO) | mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/{0,1,2}/query?f=geojson (native Days1-5, layers 0-4) | GeoJSON | (a) fetch-then-local-turf | Per-day layers (clean); Day1 window is partial (01Z-12Z), Day2+ is 12Z-12Z — misaligned with SPC's own 12Z-12Z Day1 | dn field domain differs from fire weather's DN, do not reuse dnToFireValue (Pitfall2); native CRS is Web Mercator, must always request f=geojson, never raw f=json (Pitfall6) | New sibling to fetchAndEvaluateHazard (no CIG-style 2nd fetch needed) — closest analog to existing pattern, easiest of the six |
| 4 | WPC Winter Weather Outlook (WSSI Overall Impact) | mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/{1,2,3}/query?f=geojson | GeoJSON | (a) fetch-then-local-turf | Per-day layers (Day1/2/3), clean | impact field documented mixed-case but returned ALL CAPS live — normalize before compare, same failure shape as Pitfall8; off-season empty result (0 features) is expected not a bug; distinct value vocabulary, don't reuse riskToColor/valueToRisk | New — same fetch/turf shape as existing pattern, needs own vocabulary/color table |
| 5 | WPC Mesoscale Precipitation Discussion (MPD) | Discovery: wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php (HTML); Data: wpc.ncep.noaa.gov/kml/mpd/MPD_{n}_final.kmz | HTML (discovery) + KMZ→KML | (a)-variant: KMZ-then-local-turf via checkInPolygon | Not day-scoped — current/nowcast, 1-6hr lead time; belongs in advisories band | Internal KML entry is always doc.kml, not derived from outer filename — breaks kmzToKmlfilename (STACK trap#1); hazard label (MPDType) buried in an HTML table inside description CDATA, not in name/ExtendedData — name is actually a ValidStart timecode (STACK trap#2); MPD_latest.kmz alone silently drops concurrent MPDs, and numbers reset annually so "highest number" ≠ "most recent" (Pitfall5) | New — generalized getActiveDiscussions(); cannot reuse the ActiveMD.kmz-index pattern verbatim (no equivalent index exists) |
| 6 | NWS/WPC HeatRisk | mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify | JSON (scalar pixel value + catalogItems metadata) — NOT GeoJSON | (c) raster identify — genuine point query, no turf/polygon math | Per-day via idp_validtime in catalogItems, 7-day window — but array order is arbitrary, must sort first | Must reproject to Web Mercator via turf.toMercator() first — sr=4326 returns "NoData" even for points with real data; catalogItems/Values arrays return in arbitrary order (day mis-attribution if indexed naively) (Pitfall7); duplicate idp_validtime entries observed live — dedupe keeping greatest idp_filedate; "NoData" string sentinel must be checked before numeric parse | Entirely new, standalone parse function — not routed through the point-query sibling used for products 1-4 |

## Decision Queue

1. **ERO Day 4-5 scope extension.** Native range Days1-5; milestone scope states Days1-3. (a) keep scope at Days1-3 — Days4-5 fall back to coarser WPC Hazards Outlook binary flag; (b) extend to Days4-5 — same endpoint/pattern, near-zero marginal cost, only loses the "High" tier which Days4-5 don't offer anyway. Recommend evaluating (b) given the low cost, but it's a scope decision.
2. **Confirm suppression of WPC's "Severe Weather"/"Hazardous Heat" Day3-7 categories.** Hazardous Heat: safe to decide now (HIGH confidence, structural). Severe Weather: provenance decidable now, but the mechanical suppression rule needs live-payload validation using a hazard-dimension-scoped rule, not label matching. Confirm this two-tier approach is acceptable.
3. **Excluding Flooding and Drought sub-labels.** FEATURES recommends filtering both out entirely (Flooding is sourced from an unresearched 7th product, the National Flood Outlook; Drought is slow-onset/non-actionable and already requires attribute filtering to isolate wildfire data). Recommend (a) filter out at parse time — no "free" savings from inclusion since filtering is required regardless, and inclusion risks misattributing an unresearched product's data.
4. **Window-spanning hazard placement** (Conflict 2, Options A/B/C above) — must be resolved before the WPC Day3-7/CPC Day8-14 Temperature and Wildfire/Drought parsers are implemented; determines the payload schema shape.
5. **Day-window merge strategy across all six axes.** (a) strict UTC time-window-overlap merging — more correct, materially more complex; (b) ordinal day-label merging with a documented/UI-disclosed caveat about up-to-12-hour boundary differences — simpler, faster, matches what the schema examples implicitly assumed. PITFALLS rates getting this wrong as HIGH recovery cost post-ship — decide explicitly, don't default silently to (b).
6. **WSSI scope: Overall Impact only vs. full 5-component breakdown.** FEATURES recommends deferring the 4 additional components to v2.x — confirm, since including them now roughly triples WSSI's layer count (3 → up to 15).
7. **Parallelization of the six new fetch chains (Pitfall12).** ARCHITECTURE and PITFALLS both recommend Promise.all batching for the new products to bound cold-cache RPi latency — not explicitly named in PROJECT.md's scope. Confirm if in-scope for v2.0, or deferred with a mandatory cold-cache latency measurement gate regardless.
8. **Detail-toggle behavior for any window-spanning badge** (if Option A or C from #4 chosen) — participates in detail ON/OFF like per-day sources, or always renders regardless of toggle? Minor, affects render-mode design.

## Silent-Failure Inventory

Traps that produce a wrong answer with NO error raised — highest risk given manual UAT + static analysis is the only verification strategy:
- LABEL (SPC) vs label (WPC/CPC) case mismatch — every feature silently evaluates to "no risk" (Pitfall8)
- HeatRisk catalogItems/Values arrays arrive in arbitrary order — naive indexing attributes the wrong day's category (Pitfall7)
- Duplicate idp_validtime entries in HeatRisk's catalogItems — picking the wrong duplicate silently shows a stale mosaic tile as current (STACK live finding)
- f=json (raw esriJSON) fallback instead of f=geojson for ERO (Web Mercator) or WSO (LCC-sphere, no EPSG code) — meters fed into turf as degrees, produces a syntactically valid but geographically nonsensical polygon, no exception thrown (Pitfall6)
- MPD_latest.kmz-only fetch instead of discovering the full active set — silently drops concurrently active MPDs (Pitfall5)
- MPD numbering reset annually — "highest number = most recent" selects a stale MPD across a year boundary (Pitfall5)
- Reusing dn/DN mapping across products (ERO's dn vs fire weather's DN) — inverted severity, no error (Pitfall2)
- Spreading a window-level hazard (WPC Day3-7 Temperature/Wildfire-Drought) identically across every day in its window — implies daily-resolved certainty that doesn't exist, no error just a misleading display (Pitfall3/UX)
- Inconsistent ArcGIS query-string construction across call sites for the six new endpoints — silently multiplies cache keys, defeating ETag/hash caching and re-running turf work every cycle (Pitfall11)
- Label-text-similarity precedence/dedup (matching "Marginal" across ERO/SPC, or "Severe Weather" across WPC-Precipitation/SPC-convective) — over-merges or under-merges distinct hazard dimensions, silently hides a real hazard or shows a false duplicate (Pitfall10)
- WSSI impact field documented mixed-case, returned ALL CAPS live — case-sensitive match silently fails, same shape as LABEL/label bug (STACK live finding)

## Display-Rewrite Risk

Pitfall9 (HIGH confidence, derived directly from reading MMM-SPCOutlook.js): the getDom() rewrite discards a ~15-input combinatorial no-risk gate (3 days × risk+proximity, day48Risk, fire weather across 8 days) and ten proximity-badge mode conditions accumulated across four prior milestones' incremental fixes (BUG-01..04, FWXT-01..05, PROX-01..06, PROXUI-01..05). There is no legacy fallback path (explicit v2.0 Key Decision — "no third render state") and no automated test suite (explicitly out of scope project-wide). Implication for phase sequencing: this must be a dedicated, later, single-purpose phase — not interleaved with new-product work, and not attempted before the new backend payload shape has been validated against live data. Before writing rewrite code, enumerate every current conditional branch as a checklist tied to its originating requirement ID, and treat "no risk anywhere" and "everything active at once" as two mandatory manual test runs. This is the single highest-regression-risk piece of the entire milestone.

## Implications for Roadmap

### Phase 0: Decision Queue resolution
**Rationale:** Decisions (esp. #4 window-spanning placement, #5 day-window merge strategy) are cheap now, expensive to discover mid-implementation (Pitfall4 = HIGH recovery cost).
**Delivers:** Recorded decisions for all 8 queue items.

### Phase 1: WPC ERO
**Rationale:** Cleanest, highest-fidelity new source, closest analog to existing fetchAndEvaluateHazard pattern.
**Delivers:** ERO fetch + 4-tier display, additive section, own toggle.
**Avoids:** Pitfall2, Pitfall6.

### Phase 2: WSSI Overall Impact
**Rationale:** Same fetch/turf shape as Phase1, needs own vocabulary table.
**Delivers:** WSSI fetch + display.
**Avoids:** ALL-CAPS impact field trap.

### Phase 3: WPC MPD
**Rationale:** Closest to existing SPC MD handling but with real structural deviations; higher risk than Phases1-2.
**Delivers:** Generalized getActiveDiscussions(), MPD in advisories band.
**Avoids:** Pitfall5.

### Phase 4: WPC Day3-7 + CPC Day8-14 Hazards Outlook
**Rationale:** Hardest GeoJSON product — multiplexed label parsing, case trap, filtering, window-spanning decision all land here; sequenced after simpler sources.
**Delivers:** Both hazards-outlook products per the Phase0 window-spanning decision.
**Avoids:** Pitfalls1, 3, 8.

### Phase 5: NWS HeatRisk
**Rationale:** Sequenced last — categorically different architecture (raster, no turf).
**Delivers:** Standalone HeatRisk parser, 5-level display.
**Avoids:** Pitfall7.

### Phase 6: Merge/precedence logic (backend)
**Rationale:** Built after Phases1-5 produce live data, per ARCHITECTURE's "rewrite-first is strictly worse" and Conflict3's resolution.
**Delivers:** Hazard-dimension taxonomy, validated suppressions, resolved window-spanning treatment.
**Avoids:** Pitfall10.

### Phase 7: Unified day-report backend schema + socket contract
**Delivers:** days/summary/sources/advisories schema, single named socket object.

### Phase 8: getDom() rewrite (frontend)
**Rationale:** Strictly last, single-purpose, high-scrutiny — see Display-Rewrite Risk.
**Delivers:** Unified rendering, detail toggle, full behavior-parity checklist.
**Avoids:** Pitfall9 in full.

**Deferred (v2.x/v3):** Detail-ON expanded rendering (ships inside Phase8 once compact is proven), WPC Day3-7 Cold/Wind/Waves, full CPC Day8-14 rollout, WSSI's 4 extra components, ERO Day4-5 (if declined), fetch parallelization (unless approved via Decision#7).

### Phase Ordering Rationale
Sources before rewrite, never interleaved (ARCHITECTURE Part D): interleaving reintroduces the branching sprawl this milestone exists to eliminate; rewriting first designs against unverified assumptions. Within sources, easiest-to-hardest keeps each phase's verification method clean and low-blast-radius. Precedence/merge strictly after all sources are live avoids designing the taxonomy against guessed shapes.

### Research Flags
Needs research: Phase 4 (date-bucketing/window-display re-verification against fresh payloads), Phase 5 (raster mechanics fundamentally different from every prior integration), Phase 6 (the milestone's actual novel contribution, no existing pattern to copy).
Standard patterns: Phase 1 (ERO, closest analog to proven pattern), Phase 2 (WSSI, same shape as Phase1), Phase 3 (MPD, deviations already fully enumerated and concrete).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Every endpoint hit live this session; schemas read from actual payloads |
| Features | MEDIUM | Structure/day-ranges/scales HIGH (official NOAA sources); exact colors LOW-MEDIUM (PNG swatches); proposed precedence table explicitly "for user approval," not live-verified |
| Architecture | MEDIUM | Existing-code claims HIGH (full source read); new-endpoint query-capability claims NOT live-verified — the "server-side point query eliminates turf work" claim does not survive Conflict1's resolution; rest of the analysis (sibling-function design, schema restructuring, build order) remains sound |
| Pitfalls | HIGH | Data-format/geometry findings verified against live payloads; temporal/merge findings HIGH for facts, MEDIUM for downstream implications; display-rewrite findings HIGH, from direct code read |

**Overall confidence:** MEDIUM-HIGH — six endpoints are a strong live-verified foundation, but precedence/merge design and day-window-alignment strategy remain open decisions that must be resolved before Phases 4 and 6 can be planned in detail.

### Gaps to Address
- Window-spanning hazard placement (Decision Queue #4) — must be decided before Phase4 planning.
- Server-side point-query capability was never tested (STACK queried where=1=1, not a geometry filter) — cheap future spike, not a blocker.
- Precedence table is not final — build in Phase6 from real captured payloads; treat FEATURES' Part B2 as a starting taxonomy.
- Exact hex/RGB colors for 4 of 6 products are LOW-MEDIUM confidence — visual verification needed at implementation time.
- CPC Day8-14 issuance cadence — documented weekday-only but live Saturday issuance observed; treat as daily/ETag-gated.
- MPD's "1-6 hour lead time" claim is WebSearch-only, unverified against a NOAA technical spec — low stakes.
- HeatRisk's exact identify query parameters were successfully live-tested by STACK.md — no longer an open gap.

## Sources

### Primary (HIGH confidence — live-verified this session)
- mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer — live queried (products 1&2)
- mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer — live queried (product 3)
- mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer — live queried (product 4)
- wpc.ncep.noaa.gov/metwatch/metwatch_mpd.php and wpc.ncep.noaa.gov/kml/mpd/MPD_1062_final.kmz — live fetched (product 5)
- mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify — live queried against two points (product 6)
- Direct source read: node_helper.js (1149 lines), MMM-SPCOutlook.js (196 lines), package.json, .planning/PROJECT.md

### Secondary (MEDIUM confidence)
- WPC/CPC official product pages — structural/scale/cadence docs, cross-checked against live payloads where possible
- experimental/wpc_winter_storm_outlook/MapServer — live-inspected for CRS behavior

### Tertiary (LOW confidence)
- Exact hex/RGB legend colors — sourced from PNG swatches or secondary summaries
- MPD lead-time claim — WebSearch-only

---
*Research completed: 2026-08-15*
*Ready for roadmap: yes — pending Decision Queue resolution for Phases 4 and 6*
