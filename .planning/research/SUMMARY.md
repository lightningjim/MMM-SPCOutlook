# Project Research Summary

**Project:** MMM-SPCOutlook
**Milestone:** v1.2 — QoL Enhancements (stale data UI + proximity-weighted risk)
**Domain:** MagicMirror² weather risk module — Node backend (turf.js geometry) + browser frontend over socket notifications
**Researched:** 2026-04-25
**Confidence:** HIGH

## Executive Summary

v1.2 ships two opt-in display improvements over the existing v1.1 backend: (1) a **stale data indicator** that surfaces the already-emitted `_stale`/`_staleAsOf` payload fields in the frontend, and (2) **proximity-weighted risk awareness** — when the configured location is inside a Convective Day 1–3 categorical or CIG tier, render a badge showing distance-weighted nearness to the next-higher tier (e.g. `ENH → MDT 0.75`); when outside all tiers, show a `0.6 (near MRGL)` form. Backend computes proximity via turf's `pointToLineDistance` against polygon-derived LineStrings; frontend stays a pure renderer.

**No new dependencies are required.** `@turf/turf ^7.2.0` (resolves to 7.3.4 in the lockfile) already exposes `polygonToLine`, `flatten`, `pointToLineDistance`, `booleanPointInPolygon`, and `distance`. `moment` is already vendored as a frontend global by MagicMirror² and is suitable for relative-time formatting on the stale indicator.

The dominant risks are silent data-shape and unit bugs, not architectural ones. Critical mitigations: (a) **fix the latent `_isWithinStaleWindow` bug** (it reads `this.config?.updateInterval` on `node_helper`, which never has a `config` — silently defaults to 60 regardless of user setting) **as a prerequisite to the stale phase**; (b) `pointToLineDistance` cannot consume MultiPolygon directly — wrap with `flatten` + `polygonToLine` + per-ring `Math.min`; (c) keep `[lon, lat]` coordinate order on every new turf call site; (d) suppress proximity badge when already inside the higher tier or when no higher tier polygon was issued for the day.

## Key Findings

### Recommended Stack

No additions. Backend math stays in `node_helper.js` using the already-imported `@turf/turf` umbrella package; frontend formats relative times using the framework-vendored `moment` global. Optionally declare `moment` in `peerDependencies` for documentation only — no install. See **STACK.md** for the rejected-alternatives table (d3-geo, date-fns, per-function turf submodules — all unnecessary).

**Core technologies (already present):**
- `@turf/turf` ^7.2.0 (resolved 7.3.4): polygon → line conversion, point-to-line distance — already integrated; no version bump
- `moment` (MM² runtime global): relative-time strings on stale indicator — framework convention; no install
- MagicMirror² socket notifications (`GET_SPC_DATA` / `SPC_DATA_RESULT`): existing transport for both new payload fields

### Expected Features

See **FEATURES.md**.

**Must have (table stakes for v1.2):**
- Stale indicator visible on display, gated on existing `_stale === true`
- `proximityWeighting: false` config flag (default off — zero regression for existing installs)
- Proximity computation for Day 1, Day 2, Day 3 categorical when enabled
- Proximity computation for Day 1/2 CIG tiers per hazard (tor/hail/wind) and Day 3 cigprob when enabled
- Inside-risk badge format: `CURR → NEXT W.W`
- Outside-risk badge format: `W.W (near TIER)`
- Linear falloff with **40 km cutoff**
- Suppress badge when no higher tier exists or weight ≤ noise threshold

**Should have (low-cost wins):**
- Tooltip on stale icon with relative last-fresh-fetch time
- Color the proximity badge by next-tier color (reuse existing color map)
- Round weight to 1 decimal

**Defer (v2+):**
- Per-row staleness (requires backend refactor of stale aggregation)
- Proximity for Fire Weather and Day 4–8
- Configurable `proximityMaxKm` / `proximityMinWeight` user knobs
- Trend / predictive proximity (needs payload history)

### Falloff Function — Recommendation

**Linear, 40 km cutoff:** `weight(d_km) = max(0, 1 - d_km / 40)`.

**Reconciliation note:** FEATURES.md recommends 40 km (matches SPC's documented neighborhood radius of ~25 mi / 40 km used to derive categorical from probabilistic outlooks). ARCHITECTURE.md mentioned `falloffKm = 50` as a "starting constant" but flagged it as an open Phase B design question. **Use 40 km** — it has explicit domain justification (SPC's own probabilistic-to-categorical conversion radius); 50 km does not. Expose as `PROXIMITY_MAX_KM = 40` constant in `node_helper.js`, with `PROXIMITY_UNITS = 'kilometers'` and `PROXIMITY_METHOD = 'geodesic'` siblings.

