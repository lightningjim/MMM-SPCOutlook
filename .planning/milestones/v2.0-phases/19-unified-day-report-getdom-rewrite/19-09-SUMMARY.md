---
phase: 19-unified-day-report-getdom-rewrite
plan: 09
subsystem: testing
tags: [parity, probe-suite, backend-emission, legacy-retirement, mutation-testing]

# Dependency graph
requires:
  - phase: 19-08
    provides: "RPT-06 sign-off (5 PASS / 30 NOT OBSERVABLE / 0 FAIL) and the four gap-closure
      commits (a440b31, 512a97e, 87b2a96, fb18000) this plan's sole-reader proof runs against"
provides:
  - "A re-verified sole-reader proof (getDom() reads zero legacy payload blocks), tied to the
    permanent probe scenario rpt01-getdom-reads-no-legacy-payload-block"
  - "Discharge of the folded HeatRisk day-7 todo, plus documentation of a sibling
    hazardsOutlook.dayN offset-labelling defect discharged the same way"
  - "Freshly measured probe-suite coupling cost (assertPayloadIntact 156->172, legacy-field
    assertions 180->198, scenarios 124->157) for the Task 2 deletion-timing decision"
affects: [19-decision-legacy-emission-deletion]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Discharge != delete: a defect can be inert on screen (no reader) while still present in
      the emitted payload until the emission itself is removed — recorded explicitly rather than
      conflating the two"

key-files:
  created:
    - .planning/phases/19-unified-day-report-getdom-rewrite/19-LEGACY-RETIREMENT.md
    - .planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md
  modified:
    - .planning/todos/done/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md
      (moved from pending, resolution note appended)

key-decisions:
  - "STOPPED at Task 2 (checkpoint:decision, gate=blocking) per this plan's launch instructions —
    the operator selects option-a (defer) or option-b (delete now); this agent does not choose"

requirements-completed: []

# Metrics
duration: ~35min (Task 1 only; Task 2 is an unanswered checkpoint)
completed: 2026-09-07
---

# Phase 19 Plan 09 (Task 1 of 2): Sole-Reader Proof and Deletion-Cost Measurement Summary

**Re-proved getDom() reads zero legacy payload blocks against the finished renderer, discharged
both folded legacy-block defects (HeatRisk day-7 drop and hazardsOutlook.dayN offset mislabelling)
as "inert on screen, still in the emitted payload," and freshly measured the probe-suite's
coupling to the eight legacy blocks — call sites 156->172, field assertions 180->198, scenarios
124->157 — for the Task 2 deletion-timing decision. Task 2 itself (the blocking decision
checkpoint) is unanswered; this agent does not select an option.**

This plan has two tasks: Task 1 (`type="auto"`) and Task 2 (`type="checkpoint:decision"`,
`gate="blocking"`). Per this execution's launch instructions, **only Task 1 was executed**. Task 2
is returned to the orchestrator unselected as a structured checkpoint. This SUMMARY therefore
covers Task 1 only; the plan itself is not complete.

## Performance

- **Duration:** ~35 min (Task 1 only)
- **Started:** 2026-09-07 (this agent's spawn, after the mandatory worktree base correction —
  the assigned worktree was stale at `fb18000`; corrected via `git reset --hard` to the required
  base `30a893c201a697a1a98342a7a2f2f20c46b0836b`, which already contains 19-06/19-07/19-08 and
  all four gap-closure commits)
- **Completed:** 2026-09-07
- **Tasks:** 1 of 2 (Task 2 is a checkpoint, not executed by this agent)
- **Files modified:** 3 (2 created, 1 moved-with-edit)

## Accomplishments

- Re-ran the sole-reader static proof against `MMM-SPCOutlook.js` at the current base and got
  `OK: zero legacy accessor strings in comment-stripped MMM-SPCOutlook.js` — confirmed this is
  also the permanent probe scenario `rpt01-getdom-reads-no-legacy-payload-block`
  (`scripts/probe-payload-resilience.js:12385-12409`), which passed in the same suite run.
- Confirmed probe suite state: `157 passed, 0 failed, 0 skipped` — unchanged from the 19-08
  sign-off, no regression from this plan's own work.
