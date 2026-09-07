---
phase: 19-unified-day-report-getdom-rewrite
plan: 08
subsystem: testing
tags: [uat, parity-checklist, mutation-testing, magicmirror, rpt-06]

# Dependency graph
requires:
  - phase: 19-06
    provides: the finished getDom() rewrite this plan verifies for parity
provides:
  - "RPT-06 signed off: 35-row parity checklist reconciled, two mandatory manual runs (plus two
    supplementary runs) executed on deployed hardware, four live defects found and fixed"
  - "19-HUMAN-UAT.md: full narrative UAT record with session metadata, gap-closure commits, and
    per-row disposition summary"
affects: [19-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "NOT OBSERVABLE verdict vocabulary with a mandatory concrete reason per row, distinct from
      PASS/FAIL, carried through to a deferred-items table rather than silently dropped"

key-files:
  created:
    - .planning/phases/19-unified-day-report-getdom-rewrite/19-HUMAN-UAT.md
  modified:
    - .planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md

key-decisions:
  - "Signed off RPT-06 despite 30/35 rows being NOT OBSERVABLE this session — zero FAIL, every
    NOT OBSERVABLE has a specific reason (code-structural invisibility or that day's actual live
    weather), and the probe suite (157/157) independently proves mechanism for every row per this
    plan's own two-leg design"
  - "Recorded the plan's own Task 3 automated verify regex as a false-negative bug (it matches all
    80 '| N |' table rows across three unrelated tables, not just the 35 behavior rows) rather
    than injecting fabricated verdict text into the Probe Coverage / Ten Proximity Mode tables to
    force it green"
  - "Flagged the deployed MagicMirror's coordinate restore as NOT CONFIRMED in the operator
    record, rather than assuming Task 2's step 7 was completed"

requirements-completed: [RPT-06]

# Metrics
duration: ~45min (Task 3 only — this is a continuation agent; Task 1 and Task 2 ran in prior
  sessions)
completed: 2026-09-07
---

# Phase 19 Plan 08: RPT-06 UAT Recording and Sign-Off Summary

**Filled all 35 rows of the RPT-06 parity checklist's Run A/Run B columns from the operator's
Task 2 checkpoint record, created 19-HUMAN-UAT.md, and signed off the gate with 5 rows PASS, 30
NOT OBSERVABLE (each with a concrete reason), 0 FAIL — refreshing the probe result to 157
passed/0 failed/0 skipped.**

This is a **continuation agent** covering **Task 3 only**. Task 1 (checklist reconciliation) was
already committed at `5367cc2` in a prior session. Task 2 (the blocking human-verify checkpoint —
the two mandatory manual runs) was answered by the operator in that same checkpoint response,
which also produced four gap-closure commits (`a440b31`, `512a97e`, `87b2a96`, `fb18000`) fixing
real defects found live. This agent recorded those results and signed off the gate; it did not
re-run or re-litigate Task 1 or Task 2.

## Performance

