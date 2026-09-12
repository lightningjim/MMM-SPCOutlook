---
phase: 18-merge-precedence-unified-payload-schema
plan: 11
subsystem: data
tags: [merge-precedence, day-grid, payload-schema, gap-closure, mutation-testing]

# Dependency graph
requires:
  - phase: 18-10
    provides: the merge-grid-* scenario family idiom (pinned clock, resetHelper/resetLogs, precondition guard, primary assertion, control assertion) and 118 mutation-proven scenarios
  - phase: 18-05
    provides: "_buildSourceHealth's reporting-gated-on-enabled mitigation and the deferred-items.md entry naming this defect's root cause"
  - phase: 18-04
    provides: "_addRegistryDayGridEntries and _runArcGisDayProduct, the two functions this plan's fix and gate live in"
provides:
  - "_addRegistryDayGridEntries now takes a sixth productToggles parameter and skips its whole day loop (noteReported/noteActive/entry assembly) when the product's own toggle reads off, mirroring _runArcGisDayProduct's own fetch gate and _runHeatRiskProduct's empty-gridTuples-when-off pattern"
  - "A mutation-proven probe scenario (merge-sources-disabled-registry-source-reports-no-days) pinning the toggle-off reportedDays/activeDays-empty invariant with a live on-run control proving the gate is not vacuously always-empty"
  - "The observed toggle-off/toggle-on reportedDays arrays plan 18-12 cites when closing the deferred-items.md entry"
affects: [18-12]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "A grid-entry builder that receives an already-resolved payload (rather than performing its own fetch) still needs its own copy of the product's toggle gate when the payload's shape invariant (Phase 14 D-05) makes an off/on poll produce identical string-typed values -- the gate cannot be inferred from the payload alone."

key-files:
  created: []
  modified:
    - node_helper.js
    - scripts/probe-payload-resilience.js

key-decisions:
  - "The gate is a bare early `return;` before the whole day loop (not a per-day skip), matching _runHeatRiskProduct's empty-gridTuples-when-off shape rather than adding a second, differently-shaped gate that would have to be independently verified not to diverge from it."
  - "_buildSourceHealth's Rule-1 `reporting` gate on `enabled` is kept in place unchanged and its comment updated to say the reportedDays over-population is now fixed at its source -- the gate is redundant defense-in-depth, not dead code, per the plan's explicit instruction not to remove it."

requirements-completed: [RPT-07]

# Metrics
duration: ~35min
completed: 2026-09-06
---

# Phase 18 Plan 11: MERGE-01/deferred-items.md Gap Closure — reportedDays Toggle Gate Summary

**`_addRegistryDayGridEntries` now skips its entire day loop when a registry day-layers product's own toggle is off, closing the `sources[].reportedDays` over-reporting defect at its root rather than only mitigating it downstream via `reporting`; the invariant is pinned by a mutation-proven probe scenario with a live on/off control, raising the suite from 118 to 119 passing.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-09-06 (following 18-10)
- **Completed:** 2026-09-06
- **Tasks:** 2 completed
- **Files modified:** 2 (`node_helper.js`, `scripts/probe-payload-resilience.js`)

## Accomplishments

