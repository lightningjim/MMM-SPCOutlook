---
phase: 14-foundation-wpc-excessive-rainfall-outlook
verified: 2026-08-19T00:00:00Z
status: gaps_found
score: 10/13 must-haves verified
has_blocking_gaps: true
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 9/10
  gaps_closed:
    - "excessiveRain (and the rest of the payload) survives an ArcGIS error-shaped ERO response without collapsing to `{ error }` — independently reproduced: `getSpcOutlook` now returns a complete payload (day1-day8, fireWeather, 20-key excessiveRain, no `error` key) even when all five ERO layers return an ArcGIS error-shaped 200 body or throw. `scripts/probe-payload-resilience.js` (new, committed in 14-06) confirms this with 6/6 scenarios passing, exit 0."
  gaps_remaining: []
  regressions:
    - "CR-01 residual: a real, non-NONE ERO tier can still be silently reported as NONE when the winning polygon is not the array's first feature and the first feature lacks `properties`"
    - "CR-02 (new): the same `extractPolygons` hardening that fixed ERO's total-collapse now lets a malformed body on any of the ~11 pre-existing SPC/fire-weather layers write a `0`/NONE result into `_geoJsonCache` together with the bad body's ETag, pinning that layer to a false all-clear across every subsequent 304 poll"
    - "CR-03 (new-to-this-diff observability claim, pre-existing code path): the dominant real-world ERO failure mode — a non-2xx status or network/DNS error from `fetchGeoJsonCached` — produces zero `Log.error` output and no `_stale` flag, contradicting plan 14-07's own must-have that 'every rejected body and every contained ERO throw emits a Log.error line'"
