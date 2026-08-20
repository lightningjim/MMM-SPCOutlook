---
phase: 14-foundation-wpc-excessive-rainfall-outlook
reviewed: 2026-08-20T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - MMM-SPCOutlook.js
  - node_helper.js
  - productRegistry.js
  - scripts/probe-lib/module-stubs.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 2
  warning: 9
  info: 6
  total: 17
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-08-20
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Fresh adversarial pass over the current state of the five phase-14 files. The ERO
product itself (`productRegistry.js` + the ERO fetch/evaluate loop) is narrow, well
contained, and its per-day try/catch does what it claims: I could not make it collapse
the payload. The registry's host allowlist and integer guard on `buildArcGisQuery` are
genuinely defensive.

The defects are not in the ERO tier math. They are in three places:

1. **Shared mutable helper state that is keyed by URL but holds location-resolved
   answers.** I reproduced a case where a location in Florida is reported as `SLGT`
   because another chain resolved that risk for a location in Maryland. The phase's own
   WR-13 comment identifies the two-instance hazard and fixes only the toggle half of
   it; the cache half and the socket-broadcast half remain, and the new ERO product
   inherits both.

2. **A defensive branch in the ERO loop that production can never enter, and the probe
   scenario built on top of it.** `fetchGeoJsonCached` only ever returns non-null `data`
   after passing `_isFeatureCollection` (node_helper.js:477, 489 — the only two
   `data:`-bearing returns). The ERO loop re-checks the same predicate at
   node_helper.js:1196 and hangs the entire WR-06 stale-fallback off it. That code is
   dead in production, and `ero-arcgis-error-body` — the probe's headline scenario —
   reaches it only by stubbing `fetchGeoJsonCached` with a return shape the real
   function cannot produce. Its per-day `requireLog` assertion would fail against the
   real code path.

3. **Two probe assertions that hold for reasons unrelated to what they claim to
   test.** I verified `ero-hard-fail-is-flagged` passes with the ERO loop skipped
   entirely. This is the same vacuity class the prior fix pass caught in WR-01/WR-02,
   still present in a sibling scenario.

All 8 probe scenarios pass. That is not evidence of correctness here — two of the eight
would pass against code with the behaviour they name removed.

Several findings below are pre-existing rather than introduced by this phase. They are
reported because the files are in scope, because the phase's own comments claim to have
addressed them, and because the new product multiplies their blast radius.

## Critical Issues

### CR-01: `_geoJsonCache` is keyed by URL but stores location-resolved risk values — one location's answer is served for another

**File:** `node_helper.js:386, 522, 608-621, 703-704, 1192-1194`
**Issue:**
Every cache entry's `result` field is a *point-in-polygon answer for a specific lat/lon*
(`result: day1RiskResult`, `result: risk`, `result: { value: eroValue, validTime }`),
but the cache key is the layer URL alone. The only protection is the
`locationChanged` check at line 608, which clears the whole map when `lat/lon` differ
from `this._cachedLat/_cachedLon`. That check assumes exactly one chain is ever in
flight — an assumption the code explicitly does not hold to (`withTimeout`'s own comment
at line 3-8: *"with no in-flight guard the next interval tick stacks another chain
behind it"*), and which MagicMirror breaks by design (one `node_helper` per module
*type*, shared by every configured instance).

Reproduced against the real `getSpcOutlook` using the phase's own probe stubs, with a
`fetchGeoJsonCached` that honours the ETag cache-hit branch:

```
A (inside polygon, lat 38.9): SLGT
B (outside polygon, lat 25.0) after location-change clear: NONE     <- correct
C (outside polygon, lat 25.0) reading A's cached result: SLGT       <- WRONG
```

Case C is reached whenever chain A repopulates the cache after chain B has already won
the `_cachedLat` write — i.e. any interleaving of two instances, or of two overlapping
polls. `this._updateInterval` (line 73) is shared the same way, so instance B's polling
interval also decides instance A's stale window.

