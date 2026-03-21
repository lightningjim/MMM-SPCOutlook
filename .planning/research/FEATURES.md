# Feature Landscape: Day 3–8 Fire Weather Extension

**Domain:** SPC fire weather outlook — extended forecast days
**Researched:** 2026-03-21
**Milestone:** v1.1 Fire Wx Outlook Expansion

---

## SPC Day 3–8 Fire Weather: How It Works

The SPC issues a Day 3–8 Fire Weather Outlook once daily (2200 UTC). Like Days 1–2, it uses two product components per day:

| Component | Abbrev | What It Covers |
|-----------|--------|----------------|
| Wind/Relative Humidity | WindRH | Dry/windy conditions threshold risk |
| Dry Thunderstorm | DryT | Convective lightning without meaningful precip |

Both use the same three-tier categorical risk system as Days 1–2:

| LABEL | Full Name | DN |
|-------|-----------|----|
| `ELEV` | Elevated | 5 |
| `CRIT` | Critical | 8 |
| `EXTM` | Extremely Critical | 10 |

**Key distinction from convective extended outlooks (Days 4–8):** Convective Days 4–8 are probabilistic (% chance, SIGN flag). Fire weather Days 3–8 are categorical (ELEV/CRIT/EXTM), same as Days 1–2. The fetch/parse pattern is simpler — no `percToRisk()` conversion needed, just `fireRiskToValue` label mapping already established in v1.0.

**Endpoint URL pattern (MEDIUM confidence — inferred from GIS page structure, not live-confirmed):**
```
Days 1–2 (confirmed live):  /products/fire_wx/day{N}fw_{type}.lyr.geojson
Days 3–8 (inferred):        /products/exper/fire_wx/day{N}fw_{type}.lyr.geojson
```
Where `{N}` is 3–8 and `{type}` is `windrh` or `dryt`.

Phase 3 research explicitly identified that Days 3–8 use `/products/exper/fire_wx/` instead of `/products/fire_wx/`. The GeoJSON feature structure (LABEL, VALID, geometry) is expected to be identical to Days 1–2. **URL verification against live endpoints is required at implementation time** — treat as a research flag.

---

## Table Stakes

Features the milestone must deliver. Missing any = incomplete milestone.

| Feature | Why Required | Complexity | Notes |
|---------|--------------|------------|-------|
| Fetch Days 3–8 fire weather (WindRH + DryT per day) when `extended: true` | Core milestone requirement | Low | Same pattern as Day 1–2 fetches; 12 new URL constants (6 days × 2 types) |
| Point-in-polygon per extended fire day | Without this, data is fetched but unused | Low | Reuses `extractPolygons()` + `evaluatePolygons()` — no new infrastructure |
| Per-day fire weather result in return object | Backend must surface data to frontend | Low | Extend `fireWeather` object with `day3Risk`–`day8Risk` fields; gated behind `extended` |
| Per-day display rows, shown only when risk > 0 | Conditional display matches Day 1–2 pattern | Low | Extend `getDom()` fire weather block; show day label ("Fire Wx (Day 3): ...") |
| "No Risk" guard update for extended fire weather | Without this, extended fire active + no convective = wrong "No Severe Weather Risk" display | Low | Already handled for Day 1–2; same pattern for Days 3–8 |
| Gate all extended fire fetches behind `extended: true` | Performance constraint — no wasted fetches on RPi | Low | Mirrors how convective Days 4–8 are gated |

---

## Differentiators

Features beyond minimum that add value without bloat.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Show "Fire Wx" label with day-of-week prefix | Consistency with convective row display (e.g. "Thu (Day 3): ...") | Very Low | `dowToText()` already handles this |
| Suppress days 3–8 fire rows independently per-day | Avoids empty rows for days with no fire risk | Very Low | Already the stated requirement — each day only shows when risk > 0 |

No high-complexity differentiators are worth pursuing for this milestone. The value is in coverage parity, not visual enhancement.

---

## Anti-Features

