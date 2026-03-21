# Roadmap: MMM-SPCOutlook

## Milestones

- ✅ **v1.0 Refactor and Feature Update** — Phases 1–7 (shipped 2026-03-12)
- 🚧 **v1.1 Fire Wx Outlook Expansion** — Phases 8–10 (in progress)

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

### 🚧 v1.1 Fire Wx Outlook Expansion (In Progress)

**Milestone Goal:** Extend fire weather coverage to Days 3–8 using SPC DryT/WindRH GeoJSON endpoints, gated behind `extended` flag, with per-day display only when risk is present.

- [ ] **Phase 8: URL Verification** — Confirm Day 3–8 fire weather endpoint URLs exist and document schema
- [ ] **Phase 9: Backend Implementation** — Fetch and evaluate extended fire weather; populate return object
- [ ] **Phase 10: Display Implementation** — Render per-day fire weather rows for Days 3–8 in getDom

## Phase Details

### Phase 8: URL Verification
**Goal**: Day 3–8 fire weather endpoint URLs are confirmed live and GeoJSON schema is documented before any fetch code is written
**Depends on**: Phase 7 (v1.0 complete)
**Requirements**: FWXT-05
**Success Criteria** (what must be TRUE):
  1. All 12 Day 3–8 endpoint URLs (WindRH + DryT, days 3–8) have been checked and return HTTP 200, or a fallback URL strategy is documented
  2. At least one live Day 3–8 GeoJSON file has been inspected and `properties.LABEL` values confirmed as categorical (ELEV/CRIT/EXTM)
  3. Endpoint URL findings are documented in a verification artifact before any Phase 9 code is written
**Plans**: TBD

### Phase 9: Backend Implementation
**Goal**: `getSpcOutlook()` populates `day3Risk`–`day8Risk` fields in the fireWeather return object when `extended: true`, with zeros in the non-extended return path
**Depends on**: Phase 8
**Requirements**: FWXT-01, FWXT-02, FWXT-04
**Success Criteria** (what must be TRUE):
  1. When `extended: true`, the socket result object contains `day3Risk` through `day8Risk` fields with correct integer risk values (0–3)
  2. When `extended: false`, the socket result object contains `day3Risk` through `day8Risk` fields all equal to 0 (no undefined reads)
  3. Each Day 3–8 fire weather fetch uses `fetchGeoJsonCached` — no uncached HTTP calls
  4. A location known to be in a Day 3 or Day 4 fire weather risk area returns a non-zero risk value
**Plans**: TBD

### Phase 10: Display Implementation
**Goal**: MagicMirror display renders per-day fire weather rows for Days 3–8, shown only when that day's risk is greater than zero
**Depends on**: Phase 9
**Requirements**: FWXT-03
**Success Criteria** (what must be TRUE):
  1. With `extended: true` and non-zero risk on a given day, a labeled row for that day appears in the fire weather section of the display
  2. With `extended: true` and zero risk for all Days 3–8, no extended fire weather rows appear
  3. The no-risk guard (`day1Risk > 0 || day2Risk > 0`) is extended to include Day 3–8 risks so a user with only extended fire weather risk does not see "No Severe Weather Risk"
  4. With `extended: false`, no Day 3–8 rows appear regardless of data
**Plans**: TBD

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
| 8. URL Verification | v1.1 | 0/? | Not started | - |
| 9. Backend Implementation | v1.1 | 0/? | Not started | - |
| 10. Display Implementation | v1.1 | 0/? | Not started | - |
