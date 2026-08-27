# Phase 16 Mutation Inventory

Consolidated from `.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-04-SUMMARY.md`
through `16-07-SUMMARY.md`. Every row is transcribed, not re-run: no mutation in this document was
re-applied during this plan's execution. RED messages are copied verbatim from the source SUMMARY.
Where a SUMMARY did not record an exact `file:line`, the cell says so rather than inventing one.

**Reconciliation:** the plan's expected count is 3 (16-04) + 6 (16-05) + 11 (16-06) + 14 (16-07) =
**34**. All 34 are accounted for below. 0 missing, 0 invented.

## Mutation Inventory

| Plan | Scenario or check | File:line mutated | What was broken | Verbatim RED message | Restored |
|---|---|---|---|---|---|
| 16-04 | Task 2 gate-terms check (no dedicated probe-suite scenario name; ad-hoc fixture) | `MMM-SPCOutlook.js` — deleted the `hazardsOutlookHasWindowEntries` gate term line (exact line not recorded in 16-04-SUMMARY.md; the term lives at current `MMM-SPCOutlook.js:336`) | The window-band-only no-risk gate term removed | `HAZ-02: window-band-only content short-circuited to a confident all-clear — this is the Phase 15 getDom regression, reproduced` | yes (md5sum match confirmed) |
| 16-04 | Task 2 gate-terms check | `MMM-SPCOutlook.js` — deleted the `hazardsOutlookHasAnyDay` gate term line (exact line not recorded; current `MMM-SPCOutlook.js:335`) | The day-grid no-risk gate term removed | `HAZ-01: a day-grid hazard short-circuited to a confident all-clear` | yes (md5sum match confirmed) |
| 16-04 | Task 2 gate-terms check | `MMM-SPCOutlook.js` — changed `hazardsOutlookHasWindowEntries` to `return true;` unconditionally (exact line not recorded) | The control path: gate terms fire unconditionally | `CONTROL FAILED: an empty hazards block no longer short-circuits — the gate terms fire unconditionally and the positive assertions below prove nothing` | yes (md5sum match confirmed) |
| 16-05 | Task 1 (`renderHazardsDays`) check | `MMM-SPCOutlook.js` — removed the `escapeHtml(` wrapper from the day-row label (exact line not recorded) | XSS escaping on the day-row label | `XSS: an unescaped tag reached innerHTML` | yes (md5sum match confirmed) |
| 16-05 | Task 1 (`renderHazardsDays`) check — **anomaly, see note below** | `MMM-SPCOutlook.js` — replaced the weekday derivation with `dowToText(new Date().getDay() + d)` (exact line not recorded) | D-01's payload-date-derived weekday | Shipped check printed `OK` instead of RED on 2026-08-26 (session wall clock coincidentally matched the fixture's implicit reference date). Supplementary clock-shifted proof (`vm` sandbox, fake now = Mon 2026-08-24) produced: `D-01: weekday not derived from the payload date. got: Hazards (Thu, Day 3): <span style="color:#e69800">Severe Weather</span><br/>` | yes (md5sum match confirmed) |
| 16-05 | Task 1 (`renderHazardsDays`) check | `MMM-SPCOutlook.js` — dropped the `entry.hazards.length === 0` guard and the post-filter `hazardSpans.length === 0` check (exact line not recorded) | Absence-is-silence on empty days | `absence-is-silence violated: an empty day rendered a row` | yes (md5sum match confirmed) |
| 16-05 | Task 2 (`renderHazardsWindowBand`) check | `MMM-SPCOutlook.js` — moved the `renderHazardsWindowBand` call ABOVE the `renderHazardsDays` call (exact line not recorded) | D-05's below-the-day-rows placement | `D-05: the window band rendered ABOVE the day rows` | yes (md5sum match confirmed) |
| 16-05 | Task 2 (`renderHazardsWindowBand`) check | `MMM-SPCOutlook.js` — removed the `escapeHtml(` wrapper from the band label (exact line not recorded) | XSS/attribute-injection escaping on the band label | `XSS/attribute injection in the window band` | yes (md5sum match confirmed) |
| 16-05 | Task 2 (`renderHazardsWindowBand`) check — **anomaly, see note below** | `MMM-SPCOutlook.js` — rendered the `Extended Hazards:` heading unconditionally rather than lazily (moved above the loop, outside `headingWritten`) (exact line not recorded) | Lazy heading (absence-is-silence for the window band) | Caught via the plan's OTHER absence-is-silence scenario (entirely-elapsed entry), not the literal empty-array wording named in the plan's acceptance criteria: `an entirely-elapsed window entry rendered` | yes (md5sum match confirmed) |
| 16-06 | `hazards-precip-spread-buckets-every-day-in-span` | `node_helper.js` `_bucketHazardMatch`'s day loop — changed `for (let d = Math.max(offsetStart, 3); d <= Math.min(offsetEnd, 14); d++)` to `for (let d = offsetStart; d <= offsetStart; d++)` (exact line not recorded in 16-06-SUMMARY.md) | D-04 per-day spread of a multi-day Precipitation feature | `day4 expected to contain Heavy Rain, got []` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-lowercase-label-is-read-not-dropped` (collateral: 3 other hazards-* scenarios also failed, expected — shared helper) | `productRegistry.js` `hazardsOutlook.toValue` — changed to `(label, f) => label` (trusting the broken positional parameter) | HAZ-03's lowercase-`label` read | `expected day3.hazards to contain Heavy Rain (the lowercase-label feature), got [{"label":"Heavy Snow","color":"0084a8","mapped":true}]` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-day-order-follows-the-registry-not-the-response` | `node_helper.js` — removed the `hazards.sort((a, b) => compareLabels(a.label, b.label));` comparator call | D-02's registry-declared ordering | `first response order: expected day3 order ["Severe Weather","Heavy Rain","Heavy Ice"], got ["Heavy Ice","Heavy Rain","Severe Weather"]` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-unmapped-label-renders-verbatim-and-logs-once` | `node_helper.js` — removed the `_loggedUnmappedHazardLabels` guard (`if (!mapped)` instead of `if (!mapped && !this._loggedUnmappedHazardLabels.has(label))`) | D-11's once-per-process unmapped-label log | `expected exactly one log line naming Dense Fog, got 2: [...]` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-zero-feature-layers-render-nothing-and-are-not-stale` (collateral: `hazards-routes-are-quiet-by-default` also failed under the same mutation, expected) | `node_helper.js` — added `else { anyStale = true; }` to the freshness check | Zero-feature layers must not be flagged stale | `a zero-feature response on every layer must not be flagged stale` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-toggle-off-emits-the-full-block-and-fetches-nothing` | `node_helper.js` — removed the `productToggles[row.configFlag]` guard (`if (true) { ... }` instead of `if (productToggles[row.configFlag]) { ... }`) from the hazards runner's fetch loop | Phase 14 D-05 toggle-off no-fetch guarantee | `fetchGeoJsonCached was called with a hazards URL while the toggle was off: https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/1/query?where=1%3D1&outFields=*&f=geojson` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-flooding-labels-never-appear-under-any-toggle` (mutation #1) | `productRegistry.js` — emptied `hazardsExcludedLabels` to `[]` | D-09's Flooding hard exclusion | `this scenario's literal Flooding label set has drifted from the registry's excludedLabels — update both: literal=["Flooding Likely","Flooding Occurring or Imminent","Flooding Possible"], registry=[]` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-flooding-labels-never-appear-under-any-toggle` (mutation #1b, second run) | `node_helper.js` — changed the runner's `includesFeat` Flooding check to also consult `productToggles.showDrought` (`if (row.excludedLabels.includes(val) && productToggles.showDrought !== true) return false;`) | D-09's absolute exclusion (no override, including via Drought opt-in) | `toggles={"showHazardsOutlook":true,"showDrought":true}: a Flooding label reached the payload: {"day3":{"date":"2026-08-29","hazards":[{"label":"Heavy Rain",...},{"label":"Flooding Likely","color":"aaaaaa","mapped":false},{"label":"Flooding Occurring or Imminent","color":"aaaaaa","mapped":false},{"label":"Flooding Possible","color":"aaaaaa","mapped":false}]},...}` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-drought-is-hidden-at-the-default-and-shown-only-on-opt-in` (mutation #2) | `node_helper.js` — loosened the D-10 gate from `productToggles.showDrought !== true` to `!productToggles.showDrought` | D-10's strict `=== true` Drought opt-in gate | `showDrought:"yes" (truthy non-boolean): a drought label reached windowBand: [{"label":"Critical Wildfire Risk",...},{"label":"Severe Drought",...},{"label":"Rapid Onset Drought Risk",...}]` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-drought-is-hidden-at-the-default-and-shown-only-on-opt-in` (mutation #2b) | `node_helper.js` — replaced the label-level drought filter with a layer-level skip (`if (layer.group === "wildfireDrought" && productToggles.showDrought !== true) continue;`) | Dropping the whole Wildfire/Drought layer instead of just the drought labels within it | `default toggles: control failed — Critical Wildfire Risk did not reach windowBand: []` | yes (suite green 58/58 after restore) |
| 16-06 | `hazards-frontend-renders-no-flooding-or-drought-at-the-default` (mutation #3) | `MMM-SPCOutlook.js` — removed the `renderHazardsWindowBand(this.spcrisk.hazardsOutlook);` call from `getDom` | HAZ-04 proven at the real DOM renderer, not just the payload | `control failed: Critical Wildfire Risk missing from rendered markup: Hazards (Sat, Day 3): <span style="color:#267300">Heavy Rain</span><br/>` | yes (suite green 58/58 after restore) |
| 16-07 | `hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances` (M1) | `node_helper.js:521-527` — moved the `_bucketHazardMatch` re-bucket loop inside `if (fetchResult.data !== null)` so a cache hit skips re-bucketing | The phase's #1 risk: day-offset drift on a cache hit | `expected day key 3 (Wednesday + 3 = Aug 29) after a cache hit, got day3=[], day5=[] — a cache hit must re-derive the day key against the new clock, not replay the old one` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances` (M2) | `node_helper.js:398-416` (`_cacheHazardMatches`) — replaced the field-by-field whitelist with `matches.map((match) => ({ ...match, day3: true }))` | The clock-independent cache-write whitelist | `precondition failed: the cached entry carries a clock-dependent field, so the drift assertion below cannot distinguish a correct re-bucketing from a lucky replay: [{"label":"Heavy Rain","startDate":1787961600000,"endDate":1787961600000,"idpFiledate":1787961600000,"day3":true}]` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances` (M3) | `node_helper.js:1716-1719` (`_todayUtcMs`) — memoized the computed value on first call for the process lifetime (`this.__mutationMemoizedTodayUtcMs`) | The no-clock-parameter runner signature's reliance on a fresh `_todayUtcMs()` every call | `day-offset drift: a cache hit replayed the previous day's bucketing — Heavy Rain fixed at Aug 29 is day3 on Aug 26 and day2 on Aug 27 (offset 2, outside the 3..14 grid, so it must render on NO day), and the ETag never fires because the bytes did not change. Found a hazard surviving on day3: [{"label":"Heavy Rain","color":"267300","mapped":true}]` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances` (M4, collateral: `hazards-data-age-sets-the-badge-but-not-the-age-figure`'s control warm-up also failed) | `node_helper.js:486-487` — removed the `this._cacheHazardMatches(url, fetchResult, matches)` call so the runner never writes the cache | Whether a cache entry is genuinely written and consulted (not just "recomputes correctly every poll") | `precondition failed: no cache entry for the hazards layer-4 URL — the warm-up poll did not populate the cache` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `frontend-hazards-window-band-only-is-not-an-all-clear` (M1) | `MMM-SPCOutlook.js:336` — deleted the `hazardsOutlookHasWindowEntries` gate term line (collateral: `frontend-hazards-window-hazard-appears-once-not-per-day` also failed) | The phase's #2 risk: window-band-only no-risk-gate omission | `HAZ-02: a window-band-only payload short-circuited to a confident all-clear — a location inside a Hazardous Heat polygon with no day-resolved hazards. This is the Phase 15 getDom regression class, which shipped live once.` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `frontend-hazards-window-band-only-is-not-an-all-clear` (M2) | `MMM-SPCOutlook.js:335-336` — replaced the two gate terms with a single term checking only `hazardsOutlookHasAnyDay` | Same regression, confirmed via a structurally equivalent term-removal | `HAZ-02: a window-band-only payload short-circuited to a confident all-clear — a location inside a Hazardous Heat polygon with no day-resolved hazards. This is the Phase 15 getDom regression class, which shipped live once.` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `frontend-hazards-window-band-only-is-not-an-all-clear` (M3, Control 1) | `MMM-SPCOutlook.js:262-265` — changed `hazardsOutlookHasWindowEntries` to `return true` unconditionally | Control: an empty windowBand must still short-circuit | `control: an empty-windowBand payload no longer short-circuits, it rendered: No Severe Weather Risk (unconfirmed)` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `frontend-hazards-window-band-only-is-not-an-all-clear` (M4, Control 2) | `MMM-SPCOutlook.js:336` — removed the `this.config.showHazardsOutlook &&` guard from the window-band gate term | Control: WR-09, a populated band with the toggle off must still short-circuit | `control: a populated windowBand payload with showHazardsOutlook:false no longer short-circuits, it rendered: No Severe Weather Risk (unconfirmed)` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `frontend-hazards-window-hazard-appears-once-not-per-day` (M5) | `MMM-SPCOutlook.js:577-580` — changed the window-band renderer to also emit a day-row for each day in the entry's span | HAZ-02's "once, not per-day" guarantee | `expected "Hazardous Heat" to appear exactly once (the window band, not once per day in its span), got 6: Extended Hazards:<br/>Sat–Wed (D3–7): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 3): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 4): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 5): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 6): <span style="color:#a80000">Hazardous Heat</span><br/>Hazards (Day 7): <span style="color:#a80000">Hazardous Heat</span><br/>` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-weekend-poll-of-fridays-file-is-not-stale`'s control (M1, collateral: `hazards-idp-filedate-is-evaluated-per-layer-not-shared` and `hazards-data-age-sets-the-badge-but-not-the-age-figure` also failed) | `node_helper.js:492-519` — removed the entire data-age check block | DATA-02's `idp_filedate` freshness check existing at all | `control: a 115h-old file (outside the 84h budget) was not flagged stale — without a working age check, the primary assertion above proves nothing` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-idp-filedate-is-evaluated-per-layer-not-shared` (M2) | `node_helper.js:470-497` — captured `matches[0].idpFiledate` once outside the per-layer loop (`mutationSharedFiledate`) and reused it for every layer | D-13's per-layer (not row-shared) freshness evaluation | `D-13: layer 3's idp_filedate is 89h old (past the 84h budget) while every other layer is fresh, and _stale was not set — a row-level shared timestamp does not exist for this product; any layer aged out must trip the badge` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-data-age-sets-the-badge-but-not-the-age-figure` (M3) | `node_helper.js:517` — added `this._noteStaleEntry({ timestamp: this._nowMs() })` at the data-age trip site | D-15's deliberate `_staleAsOf` exclusion | `D-15: a data-age trip dragged _staleAsOf along with it — this would make the badge speak for SPC data fetched moments ago while describing a WPC file up to 84h old, got _staleAsOf=1787749200000` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-weekend-poll-of-fridays-file-is-not-stale`'s primary assertion (M4) | `productRegistry.js:359` — changed `maxDataAgeHours` from `84` to `48` | The literal fixture ages being load-bearing against the live registry constant, not proportional | `fixture drift: the Friday-file scenario's elapsed 67h is not inside the current maxDataAgeHours budget (48h) — update FRIDAY_FILEDATE/SUNDAY_POLL_MS` | yes (git diff clean, md5sum match confirmed) |
| 16-07 | `hazards-stale-data-still-renders-its-rows` (M5) | `MMM-SPCOutlook.js:598` — added `&& !this.spcrisk._stale` to the hazards-rendering gate | D-16's no-suppression-on-stale rule | `D-16: a data-age trip suppressed the hazard row instead of just badging it: <span style="color:#FFCC00">⚠ Stale</span><br/>No Severe Weather Risk (unconfirmed)` | yes (git diff clean, md5sum match confirmed) |

