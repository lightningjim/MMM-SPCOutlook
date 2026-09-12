---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
plan: 07
subsystem: testing
tags: [probe-suite, hazards-outlook, mutation-testing, node_helper, MMM-SPCOutlook.js, freshness]

# Dependency graph
requires:
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-03)
    provides: "_runArcGisHazardWindowProduct's clock-independent cache contract (_cacheHazardMatches whitelist, no-clock-parameter signature) — the exact mechanism this plan's headline scenario proves"
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-04)
    provides: "the two independent getDom no-risk gate terms (hazardsOutlookHasAnyDay / hazardsOutlookHasWindowEntries) this plan's DOM-level scenarios exercise"
  - phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook (16-06)
    provides: "HAZARDS_URLS, HAZARDS_NOW_MS, hazardsRoutes/hazardsFeature/hazardsCollection fixture infrastructure and assertHazardsBlockIntact, reused directly by every scenario in this plan"
provides:
  - "hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances — closes the phase's #1 risk (day-offset drift on a cache hit), with a precondition guard, a positive re-bucketing half, and a cache-nothing control"
  - "frontend-hazards-window-band-only-is-not-an-all-clear / frontend-hazards-window-hazard-appears-once-not-per-day — close the phase's #2 risk (the getDom window-band no-risk-gate omission) at the DOM layer, with three controls total"
  - "the four-scenario DATA-02 freshness family — weekend-poll false-alarm avoidance, per-layer (not shared) idp_filedate evaluation, D-15's badge/age-figure asymmetry, and D-16's no-suppression-on-stale rule"
  - "noRiskPayloadWithHazards / emptyHazardsBlock fixture builders in scripts/probe-payload-resilience.js, siblings to noRiskPayloadWithAdvisory"
  - "14 mutation proofs (file:line, verbatim RED message) as input to 16-08's phase mutation inventory"
