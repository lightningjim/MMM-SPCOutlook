---
phase: 14-foundation-wpc-excessive-rainfall-outlook
reviewed: 2026-08-23T00:00:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - MMM-SPCOutlook.js
  - node_helper.js
  - productRegistry.js
  - scripts/probe-lib/module-stubs.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 3
  warning: 11
  info: 8
  total: 22
status: issues_found
verification:
  note: >-
    Classification of every finding from review round 2 (git 666e999) against the
    current tree. IDs below are ROUND-2 ids. This report renumbers from scratch;
    each new finding names its round-2 ancestor in its heading.
  round2:
    CR-01:
      title: _geoJsonCache keyed by URL while storing location-resolved risk
      status: STILL-OPEN
      disposition: DEFERRED-BY-OWNER — not re-reported as Critical
      evidence: >-
        Code unchanged (node_helper.js:37, 386, 522, 608-621, 1222-1228). Independently
        confirmed NOT reachable in a single-instance / single-location deployment: see
        "Deferral audit" below. A different, temporal single-instance corruption route
        exists and is reported as CR-03.
    CR-02:
      title: SPC_DATA_RESULT broadcast with no instance correlation
      status: STILL-OPEN
      disposition: DEFERRED-BY-OWNER — not re-reported as Critical
      evidence: >-
        Code unchanged (node_helper.js:111; MMM-SPCOutlook.js:36-44). Not reachable via
        multi-instance in this deployment. The same unconditional accept IS reachable
        single-instance via overlapping polls — reported as CR-03.
    WR-01:
      title: ERO _isFeatureCollection branch + WR-06 stale fallback unreachable in production
      status: STILL-OPEN
      evidence: >-
        Only two data-bearing returns in fetchGeoJsonCached (node_helper.js:477, :489),
        both preceded by an _isFeatureCollection gate (:476, :488). Branch at :1196-1211
        is therefore dead. Confirmed by grep of all 12 `return { data` sites. Reported as WR-01.
    WR-02:
      title: ero-hard-fail-is-flagged is vacuous
      status: STILL-OPEN
      evidence: >-
        MUTATION-PROVEN. Deleting node_helper.js:1187 (`if (fetchResult.stale ||
        fetchResult.failed) anyStale = true;`) leaves the suite at 8 passed, 0 failed.
        Disabling the ERO loop entirely also leaves this scenario passing. Reported as WR-02.
    WR-03:
      title: _staleAsOf stamped at response time, badge always reads "a few seconds ago"
      status: STILL-OPEN
      evidence: >-
        Code unchanged at node_helper.js:1256. Measured against the real getSpcOutlook
        with every layer hard-failing — `Date.now() - payload._staleAsOf` = 1 ms.
        Reported as WR-04.
    WR-04:
      title: updateInterval accepted from config with no validation
      status: STILL-OPEN
      evidence: node_helper.js:66-74 still only tests `=== undefined`. Reported as WR-05.
    WR-05:
      title: getMesoscaleDiscussion fetches KML-harvested URLs with no host allowlist
      status: STILL-OPEN
      evidence: node_helper.js:134-139, 334-351 unchanged. Reported as WR-06.
    WR-06:
      title: MDArray.push(MDgj.features[0].properties.name) unguarded and reads the wrong feature
      status: STILL-OPEN
      disposition: ESCALATED to BLOCKER
      evidence: >-
        node_helper.js:346 unchanged; checkInPolygon (:1367-1383) still has no
        Array.isArray(geojson.features) guard and no per-element null guard. The
        combination with the phase's new try/catch at :97-102 makes ONE failing MD
        URL discard ALL active MDs. Reported as CR-02.
    WR-07:
      title: _validTimeOfWinner aborts the scan instead of continuing; first guard is dead code
      status: STILL-OPEN
      evidence: >-
        node_helper.js:237-247 unchanged. Both terminal statements confirmed. First guard
        confirmed unreachable — extractPolygons (:193) already drops non-object/null
        properties. Reported as WR-07.
    WR-08:
      title: assertPayloadIntact hardcodes ERO day/key counts
      status: STILL-OPEN
      evidence: probe-payload-resilience.js:174, 186, 198, 201, 210 unchanged. Reported as WR-10.
    WR-09:
      title: sigComparator ignores both arguments; extractPolygons toValue returns a string
      status: STILL-OPEN
      evidence: node_helper.js:636, 1054, 1074, 1094, 1114, 1134 unchanged. Reported as WR-11.
    IN-01:
      title: ERO palette copied from the SPC severe palette with no cited source
      status: STILL-OPEN
      evidence: productRegistry.js:48-50 unchanged. Reported as IN-01.
    IN-02:
      title: dayNValidTime has no consumer
      status: STILL-OPEN
      evidence: >-
        CONFIRMED by `grep -rn "ValidTime|validTime" --include=*.js` excluding node_modules —
        only the producer (node_helper.js), the registry field name, and the probe match.
        No render path in MMM-SPCOutlook.js reads it. Reported as IN-02.
    IN-03:
      title: ERO text/colour reach innerHTML unescaped
      status: STILL-OPEN
      disposition: REFINED — verified NOT exploitable, remains CONVENTION
      evidence: >-
        Traced every remote-origin string that reaches innerHTML. All are bounded by a
        table lookup or by extractPolygons' includesFeat filter (including
        proximityBadge's nextTier, which survives only if riskToValue[label] or
        cigToTier[label] is > 0). No verbatim remote text reaches innerHTML. Reported as IN-03.
    IN-04:
      title: PRODUCT_REGISTRY exported mutable; buildArcGisQuery has no external consumer
      status: STILL-OPEN
      evidence: >-
        productRegistry.js:83 unchanged. grep confirms only PRODUCT_REGISTRY is imported
        (node_helper.js:26, probe:13); buildArcGisQuery has zero external callers. Reported as IN-04.
    IN-05:
      title: loose equality in the frontend versus strict everywhere else
      status: STILL-OPEN
      evidence: MMM-SPCOutlook.js:122-124, 140-144, 169, 180, 190, 229 unchanged. Reported as IN-05.
    IN-06:
      title: two idioms for day-indexed accumulation in one function
      status: STILL-OPEN
      evidence: node_helper.js:990-1027 vs :1175-1253 unchanged. Reported as IN-06.
  probe_suite:
    scenarios_total: 8
    load_bearing: 5
    vacuous: 2
    tests_a_fabricated_path: 1
---

# Phase 14: Code Review Report

