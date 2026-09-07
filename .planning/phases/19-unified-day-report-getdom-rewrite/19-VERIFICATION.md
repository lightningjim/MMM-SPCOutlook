---
phase: 19-unified-day-report-getdom-rewrite
verified: 2026-09-07T00:00:00Z
status: passed
score: 6/6 must-haves verified (RPT-06 verified with disclosed residual live-verification gaps; see notes)
has_blocking_gaps: false
overrides_applied: 0
deferred:
  - truth: "Live confirmation of RPT-03 detail-mode sub-row content in a real render (checklist rows 12-17)"
    addressed_in: "Already tracked — STATE.md deferred table, Phase 19-08 rows"
    evidence: "19-HUMAN-UAT.md Run B: dayReportDetail was true but no detail sub-row was independently confirmed in the operator transcript; probe suite rpt03-* scenarios stand as mechanism-level evidence"
  - truth: "Loading state, error state, and the real moment().fromNow() stale-age string (checklist rows 1, 2, 8)"
    addressed_in: "Already tracked — STATE.md deferred table, Phase 19-08 row (explicit 'no evidence from either leg' row)"
    evidence: "19-PARITY-CHECKLIST.md Probe Coverage marks all three MANUAL ONLY; both Run A and Run B columns are NOT OBSERVABLE for all three"
  - truth: "Legacy backend payload emission removal (heatRisk day-7 drop, hazardsOutlook.dayN offset mislabelling reaching zero emission)"
    addressed_in: "Explicitly deferred by operator decision at 19-09 Task 2 (option-a)"
    evidence: "19-LEGACY-RETIREMENT.md 'Decision' section; STATE.md deferred row citing the backlog item 2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md"
human_verification:
  - test: "Configure dayReportDetail: true against a live day carrying a single hazard source with SPC proximity/probabilistic detail, and confirm a source-labeled sub-row actually renders beneath the compact header"
    expected: "Sub-row(s) appear per D-05/D-06's layout, with `— Source` attribution and (for convective days 1-3) the tornado/hail/wind icon line"
    why_human: "Run B configured dayReportDetail: true but the operator transcript did not independently confirm a rendered sub-row; this is disclosed uncertainty in 19-HUMAN-UAT.md, not a code-level gap — the probe suite proves the mechanism but not the live DOM output"
  - test: "Induce the loading state (restart the module before first payload arrives), the error state (force a fetch failure), and a stale read (disconnect network) and observe the three corresponding strings/badges"
    expected: "'Loading SPC Outlook...', 'Error: <message>' via textContent, and the ⚠ Stale badge with a real moment().fromNow() age suffix"
    why_human: "Checklist rows 1, 2, 8 have zero evidence from either the probe suite (structurally unreachable — MANUAL ONLY) or the two mandatory manual runs (_stale was never true, no loading/error state was induced this session)"
---

# Phase 19: Unified Day Report — getDom() Rewrite Verification Report

**Phase Goal:** Users see the module's interface reorganized into one merged block per day
(compact by default, expandable via a detail toggle), replacing every prior per-product section,
with zero regressions against four milestones of accumulated display logic.
**Verified:** 2026-09-07
**Status:** passed (with disclosed, already-tracked residual concerns — see "Overall Judgement" below)
**Re-verification:** No — initial verification

