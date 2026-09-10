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
- [x] **Phase 18: Merge, Precedence & Unified Payload Schema** - Build the cross-source dedup/precedence logic and single backend payload; measure cold-cache latency (completed 2026-09-06)
- [x] **Phase 19: Unified Day Report — getDom() Rewrite** - Replace per-product sections with the merged per-day report, with full behavior-parity verification (completed 2026-09-07)

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

  1. A hazard near a day boundary is placed using strict UTC time-window overlap — reconciling SPC's 12Z–12Z, the Hazards Outlook's 00Z–00Z, and ERO Day 1's partial 01Z–12Z conventions — verified against at least one real near-boundary case captured from live payloads (MERGE-01) (**REOPENED — FAILED** by 18-VERIFICATION.md 2026-09-06: the earlier PASS rests on a replay covering only the zero-duration `start_date === end_date` case. CR-03 — a multi-day INCLUSIVE span still loses its last day from `days[]` while the legacy block renders it — and CR-04 — `_spcGridAnchor` accepts an already-elapsed `EXPIRE_ISO` and shifts the whole fourteen-day grid a day early while reporting `gridAnchor: "observed"` — both falsify this for cases the replay never exercised. Closed by 18-13 and 18-14.)
  2. When SPC's convective outlook and WPC's derived Severe Weather flag both cover the same day/location, only SPC's granular tier displays — confirmed by inspecting the suppression code path against a captured live payload to verify it keys off the hazard dimension, not a label string match (MERGE-02).
  3. When HeatRisk and WPC's binary Hazardous Heat flag overlap, only HeatRisk's 5-level category displays (MERGE-03). (**FAILED** by 18-VERIFICATION.md 2026-09-06: the precedence rule is correct and probe-verified, but CR-02 drops HeatRisk's outermost tile from `days[]` for the 00Z-12Z half of every UTC day, so the rule has nothing to suppress WPC's flag with on that day. Closed by 18-15.)
  4. Two genuinely distinct concurrent hazards on the same day both appear, and a hazard reported by two products under overlapping vocabulary appears only once — validated against captured live payloads, not assumed synthetic cases (MERGE-04) (under-merge PASS live; over-merge re-checked NOT OBSERVABLE after the 18-10 fix — no live coordinate carries both a flash-flood and a heavy-precip entry, see 18-LIVE-CAPTURE.md's Criterion 4 re-check).
  5. The backend emits a single `days`/`summary`/`sources`/`advisories`-shaped payload; compact and detailed output can both be produced by reading that one payload, with no precedence logic left to be recomputed downstream (RPT-07). (**FAILED** by 18-VERIFICATION.md 2026-09-06: CR-01 — three unguarded reads added this phase turn any single `Promise.allSettled` rejection into a TypeError that collapses the whole payload to `{ error }`, rendering "Error: ..." over healthy products. Closed by 18-16.)
  6. A cold-cache run on the target Raspberry Pi hardware, with every product toggle enabled, produces a measured startup latency figure recorded before the milestone closes (PERF-03).

**Plans**: 16 plans in 14 waves

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

- [x] 18-09-PLAN.md — live payload capture, per-criterion validation, local PERF-03 figures, human checkpoint (wave 7)

**Wave 8** *(gap closure — blocked on Wave 7 completion)*

- [x] 18-10-PLAN.md — MERGE-01 inclusive/exclusive endpoint fix plus its live-shaped, mutation-proven scenarios (wave 8)

**Wave 9** *(gap closure — blocked on Wave 8 completion)*

- [x] 18-11-PLAN.md — sources[].reportedDays toggle-off hygiene fix plus its mutation-proven scenario (wave 9)

**Wave 10** *(gap closure — blocked on Wave 9 completion)*

- [x] 18-12-PLAN.md — criterion 1 re-validation, MERGE-04 re-check, tracking propagation, operator checkpoints (wave 10)

**Wave 11** *(gap closure — blocked on Wave 10 completion)*

- [x] 18-13-PLAN.md — D-21 inclusive end_date endpoint, three re-pointed assertions, multi-day legacy-parity scenario (wave 11)

**Wave 12** *(gap closure — blocked on Wave 11 completion)*

- [x] 18-14-PLAN.md — reject an already-elapsed EXPIRE_ISO in _spcGridAnchor, plus its degrade scenario (wave 12)

**Wave 13** *(gap closure — blocked on Wave 12 completion)*

- [x] 18-15-PLAN.md — bound the HeatRisk grid loop by GRID_DAY_COUNT alone, plus the suite's first sub-12Z scenario (wave 13)

**Wave 14** *(gap closure — blocked on Wave 13 completion)*

- [x] 18-16-PLAN.md — allSettled per-member null guards, forced-rejection scenario, WR-01 residual recorded (wave 14)

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

**Carried-in scope (folded from backlog 2026-09-06 — all three are SECONDARY to the rewrite):**

These land in Phase 19 because Phase 19 is the first real consumer of each. They are explicitly
droppable: if the RPT-01..06 rewrite is at risk, cut these back to the backlog rather than
letting them compete with behavior parity. Ordered by how much Phase 19 depends on them.

1. **WR-02 — `renderDayBlock` missing the guards its siblings apply** (from `18-REVIEW.md`,
   confirmed unregistered by `18-SECURITY.md`'s threat cross-check). `MMM-SPCOutlook.js:604-614`
   interpolates `day{N}Color` / `day{N}Text` into `innerHTML` without `validHazardColor()` /
   `escapeHtml()`. Not exploitable today — both fields come from closed, module-authored lookup
   tables — and **no threat-model row in any of Phase 18's 16 plans covers this renderer**
   (T-18-10's `transfer` covers only the new `days[].hazards[].label` path). **Close this before
   routing any new row through `renderDayBlock`** — that is the moment it stops being theoretical,
   and it happens inside this phase.

2. **`sources['wpc-hazards']` under-reports on live data.** Observed on the target Pi 2026-09-06
   (OKC coords, all toggles on): the source fetched successfully — `idpFiledate` set, 823-1345 ms
   — and its `windowBand` carried two real spans (Hazardous Heat 2026-09-08→09-11; Severe Drought
   2026-09-08→09-12, `mapped: false`), yet the payload reported `reporting: false`,
   `reportedDays: []` and `unmappedLabels: []` — the last despite the run logging *"unmapped hazard
   label rendered verbatim: Severe Drought"*.

   The empty `days[]` for this source is **correct by design** — RPT-04 routes window-spanning
   entries to the band, never into a day block. The defect is only that two `sources[]` metadata
   fields disagree with what the source actually did: `reporting: false` contradicts the suite's
   `merge-sources-spc-fire-reporting-tracks-answering-not-finding` invariant, and the empty
   `unmappedLabels` contradicts `merge-unmapped-label-passes-through-and-is-recorded`. **Matters
   here because** a display keying off `sources[id].reporting` to decide whether to show a source
   would treat `wpc-hazards` as silent while RPT-04's band still renders its entries. Related to
   AR-07 / T-18-53 (`18-SECURITY.md`) — the same answered-vs-never-asked ambiguity from the other
   side. No probe fixture has a windowBand-only span with empty day arrays, which is why 123 green
   scenarios and the phase verifier both missed it.

3. **IN-01 — window-band dedupe key collision** (from `16-REVIEW.md`, the sole surviving finding
   of that review). `node_helper.js:939` builds `entry.label + "|" + entry.offsetStart + "|" +
   entry.offsetEnd` from a remote-controlled label, so a label containing `|` can collide with a
   different triple and silently drop one entry from the band. Growth is already bounded by Phase
   18's `HAZARDS_MAX_WINDOW_ENTRIES = 40`, so this is key hygiene, not a resource risk. Folded here
   because RPT-04's band is where a dropped entry would actually be seen. Lowest priority of the
   three.

**Plans**: 9 plans in 8 waves

Plans:
**Wave 1**

- [x] 19-01-PLAN.md — RPT-06 behavior-parity checklist artifact + the two mandatory manual-run procedures (written before any render code)
- [x] 19-02-PLAN.md — backend: thread the SPC proximity subtree into the unified `days[]` grid (gap found at planning: proximity exists only on legacy day1-3 blocks)

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 19-03-PLAN.md — `SIGNIFICANCE_FLOOR` in hazardTaxonomy.js + backend-resolved `days[n].autoExpand` for D-04 (blocking decision on thresholds)

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 19-04-PLAN.md — frontend: render-mechanism decision, helper hoist, `dayReportDetail`, three empty states, top stale badge, compact per-day line (D-01/02/03/08)

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 19-05-PLAN.md — frontend: detail mode, `also:` competitor lines, three-shape probabilistic sub-line, all ten proximity mode decisions (D-04/05/06/07)

**Wave 5** *(blocked on Wave 4 completion)*

- [x] 19-06-PLAN.md — frontend: one band below all day blocks (RPT-04) + promote `windowBand` to top level + sole-render-path gate

**Wave 6** *(blocked on Wave 5 completion)*

- [x] 19-07-PLAN.md — SEVERABLE carried-in backend items: `wpc-hazards` metadata under-report + IN-01 dedupe key

**Wave 7** *(blocked on Wave 6 completion)*

- [x] 19-08-PLAN.md — RPT-06 sign-off: checklist reconciliation + the two mandatory manual runs on the Pi (blocking human verify)

**Wave 8** *(blocked on Wave 7 completion)*

- [x] 19-09-PLAN.md — legacy retirement: sole-reader proof, folded HeatRisk todo discharge, measured emission-deletion decision (blocking)

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
| 18. Merge, Precedence & Unified Payload Schema | v2.0 | 16/16 | Complete    | 2026-09-06 |
| 19. Unified Day Report — getDom() Rewrite | v2.0 | 9/9 | Complete   | 2026-09-07 |

## Backlog

*Empty. The two prior entries were cleared on 2026-09-06 via `/bm:review-backlog`:*

- *999.1 (Phase 16 follow-ups) — nine of its ten findings were verified closed in current source by Phases 17/18 (evidence is in the `/bm:review-backlog` commit message and each fix's own source comments); the surviving finding, IN-01, was folded into Phase 19's carried-in scope.*
- *999.2 (Phase 18 payload-metadata + renderer follow-ups) — folded into Phase 19's carried-in scope, since Phase 19 is the first consumer of both items.*

### Phase 19.1: Day report render width, product-neutral copy, and config key validation (INSERTED)

**Goal:** Fix the three display/config defects Phase 19's UAT found against the unified day report: the detail-mode day report no longer widens its MagicMirror region or overlaps neighbouring columns; user-facing copy names the products the module actually aggregates rather than SPC alone; and a config key the module does not recognise is surfaced to the operator instead of being silently ignored.
**Requirements**: none — defect-fix phase traced to 19-UAT.md tests 5, 11, 13 and 19.1-CONTEXT.md D-01..D-06 (no REQ-IDs exist for this phase)
**Depends on:** Phase 19
**Plans:** 5 plans

Plans:
- [ ] 19.1-01-PLAN.md — product-neutral copy: getHeader() three-state fallback, `Loading NWS outlooks...`, README (UAT 11, D-02..D-05)
- [ ] 19.1-02-PLAN.md — unrecognised-config-key warning at start() with a nearest-`defaults` suggestion (UAT 13)
- [ ] 19.1-03-PLAN.md — render width, both halves: inline-block `min-width:Nch` columns AND the wrapper `max-width` region cap (UAT 5, MAJOR)
- [ ] 19.1-04-PLAN.md — width regression guards: harness wrapper accessor plus three mutation-proven structural scenarios
- [ ] 19.1-05-PLAN.md — live measurement on `ssh mm`, cap tuning, and parity-checklist/UI-SPEC reconciliation (checkpoint, not autonomous)
