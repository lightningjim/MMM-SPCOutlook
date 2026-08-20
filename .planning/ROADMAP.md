# Roadmap: MMM-SPCOutlook

## Milestones

- ✅ **v1.0 Refactor and Feature Update** — Phases 1–7 (shipped 2026-03-12)
- ✅ **v1.1 Fire Wx Outlook Expansion** — Phases 8–10 (shipped 2026-03-21)
- ✅ **v1.2 QoL Enhancements** — Phases 11–13 (shipped 2026-05-03)
- 🚧 **v2.0 WPC & CPC Integration + Unified Day Report** — Phases 14–19 (in progress)

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

<details>
<summary>✅ v1.2 QoL Enhancements (Phases 11–13) — SHIPPED 2026-05-03</summary>

- [x] Phase 11: Stale Data Indicator (2/2 plans) — completed 2026-04-25
- [x] Phase 12: Proximity Backend Foundation (3/3 plans) — completed 2026-05-02
- [x] Phase 13: Proximity Frontend Render (3/3 plans) — completed 2026-05-03

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

### 🚧 v2.0 WPC & CPC Integration + Unified Day Report (In Progress)

**Milestone Goal:** Extend the module beyond SPC to WPC and CPC hazard products, and restructure the display from per-product row sections into a unified per-day report that merges and deduplicates all sources.

- [ ] **Phase 14: Foundation & WPC Excessive Rainfall Outlook** - Decouple payload shape from `extended`, establish per-product toggles and endpoint conventions, ship ERO (all 5 plans executed; verification found 1 blocking gap — see 14-VERIFICATION.md)
- [ ] **Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion** - Ship WSSI Overall Impact and MPD advisories
- [ ] **Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook** - Ship per-day and window-spanning hazard entries with weekday-aware staleness
- [ ] **Phase 17: NWS/WPC HeatRisk & Parallelized Fetching** - Ship the raster-identify HeatRisk product and parallelize all new fetches
- [ ] **Phase 18: Merge, Precedence & Unified Payload Schema** - Build the cross-source dedup/precedence logic and single backend payload; measure cold-cache latency
- [ ] **Phase 19: Unified Day Report — getDom() Rewrite** - Replace per-product sections with the merged per-day report, with full behavior-parity verification

## Phase Details

### Phase 14: Foundation & WPC Excessive Rainfall Outlook

**Goal**: Users can enable per-product toggles on a payload shape that no longer forks on `extended`, and see their location's WPC Excessive Rainfall Outlook risk for Days 1–5 — establishing the fetch/cache/toggle conventions every later product reuses.
**Depends on**: Nothing (first phase of v2.0 milestone)
**Requirements**: CFG-01, CFG-02, DATA-01, PERF-02, ERO-01, ERO-02, ERO-03
**Success Criteria** (what must be TRUE):

  1. With `extended: false` and `showExcessiveRain: true`, user still sees ERO rows — proving the payload shape no longer forks on the `extended` flag (CFG-02).
  2. User can toggle `showExcessiveRain` independently of every other product flag, and every new product flag defaults to false out of the box (CFG-01).
  3. User sees the correct ERO tier label (MRGL/SLGT/MDT/HIGH) for Days 1–5 at their configured location, matched against ERO's own `dn` value domain rather than the fire weather `DN` mapping (ERO-01, ERO-02).
  4. A day where the location falls outside every ERO polygon shows no ERO row — not an empty or error row (ERO-03).
  5. A network trace shows the ERO endpoint always requested with `f=geojson` (never a raw `f=json` fallback), and the same query string is issued on every poll cycle so the ETag/hash cache hits instead of re-running turf on unchanged data (DATA-01, PERF-02).

**Plans:** 7 plans (5/5 original complete; 2 gap-closure plans added after verification found 1 blocking gap)

Plans:
**Wave 1**

