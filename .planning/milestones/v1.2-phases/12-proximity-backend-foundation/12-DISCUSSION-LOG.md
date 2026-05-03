# Phase 12: Proximity Backend Foundation - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-25
**Phase:** 12-proximity-backend-foundation
**Areas discussed:** Subtree JSON shape, Outside-all-tiers behavior, Multi-tier combination, Cache memoization timing, Value-field semantics, Empty-day emission

---

## Subtree JSON shape

| Option | Description | Selected |
|--------|-------------|----------|
| Flat per-hazard keys | `dayN.proximity = { categorical, torCig, hailCig, windCig }` (Day 1/2) and `{ categorical, cig }` (Day 3); each entry `{value, nextTier}` or omitted. Mirrors existing dayN.torRisk/hailRisk/windRisk sibling shape. | ✓ |
| Nested cig group | `{ categorical, cig: { tor, hail, wind } }` — Day 3's cig is single-shape, asymmetric with Day 1/2. | |
| Hazards array | `{ categorical, hazards: [{name, value, nextTier}, …] }` — uniform but loses parallelism with sibling fields. | |

**User's choice:** Flat per-hazard keys
**Notes:** Picked the recommended option; preview matched the intended Day 13 frontend consumption shape.

---

## Outside-all-tiers behavior

| Option | Description | Selected |
|--------|-------------|----------|
| Emit when higher tier within 40km | When `currentValue=0` (outside all categorical) but a tier polygon is within 40km, emit `{value: weight, nextTier: 'SLGT'}` to support PROJECT.md's "0.6 (near SLGT)" UX. | ✓ |
| Suppress when outside all tiers | Only emit proximity when user is INSIDE a tier; outside-all-tier users see nothing extra. | |

**User's choice:** Emit when higher tier within 40km
**Notes:** PROJECT.md specifies the "0.6 (near SLGT)" badge — this option preserves it.

---

## Multi-tier combination

| Option | Description | Selected |
|--------|-------------|----------|
| Max weight across higher tiers | Compute weight against every higher-tier polygon; pick the polygon producing max weight; report that tier as nextTier. Cap weight strictly below 1. | ✓ |
| Nearest higher polygon regardless of tier | Pure point-to-line min distance across all higher-tier polygons; tier label = whichever polygon wins. | |
| Immediate-next-tier only | Only consider polygons of currentValue+1; return null if no immediate next tier within 40km even if higher tiers exist nearby. | |

**User's choice:** Max weight across higher tiers
**Notes:** Most expressive; allows MDT polygon to win over ENH when MDT is closer (leapfrog allowed).

---

## Cache memoization timing

| Option | Description | Selected |
|--------|-------------|----------|
| Lazy on first proximity call | When `proximityWeighting=true` and a needed `lines` representation is missing, compute polygon-to-line on demand and write back to `_geoJsonCache` entry. Default-off path zero-cost. | ✓ |
| Eager at fetch time | Compute polygon-to-line on every fetch cache miss regardless of flag. Burns RPi CPU when feature is off. | |
| Eager only when flag is true | Compute polygon-to-line eagerly during fetch but only when `this._proximityWeighting === true`. Couples cache writer to request flag. | |

**User's choice:** Lazy on first proximity call
**Notes:** RPi-friendly; aligns with PROJECT.md core value of avoiding unnecessary CPU burn.

---

## Value-field semantics

| Option | Description | Selected |
|--------|-------------|----------|
| currentValue + weight | `value` is the displayable proximity number, e.g. SLGT(2) user 0.7 toward ENH → `value: 2.7`. Frontend renders rounded to 1 decimal — no further math required. | ✓ |
| Raw weight in [0,1) | `value` is the raw falloff weight only; frontend computes currentValue + value when rendering. | |

**User's choice:** currentValue + weight
**Notes:** Frontend keeps rendering simple — read value, round, render.

---

## Empty-day emission

| Option | Description | Selected |
|--------|-------------|----------|
| Omit dayN.proximity entirely | If categorical AND every CIG hazard returns null, drop the proximity key from dayN. Frontend simply checks `if (dayN.proximity)`. Matches PROX-06 'no spurious subtree entries'. | ✓ |
| Always emit when proximityWeighting=true; null individual fields | `dayN.proximity = { categorical: null, torCig: null, hailCig: null, windCig: null }` — predictable shape but adds noise on quiet days. | |

**User's choice:** Omit dayN.proximity entirely
**Notes:** Aligns with PROX-06 explicit requirement.

---

## Claude's Discretion

- Exact field name for the polygon-cache field (`polys`, `polyEntries`, `items`).
- Whether `computeProximity` reads `_geoJsonCache` directly or accepts pre-derived `lines` array as a parameter.
- Exact strict-cap implementation (`Math.min(weight, 1 - Number.EPSILON)` vs gating on `d_km > 0`).
- Whether to log a one-time info message when `proximityWeighting` first arrives true.

## Deferred Ideas

- Non-linear falloff curves (sigmoid, exponential) — locked to linear by PROX-01.
- Cutoff radius other than 40km — locked by PROX-01; potential v2 tuning knob.
- Fire weather and Day 4–8 proximity — explicitly out of scope per PROJECT.md.
- Mesoscale Discussion proximity — out of scope.
- Computed-weight caching beyond polygon-to-line memoization — premature optimization.
- Frontend badge rendering, suppression below noise threshold — Phase 13 territory.
