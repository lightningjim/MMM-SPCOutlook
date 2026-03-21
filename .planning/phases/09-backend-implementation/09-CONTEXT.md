# Phase 9: Backend Implementation - Context

**Gathered:** 2026-03-21
**Status:** Ready for planning

<domain>
## Phase Boundary

Extend `getSpcOutlook()` in `node_helper.js` to fetch and evaluate Day 3–8 fire weather when `extended: true`, populating `day3Risk`–`day8Risk` (and `day3Text`–`day8Text`) in the existing `fireWeather` return object. Non-extended path gets zeros for all Day 3–8 fields. No display changes — that is Phase 10.

</domain>

<decisions>
## Implementation Decisions

### Return object shape
- **D-01:** Extend the existing `fireWeather` flat object — `{ day1Risk, day1Text, day2Risk, day2Text, day3Risk, day3Text, ..., day8Risk, day8Text }`. No new nesting.
- **D-02:** Include `dayNText` string fields for Days 3–8 alongside the risk integers, computed via `fireValueToFull[dayNFireRisk]`. Display code should not need to re-derive text from integers.
- **D-03:** Non-extended path (`!extended` early return): add `day3Risk: 0, day3Text: "None", ..., day8Risk: 0, day8Text: "None"` to `fireWeather`. No undefined reads possible (FWXT-04).

### Fetch strategy
- **D-04:** Sequential fetches — one URL at a time, 12 total. Matches existing Day 1-2 fire weather pattern. No concurrent network spike on RPi.

### Parse strategy (from Phase 8 findings — locked)
- **D-05:** Use `f.properties.DN` via `dnToFireValue = { 5: 1, 8: 2, 10: 3 }`. Do NOT use `f.properties.LABEL` (returns `"D3"`/`"D6"`, not risk level).
- **D-06:** Extend `extractPolygons` signature: `toValue(label, feature)` — one-line backward-compatible change. All existing callers pass a single-arg lambda and ignore the second argument; no breakage.
- **D-07:** Day 3-8 call site pattern:
  ```javascript
  const dnToFireValue = { 5: 1, 8: 2, 10: 3 };
  const polys = this.extractPolygons(
    fetchResult.data,
    (label, f) => dnToFireValue[f.properties.DN] || 0,
    (label, val) => val > 0
  );
  ```

### URLs (from Phase 8 findings — locked)
- **D-08:** `day{N}fw_windrhcat.lyr.geojson` and `day{N}fw_drytcat.lyr.geojson` under `https://www.spc.noaa.gov/products/exper/fire_wx/`. Note "exper" path, NOT "fire_wx" root (Day 1-2 use different base path).
- **D-09:** Do NOT use `day{N}fw_windrh.lyr.geojson` or `day{N}fw_dryt.lyr.geojson` — HTTP 404 confirmed.

### Claude's Discretion
- Variable naming for Day 3-8 fire risk locals (e.g. `day3FireRisk` pattern or loop variable)
- Whether to loop over days 3-8 or write explicit per-day blocks (loop preferred for DRY, but either is fine)

</decisions>

<specifics>
## Specific Ideas

- Day 3-8 fetch pattern mirrors Day 1-2 exactly: fetch windRH → max, fetch dryT → max → single integer per day
- Both `!extended` early return and extended return need `fireWeather` updated
- `fireValueToFull` map already exists in codebase: `{ 0: "None", 1: "Elevated", 2: "Critical", 3: "Extremely Critical" }`

</specifics>

<canonical_refs>
## Canonical References

### Phase 8 verification artifact
- `.planning/phases/08-url-verification/08-URL-FINDINGS.md` — Verified URLs, confirmed DN schema, Phase 9 implementation directives (authoritative)

### Requirements
- `.planning/REQUIREMENTS.md` — FWXT-01, FWXT-02, FWXT-04 (all Phase 9)

### Codebase
- `node_helper.js` lines 79–93 — `extractPolygons` signature to extend
- `node_helper.js` lines 504–566 — existing Day 1-2 fire weather fetch pattern to replicate
- `node_helper.js` lines 568–608 — non-extended early return (`fireWeather` object to extend with zeros)
- `node_helper.js` lines 794–799 — extended return path (`fireWeather` object to extend with live values)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `fetchGeoJsonCached(url)`: fetch + ETag caching — use for all 12 Day 3-8 URLs
- `extractPolygons(geojson, toValue, includesFeat)`: extend `toValue` to accept `(label, feature)` — one-line change at line 83
- `evaluatePolygons(items, loc, comparator)`: no changes needed
- `fireComparator`: `{ initial: 0, comparator: (best, val) => Math.max(best, val) }` — reuse as-is
- `fireValueToFull`: `{ 0: "None", 1: "Elevated", 2: "Critical", 3: "Extremely Critical" }` — reuse for text fields

### Established Patterns
- Fire risk per day = `Math.max(windRHResult, dryTResult)` — take max of two fetches
- Cache write pattern: `this._geoJsonCache.set(url, { mode, etag, hash, result: val, timestamp: Date.now() })`
- Stale flag: `if (fetchResult.stale) anyStale = true` before every fetch

### Integration Points
- `extractPolygons` line 83: `const value = toValue(label)` → `const value = toValue(label, f)` (one character change, backward-compatible)
- Non-extended return (line ~570): add Day 3-8 zeros to `fireWeather` object
- Extended return (line ~794): add Day 3-8 live values to `fireWeather` object
- `extended` flag already in scope throughout `getSpcOutlook` — Day 3-8 fetches run inside `if (extended)` block

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 09-backend-implementation*
*Context gathered: 2026-03-21*