**Row count:** 34 (16-04: 3, 16-05: 6, 16-06: 11, 16-07: 14). Matches the plan's expected reconciliation exactly.

### Note on anomalies (carried forward per this plan's must-haves, not flattened)

- **16-05 Task 1 Mutation 2** initially printed `OK` rather than RED, because this session's real wall
  clock (2026-08-26) coincidentally matched the fixture's implicit "today" anchor
  (`Date.UTC(2026,7,26+d)`), so the mutated `new Date().getDay()`-based formula happened to compute
  the same weekday as the correct payload-date-derived one for the `day3` case. This was **not** a
  fixture defect — it was resolved by a supplementary clock-shifted proof (`vm` sandbox, fake now =
  Monday 2026-08-24), under which the mutation produced a diagnosable RED (`Hazards (Thu, Day 3)`
  instead of the correct `Hazards (Sat, Day 3)`), confirming it is a genuine, catchable regression on
  every day of the year except this one.
- **16-06's `hazards-flooding-labels-never-appear-under-any-toggle`** first draft was vacuous: its
  fixture was built by iterating `PRODUCT_REGISTRY.hazardsOutlook.excludedLabels` directly, the same
  array mutation #1 emptied — so emptying the registry field also emptied the scenario's own fixture,
  producing a false PASS. It was rewritten to use three literal label strings independent of the
  mutable registry field, with an equality check against the registry as a staleness guard (read for
  validation, never used to build the fixture). After the rewrite it correctly went RED under
  mutation #1 (see table row above).
