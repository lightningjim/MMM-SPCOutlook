---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
reviewed: 2026-08-27T00:00:00Z
depth: standard
files_reviewed: 5
files_reviewed_list:
  - MMM-SPCOutlook.js
  - node_helper.js
  - productRegistry.js
  - scripts/hazards-at.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 1
  warning: 9
  info: 2
  total: 12
status: issues_found
---

# Phase 16: Code Review Report

**Reviewed:** 2026-08-27
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found

## Summary

The Hazards Outlook implementation holds on the four things the phase named as its highest
risks, and I tried hard to break each of them:

- **Cache contract (verified holding).** `_cacheHazardMatches` (node_helper.js:398-427) is
  the only writer for this product, it whitelists four fields rather than spreading, and it
  carries an active assertion against `day\d+`/`offsetStart`/`offsetEnd`/`dayOffset`.
  Re-bucketing sits outside and after the cache branch (node_helper.js:524-527) and runs on
  every poll against that poll's `todayUtcMs`. I traced all four ways `cachedResult` can be
  produced (304, ETag-match-on-200, hash-match-on-200, stale-fallback/rejectBody) and none
  of them can carry a day key; `fetchGeoJsonCached` returns `entry.result` by reference but
  nothing downstream mutates a `match`, so the cached units stay clean across polls. No
  finding here.
- **XSS (verified clean for strings).** Every remote-sourced *string* reaching `innerHTML`
  in the two hazards renderers passes `escapeHtml`, and every color passes
  `validHazardColor`, whose `/^[0-9a-fA-F]{6}$/` is genuinely anchored in JS (no `m` flag,
  so a trailing `\n` does not slip through — verified). `entry.date` never reaches the DOM
  raw; it is laundered through `hazardsWeekdayFromDate` -> `dowToText`'s fixed array. The
  only unescaped interpolations are `offsetStart`/`offsetEnd`, which are structurally
  numbers today (see WR-06).
- **No-risk gate (works for the intended case, has an inverse leak).** The two gate terms at
  MMM-SPCOutlook.js:335-336 do prevent the short-circuit when only a window band is present.
  What they do *not* do is agree with the renderer's elapsed-entry filter, which produces
  the inverse defect (WR-04).
- **Unbounded iteration.** The day-grid loop is clamped at the header (node_helper.js:1833),
  so a hostile `[-1e9, 1e9]` span cannot spin. But the *entry* and *label-ledger* counts are
  uncapped (WR-06), and the GeoJSON body itself has no size bound (WR-07).

The blocking defect is elsewhere: the D-13 data-age check is gated on the user's location
being inside a polygon, so a stalled feed produces a silent, unbadged all-clear for exactly
the majority of locations — the false-negative class this module exists to prevent, and the
one case its own comment (c) does not actually cover. Below that, the `showDrought` filter is
baked into a URL-keyed cache with no toggle dimension, the D-09 flooding exclusion is
defeated by a single trailing space, and the operator helper `scripts/hazards-at.js`
misreports both routing and freshness.

The probe harness is at 65/65 and I confirmed it runs clean, but three of these findings sit
in gaps the harness does not reach (the empty-match staleness case, the elapsed-band case,
and every `_isWithinStaleWindow` path for this product).

## Critical Issues

### CR-01: A stalled Hazards Outlook feed produces a silent all-clear whenever no polygon contains the user

**File:** `node_helper.js:492-518`
**Issue:** The D-13/D-14 data-age check is guarded by `matches.length > 0`, and `matches` is
the post-containment, post-`includesFeat` result — features that contain *this user's
location*. A layer can carry 27 features with a five-day-old `idp_filedate` and, if none of
them contains the user, `matches` is `[]`, the age check never runs, `anyStale` stays false,
and the display renders the bare "No Severe Weather Risk" branch with no ⚠ badge.

