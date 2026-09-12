# Phase 18: Merge, Precedence & Unified Payload Schema - Research

**Researched:** 2026-09-05
**Domain:** Cross-source hazard merge/precedence logic and unified backend payload schema for a MagicMirror² weather module (no new libraries — pure internal data-modeling and JS logic over already-fetched NOAA data)
**Confidence:** HIGH — every load-bearing claim below was checked against either the live NOAA endpoints (fetched today, 2026-09-05) or the current on-disk `node_helper.js`/`productRegistry.js`, not against training-data assumptions or the pre-existing FEATURES.md/PITFALLS.md alone.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Payload schema & migration**
- **D-01: Additive migration.** Phase 18 ADDS `days`/`summary`/`sources` to the emitted payload and leaves the eight legacy blocks (`day1`–`day8`, `fireWeather`, `excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`, `advisories`) byte-for-byte as they are today.
  - **Planning constraint (not a decision):** drift is bounded only if the unified block is assembled from the same in-memory values the legacy blocks are built from, never re-derived in a second pass over the raw sources.
- **D-02: `days` is keyed `"1"`…`"14"`, all fourteen keys always present**, each carrying a resolved UTC `date`. Weekday labels are derived from the resolved date, never from `dowToText(dow + N)`.
- **D-03: one annotated `hazards` list per day.** `{ date, windowStart, windowEnd, hazards: [{ dimension, source, label, value, color, suppressedBy }] }`. Compact renders `suppressedBy === null` entries; detail renders all of them.
- **D-04: root carries both `summary` and `sources`.** `summary` is the whole-window rollup; `sources` is per-product health (toggle state, fetch outcome, staleness, `idp_filedate`). Per-product staleness UX is out of scope — data only.

**Hazard-dimension taxonomy**
- **D-05: coarse dimension set plus a nested `detail`.** Roughly eight flat dimensions (`convective`, `flash-flood`, `winter`, `heat`, `cold`, `wind`, `fire`, `heavy-precip`). SPC's tor/hail/wind breakdown rides as an optional `detail` sub-object on the single `convective` entry.
- **D-06: a standalone `hazardTaxonomy.js`**, keyed by `(source, label)`, covering every product including SPC, holding the precedence table beside the map.
- **D-07: unmapped labels pass through.** `dimension: null`, always renders, never suppresses/suppressed, counts toward `summary.anyHazard`, logs once per label, recorded in `sources[product].unmappedLabels[]`.
- **D-08: one source id per product** — `spc-convective`, `spc-fire`, `wpc-ero`, `wpc-wssi`, `wpc-hazards`, `heatrisk`, plus `spc-md` and `wpc-mpd` for advisories.

