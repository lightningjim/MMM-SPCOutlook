---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
plan: 08
status: paused-at-checkpoint

subsystem: testing
tags: [probe-suite, hazards-outlook, mutation-inventory, uat, human-checkpoint]

# Dependency graph
requires:
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-04, 16-05, 16-06, 16-07)
    provides: "the 34 recorded mutation proofs and 17 probe-suite scenarios this plan consolidates"
provides:
  - "16-MUTATION-INVENTORY.md — the phase's single reviewable mutation-evidence artifact"
  - "day9..day14 audit, discharged with a per-hit verdict (0 truncation risks found)"
affects: [16-close]

# Tech tracking
tech-stack:
  added: []
  patterns: []

key-files:
  created:
    - .planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-MUTATION-INVENTORY.md
  modified: []

key-decisions:
  - "Task 1 executed fully autonomously and committed. Task 2 (human UAT checkpoint) is NOT started beyond its required preparation step (live layer feature counts) — this plan is paused there, per its own autonomous: false / checkpoint:human-verify structure. No UAT item is self-approved."

patterns-established: []

requirements-completed: []

# Metrics
duration: "~50min (Task 1 only; Task 2 not yet executed)"
completed: 2026-08-26
---

# Phase 16 Plan 08: Mutation Inventory, day9..day14 Audit, Human UAT Checkpoint Summary

**Consolidated all 34 mutations from Plans 16-04 through 16-07 into one reviewable inventory, discharged the day9..day14 truncation audit with a per-hit verdict (0 findings), confirmed the probe suite at 65/0/0, and paused at the plan's mandatory human-verify checkpoint for the five ROADMAP success criteria — no UAT item has been observed or approved on the human's behalf.**

## Performance

- **Duration:** ~50 min for Task 1 (autonomous portion)
- **Completed:** 2026-08-26 (Task 1); Task 2 pending human response
- **Tasks:** 1/2 completed autonomously; Task 2 is a `checkpoint:human-verify` gate, paused per plan design
- **Files created:** 1 (`16-MUTATION-INVENTORY.md`)

## Accomplishments (Task 1)

