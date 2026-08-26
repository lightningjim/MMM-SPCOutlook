# Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook - Context

**Gathered:** 2026-08-26
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship the US Hazards Outlook as one product behind `showHazardsOutlook`. Both day ranges come
from the **same** ArcGIS MapServer (`hazards/cpc_weather_hazards`) — layers `{1,4,7}` are the
WPC Day 3–7 Temperature/Precipitation/Wildfire-Drought set, layers `{3,6,8}` the CPC Day 8–14
set. Deliver per-day hazard entries for Days 3–14 bucketed from the Precipitation layer's
per-feature date stamps, a separate window-labeled band for Temperature/Wildfire hazards that
carry no per-day resolution, Flooding/Drought handling per HAZ-04, lowercase `label` field
reads, and a freshness rule that survives this product's weekday-only cadence.

Requirements: HAZ-01, HAZ-02, HAZ-03, HAZ-04, DATA-02.

**Not in this phase:** HeatRisk + `Promise.all` parallelization (Phase 17), cross-source
merge/precedence/unified payload (Phase 18), the `getDom()` unified-report rewrite (Phase 19),
and the National Flood Outlook (new phase — see Deferred Ideas).

**What makes this product structurally unlike ERO and WSSI:** there is no ordinal severity
anywhere in its schema. `label` is free-text hazard *type* (`"Hazardous Heat"`,
`"Critical Wildfire Risk"`, `"Heavy Rain"`), not a graded tier, and there is nothing analogous
to ERO's `dn` or fire weather's `DN` to fall back on (RESEARCH Pitfall 1). A max-comparator is
meaningless here. Equally, one URL covers five-to-seven days with the date baked into each
feature's `start_date`/`end_date` — the inverse of the day→layer mapping `arcgis-day-layers`
rows use.

</domain>

<decisions>
## Implementation Decisions

### Day bucketing & payload shape

- **D-01:** Payload carries offset keys `day3`…`day14` in its own sibling block (mirroring
  `excessiveRain` / `winterImpact` per Phase 14 D-02), and **each day additionally carries its
  resolved UTC `date`**. The frontend labels weekdays from that date rather than computing
  `dowToText(dow + N)`. Rationale: Pitfall 9 established that WPC's "Day N" boundary differs
  from SPC's, so offset arithmetic drifts by one; carrying the real date removes the drift
  while keeping the familiar block shape. Extends Phase 14 D-03's precedent of carrying raw
  time data into the payload for Phase 18 to inherit.

- **D-02:** A day carries **every** hazard covering the location, as an array, ordered by an
  explicit order list declared on the registry row — e.g.
  `day5: { date, hazards: ["Heavy Rain", "Severe Weather"] }`. Not a single winner. There is no
  severity ladder to pick a winner from, so any single-value shape would invent a ranking the
  product does not have and silently hide a co-occurring hazard. Registry-declared order rather
  than ArcGIS response order because response order can flip between polls on an unchanged
  forecast, which reads as a change on a glanceable mirror and defeats PERF-02's byte-identity
  intent.
  *Consequence for planning:* `evaluatePolygons`' max-comparator contract does not apply. This
  product needs a collect-all evaluator that returns the set of matching features.

- **D-03:** Bucket on the **UTC calendar date** in `start_date`/`end_date`; the offset is that
  date minus today's UTC date. Source-native, zero conversion, so this product's "Day 5" means
  exactly what WPC means by Day 5 and matches their published graphic. Accepts that it is not
  the same 24h window as SPC's 12Z–12Z Day 5 — a discrepancy Phase 18's merge must own anyway,
  and one D-01's date stamp makes visible rather than hidden. Rejected: local-calendar
  bucketing (00Z is ~6–7pm local the prior evening in CONUS, and the module has no timezone
  source), and re-cutting to 12Z–12Z (straddles polygons across two windows).

