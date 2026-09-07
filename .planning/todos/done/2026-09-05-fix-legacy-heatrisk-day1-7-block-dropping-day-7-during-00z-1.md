---
created: 2026-09-06T00:46:00Z
title: Fix legacy HeatRisk day1-7 block dropping day 7 during 00Z-12Z window
area: display
resolves_phase: 19
files:
  - node_helper.js:1153
---

## Problem

The legacy `heatRisk.day1..day7` block renders only 6 of 7 days for roughly 12 of every 24 hours
(the 00Z-12Z UTC window, ~7 PM - 7 AM CDT). `_runHeatRiskProduct`'s day-offset filter
(`if (d < 1 || d > row.days) continue;`, node_helper.js:1153) discards any tuple whose offset falls
outside `1..row.days`. HeatRisk's `idp_validtime` sits at exactly 12:00Z while `_todayUtcMs()` is
UTC midnight, so during the 00Z-12Z half of a UTC day the mosaic's oldest tile resolves to offset 0
and is discarded, and nothing then maps to day 7.

Observed live on the deployed mirror 2026-09-05 19:46 CDT (`2026-09-06T00:46Z`) during the Phase
18-12 checkpoint, and root-caused by the orchestrator before routing: verified arithmetic at that
instant shows tiles `2026-09-05T12:00Z .. 2026-09-11T12:00Z` mapping to offsets
`0(discarded),1,2,3,4,5,6`.

**This is NOT a Phase 18 regression.** Phase 18's unified `days[]` grid already carries all seven
days correctly (`18-LIVE-CAPTURE.md`: `"heatrisk": {..., "reportedDays":[1,2,3,4,5,6,7], ...}`) —
18-03 deliberately pushes `gridTuples` onto the unified path BEFORE this same filter for exactly
this reason. `git blame` attributes the filter to `feat(17-04)`, which predates Phase 18. Neither
18-10 nor 18-11 touches this function or the legacy `heatRisk` block.

Full trace: `.planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md`'s
"Legacy `heatRisk.day1..day7` block drops day 7" entry.

## Solution

Phase 19 rewrites the display onto the unified payload (which already carries all seven days
correctly), so no separate fix to the legacy path is needed — this defect is retired along with the
legacy `heatRisk` block itself when Phase 19 lands. If Phase 19 is delayed or descoped, revisit
whether a standalone fix to `_runHeatRiskProduct`'s legacy-bucketing filter is warranted in the
interim (mirror the unified path's approach: push tuples to the legacy bucket before the
`_todayUtcMs`-relative filter, or use the same nominal-anchor-based day computation the unified
path already uses instead of raw `_todayUtcMs()`).

## Resolution (2026-09-07, Phase 19-09)

Discharged, not fixed. Plan 19-06 made `spcrisk.days[]` / `spcrisk.windowBand` the sole render
path and pinned it with the permanent probe scenario `rpt01-getdom-reads-no-legacy-payload-block`
(`scripts/probe-payload-resilience.js:12385-12409`). Plan 19-09 re-ran the sole-reader proof
against the finished renderer at base commit `30a893c201a697a1a98342a7a2f2f20c46b0836b` and
confirmed `getDom()` reads zero legacy accessor strings, including `spcrisk.heatRisk` — so the
`node_helper.js:1152-1153` filter this todo names can no longer reach the screen through any
render path that exists today.

**Important precision:** discharged means unreachable **on screen**, not deleted from the
**emitted payload**. `_runHeatRiskProduct`'s day-offset filter still executes every poll and the
legacy `heatRisk.day1..day7` block it populates (day 7 still dropped ~12h/24h) still crosses the
backend->frontend socket — it simply has no reader. The defect disappears entirely only once the
backend emission itself is deleted, which is now a separately-tracked, separately-scoped item:
`.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`.

Full reasoning, the sole-reader proof's command and output, and the measured deletion cost are
recorded in `.planning/phases/19-unified-day-report-getdom-rewrite/19-LEGACY-RETIREMENT.md`.
