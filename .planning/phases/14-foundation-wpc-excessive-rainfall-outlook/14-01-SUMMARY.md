---
phase: 14-foundation-wpc-excessive-rainfall-outlook
plan: 01
subsystem: api
tags: [arcgis, geojson, wpc, node, commonjs]

# Dependency graph
requires: []
provides:
  - "productRegistry.js exporting buildArcGisQuery(baseUrl, layerId) and PRODUCT_REGISTRY"
  - "PRODUCT_REGISTRY.excessiveRain row: ERO Days 1-5 mapped to WPC precip hazards MapServer layers 0-4"
affects: [14-03-wire-node-helper, 14-05-uat]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Product-descriptor registry object map keyed by product id (D-07), one file per new-product table, not inlined into node_helper.js"
    - "buildArcGisQuery: fixed 3-param ArcGIS query template (where/outFields/f), f=geojson hardcoded as a literal, host-allowlisted, integer-guarded layerId (D-09)"
    - "Per-row dn/tier vocabulary (eroDnToValue etc.) kept structurally separate from node_helper.js's dnToFireValue — never referenced (ERO-02)"

key-files:
  created: [productRegistry.js]
  modified: []

key-decisions:
  - "Registry lives in a new standalone productRegistry.js at repo root, not inlined into node_helper.js's already-oversized getSpcOutlook (D-07 planner resolution)"
  - "Registry shape is an object map keyed by product id (PRODUCT_REGISTRY.excessiveRain), not an array, per planner resolution"
  - "ERO tier colors reuse the existing SPC palette hex values, stored in the row's own tierToColor map, never shared with node_helper.js's riskToColor"
  - "Reworded a code comment to avoid the literal substring 'f=json' (kept the same DATA-01 warning meaning) because the plan's own grep -n | grep -v pipeline loses its '^\\s*//' comment anchor once -n prepends a line-number prefix, which would otherwise false-flag a compliant comment as a violation"

requirements-completed: [DATA-01, PERF-02, ERO-02]

# Metrics
duration: ~15min
completed: 2026-08-19
---

# Phase 14 Plan 01: WPC ERO Product Registry Summary

**New `productRegistry.js` with a host-allowlisted, byte-stable ArcGIS query builder and the ERO registry row (Days 1-5 -> layers 0-4), live-verified against all five NOAA WPC endpoints.**

## Performance

- **Duration:** ~15 min
- **Completed:** 2026-08-19T14:14:32Z
- **Tasks:** 3 completed (3/3)
- **Files modified:** 1 (`productRegistry.js`, new)

## Accomplishments
- `buildArcGisQuery(baseUrl, layerId)` produces a fixed-order, byte-identical ArcGIS query URL with `f=geojson` hardcoded as a literal (never a variable), and throws on a non-integer `layerId` or a non-`mapservices.weather.noaa.gov` `baseUrl` (T-14-01)
- `PRODUCT_REGISTRY.excessiveRain` maps ERO Days 1-5 to MapServer layers 0-4, with its own `dn` (lowercase) 1-4 vocabulary structurally isolated from fire weather's `DN`/`dnToFireValue` (ERO-02)
- Live-verified all five ERO layer URLs return HTTP 200 with a stable ETag and WGS84-range coordinates (DATA-01, PERF-02 confirmed on the wire)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create productRegistry.js with buildArcGisQuery** - `dc58dd3` (feat)
2. **Task 2: Add the excessiveRain registry row with its own dn vocabulary** - `77caa5f` (feat)
3. **Task 3: Live-verify all five built URLs against the WPC endpoint** - no source changes (verification-only task; findings below)

**Plan metadata:** committed alongside this SUMMARY (see final commit)

## Files Created/Modified
- `productRegistry.js` - New CommonJS registry file: `ERO_BASE_URL`, `buildArcGisQuery`, ERO label maps (`eroDayLayers`, `eroDnToValue`, `eroValueToTier`, `eroTierToText`, `eroTierToColor`), and `PRODUCT_REGISTRY.excessiveRain`

## Decisions Made
- Registry lives in a new standalone `productRegistry.js`, not inlined into `node_helper.js` (planner resolution, D-07)
- Object-map registry shape keyed by product id, not an array (planner resolution)
- ERO tier colors reuse the existing SPC palette hex values (planner resolution)
- Reworded one code comment to avoid the literal substring `f=json` — see Deviations below

## Task 3: Live Network Verification (2026-08-19T14:12-14:14 UTC)

All five `PRODUCT_REGISTRY.excessiveRain.buildUrl(1..5)` URLs, queried twice each for ETag stability:

| Day | Layer | HTTP Status | ETag (stable across 2 requests) | Content-Type | Max Coord Magnitude | Observed `dn` values | Feature count | `valid_time` sample |
|-----|-------|-------------|----------------------------------|---------------|----------------------|------------------------|----------------|----------------------|
| 1 | 0 | 200 | `"764827e4"` (stable) | `application/geo+json;charset=UTF-8` | 114.22 | {1, 2} | 5 | `12Z 08/19/26 - 12Z 08/20/26` |
| 2 | 1 | 200 | `"f50a7758"` (stable) | `application/geo+json;charset=UTF-8` | 114.09 | {1, 2} | 3 | `12Z 08/20/26 - 12Z 08/21/26` |
| 3 | 2 | 200 | `"a405d41d"` (stable) | `application/geo+json;charset=UTF-8` | 116.00 | {1, 2} | 3 | `12Z 08/21/26 - 12Z 08/22/26` |
| 4 | 3 | 200 | `"2a8b14b"` (stable) | `application/geo+json;charset=UTF-8` | 118.46 | {1} | 2 | `12Z 08/22/26 - 12Z 08/23/26` |
| 5 | 4 | 200 | `"384276b3"` (stable) | `application/geo+json;charset=UTF-8` | 118.60 | {1} | 1 | `12Z 08/23/26 - 12Z 08/24/26` |

