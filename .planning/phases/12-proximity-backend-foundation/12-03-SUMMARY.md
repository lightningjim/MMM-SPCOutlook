---
phase: 12-proximity-backend-foundation
plan: 03
subsystem: backend
tags: [turf, proximity, cache-memoization, node_helper, payload-assembly]

# Dependency graph
requires:
  - phase: 12-proximity-backend-foundation/12-01
    provides: computeProximity helper with pre-derived line contract
  - phase: 12-proximity-backend-foundation/12-02
    provides: this._proximityWeighting flag (strict-true coerced)
provides:
  - "Day 1/2/3 categorical proximity emission via computeProximity"
  - "Per-hazard CIG proximity (Day 1/2 tor/hail/wind via fetchAndEvaluateHazard, Day 3 cig standalone)"
  - "_geoJsonCache extended with polys + lines fields (only when proximityWeighting is true)"
  - "deriveLinesIfMissing helper for lazy false->true line fill"
  - "buildProximitySubtree helper at top of getSpcOutlook; null-omission discipline (D-04)"
  - "dayN.proximity emission in both !extended and extended return branches (3 days x 2 branches = 6 spreads)"
  - "Default-off byte-identity invariant: payload shape unchanged when proximityWeighting is false"
affects: [13-proximity-frontend-render]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Cache-level memoization with eager+lazy fill: polys written at fetch-miss when flag is on; lines either eagerly derived at miss OR lazily on first hit via deriveLinesIfMissing (PROX-05 O(1) per-render after warmup)"
    - "Conditional spread (...(flag ? {polys, lines} : {})) for additive cache field extension preserves default-off byte-identity"
    - "Null-omission via buildProximitySubtree spread: empty {} when all hazards null collapses to no-op spread; { proximity: {...} } when at least one resolves"
    - "Top-of-function helper placement so closures over getSpcOutlook locals are visible to both return branches (W7)"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "Local-name parity strategy (a) — RENAME chosen: Day 2/3's local poly renamed to dayNRiskPoly to match Day 1 day1RiskPoly. Uniform pattern across all three days; cache-spread field is always polys: dayNRiskPoly."
  - "polys + lines as the cache field names (per CONTEXT.md §Claude's Discretion). Brief, parallel to existing result. Both fields written together at fetch-miss when flag is on; lines is filled lazily by deriveLinesIfMissing on first cache-hit otherwise."
  - "deriveLinesIfMissing returns the cache entry's annotated items array (each {label, value, poly, line}) — matches Plan 12-01's input contract exactly. Helper writes back to entry.lines so subsequent hits are O(1)."
  - "buildProximitySubtree placed at top of getSpcOutlook (line 485, after const loc at 480, before let anyStale at 494). This places the closure inside getSpcOutlook's scope but above the conditional !extended branch, so both return branches at lines 847+ and 1031+ can use it (W7 fix)."
  - "Per-hazard alias naming follows the stated convention dayN<Hazard>CigProximity (day1TorCigProximity, day1HailCigProximity, day1WindCigProximity, day2TorCigProximity, day2HailCigProximity, day2WindCigProximity). Day 3 CIG uses day3CigProximity (no hazard distinction since Day 3 has a single CIG layer)."
  - "Third arm of categorical fetch (network fail + no cache, dayNRiskResult = 0) leaves dayNCatProximity null — the polys aren't available, and currentValue === 0 with no fresh data has nothing to compute against. Plan-specified behavior."

patterns-established:
  - "Cache-level memoization split (eager-on-miss + lazy-on-toggle) — reusable for any future per-render geometry derivation"
  - "Strict default-off byte-identity via conditional spread + null-omission helper — reusable pattern for additive payload extension behind feature flags"

requirements-completed: [PROX-03, PROX-04, PROX-05, PROX-06]

# Metrics
duration: 4m
completed: 2026-04-26
---

# Phase 12 Plan 03: Proximity Call-Site Wiring + Subtree Emission Summary

**dayN.proximity subtree emitted on Days 1-3 categorical and per-hazard CIG paths when proximityWeighting is true; default-off remains byte-identical via conditional cache fields and null-omission spread; per-render turf cost amortized to O(1) via deriveLinesIfMissing memoization.**

## Performance

- **Duration:** ~4 min (start 2026-04-26T02:13:19Z → end 2026-04-26T02:17:33Z, 254 s)
- **Tasks:** 3
- **Files modified:** 1 (node_helper.js, +206 lines net across three commits)

## Accomplishments