Comment (c) at node_helper.js:504-507 defends "a zero-feature layer has no `idp_filedate` to
read." That is a narrower case than the code implements. The implemented behavior is "zero
*matching* features," which is the common case, not the rare one — most locations sit outside
most hazard polygons most of the time. This inverts the badge's meaning exactly where it
matters most: the user who sees content gets a correct staleness signal, and the user who
sees *nothing* — who has no other cue that the data is eight days old — gets a confident
all-clear. That is the same failure shape CR-01 already fixed once at
MMM-SPCOutlook.js:297 ("a degraded read is never an all-clear") and that
`_runArcGisDayProduct`'s catch (node_helper.js:313-319) already fixed for ERO/WSSI.

Note this is not caught by the probe: `hazards-zero-feature-layers-render-nothing-and-are-not-stale`
(scripts/probe-payload-resilience.js:4047) routes genuinely empty collections, so it asserts
the sanctioned case and never reaches this one.

`idp_filedate` is a static remote publish timestamp, not clock-derived, so caching it
alongside the matches does **not** violate the cache contract.

**Fix:** Carry the layer's filedate independently of containment. Extend the cached unit with
one clock-independent scalar (still no day key, no offset):

```js
// _cacheHazardMatches — cache the layer's own filedate beside the matches
this._geoJsonCache.set(url, {
  mode: fetchResult.mode,
  etag: fetchResult.newEtag ?? null,
  hash: fetchResult.newHash ?? null,
  // `idp_filedate` is a remote publish timestamp, not a value derived from our clock,
  // so it is clock-INDEPENDENT and safe under this product's cache contract.
  result: { matches: whitelisted, layerFiledate },
  timestamp: this._nowMs()
});
```

and derive `layerFiledate` on the miss path from the layer body rather than from the matches:

```js
// _runArcGisHazardWindowProduct — miss branch
const polys = this.extractPolygons(fetchResult.data, row.toValue, includesFeat, url);
// Read the filedate off the RAW body, before containment filtering, so a layer whose
// features all miss the user still ages out.
const layerFiledate = this._hazardLayerFiledate(fetchResult.data);
...
// freshness check, now independent of matches.length
if (typeof layerFiledate === "number" &&
    (this._nowMs() - layerFiledate) > row.maxDataAgeHours * 60 * 60 * 1000) {
  anyStale = true;
}
```

with

```js
_hazardLayerFiledate(geojson) {
  const features = geojson && Array.isArray(geojson.features) ? geojson.features : [];
  for (const f of features) {
    const v = f && f.properties && f.properties.idp_filedate;
    if (typeof v === "number" && Number.isFinite(v)) return v;
  }
  return null;   // a genuinely zero-feature layer still has nothing to age — comment (c)
}
```

This preserves comment (c)'s real intent (a truly empty layer is a real answer) while
closing the containment-shaped hole. Add a probe scenario: a layer with features whose
`idp_filedate` is `maxDataAgeHours + 5` old and `turfStub.pointInPolygon = () => false`,
asserting `out._stale === true`.

## Warnings

### WR-01: `showDrought` is baked into a URL-keyed cache with no toggle dimension, and the frontend has no drought term at all

**File:** `node_helper.js:461-467, 478-488`; `MMM-SPCOutlook.js:598-601`
**Issue:** `includesFeat` closes over `productToggles.showDrought` and is applied inside
`extractPolygons` on the **miss** path only. The surviving matches are then written to
`_geoJsonCache` keyed by URL alone. On every subsequent hit (304, ETag match, hash match,
stale fallback) the drought decision made at cache-fill time is replayed verbatim, and
`includesFeat` is never consulted again.

The cache is invalidated on a location change (node_helper.js:2130-2142) but on nothing else,
and MagicMirror runs one `node_helper` per module *type* — a fact this file documents at
length (node_helper.js:176-181, 993-1007). Two configured instances with different
`showDrought` values therefore share one cache: whichever polls first fills it, and the other
renders drought labels its own config disabled (or misses drought it enabled) until the
upstream bytes change — which, at this product's Mon-Fri cadence and 84-hour age tolerance,
can be days.