- **Task 1:** `_addRegistryDayGridEntries` gained a sixth `productToggles` parameter and an early `return;` immediately after `const floor = NO_RISK_FLOOR[sourceId];`, firing when `productToggles[row.configFlag] !== true` (strict form, matching T-18-14/`_buildSourceHealth`'s own `=== true` idiom). Both `getSpcOutlook` call sites (`"wpc-ero"`/`PRODUCT_REGISTRY.excessiveRain` and `"wpc-wssi"`/`PRODUCT_REGISTRY.winterImpact`) now pass the request's own `productToggles` local as the sixth argument. `_runArcGisDayProduct`'s `"NONE"` seeding (Phase 14 D-05) was left byte-identical — confirmed by `sed -n '335,360p' node_helper.js | grep -c 'tiers\[d\] = "NONE"'` returning `1`. `_buildSourceHealth`'s Rule-1 comment (node_helper.js:3618-3628) was reworded to record the fix is now applied at its source, while the `reporting`-gated-on-`enabled` behavior itself is unchanged.
- **Task 2:** Appended `merge-sources-disabled-registry-source-reports-no-days` to `scripts/probe-payload-resilience.js`'s `scenarios` array. Off-run: both toggles off, every ERO/WSSI URL routed via `hazardsRoutes()` anyway, a precondition guard confirming `excessiveRain.day1Risk`/`winterImpact.day1Risk` are still the string `"NONE"`, then primary assertions that `sources['wpc-ero']`/`['wpc-wssi']`'s `reportedDays`/`activeDays` are empty arrays and `enabled`/`reporting` are both `false`. Control (separate poll): both toggles on, `ERO_URLS[1]`/`WSSI_URLS[1]` prepended with real above-floor fixtures ahead of `...hazardsRoutes()`, asserting the full registry-declared spans `[1,2,3,4,5]`/`[1,2,3]` still populate with `reporting: true`. Mutation-proven by deleting the Task 1 early return: the scenario went RED with a diagnosable message naming `wpc-ero` and its populated array; restoring returned the suite to `119 passed, 0 failed, 0 skipped` with an empty `git diff node_helper.js` at that checkpoint.

## Task Commits

1. **Task 1: Gate `_addRegistryDayGridEntries`'s `noteReported` on the product's own toggle** - `03420ea` (fix)
2. **Task 2: Pin the toggle-off invariant with a mutation-proven scenario** - `779fb28` (test)

**Plan metadata:** (this commit) `docs(18-11): complete MERGE-01/deferred-items.md gap closure plan`

## Files Created/Modified

- `node_helper.js` — `_addRegistryDayGridEntries` signature extended with `productToggles`, JSDoc extended with the sixth `@param`, and a strict `!== true` early return added before the day loop; both call sites (node_helper.js:5013/5016) updated to pass `productToggles`; `_buildSourceHealth`'s Rule-1 comment (node_helper.js:3618-3628) reworded to state the over-population is now fixed at its source. 40 changed lines (29 insertions, 11 deletions), touching only these four spots.
- `scripts/probe-payload-resilience.js` — Appended `merge-sources-disabled-registry-source-reports-no-days` (96 insertions) after the last `merge-grid-hazards-*` scenario 18-10 added.

## Observed reportedDays Arrays (for plan 18-12)

Recorded verbatim from the new scenario's own assertions, both runs through the real `getSpcOutlook` pipeline via the probe harness (not a temporary scratch script — the acceptance criterion's "one-off check" is satisfied by this permanent, mutation-proven scenario itself, so no scaffolding was added or needed removing):

