# Roadmap: MMM-SPCOutlook

## Milestones

- ✅ **v1.0 Refactor and Feature Update** — Phases 1–7 (shipped 2026-03-12)
- ✅ **v1.1 Fire Wx Outlook Expansion** — Phases 8–10 (shipped 2026-03-21)
- 🔵 **v1.2 QoL Enhancements** — Phases 11–13 (in progress, started 2026-04-25)

## Phases

<details>
<summary>✅ v1.0 Refactor and Feature Update (Phases 1–7) — SHIPPED 2026-03-12</summary>

- [x] Phase 1: Bug Fixes (2/2 plans) — completed 2026-03-04
- [x] Phase 2: CIG Tier Support (2/2 plans) — completed 2026-03-05
- [x] Phase 3: Fire Weather (2/2 plans) — completed 2026-03-05
- [x] Phase 4: Performance (1/1 plan) — completed 2026-03-08
- [x] Phase 5: Code Quality (4/4 plans) — completed 2026-03-09
- [x] Phase 6: Verify Phase 2 (1/1 plan) — completed 2026-03-11
- [x] Phase 7: Fix QUAL-02/QUAL-03 Residuals (1/1 plan) — completed 2026-03-11

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Fire Wx Outlook Expansion (Phases 8–10) — SHIPPED 2026-03-21</summary>

- [x] Phase 8: URL Verification (1/1 plan) — completed 2026-03-21
- [x] Phase 9: Backend Implementation (1/1 plan) — completed 2026-03-21
- [x] Phase 10: Display Implementation (1/1 plan) — completed 2026-03-21

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

### v1.2 QoL Enhancements (Phases 11–13) — IN PROGRESS

- [ ] **Phase 11: Stale Data Indicator** — Fix latent stale-window bug and surface a freshness warning in the display
- [ ] **Phase 12: Proximity Backend Foundation** — Compute and emit per-day proximity-weighted risk subtree from `node_helper`
- [ ] **Phase 13: Proximity Frontend Render** — Render inside/outside-tier and CIG proximity badges, gated on the new config flag

## Phase Details

### Phase 11: Stale Data Indicator
**Goal**: User can tell at a glance when displayed risk data is stale, with an accurate stale window honoring their configured update interval.
**Depends on**: Nothing (independent of proximity work)
**Requirements**: STALE-01, STALE-02, STALE-03
**Success Criteria** (what must be TRUE):
  1. When the user sets a non-default `updateInterval`, the backend's stale window matches that interval (no silent 60-minute fallback).
  2. When the backend reports `_stale === true`, a compact warning indicator is visible at the top of the module wrapper.
  3. The stale indicator displays a relative last-fresh-fetch time (e.g. "12 minutes ago") sourced from `_staleAsOf`.
  4. When the backend reports `_stale === false` (or omits it), no stale indicator is rendered.
**Plans**: 2 plans
- [x] 11-01-PLAN.md — Backend interval threading bug fix (STALE-01)
- [ ] 11-02-PLAN.md — Frontend payload + stale indicator render (STALE-02, STALE-03)
**UI hint**: yes

### Phase 12: Proximity Backend Foundation
**Goal**: Backend computes distance-weighted proximity to higher tiers for Convective Day 1–3 categorical and CIG hazards, emitting an additive `proximity` subtree per day when the feature is enabled.
**Depends on**: Phase 11 (sequencing — ships latent bug fix first; no code dependency)
**Requirements**: PROX-01, PROX-02, PROX-03, PROX-04, PROX-05, PROX-06
**Success Criteria** (what must be TRUE):
  1. With `proximityWeighting: true`, each `dayN` payload (Days 1–3) carries a `proximity` subtree containing categorical weighting plus per-hazard CIG entries (Day 1/2 torCig/hailCig/windCig, Day 3 cig).
  2. With `proximityWeighting: false` (default), payloads contain no `proximity` subtree and existing readers see zero shape change.
  3. Computed weights use linear falloff with a 40 km cutoff (`weight = max(0, 1 − d_km/40)`) and are strictly capped below the next-tier integer.
  4. When no higher-tier polygon exists for a given day/hazard, the helper returns `null` (no spurious subtree entries).
  5. Polygon-to-line conversions are memoized inside `_geoJsonCache` entries so per-render turf cost stays at O(1) for unchanged inputs.
**Plans**: 2 plans
- [ ] 11-01-PLAN.md — Backend interval threading bug fix (STALE-01)
- [ ] 11-02-PLAN.md — Frontend payload + stale indicator render (STALE-02, STALE-03)

### Phase 13: Proximity Frontend Render
**Goal**: User sees adjacent-tier proximity badges inline with existing risk text on Day 1/2/3 categorical and CIG rows when proximity weighting is enabled.
**Depends on**: Phase 12 (consumes the `proximity` subtree shape)
**Requirements**: PROXUI-01, PROXUI-02, PROXUI-03, PROXUI-04, PROXUI-05
**Success Criteria** (what must be TRUE):
  1. Setting `proximityWeighting: true` in config causes the frontend to thread the flag through both initial and interval `GET_SPC_DATA` socket payloads; default `false` stays a no-op.
  2. When the user is inside a Day 1/2/3 categorical risk and a higher tier is within 40 km, an inline `CURR → NEXT W.W` badge is rendered after the risk text.
  3. When the user is outside all categorical tiers but a tier polygon is within 40 km, an inline `W.W (near TIER)` badge is rendered.
  4. Per-hazard CIG badges (Day 1/2 tor/hail/wind, Day 3 cig) render alongside existing `cigLabel` output using the same primitive.
  5. Weights are displayed rounded to one decimal; badges below the noise threshold are suppressed so the display does not flicker between updates.
**Plans**: 2 plans
- [ ] 11-01-PLAN.md — Backend interval threading bug fix (STALE-01)
- [ ] 11-02-PLAN.md — Frontend payload + stale indicator render (STALE-02, STALE-03)
**UI hint**: yes

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1. Bug Fixes | v1.0 | 2/2 | Complete | 2026-03-04 |
| 2. CIG Tier Support | v1.0 | 2/2 | Complete | 2026-03-05 |
| 3. Fire Weather | v1.0 | 2/2 | Complete | 2026-03-05 |
| 4. Performance | v1.0 | 1/1 | Complete | 2026-03-08 |
| 5. Code Quality | v1.0 | 4/4 | Complete | 2026-03-09 |
| 6. Verify Phase 2 | v1.0 | 1/1 | Complete | 2026-03-11 |
| 7. Fix QUAL-02/QUAL-03 Residuals | v1.0 | 1/1 | Complete | 2026-03-11 |
| 8. URL Verification | v1.1 | 1/1 | Complete | 2026-03-21 |
| 9. Backend Implementation | v1.1 | 1/1 | Complete | 2026-03-21 |
| 10. Display Implementation | v1.1 | 1/1 | Complete | 2026-03-21 |
| 11. Stale Data Indicator | v1.2 | 1/2 | In progress | — |
| 12. Proximity Backend Foundation | v1.2 | 0/0 | Not started | — |
| 13. Proximity Frontend Render | v1.2 | 0/0 | Not started | — |