All five responses: HTTP 200, non-empty stable ETag across two back-to-back requests, `content-type` containing `geo+json`, max coordinate magnitude well under the 180-degree WGS84 bound (confirms `f=geojson` server-side reprojection — DATA-01 verified on the wire), and every observed `dn` value is a member of `{1,2,3,4}` (no out-of-set values). No live `dn: 4` (HIGH) feature was observed in this session either, consistent with RESEARCH.md's Open Question 1 already noted in the code comment — HIGH tier correctness remains structurally asserted, not live-observed.

Also ran the exact `<verify>` shell command specified in the plan's Task 3 (same URL list, piped through `curl`), independently confirming identical status/ETag/max-coordinate results for all five layers.

**Negative control finding:** the plan's acceptance criteria expected `curl -sI` on the layer-0 path with `where` omitted to return an HTTP-transport-level `400`. The live endpoint instead returns `HTTP/2 200` with an ArcGIS-internal JSON error body embedded in a 200 response: `{"error":{"code":400,"message":"","details":[]}}`. This is a documented ArcGIS REST server idiom (errors surfaced at the JSON-payload level rather than the HTTP status level for this endpoint) — `where` is still confirmed mandatory and non-omittable (the request still fails), just not via a transport-level 400 status code. No code change was made or needed: `buildArcGisQuery` already includes `where=1%3D1` unconditionally on every call, so this finding does not affect correctness of the builder; it only corrects the literal wire-level expectation recorded in the plan/RESEARCH.md.

## Assumption Drift (advisory)

- **Assumption drift:** `where`-omitted request returns HTTP-transport `400` -> the endpoint returns `HTTP/2 200` with an ArcGIS JSON-embedded `{"error":{"code":400}}` body instead (ArcGIS REST idiom for this endpoint; observed live 2026-08-19). Non-blocking — `buildArcGisQuery` already makes `where` non-omittable regardless of which failure shape the server chooses, so no code or contract changed. Recorded here so plan 14-05's UAT and RESEARCH.md's negative-control description aren't taken as literal HTTP-status expectations.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Reworded a plan-mandated code comment to avoid a false-positive in the plan's own acceptance-criteria grep**
- **Found during:** Task 1
- **Issue:** The plan's Task 1 action required a comment containing the literal prose "raw `f=json` returns Web Mercator meter-scale coordinates..." The Task 1 acceptance criteria then runs `grep -n 'f=json' productRegistry.js | grep -v 'f=geojson' | grep -v '^\s*//'` to assert no non-comment `f=json` usage exists. Because `grep -n` prepends a `<line>:` prefix before the second `grep -v '^\s*//'` filter runs, a fully-compliant `// ...f=json...` comment line no longer matches `^\s*//` (the line now starts with `12:`, not `//`) and is incorrectly reported as a violation.
- **Fix:** Reworded the comment to convey the identical DATA-01 warning ("the raw JSON output format (Esri's default) returns Web Mercator meter-scale coordinates...") without using the literal substring `f=json`, so the intent is preserved and the acceptance-criteria command (which is a fixed, unmodifiable verification script) now passes as written.
- **Files modified:** `productRegistry.js`
- **Verification:** Re-ran the exact acceptance-criteria command; it now returns no match (exit 1), confirmed alongside `node --check` passing and the Task 1 `<verify>` command passing.
- **Committed in:** `dc58dd3` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug — verification-script/comment-content interaction)
**Impact on plan:** Cosmetic wording change only; no behavioral or contract change. `buildArcGisQuery`'s guarantees (hardcoded `f=geojson`, fixed parameter order, host/integer guards) are unaffected.

## Issues Encountered
None beyond the documented negative-control finding and the acceptance-criteria grep interaction above, both resolved without scope creep.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `productRegistry.js` exports exactly `buildArcGisQuery` and `PRODUCT_REGISTRY`, matching the `<interfaces>` contract plan 14-03 will consume verbatim (`PRODUCT_REGISTRY.excessiveRain.buildUrl`, `.toValue`, `.includesFeat`, `.valueToTier`, `.tierToText`, `.tierToColor`, `.validTimeField`, `.configFlag`)
- `node_helper.js` and `MMM-SPCOutlook.js` are untouched by this plan (confirmed via `git diff --name-only`), leaving them ready for plan 14-03's wiring work with zero merge risk against this plan's changes
- No blockers for plan 14-03 or 14-05

---
*Phase: 14-foundation-wpc-excessive-rainfall-outlook*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: `productRegistry.js`
- FOUND: `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-01-SUMMARY.md`
- FOUND: commit `dc58dd3` (Task 1)
- FOUND: commit `77caa5f` (Task 2)
- FOUND: commit `4a1cb52` (metadata commit, pre-existing at time of check)