**Reviewed:** 2026-08-23
**Depth:** deep
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Third pass. Every round-2 finding was re-derived from the current source rather than
taken on trust; all 17 are **STILL-OPEN** (see the `verification` block above for the
per-ID evidence). Nothing has regressed and nothing has been fixed since 666e999.

Three things changed in this pass:

1. **A new BLOCKER that both prior rounds missed, and it is the biggest one in the
   file.** The entire CR-03 "a degrade must never look like an all-clear" investment —
   `failed: true`, `anyStale`, `_stale`, the ⚠ badge — is discarded by the frontend in
   exactly the situation it exists for. When every layer fails, every value is `"NONE"`,
   so `getDom` takes the `"No Severe Weather Risk"` branch at MMM-SPCOutlook.js:147 —
   and the stale badge is rendered at :151, *inside the else*. I proved this end-to-end
   against the real `getSpcOutlook`: `_stale: true` in the payload, `"No Severe Weather
   Risk"` on the screen, no badge. A total NOAA/DNS/Wi-Fi outage renders as a confident
   all-clear. This is the project's stated core value failing in its headline case.

2. **Round-2 WR-06 is escalated to BLOCKER.** One MD URL that 404s — routine, because
   MD KMZ links harvested from `ActiveMD.kmz` expire between the index fetch and the
   member fetch — throws out of `fetchBinBuffer`, out of the loop, into the phase's new
   `try/catch` at node_helper.js:97-102, and discards *every* active MD. Not one MD:
   all of them. A silent under-report of active severe-weather discussions during an
   outbreak is precisely the false-negative class this project exists to prevent.

3. **The deferral audit came back mixed.** Round-2 CR-01 (URL-keyed cache) and CR-02
   (uncorrelated broadcast) are genuinely unreachable in a single-instance,
   single-location deployment — the deferral is sound *as stated*. But CR-02's
   unconditional `this.spcrisk = payload[0]` has a second, temporal route that needs no
   second instance and no location change: overlapping polls. Details and the exact
   interleaving are in CR-03 and in the deferral audit below.

Probe suite: all 8 scenarios pass, and I consider **5 of 8 load-bearing**. Round 2
identified two non-load-bearing scenarios; mutation testing found a third
(`ero-malformed-feature`) it missed. Scores and the mutations that establish them are in
WR-02, WR-03 and WR-09.

Several findings are pre-existing rather than introduced by phase 14. They are in scope
because the files are in scope, because the phase's own comments claim to have addressed
them, and because the new product multiplies their blast radius.

---

## Deferral audit — is round-2 CR-01/CR-02 reachable single-instance?

**Asked:** can one module instance at one fixed location reach the cross-location cache
hit (r2 CR-01) or the cross-instance payload overwrite (r2 CR-02) by any other route,
in particular overlapping poll cycles?