There is no second line of defense: unlike every other product, the frontend applies no
`showDrought` filter of its own. `renderHazardsDays`/`renderHazardsWindowBand` render whatever
labels arrive. That is precisely the disagreement WR-09's own comment
(MMM-SPCOutlook.js:265-275) says must not exist: "the gate and the render agree about what is
displayable."

**Fix:** Either make the toggle part of the cache identity, or move the gate after the cache.
The second is smaller and keeps the cache product-agnostic — cache the *unfiltered* matches
and apply the drought/exclusion gate at bucket time, where it runs identically on a hit and a
miss, exactly as re-bucketing already does:

```js
// extractPolygons predicate keeps only the structural check
const includesFeat = (label, val) => Boolean(val);
...
// applied per poll, in the same place and for the same reason as re-bucketing
const displayable = (label) =>
  !row.excludedLabels.includes(label) &&
  !(row.droughtLabels.includes(label) && productToggles.showDrought !== true);

for (const match of matches) {
  if (!displayable(match.label)) continue;
  this._bucketHazardMatch(match, layer, todayUtcMs, dayBuckets, windowEntries);
}
```

Add a matching frontend term so the two ends cannot silently disagree, and a probe scenario
that warms the cache with `showDrought: true` and then polls with `showDrought: false`,
asserting no drought label survives.

### WR-02: D-09's "hard exclusion with no config override" is defeated by a trailing space or a case change

**File:** `node_helper.js:461-467`; `productRegistry.js:151, 156`
**Issue:** Both gates are exact-string `Array.prototype.includes` against the raw upstream
`f.properties.label`:

```js
if (row.excludedLabels.includes(val)) return false;
if (row.droughtLabels.includes(val) && productToggles.showDrought !== true) return false;
```

An upstream value of `"Flooding Likely "`, `"flooding likely"`, or one carrying a non-breaking
space passes both gates and renders — attributing the National Flood Outlook's data to the
Hazards Outlook, which is the single thing D-09 exists to prevent. The same applies to
`"Severe Drought "` bypassing the `showDrought` default-off gate, which is a user-visible
config violation rather than a cosmetic drift.

This codebase already knows the answer and applied it one row up: `winterImpact.toValue`
folds before the lookup (`raw.trim().toUpperCase()`, productRegistry.js:246-250) with a
comment naming this exact trap as WSSI-02.

**Fix:** Normalize once, in the row's `toValue`, so every downstream consumer sees a canonical
value — and normalize the registry's own lists the same way so the comparison is symmetric:

```js
// productRegistry.js
const normalizeHazardLabel = (s) => (typeof s === "string" ? s.trim() : "");
...
toValue: (label, f) => normalizeHazardLabel(f && f.properties && f.properties.label),
```

Trim only (not case-fold) preserves D-11's "renders verbatim" contract for display while
closing the whitespace bypass. If case robustness is also wanted, keep the display string but
compare on a folded key.

### WR-03: `_bucketHazardMatch` hardcodes the day span `3`/`14` that the registry declares

**File:** `node_helper.js:1833`; `productRegistry.js:135-142, 328`
**Issue:** The payload assembly loop is registry-driven
(`for (let d = row.dayRangeTotal[0]; d <= row.dayRangeTotal[1]; d++)`, node_helper.js:576),
but the clamp that decides which days a match can reach is not:

```js
for (let d = Math.max(offsetStart, 3); d <= Math.min(offsetEnd, 14); d++) {
```

`_bucketHazardMatch` is not even given `row`, so the two ends cannot be tied together. Change
`dayRangeTotal` to `[3, 21]` and you get a correct 19-key payload whose days 15-21 render
empty forever, with no error at either end — the exact defect `daySpanOf`'s own 20-line
comment (productRegistry.js:36-52) condemns and calls "not a cosmetic duplication."

