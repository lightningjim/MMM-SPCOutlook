---
phase: 18-merge-precedence-unified-payload-schema
reviewed: 2026-09-06T01:23:20Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - node_helper.js
  - MMM-SPCOutlook.js
  - hazardTaxonomy.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 4
  warning: 11
  info: 6
  total: 21
status: issues_found
---

# Phase 18: Code Review Report

**Reviewed:** 2026-09-06T01:23:20Z
**Depth:** deep
**Files Reviewed:** 4
**Status:** issues_found

## Summary

Reviewed the Phase 18 diff (`88d4749^..HEAD`, 3756 insertions / 35 deletions) across
`hazardTaxonomy.js` (new), `node_helper.js` (+1441), `scripts/probe-payload-resilience.js`
(+1991) and `MMM-SPCOutlook.js` (+20), plus surrounding call chains in `getSpcOutlook`,
`_runArcGisDayProduct`, `_runArcGisHazardWindowProduct`, `_runHeatRiskProduct`,
`fetchGeoJsonCached` and `productRegistry.js`.

The scope guidance's specific question is answered first: **commit `03420ea` is correctly
threaded.** `_addRegistryDayGridEntries` has exactly two reachable call sites
(`node_helper.js:5013`, `node_helper.js:5016`), both inside `getSpcOutlook`, both passing
`productToggles`, which itself is resolved at `node_helper.js:4073` as
`products ?? this._products ?? this._productToggles()` and can therefore never be
`undefined` at the `productToggles[row.configFlag]` read. No other file references the
method. `87f41dd`'s `Math.max(gridStart, gridEnd - 1)` is correct for the two cases it was
written for, but leaves a third case open (CR-03 below).

Four Critical findings. Three of them are the exact recurring failure mode the domain
context names — a real hazard silently dropped or a whole payload collapsing into
something the user reads as an all-clear:

* **CR-01** — Phase 18 added three unguarded dereferences of a value the surrounding code
  explicitly documents as nullable, converting `Promise.allSettled`'s per-member degrade
  into a whole-payload `{ error }` outage. One of them (`hazardsPayload.windowBand`) fires
  on **every** poll.
* **CR-02** — `_addHeatRiskGridEntries` mixes product-day units with grid-day units in its
  span guard, silently dropping the outermost HeatRisk day from `days[]` for the entire
  00Z-12Z half of every UTC day. Reproduced empirically: 7 Extreme-heat tiles in, 6 out.
* **CR-03** — the new grid's `end_date` endpoint reading disagrees with the legacy
  bucketer's for every multi-day Precipitation span. Reproduced empirically: legacy emits
  3 days, `days[]` emits 2. Phase 19 deletes the legacy path, so this becomes a straight
  hazard-day loss.
* **CR-04** — `_spcGridAnchor` never checks that an observed `EXPIRE_ISO` window has not
  already elapsed, so a cached day-1 outlook served during SPC's daily re-issuance gap
  anchors the whole 14-day grid a day early.

The taxonomy artifact itself is the strongest work in the phase: `dimensionOf` is
`hasOwnProperty`-guarded on both lookups, `assertTaxonomyIntegrity` is genuinely
structural, and deriving the `wpc-hazards` key set from `PRODUCT_REGISTRY.displayColor`
closes a real drift class. No injection, path-traversal, SSRF or XSS surface was introduced
by this phase — the new payload keys (`days`/`summary`/`sources`) are not yet rendered, and
the frontend diff is a wall-clock log line only.

## Critical Issues

### CR-01: Three unguarded reads of a documented-nullable runner payload collapse the whole poll

**File:** `node_helper.js:4887`, `node_helper.js:5013-5017`, `node_helper.js:5035`
**Issue:**
`node_helper.js:4755-4761` states the contract explicitly:

> A rejected member's `payload`/`entries` downstream consumers (`eroPayload`, `wssiPayload`,
> `hazardsPayload`, `heatRiskPayload`, and `advisories[row.id]`) all guard on a
> falsy/non-object block before reading into it [...] so a substituted `payload: null` on
> rejection degrades that one product to a silent no-risk render rather than a throw.

Phase 18 broke that contract in three places, all of which read into `payload` with no guard:

1. `node_helper.js:4887` — `JSON.stringify(eroPayload.day1ValidTime)`
2. `node_helper.js:5013-5017` — `_addRegistryDayGridEntries(..., eroPayload, ...)` /
   `(..., wssiPayload, ...)`, whose loop body does `payload[\`day${d}Risk\`]` with no
   null check (the toggle gate at `:3270` returns early only when the toggle is *off*, so
   an enabled-but-rejected product reaches the dereference)
3. `node_helper.js:5035` — `_buildGridSummary(gridDays, hazardsPayload.windowBand, ...)`.
   `_buildGridSummary` guards with `Array.isArray(windowBand)` *inside* the function, but
   the property access happens at the call site, before the guard.

