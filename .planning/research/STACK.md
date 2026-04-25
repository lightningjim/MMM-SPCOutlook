# Technology Stack — v1.2 QoL Enhancements

**Project:** MMM-SPCOutlook
**Milestone:** v1.2 (stale data UI indicator + proximity-weighted risk)
**Researched:** 2026-04-25

## TL;DR

**No new dependencies required.** The existing stack already covers both v1.2 features:

- Proximity weighting: `@turf/turf ^7.2.0` (currently resolved to 7.3.4) ships every primitive needed — `pointToLineDistance`, `polygonToLine`, `nearestPointOnLine`, `distance`, `flatten`, `booleanPointInPolygon`. All verified by direct runtime require against `node_modules/@turf/turf`.
- Stale indicator: `moment` is pre-loaded as a frontend global by the MagicMirror² runtime (vendored via `js/vendor.js`). Use `moment(ts).fromNow()` for human-readable age. No package install needed; optionally add `moment` to `package.json` peerDeps for documentation purposes only.

The recommendation: **do not bump turf, do not add submodules, do not pull in d3-geo.**

## Recommended Stack (additions only)

### Geometry — proximity weighting

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `@turf/turf` | `^7.2.0` (resolved 7.3.4) | Distance from point to polygon ring; nearest point on adjacent-tier ring; conversion polygon → line | Already integrated in `node_helper.js` line 3; consistent API surface; `turf.distance` already returns kilometers; no need to mix two geometry libs |

Functions used (all confirmed present at runtime in installed 7.3.4 build):

```js
turf.polygonToLine(polygon)        // Polygon|MultiPolygon → LineString|MultiLineString of rings
turf.flatten(featureCollection)    // MultiPolygon → individual Polygons (needed because pointToLineDistance wants single geometries)
turf.pointToLineDistance(pt, line) // signed-distance helper; returns km by default
turf.nearestPointOnLine(line, pt)  // optional — useful for diagnostic logging / debugging
turf.distance(ptA, ptB)            // already implicit; available if a manual fallback is preferred
turf.booleanPointInPolygon(...)    // already used; reused for "inside which tier" checks
```

**Tree-shaking note:** the project uses the `@turf/turf` umbrella package, not individual `@turf/point-to-line-distance` etc. Stay with the umbrella — bundle size is irrelevant on the Node side (this is backend), and switching to per-function packages would force changes across the existing `node_helper.js` import. Per-submodule installs are a tree-shaking optimization for browser bundles only.

### Time formatting — stale indicator

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| `moment` | (runtime-vendored, no install) | Format `_staleAsOf` timestamp as relative time ("3 hours ago") in `getDom()` | MagicMirror² convention; available as a frontend global via `js/vendor.js`; matches Calendar/Clock module style; no new dep added |

Frontend-only usage. Backend already populates `_staleAsOf: Date.now()` (node_helper.js lines 617, 784) — frontend just needs:

```js
// in MMM-SPCOutlook.js getDom()
if (this.spcrisk._stale) {
  const ageStr = moment(this.spcrisk._staleAsOf).fromNow(); // "3 hours ago"
  wrapper.innerHTML += `<span style="color:#888">⚠ Cached data — last updated ${ageStr}</span><br/>`;
}
```

**Optional but recommended:** add `"moment": "^2.30.0"` to `package.json` `peerDependencies` (not `dependencies`) to make the runtime requirement explicit without forcing a duplicate install. This matches MM² module guidance to document but not vendor moment.

## Alternatives Considered (and rejected)

