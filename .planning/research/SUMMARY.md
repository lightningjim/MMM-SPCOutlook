# Project Research Summary

**Project:** MMM-SPCOutlook v1.1 — Fire Wx Outlook Expansion
**Domain:** MagicMirror² module — NOAA SPC GeoJSON data integration
**Researched:** 2026-03-21
**Confidence:** MEDIUM (blocked by one unverified external dependency)

## Executive Summary

The v1.1 milestone extends the existing Day 1–2 fire weather coverage to Days 3–8 using the SPC's experimental extended fire weather outlook product. This is a low-complexity additive feature — no new dependencies, no new infrastructure, no schema changes. The entire implementation is: 12 URL constants, 12 fetch blocks wired to existing helpers, 6 new return object fields, one getDom loop, and a guard update. Every piece of processing infrastructure needed already exists in v1.0 (`fetchGeoJsonCached`, `extractPolygons`, `evaluatePolygons`, `fireRiskToValue`, `fireComparator`).

The recommended approach is backend-first: verify the 12 endpoint URLs live before writing any code, then wire fetch blocks inside the existing `extended` branch, extend the `fireWeather` return object with `day3Risk`–`day8Risk` fields, and add the display loop in getDom. The extended fire weather product is categorical (ELEV/CRIT/EXTM), identical to Days 1–2 — not probabilistic, which keeps parsing trivial.

The primary risk is that the Day 3–8 GeoJSON endpoint URLs are inferred, not confirmed live. If `https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrh.lyr.geojson` does not exist, the entire implementation strategy needs to pivot to the NOAA MapServer REST API as an alternative data source. All implementation must be blocked on URL verification. Secondary risks — no-risk guard omission and the two-return-path fireWeather shape mismatch — are well-understood correctness bugs that are easy to prevent if caught at code-writing time.

---

## Key Findings

### Recommended Stack

No changes to the dependency tree. The v1.0 stack handles everything. See `.planning/research/STACK.md` for full details.

**Core technologies:**
- `@turf/turf` 7.2.0: point-in-polygon evaluation — already handles extended fire weather polygons, no change
- `fetchGeoJsonCached()`: ETag/SHA256 caching — applies to all 12 new endpoints unchanged
- `extractPolygons()` + `fireRiskToValue`: LABEL → integer risk mapping — already handles ELEV/CRIT/EXTM, no change
- MagicMirror² socket API (`GET_SPC_DATA` / `SPC_DATA_RESULT`): already implemented, no change

### Expected Features

See `.planning/research/FEATURES.md` for full details.

**Must have (table stakes):**
- Fetch Days 3–8 fire weather (WindRH + DryT per day) when `extended: true`
- Point-in-polygon evaluation per extended fire day
- `day3Risk`–`day8Risk` fields in the `fireWeather` return object
- Per-day display rows in getDom, shown only when risk > 0
- No-risk guard updated to include extended fire weather days
- All extended fetches gated behind `extended: true`

**Should have (differentiators):**
- Day-of-week prefix on fire weather row labels ("Thu (Day 3): ...") — `dowToText()` already handles this, very low cost

**Defer (v2+):**
- Stale data indicator — already deferred per PROJECT.md
- Separate DryT vs WindRH rows — display clutter, no user value
- Independent `extendedFireWeather` config flag — over-engineering
- CIG-tier equivalents for fire weather — no such SPC product exists

### Architecture Approach

The integration inserts inside the existing `extended` branch after the Day 4–8 convective block, extending the fireWeather return object shape. Both return paths (extended and non-extended) must carry the same `fireWeather` key shape, with Days 3–8 fields defaulting to 0 in the non-extended path. See `.planning/research/ARCHITECTURE.md` for full code patterns.

**Major components affected:**
1. `node_helper.js` — URL constants: 12 new strings (day3–8, WindRH + DryT)
2. `node_helper.js` — fetch blocks: 12 new `fetchGeoJsonCached` calls inside extended branch; extend fireWeather return
3. `MMM-SPCOutlook.js` — getDom: `for (let d = 3; d <= 8; d++)` loop for fire weather rows; no-risk guard OR-extension

### Critical Pitfalls

1. **Day 3–8 GeoJSON URLs may not exist** — The `day3fw_windrh.lyr.geojson` naming is inferred from Day 1–2 pattern. No indexed source confirms these files exist at `/products/exper/fire_wx/`. Verify all 12 URLs with HTTP 200 check before writing any fetch code. Fallback: NOAA MapServer REST API.

2. **Extended fire weather schema may not be categorical** — If Day 3–8 GeoJSON files exist but use probabilistic labels (numeric) instead of ELEV/CRIT/EXTM strings, the existing `fireRiskToValue` mapper silently returns 0 for everything. Inspect `properties.LABEL` on a live file before writing the label mapper.

3. **No-risk guard omission** — The existing `getDom()` guard only checks `day1Risk > 0 || day2Risk > 0`. Not updating it means a user with only Day 5 fire weather risk sees "No Severe Weather Risk." Update the guard in the same commit as adding display rows.

4. **Two return paths, one fireWeather shape** — `getSpcOutlook()` has two `return` blocks. Extended fire weather fields added to the extended return only will cause `undefined` reads in getDom for non-extended users. Add `day3Risk`–`day8Risk` as 0 to the non-extended return block.

5. **12 sequential fetches on cold start** — All 12 URLs may miss cache simultaneously at the 2200 UTC SPC issuance. Cold-start cycle time should be measured post-deployment. If > 60s total, consider `Promise.all` for the extended fire weather block.

---

## Implications for Roadmap