**r2 CR-01 (URL-keyed cache serving another location's answer): NOT REACHABLE. Deferral
is sound.**

`_cachedLat`/`_cachedLon` are written once, on the first `getSpcOutlook` call
(node_helper.js:608-621), and `this.config.lat/lon` are static for the process lifetime.
With overlapping chains the interleaving is:

- Chain A and chain B both call `getSpcOutlook(lat, lon, ...)` with *identical* lat/lon.
- Whichever runs first sets `_cachedLat`; the other sees `locationChanged === false`.
- Every `_geoJsonCache` entry either chain writes is a point-in-polygon answer for that
  same single location.

There is no interleaving that puts location X's answer under a key chain-Y reads for
location Y, because there is only one location. `_updateInterval`, `_proximityWeighting`
and `_products` are likewise written with identical values by both chains.

**r2 CR-02 (uncorrelated broadcast): the multi-instance route is NOT REACHABLE, but the
unconditional accept has a single-instance temporal route that IS.** See CR-03 — it is a
different mechanism (last-writer-wins across time, not across instances), so it is
reported as a new finding rather than as a re-report of the deferred one.

---

## Critical Issues

### CR-01: the ⚠ Stale flag is discarded exactly when every layer has failed — a total outage renders as a confident "No Severe Weather Risk"

**File:** `MMM-SPCOutlook.js:121-147` (gate), `:151-163` (badge, inside the unreachable
branch); `node_helper.js:1256`
**Round-2 ancestor:** none — new in this pass.

**Issue:**
`getDom` is an if/else-if chain. The "no risk" short-circuit at :121-146 tests risk
values only; the stale badge is rendered at :151, inside the *final* `else`:

```js
} else if (
  this.spcrisk.day1.risk == "NONE" && ... &&                // no _stale term anywhere
  !(this.config.showExcessiveRain && this.spcrisk.excessiveRain && (...))
) {
  wrapper.innerHTML = "No Severe Weather Risk"              // <- badge never reached
} else {
  ...
  if (this.spcrisk._stale) { /* ⚠ Stale badge */ }          // <- only here
}
```

When a fetch failure zeroes a layer, that layer's value becomes `"NONE"` — the *same*
value a genuine all-clear produces. So the branch that renders the degrade signal is
unreachable precisely in the total-failure case, which is the single most likely
production failure and the exact scenario the whole `failed`/`anyStale`/`_stale` chain
(node_helper.js:405-407, 431-432, 452, 702, 1187, 1256) was built for.

Proven end-to-end against the real `getSpcOutlook` with every fetch returning the
hard-failure shape:

```
payload._stale        = true
payload._staleAsOf age(ms) = 1
no-risk branch taken  = true
rendered              = "No Severe Weather Risk"   (NO stale badge)
```

A Wi-Fi drop, a DNS hiccup, an SPC/WPC outage, or a captive-portal redirect during an
active tornado outbreak all render as a confident all-clear with no visible difference
from a quiet day. `ero-hard-fail-is-flagged` asserts `out._stale === true` on the
*payload* and stops there, so the suite reports the guarantee as met while the user-facing
half of it is broken. Nothing tests the frontend.

**Fix:** make staleness disqualify the short-circuit, so a degraded payload always takes
the detail branch and always renders the badge:

```js
// MMM-SPCOutlook.js — add as the first term of the no-risk gate
} else if (
  !this.spcrisk._stale &&                    // a degraded read is never an all-clear
  this.spcrisk.day1.risk == "NONE" &&
  ...
```

Then extend the detail branch so a stale-and-otherwise-empty payload still says
something useful, e.g. `⚠ Stale — <age>` followed by `No Severe Weather Risk (last known
good)`. Add a frontend-level probe scenario for the gate; today the suite has zero
coverage of `getDom`.

### CR-02: one expired or unreachable MD URL discards every active Mesoscale Discussion

**File:** `node_helper.js:334-351` (loop), `:346` (the dereference), `:97-102` (the
swallowing catch), `:1367-1383` (`checkInPolygon`)
**Round-2 ancestor:** WR-06, escalated.

**Issue:**
The per-MD loop has no per-iteration containment:

```js
for(const MDURL of MDURLs){
  const MDKMZ = await this.fetchBinBuffer(MDURL);                       // throws on any non-2xx
  const MDKML = this.extractKmlFromKmz(MDKMZ, this.kmzToKmlfilename(MDURL)); // throws: 'KMZ downloaded has no KML'
  const MDgj  = this.kmlToGeoJson(MDKML);
  const MDApplies = this.checkInPolygon(MDgj, lat, lon);                // throws on a features-less body
  if(MDApplies) MDArray.push(MDgj.features[0].properties.name);         // throws; also the WRONG feature
}
```

Any throw from any iteration escapes the whole function and lands in the try/catch this
phase added at :97-102, which sets `md = false` — *"no active MDs"*. So one bad MD
suppresses all of them, including the ones that do cover the user.

This is not a rare path. `ActiveMD.kmz` is an index; each entry is fetched separately,
seconds to minutes later. An MD that expires in that window returns 404 →
`fetchBinBuffer` throws `Failed to fetch <url>: 404` → every other active MD is
discarded. A single transient socket error or 15 s `AbortError` on any one of N serial
MD fetches has the identical effect. During an outbreak — when N is largest and MDs
churn fastest — the failure is most likely and most costly.

Three further defects in the same line and its callee:

1. **Wrong feature.** `checkInPolygon` returns `true` if *any* feature contains the
   point, but the name is read off `features[0]` unconditionally. This is verbatim the
   `features[0]` anti-pattern the ERO work rejected and replaced with
   `_validTimeOfWinner` (:237-247) — the fix was applied to the new product and not to
   the existing one.
2. **Unguarded dereference.** `features[0]` and `.properties` and `.name` are all
   unchecked. A missing `name` pushes `undefined`, which the frontend renders as
   `"undefined in effect."` (MMM-SPCOutlook.js:166).
3. **`checkInPolygon` has no input guard.** `:1369` iterates `geojson.features` with no
   `Array.isArray` check, and `:1370` guards `feature.geometry` but not `feature`
   itself, so a null element throws.

**Fix:** contain per MD, and return the containing feature rather than `features[0]`:

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

// getMesoscaleDiscussion
for (const MDURL of MDURLs) {
  try {
    const MDKMZ = await this.fetchBinBuffer(MDURL);
    const MDKML = this.extractKmlFromKmz(MDKMZ, this.kmzToKmlfilename(MDURL));
    const hit   = this.checkInPolygon(this.kmlToGeoJson(MDKML), lat, lon);
    const name  = hit && hit.properties && hit.properties.name;
    if (name) MDArray.push(name);
  } catch (err) {
    Log.error("MMM-SPCOutlook: skipping unreadable MD " + MDURL, err);   // one MD, not all of them
  }
}
```

Note `checkInPolygon`'s return type changes from `boolean` to `Feature|null`; it has one
caller (:345), so the change is contained.

### CR-03: no in-flight guard plus an unconditional payload accept lets a slow poll overwrite a newer, higher risk — single instance, single location

**File:** `node_helper.js:63-113` (no guard; the `withTimeout` comment at :3-8 states the
absence), `:111` (broadcast); `MMM-SPCOutlook.js:33` (interval), `:36-44` (unconditional accept)
**Round-2 ancestor:** shares CR-02's sink, different mechanism. This is the single-instance
route the deferral audit was asked to find.

**Issue:**
`socketNotificationReceived` is `async`, MagicMirror does not await it, and nothing
prevents a second `GET_SPC_DATA` from starting while the first chain is still running —
the file's own comment at :3-8 says so. The frontend accepts every result
unconditionally:

```js
this.spcrisk = payload[0];   // MMM-SPCOutlook.js:40 — last writer wins, regardless of age
```

Concrete interleaving, one instance, one location, `updateInterval: 5`:

| time  | event |
|-------|-------|
| 15:58 | Chain A starts. Several layers hit slow sockets (15 s `AbortSignal.timeout` each, ~25 serial hops). A reads `day1otlk_cat` and gets **SLGT**. |
| 16:00 | SPC upgrades the categorical outlook to **MDT**. |
| 16:03 | Chain B starts, network healthy, reads `day1otlk_cat` and gets **MDT**. B finishes, `SPC_DATA_RESULT` → display shows **MDT**. Correct. |
| 16:08 | Chain A finally finishes and emits its **SLGT** payload. `this.spcrisk = payload[0]` overwrites B's. Display **downgrades to SLGT** and stays there until at least 16:13. |

A's payload is not marked `_stale` — every one of its fetches succeeded, just earlier —
so there is no badge and no way for the operator to tell. This is a silent downgrade of
an active severe-weather risk, which is the exact false-negative class the project's
stated core value forbids.

Reachability: requires chain wall-time > `updateInterval`. Worst-case chain wall-time is
roughly (20-26 product fetches + 1 MD index + N MD fetches) x 15 s, so ~7 min with no
MDs and ~12+ min during an outbreak with 20 active MDs. At the default
`updateInterval: 60` this is out of reach; at any value at or below ~10 minutes — a
plausible setting for a severe-weather display, and the reason `updateInterval` is
configurable at all — it is reachable on a degraded network. **Combined with WR-05
(`updateInterval` is unvalidated), `updateInterval: 0` or a string typo makes the
frontend interval clamp to ~1 ms and the overlap becomes continuous and guaranteed.**

**Fix:** the in-flight guard the `withTimeout` comment already identifies as missing,
plus a monotonic sequence so a late payload can never overwrite a newer one:

```js
// node_helper.js — socketNotificationReceived, wrapping the existing body
if (this._inFlight) {
  Log.info("MMM-SPCOutlook: poll already in flight, skipping this tick");
  return;
}
this._inFlight = true;
try {
  /* existing body */
  this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md, ++this._seq]);
} finally {
  this._inFlight = false;
}
```

```js
// MMM-SPCOutlook.js — socketNotificationReceived
const seq = payload[2];
if (typeof seq === "number" && seq <= (this._lastSeq ?? -1)) return;   // a late chain never wins
this._lastSeq = seq;
this.spcrisk = payload[0];
this.mds = payload[1];
this.updateDom();
```

Initialise `this._inFlight = false; this._seq = 0;` in `start()` (which
`resetHelper` delegates to, so the probe picks the fields up for free —
module-stubs.js:130-132).

---

## Warnings

### WR-01: the ERO loop's `_isFeatureCollection` branch and its stale fallback are dead code, and the probe's headline scenario exists only to keep them alive

**File:** `node_helper.js:1196-1211`; `scripts/probe-payload-resilience.js:290-338`
**Round-2 ancestor:** WR-01 — **STILL-OPEN**, independently re-derived.

**Issue:**
`fetchGeoJsonCached` has twelve `return { data ... }` sites. Exactly two carry a non-null
`data` — :477 and :489 — and each is immediately preceded by
`if (!this._isFeatureCollection(parsed.value)) return rejectBody(...)` (:476, :488). All
ten others set `data: null`. Therefore `fetchResult.data !== null` at :1195 *implies*
`_isFeatureCollection(fetchResult.data)`, and the whole block at :1196-1211 — the
`Log.error`, `anyStale = true`, the last-known-good lookup, the `continue` — cannot
execute in production.

Consequences:

1. The stated WR-06 guarantee ("a WPC hiccup during an active HIGH must not blank the
   display") is **not** delivered by this branch. It is delivered by `rejectBody`
   (:446-453), which independently falls back to `entry.result`. The dead branch is a
   second, *divergent* implementation of the same policy: `rejectBody` requires
   `entry.result !== null && !== undefined`; the ERO copy requires `cached.result` to be
   truthy — so a legitimately cached `{ value: 0 }`… would be rejected by one and
   accepted by the other. Two policies, one of which never runs.
2. `ero-arcgis-error-body` reaches the branch only because `installFetch` replaces
   `fetchGeoJsonCached` wholesale and hands back `{ data: ARCGIS_ERROR_BODY, ... }` — a
   shape the real function cannot emit.
3. Its assertion is therefore **wrong about production**. In production the same
   ArcGIS error body produces `MMM-SPCOutlook: rejected an unusable response body for
   <url> (not a usable FeatureCollection); not caching` (:447), which does not contain
   `"excessiveRain day 1"`. The probe's
   `requireLog(['excessiveRain day 1', 'not a usable FeatureCollection'])` (:331-334)
   would fail against the real path it claims to cover. The test now *pins the dead code
   in place* — deleting :1196-1211 makes the suite go red for the wrong reason.

**Fix:** delete the redundant branch, rely on the single `rejectBody` policy:

```js
// node_helper.js — ERO loop
if (fetchResult.data === null && fetchResult.cachedResult !== null) {
  eroValue     = fetchResult.cachedResult.value;
  eroValidTime = fetchResult.cachedResult.validTime;
} else if (fetchResult.data !== null) {
  // fetchGeoJsonCached already validated the shape (node_helper.js:476, :488)
  const polys = this.extractPolygons(fetchResult.data, ero.toValue, ero.includesFeat, url);
  ...
}
```

Then move the probe's seam one layer down (see WR-09) so `ero-arcgis-error-body`
exercises the real `fetchGeoJsonCached` and asserts the `rejected an unusable response
body for <ERO url>` line production actually emits.

### WR-02: `ero-hard-fail-is-flagged` is vacuous — mutation-proven

**File:** `scripts/probe-payload-resilience.js:418-440`
**Round-2 ancestor:** WR-02 — **STILL-OPEN**, now with a mutation proof.

**Issue:**
`installFetch(helper, [])` routes *every* URL to the hard-failure shape, so every SPC
categorical, hazard, CIG and fire-weather layer sets `anyStale = true` (:702, :766, :829,
…) long before the ERO loop runs. The closing assertion `out._stale !== true` says
nothing about ERO.

Proven by mutation. Replacing node_helper.js:1187 with a comment:

```
$ sed -i '1187s/.*/  \/\/ MUTATED: ERO anyStale removed/' node_helper.js
$ node scripts/probe-payload-resilience.js
... PASS ero-hard-fail-is-flagged ...
PROBE RESULT: 8 passed, 0 failed
```

Disabling the ERO loop entirely (`if (false)` at :1182) also leaves it green. The
scenario cannot fail for any ERO reason.

**Fix:** make every non-ERO layer succeed so `anyStale` can only originate in the ERO
loop, and add the negative control that makes the assertion non-vacuous:

```js
name: "ero-hard-fail-is-flagged",
run: async (helper) => {
  resetHelper(helper); resetLogs();
  installFetch(helper, [[".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]]);
  const on  = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
  assertPayloadIntact(on);
  if (on._stale !== true) throw new Error("a hard-failed ERO fetch produced an unflagged no-risk payload");

  resetHelper(helper); resetLogs();                       // negative control
  installFetch(helper, [[".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]]);
  const off = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: false });
  if (off._stale) throw new Error("staleness came from a non-ERO layer — the ERO assertion is vacuous");
}
```

### WR-03: `ero-malformed-feature` is also vacuous — its fixture never reaches the guard it claims to test

**File:** `scripts/probe-payload-resilience.js:28-31` (fixture), `:367-387` (scenario)
**Round-2 ancestor:** none — new in this pass.

**Issue:**
`MALFORMED_FEATURE_BODY` carries `{ properties: null, geometry: null }`. The scenario
claims to prove the per-feature `properties` guard at node_helper.js:193 works. It
cannot, because the same line's `!f.geometry` clause drops the feature first — the
`properties` check is never the reason for the rejection.

Two mutations, each of which should fail this scenario, both leave it green:

```
# 1. delete the properties half of the guard (node_helper.js:193)
   `if (!f || typeof f.properties !== "object" || f.properties === null || !f.geometry) return;`
   -> `if (!f || !f.geometry) return;`
   => PASS ero-malformed-feature       (only ero-leading-bad-feature-preserves-risk fails)

# 2. disable the whole ERO loop (`if (false)` at node_helper.js:1182)
   => PASS ero-malformed-feature
```

All three of its assertions are negative (`day1Risk === "NONE"`, two `forbidLog`s), and
all three are satisfied by the ERO product not existing. The guard it names is in fact
covered — but by `ero-leading-bad-feature-preserves-risk`, whose fixture has a real
geometry and no `properties`.

**Fix:** give the fixture a geometry so `properties: null` is the only thing wrong with it:

```js
const MALFORMED_FEATURE_BODY = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: null,
               geometry: { type: "Polygon", coordinates: [SAMPLE_RING] } }]
};
```

and set `turfStub.pointInPolygon = () => true` for the scenario so the feature would be
inside the user's location if it survived. Re-run mutation 1 above and confirm the
scenario now goes red.

### WR-04: the "⚠ Stale" badge always reads "a few seconds ago"

**File:** `node_helper.js:1256`; `MMM-SPCOutlook.js:151-163`
**Round-2 ancestor:** WR-03 — **STILL-OPEN**, now measured.

**Issue:**
`...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {})` records when the payload
was *assembled*, not how old the data in it is. Measured against the real
`getSpcOutlook` with every layer hard-failing: `Date.now() - payload._staleAsOf` = **1
ms**. `moment(asOf).fromNow()` therefore renders `a few seconds ago` on every stale
render, whether the underlying reading is 2 minutes or 59 minutes old — or, on a hard
failure, does not exist at all.

The `delta < 0` "just now" branch (MMM-SPCOutlook.js:156-157) is unreachable: helper and
renderer share one process clock in MagicMirror, and `asOf` is always in the past.

A freshness indicator that always reports maximum freshness while flagging staleness is
worse than none — the operator cannot distinguish a momentary blip from a layer that has
been dark all hour.

**Fix:** report the oldest cached timestamp that contributed to the payload:

```js
// alongside `let anyStale = false;`
let oldestStaleAt = null;
const noteStale = (url) => {                       // call wherever a stale/cached result is accepted
  const e = this._geoJsonCache.get(url);
  if (e && (oldestStaleAt === null || e.timestamp < oldestStaleAt)) oldestStaleAt = e.timestamp;
};
// return literal
...(anyStale ? { _stale: true, _staleAsOf: oldestStaleAt } : {}),
```

`oldestStaleAt` stays `null` on a hard failure with no cache entry, which the frontend's
existing `typeof asOf === "number"` guard already handles by omitting the suffix. Then
delete the unreachable `delta < 0` branch.

### WR-05: `updateInterval` is accepted from config unvalidated — `0`, a negative, or a non-number disables the stale window and turns the poll into a request storm

**File:** `node_helper.js:66-74, 375-378`; `MMM-SPCOutlook.js:33`
**Round-2 ancestor:** WR-04 — **STILL-OPEN**.

**Issue:**
The only check is `updateInterval === undefined`; everything else is stored verbatim.

- `updateInterval: 0` → `_isWithinStaleWindow` computes `intervalMs = 0`, so
  `(Date.now() - timestamp) < 0` is always false and **no stale fallback ever fires** —
  every transient blip becomes a hard failure and (via CR-01) a confident `"NONE"`.
- `updateInterval: "hourly"` → `NaN`; `x < NaN` is always false — same silent disablement.
  Note `updateInterval: null` slips past both ends differently: the backend's
  `intervalMinutes ?? 60` rescues it, the frontend's `null * 60000` does not.
- On the frontend, `setInterval(..., this.config.updateInterval * 60000)` with `NaN`,
  `0` or a negative is clamped by the host to ~1 ms — an unbounded poll loop against
  `www.spc.noaa.gov` and `mapservices.weather.noaa.gov`, which the phase's five new ERO
  fetches per cycle make ~20% heavier. It is also what makes **CR-03 continuous rather
  than occasional**.

**Fix:** validate and clamp at both ends.

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

### WR-06: `getMesoscaleDiscussion` fetches URLs harvested from a remote KML with no host allowlist

**File:** `node_helper.js:334-351`; `parseNetworkLinks` at `:134-139`; `fetchBinBuffer` at `:115-119`
**Round-2 ancestor:** WR-05 — **STILL-OPEN**.

**Issue:**
`parseNetworkLinks` extracts every `//k:NetworkLink/k:Link/k:href/text()` value from the
downloaded `ActiveMD.kmz` and `fetchBinBuffer` fetches each with no scheme, host or
redirect validation (node-fetch follows redirects by default). Anyone able to influence
that KML — an upstream compromise, a transparent proxy, a hostile DNS answer, a captive
portal — makes the MagicMirror host issue arbitrary outbound requests, including to
RFC1918 addresses, which from a home-network Pi is the interesting target.

