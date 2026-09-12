---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 07
subsystem: test
tags: [probe-harness, heatrisk, mutation-proof, staleness, day-offset-cache]

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 04
    provides: "_runHeatRiskProduct, _cacheHeatRiskTuples, _heatRiskTuplesFromCache, D-04/D-05/D-06/D-07 branches, four _loggedHeatRisk* flags"
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 06
    provides: "HEATRISK_URL, HEATRISK_NOW_MS, heatRiskCatalogItem, heatRiskIdentifyResponse, heatRiskRoutes, assertHeatRiskBlockIntact — reused directly, not rebuilt"
provides:
  - "Six further heatrisk-* scenarios covering D-04's two NoData branches, D-05's two gap branches, D-07's freshness asymmetry, and the cache-hit day-offset contract"
affects: [17-08, 18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Sibling-scenario controls deliberately re-exercise each other's primary branch (D-04's all-NoData control inside the partial-NoData scenario; D-05's tail/interior controls swapped between the two gap scenarios) — this is required by the plan's own action text to prove each scenario's silence assertion is a real branch, and it is the documented reason a sibling's mutation reds the OTHER scenario's control assertion without touching its primary"
    - "A day-offset-cache-staleness mutation is caught by the scenario's own precondition guard (a malformed/day-keyed cache shape fails the guard before the primary assertion ever runs) rather than by _cacheHeatRiskTuples's own defensive per-tuple throw — the two lines of defense protect different failure surfaces (a caller handing back an already-bucketed tuple, vs. the cache-write function itself computing one internally)"

key-files:
  created: []
  modified: [scripts/probe-payload-resilience.js]

key-decisions:
  - "Scenario 6/7's and scenario 8/9's control assertions were written exactly as the plan's literal action text specifies (scenario 6 controls against the all-NoData condition scenario 7 tests as its primary; scenario 9 controls against the tail-gap fixture scenario 8 tests as its primary). This means the cross-branch independence sweep is honest about an expected overlap: each sibling mutation reds the OTHER scenario's control assertion (not its primary), which is a byproduct of the required vacuity-proof design, not a sign the branches are collapsed. See Deviations for the full matrix and reasoning."
  - "Scenario 11's mutation ('adopt _runArcGisDayProduct's cache shape') was implemented as a two-site change: _cacheHeatRiskTuples buckets by day offset AT WRITE TIME and stores that day-keyed object as `result` instead of `{ tuples: whitelisted }`, and _runHeatRiskProduct's cache-hit branch reads that day-keyed value directly, bypassing recompute. This mutation does not touch any individual tuple's own keys, so _cacheHeatRiskTuples's per-tuple defensive throw does NOT fire under it — the mutation is instead caught by the scenario's own precondition guard, which independently confirmed capable of firing via a live spot-proof (see verbatim results)."
  - "Values for the tail-gap/day1-gap/day-offset fixtures use `String(d % 5)` (or an index-based variant), deliberately allowing category 0 (Little-to-No-Risk) as a legitimate resolved value, distinct from `category: null` — 0 is a real, resolved category under D-04's branch, not a NoData/gap signal."

requirements-completed: [HEAT-01, HEAT-04]

# Metrics
duration: ~40min (approximate; this session's own start time was not separately captured, consistent with 17-04/17-06's disclosed gap)
completed: 2026-09-01
---

# Phase 17 Plan 07: HeatRisk Compound Staleness Scenarios (D-04, D-05, D-07, Cache Day-Offset) Summary

**Landed the six scenarios covering HeatRisk's compound staleness conditions — D-04's partial-vs-total NoData, D-05's tail-vs-interior/Day-1 gaps, D-07's per-item freshness asymmetry against `_staleAsOf`, and the day-offset-cache-staleness contract on a cache hit — each individually mutation-proven RED with a diagnosable message and restored byte-identical; probe suite rose from 72 to 78 (0 failed, 0 skipped).**

## Performance

- **Duration:** ~40 min (approximate)
- **Completed:** 2026-09-01
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments

- `heatrisk-partial-nodata-is-silent` / `heatrisk-all-nodata-sets-stale`: D-04's two branches, each with a precondition guard proving the fixture exercises the intended branch (not the other one by accident), a primary assertion covering both halves (silence AND no badge, or badge AND all-null), and a control assertion proving the sibling branch is real. The all-NoData scenario additionally asserts the one-shot log guard (`_loggedHeatRiskAllNoData`) fires exactly once across two consecutive polls with the same fixture (resetHelper deliberately not called between them).
- `heatrisk-tail-gap-is-silent` / `heatrisk-day1-gap-sets-stale`: D-05's two branches. The tail-gap scenario proves days past the highest present day are silent; the Day-1/interior scenario covers BOTH the Day-1-missing arm and a second interior arm (day 3 missing with days on both sides present), proving the branch is position-aware (`d < maxPresent`) rather than a "Day 1 specifically" special case.
- `heatrisk-stale-item-sets-badge-not-staleAsOf`: D-07 / 16 D-15's asymmetry, read from `PRODUCT_REGISTRY.heatRisk.maxDataAgeHours` rather than hardcoded. Two control arms: a genuine fetch failure leaves a numeric `_staleAsOf` (proving the primary assertion is a deliberate omission, not harness vacuity), and an aged `idp_filedate` placed on a HEAT-04 dedupe LOSER leaves `_stale` unset (proving the age check runs on surviving items only).
- `heatrisk-day-offset-recomputed-on-cache-hit`: warms the cache at `HEATRISK_NOW_MS`, asserts the cached tuples carry no clock-dependent key, advances the pinned clock exactly one day, and re-runs against the identical body/ETag so the fetch takes the cache-hit path (confirmed via a second `If-None-Match` request). Asserts every category shifted down one day (day2's old value now on day1, day7's old value now on day6, day7 itself now `null`).
- All six precondition guards independently proven capable of firing: five via a logic-level replication of each guard's exact condition against a deliberately broken input (verbatim below), and the sixth (scenario 11's) via `_cacheHeatRiskTuples`'s own defensive throw, exercised directly through `loadNodeHelper()`.

