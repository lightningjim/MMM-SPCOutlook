---
phase: 14-foundation-wpc-excessive-rainfall-outlook
reviewed: 2026-08-19T00:00:00Z
depth: standard
files_reviewed: 3
files_reviewed_list:
  - productRegistry.js
  - node_helper.js
  - MMM-SPCOutlook.js
findings:
  critical: 2
  warning: 9
  info: 4
  total: 15
status: issues_found
---

# Phase 14: Code Review Report

**Reviewed:** 2026-08-19
**Depth:** standard
**Files Reviewed:** 3
**Status:** issues_found

## Summary

Phase 14 adds `productRegistry.js` (new), an ERO fetch/evaluate loop and unconditional
`excessiveRain` payload block in `node_helper.js`, and an ERO render block plus no-risk-gate
conjunct in `MMM-SPCOutlook.js`. Reviewed at standard depth with a directed pass over the six
risks named in the phase's own risk register, plus a general adversarial pass over the three files.

**Risk-register items I attempted to falsify and could not:**

- **dn vs DN domain separation.** `productRegistry.js:66` reads lowercase `f.properties.dn` through
  its own `eroDnToValue`; `dnToFireValue` (node_helper.js:752) is never referenced from ERO code.
  Executed smoke test: `toValue("", {properties:{DN:8}})` returns `0` and
  `toValue("", {properties:{dn:2}})` returns `2` — the two domains do not cross.
- **Unconditional `excessiveRain` block.** `eroTiers`/`eroValidTimes` (node_helper.js:984-985) are
  initialized to NONE/null before the `showExcessiveRain` gate, and the payload block at 1124-1130
  sits on the single success return. No success path emits a partial block. *(But see CR-01 and
  CR-02 — the `{ error }` return path and an unhandled rejection both defeat this guarantee.)*
- **Single success return in `getSpcOutlook`.** Confirmed one `return` at 1021; the `if (!extended)`
  early return is gone. Day 4-8 locals are declared and defaulted at 855-859 *before* the
  `if (extended)` gate at 862, and the fire-weather Day 3-8 locals likewise at 809-810.
- **Frontend no-risk gate, both directions.** `!(showExcessiveRain && excessiveRain && (…!= "NONE"))`
  at MMM-SPCOutlook.js:116-122 is correct: an ERO-only risk makes the conjunct `false`, collapsing
  the whole `&&` chain and suppressing the message; an all-clear makes it `true`, preserving the
  message.
- **`f=geojson` cannot be overridden.** `buildArcGisQuery` (productRegistry.js:24-32) takes no format
  parameter and appends the literal. `baseUrl` is prefix-validated including the trailing `/`, which
  correctly rejects `…noaa.gov.evil.com/`. Only reachable caller passes the module constant.
- **Cache-key byte stability.** `buildUrl(d)` is a pure function of two module constants; executed
  against days 1-5 it produces five fixed strings with no ordering or encoding variance.

The defects below are what the pass *did* surface. Two are blockers. Per the scope note, findings
rooted in code that predates this phase are explicitly labeled **PRE-EXISTING**; two of those are
called out because Phase 14 either replicates the broken shape into new code (WR-08) or routes a new
third-party host through the faulty path (WR-05, WR-06).

---

## Critical Issues

### CR-01: A malformed or error-shaped ERO response destroys the entire outlook payload

**File:** `node_helper.js:1000-1003` (with `node_helper.js:97-99`, `node_helper.js:1133-1136`)

**Issue:** ArcGIS REST does **not** signal most failures with an HTTP status code. Invalid layer id,
service restarting, throttling, and token errors are all returned as **HTTP 200** with a body of
`{"error":{"code":400,"message":"Unable to complete operation","details":[]}}`. `fetchGeoJsonCached`
treats any `res.ok` as success (line 293), `JSON.parse` succeeds on that body, and so
`fetchResult.data` is a non-null object with **no `features` array**. The ERO loop then does:

```js
const polys = this.extractPolygons(fetchResult.data, ero.toValue, ero.includesFeat); // -> features.forEach
const firstFeature = fetchResult.data.features[0];
```

`extractPolygons` immediately dereferences `geojson.features.forEach`. Verified by execution:

```
extractPolygons would throw: TypeError Cannot read properties of undefined (reading 'forEach')
features[0] would throw: Cannot read properties of undefined (reading '0')
```

