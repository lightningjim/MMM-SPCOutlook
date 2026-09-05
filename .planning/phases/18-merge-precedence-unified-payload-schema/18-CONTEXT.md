# Phase 18: Merge, Precedence & Unified Payload Schema - Context

**Gathered:** 2026-09-05
**Status:** Ready for planning

<domain>
## Phase Boundary

Every hazard is attributed to the day its valid-time window actually covers; duplicate or superseded hazards across sources collapse correctly; and the backend emits one precomputed payload the display can consume without recomputing precedence — backed by a real cold-cache latency measurement.

Requirements: MERGE-01, MERGE-02, MERGE-03, MERGE-04, RPT-07, PERF-03.

This phase is backend-only. It does **not** rewrite `getDom()` — that is Phase 19 (RPT-01..06). The scope anchor is: produce and validate the payload Phase 19 will render.

</domain>

<decisions>
## Implementation Decisions

### Payload schema & migration

- **D-01: Additive migration.** Phase 18 ADDS `days`/`summary`/`sources` to the emitted payload and leaves the eight legacy blocks (`day1`–`day8`, `fireWeather`, `excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`, `advisories`) byte-for-byte as they are today. Rationale: the display keeps working during the gap before Phase 19's rewrite; PERF-03's cold-cache Pi run happens against a functioning module; Phase 19's RPT-06 parity checklist retains a live old-vs-new reference to check against. Accepted cost: two representations of the same data coexist for one phase and can drift.
  - **Planning constraint (not a decision):** drift is bounded only if the unified block is assembled from the same in-memory values the legacy blocks are built from, never re-derived in a second pass over the raw sources. A plan that builds `days` independently satisfies the letter of D-01 and defeats its purpose.
  - Rejected: legacy blocks derived from the unified structure via adapters (inverts the risk — a merge bug becomes a display regression); replace the legacy blocks outright (leaves the module unrenderable for a phase, and PERF-03 unmeasurable).

- **D-02: `days` is keyed `"1"`…`"14"`, all fourteen keys always present**, each carrying a resolved UTC `date`. Extends 14 D-05's shape invariant (a toggle being off never changes payload shape) so Phase 19's renderer is one loop with no key-existence branching. Dates follow 16 D-01 so weekday labels are derived from the resolved date, never from `dowToText(dow + N)` — the arithmetic Pitfall 9 flags.
  - Rejected: a sparse map holding only days with data (forces key-existence checks into the renderer); an ordered array (index-vs-day-number confusion at every call site).

- **D-03: one annotated `hazards` list per day.** Each day is `{ date, windowStart, windowEnd, hazards: [{ dimension, source, label, value, color, suppressedBy }] }`. Compact renders the entries where `suppressedBy === null`; detail renders all of them with source labels. Reading a resolved field is not recomputing precedence, so RPT-07 holds. Suppressed entries survive in the payload so MERGE-02 and MERGE-04 are inspectable against a captured live payload — which is how success criteria 2 and 4 are worded.
  - Rejected: two separate lists (`visible` / `suppressed`) — doubles the shape and loses the pairing between a suppressed entry and what suppressed it; `summary` as a pre-rendered string — per-hazard color would force the backend to emit markup, and Phase 14 review finding IN-03 already flagged unescaped `innerHTML` on this path.

- **D-04: root carries both `summary` and `sources`.** `summary` is the whole-window rollup that makes RPT-05 decidable in one read, retiring Pitfall 9's ~15-input combinatorial no-risk gate here rather than in Phase 19. `sources` is per-product health: toggle state, fetch outcome, staleness, and `idp_filedate` (16 D-13). Per-product staleness **UX** remains out of scope per PROJECT.md; this emits the data only.

### Hazard-dimension taxonomy

- **D-05: coarse dimension set plus a nested `detail`.** Roughly eight flat dimensions (`convective`, `flash-flood`, `winter`, `heat`, `cold`, `wind`, `fire`, `heavy-precip`), so precedence comparison is plain string equality. SPC's tornado/hail/wind probabilistic breakdown rides as an optional `detail` sub-object on the single `convective` entry rather than becoming three dimensions.
  - Rejected: fine-grained flat dimensions (needs a second family map to answer "do these compete?"); a two-level `{family, subtype}` key (every precedence comparison becomes a two-field match).