This reports severe-weather risk for the wrong location, in both directions: a false
`HIGH` and a false `NONE` are equally reachable. The new ERO entries at line 1192-1194
inherit the defect exactly.

**Fix:** Include the resolved location in the cache key, so a cross-location hit is
structurally impossible rather than guarded by a racy sentinel:

```js
// node_helper.js — replace every this._geoJsonCache.get/set/has(url) with:
_cacheKey(url, lat, lon) {
  return `${lat.toFixed(4)},${lon.toFixed(4)}|${url}`;
},
```

Thread `lat`/`lon` (already parameters of `getSpcOutlook`) into `fetchGeoJsonCached`,
`fetchAndEvaluateHazard` and the ERO loop, and delete the `locationChanged` clear plus
`_cachedLat`/`_cachedLon` — they become unnecessary. Separately, add the in-flight guard
the WR-11 comment already identifies as missing:

```js
// socketNotificationReceived
if (this._inFlight) { Log.info("MMM-SPCOutlook: poll already in flight, skipping"); return; }
this._inFlight = true;
try { /* existing body */ } finally { this._inFlight = false; }
```

### CR-02: `SPC_DATA_RESULT` is broadcast to every module instance, so a second instance overwrites the first's outlook — including its `showExcessiveRain` result

**File:** `node_helper.js:111`; `MMM-SPCOutlook.js:36-44`
**Issue:**
`this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md])` carries no correlation
back to the request that produced it. MagicMirror delivers a node_helper socket
notification to *every* frontend instance of that module type, and
`socketNotificationReceived` (MMM-SPCOutlook.js:37-43) accepts unconditionally:

```js
this.spcrisk = payload[0];
this.mds = payload[1];
this.updateDom();
```

With two configured instances the last chain to finish wins for both. Concretely, for
this phase:

- Instance A (`showExcessiveRain: true`) renders a payload computed by instance B's
  chain with the toggle **off** — `excessiveRain` is all `"NONE"`, so the product the
  user enabled silently never appears. The frontend gate at MMM-SPCOutlook.js:227 cannot
  detect this: the key is present and well-formed, just computed for the wrong config.
- Both instances render whichever instance's lat/lon finished last, so a user with a
  home and a work location sees one location's risk under both headings.