- **D-04:** A Precipitation feature spanning multiple days appears on **every day in its span**
  — a 2-day "Heavy Rain" renders on both days, because the day grid answers "is there a hazard
  on this day" and on day two the answer is yes. **Guard:** if a Precipitation feature's span
  equals its layer's full nominal window (D3–7 / D8–14), it is window-level, not per-day —
  route it to the window band instead. That guard is what keeps D-04 from becoming the Pitfall 3
  spread (repeating a window-level hazard across days implies a daily resolution that does not
  exist).

### Window band for Temperature / Wildfire

- **D-05:** Window-spanning hazards render in their **own labeled region, below the day rows** —
  not folded into the advisory band 15 D-05 built. The advisory band holds things in effect
  *now* (MDs/MPDs are 1–6h nowcasts); this is a 5-to-7-day forecast window, and "in effect"
  wording does not apply to it. Accepted cost: Phase 19 relocates two blocks rather than one.

- **D-06:** The band labels each entry with its **observed span**, derived from the feature's own
  `start_date`/`end_date`, not the layer's nominal window. Live evidence: a D8–14 "Extreme Heat"
  feature spanned Aug 23–24 — 2 days inside a nominal 7-day bucket, and "granularity is not
  fixed even within one product" (Pitfall 3). Labeling it `D8–14` would advertise 7 days of heat
  where the data says 2. Satisfies HAZ-02 as written: one entry, labeled window, never repeated
  per-day.

- **D-07:** **One band**, entries sorted by span start, each self-labeling its span. Both day
  ranges share it; no per-range subheadings. Rejected grouping by hazard dimension — that would
  invent Phase 18's taxonomy a phase early, before it can be validated against live payloads,
  which is exactly what research said not to do (Pitfall 10).

- **D-08:** Entry wording carries **both** weekday and offset:
  `Thu–Mon (D3–7): Hazardous Heat`. Weekday for scan speed at mirror distance and consistency
  with every existing row; offset because a D8–14 span wraps past seven days and a bare weekday
  pair becomes ambiguous about which week. Uses D-01's dates as its weekday source.

### Label filtering & vocabulary

**Provenance of HAZ-04 — two different rationales, deliberately handled differently:**
`Flooding Likely` / `Flooding Occurring or Imminent` / `Flooding Possible` are **not WPC-native
to this product**. They originate from the **National Flood Outlook**, a seventh NOAA product
outside v2.0's scope and never researched, riding inside the Precipitation layer's attributes
(FEATURES.md:190, :258). Rendering them puts an unresearched product's data on the mirror
attributed as if it were Hazards Outlook or ERO data — and they are the conceptual inverse of
ERO (actual/imminent flood **status** vs forward-looking pre-event flash-flood **probability**).
Drought's exclusion is a different argument entirely: slow-onset, and the Wildfire/Drought layer
multiplexes both families on the `label` attribute, so label filtering is the isolation
mechanism regardless.

- **D-09:** **Flooding labels are hard-excluded in the registry row, in code, with no config
  override.** This is a provenance boundary, not a preference — a knob to re-enable them would
  be a knob to display misattributed data. The exclusion carries a comment citing the National
  Flood Outlook as the real source.

- **D-10:** **Drought is a preference, gated not filtered** — a new flat boolean `showDrought`,
  defaulting `false`, matching CFG-01's shape and every other toggle in the module. A label-array
  in `config.js` was rejected: it would be the module's first non-boolean product config, a typo
  could silently un-filter flooding, and the registry would lose ownership of the product's
  vocabulary, which is the mechanism DATA-03 relies on (Phase 14 D-07).

- **D-11:** A label that is neither excluded nor in the registry's display map **renders verbatim
  in the default style and logs once**. The MapServer legend carries ~15 labels while the August
  live pull returned 7 — `Frost/Freeze`, `Heavy Ice`, `Significant Waves`, `Much Above/Below
  Normal Temperatures` and `Critical Wildfire Risk` have never been observed live. Dropping
  unknowns would make a mid-season WPC addition invisible until someone read the logs: the
  Pitfall 8 false-negative shape. An unstyled string on the mirror is visible, and visible beats
  silent.

