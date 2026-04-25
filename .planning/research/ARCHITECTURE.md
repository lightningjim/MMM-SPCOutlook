# Architecture Research — v1.2 QoL Enhancements

**Domain:** MagicMirror² module — backend (node_helper) + frontend (browser-side getDom) over socket notifications
**Researched:** 2026-04-25
**Confidence:** HIGH (full source read; no external library questions)
**Scope:** Stale data UI indicator + Proximity-weighted risk for Convective Day 1–3 categorical and CIG tiers

---

## 1. Existing Architecture (Baseline)

```
┌──────────────────────────────────────────────────────────────────┐
│  Frontend (browser) — MMM-SPCOutlook.js                          │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ start() → sendSocketNotification("GET_SPC_DATA", {...})  │    │
│  │ socketNotificationReceived("SPC_DATA_RESULT") → store    │    │
│  │ getDom() → renders rows from this.spcrisk + this.mds     │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────┬───────────────────────────────────┘
                               │ socket
┌──────────────────────────────▼───────────────────────────────────┐
│  Backend (Node) — node_helper.js                                  │
│  ┌──────────────────────────────────────────────────────────┐    │
│  │ socketNotificationReceived("GET_SPC_DATA")               │    │
│  │   → getMesoscaleDiscussion(lat,lon)                      │    │
│  │   → getSpcOutlook(lat,lon,extended)                      │    │
│  │   → sendSocketNotification("SPC_DATA_RESULT",[outlook,md])│   │
│  └──────────────────────────────────────────────────────────┘    │
│  Helpers: fetchGeoJsonCached (ETag/SHA256), extractPolygons,     │
│           evaluatePolygons, fetchAndEvaluateHazard,              │
│           checkInPolygon, percToRisk                              │
│  State:  _geoJsonCache (Map<url,{result,etag,hash,timestamp}>)   │
│          _cachedLat/_cachedLon (location-change invalidation)    │
└──────────────────────────────────────────────────────────────────┘
```

**Existing data shape (per fetched URL):**
- `_geoJsonCache.get(url).result` is currently a **scalar** (e.g. integer risk tier) for hazard layers, or a small object `{probRisk, sign}` for Day 4–8.
- The full response object embeds `_stale: true` + `_staleAsOf: <epochMs>` at the **top level** when *any* fetch served from stale cache.

**Key existing primitives we will reuse:**
- `extractPolygons(gj, toValue, includesFeat)` — already returns `{label, value, poly}` items. The `poly` is a turf Polygon/MultiPolygon — directly consumable by `turf.pointToLineDistance` after conversion via `turf.polygonToLine`.
- `_geoJsonCache` keyed by URL — perfect place to memoize derived proximity data per fetch.
- `anyStale` accumulator + per-fetch `stale` flag — already plumbed through every code path.

---

## 2. Decision (a) — Where does proximity weighting compute?

**Recommendation: Backend (node_helper.js), per fetch, cached alongside the polygon result.**

