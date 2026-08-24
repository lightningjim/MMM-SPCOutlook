---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
reviewed: 2026-08-24T21:51:34Z
depth: deep
iteration: 2
files_reviewed: 5
files_reviewed_list:
  - MMM-SPCOutlook.js
  - node_helper.js
  - productRegistry.js
  - scripts/probe-lib/module-stubs.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 2
  warning: 8
  info: 11
  convention: 3
  total: 24
status: issues_found
---

# Phase 15: Code Review Report (re-review after fix pass)

**Reviewed:** 2026-08-24T21:51:34Z
**Depth:** deep
**Files Reviewed:** 5
**Status:** issues_found
**Probe suite at review time:** 43 passed / 0 failed / 0 skipped (re-run and confirmed)

## Summary

This is a fresh adversarial pass over the five Phase 15 source files as they stand at
`9d88bfd`, after the 13-finding fix pass (`3622e19`..`4880b37`). Findings were re-derived
from the current source; nothing was carried forward on the strength of a commit message.

**On the 13 prior fixes:** twelve hold under scrutiny. CR-01 (`anyStale` in the arcgis
per-day catch), CR-02 (contained body read), WR-01 (numeric truncation), WR-02 (three-layer
body bound), WR-04 (`checkInPolygon` per-feature containment), WR-05 (registry-driven
oracle), WR-06 (routing correction + render assertion), WR-07/WR-08/WR-09 (frontend
tolerance, span derivation, toggle gate) and WR-10 (whole-surface seam restore) are
genuinely closed, and I could not find a scenario whose routing masks them the way WR-06's
originally did. **WR-03 does not hold.** Its third and "only unforgeable" check —
`buf.length > KMZ_MAX_KML_BYTES` after `readFile` — is dead code with the installed
adm-zip (verified: adm-zip sizes its output buffer from `header.size` and throws
`Cannot create a Buffer larger than N bytes` before returning), and the scenario written to
pin it (`kmz-decompression-bomb-is-refused`, case 3) passes on *any* error and therefore
asserts nothing about node_helper.js at all. **CR-03's flagged extension is defensible** —
`RESEARCH.md:620-636` records live-verified `<name>MD 2108</name>` on the SPC MD member
Placemark, so the new `anyStale` on the unnamed-advisory drop should not latch for `spcMD`
in practice; I am not raising a finding on it.

**Two BLOCKERs are new to this pass and neither was in the prior review.** Both are silent
false negatives of exactly the class this product exists to prevent, both are invisible to
the probe suite because the suite's temporal model does not match production, and both were
reproduced here against the real code:

1. The stale-fallback window (`_isWithinStaleWindow`) is unreachable in production. Every
   scenario that proves "a WPC hiccup during an active HIGH must not blank the display"
   runs its warm-up and its failure poll milliseconds apart; at the real 60-minute cadence
   the cached reading is always older than the window, so the fallback never fires.
2. The frontend's out-of-order sequence guard permanently freezes the display after a
   node_helper restart, because `_seq` restarts at 0 while the browser's `_lastSeq` does not.

