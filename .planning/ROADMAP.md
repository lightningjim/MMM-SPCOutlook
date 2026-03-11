# Roadmap: MMM-SPCOutlook

## Overview

This milestone refactors and repairs the MMM-SPCOutlook MagicMirror module. The work progresses from correctness (fixing known bugs in risk detection) through new capability (CIG tier support, fire weather) and optimization (polygon math caching) to a final code quality pass. Each phase delivers a verifiable improvement to what the display shows and how reliably it computes.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: Bug Fixes** - Correct the four known backend logic errors causing wrong risk data (completed 2026-03-04)
- [x] **Phase 2: CIG Tier Support** - Update SIGN handling to reflect SPC's new CIG1/CIG2/CIG3 severity system (completed 2026-03-05)
- [x] **Phase 3: Fire Weather** - Add end-to-end fire weather fetch, detection, and display (completed 2026-03-05)
- [x] **Phase 4: Performance** - Cache polygon math results to reduce RPi CPU load (completed 2026-03-08)
- [x] **Phase 5: Code Quality** - Clean up the codebase after all features and fixes are stable (completed 2026-03-09)
- [x] **Phase 6: Verify Phase 2** - Create Phase 2 VERIFICATION.md and fix wind CIG label cosmetic inconsistency to formally close SPC-01/SPC-02 (completed 2026-03-11)
- [ ] **Phase 7: Fix QUAL-02/QUAL-03 Residuals** - Fix implicit global in evaluatePolygons() and remove all dead/commented-out code blocks

## Phase Details

### Phase 1: Bug Fixes
**Goal**: The module displays correct risk data for all days with no false negatives from known logic errors
**Depends on**: Nothing (first phase)
**Requirements**: BUG-01, BUG-02, BUG-03, BUG-04
**Success Criteria** (what must be TRUE):
  1. Tornado, Hail, and Wind SIGN indicators appear on the display when SPC issues a significant risk for Days 1-2
  2. Day 8 shows Day 8 risk (not Day 7 risk) when extended mode is enabled
  3. The Day 4-8 aggregate indicator activates when any day in that range carries a risk
  4. When the user's location overlaps multiple active Mesoscale Discussions, all of them appear on the display (not just the first)
**Plans**: 2 plans

Plans:
- [ ] 01-01-PLAN.md — Fix BUG-01 (SIGN double-arrow), BUG-02 (Day 8 return object), BUG-03 (day48Risk condition) in getSpcOutlook()
- [ ] 01-02-PLAN.md — Fix BUG-04 (checkInPolygon early-return) so all MD features are evaluated

### Phase 2: CIG Tier Support
**Goal**: The module understands and displays the SPC's tiered SIGN severity levels (CIG1, CIG2, CIG3) as distinct risk indicators
**Depends on**: Phase 1
**Requirements**: SPC-01, SPC-02
**Success Criteria** (what must be TRUE):
  1. Backend correctly parses CIG1, CIG2, and CIG3 as distinct severity tiers from SPC GeoJSON
  2. The display renders each CIG tier visually distinct from the others (not identical icons/colors)
  3. CIG tiers behave correctly on both Days 1 and 2 convective outlooks
**Plans**: 2 plans

Plans:
- [ ] 02-01-PLAN.md — Replace SIGN extraction with CIG fetch+parse in node_helper.js; update return fields to torCig/hailCig/windCig integers
- [ ] 02-02-PLAN.md — Update getDom() in MMM-SPCOutlook.js to render CIG tiers with cigLabel() helper; human verification

### Phase 3: Fire Weather
**Goal**: Users in an active SPC Fire Weather risk zone see that risk displayed alongside convective outlook data
**Depends on**: Phase 1
**Requirements**: FIRE-01, FIRE-02, FIRE-03
**Success Criteria** (what must be TRUE):
  1. The module fetches Fire Weather Outlook GeoJSON from NOAA SPC endpoints on each update cycle
  2. Point-in-polygon detection correctly determines whether the configured location falls within a Fire Weather risk zone
  3. Fire Weather risk level is visible on the MagicMirror display when the user's location is in a risk zone
  4. Fire Weather data does not appear when the user's location is outside any active Fire Weather polygon
**Plans**: 2 plans

