---
phase: 19-unified-day-report-getdom-rewrite
reviewed: 2026-09-08T00:00:00Z
depth: standard
iteration: 3
files_reviewed: 5
files_reviewed_list:
  - hazardTaxonomy.js
  - MMM-SPCOutlook.js
  - node_helper.js
  - scripts/probe-lib/module-stubs.js
  - scripts/probe-payload-resilience.js
findings:
  critical: 3
  warning: 7
  info: 4
  total: 14
status: issues_found
---

# Phase 19: Code Review Report (iteration 3)

**Reviewed:** 2026-09-08
**Depth:** standard
**Files Reviewed:** 5
**Status:** issues_found
**Harness:** `node scripts/probe-payload-resilience.js` → `173 passed, 0 failed, 0 skipped` (re-run and confirmed). 174 `name:` declarations exist; the extra one is a `name: "Pixel"` string inside a fixture, not an orphaned scenario. No duplicate scenario names.

## Summary

The iteration-2 fix pass (`806e7bb..b047ac9`) landed and the eight fixes are visible in the source. Two of them are **verified sound**, one is **verified unsound**, and the review found three previously-unreported defects that are reachable on ordinary production payloads.

Verification of the two items specifically flagged for scrutiny:

- **CR-02 carve-out — FAILS.** The `rawWindowBandCount === 0` term is over-broad and reopens the exact hole CR-02 closed. Proven by direct execution (BL-01 below). All three payload shapes that probe `cr02-...` pins as `"(unconfirmed)"` flip back to a confident `"No Hazards Forecast"` once a single wholly-elapsed window-band entry is present alongside them. The probe suite never composes the two conditions, so it stays green.
- **WR-05 (`enabledSourceCount`) — correctly skipped.** No runtime defect found. The field is emitted, documented diagnostic-only, and read by nobody. Not re-reported.
- **The two corrected probe assertions are correct, not weakened.** The `wr01-...` suppressed-only fixture now leaves `anyHazard` at `false`, which is genuinely what `_buildGridSummary` derives (its day scan `continue`s on every `suppressedBy !== null` entry, node_helper.js:3693), and the `true` variant it removed is now asserted *harder* in `cr02-... (f)`. The `wr02-unified-compact-segment-*` scenario gained a real cross-mode assertion (`compactCut !== 60 || detailCut !== 60`) that did not exist before; the added `showHazardsOutlook: true` in its config is required for the new `wpc-hazards` fixture to reach the render at all, not a gate being loosened.

The new defects cluster in one place: **the unified renderer's model of the payload does not match what the backend actually emits.** `renderDaySubRows` assumes at most one `suppressedBy === null` entry per dimension — false for `wpc-hazards`, which dedupes by *label*, not dimension. The window band assumes every offset is a future day — false, because non-precipitation features route to the band with their raw observed span, which routinely starts in the past. Both produce wrong output on data the backend emits today.

---

## Structural Findings (fallow)

No `<structural_findings>` block was supplied for this iteration.

---

## Narrative Findings (AI reviewer)

## Critical Issues

### BL-01: the CR-02 carve-out reopens the confident-all-clear-over-a-contradicting-summary hole

**Classification:** BLOCKER
**File:** `MMM-SPCOutlook.js:1171-1177`

**Issue:** The fix reads:

```js
const rawWindowBandCount = Array.isArray(this.spcrisk.windowBand)
  ? this.spcrisk.windowBand.length : 0;
const summaryContradictsRender = summaryOk && summary.anyHazard === true &&
  rawWindowBandCount === 0 && !anyUngatedContent();
```

`rawWindowBandCount > 0` disables the contradiction check **entirely**, for every reason `anyHazard` might be true — not just for the elapsed-band reason the comment justifies. `anyHazard` is `anyDayHazard || windowBandCount > 0 || advisoryCount > 0` (node_helper.js:3711). A payload where the summary asserts day hazards **and** carries one wholly-elapsed band entry silences the check, so a corrupt/truncated `days` object renders a confident all-clear over a summary that says hazards exist.

