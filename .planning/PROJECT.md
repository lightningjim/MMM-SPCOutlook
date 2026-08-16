# MMM-SPCOutlook

## What This Is

A MagicMirror² module that uses geospatial math (turf.js) to determine whether the user's configured location falls within any active SPC (Storm Prediction Center) Convective Outlook risk zone, Fire Weather Risk area, or Mesoscale Discussion. It fetches live GeoJSON/KMZ data from NOAA SPC endpoints, runs point-in-polygon analysis on the backend, and renders risk levels with weather icons on the MagicMirror display. Runs on a Raspberry Pi-based MagicMirror. Shipped v1.2 with stale-data freshness indicator and opt-in distance-weighted proximity badges for adjacent-tier risk awareness.

## Core Value

Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.

## Requirements

### Validated

- ✓ Module fetches live SPC Convective Outlook data (Days 1–8) from NOAA endpoints — existing
- ✓ Point-in-polygon detection using turf.js determines if configured lat/lon is within any outlook polygon — existing
- ✓ Risk level displayed with color coding and weather icons (tornado, hail, wind) — existing
- ✓ Configurable update interval, coordinates, and extended (Day 4–8) toggle — existing
- ✓ Mesoscale Discussion detection via ActiveMD.kmz — existing
- ✓ Fire Weather Risk detection — existing
- ✓ MagicMirror socket notification architecture (GET_SPC_DATA / SPC_DATA_RESULT) — existing
- ✓ SIGN detection fix (double-arrow syntax, BUG-01) — v1.0
- ✓ Day 8 return object fix (BUG-02) — v1.0
- ✓ day48Risk OR condition fix (BUG-03) — v1.0
- ✓ checkInPolygon full-iteration fix (BUG-04) — v1.0
- ✓ CIG1/CIG2/CIG3 tier support with ①②③ visual indicators (SPC-01, SPC-02) — v1.0
- ✓ Fire Weather Outlook fetch, detection, and display (FIRE-01, FIRE-02, FIRE-03) — v1.0
- ✓ GeoJSON caching with ETag/SHA256 — no redundant turf calls (PERF-01, PERF-02) — v1.0
- ✓ fetchAndEvaluateHazard DRY refactor; zero var/console/dead code (QUAL-01–04) — v1.0
- ✓ Day 3–8 fire weather endpoint URLs confirmed live (all 12 HTTP 200); DN-based parsing strategy documented (FWXT-05) — v1.1
- ✓ `getSpcOutlook()` fetches Day 3–8 fire weather via `fetchGeoJsonCached`, evaluates via DN-based parsing, populates `day3Risk`–`day8Risk` + `day3Text`–`day8Text` in both return paths (FWXT-01, FWXT-02, FWXT-04) — v1.1
- ✓ Display per-day fire weather rows for Days 3–8, shown only when that day's risk > 0; no-risk guard extended to include Day 3–8 checks (FWXT-03) — v1.1
- ✓ Backend `_isWithinStaleWindow` honors user-configured `updateInterval` threaded via `GET_SPC_DATA` payload (STALE-01) — v1.2
- ✓ `⚠ Stale — N minutes ago` indicator at top of module wrapper, sourcing relative time from `_staleAsOf` via vendored `moment` global (STALE-02, STALE-03) — v1.2
- ✓ `computeProximity()` distance-weighted helper with linear 40 km falloff and boundary-safe strict cap (PROX-01) — v1.2
- ✓ `proximityWeighting` boolean threaded frontend → backend via both `GET_SPC_DATA` payloads with strict-true coerce; default false (PROX-02) — v1.2
- ✓ Per-`dayN` proximity subtree (categorical + per-hazard CIG entries) emitted for Day 1–3 when flag is on; default-off remains byte-identical (PROX-03, PROX-04, PROX-06) — v1.2
- ✓ `_geoJsonCache` polygon→line memoization via `deriveLinesIfMissing` for O(1) per-render cost (PROX-05) — v1.2
- ✓ Inside-tier `→ ENH 0.7`, outside-tier `0.6 (near SLGT)`, per-hazard CIG glyph (`①②③`), and Day 3 dual-badge with semicolon separator (PROXUI-01..04) — v1.2
- ✓ Noise-floor flicker suppression at `PROX_MIN_WEIGHT = 0.1` with `weight.toFixed(1)` rounding (PROXUI-05) — v1.2

### Active

## Current Milestone: v2.0 WPC & CPC Integration + Unified Day Report

**Goal:** Extend the module beyond SPC to WPC and CPC hazard products, and restructure the display from per-product row sections into a unified per-day report that merges and deduplicates all sources.

