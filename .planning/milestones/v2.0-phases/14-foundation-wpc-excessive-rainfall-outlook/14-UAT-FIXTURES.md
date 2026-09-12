# Phase 14 Plan 05: WPC ERO UAT Fixtures

**Generated:** 2026-08-19T14:41:33.487Z (UTC)

## Staleness Warning

WPC Excessive Rainfall Outlook (ERO) polygons are reissued on a cycle — Day 1's window is a
partial `01Z-12Z` (or in this issuance, `12Z-12Z`) window and can update multiple times per day;
Days 2-5 update at least once daily. The coordinates and expected tiers below were derived by
querying the live layers and running `turf.booleanPointInPolygon` against the actual returned
geometry **at the timestamp above**. **Regenerate these fixtures if more than a few hours have
passed since generation** — a polygon that covered the inside-point at generation time may no
longer cover it, which would produce a false failure of UAT criterion 3, and a new polygon could
appear over the outside-point, which would produce a false failure of criterion 4.

Regeneration method: fetch `PRODUCT_REGISTRY.excessiveRain.buildUrl(1..5)`, run
`turf.booleanPointInPolygon` for each candidate point against every returned feature on every
day, and re-derive the two locations below from the live result rather than reusing this file's
numbers past their freshness window.

## Inside-Polygon Location

**Coordinates:** lat `31.88325443422137`, lon `-111.53990732097623` (southern Arizona, derived
as `turf.pointOnFeature()` of a live Day 1 `dn: 2` ERO polygon feature, confirmed inside the
returned polygon set on all five days by `turf.booleanPointInPolygon`)

This point happens to fall inside at least one polygon on **every** one of Days 1-5 in this
issuance (not just one day) — a stronger fixture than strictly required, useful because it
exercises criterion 3 across the full Day 1-5 range in a single UAT pass.

### Turf containment command output (recorded verbatim)

```
Timestamp: 2026-08-19T14:41:33.487Z

Day 1: INSIDE booleanPointInPolygon=true dn=2 tier=SLGT text=Slight color=f7f690 | OUTSIDE booleanPointInPolygon=false | valid_time=["12Z 08/19/26 - 12Z 08/20/26"]
Day 2: INSIDE booleanPointInPolygon=true dn=1 tier=MRGL text=Marginal color=7ac687 | OUTSIDE booleanPointInPolygon=false | valid_time=["12Z 08/20/26 - 12Z 08/21/26"]
Day 3: INSIDE booleanPointInPolygon=true dn=1 tier=MRGL text=Marginal color=7ac687 | OUTSIDE booleanPointInPolygon=false | valid_time=["12Z 08/21/26 - 12Z 08/22/26"]
Day 4: INSIDE booleanPointInPolygon=true dn=1 tier=MRGL text=Marginal color=7ac687 | OUTSIDE booleanPointInPolygon=false | valid_time=["12Z 08/22/26 - 12Z 08/23/26"]
Day 5: INSIDE booleanPointInPolygon=true dn=1 tier=MRGL text=Marginal color=7ac687 | OUTSIDE booleanPointInPolygon=false | valid_time=["12Z 08/23/26 - 12Z 08/24/26"]
```

Command used `PRODUCT_REGISTRY.excessiveRain.buildUrl(d)`, `PRODUCT_REGISTRY.excessiveRain.toValue`,
`PRODUCT_REGISTRY.excessiveRain.valueToTier`, `.tierToText`, and `.tierToColor` — the exact
functions and maps `node_helper.js`'s `getSpcOutlook` calls — plus `turf.booleanPointInPolygon`,
the exact containment function `extractPolygons`/`evaluatePolygons` use, so this fixture cannot
disagree with the implementation (T-14-02).

### Expected per-day result (inside point)

