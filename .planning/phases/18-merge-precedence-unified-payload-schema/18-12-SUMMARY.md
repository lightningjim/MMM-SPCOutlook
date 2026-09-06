---
phase: 18-merge-precedence-unified-payload-schema
plan: 12
status: paused
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
affects: [18-09, phase-18-close]
---

# 18-12: Gap Closure Verdict Propagation — PAUSED AT BLOCKING CHECKPOINT

## Status

**Paused at the Task 3 blocking human-verify checkpoint.** Tasks 1 and 2 are complete and
committed (`29198e0`, `95bcf62`). Task 3 — the operator's live-display confirmation and the
re-answered 18-09 Task 3 checkpoint — has **not** been presented to or answered by the operator
in this session. This plan therefore remains incomplete, `18-09-SUMMARY.md`'s `status: paused`
is unchanged, and Phase 18 remains open. **This SUMMARY does not claim the plan or the phase is
complete.**

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Re-validate criterion 1 and re-evaluate MERGE-04's over-merge half | Complete | `29198e0` |
| 2 | Propagate the outcome to every tracking document | Complete | `95bcf62` |
| 3 | Operator confirmations — live display unchanged, and the 18-09 checkpoint re-answered | **Not yet presented — awaiting operator** | — |

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

## Task 3 — not yet run

Task 3 is `checkpoint:human-verify gate="blocking"`. It has **not** been presented to the operator
in this session. No operator reply has been recorded. Per this plan's `<action>`, only after the
operator answers both items (the live MagicMirror display confirmation, and the re-answered 18-09
Task 3 criteria checkpoint) should `18-09-SUMMARY.md`'s `status: paused` flip to `status: complete`
and the remaining ROADMAP/Outstanding-checklist boxes be ticked. None of that has happened.

## Deviations from Plan

### Auto-fixed Issues

None — no bugs, missing functionality, or blocking issues were found during Tasks 1-2.

**Total deviations:** 0
**Impact on plan:** Tasks 1 and 2 executed exactly as specified; Task 3 correctly halted for
operator input per its `gate="blocking"` designation.

## Threat Flags

None — this plan modified no source file and introduced no new network endpoint, auth path, file
access pattern, or schema change at a trust boundary. `git diff --name-only` for Tasks 1-2 lists
only files under `.planning/`.

## Known Stubs

None.

## Outstanding before Phase 18 can close

- [x] MERGE-01 inclusive-endpoint fix in `_addHazardsOutlookGridEntries`, handling both conventions (18-10)
- [x] Mutation-proven probe scenario using the live-observed `start_date === end_date` shape (18-10)
- [x] Criterion 1 re-validated against the captured payload (18-12, this plan)
- [x] MERGE-04's over-merge half re-decided on the evidence, not silently carried forward (18-12, this plan)
- [ ] Operator's step 6 display-unchanged confirmation — **awaiting operator (Task 3)**
- [ ] `18-09` Task 3 checkpoint answered "approved" — **awaiting operator (Task 3)**

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Paused: 2026-09-06*

## Self-Check: PASSED

- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-LIVE-CAPTURE.md
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md
- FOUND: .planning/STATE.md
- FOUND: .planning/ROADMAP.md
- FOUND: .planning/REQUIREMENTS.md
- FOUND: .planning/phases/18-merge-precedence-unified-payload-schema/18-09-SUMMARY.md
- FOUND: 29198e0 (Task 1 commit)
- FOUND: 95bcf62 (Task 2 commit)
- Re-ran suite: `node scripts/probe-payload-resilience.js` → PROBE RESULT: 119 passed, 0 failed, 0 skipped
