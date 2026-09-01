# Phase 17: NWS/WPC HeatRisk & Parallelized Fetching - Pattern Map

**Mapped:** 2026-08-31
**Files analyzed:** 4 existing files receive edits — no new files (vanilla-JS, no-build-step
module; a "new product" is new exported symbols/edited regions inside existing files, exactly
as Phase 16 established)
**Analogs found:** 7 / 7 edit regions have a same-file or cross-file analog to copy from; 2
sub-items (the `fetchGeoJsonCached` validator-injection idiom itself, and the frontend-only
`showMinorHeat` config-read shape) have **no** prior-code analog and are called out under "No
Analog Found"

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|---|---|---|---|---|
| `node_helper.js` — `fetchGeoJsonCached(url)` → `fetchGeoJsonCached(url, isValidBody)` (generalize the shape-validator into an optional, defaulted parameter) | service (shared transport/cache) | request-response | The function itself, unchanged in every branch except the two `_isFeatureCollection` call sites (`:2193`, `:2209`) | exact (same function, minimal-diff edit — no cross-file analog needed or available) |
| `node_helper.js` — new `_runHeatRiskProduct(row, loc, productToggles)` sibling runner (fetch → `turf.toMercator` → zip → sort → dedupe → bucket → per-item age check) | controller/service (backend fetch-evaluate-assemble orchestrator) | request-response, transform | `_runArcGisHazardWindowProduct` (`:526`) + `_cacheHazardMatches`/`_hazardMatchesFromHits` (`:391-506`) for the clock-independent cache-write whitelist; `_runArcGisDayProduct` (`:280-374`) for the full-day-span-emit / per-item try-catch / "convert exactly once" discipline **only** — its cache-write shape must NOT be copied | role-match (structure) + explicit-deviation (cache contract, same as Phase 16's finding) |
| `productRegistry.js` — new `PRODUCT_REGISTRY.heatRisk` row + `buildHeatRiskIdentifyUrl` + `assertNoSharedRegistryMaps` (D-11) load-time validator | config (registry row) + utility (load-time validator) | CRUD (static descriptor) / transform (validator) | `PRODUCT_REGISTRY.hazardsOutlook` (`:380-449`) for "a row with no severity ladder, no `valueToTier`" shape; `PRODUCT_REGISTRY.spcMD`/`.mpd` (`:337-379`) for "a row that is not day-layer shaped"; `daySpanOf`/`dayRangeOf` (`:53-74`, `:229-250`) for the load-time-throw idiom D-11 extends | exact (row skeleton) + role-match (new validator kind) |
| `node_helper.js` — `getSpcOutlook`'s new-product section (`:2921-2963`): 3 named awaits + `kml-advisory` for-loop → one `Promise.allSettled` batch of 6 members | controller (batch orchestration) | batch, event-driven | The section itself — current verbatim shape captured below; no cross-file analog exists in this codebase for a `Promise.allSettled` fan-out (this is the first one) | exact (self, before/after) + no-analog (the settlement idiom is genuinely new to this file) |
| `MMM-SPCOutlook.js` — `defaults:` gains `showHeatRisk: false`; `buildRequestPayload`'s `products:` object gains `showHeatRisk` (and pointedly does **not** gain `showMinorHeat`) | config | request-response | `showHazardsOutlook`/`showDrought`'s own Phase 16 addition (`:11-12` defaults, `:56-57` payload) — the direct, already-precedented "add one product flag + one sub-toggle" edit | exact |
| `MMM-SPCOutlook.js` — new `heatRiskDaysToRender(block, showMinorHeat)` shared predicate (D-03) + one gate term + one render loop | component (render-gate predicate + DOM renderer) | transform | `hazardsOutlookHasAnyDay`/`hazardsOutlookHasWindowEntries` (`:313-323`) for "one predicate feeds both the gate and the loop"; `dayRiskCount`/`blockHasRisk` (`:229-242`) for the single-predicate-return-boolean shape; `renderDayBlock` (`:522-532`) for the day-loop renderer shape | exact (predicate pattern) + role-match (renderer shape, floor logic is new) |
| `scripts/probe-payload-resilience.js` + `scripts/probe-lib/module-stubs.js` — new `heatrisk-*` scenarios (10 per RESEARCH.md's requirement map) + `heatRiskRoutes`/`heatRiskIdentifyResponse` fixture builders + a new deferred-resolution `_fetch` stub for the PERF-01 overlap scenario | test | transform / event-driven | `hazards-data-age-sets-the-badge-but-not-the-age-figure` (`:4939-5014`) — mutation-proven scenario with precondition guard + control assertion, the exact shape 15 D-10 requires; `hazardsRoutes`/`hazardsFeature` (`:755-789`) for fixture-builder shape | role-match (scenario shape) + no-analog (deferred-fetch stub is new harness infrastructure, confirmed by RESEARCH.md's own "Wave 0 Gaps" list) |

## Pattern Assignments

### 1. `fetchGeoJsonCached` — the headline generalization (`node_helper.js:2039-2212`)

**This is the single most load-bearing pattern-mapping finding in this phase.** RESEARCH.md's
headline result: `fetchGeoJsonCached` as it stands today would silently reject **every** HeatRisk
response.

**Current signature and the two hardcoded call sites** (verbatim, current `main`):
```javascript
// node_helper.js:2039
async fetchGeoJsonCached(url) {
  ...
  // ETag branch, cache miss (node_helper.js:2190-2194):
  const parsed = parseBody();
  if (!parsed.ok) return rejectBody(parsed.reason);
  if (!this._isFeatureCollection(parsed.value)) return rejectBody('not a usable FeatureCollection');
  return { data: parsed.value, rawText, newEtag, newHash: null, mode: 'etag' };
  ...
  // Hash branch, cache miss (node_helper.js:2206-2210) — byte-identical guard, mirrored:
  const parsed = parseBody();
  if (!parsed.ok) return rejectBody(parsed.reason);
  if (!this._isFeatureCollection(parsed.value)) return rejectBody('not a usable FeatureCollection');
  return { data: parsed.value, rawText, newEtag: null, newHash, mode: 'hash' };
},
```

**`_isFeatureCollection` itself** (`node_helper.js:1448-1451`):
```javascript
_isFeatureCollection(body){
  return !!body && typeof body === "object" && !body.error &&
         body.exceededTransferLimit !== true && Array.isArray(body.features);
},
```
The HeatRisk identify response has **no top-level `features` key at all** — its features live at
`body.catalogItems.features` — so `Array.isArray(body.features)` is `false` on every single
cache-miss poll, `rejectBody('not a usable FeatureCollection')` fires every time, and HeatRisk
presents as a permanent, silent fetch failure (`failed: true`, never cached).

**Every existing caller of `fetchGeoJsonCached`, for context on blast radius** (must remain
byte-identical in behavior after the change): `_runArcGisDayProduct` (`:298`),
`_runArcGisHazardWindowProduct` (`:584`), `fetchAndEvaluateHazard` (`:2230`, `:2253`), plus the
~15 SPC/fire-weather call sites (`:2458` onward through `:2880`).

**Recommended change — additive, defaulted parameter** (from RESEARCH.md, verified against the
current call sites above): change the signature to
`async fetchGeoJsonCached(url, isValidBody = (body) => this._isFeatureCollection(body))`, and
replace both `if (!this._isFeatureCollection(parsed.value))` lines (`:2193`, `:2209`) with
`if (!isValidBody(parsed.value))`. Every existing caller passes no second argument, so every
existing caller's behavior is byte-identical. HeatRisk's runner is the first and only caller
that passes its own validator.

**Why an injected parameter, not a duplicate function or an `_isFeatureCollection` special-case:**
this codebase's established, twice-cited convention (WR-06, repeated in 16-REVIEW: "a fix applied
to one twin and not the other") is structural reuse over copy-paste. `fetchGeoJsonCached` is
~170 lines of ETag/hash/stale-fallback/body-size logic proven correct for five products; forking
it for one shape-check difference is the exact anti-pattern this codebase has fixed twice already.
`_isFeatureCollection`'s own contract ("is this a usable GeoJSON FeatureCollection") must stay
exactly what its name says — bending it to also accept an ImageServer identify shape would make it
lie about what it validates.

**ETag/hash mechanics that ARE reusable unchanged** — everything above and below the two edited
lines: the 304 branch (`:2070-2090`), the network-error stale-fallback branch (`:2054-2067`), the
non-ok-HTTP stale-fallback branch (`:2092-2103`), `rejectBody`'s own stale-fallback (`:2117-2125`),
the declared/actual body-size bounds (`:2127-2165`), and both cache-hit branches (`:2179-2189`,
`:2196-2205`). None of these reference `_isFeatureCollection` or `features` — they operate on
`rawText`/`res`/`entry` generically, exactly as CONTEXT.md's Reusable Assets note originally
claimed (true for everything except the two validator lines RESEARCH.md found).

---

### 2. `_runArcGisDayProduct` — the full-day-span emitter, and where its cache contract must NOT transfer

**Analog:** `_runArcGisDayProduct` (`node_helper.js:280-374`, full text read and verified this
session)

**What transfers, verbatim in spirit:**
- The full-span seed-then-fill discipline (`:284-290`): every day is seeded to a no-risk default
  (`tiers[d] = "NONE"`) **before** any fetch runs, so a toggle-off row or a mid-loop throw still
  emits a complete, well-shaped block — Phase 14 D-05's precedent, which D-02 explicitly requires
  HeatRisk to follow (raw `0`–`4` category on every `day1`–`day7` key, backend-unfiltered).
- The per-day `try`/`catch` with `anyStale = true` on a caught throw, independent of the
  `fetchResult.stale || fetchResult.failed` check (`:304`, `:348-356`) — "a contained throw is a
  degrade, not a clean read" (CR-01), because the throw can happen before that line ever runs.
- "Convert exactly once, after the branch closes" (`:343-347`) — a cache hit must produce the
  identical output shape a fresh fetch does.

**What does NOT transfer — the day↔URL loop.** `_runArcGisDayProduct` loops `for (let d = 1; d <=
days; d++)` and calls `row.buildUrl(d)` once **per day**, issuing up to 7 separate HTTP requests.
HeatRisk is **one** identify call covering the whole week — `_runHeatRiskProduct` has no analogous
per-day loop at all; the "loop" that exists instead is the zip/sort/dedupe/bucket pass over one
already-fetched response's `catalogItems.features`/`properties.Values` arrays.

**What must NOT transfer — the cache-write shape** (`node_helper.js:334-340`):
```javascript
this._geoJsonCache.set(url, {
  mode: fetchResult.mode,
  etag: fetchResult.newEtag ?? null,
  hash: fetchResult.newHash ?? null,
  result: { value, validTime },
  timestamp: this._nowMs()
});
```
This caches a **final, already-bucketed** result — safe for ERO/WSSI only because their day key
is a property of the URL (`dayLayers[1]` is always "Day 1"). HeatRisk shares Phase 16's exact
day-offset-cache-staleness pitfall: its day key is derived by comparing a **static**
`idp_validtime` against **today's live clock**, from **one URL covering all 7 days**. Caching a
bucketed `{ day3: ..., day4: ... }`-shaped result under this contract would silently misdate every
category by one day per elapsed day, with no error, no ⚠, and no failing assertion — RESEARCH.md
names this "the single highest-value finding" carried forward from Phase 16. **The correct analog
to copy for HeatRisk's cache write is `_cacheHazardMatches`, not this block — see below.**

---

### 3. `_cacheHazardMatches` / `_hazardMatchesFromHits` — the whitelist cache pattern to reuse

**Analog:** `_hazardMatchesFromHits` (`node_helper.js:391-413`) and `_cacheHazardMatches`
(`:470-506`), full text verified this session.

```javascript
// node_helper.js:391
_hazardMatchesFromHits(hits) {
  const matches = [];
  for (const hit of hits) {
    const label = hit && hit.value;
    if (typeof label !== "string" || label.length === 0) continue;

    const props = hit.feature && hit.feature.properties;
    const startDate = props ? props.start_date : undefined;
    const endDate = props ? props.end_date : undefined;
    if (typeof startDate !== "number" || !Number.isFinite(startDate) ||
        typeof endDate !== "number" || !Number.isFinite(endDate)) {
      continue;
    }

    const rawFiledate = props ? props.idp_filedate : undefined;
    const idpFiledate = (typeof rawFiledate === "number" && Number.isFinite(rawFiledate))
      ? rawFiledate
      : null;

    matches.push({ label, startDate, endDate, idpFiledate });
  }
  return matches;
},
```

```javascript
// node_helper.js:470
_cacheHazardMatches(url, fetchResult, matches, layerFiledate) {
  const whitelisted = [];
  for (const match of matches) {
    // Defensive assertion: the whitelist below already makes a clock-dependent field
    // structurally unable to enter the cache. This converts a future refactor that
    // bypasses the whitelist (e.g. a spread added here later) from a silent misdating
    // bug into a loud, immediate failure.
    for (const key of Object.keys(match)) {
      if (/^day\d+$/.test(key) || key === "offsetStart" || key === "offsetEnd" || key === "dayOffset") {
        throw new Error("MMM-SPCOutlook _cacheHazardMatches: refusing to cache a clock-dependent field: " + key);
      }
    }
    whitelisted.push({
      label: match.label,
      startDate: match.startDate,
      endDate: match.endDate,
      idpFiledate: match.idpFiledate
    });
  }

  const filedate = (typeof layerFiledate === "number" && Number.isFinite(layerFiledate))
    ? layerFiledate
    : null;

  this._geoJsonCache.set(url, {
    mode: fetchResult.mode,
    etag: fetchResult.newEtag ?? null,
    hash: fetchResult.newHash ?? null,
    // `{ matches, layerFiledate }`, not a bare array — the filedate must survive a cache
    // hit on a poll where nothing contains the user.
    result: { matches: whitelisted, layerFiledate: filedate },
    timestamp: this._nowMs()
  });
},
```

**Copy the whole shape for `_runHeatRiskProduct`'s cache write:** cache only the
clock-independent, post-zip/dedupe tuples (`{ idp_validtime, category, idp_filedate }` per
surviving item — analogous to `{ label, startDate, endDate, idpFiledate }` here), with the same
field-whitelist-not-spread discipline and the same defensive "throw if a clock-dependent key
(`day\d+`/`dayOffset`) tries to enter" guard. **Recompute `heatRiskDayOffset` (the
`_hazardDayOffset`-equivalent bucketing) fresh on every poll — cache hit or miss — against that
poll's own `_todayUtcMs()`.** Never persist a day-keyed final value the way `_runArcGisDayProduct`
does.