This contradicts the convention the same phase established one file over:
`buildArcGisQuery` (productRegistry.js:28-30) refuses any `baseUrl` that is not
`https://mapservices.weather.noaa.gov/`. The new product is allowlisted; the older path
that feeds the same render is not.

Also note `parseNetworkLinks` does `n.nodeValue.trim()` with no null guard, and
`kmzToKmlfilename` (:121-125) derives the archive member name by
`lastSegment.slice(0,-1)+"l"` — a href with a query string or a trailing slash yields a
name that is not in the archive, and `extractKmlFromKmz` throws `KMZ downloaded has no
KML`. Both feed CR-02's all-or-nothing loss.

**Fix:** apply the registry's allowlist idiom to the MD path.

```js
const MD_HOST_PREFIX = "https://www.spc.noaa.gov/";
const MDURLs = this.parseNetworkLinks(ActiveKML).filter((u) => {
  if (typeof u === "string" && u.startsWith(MD_HOST_PREFIX)) return true;
  Log.error("MMM-SPCOutlook: refusing off-host NetworkLink href " + JSON.stringify(u));
  return false;
});
```

and pass `{ redirect: "error" }` through `withTimeout()` in `fetchBinBuffer` so a 302
cannot escape the allowlist.

### WR-07: `_validTimeOfWinner` aborts the scan on the first winning polygon that lacks the field instead of trying the next; its first guard is dead code