The WR-13 comment at node_helper.js:82-87 states this exact hazard (*"two configured
instances overwrote each other's on every poll"*) and fixes only the toggle-snapshot
half. The response-routing half is untouched, so the user-visible symptom the comment
describes still occurs.

**Fix:** Echo the request identity in the response and have each instance filter:

```js
// MMM-SPCOutlook.js — buildRequestPayload()
return { instanceId: this.identifier, lat: ..., /* ... */ };

// node_helper.js — socketNotificationReceived
this.sendSocketNotification("SPC_DATA_RESULT", { instanceId: payload.instanceId, outlook, md });

// MMM-SPCOutlook.js — socketNotificationReceived
if (notification !== "SPC_DATA_RESULT") return;
if (payload.instanceId !== this.identifier) return;   // not ours
this.spcrisk = payload.outlook;
this.mds = payload.md;
this.updateDom();
```

Note this must land together with CR-01's per-location cache key; fixing either alone
leaves the other's cross-instance corruption intact.

## Warnings

### WR-01: the ERO loop's `_isFeatureCollection` branch and its WR-06 stale-fallback are unreachable in production, and the probe's headline scenario only reaches them via a fabricated stub return

**File:** `node_helper.js:1196-1211`; `scripts/probe-payload-resilience.js:290-338`
**Issue:**
`fetchGeoJsonCached` returns a non-null `data` in exactly two places — node_helper.js:477
and :489 — and both are immediately preceded by
`if (!this._isFeatureCollection(parsed.value)) return rejectBody(...)`. Every other
return sets `data: null`. Therefore `fetchResult.data !== null` at line 1195 *implies*
`_isFeatureCollection(fetchResult.data)`, and the entire branch at 1196-1211 — the
`Log.error`, the `anyStale = true`, the last-known-good lookup, the `continue` — is dead
code in production.

Consequences:

1. The WR-06 guarantee ("a WPC hiccup during an active HIGH must not blank the display")
   is *not* delivered by this branch. It is delivered by `rejectBody`
   (node_helper.js:446-453), which independently falls back to `entry.result`. The
   duplicated logic is a second, divergent implementation of the same policy — and the
   two disagree: `rejectBody` requires `entry.result !== null && !== undefined`, the ERO
   copy requires `cached.result` to be *truthy*.
2. `ero-arcgis-error-body` — the scenario whose comment claims to exercise "the
   documented ArcGIS REST failure shape returned inside an HTTP 200" — reaches this
   branch only because `installFetch` replaces `fetchGeoJsonCached` wholesale and returns
   `{ data: ARCGIS_ERROR_BODY, ... }`, a shape the real function will never emit.
3. Its assertion is therefore wrong about production. In production the same body
   produces `Log.error('MMM-SPCOutlook: rejected an unusable response body for ' + url
   + ' (not a usable FeatureCollection); not caching')` — which does **not** contain
   `"excessiveRain day 1"`. The probe's
   `requireLog(['excessiveRain day 1', 'not a usable FeatureCollection'])` at line 331-334
   would fail against the real path it claims to cover.

**Fix:** Delete the redundant branch and rely on the single `rejectBody` policy:

```js
// node_helper.js — ERO loop
if (fetchResult.data === null && fetchResult.cachedResult !== null) {
  eroValue = fetchResult.cachedResult.value;
  eroValidTime = fetchResult.cachedResult.validTime;
} else if (fetchResult.data !== null) {
  // fetchGeoJsonCached has already validated the shape (node_helper.js:476, 488)
  const polys = this.extractPolygons(fetchResult.data, ero.toValue, ero.includesFeat, url);
  ...
}
```

Then move the probe's seam one layer down so the scenario exercises the real
`fetchGeoJsonCached`: stub the HTTP response (`res.ok`/`res.status`/`res.text()`/
`res.headers.get`) rather than the function that interprets it, and assert on the
`rejected an unusable response body for <ERO url>` line that production actually emits.

### WR-02: `ero-hard-fail-is-flagged` is vacuous — it passes with the ERO loop entirely skipped

**File:** `scripts/probe-payload-resilience.js:418-440`
**Issue:**
The scenario calls `installFetch(helper, [])`, which routes *every* URL to the
hard-failure shape. That means every SPC categorical, hazard, CIG and fire-weather layer
also hard-fails and sets `anyStale = true` at node_helper.js:702 — long before the ERO
loop runs. The final assertion `out._stale !== true` therefore says nothing about ERO.

Verified directly: with the ERO toggle **off** (so the ERO loop never executes at all)
and the same all-fail fetch stub, `getSpcOutlook` still returns `_stale: true`. Deleting
`if (fetchResult.stale || fetchResult.failed) anyStale = true;` from the ERO loop
(node_helper.js:1187) would not fail this scenario.

This is the identical defect class the prior fix pass corrected in WR-02 for
`ero-arcgis-error-body`; it survives in this sibling.

**Fix:** Give the non-ERO layers a body that succeeds, so `anyStale` can only come from
the ERO loop:

```js
name: "ero-hard-fail-is-flagged",
run: async (helper) => {
  resetHelper(helper); resetLogs();
  helper._products = { showExcessiveRain: true };
  // every SPC/fire layer succeeds; only the ERO URLs are unrouted -> hard-fail
  installFetch(helper, [[".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]]);
  const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
  assertPayloadIntact(out);
  if (out._stale !== true) throw new Error("a hard-failed ERO fetch produced an unflagged no-risk payload");
  // and prove the negative control: with the toggle off the same run must NOT be stale
}
```
Add the paired negative control (toggle off, same routes → `_stale` falsy), which is
what makes the assertion non-vacuous.

### WR-03: the "⚠ Stale" badge always reads "a few seconds ago" — `_staleAsOf` is stamped at response time, not at the cached data's age

**File:** `node_helper.js:1256`; `MMM-SPCOutlook.js:151-163`
**Issue:**
`...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {})` records the moment the
payload was assembled. The frontend then does:

```js
const delta = Date.now() - asOf;
if (delta < 0) { staleSuffix = " — just now"; } else { staleSuffix = " — " + moment(asOf).fromNow(); }
```

`delta` is measured to be `0 ms` in practice (verified against the real
`getSpcOutlook`), so the badge renders `⚠ Stale — a few seconds ago` on every stale
render, regardless of whether the underlying reading is 2 minutes or 59 minutes old. The
`delta < 0` "just now" branch is unreachable dead code. A freshness indicator that always
reports maximum freshness while flagging staleness is worse than no indicator: the
operator cannot tell a momentary blip from a layer that has been dark all hour.

**Fix:** Track the oldest cached timestamp that contributed to the payload and report
that:

```js
// alongside `let anyStale = false;`
let oldestStaleAt = null;
// wherever a stale/cached result is accepted:
const entry = this._geoJsonCache.get(url);
if (entry && (oldestStaleAt === null || entry.timestamp < oldestStaleAt)) oldestStaleAt = entry.timestamp;
// in the return literal:
...(anyStale ? { _stale: true, _staleAsOf: oldestStaleAt } : {}),
```
`oldestStaleAt` stays `null` for a hard failure with no cache entry, which the frontend's
existing `typeof asOf === "number"` guard already handles by omitting the suffix.

### WR-04: `updateInterval` is accepted from config with no validation — `0`, a negative, or a non-number silently disables the stale window and turns the poll into a request storm

**File:** `node_helper.js:66-74, 375-378`; `MMM-SPCOutlook.js:33`
**Issue:**
The only check is `updateInterval === undefined`. Everything else is stored verbatim:

- `updateInterval: 0` → `_isWithinStaleWindow` computes `intervalMs = 0`, so
  `(Date.now() - timestamp) < 0` is always false and **no stale fallback ever fires** —
  every transient blip becomes a hard failure and a confident `NONE`.
- `updateInterval: "60"` (a string, an easy config typo) → `"60" * 60 * 1000` is fine,
  but `updateInterval: "hourly"` → `NaN`, `x < NaN` is always false, same silent
  disablement.
- On the frontend, `setInterval(..., this.config.updateInterval * 60000)` with `NaN`,
  `0` or a negative is clamped by the host to ~1 ms, producing an unbounded poll loop
  against `www.spc.noaa.gov` and `mapservices.weather.noaa.gov` — a self-inflicted DoS
  that the phase's new 5 ERO fetches per cycle makes ~20% worse.

**Fix:** Validate and clamp at both ends:

```js
// node_helper.js — socketNotificationReceived
const n = Number(updateInterval);
if (!Number.isFinite(n) || n < 1) {
  if (!this._loggedIntervalFallback) {
    Log.warn(`MMM-SPCOutlook: invalid updateInterval ${JSON.stringify(updateInterval)}, defaulting to 60 minutes`);
    this._loggedIntervalFallback = true;
  }
  this._updateInterval = 60;
} else {
  this._updateInterval = n;
}
```
Apply the same clamp in `MMM-SPCOutlook.js:start()` before the `setInterval` call.

### WR-05: `getMesoscaleDiscussion` fetches arbitrary URLs harvested from a remote KML with no host allowlist

**File:** `node_helper.js:334-351` (`parseNetworkLinks` at :134-139, `fetchBinBuffer` at :115-119)
**Issue:**
`parseNetworkLinks` extracts every `//k:NetworkLink/k:Link/k:href/text()` value from the
downloaded `ActiveMD.kmz` and `fetchBinBuffer` fetches each one with no scheme, host or
redirect validation. Any party able to influence that KML (an upstream compromise, a
transparent proxy, a hostile DNS answer) gets the MagicMirror host to issue arbitrary
outbound requests — including to RFC1918 addresses, which from a home-network Pi is the
interesting target.

This directly contradicts the convention the same phase established one file over:
`buildArcGisQuery` (productRegistry.js:28-30) refuses any `baseUrl` that is not
`https://mapservices.weather.noaa.gov/`. The new product is allowlisted; the older path
that feeds the same `innerHTML` render is not.

**Fix:** Apply the registry's allowlist idiom to the MD path:

```js
const MD_HOST_PREFIX = "https://www.spc.noaa.gov/";
const MDURLs = this.parseNetworkLinks(ActiveKML).filter((u) => {
  if (typeof u === "string" && u.startsWith(MD_HOST_PREFIX)) return true;
  Log.error("MMM-SPCOutlook: refusing off-host NetworkLink href " + u);
  return false;
});
```
Also pass `{ redirect: "error" }` (or validate `res.url`) through `withTimeout()` in
`fetchBinBuffer` so a 302 cannot escape the allowlist.

### WR-06: `getMesoscaleDiscussion` reads `features[0].properties.name` unguarded — the exact `features[0]` anti-pattern the ERO work rejected, and one bad MD now discards all MDs

**File:** `node_helper.js:346`
**Issue:**
```js
if(MDApplies) MDArray.push(MDgj.features[0].properties.name);
```
Two defects in one line:

1. **Wrong feature.** `checkInPolygon` (line 1367) returns `true` if *any* feature
   contains the point, but the name is then read off `features[0]` unconditionally. When
   an MD KML carries more than one feature, the reported discussion name is whichever the
   server serialised first, not the one the user is inside. This is verbatim the
   `features[0]` bug that CR-01/WR-10 fixed for ERO via `_validTimeOfWinner`
   (node_helper.js:237-247) — the fix was applied to the new product and not to the
   existing one.
2. **Unguarded dereference, now with a wider blast radius.** If `features` is empty or
   `features[0].properties` is absent, this throws a `TypeError`. Before this phase that
   propagated to the caller; now the new `try/catch` at node_helper.js:97-102 swallows it
   and sets `md = false`, so **one malformed MD silently discards every other active
   MD** — including ones that do apply to the user. The `catch` improved payload
   survival (correctly) but converted a loud failure into a silent under-report of active
   severe-weather discussions.

Note also `checkInPolygon` (line 1369) iterates `geojson.features` with no `Array.isArray`
guard, so a `togeojson` result without a `features` array throws into the same catch.

**Fix:** Return the containing feature's name, per-MD, and contain per-MD failures:

```js
checkInPolygon(geojson, lat, lon){
  const pt = turf.point([lon, lat]);
  if (!geojson || !Array.isArray(geojson.features)) return null;
  for (const feature of geojson.features) {
    if (!feature || !feature.geometry) continue;
    const t = feature.geometry.type;
    let poly = null;
    if (t === "Polygon") poly = turf.polygon(feature.geometry.coordinates);
    else if (t === "MultiPolygon") poly = turf.multiPolygon(feature.geometry.coordinates);
    else continue;
    if (turf.booleanPointInPolygon(pt, poly)) return feature;   // the winner, not features[0]
  }
  return null;
}

// caller
for (const MDURL of MDURLs) {
  try {
    ...
    const hit = this.checkInPolygon(MDgj, lat, lon);
    const name = hit && hit.properties && hit.properties.name;
    if (name) MDArray.push(name);
  } catch (err) {
    Log.error("MMM-SPCOutlook: skipping unreadable MD " + MDURL, err);   // one bad MD, not all of them
  }
}
```

### WR-07: `_validTimeOfWinner` aborts the whole scan on the first winning polygon that lacks the field, instead of trying the next one

**File:** `node_helper.js:237-247`
**Issue:**
```js
for (const item of items) {
  if (!item || item.value !== winningValue || !item.poly) continue;
  if (!turf.booleanPointInPolygon(loc, item.poly)) continue;
  const props = item.feature && item.feature.properties;
  if (!props || typeof props !== "object") return null;   // aborts, does not continue
  return props[field] ?? null;                            // also aborts on a null valid_time
}
```
Both terminal statements exit the loop. When the user is inside two polygons of the same
winning tier — routine at an ERO tier boundary, and the ArcGIS layer does return
multi-part tiers — and the first-serialised one carries `valid_time: null` (ArcGIS emits
null-valued fields freely), the second polygon's real validity window is never consulted
and the payload reports `null`. That is precisely the `features[0]`-ordering dependence
the function's own docstring says it exists to eliminate.

The first branch is additionally unreachable: `extractPolygons` (node_helper.js:193)
already drops any feature whose `properties` is not a non-null object, so every item in
`items` has object properties. Its `return null` is dead code that reads as a real guard.

**Fix:**
```js
_validTimeOfWinner(items, loc, winningValue, field){
  if (!Array.isArray(items) || !field) return null;
  for (const item of items) {
    if (!item || item.value !== winningValue || !item.poly) continue;
    if (!turf.booleanPointInPolygon(loc, item.poly)) continue;
    const props = item.feature && item.feature.properties;
    if (!props || typeof props !== "object") continue;      // try the next winner
    const v = props[field];
    if (v !== undefined && v !== null) return v;            // keep looking on a null field
  }
  return null;
}
```
Add a probe fixture with two same-tier polygons where the first has `valid_time: null`;
the current code returns `null` and the fixed code returns the second window.

### WR-08: `assertPayloadIntact` hardcodes the ERO day count and key count that the registry is supposed to own

**File:** `scripts/probe-payload-resilience.js:167-217` (lines 174, 186, 198, 201, 210)
**Issue:**
The file's header comment claims *"Future product rows add one scenario object here —
the loader and contract assertion are product-agnostic."* The assertion is not
product-agnostic: it hardcodes `d <= 5`, `eroKeyCount !== 20`, `d <= 8` for days and
fire weather, and the literal suffix list `["Risk","Text","Color","ValidTime"]`.

Meanwhile node_helper.js:1175-1253 goes out of its way to derive every one of those from
`ero.days` ("*no literal day count survives outside the registry*"). Changing
`PRODUCT_REGISTRY.excessiveRain.days` from 5 to 7 — the single declared knob — makes the
probe fail with `excessiveRain has 28 keys, expected 20`, a message that points at the
payload rather than at the probe. The comment overclaims and the next product row will
hit this.

**Fix:** Derive the expectation from the registry, keeping the suffix list as the
independent oracle:

```js
const ERO_SUFFIXES = ["Risk", "Text", "Color", "ValidTime"];
const eroDays = PRODUCT_REGISTRY.excessiveRain.days;
const expectedKeys = eroDays * ERO_SUFFIXES.length;
if (eroKeyCount !== expectedKeys) {
  throw new Error(`excessiveRain has ${eroKeyCount} keys, expected ${expectedKeys} (${eroDays} days x ${ERO_SUFFIXES.length} fields)`);
}
for (let d = 1; d <= eroDays; d++) for (const suffix of ERO_SUFFIXES) { /* ... */ }
```

### WR-09: `sigComparator` ignores both of its arguments and `extractPolygons` is called with a `toValue` that returns a string

**File:** `node_helper.js:636`, `:1053, 1074, 1094, 1114, 1134`
**Issue:**
```js
const sigComparator = { initial: false, comparator: (best, val) => true };
const day4SignPoly = this.extractPolygons(gj, label => label, (label, val) => label === "SIGN", ...);
```
`comparator` discards `best` and `val` entirely. It happens to produce the right answer
(`true` iff any SIGN polygon contains the point) only because `evaluatePolygons` invokes
the comparator solely inside the `booleanPointInPolygon` hit branch — an incidental
property of the caller, not a stated contract. Any future change to `evaluatePolygons`
that pre-seeds or short-circuits the accumulator silently makes every Day 4-8 `sign`
`true`.

Separately, `label => label` makes `item.value` a **string** for these polygon lists,
violating the numeric-`value` assumption baked into `computeProximity`
(`comparator.comparator(currentValue, value)`) and `_validTimeOfWinner`
(`item.value !== winningValue`). Nothing feeds SIGN lists to those helpers today, so this
is a trap rather than a live bug — but `extractPolygons` is now documented as the shared
helper "~25 call sites" and the next product row will reasonably assume `value` is a
number.

**Fix:**
```js
const sigComparator = { initial: false, comparator: (best, val) => best || val === 1 };
const day4SignPoly = this.extractPolygons(gj, (label) => (label === "SIGN" ? 1 : 0),
                                          (label, val) => val > 0, day4URL + " (SIGN)");
```
This keeps `value` numeric across every `extractPolygons` call site and makes the
comparator honour its own accumulator contract.

## Info

### IN-01: ERO tier colours reuse the SPC severe-thunderstorm palette with no cited source

**File:** `productRegistry.js:48-50`
**Issue:** `eroTierToColor` is a byte-for-byte copy of node_helper.js's severe-weather
`riskToColor` (minus `TSTM`/`ENH`). `riskToColor` carries a source citation
(`// https://www.spc.noaa.gov/new/css/SPCmain.css`); `eroTierToColor` carries only "matches
how node_helper.js riskToColor stores them", which justifies the *format*, not the
*values*. On a glanceable wall display, rendering a rainfall MDT in the same
`#eb7e82` as a tornado MDT invites tier confusion between two products with different
meanings and different official WPC palettes.
**Fix:** Source the hex values from WPC's own ERO legend (the layer's
`drawingInfo.renderer`, which the registry comment says was already inspected for the
`dn: 4` tier) and cite it in the comment as `riskToColor` does.