Proven by execution against the real `getDom` through the probe's own stubs. Each of the three shapes that `cr02-a-summary-that-contradicts-the-render-is-never-a-confident-all-clear` pins as `"(unconfirmed)"`, re-run with one added elapsed band entry (`offsetStart:-3, offsetEnd:-1`) and every toggle on:

| scenario | expected | actual |
|---|---|---|
| `days: null` + elapsed band, `anyHazard: true` | `No Hazards Forecast (unconfirmed)` | `No Hazards Forecast` |
| all 14 days corrupt + elapsed band, `anyHazard: true` | `No Hazards Forecast (unconfirmed)` | `No Hazards Forecast` |
| suppressed-only day + elapsed band, `anyHazard: true` | `No Hazards Forecast (unconfirmed)` | `No Hazards Forecast` |

The elapsed band is not exotic — a `wpc-hazards` Temperature/Wildfire feature routes to the band unconditionally with its own observed span (node_helper.js `_bucketHazardMatch`, the `layer.group !== "precipitation"` branch), and one that ended yesterday sits in the band until it drops out upstream. So the carve-out is live for a large fraction of real polls.

**Fix:** narrow the carve-out so it excuses `anyHazard` only when the raw band is the *only* term that could have set it. `summary` already publishes both other terms:

```js
const bandIsTheOnlySummaryTerm =
  rawWindowBandCount > 0 &&
  Array.isArray(summary.activeDays) && summary.activeDays.length === 0 &&
  !!summary.bandDiagnostics && summary.bandDiagnostics.advisoryCount === 0;
const summaryContradictsRender = summaryOk && summary.anyHazard === true &&
  !bandIsTheOnlySummaryTerm && !anyUngatedContent();
```

Then add the composed case to the `cr02-...` probe (elapsed band **plus** each of `days: null` / corrupt days / suppressed-only) — the missing composition is why 173 green scenarios did not catch this.

---

### BL-02: two co-equal survivors on one dimension render as winner + `also:` competitor

**Classification:** BLOCKER
**File:** `MMM-SPCOutlook.js:514-523` (grouping), `:561-576` (`also:` rows)

**Issue:** `renderDaySubRows` assigns the first `suppressedBy === null` entry per dimension as the winner and pushes **everything else** — including a second, equally-unsuppressed entry — into `group.competitors`, which renders as an `also:` row. The comment calls this "defensively including a second `suppressedBy === null` entry should the resolution invariant ever be violated." The invariant is not violated; the model is wrong.

`_addHazardsOutlookGridEntries` dedupes by **label** within a grid day (node_helper.js:2996 — `h.source === "wpc-hazards" && h.label === match.label`), not by dimension. `hazardTaxonomy.js` maps multiple `wpc-hazards` labels onto one dimension: `Heavy Snow` / `Freezing Rain` / `Heavy Ice` → `winter`; `Hazardous Heat` / `Excessive Heat` / `Much Above Normal Temperatures` → `heat`; `High Winds` / `Significant Waves` → `wind`; `Frost/Freeze` / `Hazardous Cold` / `Much Below Normal Temperatures` → `cold`. `_resolveGridDayPrecedence` (node_helper.js:3595) then sets `suppressedBy = null` on **both**, because both come from the winning source.

Reproduced against the real `getDom` with `dayReportDetail: true` and a day carrying `Heavy Snow` + `Freezing Rain`, both `wpc-hazards`, both `suppressedBy: null`:

```
Day 5 (Sun)  Winter Heavy Snow · Winter Freezing Rain
  Winter       Heavy Snow                — WPC Hazards
                 also: Freezing Rain     — WPC Hazards
```

The compact header presents two peer hazards; the detail expansion presents one as a suppressed competitor of the other. `also:` is D-05's suppressed-competitor row, so detail mode asserts a suppression relationship that does not exist — the two modes contradicting each other about the same entry, which is exactly the class the CR-02/03/04 collapse was created to make unrepresentable.

**Fix:** distinguish co-winners from suppressed competitors rather than by arrival order:

```js
if (h.suppressedBy === null) {
  if (!group.winner) group.winner = h; else group.coWinners.push(h);
} else {
  group.competitors.push(h);
}
```

