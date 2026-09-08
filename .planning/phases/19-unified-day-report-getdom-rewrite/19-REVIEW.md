---
phase: 19-unified-day-report-getdom-rewrite
reviewed: 2026-09-07T00:00:00Z
depth: standard
files_reviewed: 4
files_reviewed_list:
  - hazardTaxonomy.js
  - MMM-SPCOutlook.js
  - node_helper.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 3
  warning: 6
  info: 5
  total: 14
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-09-07
**Depth:** standard (re-review after the 19-REVIEW-FIX pass; scoped to the four submitted files)
**Files Reviewed:** 4
**Status:** issues_found

## Summary

This is iteration 2. I first verified the eleven findings the fix report claims resolved. **All eleven
landed and are real fixes**, not paper ones:

| Prior finding | Verified at | Verdict |
|---|---|---|
| CR-01 unescaped proximity badge | `MMM-SPCOutlook.js:920-922` | FIXED |
| CR-02/03/04 dropped day gates | `hazardEntryDisplayable` `:698-724`, `dayDisplayableHazards` `:729`, `daySurvivors` `:738` | FIXED — collapsed into one predicate, structurally sound |
| WR-03 discarded `reportedDays` read | `node_helper.js:3507` | FIXED — computation and both empty branches gone, parameter removed |
| WR-04 truncation counts padding | `MMM-SPCOutlook.js:343-347, 501-504, 518-520` | FIXED (but see WR-04 below — the bound is still not the same in both modes) |
| WR-05 days 4-8 unguarded lookups | `node_helper.js:3285-3295` | FIXED |
| WR-06 closure-mutating renderers | `:459-527`, `:602-659` | FIXED — both return strings |
| WR-07(a)/(b) harness | `probe-lib/module-stubs.js:309-342`, `probe-payload-resilience.js:13494` | FIXED |
| WR-01/WR-02 empty-render split | `MMM-SPCOutlook.js:1010-1037`, `node_helper.js:3717-3741` | LANDED, but introduced CR-02 below |

`scripts/probe-payload-resilience.js` runs **168 passed, 0 failed, 0 skipped** on this tree, and
`assertInertMarkup` is a genuine improvement — it is now structurally hard to reintroduce the CR-01
class.

None of that makes this code correct. Every finding below is **newly found in this iteration**, is
**reproduced against the project's own harness** (`scripts/probe-lib/module-stubs.js`, transcripts
inline), and is **invisible to all 168 green scenarios**. Three are blockers:

1. **The D-08 proximity-only day cannot render in production at all.** The unified gate reads
   `summary.anyHazard`, which the backend computes with no proximity term; the legacy gate's three
   `!hasAnyRenderableProximity(...)` terms were dropped and no parity-checklist row records their
   removal. The one probe covering D-08 hand-sets `anyHazard = true` and says so in a comment.
2. **The WR-01 fix narrowed "(unconfirmed)" too far.** A fresh, confirmed payload whose own
   `summary.anyHazard === true` but whose day grid is unreadable now renders the *confident*
   "No Hazards Forecast" — the exact dishonesty CR-01's doctrine exists to forbid, and a
   regression from the pre-fix behaviour.
3. **Payload-keyed prototype-chain lookups.** Three of the four maps the CR-03 fix introduced or
   touched are read with bare bracket syntax on payload-controlled keys. One produces a
   `TypeError` that takes the module's entire render down; another silently hides a hazard entry,
   inverting the fail-safe direction the code's own comment at `:674-676` promises. The codebase
   already states the correct idiom for exactly this class at `hazardTaxonomy.js:252-262` (T-18-01)
   and applies it on the backend.

Findings 2 and 3 are both *consequences of the fix pass itself*, which is the specific risk of a
large structural fix landing without a re-review of its own new surface.

## Narrative Findings (AI reviewer)

## Critical Issues

### CR-01: The D-08 proximity-only day row is unreachable against any real payload

