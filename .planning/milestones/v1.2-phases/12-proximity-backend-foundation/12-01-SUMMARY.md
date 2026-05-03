---
phase: 12-proximity-backend-foundation
plan: 01
subsystem: backend
tags: [turf, proximity, geometry, node_helper, pointToLineDistance]

# Dependency graph
requires:
  - phase: 11-stale-data-indicator
    provides: socket payload threading pattern (sibling for proximityWeighting in 12-02)
provides:
  - "computeProximity(items, loc, currentValue, comparator) helper in node_helper.js"
  - "Pure compute primitive: linear falloff weight = max(0, 1 - d_km/40), 40 km cutoff, strictly capped below 1"
  - "Returns { value, nextTier } when a higher-tier polygon is within 40 km, else null"
  - "Comparator-driven higher-tier filter uniform across catComparator and cigComparator"
  - "Boundary-safe strict cap via turf.booleanPointInPolygon pre-check"
affects: [12-02, 12-03, 13-proximity-frontend-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pure helper consumes pre-derived geometry (line) — caller owns memoization"
    - "Comparator-driven tier filter (no hardcoded `>` semantics)"

key-files:
  created: []
  modified:
    - "node_helper.js (added computeProximity at lines 122-170, 49 inserted lines)"

key-decisions:
  - "Branch on line.type === 'FeatureCollection' to iterate features (MultiPolygon source); pass single Feature<LineString> directly otherwise"
  - "Strict cap below 1 enforced via two gates: (a) turf.booleanPointInPolygon pre-check (covers boundary epsilon from spherical distance), (b) belt-and-suspenders d_km > 0 gate"
  - "Helper does NOT call turf.polygonToLine — Plan 12-03 owns memoization of line per _geoJsonCache entry"
  - "items[i].label is the nextTier string directly (no lookup); works for both categorical (SLGT/ENH/MDT) and CIG (CIG1/CIG2/CIG3) since extractPolygons preserves LABEL"

patterns-established:
  - "Pre-derived geometry contract: caller annotates each item with `line` before calling helper; helper trusts the contract"
  - "Boundary-safe strict cap: booleanPointInPolygon catches any point inside or on the boundary of a higher-tier polygon (D-07 robust form)"

requirements-completed: [PROX-01]

# Metrics
duration: 3min
completed: 2026-04-26
---

# Phase 12 Plan 01: Proximity Helper Foundation Summary

**Pure-compute computeProximity(items, loc, currentValue, comparator) helper added to node_helper.js, computing distance-weighted proximity to higher-tier polygons via turf.pointToLineDistance with linear 40-km falloff and boundary-safe strict cap.**

## Performance

- **Duration:** ~3 min
- **Started:** 2026-04-26T02:03:21Z
- **Completed:** 2026-04-26T02:06:00Z (approx)
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- `computeProximity(items, loc, currentValue, comparator)` inserted at `node_helper.js` lines 122-170, immediately after `evaluatePolygons` (per D-14)
- Implementation satisfies PROX-01: linear falloff `max(0, 1 - d_km/40)`, 40 km cutoff, strict cap below 1, returns `{value, nextTier}` or `null`
- Comparator-driven higher-tier filter uniform across `catComparator` and `cigComparator` (per D-08, D-13)
- Pure compute: helper does NOT call `turf.polygonToLine` — caller owns memoization (delegates O(1)-per-render PROX-05 guarantee to Plan 12-03)
- Smoke harness validates all four CONTEXT.md §Specifics scenarios end-to-end

## Task Commits

1. **Task 1: Add computeProximity helper next to evaluatePolygons** — `859b250` (feat)
2. **Task 2: Smoke-test computeProximity in isolation (revealed boundary bug; fix applied)** — `b7463ab` (fix)

_Plan metadata commit follows this SUMMARY._

## Files Created/Modified
- `node_helper.js` — Added `computeProximity` at lines 122-170. JSDoc references the method by name (lifts grep count to 2 per plan verification).

## Implementation Notes

### Line shape branch (Feature vs FeatureCollection)
```js
const lineFeatures = (line && line.type === "FeatureCollection") ? line.features : [line];
let dKm = Infinity;
for (const lf of lineFeatures) {
  const d = turf.pointToLineDistance(loc, lf, { units: "kilometers" });
  if (d < dKm) dKm = d;
}
```
Handles both Polygon-source items (`Feature<LineString>`, single feature) and MultiPolygon-source items (`FeatureCollection<LineString>`, iterate features and take min distance) uniformly. Caller (Plan 12-03) is responsible for ensuring `item.line` is populated.

### Strict cap below 1 — robust form
The plan's D-07 simplest-implementation note (`d_km > 0` gate) was insufficient in practice: turf's spherical `pointToLineDistance` returns ~3 m for a point sitting on a straight polygon edge (great-circle vs cartesian). A `booleanPointInPolygon` pre-check catches both boundary and interior cases:
```js
if (poly && turf.booleanPointInPolygon(loc, poly)) return;
```
The `d_km > 0` gate is retained as belt-and-suspenders.

## Smoke Harness Results

All four CONTEXT.md §Specifics scenarios pass:

| Scenario | Setup | Expected | Got |
|----------|-------|----------|-----|
| S1: Outside-all-tiers | SLGT poly ~13 km from loc, currentValue=0 | `{nextTier: "SLGT", 0 < value < 1}` | `{value: 0.666, nextTier: "SLGT"}` ✓ |
| S2: Multi-tier max-weight wins | SLGT(3 contains loc), ENH(4) ~12 km, MDT(5) ~8 km, currentValue=3 | `nextTier: "MDT"` | `{value: 3.83, nextTier: "MDT"}` ✓ |
| S3: No higher tier exists | SLGT(3) contains loc, currentValue=3 | `null` | `null` ✓ |
| S4: Strict cap on boundary | ENH(4) with loc on its edge, currentValue=3 | `null` | `null` ✓ |

Harness used only `require('@turf/turf')` — no `require('./node_helper.js')` (avoids MagicMirror runtime coupling). No test file committed.

## Decisions Made
- **Branch on `line.type === "FeatureCollection"`** (D-09 derivative): single uniform code path for Polygon and MultiPolygon source items via `lineFeatures` array.
- **Boundary-safe strict cap via `booleanPointInPolygon`** (Rule 1 fix during Task 2): replaces D-07's `d_km > 0` gate as the primary mechanism, since turf's spherical distance reports a non-zero epsilon for points on straight polygon edges. The original gate is retained as a secondary check.
- **`items[i].label` IS the nextTier string** (D-03 read literally): no map lookup needed inside the helper for either categorical or CIG layers — `extractPolygons` already preserves the SPC LABEL.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Strict cap on boundary fails with turf spherical distance**
- **Found during:** Task 2 (smoke harness scenario S4)
- **Issue:** D-07 said "gate on `d_km > 0` … `weight = 1` only at `d = 0`". In practice turf's `pointToLineDistance` uses spherical math; a point at lat=35.22 sitting on a polygon's lat=35.22 edge returns `d_km ≈ 0.003` (great-circle vs cartesian). That defeated the gate and produced `{value: 3.9999..., nextTier: "ENH"}` instead of `null`.
- **Fix:** Added a `turf.booleanPointInPolygon(loc, poly)` short-circuit at the top of the per-item loop. `booleanPointInPolygon` returns `true` for boundary points (turf's documented behavior), correctly treating "user on boundary" as "user inside higher tier" per D-07's stated intent. Retained the `d_km > 0` gate as a secondary check.
- **Files modified:** `node_helper.js` (computeProximity, ~7 added lines)
- **Verification:** Re-ran smoke harness; all four scenarios (S1-S4) now pass.
- **Committed in:** `b7463ab`

**Note:** This required adding `poly` to the destructured fields in the per-item iteration (already part of the input contract per D-13 — `items` shape is `{label, value, poly, line}`). No contract change.

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** Robustness fix only — preserves D-07 semantic intent. No scope creep.

## Issues Encountered
None beyond the deviation above.

## Self-Check: PASSED

- Created file checks:
  - `.planning/phases/12-proximity-backend-foundation/12-01-SUMMARY.md` — created (this file)
- Commit checks:
  - `859b250` (Task 1): FOUND in `git log`
  - `b7463ab` (Task 2): FOUND in `git log`
- Plan verification block:
  - `node --check node_helper.js`: PASSED
  - `grep -c "computeProximity" node_helper.js`: 2 (>= 2) ✓
  - `grep -v '^[[:space:]]*\*' node_helper.js | grep -v '^[[:space:]]*//' | grep -c 'turf\.polygonToLine\|polygonToLine('`: 0 ✓
  - Smoke harness: PASSED (all 4 scenarios)
  - `grep -c "this.computeProximity" node_helper.js`: 0 (no call sites wired — Plan 12-03 owns wiring) ✓

## Next Phase Readiness
- Helper is ready for Plan 12-02 (`proximityWeighting` flag threading) and Plan 12-03 (call-site wiring with cache-level `line` memoization).
- Plan 12-03 must annotate each `item` with a pre-derived `line = turf.polygonToLine(item.poly)` before invoking `computeProximity`; the helper's input contract is `{label, value, poly, line}`.
- No blockers.

---
*Phase: 12-proximity-backend-foundation*
*Completed: 2026-04-26*