**Target features:**

*New data sources:*
- [ ] WPC Day 3–7 US Hazards Outlook
- [ ] CPC Day 8–14 US Hazards Outlook
- [ ] WPC Excessive Rainfall Outlook (Days 1–3)
- [ ] WPC Winter Weather Outlook (Days 1–3)
- [ ] WPC Mesoscale Precipitation Discussion (analog to existing SPC MD handling)
- [ ] NWS/WPC HeatRisk (approach determined by research — raster product, needs point-queryable endpoint)

*Display restructure:*
- [ ] Unified day report replacing per-product sections — one block per day merging severe, fire, rainfall, winter, and extended hazards
- [ ] Detail toggle — off (default): compact single line per day; on: per-day block expanded into source-labeled sub-rows
- [ ] Cross-source deduplication via precedence table (better source supersedes coarser one on same hazard/day)

### Out of Scope

- Mobile app or web interface — MagicMirror display module only
- Push notifications or alerts — display only
- Historical outlook data — live/current data only
- Non-SPC weather data sources — SPC products only
- Automated test framework — manual UAT and static analysis is the project's verification strategy; `workflow.nyquist_validation` disabled
- Per-row staleness UX — would require backend stale-aggregation refactor (deferred from v1.2)
- Proximity weighting for Fire Weather (Day 1–8) and Convective Day 4–8 (deferred from v1.2)
- User-configurable `proximityMaxKm` and `proximityMinWeight` knobs (deferred from v1.2)
- Trend / predictive proximity — would require payload history (deferred from v1.2)

## Context

**Shipped v1.2 — 2026-05-03**
- 3 phases (11–13), 8 plans, 17 tasks, 36 commits over ~8 days
- +333 insertions / -43 deletions across `MMM-SPCOutlook.js` and `node_helper.js`
- All 14 v1.2 requirements satisfied (STALE-01..03, PROX-01..06, PROXUI-01..05)
- Verification: 6/6 cross-phase boundaries WIRED, 5/5 E2E flows PASS, 7/7 live UAT tests pass

**Shipped v1.1 — 2026-03-21**
- 1,029 LOC total: `node_helper.js` (895 lines), `MMM-SPCOutlook.js` (134 lines)
- 3 phases (8–10) executed in 1 day; +92 insertions across 2 files
- Completed Fire Wx Outlook Expansion: all 5 FWXT requirements satisfied

**Shipped v1.0 — 2026-03-12**
- 942 LOC total: `node_helper.js` (825 lines), `MMM-SPCOutlook.js` (117 lines)
- Tech stack: MagicMirror² framework, Node.js, turf.js v7.2.0, KMZ/KML parsing for MDs
- 7 phases executed via GSD workflow over 8 days (2026-03-04 → 2026-03-12)
- All 15 v1 requirements satisfied; 4 prior integration defects resolved post-audit

**Known tech debt / accepted artifacts:**
- Documented visual artifacts on per-hazard rows when proximity badges fire: double-space `②  →` between `cigLabel` and `proximityBadge`, missing space before percent `5%`. Accepted per Phase 13 CONTEXT.md deferred section; revisit if live readability complaints arise.
- Human runtime verification pending for extended fire weather rows (requires live fire weather season data) — deferred from v1.1.
- 4 residual human-needed edge cases on stale indicator (D-11 invalid timestamp, D-12 clock-skew, non-default `updateInterval` end-to-end, branch-isolation in Loading/Error/No-Risk) — recorded in `11-VERIFICATION.md`.

## Constraints

