---
phase: 03-fire-weather
plan: 01
subsystem: api
tags: [fire-weather, geojson, point-in-polygon, turf, spc]

# Dependency graph
requires:
  - phase: 02-cig-tier-support
    provides: extractPolygons()/evaluatePolygons() helper pattern and cigComparator shape used as template
provides:
  - Fire weather fetch + evaluation in getSpcOutlook(); fireWeather in both return objects (day1Risk 0-3, day1Text, day2Risk 0-3, day2Text)
affects:
  - 03-02 (display plan consumes fireWeather.day1Risk, fireWeather.day2Risk)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fireRiskToValue map: ELEV=1, CRIT=2, EXTM=3 (integer tier encoding)"
    - "fireValueToFull map: 0=None, 1=Elevated, 2=Critical, 3=Extremely Critical"
    - "Two layers per day (windrh + dryt), Math.max across both for final risk"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "Fire weather fetches placed unconditionally before if (!extended) check — both return paths need the data"
  - "Two GeoJSON layers per day (wind+RH and dry/thunderstorm) merged with Math.max — matches SPC issuance model where either layer can trigger risk"
  - "ELEV/CRIT/EXTM integer tiers (1/2/3) mirror CIG tier pattern from Phase 2 for consistency"
  - "All awaits remain sequential per plan — Phase 4 handles parallelization optimization"

patterns-established:
  - "fireComparator shape: { initial: 0, comparator: (best, val) => Math.max(best, val) } — identical to cigComparator"
  - "Multi-layer risk merge: fetch each layer independently, Math.max result into running total"

requirements-completed: [FIRE-01, FIRE-02]

# Metrics
duration: 5min
completed: 2026-03-05
---

# Phase 3 Plan 1: Fire Weather Fetch and Detection Summary

**SPC fire weather outlook fetch (4 GeoJSON files) and point-in-polygon detection using existing extractPolygons()/evaluatePolygons() helpers, producing fireWeather: { day1Risk, day1Text, day2Risk, day2Text } in both return statements**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-05T01:57:18Z
- **Completed:** 2026-03-05T01:57:34Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fetches four SPC fire weather GeoJSON files per update cycle (day1fw_windrh, day1fw_dryt, day2fw_windrh, day2fw_dryt)
- Evaluates point-in-polygon for each layer, merging results with Math.max to determine highest fire risk tier
- Returns fireWeather: { day1Risk (0-3), day1Text, day2Risk (0-3), day2Text } in both the non-extended and extended return statements

## Task Commits

Each task was committed atomically:

1. **Task 1: Add fire weather fetch and evaluation to getSpcOutlook()** - `e335ca9` (feat)

**Plan metadata:** (docs commit follows)

## Files Created/Modified
- `node_helper.js` - Fire weather URL constants, risk maps, Day 1/2 fetch+evaluate blocks, fireWeather in both return objects

## Decisions Made
- Fire weather fetches placed unconditionally before `if (!extended)` — both return paths need the data so it cannot be gated on the extended flag
- Two GeoJSON layers per day merged with Math.max — SPC issues wind+RH and dry/thunderstorm layers independently; either can establish risk
- ELEV/CRIT/EXTM integer tiers mirror CIG tier encoding from Phase 2 for display-layer consistency

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- fireWeather data structure is now present in all getSpcOutlook() return values
- Plan 03-02 (display) can consume fireWeather.day1Risk and fireWeather.day2Risk directly
- No blockers

## Self-Check: PASSED
- SUMMARY.md: FOUND
- Task commit e335ca9: FOUND

---
*Phase: 03-fire-weather*
*Completed: 2026-03-05*