| Need | Considered Alternative | Why Not |
|------|-----------------------|---------|
| Distance to polygon edge | `d3-geo` `geoDistance` / `geoArea` | Adds 50+ KB and a second geometry mental model; turf already provides `pointToLineDistance` with identical accuracy on WGS84 |
| Distance to polygon edge | Manual haversine over polygon vertices | Reinvents `pointToLineDistance`; misses edge interpolation (closest point may be along an edge, not at a vertex) |
| Distance to polygon edge | `@turf/point-to-line-distance` standalone submodule | Existing import is `require("@turf/turf")` umbrella; switching forces refactor with zero runtime benefit on backend |
| Bump turf to ^7.3 explicitly | Update `package.json` to `^7.3.4` | `^7.2.0` already resolves to 7.3.4 in the lockfile; bumping the manifest is busywork. Leave as-is unless a 7.3-only API is required (it isn't). |
| Stale time formatting | `Intl.RelativeTimeFormat` (native) | Works, but every other MM² module uses moment; mixing is gratuitous. Stay consistent with framework convention. |
| Stale time formatting | Add `date-fns` | New dep for one `formatDistanceToNow` call; moment is already free via the runtime. |

## Installation

**Nothing to install.** Optional doc-only manifest update:

```bash
# OPTIONAL — purely declarative, no behavior change
npm pkg set peerDependencies.moment="^2.30.0"
```

If this milestone re-runs `npm install` for any other reason, `@turf/turf ^7.2.0` will continue to resolve to ≥7.3.4, which has all required functions.

## Integration Points in `node_helper.js`

All proximity work fits the existing helper shape — extend, don't replace:

1. **`extractPolygons` (line 79):** Currently returns `{ label, value, poly }`. For proximity, also retain the line representation. Either:
   - Compute lazily inside the new evaluator, or
   - Extend the returned object to `{ label, value, poly, line }` where `line = turf.polygonToLine(poly)`.
   Lazy is preferred — proximity is opt-in via config, so don't pay the conversion cost when disabled.

2. **New helper alongside `evaluatePolygons` (line 101):** `evaluateProximity(items, loc, currentTier)` returns `{ tier, distanceKm, nextTier, weight }`. Keep `evaluatePolygons` untouched so non-proximity callers are unaffected.

3. **Call sites:** Convective Day 1/2 (`fetchAndEvaluateHazard`, line 241) and Day 3 categorical/prob block (line 458–503), plus the three CIG tiers. Gate the proximity call behind `this.config.proximityWeighting` (passed in from frontend payload, like `extended` already is).

4. **Return shape additions:** Add optional fields to existing `day1`/`day2`/`day3` and CIG sub-objects — e.g. `day1.proximity = { nextTier: "MDT", weight: 0.75 }` — keeping all current fields intact so the frontend can render conditionally.

5. **No changes to:** `fetchGeoJsonCached`, ETag/SHA256 layer, KMZ/MD pipeline, fire weather paths.

## What NOT to Add

- **`d3-geo`** — duplicates turf functionality
- **`@turf/point-to-line-distance`** (or any standalone @turf/* submodule) — umbrella package already covers it; mixing styles invites version drift
- **`date-fns` / `dayjs`** — moment is already vendored by MM²; one library is enough
- **`luxon`** — same reason
- **Any test framework** — explicitly out of scope per PROJECT.md "Out of Scope" list
- **Frontend turf bundle** — proximity math stays in `node_helper.js`; do not ship turf to the renderer

## Confidence Assessment

| Claim | Confidence | Source |
|-------|-----------|--------|
| Required turf functions exist in installed 7.3.4 | HIGH | Direct `node -e require("@turf/turf")` verification; all 7 target functions returned `function` |
| `^7.2.0` resolves to ≥7.3.4 | HIGH | `node_modules/@turf/turf/package.json` inspection |
| `pointToLineDistance` returns km by default | HIGH | turf.js documented behavior (consistent across 6.x/7.x) |
| `moment` available as frontend global in MM² | HIGH | MM² docs + community forum confirmation; vendored via `js/vendor.js` |
| Backend already emits `_stale`/`_staleAsOf` | HIGH | Direct read of `node_helper.js` lines 617, 784 |
| No bundle-size concern (backend only) | HIGH | Deployment is RPi Node process; turf umbrella size doesn't affect render thread |

## Sources

- [@turf/turf on npm — current version & API surface](https://www.npmjs.com/package/@turf/turf)
- [Turf.js pointToLineDistance docs](https://turfjs.org/docs/api/pointToLineDistance)
- [Turf.js polygonToLine docs](https://turfjs.org/docs/api/polygonToLine)
- [MagicMirror² Module Development — Core module file](https://docs.magicmirror.builders/module-development/core-module-file.html)
- [MagicMirror Forum — moment as vendored global](https://forum.magicmirror.builders/topic/19695/do-you-need-to-list-moment-and-moment-timezone-as-dependencies-in-modules/9)
- [MagicMirror Forum — moment available without install](https://forum.magicmirror.builders/topic/15302/cannot-find-module-moment/75?lang=en-US)
- Local: `node_modules/@turf/turf/package.json` (resolved 7.3.4)
- Local: `node_helper.js` lines 79–110 (extract/evaluatePolygons), 241–290 (fetchAndEvaluateHazard), 617/784 (_stale emission)
