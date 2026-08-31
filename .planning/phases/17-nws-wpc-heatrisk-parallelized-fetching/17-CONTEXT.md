# Phase 17: NWS/WPC HeatRisk & Parallelized Fetching - Context

**Gathered:** 2026-08-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Two deliverables in one phase.

**(1) HeatRisk** — the milestone's only non-polygon, turf-free product. A single ArcGIS
**ImageServer `identify`** call against
`https://mapservices.weather.noaa.gov/experimental/rest/services/NWS_HeatRisk/ImageServer`
returns a scalar pixel value plus a 7-entry `catalogItems.features` mosaic catalog and an
index-aligned `properties.Values` array covering the full 7-day forecast window in **one HTTP
round-trip**. Coordinates must be reprojected to Web Mercator (`wkid:102100`) via
`turf.toMercator()` before the call — `sr=4326` returns `"NoData"` even for points with real
data, live-verified. Category domain is `0`–`4` (Little-to-no / Minor / Moderate / Major /
Extreme). `extractPolygons` / `evaluatePolygons` / `checkInPolygon` do not apply at all;
`fetchGeoJsonCached` is reused only for its ETag/hash mechanics, which work because it calls
generic `JSON.parse` and never validates FeatureCollection shape.

**(2) Parallelized fetching** — convert the sequential new-product runner awaits in
`getSpcOutlook` (`node_helper.js:2921`, `:2933`, `:2946`, and the `kml-advisory` for-loop at
`:2959`) into one concurrent batch, so cold-start latency stops growing linearly per enabled
product.

Requirements: HEAT-01, HEAT-02, HEAT-03, HEAT-04, PERF-01, DATA-03.

**Not in this phase:** cross-source merge/precedence/unified payload (Phase 18), the
`getDom()` unified-report rewrite (Phase 19), the cold-cache latency measurement on Pi
hardware (Phase 18 PERF-03), the National Flood Outlook (its own phase, appended after 19),
and **any change to the existing ~25-hop sequential SPC/fire-weather await chain** — research
and the roadmap both scope PERF-01 to the new products only.

**What makes this product structurally unlike every predecessor:** every other product in
this module, existing and new, is *fetch a feature collection, evaluate the point locally with
turf*. HeatRisk is a genuine server-side point query returning a scalar. There is no polygon,
no `includesFeat` comparator over features, no max-comparator, and no `LABEL`/`label` field.
Its day dimension lives in `idp_validtime` epoch-ms stamps inside an **arbitrarily ordered**
catalog (live-observed order `5,7,1,4,6,2,3`), and the top-level `value` field reflects
whichever tile `catalogItemVisibilities` marks visible — observed to differ across two
otherwise-identical calls — so it is never "today."

</domain>

<decisions>
## Implementation Decisions

### HeatRisk display floor