### Architecture Approach

See **ARCHITECTURE.md**.

Compute proximity **backend-side** in `node_helper.js`, cache results inside the existing `_geoJsonCache` entries (alongside the scalar `result`), gate everything behind a single module-level `proximityWeighting` boolean threaded from frontend to backend via the existing `GET_SPC_DATA` payload. Frontend reads a new `proximity` subtree on each `dayN` object and renders badges conditionally. Existing scalar fields stay untouched — additive shape only, zero breakage for current readers.

**Major components:**
1. **`computeProximity(items, loc, currentValue, comparator)` (NEW helper in `node_helper.js`)** — given a tier-bearing polygon set + current best value, finds nearest higher-tier polygon boundary and returns `{ weighted, neighborTier, neighborTierName, distanceKm, direction }` or `null`.
2. **`fetchAndEvaluateHazard` (MODIFIED)** — return shape extended with `proximity`; threading `proximityWeighting` flag through 6 Day1/Day2 call sites plus the inlined Day 3 cat/cig blocks.
3. **`_geoJsonCache` entry shape (MODIFIED, additive)** — entries store `{ value, proximity }` when proximity computed; reads must accept both old scalar and new object form.
4. **Frontend `getDom()` (MODIFIED)** — prepend stale indicator when `_stale`; append proximity badges inline via two small helpers.

### Critical Pitfalls

See **PITFALLS.md** for full list.

1. **Latent `_isWithinStaleWindow` config bug — PREREQ for stale phase.** `this.config?.updateInterval ?? 60` silently falls back to 60 because `this.config` is never set on `node_helper`. Stale window is therefore wrong for any user with a non-default `updateInterval`. Fix by threading `updateInterval` through the `GET_SPC_DATA` payload and storing on `this._updateIntervalMin`. **Do not surface stale UI on top of this bug** — it would mislead users at non-default intervals.
2. **`pointToLineDistance` does not accept MultiPolygon.** Wrap with `turf.flatten` → per-Polygon `turf.polygonToLine` → handle both LineString and MultiLineString returns → `Math.min` across rings. Cache the flattened-line representation on the cache entry.
3. **Don't compute distance when already inside the higher tier.** Reuse the `booleanPointInPolygon` result already produced by `evaluatePolygons`; if inside the higher tier, set `weight = 1.0` and skip distance math.
4. **Coordinate order is `[lon, lat]` everywhere in this codebase.** Pass already-constructed `loc` turf points into the new helper; never rebuild from raw lat/lon at new call sites.
5. **Graceful degrade when no higher tier polygon exists for the day.** Helper returns `null`; render guard suppresses the badge. Always the case inside HIGH; common on quiet days.
6. **Day 3 is inlined, not under `fetchAndEvaluateHazard`.** Coverage checklist: Day1/2 tor+hail+wind+CIG×3 + Day3 cat+cig = 14 surfaces. Easy to ship Day 1–2 with proximity and silently miss Day 3.

## Implications for Roadmap

### Phase 1: Stale Indicator (with prereq bugfix)
**Rationale:** Independent of proximity work; fixes a latent backend bug; ships visible user value first; de-risks the rest of v1.2 (if proximity slips, stale still ships).
**Delivers:**
- Pre-req: fix `_isWithinStaleWindow` to read `updateInterval` from socket payload.
- Frontend renders compact `⚠ Cached data — last updated <relative>` indicator at top of wrapper when `this.spcrisk._stale === true`.
- Optional: emit per-day `_stale` flags in payload (additive; foundation for future per-row UX).

### Phase 2: Proximity Backend Foundation
**Rationale:** Frontend cannot render what backend does not emit. Validates the math in isolation via payload logging before any UI is wired.
**Delivers:**
- New `computeProximity(items, loc, currentValue, comparator)` helper with linear-40km falloff.
- `proximityWeighting` flag threaded from `GET_SPC_DATA` payload through `getSpcOutlook` → `fetchAndEvaluateHazard` → Day 3 inlined blocks.
- `_geoJsonCache` entries extended additively to `{ value, proximity }` with backwards-compatible read helper.
- Per-`dayN` `proximity` subtree (`{ cat, torCig, hailCig, windCig, cig }`) emitted only when flag is on and meaningful.
- Cached flattened-line representation per polygon item.

