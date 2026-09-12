---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: WPC & CPC Integration + Unified Day Report
status: Awaiting next milestone
stopped_at: v2.0 milestone closed and archived 2026-09-12; awaiting /bm:new-milestone
last_updated: "2026-09-12T16:40:56.104Z"
last_activity: 2026-09-12 — Milestone v2.0 completed and archived
progress:
  total_phases: 7
  completed_phases: 7
  total_plans: 67
  completed_plans: 67
  percent: 100
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-09-12 after v2.0 milestone)

**Core value:** Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.
**Current focus:** Planning the next milestone. v2.0 shipped 2026-09-12 — 7 phases, 67 plans, 37/37 requirements, tagged `v2.0`.

## Current Position

Phase: Milestone v2.0 complete
Plan: —
Status: Awaiting next milestone
Last activity: 2026-09-12 — Milestone v2.0 completed and archived

## Performance Metrics

**Velocity (v1.0 + v1.1 + v1.2 baseline):**

- Total plans completed: 60
- v1.0: 7 phases, 13 plans (8 days)
- v1.1: 3 phases, 3 plans (1 day)
- v1.2: 3 phases, 8 plans, 17 tasks (~8 days, 36 commits)

**By Phase:** v2.0 Phase 14 — 7 plans (5 execution + 2 gap-closure), 3 code-review rounds, 34 fix commits across 2 fix passes.

v2.0 Phase 15 — 9 plans, 7 waves, 2 sessions. Probe suite 15 → 32 scenarios. Verifier PASSED 7/7
requirements, 3 Info findings, 0 blocking. Two live production defects found and fixed: the SPC MD
`http://` allowlist outage and the `getDom` no-risk gate that made MPD invisible.

**Recent Trend:** Phase 15 converged with zero rollbacks across 7 waves — worktree isolation plus a post-merge probe gate before any tracking write. Phase 14 needed three review rounds to converge. Rounds 1-2 reviewed at `standard` depth and each missed cross-file defects; round 3 at `deep` depth found the highest-severity issue in the phase (a total outage rendering as a confident all-clear). Use `--depth=deep` for phases that span node_helper.js and MMM-SPCOutlook.js together.

v2.0 Phase 17 P09 (2026-09-01) — mutation inventory + DATA-03 spot check + human UAT, 2 tasks, 3 files, ~45min plus an operator UAT window on live production hardware. Closes out Phase 17's plan-level work (9/9 plans executed); phase-level close remains the orchestrator's responsibility.

## Accumulated Context

*Pruned at v2.0 close. The full decision log lives in `PROJECT.md`'s Key Decisions table; the full
per-phase record is in `.planning/milestones/v2.0-ROADMAP.md` and the phase SUMMARY files.*

### Durable Lessons (carry into the next milestone)

- **Mutation-prove every probe scenario individually.** A scenario can pass forever while proving
  nothing — either because the assertion observes nothing (the fixture never reached the render
  path) or because the fixture cannot express its own condition. Required mechanism: break the exact
  line the scenario covers, confirm RED with a diagnosable message, restore. Add a precondition
  guard that throws if setup did not produce the state under test, and a control assertion proving
  the gate is not simply never firing.
- **Layout claims are MANUAL ONLY, permanently.** No headless DOM implements CSS layout. A passing
  live check makes a layout claim true, never machine-checkable. Any change to `REGION_CAP_REM` or
  the grid-track mechanism requires another human looking at real hardware.
- **Live verification of location-gated products requires temporarily moving `lat`/`lon`.** Waiting
  for a product to appear over the deployed coordinate is not viable. Verify the substitute
  coordinate with a real point-in-polygon test against the live data — a bounding-box check is not
  sufficient. Restore the production coordinate afterwards and confirm it.
- **Upstream filename conventions are not semantics.** WPC's `_final` suffix means "graphic
  finalized", not "expired"; advisory liveness must come from each candidate's own `ValidEndTi`.
- **Upstream feeds are not internally consistent about endpoint conventions.** The `wpc-hazards`
  feed mixed inclusive/zero-duration and exclusive `end_date` shapes within a single 2026-09-05
  poll. Tolerate both rather than special-casing one.

### Open Blockers/Concerns (carried forward)

- **Multi-instance defects, deliberately unfixed (Phase 14).** `_geoJsonCache` is keyed by URL while
  storing location-resolved risk, and `SPC_DATA_RESULT` carries no instance correlation. Unreachable
  with one instance at one fixed location; **both become live defects the moment a second module
  instance or a second location is configured.** Revisit before any multi-location work.
- **Two helper-global fields sampled per run** (`_unusableFeatureCount`, `_oldestStaleAt`) are safe
  only because CR-03's `_inFlight` guard makes chain overlap unreachable. If that guard is ever
  removed or bypassed, these must be revisited.