- **D-01: Display floor at category 2 (Moderate); a flat `showMinorHeat` boolean, default
  `false`, drops it to 1.** HeatRisk's ladder is health-impact-framed, not
  meteorological-severity-framed: NWS defines Level 1/Minor as affecting "primarily those
  individuals extremely sensitive to heat," which at CONUS latitudes is close to a
  summer-long constant. This is the same shape as WSSI's `WINTER WEATHER AREA` tier, which
  15 D-09 AMENDED filtered on WPC's own words ("not anticipated to impact daily life").
  Rejected: floor at 1 unconditionally (plausibly seven yellow rows every day for months —
  the noise problem that produced 16 D-10's `showDrought` gate); floor at 2 with no escape
  hatch (a heat-sensitive user loses a heads-up they may specifically want).

- **D-02: The floor is applied frontend-only. The backend always emits the full `day1`–`day7`
  block carrying the raw `0`–`4` category**, exactly as `_runArcGisDayProduct` emits its full
  day span with value 0 → tier NONE (Phase 14 D-05). `getDom()` applies the floor, the same
  way it already guards on `dayNRisk > 0` for ERO and fire weather. **`showMinorHeat`
  therefore never enters `SUB_TOGGLES`, never enters the `products` object in
  `buildRequestPayload`, and never reaches `node_helper.js`** — it is a pure frontend config
  read, unlike `showDrought`, which must reach the backend because it gates labels inside a
  fetched product.
  *Load-bearing rationale for Phase 18:* MERGE-03 states HeatRisk's 5-level scale supersedes
  WPC's binary "Hazardous Heat" flag. If a filtered Level 1 never reached the payload, Phase
  18 could not distinguish *"HeatRisk said Minor"* from *"HeatRisk had no reading"*, and would
  either leak WPC's coarse flag through or suppress it on no evidence. Keeping the raw
  category in the payload is what makes MERGE-03 decidable. This extends 16 D-01's precedent
  of carrying raw data into the payload for Phase 18 to inherit.

- **D-03: One shared predicate is the sole source of both the `getDom()` render loop and the
  no-risk short-circuit term.** Because the floor is toggle-dependent, the payload can carry a
  non-zero category that renders nothing; a gate reading the raw category while the loop reads
  the floored one would suppress the all-clear for rows the user cannot see — a blank module
  with no message. Deriving both from a single expression (e.g.
  `heatRiskDaysToRender(payload, showMinorHeat)`) makes disagreement unrepresentable rather
  than commented. This is the third phase running to audit `MMM-SPCOutlook.js:355`; Phase 15
  shipped a production defect of this exact shape (the `getDom` gate that made MPD invisible)
  and Phase 16 had to audit two independently renderable regions.

### NoData, day gaps, and pairing

- **D-04: Partial `NoData` is silence; all-days-`NoData` sets `anyStale` and logs once.** If
  any day resolves to a real 0–4, the identify call and the Mercator reprojection are
  demonstrably working, so a `NoData` elsewhere is genuine data absence — no row, no badge,
  consistent with 15 D-04 ("a clean zero-result is not stale"). If **every** day is `NoData`,
  the module cannot distinguish an out-of-coverage location from a systemic break, and both
  warrant a signal — this is precisely the HEAT-03 failure mode (`sr=4326` returning `NoData`
  for points that have data) reading as "no heat risk anywhere, forever," the Pitfall 8
  false-negative shape. Accepted cost: a permanent ⚠ for a genuinely out-of-coverage
  deployment — the same trade 16 D-14 already took.

- **D-05: Day gaps are handled position-aware.** After HEAT-04's dedupe, a gap at the **tail**
  of the 1–7 grid (the highest day(s), with nothing resolved beyond them) is silence with no
  badge — consistent with routine mosaic rotation, where the newest tile has not yet landed.
  A gap at **Day 1**, or any **interior** gap with resolved days on both sides, sets
  `anyStale` and logs once: the sequence itself is broken, and a day is being attributed by a
  rule that has just demonstrated it is unreliable. Rationale: the live-observed response (7
  catalog items, 6 distinct `idp_validtime` values) would fire a badge under any blanket
  gap-is-stale rule, suggesting tail gaps are normal; but a missing Day 1 during a heat wave
  rendering identically to a Day 1 with no heat risk violates the project's core value
  statement ("no false negatives") directly.
  *Consequence for planning:* this is a compound condition and **both branches must be
  mutation-proven separately** per 15 D-10 — a tail-gap fixture proving silence, and an
  interior/Day-1 fixture proving the badge, each RED under its own mutation with a diagnosable
  message.

- **D-06: Zip before sorting, then guard.** Build `{item, value}` tuples from
  `catalogItems.features` and `properties.Values` **before any sort**, so no positional index
  survives into the sort and desync is unrepresentable rather than guarded against. Then a
  precondition guard on entry: if `properties.Values` is absent, or its length differs from
  `catalogItems.features`, abandon HeatRisk for this poll — emit the zero-valued block, set
  `anyStale`, log once. This applies 15 D-10's own named preventative ("a precondition guard
  that throws if setup didn't produce the state under test") to production code, not just
  probe fixtures. Rejected: zipping to the shorter length (a front-truncation silently
  mis-attributes every surviving pair — a wrong category confidently shown on the wrong day,
  strictly worse than showing nothing); falling back to the top-level `value` as Day 1 (STACK
  live-observed that field tracking `catalogItemVisibilities`, with two different selections
  across two identical calls — it is not "today," and pinning it to Day 1 is exactly the
  misattribution HEAT-02 forbids).

- **D-07: `maxDataAgeHours = 12`, applied per item surviving HEAT-04's dedupe.** The service
  publishes hourly ("most recent data should be available at the top of hour", live
  `serviceDescription`), so 12h allows ~11 missed cycles — clear of routine publishing jitter
  while catching a genuine stall within half a day. Per-item rather than one product-level
  timestamp, mirroring 16 D-14's per-layer application (which found three distinct filedates
  across six layers in a single poll); this also catches a partial rotation stall the dedupe
  alone cannot see — a tile that is the sole survivor for its day but is a run behind.
  **16 D-15's asymmetry carries forward unchanged:** a data-age trip sets `anyStale` but is
  excluded from `_staleAsOf`, because `_staleAsOf` describes fetch age, not data age. That
  exclusion must be commented at the write site — an uncommented one reads as a bug.

