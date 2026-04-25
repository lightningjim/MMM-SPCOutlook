# Pitfalls Research

**Domain:** MagicMirror² module — adding turf.js distance/proximity weighting and stale-data UI to existing point-in-polygon backend on Raspberry Pi
**Researched:** 2026-04-25
**Confidence:** HIGH (codebase-grounded) / MEDIUM (turf.js workaround patterns confirmed via Turf.js Issue #1743)

## Critical Pitfalls

### Pitfall 1: Calling pointToLineDistance directly on a MultiPolygon

**What goes wrong:**
`turf.pointToLineDistance` accepts only `LineString` / `MultiLineString` inputs. Passing a `MultiPolygon` (or even a Polygon) silently returns garbage or throws — there is no native point-to-polygon distance in turf as of v7.x. The naive workaround "convert with `polygonToLine` then call distance" works for a single Polygon, but for a MultiPolygon `polygonToLine` returns a FeatureCollection of LineStrings (one per ring, including holes), which `pointToLineDistance` cannot consume in a single call.

**Why it happens:**
Day 1 categorical SPC outlooks frequently arrive as `MultiPolygon` features (multiple disjoint risk areas across CONUS) plus interior holes. The existing `extractPolygons` already handles both `Polygon` and `MultiPolygon` correctly for `booleanPointInPolygon`, so it is tempting to assume distance functions take the same input.

**How to avoid:**
Build a small helper `distanceToPolygonBoundary(pt, polyFeature)` that:
1. Runs `turf.flatten(polyFeature)` to expand a MultiPolygon into individual Polygons.
2. For each Polygon, calls `turf.polygonToLine(p)` — which can return either a `LineString` (no holes) or a `MultiLineString` (with holes / multiple rings). Handle both: if MultiLineString, iterate `geometry.coordinates` and wrap each as a LineString.
3. Take `Math.min(...)` of `pointToLineDistance(pt, line, { units: 'kilometers' })` across every ring.
4. Cache the per-feature flattened-line representation on the cache entry alongside `result` so it is computed once per polygon refresh, not once per render.

**Warning signs:**
- Distance values that are absurdly large (millions of km) or `NaN` — input type mismatch.
- Distance reported even when the point is clearly inside the polygon (should be 0 or skipped — see Pitfall 2).
- Per-evaluation latency on RPi spiking from the existing ~5–15 ms baseline into hundreds of ms.

**Phase to address:**
Proximity-implementation phase. Pre-implementation spike: write a 20-line script that loads `day1otlk_cat.lyr.geojson`, runs the helper against a known interior and known exterior point, and asserts both finite kilometer values.

---

### Pitfall 2: Computing distance when the point is inside the higher tier already

**What goes wrong:**
"Distance to next-higher tier" is undefined when the point is already in the higher tier. If you blindly compute `pointToLineDistance` from inside a polygon you get the distance to the *nearest boundary* (a positive number) — meaningful geometrically, but not what the badge implies. UI ends up showing `MDT → HIGH 12 km` while the user is already in HIGH and seeing the HIGH categorical color. Confusion follows.

**Why it happens:**
`pointToLineDistance` doesn't know about containment. It just measures geometry. Developers conflate "distance from point to polygon" with "distance to entry/exit of polygon."

**How to avoid:**
Before calling distance, run `booleanPointInPolygon` against the higher-tier polygon. Branch:
- Inside higher tier → no proximity badge needed (the categorical render already conveys it). Set `weight = 1.0` and skip distance calc.
- Outside higher tier → compute distance and weight.
The existing `evaluatePolygons` already iterates with `booleanPointInPolygon`; reuse the result rather than calling it twice.

**Warning signs:**
- Badge text contradicts the primary risk color (e.g. red `HIGH` background with `MDT → HIGH 8 km` annotation).
- Weight values > 1 or near 1.0 when the user is clearly inside the lower tier.

**Phase to address:**
Proximity-implementation phase. Add an assertion: pick three test points (deep interior of HIGH, on the SLGT/MDT boundary, far outside) and snapshot the expected `(insideTier, weight)` tuple.

---

### Pitfall 3: Coordinate order — codebase uses [lon, lat] for turf

**What goes wrong:**
GeoJSON spec is `[lon, lat]`. The codebase already uses `turf.point([lon, lat])` consistently (see `node_helper.js:374` and `:879`). The risk during this milestone: the new proximity helper is written by reflex with `[lat, lon]` — distances become wildly wrong (a 1° lat error near 35°N mislocates by ~111 km, a 1° lon error by ~91 km) and the badge shows the user perpetually "near MDT" everywhere.

**Why it happens:**
Most weather APIs and the user-facing config order is "lat, lon." Mixing the two conventions inside the same file causes silent, plausible-looking bugs.

**How to avoid:**
- Pass an already-constructed `loc` (turf point) into the new proximity helper — never raw lat/lon. The existing pattern (`const loc = turf.point([lon, lat]);` at line 374, threaded through `fetchAndEvaluateHazard`) is correct; extend it.
- Add a one-time sanity assertion at startup: distance from `loc` to a known landmark within an expected range; log and bail loudly if not.
- Code-review checkpoint: grep new code for `lat, lon` argument order and `[lat, lon]` array literals — both should be absent in turf-call sites.

**Warning signs:**
- Distances orders of magnitude off (10,000+ km in CONUS).
- Proximity badges fire in obviously wrong locations (e.g. user in OKC reported as "near" a polygon over the Atlantic).

**Phase to address:**
Proximity-implementation phase, enforced via grep checklist in plan.

---

### Pitfall 4: Great-circle vs planar — silent units mismatch

**What goes wrong:**
`pointToLineDistance` returns kilometers by default but accepts a `{ units }` option (`'degrees' | 'radians' | 'miles' | 'kilometers'`). If two callers disagree (one uses default km, another passes `'miles'`), the falloff thresholds become nonsense. Worse: turf v7 supports both `'geodesic'` and `'planar'` methods; using planar over CONUS-scale distances introduces meaningful error (a few % at hundreds of km), which is *not* catastrophic but pushes weight values across thresholds inconsistently.

**Why it happens:**
Defaults are easy to forget. Documentation reads "returns distance" without forcing the units choice at call site.

**How to avoid:**
- Centralize: define one `PROXIMITY_UNITS = 'kilometers'` and one `PROXIMITY_METHOD = 'geodesic'` constant at top of `node_helper.js`. Pass both explicitly to every `pointToLineDistance` call.
- Pin the falloff function to those units (e.g. `weight = 1 - clamp(d_km / 50, 0, 1)`) and document the unit in the inline comment next to the constant.
- Verify against a hand-checked landmark distance (e.g. OKC → Tulsa ≈ 160 km) at module start in dev mode.

**Warning signs:**
- Sudden jumps in weight values when a turf version bump occurs.
- Badge thresholds firing at obviously wrong distances.

**Phase to address:**
Proximity-implementation phase. Constant + explicit option object in the helper signature.

---

### Pitfall 5: No higher-tier polygon for the day → graceful degrade

**What goes wrong:**
On many days, only MRGL or SLGT polygons exist for Day 1; no MDT or HIGH polygon at all. The proximity code asks "distance to next-higher tier" and finds an empty input set. Naive code returns `Infinity`, `null`, or — worst — throws inside the render loop and hides the entire risk display behind an error.

**Why it happens:**
SPC issues categorical outlooks tier-by-tier; the existence of higher tiers is data-dependent and varies daily. Day 4–8 outlooks rarely have anything above SLGT.

**How to avoid:**
- Make the "next-higher tier" lookup explicit: build the tiered polygon set once after the categorical fetch, then iterate from `currentTier + 1` upward. If no polygon exists at any higher tier, return `{ adjacent: null, distanceKm: null, weight: 0 }`.
- Render layer: only draw the badge when `adjacent !== null`. Keep it visually identical to the no-proximity case otherwise.
- Add an explicit assertion for: (a) inside HIGH (no higher tier ever), (b) inside SLGT but no MDT issued today, (c) NONE everywhere.

**Warning signs:**
- Badge text reading "→ undefined" or "→ NaN km".
- Display blanking on otherwise quiet weather days.
- Errors in MagicMirror logs only on no-risk days.

**Phase to address:**
Proximity-implementation phase. Explicit null-result branch in helper + display guard.

---

### Pitfall 6: Precision jitter — weight flicker between updates

**What goes wrong:**
SPC outlooks update on a fixed schedule (Day 1: 0600/1300/1630/2000/0100 UTC; Day 2: 0600/1730 UTC). Between updates the polygons are static, so the weight should be stable. But if the helper recomputes weight from scratch each render and the falloff uses high-precision floats, the displayed badge can flicker between, e.g., `0.59` and `0.60` due to floating-point representation across separate evaluations — even with no underlying data change. With the current 60-minute update interval this is mostly invisible, but a future user setting `updateInterval: 5` will see flicker.

**Why it happens:**
`Math.min(...)` over many `pointToLineDistance` calls + a continuous falloff function = many opportunities for last-bit float drift. Compounded by `100 * day1.torRisk + "%"` style display already in the codebase.

**How to avoid:**
- Cache the computed weight on the cache entry alongside `result`, keyed to the same ETag/hash that drives the polygon cache. If the polygon hasn't changed and the location hasn't changed, return the cached weight verbatim — no recomputation.
- Display layer: round to 2 significant figures (`weight.toFixed(2)`) before stringifying.
- Consider banding (e.g. snap to nearest 0.05) — visually cleaner and immune to last-bit drift.

**Warning signs:**
- Badge value changing on every update tick despite SPC not having issued a new outlook.
- Subjective "twitchy" feel at short update intervals during user testing.

**Phase to address:**
Proximity-implementation phase. Caching is essentially free given `_geoJsonCache` already exists.

---

### Pitfall 7: Stale-detection clock skew — server time vs RPi local time

**What goes wrong:**
The existing `_isWithinStaleWindow` uses `Date.now() - timestamp` where `timestamp` was set by `Date.now()` at fetch. Both calls are local — *consistent with each other*, so the stale-window comparison is safe. The trap appears if v1.2 introduces any of:
1. Surfacing "data as of HH:MM" using the SPC-published issuance time (parsed from GeoJSON properties or HTTP `Last-Modified`) without acknowledging the RPi clock may be wrong (RPi has no RTC; if NTP fails on boot, system time can be hours/days off).
2. Comparing `_staleAsOf` (set on backend with `Date.now()`) against `new Date()` on the front-end — same machine, same clock, fine. But if MagicMirror is run remotely in some setups, the two clocks differ.
3. Showing relative times ("5 minutes ago") that go negative because the issuance timestamp is in the future relative to a misset RPi clock.

**Why it happens:**
RPi 4/5 lacks an RTC. After an unclean shutdown or extended power loss, system time defaults to the last known time or epoch until NTP succeeds. Module starts before NTP finishes on slow networks.

**How to avoid:**
- Display "Stale" as a binary state, not a "X minutes ago" countdown, in the first cut.
- If showing relative age, clamp to non-negative (`Math.max(0, Date.now() - asOf)`) and display "just now" for any value < 60 s.
- For "data issued HH:MM" labels, use the SPC-published time directly as a string ("Issued 13:00 UTC") rather than computing relative offsets — the absolute label remains correct regardless of local clock.
- Front-end and backend both run on the same RPi process tree; `_staleAsOf` set with `Date.now()` on backend and consumed on front-end is consistent. Document this assumption explicitly.

**Warning signs:**
- "Stale" badge showing immediately on fresh fetch (clock jumped backward during fetch).
- Negative relative times in display ("Updated -3 minutes ago").
- "Stale" never clearing despite successful fetches.

**Phase to address:**
Stale-indicator phase. Keep first iteration boolean-only.

---

### Pitfall 8: Stale-window logic assumes config.updateInterval — but node_helper has no this.config

**What goes wrong:**
`_isWithinStaleWindow` reads `this.config?.updateInterval ?? 60`. Reviewing the codebase: **`this.config` is never set on the node_helper** — `MMM-SPCOutlook.js` has `defaults`/`config`, but the backend only receives `payload` from socket notifications and doesn't store config anywhere. The optional-chain + nullish-coalesce silently falls through to `60`, so the function works *coincidentally* because the default matches. If a user sets `updateInterval: 10`, the stale window remains 60 minutes — masking missed fetches for almost an hour.

**Why it happens:**
The `?.` and `??` operators turn what should be a TypeError into a silent default. Easy to ship and never notice.

**How to avoid:**
- Pass `updateInterval` through the existing `GET_SPC_DATA` payload (already has `lat`, `lon`, `extended` — add `updateInterval`).
- In `socketNotificationReceived`, store it on `this._updateIntervalMin = payload.updateInterval ?? 60;`.
- Update `_isWithinStaleWindow` to read `this._updateIntervalMin` instead of `this.config?.updateInterval`.
- This is a pre-existing latent bug; v1.2 stale-indicator work should fix it as a prerequisite, otherwise the new UI surface will mislead users on non-default intervals.

**Warning signs:**
- Setting `updateInterval: 5` and not seeing stale fallback for ~60 minutes during a NOAA outage.
- `this.config` referenced in node_helper.js (it should not be).

**Phase to address:**
Stale-indicator phase, as a prerequisite refactor.

---

### Pitfall 9: fetchAndEvaluateHazard return-signature change ripples through 6 call sites

**What goes wrong:**
Adding proximity to Convective Day 1–3 + CIG tiers naturally extends `fetchAndEvaluateHazard` to also return `{ adjacent, distanceKm, weight }`. The current return is `{ risk, cig, stale }` and is destructured at 6 call sites in `getSpcOutlook` (Day1 tor/hail/wind, Day2 tor/hail/wind). Day 3 cat/prob/cig are inlined separately — *not* using the helper — so they need parallel changes.

The risk: a partial refactor (helper updated, Day 3 inline blocks not updated) ships an inconsistent feature set where Day 1–2 have proximity badges and Day 3 silently doesn't, despite the spec including Day 3.

**Why it happens:**
Day 3 was inlined in v1.0 because the cat/prob structure differs from Day 1–2 (separate `_cat` and `_prob` URLs, no torn/hail/wind split). It was never DRYed into the helper. Easy to miss.

**How to avoid:**
- Before implementation: grep `fetchAndEvaluateHazard` to inventory all 6 call sites; grep `day3` blocks to inventory the inlined logic.
- Either (a) extract a Day 3-shaped helper alongside the existing one, or (b) implement proximity as a separate post-step that takes any `{label, value, poly}[]` and a current-tier value, decoupling it from `fetchAndEvaluateHazard`'s shape entirely. Option (b) is cleaner — proximity is an orthogonal concern to fetch+evaluate.
- Guard with a "proximity coverage checklist" in the phase: Day1Tor / Day1Hail / Day1Wind / Day2Tor / Day2Hail / Day2Wind / Day3Cat / Day1CigTor / Day1CigHail / Day1CigWind / Day2CigTor / Day2CigHail / Day2CigWind / Day3Cig — verify each emits a badge field.

**Warning signs:**
- Day 1 shows proximity badge, Day 3 doesn't, despite both being in scope.
- Destructuring failures (`undefined.adjacent`) at unexpected call sites.

**Phase to address:**
Proximity-implementation phase. Decide refactor strategy in the planning step before writing code.

---

### Pitfall 10: extractPolygons throws away features with `value === 0` — but those are needed for proximity

**What goes wrong:**
`extractPolygons` filters via `(label, val) => val > 0`. For categorical layers this drops the implicit "TSTM/none" polygon. Fine for `evaluatePolygons` (we want the max risk). **Not fine for proximity:** to know "distance to next-higher tier" you need the *higher* polygons, but to know "which tier the point falls in to start" you need the *current* polygon. The current code computes the current tier via `evaluatePolygons` and that's sufficient. But if a future refactor switches the filter, proximity could break silently.

A subtler version: when the point is in NONE (outside all polygons) and proximity is on, "next higher" is the lowest-tier polygon (MRGL). The helper must be allowed to look at MRGL polygons even when current tier is NONE. With the current `val > 0` filter MRGL is preserved, but if SLGT is treated as the floor of "interesting tiers" then jumping straight to SLGT skips MRGL entirely.

**Why it happens:**
Filter predicates baked into the data extraction layer become invisible to downstream consumers.

**How to avoid:**
- Document in the proximity helper: "expects the full ordered set of tier polygons including the lowest tier of interest."
- In implementation: extract polygons once with `val >= 0` (all-tiers) into a tiered map `{ 1: [...], 2: [...], 3: [...], ... }`, derive `currentTier` from it, derive `nextHigherTier` from it. Single source of truth.
- Add an assertion in dev mode: tier polygon sets per day are non-decreasing in count from MRGL to HIGH (monotonic containment is roughly true for SPC outlooks).

**Warning signs:**
- Proximity badge skipping tiers (e.g. "in MRGL → ENH" with no mention of SLGT).
- Display shows "in NONE → SLGT" when an MRGL polygon clearly exists and is closer.

**Phase to address:**
Proximity-implementation phase.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Convert MultiPolygon to lines on every render call | Skips caching design | Burns RPi CPU — `polygonToLine` + `flatten` on Day 1 cat polygon is 50–500 ms per call | Never — cache on `_geoJsonCache` entry |
| Recompute weight inside `getDom()` instead of in `node_helper` | Front-end has direct access to SPC data | Heavy turf math on the render thread breaks the "backend does math" architectural decision | Never |
| Use `setTimeout(updateDom, 0)` to mask flicker from weight jitter | Visually quiets the symptom | Hides the underlying float-drift bug; symptom returns at shorter intervals | Never — fix at source via caching + rounding |
| Skip the `_isWithinStaleWindow` config refactor and just hardcode 60 min | Fewer files touched | Stale window silently wrong for any non-default `updateInterval` | Never (latent bug; fix as prereq) |
| Show "Stale" by reading `_stale` only, ignoring `_staleAsOf` | Single field to consume | Loses ability to show "stale since HH:MM" later without backend change | Acceptable for v1.2 first cut; document as deferred |
| Compute proximity for Day 4–8 too "while we're at it" | Feels complete | Day 4–8 polygons are coarser and the proximity signal is meteorologically meaningless at that lead time | Out of scope per spec — resist scope creep |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| MagicMirror² socket notifications | Sending the new proximity result as a separate notification | Extend the existing `SPC_DATA_RESULT` payload — same envelope, additive fields. Front-end stays single-handler. |
| MagicMirror² `getDom()` | Mutating `wrapper.innerHTML` with `+=` to add a badge after the risk text | Continue the existing string-concat pattern (already in use throughout `getDom`); don't introduce a virtual-DOM library for one badge. Keep it consistent. |
| turf.js v7 ESM/CJS | Importing a sub-package (`@turf/point-to-line-distance`) and tree-shaking-by-hand | The codebase already does `require("@turf/turf")` (full bundle). Stay with that — sub-package mixing has caused version-skew bugs in MM² modules historically. |
| NOAA SPC GeoJSON | Assuming polygon ring winding is correct (CCW outer, CW holes) | SPC's GeoJSON is mostly correct; `pointToLineDistance` is winding-agnostic; `booleanPointInPolygon` is more sensitive but already known-working against this data. |
| Cache invalidation on location change | Forgetting to also invalidate proximity-cached weights when lat/lon changes | The existing location-change invalidation at `node_helper.js:309–317` zeroes `result` and `timestamp`. Extend it to also clear any new `weight` / `distanceKm` fields stored on the entry. |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running `polygonToLine` + `pointToLineDistance` on every render tick | RPi load spike every minute; `getDom` lag | Cache flattened-line representation per polygon refresh, not per render | Immediately on RPi 3/4 with default `updateInterval: 60` |
| Iterating all features in extractPolygons twice (once for current tier, once per higher tier) | 2–6× turf calls per evaluation | Single-pass: build tiered polygon map once, reuse for current + higher lookups | At Day 1 outlook with all 6 tiers present (rare but real on active days) |
| Forgetting to short-circuit when current tier == max tier (HIGH) | Wasted distance calls returning `null` anyway | Early return `{ adjacent: null }` when `currentTier === 6` | On HIGH risk days (rare; 1–5 per year nationally) |
| Computing distance to *every* ring in MultiPolygon, including holes | Each Day 1 cat polygon can have 5–20 rings | Use `Math.min` over `flatten`'d single-Polygons; consider treating outer ring only, accepting hole-distance as approximation | When SPC issues complex MultiPolygon with holes (common in winter mixed-mode events) |
| Re-fetching the full GeoJSON because proximity needs "different data" | Doubled network + parse cost | Proximity uses the *same* polygon set already fetched for `evaluatePolygons` — feed it through, don't refetch | Easy mistake during implementation |

## Security Mistakes

(Limited applicability — this is a read-only display module fetching public NOAA data on a single-user RPi.)

| Mistake | Risk | Prevention |
|---------|------|------------|
| Trusting LABEL/DN values from GeoJSON without validation in proximity mapping | Crash if SPC changes label scheme mid-cycle | Continue `cigToTier[label] \|\| 0` fallback pattern already used; new tier-map should follow same defensive default |
| Logging full GeoJSON payload at INFO level when adding stale debug | Fills RPi log partition | Keep `Log.info` for one-line summaries only; gate any geometry logging behind a `config.debug` flag |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Flashing/blinking "STALE" badge | Eye drawn away from actual risk; defeats the at-a-glance value | Static text marker. A subtle "(stale)" suffix or muted color, not animated. |
| Color-changing the entire risk display when stale | User mistakes stale state for a *new* risk level | Keep the categorical color authoritative; layer staleness as a separate, smaller indicator |
| Proximity badge with more visual weight than the categorical risk | "Near MDT" reads louder than "currently in SLGT" — inverted information hierarchy | Smaller font, subdued color, parenthetical placement: `SLGT (0.6 → MDT)` |
| Showing weight as raw float "0.5832" | Reads as fake precision | Round to 2 sig figs (`0.58`) or band into 5 buckets (low/lo-med/med/med-hi/hi) |
| Showing proximity badge inside the higher tier "for completeness" | Contradicts primary display (Pitfall 2) | Suppress badge when inside higher tier; categorical color already conveys it |
| Stale indicator that disappears the moment fetch completes (even if cached/304) | User loses signal that data is "as of recently" rather than "as of now" | "Stale" should reflect actual data age, not fetch-attempt recency. Tie to `_staleAsOf` not to fetch event. |
| Badge appears/disappears between updates due to weight crossing threshold | Visual flicker; eye distraction | Hysteresis: enter "near" state at weight ≥ 0.5, exit only at weight < 0.4 |
| Different proximity treatment for tor/hail/wind hazards on the same day | Display becomes a wall of badges | Show proximity at most once per day-row, on the highest-tier hazard, OR consolidate to a single Day-level badge |

## "Looks Done But Isn't" Checklist

- [ ] **Proximity helper:** Verified against MultiPolygon input — not just single Polygon test data
- [ ] **Proximity helper:** Returns `null` cleanly when no higher tier exists for that day
- [ ] **Proximity helper:** Returns `weight: 1.0` (or skips) when point is inside higher tier
- [ ] **Proximity helper:** Distance units constant + method constant referenced explicitly at every call site (no defaults)
- [ ] **Proximity helper:** Coordinate order verified — `[lon, lat]` everywhere, no `[lat, lon]` slip
- [ ] **Proximity coverage:** All 14 hazard surfaces in scope (Day1/2 tor+hail+wind+CIG×3, Day3 cat+CIG) emit badge data — verify with checklist
- [ ] **Proximity caching:** Weight stored on `_geoJsonCache` entry, invalidated on location change alongside `result`
- [ ] **Stale indicator:** Works at non-default `updateInterval` values (test with 10 and 120)
- [ ] **Stale indicator:** `_isWithinStaleWindow` reads from passed-through config, not `this.config?.` (latent bug fixed)
- [ ] **Stale indicator:** Renders binary-only (no negative relative times)
- [ ] **Stale indicator:** Visually subordinate to risk display (smaller, muted, no animation)
- [ ] **Config gate:** Proximity feature opt-in via `config.proximity` (or similar) — defaults to off, doesn't change existing user installs
- [ ] **Config gate:** Front-end gracefully handles backend that doesn't yet emit proximity fields (forward/backward compat for users who upgrade backend before frontend or vice versa)
- [ ] **No-risk display path:** "No Severe Weather Risk" guard at `MMM-SPCOutlook.js:52` still triggers correctly when proximity is enabled but no risks exist
- [ ] **Hysteresis:** Badge appearance threshold differs from disappearance threshold to prevent flicker

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Coordinate order bug shipped | LOW | Single-line fix; users see immediate correction on next update tick |
| MultiPolygon distance returning garbage | LOW | Ship hotfix with `flatten` + per-line min; cached values self-heal on next fetch |
| Weight flicker reported by user | LOW | Add rounding/banding in display layer; no backend change needed |
| Stale window silently wrong for non-default intervals | MEDIUM | Requires payload + handler change in both files; coordinated release |
| Proximity scope creep into Day 4–8 already shipped | MEDIUM | Feature flag rollback; user-visible UI change |
| Flashing badge UX backlash | LOW | CSS-only adjustment; instant fix |
| Performance regression on RPi 3 | MEDIUM | Add caching layer; if insufficient, gate proximity behind `config.proximity` opt-in (already planned) so users opt in to the cost |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1: pointToLineDistance on MultiPolygon | Proximity-implementation | Pre-implementation spike against live Day 1 cat polygon |
| 2: Distance when inside higher tier | Proximity-implementation | Three-point assertion (interior/boundary/exterior) |
| 3: Coordinate order [lon,lat] | Proximity-implementation | Grep checklist + landmark sanity assertion |
| 4: Units / great-circle vs planar | Proximity-implementation | Centralized constants; landmark distance check |
| 5: No higher tier exists | Proximity-implementation | Null-result branch + display guard; quiet-day test |
| 6: Weight precision jitter | Proximity-implementation | Cache weight + display rounding; observe at `updateInterval: 5` |
| 7: Clock-skew stale detection | Stale-indicator | Boolean-only first cut; document RPi clock assumption |
| 8: `this.config` not on node_helper | Stale-indicator (prereq) | Test at `updateInterval: 10` and `120` |
| 9: 6 call sites + Day 3 inlined | Proximity-implementation (planning step) | Coverage checklist before writing code |
| 10: extractPolygons val>0 filter | Proximity-implementation | Tiered-map single-pass extraction |

## Sources

- [Turf.js Issue #1743 — Distance to Polygon / MultiPolygon from Point](https://github.com/Turfjs/turf/issues/1743) — confirms no native point-to-polygon distance; documents `polygonToLine` + `pointToLineDistance` workaround pattern
- [polygonToLine | Turf.js](https://turfjs.org/docs/api/polygonToLine) — confirms returns LineString or MultiLineString depending on hole presence
- [flatten | Turf.js](https://turfjs.org/docs/api/flatten) — MultiPolygon → individual Polygons
- [pointToLineDistance | Turf.js](https://turfjs.org/docs/api/pointToLineDistance) — units + method options
- Codebase grounding: `node_helper.js` (lines 159–162 stale window; 241–290 fetchAndEvaluateHazard; 309–317 location invalidation; 374, 879 turf.point [lon,lat] convention) and `MMM-SPCOutlook.js` (lines 13, 18, 52 socket + render structure)
- `.planning/PROJECT.md` — milestone scope, constraints, known tech debt

---
*Pitfalls research for: MMM-SPCOutlook v1.2 — proximity weighting + stale indicator on Raspberry Pi*
*Researched: 2026-04-25*