- **Duration:** ~45 min (Task 3 only)
- **Started:** 2026-09-07T18:00:00Z (approx, this agent's spawn)
- **Completed:** 2026-09-07T18:55:39Z
- **Tasks:** 1 (Task 3; Tasks 1-2 completed in prior sessions per the launch prompt)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- Re-ran `node scripts/probe-payload-resilience.js` → `157 passed, 0 failed, 0 skipped` (up from
  154; 3 new scenarios landed with the Task 2 gap-closure commits, all green). Transcribed
  verbatim into `19-PARITY-CHECKLIST.md`'s `final_probe_result` frontmatter.
- Filled `Run A`/`Run B` verdicts for all 35 preserved-behavior rows: 5 rows carry `PASS` in at
  least one column (row 23 weekday derivation, row 25 day-grid separator/order, row 26 Extended
  Hazards heading in both columns, row 27 window-band entry format, row 30 HeatRisk
  `showMinorHeat` floor), 30 rows `NOT OBSERVABLE` with a row-specific reason in `Notes`, 0 `FAIL`.
- Created `.planning/phases/19-unified-day-report-getdom-rewrite/19-HUMAN-UAT.md`: session
  metadata, the two mandatory runs' config blocks and observations, two supplementary runs (fire
  weather at Casper WY, detail-mode/HeatRisk at the operator's home location), the four
  gap-closure commits with hardware re-confirmation status, the Intentional Changes verdict
  table, and a Row Disposition Summary.
- Corrected checklist row 9's `New site`/`Notes` cell for the `87b2a96` string rename
  (`"No Severe Weather Risk"` → `"No Hazards Forecast"`), and added a line-citation drift
  disclosure note (the four gap-closure commits net-added 33 lines to `getDom()`, shifting every
  `New site` line reference at or after `MMM-SPCOutlook.js:597` by roughly +8 to +33).
- Completed `## Sign-Off` with a written justification for signing off despite the high
  `NOT OBSERVABLE` ratio, rather than silently treating a green checkbox as self-evident.
- Flagged (did not resolve) that the deployed MagicMirror's temporary `lat`/`lon` restore is not
  confirmed in the operator record handed to this agent.

## Task Commits

This plan's tasks, across all sessions:

1. **Task 1: Reconcile the checklist against the finished renderer** — `5367cc2` (test, prior
   session)
2. **Task 2: Execute the two mandatory manual runs** — checkpoint, no direct commit; produced 4
   gap-closure commits during the checkpoint response: `a440b31` (fix, alignment), `512a97e`
   (fix, autoExpand amendment), `87b2a96` (fix, all-clear string rename), `fb18000` (fix, band day
   numbering)
3. **Task 3: Record the UAT results and sign off the checklist** — `04d7776` (test, this session)

## Files Created/Modified

- `.planning/phases/19-unified-day-report-getdom-rewrite/19-HUMAN-UAT.md` — new. Full UAT
  narrative record: session metadata, per-run observations, gap-closure commits, intentional
  changes verdicts, row disposition summary, deferred items staged for STATE.md.
- `.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md` — modified.
  `final_probe_result` refreshed (154→157), `status` set to `signed-off`, all 35 rows' `Run
  A`/`Run B` columns and `Notes` cells filled, row 9's string-rename correction, a line-citation
  drift disclosure note, and a fully written `## Sign-Off` section with reasoning.

## Decisions Made

- **Signed off RPT-06 rather than filing Open Gaps**, despite 30/35 rows and 2/5 intentional
  changes being `NOT OBSERVABLE`. Rationale (also written into the checklist's Sign-Off section):
  zero `FAIL`; every `NOT OBSERVABLE` traces to either a code-structural claim no live coordinate
  can make independently visible (9 rows: retired terms, shared-guard call sites, day-loop bound)
  or a specific live condition NOAA simply wasn't reporting on 2026-09-07 (stale cache, active
  MD/MPD, a below-significance-floor detail render, a proximity-only day); the probe suite
  (157/157, mutation-proven) supplies the mechanism-proof leg the plan's own two-leg design
  requires; and this matches the standing Phase 15/16/18 precedent of closing with a comparably
  sized deferred set rather than blocking on conditions no session can force.
- **Did not upgrade Row 9 (contentMarker fallback) to PASS** even though the operator directly
  observed the confident all-clear string rendering correctly. Traced the actual code path: Run
  A's `_stale === false` case fires the earlier short-circuit gate (`MMM-SPCOutlook.js:699-701`)
  directly, never reaching the `contentMarker` capture/compare/fallback logic (line 726, 851-852)
  that row 9 specifically describes. Recorded `NOT OBSERVABLE` with this reasoning rather than
  crediting a code path that never executed.
- **Did not upgrade rows 12-17 (detail-mode convective content)** despite Run B configuring
  `dayReportDetail: true`. The operator's transcript shows only the compact line and band for Day
  1 — no detail sub-row is recorded as having rendered. Rather than assume the sub-row rendered
  but simply wasn't transcribed, or assume it didn't render at all (which would suggest
  `dayReportDetail`'s global-override OR-clause at `MMM-SPCOutlook.js:790` isn't taking effect),
  recorded this as disclosed uncertainty in `19-HUMAN-UAT.md` and marked the affected rows
  `NOT OBSERVABLE` rather than guessing either way.
- **Treated the two supplementary runs (Casper WY fire weather, home-location detail/HeatRisk) as
  corroborating evidence in `Notes`, not as upgrades to the `Run A`/`Run B` column verdicts**,
  since those columns are specifically scoped to the Eureka CA / Minot ND procedures by name.
- **Did not modify the plan's `<verify><automated>` regex** even though it's overly broad (see
  Deviations below) — treated it as a plan-authoring bug to document, not a target to satisfy by
  fabricating verdict text in unrelated tables.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Task 3's automated verify regex matches unrelated tables**
- **Found during:** Task 3, running the plan's own `<verify><automated>` command
- **Issue:** The command `c.split('\n').filter(l=>/^\| [0-9]+ \|/.test(l))` matches every
  numbered table row in the checklist document, not just the 35-row Preserved Behaviors table —
  it also catches the 10-row Ten Proximity Mode Call Sites table and the 35-row Probe Coverage
  table (80 rows total). Since it then requires every matched row to contain
  `PASS|NOT OBSERVABLE|FAIL`, running it as literally written against a correctly-filled checklist
  fails with "45 rows have no Run verdict" — the 45 being the unrelated tables' rows, which
  correctly do NOT contain verdict text (they were never supposed to).
- **Fix:** Did not modify the checklist to inject fabricated `PASS`/`NOT OBSERVABLE` text into the
  Probe Coverage or Ten Proximity Mode tables (that would violate T-19-33/T-19-34's honesty
  requirements far more than a documented script limitation). Instead ran a properly-scoped check
  restricted to the 10-field Preserved Behaviors table rows specifically (see below), confirmed
  all 35 rows carry a verdict in both columns with 0 unfilled, and verified this satisfies the
  plan's own literal `acceptance_criteria` wording ("Every one of the 35 checklist rows carries a
  ... verdict in both the Run A and Run B columns"), which is unambiguous and does not reference
  the other two tables.
- **Files modified:** None (this is a deviation in verification method, not a code/doc fix)
- **Verification:**
  ```
  node -e "... fields.length !== 10 filter ..." → "behavior rows found: 35" / "unfilled: 0" /
  "SCOPED CHECK: OK"
  ```
  The plan's literal command, run unmodified, does report failure — this is disclosed rather than
  hidden. See the Self-Check section below for both outputs.
- **Committed in:** N/A (verification-only; no code change required)

---

**Total deviations:** 1 auto-fixed (1 bug — verify script false negative, worked around by
running a correctly-scoped equivalent check rather than modifying the checklist to satisfy an
overly broad automated check)
**Impact on plan:** No scope creep; no product/checklist content was altered to game the check.
The actual acceptance criteria (35 rows, both columns filled, honest verdicts) is met and
independently confirmed.

## Issues Encountered

- **Line-number drift in `New site` citations.** The four Task 2 gap-closure commits net-added 33
  lines to `getDom()` at and after `MMM-SPCOutlook.js:597`, shifting every `New site` citation in
  rows established by Task 1 (which ran before those commits) by roughly +8 to +33 lines. Full
  per-row re-verification was judged out of Task 3's scope (recording the UAT and signing off, not
  re-running Task 1's line-by-line audit) and is disclosed as a note in the checklist rather than
  silently left stale or silently fully re-audited beyond this plan's assigned scope. Row 9's
  citation WAS corrected, since its underlying string literal changed (not just its line number)
  and leaving the old string text would have directly contradicted the UAT record.
- **Detail-mode ambiguity in Run B.** `dayReportDetail: true` was configured for Run B but the
  operator's transcript does not show a detail sub-row for Day 1. Code inspection
  (`MMM-SPCOutlook.js:790`) shows the global override should apply regardless of auto-expand. This
  agent could not resolve whether the sub-row rendered but wasn't transcribed, or genuinely didn't
  render — see "Decisions Made" above. Recorded as disclosed uncertainty, not resolved as a defect
  (would require re-litigating Task 2, out of this agent's scope) and not silently assumed either
  way.
- **Coordinate restore not confirmed.** The operator record provided to this agent never states
  that `lat`/`lon` were restored to production values after the substitute-coordinate testing.
  Flagged explicitly in `19-HUMAN-UAT.md` and staged as a deferred item below rather than assumed
  complete.

## Threat Flags

None. This plan modified only `.planning/` documentation artifacts (the checklist and the new UAT
record) — no new network endpoints, auth paths, file access patterns, or schema changes.

## Assumption Drift (advisory)

- **Planned assumption:** Run A/Run B's `Run A`/`Run B` checklist columns would primarily record
  `PASS` verdicts for behaviors the operator directly witnessed during the two named procedures.
- **What turned out true:** the vast majority of rows (30/35) are code-structural claims or
  require live conditions (staleness, active MDs/MPDs, hostile input, a proximity-only day) that
  a single quiet-weather session at two coordinates cannot exercise — regardless of how carefully
  the coordinates are chosen. Only 5 rows had a verdict directly supportable by what was actually
  on screen.
- **Why:** the 35-row checklist enumerates code-level behaviors (many "closed by construction" or
  guard-against-hostile-input claims) alongside genuinely observable UI behaviors; live NOAA data
  on any given day only exercises a narrow slice of either category. This is disclosed in the
  Sign-Off reasoning rather than silently smoothed over by treating "the operator didn't report a
  problem" as equivalent to "the operator confirmed this specific row."

## User Setup Required

None - no external service configuration required.

## Self-Check: PASSED

Checked with real commands, not inference:

```
$ test -f .planning/phases/19-unified-day-report-getdom-rewrite/19-HUMAN-UAT.md && echo FOUND
FOUND: 19-HUMAN-UAT.md

$ git log --oneline --all | grep -q 04d7776 && echo "FOUND: 04d7776"
FOUND: 04d7776

$ node scripts/probe-payload-resilience.js 2>&1 | tail -1
PROBE RESULT: 157 passed, 0 failed, 0 skipped

$ node -e "<properly-scoped 35-row check>"
behavior rows found: 35
unfilled: 0
SCOPED CHECK: OK

$ node -e "<plan's literal <verify><automated> command, unmodified>"
Error: 45 rows have no Run verdict
```

The plan's literal automated verify command DOES fail as written (regex bug documented above);
the properly-scoped equivalent — and the plan's own literal `acceptance_criteria` text — both
pass. This is reported honestly rather than glossed over.

## Next Phase Readiness

- RPT-06 is signed off. Plan 19-09 (which retires the legacy `hazardsOutlook.dayN` block per the
  `fb18000` commit's own "documented but not fixed" note) can proceed.
- The deferred items below should be applied to `.planning/STATE.md` by the orchestrator after
  merge (this agent did not write STATE.md per the worktree-mode instruction).
- **Operational follow-up before the deployed mirror is considered production-configured again:**
  confirm on `ssh mm` that `lat`/`lon` were restored from the substitute testing coordinates
  (Eureka CA / Minot ND / Casper WY / the operator's home location) back to the deployed
  production values — this was not confirmed in the operator record handed to this agent.

---

## Deferred Items — for STATE.md

(Ready-to-paste rows for `.planning/STATE.md`'s deferred table, per the worktree-mode override in
this plan's launch prompt — the orchestrator applies these after merge, not this agent.)

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Verification | Live confirmation of detail-mode convective sub-row content (checklist rows 12-17: categorical/probabilistic/per-hazard-type proximity badges, day-3 dual badge/CIG glyph, days 4-8 asymmetry) | Not confirmed — Run B's Day 1 (SLGT/Marginal) never independently confirmed a rendered detail sub-row in the operator's transcript despite `dayReportDetail: true`; probe suite (`rpt03-*` scenarios) stands as mechanism-level evidence | Phase 19-08 |
| Verification | Live confirmation of SPC MD / WPC MPD advisory band content in the new relocated band (checklist rows 10, 11, 35) | Deferred — no live MD or MPD was active during the 2026-09-07 session (`ActiveMD.kmz`: "No Active MDs"; WPC MPD: none); same disposition class as the Phase 15 MPD-01/MPD-02 rows | Phase 19-08 |
| Verification | Live confirmation of HeatRisk render/escaping content above the display floor in the new renderer (checklist rows 29, 31, 32) | Deferred — no above-floor HeatRisk content at either mandatory-run coordinate this session; qualitatively observed at the operator's home location in a supplementary run outside the two mandatory procedures | Phase 19-08 |
| Verification | Live confirmation of fire-weather day-span/color content within the two mandatory runs specifically (checklist rows 5, 18) | Deferred — neither Eureka CA nor Minot ND carried live fire weather; directly confirmed instead at Casper WY in a supplementary run outside the two mandatory procedures | Phase 19-08 |
| Verification | Live confirmation of the proximity noise-floor/badge-alone `D-08-EXC` exception and rounding (checklist rows 33, 34) | Deferred — no day without a surviving hazard appeared with `proximityWeighting: true` this session | Phase 19-08 |
| Verification | Live confirmation of `SIGN-NOOP` (days 4-8 `sign` stays unrendered) | Deferred — no live SPC convective days 4-8 probRisk content existed nationwide this session ("Predictability Too Low" everywhere) | Phase 19-08 |
| Verification | Live confirmation of hostile/oversized remote label handling (`validHazardColor`/`truncateHazardLabel`/`escapeHtml` guards at the shared compact-segment call site, checklist rows 20-22, 24) against real adversarial or oversized input | Deferred — only benign, short, well-formed live labels were observed; guard correctness is probe-mutation-proven only | Phase 19-08 |
| Verification | Live confirmation of the staleness-disqualifies-the-shortcut branch and the `contentMarker` unconfirmed-fallback string (checklist rows 4, 8, 9), including the real `moment().fromNow()` age string | Deferred — `_stale` was never true during the 2026-09-07 session; only the non-stale/confident-string path was exercised | Phase 19-08 |
| Verification | Live confirmation of the retired-construct rows' absence-of-regression beyond the composite all-clear outcome (checklist rows 3, 6, 19) | Deferred — these are code-structural claims about deleted legacy paths, not independently distinguishable on screen from any implementation producing the same outcome; probe-mutation-proven only | Phase 19-08 |
| Operational | Restore the deployed MagicMirror's `lat`/`lon` and config to production values after the Run A/Run B/supplementary substitute-coordinate testing on 2026-09-07 | **NOT CONFIRMED as done** — the operator record handed to this Task 3 agent does not state the restore occurred; verify on `ssh mm` before treating the live mirror as production-configured again | Phase 19-08 |
| Correctness | Legacy `hazardsOutlook.dayN` keys are labelled by raw (0-based) offset rather than the 1-based NWS day they hold (`node_helper.js:920`) — cannot represent an offset-2 (NWS Day 3) feature at all; the unified `days[]` grid is unaffected | Documented, not fixed — 19-09 retires the legacy block | Phase 19-08 (gap-closure commit `fb18000`) |

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-07*
