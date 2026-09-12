---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 08
subsystem: test
tags: [probe-harness, heatrisk, perf-01, promise-allsettled, mutation-proof, deferred-fetch]

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 03
    provides: "heatRiskDaysToRender(block, showMinorHeat) — the D-03 gate/render predicate scenarios 12-13 prove"
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 05
    provides: "the six-member Promise.allSettled batch scenario 15's PERF-01 mutation proof drives"
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 06
    provides: "HEATRISK_URL, HEATRISK_NOW_MS, heatRiskCatalogItem, heatRiskIdentifyResponse, heatRiskRoutes, assertHeatRiskBlockIntact — reused directly by scenario 15's fixtures"
provides:
  - "Two frontend heatrisk-* scenarios pinning D-03's gate/render disagreement class (Phase 15's MPD-invisible defect shape)"
  - "A unit-style scenario proving assertNoSharedRegistryMaps (DATA-03/D-11) against a scenario-local fixture, never the real PRODUCT_REGISTRY"
  - "installDeferredHttp — a deferred-resolution fetch stub with a manually-triggered release/reject control surface and a non-hanging safety timer"
  - "new-product-batch-fetches-issue-before-siblings-resolve — the phase's sole structural proof of PERF-01 concurrency"
affects: [17-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "installDeferredHttp: holds a matched route's promise pending until the scenario calls entry.release()/reject(), recording { url, headers, at } synchronously at call time so issue order is observable independent of resolve order — the only way to prove concurrent issuance without depending on wall-clock timing"
    - "driveToCompletion: repeatedly calls releaseAll() across setImmediate ticks until a driven promise settles, because a single releaseAll() only releases what is pending at that instant while each runner's own per-day/per-layer/per-candidate loop issues further requests as each prior one resolves"
    - "A deferred stub's safety timer must NOT be unref()'d — an unref'd timer lets Node treat 'no other refed work' as 'process done' and exit silently with no diagnostic, exactly the hang-with-no-diagnostic failure the timer exists to prevent"

key-files:
  created: []
  modified: [scripts/probe-payload-resilience.js]

key-decisions:
  - "Placed installDeferredHttp in scripts/probe-payload-resilience.js itself (immediately after installHttp), not in scripts/probe-lib/module-stubs.js. It is a per-scenario network stub built on the exact same httpResponse/route-matching conventions installHttp already establishes in this file; module-stubs.js owns node_helper-loading and global-seam concerns (turf, kml-deps resolution, the frontend vm loader), none of which installDeferredHttp touches. scripts/probe-lib/module-stubs.js is therefore untouched by this plan — turfStub.toMercator (17-04) is unregressed trivially."
  - "Scenario 13's mutation route: the plan's primary mutation ('make the gate term read the raw category while the render loop keeps the floor') is structurally IMPOSSIBLE to express — both the gate term and the render loop call the identical heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat) expression, so there is no second expression to diverge. This is itself the positive structural-enforcement finding D-03 asked for. Applied the plan's own stated fallback instead: mutated the floor constant from 2 to 1 inside heatRiskDaysToRender, which reds Arm A specifically (the Minor row now clears the lowered floor and renders) while leaving scenario 12 green."
  - "Scenario 15's routing design lets the OLD ~25-hop sequential SPC/fire-weather chain (out of scope for PERF-01) succeed quietly via the SAME '.lyr.geojson' substring catch-all every other route builder in this file already uses, then drains it via a bounded setImmediate-tick loop that releases only non-batch-member URLs, stopping the instant a batch-member URL appears pending — so the old chain completing cleanly (required for the plan's own '_stale unset' acceptance criterion) never collapses the overlap the scenario exists to observe."
  - "Fixed a self-inflicted infrastructure bug found while authoring scenario 15: installDeferredHttp's safety timer was originally unref()'d (per an initial reading of 'do not let it delay process exit'), which let Node exit silently with code 0 and zero output the moment the scenario's own single releaseAll() call left later-issued requests (ERO days 2-5, WSSI days 2-3, other hazards layers, advisory candidates) permanently pending. Removed the unref() and added driveToCompletion to continuously release newly-issued requests until the driven promise settles — this is the correct behavior the plan's own safety-timer requirement implies (a hang must produce a loud, diagnosable rejection, not a silent early exit)."

requirements-completed: [PERF-01, DATA-03]

# Metrics
duration: ~65min (approximate)
completed: 2026-09-01
---

# Phase 17 Plan 08: HeatRisk Frontend Gate, DATA-03 Load-Time, and PERF-01 Concurrency Scenarios Summary

**Landed the phase's final four probe scenarios — two frontend D-03 gate/render scenarios pinning Phase 15's MPD-invisible defect shape applied to HeatRisk, a unit-style DATA-03 load-time proof against a scenario-local registry fixture, and the phase's sole structural proof that the six-member Promise.allSettled batch genuinely overlaps in flight — built on a new deferred-resolution fetch stub (`installDeferredHttp`) that holds requests pending until manually released; probe suite rises from 78 to 82 (0 failed, 0 skipped).**

## Performance

- **Duration:** ~65 min (approximate)
- **Completed:** 2026-09-01
- **Tasks:** 2/2 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments

- `frontend-heatrisk-only-is-not-an-all-clear` pins D-03's gate term directly: a HeatRisk-only day above the floor renders its own row and does NOT suppress the all-clear, with a precondition guard proving the otherwise-all-quiet payload genuinely renders the plain all-clear when HeatRisk carries no reading.
- `frontend-heatrisk-minor-floor-is-not-a-blank-module` pins D-03's shared-predicate discipline and D-01's floor across two arms (showMinorHeat off filters the Minor row AND restores the all-clear; showMinorHeat on flips both) plus a category-2 control proving Arm A's non-render is the floor at work, not a renderer that never renders.
- `registry-rejects-shared-label-maps-at-load-time` is a unit-style proof of `assertNoSharedRegistryMaps` (D-11/DATA-03) — throws on two rows sharing a map object by reference, naming both row ids and the field; two controls prove it is object identity (not deep equality) and that undefined/null fields are skipped; the real `PRODUCT_REGISTRY` is never mutated.
- `installDeferredHttp(helper, routes, { timeoutMs })` — new harness infrastructure in `scripts/probe-payload-resilience.js` (beside `installHttp`): matches routes by substring exactly like `installHttp`, records `{ url, headers, at }` synchronously at call time, but returns a promise that stays pending until the scenario calls `entry.release()`/`entry.reject(err)` via the `pending`/`releaseAll()`/`releaseMatching(substring)` control surface. An unrouted URL still resolves immediately with the same 503 default. A refed (never unref'd) safety timer rejects a never-released request with a diagnosable message naming every still-pending URL.
- `new-product-batch-fetches-issue-before-siblings-resolve` — the phase's sole structural PERF-01 proof: enables all six product toggles, drains the out-of-scope ~25-hop sequential SPC/fire-weather chain via a bounded event-loop-tick loop, then observes the HeatRisk identify URL (member 4) issued while the ERO day-1 URL (member 1) is still pending. Carries a precondition guard, a single-toggle control (exactly one member pending), and a check that the settlement log names all six members' timings.

## Task Commits

1. **Task 1: D-03 frontend gate/render scenarios and the DATA-03 load-time scenario** - `2b73c2a` (test)
2. **Task 2: Deferred-resolution fetch stub and the PERF-01 overlap scenario** - `20376d8` (test)

**Plan metadata:** pending (this commit, made by the orchestrator after merge)

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — added `installDeferredHttp` (Task 1's commit, ahead of its Task 2 caller — see Issues Encountered), four scenarios (`frontend-heatrisk-only-is-not-an-all-clear`, `frontend-heatrisk-minor-floor-is-not-a-blank-module`, `registry-rejects-shared-label-maps-at-load-time`, `new-product-batch-fetches-issue-before-siblings-resolve`), and `driveToCompletion` (Task 2's fix for a self-found infrastructure bug). No other file touched — `node_helper.js`, `MMM-SPCOutlook.js`, `productRegistry.js`, `scripts/probe-lib/module-stubs.js` are all byte-identical to the plan's starting commit.

## Decisions Made

See `key-decisions` in frontmatter: (1) `installDeferredHttp`'s placement in `probe-payload-resilience.js` rather than `module-stubs.js`; (2) scenario 13's fallback mutation route and the structural-impossibility finding it documents; (3) scenario 15's `.lyr.geojson`-catch-all + bounded drain-loop design for keeping the out-of-scope old chain quiet without collapsing the batch overlap; (4) the safety-timer `unref()` bug found and fixed during Task 2's own authoring.

## Overall Verification — Verbatim Results

- `node scripts/probe-payload-resilience.js` → **82 passed, 0 failed, 0 skipped** at final state (78 baseline + 4 added — matches "scenario count rose by the number added" per the project note; the plan's own "17-07 baseline + 3"/"+4" acceptance text is consistent with this, since each task's own baseline was itself 78 rising to 81, then 81 rising to 82).
- Suite runtime: `time node scripts/probe-payload-resilience.js` → **real 0m1.943s** for the full 82-scenario suite (well under a second per-scenario overhead; no safety timer fired on the happy path).
- `bash scripts/check-concurrency-invariant.sh` → exits **0**, all four sites `OK` (unchanged from 17-05/17-06/17-07's baseline).
- `git status --short` → only `scripts/probe-payload-resilience.js` modified across both commits; `node_helper.js`, `MMM-SPCOutlook.js`, `productRegistry.js` all confirmed byte-identical to the plan's starting commit after every mutation proof (restored and re-verified via `git status --short` showing no diff each time).
- `grep -n 'toMercator' scripts/probe-lib/module-stubs.js` → still present (17-04's addition, untouched — this plan never modified `module-stubs.js`).
- Fresh out-of-process re-require: `node -e "require('./productRegistry')"` → exits 0. `node -e "const {PRODUCT_REGISTRY, assertNoSharedRegistryMaps} = require('./productRegistry'); assertNoSharedRegistryMaps(PRODUCT_REGISTRY);"` → exits 0 with no throw — the real registry is provably unmutated by scenario 14's fixtures.

## Task 1 Acceptance Criteria — Verbatim Results

- Full suite green after Task 1: **81 passed, 0 failed, 0 skipped** (78 baseline + 3).
- **Mutation A** (scenario 12) — deleted the HeatRisk gate term (`MMM-SPCOutlook.js:456`) from `getDom`'s no-risk short-circuit:
  ```
  FAIL frontend-heatrisk-only-is-not-an-all-clear: D-03: a HeatRisk-only day above the floor (category 3, showMinorHeat false) suppressed the all-clear was not the outcome; instead it rendered the all-clear anyway: No Severe Weather Risk
  FAIL frontend-heatrisk-minor-floor-is-not-a-blank-module: Arm B (showMinorHeat true): expected the Minor row to render, got: No Severe Weather Risk
  PROBE RESULT: 79 passed, 2 failed, 0 skipped
  ```
  Both scenario 12 and scenario 13 (Arm B, which also depends on the same gate term) went RED. Restored; `git status --short MMM-SPCOutlook.js` clean; suite returned to 81/0/0.
- **Mutation B** (scenario 13's own isolated proof) — the plan's primary mutation ("gate reads raw category, loop keeps floor") is structurally impossible: both call sites are the literal same expression `heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat)`, so there is no second expression to diverge — a positive finding that D-03 is enforced structurally, not by convention. Applied the plan's own stated fallback: mutated the floor constant `showMinorHeat === true ? 1 : 2` to `showMinorHeat === true ? 1 : 1` inside `heatRiskDaysToRender`:
  ```
  FAIL frontend-heatrisk-minor-floor-is-not-a-blank-module: Arm A (showMinorHeat false): expected the Minor row filtered out by the floor, got: Heat Risk (Day 3): <span style="color:#f4f257">Minor</span><br/>
  PROBE RESULT: 80 passed, 1 failed, 0 skipped
  ```
  Only scenario 13 failed (scenario 12 stayed green, confirming isolation). Restored; `git status --short MMM-SPCOutlook.js` clean; suite returned to 81/0/0.
- **Mutation C** (scenario 14) — removed `"valueToTier"` from `productRegistry.js`'s `MAP_FIELDS` array:
  ```
  FAIL registry-rejects-shared-label-maps-at-load-time: expected assertNoSharedRegistryMaps to throw on two rows sharing the same valueToTier object by reference, it did not throw
  PROBE RESULT: 80 passed, 1 failed, 0 skipped
  ```
  Only scenario 14 failed. Restored; `git status --short productRegistry.js` clean; suite returned to 81/0/0.
- Scenario 12's precondition guard is proven capable of firing structurally (it is exercised on every green run — the control payload with `heatRisk` all-null must render the plain all-clear before the primary assertion is trusted; a failure there throws with the control HTML, verified by code inspection of the guard's own throw path since no fault currently exists to trigger it live).
- Scenario 14's two control assertions both proven live on every green run: distinct-but-structurally-equal objects (`{1:"A"}` vs a separate `{1:"A"}`) do not throw, and a row whose map field is `undefined`/`null` is skipped without throwing.

## Task 2 Acceptance Criteria — Verbatim Results

- Full suite green after Task 2: **82 passed, 0 failed, 0 skipped** (81 baseline + 1).
- Suite runtime with the new scenario: **real 0m1.943s** — no measurable slowdown, confirming the safety timer never fires on the happy path.
- No-wall-clock grep, scenario 15's own body only:
  ```
  $ awk '/name: "new-product-batch-fetches-issue-before-siblings-resolve"/,/^  \}$/' scripts/probe-payload-resilience.js | grep -n "Date.now\|setTimeout"
  (no output)
  ```
  The scenario uses only `setImmediate` for event-loop yields; the only `setTimeout` in the file is `installDeferredHttp`'s own safety timer, outside the scenario's body.
- **Precondition-guard firing proof**: temporarily disabled five of the six toggles (`showExcessiveRain/showWinterImpact/showHazardsOutlook/showSPCMD/showMPD: false`, leaving only `showHeatRisk: true`), ran the suite:
  ```
  FAIL new-product-batch-fetches-issue-before-siblings-resolve: precondition failed: expected at least two different batch members pending after 400 drain ticks, got 1 (heatRisk). Pending URLs: https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify?... Enabled toggles: {"showExcessiveRain":false,"showWinterImpact":false,"showHazardsOutlook":false,"showHeatRisk":true,"showSPCMD":false,"showMPD":false}
  PROBE RESULT: 81 passed, 1 failed, 0 skipped
  ```
  Restored; `git status --short scripts/probe-payload-resilience.js` showed the intended diff only; suite returned to 82/0/0.
- **Safety-timer non-hang proof** (ad hoc scratch script, `installDeferredHttp`'s exact contract reproduced standalone with `timeoutMs: 500` for a fast run): a route matched but never released rejected after the timer fired, never hanging the process:
  ```
  ELAPSED_MS: 501
  REJECTION_MESSAGE: installDeferredHttp: safety timeout (500ms) — request to https://example.test/never-released was never released. Still-pending URLs at timeout: (none other)
  ```
- **INDIVIDUAL MUTATION PROOF, PERF-01's single most important evidence** — reverted `node_helper.js`'s `Promise.allSettled(members.map(...))` batch to a sequential `for` loop awaiting each member one at a time, preserving the identical downstream `settled`/`results` shape:
  ```
  FAIL new-product-batch-fetches-issue-before-siblings-resolve: precondition failed: expected at least two different batch members pending after 400 drain ticks, got 1 (excessiveRain). Pending URLs: https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query?where=1%3D1&outFields=*&f=geojson. Enabled toggles: {"showExcessiveRain":true,"showWinterImpact":true,"showHazardsOutlook":true,"showHeatRisk":true,"showSPCMD":true,"showMPD":true}
  PROBE RESULT: 81 passed, 1 failed, 0 skipped
  ```
  Under sequential awaits only ONE member (`excessiveRain`, the first) is ever pending at a time — HeatRisk (member 4) never gets issued concurrently with it, exactly the structural difference this scenario exists to prove. Restored; `node --check node_helper.js` exits 0; `git status --short node_helper.js` clean; suite returned to 82/0/0.
- Control assertion (single-toggle case) passes and is recorded above as part of the full-suite green run (the scenario's own second half, `showHeatRisk: true` alone, asserting `controlPendingIds.size === 1`).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] installDeferredHttp's safety timer was `unref()`'d, letting Node exit silently instead of hanging loudly**
- **Found during:** Task 2, while first authoring `new-product-batch-fetches-issue-before-siblings-resolve`.
- **Issue:** The plan's read of "the safety timer must not fire on the happy path" was initially over-applied as "the timer must never keep the process alive" (`timer.unref()`). Combined with releasing the batch's pending requests only ONCE (`helper._fetch.releaseAll()`) rather than continuously, later-issued requests (ERO's remaining days, WSSI's remaining days, the other hazards layers, advisory candidates) were left permanently pending with only an unref'd timer watching them. Since nothing else was keeping the event loop alive, Node exited the whole process silently with exit code 0, zero output for the scenario, and no `PROBE RESULT` line at all — a genuinely dangerous failure mode: a suite run in this state would look like every OTHER scenario simply never got recorded, not like a failure.
- **Fix:** Removed `unref()` from the safety timer (it is now a normal refed timer — a genuinely abandoned request keeps the process alive until the timer fires and rejects loudly, exactly the plan's own stated intent for "a mis-written scenario fails loudly instead of hanging the suite forever"). Added `driveToCompletion(fetchFn, promise)`, which repeatedly calls `releaseAll()` across `setImmediate` ticks until the driven promise settles, so every request a runner's own internal loop issues gets released in turn.
- **Files modified:** `scripts/probe-payload-resilience.js` (both the `installDeferredHttp` timer and the two `driveToCompletion` call sites inside scenario 15).
- **Verification:** Suite runs in 1.943s total with the new scenario passing (82/0/0); the mutation and precondition-guard proofs above both completed promptly with no unexpected delay, confirming the fix does not reintroduce a hang on the happy path.
- **Committed in:** `20376d8` (Task 2's commit).

### Acceptance-Criteria Tensions (not code deviations)

**2. `installDeferredHttp` placed in `probe-payload-resilience.js`, not `scripts/probe-lib/module-stubs.js`**
- **Found during:** Task 2's design step.
- **Issue:** The plan's action text offers a choice ("Add ... to `scripts/probe-lib/module-stubs.js` (or to the probe script's helper region if that fits the file's layout better — pick one and say which in the SUMMARY)").
- **Resolution:** Placed it in `scripts/probe-payload-resilience.js`, immediately after `installHttp`, since it is a per-scenario network stub built on that file's own `httpResponse`/route-matching conventions, not a node_helper-loading or global-seam concern (turf, kml-deps resolution, the frontend vm loader) the way everything in `module-stubs.js` is. `scripts/probe-lib/module-stubs.js` is therefore untouched by this plan.
- **Impact:** None on correctness; the frontmatter's `files_modified` list names both files as candidates, and this plan modified only one of them as the plan itself anticipated might happen.

**3. Task 1's commit (`2b73c2a`) includes `installDeferredHttp`, which is Task 2's deliverable**
- **Found during:** Reviewing the diff before Task 2's own commit.
- **Issue:** `installDeferredHttp` was written into the file before Task 1's three scenarios (as groundwork read while surveying the file's HTTP-stubbing section) and had already been committed as part of establishing a clean baseline before Task 1's own scenarios were added — meaning Task 1's commit contains one function that is structurally Task 2's own artifact, ahead of its first caller.
- **Resolution:** Documented here rather than rewritten via history-editing (the plan prohibits amending prior commits). Task 2's commit contains the actual scenario that exercises `installDeferredHttp` plus the safety-timer/`driveToCompletion` fix, so the function's CALLER and its BEHAVIORAL PROOF both land in the correct (Task 2) commit; only the initial declaration sits one commit early.
- **Impact:** None on correctness, review, or bisectability of behavior — `installDeferredHttp` has no side effects and no caller until Task 2's commit, so Task 1's commit is not functionally different than if the function were absent.

---

**Total deviations:** 1 auto-fixed (Rule 1, a genuine bug in the harness infrastructure this plan itself introduced, found and fixed before landing); 2 acceptance-criteria/commit-boundary notes, both resolved by following the plan's own stated discretion or by disclosure rather than history rewriting.
**Impact on plan:** The Rule 1 fix is essential — without it, scenario 15 would silently corrupt the suite's own exit semantics (a passing-looking exit 0 with a truncated scenario count) rather than genuinely proving PERF-01. No scope creep; no implementation file (`node_helper.js`, `MMM-SPCOutlook.js`, `productRegistry.js`, `scripts/probe-lib/module-stubs.js`) was left modified by either task.

## Issues Encountered

Beyond the two documented items above (both resolved without any implementation-file change), no other issues. The silent-exit failure mode (deviation 1) was itself a valuable early discovery precisely because it manifested as a passing-looking result (exit 0, no FAIL line) rather than an obvious crash — worth flagging for any future plan that adds another deferred/manually-released stub to this harness: **always drive a held promise to completion with a loop, never a single `releaseAll()` call, and never `unref()` a safety timer meant to be the last line of defense against a silent hang.**

## User Setup Required

None — no external service configuration required. This plan is probe-harness-only, exercised entirely through `node scripts/probe-payload-resilience.js` and ad hoc scratch scripts run from the session scratchpad (not committed).

## Next Phase Readiness

- All four scenarios this phase's roadmap named are now live and individually mutation-proven: `frontend-heatrisk-only-is-not-an-all-clear`, `frontend-heatrisk-minor-floor-is-not-a-blank-module`, `registry-rejects-shared-label-maps-at-load-time`, `new-product-batch-fetches-issue-before-siblings-resolve`.
- The probe suite stands at 82/0/0. `scripts/check-concurrency-invariant.sh` still exits 0. `scripts/probe-lib/module-stubs.js` is untouched — `turfStub.toMercator` (17-04) is unregressed.
- This is the last scenario-writing plan in the phase (per the orchestrator's framing); only the mutation-inventory checkpoint plan (17-09) remains. `installDeferredHttp`/`driveToCompletion` are now permanent harness infrastructure available to any future phase needing to prove concurrent-issuance behavior elsewhere in this codebase.
- No blockers identified. Live in-season UAT of the parallelized batch and of HeatRisk against real NOAA endpoints remains untested by this plan (structural/mutation-proven verification only, per this project's established quality-notes fallback) — unchanged from 17-05/17-06/17-07's disclosed gap.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-08-SUMMARY.md`
- FOUND: commit `2b73c2a` (Task 1)
- FOUND: commit `20376d8` (Task 2)