### IN-02: `excessiveRain.dayNValidTime` is computed, cached, documented and probe-asserted, but has no consumer

**File:** `node_helper.js:1252`; `MMM-SPCOutlook.js:227-235`
**Issue:** `dayNValidTime` is produced for all 5 days, threaded through the cache
(`result: { value, validTime }`), is the reason `_validTimeOfWinner` and the `feature`
field on `extractPolygons` results exist, and is asserted by three probe scenarios. No
render path reads it — `grep -rn "ValidTime" --include=*.js` finds only the producer, the
registry and the probe. A meaningful fraction of this phase's most delicate logic
(CR-01/WR-10) currently guards a field nobody displays.
**Fix:** Either render it (`Excessive Rain (Day 1): Slight — valid 12Z-12Z`) or drop the
field, `_validTimeOfWinner`, and `extractPolygons`'s `feature` retention until the phase
that needs it. If it is deliberately staged for a later phase, say so in the payload
docstring at node_helper.js:596-598 so the next reader does not treat it as dead weight.

### IN-03: CONVENTION — ERO text and colour reach `innerHTML` unescaped, deviating from the file's own stated rule

**File:** `MMM-SPCOutlook.js:230-232`
**Deviation:** The new ERO render block concatenates
`this.spcrisk.excessiveRain["day"+d+"Color"]` and `["day"+d+"Text"]` straight into
`wrapper.innerHTML +=` without `escapeHtml`.
**Convention violated:** The comment the same file states at lines 107-112: *"anything
concatenated into an innerHTML string is escaped first."* The MD render at line 166
follows it; the new block does not.
**Recommended fix:** These two values are currently safe — both are lookups into frozen-
in-practice registry tables keyed by a tier string bounded to `NONE|MRGL|SLGT|MDT|HIGH`
— so this is not exploitable today. But the safety is incidental to the render site, and
IN-04 notes the tables are exported mutable. Wrap them for consistency and to make the
rule locally checkable:
```js
wrapper.innerHTML += "Excessive Rain (Day " + d + "): <span style=\"color:#" +
  escapeHtml(this.spcrisk.excessiveRain["day" + d + "Color"]) + "\">" +
  escapeHtml(this.spcrisk.excessiveRain["day" + d + "Text"]) + "</span><br/>";
```
The pre-existing day1-8 and fireWeather blocks have the same deviation; fixing all of
them together is the cheaper option.

