# Technology Stack: Day 3–8 Fire Weather Extension

**Project:** MMM-SPCOutlook v1.1
**Researched:** 2026-03-21
**Milestone:** v1.1 Fire Wx Outlook Expansion

---

## Summary

No new dependencies. The v1.0 stack handles everything required for Days 3–8 fire weather. The entire milestone is URL constants + wiring through existing infrastructure.

---

## Stack (No Changes)

| Component | Version | Purpose | Status |
|-----------|---------|---------|--------|
| `@turf/turf` | 7.2.0 | Point-in-polygon for extended fire weather polygons | Already installed — no change |
| `node-fetch` | 2.6.1 | HTTP fetch with ETag support | Already installed — no change |
| MagicMirror² socket API | — | `GET_SPC_DATA` / `SPC_DATA_RESULT` | Already implemented — no change |
| `fetchGeoJsonCached()` | — | ETag/SHA256 caching for all new endpoints | Already implemented — no change |
| `extractPolygons()` | — | LABEL → value mapping for fire weather polygons | Already handles ELEV/CRIT/EXTM — no change |
| `evaluatePolygons()` | — | Point-in-polygon accumulator | Already handles any comparator — no change |

**No new npm packages. No new infrastructure. No dependency tree changes.**

---

## SPC Endpoint Research: Days 3–8 Fire Weather

### What Is Confirmed (HIGH confidence)

**Day 3–8 fire weather lives at a different path than Day 1–2:**

```
Day 1–2 (live-confirmed 2026-03-05):
  https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson
  https://www.spc.noaa.gov/products/fire_wx/day1fw_dryt.lyr.geojson
  https://www.spc.noaa.gov/products/fire_wx/day2fw_windrh.lyr.geojson
  https://www.spc.noaa.gov/products/fire_wx/day2fw_dryt.lyr.geojson

Day 3–8 product page:
  https://www.spc.noaa.gov/products/exper/fire_wx/    (experimental)
```

**Product structure (MEDIUM confidence — from NOAA PDD + MapServer layer names):**

The Day 3–8 fire weather product uses the same 3-tier categorical risk system as Days 1–2:

| LABEL | DN | Full Name |
|-------|----|-----------|
| `ELEV` | 5 | Elevated |
| `CRIT` | 8 | Critical |
| `EXTM` | 10 | Extremely Critical |

Source: NOAA PDD (`https://www.spc.noaa.gov/misc/SPC_Day_3-8_Fire_Weather_Outlook_PDD.html`) and MapServer metadata (`https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer`). The product is categorical (ELEV/CRIT/EXTM), NOT probabilistic. The Phase 3 researcher incorrectly noted "probabilistic" for Days 3–8 — this was an unchecked assumption. FEATURES.md (2026-03-21) correctly documents it as categorical.

**GeoJSON schema (MEDIUM confidence — expected identical to Days 1–2):**

```json
{
  "type": "Feature",
  "geometry": { "type": "MultiPolygon" },
  "properties": {
    "DN": 5,
    "LABEL": "ELEV",
    "LABEL2": "Elevated Fire Risk",
    "VALID": "...",
    "EXPIRE": "...",
    "stroke": "#FF7F00",
    "fill": "#FFBF80"
  }
}
```

The `LABEL` property with ELEV/CRIT/EXTM strings is the canonical parse target — matching the existing `fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 }` map in `node_helper.js`. No schema changes required.

### What Is Not Confirmed (LOW confidence — RESEARCH FLAG)

**The exact `lyr.geojson` filenames for Days 3–8 are unverified.**

Extensive web search found no indexed references to Day 3–8 fire weather `lyr.geojson` URLs. The filenames do not appear in any indexed source, GitHub project, or API documentation. This is the primary open question for implementation.

**NOAA MapServer layer names provide structural hints:**

The `SPC_firewx` MapServer indexes these named layers (confirmed from Google index, 2026-03-21):
- `Day 4 Winds and Low Humidity (ID: 11)` → maps to WindRH component
- `Day 7 Fire Weather Outlook (ID: 18)` → categorical outlook
- `Day 7 Fire Weather Outlook dryltg (ID: 20)` → dry lightning component
- `Day 1 Fire Weather Outlook dryltg (ID: 2)` → Day 1 dry lightning (confirming dryltg exists for Day 1 too)