---

### 4. `_hazardDayOffset` / `_todayUtcMs()` / `_nowMs()` / `MS_PER_DAY` — reused verbatim, no new code

**Analog:** `node_helper.js:1879-1909`, full text verified this session:
```javascript
// node_helper.js:1879
_nowMs() {
  return Date.now();
},

/**
 * UTC midnight of the current day, derived from `_nowMs()` so a probe overriding that
 * seam moves this too. Only `getUTC*` getters and `Date.UTC` are permitted here —
 * `getFullYear()`/`getMonth()`/`getDate()` or `new Date(y, m, d)` would silently
 * reintroduce a timezone bug on a Raspberry Pi whose system clock is not UTC.
 * @returns epoch milliseconds of today's UTC midnight
 */
_todayUtcMs() {
  const d = new Date(this._nowMs());
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
},

/**
 * The signed day offset of an epoch-ms value relative to today's UTC midnight.
 * @param epochMs - a feature's start_date/end_date, epoch milliseconds
 * @param todayUtcMs - this poll's `_todayUtcMs()` value
 * @returns integer day offset (0 = today, negative = past, positive = future)
 */
_hazardDayOffset(epochMs, todayUtcMs) {
  return Math.round((epochMs - todayUtcMs) / MS_PER_DAY);
},
```
`MS_PER_DAY` is declared at `node_helper.js:137` (`const MS_PER_DAY = 24 * 60 * 60 * 1000;`).