### Rationale
1. **Polygons stay on the backend.** Sending raw GeoJSON polygons to the browser would balloon socket payload (Day 1 cat alone is tens of KB; multiply by ~12 affected layers and you're sending 100+ KB per cycle vs the current sub-1 KB scalar response). RPi network and DOM JSON parse both pay.
2. **Distance math is cheap relative to point-in-polygon, which already runs.** `turf.pointToLineDistance` against a polygon's outer ring is O(edges) — same order as `booleanPointInPolygon`. We're adding ~1× the existing turf cost per layer, only when a relevant tier exists.
3. **Result is cacheable.** Proximity depends on `(polygon, point)`. The polygon doesn't change between fetches (ETag/hash gate), and the point only changes on location change (already invalidates cache). So weighted values can live in the same `_geoJsonCache` entry as `result` and survive across update cycles for free — exactly like the existing `result` scalar.
4. **Frontend stays dumb.** Current `getDom()` is pure presentation. Keeping the math/data boundary preserved means render stays fast, and a future "test the math" path can mock the socket payload without bringing turf into the browser bundle.

### CPU budget sanity check
Existing per-cycle cost ≈ ~12 hazard fetches × ~2 turf ops each. Proximity adds:
- For **inside-tier** case: 1 `pointToLineDistance` against the next-higher-tier polygon's boundary (skip if no higher tier exists).
- For **outside-all-tiers** case: 1 `pointToLineDistance` against the lowest-existing-tier polygon boundary.
- Both gated behind the proximity config flag. **Default off → zero cost regression.**

Worst case with flag on: ~12 extra `pointToLineDistance` calls per cycle, each comparable to one `booleanPointInPolygon`. RPi 4 handles this in tens of ms — negligible vs the network fetch wall time that dominates each cycle.

### What NOT to do
- ❌ Don't send polygon geometry to the frontend. Bundle bloat + repeated parse cost on every `updateDom()`.
- ❌ Don't compute on-demand in `getDom()` even with cached polygons — `getDom()` runs on every `updateDom()` call (including from other modules' notification side effects). Backend memoization beats per-render math.

---

## 3. Decision (b) — Data shape for proximity

**Recommendation: Extend each affected `dayN` field with a sibling `proximity` object. Do NOT mutate existing field types.**

### The trap to avoid
Mutating `day1.torRisk` from `number` to `{value, weighted, ...}` breaks every existing reader silently. The frontend currently does `100 * this.spcrisk.day1.torRisk` and `riskToColor[day1.risk]` — these would NaN/undefined out.

### Recommended shape
Keep all existing fields unchanged. Add **one** new sibling object per day, only when proximity is enabled and meaningful:

```js
day1: {
  // existing — UNCHANGED
  risk: "ENH",
  text: "Enhanced",
  color: "e9c188",
  probRisk: true,
  torRisk: 0.10,
  torCig: 2,
  hailRisk: 0.30,
  hailCig: 0,
  windRisk: 0.15,
  windCig: 0,

  // NEW — only present when config.proximityWeighting === true
  proximity: {
    cat:    { weighted: 3.75, neighborTier: 4, neighborTierName: "ENH", distanceKm: 12.4, direction: "up" },
    torCig: { weighted: 2.6,  neighborTier: 3, neighborTierName: "CIG3", distanceKm: 8.1, direction: "up" }
    // hailCig/windCig only included when meaningful
  }
}
```

### Why this shape
1. **Additive, not substitutive.** No existing reader breaks. No defensive code in current paths.
2. **Single subtree to gate on.** Frontend renders proximity badges with `if (this.spcrisk.day1.proximity?.cat) { ... }`. Clean conditional.
3. **`direction: "up" | "down"`** disambiguates the two display modes:
   - `up` = inside a tier, looking toward higher tier → `"ENH → MDT 0.75"`
   - `down` = outside all tiers, looking toward nearest tier → `"0.6 (near SLGT)"`
   This avoids the frontend re-deriving direction from `weighted` vs `value`.
4. **`neighborTierName`** is pre-resolved on backend so `valueToRisk`/`cigLabel` lookups don't need to be duplicated frontend-side for the *neighbor*.
5. **Day 3 categorical** uses the same `proximity.cat` slot. Day 3 CIG uses `proximity.cig` (single-hazard, no torn/hail/wind split).

### Rejected alternative: parallel flat fields (`day1RiskWeighted`, `day1NextTier`, `day1Distance`)
Pros: no nesting. Cons: explodes namespace (would add ~24 fields across day1+day2+day3 for cat+3 CIG tiers each). Also makes the gate-on-proximity render logic messier (multi-field presence checks vs `?.proximity?.cat`).

### Day 3 CIG note
Day 3 currently has `cig` (single tier integer, 0–3) on the `day3` object. Add `proximity.cig` parallel to `proximity.cat`.

---

## 4. Decision (c) — Stale: backend or frontend? Per-source or global?