- **The window band and the day grid disagree about day numbers for 12 of every 24 hours** — the band
  was never re-anchored to 12Z in Phase 18.
- **The `rpt01` sole-render-path guard is a literal string scan**; bracket, destructure, or alias
  access would evade it (zero violations at HEAD).
- **The SPC inline chain is serial and dominates cold-cache latency** (~55% of total in every Pi run);
  PERF-01 scoped only the new product fetches.

### Pending Todos

- `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`
  — deferred by operator 2026-09-07. Not a pure deletion; see the Deferred Items row below.
- `.planning/todos/pending/2026-09-11-pin-fetchgeojsoncached-network-error-branch.md`
  — pin `fetchGeoJsonCached`'s network-error hard-failure branch.
- Phase 14 IN-01..IN-08 (8 Info/CONVENTION findings) left unfixed. See `14-REVIEW.md`.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| UX | Double-space/missing-space visual artifacts on proximity badge rows | Accepted, revisit if complaints arise | v1.2 close |
| Verification | Human runtime verification for extended fire weather rows (needs live fire season data) | Pending | v1.1 close |
| Scope | WSSI 4-component breakdown (WSSIX-01) | Deferred to v2.x | v2.0 scoping |
| Scope | Precedence-rule configurability, proximity for new products (MERGEX-01/02) | Deferred to v2.x | v2.0 scoping |
| Scope | National Flood Outlook (COVX-01) | Deferred to v2.x | v2.0 scoping |
| Correctness | Multi-instance cache/broadcast isolation (round-2 CR-01/CR-02) | Deferred — unreachable single-instance | Phase 14 close |
| Verification | UAT test 9 (two instances, two locations) | Skipped — not a realistic config for this deployment | Phase 14 close |
| Verification | Live in-season confirmation of HAZ-01's per-day Precipitation bucketing | Deferred — both Precipitation layers (4, 6) returned zero features nationwide on 2026-08-26; the 10 mutation-proven `hazards-*` scenarios built on synthetic fixtures stand as evidence | Phase 16 close |
| Verification | Live confirmation of D-04's full-window guard (a Precipitation feature spanning its layer's exact nominal window routes to the window band, not the day grid) | Deferred — same root cause: no live Precipitation feature exists to observe the guard against | Phase 16 close |
| Verification | Live observation of `idp_filedate` across a weekend, to settle the STACK/FEATURES cadence conflict and potentially tighten D-14's 84h threshold | Deferred — not observable mid-week (2026-08-26 is a Wednesday) | Phase 16 close |
| Verification | Phase 16 human UAT (ROADMAP success criteria C1–C5) on deployed MagicMirror hardware | APPROVED 2026-08-27 — C2, C3 and C4's Drought half observed PASS on the Pi; C1, C4's Flooding half and C5 recorded NOT OBSERVABLE (rows below) | Phase 16 close |
| Verification | Live confirmation of HAZ-04's Flooding half (Flooding labels present in a live payload and suppressed) | Deferred — Flooding labels ride inside the Precipitation layers, which returned zero features nationwide on both 2026-08-26 and 2026-08-27; `hazards-flooding-labels-never-appear-under-any-toggle` stands as evidence | Phase 16 close |
| Verification | Live Hazards-Outlook no-risk-gate behaviour (a window-band entry with every other product NONE must not render 'No Severe Weather Risk') | Not exercised — the 2026-08-27 UAT locations all carried other on-screen risk, and the SPC-quiet coordinate offered late in the session was not run; pinned by the two gate terms' mutation-proven probe scenarios. Same shape as the Phase 15 MPD-01 row above | Phase 16 close |
| Quality | Phase 14 IN-01..IN-08 (Info/CONVENTION findings) | Accepted | Phase 14 close |
| Verification | Live in-season WSSI confirmation (winter product, verified Aug) | Deferred in-season per D-10; 6 `wssi-*` scenarios stand as evidence | Phase 15 close |
| Verification | Live MPD-02 (two concurrent MPDs both rendering) | Not observable on demand; fixture-verified | Phase 15 close |
| Verification | Live MPD-01 no-risk-gate behaviour (advisory-only, all else NONE) | Not exercised by the 2026-08-24 live check — other risk was on screen; pinned by `frontend-advisory-only-is-not-an-all-clear` | Phase 15 close |
| Quality | Phase 15 F1: WSSI tiers above the D-09 floor unexercised (`WSSI_MODERATE/MAJOR/EXTREME_BODY` declared, unconsumed) | Accepted — floor boundary IS pinned, no per-tier branching exists | Phase 15 close |
| Quality | Phase 15 F2: dead helpers `kmzToKmlfilename` / `extractKmlFromKmz` (zero call sites) | Remove in a cleanup pass | Phase 15 close |
| Quality | Phase 15 F3: `wssi-zero-features-out-of-season` structurally-proven, not mutation-proven (no threshold exists to break) | Accepted, disclosed | Phase 15 close |
| Verification | Live confirmation of MERGE-02's payload half (SPC convective + `wpc-hazards` "Severe Weather" both reporting the `convective` dimension on the same day) | Deferred — zero features nationwide carry the label "Severe Weather" across all six live Hazards Outlook layers, 2026-09-05; `merge-precedence-spc-suppresses-wpc-severe-weather` and its siblings (18-08-SUMMARY.md) stand as mutation-proven evidence; the code-path half (inspecting `_resolveGridDayPrecedence`) was completed live and independently confirmed dimension-keyed, never label-matched | Phase 18-09 |
| Verification | Live confirmation of MERGE-04's over-merge half (a `flash-flood` entry and a `heavy-precip` entry on the same day, neither suppressing the other) | Deferred, re-decided at 18-12 after the 18-10 fix — the MERGE-01 blocker is resolved and Capture 2's `heavy-precip` entry now reaches the grid, but no live day carries both dimensions simultaneously: `wpc-ero` (CONUS-only) has no coverage at Capture 2's Alaska coordinate, and Capture 1's CONUS coordinate has no live `wpc-hazards` feature. See `18-LIVE-CAPTURE.md`'s Criterion 4 re-check. `merge-flash-flood-and-heavy-precip-never-cross-suppress` (18-08-SUMMARY.md) stands as mutation-proven evidence | Phase 18-09, re-decided 18-12 |
| Correctness | Legacy `heatRisk.day1..day7` block drops day 7 for ~12h/24h (00Z-12Z UTC window) — pre-existing `feat(17-04)` defect in `_runHeatRiskProduct`'s day-offset filter, confirmed NOT a Phase 18 regression (Phase 18's unified `days[]` grid is unaffected and already carries all 7 days) | Deferred to Phase 19, which removes the legacy path entirely; does not block Phase 18 close | Phase 18-12 (operator live check, 2026-09-05) |
| Verification | Live confirmation of detail-mode convective sub-row content (checklist rows 12-17: categorical/probabilistic/per-hazard-type proximity badges, day-3 dual badge/CIG glyph, days 4-8 asymmetry) | Not confirmed — Run B's Day 1 (SLGT/Marginal) never independently confirmed a rendered detail sub-row despite `dayReportDetail: true`; probe suite (`rpt03-*`) stands as mechanism-level evidence | Phase 19-08 |
| Verification | Live confirmation of SPC MD / WPC MPD advisory band content in the new relocated band (checklist rows 10, 11, 35) | Deferred — no live MD or MPD active during the 2026-09-07 session (`ActiveMD.kmz`: "No Active MDs"; WPC MPD: none); same disposition class as the Phase 15 MPD-01/MPD-02 rows | Phase 19-08 |
| Verification | Live confirmation of HeatRisk render/escaping content above the display floor in the new renderer (checklist rows 29, 31, 32) | Deferred — no above-floor HeatRisk content at either mandatory-run coordinate; qualitatively observed at the operator's home location in a supplementary run outside the two mandatory procedures | Phase 19-08 |
| Verification | Live confirmation of fire-weather day-span/color content within the two mandatory runs specifically (checklist rows 5, 18) | Deferred — neither Eureka CA nor Minot ND carried live fire weather; directly confirmed instead at Casper WY in a supplementary run outside the two mandatory procedures | Phase 19-08 |
| Verification | Live confirmation of the proximity noise-floor/badge-alone `D-08-EXC` exception and rounding (checklist rows 33, 34) | Deferred — no day without a surviving hazard appeared with `proximityWeighting: true` this session | Phase 19-08 |
| Verification | Live confirmation of `SIGN-NOOP` (days 4-8 `sign` stays unrendered) | Deferred — no live SPC convective days 4-8 probRisk content existed nationwide this session ("Predictability Too Low" everywhere) | Phase 19-08 |
| Verification | Live confirmation of hostile/oversized remote label handling (`validHazardColor`/`truncateHazardLabel`/`escapeHtml` guards at the shared compact-segment call site, checklist rows 20-22, 24) against real adversarial or oversized input | Deferred — only benign, short, well-formed live labels observed; guard correctness is probe-mutation-proven only | Phase 19-08 |
| Verification | Live confirmation of the staleness-disqualifies-the-shortcut branch and the `contentMarker` unconfirmed-fallback string (checklist rows 4, 8, 9), including the real `moment().fromNow()` age string | Deferred — `_stale` was never true during the 2026-09-07 session; only the non-stale/confident-string path was exercised | Phase 19-08 |
| Verification | Live confirmation of the retired-construct rows' absence-of-regression beyond the composite all-clear outcome (checklist rows 3, 6, 19) | Deferred — code-structural claims about deleted legacy paths, not independently distinguishable on screen from any implementation producing the same outcome; probe-mutation-proven only | Phase 19-08 |
| Verification | **Checklist rows 1, 2 and 8 have NO evidence from either verification leg** — `MANUAL ONLY` in Probe Coverage (no scenario constructs an unset-`spcrisk` render, an `{error}` render, or a real `moment().fromNow()` age string, which the harness stubs to a constant) AND `NOT OBSERVABLE` in both run columns | Disclosed gap, not blocking — all three are unchanged-verbatim passthroughs. Cheap to close: force the error state with an invalid coordinate, force staleness by pulling the network | Phase 19-08 |
| Operational | Restore the deployed MagicMirror's `lat`/`lon` and config to production values after the Run A/Run B/supplementary substitute-coordinate testing on 2026-09-07 | **RESOLVED 2026-09-07** — operator confirmed the deployed config is back on the OKC production coordinate | Phase 19-08 |
| Correctness | Legacy `hazardsOutlook.dayN` keys are labelled by raw (0-based) offset rather than the 1-based NWS day they hold (`node_helper.js:920`) — cannot represent an offset-2 (NWS Day 3) feature at all; the unified `days[]` grid is unaffected | Documented, not fixed — 19-09 retires the legacy block | Phase 19-08 (gap-closure commit `fb18000`) |
| Verification | Phase 16 `16-VERIFICATION.md` remains `human_needed` | Acknowledged at v2.0 close — `has_blocking_gaps: false`, 5/5 must-haves verified code-side and mutation-proven; the 3 outstanding rows are the live-observation deferrals already listed above (HAZ-01 bucketing, HAZ-04 Flooding half, DATA-02 weekend cadence) | v2.0 close |
| Verification | Phase 14 `14-UAT-FIXTURES.md` flagged by `audit-open` as an unresolved UAT artifact | Acknowledged at v2.0 close — scanner false positive; the file is a fixtures document (live-derived ERO coordinates with a staleness warning), not a UAT result. 0 pending scenarios. Phase 14's UAT was signed off 2026-08-19 | v2.0 close |
| Scope | Pin `fetchGeoJsonCached`'s network-error hard-failure branch | Acknowledged at v2.0 close — `.planning/todos/pending/2026-09-11-pin-fetchgeojsoncached-network-error-branch.md` | v2.0 close |
| Scope | Delete the eight legacy payload blocks from `node_helper.js` and migrate the probe suite off them | **Deferred by operator decision 2026-09-07** (plan 19-09 Task 2, option-a). The unified report is already the sole RENDER path (19-06, gated by `rpt01-getdom-reads-no-legacy-payload-block`); what remains is dead payload weight. Measured cost: 172 `assertPayloadIntact` call sites, 198 legacy-field assertions, 157 scenarios — and `assertPayloadIntact` throws on any undeclared registry row kind, so there is no incremental path, only a whole-suite migration with 15 D-10 mutation proof re-established per scenario. Until it lands, the legacy `heatRisk.day1..day7` day-7 drop and the `hazardsOutlook.dayN` raw-offset labelling both remain live in the emitted payload (unreachable on screen). See `19-LEGACY-RETIREMENT.md` and `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md` | Phase 19-09 |

