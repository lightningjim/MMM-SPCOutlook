# Milestones

## v1.2 QoL Enhancements (Shipped: 2026-05-03)

**Phases completed:** 3 phases, 8 plans, 17 tasks
**Timeline:** 2026-04-25 → 2026-05-03 (~8 days, 36 commits)
**LOC:** +333 / -43 across `MMM-SPCOutlook.js` and `node_helper.js`

**Key accomplishments:**

- **STALE-01** — Backend `_isWithinStaleWindow` corrected to honor user-configured `updateInterval` threaded via `GET_SPC_DATA` payload; fixed latent 60-min default bug.
- **STALE-02/03** — Frontend `⚠ Stale — N minutes ago` indicator at top of module wrapper, sourcing relative time from `_staleAsOf` via vendored `moment` global with `isFinite` guard and clock-skew short-circuit.
- **PROX-01..06** — Distance-weighted proximity backend: `computeProximity()` with linear 40 km falloff and boundary-safe strict cap, polygon→line cache memoization (`deriveLinesIfMissing`), additive `dayN.proximity` subtree emission for Day 1–3 categorical + per-hazard CIG, gated by `proximityWeighting` (default off).
- **PROXUI-01..05** — Frontend proximity badges: inside-tier `→ ENH 0.7`, outside-tier `0.6 (near SLGT)`, per-hazard CIG glyphs (`①②③`), Day 3 dual-badge with semicolon separator inside colored span, noise-floor flicker suppression at `PROX_MIN_WEIGHT = 0.1`.
- **Default-off byte-identity invariant** — With `proximityWeighting:false` (default), DOM and payload shape are byte-identical to pre-v1.2; verified end-to-end via static analysis, behavioral simulation, and live MagicMirror² UAT.
- **Verification artifacts** — `11/12/13-VERIFICATION.md` (each 4–5/5 truths verified), `13-UAT.md` (7/7 live tests pass), `v1.2-MILESTONE-AUDIT.md` (6/6 cross-phase boundaries WIRED, 5/5 E2E flows PASS).

---

## v1.1 Fire Wx Outlook Expansion (Shipped: 2026-03-21)

**Phases completed:** 3 phases, 3 plans, 6 tasks

**Key accomplishments:**

- All 12 Day 3-8 SPC categorical fire weather GeoJSON endpoints confirmed HTTP 200; DN=5/8/10 parse strategy required (LABEL contains day identifier "D3"/"D6", not risk level)
- Day 3-8 fire weather fetch loop added to getSpcOutlook() using DN-based parsing via exper/fire_wx windrhcat/drytcat endpoints, populating day3Risk-day8Risk in both fireWeather return paths
- Day 3-8 fire weather rows added to getDom() with per-day conditional rendering and extended no-risk guard covering all 8 fire weather days

---

## v1.0 Refactor and Feature Update (Shipped: 2026-03-12)

**Phases completed:** 7 phases, 13 plans, 0 tasks

**Key accomplishments:**

- (none recorded)

---
