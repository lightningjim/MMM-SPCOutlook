---
phase: 18-merge-precedence-unified-payload-schema
plan: 09
status: complete
subsystem: verification
tags: [live-capture, merge-01, perf-03, checkpoint]

requires:
  - phase: 18-08
    provides: the 116-scenario mutation-proven probe suite that stands in for anything not observable live
provides:
  - "18-LIVE-CAPTURE.md: a real NOAA payload capture with honest PASS / NOT OBSERVABLE / FAIL verdicts against ROADMAP criteria 1, 2, 4 and 5"
  - "A local cold-cache PERF-03 baseline (backend interval 4004ms, slowest source spc-inline at 2914ms)"
  - "A live-discovered MERGE-01 correctness defect in _addHazardsOutlookGridEntries, logged in deferred-items.md and STATE.md"
affects: [18-gap-closure, 19]
---

# 18-09: Live Capture & Criteria Validation — COMPLETE

## Status

**Complete.** Tasks 1 and 2 completed and committed (`05560ca`, `7471fba`). Task 3 was first
presented to the operator and answered with a decision to fix before closing the phase, NOT with
"approved" — that fix work (plans 18-10 and 18-11) and the re-validation of the affected criteria
(plan 18-12) are now done. Task 3 was re-presented to the operator by plan 18-12 with the
re-validated verdicts and answered **"approved"** (recorded in `18-12-SUMMARY.md`). This plan is
therefore complete.

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Capture a live payload and validate criteria 1, 2, 4, 5 | Complete | `05560ca` |
| 2 | Record local cold-cache PERF-03 figures, update state | Complete | `7471fba` |
| 3 | Human review of the live capture and honest verdict | Complete — re-presented and approved by plan 18-12 | — (see `18-12-SUMMARY.md`) |

## Criteria verdicts

| Criterion | Verdict | Basis |
|-----------|---------|-------|
| 1 — MERGE-01 near-boundary placement | **PASS** (re-validated by 18-12; **FAIL** at 2026-09-05 capture time) | A live `wpc-hazards` "Heavy Rain" feature near Kotzebue, AK with `start_date === end_date === 2026-09-10T00:00:00.000Z` was silently dropped from the unified `days` grid while the legacy `hazardsOutlook.day5` block placed it correctly. Fixed by 18-10 (`Math.max(gridStart, gridEnd - 1)`); re-validated as a deterministic replay of this same capture in `18-LIVE-CAPTURE.md`'s "Re-validation after the 18-10 fix" subsection |
| 2 — MERGE-02 suppression | NOT OBSERVABLE (payload) / PASS (code path) | No `"Severe Weather"` label present live anywhere in the US across all six Hazards Outlook layers. Standing evidence: `merge-precedence-spc-suppresses-wpc-severe-weather` (18-08) |
| 4 — MERGE-04 distinct / duplicate | PASS (under-merge) / NOT OBSERVABLE (over-merge) | Florence, SC grid days 1-2 each carry three distinct-dimension entries (`convective`, `flash-flood`, `heat`), all `suppressedBy: null`. Over-merge blocked by the criterion-1 defect. Standing evidence: `merge-flash-flood-and-heavy-precip-never-cross-suppress` (18-08) |
| 5 — RPT-07 both render levels | **PASS** | Compact and detailed output both derived from the payload alone, no precedence recomputation |

## The MERGE-01 defect

`_addHazardsOutlookGridEntries` (`node_helper.js:2874-2883`) documents and relies on the
assumption that `endDate` is the **exclusive** end of a 00Z-00Z span, so a single-day feature
has `gridEnd = gridStart + 1` and emission runs `gridStart..gridEnd - 1`. When live data returns
`start_date === end_date`, `gridEnd === gridStart`, so `lastGridDay = gridStart - 1`, the clamped
range is empty, and `continue` drops the feature with no diagnostic.

Two facts that shape the fix:

1. **Upstream is not internally consistent.** The same poll returned a Temperature-group
   `"High Winds"` feature with the assumed exclusive shape (`end_date = start_date + 86400000`).
   A fix must handle both conventions, not switch wholesale to inclusive.
2. **The probe suite has a fixture blind spot here.** Every existing fixture uses the exclusive
   convention, including `merge-parity-unified-days-agree-with-legacy-blocks`, which passes. The
   accompanying scenario must use the live-observed `start_date === end_date` shape.

Suggested fix and full live trace: `deferred-items.md` and `18-LIVE-CAPTURE.md`.

## PERF-03 local baseline

Backend interval 4004ms; slowest source `spc-inline` at 2914ms; measured through the real
`socketNotificationReceived("GET_SPC_DATA", ...)` entry point on a development workstation.
No pass/fail target exists — this is a baseline only. Per D-19 the Raspberry Pi hardware figure
remains tracked by the existing STATE.md milestone-close blocker and does not block this phase.

## Operator decisions at the checkpoint

1. **MERGE-01 FAIL** — fix via a gap-closure plan before Phase 18 closes. Not deferred to Phase 19.
2. **Step 6 display-unchanged confirmation** — the operator performed the live MagicMirror render
   check themselves at the re-presented 18-12 Task 3 checkpoint (2026-09-05, ~19:46 CDT). Confirmed
   unchanged versus before the gap-closure run for the display's own guarantees (product sections,
   risk rows, proximity badges, no-risk gate behavior, the four D-18 cold-start timing lines) — with
   one exception the operator separately observed and routed as a pre-existing, non-regression
   finding: the legacy `heatRisk.day1..day7` block renders only 6 of 7 days during the 00Z-12Z UTC
   window because of a `feat(17-04)` filter that predates Phase 18, unrelated to any change this
   phase made. Full detail: `deferred-items.md`'s new HeatRisk entry, `18-12-SUMMARY.md`, and
   `.planning/STATE.md`.
3. **18-12 Task 3 re-answer** — approved. See `18-12-SUMMARY.md` for the verbatim operator reply.

## Outstanding before Phase 18 can close

- [x] MERGE-01 inclusive-endpoint fix in `_addHazardsOutlookGridEntries`, handling both conventions (closed by 18-10)
- [x] Mutation-proven probe scenario using the live-observed `start_date === end_date` shape (closed by 18-10: `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day`)
- [x] Criterion 1 re-validated against the captured payload (closed by 18-12: `18-LIVE-CAPTURE.md`'s "Re-validation after the 18-10 fix" subsection)
- [x] Operator's step 6 display-unchanged confirmation (closed by 18-12 Task 3, 2026-09-05 — unchanged except the separately-logged, pre-existing HeatRisk day-count finding, not a Phase 18 regression)
- [x] `18-09` Task 3 checkpoint answered "approved" (closed by 18-12 Task 3, 2026-09-05)

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Paused: 2026-09-05*
*Completed: 2026-09-05 (Task 3 re-presented and approved by plan 18-12)*