- **D-12:** The Precipitation layer's **`Severe Weather` label renders verbatim** this phase.
  Phase 18 is chartered to build the hazard-dimension taxonomy and validate suppression against
  live payloads; inventing a precedence rule here is what research explicitly warned against.
  WPC documents this layer as derived from SPC's medium-range outlooks ≥15%, but Pitfall 10
  established it sits in the **Precipitation** grouping — it flags convection-associated precip
  feeding flood risk, not an independent tor/hail/wind forecast, so suppressing it can hide
  flood signal SPC's categorical never expressed. Accepted cost: for two phases it renders near
  SPC's Day 4–8 categorical and may read as a duplicate.

### Freshness (DATA-02)

**Finding that reframes DATA-02:** today's `_isWithinStaleWindow(timestamp, intervalMinutes)`
measures time since the last *successful fetch*, gating the serve-last-known-good fallback — not
data age. On a Saturday the fetch succeeds and returns Friday's file, so **no weekend false alarm
arises from the current code**. The false alarm DATA-02 anticipates only appears once a data-age
check against `idp_filedate` is added. DATA-02 is therefore about how to add that check safely,
not about repairing an existing misfire.

**Cadence conflict (unresolved, flagged for planning):** STACK's live `serviceDescription` says
*"Daily Monday-Friday at 17:00Z"*; FEATURES, citing WPC's own product page, says *"twice daily,
7 days/week"* for CONUS. SUMMARY's precedence rule puts live evidence first. D-13 is chosen
specifically to be robust to this conflict rather than to resolve it.

- **D-13:** A **flat `maxDataAgeHours` on `idp_filedate`**, declared per registry row. Catches a
  genuinely stalled feed — WPC stops publishing while the endpoint still returns 200 with an old
  file — without hardcoding a calendar. Rejected: a weekend-aware expected-issuance calculator
  (tighter detection, but it hardcodes the exact cadence the two sources disagree on, and gets
  federal holidays wrong), and no age check at all (satisfies DATA-02 trivially but lets a
  stalled-yet-serving feed read as fresh indefinitely).

- **D-14:** `maxDataAgeHours = 84`. Fri 17Z + 84h = Mon 05Z, clearing a normal weekend with ~12h
  of slack before Monday's 17Z issuance, and catching a mid-week stall within about a day.
  Known limitation: a federal-holiday Monday pushes the real gap to 96h (Fri 17Z → Tue 17Z), so
  the badge fires on roughly 10 days a year — where it is technically correct that nothing new
  has published.

- **D-15:** A tripped data-age check **sets the global `anyStale` flag but is excluded from
  `_staleAsOf`**. The ⚠ badge fires so nothing is silently old, but this product does not drag
  the "N minutes ago" figure, which describes fetch staleness. Without this, a 60-hour-old
  hazards file would make the badge speak for SPC data fetched five minutes ago — training the
  user to distrust a badge that is usually right. This honors Phase 14 D-04's global-only rule
  and stays clear of the per-product staleness UX 15 D-04 deferred to Phase 18; the cost is a
  documented asymmetry in which field each condition feeds, which plans must comment at the
  write site.

- **D-16:** When judged data-stale, **the Hazards rows still render their content.** Decided
  rather than asked, on established precedent: `rejectBody` serves last-known-good specifically
  so "a WPC hiccup during an active HIGH must not blank the display," and CR-01 already made
  staleness disable the confident all-clear rather than suppress data. Suppressing rows would
  convert an age signal into a false negative.

### Claude's Discretion

- **The registry `kind` for this product.** Neither existing kind fits: `arcgis-day-layers` maps
  day→layer with one URL per day, while this product has one URL per *hazard family* covering
  many days with dates inside the features. A third kind is needed; its name, and whether
  dispatch is a switch, a handler map, or per-row function references, is open (15 D-01 left
  this open deliberately).
