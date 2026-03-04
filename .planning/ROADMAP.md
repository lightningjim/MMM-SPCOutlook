/gs:# Roadmap: MMM-SPCOutlook

## Overview

This milestone refactors and repairs the MMM-SPCOutlook MagicMirror module. The work progresses from correctness (fixing known bugs in risk detection) through new capability (CIG tier support, fire weather) and optimization (polygon math caching) to a final code quality pass. Each phase delivers a verifiable improvement to what the display shows and how reliably it computes.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Bug Fixes** - Correct the four known backend logic errors causing wrong risk data
- [ ] **Phase 2: CIG Tier Support** - Update SIGN handling to reflect SPC's new CIG1/CIG2/CIG3 severity system
- [ ] **Phase 3: Fire Weather** - Add end-to-end fire weather fetch, detection, and display
- [ ] **Phase 4: Performance** - Cache polygon math results to reduce RPi CPU load
- [ ] **Phase 5: Code Quality** - Clean up the codebase after all features and fixes are stable

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
**Plans**: TBD

### Phase 3: Fire Weather
**Goal**: Users in an active SPC Fire Weather risk zone see that risk displayed alongside convective outlook data
**Depends on**: Phase 1
**Requirements**: FIRE-01, FIRE-02, FIRE-03
**Success Criteria** (what must be TRUE):
  1. The module fetches Fire Weather Outlook GeoJSON from NOAA SPC endpoints on each update cycle
  2. Point-in-polygon detection correctly determines whether the configured location falls within a Fire Weather risk zone
  3. Fire Weather risk level is visible on the MagicMirror display when the user's location is in a risk zone
  4. Fire Weather data does not appear when the user's location is outside any active Fire Weather polygon
**Plans**: TBD

### Phase 4: Performance
**Goal**: Polygon math does not repeat unnecessarily within or between update cycles, reducing CPU load on the Raspberry Pi
**Depends on**: Phase 3
**Requirements**: PERF-01, PERF-02
**Success Criteria** (what must be TRUE):
  1. When the same GeoJSON data is received on consecutive update cycles, turf point-in-polygon is not re-run (cached result is used)
  2. Within a single update cycle, no GeoJSON dataset is evaluated by turf more than once for the same location
**Plans**: TBD

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
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Bug Fixes | 1/2 | In Progress|  |
| 2. CIG Tier Support | 0/TBD | Not started | - |
| 3. Fire Weather | 0/TBD | Not started | - |
| 4. Performance | 0/TBD | Not started | - |
| 5. Code Quality | 0/TBD | Not started | - |
