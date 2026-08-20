---
phase: 14-foundation-wpc-excessive-rainfall-outlook
reviewed: 2026-08-19T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - MMM-SPCOutlook.js
  - node_helper.js
  - productRegistry.js
  - scripts/probe-lib/module-stubs.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 4
  warning: 16
  info: 6
  total: 26
status: issues_found
---

# Phase 14: Code Review Report (re-review after 14-06 / 14-07 gap closure)

**Reviewed:** 2026-08-19
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

This is a re-review of Phase 14 after plans 14-06 and 14-07 were executed to close prior CR-01.
Two files (`scripts/probe-lib/module-stubs.js`, `scripts/probe-payload-resilience.js`) are new and
reviewed here for the first time. Every claim below that says "proven" was produced by executing
the code offline through the phase's own stub loader; the scratch harness is reproducible.

### Verdict on prior CR-01: **PARTIALLY RESOLVED**

The three mechanisms the closure targeted are genuinely fixed, and I confirmed the RED→GREEN
transition rather than taking it on faith. Running the new probe against the pre-fix tree
(`git archive 2afd3d5`) yields:

```
FAIL ero-arcgis-error-body: payload collapsed to { error }: TypeError: Cannot read properties of undefined (reading 'forEach')
FAIL ero-fetch-throws:      payload collapsed to { error }: Error: simulated fetchGeoJsonCached failure
FAIL ero-malformed-feature: payload collapsed to { error }: TypeError: Cannot read properties of null (reading 'LABEL')
PROBE RESULT: 3 passed, 3 failed
```

and against HEAD, `6 passed, 0 failed`. So `_isFeatureCollection` (node_helper.js:100-102), the
`extractPolygons` entry guard (113-117), and the per-day try/catch (1017/1051-1053) do stop an
ERO failure from reaching the shared `catch` at 1169 and nulling the SPC payload. That half holds.

**What does not hold:** containment converted a loud, total failure into a quiet, partial one, and
one unguarded dereference survives *inside* the new try block. CR-01 below proves a case where a
real WPC MDT-tier polygon containing the user is reported as `"NONE"`. CR-02 proves that hardening
`extractPolygons` to return `[]` made the pre-existing SPC layers *worse*: a malformed body now
gets its `0` result written to `_geoJsonCache` together with the bad body's ETag, pinning that
layer to no-risk across every later poll. For a module whose stated core value is "no false
negatives", trading a visible `Error:` banner for a cached, invisible `"No Severe Weather Risk"`
is a net regression.

### Verdict on the two 14-07 executor claims

**PERF-02 (rejected body never cached) — CONFIRMED.** The `continue` at node_helper.js:1031 sits
above the only `this._geoJsonCache.set` in the ERO loop (1037), and the throw path never reaches
it either. Executed end-to-end with all five ERO layers returning the ArcGIS error body:

```
P1 cached ERO urls: 0 of 5
P2 total cache size: 0
```

No ETag is pinned by a rejected ERO body. The executor's ERO-only re-check was right.

**Observability ("every rejected body and every contained throw emits a `Log.error`") — FALSIFIED.**
The claim is true for the two paths it names, but it does not cover the failure mode that will
actually dominate in production. When `fetchGeoJsonCached` hits a non-2xx status or a network/DNS
error with no usable cache entry, it returns `{ data: null, cachedResult: null, stale: false }`
from lines 304 and 319 **with no log statement at all**. Neither ERO branch at 1025/1028 fires,
`eroValue` stays `0`, and the day silently becomes `"NONE"`. Executed: a full `showExcessiveRain:
true` run in which all five ERO days hard-fail emitted exactly one log line, and that line was
about something else:

```
D1 day1Risk = NONE  _stale = undefined
D2 log lines emitted during whole run: 1
   ["MMM-SPCOutlook: location changed — cache results invalidated"]
```

No `Log.error`, no `_stale` flag, no UI difference from a genuine all-clear. See CR-03.

### Verdict on the two new probe files

The probe is a real regression guard for the three CR-01 shapes — that is established above and is
the strongest thing in this diff. But two of its six scenarios can pass without exercising what
they claim (WR-01, WR-03), no scenario asserts the headline property that *SPC values survive an
ERO failure* (WR-02), and the log-capture apparatus is wired up but never asserted on (WR-04). The
golden-snapshot comparison **is** genuinely byte-comparable — `JSON.stringify` over object
literals with fixed insertion order and no proximity subtree — but `GOLDEN_FIRE_WEATHER` pins
nothing beyond key order, because its fixture can never produce a non-zero value.

Prior findings that were out of gap-closure scope were re-verified as still present and are
carried forward below with their status, including prior CR-02 (now CR-04), which remains open.

---

## Critical Issues

### CR-01: A single feature missing `properties` suppresses an already-computed real ERO risk — CR-01 is only partially closed

