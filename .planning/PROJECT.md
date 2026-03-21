# MMM-SPCOutlook

## What This Is

A MagicMirror² module that uses geospatial math (turf.js) to determine whether the user's configured location falls within any active SPC (Storm Prediction Center) Convective Outlook risk zone, Fire Weather Risk area, or Mesoscale Discussion. It fetches live GeoJSON/KMZ data from NOAA SPC endpoints, runs point-in-polygon analysis on the backend, and renders risk levels with weather icons on the MagicMirror display. Runs on a Raspberry Pi-based MagicMirror. Shipped v1.1 with full Day 3–8 fire weather support (backend + display).

## Core Value

Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.

## Requirements

### Validated

- ✓ Module fetches live SPC Convective Outlook data (Days 1–8) from NOAA endpoints — existing
- ✓ Point-in-polygon detection using turf.js determines if configured lat/lon is within any outlook polygon — existing
- ✓ Risk level displayed with color coding and weather icons (tornado, hail, wind) — existing
- ✓ Configurable update interval, coordinates, and extended (Day 4–8) toggle — existing
- ✓ Mesoscale Discussion detection via ActiveMD.kmz — existing
- ✓ Fire Weather Risk detection — existing
- ✓ MagicMirror socket notification architecture (GET_SPC_DATA / SPC_DATA_RESULT) — existing
- ✓ SIGN detection fix (double-arrow syntax, BUG-01) — v1.0
- ✓ Day 8 return object fix (BUG-02) — v1.0
- ✓ day48Risk OR condition fix (BUG-03) — v1.0
- ✓ checkInPolygon full-iteration fix (BUG-04) — v1.0
- ✓ CIG1/CIG2/CIG3 tier support with ①②③ visual indicators (SPC-01, SPC-02) — v1.0
- ✓ Fire Weather Outlook fetch, detection, and display (FIRE-01, FIRE-02, FIRE-03) — v1.0
- ✓ GeoJSON caching with ETag/SHA256 — no redundant turf calls (PERF-01, PERF-02) — v1.0
- ✓ fetchAndEvaluateHazard DRY refactor; zero var/console/dead code (QUAL-01–04) — v1.0
- ✓ Day 3–8 fire weather endpoint URLs confirmed live (all 12 HTTP 200); DN-based parsing strategy documented (FWXT-05) — v1.1
- ✓ `getSpcOutlook()` fetches Day 3–8 fire weather via `fetchGeoJsonCached`, evaluates via DN-based parsing, populates `day3Risk`–`day8Risk` + `day3Text`–`day8Text` in both return paths (FWXT-01, FWXT-02, FWXT-04) — v1.1
- ✓ Display per-day fire weather rows for Days 3–8, shown only when that day's risk > 0; no-risk guard extended to include Day 3–8 checks (FWXT-03) — v1.1

### Active

(None — v1.1 complete. See `/gsd:new-milestone` to define next milestone.)

### Out of Scope

- Mobile app or web interface — MagicMirror display module only
- Push notifications or alerts — display only
- Historical outlook data — live/current data only
- Non-SPC weather data sources — SPC products only
- Stale data UI indicator — `_stale`/`_staleAsOf` backend fields exist; frontend never surfaces them (v2 candidate)
- Automated test framework — no test infrastructure; not added in this pass

## Context

**Shipped v1.1 — 2026-03-21**
- 1,029 LOC total: `node_helper.js` (895 lines), `MMM-SPCOutlook.js` (134 lines)
- 3 phases (8–10) executed in 1 day; +92 insertions across 2 files
- Completed Fire Wx Outlook Expansion: all 5 FWXT requirements satisfied

**Shipped v1.0 — 2026-03-12**
- 942 LOC total: `node_helper.js` (825 lines), `MMM-SPCOutlook.js` (117 lines)
- Tech stack: MagicMirror² framework, Node.js, turf.js v7.2.0, KMZ/KML parsing for MDs
- 7 phases executed via GSD workflow over 8 days (2026-03-04 → 2026-03-12)
- All 15 v1 requirements satisfied; 4 prior integration defects resolved post-audit

**Known tech debt (v2 candidates):**
- `_stale`/`_staleAsOf` backend fields not consumed in display (no user-facing stale indicator)
- Human runtime verification pending for extended fire weather rows (requires live fire weather season data)

## Constraints

- **Platform**: Raspberry Pi — keep CPU usage low; avoid blocking the event loop
- **Framework**: MagicMirror² — must comply with module API conventions
- **Dependencies**: Minimize changes to dependency tree; turf.js stays
- **Data sources**: NOAA SPC endpoints only — no third-party weather APIs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use turf.js for polygon math | Industry standard, already integrated, accurate | ✓ Good |
| Process in node_helper (backend) | Keeps heavy math off the browser/render thread | ✓ Good |
| Cache polygon math results per URL | Avoid re-running turf on every update cycle if data hasn't changed | ✓ Good — ETag/SHA256 dual strategy |
| CIG tiers as integers (0/1/2/3) | Consistent with fire weather tier encoding; cigLabel() handles display | ✓ Good |
| Each CIG hazard has its own endpoint | cigtorn/cighail/cigwind are separate GeoJSON files from SPC | ✓ Good |
| Fire weather fetch unconditionally before extended branch | Both return paths need fireWeather object | ✓ Good |
| ETag-first, SHA256-hash fallback | If server sends ETags, skip hash CPU cost; otherwise hash raw text body | ✓ Good |
| fetchAndEvaluateHazard shared function | 6 identical Day1/Day2 tor/hail/wind blocks → single helper with CIG passthrough | ✓ Good |
| DN-based parsing for Day 3–8 fire weather | LABEL field contains "D3"/"D6" day identifier, not risk level; DN=5/8/10 encodes risk | ✓ Good — confirmed via live endpoint inspection |
| Day 3–8 fire rows via loop in getDom() | `for (let d = 3; d <= 8; d++)` with per-day `dayNRisk > 0` guard — clean and DRY | ✓ Good |
| Reuse `fireRiskToColor()` for Day 3–8 display | Same risk-to-color mapping as Day 1–2; no new logic needed | ✓ Good |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-03-21 after v1.1 milestone*