**On the heuristic bounds the prompt asked about:** the WR-02 body bounds (8 MB member,
4 MB listing) are generous and safe against live sizes. The WR-03 200:1 ratio is *not* a
security control at all given the adm-zip behaviour above, and its stated basis ("live KML
compresses at well under 20:1") is measurably wrong for the one archive shape it actually
sees most often — a 1000-entry NetworkLink index KML measures 33:1 here.

**On the probe suite** (now 3,123 lines): the new scenarios are, with one exception, well
constructed — negative controls, positive controls and vacuity guards are used
deliberately and correctly. The exception is `kmz-decompression-bomb-is-refused` case 3
(WR-01 below). Two harness weaknesses are recorded: an undeclared inter-scenario ordering
dependency, and a DOM stub that makes the XSS-escaping guarantee unassertable.

## Critical Issues

### CR-01: the stale-fallback window is unreachable at the shipping poll cadence — an active HIGH *is* blanked by a single upstream hiccup

**File:** `node_helper.js:1164-1167`, `node_helper.js:1212`, `1240`, `1261`, `1282`; write sites `node_helper.js:1226-1236`, `1300-1306`, `1315-1318`

**Issue:** `_isWithinStaleWindow(timestamp, intervalMinutes)` returns
`(Date.now() - timestamp) < intervalMinutes * 60 * 1000`, and `entry.timestamp` is written
**only** on a fresh 200 that produced new data. Every cache-hit return path —
304 (`1226-1236`), ETag match on a 200 (`1300-1306`), hash match (`1315-1318`) — returns
without rewriting the entry, so the timestamp is the age of the last *body change*, not of
the last successful confirmation.

At the documented default `updateInterval: 60`, the entry that was written at poll N is
already ~60 minutes old when poll N+1 reaches that URL (later, in fact — `getSpcOutlook` is
a ~30-hop serial chain, so each layer is fetched some seconds into the run). `60min < 60min`
is false. And because SPC outlooks change a handful of times a day while the module polls
hourly, most entries are hours old: they have been 304-confirmed repeatedly and never
rewritten.

Reproduced against the real `fetchGeoJsonCached`:

```
warm cache entry, age 0                        -> 200, cached
entry aged to 61 min, then network error       -> {"data":null,"cachedResult":null,"stale":false,"failed":true}
entry aged to  5 min, then network error       -> {"data":null,"cachedResult":6,"stale":true}
304 hit on a 59-min-old entry                  -> served; timestamp refreshed? false
200 with matching ETag on a 59-min-old entry   -> served; timestamp refreshed? false
```

So in production the second line is the real behaviour: `cachedResult: null`, the day
resolves to `"NONE"`, and the display renders `⚠ Stale` + `No Severe Weather Risk
(unconfirmed)` for a location that was HIGH ten minutes earlier. The phase's stated
guarantee — "a WPC hiccup during an active HIGH must not blank the display"
(`node_helper.js:1451-1456` comment, `ero-rejected-body-serves-last-known-good`) — is not
delivered by the shipped code. `ero-rejected-body-serves-last-known-good`,
`ero-unparseable-body-serves-last-known-good` and part 1 of
`body-read-abort-is-contained-not-a-payload-collapse` all pass only because their warm-up
poll and their failure poll are milliseconds apart.

**Fix:** refresh the entry timestamp whenever upstream confirms the bytes are unchanged —
a 304 or an ETag/hash match *is* a successful reading, which is exactly what
`_noteStaleEntry`'s own comment says ("an ETag/hash cache hit is upstream confirming the
bytes are unchanged, which is a fresh reading"). Apply it at all three hit sites:

```js
// 304 Not Modified
if (res.status === 304) {
  if (!entry) { /* ...unchanged... */ }
  Log.info('MMM-SPCOutlook: cache hit (ETag) for ' + url);
  entry.timestamp = Date.now();          // upstream confirmed: this reading is fresh
  return { data: null, cachedResult: entry.result, stale: false };
}
...
if (entry && entry.mode === 'etag' && entry.etag === newEtag) {
  entry.timestamp = Date.now();
  return { data: null, cachedResult: entry.result, stale: false };
}
...
if (entry && entry.mode === 'hash' && entry.hash === newHash) {
  entry.timestamp = Date.now();
  return { data: null, cachedResult: entry.result, stale: false };
}
```

Additionally decouple the window from the poll interval so it cannot be exactly-equal to
the cadence (`intervalMs * 2`, or an explicit `STALE_MAX_AGE_MS`), and add a probe scenario
that ages the cache entry past one interval before failing — the current suite structurally
cannot see this class of bug.

### CR-02: a node_helper restart permanently freezes the frontend — every subsequent payload is discarded

**File:** `MMM-SPCOutlook.js:82-89`; producer `node_helper.js:113-117`, `node_helper.js:648-649`

**Issue:** `node_helper.start()` sets `this._seq = 0` and `socketNotificationReceived`
emits `[outlook, ++this._seq]`. The frontend keeps `this._lastSeq` and discards anything
`<= this._lastSeq`. Nothing resets `_lastSeq`, and nothing detects that the producer's
counter restarted.

MagicMirror restarts node_helpers when the server process restarts, but the browser client
reconnects over socket.io **without reloading the page** — this is the normal behaviour for
`serveronly` / remote-browser deployments and for any pm2/systemd restart of the server. On
reconnect the helper emits seq 1, 2, 3… while the frontend still holds `_lastSeq = 47`, so
every payload is rejected forever. Reproduced against the real `socketNotificationReceived`:

```
after 47 polls:                          spcrisk {"seq":47}  renders 47
after server restart + 10 polls:         spcrisk {"seq":47}  renders 47
```

The display is frozen on an arbitrarily old payload, presented as current — no `⚠` badge
(the frozen payload's own `_stale` value is whatever it was at freeze time), no error, no
self-heal on any later tick. This is the same "last-writer-wins across time" false negative
the sequence guard was introduced to prevent, inverted.

`frontend-seq-discard-survives-socket-index-migration` only exercises a monotonically
sourced 5/3/6 sequence and cannot see this.

**Fix:** make the guard tolerant of a producer restart. Either seed the helper's counter
from wall-clock so it can never regress:

```js
// node_helper.js start()
this._seq = Date.now();          // monotonic across helper restarts within a boot
```

or treat a large backwards jump as a new producer epoch on the frontend:

```js
const seq = payload[1];
if (typeof seq === "number") {
  const last = this._lastSeq ?? -1;
  if (seq <= last) {
    // A producer restart resets the counter; a genuinely late chain is at most a few
    // behind. Re-sync rather than freezing the display forever.
    if (last - seq > 1) {
      Log.warn("MMM-SPCOutlook: sequence regressed (" + seq + " after " + last +
               "); assuming a helper restart and re-syncing");
      this._lastSeq = seq;
    } else {
      Log.info("SPC Outlook: discarding out-of-order SPC_DATA_RESULT (seq " + seq + " <= " + last + ")");
      return;
    }
  } else {
    this._lastSeq = seq;
  }
}
```

Add a probe scenario that replays seq 1..N, then 1..M, and asserts the display advances.

## Warnings

### WR-01: `extractSoleKmlEntry`'s "only unforgeable" post-read bound is dead code, and the scenario that claims to pin it asserts nothing

**File:** `node_helper.js:786-791`; scenario `scripts/probe-payload-resilience.js:2707-2727`

**Issue:** the WR-03 fix comment (`node_helper.js:761-773`) says check 3 is "the length of
the buffer that actually came out, which no header field can lie about", and the fix report
says the scenario "pins the library behaviour so a future adm-zip upgrade that drops it
turns the suite red". Neither is true of the shipped code.

adm-zip 0.5.16 allocates its inflation target from the declared central-directory size and
refuses to exceed it. Verified directly against a forged archive (16 MB deflate stream, CD
uncompressed size forged to 100):

```
declared size 100 compressed 16311
THREW: Cannot create a Buffer larger than 100 bytes
```

`ZIPper.readFile(entry)` therefore never returns a buffer longer than `declared`, and
`declared` was already bounded by check 1 (`declared > KMZ_MAX_KML_BYTES`). The
`buf.length > KMZ_MAX_KML_BYTES` branch at `786-791` is unreachable.

The scenario's case 3 asserts only (a) that *some* error was thrown and (b) that its
message is not one of the two header-check messages. The adm-zip error satisfies both. If
the post-read check were deleted, the scenario stays green; if a future adm-zip *did*
inflate fully and the post-read check fired, the scenario also stays green. It cannot
distinguish the layer that refused, which is the one thing its comment says it exists to do.

**Fix:** either delete the unreachable check and say plainly in the comment that inflation
is bounded by adm-zip's declared-size allocation (with the version pinned), or keep it and
make the scenario assert *which* refusal fired:

```js
// case 3 must be refused by adm-zip's declared-size allocation, not by our header checks
if (!/Cannot create a Buffer larger than/.test(forgedErr.message)) {
  throw new Error(
    `the forged fixture was not refused by adm-zip's declared-size allocation ` +
    `(${forgedErr.message}) — the library no longer bounds inflation, so ` +
    `extractSoleKmlEntry's post-read length check is now the only thing that does`
  );
}
```

and pin the adm-zip version in `package.json` to an exact version rather than `^0.5.16`.

### WR-02: the 200:1 compression-ratio threshold has no security value and can reject legitimate index KML

**File:** `node_helper.js:89-95`, `node_helper.js:781-784`

**Issue:** the ratio is computed from `entry.header.size / entry.header.compressedSize` —
**both** attacker-chosen central-directory fields. An attacker who wants to defeat it
simply writes a plausible pair; the check adds nothing that check 1 (`declared >
KMZ_MAX_KML_BYTES`) plus adm-zip's declared-size allocation (WR-01) do not already provide.
What it does add is false-rejection surface, against a threshold picked from the wrong
sample.

The comment justifies 200:1 with "live KML compresses at well under 20:1", measured against
member KMZs (~3 KB polygons). But `extractSoleKmlEntry` also processes the SPC
`ActiveMD.kmz` **index** (`_advisoryDiscovery["spc-active-index"]`, `node_helper.js:269`),
whose sole KML member is a run of near-identical `<NetworkLink>` blocks. Measured here with
`zlib.deflateRaw` level 9:

| index KML shape | raw | deflate | ratio |
|---|---|---|---|
| 3 NetworkLinks (today's live count) | 350 B | 131 B | 2.7 : 1 |
| 20 NetworkLinks | 2.0 KB | 182 B | 11.2 : 1 |
| 100 NetworkLinks | 10 KB | 391 B | **25.5 : 1** |
| 1000 NetworkLinks | 99 KB | 2.9 KB | **33.4 : 1** |
| 20k-vertex MD polygon | 400 KB | 87 KB | 4.6 : 1 |

A refusal here throws out of the `spc-active-index` strategy's `try`, which returns
`{ urls: [], failed: true }` — i.e. **every active SPC MD disappears** for that poll,
behind a `⚠` badge. That is a whole-product false negative triggered by upstream growth or
by WPC/SPC pretty-printing their index, not by an attack.

**Fix:** drop the ratio check (preferred — it is redundant, see WR-01) and record why in
the comment; or, if it is kept as defence-in-depth against a future zip library that trusts
the header, raise it to a value that cannot fire on any plausible XML (a real deflate bomb
is 500:1–1032:1, so 1000:1 still catches the attack shape) and correct the comment to cite
the index-KML measurements above rather than the member-KMZ ones.

### WR-03: `PRODUCT_REGISTRY` declares each product's day span twice with no invariant, and post-CR-01 the mismatch latches `⚠ Stale` permanently

**File:** `productRegistry.js:36`, `productRegistry.js:58`, `productRegistry.js:90-94`, `productRegistry.js:116-118`; consumer `node_helper.js:163-238`

**Issue:** a row's span is stated once as `days: 5` and again as the key set of
`dayLayers`. Nothing ties them together. `buildUrl(day)` reads `dayLayers[day]` and passes
it to `buildArcGisQuery`, which throws on `undefined`:

```
ERO day6 buildUrl THREW: buildArcGisQuery: layerId must be a non-negative integer
WSSI day4 buildUrl THREW: buildArcGisQuery: layerId must be a non-negative integer
```

`_runArcGisDayProduct` calls `row.buildUrl(d)` **inside** the per-day try (`node_helper.js:176`),
and the CR-01 fix now sets `anyStale = true` in that catch. So raising `days` without
extending `dayLayers` produces a payload that is flagged `_stale` on **every poll, forever**
— the display permanently shows `⚠ Stale`, and (per the CR-01 frontend gate at
`MMM-SPCOutlook.js:227`) the no-risk short-circuit is permanently disabled, so a quiet day
renders `No Severe Weather Risk (unconfirmed)` indefinitely.

This is not hypothetical: raising `days` from 5 to 7 is the exact edit the WR-08 rationale
is written around, in four separate comments (`MMM-SPCOutlook.js:174-181`, `244-249`,
`379-383`, `scripts/probe-payload-resilience.js:2949-2955`), and the fix report records
performing it. The fix report concluded "the three resulting failures are all fixture-side…
no failure came from the frontend" — correct as far as it goes, and it missed that days 6-7
throw and latch staleness.

**Fix:** derive the span rather than restating it, and validate at module load:

```js
function daySpanOf(dayLayers) {
  const days = Object.keys(dayLayers).map(Number).sort((a, b) => a - b);
  for (let i = 0; i < days.length; i++) {
    if (days[i] !== i + 1) {
      throw new Error("productRegistry: dayLayers must be a contiguous 1..N map, got " + JSON.stringify(days));
    }
  }
  return days.length;
}
// ...
days: daySpanOf(eroDayLayers),
```

A row then cannot declare a span its layer map cannot serve, and adding a Day 6 means
adding one `dayLayers` entry — one edit, in one place, exactly as the phase's own rule
intends.

### WR-04: two configured module instances silently render each other's location

**File:** `node_helper.js:583-587`, `node_helper.js:649`, `node_helper.js:1464-1477`

**Issue:** MagicMirror runs **one** node_helper per module *type* and
`sendSocketNotification` broadcasts to **every** frontend instance of that type. The
frontend applies only the sequence filter (`MMM-SPCOutlook.js:82-89`), which is
location-agnostic, so an instance configured for Norman OK accepts and renders the payload
computed for an instance configured for Boston MA. The `_inFlight` guard makes this
deterministic rather than occasional: the second instance's `GET_SPC_DATA` at the same tick
is dropped outright (`583-586`), so it never gets a chance to run its own query — it only
ever receives the other instance's answer.

`_cachedLat`/`_cachedLon` compound it: whichever instance does win alternates the cached
location, so `locationChanged` fires and `this._geoJsonCache.clear()` runs on essentially
every poll (`1464-1477`), discarding all ETag/hash benefit and turning ~30 conditional
requests into ~30 full body reads per poll against NOAA.

The codebase is aware of the shared-helper problem for `_products` (`MMM-SPCOutlook.js:196-204`,
`node_helper.js:613-619`) but not for the payload itself, which is the more serious half —
a user watching the wrong city's tornado risk has no way to tell.

**Fix:** key the exchange by identity so a payload can only be consumed by its requester.
Echo the request's coordinates in the payload and have the frontend reject a mismatch:

```js
// node_helper.js — carry the request identity through
this.sendSocketNotification("SPC_DATA_RESULT", [outlook, this._seq, { lat, lon }]);