| Day | Raw `dn` | Expected `dayNRisk` | Expected `dayNText` | Expected `dayNColor` | `dayNValidTime` |
|-----|----------|----------------------|-----------------------|------------------------|-------------------|
| 1 | 2 | `SLGT` | `Slight` | `f7f690` | `12Z 08/19/26 - 12Z 08/20/26` |
| 2 | 1 | `MRGL` | `Marginal` | `7ac687` | `12Z 08/20/26 - 12Z 08/21/26` |
| 3 | 1 | `MRGL` | `Marginal` | `7ac687` | `12Z 08/21/26 - 12Z 08/22/26` |
| 4 | 1 | `MRGL` | `Marginal` | `7ac687` | `12Z 08/22/26 - 12Z 08/23/26` |
| 5 | 1 | `MRGL` | `Marginal` | `7ac687` | `12Z 08/23/26 - 12Z 08/24/26` |

Expected rendered lines (`Excessive Rain (Day N): <text>` form, plan 14-04):
```
Excessive Rain (Day 1): Slight
Excessive Rain (Day 2): Marginal
Excessive Rain (Day 3): Marginal
Excessive Rain (Day 4): Marginal
Excessive Rain (Day 5): Marginal
```
All five days are non-`NONE` at this location, so "No Severe Weather Risk" must NOT appear
(assuming nothing else is active at these coordinates) — see the no-risk gate truth table in
`14-04-SUMMARY.md`, case (c).

## Outside-All-Polygons Location

