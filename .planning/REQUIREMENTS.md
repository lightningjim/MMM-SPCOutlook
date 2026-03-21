# Requirements: MMM-SPCOutlook

**Defined:** 2026-03-21
**Core Value:** Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.

## v1.1 Requirements

### Fire Weather Extended

- [ ] **FWXT-01**: Module fetches Day 3–8 fire weather (WindRH + DryT) GeoJSON endpoints when `extended: true`
- [ ] **FWXT-02**: Point-in-polygon detection determines risk level for each Day 3–8 fire weather day
- [ ] **FWXT-03**: Display renders per-day fire weather rows for Days 3–8, shown only when day's risk > 0
- [ ] **FWXT-04**: Day 3–8 fire risk values present in both return object paths (non-extended gets zeros, extended gets live values)
- [x] **FWXT-05**: Live endpoint URL verification performed and documented before fetch code is written

## Future Requirements

### Fire Weather

- Stale data UI indicator for fire weather rows (backend `_stale`/`_staleAsOf` fields exist, frontend never surfaces them)

## Out of Scope

| Feature | Reason |
|---------|--------|
| Automated test framework | No test infrastructure; not planned for v1.1 |
| Push/alert notifications | Display only |
| Non-SPC weather data | SPC products only |
| Probabilistic fire weather display | SPC Day 3–8 fire wx is categorical (ELEV/CRIT/EXTM), not probabilistic |

## Traceability

| Requirement | Phase | Status |
|-------------|-------|--------|
| FWXT-05 | Phase 8 | Complete |
| FWXT-01 | Phase 9 | Pending |
| FWXT-02 | Phase 9 | Pending |
| FWXT-04 | Phase 9 | Pending |
| FWXT-03 | Phase 10 | Pending |

**Coverage:**
- v1.1 requirements: 5 total
- Mapped to phases: 5
- Unmapped: 0 ✓

---
*Requirements defined: 2026-03-21*
*Last updated: 2026-03-21 — traceability updated after roadmap creation*
