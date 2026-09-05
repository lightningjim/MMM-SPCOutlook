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