The throw propagates to the outer `catch` at 1133, which returns `{ error: err.toString() }`. That
return contains **no `day1`-`day8`, no `fireWeather`, and no `excessiveRain`** — it directly violates
D-05 ("the `excessiveRain` block is always present") and, far worse, wipes out every pre-existing SPC
and fire-weather product. The frontend then renders only `"Error: TypeError: Cannot read properties
of undefined…"` (MMM-SPCOutlook.js:96-97). A brand-new **optional, default-off** product can take the
primary product completely offline, and it will stay offline for as long as the WPC MapServer is
unhealthy.

Two adjacent unguarded dereferences share the same fate: `firstFeature.properties[…]` throws if a
feature carries no `properties` (verified: `toValue no-properties: Cannot read properties of
undefined (reading 'dn')`), and `ero.toValue` does the same inside `extractPolygons`.

**Fix:** validate the response shape, and contain any ERO failure to the ERO block so it can never
reach the shared `catch`:

```js
for (let d = 1; d <= ero.days; d++) {
  try {
    const url = ero.buildUrl(d);
    const fetchResult = await this.fetchGeoJsonCached(url);
    if (fetchResult.stale) anyStale = true;

    let eroValue = 0;
    let eroValidTime = null;

    if (fetchResult.data === null && fetchResult.cachedResult !== null) {
      eroValue = fetchResult.cachedResult.value;
      eroValidTime = fetchResult.cachedResult.validTime;
    } else if (fetchResult.data !== null) {
      const gj = fetchResult.data;
      // ArcGIS returns HTTP 200 with an `error` body on most failures.
      if (gj.error || !Array.isArray(gj.features)) {
        Log.error("MMM-SPCOutlook: ERO day " + d + " returned a non-FeatureCollection body", gj.error);
        anyStale = true;
        continue;                      // leaves eroTiers[d] === "NONE", eroValidTimes[d] === null
      }
      const polys = this.extractPolygons(gj, ero.toValue, ero.includesFeat);
      eroValue = this.evaluatePolygons(polys, loc, catComparator);
      // ... cache set unchanged
    }

    eroTiers[d] = ero.valueToTier[eroValue] || "NONE";
    eroValidTimes[d] = eroValidTime;
  } catch (eroErr) {
    // ERO is an optional add-on product; it must never be able to null out the SPC payload.
    Log.error("MMM-SPCOutlook: ERO day " + d + " failed, continuing without it", eroErr);
    anyStale = true;
  }
}
```

Additionally harden `extractPolygons` (`node_helper.js:97`) with
`if (!geojson || !Array.isArray(geojson.features)) return [];` and `const props = f.properties || {};`
so no future registry row can reintroduce this.

---

### CR-02: An SPC Mesoscale Discussion outage permanently strands the module on "Loading…"  *(PRE-EXISTING)*

**File:** `node_helper.js:50-53` (with `node_helper.js:57-61`)

**Issue:** `socketNotificationReceived` awaits `getMesoscaleDiscussion` with **no** `try`/`catch`:

```js
const md = await this.getMesoscaleDiscussion(lat, lon);
const outlook = await this.getSpcOutlook(lat, lon, extended);
this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
```

`fetchBinBuffer` throws on any non-2xx (`throw new Error(...${res.status})`), `fetch()` itself rejects
on DNS/TLS/network failure, and `extractKmlFromKmz` throws `'KMZ downloaded has no KML'`. Any of these
rejects the async handler. Because MagicMirror does not await this handler, the rejection is an
unhandled promise rejection: **`sendSocketNotification` is never reached**, so the frontend stays on
`"Loading SPC Outlook..."` (MMM-SPCOutlook.js:94-95) forever. Every subsequent `setInterval` poll
takes the identical path, so the module never self-heals — the user sees no severe weather data and
no error indication at all.

This is pre-existing (the call site predates Phase 14), but it is listed as Critical because it
silently defeats the exact guarantee this phase was built around: the `excessiveRain` block, and in
fact the entire payload, is never delivered. `getSpcOutlook`'s own outer `catch` does not help — the
MD call runs first.