**File:** `node_helper.js:237-247`
**Round-2 ancestor:** WR-07 — **STILL-OPEN**.

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
and the payload reports `null`. That is exactly the `features[0]`-ordering dependence the
function's own docstring (`:233-235`) says it exists to eliminate.

The first branch is additionally **unreachable**: `extractPolygons` (:193) already drops
any feature whose `properties` is not a non-null object, so every element of `items` has
object properties. Its `return null` reads as a real guard and is dead.

**Impact today is latent, not user-visible** — IN-02 confirms `dayNValidTime` has no
consumer (verified by grep across the repo). It matters for phase 18 / MERGE-01, which
is specified to attribute hazards to days by UTC valid-time-window overlap and would
consume exactly this field. Fix it before a consumer exists, not after.

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
the current code returns `null`, the fixed code returns the second window.

### WR-08: `extractPolygons` has no per-feature containment around `turf.polygon` — one malformed ring in any SPC layer collapses the whole payload to `{ error }`

**File:** `node_helper.js:192-203`, escaping to the shared catch at `:1361-1364`
**Round-2 ancestor:** none — new in this pass.

**Issue:**
The per-feature guard at :193 checks `properties` and the *presence* of `geometry`, then
hands the coordinates straight to turf:

```js
if (f.geometry.type === "Polygon") { poly = turf.polygon(f.geometry.coordinates); }
else if (f.geometry.type === "MultiPolygon") { poly = turf.multiPolygon(f.geometry.coordinates); }
```

