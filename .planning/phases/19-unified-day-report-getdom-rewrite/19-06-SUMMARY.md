---
phase: 19-unified-day-report-getdom-rewrite
plan: 06
subsystem: ui
tags: [magicmirror, getdom, node_helper, band-relocation, xss-guards, mutation-testing]

# Dependency graph
requires:
  - phase: 19-unified-day-report-getdom-rewrite
    provides: "19-04's unified day loop and empty-state ladder; 19-05's detail-mode dimension sub-rows; the 19-01 parity checklist"
provides:
  - "payload.windowBand: a top-level, always-present array — the same array hazardsOutlook.windowBand carries, promoted so the frontend never has to read a legacy block (RPT-04)"
  - "One combined band below every day block: the advisory sub-section then the Hazards Outlook window band, in that order, with no unifying heading — a behavior-preserving relocation (RPT-04-RELOC), not a rewrite"
  - "getDom() reads zero legacy payload blocks — the unified day report is the sole render path (RPT-01), verified by a comment-filtered static probe gate"
  - "Six new mutation-proven probe scenarios pinning the band's position, ordering, write-once heading, band-only non-all-clear behavior, escaping, and the sole-reader gate"
affects: [19-08-sign-off, 19-09-legacy-retirement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "renderableWindowEntries/renderHazardsWindowBand now take the windowBand array itself as their parameter, not a wrapping block object — matching the top-level promotion rather than re-wrapping it at every call site"
    - "The blank-line separator between the last day block and the band's first line is not new code: it falls out of the existing per-day trailing <br/> in detail mode (the same rule used between two day blocks), so compact mode needs no separator either"

key-files:
  created: []
  modified:
    - node_helper.js
    - MMM-SPCOutlook.js
    - scripts/probe-payload-resilience.js
    - .planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md

key-decisions:
  - "windowBand is promoted via the same guarded expression _buildGridSummary already uses (hazardsPayload && hazardsPayload.windowBand), normalised to an array so the key is always present — no second sort or re-cap, since the legacy assembly at node_helper.js:955-970 already owns both."
  - "renderHazardsWindowBand's parameter renamed from block to windowBand and re-typed to accept the array directly, since block.windowBand was the only thing ever read off it — avoids re-wrapping the array in a throwaway object at the one call site."
  - "The shared noRiskPayloadWithHazards/unifiedPayload probe fixtures were updated to mirror windowBand at the top level (Rule 3, blocking) — without this, three pre-existing frontend-hazards-* scenarios would have silently stopped exercising the window-band renderer the moment it re-pointed to the promoted key, rather than failing loudly."

requirements-completed: [RPT-01, RPT-04, RPT-06]

# Metrics
duration: ~30min
completed: 2026-09-07
---

# Phase 19 Plan 06: Promote windowBand and relocate the combined band below every day block Summary

**`payload.windowBand` is now a top-level, always-present array; the advisory and Hazards Outlook window bands render as one combined band below every day block with no unifying heading; `getDom()` reads zero legacy payload blocks — probe suite 143 → 150 passed, 0 failed.**

## Performance

- **Duration:** ~30 min
- **Started:** ~2026-09-07T13:50Z (after worktree branch reset to `092bbee`)
- **Completed:** 2026-09-07T14:17:29Z (last task commit, before this plan-metadata commit)
- **Tasks:** 3 (all executed)
- **Files modified:** 4 (`node_helper.js`, `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`, `19-PARITY-CHECKLIST.md`)

## Accomplishments
- **Task 1:** Added `payload.windowBand` as a top-level, always-present array to the final payload literal, sourced from the same guarded `hazardsPayload && hazardsPayload.windowBand` expression `_buildGridSummary` already uses, normalised to an array. Extended the payload-shape JSDoc. Added a mutation-proven probe scenario driving the real `getSpcOutlook()` pipeline through a Wildfire/Drought layer (window-band-only, no day-grid involvement) with a toggle-off control confirming the key is `[]`, never `undefined`.
- **Task 2:** Moved the SPC MD / WPC MPD advisory band from above the day rows to a combined band rendered after the day loop, immediately followed by the Hazards Outlook window band — the exact RPT-04-RELOC ordering. Re-pointed `renderHazardsWindowBand`/`renderableWindowEntries` at the promoted top-level `this.spcrisk.windowBand` instead of `this.spcrisk.hazardsOutlook.windowBand`. No unifying heading introduced. Updated the shared `noRiskPayloadWithHazards`/`unifiedPayload` probe fixtures to mirror `windowBand` at the top level (see Deviations) so the re-point didn't silently strand three pre-existing scenarios. Filled parity checklist rows 7, 10, 11, 24, 26, 27, 28, 35 and marked `RPT-04-RELOC` implemented with the new line range.
- **Task 3:** Added six new mutation-proven scenarios: `rpt04-band-renders-below-every-day-block` (strict character-index ordering across day/SPC-MD/WPC-MPD/window-band landmarks, with a four-part precondition guard and an SPC-MD-before-WPC-MPD ordering assertion), `rpt04-band-never-renders-inside-a-day-block`, `rpt04-extended-hazards-heading-is-written-once-and-only-when-an-entry-renders` (two/one/zero renderable-entry runs), `rpt04-band-only-payload-is-not-an-all-clear` (every day empty, `anyHazard` driven solely by the window band, with both named controls), `rpt04-band-escapes-remote-advisory-and-window-band-text` (two distinct hostile strings plus a non-hex color), and `rpt01-getdom-reads-no-legacy-payload-block` (a comment-stripped static gate over the thirteen legacy accessor strings). All six mutation-proven per 15 D-10.
- Probe suite: **150 passed, 0 failed, 0 skipped** (up from the phase-entry baseline of 143).

## Task Commits

Each task was committed atomically:

1. **Task 1: Promote windowBand to a top-level payload key** — `7ade7c9` (feat)
2. **Task 2: Build the combined band below the day blocks and prove the sole render path** — `35c5182` (feat)
3. **Task 3: Mutation-prove the band's position, ordering, guards and the sole-reader gate** — `7652af7` (test)

**Plan metadata:** (this commit, made by the orchestrator after merge — worktree mode does not update STATE.md/ROADMAP.md per this plan's instructions)

## Files Created/Modified
- `node_helper.js` — added the top-level `windowBand` key to the final payload literal (beside `days`/`summary`/`sources`/`advisories`); extended the payload-shape JSDoc.
- `MMM-SPCOutlook.js` — relocated the advisory-band loop from above the day rows to below the day loop; relocated `renderHazardsWindowBand`'s call site alongside it, re-typed to read `this.spcrisk.windowBand`; `renderableWindowEntries`/`renderHazardsWindowBand` re-parameterized to accept the array directly instead of a wrapping block object.
- `scripts/probe-payload-resilience.js` — one new backend scenario (`rpt04-window-band-is-promoted-to-a-top-level-payload-key`); `noRiskPayloadWithHazards`/`unifiedPayload` fixture builders extended to mirror `windowBand` at the top level; six new frontend scenarios (`rpt04-band-renders-below-every-day-block`, `rpt04-band-never-renders-inside-a-day-block`, `rpt04-extended-hazards-heading-is-written-once-and-only-when-an-entry-renders`, `rpt04-band-only-payload-is-not-an-all-clear`, `rpt04-band-escapes-remote-advisory-and-window-band-text`, `rpt01-getdom-reads-no-legacy-payload-block`).
- `.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md` — `New site` column filled for rows 7, 10, 11, 24, 26, 27, 28, 35; `RPT-04-RELOC` marked implemented with its line range.

## Decisions Made
See frontmatter `key-decisions` for full detail. Summary:
- No second sort/re-cap of `windowBand` at the promotion site — the legacy assembly already owns both, and Task 1's acceptance criteria explicitly gate on exactly one `.sort(` call surviving.
- `renderHazardsWindowBand`'s signature changed to accept the array directly rather than re-wrapping it in a throwaway `{ windowBand: ... }` object at the (one) call site.
- The blank-line separator UI-SPEC calls for between the last day block and the band comes for free from the existing per-day trailing `<br/>` in detail mode — no new separator logic was needed or added.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Three pre-existing frontend-hazards-* scenarios only set the legacy nested windowBand copy**
- **Found during:** Task 2, first probe run after re-pointing `renderHazardsWindowBand` at `this.spcrisk.windowBand`.
- **Issue:** `frontend-hazards-window-band-only-is-not-an-all-clear`, `frontend-hazards-elapsed-band-is-not-a-false-staleness-signal`, and `frontend-hazards-window-hazard-appears-once-not-per-day` all build their fixture via the shared `noRiskPayloadWithHazards(hazardsBlock)` helper, which set `hazardsOutlook: hazardsBlock` but never mirrored `windowBand` at the top level. Once the renderer re-pointed to `this.spcrisk.windowBand`, all three failed with "No Severe Weather Risk (unconfirmed)" — not because the scenarios were wrong, but because the shared test double no longer matched the real payload's own contract (established by Task 1's promotion).
- **Fix:** Added `windowBand: (hazardsBlock && Array.isArray(hazardsBlock.windowBand)) ? hazardsBlock.windowBand : []` to `noRiskPayloadWithHazards`'s return object, and `windowBand: []` to `unifiedPayload`'s base shape — both mirroring the real payload's always-present top-level key, matching Task 1's own promotion contract.
- **Files modified:** `scripts/probe-payload-resilience.js`.
- **Verification:** All three scenarios pass again; probe suite green at 144 (pre-Task-3 baseline).
- **Committed in:** `35c5182` (Task 2 commit).

**2. [Rule 3 - Blocking] `rpt04-band-only-payload-is-not-an-all-clear` had no mutation explicitly assigned by the plan's own action text**
- **Found during:** Task 3, while executing the plan's specified mutation list (six mutations named, five new scenarios plus the static gate — one new scenario, `rpt04-band-only-payload-is-not-an-all-clear`, was not named against any of the six).
- **Issue:** The plan's own acceptance criteria and success criteria require "each individually mutation-proven," which is stricter than the six named mutations alone satisfy.
- **Fix:** Confirmed mutation 5 (re-pointing the band's call site at the legacy `this.spcrisk.hazardsOutlook.windowBand`) also drives `rpt04-band-only-payload-is-not-an-all-clear` RED, since its `unifiedPayload`-shaped fixture carries no `hazardsOutlook` key at all — the mutated line throws `Cannot read properties of undefined (reading 'windowBand')`, a diagnosable message directly attributable to the mutated line. No additional mutation needed; documented as covered by mutation 5's wider (but individually diagnosable) blast radius, per the precedent 18-07-SUMMARY.md's "more than its own named target may fail, as long as each failure is diagnosable" allowance.
- **Files modified:** none (verification-only finding).
- **Verification:** See Mutation 5 below — 7/150 scenarios failed, all attributable to the one mutated line, all individually diagnosable.
- **Committed in:** n/a (no code change; recorded here for traceability).

---

**Total deviations:** 2 (1 Rule 3 — a shared fixture builder needed updating to keep matching the payload contract Task 1 established; 1 verification-only finding closing a gap in the plan's own mutation assignment).
**Impact on plan:** Both strengthen correctness or close a verification gap without changing any shipped behavior the plan specified. No scope creep.

## Mutation Proofs (Task 3, D-10 requirement)

All mutations were applied directly to `MMM-SPCOutlook.js` via the Edit tool, confirmed RED with a diagnosable failure message, then restored via a pre-mutation backup copy and re-verified `git diff` empty against the prior commit before the next mutation.

**Mutation 1 — moved the combined band emission back above the day loop.**
- Observed RED:
  - `FAIL rpt04-band-renders-below-every-day-block: expected Day 1 < advisory < "Extended Hazards:" ordering, got day=267 advisory=29 window=140: ...`
  - `FAIL rpt04-band-never-renders-inside-a-day-block: expected the advisory band to render after the last day row, got advisory=29 <= lastDay=267: ...`
- Blast radius: 2/150 scenarios failed.
- Restore confirmed: `150 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 2 — hoisted the `"Extended Hazards:"` heading to before the entry loop (and before the zero-entries guard), unconditionally.**
- Observed RED: `FAIL rpt04-extended-hazards-heading-is-written-once-and-only-when-an-entry-renders: expected zero headings when every entry is excluded, got 1: ...`
- Blast radius: 1/150 scenarios failed, on the scenario's own zero-entry run as specified.
- Restore confirmed: `150 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 3 — removed `escapeHtml` from the advisory `label` interpolation.**
- Observed RED:
  - `FAIL frontend-escapes-remote-advisory-text: remote advisory text reached innerHTML unescaped: ...`
  - `FAIL rpt04-band-escapes-remote-advisory-and-window-band-text: a hostile advisory/window-band string reached the band unescaped: ...`
- Blast radius: 2/150 scenarios failed.
- Restore confirmed: `150 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 4 — removed `validHazardColor` from the window-band color interpolation.**
- Observed RED: `FAIL rpt04-band-escapes-remote-advisory-and-window-band-text: expected the hostile window-band color to fall back to aaaaaa, got: ...color:#not-a-hex-color...`
- Blast radius: 1/150 scenarios failed — the SAME scenario as Mutation 3, with a DIFFERENT diagnosable message (mutation 3's names the escape guard, "reached the band unescaped"; mutation 4's names the color guard, "expected the hostile window-band color to fall back to aaaaaa"), proving the scenario observes both guards independently.
- Restore confirmed: `150 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 5 — re-pointed the band's call site at the legacy `this.spcrisk.hazardsOutlook.windowBand`.**
- Observed RED (7 failures, all attributable to the one mutated line and individually diagnosable):
  - `FAIL rpt01-getdom-reads-no-legacy-payload-block: getDom still reads a legacy payload block outside comments: spcrisk.hazardsOutlook` (the specified target)
  - `FAIL rpt04-band-renders-below-every-day-block: Cannot read properties of undefined (reading 'windowBand')`
  - `FAIL rpt04-band-never-renders-inside-a-day-block: Cannot read properties of undefined (reading 'windowBand')`
  - `FAIL rpt04-extended-hazards-heading-is-written-once-and-only-when-an-entry-renders: Cannot read properties of undefined (reading 'windowBand')`
  - `FAIL rpt04-band-only-payload-is-not-an-all-clear: Cannot read properties of undefined (reading 'windowBand')`
  - `FAIL rpt04-band-escapes-remote-advisory-and-window-band-text: Cannot read properties of undefined (reading 'windowBand')`
  - `FAIL frontend-hazards-window-hazard-appears-once-not-per-day: Cannot read properties of undefined (reading 'windowBand')`
- Blast radius: 7/150 — the extra six are legitimately explained: every `unifiedPayload`-shaped fixture carries no legacy `hazardsOutlook` key at all, so `this.spcrisk.hazardsOutlook.windowBand` throws a `TypeError` naming the exact mutated property access. This is the same "more than its own named target may fail, as long as each failure is diagnosable" allowance documented in 18-07-SUMMARY.md, and it closes Deviation 2 above (`rpt04-band-only-payload-is-not-an-all-clear`'s own mutation proof).
- Restore confirmed: `150 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 6 — swapped the SPC MD / WPC MPD emission order (`ADVISORY_SOURCES` key order).**
- Observed RED: `FAIL rpt04-band-renders-below-every-day-block: expected SPC MD to render before WPC MPD (the existing concatenation order), got spcMD=220 mpd=143: ...`
- Blast radius: 1/150 scenarios failed, on the ordering assertion added to this scenario specifically for this mutation.
- Restore confirmed: `150 passed, 0 failed, 0 skipped`; `git diff` empty.

Final green run after every mutation and restore: `PROBE RESULT: 150 passed, 0 failed, 0 skipped`, with `git diff MMM-SPCOutlook.js` against the prior commit empty at every restore checkpoint.

## Mutation Proof (Task 1, D-10 requirement)

**Mutation — changed the top-level `windowBand` key to reference `advisories.spcMD` instead of `hazardsPayload.windowBand`.**
- Observed RED: `FAIL rpt04-window-band-is-promoted-to-a-top-level-payload-key: precondition failed: fixture produced zero window-band entries — nothing to promote`
- Blast radius: 1/144 scenarios failed (this scenario's own precondition guard caught the mutation directly, since the mutated expression returned an empty array where the fixture expected one populated entry).
- Restore confirmed: `144 passed, 0 failed, 0 skipped`; the `.sort(` grep gate re-confirmed exactly one call site.

## Issues Encountered
None beyond the two documented deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `getDom()` reads zero legacy payload blocks (verified by `rpt01-getdom-reads-no-legacy-payload-block`); the unified day report is the sole render path.
- The band's position, ordering, escaping, and write-once heading are all mutation-pinned at their new site.
- Parity checklist rows 7, 10, 11, 24, 26, 27, 28, 35 now have their `New site` column filled, and `RPT-04-RELOC` is marked implemented. Rows 1, 2, 3, 4, 5, 9 (loading/error/BUG-03 gate/staleness disqualifier/FWXT-03/contentMarker) remain unfilled — none were in this plan's own task scope (Task 2 named rows 7, 10, 11, 24, 26, 27, 28, 35 specifically). Row 9 in particular sits right next to work this plan touched (the `contentMarker` capture point, unchanged) and would be a natural, low-risk row for 19-08's sign-off pass to close.
- No blockers identified for downstream plans. Plan 19-09 (legacy block retirement) can now safely remove the legacy `hazardsOutlook`/`advisories`-adjacent render code paths from `node_helper.js`, since nothing in `getDom()` reads them.

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-07*
