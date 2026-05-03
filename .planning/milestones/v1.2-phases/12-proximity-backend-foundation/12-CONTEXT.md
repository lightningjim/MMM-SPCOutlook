# Phase 12: Proximity Backend Foundation - Context

**Gathered:** 2026-04-25
**Status:** Ready for planning

<domain>
## Phase Boundary

Backend computes distance-weighted proximity to higher tiers for Convective Day 1–3 categorical and CIG hazards, emitting an additive `proximity` subtree per `dayN` only when `proximityWeighting: true` is sent on the `GET_SPC_DATA` payload. Default `false` is a strict no-op — payload shape is byte-identical to today.

In scope:
- New helper `computeProximity(items, loc, currentValue, comparator)` in `node_helper.js` using `turf.lineToPolygon`/`turf.polygonToLine` + `turf.pointToLineDistance` (km) with linear falloff `weight = max(0, 1 − d_km/40)`, strictly capped below 1 so `currentValue + weight < currentValue + 1`.
- Threading the `proximityWeighting` flag from frontend (`MMM-SPCOutlook.js` `start` + `setInterval`) through `GET_SPC_DATA` payload, destructured in `socketNotificationReceived`, cached on `this._proximityWeighting`. Mirrors the Phase 11 `updateInterval` pattern exactly.
- Wiring `computeProximity` into the existing `getSpcOutlook` Day 1/2/3 categorical blocks and into `fetchAndEvaluateHazard` for the per-hazard CIG layers (Day 1/2 torCig/hailCig/windCig, Day 3 cig).
- Additive `_geoJsonCache` extension: a memoized `lines` field added to existing entries on demand the first time `computeProximity` needs it.

Out of scope:
- Frontend rendering of badges (Phase 13 — PROXUI-01 through PROXUI-05).
- Fire weather proximity (FIRE-* hazards explicitly excluded).
- Days 4–8 proximity (probability-only layers; no tiering structure for adjacency).
- Mesoscale Discussion proximity.

</domain>

<decisions>
## Implementation Decisions

### Subtree shape (PROX-03, PROX-04)
- **D-01:** `dayN.proximity` uses flat per-hazard keys parallel to existing `torRisk`/`hailRisk`/`windRisk` siblings. Day 1/2 shape: `{ categorical, torCig, hailCig, windCig }`. Day 3 shape: `{ categorical, cig }`. Each entry is `{ value: number, nextTier: string }` or omitted entirely (see D-04).
- **D-02:** Each entry's `value` is the displayable proximity number `currentValue + weight` (e.g., SLGT(2) user 0.7 toward ENH polygon → `value: 2.7`; outside-all-tiers user 0.6 toward SLGT polygon → `value: 0.6`). Frontend renders rounded to one decimal — no further math required on its side.
- **D-03:** `nextTier` is the SPC label string of the polygon that produced the winning weight (e.g., `"ENH"`, `"MDT"`, `"CIG2"`). Use the existing `valueToRisk` map for categorical tiers and the CIG label string already produced by the CIG comparator path for CIG tiers.
- **D-04:** When categorical AND every CIG hazard for a given `dayN` resolves to null, omit `dayN.proximity` entirely. When some hazards resolve and others are null, the resolved hazards are present and the null-resolving hazards are absent (not present-with-null). PROX-06: "no spurious subtree entries."

### Outside-all-tiers and CIG outside-tier behavior
- **D-05:** When `currentValue === 0` (user is outside all categorical polygons) but a higher-tier polygon is within 40 km, emit `{ value: weight, nextTier: <winning tier label> }`. This is the "0.6 (near SLGT)" UX path that PROJECT.md cites and Phase 13 will render.
- **D-06:** Same rule applies to CIG: when user is outside all CIG tier polygons (`currentCig === 0`) but a CIG polygon is within 40 km, emit `{ value: weight, nextTier: "CIG1" }` (or whichever CIG tier won). Parallelism with categorical — no additional semantic.

