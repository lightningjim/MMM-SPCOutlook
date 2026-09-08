---
phase: 19-unified-day-report-getdom-rewrite
reviewed: 2026-09-07T00:00:00Z
depth: deep
files_reviewed: 4
files_reviewed_list:
  - MMM-SPCOutlook.js
  - node_helper.js
  - hazardTaxonomy.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 4
  warning: 7
  info: 5
  total: 16
status: issues_found
---

# Phase 19: Code Review Report

**Reviewed:** 2026-09-07
**Depth:** deep (cross-file: payload contract between `node_helper.js` and `getDom()`, taxonomy consumption, probe fidelity)
**Files Reviewed:** 4
**Status:** issues_found

## Summary

The Phase 19 rewrite replaced ~10 legacy per-product render sections in `getDom()` with a single
loop over `spcrisk.days[]`. The unified loop is materially cleaner than what it replaced, and the
backend merge (`_resolveGridDayPrecedence` / `_resolveGridDayAutoExpand` / `_buildGridSummary`)
is disciplined and well-contained.

However, the rewrite **dropped three frontend gates that the legacy renderer applied** and one
of the two escape sites that the phase itself added. All four are reproducible against the
project's own probe harness (transcripts below), and none is covered by the 35-row parity
checklist or the 157-scenario probe suite:

1. The one `proximityBadge()` call site that reaches `innerHTML` **unescaped** — the sibling call
   site three functions away was explicitly patched for this in commit `5e00ab0`.
2. `showMinorHeat`'s display floor is applied in `daySurvivors()` but **not** in
   `renderDaySubRows()`, so an expanded day contradicts its own compact header.
3. Every per-product `this.config.showX` render gate is gone from the day path (pre-19,
   `renderHazardsDays` was gated on `showHazardsOutlook`).
4. `hazardsLabelDisplayable` — the 16-REVIEW WR-01 second-line-of-defense label filter — is now
   consulted only by the window band; the day rows render drought/flooding labels unfiltered.

Findings 3 and 4 matter specifically because this file's own comments (lines 537-546, 500-508)
state that backend-only gating is unsafe: `node_helper`'s `_products` is shared across module
instances of the same type, so the frontend gate is the only thing that stops instance A from
rendering content instance B enabled.

Additionally, `summary.enabledSourceCount === 0` — the "No Products Enabled" empty state added by
RPT-05 — is **unreachable** against any real payload, and the probe that covers it manufactures a
payload the backend cannot produce.

## Critical Issues

### CR-01: Remote-derived proximity tier reaches `innerHTML` unescaped on a proximity-only day

**File:** `MMM-SPCOutlook.js:764-766`
**Severity:** BLOCKER (security — stored XSS from upstream/MITM-controlled SPC GeoJSON)

`proximityBadge()`'s plain-tier branch (line 243-244) interpolates `prox.nextTier` verbatim.
`nextTier` is `best.label` from `computeProximity` (`node_helper.js:2354`), i.e. a polygon `LABEL`
property harvested from remote SPC GeoJSON. Every other call site routes it through `escapeHtml`
(line 382/391/400, added by commit `5e00ab0`) or through `detailColoredSpan`'s own `escapeHtml`
(line 337). The D-08 proximity-only branch does neither:

```js
wrapper.innerHTML += "<span style=\"white-space:pre-wrap\">" + prefix + " " +
  proximityBadge(day.proximity && day.proximity.categorical, "outside") +
  "</span><br/>";
```

Reproduced against the project's own harness:

```
$ node -e '... days["2"].proximity = { categorical: { value: 2.3, nextTier: "<img src=x onerror=alert(1)>" } } ...'
"<span style=\"white-space:pre-wrap\">Day 2 (Mon)  0.3 (near <img src=x onerror=alert(1)>)</span><br/>"
```

