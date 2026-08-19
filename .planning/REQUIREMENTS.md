# Requirements: MMM-SPCOutlook v2.0

**Defined:** 2026-08-15
**Milestone:** v2.0 WPC & CPC Integration + Unified Day Report
**Core Value:** Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.

## v2.0 Requirements

### Excessive Rainfall Outlook (WPC)

- [ ] **ERO-01**: User sees their location's WPC Excessive Rainfall Outlook risk tier for Days 1–5 when `showExcessiveRain` is enabled
- [ ] **ERO-02**: User sees the correct tier label (MRGL/SLGT/MDT/HIGH) with ERO's own `dn` value domain, not the fire weather `DN` mapping
- [ ] **ERO-03**: User sees no ERO row for a day where their location falls outside all ERO polygons

### Winter Storm Severity Index (WPC)

- [ ] **WSSI-01**: User sees their location's WSSI Overall Impact level for Days 1–3 when `showWinterImpact` is enabled
- [ ] **WSSI-02**: User sees correct impact labels regardless of the source field's letter case (live payload returns ALL CAPS against mixed-case documentation)
- [ ] **WSSI-03**: User sees no winter rows and no error when WSSI returns zero features out of season

### Mesoscale Precipitation Discussion (WPC)

- [ ] **MPD-01**: User sees an indicator when their location falls inside an active WPC Mesoscale Precipitation Discussion, when `showMPD` is enabled
- [ ] **MPD-02**: User sees ALL concurrently active MPDs affecting their location, not only the most recent one
- [ ] **MPD-03**: User sees the MPD's hazard type, extracted from the description CDATA where it actually lives
- [ ] **MPD-04**: User sees correct MPD selection across a year boundary, when numbering resets and "highest number" no longer means "most recent"

### Hazards Outlook (WPC Day 3–7 / CPC Day 8–14)

- [ ] **HAZ-01**: User sees per-day hazard entries for Days 3–14 from the Precipitation layer, which carries per-feature date stamps, when `showHazardsOutlook` is enabled
- [ ] **HAZ-02**: User sees Temperature and Wildfire hazards in a non-day-scoped band, labeled with their window (e.g. `D3–7`), because these layers carry no per-day resolution
- [ ] **HAZ-03**: User sees hazards matched against the service's lowercase `label` field, so a present hazard is never silently reported as absent
- [ ] **HAZ-04**: User does not see Flooding or Drought sub-labels, which are filtered at parse time

### Heat Risk (NWS/WPC)

- [ ] **HEAT-01**: User sees their location's HeatRisk category (0–4) for Days 1–7 when `showHeatRisk` is enabled
- [ ] **HEAT-02**: User sees each HeatRisk category attributed to the correct day, with catalog items sorted by valid time rather than array order
- [ ] **HEAT-03**: User sees a real value rather than `NoData`, via Web Mercator reprojection of their coordinates before the identify call
- [ ] **HEAT-04**: User sees the current mosaic tile, not a stale duplicate, when the response contains repeated valid times

### Cross-Source Merge and Precedence

- [ ] **MERGE-01**: User sees each hazard placed on the day its valid-time window actually covers, via a normalization layer that reconciles SPC's 12Z–12Z, the Hazards Outlook's 00Z–00Z, and ERO Day 1's 01Z–12Z conventions
- [ ] **MERGE-02**: User sees SPC's granular convective risk instead of WPC's derived Severe Weather flag, suppressed by a hazard-dimension-scoped rule validated against live payloads — never by label-string matching
- [ ] **MERGE-03**: User sees HeatRisk's 5-level scale instead of WPC's binary Hazardous Heat flag
- [ ] **MERGE-04**: User does not lose a distinct hazard to over-merging, nor see the same hazard twice from under-merging

### Unified Day Report

- [ ] **RPT-01**: User sees one block per day merging all enabled sources, replacing the current per-product row sections
- [ ] **RPT-02**: User sees a compact single line per day by default, with all of that day's hazards inline
- [ ] **RPT-03**: User sees per-day hazards expanded into source-labeled sub-rows when `dayReportDetail` is enabled
- [ ] **RPT-04**: User sees non-day-scoped items — Mesoscale Discussions, MPDs, and window-spanning Hazards Outlook entries — in a separate band below the day blocks
- [ ] **RPT-05**: User sees a correct empty state when no hazard is active from any enabled source
- [ ] **RPT-06**: User sees every previously shipped display behavior preserved — the combinatorial no-risk gate and all proximity badge modes from BUG-01..04, FWXT-01..05, PROX-01..06, PROXUI-01..05
- [ ] **RPT-07**: User's frontend renders both detail levels from a backend-computed payload without re-deriving precedence

### Configuration and Performance

