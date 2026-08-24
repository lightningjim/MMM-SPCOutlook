---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
reviewed: 2026-08-24T20:36:10Z
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
  warning: 10
  info: 9
  total: 22
status: issues_found
---

# Phase 15: Code Review Report

**Reviewed:** 2026-08-24T20:36:10Z
**Depth:** deep (cross-file: import graph + call chains across `productRegistry.js` → `node_helper.js` → `MMM-SPCOutlook.js`, plus the probe harness)
**Files Reviewed:** 5
**Status:** issues_found

## Summary

Phase 15 added the WPC WSSI (`winterImpact`) and WPC MPD (`mpd`) products by generalising two runners in `node_helper.js` — `_runArcGisDayProduct` for `arcgis-day-layers` rows and `_runKmlAdvisoryRow` + `_advisoryDiscovery` for `kml-advisory` rows — driven off `PRODUCT_REGISTRY`. The registry/runner contract is broadly clean: `days`, `buildUrl`, `toValue`, `includesFeat`, `valueToTier`, `tierToText`, `tierToColor`, `validTimeField` are all consumed exactly as declared, cache keys are per-URL and per-product with no collision, the WSSI case fold is correct, the MINOR floor in `includesFeat` genuinely prevents WWA from ever reaching `evaluatePolygons`, and `parseMpdValidEnd`'s month-roll edge case is handled. The probe suite runs green (32 passed, 0 failed, 0 skipped) on this checkout.

The defects are concentrated in one place: **the codebase states an invariant — "a degrade the user cannot see is indistinguishable from a genuine all-clear, and that false negative is the one outcome this product exists to prevent" — in at least eight comments, and three code paths break it.** All three are reproduced below with executable proof, not inferred:

1. `_runArcGisDayProduct`'s per-day `catch` logs and returns to the no-risk default **without setting `anyStale`**. A thrown error in the ERO or WSSI day loop renders as a confident `"No Severe Weather Risk"` with no ⚠ badge. The probe scenario that covers this path (`ero-fetch-throws`) asserts the log line but not `_stale`, so the suite is green on the defect.
2. `fetchGeoJsonCached` reads the response body (`await res.text()`) **outside** its `try`. A mid-body abort — which is exactly what the phase's own 15 s `AbortSignal.timeout` produces when headers arrive but the body stalls — escapes every per-layer guard and collapses the entire payload to `{ error }`, bypassing the stale-fallback machinery the same function exists to provide.
3. `_prepareMpdEntry`'s filename-number fallback is gated on `number === null`, but `extractMpdField` returns `""` (not `null`) for a present-but-empty `<td>`, so an active MPD covering the user is silently dropped — the exact failure class the surrounding comment claims to prevent.