This is a goal-backward check against the codebase at `HEAD` (`334d6e6`), not a re-statement of
SUMMARY.md claims. Every claim below was independently re-derived from source, git history, or a
fresh run of the probe suite — none were taken on the SUMMARY/checklist's word.

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria, RPT-01..06)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | RPT-01: one block per day merging all enabled sources; no per-product row sections remain | ✓ VERIFIED | `MMM-SPCOutlook.js:747-794` — single day loop bound on `this.spcrisk.days["1".."14"]`, no per-product block. `grep -c "renderDayBlock\|dayRiskCount\|fireRiskToColor" MMM-SPCOutlook.js` → `0` for all three (confirmed live, not from a summary) |
| 2 | RPT-02: with `dayReportDetail` off (default), each day renders one compact line with hazards inline | ✓ VERIFIED | `MMM-SPCOutlook.js:774-785` — `survivors.map(...)` joined with `" · "`, one `<span>` per day, only rendered when `dayReportDetail`/`autoExpand` conditions are not both false (line 790 gates the *additional* sub-row render, not the compact line itself) |
| 3 | RPT-03: with `dayReportDetail` on, hazards expand into source-labeled sub-rows | ✓ VERIFIED (mechanism); UNCERTAIN (live) | Code: `MMM-SPCOutlook.js:790-792` calls `renderDaySubRows(day)` when `dayReportDetail === true \|\| day.autoExpand === true`. Probe: `rpt03-detail-mode-renders-source-labeled-sub-rows-under-the-compact-header` and 5 sibling `rpt03-*` scenarios pass in the 157-green suite. Live: Run B set `dayReportDetail: true` but the operator transcript did not independently confirm a sub-row rendered on screen (19-HUMAN-UAT.md, "NOT observed despite..." — disclosed, not glossed) |
| 4 | RPT-04: MDs/MPDs/window-spanning Hazards Outlook entries render in one band below all day blocks, never inside a day block | ✓ VERIFIED | `MMM-SPCOutlook.js:796-844` — the advisory loop (line 822-835) and `renderHazardsWindowBand` (line 842-843) both execute strictly after the day loop closes (line 795), reading the promoted top-level `this.spcrisk.windowBand`, not the legacy `hazardsOutlook.windowBand`. Probe: `rpt04-band-renders-below-every-day-block`. Live: Run B directly observed the band beneath Day 1 |
| 5 | RPT-05: correct empty state when no hazard is active from any enabled source | ✓ VERIFIED | `MMM-SPCOutlook.js:679-701` — three-rung ladder: `!this.spcrisk` → loading; `enabledSourceCount === 0` → "No Products Enabled"; `summary.anyHazard === false && !_stale` → `NO_HAZARD_TEXT` ("No Hazards Forecast"); staleness disqualifies the short-circuit (CR-01, line 699) and a `contentMarker` fallback (line 726/851-852) prevents a bare ⚠ badge. Live: Run A directly confirmed the confident all-clear string |
| 6 | RPT-06: zero regressions against BUG-01..04/FWXT-01..05/PROX-01..06/PROXUI-01..05, checked off row-by-row | ✓ VERIFIED, with disclosed residual gap | 35-row checklist: **0 FAIL**, 5 PASS (rows 23/25/26/27/30, each independently corroborated below), 30 NOT OBSERVABLE (each with a specific, non-generic reason — either code-structural invisibility to any UI or live NOAA conditions that day). Probe suite independently re-run by this verifier: `157 passed, 0 failed, 0 skipped`, matching the checklist's `final_probe_result`. See "RPT-06 Sign-Off Honesty Check" below for the row-by-row audit of the 5 PASS claims |