- Wrote `19-LEGACY-RETIREMENT.md` with all required sections: Sole-Reader Proof (command +
  verbatim output), Folded Todo discharge (HeatRisk day-7), a second Folded Defect section
  (hazardsOutlook.dayN raw-offset labelling, documented but not fixed by `fb18000`), an RPT-06
  sign-off strength note (rows 1/2/8 have no evidence from either verification leg), and the
  Backend-Emission Deletion Measured Cost section.
- Freshly measured all three planning-time figures against the current tree, with commands and
  verbatim counts, and disclosed a real false-positive in the literal scenario-count grep pattern
  (a `name: "Pixel"` field inside an unrelated fixture at line 400) rather than reporting the raw
  grep number without checking it against the actual run output.
- Discharged the folded HeatRisk todo: moved
  `.planning/todos/pending/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md`
  to `.planning/todos/done/`, appending a resolution note that cites the precise discharge
  mechanism and the still-open backlog item.
- Documented the sibling `hazardsOutlook.dayN` offset defect (raw 0-based offset used as the key,
  so an offset-2/NWS-Day-3 feature cannot be represented at all) as discharged the same way —
  unreachable on screen, not removed from the emitted payload.
- Wrote a scoped backlog item,
  `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`,
  carrying the measured counts, the three affected surfaces, and the note that 19-02/19-06 already
  removed the two reasons the legacy blocks were still load-bearing outside test coupling.

## Task Commits

1. **Task 1: Prove the sole render path, discharge the folded todo, and measure the deletion
   cost** — `0610508` (docs)

Task 2 is unexecuted; no commit exists for it.

## Files Created/Modified

- `.planning/phases/19-unified-day-report-getdom-rewrite/19-LEGACY-RETIREMENT.md` — new. Proof,
  discharge reasoning for both folded defects, sign-off strength note, and measured deletion cost.
  `## Decision` section left explicitly pending — Task 2's job, not this agent's.
- `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`
  — new. Scoped backlog item for the emission-deletion/probe-migration work.
- `.planning/todos/done/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md`
  — moved from `pending/`, resolution note appended in place.

## Decisions Made

- **Reported the freshly measured numbers rather than trusting the plan's literal grep commands
  blind.** The third command (`grep -c "^    name:"`) returns 158, but the probe run itself
  reports 157 scenario results. Cross-checked and found the extra match is a `name: "Pixel"`
  field inside an unrelated ArcGIS-identify fixture helper, not a scenario declaration. Recorded
  both the literal command output (158) and the corrected count (157) in the artifact, rather than
  silently using whichever number was more convenient.
- **Did not choose Task 2's option.** This plan's launch instructions are explicit that Task 2
  must be returned to the orchestrator unselected. No code or artifact changes for Task 2 were
  made (the `## Decision` heading in `19-LEGACY-RETIREMENT.md` exists but is empty).
