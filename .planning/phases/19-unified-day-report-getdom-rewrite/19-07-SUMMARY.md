---
phase: 19-unified-day-report-getdom-rewrite
plan: 07
subsystem: api
tags: [node_helper, hazards-outlook, merge-precedence, mutation-testing, security-hardening]

# Dependency graph
requires:
  - phase: 19-unified-day-report-getdom-rewrite
    provides: "19-06's promoted top-level windowBand key and the payload the getDom() rewrite reads"
provides:
  - "sources['wpc-hazards'].reporting reads true on a window-band-only poll via the new windowBandReported accumulator, OR-ed into _buildSourceHealth's reporting derivation without touching reportedDays/activeDays"
  - "A window-routed unmapped label (e.g. the live-observed 'Severe Drought') is recorded in sources['wpc-hazards'].unmappedLabels with no duplicate Log.info emission"
  - "The window-band dedupe key is JSON.stringify([label, offsetStart, offsetEnd]) instead of a pipe-joined string, closing IN-01's key-hygiene gap"
  - "Four new backend probe scenarios (150 -> 154 passed), each individually mutation-proven"
affects: [19-08-sign-off, 19-09-legacy-retirement]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "windowBandReported is a fourth lazily-keyed accumulator alongside reportedDays/activeDays/unmappedLabels, read-only in _buildSourceHealth's reporting OR and never written by reportedDays/activeDays' own writers"
    - "Window-band dedupe key moved from a single-delimiter join to JSON.stringify([...fields]) — the first composite-key encoding in this file (19-PATTERNS.md's IN-01 section records no prior analog existed)"

key-files:
  created: []
  modified:
    - node_helper.js
    - scripts/probe-payload-resilience.js

key-decisions:
  - "The window-routing branch calls noteUnmapped but never a second Log.info — the legacy _runArcGisHazardWindowProduct build (same match, same label) already logs the pass-through label once per process via its own resolveStyle call, which always runs earlier in the Promise.allSettled batch than the merge pass consuming its gridMatches side-channel."
  - "in01-window-band-labels-containing-a-pipe-do-not-collide combines a local precondition proof (the historical pipe-joined formula genuinely collides for a synthetic pair) with a static source-inspection check of node_helper.js's actual key expression, because a genuine end-to-end collision cannot be constructed from real, date-derived integer offsets — see Deviations."

requirements-completed: [RPT-04, RPT-05]

# Metrics
duration: ~55min
completed: 2026-09-07
---

# Phase 19 Plan 07: Window-band reporting metadata and the IN-01 dedupe-key fix Summary

**`sources['wpc-hazards']` now reports `true` and records its unmapped labels on a window-band-only poll instead of false-negative silence, and the window-band dedupe key is a collision-free `JSON.stringify` encoding instead of a pipe-joined string — probe suite 150 → 154 passed, 0 failed.**

## Performance

- **Duration:** ~55 min
- **Started:** ~2026-09-07T13:59Z (after worktree branch reset to `731f07f`)
- **Completed:** 2026-09-07T14:43Z (last task commit, before this plan-metadata commit)
- **Tasks:** 3 (all executed)
- **Files modified:** 2 (`node_helper.js`, `scripts/probe-payload-resilience.js`)