- `16-MUTATION-INVENTORY.md` reconciles **34/34** expected mutations (3 from 16-04 + 6 from 16-05 + 11 from 16-06 + 14 from 16-07), transcribed verbatim from the four SUMMARYs — none re-run, none invented
- Every one of the 17 probe-suite scenarios added in 16-06/16-07 is accounted for in the mutation table, either as a direct target or as a disclosed collateral failure under a shared-code-path mutation targeting a sibling scenario — **0 silently absent**
- The four documented anomalies from 16-05/16-06/16-07 are carried forward verbatim, not flattened: the 16-05 same-day-coincidence weekday mutation (resolved via a clock-shifted supplementary proof), the 16-06 vacuous-fixture self-catch and rewrite for the Flooding-labels scenario, the 16-06 "Dense Fog" substitution for "Frost/Freeze" (already mapped in the live registry), and the 16-07 `turfStub.pointInPolygon` re-arming bug plus the corrected freshness fixture literals (67h/115h, not the plan's 67h/91h) plus the added If-None-Match assertion
- `## Vacuity Preventatives` classifies all 17 probe scenarios plus the 3 ad-hoc Task-level checks from 16-04/16-05 as guard, control, or both — **one finding surfaced**: `hazards-routes-are-quiet-by-default` has no dedicated mutation or in-scenario control of its own; its only non-vacuity evidence is a disclosed collateral failure under a sibling scenario's mutation. Not blocking (the suite is green and the shared code path genuinely covers both), but named rather than hidden.
- `## Structurally-Proven, Not Mutation-Proven` is empty for this phase — every Hazards Outlook check has a real threshold/branch/gate to break; no Phase-15-F3-style no-threshold case was found
- **day9..day14 audit discharged with a named result:** every `d <= 8`-bounded hit in `MMM-SPCOutlook.js`, `node_helper.js`, and `scripts/probe-payload-resilience.js` (24 hits total) is either (a) a genuinely day-1-through-8-scoped existing product (SPC categorical Day 4-8, fire weather Day 3-8, or the shared `assertPayloadIntact`/fire-weather oracle's own literal 8-day contract) or existing documentation already stating the same conclusion. **0 hits would truncate the new product** — confirmed by reading `assertPayloadIntact`'s two `1..8` loops directly: they check only TOP-LEVEL `day1`..`day8` keys, and `hazardsOutlook.day3`..`day14` live nested one level inside `out.hazardsOutlook`, never at the top level, so these loops cannot see or truncate them
- Additionally confirmed `dayRiskCount`'s `/^day\d+Risk$/` regex is structurally disjoint from `hazardsOutlook`'s `/^day\d+$/`-shaped keys (no `Risk` suffix on this product), so `blockHasRisk` cannot be accidentally applied to the Hazards Outlook block
- Full probe suite re-run after the inventory was written: **65 passed, 0 failed, 0 skipped** (observed directly, not assumed)

## Task Commits

1. **Task 1: Consolidate the mutation inventory and discharge the day9..day14 audit** — `0a254bc` (docs)

Task 2 has not been committed — it is a `checkpoint:human-verify` gate and this plan is paused there.

## Verification Performed (Task 1)

- `bash` check for `16-MUTATION-INVENTORY.md` existing and containing all four required sections (`Unproven Scenarios`, `Structurally-Proven`, `Vacuity Preventatives`, `day9..day14 Audit`): **all four present**, confirmed via individual `grep -c` calls (1 match each)
- Mutation-row count check (`grep -c "^| 16-0"`): **37** (34 data rows + 3 note/anomaly lines beginning with the same prefix pattern), well above the required threshold of 20
- `node scripts/probe-payload-resilience.js`: **65 passed, 0 failed, 0 skipped**
- `grep -n "d <= 8\|d<=8\|<= 8" MMM-SPCOutlook.js node_helper.js scripts/probe-payload-resilience.js | wc -l`: **4** matching lines under the exact plan-specified pattern (the plan's own verify grep is narrower than the audit's own broader grep, which also matched `day8` literal-string occurrences used for the fuller per-hit table)

## Task 2 Preparation Performed (checkpoint automation-before-verification)

Per the checkpoint protocol, the automation that can run ahead of the human pause was run:

- **Live feature counts fetched directly from the six hazards layers** (2026-08-26, this session):

| Layer | Product | Feature count |
|---|---|---|
| 1 | Temperature, Day 3-7 | 4 |
| 3 | Temperature, Day 8-14 | 1 |
| 4 | Precipitation, Day 3-7 | **0** |
| 6 | Precipitation, Day 8-14 | **0** |
| 7 | Wildfire/Drought, Day 3-7 | 26 |
| 8 | Wildfire/Drought, Day 8-14 | 1 |

  This directly confirms, as of this session, that **C1 (HAZ-01) is very likely NOT OBSERVABLE today** — both Precipitation layers (4 and 6) return zero features nationwide, matching 16-06's own finding on the same date. C2/C3 (Temperature/Wildfire window band, lowercase-label read) have live features to inspect (35 total across layers 1/3/7/8) if the operator's UAT coordinate falls inside one of their polygons. C4's Drought half (layer 7, 26x features, consistent with 16-06's "26x Severe Drought, 0x Critical Wildfire Risk" note) is live-observable; its Flooding half rides inside the Precipitation layers, which are currently empty, so a live Flooding-label inspection is also not available today — the probe-suite's mutation-proven exclusion (`hazards-flooding-labels-never-appear-under-any-toggle`) stands as evidence regardless. C5 (DATA-02 freshness) does not require a live polygon match and can be checked from `idp_filedate` inspection independent of location.

- **`config.js` current values could NOT be printed** — this repository is the MagicMirror **module** source tree, not a MagicMirror installation; no `config.js` exists anywhere in this checkout or its parent repository (confirmed: `find` for `config.js` at the repo root and one level down returned nothing). The environment notes accumulated across this phase already record "No MagicMirror installation exists here." **This means Task 2's live UAT (moving `lat`/`lon`, restarting MagicMirror, observing the render) cannot be performed inside this sandbox at all — it requires the actual deployed Raspberry Pi MagicMirror installation, which is outside this repository's scope.** This is disclosed here rather than fabricated; see Checkpoint below.

## Deviations from Plan

### Auto-fixed Issues

None for Task 1 — executed exactly as the plan's `<action>` text specified (transcription discipline, all four required sections, the additional `dayRiskCount` disjointness confirmation).

**Total deviations:** 0

## Assumption Drift (advisory)

None material for Task 1. The plan's framing of `hazards-routes-are-quiet-by-default` implicitly assumes every 16-06/16-07 scenario carries its own dedicated mutation; on inspection this one scenario's non-vacuity rests entirely on a disclosed collateral failure under a sibling scenario's mutation rather than a dedicated one. This is recorded as a named finding in the `## Vacuity Preventatives` section of the inventory (not flattened into a false "both" or "control" claim), per this plan's own instruction that "any scenario with neither is a finding: name it" — the closest applicable case found.

## Issues Encountered

- `node_modules` was symlinked from the parent checkout (`/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/node_modules`) to run the probe suite in this worktree — untracked, will be removed before returning, per this phase's accumulated environment notes.
- `config.js` genuinely does not exist anywhere reachable from this worktree — see Task 2 Preparation above. This is an environment/scope gap, not a defect in this plan's own deliverables.

## Known Stubs

None. The mutation inventory and audit are fully substantive, evidence-based documents; no placeholder content exists in either.

## Threat Flags

None new. This plan's threat model (T-16-32 through T-16-35, T-16-SC) is exactly what Task 1's inventory implements: every mutation row carries a verbatim RED message and a confirmed restore (T-16-32); the one gap found (`hazards-routes-are-quiet-by-default`'s lack of a dedicated mutation) is disclosed as a finding, not silently omitted, which is the mitigation T-16-32 specifies. T-16-33/T-16-34 apply to Task 2, not yet executed. No npm/pip/cargo package was installed (T-16-SC).

## User Setup Required

**A human must complete Task 2 on the actual deployed MagicMirror hardware** — this cannot be simulated or automated further from this repository. See Checkpoint below for exact steps.

## STATE.md Update Needed (orchestrator to apply after merge — worktree mode skips this shared-file write)

Because this plan's `files_modified` includes `.planning/STATE.md` and execute-plan.md skips shared-file writes in worktree mode, the following is **not yet applied** to STATE.md. The orchestrator (or a continuation agent after the checkpoint resolves) should append these three rows to STATE.md's `## Deferred Items` table, following the existing format:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Verification | Live in-season confirmation of HAZ-01's per-day Precipitation bucketing | Deferred — both Precipitation layers (4, 6) returned zero features nationwide on 2026-08-26 (confirmed again during this plan's execution); the 10 mutation-proven `hazards-*` scenarios built on synthetic fixtures stand as evidence | Phase 16 close |
| Verification | Live confirmation of D-04's full-window guard (a Precipitation feature spanning its layer's exact nominal window routes to the window band, not the day grid) | Deferred — same root cause as above, no live Precipitation feature exists to observe the guard against | Phase 16 close |
| Verification | Live observation of `idp_filedate` across a weekend, to settle the STACK/FEATURES cadence conflict and potentially tighten D-14's 84h threshold | Deferred — not observable mid-week; CONTEXT.md Deferred Ideas already names this as worth one live weekend observation | Phase 16 close |