RESEARCH.md's live verification (`_todayUtcMs()` = `2026-08-31T00:00:00Z`, `idp_validtime` values
sitting at exact `12:00:00.000Z`) confirms `_hazardDayOffset(idp_validtime, _todayUtcMs())`
produces the **direct** 1–7 day key for HeatRisk with **no `+1` adjustment and no new arithmetic**
— reuse this function verbatim (or via a trivial rename to something HeatRisk-agnostic, e.g.
`heatRiskDayOffset` as a thin wrapper) rather than writing a parallel formula. `_nowMs()` and
`_todayUtcMs()` are already probe-pinnable seams (16-REVIEW WR-05) — HeatRisk's day-offset probe
scenarios get clock control for free by routing through them, exactly as every Hazards Outlook
scenario already does.

---

### 5. `getSpcOutlook`'s new-product section — the exact PERF-01 parallelization site (`node_helper.js:2921-2963`)

**Current shape, verbatim** (confirmed byte-identical to RESEARCH.md's citation, this session):
```javascript
// node_helper.js:2921
const eroResult = await this._runArcGisDayProduct(
  PRODUCT_REGISTRY.excessiveRain, loc, catComparator, productToggles
);
const eroPayload = eroResult.payload;
if (eroResult.anyStale) anyStale = true;

// node_helper.js:2933
const wssiResult = await this._runArcGisDayProduct(
  PRODUCT_REGISTRY.winterImpact, loc, catComparator, productToggles
);
const wssiPayload = wssiResult.payload;
if (wssiResult.anyStale) anyStale = true;

// node_helper.js:2946
const hazardsResult = await this._runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook, loc, productToggles);
const hazardsPayload = hazardsResult.payload;
if (hazardsResult.anyStale) anyStale = true;

// node_helper.js:2957-2963 — the kml-advisory for-loop
const advisories = { spcMD: [], mpd: [] };
for (const row of Object.values(PRODUCT_REGISTRY)) {
  if (row.kind !== "kml-advisory") continue;
  const advisoryResult = await this._runKmlAdvisoryRow(row, lat, lon, productToggles);
  advisories[row.id] = advisoryResult.entries;
  if (advisoryResult.anyStale) anyStale = true;
}
```
`row.kind !== "kml-advisory"` at `:2959` is the exact `continue` D-09 replaces with a
`.filter((row) => row.kind === "kml-advisory")` built once, before the batch, per RESEARCH.md's
recommended shape.

**How each runner's result is currently consumed** (load-bearing for the planner's restructure):
- `_runArcGisDayProduct`/`_runArcGisHazardWindowProduct` return `{ payload, anyStale }` — the
  `payload` local (`eroPayload`, `wssiPayload`, `hazardsPayload`) is read later in the function
  when assembling the final return object (`:2970+`), and `anyStale` folds into one shared
  `anyStale` local declared earlier in `getSpcOutlook`.
- `_runKmlAdvisoryRow` returns `{ entries, anyStale }` — `entries` is assigned into
  `advisories[row.id]` **inside** the loop (`:2961`), which is the one consumer shape D-09
  explicitly calls out as needing to move to *after* settlement once the loop becomes a
  `Promise.allSettled` member.

**How per-product failure is currently isolated:** each runner already wraps its own
fetch/parse/evaluate in a per-item `try`/`catch` internally (Section 2 above) and is **documented
to never throw** past that boundary — `getSpcOutlook`'s own outer `try` (opened at `:2337`) is the
only thing between these four call sites and a payload-wide `{ error }` collapse, and today that
outer catch is never reached by any of these four calls in normal operation. D-08 exists precisely
because `Promise.all` would make that "never throws" comment into a load-bearing invariant.