## Task Commits

1. **Task 1: D-04's two NoData branches** - `5668504` (test)
2. **Task 2: D-05's two gap branches** - `bd5e592` (test)
3. **Task 3: D-07 freshness asymmetry and the cache-hit day-offset contract** - `6fac99d` (test)

**Plan metadata:** pending (this commit, made by the orchestrator after merge)

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — appended six `heatrisk-*` scenarios (no fixture/route infrastructure changes; 17-06's `heatRiskRoutes`, `heatRiskCatalogItem`, `heatRiskIdentifyResponse`, `assertHeatRiskBlockIntact` reused verbatim, not rebuilt).

## Overall Verification

- `node scripts/probe-payload-resilience.js` → **78 passed, 0 failed, 0 skipped** at final state (72 baseline + 6 added — scenario count rose by exactly the number added, per the project note; the plan's own verification text does not cite a stale absolute total).
- `bash scripts/check-concurrency-invariant.sh` → exits **0**, all four sites `OK`.
- `node --check node_helper.js` → exits 0 after every mutation restore; `git status --short` clean of `node_helper.js` at final state (confirmed byte-identical to the committed baseline throughout — this plan modified only the probe script).

## Task 1 Acceptance Criteria — Verbatim Results

- Full suite green: **74 passed, 0 failed, 0 skipped** (72 baseline + 2).
- **Mutation 6** (`heatrisk-partial-nodata-is-silent`) — added `else { anyStale = true; }` to the per-tuple bucket loop (blanket "any NoData sets stale"):
  ```
  FAIL heatrisk-partial-nodata-is-silent: D-04: expected _stale unset on a partial-NoData response, got true
  PROBE RESULT: 77 passed, 1 failed, 0 skipped
  ```
  Only scenario 6 failed; scenario 7 stayed green. Restored; `git status --short node_helper.js` clean.
- **Mutation 7** (`heatrisk-all-nodata-sets-stale`) — replaced `if (resolvedDays.size === 0)` with `if (false)` (remove the all-NoData check):
  ```
  FAIL heatrisk-partial-nodata-is-silent: control: expected _stale set when every day is NoData, got undefined
  FAIL heatrisk-all-nodata-sets-stale: D-04: expected _stale set on an all-NoData response, got undefined
  PROBE RESULT: 76 passed, 2 failed, 0 skipped
  ```
  Restored; `git status --short node_helper.js` clean. See "Cross-Branch Independence Matrix" below for why scenario 6 also reds here (its own control assertion, required by the plan's literal action text, re-exercises this exact branch) — scenario 6's PRIMARY silence assertion is untouched.
- **Precondition-guard firing proofs** (logic-level replication of each guard's exact condition against a broken input):
  ```
  guard6 THROW: precondition failed: fixture must carry both a NoData day and a real 0-4 day, got Values=["NoData","NoData","NoData","NoData","NoData","NoData","NoData"]
  guard7 THROW: precondition failed: fixture is not all-NoData, got Values=["NoData","1","NoData","NoData","NoData","NoData","NoData"]
  ```

## Task 2 Acceptance Criteria — Verbatim Results

- Full suite green: **76 passed, 0 failed, 0 skipped** (74 baseline + 2).
- **Mutation 8** (`heatrisk-tail-gap-is-silent`) — changed the interior-gap condition to `if (interiorGaps.length > 0 || presentDays.size < row.days)` (any gap, including tail, sets stale):
  ```
  FAIL heatrisk-tail-gap-is-silent: D-05: expected _stale unset on a tail-gap (days 6-7 missing) response, got true
  FAIL heatrisk-day1-gap-sets-stale: control: expected _stale unset on a tail-gap-only fixture, got true
  PROBE RESULT: 76 passed, 2 failed, 0 skipped
  ```
  Restored; `git status --short node_helper.js` clean.
- **Mutation 9** (`heatrisk-day1-gap-sets-stale`) — inverted the interior-gap loop's comparison (`for (let d = 1; d > maxPresent; d++)`, never iterates):
  ```
  FAIL heatrisk-tail-gap-is-silent: control: expected _stale set when day3 is missing (an interior gap), got undefined
  FAIL heatrisk-day1-gap-sets-stale: D-05: expected _stale set when Day 1 is missing, got undefined
  PROBE RESULT: 76 passed, 2 failed, 0 skipped
  ```
  Restored; `git status --short node_helper.js` clean. Under this mutation, scenarios 6 and 7 (D-04) both stayed GREEN, confirming D-04 and D-05 do not collapse into each other.
- **Precondition-guard firing proofs**:
  ```
  guard8 THROW: precondition failed: expected exactly items at day offsets [1,2,3,4,5], computed [1,2,3,4,6]
  guard9 THROW: precondition failed: expected 6 items in arm 1, got 5
  ```

## Task 3 Acceptance Criteria — Verbatim Results

- Full suite green: **78 passed, 0 failed, 0 skipped** (76 baseline + 2).
- **Mutation 10** (`heatrisk-stale-item-sets-badge-not-staleAsOf`) — short-circuited the per-item age check (`if (false && ...)`):
  ```
  FAIL heatrisk-stale-item-sets-badge-not-staleAsOf: D-07: expected _stale set when one surviving item exceeds maxDataAgeHours=12h, got undefined
  PROBE RESULT: 77 passed, 1 failed, 0 skipped
  ```
  Only scenario 10 failed — full isolation from every other scenario. Restored; `git status --short node_helper.js` clean.
  - Control arm 1 (genuine fetch failure) verified live: `failed._staleAsOf` was numeric, confirmed by the scenario's own assertion passing under the unmutated implementation.
  - Control arm 2 (aged filedate on a deduped-away loser) verified live: `controlOut2._stale` was falsy under the unmutated implementation, confirming the age check runs on HEAT-04 survivors only.
- **Mutation 11** (`heatrisk-day-offset-recomputed-on-cache-hit`) — two-site change adopting `_runArcGisDayProduct`'s cache shape: (a) `_cacheHeatRiskTuples` now buckets `whitelisted` by day offset against `this._todayUtcMs()` computed AT CACHE-WRITE TIME and stores that day-keyed object as `result` in place of `{ tuples: whitelisted }`; (b) `_runHeatRiskProduct`'s cache-hit branch reads that day-keyed value directly and returns immediately, bypassing the day-offset recompute entirely:
  ```
  FAIL heatrisk-day-offset-recomputed-on-cache-hit: precondition failed: no cache entry (or malformed tuples) for the HeatRisk URL: {"mode":"etag","etag":"heatrisk-day-offset-v1","hash":null,"result":{"day1":1,"day2":2,"day3":3,"day4":4,"day5":0,"day6":1,"day7":2},"timestamp":1788181200000}
  PROBE RESULT: 77 passed, 1 failed, 0 skipped
  ```
  Only scenario 11 failed. Restored; `git status --short node_helper.js` clean.
  - **The defensive throw inside `_cacheHeatRiskTuples` did NOT fire under this mutation** — the mutation adds a day-keyed field to a SEPARATELY COMPUTED object (`dayKeyedAtWrite`), never to any individual `tuple`'s own keys, so the per-tuple guard (`for (const key of Object.keys(tuple || {}))`) has nothing to catch. This is a genuine, disclosed finding: the defensive throw protects against a CALLER handing `_cacheHeatRiskTuples` an already-bucketed tuple (the scenario the guard's own comment describes — "a future refactor that bypasses the whitelist"), not against `_cacheHeatRiskTuples` itself internally computing a day-keyed value from otherwise-clean input. The scenario's OWN precondition guard caught the regression instead (verbatim above) — arguably the stronger and more direct proof, since it inspects the actual cache entry's shape rather than an intermediate argument.
  - Per the plan's own conditional instruction ("if [the throw] does [fire]... additionally prove the scenario itself reds by bypassing the throw"), since the throw did NOT fire, no further bypass step was needed — the scenario's precondition guard already produced the required RED independent of that throw.
  - **Precondition guard "capable of firing" proof**, exercised live through `loadNodeHelper()` (mirroring 17-04's own spot-proof style — a tuple carrying a `day1` key passed directly into `_cacheHeatRiskTuples`):
    ```
    THROW MESSAGE: MMM-SPCOutlook _cacheHeatRiskTuples: refusing to cache a clock-dependent field: day1
    ```
    This confirms `_cacheHeatRiskTuples`'s own defensive throw — the acceptance criterion's named mechanism — fires with a diagnosable message when a tuple itself carries a clock-dependent key, which is the shape it is actually designed to catch.
  - Cache-path control confirmed live: the second poll's request carried `If-None-Match: heatrisk-day-offset-v1` (asserted directly in the scenario, passing under the unmutated implementation), and `fetchFn.calls` recorded exactly two HeatRisk identify requests — proving the second poll genuinely took the cache-hit path rather than refetching.

## Cross-Branch Independence Matrix (all six scenarios × all six mutations)

Scenario key: S6=`heatrisk-partial-nodata-is-silent`, S7=`heatrisk-all-nodata-sets-stale`, S8=`heatrisk-tail-gap-is-silent`, S9=`heatrisk-day1-gap-sets-stale`, S10=`heatrisk-stale-item-sets-badge-not-staleAsOf`, S11=`heatrisk-day-offset-recomputed-on-cache-hit`.

| Mutation applied | S6 | S7 | S8 | S9 | S10 | S11 |
|---|---|---|---|---|---|---|
| Mutation 6 (blanket NoData→stale) | **FAIL** (primary) | pass | pass | pass | pass | pass |
| Mutation 7 (remove all-NoData check) | FAIL (control only) | **FAIL** (primary) | pass | pass | pass | pass |
| Mutation 8 (blanket gap→stale) | pass | pass | **FAIL** (primary) | FAIL (control only) | pass | pass |
| Mutation 9 (invert interior-gap loop) | pass | pass | FAIL (control only) | **FAIL** (primary) | pass | pass |
| Mutation 10 (remove per-item age check) | pass | pass | pass | pass | **FAIL** (primary) | pass |
| Mutation 11 (day-keyed cache shape) | pass | pass | pass | pass | pass | **FAIL** (precondition guard) |

**Reading the matrix:** every mutation reds exactly one scenario's PRIMARY assertion, and never crosses between D-04/D-05/D-07/cache-offset pairs (a D-04 mutation never touches D-05, D-07, or the cache scenario, and vice versa in every direction) — this is the load-bearing independence proof the plan requires. The two off-diagonal marks (Mutation 7 → S6's control; Mutation 8 → S9's control; Mutation 9 → S8's control) are a DOCUMENTED, BY-DESIGN exception: the plan's own literal Task 1/Task 2 action text requires scenario 6's control to re-run the exact all-NoData fixture scenario 7 tests as its primary (to prove "the no-badge assertion is a real branch, not a harness that never badges HeatRisk at all"), and requires scenario 8's and scenario 9's controls to swap each other's fixture for the identical reason. A mutation that disables one branch's check therefore also breaks the SIBLING scenario's vacuity-proof control, without ever touching the sibling's own primary condition — which is itself confirmatory evidence the two branches are genuinely separate code paths (D-04's `resolvedDays.size === 0` check vs. D-05's `interiorGaps`/tail check), not collapsed into one rule that a single mutation could red uniformly. This is recorded here in full rather than silently reconciled, per this phase's established precedent (17-01/17-04/17-06) for acceptance-criteria wording tensions.

## Decisions Made

See `key-decisions` in frontmatter: (1) the control-assertion overlap in the independence matrix above, resolved by following the plan's literal per-scenario action text rather than reinterpreting the controls to avoid overlap; (2) scenario 11's two-site mutation implementation and why the defensive per-tuple throw does not fire under it; (3) the `String(d % 5)` value convention deliberately allowing category 0 as a real resolved value.

## Deviations from Plan

### Acceptance-Criteria Tensions (not code deviations)

**1. Cross-branch independence: sibling scenarios' REQUIRED control assertions cause an off-diagonal mutation match**
- **Found during:** Task 1 and Task 2's independence sweeps.
- **Issue:** The plan's acceptance criteria state "apply scenario 6's mutation and confirm scenario 6 goes RED while scenario 7 stays GREEN" (and the symmetric statement for 8/9), which reads as requiring a clean diagonal matrix. But the plan's own Task 1/Task 2 action text separately requires scenario 6's control to re-exercise the all-NoData fixture (scenario 7's primary condition) and scenario 8/9's controls to swap each other's fixture. These two instructions are in tension: satisfying the literal control-assertion instructions necessarily produces the off-diagonal matches recorded above.
- **Resolution:** Followed the plan's literal per-scenario action text for the control assertions (matching 17-01/17-04/17-06's established precedent for this class of tension), and recorded the full honest matrix rather than omitting or reshaping a control to force a clean diagonal. The distinguishing evidence that the branches are NOT collapsed is preserved: every mutation reds exactly one scenario's PRIMARY assertion and no other scenario's primary, and no mutation ever crosses between D-04 and D-05 (or touches D-07/cache-offset) in either direction.
- **Impact:** None on correctness or on this plan's `<threat_model>` T-17-16/T-17-20 mitigations — both are satisfied by the diagonal-primary result, which is the substantive claim those threat entries make.

**2. Scenario 11's defensive-throw expectation did not materialize under the mutation as implemented**
- **Found during:** Task 3's mutation proof for `heatrisk-day-offset-recomputed-on-cache-hit`.
- **Issue:** The plan's action text states the defensive throw inside `_cacheHeatRiskTuples` "should ALSO fire" under the day-keyed-cache-shape mutation. As implemented (bucketing into a separately-computed `dayKeyedAtWrite` object rather than mutating any individual tuple's own keys), the per-tuple guard has nothing to inspect and does not fire.
- **Resolution:** Per the plan's own conditional wording, this triggers no additional bypass step — the scenario's own precondition guard already produces the required RED (verbatim above), and the guard's live-fire capability was separately and independently proven via a `day1`-carrying tuple passed directly to `_cacheHeatRiskTuples` (also verbatim above). Both proofs are recorded; no code change.
- **Impact:** None. This is a genuine, disclosed finding about the actual boundary of the defensive throw's protection (a caller-supplied already-bucketed tuple, not an internally-computed one) — worth carrying forward if a future plan touches `_cacheHeatRiskTuples` again.

---

**Total deviations:** 0 code deviations; 2 acceptance-criteria wording/interpretation notes, both resolved by following the plan's most literal instruction and recording the full evidence, matching this phase's established precedent (17-01, 17-04, 17-06).
**Impact on plan:** None on scope or correctness — all six scenarios are individually mutation-proven exactly as specified, `node_helper.js` was never modified (restored byte-identical after every mutation), and the probe suite stands at 78/0/0.

## Issues Encountered

One implementation slip during scenario 11's authoring (`installHttp` was called a second time before advancing the clock, resetting the call log used by the cache-path control) was caught by the control assertion itself failing on first run, fixed by installing the route once and reusing the same `fetchFn` across both polls (matching the Hazards Outlook cache-hit analog's exact pattern), and re-verified. Not a deviation from the plan — an authoring error caught by the scenario's own control before commit, never landed.