- **16-06 substituted "Dense Fog" for the plan's suggested "Frost/Freeze"** in the D-11 unmapped-label
  scenario, because the current registry (`productRegistry.js:184`) already maps `"Frost/Freeze":
  "c500ff"` in `hazardsDisplayColor` — the plan's assumption that it was unmapped had drifted from the
  registry's actual state by the time 16-06 executed. "Dense Fog" was confirmed absent from
  `displayColor`, `excludedLabels`, `droughtLabels`, and `order` at scenario-write time.
- **16-07 self-caught that `turfStub.pointInPolygon` must be re-armed AFTER `resetHelper()`**, not
  before or once at scenario entry — `resetHelper` unconditionally resets it to `false`. This affected
  4 of the 7 new scenarios (the day-keys-shift scenario's three `resetHelper` call sites, plus all
  three Task 3 freshness scenarios), caught on the first full-suite run before any commit.
- **16-07 corrected the plan's freshness fixture literals**: the plan's own `Date.UTC` values for the
  weekend-freshness scenario compute to 43h/91h elapsed, not the plan's narrated 67h/91h. 16-07 chose
  new literals (67h/115h) that stay comfortably inside/outside the 84h budget and remain load-bearing
  against a plausible 48h retune, validated by a runtime "fixture drift" guard against the live
  `maxDataAgeHours` registry constant.