// MMM-SPCOutlook.js
const forWhom = payload[2];
if (forWhom && (forWhom.lat !== this.config.lat || forWhom.lon !== this.config.lon)) return;
```

and make the in-flight guard per-location (`this._inFlight` -> `Map` keyed by
`lat,lon`) or queue the skipped request instead of dropping it. If multi-instance is not a
supported configuration, say so in `README.md` and log a warning when a second distinct
`lat,lon` is seen.

### WR-05: `harness-leak-setup` / `harness-leak-check` are order-coupled with no guard, and the setup scenario asserts nothing

**File:** `scripts/probe-payload-resilience.js:3017-3073`

**Issue:** `harness-leak-setup-deliberately-dirties-the-seams` contains no assertion — it
always passes and inflates the reported count by one. Its whole value depends on
`harness-leak-check-resethelper-restores-every-seam` being the *immediately* next scenario,
which nothing enforces or documents in machine-checkable form. Any scenario inserted
between them calls `resetHelper(helper)` at its own start, cleaning both leaks, after which
the check scenario passes vacuously — it never asserts that the seams were dirty on entry.

This is the same vacuity class the suite is otherwise careful about (`WR-02's trap`,
`assertGoldenPinsSomething`), left unguarded in the one place it is structurally hardest to
see.

