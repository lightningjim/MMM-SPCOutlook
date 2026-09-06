---
phase: 18-merge-precedence-unified-payload-schema
plan: 16
subsystem: node_helper.js payload assembly (Promise.allSettled rejection handling)
tags: [gap-closure, RPT-07, CR-01, resilience, probe-suite]
dependency-graph:
  requires: ["18-13", "18-14", "18-15"]
  provides: ["RPT-07"]
  affects: ["node_helper.js", "scripts/probe-payload-resilience.js"]
tech-stack:
  added: []
  patterns:
    - "head-of-function null/type guard ahead of an existing gate, covering all call sites with one check"
    - "guarded-expression-at-the-read-site for a documented-nullable payload, leaving the consuming function's own internal guard untouched"
    - "three-run probe scenario (two forced-rejection runs + one no-rejection control) sharing one runWith(stubName) closure"
key-files:
  created: []
  modified:
    - node_helper.js
    - scripts/probe-payload-resilience.js
    - .planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md
decisions:
  - "One head-of-function guard on _addRegistryDayGridEntries, not two call-site guards — matches the reason 18-11 put the toggle gate there instead of duplicating it"
  - "assertPayloadIntact is NOT the oracle for a run with a rejected member; the narrower CR-01 contract (out.error undefined, the rejected block exactly null, every other block intact) is asserted directly, with assertPayloadIntact reserved for the no-rejection control"
metrics:
  duration: ~55min
  completed: 2026-09-06
---

# Phase 18 Plan 16: Guard the Promise.allSettled rejection branch against a total-payload collapse (RPT-07/CR-01) Summary

Three unguarded reads added earlier in Phase 18 turned any single rejected `Promise.allSettled`
member into a `TypeError` that collapsed the entire `getSpcOutlook` payload to `{ error }`,
blanking the display for every product — including ones that fetched cleanly in the same poll.
All three are now guarded, and a new probe scenario forces real runner rejections (not merely
failed fetches) to prove the rest of the payload survives.

## What Was Built

**Task 1 — three guards (node_helper.js), commit `9510b02`:**

- **SITE 1** (`node_helper.js` ~4909-4923, the once-per-process `eroPayload.day1ValidTime`
  log sample):
  ```js
  JSON.stringify(eroPayload && eroPayload.day1ValidTime)
  ```
- **SITE 2** (`_addRegistryDayGridEntries`, node_helper.js ~3286-3294), a new FIRST statement
  ahead of both the floor lookup and the existing toggle gate, covering both of the function's
  call sites (`wpc-ero`, `wpc-wssi`) with one check:
  ```js
  _addRegistryDayGridEntries(gridDays, sourceId, payload, row, notes, productToggles) {
    // CR-01: a rejected `Promise.allSettled` member substitutes `payload: null` per the
    // batch's own documented contract ...
    if (!payload || typeof payload !== "object") return;

    const floor = NO_RISK_FLOOR[sourceId];
    ...
  ```
- **SITE 3** (the `_buildGridSummary` call site, node_helper.js ~5074-5077):
  ```js
  const gridSummary = this._buildGridSummary(
    gridDays, hazardsPayload && hazardsPayload.windowBand, advisories, sourceHealth, gridAnchorInfo
  );
  ```
  `_buildGridSummary`'s own internal `Array.isArray(windowBand)` guard was left unchanged — it
  already turns a falsy value into a zero count; the defect was the unguarded read at the call
  site, ahead of that internal guard.

Verified: `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 122 passed, 0 failed, 0
skipped` — exact baseline match, confirming the guards break nothing.

**Task 2 — the rejection-branch probe scenario (scripts/probe-payload-resilience.js), commit
`42570ce`:**