and render `group.coWinners` as full winner-shaped rows (blank dimension field, no `also:` prefix), reserving `also:` for `suppressedBy !== null`. Add a probe fixture with two same-source, same-dimension `wpc-hazards` labels on one day.

---

### BL-03: the window band renders `D0` / negative day numbers for a partially-elapsed window

**Classification:** BLOCKER
**File:** `MMM-SPCOutlook.js:616-623` (`renderableWindowEntries`), `:707-710` (`off`)

**Issue:** The elapsed-window filter drops an entry only when `offsetEnd < 0`. An entry whose window **started** in the past but has not ended (`offsetStart < 0 <= offsetEnd`) survives, and `off()` renders `Math.trunc(n) + 1` verbatim, producing `D0` or `D-1`.

Reproduced: a band entry with `offsetStart: -1, offsetEnd: 3` renders

```
Extended Hazards:
Mon–Fri (D0–4): Heavy Snow
```

under a day grid whose first row is `Day 1`. This is the same "band disagrees with the grid directly above it about what day it means" defect the 19-08 Run B `+ 1` conversion was introduced to fix (the comment at `:699-706` states exactly that intent); the fix addressed the constant offset but not the negative domain.

This is not a synthetic shape. `_bucketHazardMatch` computes `offsetStart = this._hazardDayOffset(match.startDate, todayUtcMs)` with no lower clamp, and routes every non-`precipitation` group (Temperature, Wildfire/Drought) to `windowEntries` unconditionally with its raw observed span. A multi-day WPC/CPC hazard whose `start_date` was yesterday is an everyday payload.

**Fix:** clamp the displayed start to the grid's own first day, since the elapsed portion is not forecastable content:

```js
const off = (n) => (typeof n === "number" && isFinite(n)
  ? String(Math.max(1, Math.trunc(n) + 1)) : "?");
```

and consider suppressing the range's low end entirely (render `(→D4)` or `(D1–4)`) so the band never advertises a day the grid does not have. Pin it with a probe using `offsetStart: -1, offsetEnd: 3`.

---

## Warnings

### WR-01: the window band renders the literal word `undefined` for a label-less entry

**Classification:** WARNING
**File:** `MMM-SPCOutlook.js:712`

**Issue:** `escapeHtml(truncateHazardLabel(entry.label))` with `truncateHazardLabel` doing `String(label)`. `renderableWindowEntries` type-checks `offsetEnd` but never `label`. Reproduced: a band entry with no `label` key renders

```
Extended Hazards:<br/>Wed–Thu (D3–4): <span style="color:#a80000">undefined</span><br/>
```

This is precisely the failure class the day path just fixed structurally in this iteration (`entryText(h) === ""` in `hazardEntryDisplayable`, `MMM-SPCOutlook.js:765`) and that this file names at `cigLabel` ("no segment rather than a bad one"). The band was not brought along. Backend-unreachable today (`_hazardMatchesFromHits` rejects a non-string/empty label, node_helper.js:455-456), so this is defense-in-depth — but it is a stated file-wide rule with one unimplemented site.

**Fix:** add the structural term to the shared predicate:

```js
return windowBand.filter((entry) => (
  entry && typeof entry === "object" &&
  typeof entry.label === "string" && entry.label.length > 0 &&
  !(typeof entry.offsetEnd === "number" && entry.offsetEnd < 0) &&
  (applyDisplayGates === false || hazardsLabelDisplayable(entry.label))
));
```

### WR-02: an advisory entry with no `label` renders `undefined in effect.`

**Classification:** WARNING
**File:** `MMM-SPCOutlook.js:1099-1101`

**Issue:** The guard immediately above says "skip a null/non-object entry rather than rendering `undefined in effect.` — the failure class CR-02 already fixed once on the backend", but it only checks `!entry || typeof entry !== "object"`. `escapeHtml(entry.label)` on `{}` produces the string `"undefined"`, so `{}` renders `undefined in effect.` — the exact output the guard names.

**Fix:** extend the guard to the field it is actually about:

