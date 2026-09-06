# Phase 18 — Deferred Items (out of scope for the plan that found them)

## `sources[].reportedDays` over-reports for `wpc-ero`/`wpc-wssi` when their toggle is off

**Found during:** 18-05 Task 3, while implementing `_buildSourceHealth`.

**What's wrong:** `_runArcGisDayProduct` (used by `wpc-ero`/`wpc-wssi`) seeds every
`day{N}Risk` field to the string `"NONE"` before checking `productToggles[row.configFlag]`,
and only overwrites it via a real fetch when the toggle is on (node_helper.js:328-343).
`_addRegistryDayGridEntries` (18-04) reads `payload[day${d}Risk]`, sees a string either way,
and calls `notes.noteReported(sourceId, d)` unconditionally — so `reportedDays[wpc-ero]`
and `reportedDays[wpc-wssi]` are populated with every day even when the product was never
fetched at all. This is unlike HeatRisk, whose toggle-off path returns an empty `gridTuples`
array up front (node_helper.js:1008-1010), so `reportedDays['heatrisk']` correctly stays
empty when disabled.

**Why it's out of scope for 18-05:** the root cause lives in `_addRegistryDayGridEntries`,
written by plan 18-04, and 18-05's own acceptance criteria only require the toggle-off
invariant to hold for `heatrisk` specifically (18-05-PLAN.md Task 3's acceptance criteria).
Fixing `_addRegistryDayGridEntries` itself would mean either threading `productToggles` into
a function that today only receives the already-resolved payload, or having it read
`enabled` from its caller — a second entry point beyond this plan's own five entry-assembly
calls, and a change to a prior plan's already-committed, already-verified code for a case
this plan's own acceptance criteria does not exercise.

**Mitigation already applied in 18-05:** `_buildSourceHealth`'s `reporting` field is now
gated on `enabled` for every source (not only the two advisory sources), so a disabled
`wpc-ero`/`wpc-wssi` correctly reports `reporting: false` even though its raw
`reportedDays` array still lists every day. Any caller that reads `sources[id].reporting`
(the field the plan's own JSDoc and `summary.reportingSourceCount` both use) sees the
correct answer; only a caller that reads the raw `reportedDays` array directly, bypassing
`reporting`, would be misled.

**Suggested fix (future plan, e.g. 18-08 or a Phase 18 cleanup pass):** gate
`_addRegistryDayGridEntries`'s `notes.noteReported` call on the same
`productToggles[row.configFlag]` check `_runArcGisDayProduct` already applies, or have the
runner return a `fetched: boolean` alongside its payload so the grid-entry builder can skip
`noteReported` when the underlying fetch never ran — mirroring HeatRisk's
empty-`gridTuples`-when-off pattern.

**Resolved:** Plan 18-11. `_addRegistryDayGridEntries` gained a sixth `productToggles` parameter
and a strict `productToggles[row.configFlag] !== true` early return before the whole day loop
(mirroring `_runHeatRiskProduct`'s empty-`gridTuples`-when-off shape, matching the suggested fix's
first option above). Pinned by the mutation-proven scenario
`merge-sources-disabled-registry-source-reports-no-days`. Observed arrays: toggle off
(`showExcessiveRain: false, showWinterImpact: false`) — `sources['wpc-ero'].reportedDays = []`,
`sources['wpc-wssi'].reportedDays = []`, both `activeDays = []`, both `reporting = false`; toggle on
— `sources['wpc-ero'].reportedDays = [1,2,3,4,5]`, `sources['wpc-wssi'].reportedDays = [1,2,3]`,
both `reporting = true` (the full registry-declared spans, unchanged from pre-fix behavior when the
product is genuinely enabled). `_buildSourceHealth`'s `reporting`-gated-on-`enabled` mitigation from
18-05 is kept in place as redundant defense-in-depth.

## A live `wpc-hazards` single-day feature with `start_date === end_date` is silently dropped from the unified `days[]` grid (MERGE-01)

**Found during:** 18-09 Task 1, live capture against `cpc_weather_hazards/MapServer` layer 4
(Precipitation, Days 3-7).

**What's wrong:** `_addHazardsOutlookGridEntries` (node_helper.js:2835-2919) computes
`gridStart = _gridDayOf(match.startDate, anchorInfo.nominalStartMs)` and
`gridEnd = _gridDayOf(match.endDate, anchorInfo.nominalStartMs)`, then emits on grid days
`gridStart .. (gridEnd - 1)` inclusive. This assumes, per the function's own comment
(node_helper.js:2874-2876), that `end_date` is the EXCLUSIVE end of the source's 00Z-00Z span, so
a genuine single-calendar-day feature has `gridEnd = gridStart + 1`. A live feature captured
2026-09-05 (`"Heavy Rain"`, `objectid 7917`, near Kotzebue, AK) instead carries
`start_date === end_date` (`1788998400000` for both, i.e. `2026-09-10T00:00:00.000Z` for both) —
an INCLUSIVE/zero-duration representation. Under that live shape, `gridEnd - 1 < gridStart`, the
clamped emission range is empty, and the entry is silently dropped from every grid day, while the
legacy `hazardsOutlook` block's own inclusive-endpoint loop (`_bucketHazardMatch`) correctly
buckets the same feature onto `day5` (its calendar date). Full trace, live values, and the
substituted-value control confirming the mechanism is otherwise sound: see
`18-LIVE-CAPTURE.md`'s "Criterion 1 (MERGE-01, near-boundary)" section.

Note this is NOT a universal upstream convention failure: a same-poll, same-MapServer
Temperature-group feature (`"High Winds"`) DID show the assumed exclusive-end shape
(`end_date = start_date + 86400000`). The two groups are not internally consistent about this
convention in this one live sample, at minimum.

**Why it's out of scope for 18-09:** 18-09's `files_modified` are `18-LIVE-CAPTURE.md` and
`STATE.md` only; the plan explicitly prohibits modifying production source. The root cause lives
in 18-04's already-committed `_addHazardsOutlookGridEntries`, and the correct fix is a product-code
decision (see below), not a mechanical one this plan's scope covers.

**Suggested fix (future plan):** treat `start_date === end_date` as a genuine 1-day inclusive span
in `_addHazardsOutlookGridEntries` — e.g., when `match.endDate === match.startDate`, compute
`gridEnd` as `_gridDayOf(match.endDate, anchorInfo.nominalStartMs) + 1` before subtracting 1, so a
zero-duration live feature is treated identically to the "genuine single-day feature" case the
existing comment already describes, mirroring the legacy loop's own inclusive semantics
(`_bucketHazardMatch`'s `for (d = max(offsetStart, firstDay); d <= min(offsetEnd, lastDay); d++)`
treats `offsetStart === offsetEnd` as exactly one day). A mutation-proven probe scenario using the
live-observed `start_date === end_date` shape (rather than
`merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day`'s assumed `end = start + 1 day`
fixture) should accompany the fix.

**Resolved:** Plan 18-10. The target expression is `Math.max(gridStart, gridEnd - 1)` — the
general form, not this entry's own narrower epoch-equality suggestion (`when match.endDate ===
match.startDate, compute gridEnd as ... + 1`), because the narrower form would still drop a
genuine sub-day span (e.g. `end_date` a few hours after `start_date` but before the next 00Z)
under the same clamp. Pinned by two mutation-proven scenarios:
`merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day` (the live-captured
`start_date === end_date === 1788998400000` shape, now landing on grid day 6) and
`merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day` (the exclusive-
convention regression guard). Full arithmetic and mutation table: `18-10-SUMMARY.md`. Re-validated
against this same live capture in `18-LIVE-CAPTURE.md`'s "Re-validation after the 18-10 fix"
subsection (plan 18-12).

## Legacy `heatRisk.day1..day7` block drops day 7 for 12 of every 24 hours (pre-existing, not a Phase 18 regression)

**Found during:** 18-12 Task 3, operator's live MagicMirror display check on the deployed mirror,
2026-09-05 19:46 CDT (`2026-09-06T00:46Z`).

**What's wrong:** the operator observed the module rendering only HeatRisk days 1-6 when 7 days of
data exist. `_runHeatRiskProduct` (node_helper.js:1153) filters `_todayUtcMs()`-relative day
offsets with `if (d < 1 || d > row.days) continue;` before bucketing into the legacy
`heatRisk.day1..day7` fields. HeatRisk's `idp_validtime` sits at exactly 12:00Z; `_todayUtcMs()` is
UTC midnight. During the 00Z-12Z half of a UTC day (roughly 7 PM - 7 AM CDT), the mosaic's oldest
tile resolves to day offset 0 and is discarded by this filter, and no tile then maps to day 7 —
so the legacy block carries only 6 days for half of every day. Verified arithmetic at the observed
instant: tiles `2026-09-05T12:00Z .. 2026-09-11T12:00Z` map to offsets `0(discarded),1,2,3,4,5,6`.

**Why this is NOT a Phase 18 regression:** Phase 18's unified `days[]` grid is unaffected and
already carries all seven days — `18-LIVE-CAPTURE.md` records
`"heatrisk": {..., "reportedDays":[1,2,3,4,5,6,7], "activeDays":[1,2,3,4,5,6,7], ...}`. 18-03
deliberately pushes `gridTuples` onto the unified path BEFORE this same filter, specifically to
avoid this loss (node_helper.js:1136-1145's own comment names the exact mechanism). `git blame`
attributes the filter itself to `feat(17-04)`, which predates Phase 18 entirely. Neither 18-10 nor
18-11 touches this function or writes the legacy `heatRisk` block — both write only `gridDays`.

**Severity note:** node_helper.js:1141's comment justifies the grid-side handling by calling a
dropped tile "a false negative on a heat-safety product this project's value statement forbids
outright." This legacy-path defect is the mirror image of that same failure mode (loses day 7
instead of day 1), on the path Phase 19 is about to remove.

**Why it's out of scope for 18-12:** 18-12's `files_modified` are documentation-only; the plan
explicitly performs no production source change. The operator's routing decision (see below) also
makes a standalone code fix unwarranted here regardless of scope.

**Routing decision (operator, at the 18-12 Task 3 checkpoint):** log it, let Phase 19 fix it.
Phase 19 rewrites the display onto the unified payload, which already carries all seven days
correctly, so no separate code fix is warranted on a legacy path Phase 19 removes. Tracked via
`.planning/todos/pending/` (see the todo carrying `resolves_phase: 19`) so it auto-surfaces until
Phase 19 closes, and is not a Phase 18 blocker.
