---
phase: 19-unified-day-report-getdom-rewrite
plan: 05
subsystem: ui
tags: [magicmirror, getdom, detail-mode, proximity-badges, xss-guards, mutation-testing]

# Dependency graph
requires:
  - phase: 19-unified-day-report-getdom-rewrite
    provides: "19-04's compact day loop, daySurvivors()/dayProximityOnly(), DIMENSION_LABELS/SOURCE_SHORT_NAMES, and the 19-01 parity checklist"
provides:
  - "Detail mode: a per-day dispatcher (dayReportDetail || day.autoExpand) rendering dimension sub-rows with source attribution and also: competitor lines, byte-identical whether triggered globally or per-day (D-04 No Chrome for Auto-Expand)"
  - "convectiveDetailAugment(): branches on the convective detail sub-object's three shapes (days 1-2 tor/hail/wind, day 3 cig-only, days 4-8 sign-only/no-op) to build the inside-mode proximity badge, the probabilistic sub-line, and the day-3 dual badge"
  - "All ten legacy inside/outside proximity mode decisions reproduced as explicit, individually-commented expressions tied to their RPT-06 checklist rows"
  - "white-space:pre-wrap + a monospace font-family override on every detail-mode line, so the UI-SPEC character grid actually survives HTML whitespace collapsing"
  - "Nine new mutation-proven probe scenarios (eight from Task 3, one from a post-Task-3 security fix) pinning detail mode, the three detail shapes, and per-type mode independence — probe suite 134 -> 143 passed, 0 failed"
affects: [19-06-band-relocation, 19-08-sign-off]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Detail dispatcher is one OR condition evaluated per day inside the existing compact loop, calling the identical renderDaySubRows() regardless of which trigger fired — the D-04 'no chrome' requirement is satisfied structurally (one code path), not by post-hoc comparison"
    - "Hazards are grouped into per-dimension {winner, competitors} buckets by iterating day.hazards in payload order once (never re-sorted, 18 D-15) — the same discipline 19-04 used for daySurvivors()"
    - "Field widths (DIMENSION_FIELD_WIDTH, the also: line's derived indent/label width) are computed from DIMENSION_LABELS' own longest value and from DETAIL_LABEL_FIELD_WIDTH, never re-hardcoded at a second site, so a future taxonomy addition widens the grid instead of breaking it"
    - "cigLabel() (numeric) re-introduced after 19-04 retired it as dead code — it has a real call site again in the probabilistic sub-line and the day-3 label glyph"

key-files:
  created: []
  modified:
    - MMM-SPCOutlook.js
    - scripts/probe-payload-resilience.js
    - .planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md

key-decisions:
  - "The dimension name and label field share ONE color span (D-02 carried into detail mode) — the plan's literal template string (color + white-space:pre-wrap + font-family in one span) is applied verbatim rather than split into separate structural/color spans."
  - "The also: line's label field width is derived algebraically (DETAIL_LABEL_FIELD_WIDTH - 2 - \"also: \".length) rather than hardcoded, so the em dash lands on the exact same column as the winner row's regardless of DIMENSION_FIELD_WIDTH — verified byte-for-byte against UI-SPEC's own mockup (column 42, 1-indexed) via a manual render, not just eyeballed."
  - "The ten legacy per-day proximity mode conditions collapse into five physical expressions (categorical shared across days 1/2/3, torCig/hailCig/windCig each their own, day-3 cig its own) because the unified day loop already runs one generic path per day — this is the intended consequence of Phase 19's own architecture, not a forbidden Pitfall-4 centralization. Each expression's comment names every checklist row it covers."
  - "Categorical mode is tested via `winner.label === \"NONE\" ? \"outside\" : \"inside\"` rather than hardcoded to `\"inside\"`, even though a NONE-risk day can never reach this code today (the backend's own floor excludes it before it becomes a hazards entry) — this keeps the code auditable against the legacy condition and robust to a future architecture change."

requirements-completed: [RPT-03, RPT-06]

# Metrics
duration: ~80min
completed: 2026-09-07
---

