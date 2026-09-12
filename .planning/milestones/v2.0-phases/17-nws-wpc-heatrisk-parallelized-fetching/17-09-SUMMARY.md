---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 09
subsystem: testing
tags: [heatrisk, wpc, mutation-testing, uat, data-integrity, concurrency]
status: complete

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching (17-01 through 17-08)
    provides: HeatRisk registry row, identify/reproject/bucket pipeline, frontend gate/render, Promise.allSettled batch, productRegistry identity assertion, and 15 mutation-proven probe scenarios
provides:
  - Consolidated one-document mutation inventory covering all 15 phase-17 probe scenarios plus scripts/check-concurrency-invariant.sh's own mutation proof (16 rows total), discharging Phase 15 D-10 for this phase
  - Self-contained DATA-03 recorded spot-check artifact enumerating every label-to-value/tier/text/colour map in the codebase with current file:line, the closure-level blind-spot analysis D-11 requires, and the ERO dn / fire weather DN per-closure finding
  - Operator UAT verdict: all five ROADMAP Phase 17 success criteria PASS on the live deployed MagicMirror
affects: [phase-18-merge-precedence, phase-19-getdom-rewrite]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Phase-closing consolidation plan: one MUTATION-INVENTORY.md cross-checked by machine against the probe source's scenario names, one SPOTCHECK.md for any identity-assertion-based data-integrity claim, one human-verify checkpoint against the ROADMAP's own success criteria wording — same shape phase 16 established"

key-files:
  created:
    - .planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-MUTATION-INVENTORY.md
    - .planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-DATA03-SPOTCHECK.md
    - .planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-09-SUMMARY.md
  modified: []

key-decisions:
  - "Operator accepted HEAT-04 as PASS on fixture evidence rather than live observation — no duplicate idp_validtime has ever been served by upstream, so there was nothing to observe live; the mutation-proven heatrisk-duplicate-validtime-keeps-latest-filedate scenario is the accepted basis, recorded as such rather than as a deferred item."
  - "PERF-01's concurrency claim was corroborated with two live production timing lines (2275ms/734ms wall clock vs 4392ms/2422ms summed member time), confirming Promise.allSettled batching is genuine on the deployed hardware, not just probe-proven."

requirements-completed: [HEAT-01, HEAT-02, HEAT-03, HEAT-04, PERF-01, DATA-03]

# Metrics
duration: Task 1 ~45min; Task 2 spanned an operator UAT window on live production hardware between checkpoint presentation and verdict
completed: 2026-09-01
---

# Phase 17 Plan 09: Mutation Inventory Consolidation, DATA-03 Spot Check, and Human UAT Summary

**Phase 17's D-10 mutation-proof obligation and D-11 identity-assertion coverage claim both now live in single self-contained artifacts, and the operator has confirmed all five ROADMAP success criteria PASS against the live deployed MagicMirror at 192.168.1.29.**

## Performance

- **Duration:** Task 1 executed in a single session (~45 min); Task 2 was a blocking human-verify checkpoint that paused for an operator UAT window on the live deployment before returning a verdict.
- **Started:** 2026-09-01 (Task 1)
- **Completed:** 2026-09-01 (Task 2 verdict recorded)
- **Tasks:** 2 (1 auto, 1 checkpoint:human-verify)
- **Files modified:** 3 (`.planning/` only — no source file touched)

## Accomplishments