affects: [16-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Literal-with-staleness-guard fixture dates for a freshness threshold: FRIDAY_FILEDATE/WEDNESDAY_FILEDATE are absolute Date.UTC literals (not proportional to maxDataAgeHours), validated against the live registry constant at scenario-run-time — a proportional derivation would make a maxDataAgeHours retune unable to ever flip the primary assertion, defeating the mutation's own purpose"
    - "turfStub.pointInPolygon must be re-set to true AFTER every resetHelper() call, never before — resetHelper unconditionally defaults it back to false, so a scenario with multiple resetHelper calls (a multi-poll drift scenario) needs the set repeated at each reset, not just once at scenario entry"
    - "Assert on the SECOND poll's request headers (If-None-Match), not just call count, to distinguish a genuine cache hit from a 'recompute from scratch every poll' implementation that would otherwise pass every day-key assertion vacuously"

key-files:
  created: []
  modified:
    - scripts/probe-payload-resilience.js

key-decisions:
  - "Used absolute literal ages (67h Friday-file, 115h prior-Wednesday-file) for the weekend freshness scenario instead of the plan's stated 67h/91h pair, because the plan's own literal Date.UTC values (Sunday noon poll, Friday/Wednesday 17:00 filedates) compute to 43h/91h, not 67h/91h — see Assumption Drift below"
  - "Added a second assertion to Task 1's step 9 (the second poll's request must carry If-None-Match: hazards-v1) beyond the plan's literal fetch-count check, because a fetch-count-only check does not distinguish a real cache hit from an implementation that never caches and recomputes correctly from scratch every time — required to make mutation M4 catch anything"

patterns-established:
  - "Multi-resetHelper scenarios (a scenario that simulates several distinct polls with different simulated 'now' values) must re-arm turfStub.pointInPolygon after each resetHelper call, not once — this is now the second scenario file-wide (after the day-keys-shift scenario) to need this, worth flagging for any future multi-poll drift scenario"

requirements-completed: [HAZ-02, DATA-02]

# Metrics
duration: ~25min
completed: 2026-08-26
---

# Phase 16 Plan 07: Hazards Outlook Probe Scenarios (Part 2 — Highest-Risk Items) Summary

**Closed the phase's two highest-risk regressions (day-offset drift on a cache hit, and the getDom window-band no-risk-gate omission) plus the full DATA-02 freshness family, adding 7 mutation-proven scenarios (14 mutations) to `scripts/probe-payload-resilience.js`, growing the suite from 58 to 65 passing scenarios.**

## Performance

- **Duration:** ~25 min (per commit timestamps; wall-clock investigation/design time was longer)
- **Completed:** 2026-08-26
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments

- **Task 1 (HIGHEST-RISK ITEM 1):** `hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances` proves a cache hit re-derives day keys against the polling clock rather than replaying the previous poll's bucketing. Structure: warm at Wed 13:00Z (day3 = Heavy Rain), a precondition guard on the cached entry's clock-independence, advance 24h with byte-identical bytes/etag (Thu poll: every day3..day14 empty, date labels advanced to 2026-08-30), a positive half proving the hazard actually MOVES (Monday day5 → Wednesday day3, not merely vanishes), and a control proving two clock-fixed polls are byte-identical (guards against "never cache anything" degrading into a false pass).
- **Task 2 (HIGHEST-RISK ITEM 2):** `frontend-hazards-window-band-only-is-not-an-all-clear` proves a window-band-only payload (empty day3..day14, one windowBand entry) never renders "No Severe Weather Risk" at the real `getDom`, with a precondition guard and two controls (empty windowBand still short-circuits; a populated band with `showHazardsOutlook:false` still short-circuits per WR-09). `frontend-hazards-window-hazard-appears-once-not-per-day` proves HAZ-02's other half: the window-band label renders exactly once, never once per day in its span, with a control proving the same label on three separate days renders three times.
- **Task 3 (DATA-02 freshness family):** four scenarios — a weekend poll of Friday's file is not falsely flagged stale (with a control proving a genuinely stale prior-Wednesday file IS flagged, guarding against "no age check at all"); `idp_filedate` is evaluated per layer, not shared across the row (D-13), with a precondition guard proving the aged layer's own feature reached the payload; a data-age trip sets `_stale` without dragging `_staleAsOf` along (D-15's deliberate asymmetry), with a control proving a genuine fetch failure DOES leave a numeric `_staleAsOf`; and stale hazard content still renders its rows rather than being suppressed (D-16), proven end-to-end through the real `getDom`.
- All 65 scenarios reference the real `_fetch`/`_nowMs` seams via `installHttp`, never a wholesale stub of `fetchGeoJsonCached` or a renderer — verified directly (Task 1's step 9 asserts on `helper._fetch.calls` including the request headers).
- Probe suite: 58 (pre-existing, 16-06 baseline) → 65 passed, 0 failed, 0 skipped.

## Task Commits

Each task was committed atomically:

1. **Task 1: HIGHEST-RISK ITEM 1 — the day-offset-drift-on-a-cache-hit scenario** - `93751b1` (feat)
2. **Task 2: HIGHEST-RISK ITEM 2 — the window-band-only no-risk-gate scenarios** - `f962061` (feat)
3. **Task 3: DATA-02 freshness family** - `7cb603c` (feat)

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — added `noRiskPayloadWithHazards`/`emptyHazardsBlock` fixture builders and 7 new scenarios (589 lines added, 0 removed, confirmed via `git diff --stat` after each task).

## Mutation Inventory (input for 16-08's phase mutation inventory)

Every mutation was applied to the working tree, run against the full suite, confirmed RED with a diagnosable message, then restored from a byte-identical backup (`md5sum` match verified before and after every restore) before the next mutation. No mutation was left in place; `git status`/`git diff` was clean of `node_helper.js`, `MMM-SPCOutlook.js`, and `productRegistry.js` changes at the end of the plan.

### Task 1 (4 mutations) — `_runArcGisHazardWindowProduct` / `_cacheHazardMatches` / `_todayUtcMs`

**M1 — `node_helper.js:521-527`, moved the `_bucketHazardMatch` re-bucket loop inside `if (fetchResult.data !== null)` so a cache hit skips re-bucketing.**
Target: the positive-half assertion (Wednesday, offset 3, after a cache hit). RED:
```
expected day key 3 (Wednesday + 3 = Aug 29) after a cache hit, got day3=[], day5=[] — a cache hit must re-derive the day key against the new clock, not replay the old one
```

**M2 — `node_helper.js:398-416` (`_cacheHazardMatches`), replaced the field-by-field whitelist with `matches.map((match) => ({ ...match, day3: true }))`.**
Target: the step-4 precondition guard. RED, naming the smuggled field:
```
precondition failed: the cached entry carries a clock-dependent field, so the drift assertion below cannot distinguish a correct re-bucketing from a lucky replay: [{"label":"Heavy Rain","startDate":1787961600000,"endDate":1787961600000,"idpFiledate":1787961600000,"day3":true}]
```

**M3 — `node_helper.js:1716-1719` (`_todayUtcMs`), memoized the computed value on first call for the process lifetime (`this.__mutationMemoizedTodayUtcMs`).**
Target: the drift scenario. RED — caught even earlier than the plan anticipated, on the negative half (Wed→Thu), because `_todayUtcMs` is first called by an EARLIER hazards scenario in the suite (`hazards-precip-spread-buckets-every-day-in-span`, also pinned to `HAZARDS_NOW_MS`), so the memoized value locks in at Aug 26 for the rest of the process, including this scenario's later Thursday/Monday/Wednesday polls:
```
day-offset drift: a cache hit replayed the previous day's bucketing — Heavy Rain fixed at Aug 29 is day3 on Aug 26 and day2 on Aug 27 (offset 2, outside the 3..14 grid, so it must render on NO day), and the ETag never fires because the bytes did not change. Found a hazard surviving on day3: [{"label":"Heavy Rain","color":"267300","mapped":true}]
```

**M4 — `node_helper.js:486-487`, removed the `this._cacheHazardMatches(url, fetchResult, matches)` call so the runner never writes the cache and every poll recomputes from scratch.**
Target: caught even earlier than the plan's step-8 control — at the step-4 precondition guard, since with no cache write there is nothing to warm:
```
precondition failed: no cache entry for the hazards layer-4 URL — the warm-up poll did not populate the cache
```
Collateral: `hazards-data-age-sets-the-badge-but-not-the-age-figure`'s control warm-up also failed for the same reason (both scenarios rely on a written cache entry). This is the mutation the scenario's step-9 If-None-Match assertion (added beyond the plan's literal text — see Deviations) exists to catch independently of the precondition guard; the guard fired first because it runs earlier in the same scenario.

### Task 2 (5 mutations) — `MMM-SPCOutlook.js` no-risk gate / window-band renderer

**M1 — deleted the `hazardsOutlookHasWindowEntries` gate term line (`MMM-SPCOutlook.js:336`).**
Target: `frontend-hazards-window-band-only-is-not-an-all-clear`. RED:
```
HAZ-02: a window-band-only payload short-circuited to a confident all-clear — a location inside a Hazardous Heat polygon with no day-resolved hazards. This is the Phase 15 getDom regression class, which shipped live once.
```
Collateral (expected, same code path): `frontend-hazards-window-hazard-appears-once-not-per-day` also failed (`got 0: No Severe Weather Risk`).

**M2 — replaced the two gate terms with a single term checking only `hazardsOutlookHasAnyDay` (`MMM-SPCOutlook.js:335-336`).**
Target: same scenario. Run live and confirmed RED with the identical message to M1 — this term-removal and M1's line-deletion produce byte-identical resulting code for this gate (a single `&&`-chain of NOT-terms is not equivalent to an OR of the two only when a term is dropped entirely, which is what "checks only `hazardsOutlookHasAnyDay`" reduces to here):
```
HAZ-02: a window-band-only payload short-circuited to a confident all-clear — a location inside a Hazardous Heat polygon with no day-resolved hazards. This is the Phase 15 getDom regression class, which shipped live once.
```

**M3 — changed `hazardsOutlookHasWindowEntries` to `return true` unconditionally (`MMM-SPCOutlook.js:262-265`).**
Target: Control 1 (empty windowBand must still short-circuit). RED:
```
control: an empty-windowBand payload no longer short-circuits, it rendered: No Severe Weather Risk (unconfirmed)
```

**M4 — removed the `this.config.showHazardsOutlook &&` guard from the window-band gate term (`MMM-SPCOutlook.js:336`).**
Target: Control 2 (WR-09 — a populated band with the toggle off must still short-circuit). RED:
```
control: a populated windowBand payload with showHazardsOutlook:false no longer short-circuits, it rendered: No Severe Weather Risk (unconfirmed)
```

**M5 — changed the window-band renderer to also emit a day-row for each day in the entry's span (`MMM-SPCOutlook.js:577-580`).**
Target: `frontend-hazards-window-hazard-appears-once-not-per-day`. RED naming the count:
```
expected "Hazardous Heat" to appear exactly once (the window band, not once per day in its span), got 6: Extended Hazards:<br/>Sat–Wed (D3–7): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 3): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 4): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 5): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 6): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 7): <span style="color:#a80000">Hazardous Heat</span><br/>
```

### Task 3 (5 mutations) — freshness check / registry constant / stale-suppression

**M1 — `node_helper.js:492-519`, removed the entire data-age check block.**
Target: `hazards-weekend-poll-of-fridays-file-is-not-stale`'s control. RED:
```
control: a 115h-old file (outside the 84h budget) was not flagged stale — without a working age check, the primary assertion above proves nothing
```
Collateral (expected, same code path): `hazards-idp-filedate-is-evaluated-per-layer-not-shared` and `hazards-data-age-sets-the-badge-but-not-the-age-figure` also failed.

**M2 — `node_helper.js:470-497`, captured `matches[0].idpFiledate` once outside the per-layer loop (`mutationSharedFiledate`) and reused it for every layer.**
Target: `hazards-idp-filedate-is-evaluated-per-layer-not-shared`. RED naming the D-13 defect:
```
D-13: layer 3's idp_filedate is 89h old (past the 84h budget) while every other layer is fresh, and _stale was not set — a row-level shared timestamp does not exist for this product; any layer aged out must trip the badge
```

**M3 — `node_helper.js:517`, added `this._noteStaleEntry({ timestamp: this._nowMs() })` at the data-age trip site.**
Target: `hazards-data-age-sets-the-badge-but-not-the-age-figure`. RED naming `_staleAsOf`:
```
D-15: a data-age trip dragged _staleAsOf along with it — this would make the badge speak for SPC data fetched moments ago while describing a WPC file up to 84h old, got _staleAsOf=1787749200000
```

**M4 — `productRegistry.js:359`, changed `maxDataAgeHours` from `84` to `48`.**
Target: `hazards-weekend-poll-of-fridays-file-is-not-stale`'s primary assertion — caught by the scenario's own fixture-drift guard (an even stronger, more direct proof that the literal ages are load-bearing against the live registry constant, not the plan's anticipated path through the "was flagged stale" assertion itself):
```
fixture drift: the Friday-file scenario's elapsed 67h is not inside the current maxDataAgeHours budget (48h) — update FRIDAY_FILEDATE/SUNDAY_POLL_MS
```

**M5 — `MMM-SPCOutlook.js:598`, added `&& !this.spcrisk._stale` to the hazards-rendering gate.**
Target: `hazards-stale-data-still-renders-its-rows`. RED naming the suppression:
```
D-16: a data-age trip suppressed the hazard row instead of just badging it: <span style="color:#FFCC00">⚠ Stale</span><br/>No Severe Weather Risk (unconfirmed)
```

## Decisions Made

- **Weekend-freshness fixture dates (Task 3, scenario 1):** the plan's stated Date.UTC literals (Sunday noon poll; Friday/Wednesday 17:00 filedates) compute to 43h and 91h elapsed, not the plan's narrated "67-hour-old" / "91 hours old" pair. Rather than force the plan's exact hour narrative, chose new literals (Sunday 19:00Z poll, Friday/Wednesday 00:00Z filedates) that land on 67h/115h — comfortably inside/outside the current 84h budget AND positioned so a plausible retune to 48h (M4) still flips the primary assertion. A runtime guard validates both literals against the live `maxDataAgeHours` and throws a named "fixture drift" error if a future retune invalidates them, mirroring 16-06's Flooding-labels literal+registry-validation pattern. See Assumption Drift below.
- **Added an If-None-Match header assertion to Task 1's step 9,** beyond the plan's literal "fetch called twice" check. A fetch-count-only assertion cannot distinguish a genuine cache hit from an implementation that simply never caches and recomputes correctly from scratch every poll (mutation M4's exact shape) — both produce two fetch calls with correct output. The added assertion (the second poll's request must carry `If-None-Match: hazards-v1`) can only pass if a real cache entry was written and consulted.
- **`turfStub.pointInPolygon` must be set to `true` AFTER each `resetHelper()` call, not before or once at scenario entry.** Discovered via three initial scenario failures (all four Task 3 scenarios plus Task 1's opening assertion) traced to `resetHelper`'s `Object.assign(turfStub, TURF_DEFAULTS)` unconditionally resetting it to `false` on every call — a multi-poll scenario with several `resetHelper` calls needs the re-arm repeated at each one.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug, self-caught] Fixed a turfStub-ordering bug across four new scenarios before commit**
- **Found during:** first full-suite run after writing all three tasks' scenarios
- **Issue:** `hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances` set `turfStub.pointInPolygon = () => true` BEFORE its first `resetHelper(helper)` call (and before its second and third), and the three Task 3 freshness scenarios omitted the turf stub entirely. Since `resetHelper` unconditionally resets `turfStub.pointInPolygon` to `() => false`, every polygon-containment check in these scenarios silently returned "not contained," producing empty match arrays and vacuous "not stale"/"empty" passes rather than exercising the code under test.
- **Fix:** Moved `turfStub.pointInPolygon = () => true` to immediately AFTER each `resetHelper(helper)` call in all four affected scenarios (three `resetHelper` sites in Task 1's scenario; one each in Task 3's three affected scenarios), each restored via a `finally` block.
- **Files modified:** `scripts/probe-payload-resilience.js`
- **Verification:** Re-ran the full suite after the fix — all 65 scenarios green (previously 4 of the 7 new scenarios failed with messages like `"warm-up: expected day3 to carry one Heavy Rain hazard, got []"` and `"precondition failed: layer 3's feature did not reach windowBand: []"`, both symptoms of the polygon check always returning false).
- **Committed in:** the fix was applied and verified before any task commit was made, so no separate fix commit exists — each task's single commit already reflects the corrected code.

---

**Total deviations:** 1 auto-fixed (1 self-caught bug, found on the first full-suite run before any commit)
**Impact on plan:** No scope creep. The bug was caught by running the suite immediately after writing the scenarios, exactly as the plan's own verification step requires, and fixed before any commit — nothing incorrect was ever committed.

## Assumption Drift (advisory)

- **Found during:** Task 3, writing `hazards-weekend-poll-of-fridays-file-is-not-stale`.
- **Planned:** The plan's `<action>` text specifies `Date.UTC(2026, 7, 30, 12, 0)` (Sunday noon) as the poll time and `Date.UTC(2026, 7, 28, 17, 0)` / `Date.UTC(2026, 7, 26, 17, 0)` (Friday/Wednesday 17:00Z) as the two filedates, narrating them as "a 67-hour-old file" and "91 hours old" respectively.
- **Actual:** Computing the plan's own literal `Date.UTC` values gives 43 hours elapsed for the Friday file and 91 hours for the Wednesday file, not 67/91 — the Wednesday half matches exactly, but the Friday half does not. Verified directly with `node -e` before writing the fixture.
- **Why:** Environmental/documentation drift in the plan's own arithmetic (the plan's narrated hour counts and its literal timestamps do not agree for the Friday side). Non-blocking: chose different literals (documented in Decisions above) that hit 67h/115h — both still comfortably positioned relative to the 84h budget and to a plausible 48h retune — rather than the plan's exact Date.UTC values, and validated the choice with a runtime fixture-drift guard rather than silently trusting either the plan's narration or its literals.

## Issues Encountered

None beyond the self-caught turfStub-ordering bug documented above, which the plan's own "run the suite after writing scenarios" step is designed to surface and did.

## Probe Suite Impact

The full probe suite (`node scripts/probe-payload-resilience.js`) was run after every task, after every one of the 14 mutation restores, and once more at the end of the plan, reporting **65 passed, 0 failed, 0 skipped** at every green checkpoint (58 baseline → 59 after Task 1 → 61 after Task 2 → 65 after Task 3). No pre-existing scenario regressed at any point. `git status`/`git diff` confirmed `node_helper.js`, `MMM-SPCOutlook.js`, and `productRegistry.js` were byte-identical to their pre-mutation state (via `md5sum`) after every restore, and clean (no diff) at the plan's end — only `scripts/probe-payload-resilience.js` carries this plan's changes.

## Known Stubs

None. All 7 new scenarios drive the real `_runArcGisHazardWindowProduct`/`_cacheHazardMatches`/`_bucketHazardMatch`/`fetchGeoJsonCached` path via the `installHttp` HTTP seam and the `_nowMs` clock seam (never a wholesale stub of `fetchGeoJsonCached` or of a renderer), and the three DOM-level scenarios (Task 2's two, plus Task 3's `hazards-stale-data-still-renders-its-rows`) additionally drive the real `getDom` renderer via `renderDom`. No placeholder data or unwired assertion exists in any new scenario.

## Threat Flags

None new beyond the plan's own `<threat_model>` register (T-16-27 through T-16-31, T-16-SC), all implemented as specified: T-16-27 (cache-hit day-replay) is closed by Task 1's scenario and mutations M1/M3/M4; T-16-28 (window-band-only false all-clear) is closed by Task 2's scenarios and mutations M1/M2; T-16-29 (stale-reads-as-fresh) is closed by Task 3 scenario 1's control and mutation M1; T-16-30 (badge misreporting fetch recency as publish age) is closed by Task 3 scenario 3 and mutation M3; T-16-31 (a scenario green while proving nothing) is the exact class the self-caught turfStub deviation above demonstrates and closes — every new scenario carries a precondition guard, a control, or both, and the one gap found was found by the plan's own required verification step before any commit. No npm/pip/cargo package was installed (T-16-SC).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- 16-08 can consume the 14 mutations recorded above verbatim (file:line, verbatim RED message) for the phase's mutation inventory.
- The probe suite stands at 65 scenarios, covering HAZ-01 through HAZ-04, DATA-02, D-01 through D-16 as they apply to the Hazards Outlook, and both of the phase's highest-risk regression classes.
- No blockers. `noRiskPayloadWithHazards`/`emptyHazardsBlock` are available for any future hazards-focused frontend scenario without needing to rebuild the isolation fixture from scratch.

---
*Phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook*
*Completed: 2026-08-26*

## Self-Check: PASSED
- FOUND: `scripts/probe-payload-resilience.js`
- FOUND: `93751b1` (Task 1 commit)
- FOUND: `f962061` (Task 2 commit)
- FOUND: `7cb603c` (Task 3 commit)
- Probe suite re-run at self-check time: 65 passed, 0 failed, 0 skipped
- Working tree clean of any lingering mutations (`git status --short` shows only this SUMMARY.md as untracked)