## Accomplishments
- **Task 1:** Added a `windowBandReported` accumulator (and `noteWindowBandReported`) beside `reportedDays`/`activeDays`/`unmappedLabels`, following the same lazy-keying convention. `_addHazardsOutlookGridEntries`'s window-routing branch now calls `notes.noteWindowBandReported("wpc-hazards")` unconditionally, and `notes.noteUnmapped("wpc-hazards", match.label)` when `dimensionOf("wpc-hazards", match.label)` is `null` — both before the routing `continue`, with no `noteReported`/`noteActive` call and no fabricated day number. `_buildSourceHealth` gained a `windowBandReported` parameter and its `reporting` derivation is now OR-ed with `windowBandReported[sourceId] === true`, keeping the outer `!enabled ? false` gate as the outermost term. JSDoc updated on both functions.
- **Task 2:** Added the window-band-only Hazards Outlook fixture the suite has never had (Wildfire/Drought layer 7, the literal live-observed `"Severe Drought"` label, `showDrought: true`), driving the real `getSpcOutlook()` pipeline. Three new scenarios: `merge-sources-window-band-only-poll-still-reports-the-source-as-reporting` (reporting stays `true`, with an empty-`reportedDays`/populated-`windowBand` precondition and a toggle-off control), `merge-unmapped-window-routed-label-is-recorded-in-the-ledger` (the label lands in `unmappedLabels` with exactly one log emission, controlled against a mapped label that must not appear), `merge-window-band-reporting-does-not-fabricate-a-grid-day` (`reportedDays`/`activeDays` both stay empty). All four named mutations confirmed RED with diagnosable messages and restored (see Mutation Proofs).
- **Task 3:** Replaced the window-band dedupe key at `node_helper.js:951` with `JSON.stringify([entry.label, entry.offsetStart, entry.offsetEnd])`. Added `in01-window-band-labels-containing-a-pipe-do-not-collide`, combining a local precondition proof of the historical formula's genuine collision with a static source-inspection check and two real, distinct window-band matches (one carrying a literal pipe in its label) both surviving end to end, controlled against two identical real matches still deduping to one entry. `HAZARDS_MAX_WINDOW_ENTRIES`, the sort, and the entry shape are unchanged.
- Probe suite: **154 passed, 0 failed, 0 skipped** (up from the phase-entry baseline of 150).

## Task Commits

Each task was committed atomically:

1. **Task 1: Record window-routed unmapped labels and give reporting a day-independent signal** — `7b3755b` (feat)
2. **Task 2: Build the window-band-only fixture and mutation-prove the metadata fix** — `7defdd4` (test)
3. **Task 3: Replace the window-band dedupe key (IN-01) and pin the collision** — `2b001ca` (fix)

