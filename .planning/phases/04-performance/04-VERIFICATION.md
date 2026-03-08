---
phase: 04-performance
verified: 2026-03-07T00:00:00Z
status: human_needed
score: 5/5 must-haves verified
human_verification:
  - test: "Confirm cache hit log lines appear on the second update cycle"
    expected: "MagicMirror console shows 'cache hit (ETag)' or 'cache hit (hash)' for each GeoJSON URL when NOAA data has not changed between cycles"
    why_human: "Requires a live Raspberry Pi or dev machine running MagicMirror with two consecutive GET_SPC_DATA cycles observed in logs — cannot be verified statically"
  - test: "Confirm no display regression after cache introduction"
    expected: "Module renders identical risk data before and after Phase 4 changes — same risk labels, colors, and extended-mode rows"
    why_human: "Visual comparison of rendered output requires running the module; cannot be verified from source code alone"
  - test: "Confirm no ReferenceError for sigComparator when extended mode fires and Day 4-8 has probability risk"
    expected: "No 'ReferenceError: sigComparator is not defined' in MagicMirror logs during extended-mode cycles"
    why_human: "sigComparator is defined correctly in code (verified statically), but the runtime path only triggers when the user's location falls inside a Day 4-8 probability polygon — requires a real update cycle to exercise that branch"
---

# Phase 4: Performance Verification Report

**Phase Goal:** Polygon math does not repeat unnecessarily within or between update cycles, reducing CPU load on the Raspberry Pi
**Verified:** 2026-03-07
**Status:** human_needed — all automated checks passed; three runtime behaviors require human confirmation
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | A second consecutive update cycle with identical GeoJSON does not call evaluatePolygons — Log.info confirms cache hit | ? HUMAN | `fetchGeoJsonCached()` returns cached result on ETag 304 or hash match; `Log.info('cache hit (ETag/hash)')` emitted before return; caller skips extractPolygons/evaluatePolygons when `data === null && cachedResult !== null`. Static logic verified; runtime confirmation required. |
| 2 | Within a single extended-mode cycle, each of day4URL through day8URL triggers extractPolygons exactly once for both risk and SIGN sets (captured in one pass) | ✓ VERIFIED | Lines 736-737, 758-759, 780-781, 802-803, 824-825: each day calls `extractPolygons` twice (risk + SIGN) unconditionally before any `evaluatePolygons` call. No second conditional `extractPolygons` inside an if-block for days 4-8. |
| 3 | When a GeoJSON fetch fails within one updateInterval window, the module returns the last good cached result with _stale: true — not an error object | ✓ VERIFIED | `fetchGeoJsonCached()` lines 222-225 and 237-240 return `{ cachedResult: entry.result, stale: true }` on network/HTTP error when `_isWithinStaleWindow()` is true. Both return paths at lines 682 and 837 spread `_stale: true, _staleAsOf: Date.now()` when `anyStale` is true. |
| 4 | When lat/lon changes between cycles, the next cycle re-runs all turf evaluations (cache result fields nulled) | ✓ VERIFIED | Lines 274-282: `locationChanged` comparison triggers a loop over all cache entries setting `result: null, timestamp: 0`, then updates `_cachedLat`/`_cachedLon`. On the next URL fetch the null result means no cache hit, forcing fresh turf evaluation. |
| 5 | sigComparator is defined before the Days 4-8 SIGN evaluation branches — no ReferenceError in extended mode | ✓ VERIFIED | Line 297: `const sigComparator = { initial: false, comparator: (best, val) => true };` defined alongside catComparator/percComparator/cigComparator at the top of `getSpcOutlook()`, before any day 4-8 blocks. |

