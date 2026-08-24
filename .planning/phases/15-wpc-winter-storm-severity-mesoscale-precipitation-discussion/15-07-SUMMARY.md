---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 07
subsystem: api
tags: [magicmirror, socket-notification, xss-escaping, kml-advisory]

# Dependency graph
requires:
  - phase: 15-06
    provides: "the kml-advisory pipeline (_runKmlAdvisoryRow, _prepareMpdEntry, MPD-04 validity gate) that this plan wires into getSpcOutlook"
provides:
  - "the [outlook, seq] two-element socket contract with advisories inside outlook.advisories.{spcMD,mpd}"
  - "one escaped, source-prefixed, uncapped advisory band in getDom (D-05/D-06/D-07)"
  - "the no-risk short-circuit's advisory term, closing the MPD-01 false-negative"
affects: [15-08, 15-09, 19-getDom-rewrite]

# Tech tracking
tech-stack:
  added: []
  patterns: ["advisory fetches folded into getSpcOutlook so their staleness participates in the same anyStale accumulation as every other product"]

key-files:
  created: []
  modified: [node_helper.js, MMM-SPCOutlook.js, scripts/probe-lib/module-stubs.js]

key-decisions:
  - "Task 1's backend and frontend edits (node_helper.js, MMM-SPCOutlook.js, scripts/probe-lib/module-stubs.js) landed in one commit (c4ad80f) per the plan's atomicity requirement, since a split would leave CR-03's out-of-order discard silently disabled"
  - "showSPCMD defaults true (deviation from CFG-01), commented inline, since it migrates a shipping always-on feature rather than introducing a new one"

patterns-established:
  - "kml-advisory registry rows are iterated generically (Object.values(PRODUCT_REGISTRY).filter(kind === 'kml-advisory')) rather than hardcoded per-row, so a future kml-advisory row needs no new call site in getSpcOutlook"

requirements-completed: [MPD-01, MPD-02, MPD-03]

# Metrics
duration: ~15min
completed: 2026-08-24
---

# Phase 15 Plan 07: Socket Migration & Advisory Band Summary

**Retired the three-element `[outlook, md, seq]` socket in favor of `[outlook, seq]` with advisories folded into `outlook.advisories.{spcMD,mpd}`, and rendered them as one escaped, source-prefixed band that now also defeats the no-risk short-circuit.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-24T12:05:00Z (approx)
- **Completed:** 2026-08-24T12:20:58Z
- **Tasks:** 2 completed
- **Files modified:** 3 (node_helper.js, MMM-SPCOutlook.js, scripts/probe-lib/module-stubs.js)

## Accomplishments

- `getSpcOutlook` now drives every `kml-advisory` registry row (SPC MD, WPC MPD) itself, folding a fetch failure into the run's own `anyStale` — a failure that previously escaped `getSpcOutlook`'s staleness machinery entirely via the separate `md` top-level fetch.
- The socket contract changed atomically at both ends in a single commit: `node_helper.js` emits `[outlook, this._seq]` and `MMM-SPCOutlook.js` reads `seq` at `payload[1]`. CR-03's out-of-order discard was driven through the real frontend handler (in-order → out-of-order → higher-order) and confirmed still functioning at the new index.
- `getDom` renders one advisory band: `SPC MD 2108 in effect.` / `WPC MPD 1118 — Heavy rainfall, Flash flooding possible in effect.`, matching D-05 exactly, with both `label` and `hazardType` passed through `escapeHtml` (hostile `<img onerror>` / `<script>` fixtures confirmed escaped) and no cap on the number of entries (D-07).
- The no-risk short-circuit gained an advisory term, closing a live false negative: before this plan, a location inside an active discussion with no other risk rendered the literal `"No Severe Weather Risk"` and the advisory never displayed — dormant for SPC MDs, fatal for MPD-01.

## Task Commits

Each task was committed atomically:

1. **Task 1: ATOMIC — move advisories into the payload and seq to index 1, both ends together** - `c4ad80f` (feat) — touches `node_helper.js`, `MMM-SPCOutlook.js`, `scripts/probe-lib/module-stubs.js` in one commit
2. **Task 2: Render the single advisory band and extend the no-risk gate to advisories** - `1da1b94` (feat) — `MMM-SPCOutlook.js`

_Note: this plan has no plan-metadata commit here — this executor runs in worktree mode; the orchestrator makes the final metadata commit after merge (per its explicit instruction not to update STATE.md/ROADMAP.md)._

## Files Created/Modified

- `node_helper.js` — `getSpcOutlook` now iterates `kml-advisory` registry rows via `_runKmlAdvisoryRow`, builds `advisories: { spcMD: [...], mpd: [...] }` (both keys always arrays), and folds each row's `anyStale` into the run. `socketNotificationReceived` drops the separate `md` fetch/try-catch and the transitional `getMesoscaleDiscussion` wrapper is deleted. Emit changed to `sendSocketNotification("SPC_DATA_RESULT", [outlook, this._seq])`.
- `MMM-SPCOutlook.js` — `socketNotificationReceived` reads `seq` from `payload[1]` (comment updated to record the Phase 15 index move); `this.mds` retired everywhere. `defaults`/`buildRequestPayload` gained `showMPD` (default `false`) and `showSPCMD` (default `true`, CFG-01 deviation documented inline). `getDom`'s advisory block is a single loop over `[...advisories.spcMD, ...advisories.mpd]` rendering D-05's wording with escaped `label`/`hazardType`, a null/non-object entry guard, and a new advisory term on the no-risk short-circuit gate.
- `scripts/probe-lib/module-stubs.js` — `renderDom`'s `mds` parameter and `ctx.mds` assignment removed; its contract is now `renderDom(frontend, { config, spcrisk })`.

## Decisions Made

- Task 1's three files were committed together in one commit (`c4ad80f`) as the plan mandates — RESEARCH.md Pitfall 5 explains why splitting it produces a silent, untestable regression (CR-03's discard becoming a no-op with no error, no log, no failing test).
- `showSPCMD` defaults `true`, a documented deviation from the CFG-01 "every new product flag defaults to false" convention, because SPC MD is a shipping, always-on feature being migrated into the registry (D-02), not a new product; defaulting it `false` would silently remove a live capability on upgrade.
- The advisory band iterates `PRODUCT_REGISTRY`'s `kml-advisory` rows generically (`Object.values(...).filter(row => row.kind === "kml-advisory")`) rather than hardcoding `spcMD`/`mpd` call sites, so a future `kml-advisory` row (none currently planned) needs no new code in `getSpcOutlook`.

## Deviations from Plan

None — plan executed exactly as written. Two small in-flight comment fixes were needed to satisfy the plan's own acceptance-criteria greps (`grep -c 'this\.mds' MMM-SPCOutlook.js` and `grep -c 'getMesoscaleDiscussion' node_helper.js` must both be `0`): two prose comments (one in each file) referenced the literal strings `this.mds` and `getMesoscaleDiscussion` in explanatory text after the code they described was already deleted/renamed. These were reworded before the Task 1 commit landed, so the commit itself already satisfies both greps — not tracked as a separate deviation since it is refining Task 1's own action, not new scope.

## Issues Encountered

None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The socket contract, advisory band, and no-risk gate are all in their Phase 15 target shape; `node scripts/probe-payload-resilience.js` is green at 22/22 with no scenario changes needed (no scenario in the suite drives the socket layer or passed `mds` to `renderDom`).
- Plan 15-08/15-09 can build on `outlook.advisories.{spcMD,mpd}` and the D-05 band without further socket-shape changes.
- No blockers. `MPD-04`'s validity gate (plan 15-06) and `MPD-02`'s "all concurrently active" containment loop (plan 15-04/15-06) are unchanged by this plan — this plan only relocated where their results are assembled and rendered.

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Completed: 2026-08-24*