**Fix:** make the check self-contained and assert its own precondition:

```js
name: "harness-leak-check-resethelper-restores-every-seam",
run: async (helper) => {
  // Dirty the seams here, in this scenario, so no ordering assumption is load-bearing.
  helper.fetchBinBuffer = async () => { throw new Error("LEAKED fetchBinBuffer stub"); };
  helper.checkInPolygon = () => { throw new Error("LEAKED checkInPolygon stub"); };
  turfStub.pointInPolygon = () => true;
  // Precondition: the dirt is actually present.
  if (turfStub.pointInPolygon({}, {}) !== true) throw new Error("setup did not dirty the turf stub");
  resetHelper(helper);
  resetLogs();
  // ...existing assertions unchanged...
}
```

and delete the setup-only scenario.

### WR-06: three unreachable helper methods remain in `node_helper.js`

**File:** `node_helper.js:718-722` (`kmzToKmlfilename`), `node_helper.js:724-729` (`extractKmlFromKmz`), `node_helper.js:1152-1162` (`fetchGeoJson`)

**Issue:** none of the three has a caller anywhere in the repository (verified across all
`.js` files excluding `node_modules`). `fetchGeoJson` is the more dangerous of the three: it
is a second, divergent fetch implementation that bypasses every control this phase added —
no size bound, no `_isFeatureCollection` gate, no stale fallback, no `failed` flag,
swallowing errors into a bare `return null`. A future caller reaching for the
obviously-named `fetchGeoJson` instead of `fetchGeoJsonCached` reintroduces the entire
CR-02/WR-14 class silently. `kmzToKmlfilename` is explicitly documented as superseded by
`extractSoleKmlEntry` (`node_helper.js:713-717`) and `extractKmlFromKmz` is its only
consumer pattern.