### Parallelization

**Analysis result, established during discussion — do not re-litigate.** STATE.md flags
`_unusableFeatureCount` and `_oldestStaleAt` as "safe only because CR-03's `_inFlight` guard
makes chain overlap unreachable… must be revisited if that guard is removed or bypassed in
Phase 17's `Promise.all`." **The guard is not bypassed.** `_inFlight` (`node_helper.js:196`,
`:1180`) serializes *across* `socketNotificationReceived` invocations, not within one, and
batching inside a single run does not touch it. Both fields also survive intra-run concurrency
on their own merits: `_unusableFeatureCount` is a monotone counter sampled start-vs-end
(`:2348`, `:2967`) whose increments are atomic between awaits on a single-threaded event loop,
and `_oldestStaleAt` is an order-independent min-reduce (`:1855`). Planning should **verify**
this rather than assume it, but the concern as written does not land.

- **D-08: `Promise.allSettled`, not `Promise.all`.** Each product settles independently; a
  rejection is handled per-product — emit that row's zero-valued block, set `anyStale`, log
  once — while every other product's payload survives. The sequential code today already has
  this property; `Promise.all` would let one throw discard five healthy payloads into
  `getSpcOutlook`'s own catch, which is the "total outage rendering as a confident all-clear"
  shape Phase 14's round-3 deep review caught as that phase's highest-severity finding. All
  runners are *documented* as never throwing, but `Promise.all` converts a comment-level
  invariant into a load-bearing one, in a codebase whose review history is largely about
  invariants that held until they didn't (WR-06, CR-01, the MPD gate). PERF-01 must not
  reintroduce that class as a side effect of a latency fix. Rejected: `Promise.all` with a
  `.catch()` per call site — functionally equivalent but produces six near-identical catch
  blocks, the WR-06 divergence shape.

- **D-09: All six calls join one flat batch.** ERO, WSSI, hazardsOutlook, HeatRisk, spcMD and
  mpd each become one member, replacing both the three named awaits and the `kml-advisory`
  for-loop (which becomes a map over `kind === "kml-advisory"` rows, preserving registry-driven
  dispatch). MPD's discovery-then-N-KMZ chain is the longest single sequence in the set, so
  overlapping it is where most of the wall-clock win actually is. D-08's containment bounds
  each member's blast radius, so including the always-on `spcMD` (default `true` per 15's
  deliberate CFG-01 deviation) costs no more than including any other member. Note that on a
  stock config the batch has exactly one live member and five toggle-off no-ops — PERF-01's
  benefit is realized only as products are enabled, which is precisely how the requirement is
  worded.
  *Consequence for planning:* `advisories[row.id] = …` currently assigns inside the loop; under
  a batch, results must be collected and assigned after settlement.