Added `rpt07-rejected-runner-degrades-alone-not-the-whole-payload`, appended after
`merge-sources-disabled-registry-source-reports-no-days` (the last RPT-07/merge-sources-*
scenario). Three runs share one `runWith(stubName)` closure: `resetHelper`, `resetLogs`, pin
`turfStub.pointInPolygon = () => true` and `helper._nowMs = () => MERGE_NOW_MS`, set
`helper._products = { showExcessiveRain: true, showWinterImpact: true, showHazardsOutlook: true }`,
route `day1otlk_cat.lyr.geojson` to `SPC_SLGT_BODY` and everything else via `hazardsRoutes()`,
then — after `resetHelper`, because it restores every seam — install
`helper[stubName] = async () => { throw new Error("probe: forced runner rejection"); }` when a
stub name is given.

- **Run A** stubs `_runArcGisDayProduct`, rejecting both `excessiveRain` and `winterImpact` at
  once (both route through that one function), covering SITE 1 and both of SITE 2's call sites.
  Precondition guard requires the log line `"excessiveRain: runner rejected unexpectedly"`.
  Asserts `out.error === undefined`, `out.excessiveRain === null`, `out.winterImpact === null`,
  the SPC sibling's real value (`out.day1.risk === "SLGT"`, a `spc-convective` entry on day 1),
  the unified block assembled (`Object.keys(out.days).length === 14`, non-null `summary`/
  `sources`), `assertHazardsBlockIntact`/`assertHeatRiskBlockIntact` both hold, and the degrade
  is visible: `sources["wpc-ero"]`/`sources["wpc-wssi"]` both report `reporting: false` and an
  empty `reportedDays`.
- **Run B** stubs `_runArcGisHazardWindowProduct`, covering SITE 3 (fires on every poll).
  Precondition guard requires `"hazardsOutlook: runner rejected unexpectedly"`. Asserts
  `out.error === undefined`, `out.hazardsOutlook === null`, `out.day1.risk === "SLGT"`,
  `out.summary.bandDiagnostics.windowBandCount === 0` (the guarded `windowBand` degraded to the
  empty-band answer rather than throwing), fourteen grid days, and `out.excessiveRain` still a
  non-null object (the non-rejected sibling).
- **Run C** (control, no stub) calls `assertPayloadIntact` in full, and confirms
  `out.excessiveRain` is a non-null object and `out.day1.risk === "SLGT"` — proving the nulls in
  A/B are attributable to the forced rejection, not to a fixture that never produced those
  blocks.

Verified: `PROBE RESULT: 123 passed, 0 failed, 0 skipped`, exit 0.
`git diff scripts/probe-payload-resilience.js` is a pure 161-line addition — no edit lands
inside `assertPayloadIntact`'s body (lines 1029-1151), so it is byte-unchanged.

**Task 3 — WR-01 residual entry (deferred-items.md), commit `5de5bc5`:**

Appended an entry recording that `sources[].reportedDays`'s fetch-FAILURE half (distinct from
the toggle-off half 18-11 closed and the runner-rejection half this plan closed) remains open
for `wpc-ero`, `wpc-wssi`, `spc-convective` and `spc-fire`. Names `18-REVIEW.md` WR-01 and the
affected line numbers (`node_helper.js:3115`, `:3216`, `:3301` per the review), and the proposed
fix (an `answeredDays` side-channel out of `_runArcGisDayProduct` and an `answered` flag through
the SPC inline chain into `_addSpcGridEntries`). `git diff --stat` after this task shows only
`deferred-items.md` changed; no `.planning/todos/` file was created.

## Why `assertPayloadIntact` Was Not Used as the Oracle on the Rejection Runs

`assertPayloadIntact` (scripts/probe-payload-resilience.js:1029) dispatches over every
`PRODUCT_REGISTRY` row and requires each product's payload block to be a non-null object. A
genuinely rejected `Promise.allSettled` member makes `getSpcOutlook`'s return object set that
product's block to `null` BY DESIGN (the settle loop's own `{ payload: null, entries: [],
anyStale: true }` substitution) — that is the documented degrade this plan restores, not a
regression. Calling `assertPayloadIntact` wholesale on run A or run B would therefore fail even
after a perfect fix, and weakening or forking it to accommodate this one scenario would retire
coverage for the ~60 other scenarios that depend on it as the D-05 payload-shape oracle.