**File:** `MMM-SPCOutlook.js:849` (the gate) vs `:741-749, 907-925` (the branch it starves);
`node_helper.js:3688-3711` (`anyHazard`'s derivation)
**Severity:** BLOCKER — a shipped v1.2 feature the phase explicitly promised to preserve is dead
code in production, and the display asserts an all-clear over data it holds.

`dayProximityOnly()` is the "one named exception to D-03's *no survivor, no row* rule, so the
shipped v1.2 PROXUI outside-mode behaviour is not lost at default config" (`:741-744`). It is
gated behind the no-risk short-circuit at `:849`:

```js
summaryOk && summary.anyHazard === false && !this.spcrisk._stale
```

`summary.anyHazard` is computed by `_buildGridSummary` as
`anyDayHazard || windowBandCount > 0 || advisoryCount > 0` (`node_helper.js:3711`), where
`anyDayHazard` is purely `entry.suppressedBy !== null` over `day.hazards`. **Proximity is not a
term anywhere in it.** So on the only day that matters — nothing active anywhere, a nearby polygon
edge — `anyHazard` is `false`, the short-circuit fires, and the proximity row is never reached.

The pre-19 gate had exactly the missing terms
(`9143705:MMM-SPCOutlook.js:434-436`):

```js
!hasAnyRenderableProximity(this.spcrisk.day1.proximity) &&
!hasAnyRenderableProximity(this.spcrisk.day2.proximity) &&
!hasAnyRenderableProximity(this.spcrisk.day3.proximity) &&
```

Reproduced against `probe-lib/module-stubs.js` (`proximityWeighting: true`, day 1 carrying a
renderable outside-mode categorical proximity, everything else quiet, `_stale` unset):

```
A (anyHazard from the real derivation): "No Hazards Forecast"
B (anyHazard forced true, as the probe does):
   "<span style=\"white-space:pre-wrap\">Day 1 (Fri)  0.3 (near MRGL)</span><br/>"
```

The suite reports coverage for this. `rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap`
(`scripts/probe-payload-resilience.js:11759`) does:

```js
// A real payload derives anyHazard from this same grid entry (19-02); stated
// directly here to isolate D-08's render behavior from that derivation.
payload.summary.anyHazard = true;
```

That comment is the tell — the scenario opts out of the one derivation that decides whether the
branch runs at all, so it is green against a payload the backend cannot emit. Parity checklist rows
33/34 record `dayProximityOnly` as `hasAnyRenderableProximity`'s successor for the *render* site and
never mention its second, load-bearing use at the *gate* site. `D-08-EXC` is marked
`NOT OBSERVABLE` on both hardware runs, so nothing caught it there either.

**Fix:** the gate must consult proximity, using the same predicate the render uses so the two cannot
drift (the WR-04 rule this file already states at `:735-737`):

```js
const anyProximityOnlyDay = () => {
  const days = this.spcrisk && this.spcrisk.days;
  if (!days || typeof days !== "object") return false;
  for (let n = 1; n <= 14; n++) if (dayProximityOnly(days[String(n)])) return true;
  return false;
};
// gate: summaryOk && summary.anyHazard === false && !this.spcrisk._stale && !anyProximityOnlyDay()
```

Then amend `rpt02-proximity-only-day-...` to stop forcing `anyHazard` (a quiet payload with only a
proximity subtree already has `anyHazard: false` naturally), and add a control asserting the row
still renders with `anyHazard: false`. That control fails RED today.

---

### CR-02: A confident all-clear is rendered over a payload that says a hazard exists

**File:** `MMM-SPCOutlook.js:1029-1036`
**Severity:** BLOCKER — incorrect behavior; a regression introduced by the WR-01 fix, and a direct
violation of the CR-01 doctrine that fix pass claims to be protecting.

The empty-render discriminator is:

```js
const unconfirmed = !summaryOk || !!this.spcrisk._stale;
if (unconfirmed)            wrapper.innerHTML += NO_HAZARD_TEXT_UNCONFIRMED;
else if (anyUngatedContent()) wrapper.innerHTML += NO_HAZARD_TEXT_FILTERED;
else                          wrapper.innerHTML += NO_HAZARD_TEXT;
```

There is a fourth state, and it falls into the confident branch: **the summary is well-formed and
asserts `anyHazard: true`, the payload is fresh, nothing rendered, and no display gate explains
it.** That is a *summary-vs-render disagreement* — precisely the "gate/render disagreement
(Pitfall 9)" the `contentMarker` mechanism exists to catch, per its own comment at `:870-875`. The
old code emitted `"(unconfirmed)"` here. The new ladder emits the unqualified confident string.

Reproduced two ways, both with `summary.anyHazard: true`, `_stale` unset, every toggle on:

```
8 days: null,        summary.anyHazard true -> "No Hazards Forecast"
9 days: 14 corrupt   summary.anyHazard true -> "No Hazards Forecast"
```

`anyUngatedContent()` (`:787-798`) cannot rescue this: it re-reads the same unreadable `days`
(`dayDisplayableHazards` returns `[]` for a non-object day, `:730`) and therefore also reports
"nothing", so the code concludes "genuinely nothing to show" from evidence that says the opposite.
The comment at `:813-818` claims "a malformed summary … falls through … the contentMarker fallback
below supplies the unconfirmed string" — but only `summary` malformation is covered; malformation
*below* the summary is not, even though the summary itself contradicts the render.

The fix report states this was "mutation-verified RED four ways: inverted precedence, dropped
filtered branch, day-grid-only discriminator, and a discriminator using the *gated* reading." None
of the four is a summary/render disagreement, which is why 168 green scenarios miss it.

**Fix:** add the disagreement as its own term in `unconfirmed`, keeping case 1's documented
precedence:

```js
// The summary asserts content that this render could not produce. Whatever the cause
// (a truncated days object, a shape change between helper and frontend), an all-clear
// asserted over a contradiction is not a confirmed all-clear.
const summaryContradictsRender = summaryOk && summary.anyHazard === true && !anyUngatedContent();
const unconfirmed = !summaryOk || !!this.spcrisk._stale || summaryContradictsRender;
```

Add a scenario pinning `{ days: null, summary.anyHazard: true, _stale: unset }` -> `"(unconfirmed)"`,
plus a control proving a *well-formed* fully-filtered payload still reaches
`"(filtered by settings)"` (i.e. the new term does not swallow WR-01's case 2).

---

### CR-03: Payload-keyed prototype-chain lookups — one crashes the whole render, one silently hides a hazard

**File:** `MMM-SPCOutlook.js:327` (`SOURCE_SHORT_NAMES[source]`), `:490` and `:932`
(`DIMENSION_LABELS[h.dimension]`), `:711` (`DAY_SOURCE_FLAGS[h.source]`)
**Severity:** BLOCKER — uncaught `TypeError` out of `getDom()` destroys the module's entire render;
separately, a silent inversion of a documented fail-safe invariant.

All four maps are plain object literals read with bare bracket syntax on a key taken from the
payload. `Object.prototype`'s own keys therefore resolve as hits.

**(a) Crash.** `DIMENSION_LABELS["toString"]` returns `Object.prototype.toString`, a function, which
is truthy, so the `||` fallback never fires:

```js
const dimensionField = (group.dimension === null
  ? "" : (DIMENSION_LABELS[group.dimension] || group.dimension)
).padEnd(DIMENSION_FIELD_WIDTH);   // <- .padEnd is not a function
```

Reproduced (detail mode, one day-1 entry with `dimension: "toString"`):

```
TypeError: (intermediate value)(intermediate value)(intermediate value).padEnd is not a function
    at renderDaySubRows (MMM-SPCOutlook.js:491:11)
    at Object.getDom (MMM-SPCOutlook.js:950:34)
```

This throws past every day, the advisory band and the window band — the module renders nothing at
all. It is the exact failure class the file already fixed once and documents at `:974-980`
("threw `advisories.mpd is not iterable` out of getDom and took the module's ENTIRE render with
it"), and it contradicts the T-19-16 containment claim stated at `:880-882` ("A missing/malformed
`days` object or an individual day skips rather than throwing").

**(b) Silent suppression, fail-safe inverted.** `DAY_SOURCE_FLAGS["constructor"]` returns
`Object.prototype.constructor` — truthy — so `flag` is a *function*, `this.config[flag]` is
`undefined`, `undefined !== true`, and the entry is **hidden**. The comment three lines above
promises the opposite:

> The fail-safe direction documented at lines 497-508 is preserved: an UNLISTED source is never
> hidden … (`:673-676`)

Reproduced (one day-1 convective entry, `source: "constructor"`, every toggle on):

```
"No Hazards Forecast (filtered by settings)"
```

Note the compounding: the entry vanishes *and* the display blames the user's settings for it.

**(c) Unescaped concatenation.** `detailSourceAttribution` (`:326-328`) returns
`SOURCE_SHORT_NAMES[source] || escapeHtml(String(source))` and its result is concatenated into
`innerHTML` raw at `:507` and `:523`. On a prototype hit the *unescaped* branch is taken. Today
every such value is a native function whose `toString()` contains no HTML metacharacter, so this is
not currently exploitable — but the escape decision is being made by whether a prototype lookup hit,
which is not a property anyone should be relying on.

**Reachability, stated honestly:** `h.dimension` comes from `dimensionOf()`, which *is*
`hasOwnProperty`-guarded (`hazardTaxonomy.js:256-262`), and `h.source` is a string literal at every
emission site — so no remote input reaches these keys through today's backend. The defect is that
the frontend's containment posture is asserted rather than implemented, in a file whose own comments
(`:813-818`, `:880-882`, `:974-980`) repeatedly promise that a malformed payload degrades rather
than throws, and in a codebase that already committed to the guarded idiom on the backend for
literally this reason:

> Both lookups are hasOwnProperty-guarded — the same idiom node_helper.js:822 already uses … so an
> upstream label of "__proto__" or "constructor" cannot resolve through Object.prototype (T-18-01).
> — `hazardTaxonomy.js:252-255`

**Fix:** one helper, four call sites:

```js
const lookup = (map, key, fallback) => (
  Object.prototype.hasOwnProperty.call(map, key) ? map[key] : fallback
);
// :327  "   — " + escapeHtml(String(lookup(SOURCE_SHORT_NAMES, source, source)))
// :490  lookup(DIMENSION_LABELS, group.dimension, String(group.dimension))
// :711  const flag = lookup(DAY_SOURCE_FLAGS, h.source, null);
// :932  lookup(DIMENSION_LABELS, h.dimension, String(h.dimension))
```

Note `:327` should escape unconditionally — the current split escapes only the fallback branch.
Add a scenario feeding `"__proto__"`, `"constructor"` and `"toString"` as `dimension` and as
`source`, asserting (i) no throw, (ii) the entry still renders (fail-safe direction), (iii)
`assertInertMarkup` passes.

## Warnings

### WR-01: `showHazardsOutlook` is read three different ways, so the band and the day rows disagree about it

**File:** `MMM-SPCOutlook.js:1001` (truthy) vs `:709-712` (`!== true`) vs `:589` (truthy, advisories)
**Issue:** The CR-03 fix comment states the convention explicitly — "strict `!== true`, matching the
showDrought/showMinorHeat convention exactly — an absent or non-boolean flag behaves like false, per
CFG-01's default" (`:709-711`) — and probe scenario `cr03-day-rows-honor-every-per-product-toggle`
pins it with a `showHeatRisk: "yes"` case. But the window band gate two hundred lines below is a
bare truthiness test, and `enabledAdvisories` uses `!this.config[...]`. The same flag therefore
gates two halves of the same product in opposite directions.

Reproduced (`showHazardsOutlook: "yes"`, one `wpc-hazards` day entry and one window-band entry):

```
"Extended Hazards:<br/>Tue (D5): <span style=\"color:#0000ff\">Heavy Snow</span><br/>"
```

The day row is gone; the band renders. This is the split-brain the file's own WR-09 doctrine
(`:572-579`) exists to prevent, now reintroduced between two halves of one product.

**Fix:** `if (this.config.showHazardsOutlook === true)` at `:1001`, and
`if (applyDisplayGates !== false && this.config[ADVISORY_SOURCES[key]] !== true) continue;` at
`:589`. Extend `cr03-day-rows-honor-every-per-product-toggle`'s non-boolean case (d) to assert the
band is hidden too.

### WR-02: The compact line and its own detail sub-row disagree about an entry with no label

**File:** `MMM-SPCOutlook.js:932-933` vs `:501-503`
**Issue:** The whole point of the CR-02/03/04 fix was that "a sub-row list built from a different
filter contradicted [the compact header]" (`:453-458`). The two renderers now share the *filter* but
still coerce the entry's text differently:

```js
// :932 compact
(DIMENSION_LABELS[h.dimension] || h.dimension) + " " + (h.text || h.label)   // -> "Convective undefined"
// :502 detail
String(group.winner.text || group.winner.label || "")                        // -> "Convective   " (blank)
```

Reproduced (entry with neither `text` nor `label`):

```
"<span ...>Day 1 (Fri)  <span style=\"color:#e06666\">Convective undefined</span></span><br/>"
```

The compact line renders the literal word `undefined` — the failure class this file names at
`:983-984` and `:205-207` ("no `undefined%`/`NaN%` — no segment rather than a bad one"). Note also
that `:932` counts the *dimension prefix* against `truncateHazardLabel`'s 60-char bound while
`:501` counts the *proximity suffix* instead, so the two lines apply the bound to two different
strings (see WR-04).
**Fix:** hoist one `entryText(h)` helper (`String(h.text || h.label || "")`) and have both renderers
call it; skip the entry entirely when it yields `""`, matching the `:985` guard's intent.

### WR-03: Detail-mode vertical rhythm is driven by days that never render

**File:** `MMM-SPCOutlook.js:890-896`
**Issue:** `detailModeActive` scans all fourteen `day.autoExpand` flags *before* any display gate is
applied. `autoExpand` is computed by `_resolveGridDayAutoExpand` on the ungated payload, so a day
whose only significant entry belongs to a disabled product still flips the whole render into detail
rhythm — every rendered day gets a trailing `<br/>` while *nothing anywhere expands*.

Reproduced (`dayReportDetail: false`, `showHeatRisk: false`; day 2 carries an auto-expanding
HeatRisk Extreme entry, day 1 an ungated convective entry):

```
"...Day 1 (Fri)  <span ...>Convective Slight</span></span><br/><br/>"     <- trailing blank line
   control, showHeatRisk:true -> Day 2 renders and expands (rhythm justified)
```

UI-SPEC's rule is "once ANY day *in this render* is in detail mode" (`:884-889`); a gated-away day
is not in this render.
**Fix:** derive `detailModeActive` from the days that actually render — either compute it inside the
loop over days that passed `survivors.length > 0 || proximityOnly`, or add
`daySurvivors(d).length > 0` to the `:894` condition.

### WR-04: The 60-char label bound still means two different things in the two modes

**File:** `MMM-SPCOutlook.js:501-503` vs `:930-935`
**Issue:** The prior WR-04 fix correctly stopped padding from consuming the budget, but the two call
sites still measure different strings. Detail mode truncates `label + augment.labelSuffix`, so a
long label eats the proximity badge and the `…` lands on the badge rather than the label; compact
mode truncates `dimensionLabel + " " + label`, so up to 13 characters of *module-authored* prefix
consume the remote-content budget. Neither matches T-16-22's stated intent (`:266`, "the bound
counts source characters"), and the two modes can still cut the same label at different points —
the class of drift the fix pass set out to close.
**Fix:** apply `truncateHazardLabel` to the entry's own label text only, at both sites, then compose
prefix/suffix/padding around the truncated result.

### WR-05: `enabledSourceCount` is now dead payload weight with a probe pinning a value nothing reads

**File:** `node_helper.js:3717-3741`; `scripts/probe-payload-resilience.js` (`rpt05-...-floor-of-two`)
**Issue:** The WR-02 fix correctly deleted the unreachable frontend branch, but kept the field,
its computation, its 25-line justification comment and a probe that asserts its floor is 2. The
stated reason — "D-16 locks these seven flat fields and a display change must not quietly break a
locked payload contract" — is sound for the *shape*, but the result is a field with no consumer
anywhere in the codebase, plus a probe whose only remaining job is to notice if someone makes the
always-on core configurable. That is a documentation assertion wearing a test's clothing, the same
shape WR-03 deleted from `_resolveGridDayPrecedence` in this very fix pass.
**Fix:** either emit it as a literal derived from `SOURCE_IDS.length` minus disabled toggles with
a one-line comment, or (preferred) open a D-16 contract amendment to drop the field and delete the
computation, the comment and the probe together. If it is kept, `reportingSourceCount` — which
*is* meaningful and *can* reach zero — deserves the discriminator role the retired branch wanted.

### WR-06: The probe runner owns helper isolation but not log isolation

**File:** `scripts/probe-payload-resilience.js:13484-13500`; `scripts/probe-lib/module-stubs.js:246-254`
**Issue (a):** WR-07(b)'s own stated rule is "isolation is the RUNNER's job, not each scenario's …
Resetting here makes forgetting impossible." The runner calls `resetHelper(helper)` but not
`resetLogs()`, so log isolation is still each scenario's responsibility (173 `resetLogs()` calls
across 189 entries) and a scenario that forgets inherits the previous scenario's `logCalls` plus the
runner's own `start()` line. `module-stubs.js:252-253` still documents the old contract ("every
scenario calls resetLogs() after resetHelper()"), which the runner change made false.
**Issue (b):** the runner's catch prints `err.message` only (`:13500`). A `TypeError` like CR-03(a)
reports as a bare "x.padEnd is not a function" with no frame — the stack that names
`renderDaySubRows` is discarded, which is the single most useful line for whoever has to fix it.
`main().catch` two lines below already prints `err.stack`, so the runner is inconsistent with itself.
**Fix:** call `resetLogs()` beside `resetHelper()` in the loop and update the stale comment; print
`err.stack || err.message` in the per-scenario catch.

## Info

### IN-01 (CONVENTION): Probability text is unformatted floating-point multiplication

**File:** `MMM-SPCOutlook.js:391, 400, 409`
**Deviation:** `(100 * detail.torRisk) + "% "` with no rounding.
**Convention violated:** this file's own "no `undefined%`/`NaN%` — no segment rather than a bad
one" rule (`:205-207`). A value like `0.29` renders `28.999999999999996%`. Latent today because
SPC's shipped probability set is exact in binary-adjacent cases.
**Suggested fix (recommend, non-blocking):** `Math.round(100 * detail.torRisk)`.
Carried over unfixed from iteration 1 (`fix_scope: critical_warning`).

### IN-02 (CONVENTION): `void HEATRISK_DAY_SPAN_END;` is a documentation-only binding

**File:** `hazardTaxonomy.js:50-51`
**Deviation:** a module-level const exists solely to be discarded by `void`.
**Convention violated:** the file's own header calls itself "pure static configuration"; the fix
pass deleted precisely this pattern from `node_helper.js` under WR-03 ("documentation wearing
code's clothing") but left its twin here. `node_helper.js:3684` has a third instance
(`void anchorInfo`), which is more defensible since it documents a real parameter.
**Suggested fix:** fold the registry reference into the prose comment above it, or export the
constant.

### IN-03 (CONVENTION): Four frontend restatements of backend data, still with no drift check

**File:** `MMM-SPCOutlook.js:292, 297-310, 677-682`
**Deviation:** `ADVISORY_SOURCES`, `DIMENSION_LABELS`, `SOURCE_SHORT_NAMES` and now
`DAY_SOURCE_FLAGS` restate `hazardTaxonomy.js`'s `DIMENSIONS`/`DAY_SOURCE_IDS`/`ADVISORY_SOURCE_IDS`
and `productRegistry.js`'s `configFlag` column. The browser genuinely cannot `require()` them.
**Convention violated:** this project's answer to an underivable restatement everywhere else is a
load-time or probe-time assertion (`assertTaxonomyIntegrity`, `buildWpcHazardsMap`'s throw,
`rpt01-getdom-reads-no-legacy-payload-block`, `wr06-day-and-band-renderers-are-pure-string-producers`).
The CR-03 fix added a fourth restatement — the one that now *hides content* when wrong — without
adding the check. Note this is the same substrate CR-03(b) exploits.
**Suggested fix:** one static probe using `rpt01`'s source-reading technique, asserting
`DIMENSION_LABELS` keys === `DIMENSIONS`, `SOURCE_SHORT_NAMES` keys === `DAY_SOURCE_IDS`,
`ADVISORY_SOURCES` keys === `ADVISORY_SOURCE_IDS`, and `DAY_SOURCE_FLAGS` === the registry's
day-source rows that have a `configFlag`.

### IN-04 (CONVENTION): `truncateHazardLabel` can split a surrogate pair

**File:** `MMM-SPCOutlook.js:270-275`
**Deviation:** `text.slice(0, 60)` cuts by UTF-16 code unit, leaving a lone surrogate for a 60th-
position astral character.
**Convention violated:** the same function is deliberately careful about truncate-before-escape
ordering (`:266`), so correctness-about-string-boundaries is an established standard here.
**Suggested fix:** `Array.from(text).slice(0, HAZARDS_LABEL_MAX_CHARS).join("")`.
The iteration-1 fix report flagged this as "the cheapest of the five to pick up in a follow-up";
it was not picked up, and WR-04 above touches the same call sites again.

### IN-05 (CONVENTION): An advisory entry with no `label` still renders "undefined in effect."

**File:** `MMM-SPCOutlook.js:982-994`
**Deviation:** the guard checks `!entry || typeof entry !== "object"` but not the field it renders;
`escapeHtml(undefined)` yields the string `"undefined"`. Reproduced:

```
"<span style=\"color: #0059E0\">undefined in effect.</span><br/>"
```

**Convention violated:** the block's own comment (`:983-984`) names this exact failure class ("skip
… rather than rendering 'undefined in effect.'"), so the guard states an intent its implementation
does not cover.
**Suggested fix:** `if (typeof entry.label !== "string" || entry.label.length === 0) continue;`
Carried over unfixed from iteration 1.

---

_Reviewed: 2026-09-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