Plans:
- [ ] 03-01-PLAN.md — Add fire weather fetch and point-in-polygon evaluation to node_helper.js; fireWeather in both return objects
- [ ] 03-02-PLAN.md — Add fire weather display rows and extend no-risk guard in getDom(); human verification

### Phase 4: Performance
**Goal**: Polygon math does not repeat unnecessarily within or between update cycles, reducing CPU load on the Raspberry Pi
**Depends on**: Phase 3
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. When the same GeoJSON data is received on consecutive update cycles, turf point-in-polygon is not re-run (cached result is used)
  2. Within a single update cycle, no GeoJSON dataset is evaluated by turf more than once for the same location
**Plans**: 1 plan

Plans:
- [ ] 04-01-PLAN.md — Add per-URL GeoJSON cache (ETag/hash), wire fetchGeoJsonCached into getSpcOutlook(), fix Days 4-8 single-pass extractPolygons and sigComparator bug; human verification

### Phase 5: Code Quality
**Goal**: The codebase is clean, consistent, and free of debugging artifacts — ready for future maintenance
**Depends on**: Phase 4
**Requirements**: QUAL-01, QUAL-02, QUAL-03, QUAL-04
**Success Criteria** (what must be TRUE):
  1. Day 1 and Day 2 Tornado/Hail/Wind fetch-and-process logic is handled by a single shared function (no copy-paste duplication)
  2. All variable declarations in node_helper.js and MMM-SPCOutlook.js use const or let — no var, no implicit globals
  3. Dead and commented-out code blocks are absent from node_helper.js
  4. No debug console.log calls remain in production code paths; all error output uses Log.error
**Plans**: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bug Fixes | 2/2 | Complete    | 2026-03-04 |
| 2. CIG Tier Support | 2/2 | Complete   | 2026-03-05 |
| 3. Fire Weather | 2/2 | Complete   | 2026-03-05 |
| 4. Performance | 1/1 | Complete   | 2026-03-08 |
| 5. Code Quality | 4/4 | Complete   | 2026-03-09 |
| 6. Verify Phase 2 | 1/1 | Complete   | 2026-03-11 |
| 7. Fix QUAL-02/QUAL-03 Residuals | 0/TBD | Pending | — |

### Phase 6: Verify Phase 2
**Goal:** Formally verify Phase 2 (CIG Tier Support) against its success criteria and close SPC-01/SPC-02; fix wind CIG label cosmetic inconsistency
**Depends on:** Phase 2
**Requirements:** SPC-01, SPC-02
**Gap Closure:** Closes gaps from audit — Phase 2 VERIFICATION.md missing (BLOCKER); wind CIG label placement cosmetic inconsistency (INTEG-04)
**Success Criteria** (what must be TRUE):
  1. 02-VERIFICATION.md exists and confirms SPC-01 and SPC-02 satisfied against Phase 2 success criteria
  2. Wind CIG label placement is consistent with tor/hail CIG label placement in MMM-SPCOutlook.js
**Plans**: 1 plan

Plans:
- [ ] 06-01-PLAN.md — Fix wind CIG label on MMM-SPCOutlook.js lines 75/86; author 02-VERIFICATION.md with file:line evidence closing SPC-01/SPC-02

### Phase 7: Fix QUAL-02/QUAL-03 Residuals
**Goal:** Eliminate the remaining code quality defects discovered post-Phase-5 — implicit global in production call path and dead/commented-out code blocks
**Depends on:** Phase 5
**Requirements:** QUAL-02, QUAL-03
**Gap Closure:** Closes gaps from audit — implicit global `result` in evaluatePolygons() (INTEG-01/QUAL-02 BLOCKER); commented-out function bodies checkDayCat/checkDayPerc/checkDaySign (INTEG-02/QUAL-03 BLOCKER); dead orphaned methods evaluatePolygonsWeighted and evaluatePolygonsContinuous (INTEG-03/QUAL-03)
**Success Criteria** (what must be TRUE):
  1. `node_helper.js` line 104 uses `const result =` (no implicit global)
  2. Lines 896–967 commented-out blocks for checkDayCat/checkDayPerc/checkDaySign are removed
  3. evaluatePolygonsWeighted and evaluatePolygonsContinuous dead methods are removed
  4. No remaining implicit globals or var declarations in node_helper.js
**Plans**: TBD
