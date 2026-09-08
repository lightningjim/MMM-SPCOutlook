---
phase: 19-unified-day-report-getdom-rewrite
fixed_at: 2026-09-08T00:00:00Z
review_path: .planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md
iteration: 2
findings_in_scope: 9
fixed: 8
skipped: 1
status: partial
---

# Phase 19: Code Review Fix Report

**Fixed at:** 2026-09-08
**Source review:** `.planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md`
**Iteration:** 2 (fix pass for the second review; `fix_scope: critical_warning`)

**Summary:**
- Findings in scope: 9 (CR-01, CR-02, CR-03, WR-01 … WR-06)
- Fixed: 8
- Skipped: 1 (WR-05 — needs a D-16 payload-contract decision, see below)

**Harness:** `scripts/probe-payload-resilience.js` — **173 passed, 0 failed, 0 skipped**
(168 at the start of this pass; +5 new scenarios). Every fix below was mutation-verified RED
before being committed: the mutation is stated in each new scenario's own header comment and the
RED transcript was produced by reverting the fix in place and re-running the suite.

## Fixed Issues

### CR-01: The D-08 proximity-only day row is unreachable against any real payload

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `806e7bb`
**Applied fix:** Added `anyProximityOnlyDay()` beside `dayProximityOnly` and a
`&& !anyProximityOnlyDay()` term to the no-risk short-circuit. The helper loops the payload's own
14 day keys through `dayProximityOnly` — the *same* predicate the render branch consults — so the
gate and the row it was starving cannot drift apart the way the pre-19
`hasAnyRenderableProximity` terms did when they were dropped.

Probe work: `rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap` no longer forces
`summary.anyHazard = true` (it now asserts the fixture's own `false`, i.e. what
`_buildGridSummary` really emits for a quiet day carrying only a proximity subtree), its
below-floor control now also pins that a sub-noise-floor proximity must NOT hold the
short-circuit open, and a new
`cr01-proximity-only-day-survives-the-no-risk-short-circuit` covers the gate directly with
`proximityWeighting:false` and stale-payload controls. Both fail RED without the gate term.

### CR-02: A confident all-clear is rendered over a payload that says a hazard exists

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `135c7a0`
**Applied fix:** Added `summaryContradictsRender` as a term of `unconfirmed` at the
`contentMarker` fallback, keeping case 1's documented precedence.

**Deviation from the suggested patch, deliberate:** the review's proposed term
(`summaryOk && summary.anyHazard === true && !anyUngatedContent()`) fires on a payload the
backend emits routinely and correctly — `_buildGridSummary`'s `windowBandCount` is a *raw*
`windowBand.length` while `renderableWindowEntries` drops wholly-elapsed windows with the display
gates OFF too. Applying it verbatim turned the existing
`wr01-empty-render-...`'s elapsed-window assertion RED, i.e. it would have made a healthy poll
render "(unconfirmed)". The committed term therefore carries a `rawWindowBandCount === 0` carve-out
(any *renderable* band entry would have made `anyUngatedContent()` true and never reached the
line), which preserves both reviewer reproductions and the documented structural rule. Both halves
are mutation-verified: dropping the term loses the reviewer's cases; dropping the carve-out turns
the elapsed-window assertions RED.

Also corrected one fixture: `wr01-...`'s suppressed-only day hand-set `anyHazard: true`, which no
backend can emit (the day scan skips `suppressedBy !== null` entries). It now uses the derivation's
own `false`; the `true` variant is proved as a genuine disagreement in the new scenario.

New scenario `cr02-a-summary-that-contradicts-the-render-is-never-a-confident-all-clear` covers
seven cases: null grid, 14-corrupt-day grid, a WR-01 case-2 control, a case-3 control, the elapsed
band, suppressed-only, and case-1 precedence with the stale badge.

### CR-03: Payload-keyed prototype-chain lookups

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `c22cd59`
**Applied fix:** One `lookup(map, key, fallback)` helper (`Object.prototype.hasOwnProperty.call`),
applied at all four sites exactly as the review specified — `SOURCE_SHORT_NAMES` in
`detailSourceAttribution` (now escaping unconditionally rather than only on the fallback branch),
`DIMENSION_LABELS` in both the detail dimension field and the compact segment, and
`DAY_SOURCE_FLAGS` in `hazardEntryDisplayable` (fallback `null`).

New scenario `cr03-prototype-chain-keys-in-a-payload-neither-throw-nor-hide-an-entry` feeds
`__proto__`, `constructor`, `toString`, `hasOwnProperty` and `valueOf` as both `dimension` and
`source`, asserting (i) no throw, (ii) the entry still renders and the display does not blame the
user's settings for it, (iii) no function body reaches the markup, (iv) `assertInertMarkup`
passes; plus a hostile-content case and a real-keys control. **Each of the four call sites was
mutation-verified RED independently.**

### WR-01: `showHazardsOutlook` is read three different ways

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `352285c`
**Applied fix:** `if (this.config.showHazardsOutlook === true)` at the window-band gate and
`this.config[ADVISORY_SOURCES[key]] !== true` in `enabledAdvisories`, matching
`hazardEntryDisplayable`'s stated CFG-01 convention.

`cr03-day-rows-honor-every-per-product-toggle` case (d) extended: under
`showHazardsOutlook: "yes"` / `showSPCMD: "yes"` the day row, the "Extended Hazards:" band and the
advisory sub-section must ALL be hidden, with a boolean control proving the fixture renders every
half. Each gate mutation-verified RED separately.