The registry compounds this in two ways: `dayRangeTotal: dayRangeOf([3, 14])` *restates* a
span already implied by `hazardsOutlookLayers` (min `dayRange[0]` = 3, max `dayRange[1]` = 14)
rather than deriving it, and the per-layer `dayRange` literals `[3,7]`/`[8,14]` never pass
through `dayRangeOf` at all — so the validator that exists to make an invalid span
unrepresentable guards only the one value that is itself redundant.

**Fix:** Derive the total from the layers and thread it into the bucketer:

```js
// productRegistry.js
function dayRangeSpanning(layers) {
  const firsts = layers.map((l) => dayRangeOf(l.dayRange)[0]);   // validates each layer too
  const lasts  = layers.map((l) => dayRangeOf(l.dayRange)[1]);
  return dayRangeOf([Math.min(...firsts), Math.max(...lasts)]);
}
...
dayRangeTotal: dayRangeSpanning(hazardsOutlookLayers),
```

```js
// node_helper.js — pass the range, drop the literals
_bucketHazardMatch(match, layer, todayUtcMs, dayBuckets, windowEntries, dayRangeTotal) {
  ...
  const [firstDay, lastDay] = dayRangeTotal;
  for (let d = Math.max(offsetStart, firstDay); d <= Math.min(offsetEnd, lastDay); d++) {
```

### WR-04: The window-band no-risk gate does not apply the renderer's elapsed-entry filter

**File:** `MMM-SPCOutlook.js:262-266` and `:557`
**Issue:** The gate term counts every band entry:

```js
const hazardsOutlookHasWindowEntries = (block) => {
  ...
  return Array.isArray(block.windowBand) && block.windowBand.length > 0;
};
```

but the renderer drops entries whose window has already elapsed:

```js
if (typeof entry.offsetEnd === "number" && entry.offsetEnd < 0) continue;
```

A payload whose `windowBand` contains only elapsed entries, with every day array empty,
therefore disqualifies the "No Severe Weather Risk" short-circuit, renders nothing (not even
the "Extended Hazards:" heading, because `headingWritten` is set inside the loop *after* the
`continue`), reaches `wrapper.innerHTML === contentMarker`, and prints **"No Severe Weather
Risk (unconfirmed)"** on data that is neither stale nor degraded. That is a false staleness
signal — the mirror image of CR-01 and the same trust erosion D-15's asymmetry
(node_helper.js:496-502) was written to avoid.

`_bucketHazardMatch` guards `offsetEnd < offsetStart` but imposes no lower bound on the band
path, so a feature with a past `end_date` (a backfill, a correction, a >7-day upstream stall)
reaches the band with a negative `offsetEnd`. Reachability is low but nonzero, and the
renderer's own guard is proof the authors expect it.

The same asymmetry exists in the smaller direction: `hazardsOutlookHasAnyDay` counts
`hazards.length > 0` while `renderHazardsDays` additionally filters
`h && typeof h === "object"` and `continue`s when nothing survives.

**Fix:** Give the gate and the renderer one shared predicate rather than two that drift —
this is the same WR-09 remedy `enabledAdvisories()` already applies to the advisory band:

```js
// One definition of "renderable", used by the gate at :336 and the loop at :555.
const renderableWindowEntries = (block) => {
  if (!block || typeof block !== "object" || !Array.isArray(block.windowBand)) return [];
  return block.windowBand.filter((e) =>
    e && typeof e === "object" && !(typeof e.offsetEnd === "number" && e.offsetEnd < 0));
};
const hazardsOutlookHasWindowEntries = (block) => renderableWindowEntries(block).length > 0;
```

and have `renderHazardsWindowBand` iterate `renderableWindowEntries(block)`. Apply the same
treatment to `hazardsOutlookHasAnyDay` / `renderHazardsDays`.

### WR-05: The `_nowMs()` clock seam is bypassed by `_isWithinStaleWindow` and the three cache-hit timestamp refreshes