gaps:
  - truth: "ERO tier label is correct even when the winning (risk-containing) polygon is not the first feature in the response array (ROADMAP SC3 / ERO-01 / ERO-02, ERO's own life-safety correctness guarantee)"
    status: failed
    severity: blocking
    reason: >
      node_helper.js:1027-1029 computes `eroValue` correctly via
      `extractPolygons`/`evaluatePolygons` (which now tolerate a leading
      properties-less feature), then immediately does
      `const firstFeature = fetchResult.data.features[0]; eroValidTime =
      firstFeature ? firstFeature.properties[ero.validTimeField] : null;`
      with no guard on `firstFeature.properties`. When feature 0 has
      `properties: null` (a legal GeoJSON feature `extractPolygons` correctly
      skips) and feature 1 is a real risk polygon containing the user (e.g.
      `dn: 3` / MDT), this line throws `TypeError: Cannot read properties of
      null (reading 'valid_time')`. The throw is caught by the per-day
      `catch (eroErr)` added in 14-07, which only logs and does not restore
      `eroValue` — so `eroTiers[d]` never advances past its seeded `"NONE"`
      default. Independently reproduced (not taken from the code review):
      a fixture with feature 0 `properties: null` and feature 1 `dn: 3`
      containing the probe coordinates produced `day1Risk: NONE,
      day1ValidTime: null` when the correct answer is `MDT`. This is a false
      negative on the exact product this phase exists to deliver, produced
      by the very code written to prevent CR-01, and it directly contradicts
      the project's stated core value of "no false negatives" as well as
      ROADMAP SC3's "user sees the correct ERO tier label" guarantee.
    artifacts:
      - path: "node_helper.js"
        issue: "Lines ~1027-1029 (ERO loop, inside the new try block from 14-07): `firstFeature.properties[ero.validTimeField]` is dereferenced unconditionally on a truthy `firstFeature`, without checking `firstFeature.properties` is a non-null object, discarding an already-correctly-computed `eroValue` when it throws."
    missing:
      - "Guard the `properties` dereference (e.g. `const props = (firstFeature && typeof firstFeature.properties === \"object\" && firstFeature.properties) || {}; eroValidTime = eroValue > 0 ? (props[ero.validTimeField] ?? null) : null;`), and move it so a bad valid-time read can never discard an already-resolved tier."
      - "Add a probe scenario (not currently present) with a leading property-less feature and a trailing real-risk feature, asserting the correct non-NONE tier is still reported — the existing `ero-malformed-feature` scenario only asserts `day1Risk === \"NONE\"`, which is satisfied by this exact crash path and therefore cannot detect the regression (confirmed: review's WR-03 finding)."
  - truth: "The `extractPolygons` hardening this phase introduced as a shared, reusable convention does not degrade the pre-existing SPC/fire-weather layers it also protects (must not regress the existing product while fixing the new one; phase goal's 'establishing the fetch/cache/toggle conventions every later product reuses' clause)"
    status: failed
    severity: blocking
    reason: >
      Before 14-07, a malformed body on a pre-existing SPC layer (e.g. the
      day1 categorical outlook) threw out of `extractPolygons` and collapsed
      the whole payload to `{ error }` — bad, but visible and never cached.
      After 14-07, `extractPolygons` returns `[]` instead of throwing, so
      `evaluatePolygons` returns `0`/NONE — and unlike the ERO loop (which
      deliberately `continue`s past its cache write on a rejected body),
      none of the ~11 SPC/fire-weather cache-write call sites
      (node_helper.js lines 571, 635, 698, 723, 753, 786, 798, 813, 825, 848,
      860, 900) call the new `_isFeatureCollection` guard before writing to
      `_geoJsonCache`. Independently reproduced: feeding the day1
      categorical URL an ArcGIS-error-shaped 200 body produced `day1.risk:
      NONE` (no `.error` key — the payload didn't collapse) AND
      `_geoJsonCache` held `{"etag":"E1","result":0,...}` for that URL.
      Simulating the next poll as a 304 (cache hit, `cachedResult: 0`)
      reproduced `day1.risk: NONE` again with no code path that could ever
      revalidate it — the entry is pinned until the upstream file's bytes
      change enough to break the ETag. A user during an actual High/MDT
      risk day would see "No Severe Weather Risk" indefinitely, with no
      `_stale` badge and no error banner, following a single transient
      upstream hiccup. This is a genuine, newly-introduced regression to the
      module's primary (non-ERO) product, caused by hardening code this
      phase explicitly built to be "the fetch/cache/toggle conventions every
      later product reuses" — so Phases 15-17, which copy this same pattern,
      would inherit the identical defect for their own registry rows unless
      it is fixed here at the source.
    artifacts:
      - path: "node_helper.js"
        issue: "None of the ~11 pre-existing SPC/fire-weather `_geoJsonCache.set(...)` call sites (lines 571, 635, 698, 723, 753, 786, 798, 813, 825, 848, 860, 900) check `_isFeatureCollection(fetchResult.data)` before writing a possibly-degraded `0` result to the cache together with the response's ETag."
    missing:
      - "Either hoist a shared `fetchEvaluateAndCache` helper that validates before evaluating and refuses to cache a rejected body (review's suggested durable fix), or at minimum add the same `if (!this._isFeatureCollection(gj)) { ...; continue/skip the cache write; }` guard the ERO loop already uses to each of the ~11 SPC/fire-weather cache-write sites."
      - "A probe scenario asserting that a malformed body on a pre-existing SPC/fire-weather layer is never written to `_geoJsonCache`, mirroring the existing ERO-only assertion in `ero-arcgis-error-body`."
  - truth: "Degradation from the dominant real-world ERO failure mode (non-2xx HTTP status or network/DNS error) is observable — not indistinguishable from a genuine all-clear (plan 14-07's own must-have: 'every rejected body and every contained ERO throw emits a Log.error line', core value: no false negatives)"
    status: failed
    severity: blocking
    reason: >
      `fetchGeoJsonCached`'s two hard-failure return paths (node_helper.js
      ~298-304 network/DNS catch, ~314-319 non-2xx status) emit no log
      statement at all when there is no usable stale-window cache entry to
      fall back to — they silently return `{ data: null, cachedResult: null,
      stale: false }`. In the ERO loop, both the cache-hit branch
      (`fetchResult.cachedResult !== null`) and the fresh-data branch
      (`fetchResult.data !== null`) are skipped for this return shape, so
      `eroValue` keeps its `0` initializer, the per-day try/catch never
      fires (nothing threw), and the day silently resolves to `"NONE"` with
      `eroValidTime: null`. `fetchResult.stale` is `false`, so `anyStale` is
      never set and the frontend renders no stale/degraded indicator.
      Independently reproduced: all five ERO days simulating this exact
      hard-failure return shape produced `day1Risk: NONE, _stale: undefined`
      with exactly one log line total for the whole run, and that line was
      an unrelated "location changed" message — zero `Log.error` calls. This
      is the single most likely real-world ERO failure (a WPC MapServer 503
      or transient DNS blip is far more common than an ArcGIS-shaped 200
      error body), and it degrades to a false all-clear with no trace in the
      log and no UI signal — the exact failure mode the project's stated
      core value ("no false negatives") exists to prevent. It also directly
      contradicts an explicit must-have plan 14-07 itself declared satisfied.
    artifacts:
      - path: "node_helper.js"
        issue: "`fetchGeoJsonCached`'s hard-failure returns at ~298-304 (network/DNS catch) and ~314-319 (non-2xx status, no stale fallback available) emit no `Log.error`/`Log.info` and carry no `failed` flag, so no caller (ERO or any of the ~11 SPC/fire-weather sites) can distinguish this shape from any other null-data branch."
    missing:
      - "Emit a `Log.error` from both hard-failure return paths in `fetchGeoJsonCached` naming the URL and the failure reason (network error vs. HTTP status)."
      - "Surface the degrade to the user: either add a `failed: true` field to the hard-failure return and have callers (starting with the ERO loop) set `anyStale = true` when it's present, or otherwise ensure a hard fetch failure produces a distinguishable signal from a genuine all-clear."
      - "A probe scenario asserting `_stale === true` (or an equivalent signal) when an ERO URL hard-fails with a non-2xx/network-error shape — the current six scenarios never exercise this specific `fetchGeoJsonCached` return shape end-to-end with an assertion on staleness/logging."
