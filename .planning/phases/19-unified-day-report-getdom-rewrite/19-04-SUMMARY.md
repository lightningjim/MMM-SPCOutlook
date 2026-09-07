---
phase: 19-unified-day-report-getdom-rewrite
plan: 04
subsystem: ui
tags: [magicmirror, getdom, unified-day-report, xss-guards, mutation-testing]

# Dependency graph
requires:
  - phase: 19-unified-day-report-getdom-rewrite
    provides: "19-01's parity checklist, 19-02's unified proximity subtree on days[1-3], 19-03's days[n].autoExpand"
provides:
  - "getDom() head reading only this.spcrisk.days/.summary for the empty-state ladder and day content, with the advisory/window-band code unchanged in its legacy position"
  - "One compact line per surviving day (RPT-01/RPT-02), dimension-worded, dot-separated, driven by daySurvivors()/dayProximityOnly() — the D-08 proximity-only exception included"
  - "showMinorHeat's display floor re-homed into daySurvivors() (RPT-06 checklist row 30), since the legacy heatRiskDaysToRender it lived in is retired"
  - "A shared unifiedPayload(overrides) probe fixture and ten legacy frontend-* scenarios rebuilt onto it, plus six new scenarios pinning the empty-state ladder, compact grammar, D-08 and WR-02 closure — each individually mutation-proven"
affects: [19-05-detail-mode, 19-06-band-relocation, 19-08-sign-off]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Empty-state ladder reads summary.enabledSourceCount/anyHazard once; a missing/malformed summary falls through to the main render branch rather than a dedicated branch, so contentMarker's existing defense-in-depth (not a new mechanism) supplies the unconfirmed fallback"
    - "daySurvivors(day)/dayProximityOnly(day) declared once, called from both the render-decision site and the render body (WR-04's shared-predicate rule), matching the discipline node_helper.js's own precedence loop already uses"
    - "One call-site class for escapeHtml(truncateHazardLabel(...))/validHazardColor(...) across every compact segment, regardless of which of the six day sources produced it (WR-06 — collapsing two hazard call sites into one, per this plan's own render-mechanism decision)"

key-files:
  created: []
  modified:
    - MMM-SPCOutlook.js
    - scripts/probe-payload-resilience.js
    - .planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md

key-decisions:
  - "Kept wrapper.innerHTML += string concatenation (plan's own binding render-mechanism decision) — no createElement/appendChild, no DOM-stub rewrite."
  - "The anyHazard===false short-circuit additionally requires !this.spcrisk._stale (mirroring the legacy gate's own disqualification, not the plan action bullet's literal ternary phrasing) so the ⚠ badge always renders before the unconfirmed string is ever shown, per UI-SPEC's Global Stale Badge section and RPT-06 checklist rows 4/9."
  - "Re-homed showMinorHeat's 1-vs-2 category floor into daySurvivors() for heatrisk-sourced entries only (RPT-06 checklist row 30) — the plan's own action text didn't name this, but Task 2 lists row 30 among the rows this task must carry forward, and the legacy heatRiskDaysToRender that owned this floor is retired by this same task."
  - "Retired hasAnyRenderableProximity, dayRiskCount, blockHasRisk, cigLabel, fireRiskToColor, heatRiskDaysToRender, renderDayBlock, renderHazardsDays, renderableDayHazards, hazardsOutlookHasAnyDay, hazardsOutlookHasWindowEntries as dead code — each one's only call site was one of the seven legacy render sections or the retired gate this task explicitly removes."
  - "A frontend instance whose own config diverges from the backend state that produced summary.anyHazard (the WR-09 multi-instance edge case) now degrades to the honest '(unconfirmed)' string instead of a confident all-clear, since anyHazard travels with the payload as one backend-computed value rather than being re-derived from config at render time. Updated one legacy scenario's control to expect this."

requirements-completed: [RPT-01, RPT-02, RPT-05, RPT-06]

# Metrics
duration: ~85min
completed: 2026-09-07
---

# Phase 19 Plan 04: Rewrite getDom()'s head and day loop around the unified payload Summary

**`getDom()`'s empty-state ladder and day-render loop now read only `this.spcrisk.days`/`.summary`; one compact, dimension-worded line per surviving day replaces seven legacy per-product render sections, with the advisory/window-band code untouched in its legacy position — probe suite 128 → 134 passed, 0 failed.**

## Performance

- **Duration:** ~85 min
- **Started:** ~2026-09-07T02:50Z (after worktree branch reset to `3195724`)
- **Completed:** 2026-09-07T03:40:10Z (last task commit, before this plan-metadata commit)
- **Tasks:** 3 (all executed)
- **Files modified:** 3 (`MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`, `19-PARITY-CHECKLIST.md`)