### Multi-tier combination
- **D-07:** When two or more higher-tier polygons are within 40 km, evaluate `weight = max(0, 1 − d_km/40)` against each higher-tier polygon and pick the polygon that produces the **maximum weight**. `nextTier` reports that winning polygon's tier label. Cap weight strictly below 1 (`Math.min(weight, 0.999...)` or equivalent — the simplest implementation is to gate on `d_km > 0`, since `weight = 1` only at `d = 0`, which means the user is on the boundary and effectively inside the higher tier already).
- **D-08:** "Higher tier" means `value > currentValue`. A polygon of the same tier as the user does not contribute. A polygon two or more tiers up is allowed to win (e.g., MDT polygon beats ENH polygon if MDT is closer).

### Cache memoization (PROX-05)
- **D-09:** Polygon-to-line conversion is computed lazily. The first time `computeProximity` needs a `lines` representation for a given URL, it reads `_geoJsonCache.get(url)`, derives the lines via `turf.polygonToLine(poly)` (per polygon, then flattened), and writes the result back as a new field on the same cache entry: `entry.lines = [...]`. Subsequent calls reuse it. Cache invalidation rules already in place (ETag/hash mismatch clears the entry; Phase 11 sets `result: null, timestamp: 0` on `proximityWeighting` toggle? — see D-11).
- **D-10:** When `proximityWeighting === false`, `computeProximity` is never called, so `entry.lines` is never populated. Default-off path stays zero-CPU.

### Flag threading (PROX-02)
- **D-11:** `proximityWeighting` is destructured in `socketNotificationReceived` alongside `lat, lon, extended, updateInterval` and stored on `this._proximityWeighting`. `getSpcOutlook` reads it once at entry and passes it (or a closed-over reference) to the Day 1/2/3 categorical and `fetchAndEvaluateHazard` paths. When toggled `true → false` between calls, the next call simply skips proximity computation; the polygon-to-line memoizations remain in `_geoJsonCache` (cheap leak, cleared on next ETag/hash miss).
- **D-12:** Toggling `false → true` does not require a cache reset — `computeProximity` will lazily fill `entry.lines` on demand using the existing cached `result` polygons. The `result` cache holds the scalar tier value, but the polygon-to-line cache needs the original `poly` array. Decision: when `proximityWeighting` is true, the categorical/CIG fetch blocks must retain the `poly` array (or extracted polygon objects) on the cache entry so `computeProximity` can derive lines. This is the additive `_geoJsonCache` extension referenced in PROX-05 — add a `polys` (or `polyEntries`) field at fetch time when proximity is on, alongside the existing `result` scalar. When proximity is off, no new field is written.

### Helper signature and placement
- **D-13:** Helper signature exactly matches PROX-01: `computeProximity(items, loc, currentValue, comparator)`. `items` is the same shape `extractPolygons` returns (`[{label, value, poly}]`). `comparator` is the same comparator object the existing `evaluatePolygons` consumes (`{ initial, comparator(best, value) }`) — used to determine "higher tier" via comparator semantics rather than a hardcoded `>`. This keeps CIG and categorical paths uniform.
- **D-14:** Helper lives next to `evaluatePolygons` in `node_helper.js` (lines ~111–120). Returns `null` when no higher-tier polygon exists within 40 km, otherwise `{ value, nextTier }`.

### Claude's Discretion
- Exact field name for the polygon-cache field (`polys`, `polyEntries`, `items`) — pick one consistent name.
- Whether `computeProximity` reads `_geoJsonCache` directly (looks up `entry.lines`) or accepts a pre-derived `lines` array as an additional parameter. Either is acceptable; the latter is purer functionally but requires the caller to do the cache read.
- Exact strict-cap implementation (`Math.min(weight, 1 - Number.EPSILON)` vs `weight = d_km > 0 ? weight : 0.999`) — pick the simplest readable form.
- Whether to log a one-time info message when `proximityWeighting` first arrives true (parallel to the `updateInterval` fallback log added in Phase 11) — useful for verification but not required.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & roadmap
- `.planning/REQUIREMENTS.md` §Proximity Weighting (PROX) — PROX-01 through PROX-06 acceptance text
- `.planning/ROADMAP.md` §Phase 12: Proximity Backend Foundation — goal and 5 success criteria
- `.planning/ROADMAP.md` §Phase 13: Proximity Frontend Render — downstream consumer; subtree shape D-01/D-02 must satisfy PROXUI-02/PROXUI-03/PROXUI-04