**Fix:**

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
  outlook = { error: err.toString() };
}
this.sendSocketNotification("SPC_DATA_RESULT", [outlook, md]);
```

---

## Warnings

### WR-01: ERO `valid_time` is read from `features[0]`, not from the polygon the user is in

**File:** `node_helper.js:1002-1003`

**Issue:**

```js
const firstFeature = fetchResult.data.features[0];
eroValidTime = firstFeature ? firstFeature.properties[ero.validTimeField] : null;
```

Two distinct defects:

1. **Wrong feature.** Each ERO layer contains one polygon per risk tier (and often several per tier).
   `features[0]` is whichever polygon the server happened to serialize first — not the one containing
   the user's location. If WPC ever issues an intermediate update where features carry differing
   `valid_time` values, the reported time is silently wrong.
2. **Inconsistent payload on the no-risk path.** `eroValidTime` is assigned regardless of whether
   `eroValue` came out `0`. So a user outside every polygon gets
   `{ day1Risk: "NONE", day1ValidTime: "2026-08-19T12:00:00Z" }` — a risk-free day advertising a valid
   window. The docstring at 1127-1129 promises `null` defaults for the toggle-off case but says
   nothing about the outside-all-polygons case, which produces a different shape.

**Fix:** capture `valid_time` from the winning feature during evaluation, and null it when no polygon
matched:

```js
const polys = this.extractPolygons(fetchResult.data, ero.toValue, ero.includesFeat);
eroValue = this.evaluatePolygons(polys, loc, catComparator);
if (eroValue > 0) {
  const match = fetchResult.data.features.find(
    f => ero.toValue("", f) === eroValue && turf.booleanPointInPolygon(loc, /* f's turf poly */)
  );
  eroValidTime = match ? (match.properties || {})[ero.validTimeField] : null;
} else {
  eroValidTime = null;
}
```

(Cheaper alternative: carry `f.properties[ero.validTimeField]` through `extractPolygons` onto each
item so `evaluatePolygons` can return it alongside the value.)

---

### WR-02: ArcGIS `exceededTransferLimit` is never checked — silent truncation reads as "no risk"

**File:** `productRegistry.js:31`, `node_helper.js:990-1001`

**Issue:** `buildArcGisQuery` emits `where=1%3D1&outFields=*` with no `resultRecordCount` and no
paging. ArcGIS MapServer caps every query at the layer's `maxRecordCount` and signals truncation with
a top-level `"exceededTransferLimit": true` — while still returning a **structurally valid**
FeatureCollection. Nothing in the ERO path inspects that flag. A truncated response therefore flows
straight through `extractPolygons` → `evaluatePolygons` and, if the user's polygon was among the
dropped ones, reports `"NONE"` with full confidence. The failure is completely silent: no log, no
`_stale` marker, no visual difference from a genuine all-clear.

ERO layers are small today, which is why this was not caught, but the code has no defence if WPC
raises feature counts or lowers `maxRecordCount`.

**Fix:** detect and refuse to trust a truncated response:

```js
if (gj.exceededTransferLimit || (gj.properties && gj.properties.exceededTransferLimit)) {
  Log.error("MMM-SPCOutlook: ERO day " + d + " response was truncated by maxRecordCount");
  anyStale = true;
  continue;   // do not report a possibly-false NONE
}
```

Consider also constraining the query with a bbox around `loc` (`geometry=` + `geometryType=esriGeometryEnvelope`),
which both bounds the result set and shrinks the payload — but note that would make the URL
lat/lon-dependent and must then be reconciled with the PERF-02 cache-key-stability requirement.

---

### WR-03: Half the `PRODUCT_REGISTRY` row is unused, and its comment documents a contract the code does not implement

**File:** `productRegistry.js:54-59`, `productRegistry.js:72`

**Issue:** Repo-wide grep for every registry field shows that of the row's eleven keys, **five have
no consumer anywhere**: `id`, `configFlag`, `baseUrl`, `dayLayers`, `days`. Only `buildUrl`,
`toValue`, `includesFeat`, `valueToTier`, `tierToText`, `tierToColor`, and `validTimeField` are read
(node_helper.js:989, 1000, 1016, 1125-1129, 1003).

`baseUrl` and `dayLayers` are especially misleading: they are *duplicates* of state `buildUrl` already
closes over. Editing `row.dayLayers` would change nothing, because `buildUrl` reads the module-level
`eroDayLayers`.

Worse, `configFlag`'s comment makes a false factual claim:

```js
// Frontend config flag name, used by node_helper as this._products[row.configFlag].
configFlag: "showExcessiveRain",
```

`node_helper.js` does no such thing — it hardcodes `products?.showExcessiveRain === true` (line 49)
and `this._products.showExcessiveRain` (line 987). Since the file's stated purpose is to be the
template for Phases 15-17, a future implementer who trusts this comment will build a registry-driven
loop against a field nothing honors.

**Fix:** pick one direction. Either make `node_helper` actually registry-driven —

```js
this._products = {};
for (const row of Object.values(PRODUCT_REGISTRY)) {
  this._products[row.configFlag] = products?.[row.configFlag] === true;
}
// ...
if (this._products[ero.configFlag]) { /* ERO loop */ }
```

— or delete `id`/`baseUrl`/`dayLayers`/`days` and rewrite the `configFlag` comment to say it is
currently informational only.

---

### WR-04: ERO day count is hardcoded as `5` in two places while `ero.days` and `ero.dayLayers` sit unread

**File:** `node_helper.js:988`, `node_helper.js:1124-1130`, `node_helper.js:984-985`

**Issue:** Four independent literals must stay in sync for ERO to be correct:

- `productRegistry.js:36` — `eroDayLayers` has 5 entries
- `productRegistry.js:59` — `days: 5`
- `node_helper.js:988` — `for (let d = 1; d <= 5; d++)`
- `node_helper.js:984-985, 1124-1130` — `eroTiers`/`eroValidTimes` seeds and the `day1…day5` payload literal

Nothing links them. Adding layer `5` to `eroDayLayers` and bumping `days` to `6` produces **zero**
behavior change — the loop still stops at 5 and the payload block still emits five days, silently.
Conversely, raising the loop bound to 6 without touching `eroDayLayers` makes `buildUrl(6)` throw
`"layerId must be a non-negative integer"` (verified by execution), which under CR-01's shared
`catch` nulls the entire payload.

**Fix:** drive both from the registry:

```js
const eroTiers = {};
const eroValidTimes = {};
for (let d = 1; d <= ero.days; d++) { eroTiers[d] = "NONE"; eroValidTimes[d] = null; }
// ...
for (let d = 1; d <= ero.days; d++) { /* fetch loop */ }
// ...
excessiveRain: Object.fromEntries(
  Object.keys(eroTiers).flatMap(d => [
    ["day" + d + "Risk",      eroTiers[d]],
    ["day" + d + "Text",      ero.tierToText[eroTiers[d]]],
    ["day" + d + "Color",     ero.tierToColor[eroTiers[d]]],
    ["day" + d + "ValidTime", eroValidTimes[d]]
  ])
)
```

Add an assertion in the registry that `Object.keys(dayLayers).length === days`.

---

### WR-05: No request timeout on any fetch; Phase 14 adds five more serial hops on a new host  *(PRE-EXISTING pattern, amplified)*

**File:** `node_helper.js:2`, `node_helper.js:58`, `node_helper.js:246`, `node_helper.js:276`, `node_helper.js:990`

**Issue:** `node-fetch` has **no default timeout**. Every `fetch` in this file can hang indefinitely
on a half-open connection. Because `getSpcOutlook` is a fully serial `await` chain (~25 requests) and
`socketNotificationReceived` awaits it before sending anything, one hung socket means
`SPC_DATA_RESULT` is never emitted for that poll — and the next `setInterval` tick simply stacks
another in-flight chain behind it (there is no in-flight guard).

Phase 14 appends 5 more sequential awaits at the *tail* of that chain, against a **new third-party
host** (`mapservices.weather.noaa.gov`) whose availability characteristics differ from
`spc.noaa.gov`. The ERO block is therefore the most likely place for this pre-existing hazard to
manifest, and it is gated behind a default-off flag so the failure will only appear for users who
opt in.

**Fix:**

```js
const FETCH_TIMEOUT_MS = 15000;
res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) });
```

The existing `catch (err)` in `fetchGeoJsonCached` (line 277) already handles the resulting
`AbortError` correctly via the stale-fallback path, so this is a one-line-per-call-site change.
Apply the same to `fetchBinBuffer` (line 58).

---

### WR-06: Remote-controlled strings are concatenated into `innerHTML` unescaped  *(PRE-EXISTING sink, new source)*

**File:** `MMM-SPCOutlook.js:97`, `MMM-SPCOutlook.js:143`

**Issue:** Two sinks assign remote-derived text straight into `innerHTML`:

```js
wrapper.innerHTML = "Error: " + this.spcrisk.error;                                    // :97
wrapper.innerHTML += "<span style=\"color: #0059E0\">" + MD + " in effect.</span><br/>"; // :143
```

- `this.spcrisk.error` is `err.toString()`. When the upstream body is not JSON, Node's `JSON.parse`
  SyntaxError message **embeds a verbatim window of the response body**. Verified on this machine
  (Node 25.9.0): `JSON.parse('<html><img src=x onerror=alert(1)></html>')` produces
  `SyntaxError: Unexpected token '<', "<html><img"... is not valid JSON`, and with a longer prefix
  `... ..."890, "b": <img src=x"... is not valid JSON`. The window is ~10 characters either side of
  the offending token, so the injectable span is short — but it is attacker-positionable and lands in
  `innerHTML` with zero escaping.
- `MD` is `MDgj.features[0].properties.name` from remote KML (node_helper.js:227) — **unbounded**
  attacker-controlled text if the upstream is ever compromised or MITM'd.

The sinks predate Phase 14. What is new is that Phase 14 routes a **fifth-party host's raw response
bodies** into the first sink for the first time.

**Fix:** stop building markup by string concatenation for untrusted values.

```js
} else if (this.spcrisk.error) {
  wrapper.textContent = "Error: " + this.spcrisk.error;   // textContent, not innerHTML
}
// ...
for (const MD of this.mds) {
  const span = document.createElement("span");
  span.style.color = "#0059E0";
  span.textContent = MD + " in effect.";
  wrapper.appendChild(span);
  wrapper.appendChild(document.createElement("br"));
}
```

Note the ERO render block at :204-212 is **not** affected — its `Color` and `Text` both come from the
closed tables `ero.tierToColor` / `ero.tierToText` keyed by a value that is `|| "NONE"`-clamped at
node_helper.js:1016, so no remote string can reach the markup there.

---

### WR-07: Helper-global `this._products` collides across module instances and across overlapping polls

**File:** `node_helper.js:29`, `node_helper.js:49`, `node_helper.js:987`

**Issue:** Phase 14 adds `this._products` to a growing set of helper-global mutable state
(`_updateInterval`, `_proximityWeighting`, `_cachedLat`, `_cachedLon`, `_geoJsonCache`). MagicMirror
instantiates **one** `node_helper` per module *type*, not per module *instance*, and
`sendSocketNotification("SPC_DATA_RESULT", …)` broadcasts to **every** instance. Two configured
instances therefore:

- overwrite each other's `this._products` on every poll, so an instance with
  `showExcessiveRain: true` can receive a payload computed with the flag off (all-NONE ERO), or vice
  versa; and
- overwrite each other's `_cachedLat`/`_cachedLon`, which triggers the cache invalidation at
  436-443 on *every* poll (see WR-08 for why that is destructive).

There is also a single-instance re-entrancy path: `this._products` is written at line 49 but not read
until line 987 — after roughly twenty `await` points. If a second `GET_SPC_DATA` arrives mid-flight
(easy, since there is no in-flight guard and no fetch timeout — WR-05), the first chain reads the
*second* request's toggle and emits an `excessiveRain` block matching neither request.

**Fix:** snapshot the per-request config into a local at the top of `getSpcOutlook` rather than
reading `this._products` deep inside it, and pass it as a parameter:

```js
async socketNotificationReceived(notification, payload) {
  // ...
  const products = { showExcessiveRain: payload.products?.showExcessiveRain === true };
  const outlook = await this.getSpcOutlook(lat, lon, extended, products);
}