This is exactly the `WR-12` rule the file states at line 246-251 ("anything concatenated into an
innerHTML string is escaped first"). The probe suite pins the sub-line variant
(`wr02-detail-sub-line-proximity-badge-escapes-a-hostile-tier-token`, line 11982) but the
proximity-only scenario (`rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap`,
line 11575) uses a benign `"MRGL"` tier, so the gap is untested.

**Fix:**
```js
wrapper.innerHTML += "<span style=\"white-space:pre-wrap\">" + prefix + " " +
  escapeHtml(proximityBadge(day.proximity && day.proximity.categorical, "outside")) +
  "</span><br/>";
```
Better: escape inside `proximityBadge()` itself (its return is *always* destined for `innerHTML`),
which removes the "remember to escape at four call sites" failure mode entirely. Add a probe that
feeds a hostile `nextTier` through the proximity-only path.

---

### CR-02: `showMinorHeat` display floor is bypassed by detail sub-rows

**File:** `MMM-SPCOutlook.js:436-496` (`renderDaySubRows`) vs `621-635` (`daySurvivors`)
**Severity:** BLOCKER (incorrect behavior — the same render self-contradicts)

`daySurvivors()` applies the 17 D-01/D-02 heat floor (`h.source === "heatrisk" && h.value < heatFloor`),
but `renderDaySubRows()` re-reads `day.hazards` from scratch and filters only on
`suppressedBy === null`. A day that renders for some *other* reason therefore shows a
below-floor HeatRisk sub-row that its own compact header (one line above) deliberately omitted.

Reproduced (config `{ dayReportDetail: true }`, default `showMinorHeat: false`, day 1 carrying an
ENH convective entry plus a HeatRisk category-1 entry):

```
Day 1 (Mon)  Convective Enhanced Risk          <- compact line: no heat (correct)
  Convective   Enhanced Risk             — SPC
     <i class="wi wi-tornado"></i>5%
  Heat         Minor                     — HeatRisk   <- floor bypassed
```

Parity checklist row 30 asserts this behavior is preserved "applied only to `source === "heatrisk"`
entries inside `daySurvivors`" — which is precisely the bug: `daySurvivors` is not the only
renderer of hazard entries any more.

**Fix:** make the floor a shared predicate consulted by both renderers, in the spirit of the
file's own WR-04 rule ("declared once, called from both the render-decision site and the render
body"):
```js
const passesDisplayFloor = (h) => !(h.source === "heatrisk" &&
  typeof h.value === "number" && h.value < (this.config.showMinorHeat === true ? 1 : 2));
// daySurvivors: ... && passesDisplayFloor(h)
// renderDaySubRows: for (const h of ...) { if (!passesDisplayFloor(h)) continue; ... }
```
Note the competitor (`also:`) rows need the same treatment.

---

### CR-03: Every per-product frontend render gate was dropped from the day path (WR-09 regression)

**File:** `MMM-SPCOutlook.js:747-794` (unified day loop)
**Severity:** BLOCKER (incorrect behavior — user config silently ignored)

Pre-19 (`9143705:MMM-SPCOutlook.js:768-769`), the Hazards Outlook day grid rendered only under
`if (this.config.showHazardsOutlook) { renderHazardsDays(...) }`, and the legacy ERO/WSSI/HeatRisk
sections each carried their own `this.config.showX &&` term. The unified loop carries **no**
product toggle term for any of the six day sources; correctness now depends entirely on the
backend never emitting a disabled product.

This file's own comment at lines 537-546 says that dependency must not exist, and states why it is
not theoretical: `node_helper`'s `_products` is shared across MagicMirror instances of the same
module type, so "two configured instances with different `showMPD` values overwrite each other's
toggles on every poll and the losing instance renders advisories its own config disabled." The
lat/lon foreign-payload guard (line 139) does not help — two instances at the same coordinates
with different product toggles pass it.

Reproduced with `{ showHazardsOutlook: false, showDrought: false, showHeatRisk: false }`:
```
Day 4 (Mon)  <span style="color:#996633">Severe Drought</span>
Day 5 (Mon)  <span style="color:#FF0000">Heat Major</span>
```

No parity-checklist row records this removal (rows 7 and 35 cover only the advisory band's
`enabledAdvisories()` gate, which *was* preserved).

**Fix:** restore a per-entry source gate in `daySurvivors()` (and therefore in the shared floor
predicate from CR-02), mapping source id -> config flag the same way `ADVISORY_SOURCES` maps
advisory ids:
```js
const DAY_SOURCE_FLAGS = {
  "wpc-ero": "showExcessiveRain", "wpc-wssi": "showWinterImpact",
  "wpc-hazards": "showHazardsOutlook", "heatrisk": "showHeatRisk"
  // spc-convective / spc-fire are always-on (14 D-08) and intentionally absent
};
// in daySurvivors: const flag = DAY_SOURCE_FLAGS[h.source];
//                  if (flag && this.config[flag] !== true) return false;
```
Keep the fail-safe direction documented at lines 500-508: an unlisted source is never hidden.

---

### CR-04: `hazardsLabelDisplayable` no longer filters day rows — only the window band

**File:** `MMM-SPCOutlook.js:521-528, 621-635`
**Severity:** BLOCKER (incorrect behavior — `showDrought: false` is not honored on day rows)

Pre-19, `renderableDayHazards` (`9143705:MMM-SPCOutlook.js:343-348`) ran every day hazard through
`hazardsLabelDisplayable`, explicitly "so the day grid and the band cannot disagree about what
this config permits either." `daySurvivors()` does not call it; the only remaining caller is
`renderableWindowEntries` (line 534). The exclusion list (`Flooding Likely` / `Flooding Occurring
or Imminent` / `Flooding Possible`) and the drought gate are therefore band-only.

The transcript under CR-03 shows `Severe Drought` rendering on a day row with `showDrought: false`.
Parity checklist row 24 records the constant block as "relocated verbatim … still consulted by
`renderableWindowEntries`" — the day-side caller's disappearance is not recorded anywhere.

**Fix:** add `hazardsLabelDisplayable(h.label)` to the shared display predicate introduced for
CR-02/CR-03, so band and day rows read one definition again.

## Warnings

### WR-01: A fully confirmed, fresh payload can render "(unconfirmed)"

**File:** `MMM-SPCOutlook.js:699-701, 851-853`
**Issue:** The confident all-clear short-circuit reads `summary.anyHazard`, computed by the
backend *before* any frontend-only filter (`showMinorHeat`, and — once CR-03/CR-04 are fixed —
the toggle and label gates). When `anyHazard === true` but every entry is filtered out on the
frontend, control falls into the main branch, nothing renders, and the `contentMarker` fallback
emits `"No Hazards Forecast (unconfirmed)"` on a payload that was fully confirmed against upstream.

Reproduced (fresh payload, `_stale` unset, single HeatRisk category-1 entry, default
`showMinorHeat: false`): output is exactly `"No Hazards Forecast (unconfirmed)"`.

Per the phase's own CR-01 doctrine the word "unconfirmed" is load-bearing: it is reserved for a
read that was not confirmed. Emitting it after a clean poll trains the operator to ignore it.
**Fix:** distinguish the two exits. Track whether any day/band/advisory was *suppressed by a
frontend filter* during the render; if content was suppressed but the payload was not stale, emit
the confident `NO_HAZARD_TEXT` instead of the unconfirmed form. Alternatively recompute a
frontend-side `anyRenderable` from the same shared predicate CR-02/CR-03 introduce, and let the
empty-state ladder read that rather than `summary.anyHazard`.

### WR-02: The "No Products Enabled" empty state is unreachable

**File:** `MMM-SPCOutlook.js:683-689`; `node_helper.js:3792, 3695-3700`
**Issue:** `_buildSourceHealth` marks `spc-convective` and `spc-fire` as `enabled: true`
unconditionally (`const isAlwaysOn = ...`), and `_buildGridSummary` counts `enabled` over all of
`SOURCE_IDS`. `summary.enabledSourceCount` therefore has a floor of 2 and can never equal 0, so
the RPT-05/18 D-16 branch that distinguishes "nothing was ever asked" from "checked and clear"
can never fire in production. The probe that covers it
(`scripts/probe-payload-resilience.js:11426`) sets `payload.summary.enabledSourceCount = 0` by
hand — a payload the backend cannot emit — so the suite reports coverage for a dead branch.
**Fix:** either delete the branch and the probe (and drop the field from the D-16 contract), or
change the discriminator to something reachable — e.g. `summary.reportingSourceCount === 0`, or a
count restricted to toggle-gated sources.

### WR-03: Dead code path in `_resolveGridDayPrecedence`

**File:** `node_helper.js:3507-3518`
**Issue:**
```js
const reportedForDay = !!(reportedDays[sourceId] && reportedDays[sourceId].has(dayNumber));
if (reportedForDay) { /* comment only */ } else { /* comment only */ }
```
The value is computed and discarded; both branches are empty. This is documentation wearing
code's clothing: it adds a `Set` lookup per rank position per dimension per day, and any future
reader must prove to themselves it has no effect. `reportedDays` is otherwise unused by this
method, so the whole parameter is decorative here.
**Fix:** delete the computation and both empty branches; move the D-14 "reported-below-floor vs
absent" explanation into the JSDoc block that already exists above the method (it is already
described there at lines 3468-3473).

