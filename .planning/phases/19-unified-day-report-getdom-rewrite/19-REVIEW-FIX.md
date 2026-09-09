---
phase: 19-unified-day-report-getdom-rewrite
fixed_at: 2026-09-08T00:00:00Z
review_path: .planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md
iteration: 3
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 19: Code Review Fix Report (iteration 3)

**Fixed at:** 2026-09-08
**Source review:** `.planning/phases/19-unified-day-report-getdom-rewrite/19-REVIEW.md`
**Iteration:** 3

**Summary:**
- Findings in scope: 10 (3 BLOCKER + 7 WARNING; the 4 Info findings are out of `critical_warning` scope)
- Fixed: 10
- Skipped: 0

**Harness:** `node scripts/probe-payload-resilience.js` → `181 passed, 0 failed, 0 skipped`
(was `173 passed` at review time; 8 new scenarios, 5 existing scenarios extended in place).
Every fix was mutation-verified RED by reverting it in place and re-running, and the mutation
is named in the source comment or the scenario comment so the next reader can repeat it.

---

## Fixed Issues

### BL-01: the CR-02 carve-out reopens the confident-all-clear-over-a-contradicting-summary hole

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `5efe2ce`

The iteration-2 `rawWindowBandCount === 0` term disabled the disagreement check for every
reason `anyHazard` can be true, not just the wholly-elapsed-band reason it documents. It is
replaced by `bandIsTheOnlySummaryTerm`, which excuses `anyHazard` only when the band is the
only term that could have set it — reading the summary's own published `activeDays` and
`bandDiagnostics.advisoryCount` (D-16 fields, no new payload contract).

**One term added beyond the review's suggestion:** `gridReadable`. The carve-out asserts "the
render is empty for a structural reason", which is only assertable when the grid this render
walked was readable at all. With the review's term alone, the review's own row 1 and row 2
(`days: null` / all-14-corrupt, each beside an elapsed band) would have stayed CONFIDENT,
because a fixture whose summary reports `activeDays: []` does not claim a day hazard — the
band really would be the only summary term. `gridReadable` is what makes those two rows red:
`anyUngatedContent()`'s day loop reports "nothing" from evidence it could not read, the exact
circularity CR-02's own note names, so a band entry must not license a confident all-clear
over it.

The review's row 3 (suppressed-only day + band) is red for a different and more precise
reason: its composed fixture carries `activeDays: [3]`, which is what `_buildGridSummary`
publishes alongside a day-derived `anyHazard`. A summary naming an active day over a grid with
no survivor is a genuine disagreement; the same grid under `activeDays: []` is not one, and is
deliberately left confident.

Probe `cr02-...` gains cases (h)-(l): the elapsed band composed with `days: null`, corrupt
days, the summary-names-an-active-day contradiction, and the advisory term — plus (l), a
healthy fourteen-quiet-day poll carrying one elapsed band entry, which must stay confident.

Mutation-verified RED **three** ways, both directions pinned as required:
- restore `rawWindowBandCount === 0` (over-broad) → (h) goes confident
- drop the carve-out entirely (the pre-iteration-2 form) → (e) and (l) slander a healthy poll
- neutralize `gridReadable` → (h) goes confident

### BL-02: two co-equal survivors on one dimension render as winner + `also:` competitor

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `ae26a99`

Winners are now distinguished by what the payload says (`suppressedBy === null`) rather than
by arrival order; a second survivor on the same dimension becomes a co-winner and renders as a
full winner-shaped row with the dimension field blank (padded to the first row's own rendered
width, so an over-long unmapped dimension string still columns). `also:` is reserved for
`suppressedBy !== null`. `convectiveDetailAugment` moved inside the row loop so it is read
per entry rather than once per group — its whole input is `entry.detail`.

Probe `bl02-...`: two `wpc-hazards` winter labels on one day, asserting both render, no
`also:` is claimed, the dimension label is written once, the co-winner's field is blank and
column-aligned, and the compact header agrees — plus a control that a genuinely suppressed
competitor still renders `also:`. Mutation-verified RED.