### Plan Execution Metrics (Phase 18)

*(Misfiled into the Deferred Items table by an earlier append; retained here for velocity data.)*

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 18 P01 | 15min | 2 tasks | 1 files |
| Phase 18 P02 | ~15min | 3 tasks | 1 files |
| Phase 18 P04 | ~20min | 3 tasks | 1 files |
| Phase 18 P05 | ~30min | 3 tasks | 1 files |
| Phase 18 P06 | ~25min | 3 tasks | 2 files |
| Phase 18 P07 | ~35min | 2 tasks | 1 files |
| Phase 18 P08 | ~2h10min | 3 tasks | 1 files |
| Phase 18 P10 | ~1h | 3 tasks | 2 files |
| Phase 18 P11 | ~35min | 2 tasks | 2 files |
| Phase 18 P12 | ~1h05min | 3 tasks | 8 files |

## Session Continuity

Last session: 2026-09-12 — v2.0 milestone closed and archived
Stopped at: Milestone complete. No phase in progress.
Resume file: none — start the next milestone with `/bm:new-milestone`

## Operator Next Steps

- `/clear`, then `/bm:new-milestone` to scope the next version
- `/bm:review-backlog` to review the carried-forward candidates in PROJECT.md
- `/bm:check-todos` to pick up the two pending todos