**Fix:** delete all three. If `fetchGeoJson` is wanted as a documented escape hatch, route
it through `fetchGeoJsonCached` rather than duplicating the transport.

### WR-07: `spc-active-index` violates the ordering contract the truncation cap now depends on

**File:** `node_helper.js:266-287`, contract stated at `node_helper.js:446-456`

**Issue:** the WR-01 fix documents a contract at the generic cap: "each strategy is
responsible for handing back a meaningfully ordered list — `wpc-mpd-listing` now sorts
numerically and truncates to ADVISORY_MAX_CANDIDATES itself… A future strategy must do the
same." The *existing* other strategy, `spc-active-index`, does not: it returns hrefs in raw
NetworkLink document order with no sort and no truncation of its own, so the
`candidates.slice(0, ADVISORY_MAX_CANDIDATES)` at `454` keeps an arbitrary 60 and drops the
rest. The contract is asserted by comment against code that does not satisfy it, which is
the shape that lets the next reader trust it wrongly.

Practical exposure is low (SPC rarely has more than ~15 concurrent MDs), but the drop is
silent apart from a `⚠`, and the same comment is what a Phase 16/17 author will read.

**Fix:** either sort by MD number inside `spc-active-index` before returning (mirroring
`wpc-mpd-listing`), or restate the contract honestly and make the generic cap's ordering
explicit:

```js
// spc-active-index, before `return { urls, failed: false }`
urls.sort((a, b) => mdNumberOf(a) - mdNumberOf(b));
if (urls.length > ADVISORY_MAX_CANDIDATES) {
  Log.error(`MMM-SPCOutlook ${row.id}: ${urls.length} NetworkLink candidates; keeping the ` +
            `${ADVISORY_MAX_CANDIDATES} highest-numbered`);
  return { urls: urls.slice(-ADVISORY_MAX_CANDIDATES), failed: true };
}
```

### WR-08: the XSS-escaping guarantee (`escapeHtml`) is asserted by no scenario, and the DOM stub makes it unassertable

**File:** `scripts/probe-lib/module-stubs.js:253`, `scripts/probe-lib/module-stubs.js:266-273`; subject `MMM-SPCOutlook.js:156-164`, `MMM-SPCOutlook.js:308-320`

**Issue:** `MMM-SPCOutlook.js:156-161` states the threat model explicitly — advisory labels
and hazard types are "unbounded remote KML text" reaching `innerHTML` — and `escapeHtml` is
the sole control. No scenario in the 3,123-line suite feeds a label containing `<`, `>`,
`&`, `"` or `'` through `renderDom`. Deleting `escapeHtml`'s body (`(value) => String(value)`)
leaves the suite at 43/0.

The harness cannot easily fix this by assertion alone: `document.createElement()` returns
`{ innerHTML: "", textContent: "" }` (`module-stubs.js:253`), a plain object whose
`innerHTML` is never parsed, so a scenario can only assert on the concatenated string. That
is still enough to catch the deletion, and worth having.

**Fix:** add a scenario that renders a hostile label and asserts the escape:

```js
{
  name: "frontend-escapes-remote-advisory-text",
  run: async (_helper) => {
    const frontend = loadFrontendModule();
    const hostile = '<img src=x onerror="alert(1)">';
    const payload = noRiskPayloadWithAdvisory({
      spcMD: [], mpd: [{ label: hostile, hazardType: hostile }]
    });
    const out = renderDom(frontend, {
      config: { ...baseConfig, showMPD: true }, spcrisk: payload
    });
    if (out.includes("<img")) {
      throw new Error(`remote advisory text reached innerHTML unescaped: ${out}`);
    }
    if (!out.includes("&lt;img")) {
      throw new Error(`the advisory did not render at all — the assertion above is vacuous: ${out}`);
    }
  }
}
```

## Info

### IN-01: `buildArcGisQuery` allowlists by raw string prefix, the exact pattern `normalizeAdvisoryUrl` was written to replace

**File:** `productRegistry.js:28-30`

`node_helper.js:41-54` argues at length that "prefix matching on the raw string is also the
wrong tool for the SSRF control it exists to be", citing `www.spc.noaa.gov.evil.test` and
`https://www.spc.noaa.gov@evil.test/`. `buildArcGisQuery` still uses
`baseUrl.startsWith("https://mapservices.weather.noaa.gov/")`. It is safe today only
because of the trailing slash and because `baseUrl` is a module constant, but it is the
same control stated two different ways in one codebase.

**Fix:** parse and compare hostnames, matching `normalizeAdvisoryUrl`:

```js
let base;
try { base = new URL(baseUrl); } catch { throw new Error("buildArcGisQuery: baseUrl is not a URL"); }
if (base.protocol !== "https:" || base.hostname.toLowerCase() !== "mapservices.weather.noaa.gov") {
  throw new Error("buildArcGisQuery: baseUrl must be an https mapservices.weather.noaa.gov URL");
}
```

### IN-02: the `advisories` seed literal duplicates the registry's `kml-advisory` row ids

**File:** `node_helper.js:2053`