```js
if (!entry || typeof entry !== "object" ||
    typeof entry.label !== "string" || entry.label.length === 0) continue;
```

### WR-03: a malformed advisory array is reported to the user as `(filtered by settings)`

**Classification:** WARNING
**File:** `MMM-SPCOutlook.js:637-650`, `:1180-1184`

**Issue:** `enabledAdvisories` spreads the whole array without validating entries, so `advisories: { spcMD: [null], mpd: [] }` makes `anyUngatedContent()` true. The advisory render loop then skips the `null`, nothing renders, and the empty-state ladder concludes `NO_HAZARD_TEXT_FILTERED`. Reproduced: output is `"No Hazards Forecast (filtered by settings)"`. No setting filtered anything; the payload was malformed. The whole point of the three-way split (WR-01, iteration 2) is that each string describes a distinct real state, and this one sends the operator to check config over a data defect.

**Fix:** apply the same entry-shape predicate in `enabledAdvisories` that the render loop applies (see WR-02), so the ungated reading and the render agree about what counts as an advisory — the same "one predicate, both readings" rule `hazardEntryDisplayable` already establishes for the day path.

### WR-04: a suppressed `dimension: null` entry is silently dropped in detail mode

**Classification:** WARNING
**File:** `MMM-SPCOutlook.js:503-505`, `:525`

**Issue:** A `dimension: null` entry always gets a fresh group with `winner: null`. If it carries `suppressedBy !== null` it lands in `group.competitors` of its own group, and `if (!group.winner) continue;` then discards the group — the entry renders in neither the compact header nor the detail rows. That is the *hidden* direction of the fail-safe, which the `DAY_SOURCE_FLAGS` note two hundred lines below explicitly forbids ("an UNLISTED source is never hidden ... degrades to today's (visible) behaviour rather than silently disappearing"). Unreachable today (`_resolveGridDayPrecedence` `continue`s on `dimension === null` — "never suppresses, never suppressed"), but the containment posture is asserted rather than implemented, which is the same critique CR-03 made of the prototype-chain lookups.

**Fix:** promote a lone competitor to winner when a group has no winner, or render the group with an empty dimension field rather than `continue`ing.

### WR-05: a non-string upstream `LABEL` takes the whole poll to `{ error }`

**Classification:** WARNING
**File:** `node_helper.js:2058`, `node_helper.js:3574`

**Issue:** `extractPolygons` does `const label = f.properties.LABEL || "";` with no `String()` coercion, so a numeric (or object) `LABEL` attribute propagates verbatim into the grid hazard entries. `_resolveGridDayPrecedence`'s comparator then calls `a.label.localeCompare(b.label)`, which throws `TypeError: a.label.localeCompare is not a function` on a number. That throw is outside `extractPolygons`' per-feature containment and lands in `getSpcOutlook`'s shared catch — the same "one bad feature blanks days 1-8, fire weather and the ERO together" outcome the WR-08 note at `:2062-2069` exists to prevent. Every other consumer already coerces (`dimensionOf` does `String(label)`, heatrisk emits `String(category)`), so this comparator is the only site trusting the raw type.

**Fix:** coerce at the boundary — `const label = f.properties.LABEL == null ? "" : String(f.properties.LABEL);` — and/or make the comparator total: `String(a.label).localeCompare(String(b.label))`.

### WR-06: the frontend probe's DOM stub cannot observe `innerHTML` re-serialization

**Classification:** WARNING
**File:** `scripts/probe-lib/module-stubs.js:293`, `:323-334`

**Issue:** `document.createElement` returns `{ innerHTML: "", textContent: "", style: {} }`, so `getDom`'s ~15 `wrapper.innerHTML +=` sites are plain string concatenation. A real DOM node **re-parses and re-serializes** on every assignment: unbalanced markup is auto-closed, attributes are normalized, and the resulting tree can differ from the concatenated string. `assertInertMarkup` is a lexical scan over that concatenated string, so it validates something the browser never sees. The stub's own comment is honest about alignment and whitespace being MANUAL ONLY, but does not name this gap, and `assertInertMarkup` is presented as the backstop for the whole class of escaping defects (WR-07(a)).