### WR-04: Detail-mode truncation counts padding, so the label bound differs between modes

**File:** `MMM-SPCOutlook.js:334-338, 476`
**Issue:** `detailColoredSpan` applies `truncateHazardLabel` (60 chars) to `paddedFieldContent`,
which already contains the 13-char dimension field plus padding. A `wpc-hazards` pass-through
label is therefore truncated at ~47 source characters in detail mode versus 60 on the compact
line — and when truncation does fire, the `…` lands mid-field and destroys the column grid the
whole detail layout exists to maintain. It also contradicts the T-16-22 rationale quoted at line
267 ("truncated BEFORE escaping so the bound counts source characters"): padding characters now
consume the budget.
**Fix:** truncate `labelContent` (and `competitorLabel`) *before* padding, then pad:
```js
const labelContent = truncateHazardLabel(String(...) + augment.labelSuffix);
const paddedFieldContent = dimensionField + labelContent.padEnd(DETAIL_LABEL_FIELD_WIDTH);
// detailColoredSpan then escapes only, no second truncation
```

### WR-05: `_addSpcGridEntries` days 4-8 lack the containment its days 1-3 twin has

**File:** `node_helper.js:3280-3289` vs `3207-3223`
**Issue:** The days 1-3 loop guards `riskToValue` with `hasOwnProperty` and routes an unknown
token to the D-07 pass-through entry. The days 4-8 loop does neither:
`value: riskToValue[day.risk]` and `text: valueToFullRisk[day.risk]` are unguarded lookups, so an
unexpected `percToRisk` token emits `value: undefined` / `text: undefined` / `color: undefined`
into the payload instead of a pass-through entry — and `noteUnmapped` is never called, so the
diagnostic ledger stays silent about it. The frontend absorbs it (`h.text || h.label`,
`validHazardColor`), so this is a robustness/diagnosability defect rather than a crash.
**Fix:** mirror the 1-3 branch: `hasOwnProperty`-guard the lookup, emit the
`dimension: null, value: null, color: null` pass-through entry, and call
`notes.noteUnmapped("spc-convective", day.risk)`.

