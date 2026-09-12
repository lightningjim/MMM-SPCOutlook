# Phase 18 Plan 09: Live Capture, Criteria Validation & PERF-03 Baseline

Two real polls against the live NOAA endpoints, captured 2026-09-05, used to validate ROADMAP
Phase 18 success criteria 1, 2, 4 and 5 against actual data rather than synthetic fixtures. Every
verdict below is PASS, NOT OBSERVABLE, or FAIL — never a fixture presented as a live observation
(T-18-26).

## Capture method

A throwaway Node script (`loader.js` + `capture.js`/`coldstart.js`, written to the session
scratchpad, never committed) stubs only `node_helper` (`create: (obj) => obj`) and `logger`
(console passthrough) — the two specifiers that exist only inside a real MagicMirror process.
Every other dependency (`@turf/turf`, `node-fetch`, `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson`,
`xpath`) resolves to the real installed package from `node_modules`, and `fetch` hits the real
network. This is deliberately **not** `scripts/probe-payload-resilience.js`, which stubs the
transport seam entirely (`installHttp`) — this capture exercises the actual live HTTP path,
including a real `@turf/turf` point-in-polygon test against live-fetched GeoJSON, never a
bounding-box check.

`git status --porcelain` after this plan's work shows no new file outside `.planning/` — the raw
fetched GeoJSON bodies and the full capture JSON dumps live only under the session scratchpad
directory and were never written into the repository (T-18-25).

## Capture 1 — Florence, SC (primary): three genuinely distinct concurrent hazards

### Metadata

