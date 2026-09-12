---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 01
subsystem: api
tags: [productRegistry, wssi, mpd, spc-md, arcgis, kml]

# Dependency graph
requires:
  - phase: 14-foundation-wpc-excessive-rainfall-outlook
    provides: PRODUCT_REGISTRY.excessiveRain row shape and buildArcGisQuery guard, mirrored verbatim for winterImpact
provides:
  - "kind discriminator on every PRODUCT_REGISTRY row (arcgis-day-layers | kml-advisory)"
  - "winterImpact row (WSSI Days 1-3) with case-insensitive impact resolution and MINOR-floor inclusion"
  - "spcMD and mpd kml-advisory rows with bare-hostname allowlists and pure toEntry() label builders"
  - "MPD_FILENAME_PATTERN anchored regex bounding remote directory-listing filenames"
affects: [15-02, 15-03, 15-04, 15-06]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "kind discriminator per registry row, read by downstream day-loop vs advisory-loop dispatch"
    - "kml-advisory rows are pure static config (no this, no network, no require); discovery/fetch stays in node_helper.js"
    - "toEntry(feature, ctx) pure function per advisory row returns {label, hazardType} or null"

key-files:
  created: []
  modified:
    - productRegistry.js

key-decisions:
  - "D-09 AMENDED implemented literally: includesFeat floor is val >= 2 (MINOR), WINTER WEATHER AREA (1) filtered at the same point a no-risk feature is; no LIMITED string anywhere in the file"
  - "WSSI-02 case fold happens once, inside winterImpact.toValue, before the wssiRawToValue lookup"
  - "spcMD retains a true-default posture for showSPCMD (documented in a row comment) as a deliberate CFG-01 exception since it migrates a shipping feature, not a new one"

patterns-established:
  - "Advisory rows (kml-advisory) declare allowedHost as a bare hostname (no scheme/path) so callers compare against a parsed URL.hostname rather than a prefix match"
  - "Palette provenance is cited on the row itself (paletteSource) rather than left implicit, closing the IN-01 gap for new palettes going forward"

requirements-completed: [WSSI-01, WSSI-02, MPD-01, MPD-02]

# Metrics
duration: ~15min
completed: 2026-08-24
---

# Phase 15 Plan 01: Widen PRODUCT_REGISTRY with kind discriminator and WSSI/advisory rows Summary

**`PRODUCT_REGISTRY` gained a `kind` discriminator plus three new rows — `winterImpact` (WSSI, `arcgis-day-layers`) and `spcMD`/`mpd` (`kml-advisory`) — with zero behavior change to the shipped `excessiveRain` row.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-24T01:38:00Z
- **Completed:** 2026-08-24T01:41:03Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Added `kind: "arcgis-day-layers"` to `excessiveRain` (additive-only, verified via `git diff` showing exactly one added line inside that row)
- Added `winterImpact` row: 1-based day→layer map, ALL-CAPS case-folding `toValue` (WSSI-02), `includesFeat` floor at MINOR excluding `WINTER WEATHER AREA` (D-09 AMENDED, no literal `"LIMITED"` anywhere), and a cited `paletteSource` (D-08)
- Added `spcMD` and `mpd` `kml-advisory` rows: bare-hostname `allowedHost`, named `discovery` strategy, pure `toEntry(feature, ctx)` returning `{ label, hazardType }` or `null`
- Added `MPD_FILENAME_PATTERN`, anchored to reject path traversal, absolute URLs, and alternate extensions
- Exported `MPD_FILENAME_PATTERN` alongside the existing `buildArcGisQuery` and `PRODUCT_REGISTRY`

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the kind discriminator and the winterImpact (WSSI) row** - `a51d4c6` (feat)
2. **Task 2: Add the spcMD and mpd kml-advisory rows** - `7d5cc81` (feat)

**Plan metadata:** (pending — final docs commit follows this summary)

## Files Created/Modified
- `productRegistry.js` - widened `PRODUCT_REGISTRY` with a `kind` discriminator on every row, plus `winterImpact`, `spcMD`, and `mpd` rows and the `MPD_FILENAME_PATTERN` constant

## Decisions Made
None beyond what the plan specified — followed plan as written, including the D-09 AMENDED floor and the CFG-01 exception documented for `showSPCMD`.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

None. The worktree's initial `HEAD` was found ahead of the wave's expected base commit (`ccdb325`) on this branch; corrected via the sanctioned startup `git reset --hard` to the expected base before any file was read or edited, per the `worktree_branch_check` protocol. No uncommitted work was present at that point (`git status --short` was empty), so nothing was at risk.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `productRegistry.js` now exposes four rows across two `kind`s; plan 15-02 (WSSI day-loop) and later plans (15-03 onward) can read `winterImpact`, `spcMD`, and `mpd` directly rather than deriving configuration ad hoc.
- All acceptance criteria verified by running the actual commands: both `node -e` assertion blocks exit 0 and print `OK`; `grep -c 'LIMITED' productRegistry.js` returns `0`; `node scripts/probe-payload-resilience.js` reports `15 passed, 0 failed` after both tasks; `git diff` confirms the `excessiveRain` row gained exactly the one `kind` line with no other member touched.
- No blockers for downstream plans in this phase.

## Self-Check: PASSED

- FOUND: productRegistry.js
- FOUND: .planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-01-SUMMARY.md
- FOUND commit: a51d4c6 (Task 1)
- FOUND commit: 7d5cc81 (Task 2)
- FOUND commit: c83cb94 (docs: summary)

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Completed: 2026-08-24*