# Phase 19 Plan 05: Detail-mode dimension sub-rows, also: lines, and the three-shape probabilistic sub-line Summary

**Detail mode (`dayReportDetail: true` or per-day `autoExpand`) now renders source-labeled dimension sub-rows, `also:` competitor lines, and a proximity/probabilistic sub-line that branches on which of the three `detail` sub-object shapes a convective entry actually carries — probe suite 134 → 143 passed, 0 failed.**

## Performance

- **Duration:** ~80 min
- **Started:** ~2026-09-07T02:50Z (after worktree branch reset to `57b79265b01bad5aa7583ed565ba51c0dce69ab6`)
- **Completed:** 2026-09-07T04:10Z (last fix commit, before this plan-metadata commit)
- **Tasks:** 3 planned tasks, all executed, plus one post-Task-3 security fix (Rule 2)
- **Files modified:** 3 (`MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`, `19-PARITY-CHECKLIST.md`)

## Accomplishments
- **Task 1:** Added the detail dispatcher (`this.config.dayReportDetail === true || day.autoExpand === true`) inside 19-04's compact day loop; added `renderDaySubRows()` which groups a day's hazards by dimension in payload order into `{winner, competitors}`, rendering the winner's dimension+label field (one shared color span, padded to `DIMENSION_FIELD_WIDTH`/`DETAIL_LABEL_FIELD_WIDTH`) with uncolored source attribution, and every suppressed competitor as an `also:` line in its own color. Wrapped both the compact line and every detail line in `white-space:pre-wrap` spans (HTML collapses literal space runs otherwise) and added the one monospace font-family override UI-SPEC permits, scoped to detail sub-rows only.
- **Task 2:** Re-added the numeric `cigLabel()` helper (retired as dead code by 19-04). Built `convectiveDetailAugment()`, which branches on which `detail` fields are present — never on a hardcoded day number — to produce the days-1-2 tornado/hail/wind icon+CIG+badge+percentage sub-line (gated on `probRisk`, per-type gated on `risk > 0`), the day-3 combined CIG glyph plus dual categorical/cig badge (`";"`-joined only when both are non-empty), or a plain label for the sign-only/no-detail shapes. All ten legacy inside/outside proximity mode conditions reproduced as explicit, individually-commented expressions. Filled parity checklist rows 12-17, 33, 34 and recorded `SIGN-NOOP` under Intentional Changes.
- **Task 3:** Added `convectiveEntryGridOneTwo/GridThree/GridExtended` fixture builders and eight new mutation-proven scenarios covering detail-mode sub-rows, the D-04 auto-expand/global-detail equality (with a vacuity guard), `also:` line rendering, all three detail shapes, the day-3 dual-badge join rule, and per-type proximity mode independence from the day's own categorical mode.
- **Post-Task-3 fix (Rule 2):** Discovered during a threat-model self-review that the probabilistic sub-line's per-type `proximityBadge()` calls bypassed the shared `detailColoredSpan` escaping the label-field badges get, leaving a remote-derived `nextTier` token unescaped in that one sub-line. Fixed and pinned with a ninth mutation-proven scenario.
- Probe suite: **143 passed, 0 failed, 0 skipped** (up from the wave-4 baseline of 134).

## Task Commits

Each task was committed atomically:

1. **Task 1: Detail dispatcher, dimension sub-rows, also: lines, and whitespace preservation** — `6516191` (feat)
2. **Task 2: Three-shape probabilistic sub-line and ten proximity mode decisions** — `c075dad` (feat)
3. **Task 3: Mutation-prove detail mode, the three shapes, and the ten mode decisions** — `1ddcc24` (test)
4. **Follow-up fix: escape proximityBadge() output in the probabilistic sub-line (Rule 2)** — `5e00ab0` (fix)