`const advisories = { spcMD: [], mpd: [] };` is a hand-written copy of the same row ids the
loop immediately below iterates. Every other span/id in this function is registry-derived
(the file's own rule: "no literal day count survives outside the registry"). A Phase 16
`kml-advisory` row is still handled correctly, but only by accident of the loop's
assignment.

**Fix:** `const advisories = Object.fromEntries(Object.values(PRODUCT_REGISTRY).filter(r => r.kind === "kml-advisory").map(r => [r.id, []]));`

### IN-03: loose `==`/`!=` against `"NONE"` sits beside the strict comparisons the WR-08 fix introduced

**File:** `MMM-SPCOutlook.js:228-230`, `321`, `323`, `332`, `334`, `342`, `344`

The WR-08 helpers use strict `!==` and document exactly why (`MMM-SPCOutlook.js:186-188`,
`387`: `!= "NONE"` is true for `undefined`, which renders `color:#undefined`). The day1/2/3
comparisons a few lines away were left at `==`/`!=` and carry that trap unfixed — a payload
whose `day2.risk` is missing renders a row with `color:#undefined` and `text: undefined`.

**Fix:** convert these seven sites to `===`/`!==`.

### IN-04: `_advisoryDiscovery[row.discovery]` resolves through the prototype chain, and the "never throws" contract is not enforced

**File:** `node_helper.js:432-438`, contract asserted at `node_helper.js:255-262` and `node_helper.js:622-627`

`typeof this._advisoryDiscovery[row.discovery] === "function"` is true for inherited members
(`"constructor"`, `"toString"`, `"valueOf"`). With such a value, `strategy.call(this, row)`
returns something whose `urls` is `undefined`, and `candidates.length` at `451` throws — out
of `_runKmlAdvisoryRow`, which `getSpcOutlook`'s comment at `622-627` explicitly relies on
never throwing, and into the shared catch that collapses the whole payload to `{ error }`.
Unreachable today (row ids are literals) but the guard is one word.

**Fix:** `Object.prototype.hasOwnProperty.call(this._advisoryDiscovery, row.discovery)`, and
defensively `const { urls = [], failed = true } = await strategy.call(this, row) || {};`

### IN-05: `noRiskPayloadWithAdvisory` hardcodes 5- and 3-day spans

**File:** `scripts/probe-payload-resilience.js:531`, `537`

The WR-05 fix made `assertPayloadIntact` registry-driven for exactly this reason; the
fixture builder twenty lines away still writes `d <= 5` and `d <= 3`. A registry span change
leaves this fixture silently mis-shaped.

**Fix:** drive both loops from `PRODUCT_REGISTRY.excessiveRain.days` / `.winterImpact.days`,
or from a filter over `arcgis-day-layers` rows.

### IN-06: `TURF_DEFAULTS` restores only `pointInPolygon`

**File:** `scripts/probe-lib/module-stubs.js:221`

Adequate today — all 53 mutations in the suite are `turfStub.pointInPolygon =` — but the
WR-10 argument was precisely that hand-curated lists drift. A scenario that stubs
`pointToLineDistance` (to exercise proximity) or `polygonToLine` leaks it into every later
scenario with no assertion anywhere.

**Fix:** capture the whole stub once and restore it wholesale, mirroring `ORIGINAL_SEAMS`:
`const TURF_DEFAULTS = { ...turfStub };` at module scope, before any scenario runs.

### IN-07: `resetHelper`'s shallow restore cannot undo nested mutation of `helper._advisoryDiscovery`

**File:** `scripts/probe-lib/module-stubs.js:230-235`; affected scenario `scripts/probe-payload-resilience.js:2528-2545`

`Object.assign(helper, originals)` restores a *replaced* `_advisoryDiscovery` object but not
a *mutated* one. `mpd-empty-number-cell-falls-back-to-filename-not-dropped` replaces the
whole object and restores it by hand in a `finally` — correct, but the harness cannot
guarantee it, which is exactly the guarantee WR-10 set out to provide.

**Fix:** deep-restore the known-container members, or freeze `helper._advisoryDiscovery` in
`loadNodeHelper` so an in-place mutation fails loudly.

### IN-08: the listing byte bound is applied to a JS string length, not to bytes

**File:** `node_helper.js:322-326`

`text.length` counts UTF-16 code units, so a body of multi-byte characters can exceed
`ADVISORY_MAX_LISTING_BYTES` bytes while passing the check (and, conversely, a body of
astral-plane characters over-counts). node-fetch's `size` option is the byte bound that
matters, so exposure is nil; the comment calling this "the fallback for a runtime that
ignores `size`" overstates what it does.

**Fix:** `Buffer.byteLength(text, "utf8") > ADVISORY_MAX_LISTING_BYTES`, or reword the
comment.

### IN-09: `"No Severe Weather Risk (unconfirmed)"` can render for a payload that is not degraded

**File:** `MMM-SPCOutlook.js:268`, `MMM-SPCOutlook.js:308-320`, `MMM-SPCOutlook.js:413-415`

The gate counts `enabledAdvisories().length > 0` while the render loop skips entries that
are `null`/non-object (`311`). A payload carrying `advisories.mpd = [null]` with the toggle
on and no other risk therefore fails the short-circuit, renders nothing, and falls into the
`contentMarker` branch — showing "(unconfirmed)" with no `⚠ Stale` badge above it, for a
payload the backend never flagged.

**Fix:** apply the same entry-shape filter in `enabledAdvisories()` so the gate and the
render count the same set: `.filter((e) => e && typeof e === "object")`.

### IN-10: Apache listing timestamps are parsed as UTC

**File:** `node_helper.js:358`

`Date.parse(timestamp.replace(" ", "T") + "Z")` treats the listing's Last-Modified column as
UTC. Apache renders it in the server's local timezone by default. Harmless inside a 48-hour
window and the branch fails open, but the assumption is undocumented and would matter if the
window were ever tightened.

**Fix:** note the assumption in the comment, or widen `FRESH_WINDOW_MS` by a timezone margin.

### IN-11: `MPD_FILENAME_PATTERN`'s `\d+` is unbounded, and `numberOf` sorts unparseable names to the top of the kept set

**File:** `productRegistry.js:81`; consumer `node_helper.js:399-403`

A listing entry named `MPD_<300 digits>_final.kmz` passes the pattern; `Number(m[1])` then
yields a value larger than any legitimate MPD number, so a hostile listing can guarantee its
own entries survive the truncation. The listing is fully attacker-controlled in that threat
model anyway, so this changes nothing materially — but the sort key deserves a bound.

**Fix:** `/^MPD_(\d{1,6})_final\.kmz$/`.

## Conventions

### CV-01: review-finding IDs are reused across phases with different meanings inside source comments

**Deviation:** `node_helper.js` and `MMM-SPCOutlook.js` carry ~60 inline citations of the
form `WR-03:`, `CR-01:`, `WR-08:` etc. These IDs are per-phase-review and are recycled: the
`WR-08` cited at `node_helper.js:864` (unusable geometry, Phase 14) is a different finding
from the `WR-08` cited at `MMM-SPCOutlook.js:174` (day-span derivation, Phase 15), and
`CR-01` names three different findings in three places.
**Derived convention:** the file's own dominant practice is to cite a durable identifier
alongside the review ID (`D-05`, `MPD-04`, `WSSI-02`, `PERF-02`, `T-15-24`) — those are
phase-scoped and unique.
**Suggested fix (recommend, non-blocking):** qualify review IDs with their phase
(`15/WR-08:`) or drop the review ID in favour of the durable decision ID that already
accompanies most of them.

### CV-02: `helper._products = { ... }` in the probe is redundant setup in ~28 of 30 scenarios

**Deviation:** nearly every scenario assigns `helper._products` and then passes the same
toggles again as `getSpcOutlook`'s fourth argument, which takes precedence
(`node_helper.js:1447`). Only `ero-wellformed-slgt`, `ero-toggle-off` and
`spc-wellformed-baseline` actually depend on the field.
**Derived convention:** the suite's dominant style is to state a scenario's inputs exactly
once, at the seam that consumes them.
**Suggested fix (recommend, non-blocking):** drop the `helper._products` assignment wherever
the explicit `products` argument is also passed, and keep it only in the three scenarios that
deliberately exercise the helper-global fallback — with a comment saying so.

### CV-03: `_isFeatureCollection` / body-size discipline is applied to the advisory path but not to the ~30 GeoJSON fetches

**Deviation:** `fetchBinBuffer` and the MPD listing carry a `size` cap, a `Content-Length`
check and a post-read check, documented as "a security control, not tidiness"
(`node_helper.js:81-87`, `675-693`). `fetchGeoJsonCached` calls
`this._fetch(url, withTimeout({ headers }))` with no `size` at all (`node_helper.js:1209`)
and then `await res.text()` on an unbounded body — ~30 times per poll, on a Raspberry Pi.
**Derived convention:** every outbound body read in this file is bounded.
**Suggested fix (recommend, non-blocking):** pass `size: GEOJSON_MAX_BODY_BYTES` (the live
SPC categorical layer is ~100 KB; 8 MB is ample) so the rule holds uniformly and a
hijacked/misbehaving upstream cannot OOM the process through the one unbounded path.

---

_Reviewed: 2026-08-24T21:51:34Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep — iteration 2, adversarial re-review after fix pass `3622e19`..`4880b37`_