- **16-07 added an If-None-Match header assertion** to the day-keys-shift scenario's step 9, beyond
  the plan's literal "fetch called twice" check — a fetch-count-only assertion cannot distinguish a
  genuine cache hit from an implementation that never caches and recomputes correctly from scratch
  every poll (exactly mutation M4's shape). This is what makes M4 catchable independently of the
  step-4 precondition guard.

## Unproven Scenarios

None. Every probe-suite scenario added in 16-06 (10 scenarios) and 16-07 (7 scenarios) has at least
one dedicated mutation row above, either as its direct target or as a stated collateral failure under
a shared-code-path mutation targeting a sibling scenario. Every ad-hoc Task-level check added in
16-04 (1 check, 3 mutations) and 16-05 (2 checks, 6 mutations) likewise has its mutations recorded.
34/34 reconciled, 0 silently absent.

## Structurally-Proven, Not Mutation-Proven

None for this phase. Every Hazards Outlook scenario and check has a real threshold, branch, filter,
or gate to break (a day-bucketing loop bound, a label filter, a freshness comparison, a no-risk gate
term, an escaping call, a cache whitelist) — unlike Phase 15's `wssi-zero-features-out-of-season`
(F3), which had no threshold to break because WSSI's out-of-season behavior is "the array is empty,"
not a branch. No equivalent no-threshold case was found in this phase's scope; if one surfaces in a
later gap-closure pass, it belongs here with a stated reason, not silently omitted.

## Vacuity Preventatives

Per scenario/check, whether it carries a **precondition guard** (an assertion that setup actually
reached the state under test), a **control assertion** (a companion assertion proving the gate isn't
simply never firing), **both**, or **neither**. Classification is read directly from source
(`scripts/probe-payload-resilience.js`), not from SUMMARY prose alone.

| Scenario / check | Guard | Control | Classification |
|---|---|---|---|
| 16-04 Task 2 gate-terms check | — | Mutation 3's `CONTROL FAILED` assertion (empty hazards block must still short-circuit) | control |
| 16-05 Task 1 `renderHazardsDays` check | — | XSS "escaped form is actually present" assertions act as controls against a silent-drop masquerading as an escape | control |
| 16-05 Task 2 `renderHazardsWindowBand` check | — | Two absence-is-silence assertions (empty array, entirely-elapsed entry) act as mutual controls | control |
| `hazards-routes-are-quiet-by-default` | — | `assertHazardsBlockIntact` shape gate (13-key count) + the "not stale by default" assertion; proven non-vacuous by collateral failure under mutation #5 (shared code path with `hazards-zero-feature-layers-...`) rather than an in-scenario positive/negative pair | control (via shared mutation coverage — **finding:** this scenario has no dedicated mutation or in-scenario control of its own; see note below) |
| `hazards-precip-spread-buckets-every-day-in-span` | Line 3830, "precondition failed: expected the fixture's two features to reach day3/day5" | — | guard |
| `hazards-lowercase-label-is-read-not-dropped` | — | Line 3908, control feature carrying ONLY uppercase `LABEL` must produce no entry | control |
| `hazards-day-order-follows-the-registry-not-the-response` | — | Line 3971, second (differently-wrong) response ordering as a control against the first | control |
| `hazards-unmapped-label-renders-verbatim-and-logs-once` | — | Line 4035, mapped-label control must produce no log line | control |
| `hazards-zero-feature-layers-render-nothing-and-are-not-stale` | Line 4063, "precondition failed: hazards layer's URL was never requested" | — | guard |
| `hazards-toggle-off-emits-the-full-block-and-fetches-nothing` | — | Real (non-empty) bodies routed on every layer specifically so the empty block cannot be an empty-body coincidence | control |
| `hazards-flooding-labels-never-appear-under-any-toggle` | Registry/literal equality staleness guard (drift check) | Line 4187, Heavy Rain control in every one of the three toggle runs | both |
| `hazards-drought-is-hidden-at-the-default-and-shown-only-on-opt-in` | — | Lines 4246/4256/4267, Critical Wildfire Risk control across all three runs | control |
| `hazards-frontend-renders-no-flooding-or-drought-at-the-default` | — | Lines 4327/4330, Heavy Rain + Critical Wildfire Risk controls at the real DOM | control |
| `hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances` | Lines 4381/4386, cache-warm and clock-independence preconditions | Line 4487, clock-fixed two-poll byte-identity control | both |
| `frontend-hazards-window-band-only-is-not-an-all-clear` | Lines 4526/4530, day-emptiness and windowBand-count preconditions | Lines 4551/4561, empty-windowBand and toggle-off controls | both |
| `frontend-hazards-window-hazard-appears-once-not-per-day` | — | Line 4610, same label on three separate days must render three times | control |
| `hazards-weekend-poll-of-fridays-file-is-not-stale` | Line 4642, fixture-drift guard against the live `maxDataAgeHours` | Line 4684, a genuinely stale prior file must be flagged | both |
| `hazards-idp-filedate-is-evaluated-per-layer-not-shared` | Line 4745, "precondition failed: layer 3's feature did not reach windowBand" | Line 4760, all-fresh control must not be flagged stale | both |
| `hazards-data-age-sets-the-badge-but-not-the-age-figure` | Lines 4800/4827/4831, aged-out and warm-up preconditions | Line 4837, a genuine fetch failure must leave a numeric `_staleAsOf` | both |
| `hazards-stale-data-still-renders-its-rows` | Lines 4877/4880, `_stale` and Heavy Rain preconditions | — (dual end-to-end assertion — badge present AND row present — substitutes for a separate control; no distinct gate-firing control exists) | guard |

**Finding:** `hazards-routes-are-quiet-by-default` has no dedicated mutation target and no in-scenario
control assertion of its own — its only proof of non-vacuity is that it happens to share a code path
with `hazards-zero-feature-layers-render-nothing-and-are-not-stale`'s mutation #5 (16-06-SUMMARY.md
records this as "collateral," not as evidence this scenario's own assertions are load-bearing). This
is disclosed here rather than silently omitted; it is not severe enough to block this plan (the suite
is green, the shared code path genuinely covers both scenarios), but a future hardening pass should
either add a dedicated mutation for this scenario's `keyCount !== 13` assertion or accept it explicitly
as intentionally covered by proxy.

## day9..day14 Audit

CONTEXT.md's Integration Points section states: "`day9`…`day14` are new to this module; nothing else
emits past `day8`. Any frontend loop bounded at 8 needs checking." RESEARCH.md's Frontend Integration
Risk section concludes every day-bounded-at-8 loop in the codebase is correctly scoped to a genuinely
1-through-8 product, because `hazardsOutlook`'s day keys are nested INSIDE its own block and never
appear at the payload's top level.

**Grep performed:** `grep -n "d <= 8\|d<=8\|day8\|<= 8" MMM-SPCOutlook.js scripts/probe-payload-resilience.js node_helper.js`

**Per-hit verdict** (verified against the code as it now stands, not assumed):

| File:line | Hit | Verdict |
|---|---|---|
| `MMM-SPCOutlook.js:312` | `this.spcrisk.fireWeather.day8Risk > 0` | (a) correctly day-1..8-scoped — fire weather no-risk gate term, a genuinely 8-day product (FWXT) |
| `MMM-SPCOutlook.js:436` | `if(this.spcrisk.day8.probRisk) wrapper.innerHTML += dowToText(dow+7) + " (Day 8): ..."` | (a) correctly day-1..8-scoped — SPC categorical Day 8 row |
| `MMM-SPCOutlook.js:450` | `for (let d = 3; d <= 8; d++)` | (a) correctly day-1..8-scoped — the fire-weather Day 3-8 render loop |
| `node_helper.js:2071` | comment: "day1 through day8, day48Risk, and the full eight-day fireWeather block" | (a) documentation of the existing 1-8 contract, not a bound |
| `node_helper.js:2080` | comment: "@returns object with day1 through day8 outlook data..." | (a) documentation, not a bound |
| `node_helper.js:2088` | comment: "fireWeather with day1Risk/day1Text through day8Risk/day8Text" | (a) documentation, not a bound |
| `node_helper.js:2100` | comment: "hazardsOutlook: ... day9..day14 are the first keys in this module past day8 and live INSIDE this block, not at the payload's top level, so no existing day-bounded loop or assertion is affected" | (a) this is the codebase's OWN self-documentation of the exact conclusion this audit is confirming — read and verified true against the actual payload shape (see `_runArcGisHazardWindowProduct`'s assembly and `assertHazardsBlockIntact`) |
| `node_helper.js:2205` | `const day8URL = "https://www.spc.noaa.gov/products/exper/day4-8/day8prob.lyr.geojson";` | (a) correctly day-1..8-scoped — SPC categorical Day 8 URL |
| `node_helper.js:2518` | `day6FireRisk = 0, day7FireRisk = 0, day8FireRisk = 0;` | (a) correctly day-1..8-scoped — fire weather variable init |
| `node_helper.js:2521` | `for (let d = 3; d <= 8; d++)` | (a) correctly day-1..8-scoped — fire weather fetch/evaluate loop |
| `node_helper.js:2557` | `day8FireRisk = dayFireRisks[8];` | (a) correctly day-1..8-scoped |
| `node_helper.js:2567` | `let day8ProbRisk = 0, day8Sign = false;` | (a) correctly day-1..8-scoped — SPC categorical Day 8 init |
| `node_helper.js:2653-2667` | `fetchGeoJsonCached(day8URL)` and Day 8 polygon extraction/evaluation | (a) correctly day-1..8-scoped — SPC categorical Day 8 fetch/evaluate |
| `node_helper.js:2676` | `const day8Risk = this.percToRisk(day8ProbRisk, day8Sign);` | (a) correctly day-1..8-scoped |
| `node_helper.js:2679` | `if(day4ProbRisk > 0 \|\| ... \|\| day8ProbRisk > 0) day48Risk = true;` | (a) correctly day-1..8-scoped — the existing `day48Risk` aggregate |
| `node_helper.js:2823-2828` | `day8: { risk, probRisk, sign, color, text }` payload block | (a) correctly day-1..8-scoped — SPC categorical Day 8 payload assembly |
| `node_helper.js:2845-2846` | `day8Risk: day8FireRisk, day8Text: fireValueToFull[day8FireRisk]` | (a) correctly day-1..8-scoped — fire weather payload assembly |
| `scripts/probe-payload-resilience.js:11` | comment: "day1-day8, fireWeather, and a full 20-key excessiveRain block" | (a) documentation of the existing D-05 contract, not a bound |
| `scripts/probe-payload-resilience.js:537` | comment: "`this.spcrisk.fireWeather.day3Risk`-`day8Risk`" | (a) documentation, not a bound |
| `scripts/probe-payload-resilience.js:566,571` | `day8: { ...day48None }` / `day7Risk: 0, day7Text: "None", day8Risk: 0, day8Text: "None"` | (a) correctly day-1..8-scoped fixture literals for the fire-weather/SPC-categorical no-risk payload |
| `scripts/probe-payload-resilience.js:810` | `for (let d = 1; d <= 8; d++)` inside `assertPayloadIntact` — checks `out[day{d}]` exists at the payload's TOP level | (a) correctly scoped — verified by reading `assertPayloadIntact` directly: this loop only inspects TOP-LEVEL `day1`..`day8` keys on `out`, never descends into `out.hazardsOutlook`, and `hazardsOutlook.day3`..`day14` are nested one level down inside `out.hazardsOutlook`, so this loop cannot see them and cannot truncate them |
| `scripts/probe-payload-resilience.js:822` | `for (let d = 1; d <= 8; d++)` inside `assertPayloadIntact` — checks `fireWeather.day{d}Risk`/`day{d}Text` | (a) correctly scoped — fire weather's own genuinely 8-day contract, unrelated to `hazardsOutlook` |
| `scripts/probe-payload-resilience.js:897` | comment: "assertPayloadIntact deliberately covers only the top-level day1..day8, so this is the Hazards Outlook block's own shape gate" | (a) this is the probe suite's OWN self-documentation of the same conclusion — `assertHazardsBlockIntact` (the function this comment introduces) is the Hazards Outlook block's independent, non-8-bounded shape gate |
| `scripts/probe-payload-resilience.js:968` | `GOLDEN_FIRE_WEATHER` JSON literal, `day1Risk`..`day8Risk`/`day1Text`..`day8Text` | (a) correctly day-1..8-scoped golden fixture for fire weather |
| `scripts/probe-payload-resilience.js:3014,3073,3141` | `day7: { ...noRisk }, day8: { ...noRisk }` in three no-risk-gate fixture builders | (a) correctly day-1..8-scoped SPC categorical no-risk fixtures |