- **D-06: a standalone `hazardTaxonomy.js`**, keyed by `(source, label)`, covering every product **including SPC**, and holding the precedence table beside the map. This is Pitfall 10's required explicit up-front artifact. Dimension is a merge concern; a `PRODUCT_REGISTRY` row is a fetch-and-color concern (15 D-02 fixed rows as pure static config), and 14 D-08 deliberately scoped the registry to new products only.
  - Rejected: dimension fields on registry rows plus an SPC side table (two mechanisms for one concept); extending the registry to cover SPC (reopens 14 D-08 and drags fetch config into a merge artifact).

- **D-07: unmapped labels pass through.** A label with no taxonomy entry gets `dimension: null`, always renders, never suppresses and is never suppressed, counts toward `summary.anyHazard`, logs once per label (16 D-11's pattern), and is recorded in `sources[product].unmappedLabels[]`. That last part is what makes it diagnosable from a captured payload, which 15 D-10's standard requires. Accepted cost: an unmapped heat-ish label can display alongside HeatRisk until the taxonomy is extended.
  - Rejected: log-only (invisible in a captured payload); drop unmapped labels from the unified block (silently loses a real hazard — exactly MERGE-04's failure mode).

- **D-08: one source id per product** — `spc-convective`, `spc-fire`, `wpc-ero`, `wpc-wssi`, `wpc-hazards`, `heatrisk`, plus `spc-md` and `wpc-mpd` for advisories. One vocabulary shared by the taxonomy map, the precedence table, and `sources`. Day-range differences fall out for free: HeatRisk stops at day 7, so `wpc-hazards` wins `heat` on days 8–14 by being the only source present, with no special-casing. Accepted cost: `spc-md` and `wpc-mpd` live outside `PRODUCT_REGISTRY`; `hazardTaxonomy.js` owns the canonical id list.
  - Rejected: one id per agency (`flash-flood: ["wpc", "wpc"]` is unexpressible); registry ids with both SPC products lumped together (one health state for two independent fetches).

### Day-window normalization

- **D-09: SPC's 12Z–12Z is the canonical grid.** Both candidate grids give a clean 1:1 mapping; the only real difference is where the unavoidable 12-hour phase error lands. Put it on the Day 3–14 Hazards Outlook, where it sits inside that product's own broad-brush precision, rather than on SPC convective, where it could display an overnight severe threat under the wrong day for the entire 00Z–12Z window. SPC convective is the module's primary and most time-precise product.
  - Accepted cost: this **reverses 16 D-03**, which bucketed the Hazards Outlook on its native UTC calendar date. Shipped, live-validated `day3`–`day14` bucketing gets re-derived. `date` and the weekday label now mean "the date the window starts" — a day labelled Thursday is 12Z Thu → 12Z Fri.
  - Rejected: UTC 00Z–00Z calendar grid (extends 16 D-03 but misplaces convective); no normalization (each source on its own grid — MERGE-01 exists precisely to stop this).

- **D-10: 00Z products forward-align on the diurnal peak.** A 00Z–00Z source day for calendar date D maps to the grid day that **starts** at 12Z on D. Applies to `wpc-hazards` and `heatrisk`.
  - Derivation: because the offset is exactly half a day, a 00Z–00Z day overlaps two 12Z–12Z grid days by exactly 12 hours each, so majority-overlap and midpoint rules **tie by construction** — no rule avoids picking a direction. The tiebreak is meteorological: the 18Z–06Z diurnal peak sits wholly inside the forward-aligned grid day.
  - Rejected: duplicate onto both overlapping grid days (16 D-04's multi-day precedent, but here it overstates duration, inflates `summary.activeDays`, and doubles every entry); backward-align (splits the diurnal peak across the boundary onto the next displayed day).

- **D-11: day 1 is the outlook period currently in progress; the grid rolls at 12Z.** This includes the shortened 01Z–12Z partial-issuance form, with the real valid window carried on the entry. The partial issuance is a **shared 12Z-product convention, not an ERO quirk** — SPC's own 01Z Day 1 update has the same shape, which is why success criterion 1's "ERO Day 1's partial 01Z–12Z conventions" phrasing understates the scope. Consequence: every 12Z product's native day index equals the grid index at every hour, so SPC, ERO and WSSI map straight through with no off-by-one anywhere.
  - Accepted cost: grid day 1 is shorter than 24 hours for part of each day.
  - Rejected: day 1 = the next full 12Z–12Z period (the in-progress period has no slot at all during 00Z–12Z, plus an off-by-one on every 12Z product); a separate day `"0"` (breaks D-02's fourteen-key invariant).

- **D-12: the grid is anchored to SPC's own valid times, with a marked clock fallback.** Read the anchor from the SPC convective outlook's VALID/EXPIRE properties. On fetch failure, fall back to a clock rule and set `sources['spc-convective'].gridAnchor` to `'estimated'`; otherwise `'observed'`. Each day entry carries `windowStart`/`windowEnd` so nothing downstream re-derives a boundary (RPT-07).
  - **Planning prerequisite:** confirm the fetched SPC layer actually exposes VALID/EXPIRE or an equivalent. If it does not, this decision needs revisiting before the plan is written.
  - Rejected: wall clock only (silently wrong during a delayed or off-cycle issuance); each source anchors itself (that is the absence of a canonical grid).

### Suppression & compact summary

- **D-13: only an active hazard suppresses.** A higher-ranked source suppresses a lower-ranked one on the same dimension only when its own value is above that source's no-risk floor (HeatRisk ≥ 1; SPC above General Thunderstorms). Both `null` (no reading) and an explicit no-risk value leave the lower-ranked entry visible with `suppressedBy: null`. Rationale: precedence resolves competing *claims*; it must never let a quiet source erase another source's warning.
  - Accepted cost: WPC's anomaly-based temperature labels and coarse severe labels render more often. Much-Above-Normal temperatures in January is not a heat hazard, but it will display when HeatRisk reports 0.
  - **Honest note on 17 D-02:** under this choice `null` and `0` behave *identically* for suppression, so the null-vs-0 split is no longer what makes MERGE-03 decidable, as 17 D-02 framed it. The raw category is still required — it is what the no-risk-floor test reads — but for the floor test, not for the null/0 distinction. 17 D-02 stands; its stated rationale does not.
  - Rejected: any non-null reading suppresses (this was Claude's recommendation; the user overrode it); source presence alone suppresses (the exact failure 17 D-02 preserved the raw category to prevent).

- **D-14: precedence resolves per-day, independently.** Each grid day resolves its own dimensions from only the sources that reported for that day. A source winning a dimension on one day has no effect on any other day. Root `summary` is a **rollup of the already-resolved per-day results**, not a second precedence pass.
  - Rationale: source day coverage differs — SPC convective days 1–8, `wpc-hazards` days 3–14, HeatRisk days 1–7. Whole-window resolution would let a source suppress entries on days it never covered, so days 9–14 would lose `convective` entirely because SPC won days 1–8. Rollup-not-second-pass keeps `summary` and the day list from ever disagreeing about what is present.
  - **Fact correction captured during discussion:** SPC's convective outlook covers days **1–8**, not 1–3. Days 1–3 are categorical plus probabilistic; days 4–8 are probabilistic-only (the 15%/30% areas, or no area when predictability is too low). The payload already reflects this — `day1`–`day3` carry `risk`/`text`/`color`, `day4`–`day8` carry `probRisk`/`sign`. The coverage boundary that matters for `convective` precedence is day 8.
  - Rejected: whole-window single resolution; per-day resolution plus a separate window-level precedence pass for `summary`.

- **D-15: compact gets a fully ordered survivor list — no cap, no primary flag.** For each day the backend emits every surviving entry (`suppressedBy === null`) in the taxonomy's fixed category order. Ordering is a merge concern the taxonomy already owns; row budget is a layout concern Phase 19 has not defined yet. Truncation is a layout decision, not a precedence decision, so leaving it downstream does not violate RPT-07.
  - Rejected: an ordered list plus a `primary: true` flag (would require a cross-dimension severity ranking — is Enhanced convective worse than a Slight ERO? — that the precedence table does not contain and research never derived); a pre-capped `compact[]` array (bakes N into the payload before any layout exists).

- **D-16: `summary` carries a verdict and an inventory; `sources` words the empty state.** Shape: `{ anyHazard, dimensions: [], activeDays: [], windowStart, windowEnd, enabledSourceCount, reportingSourceCount }`. No hazard values are duplicated out of `days`. Phase 19 reads `anyHazard` for the RPT-05 empty state and consults `sources[]` to distinguish all-quiet from all-failed from all-disabled — three causes that need different copy.
  - Rejected: a full per-dimension window rollup carrying peak value / winning source / day list (reproduces D-01's drift exposure inside a single payload); a resolved `emptyReason` enum (fixes the empty-state taxonomy before Phase 19 knows what copy it needs).

### PERF-03 measurement protocol

- **D-17: the cold-cache run reports two figures.** (a) The backend interval — `GET_SPC_DATA` received → `SPC_DATA_RESULT` emitted, with a per-product breakdown naming the slowest fetch. (b) Wall clock — process start → first populated render. The backend interval is what this phase owns and what PERF-01's concurrent fan-out bounds, so a regression is attributable; the end-to-end figure is what the requirement's user-facing wording means, and because D-01 keeps the legacy render working it is measurable now and doubles as a Phase 19 before/after baseline.
  - **Fact established during discussion:** cold cache requires no setup beyond a fresh process. `node_helper.js:186` holds the only cache — an in-memory `Map` keyed by URL. There is no disk cache and no cache directory to clear.
  - Rejected: backend interval only (cannot answer "how long before the mirror shows outlooks"); end-to-end only (slow fetch, slow boot and slow render collapse into one unattributable number).

- **D-18: the timing instrumentation is permanent, logged once per cold start.** Timing is always collected and the summary group is logged once per process start — roughly four lines, never repeated. No config flag. PERF-03 is a milestone gate, and a figure reproducible only by re-adding scaffolding is a gate that cannot be re-checked in Phase 19 or v2.1. `Date.now` around the fan-out costs nothing on the Pi. Accepted cost: four lines of log noise per boot.
  - Rejected: a `perfLog` config flag defaulting false (adds a 16th independently-toggleable boolean input, and Pitfall 9 already counts ~15); a temporary scaffold reverted after measurement (makes PERF-03 a one-time observation with no regression detection).

- **D-19: Phase 18 ships the instrument; the Pi figure is a UAT item.** The phase completes when the instrumentation is built and verified against a local cold start. The measured Pi figure is a UAT/verification item tracked by the **existing** STATE.md milestone blocker, satisfied before the milestone closes rather than before the phase does. ROADMAP criterion 6 says "recorded before the milestone closes", which this satisfies. Blocking phase exit would halt chained execution on a step no agent can perform and make Phase 19 wait on a measurement rather than on code.
  - Rejected: the phase blocks until the Pi run is recorded; an explicit observation-only decision (see Deferred — no pass/fail target exists either way).

### Claude's Discretion

- The exact final dimension list within D-05's coarse shape — whether `cold` is separate from `winter`, and whether `heavy-precip` exists alongside `flash-flood`. D-05 fixes the granularity and the mechanism; the roster is a planning-time deliverable derivable from the live label inventory.
- Whether advisory sources (`spc-md`, `wpc-mpd`) carry dimensions at all, or sit outside the taxonomy as an untyped band. 15 D-03/D-05 already place them in a separate advisories array outside the day blocks.
- How HeatRisk's numeric 0–4 scale keys into a `(source, label)` map — a numeric-keyed sub-map or a synthesised label, whichever reads better in `hazardTaxonomy.js`.
- Internal function decomposition and file placement, subject to D-01's shared-in-memory-values constraint and D-06's standalone-module requirement.

</decisions>

<specifics>
## Specific Ideas

- The user reversed the canonical-grid decision (D-09) after asking to redo the question, on the ground that the argument first presented was the wrong one. The decisive argument, and the one to preserve in any downstream restatement, is *where the unavoidable 12-hour phase error lands* — not consistency with 16 D-03.
- The user corrected an in-discussion factual error about SPC coverage: the convective outlook runs days 1–8, with days 4–8 as the probabilistic-only form. Any planning artifact that treats SPC as a days-1–3 product is wrong.
- Suppression should feel like resolving competing claims, never like one source silencing another (D-13). Worth carrying into how `suppressedBy` is named and logged.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 18" (line 247) — goal, the six success criteria, and the Phase 19 boundary immediately following it
- `.planning/REQUIREMENTS.md` — MERGE-01..04 (lines 44–47), RPT-05/RPT-07 (lines 55, 57), PERF-01..03 (lines 63–65); also the Out of Scope list, which excludes proximity weighting for new products (deferred to MERGEX-01) and any automated test framework
- `.planning/PROJECT.md` — v2.0 milestone framing: the unified day report is the sole render path with no legacy fallback, the precedence table is derived from research rather than assumed, and per-product staleness UX is out of scope

### Prior phase decisions this phase extends or reverses
- `.planning/phases/14-*/14-CONTEXT.md` — D-02 (ERO deliberately kept as a sibling block, *not* pre-adopting this phase's shape), D-03 (raw `valid_time` carried per day expressly so MERGE-01 inherits real captured window data), D-05 (toggle-off never changes payload shape — the invariant D-02 here extends), D-07 (registry row owns its own label→value map, DATA-03), D-08 (registry scoped to new products only)
- `.planning/phases/15-*/15-CONTEXT.md` — D-02 (registry rows are pure static config), D-03/D-05 (advisories live inside the outlook payload, in one band), D-04 (fetch failure sets stale; a clean zero-result does not), **D-10 (every probe scenario must be individually mutation-proven — blocking)**
- `.planning/phases/16-*/16-CONTEXT.md` — D-01 (offset keys carrying resolved UTC dates; weekday labels from the date), D-02 (a day carries every hazard as an array in registry-declared order), **D-03 (bucket on the source-native UTC calendar date — reversed by D-09 here)**, D-04 (multi-day span handling), D-11 (unmapped label renders verbatim and logs once), **D-12 (`Severe Weather` renders verbatim in 16; this phase is chartered to build the taxonomy and validate suppression against live payloads)**, D-13 (`maxDataAgeHours = 84` on `idp_filedate`), D-15 (data-age trip sets `anyStale` but is excluded from `_staleAsOf`)
- `.planning/phases/17-*/17-CONTEXT.md` — **D-02 (backend always emits the full `day1`–`day7` HeatRisk block with raw `0`–`4`; `showMinorHeat` is frontend-only). See D-13 above for how this phase revises its stated rationale while keeping the decision.**

### Research this phase must not re-derive
- `.planning/research/PITFALLS.md` — Pitfall 4 (day-window conventions, live-confirmed), **Pitfall 9 (display-rewrite regressions; the `getDom()` no-risk gate has ~15+ independently-toggleable boolean inputs)**, **Pitfall 10 (cross-source dedup by label text both over- and under-merges; the taxonomy must be an explicit up-front artifact built in this phase)**
- `.planning/research/FEATURES.md` — Part B2 (the proposed precedence table by hazard type), Part B3 (five decision points, including suppressing WPC `Severe Weather` and `Hazardous Heat`, the ERO Day 4–5 scope gap, and the structural Days 1–2 cold/non-convective-wind gap), Part C (fixed category order, per-day and whole-window suppression, MD/MPD placement, both detail levels sharing one data model)
- `.planning/research/SUMMARY.md` line 25 — the originating shape recommendation: uniform `days["1"]`…`days["14"]`, backend-precomputed summary, precedence-annotated `sources[]`, short-fuse items in a separate advisories array

### Code contract
- `node_helper.js:2900–2926` — the JSDoc documenting the current payload contract, including the note that HeatRisk `null` and `0` are deliberately distinct
- `node_helper.js:3685–3800` — the actual return payload D-01 must preserve byte-for-byte
- `node_helper.js:186` — the sole cache: an in-memory `Map` keyed by URL, which is what makes "cold cache" mean exactly "fresh process" (D-17)
- `productRegistry.js` — `PRODUCT_REGISTRY` rows, whose scope D-06 and D-08 deliberately do not widen

### Note on staleness
`.planning/codebase/ARCHITECTURE.md` is dated 2026-03-04, predates v2.0, and is **partially stale**. Prefer the phase CONTEXT files and the source itself.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **Runner contract from Phases 14–17**: `_runArcGisDayProduct` (`node_helper.js:280`), `_runArcGisHazardWindowProduct` (`:526`), and `_runKmlAdvisoryRow` (`:978`) all return `{ payload, anyStale }`. The merge stage consumes these uniformly; the in-memory values they produce are the ones D-01 requires both representations to share.
- **`checkInPolygon()`** (`node_helper.js:3805+`) — returns the winning feature, already hardened per WR-04/CR-02. Unchanged by this phase.
- **`scripts/probe-payload-resilience.js`** — 32+ scenarios and the only executable verification surface in the project. New merge scenarios go here, under 15 D-10's mutation-proof standard.

### Established Patterns
- **No automated test framework** (explicitly out of scope). Verification is manual UAT, static analysis, and the probe script. `workflow.nyquist_validation` is disabled in `.planning/config.json`.
- **15 D-10 is blocking**: every probe scenario must be individually mutation-proven — break the exact line it covers, confirm RED with a diagnosable message, restore. Cheap preventatives that have paid off before: a precondition guard that throws if setup did not produce the state under test, and a control assertion proving the gate is not simply never firing.
- **Raspberry Pi target**: keep CPU low and never block the event loop. Relevant to how the merge pass is structured, and the reason D-18's instrumentation cost was checked rather than assumed.
- **Registry rows are static config** (15 D-02); behavior lives in the runners. `hazardTaxonomy.js` follows the same shape — data tables, no logic.

### Integration Points
- The return statement at `node_helper.js:3685–3800` gains `days`, `summary` and `sources` alongside the existing keys; the existing keys do not move.
- The catch path returns `{ error: err.toString() }` and is unchanged — a total failure still produces no unified block.
- `excessiveRain.dayNValidTime` (14 D-03) has **no consumer today**. MERGE-01 is its first, so the field is unexercised end-to-end until this phase — flagged on STATE.md and worth an early sanity check rather than a late surprise.
- `hazardTaxonomy.js` is new and imported by `node_helper.js` only.

</code_context>

<deferred>
## Deferred Ideas

- **No pass/fail latency target exists for PERF-03.** Research derived none for this hardware. The recorded figure is a baseline. Whether a slow number blocks the milestone or is merely noted is a milestone-close decision, not a Phase 18 one.
- **Where the Pi figure is written** when it is taken (phase artifacts, STATE.md, or a UAT record) — a planning-time detail under D-19.
- **Whether `wpc-hazards`'s `Severe Weather` rendering on days 9–14 is the desired UX.** D-14 makes it render, since SPC never reaches those days. FEATURES.md Part B3 proposed suppressing that label outright. Revisit if the live payload makes it noisy.
- **How 16 D-04's multi-day span features re-map onto the 12Z grid** now that D-09 has moved the grid. 16 D-04 routes full-nominal-window features to the window band; the band itself is unaffected, but the span arithmetic is.
- **Whether the shortened day-1 window (D-11) changes the weekday label** — "Today" versus a weekday name. A Phase 19 display question.
- **The SPC Day 4–8 no-risk floor for D-13** is not a single value. That outlook is probabilistic-only, so its floor is "no probabilistic area / predictability too low" rather than a category above General Thunderstorms. The floor must be expressed per source *and day range*, not one value per source. This is a planning-time detail, but it is load-bearing on D-13 and must not be discovered during execution.
- **Days 9–14 payload shape when only the Hazards Outlook reaches them** — falls out of D-02 and D-14, but worth an explicit check against a live payload.
- **MERGEX-01 (proximity weighting for new products) and MERGEX-02** remain out of scope per REQUIREMENTS.md.

</deferred>

---

*Phase: 18-merge-precedence-unified-payload-schema*
*Context gathered: 2026-09-05*