### BL-03: the window band renders `D0` / negative day numbers for a partially-elapsed window

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`,
`.planning/phases/19-unified-day-report-getdom-rewrite/19-UI-SPEC.md`
**Commit:** `11d8e4e`

A window that started in the past and has not ended now renders open at the low end
(`through Fri (→D4)`) rather than clamped. Clamping alone — the review's literal suggestion —
would have paired a PAST start weekday with a present-day offset, reproducing the same
two-halves-disagreeing shape one level down; the elapsed portion is not forecastable content,
so it is not advertised at all. `off()` also gains the `Math.max(1, ...)` floor, documented as
second-line defence rather than as the fix, so no future call site can reintroduce a `D0`.

UI-SPEC's band section records the new offset form (its previous text said the formatting was
"unchanged from today", which the fix would otherwise have silently falsified).

Probe `bl03-...`: `offsetStart: -1, offsetEnd: 3` plus start-today and single-day controls
proving the non-negative formatting is untouched. Mutation-verified RED.

### WR-01: the window band renders the literal word `undefined` for a label-less entry

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `d77f680`

`typeof entry.label === "string" && entry.label.length > 0` added to the shared
`renderableWindowEntries` predicate, so the empty-render discriminator and the renderer keep
agreeing about what the band holds. Probe `wr01-a-label-less-band-entry-...` covers a mixed
band, a band whose only entry is label-less (no orphan heading, no false settings blame), and
an empty-string label. Mutation-verified RED.

### WR-02: an advisory entry with no `label` renders `undefined in effect.`

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `7e2a931`

"Has a usable label" extracted into a shared `advisoryEntryDisplayable` predicate and read by
the render loop, so the guard tests the field it is about. Probe `wr02-a-labelless-advisory-...`
covers `{}`, empty-string and non-string labels, with a well-formed control (label plus hazard
type suffix). Mutation-verified RED.

### WR-03: a malformed advisory array is reported to the user as `(filtered by settings)`

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `7e8e62f`

`enabledAdvisories` now filters through the same `advisoryEntryDisplayable` the render loop
applies — one predicate, both readings. `advisories: { spcMD: [null] }` under a summary that
counts it is now `(unconfirmed)` (a payload/summary disagreement) rather than blaming the
user's config; under an honest summary it is simply a quiet poll. Probe `wr03-...` pins all
three states including the control that a real advisory hidden by this instance's own setting
still says `(filtered by settings)`. Mutation-verified RED.

### WR-04: a suppressed `dimension: null` entry is silently dropped in detail mode

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `ec52f0b`

`if (!group.winner) continue;` replaced with promotion of the first competitor. Nothing is
misrepresented by promotion: `suppressedBy` is rendered nowhere (an `also:` row does not name
its suppressor either), so it changes only whether the entry is SEEN — and D-05 already shows
suppressed entries in detail mode. Probe `wr04-...` pins the containment posture with a
`some-future-source` unmapped entry beside a survivor. Mutation-verified RED.

### WR-05: a non-string upstream `LABEL` takes the whole poll to `{ error }`

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `aa036ee`

Both halves the review offered, deliberately: coerced at the boundary
(`f.properties.LABEL == null ? "" : String(f.properties.LABEL)`) as the fix, and
`String(a.label).localeCompare(String(b.label))` as second-line defence for the several other
entry paths into `day.hazards` that never pass through `extractPolygons`.

Probe `wr05-...` calls the two production methods directly (the precedent
`rpt02-autoexpand-...` set): `extractPolygons` with a numeric `LABEL`, which the probability
layers' own `parseFloat(label)` toValue admits without complaint, and
`_resolveGridDayPrecedence` on a day carrying **two** numeric labels — one is not enough,
because the engine may call the comparator as `(b, a)` and a lone numeric label that lands in
`b` never touches `.localeCompare`. Each half mutation-verified RED independently.

### WR-06: the frontend probe's DOM stub cannot observe `innerHTML` re-serialization

**Files modified:** `scripts/probe-lib/module-stubs.js`,
`.planning/phases/19-unified-day-report-getdom-rewrite/19-PARITY-CHECKLIST.md`
**Commit:** `ea8bf90`

Documentation-only, as the review scoped it. `assertInertMarkup`'s comment now names BOTH
limitations (lexical rather than parsed, and scanning a concatenated string a real node would
have re-parsed and re-serialized on every `+=`), and Probe Coverage gains row 41 as
`MANUAL ONLY`. The "three rows marked MANUAL ONLY" cross-reference further down the checklist
was updated in the same commit so the document does not contradict itself.

### WR-07: the poll interval timer is never retained or cleared

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-lib/module-stubs.js`,
`scripts/probe-payload-resilience.js`
**Commit:** `bd28b32`

`_armPollTimer` / `_clearPollTimer` are the single sites that create and destroy the handle,
with `suspend`/`resume` on top; arming is idempotent, so a double `resume` (which MagicMirror
is free to deliver) cannot leave two timers polling the same endpoints.

The probe's DOM stub had `setInterval: () => 0` and no `clearInterval` at all — it could not
express the state this fix is about, so it gained an observable pair backed by a
per-loaded-module `Map` exposed as a non-enumerable `frontend._probeLiveTimers`. Probe
`wr07-...` covers start / suspend / resume / double-resume plus the re-armed timer's interval
and callback. Mutation-verified RED for a discarded handle and for non-idempotent arming.

---

## Skipped Issues

None — all ten in-scope findings were fixed.

For the record, matching the previous report's disclosure: the iteration-2 `WR-05`
(`enabledSourceCount`) was skipped pending a D-16 contract decision and the reviewer confirmed
that skip was correct and did not re-report it. The `WR-05` fixed above is a **different**
finding that reuses the identifier (`extractPolygons` LABEL coercion). The `enabledSourceCount`
question remains where the operator left it.

## Not in scope

IN-01 (`DIMENSION_ORDER`'s vacuous permutation assertion), IN-02 (`hasConvectiveDetail`'s
name), IN-03 (`buildWpcHazardsMap`'s one-directional validation) and IN-04
(`anyUngatedContent()` evaluated twice) are Info-severity and outside this pass's
`critical_warning` scope. None were touched. IN-04 in particular is now adjacent to changed
code (the BL-01 rewrite sits between its two call sites), so a future pass should re-read it
rather than assuming the review text still describes the lines verbatim.

---

_Fixed: 2026-09-08_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 3_
