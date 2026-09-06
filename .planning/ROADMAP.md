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

- [x] **Phase 14: Foundation & WPC Excessive Rainfall Outlook** - Decouple payload shape from `extended`, establish per-product toggles and endpoint conventions, ship ERO (7/7 plans; 3 review rounds, all blocking gaps closed; probe suite 15/15 mutation-proven — see 14-REVIEW.md / 14-REVIEW-FIX.md) — completed 2026-08-23
- [x] **Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion** - Ship WSSI Overall Impact and MPD advisories
- [x] **Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook** - Ship per-day and window-spanning hazard entries with weekday-aware staleness (completed 2026-08-27)
- [x] **Phase 17: NWS/WPC HeatRisk & Parallelized Fetching** - Ship the raster-identify HeatRisk product and parallelize all new fetches (completed 2026-09-01)
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

**Plans:** 7/7 plans complete

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

- [x] 14-06-PLAN.md — Offline payload-resilience probe harness: reproduce CR-01 with no network and no node_modules (gap wave 1)

**Gap Closure Wave 2** *(blocked on Gap Closure Wave 1)*

- [x] 14-07-PLAN.md — Contain hostile ERO responses: harden shared `extractPolygons`, add `_isFeatureCollection`, per-day try/catch (gap wave 2)

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

**Plans:** 6/9 plans executed

Plans:
**Wave 1**

- [x] 15-01-PLAN.md — Registry `kind` discriminator plus the winterImpact, spcMD and mpd rows
- [x] 15-02-PLAN.md — Probe harness: real ZIP/KML dependencies, skip accounting, KMZ fixture builder

**Wave 2**

- [x] 15-03-PLAN.md — WSSI end to end: shared arcgis-day-layers runner, payload block, render rows

**Wave 3**

- [x] 15-04-PLAN.md — Shared kml-advisory pipeline and SPC MD migration, fixing the http:// allowlist defect
- [x] 15-05-PLAN.md — WSSI probe scenarios, mutation-proven

**Wave 4**

- [x] 15-06-PLAN.md — MPD discovery: directory listing, validity window, hazard-type extraction

**Wave 5**

- [ ] 15-07-PLAN.md — Atomic socket migration to [outlook, seq], advisory band, no-risk gate fix

**Wave 6**

- [ ] 15-08-PLAN.md — KMZ fixture builders, SPC MD allowlist and frontend contract scenarios

**Wave 7**

- [ ] 15-09-PLAN.md — MPD scenario family, phase mutation inventory, live MPD verification checkpoint

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

**Note on criterion 4:** verified at the shipped default config (`showDrought: false`, CONTEXT.md
D-10). Drought display is an explicit user opt-in, not a violation of this criterion. Flooding
exclusion, by contrast, is absolute — D-09 provides no override.

**Plans:** 8/8 plans complete

Plans:
**Wave 1**

- [x] 16-01-PLAN.md — `hazardsOutlook` registry row: six layers, Flooding/Drought vocabularies, live-sourced palette, `maxDataAgeHours` (wave 1)
- [x] 16-02-PLAN.md — Clock seam, UTC date-bucketing helpers, collect-all evaluator (wave 1)

**Wave 2** *(blocked on Wave 1)*

- [x] 16-03-PLAN.md — `arcgis-hazard-window` runner: clock-independent cache contract, per-layer freshness, payload block (wave 2)

**Wave 3** *(blocked on Wave 2)*

- [x] 16-04-PLAN.md — Config defaults and the TWO independent no-risk gate terms (wave 3)

**Wave 4** *(blocked on Wave 3)*

- [x] 16-05-PLAN.md — Day-grid renderer and window-band renderer, `escapeHtml` load-bearing (wave 4)

**Wave 5** *(blocked on Wave 4)*

- [x] 16-06-PLAN.md — Probe routes/fixtures plus the HAZ-01/03/04 core scenario family (wave 5)

**Wave 6** *(blocked on Wave 5)*

- [x] 16-07-PLAN.md — Day-offset-drift-on-cache-hit and window-band-gate scenarios, DATA-02 freshness family (wave 6)

**Wave 7** *(blocked on Wave 6)*

- [x] 16-08-PLAN.md — Phase mutation inventory, `day9..day14` audit, human UAT checkpoint (wave 7)

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

**Plans:** 9/9 plans complete

Plans:
**Wave 1**

- [x] 17-01-PLAN.md — HeatRisk registry row, ImageServer identify URL builder, D-11 load-time map-identity assertion (wave 1)

**Wave 2** *(blocked on Wave 1)*

- [x] 17-02-PLAN.md — Injectable body-shape validator on `fetchGeoJsonCached` plus the zip/dedupe/day-offset transforms (wave 2)
- [x] 17-03-PLAN.md — Frontend: `showHeatRisk`/`showMinorHeat`, D-03's shared render/gate predicate, render block (wave 2)

**Wave 3** *(blocked on Wave 2)*

- [x] 17-04-PLAN.md — `_runHeatRiskProduct`: reproject, fetch, bucket, the four staleness branches, clock-independent cache (wave 3)

**Wave 4** *(blocked on Wave 3)*

- [x] 17-05-PLAN.md — PERF-01: six-member `Promise.allSettled` batch, timing log, concurrency-invariant guard script (wave 4)

**Wave 5** *(blocked on Wave 4)*

- [x] 17-06-PLAN.md — Probe fixtures/routes plus the HEAT-01/02/03/04 and D-06 scenario family (wave 5)

**Wave 6** *(blocked on Wave 5)*

- [x] 17-07-PLAN.md — D-04's two NoData branches, D-05's two gap branches, D-07 freshness, cache-hit day offset (wave 6)

**Wave 7** *(blocked on Wave 6)*

