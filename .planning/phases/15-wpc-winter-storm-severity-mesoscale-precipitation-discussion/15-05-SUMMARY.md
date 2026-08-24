---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 05
subsystem: testing
tags: [probe-harness, wssi, mutation-testing, offline-verification]

# Dependency graph
requires:
  - phase: 15-01
    provides: winterImpact registry row (WSSI layer IDs, impact field, palette, MINOR-floor includesFeat)
  - phase: 15-02
    provides: probe harness real KML/ZIP deps, makeKmzBuffer, skip accounting
  - phase: 15-03
    provides: _runArcGisDayProduct shared runner, winterImpact payload block, Days 1-3 render rows
provides:
  - Six mutation-proven wssi-* probe scenarios covering WSSI-01, WSSI-02, WSSI-03, and D-09 AMENDED's floor
  - WSSI_URLS derived from PRODUCT_REGISTRY.winterImpact.buildUrl (PERF-02 byte-stability)
  - wssiRoutes(day1Handler) HTTP-seam routing helper mirroring eroHttpRoutes
  - Live-verified WSSI fixtures (MINOR/MODERATE/MAJOR/EXTREME/mixed-case/WWA) with no LIMITED literal anywhere
affects: [15-06, 15-07, phase-16, phase-17]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "D-10 mutation-proof discipline: apply mutation, confirm named scenario RED with a diagnosable message, revert, confirm suite green — never leave mutated state uncommitted-but-present"
    - "URL-as-identifier requireLog fragments (WR-04 precedent) used for wssi-hard-fail-is-flagged since the non-throw hard-fail path only logs the failing URL, not the row id/day ordinal"

key-files:
  created: []
  modified:
    - scripts/probe-payload-resilience.js

key-decisions:
  - "wssi-hard-fail-is-flagged's requireLog names the WSSI-day-1 URL (registry-derived) rather than literal strings winterImpact/day 1 — the only diagnostic node_helper.js's non-throw hard-fail path emits is fetchGeoJsonCached's 'unrecoverable fetch failure for <url>' line, which has no access to row.id/d; this follows the same URL-as-identifier pattern the existing ero-304-with-no-cache-entry-is-a-hard-failure scenario already uses."
  - "Mutation 5 (delete the WSSI no-risk-gate term) initially produced zero RED scenarios as the plan anticipated — extended wssi-wellformed-minor with a render assertion to close that coverage gap, then re-ran the mutation to confirm RED, per D-10/T-15-19's 'no RED scenario is a coverage gap, not a pass' standard."

requirements-completed: [WSSI-01, WSSI-02, WSSI-03]

# Metrics
duration: ~35min
completed: 2026-08-24
---

# Phase 15 Plan 05: WSSI Probe Scenarios Summary