- **Did not attempt the emission-deletion or probe-suite migration** in either direction — that
  work is explicitly out of scope for this plan regardless of which Task 2 option is eventually
  selected (T-19-40 in the plan's own threat model forbids it).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Worktree HEAD was stale at plan launch**
- **Found during:** the mandatory `<worktree_branch_check>` step, before reading any plan file.
- **Issue:** `git merge-base HEAD 30a893c201a697a1a98342a7a2f2f20c46b0836b` returned `fb180003...`
  (the tip of the assigned worktree, three commits and one merge behind the required base), not
  the required base itself — meaning `30a893c2` was not an ancestor of the assigned worktree's
  HEAD. The 19-08 checkpoint's four gap-closure commits, the RPT-06 sign-off commit, and a docs
  commit were all missing from the worktree as spawned.
- **Fix:** ran `git reset --hard 30a893c201a697a1a98342a7a2f2f20c46b0836b` per the check's own
  prescribed recovery, exactly as the launch prompt's `<worktree_branch_check>` block specifies.
  Working tree was clean beforehand (`git status --short` empty), so nothing was lost.
- **Files modified:** none (working tree only moved to the correct base commit).
- **Verification:** `git rev-parse HEAD` == `30a893c201a697a1a98342a7a2f2f20c46b0836b` after the
  reset; `git log --oneline -15` shows `fb18000`/`87b2a96`/`512a97e`/`a440b31` and the RPT-06
  sign-off commit `04d7776` present in history.
- **Committed in:** N/A (a reset, not a commit — pre-work correction, not a task deliverable).

---

**Total deviations:** 1 auto-fixed (1 blocking — stale worktree base, corrected per the launch
prompt's own explicit recovery instructions before any plan work began).
**Impact on plan:** None on Task 1's substance. Necessary before any measurement in this plan
could be trusted — measuring against a stale base would have re-reported numbers from before
19-06/19-07/19-08 landed.

## Issues Encountered

None beyond the worktree-base correction documented above.

## Threat Flags

None. This plan modified only `.planning/` documentation artifacts (the retirement record and two
todo files) — no new network endpoints, auth paths, file access patterns, or schema changes. The
plan's own threat model (T-19-37 through T-19-40, T-19-SC) already covers the residual risk of the
legacy blocks continuing to traverse the socket unrendered; nothing found here falls outside it.

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

Checked with real commands, not inference:

```
$ test -f .planning/phases/19-unified-day-report-getdom-rewrite/19-LEGACY-RETIREMENT.md && echo FOUND
FOUND

$ test -f .planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md && echo FOUND
FOUND

$ test ! -f .planning/todos/pending/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md && echo GONE
GONE

$ test -f .planning/todos/done/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md && echo FOUND
FOUND

$ git log --oneline --all | grep -q 0610508 && echo "FOUND: 0610508"
FOUND: 0610508

$ node scripts/probe-payload-resilience.js 2>&1 | tail -1
PROBE RESULT: 157 passed, 0 failed, 0 skipped
```

## Next Phase Readiness

- **This plan is NOT complete.** Task 2 (`checkpoint:decision`, `gate="blocking"`) is unanswered
  and must be presented to the operator before Phase 19 can close.
- All measurement inputs Task 2 needs are in `19-LEGACY-RETIREMENT.md`'s
  `## Backend-Emission Deletion — Measured Cost` section.
- Under either Task 2 option, `node scripts/probe-payload-resilience.js` still reports
  `0 failed, 0 skipped` as of this commit — no regression introduced by Task 1.

---

## Deferred Items — for STATE.md

(Ready-to-paste rows for `.planning/STATE.md`'s deferred table, per the worktree-mode override in
this plan's launch prompt — the orchestrator applies these after merge, not this agent. Task 2's
eventual answer may add a further row of its own; not anticipated here.)

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Verification | Backend-emission deletion cost freshly measured for the Task 2 decision (assertPayloadIntact call sites 156->172, legacy-field assertions 180->198, scenarios 124->157) | Recorded in `19-LEGACY-RETIREMENT.md`; awaiting the operator's Task 2 selection (option-a defer / option-b delete now) | Phase 19-09 |
| Correctness | Legacy `hazardsOutlook.dayN` keys labelled by raw 0-based offset, cannot represent an offset-2 (NWS Day 3) feature — discharged (unreachable on screen) but still present in the emitted payload | Backlogged in `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`; resolves when the legacy emission is deleted | Phase 19-09 |
| Correctness | Legacy `heatRisk.day1..day7` block still drops day 7 for ~12h/24h in the emitted payload (the render-path defect is discharged, the emission itself is not deleted) | Same backlog item as above | Phase 19-09 |

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: Task 1 only — 2026-09-07 (Task 2 pending operator decision)*

## Task 2 — Decision recorded (orchestrator, post-checkpoint)

**Selected: option-a — defer the emission deletion to its own follow-up.** Operator decision at the
blocking checkpoint, 2026-09-07. Recorded verbatim under `## Decision` in `19-LEGACY-RETIREMENT.md`.

Plan 19-09 is COMPLETE. Both acceptance criteria for option-a are met:
- The backlog item from Task 1 is confirmed present:
  `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`
- A matching row naming the measured cost and citing `19-LEGACY-RETIREMENT.md` was appended to
  `.planning/STATE.md`'s deferred-items table by the orchestrator (worktree mode leaves STATE.md to
  the orchestrator, per this plan's launch override).
- `node scripts/probe-payload-resilience.js` at plan close: **157 passed, 0 failed, 0 skipped**.

Deferring is not discharging. Both folded defects stay live in the EMITTED payload until the
follow-up lands, though neither is reachable on screen:
- legacy `heatRisk.day1..day7` day-7 drop (`node_helper.js:1152-1153`)
- legacy `hazardsOutlook.dayN` raw-offset labelling (`node_helper.js:915-920`)