- Whether the D-02 collect-all evaluator sits beside `evaluatePolygons` or replaces it for this
  kind, and where the D-03/D-04 date-bucketing helper physically lives.
- Whether the six layers are one registry row with a layer list, or two rows sharing constants.
- Exact row wording for per-day entries, and the separator between multiple hazards on one day.
- Color treatment. 15 D-08's "cite the published renderer" precedent does not transfer: this
  service's legend swatches are embedded PNGs, not machine-readable `drawingInfo` hex
  (FEATURES.md rates this LOW confidence and flags it for visual verification at implementation
  time against `wpc.ncep.noaa.gov/threats/threats.php`). Whatever is chosen, cite its provenance
  in the row per D-08 rather than repeating IN-01's uncited-palette finding.
- Whether the `showHazardsOutlook` / `showDrought` defaults are applied frontend-only or also
  re-defaulted node_helper-side (Phase 14 left this open; WR-16 notes rows contribute their own
  `configFlag`, so `showDrought` may need explicit handling since it is not a product flag).

</decisions>

<specifics>
## Specific Ideas

- On HAZ-04's provenance: the user was **not aware** the Flooding labels came from a separate
  NOAA product until it surfaced in this discussion, and immediately scoped the National Flood
  Outlook as its own phase this milestone rather than accepting the filter as permanent. The
  filter is therefore an interim measure with a known successor, not a final answer — D-09's
  comment should say so.
- The recurring preference across Phases 14–16 holds: **structural enforcement over convention.**
  D-09 (code-only, no override), D-10 (flat boolean rather than a typo-prone label list), and
  D-02 (registry-declared order rather than response order) are all the same instinct as Phase
  14's non-overridable `f=geojson`.
- **Visibility beats silence** is the tiebreaker used in D-11, D-12 and D-16 alike. Every
  three-way choice in this discussion resolved against the option that could hide a real hazard,
  even when that option produced tidier output.
- Deployment reality unchanged from Phase 15: **one module instance, one fixed location.**

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

ROADMAP.md declares no `Canonical refs:` line for Phase 16; this list was assembled during
discussion and codebase scouting.

### Phase scope and requirements
- `.planning/ROADMAP.md` § "Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook" — goal, 5
  success criteria, dependencies (Phases 14 and 15)
- `.planning/REQUIREMENTS.md` — HAZ-01/02/03/04 (lines 30–33), DATA-02 (line 70)
- `.planning/ROADMAP.md` § "Phase 18" — the merge/precedence phase D-12 defers `Severe Weather`
  suppression to
- `.planning/ROADMAP.md` § "Phase 19" RPT-04 — advisory band placement, which D-05 deliberately
  does **not** join

### Product research — read before writing any parser
- `.planning/research/STACK.md` §"1 & 2. WPC Day 3–7 / CPC Day 8–14 US Hazards Outlook" — live
  verified schema (`label`, `start_date`/`end_date`, `idp_filedate`), the Mon–Fri 17:00Z cadence
  behind D-13/D-14, ETag confirmation, and the `outlooks/cpc_8_14_day_outlk` service that must
  **not** be used
- `.planning/research/FEATURES.md` §A1, §A2 (lines 14–52) — the full ~15-label legend domain per
  layer, fetched directly from the MapServer at HIGH confidence. **This is the authority for
  D-11's display map**, not the August live sample
- `.planning/research/FEATURES.md` lines 190, 198, 258, 319 — the National Flood Outlook
  provenance argument that is the entire reason for D-09
- `.planning/research/PITFALLS.md` Pitfall 1 (no severity ladder → D-02), Pitfall 3 (per-day
  resolution varies within one service → D-04, D-06), Pitfall 8 (`LABEL` vs `label` silent false
  negative → HAZ-03, D-11), Pitfall 9 (day-of-week drift → D-01), Pitfall 10 (`Severe Weather`
  is precipitation-dimension → D-12)
