---
phase: 19
requirement: RPT-06
status: open
baseline_probe_result: "123 passed, 0 failed, 0 skipped"
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
| 1 | (loading) | `!this.spcrisk` → literal `"Loading SPC Outlook..."` via `innerHTML` (hardcoded string, safe) | MMM-SPCOutlook.js:419-420 | | | | RESEARCH.md #1 |
| 2 | (error) | `this.spcrisk.error` → `"Error: " + error` via `textContent` (never `innerHTML`) | MMM-SPCOutlook.js:421-422 | | | | RESEARCH.md #2 |
| 3 | BUG-03 | No-risk gate term: `!(extended && day48Risk)` | MMM-SPCOutlook.js:437 | | | | RESEARCH.md #3 |
| 4 | CR-01 | Staleness (`!this.spcrisk._stale`) disqualifies the whole no-risk short-circuit — a degraded read is never an all-clear | MMM-SPCOutlook.js:430 | | | | RESEARCH.md #4 |
| 5 | FWXT-03 | No-risk gate extended for fire weather days 1-2 (unconditional) and days 3-8 (extended-gated) | MMM-SPCOutlook.js:438-446 | | | | RESEARCH.md #5 |
| 6 | WR-08 | ERO/WSSI/HazardsOutlook/HeatRisk no-risk gate terms all derive their day span from the block's own keys, never a literal count | MMM-SPCOutlook.js:453-476 | | | | RESEARCH.md #6 |
| 7 | WR-09 | Advisory no-risk gate term is per-toggle (`enabledAdvisories().length > 0`), not unconditional | MMM-SPCOutlook.js:488 | | | | RESEARCH.md #7 |
| 8 | WR-04 | `_staleAsOf` renders real cached-reading age via `moment(asOf).fromNow()`; omits the age suffix (not the badge) when `asOf` isn't a finite number | MMM-SPCOutlook.js:494-505 | | | | RESEARCH.md #8 |
| 9 | CR-01 | `contentMarker` pattern: if nothing rendered after the stale badge, fall back to `"No Severe Weather Risk (unconfirmed)"`, distinct from the confident all-clear | MMM-SPCOutlook.js:512, MMM-SPCOutlook.js:778-779 | | | | RESEARCH.md #9 |
| 10 | D-05/D-06 (15) | Advisory band: SPC MD then WPC MPD, in that concatenation order; each line `label [+ " — " + hazardType] + " in effect."` | MMM-SPCOutlook.js:513-540 | | | | RESEARCH.md #10 |
| 11 | WR-12 | Advisory `label`/`hazardType` pass through `escapeHtml` before reaching `innerHTML` | MMM-SPCOutlook.js:532, MMM-SPCOutlook.js:537 | | | | RESEARCH.md #11 |
| 12 | PROXUI-01, PROXUI-02 | Day 1/Day 2 rows: colored risk text + `proximityBadge(categorical, mode)`, mode = `risk=="NONE" ? "outside" : "inside"` | MMM-SPCOutlook.js:541-561 | | | | RESEARCH.md #12 |
| 13 | FWXT (implicit, pre-ID) | Day 1/Day 2 probabilistic breakdown line (tornado/hail/wind icons + `cigLabel` + percentage), only emitted when `probRisk` is true, only per-hazard-type when that type's risk > 0 | MMM-SPCOutlook.js:544-561 | | | | RESEARCH.md #13 |
| 14 | PROXUI-03/04 | Day 1/2 per-hazard-type proximity badges: `torCig`/`hailCig`/`windCig`, mode = `own CIG === 0 ? "outside" : "inside"` (independent per hazard type, NOT tied to the day's categorical mode) | MMM-SPCOutlook.js:546-548, MMM-SPCOutlook.js:557-559 | | | | RESEARCH.md #14 |
| 15 | PROXUI-04 | Day 3 dual badge: categorical AND cig badges both computed; joined with `";"` only if both are non-empty (`day3DualSep`) | MMM-SPCOutlook.js:562-569 | | | | RESEARCH.md #15 |
| 16 | (day 3, no per-ID) | Day 3 appends `cigLabel(day3.cig)` directly into the risk-text span (no separate icon breakdown line — day 3 has no tornado/hail/wind percentages at all) | MMM-SPCOutlook.js:567 | | | | RESEARCH.md #16 |
| 17 | (extended days, no per-ID) | Days 4-8 gate is `probRisk` (not `risk != NONE`), plain colored text only, no proximity badges at all for this range (asymmetry vs. days 1-3) | MMM-SPCOutlook.js:570-577 | | | | RESEARCH.md #17 |
| 18 | FWXT-01/02/03/04 | Fire weather days 1-2 unconditional, days 3-8 `extended`-gated; `fireRiskToColor` lookup (`{0:"aaaaaa",1:"FF7F00",2:"FF0000",3:"FF00FF"}`); gate is `day{N}Risk > 0` | MMM-SPCOutlook.js:578-598 | | | | RESEARCH.md #18 |
| 19 | WR-08 | `renderDayBlock` (ERO/WSSI): day span from `dayRiskCount` (counts `day{N}Risk` keys), strict `!== "NONE"` | MMM-SPCOutlook.js:604-614 | | | | RESEARCH.md #19 |
| 20 | WR-02 | `renderDayBlock` interpolates `day{N}Color`/`day{N}Text` into `innerHTML` with **no** `validHazardColor`/`escapeHtml` — not exploitable today (module-authored lookup tables), but the new unified renderer must not repeat this omission for any field, since `wpc-hazards` can carry pass-through remote text | MMM-SPCOutlook.js:604-614 | | | | RESEARCH.md #20 |
| 21 | T-16-19/IN-08 | `validHazardColor`: strict 6-hex-digit regex, default `"aaaaaa"`; guards both the `color:#undefined` class and attribute injection | MMM-SPCOutlook.js:636-638 | | | | RESEARCH.md #21 |
| 22 | T-16-20/T-16-22 | `truncateHazardLabel`/`HAZARDS_LABEL_MAX_CHARS=60`, truncated **before** escaping (bounds source chars, not entity expansions) | MMM-SPCOutlook.js:623, MMM-SPCOutlook.js:627-632 | | | | RESEARCH.md #22 — corrected from RESEARCH.md's `:623-631` to include the function's closing brace at `:632` |
| 23 | D-01 (16) | Hazards Outlook weekday from `hazardsWeekdayFromDate(entry.date)` — resolved payload date, never `dowToText(dow+N)` | MMM-SPCOutlook.js:643-646 | | | | RESEARCH.md #23 — corrected from `:639-646` to the function's own span (639-642 are comment lines only) |
| 24 | WR-01 (16) | `HAZARDS_EXCLUDED_LABELS`/`HAZARDS_DROUGHT_LABELS`, folded via `hazardsLabelKey` (trim + collapse whitespace incl. U+00A0 + uppercase) — a second, fail-safe-only filter mirroring the backend's own exclusion | MMM-SPCOutlook.js:312-331 | | | | RESEARCH.md #24 |
| 25 | D-02 (16) | Hazards day-grid: multiple same-day hazards joined `", "` in payload array order (no re-sort) | MMM-SPCOutlook.js:666-676 | | | | RESEARCH.md #25 |
| 26 | WR-04 (16) | Window-band heading `"Extended Hazards:"` written **once**, only if ≥1 renderable entry exists, from inside the loop after the first entry passes | MMM-SPCOutlook.js:686-703 | | | | RESEARCH.md #26 |
| 27 | D-06/D-08 (16) | Window-band entry: own observed span (never the layer's nominal window); weekday pair omitted (not NaN) if either date is unparseable; single-day `"(D3)"` vs. range `"(D3–7)"` formatting | MMM-SPCOutlook.js:704-729 | | | | RESEARCH.md #27 |
| 28 | WR-06 (16) | Window-band `offsetStart`/`offsetEnd` coerced defensively (`off()` helper), falling back to `"?"` on non-finite | MMM-SPCOutlook.js:722-725 | | | | RESEARCH.md #28 |
| 29 | D-03 (17) | HeatRisk render loop and no-risk gate term share **one** derivation (`heatRiskDaysToRender`), so a below-floor day can never disagree between gate and render | MMM-SPCOutlook.js:381-398, MMM-SPCOutlook.js:751-763 | | | | RESEARCH.md #29 — corrected from `:750-763` to start at the `for` loop (`:751`); `:750` is the enclosing `if (this.config.showHeatRisk)` |
| 30 | D-01/D-02 (17) | `showMinorHeat` floor: 1 (minor+) vs. 2 (moderate+) default; `null` category never renders (distinct from category 0) | MMM-SPCOutlook.js:383-393 | | | | RESEARCH.md #30 |
| 31 | HEAT (17) | HeatRisk row: `validHazardColor`/`escapeHtml` both applied (the one legacy render site that already does this correctly) | MMM-SPCOutlook.js:759-761 | | | | RESEARCH.md #31 |
| 32 | (placement, no per-ID) | HeatRisk rendered after Winter Impact, before Hazards Outlook — deliberate near-term-then-longer-range grouping | MMM-SPCOutlook.js:743-750 | | | | RESEARCH.md #32 |
| 33 | PROXUI-05 | `PROX_MIN_WEIGHT = 0.1` noise floor; `weight.toFixed(1)` rounding in badge text | MMM-SPCOutlook.js:197, MMM-SPCOutlook.js:213-214, MMM-SPCOutlook.js:232 | | | | RESEARCH.md #33 |
| 34 | (day2-none bug, pre-ID) | `hasRenderableProximity`/`hasAnyRenderableProximity` predicates prevent a bare `(Day N): None` line from a sub-noise-floor proximity value | MMM-SPCOutlook.js:204-229 | | | | RESEARCH.md #34 |
| 35 | ADVISORY_SOURCES (WR-09/CV-03) | `{spcMD: "showSPCMD", mpd: "showMPD"}` — the one place the frontend names `kml-advisory` registry rows; cannot be derived (browser context) | MMM-SPCOutlook.js:254 | | | | RESEARCH.md #35 |

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

| # | Call site | Legacy source condition | Old site |
|---|-----------|--------------------------|----------|
| 1 | Day 1 categorical | `day1.risk == "NONE"` | MMM-SPCOutlook.js:543 |
| 2 | Day 1 torCig | `day1.torCig === 0` | MMM-SPCOutlook.js:546 |
| 3 | Day 1 hailCig | `day1.hailCig === 0` | MMM-SPCOutlook.js:547 |
| 4 | Day 1 windCig | `day1.windCig === 0` | MMM-SPCOutlook.js:548 |
| 5 | Day 2 categorical | `day2.risk == "NONE"` | MMM-SPCOutlook.js:554 |
| 6 | Day 2 torCig | `day2.torCig === 0` | MMM-SPCOutlook.js:557 |
| 7 | Day 2 hailCig | `day2.hailCig === 0` | MMM-SPCOutlook.js:558 |
| 8 | Day 2 windCig | `day2.windCig === 0` | MMM-SPCOutlook.js:559 |
| 9 | Day 3 categorical | `day3.risk == "NONE"` | MMM-SPCOutlook.js:564 |
| 10 | Day 3 cig | `day3.cig === 0` | MMM-SPCOutlook.js:565 |