**Score:** 6/6 truths verified at the code/mechanism level. RPT-03's live-render confirmation and
3 of RPT-06's 35 rows (1, 2, 8) carry a genuine, honestly-disclosed live-verification gap — see
"Overall Judgement."

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `MMM-SPCOutlook.js` `getDom()` | Sole render path over the unified `days[]`/`windowBand`/`summary` payload | ✓ VERIFIED | Read in full (lines 191-856). No legacy per-product block reference anywhere |
| `MMM-SPCOutlook.js` legacy renderers | `renderDayBlock`, `dayRiskCount`, `fireRiskToColor` retired | ✓ VERIFIED | `grep -c` for all three returns `0` |
| `scripts/probe-payload-resilience.js` `rpt01-getdom-reads-no-legacy-payload-block` | Permanent regression gate for the sole-render-path claim | ✓ VERIFIED | Read the scenario body (`:12385-12409`). It re-reads the CURRENT `MMM-SPCOutlook.js` from disk at run time (not a fixture snapshot), strips comments, and fails if any of 13 legacy accessor strings (`spcrisk.day1`..`spcrisk.heatRisk`) appear outside a comment. This is a real, live-reading regression gate — a future commit reintroducing a legacy read would fail this scenario, not merely a manual spot-check. Minor limitation noted below (Info) |
| `hazardTaxonomy.js` `SIGNIFICANCE_FLOOR`/`SIGNIFICANCE_NEVER` | Per-dimension significance floor for backend-resolved `autoExpand` | ✓ VERIFIED | `hazardTaxonomy.js:242-247` defines the floor table; consumed by `node_helper.js:_resolveGridDayAutoExpand` (`:3577-3624`) |
| `node_helper.js` `hazardOffsetToDayNumber` | Single named 0-based→1-based conversion, used by `_isFullNominalWindow` | ✓ VERIFIED (backend); ⚠ minor imprecision (frontend) | `node_helper.js:2756-2771` — `_isFullNominalWindow` calls it directly. The frontend's window-band `off()` helper (`MMM-SPCOutlook.js:608`) independently re-implements the identical `+ 1` semantics rather than literally invoking the named backend function (the two run in different processes — a browser-context module cannot `require` `node_helper.js`). The commit message's phrase "one named conversion" is therefore a slight rhetorical simplification; the actual fix (both sides now agree numerically) is correct and verified by the `haz-full-nominal-window-...`/`rpt04-band-day-numbers-are-1-based-...` probe scenarios. Not a functional gap — flagged as Info only |
| `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md` | Backlog item for the deferred legacy-emission deletion | ✓ VERIFIED | File exists, 3895 bytes |
| `.planning/todos/done/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md` | Folded todo moved to done with resolution note | ✓ VERIFIED | File exists in `done/` |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `socketNotificationReceived` | `this.spcrisk` | `this.spcrisk = payload[0]` (`MMM-SPCOutlook.js:167`) | ✓ WIRED | Confirmed the frontend's render state is populated from the real backend socket payload, not a hardcoded fixture |
| `getDom()` day loop | `this.spcrisk.days` | Direct property read, bounded `1..14` | ✓ WIRED | `MMM-SPCOutlook.js:747-748` |
| `getDom()` band | `this.spcrisk.windowBand` (promoted top-level) | `renderHazardsWindowBand(this.spcrisk.windowBand)` | ✓ WIRED | `MMM-SPCOutlook.js:843`; `node_helper.js:5403` confirms `out.windowBand` is populated from `hazardsPayload.windowBand`, not a static empty array |
| `_isFullNominalWindow` | `hazardOffsetToDayNumber` | Direct call | ✓ WIRED | `node_helper.js:2757-2758` |
| `_resolveGridDayAutoExpand` | `SIGNIFICANCE_FLOOR` | Direct property lookup | ✓ WIRED | `node_helper.js:3577-3624` |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full probe suite passes with zero failures/skips | `node scripts/probe-payload-resilience.js` (run once by this verifier) | `PROBE RESULT: 157 passed, 0 failed, 0 skipped` | ✓ PASS |
| Sole-render-path gate specifically passes | `node scripts/probe-payload-resilience.js 2>&1 \| grep rpt01` | `PASS rpt01-getdom-reads-no-legacy-payload-block` | ✓ PASS |
| Legacy renderers structurally absent | `grep -c "renderDayBlock" MMM-SPCOutlook.js` | `0` | ✓ PASS |
| Four gap-closure commits present at HEAD | `git log --oneline \| grep -E "a440b31\|512a97e\|87b2a96\|fb18000"` + source inspection of each | All four present; `wrapper.style.textAlign = "left"` (a440b31), `distinctSources.size >= 2 \|\| hasConvectiveDetail` (512a97e), `NO_HAZARD_TEXT = "No Hazards Forecast"` (87b2a96), `hazardOffsetToDayNumber` wired into `_isFullNominalWindow` and the frontend `off()` `+1` fix (fb18000) | ✓ PASS |
| HEAD matches the phase's final commit | `git log -1 --format="%H"` | `334d6e6313b4259a34fab0f3fd0334f606bd9a05` (the 19-09 Task-2 decision-recording commit, the last commit attributable to this phase) | ✓ PASS |
| No debt markers in phase-touched files | `grep -n -E "TBD\|FIXME\|XXX" MMM-SPCOutlook.js node_helper.js hazardTaxonomy.js scripts/probe-payload-resilience.js` | No output | ✓ PASS |

