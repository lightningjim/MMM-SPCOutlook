# Phase 4: Performance - Context

**Gathered:** 2026-03-07
**Status:** Ready for planning

<domain>
## Phase Boundary

Cache turf.js point-in-polygon results so the Raspberry Pi does not repeat expensive polygon math when GeoJSON data hasn't changed — neither across consecutive update cycles (PERF-01) nor within a single update cycle (PERF-02). GeoJSON fetching from NOAA continues every cycle; only the turf evaluation is skipped when data is unchanged.

</domain>

<decisions>
## Implementation Decisions

### Stale Data Fallback
- If NOAA is unreachable during an update cycle, serve the last cached risk results (not an error)
- Include a subtle indicator that data is from a previous cycle (e.g., timestamp or "as of X ago")
- If no cached data exists yet (first cycle after restart with no prior result), show an error state — no stale data to serve
- Maximum staleness: only serve cached results if they are no older than one update cycle (configurable `updateInterval`); beyond that, show error
- Partial results are acceptable: if some endpoints succeed and others fail, show what succeeded rather than nothing
- First-cycle failure (no cache at all) and mid-run failure (cache available) should show the same error state — no need to distinguish them visually

### Cache Comparison Method
- Try HTTP ETags / conditional requests (`If-None-Match`) first — if NOAA supports them, skip both the full fetch and turf
- If the first response has no ETag header, fall back to JSON content hashing (SHA or similar) of the raw GeoJSON string
- Remember which mode (ETag vs. hash) is in effect per URL via an instance-level flag (`this._cacheMode` or similar) so subsequent cycles don't re-probe
- Cache per GeoJSON URL independently — changing Day 3 data should not invalidate the Day 1 cache
- Hash is computed from the raw JSON string (not just coordinates) — any content change triggers a re-run

### Cache Lifetime
- In-memory only — cache lives on the NodeHelper instance; clears on MagicMirror restart or Pi reboot
- No file-based persistence; first cycle after a restart always runs turf fresh
- If the user's configured lat/lon changes, all cached turf results are immediately invalid (GeoJSON hashes/ETags may remain valid, but evaluated risk results must be cleared and re-run for the new location)
- No time-based expiry — trust the hash/ETag signal; GeoJSON content itself signals freshness
- When cache is cleared (restart or location change), trigger an immediate re-run rather than waiting for the next scheduled interval

### Claude's Discretion
- Exact data structure for the cache (Map, plain object, etc.)
- Hash algorithm (MD5, SHA256, or simpler string comparison)
- How to expose staleness indicator in the result object (timestamp field, boolean flag, etc.)
- Within-cycle dedup implementation for PERF-02 (Day 4-8 evaluates the same geojson twice — fix approach is up to the planner)

</decisions>

<code_context>
## Existing Code Insights

### Reusable Assets
- `this` (NodeHelper instance): Natural location for in-memory cache — persists across `socketNotificationReceived` calls within a session, cleared on restart
- `fetchBinBuffer(url)`: Existing fetch wrapper — can be extended or complemented with an ETag-aware variant
- `extractPolygons(geojson, toValue, includesFeat)`: Called multiple times on the same geojson in Day 4-8 (once for risk, once for SIGN) — PERF-02 target

### Established Patterns
- All processing is in `node_helper.js` — cache storage and comparison logic belongs there
- Each GeoJSON URL is fetched independently via `fetch()` — per-URL caching aligns with existing structure
- `evaluatePolygons()` is the turf call to cache results around; `extractPolygons()` is the pre-step that could also be cached

### Integration Points
- `socketNotificationReceived` is the entry point per update cycle — cache check/update should happen inside `getSpcOutlook()`
- `loc = turf.point([lon, lat])` is created each cycle — location change detection can compare incoming lat/lon against cached lat/lon
- Result object returned to frontend via `SPC_DATA_RESULT` — staleness indicator can be added as a field here without frontend changes blocking this phase

</code_context>

<specifics>
## Specific Ideas

- ETags tried first per URL; if response lacks ETag, switch to content hashing for that URL and remember this choice
- Adaptive detection: after first cycle, cache knows whether each URL supports ETags — no re-probing overhead
- "One update interval" staleness limit maps naturally to the existing `updateInterval` config value

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 04-performance*
*Context gathered: 2026-03-07*