**These three are confirmed as genuine, standing deferrals independent of Task 2's outcome** — re-fetching the live layer counts during this plan's own execution (2026-08-26) reproduced the same zero-Precipitation-feature condition 16-06 observed, and today is a Wednesday, not a weekend, so none of the three could be discharged by this session regardless of what Task 2's UAT observes.

**Task 2's own C1-C5 NOT OBSERVABLE results (once the human completes the checkpoint) will need their own additional STATE.md rows** — those are Task 2's responsibility per its own acceptance criteria, not pre-empted here, since this plan has not yet observed them.

## CHECKPOINT REACHED

**Type:** human-verify
**Plan:** 16-08
**Progress:** 1/2 tasks complete

### Completed Tasks

| Task | Name | Commit | Files |
|---|---|---|---|
| 1 | Consolidate the mutation inventory and discharge the day9..day14 audit | `0a254bc` | `.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-MUTATION-INVENTORY.md` |

### Current Task

**Task 2:** Human UAT against the five ROADMAP success criteria
**Status:** blocked — requires the actual deployed MagicMirror/Raspberry Pi hardware, which this repository/sandbox does not have
**Blocked by:** No `config.js` (MagicMirror installation config) exists anywhere in this repository or its parent checkout; this worktree has no MagicMirror installation at all (a pre-existing, phase-wide environment constraint, not something this plan can fix)