`turf.polygon` throws on a ring with fewer than four positions, on a ring whose first and
last positions differ, and on non-array coordinates. `_isFeatureCollection` validates
only that `features` is an array — it never inspects geometry. So an HTTP 200 that parses
as JSON and has a `features` array but carries one truncated ring (a partial write at the
origin, a truncated proxy response, a corrupted CDN object) throws out of
`extractPolygons`, past every per-layer guard, into `getSpcOutlook`'s shared catch, and
the whole payload becomes `{ error }`. Days 1-8, fire weather and the ERO all disappear
together.

This is the containment gap the phase closed for the ERO (its per-day `try/catch` at
:1184/:1237) and did not close for the ~25 pre-existing call sites that share this
helper. Because the frontend renders `Error: <text>` (MMM-SPCOutlook.js:120) the user
does see *something*, which is why this is a WARNING and not a BLOCKER — but the display
loses all risk information over one bad ring in one layer.

**Fix:** contain at the feature level, where the phase's own doc comment already promises
it ("silently skips individual features lacking `properties` or `geometry`"):

```js
let poly;
try {
  if (f.geometry.type === "Polygon") poly = turf.polygon(f.geometry.coordinates);
  else if (f.geometry.type === "MultiPolygon") poly = turf.multiPolygon(f.geometry.coordinates);
  else return;
} catch (err) {
  Log.error("MMM-SPCOutlook extractPolygons: skipping a feature with unusable geometry in " + context, err);
  return;
}
```

Note this makes the layer degrade to a partial answer, so pair it with an `anyStale`
signal for that layer — a dropped polygon is a potential false negative, not a clean read.

### WR-09: the probe stubs `fetchGeoJsonCached` wholesale and never warms the cache, so the phase's actual resilience code has zero coverage — and the harness comment says the opposite

**File:** `scripts/probe-payload-resilience.js:100-101` (the false comment), `:147-161`
(`installFetch`); `scripts/probe-lib/module-stubs.js:130-132` (`resetHelper`)
**Round-2 ancestor:** none — new in this pass; generalises round-2 WR-01 point 2.

**Issue:**

1. **The seam is too high.** All 8 scenarios replace `helper.fetchGeoJsonCached`
   entirely. Everything inside it — the 304-with-no-entry guard (WR-14, :415-418),
   `rejectBody`'s stale fallback (CR-02, :446-453), `parseBody`'s contained
   `JSON.parse` (:458-464), the ETag/hash mode split, `_isWithinStaleWindow` — is
   **never executed by any scenario**. Those are the phase's headline fixes.
2. **The cache is never warm.** The comment at :100-101 claims *"Fixed for every
   scenario so getSpcOutlook's location-change cache invalidation never fires
   mid-suite."* That is false: `resetHelper` delegates to `helper.start()`
   (module-stubs.js:131), which sets `_cachedLat = null`, so `locationChanged` is **true
   in every scenario** — confirmed in captured logs
   (`"MMM-SPCOutlook: location changed — cache results invalidated"` is the only line
   present when the ERO loop is disabled). Consequently the `data === null &&
   cachedResult !== null` branch (node_helper.js:1192-1194) and every stale-fallback path
   are untested.
3. Together these are why WR-01's dead branch survived two review rounds with a green
   suite: the only code path the probe can reach is the one the real function cannot
   produce.

**Fix:** stub one layer lower — the HTTP response, not the function that interprets it —
and add a warm-cache scenario:

```js
// replace global fetch (node_helper.js:2) rather than helper.fetchGeoJsonCached
function httpStub(routes) {  // returns { ok, status, text(), headers: { get() } }
  ...
}

// new scenario: warm cache, then a rejected body must serve last-known-good and flag stale
name: "ero-rejected-body-serves-last-known-good",
run: async (helper) => {
  resetHelper(helper);
  await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true }); // warm: SLGT
  installHttp(helper, [[ERO_URLS[1], ok200(ARCGIS_ERROR_BODY)]]);
  const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
  if (out.excessiveRain.day1Risk !== "SLGT") throw new Error("a WPC hiccup blanked an active tier");
  if (out._stale !== true) throw new Error("last-known-good was served without the stale flag");
  requireLog(["rejected an unusable response body for", ERO_URLS[1]], "the degrade was not diagnosable");
}
```

Also correct the comment at :100-101, or make it true by having `resetHelper` restore
`_cachedLat`/`_cachedLon` after `start()`.

### WR-10: `assertPayloadIntact` hardcodes the ERO day count and key count the registry is supposed to own

**File:** `scripts/probe-payload-resilience.js:167-217` (lines 174, 186, 198, 201, 210)
**Round-2 ancestor:** WR-08 — **STILL-OPEN**.

**Issue:**
The file header claims *"Future product rows add one scenario object here — the loader
and contract assertion are product-agnostic."* The assertion is not product-agnostic: it
hardcodes `d <= 5`, `eroKeyCount !== 20`, `d <= 8`, and the literal suffix list
`["Risk","Text","Color","ValidTime"]`.

Meanwhile node_helper.js:1173-1253 goes out of its way to derive all of those from
`ero.days` (*"no literal day count survives outside the registry"*). Changing
`PRODUCT_REGISTRY.excessiveRain.days` from 5 to 7 — the single declared knob — makes the
probe fail with `excessiveRain has 28 keys, expected 20`, a message that points at the
payload rather than at the probe.

**Fix:**

```js
const ERO_SUFFIXES = ["Risk", "Text", "Color", "ValidTime"];
const eroDays = PRODUCT_REGISTRY.excessiveRain.days;
const expectedKeys = eroDays * ERO_SUFFIXES.length;
if (eroKeyCount !== expectedKeys) {
  throw new Error(`excessiveRain has ${eroKeyCount} keys, expected ${expectedKeys} (${eroDays} days x ${ERO_SUFFIXES.length} fields)`);
}
for (let d = 1; d <= eroDays; d++) for (const suffix of ERO_SUFFIXES) { /* ... */ }
```

Keep the suffix list literal — it is the independent oracle and must not come from the
same source as the thing under test.

### WR-11: `sigComparator` ignores both of its arguments, and `extractPolygons` is called with a `toValue` that returns a string