Explicitly out of scope for v1.1.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Separate DryT vs WindRH rows per day | Adds display clutter; not how users read fire weather | Merge to single per-day max, same as Days 1–2 |
| EXTM color confirmation wait | EXTM is rare; blocking on it delays the milestone | Ship with `#FF00FF` placeholder (established in v1.0 already) |
| Independent fire weather "extended" config flag | Over-engineering; fire weather extension is tied to the existing `extended` flag | Use existing `extended` toggle |
| Day 3–8 CIG tier equivalents for fire weather | Fire weather has no CIG-tier sub-product; SPC does not publish one | None needed |
| Stale data indicator | Already deferred to v2 per PROJECT.md | Do not surface `_stale` in display |

---

## Feature Dependencies

```
extended: true toggle (existing)
  → fetch Days 3–8 fire weather GeoJSON (new)
    → point-in-polygon per day (new, reuses existing helpers)
      → fireWeather.day3Risk–day8Risk in return object (new)
        → getDom() fire weather rows for Days 3–8 (new)

"No Risk" guard (existing)
  → must also check fireWeather.day3Risk–day8Risk when extended: true (new)
```

**Hard dependency:** The `fetchGeoJsonCached()` infrastructure (v1.0) must be used for all new fetches — not the bare `fetchGeoJson()`. This ensures ETag/hash caching applies to the 12 new endpoints.

**Existing helpers that require no modification:**
- `extractPolygons()` — handles LABEL → value mapping
- `evaluatePolygons()` — handles point-in-polygon with comparator
- `fetchGeoJsonCached()` — handles ETag/SHA256 caching
- `fireRiskToValue`, `fireValueToFull`, `fireRiskToColor` — already defined in `node_helper.js` and `getDom()`
- `fireComparator` — already defined

---

## MVP Recommendation

Prioritize in this order:

1. URL constants for Days 3–8 (WindRH + DryT per day) — 12 constants, trivial
2. Fetch + polygon eval blocks for each day (gated behind `extended`) — mechanical repetition of Day 1–2 pattern
3. Extend return object `fireWeather` with `day3Risk`–`day8Risk` fields
4. Extend `getDom()` fire weather block with Days 3–8 rows (inside `config.extended` guard)
5. Extend "No Risk" guard to include extended fire weather fields

Defer: Nothing — the feature set is tightly scoped and all complexity is Low.

---

## Research Flags for Implementation

| Item | Confidence | Action Required |
|------|------------|-----------------|
| Day 3–8 fire weather GeoJSON URL pattern | MEDIUM | Verify live at `https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrh.lyr.geojson` before coding URL constants |
| GeoJSON feature structure for extended days | MEDIUM | Confirm `LABEL` field uses same ELEV/CRIT/EXTM values as Days 1–2 |
| Whether Day 3–8 fire weather exists daily | LOW | SPC issues once/day at 2200 UTC; endpoints may return empty FeatureCollection on some days — confirm `extractPolygons()` handles gracefully (expected: yes, same null geometry handling) |

---

## Sources

- `/home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/.planning/milestones/v1.0-phases/03-fire-weather/03-RESEARCH.md` — Phase 3 research (HIGH confidence): confirmed Day 1–2 endpoint pattern, GeoJSON structure, LABEL values, noted Day 3–8 uses `/products/exper/fire_wx/`
- Live SPC endpoints (confirmed 2026-03-05): `day1fw_windrh.lyr.geojson`, `day2fw_windrh.lyr.geojson`
- `node_helper.js` (v1.0): confirmed `fireRiskToValue`, `fireComparator`, `fetchGeoJsonCached()` exist and apply
- `MMM-SPCOutlook.js` (v1.0): confirmed `fireRiskToColor`, `getDom()` fire weather block pattern
- [SPC Day 3-8 Fire Weather Forecast](https://www.spc.noaa.gov/products/exper/fire_wx/) — product page (MEDIUM)
- [SPC GIS Data](https://www.spc.noaa.gov/gis/) — endpoint directory (MEDIUM)
- [NWS PDD for Day 3-8 Fire Weather Outlook](https://www.spc.noaa.gov/misc/SPC_Day_3-8_Fire_Weather_Outlook_PDD.html) — product definition (MEDIUM, not directly fetched)
- [fire_weather/SPC_firewx MapServer](https://mapservices.weather.noaa.gov/vector/rest/services/fire_weather/SPC_firewx/MapServer) — confirms ELEV/CRIT/EXTM risk tier structure (MEDIUM)