**Recommendation: Backend decides "is this slot stale?" Per-source granularity in payload, frontend renders global indicator initially.**

### Backend decides
Frontend has zero knowledge of fetch outcomes, ETag state, or cache TTLs. The backend already classifies stale (`fetchResult.stale === true` flows through `anyStale`). Frontend should consume, not derive.

### Per-source granularity in payload, global in v1.2 UI
Currently the backend produces only a **global** `_stale` boolean + `_staleAsOf` timestamp at the top level. Recommend:

1. **Keep** the existing top-level `_stale` / `_staleAsOf` (no breaking change; v1.1 produced these even though never displayed).
2. **Add per-day staleness inside each `dayN` object** so future iteration can distinguish "Day 3 is stale but Day 1 is fresh." Cheap to add now, deferred to render later.

```js
day1: { ..., _stale: false, _staleAsOf: null },
day3: { ..., _stale: true,  _staleAsOf: 1714065600000 },
fireWeather: { ..., _stale: false }
```

### Frontend rendering for v1.2
Render a **single global indicator** when `this.spcrisk._stale === true` — small "(cached)" or clock-icon prefix near the top of the wrapper, with the `_staleAsOf` formatted relative ("cached 3h ago"). Do not yet annotate individual rows. Per-row rendering is a follow-up if/when granular data starts being acted on.

This keeps v1.2 scope tight (one visible UI change) while landing the data shape that supports per-row in a future pass without backend rework.

### Why not skip per-source for now?
Adding per-source to the payload is ~5 lines per `dayN` block (a local accumulator like `anyStale` scoped to that day). Doing it now is cheaper than retrofitting later because we're already touching every fetch site for proximity work.

---

## 5. Decision (d) — Where does the proximity config toggle live?

**Recommendation: Single module-level boolean, default `false`. No per-hazard toggles.**

```js
// MMM-SPCOutlook.js defaults
defaults: {
  lat: 35.22,
  lon: -97.44,
  extended: false,
  updateInterval: 60,
  proximityWeighting: false  // NEW
}
```

### Rationale
1. **YAGNI for per-hazard.** No realistic user wants "show proximity for tornado but not hail." The feature is a coherent display behavior, not a hazard preference.
2. **One flag = one code path to test.** Backend reads `payload.proximityWeighting`, computes (or skips) accordingly. Frontend reads `this.config.proximityWeighting` to gate render of `.proximity` badges.
3. **Default off** matches the milestone scope ("opt-in via config") and the constraint ("keep CPU usage low") — users who don't enable it pay zero cost.
4. **Plumbing:** Add `proximityWeighting` to the `GET_SPC_DATA` socket payload (alongside `lat`, `lon`, `extended`). Backend `getSpcOutlook` signature gains an optional param. Default arg `false` means existing call paths are safe.

### Flag also gates the per-fetch turf work
When `proximityWeighting: false`, the new code path short-circuits before any `pointToLineDistance` calls. The proximity object is simply never attached. This is the zero-regression contract.

---

## 6. Integration Points — Existing Code Touch Map

### File: `node_helper.js` (MODIFIED)