**Day-window normalization**
- **D-09: SPC's 12Z–12Z is the canonical grid.** Reverses 16 D-03 (Hazards Outlook is no longer bucketed on native UTC calendar date). The 12-hour phase error lands on the Hazards Outlook, not on SPC convective.
- **D-10: 00Z products forward-align on the diurnal peak.** A 00Z–00Z source day for calendar date D maps to the grid day that starts at 12Z on D. Applies to `wpc-hazards` and `heatrisk`.
- **D-11: day 1 is the outlook period currently in progress; the grid rolls at 12Z.** Includes the shortened partial-issuance form (a shared 12Z-product convention, not ERO-only — SPC's own updates show the same shape).
- **D-12: the grid is anchored to SPC's own valid times, with a marked clock fallback.** Read the anchor from the SPC convective outlook's VALID/EXPIRE properties. On fetch failure, fall back to a clock rule and set `sources['spc-convective'].gridAnchor` to `'estimated'`; otherwise `'observed'`.
  - **Planning prerequisite:** confirm the fetched SPC layer actually exposes VALID/EXPIRE or an equivalent. **RESOLVED BELOW — see "D-12 Verification" — it does.**

**Suppression & compact summary**
- **D-13: only an active hazard suppresses.** A higher-ranked source suppresses a lower-ranked one on the same dimension only when its own value is above that source's no-risk floor (HeatRisk ≥ 1; SPC above General Thunderstorms). Both `null` and an explicit no-risk value leave the lower-ranked entry visible with `suppressedBy: null`.
- **D-14: precedence resolves per-day, independently.** Root `summary` is a rollup of already-resolved per-day results, not a second precedence pass. SPC's convective outlook covers days **1–8** (categorical days 1–3, probabilistic-only days 4–8), not 1–3.
- **D-15: compact gets a fully ordered survivor list — no cap, no primary flag.**
- **D-16: `summary` carries a verdict and an inventory; `sources` words the empty state.** `{ anyHazard, dimensions: [], activeDays: [], windowStart, windowEnd, enabledSourceCount, reportingSourceCount }`.

**PERF-03 measurement protocol**
- **D-17: the cold-cache run reports two figures.** (a) Backend interval — `GET_SPC_DATA` received → `SPC_DATA_RESULT` emitted, with a per-product breakdown naming the slowest fetch. (b) Wall clock — process start → first populated render.
- **D-18: the timing instrumentation is permanent, logged once per cold start.** No config flag.
- **D-19: Phase 18 ships the instrument; the Pi figure is a UAT item**, tracked by the existing STATE.md milestone blocker.

### Claude's Discretion
- The exact final dimension list within D-05's coarse shape — whether `cold` is separate from `winter`, and whether `heavy-precip` exists alongside `flash-flood`.
- Whether advisory sources (`spc-md`, `wpc-mpd`) carry dimensions at all, or sit outside the taxonomy as an untyped band.
- How HeatRisk's numeric 0–4 scale keys into a `(source, label)` map.
- Internal function decomposition and file placement.

### Deferred Ideas (OUT OF SCOPE)
- No pass/fail latency target exists for PERF-03; the recorded figure is a baseline.
- Where the Pi figure is written (phase artifacts, STATE.md, or a UAT record).
- Whether `wpc-hazards`'s `Severe Weather` rendering on days 9–14 is desired UX (D-14 makes it render since SPC never reaches those days; revisit if noisy).
- How 16 D-04's multi-day span features re-map onto the 12Z grid.
- Whether the shortened day-1 window changes the weekday label ("Today" vs. a weekday name) — a Phase 19 display question.
- The SPC Day 4–8 no-risk floor for D-13 is not a single value — **RESOLVED BELOW**, see the floor table.
- Days 9–14 payload shape when only the Hazards Outlook reaches them — falls out of D-02/D-14, worth an explicit live-payload check.
- MERGEX-01/02 (proximity weighting for new products, configurable precedence) remain out of scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| MERGE-01 | Hazard placed on the day its valid-time window actually covers, reconciling SPC 12Z–12Z, Hazards Outlook 00Z–00Z, and ERO Day 1's partial 01Z–12Z convention | "D-12 Verification" confirms SPC exposes `VALID`/`EXPIRE`/`VALID_ISO`/`EXPIRE_ISO`; "Live Field Formats" documents the exact string/epoch shapes of every source's window fields and a captured near-boundary case to validate against; "Day-Window Normalization Mechanics" maps the existing `_hazardDayOffset`/`_todayUtcMs` clock-anchored code to the new SPC-anchored grid |
| MERGE-02 | SPC's granular convective risk displays instead of WPC's derived Severe Weather flag, suppressed by a dimension-scoped rule validated against live payloads | "Precedence Table" resolves `convective` to `spc-convective` > `wpc-hazards` "Severe Weather"; "No-Risk Floor Table" gives the exact floor test; "Live Label Inventory" confirms `wpc-hazards` labels are read via `f.properties.label` already, distinct from SPC's `LABEL` |
| MERGE-03 | HeatRisk's 5-level scale displays instead of WPC's binary Hazardous Heat flag | "Precedence Table" resolves `heat` to `heatrisk` > `wpc-hazards` ("Hazardous Heat" days 3–7, "Excessive Heat"/"Much Above Normal Temperatures" days 8–14, sole-source not suppression); floor table gives HeatRisk's `≥1` test, already distinct from `null` per Phase 17 D-02 |
| MERGE-04 | No over-merge, no under-merge | "Live Label Inventory" and "Dimension Roster Rationale" enumerate every `(source, label)` pair and its dimension, explicitly separating `flash-flood` (ERO only) from `heavy-precip` (Hazards Outlook "Heavy Rain"/"Heavy Precipitation" only) — the Pitfall 10 trap FEATURES.md's own B2 proposal would have walked into |
| RPT-07 | Frontend renders both detail levels from a backend-computed payload without recomputing precedence | "D-01 Shared-Value Constraint" traces exactly where in the current flow each legacy block's winning values are computed, so the unified `days[]` assembly can read the same in-memory values rather than re-deriving |
| PERF-03 | Measured cold-cache latency on target Pi | "PERF-03 Instrumentation Mechanics" pinpoints the exact receipt/emit lines and the existing `memberTimings` PERF-01 already produces |
</phase_requirements>

## Summary

Phase 18 is pure data-modeling and merge logic over data every one of Phases 14–17 already fetches — no new npm packages, no new NOAA endpoints. The single highest-risk item flagged for verification, D-12's premise that SPC's convective outlook exposes machine-readable valid-time properties, is **confirmed true**: a live fetch of `day1otlk_cat.lyr.geojson` today returned `VALID`, `EXPIRE`, `ISSUE` (compact `YYYYMMDDHHmm` strings) and `VALID_ISO`/`EXPIRE_ISO`/`ISSUE_ISO` (ISO-8601). D-12 needs no revisiting; the plan should read `VALID_ISO`/`EXPIRE_ISO` (parseable with a bare `new Date(...)`, no custom string parser needed) rather than the compact numeric form. However, **no code path today extracts these fields** — the existing SPC day1–day3 fetch code only reads `LABEL`/`DN` through `extractPolygons`'s `toValue` callback. Extracting the grid anchor is new code, but it can reuse the existing `_validTimeOfWinner` helper (already built for ERO/WSSI in the registry-driven runner) called against `day1RiskPoly` with field `"VALID_ISO"`/`"EXPIRE_ISO"` — no second fetch, same winning-polygon selection SPC's day1 evaluation already performs.

The precedence table is derivable cleanly from the eight source ids and D-05's eight dimensions, but only if `flash-flood` (WPC ERO's purpose-built flash-flood-guidance-exceedance product) and `heavy-precip` (the Hazards Outlook's generic "Heavy Rain"/"Heavy Precipitation" labels) are kept as two **separate, single-source** dimensions rather than merged into one "excessive rain" dimension with a day-range fallback, as FEATURES.md's pre-D-05 Part B2 proposed. Conflating them is exactly Pitfall 10's warned-against trap — WPC's generic heavy-rain flag is not validated as flash-flood-equivalent to ERO's FFG-exceedance probability. With that split, only three of the eight dimensions actually need a two-source suppression rule at all (`convective`, `heat`, `winter`, plus a partial-overlap case in `fire`); the rest are single-source across their day ranges with accepted structural gaps already documented in REQUIREMENTS.md's Out of Scope table.

The no-risk floor per source and day range (flagged as a Deferred open item) is now fully enumerated from the live registry code: most floors are already baked into `includesFeat`/`percToRisk` at the fetch-evaluate stage (ERO, WSSI, SPC Day 4–8), so the payload's own `"NONE"` value already means "at or below floor" for those sources — only `spc-convective` Days 1–3 (floor is `TSTM`, itself a real value that must NOT count as active) and `heatrisk` (floor is `null`/`0`, already distinct per Phase 17 D-02) need an explicit floor test in the merge code.

**Primary recommendation:** Build `hazardTaxonomy.js` as a static `(source, label) -> { dimension }` map plus a `PRECEDENCE` table (`dimension -> ordered source-id array`) and a `NO_RISK_FLOOR` table (`source -> (dayRange ->) predicate`), all derived from the tables in this document — then add exactly one new extraction (SPC's VALID_ISO/EXPIRE_ISO via `_validTimeOfWinner`) and one new day-offset function family (an SPC-grid-anchored replacement for the clock-anchored `_todayUtcMs()`/`_hazardDayOffset()` pair, reusing the existing function shapes) before writing the merge/assembly pass itself.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fetch/cache/evaluate each of the 8 sources | API/Backend (`node_helper.js`, existing) | — | Unchanged this phase — Phase 18 consumes, not refetches |
| Grid anchor resolution (VALID/EXPIRE read + clock fallback) | API/Backend (`node_helper.js`, new) | — | Must run once per poll, before day-bucketing; needs the SPC day1 winning polygon already computed |
| Hazard-dimension taxonomy + precedence table | API/Backend, static config (`hazardTaxonomy.js`, new) | — | Pure data, no `this`, no network — same pattern as `productRegistry.js` (15 D-02) |
| Day-window normalization (source day -> grid day) | API/Backend (`node_helper.js`, new functions) | — | Per-source offset math; SPC/ERO/WSSI native-align (D-11), `wpc-hazards`/`heatrisk` forward-align (D-10) |
| Suppression/precedence resolution | API/Backend (`node_helper.js`, new) | — | Per-day only (D-14); reads taxonomy + floor table, annotates `suppressedBy` |
| `summary`/`sources` rollup | API/Backend (`node_helper.js`, new) | — | Pure aggregation over already-resolved `days[]`, not a second precedence pass |
| Legacy 8-block payload assembly | API/Backend (`node_helper.js`, existing, `node_helper.js:3685-3800`) | — | Untouched this phase (D-01); the SAME in-memory values feed both representations |
| PERF-03 timing brackets | API/Backend (`node_helper.js`, extend existing `memberTimings`) | — | Backend interval wraps the existing socket handler; wall-clock needs a frontend timestamp too |
| Rendering both blocks | Browser/Client (`MMM-SPCOutlook.js`) | — | Out of scope — Phase 19 |

## D-12 Verification (BLOCKING — RESOLVED)

**Live fetch, 2026-09-05, `https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson`:**

```json
{
  "DN": 2, "VALID": "202609051300", "EXPIRE": "202609061200", "ISSUE": "202609051254",
  "VALID_ISO": "2026-09-05T13:00:00+00:00", "EXPIRE_ISO": "2026-09-06T12:00:00+00:00",
  "ISSUE_ISO": "2026-09-05T12:54:00+00:00",
  "LABEL": "TSTM", "LABEL2": "General Thunderstorms Risk"
}
```
`[VERIFIED: live NOAA endpoint, fetched 2026-09-05T14:28Z]`

Day2/Day3 confirm the same property set:

| Layer | VALID | EXPIRE | ISSUE |
|---|---|---|---|
| day1otlk_cat | 202609051300 (13:00Z — see below) | 202609061200 (12:00Z) | 202609051254 |
| day2otlk_cat | 202609061200 (12:00Z) | 202609071200 (12:00Z) | 202609050512 |
| day3otlk_cat | 202609071200 (12:00Z) | 202609081200 (12:00Z) | 202609050637 |

**D-12's premise holds without qualification.** Every feature on every SPC categorical layer carries `VALID`/`EXPIRE` (compact `YYYYMMDDHHmm`) and `VALID_ISO`/`EXPIRE_ISO` (ISO-8601, directly `new Date()`-parseable — prefer these over the compact form, no custom parser needed). `sources['spc-convective'].gridAnchor` can be set to `'observed'` on every successful fetch; the `'estimated'` clock-fallback path per D-12 is needed only for the genuine SPC-fetch-failure case.

**Important refinement surfaced by this verification (feeds MERGE-01 and D-11):** Day 1's `VALID` was **13:00Z**, not 12:00Z or 01:00Z — neither a clean 12Z-12Z window nor the "01Z–12Z" example CONTEXT.md's D-11 cites. This is because SPC re-issues Day 1 multiple times a day (confirmed: this fetch's `ISSUE` was 12:54Z, i.e. the midday update) and each re-issuance **truncates the window's start to the issuance time itself** when the nominal 12Z-anchored period is already in progress — the exact same truncation mechanic Pitfall 4's captured "01Z 08/16/26 - 12Z 08/16/26" sample showed for ERO. Day2/Day3 (not yet started) show clean, untruncated 12:00Z starts. **Practical consequence: the grid-anchor code must read `VALID_ISO`/`EXPIRE_ISO` verbatim off the winning polygon on every poll — it must never assume the anchor is always exactly `12:00:00Z`.** D-11's characterization ("every 12Z product's native day index equals the grid index at every hour") is correct and load-bearing for why this truncation is harmless to bucketing (it only ever shortens the CURRENT day-in-progress, never shifts which calendar/grid day a feature belongs to) — but the plan should not hardcode `T12:00:00Z` anywhere the anchor is read.

## Live Field Formats (feeds MERGE-01)

All fetched live 2026-09-05, confirming/extending Pitfall 4's 2026-08-15 findings still hold:

| Source | Window field(s) | Format | Live example |
|---|---|---|---|
| `spc-convective` | `VALID`/`EXPIRE` (raw); `VALID_ISO`/`EXPIRE_ISO` (preferred) | `YYYYMMDDHHmm` / ISO-8601 | `202609051300`/`2026-09-05T13:00:00+00:00` |
| `wpc-ero` | `valid_time` (currently the ONLY field node_helper captures, via `validTimeField: "valid_time"`); raw `start_time`/`end_time` also present but unread | `"12Z MM/DD/YY - 12Z MM/DD/YY"` (composite string); `start_time`/`end_time` are `"YYYY-MM-DD HH:MM:SS"` | `valid_time: "12Z 09/05/26 - 12Z 09/06/26"`; `start_time: "2026-09-05 12:00:00"` |
| `wpc-wssi` | `valid_time` (same field name/format as ERO — confirmed identical composite pattern); `start_time`/`end_time` present but in a DIFFERENT raw format from ERO's | `"HHZ MM/DD/YY - HHZ MM/DD/YY"` (matches ERO); raw `start_time` is `"HHZ MM/DD/YY"` (no separate date range) | `valid_time: "14Z 09/05/26 - 12Z 09/06/26"`; `start_time: "14Z 09/05/26"` (note the truncated-start mechanic again — issue_time was `2026-09-05 1415Z`) |
| `wpc-hazards` | `start_date`/`end_date` | epoch milliseconds, exact UTC-midnight-aligned in every observation to date | `start_date: 1788912000000` (2026-09-08T00:00:00Z) |
| `heatrisk` | `idp_validtime` (catalog item attribute) | epoch milliseconds, observed EXACTLY at `12:00:00.000Z` on every sample (14/14 across two research sessions) — **not** 00Z as its "00Z product" framing in D-10 might suggest; see note below | `1787140800000` → `2026-08-15T12:00:00.000Z` |

**Refinement to D-10 for `heatrisk` specifically:** the existing `_heatRiskDayOffset`/`_hazardDayOffset` code already documents (node_helper.js:2420-2427) that HeatRisk's `idp_validtime` sits at exactly 12:00Z, not spanning a 00Z–00Z window like `wpc-hazards`' `start_date`/`end_date` do. This means HeatRisk's raw timestamp is **already a point sample at the same instant SPC's 12Z grid boundary sits**, not a genuine 00Z-aligned interval needing the same "forward-align onto the diurnal peak" reasoning D-10 applies to `wpc-hazards`. D-10's rule ("maps to the grid day that starts at 12Z on D") is still the *correct outcome* for HeatRisk, but it is a near-identity mapping for HeatRisk (the raw timestamp already equals the grid boundary), whereas for `wpc-hazards` it is a genuine reconciliation of a full 24-hour 00Z-00Z window against a 12Z-shifted grid. Worth stating this distinction explicitly in `hazardTaxonomy.js`'s comments so a future maintainer does not "fix" HeatRisk's mapping into matching `wpc-hazards`' by treating both as needing interval-overlap logic — HeatRisk needs only a day-offset from a fixed 12Z point, `wpc-hazards` needs true interval-to-interval reconciliation.

**Near-boundary case captured live today (usable as MERGE-01's UAT/probe evidence, or extend the search if a sharper one is needed at execution time):** SPC's Day 1 grid window (as observed) is `2026-09-05T13:00:00Z` → `2026-09-06T12:00:00Z`. The Hazards Outlook's Sep 5 00Z–00Z day and Sep 6 00Z–00Z day both partially overlap this SPC grid day 1 under D-10's forward-align rule (Sep 5's 00Z-00Z window forward-aligns onto the grid day starting 12Z Sep 5 = grid day 1; Sep 6's 00Z-00Z window forward-aligns onto the grid day starting 12Z Sep 6 = grid day 2). A feature dated `start_date: 2026-09-06T00:00:00Z` (i.e., a Hazards Outlook feature that begins at midnight Sep 6, inside SPC's grid-day-1 window which runs until 12Z Sep 6) is the concrete near-boundary instance to test: it must bucket onto grid day 2 under D-10's forward-align rule, NOT grid day 1, even though its window opens at 00Z Sep 6 — twelve hours *inside* grid day 1's span, which runs until 12Z Sep 6. The naive reading places it on grid day 1 because that is where its start instant physically falls; D-10 places it on grid day 2 because the 18Z-06Z diurnal peak of the Sep 6 source day sits wholly inside the grid day starting 12Z Sep 6. That gap between the naive and correct answer is precisely what makes this case worth encoding. [CORRECTED 2026-09-05: this sentence originally asserted grid day 1, contradicting the forward-align derivation in the sentence immediately before it. D-10 is authoritative - a 00Z-00Z source day for calendar date D maps to the grid day that STARTS at 12Z on D.] This is exactly the "hazard occurring between 00Z and 12Z on a given date could appear in the wrong bucket" case Pitfall 4 warned about — worth encoding as a mutation-proven probe scenario per 15 D-10's standard.

## Precedence Table (derived, per dimension)

`[VERIFIED: node_helper.js/productRegistry.js current source]` for source availability and label vocabularies; `[CITED: wpc.ncep.noaa.gov/threats/about_hazards.pdf]` for the "WPC's Severe Weather flag is derived FROM SPC's own 15%+ outlook" fact, which materially de-risks the one edge case (SPC below floor, WPC flags severe) that would otherwise need explicit handling.

| Dimension | Rank 1 (preferred) | Day range | Rank 2 (suppressed when Rank 1 active) | Day range | Sole-source days (no suppression math needed) |
|---|---|---|---|---|---|
| `convective` | `spc-convective` | 1–8 | `wpc-hazards` ("Severe Weather", both the 3–7 and 8–14 Precipitation layers) | 3–14 | Days 9–14: `wpc-hazards` is sole source (SPC absent, not "below floor" — a genuinely different code path, see D-14 note below) |
| `fire` | `spc-fire` | 1–8 | `wpc-hazards` ("Critical Wildfire Risk", both Wildfire/Drought layers) | 3–14 | Days 1–2: `spc-fire` sole source. Days 9–14: `wpc-hazards` sole source |
| `heat` | `heatrisk` | 1–7 | `wpc-hazards` ("Hazardous Heat" days 3–7; "Excessive Heat"/"Much Above Normal Temperatures" days 8–14) | 3–14 | Days 1–2: `heatrisk` sole source. Days 8–14: `wpc-hazards` sole source (heatrisk absent) |
| `winter` | `wpc-wssi` | 1–3 | `wpc-hazards` ("Heavy Snow"/"Freezing Rain" days 3–7; "Heavy Snow"/"Freezing Rain"/"Heavy Ice" days 8–14) | 3–14 | Days 1–2: `wpc-wssi` sole source. Days 4–14: `wpc-hazards` sole source (WSSI stops at day 3) |
| `cold` | `wpc-hazards` ("Hazardous Cold"/"Frost/Freeze" days 3–7; "Much Below Normal Temperatures" days 8–14) | 3–14 | *(none — single source)* | — | Days 1–2 are a structural gap (REQUIREMENTS.md Out of Scope: "Cold hazards ... Days 1–2") |
| `wind` | `wpc-hazards` ("High Winds"/"Significant Waves" days 3–7 and 8–14) | 3–14 | *(none — single source)* | — | Days 1–2 are a structural gap (same Out of Scope entry, non-convective wind) |
| `flash-flood` | `wpc-ero` | 1–5 | *(none — single source; do NOT map `wpc-hazards`' "Heavy Rain"/"Heavy Precipitation" into this dimension — see below)* | — | Days 6–14: genuine gap, no flash-flood-specific product exists there |
| `heavy-precip` | `wpc-hazards` ("Heavy Rain"/"Heavy Precipitation" days 3–7 and 8–14) | 3–14 | *(none — single source)* | — | Days 1–2: genuine gap |

**Why `flash-flood` and `heavy-precip` are kept separate (departs from FEATURES.md's pre-D-05 Part B2, which proposed WPC's "Heavy Rain"/"Heavy Precipitation" as ERO's Day 4-5+ gap-filler under one combined dimension):** ERO is a purpose-built, forecaster-issued probability that rainfall will exceed Flash Flood Guidance — a specific, actionable flash-flood-risk product `[CITED: wpc.ncep.noaa.gov/qpf/excessive_rainfall_outlook_ero.php]`. The Hazards Outlook's "Heavy Rain"/"Heavy Precipitation" labels carry no FFG-exceedance semantics — they are a generic "notable rainfall expected" flag with no probability tier at all. Treating them as interchangeable (one dimension, ERO-then-WPC-fallback) would silently upgrade a generic rain flag into a flash-flood claim, or silently downgrade ERO's specific flash-flood probability into competing with a generic label — this is Pitfall 10's exact warned-against failure mode, restated with this project's own real label set. D-05's roster already lists both names as separate dimensions for this reason; this research resolves the "Claude's Discretion" question by keeping them apart.

**D-14 nuance for `convective`/`fire`/`heat`/`winter` on their "sole-source" days:** on days where the higher-ranked source has NO data at all (e.g., SPC on days 9–14), this is NOT the D-13 floor test ("is Rank 1's value above its own floor?") — Rank 1 has no entry to test. Per-day resolution (D-14) means the day's hazard list is built from only the sources that reported for that day; `wpc-hazards`' entry simply has no competing entry to be suppressed BY on those days, and gets `suppressedBy: null` by construction, not by passing a floor check. Keep these as two structurally distinct code paths (or one path where "Rank 1 absent for this day" short-circuits to "Rank 2 survives" before ever consulting the floor table) so a future reader does not conflate "SPC forgot to report" with "SPC reported below-floor."

## No-Risk Floor Table (resolves the Deferred open item)

`[VERIFIED: node_helper.js current source]` for every row below.

| Source | Day range | Raw floor mechanism | Floor test for merge code |
|---|---|---|---|
| `spc-convective` | 1–3 (categorical) | `riskToValue = { TSTM:1, MRGL:2, SLGT:3, ENH:4, MDT:5, HIGH:6 }` (node_helper.js:2987) | `value > 1` (i.e., MRGL or higher — TSTM/"General Thunderstorms" IS the floor per D-13's own wording, must not itself count as active) |
| `spc-convective` | 4–8 (probabilistic-only) | `percToRisk(pct, isSig)` (node_helper.js:2236): returns `"NONE"` only when `pct === 0`; any nonzero percent (0.05=MRGL and up) returns a real tier | `risk !== "NONE"` (equivalently `probRisk > 0`) — this is the "no probabilistic area / predictability too low" floor CONTEXT.md's Deferred section flagged as needing enumeration |
| `spc-fire` | 1–8 | `fireRiskToValue = { ELEV:1, CRIT:2, EXTM:3 }` (node_helper.js:3274); default 0 when no polygon matched | `value > 0` — ELEV is itself the lowest real tier, no sub-ELEV "floor" tier exists, so presence at all = active |
| `wpc-ero` | 1–5 | `includesFeat: (label, val) => val > 0` already applied at `extractPolygons` time (productRegistry.js:315) | Floor is pre-baked: any non-`"NONE"` `dayNRisk` in the existing `excessiveRain` block is already above floor |
| `wpc-wssi` | 1–3 | `includesFeat: (label, val) => val >= 2` (productRegistry.js:352) — WINTER WEATHER AREA (value 1) is filtered out BEFORE it can ever reach `evaluatePolygons` | Floor is pre-baked: any non-`"NONE"` `dayNRisk` in the existing `winterImpact` block is already above floor (MINOR or higher) |
| `wpc-hazards` | 3–14 | No severity ladder anywhere in the schema (confirmed: registry row has deliberately no `valueToTier`/`includesFeat`) — presence/absence only | Floor is "label present in the day's/window's match set at all," after the existing exclusion (`Flooding *`) and drought-gate (`Severe Drought`/`Rapid Onset Drought Risk`) filters have already run |
| `heatrisk` | 1–7 | Raw category `0`–`4`; `null` = no reading (Phase 17 D-02, explicitly distinct from `0`) | `category !== null && category >= 1` — matches D-13's stated "HeatRisk ≥ 1" exactly; `0` ("Little to No Risk") and `null` both fail the floor, consistent with D-13's "both null and an explicit no-risk value leave the lower-ranked entry visible" |
| `spc-md` / `wpc-mpd` (advisories) | n/a — not day-scoped | n/a | No floor test needed — see "Dimension Roster Rationale" below, recommendation is these never participate in per-day suppression |

## Live Label Inventory (feeds `hazardTaxonomy.js`, D-06)

Every label below is either confirmed via a live fetch today or read directly out of the current `productRegistry.js` (which itself documents a 2026-08-26 live palette pull). `[VERIFIED]` = fetched live today (2026-09-05) or read verbatim from current source; `[ASSUMED]` = structurally present per the registry's own schema-verification comment but not observed in either research session's live samples.

### `spc-convective` (source id `spc-convective`)
Categorical (days 1–3): `TSTM`, `MRGL`, `SLGT`, `ENH`, `MDT`, `HIGH` → dimension `convective`. `[VERIFIED]`
Probabilistic (days 4–8): no `LABEL` field — a raw percent (`0.05`/`0.15`/`0.30`/`0.45`) plus a `SIGN` flag, mapped via `percToRisk` to the same tier names → dimension `convective`. `[VERIFIED]`
SPC's own tor/hail/wind CIG breakdown (days 1–3) rides as D-05's optional `detail` sub-object, not a separate dimension. `[per D-05, locked]`

### `spc-fire`
`ELEV`, `CRIT`, `EXTM` → dimension `fire`. `[VERIFIED]`

### `wpc-ero`
`outlook` field: `"Marginal (At Least 5%)"` (dn=1), `"Slight (At Least 15%)"` (dn=2), `"Moderate (At Least 40%)"` (dn=3) `[VERIFIED, live 2026-09-05]`; `"High (At Least 70%)"` (dn=4, days 1–3 only) `[ASSUMED — schema-verified in the registry's own drawingInfo legend, not observed live in either research session]`. All → dimension `flash-flood`.

### `wpc-wssi`
`impact` field, folded to uppercase before lookup: `WINTER WEATHER AREA` (filtered pre-payload, never reaches the taxonomy), `MINOR`, `MODERATE`, `MAJOR`, `EXTREME` `[VERIFIED, live 2026-09-05 — WINTER WEATHER AREA observed today]`. All (MINOR+) → dimension `winter`.

### `wpc-hazards`
Live-confirmed label -> dimension mapping, cross-checked against `hazardsDisplayColor`'s exact key set (productRegistry.js:216-223) so the taxonomy's key list matches what the registry already renders:

| Label | Dimension | Day range | `[VERIFIED]`/`[ASSUMED]` |
|---|---|---|---|
| `Frost/Freeze` | `cold` | 3–7 | `[VERIFIED]` (registry) |
| `Hazardous Heat` | `heat` | 3–7 | `[VERIFIED]` (registry) |
| `Hazardous Cold` | `cold` | 3–7 | `[VERIFIED]` (registry) |
| `High Winds` | `wind` | 3–7, 8–14 | `[VERIFIED]` (registry) |
| `Significant Waves` | `wind` (discretion — closest existing dimension; a marine-specific dimension is not in D-05's roster) | 3–7, 8–14 | `[ASSUMED — dimension mapping is this research's judgment call, not observed policy]` |
| `Freezing Rain` | `winter` | 3–7, 8–14 | `[VERIFIED]` (registry) |
| `Heavy Precipitation` | `heavy-precip` | 3–7, 8–14 | `[VERIFIED]` (registry) |
| `Heavy Rain` | `heavy-precip` | 3–7, 8–14 (live-confirmed today: Sep 7/Sep 8 single-day features) | `[VERIFIED, live 2026-09-05]` |
| `Heavy Snow` | `winter` | 3–7, 8–14 | `[VERIFIED]` (registry) |
| `Severe Weather` | `convective` | 3–7, 8–14 | `[VERIFIED]` (registry; this is MERGE-02's target label) |
| `Heavy Ice` | `winter` | 8–14 only | `[VERIFIED]` (registry) |
| `Critical Wildfire Risk` | `fire` | 3–7, 8–14 | `[VERIFIED]` (registry) |
| `Excessive Heat` | `heat` | 8–14 only | `[VERIFIED]` (registry) |
| `Much Above Normal Temperatures` | `heat` (D-13's own accepted-cost note confirms this is the intended mapping) | 8–14 only | `[VERIFIED]` (registry + D-13 text) |
| `Much Below Normal Temperatures` | `cold` | 8–14 only | `[VERIFIED]` (registry) |
| `Flooding Likely` / `Flooding Occurring or Imminent` / `Flooding Possible` | N/A — hard-excluded before reaching the taxonomy (D-09 in 16-CONTEXT.md, National Flood Outlook data) | — | `[VERIFIED]` (registry `hazardsExcludedLabels`) |
| `Severe Drought` / `Rapid Onset Drought Risk` | **No dimension exists in D-05's 8-item roster.** Per D-07, these pass through with `dimension: null` when `showDrought` is on. Flagging explicitly since D-05's roster has no `drought` entry — this is not an oversight to fix, it's the correct D-07 fallback | — | `[VERIFIED]` (registry `hazardsDroughtLabels`) — dimension gap is this research's observation |

### `heatrisk`
No label vocabulary — raw numeric `0`–`4`. Per the Claude's Discretion item, recommend keying `hazardTaxonomy.js` on the numeric value directly (`{ 0: {...}, 1: {...}, ... }` under source id `heatrisk`) rather than synthesizing string labels, since the registry's own `valueToText`/`valueToColor` maps (productRegistry.js:505-511) already use numeric keys — matching that convention avoids a translation layer. All values → dimension `heat`.

### `spc-md` / `wpc-mpd` (advisories)
`spc-md`: `toEntry` always sets `hazardType: null` (productRegistry.js:386-390) — there is no live vocabulary to map, ever. `[VERIFIED]`
`wpc-mpd`: `hazardType` is free-text prose extracted from the description CDATA table, live examples from the project's own probe fixtures (built from a real captured `MPD_1118_final.kmz`): `"Heavy rainfall, Flash flooding possible"`, `"Heavy snow"`, `"Excessive snowfall rates"` `[VERIFIED: scripts/probe-payload-resilience.js, sourced from a live KMZ capture]`. This is **not an enum** — it is forecaster prose, comma-joined, with no fixed vocabulary. Attempting to map it into the 8-dimension taxonomy via string matching would be a second instance of Pitfall 10's trap. See "Dimension Roster Rationale" below for the recommendation.

## Dimension Roster Rationale (resolves Claude's Discretion items)

1. **`cold` stays separate from `winter`** — `wpc-hazards`' "Hazardous Cold"/"Frost/Freeze"/"Much Below Normal Temperatures" describe ambient-temperature hazards with no precipitation component, structurally distinct from `wpc-wssi`'s and `wpc-hazards`' snow/ice labels. No source ever competes across this boundary (no two sources both claim the same label under both dimensions), so merging them would add ambiguity for zero suppression benefit.
2. **`heavy-precip` stays separate from `flash-flood`** — see the Precedence Table section above; this is the load-bearing call.
3. **`heatrisk`'s numeric scale keys on the raw integer**, not a synthesized label string, matching the registry's own established convention for this source.
4. **Advisories (`spc-md`, `wpc-mpd`) should sit outside the taxonomy's precedence/suppression mechanism entirely, carrying no dimension used for day-level suppression** — `spc-md` has no live vocabulary at all (`hazardType` is always `null`), and `wpc-mpd`'s `hazardType` is free prose with no fixed vocabulary, so neither can be safely string-matched into the 8-dimension roster without risking exactly the over/under-merge Pitfall 10 warns about. This is also consistent with 15 D-03/D-05's existing architecture, which already places both in a separate `advisories` array outside the day blocks, and with Part C3's placement recommendation (a shared "active discussions" band, not folded into a day's hazard list). If `hazardTaxonomy.js` needs an entry for `spc-md`/`wpc-mpd` per D-06's "covering every product including SPC" instruction, it can carry `dimension: null` unconditionally with a comment explaining why, rather than attempting a taxonomy of MPD's prose.

## D-01 Shared-Value Constraint — where each legacy block's winning values live

`[VERIFIED: node_helper.js current source]`. The return statement at `node_helper.js:3685-3801` assembles the eight legacy blocks from these already-computed locals, all of which exist BEFORE the `return` statement runs:

| Legacy block | Source of its values | Runner |
|---|---|---|
| `day1`/`day2`/`day3` | `day1Risk`/`day1TorRisk`/`day1TorCig`/etc. locals (computed ~node_helper.js:3049-3201) — inline SPC-specific code, NOT the shared registry runner (14 D-08 deliberately excludes SPC from the registry) | inline |
| `day4`-`day8` | `day4Risk`..`day8Risk` locals via `percToRisk(dayNProbRisk, dayNSign)` (node_helper.js:3381-3494) | inline |
| `fireWeather` | `day1FireRisk`..`day8FireRisk` locals | inline |
| `excessiveRain` | `eroPayload = results.excessiveRain.payload` | `_runArcGisDayProduct` (node_helper.js:302), returns `{ payload, anyStale }` |
| `winterImpact` | `wssiPayload = results.winterImpact.payload` | `_runArcGisDayProduct` (same function, different row) |
| `hazardsOutlook` | `hazardsPayload = results.hazardsOutlook.payload` | dedicated `arcgis-hazard-window` runner (dispatches on `row.kind`) |
| `heatRisk` | `heatRiskPayload = results.heatRisk.payload` | `_runHeatRiskProduct` (node_helper.js:922) |
| `advisories` | `advisories = { spcMD: [...], mpd: [...] }` built from `results[row.id].entries` | `_runKmlAdvisoryRow` (node_helper.js:978) |

**Concrete plan implication:** the unified `days[]`/`summary`/`sources` assembly must be inserted into `getSpcOutlook` **after** all of the above locals/`results.*` values exist but **before** (or alongside, reading the same locals) the `return` statement — never as a second pass that re-fetches or re-evaluates. For the SPC-specific day1–day8/fireWeather blocks (the four that are NOT already `{ payload, anyStale }` shaped, unlike the four registry-driven ones), the merge code will need to read the SAME already-computed `dayNRisk`/`dayNTorRisk`/etc. locals directly — these are plain closures-scoped variables inside `getSpcOutlook`, not already packaged into a reusable object, so assembling `days["1"].hazards` for the `convective`/`fire` dimensions means reading roughly a dozen existing local variable names rather than one `results.spcConvective.payload` the way the other four sources allow. This is the one place D-01's "never re-derive" constraint requires care rather than a clean drop-in, because SPC/fire predate the registry pattern (14 D-08).

**The grid-anchor extraction (D-12) fits into this same inline SPC block**: `_validTimeOfWinner(day1RiskPoly, loc, day1Risk, "VALID_ISO")` / `"EXPIRE_ISO"` can be called immediately after `day1RiskResult`/`day1RiskPoly` are computed (~node_helper.js:3065), reusing the existing winning-polygon selection with zero additional fetches — exactly the same pattern ERO/WSSI already use for their own `validTimeField` extraction, just called manually instead of through `_runArcGisDayProduct` (since SPC's day1 fetch is inline, not registry-driven).

## Day-Window Normalization Mechanics (existing code to extend, not replace)

`[VERIFIED: node_helper.js current source]`. The Hazards Outlook already has a full day-bucketing pipeline (`_todayUtcMs()` → `_hazardDayOffset()` → `_bucketHazardMatch()` → `_isFullNominalWindow()`), but it is **clock-anchored** (`_todayUtcMs()` reads `Date.UTC(y,m,d)` off `this._nowMs()`, i.e. UTC midnight of "now") — this is precisely what 16 D-03 established and what 18 D-09 now reverses.

Phase 18 needs an **SPC-grid-anchored** parallel: instead of "day offset from UTC midnight," the anchor becomes "day offset from the SPC grid's own day-1 start" (D-12's `VALID_ISO`, or the clock-fallback `'estimated'` anchor). The function shapes to reuse:
- `_hazardDayOffset(epochMs, anchorMs)` (node_helper.js:2342) — already takes an arbitrary anchor as its second parameter; it does not have to be `_todayUtcMs()`'s output. **This function can likely be reused verbatim** — only its caller needs to pass the new SPC-grid anchor instead of `_todayUtcMs()`.
- `_bucketHazardMatch` (node_helper.js:2495) — takes `todayUtcMs` as a parameter already; same story, likely reusable with a renamed/repurposed anchor parameter.
- HeatRisk's `_heatRiskDayOffset` (node_helper.js:2433) is a thin wrapper around the same `_hazardDayOffset` — same reuse path.

**What genuinely needs new code:** the anchor computation itself (SPC `VALID_ISO` read + clock fallback, D-12), and D-10's forward-align rule where it's not already implicit — `wpc-hazards`' 00Z-00Z-to-12Z-grid reconciliation is a genuine interval overlap problem (a `wpc-hazards` day can partially span two grid days), which the current `_hazardDayOffset`'s simple division-and-round is a **reasonable approximation of but not an exact interval-overlap solution** — worth flagging as a design decision for the plan: does per-feature date-bucketing use `_hazardDayOffset`'s rounding approach against the START date only (as it already effectively does today, unchanged), or does it need explicit interval-overlap math against the grid day's actual start/end? Given D-10's own derivation ("a 00Z–00Z day overlaps two 12Z–12Z grid days by exactly 12 hours each... tiebreak is meteorological"), the EXISTING rounding-based offset function, redirected at the new anchor, likely already produces D-10's specified outcome for `start_date` (rounding a value exactly 0.5 days off the anchor breaks toward the later grid day, which is the forward-align direction D-10 wants) — but this equivalence should be explicitly verified with a unit-level check during planning, not assumed structurally.

## PERF-03 Instrumentation Mechanics (D-17/D-18)

`[VERIFIED: node_helper.js current source]`.

- **Backend interval bracket:** `GET_SPC_DATA` receipt is `node_helper.js:1575` (`if (notification === "GET_SPC_DATA")`); `SPC_DATA_RESULT` emit is `node_helper.js:1667` (`this.sendSocketNotification("SPC_DATA_RESULT", ...)`). Wrap a `_nowMs()` timestamp at handler entry and immediately before this emit — the existing `_inFlight`/`_seq` guard machinery already brackets this exact span, so the timing wrapper has no overlap-handling of its own to build.
- **Per-product breakdown, largely already built:** `memberTimings` (`node_helper.js:3632-3660`) already records each of the six `Promise.allSettled`-batched new products' individual timings as part of PERF-01's existing instrumentation, and is already logged. D-17's "per-product breakdown naming the slowest fetch" can extend this existing object (add the SPC/fire-weather inline block's own elapsed time as additional `memberTimings` entries, since those aren't part of the `Promise.allSettled` batch today) rather than building parallel instrumentation.
- **Wall-clock bracket (process start -> first populated render):** the backend-only half of this phase can only stamp "process start" (`start()`, `node_helper.js:184`) and the emit above; the "first populated render" endpoint lives in `MMM-SPCOutlook.js`'s `socketNotificationReceived` (`MMM-SPCOutlook.js:87-90`, confirmed present) and `getDom()` (`MMM-SPCOutlook.js:164`). Since D-01 keeps the legacy render path fully functional through this phase, the wall-clock figure is measurable end-to-end today without waiting for Phase 19 — this phase's plan should include a small frontend-side timestamp log (first `SPC_DATA_RESULT` receipt timestamp minus module `start()` timestamp is the practical proxy for "first populated render," since MagicMirror calls `updateDom()` synchronously off the same handler) rather than deferring the wall-clock half to Phase 19.
- **D-18's "once per cold start" logging** fits naturally as a single `Log.info` summary block emitted right after the `SPC_DATA_RESULT` send, gated on a helper-global boolean set `true` after the first successful emit (mirroring the existing `_loggedIntervalFallback`/`_loggedMultiInstance` once-per-process pattern already used throughout `node_helper.js`) — no new logging infrastructure needed, just one more boolean guard in the same family.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Parsing ISO-8601 datetime strings (`VALID_ISO`/`EXPIRE_ISO`) | A custom regex/string-slicer | `new Date(str)` (native, zero dependencies) | ISO-8601 with an explicit UTC offset (`+00:00`) parses correctly and unambiguously in every Node.js version this project targets; a custom parser is unnecessary risk for a format the platform already handles |
| Parsing `"HHZ MM/DD/YY - HHZ MM/DD/YY"` composite strings (ERO/WSSI `valid_time`) | Nothing exists to reuse here — this genuinely needs a small parser | One small, well-tested regex-based parser, written once, shared by ERO and WSSI (same format confirmed live today) | Both products use the identical format; one function, not two |
| Day-offset/bucketing math | A second bucketing implementation for the SPC-anchored grid | `_hazardDayOffset`/`_bucketHazardMatch`, redirected at the new anchor (see above) | Already built, already handles the malformed-input containment (CR-02 lesson) and the exact-alignment window-band routing (`_isFullNominalWindow`) Phase 18 will also need for `wpc-hazards` |
| Per-product no-risk floor tests | A bespoke floor check per source scattered through the merge code | One `NO_RISK_FLOOR` table in `hazardTaxonomy.js`, keyed by source id (and day-range function for `spc-convective`) | Matches D-06's "precedence table beside the map" instruction; keeps the floor logic in one auditable place rather than six inline `if`s |

## Common Pitfalls

### Pitfall 4 (carried forward, now live-reconfirmed): "Day N" is not stable across agencies or across one product's own re-issuances
Re-confirmed live today: SPC Day 1's `VALID` was 13:00Z (not 12:00Z), a truncation to the mid-day re-issuance time. See "D-12 Verification" above for the concrete mechanic and why it's harmless if the code always reads the raw field rather than assuming a fixed 12:00Z anchor.

### Pitfall 9 (carried forward): display-rewrite regressions manual UAT structurally misses
Not this phase's direct concern (Phase 19 owns `getDom()`), but D-01's additive migration means Phase 18's own verification (comparing the new `days[]` block against the untouched legacy blocks for the SAME poll) is exactly the kind of systematic cross-check Pitfall 9 recommends building now rather than deferring — a probe scenario that asserts `days["3"].hazards` and `hazardsOutlook.day3` agree on presence/absence for every dimension is cheap to write while both representations still coexist, and becomes impossible to construct once Phase 19 removes the legacy blocks.

### Pitfall 10 (carried forward, directly load-bearing for MERGE-04): cross-source dedup by label text over- and under-merges
This phase's `hazardTaxonomy.js` is the explicit up-front artifact Pitfall 10 calls for. The concrete new instance this research surfaces beyond FEATURES.md's original finding: **`wpc-mpd`'s `hazardType` field is free prose** ("Heavy rainfall, Flash flooding possible"), not a controlled vocabulary — any code that tries to route it into the 8-dimension taxonomy via substring matching would be a second, novel instance of exactly this pitfall. See "Dimension Roster Rationale" — recommend advisories stay outside the suppression mechanism.

### New pitfall this research surfaces: SPC/fire's inline block predates the registry pattern
Unlike ERO/WSSI/HazardsOutlook/HeatRisk, SPC's own day1–day8 and fire weather blocks are NOT built through `_runArcGisDayProduct`/`{ payload, anyStale }` — they are ~150 lines of inline per-day fetch/evaluate code with a dozen loose local variables (`day1Risk`, `day1TorRisk`, `day1TorCig`, ...). A plan that assumes every source exposes a uniform `results.<id>.payload` shape (true for 6 of 8 sources) will hit friction on exactly the two sources (`spc-convective`, `spc-fire`) that are also the two dimensions (`convective`, `fire`) needing real two-source suppression. Plan for this explicitly rather than discovering it mid-implementation.

## Code Examples

### Reading the SPC grid anchor (new code, reusing existing infrastructure)
```javascript
// Source: this research, built from the existing _validTimeOfWinner (node_helper.js:2013)
// and the live-confirmed VALID_ISO/EXPIRE_ISO fields (see "D-12 Verification")
// Call this immediately after day1RiskResult/day1RiskPoly are computed (~node_helper.js:3065),
// reusing the SAME winning-polygon selection already performed for day1's risk tier —
// no second fetch, no second evaluatePolygons pass.
const gridWindowStart = this._validTimeOfWinner(day1RiskPoly, loc, day1Risk, "VALID_ISO");
const gridWindowEnd   = this._validTimeOfWinner(day1RiskPoly, loc, day1Risk, "EXPIRE_ISO");
const gridAnchor = (gridWindowStart && gridWindowEnd) ? "observed" : "estimated";
```

### No-risk floor table shape (recommended `hazardTaxonomy.js` structure)
```javascript
// Source: this research, "No-Risk Floor Table" section
const NO_RISK_FLOOR = {
  "spc-convective": {
    // Day range is significant — categorical (1-3) and probabilistic-only (4-8) use
    // different raw value domains (D-14's SPC-coverage fact correction).
    categorical: (value) => value > 1,       // TSTM (1) is the floor itself
    probabilistic: (risk) => risk !== "NONE" // percToRisk returns "NONE" only at pct===0
  },
  "spc-fire": (value) => value > 0,
  "wpc-ero": null,   // pre-baked at fetch time — any non-"NONE" tier is already above floor
  "wpc-wssi": null,  // pre-baked at fetch time — WINTER WEATHER AREA is filtered before evaluatePolygons
  "wpc-hazards": null, // presence/absence only — label present = active, no floor test
  "heatrisk": (category) => category !== null && category >= 1
};
```

## State of the Art

| Old Approach | Current Approach (this phase) | When Changed | Impact |
|--------------|------------------|---------------|--------|
| `wpc-hazards` bucketed onto native UTC calendar date (16 D-03) | Bucketed onto the SPC-anchored 12Z-12Z grid (18 D-09, reverses 16 D-03) | This phase | `_todayUtcMs()`-anchored bucketing becomes SPC-VALID_ISO-anchored; live-validated `day3`-`day14` assignments from Phase 16 shift by up to 12 hours for features near a boundary |
| Eight independent per-product display blocks | One additive `days`/`summary`/`sources` block, legacy blocks retained byte-for-byte (D-01) | This phase | No behavior change to the existing rendered display yet — Phase 19 consumes the new block |
| Label-string-based cross-source comparison (implicit, never actually built) | Explicit `(source, label) -> dimension` taxonomy (D-06) | This phase | Precedence becomes possible at all — no prior phase had a mechanism for this |

**Deprecated/outdated:** FEATURES.md Part B2's single combined "Excessive rain / flash-flood risk" dimension with WPC's Heavy Rain as a Day 4-7 fallback — superseded by D-05's finer 8-dimension roster and this research's explicit `flash-flood`/`heavy-precip` split (see Precedence Table rationale).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | ERO's `dn: 4` ("High") tier uses the label text `"High (At Least 70%)"`, matching the pattern of dn 1-3 | Live Label Inventory | Low — this is a display-text formatting detail, not a dimension/precedence question; wrong text would be a cosmetic mismatch, not a merge-logic defect |
| A2 | `"Significant Waves"` maps to the `wind` dimension rather than being left dimensionless | Live Label Inventory / Dimension Roster Rationale | Low-Medium — if wrong, a marine wave hazard could suppress-compete with SPC's convective wind data (SPC's `windCig` covers a different, thunderstorm-driven phenomenon per FEATURES.md B2) even though the two are unrelated; recommend confirming this mapping during plan-check or discuss-phase rather than silently accepting it |
| A3 | The existing `_hazardDayOffset`'s rounding-based day math, redirected at the new SPC-grid anchor, produces the exact same day assignment D-10's explicit interval-overlap derivation specifies | Day-Window Normalization Mechanics | Medium — if the rounding approximation diverges from true interval-overlap in some edge case (e.g., a `wpc-hazards` feature whose `start_date` sits exactly at a non-half-day offset from the anchor because the anchor itself is not exactly `T12:00Z`, as today's live D-12 finding shows can happen), a hazard could bucket onto the wrong grid day near a boundary; this is exactly the case a mutation-proven probe scenario should target |

**If this table is empty:** N/A — three items above need confirmation before being treated as locked.

## Open Questions (RESOLVED at planning time)

> **Both questions were dispositioned during /bm:plan-phase 18 and neither is outstanding.**
> - **Q1 (interval-overlap vs rounding math):** resolved analytically by the planner and scheduled for empirical
>   confirmation. `Math.round(0.5) === 1` in JS, so reusing `_hazardDayOffset` produces D-10's forward-align
>   direction ONLY when handed a clean 12Z boundary. Fed the live-observed truncated `VALID_ISO` of `13:00Z`,
>   the same 00Z-aligned feature lands one grid day early. Resolution: derive the nominal anchor as
>   `EXPIRE_ISO` minus 24 hours (EXPIRE is never truncated) for all offset math, while day 1's `windowStart`
>   carries the real truncated `VALID_ISO` per D-11. Verified empirically by 18-02 Task 1 before anything
>   depends on it, and mutation-proven by 18-07. See 18-02's SUMMARY for the recorded result.
> - **Q2 (SPC fire-weather floor granularity):** carried forward as a documented low-priority, non-blocking
>   spot-check in 18-01 Task 2, matching this document's own disposition. Not blocking.


1. **Does the existing `_hazardDayOffset` rounding math need to become true interval-overlap math for `wpc-hazards`, given SPC's day-1 anchor is not always exactly `12:00:00Z` (per today's live finding)?**
   - What we know: the function already takes an arbitrary anchor parameter and CR-01/D-04-style containment; D-10's derivation assumes a clean half-day offset, which holds when the anchor is exactly 12:00Z but may not hold precisely when SPC's day-1 anchor is truncated (13:00Z observed today).
   - What's unclear: whether the truncated-anchor case ever actually causes a different rounding outcome in practice (a 12:00Z-to-13:00Z anchor shift is small relative to the 24h day span being bucketed), or whether it's provably immaterial.
   - Recommendation: plan a unit-level check (not just a live-payload check) that exercises `_hazardDayOffset` against both a clean 12:00Z anchor and a truncated (e.g. 13:00Z, or the 01Z-partial-day case) anchor, confirming the same day assignment results, before relying on the reused function unmodified.

2. **Should the fire-weather `spc-fire` categorical floor differentiate ELEV from a hypothetically-lower "elevated but below threshold" tier?**
   - What we know: `fireRiskToValue` has exactly three tiers (`ELEV/CRIT/EXTM`), all ≥1, with 0 as the implicit "no fire weather data at this location" default.
   - What's unclear: whether SPC's fire weather product has an analogous "General Thunderstorms"-style bottom rung that simply isn't captured in this project's existing `fireRiskToValue` map (the live payload's LABEL vocabulary for fire weather was not re-verified in this research session).
   - Recommendation: low priority — spot-check the live fire weather payload's LABEL set during implementation if the `fire` dimension's suppression behaves unexpectedly; not blocking for planning since the existing 3-tier map is already proven correct for the legacy `fireWeather` block.

## Environment Availability

Skipped — this phase introduces no new external tools, services, or runtimes. All eight data sources are already fetched by Phases 14–17; verified reachable live during this research session (`spc-convective`, `wpc-ero`, `wpc-wssi`, `wpc-hazards` all returned live 200 responses on 2026-09-05).

## Validation Architecture

Skipped per `.planning/config.json`: `workflow.nyquist_validation` is explicitly `false`.

## Security Domain

`security_enforcement` is absent from `.planning/config.json` (treated as enabled per the default), but this phase introduces no new external input-handling surface — it consumes data already fetched, validated, and body-bounded by Phases 14–17 (`GEOJSON_MAX_BODY_BYTES`, `_isFeatureCollection` gates, the KML-advisory allowlist). No new ASVS category becomes newly applicable.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V5 Input Validation | yes (inherited, not new) | Already-established per-feature containment (CR-01/CR-02 pattern: malformed feature dropped, siblings survive) extends naturally to the new merge/bucketing code — a malformed `start_date`/`VALID_ISO` should degrade that one entry, never throw the whole merge pass |
| V2/V3/V4/V6 | no | This phase has no authentication, session, access-control, or cryptography surface — it is internal data transformation over already-fetched public NOAA data |

### Known Threat Patterns for this stack

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| A malformed `VALID_ISO`/`EXPIRE_ISO` (e.g. non-ISO string from a future NOAA schema change) crashing the grid-anchor read | Denial of Service (self-inflicted, not adversarial — NOAA is the only writer) | `new Date(str)` on an invalid string yields `Invalid Date` (not a throw); guard with `Number.isFinite(d.getTime())` before use, falling back to `gridAnchor: 'estimated'` — same pattern D-12 already specifies for a fetch failure |
| Unbounded advisory `hazardType` prose (`wpc-mpd`) flowing into a taxonomy lookup key | Tampering (a compromised/typo'd upstream feed) | Already moot per this research's recommendation that advisories never participate in dimension-keyed lookups — no string-matching surface to attack |

## Sources

### Primary (HIGH confidence)
- Live fetch, `https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson`, `day2otlk_cat.lyr.geojson`, `day3otlk_cat.lyr.geojson` — 2026-09-05, this research session (D-12 verification, VALID/EXPIRE fields)
- Live fetch, `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query` — 2026-09-05, this research session (ERO valid_time/start_time/end_time formats)
- Live fetch, `https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/1/query` — 2026-09-05, this research session (WSSI valid_time format, truncated-start confirmation)
- Live fetch, `https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/1/query` and `/4/query` — 2026-09-05, this research session (Hazards Outlook start_date/end_date epoch confirmation, multi-day Temperature-layer span vs. single-day Precipitation-layer span)
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/node_helper.js` — read in full across the relevant ranges (lines 25-260, 280-530, 900-1200, 1575-1670, 2000-2500, 2870-3800)
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/productRegistry.js` — read in full
- `/home/kcreasey/Documents/Projects/weather/MMM-SPCOutlook/scripts/probe-payload-resilience.js` — MPD `hazardType` live-capture examples

### Secondary (MEDIUM confidence)
- `.planning/research/FEATURES.md` Part A1/A2/A3 (WPC's "Severe Weather" flag is derived from SPC's own 15%+ outlook — official WPC PDF citation, not independently re-fetched this session)
- `.planning/research/PITFALLS.md` Pitfalls 4, 9, 10 — carried forward and cross-checked against today's live fetches (Pitfall 4's specific "01Z 08/16/26" sample was independently reconfirmed via a different mechanism — SPC's own 13:00Z truncated VALID today)

### Tertiary (LOW confidence)
- ERO's `dn: 4` ("High") label text — schema-verified in the registry's own comment, not observed live in either research session (Assumption A1)

## Metadata

**Confidence breakdown:**
- D-12 verification: HIGH — live-fetched today, unambiguous
- Precedence table / dimension roster: HIGH for the mechanical source-to-dimension mapping (all read from current registry code or live fetches); MEDIUM for two discretionary calls (`Significant Waves` → `wind`, advisories excluded from suppression) that should be confirmed rather than silently locked
- No-risk floor table: HIGH — every value read directly from current `node_helper.js`/`productRegistry.js` source
- Day-window normalization mechanics: MEDIUM — the reuse-vs-rewrite call on `_hazardDayOffset` is a structural inference from reading the code, not yet verified by writing and running the actual redirected function (Open Question 1)
- PERF-03 instrumentation mechanics: HIGH — exact line numbers confirmed in current source

**Research date:** 2026-09-05
**Valid until:** 7 days for the live-payload field-format findings (NOAA schemas can change without notice, per this project's own established practice of re-verifying rather than trusting stale captures); 30 days for the code-structure findings (stable until the next phase touches `node_helper.js`)