- `deriveLinesIfMissing` helper added next to `computeProximity` (defined at line 178-190).
- Day 1 categorical block (lines 446-486 in final): cache-miss eagerly derives `day1RiskLines`, computes `day1CatProximity`, writes `polys: day1RiskPoly, lines: day1RiskLines` to cache (when flag on). Cache-hit branch reuses `entry.lines` via `deriveLinesIfMissing`.
- Day 2 categorical block (lines 504-544 in final): same shape; renamed local `poly` → `day2RiskPoly` for uniformity.
- Day 3 categorical block (lines 562-604 in final): same shape; renamed local `poly` → `day3RiskPoly`.
- `fetchAndEvaluateHazard` (lines 307-380 in final): return signature extended to `{ risk, cig, stale, cigProximity }`; CIG miss-branch eagerly derives lines, hit-branch lazily fills via `deriveLinesIfMissing`.
- All 6 destructure call sites updated with per-hazard alias `dayN<Hazard>CigProximity`.
- Day 3 CIG standalone block (lines 633-672 in final): inline mirror of categorical pattern with `day3CigProximity` local; both miss and hit branches.
- `buildProximitySubtree` helper at top of `getSpcOutlook` (line 485): closure-scoped above both return branches (W7 placement satisfied).
- `!extended` return branch (lines 847+ in final) carries 3 spread invocations (Days 1, 2, 3).
- `extended` return branch (lines 1031+ in final) carries 3 spread invocations (Days 1, 2, 3).

## Task Commits

1. **Task 1: Wire computeProximity into Day 1/2/3 categorical blocks + extend _geoJsonCache** — `33c0ae5` (feat)
2. **Task 2: Extend fetchAndEvaluateHazard with cigProximity + wire Day 3 CIG standalone** — `d5a3a59` (feat)
3. **Task 3: Assemble dayN.proximity subtree via buildProximitySubtree in both return branches** — `10fb51e` (feat)

_Plan metadata commit follows this SUMMARY._

## Files Created/Modified

- `node_helper.js` — modifications across:
  - **Helper additions:** `deriveLinesIfMissing` at lines 178-190 (next to `computeProximity`); `buildProximitySubtree` at lines 485-493 (top of `getSpcOutlook`).
  - **Day 1 cat fetch block:** lines 446-486 (was 446-463 pre-plan; +24 lines).
  - **Day 1 hazard destructures (Tor/Hail/Wind):** lines 488-499 (3 sites; per-hazard `cigProximity` aliases added).
  - **Day 2 cat fetch block:** lines 504-544 (was 488-502 pre-plan; +25 lines + rename).
  - **Day 2 hazard destructures (Tor/Hail/Wind):** lines 546-557 (3 sites).
  - **Day 3 cat fetch block:** lines 562-604 (was 524-540 pre-plan; +25 lines + rename).
  - **Day 3 CIG standalone block:** lines 633-672 (was 558-569 pre-plan; +27 lines).
  - **`fetchAndEvaluateHazard`:** lines 307-380 (was 307-356 pre-plan; +24 lines).
  - **`!extended` return branch:** lines 847-879 (was 681-714 pre-plan; +18 lines).
  - **`extended` return branch:** lines 1031-1063 (was 849-882 pre-plan; +18 lines).

## Implementation Notes

### Local-name parity strategy chosen: RENAME (a)

