# Phase 4: Performance - Research

**Researched:** 2026-03-07
**Domain:** Node.js in-memory caching, HTTP ETags, content hashing, turf.js call-site deduplication
**Confidence:** HIGH

## Summary

Phase 4 eliminates two distinct sources of redundant CPU work in `node_helper.js`. The first (PERF-01) is inter-cycle: every update cycle re-runs all turf point-in-polygon evaluations even when NOAA has not updated the underlying GeoJSON. The fix is a per-URL cache that uses HTTP ETags when NOAA supports them, falls back to SHA256 content-hash comparison otherwise, and skips turf entirely on a cache hit. The second (PERF-02) is intra-cycle: Days 4-8 each call `extractPolygons()` twice on the same already-fetched `geojson` object — once for probability risk, once for SIGN detection. The fix is simple: capture both polygon sets from the same geojson before turf runs, eliminating the redundant extract call.

Both problems are entirely within `node_helper.js` and require no frontend changes. The stale-data fallback (serve last cached result on NOAA failure, within one update interval) is a locked user decision that integrates naturally with the PERF-01 cache structure by storing the last result alongside the cache key.

**Primary recommendation:** Implement a `this._geoJsonCache` Map on the NodeHelper instance keyed by URL. Each entry holds `{ etag, hash, polygons, result, timestamp }`. On each cycle, attempt `If-None-Match` conditional request per URL; on 304 use cached result; on 200 with no ETag use SHA256 of raw JSON string. For PERF-02, extract risk and SIGN polygon sets in a single pass over the Days 4-8 geojson rather than calling `extractPolygons` twice.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Stale Data Fallback**
- If NOAA is unreachable during an update cycle, serve the last cached risk results (not an error)
- Include a subtle indicator that data is from a previous cycle (e.g., timestamp or "as of X ago")
- If no cached data exists yet (first cycle after restart with no prior result), show an error state — no stale data to serve
- Maximum staleness: only serve cached results if they are no older than one update cycle (configurable `updateInterval`); beyond that, show error
- Partial results are acceptable: if some endpoints succeed and others fail, show what succeeded rather than nothing
- First-cycle failure (no cache at all) and mid-run failure (cache available) should show the same error state — no need to distinguish them visually

**Cache Comparison Method**
- Try HTTP ETags / conditional requests (`If-None-Match`) first — if NOAA supports them, skip both the full fetch and turf
- If the first response has no ETag header, fall back to JSON content hashing (SHA or similar) of the raw GeoJSON string
- Remember which mode (ETag vs. hash) is in effect per URL via an instance-level flag (`this._cacheMode` or similar) so subsequent cycles don't re-probe
- Cache per GeoJSON URL independently — changing Day 3 data should not invalidate the Day 1 cache
- Hash is computed from the raw JSON string (not just coordinates) — any content change triggers a re-run