- `17-MUTATION-INVENTORY.md`: 16-row table (15 probe-suite scenarios + `check-concurrency-invariant.sh`'s own proof) with exact mutation, quoted RED message, restore confirmation, precondition-guard-firing verdict, and control-assertion-non-vacuity verdict for every phase-17 scenario. Includes the D-04/D-05 cross-branch independence matrices and two disclosed findings (scenario 11's defensive throw firing via a different mechanism than planned; scenario 2 requiring two coupled edits).
- `17-DATA03-SPOTCHECK.md`: 22-row map inventory re-derived from current source (not copied from 17-PATTERNS.md), the ERO `dn` / fire weather `DN` closure-level non-collision finding DATA-03's own wording names, and a second, self-disclosed blind spot beyond D-11's own comment (pre-registry SPC-categorical/fire-weather tables sit entirely outside `assertNoSharedRegistryMaps`'s reach — a documented scope boundary, not a phase-17 gap).
- Operator UAT verdict obtained and recorded: all five ROADMAP Phase 17 success criteria PASS.

## Task Commits

1. **Task 1: Phase mutation inventory and the DATA-03 spot-check artifact** - `8ca3474` (docs)
2. **Task 2: Human UAT against the ROADMAP's five success criteria** - no file changed by this task itself; its verdict is transcribed below and recorded in this SUMMARY's commit.

**Plan metadata:** (this SUMMARY's own commit, immediately following)

## Files Created/Modified

- `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-MUTATION-INVENTORY.md` - one row per phase-17 probe scenario (16 total) with mutation/RED/restore/guard/control evidence
- `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-DATA03-SPOTCHECK.md` - full label-to-value map inventory, identity proof transcript, and closure-level blind-spot analysis
- `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-09-SUMMARY.md` - this document

## Human UAT Verdict (Task 2)

Preconditions re-confirmed immediately before the checkpoint was presented and again at this
plan's completion (see Verification below): probe suite 82/0/0, concurrency guard exit 0,
`require('./productRegistry')` exit 0.

The operator performed the UAT on the live deployed MagicMirror (host `magicmirror`,
192.168.1.29) with `showHeatRisk: true`. Verdict, transcribed verbatim per criterion:

**1. HEAT-01 / HEAT-02 — PASS.** Operator observed HeatRisk rows for Days 1-7 on the live mirror
and confirmed the displayed categories match the WPC HeatRisk map
(https://www.wpc.ncep.noaa.gov/heatrisk/) for their location, with Day 1 corresponding to TODAY.
This directly confirms the off-by-one discriminator this criterion exists to catch: day
attribution from sorted `idp_validtime` is correct against live upstream ordering, not merely
against a synthetic fixture. Note: the module renders day labels only ("Heat Risk (Day 1)"), no
calendar dates.

**2. HEAT-03 — PASS.** Real categories rendered — not all-`NoData`, no D-04 warning badge.
Independently corroborated from the live identify URL observed in production logs:
`https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer/identify`
with `geometry={"x":-10864317.208590966,"y":4224276.691347361,"spatialReference":{"wkid":102100}}`,
`sr=102100`, `returnGeometry=false`, `returnCatalogItems=true`. This confirms the Web-Mercator
reprojection (`wkid:102100`, large-magnitude coordinates) on live coordinates, not just against a
decoded fixture URL. ETag cache hits observed firing each poll cycle.

**3. HEAT-04 — PASS by accepted fixture evidence.** Not live-observable: upstream has never served
a duplicate `idp_validtime`, so there was nothing to observe on the deployed hardware. The operator
explicitly accepted the fixture evidence from the mutation-proven scenario
`heatrisk-duplicate-validtime-keeps-latest-filedate` (row 4 in `17-MUTATION-INVENTORY.md`,
including its dedicated visibility-independence proof) as sufficient. Recorded here as PASS with
its basis stated plainly — this is accepted fixture evidence, not a live observation, and per the
operator's explicit acceptance it is NOT recorded as a deferred item (no Deferred Items row added
to STATE.md for this criterion).

**4. PERF-01 — PASS.** Ten consecutive `new-product batch settled in` lines observed in production
logs (`~/.pm2/logs/mm-out.log`, pm2 process `mm`) over 3h15m uptime. Latest cycle:
`settled in 2275ms {winterImpact:2, spcMD:140, heatRisk:311, excessiveRain:684,
hazardsOutlook:983, mpd:2272}` — sum of members 4392ms, slowest member 2272ms, wall clock 2275ms
(slowest + 3ms overhead). Sequential execution would have taken 4392ms. A corroborating cycle
recorded wall 734ms against a summed 2422ms. Six timing entries appear per line (all six batch
members), one line per poll cycle — this is genuine live concurrency on the deployed hardware, not
sequential completion presenting as parallel.

**5. DATA-03 — PASS.** `assertNoSharedRegistryMaps` throws at module load; the deployed process ran
3h15m across 10 clean poll cycles without throwing. A clean start over that uptime window IS the
check, per the criterion's own "not a visual check" framing. The recorded spot-check table backing
this criterion is `17-DATA03-SPOTCHECK.md`.

No blank-module report was returned (the D-03 defect class this task's acceptance criteria treat
as automatically blocking). All five criteria PASS. Operator's overall verdict: **approved**.

## Deferred Items

None added by this plan. Every criterion returned a definite verdict (PASS, four live-observed and
one accepted-fixture); no criterion was returned NOT OBSERVABLE, so no STATE.md Deferred Items row
applies to this checkpoint.

## Decisions Made

- Operator accepted HEAT-04's fixture-only evidence as sufficient for a PASS verdict rather than
  requesting further live observation, since upstream has never (across this phase's entire
  research and UAT window) served a duplicate `idp_validtime` to manufacture a live case against.
- No new architectural or scope decisions were required; this plan is documentation-and-verification
  only, per its own objective.

## Deviations from Plan

None - plan executed exactly as written. Task 1's two disclosed findings (scenario 11's defensive
throw and scenario 2's coupled-edit mutation) were already surfaced and resolved within 17-04
through 17-08's own execution; this plan only transcribes and cross-checks them, and does not
introduce new deviations of its own.

## Issues Encountered

None. All three precondition commands (`node scripts/probe-payload-resilience.js`,
`bash scripts/check-concurrency-invariant.sh`, `node -e "require('./productRegistry')"`) passed
both before the checkpoint was presented and again at this plan's completion.

## User Setup Required

None - no external service configuration required. The operator's UAT was a temporary
`showHeatRisk: true` config change on their own already-running deployment, not a new setup step.

## Verification

Re-run at this plan's completion (2026-09-01), in the working tree, ahead of writing this SUMMARY:

```
$ node scripts/probe-payload-resilience.js
...
PASS frontend-heatrisk-only-is-not-an-all-clear
PASS frontend-heatrisk-minor-floor-is-not-a-blank-module
PASS registry-rejects-shared-label-maps-at-load-time
PASS new-product-batch-fetches-issue-before-siblings-resolve
PROBE RESULT: 82 passed, 0 failed, 0 skipped
$ echo $?
0

$ bash scripts/check-concurrency-invariant.sh
OK: _unusableFeatureCount @ extractPolygons:1808 ...
OK: _unusableFeatureCount @ evaluatePolygonsCollectAll:1864 ...
OK: _unusableFeatureCount @ checkInPolygon:3637 ...
OK: _oldestStaleAt @ _noteStaleEntry:2164 ...
check-concurrency-invariant: all sites clean
$ echo $?
0

$ node -e "require('./productRegistry')"
$ echo $?
0
```

`git status --short` at plan completion shows no modified source files — only the two Task 1
artifacts and this SUMMARY under `.planning/`, plus pre-existing untracked/unrelated entries
(`.codegraph/`, `node_modules/`, `pnpm-lock.yaml`, a deleted IDE workspace file) that predate and
are unrelated to this plan.

## Informational Note (not a phase-17 gap)

The operator observed an unrelated, pre-existing warning on the mirror during the UAT window:
MagicMirror's own `updatenotification` module periodically logs `Failed to retrieve repo info for
MMM-SPCOutlook: Error: Command failed: git fetch -n --dry-run`, almost certainly because the Pi
cannot non-interactively authenticate to the origin git server. This is not caused by phase 17,
is not a gap in this phase's scope, and is not tracked here as a deferred item or backlog entry —
noted for completeness only.

## Next Phase Readiness

Phase 17 requirements HEAT-01, HEAT-02, HEAT-03, HEAT-04, PERF-01, and DATA-03 are all now
mutation-proven (probe suite) and, with the exception of HEAT-04 (accepted fixture evidence),
live-confirmed on deployed production hardware. Both consolidation artifacts required by Phase 15
D-10 and Phase 17's own D-11 now exist as self-contained, auditable documents. No blockers carry
forward from this plan. Phase completion itself (ROADMAP checkbox, STATE.md phase-level status)
remains the orchestrator's responsibility, not this plan's.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-09-SUMMARY.md`
- FOUND: commit `8ca3474` (Task 1: 17-MUTATION-INVENTORY.md and 17-DATA03-SPOTCHECK.md)
