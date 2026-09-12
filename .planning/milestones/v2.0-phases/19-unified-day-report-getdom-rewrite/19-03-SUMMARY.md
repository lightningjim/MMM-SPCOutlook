---
phase: 19-unified-day-report-getdom-rewrite
plan: 03
subsystem: api
tags: [node_helper, hazardTaxonomy, auto-expand, mutation-testing]

# Dependency graph
requires:
  - phase: 19-unified-day-report-getdom-rewrite
    provides: "19-02's unified days[] grid with precedence-resolved suppressedBy on every hazard entry"
provides:
  - "SIGNIFICANCE_FLOOR table in hazardTaxonomy.js (locked option-a thresholds), integrity-guarded at module load"
  - "days[n].autoExpand boolean on all 14 grid days, derived from each winning entry's own source ladder"
  - "two mutation-proven probe scenarios, plus two supplementary direct-call assertions proving structurally-unreachable-via-fixture guards are load-bearing"
affects: [19-04-getdom-compact-line, 19-verification]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Direct call to a production merge-step method (_resolveGridDayAutoExpand) on a synthetic day object, used only where the real end-to-end fetch/merge pipeline cannot construct the state a mutation needs to prove — documented inline as a deliberate departure from this probe file's usual full-pipeline convention"

key-files:
  created: []
  modified:
    - hazardTaxonomy.js
    - node_helper.js
    - scripts/probe-payload-resilience.js

key-decisions:
  - "Task 1 (checkpoint:decision) resolved by the user: option-a, per-source value floor, wpc-hazards never triggers alone. Locked thresholds: spc-convective >= 4 (ENH+), spc-fire >= 2 (CRIT+), wpc-ero >= 3 (MDT+), wpc-wssi >= 4 (MAJOR+), heatrisk >= 3 (Major+), wpc-hazards SIGNIFICANCE_NEVER. Accepted cost: cold/wind/heavy-precip, whose only source is wpc-hazards, can never independently auto-expand."
  - "SIGNIFICANCE_NEVER is checked before the typeof entry.value === \"number\" guard in _resolveGridDayAutoExpand, matching the plan's own ordering (\"skipped without ever consulting value\") — this makes the typeof guard structurally unreachable for wpc-hazards specifically under the locked table, since wpc-hazards is filtered out one check earlier regardless."
  - "Discovered and documented a structural property of the locked PRECEDENCE table: every DAY_SOURCE_IDS entry with a non-SIGNIFICANCE_NEVER predicate (spc-convective, spc-fire, heatrisk, wpc-wssi, wpc-ero) is ranked FIRST in every PRECEDENCE[dimension] array it appears in; wpc-hazards is always second (or sole, where nothing else maps to that dimension). Consequence: no real end-to-end fixture can ever produce a suppressed (suppressedBy !== null) entry from a non-NEVER source — only a wpc-hazards entry can ever be suppressed, and it is already excluded by the SIGNIFICANCE_NEVER check regardless of suppression state. This makes plan Task 3's mutations (1) and (3) unprovable via the full getSpcOutlook() pipeline as literally specified."
  - "Resolved the above gap (GSD-internal mechanics, executor discretion) by adding two supplementary direct-call assertions inside the second probe scenario: a synthetic day object passed straight to helper._resolveGridDayAutoExpand(day), bypassing the network-fetch pipeline only for the two structurally-unreachable branches (suppression skip; non-numeric-value guard via a Symbol, which genuinely throws under `>=` where null does not). Both are mutation-proven exactly like the rest of the suite; the deviation and its reasoning are recorded as inline code comments plus this entry."

requirements-completed: [RPT-02, RPT-03]

# Metrics
duration: ~50min
completed: 2026-09-07
---

# Phase 19 Plan 03: Give D-04's per-day auto-expand a real, declared trigger Summary