**Fix:** state the limitation in the `assertInertMarkup` comment alongside the existing "lexical rather than parsed tree" note, and add the round-trip mismatch to `19-PARITY-CHECKLIST.md`'s Probe Coverage as a MANUAL ONLY row. A stronger option, if a dev dependency is ever acceptable, is a `linkedom` round trip in one dedicated scenario.

### WR-07: the poll interval timer is never retained or cleared

**Classification:** WARNING
**File:** `MMM-SPCOutlook.js:98`

**Issue:** `setInterval(...)` result is discarded and the module implements no `stop`/`suspend`/`resume`. MagicMirror keeps a hidden module's timers alive, so a suspended instance continues polling `www.spc.noaa.gov` and `mapservices.weather.noaa.gov` forever. `resolveUpdateInterval` (added for the same class of concern) bounds the *rate* but not the *lifetime*.

**Fix:** store the handle (`this._pollTimer = setInterval(...)`) and add `suspend: function() { clearInterval(this._pollTimer); this._pollTimer = null; }` plus a `resume` that re-arms it.

---

## Info

### IN-01: the `DIMENSION_ORDER` permutation assertion is vacuous

**Classification:** CONVENTION
**File:** `hazardTaxonomy.js:363-372` (checks a value declared at `:32`)

**Issue:** `DIMENSION_ORDER` is `Object.freeze([...DIMENSIONS])`, so the sorted-equality check at load time can never fail. It reads as a real invariant guard beside genuine ones.

**Convention violated:** this file's own "assertions fail loudly on a bad edit" discipline (`assertTaxonomyIntegrity`'s stated purpose at `:264-267`) — an assertion that cannot fail is not one.

**Fix (recommend):** either delete it, or make it load-bearing by declaring `DIMENSION_ORDER` as its own explicit literal and letting the check enforce the permutation relationship it claims to.

### IN-02: `hasConvectiveDetail` is set by any entry carrying a `detail` object

**Classification:** CONVENTION
**File:** `node_helper.js:3637-3643`

**Issue:** The loop sets `hasConvectiveDetail = true` for `entry.detail && typeof entry.detail === "object"` regardless of `entry.dimension`/`entry.source`. Correct today only because convective is the sole dimension with a `detail` sub-object; the name asserts a check the code does not perform.

**Convention violated:** the codebase's "name the predicate after what it tests" habit (`hasRenderableProximity`, `hazardEntryDisplayable`, `hasTorFamily`).

**Fix (recommend):** `if (entry.dimension === "convective" && entry.detail && typeof entry.detail === "object")`, or rename to `hasDetailSubObject`.

### IN-03: `buildWpcHazardsMap` validates only registry → taxonomy

**Classification:** CONVENTION
**File:** `hazardTaxonomy.js:95-108`

**Issue:** The throw fires when a `displayColor` label has no dimension entry, but nothing detects a `hazardsOutlookDimensionByLabel` entry with no `displayColor` key. Such an entry is dead — the derived key set excludes it — so a label that quietly loses its registry colour silently degrades to the D-07 unmapped path with no signal. Both sets currently match exactly (verified).

**Convention violated:** the file's own "never restate a derived value / catch drift at require() time" rule (`:29-32`, `:91-94`).

**Fix (recommend):** add the reverse loop and throw naming the orphaned label.

### IN-04: `anyUngatedContent()` is evaluated twice on the same branch

**Classification:** CONVENTION
**File:** `MMM-SPCOutlook.js:1174-1182`

**Issue:** Once inside `summaryContradictsRender` and again in the `else if`. It walks 14 days, the window band and both advisory arrays each time. Correctness is unaffected (it is pure over an unchanged `this.spcrisk`), but the two calls can visually read as two different questions.

**Convention violated:** this file's "declared once, called from both the render-decision site and the render body (WR-04's rule) so the two can never disagree" pattern, stated at `daySurvivors` (`:803-807`).

**Fix (recommend):** `const ungated = anyUngatedContent();` above the ladder and read the local at both sites.

---

_Reviewed: 2026-09-08_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
