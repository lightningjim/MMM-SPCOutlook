# Milestones

## v2.0 WPC & CPC Integration + Unified Day Report (Shipped: 2026-09-12)

**Phases completed:** 7 phases (14–19.1), 67 plans, 175 tasks
**Timeline:** 2026-08-15 → 2026-09-12 (28 days, 600 commits)
**LOC:** +24,109 / −547 across 12 files; `node_helper.js` 5,516 lines, `MMM-SPCOutlook.js` 1,634 lines
**Requirements:** 37/37 Complete
**Known deferred items at close:** 4 (see STATE.md Deferred Items)

**Delivered:** The module grew from an SPC-only outlook reader into a six-product NOAA hazard
aggregator (SPC categorical + fire weather, WPC ERO, WSSI, SPC MD / WPC MPD advisories,
WPC/CPC Days 3–14 Hazards Outlook, NWS HeatRisk), and its display was rebuilt from stacked
per-product row sections into a single merged per-day report with cross-source deduplication
and precedence resolved in the backend.

**Key accomplishments:**

- **Product registry foundation (Phase 14)** — New `productRegistry.js` with a host-allowlisted,
  byte-stable ArcGIS query builder and a `kind` discriminator (`arcgis-day-layers`,
  `kml-advisory`, `raster-identify`) that every later product reuses. The `if (!extended)`
  early-return fork was removed from `getSpcOutlook`, so the backend now always emits one payload
  shape and `extended` gates only which fetches run — not what the payload looks like.
- **Five new NOAA products (Phases 14–17)** — WPC Excessive Rainfall Outlook Days 1–5; WSSI
  Overall Impact Days 1–3; SPC Mesoscale Discussions and WPC Mesoscale Precipitation Discussions
  (discovered from WPC's raw Apache directory listing, with each candidate's own `ValidEndTi` —
  never its filename number — deciding liveness, rejecting 8-month-stale stragglers); WPC Day 3–7 /
  CPC Day 8–14 Hazards Outlook with per-day entries plus a separate window-labelled band for
  hazards carrying no per-day resolution; and NWS HeatRisk Days 1–7 via raster identify. Each sits
  behind its own `products.*` toggle, default off.
- **Cadence-aware staleness and a real latency budget (Phases 16–17)** — The stale indicator
  learned the Hazards Outlook's weekday-only issuance (84h `maxDataAgeHours`), so a Friday file
  read on Sunday is not falsely flagged. All new product fetches were parallelized, so cold-start
  time no longer grows linearly as toggles are enabled; PERF-01 was closed against a measured
  cold-cache number, not an estimate.
- **Merge, precedence and a single precomputed payload (Phase 18)** — Every hazard is attributed
  to the day its valid-time window actually covers rather than the day it was polled; duplicate and
  superseded hazards across sources collapse through one precedence ladder; and the backend emits
  one precomputed payload the display consumes without recomputing anything. 16 plans, the largest
  phase in the project's history.
- **Unified day report (Phases 19, 19.1)** — `getDom()` rewritten from per-product sections into
  one merged block per day, compact by default and expandable via a detail toggle, verified for
  behaviour parity against four milestones of accumulated display logic. Phase 19.1 then closed the
  three defects 19's UAT found: the detail-mode width overflow, SPC-only user-facing copy, and
  silently-ignored config keys.
- **The width fix was a mechanism replacement, not a tuning pass (Phase 19.1)** — Character-advance
  column alignment required a monospace stream, and 450px of DejaVu Sans Mono at the host's 20px
  root fits ~37 characters against a 54-character column contract, so no `rem` cap could ever have
  satisfied it. CSS grid tracks removed that coupling, and the cap was re-derived
  available-space-first (`1020 − 540 − 30 = 450px` → `REGION_CAP_REM = 22.5`). It was correct as
  derived — plan 19.1-09 shipped zero code changes.
- **Offline mutation-proven probe suite** — `scripts/probe-payload-resilience.js` plus
  `scripts/probe-lib/module-stubs.js` grew to a dependency-free, zero-network Node harness running
  191 scenarios at close, each mutation-proven, reproducing regressions in one command with no
  installed packages.