| Location | Change Type | Detail |
|---|---|---|
| `socketNotificationReceived` (~L29) | MODIFIED | Destructure `proximityWeighting` from payload; pass to `getSpcOutlook`. |
| `getSpcOutlook(lat, lon, extended)` signature (~L306) | MODIFIED | Add 4th param: `proximityWeighting = false`. |
| `fetchAndEvaluateHazard` signature (~L241) | MODIFIED | Add `computeProximity` flag; return shape becomes `{ risk, cig, stale, proximity }` where `proximity` is `{ risk: {...}, cig: {...} } | null`. |
| Day 1/2 cat blocks (~L383, L422) | MODIFIED | When `proximityWeighting`, compute `proximity.cat` after `evaluatePolygons`. |
| Day 3 cat block (~L460) | MODIFIED | Same as Day 1/2 cat. |
| Day 3 CIG block (~L493) | MODIFIED | Compute `proximity.cig` when flag on. |
| Day 1/2 hazard call sites (Tor/Hail/Wind, ~L400–L451) | MODIFIED | Pass `proximityWeighting` flag in; receive `proximity` from result; merge into per-day object before return. |
| Return objects (both extended/non-extended, ~L617, L784) | MODIFIED | Inject `proximity` into each `dayN` object when present; add per-day `_stale` flag. |
| **NEW helper: `computeProximity(items, loc, currentValue, comparator)`** | NEW | Module method. Given the polygon set + current best value, compute distance to next-higher-tier boundary (or to lowest tier if currentValue===0). Returns `{weighted, neighborTier, neighborTierName, distanceKm, direction}` or `null` if no meaningful neighbor (e.g. inside HIGH = no higher tier). |
| `_geoJsonCache` entries | MODIFIED | When proximity computed, cache result becomes `{value, proximity}` instead of bare scalar. Backwards-compatible read pattern: `typeof entry.result === 'object' && 'value' in entry.result ? entry.result.value : entry.result`. |

### File: `MMM-SPCOutlook.js` (MODIFIED)

| Location | Change Type | Detail |
|---|---|---|
| `defaults` (~L2) | MODIFIED | Add `proximityWeighting: false`. |
| `start` (~L13) | MODIFIED | Include `proximityWeighting` in `GET_SPC_DATA` payload (both initial send and setInterval send). |
| `getDom` no-risk guard (~L52) | MODIFIED | Existing guard untouched. Proximity badges only show alongside actual risks; "near MRGL but in NONE" stays under the no-risk-screen since the user-facing threshold for action is unchanged. |
| `getDom` Day 1/2/3 render (~L76, L87, L97) | MODIFIED | Append proximity badge text when `this.config.proximityWeighting && this.spcrisk.dayN.proximity?.cat`. |
| `getDom` CIG label injection (~L81–L83, L99) | MODIFIED | When `proximity.torCig`/`proximity.hailCig`/`proximity.windCig`/`proximity.cig` present, append "(near CIG2)" or "→ CIG3 0.75" form. |
| **NEW helper: `proximityBadge(prox, currentName)`** | NEW | Inline function in `getDom`, formats `{direction, neighborTierName, weighted}` → display string. Two formats per the spec. |
| **NEW: stale indicator render (~L70 area)** | NEW | At top of wrapper (after MD lines), if `this.spcrisk._stale`, prepend e.g. `<span style="color:#888">(cached ${formatRelative(this.spcrisk._staleAsOf)})</span><br/>`. |
| **NEW helper: `formatRelative(epochMs)`** | NEW | Local utility for "3h ago" formatting. |

### Files unchanged
- No new dependencies. turf already exposes `pointToLineDistance` and `polygonToLine`.
- No changes to MD flow, fire weather flow, or Day 4–8 flow.

---

## 7. Data Flow (v1.2)

