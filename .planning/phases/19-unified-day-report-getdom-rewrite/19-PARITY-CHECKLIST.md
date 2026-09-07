---
phase: 19
requirement: RPT-06
status: open
baseline_probe_result: "123 passed, 0 failed, 0 skipped"
final_probe_result: "154 passed, 0 failed, 0 skipped"
---

# Phase 19 RPT-06 Behavior-Parity Checklist

This is the phase's real acceptance gate. Every row below is a distinct branch of the current
`getDom()` (`MMM-SPCOutlook.js:184-784`), enumerated from a full read of that range and
cross-verified against `PROJECT.md`'s changelog (lines 22-40) for defect-ID provenance, with
every `Old site` line reference re-verified against the current working tree (2026-09-06) rather
than transcribed from `19-RESEARCH.md`'s own citations. Plans 19-04 through 19-06 tick a row's
`New site` cell as they carry the behavior into the new renderer; plan 19-08 fills `Run A`/`Run B`
during the two mandatory manual runs and signs the checklist off.

## Preserved Behaviors (35)

| # | ID | Behavior (observable) | Old site | New site | Run A (no risk anywhere) | Run B (everything active) | Notes |
|---|----|------------------------|----------|----------|--------------------------|----------------------------|-------|
| 1 | (loading) | `!this.spcrisk` → literal `"Loading SPC Outlook..."` via `innerHTML` (hardcoded string, safe) | MMM-SPCOutlook.js:419-420 | MMM-SPCOutlook.js:646-647 — carried forward verbatim: same hardcoded string, same unconditional `innerHTML` assignment | | | RESEARCH.md #1 |
| 2 | (error) | `this.spcrisk.error` → `"Error: " + error` via `textContent` (never `innerHTML`) | MMM-SPCOutlook.js:421-422 | MMM-SPCOutlook.js:648-649 — carried forward verbatim, still routed through `textContent`, never `innerHTML` | | | RESEARCH.md #2 |
| 3 | BUG-03 | No-risk gate term: `!(extended && day48Risk)` | MMM-SPCOutlook.js:437 | Closed by construction — retired with the retired ~15-term boolean gate; replaced by the single `summaryOk && summary.anyHazard === false && !this.spcrisk._stale` read at MMM-SPCOutlook.js:666, with day-span concerns closed by the unified day loop's own bound on `this.spcrisk.days`' 14 keys at MMM-SPCOutlook.js:700/714 — no `day48Risk`-specific term survives anywhere in `getDom()` | | | RESEARCH.md #3 — retired with the code it defended (row-20-style resolution): the term itself is gone, the backend-computed `summary.anyHazard` already unions day 4-8 SPC risk with everything else, verified by `merge-summary-all-quiet-is-an-all-clear` and `frontend-follows-the-payload-day-span-not-a-hardcoded-one` |
| 4 | CR-01 | Staleness (`!this.spcrisk._stale`) disqualifies the whole no-risk short-circuit — a degraded read is never an all-clear | MMM-SPCOutlook.js:430 | MMM-SPCOutlook.js:666 — `summaryOk && summary.anyHazard === false && !this.spcrisk._stale`, the same staleness disqualifier as one explicit term in the new single-condition gate | | | RESEARCH.md #4 |
| 5 | FWXT-03 | No-risk gate extended for fire weather days 1-2 (unconditional) and days 3-8 (extended-gated) | MMM-SPCOutlook.js:438-446 | Closed by construction — same retirement as row 3; the day1-2-unconditional/day3-8-extended-gated distinction was itself an artifact of the retired per-product day-span logic. 18 D-02's 14 always-present keys make no per-source day-count literal reachable anywhere in `getDom()` (MMM-SPCOutlook.js:700/714) | | | RESEARCH.md #5 — retired with the code it defended: the backend's own per-source emission (not a frontend gate term) now decides which days fire weather populates |
| 6 | WR-08 | ERO/WSSI/HazardsOutlook/HeatRisk no-risk gate terms all derive their day span from the block's own keys, never a literal count | MMM-SPCOutlook.js:453-476 | MMM-SPCOutlook.js:700, MMM-SPCOutlook.js:714 — closed by construction: the unified day loop bounds `n = 1..14` on `this.spcrisk.days`' own 14 always-present keys, with no per-product day-span literal anywhere in `getDom()` (line reference corrected during 19-08 sign-off — 19-05/19-06's detail-mode and band insertions shifted this ~184 lines down from its 19-04-era citation) | | | 19-04 |
| 7 | WR-09 | Advisory no-risk gate term is per-toggle (`enabledAdvisories().length > 0`), not unconditional | MMM-SPCOutlook.js:488 | MMM-SPCOutlook.js:547-555 — `enabledAdvisories()` retains its per-toggle gate verbatim, now called from the combined band's advisory sub-section (MMM-SPCOutlook.js:789); the no-risk gate term itself is closed by construction via `summary.anyHazard` (row 9), a backend-computed union that already includes the advisory arrays without a duplicate per-toggle read at the gate site | | | 19-06 |
| 8 | WR-04 | `_staleAsOf` renders real cached-reading age via `moment(asOf).fromNow()`; omits the age suffix (not the badge) when `asOf` isn't a finite number | MMM-SPCOutlook.js:494-505 | MMM-SPCOutlook.js:670-686 — carried forward verbatim: the badge renders first (D-09), `_staleAsOf` drives `moment(asOf).fromNow()` at line 680 when finite, and the suffix (not the badge) is omitted at the `typeof asOf === "number" && isFinite(asOf)` guard when it isn't | | | RESEARCH.md #8 |
| 9 | CR-01 | `contentMarker` pattern: if nothing rendered after the stale badge, fall back to `"No Severe Weather Risk (unconfirmed)"`, distinct from the confident all-clear | MMM-SPCOutlook.js:512, MMM-SPCOutlook.js:778-779 | MMM-SPCOutlook.js:693 (`contentMarker` capture), MMM-SPCOutlook.js:818-820 (the `"No Severe Weather Risk (unconfirmed)"` fallback when nothing rendered after it) — same pattern, same two strings, same distinction from the confident all-clear | | | RESEARCH.md #9 |
| 10 | D-05/D-06 (15) | Advisory band: SPC MD then WPC MPD, in that concatenation order; each line `label [+ " — " + hazardType] + " in effect."` | MMM-SPCOutlook.js:513-540 | MMM-SPCOutlook.js:789-802 — the loop and its wording, ordering (`enabledAdvisories()`'s own SPC-MD-then-MPD concatenation, unchanged) and `#0059E0` color are a behavior-preserving relocation into the combined band below all day blocks (RPT-04-RELOC); only the position moved | | | 19-06 |
| 11 | WR-12 | Advisory `label`/`hazardType` pass through `escapeHtml` before reaching `innerHTML` | MMM-SPCOutlook.js:532, MMM-SPCOutlook.js:537 | MMM-SPCOutlook.js:794, MMM-SPCOutlook.js:799 — same `escapeHtml` calls, carried over verbatim at the relocated site | | | 19-06 |
| 12 | PROXUI-01, PROXUI-02 | Day 1/Day 2 rows: colored risk text + `proximityBadge(categorical, mode)`, mode = `risk=="NONE" ? "outside" : "inside"` | MMM-SPCOutlook.js:541-561 | MMM-SPCOutlook.js:358-359 (`convectiveDetailAugment`'s `categoricalMode`), consumed at MMM-SPCOutlook.js:470/524 — relocated to detail mode per D-07-RELOC; the badge is appended inside the convective sub-row's own label-field color span (`labelSuffix`), never in the compact line | | | 19-05 |
| 13 | FWXT (implicit, pre-ID) | Day 1/Day 2 probabilistic breakdown line (tornado/hail/wind icons + `cigLabel` + percentage), only emitted when `probRisk` is true, only per-hazard-type when that type's risk > 0 | MMM-SPCOutlook.js:544-561 | MMM-SPCOutlook.js:364-411 (`convectiveDetailAugment`'s `hasTorFamily` branch, corrected end line to include its `return`) — same `probRisk` gate and per-type `> 0` gate, reproduced as a detail-mode sub-line beneath the convective sub-row (D-07-RELOC) | | | 19-05 |
| 14 | PROXUI-03/04 | Day 1/2 per-hazard-type proximity badges: `torCig`/`hailCig`/`windCig`, mode = `own CIG === 0 ? "outside" : "inside"` (independent per hazard type, NOT tied to the day's categorical mode) | MMM-SPCOutlook.js:546-548, MMM-SPCOutlook.js:557-559 | MMM-SPCOutlook.js:376, 388, 397 (`torMode`/`hailMode`/`windMode`, each its own explicit expression against `detail.<type>Cig`, never derived from `categoricalMode`; corrected from 376/385/394 during 19-08 sign-off — the post-Task-3 escapeHtml fix (commit `5e00ab0`) inserted a 3-line comment ahead of `hailMode`/`windMode`, shifting both down) | | | 19-05 |
| 15 | PROXUI-04 | Day 3 dual badge: categorical AND cig badges both computed; joined with `";"` only if both are non-empty (`day3DualSep`) | MMM-SPCOutlook.js:562-569 | MMM-SPCOutlook.js:412-421 (`convectiveDetailAugment`'s `hasCigOnly` branch, `dualSep`; corrected from 409-418 for the same post-Task-3 3-line shift) | | | 19-05 |
| 16 | (day 3, no per-ID) | Day 3 appends `cigLabel(day3.cig)` directly into the risk-text span (no separate icon breakdown line — day 3 has no tornado/hail/wind percentages at all) | MMM-SPCOutlook.js:567 | MMM-SPCOutlook.js:416-421 (corrected from 410-418) — `cigLabel(detail.cig)` prepended into the same `labelSuffix` string the dual badge joins onto, no separate sub-line for this shape | | | 19-05 |
| 17 | (extended days, no per-ID) | Days 4-8 gate is `probRisk` (not `risk != NONE`), plain colored text only, no proximity badges at all for this range (asymmetry vs. days 1-3) | MMM-SPCOutlook.js:570-577 | MMM-SPCOutlook.js:423-428 (corrected from 420-425) — `convectiveDetailAugment` falls through to `{ labelSuffix: "", subLineHtml: "" }` for the `{probRisk, sign}` shape: plain label, no proximity badge of any kind (asymmetry preserved; see SIGN-NOOP below for why `sign` itself stays unrendered) | | | 19-05 |
| 18 | FWXT-01/02/03/04 | Fire weather days 1-2 unconditional, days 3-8 `extended`-gated; `fireRiskToColor` lookup (`{0:"aaaaaa",1:"FF7F00",2:"FF0000",3:"FF00FF"}`); gate is `day{N}Risk > 0` | MMM-SPCOutlook.js:578-598 | Closed by construction — `grep -c "fireRiskToColor" MMM-SPCOutlook.js` returns `0`; the eight legacy fire-weather render blocks are gone. `spc-fire`-sourced entries now flow through the same generic compact-segment call site every other dimension uses (MMM-SPCOutlook.js:741-747), with color resolved by the backend's own hazardTaxonomy-driven `color` field and validated by the shared `validHazardColor` guard (line 745) rather than a frontend fire-specific lookup table. The day-span distinction (days 1-2 unconditional, days 3-8 extended-gated) is closed by the same unified day-loop bound as rows 3/5/6/19 (MMM-SPCOutlook.js:700/714) — the backend's own per-source emission now decides which days fire weather populates, not a frontend gate term | | | RESEARCH.md #18 — retired with the code it defended; generic call-site proof via `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color` / `rpt02-compact-line-renders-dimension-worded-dot-separated-segments`, day-span/gate correctness via backend `merge-sources-spc-fire-reporting-tracks-answering-not-finding` |
| 19 | WR-08 | `renderDayBlock` (ERO/WSSI): day span from `dayRiskCount` (counts `day{N}Risk` keys), strict `!== "NONE"` | MMM-SPCOutlook.js:604-614 | MMM-SPCOutlook.js:700, MMM-SPCOutlook.js:714 — `renderDayBlock`/`dayRiskCount` are retired (`grep -c` for both returns `0`); closed by construction, same unified day-loop bound as row 6 (line reference corrected during 19-08 sign-off) | | | 19-04 |
| 20 | WR-02 | `renderDayBlock` interpolates `day{N}Color`/`day{N}Text` into `innerHTML` with **no** `validHazardColor`/`escapeHtml` — not exploitable today (module-authored lookup tables), but the new unified renderer must not repeat this omission for any field, since `wpc-hazards` can carry pass-through remote text | MMM-SPCOutlook.js:604-614 | MMM-SPCOutlook.js:741-747, specifically lines 745-746 — **closed by construction**: `renderDayBlock` is gone; every compact segment (from any of the six day sources, including `wpc-hazards`) passes through `validHazardColor(h.color)` and `escapeHtml(truncateHazardLabel(...))` at the one shared call site (line reference corrected during 19-08 sign-off) | | | 19-04 |
| 21 | T-16-19/IN-08 | `validHazardColor`: strict 6-hex-digit regex, default `"aaaaaa"`; guards both the `color:#undefined` class and attribute injection | MMM-SPCOutlook.js:636-638 | MMM-SPCOutlook.js:259-261 — relocated verbatim above every render branch (WR-06), same body (line reference corrected during 19-08 sign-off — 19-05's `cigLabel`/`cigLabelFromTierString` reintroduction shifted this down 13 lines from its 19-04-era citation) | | | 19-04 |
| 22 | T-16-20/T-16-22 | `truncateHazardLabel`/`HAZARDS_LABEL_MAX_CHARS=60`, truncated **before** escaping (bounds source chars, not entity expansions) | MMM-SPCOutlook.js:623, MMM-SPCOutlook.js:627-632 | MMM-SPCOutlook.js:269-275 — relocated verbatim above every render branch (WR-06), same body; applied at the one shared compact-segment call site, MMM-SPCOutlook.js:746 (line references corrected during 19-08 sign-off) | | | 19-04 |
| 23 | D-01 (16) | Hazards Outlook weekday from `hazardsWeekdayFromDate(entry.date)` — resolved payload date, never `dowToText(dow+N)` | MMM-SPCOutlook.js:643-646 | MMM-SPCOutlook.js:282-285 — relocated verbatim above every render branch, now also driving the unified compact line's own weekday at MMM-SPCOutlook.js:722 (line references corrected during 19-08 sign-off) | | | 19-04 |
| 24 | WR-01 (16) | `HAZARDS_EXCLUDED_LABELS`/`HAZARDS_DROUGHT_LABELS`, folded via `hazardsLabelKey` (trim + collapse whitespace incl. U+00A0 + uppercase) — a second, fail-safe-only filter mirroring the backend's own exclusion | MMM-SPCOutlook.js:312-331 | MMM-SPCOutlook.js:509-528 — relocated verbatim above every render branch (WR-06, by 19-04/19-05); still consulted by `renderableWindowEntries` at the relocated band call site | | | 19-06 |
| 25 | D-02 (16) | Hazards day-grid: multiple same-day hazards joined `", "` in payload array order (no re-sort) | MMM-SPCOutlook.js:666-676 | MMM-SPCOutlook.js:613-627 (`daySurvivors`, order preserved, 18 D-15), MMM-SPCOutlook.js:741-752 (segments mapped and joined) — payload array order preserved (`daySurvivors`'s filter never re-sorts); separator is now `" · "` (U+00B7), not `", "` — an **intentional** RPT-02/UI-SPEC compact-line change, not a regression (line references corrected during 19-08 sign-off) | | | 19-04 — separator change is intentional, see Intentional Changes table |
| 26 | WR-04 (16) | Window-band heading `"Extended Hazards:"` written **once**, only if ≥1 renderable entry exists, from inside the loop after the first entry passes | MMM-SPCOutlook.js:686-703 | MMM-SPCOutlook.js:561-609 — `renderHazardsWindowBand` relocated into the combined band, called at MMM-SPCOutlook.js:810 with the promoted top-level `this.spcrisk.windowBand` array instead of the legacy `this.spcrisk.hazardsOutlook.windowBand`; the write-once heading logic (headingWritten flag, lines 578-582) is unchanged | | | 19-06 |
| 27 | D-06/D-08 (16) | Window-band entry: own observed span (never the layer's nominal window); weekday pair omitted (not NaN) if either date is unparseable; single-day `"(D3)"` vs. range `"(D3–7)"` formatting | MMM-SPCOutlook.js:704-729 | MMM-SPCOutlook.js:583-607 — same entry-loop body, unchanged, at the relocated call site | | | 19-06 |
| 28 | WR-06 (16) | Window-band `offsetStart`/`offsetEnd` coerced defensively (`off()` helper), falling back to `"?"` on non-finite | MMM-SPCOutlook.js:722-725 | MMM-SPCOutlook.js:600-604 — `off()` helper unchanged, at the relocated call site | | | 19-06 |
| 29 | D-03 (17) | HeatRisk render loop and no-risk gate term share **one** derivation (`heatRiskDaysToRender`), so a below-floor day can never disagree between gate and render | MMM-SPCOutlook.js:381-398, MMM-SPCOutlook.js:751-763 | MMM-SPCOutlook.js:613-627 — `heatRiskDaysToRender` is retired (`grep -c` returns `0`); the floor now lives inside `daySurvivors` itself (the same predicate the render-decision and render-body both call, per WR-04's rule), so there is only ever one call site to disagree with itself (line reference corrected during 19-08 sign-off) | | | 19-04 |
| 30 | D-01/D-02 (17) | `showMinorHeat` floor: 1 (minor+) vs. 2 (moderate+) default; `null` category never renders (distinct from category 0) | MMM-SPCOutlook.js:383-393 | MMM-SPCOutlook.js:621, MMM-SPCOutlook.js:624 — same 1-vs-2 floor, applied only to `source === "heatrisk"` entries inside `daySurvivors`; a `null` category still never reaches the payload at all (backend's own `NO_RISK_FLOOR`, unchanged), so it never reaches this check either (line references corrected during 19-08 sign-off) | | | 19-04 |
| 31 | HEAT (17) | HeatRisk row: `validHazardColor`/`escapeHtml` both applied (the one legacy render site that already does this correctly) | MMM-SPCOutlook.js:759-761 | MMM-SPCOutlook.js:745-746 — **closed by construction**, same one shared call site as row 20 (every dimension, not just HeatRisk, now applies both guards identically; line reference corrected during 19-08 sign-off) | | | 19-04 |
| 32 | (placement, no per-ID) | HeatRisk rendered after Winter Impact, before Hazards Outlook — deliberate near-term-then-longer-range grouping | MMM-SPCOutlook.js:743-750 | Closed by construction — the eight legacy per-product render sections that enforced this sequence by their own placement in `getDom()` are retired; every source's hazards now merge into one `day.hazards[]` array ordered by the backend's own `DIMENSION_ORDER` (18 D-15), consumed without re-sort by `daySurvivors()`/the segment map (MMM-SPCOutlook.js:613-627, 741-747) — there is no product-name-based ordering left anywhere in `getDom()` for a parity reviewer to check "HeatRisk after Winter, before Hazards Outlook" against | | | RESEARCH.md #32 — retired with the code it defended; superseded by 18 D-15's dimension-order rule, cross-checked end-to-end by the backend's own `merge-parity-unified-days-agree-with-legacy-blocks` scenario |
| 33 | PROXUI-05 | `PROX_MIN_WEIGHT = 0.1` noise floor; `weight.toFixed(1)` rounding in badge text | MMM-SPCOutlook.js:197, MMM-SPCOutlook.js:213-214, MMM-SPCOutlook.js:232 | MMM-SPCOutlook.js:200 (`PROX_MIN_WEIGHT`), MMM-SPCOutlook.js:225-236 (`hasRenderableProximity`), MMM-SPCOutlook.js:237-244 (`proximityBadge`) — carried forward verbatim, unchanged bodies, now feeding D-08's compact-line exception (`dayProximityOnly`, MMM-SPCOutlook.js:632-636) **and** (19-05) every detail-mode call site in `convectiveDetailAugment` (MMM-SPCOutlook.js:347-429) — the same unmodified `proximityBadge` reused for the categorical, tor/hail/wind, and day-3 cig badges, so the noise floor and rounding apply identically in detail mode (all line references corrected during 19-08 sign-off — 19-05's `cigLabel`/`cigLabelFromTierString` insertion shifted these) | | | 19-04, 19-05 |
| 34 | (day2-none bug, pre-ID) | `hasRenderableProximity`/`hasAnyRenderableProximity` predicates prevent a bare `(Day N): None` line from a sub-noise-floor proximity value | MMM-SPCOutlook.js:204-229 | MMM-SPCOutlook.js:632-636 — `hasAnyRenderableProximity` (the old day1-3 aggregate-of-four-fields form) is retired with the legacy day1/2/3 sections (`grep -c` returns `0`); `dayProximityOnly` is its unified-grid successor, preventing the same bare-line class for the compact line's single categorical-only exception (D-08). (19-05) Detail mode never re-derives this predicate either: every `proximityBadge()` call in `convectiveDetailAugment` (MMM-SPCOutlook.js:347-429) returns `""` on its own when the noise floor isn't cleared, so a sub-noise-floor detail badge silently contributes nothing to the label field rather than an empty arrow/paren (line reference corrected during 19-08 sign-off) | | | 19-04, 19-05 |
| 35 | ADVISORY_SOURCES (WR-09/CV-03) | `{spcMD: "showSPCMD", mpd: "showMPD"}` — the one place the frontend names `kml-advisory` registry rows; cannot be derived (browser context) | MMM-SPCOutlook.js:254 | MMM-SPCOutlook.js:292 — unchanged from HEAD (relocated above every render branch by 19-04); the combined band's advisory sub-section (MMM-SPCOutlook.js:789) reads it via `enabledAdvisories()`, same as before | | | 19-06 |

`New site`, `Run A`, and `Run B` are intentionally left empty above — they are filled by
19-04..19-06 (new-site line reference as each behavior lands in the rewritten renderer) and
19-08 (both manual-run columns, during sign-off).

## Backend-Only Provenance (footnote)

Not directly in `getDom()`, but payload-adjacent and worth recording so a parity reviewer does
not go looking for a `getDom()` behavior that was never there. These defects' *fixes* live
entirely in `node_helper.js` — `getDom()` only consumes their already-corrected effects, which
rows 3, 12-15, and 18 above already cover:

- **BUG-01** — SIGN detection (double-arrow syntax fix)
- **BUG-02** — Day 8 return-object shape fix
- **BUG-04** — `checkInPolygon` full-iteration fix
- **FWXT-05** — Day 3-8 fire weather URL/parsing (DN-based, confirmed live)
- **PROX-01** — `computeProximity()` distance-weighted helper (linear 40 km falloff, boundary-safe strict cap)
- **PROX-02** — `proximityWeighting` threading with strict-true coerce
- **PROX-05** — `_geoJsonCache` polygon→line memoization

## Ten Proximity Mode Call Sites

RESEARCH.md's Pitfall 4 names centralizing these ten inside/outside-mode decisions into one
shared predicate as the specific way a rewrite silently flips badge wording. Each per-hazard-type
mode is independent of the day's own categorical mode (PROXUI-03/04) — none of these ten may be
derived from another.

| # | Call site | Legacy source condition | Old site | New site (verified against current `MMM-SPCOutlook.js`) |
|---|-----------|--------------------------|----------|-----------------------------------------------------------|
| 1 | Day 1 categorical | `day1.risk == "NONE"` | MMM-SPCOutlook.js:543 | MMM-SPCOutlook.js:358 — `winner.label === "NONE" ? "outside" : "inside"` (`categoricalMode`), the unified equivalent of the legacy `risk == "NONE"` test; one shared expression, not duplicated per day |
| 2 | Day 1 torCig | `day1.torCig === 0` | MMM-SPCOutlook.js:546 | MMM-SPCOutlook.js:376 — `detail.torCig === 0 ? "outside" : "inside"` (`torMode`), condition unchanged |
| 3 | Day 1 hailCig | `day1.hailCig === 0` | MMM-SPCOutlook.js:547 | MMM-SPCOutlook.js:388 — `detail.hailCig === 0 ? "outside" : "inside"` (`hailMode`), condition unchanged |
| 4 | Day 1 windCig | `day1.windCig === 0` | MMM-SPCOutlook.js:548 | MMM-SPCOutlook.js:397 — `detail.windCig === 0 ? "outside" : "inside"` (`windMode`), condition unchanged |
| 5 | Day 2 categorical | `day2.risk == "NONE"` | MMM-SPCOutlook.js:554 | MMM-SPCOutlook.js:358 — same shared `categoricalMode` expression as call site 1; the unified day loop runs one generic path per day rather than a duplicated day-2 block, so there is no second, day-2-specific expression to drift from call site 1 |
| 6 | Day 2 torCig | `day2.torCig === 0` | MMM-SPCOutlook.js:557 | MMM-SPCOutlook.js:376 — same shared `torMode` expression as call site 2 |
| 7 | Day 2 hailCig | `day2.hailCig === 0` | MMM-SPCOutlook.js:558 | MMM-SPCOutlook.js:388 — same shared `hailMode` expression as call site 3 |
| 8 | Day 2 windCig | `day2.windCig === 0` | MMM-SPCOutlook.js:559 | MMM-SPCOutlook.js:397 — same shared `windMode` expression as call site 4 |
| 9 | Day 3 categorical | `day3.risk == "NONE"` | MMM-SPCOutlook.js:564 | MMM-SPCOutlook.js:358 — same shared `categoricalMode` expression, consumed a second time by the day-3 `hasCigOnly` branch at line 359/420 |
| 10 | Day 3 cig | `day3.cig === 0` | MMM-SPCOutlook.js:565 | MMM-SPCOutlook.js:416 — `detail.cig === 0 ? "outside" : "inside"` (`cigMode`), condition unchanged |

**Verification note (19-08):** the ten legacy per-day expressions collapse into five distinct physical expressions in the unified renderer (`categoricalMode` shared across days 1/2/3; `torMode`/`hailMode`/`windMode` each their own; `cigMode` its own) because the unified day loop runs one generic code path per day rather than duplicating a block per day number (19-05-SUMMARY's own recorded decision). This is the intended consequence of Phase 19's architecture, not a forbidden Pitfall-4 centralization — each of the five expressions is still its own independent test against that hazard type's own CIG/risk field, matching PROXUI-03/04's "independent of the day's own categorical mode" requirement (confirmed by the mutation-proven `proxui-per-type-badge-modes-are-independent-of-the-day-categorical-mode` scenario). All ten conditions verified live against the current source above; none derived from another.

## Intentional Changes (verified-expected, NOT regressions)

These five relocations/exceptions are Phase 19's own roadmap-mandated design, recorded here so a
parity reviewer files them as verified-intentional rather than investigating them as regressions
(RESEARCH.md Pitfall 3).

| ID | Change | Authority | Verified expected by |
|----|--------|-----------|------------------------|
| RPT-04-RELOC | SPC MD and WPC MPD advisories move from ABOVE the day rows (legacy `MMM-SPCOutlook.js:513-540`) to a band BELOW all day blocks, joined there by the Hazards Outlook window band (also relocated, from its own prior end-of-render position) — **IMPLEMENTED** at MMM-SPCOutlook.js:763-811 (advisories: 789-802, window band: 803-811); no unifying heading introduced, both sub-sections' internal wording/ordering/colors/escaping unchanged | ROADMAP Phase 19 success criterion 4 / RPT-04 / UI-SPEC "The Band" | 19-06 (implemented); 19-08 sign-off, Run B |
| D-07-RELOC | The categorical proximity badge and the SPC tornado/hail/wind probabilistic breakdown move from the compact (default) line to detail mode only — at default config a user sees neither. This is a relocation, not a removal: both are fully present in detail mode, and D-04's auto-expand surfaces them without reconfiguration | CONTEXT.md D-07 | 19-08 sign-off, Run B (detail mode) |
| D-03-SKIP | Days with no surviving hazard render no row and no marker, so the rendered day list is non-contiguous (e.g. Day 3, Day 6, Day 9) | CONTEXT.md D-03 | 19-08 sign-off, Run B |
| D-08-EXC | Deliberate exception to D-03/D-07: with `proximityWeighting: true`, a day with no surviving hazard still renders, badge alone, so the shipped v1.2 PROXUI outside-mode behavior is not lost at default config | CONTEXT.md D-08 | 19-08 sign-off, Run B (`proximityWeighting: true`) |
| SIGN-NOOP | `detail.sign` (grid days 4-8's `{probRisk, sign}` shape) remains unrendered by `convectiveDetailAugment` — no glyph, no sub-line, no new UI. No shipped `getDom()`, at any milestone, has ever rendered `sign` | RESEARCH.md Open Question 3 (unanswered) — surfacing `sign` would be a new-feature decision outside this parity-gated phase's display-only framing | plan 19-05 (`grep -c "detail\.sign" MMM-SPCOutlook.js` → 0 outside comments); 19-08 sign-off, Run B (days 4-8 render plain label only) |

## Probe Coverage

Every scenario name cited below was verified present via `grep -n "name: \"<scenario>\"" scripts/probe-payload-resilience.js` against the current file, run at `19-08` sign-off time (probe suite green at `154 passed, 0 failed, 0 skipped`). `MANUAL ONLY` marks a row the harness structurally cannot observe — these are the operator's real worklist for the two mandatory manual runs in Task 2, not a gap in this plan's own work.

| # | Behavior | Probe coverage |
|---|----------|-----------------|
| 1 | Loading passthrough | `MANUAL ONLY` — no scenario in `scripts/probe-payload-resilience.js` exercises `getDom()`'s `!this.spcrisk` branch at all; every frontend scenario constructs a payload before rendering. Trivial, hardcoded, single-line string assignment with no XSS surface (never reaches `innerHTML` with anything but a literal), but genuinely unobserved by the suite. |
| 2 | Error passthrough | `MANUAL ONLY` — same as row 1; no scenario constructs `{ error: ... }` and renders it. Uses `textContent`, not `innerHTML`, so there is no escaping concern to mutation-prove even if a scenario existed. |
| 3 | BUG-03 (retired term) | `merge-summary-all-quiet-is-an-all-clear` (proves `summary.anyHazard` is the sole backend-computed no-risk signal that replaced the retired term), `frontend-follows-the-payload-day-span-not-a-hardcoded-one` (proves no day-span literal, including a day-48-style boundary, survives in `getDom()`) |
| 4 | CR-01 staleness disqualifier | `rpt05-stale-quiet-payload-renders-unconfirmed-under-the-badge` |
| 5 | FWXT-03 (retired term) | Same as row 3 — `merge-summary-all-quiet-is-an-all-clear`, `frontend-follows-the-payload-day-span-not-a-hardcoded-one` |
| 6 | WR-08 day span from payload keys | `frontend-follows-the-payload-day-span-not-a-hardcoded-one` |
| 7 | WR-09 advisory gate is per-toggle | `frontend-advisory-band-respects-its-config-toggles` |
| 8 | WR-04 `_staleAsOf`/`moment().fromNow()` age rendering | `MANUAL ONLY` — the probe harness's `moment` stub (`scripts/probe-lib/module-stubs.js:271`) is `(_ts) => ({ fromNow: () => "PROBE_AGE" })`, a constant regardless of input; `grep -n "PROBE_AGE" scripts/probe-payload-resilience.js` returns no assertion anywhere. `rpt05-stale-quiet-payload-renders-unconfirmed-under-the-badge` proves the badge itself renders, but the real relative-time string and the omit-suffix-when-non-finite branch are structurally unobservable by this harness — disclosed here per 15 D-10/T-15-05, same class as the 19-05 whitespace disclosure below. |
| 9 | CR-01 `contentMarker` fallback | `rpt05-stale-quiet-payload-renders-unconfirmed-under-the-badge`, `frontend-total-outage-still-shows-the-outage` |
| 10 | Advisory band ordering/wording | `frontend-escapes-remote-advisory-text` (wording/escaping), `rpt04-band-renders-below-every-day-block` (SPC-MD-before-WPC-MPD ordering assertion) |
| 11 | Advisory `escapeHtml` guards | `frontend-escapes-remote-advisory-text`, `rpt04-band-escapes-remote-advisory-and-window-band-text` |
| 12 | Day 1/2 categorical badge relocation (D-07-RELOC) | `rpt03-detail-mode-renders-source-labeled-sub-rows-under-the-compact-header`, `proxui-per-type-badge-modes-are-independent-of-the-day-categorical-mode` |
| 13 | Day 1/2 probabilistic breakdown line | `rpt03-detail-shape-days-1-2-renders-the-full-icon-line` |
| 14 | Day 1/2 per-hazard-type proximity badges | `proxui-per-type-badge-modes-are-independent-of-the-day-categorical-mode` |
| 15 | Day 3 dual badge join rule | `rpt03-day3-dual-badge-joins-only-when-both-badges-are-non-empty` |
| 16 | Day 3 inline CIG glyph, no breakdown line | `rpt03-detail-shape-day-3-renders-one-inline-cig-and-no-icon-line` |
| 17 | Days 4-8 asymmetry (no proximity badges) | `rpt03-detail-shape-extended-days-render-plain-label-only` |
| 18 | Fire weather day-span/color (retired dedicated code) | `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color`, `rpt02-compact-line-renders-dimension-worded-dot-separated-segments` (generic call-site proof — fire weather shares the one call site every dimension uses), `merge-sources-spc-fire-reporting-tracks-answering-not-finding` (backend day-span/gate correctness) |
| 19 | `renderDayBlock`/`dayRiskCount` retirement | `frontend-follows-the-payload-day-span-not-a-hardcoded-one` |
| 20 | WR-02 closure (validHazardColor + escapeHtml at the one shared call site) | `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color` |
| 21 | `validHazardColor` guard | `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color` (color-fallback assertion) |
| 22 | `truncateHazardLabel`/60-char truncation before escaping | `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color` (its second assertion: a 200-char label truncates to exactly 55 source chars + `…`, verified truncate-before-escape) |
| 23 | Weekday from `hazardsWeekdayFromDate`, never `dowToText(dow+N)` | `rpt02-compact-line-renders-dimension-worded-dot-separated-segments` (exercises the compact line's weekday derivation), `hazards-weekend-poll-of-fridays-file-is-not-stale` (backend date-resolution correctness feeding the same helper) |
| 24 | `HAZARDS_EXCLUDED_LABELS`/`HAZARDS_DROUGHT_LABELS` fail-safe filter | `hazards-frontend-renders-no-flooding-or-drought-at-the-default` |
| 25 | Hazards day-grid order preserved, `" · "` separator | `rpt02-compact-line-renders-dimension-worded-dot-separated-segments` |
| 26 | `"Extended Hazards:"` heading written once | `rpt04-extended-hazards-heading-is-written-once-and-only-when-an-entry-renders` |
| 27 | Window-band entry span/weekday/offset formatting | `rpt04-band-renders-below-every-day-block` (ordering/landmarks), `merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block` (span correctness feeding the same renderer) |
| 28 | `off()` defensive coercion | `rpt04-band-escapes-remote-advisory-and-window-band-text` (exercises `off()` alongside the color/escape guards on the same window-band entry) |
| 29 | HeatRisk render/gate share one derivation | `frontend-heatrisk-only-is-not-an-all-clear` |
| 30 | `showMinorHeat` 1-vs-2 floor | `frontend-heatrisk-minor-floor-is-not-a-blank-module` |
| 31 | HeatRisk `validHazardColor`/`escapeHtml` (closed by construction) | `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color` (generic call-site proof — HeatRisk shares the one call site every dimension uses) |
| 32 | HeatRisk placement (retired product-ordering; superseded by dimension order) | `merge-parity-unified-days-agree-with-legacy-blocks` (cross-checks unified `days[]` ordering against the legacy per-product blocks end to end) |
| 33 | `PROX_MIN_WEIGHT`/`toFixed(1)` noise floor and rounding | `rpt03-unified-grid-carries-spc-proximity-subtree`, `rpt03-unified-grid-keeps-proximity-on-a-no-risk-day`, `rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap`, `proxui-per-type-badge-modes-are-independent-of-the-day-categorical-mode` |
| 34 | Sub-noise-floor proximity never leaves a bare/empty line | `rpt02-proximity-only-day-renders-badge-alone-with-a-two-space-gap`, `rpt03-detail-shape-days-1-2-renders-the-full-icon-line` (per-type badges silently contribute nothing below the floor) |
| 35 | `ADVISORY_SOURCES` mapping | `frontend-advisory-band-respects-its-config-toggles` |

### Carried-forward zero-RED / weakened-proof disclosures (19-02 through 19-07)

These four items are structurally unprovable by the mutation-testing harness or were confirmed by a wider-blast-radius mutation rather than a narrowly-scoped one. Each is `MANUAL ONLY` (or explicitly weaker-than-usual proof) regardless of what row above cites a real scenario name for the surrounding behavior — none of the scenarios cited above claim to close these specific gaps:

1. **19-05 — `white-space: pre-wrap` removal produced ZERO red scenarios.** `MANUAL ONLY`. Presentation-only CSS is structurally outside the probe harness's reach — the DOM stub (`scripts/probe-lib/module-stubs.js`) is a flat object and cannot observe HTML whitespace collapsing in a real browser. This is a recorded **BLOCKING** constraint for this phase (19-05-SUMMARY.md, Mutation 2). Affects: the two-space gap in the compact line and the D-08 proximity-only line (row 25's separator, the D-08 exception's own two-space gap), and every detail-mode column's space-padding (rows 12-17's field alignment) — the DejaVu Sans Mono monospace font-family override and the column alignment it produces are equally `MANUAL ONLY` for the same reason, since no scenario can observe whether a browser's column grid actually renders aligned.
2. **19-03 — two specified mutations had zero reachable effect** through the real fixture pipeline (`_resolveGridDayAutoExpand`'s suppression-skip and non-numeric-value guards), because every non-`SIGNIFICANCE_NEVER` source is always rank-1 in its own `PRECEDENCE[dimension]` array — a real end-to-end fixture can never construct a suppressed, non-`wpc-hazards` entry. Direct-call assertions against `_resolveGridDayAutoExpand` with synthetic inputs stand in their place (`rpt02-autoexpand-ignores-suppressed-and-never-triggering-entries`, the two supplementary assertions documented in 19-03-SUMMARY.md Deviations) — a **weaker proof form** than the harness's usual full-pipeline convention, disclosed rather than silently counted as a normal mutation-proven scenario. Affects row 32's dimension-order claim indirectly (auto-expand triggering is a D-04 concern, not directly one of the 35 rows, but the same structural limitation applies to any future row touching suppression-driven auto-expand).
3. **19-06 — `rpt04-band-only-payload-is-not-an-all-clear` was CONFIRMED rather than newly mutation-proven**, riding mutation 5's wider blast radius (re-pointing the band's call site at the legacy `hazardsOutlook.windowBand` also broke this scenario, 7/150 failures, all individually diagnosable) rather than a mutation individually scoped to it. **Weaker proof form** — the mutation is diagnosable but not narrowly targeted. Affects row 9 indirectly (the band-only-is-not-an-all-clear scenario is the closest coverage to "a band-only payload still reaches the main render branch," adjacent to but not identical to row 9's `contentMarker` fallback, which has its own directly-targeted scenario above).
4. **19-07 — the IN-01 pipe collision could not be reproduced end-to-end.** `offsetStart`/`offsetEnd` are always plain integers (backed by an exhaustive brute-force check across realistic ranges, 19-07-SUMMARY.md), so a real collision is structurally unreachable through the actual pipeline. `in01-window-band-labels-containing-a-pipe-do-not-collide` is a precondition proof plus a static source-inspection assertion, not a live reproduction — **hardening against a latent hazard, not a fixed live defect**. This is backend-only (`node_helper.js:939`) and does not correspond to any of the 35 `getDom()` behavior rows above; it is the mechanism behind row 27/28's window-band entries never colliding on screen, but is disclosed here rather than folded into row 27/28's own (accurately scenario-backed) coverage.



Per 15 D-10: the probe suite (`node scripts/probe-payload-resilience.js`) is proof of mechanism —
each scenario is individually mutation-proven. These two manual runs are proof of live behavior
against the real rendered mirror. **Neither substitutes for the other.**

### Run A — "no risk anywhere"

```js
{
  module: "MMM-SPCOutlook",
  position: "top_left",
  config: {
    lat: <coordinate with no active hazard from any source>,
    lon: <coordinate with no active hazard from any source>,
    extended: true,
    updateInterval: 60,
    proximityWeighting: false,
    dayReportDetail: false,
    showExcessiveRain: true,
    showWinterImpact: true,
    showMPD: true,
    showHazardsOutlook: true,
    showHeatRisk: true,
    showSPCMD: true
  }
}
```

How to reach the state: pick a coordinate that today (or over a short observation window) has no
SPC convective risk, no active fire weather, no ERO/WSSI/HazardsOutlook/HeatRisk hazard, and no
live SPC MD or WPC MPD covering it. Confirm via the backend's own logged payload before reading
the display, not by inference from the config alone.

Expected observations:

1. Exactly one line of rendered content.
2. The literal string `No Severe Weather Risk` if the payload is not stale (row 9's confident
   all-clear branch), OR the literal string `No Severe Weather Risk (unconfirmed)` if
   `this.spcrisk._stale` is true (row 9's degraded branch) — record which of the two appeared and
   whether `_stale` was set.
3. Zero day rows (rows 12, 15, 17, 18, 19 must all produce nothing).
4. Zero band lines (row 10, row 26/27 — no advisory line, no `Extended Hazards:` heading).
5. No bare `⚠` badge with nothing beneath it (row 4, CR-01) — if `_stale` fires, the
   `(unconfirmed)` string must be present underneath it, never a dangling badge alone.

### Run B — "everything active at once"

```js
{
  module: "MMM-SPCOutlook",
  position: "top_left",
  config: {
    lat: <coordinate inside an active SPC convective risk area>,
    lon: <coordinate inside an active SPC convective risk area>,
    extended: true,
    updateInterval: 60,
    proximityWeighting: true,
    dayReportDetail: true,
    showExcessiveRain: true,
    showWinterImpact: true,
    showMPD: true,
    showHazardsOutlook: true,
    showHeatRisk: true,
    showSPCMD: true
  }
}
```

How to reach the state: move the coordinate into an active SPC convective outlook polygon during
a period with a live SPC MD and/or WPC MPD covering the same area (verify with a point-in-polygon
check against the live KMZ/GeoJSON, not a bounding-box approximation — Phase 15's operating
procedure documents why a bbox check is insufficient). Restore the real coordinate after the run.

Expected observations, each cross-referenced to a preserved-behavior row above:

1. Compact `Day N (Weekday)` header lines, two literal spaces and ` · ` separators between
   hazard segments (new unified-report layout; the legacy analog is row 12's Day 1/Day 2 line
   format, now merged with every other enabled source on the same day).
2. Dimension sub-rows with `— {Source}` attribution when `dayReportDetail: true` (D-05's grouped
   sub-row layout; the categorical proximity badge and probabilistic breakdown that appear here
   are row 12's and row 14's content, relocated per D-07-RELOC).
3. The tornado/hail/wind icon line present on days 1-2 only, absent on day 3 and days 4-8 (row
   13's per-hazard-type breakdown, and row 17's "no proximity badges for days 4-8" asymmetry).
4. A single combined CIG glyph inline in the day-3 label field, no separate breakdown line (row
   16).
5. No probabilistic sub-line on days 4-8 (row 17).
6. The band below all day blocks containing the SPC MD / WPC MPD lines (row 10, row 11's escaping)
   then the `Extended Hazards:` heading (row 26) with the window-band entries beneath it (row 27,
   row 28's offset coercion), per RPT-04-RELOC.
7. The stale badge (row 8) at the very top of all content, before any day block and before the
   band, if `_stale` is set on the payload during the run.
8. The noise-floor rounding (row 33, `weight.toFixed(1)`) visible on any rendered proximity badge
   value — no un-rounded floating point value should ever appear.

## Sign-Off

- [ ] All 35 preserved-behavior rows above have both `Run A` and `Run B` columns ticked.
- [ ] All 5 intentional-change rows (`RPT-04-RELOC`, `D-07-RELOC`, `D-03-SKIP`, `D-08-EXC`,
      `SIGN-NOOP`) confirmed observed-and-expected during Run A and/or Run B as applicable.
      (Corrected from 4 to 5 during 19-08 sign-off reconciliation — `SIGN-NOOP` was added to the
      `## Intentional Changes` table by plan 19-05 but this checkbox line was not updated at the
      time.)
- [ ] `node scripts/probe-payload-resilience.js` reports `0 failed, 0 skipped` at time of sign-off.
- [ ] Operator name: ______________________
- [ ] Date: ______________________