### Phase 1: URL and Schema Verification
**Rationale:** The entire feature depends on whether the inferred URLs exist and what schema they use. This must be resolved before any implementation work. Spending time writing fetch code against unverified URLs is the single highest-risk action for this milestone.
**Delivers:** Confirmed endpoint URLs (or fallback strategy) and confirmed GeoJSON schema for extended fire weather
**Addresses:** Pitfalls 1 and 2 (endpoint existence, schema mismatch)
**Research flag:** YES — live HTTP checks required; outcome determines implementation path

### Phase 2: Backend Implementation
**Rationale:** URL constants and fetch blocks are mechanical once endpoints are confirmed. Return object extension is trivial and follows established v1.0 naming conventions.
**Delivers:** `day3Risk`–`day8Risk` / `day3Text`–`day8Text` populated in the `getSpcOutlook()` return object when `extended: true`
**Uses:** Confirmed URLs from Phase 1; existing `fetchGeoJsonCached`, `extractPolygons`, `evaluatePolygons`, `fireRiskToValue`, `fireComparator`
**Avoids:** Two-return-path shape mismatch (Pitfall 4) — add fields as 0 to non-extended return in same commit
**Research flag:** NO — standard pattern, well-documented in ARCHITECTURE.md

### Phase 3: Display Implementation
**Rationale:** Frontend work depends on backend fields existing. getDom loop and guard update are independent of each other but both depend on the Phase 2 return object shape.
**Delivers:** Rendered fire weather rows for Days 3–8 in the module display; corrected no-risk guard
**Implements:** getDom loop (`for d = 3..8`) + no-risk guard OR extension
**Avoids:** No-risk guard omission (Pitfall 5) — update guard in same commit as display rows
**Research flag:** NO — display pattern identical to Day 1–2, getDom changes are low risk

### Phase 4: Validation
**Rationale:** Performance and display edge cases need explicit observation before release.
**Delivers:** Confirmed correct behavior for no-risk, partial-risk, and all-risk scenarios; cold-start cycle time baseline on RPi
**Addresses:** Pitfalls 3 (cold-start performance) and 7 (all-6-days display overflow)
**Research flag:** NO — standard validation, checklist-driven

### Phase Ordering Rationale

- Phase 1 (verification) must precede all implementation — endpoint existence is a binary gate
- Phases 2 and 3 are sequentially dependent (backend before frontend) but each is a single sitting's work
- Phase 4 is post-implementation and should run on target hardware (RPi)
- No features are deferred across phases — the scope is small enough for linear execution

### Research Flags

Phases needing research during planning:
- **Phase 1 (URL verification):** Live HTTP checks against SPC experimental endpoints; outcome may require a pivot to NOAA MapServer REST API with different fetch/parse strategy

Phases with standard patterns (skip research-phase):
- **Phase 2 (backend):** Direct application of established v1.0 fetch/parse/return pattern
- **Phase 3 (display):** Direct extension of existing getDom fire weather block
- **Phase 4 (validation):** Standard test/observe checklist

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | No changes — all technology confirmed live in v1.0 |
| Features | HIGH | Scope is tightly defined; Day 1–2 pattern is the template |
| Architecture | HIGH | Integration points confirmed from direct code read; insertion location unambiguous |
| Pitfalls | HIGH | Critical pitfalls derived from live code inspection and prior phase research |
| Endpoint URLs | LOW | The one genuine unknown — filename convention inferred, not network-verified |
| GeoJSON schema | MEDIUM | Categorical ELEV/CRIT/EXTM confirmed from NOAA PDD and MapServer metadata; live file not inspected |

**Overall confidence:** MEDIUM — everything except the endpoint URLs is HIGH confidence. The LOW-confidence gap is well-scoped and has a defined resolution strategy.

### Gaps to Address

- **Day 3–8 endpoint URL existence:** Verify `https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrh.lyr.geojson` (and day4–8) return HTTP 200 before implementation. If 404: try `day3fw_cat.lyr.geojson` variant; if that fails, pivot to NOAA MapServer REST query pattern.
- **GeoJSON LABEL values on extended product:** Confirm that live Day 3–8 files use ELEV/CRIT/EXTM strings (not numeric probabilities). Inspect `properties.LABEL` on at least one live feature before writing the label mapper.
- **Empty FeatureCollection handling:** Confirm `extractPolygons()` returns 0 gracefully when SPC issues no areas for a given day (expected yes — same null geometry path as existing code, but worth logging on first run).

---

## Sources

### Primary (HIGH confidence)
- Live SPC Day 1–2 endpoints confirmed 2026-03-05: `day1fw_windrh.lyr.geojson`, `day2fw_windrh.lyr.geojson`
- `node_helper.js` v1.0 — direct code inspection: fire weather fetch blocks, caching pattern, return structure
- `MMM-SPCOutlook.js` v1.0 — direct code inspection: `fireRiskToColor`, getDom fire weather block, no-risk guard
- `.planning/milestones/v1.0-phases/03-fire-weather/03-RESEARCH.md` — v1 research flagging Day 3–8 URL divergence

### Secondary (MEDIUM confidence)
- [NOAA SPC Day 3-8 Fire Weather PDD](https://www.spc.noaa.gov/misc/SPC_Day_3-8_Fire_Weather_Outlook_PDD.html) — product definition: categorical, ELEV/CRIT/EXTM, issuance at 2200 UTC
- [NOAA MapServer SPC_firewx](https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer) — layer names confirm WindRH and dryltg sublayers exist for extended days
- [SPC Fire Weather Experimental page](https://www.spc.noaa.gov/products/exper/fire_wx/) — confirms `/products/exper/fire_wx/` path, once-daily issuance

### Tertiary (LOW confidence)
- WebSearch 2026-03-21 (multiple queries) — no indexed `lyr.geojson` filenames for Day 3–8 found; confirms absence of easy URL confirmation

---
*Research completed: 2026-03-21*
*Ready for roadmap: yes*
