---
created: 2026-09-07T00:00:00Z
title: Delete the legacy payload-block emission and migrate the probe suite off it
area: backend, testing
files:
  - node_helper.js
  - scripts/probe-payload-resilience.js
---

## Problem

> **CORRECTION (v2.0 milestone audit, 2026-09-11) — READ BEFORE EXECUTING THIS TODO.**
> The inventory below was wrong in two ways, and acting on it as originally written would have
> broken the live display. Both corrections are verified by source read at HEAD.
>
> 1. **`advisories` is NOT dead — it is the sole transport for the MPD / SPC MD band.**
>    `MMM-SPCOutlook.js:967` reads `this.spcrisk.advisories` inside `enabledAdvisories()`, consumed
>    by the band render loop at `:1498-1511`. Deleting it deletes MPD-01/02/03 and SPC MD from the
>    screen. Note the `rpt01-getdom-reads-no-legacy-payload-block` probe's own legacy-accessor list
>    correctly OMITS `spcrisk.advisories` — the probe and this todo contradicted each other, and the
>    probe was right. **`advisories` is removed from the retirement scope.**
> 2. **`day48Risk` (`node_helper.js:5391`) is a ninth emitted legacy key** that is genuinely unread
>    and was missing from this inventory. **Added to scope**, so it does not survive by omission.
>
> Also: this is **not a pure deletion**. The RPT-04 window band is PRODUCED inside the legacy
> `hazardsOutlook` block — `windowEntries` is filled only by `_bucketHazardMatch`, assembled as
> `block.windowBand`, and the top-level `windowBand` at `:5464-5466` is a REFERENCE to that same
> array. The helpers `_hazardDayOffset`, `_todayUtcMs` and `_isFullNominalWindow` are likewise
> load-bearing for the unified render (band-vs-grid routing reads them at `:2909-2911`).
> `windowEntries`/`windowBand` assembly and those three helpers must be EXTRACTED before the
> `hazardsOutlook` block is removed, or RPT-04 breaks.

`node_helper.js` still emits legacy payload blocks (`day1..day8`, `day48Risk`, `fireWeather`,
`excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`) that no render path
reads. (`advisories` was listed here originally and is NOT one of them — see the correction above.) Plan 19-06 made the unified day report (`spcrisk.days[]` / `spcrisk.windowBand`) the sole
reader, pinned by the permanent probe scenario `rpt01-getdom-reads-no-legacy-payload-block`. The
legacy blocks are dead payload weight crossing the backend->frontend socket, and two known
defects still live inside them, un-discharged from the emitted payload (only discharged from the
screen, since nothing renders them):

1. The legacy `heatRisk.day1..day7` block drops day 7 for ~12 of every 24 hours (00Z-12Z UTC
   window) — `node_helper.js:1152-1153`.
2. The legacy `hazardsOutlook.dayN` keys are labelled by raw 0-based offset rather than the
   1-based NWS day they hold — `node_helper.js:915-916,920` — and cannot represent an offset-2
   (NWS Day 3) feature at all.

Full discharge reasoning for both (why they are inert on screen but still present in the emitted
payload) is in `.planning/phases/19-unified-day-report-getdom-rewrite/19-LEGACY-RETIREMENT.md`.

## Measured Cost (as of 2026-09-07, base commit `30a893c201a697a1a98342a7a2f2f20c46b0836b`)

- `assertPayloadIntact` call sites in `scripts/probe-payload-resilience.js`: **172**
  (`grep -c "assertPayloadIntact" scripts/probe-payload-resilience.js`)
- Legacy-field assertions (`out.day1..day8` / `.fireWeather` / `.excessiveRain` /
  `.winterImpact` / `.hazardsOutlook` / `.heatRisk`): **198**
  (`grep -c "out\.\(day[1-8]\|fireWeather\|excessiveRain\|winterImpact\|hazardsOutlook\|heatRisk\)\b" scripts/probe-payload-resilience.js`)
- Total scenarios in the suite: **157** (`node scripts/probe-payload-resilience.js` run output;
  the literal `grep -c "^    name:"` count of 158 includes one false positive — a `name: "Pixel"`
  field inside an unrelated ArcGIS fixture helper at line 400, not a scenario declaration)

`assertPayloadIntact` dispatches unconditionally on every `PRODUCT_REGISTRY` row's `kind`
(`arcgis-day-layers`, `arcgis-hazard-window`, `arcgis-identify-point`, `kml-advisory`) and throws
on any undeclared kind, so deleting any one legacy block fails essentially every scenario that
calls this shared oracle at once, not just the scenarios targeting that block.

## Scope

1. Rewrite `assertPayloadIntact` (and its two delegates, `assertHeatRiskBlockIntact` and
   `assertHazardsBlockIntact`) to assert against the unified `days[]`/`windowBand` shape instead
   of the eight legacy blocks.
2. Re-point all ~198 legacy-field assertions across the 157 scenarios at the unified payload's
   equivalent fields.
3. Re-establish 15 D-10 mutation proof (break the exact line, confirm RED with a diagnosable
   message, restore) for every re-pointed scenario — a scenario that stays green after its
   assertion is rewritten but was never re-broken-and-restored is a fixture defect, not evidence
   of correctness, per the standing D-10 rule.
4. Delete the eight legacy payload-block-emitting code paths from `node_helper.js` once the
   probe suite no longer depends on them.

This does not fit inside a single plan's context budget alongside other work — it is a
whole-suite migration, not a local fix. Plan it on its own.

## Prerequisites already met

Plans 19-02 and 19-06 already removed the two reasons the legacy blocks were still load-bearing
outside test coupling: proximity weighting and the window band are both now carried in the
unified payload. The only remaining reason the legacy blocks exist is the probe suite's coupling
to them (measured above), not any live render-path need.
