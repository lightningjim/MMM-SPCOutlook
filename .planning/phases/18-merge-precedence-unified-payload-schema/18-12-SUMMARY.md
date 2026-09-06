---
phase: 18-merge-precedence-unified-payload-schema
plan: 12
status: complete
subsystem: verification
tags: [live-capture, merge-01, merge-04, gap-closure, checkpoint]

requires:
  - phase: 18-10
    provides: "the corrected _addHazardsOutlookGridEntries emission bound and its two mutation-proven scenarios, cited verbatim as the replay evidence for criterion 1's re-validation"
  - phase: 18-11
    provides: "the toggle-off reportedDays fix and its observed on/off arrays, cited when closing the sources[].reportedDays deferred-items.md entry"
provides:
  - "18-LIVE-CAPTURE.md's Criterion 1 re-validated PASS (honestly labelled a replay of the 2026-09-05 capture, not a fresh live poll), with the original FAIL trace preserved"
  - "18-LIVE-CAPTURE.md's Criterion 4 over-merge half re-decided (still NOT OBSERVABLE, on stated coverage reasoning, not silently carried forward)"
  - "Both deferred-items.md entries closed with Resolved lines naming their closing plans"
  - "STATE.md's MERGE-01 blocker flipped to RESOLVED; ROADMAP.md and REQUIREMENTS.md updated to match"
  - "Operator approval of the re-presented 18-09 Task 3 checkpoint, closing 18-09-SUMMARY.md"
  - "A new pre-existing (non-Phase-18) HeatRisk legacy-display defect, found by the operator during the display check, logged and routed to Phase 19"
affects: [18-09, phase-18-close, 19]
---

# 18-12: Gap Closure Verdict Propagation — COMPLETE

## Status