### Phase 3: Proximity Frontend Render (Categorical + CIG)
**Rationale:** Wires the now-existing data into the display. Single phase covers categorical and CIG because rendering pattern is the same primitive applied at different injection points in `getDom()`.
**Delivers:**
- `defaults.proximityWeighting = false` and inclusion in `start()`'s socket payload.
- Inside-risk badges (`CURR → NEXT W.W`) appended after existing risk text on Day 1/2/3 categorical rows.
- Outside-risk badges (`W.W (near TIER)`) when current is NONE but a tier polygon is within 40 km.
- Per-hazard CIG badges (Day 1/2 torCig/hailCig/windCig; Day 3 cig) alongside existing `cigLabel` output.
- Display rounding to 1 decimal; suppress when weight < noise threshold.

### Phase Ordering Rationale

- **Phase 1 first:** independent, ships value standalone, fixes a latent bug, smallest blast radius.
- **Phase 2 before Phase 3** is mandatory — frontend has nothing to render without the data shape.
- **CIG folded into Phase 3** rather than a fourth phase: same render primitive, same data shape; adding it separately doubles ceremony without reducing risk. Split into Phase 4 only if Phase 3 estimate balloons during planning.

### Research Flags

Phases likely needing deeper research during planning: **None.** All four research files converge on a complete, internally consistent picture grounded in the actual codebase.

Phases with standard patterns (skip research-phase): **Phase 1, Phase 2, Phase 3** — all directly buildable from the existing four research files plus this synthesis.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Direct require() verification of all 7 target turf functions; lockfile inspection confirms 7.3.4; `moment` global confirmed via MM² docs |
| Features | HIGH (tier system, turf API) / MEDIUM (specific falloff function — reconciled to 40 km here) | SPC tier system grounded in NOAA docs |
| Architecture | HIGH | Full source read of `node_helper.js` and `MMM-SPCOutlook.js`; specific line numbers cited for every touch point |
| Pitfalls | HIGH (codebase-grounded) / MEDIUM (turf workaround patterns) | All 10 critical pitfalls reference specific lines in existing source |

**Overall confidence:** HIGH

### Gaps to Address

- **Falloff function constant** — use 40 km per FEATURES.md / SPC neighborhood radius. ARCHITECTURE.md's offhand `falloffKm = 50` should be ignored. Document the constant inline with rationale.
- **Outside-all-tiers polygon selection** — when computing "near MRGL" for a NONE point, use min distance across all MRGL polygons (only consider MRGL unless absent for that day).
- **Cap weighted value** — should `weighted` cross into the next tier integer? Spec implies no. Cap at `nextTier - 0.01` in the helper.
- **CIG cross-hazard ordering** — CIG ladders are ordinal *within* a hazard, not across hazards. Helper signature must reflect this (per-hazard call).
- **No automated test framework** — out of scope per PROJECT.md. Validation strategy: pre-implementation spike with known interior/boundary/exterior points; coverage checklist (14 surfaces) before declaring Phase 3 done.

## Sources

### Primary (HIGH confidence)
- Codebase: `node_helper.js` (lines 79–110, 159–162, 241–290, 309–317, 374, 617, 784, 879) and `MMM-SPCOutlook.js` (lines 2, 13, 18, 52, 70, 76–99)
- `node_modules/@turf/turf/package.json` — resolved 7.3.4 confirmed
- https://www.spc.noaa.gov/misc/SPC_probotlk_info.html — 40 km neighborhood radius
- https://www.spc.noaa.gov/misc/about.html — tier definitions
- https://turfjs.org/docs/api/pointToLineDistance — units + method options
- https://turfjs.org/docs/api/polygonToLine — MultiLineString-on-holes return shape
- https://turfjs.org/docs/api/flatten — MultiPolygon expansion
- https://github.com/Turfjs/turf/issues/1743 — confirms no native point-to-polygon distance; documents workaround
- https://docs.magicmirror.builders/module-development/core-module-file.html — module API conventions

### Secondary (MEDIUM confidence)
- https://norcast.tv/understanding-the-storm-prediction-centers-tornado-probabilities/ — probability bands
- https://en.wikipedia.org/wiki/Storm_Prediction_Center — tier scale cross-ref
- https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/ — freshness UX
- https://f1studioz.com/blog/smart-saas-dashboard-design/ — data-freshness indicator pattern

---
*Research completed: 2026-04-25*
*Ready for roadmap: yes*