Day 2 and Day 3 categorical blocks each declared a local `poly` (different identifier than Day 1's `day1RiskPoly`). The plan offered two strategies; I chose (a) RENAME for uniformity. Day 2's local is now `day2RiskPoly`; Day 3's is `day3RiskPoly`. Result: every cache-miss block now writes `polys: day{N}RiskPoly, lines: day{N}RiskLines` consistently, no per-block special-casing.

### Why deriveLinesIfMissing returns the annotated items array (not a bare LineString array)

`computeProximity` (Plan 12-01) takes `items` of shape `{label, value, poly, line}`. The plan's helper specification matches this — `entry.lines` IS the annotated items array, not a bare LineString collection. Each cache-hit branch passes this array directly to `computeProximity`. This avoids re-walking polys at hit-time and keeps the helper's input contract uniform between miss and hit paths.

### Default-off byte-identity verification

Sanity-checked the helper logic in isolation:

```
default-off (all-null inputs):  buildProximitySubtree(...) === {}
day1 spread: { ...everything-as-before, ...{} } -> no `proximity` key
'proximity' in day1: false ✓
```

Confirmed: when `this._proximityWeighting` is false, every per-hazard proximity local stays `null`, the helper returns `{}`, and the spread is a no-op. Payload shape remains byte-identical to pre-Phase-12.

### PROX-05 O(1) memoization

Per-render `turf.polygonToLine` cost amortizes to O(1) once cache is warm:
- **First fetch (miss) with flag on:** `polygonToLine` runs once per polygon, output stored on `entry.lines`.
- **First cache-hit after `false → true` toggle:** `deriveLinesIfMissing` runs `polygonToLine` once per polygon, writes back to `entry.lines`.
- **All subsequent cache-hits:** `entry.lines` already populated; `deriveLinesIfMissing` returns it directly. No `polygonToLine` calls.

### Manual default-off check (pending live runtime verification)

Per plan §Verification: when `proximityWeighting` is unset/false, runtime check should confirm `payload.day1.proximity === undefined`. The helper-level isolation check above proves this by inspection (all-null inputs produce empty spread). Live MagicMirror runtime verification is deferred to v1.2 milestone smoke test (no test infrastructure in this repo).

### Manual on-check (pending live runtime verification)

When `proximityWeighting: true`, expected: `payload.day1` contains a `proximity` key with `categorical` (when polys are within 40 km of loc) plus any present CIG entries. Code path is correct by inspection: `computeProximity` returns `{value, nextTier}` or `null`; non-null values are kept by `buildProximitySubtree`, `null` values are dropped.

### Manual O(1) cache-hit check (pending live runtime verification)

`deriveLinesIfMissing` returns `entry.lines` immediately on the second call (the early-return branch `if (entry.lines) return entry.lines;`). Verifiable by adding a temporary `Log.info('lines fresh-derive')` inside the `else` branch — would fire only on first cache-hit after a `false → true` toggle.

## Decisions Made

See `key-decisions` in frontmatter:

1. **Rename strategy (a)** for local name parity across Day 1/2/3 blocks.
2. **`polys` + `lines`** as cache field names.
3. **`deriveLinesIfMissing` returns annotated items array** (matches `computeProximity` contract).
4. **Top-of-`getSpcOutlook` placement** for `buildProximitySubtree` (closure visible to both return branches per W7).
5. **Per-hazard alias naming** `dayN<Hazard>CigProximity` (Day 1/2 Tor/Hail/Wind) + `day3CigProximity` (Day 3 single CIG).

## Deviations from Plan

None — plan executed exactly as written. All grep verifications passed first try; `node --check` passed after each task. No bugs, no missing critical functionality, no blocking issues, no architectural surprises.

The plan's W3/W5/W6/W7 hazards were all addressed prophylactically by the plan's own structure:
- **W3 (local-name parity):** plan offered two strategies; I picked (a) and applied uniformly.
- **W5 (all 6 destructures must update together):** all 6 explicitly updated; per-alias acceptance check confirmed.
- **W6 (regex tolerance for return punctuation):** verification used structural greps, not punctuation-fragile patterns.
- **W7 (helper placement):** placed at top of `getSpcOutlook` (line 485), confirmed visible to both return branches via `grep -n` ordering.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration. Live runtime verification (default-off invariance, on-check, O(1) cache-hit) deferred to v1.2 milestone smoke test.

## Next Phase Readiness

Phase 12 complete (3 of 3 plans done). Ready for Phase 13 (proximity-frontend-render):

- Backend payload now carries `dayN.proximity` subtree on Days 1-3 with shape `{ categorical?, torCig?, hailCig?, windCig?, cig? }`, each entry `{ value: number, nextTier: string }`. Frontend renderer can consume directly per Phase 13 PROXUI-* requirements.
- Default-off invariance preserved — Phase 13 frontend code can guard on `'proximity' in dayN` (truthy iff feature is on AND at least one hazard resolved).
- No blockers.

## Self-Check: PASSED

- File checks:
  - `.planning/phases/12-proximity-backend-foundation/12-03-SUMMARY.md` — created (this file).
- Commit checks:
  - `33c0ae5` (Task 1): FOUND in `git log`.
  - `d5a3a59` (Task 2): FOUND in `git log`.
  - `10fb51e` (Task 3): FOUND in `git log`.
- Plan verification block (all thresholds met):
  - `node --check node_helper.js`: PASSED.
  - `grep -c "computeProximity" node_helper.js`: 13 (>=10) ✓
  - `grep -c "this._proximityWeighting" node_helper.js`: 17 (>=11) ✓
  - `grep -c "polys:" node_helper.js`: 5 (>=5) ✓
  - `grep -c "lines:" node_helper.js`: 5 (>=5) ✓
  - `grep -c "deriveLinesIfMissing" node_helper.js`: 6 (>=6) ✓
  - `grep -c "...buildProximitySubtree" node_helper.js`: 6 (>=6) ✓
- Per-task acceptance:
  - Task 1: `day1CatProximity`=3, `day2CatProximity`=3, `day3CatProximity`=3, polys-spread=3 ✓
  - Task 2: `day1TorCigProximity`=1, `day1HailCigProximity`=1, `day1WindCigProximity`=1, `day2TorCigProximity`=1, `day2HailCigProximity`=1, `day2WindCigProximity`=1, `day3CigProximity`=3 ✓; `return { risk, cig, stale, cigProximity }` present ✓
  - Task 3: `buildProximitySubtree` definition=1, spread invocations=6, placement order (loc→helper→anyStale) correct ✓
- Default-off byte-identity (helper isolation check): empty-input → `{}` → spread no-op → no `proximity` key ✓

---
*Phase: 12-proximity-backend-foundation*
*Plan: 03*
*Completed: 2026-04-26*