### Source files in scope
- `node_helper.js` lines 111–120 (`evaluatePolygons`) — adjacent placement reference for new `computeProximity`
- `node_helper.js` lines 23 (`_geoJsonCache` initialization) — additive memoization target
- `node_helper.js` lines 28–37 (`socketNotificationReceived`) — destructure `proximityWeighting`; persist on `this._proximityWeighting`
- `node_helper.js` lines 169–239 (`fetchGeoJsonCached`) — cache writer; gated extension to store polygons when proximity is on
- `node_helper.js` lines 251–305 (`fetchAndEvaluateHazard`) — per-hazard call site for CIG proximity
- `node_helper.js` lines 329–344 (comparator definitions for categorical/CIG) — passed through to `computeProximity`
- `node_helper.js` lines 345–366 (`riskToValue` / `valueToRisk`) — `nextTier` label resolution
- `node_helper.js` lines 396–530 (Day 1/2/3 categorical and CIG fetch/evaluate blocks) — call sites for proximity emission
- `MMM-SPCOutlook.js` lines 9–16 (`start` + `setInterval`) — second flag added to `GET_SPC_DATA` payload alongside `updateInterval`

### Phase 11 reference (pattern parallel)
- `.planning/phases/11-stale-data-indicator/11-CONTEXT.md` §Backend interval threading — identical threading pattern; D-01..D-04 there map to `proximityWeighting` here

### Project-level
- `.planning/PROJECT.md` §Active Requirements — names the `EHN → MDT 0.75` and `0.6 (near SLGT)` UX targets that constrain D-02
- `.planning/PROJECT.md` §Constraints — Raspberry Pi: D-09/D-10 protect default-off CPU cost
- `.planning/codebase/ARCHITECTURE.md` §Risk Evaluation Functions — existing `evaluatePolygonsContinuous`/`evaluatePolygonsWeighted` document an older proximity model; the new `computeProximity` replaces neither

### Turf.js
- `@turf/turf` v7.2.0 already installed (`node_helper.js` line ~5 `const turf = require("@turf/turf")`). Functions used: `turf.polygonToLine`, `turf.pointToLineDistance` (units: `kilometers`)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`extractPolygons`** (node_helper.js ~80–103): produces `[{label, value, poly}]` items — direct input shape for `computeProximity` per D-13
- **`catComparator` / `cigComparator`** (node_helper.js 329–344): already passed to `evaluatePolygons` — pass through unchanged to `computeProximity`
- **`valueToRisk`** (node_helper.js 16): integer→label mapping; use to derive categorical `nextTier` string
- **`_geoJsonCache`** (node_helper.js 23, 268, 289, 404, 443, 481, 511): existing entries already keyed by URL; new `lines` and `polys` fields are additive
- **`turf.polygonToLine`, `turf.pointToLineDistance`**: turf.js v7.2.0 already installed and required at top of file — no new dependency

### Established Patterns
- Backend reads frontend state from `GET_SPC_DATA` payload + persists on `this._<field>` for use by helpers without per-call plumbing — exact pattern Phase 11 set up for `updateInterval`. PROX-02 follows the same pattern with `proximityWeighting` and `this._proximityWeighting`.
- Shared helpers placed next to siblings in `node_helper.js` and called inline from `getSpcOutlook` — `computeProximity` follows `evaluatePolygons` placement.
- Cache entry shape extends additively over time: PERF-01/02 added `mode/etag/hash`, Phase 11 left it untouched, Phase 12 adds `lines` and `polys` fields. New consumers must tolerate absence (no field = first call or proximity-off path).
- Comparator-driven evaluation: `evaluatePolygons` and `evaluatePolygonsWeighted` use the comparator pattern — `computeProximity` must keep that pattern to support both categorical (max-tier comparator) and CIG (max-tier comparator on different value range) without code duplication.