**Standing rule established:** a passing live check makes a layout claim TRUE, never
machine-checkable. No headless DOM implements CSS layout, so `19.1-UI-SPEC.md`'s Verification
Honesty rows are `MANUAL ONLY` permanently — any future change to the region cap or the grid
mechanism requires another human looking at real hardware.

### Known Gaps

None blocking. Milestone audit status `tech_debt`: 0 blockers, 37/37 requirements code-wired and
phase-verified, 1/1 E2E flow traced unbroken, 4 integration warnings and 3 info items accepted.
Principal carried debt:

- The window band and the day grid disagree about day numbers for 12 of every 24 hours — the band
  was never re-anchored to 12Z in Phase 18.
- Phase 19 legacy-payload retirement deferred by operator (2026-09-07). It is not a pure deletion:
  the RPT-04 window band is produced inside the legacy `hazardsOutlook` block and 3 helpers must be
  extracted first, and `advisories` — initially mis-listed as dead — is the sole transport for the
  MPD/SPC MD band.
- 23 live-observation deferrals across Phases 14–19.1, each with a documented reason (seasonal
  WSSI, event-gated MPD/ERO, location-gated products).
- The `rpt01` sole-render-path guard is a literal string scan; bracket/destructure/alias access
  would evade it (zero violations at HEAD).

---

## v1.2 QoL Enhancements (Shipped: 2026-05-03)

**Phases completed:** 3 phases, 8 plans, 17 tasks
**Timeline:** 2026-04-25 → 2026-05-03 (~8 days, 36 commits)
**LOC:** +333 / -43 across `MMM-SPCOutlook.js` and `node_helper.js`

**Key accomplishments:**

- **STALE-01** — Backend `_isWithinStaleWindow` corrected to honor user-configured `updateInterval` threaded via `GET_SPC_DATA` payload; fixed latent 60-min default bug.
- **STALE-02/03** — Frontend `⚠ Stale — N minutes ago` indicator at top of module wrapper, sourcing relative time from `_staleAsOf` via vendored `moment` global with `isFinite` guard and clock-skew short-circuit.
- **PROX-01..06** — Distance-weighted proximity backend: `computeProximity()` with linear 40 km falloff and boundary-safe strict cap, polygon→line cache memoization (`deriveLinesIfMissing`), additive `dayN.proximity` subtree emission for Day 1–3 categorical + per-hazard CIG, gated by `proximityWeighting` (default off).
- **PROXUI-01..05** — Frontend proximity badges: inside-tier `→ ENH 0.7`, outside-tier `0.6 (near SLGT)`, per-hazard CIG glyphs (`①②③`), Day 3 dual-badge with semicolon separator inside colored span, noise-floor flicker suppression at `PROX_MIN_WEIGHT = 0.1`.
- **Default-off byte-identity invariant** — With `proximityWeighting:false` (default), DOM and payload shape are byte-identical to pre-v1.2; verified end-to-end via static analysis, behavioral simulation, and live MagicMirror² UAT.
- **Verification artifacts** — `11/12/13-VERIFICATION.md` (each 4–5/5 truths verified), `13-UAT.md` (7/7 live tests pass), `v1.2-MILESTONE-AUDIT.md` (6/6 cross-phase boundaries WIRED, 5/5 E2E flows PASS).

---

## v1.1 Fire Wx Outlook Expansion (Shipped: 2026-03-21)

**Phases completed:** 3 phases, 3 plans, 6 tasks

**Key accomplishments:**

- All 12 Day 3-8 SPC categorical fire weather GeoJSON endpoints confirmed HTTP 200; DN=5/8/10 parse strategy required (LABEL contains day identifier "D3"/"D6", not risk level)
- Day 3-8 fire weather fetch loop added to getSpcOutlook() using DN-based parsing via exper/fire_wx windrhcat/drytcat endpoints, populating day3Risk-day8Risk in both fireWeather return paths
- Day 3-8 fire weather rows added to getDom() with per-day conditional rendering and extended no-risk guard covering all 8 fire weather days

---

## v1.0 Refactor and Feature Update (Shipped: 2026-03-12)

**Phases completed:** 7 phases, 13 plans, 0 tasks

**Key accomplishments:**

- (none recorded)

---