- [x] 14-01-PLAN.md — Product registry + non-overridable ArcGIS query builder (wave 1)
- [x] 14-02-PLAN.md — Remove the `extended` payload fork (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 14-03-PLAN.md — ERO backend: products socket contract, fetch/evaluate, excessiveRain block (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 14-04-PLAN.md — ERO frontend: toggle, render rows, extend the no-risk gate (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 14-05-PLAN.md — UAT fixtures + human verification of the five success criteria (wave 4)

**Gap Closure Wave 1** *(CR-01 from 14-VERIFICATION.md; run via `/bm:execute-phase 14 --gaps-only`)*

- [ ] 14-06-PLAN.md — Offline payload-resilience probe harness: reproduce CR-01 with no network and no node_modules (gap wave 1)

**Gap Closure Wave 2** *(blocked on Gap Closure Wave 1)*

- [ ] 14-07-PLAN.md — Contain hostile ERO responses: harden shared `extractPolygons`, add `_isFeatureCollection`, per-day try/catch (gap wave 2)

### Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion

**Goal**: Users can see their location's Winter Storm Severity Index Overall Impact for Days 1–3 and every currently active Mesoscale Precipitation Discussion, each behind its own toggle.
**Depends on**: Phase 14
**Requirements**: WSSI-01, WSSI-02, WSSI-03, MPD-01, MPD-02, MPD-03, MPD-04
**Success Criteria** (what must be TRUE):

  1. With `showWinterImpact: true`, user sees the correct WSSI Overall Impact label for Days 1–3, matched correctly even though the live payload returns the impact field in ALL CAPS against mixed-case documentation (WSSI-01, WSSI-02).
  2. During an out-of-season check where WSSI returns zero features, the module shows no winter rows and raises no error (WSSI-03) — note: only exercisable in-season; verify structurally (empty-array handling) if live off-season data isn't available at execution time.
  3. With `showMPD: true` and multiple MPDs concurrently active, user sees an indicator for every one of them, not only the most recently numbered one (MPD-01, MPD-02).
  4. Each MPD indicator shows a hazard type pulled from the description CDATA table, not a blank or mislabeled value (MPD-03).
  5. Checked against a real or constructed cross-year-boundary MPD sample, the module does not select a stale MPD just because it carries the highest ID number (MPD-04).

**Plans**: TBD

### Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook

**Goal**: Users see per-day hazard entries for Days 3–14 from the Precipitation layer and a separate window-labeled band for Temperature/Wildfire hazards that carry no per-day resolution, without Flooding/Drought noise, and the stale indicator understands this product's weekday-only cadence.
**Depends on**: Phase 14, Phase 15
**Requirements**: HAZ-01, HAZ-02, HAZ-03, HAZ-04, DATA-02
**Success Criteria** (what must be TRUE):

  1. With `showHazardsOutlook: true`, user sees per-day hazard entries for Days 3–14 bucketed from the Precipitation layer's per-feature date stamps (HAZ-01).
  2. Temperature and Wildfire hazards appear once in a labeled window band (e.g. `D3–7`), never repeated identically across every day in that window (HAZ-02).
  3. A feature whose hazard type is carried in the lowercase `label` field (not `LABEL`) is displayed, not silently dropped — verified by deliberately inspecting a live payload feature keyed on lowercase `label` (HAZ-03).
  4. Flooding and Drought sub-labels never appear in the Hazards Outlook display, checked against a live payload known to contain them (HAZ-04).
  5. On a weekend when this product hasn't refreshed since Friday, the module does not raise a false stale warning for it (DATA-02).

**Plans**: TBD

### Phase 17: NWS/WPC HeatRisk & Parallelized Fetching

**Goal**: Users see their location's correct HeatRisk category for each of the next 7 days, and the module's cold-start fetch time no longer grows linearly as more products are enabled.
**Depends on**: Phase 14, Phase 15, Phase 16
**Requirements**: HEAT-01, HEAT-02, HEAT-03, HEAT-04, PERF-01, DATA-03
**Success Criteria** (what must be TRUE):

  1. With `showHeatRisk: true`, user sees a HeatRisk category (0–4) for each of Days 1–7, attributed to the correct day after `catalogItems` are sorted by valid time rather than trusted in array order (HEAT-01, HEAT-02).
  2. The identify call reprojects the configured coordinates to Web Mercator before querying and returns a real category rather than `NoData` (HEAT-03).
  3. When a raw response contains duplicate `idp_validtime` entries, the module displays the current mosaic tile's value, not a stale duplicate — verified by inspecting which entry actually rendered against a captured response with duplicates (HEAT-04).
  4. With all six new product toggles enabled, backend timing/logs show the new product fetches issued concurrently via `Promise.all` rather than sequentially (PERF-01).
  5. A spot check across all six new products confirms no label-to-value mapping is reused between products (e.g. ERO's `dn` is never fed through the fire weather `DN` table) (DATA-03).

**Plans**: TBD

### Phase 18: Merge, Precedence & Unified Payload Schema

**Goal**: Every hazard is attributed to the day its valid-time window actually covers, duplicate or superseded hazards across sources collapse correctly, and the backend emits one precomputed payload the display can consume without recomputing precedence — backed by a real cold-cache latency measurement.
**Depends on**: Phase 14, Phase 15, Phase 16, Phase 17
**Requirements**: MERGE-01, MERGE-02, MERGE-03, MERGE-04, RPT-07, PERF-03
**Success Criteria** (what must be TRUE):

  1. A hazard near a day boundary is placed using strict UTC time-window overlap — reconciling SPC's 12Z–12Z, the Hazards Outlook's 00Z–00Z, and ERO Day 1's partial 01Z–12Z conventions — verified against at least one real near-boundary case captured from live payloads (MERGE-01).
  2. When SPC's convective outlook and WPC's derived Severe Weather flag both cover the same day/location, only SPC's granular tier displays — confirmed by inspecting the suppression code path against a captured live payload to verify it keys off the hazard dimension, not a label string match (MERGE-02).
  3. When HeatRisk and WPC's binary Hazardous Heat flag overlap, only HeatRisk's 5-level category displays (MERGE-03).
  4. Two genuinely distinct concurrent hazards on the same day both appear, and a hazard reported by two products under overlapping vocabulary appears only once — validated against captured live payloads, not assumed synthetic cases (MERGE-04).
  5. The backend emits a single `days`/`summary`/`sources`/`advisories`-shaped payload; compact and detailed output can both be produced by reading that one payload, with no precedence logic left to be recomputed downstream (RPT-07).
  6. A cold-cache run on the target Raspberry Pi hardware, with every product toggle enabled, produces a measured startup latency figure recorded before the milestone closes (PERF-03).

**Plans**: TBD

### Phase 19: Unified Day Report — getDom() Rewrite

**Goal**: Users see the module's interface reorganized into one merged block per day (compact by default, expandable via a detail toggle), replacing every prior per-product section, with zero regressions against four milestones of accumulated display logic.
**Depends on**: Phase 18
**Requirements**: RPT-01, RPT-02, RPT-03, RPT-04, RPT-05, RPT-06
**Success Criteria** (what must be TRUE):

  1. The rendered display shows one block per day merging all enabled sources; no per-product row sections remain from the old layout (RPT-01).
  2. With `dayReportDetail` off (default), each day renders as a single compact line listing that day's hazards inline (RPT-02).
  3. With `dayReportDetail` on, each day's hazards expand into source-labeled sub-rows (RPT-03).
  4. Mesoscale Discussions, MPDs, and window-spanning Hazards Outlook entries render in a separate band below the day blocks, never inside a day block (RPT-04).
  5. With every product disabled or reporting no active hazard, the module renders the correct empty state — a "no risk anywhere" manual test run passes with no error and no stray rows (RPT-05).
  6. Two mandatory manual test runs — "no risk anywhere" and "everything active at once" — both reproduce every previously shipped behavior from BUG-01..04, FWXT-01..05, PROX-01..06, PROXUI-01..05 (the combinatorial no-risk gate and all proximity badge modes), checked off against a per-requirement-ID checklist before this phase is considered done (RPT-06). This phase does not interleave any new-product work — it is strictly a display rewrite against the payload Phase 18 already validated.

**Plans**: TBD
**UI hint**: yes

## Progress

**Execution Order:**
Phases execute in numeric order: 14 → 15 → 16 → 17 → 18 → 19

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
| 11. Stale Data Indicator | v1.2 | 2/2 | Complete | 2026-04-25 |
| 12. Proximity Backend Foundation | v1.2 | 3/3 | Complete | 2026-05-02 |
| 13. Proximity Frontend Render | v1.2 | 3/3 | Complete | 2026-05-03 |
| 14. Foundation & WPC Excessive Rainfall Outlook | v2.0 | 5/5 | Gaps Found | 2026-08-20 |
| 15. WPC Winter Storm Severity & Mesoscale Precipitation Discussion | v2.0 | 0/? | Not started | - |
| 16. WPC Day 3–7 / CPC Day 8–14 Hazards Outlook | v2.0 | 0/? | Not started | - |
| 17. NWS/WPC HeatRisk & Parallelized Fetching | v2.0 | 0/? | Not started | - |
| 18. Merge, Precedence & Unified Payload Schema | v2.0 | 0/? | Not started | - |
| 19. Unified Day Report — getDom() Rewrite | v2.0 | 0/? | Not started | - |