### IN-04: CONVENTION — `PRODUCT_REGISTRY` and its lookup tables are exported mutable; `buildArcGisQuery` has no external consumer

**File:** `productRegistry.js:36-83`
**Deviation:** `module.exports = { buildArcGisQuery, PRODUCT_REGISTRY }` exports a
deeply mutable object graph. `buildArcGisQuery` has no consumer outside this file
(verified by grep across the repo excluding `node_modules`); only `PRODUCT_REGISTRY` is
imported, by node_helper.js:26.
**Convention violated:** The file positions itself as a *descriptor table* — a
declarative constant. Every other constant map in the codebase is module-private.
**Recommended fix:** `Object.freeze` the registry and its tables so a downstream typo
cannot rewrite `tierToColor` (which feeds `innerHTML` per IN-03), and drop the unused
export until a consumer exists:
```js
module.exports = { PRODUCT_REGISTRY: Object.freeze(PRODUCT_REGISTRY) };
```
(freeze `eroValueToTier`/`eroTierToText`/`eroTierToColor`/`eroDayLayers` individually too —
`Object.freeze` is shallow). Keep `buildArcGisQuery` exported only if a probe or a
Phase 15-17 row is about to import it; otherwise it is an unused public surface.

### IN-05: CONVENTION — loose equality in the frontend versus strict equality everywhere else