**Cache Lifetime**
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

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PERF-01 | Polygon math results are cached; turf is not re-run when underlying GeoJSON data hasn't changed | ETag/hash cache on `this._geoJsonCache` Map; `fetchGeoJsonCached()` wrapper returns cached result on hit |
| PERF-02 | No redundant turf point-in-polygon calls within a single update cycle | Days 4-8 code calls `extractPolygons` twice per geojson; fix by extracting both polygon sets before evaluating, or accepting both in one pass |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Node.js `crypto` (built-in) | Node 25.7 (on-device) | SHA256 hashing of raw JSON strings | No install needed; `crypto.createHash('sha256').update(str).digest('hex')` is the standard pattern |
| node-fetch | ^2.6.1 (already installed) | HTTP requests with `If-None-Match` header support | Already the project's fetch library; v2 supports arbitrary request headers |
| JavaScript `Map` | ES2015, built-in | Per-URL cache storage | O(1) keyed lookup; cleaner than plain object for dynamic keys |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@turf/turf` | ^7.2.0 (already installed) | Point-in-polygon evaluation | Already used; Phase 4 does not change how turf is called, only whether it is called |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| SHA256 (crypto) | MD5 | MD5 is faster but has collision risk on adversarial input; SHA256 is standard for content integrity and negligibly slower for ~100KB JSON strings |
| SHA256 (crypto) | Direct string equality (`oldRaw === newRaw`) | String equality is simpler but stores the entire raw JSON in memory per URL; SHA256 stores only 64 bytes per URL — better for RPi memory |
| Per-URL `Map` | Single flat object | Map handles URL strings as keys more cleanly; both work; Map is the locked decision for Claude's discretion |

**Installation:** No new packages needed. `crypto` is a Node.js built-in.

## Architecture Patterns

### Recommended Project Structure

No structural change — all modifications are inside `node_helper.js` on the NodeHelper instance object.

### Pattern 1: Per-URL Cache Map on NodeHelper Instance

**What:** Add `this._geoJsonCache = new Map()` in the `start()` function. Each entry is keyed by URL string and holds the data needed to detect unchanged content and skip turf.

**When to use:** Every GeoJSON fetch in `getSpcOutlook()` and every cycle entry in `socketNotificationReceived`.

**Cache entry shape (Claude's discretion — recommended):**
```javascript
// Recommended cache entry per URL
{
  mode: 'etag' | 'hash',  // which comparison mode is active for this URL
  etag: String | null,     // stored ETag value if mode === 'etag'
  hash: String | null,     // stored SHA256 hex if mode === 'hash'
  result: Any,             // last turf evaluation result for this URL
  polygons: Array | null,  // last extractPolygons result (for PERF-02 reuse)
  timestamp: Number        // Date.now() when this entry was last computed
}
```

### Pattern 2: ETag-First Conditional Fetch

**What:** Before each GeoJSON fetch, check if the URL has a cached entry with an ETag. If so, add `If-None-Match` header. On HTTP 304, use cached result. On HTTP 200 without ETag, switch to hash mode for that URL and never probe for ETag again.

**When to use:** Inside a new `fetchGeoJsonCached(url)` helper method that replaces direct `fetchGeoJson(url)` calls in `getSpcOutlook()`.

**Example:**
```javascript
// Source: node-fetch v2 docs + Node.js crypto built-in
async fetchGeoJsonCached(url) {
  const entry = this._geoJsonCache.get(url);
  const headers = {};

  if (entry?.mode === 'etag' && entry.etag) {
    headers['If-None-Match'] = entry.etag;
  }

  let res;
  try {
    res = await fetch(url, { headers });
  } catch (err) {
    // Network failure — return stale result if within staleness window
    if (entry && this._isWithinStaleWindow(entry.timestamp)) {
      return { data: null, cachedResult: entry.result, stale: true };
    }
    return { data: null, cachedResult: null, stale: false };
  }

  if (res.status === 304) {
    // ETag hit — nothing changed
    return { data: null, cachedResult: entry.result, stale: false };
  }

  if (!res.ok) {
    // HTTP error — stale fallback same as network failure
    if (entry && this._isWithinStaleWindow(entry.timestamp)) {
      return { data: null, cachedResult: entry.result, stale: true };
    }
    return { data: null, cachedResult: null, stale: false };
  }

  const rawText = await res.text();
  const newEtag = res.headers.get('etag');
  let mode = newEtag ? 'etag' : 'hash';
  const newHash = mode === 'hash'
    ? require('crypto').createHash('sha256').update(rawText).digest('hex')
    : null;

  // Check hash match if in hash mode
  if (mode === 'hash' && entry?.hash === newHash) {
    // Content unchanged — cache hit via hash
    this._geoJsonCache.set(url, { ...entry, timestamp: entry.timestamp }); // keep old timestamp
    return { data: null, cachedResult: entry.result, stale: false };
  }

  const data = JSON.parse(rawText);
  return { data, rawText, newEtag, newHash, mode };
}
```

### Pattern 3: PERF-02 — Eliminate Duplicate extractPolygons Calls in Days 4-8

**What:** Days 4-8 currently call `extractPolygons` twice on the same `geojson` variable — once filtering for numeric probability labels, once filtering for the `SIGN` label. Since both passes iterate the same feature array, one combined pass (or storing both results) eliminates the redundant work.

**When to use:** Immediately after fetching each of day4URL through day8URL.

**Current (redundant) pattern (lines 466-472, 477-483, etc.):**
```javascript
// BEFORE — two extractPolygons calls on same geojson
geojson = await this.fetchGeoJson(day4URL);
var day4RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
var day4ProbRisk = this.evaluatePolygons(day4RiskPoly, loc, percComparator);
day4Sign = false;
if(day4ProbRisk > 0){
  day4ProbRiskPoly = this.extractPolygons(geojson, label => label, (label,val) => label === "SIGN");
  day4Sign = this.evaluatePolygons(day4ProbRiskPoly, loc, sigComparator);
}
```

**Fixed pattern — extract both sets in one pass (recommended approach for Claude's discretion):**
```javascript
// AFTER — both polygon sets extracted before any evaluation
geojson = await this.fetchGeoJsonCached(day4URL); // returns data or cachedResult
var day4RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
var day4SignPoly  = this.extractPolygons(geojson, label => label, (label, val) => label === "SIGN");
var day4ProbRisk  = this.evaluatePolygons(day4RiskPoly, loc, percComparator);
var day4Sign      = day4ProbRisk > 0 ? this.evaluatePolygons(day4SignPoly, loc, sigComparator) : false;
```

The second `extractPolygons` is now called unconditionally but is cheap (pure JS array filter with no turf calls). The turf work (`evaluatePolygons`) is still conditional on `day4ProbRisk > 0`. This satisfies PERF-02 because the same geojson dataset is no longer passed to turf-backed extraction twice.

### Pattern 4: Location Change Invalidation

**What:** At the start of `getSpcOutlook(lat, lon, extended)`, compare incoming `lat`/`lon` against `this._cachedLat` / `this._cachedLon`. If different, clear all cached turf results (but not necessarily the ETag/hash entries — those are still valid for freshness detection, but the evaluated risk values must be discarded).

**Example:**
```javascript
// At top of getSpcOutlook()
const locationChanged = (lat !== this._cachedLat || lon !== this._cachedLon);
if (locationChanged) {
  // Invalidate all cached turf results; keep etag/hash for freshness comparison
  for (const [url, entry] of this._geoJsonCache) {
    this._geoJsonCache.set(url, { ...entry, result: null, polygons: null, timestamp: 0 });
  }
  this._cachedLat = lat;
  this._cachedLon = lon;
}
```

### Pattern 5: Staleness Window Check

**What:** `_isWithinStaleWindow(timestamp)` returns true if the cached result was computed less than one `updateInterval` ago.

**Example:**
```javascript
_isWithinStaleWindow(timestamp) {
  const intervalMs = (this.config?.updateInterval ?? 60) * 60 * 1000;
  return (Date.now() - timestamp) < intervalMs;
}
```

Note: NodeHelper instances in MagicMirror have access to `this.config` only after the frontend module has connected and sent the first `GET_SPC_DATA` payload. The `updateInterval` value arrives in the payload or can be read from `this.config` if set during `start()`. Confirm the payload or store it on first receipt.

### Anti-Patterns to Avoid

- **Storing full raw JSON in cache entries:** Only store the hash (64 bytes) or ETag, not the full string. RPi has limited RAM.
- **Invalidating all URLs when one URL's data changes:** Cache is per-URL. A Day 1 data change must not invalidate the Day 3 cache entry.
- **Re-probing for ETag on every cycle after NOAA returns a no-ETag response:** The `mode` flag per URL prevents this. Once `mode === 'hash'` is set for a URL, never send `If-None-Match` for that URL again.
- **Using a time-based TTL instead of content comparison:** Locked decision says no time-based expiry. Trust the hash/ETag signal.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Content hashing | Custom checksum or CRC | `crypto.createHash('sha256')` (Node built-in) | Collision-resistant, standard, zero dependencies |
| HTTP conditional requests | Polling with retries | `If-None-Match` / HTTP 304 protocol | Standard HTTP caching semantics; node-fetch handles 304 status natively |

**Key insight:** The cache pattern here is straightforward application of standard HTTP caching and in-memory memoization — no external libraries needed beyond what's already installed.

## Common Pitfalls

### Pitfall 1: node-fetch v2 Dynamic Import Pattern with Headers

**What goes wrong:** The current fetch wrapper `const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args))` makes a dynamic import on every call. Adding headers to this wrapper works correctly — the args are passed through — but the dynamic import means the module is re-resolved every call (though Node.js caches module resolution so this is not actually expensive).

**Why it happens:** node-fetch v3 is ESM-only; the project pins v2 (`^2.6.1`) which is CJS, but uses a dynamic `import()` to load it. This is compatible and currently working.

**How to avoid:** When extending fetch to support conditional requests, keep the existing `const fetch` wrapper intact and just pass headers through it. Do not replace the dynamic import pattern.

**Warning signs:** If a later `npm install` upgrades to node-fetch v3 (ESM), the dynamic import pattern would still work but `^2.6.1` in package.json pins to v2. Not a Phase 4 concern.

### Pitfall 2: HTTP 304 Response Has No Body

**What goes wrong:** On a 304 Not Modified response, `res.json()` and `res.text()` return empty results. If code tries to parse the 304 response body, it gets an empty string or parse error.

**Why it happens:** 304 is defined by HTTP spec to have no message body. The correct action is to use the previously cached result without reading the response body.

**How to avoid:** Check `res.status === 304` BEFORE calling `res.text()` or `res.json()`. Return the cached result immediately.

### Pitfall 3: NOAA SPC GeoJSON Endpoints May Not Support ETags

**What goes wrong:** NOAA's SPC GeoJSON endpoints may return no `ETag` or `Last-Modified` headers, making the ETag path a no-op on every cycle.

**Why it happens:** Government/static file servers vary in HTTP caching header support. The CONTEXT.md specifically addresses this: the locked decision is to probe on the first request and fall back to hash mode per-URL if no ETag is present.

**How to avoid:** Always check `res.headers.get('etag')` on the first successful (200) response. If null, set `mode = 'hash'` for that URL and never send `If-None-Match` again.

**Warning signs:** All cycle logs show 200 responses and hash comparisons rather than any 304s — this is expected behavior if NOAA does not support ETags.

### Pitfall 4: `this.config` Not Available in NodeHelper at `start()` Time

**What goes wrong:** `this.config` on a MagicMirror NodeHelper is populated by the framework after the frontend module connects, not at `start()` time. Reading `this.config.updateInterval` in `_isWithinStaleWindow()` before the first socket notification may return undefined.

**Why it happens:** MagicMirror's NodeHelper lifecycle separates `start()` from configuration receipt.

**How to avoid:** Read `updateInterval` from the incoming payload in `socketNotificationReceived` (the payload contains `lat`, `lon`, `extended` — not `updateInterval`). Better option: store `updateInterval` as an instance variable when first seen, or use a safe default (`this._updateInterval = this._updateInterval ?? 60`) until the config is populated.

**Warning signs:** `_isWithinStaleWindow()` always returns true (interval is `undefined * 60000 = NaN`, and `< NaN` is false, so it would actually always return false — meaning stale fallback never works). Test the staleness logic explicitly.

### Pitfall 5: `sigComparator` Is Not Defined in the Extended Branch

**What goes wrong:** In the current code (lines 471, 481, 491, 501, 511-516), `sigComparator` is referenced in the extended (Days 4-8) branch but is never defined anywhere in `getSpcOutlook()`. This is a latent bug — `evaluatePolygons` will throw a ReferenceError if `sigComparator` is actually reached.

**Why it happens:** Dead code from prior refactor left a stale variable name.

**How to avoid:** Phase 4 should define `sigComparator` alongside the other comparators at the top of `getSpcOutlook()`. The SIGN detection for Days 4-8 is a boolean (in polygon or not), so a simple `{ initial: false, comparator: (best, val) => best || true }` works, or reuse a boolean-returning pattern. This is not Phase 4's primary goal, but the refactor of PERF-02 will touch these lines and the fix is trivial.

**Warning signs:** Extended mode enabled (`config.extended: true`) and Day 4-8 has any probability risk — the module would crash before Phase 4 even if the cache layer is correct.

### Pitfall 6: Cache Entry `timestamp` Semantics for Partial Staleness

**What goes wrong:** If NOAA returns some URLs successfully and others fail (partial update), using a single global staleness timestamp creates confusion about which results are fresh and which are stale.

**Why it happens:** Each URL has its own fetch lifecycle.

**How to avoid:** Store `timestamp` per cache entry (per URL), not globally. The per-URL `timestamp` reflects when that specific URL's result was last successfully evaluated by turf. The staleness indicator in the result object to the frontend can be a simple flag: `stale: true` if any URL used its cached result due to a fetch failure.

## Code Examples

Verified patterns from existing codebase and Node.js built-ins:

### Existing fetchGeoJson (to be extended)
```javascript
// Current: node_helper.js lines 188-198
async fetchGeoJson(url){
  try {
    const result = await fetch(url);
    if(!result.ok) throw new Error(`HTTP ${result.status} fetching ${url}`);
    const data = await result.json();
    return data;
  } catch (err) {
    Log.error("MMM-SPCOutlook fetchGeoJson error:", err);
    return null;
  }
},
```

### Node.js crypto SHA256 (verified built-in)
```javascript
// Source: Node.js crypto documentation (built-in, no import needed in CJS)
const crypto = require('crypto');
const hash = crypto.createHash('sha256').update(rawString).digest('hex');
// Returns 64-character hex string, e.g. "a3f4..."
```

### node-fetch Conditional Request Headers (verified v2 API)
```javascript
// Source: node-fetch v2 README — options object supports headers
const res = await fetch(url, {
  headers: { 'If-None-Match': storedEtag }
});
// res.status === 304 means content unchanged
// res.headers.get('etag') reads the ETag from response
```

### Map as Instance-Level Cache
```javascript
// Initialized in start():
start: function() {
  Log.info("Starting node_helper for MMM-SPCOutlook...");
  this._geoJsonCache = new Map();  // keyed by URL string
  this._cachedLat = null;
  this._cachedLon = null;
},
```

### PERF-02: Days 4-8 Pattern — Current vs Fixed

Current code calls `extractPolygons` on `geojson` twice (lines 466-472 as example):
```javascript
// CURRENT (redundant): extractPolygons called twice on same geojson
geojson = await this.fetchGeoJson(day4URL);
var day4RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
var day4ProbRisk = this.evaluatePolygons(day4RiskPoly, loc, percComparator);
day4Sign = false;
if(day4ProbRisk > 0){
  day4ProbRiskPoly = this.extractPolygons(geojson, label => label, (label,val) => label === "SIGN");  // REDUNDANT
  day4Sign = this.evaluatePolygons(day4ProbRiskPoly, loc, sigComparator);
}
```

Fixed pattern — one pass extraction, conditional turf evaluation:
```javascript
// FIXED: both polygon sets extracted once; turf is still conditional
const day4RiskPoly = this.extractPolygons(geojson, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0);
const day4SignPoly  = this.extractPolygons(geojson, label => label, (label, val) => label === "SIGN");
const day4ProbRisk  = this.evaluatePolygons(day4RiskPoly, loc, percComparator);
const day4Sign      = day4ProbRisk > 0 ? this.evaluatePolygons(day4SignPoly, loc, sigComparator) : false;
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Re-run all polygon math every cycle | Cache with ETag/hash comparison | Phase 4 | Reduces CPU from O(polygons × cycles) to O(1) on unchanged data |
| Double `extractPolygons` per day in Days 4-8 | Single extraction, both poly sets captured | Phase 4 | Eliminates ~5 redundant JS array iterations per extended cycle |

