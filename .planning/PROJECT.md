# MMM-SPCOutlook

## What This Is

A MagicMirror² module that uses geospatial math (turf.js) to determine whether the user's configured location falls within any active SPC (Storm Prediction Center) Convective Outlook risk zone, Fire Weather Risk area, or Mesoscale Discussion. It fetches live GeoJSON/KMZ data from NOAA SPC endpoints, runs point-in-polygon analysis on the backend, and renders risk levels with weather icons on the MagicMirror display. Designed to run on a Raspberry Pi-based MagicMirror.

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

### Active

- [ ] Update SIGN handling to support new SPC CIG1/CIG2/CIG3 tiered severity system
- [ ] Fix Day 8 returning Day 7 risk values (wrong variable `day7Risk` used)
- [ ] Fix Day 4–8 `day48Risk` always evaluating to false (checks day4 five times instead of days 4–8)
- [ ] Fix SIGN double-arrow syntax bug (`label => label => label`) breaking Tornado/Hail/Wind SIGN detection
- [ ] Fix Mesoscale Discussion returning only first match; should collect all overlapping MDs
- [ ] Reduce polygon math overhead for Raspberry Pi (cache results, avoid redundant turf calls)
- [ ] Refactor repeated Day 1/Day 2 fetch/process logic into shared function (DRY)
- [ ] Clean up variable declarations (replace `var` and implicit globals with `const`/`let`)
- [ ] Remove dead/commented-out code and excessive debug `console.log` calls
- [ ] Update frontend display to show CIG1/CIG2/CIG3 SIGN tiers appropriately

### Out of Scope

- Mobile app or web interface — this is a MagicMirror display module only
- Push notifications or alerts — display only
- Historical outlook data — live/current data only
- Non-SPC weather data sources — SPC products only

## Context

- Module runs in MagicMirror² framework on a Raspberry Pi, making CPU/memory efficiency important
- Backend processing in `node_helper.js`: fetches GeoJSON/KMZ, parses KML, runs turf point-in-polygon, evaluates risk
- Frontend rendering in `MMM-SPCOutlook.js`: displays results via MagicMirror DOM API
- SPC recently changed SIGN (significant) risk representation from a boolean to tiered CIG1/CIG2/CIG3 levels
- Known bugs identified via codebase analysis: Day 8 data errors, broken SIGN detection, incomplete MD matching
- turf.js v7.2.0 handles all spatial math; KMZ files (Mesoscale Discussions) require unzip + KML→GeoJSON conversion

## Constraints

- **Platform**: Raspberry Pi — keep CPU usage low; avoid blocking the event loop
- **Framework**: MagicMirror² — must comply with module API conventions
- **Dependencies**: Minimize changes to dependency tree; turf.js stays
- **Data sources**: NOAA SPC endpoints only — no third-party weather APIs

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use turf.js for polygon math | Industry standard, already integrated, accurate | — Pending review for RPi perf |
| Process in node_helper (backend) | Keeps heavy math off the browser/render thread | ✓ Good |
| Cache polygon math results | Avoid re-running turf on every update cycle if data hasn't changed | — Pending |

---
*Last updated: 2026-03-04 after initialization*