**File:** `MMM-SPCOutlook.js:122-124, 139-145, 169, 180, 190, 229`
**Deviation:** The ERO no-risk gate (`day1Risk != "NONE"`, five occurrences) and the ERO
render gate (line 229) use `!=`, matching the pre-existing SPC gates.
**Convention violated:** `node_helper.js` and both probe files use `===`/`!==`
exclusively (`products?.[row.configFlag] === true`, `item.value !== winningValue`,
`out.excessiveRain[...] !== "NONE"`, etc.) — the codebase's dominant axis is strict
equality by a wide margin, and the new backend code introduced in this phase is 100%
strict.
**Recommended fix:** Use `!==` in the new ERO gates. Behaviour is identical for these
string comparisons, so this is a zero-risk consistency change; converting the
surrounding pre-existing gates is optional.

### IN-06: CONVENTION — two different idioms for the same day-indexed accumulation inside one function

**File:** `node_helper.js:990-1027` versus `:1175-1253`
**Deviation:** The fire-weather Day 3-8 block builds its results with a
placeholder-padded array and `push`
(`const dayFireRisks = [null, null, null]; ... dayFireRisks.push(dayRisk);` then six
manual index reads), while the ERO block ~150 lines below does the same job with a
keyed object seeded over the loop range (`eroTiers[d] = "NONE"`).
**Convention violated:** The ERO form is the one this phase introduced and is the one the
registry-driven design depends on (index alignment via `push` breaks the moment a `continue`
is added to the loop body — which the ERO loop does have, at line 1209). Two idioms for
one pattern in one function makes the next product row a coin flip.
**Recommended fix:** Convert the fire-weather block to the keyed-object form:
```js
const dayFireRisks = {};
for (let d = 3; d <= 8; d++) { dayFireRisks[d] = 0; }
for (let d = 3; d <= 8; d++) { /* ... */ dayFireRisks[d] = dayRisk; }
day3FireRisk = dayFireRisks[3]; /* ... */
```
This also removes the `// placeholders for index alignment (0,1,2 unused)` comment, which
exists only to explain the idiom.

---

_Reviewed: 2026-08-20_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