- **Toggle off** (`showExcessiveRain: false, showWinterImpact: false`): `sources['wpc-ero'].reportedDays` = `[]`, `sources['wpc-wssi'].reportedDays` = `[]`; both `activeDays` = `[]`; both `enabled` = `false`; both `reporting` = `false`. (Prior to Task 1's fix, `sources['wpc-ero'].reportedDays` was `[1,2,3,4,5]` under the identical off toggles — confirmed directly via the M3 mutation below, which reproduces that exact pre-fix state.)
- **Toggle on** (`showExcessiveRain: true, showWinterImpact: true`, each answering a real above-floor tier on day 1 and an empty collection on the remaining days): `sources['wpc-ero'].reportedDays` = `[1,2,3,4,5]`, `sources['wpc-wssi'].reportedDays` = `[1,2,3]` — the full registry-declared spans, unchanged from pre-fix behavior; both `reporting` = `true`.

## Mutation Inventory (Task 2)

| Scenario | File:line mutated | Mutation description | Verbatim `FAIL` message | Restored |
|---|---|---|---|---|
| `merge-sources-disabled-registry-source-reports-no-days` (M3) | `node_helper.js`, the `if (productToggles[row.configFlag] !== true) return;` line added in Task 1 (line 3270 at mutation time) | Deleted the early return, restoring the pre-fix behaviour exactly | `FAIL merge-sources-disabled-registry-source-reports-no-days: expected sources['wpc-ero'].reportedDays to be empty, got {"id":"wpc-ero","displayName":"WPC Excessive Rainfall Outlook","enabled":false,"reporting":false,"stale":false,"idpFiledate":null,"reportedDays":[1,2,3,4,5],"activeDays":[],"unmappedLabels":[]}` | Yes |

Full suite under M3: `PROBE RESULT: 118 passed, 1 failed, 0 skipped` — only the target scenario failed, no wider blast radius. After restore: `PROBE RESULT: 119 passed, 0 failed, 0 skipped`, `git diff --stat node_helper.js` showed the Task 1 fix only (29 insertions, 11 deletions), confirming the mutation left no residue.

## Acceptance Criteria Verification

- `grep -c '_addRegistryDayGridEntries(gridDays, sourceId, payload, row, notes, productToggles)' node_helper.js` → `1`.
- `sed -n '3245,3280p' node_helper.js | grep -c 'productToggles\[row.configFlag\] !== true'` → `1`.
- `sed -n '3245,3335p' node_helper.js | grep -c 'this._products'` → `1` — this is the new JSDoc's own negative reference ("read from here, never from `this._products`"), not a code reach; no actual `this._products` read exists inside the function body (confirmed by inspection of the diff, which touches only the signature/JSDoc/gate/call-sites/comment).
- `grep -n '_addRegistryDayGridEntries(' node_helper.js` → both call sites at node_helper.js:5013/5016 pass `productToggles` as the sixth argument.
- `sed -n '335,360p' node_helper.js | grep -c 'tiers\[d\] = "NONE"'` → `1` — `_runArcGisDayProduct`'s seeding untouched.
- `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 119 passed, 0 failed, 0 skipped`, exit 0.
- `node scripts/probe-payload-resilience.js | grep -c '^PASS merge-sources-disabled-registry-source-reports-no-days'` → `1`.
- `awk '/name: "merge-sources-disabled-registry-source-reports-no-days/,/^  },/' scripts/probe-payload-resilience.js | grep -c 'precondition failed:'` → `2`; `... | grep -c 'control:'` → `4`.
- `awk '/name: "merge-sources-disabled-registry-source-reports-no-days/,/^  },/' scripts/probe-payload-resilience.js | grep -c 'assertPayloadIntact'` → `2`.
- `grep -c 'const scenarios = \[' scripts/probe-payload-resilience.js` → `1`.
- `git diff node_helper.js | grep '^-.*productToggles\[row.configFlag\] !== true'` → prints nothing (no deletion); `git diff node_helper.js | grep -c 'productToggles\[row.configFlag\] !== true'` → `1` (addition only).
- `git diff --stat` (against the pre-plan tree) lists exactly `node_helper.js` (58 changed lines total, 29 insertions/11 deletions across the two commits shown in one cumulative diff... actually two separate commits, 40 changed lines then 96 insertions) and `scripts/probe-payload-resilience.js`, plus the pre-existing unrelated staged `.idea/` deletion this plan did not touch.

## Decisions Made

See `key-decisions` in the frontmatter. In brief: the gate is a single bare early return mirroring `_runHeatRiskProduct`'s shape rather than a per-day skip; `_buildSourceHealth`'s `reporting`-gated-on-`enabled` mitigation is kept exactly as-is (now redundant defense-in-depth rather than load-bearing) per the plan's explicit instruction.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues were found beyond the plan's own described fix and scenario. The `this._products` grep count reads `1` rather than the plan's anticipated `0` because the new JSDoc's own negative reference ("never from `this._products`") trips the same string match a real code reach would — a plan-authoring artifact identical in shape to 18-10's own Assumption Drift entry, recorded in the acceptance-criteria section above rather than silently reinterpreted.

**Total deviations:** 0
**Impact on plan:** Plan executed exactly as specified.

## Assumption Drift (advisory)

- **Found during:** Task 1 acceptance-criteria verification.
- **Planned:** The acceptance criterion `sed -n '3245,3330p' node_helper.js | grep -c 'this._products'` is `0`, offered as evidence "no helper-global reach inside the function."
- **Actual:** This count is `1` (the line range in the actual file is 3245-3335 after the JSDoc grew by 8 lines) — the new JSDoc's own sentence "the row's own `configFlag` is read from here rather than from `this._products`" is a negative reference that trips the same string match a real code reach would.
- **Why:** The criterion's grep pattern cannot distinguish "reads `this._products`" from "explicitly documents that it must never read `this._products`". The actual function body (verified directly in the diff and by inspection) never references `this._products`; the invariant the criterion intended to check holds. Same shape as 18-10's own recorded Assumption Drift entry for an analogous negative-reference false positive.

## Issues Encountered

None beyond the acceptance-criteria wording artifact documented above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The first `deferred-items.md` entry (`sources[].reportedDays` over-reporting for `wpc-ero`/`wpc-wssi`) is closed at its root; `_buildSourceHealth`'s `reporting` gate remains in place as redundant defense-in-depth, not the sole mitigation.
- `_resolveGridDayPrecedence`'s "rank source absent" vs "reported below floor" branches: all 118 pre-existing scenarios (including every `merge-precedence-*` scenario) stayed green through both tasks, confirming no `suppressedBy` value anywhere changed as a side effect of the toggle-off `wpc-ero`/`wpc-wssi` shifting from the below-floor branch to the absent branch.
- Plan 18-12 can cite this SUMMARY's "Observed reportedDays Arrays" section directly when closing the `deferred-items.md` entry, without needing a second live or scratch-harness capture.
- The suite stands at 119 scenarios, 0 failed, 0 skipped.
- No blockers introduced by this plan. PERF-03's cold-cache Pi measurement remains the only open milestone-close item, unaffected by this plan.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-06*

## Self-Check: PASSED

- FOUND: node_helper.js
- FOUND: scripts/probe-payload-resilience.js
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-11-SUMMARY.md
- FOUND: 03420ea (Task 1 fix commit)
- FOUND: 779fb28 (Task 2 test commit)
- Re-ran suite: PROBE RESULT: 119 passed, 0 failed, 0 skipped