**File:** `node_helper.js:1661-1664, 1888, 1958, 1974` vs `node_helper.js:423`
**Issue:** `_cacheHazardMatches` stamps `timestamp: this._nowMs()`, and the data-age check
reads `this._nowMs() - filedate`. But `_isWithinStaleWindow` compares against `Date.now()`,
and all three cache-hit paths refresh `entry.timestamp = Date.now()`. The seam's own doc
comment (node_helper.js:1692-1701) states its purpose is to make the day-offset-drift
regression — "the phase's highest-risk item" — testable, yet the timestamps that decide
whether a cached reading may be *served* are outside it.

This is already producing a clock-dependent harness. `HAZARDS_NOW_MS` is
`Date.UTC(2026, 7, 26, 13, 0)` (scripts/probe-payload-resilience.js:316), which is now over a
day behind the real clock. Any hazards scenario that warms the cache and then hits a network
error, a non-`ok` status, or `rejectBody` computes
`Date.now() - HAZARDS_NOW_MS` ≈ 24h against a 2-hour window and takes the *hard-failure*
branch, where when the phase was authored it would have taken the *stale-fallback* branch.
The scenarios pass today only because none of them exercises `_isWithinStaleWindow` for this
product — which is itself the gap: the stale-fallback path is unexercised for
`arcgis-hazard-window`.

In production both are `Date.now()`, so there is no user-facing symptom today; the defect is
that a stated seam does not cover the thing it claims to, and the harness's behavior silently
changes with the wall clock.

**Fix:** Route every clock read in the caching layer through the seam:

```js
_isWithinStaleWindow(timestamp, intervalMinutes) {
  const intervalMs = (intervalMinutes ?? 60) * 60 * 1000;
  return (this._nowMs() - timestamp) < intervalMs * STALE_WINDOW_INTERVALS;
}
```

and replace the three `entry.timestamp = Date.now()` refreshes with `this._nowMs()`. Then add
a hazards scenario covering the warm-cache + network-error path, which is currently
unreachable for this product.

### WR-06: Remote-controlled unbounded growth — the unmapped-label ledger and the window-band entry count

**File:** `node_helper.js:187, 560-570`; `node_helper.js:544-556`
**Issue:** T-16-20 correctly bounded label *length* at the render boundary
(`HAZARDS_LABEL_MAX_CHARS = 60`), but two remote-controlled *counts* are unbounded, and this
runs on a Raspberry Pi:

1. `this._loggedUnmappedHazardLabels` is a process-lifetime `Set` keyed by raw upstream label
   strings, with no cap. D-11 says unmapped labels render verbatim and log once per process —
   a feed serving many distinct junk labels grows this Set for the life of the process. Note
   the label is stored **untruncated** here (truncation happens only at the frontend render
   boundary), so a 1 MB hostile label is retained in full, permanently, per distinct value.
2. `windowBand` has no entry cap. Deduping is by `label|offsetStart|offsetEnd`, which bounds
   nothing when labels vary. Every surviving entry becomes a DOM line via
   `wrapper.innerHTML +=`, and reassigning `innerHTML` re-parses the whole subtree each time.
   Compare the advisory path, which does cap (`ADVISORY_MAX_CANDIDATES`) and logs when it
   truncates.

Separately, `offsetStart`/`offsetEnd` are interpolated into `innerHTML` at
MMM-SPCOutlook.js:574-576 with no type check, while the elapsed guard three lines above *does*
type-check `offsetEnd`. They are structurally numbers today (`Math.round` of a
`Number.isFinite`-validated input), so this is not an exploitable XSS — but it is the only
place in the hazards renderers where a payload-sourced value skips both `escapeHtml` and a
type guard, and the file's own WR-12 comment sets the rule that it should not.

**Fix:**