### Checkpoint Details

**What was built (recap):** The complete Hazards Outlook product — registry row, backend runner with a clock-independent cache contract and per-layer freshness, the two no-risk gate terms, the day-grid renderer and the window-band renderer, plus 17 mutation-proven probe scenarios (65 total in the suite) — is fully implemented, mutation-proven, and consolidated in `16-MUTATION-INVENTORY.md`.

**Live layer feature counts as of 2026-08-26** (fetched directly from the six hazards MapServer layers, for the human's reference before starting):

| Layer | Product | Feature count |
|---|---|---|
| 1 | Temperature, Day 3-7 | 4 |
| 3 | Temperature, Day 8-14 | 1 |
| 4 | Precipitation, Day 3-7 | 0 |
| 6 | Precipitation, Day 8-14 | 0 |
| 7 | Wildfire/Drought, Day 3-7 | 26 |
| 8 | Wildfire/Drought, Day 8-14 | 1 |

**How to verify (on the actual deployed MagicMirror/Raspberry Pi installation, per the plan's Task 2 `<how-to-verify>`):**

1. On the target device, open its `config.js` and record the current `showHazardsOutlook`, `showDrought`, `lat`, `lon` values (so they can be restored verbatim afterward).
2. Set `showHazardsOutlook: true` and leave `showDrought` unset (shipped default `false`).
3. Given today's zero Precipitation feature count, C1 (HAZ-01) is expected to be NOT OBSERVABLE regardless of chosen coordinate — do not spend time hunting for a Precipitation polygon that does not exist today.
4. For C2/C3, pick a coordinate genuinely inside one of the 4 Temperature (layer 1), 1 Temperature (layer 3), 26 Wildfire/Drought (layer 7), or 1 Wildfire/Drought (layer 8) live polygons — verify with a real point-in-polygon test (not a bounding-box check), per STATE.md's documented live-verification procedure.
5. Restart MagicMirror, let one poll complete, and record PASS/FAIL/NOT OBSERVABLE for each of C1-C5 exactly as the plan's `<how-to-verify>` describes, including the `showDrought: true` half of C4 and the default-off confirmation.
6. Restore `lat`/`lon` and `config.js` to their original values; confirm via `git diff` that no unintended config change remains.

### Awaiting

The human to run the above on the actual target hardware and report back C1-C5 results (PASS / FAIL / NOT OBSERVABLE, each with what was actually seen), the `showDrought: true` half of C4, and the default-off confirmation — per the plan's `<resume-signal>`: type "approved" with the C1-C5 results, or describe what failed. No UAT item has been marked PASS on the human's behalf in this SUMMARY.

---
*Phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook*
*Task 1 completed: 2026-08-26 — Task 2 paused at checkpoint, awaiting human UAT*

## Self-Check: PASSED

- FOUND: `.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-MUTATION-INVENTORY.md`
- FOUND: `0a254bc` (Task 1 commit)
- Probe suite re-run at self-check time: 65 passed, 0 failed, 0 skipped