## Accomplishments
- **Task 1:** Added `dayReportDetail: false` to `defaults`; relocated `validHazardColor`, `truncateHazardLabel`/`HAZARDS_LABEL_MAX_CHARS`, `hazardsWeekdayFromDate` above every render branch; added `DIMENSION_LABELS` (8 keys) and `SOURCE_SHORT_NAMES` (6 keys) beside `ADVISORY_SOURCES`; replaced the ~15-term no-risk boolean expression with the UI-SPEC decision ladder (loading → error → `enabledSourceCount === 0` → `anyHazard === false && !_stale` → main render); moved the stale badge to render first, above all content, with `contentMarker` kept as defense in depth.
- **Task 2:** Deleted all seven legacy per-product day render sections (day1-3, extended days 4-8, fire weather, the ERO/WSSI per-day renderer, the HeatRisk loop, the HazardsOutlook day3-14 grid) and replaced them with one `for (let n = 1; n <= 14; n++)` loop over `this.spcrisk.days`, driven by `daySurvivors(day)`/`dayProximityOnly(day)`. D-08's proximity-only exception renders the badge alone with the byte-exact two-space gap. The advisory band and the Hazards Outlook window band (`renderHazardsWindowBand`) are untouched and stay in their legacy position — only the retired day-grid call (`renderHazardsDays`) was removed from that block's call site.
- **Task 3:** Added a shared `unifiedPayload(overrides)` fixture builder and `hazardsWindowBandIsRenderable(block)` (mirroring `getDom()`'s own `renderableWindowEntries`), rebuilt ten legacy `frontend-*` scenarios onto the unified payload shape (see Deviations), and added six new scenarios pinning RPT-05's ladder, RPT-02's compact grammar, D-08, and WR-02 closure. All seven specified mutations individually applied, observed RED, and restored (see Mutation Proofs).
- Discovered and fixed a real gap during Task 2: RPT-06 checklist row 30 (`showMinorHeat`'s display floor) has no home in the plan's own action text once `heatRiskDaysToRender` is retired — re-homed the exact 1-vs-2 floor into `daySurvivors()` for `heatrisk`-sourced entries specifically (see Deviations).
- `grep -c "renderDayBlock" MMM-SPCOutlook.js` → `0`; `grep -c "dayReportDetail" node_helper.js` → `1`, a pre-existing plan-19-03 comment describing the same config flag conceptually, not new wiring (see Deviations).
- Probe suite: **134 passed, 0 failed, 0 skipped** (up from the wave-2 baseline of 128).

## Task Commits

Each task was committed atomically:

1. **Task 1 + Task 2 (combined — both rewrite the same `getDom()` function and cannot be meaningfully split after the fact): Rewrite getDom()'s head and day loop** — `143184e` (feat)
2. **Task 3: Mutation-prove the empty states, the compact grammar, and WR-02 closure** — `2d94e97` (test)
3. **Follow-up fix: reword a comment so no literal `renderDayBlock` survives the plan's own top-level verification grep** — `ef3245e` (fix)

**Plan metadata:** (this commit, made by the orchestrator after merge — worktree mode does not update STATE.md/ROADMAP.md per this plan's instructions)

## Files Created/Modified
- `MMM-SPCOutlook.js` — `getDom()` rewritten: new empty-state ladder, relocated guard helpers, `DIMENSION_LABELS`/`SOURCE_SHORT_NAMES`, `daySurvivors`/`dayProximityOnly`, the unified compact day loop, retirement of seven legacy render sections and their now-dead helper functions.
- `scripts/probe-payload-resilience.js` — `unifiedPayload`/`hazardsWindowBandIsRenderable` fixture helpers; ten legacy `frontend-*` scenarios rebuilt onto the unified payload shape; six new scenarios (`rpt05-no-products-enabled-is-not-an-all-clear`, `rpt05-stale-quiet-payload-renders-unconfirmed-under-the-badge`, `rpt02-compact-line-renders-dimension-worded-dot-separated-segments`, `rpt02-compact-line-skips-days-with-no-survivor`, `rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap`, `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color`).
- `.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md` — `New site` column filled for rows 6, 12, 19, 20, 21, 22, 23, 25, 29, 30, 31, 33, 34; row 20 and row 31 marked closed-by-construction; row 25's separator change and row 12's inside-mode relocation noted as intentional/pending-19-05.

## Decisions Made
See frontmatter `key-decisions` for full detail. Summary:
- Render mechanism stayed `innerHTML +=` string concatenation per the plan's own binding decision.
- The confident all-clear short-circuit requires `!this.spcrisk._stale` explicitly (not just `anyHazard === false`), so a stale+quiet payload always reaches the main branch and shows the ⚠ badge with "(unconfirmed)" beneath it via `contentMarker`, rather than a bare "(unconfirmed)" string with no badge.
- `showMinorHeat`'s floor re-homed into `daySurvivors()`, gated to `source === "heatrisk"` entries only.
- Dead-code retirement of eight now-unreachable legacy helpers, as a direct consequence of this task's own specified deletions (not a speculative extra scope decision).

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] `showMinorHeat`'s display floor had no home in the new architecture**
- **Found during:** Task 2, while replacing the legacy day sections.
- **Issue:** The legacy `heatRiskDaysToRender(block, showMinorHeat)` was the SOLE shared derivation for both the old no-risk gate's HeatRisk term and the HeatRisk render loop (D-03). Task 2's action text never mentions `showMinorHeat` at all, but the parity checklist explicitly lists row 30 (`showMinorHeat` floor) among the rows this task must carry forward ("at minimum" rows 6, 12, 19, 20, 21, 22, 23, 25, **29, 30, 31**, 33, 34). Without re-implementing the floor, a Category-1 "Minor" heat entry (which the backend's own `NO_RISK_FLOOR` already admits to the payload, per D-13) would render unconditionally in the compact line even with `showMinorHeat: false` (the default) — a real, immediately-visible behavior regression for any CONUS user during summer.
- **Fix:** Added the 1-vs-2 floor directly inside `daySurvivors(day)`, filtered to `h.source === "heatrisk"` entries only (leaving `wpc-hazards`'s binary "Hazardous Heat" — which has no severity ladder — untouched), matching D-01/D-02(17)'s exact thresholds.
- **Files modified:** `MMM-SPCOutlook.js`.
- **Verification:** New scenario `frontend-heatrisk-minor-floor-is-not-a-blank-module` (rebuilt onto the unified grid) exercises both arms; probe suite green.
- **Committed in:** `143184e` (Task 1+2 commit).

**2. [Rule 1 - Bug] The empty-state ladder's staleness handling initially skipped the ⚠ badge**
- **Found during:** Task 1, first probe run after the rewrite (10 failures, all `No Severe Weather Risk (unconfirmed)` with no badge visible in several legacy scenarios).
- **Issue:** A literal reading of the plan's action bullet ("`anyHazard === false` → ... `'No Severe Weather Risk (unconfirmed)'` when [`_stale`] is [true]") as a single ternary branch would set `wrapper.innerHTML` directly to the unconfirmed string, bypassing the stale-badge render entirely — contradicting UI-SPEC's own Global Stale Badge section ("a stale payload with no renderable risk must still show real content **beneath the badge**") and checklist row 4's "staleness disqualifies the whole no-risk short-circuit" framing (which, in the legacy code, always forced the main render branch — badge included — whenever `_stale` was true).
- **Fix:** Added `&& !this.spcrisk._stale` to the short-circuit's own condition, so a stale+quiet payload never takes the short-circuit at all and instead reaches the main branch, where the badge renders first and `contentMarker`'s existing fallback supplies "(unconfirmed)" beneath it.
- **Files modified:** `MMM-SPCOutlook.js`.
- **Verification:** `frontend-total-outage-still-shows-the-outage` (real end-to-end pipeline) went from FAIL to PASS; new scenario `rpt05-stale-quiet-payload-renders-unconfirmed-under-the-badge` pins both the badge and the string together.
- **Committed in:** `143184e` (Task 1+2 commit).

**3. [Rule 3 - Blocking] Ten legacy `frontend-*` scenarios asserted on the retired gate/render mechanism**
- **Found during:** Task 1/2, first probe run (10 failures after the rewrite; the plan's own acceptance criteria anticipated this: "Any legacy scenario that asserted on the removed 15-term gate must be updated in Task 3, not deleted — record any such scenario by name").
- **Issue:** `wssi-wellformed-minor` asserted the literal legacy label `"Winter Impact"`; `frontend-advisory-only-is-not-an-all-clear`, `frontend-advisory-band-respects-its-config-toggles`, `frontend-hazards-window-band-only-is-not-an-all-clear`, `frontend-hazards-elapsed-band-is-not-a-false-staleness-signal`, `frontend-hazards-window-hazard-appears-once-not-per-day`, `frontend-heatrisk-only-is-not-an-all-clear`, and `frontend-heatrisk-minor-floor-is-not-a-blank-module` all built synthetic payloads with no `summary` object (the new gate's sole input) and/or populated the now-unread legacy `hazardsOutlook.dayN`/`heatRisk` blocks directly; `frontend-follows-the-payload-day-span-not-a-hardcoded-one` asserted the retired literal `"Excessive Rain (Day 7)"` label.
- **Fix:** Added a computed `summary` to the shared `noRiskPayloadWithAdvisory`/`noRiskPayloadWithHazards` fixture builders (reflecting the advisories/window-band content each isolates); added `unifiedPayload(overrides)` and rebuilt `frontend-follows-the-payload-day-span-not-a-hardcoded-one`, the `frontend-hazards-window-hazard-appears-once-not-per-day` control, and both HeatRisk scenarios onto the unified `days[]` grid, asserting on the new compact-line grammar instead of retired literal labels. One control in `frontend-hazards-window-band-only-is-not-an-all-clear` (Control 2, WR-09) now asserts the honest `"(unconfirmed)"` degrade instead of a confident all-clear, documented inline as an intentional consequence of `summary.anyHazard` traveling with the payload as a single backend-computed value.
- **Files modified:** `scripts/probe-payload-resilience.js`.
- **Verification:** All ten scenarios pass; full suite green at 128 (pre-Task-3-additions), then 134 after the six new scenarios.
- **Committed in:** `2d94e97` (Task 3 commit).

**4. [Rule 3 - Blocking] A retained comment left one literal `renderDayBlock` match against the plan's own top-level verification**
- **Found during:** Final overall verification pass (`grep -c "renderDayBlock" MMM-SPCOutlook.js` returned 1, not the plan's required 0 — Task 2's own acceptance criterion allowed "excluding comments," but the plan's top-level `<verification>` block does not carry that exclusion).
- **Fix:** Reworded the one comment referencing the retired helper by name.
- **Files modified:** `MMM-SPCOutlook.js`.
- **Verification:** `grep -c "renderDayBlock" MMM-SPCOutlook.js` → `0`; probe suite unaffected (134 passed).
- **Committed in:** `ef3245e` (follow-up fix commit).

---

**Total deviations:** 4 auto-fixed (1 Rule 2 — missing critical functionality; 3 Rule 3 — blocking test-design/verification gaps discovered during and after the rewrite).
**Impact on plan:** All four strengthen correctness or restore the plan's own literal verification without changing the shipped behavior the plan specified. No scope creep — deviation 1 is a genuine display-floor regression the plan's own checklist row already required carrying forward; deviations 2-4 are test/verification-only or a one-line badge-ordering correction that better matches UI-SPEC's own stated invariant.

## Mutation Proofs (Task 3, D-10 requirement)

All seven mutations were applied directly to `MMM-SPCOutlook.js` via the Edit tool, confirmed RED with a diagnosable failure message, then restored (`diff` against a pre-mutation backup copy confirmed byte-identical) and the suite re-run to confirm return to green before the next mutation.

**Mutation 1 — reordered the `enabledSourceCount === 0` branch below the `anyHazard` branch.**
- Observed RED: `FAIL rpt05-no-products-enabled-is-not-an-all-clear: expected the exact no-products-enabled string, got: "No Severe Weather Risk"`
- Blast radius: 1/134 scenarios failed.
- Restore confirmed: `134 passed, 0 failed, 0 skipped`.

**Mutation 2 — dropped the `!this.spcrisk._stale` discriminator from the `anyHazard === false` branch.**
- Observed RED (three failures — accepted per the same "more than its own named target may fail, as long as each failure is diagnosable" allowance the 19-02/19-03 SUMMARYs document):
  - `FAIL rpt05-stale-quiet-payload-renders-unconfirmed-under-the-badge: expected the stale badge to render, got: No Severe Weather Risk`
  - `FAIL ero-fetch-throws: a silently-degraded ERO run rendered as a confident all-clear`
  - `FAIL frontend-total-outage-still-shows-the-outage: a total outage rendered as a confident all-clear — the degrade signal never reached the screen`
- Blast radius: 3/134 — the two extra failures are legitimately explained: both drive a real, stale, degraded payload through the same mutated line via the real `getSpcOutlook()` pipeline, and both messages are individually diagnosable and directly attributable to the mutated condition.
- Restore confirmed: `134 passed, 0 failed, 0 skipped`.

**Mutation 3 — changed the segment separator from `" · "` to `", "`.**
- Observed RED: `FAIL rpt02-compact-line-renders-dimension-worded-dot-separated-segments: expected exactly two " · " separators for 3 segments, got 0: Day 3 (Sun)  <span style="color:#e06666">Convective Enhanced</span>, <span style="color:#63be7b">Flash Flood Slight</span>, <span style="color:#e22f33">Heat Major</span><br/>`
- Blast radius: 1/134 scenarios failed.
- Restore confirmed: `134 passed, 0 failed, 0 skipped`.

**Mutation 4 — changed `daySurvivors`' filter from `h.suppressedBy !== null` to `false` (accept all entries regardless of suppression).**
- Observed RED: `FAIL rpt02-compact-line-skips-days-with-no-survivor: expected Day 2 to be skipped (its only entry is suppressed), got: Day 1 (Fri)  <span style="color:#e06666">Convective Enhanced</span><br/>Day 2 (Sat)  <span style="color:#e69138">Wind High Winds</span><br/>Day 3 (Sun)  <span style="color:#e06666">Convective Slight</span><br/>`
- Blast radius: 1/134 scenarios failed.
- Restore confirmed: `134 passed, 0 failed, 0 skipped`.

**Mutation 5 — added a second literal space before `proximityBadge(..., "outside")` in the D-08 branch.**
- Observed RED: `FAIL rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap: expected "Day 2 (Weekday)  0.3 (near MRGL)" with an exact two-space gap, got: Day 2 (Sat)   0.3 (near MRGL)<br/>`
- Blast radius: 1/134 scenarios failed.
- Restore confirmed: `134 passed, 0 failed, 0 skipped`.

**Mutation 6 — removed `validHazardColor` from the compact segment expression (interpolated `h.color` directly).**
- Observed RED: `FAIL wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color: expected the hostile color to fall back to aaaaaa, got: Day 4 (Mon)  <span style="color:#red" onload="alert(1)">Convective &lt;img src=x onerror=&quot;alert(1)&amp;&#39;&quot;&gt;</span><br/>`
- Blast radius: 1/134 scenarios failed.
- Restore confirmed: `134 passed, 0 failed, 0 skipped`.

**Mutation 7 — removed `escapeHtml` from the same expression (left `truncateHazardLabel(segmentText)` unescaped).**
- Observed RED: `FAIL wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color: a hostile hazard text reached innerHTML unescaped: Day 4 (Mon)  <span style="color:#aaaaaa">Convective <img src=x onerror="alert(1)&'"></span><br/>`
- Blast radius: 1/134 scenarios failed.
- Restore confirmed: `134 passed, 0 failed, 0 skipped`.
- Mutations 6 and 7 produced two DIFFERENT failure messages, as required — mutation 6's message names the color guard specifically ("expected the hostile color to fall back to aaaaaa"), mutation 7's names the escape guard specifically ("reached innerHTML unescaped") — proving the scenario observes both guards independently rather than one.

Final green run after all seven mutations restored: `PROBE RESULT: 134 passed, 0 failed, 0 skipped`, and a byte-for-byte `diff` against the pre-mutation backup confirmed the file was returned to its exact pre-mutation state.

## Issues Encountered
None beyond the four documented deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getDom()`'s head and day loop read only `this.spcrisk.days`/`.summary`; the advisory band and Hazards Outlook window band are unchanged and remain in their legacy position, ready for plan 19-06's relocation below all day blocks (RPT-04).
- Detail mode (`dayReportDetail: true` / D-04 auto-expand) is entirely unimplemented — `daySurvivors`/`dayProximityOnly`/`DIMENSION_LABELS`/`SOURCE_SHORT_NAMES` are all in scope and ready for plan 19-05 to build the dimension sub-row/`also:`/probabilistic-sub-line rendering against.
- Parity checklist rows 6, 12, 19, 20, 21, 22, 23, 25, 29, 30, 31, 33, 34 have their `New site` column filled; rows 1, 2, 3, 4, 5, 7, 8, 9, 10, 11 (loading/error/stale-badge/contentMarker/advisory-band mechanics) still have empty `New site` cells — Task 1 touched all of these but this plan's own task scope only required filling the rows Task 2 named. A future plan (or 19-08's sign-off pass) should fill these too before the checklist is considered complete.
- No blockers identified for downstream plans.

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-07*

## Self-Check: PASSED

- FOUND: `MMM-SPCOutlook.js`
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md`
- FOUND: `.planning/phases/19-unified-day-report-getdom-rewrite/19-04-SUMMARY.md`
- FOUND commit `143184e` (Task 1+2)
- FOUND commit `2d94e97` (Task 3)
- FOUND commit `ef3245e` (follow-up fix)
