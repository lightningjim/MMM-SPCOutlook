---
phase: 19-unified-day-report-getdom-rewrite
plan: 01
subsystem: testing
tags: [markdown, planning-artifact, behavior-parity, mutation-testing-adjacent]

# Dependency graph
requires:
  - phase: 18-merge-precedence-unified-payload
    provides: the unified `days[]`/`summary`/`sources[]`/`advisories` payload and the 123-scenario probe baseline this checklist's `baseline_probe_result` field records
provides:
  - "19-PARITY-CHECKLIST.md: the RPT-06 acceptance gate — 35 preserved-behavior rows with verified old-site line references, a backend-only provenance footnote, 10 proximity mode call sites, 4 intentional-change rows, two full manual-run procedures, and an unchecked sign-off block"
affects: ["19-02", "19-03", "19-04", "19-05", "19-06", "19-07", "19-08", "19-09"]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Checklist-before-code: the RPT-06 behavior-parity artifact is built and line-verified against the legacy getDom() before any rewrite line is written, per RESEARCH.md Pitfall 9"

key-files:
  created:
    - .planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md
  modified: []

key-decisions:
  - "Corrected three of RESEARCH.md's own old-site line citations against a fresh full read of MMM-SPCOutlook.js:184-784 rather than transcribing them: row 9's unconfirmed-string line (778-780 -> 778-779, drops the closing brace), row 22's truncateHazardLabel span (623-631 -> 623 + 627-632, includes the function's actual closing brace), row 23's hazardsWeekdayFromDate span (639-646 -> 643-646, drops four comment-only lines), and row 29's HeatRisk loop span (750-763 -> 751-763, drops the enclosing if-statement line)."
  - "Ten Proximity Mode Call Sites documented as their own section per RESEARCH.md Pitfall 4, so a future rewrite that centralizes these into one shared predicate cannot silently drop a per-hazard-type independence guarantee without a checklist row catching it."

requirements-completed: [RPT-06]

# Metrics
duration: ~25min
completed: 2026-09-07
---

# Phase 19 Plan 01: RPT-06 Parity Checklist Summary

**Built the 35-row RPT-06 behavior-parity checklist against a fresh full read of the legacy `getDom()` (MMM-SPCOutlook.js:184-784), correcting four of RESEARCH.md's own line citations and adding the 10 proximity-mode call sites, 4 intentional-change rows, and two paste-ready manual-run procedures — all before any rewrite code exists.**

## Performance

- **Duration:** ~25 min (not machine-timed against an ISO start capture)
- **Completed:** 2026-09-07
- **Tasks:** 2/2 completed
- **Files modified:** 1 created

## Accomplishments

- Read `getDom()` in full (`MMM-SPCOutlook.js:184-784`) and re-verified every one of the 35 preserved-behavior row's `Old site` line references against the current working tree, rather than trusting RESEARCH.md's own citations — found and corrected 4 discrepancies (see Decisions).
- Added the `## Backend-Only Provenance (footnote)` section naming BUG-01, BUG-02, BUG-04, FWXT-05, PROX-01, PROX-02, PROX-05 as payload-adjacent defects with no `getDom()` behavior of their own to preserve.
- Added the `## Ten Proximity Mode Call Sites` section (RESEARCH.md Pitfall 4) with each of the 10 inside/outside-mode decisions' verbatim legacy condition and exact source line.
- Added the `## Intentional Changes (verified-expected, NOT regressions)` register (RPT-04-RELOC, D-07-RELOC, D-03-SKIP, D-08-EXC) so a parity reviewer files these as verified-intentional design rather than investigating them as regressions.
- Wrote both mandatory manual-run procedures (Run A "no risk anywhere", Run B "everything active at once") with fully explicit `config.js` blocks (all nine relevant flags named with literal boolean values) and expected observations cross-referenced to at least 9 distinct preserved-behavior row numbers for Run B.
- Added an unchecked `## Sign-Off` block gating on both Run A/B columns, all 4 intentional changes, and a fresh `0 failed, 0 skipped` probe run.

## Task Commits

Each task was committed atomically:

1. **Task 1: Author the 35-row preserved-behavior checklist** - `b19d382` (docs)
2. **Task 2: Record intentional changes and write the two manual-run procedures** - `cb08641` (docs)

_Note: this plan's `<output>` block instructs creating this SUMMARY.md; no separate plan-metadata commit precedes it since this worktree agent commits SUMMARY.md as part of its own final commit (see below)._

## Files Created/Modified

- `.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md` - RPT-06 acceptance gate: 35 preserved-behavior rows, backend-only provenance footnote, 10 proximity mode call sites, 4 intentional-change rows, two manual-run procedures, unchecked sign-off block

## Decisions Made

- Used the plan's own explicitly-verified anchor list (dowToText, cigLabel, etc.) as authoritative wherever it named a specific function/line, and independently re-verified every remaining row against a full read of `MMM-SPCOutlook.js:184-784` rather than trusting either RESEARCH.md's or the plan's citations blindly. This surfaced four line-reference corrections, documented inline in the checklist's own Notes column so the correction is traceable rather than a silent edit (see key-decisions above for the four specific corrections).
- Kept the checklist's `New site`/`Run A`/`Run B` columns fully empty as instructed — verified via grep that no stray content leaked into these cells before committing.

## Deviations from Plan

None - plan executed exactly as written. The four line-reference corrections described above are not deviations from the plan's action — Task 1's own instructions explicitly required "correcting each `Old site` line reference against the current working tree using PATTERNS.md's verified numbers," and that correction work is exactly what was performed.

## Issues Encountered

- Initial verification (`grep -q -- "PROXUI-02"`) failed because row 12's ID cell was written as the combined string `PROXUI-01/02`, which does not contain `PROXUI-02` as a substring. Fixed by writing the two IDs as `PROXUI-01, PROXUI-02` and re-ran all 20 required-ID checks to confirm every one passes.
- This worktree's HEAD was initially on an earlier commit (`4096c2c`, missing the phase-19 plan set) rather than the required base `f6fc111`. Corrected via the mandated `git reset --hard f6fc111cd42e9334b51894a68b8ff150232a4438` in the `<worktree_branch_check>` step (working tree was clean at the time, confirmed via `git status --short` before resetting).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- The RPT-06 acceptance gate now exists as a literal artifact with empty `New site`/`Run A`/`Run B` tracking columns, ready for 19-04 through 19-06 to fill in the new-site line reference as each behavior lands in the rewritten renderer, and for 19-08 to run the two manual tests and sign off.
- No source file (`MMM-SPCOutlook.js`, `node_helper.js`) was touched by this plan — verified via `git status --short` after both commits showing only the one new planning artifact, and via `node scripts/probe-payload-resilience.js` still reporting the unchanged baseline `123 passed, 0 failed, 0 skipped`.
- No blockers for 19-02 onward.

## Self-Check: PASSED

- FOUND: `.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md`
- FOUND: commit `b19d382` (docs(19-01): author RPT-06 preserved-behavior checklist)
- FOUND: commit `cb08641` (docs(19-01): record intentional changes and manual-run procedures)
- Verified `node scripts/probe-payload-resilience.js` reports `123 passed, 0 failed, 0 skipped` (unchanged baseline, ran after both task commits)
- Verified checklist file has valid YAML frontmatter (parsed successfully) and 212 total lines (exceeds the `min_lines: 90` requirement)

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-07*