### Integration Points
- **Day 1/2 categorical (lines 402–406, 441–445)**: after the existing `evaluatePolygons → day1Risk/day2Risk` resolution, when `this._proximityWeighting === true` and a `poly` array is in scope (or readable from cache), call `computeProximity(poly, loc, day1RiskResult, catComparator)` and attach the result to a building `day1.proximity.categorical` field.
- **Day 3 categorical (lines 479–483)**: same pattern as Day 1/2.
- **Day 1/2 hazards via `fetchAndEvaluateHazard` (lines 411, 416, 421, 450, 455, 460)**: `fetchAndEvaluateHazard` returns `{risk, cig, stale}`; extend internally so when `this._proximityWeighting === true` it also computes CIG proximity and surfaces it (signature change OR a second helper invoked alongside — planner picks). The categorical proximity is per-day, not per-hazard, so it's computed once per day regardless of how many hazards are evaluated.
- **Day 3 CIG (lines 506–511)**: standalone CIG path; mirror the Day 1/2 CIG proximity emission.
- **`socketNotificationReceived` (lines 28–37)**: add `proximityWeighting` to the destructure list; store on `this._proximityWeighting` (default false). Pattern matches `updateInterval` storage exactly.
- **Frontend `GET_SPC_DATA` payloads (`MMM-SPCOutlook.js` lines 9–16)**: both payload constructions (initial + interval) need `proximityWeighting: this.config.proximityWeighting` (default false) added. Same dual-site pattern Phase 11 used for `updateInterval`.
- **`config.json` defaults schema in `MMM-SPCOutlook.js`**: add `proximityWeighting: false` to the `defaults` object.

</code_context>

<specifics>
## Specific Ideas

- Subtree example (Day 1/2): `day1.proximity = { categorical: { value: 2.7, nextTier: "ENH" }, torCig: { value: 1.6, nextTier: "CIG2" }, hailCig: { value: 0.4, nextTier: "CIG1" }, windCig: null }` — note `windCig: null` is illustrative; actual emission omits the field entirely per D-04.
- Subtree example (Day 3): `day3.proximity = { categorical: { value: 0.5, nextTier: "MRGL" }, cig: { value: 1.2, nextTier: "CIG2" } }`.
- Outside-all-tiers example: SLGT polygon 16 km away, user not in any categorical → `categorical: { value: 0.6, nextTier: "SLGT" }` (weight = 1 − 16/40 = 0.6).
- Multi-tier example: SLGT(2) user, ENH(3) polygon 12 km away (weight 0.7), MDT(4) polygon 8 km away (weight 0.8) → `categorical: { value: 2.8, nextTier: "MDT" }` (max-weight wins; cap below 1 holds because 0.8 < 1).

</specifics>

<deferred>
## Deferred Ideas

- Falloff curve other than linear (sigmoid, exponential) — locked to linear by PROX-01; revisit only if user reports unintuitive badge behavior in production.
- Cutoff radius other than 40 km — locked by PROX-01; possible v2 tuning knob if proximity feels too noisy or too sparse in real-world use.
- Fire weather and Day 4–8 proximity — explicitly out of scope per PROJECT.md Active scope (Convective Day 1–3 + CIG only).
- Mesoscale Discussion proximity — out of scope; MD detection stays binary.
- Proximity caching beyond polygon-to-line memoization (e.g., caching computed weights per location) — premature; recompute per request is cheap once lines are memoized.
- Frontend badge rendering, suppression below noise threshold, formatting — Phase 13 territory.

</deferred>

---

*Phase: 12-proximity-backend-foundation*
*Context gathered: 2026-04-25*
