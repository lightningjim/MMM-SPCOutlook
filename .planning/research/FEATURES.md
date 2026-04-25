# Feature Research: v1.2 QoL Enhancements

**Domain:** MagicMirror² weather risk module — stale-data UI + proximity-weighted convective risk
**Researched:** 2026-04-25
**Confidence:** HIGH (SPC tier definitions, turf APIs); MEDIUM (specific falloff function — domain convention is informal)

---

## Background: SPC Tier System (Verified)

The SPC categorical convective outlook is a **5-tier ordinal scale plus TSTM**, derived from underlying probabilistic forecasts of severe weather within 25 miles (~40 km) of a point.

| Tier | Numeric | Day 1–2 Tornado % | Day 1–2 Wind/Hail % | Color |
|------|---------|-------------------|---------------------|-------|
| TSTM (General Tstm) | 0/1 | — (≥10% any tstm) | — | light green |
| MRGL (Marginal) | 1 | 2% | 5% | dark green |
| SLGT (Slight) | 2 | 5% | 15% | yellow |
| ENH (Enhanced) | 3 | 10% | 30% | orange |
| MDT (Moderate) | 4 | 15% | 30%+sig (hatched) / 45% | red |
| HIGH (High) | 5 | 30%+ | 60%+ | magenta |

**Key facts that drive the design:**
- Tier bands are **non-uniform in probability width** (e.g., MRGL→SLGT is 3pp for tornado, SLGT→ENH is 5pp, ENH→MDT is 5pp).
- The reference radius is **40 km / ~25 miles**. This is the natural "neighborhood" the SPC itself uses to define a probability at a point. Use it as the primary distance scale.
- For Day 3, only `MRGL`/`SLGT`/`ENH` exist (no Day 3 MDT/HIGH issued, except rare TC SLGT at 5%).
- CIG (Confidence-Increasing Guidance) tiers `cigtorn`/`cighail`/`cigwind` are 3-level (CIG1/2/3), separate GeoJSON layers, already fetched per hazard.