**File:** `node_helper.js:636`; call sites `:1054, 1074, 1094, 1114, 1134`
**Round-2 ancestor:** WR-09 — **STILL-OPEN**.

**Issue:**

```js
const sigComparator = { initial: false, comparator: (best, val) => true };
const day4SignPoly  = this.extractPolygons(gj, label => label, (label, val) => label === "SIGN", day4URL + " (SIGN)");
```

`comparator` discards `best` and `val` entirely. It produces the right answer (`true` iff
some SIGN polygon contains the point) only because `evaluatePolygons` (:213-222) invokes
the comparator solely inside the `booleanPointInPolygon` hit branch — an incidental
property of the caller, not a stated contract. Any future change to `evaluatePolygons`
that pre-seeds or short-circuits the accumulator silently makes every Day 4-8 `sign`
`true`, which promotes a 45% probability from `ENH` to `MDT` (`percToRisk`, :355-361) —
a false *positive* on the extended outlook.

Separately, `label => label` makes `item.value` a **string** for these lists, violating
the numeric-`value` assumption in `computeProximity` (`comparator.comparator(currentValue,
value)`, :271) and `_validTimeOfWinner` (`item.value !== winningValue`, :240). Nothing
feeds SIGN lists to those helpers today, so this is a trap rather than a live bug — but
`extractPolygons` is now documented as the shared helper for "~25 call sites" and the
next registry row will reasonably assume `value` is a number.

**Fix:**

```js
const sigComparator = { initial: false, comparator: (best, val) => best || val === 1 };
const day4SignPoly  = this.extractPolygons(gj, (label) => (label === "SIGN" ? 1 : 0),
                                           (label, val) => val > 0, day4URL + " (SIGN)");
```

Apply to all five Day 4-8 blocks. This keeps `value` numeric at every call site and makes
the comparator honour its own accumulator contract.

---

## Info

### IN-01: ERO tier colours reuse the SPC severe-thunderstorm palette with no cited source

**File:** `productRegistry.js:48-50`
**Round-2 ancestor:** IN-01 — **STILL-OPEN**.
**Issue:** `eroTierToColor` is a byte-for-byte copy of node_helper.js's severe-weather
`riskToColor` minus `TSTM`/`ENH`. `riskToColor` carries a source citation
(`// https://www.spc.noaa.gov/new/css/SPCmain.css`); `eroTierToColor` carries only
"matches how node_helper.js riskToColor stores them", which justifies the *format*, not
the *values*. On a glanceable wall display, a rainfall MDT rendered in the same `#eb7e82`
as a tornado MDT invites tier confusion between two products with different meanings and
different official WPC palettes.
**Fix:** source the hex values from WPC's own ERO legend (the layer's
`drawingInfo.renderer`, which the registry comment says was already inspected for the
`dn: 4` tier) and cite it in the comment the way `riskToColor` does.

### IN-02: `excessiveRain.dayNValidTime` is computed, cached, documented and probe-asserted, but has no consumer

**File:** `node_helper.js:1252`; `MMM-SPCOutlook.js:227-235`
**Round-2 ancestor:** IN-02 — **STILL-OPEN**, independently confirmed.
**Issue:** Verified with `grep -rn "ValidTime\|validTime" --include=*.js` excluding
`node_modules`: the only matches are the producer, the registry field name, and the
probe. No render path reads it. This phase's most delicate logic (`_validTimeOfWinner`,
the `feature` retention on `extractPolygons` results, the `{ value, validTime }` cache
shape) currently guards a field nobody displays — which is also why WR-07's defect has no
user-visible impact today.
**Fix:** either render it (`Excessive Rain (Day 1): Slight — valid 12Z-12Z`) or, if it is
deliberately staged for phase 18 / MERGE-01, say so in the payload docstring at
node_helper.js:596-598 so the next reader does not treat it as dead weight and delete it.

### IN-03: CONVENTION — ERO text and colour reach `innerHTML` unescaped, deviating from the file's own stated rule

**File:** `MMM-SPCOutlook.js:230-232`
**Round-2 ancestor:** IN-03 — **STILL-OPEN**; refined with a reachability verdict.
**Deviation:** the new ERO render block concatenates
`this.spcrisk.excessiveRain["day"+d+"Color"]` and `["day"+d+"Text"]` into
`wrapper.innerHTML +=` without `escapeHtml`.
**Convention violated:** the rule the same file states at :107-112 — *"anything
concatenated into an innerHTML string is escaped first."* The MD render at :166 follows
it; the new block does not, nor do the pre-existing day1-8 (:171-204) and fireWeather
(:208-222) blocks, nor `proximityBadge` (:98-106).
**Reachability (verified, so this is not overstated):** I traced every remote-origin
string that reaches `innerHTML`. All are bounded:
- `dayN.text` / `dayN.color` — lookups in `valueToFullRisk` / `riskToColor`.
- `excessiveRain.dayNText` / `dayNColor` — lookups in the registry's frozen-in-practice
  `tierToText` / `tierToColor`, keyed by a tier from `eroValueToTier`.
- `fireWeather.dayNText` — lookup in `fireValueToFull`.
- `proximityBadge(prox).nextTier` — this one *is* a verbatim remote `f.properties.LABEL`
  (node_helper.js:194 → :202 → :299 → :304), but `extractPolygons`' `includesFeat`
  filter admits it only when `riskToValue[label] > 0` or `cigToTier[label] > 0`, so it is
  bounded to `TSTM|MRGL|SLGT|ENH|MDT|HIGH|CIG1|CIG2|CIG3`. Prototype keys such as
  `constructor` yield `Function > 0` = false and are filtered out.

So **there is no live XSS**. But every one of those bounds is incidental to the render
site, and IN-04 notes the tables are exported mutable.
**Recommended fix:** wrap the interpolations so the rule is locally checkable rather than
argued from four files away:
```js
wrapper.innerHTML += "Excessive Rain (Day " + d + "): <span style=\"color:#" +
  escapeHtml(this.spcrisk.excessiveRain["day" + d + "Color"]) + "\">" +
  escapeHtml(this.spcrisk.excessiveRain["day" + d + "Text"]) + "</span><br/>";
```
`escapeHtml` is declared at :113 and `proximityBadge` at :98 is only *called* after that
point, so it can adopt the same treatment with no TDZ problem. Fixing all the render
blocks together is the cheaper option.

### IN-04: CONVENTION — `PRODUCT_REGISTRY` and its lookup tables are exported mutable; `buildArcGisQuery` has no external consumer