**`SIGNIFICANCE_FLOOR` (locked option-a thresholds) declared and integrity-guarded in `hazardTaxonomy.js`; `days[n].autoExpand` now a boolean on all 14 grid days in `node_helper.js`, derived in the existing precedence loop with no cross-dimension comparison, backed by two mutation-proven probe scenarios (probe suite 126 -> 128 passed).**

## Performance

- **Duration:** ~50 min
- **Started:** ~2026-09-07T02:14Z (after worktree branch reset to `b30bae4`)
- **Completed:** 2026-09-07T03:04:29Z (last task commit)
- **Tasks:** 3 (Task 1 decided by user before this continuation; Tasks 2-3 executed)
- **Files modified:** 3

## Accomplishments
- Task 1 (checkpoint:decision) resolved by the user as **option-a**: per-source value floor, `wpc-hazards` never triggers alone. All six `DAY_SOURCE_IDS` entries stated per the locked table (see Decisions).
- `SIGNIFICANCE_FLOOR` and the `SIGNIFICANCE_NEVER` sentinel declared in `hazardTaxonomy.js` beside `NO_RISK_FLOOR`, exported, and guarded by two new `assertTaxonomyIntegrity` checks (key-coverage against `DAY_SOURCE_IDS`, shape validation, and an `ADVISORY_SOURCE_IDS` exclusion guard) — both failure modes demonstrated live and restored before committing.
- `_resolveGridDayAutoExpand(day)` added to `node_helper.js`, called from the existing `for (let d = 1; d <= GRID_DAY_COUNT; d++)` precedence loop (no second grid pass). It reads only each winning (`suppressedBy === null`), dimensioned (`dimension !== null`) entry's own `SIGNIFICANCE_FLOOR[entry.source]` predicate against `entry.value`, guarded against non-numeric values and `SIGNIFICANCE_NEVER` sources.
- Two new probe scenarios added and individually mutation-proven; suite now at **128 passed, 0 failed, 0 skipped**.
- `grep -c "SIGNIFICANCE_FLOOR" MMM-SPCOutlook.js` returns `0` — the frontend carries zero copies of the threshold table, matching the plan's placement decision.

## Task Commits

Each task was committed atomically:

1. **Task 1: Lock the auto-expand significance thresholds** — decided by the user via the checkpoint resolution provided to this continuation; no code, recorded in this SUMMARY and in `hazardTaxonomy.js`'s block comment.
2. **Task 2: Declare SIGNIFICANCE_FLOOR and extend assertTaxonomyIntegrity** - `cdf5e28` (feat)
3. **Task 3: Emit days[n].autoExpand and mutation-prove it** - `8aaf6e9` (test)