**Recommended restructure** (RESEARCH.md's illustrative diff, verified consistent with the
verbatim shape above — the planner should treat variable naming, not structure, as open):
```javascript
const kmlRows = Object.values(PRODUCT_REGISTRY).filter((row) => row.kind === "kml-advisory");

const members = [
  { id: "excessiveRain", run: () => this._runArcGisDayProduct(PRODUCT_REGISTRY.excessiveRain, loc, catComparator, productToggles) },
  { id: "winterImpact",  run: () => this._runArcGisDayProduct(PRODUCT_REGISTRY.winterImpact, loc, catComparator, productToggles) },
  { id: "hazardsOutlook", run: () => this._runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook, loc, productToggles) },
  { id: "heatRisk",      run: () => this._runHeatRiskProduct(PRODUCT_REGISTRY.heatRisk, loc, productToggles) },
  ...kmlRows.map((row) => ({
    id: row.id,
    run: async () => {
      const r = await this._runKmlAdvisoryRow(row, lat, lon, productToggles);
      return { entries: r.entries, anyStale: r.anyStale };
    }
  }))
];

const memberTimings = {};
const settleStart = this._nowMs();
const settled = await Promise.allSettled(members.map(async (m) => {
  const t0 = this._nowMs();
  try {
    return await m.run();
  } finally {
    memberTimings[m.id] = this._nowMs() - t0;
  }
}));

const results = {};
for (let i = 0; i < members.length; i++) {
  const outcome = settled[i];
  if (outcome.status === "fulfilled") {
    results[members[i].id] = outcome.value;
  } else {
    Log.error("MMM-SPCOutlook " + members[i].id + ": runner rejected unexpectedly", outcome.reason);
    anyStale = true;
    results[members[i].id] = { payload: null, entries: [], anyStale: true };
  }
}
Log.info("MMM-SPCOutlook: new-product batch settled in " + (this._nowMs() - settleStart) +
         "ms " + JSON.stringify(memberTimings));

const eroPayload = results.excessiveRain.payload;
if (results.excessiveRain.anyStale) anyStale = true;
// ...winterImpact, hazardsOutlook, heatRisk mirror the above...

const advisories = { spcMD: [], mpd: [] };
for (const row of kmlRows) {
  advisories[row.id] = results[row.id].entries;
  if (results[row.id].anyStale) anyStale = true;
}
```
Load-bearing structural points the planner must preserve: (1) member `run()` closures are built
but not invoked until `Promise.allSettled(members.map(...))`, so nothing awaits sequentially
before the batch; (2) each member's own elapsed time is captured via `_nowMs()` inside a `finally`
(D-10's per-member timing log); (3) a rejection degrades only its own member, never the whole
batch (D-08); (4) `advisories[row.id]` assignment moves to after settlement (D-09).

---

### 6. `_unusableFeatureCount` / `_oldestStaleAt` — write sites, confirmed synchronous (the safety invariant to encode as an acceptance criterion)

**`_unusableFeatureCount`** — two write sites, both a synchronous increment inside a `.forEach()`
callback with **no `await` between the read and the write**:
```javascript
// node_helper.js:1496-1502 (extractPolygons)
} catch (err) {
  Log.error("MMM-SPCOutlook extractPolygons: skipping a feature with unusable geometry in " + context, err);
  this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
  return;
}
```
```javascript
// node_helper.js:1552-1558 (evaluatePolygonsCollectAll)
} catch (err) {
  Log.error("MMM-SPCOutlook evaluatePolygonsCollectAll: containment check failed for " +
            (item.label || item.value || "unlabeled feature"), err);
  this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
  return;
}
```
Sampled start-vs-end in `getSpcOutlook`:
```javascript
// node_helper.js:2348 (start)
const unusableFeaturesAtStart = this._unusableFeatureCount || 0;
...
// node_helper.js:2968 (end)
if ((this._unusableFeatureCount || 0) > unusableFeaturesAtStart) anyStale = true;
```

**`_oldestStaleAt`** — one write site, a synchronous min-reduce, also with no `await` inside it:
```javascript
// node_helper.js:1853-1859 (_noteStaleEntry)
_noteStaleEntry(entry) {
  if (!entry || typeof entry.timestamp !== "number") return;
  if (this._oldestStaleAt === null || this._oldestStaleAt === undefined ||
      entry.timestamp < this._oldestStaleAt) {
    this._oldestStaleAt = entry.timestamp;
  }
},
```
Reset once per run at `node_helper.js:2354` (`this._oldestStaleAt = null;`), before any batch
member's own `try`/`await` chain begins.

**`_inFlight`** — for completeness, confirmed to never enter `getSpcOutlook`'s own call graph:
declared at `node_helper.js:196` (`this._inFlight = false;`), checked/set only at `:1180-1184`
and cleared in a `finally` at `:1263` — all three sites live inside `socketNotificationReceived`,
which wraps the single call to `getSpcOutlook` per invocation; `getSpcOutlook` itself never reads
or writes it.

**Why this is safe under `Promise.allSettled` (checkable acceptance criterion, per RESEARCH.md's
"Concurrency Safety, Verified" section):** JS is single-threaded with run-to-completion semantics;
two concurrently-running `async` functions can only interleave at an `await` boundary, and none of
the five statements above (the two `_unusableFeatureCount` increments, the `_oldestStaleAt`
min-reduce, and their two read sites) contain one. A synchronous statement inside one runner's
`.forEach()` callback cannot be preempted by another runner's continuation. The planner should
state this as its own acceptance criterion line (e.g. "grep confirms no `await` appears between
the read and the write of `_unusableFeatureCount`/`_oldestStaleAt` at any of the five sites above")
rather than merely asserting it, per PERF-01's D-08/D-09 discussion record ("Planning should
**verify** this rather than assume it").

---

### 7. `SUB_TOGGLES` / `buildRequestPayload`'s `products` object — the backend-reaching-toggle shape, and the shape D-02 explicitly departs from

**Backend-reaching product flag (the shape `showHeatRisk` follows):**
```javascript
// MMM-SPCOutlook.js:8-12 (defaults)
showExcessiveRain: false,   // WPC Excessive Rainfall Outlook toggle; every new product flag defaults to false
showWinterImpact: false,    // WPC WSSI Overall Impact toggle; every new product flag defaults to false
showMPD: false,             // WPC Mesoscale Precipitation Discussion toggle; every new product flag defaults to false
showHazardsOutlook: false,  // WPC Day 3-7 / CPC Day 8-14 US Hazards Outlook toggle; every new product flag defaults to false
```
```javascript
// MMM-SPCOutlook.js:51-58 (buildRequestPayload)
products: {
  showExcessiveRain: this.config.showExcessiveRain,
  showWinterImpact: this.config.showWinterImpact,
  showMPD: this.config.showMPD,
  showSPCMD: this.config.showSPCMD,
  showHazardsOutlook: this.config.showHazardsOutlook,
  showDrought: this.config.showDrought
}
```
```javascript
// node_helper.js:32 (SUB_TOGGLES)
const SUB_TOGGLES = ["showDrought"];
```
```javascript
// node_helper.js:244-262 (_productToggles)
_productToggles(products){
  const toggles = {};
  for (const row of Object.values(PRODUCT_REGISTRY)) {
    toggles[row.configFlag] = products?.[row.configFlag] === true;
  }
  for (const flag of SUB_TOGGLES) {
    toggles[flag] = products?.[flag] === true;
  }
  return toggles;
},
```
`showHazardsOutlook` reaches the backend via the registry's `configFlag` mechanism (a row's own
field, iterated automatically — "a Phase 15-17 row needs no edit here"). `showDrought` is a
**sub-toggle**: it has no registry `configFlag` (it gates labels within an already-fetched
product, not a fetch), so it travels through the explicit `SUB_TOGGLES` list instead, added to the
same `products` payload object and read inside the runner via `productToggles.showDrought` at
call time (never baked into the static registry row — 15 D-02).

**The one-line addition for `showHeatRisk`:** add `showHeatRisk: false` to `defaults:` (a new
comment line matching the existing style), give the new `PRODUCT_REGISTRY.heatRisk` row
`configFlag: "showHeatRisk"`, and add `showHeatRisk: this.config.showHeatRisk` to
`buildRequestPayload`'s `products:` object — no `_productToggles` edit needed, matching the
established "registry row, not a hand-written toggle list" discipline.

**The frontend-only shape `showMinorHeat` must follow instead — no existing analog.** Neither
`SUB_TOGGLES` (which still reaches `node_helper.js`, just outside the registry) nor any other
config flag in this codebase today is ever read **exclusively** on the frontend while being
entirely absent from `buildRequestPayload`'s `products` object. `showMinorHeat` is genuinely new
in this respect: it must appear in `defaults:` (frontend config surface) but must **not** appear
in `buildRequestPayload`'s `products` object, must **not** be added to `SUB_TOGGLES`, and
`node_helper.js`/`productRegistry.js` must not reference it anywhere — its only reader is
`heatRiskDaysToRender` inside `getDom()` (Section 8 below). See "No Analog Found."

---

### 8. `getDom()` day-row render loops + the no-risk short-circuit gate (`MMM-SPCOutlook.js:355-406`)

**Full current gate text, every term enumerated** (`MMM-SPCOutlook.js:355-406`, verbatim):
```javascript
!this.spcrisk._stale &&
this.spcrisk.day1.risk == "NONE" &&
this.spcrisk.day2.risk == "NONE" &&
this.spcrisk.day3.risk == "NONE" &&
!hasAnyRenderableProximity(this.spcrisk.day1.proximity) &&
!hasAnyRenderableProximity(this.spcrisk.day2.proximity) &&
!hasAnyRenderableProximity(this.spcrisk.day3.proximity) &&
!( this.config.extended && this.spcrisk.day48Risk ) &&
!(this.spcrisk.fireWeather && (this.spcrisk.fireWeather.day1Risk > 0 || this.spcrisk.fireWeather.day2Risk > 0)) &&
!(this.config.extended && this.spcrisk.fireWeather && (
  this.spcrisk.fireWeather.day3Risk > 0 ||
  this.spcrisk.fireWeather.day4Risk > 0 ||
  this.spcrisk.fireWeather.day5Risk > 0 ||
  this.spcrisk.fireWeather.day6Risk > 0 ||
  this.spcrisk.fireWeather.day7Risk > 0 ||
  this.spcrisk.fireWeather.day8Risk > 0
)) &&
!(this.config.showExcessiveRain && blockHasRisk(this.spcrisk.excessiveRain)) &&
!(this.config.showWinterImpact && blockHasRisk(this.spcrisk.winterImpact)) &&
!(this.config.showHazardsOutlook && hazardsOutlookHasAnyDay(this.spcrisk.hazardsOutlook)) &&
!(this.config.showHazardsOutlook && hazardsOutlookHasWindowEntries(this.spcrisk.hazardsOutlook)) &&
!(enabledAdvisories().length > 0)
```
D-03's new term joins this list, gated the same way every other product's term is:
`!(this.config.showHeatRisk && heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat).length > 0) &&`
— note `showMinorHeat` is threaded as the predicate's **second argument**, read directly off
`this.config`, never off `this.spcrisk` (it never crossed the wire).

**The shared-predicate precedent to copy exactly** (`MMM-SPCOutlook.js:313-323`):
```javascript
const hazardsOutlookHasAnyDay = (block) => {
  if (!block || typeof block !== "object") return false;
  const dayKeys = Object.keys(block).filter((k) => /^day\d+$/.test(k));
  for (const key of dayKeys) {
    if (renderableDayHazards(block[key]).length > 0) return true;
  }
  return false;
};
const hazardsOutlookHasWindowEntries = (block) => renderableWindowEntries(block).length > 0;
```
This is the **third** phase running to prove out "one predicate feeds both the gate and the
render loop" (Phase 15 shipped the MPD-invisible defect this pattern exists to prevent; Phase 16
had to add two independent terms because it renders two independently-populatable regions).
HeatRisk renders one region (a day grid, no separate window band), so it needs exactly one new
predicate and one new gate term — simpler than Hazards Outlook's two, but the "derive both from
one expression" discipline is identical.