The narrower CR-01 contract was asserted directly instead: `out.error === undefined` (no total
collapse), the rejected product's block is exactly `null` (the documented degrade, and proof
the rejection really happened), and every other product's block still passes its own targeted
intactness helper (`assertHazardsBlockIntact`/`assertHeatRiskBlockIntact`) with real fetched
values intact. `assertPayloadIntact` is applied in full only to run C, the no-rejection
control, proving the fixture is otherwise healthy.

## Mutation Proof

Each of the three guards was reverted independently, run, the failure recorded verbatim,
restored, and the suite re-run green before moving to the next.

| Mutation | Site reverted | Run that goes RED | Verbatim failure | Counts under mutation | Counts restored |
|----------|---------------|--------------------|-------------------|------------------------|-------------------|
| M1 | SITE 2 — deleted `if (!payload \|\| typeof payload !== "object") return;` from `_addRegistryDayGridEntries` | Run A | `run A: payload collapsed to { error }: TypeError: Cannot read properties of null (reading 'day1Risk')` | `PROBE RESULT: 122 passed, 1 failed, 0 skipped` | `PROBE RESULT: 123 passed, 0 failed, 0 skipped` |
| M2 | SITE 1 — reverted to `JSON.stringify(eroPayload.day1ValidTime)` | Run A | `run A: payload collapsed to { error }: TypeError: Cannot read properties of null (reading 'day1ValidTime')` | `PROBE RESULT: 122 passed, 1 failed, 0 skipped` | `PROBE RESULT: 123 passed, 0 failed, 0 skipped` |
| M3 | SITE 3 — reverted to `hazardsPayload.windowBand` | Run B | `run B: payload collapsed to { error }: TypeError: Cannot read properties of null (reading 'windowBand')` | `PROBE RESULT: 122 passed, 1 failed, 0 skipped` | `PROBE RESULT: 123 passed, 0 failed, 0 skipped` |

**M1/M2 combined (both reverted at once, to determine which throws first on run A's shared
path):** result was `run A: payload collapsed to { error }: TypeError: Cannot read properties
of null (reading 'day1ValidTime')` — SITE 1 (M2, `day1ValidTime`) throws FIRST, because that
read executes earlier in `getSpcOutlook`'s control flow (immediately after the settle loop,
before `_addRegistryDayGridEntries` is ever called later in the function). This confirms the
two guards are independently load-bearing rather than one masking the other: SITE 1 happens to
run first in this control flow, but SITE 2's guard is what protects `_addRegistryDayGridEntries`
regardless of whether SITE 1 ever executes (e.g. after the first poll of a process, when
`_loggedEroValidTimeSample` is already `true` and SITE 1's block is skipped entirely).

No mutation left the suite green — every one of the three assertions is load-bearing.

## Deviations from Plan

None — plan executed exactly as written. Line numbers in the plan's `<interfaces>` section
(e.g. "node_helper.js:4887" for SITE 1) were written against a slightly earlier state of the
file (before 18-13/18-14/18-15 merged in); the same three reads were located by content match
rather than by line number and guarded identically to the plan's `<action>` text. No functional
divergence.

## Self-Check

- `node_helper.js` — FOUND, modified with three guards (Task 1)
- `scripts/probe-payload-resilience.js` — FOUND, modified with the new scenario (Task 2)
- `.planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md` — FOUND,
  modified with the WR-01 residual entry (Task 3)
- Commit `9510b02` (Task 1) — present in `git log`
- Commit `42570ce` (Task 2) — present in `git log`
- Commit `5de5bc5` (Task 3) — present in `git log`
- `node scripts/probe-payload-resilience.js` — ran directly, observed
  `PROBE RESULT: 123 passed, 0 failed, 0 skipped`, exit code 0

## Self-Check: PASSED
