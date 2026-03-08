# Phase 5: Code Quality - Context

**Gathered:** 2026-03-08
**Status:** Ready for planning

<domain>
## Phase Boundary

Clean up node_helper.js and MMM-SPCOutlook.js: extract shared Day 1/Day 2 hazard evaluation function, modernize all variable declarations to const/let, remove dead/commented-out code, add JSDoc to key functions, and replace all debug console.log/console.error calls with MagicMirror Log equivalents. No new features or behavior changes.

</domain>

<decisions>
## Implementation Decisions

### Comment Handling
- Remove all commented-out code blocks — this includes disabled evaluator calls (`// var day1RiskCont = ...`), commented-out `//Log.info(...)` lines, and any other lines that are code-as-comment rather than prose
- Preserve explanatory prose comments that describe intent or non-obvious logic
- Where prose comments exist, consider upgrading them to JSDoc format (`/** */`) on public-facing and utility functions rather than inline `//` comments

### JSDoc Coverage
- Add JSDoc to: `fetchGeoJsonCached`, `extractPolygons`, `evaluatePolygons`, `evaluatePolygonsWeighted`, `evaluatePolygonsContinuous`, `getSpcOutlook`, `getMesoscaleDiscussion`, and the new `fetchAndEvaluateHazard` shared function
- Depth: `@param` + `@returns` + one-line description — no verbose TypeScript-style `{type}` annotations
- `getSpcOutlook()` should include a `@returns` block documenting the shape of the result object (day1, day2, etc. with nested risk/color/cig fields) — this is the most complex return shape in the codebase

### DRY Refactor (QUAL-01)
- Extract Day 1 and Day 2 Tor/Hail/Wind logic into a single shared function named `fetchAndEvaluateHazard`
- The function handles: fetch GeoJSON (via fetchGeoJsonCached), evaluate probability polygons, conditionally fetch and evaluate CIG tier (if prob > 0), update the cache entry, return a structured result object `{ risk, cig }`
- Call sites destructure: `const { risk: day1TorRisk, cig: day1TorCig } = await this.fetchAndEvaluateHazard(...)`
- Fire weather (fw1/fw2) duplication is out of scope — Day 1/Day 2 only per QUAL-01
- CIG fetching is inside `fetchAndEvaluateHazard`, not at the caller

### Error and Logging Standard (QUAL-04)
- `console.error` in the getSpcOutlook top-level catch block → `Log.error`
- `console.log` in MMM-SPCOutlook.js (module start lat/lon/extended, SPC_DATA_RESULT receipt) → `Log.info`
- `console.log` in getMesoscaleDiscussion() MD trace → remove entirely (noisy in production, not needed)

### Claude's Discretion
- Exact signature of `fetchAndEvaluateHazard` (parameters for URL, cigURL, loc, cache, comparators)
- Order of const/let cleanup operations
- Specific wording of JSDoc descriptions

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchGeoJsonCached(url)`: Already exists — `fetchAndEvaluateHazard` will call this internally
- `evaluatePolygons(items, loc, comparator)`: Core evaluation method — called inside the shared function
- `extractPolygons(geojson, toValue, includesFeat)`: Used twice per hazard (risk + CIG) — both calls move inside `fetchAndEvaluateHazard`
- `this._geoJsonCache`: Cache Map already initialized in `start()` — shared function reads/writes it

### Established Patterns
- Cache update pattern: `this._geoJsonCache.set(url, { mode, etag, hash, result, timestamp })` — repeat this inside `fetchAndEvaluateHazard` for both the hazard URL and CIG URL
- `percComparator` and `cigComparator` are defined at the top of `getSpcOutlook()` — pass them as parameters to `fetchAndEvaluateHazard`
- MagicMirror logging: `Log.info()` for informational, `Log.error()` for errors — both available in both files

### Integration Points
- `getSpcOutlook()` calls Day 1 and Day 2 blocks independently — replace 6 near-identical ~15-line blocks with 6 clean `fetchAndEvaluateHazard()` calls
- Call sites currently use standalone variables (`day1TorRisk`, `day1TorCig`) — destructuring from the returned object keeps downstream references unchanged
- MMM-SPCOutlook.js has no `var` declarations but has `console.log` calls — logging fix is the only change needed there

</code_context>

<specifics>
## Specific Ideas

- `fetchAndEvaluateHazard` returns `{ risk, cig }` — callers destructure with descriptive aliases: `const { risk: day1TorRisk, cig: day1TorCig } = await this.fetchAndEvaluateHazard(...)`
- JSDoc on `getSpcOutlook` should document the return object shape since it's non-obvious — the consumer (MMM-SPCOutlook.js) accesses `day1.risk`, `day1.torRisk`, `day1.torCig`, `day1.color`, etc.

</specifics>

<deferred>
## Deferred Ideas

- Fire weather DRY refactor (fw1/fw2 WindRH + DryT) — discussed but deferred; out of QUAL-01 scope

</deferred>

---

*Phase: 05-code-quality*
*Context gathered: 2026-03-08*