**Verdict summary: 0 hits in category (b).** Every hit that touches production code, a comment, or a
fixture is either (a) a genuinely day-1-through-8-scoped product (SPC categorical Day 4-8, fire
weather Day 3-8, or the shared `assertPayloadIntact` oracle's own literal 8-day contract) or (a)
existing documentation already stating the conclusion this audit confirms. RESEARCH.md's Frontend
Integration Risk conclusion is **confirmed against the code as it now stands, not merely assumed**.
No fix is required.

**Additional confirmation (per plan's Part B):** `dayRiskCount`'s regex, `/^day\d+Risk$/`
(`MMM-SPCOutlook.js:231`), does not match any `hazardsOutlook` key — `hazardsOutlook`'s day keys are
`day3`..`day14` with no `Risk` suffix. Confirmed directly by reading `hazardsOutlookHasAnyDay`'s own
comment (`MMM-SPCOutlook.js:244-247`): "WR-08: hazardsOutlook day keys have no `Risk` suffix (`day3`,
not `day3Risk`), so this regex is disjoint from `dayRiskCount`'s — the two never cross-match." The two
regexes (`/^day\d+Risk$/` for `dayRiskCount`, `/^day\d+$/` for `hazardsOutlookHasAnyDay`) are
structurally disjoint on any real key: a string cannot simultaneously end in `Risk` and not end in
anything after the digits. `blockHasRisk` therefore cannot be accidentally applied to the Hazards
Outlook block — confirmed by inspection, not assumed.

---

## Addendum: post-review remediation (2026-08-27)

Two findings from `16-REVIEW.md` were fixed after the phase's implementation plans closed —
CR-01 (critical) and WR-04 (warning). They are recorded here rather than in a new plan's
inventory because they extend two scenarios that already live in this phase's suite.

The suite went **65 → 67** scenarios. Both new scenarios are mutation-proven below; neither
was accepted on a green run alone.

### CR-01 — the D-13 age check no longer depends on the user's location

`node_helper.js`. The check was guarded by `matches.length > 0`, and `matches` is
POST-containment. A layer carrying features with a five-day-old `idp_filedate` raised no
staleness signal whenever none of them contained the user — the majority case. New
`_hazardLayerFiledate(geojson)` reads the timestamp off the RAW body before any filtering;
`_cacheHazardMatches` now stores `{ matches, layerFiledate }` so the value survives a cache
hit. Both fields remain clock-independent (`idp_filedate` is a remote publish timestamp), so
the cache contract is unchanged — the whitelist and its defensive assertion still stand.

Comment (c)'s real intent is preserved and now stated precisely: a genuinely **zero-feature**
layer still returns null and still skips the check. Conflating zero-features with
zero-matches was the defect.

New scenario: `hazards-stale-layer-ages-out-even-when-nothing-contains-the-user`.
It is the complement of `hazards-zero-feature-layers-render-nothing-and-are-not-stale`,
which routes genuinely empty collections and therefore asserts the sanctioned case only.

### WR-04 — the no-risk gate and the band renderer now share one predicate

`MMM-SPCOutlook.js`. The gate counted every `windowBand` entry while the renderer dropped
entries with `offsetEnd < 0`. A band of only-elapsed entries disqualified the short-circuit,
rendered nothing (the heading is written inside the loop, after the `continue`), and printed
`"No Severe Weather Risk (unconfirmed)"` on data that was neither stale nor degraded — a
false staleness signal, the mirror image of CR-01. New `renderableWindowEntries` /
`renderableDayHazards` are read by both the gate and both renderers, so the two cannot drift
again. Same remedy `enabledAdvisories()` already applies to the advisory band.

New scenario: `frontend-hazards-elapsed-band-is-not-a-false-staleness-signal`, with three
controls (live entry still renders; mixed elapsed+live band renders only the live entry; no
orphaned heading).

### Mutations

| # | File | Mutation | Result | Scenario(s) driven RED |
|---|---|---|---|---|
| M1 | `node_helper.js` | Restore the old guard: `const filedate = (Array.isArray(matches) && matches.length > 0) ? matches[0].idpFiledate : null` | **RED** | `hazards-stale-layer-ages-out-even-when-nothing-contains-the-user` — and only it (66 passed, 1 failed) |
| M2 | `MMM-SPCOutlook.js` | Restore the old gate: `hazardsOutlookHasWindowEntries` counts `block.windowBand.length > 0` without the elapsed filter | **RED** | `frontend-hazards-elapsed-band-is-not-a-false-staleness-signal` — and only it (66 passed, 1 failed). The failure message reproduced the defect verbatim: `Rendered: No Severe Weather Risk (unconfirmed)` |
| M3 | `MMM-SPCOutlook.js` | Drop the `offsetEnd < 0` term from `renderableWindowEntries`, so the shared predicate stops filtering | **RED** | Same scenario (66 passed, 1 failed). Rendered the nonsense `Thu–Mon (D-6–-2): Hazardous Heat`, which is why the filter exists |
| M4 | `node_helper.js` | `_hazardLayerFiledate` returns `null` unconditionally | **RED** | Five scenarios (62 passed, 5 failed): the new one plus `hazards-weekend-poll-of-fridays-file-is-not-stale`, `hazards-idp-filedate-is-evaluated-per-layer-not-shared`, `hazards-data-age-sets-the-badge-but-not-the-age-figure`, `hazards-stale-data-still-renders-its-rows`. Broad collateral is the point — it proves the new helper is load-bearing for the entire D-13 path, not just for its own scenario |

All four mutations were applied to md5-verified scratchpad copies and restored by file copy,
never by `git checkout --` (the 16-04 near-miss that destroyed uncommitted work).
Post-restore md5 verified against `pre-mutation.md5` for both files.

**Unproven scenarios: none.** Both new scenarios have at least one dedicated mutation
(M1/M4 for CR-01, M2/M3 for WR-04).

### Not fixed

`WR-01, WR-02, WR-03, WR-05, WR-06, WR-07, WR-08, WR-09, IN-01, IN-02` remain open in
`16-REVIEW.md`. WR-05 in particular is already live in the harness: `HAZARDS_NOW_MS` is
pinned to `Date.UTC(2026, 7, 26, 13, 0)`, now more than 24h behind the real clock, while
`_isWithinStaleWindow` and the three cache-hit timestamp refreshes call `Date.now()` directly
rather than the `_nowMs()` seam. No hazards scenario exercises `_isWithinStaleWindow` today,
which is the only reason it passes.