**File:** `node_helper.js:1035-1036` (inside the new try block at 1017-1053)

**Issue:** The new try/catch contains the throw, but it does so *after* `eroValue` has already been
correctly computed, and the catch discards it. Lines 1033-1036 run in this order:

```js
const polys = this.extractPolygons(fetchResult.data, ero.toValue, ero.includesFeat);
eroValue = this.evaluatePolygons(polys, loc, catComparator);          // real risk resolved here
const firstFeature = fetchResult.data.features[0];
eroValidTime = firstFeature ? firstFeature.properties[ero.validTimeField] : null;  // unguarded
```

`extractPolygons` now *skips* a feature with absent or null `properties` (line 120) instead of
throwing — but line 1036 still dereferences `features[0].properties` directly. So a
FeatureCollection whose first feature lacks `properties` and whose *second* feature is a valid
risk polygon containing the user throws at 1036, is swallowed by the catch at 1051, and the day
falls back to `"NONE"`. The correct answer was already in `eroValue` and is thrown away.

Proven by execution against HEAD — feature 0 has no `properties`, feature 1 is `dn: 3` (MDT) and
contains the user:

```
B1 day1Risk (expect MDT if correct) = NONE   validTime = null
B3 logs: ["MMM-SPCOutlook excessiveRain day 1: fetch/parse/evaluate failed, leaving day at no risk
          TypeError: Cannot read properties of undefined (reading 'valid_time')"]
```

This is a false negative on a life-safety product, produced by exactly the code that was written
to prevent one. It is also the mechanism by which probe scenario `ero-malformed-feature` passes
(see WR-03): that scenario's assertion `day1Risk === "NONE"` is satisfied by the crash, not by the
guard, so the probe cannot detect this.

**Fix:** guard the dereference and move it above the value computation so a bad `valid_time` can
never discard a good tier. Better still, take the time from the winning feature (see WR-10):

```js
const polys = this.extractPolygons(fetchResult.data, ero.toValue, ero.includesFeat);
eroValue = this.evaluatePolygons(polys, loc, catComparator);
if (eroValue > 0) {
  const firstFeature = fetchResult.data.features[0];
  const props = (firstFeature && typeof firstFeature.properties === "object" && firstFeature.properties) || {};
  eroValidTime = props[ero.validTimeField] ?? null;
} else {
  eroValidTime = null;   // no polygon matched — do not advertise a valid window
}
```

Then add a probe scenario with a leading property-less feature and a trailing `dn: 3` feature
covering the point, asserting `day1Risk === "MDT"`.

---

### CR-02: The `extractPolygons` hardening turned a loud SPC failure into a *cached* silent false negative that survives every later poll

**File:** `node_helper.js:113-117` (new guard) with `node_helper.js:558-578` (and the eleven
identically shaped SPC/fire-weather cache writes at 623-642, 686-705, 723, 741-760, 783-786,
795-798, 810-813, 822-825, 845-848, 857-860, 896-900 and siblings)

**Issue:** Before 14-07, a malformed body on a *pre-existing* SPC layer threw out of
`extractPolygons` and produced `{ error }` — bad, but visible. Now `extractPolygons` returns `[]`,
so `evaluatePolygons` returns `0`, the day resolves to `"NONE"`, and — unlike the ERO loop, which
deliberately `continue`s past its cache write — **the SPC call sites write that `0` into
`_geoJsonCache` along with the bad response's ETag.** Nothing in the SPC branches consults
`_isFeatureCollection`; the rejection is only visible as a log line inside `extractPolygons`.

Proven by execution against HEAD, feeding the day-1 categorical URL an ArcGIS-shaped error body:

```
A1 day1.risk = NONE   | error key: undefined
A2 cache entry for day1 cat: {"mode":"etag","etag":"E1","hash":null,"result":0,"timestamp":...}
A3 next-poll day1.risk (304 path) = NONE
A4 logs: [..., "MMM-SPCOutlook extractPolygons: rejected a response body with no usable features array"]
```

The second line is the damage: `result: 0` is now cached under the bad body's ETag. On the next
poll `fetchGeoJsonCached` sends `If-None-Match: E1`, the server answers 304, line 310 returns
`cachedResult: 0`, `0 !== null` so the cache-hit branch is taken, and the day is `"NONE"` again —
and the 304 path never rewrites the entry, so this repeats forever until the upstream file's bytes
change. The user sees `"No Severe Weather Risk"` during a High Risk day, with no `_stale` badge and
no error banner. This is strictly worse than the pre-14-07 behaviour it replaced.

**Fix:** make the SPC/fire-weather call sites do what the ERO loop already does — validate before
evaluating, and refuse to cache a rejected body:

```js
} else {
  const gj = fetchResult.data;
  if (!this._isFeatureCollection(gj)) {
    Log.error("MMM-SPCOutlook: " + day1CatURL + " returned a non-FeatureCollection body; not caching");
    anyStale = true;               // surface the degrade to the user
    day1RiskResult = 0;
  } else {
    // ... existing extract / evaluate / cache.set
  }
}
```