- [x] 17-08-PLAN.md — Frontend D-03 scenarios, deferred-fetch stub + PERF-01 overlap scenario, DATA-03 load-time scenario (wave 7)

**Wave 8** *(blocked on Wave 7)*

- [x] 17-09-PLAN.md — Phase mutation inventory, DATA-03 recorded spot check, human UAT checkpoint (wave 8)

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

**Plans**: 12 plans in 10 waves

Plans:
**Wave 1**

- [x] 18-01-PLAN.md — hazardTaxonomy.js: dimension roster, (source,label) map, precedence and no-risk floor tables (wave 1)
- [x] 18-02-PLAN.md — SPC grid anchor from VALID/EXPIRE, the fourteen grid-day windows, days skeleton in the payload (wave 1)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 18-03-PLAN.md — runner side-channels and SPC-grid re-bucketing for wpc-hazards and heatrisk (wave 2)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 18-04-PLAN.md — straight-through grid entries for spc-convective, spc-fire, wpc-ero, wpc-wssi, plus per-source stale attribution (wave 3)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 18-05-PLAN.md — per-day precedence resolver, summary rollup, per-source health, JSDoc contract (wave 4)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 18-06-PLAN.md — PERF-03 timing instrument: backend interval, per-product breakdown, cold-start and wall-clock logs (wave 5)
- [x] 18-07-PLAN.md — MERGE-01 probe scenarios plus their mutation proofs (wave 5)

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 18-08-PLAN.md — MERGE-02/03/04, D-07, summary-verdict and legacy-parity probe scenarios plus mutation proofs (wave 6)

**Wave 7** *(blocked on Wave 6 completion)*

- [ ] 18-09-PLAN.md — live payload capture, per-criterion validation, local PERF-03 figures, human checkpoint (wave 7)

**Wave 8** *(gap closure — blocked on Wave 7 completion)*

- [x] 18-10-PLAN.md — MERGE-01 inclusive/exclusive endpoint fix plus its live-shaped, mutation-proven scenarios (wave 8)

**Wave 9** *(gap closure — blocked on Wave 8 completion)*

- [x] 18-11-PLAN.md — sources[].reportedDays toggle-off hygiene fix plus its mutation-proven scenario (wave 9)

**Wave 10** *(gap closure — blocked on Wave 9 completion)*

- [ ] 18-12-PLAN.md — criterion 1 re-validation, MERGE-04 re-check, tracking propagation, operator checkpoints (wave 10)

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
| 14. Foundation & WPC Excessive Rainfall Outlook | v2.0 | 7/7 | Complete | 2026-08-23 |
| 15. WPC Winter Storm Severity & Mesoscale Precipitation Discussion | v2.0 | 6/9 | In Progress|  |
| 16. WPC Day 3–7 / CPC Day 8–14 Hazards Outlook | v2.0 | 8/8 | Complete    | 2026-08-27 |
| 17. NWS/WPC HeatRisk & Parallelized Fetching | v2.0 | 9/9 | Complete    | 2026-09-01 |
| 18. Merge, Precedence & Unified Payload Schema | v2.0 | 10/12 | In Progress|  |
| 19. Unified Day Report — getDom() Rewrite | v2.0 | 0/? | Not started | - |

## Backlog

### Phase 999.1: Phase 16 code review follow-ups (BACKLOG)

**Goal:** [Captured for future planning] Close the ten findings from `16-REVIEW.md` that were
left open when Phase 16 shipped. CR-01 (critical) and WR-04 were fixed in `0f58b5e`; these are
the remainder. Full detail, with reproduction and suggested fixes, lives in
`.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-REVIEW.md`.
**Requirements:** TBD
**Plans:** 0 plans

Highest value first:

- **WR-05** — `_isWithinStaleWindow` and the three cache-hit timestamp refreshes call
  `Date.now()` directly instead of the `_nowMs()` seam. Already live: the probe harness pins
  `HAZARDS_NOW_MS` to `Date.UTC(2026,7,26,13,0)`, now more than a day behind the real clock, so
  a warm-cache-plus-failure hazards scenario would take a different branch today than when it
  was authored. It passes only because no hazards scenario reaches `_isWithinStaleWindow`.

- **WR-02** — D-09's "hard exclusion with no config override" is exact-string `.includes()`, so
  `"Flooding Likely "` with a trailing space renders. `winterImpact.toValue` one row above
  already folds before lookup and calls this exact trap WSSI-02.

- **WR-01** — `showDrought` is baked into the URL-keyed cache on the miss path only, with no
  toggle dimension and no frontend-side drought term. Reachable via the shared-`node_helper`
  multi-instance case this file documents at length.

- **WR-03** — `_bucketHazardMatch` hardcodes the day span `3`/`14` while the payload loop reads
  `row.dayRangeTotal`; the bucketer isn't even passed `row`. This is the two-places-declare-one-span
  defect `daySpanOf`'s own 20-line comment condemns.

- **WR-06** — remote-controlled unbounded growth in the unmapped-label ledger
  (`_loggedUnmappedHazardLabels`) and the window-band entry count. Runs on a Raspberry Pi.

- **WR-07** — `fetchGeoJsonCached` reads an unbounded response body; Phase 16 added six new URLs
  to that path.

- **IN-01** — the window-band dedupe key concatenates a remote-controlled label with `|`.

Operator helper `scripts/hazards-at.js` (added during the Phase 16 UAT, not a production path):

- **WR-08** — reports "per-day grid" for Precipitation features that D-04 routes to the band.
- **WR-09** — prints `fresh (no warning)` when `idp_filedate` is missing, because `NaN > 84` is
  `false`.

- **IN-02** — diverges from the codebase's transport and naming conventions.

Plans:

- [ ] TBD (promote with /bm:review-backlog when ready)