Sources: [SPC Conversion Table](https://www.spc.noaa.gov/misc/SPC_probotlk_info.html), [Norcast tornado probabilities](https://norcast.tv/understanding-the-storm-prediction-centers-tornado-probabilities/), [Wikipedia SPC](https://en.wikipedia.org/wiki/Storm_Prediction_Center).

---

## Recommendation: Distance Falloff Function

**Use linear falloff over a fixed 40 km half-window, normalized to a 0.0–1.0 weight, with a cutoff at 40 km.**

### Function

```
weight(d_km) = max(0, 1 - d_km / 40)
```

Where `d_km` is the geodesic distance from user point to the **nearest edge of the next-higher tier polygon** (turf `pointToLineDistance` against polygon-as-line, or `pointToPolygonDistance` if the lib is bumped to ≥7.3).

- `d = 0 km` → weight 1.0 (you're on the boundary; effectively in the higher tier)
- `d = 10 km` → weight 0.75
- `d = 20 km` → weight 0.50
- `d = 30 km` → weight 0.25
- `d ≥ 40 km` → weight 0.0 (suppress badge)

### Justification

1. **40 km matches SPC's own "neighborhood" radius.** A higher-tier polygon edge within 40 km means SPC's own probabilistic field saw enough joint risk to push the boundary near you. This is the only domain-grounded distance constant in the SPC documentation, so use it.
2. **Linear is honest.** Exponential decay implies a sharper meteorological transition that does not exist in the underlying probabilistic field — convective risk varies smoothly. Linear avoids overstating proximity.
3. **Tier-band-width normalization is wrong here.** Tier bands measure probability, not space. A 5pp band (SLGT→ENH wind) has no consistent km-equivalent — it depends entirely on the gradient of the probability field that day.
4. **Cutoff at 40 km prevents "always shows a badge" noise.** Beyond 40 km, the higher tier is no longer your meteorological neighborhood; suppress.
5. **Display rounds to 1 decimal** (e.g., `0.7`, `0.3`) — implies precision, not false precision.

### Alternatives Considered

| Approach | Why Rejected |
|----------|--------------|
| Exponential decay `e^(-d/k)` | No domain basis; understates short-distance proximity, overstates long-distance |
| Normalize by inter-polygon-edge distance (this tier's outer edge to next tier's outer edge) | Requires `pointToLineDistance` against TWO polygons per hazard per day; doubles compute. Marginal accuracy gain |
| Stepped buckets (close/medium/far) | Loses the smooth visual signal that the badge format `EHN → MDT 0.75` implies |
| Use mile-based threshold (25 mi) | 25 mi ≈ 40 km — same effective threshold; km is more conventional in geo libs |

---

## Recommendation: Stale-Data UI

**Per-row dimming + small icon, no global banner. Threshold = `2 × updateInterval`.**

### Behavior

- Backend already populates `_stale: true` and `_staleAsOf: <timestamp>` at the **whole-payload** level when ANY underlying fetch falls back to cached data within the stale window. The stale window is currently `1 × updateInterval`.
- For v1.2, surface this as a **single small indicator** next to the timestamp/header area — not per row. The backend doesn't track per-day staleness, and adding that would be a backend change out of scope for "QoL."
- **Threshold:** show the indicator whenever `_stale === true`. The backend has already gated this on the update interval, so no second threshold is needed in the frontend.
- **Visual treatment:** `⚠` icon + dim text color (e.g., `#888`) + tooltip/title text `"Cached data — last fresh fetch: <relative time>"`.
- **Time format:** relative ("3m ago", "1h ago"), computed from `_staleAsOf` on each `getDom()` call.

### Justification

- Dashboard UX research (Smashing Magazine 2025; F1Studioz 2026) converges on: **visible timestamp + visual demotion** ("stale data should look stale"). A single-symbol approach fits a small MagicMirror panel where vertical real estate is scarce.
- Per-row staleness would require the backend to plumb `stale` flags per outlook, per day. Current `anyStale` aggregation is OR-of-all-fetches; refactoring is **out of scope for v1.2** (already-noted v2 candidate).
- 1 × updateInterval is a defensible threshold: it means "we tried to refresh and failed."

Sources: [Smashing — UX Strategies for Real-Time Dashboards](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/), [F1Studioz Smart SaaS Dashboard 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/).

---

## Edge Cases (Proximity Feature)

| Case | Behavior | Rationale |
|------|----------|-----------|
| Point exactly on boundary of higher tier (d=0) | weight = 1.0; show `→ NEXT 1.0` | Mathematically correct; flags borderline-in users |
| Point inside risk N, no higher tier polygon issued today (e.g., HIGH absent nationally) | No badge | Nothing meaningful to compare against |
| Point inside HIGH risk (already top tier) | No "→ next" badge ever | No tier above HIGH |
| Multiple disjoint polygons of next-higher tier | Use min distance across all polygons of that tier | Closest higher-tier area is the relevant one |
| Point outside ALL risk polygons but near MRGL | Show `0.X (near MRGL)` only when `weight > 0` | Lets users see edge-of-risk situations without false alarms |
| Point inside MDT, ENH polygon also covers point | Already inside; the "next tier up" lookup is HIGH (skip ENH since it's the lower tier) | Check from current tier upward only |
| Day 3 only goes to ENH | "Next tier" lookup capped at ENH for Day 3 | Day 3 MDT/HIGH layers don't exist |
| Convex/concave polygon shapes | `pointToLineDistance(point, polygonToLine(poly))` handles all topologies | turf primitive |
| MultiPolygon higher tier | Iterate component polygons, take min distance | Standard turf pattern |
| GeoJSON with holes (rare for SPC) | turf 7.3 `pointToPolygonDistance` handles natively; with 7.2 `pointToLineDistance` over outer ring is sufficient (SPC doesn't use holes) | SPC outlook polygons are simple |
| Higher tier polygon FAR (>40 km) | weight = 0; suppress badge entirely | Avoid noise |
| User toggles feature off (default) | Skip all proximity computation; no extra fetches required since cat polygons are already fetched | Zero-cost when disabled |
| CIG tier proximity (cigtorn → cighail → cigwind ladders are SEPARATE, not ordinal across hazards) | Compute proximity within each hazard's own CIG ladder (CIG1→CIG2→CIG3) only | CIG tiers ARE ordinal within a hazard |

---

## Feature Landscape

### Table Stakes

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Stale indicator visible somewhere on display | Backend already flags stale data; not surfacing it is a transparency gap users will notice when "old" risk persists past expected refresh | LOW | Single span next to first row; reads `_stale` + `_staleAsOf` from existing payload. No backend change. |
| Proximity opt-in via config flag, default OFF | Existing users should not see new behavior on upgrade; feature changes the visual density of the panel | LOW | Add `proximityEnabled: false` to defaults; gate compute + render on flag |
| Proximity badge inside-risk format: `CURR → NEXT W.W` | User-requested syntax; conveys both current state and direction-of-concern in one glyph | MEDIUM | Compute weight per hazard per day; render inline after existing risk text |
| Proximity badge outside-risk format: `0.W (near TIER)` | Users outside any risk still benefit from "you're close to a marginal" awareness | MEDIUM | Only renders when weight > 0; no badge when no nearby tier within 40 km |
| Skip proximity when no higher tier polygon exists today | Day 3 maxes at ENH; HIGH may be absent nationally on quiet days | LOW | Guard: only fetch/compute for tiers that have polygons in fetched GeoJSON |
| Not increasing fetch count when feature is OFF | Pi CPU/network constraint per PROJECT.md | LOW | Fetch only when proximity is on; reuse already-fetched cat/CIG GeoJSON when on |

### Differentiators

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Tooltip on stale icon with last-fresh-fetch time | Users hovering get exact age without visual clutter | LOW | `title` attribute on the `⚠` span; relative time string |
| CIG-tier proximity within each hazard (CIG1 → CIG2 → CIG3) | Surfaces "your tornado risk is borderline significant" — meaningful for severe-weather-aware users | MEDIUM | Reuse same falloff fn against cigtorn/cighail/cigwind layers; only when current CIG > 0 |
| Color the proximity badge by NEXT tier color | Visual continuity with existing color-coded display | LOW | Reuse `riskToColor[next]` |
| Round weight to 1 decimal | Avoids false-precision look (`0.7341`); matches at-a-glance ethos | LOW | `Math.round(w * 10) / 10` at render time |
| Suppress badge below noise threshold (e.g., w < 0.1) | Prevents "always-on" badge noise when the next tier is at the 40 km edge | LOW | Configurable: `proximityMinWeight: 0.1` |

### Anti-Features

| Feature | Why Requested | Why Problematic | Alternative |
|---------|---------------|-----------------|-------------|
| Per-row stale indicator | "Per-day staleness is more accurate" | Backend doesn't track per-row stale; would require non-trivial backend refactor — scope creep | Single global stale icon (matches current backend granularity) |
| Banner / alert dialog for stale | "Make it impossible to miss" | MagicMirror is ambient; modal/banner UX violates the pattern; user is across the room | Subtle ⚠ + dim color |
| Auto-refresh trigger when stale | "Why not just retry?" | Backend already retries on next interval; client-side retry could thrash on persistent SPC outage | Stale label is informational only |
| Proximity for Day 4–8 | "Symmetry with Day 1–3" | Day 4–8 polygons are single-probability (no tier ladder beyond `percToRisk`); proximity adds noise to already-low-confidence forecasts | Limit to Day 1–3 + CIG (per requirements) |
| Proximity for Fire Weather | "Same logic should apply" | Fire Wx tiers (ELEV/CRIT/EXTM) are conceptually different; out of stated v1.2 scope | Defer to v1.3 if requested |
| Exponential or smoothed falloff curve | "Sharper signal near boundary" | No domain basis; inflates short-distance weights misleadingly | Linear with 40 km cutoff |
| Showing distance in km/mi instead of weight | "Distance is more concrete" | Weight (0–1) is comparable across hazards; raw km requires user to know the scale | Weight in display; km only in tooltip if at all |
| Animating the stale icon (blink/pulse) | "Get attention" | MagicMirror background-display ethos; motion is distracting in ambient context | Static icon + dim color |

---

## Feature Dependencies

```
[Stale UI Indicator]
    └── requires ── [_stale + _staleAsOf in payload]   ✓ EXISTS in node_helper.js (lines 617, 784)

[Proximity Weighting (Cat)]
    └── requires ── [Day 1/2/3 cat GeoJSON in cache]   ✓ EXISTS (day1CatURL, day2CatURL, day3CatURL)
    └── requires ── [turf.pointToLineDistance OR pointToPolygonDistance]
                       └── pointToLineDistance is in turf 7.2 (current)   ✓
                       └── pointToPolygonDistance requires turf ≥7.3      ⚠ would need bump
    └── requires ── [config flag: proximityEnabled]                      ✗ NEW

[Proximity Weighting (CIG)]
    └── requires ── [Proximity Weighting (Cat) infrastructure]
    └── requires ── [Day 1/2 CIG GeoJSON for tor/hail/wind]              ✓ EXISTS
    └── requires ── [Day 3 cigprob GeoJSON]                               ✓ EXISTS (day3CigUrl)

[Per-hazard Proximity Display Badges]
    └── requires ── [Proximity computation results in payload]
    └── enhances  ── [Existing color-coded probRiskHTML rendering in MMM-SPCOutlook.js]
```

### Dependency Notes

- **Stale UI is independent of Proximity.** Could ship in two phases or together.
- **Proximity adds new payload fields per day** (e.g., `day1.torProximity = { weight: 0.75, nextTier: "MDT" }`). Frontend rendering keys off `weight > 0` to decide whether to show badge.
- **No new fetches required** — all needed GeoJSONs are already pulled for the existing categorical/CIG features. Compute is added to existing `evaluatePolygons` flow or a new `computeProximity` helper.
- **turf 7.2 is sufficient.** Use `polygonToLine(poly)` then `pointToLineDistance(point, line, {units: 'kilometers'})`. Avoid the version bump unless other 7.3 features are wanted.

---

## MVP Definition (v1.2 milestone)

### Launch With (v1.2)

- [x] Stale data icon + dim styling next to header/first row, reading existing `_stale`/`_staleAsOf`
- [x] `proximityEnabled: false` config flag
- [x] Proximity computation for Day 1, Day 2, Day 3 categorical (when enabled)
- [x] Proximity computation for Day 1, Day 2 CIG tiers per hazard (tor/hail/wind) (when enabled)
- [x] Proximity computation for Day 3 cigprob (when enabled)
- [x] Inside-risk badge: `CURR → NEXT W.W` rendered inline after existing risk text
- [x] Outside-risk badge: `W.W (near TIER)` rendered when user is outside all polygons but within 40 km of one
- [x] Linear falloff with 40 km cutoff
- [x] Suppress badge when no higher tier exists for that day/hazard

### Add After Validation (v1.3+)

- [ ] Per-row staleness (requires backend refactor of `_stale` aggregation to per-fetch granularity)
- [ ] Proximity for Fire Weather tiers
- [ ] Configurable `proximityMaxKm` (default 40) and `proximityMinWeight` (default 0.1) for power users
- [ ] Tooltip with exact km distance on proximity badges

### Future Consideration (v2+)

- [ ] Trend indicator (was MRGL yesterday, is SLGT today) — requires payload history, big architectural shift
- [ ] Predictive proximity (interpolate edge motion across runs) — requires multi-snapshot retention

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Stale UI indicator | MEDIUM | LOW | P1 |
| `proximityEnabled` config flag | HIGH (gates everything) | LOW | P1 |
| Day 1–2 cat proximity weighting | HIGH | MEDIUM | P1 |
| Day 3 cat proximity weighting | MEDIUM | LOW | P1 |
| Inside-risk badge rendering | HIGH | LOW | P1 |
| Outside-risk badge rendering | MEDIUM | LOW | P1 |
| Day 1–2 CIG proximity per hazard | MEDIUM | MEDIUM | P1 |
| Day 3 cigprob proximity | LOW | LOW | P2 |
| Tooltip on stale icon | LOW | LOW | P2 |
| Color-by-next-tier on badge | MEDIUM | LOW | P2 |
| Per-row staleness | LOW | HIGH | P3 |
| Configurable distance/weight thresholds | LOW | LOW | P3 |

**Priority key:**
- P1: Required for v1.2 launch
- P2: Should ship in v1.2 if straightforward
- P3: Defer to later milestone

---

## Implementation Notes for Downstream Phases

### Backend (`node_helper.js`) additions

1. **New helper `computeProximity(polygons, loc, currentTierValue, valueToLabel)`** that:
   - Filters polygons where `value > currentTierValue` (only higher tiers, not same/lower)
   - For each, converts to LineString via `turf.polygonToLine`, computes `pointToLineDistance`
   - Returns `{ nextTier: <label>, weight: <0–1>, distanceKm: <num> }` for the closest higher-tier polygon, or `null` if none within 40 km or no higher tier exists.
2. **Same helper applied to CIG ladders** within each hazard.
3. **Gate computation on `payload.proximityEnabled`** passed from frontend; reuse cached GeoJSONs (don't refetch).
4. Add proximity field to per-day return: `day1.torProximity`, `day1.hailProximity`, etc., and `day1.catProximity` for the categorical.

### Frontend (`MMM-SPCOutlook.js`) additions

1. **`defaults.proximityEnabled = false`**
2. Pass `proximityEnabled` in the `GET_SPC_DATA` socket notification payload.
3. **Stale rendering** (always on): if `this.spcrisk._stale`, prepend a small `<span class="dimmed" title="...">⚠ data may be stale</span>` to the wrapper.
4. **Inside-risk badge:** when `dayN.risk !== "NONE"` and `dayN.catProximity`, append ` <span style="color:#NEXTCOLOR">→ NEXT_LABEL ${weight.toFixed(1)}</span>` after existing risk text.
5. **Outside-risk badge:** when `dayN.risk === "NONE"` and `dayN.catProximity` exists with `weight > 0`, render a new line `Day N: ${weight.toFixed(1)} (near NEXT)`.
6. **Per-hazard CIG badges** rendered inline alongside existing `cigLabel` output in `probRiskHTML`.

### Constants to introduce

```javascript
const PROXIMITY_MAX_KM = 40;          // SPC neighborhood radius
const PROXIMITY_MIN_WEIGHT = 0.1;     // suppress noise
const valueToRiskLabel = {1:"TSTM", 2:"MRGL", 3:"SLGT", 4:"ENH", 5:"MDT", 6:"HIGH"}; // already exists as valueToRisk
```

---

## Sources

- [SPC Probabilistic to Categorical Outlook Conversion](https://www.spc.noaa.gov/misc/SPC_probotlk_info.html) — HIGH confidence
- [SPC About Convective Outlooks](https://www.spc.noaa.gov/misc/about.html) — HIGH confidence
- [Wikipedia — Storm Prediction Center](https://en.wikipedia.org/wiki/Storm_Prediction_Center) — HIGH (cross-reference for tier scale)
- [Norcast — Understanding SPC Tornado Probabilities](https://norcast.tv/understanding-the-storm-prediction-centers-tornado-probabilities/) — HIGH (probability bands)
- [turf.js pointToLineDistance docs](https://turfjs.org/docs/api/pointToLineDistance) — HIGH
- [turf.js pointToPolygonDistance docs](https://turfjs.org/docs/api/pointToPolygonDistance) — HIGH (note: requires v7.3+; current project on 7.2)
- [Smashing Magazine — UX Strategies for Real-Time Dashboards (Sep 2025)](https://www.smashingmagazine.com/2025/09/ux-strategies-real-time-dashboards/) — MEDIUM (general dashboard patterns)
- [F1Studioz — Smart SaaS Dashboard Design 2026](https://f1studioz.com/blog/smart-saas-dashboard-design/) — MEDIUM (data freshness indicator pattern)

---
*Feature research for: v1.2 QoL Enhancements (stale indicator + proximity-weighted risk)*
*Researched: 2026-04-25*