### WR-06: Renderers mutate an enclosing `wrapper` declared 200 lines below them

**File:** `MMM-SPCOutlook.js:436-496` (`renderDaySubRows`), `561-616`
(`renderHazardsWindowBand`), `657` (`const wrapper`)
**Issue:** Both renderers append to `wrapper` by closure rather than returning markup, and both
are defined before `wrapper` exists (safe only because they are called after the `const`
initializer runs — a TDZ `ReferenceError` is one refactor away). Every other helper in this
function is a pure string producer. The side-effecting pair also cannot be unit-tested or
reordered, and are the reason `renderDaySubRows` had to re-derive its own hazard list rather than
receive `survivors` — the proximate cause of CR-02/CR-04.
**Fix:** have both return a string; let the day loop do `wrapper.innerHTML += renderDaySubRows(day, survivors)`.
Passing `survivors` in also structurally prevents the two renderers from disagreeing about what
is displayable.

### WR-07: Probe harness cannot prove inertness, and 217 scenarios share one helper instance

**File:** `scripts/probe-lib/module-stubs.js:272-283, 296-303`; `scripts/probe-payload-resilience.js:12415-12448`
**Issue (a):** the DOM stub is a plain object; nothing parses `innerHTML`. Every "escapes hostile
text" scenario is a `String.includes("<img")` assertion. The stub's own comment concedes this, but
CR-01 demonstrates the concrete consequence: a `<img src=x onerror=...>` payload reaching the real
DOM is only caught if a scenario happens to feed that exact call site. Consider a `linkedom`/
`jsdom` wrapper for the escape-family scenarios so inertness is asserted on a parsed tree.
**Issue (b):** `main()` creates one `helper` (line 12420) and reuses it across every scenario;
isolation depends on each scenario remembering to call `resetHelper` (186 calls / 189 named
entries). A scenario that forgets inherits caches, `_nowMs` pins and `_products` from whichever
scenario ran before it, making failures order-dependent. **Fix:** call `resetHelper(helper)` in
the runner loop before `scenario.run(helper)`, and delete the per-scenario calls (or keep them as
no-ops).