- `.planning/research/SUMMARY.md` Conflict 2 (window-spanning placement options A/B/C → D-05),
  Conflict 3 and Decision Queue #3 (the Flooding/Drought exclusion recommendation → D-09, D-10)

### Locked prior decisions (do not re-litigate)
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-CONTEXT.md` — D-02 (sibling
  payload block; do not pre-adopt Phase 18's schema), D-04 (global `anyStale`), D-05 (toggle off
  still emits a full zero-valued block), D-06 (nested `products` object on the wire, flat
  booleans in user config), D-07 (registry row owns its own label→value map — DATA-03), D-09
  (`buildArcGisQuery`, `f=geojson` hardcoded and non-overridable — DATA-01)
- `.planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-CONTEXT.md`
  — D-01 (`kind` per registry row, with a slot left open for products that are not ArcGIS
  day-layer shaped), D-04 (fetch failure sets stale; a clean zero-result does not), D-05 (the
  advisory band D-05 here declines to join), D-08 (cite the palette source in the row), D-09
  AMENDED (absence is silence), D-10 (every probe scenario must be mutation-proven)

### Defect history that shapes this phase
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW.md` — IN-01 (uncited
  palette, which the color discretion item must not repeat), WR-06 (a fix applied to the new
  product and not its twin)
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW-FIX.md` — CR-01
  (staleness must disable the confident all-clear — the basis for D-16), the mutation-proof
  standard
- `.planning/STATE.md` § Accumulated Context — the Phase 15 D-10 mutation-proof rule (a scenario
  green under its own mutation is a fixture defect), and the live-verification procedure for
  location-gated products

### Code
- `productRegistry.js` — `PRODUCT_REGISTRY` (:125), `buildArcGisQuery` (:24), `daySpanOf` (:57);
  the `excessiveRain` and `winterImpact` rows are the shape this product departs from, and the
  file's closing comment (:241) already reserves the slot for this row
- `node_helper.js` — `_runArcGisDayProduct` (:214), `extractPolygons` / `evaluatePolygons` /
  `checkInPolygon`, `fetchGeoJsonCached`, `_isWithinStaleWindow` (:1305), `_oldestStaleAt`
  (:177, :1331), `_validTimeOfWinner`, `_productToggles`
- `MMM-SPCOutlook.js` — `defaults:` block (gains `showHazardsOutlook`, `showDrought`), the
  `getDom` no-risk short-circuit (~:161, gated on `!this.spcrisk._stale` per CR-01 — **this
  condition must be audited for the new product's day rows AND its window band**), the advisory
  render block
- `scripts/probe-payload-resilience.js` + `scripts/probe-lib/module-stubs.js` — the 32-scenario
  suite this phase extends, and its `_fetch(url, options)` transport seam
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/ARCHITECTURE.md` — house style

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`fetchGeoJsonCached`** works unchanged for this product — ETag is confirmed present
  (`etag: "36c6f118"` on a live response), so the ETag-first branch engages with zero changes,
  and volume is small (1–27 features per layer, `maxRecordCount: 2000`, no pagination).
- **`buildArcGisQuery`** applies as-is: this MapServer is on the allowlisted
  `mapservices.weather.noaa.gov` host, and all six layer ids are non-negative integers.
- **`_runArcGisDayProduct`** is a useful structural template — its per-day try/catch, its
  "contained throw is a degrade, not a clean read" staleness rule, and its convert-once-after-
  the-branch discipline all transfer. But its **day→URL loop does not**: this product fetches
  per hazard-family layer, not per day, so this is a sibling method, not a reuse.
- **`daySpanOf`**'s "make the invalid state unrepresentable" instinct applies to this row's day
  range too — though `day3..day14` is not a contiguous `1..N` map, so `daySpanOf` itself cannot
  validate it and a variant is needed.