deferred: []
---

# Phase 14: Foundation & WPC Excessive Rainfall Outlook Verification Report

**Phase Goal:** Users can enable per-product toggles on a payload shape that no longer forks on `extended`, and see their location's WPC Excessive Rainfall Outlook risk for Days 1-5 — establishing the fetch/cache/toggle conventions every later product reuses.

**Verified:** 2026-08-19
**Status:** gaps_found
**Re-verification:** Yes — after gap closure (plans 14-06, 14-07 targeting prior CR-01)

## Goal Achievement

This is a re-verification focused on the two gap-closure plans (14-06, 14-07) executed against the single blocking gap from the prior VERIFICATION.md (CR-01: an ArcGIS error-shaped ERO response collapsing the entire `getSpcOutlook` payload). Truths 1-5, 7, 8, 10 below were VERIFIED in the prior run and are not re-litigated in depth here except where this wave's changes could plausibly have touched them (they were not touched — `git diff` confirms `14-07` modified only the polygon-helpers region and the ERO loop). Truth 6 (the original CR-01 truth) and three new truths surfaced by the code review are the focus of this pass.

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With `extended: false` and `showExcessiveRain: true`, ERO rows still render — payload no longer forks on `extended` (ROADMAP SC1 / CFG-02) | VERIFIED | Unchanged by 14-06/14-07 (`git diff` touches only `node_helper.js`'s polygon-helpers region and ERO loop, neither of which is the `extended` fork). Carried forward from prior verification, re-confirmed by direct read: `MMM-SPCOutlook.js:204-212` gates on `showExcessiveRain`/`excessiveRain` only. |
| 2 | `showExcessiveRain` toggles independently of every other flag and defaults to `false` out of the box (ROADMAP SC2 / CFG-01) | VERIFIED | Unchanged; `MMM-SPCOutlook.js` not touched by 14-06/14-07 (`git status --porcelain MMM-SPCOutlook.js` empty). Carried forward. |
| 3 | Correct ERO tier label (MRGL/SLGT/MDT/HIGH) for Days 1-5, derived from ERO's own `dn` domain — **under well-formed, single-feature-per-day responses** (ROADMAP SC3 / ERO-01, ERO-02) | VERIFIED (narrow case only — see gap for the general case) | `productRegistry.js` unchanged (`git status --porcelain productRegistry.js` empty); probe scenario `ero-wellformed-slgt` (single feature, `dn: 2`) passes and matches the registry's own `SLGT` mapping. **However**, see the new gap below: a well-formed FeatureCollection with a properties-less feature ordered *before* the winning risk feature causes the correct tier to be silently discarded and reported as `NONE`. The narrow single-feature case this bullet certifies is not the full ERO-01/ERO-02 guarantee. |
| 4 | A day where the location falls outside every ERO polygon shows no ERO row — not empty, not an error row (ROADMAP SC4 / ERO-03) | VERIFIED | Unchanged; `MMM-SPCOutlook.js:204-212` value-gates on `!= "NONE"`. Carried forward from prior verification. |
| 5 | ERO requests always carry `f=geojson`, never `f=json`; the same query string repeats across polls so the ETag/hash cache hits (ROADMAP SC5 / DATA-01, PERF-02) | VERIFIED | `productRegistry.js` untouched by this wave. Regression-checked explicitly for this wave: `grep -c -E "mapservices\.weather\.noaa\.gov|f=geojson|f=json" node_helper.js` returns `0` — the 14-07 hotfix introduced no URL or format literal into `node_helper.js`, confirming `buildArcGisQuery` remains the sole ERO URL source. |
| 6 | `excessiveRain` (and the rest of the payload) survives an ArcGIS error-shaped ERO response without collapsing to `{ error }` (D-05 foundation guarantee; the original CR-01 truth) | **VERIFIED — this specific gap is closed** | Independently reproduced (not taken from SUMMARY/probe claims): fed all five ERO URLs an ArcGIS-error-shaped 200 body via a hand-written script against the live `node_helper.js` through `scripts/probe-lib/module-stubs.js`; result was a complete payload (`day1`-`day8`, `fireWeather`, 20-key `excessiveRain`, `error: undefined`) with all five ERO days correctly at `"NONE"`. Also ran `node scripts/probe-payload-resilience.js` directly: `6 passed, 0 failed`, exit 0, including `PASS ero-arcgis-error-body`, `PASS ero-fetch-throws`. The mechanism (`_isFeatureCollection` predicate + per-day `try/catch (eroErr)`) is real and does what it claims for *this specific* truth. |
| 7 | ERO tier label is correct even when the winning (risk-containing) polygon is not `features[0]` and `features[0]` lacks `properties` — a legal GeoJSON shape (ROADMAP SC3 / ERO-01, ERO-02, "no false negatives" core value) | **FAILED (new gap — a regression/incomplete-fix surfaced by this wave)** | See `gaps` in frontmatter. Independently reproduced: fixture with `features[0].properties = null` and `features[1] = { dn: 3, ... }` (a real MDT polygon containing the probe coordinates) produced `day1Risk: NONE, day1ValidTime: null` — the correct answer is `MDT`. The already-correct `eroValue` computed by `extractPolygons`/`evaluatePolygons` is thrown away by an unguarded `firstFeature.properties[ero.validTimeField]` read two lines later, and the throw is swallowed by 14-07's own per-day `catch (eroErr)`. |
| 8 | The `extractPolygons` hardening (a shared convention this phase explicitly built for reuse by Phases 15-17) does not degrade the pre-existing SPC/fire-weather layers it also touches ("establishing the fetch/cache/toggle conventions every later product reuses" clause of the phase goal) | **FAILED (new gap — regression introduced by this wave)** | See `gaps` in frontmatter. Independently reproduced: fed the pre-existing `day1otlk_cat` SPC URL an ArcGIS-error-shaped 200 body; result was `day1.risk: NONE` (no payload collapse) but `_geoJsonCache` held `{"etag":"E1","result":0,...}` for that URL — confirmed by direct inspection of the cache Map after the call. Simulated the following poll as a 304/cache-hit and reproduced `day1.risk: NONE` again, with no code path that revalidates it. None of the ~11 SPC/fire-weather `_geoJsonCache.set(...)` call sites (grep-confirmed at node_helper.js lines 571, 635, 698, 723, 753, 786, 798, 813, 825, 848, 860, 900) check `_isFeatureCollection` before writing, unlike the ERO loop which deliberately skips its cache write on rejection. |
| 9 | Degradation from the dominant real-world ERO failure mode (network error / non-2xx status) is observable via a log line and/or a stale signal — not silent (plan 14-07's own declared must-have; "no false negatives" core value) | **FAILED (new gap — the plan's own claimed truth does not hold for this path)** | See `gaps` in frontmatter. Independently reproduced: simulated `fetchGeoJsonCached` returning its documented hard-failure shape (`{ data: null, cachedResult: null, stale: false }`, the exact return value at node_helper.js ~304/~319 for a network error or non-2xx status with no usable stale cache) for all five ERO URLs. Result: `day1Risk: NONE`, `_stale: undefined`, and exactly one `Log`-call total for the entire run — an unrelated "location changed" message, zero `Log.error` calls. Direct code read confirms `fetchGeoJsonCached`'s two hard-failure `return` statements (node_helper.js ~298-304, ~314-319) contain no `Log.error`/`Log.info` call. |
| 10 | With `extended: false`, existing SPC Day 1-3 and fire weather Day 1-2 values are unchanged from before plan 14-02 (CFG-02 back-compat) | VERIFIED | Unaffected by this wave; carried forward. Not re-diffed here since 14-06/14-07 touched only the polygon-helpers region and the ERO loop, both additive to what plan 14-02 established. |
| 11 | ERO's `dn`->tier vocabulary remains structurally isolated from the fire weather `dnToFireValue` map (ERO-02) | VERIFIED | Confirmed by scoped `git diff -U0 HEAD -- node_helper.js \| grep '^-' \| ... \| grep -c -E 'dnToFireValue\|riskToValue\|fireRiskToValue'` returning `0` — no line touching those tables was removed or rewritten by 14-06/14-07. |
| 12 | The plan 14-06 probe is real regression tooling: it reproduces the original CR-01 (RED) and confirms the closure (GREEN) via an independently re-runnable command | VERIFIED (with scope caveat) | Ran `node scripts/probe-payload-resilience.js` directly: `6 passed, 0 failed`, exit 0. The mechanism is genuine — I independently re-derived the same RED baseline behavior by hand outside the probe. **Caveat (non-blocking, informational):** the probe's own `ero-malformed-feature` scenario passes via the exact crash path documented in gap #7 above, not via the guard it claims to test (review's WR-03, independently confirmed) — so the probe's green state does not by itself prove gap #7 is closed, and did not catch it. |
| 13 | A cached ERO day yields the same tier string as a freshly-fetched one (PERF-02) | VERIFIED | Unchanged code path (`eroTiers[d] = ero.valueToTier[eroValue] \|\| "NONE"` sits after both branches, unmodified by this wave's diff region per `git diff`). Carried forward. |

**Score:** 10/13 truths verified (3 blocking failures: the CR-01 residual, the new SPC cache-poisoning regression, and the silent-hard-failure observability gap)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `scripts/probe-lib/module-stubs.js` | Dependency-free `node_helper.js` loader, no `node_modules` required | VERIFIED | Exists, 139+ lines, exports match plan (`installStubs`, `loadNodeHelper`, `resetHelper`, `resetLogs`, `turfStub`, `logCalls`). Used directly by this verifier's own independent reproduction scripts above — confirmed functional, not just present. |
| `scripts/probe-payload-resilience.js` | Six-scenario offline payload-integrity probe with golden snapshot | VERIFIED (with quality caveats) | Exists, runs offline, `6 passed, 0 failed` confirmed by direct execution. Quality caveats from code review independently spot-checked and confirmed real (see truth #12): `ero-malformed-feature` passes via a crash path it doesn't detect (WR-03), no scenario asserts SPC values *survive* an ERO failure (WR-02, i.e. it never exercises the new gap #8), and the log-capture apparatus (`logCalls`) is wired but never asserted on (WR-04) — all three are why gaps #7-#9 were not caught by this phase's own regression gate. Non-blocking as artifacts (the files exist and are substantive) but material to why the gaps below survived to this verification pass. |
| `node_helper.js` | `_isFeatureCollection` predicate, hardened `extractPolygons`, per-day ERO try/catch | VERIFIED (mechanism present, but see gaps) | `_isFeatureCollection` exists exactly once (confirmed by grep excluding comments), `extractPolygons` has both the entry guard and per-feature guard, ERO loop has exactly one `catch (eroErr)` and one `_isFeatureCollection(fetchResult.data)` call and one `continue;` inside the ERO block (confirmed via the same scoped `sed`/`grep` commands the plan's own acceptance criteria specify). The artifacts exist and are wired as designed — the gaps are in what the design does *not* cover (SPC cache sites, the `firstFeature.properties` read, and `fetchGeoJsonCached`'s silent hard-failure paths), not in missing/stub code. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| ERO fetch loop | `_isFeatureCollection` | call-site validation of `fetchResult.data` before `extractPolygons` | WIRED | Confirmed present and functioning for the ArcGIS-error-body shape (gap #6/original CR-01 closed). |
| ERO fetch loop | per-day `try/catch (eroErr)` | whole per-day body wrapped | WIRED (but discards a correct result on gap #7's path — see truth 7) | The containment mechanism itself is correctly wired (a throw never reaches the function-wide catch); the gap is that it also silently discards an already-computed correct value rather than only containing genuine failures. |
| `extractPolygons` | every product parse path (SPC categorical/probability/CIG, fire weather, ERO) | entry guard returning `[]` for a non-FeatureCollection body | WIRED for ERO; **NOT WIRED for cache-write protection on SPC/fire-weather** | The guard inside `extractPolygons` itself fires for every caller (confirmed: SPC day1 categorical calling `extractPolygons` on an error body returns `[]`, not a throw). But the *caller-side* cache-write protection the ERO loop adds (skip `_geoJsonCache.set` on rejection) was not replicated at any of the ~11 SPC/fire-weather cache-write sites — see gap #8. |
| `fetchGeoJsonCached` hard-failure paths | `Log.error`/caller staleness signal | none | **NOT WIRED** | Confirmed by direct code read (node_helper.js ~298-304, ~314-319): no log call, no `failed` flag on either hard-failure `return`. See gap #9. |
| `scripts/probe-payload-resilience.js` | `node_helper.js` | `loadNodeHelper()` + `fetchGeoJsonCached` replacement | WIRED | Confirmed by direct execution; probe genuinely exercises live `node_helper.js` code, not a mock of it. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| ERO render block | `this.spcrisk.excessiveRain` | live ArcGIS query -> `getSpcOutlook` ERO loop | Yes, under well-formed single-winning-feature responses | FLOWING (carried forward from prior verification's live-probe evidence; unaffected by this wave for the happy path) |
| ERO render block (feature-ordering edge case) | same variable | same source, but a multi-feature response where the winning feature is not first and a preceding feature lacks `properties` | **No — a real risk value is computed then discarded** | HOLLOW under the gap #7 condition — not a stub, but a genuine correctness defect newly exposed/created by this wave's fix |
| SPC categorical/fire-weather values | `out.day1`, `out.fireWeather` | `fetchGeoJsonCached` + `extractPolygons` + `_geoJsonCache` | No, once a single malformed response has been received and cached | DISCONNECTED under the gap #8 condition — a transient upstream hiccup silently and permanently pins the value to no-risk via the ETag cache, until the upstream body changes enough to invalidate the ETag |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Probe suite runs and reports its own claimed state | `node scripts/probe-payload-resilience.js; echo EXIT=$?` | `6 passed, 0 failed`, `EXIT=0` | PASS (matches SUMMARY claims) |
| Original CR-01 (ArcGIS error body collapses the whole payload) is closed | Standalone reproduction script feeding all 5 ERO URLs an `{error:...}` body | Complete payload, no `.error` key, all 5 days `NONE` | PASS — confirms gap #6 closed |
| CR-01 residual: correct tier discarded when winning feature isn't `features[0]` | Standalone reproduction script, `features[0].properties=null`, `features[1]={dn:3,...}` containing the probe point | `day1Risk: NONE` (expected `MDT`) | **FAIL — confirms new gap #7** |
| CR-02: SPC cache poisoning on a malformed body | Standalone reproduction script feeding `day1otlk_cat` an `{error:...}` body, then simulating the next-poll 304 | `day1.risk: NONE`, cache holds `{etag, result:0}`, next-poll `NONE` again | **FAIL — confirms new gap #8** |
| CR-03: silent hard-failure (network/5xx) path | Standalone reproduction script, all 5 ERO URLs returning `{data:null,cachedResult:null,stale:false}` | `day1Risk: NONE`, `_stale: undefined`, 1 unrelated log line, 0 `Log.error` calls | **FAIL — confirms new gap #9** |
| No new debt markers introduced | `grep -n "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across `node_helper.js`, `scripts/probe-lib/module-stubs.js`, `scripts/probe-payload-resilience.js` | No matches | PASS |
| DATA-01 regression guard: no new URL/format literal | `grep -c -E "mapservices\.weather\.noaa\.gov\|f=geojson\|f=json" node_helper.js` | `0` | PASS |
| No unexpected file modifications | `git status --porcelain productRegistry.js MMM-SPCOutlook.js package.json` | empty | PASS |

### Probe Execution

`scripts/probe-payload-resilience.js` is a committed, conventional probe (matches the spirit of the workflow's probe-execution step even though it does not live under `scripts/*/tests/probe-*.sh`). Executed directly from the repository root:

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/probe-payload-resilience.js` | `node scripts/probe-payload-resilience.js` | `PROBE RESULT: 6 passed, 0 failed`, exit 0 | PASS (as claimed by SUMMARY) — but see truth #12's caveat: this probe's green state does not cover gaps #7-#9, which were found by direct independent reproduction outside the probe's scenario set. |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CFG-01 | 14-03, 14-04, 14-06 | User enables each new product independently via its own boolean, defaulting to false | SATISFIED | Unaffected by this wave; carried forward from prior verification. |
| CFG-02 | 14-02, 14-04, 14-06 | Existing SPC/fire weather config continues to work; `extended` no longer gates payload shape | SATISFIED (payload shape) / **caveated by gap #8** | The `extended` fork removal is unaffected and still correct. However, gap #8 means "existing SPC config continues to work" is no longer unconditionally true — a malformed upstream body can now silently and persistently degrade a pre-existing SPC layer, which is new since the prior verification. |
| DATA-01 | 14-01, 14-03, 14-07 | Coordinates always evaluated against WGS84 geometry; `f=geojson` on every ArcGIS endpoint | SATISFIED | Regression-confirmed for this wave: no new URL/format literal in `node_helper.js`. |
| PERF-02 | 14-01, 14-03, 14-07 | ETag/SHA256 cache stays effective; no cache-key multiplication | SATISFIED for ERO / **undermined for SPC by gap #8** | ERO's own cache-poisoning defense (never cache a rejected body) is confirmed working via direct reproduction (`_geoJsonCache.size === 0` after an all-error ERO run). But the *effectiveness* of the cache elsewhere is now compromised in a different way: gap #8 shows the SPC cache can hold a wrong value keyed to a valid ETag, which is arguably worse than "ineffective" — it is confidently wrong. |
| ERO-01 | 14-01, 14-03, 14-04, 14-05, 14-06, 14-07 | User sees their ERO risk tier for Days 1-5 when `showExcessiveRain` is enabled | **BLOCKED by gap #7** | The happy-path single-feature case works (probe-confirmed). The general case does not: a legal, well-formed multi-feature response can silently report the wrong (NONE) tier. |
| ERO-02 | 14-01, 14-03, 14-07 | Correct tier label from ERO's own `dn` domain, not fire weather `DN` | **BLOCKED by gap #7** | The `dn`-vs-`DN` table isolation itself remains structurally correct (verified truth #11), but "correct tier label" as an end-to-end guarantee fails under the reproduced feature-ordering condition. |
| ERO-03 | 14-04, 14-07 | No ERO row for a day outside all ERO polygons | SATISFIED for genuine outside-polygon days / **conflated with gap #7's false NONE** | The mechanism itself (value-gated render on `!= "NONE"`) is correct and unaffected. The concern is that gap #7 and gap #9 both also produce `"NONE"` through failure paths that are observationally identical to a genuine outside-all-polygons day — the requirement's *letter* is satisfied but its *spirit* (a NONE row means "actually outside," not "we couldn't tell") is compromised. |

No orphaned requirements: the requirement IDs declared across all seven plans' `requirements:` frontmatter (14-01 through 14-07) still exactly match REQUIREMENTS.md's Traceability table for Phase 14. REQUIREMENTS.md's checkboxes for CFG-01, CFG-02, ERO-01, ERO-03 remain `[ ]`/"Pending" — this is stale tracking (not updated by any Phase 14 plan), unrelated to the functional gaps above, consistent with the prior verification's assessment.

### Anti-Patterns Found

| File | Line(s) | Pattern | Severity | Impact |
|------|---------|---------|----------|--------|
| `node_helper.js` | ~1027-1029 (ERO loop) | Unguarded `firstFeature.properties[ero.validTimeField]` dereference discards an already-correctly-computed risk value when it throws | Blocker (gap #7) | False-negative ERO tier report — see truth 7. |
| `node_helper.js` | ~11 SPC/fire-weather `_geoJsonCache.set` call sites (571, 635, 698, 723, 753, 786, 798, 813, 825, 848, 860, 900) | No `_isFeatureCollection` guard before caching a possibly-degraded `extractPolygons` result | Blocker (gap #8) | Cache poisoning: a malformed body pins a pre-existing SPC/fire-weather layer to a false all-clear across every later 304 poll. |
| `node_helper.js` | `fetchGeoJsonCached` ~298-304, ~314-319 | Hard-failure return paths emit no `Log.error` and no distinguishable "failed" signal | Blocker (gap #9) | The dominant real-world ERO (and SPC) failure mode degrades silently to a false all-clear, with no log trace and no `_stale` badge. |
| `node_helper.js` | ~50-53 (pre-existing, unmodified by any Phase 14 plan including 14-06/14-07) | `await this.getMesoscaleDiscussion(...)` / `await this.getSpcOutlook(...)` in `socketNotificationReceived` with no try/catch around either call | Warning, PRE-EXISTING (review's CR-04, prior review's CR-02) | Confirmed still present and unmodified by this wave. An MD-fetch failure becomes an unhandled promise rejection, stranding the frontend on "Loading...". Predates Phase 14 (per prior verification's `git show` confirmation) and not modified by 14-06/14-07 — flagged for visibility per instructions, not counted as a Phase 14 gap. |
| `scripts/probe-payload-resilience.js` | scenario `ero-malformed-feature`, `spc-wellformed-baseline` fixture | Two scenarios pass without exercising what they claim (crash-path pass; fire-weather fixture that can never produce a non-zero value) | Warning | Reduces confidence that the probe would catch a future regression on either path; independently confirmed both claims by direct execution (see truth #12 and code review WR-01/WR-03). Non-blocking as it does not itself break a phase goal, but it is the reason gaps #7-#9 survived this far. |
| `scripts/probe-payload-resilience.js` | `logCalls` imported/exported but never asserted on; `main().catch` reports a hardcoded tally on abort | Warning | Reduces the probe's diagnostic value; recommended for backlog alongside the gap fixes. |
| `node_helper.js` / `productRegistry.js` | various (WR-08 `exceededTransferLimit` unchecked, WR-13 helper-global `_products` race, WR-14 location-change invalidation preserving ETags, WR-15 duplicated `products` literal, WR-16 unconsumed registry fields) | Real, review-confirmed robustness/maintainability defects, none independently re-verified with execution by this pass (carried forward from code review, consistent with prior verification's treatment of the equivalent WR-02/WR-03/WR-04/WR-07/WR-08/WR-09 findings) | Warning (non-blocking) | Recommended for backlog; do not block this phase's goal on their own. |

No new `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers were introduced by plans 14-06/14-07 in any of the 3 touched/created files (independently grepped, zero matches).

### Human Verification Required

None. Every claim in this report was resolved by direct code reading and/or independent, executable reproduction — no visual, real-time, or external-service-dependent behavior is in scope for this gap-closure wave.

### Gaps Summary

**Three blocking gaps, all newly surfaced or newly introduced by this wave (plans 14-06/14-07):**

The good news first: the original blocking gap from the prior verification — an ArcGIS error-shaped ERO response collapsing the *entire* `getSpcOutlook` payload to `{ error }`, destroying `day1`-`day8` and `fireWeather` along with `excessiveRain` — is genuinely closed. This was independently reproduced and confirmed, not taken on the strength of the probe or the SUMMARY alone.

However, the fix that closed it is incomplete in a way that matters for the phase goal, and it introduced a regression to code outside the fix's own product:

1. **CR-01 residual (gap #7):** The per-day try/catch that now contains ERO failures also silently discards an *already-correctly-computed* risk tier when an unrelated, unguarded dereference two lines later throws on a legal but awkwardly-ordered GeoJSON response. This is a false negative on the phase's core deliverable — the ERO tier itself — and is more severe in kind than the original bug, because it produces a *wrong* answer rather than an *absent* one, and it is silent.

2. **New SPC regression (gap #8):** The shared `extractPolygons` hardening this phase explicitly built as "the fetch/cache/toggle conventions every later product reuses" was applied only at the `extractPolygons` level, not replicated at the ~11 pre-existing SPC/fire-weather cache-write call sites the way it was at the ERO loop's cache-write site. The result: a malformed upstream body on the module's *primary, pre-existing* product can now be silently and permanently cached as a false all-clear behind a valid ETag — a defect that did not exist before this wave's fix and is worse than the bug it replaced (previously visible-but-total failure; now invisible-and-permanent partial failure).

3. **Observability claim does not hold for the dominant failure path (gap #9):** Plan 14-07 explicitly declared "every rejected body and every contained ERO throw emits a `Log.error` line" as a must-have. This is true for the two failure shapes the plan targeted (ArcGIS error body, malformed feature) but false for the failure shape that will actually dominate in production — a non-2xx HTTP status or network/DNS error from `fetchGeoJsonCached`, which returns silently with no log line and no stale signal.

All three were independently reproduced by this verifier with standalone scripts run against the live `node_helper.js` through the committed probe-lib loader — not inferred from the code review alone, though the code review's CR-01/CR-02/CR-03 findings (which this verifier read only after forming an independent read of the relevant code) match these reproductions closely and are corroborating rather than sole evidence.

**Why these are blocking rather than minor:** the phase's stated core value is "no false negatives," and all three gaps produce exactly that failure mode — a real risk silently reported as no-risk, in code this phase explicitly built to be copied verbatim by Phases 15-17. Gap #8 in particular affects the module's pre-existing primary product, not just the new optional ERO feature, which is a strictly worse outcome than before this wave's changes for a user who never even enables `showExcessiveRain`.

**One pre-existing, non-blocking finding carried forward for visibility (CR-04 / prior CR-02):** the unguarded `await this.getMesoscaleDiscussion(...)`/`await this.getSpcOutlook(...)` calls in `socketNotificationReceived` predate Phase 14 and were not touched by 14-06/14-07. Not counted as a Phase 14 gap, consistent with the prior verification.

**This looks like a fixable bug, not an intentional deviation** for gap #7 and gap #9 — no override is suggested for those. Gap #8 is also a fixable bug, not a deviation. If the developer judges any of these acceptable to defer (for example, because Phase 19 is expected to revisit this error-handling surface), the appropriate path is an explicit override entry per must-have, not silent acceptance:

```yaml
overrides:
  - must_have: "ERO tier label is correct even when the winning polygon is not features[0]"
    reason: "<developer's stated reason>"
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
  - must_have: "extractPolygons hardening does not degrade pre-existing SPC/fire-weather cache correctness"
    reason: "<developer's stated reason>"
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
  - must_have: "A hard fetch failure is observable, not silent"
    reason: "<developer's stated reason>"
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
```

---

_Verified: 2026-08-19_
_Verifier: Claude (gsd-verifier)_