**Six mutation-proven `wssi-*` probe scenarios (well-formed MINOR, case-fold, WWA exclusion at payload+render, out-of-season zero-feature, toggle-off, hard-fail-is-flagged) extend the offline verification suite to 22 passing scenarios, using registry-derived URLs and the live-verified ALL-CAPS WSSI value domain.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-23 (worktree base f71ff32)
- **Completed:** 2026-08-24T02:05:24Z
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments
- Added `WSSI_URLS` derived from `PRODUCT_REGISTRY.winterImpact.buildUrl`, six live-verified WSSI fixtures (four ALL-CAPS impact tiers, one mixed-case, one WINTER WEATHER AREA), and a `wssiRoutes(day1Handler)` HTTP-seam helper — no scenario asserts on the literal string `LIMITED` anywhere (D-09 AMENDED).
- Added six `wssi-*` scenarios covering WSSI-01 (well-formed resolution), WSSI-02 (case fold), D-09 AMENDED (WWA exclusion at both payload and render layers), WSSI-03 (out-of-season zero-feature structural proof), Phase 14 D-05 (toggle-off full block), and CR-03/CR-01 (hard-fail flagged and diagnosable).
- Mutation-proved all six scenarios per D-10: five targeted mutations across `productRegistry.js`, `node_helper.js`, and `MMM-SPCOutlook.js`, each applied, confirmed RED with a diagnosable message, and reverted — including closing a genuine coverage gap found during mutation 5.
- Probe suite grew from 16 to 22 scenarios; `node scripts/probe-payload-resilience.js` exits 0 with `22 passed, 0 failed, 0 skipped`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add WSSI fixtures and the registry-derived WSSI_URLS map** - `a534fd5` (test)
2. **Task 2: Add the six wssi-* scenarios** - `8e9a8b4` (test)
3. **Task 3: Mutation-prove every new WSSI scenario is load-bearing** - `90840f2` (test — permanent extension to `wssi-wellformed-minor` closing mutation 5's coverage gap)

**Plan metadata:** (this commit, docs: complete plan)

## Files Created/Modified
- `scripts/probe-payload-resilience.js` - Added `WSSI_URLS`, six WSSI fixtures, `wssiRoutes`, six `wssi-*` scenarios, and a render assertion extension to `wssi-wellformed-minor`

## Decisions Made
- **WSSI hard-fail diagnostic naming:** The plan's action text asks `wssi-hard-fail-is-flagged` to "use requireLog to prove a diagnostic naming winterImpact and day 1 was emitted." Tracing `_runArcGisDayProduct` (node_helper.js:98-185) showed the runner's own `Log.error(`${row.id} day ${d}: ...`)` line only fires when `fetchGeoJsonCached` throws — it does not fire on the `{failed: true}` return shape that a real HTTP 503 with no cache entry produces (and which is required to set `anyStale` via the shared accumulation line, per mutation 3's exact target). The only diagnostic reachable through that path is `fetchGeoJsonCached`'s own `'unrecoverable fetch failure for ' + url + ' (HTTP ' + res.status + ')'` line, which names the URL rather than the product id or day ordinal. Implemented `requireLog(["unrecoverable fetch failure for", WSSI_URLS[1]], ...)`, following the same URL-as-identifier pattern the existing `ero-304-with-no-cache-entry-is-a-hard-failure` scenario already uses (WR-04 precedent). This satisfies both the `_stale === true` requirement and a real, verifiable diagnostic, without touching `node_helper.js` (owned this wave by a sibling agent).
- **wssi-wellformed-minor render extension:** Per the plan's explicit contingency instruction, mutation 5 (deleting the WSSI no-risk-gate term in `MMM-SPCOutlook.js`) was first run against the Task 2 scenarios as written and produced zero RED scenarios, confirming the anticipated coverage gap. `wssi-wellformed-minor` was then permanently extended with a render assertion (asserts the output is neither the literal `"No Severe Weather Risk"` line nor missing a `Winter Impact` row), and the mutation was re-applied and confirmed RED before being reverted.

## Deviations from Plan

None — plan executed exactly as written, including the anticipated mutation-5 contingency the plan itself specified.

## Mutation Proofs (D-10 evidence)

All five mutations were applied to the affected file only, run against the full suite, confirmed to produce the expected RED scenario(s) with a diagnosable failure message, then reverted with `git checkout --` before the next mutation. Final state: `git diff --exit-code productRegistry.js node_helper.js MMM-SPCOutlook.js scripts/probe-payload-resilience.js` shows only the intentional, committed extension to `scripts/probe-payload-resilience.js`; the three production files are byte-identical to their pre-mutation state.

**1. `productRegistry.js` — dropped `.toUpperCase()` from `winterImpact.toValue`'s fold**
- Expected: `wssi-case-fold-mismatch-still-resolves` RED, `wssi-wellformed-minor` stays green.
- Observed: `FAIL wssi-case-fold-mismatch-still-resolves: WSSI-02: mixed-case "Minor" did not fold to MINOR, got NONE` — `wssi-wellformed-minor` PASSed. Suite: 21 passed, 1 failed, 0 skipped.
- Reverted; suite returned to 22 passed, 0 failed, 0 skipped.

**2. `productRegistry.js` — relaxed `winterImpact.includesFeat` from `val >= 2` to `val > 0`**
- Expected: `wssi-winter-weather-area-renders-nothing` RED.
- Observed: `FAIL wssi-winter-weather-area-renders-nothing: D-09 AMENDED: WINTER WEATHER AREA must render nothing, got day1Risk WWA`. Suite: 21 passed, 1 failed, 0 skipped.
- Reverted; suite returned to 22 passed, 0 failed, 0 skipped.

**3. `node_helper.js` — dropped `if (fetchResult.stale || fetchResult.failed) anyStale = true;` from `_runArcGisDayProduct`**
- Expected: `wssi-hard-fail-is-flagged` RED, and `ero-hard-fail-is-flagged` RED too (proving the shared line).
- Observed: `FAIL ero-arcgis-error-body: five rejected ERO bodies produced an unflagged payload (_stale !== true)`, `FAIL ero-hard-fail-is-flagged: a hard-failed ERO fetch produced an unflagged no-risk payload (_stale !== true)`, `FAIL wssi-hard-fail-is-flagged: a hard-failed WSSI fetch produced an unflagged no-risk payload (_stale !== true)`, plus three more ERO scenarios that depend on the same accumulation line (`ero-rejected-body-serves-last-known-good`, `ero-unparseable-body-serves-last-known-good`, `ero-304-with-no-cache-entry-is-a-hard-failure`). Suite: 16 passed, 6 failed, 0 skipped.
- Reverted; suite returned to 22 passed, 0 failed, 0 skipped.

**4. `node_helper.js` — changed the `winterImpact` call site to pass `PRODUCT_REGISTRY.excessiveRain`**
- Expected: `wssi-wellformed-minor` RED.
- Observed: `FAIL wssi-wellformed-minor: day1Risk expected MINOR, got NONE`, plus collateral failures in `wssi-case-fold-mismatch-still-resolves`, `wssi-toggle-off` (key-count mismatch: 20 keys, expected 12 — ERO's 5-day shape leaked into the WSSI slot), and `wssi-hard-fail-is-flagged` (no longer flagged, since the mutated call reads ERO's own URL set instead). Suite: 18 passed, 4 failed, 0 skipped.
- Reverted; suite returned to 22 passed, 0 failed, 0 skipped.

**5. `MMM-SPCOutlook.js` — deleted the `winterImpact` term from `getDom`'s no-risk short-circuit gate**
- Expected (per plan): `wssi-winter-weather-area-renders-nothing` stays green; some scenario should go RED to prove the gate term is guarded, or the summary must record the gap-closing extension.
- First run (against Task 2 scenarios as written): 22 passed, 0 failed, 0 skipped — zero RED, confirming the anticipated coverage gap (no scenario rendered the WSSI-only payload through `getDom`).
- Extended `wssi-wellformed-minor` (permanent addition, part of the Task 3 commit) to render its payload via `loadFrontendModule`/`renderDom` and assert the output is neither `"No Severe Weather Risk"` nor missing a `Winter Impact` row.
- Re-ran the same mutation against the extended scenario: `FAIL wssi-wellformed-minor: a genuine MINOR winter impact with no convective risk short-circuited to "No Severe Weather Risk" — the WSSI term of the no-risk gate is unguarded`. Suite: 21 passed, 1 failed, 0 skipped.
- Reverted; suite returned to 22 passed, 0 failed, 0 skipped.

## Issues Encountered
- **Worktree base drift at startup:** HEAD was found on the correct per-agent branch (`worktree-agent-ae412cb9d488b1eeb`) but pointed at a stale commit (`28845fa`, Phase 14 completion) rather than the expected wave-2 base (`f71ff323`, which carries plans 15-01/15-02/15-03). Per the `worktree_branch_check` protocol, ran `git reset --hard f71ff323a9b472fb49d689fcd27ba105deaad73b` on the clean working tree (verified via `git status --short` / `git diff --stat` before resetting) and confirmed `HEAD` landed on the expected commit before proceeding. Resolved before any file edits; no impact on the plan's own work.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- The probe suite is now the complete WSSI verification standard per D-10: 22 scenarios, all mutation-proven, offline, and zero-network.
- Live in-season WSSI confirmation remains a deferred item (already recorded in STATE.md Deferred Items per the v1.1 fire-weather precedent) — no change needed there from this plan.
- `node_helper.js` and `MMM-SPCOutlook.js` are untouched (confirmed via `git diff --exit-code`) — the sibling agent's concurrent work on `node_helper.js` this wave is unaffected.

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Completed: 2026-08-24*