This suggests the extended product has **two sublayer types per day**: a categorical/WRH layer and a `dryltg` (dry lightning) layer — analogous to `windrh` and `dryt` on Days 1–2, but possibly renamed.

**Two hypotheses for Day 3–8 URL pattern (pick one to verify at implementation time):**

Option A — Same naming convention as Day 1–2:
```
https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrh.lyr.geojson
https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_dryt.lyr.geojson
... through day8fw_windrh / day8fw_dryt
```

Option B — Single categorical file per day (merged):
```
https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_cat.lyr.geojson
... through day8fw_cat
```

**Recommendation:** Attempt Option A first (matches existing Day 1–2 pattern). If 404, attempt Option B. Do a live HTTP check against `day3fw_windrh.lyr.geojson` before writing any URL constants. The FEATURES.md research flag from the prior research pass applies: "Verify live at `https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrh.lyr.geojson` before coding URL constants."

**What days are published (MEDIUM confidence):**

The NOAA PDD states the Day 3–8 product is issued once daily at 2200 UTC, covering hours 48–192. All six days (3–8) are published as a single issuance. The endpoints for each day should be accessible as separate GeoJSON files given that the convective Day 4–8 product follows this pattern (`day4prob.lyr.geojson` through `day8prob.lyr.geojson`).

---

## Existing Infrastructure That Applies Unchanged

```
fetchGeoJsonCached()     → use for all 12 new URLs (ETag/SHA256 caching applies)
extractPolygons()        → label => fireRiskToValue[label] || 0 — already handles ELEV/CRIT/EXTM
evaluatePolygons()       → fireComparator already defined in getSpcOutlook()
fireRiskToValue          → { ELEV: 1, CRIT: 2, EXTM: 3 } — no change
fireValueToFull          → { 0: "None", 1: "Elevated", 2: "Critical", 3: "Extremely Critical" } — no change
fireComparator           → { initial: 0, comparator: Math.max } — no change
```

The `extended` flag already gates Day 4–8 convective fetches. The same gate applies to Days 3–8 fire weather.

---

## What NOT to Add

| Temptation | Why Not |
|------------|---------|
| New parsing infrastructure for Day 3–8 | Same LABEL-based categorical schema — existing `extractPolygons()` handles it |
| CIG tier equivalent for fire weather | SPC does not publish fire weather CIG-tier sublayers — no such product exists |
| Probabilistic conversion (`percToRisk`) | Day 3–8 fire weather is categorical, not probabilistic — confusion with convective Day 4–8 |
| Separate display rows for WindRH vs DryT | Merge to per-day max, same as Day 1–2 — display one "Fire Wx (Day N)" row per day |
| Separate `extendedFire` config flag | Use existing `extended` toggle — no new config keys |

---

## Sources

| Source | Type | Confidence |
|--------|------|------------|
| Live SPC endpoints confirmed 2026-03-05 | `/products/fire_wx/day1fw_windrh.lyr.geojson`, `day2fw_windrh.lyr.geojson` | HIGH |
| NOAA SPC Day 3-8 Fire Weather PDD — `https://www.spc.noaa.gov/misc/SPC_Day_3-8_Fire_Weather_Outlook_PDD.html` | Product definition: categorical, ELEV/CRIT/EXTM | MEDIUM |
| NOAA MapServer SPC_firewx — `https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer` | Layer names: Day 4 Winds and Low Humidity (ID:11), Day 7 dryltg (ID:20) | MEDIUM |
| SPC Day 3-8 Fire Weather product page — `https://www.spc.noaa.gov/products/exper/fire_wx/` | Confirms experimental path, issue time 2200 UTC | MEDIUM |
| Prior Phase 3 RESEARCH.md (v1.0) | Day 1–2 endpoints confirmed live; Day 3–8 deferred | HIGH (Day 1–2 only) |
| v1.1 FEATURES.md — `.planning/research/FEATURES.md` | URL inference documented; live check required | MEDIUM |
| WebSearch 2026-03-21 (multiple queries) | No indexed lyr.geojson filenames for Day 3–8 found | LOW (confirms absence of easy answer) |