**The simpler single-predicate precedent** (`MMM-SPCOutlook.js:229-242`), closer to HeatRisk's
actual shape (no `Risk`-suffix keys, day span read off the block's own keys):
```javascript
const dayRiskCount = (block) => {
  if (!block || typeof block !== "object") return 0;
  return Object.keys(block).filter((k) => /^day\d+Risk$/.test(k)).length;
};
const blockHasRisk = (block) => {
  const days = dayRiskCount(block);
  for (let d = 1; d <= days; d++) {
    if (block[`day${d}Risk`] !== "NONE") return true;
  }
  return false;
};
```

**Existing per-product render loops — the `dayNRisk > 0` / `!== "NONE"` guards to mirror:**

ERO/WSSI (generic day-block renderer, `MMM-SPCOutlook.js:522-532`):
```javascript
const renderDayBlock = (label, block) => {
  const days = dayRiskCount(block);
  for (let d = 1; d <= days; d++) {
    if (block["day" + d + "Risk"] !== "NONE") {
      wrapper.innerHTML += label + " (Day " + d + "): <span style=\"color:#" +
        block["day" + d + "Color"] + "\">" +
        block["day" + d + "Text"] + "</span><br/>";
    }
  }
};
```

Fire weather (fixed-key day1/day2 plus an extended-mode `day3..day8` loop, `:496-516`):
```javascript
if (this.spcrisk.fireWeather) {
  if (this.spcrisk.fireWeather.day1Risk > 0) {
    wrapper.innerHTML += "Fire Wx (Day 1): <span style=\"color:#" +
      fireRiskToColor[this.spcrisk.fireWeather.day1Risk] + "\">" +
      this.spcrisk.fireWeather.day1Text + "</span><br/>";
  }
  if (this.spcrisk.fireWeather.day2Risk > 0) { /* identical shape for day2 */ }
  if (this.config.extended) {
    for (let d = 3; d <= 8; d++) {
      if (this.spcrisk.fireWeather["day" + d + "Risk"] > 0) {
        wrapper.innerHTML += "Fire Wx (Day " + d + "): <span style=\"color:#" +
          fireRiskToColor[this.spcrisk.fireWeather["day" + d + "Risk"]] + "\">" +
          this.spcrisk.fireWeather["day" + d + "Text"] + "</span><br/>";
      }
    }
  }
}
```

Hazards Outlook's day grid (`:567-595`) is the closest shape match for HeatRisk's own render loop
— nested per-day objects, span derived from the block's own keys, absence-is-silence via
`continue` on an empty per-day array, `escapeHtml`+color-validation on every rendered field. It is
overkill for HeatRisk (no labels, no multi-hazard array per day — just one numeric category), but
its discipline ("derive the span from the payload's own keys, never a literal `1..7`"; "guard
against a missing/non-object block so a throw here cannot take down the whole render") transfers
directly. HeatRisk's own render loop should follow `renderDayBlock`'s flatter shape (one tier per
day, no nesting) more closely than Hazards Outlook's, since its payload has no per-day array.

**Recommended `heatRiskDaysToRender`** (RESEARCH.md's proposal, structurally matching the
predicates above):
```javascript
const heatRiskDaysToRender = (block, showMinorHeat) => {
  if (!block || typeof block !== "object") return [];
  const floor = showMinorHeat === true ? 1 : 2; // D-01
  const days = [];
  for (let d = 1; d <= 7; d++) {
    const day = block["day" + d];
    if (day && typeof day.category === "number" && day.category >= floor) {
      days.push({ d, category: day.category });
    }
  }
  return days;
};
```

---

### 9. Label-to-value tables — DATA-03's mechanical distinctness targets, enumerated by name and file:line

| Product | Table | File:line | Shape |
|---|---|---|---|
| ERO | `eroDnToValue` | `productRegistry.js:85` | `{ 1: 1, 2: 2, 3: 3, 4: 4 }` — ERO's own lowercase `dn` field |
| ERO | `eroValueToTier` / `eroTierToText` / `eroTierToColor` | `productRegistry.js:87-92` | value→tier→text/color chain |
| Fire weather | `dnToFireValue` | `node_helper.js:2687` | `{ 5: 1, 8: 2, 10: 3 }` — fire weather's own **uppercase** `DN` field, structurally distinct keys from ERO's `dn` (ERO-02's own named trap) |
| Fire weather | `fireRiskToValue` | `node_helper.js:2683` | `{ ELEV: 1, CRIT: 2, EXTM: 3 }` |
| Fire weather | `fireRiskToColor` | `MMM-SPCOutlook.js:160` | `{ 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" }` |
| WSSI | `wssiRawToValue` | `productRegistry.js:103` | `{ "WINTER WEATHER AREA": 1, MINOR: 2, MODERATE: 3, MAJOR: 4, EXTREME: 5 }` |
| WSSI | `wssiValueToTier` (+ `wssiTierToText`/`wssiTierToColor`, adjacent) | `productRegistry.js:105` | value→tier chain, `productRegistry.js:186-190` region for the palette-citation comment |
| SPC categorical | `riskToValue` / `valueToRisk` (frontend) / `riskToColor` | `node_helper.js:2396`, `:2402`; `MMM-SPCOutlook.js:36-38` | `{ TSTM:1, MRGL:2, SLGT:3, ENH:4, MDT:5, HIGH:6 }` and its inverse/color chain — the original, pre-registry table every newer product's shape descends from |
| MPD / spcMD (`kml-advisory`) | **no value/tier/color map at all** — `toEntry(feature, ctx)` (`productRegistry.js:337-379`) composes a `{ label, hazardType }` string pair directly, no numeric ladder | `productRegistry.js:354-358` (spcMD), `:373-378` (mpd) | Confirms `kml-advisory` rows are legitimately exempt from `MAP_FIELDS` — nothing to check |
| Hazards Outlook | `hazardsExcludedLabels` / `hazardsDroughtLabels` / `hazardsExcludedLabelKeys` / `hazardsDroughtLabelKeys` / `hazardsOrder` / `hazardsDisplayColor` | `productRegistry.js:393-402` (row fields, constants declared above `:266`) | Label-set/order/color maps, **no** `valueToTier`/`tierToText`/`tierToColor` — "this product has no severity ladder anywhere in its schema" (row's own comment, `:446-448`) |
| **HeatRisk (new, this phase)** | **none** — raw numeric `0`–`4` category straight off the service, no vocabulary table of any kind | n/a | Per RESEARCH.md's DATA-03 analysis: "HeatRisk itself introduces no label-to-value map at all... it cannot itself be a DATA-03 violation source, but its registry row still needs the identity assertion applied to every OTHER row's maps" |

**D-11's mechanical assertion** (RESEARCH.md's full proposed implementation, the fourth load-time
validator beside `daySpanOf`/`dayRangeOf`/`dayRangeSpanning`):
```javascript
const MAP_FIELDS = ["valueToTier", "tierToText", "tierToColor", "displayColor",
                     "excludedLabels", "droughtLabels", "excludedLabelKeys", "droughtLabelKeys"];
function assertNoSharedRegistryMaps(registry) {
  const seen = new Map(); // object identity -> row id
  for (const [rowId, row] of Object.entries(registry)) {
    for (const field of MAP_FIELDS) {
      const value = row[field];
      if (value === undefined || value === null) continue;
      const prior = seen.get(value);
      if (prior) {
        throw new Error(
          `productRegistry: rows "${prior}" and "${rowId}" share the SAME ${field} object ` +
          `by reference — this is DATA-03's exact failure shape (a label-to-value mapping ` +
          `reused across products). Give "${rowId}" its own ${field}.`
        );
      }
      seen.set(value, rowId);
    }
  }
}
assertNoSharedRegistryMaps(PRODUCT_REGISTRY); // called at module load, same as daySpanOf(...) calls above
```
**What this table makes mechanical rather than subjective:** a reviewer no longer needs to "spot
check" — the table above enumerates every actual map object by name, and `assertNoSharedRegistryMaps`
throws with both offending row ids named if any two share object identity. **What identity cannot
see (must be paired with the spot-check per D-11):** `dnToFireValue`'s and `eroDnToValue`'s keys
are numerically **overlapping but semantically distinct** (`dnToFireValue[5]=1` vs
`eroDnToValue... [no key 5 at all]`) — a `toValue` closure that read a **foreign constant by
name** (e.g. a hypothetical `heatRisk.toValue` mistakenly closing over `dnToFireValue` instead of
its own table) would pass the identity check (different object) while still being wrong. The
table above is the recorded spot-check artifact D-11 requires alongside the assertion.

---

### 10. Probe-suite scenario format — a mutation-proven `hazards-*` scenario, verbatim

**Analog:** `hazards-data-age-sets-the-badge-but-not-the-age-figure`
(`scripts/probe-payload-resilience.js:4939-5014`), full text read this session — chosen because it
is the direct structural analog for D-07's `maxDataAgeHours` check (per RESEARCH.md's own mapping
in the Phase Requirements → Scenario Map table), and because it demonstrates every element 15
D-10 requires: a precondition guard, the primary assertion, and a control assertion proving the
primary assertion is not vacuous.

```javascript
// scripts/probe-payload-resilience.js:4938
{
  // D-15's deliberate asymmetry: a data-age trip sets the ⚠ badge (`_stale`) but must
  // NOT drag `_staleAsOf` along with it — that field describes FETCH/network recency
  // (Phase 14 D-04), not WPC's own publish age, and a 60+ hour-old hazards file must not
  // make the badge speak for SPC data fetched five minutes ago.
  name: "hazards-data-age-sets-the-badge-but-not-the-age-figure",
  run: async (helper) => {
    const maxAgeHours = PRODUCT_REGISTRY.hazardsOutlook.maxDataAgeHours;
    const nowMs = HAZARDS_NOW_MS;
    const staleFiledate = nowMs - (maxAgeHours + 5) * 60 * 60 * 1000;

    const originalPointInPolygon = turfStub.pointInPolygon;
    try {
      resetHelper(helper);
      resetLogs();
      turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
      helper._nowMs = () => nowMs;
      helper._products = { showHazardsOutlook: true };
      const agedBody = () => httpResponse({
        body: hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29), filedate: staleFiledate })
        ]),
        etag: "hazards-d15-v1"
      });
      installHttp(helper, hazardsRoutes({ 4: agedBody }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
      assertPayloadIntact(out);
      assertHazardsBlockIntact(out);
      // Primary assertion — the mutation this scenario is provable against: revert the
      // per-item age check and this throws.
      if (out._stale !== true) {
        throw new Error(`precondition failed: expected the aged-out layer to set _stale, got ${out._stale}`);
      }
      // D-15's asymmetry, the scenario's actual named subject:
      if (out._staleAsOf !== null && out._staleAsOf !== undefined) {
        throw new Error(
          "D-15: a data-age trip dragged _staleAsOf along with it — this would make the badge speak for SPC " +
          `data fetched moments ago while describing a WPC file up to ${maxAgeHours}h old, got _staleAsOf=${out._staleAsOf}`
        );
      }

      // Control: a genuine fetch failure (warm, then fail within the stale-fallback
      // window) must leave a NUMERIC _staleAsOf via _noteStaleEntry's stale-fallback
      // path — proving the assertion above measures D-15's deliberate omission and not a
      // _staleAsOf this harness simply never populates under any condition.
      resetHelper(helper);
      resetLogs();
      turfStub.pointInPolygon = () => true;
      helper._nowMs = () => nowMs;
      helper._products = { showHazardsOutlook: true };
      const freshBody = () => httpResponse({
        body: hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29) })
        ]),
        etag: "hazards-d15-control-v1"
      });
      installHttp(helper, hazardsRoutes({ 4: freshBody }));
      const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
      if (warm._stale) {
        throw new Error("control warm-up: an all-fresh poll was unexpectedly flagged stale");
      }
      helper._updateInterval = 60;
      const entry = helper._geoJsonCache.get(HAZARDS_URLS[4]);
      if (!entry) throw new Error("control warm-up: no cache entry for the hazards layer-4 URL");
      entry.timestamp = Date.now() - 65 * 60 * 1000; // within the 2x-interval stale-fallback window
      installHttp(helper, hazardsRoutes({ 4: () => httpResponse({ status: 503, text: "service unavailable" }) }));
      const failed = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
      if (typeof failed._staleAsOf !== "number") {
        throw new Error(
          `control: a genuine fetch failure did not leave a numeric _staleAsOf — got ${failed._staleAsOf}, ` +
          "which would make the primary assertion above vacuous"
        );
      }
    } finally {
      turfStub.pointInPolygon = originalPointInPolygon;
    }
  }
},
```

**The two fixture-builder helpers this scenario (and every hazards/heatrisk scenario) depends on:**
```javascript
// scripts/probe-payload-resilience.js:755
function hazardsRoutes(overrides = {}) {
  const okEmpty = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "hazards-empty-v1" });
  const routes = [];
  for (const layer of PRODUCT_REGISTRY.hazardsOutlook.layers) {
    routes.push([HAZARDS_URLS[layer.id], overrides[layer.id] || okEmpty]);
  }
  routes.push(
    [ERO_URLS[1], okEmpty], [ERO_URLS[2], okEmpty], [ERO_URLS[3], okEmpty],
    [ERO_URLS[4], okEmpty], [ERO_URLS[5], okEmpty],
    [WSSI_URLS[1], okEmpty], [WSSI_URLS[2], okEmpty], [WSSI_URLS[3], okEmpty],
    [".lyr.geojson", okEmpty]
  );
  return routes;
}