**Plan metadata:** (this commit, made by the orchestrator after merge — worktree mode does not update STATE.md/ROADMAP.md per this plan's instructions)

## Files Created/Modified
- `hazardTaxonomy.js` - Added `SIGNIFICANCE_NEVER` sentinel beside `FLOOR_PREBAKED`; added `SIGNIFICANCE_FLOOR` table (one entry per `DAY_SOURCE_IDS` id) with a block comment recording the locked option-a thresholds, the tier each numeric cutoff names, and the `wpc-hazards`/cold-wind-heavy-precip trade-off; extended `assertTaxonomyIntegrity` with key-coverage, shape, and advisory-exclusion guards for `SIGNIFICANCE_FLOOR`; exported both new symbols.
- `node_helper.js` - Added `SIGNIFICANCE_FLOOR`/`SIGNIFICANCE_NEVER` to the `hazardTaxonomy` destructure; added `_resolveGridDayAutoExpand(day)` immediately after `_resolveGridDayPrecedence`, called from the existing per-day precedence loop; sets `day.autoExpand` to a boolean on every grid day.
- `scripts/probe-payload-resilience.js` - Added `rpt02-autoexpand-true-when-a-winning-entry-clears-its-own-significance-floor` (ENH-tier spc-convective entry triggers; SLGT-tier control does not; asserts boolean on all 14 keys) and `rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries` (a below-floor spc-fire ELEV entry wins "fire" over a suppressed, scary-labelled "Critical Wildfire Risk" wpc-hazards entry; a surviving "High Winds" wpc-hazards entry on "wind" never triggers alone; plus two supplementary direct-call assertions — see Decisions — proving the suppression-skip and non-numeric-value guards are load-bearing where no real fixture can reach them).

## Decisions Made
See frontmatter `key-decisions` for full detail. Summary:
- Task 1 locked as **option-a** (user decision, provided via checkpoint resolution).
- Discovered a structural property of the locked `PRECEDENCE` table making two of Task 3's specified mutations unprovable via the full `getSpcOutlook()` pipeline, and resolved it with documented, mutation-proven direct-call assertions on the same production method rather than silently declaring the mutations "not applicable."

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Task 3's mutation (1) ("suppressedBy check accepts all entries — expect scenario 2 RED") produced zero effect via the fixture as specified**
- **Found during:** Task 3, while mutation-proving `rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries`.
- **Issue:** Under the locked `SIGNIFICANCE_FLOOR`/`PRECEDENCE` tables, every non-`SIGNIFICANCE_NEVER` `DAY_SOURCE_IDS` entry (`spc-convective`, `spc-fire`, `heatrisk`, `wpc-wssi`, `wpc-ero`) is ranked first in every `PRECEDENCE[dimension]` array it appears in. Only `wpc-hazards` can ever end up `suppressedBy !== null`, and `wpc-hazards` is unconditionally `SIGNIFICANCE_NEVER` — so it is filtered out one check earlier regardless of suppression state. A fixture built entirely from real merge output therefore cannot make the suppression-skip line observably matter: removing it changed nothing (128 passed, 0 failed) on first attempt.
- **Fix:** Added a supplementary direct-call assertion inside the same scenario: a synthetic `day` object with a suppressed, HIGH-tier `spc-convective` entry, passed straight to `helper._resolveGridDayAutoExpand(day)`. This exercises the exact same production line via the exact same production method, just without requiring the full network-fetch pipeline to reach an otherwise-unreachable state. Re-ran mutation (1) against this: `FAIL rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries: ... expected a suppressed HIGH-tier spc-convective entry to never trigger autoExpand, got true`.
- **Files modified:** `scripts/probe-payload-resilience.js`.
- **Verification:** Mutation applied, observed RED, reverted, suite back to 128 passed, 0 failed, 0 skipped.
- **Committed in:** `8aaf6e9` (Task 3 commit).

**2. [Rule 3 - Blocking] Task 3's mutation (3) ("remove the typeof guard, feed a wpc-hazards null value through a predicate") also produced zero effect via the fixture as specified**
- **Found during:** Task 3, mutation-proving the same scenario.
- **Issue:** `wpc-hazards`'s real value is always `null`. `null >= N` evaluates to `false` in JavaScript rather than throwing, and `wpc-hazards` is already excluded by the earlier `SIGNIFICANCE_NEVER` check regardless of whether the `typeof` guard is present — so removing only the `typeof` guard has no observable effect on a real `wpc-hazards` entry (0 failures on first attempt).
- **Fix:** Added a second supplementary direct-call assertion: a synthetic day with a non-`SIGNIFICANCE_NEVER` (`spc-convective`) entry whose `value` is a `Symbol` — a non-numeric type that genuinely throws under `>=` (`Cannot convert a Symbol value to a number`), standing in for "the class of non-numeric value the guard exists to keep out of a predicate call" (T-19-07's actual threat category). With the guard present this never throws; with it removed, `_resolveGridDayAutoExpand` throws and the whole scenario fails loudly. Re-ran mutation (3): `FAIL rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries: Cannot convert a Symbol value to a number`.
- **Files modified:** `scripts/probe-payload-resilience.js`.
- **Verification:** Mutation applied, observed RED, reverted, suite back to 128 passed, 0 failed, 0 skipped.
- **Committed in:** `8aaf6e9` (Task 3 commit).

---

**Total deviations:** 2 auto-fixed (both Rule 3 — blocking test-design gaps in the plan's specified mutations, discovered while mutation-proving per 15 D-10).
**Impact on plan:** Both auto-fixes strengthen the mutation-proof without changing any product behavior; `node_helper.js`'s Task 3 code is exactly as the plan specified. No scope creep — the fixes are additive assertions inside the probe file only.

## Mutation Proofs (Task 3, D-10 requirement)

All mutations were applied directly to `node_helper.js` via `sed`, confirmed RED with a diagnosable failure message, then restored from a pre-mutation backup copy and the suite re-run to confirm return to green before the next mutation.

**Mutation 1 — changed `if (entry.suppressedBy !== null) continue;` to `if (false) continue;` (accept all entries regardless of suppression).**
- Observed RED: `FAIL rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries: RPT-02: expected a suppressed HIGH-tier spc-convective entry to never trigger autoExpand, got true`
- Blast radius: 1/128 scenarios failed (the direct-call synthetic assertion inside that scenario; see Deviations above for why the fixture-driven half of that same scenario did not need to move to observe this).
- Restore confirmed: `128 passed, 0 failed, 0 skipped`.

**Mutation 2 — changed `if (significance(entry.value)) {` to `if (!!entry.value) {` (bare truthiness test instead of the predicate call).**
- Observed RED (two failures):
  - `FAIL rpt02-autoexpand-true-when-a-winning-entry-clears-its-own-significance-floor: control: expected days["1"].autoExpand === false for a SLGT-tier (below the >=4 ENH floor) entry, got true`
  - `FAIL rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries: RPT-02: expected days["1"].autoExpand === false (suppressed entry ignored, surviving wpc-hazards entry never triggers alone), got true`
- Blast radius: 2/128 scenarios failed — wider than "its own scenario's control alone" (the plan named scenario 1's control as the expected target), but the second failure is legitimately explained: scenario 2's surviving below-floor `spc-fire` ELEV entry has `value: 1`, which is truthy, so the mutated bare-truthiness check now (wrongly) treats it as significant. Both messages are individually diagnosable and directly attributable to the mutated line. Accepted per the same "more than its own target may fail, as long as each failure is diagnosable" allowance the 19-02 SUMMARY documents for its own mutation 2.
- Restore confirmed: `128 passed, 0 failed, 0 skipped`.

**Mutation 3 — changed `if (typeof entry.value !== "number") continue;` to a no-op comment (removed the guard).**
- Observed RED: `FAIL rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries: Cannot convert a Symbol value to a number`
- Blast radius: 1/128 scenarios failed (the direct-call synthetic assertion added specifically for this guard; see Deviations above).
- Restore confirmed: `128 passed, 0 failed, 0 skipped`.

## Issues Encountered
None beyond the two documented deviations above (both resolved within the probe file, no product-code impact).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `days[n].autoExpand` is present as a boolean on all 14 grid days and can be read directly by the frontend's `getDom()` rewrite (19-04+) to decide detail-mode rendering per D-04, with no taxonomy table to restate in browser context.
- The structural finding recorded above (only `wpc-hazards` entries can ever be `suppressedBy !== null` under the current `PRECEDENCE` table, and `wpc-hazards` is always `SIGNIFICANCE_NEVER`) is worth keeping in mind if a future phase adds a second non-NEVER source to any dimension `wpc-hazards` already shares — at that point the suppression-skip guard would become reachable via a real fixture, and the existing probe scenario's precondition guards would need revisiting.
- No blockers identified for downstream plans.

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-07*

## Self-Check: PASSED

- FOUND: `hazardTaxonomy.js`
- FOUND: `node_helper.js`
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/19-unified-day-report-getdom-rewrite/19-03-SUMMARY.md`
- FOUND commit `cdf5e28` (Task 2)
- FOUND commit `8aaf6e9` (Task 3)