```js
// node_helper.js — cap the ledger; the truncated key is enough to dedupe a log line
const MAX_LOGGED_UNMAPPED_LABELS = 64;
const key = String(label).slice(0, 60);
if (!mapped && !this._loggedUnmappedHazardLabels.has(key) &&
    this._loggedUnmappedHazardLabels.size < MAX_LOGGED_UNMAPPED_LABELS) {
  this._loggedUnmappedHazardLabels.add(key);
  Log.info("... unmapped hazard label rendered verbatim in the default style: " + key);
}

// node_helper.js — cap the band, and say so when it fires (the ADVISORY_MAX_CANDIDATES idiom)
const HAZARDS_MAX_WINDOW_ENTRIES = 40;
if (windowBand.length > HAZARDS_MAX_WINDOW_ENTRIES) {
  Log.error(`MMM-SPCOutlook ${row.id}: ${windowBand.length} window-band entries; keeping ${HAZARDS_MAX_WINDOW_ENTRIES}`);
  windowBand.length = HAZARDS_MAX_WINDOW_ENTRIES;
}
```

```js
// MMM-SPCOutlook.js — coerce the offsets rather than trusting the payload's types
const off = (n) => (typeof n === "number" && isFinite(n) ? String(Math.trunc(n)) : "?");
const offsetSegment = singleDay
  ? "(D" + off(entry.offsetStart) + ")"
  : "(D" + off(entry.offsetStart) + "–" + off(entry.offsetEnd) + ")";
```

### WR-07: `fetchGeoJsonCached` reads an unbounded response body; Phase 16 adds six new URLs to that path

**File:** `node_helper.js:1911` (`rawText = await res.text()`)
**Issue:** The KML-advisory transport enforces `ADVISORY_MAX_BODY_BYTES` (8 MB) with a
`content-length` precheck (node_helper.js:92, 1150-1160), and the deleted `fetchGeoJson`'s
tombstone comment (node_helper.js:1653-1660) explicitly names "no body bound" as one of the
reasons it was dangerous. `fetchGeoJsonCached` has no such bound: it buffers the entire body
into a string and then `JSON.parse`s it, doubling peak memory. On a Pi a hostile or corrupted
multi-hundred-MB response is an OOM, not a rejected body.

This is inherited rather than introduced, but Phase 16 adds six new endpoints to the
unbounded path (from ~25 to ~31 call sites), and the mitigating pattern already exists in
this file.

**Fix:** Apply `fetchBinBuffer`'s guard shape to the GeoJSON path — precheck `content-length`,
then bound the accumulated text — and route an over-limit body through the existing
`rejectBody(...)` so it inherits the stale-fallback and `failed` semantics rather than
throwing.

### WR-08: `scripts/hazards-at.js` misreports routing for exactly the case D-04 exists to handle

**File:** `scripts/hazards-at.js:32`
**Issue:**

```js
const route = h.L.group==='precipitation' ? 'per-day grid' : 'window band';
```

Production routes a Precipitation feature to the **window band** when
`_isFullNominalWindow(offsetStart, offsetEnd, layer.dayRange)` holds — the D-04 guard, the
locked exact-alignment reading. The helper's header promises it "prints ... the day offsets
the module will compute," so for the one Precipitation case that D-04 singles out, the
operator is told "per-day grid" while the module renders a band entry. It also ignores the
`[3, 14]` clamp, so a Precipitation feature at D0-D2 or D15+ is reported as reaching the grid
when it reaches nothing.

Compounding it, the script re-implements production arithmetic instead of importing it:
`off` (line 13) duplicates `_hazardDayOffset`, `iso` duplicates `_utcDateString`, and
`86400000` is written out where node_helper defines `MS_PER_DAY`. A verification tool that
re-derives the logic it verifies can only tell you the two agreed at the moment someone typed
them.

**Fix:** Reproduce the real routing decision, and mark the clamp:

```js
const nominal = (s, e, [a, b]) => s === a && e === b;   // mirrors _isFullNominalWindow
const route = (h.L.group !== 'precipitation' || nominal(h.s, h.e, h.L.dayRange))
  ? 'window band'
  : (h.e < 3 || h.s > 14 ? 'per-day grid (clamped out — renders nothing)' : 'per-day grid');
```