**File:** `productRegistry.js:36-83`
**Round-2 ancestor:** IN-04 — **STILL-OPEN**, confirmed by grep.
**Deviation:** `module.exports = { buildArcGisQuery, PRODUCT_REGISTRY }` exports a deeply
mutable object graph. `buildArcGisQuery` has zero consumers outside this file (verified
across the repo excluding `node_modules`); only `PRODUCT_REGISTRY` is imported, by
node_helper.js:26 and probe:13.
**Convention violated:** the file positions itself as a *descriptor table* — a
declarative constant. Every other constant map in the codebase is module-private.
**Recommended fix:**
```js
for (const t of [eroValueToTier, eroTierToText, eroTierToColor, eroDayLayers]) Object.freeze(t);
Object.freeze(PRODUCT_REGISTRY.excessiveRain);
module.exports = { PRODUCT_REGISTRY: Object.freeze(PRODUCT_REGISTRY) };
```
(`Object.freeze` is shallow, hence the loop.) Keep `buildArcGisQuery` exported only if a
probe or a phase 15-17 row is about to import it; otherwise it is unused public surface.

### IN-05: CONVENTION — loose equality in the frontend versus strict equality everywhere else

**File:** `MMM-SPCOutlook.js:122-124, 140-144, 169, 180, 190, 229`
**Round-2 ancestor:** IN-05 — **STILL-OPEN**.
**Deviation:** the ERO no-risk gate (`day1Risk != "NONE"`, five occurrences at :140-144)
and the ERO render gate (:229) use `!=`, matching the pre-existing SPC gates.
**Convention violated:** `node_helper.js`, `productRegistry.js` and both probe files use
`===`/`!==` exclusively; the backend code introduced by this phase is 100% strict.
**Recommended fix:** use `!==` in the new ERO gates. Behaviour is identical for these
string comparisons, so this is a zero-risk consistency change; converting the surrounding
pre-existing gates is optional.

### IN-06: CONVENTION — two different idioms for the same day-indexed accumulation inside one function

**File:** `node_helper.js:990-1027` versus `:1175-1253`
**Round-2 ancestor:** IN-06 — **STILL-OPEN**.
**Deviation:** the fire-weather Day 3-8 block builds results with a placeholder-padded
array and `push` (`const dayFireRisks = [null, null, null]; ... dayFireRisks.push(dayRisk);`
plus six manual index reads), while the ERO block ~150 lines below does the same job with
a keyed object seeded over the loop range (`eroTiers[d] = "NONE"`).
**Convention violated:** the ERO form is the one this phase introduced and the one the
registry-driven design depends on. Index alignment via `push` breaks the moment a
`continue` enters the loop body — which the ERO loop already has (:1209).
**Recommended fix:**
```js
const dayFireRisks = {};
for (let d = 3; d <= 8; d++) dayFireRisks[d] = 0;
for (let d = 3; d <= 8; d++) { /* ... */ dayFireRisks[d] = dayRisk; }
```
This also removes the `// placeholders for index alignment (0,1,2 unused)` comment, which
exists only to explain the idiom.

### IN-07: CONVENTION — the frontend hardcodes the ERO day span the registry is supposed to own

**File:** `MMM-SPCOutlook.js:228` (`for (let d = 1; d <= 5; d++)`), `:140-144`
**Round-2 ancestor:** none — new in this pass; the production-code twin of WR-10.
**Deviation:** node_helper.js derives every ERO day count from `PRODUCT_REGISTRY.
excessiveRain.days` (:1174, 1177, 1183, 1248) so that *"no literal day count survives
outside the registry"*. Both frontend ERO sites hardcode `5`. Bumping `days` to 7 would
produce a 28-key payload of which the frontend renders 20 and the no-risk gate inspects 5
— a day-6 HIGH would satisfy the gate and print "No Severe Weather Risk".
**Convention violated:** the registry row is the single declaration point for a product's
span (WR-16 / CFG-01 / D-06, stated at node_helper.js:1154-1156).
**Recommended fix:** a MagicMirror frontend module cannot `require` the registry, so
derive the span from the payload instead of a literal:
```js
const eroDays = Object.keys(this.spcrisk.excessiveRain)
  .filter((k) => /^day\d+Risk$/.test(k)).length;
for (let d = 1; d <= eroDays; d++) { ... }
```
Use the same derivation in the no-risk gate at :139-145.

### IN-08: CONVENTION — `days: 5` and `dayLayers` are two independent declarations of the same fact

**File:** `productRegistry.js:36, 59, 62`
**Round-2 ancestor:** none — new in this pass.
**Deviation:** `eroDayLayers = { 1:0, 2:1, 3:2, 4:3, 5:4 }` and `days: 5` must agree, but
nothing enforces it. Raising `days` to 7 makes `buildUrl(6)` call
`buildArcGisQuery(ERO_BASE_URL, undefined)`, which throws *"layerId must be a
non-negative integer"* — caught by the ERO loop's per-day `try/catch`
(node_helper.js:1237), so days 6 and 7 silently degrade to `"NONE"` with only a log line.
The single "declared knob" the design advertises therefore has a second, undeclared half.
**Convention violated:** the registry row is the single declaration point for a product's
span.
**Recommended fix:** derive one from the other rather than asserting them separately:
```js
days: Object.keys(eroDayLayers).length,
```
or add a load-time consistency check next to `buildArcGisQuery`'s existing argument
guards.

---

## Fix-pass work list

Ordered by what most directly serves the "no false negatives" value:

1. **CR-01** — frontend gate discards `_stale`. One-line gate change; largest payoff.
2. **CR-02** — per-MD `try/catch` + `checkInPolygon` returns the containing feature.
3. **CR-03** — in-flight guard + monotonic sequence on `SPC_DATA_RESULT`.
4. **WR-05** — `updateInterval` clamp (also downgrades CR-03 from continuous to rare).
5. **WR-01 + WR-02 + WR-03 + WR-09** — do these together; the probe changes and the dead
   ERO branch removal are mutually dependent.
6. **WR-04, WR-07, WR-08, WR-11** — independent, small.
7. **WR-06, WR-10** — independent, small.
8. **IN-01 … IN-08** — advisory; none block.

Deferred by the owner and recorded as sound for this deployment: round-2 CR-01
(URL-keyed cache) and round-2 CR-02 (uncorrelated broadcast, multi-instance route).
Both remain STILL-OPEN in the code and must be revisited if a second instance or a
runtime-configurable location is ever added.

---

_Reviewed: 2026-08-23_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