// scripts/probe-payload-resilience.js:778
function hazardsFeature({ label, startDate, endDate, filedate }) {
  return {
    type: "Feature",
    properties: {
      label,
      start_date: startDate,
      end_date: endDate,
      idp_filedate: filedate !== undefined ? filedate : startDate
    },
    geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
  };
}
```
`hazardsRoutes`'s "every OTHER layer/product answers 200-with-quiet-default" discipline
(WR-02's named trap, repeated in every prior phase's scenario set) is exactly the shape a new
`heatRiskRoutes(overrides)` helper must follow: every route that is NOT the scenario's subject —
including, critically, the HeatRisk identify URL itself when a non-HeatRisk scenario is running,
and every ERO/WSSI/hazards/advisory URL when a HeatRisk scenario is running — must answer quietly
so `anyStale` can only be set by the scenario's own intended mutation.

**Scenario registration is a flat array literal** (`scripts/probe-payload-resilience.js:991`,
`const scenarios = [`), iterated by `main()` (`:5075-5083`, `for (const scenario of scenarios)`)
— a new `heatrisk-*` scenario is one more `{ name, run }` object literal appended to this array,
no registration step elsewhere.

**Precondition-guard idiom, named explicitly in this codebase's own comments** (15 D-10's own
named preventative, applied here): note the earlier `hazards-*` scenario in this file (immediately
above the one excerpted, `:4880-4889`) that throws *before* its main assertion if
`windowBand.length !== 0` or any `day{N}.hazards.length !== 0` — "so 'stale' cannot be explained by
a match having been found after all." Every new HeatRisk scenario with a compound condition
(D-04's partial-vs-all `NoData`, D-05's tail-vs-interior gap) must carry an equivalent guard
proving the fixture actually exercises the intended branch, not an adjacent one.

## Shared Patterns

### Structural reuse over copy-paste (WR-06's twice-cited lesson)
**Source:** `fetchGeoJsonCached`'s injected-validator design (Section 1); `_cacheHazardMatches`'s
whitelist reuse (Section 3)
**Apply to:** every HeatRisk edit that touches shared infrastructure — the transport/cache layer
gets one signature change, not a parallel `fetchHeatRiskCached`; the cache-write contract is a
sibling of `_cacheHazardMatches`'s pattern, not a hand-rolled new one.

### Per-item containment, "a contained throw is a degrade, not a clean read" (CR-01/CR-02)
**Source:** `_runArcGisDayProduct`'s per-day catch (`node_helper.js:348-356`),
`evaluatePolygonsCollectAll`'s per-item catch (`:1550-1559`)
**Apply to:** `_runHeatRiskProduct`'s zip/dedupe/bucket pipeline — a malformed catalog item must
be dropped, not thrown, exactly as `_hazardMatchesFromHits` already drops a malformed hit
(`typeof startDate !== "number"` → `continue`); D-06's own precondition guard on
`properties.Values.length !== catalogItems.features.length` is this same discipline applied at
the pipeline's entry rather than per-item.

### Absence is silence (ERO-03, 15 D-09) — refined by D-04/D-05's position-aware branches
**Source:** stated as a general rule across every prior phase's pattern map; exercised by
`extractPolygons`/`_runKmlAdvisoryRow` returning empty arrays, never placeholder rows
**Apply to:** HeatRisk's own render loop (`heatRiskDaysToRender` returns `[]`, not a "None" row,
for a day below the floor) — with D-04/D-05 as the two compound refinements ("when is silence
honest vs. when does it hide a failure") that must each be mutation-proven separately.

### The all-clear is an assertion, not a default (D-03's own framing, third time running)
**Source:** `hazardsOutlookHasAnyDay`/`hazardsOutlookHasWindowEntries` (`MMM-SPCOutlook.js:313-323`)
and the gate terms that consume them (`:393-394`); Phase 15's shipped MPD-invisible defect
**Apply to:** `heatRiskDaysToRender`, threaded identically into both the gate term and the render
loop — a Level-1 day with `showMinorHeat` off must render nothing AND must not suppress the
all-clear, the same disagreement class every prior product's gate term had to get right.

### A latency fix must not buy speed with a new outage class (D-08)
**Source:** RESEARCH.md's "Concurrency Safety, Verified" section; `Promise.allSettled` batch
design (Section 5)
**Apply to:** the PERF-01 restructure as a whole — `Promise.all` would convert every runner's
"documented to never throw" comment into a load-bearing invariant, which is how this codebase's
worst findings (WR-06, CR-01, the MPD gate) have historically arrived.

### Error logging with the `MMM-SPCOutlook` prefix
**Source:** every `Log.error(...)` call site cited above (e.g. `node_helper.js:2118`, `:1500`,
`:1555`)
**Apply to:** every new log line in `_runHeatRiskProduct`, the batch's per-member rejection log,
and the identity assertion's throw message — `Log.error("MMM-SPCOutlook <function>: <what
happened>", err)`, matching house style exactly.

## No Analog Found

| File/Symbol | Role | Data Flow | Reason |
|---|---|---|---|
| The `showMinorHeat` frontend-only config-read shape (never in `buildRequestPayload`'s `products` object, never in `SUB_TOGGLES`, never reaches `node_helper.js`) | config | transform (frontend-only) | Every existing config flag in this codebase either reaches the backend as a registry `configFlag` (`showHazardsOutlook`) or as a `SUB_TOGGLES` sub-toggle (`showDrought`) — both cross the wire. `showMinorHeat` is the first flag whose entire contract is "exists in `defaults:`, read only inside `getDom()`'s own predicate." No prior code to copy; RESEARCH.md's `heatRiskDaysToRender(block, showMinorHeat)` sketch (Section 8) is the reference implementation, not a codebase analog. |
| `fetchGeoJsonCached`'s injected-validator idiom itself (an optional parameter defaulting to preserve every existing caller's behavior) | utility (transport) | request-response | No other function in this file uses an optional-parameter-with-behavior-preserving-default pattern to generalize a hardcoded check — this is the first. The "structural reuse over duplication" *instinct* has ample precedent (WR-06, `_cacheHazardMatches` vs. `_runArcGisDayProduct`'s cache write), but the specific *mechanism* (inject a validator function) is new to this codebase. |
| A deferred-resolution `_fetch` stub for the PERF-01 overlap scenario | test infrastructure | event-driven | Confirmed by RESEARCH.md's own "Wave 0 Gaps" list: no existing helper in `scripts/probe-payload-resilience.js` supports a manually-triggered promise resolution. Every existing `installHttp`/`installFetch` route resolves synchronously or via a plain `async` function that resolves immediately — none can hold a request open until the scenario explicitly releases it, which is exactly what proving "a later member's request is issued before an earlier member's response resolves" (D-10) requires. This is new harness code, not a reuse. |
| A `Promise.allSettled` fan-out anywhere in this codebase | controller | batch | `node_helper.js:2921-2963` (Section 5) is the first place in this file any concurrent batching is attempted — every other multi-step sequence in `getSpcOutlook` (the ~25-hop SPC/fire-weather chain, explicitly out of scope this phase) and every runner's own internal per-day/per-layer loop is sequential `await`. The restructure is self-referential (before/after of the same block), not copied from elsewhere in this codebase. |

## Conventions

Convention derivation via the shared `gsd-tools.cjs` module was attempted and skipped: no
`gsd-plugin` cache directory (`~/.claude/plugins/cache/gsd-plugin/bm/*/`) was found on this
machine, and `CLAUDE_PLUGIN_ROOT` is unset — the same environment gap 16-PATTERNS.md recorded.
Falling back, as that phase did, to direct observation of this session's own reads plus
`.planning/codebase/CONVENTIONS.md`'s already-authored prose:

| Axis | Dominant | Notes |
|---|---|---|
| File-name casing | camelCase (`node_helper.js`, `productRegistry.js`, `MMM-SPCOutlook.js`) | Three files, three different casings, all pre-existing and fixed by MagicMirror's own module-loading convention (`node_helper.js` is a required filename, `MMM-SPCOutlook.js` matches the module's registered name) — not a repo-wide choice to enforce, nothing new in this phase touches naming |
| Identifier casing | camelCase (functions/variables), `SCREAMING_SNAKE_CASE` for true module-level constants (`ERO_BASE_URL`, `HEATRISK_BASE_URL`, `MS_PER_DAY`, `SUB_TOGGLES`) | Consistent across all three files read this session; every new symbol proposed in RESEARCH.md (`_runHeatRiskProduct`, `buildHeatRiskIdentifyUrl`, `heatRiskDaysToRender`, `HEATRISK_BASE_URL`) already follows this split |
| Export style | CJS (`module.exports = { ... }`, `productRegistry.js:453-455`); `Module.register(...)` (MagicMirror's own frontend registration idiom, `MMM-SPCOutlook.js:1`) | No ESM anywhere in this repo; no dual-resolver split exists (single CJS backend module, no `sdk/`, no `bin/lib/`) |
| Import style | `const X = require("./productRegistry")`-shaped, no barrel files, no path aliases | Matches `node_helper.js`'s own `const NodeHelper = require("node_helper");` at the top of the file |

**Contested hotspots:** none identified. This is a small, single-package, no-build-step
MagicMirror module with three source files and one probe script family; there is no CJS↔ESM
dual-resolver split (the prototype intentional-contested-split pattern this section normally
documents, e.g. a `bin/lib/**` CJS half vs. an `sdk/src/**` ESM half) anywhere in this repository.
Every axis above sits at or near 100% dominance with no per-directory variance to reconcile.

## Metadata

**Analog search scope:** `node_helper.js` (targeted reads verified against RESEARCH.md's own
citations: `:1-70`, `:130-270`, `:280-460`, `:1170-1270`, `:1440-1600`, `:1810-1920`,
`:2030-2270`, `:2330-2400`, `:2680-2700`, `:2890-2970`, plus `grep`-located line-number
cross-checks for every symbol named in the pattern targets; full file is 3135 lines);
`productRegistry.js` (full read, 456 lines); `MMM-SPCOutlook.js` (targeted reads: `:1-70`,
`:225-650`; full file is 681 lines); `scripts/probe-payload-resilience.js` (targeted reads:
`:31-90`, `:480-790`, `:4880-5085`; scenario-array structure confirmed via `grep`; full file is
5117 lines); `scripts/probe-lib/module-stubs.js` (targeted read via `codegraph_explore`,
`:1-130`; full file is 318 lines, not fully read — no new symbol from the pattern targets lives
here beyond the existing seam-reset machinery already documented in RESEARCH.md's Probe Harness
table)
**Files scanned:** 5 (4 source files, 1 probe script; `.codegraph/` index present but did not
resolve `node_helper.js`'s large-function symbols directly — `grep`+`Read` used as the reliable
fallback for this file, consistent with the tool's own documented gap-filling behavior)
**Pattern extraction date:** 2026-08-31