Verified against the shipped code:

```
_addRegistryDayGridEntries THREW: TypeError Cannot read properties of null (reading 'day1Risk')
eroPayload.day1ValidTime  THREW: TypeError Cannot read properties of null (reading 'day1ValidTime')
hazardsPayload.windowBand THREW: TypeError Cannot read properties of null (reading 'windowBand')
```

The throw lands in `getSpcOutlook`'s outer `catch`, which returns `{ error: ... }`, and
`MMM-SPCOutlook.js:421-422` renders `wrapper.textContent = "Error: " + this.spcrisk.error`.
Every product on the display is gone, including active SPC convective and HeatRisk data
that fetched cleanly. That is precisely the "let one throw discard five healthy payloads
into this function's own outer catch [...] the 'total outage rendering as a confident
all-clear' shape 14-REVIEW's round-3 deep review found as that phase's highest-severity
finding" that the `allSettled` comment above was written to prevent.

Site 3 fires on **every** poll; site 1 fires on the first poll of every process
(`_loggedEroValidTimeSample` guards only later polls); sites 2 fire whenever the respective
toggle is on.

**Fix:**

```js
// node_helper.js:4887
if (!this._loggedEroValidTimeSample) {
  Log.info("MMM-SPCOutlook: excessiveRain.day1ValidTime sample: " +
           JSON.stringify(eroPayload && eroPayload.day1ValidTime));
  this._loggedEroValidTimeSample = true;
}

// node_helper.js:5035
this._buildGridSummary(
  gridDays, hazardsPayload && hazardsPayload.windowBand, advisories, sourceHealth, gridAnchorInfo
);

// node_helper.js:3261 — guard at the head of the function, beside the toggle gate,
// so both call sites are covered by one check rather than two at the call sites.
_addRegistryDayGridEntries(gridDays, sourceId, payload, row, notes, productToggles) {
  if (!payload || typeof payload !== "object") return; // rejected runner: degrade, never throw
  if (productToggles[row.configFlag] !== true) return;
  ...
```

Add a probe scenario that forces one runner to reject (not merely fail its fetch) and
asserts `assertPayloadIntact(out)` still holds — none of the 119 existing scenarios covers
the `allSettled` rejection branch.

---

### CR-02: `_addHeatRiskGridEntries` drops the outermost HeatRisk day for half of every UTC day

**File:** `node_helper.js:2986` (`if (gridDay < 1 || gridDay > GRID_DAY_COUNT || gridDay > row.days) continue;`)
**Issue:**
`gridDay` is computed against the **SPC 12Z grid anchor** (`_gridDayOf(tuple.idpValidtime,
anchorInfo.nominalStartMs)`), but `row.days` (7) is HeatRisk's own span expressed in
**product-day units anchored at UTC midnight**. The two units differ by exactly one during
the 00Z-12Z half of every UTC day, because `_spcGridAnchor`'s clock fallback resolves
`nominalStartMs` to *yesterday* 12Z when `getUTCHours() < 12` (`node_helper.js:2551-2554`).
The `gridDay > row.days` term then discards the seventh tile.

The comment on that line claims the bound "is read from the registry row, never a literal,
so this product's declared span has exactly one declaration" — but it is reading a span
declared in a different coordinate system from the value it is comparing.