Better still, export `_hazardDayOffset`/`_utcDateString`/`_isFullNominalWindow` from a shared
module and have both node_helper.js and this script consume them, so drift is impossible.

### WR-09: `scripts/hazards-at.js` reports "fresh (no warning)" when `idp_filedate` is missing

**File:** `scripts/hazards-at.js:23, 36-37`
**Issue:** `age` is computed as `((Date.now()-p.idp_filedate)/3600000).toFixed(1)`. When
`idp_filedate` is absent the arithmetic yields `NaN`, `toFixed` yields the string `"NaN"`,
`Math.max(...)` yields `NaN`, and `NaN > row.maxDataAgeHours` is `false` — so the script
prints `fresh (no warning)` for a feature whose publish age is unknown. A verification helper
whose failure mode is a false all-clear reproduces, in the operator's tooling, the exact
defect class the module is built to prevent.

Two adjacent gaps in the same file: there is no `res.ok` check and no `try`/`catch` around
`(await fetch(...)).json()`, so an HTML error page or an ArcGIS 200-with-error-object surfaces
as an unhandled rejection and a stack trace instead of a diagnosis; and there is no fetch
timeout, unlike every request in node_helper.js (`FETCH_TIMEOUT_MS`).

**Fix:**

```js
const ages = hits.map(h => Number(h.age)).filter(Number.isFinite);
if (ages.length !== hits.length) {
  console.log(`  freshness: ${hits.length - ages.length} hit(s) carry no usable idp_filedate — age UNKNOWN`);
}
const maxAge = ages.length ? Math.max(...ages) : null;
console.log(`  freshness: ${maxAge === null ? 'UNKNOWN (treat as stale)' :
  `oldest contributing idp_filedate ${maxAge}h vs ${row.maxDataAgeHours}h threshold -> ` +
  (maxAge > row.maxDataAgeHours ? 'STALE (warning expected)' : 'fresh (no warning)')}`);
```

and wrap the fetch:

```js
const res = await fetch(row.buildUrl(L.id), { signal: AbortSignal.timeout(15000) });
if (!res.ok) { console.error(`layer ${L.id}: HTTP ${res.status}`); continue; }
let gj; try { gj = await res.json(); }
catch (e) { console.error(`layer ${L.id}: unparseable body — ${e.message}`); continue; }
```

## Info

### IN-01: Window-band dedupe key concatenates a remote-controlled label with `|`

**File:** `node_helper.js:547`
**Issue:** `const key = entry.label + "|" + entry.offsetStart + "|" + entry.offsetEnd;` — a
label containing `|` can construct a key that collides with a different
`(label, offsetStart, offsetEnd)` triple, silently dropping a real band entry. Contrived
against WPC's legend, but the label is remote and D-11 explicitly accepts unknown values.
**Fix:** Use a delimiter that cannot appear in the source (`" "`), or key a `Map` on the
label and dedupe offsets within it.

### IN-02: `hazards-at.js` diverges from the codebase's transport and naming conventions

**File:** `scripts/hazards-at.js:9-13, 18`
**Issue:** The script uses global `fetch` while every other request in the project goes
through the `node-fetch` dynamic-import wrapper (node_helper.js:2), so it silently requires a
newer Node than the module does. The single-character names (`rc`, `pc`, `gc`, `off`, `iso`,
`n`, `L`, `p`, `h`, `gj`, `i2`) and the one-line dense-function style are unlike anything else
in the repo, which makes the routing bug in WR-08 harder to spot than it should be.
**Fix:** Terseness is defensible in a throwaway probe, but this one is checked in and is the
documented operator verification path. Name the geometry helpers
(`ringContains`/`polygonContains`/`geometryContains`), reuse `MS_PER_DAY`, and note the
minimum Node version in the usage header.

---

_Reviewed: 2026-08-27_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
