# Requirements: MMM-SPCOutlook

**Defined:** 2026-03-04
**Core Value:** Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.

## v1 Requirements

Requirements for this refactor/rewrite milestone.

### Bug Fixes

- [ ] **BUG-01**: SIGN detection works correctly for Tornado/Hail/Wind on Days 1–2 (fix double-arrow syntax error)
- [ ] **BUG-02**: Day 8 displays Day 8 risk (not Day 7) when extended mode is enabled
- [ ] **BUG-03**: Day 4–8 aggregate risk (`day48Risk`) correctly reflects any risk across all five days
- [ ] **BUG-04**: Mesoscale Discussion detection collects all overlapping active MDs, not just the first

### SPC API Updates

- [ ] **SPC-01**: SIGN risk supports CIG1/CIG2/CIG3 tiered severity levels (replaces previous boolean SIGN)
- [ ] **SPC-02**: Module display renders CIG1/CIG2/CIG3 SIGN tiers visually (distinct from each other)

### Fire Weather

- [ ] **FIRE-01**: Module fetches SPC Fire Weather Outlook GeoJSON from NOAA endpoints
- [ ] **FIRE-02**: Point-in-polygon detection determines if user location is within a Fire Weather risk zone
- [ ] **FIRE-03**: Fire Weather risk level is displayed on the module alongside convective outlook data

### Performance

- [ ] **PERF-01**: Polygon math results are cached; turf is not re-run when underlying GeoJSON data hasn't changed
- [ ] **PERF-02**: No redundant turf point-in-polygon calls within a single update cycle

### Code Quality

- [ ] **QUAL-01**: Repeated Day 1/Day 2 Tornado/Hail/Wind fetch-and-process logic extracted into shared reusable function
- [ ] **QUAL-02**: All variable declarations use `const` or `let`; no implicit globals or `var`
- [ ] **QUAL-03**: Dead/commented-out code blocks removed from `node_helper.js`
- [ ] **QUAL-04**: Debug `console.log` calls removed from production code paths; errors use `Log.error`

## v2 Requirements

Deferred to future releases.

### Notifications

- **NOTF-01**: User receives system notification when entering a risk zone (not just display)

### Additional Products

- **PROD-01**: SPC Severe Thunderstorm Watch / Tornado Watch polygon detection

## Out of Scope

| Feature | Reason |
|---------|--------|
| Push / mobile notifications | Display-only module; MagicMirror is a local display |
| Historical outlook data | Live/current data only; no persistence layer |
| Non-SPC weather data | Scope is SPC products (convective outlook, fire weather, MDs) |
| Automated testing framework | No test infrastructure exists; not added in this pass |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| BUG-01 | — | Pending |
| BUG-02 | — | Pending |
| BUG-03 | — | Pending |
| BUG-04 | — | Pending |
| SPC-01 | — | Pending |
| SPC-02 | — | Pending |
| FIRE-01 | — | Pending |
| FIRE-02 | — | Pending |
| FIRE-03 | — | Pending |
| PERF-01 | — | Pending |
| PERF-02 | — | Pending |
| QUAL-01 | — | Pending |
| QUAL-02 | — | Pending |
| QUAL-03 | — | Pending |
| QUAL-04 | — | Pending |

**Coverage:**
- v1 requirements: 15 total
- Mapped to phases: 0
- Unmapped: 15 ⚠️ (to be filled by roadmapper)

---
*Requirements defined: 2026-03-04*
*Last updated: 2026-03-04 after initial definition*