## User Setup Required

None — no external service configuration required. This plan is probe-harness-only, exercised entirely through `node scripts/probe-payload-resilience.js` and ad hoc scratch scripts run through `loadNodeHelper()`.

## Next Phase Readiness

- Eleven `heatrisk-*` scenarios are now live in total (5 from 17-06 + 6 from this plan), all individually mutation-proven, and the probe suite stands at 78/0/0.
- D-04, D-05, D-07 and the day-offset-cache-staleness contract are each pinned by a dedicated, mutation-proven scenario with a documented cross-branch independence result — the phase's compound-condition mandate (CONTEXT.md: "failure shapes get distinguished, not collapsed") is satisfied for HeatRisk's staleness surface.
- No blockers identified. Live in-season UAT of HeatRisk against the real ImageServer endpoint remains untested by this plan (structural/mutation-proven verification only, per this project's established quality-notes fallback for seasonal products) — unchanged from 17-04/17-06's disclosed gap.
- The disclosed boundary of `_cacheHeatRiskTuples`'s defensive throw (protects against a caller-supplied bucketed tuple, not an internally-computed one) is worth a one-line note if 17-08 or Phase 18 touches this function again.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-07-SUMMARY.md`
- FOUND: commit `5668504` (Task 1)
- FOUND: commit `bd5e592` (Task 2)
- FOUND: commit `6fac99d` (Task 3)