```
User config (proximityWeighting: true)
        │
        ▼
Frontend.start() ──"GET_SPC_DATA" {lat, lon, extended, proximityWeighting}──▶ Backend
                                                                              │
                                          ┌───────────────────────────────────┘
                                          ▼
                          socketNotificationReceived → getSpcOutlook(lat, lon, extended, proximityWeighting)
                                          │
                                          ▼
                                For each layer:
                                  fetchGeoJsonCached(url) → {data, stale, ...}
                                  if data: extractPolygons → evaluatePolygons → bestValue
                                  if proximityWeighting:
                                      computeProximity(items, loc, bestValue, comparator)
                                        ├─ if bestValue > 0 && higherTierExists:
                                        │     turf.pointToLineDistance(loc, polygonToLine(higherTierPoly))
                                        │     → weighted = bestValue + (1 - distance/falloff)
                                        │     → direction: "up"
                                        ├─ if bestValue === 0 && anyTierExists:
                                        │     find nearest tier polygon
                                        │     turf.pointToLineDistance(loc, polygonToLine(nearestPoly))
                                        │     → weighted = nearestTierValue * proximityScale
                                        │     → direction: "down"
                                        └─ else: return null
                                  cache.set(url, {result: {value, proximity}, etag/hash, timestamp, mode})
                                  if stale: anyStale = true; perDayStale[d] = true
                                          │
                                          ▼
                          assemble response:
                            { _stale: anyStale, _staleAsOf: now,
                              day1: {..., _stale: perDayStale[1], proximity: {cat, torCig, ...} },
                              day2: {..., _stale: perDayStale[2], proximity: {...} },
                              day3: {..., _stale: perDayStale[3], proximity: {cat, cig} },
                              ... }
                                          │
        ┌─────────────────────────────────┘
        ▼
"SPC_DATA_RESULT" → Frontend.spcrisk = payload[0]
        │
        ▼
getDom() renders:
  if spcrisk._stale: prepend "(cached Xh ago)"
  for each dayN with risk:
     render existing row
     if config.proximityWeighting && dayN.proximity?.cat:
       append proximityBadge(prox.cat, dayN.risk)
     if dayN.proximity?.{torCig,hailCig,windCig,cig}:
       append per-hazard CIG proximity badge
```

---

## 8. Suggested Build Order (Roadmap Input)

The roadmap should sequence work so each phase compiles, runs, and visibly delivers value. Backend data shape MUST land before frontend can render it.

### Phase A — Stale Indicator (small, end-to-end, low risk)
Lands a complete user-visible feature first. Validates the "consume existing backend field" path before adding new computation.
1. **Backend:** Optionally add per-day `_stale` flags inside each `dayN` object (low cost; foundation for future per-row UX). Top-level `_stale`/`_staleAsOf` already exists — no backend work strictly required if per-day deferred.
2. **Frontend:** Read `this.spcrisk._stale` + `_staleAsOf`, render compact "(cached Xh ago)" line at top of wrapper.
3. **Test:** Manual — disconnect network briefly to force stale fallback; confirm indicator appears.

**Deliverable:** Visible stale indicator. v1.2 partial value already shipped.

### Phase B — Proximity Backend Foundation
Land the calculation engine + data shape with no UI yet. Validates math in isolation.
1. **NEW:** `computeProximity(items, loc, currentValue, comparator)` helper. Implement falloff function (linear by default, e.g. `weighted = current + max(0, 1 - distanceKm / falloffKm)` capped to next tier - epsilon).
2. **MODIFY:** `getSpcOutlook` signature gains `proximityWeighting` param; thread through.
3. **MODIFY:** `socketNotificationReceived` accepts `proximityWeighting` from payload.
4. **MODIFY:** `fetchAndEvaluateHazard` gains `computeProximity` flag + returns `proximity`.
5. **MODIFY:** `_geoJsonCache` entries store `{value, proximity}` when proximity present; preserve scalar-compat read path.
6. **MODIFY:** Day 1/2/3 cat blocks + Day 3 CIG block compute proximity inline (these are not under `fetchAndEvaluateHazard`).
7. **MODIFY:** Return objects inject `proximity` subtree per `dayN`.
8. **Test:** Toggle `proximityWeighting: true` in config, log `JSON.stringify(payload)` in frontend handler, confirm shape.

**Deliverable:** Backend produces correct proximity data. Verifiable via existing `Log.info` of payload. No frontend changes yet.

### Phase C — Proximity Frontend Render
Wire up the UI now that the data exists.
1. **MODIFY:** `defaults.proximityWeighting = false`.
2. **MODIFY:** `start()` includes flag in `GET_SPC_DATA` payload (both initial send and setInterval).
3. **NEW:** `proximityBadge(prox, currentName)` formatter inside `getDom`.
4. **MODIFY:** Day 1/2 cat row rendering appends badge.
5. **MODIFY:** Day 1/2 per-hazard probability lines extend `cigLabel` output with proximity badge for torCig/hailCig/windCig.
6. **MODIFY:** Day 3 row appends both cat and cig proximity badges.
7. **Test:** Manual — enable flag, observe live data, sanity-check badge text against SPC outlook map.