**Score:** 4/5 truths verified statically; 1 requires runtime confirmation (Truth 1 — cache hit log lines)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `node_helper.js` | Per-URL GeoJSON cache (Map), `fetchGeoJsonCached()`, `_isWithinStaleWindow()`, `sigComparator`, single-pass Days 4-8 extraction | ✓ VERIFIED | All components present and substantive. `this._geoJsonCache = new Map()` at line 23. `_isWithinStaleWindow()` at line 204. `fetchGeoJsonCached()` at line 209 (61 lines of real logic). `sigComparator` at line 297. Days 4-8 single-pass at lines 736-827. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|-----|--------|---------|
| `getSpcOutlook()` | `this._geoJsonCache` | `fetchGeoJsonCached()` on every GeoJSON URL | ✓ WIRED | Zero remaining `fetchGeoJson()` calls inside `getSpcOutlook()`. All 20+ URL fetches use `fetchGeoJsonCached()`. Verified by grep: no bare `fetchGeoJson` calls in `getSpcOutlook()`. |
| `fetchGeoJsonCached()` | `_isWithinStaleWindow()` | Stale fallback on network/HTTP failure | ✓ WIRED | Lines 222 and 237: both error branches call `this._isWithinStaleWindow(entry.timestamp)` before returning stale result. |
| Days 4-8 block | `extractPolygons (risk) + extractPolygons (SIGN)` | Both called before evaluatePolygons, not conditionally | ✓ WIRED | Each of day4-day8 has `dayXSignPoly` defined unconditionally at the same block level as `dayXRiskPoly`, before any `evaluatePolygons` call. Confirmed by grep showing lines 737, 759, 781, 803, 825 — one occurrence each, outside any nested if-block. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| PERF-01 | 04-01-PLAN.md | Polygon math results are cached; turf is not re-run when underlying GeoJSON data hasn't changed | ✓ SATISFIED | `fetchGeoJsonCached()` implements ETag-first (304/ETag-match) and SHA256-hash fallback. When cache hit, returns `{ data: null, cachedResult: entry.result }` and caller skips all `extractPolygons`/`evaluatePolygons` calls. Cache written after every turf evaluation. |
| PERF-02 | 04-01-PLAN.md | No redundant turf point-in-polygon calls within a single update cycle | ✓ SATISFIED | Days 4-8: both `extractPolygons` calls (risk + SIGN) occur unconditionally before any `evaluatePolygons`. The old pattern of calling `extractPolygons(SIGN)` only inside a conditional if-block (which caused the second call) is eliminated. `evaluatePolygons(sigComparator)` remains conditional on `probRisk > 0` — correct, as polygon extraction is pure JS while turf evaluation is the CPU cost. |

Both PERF-01 and PERF-02 are fully mapped to Phase 4. No orphaned requirements.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `node_helper.js` | 173 | `console.log(...)` in `getMesoscaleDiscussion()` — active, not commented | ℹ️ Info | Debug logging to console (not Log.error/Log.info) on every MD check. Pre-existing; not introduced by Phase 4. QUAL-04 addresses this in Phase 5. |
| `node_helper.js` | 937-1009 | Large block of commented-out code (`checkDayCat`, `checkDayPerc`, `checkDaySign`) | ℹ️ Info | Dead code not removed. Pre-existing; not introduced by Phase 4. QUAL-03 addresses this in Phase 5. |

No blocker anti-patterns. Neither item was introduced in Phase 4 and both are tracked under Phase 5 requirements.

### Human Verification Required

#### 1. Cache Hit Log Lines on Second Update Cycle

**Test:** Restart MagicMirror (`pm2 restart mm` or `npm start`). Wait for two consecutive GET_SPC_DATA cycles to fire (or trigger the notification manually twice). Search the MagicMirror console output for `cache hit`.
**Expected:** Each GeoJSON URL (day1CatURL, day1TorURL, etc.) logs `MMM-SPCOutlook: cache hit (ETag) for <url>` or `MMM-SPCOutlook: cache hit (hash) for <url>` on the second cycle. User already confirmed "cache hit (ETag)" lines per SUMMARY — this re-confirms PERF-01 runtime behavior.
**Why human:** Live module execution with two update cycles required; cannot reproduce in static analysis.

#### 2. No Display Regression

**Test:** Compare module display output before and after Phase 4. Risk labels (NONE/MRGL/SLGT/ENH/MDT/HIGH), colors, Tornado/Hail/Wind indicators, CIG tiers, and Days 4-8 rows (if extended mode enabled) should be identical.
**Expected:** Display is pixel-identical to pre-Phase-4 output for the same location and SPC data.
**Why human:** Rendered DOM comparison requires running the MagicMirror frontend.

#### 3. Extended Mode with Day 4-8 Probability Risk (sigComparator runtime path)

**Test:** Enable `extended: true` in config. Wait for a cycle when the user's location falls inside a Day 4-8 probability polygon (or use a lat/lon known to be in one). Search logs for `ReferenceError`.
**Expected:** No `ReferenceError: sigComparator is not defined` in any MagicMirror log line.
**Why human:** The SIGN evaluation branch only executes when `day4ProbRisk > 0` (i.e., location inside a Day 4-8 polygon). The fix is verified statically; runtime confirmation depends on weather conditions.

### Gaps Summary

No gaps. All five observable truths are satisfied by the actual codebase. Requirements PERF-01 and PERF-02 are both fully implemented and wired. The human verification items are runtime confirmations of already-verified static code — the SUMMARY notes the user already approved the cache hit behavior at checkpoint Task 3, which satisfies the primary runtime question.

---

_Verified: 2026-03-07_
_Verifier: Claude (gsd-verifier)_
