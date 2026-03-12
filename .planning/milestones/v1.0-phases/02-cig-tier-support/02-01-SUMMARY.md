---
phase: 02-cig-tier-support
plan: 01
subsystem: api
tags: [spc, geojson, cig-tiers, node_helper]

# Dependency graph
requires:
  - phase: 01-bug-fixes
    provides: Corrected extractPolygons/evaluatePolygons patterns and SIGN extraction base
provides:
  - CIG-aware getSpcOutlook() with cigToTier lookup, cigComparator, 7 new CIG endpoint URLs
  - torCig/hailCig/windCig integer fields (0-3) in Day 1 and Day 2 return objects
  - cig integer field (0-3) in Day 3 return objects
  - Removal of all SIGN extraction code for Days 1-3
affects:
  - 03-fire-weather (pattern reference for fetch-and-extract)
  - frontend MMM-SPCOutlook.js (field name changes: torSign->torCig, hailSign->hailCig, windSign->windCig, sign->cig for Day 3)

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "CIG tier fetch-and-extract: fetchGeoJson(CIG URL) -> extractPolygons with cigToTier lookup -> evaluatePolygons with cigComparator"
    - "cigToTier lookup object {CIG1:1, CIG2:2, CIG3:3} maps label strings to integer severity"
    - "cigComparator uses Math.max (same shape as catComparator) for integer accumulation"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "CIG tiers are integers (0/1/2/3) not booleans — returned as torCig/hailCig/windCig and cig"
  - "Each CIG hazard type fetches its own dedicated endpoint (cigtorn/cighail/cigwind) rather than reusing tor/hail/wind GeoJSON"
  - "Day 3 uses day3otlk_cigprob.lyr.geojson replacing the now-dead day3otlk_sigprob.lyr.geojson"
  - "Days 4-8 SIGN logic intentionally left unchanged — no CIG endpoints exist for Days 4-8"
  - "CIG fetch is guarded: only fetches if underlying hazard risk > 0 (lazy fetch, avoids unnecessary network calls)"

patterns-established:
  - "CIG fetch-and-extract guard pattern: if (dayNHazardRisk > 0) { const cigGeojson = await fetchGeoJson(URL); if (cigGeojson) { ... } }"
  - "cigToTier[label] || 0 safely handles unknown or missing labels"

requirements-completed: [SPC-01]

# Metrics
duration: 4min
completed: 2026-03-05
---

# Phase 2 Plan 01: CIG Tier Support Summary

**Replaced dead SIGN boolean extraction with 7 dedicated CIG endpoint fetches in node_helper.js, returning integer tiers 0-3 for tornado/hail/wind across Days 1-3**

## Performance

- **Duration:** ~4 min
- **Started:** 2026-03-05T00:02:35Z
- **Completed:** 2026-03-05T00:06:15Z
- **Tasks:** 3
- **Files modified:** 1

## Accomplishments
- Added `cigToTier` lookup and `cigComparator` (integer Math.max accumulation), removed `sigComparator`
- Replaced 7 SIGN extraction blocks (Day 1 tor/hail/wind, Day 2 tor/hail/wind, Day 3) with fetch-and-extract from dedicated CIG endpoints
- Updated both non-extended and extended return objects: torSign/hailSign/windSign -> torCig/hailCig/windCig; day3.sign -> day3.cig
- Cleaned duplicate extractPolygons call in Day 2 hail block (was calling it twice before the if-guard)
- Days 4-8 SIGN logic preserved untouched

## Task Commits

Each task was committed atomically:

1. **Task 1: Add CIG infrastructure constants and URL variables** - `6ed8f72` (feat)
2. **Task 2: Replace SIGN extraction blocks with CIG fetch-and-extract for Days 1-3** - `5660609` (feat)
3. **Task 3: Update return objects - torSign/hailSign/windSign/sign to CIG integer fields** - `911bf6d` (feat)

## Files Created/Modified
- `/home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/node_helper.js` - CIG-aware getSpcOutlook() with cigToTier, 7 new endpoints, updated return objects

## Decisions Made
- CIG tiers represented as integers 0-3 (0=none, 1=CIG1, 2=CIG2, 3=CIG3) consistent with catComparator pattern
- CIG fetches are lazy — only triggered when underlying hazard risk is > 0, avoiding unnecessary API calls
- Each CIG fetch is null-guarded (`if (cigGeojson)`) matching the defensive pattern of fetchGeoJson which returns null on error

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Removed duplicate extractPolygons call in Day 2 hail block**
- **Found during:** Task 2 (Replace SIGN extraction blocks)
- **Issue:** Line 327 had a bare `day2HailRiskPoly = this.extractPolygons(geojson, label => label, ...)` call outside any conditional, immediately before the if-block that repeated it — dead assignment, likely a copy-paste artifact
- **Fix:** Removed both the bare call and the if-block, replaced with clean CIG fetch-and-extract pattern
- **Files modified:** node_helper.js
- **Verification:** No duplicate assignment in final code, syntax check passes
- **Committed in:** 5660609 (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Cleanup of pre-existing dead code encountered in the SIGN block being replaced. No scope creep.

## Issues Encountered
None - all planned changes applied cleanly. The plan's line number references matched the actual file precisely.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- node_helper.js now returns CIG integer tiers for Days 1-3 in both return paths
- Frontend (MMM-SPCOutlook.js) will need to be updated to consume torCig/hailCig/windCig and day3.cig instead of the old boolean Sign fields
- Phase 3 (fire weather) can reference the CIG fetch-and-extract pattern as an established convention

---
*Phase: 02-cig-tier-support*
*Completed: 2026-03-05*
