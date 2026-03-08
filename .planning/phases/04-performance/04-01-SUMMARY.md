---
phase: 04-performance
plan: 01
subsystem: backend
tags: [geojson, cache, turf, performance, node_helper, sha256, etag]

# Dependency graph
requires:
  - phase: 03-fire-weather
    provides: fire weather fetch and evaluation in getSpcOutlook()
provides:
  - Per-URL GeoJSON in-memory cache (ETag-first, SHA256-hash fallback) wired into all getSpcOutlook() fetches
  - Stale-window fallback on network/HTTP failure returning _stale: true on result
  - Location-change cache invalidation nulling result/timestamp on all entries
  - sigComparator definition fixing latent ReferenceError in extended mode
  - Single-pass Days 4-8 extractPolygons (both risk and SIGN extracted before any evaluatePolygons call)
affects: [04-performance]

# Tech tracking
tech-stack:
  added: [Node.js built-in crypto (sha256 hash)]
  patterns:
    - fetchGeoJsonCached() wraps fetch with ETag conditional request and SHA256 content hash comparison
    - Cache entries keyed by URL string, stored in this._geoJsonCache Map initialized in start()
    - Days 4-8 cache result as { probRisk, sign } object; Days 1-3 cache scalar values
    - anyStale flag accumulates across all URL fetches, spread into both return paths

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "ETag-first with SHA256-hash fallback: if server sends ETags, skip hash computation; if not, hash raw text body"
  - "Stale fallback uses this.config.updateInterval (default 60min) to define the acceptance window"
  - "Days 4-8 cache { probRisk, sign } objects; Days 1-3 cache scalar turf outputs — same Map, different value shapes per URL"
  - "fetchGeoJson() left unchanged — still used by getMesoscaleDiscussion for KMZ/binary fetches"
  - "sigComparator: { initial: false, comparator: () => true } — any SIGN polygon match returns true"

patterns-established:
  - "fetchGeoJsonCached pattern: check cache -> send If-None-Match -> handle 304/200/error -> return { data, cachedResult, stale, mode, newEtag, newHash }"
  - "Cache write pattern: always after evaluatePolygons, with { mode, etag, hash, result, timestamp }"

requirements-completed: [PERF-01, PERF-02]

# Metrics
duration: 5min
completed: 2026-03-08
---

# Phase 4 Plan 01: Performance Cache Summary

**Per-URL GeoJSON cache with ETag-first/SHA256-hash fallback wired into all getSpcOutlook() fetches, eliminating redundant turf polygon math across cycles (PERF-01) and within Days 4-8 (PERF-02)**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-03-08T00:00:59Z
- **Completed:** 2026-03-08T00:05:48Z
- **Tasks:** 3 of 3
- **Files modified:** 1

## Accomplishments

- Added `crypto` require and `_geoJsonCache` Map initialized in `start()` with `_cachedLat`/`_cachedLon` for location tracking
- Implemented `_isWithinStaleWindow()` using `this.config?.updateInterval ?? 60` and `fetchGeoJsonCached()` with full ETag/hash/stale logic
- Replaced all 20+ `fetchGeoJson()` calls in `getSpcOutlook()` with `fetchGeoJsonCached()` pattern — cache entries written after each `evaluatePolygons()` call
- Fixed latent `ReferenceError: sigComparator is not defined` in extended mode by defining `sigComparator` alongside other comparators
- Days 4-8 now use single-pass extraction: both `dayXRiskPoly` and `dayXSignPoly` extracted from same GeoJSON before any `evaluatePolygons` call (PERF-02)
- Both non-extended and extended return paths include `_stale: true, _staleAsOf` when any URL used stale fallback

## Task Commits

Each task was committed atomically:

1. **Task 1: Add cache infrastructure — fetchGeoJsonCached, _isWithinStaleWindow, init in start()** - `792875f` (feat)
2. **Task 2: Wire fetchGeoJsonCached into getSpcOutlook() and fix Days 4-8 PERF-02 + sigComparator** - `8282dc9` (feat)
3. **Task 3: Human verify — cache hits in logs and no display regression** - checkpoint approved (user confirmed "cache hit (ETag)" log lines, no display regression)

## Files Created/Modified

- `node_helper.js` - Added crypto require, cache init in start(), _isWithinStaleWindow(), fetchGeoJsonCached(); rewrote getSpcOutlook() to use cache pattern; fixed sigComparator; single-pass Days 4-8

## Decisions Made

- ETag-first with SHA256-hash fallback: if server sends ETags, skip hash computation; if not, hash raw text body
- Stale fallback uses `this.config.updateInterval` (default 60 min) to define the acceptance window — consistent with frontend config
- Days 4-8 cache `{ probRisk, sign }` objects; Days 1-3 cache scalar turf outputs — same Map, different value shapes per URL
- `fetchGeoJson()` left unchanged — still used by `getMesoscaleDiscussion` for KMZ binary fetches
- `sigComparator: { initial: false, comparator: () => true }` — any SIGN polygon match returns true

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

- node_helper.js: FOUND
- 04-01-SUMMARY.md: FOUND
- Commit 792875f: FOUND
- Commit 8282dc9: FOUND

## Next Phase Readiness

- Phase 4 complete. User confirmed "cache hit (ETag)" log lines on second update cycle — NOAA SPC GeoJSON endpoints serve ETags and the ETag path is working.
- No display regressions observed. PERF-01 and PERF-02 verified in production.
- Ready for Phase 5: Code Quality (var → const/let, deduplication of Days 1-2 fetch logic, dead code removal).

---
*Phase: 04-performance*
*Completed: 2026-03-08*