- **D-10: PERF-01 is proven by a probe scenario plus a per-run timing log.** The scenario
  drives the real path through the existing `_fetch(url, options)` transport seam, records
  request issue order, and asserts a later member's first request is issued before an earlier
  member's response resolves — cleanly mutation-provable per 15 D-10 (revert to sequential
  awaits → RED with a diagnosable message). The log line carries each member's elapsed ms and
  the batch's wall clock. Success criterion 4 names timing **and** logs, and the log is the
  instrument Phase 18's PERF-03 needs on the Pi — without it, Phase 18 begins by building one.

- **D-11: DATA-03 is enforced by a load-time identity assertion plus a recorded spot check.**
  A fourth validator beside `daySpanOf` / `dayRangeOf` / `dayRangeSpanning`: at module load,
  assert that no two `PRODUCT_REGISTRY` rows share object identity on any value / tier / text /
  color map, throwing with both row ids named. This catches the shared-reference reuse the
  criterion's own example describes (ERO's `dn` fed through fire weather's `DN` table) on
  first run rather than in the field, and matches the file's established "make the invalid
  state unrepresentable, throw at load time" pattern. Paired with an explicit spot-check table
  in the phase verification covering what identity **cannot** see — a `toValue` closure reading
  a foreign constant directly — with that limitation stated in the assertion's own comment
  rather than left implied. Rejected: assertion alone (overstates its own coverage); spot check
  alone (a point-in-time artifact with nothing enforcing it afterward, in a codebase that has
  twice found a fix applied to one product and not its twin).

### Claude's Discretion

- **Whether HeatRisk gets a `PRODUCT_REGISTRY` row at all, and if so its `kind` name and
  dispatch shape.** A fourth kind beside `arcgis-day-layers`, `kml-advisory` and
  `arcgis-hazard-window` is the obvious read, and D-11's identity assertion and D-07's
  `maxDataAgeHours` both want a row to live on. But the row would carry no `buildUrl(day)`,
  no `includesFeat` over features, and no polygon vocabulary, so a genuinely standalone
  function is defensible. 15 D-01 left the `kind` slot open deliberately; the same latitude
  applies here.
- **Concurrency depth.** D-09's shape implies product-level fan-out — ≤6 concurrent chains,
  each keeping its internal per-day / per-layer loop sequential. Flattening further (~20
  concurrent sockets, ~20 `JSON.parse` + turf evaluations landing at once on a single-core Pi)
  was raised and not selected for discussion; product-level is the default unless planning
  finds evidence it is insufficient. PROJECT.md's constraint is explicit: "avoid blocking the
  event loop."
- **Row wording, per-day row layout, and where the HeatRisk block sits relative to the SPC day
  rows** for the two phases before Phase 19 rewrites the display.
- **Palette source of truth and its provenance citation.** HeatRisk has a documented
  green/yellow/orange/red/magenta ladder; whether the hex values come from the ImageServer's
  own rendering rule or from NWS documentation is open, but 15 D-08 / 14-REVIEW IN-01 require
  the source be cited on the row (`paletteSource`) either way.
- **Bounding of the once-only log keys** introduced by D-04, D-05 and D-06 — 16-REVIEW WR-06
  bounded the unmapped-label ledger for the same reason; whether these need the same treatment
  depends on their key cardinality, which is small here.
- **Where the HeatRisk parse/sort/dedupe helper physically lives**, and whether the day-offset
  computation reuses the existing `_utcMidnight()` seam (`node_helper.js:1893`).

</decisions>

<specifics>
## Specific Ideas

