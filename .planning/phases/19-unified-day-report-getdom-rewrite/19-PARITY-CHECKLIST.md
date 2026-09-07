---
phase: 19
requirement: RPT-06
status: open
baseline_probe_result: "123 passed, 0 failed, 0 skipped"
---

# Phase 19 RPT-06 Behavior-Parity Checklist

This is the phase's real acceptance gate. Every row below is a distinct branch of the current
`getDom()` (`MMM-SPCOutlook.js:184-784`), enumerated from a full read of that range and
cross-verified against `PROJECT.md`'s changelog (lines 22-40) for defect-ID provenance, with
every `Old site` line reference re-verified against the current working tree (2026-09-06) rather
than transcribed from `19-RESEARCH.md`'s own citations. Plans 19-04 through 19-06 tick a row's
`New site` cell as they carry the behavior into the new renderer; plan 19-08 fills `Run A`/`Run B`
during the two mandatory manual runs and signs the checklist off.

## Preserved Behaviors (35)

| # | ID | Behavior (observable) | Old site | New site | Run A (no risk anywhere) | Run B (everything active) | Notes |
|---|----|------------------------|----------|----------|--------------------------|----------------------------|-------|
| 1 | (loading) | `!this.spcrisk` → literal `"Loading SPC Outlook..."` via `innerHTML` (hardcoded string, safe) | MMM-SPCOutlook.js:419-420 | | | | RESEARCH.md #1 |
| 2 | (error) | `this.spcrisk.error` → `"Error: " + error` via `textContent` (never `innerHTML`) | MMM-SPCOutlook.js:421-422 | | | | RESEARCH.md #2 |
| 3 | BUG-03 | No-risk gate term: `!(extended && day48Risk)` | MMM-SPCOutlook.js:437 | | | | RESEARCH.md #3 |
| 4 | CR-01 | Staleness (`!this.spcrisk._stale`) disqualifies the whole no-risk short-circuit — a degraded read is never an all-clear | MMM-SPCOutlook.js:430 | | | | RESEARCH.md #4 |
| 5 | FWXT-03 | No-risk gate extended for fire weather days 1-2 (unconditional) and days 3-8 (extended-gated) | MMM-SPCOutlook.js:438-446 | | | | RESEARCH.md #5 |
| 6 | WR-08 | ERO/WSSI/HazardsOutlook/HeatRisk no-risk gate terms all derive their day span from the block's own keys, never a literal count | MMM-SPCOutlook.js:453-476 | MMM-SPCOutlook.js:530-531 — closed by construction: the unified day loop bounds `n = 1..14` on `this.spcrisk.days`' own 14 always-present keys, with no per-product day-span literal anywhere in `getDom()` | | | 19-04 |
| 7 | WR-09 | Advisory no-risk gate term is per-toggle (`enabledAdvisories().length > 0`), not unconditional | MMM-SPCOutlook.js:488 | MMM-SPCOutlook.js:547-555 — `enabledAdvisories()` retains its per-toggle gate verbatim, now called from the combined band's advisory sub-section (MMM-SPCOutlook.js:789); the no-risk gate term itself is closed by construction via `summary.anyHazard` (row 9), a backend-computed union that already includes the advisory arrays without a duplicate per-toggle read at the gate site | | | 19-06 |
| 8 | WR-04 | `_staleAsOf` renders real cached-reading age via `moment(asOf).fromNow()`; omits the age suffix (not the badge) when `asOf` isn't a finite number | MMM-SPCOutlook.js:494-505 | | | | RESEARCH.md #8 |
| 9 | CR-01 | `contentMarker` pattern: if nothing rendered after the stale badge, fall back to `"No Severe Weather Risk (unconfirmed)"`, distinct from the confident all-clear | MMM-SPCOutlook.js:512, MMM-SPCOutlook.js:778-779 | | | | RESEARCH.md #9 |
| 10 | D-05/D-06 (15) | Advisory band: SPC MD then WPC MPD, in that concatenation order; each line `label [+ " — " + hazardType] + " in effect."` | MMM-SPCOutlook.js:513-540 | MMM-SPCOutlook.js:789-802 — the loop and its wording, ordering (`enabledAdvisories()`'s own SPC-MD-then-MPD concatenation, unchanged) and `#0059E0` color are a behavior-preserving relocation into the combined band below all day blocks (RPT-04-RELOC); only the position moved | | | 19-06 |
| 11 | WR-12 | Advisory `label`/`hazardType` pass through `escapeHtml` before reaching `innerHTML` | MMM-SPCOutlook.js:532, MMM-SPCOutlook.js:537 | MMM-SPCOutlook.js:794, MMM-SPCOutlook.js:799 — same `escapeHtml` calls, carried over verbatim at the relocated site | | | 19-06 |
| 12 | PROXUI-01, PROXUI-02 | Day 1/Day 2 rows: colored risk text + `proximityBadge(categorical, mode)`, mode = `risk=="NONE" ? "outside" : "inside"` | MMM-SPCOutlook.js:541-561 | MMM-SPCOutlook.js:358-359 (`convectiveDetailAugment`'s `categoricalMode`), consumed at MMM-SPCOutlook.js:470/524 — relocated to detail mode per D-07-RELOC; the badge is appended inside the convective sub-row's own label-field color span (`labelSuffix`), never in the compact line | | | 19-05 |
| 13 | FWXT (implicit, pre-ID) | Day 1/Day 2 probabilistic breakdown line (tornado/hail/wind icons + `cigLabel` + percentage), only emitted when `probRisk` is true, only per-hazard-type when that type's risk > 0 | MMM-SPCOutlook.js:544-561 | MMM-SPCOutlook.js:364-408 (`convectiveDetailAugment`'s `hasTorFamily` branch) — same `probRisk` gate and per-type `> 0` gate, reproduced as a detail-mode sub-line beneath the convective sub-row (D-07-RELOC) | | | 19-05 |
| 14 | PROXUI-03/04 | Day 1/2 per-hazard-type proximity badges: `torCig`/`hailCig`/`windCig`, mode = `own CIG === 0 ? "outside" : "inside"` (independent per hazard type, NOT tied to the day's categorical mode) | MMM-SPCOutlook.js:546-548, MMM-SPCOutlook.js:557-559 | MMM-SPCOutlook.js:376, 385, 394 (`torMode`/`hailMode`/`windMode`, each its own explicit expression against `detail.<type>Cig`, never derived from `categoricalMode`) | | | 19-05 |
| 15 | PROXUI-04 | Day 3 dual badge: categorical AND cig badges both computed; joined with `";"` only if both are non-empty (`day3DualSep`) | MMM-SPCOutlook.js:562-569 | MMM-SPCOutlook.js:409-418 (`convectiveDetailAugment`'s `hasCigOnly` branch, `dualSep`) | | | 19-05 |
| 16 | (day 3, no per-ID) | Day 3 appends `cigLabel(day3.cig)` directly into the risk-text span (no separate icon breakdown line — day 3 has no tornado/hail/wind percentages at all) | MMM-SPCOutlook.js:567 | MMM-SPCOutlook.js:410-418 — `cigLabel(detail.cig)` prepended into the same `labelSuffix` string the dual badge joins onto, no separate sub-line for this shape | | | 19-05 |
| 17 | (extended days, no per-ID) | Days 4-8 gate is `probRisk` (not `risk != NONE`), plain colored text only, no proximity badges at all for this range (asymmetry vs. days 1-3) | MMM-SPCOutlook.js:570-577 | MMM-SPCOutlook.js:420-425 — `convectiveDetailAugment` falls through to `{ labelSuffix: "", subLineHtml: "" }` for the `{probRisk, sign}` shape: plain label, no proximity badge of any kind (asymmetry preserved; see SIGN-NOOP below for why `sign` itself stays unrendered) | | | 19-05 |
| 18 | FWXT-01/02/03/04 | Fire weather days 1-2 unconditional, days 3-8 `extended`-gated; `fireRiskToColor` lookup (`{0:"aaaaaa",1:"FF7F00",2:"FF0000",3:"FF00FF"}`); gate is `day{N}Risk > 0` | MMM-SPCOutlook.js:578-598 | | | | RESEARCH.md #18 |
| 19 | WR-08 | `renderDayBlock` (ERO/WSSI): day span from `dayRiskCount` (counts `day{N}Risk` keys), strict `!== "NONE"` | MMM-SPCOutlook.js:604-614 | MMM-SPCOutlook.js:530-531 — `renderDayBlock`/`dayRiskCount` are retired; closed by construction, same unified day-loop bound as row 6 | | | 19-04 |
| 20 | WR-02 | `renderDayBlock` interpolates `day{N}Color`/`day{N}Text` into `innerHTML` with **no** `validHazardColor`/`escapeHtml` — not exploitable today (module-authored lookup tables), but the new unified renderer must not repeat this omission for any field, since `wpc-hazards` can carry pass-through remote text | MMM-SPCOutlook.js:604-614 | MMM-SPCOutlook.js:555-556 — **closed by construction**: `renderDayBlock` is gone; every compact segment (from any of the six day sources, including `wpc-hazards`) passes through `validHazardColor(h.color)` and `escapeHtml(truncateHazardLabel(...))` at the one shared call site | | | 19-04 |
| 21 | T-16-19/IN-08 | `validHazardColor`: strict 6-hex-digit regex, default `"aaaaaa"`; guards both the `color:#undefined` class and attribute injection | MMM-SPCOutlook.js:636-638 | MMM-SPCOutlook.js:246-248 — relocated verbatim above every render branch (WR-06), same body | | | 19-04 |
| 22 | T-16-20/T-16-22 | `truncateHazardLabel`/`HAZARDS_LABEL_MAX_CHARS=60`, truncated **before** escaping (bounds source chars, not entity expansions) | MMM-SPCOutlook.js:623, MMM-SPCOutlook.js:627-632 | MMM-SPCOutlook.js:256-261 — relocated verbatim above every render branch (WR-06), same body; applied at the one shared compact-segment call site, MMM-SPCOutlook.js:556 | | | 19-04 |
| 23 | D-01 (16) | Hazards Outlook weekday from `hazardsWeekdayFromDate(entry.date)` — resolved payload date, never `dowToText(dow+N)` | MMM-SPCOutlook.js:643-646 | MMM-SPCOutlook.js:269-272 — relocated verbatim above every render branch, now also driving the unified compact line's own weekday at MMM-SPCOutlook.js:539 | | | 19-04 |
| 24 | WR-01 (16) | `HAZARDS_EXCLUDED_LABELS`/`HAZARDS_DROUGHT_LABELS`, folded via `hazardsLabelKey` (trim + collapse whitespace incl. U+00A0 + uppercase) — a second, fail-safe-only filter mirroring the backend's own exclusion | MMM-SPCOutlook.js:312-331 | MMM-SPCOutlook.js:509-528 — relocated verbatim above every render branch (WR-06, by 19-04/19-05); still consulted by `renderableWindowEntries` at the relocated band call site | | | 19-06 |
| 25 | D-02 (16) | Hazards day-grid: multiple same-day hazards joined `", "` in payload array order (no re-sort) | MMM-SPCOutlook.js:666-676 | MMM-SPCOutlook.js:551-558 — payload array order preserved (`daySurvivors`'s filter never re-sorts, 18 D-15); separator is now `" · "` (U+00B7), not `", "` — an **intentional** RPT-02/UI-SPEC compact-line change, not a regression | | | 19-04 — separator change is intentional, see Intentional Changes table |
| 26 | WR-04 (16) | Window-band heading `"Extended Hazards:"` written **once**, only if ≥1 renderable entry exists, from inside the loop after the first entry passes | MMM-SPCOutlook.js:686-703 | MMM-SPCOutlook.js:561-609 — `renderHazardsWindowBand` relocated into the combined band, called at MMM-SPCOutlook.js:810 with the promoted top-level `this.spcrisk.windowBand` array instead of the legacy `this.spcrisk.hazardsOutlook.windowBand`; the write-once heading logic (headingWritten flag, lines 578-582) is unchanged | | | 19-06 |
| 27 | D-06/D-08 (16) | Window-band entry: own observed span (never the layer's nominal window); weekday pair omitted (not NaN) if either date is unparseable; single-day `"(D3)"` vs. range `"(D3–7)"` formatting | MMM-SPCOutlook.js:704-729 | MMM-SPCOutlook.js:583-607 — same entry-loop body, unchanged, at the relocated call site | | | 19-06 |
| 28 | WR-06 (16) | Window-band `offsetStart`/`offsetEnd` coerced defensively (`off()` helper), falling back to `"?"` on non-finite | MMM-SPCOutlook.js:722-725 | MMM-SPCOutlook.js:600-604 — `off()` helper unchanged, at the relocated call site | | | 19-06 |
| 29 | D-03 (17) | HeatRisk render loop and no-risk gate term share **one** derivation (`heatRiskDaysToRender`), so a below-floor day can never disagree between gate and render | MMM-SPCOutlook.js:381-398, MMM-SPCOutlook.js:751-763 | MMM-SPCOutlook.js:415-429 — `heatRiskDaysToRender` is retired; the floor now lives inside `daySurvivors` itself (the same predicate the render-decision and render-body both call, per WR-04's rule), so there is only ever one call site to disagree with itself | | | 19-04 |
| 30 | D-01/D-02 (17) | `showMinorHeat` floor: 1 (minor+) vs. 2 (moderate+) default; `null` category never renders (distinct from category 0) | MMM-SPCOutlook.js:383-393 | MMM-SPCOutlook.js:423, MMM-SPCOutlook.js:426 — same 1-vs-2 floor, applied only to `source === "heatrisk"` entries inside `daySurvivors`; a `null` category still never reaches the payload at all (backend's own `NO_RISK_FLOOR`, unchanged), so it never reaches this check either | | | 19-04 |
| 31 | HEAT (17) | HeatRisk row: `validHazardColor`/`escapeHtml` both applied (the one legacy render site that already does this correctly) | MMM-SPCOutlook.js:759-761 | MMM-SPCOutlook.js:555-556 — **closed by construction**, same one shared call site as row 20 (every dimension, not just HeatRisk, now applies both guards identically) | | | 19-04 |
| 32 | (placement, no per-ID) | HeatRisk rendered after Winter Impact, before Hazards Outlook — deliberate near-term-then-longer-range grouping | MMM-SPCOutlook.js:743-750 | | | | RESEARCH.md #32 |
| 33 | PROXUI-05 | `PROX_MIN_WEIGHT = 0.1` noise floor; `weight.toFixed(1)` rounding in badge text | MMM-SPCOutlook.js:197, MMM-SPCOutlook.js:213-214, MMM-SPCOutlook.js:232 | MMM-SPCOutlook.js:200, MMM-SPCOutlook.js:212-223, MMM-SPCOutlook.js:224-231 — `PROX_MIN_WEIGHT`/`hasRenderableProximity`/`proximityBadge` carried forward verbatim, unchanged bodies, now feeding D-08's compact-line exception (`dayProximityOnly`, MMM-SPCOutlook.js:434-438) **and** (19-05) every detail-mode call site in `convectiveDetailAugment` (MMM-SPCOutlook.js:347-424) — the same unmodified `proximityBadge` reused for the categorical, tor/hail/wind, and day-3 cig badges, so the noise floor and rounding apply identically in detail mode | | | 19-04, 19-05 |
| 34 | (day2-none bug, pre-ID) | `hasRenderableProximity`/`hasAnyRenderableProximity` predicates prevent a bare `(Day N): None` line from a sub-noise-floor proximity value | MMM-SPCOutlook.js:204-229 | MMM-SPCOutlook.js:434-438 — `hasAnyRenderableProximity` (the old day1-3 aggregate-of-four-fields form) is retired with the legacy day1/2/3 sections; `dayProximityOnly` is its unified-grid successor, preventing the same bare-line class for the compact line's single categorical-only exception (D-08). (19-05) Detail mode never re-derives this predicate either: every `proximityBadge()` call in `convectiveDetailAugment` returns `""` on its own when the noise floor isn't cleared, so a sub-noise-floor detail badge silently contributes nothing to the label field rather than an empty arrow/paren | | | 19-04, 19-05 |
| 35 | ADVISORY_SOURCES (WR-09/CV-03) | `{spcMD: "showSPCMD", mpd: "showMPD"}` — the one place the frontend names `kml-advisory` registry rows; cannot be derived (browser context) | MMM-SPCOutlook.js:254 | MMM-SPCOutlook.js:292 — unchanged from HEAD (relocated above every render branch by 19-04); the combined band's advisory sub-section (MMM-SPCOutlook.js:789) reads it via `enabledAdvisories()`, same as before | | | 19-06 |

`New site`, `Run A`, and `Run B` are intentionally left empty above — they are filled by
19-04..19-06 (new-site line reference as each behavior lands in the rewritten renderer) and
19-08 (both manual-run columns, during sign-off).

## Backend-Only Provenance (footnote)

Not directly in `getDom()`, but payload-adjacent and worth recording so a parity reviewer does
not go looking for a `getDom()` behavior that was never there. These defects' *fixes* live
entirely in `node_helper.js` — `getDom()` only consumes their already-corrected effects, which
rows 3, 12-15, and 18 above already cover:

- **BUG-01** — SIGN detection (double-arrow syntax fix)
- **BUG-02** — Day 8 return-object shape fix
- **BUG-04** — `checkInPolygon` full-iteration fix
- **FWXT-05** — Day 3-8 fire weather URL/parsing (DN-based, confirmed live)
- **PROX-01** — `computeProximity()` distance-weighted helper (linear 40 km falloff, boundary-safe strict cap)
- **PROX-02** — `proximityWeighting` threading with strict-true coerce
- **PROX-05** — `_geoJsonCache` polygon→line memoization

## Ten Proximity Mode Call Sites

RESEARCH.md's Pitfall 4 names centralizing these ten inside/outside-mode decisions into one
shared predicate as the specific way a rewrite silently flips badge wording. Each per-hazard-type
mode is independent of the day's own categorical mode (PROXUI-03/04) — none of these ten may be
derived from another.

| # | Call site | Legacy source condition | Old site |
|---|-----------|--------------------------|----------|
| 1 | Day 1 categorical | `day1.risk == "NONE"` | MMM-SPCOutlook.js:543 |
| 2 | Day 1 torCig | `day1.torCig === 0` | MMM-SPCOutlook.js:546 |
| 3 | Day 1 hailCig | `day1.hailCig === 0` | MMM-SPCOutlook.js:547 |
| 4 | Day 1 windCig | `day1.windCig === 0` | MMM-SPCOutlook.js:548 |
| 5 | Day 2 categorical | `day2.risk == "NONE"` | MMM-SPCOutlook.js:554 |
| 6 | Day 2 torCig | `day2.torCig === 0` | MMM-SPCOutlook.js:557 |
| 7 | Day 2 hailCig | `day2.hailCig === 0` | MMM-SPCOutlook.js:558 |
| 8 | Day 2 windCig | `day2.windCig === 0` | MMM-SPCOutlook.js:559 |
| 9 | Day 3 categorical | `day3.risk == "NONE"` | MMM-SPCOutlook.js:564 |
| 10 | Day 3 cig | `day3.cig === 0` | MMM-SPCOutlook.js:565 |

## Intentional Changes (verified-expected, NOT regressions)

These five relocations/exceptions are Phase 19's own roadmap-mandated design, recorded here so a
parity reviewer files them as verified-intentional rather than investigating them as regressions
(RESEARCH.md Pitfall 3).

| ID | Change | Authority | Verified expected by |
|----|--------|-----------|------------------------|
| RPT-04-RELOC | SPC MD and WPC MPD advisories move from ABOVE the day rows (legacy `MMM-SPCOutlook.js:513-540`) to a band BELOW all day blocks, joined there by the Hazards Outlook window band (also relocated, from its own prior end-of-render position) — **IMPLEMENTED** at MMM-SPCOutlook.js:763-811 (advisories: 789-802, window band: 803-811); no unifying heading introduced, both sub-sections' internal wording/ordering/colors/escaping unchanged | ROADMAP Phase 19 success criterion 4 / RPT-04 / UI-SPEC "The Band" | 19-06 (implemented); 19-08 sign-off, Run B |
| D-07-RELOC | The categorical proximity badge and the SPC tornado/hail/wind probabilistic breakdown move from the compact (default) line to detail mode only — at default config a user sees neither. This is a relocation, not a removal: both are fully present in detail mode, and D-04's auto-expand surfaces them without reconfiguration | CONTEXT.md D-07 | 19-08 sign-off, Run B (detail mode) |
| D-03-SKIP | Days with no surviving hazard render no row and no marker, so the rendered day list is non-contiguous (e.g. Day 3, Day 6, Day 9) | CONTEXT.md D-03 | 19-08 sign-off, Run B |
| D-08-EXC | Deliberate exception to D-03/D-07: with `proximityWeighting: true`, a day with no surviving hazard still renders, badge alone, so the shipped v1.2 PROXUI outside-mode behavior is not lost at default config | CONTEXT.md D-08 | 19-08 sign-off, Run B (`proximityWeighting: true`) |
| SIGN-NOOP | `detail.sign` (grid days 4-8's `{probRisk, sign}` shape) remains unrendered by `convectiveDetailAugment` — no glyph, no sub-line, no new UI. No shipped `getDom()`, at any milestone, has ever rendered `sign` | RESEARCH.md Open Question 3 (unanswered) — surfacing `sign` would be a new-feature decision outside this parity-gated phase's display-only framing | plan 19-05 (`grep -c "detail\.sign" MMM-SPCOutlook.js` → 0 outside comments); 19-08 sign-off, Run B (days 4-8 render plain label only) |

## Mandatory Manual Runs

Per 15 D-10: the probe suite (`node scripts/probe-payload-resilience.js`) is proof of mechanism —
each scenario is individually mutation-proven. These two manual runs are proof of live behavior
against the real rendered mirror. **Neither substitutes for the other.**

### Run A — "no risk anywhere"

```js
{
  module: "MMM-SPCOutlook",
  position: "top_left",
  config: {
    lat: <coordinate with no active hazard from any source>,
    lon: <coordinate with no active hazard from any source>,
    extended: true,
    updateInterval: 60,
    proximityWeighting: false,
    dayReportDetail: false,
    showExcessiveRain: true,
    showWinterImpact: true,
    showMPD: true,
    showHazardsOutlook: true,
    showHeatRisk: true,
    showSPCMD: true
  }
}
```

How to reach the state: pick a coordinate that today (or over a short observation window) has no
SPC convective risk, no active fire weather, no ERO/WSSI/HazardsOutlook/HeatRisk hazard, and no
live SPC MD or WPC MPD covering it. Confirm via the backend's own logged payload before reading
the display, not by inference from the config alone.

Expected observations:

1. Exactly one line of rendered content.
2. The literal string `No Severe Weather Risk` if the payload is not stale (row 9's confident
   all-clear branch), OR the literal string `No Severe Weather Risk (unconfirmed)` if
   `this.spcrisk._stale` is true (row 9's degraded branch) — record which of the two appeared and
   whether `_stale` was set.
3. Zero day rows (rows 12, 15, 17, 18, 19 must all produce nothing).
4. Zero band lines (row 10, row 26/27 — no advisory line, no `Extended Hazards:` heading).
5. No bare `⚠` badge with nothing beneath it (row 4, CR-01) — if `_stale` fires, the
   `(unconfirmed)` string must be present underneath it, never a dangling badge alone.

### Run B — "everything active at once"

```js
{
  module: "MMM-SPCOutlook",
  position: "top_left",
  config: {
    lat: <coordinate inside an active SPC convective risk area>,
    lon: <coordinate inside an active SPC convective risk area>,
    extended: true,
    updateInterval: 60,
    proximityWeighting: true,
    dayReportDetail: true,
    showExcessiveRain: true,
    showWinterImpact: true,
    showMPD: true,
    showHazardsOutlook: true,
    showHeatRisk: true,
    showSPCMD: true
  }
}
```

How to reach the state: move the coordinate into an active SPC convective outlook polygon during
a period with a live SPC MD and/or WPC MPD covering the same area (verify with a point-in-polygon
check against the live KMZ/GeoJSON, not a bounding-box approximation — Phase 15's operating
procedure documents why a bbox check is insufficient). Restore the real coordinate after the run.

Expected observations, each cross-referenced to a preserved-behavior row above:

1. Compact `Day N (Weekday)` header lines, two literal spaces and ` · ` separators between
   hazard segments (new unified-report layout; the legacy analog is row 12's Day 1/Day 2 line
   format, now merged with every other enabled source on the same day).
2. Dimension sub-rows with `— {Source}` attribution when `dayReportDetail: true` (D-05's grouped
   sub-row layout; the categorical proximity badge and probabilistic breakdown that appear here
   are row 12's and row 14's content, relocated per D-07-RELOC).
3. The tornado/hail/wind icon line present on days 1-2 only, absent on day 3 and days 4-8 (row
   13's per-hazard-type breakdown, and row 17's "no proximity badges for days 4-8" asymmetry).
4. A single combined CIG glyph inline in the day-3 label field, no separate breakdown line (row
   16).
5. No probabilistic sub-line on days 4-8 (row 17).
6. The band below all day blocks containing the SPC MD / WPC MPD lines (row 10, row 11's escaping)
   then the `Extended Hazards:` heading (row 26) with the window-band entries beneath it (row 27,
   row 28's offset coercion), per RPT-04-RELOC.
7. The stale badge (row 8) at the very top of all content, before any day block and before the
   band, if `_stale` is set on the payload during the run.
8. The noise-floor rounding (row 33, `weight.toFixed(1)`) visible on any rendered proximity badge
   value — no un-rounded floating point value should ever appear.

## Sign-Off

- [ ] All 35 preserved-behavior rows above have both `Run A` and `Run B` columns ticked.
- [ ] All 4 intentional-change rows (`RPT-04-RELOC`, `D-07-RELOC`, `D-03-SKIP`, `D-08-EXC`)
      confirmed observed-and-expected during Run A and/or Run B as applicable.
- [ ] `node scripts/probe-payload-resilience.js` reports `0 failed, 0 skipped` at time of sign-off.
- [ ] Operator name: ______________________
- [ ] Date: ______________________