Secondary themes: the `kml-advisory` fetch path has real but unenforced resource bounds (`fetchBinBuffer` is unbounded; the listing's 4 MB "security control" runs after the body is already in memory; the KMZ 8 MB check trusts an attacker-declared header field), the MPD listing's degraded-truncation heuristic keeps the wrong end of the list, and the registry→frontend contract is registry-driven on the backend but hardcoded on the frontend.

Payload-shape guarantees the frontend depends on (`excessiveRain`, `winterImpact`, `advisories.{spcMD,mpd}` always present regardless of toggle) hold in `getSpcOutlook`, but the probe's shared oracle `assertPayloadIntact` only checks the ERO block, so the two blocks Phase 15 added are unguarded by the shared contract check.

## Critical Issues

### CR-01: `_runArcGisDayProduct`'s per-day catch degrades to no-risk without setting `anyStale`

**File:** `node_helper.js:211-213`
**Issue:** Every other degrade path in this file folds into `anyStale` — `fetchResult.stale || fetchResult.failed` at line 176, `_unusableFeatureCount` at line 1931, `_runKmlAdvisoryRow`'s per-candidate catch at line 439, the discovery `failed` flag. The `arcgis-day-layers` runner's own catch is the one exception: it logs and leaves the day at `"NONE"` with no staleness signal at all. Because `"NONE"` is byte-identical to a genuine all-clear, the frontend's no-risk gate (`MMM-SPCOutlook.js:170-219`) short-circuits and renders a confident `"No Severe Weather Risk"` with no ⚠ badge.

This is reachable in production, not theoretical: `fetchGeoJsonCached` itself throws on an unguarded `await res.text()` (see CR-02), `row.buildUrl(d)` throws on a bad layer id, `turf` throws inside `checkInPolygon`/`evaluatePolygons`, and `this._geoJsonCache.set` can throw. Any of them lands here.

Reproduced against the real helper via the probe harness (one ERO day throws, every other layer returns a clean empty collection):

```
POC1 ero day1Risk: NONE | _stale: undefined
POC1 rendered: "No Severe Weather Risk"
```

**Fix:** Set the same flag every other degrade path sets. Because the throw can happen before or after the `fetchResult.stale || fetchResult.failed` line, the catch must raise it independently.

```js
        } catch (err) {
          // A contained throw is a degrade, not a clean read — the day resolves to
          // no risk, which is indistinguishable from a genuine all-clear unless the
          // payload says so (D-04).
          anyStale = true;
          Log.error(`MMM-SPCOutlook ${row.id} day ${d}: fetch/parse/evaluate failed, leaving day at no risk`, err);
        }
```

Then tighten the covering scenario (see WR-06) so the gap cannot reopen.

### CR-02: response body is read outside `fetchGeoJsonCached`'s error containment — a mid-body failure nulls the whole payload

**File:** `node_helper.js:1136`
**Issue:** `fetchGeoJsonCached` wraps only `this._fetch(...)` in `try/catch` (lines 1093-1110). The body read at line 1136, `const rawText = await res.text();`, is unguarded. A connection reset, a truncated chunked response, or an `AbortError` after response headers have arrived therefore:

- never reaches the network-error branch's stale fallback at lines 1095-1100, so a still-fresh cached reading is discarded even though one exists;
- never reaches `rejectBody`, so nothing is logged naming the URL;
- for the SPC categorical/hazard/CIG/fire/Day 4-8 blocks (which have no per-layer `try`), propagates all the way to `getSpcOutlook`'s shared catch at line 2043 and turns the entire payload into `{ error }` — days 1-8, fire weather, ERO, WSSI and advisories gone together over one layer.

This directly contradicts the file-header comment at lines 3-8, which asserts "The AbortError lands in each call site's existing catch, which already routes it to the stale-fallback / hard-failure path." That is true for the connect phase and false for the body-read phase, and `AbortSignal.timeout(15000)` fires during whichever phase is slow.

Reproduced against the real `getSpcOutlook` with the day-1 categorical layer answering `ok: true` and rejecting on `text()`:

```
POC5 payload keys: error | error: Error: ECONNRESET while reading body
```

**Fix:** Contain the body read in the same branch that already owns network-failure policy.

```js
    // HTTP 200 — read raw text. A reset/abort mid-body is a network failure, not a
    // parse failure, and must take the same stale-fallback path as a failed connect.
    let rawText;
    try {
      rawText = await res.text();
    } catch (err) {
      if (entry && this._isWithinStaleWindow(entry.timestamp, this._updateInterval)) {
        Log.info('MMM-SPCOutlook: stale fallback for ' + url);
        this._noteStaleEntry(entry);
        return { data: null, cachedResult: entry.result, stale: true };
      }
      Log.error('MMM-SPCOutlook: unrecoverable fetch failure for ' + url +
                ' (body read failed: ' + (err && err.message ? err.message : err) + ')');
      return { data: null, cachedResult: null, stale: false, failed: true };
    }
    const newEtag = res.headers.get('etag');
```

Add a probe scenario driving `installHttp` with a `text: async () => { throw ... }` response — the harness already supports it, and no current scenario covers it.

### CR-03: an empty `MPDNumber` cell silently drops an active MPD covering the user

**File:** `node_helper.js:495-505`, `productRegistry.js:188-193`
**Issue:** `extractMpdField` (line 843) returns `m[1].trim()` on a match, which is `""` — not `null` — when the description table carries `<td>MPDNumber</td><td></td>`. `_prepareMpdEntry` guards the filename fallback with `if (number === null)`, so `""` skips the fallback entirely, `ctx.number` is `""`, and `PRODUCT_REGISTRY.mpd.toEntry`'s `if (!number) return null` discards the entry. `_runKmlAdvisoryRow` then logs `"covers the location but carries no name"` and `continue`s — **and does not set `anyStale`**, so the user sees no advisory and no ⚠.

The comment at lines 497-500 states the intended contract explicitly: "a covering MPD is never dropped merely for an unreadable MPDNumber field." An empty cell is an unreadable field, and the code violates its own stated guarantee. The false-negative class is the one MPD-01/MPD-04 exist to prevent.

Reproduced:

```
POC2 extractMpdField(empty cell) = ""  -> mpdNumber !== null so filename fallback is skipped
POC2 toEntry -> null
```

**Fix:** Treat any falsy/blank number as unreadable, at the one place that decides.

```js
    let number = this.mpdNumber(feature);
    if (typeof number !== "string" || number.trim() === "") {
      const m = /MPD_(\d+)_final\.kmz/.exec(url);
      if (m) {
        number = m[1];
        Log.error(`MMM-SPCOutlook: mpd MPDNumber unparseable, falling back to filename number: ${url}`);
      } else {
        number = null;
      }
    }
```

Optionally normalise at the source instead — `extractMpdField` returning `null` for a blank cell would fix this and `mpdHazardType` together — but that changes the shared reader's contract, so prefer the caller-side fix plus a probe fixture with an empty `MPDType`/`MPDNumber` cell (the existing `mpdKml` builder only ever omits the row, never emits it empty, so this shape is currently untested).

## Warnings

### WR-01: the MPD listing's degraded truncation keeps the *oldest* candidates, not the newest

**File:** `node_helper.js:352-361`
**Issue:** The comment justifies `urls.slice(-ADVISORY_MAX_CANDIDATES)` with "Apache lists alphabetically, so the tail of document order is the highest-numbered entries." That is false across digit-count boundaries, which is the normal state of this directory (numbers run 1…1200+ within a season). Alphabetically, `MPD_999_final.kmz` sorts *after* `MPD_1200_final.kmz`:

```
POC4 alphabetical tail(3): MPD_999_final.kmz, MPD_99_final.kmz, MPD_9_final.kmz | highest actual: MPD_1200_final.kmz
```

So in the exact scenario this branch exists for (WPC changes the listing format, every timestamp becomes unparseable, the fail-open rule admits 1000+ candidates), the code fetches the 60 *lowest*-numbered — the oldest MPDs of the season — and never fetches the currently active ones. It is flagged `failed: true` so the run shows ⚠, which limits the blast radius, but the heuristic actively selects the wrong end.

It is also inconsistent with `_runKmlAdvisoryRow:405`, which truncates with `slice(0, N)` — the opposite end — for the `spc-active-index` path.

**Fix:** Sort numerically on the captured MPD number before truncating, and make both truncation sites agree:

```js
      if (urls.length > ADVISORY_MAX_CANDIDATES) {
        Log.error(...);
        const numOf = (u) => { const m = MPD_FILENAME_PATTERN.exec(u.split("/").pop()); return m ? Number(m[1]) : -1; };
        urls = urls.sort((a, b) => numOf(a) - numOf(b)).slice(-ADVISORY_MAX_CANDIDATES);
        failed = true;
      }
```

### WR-02: `fetchBinBuffer` has no response-size bound, and the listing's 4 MB bound cannot prevent what it documents

**File:** `node_helper.js:616-621`, `node_helper.js:290-295`
**Issue:** `fetchBinBuffer` does `Buffer.from(await res.arrayBuffer())` with no `Content-Length` check and no byte cap. It is called up to `ADVISORY_MAX_CANDIDATES` (60) times per poll, on URLs whose *paths* come from remote documents (a NetworkLink `href` for SPC MD, a directory listing for MPD). A hostile or malfunctioning upstream serving a multi-gigabyte body OOM-kills the MagicMirror process on a Raspberry Pi. This is the same class of control the sibling path calls out explicitly at line 291 ("a security control, not tidiness") — the KMZ path simply has none.

Separately, the listing's own control at line 292 checks `text.length > 4 * 1024 * 1024` *after* `await res.text()` has already materialised the whole body in memory. Post-hoc length inspection cannot bound memory; it only bounds the regex scan.

**Fix:** Check `Content-Length` before reading, and stream-bound the read:

```js
  async fetchBinBuffer(url, maxBytes = 8 * 1024 * 1024){
    const res = await this._fetch(url, withTimeout({ redirect: "error", size: maxBytes }));
    if(!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`Refusing oversized body for ${url}: ${declared} > ${maxBytes}`);
    }
    return Buffer.from(await res.arrayBuffer());
  },
```

node-fetch v2 supports the `size` option natively (it rejects with a `FetchError` once the cap is exceeded mid-stream), so passing `size` on the listing fetch at line 279 gives that path a real bound too.

### WR-03: the KMZ 8 MB decompression bound trusts an attacker-declared header field

**File:** `node_helper.js:670-674`
**Issue:** `entry.header.size` is the *declared* uncompressed size from the ZIP local/central header. A hostile archive controls that field independently of the actual deflate stream, so declaring `size: 100` on an entry that inflates to gigabytes passes the check and `ZIPper.readFile(entry)` at line 676 inflates it anyway. The comment at lines 655-658 presents this as bounding a decompression bomb; it bounds only an honestly-declared one.

**Fix:** Bound the compressed size as well (a deflate bomb needs a small compressed payload, but the ratio is the real signal), and cross-check the inflated result:

```js
    const declared = entry.header && typeof entry.header.size === "number" ? entry.header.size : 0;
    const compressed = entry.header && typeof entry.header.compressedSize === "number" ? entry.header.compressedSize : 0;
    const MAX_KML_BYTES = 8 * 1024 * 1024;
    if (declared > MAX_KML_BYTES) throw new Error(`KMZ downloaded has an oversized .kml entry: ${declared} bytes`);
    if (compressed > 0 && declared / compressed > 200) {
      throw new Error(`KMZ .kml entry has an implausible compression ratio (${declared}/${compressed})`);
    }
    const buf = ZIPper.readFile(entry);
    if (!buf || buf.length > MAX_KML_BYTES) {
      throw new Error(`KMZ .kml entry inflated beyond the ${MAX_KML_BYTES}-byte bound`);
    }
    return buf.toString();
```

### WR-04: `checkInPolygon` builds turf geometry unguarded — one malformed Placemark hides the valid ones behind it

**File:** `node_helper.js:2065-2082`
**Issue:** `turf.polygon(feature.geometry.coordinates)` (line 2073) and `turf.multiPolygon(...)` (line 2078) throw on a ring with fewer than four positions, on an unclosed ring, and on non-array coordinates — the exact throws `extractPolygons` was hardened against in WR-08 and which `module-stubs.js:53-63` reproduces deliberately. `checkInPolygon` has no such containment, so a single malformed geometry aborts the whole feature scan for that candidate. The throw is caught one level up in `_runKmlAdvisoryRow:437`, which discards the entire advisory (and correctly sets `anyStale`) — but if the malformed Placemark is serialised *before* a valid one that does contain the user, that advisory is lost even though the containing geometry was present and readable.

`extractPolygons` contains this per feature; `checkInPolygon` should match.

**Fix:**

```js
      let poly;
      try {
        if (geomType === "Polygon") poly = turf.polygon(feature.geometry.coordinates);
        else if (geomType === "MultiPolygon") poly = turf.multiPolygon(feature.geometry.coordinates);
        else continue;
      } catch (err) {
        Log.error("MMM-SPCOutlook checkInPolygon: skipping a feature with unusable geometry", err);
        this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
        continue;
      }
      if (turf.booleanPointInPolygon(pt, poly)) return feature;
```

Reusing `_unusableFeatureCount` also makes the drop surface as ⚠ through the existing sampling at line 1931.

### WR-05: the shared payload oracle validates only the ERO block — Phase 15's two new blocks are unguarded

**File:** `scripts/probe-payload-resilience.js:702-764`
**Issue:** `assertPayloadIntact` is called by 25 scenarios and is described as "the D-05 payload contract." It checks `day1`-`day8`, `day48Risk`, `fireWeather` day1-8 keys, and the full `excessiveRain` key set with tier validation. It checks **nothing** about `winterImpact` and **nothing** about `advisories`. Deleting `winterImpact: wssiPayload` or `advisories: advisories` from `getSpcOutlook`'s return object passes this oracle. The only coverage for the winterImpact key count is the single `wssi-toggle-off` scenario's hardcoded `!== 12` check; `advisories` key completeness is never asserted anywhere.

Given D-05's guarantee ("always present, regardless of the toggle") is what the frontend's `advisories.spcMD`/`advisories.mpd` spread relies on (see WR-07), this is the wrong place to leave a hole.

**Fix:** Generalise the block assertion over the registry, keeping `ERO_SUFFIXES` literal as the independent oracle:

```js
  for (const row of Object.values(PRODUCT_REGISTRY)) {
    if (row.kind !== "arcgis-day-layers") continue;
    const block = out[row.id];
    if (typeof block !== "object" || block === null) throw new Error(`assertPayloadIntact: ${row.id} missing`);
    const expected = row.days * ERO_SUFFIXES.length;
    if (Object.keys(block).length !== expected) {
      throw new Error(`assertPayloadIntact: ${row.id} has ${Object.keys(block).length} keys, expected ${expected}`);
    }
    for (let d = 1; d <= row.days; d++) for (const s of ERO_SUFFIXES) {
      if (!(`day${d}${s}` in block)) throw new Error(`assertPayloadIntact: ${row.id}.day${d}${s} missing`);
    }
  }
  if (typeof out.advisories !== "object" || out.advisories === null) throw new Error("assertPayloadIntact: advisories missing");
  for (const row of Object.values(PRODUCT_REGISTRY)) {
    if (row.kind !== "kml-advisory") continue;
    if (!Array.isArray(out.advisories[row.id])) throw new Error(`assertPayloadIntact: advisories.${row.id} is not an array`);
  }
```

Note the registry uses `id: "excessiveRain"` / `"winterImpact"` and the payload uses the same key names, so `out[row.id]` is already the correct lookup.

### WR-06: `ero-fetch-throws` codifies CR-01's gap — it asserts the log but not the staleness

**File:** `scripts/probe-payload-resilience.js:901-925`
**Issue:** This is the only scenario exercising `_runArcGisDayProduct`'s catch. It asserts `day{d}Risk === "NONE"` and `requireLog([...], "fetch/parse/evaluate failed")` — and stops. It never asserts `out._stale`. The suite therefore reports PASS on a payload that presents five silently-failed ERO days as a confident all-clear, which is precisely the outcome every other scenario in the file is written to prevent (`ero-hard-fail-is-flagged`, `wssi-hard-fail-is-flagged`, `mpd-fetch-failure-is-stale-but-zero-results-is-not` all check `_stale`).

The comment at line 920 even says "a contained throw is only acceptable if it is also reported" — reported to the *log*, but not to the *user*, and the user-visible half is the one that matters.

**Fix:** After the loop, add the assertion the sibling scenarios all carry, plus the render-layer proof the WSSI scenarios use:

```js
      if (out._stale !== true) {
        throw new Error("five contained ERO throws produced an unflagged no-risk payload (_stale !== true)");
      }
      const frontend = loadFrontendModule();
      const rendered = renderDom(frontend, { config: { ...cfg, showExcessiveRain: true }, spcrisk: out });
      if (rendered === "No Severe Weather Risk") {
        throw new Error("a silently-degraded ERO run rendered as a confident all-clear");
      }
```

This currently fails (correctly) and passes once CR-01 is fixed.

### WR-07: the frontend spreads `advisories.spcMD`/`advisories.mpd` unguarded, contradicting its own version-skew guard 30 lines above

**File:** `MMM-SPCOutlook.js:250-251`
**Issue:** Line 218 uses `this.spcrisk.advisories?.spcMD?.length > 0` and its comment explicitly states "Optional chaining and the length check tolerate a missing `advisories` key from a helper that predates this shape (version skew)." Thirty lines later, line 251 does `[...advisories.spcMD, ...advisories.mpd]` with no such tolerance. `advisories || { spcMD: [], mpd: [] }` guards only the *outer* object; a payload carrying `advisories` with one key missing throws.

```
POC3 getDom threw: TypeError advisories.mpd is not iterable
```

A throw inside `getDom` breaks the module's entire render, not just the advisory band. The two guards disagree about which failure mode is real, and the harsher one wins.

**Fix:** Make the render tolerate exactly what the gate already tolerates:

```js
      const advisories = this.spcrisk.advisories || {};
      const allAdvisories = [
        ...(Array.isArray(advisories.spcMD) ? advisories.spcMD : []),
        ...(Array.isArray(advisories.mpd) ? advisories.mpd : [])
      ];
```

### WR-08: registry-driven backend, hardcoded frontend — a `days` change or a new advisory row silently renders nothing

**File:** `MMM-SPCOutlook.js:195-210, 251, 324, 333`; `node_helper.js:1920-1925`
**Issue:** The backend goes to real lengths to keep day spans registry-owned ("no literal day count survives outside the registry", `node_helper.js:143`) and to iterate advisory rows generically (`for (const row of Object.values(PRODUCT_REGISTRY))` at line 1921, writing `advisories[row.id]`). The frontend hardcodes all of it:

- `for (let d = 1; d <= 5; d++)` for ERO (line 324) and `d <= 3` for WSSI (line 333);
- five explicit `excessiveRain.day{N}Risk` terms (lines 196-200) and three `winterImpact.day{N}Risk` terms (lines 207-209) in the no-risk gate;
- `advisories.spcMD` and `advisories.mpd` by name (line 251).

Changing `PRODUCT_REGISTRY.excessiveRain.days` from 5 to 7 produces a correct 28-key payload whose days 6-7 never render and never disqualify the no-risk short-circuit. Adding a Phase 16/17 `kml-advisory` row produces a populated `advisories.<newId>` array that is never displayed and never disqualifies the gate. Neither failure produces an error.

**Fix:** The frontend cannot `require` the registry (browser context), so either (a) have `getSpcOutlook` ship the day span with each block (`excessiveRain._days`) and drive the loops off it, or (b) iterate the block's own keys:

```js
      const renderDayBlock = (label, block) => {
        if (!block) return;
        const days = Object.keys(block).filter(k => /^day\d+Risk$/.test(k)).length;
        for (let d = 1; d <= days; d++) {
          if (block[`day${d}Risk`] != "NONE") { /* ...existing row... */ }
        }
      };
```
and similarly derive the gate terms and the advisory concatenation (`Object.values(advisories).flat()`) rather than naming keys. At minimum, add a comment at each hardcoded site naming the registry field it must track, matching the style already used at `MMM-SPCOutlook.js:334-339`.

### WR-09: advisory rows render without consulting their config toggles, unlike every other product

**File:** `MMM-SPCOutlook.js:250-264` vs `323`/`332`
**Issue:** ERO and WSSI rows are gated `this.config.showExcessiveRain && ...` / `this.config.showWinterImpact && ...`. The advisory band is not gated on `this.config.showSPCMD` or `this.config.showMPD` at all — it renders whatever arrives. Today that is safe only because `_runKmlAdvisoryRow` returns `[]` when the toggle is off, so correctness depends entirely on the backend and frontend toggles never disagreeing. They can disagree: `_products` is shared across MagicMirror module *instances* of the same type (acknowledged at `node_helper.js:544-547`), so two configured instances with different `showMPD` values overwrite each other's toggles on every poll and the losing instance renders advisories its config disabled.

The same asymmetry exists in the no-risk gate at line 218, which checks advisory lengths with no toggle term while the ERO/WSSI terms at 195/206 both carry one.

**Fix:** Add the toggle terms so the frontend is self-consistent and defence-in-depth holds:

```js
      const advisoryLines = [
        ...(this.config.showSPCMD ? (advisories.spcMD || []) : []),
        ...(this.config.showMPD ? (advisories.mpd || []) : [])
      ];
```
and mirror it in the gate: `!((this.config.showSPCMD && this.spcrisk.advisories?.spcMD?.length > 0) || (this.config.showMPD && this.spcrisk.advisories?.mpd?.length > 0))`.

### WR-10: probe harness state bleeds between scenarios — `resetHelper` restores only two of the mutated seams

**File:** `scripts/probe-lib/module-stubs.js:193-221`, `65-89`
**Issue:** `ORIGINAL_SEAMS` captures `fetchGeoJsonCached` and `_fetch` only. The comment at lines 207-213 argues correctly that a hand-maintained reset list drifts — and then hand-maintains a two-entry list. Two concrete gaps today:

1. `turfStub.pointInPolygon` is module-global mutable state (line 82). Every scenario that needs containment saves and restores it by hand in a `finally`. That is 20 hand-rolled save/restore pairs; one omission bleeds `() => true` into every later scenario, silently making every polygon contain the user. `resetHelper` never touches it.
2. Any future scenario that stubs `fetchBinBuffer`, `checkInPolygon`, `extractSoleKmlEntry`, `_advisoryDiscovery` or `_prepareMpdEntry` — all reachable seams on the same helper object — bleeds into the next scenario exactly as the comment describes.

**Fix:** Snapshot the whole helper surface once and restore it wholesale, and give the turf stub its own reset:

```js
function loadNodeHelper() {
  installStubs();
  const helper = require(path.join(__dirname, "..", "..", "node_helper.js"));
  ORIGINAL_SEAMS.set(helper, { ...helper });   // every own method, not a curated pair
  helper.start();
  return helper;
}

const TURF_DEFAULTS = { pointInPolygon: () => false };
function resetHelper(helper) {
  const originals = ORIGINAL_SEAMS.get(helper);
  if (originals) Object.assign(helper, originals);
  Object.assign(turfStub, TURF_DEFAULTS);
  helper.start();
}
```

With that in place the 20 hand-rolled `try/finally` pairs in the scenarios become redundant and can be deleted.

## Info

### IN-01: dead code left behind by the `kml-advisory` migration

**File:** `node_helper.js:628-632` (`kmzToKmlfilename`), `634-638` (`extractKmlFromKmz`), `1036-1046` (`fetchGeoJson`)
**Issue:** All three have zero call sites after Phase 15 routed the MD path through `extractSoleKmlEntry`/`fetchGeoJsonCached`. `fetchGeoJson` is also the only remaining fetch in the file that swallows errors and returns `null` with no staleness signal — leaving it is an invitation for a future caller to reintroduce the silent-degrade pattern the rest of the file is built to avoid.
**Fix:** Delete all three. `kmzToKmlfilename`'s doc comment (lines 626-628) already explains why it was superseded; move that rationale into `extractSoleKmlEntry`'s comment and drop the function.

### IN-02: `_prepareMpdEntry` returns a `reason` field no caller reads

**File:** `node_helper.js:476`, consumed at `429-431`
**Issue:** `return { drop: true, reason: "expired" }` — `_runKmlAdvisoryRow` reads only `prepared.drop`. The expiry drop is therefore invisible in the log, which is the one MPD-04 decision an operator would most want to see.
**Fix:** Either log it (`Log.info(...MPD ${url} dropped: ${prepared.reason}...)`) or drop the field. Logging is preferable — MPD-04 is the phase's headline requirement and currently produces no evidence when it fires.

### IN-03: `_prepareMpdEntry` parses the description CDATA three times

**File:** `node_helper.js:466`, `489`, `495`
**Issue:** Line 466 computes `const html = this.mpdDescriptionHtml(feature)` and uses it for `IssueTime`/`ValidEndTi`. Lines 489 and 495 then call `mpdHazardType(feature)` and `mpdNumber(feature)`, each of which re-runs `mpdDescriptionHtml` internally. Three unwraps and four regex passes over the same string where one unwrap suffices.
**Fix:** Read the two remaining fields off the already-unwrapped `html`: `const hazardType = this.extractMpdField(html, "MPDType");` and `let number = this.extractMpdField(html, "MPDNumber");`. `mpdHazardType`/`mpdNumber` then become thin convenience wrappers used only by external callers (currently none).

### IN-04: `day{N}ValidTime` is computed, cached and shipped for both products but never rendered

**File:** `node_helper.js:193-196, 226`; consumed nowhere in `MMM-SPCOutlook.js`
**Issue:** `_validTimeOfWinner` exists solely to populate these fields, and the probe asserts them in five scenarios, but the frontend never reads `day1ValidTime` (or any sibling). The data is correct and the machinery around it is careful; it just has no consumer.
**Fix:** Either render it (a `— valid through HH:MM` suffix on the ERO/WSSI rows would use it) or record in `_runArcGisDayProduct`'s doc comment that it is reserved for a future phase, so a later reader does not mistake it for a live contract.

### IN-05: `wssiValueToTier[1]` / `wssiTierToColor.WWA` are unreachable by construction

**File:** `productRegistry.js:63, 72-75`
**Issue:** `includesFeat: (label, val) => val >= 2` guarantees value 1 never reaches `evaluatePolygons`, so tier `"WWA"` can never appear in a payload. The comment at lines 131-134 states this deliberately ("retained only to document the real domain"), which is defensible — but `wssiTierToColor.WWA = "d2dfe7"` carries no such note and reads as live palette data.
**Fix:** Add the same one-line "unreachable while `includesFeat` enforces the MINOR floor" note to `wssiTierToColor`, so the two maps document their reachability identically.

### IN-06: empty `finally {}` block in a probe scenario

**File:** `scripts/probe-payload-resilience.js:2189-2192`
**Issue:** `try { failureOut = await ... } finally { /* comment only */ }` — a `try/finally` with no cleanup. The comment inside it is useful; the block wrapper is not.
**Fix:** Delete the `try`/`finally` and keep the comment above the `await`.

### IN-07: Apache listing timestamps are parsed as UTC with no basis

**File:** `node_helper.js:327`
**Issue:** `Date.parse(timestamp.replace(" ", "T") + "Z")` forces the directory listing's Last-Modified column to UTC. `mod_autoindex` renders in the server's configured timezone, which is not guaranteed to be UTC. The consequence is bounded (the filter fails open, and a ±5 h skew is small against a 48 h window), but the assumption is silent.
**Fix:** State it in the comment — "WPC's listing renders UTC; a skew here only widens the fetch-count optimisation and can never exclude a candidate the ValidEndTi gate would keep" — or drop the `"Z"` and accept local-time parsing, which fails equally open.

### IN-08: loose equality throughout `getDom`'s no-risk gate

**File:** `MMM-SPCOutlook.js:178-180, 196-200, 207-209, 265, 267, 276, 278, 286, 288, 325, 340`
**Issue:** `risk == "NONE"` / `!= "NONE"` on values the backend guarantees are strings. Harmless today, but the same file uses `===` in `hasRenderableProximity` (128-135) and `cigLabelFromTierString` (116-118), so the file contradicts itself on which comparison it trusts. `!= "NONE"` is also true for `undefined`, which is how a missing block would render a row with `color:#undefined`.
**Fix:** Convert the tier comparisons to `!==`/`===`. This is a mechanical change with no behavioural difference for well-formed payloads and a strictly safer one for malformed ones.

### IN-09: resource bounds are inline magic numbers while one sibling bound is a named constant

**File:** `node_helper.js:661` (32 entries), `672` (8 MB), `292` (4 MB), `843` (512 KB), `298` (48 h) vs `node_helper.js:79` (`ADVISORY_MAX_CANDIDATES`)
**Issue:** Six security-relevant limits, one of which is hoisted to a documented module constant and five of which are inline expressions buried mid-function. An operator auditing "what does this module refuse" has to read five functions.
**Fix:** Hoist them alongside `ADVISORY_MAX_CANDIDATES` — `KMZ_MAX_ENTRIES`, `KMZ_MAX_KML_BYTES`, `LISTING_MAX_BYTES`, `MPD_DESCRIPTION_MAX_BYTES`, `MPD_LISTING_FRESH_WINDOW_MS` — keeping each one's existing justification comment with the constant.

## Conventions

The shared convention rule packs (`gsd-tools verify conventions --check`) returned `{"findings":[]}` for all five files. The items below are conventions derived at review time from this repository's own dominant patterns; they are advisory and never block.

### CV-01: every degrade path in `node_helper.js` folds into `anyStale` — one does not

**File:** `node_helper.js:211-213`
**Deviation:** The catch in `_runArcGisDayProduct` logs and returns without touching `anyStale`.
**Convention:** Seven of eight degrade sites in this file (`node_helper.js:176`, `437-440`, `1096-1099`, `1112-1116`, `1123-1128`, `1148-1152`, `1931`) set a staleness flag before returning a degraded value. The dominant pattern is unambiguous.
**Suggested fix:** See CR-01 — this convention deviation and that blocker are the same line. Recommended.

### CV-02: `try { ... } finally { restore }` around global stub mutation is hand-rolled 15 times

**File:** `scripts/probe-payload-resilience.js` (20 occurrences of `const originalPointInPolygon = turfStub.pointInPolygon;`)
**Deviation:** The same four-line save/override/restore idiom is copy-pasted 20 times rather than expressed once.
**Convention:** The file's own stated principle — "delegate rather than duplicate. A hand-maintained copy … drifts" (`module-stubs.js:207-209`) — is applied to `resetHelper` and not to this.
**Suggested fix:** See WR-10; a `withContainment(fn)` helper or a `resetHelper`-owned turf reset removes all 20. Recommended.

### CV-03: registry-derived iteration on the backend, hand-written enumeration on the frontend

**File:** `MMM-SPCOutlook.js:195-210, 251, 324, 333`
**Deviation:** Day spans and advisory keys are enumerated literally in the frontend.
**Convention:** `node_helper.js` derives every one of these from `PRODUCT_REGISTRY` (`row.days` at lines 147/220, `Object.values(PRODUCT_REGISTRY)` at lines 121 and 1921) and states the rule explicitly: "no literal day count survives outside the registry."
**Suggested fix:** See WR-08. Recommended, with the caveat that the frontend runs in a browser context and cannot `require` the registry, so the fix is structural rather than a direct import.

---

_Reviewed: 2026-08-24T20:36:10Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