**Deliverable:** v1.2 complete.

### Why this order
- **Phase A is independent** — uses only existing backend fields. Ships a feature before any new computation is introduced. De-risks: if proximity work runs over, stale indicator still ships.
- **Phase B before C is mandatory** — frontend has nothing to render without the data shape. Doing them in a single phase risks a half-broken state if Phase B math takes longer than expected.
- **Phase B has its own validation path** (log payload) so it doesn't depend on Phase C to verify correctness.

---

## 9. Open Design Questions for Roadmap / Phase B

These are math/UX choices that don't change the architecture but need an owner during Phase B:

1. **Falloff function shape.** Linear (`1 - d/k`) vs exponential (`exp(-d/k)`)? Linear is simpler, exponential is smoother. Recommend linear for v1.2 with `falloffKm = 50` as a starting constant; expose in config later if users complain.
2. **Falloff cap.** Should `weighted` ever cross into the next tier's integer (e.g. 3.99 → display as ENH)? Spec says display as `"ENH → MDT 0.75"`, so cap at `nextTier - 0.01` to preserve current-tier identity in display. Document this.
3. **"No higher tier" handling.** Inside HIGH (value 6) there's no higher cat tier. `proximity.cat` should be `null` (or omitted) — the badge then suppresses.
4. **Outside-all-tiers polygon selection.** For "near SLGT", which polygon do we measure distance to — the SLGT polygon nearest to user, or any? Use nearest tier polygon by min distance, then compute weighted relative to that tier's value.
5. **Direction encoding.** Confirm `"up" | "down"` is sufficient; or do we want `"in"` for the case where current tier maxes out (no badge possible)?

These are flagged for the Phase B work plan, not blockers.

---

## 10. Risk / Pitfall Notes

| Risk | Likelihood | Mitigation |
|---|---|---|
| Cache-shape change (`{value, proximity}` vs scalar) breaks existing cached-result read paths | MED | Wrap all `entry.result` reads with helper `getCachedValue(entry)` that handles both shapes; or migrate all sites in same commit. |
| `pointToLineDistance` requires Polygon→Line conversion (`turf.polygonToLine`) — extra allocation per call | LOW | Memoize the line representation inside the polygon item at `extractPolygons` time when proximity flag is on. Trivial. |
| Per-day `_stale` flags require per-day accumulator threading through `fetchAndEvaluateHazard` | LOW | Minor signature tweak; same pattern as the existing `stale` return field. |
| Frontend `getDom()` becomes dense with conditionals | MED | Extract `renderDayRow(day, dayObj, dow)` helper to keep readability. Optional but recommended during Phase C. |
| Stale data UX: "(cached 3h ago)" might look alarming when actually within updateInterval | LOW | Only render indicator when `_stale === true` (already gated by backend's stale-fallback semantics, not just "older than X"). |

---

## 11. Summary

- **Compute proximity backend-side**, cache it alongside polygon results in `_geoJsonCache`, gate all work behind a single module-level `proximityWeighting` flag (default off, zero regression).
- **Data shape:** add a `proximity` subtree to each `dayN` object (`{cat, torCig, hailCig, windCig, cig}`), each entry being `{weighted, neighborTier, neighborTierName, distanceKm, direction}` or absent. Existing scalar fields stay unchanged.
- **Stale:** backend already produces global `_stale`/`_staleAsOf`; add per-day `_stale` for future use; frontend renders only the global indicator in v1.2.
- **Build order:** Phase A (stale indicator) → Phase B (proximity backend + shape) → Phase C (proximity frontend render). A and B/C are independent; B must precede C.
- **Touched files:** `node_helper.js` (modified throughout, plus 1 new helper), `MMM-SPCOutlook.js` (modified `defaults`/`start`/`getDom`, plus 2 small inline helpers). No new files, no new deps.