async getSpcOutlook(lat, lon, extended, products) {
  // ...
  if (products.showExcessiveRain) { /* ERO loop */ }
}
```

Multi-instance correctness needs a larger fix (key the cache and the result by instance identifier)
and is out of scope for this phase, but the snapshot removes the re-entrancy half of the defect at
near-zero cost.

---

### WR-08: Location-change invalidation keeps the ETag, so the next 304 permanently pins every product to "no risk"  *(PRE-EXISTING, replicated into new ERO code)*

**File:** `node_helper.js:436-443` and `node_helper.js:286-290`; ERO instance at `node_helper.js:996-1011`

**Issue:** The invalidation loop nulls the *result* but preserves `mode`, `etag`, and `hash`:

```js
this._geoJsonCache.set(url, { ...entry, result: null, timestamp: 0 });
```

On the next request, `fetchGeoJsonCached` still sends `If-None-Match: entry.etag` (line 270-272).
SPC's static `.lyr.geojson` files are Apache-served and do set strong ETags, so the server replies
**304**, and line 289 returns `{ data: null, cachedResult: entry.result }` — i.e. `cachedResult: null`.

Every caller's branch structure is `if (data === null && cachedResult !== null)`, so that branch is
skipped, and the value silently falls to the `0`/`NONE` default. Critically, **the 304 path never
re-writes the cache entry**, so `etag` stays, `result` stays `null`, and *every subsequent poll
repeats the exact same sequence*. The module reports no risk for that URL indefinitely — until the
upstream file's content changes.

The new ERO loop reproduces this shape verbatim (996-1011): a 304 with a nulled result leaves
`eroValue = 0` → `"NONE"`.

**Reachability:** on the very first poll `locationChanged` is true (`_cachedLat === null`) but the
cache is empty, so the loop is a no-op — the common single-instance case is unaffected. It becomes
live whenever `_cachedLat`/`_cachedLon` actually flips at runtime, which is exactly what WR-07's
multi-instance collision causes on every poll. Under that combination the module displays
"No Severe Weather Risk" during severe weather.

**Fix:** invalidate the validators too, so the next request is a genuine unconditional fetch:

```js
if (locationChanged) {
  this._geoJsonCache.clear();       // simplest correct form: nothing in the entry is location-independent
  this._cachedLat = lat;
  this._cachedLon = lon;
  Log.info('MMM-SPCOutlook: location changed — cache cleared');
}
```

If retaining the memoized `polys`/`lines` matters for proximity weighting (they *are*
location-independent), then at minimum drop the validators:

```js
this._geoJsonCache.set(url, { ...entry, result: null, etag: null, hash: null, timestamp: 0 });
```

Independently, the 304 branch at 287-290 should defensively handle `entry === undefined`
(a proxy can return 304 without an `If-None-Match`), which currently throws on `entry.result`.

---

### WR-09: The `products` payload literal is duplicated between `start()` and the interval, with a comment inviting future phases to edit both

**File:** `MMM-SPCOutlook.js:17`, `MMM-SPCOutlook.js:19`

**Issue:** The full six-field notification payload — including the new
`products: { showExcessiveRain: this.config.showExcessiveRain }` — is written out twice, once for the
initial send and once inside the `setInterval` callback. The comment at :15-16 explicitly instructs
Phases 15-17 to "add their flags to this same object", i.e. it invites three future phases to make
the same edit in two places. A single missed edit produces the worst possible failure mode: the
product renders correctly on startup and then silently reverts to off on the first hourly refresh —
a bug that takes an hour to reproduce.

**Fix:** build the payload once:

```js
buildRequestPayload: function() {
  return {
    lat: this.config.lat,
    lon: this.config.lon,
    extended: this.config.extended,
    updateInterval: this.config.updateInterval,
    proximityWeighting: this.config.proximityWeighting,
    // Phases 15-17 add their flags here — one place only.
    products: { showExcessiveRain: this.config.showExcessiveRain }
  };
},