**Plan metadata:** (this commit, made by the orchestrator after merge — worktree mode does not update STATE.md/ROADMAP.md per this plan's instructions)

## Files Created/Modified
- `node_helper.js` — added the `windowBandReported` accumulator and `noteWindowBandReported` to the `gridNotes` contract; `_addHazardsOutlookGridEntries`'s window-routing branch now records the window-band-only answer and its unmapped label; `_buildSourceHealth`'s `reporting` derivation OR-ed with the window-band signal; window-band dedupe key replaced with a `JSON.stringify`-based composite encoding.
- `scripts/probe-payload-resilience.js` — four new scenarios: `merge-sources-window-band-only-poll-still-reports-the-source-as-reporting`, `merge-unmapped-window-routed-label-is-recorded-in-the-ledger`, `merge-window-band-reporting-does-not-fabricate-a-grid-day`, `in01-window-band-labels-containing-a-pipe-do-not-collide`.

## Decisions Made
See frontmatter `key-decisions` for full detail. Summary:
- No duplicate `Log.info` call in the window-routing branch — the legacy build's own `resolveStyle` call already logs the label once per process, earlier in the same poll's `Promise.allSettled` batch.
- `in01-window-band-labels-containing-a-pipe-do-not-collide` is a hybrid scenario (local precondition proof + static source check + real end-to-end assertions) rather than a pure end-to-end reproduction, for the reason detailed in Deviations below.

## Deviations from Plan

### Auto-fixed Issues

None — no Rule 1/2/3 auto-fixes were needed; the plan's own action text was directly implementable for Tasks 1 and 3.

### Disclosed Mutation-Testing Deviation (phase_specific_constraint #1)

**1. `in01-window-band-labels-containing-a-pipe-do-not-collide` cannot reproduce a genuine end-to-end collision through the real pipeline**
- **Found during:** Task 3, while designing the scenario per the plan's own example (`label "A|1"` with offsets `2,3` versus `label "A"` with offsets `1|2`).
- **Issue:** `entry.offsetStart`/`entry.offsetEnd` are always the return value of `_hazardDayOffset` (`Math.round((epochMs - todayUtcMs) / MS_PER_DAY)`) — a plain integer whose string form can never contain `|`. Given that constraint, splitting any pipe-joined key string from the right always uniquely recovers `(offsetEnd, offsetStart, label)`, regardless of how many pipes the label itself embeds: the last two `|`-delimited segments are provably always the real `offsetEnd` and `offsetStart`, because those two fields can never themselves contain a `|` to create ambiguity. A brute-force search across a realistic range of offsets (-3..23) and eleven label variants (including several containing embedded pipes) found zero collisions among 1,331 generated keys, confirming this is a general mathematical property of the formula rather than an artifact of the specific values tried. This means a genuine collision between two *different* real Hazards Outlook matches — both routed through the actual date-driven pipeline — cannot be constructed via any HTTP fixture, no matter what labels or dates are chosen.
- **Resolution:** Per phase_specific_constraint #1's explicit escape hatch ("If a specified mutation cannot go RED through the real pipeline, add a direct-call assertion against the same production method with synthetic inputs and disclose it in SUMMARY.md Deviations — do not silently accept the green"), the scenario combines three parts: (a) a precondition guard that computes the *historical* pipe-joined formula (preserved only as a fixed reference constant, documented as "the exact expression IN-01 replaced") against a synthetic pair (`label="A|1", offsetStart=2, offsetEnd=3` vs `label="A", offsetStart="1|2", offsetEnd=3`) and asserts the two old keys are genuinely equal, proving the ambiguity class the fix closes is real, not imagined; (b) a static source-inspection check (the same pattern the pre-existing `rpt01-getdom-reads-no-legacy-payload-block` scenario already uses for `MMM-SPCOutlook.js`) confirming `node_helper.js`'s *actual* key expression is the `JSON.stringify`-based fix and not the historical formula — this is what makes the scenario respond to a real code mutation; (c) two real, distinct window-band matches (one carrying a literal pipe in its label) both surviving end to end via `getSpcOutlook`, plus a control of two identical real matches still deduping to one entry.
- **Files modified:** `scripts/probe-payload-resilience.js` only (no production-code impact from this finding — the fix itself, Task 3's `JSON.stringify` replacement, is unaffected and correct regardless).
- **Verification:** Restoring the historical pipe-joined key in `node_helper.js` (mutation testing, see below) turned this scenario RED via the static-source-check branch, with the diagnosable message `"node_helper.js's window-band dedupe key is still the historical pipe-joined formula -- IN-01's fix is missing or reverted"`. Restored; suite green at 154.
- **Committed in:** `2b001ca` (Task 3 commit).

---

**Total deviations:** 1 disclosed mutation-testing deviation (no Rule 1-4 auto-fixes). No scope creep — the fix itself (Task 3's `JSON.stringify` key) is unaffected; only the test's proof strategy differs from the plan's literal example construction, for a mathematically-grounded reason.

## Mutation Proofs (Task 2, D-10 requirement)

All mutations applied directly to `node_helper.js` via the Edit tool, confirmed RED with a diagnosable message, then restored from a pre-mutation backup copy and reverified `git diff --stat` empty against the prior commit before the next mutation.

**Mutation 1 — moved `notes.noteWindowBandReported("wpc-hazards")` below the routing `continue` (making it unreachable).**
- Observed RED:
  - `FAIL merge-sources-window-band-only-poll-still-reports-the-source-as-reporting: expected sources['wpc-hazards'].reporting true on a window-band-only poll, got false`
  - `FAIL merge-window-band-reporting-does-not-fabricate-a-grid-day: precondition failed: expected sources['wpc-hazards'].reporting true, got false`
- Blast radius: 2/153 scenarios failed.
- Restore confirmed: `153 passed, 0 failed, 0 skipped` (pre-Task-3 baseline); `git diff` empty.

**Mutation 2 — removed the `dimensionOf(...) === null` guard so `noteUnmapped` fires for every routed match.**
- Observed RED: `FAIL merge-unmapped-window-routed-label-is-recorded-in-the-ledger: control: expected mapped label "Critical Wildfire Risk" to NOT appear in unmappedLabels, got ["Critical Wildfire Risk"]`
- Blast radius: 1/153 scenarios failed, caught by the scenario's own mapped-label control.
- Restore confirmed: `153 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 3 — changed the `reporting` OR back to the day-grid-only derivation.**
- Observed RED:
  - `FAIL merge-sources-window-band-only-poll-still-reports-the-source-as-reporting: expected sources['wpc-hazards'].reporting true on a window-band-only poll, got false`
  - `FAIL merge-window-band-reporting-does-not-fabricate-a-grid-day: precondition failed: expected sources['wpc-hazards'].reporting true, got false`
- Blast radius: 2/153 scenarios failed.
- Restore confirmed: `153 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 4 — added a `notes.noteReported("wpc-hazards", 1)` call inside the window-routing branch.**
- Observed RED:
  - `FAIL merge-sources-window-band-only-poll-still-reports-the-source-as-reporting: precondition failed: expected sources['wpc-hazards'].reportedDays empty, got [1]`
  - `FAIL merge-window-band-reporting-does-not-fabricate-a-grid-day: expected sources['wpc-hazards'].reportedDays empty, got [1]`
- Blast radius: 2/153 scenarios failed.
- Restore confirmed: `153 passed, 0 failed, 0 skipped`; `git diff` empty.

## Mutation Proof (Task 3, D-10 requirement)

**Mutation — restored `entry.label + "|" + entry.offsetStart + "|" + entry.offsetEnd` at the window-band key site.**
- Observed RED: `FAIL in01-window-band-labels-containing-a-pipe-do-not-collide: node_helper.js's window-band dedupe key is still the historical pipe-joined formula -- IN-01's fix is missing or reverted`
- Blast radius: 1/154 scenarios failed, caught by the scenario's own static source-inspection check (see the disclosed deviation above for why this check, rather than an end-to-end reproduction, is what carries the mutation-sensitivity).
- Restore confirmed: `154 passed, 0 failed, 0 skipped`; `git diff` for `node_helper.js` matched the intended fix exactly (verified via `git diff` inspection, no leftover mutation artifacts).

Final green run after every mutation and restore: `PROBE RESULT: 154 passed, 0 failed, 0 skipped`.

## Issues Encountered
None beyond the disclosed mutation-testing deviation above.

## User Setup Required

None - no external service configuration required.

## Parity Checklist

No `19-PARITY-CHECKLIST.md` row was filled by this plan. This plan is backend-only (`node_helper.js` metadata and dedupe-key correctness); it touches no `getDom()`/`MMM-SPCOutlook.js` render behavior. None of the checklist's unfilled rows entering this plan (1, 2, 3, 4, 5, 8, 9, 18, 32) correspond to `sources['wpc-hazards']` metadata or the window-band dedupe key — all are loading/error/no-risk-gate/fire-weather/staleness/placement rows owned by earlier or later plans. The checklist file is unmodified by this plan.

## Next Phase Readiness
- `sources['wpc-hazards']` now answers `reporting: true` and populates `unmappedLabels` on a window-band-only poll, closing the gap a display keying off `sources[id].reporting` would otherwise have hit (RPT-05).
- The window-band dedupe key can no longer collide on a `|`-containing remote label (IN-01/T-19-28 closed).
- No blockers identified for downstream plans. 19-08's sign-off pass can rely on `sources['wpc-hazards'].reporting`/`.unmappedLabels` being correct on a window-band-only poll if any future display work reads them.

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-07*

## Self-Check: PASSED

- FOUND: `node_helper.js`
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `.planning/phases/19-unified-day-report-getdom-rewrite/19-07-SUMMARY.md`
- FOUND commit `7b3755b` (Task 1)
- FOUND commit `7defdd4` (Task 2)
- FOUND commit `2b001ca` (Task 3)