**Plan metadata:** (this commit, made by the orchestrator after merge — worktree mode does not update STATE.md/ROADMAP.md per this plan's instructions)

## Files Created/Modified
- `MMM-SPCOutlook.js` — added the detail dispatcher, `renderDaySubRows()`, `convectiveDetailAugment()`, `detailSourceAttribution()`, `detailColoredSpan()`, `DIMENSION_FIELD_WIDTH`/`DETAIL_LABEL_FIELD_WIDTH`, the re-introduced numeric `cigLabel()`, and `white-space:pre-wrap` wrapping on the compact/D-08 lines.
- `scripts/probe-payload-resilience.js` — `convectiveEntryGridOneTwo/GridThree/GridExtended` fixture builders; nine new scenarios (`rpt03-detail-mode-renders-source-labeled-sub-rows-under-the-compact-header`, `rpt03-autoexpand-day-renders-identically-to-a-globally-expanded-day`, `rpt03-also-line-renders-every-suppressed-competitor-in-its-own-color`, `rpt03-detail-shape-days-1-2-renders-the-full-icon-line`, `rpt03-detail-shape-day-3-renders-one-inline-cig-and-no-icon-line`, `rpt03-detail-shape-extended-days-render-plain-label-only`, `rpt03-day3-dual-badge-joins-only-when-both-badges-are-non-empty`, `proxui-per-type-badge-modes-are-independent-of-the-day-categorical-mode`, `wr02-detail-sub-line-proximity-badge-escapes-a-hostile-tier-token`); updated one 19-04 scenario's regex to account for the new `</span>` boundary the D-08 line's pre-wrap wrapping introduces before `<br/>`.
- `.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md` — `New site` column filled for rows 12-17, 33, 34; `SIGN-NOOP` added under Intentional Changes.

## Decisions Made
See frontmatter `key-decisions` for full detail. Summary:
- Dimension name + label field share one color span (D-02 into detail mode), per the plan's literal template string.
- The `also:` line's label field width is derived algebraically so its em dash aligns with the winner row's own column regardless of `DIMENSION_FIELD_WIDTH` — verified byte-for-byte (column 42, 1-indexed) via manual render.
- The ten legacy per-day mode conditions collapse into five physical, individually-commented expressions because the unified day loop already runs one generic path per day — intended, not a Pitfall-4 violation.
- Categorical mode tests `winner.label === "NONE"` rather than hardcoding `"inside"`, keeping the code auditable against the legacy condition even though today's architecture never reaches the `"outside"` branch from within this code path.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing Critical] Probabilistic sub-line's proximity badges bypassed the shared escapeHtml guard**
- **Found during:** Post-Task-3 self-review of the plan's own `<threat_model>` section (T-19-18), before finalizing the plan.
- **Issue:** T-19-18 requires `escapeHtml` on `proximityBadge()`'s return "at every new call site" because its plain-tier branch passes a remote-derived `nextTier` token through verbatim. The label field's categorical and day-3 CIG badges get this for free by flowing through `detailColoredSpan`'s own `escapeHtml(truncateHazardLabel(...))` call, but the probabilistic sub-line's three per-type badges (torCig/hailCig/windCig) build their HTML directly and never passed through that shared call — a hostile `nextTier` on `days[n].proximity.torCig` (etc.) would have reached `innerHTML` unescaped.
- **Fix:** Wrapped each of the three sub-line `proximityBadge()` calls in `escapeHtml(...)`.
- **Files modified:** `MMM-SPCOutlook.js`.
- **Verification:** New scenario `wr02-detail-sub-line-proximity-badge-escapes-a-hostile-tier-token` mutation-proven RED (removing the `escapeHtml` wrap reproduced the exact unescaped `<img>` in the tornado segment) then restored; probe suite green at 143.
- **Committed in:** `5e00ab0` (fix).

**2. [Rule 3 - Blocking] The 19-04 D-08 proximity-only-day scenario asserted exact adjacency to `<br/>`**
- **Found during:** Task 1, first probe run after wrapping the compact and D-08 lines in `white-space:pre-wrap` spans.
- **Issue:** `rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap` (added by plan 19-04) asserted the literal substring `...0.3 (near MRGL)<br/>` with no markup in between — the new wrapping span's `</span>` now sits between the badge text and `<br/>`, which is a required, deliberate consequence of Task 1's own whitespace-preservation mandate, not a defect.
- **Fix:** Updated the scenario's regex to `...0.3 \(near MRGL\)<\/span><br\/>`, with a comment explaining why.
- **Files modified:** `scripts/probe-payload-resilience.js`.
- **Verification:** Scenario passes; probe suite green at 134 (pre-Task-3 baseline).
- **Committed in:** `6516191` (Task 1 commit).

---

**Total deviations:** 2 auto-fixed (1 Rule 2 — missing critical XSS guard; 1 Rule 3 — a pre-existing scenario's assertion needed updating for this task's own mandated markup change).
**Impact on plan:** Both strengthen correctness/security without changing any behavior the plan specified. No scope creep — deviation 1 closes a gap the plan's own threat_model named but Task 2's action text didn't spell out per-call-site; deviation 2 is a direct, foreseeable consequence of Task 1's own whitespace-preservation requirement.

## Mutation Proofs (Task 3 + the post-Task-3 fix, D-10 requirement)

All mutations were applied directly to `MMM-SPCOutlook.js` via the Edit tool, confirmed RED with a diagnosable failure message, then restored and verified byte-identical against `git diff` before the next mutation. All restores confirmed the file returned to its exact pre-mutation state (`git diff MMM-SPCOutlook.js` empty against the prior commit after each restore).

**Mutation 1 — changed the detail dispatcher's `||` to `&&`.**
- Initial run (before strengthening the scenario): 6 scenarios went RED (`rpt03-detail-mode-renders-source-labeled-sub-rows-...`, `rpt03-also-line-renders-...`, `rpt03-detail-shape-days-1-2-...`, `rpt03-detail-shape-day-3-...`, `proxui-per-type-badge-modes-...`), but NOT the scenario named for this exact mutation (`rpt03-autoexpand-day-renders-identically-to-a-globally-expanded-day`) — both its global and auto renders collapsed to the same non-expanded output under `&&`, satisfying string equality trivially. Added a vacuity guard (`expected both renders to actually contain sub-rows`) to that scenario.
- Re-run with the strengthened scenario: `FAIL rpt03-autoexpand-day-renders-identically-to-a-globally-expanded-day: vacuity guard failed: expected both renders to actually contain sub-rows, got: ...` plus the same 6 other scenarios (7 total).
- Blast radius: 7/142 scenarios failed, each individually diagnosable.
- Restore confirmed: `142 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 2 — removed `white-space:pre-wrap` from the detail sub-row's color span.**
- Observed: **zero** scenarios went RED. This is expected and disclosed per 15 D-10's rule for a structurally-unprovable guard: the probe's `document.createElement` stub (`scripts/probe-lib/module-stubs.js:278`) returns a plain object, not a parsed DOM — a scenario can only assert on the concatenated markup string, never on whether a browser's whitespace-collapsing algorithm actually applies to it. Removing the CSS declaration doesn't change any character in the string, so no scenario can observe it. **This mutation is not probe-observable; plan 19-08's mandatory manual runs (Run A/Run B) are its only proof**, exactly as `wssi-zero-features-out-of-season` was disclosed at Phase 15 close.
- Restore confirmed: `142 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 3 — changed the day-3 branch condition from `if (hasTorFamily)` to `if (hasTorFamily || hasCigOnly)`.**
- Observed RED: `FAIL rpt03-detail-shape-day-3-renders-one-inline-cig-and-no-icon-line: expected a CIG glyph to render inline for the day-3 shape, got: ...Convective   Slight                 ...` and `FAIL rpt03-day3-dual-badge-joins-only-when-both-badges-are-non-empty: expected the dual badge join ";" when both badges are renderable, got: ...`.
- Blast radius: 2/142 scenarios failed.
- Restore confirmed: `142 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 4 — removed the `detail.windRisk > 0` per-type gate (left the numeric/finite guard only).**
- Observed RED: `FAIL rpt03-detail-shape-days-1-2-renders-the-full-icon-line: expected no wind icon when windRisk is 0, got: ...<i class="wi wi-strong-wind"></i>0% ...`.
- Blast radius: 1/142 scenarios failed.
- Restore confirmed: `142 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 5 — changed the day-3 dual-badge join from conditional to unconditional (`const dualSep = ";"`).**
- Observed RED: `FAIL rpt03-day3-dual-badge-joins-only-when-both-badges-are-non-empty: expected no stray ";" when only one badge is renderable, got: ...Slight①  → MRGL 0.5;   ...`.
- Blast radius: 1/142 scenarios failed.
- Restore confirmed: `142 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 6 — replaced the tornado badge's own mode (`detail.torCig === 0 ? "outside" : "inside"`) with the day's `categoricalMode`.**
- Observed RED: `FAIL proxui-per-type-badge-modes-are-independent-of-the-day-categorical-mode: expected the outside-mode tornado badge ("near" form) despite the day's own categorical mode being inside, got: ...<i class="wi wi-tornado"></i> → MRGL 0.2...` (the tornado badge flipped to the inside-mode arrow form instead of the outside-mode "near" form).
- Blast radius: 1/142 scenarios failed.
- Restore confirmed: `142 passed, 0 failed, 0 skipped`; `git diff` empty.

**Mutation 7 — changed `detailSourceAttribution`'s lookup from `SOURCE_SHORT_NAMES[source]` to `this.spcrisk.sources[source].displayName`.**
- Observed RED (two failures, both diagnosable and directly attributable to the mutated line): `FAIL rpt03-detail-mode-renders-source-labeled-sub-rows-...: expected a sub-row attributed to "— HeatRisk", got: ...— NWS HeatRisk...` and `FAIL rpt03-autoexpand-day-renders-identically-...: vacuity guard failed...` (that scenario's fixture never sets `sources`, so the mutated lookup fell through to the raw source id instead of "SPC").
- Blast radius: 2/142 scenarios failed.
- Restore confirmed: `142 passed, 0 failed, 0 skipped`; `git diff` empty.

**Post-Task-3 fix mutation — removed the `escapeHtml(...)` wrap from the tornado sub-line's `proximityBadge()` call.**
- Observed RED: `FAIL wr02-detail-sub-line-proximity-badge-escapes-a-hostile-tier-token: a hostile proximity tier token reached the sub-line unescaped: ...→ <img src=x onerror="alert(1)"> 0.2...`.
- Blast radius: 1/143 scenarios failed.
- Restore confirmed: `143 passed, 0 failed, 0 skipped`; `git diff` empty.

Final green run after every mutation and restore: `PROBE RESULT: 143 passed, 0 failed, 0 skipped`, with `git diff MMM-SPCOutlook.js` against the prior commit empty at every restore checkpoint.

## Issues Encountered
None beyond the two documented deviations above.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Detail mode (dimension sub-rows, `also:` lines, the three-shape probabilistic sub-line, all proximity badges) is fully implemented and probe-verified. `daySurvivors`/`dayProximityOnly`/`DIMENSION_LABELS`/`SOURCE_SHORT_NAMES`/`renderDaySubRows`/`convectiveDetailAugment` are all in scope for plan 19-06.
- The advisory band and Hazards Outlook window band remain in their legacy position (above the day rows), unchanged by this plan — ready for plan 19-06's relocation below all day blocks (RPT-04).
- Parity checklist rows 12-17, 33, 34 now have their `New site` column filled. Rows 1-11 (loading/error/stale-badge/contentMarker/advisory-band mechanics) and rows 18, 21-24, 26-29, 32, 35 (fire weather color/label helpers, hazards label filters, weekday derivation, window-band mechanics, HeatRisk placement, advisory source mapping) remain unfilled — none of these were in this plan's own task scope (Tasks 1-2 named rows 12-17, 33, 34 specifically). A future plan or 19-08's sign-off pass should fill these before the checklist is considered complete.
- No blockers identified for downstream plans.

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Completed: 2026-09-07*