- The probe harness's `_fetch(url, options)` seam makes the real `fetchGeoJsonCached` path
  drivable offline; new scenarios should use it rather than stubbing wholesale.

### Established Patterns
- **Absence is silence** — outside every polygon produces no row, not a blank row and not a
  "None" row (ERO-03, 15 D-09). Applies to both the day rows and the window band.
- **Remote strings reaching `innerHTML` go through `escapeHtml`.** D-11 makes this load-bearing:
  an unmapped label is remote text rendered verbatim, so it is exactly the case `escapeHtml`
  exists for. This is a hard requirement, not a nicety.
- **Per-item containment** — one bad feature must never discard its siblings (the CR-02 lesson).
  With D-02 returning a set per day, this now applies within a single day's hazard array.
- Registry rows are **pure static configuration** — no `this`, no network, no `require`
  (15 D-02). Anything needing the transport seam lives in `node_helper.js`.
- `redirect: "error"` and a 15s abort timeout apply to every fetch.
- No automated test framework; verification is probe scenarios plus manual UAT.

### Integration Points
- **`getDom`'s no-risk short-circuit** (`MMM-SPCOutlook.js:161`) — 15's context flagged that
  "adding a product means auditing that condition." This phase adds **two** independently
  renderable things (day rows and the window band), and a location can be inside a window
  polygon while every day row is empty. Both must participate, or the module shows
  "No Severe Weather Risk" while a `Hazardous Heat` band is live. Phase 15 shipped a production
  defect of exactly this shape (the `getDom` no-risk gate that made MPD invisible).
- **`_oldestStaleAt`** (`node_helper.js:177`, `:1331`) — D-15 requires this product's data-age
  condition to reach `anyStale` **without** reaching `_oldestStaleAt`. That asymmetry is the
  single most comment-worthy line in the phase; an uncommented exclusion reads as a bug.
- **`_productToggles`** — `showDrought` is not a product flag in the WR-16 sense (it does not
  gate a fetch, it gates labels within a product already being fetched), so it does not fit the
  per-row `configFlag` read and needs its own path.
- **Payload key range** — `day9`…`day14` are new to this module; nothing else emits past `day8`.
  Any frontend loop bounded at 8 needs checking.

</code_context>

<deferred>
## Deferred Ideas

- **National Flood Outlook as a 7th data source — its own phase, THIS milestone.**
  User-requested during this discussion on learning that the Hazards Outlook's `Flooding` labels
  originate from it. This is the successor to D-09's interim exclusion: once the product is
  integrated on its own terms, flood status can be displayed with correct provenance instead of
  filtered out. Appending after Phase 19 does not renumber Phases 16–19.
  Command: `/bm:add-phase`.
- **Color treatment for hazard labels** — deferred to planning/implementation discretion rather
  than decided here, because the legend is PNG swatches and needs visual verification against
  `wpc.ncep.noaa.gov/threats/threats.php` at implementation time.
- **Whether `Much Above Normal Temperatures` / `Much Below Normal Temperatures` are actionable
  enough to render** — surfaced and not pursued. Under D-11 they render verbatim by default; if
  they prove noisy in season, they are candidates for the same treatment as drought.
- **Resolving the cadence conflict** (STACK's Mon–Fri 17:00Z vs FEATURES' twice-daily 7-day) —
  D-13 was chosen to be robust to it rather than to settle it. Worth one live `idp_filedate`
  observation across a weekend to confirm which is right; would allow tightening D-14's 84h.
- **Per-product staleness UX** — still deferred per 14 D-04 and 15 D-04; D-15's asymmetry is the
  minimum needed to keep the global badge honest, not a step toward per-product badges. Revisit
  no earlier than Phase 18.
- **`Severe Weather` suppression** — explicitly Phase 18's, per D-12.

</deferred>

---

*Phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook*
*Context gathered: 2026-08-26*