start: function() {
  Log.info(`Starting module: ${this.name}`);
  this.sendSocketNotification("GET_SPC_DATA", this.buildRequestPayload());
  setInterval(() => this.sendSocketNotification("GET_SPC_DATA", this.buildRequestPayload()),
              this.config.updateInterval * 60000);
},
```

---

## Info

### IN-01: CONVENTION — ERO risk comparisons use loose `!=` in a file that otherwise uses strict equality for new code

**File:** `MMM-SPCOutlook.js:117-121`, `MMM-SPCOutlook.js:206`

**Deviation:** The new ERO conjunct and render loop compare tier strings with `!=`
(`this.spcrisk.excessiveRain.day1Risk != "NONE"`), while the surrounding newer helpers in the same
function use strict comparison throughout — `cig === 3` (:45-47), `typeof prox.value !== "number"`
(:65), `tier === "CIG3"` (:53-55), `day3CatBadge !== ""` (:171).

**Convention violated:** Newly added comparisons in this file use `===`/`!==`; the loose forms appear
only in the older risk-string blocks (:99-101, :146, :157, :167).

**Suggested fix (recommend, non-blocking):** use `!==`. Both operands are guaranteed strings here
(`eroTiers[d]` is `|| "NONE"`-clamped at node_helper.js:1016), so this is a zero-risk change:

```js
this.spcrisk.excessiveRain.day1Risk !== "NONE" ||
// ...
if (this.spcrisk.excessiveRain["day" + d + "Risk"] !== "NONE") {
```

---

### IN-02: CONVENTION — `extractPolygons` JSDoc documents a 1-argument `toValue` that the registry contradicts

**File:** `node_helper.js:92-93`, `productRegistry.js:63-66`

**Deviation:** The JSDoc still reads
`@param toValue - function mapping a feature's LABEL string to a numeric value`, describing a
one-argument contract. The implementation calls `toValue(label, f)` (line 101), and Phase 14's
registry entry depends entirely on the undocumented second parameter:

```js
toValue: (label, f) => eroDnToValue[f.properties.dn] || 0,
```

The registry's own comment asserts *"Matches extractPolygons's `toValue(label, f)` contract"* — a
contract the authoritative JSDoc three files away denies. The fire-weather callers (824, 836) already
relied on the 2-arg form before this phase, so the doc was already stale; Phase 14 makes the second
argument load-bearing for a new module and should have corrected it.

**Suggested fix (recommend, non-blocking):**

```js
* @param toValue - (label, feature) => number; maps a feature's LABEL string and/or its raw
*                  properties to a numeric tier value. Products with no LABEL field (e.g. the
*                  WPC ERO, which keys off lowercase `properties.dn`) use the second argument.
```

---

### IN-03: CONVENTION — the registry and its lookup tables are exported mutable, and `buildArcGisQuery` has no consumer

**File:** `productRegistry.js:83`, `productRegistry.js:24`, `productRegistry.js:43-50`

**Deviation:** The file's stated purpose is that `f=geojson` and the ERO `dn` map are inviolable
(header comment lines 11-14, 38-42), yet `PRODUCT_REGISTRY` and every nested table are exported as
plain mutable objects — any consumer can do `PRODUCT_REGISTRY.excessiveRain.toValue = dnToFireValue`
and reintroduce ERO-02 exactly. Separately, `buildArcGisQuery` is exported but no file imports it
(node_helper only destructures `PRODUCT_REGISTRY`), so it is currently unused public surface.

**Convention violated:** exports in this codebase are consumed; this file's own comments treat its
tables as constants.

**Suggested fix (recommend, non-blocking):**

```js
module.exports = Object.freeze({ buildArcGisQuery, PRODUCT_REGISTRY: Object.freeze(PRODUCT_REGISTRY) });
```

with `Object.freeze` on `eroDayLayers`, `eroDnToValue`, `eroValueToTier`, `eroTierToText`, and
`eroTierToColor`. Keep `buildArcGisQuery` exported only if a Phase 15-17 consumer is imminent;
otherwise drop it from the export list.

---

### IN-04: CONVENTION — comment drift: contradictory phase references and a "single-pass" claim the code does not satisfy

**File:** `productRegistry.js:79-80`, `MMM-SPCOutlook.js:115`, `node_helper.js:861`

**Deviation:** Three comments state things the code does not support:

- `productRegistry.js:79-80` says future rows land in "Phases 15-17"; `MMM-SPCOutlook.js:115` labels
  the ERO gate a "Phase 19 RPT-06 regression target". Two different forward-looking numbering
  schemes in one phase's diff.
- `node_helper.js:861` reads *"PERF-02: single-pass extractPolygons for both risk and SIGN before
  evaluatePolygons"* — but each Day 4-8 block immediately below makes **two** separate
  `extractPolygons` calls over the same `gj` (e.g. `day4RiskPoly` at 875 and `day4SignPoly` at 876).
  The comment describes an optimization that was never implemented. Pre-existing text, but Phase 14's
  refactor moved and re-indented it without correcting it.

**Convention violated:** comments in these files are load-bearing design records (D-xx / PERF-xx
identifiers); they are relied on as spec by later phases.

**Suggested fix (recommend, non-blocking):** settle on one forward phase reference, and either
implement the single pass (accumulate both values in one `forEach`) or reword the comment to
*"two extractPolygons passes over one parsed body — the body is parsed once, not the polygons"*.

---

_Reviewed: 2026-08-19_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