- [ ] **CFG-01**: User enables each new product independently via its own boolean, all defaulting to false
- [ ] **CFG-02**: User's existing SPC and fire weather configuration continues to work, with the `extended` flag no longer gating the payload shape
- [ ] **PERF-01**: User's Pi issues the new product fetches concurrently rather than sequentially, bounding cold-cache startup latency
- [ ] **PERF-02**: User's ETag/SHA256 cache stays effective, via consistent ArcGIS query-string construction that does not multiply cache keys
- [ ] **PERF-03**: User sees a measured cold-cache latency figure on target hardware before the milestone closes

### Data Integrity

- [ ] **DATA-01**: User's coordinates are always evaluated against WGS84 geometry, with `f=geojson` requested for every ArcGIS endpoint and no raw `f=json` fallback path
- [ ] **DATA-02**: User sees a stale indicator that accounts for the Hazards Outlook's Mon–Fri-only cadence, without false-alarming every weekend
- [ ] **DATA-03**: Each product uses its own label-to-value vocabulary, with no mapping reused across products

## Future Requirements

Deferred to v2.x. Tracked but not in this roadmap.

### Winter Detail

- **WSSIX-01**: User sees the four additional WSSI component layers beyond Overall Impact

### Merge Refinement

- **MERGEX-01**: User sees proximity weighting extended to the new WPC/CPC products
- **MERGEX-02**: User configures precedence rules rather than accepting the built-in table

### Coverage

- **COVX-01**: User sees National Flood Outlook data, restoring the Flooding hazard dimension from a properly researched source

## Out of Scope

| Feature | Reason |
|---------|--------|
| Legacy row layout / `legacyLayout` toggle | Explicit v2.0 decision — day report is the new default with a single render path; a third render state would need permanent maintenance and double UAT |
| Byte-identity invariant carried forward from v1.2 | The display restructure is intentionally breaking; retaining byte-identity contradicts the milestone's purpose |
| Flooding sub-label from the Hazards Outlook | Sourced from the National Flood Outlook, a 7th unresearched product; including it would misattribute data. Deferred to COVX-01 |
| Drought / Rapid Onset Drought sub-labels | Slow-onset and non-actionable for a live risk display; filtering is required at parse time regardless |
| WSSI 5-component breakdown | Roughly triples WSSI layer count (3 → ~15) for detail beyond Overall Impact. Deferred to WSSIX-01 |
| Cold hazards and non-convective high wind, Days 1–2 | Structural gap in NOAA's own product suite — the Hazards Outlook starts at Day 3 by definition. Documented as accepted, not a defect |
| Automated test framework | Project-wide verification strategy is manual UAT plus static analysis; `workflow.nyquist_validation` disabled |
| Third-party weather APIs | NOAA SPC/WPC/CPC first-party endpoints only |
| Proximity weighting for new products | Stays SPC-convective-only this milestone. Deferred to MERGEX-01 |
| Server-side spatial point filtering | Never tested by research; a cheap future spike, not a v2.0 dependency |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| CFG-01 | Phase 14 | Pending |
| CFG-02 | Phase 14 | Pending |
| DATA-01 | Phase 14 | Pending |
| PERF-02 | Phase 14 | Pending |
| ERO-01 | Phase 14 | Pending |
| ERO-02 | Phase 14 | Pending |
| ERO-03 | Phase 14 | Pending |
| WSSI-01 | Phase 15 | Pending |
| WSSI-02 | Phase 15 | Pending |
| WSSI-03 | Phase 15 | Pending |
| MPD-01 | Phase 15 | Pending |
| MPD-02 | Phase 15 | Pending |
| MPD-03 | Phase 15 | Pending |
| MPD-04 | Phase 15 | Pending |
| HAZ-01 | Phase 16 | Pending |
| HAZ-02 | Phase 16 | Pending |
| HAZ-03 | Phase 16 | Pending |
| HAZ-04 | Phase 16 | Pending |
| DATA-02 | Phase 16 | Pending |
| HEAT-01 | Phase 17 | Pending |
| HEAT-02 | Phase 17 | Pending |
| HEAT-03 | Phase 17 | Pending |
| HEAT-04 | Phase 17 | Pending |
| PERF-01 | Phase 17 | Pending |
| DATA-03 | Phase 17 | Pending |
| MERGE-01 | Phase 18 | Pending |
| MERGE-02 | Phase 18 | Pending |
| MERGE-03 | Phase 18 | Pending |
| MERGE-04 | Phase 18 | Pending |
| RPT-07 | Phase 18 | Pending |
| PERF-03 | Phase 18 | Pending |
| RPT-01 | Phase 19 | Pending |
| RPT-02 | Phase 19 | Pending |
| RPT-03 | Phase 19 | Pending |
| RPT-04 | Phase 19 | Pending |
| RPT-05 | Phase 19 | Pending |
| RPT-06 | Phase 19 | Pending |

**Coverage:**
- v2.0 requirements: 37 total (corrected from initial header count of 34 — recount of the checklist above found 37 distinct REQ-IDs)
- Mapped to phases: 37
- Unmapped: 0 ✓

---
*Requirements defined: 2026-08-15*
*Roadmap mapping completed: 2026-08-15*