- **Timestamp:** 2026-09-05T21:33Z (approx.; the `capture-florence` run)
- **Coordinates:** `34.1954, -79.7626` (Florence, SC)
- **Toggle set:** `showExcessiveRain: true, showWinterImpact: true, showHazardsOutlook: true, showHeatRisk: true, showMPD: true, showSPCMD: true, extended: true`. `showDrought: false` — left at the production default. Drought labels ("Severe Drought"/"Rapid Onset Drought Risk") map to no MERGE-0x precedence dimension; enabling it would only change whether those two labels render, not any behavior any of the four criteria under test exercise, so the default-off deployment shape was kept.
- **Coordinate selection reasoning:** a quiet location proves nothing about suppression or
  concurrency (per this plan's own instruction). The live SPC Day 1 categorical outlook
  (`day1otlk_cat.lyr.geojson`, fetched fresh) was checked with real `turf.booleanPointInPolygon`
  against several CONUS candidates; Florence, SC tested **inside all three of** the TSTM (DN2),
  MRGL (DN3) and SLGT (DN4) polygons — i.e., genuinely nested inside the day's highest active
  tier (SLGT), not merely inside a coarse bounding box. This was the day's highest active SPC
  category nationwide (no ENH/MDT/HIGH area existed in today's outlook).
- **SPC `VALID_ISO`/`EXPIRE_ISO` the anchor resolved from:** `VALID_ISO: 2026-09-05T20:00:00+00:00`,
  `EXPIRE_ISO: 2026-09-06T12:00:00+00:00` (read verbatim off the live day1 categorical feature that
  won containment for this point — the 20:00Z value confirms RESEARCH.md's "SPC re-issues Day 1
  multiple times a day and truncates the window's start to the issuance time" finding, generalized
  past the 13:00Z example RESEARCH.md itself captured).
- **`sources['spc-convective'].gridAnchor`:** `"observed"`.

### Trimmed payload excerpt

`summary`:
```json
{
  "anyHazard": true,
  "dimensions": ["convective", "flash-flood", "heat"],
  "activeDays": [1, 2, 3, 4, 5, 6, 7],
  "windowStart": "2026-09-05T20:00:00.000Z",
  "windowEnd": "2026-09-19T12:00:00.000Z",
  "enabledSourceCount": 8,
  "reportingSourceCount": 7,
  "bandDiagnostics": { "windowBandCount": 0, "advisoryCount": 0 }
}
```

`sources` (full):
```json
{
  "spc-convective": {"id":"spc-convective","displayName":"SPC Convective Outlook","enabled":true,"reporting":true,"stale":false,"idpFiledate":null,"reportedDays":[1,2,3,4,5,6,7,8],"activeDays":[1,2],"unmappedLabels":[],"gridAnchor":"observed"},
  "spc-fire": {"id":"spc-fire","displayName":"SPC Fire Weather Outlook","enabled":true,"reporting":true,"stale":false,"idpFiledate":null,"reportedDays":[1,2,3,4,5,6,7,8],"activeDays":[],"unmappedLabels":[]},
  "wpc-ero": {"id":"wpc-ero","displayName":"WPC Excessive Rainfall Outlook","enabled":true,"reporting":true,"stale":false,"idpFiledate":null,"reportedDays":[1,2,3,4,5],"activeDays":[1,2],"unmappedLabels":[]},
  "wpc-wssi": {"id":"wpc-wssi","displayName":"WPC Winter Storm Severity Index","enabled":true,"reporting":true,"stale":false,"idpFiledate":null,"reportedDays":[1,2,3],"activeDays":[],"unmappedLabels":[]},
  "wpc-hazards": {"id":"wpc-hazards","displayName":"WPC/CPC Hazards Outlook","enabled":true,"reporting":false,"stale":false,"idpFiledate":1788639320000,"reportedDays":[],"activeDays":[],"unmappedLabels":[]},
  "heatrisk": {"id":"heatrisk","displayName":"NWS HeatRisk","enabled":true,"reporting":true,"stale":false,"idpFiledate":1788641860000,"reportedDays":[1,2,3,4,5,6,7],"activeDays":[1,2,3,4,5,6,7],"unmappedLabels":[]},
  "spc-md": {"id":"spc-md","displayName":"SPC Mesoscale Discussion","enabled":true,"reporting":true,"stale":false,"idpFiledate":null,"reportedDays":[],"activeDays":[],"unmappedLabels":[]},
  "wpc-mpd": {"id":"wpc-mpd","displayName":"WPC Mesoscale Precipitation Discussion","enabled":true,"reporting":true,"stale":false,"idpFiledate":null,"reportedDays":[],"activeDays":[],"unmappedLabels":[]}
}
```
(`wpc-hazards` genuinely has no live feature covering this coordinate today across all six Hazards
Outlook layers — confirmed independently below.)

`days[N]` entries with a non-empty `hazards` array (days 1–2 only; days 3–14 are all
`hazards: []` — 12 empty grid days, not pasted):

```json
"1": {"date":"2026-09-05","windowStart":"2026-09-05T20:00:00.000Z","windowEnd":"2026-09-06T12:00:00.000Z",
  "hazards":[
    {"dimension":"convective","source":"spc-convective","label":"SLGT","text":"Slight","value":3,"color":"f7f690","suppressedBy":null,"detail":{"probRisk":true,"torRisk":0,"torCig":0,"hailRisk":0.05,"hailCig":0,"windRisk":0.15,"windCig":0}},
    {"dimension":"flash-flood","source":"wpc-ero","label":"Marginal (At Least 5%)","text":"Marginal","value":1,"color":"7ac687","suppressedBy":null},
    {"dimension":"heat","source":"heatrisk","label":"3","text":"Major","value":3,"color":"e22f33","suppressedBy":null}
  ]},
"2": {"date":"2026-09-06","windowStart":"2026-09-06T12:00:00.000Z","windowEnd":"2026-09-07T12:00:00.000Z",
  "hazards":[
    {"dimension":"convective","source":"spc-convective","label":"MRGL","text":"Marginal","value":2,"color":"7ac687","suppressedBy":null,"detail":{"probRisk":true,"torRisk":0,"torCig":0,"hailRisk":0.05,"hailCig":0,"windRisk":0.05,"windCig":0}},
    {"dimension":"flash-flood","source":"wpc-ero","label":"Marginal (At Least 5%)","text":"Marginal","value":1,"color":"7ac687","suppressedBy":null},
    {"dimension":"heat","source":"heatrisk","label":"1","text":"Minor","value":1,"color":"f4f257","suppressedBy":null}
  ]}
```
Days 3–7 each carry exactly one surviving `heatrisk`-sourced `heat` entry (values 1,1,1,2,2 across
days 3–7 respectively); days 8–14 are all empty (see the Days 9–14 shape check section below;
day 8 checked too).

## Capture 2 — Northwest Alaska near Kotzebue (supplementary): the live `wpc-hazards` near-boundary case

Nothing at Florence, SC (or any other CONUS point checked) carries a live `wpc-hazards` day-grid
entry today, so a second, deliberately different coordinate was captured specifically to exercise
MERGE-01's near-boundary claim, per this plan's own instruction to extend the search when a
sharper live case is needed.

### Metadata

- **Timestamp:** 2026-09-05T21:41Z (approx.; the `capture-alaska` run)
- **Coordinates:** `65.936, -163.443` — the real polygon centroid (confirmed inside via
  `turf.booleanPointInPolygon`, not a bounding-box check) of the single live "Heavy Rain" feature
  on the Hazards Outlook's Day 3–7 Precipitation layer (layer 4 of
  `cpc_weather_hazards/MapServer`), near Kotzebue, AK.
- **Toggle set:** identical to Capture 1.
- **Coordinate selection reasoning:** this point was chosen deliberately because it is the ONLY
  live feature, across all six Hazards Outlook layers fetched fresh today, that (a) belongs to the
  `precipitation` group (the only group whose features can land on the per-day grid at all — D-04
  routes `temperature`/`wildfireDrought` to the window band unconditionally, confirmed live: the
  Hazardous Heat and High Winds features found at other candidate points all routed to
  `summary.bandDiagnostics.windowBandCount`, never the day grid) and (b) is not a full-nominal-window
  span (so D-04's guard does not route it to the band either). It is therefore the only live
  candidate anywhere in the country today capable of exercising the per-day `wpc-hazards` grid
  placement logic MERGE-01 governs.
- **SPC anchor at this location:** `"estimated"` — this coordinate falls outside every SPC
  Day 1 categorical polygon (SPC's outlook is CONUS-only), so no winning feature exists to read
  `VALID_ISO`/`EXPIRE_ISO` from, and the code correctly falls back to the clock estimate (logged:
  `"SPC grid anchor unavailable ... falling back to the clock-derived estimate"`). This is itself a
  genuine live observation of D-12's `'estimated'` branch, distinct from Capture 1's `'observed'`
  branch — noted here for completeness, not claimed as a MERGE-01 criterion result.
- **`sources['spc-convective'].gridAnchor`:** `"estimated"`; `nominalStartMs` resolved to
  `2026-09-05T12:00:00.000Z` (today's 12Z, per D-11's clock-fallback rule).

### Trimmed payload excerpt

Raw upstream feature (`cpc_weather_hazards/MapServer/4/query`, fetched fresh), verbatim:
```json
{
  "objectid": 7917, "label": "Heavy Rain",
  "start_date": 1788998400000, "end_date": 1788998400000,
  "idp_source": "Prcp_D3_7_Clip", "idp_subset": "PRCP_D3_7",
  "idp_filedate": 1788639319000
}
```
`start_date` and `end_date` both decode to **`2026-09-10T00:00:00.000Z`** — identical instants, a
zero-duration span by epoch-ms comparison.

Legacy `hazardsOutlook` block (untouched-by-Phase-18 path, calendar-date bucketed):
```json
"day5": {"date":"2026-09-10","hazards":[{"label":"Heavy Rain","color":"267300","mapped":true}]},
"day6": {"date":"2026-09-11","hazards":[]}
```

Unified `days[]` grid, the two candidate grid days per D-10's forward-align rule (a 00Z-00Z source
day for calendar date Sep 10 should forward-align onto the grid day that **starts** at 12Z on
Sep 10 — computed directly against this poll's anchor as **grid day 6**, `windowStart
2026-09-10T12:00:00.000Z`):
```json
"5": {"date":"2026-09-09","windowStart":"2026-09-09T12:00:00.000Z","windowEnd":"2026-09-10T12:00:00.000Z","hazards":[]},
"6": {"date":"2026-09-10","windowStart":"2026-09-10T12:00:00.000Z","windowEnd":"2026-09-11T12:00:00.000Z","hazards":[]}
```
Both are empty. The feature is present in `sources['wpc-hazards'].idpFiledate` (freshness is
tracked) but **absent from `reportedDays`/`activeDays`** for `wpc-hazards` and absent from every
grid day's `hazards` array. `summary.bandDiagnostics.windowBandCount: 1` reflects a *different*
live feature (`High Winds`, Temperature group, which always routes to the band) at this same
poll — not this one.

## Validation table

| Criterion | Verdict | Evidence |
|---|---|---|
| 1 — MERGE-01 (near-boundary placement) | **PASS** (re-validated; **FAIL** at 2026-09-05 capture time) | See the new subsection under "Criterion 1" detail below (post-18-10-fix replay). |
| 2 — MERGE-02 (SPC suppresses WPC Severe Weather, dimension-keyed) | **NOT OBSERVABLE** (payload half); **PASS** (code-path half) | See "Criterion 2" detail below. |
| 4 — MERGE-04 (distinct hazards both survive; over-merge does not happen) | **PASS** (under-merge half); **NOT OBSERVABLE** (over-merge half, unchanged after re-check) | See "Criterion 4" detail below. |
| 5 — RPT-07 (both render levels derivable from the payload alone) | **PASS** | See "Criterion 5" detail below. |

### Criterion 1 (MERGE-01, near-boundary) — FAIL at capture time, re-validated PASS after the 18-10 fix

A genuine live near-boundary case **was found** (Capture 2, above) — a `wpc-hazards`
Precipitation-group feature whose `start_date` (`2026-09-10T00:00:00.000Z`) is exactly the kind of
00Z instant D-10's forward-align rule governs. This is not the NOT OBSERVABLE case this plan
anticipated; a real candidate exists and was traced end to end.

**Result: the entry is silently dropped from the unified `days[]` grid rather than being placed on
grid day 6 as D-10 requires.** It correctly reaches the legacy `hazardsOutlook.day5` block (via the
pre-Phase-18, calendar-date-bucketed, *inclusive*-endpoint loop in `_bucketHazardMatch`), confirming
the point-in-polygon match and the feature itself are genuine and correctly resolved — the failure
is isolated to `_addHazardsOutlookGridEntries` (`node_helper.js:2835-2919`).

**Root cause traced:** `_addHazardsOutlookGridEntries` computes
`gridStart = _gridDayOf(match.startDate, anchorInfo.nominalStartMs)` and
`gridEnd = _gridDayOf(match.endDate, anchorInfo.nominalStartMs)`, then emits on grid days
`gridStart .. (gridEnd - 1)` inclusive — a design that assumes, per its own comment
(node_helper.js:2874-2876), `"endDate is the exclusive end of the source's own 00Z-00Z span, so a
single-calendar-day feature has gridEnd = gridStart + 1"`. Verified directly against the real
`_gridDayOf` function with this poll's actual anchor:

```
_gridDayOf(2026-09-10T00:00:00.000Z, nominalStartMs) = 6   (gridStart)
_gridDayOf(2026-09-10T00:00:00.000Z, nominalStartMs) = 6   (gridEnd, since end_date === start_date)
lastGridDay = gridEnd - 1 = 5
clampedStart = max(6, 1) = 6
clampedEnd   = min(5, 14) = 5
clampedEnd (5) < clampedStart (6) -> range is empty -> entry dropped entirely
```

Substituting the value the code's own comment assumes for a genuine single-day feature
(`end_date = start_date + 86400000`, i.e. `2026-09-11T00:00:00.000Z`) instead of the live value
confirms the mechanism is otherwise sound: `_gridDayOf(2026-09-11T00:00:00.000Z, nominalStartMs) =
7`, giving `lastGridDay = 6 = gridStart`, a single correctly-placed grid day 6 — exactly matching
`merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day`'s fixture, which builds its test
feature with `endDate: Date.UTC(2026, 8, 7)` (i.e., `start + 1 day`, the exclusive-end convention)
and passes.

**The live upstream feed does not honor that assumed convention for this feature**:
`start_date === end_date` (`1788998400000` for both), an inclusive/zero-duration representation
this plan's own fixture never modeled. RESEARCH.md's "Live Field Formats" table documented
`wpc-hazards`' `start_date` shape but never verified the `end_date`-minus-`start_date` relationship
for a genuine single-day feature against live data — this gap was first surfaced by this capture.
For comparison, the Temperature-group "High Winds" feature fetched in the same poll DOES show the
assumed exclusive-end shape (`start_date 2026-09-08T00:00:00Z`, `end_date 2026-09-09T00:00:00Z`,
exactly one day apart) — so the two groups on the same MapServer are not internally consistent
about this convention, at least in this one live sample.

This is logged as a new finding in `deferred-items.md` (see below); it is **not** fixed here —
`_addHazardsOutlookGridEntries` is already-committed 18-04 code, out of this plan's
`files_modified` scope, and the fix requires a product-code decision (treat `start_date ===
end_date` as a 1-day inclusive span, mirroring the legacy loop's own semantics) that belongs to a
future plan.

#### Re-validation after the 18-10 fix — PASS

**This is a replay of the captured live values above through the real `getSpcOutlook` code path
with a stubbed transport, run by `scripts/probe-payload-resilience.js` — it is NOT a fresh live
poll against NOAA.** The Kotzebue "Heavy Rain" feature (objectid 7917) was valid for 2026-09-10 and
may no longer exist upstream by the time this document is read, so a fresh poll cannot be a
prerequisite for closing this criterion; the replay reproduces the exact bytes captured on
2026-09-05 against the code that actually shipped. 18-10's mutation table (M1: restoring the exact
pre-fix `gridEnd - 1` expression reproduces the live defect verbatim; M2: a wholesale-inclusive
`Math.max(gridStart, gridEnd)` produces a different, over-inclusive failure) is the proof this
replay is not vacuous — it demonstrates the scenario fails in the specific way the live defect
failed, and fails in a different specific way under the wrong fix, not merely that it passes.

The replay scenario is `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day`
(`scripts/probe-payload-resilience.js`), built from the captured values literally:
`start_date === end_date === 1788998400000`, `idp_filedate 1788639319000`, layer 4, the
`"estimated"` SPC anchor branch, `nominalStartMs 2026-09-05T12:00:00.000Z`.

Run 2026-09-06 against the post-18-10 code (`node scripts/probe-payload-resilience.js`):

```
PASS merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day
PROBE RESULT: 119 passed, 0 failed, 0 skipped
```

The pre-fix `FAIL`, quoted verbatim from `18-10-SUMMARY.md`'s Task 1 record — the deterministic
reproduction of the live defect against the unfixed code, i.e. exactly what this same capture
produced before 18-10 shipped:

```
FAIL merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day: MERGE-01: expected exactly one wpc-hazards "Heavy Rain" entry on grid day 6 with dimension heavy-precip and color 267300, got []
```

**Corrected arithmetic**, against this poll's actual anchor (`nominalStartMs
2026-09-05T12:00:00.000Z`):

```
gridStart = 6
gridEnd   = 6
lastGridDay = Math.max(gridStart, gridEnd - 1) = Math.max(6, 5) = 6
clampedStart = max(6, 1) = 6
clampedEnd   = min(6, 14) = 6
clampedEnd (6) >= clampedStart (6) -> emits on grid day 6 only
```

Contrast against the original trace above: `lastGridDay 5 -> clampedEnd (5) < clampedStart (6) ->
empty range -> dropped`. The only change is the `lastGridDay` expression; every other value in the
poll (anchor, `gridStart`, `gridEnd`) is identical between the FAIL and PASS runs, isolating the
fix to exactly the line 18-10 changed.

**Resulting payload facts**, each of which the original capture recorded as absent/empty/false:

- `days["6"].hazards` now carries the `wpc-hazards` `"Heavy Rain"` entry:
  `{"dimension":"heavy-precip","source":"wpc-hazards","label":"Heavy Rain","text":"Heavy Rain","value":null,"color":"267300","suppressedBy":null}`,
  on grid day 6 (`date "2026-09-10"`, `windowStart "2026-09-10T12:00:00.000Z"`).
- `sources["wpc-hazards"].reportedDays` and `.activeDays` now include `6`, and
  `sources["wpc-hazards"].reporting` is `true` for this poll (previously `reportedDays: []`,
  `activeDays: []`).

**Agreement with the legacy path:** `hazardsOutlook.day5` (`date "2026-09-10"`) carried the
`"Heavy Rain"` label all along (see Capture 2's "Legacy `hazardsOutlook` block" excerpt above,
unchanged by this fix). The unified grid and the legacy block now agree on the calendar date —
grid day 6's `date` is `2026-09-10`, the same date `day5` names — which is exactly what D-10's
forward-align rule requires: a 00Z-00Z source day for calendar date Sep 10 forward-aligns onto the
grid day that *starts* at 12Z on Sep 10.

### Criterion 2 (MERGE-02) — NOT OBSERVABLE (payload) / PASS (code path)

**Payload half:** a live check of all six Hazards Outlook layers (`cpc_weather_hazards/MapServer`
layers 1, 3, 4, 6, 7, 8), fetched fresh 2026-09-05, found the following labels present nationwide:
`High Winds`, `Hazardous Heat` (layer 1), `Heavy Rain` (layer 4), `Severe Drought` (layer 7),
`Rapid Onset Drought Risk` (layer 8). **Zero features anywhere in the country today carry the
label `"Severe Weather"`** — the only `wpc-hazards` label the taxonomy maps to the `convective`
dimension (`hazardTaxonomy.js:83`). With no live `wpc-hazards` convective entry to exist anywhere,
there is no live day/location where both `spc-convective` and `wpc-hazards` contribute a
`convective` entry to compare `suppressedBy` values against. **Recorded NOT OBSERVABLE** for this
half, standing evidence: `merge-precedence-spc-suppresses-wpc-severe-weather` and its sibling
`merge-precedence-spc-below-floor-does-not-suppress-wpc`/`merge-precedence-spc-absent-day-is-not-the-floor-path`
(18-08-SUMMARY.md), each individually mutation-proven against `hazardTaxonomy.js:169`'s
`PRECEDENCE.convective` ordering.

**Code-path half** (always available, completed in full): `_resolveGridDayPrecedence`
(`node_helper.js:3356-3437`) was inspected in full. The decision that assigns a winner is:

```js
const rankOrder = PRECEDENCE[dimension];
...
const entriesBySource = {};
for (const entry of byDimension[dimension]) {
  entriesBySource[entry.source] = entry;
}
let winnerSourceId = null;
for (const sourceId of rankOrder) {
  if (entriesBySource[sourceId]) {
    winnerSourceId = sourceId;
    break;
  }
  ...
}
...
for (const entry of byDimension[dimension]) {
  entry.suppressedBy = entry.source === winnerSourceId ? null : winnerSourceId;
}
```

This walks `PRECEDENCE[dimension]` (a list of *source ids*, e.g.
`convective: ["spc-convective", "wpc-hazards"]` at `hazardTaxonomy.js:169`) and looks up
`entriesBySource[sourceId]` — object-key membership on `entry.source` and `entry.dimension`
(already-resolved taxonomy fields), never on `entry.label` or any raw upstream string. The
required grep, run exactly as specified, over the method's full line range (`node_helper.js:3356`
through the closing `},` at line 3437):

```
$ sed -n '3356,3437p' node_helper.js | grep -nE "label ?===|\.includes\(|indexOf\("
63:      const idx = DIMENSION_ORDER.indexOf(entry.dimension);
70:      const idx = order.indexOf(entry.source);
```

**This is not empty**, and it must be reported honestly rather than narrowed to force a clean
result. Both matches are inside the method's *second* block — the D-15 total-ordering `sort()`
comparator (`node_helper.js:3416-3427`), added to make repeated polls over an unchanged forecast
byte-identical, which runs strictly *after* every entry's `suppressedBy` has already been decided
by the object-key walk quoted above. Both `indexOf(` calls operate on `entry.dimension` and
`entry.source` — already-resolved taxonomy ids used only to compute a sort position — never on
`entry.label` or any raw upstream text, and neither call participates in deciding which source
suppresses which. The suppression *decision* itself, in the first block, contains no
`label ?===`, `.includes(`, or `indexOf(` at all. Confirmed by re-running the same grep restricted
to lines 3356-3408 (the decision block only, before the D-15 sort comment at line 3410): no output.

### Criterion 4 (MERGE-04) — PASS (under-merge) / NOT OBSERVABLE (over-merge)

**Under-merge check — PASS, live:** Capture 1 (Florence, SC), grid days 1 and 2, each carry
**three** genuinely distinct-dimension entries simultaneously, all three with `suppressedBy: null`:
`convective` (`spc-convective`, SLGT/MRGL), `flash-flood` (`wpc-ero`, Marginal), and `heat`
(`heatrisk`, category 3/1). No dimension appears twice with two different sources both surviving.
This is stronger live evidence than the plan's own minimum ask of two concurrent hazards — three
concurrent, genuinely distinct hazards both/all appear on the same day, live, today.

**Over-merge check — NOT OBSERVABLE, live:** confirming `flash-flood` (ERO) and `heavy-precip`
(`wpc-hazards` "Heavy Rain"/"Heavy Precipitation") never cross-suppress requires a live day where
BOTH a surviving `flash-flood` entry and a surviving `heavy-precip` entry exist simultaneously so
their independent `suppressedBy: null` values can be compared. No such day exists in today's live
data: the only live `heavy-precip`-eligible feature is Capture 2's "Heavy Rain" (Kotzebue, AK),
which — per Criterion 1's finding above — never reaches the unified day grid at all today (dropped,
not suppressed), so no live day anywhere currently carries a `heavy-precip` entry to test against.
Recorded NOT OBSERVABLE, standing evidence:
`merge-flash-flood-and-heavy-precip-never-cross-suppress` (18-08-SUMMARY.md), individually
mutation-proven by mapping `"Heavy Rain"` into the `flash-flood` dimension and confirming the
resolver's per-dimension isolation catches it.

**Re-check after the 18-10 fix (18-12) — still NOT OBSERVABLE, verdict re-decided on the evidence,
not silently carried forward.** The criterion-1 fix removed the blocker that prevented Capture 2's
`heavy-precip` entry from reaching the grid at all — grid day 6 at the Kotzebue, AK coordinate
(65.936, -163.443) now carries a `heavy-precip` entry (see the Criterion 1 re-validation above).
The remaining question is coverage: does that same day, at that same coordinate, also carry a
surviving `flash-flood` entry from `wpc-ero`, so the two can be compared for cross-suppression?

No full `sources["wpc-ero"]` block was captured for Capture 2 in the original 2026-09-05 poll (only
Capture 1, Florence SC, has a full `sources` object on record) — the Alaska poll's own recorded
data is limited to the `wpc-hazards` feature, the legacy block, and the unified grid days quoted
above. The verdict below is reasoned from the registry row and Capture 1's own finding, not from a
second live observation, and is reported as such rather than presented as a captured value:

- `PRODUCT_REGISTRY.excessiveRain` (`productRegistry.js:299-326`) points `wpc-ero` at
  `mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer`, WPC's
  Excessive Rainfall Outlook service — a CONUS-only product; the registry row carries no Alaska or
  offshore day layers, unlike `wpc-hazards`' own CPC-fed Days 8-14 extension which explicitly
  reaches beyond CONUS.
- The same poll's own SPC anchor fell back to `"estimated"` specifically because 65.936, -163.443
  "falls outside every SPC Day 1 categorical polygon" (SPC's outlook is also CONUS-only) — direct,
  same-poll evidence that this coordinate sits outside at least one other CONUS-scoped NOAA
  product's coverage area, corroborating rather than proving the ERO case.
- Capture 1 (Florence, SC) is the mirror image: `wpc-ero` reported live entries there
  (`reportedDays: [1,2,3,4,5]`, `activeDays: [1,2]`, both grid days 1-2 carrying a `flash-flood`
  entry), but `wpc-hazards` had **no** live feature covering that coordinate at all, on any of the
  six Hazards Outlook layers checked. Across both captures taken on 2026-09-05, no single
  coordinate has ever had both a live ERO feature and a live `wpc-hazards` Precipitation feature
  simultaneously.

**Verdict: over-merge remains NOT OBSERVABLE.** The criterion-1 fix removed the blocker without
producing an observation — Capture 2's coordinate has no ERO coverage (CONUS-only product, Alaska
coordinate) and Capture 1's coordinate has no `wpc-hazards` feature (CONUS coordinate, no live
Precipitation feature there today), so no live day anywhere in this capture can exercise the
over-merge comparison. The existing STATE.md deferral row for MERGE-04's over-merge half stays
intact; only its rationale text is updated (see plan 18-12 Task 2) to cite this coverage reasoning
in place of the now-resolved "blocked by the MERGE-01 FAIL" attribution.
`merge-flash-flood-and-heavy-precip-never-cross-suppress` (18-08-SUMMARY.md) continues to stand as
the mutation-proven fixture evidence for the underlying resolver behavior.

### Criterion 5 (RPT-07) — PASS

Using Capture 1's grid day 1 (`spc-convective` SLGT, `wpc-ero` Marginal, `heatrisk` category 3, all
three `suppressedBy: null`):

- **Compact line** (`suppressedBy === null` entries, array order): `["SLGT", "Marginal (At Least 5%)", "3"]`
- **Detailed sub-rows** (every entry, source-labelled via `sources[entry.source].displayName`):
  ```
  [
    {"label":"SLGT","sourceLabel":"SPC Convective Outlook","suppressedBy":null},
    {"label":"Marginal (At Least 5%)","sourceLabel":"WPC Excessive Rainfall Outlook","suppressedBy":null},
    {"label":"3","sourceLabel":"NWS HeatRisk","suppressedBy":null}
  ]
  ```

Deriving both required reading `days["1"].hazards` and `sources[entry.source].displayName` only —
no read of `PRECEDENCE`, `NO_RISK_FLOOR`, or any raw source value was needed at any point. This
matches 18-05-SUMMARY.md's own RPT-07 self-check exactly, now confirmed against a live rather than
synthetic payload. The one field a renderer would still have to derive on its own — how to lay out
or truncate a day with many survivors, and how to join multiple days into a single display — is a
Phase 19 layout concern per D-15, not a precedence omission; no new gap was found live.

## Days 9–14 shape check

Closing the CONTEXT.md Deferred item ("Days 9-14 payload shape when only the Hazards Outlook
reaches them — falls out of D-02 and D-14, but worth an explicit check against a live payload").

Capture 1 (Florence, SC) `days["9"]` through `days["14"]`, verbatim:

```json
"9":  {"date":"2026-09-13","windowStart":"2026-09-13T12:00:00.000Z","windowEnd":"2026-09-14T12:00:00.000Z","hazards":[]},
"10": {"date":"2026-09-14","windowStart":"2026-09-14T12:00:00.000Z","windowEnd":"2026-09-15T12:00:00.000Z","hazards":[]},
"11": {"date":"2026-09-15","windowStart":"2026-09-15T12:00:00.000Z","windowEnd":"2026-09-16T12:00:00.000Z","hazards":[]},
"12": {"date":"2026-09-16","windowStart":"2026-09-16T12:00:00.000Z","windowEnd":"2026-09-17T12:00:00.000Z","hazards":[]},
"13": {"date":"2026-09-17","windowStart":"2026-09-17T12:00:00.000Z","windowEnd":"2026-09-18T12:00:00.000Z","hazards":[]},
"14": {"date":"2026-09-18","windowStart":"2026-09-18T12:00:00.000Z","windowEnd":"2026-09-19T12:00:00.000Z","hazards":[]}
```

All six keys are present, each with a well-formed `date`/`windowStart`/`windowEnd`/`hazards` shape
(matching D-02's fourteen-key invariant) even though `wpc-hazards` never reached this coordinate at
all today (`sources['wpc-hazards'].reportedDays: []` — confirmed above, no live feature covers
Florence, SC on any layer this poll). `Object.keys(days).length === 14` for the full `"1".."14"`
range, confirmed directly. This is the intended shape for a location where the sole day-9-14
source is absent, not a defect: `hazards: []` is what D-14's per-day, only-sources-that-reported
resolution correctly produces when nothing reported.

## PERF-03 local cold-cache measurement

### Method

Cold cache requires no setup beyond a fresh process (D-17's established fact — `node_helper.js`'s
only cache is the in-memory `_geoJsonCache` Map, cleared by construction on every new process). A
brand-new `node` process required `node_helper.js` (via the same loader as the captures above),
called `helper.start()`, then drove one real `GET_SPC_DATA` through
`helper.socketNotificationReceived("GET_SPC_DATA", {...})` — the actual production entry point,
not a direct call to `getSpcOutlook`, so the real PERF-03/D-18 cold-start log block fires exactly
as it would in the deployed module. Location: Florence, SC (34.1954, -79.7626), same toggle set as
Capture 1.

### Verbatim cold-start log block (all four lines)

```
[INFO] MMM-SPCOutlook: cold-start timing -- backend interval 4004ms (GET_SPC_DATA received -> SPC_DATA_RESULT emitted); 4004ms since process start (module-load to first result sent)
[INFO] MMM-SPCOutlook: cold-start per-product breakdown {"spc-inline":2914,"spcMD":141,"heatRisk":612,"winterImpact":682,"excessiveRain":776,"mpd":919,"hazardsOutlook":1085}
[INFO] MMM-SPCOutlook: cold-start slowest source spc-inline (2914ms)
[INFO] MMM-SPCOutlook: cold-start timing is logged once per process start (D-18), gated by no config flag; the target-hardware (Raspberry Pi) figure is a UAT item tracked separately from this phase (D-19)
```

### Figures

- **Backend interval:** 4004ms (`GET_SPC_DATA` received -> `SPC_DATA_RESULT` emitted).
- **Per-product breakdown:** `spc-inline` 2914ms, `mpd` 919ms, `hazardsOutlook` 1085ms,
  `winterImpact` 682ms, `excessiveRain` 776ms, `heatRisk` 612ms, `spcMD` 141ms.
- **Slowest source:** `spc-inline` (2914ms) — the combined SPC convective + fire-weather fetch
  chain (18-06's documented single interleaved timing entry).
- **Wall-clock figure:** the same 4004ms figure, reported by the code itself as "since process
  start (module-load to first result sent)" — this poll had no browser attached, so there is no
  separate frontend paint time to measure; the module's own `_processStartMs`-to-`_nowMs()`
  bracket (D-17(b)'s intended measurement) was read directly through the module rather than
  observed in a browser DOM. Because `helper.start()` was called immediately before the single
  `GET_SPC_DATA` in this script, `_processStartMs` and `t0` are effectively coincident here, so the
  backend interval and the wall-clock figure are numerically identical for this run — that is an
  artifact of this measurement's structure (no delay between process start and the first request),
  not a claim that the two brackets are the same measurement in general.
- **Machine:** `hurricane`, Linux 7.0.0-31-generic x86_64, Node v25.9.0, 16 logical CPUs, 45Gi RAM.
  This is a development workstation, **not** the target Raspberry Pi. The figure above is a local
  development-machine baseline only, useful for regression comparison on this same machine, and is
  not attributable to or comparable with Pi hardware.
- **No pass/fail latency target exists for PERF-03** on any hardware (RESEARCH.md/CONTEXT.md
  Deferred: "Research derived none for this hardware"). This figure is a baseline, not a gate — per
  D-19, the Raspberry Pi figure remains tracked by the existing STATE.md milestone-close blocker,
  unaffected by this local measurement.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Captured: 2026-09-05*