- The **structural-enforcement-over-convention** preference holds for a fourth consecutive
  phase. D-03 (one shared predicate rather than two audited expressions), D-06 (zip before
  sort so desync is unrepresentable, rather than a check for it), and D-11 (a load-time throw
  rather than a review checklist) are the same instinct as Phase 14's non-overridable
  `f=geojson`, 16 D-09's code-only exclusion and `daySpanOf`'s derive-don't-restate rule.
- **Failure shapes get distinguished, not collapsed.** Where a blanket rule was available,
  the finer one was chosen every time: D-04 splits partial from total `NoData`, D-05 splits
  tail gaps from interior gaps, D-07 applies per surviving item rather than product-wide.
  The accepted cost each time is a compound condition that must be mutation-proven in both
  branches.
- **The all-clear is treated as an assertion, not a default.** D-03's framing — that a
  suppressed all-clear with nothing rendered is *worse* than either branch — is the same
  reasoning behind 14 CR-01 and 16 D-16: the module must never be simultaneously silent and
  uninformative.
- **A latency fix must not buy speed with a new outage class.** D-08 was chosen specifically
  because `Promise.all` would make a documented invariant load-bearing, which is how this
  codebase's worst findings have historically arrived.
- Deployment reality unchanged from Phases 15 and 16: **one module instance, one fixed
  location** (Norman, OK — solidly inside HeatRisk's CONUS coverage, which is why D-04's
  all-`NoData` badge is a break signal rather than a coverage signal for this deployment).

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

ROADMAP.md declares no `Canonical refs:` line for Phase 17; this list was assembled during
discussion and codebase scouting.

### Phase scope and requirements
- `.planning/ROADMAP.md` § "Phase 17: NWS/WPC HeatRisk & Parallelized Fetching" — goal, the 5
  success criteria, dependencies (Phases 14, 15, 16)
- `.planning/REQUIREMENTS.md` — HEAT-01/02/03/04 (lines 37–40), PERF-01 (line 63), DATA-03
  (line 71); also PERF-02 (line 64, already satisfied — cache-key stability constrains any new
  query-string construction) and PERF-03 (line 65, Phase 18's Pi measurement that D-10's
  timing log instruments)
- `.planning/ROADMAP.md` § "Phase 18" — MERGE-03 is the consumer that makes D-02's
  full-payload choice load-bearing
- `.planning/ROADMAP.md` § "Phase 19" — the `getDom()` rewrite that supersedes this phase's
  additive row placement

### Product research — read before writing any parser
- `.planning/research/STACK.md` §"6. NWS/WPC HeatRisk" (lines 102–132) — **the authority for
  this product.** Live-verified `identify` request and response shape, the mandatory Web
  Mercator reprojection (HEAT-03), the omit-`time`-and-read-the-whole-catalog strategy,
  the `0`–`4` domain confirmed against `minValues`/`maxValues`, the `"NoData"` string sentinel,
  the duplicate-`idp_validtime` trap and its dedupe rule (HEAT-04), the hourly cadence behind
  D-07, and the note that `fetchGeoJsonCached` is reusable for caching mechanics only
- `.planning/research/STACK.md` line 27 — the exact endpoint and query parameters, HTTP 200
  live-verified
- `.planning/research/PITFALLS.md` Pitfall 7 (lines 132–162) — the arbitrary `catalogItems`
  ordering (`5,7,1,4,6,2,3` live), why the top-level `value` is not "today", and the ~2540 m
  pixel boundary-jitter class that is **explicitly not to be fixed turf-side**
- `.planning/research/PITFALLS.md` Pitfall 12 (lines 247–255) and lines 285, 316 — the
  parallelization argument behind PERF-01, including the explicit scoping of the existing SPC
  chain as out of bounds
- `.planning/research/PITFALLS.md` line 199 — the branch-parity concern for partial failure
  across six sources, which D-08 answers
- `.planning/research/PITFALLS.md` line 304 — the review checklist item for the
  `catalogItems` sort
