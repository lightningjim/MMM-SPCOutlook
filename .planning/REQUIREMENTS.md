# MMM-SPCOutlook Requirements — Milestone v1.2 QoL Enhancements

**Goal:** Make the at-a-glance display more informative — surface data freshness and adjacent-tier risk proximity.

Predecessor milestones: v1.0 (Refactor & Feature Update, shipped 2026-03-12), v1.1 (Fire Wx Outlook Expansion, shipped 2026-03-21). Validated requirements from v1.0/v1.1 are recorded in `.planning/PROJECT.md` under `## Requirements › Validated`.

---

## v1.2 Requirements

### Stale Data (STALE)

- [ ] **STALE-01**: `node_helper`'s `_isWithinStaleWindow` reads the user-configured `updateInterval` (threaded through `GET_SPC_DATA` socket payload) instead of silently defaulting to 60 minutes
- [ ] **STALE-02**: Display surfaces a compact warning indicator at top of the module wrapper when backend reports `_stale === true`
- [ ] **STALE-03**: Stale indicator includes a relative last-fresh-fetch time (e.g. "12 minutes ago") sourced from `_staleAsOf` via the MagicMirror²-vendored `moment` global

### Proximity Backend (PROX)

- [ ] **PROX-01**: New `computeProximity(items, loc, currentValue, comparator)` helper computes a weighted value via linear falloff with 40 km cutoff (`weight = max(0, 1 − d_km/40)`), capped strictly below the next tier integer
- [ ] **PROX-02**: `proximityWeighting` boolean is threaded from frontend through `GET_SPC_DATA` payload to `getSpcOutlook` → `fetchAndEvaluateHazard` and the inlined Day 3 blocks; default false
- [ ] **PROX-03**: Per-`dayN` `proximity` subtree is emitted for Convective Day 1–3 categorical when `proximityWeighting` is true (suppressed otherwise)
- [ ] **PROX-04**: Per-`dayN` `proximity` subtree includes per-hazard CIG entries (Day 1/2 torCig/hailCig/windCig + Day 3 cig) when `proximityWeighting` is true
- [ ] **PROX-05**: `_geoJsonCache` entries are extended additively to memoize the flattened-line polygon representation alongside the scalar value (no recompute per render)
- [ ] **PROX-06**: Helper returns `null` and frontend suppresses the badge when no higher tier polygon exists for the day (e.g. inside HIGH, quiet day)

### Proximity Frontend (PROXUI)

- [ ] **PROXUI-01**: `proximityWeighting: false` is added to `defaults` and included in both the initial and interval `GET_SPC_DATA` socket payloads
- [ ] **PROXUI-02**: Inside-risk badge `CURR → NEXT W.W` is rendered after the existing Day 1/2/3 categorical risk text when proximity data is present
- [ ] **PROXUI-03**: Outside-risk badge `W.W (near TIER)` is rendered when the point is outside all tiers but a tier polygon is within 40 km (uses min distance across all polygons of the lowest applicable tier)
- [ ] **PROXUI-04**: Per-hazard CIG badges render alongside existing `cigLabel` output for Day 1/2 (tor/hail/wind) and Day 3
- [ ] **PROXUI-05**: Weight displays rounded to 1 decimal; badge is suppressed when weight is below a noise threshold to prevent flicker between updates

---

## Future Requirements (Deferred)

- Per-row staleness UX (requires backend stale-aggregation refactor)
- Proximity weighting for Fire Weather (Day 1–8) and Convective Day 4–8
- User-configurable `proximityMaxKm` and `proximityMinWeight` knobs
- Trend / predictive proximity (requires payload history)

## Out of Scope (v1.2)

- Mobile/web interface — display module only
- Push notifications — display only
- Historical outlook data — live only
- Non-SPC data sources — SPC products only
- Automated test framework — manual coverage checklists used instead

---

## Traceability

To be filled by roadmapper. Each REQ-ID will be mapped to exactly one phase.

| REQ-ID | Phase |
|--------|-------|
| STALE-01 | — |
| STALE-02 | — |
| STALE-03 | — |
| PROX-01 | — |
| PROX-02 | — |
| PROX-03 | — |
| PROX-04 | — |
| PROX-05 | — |
| PROX-06 | — |
| PROXUI-01 | — |
| PROXUI-02 | — |
| PROXUI-03 | — |
| PROXUI-04 | — |
| PROXUI-05 | — |