## Info

### IN-01 (CONVENTION): Probability text is unformatted floating-point multiplication

**File:** `MMM-SPCOutlook.js:382, 391, 400`
**Deviation:** `(100 * detail.torRisk) + "% "` with no rounding. **Convention violated:** the
file's own "no `undefined%`/`NaN%` — no segment rather than a bad one" rule (line 205-207) is
about output quality; a value like `0.29` renders `28.999999999999996%`. Today's SPC probability
set (0.02/0.05/0.1/0.15/0.3/0.45/0.6) happens to be exact, so this is latent, and it is carried
over verbatim from the legacy renderer.
**Suggested fix (recommend, non-blocking):** `Math.round(100 * detail.torRisk)`.

### IN-02 (CONVENTION): `void HEATRISK_DAY_SPAN_END;` is a documentation-only binding

**File:** `hazardTaxonomy.js:50-51`
**Deviation:** a module-level const exists solely to be discarded by `void`. **Convention:** the
file's own header states it is "pure static configuration"; a `void`-discarded binding is code
standing in for a comment. **Suggested fix:** move the registry reference into the comment block
above it (it already explains itself in prose), or drop the `void` and export the constant if a
future reader is expected to use it.

### IN-03 (CONVENTION): Frontend restatements of taxonomy data have no drift check

**File:** `MMM-SPCOutlook.js:292, 297-310`
**Deviation:** `ADVISORY_SOURCES`, `DIMENSION_LABELS` and `SOURCE_SHORT_NAMES` restate
`hazardTaxonomy.js`'s `DIMENSIONS` / `DAY_SOURCE_IDS` / `ADVISORY_SOURCE_IDS` because the browser
cannot `require()` them — a legitimate constraint the comments explain. **Convention:** this
project's answer to an underivable restatement elsewhere is a load-time or probe-time assertion
(`assertTaxonomyIntegrity`, `buildWpcHazardsMap`'s throw, `rpt01-getdom-reads-no-legacy-payload-block`).
No such check exists for these three maps; the probe suite imports `DIMENSION_ORDER` but never
compares it against the frontend's key set. **Suggested fix:** add a static probe that reads
`MMM-SPCOutlook.js` as text (same technique as `rpt01-...`) and asserts the `DIMENSION_LABELS`
key set equals `DIMENSIONS` and `SOURCE_SHORT_NAMES` equals `DAY_SOURCE_IDS`.

### IN-04 (CONVENTION): `truncateHazardLabel` can split a surrogate pair

**File:** `MMM-SPCOutlook.js:270-275`
**Deviation:** `text.slice(0, 60)` cuts by UTF-16 code unit, so a 60th-position astral character
(emoji, some CJK extensions) leaves a lone surrogate in the DOM. **Convention:** the same function
already goes out of its way to be correct about ordering with respect to escaping. **Suggested
fix:** `Array.from(text).slice(0, HAZARDS_LABEL_MAX_CHARS).join("")`, or use
`Intl.Segmenter`/a regex with the `u` flag.

### IN-05 (CONVENTION): An advisory entry with no `label` renders the literal string "undefined"

**File:** `MMM-SPCOutlook.js:826-834`
**Deviation:** the entry guard checks `!entry || typeof entry !== "object"` but not the field it
then renders; `escapeHtml(undefined)` yields `"undefined in effect."`. **Convention:** the same
block's own comment (line 824-826) names this exact failure class ("skip … rather than rendering
'undefined in effect.'"), so the guard states an intent its implementation does not fully cover.
**Suggested fix:** `if (typeof entry.label !== "string" || entry.label.length === 0) continue;`

---

_Reviewed: 2026-09-07_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