Given how many identical blocks exist, the durable form is to hoist this into a shared helper
(`fetchEvaluateAndCache(url, toValue, includesFeat, comparator)`) rather than editing twelve sites.
At minimum, do not `_geoJsonCache.set` when `_isFeatureCollection(gj)` is false.

---

### CR-03: A non-2xx or network ERO failure degrades to no-risk with zero observability — no log, no `_stale`, no UI signal

**File:** `node_helper.js:298-305` and `node_helper.js:314-320` (silent returns) reaching
`node_helper.js:1022-1050` (ERO defaults)

**Issue:** This is the direct falsification of executor claim #2. `fetchGeoJsonCached` has two
return paths that emit nothing at all:

```js
} catch (err) {                                   // network / DNS / TLS
  if (entry && this._isWithinStaleWindow(...)) { ...Log.info... }
  return { data: null, cachedResult: null, stale: false };   // :304 — no log
}
if (!res.ok) {                                    // 500 / 503 / 403 / 404
  if (entry && this._isWithinStaleWindow(...)) { ...Log.info... }
  return { data: null, cachedResult: null, stale: false };   // :319 — no log
}
```

In the ERO loop both branches at 1025 and 1028 are skipped (`data` is null, `cachedResult` is
null), so `eroValue` keeps its `0` initialiser and line 1049 writes `"NONE"`. `stale` is `false`,
so `anyStale` is not set and the frontend renders no ⚠ badge (MMM-SPCOutlook.js:128-140). The
result is a fully silent false negative on the single most likely production failure — a WPC
MapServer 503 or a DNS blip — which is far more common than the ArcGIS-200-error body the closure
was scoped to.

Proven: a full `showExcessiveRain: true` run with every ERO day hard-failing produced one log line,
unrelated to ERO, and `_stale` undefined (`D1`/`D2` output quoted in the Summary).

Note the same silence covers every SPC layer, so this is a pre-existing shape — but Phase 14 both
inherits it for a brand-new third-party host and shipped an explicit claim that it does not exist.
Because the phase's stated core value is "no false negatives", a no-risk reading that is
indistinguishable from a real all-clear is a blocker regardless of provenance.

**Fix:** make the hard-failure return path loud and mark the payload degraded:

```js
// in fetchGeoJsonCached, both hard-failure returns:
Log.error("MMM-SPCOutlook: unrecoverable fetch failure for " + url +
          (res ? " (HTTP " + res.status + ")" : " (network error)"));
return { data: null, cachedResult: null, stale: false, failed: true };
```

then in the ERO loop (and, ideally, every layer):

```js
if (fetchResult.failed) {
  anyStale = true;    // user-visible ⚠, so "NONE" is never mistaken for a confident all-clear
  continue;
}
```

Add a probe scenario asserting `out._stale === true` when an ERO URL hard-fails.

---

### CR-04: An SPC Mesoscale Discussion outage permanently strands the module on "Loading…"  *(PRE-EXISTING — carried forward from prior CR-02, STILL OPEN)*

**File:** `node_helper.js:50-53` (with `node_helper.js:57-61`, `node_helper.js:236-253`)

**Issue:** Re-verified unchanged at HEAD. `socketNotificationReceived` still awaits
`getMesoscaleDiscussion` with no `try`/`catch`:

```js
const md = await this.getMesoscaleDiscussion(lat, lon);
const outlook = await this.getSpcOutlook(lat, lon, extended);
this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
```

`fetchBinBuffer` throws on any non-2xx (line 59), `fetch()` rejects on DNS/TLS failure,
`extractKmlFromKmz` throws `'KMZ downloaded has no KML'` (line 72), and `MDgj.features[0].properties.name`
at line 248 throws on an MD KML with no features. Any of these rejects the handler; MagicMirror
does not await it, so `sendSocketNotification` is never reached and the frontend stays on
`"Loading SPC Outlook..."` (MMM-SPCOutlook.js:94-95) forever, self-healing never because every
`setInterval` tick takes the identical path.

This defeats the entire premise of Phase 14 more completely than CR-01 ever did: the `excessiveRain`
block that D-05 guarantees is always present is never *delivered at all*. The new probe does not
cover `socketNotificationReceived`, so nothing in this wave detects it.

**Fix:** unchanged from the prior review —

```js
let md = false;
try {
  md = await this.getMesoscaleDiscussion(lat, lon);
} catch (err) {
  Log.error("MMM-SPCOutlook: mesoscale discussion fetch failed, continuing without MDs", err);
  md = false;                                    // matches the documented "no active MDs" return
}
let outlook;
try {
  outlook = await this.getSpcOutlook(lat, lon, extended);
} catch (err) {
  Log.error("MMM-SPCOutlook: outlook fetch failed", err);
  outlook = { error: err.toString() };
}
this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
```