- **Platform**: Raspberry Pi — keep CPU usage low; avoid blocking the event loop
- **Framework**: MagicMirror² — must comply with module API conventions
- **Dependencies**: Minimize changes to dependency tree; turf.js stays
- **Data sources**: NOAA SPC, WPC, and CPC endpoints only — no third-party weather APIs (widened from SPC-only in v2.0)

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Use turf.js for polygon math | Industry standard, already integrated, accurate | ✓ Good |
| Process in node_helper (backend) | Keeps heavy math off the browser/render thread | ✓ Good |
| Cache polygon math results per URL | Avoid re-running turf on every update cycle if data hasn't changed | ✓ Good — ETag/SHA256 dual strategy |
| CIG tiers as integers (0/1/2/3) | Consistent with fire weather tier encoding; cigLabel() handles display | ✓ Good |
| Each CIG hazard has its own endpoint | cigtorn/cighail/cigwind are separate GeoJSON files from SPC | ✓ Good |
| Fire weather fetch unconditionally before extended branch | Both return paths need fireWeather object | ✓ Good |
| ETag-first, SHA256-hash fallback | If server sends ETags, skip hash CPU cost; otherwise hash raw text body | ✓ Good |
| fetchAndEvaluateHazard shared function | 6 identical Day1/Day2 tor/hail/wind blocks → single helper with CIG passthrough | ✓ Good |
| DN-based parsing for Day 3–8 fire weather | LABEL field contains "D3"/"D6" day identifier, not risk level; DN=5/8/10 encodes risk | ✓ Good — confirmed via live endpoint inspection |
| Day 3–8 fire rows via loop in getDom() | `for (let d = 3; d <= 8; d++)` with per-day `dayNRisk > 0` guard — clean and DRY | ✓ Good |
| Reuse `fireRiskToColor()` for Day 3–8 display | Same risk-to-color mapping as Day 1–2; no new logic needed | ✓ Good |
| Thread `updateInterval` via `GET_SPC_DATA` payload + persist on `this._updateInterval` (v1.2) | Backend has no `this.config`; payload threading is the minimal correct fix for STALE-01 | ✓ Good |
| One-shot fallback log via `_loggedIntervalFallback` flag (v1.2) | Avoids log flooding when a misconfigured caller repeatedly omits the field | ✓ Good |
| Linear falloff with 40 km cutoff for proximity (v1.2) | Matches SPC's documented neighborhood radius for probabilistic→categorical conversion | ✓ Good |
| Boundary-safe strict cap via `turf.booleanPointInPolygon` pre-check (v1.2) | turf spherical `pointToLineDistance` returns ~3m epsilon for points on straight polygon edges; pre-check catches boundary AND interior cases robustly | ✓ Good |
| Strict-true coerce (`=== true`) for `proximityWeighting` at destructure boundary (v1.2) | Mitigates type-confusion: only literal `true` enables proximity, all other values resolve to `false` | ✓ Good |
| Default-off byte-identity via null-omission spread (v1.2) | When flag is false, `buildProximitySubtree({all-null})` returns `{}`, payload shape byte-identical to pre-v1.2 | ✓ Good |
| Cache-level memoization split: eager-on-miss + lazy-on-toggle via `deriveLinesIfMissing` (v1.2) | PROX-05 amortized O(1)-per-render; lazy fill when flag flips on after a cache hit | ✓ Good |
| `proximityBadge(prox, mode)` helper centralizes formatting (v1.2) | All 10 frontend call sites route through one helper; D-13 noise floor and D-04 toFixed(1) live in one place | ✓ Good |
| Day 3 dual-badge nested INSIDE colored span with semicolon separator (v1.2) | Single coherent visual element; separator only appears when both badges non-empty | ✓ Good |
| Disabled `workflow.nyquist_validation` for this project (v1.2) | REQUIREMENTS.md explicitly out-of-scopes automated test framework; manual UAT + static analysis is the verification strategy | ✓ Good |
| Widen data sources to SPC + WPC + CPC (v2.0) | Milestone goal requires WPC/CPC hazard products; all remain NOAA first-party endpoints, so the "no third-party APIs" spirit holds | — Pending |
| Unified day report becomes the default display, no legacy path (v2.0) | Merging sources per-day is the milestone's point; dual render paths in `getDom()` would need permanent maintenance and double UAT. Major version bump covers the breaking display change | — Pending |
| Default-off byte-identity invariant does NOT carry forward past v1.2 (v2.0) | The v2.0 display restructure is intentionally breaking; retaining byte-identity would require a third render state | — Pending |
| Single `updateInterval` for all new products, ETag-gated (v2.0) | ETag/SHA256 cache already skips turf work when data is unchanged, so slow-updating products cost ~one conditional GET per cycle — keeps RPi cost near-flat without a per-product scheduler | — Pending |
| Per-product config toggles, all default false (v2.0) | Users opt into each new data source independently; contains row-count growth in active patterns | — Pending |
| Cross-source precedence table derived from research, not assumed (v2.0) | The actual overlap set across 6 WPC/CPC products and SPC is unknown; seed example is SPC convective superseding the WPC thunderstorm hazard | — Pending |

## Evolution

This document evolves at phase transitions and milestone boundaries.

**After each milestone** (via `/gsd:complete-milestone`):
1. Full review of all sections
2. Core Value check — still the right priority?
3. Audit Out of Scope — reasons still valid?
4. Update Context with current state

---
*Last updated: 2026-08-15 — v2.0 WPC & CPC Integration + Unified Day Report started*