### WR-02: The compact line and its own detail sub-row disagree about an entry with no label

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `016c9ae`
**Applied fix:** Hoisted `entryText(h)` = `String((h && (h.text || h.label)) || "")` and routed
the compact segment, the detail winner row and the `also:` competitor row through it.

**Extension beyond the suggested patch:** the review said "skip the entry entirely when it yields
`""`" at the render sites; the skip is instead implemented once *structurally* in
`hazardEntryDisplayable`, above the `applyDisplayGates === false` escape hatch. This is the file's
own architecture ("the ONE definition of may this hazard entry be shown at all") and it also keeps
the CR-02 discriminator honest — a textless entry is not content the user's settings hid, so it
must not read as "(filtered by settings)". Consequence: a textless entry now produces no segment,
no day row and no sub-row in either mode, rather than a day row with an empty segment.

New scenario `wr02-an-entry-with-no-text-renders-nothing-rather-than-the-word-undefined` covers
compact, detail, a mixed day proving both modes agree entry-by-entry, a label-only vacuity guard
and the empty-string case.

### WR-03: Detail-mode vertical rhythm is driven by days that never render

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `9dd0a97`
**Applied fix:** Added `daySurvivors(d).length > 0` to the `autoExpand` scan, the review's second
option — the same set the day loop below renders and expands. A proximity-only day is excluded for
the same reason (it renders, but its `continue` means it never expands).

New scenario `wr03-vertical-rhythm-follows-the-days-that-actually-render`: the gated case, a
`showHeatRisk: true` control proving the rhythm IS applied when a day really expands, and a
suppressed-only variant.

### WR-04: The 60-char label bound still means two different things in the two modes

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `de24c21`
**Applied fix:** Both sites now apply `truncateHazardLabel` to the entry's own text and compose
prefix / proximity badge / padding around the truncated result. The unmapped-dimension passthrough
is payload-controlled and unbounded, so it is truncated on its own account (T-16-20) rather than
spending the label's budget — a no-op for a mapped dimension.

Two existing scenarios pinned the *defective* semantics and were corrected, not worked around:
`wr02-unified-compact-segment-...` expected 55 A's (55 + the 5-char "Wind " prefix = the old,
wrong composition) and now expects 60, with a new cross-mode assertion that both modes cut the
same label at the same offset and a long-unmapped-dimension case;
`wr04-detail-label-truncation-...` counted 2 truncated rows and now counts 3 — the compact header
agreeing with its own sub-rows is the point of the finding — plus a new assertion that the
proximity badge survives a truncated label intact. Both call sites mutation-verified RED.

### WR-06: The probe runner owns helper isolation but not log isolation

**Files modified:** `scripts/probe-payload-resilience.js`, `scripts/probe-lib/module-stubs.js`
**Commit:** `b047ac9`
**Applied fix:** (a) `resetLogs()` now runs immediately after `resetHelper(helper)` in the runner
loop, and `module-stubs.js`'s stale comment ("every scenario calls resetLogs() after
resetHelper()") is replaced with the contract that is now true. (b) the per-scenario catch prints
`err && err.stack ? err.stack : err`, consistent with `main().catch` two lines below.

Verified empirically rather than by a new scenario (the runner cannot assert on itself from inside
a scenario): (a) by temporarily asserting `logCalls.length === 0` at the top of every scenario
across a full 173-scenario run; (b) by injecting a `TypeError` into `getDom()` and confirming the
failure output now names the `getDom` frame and its call site.

## Skipped Issues

### WR-05: `enabledSourceCount` is now dead payload weight with a probe pinning a value nothing reads

**File:** `node_helper.js:3717-3741`; `scripts/probe-payload-resilience.js`
(`rpt05-no-products-enabled-branch-is-retired-and-its-count-has-a-floor-of-two`)
**Reason:** skipped — every available option is a payload-contract or product decision, not a code
correctness fix. The review's own preferred remedy is to "open a D-16 contract amendment to drop
the field", and D-16 explicitly locks the seven flat summary fields; removing one from a locked
contract is an operator decision. The stated alternative (re-deriving the count from
`SOURCE_IDS.length` minus disabled toggles) changes the field's meaning while keeping it unread,
which is not obviously an improvement, and the third suggestion (giving `reportingSourceCount` the
retired branch's discriminator role) is a new user-facing empty state — new UI in a phase framed as
display-only, and directly adjacent to the operator decision that retired the branch in the first
place.

Nothing here is incorrect at runtime: the field is emitted, documented as diagnostic-only, and its
probe currently pins a real product fact (the always-on core cannot be disabled). The finding is
about dead weight and a probe that documents rather than tests, both of which are safe to carry
until the D-16 amendment is decided.

**Recommended next step:** decide the D-16 amendment; if the field is dropped, the computation,
its 25-line justification comment in `_buildGridSummary` and the `rpt05-...-floor-of-two` scenario
should all go in one commit.

## Not in scope (carried forward)

IN-01 through IN-05 were not attempted — `fix_scope: critical_warning`. Note that IN-04
(`truncateHazardLabel` can split a surrogate pair) is now touched by WR-04's changes at both call
sites and remains the cheapest of the five; the WR-04 commit did not change the slicing behaviour.

---

_Fixed: 2026-09-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