---

## Warnings

### WR-01: Probe scenario `spc-wellformed-baseline` claims to exercise the fire-weather path but its fixture can never produce a non-zero value

**File:** `scripts/probe-payload-resilience.js:331`, `scripts/probe-payload-resilience.js:194`,
`scripts/probe-payload-resilience.js:54-65`

**Issue:** The scenario routes `day1fw_windrh.lyr.geojson` to `SPC_SLGT_BODY`, whose feature carries
`LABEL: "SLGT"`. The fire-weather path maps labels through `fireRiskToValue = { ELEV: 1, CRIT: 2,
EXTM: 3 }` (node_helper.js:769), so `toValue` returns `0`, `includesFeat` (`val > 0`) drops the
feature, and no polygon ever reaches `evaluatePolygons`. `GOLDEN_FIRE_WEATHER` is consequently all
zeros — the exact output you get with the route removed entirely.

Proven by running the scenario with and without the fire-weather route:

```
C1 fireWeather WITH route   : {"day1Risk":0,"day1Text":"None","day2Risk":0,...
C2 fireWeather WITHOUT route: {"day1Risk":0,"day1Text":"None","day2Risk":0,...
C3 identical?  true
C4 day1 identical? true
```

The golden snapshot's *comparison* is genuinely byte-comparable (fixed literal key order, no
proximity subtree), so the mechanism is sound — but `GOLDEN_FIRE_WEATHER` pins only the key set and
ordering, not any value the fire-weather code path computes. The comment at :185-190 asserts the
constant guards "plan 14-07's shared-code changes"; for fire weather it guards nothing.

**Fix:** give the fire-weather fixture a label the product actually recognises, and re-capture the
golden:

```js
const FIRE_CRIT_BODY = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: { LABEL: "CRIT" },
               geometry: { type: "Polygon", coordinates: [SAMPLE_RING] } }]
};
// ...
["https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson", freshFetch(FIRE_CRIT_BODY)]
// GOLDEN_FIRE_WEATHER day1Risk must then be 2 / "Critical"
```

Add a self-check so this class of vacuity cannot recur: assert that at least one field in each
golden is non-default.

---

### WR-02: No scenario asserts that SPC values *survive* an ERO failure — the headline CR-01 property is only tested at key-presence level

**File:** `scripts/probe-payload-resilience.js:200-266` (scenarios 1-3), `:130-180`

**Issue:** CR-01's whole point was "an optional, default-off product must not take the primary
product offline." Scenarios `ero-arcgis-error-body`, `ero-fetch-throws`, and `ero-malformed-feature`
register **only ERO routes**, so every SPC and fire-weather URL falls through `installFetch`'s
default at :119 and hard-fails. `day1.risk` is therefore `"NONE"` in all three regardless of
whether the ERO containment works. `assertPayloadIntact` only checks that `day1`..`day8` are
objects and `fireWeather` has its keys — a regression that preserved the key shape while zeroing
every SPC value would pass all six scenarios.

**Fix:** add SPC routes to at least one ERO-failure scenario and assert the SPC values, not just
their presence:

```js
installFetch(helper, [
  ["day1otlk_cat.lyr.geojson", freshFetch(SPC_SLGT_BODY)],
  [ERO_URLS[1], freshFetch(ARCGIS_ERROR_BODY)]
]);
turfStub.pointInPolygon = () => true;
const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
assertPayloadIntact(out);
if (out.day1.risk !== "SLGT") throw new Error("ERO failure destroyed the SPC day1 value");
if (out.excessiveRain.day1Risk !== "NONE") throw new Error("...");
```

That single scenario is the one that actually states CR-01's contract.

---

### WR-03: Scenario `ero-malformed-feature` passes through the crash path, not the guard path

**File:** `scripts/probe-payload-resilience.js:251-266`, `:28-31`

**Issue:** `MALFORMED_FEATURE_BODY` has one feature with `properties: null`. `extractPolygons`
correctly skips it (node_helper.js:120), so `eroValue` is `0` — but execution then reaches line
1036 and throws `TypeError: Cannot read properties of null (reading 'valid_time')`, which the new
catch swallows. The scenario's only assertion is `day1Risk === "NONE"`, which both the correct path
and the crash path satisfy, so the probe reports PASS on code that is crashing. This is precisely
the mechanism of CR-01 above, and it is why the probe did not catch it.

**Fix:** assert on the *reason*, using the `logCalls` capture the harness already provides (see
WR-04):

```js
const { logCalls } = require("./probe-lib/module-stubs.js");
// ...
if (logCalls.some((l) => l.includes("TypeError"))) {
  throw new Error("day resolved to NONE via an exception, not via the shape guard: " +
                  logCalls.filter((l) => l.includes("TypeError")).join(" | "));
}
```

