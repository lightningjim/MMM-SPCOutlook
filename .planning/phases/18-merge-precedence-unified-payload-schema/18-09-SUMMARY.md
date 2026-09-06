---
phase: 18-merge-precedence-unified-payload-schema
plan: 09
status: paused
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

# 18-09: Live Capture & Criteria Validation — PAUSED AT BLOCKING CHECKPOINT

## Status

**Paused at the Task 3 blocking human-verify checkpoint.** Tasks 1 and 2 are complete and
committed (`05560ca`, `7471fba`). Task 3 was presented to the operator and answered with a
decision to fix before closing the phase, NOT with "approved". This plan therefore remains
incomplete and Phase 18 remains open.

## Tasks

| Task | Name | Status | Commit |
|------|------|--------|--------|
| 1 | Capture a live payload and validate criteria 1, 2, 4, 5 | Complete | `05560ca` |
| 2 | Record local cold-cache PERF-03 figures, update state | Complete | `7471fba` |
| 3 | Human review of the live capture and honest verdict | **Paused — answered "fix before closing"** | — |

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
2. **Step 6 display-unchanged confirmation** — the operator is performing the live MagicMirror
   render check themselves. Outstanding at the time of writing.

## Outstanding before Phase 18 can close

- [x] MERGE-01 inclusive-endpoint fix in `_addHazardsOutlookGridEntries`, handling both conventions (closed by 18-10)
- [x] Mutation-proven probe scenario using the live-observed `start_date === end_date` shape (closed by 18-10: `merge-grid-hazards-start-equals-end-live-shape-lands-on-its-own-grid-day`)
- [x] Criterion 1 re-validated against the captured payload (closed by 18-12: `18-LIVE-CAPTURE.md`'s "Re-validation after the 18-10 fix" subsection)
- [ ] Operator's step 6 display-unchanged confirmation
- [ ] `18-09` Task 3 checkpoint answered "approved"

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Paused: 2026-09-05*