- `.planning/research/FEATURES.md` §A6 (lines 119–141) — the 5-level ladder's health-impact
  framing behind D-01, and the ImageServer-vs-feature-service architecture finding
- `.planning/research/FEATURES.md` line 187 — the MERGE-03 coverage argument (HeatRisk Days
  1–7 strictly supersedes WPC's binary Hazardous Heat), which D-02 preserves the input for
- `.planning/research/SUMMARY.md` line 51 (product 6 row) and Decision Queue #7 (line 61) —
  the consolidated HeatRisk trap list and the parallelization decision this phase resolves

### Locked prior decisions (do not re-litigate)
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-CONTEXT.md` — CFG-01 (new
  product flags default false), D-02 (own sibling payload block; do not pre-adopt Phase 18's
  schema), D-04 (global `anyStale` only), D-05 (toggle off still emits a full zero-valued
  block — the shape D-02 here depends on), D-06 (nested `products` object on the wire, flat
  booleans in user config), D-07 (registry row owns its own label→value map — this **is**
  DATA-03), D-09 (`buildArcGisQuery`, `f=geojson` non-overridable)
- `.planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-CONTEXT.md`
  — D-01 (`kind` per registry row, slot left open for non-day-layer products), D-02 (registry
  rows are pure static config: no `this`, no network, no `require`), D-04 (fetch failure sets
  stale; a clean zero-result does not — D-04 here refines it), D-08 (cite the palette source),
  D-09 AMENDED (absence is silence; and the WSSI tier floor that D-01 here mirrors), **D-10
  (every probe scenario must be mutation-proven — blocking)**
- `.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-CONTEXT.md` — D-01 (carry
  raw time data into the payload for Phase 18), D-03 (source-native UTC calendar-date
  bucketing), D-10 (`showDrought` as a flat boolean sub-toggle — the shape `showMinorHeat`
  departs from, per D-02 here), D-13/D-14 (`maxDataAgeHours` on the registry row — the
  precedent D-07 follows), **D-15 (the `anyStale`-without-`_staleAsOf` asymmetry, carried
  forward verbatim)**, D-16 (a data-stale product still renders its content)

### Defect history that shapes this phase
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW-FIX.md` — CR-01
  (staleness must disable the confident all-clear), CR-03 (`_inFlight`, whose scope the
  parallelization analysis above turns on), and the mutation-proof standard
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW.md` — WR-06 (a fix
  applied to one product and not its twin — the argument against per-call-site `.catch()` in
  D-08), IN-01 (uncited palette)
- `.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-REVIEW.md` — WR-02
  (canonicalize once, in the row's own `toValue`), WR-03 (derive spans, never restate them),
  WR-06 (bound an unbounded log ledger — the discretion item on D-04/D-05/D-06's log keys)
- `.planning/STATE.md` § Blockers/Concerns — the `_unusableFeatureCount` / `_oldestStaleAt`
  warning that PERF-01 was expected to trip, and the analysis above that resolves it; also
  the Phase 15 D-10 mutation-proof rule and the live-verification procedure for
  location-gated products

### Code
- `productRegistry.js` — `daySpanOf` (:57), `dayRangeOf` (:~200), `dayRangeSpanning` (:~220),
  the three existing load-time validators D-11 adds a fourth beside; `PRODUCT_REGISTRY`
  (:~250) and its closing comment, which already reserves the slot: *"Future row (HeatRisk)
  lands in Phase 17 (D-08) — not added here."*; `buildArcGisQuery` (:24), whose host allowlist
  and `f=geojson` hardcoding do **not** apply to the ImageServer `identify` URL and must not be
  bent to cover it
- `node_helper.js` — `getSpcOutlook` (:2336) and its new-product section (:2908–2965, **the
  parallelization site**); `_runArcGisDayProduct` (:280) and `_runArcGisHazardWindowProduct`
  (:526) as the `{ payload, anyStale }` contract every batch member must return;
  `_runKmlAdvisoryRow` (:978) and the for-loop D-09 converts to a map; `fetchGeoJsonCached`
  (reused for ETag/hash only); `_isWithinStaleWindow` (:1818); `_oldestStaleAt` (:226, :1855);
  `_unusableFeatureCount` (:224, :1501, :1557, sampled :2348/:2967); `_inFlight` (:196, :1180);
  `_nowMs()` (:1879) and `_utcMidnight()` (:1893) — the clock seams every new time computation
  must route through so probes can pin them; `SUB_TOGGLES` (:32) and `_productToggles` (:244),
  which `showMinorHeat` deliberately does **not** join
- `MMM-SPCOutlook.js` — `defaults:` (:2–17, gains `showHeatRisk` default false and
  `showMinorHeat` default false); `buildRequestPayload` (:~46, gains `showHeatRisk` in the
  `products` object and **not** `showMinorHeat`); the `getDom` no-risk short-circuit (:355,
  **must gain D-03's shared-predicate term**); the stale-badge block (:412–415)
- `scripts/probe-payload-resilience.js` + `scripts/probe-lib/module-stubs.js` — the 32+
  scenario suite this phase extends, and the `_fetch(url, options)` transport seam D-10's
  overlap scenario drives
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/ARCHITECTURE.md` — house style

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`turf.toMercator()`** — already available via the installed `@turf/turf` v7.2.0, verified
  locally. HEAT-03 needs no new dependency and no new math.
- **`fetchGeoJsonCached`** works for HeatRisk's ETag/hash caching mechanics unchanged — `etag`
  is confirmed present on the identify response, and the function calls generic
  `JSON.parse(rawText)` without validating FeatureCollection shape. Its 15s abort timeout and
  `redirect: "error"` apply. Only the *caching* is reused; nothing downstream of it is.
- **The `{ payload, anyStale }` return contract** shared by `_runArcGisDayProduct` and
  `_runArcGisHazardWindowProduct` is the uniform shape D-08's settlement loop can fold over —
  the HeatRisk runner should return it too, and so should the `kml-advisory` map (which
  currently returns `{ entries, anyStale }`; the batch needs one normalization point).
- **`_runArcGisDayProduct`'s discipline transfers even though its code does not**: per-unit
  try/catch so one failure degrades rather than losing the payload, "a contained throw is a
  degrade not a clean read" staleness semantics, and convert-once-after-the-branch. Its
  per-day URL loop does not transfer at all — HeatRisk is one request for the whole week.
- **The three load-time validators in `productRegistry.js`** (`daySpanOf`, `dayRangeOf`,
  `dayRangeSpanning`) are the direct pattern D-11's identity assertion follows, including the
  convention of throwing with the offending value serialized into the message.
- **`_nowMs()` / `_utcMidnight()`** already exist as clock seams specifically so probes can pin
  time (16-REVIEW WR-05). D-05's day-offset computation and D-07's age check must both route
  through them, not `Date.now()`.

### Established Patterns
- **Absence is silence** — no row, not a blank row and not a "None" row (ERO-03, 15 D-09).
  D-04 and D-05 both refine *when* silence is honest versus when it hides a failure.
- **Registry rows are pure static configuration** — no `this`, no network, no `require`
  (15 D-02). Anything needing the transport seam or request-scoped state lives in
  `node_helper.js`; this is why `hazardsOutlook` deliberately carries no `includesFeat`.
- **Remote strings reaching `innerHTML` go through `escapeHtml`.** HeatRisk's values are
  numeric and its tier text is module-authored, so this is less exposed than 16's verbatim
  labels — but the raw `"NoData"` sentinel must never reach the DOM as a label.
- **Every fetch carries `redirect: "error"` and a 15s abort timeout.**
- **One-shot log guards** — the codebase uses flags like `_loggedIntervalFallback` and bounded
  ledgers (16-REVIEW WR-06) rather than logging per poll. D-04/D-05/D-06's "log once" all
  inherit this.
- No automated test framework; verification is mutation-proven probe scenarios plus manual UAT
  (`workflow.nyquist_validation` disabled).

### Integration Points
- **`getSpcOutlook`'s new-product section (`:2908–2965`) is the parallelization site.** Three
  named awaits plus a for-loop become one `Promise.allSettled` batch of six. `advisories[row.id]`
  is currently assigned inside the loop and must move to after settlement.
- **`getDom`'s no-risk short-circuit (`:355`)** — third phase running that a new product must
  join it. D-03 makes the term and the render loop one expression rather than two that must be
  kept in sync.
- **`_staleAsOf` / `_oldestStaleAt` asymmetry** — D-07 inherits 16 D-15's rule that a data-age
  trip raises `anyStale` without contributing to `_staleAsOf`. Comment it at the write site;
  an uncommented exclusion reads as a bug.
- **`SUB_TOGGLES` / `_productToggles`** — `showHeatRisk` is a normal product flag with a
  registry `configFlag`. `showMinorHeat` deliberately joins neither: per D-02 it never leaves
  the frontend, unlike `showDrought`, which had to reach the backend because it gates labels
  inside an already-fetched product.
- **Payload key range** — HeatRisk emits `day1`–`day7`, entirely inside the range the module
  already handles; unlike 16's `day9`–`day14`, no frontend loop bound needs widening.
- **`buildArcGisQuery`'s host allowlist** covers `mapservices.weather.noaa.gov`, and the
  HeatRisk endpoint is on that host — but under the `/experimental/` path with a different
  service type and a completely different query shape (`geometry` / `geometryType` /
  `returnGeometry` / `f=json`, **not** `f=geojson`). It must get its own builder, not a bent
  `buildArcGisQuery`; PERF-02's byte-stable-query-string requirement applies to the new builder
  in its own right.

</code_context>

<deferred>
## Deferred Ideas

- **Flattening concurrency inside the runners** (parallelizing each product's own per-day /
  per-layer loop, ~20 concurrent sockets) — raised as a candidate gray area and not selected.
  Product-level fan-out at ≤6 chains is the default per D-09; revisit only if Phase 18's
  PERF-03 Pi measurement shows the batch is still the bottleneck.
- **Parallelizing the existing ~25-hop SPC/fire-weather await chain** — the single largest
  latency win available, and explicitly out of scope for PERF-01 per both the roadmap and
  PITFALLS.md ("risky to touch… the new products can be added as a separate parallel batch
  without touching proven code"). A candidate for v2.x once the new batch is proven.
- **A concurrency cap on the batch** (a semaphore rather than relying on member count) —
  surfaced under D-09 and not pursued; six members is its own bound today, but a seventh
  product (National Flood Outlook) would make this worth revisiting.
- **Whether HeatRisk's ~2540 m pixel boundary jitter warrants any smoothing or hysteresis** —
  research is explicit that this is expected raster behavior, distinct from the polygon-epsilon
  issue v1.2 fixed, and that no turf-side fix should be attempted. If a live deployment near a
  category boundary produces visible flicker, the v1.2 `PROX_MIN_WEIGHT` noise-floor precedent
  is the model to reach for — not a geometry fix.
- **HeatRisk row wording during a sustained heat wave**, when all seven days clear the floor
  and the module gains seven rows at once — noted and not pursued, since Phase 19's unified
  day report reworks row density wholesale.
- **A startup control-query against a known-hot reference point** to distinguish
  out-of-coverage from a broken identify call under D-04 — considered and rejected as
  over-engineering for a fixed-location mirror module.
- Still deferred from prior phases and unchanged: per-product staleness UX (14 D-04, 15 D-04,
  16 D-15), the National Flood Outlook phase (16), `Severe Weather` suppression (16 D-12,
  Phase 18's charter).

</deferred>

---

*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Context gathered: 2026-08-30*