**Deprecated/outdated:**
- `var` declarations throughout `getSpcOutlook()`: Replaced by `const`/`let` in Phase 5; Phase 4 should use `const`/`let` for any new variables it introduces even though Phase 5 will clean up existing ones.

## Open Questions

1. **Does NOAA SPC serve ETags on GeoJSON endpoints?**
   - What we know: The CONTEXT.md decision anticipates "no ETag" as the common case and specifies hash fallback
   - What's unclear: Whether any of the ~20 GeoJSON URLs support ETags (would need live network test to confirm)
   - Recommendation: Implement ETag probe as specified — if NOAA doesn't support ETags, the hash fallback activates automatically and the system still works. No blocking issue.

2. **Is `sigComparator` intentionally undefined or a latent bug?**
   - What we know: The variable `sigComparator` is referenced in the extended branch (Days 4-8 SIGN evaluation) but never declared in `getSpcOutlook()`.
   - What's unclear: Whether this code path has ever been exercised (extended mode + any Day 4-8 risk present)
   - Recommendation: Phase 4 PERF-02 plan should define `sigComparator` alongside the other comparators. Suggested: `const sigComparator = { initial: false, comparator: (best, val) => true }` (any SIGN polygon match returns true).

3. **How to expose staleness in the result object without frontend changes?**
   - What we know: CONTEXT.md says staleness indicator can be added as a field to the result object; frontend changes are not required for this phase
   - What's unclear: Exact field name and value type (timestamp vs boolean vs age string)
   - Recommendation (Claude's discretion): Add `_stale: true` and `_staleAsOf: Date.now()` to the top-level result object when serving cached results. The frontend already ignores unknown fields; a future phase can add the display indicator.

## Validation Architecture

> `nyquist_validation` is `true` in `.planning/config.json`, but `.planning/REQUIREMENTS.md` explicitly lists "Automated testing framework: No test infrastructure exists; not added in this pass" as Out of Scope.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — explicitly out of scope per REQUIREMENTS.md |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PERF-01 | Cached result used on consecutive identical GeoJSON | manual-only | N/A — no test infra | ❌ |
| PERF-02 | No duplicate turf calls in a single cycle | manual-only | N/A — no test infra | ❌ |

**Verification approach for both requirements:** Code review of the implementation confirms `extractPolygons` is called once per geojson in Days 4-8; `Log.info` statements added during development can confirm cache hits in MagicMirror logs. Human verification per the existing project pattern.

### Wave 0 Gaps
None required — no test infrastructure will be added in this phase.

## Sources

### Primary (HIGH confidence)
- Node.js built-in `crypto` module — SHA256 hash via `createHash('sha256')` — standard, unchanged API
- HTTP/1.1 RFC 7232 — ETag / `If-None-Match` / 304 Not Modified semantics
- Direct code reading of `node_helper.js` — PERF-02 redundant calls confirmed at lines 466-472, 477-483, 487-493, 497-503, 507-517
- `package.json` — confirmed node-fetch `^2.6.1`, crypto is built-in (no install needed)

### Secondary (MEDIUM confidence)
- node-fetch v2 README (headers option, response status, `headers.get()`) — standard API, high confidence
- MagicMirror NodeHelper lifecycle (`this.config` availability) — based on MagicMirror2 framework patterns; verify `updateInterval` source in payload vs config

### Tertiary (LOW confidence)
- NOAA SPC GeoJSON ETag support: Unknown without live network test. Assumption that hash fallback will be the primary path in practice.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — Node.js built-ins, existing libraries, no new dependencies
- Architecture: HIGH — patterns derived directly from code reading and locked decisions
- Pitfalls: HIGH for items confirmed by code reading (sigComparator bug, 304 body, config timing); MEDIUM for NOAA ETag support (untestable without live network)

**Research date:** 2026-03-07
**Valid until:** 2026-06-07 (stable domain — Node.js crypto and HTTP caching semantics do not change rapidly)