### RPT-06 Sign-Off Honesty Check

Cross-referenced each of the checklist's 5 PASS claims against `19-HUMAN-UAT.md`'s narrative
operator record (not the checklist's own self-summary):

- **Row 23** (weekday derivation, PASS in Run B): HUMAN-UAT explicitly cites "'Day 1 (Mon)' correctly
  matches 2026-09-07 (a Monday)" — supported.
- **Row 25** (day-grid order/separator, PASS in Run B): HUMAN-UAT cites the operator's verbatim
  screenshot substance "Convective Slight · Flash Flood Marginal" — supported.
- **Row 26** (Extended Hazards heading written once, PASS both columns): Run A supported by
  "the all-clear rendered as exactly one line... correctly suppressing the heading"; Run B
  supported by the verbatim screenshot showing the heading once — supported both ways.
- **Row 27** (window-band entry format, PASS in Run B): supported by the verbatim "(D3)" screenshot
  post-`fb18000`, though the checklist's own note correctly narrows this to the single-day format
  only (the range format was not re-confirmed post-fix) — the PASS is scoped honestly, not
  overclaimed.
- **Row 30** (`showMinorHeat` floor, PASS in Run A): supported by the Eureka CA live HeatRisk read
  (1/1/1/1/0/0/0, all below the floor) producing zero content — a genuine confirmation of the
  1-vs-2 floor's default-off suppression, though the checklist's own note correctly discloses that
  the floor=1 side and null-vs-0 distinction were untested.

No row inspected carries a PASS unsupported by the operator record. The amendment stating rows 1,
2 and 8 have "NO evidence from either leg" is present verbatim in `19-PARITY-CHECKLIST.md`'s
"Reasoning on the NOT OBSERVABLE ratio" section (line ~323) and is accurate: `## Probe Coverage`
marks all three `MANUAL ONLY`, and both `Run A`/`Run B` columns for rows 1, 2, 8 read
`NOT OBSERVABLE`.

### Requirements Coverage

| Requirement | Source | Description | Status | Evidence |
|---|---|---|---|---|
| RPT-01 | ROADMAP SC1 | One block per day, no per-product sections | ✓ SATISFIED | See truths table row 1 |
| RPT-02 | ROADMAP SC2 | Compact single line per day by default | ✓ SATISFIED | See truths table row 2 |
| RPT-03 | ROADMAP SC3 | Detail-mode source-labeled sub-rows | ✓ SATISFIED (code+probe); live confirmation incomplete | See truths table row 3 |
| RPT-04 | ROADMAP SC4 | Non-day-scoped band below day blocks | ✓ SATISFIED | See truths table row 4 |
| RPT-05 | ROADMAP SC5 | Correct empty state | ✓ SATISFIED | See truths table row 5 |
| RPT-06 | ROADMAP SC6 | Zero regressions, checklist-verified | ✓ SATISFIED, disclosed residual gap | See truths table row 6 and honesty check above |

**Bookkeeping note (Info, not a phase gap):** `.planning/REQUIREMENTS.md`'s per-line checkboxes
(lines 51-56) and its "Coverage" table (lines 140-145) show RPT-01, RPT-02, RPT-04, RPT-05 as
`[ ]`/"Pending" despite ROADMAP.md marking Phase 19 fully complete and the code independently
confirming all four are implemented. This is a pre-existing bookkeeping staleness pattern in this
file, not specific to Phase 19 — the same table shows CFG-01/CFG-02/ERO-01/ERO-03 as "Pending" for
Phase 14, which ROADMAP.md also marks complete. Not treated as a phase-19 gap; flagged for the
project to reconcile at its convenience.

### Anti-Patterns Found

None. `grep` for `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` across `MMM-SPCOutlook.js`,
`node_helper.js`, and `hazardTaxonomy.js` returned zero hits.

### Human Verification Required

See frontmatter `human_verification`. Both items are **already disclosed and tracked** in
`19-HUMAN-UAT.md` and `.planning/STATE.md`'s deferred-items table (lines 131, 140) — this
verification did not discover them fresh; it confirms they are accurately represented where the
project already recorded them, rather than silently having disappeared or being overstated as
resolved.

### Deferred Items

See frontmatter `deferred`. All three are pre-existing, explicitly operator-decided or
operator-disclosed deferrals already reflected in `.planning/STATE.md`, not new findings from this
verification pass.

## Overall Judgement — Is the Phase Goal Genuinely Met?

**Yes, with the residual gap stated plainly rather than glossed.**

The phase's load-bearing promise — "the unified day report is the sole render path, no legacy
fallback" (PROJECT.md) — is verified true by direct code inspection, not by trusting the summary:
`grep`-confirmed absence of `renderDayBlock`/`dayRiskCount`/`fireRiskToColor`, and a permanent,
independently-re-run probe scenario (`rpt01-getdom-reads-no-legacy-payload-block`) that re-reads
`MMM-SPCOutlook.js` from disk at test time and would fail on any future regression. This is the
single most important claim of the phase and it holds.

On the 30/35 NOT OBSERVABLE ratio specifically: I consider this **an accepted, disclosed
verification limitation, not a phase failure**, for reasons independently re-derived from the
artifacts (not merely restated from 19-08-SUMMARY's own defense of itself):

1. **Zero FAIL, verified by me, not assumed.** I re-ran the probe suite myself rather than trusting
   the checklist's `final_probe_result` line, and got the identical `157 passed, 0 failed, 0
   skipped`. Every behavior the two live runs *did* exercise worked correctly, including three real
   defects (alignment, wording, day-numbering) found and fixed live during the same checkpoint.
2. **Most NOT OBSERVABLE rows are genuinely code-structural**, not a verification shortfall: a
   retired boolean term or a shared-call-site guard is never independently visible on a screen
   regardless of which coordinate is chosen — the probe suite's mutation-proof (each scenario
   individually reverted and confirmed RED) is the correct evidence class for these, and I
   confirmed several of the cited scenario names actually exist in the current probe file.
3. **The genuinely concerning subset is narrower than 30/35.** Two things stand out from my own
   reading rather than the checklist's framing: (a) rows 1/2/8 have zero evidence from *either*
   verification leg — this is disclosed, low-risk (unchanged-verbatim passthroughs, one of which
   never reaches `innerHTML`), and cheap to close, but it is a real gap; (b) RPT-03 itself — one of
   this phase's own six numbered success criteria — has an inconclusive live observation despite
   `dayReportDetail: true` being configured in Run B. This is disclosed directly in
   `19-HUMAN-UAT.md` rather than papered over, and the probe suite carries 6 `rpt03-*` mechanism
   scenarios, but it means the phase's own success criterion 3 rests more on mechanism-proof than
   the other five.
4. **This is consistent with, not an exception to, project history I could partially verify**:
   STATE.md's deferred table already carries comparably-shaped rows from Phase 15/16/18 closes
   (e.g., WSSI/MPD/HAZ live-confirmation deferrals), which I could see are structurally the same
   "no live condition existed this session" pattern — I did not re-open those phases' own
   verification but their presence in the same table as the Phase 19 rows supports the claim that
   this is standing practice rather than a one-off excuse.

**Net:** no blocking gap. The phase delivers what it promised at the code and mechanism level, with
an honestly disclosed (not hidden, not overstated as resolved) live-verification residual that is
already correctly captured in STATE.md's deferred table. A stricter reviewer could reasonably argue
RPT-03's inconclusive live check and the 3 zero-evidence rows warrant re-opening a narrow gap-closure
pass before calling the milestone fully closed — that is a legitimate judgment call for the human to
make, not something this verification found reason to force.

---

*Verified: 2026-09-07*
*Verifier: Claude (gsd-verifier)*
