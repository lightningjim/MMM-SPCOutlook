---
gsd_state_version: 1.0
milestone: v1.2
milestone_name: QoL Enhancements
status: executing
stopped_at: Phase 13 context gathered
last_updated: "2026-05-02T23:33:01.924Z"
last_activity: 2026-05-02 -- Phase 13 planning complete
progress:
  total_phases: 3
  completed_phases: 2
  total_plans: 8
  completed_plans: 5
  percent: 63
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-04-25)

**Core value:** Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.
**Current focus:** Phase 13 — proximity-frontend-render

## Current Position

Phase: 13
Plan: Not started
Status: Ready to execute
Last activity: 2026-05-02 -- Phase 13 planning complete

## Performance Metrics

**Velocity (v1.0 + v1.1 baseline):**

- Total plans completed: 19
- v1.0: 7 phases, 13 plans
- v1.1: 3 phases, 3 plans

**v1.2 plan metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| 11-01 | 5min | 1 | 1 |
| 11-02 | 2min | 2 | 1 |
| 12-01 | 3min | 2 | 1 |
| 12-02 | 1min | 2 | 2 |
| Phase 12 P03 | 4min | 3 tasks | 1 files |

## Accumulated Context

### Decisions (archived to PROJECT.md Key Decisions)

See `.planning/PROJECT.md` — all key decisions from v1.0 and v1.1 recorded there.

**v1.2 roadmap decisions:**

| Decision | Rationale |
|----------|-----------|
| Stale phase first (Phase 11) | Independent of proximity; fixes latent `_isWithinStaleWindow` bug; ships value standalone |
| Proximity backend before frontend (Phase 12 → 13) | Frontend has nothing to render until payload shape is emitted |
| CIG folded into Phase 13 (not split) | Same render primitive as categorical; splitting doubles ceremony with no risk reduction |
| Linear falloff, 40 km cutoff | Matches SPC's documented neighborhood radius for probabilistic→categorical conversion |

**v1.2 execution decisions:**

| Decision | Plan | Rationale |
|----------|------|-----------|
| Threaded `updateInterval` via `GET_SPC_DATA` payload + persisted on `this._updateInterval` | 11-01 | Backend has no `this.config`; threading via payload is the minimal correct fix (D-01..D-03) |
| One-shot fallback log via `_loggedIntervalFallback` flag | 11-01 | Avoids log flooding when a misconfigured caller repeatedly omits the field (T-11-02 mitigation) |
| Added `updateInterval` to both `GET_SPC_DATA` payload literals (start + setInterval) | 11-02 | Cross-file invariant with 11-01; both sites must change together to close the contract |
| Stale indicator via inline `<span style="color:#FFCC00">⚠ Stale — <fromNow></span>` in data-bearing else-branch | 11-02 | Matches existing colored-span pattern; no CSS file added (D-08); placement satisfies ROADMAP success criterion 4 |
| `isFinite(asOf)` guard + negative-delta short-circuit to "just now" | 11-02 | D-11 + D-12: defensive against invalid timestamps and clock skew |
| `computeProximity` consumes pre-derived `item.line`; no `turf.polygonToLine` inside helper | 12-01 | Keeps helper pure compute; PROX-05 O(1)-per-render delegated to Plan 12-03's cache-level memoization |
| Boundary-safe strict cap via `turf.booleanPointInPolygon` pre-check (over D-07's `d_km > 0` gate alone) | 12-01 | turf spherical `pointToLineDistance` returns ~3m epsilon for points on straight polygon edges; pre-check catches boundary AND interior cases robustly |
| Comparator-driven higher-tier filter (`comparator.comparator(currentValue, value) === currentValue` skip) | 12-01 | D-08 / D-13: uniform helper across `catComparator` and `cigComparator`; no hardcoded `>` |
| Strict-true coerce (`=== true`) for `proximityWeighting` at destructure boundary | 12-02 | D-11; mitigates T-12-03 type-confusion tampering — only literal `true` enables proximity, all other values (undefined/null/0/'true'/{}) resolve to `false` |
| No `_loggedProximityFallback` log on missing `proximityWeighting` | 12-02 | D-14 §Claude's Discretion; default-off is the legitimate state, logging on every cold-start tick would flood the journal |
| Both `GET_SPC_DATA` payload literals (start + setInterval) updated together for `proximityWeighting` | 12-02 | Cross-file invariant mirrored from 11-02; never one without the other |
| Cache-level memoization split (eager-on-miss + lazy-on-toggle via `deriveLinesIfMissing`) | 12-03 | PROX-05 amortized O(1)-per-render: `lines` either eagerly derived at fetch-miss when flag is on, or lazily filled on first cache-hit and written back to entry; subsequent hits are O(1) |
| `polys` + `lines` as `_geoJsonCache` field names (additive, only written when flag is true) | 12-03 | Conditional spread `...(this._proximityWeighting ? { polys, lines } : {})` preserves default-off byte-identity; field names parallel existing `result` |
| `buildProximitySubtree` placed at top of `getSpcOutlook` (after `const loc`, before `let anyStale`) | 12-03 | W7: closure must be visible to BOTH `!extended` and `extended` return branches; placing inside `if (!extended)` would scope it incorrectly |
| Local-name parity rename strategy (a) for Day 2/3 cat blocks: `poly` → `dayNRiskPoly` | 12-03 | Uniform pattern across all three days; cache-spread reads `polys: dayNRiskPoly` consistently |
| Default-off byte-identity via null-omission: `buildProximitySubtree({all-null})` returns `{}` (no-op spread) | 12-03 | When `proximityWeighting` is false, every per-hazard local stays null, helper produces `{}`, payload shape byte-identical to pre-Phase-12 |

### Pending Todos

None.

### Blockers/Concerns

None.

## Session Continuity

Last session: 2026-05-02T22:37:29.658Z
Stopped at: Phase 13 context gathered
Resume file: .planning/phases/13-proximity-frontend-render/13-CONTEXT.md

**Planned Phase:** 11 (Stale Data Indicator) — 2 plans — 2026-04-25T17:29:05.034Z