**Coordinates:** lat `47.61`, lon `-122.33` (Seattle, WA — re-confirmed outside every ERO polygon
on all five days at fixture-generation time, not reused from an earlier session's assumption)

### Turf containment command output (recorded verbatim)

Same command run as above, same timestamp — `OUTSIDE booleanPointInPolygon=false` on all five
days (see the combined output block above; each line's `OUTSIDE` field is `false`).

### Expected per-day result (outside point)

| Day | Expected `dayNRisk` | Expected `dayNText` | Expected `dayNColor` | `dayNValidTime` |
|-----|-----------------------|------------------------|-------------------------|-------------------|
| 1 | `NONE` | `None` | `afddf6` | `12Z 08/19/26 - 12Z 08/20/26` |
| 2 | `NONE` | `None` | `afddf6` | `12Z 08/20/26 - 12Z 08/21/26` |
| 3 | `NONE` | `None` | `afddf6` | `12Z 08/21/26 - 12Z 08/22/26` |
| 4 | `NONE` | `None` | `afddf6` | `12Z 08/22/26 - 12Z 08/23/26` |
| 5 | `NONE` | `None` | `afddf6` | `12Z 08/23/26 - 12Z 08/24/26` |

`dayNValidTime` is **non-null** on every day even though the tier is `NONE` — this is the
distinction that separates "outside the polygon, fetch succeeded" from "the fetch failed". A
`null` `valid_time` at this location would itself be a bug (ERO-03 evidence, per `14-03-SUMMARY.md`'s
identical finding at these same coordinates).

Expected rendered lines: **none** — zero `Excessive Rain (Day N)` lines should appear. If nothing
else is active at these coordinates, "No Severe Weather Risk" **should** appear (no-risk gate
truth table case (b)).

## HIGH Tier Note

No live `dn: 4` (HIGH) feature was observed in any of Days 1-5 at fixture-generation time
(observed `dn` values this issuance: `{1, 2}` only). This is consistent with every prior research
and probe session in this phase (`14-01-SUMMARY.md`, `14-03-SUMMARY.md`) — HIGH has never been
live-observed across the whole phase. Per the plan's `planner_resolutions`, HIGH's correctness is
verified **structurally**, not by live observation: `PRODUCT_REGISTRY.excessiveRain.valueToTier[4]
=== "HIGH"` and `tierToText.HIGH === "High"` were confirmed by source assertion in plan 14-01's
Task 2. Its absence from this fixture file is expected and is **not** a gap — do not treat "no
HIGH day found" as a UAT failure.

## Config Scenarios

All four scenarios below reference only real `defaults:` keys confirmed present in
`MMM-SPCOutlook.js` (`lat`, `lon`, `extended`, `updateInterval`, `proximityWeighting`,
`showExcessiveRain`).

### Scenario 1 — Inside coordinates, `extended: false`, `showExcessiveRain: true`
(Criteria 1, 3, 4 — CFG-02, ERO-01, ERO-02)

```javascript
{
  module: "MMM-SPCOutlook",
  position: "top_right",
  config: {
    lat: 31.88325443422137,
    lon: -111.53990732097623,
    extended: false,
    updateInterval: 60,
    showExcessiveRain: true
  }
}
```

Expected render: `Excessive Rain (Day 1): Slight` through `Excessive Rain (Day 5): Marginal`
(exact lines above) appearing under `extended: false`, plus the normal Day 1-3 SPC rows. "No
Severe Weather Risk" must NOT appear.

### Scenario 2 — Inside coordinates, `showExcessiveRain` omitted entirely
(Criterion 2 — CFG-01, out-of-the-box default)

```javascript
{
  module: "MMM-SPCOutlook",
  position: "top_right",
  config: {
    lat: 31.88325443422137,
    lon: -111.53990732097623,
    extended: false,
    updateInterval: 60
  }
}
```

Expected render: **zero** `Excessive Rain` lines, even though this is the same location that
shows ERO risk in Scenario 1 — proving the toggle defaults to `false` out of the box.

### Scenario 3 — Inside coordinates, `extended: true`, `showExcessiveRain: true`
(Criterion 2 — CFG-01, independence from `extended`)

```javascript
{
  module: "MMM-SPCOutlook",
  position: "top_right",
  config: {
    lat: 31.88325443422137,
    lon: -111.53990732097623,
    extended: true,
    updateInterval: 60,
    showExcessiveRain: true
  }
}
```

Expected render: the same five `Excessive Rain (Day N)` lines as Scenario 1, **plus** the Day
4-8 SPC/fire weather rows that `extended: true` adds. Toggling `extended` must change only the
SPC/fire-weather rows and leave the ERO rows identical to Scenario 1.

### Scenario 4 — Outside coordinates, `extended: false`, `showExcessiveRain: true`
(Criterion 4 — ERO-03)

```javascript
{
  module: "MMM-SPCOutlook",
  position: "top_right",
  config: {
    lat: 47.61,
    lon: -122.33,
    extended: false,
    updateInterval: 60,
    showExcessiveRain: true
  }
}
```

Expected render: **zero** `Excessive Rain` lines — no empty line, no `Excessive Rain (Day 1):
None` line, no missing-color line, no error text. If nothing else is active at these coordinates,
"No Severe Weather Risk" **should** appear (this is correct — it is the absence of all products,
not an ERO bug).

## Summary Table

| Scenario | Coordinates | `extended` | `showExcessiveRain` | Expected ERO lines | Expected "No Severe Weather Risk" |
|----------|-------------|------------|-----------------------|----------------------|--------------------------------------|
| 1 | inside (31.88325443422137, -111.53990732097623) | `false` | `true` | 5 lines (Slight/Marginal x4) | No |
| 2 | inside (31.88325443422137, -111.53990732097623) | `false` | omitted | 0 lines | Yes (if nothing else active) — actually No, ERO risk exists but is hidden by the toggle default; if nothing else fires either, message shown since ERO conjunct short-circuits false when toggle off (see truth table case (d)) |
| 3 | inside (31.88325443422137, -111.53990732097623) | `true` | `true` | 5 lines, same as Scenario 1 | No |
| 4 | outside (47.61, -122.33) | `false` | `true` | 0 lines | Yes (if nothing else active) |

Note on Scenario 2's "No Severe Weather Risk" cell: per `14-04-SUMMARY.md`'s truth table case
(d), when `showExcessiveRain` is `false`/omitted the ERO conjunct short-circuits to `true`
(non-blocking) regardless of the underlying payload's tiers, so the message's visibility in
Scenario 2 depends entirely on whether SPC/fire-weather/day48Risk are also quiet at these
coordinates — it is not itself evidence of an ERO bug either way.