---

### WR-04: The log-capture apparatus is fully wired but never asserted on — `resetLogs()` is called six times for no observable effect

**File:** `scripts/probe-lib/module-stubs.js:15-26`, `:136-138`;
`scripts/probe-payload-resilience.js:14`, `:205`, `:233`, `:255`, `:271`, `:307`, `:327`

**Issue:** `loggerStub` records every `Log.info`/`Log.error` into `logCalls`, `resetLogs` is
exported, and every scenario calls `resetLogs()` — but `logCalls` is never imported by the probe
and no scenario ever reads it. The harness therefore *looks* like it verifies the observability
guarantee (the executor's claim #2) while verifying nothing about logging at all. Had any scenario
asserted "exactly one `Log.error` mentioning day N", both CR-03 and WR-03 would have been caught
here.

**Fix:** import `logCalls` and assert the expected diagnostic in the three failure scenarios:

```js
if (!logCalls.some((l) => l.includes("excessiveRain day 1") && l.includes("not a usable FeatureCollection"))) {
  throw new Error("rejected ERO body produced no diagnostic log line");
}
```

---

### WR-05: The probe's top-level rejection handler discards the error and reports a fabricated tally

**File:** `scripts/probe-payload-resilience.js:377-380`

**Issue:**

```js
main().catch((err) => {
  console.log(`PROBE RESULT: 0 passed, ${scenarios.length} failed`);
  process.exitCode = 1;
});
```

`err` is bound and never used, so any failure before the scenario loop — most importantly
`loadNodeHelper()` throwing because a stub no longer matches a `require` in `node_helper.js` after
a dependency change — produces "PROBE RESULT: 0 passed, 6 failed" with zero diagnostic information.
The counts are hardcoded rather than derived, so the line is a claim the runner cannot support.

**Fix:**

```js
main().catch((err) => {
  console.log(`PROBE ABORTED before scenarios completed: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 1;
});
```

---

### WR-06: A fresh-but-rejected ERO body discards a still-valid cached risk instead of falling back to last-known-good

**File:** `node_helper.js:1029-1032`

**Issue:** The rejection path `continue`s unconditionally, leaving the day at `"NONE"` — even when
`_geoJsonCache` holds a recent, valid, non-zero result for that exact URL. Not caching the bad body
is correct (PERF-02 confirmed); *ignoring the good cached value* is not. Proven: poll 1 caches a
`dn: 4` HIGH result, poll 2 receives an ArcGIS error body:

```
P4 poll1 day1Risk: HIGH   cached: {"value":4,"validTime":"T"}
P5 poll2 (error body, HIGH still cached) day1Risk: NONE   _stale: undefined
```

A WPC MapServer hiccup during an active High Risk event therefore erases a HIGH reading from the
display within one poll, with no ⚠ badge. This is the same false-negative class as CR-03, reached
through the path the closure *did* harden.

**Fix:** fall back to the cached result and mark it stale, rather than defaulting to zero:

```js
if (!this._isFeatureCollection(fetchResult.data)) {
  Log.error(`MMM-SPCOutlook excessiveRain day ${d}: non-FeatureCollection body`);
  const cached = this._geoJsonCache.get(url);
  if (cached && cached.result && this._isWithinStaleWindow(cached.timestamp, this._updateInterval)) {
    eroValue = cached.result.value;
    eroValidTime = cached.result.validTime;
    anyStale = true;
  } else {
    anyStale = true;
    continue;
  }
}
```

---

### WR-07: `extractPolygons`' rejection log identifies neither the URL nor the product

**File:** `node_helper.js:115`

**Issue:** `Log.error("MMM-SPCOutlook extractPolygons: rejected a response body with no usable
features array")` is emitted from a helper shared by roughly twenty-five call sites across SPC
categorical, hazard-probability, CIG, Day 4-8, fire-weather, and ERO layers. The message carries no
URL, no day, and no product name, so an operator seeing it in the MagicMirror log cannot tell which
of twenty-five layers degraded (confirmed verbatim in experiment A4). This directly undercuts the
"degradation is diagnosable from the log" claim even on the path where a log *is* emitted.

**Fix:** pass a context label through, or log at the call site instead of inside the shared helper:

```js
extractPolygons(geojson, toValue, includesFeat, context = "unknown layer"){
  if (!this._isFeatureCollection(geojson)) {
    Log.error("MMM-SPCOutlook extractPolygons: rejected body for " + context);
    return [];
  }
```

---

### WR-08: `_isFeatureCollection` — the file's declared "shared response-shape gate" — blesses a truncated ArcGIS response  *(prior WR-02, UNFIXED)*

**File:** `node_helper.js:100-102`, `productRegistry.js:31`

**Issue:** `buildArcGisQuery` emits no `resultRecordCount` and does no paging, so ArcGIS caps every
query at the layer's `maxRecordCount` and signals truncation with a top-level
`"exceededTransferLimit": true` on a structurally valid FeatureCollection. `_isFeatureCollection`
does not look at it — proven:

```
P3 _isFeatureCollection on truncated body: true
```

A truncated response therefore flows through `extractPolygons` → `evaluatePolygons` and, if the
user's polygon was among the dropped features, reports `"NONE"` with full confidence and caches it.
This matters more now than in the prior review: the JSDoc at 91-99 declares this predicate the
gate that "Phases 15-17 registry rows reuse verbatim", so the omission is about to be inherited by
four more products.

**Fix:** fold the check into the predicate that owns response-shape validation:

```js
_isFeatureCollection(body){
  return !!body && typeof body === "object" && !body.error &&
         body.exceededTransferLimit !== true && Array.isArray(body.features);
}
```

---

### WR-09: `resetHelper` duplicates `start()`'s field list, so new helper state silently leaks across scenarios

**File:** `scripts/probe-lib/module-stubs.js:123-130` vs `node_helper.js:22-30`

**Issue:** `loadNodeHelper` calls `helper.start()`, then `resetHelper` re-initialises the same five
fields by hand. The two lists are unlinked. Any field a future phase adds to `start()` (a fetch
in-flight guard, a per-product cache, a rate-limit token) will not be reset between scenarios, so
scenario N's state bleeds into scenario N+1 and the failure will present as an unrelated flaky
assertion. `_loggedIntervalFallback` (node_helper.js:37-40) is already outside both lists.

**Fix:** delegate rather than duplicate:

```js
function resetHelper(helper) {
  helper.start();   // single source of truth for helper-global initialisation
}
```

---

### WR-10: ERO `valid_time` is read from `features[0]`, not the polygon the user is in, and is set even on the no-risk path  *(prior WR-01, UNFIXED)*

**File:** `node_helper.js:1035-1036`

**Issue:** Unchanged. `features[0]` is whichever polygon the server serialised first, not the one
containing the user; and `eroValidTime` is assigned regardless of whether `eroValue` came out `0`,
so a user outside every polygon still receives `{ day1Risk: "NONE", day1ValidTime: "…" }` — a
risk-free day advertising a valid window. See CR-01 for the fix, which addresses both defects.

---

### WR-11: No request timeout on any fetch; the ERO block adds five more serial hops on a new host  *(prior WR-05, UNFIXED)*

**File:** `node_helper.js:2`, `:58`, `:297`, `:1019`

**Issue:** Unchanged. `node-fetch` has no default timeout, `getSpcOutlook` is a fully serial ~25-hop
await chain, and `socketNotificationReceived` awaits it before emitting anything, so one hung socket
against `mapservices.weather.noaa.gov` blocks the entire payload — and with no in-flight guard the
next `setInterval` tick stacks another chain behind it.

**Fix:** `res = await fetch(url, { headers, signal: AbortSignal.timeout(15000) });` at every call
site; the existing `catch` at 298 already routes `AbortError` into the stale-fallback path.

---

### WR-12: Remote-controlled strings are concatenated into `innerHTML` unescaped  *(prior WR-06, UNFIXED)*

**File:** `MMM-SPCOutlook.js:97`, `MMM-SPCOutlook.js:143`

**Issue:** Unchanged. `wrapper.innerHTML = "Error: " + this.spcrisk.error` renders `err.toString()`,
and Node's `JSON.parse` SyntaxError message embeds a verbatim window of the response body — so an
attacker-positioned `<img src=x onerror=…>` fragment reaches `innerHTML` unescaped. `MD` at :143 is
unbounded remote KML text. Note CR-01/CR-02 make this *less* reachable via the ERO path (bodies now
degrade instead of erroring), but the unguarded `JSON.parse` at node_helper.js:334 and :344 still
throws to the shared catch for any SPC layer.

**Fix:** `wrapper.textContent = "Error: " + this.spcrisk.error;` and build the MD spans with
`createElement`/`textContent` rather than string concatenation.

---

### WR-13: Helper-global `this._products` is read ~twenty awaits after it is written  *(prior WR-07, UNFIXED)*

**File:** `node_helper.js:29`, `:49`, `:1015`

**Issue:** Unchanged. `this._products` is written at line 49 and not read until line 1015. With no
in-flight guard and no fetch timeout (WR-11), a second `GET_SPC_DATA` arriving mid-flight makes the
first chain read the second request's toggle. Multi-instance MagicMirror setups share one
`node_helper` per module *type*, so two configured instances also overwrite each other's toggle and
`_cachedLat`/`_cachedLon` on every poll.

**Fix:** snapshot the toggles into a local in `socketNotificationReceived` and pass them as a
parameter to `getSpcOutlook`.

---

### WR-14: Location-change invalidation keeps the ETag, so the next 304 pins every product to no risk  *(prior WR-08, UNFIXED — now also the persistence mechanism behind CR-02)*

**File:** `node_helper.js:457-464`, `node_helper.js:308-311`

**Issue:** Unchanged. The invalidation loop nulls `result` but preserves `mode`, `etag`, and `hash`,
so the next request still sends `If-None-Match`, the server answers 304, and line 310 returns
`cachedResult: null` — which every caller's `data === null && cachedResult !== null` branch skips,
falling to the `0`/`NONE` default. The 304 path never rewrites the entry, so this repeats
indefinitely. The ERO loop reproduces the shape at 1025-1027. Line 310 also dereferences
`entry.result` without checking `entry !== undefined`, which throws if a proxy returns 304 for a
request that carried no `If-None-Match`.

**Fix:** `this._geoJsonCache.clear()` on location change (nothing in an entry is
location-independent once `result` is dropped), or at minimum null `etag` and `hash` alongside
`result`; and guard `entry` at 310.

---

### WR-15: The `products` notification payload literal is still duplicated between `start()` and the interval  *(prior WR-09, UNFIXED)*

**File:** `MMM-SPCOutlook.js:17`, `MMM-SPCOutlook.js:19`

**Issue:** Unchanged. The six-field payload including `products: { showExcessiveRain: … }` is
written out twice, and the comment at :15-16 instructs three future phases to edit both copies. A
missed edit renders correctly on startup and silently reverts on the first hourly refresh.

**Fix:** extract a `buildRequestPayload()` method and call it from both sites.

---

### WR-16: Registry fields remain unconsumed and the ERO day count is still hardcoded in two places  *(prior WR-03 and WR-04, UNFIXED)*

**File:** `productRegistry.js:54-59`, `node_helper.js:1016`, `node_helper.js:1160-1166`

**Issue:** Re-verified by grep: `id` has zero consumers; `configFlag`, `baseUrl`, and `dayLayers`
appear only in `productRegistry.js` itself; `ero.days` has zero consumers. The comment at
`productRegistry.js:55` still claims node_helper reads `this._products[row.configFlag]` — it does
not (line 49 and 1015 hardcode `showExcessiveRain`). The loop bound at node_helper.js:1016 and the
five-day payload literal at 1160-1166 are independent literals that nothing links to `days: 5`.

One thing did improve: `buildUrl(6)` still throws (`P7 buildUrl(6): buildArcGisQuery: layerId must
be a non-negative integer`), but the new try/catch now contains that throw to a single day instead
of nulling the payload — so raising the loop bound without touching `eroDayLayers` is no longer
catastrophic, merely silently wrong.

**Fix:** drive the loop bound, the seed objects, and the payload block from `ero.days` /
`Object.keys(ero.dayLayers)`, and either make `_products` registry-driven or correct the
`configFlag` comment to say it is informational.

---

## Info

### IN-01: CONVENTION — new ERO comparisons use loose `!=` where surrounding new code uses strict equality  *(prior IN-01, UNFIXED)*

**File:** `MMM-SPCOutlook.js:117-121`, `MMM-SPCOutlook.js:206`

**Deviation:** The ERO no-risk conjunct and render loop compare tier strings with `!=`, while the
newer helpers in the same function use `===`/`!==` throughout (`cig === 3` :45-47,
`typeof prox.value !== "number"` :65, `day3CatBadge !== ""` :171).

**Convention violated:** newly added comparisons in this file use strict equality; loose forms
appear only in the older risk-string blocks.

**Suggested fix (recommend, non-blocking):** use `!==`. Both operands are guaranteed strings —
`eroTiers[d]` is `|| "NONE"`-clamped at node_helper.js:1049 — so this is a zero-risk change.

---

### IN-02: CONVENTION — `extractPolygons` JSDoc still documents a one-argument `toValue`  *(prior IN-02, UNFIXED)*

**File:** `node_helper.js:106`, `productRegistry.js:63-66`

**Deviation:** `@param toValue - function mapping a feature's LABEL string to a numeric value`
describes a one-argument contract, while the implementation calls `toValue(label, f)` (line 122)
and the ERO registry row depends entirely on the second parameter. This is now conspicuous because
the freshly written `_isFeatureCollection` JSDoc directly above it (91-99) is accurate and detailed
— the two blocks were edited in the same commit and only one was corrected.

**Suggested fix (recommend, non-blocking):**

```js
* @param toValue - (label, feature) => number; maps a feature's LABEL string and/or its raw
*                  properties to a numeric tier value. Products with no LABEL field (e.g. the
*                  WPC ERO, which keys off lowercase `properties.dn`) use the second argument.
```

---

### IN-03: CONVENTION — the registry and its lookup tables are exported mutable; `buildArcGisQuery` has no external consumer  *(prior IN-03, UNFIXED)*

**File:** `productRegistry.js:83`, `:24`, `:43-50`

**Deviation:** The header comments (11-14, 38-42) treat `f=geojson` and `eroDnToValue` as
inviolable, yet every table is exported as a plain mutable object — any consumer can reassign
`PRODUCT_REGISTRY.excessiveRain.toValue` and reintroduce ERO-02. `buildArcGisQuery` is exported but
imported by nothing (grep shows five occurrences, all inside `productRegistry.js`).

**Suggested fix (recommend, non-blocking):**
`module.exports = Object.freeze({ PRODUCT_REGISTRY: Object.freeze(PRODUCT_REGISTRY) })` with
`Object.freeze` on each nested table; keep `buildArcGisQuery` exported only if a Phase 15-17
consumer is imminent.

---

### IN-04: CONVENTION — the ERO try block body is not re-indented, hiding the containment boundary  *(NEW this wave)*

**File:** `node_helper.js:1017-1053`

**Deviation:** The `try {` opened at 1017 and its body at 1018-1050 sit at the same indentation
level, with only the closing `} catch (eroErr) {` at 1051 re-indented:

```js
        for (let d = 1; d <= 5; d++) {
          try {
          const url = ero.buildUrl(d);          // <- same column as `try`
          const fetchResult = await this.fetchGeoJsonCached(url);
          ...
          eroValidTimes[d] = eroValidTime;
          } catch (eroErr) {
```

Every other block in this file indents its body. Since the whole point of this diff is that a
specific span is exception-contained, making that span visually indistinguishable from unguarded
code is the opposite of what a reader needs — and it is exactly the region where CR-01's remaining
unguarded dereference hides.

**Convention violated:** block bodies in `node_helper.js` are indented one level from their opening
brace.

**Suggested fix (recommend, non-blocking):** re-indent lines 1018-1050 by two spaces. The repo has
ESLint in `devDependencies`; an `indent` rule would enforce this mechanically.

---

### IN-05: CONVENTION — `installStubs` and `logCalls` are exported but unused outside the module  *(NEW this wave)*

**File:** `scripts/probe-lib/module-stubs.js:132-139`

**Deviation:** The probe imports only `loadNodeHelper`, `resetHelper`, `resetLogs`, and `turfStub`.
`installStubs` is called internally by `loadNodeHelper` and needs no export; `logCalls` is exported
and never read (see WR-04). The file's own header says future product rows "reuse this same
loader", so unused surface here will be copied forward.

**Suggested fix (recommend, non-blocking):** drop `installStubs` from the export list, and either
consume `logCalls` in assertions (preferred — it closes WR-04) or remove it along with
`resetLogs`.

---

### IN-06: CONVENTION — the probe is not reachable from `package.json`, so nothing routinely runs it  *(NEW this wave)*

**File:** `scripts/probe-payload-resilience.js:4`, `package.json:6-8`

**Deviation:** `package.json` declares only `"start": "node node_helper.js"`. The probe's own
header documents the invocation as a bare shell command, the file has no shebang and is not
executable, and no CI configuration exists in the repo. A regression guard that must be remembered
and typed by hand is a guard that stops running.

**Convention violated:** executable entry points in this repo are declared in `package.json`
`scripts`.

**Suggested fix (recommend, non-blocking):**

```json
"scripts": {
  "start": "node node_helper.js",
  "probe": "node scripts/probe-payload-resilience.js",
  "test": "npm run probe"
}
```

---

## Verification appendix

All "proven" claims above were produced offline through `scripts/probe-lib/module-stubs.js` with no
network and no reliance on the phase's own probe assertions. Reproduction summary:

| Experiment | Result |
|---|---|
| Probe at HEAD | `6 passed, 0 failed`, exit 0 |
| Probe against pre-fix tree (`git archive 2afd3d5`) | `3 passed, 3 failed`, exit 1 — RED baseline confirmed |
| A: garbage body on `day1otlk_cat` | `day1.risk = NONE`, cached `{result: 0, etag: "E1"}`, next 304 poll → `NONE` |
| B: ERO `features[0]` without `properties`, `features[1]` = `dn: 3` covering point | `day1Risk = NONE` (expected `MDT`); TypeError swallowed by ERO catch |
| C: probe scenario 6 with/without the fire-weather route | `fireWeather` and `day1` byte-identical |
| D: all five ERO days hard-fail | 1 log line total (unrelated), `_stale` undefined |
| P1/P2: five ERO error bodies | `0 of 5` ERO URLs cached, total cache size `0` — PERF-02 confirmed |
| P3: `_isFeatureCollection({exceededTransferLimit: true, features: []})` | `true` |
| P4/P5: cached HIGH, then error body | `HIGH` → `NONE`, `_stale` undefined |
| P6: empty FeatureCollection | `NONE` / `validTime: null` — correct |
| P7: `buildUrl(6)` | throws, now contained to one day |

---

_Reviewed: 2026-08-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