**Complete.** All three tasks are done and committed. Tasks 1 and 2 (`29198e0`, `95bcf62`)
re-validated criterion 1 PASS and re-decided MERGE-04's over-merge half NOT OBSERVABLE, and
propagated both outcomes across every tracking document. Task 3, the blocking human-verify
checkpoint, was presented to the operator and answered: the live MagicMirror display is confirmed
unchanged (with one separately-logged, pre-existing, non-regression exception — see below), and
the re-presented 18-09 Task 3 checkpoint is **approved**. `18-09-SUMMARY.md`'s `status: paused` has
been flipped to `status: complete` and its Outstanding checklist is fully ticked. All 12 Phase 18
plans are now complete. **Phase-level close (code review, verification, `phase.complete`) remains
the orchestrator's responsibility and has not run.**

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Re-validate criterion 1 and re-evaluate MERGE-04's over-merge half | Complete | `29198e0` |
| 2 | Propagate the outcome to every tracking document | Complete | `95bcf62` |
| 3 | Operator confirmations — live display unchanged, and the 18-09 checkpoint re-answered | Complete — approved | (this plan's closing commit) |

## Task 1 — Criterion 1 and Criterion 4 verdicts

**Criterion 1 (MERGE-01, near-boundary) — PASS (re-validated), FAIL at 2026-09-05 capture time.**
Re-validated via `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day`
(`scripts/probe-payload-resilience.js`), a **deterministic replay** of the captured live values
(`start_date === end_date === 1788998400000`, `idp_filedate 1788639319000`, layer 4, `"estimated"`
anchor, `nominalStartMs 2026-09-05T12:00:00.000Z`) through the real `getSpcOutlook` code path with
a stubbed transport — explicitly **not** a fresh live poll (the Kotzebue "Heavy Rain" feature was
valid for 2026-09-10 and may no longer exist upstream). Corrected arithmetic:
`gridStart 6, gridEnd 6, lastGridDay = Math.max(6, 5) = 6`, emitting on grid day 6 only, agreeing
with the legacy `hazardsOutlook.day5` block's calendar date (`2026-09-10`). The original FAIL trace
(`clampedEnd (5) < clampedStart (6)`) is preserved verbatim in `18-LIVE-CAPTURE.md`, retitled rather
than overwritten. `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 119 passed, 0
failed, 0 skipped`, exit 0.

**Criterion 4 (MERGE-04) — over-merge half re-decided, still NOT OBSERVABLE.** The criterion-1 fix
means Capture 2's `heavy-precip` entry now reaches grid day 6, but no live day carries both a
`flash-flood` and a `heavy-precip` entry simultaneously: `wpc-ero` (`productRegistry.js:299-326`,
WPC's CONUS-only Excessive Rainfall Outlook service) has no coverage at Capture 2's Alaska
coordinate (65.936, -163.443 — the same poll's SPC anchor independently fell back to `"estimated"`
for this reason), and Capture 1's Florence, SC coordinate has no live `wpc-hazards` feature at all.
No `sources['wpc-ero']` block was captured for the Alaska poll in the original 18-09 capture, so
this verdict is reasoned from the registry row and Capture 1's own finding, not a second live
observation — reported as such rather than presented as a captured value. The under-merge half
remains **PASS** (unchanged — Florence, SC grid days 1-2 each carry three distinct-dimension
entries, all `suppressedBy: null`). The existing STATE.md deferral row for the over-merge half is
kept, with its rationale text updated to this coverage reasoning in place of the resolved
"blocked by the MERGE-01 FAIL" attribution.

## Task 2 — Tracking propagation

- `deferred-items.md`: both entries now carry a `**Resolved:**` paragraph — the `reportedDays`
  entry naming plan 18-11 (the `productToggles[row.configFlag] !== true` early return, the
  `merge-sources-disabled-registry-source-reports-no-days` scenario, observed toggle-off arrays
  `[]`/`[]` and toggle-on arrays `[1,2,3,4,5]`/`[1,2,3]`); the MERGE-01 entry naming plan 18-10
  (`Math.max(gridStart, gridEnd - 1)`, both new scenarios, and the note that the general form was
  chosen over this entry's own narrower epoch-equality suggestion because the narrower form would
  still drop a genuine sub-day span).
- `STATE.md`: the `MERGE-01 FAIL` blocker bullet rewritten to `RESOLVED (18-10, gap closure)`,
  preserving the original defect description and adding the fix, the two scenarios, and a pointer
  to the re-validation subsection. The PERF-03 Raspberry Pi milestone blocker (D-19) is untouched.
  Both `Phase 18-09` deferred-items rows are retained; only the MERGE-04 row's rationale text was
  updated. Two new `[Phase 18-10]`/`[Phase 18-11]` Decisions entries added. Current Position
  updated to `Plan: 12 of 12`, `stopped_at`/`last_updated`/`last_activity` updated to reflect this
  session; `progress.total_plans`/`completed_plans` (45/44) were left as-is — they already account
  for the three gap-closure plans and already treat this plan as the one remaining open item,
  matching the convention already established when 18-09 paused.
- `ROADMAP.md`: criterion 1 and criterion 4 each carry a new parenthetical citing the
  re-validation/re-check evidence in `18-LIVE-CAPTURE.md`. The `18-10`/`18-11` plan checkboxes were
  already `[x]` (set by their own completions); `18-09`/`18-12` remain `[ ]`, left for Task 3 and
  the orchestrator respectively.
- `REQUIREMENTS.md`: the `MERGE-01` checkbox was already `[x]` — flipped by 18-10's own automatic
  `requirements.mark-complete` state update, ahead of this plan's own propagation step (recorded
  here as an observed pre-existing state rather than restated as this plan's own action). The
  traceability table row was still stale at `In Progress`; flipped to `Complete` to match.
- `18-09-SUMMARY.md`: the first three `Outstanding before Phase 18 can close` boxes ticked (the
  inclusive-endpoint fix, the mutation-proven scenario, the criterion-1 re-validation), each with a
  parenthetical naming the closing plan. The criterion-1 row in its `Criteria verdicts` table
  updated to the re-validated verdict, preserving that it read FAIL at capture time. `status:
  paused` and the final two Outstanding boxes (operator's display confirmation, Task 3 answered
  "approved") are left untouched — they are Task 3's to close, and Task 3 has not run.

## Task 3 — operator confirmations (verbatim)

Task 3 (`checkpoint:human-verify gate="blocking"`) was presented to the operator with both items
from the plan's `<how-to-verify>`. The operator's real, interactively-given reply, recorded here
verbatim:

> **Item 1 — live display:** Unchanged, with ONE observed difference that the operator and
> orchestrator jointly diagnosed as PRE-EXISTING and NOT caused by this phase (details below).
> Apart from that, the display is confirmed unchanged: same product sections, risk rows, proximity
> badges, no-risk gate behavior, and the cold-start timing block still logs its four D-18 lines once
> at startup.
>
> **Item 2 — criteria verdicts: APPROVED.** The operator accepts, as honestly recorded: criterion 1
> PASS (re-validated by replay, explicitly not a fresh live poll); criterion 2 NOT OBSERVABLE
> (payload) / PASS (code path); criterion 4 PASS (under-merge) / NOT OBSERVABLE (over-merge, on
> coverage reasoning); criterion 5 PASS; criterion 6 deferred to the milestone per D-19. The
> operator did NOT request fresh live confirmation.

**Recorded accurately per item, not as a blanket "no differences observed":** Item 1's answer is
"unchanged, except for one separately-routed pre-existing finding" — not "unchanged" alone. The
exception is detailed in the next section.

**Outcome:** Both items answered, item 2 is an unconditional approval. Per the plan's `<action>`,
`18-09-SUMMARY.md`'s `status: paused` is flipped to `status: complete`, its `## Status` heading and
body record that Task 3 was re-presented after the 18-10/18-11 gap-closure fixes and answered
"approved", its task-table row 3 is updated to Complete, its remaining two Outstanding boxes are
ticked, and `18-09-PLAN.md` is ticked `[x]` in `ROADMAP.md`'s Phase 18 Wave 7 block.

## New finding surfaced during Item 1 — legacy HeatRisk day-7 drop (pre-existing, routed to Phase 19)

While answering Item 1, the operator observed the module rendering only HeatRisk days 1-6 when 7
days of data exist (observed 2026-09-05 19:46 CDT / `2026-09-06T00:46Z` on the deployed mirror).
The orchestrator diagnosed and confirmed the root cause before this plan resumed:

- `_runHeatRiskProduct` (node_helper.js:1153) discards any tuple whose day offset falls outside
  `1..row.days`: `if (d < 1 || d > row.days) continue;`.
- HeatRisk's `idp_validtime` sits at exactly 12:00Z; `_todayUtcMs()` is UTC midnight. During the
  00Z-12Z half of a UTC day, the mosaic's oldest tile resolves to offset 0 and is discarded, and
  nothing then maps to day 7 — the legacy `heatRisk.day1..day7` block carries only 6 days for ~12
  of every 24 hours.
- Verified arithmetic at the observed instant: tiles `2026-09-05T12:00Z .. 2026-09-11T12:00Z` map
  to offsets `0(discarded),1,2,3,4,5,6`.
- **NOT a Phase 18 regression.** Phase 18's unified `days[]` grid is unaffected and already carries
  all seven days — `18-LIVE-CAPTURE.md` line 69 records
  `"heatrisk": {..., "reportedDays":[1,2,3,4,5,6,7], "activeDays":[1,2,3,4,5,6,7], ...}`. 18-03
  deliberately pushes `gridTuples` before this same filter for exactly this reason. `git blame`
  attributes the filter to `feat(17-04)`, which predates Phase 18. Neither 18-10 nor 18-11 writes
  the legacy HeatRisk block — both write only `gridDays`.
- Severity note preserved from node_helper.js:1141's own comment: it justifies the grid-side
  handling by calling a dropped tile "a false negative on a heat-safety product this project's
  value statement forbids outright." The legacy path's day-7 loss is the mirror image of that.

**Operator's routing decision: log it, let Phase 19 fix it.** No production code fix was written
for this in this plan — Phase 19 rewrites the display onto the unified payload, which already
carries all seven days, so a fix on a legacy path Phase 19 removes is not warranted. Recorded in:
- `deferred-items.md`'s new "Legacy `heatRisk.day1..day7` block drops day 7" entry (symptom, root
  cause, the 00Z-12Z window, and the pre-existing/non-regression evidence, in full).
- `.planning/todos/pending/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md`,
  carrying `resolves_phase: 19` frontmatter so it auto-closes when Phase 19 completes and surfaces
  in `/bm:progress` until then.
- `.planning/STATE.md`'s Blockers/Concerns (explicitly marked "NOT a Phase 18 blocker") and Deferred
  Items table.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues were found during Tasks 1-2.

**1. [Rule 3 - GSD mechanics] ROADMAP.md plan/phase progress updated by direct edit, not the
`roadmap.update-plan-progress` SDK call, to avoid an unintended phase-level completion side effect**
- **Found during:** Task 3 close-out (this continuation).
- **Issue:** `roadmap.update-plan-progress 18` scans every summary in the phase directory and ticks
  the phase-level checkbox (`- [ ] **Phase 18: ...**`) plus sets the phase's summary-table row to
  `Complete` with today's date whenever `summaryCount >= planCount`. Once this plan flips both
  `18-09-SUMMARY.md` and `18-12-SUMMARY.md` to non-paused status, the phase directory holds 12/12
  complete summaries, so that call would have marked Phase 18 itself complete — directly
  contradicting the explicit instruction that phase-level close (code review, verification,
  `phase.complete`) remains the orchestrator's responsibility and has not run.
- **Fix:** Ticked `18-09-PLAN.md` and `18-12-PLAN.md` individually in `ROADMAP.md`'s Wave 7/10
  blocks by direct edit, and updated the Phase 18 summary-table row's plan count to `12/12` while
  leaving its Status column `In Progress` and its Date column blank, and leaving the top-level
  `- [ ] **Phase 18: ...**` milestone checkbox unticked. No `roadmap.update-plan-progress` or
  `phase.complete` call was run for Phase 18 in this session.
- **Files modified:** `.planning/ROADMAP.md`
- **Commit:** (this plan's closing commit)

**Total deviations:** 1 (Rule 3, GSD mechanics — no product code affected)
**Impact on plan:** Tasks 1 and 2 executed exactly as specified; Task 3 was presented, answered, and
closed per its `gate="blocking"` action; the one deviation is a documentation-tooling safeguard, not
a change to any success criterion or artifact this plan is required to produce.

## Threat Flags

None — this plan modified no source file and introduced no new network endpoint, auth path, file
access pattern, or schema change at a trust boundary. `git diff --name-only` across all three tasks
lists only files under `.planning/`.

## Known Stubs

None.

## Assumption Drift (advisory)

- **Found during:** Task 3.
- **Planned:** The plan's Task 3 `<action>` anticipated three outcomes for Item 1 — display
  unchanged, a reported regression, or a request for fresh live confirmation — each with its own
  handling.
- **Actual:** The operator's Item 1 answer was a fourth shape: display unchanged for everything
  Phase 18 touches, but with a newly-observed, separately-diagnosed pre-existing defect on a legacy
  path Phase 18 does not touch. This is neither "unchanged" (a blanket claim would misrepresent what
  was seen) nor "regression" (root-caused as predating Phase 18 entirely) nor a request for fresh
  live confirmation of the criterion-1 replay.
- **Why:** Treated as an unchanged-display confirmation for Phase 18's own guarantees (D-01), with
  the new finding logged and routed separately per the operator's own routing decision, rather than
  forcing it into one of the plan's three anticipated buckets or blocking on it. No plan action or
  acceptance criterion is affected — this plan's own `files_modified` never included any legacy
  HeatRisk code, and D-01's byte-for-byte guarantee for what Phase 18 actually changed still holds.

## Outstanding before Phase 18 can close

- [x] MERGE-01 inclusive-endpoint fix in `_addHazardsOutlookGridEntries`, handling both conventions (18-10)
- [x] Mutation-proven probe scenario using the live-observed `start_date === end_date` shape (18-10)
- [x] Criterion 1 re-validated against the captured payload (18-12, this plan)
- [x] MERGE-04's over-merge half re-decided on the evidence, not silently carried forward (18-12, this plan)
- [x] Operator's step 6 display-unchanged confirmation (18-12 Task 3 — approved, with the HeatRisk finding logged separately, not blocking)
- [x] `18-09` Task 3 checkpoint answered "approved" (18-12 Task 3)

All items on this checklist are closed. Plan-level work for Phase 18 (12/12 plans) is complete.
Phase-level close (code review, verification, `phase.complete`) is the orchestrator's next step and
has not run.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Paused: 2026-09-06 (Tasks 1-2)*
*Completed: 2026-09-06 (Task 3 presented, answered "approved", and closed)*

## Self-Check: PASSED

- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-LIVE-CAPTURE.md
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md
- FOUND: .planning/STATE.md
- FOUND: .planning/ROADMAP.md
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-09-SUMMARY.md
- FOUND: .planning/todos/pending/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md
- FOUND: 29198e0 (Task 1 commit)
- FOUND: 95bcf62 (Task 2 commit)
- FOUND: cf96e6a (paused-checkpoint SUMMARY commit)
- Re-ran suite: `node scripts/probe-payload-resilience.js` → PROBE RESULT: 119 passed, 0 failed, 0 skipped
