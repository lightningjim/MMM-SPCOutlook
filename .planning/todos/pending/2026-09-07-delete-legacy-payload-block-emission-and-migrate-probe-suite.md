---
created: 2026-09-07T00:00:00Z
title: Delete the legacy payload-block emission and migrate the probe suite off it
area: backend, testing
files:
  - node_helper.js
  - scripts/probe-payload-resilience.js
---

## Problem

`node_helper.js` still emits eight legacy payload blocks (`day1..day8`, `fireWeather`,
`excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`, `advisories`) that no render path
reads. Plan 19-06 made the unified day report (`spcrisk.days[]` / `spcrisk.windowBand`) the sole
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
