---
phase: 09-backend-implementation
plan: 01
subsystem: api
tags: [node_helper, fire-weather, geojson, turf, spc, extended]

# Dependency graph
requires:
  - phase: 08-url-verification
    provides: Verified Day 3-8 fire weather URLs (all 12 HTTP 200) and DN-based parse schema
provides:
  - Day 3-8 fire weather fetch/evaluate logic in getSpcOutlook() (node_helper.js)
  - dnToFireValue mapper for DN-based risk parsing
  - Extended extractPolygons signature accepting feature as second arg to toValue
  - Both fireWeather return paths populated with day3-day8 risk and text fields
affects: [10-display-implementation]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "DN-based fire weather parsing: use f.properties.DN via dnToFireValue { 5:1, 8:2, 10:3 } for Day 3-8; do NOT use LABEL"
    - "Sequential fetch loop: for d in 3..8, fetch windrhcat + drytcat, max the two results into dayNFireRisk"
    - "extractPolygons toValue signature: (label, f) — passes full feature as second arg, backward-compatible with all existing single-arg callers"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "Sequential fetches (12 total) over concurrent — matches Day 1-2 pattern, avoids network spike on RPi (D-04)"
  - "Loop over days 3-8 instead of per-day explicit blocks — DRY, 12 lines vs 96"
  - "Non-extended path returns hardcoded zeros for day3-8 — no undefined reads possible (D-03)"

patterns-established:
  - "Day 3-8 URL pattern: https://www.spc.noaa.gov/products/exper/fire_wx/day{N}fw_windrhcat.lyr.geojson"
  - "dayFireRisks array with index-aligned slots [null, null, null, d3, d4, d5, d6, d7, d8]"

requirements-completed: [FWXT-01, FWXT-02, FWXT-04]

# Metrics
duration: 2min
completed: 2026-03-21
---

# Phase 9 Plan 01: Backend Implementation Summary

**Day 3-8 fire weather fetch loop added to getSpcOutlook() using DN-based parsing via exper/fire_wx windrhcat/drytcat endpoints, populating day3Risk-day8Risk in both fireWeather return paths**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-03-21T21:59:18Z
- **Completed:** 2026-03-21T22:01:05Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments

- Extended `extractPolygons` to pass full feature object as second arg to `toValue` (one-line backward-compatible change)
- Added `dnToFireValue = { 5:1, 8:2, 10:3 }` constant for DN-based risk parsing
- Added sequential Day 3-8 fetch loop using verified `exper/fire_wx` URLs with `cat` suffix
- Both fireWeather return objects now include `day3Risk`-`day8Risk` and `day3Text`-`day8Text`

## Task Commits

Each task was committed atomically:

1. **Task 1: Extend extractPolygons and add Day 3-8 fire weather fetch/evaluate** - `3d0de3e` (feat)
2. **Task 2: Populate fireWeather return object in both code paths** - `7371a42` (feat)

## Files Created/Modified

- `node_helper.js` - Extended extractPolygons signature, added dnToFireValue, added Day 3-8 fetch loop, updated both fireWeather return objects

## Decisions Made

- Loop over days 3-8 rather than explicit per-day blocks — DRY, reduces code from ~96 lines to ~12
- Used index-aligned array (`dayFireRisks[3..8]`) to map loop variable to named variables cleanly
- Hardcoded zeros in non-extended path rather than running the fetch conditionally — simpler, and the `if (extended)` guard already prevents all 12 fetches

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Backend complete: `fireWeather.day3Risk`-`day8Risk` and `day3Text`-`day8Text` populated in both return paths
- Phase 10 (display implementation) can now consume these fields to render Day 3-8 fire weather rows

---
*Phase: 09-backend-implementation*
*Completed: 2026-03-21*