Reproduced against the shipped code, poll at 06:00Z with no SPC anchor available (the
common case — see CR-04's note on `_validTimeOfWinner`), seven catalog tiles all at
category 4 ("Extreme"):

```
anchor: estimated 2026-09-04T12:00:00.000Z
grid day 2 2026-09-05 ["Extreme"]
grid day 3 2026-09-06 ["Extreme"]
grid day 4 2026-09-07 ["Extreme"]
grid day 5 2026-09-08 ["Extreme"]
grid day 6 2026-09-09 ["Extreme"]
grid day 7 2026-09-10 ["Extreme"]
reportedDays heatrisk: [ 2, 3, 4, 5, 6, 7 ]
tiles supplied: 09-05T12Z 09-06T12Z 09-07T12Z 09-08T12Z 09-09T12Z 09-10T12Z 09-11T12Z
```

Seven Extreme-heat readings in, six out. The 2026-09-11 tile lands on grid day 8, is
dropped by `gridDay > row.days`, and is not even recorded in `reportedDays` — so
`sources.heatrisk.reportedDays` reports the source never covered that day, and
`_resolveGridDayPrecedence` takes its "Path B — absent" branch, leaving nothing to
distinguish this from a genuine gap in the feed.

This is the same defect class as the already-filed Phase 17 `_runHeatRiskProduct` offset-0
drop, but it is a **new, distinct** defect on the **new** grid path (the filed one drops the
near day from the legacy `heatRisk.day1..day7` block; this one drops the far day from
`days[]`), and it is on a heat-safety path.

`GRID_DAY_COUNT` (14) already bounds the loop safely, and `_addHazardsOutlookGridEntries`
correctly clamps to `GRID_DAY_COUNT` alone.

**Fix:** drop the mismatched term. The grid bound is the only bound expressed in grid-day
units, and it is already there:

```js
// node_helper.js:2986
// GRID_DAY_COUNT is the only bound in grid-day units. row.days is HeatRisk's span in
// its own UTC-midnight-anchored day numbering and cannot be compared against a grid day:
// the two differ by one for the whole 00Z-12Z half of a UTC day.
if (gridDay < 1 || gridDay > GRID_DAY_COUNT) continue;
```

Add a probe scenario pinned to a `now` in the 00Z-12Z half (every merge scenario currently
pins 13:00Z — see WR-09) that supplies `row.days` tiles and asserts `row.days` grid entries
land.

---

### CR-03: The unified grid drops the last day of every multi-day Hazards Outlook span the legacy block renders

**File:** `node_helper.js:2889` (`const lastGridDay = Math.max(gridStart, gridEnd - 1);`)
vs `node_helper.js:2812-2816` (`_bucketHazardMatch`'s inclusive loop)
**Issue:**
The legacy day bucketer treats `end_date` as **inclusive**:

```js
for (let d = Math.max(offsetStart, firstDay); d <= Math.min(offsetEnd, lastDay); d++)
```

The new grid emitter treats it as **exclusive** (`gridEnd - 1`, with `Math.max(gridStart, ...)`
added by `87f41dd` only to rescue the degenerate `start === end` case). For any span longer
than one day the two disagree by exactly one day, and the new grid is the one that loses it.

Reproduced against the shipped code with a single Precipitation-group `"Heavy Rain"` match,
`start_date 2026-09-08T00:00:00Z`, `end_date 2026-09-10T00:00:00Z`, nominal anchor
2026-09-05T12:00:00Z, `todayUtcMs` 2026-09-05T00:00:00Z:

```
NEW grid days:      4(2026-09-08), 5(2026-09-09)
LEGACY day offsets: 3, 4, 5          (Sep 8, Sep 9, Sep 10)
```

Sep 10 renders today via `hazardsOutlook.day5` and does not exist in `days["6"]`. Phase 19
deletes the legacy block, so this becomes an outright hazard-day loss on the only
representation left.

This is not hypothetical about which convention the feed uses. `18-LIVE-CAPTURE.md:212-219`
records that the **Precipitation** group — the only group that reaches the day grid at all;
Temperature and Wildfire/Drought route unconditionally to the window band at
`node_helper.js:2852-2861` — emitted `start_date === end_date`, the inclusive/zero-duration
form, while the Temperature group emitted the exclusive form. `87f41dd` handled the
zero-duration point case and left the multi-day case on the exclusive reading that the one
live sample of that group contradicts.

Under the project's "no false negatives" rule the tie should break toward the inclusive
reading (over-report one day rather than lose one), which is also what the legacy loop
already does — so the two representations converge instead of diverging.

**Fix:**

```js
// node_helper.js:2889
// The upstream feed is not internally consistent about this endpoint (18-LIVE-CAPTURE.md
// "Criterion 1"): the Precipitation group — the only group that reaches this grid — was
// observed emitting the INCLUSIVE form. Read the endpoint inclusively, matching
// _bucketHazardMatch's own loop, so `days[]` and the legacy block never disagree about a
// day and the tie breaks toward showing a hazard rather than hiding one.
const lastGridDay = gridEnd;
```

Then extend `merge-parity-unified-days-agree-with-legacy-blocks` (currently excludes
`wpc-hazards` outright, `probe-payload-resilience.js:9476-9477`) to compare a multi-day
Precipitation span across both representations, and add an inclusive-convention sibling to
`merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day`.

---

### CR-04: `_spcGridAnchor` accepts an already-elapsed `EXPIRE_ISO`, shifting the whole 14-day grid one day early

**File:** `node_helper.js:2532-2547`
**Issue:**
`_spcGridAnchor` validates that `expireMs` is finite and that `validMs` falls inside
`[nominalStartMs, day1EndMs]`. It never validates that the resulting window is the one
currently in force — i.e. that `day1EndMs` has not already passed.

SPC replaces `day1otlk_cat.lyr.geojson` at 12Z, but not instantaneously: this phase's own
research comment (`node_helper.js:2467-2470`) records a live observation of `VALID 13:00Z,
EXPIRE 12:00Z next day, ISSUE 12:54Z`. During that ~1 hour daily gap — and for longer under
this module's own stale-serving policy, since `_isWithinStaleWindow` serves a cached entry
for `2 * _updateInterval` (2 hours at the default) and the anchor is read straight off
`cachedEntry.polys` at `node_helper.js:4232-4233` — the served day-1 outlook carries
`EXPIRE_ISO` = *today* 12Z, already in the past.

`_spcGridAnchor` accepts it and returns `nominalStartMs = yesterday 12Z`, `anchor:
"observed"`. Everything downstream then shifts by a full day: `_buildGridDays` labels
`days["1"].date` as yesterday, `summary.windowStart` points at an elapsed window,
`_addSpcGridEntries` maps today's SPC day 1 onto grid day 1 (labelled yesterday), and
`_addHazardsOutlookGridEntries`/`_addHeatRiskGridEntries` re-anchor every feature one day
early. `sources["spc-convective"].gridAnchor` reads `"observed"`, so the payload actively
asserts the anchor is trustworthy.

Whether this fires is decided by an unrelated fact — whether the user happens to be inside a
day-1 convective polygon, since `_validTimeOfWinner(day1RiskPoly, loc, day1RiskResult, ...)`
with `day1RiskResult === 0` matches nothing (`extractPolygons` filters `val > 0`) and the
anchor silently degrades to the correct clock fallback. So the users who see the shifted
grid are exactly the users standing in an active severe-weather polygon.

**Fix:** reject an anchor whose window has already ended, and fall through to the clock
rule — which is already correct for this case:

```js
// node_helper.js:2534
const expireMs = typeof expireIso === "string" && expireIso ? new Date(expireIso).getTime() : NaN;
// D-11/T-18-03: an EXPIRE_ISO in the past is a stale or not-yet-reissued outlook (SPC's
// 12Z replacement is not instantaneous — live 2026-09-05 ISSUE was 12:54Z — and this
// module serves cached bodies for up to 2 * _updateInterval). Accepting it anchors the
// entire fourteen-day grid one day early while still reporting anchor: "observed".
if (Number.isFinite(expireMs) && expireMs > this._nowMs()) {
  ...
}
// else: fall through to the clock fallback below
```

Add a probe scenario routing a day-1 categorical body whose `EXPIRE_ISO` is in the past and
asserting `sources["spc-convective"].gridAnchor === "estimated"` and
`days["1"].date === <today>`.

## Warnings

### WR-01: `reportedDays` records a fetch failure as "the source answered no risk"

**File:** `node_helper.js:3115`, `:3216`, `:3301`
**Issue:** `sources[].reportedDays` is documented (`node_helper.js:3552-3557`,
`hazardTaxonomy` D-14) as the field that keeps "the source never covered that day" distinct
from "the source reported and fell below its floor". For four of the six day-scoped sources
it is instead derived from a **seeded default**, not from a successful read:

* `_runArcGisDayProduct:346-348` seeds `tiers[d] = "NONE"` before any fetch; a hard failure
  or a contained throw leaves it at `"NONE"` (`:405-411`). `_addRegistryDayGridEntries:3301`
  then calls `noteReported(sourceId, d)` for that day.
* `getSpcOutlook:4240` sets `day1RiskResult = 0` → `day1Risk = "NONE"` on a hard failure with
  no cache; `_addSpcGridEntries:3115` calls `noteReported("spc-convective", d)` unconditionally.
* Same shape for `spc-fire` at `:3216` (`day1FireRisk` stays `0`).

Commit `03420ea` closed the toggle-off half of this defect; the fetch-failure half is
untouched. Result: `sources["wpc-ero"].reporting === true` with `reportedDays: [1,2,3,4,5]`
on a poll where all five ERO fetches failed. `stale: true` is set in parallel, so the
degrade is not invisible — but the one field that exists to make the distinction reports the
wrong answer, and `summary.reportingSourceCount` over-counts.

**Fix:** thread the per-day success signal into the grid emitters rather than re-deriving it
from the payload's seeded default. The narrowest version: have `_runArcGisDayProduct` return
a `answeredDays: Set<number>` side-channel alongside `payload` (populated only where the
`try` block completed without `fetchResult.failed`), and gate `noteReported` on it in
`_addRegistryDayGridEntries`. For the SPC inline chain, add a `answered: boolean` field per
day to `spcLocals.categorical[d]` / `.fire[d]`, set from the same branch that already calls
`noteStale`, and gate `_addSpcGridEntries`'s `noteReported` on it.

---

### WR-02: `wpc-hazards` `reporting` conflates "answered" with "found something"

**File:** `node_helper.js:2919-2920`
**Issue:** `noteReported("wpc-hazards", d)` is only ever reached from inside the per-match
day loop, so `reportedDays["wpc-hazards"]` is populated **only on days that carry a hazard**.
On a healthy poll where every Hazards Outlook layer returned 200 with no polygon over the
user, `reportedDays` is empty and `_buildSourceHealth:3630-3633` derives `reporting: false`.

That directly contradicts the field's own contract two screens up
(`node_helper.js:3549-3550`): "`reporting` means 'we got an answer this poll', NEVER 'it
found a hazard' — that is `activeDays`". `summary.reportingSourceCount` undercounts by one
on every quiet poll, and a Phase 19 consumer that surfaces "source not reporting" will show a
false health warning for the most commonly-quiet product in the set.

The code acknowledges the coincidence (`:2913-2917`, "for THIS product only, 'reported' and
'active' coincide") but the coincidence only holds *conditional on a hazard existing*, which
is the case the field was designed to distinguish from.

**Fix:** record reporting once per poll from the runner's own success signal, not from the
match loop. `_runArcGisHazardWindowProduct` already knows whether each layer's fetch
completed; return a `reported: boolean` (or the set of grid days its `dayRangeTotal`
covers) and have `getSpcOutlook` call `noteReported("wpc-hazards", d)` for
`d = row.dayRangeTotal[0] .. row.dayRangeTotal[1]` once, before
`_addHazardsOutlookGridEntries` runs.

---

### WR-03: A static taxonomy invariant is asserted with a throw on the per-day hot path

**File:** `node_helper.js:3303-3310`
**Issue:** The `NO_RISK_FLOOR[sourceId] !== FLOOR_PREBAKED` check sits **inside** the
`for (let d = 1; d <= row.days; d++)` loop, after `notes.noteReported(sourceId, d)` has
already fired for day 1. It asserts a property of static module configuration that cannot
change between iterations, and it re-evaluates it up to 5 times per product per poll on a
Raspberry Pi.

More importantly it `throw`s. There is no local catch, so the throw escapes into
`getSpcOutlook`'s outer catch and returns `{ error }` — the same total-outage shape as CR-01
— and it leaves `reportedDays[sourceId]` half-populated. `hazardTaxonomy.js`'s own stated
discipline is the opposite: "Throws (never warns, never degrades) on a structurally invalid
taxonomy — a bad edit fails loudly **at process start** instead of silently mis-attributing
hazards at poll time (T-18-06)."

**Fix:** move the invariant into `assertTaxonomyIntegrity()`, where the rest of the
`NO_RISK_FLOOR` shape validation already lives, so a mis-wiring fails at `require()` time:

```js
// hazardTaxonomy.js, inside assertTaxonomyIntegrity's DAY_SOURCE_IDS loop
const REGISTRY_DAY_GRID_SOURCES = ["wpc-ero", "wpc-wssi"]; // _addRegistryDayGridEntries' domain
if (REGISTRY_DAY_GRID_SOURCES.includes(sourceId) && floor !== FLOOR_PREBAKED) {
  throw new Error("hazardTaxonomy: NO_RISK_FLOOR[\"" + sourceId + "\"] must be FLOOR_PREBAKED — " +
                  "_addRegistryDayGridEntries assumes the floor was applied at extractPolygons time");
}
```

and delete the in-loop throw entirely.

---

### WR-04: `detail.probRisk` carries two different types under one unified-schema field name

**File:** `node_helper.js:3146-3152`, `:3195`
**Issue:** In `days[].hazards[].detail`:

* grid days 1-2: `probRisk` is `day1ProbRisk`/`day2ProbRisk`, a **boolean**
  (`node_helper.js:4295`, `day1TorRisk > 0 || day1HailRisk > 0 || day1WindRisk > 0`)
* grid day 3: `probRisk` is `day3ProbRisk`, a **number** (a probability from
  `evaluatePolygons(poly, loc, percComparator)`)
* grid days 4-8: `probRisk` is `day4ProbRisk`..`day8ProbRisk`, also **numbers**

The legacy `day1`/`day3` blocks carry the same inconsistency, so this is inherited — but the
whole point of `days[]` is a *unified* schema, and the phase's own payload JSDoc
(`node_helper.js:4034-4036`) documents `detail` as a single shape. A Phase 19 renderer doing
`if (detail.probRisk > 0.15)` gets `true > 0.15 === false` on days 1-2 and silently renders
nothing.

`hasDetail = Object.values(detail).some((v) => !!v)` compounds it: a genuine `probRisk: 0`
with `torCig: 0` and every other field falsy omits `detail` entirely, so consumers must
handle three states (absent / boolean / number).

**Fix:** normalise at the boundary, in `_addSpcGridEntries`:

```js
// Days 1-2 carry a boolean "any probabilistic area at all"; days 3-8 carry a probability.
// Publish both under distinct names so one field never has two types.
const detail = d === 3
  ? { probRisk: day.probRisk, cig: day.cig }
  : { hasProbRisk: day.probRisk === true, torRisk: day.torRisk, torCig: day.torCig,
      hailRisk: day.hailRisk, hailCig: day.hailCig, windRisk: day.windRisk, windCig: day.windCig };
```

and document the split in the payload JSDoc.

---

### WR-05: `_addHazardsOutlookGridEntries` omits the `dayRange` guard its twin has

**File:** `node_helper.js:2861` vs `node_helper.js:2805-2811`
**Issue:** `_bucketHazardMatch` explicitly guards its span argument before use, logs, and
returns:

```js
if (!Array.isArray(dayRangeTotal) || !Number.isInteger(dayRangeTotal[0]) || !Number.isInteger(dayRangeTotal[1])) {
  Log.error("... called without a valid dayRangeTotal ...");
  return;
}
```

Its Phase 18 twin calls `this._isFullNominalWindow(legacyOffsetStart, legacyOffsetEnd,
match.dayRange)` with no such guard. `_isFullNominalWindow` immediately does `dayRange[0]`,
so an `undefined`/malformed `dayRange` is a `TypeError` that escapes to `getSpcOutlook`'s
catch and nulls the whole payload (CR-01's shape again). `match.dayRange` is currently
registry-guaranteed via the `gridMatches.push` at `node_helper.js:850-856`, so this is not
live today — but the asymmetry is exactly the twin-divergence pattern the file's own WR-06
comment (`node_helper.js:4753-4755`) condemns: "a fix applied to one twin and not the other".

**Fix:**

```js
// node_helper.js:2858, before the band-routing decision
if (!Array.isArray(match.dayRange) ||
    !Number.isInteger(match.dayRange[0]) || !Number.isInteger(match.dayRange[1])) {
  continue; // malformed layer descriptor — contained, same as _bucketHazardMatch
}
```

---

### WR-06: `eroTierToOutlookLabel` is a second declaration of ERO's tier vocabulary that degrades silently

**File:** `node_helper.js:3281-3286`
**Issue:** The map hardcodes all four ERO tiers (`MRGL/SLGT/MDT/HIGH`) and their long-form
taxonomy labels. `productRegistry.js:87` (`eroValueToTier`) already declares that vocabulary,
and `hazardTaxonomy.js`'s `"wpc-ero"` map declares the long forms. If any of the three drifts
— WPC adds a tier, the registry renames one — this map falls through to
`? eroTierToOutlookLabel[tier] : tier`, `dimensionOf("wpc-ero", "MRGL")` returns `null`, and
the entry becomes a `dimension: null` pass-through that never participates in precedence and
disappears from `summary.dimensions`.

The sibling case in the same phase is handled the opposite way and correctly:
`buildWpcHazardsMap()` (`hazardTaxonomy.js:97-110`) **throws at `require()` time** if the
registry renders a colour for a label the taxonomy doesn't know — "catching Pitfall 8's
false-negative shape before it ships". ERO gets no such check.

**Fix:** move the tier→taxonomy-label translation into `hazardTaxonomy.js` next to the
`"wpc-ero"` map, derive its key set from `PRODUCT_REGISTRY.excessiveRain.valueToTier` the
same way `buildWpcHazardsMap` derives from `displayColor`, and throw at load on an unmapped
tier. `_addRegistryDayGridEntries` then calls a single exported
`taxonomyLabelFor(sourceId, tier)`.

---

### WR-07: The unmapped-label logging block is duplicated verbatim from `resolveStyle`

**File:** `node_helper.js:2900-2911` vs `node_helper.js:894-910`
**Issue:** `_addHazardsOutlookGridEntries` re-implements `resolveStyle`'s mapped-lookup,
truncation, `_loggedUnmappedHazardLabels` dedupe, cap check and log line, line for line, on
the same process-lifetime Set. Two independent writers to one shared ledger with identical
logic is the twin-divergence class the file elsewhere calls out by name; a future change to
the cap, the truncation width, or the log text will land on one copy.

**Fix:** extract `resolveStyle`'s body into a helper method
(`_resolveHazardsOutlookStyle(row, label)` returning `{ color, mapped }` and owning the log
side-effect) and call it from both `_runArcGisHazardWindowProduct` and
`_addHazardsOutlookGridEntries`.

---

### WR-08: An unbounded remote-derived string is logged verbatim

**File:** `node_helper.js:4886-4888`
**Issue:** `JSON.stringify(eroPayload.day1ValidTime)` logs a value read straight off an
ArcGIS feature property (`_validTimeOfWinner(polys, loc, value, row.validTimeField)`), with
no length bound. The only upstream bound is `GEOJSON_MAX_BODY_BYTES` (16 MB), so a hostile or
corrupted `valid_time` can put a multi-megabyte string into the MagicMirror log on a
Raspberry Pi. `JSON.stringify` neutralises log-injection via newlines, but not the size.

This file elsewhere states the rule for exactly this class: `HAZARDS_LOG_LABEL_MAX_CHARS`
exists because "it stored the label UNTRUNCATED [...] so a 1 MB hostile label was retained in
full" (`node_helper.js:159-166`).

**Fix:**

```js
Log.info("MMM-SPCOutlook: excessiveRain.day1ValidTime sample: " +
         String(JSON.stringify(eroPayload && eroPayload.day1ValidTime)).slice(0, HAZARDS_LOG_LABEL_MAX_CHARS));
```

---

### WR-09: Every new probe scenario pins `now` past 12Z, so half the grid's behaviour space is untested

**File:** `scripts/probe-payload-resilience.js:1294` (`MERGE_NOW_MS = Date.UTC(2026, 8, 5, 13, 0)`),
`:7795`, `:9495` and the rest of the `merge-*` family
**Issue:** Every one of the 37 new merge scenarios pins the clock to a time **at or after
12:00Z**, so `_spcGridAnchor`'s clock fallback always resolves `nominalStartMs` to *today*
12Z. The 00Z-12Z half of a UTC day — where `nominalStartMs` is *yesterday* 12Z and grid-day
numbering diverges from every product's own day numbering — is never exercised. That is
precisely the branch CR-02 lives in, and the branch the already-filed Phase 17 HeatRisk
defect lives in. The suite's own fixture comment
(`scripts/probe-payload-resilience.js:1289-1290`) even mis-describes 13:00Z as "inside the
00Z-12Z-past window", which suggests the gap was not noticed.

Second gap in the same family: `mergeGridWindow(n)` (`:1301-1303`) builds every fixture as
`{ start, start + 86400000 }` — the exclusive convention only. No scenario models the
inclusive multi-day span of CR-03, and
`merge-parity-unified-days-agree-with-legacy-blocks` explicitly excludes `wpc-hazards`
(`:9476-9477`), so nothing compares the two representations on the one product where they
disagree.

**Fix:** add a `MERGE_NOW_MS_MORNING = Date.UTC(2026, 8, 5, 6, 0)` sibling and duplicate at
minimum the HeatRisk span scenario, the SPC straight-through scenario and the parity
scenario against it; extend `mergeGridWindow` with an `inclusive` variant and cover a
multi-day Precipitation span in the parity comparison.

---

### WR-10: Precedence-by-rank with no severity floor lets a weak rank-1 claim hide a strong rank-2 one

**File:** `node_helper.js:3396-3428`, `hazardTaxonomy.js:170-179`
**Issue:** `_resolveGridDayPrecedence` picks the first source in `PRECEDENCE[dimension]` that
has *any* entry and marks every other source's entry `suppressedBy`. Severity is never
compared. Concretely, for `heat: ["heatrisk", "wpc-hazards"]`, a HeatRisk category 1
("Minor") suppresses a WPC `"Excessive Heat"` on the same grid day. Under the phase's own
documented compact-rendering rule ("the entries where `suppressedBy === null`, in array
order", `node_helper.js:4029-4031`) the user sees "Minor" and never sees "Excessive Heat".

The rank order is a locked decision (D-06/D-13) and the suppressed entry does survive in the
array for detailed rendering, so this is not reported as incorrect behaviour. It is reported
because the residual failure mode — a real, higher-severity hazard hidden by a lower-severity
one — is the exact class the project's value statement forbids, and it is currently pinned as
correct by `merge-precedence-heatrisk-suppresses-wpc-hazardous-heat` with no scenario
exploring the severity-inversion case.

**Fix (for Phase 19's render decision, not necessarily here):** either (a) have
`_resolveGridDayPrecedence` prefer the rank-1 source only when its `value` is not strictly
below the rank-2 entry's, or (b) make the compact renderer surface a "+N more" affordance
whenever a suppressed entry exists on a dimension, so a suppressed Excessive Heat is never
fully invisible. Whichever is chosen, add a probe scenario pinning it.

---

### WR-11: A one-line registry edit hard-crashes the module at `require()` time

**File:** `hazardTaxonomy.js:97-110`, `:325`
**Issue:** `buildWpcHazardsMap()` throws if `PRODUCT_REGISTRY.hazardsOutlook.displayColor`
gains a label with no `hazardsOutlookDimensionByLabel` entry, and it runs at module load via
`assertTaxonomyIntegrity()` at `:325`. `node_helper.js:32` requires `hazardTaxonomy` at the
top of the file, so the throw is unrecoverable: `node_helper.js` fails to load and the entire
MagicMirror module is dead — no SPC convective, no MDs, no ⚠ badge, nothing.

The reasoning ("catching Pitfall 8's false-negative shape before it ships") is sound for a
CI/dev-time check but this is an appliance running unattended on a Raspberry Pi, and the same
class of event **at runtime** — an upstream label with no taxonomy entry — is deliberately
handled by D-07 pass-through rather than a crash. The two policies for the same fact are
inconsistent in the more dangerous direction.

**Fix:** keep the throw in `assertTaxonomyIntegrity()` (called explicitly by the probe suite
and by CI), but have `buildWpcHazardsMap()` degrade at load: map the unknown label to
`{ dimension: null }` (the D-07 pass-through outcome) and `Log.error` once. The probe suite's
existing call to the assertion keeps the ship-time guarantee without making a colour-table
edit an outage.

## Info

### IN-01: Dead code — `HEATRISK_DAY_SPAN_END` is computed and discarded

**File:** `hazardTaxonomy.js:56-57`
**Issue:** `const HEATRISK_DAY_SPAN_END = PRODUCT_REGISTRY.heatRisk.days;` followed by
`void HEATRISK_DAY_SPAN_END;` with the comment "documentation-only reference". It reads a
value nothing consumes.
**Fix:** delete both lines; the surrounding comment block already states the spans in prose,
which is what the reader actually uses.

---

### IN-02: Four exports of `hazardTaxonomy.js` have no consumer

**File:** `hazardTaxonomy.js:327-339`
**Issue:** `HAZARD_TAXONOMY`, `DIMENSIONS`, `DAY_SOURCE_IDS` and `assertTaxonomyIntegrity` are
exported but imported by nothing — `node_helper.js:32-35` takes seven names, none of these,
and `scripts/probe-payload-resilience.js:29` takes only `DIMENSION_ORDER`.
**Fix:** either drop them from `module.exports`, or (preferred for
`assertTaxonomyIntegrity`, given WR-11) have the probe suite call it explicitly so the
ship-time invariant has a test-time owner.

---

### IN-03: `days[].hazards[].label` vocabulary is inconsistent across sources

**File:** `node_helper.js:3320-3322`
**Issue:** Every source publishes its raw upstream token/label as `label` —
`spc-convective` `"SLGT"`, `spc-fire` `"CRIT"`, `wpc-wssi` `"MODERATE"`, `heatrisk` `"3"`,
`wpc-hazards` `"Heavy Rain"` — except `wpc-ero`, which publishes the synthesised
`"Slight (At Least 15%)"` while its `text` is the registry's `"Slight"`. `label` is a
grouping/sort key (`_resolveGridDayPrecedence` sorts on `label.localeCompare`), so the
outlier makes cross-source grouping in Phase 19 unreliable.
**Fix:** keep `label: tier` and use the long form only as the `dimensionOf` lookup argument:

```js
const taxonomyLabel = sourceId === "wpc-ero"
  ? (Object.prototype.hasOwnProperty.call(eroTierToOutlookLabel, tier) ? eroTierToOutlookLabel[tier] : tier)
  : tier;
const dimension = dimensionOf(sourceId, taxonomyLabel);
// ... push({ ..., label: tier, ... })
```

---

### IN-04: `_addSpcGridEntries` hardcodes day spans the rest of the file forbids

**File:** `node_helper.js:3106`, `:3170`, `:3208`
**Issue:** `for (let d = 1; d <= 3; d++)`, `for (let d = 4; d <= 8; d++)`,
`for (let d = 1; d <= 8; d++)` and `if (d >= 3 && !extended)` are literal spans. Every other
day-span in the merge code is registry-derived by explicit rule (WR-03/WR-16, and
`daySpanOf`'s comment in `productRegistry.js` condemns exactly this). SPC predates the
registry (14 D-08), so there is no row to read from — but the numbers are now declared in
four places (here, the SPC fetch chain, `hazardTaxonomy.js`'s span comment, and
`spcLocals`'s object literal).
**Fix:** hoist module constants (`SPC_CATEGORICAL_LAST_DAY = 3`,
`SPC_CONVECTIVE_LAST_DAY = 8`, `SPC_FIRE_UNCONDITIONAL_LAST_DAY = 2`) next to
`GRID_DAY_COUNT` and read them at all four sites, so the eventual registry migration has one
place to change.

---

### IN-05: Static lookup tables rebuilt on every call

**File:** `node_helper.js:3281-3298`
**Issue:** `eroTierToOutlookLabel` (an object literal) and `valueByTier` (a loop over
`row.valueToTier`) are constructed inside `_addRegistryDayGridEntries`, so both are rebuilt
twice per poll. Neither depends on anything but static registry config. Not a correctness
issue, but on the stated RPi target the file's own discipline is to hoist static config.
**Fix:** hoist to module scope (or fold into `hazardTaxonomy.js` per WR-06's fix, which
resolves both).

---

### IN-06: The frontend "first populated render" timing fires on an error payload

**File:** `MMM-SPCOutlook.js:167-172`
**Issue:** The log line describes itself as "the practical proxy for first populated render",
but it fires for any payload that clears the foreign-instance/epoch/sequence guards —
including `{ error: "..." }`, which `getDom` renders as `"Error: ..."` at `:421-422`. The
once-per-module-start guard is then consumed by a poll that rendered nothing, and no later
successful poll is measured.
**Fix:**

```js
if (!this._loggedFirstPayloadMs && this.spcrisk && !this.spcrisk.error) {
  this._loggedFirstPayloadMs = true;
  Log.info(...);
}
```

---

_Reviewed: 2026-09-06T01:23:20Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
