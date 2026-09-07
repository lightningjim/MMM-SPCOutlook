# Filters, Floors and Flags

Why a hazard you can see on an NWS map might not appear on the mirror.

Every value below is transcribed from source. Where a number and a comment disagree, the source
wins — this file is a map, not the territory. Line references are to the state of the tree when
this was written and will drift; the constant names will not.

**Reading order.** A reading has to survive four independent gates, in this order. Any one of
them can drop it, and they answer different questions:

| # | Gate | Question | Lives in |
|---|------|----------|----------|
| 1 | **Product toggle** | Was this source fetched at all? | `MMM-SPCOutlook.js` `defaults` |
| 2 | **No-risk floor** | Is this reading an *active claim*, or just "we looked"? | `hazardTaxonomy.js` `NO_RISK_FLOOR` |
| 3 | **Precedence** | Did another source win this dimension for this day? | `hazardTaxonomy.js` `PRECEDENCE` |
| 4 | **Display filter** | Should the frontend draw it, given config? | `MMM-SPCOutlook.js` `getDom()` |

A fifth gate, **significance** (`SIGNIFICANCE_FLOOR`), never hides anything — it only decides
whether a day opens into detail on its own.

---

## 1. Product toggles

Set these in your MagicMirror `config.js` module block. Every product flag defaults to `false`
except SPC Mesoscale Discussions, which was already shipping before the registry existed and
would have silently disappeared for existing users on upgrade.

| Flag | Default | Gates |
|---|---|---|
| `showExcessiveRain` | `false` | WPC Excessive Rainfall Outlook (ERO), days 1–5 |
| `showWinterImpact` | `false` | WPC Winter Storm Severity Index (WSSI), days 1–3 |
| `showMPD` | `false` | WPC Mesoscale Precipitation Discussions |
| `showHazardsOutlook` | `false` | WPC Day 3–7 / CPC Day 8–14 US Hazards Outlook |
| `showSPCMD` | **`true`** | SPC Mesoscale Discussions |
| `showHeatRisk` | `false` | NWS HeatRisk, days 1–7 |
| `extended` | `false` | SPC convective **days 4–8** and fire weather days 3–8 |

SPC convective days 1–3 and fire weather days 1–2 have no toggle — they are the module's
original reason for existing and are always fetched.

`extended: false` does not filter days 4–8; it means they were **never fetched**. The module
tracks that distinction deliberately (`noteReported` is skipped, not called with a zero), so
"SPC didn't answer" never masquerades as "SPC answered no risk."

### Sub-toggles

These gate *labels inside* an already-fetched product rather than gating a fetch.

| Flag | Default | Effect |
|---|---|---|
| `showDrought` | `false` | Shows `Severe Drought` and `Rapid Onset Drought Risk` from the Hazards Outlook. Off by default because drought is near-permanent in much of CONUS and reads as noise on a glanceable display. `Critical Wildfire Risk` is **not** drought and is never gated, even though it arrives on the same layers. |
| `showMinorHeat` | `false` | Drops the HeatRisk **display** floor from 2 (Moderate) to 1 (Minor). Frontend-only — the backend emits Minor days regardless, because the merge stage must distinguish "HeatRisk said Minor" from "HeatRisk had no reading." |

### Not filters, but they change what you see

| Flag | Default | Effect |
|---|---|---|
| `dayReportDetail` | `false` | `true` expands **every** day into source-labelled dimension sub-rows. Independent of per-day auto-expand. |
| `proximityWeighting` | `false` | Enables proximity badges. Also enables the one exception to "no survivor, no row": a day with nothing above floor still renders a single line carrying just the badge. |

### Hard exclusions — no flag, no override

Three labels are dropped unconditionally:

```
Flooding Likely · Flooding Occurring or Imminent · Flooding Possible
```

They originate from the **National Flood Outlook**, a separate NOAA product that rides inside the
Hazards Outlook's Precipitation layers. Rendering them would attribute another product's data to
the Hazards Outlook. This is interim — the National Flood Outlook is scoped as its own phase.

Both the exclusion and the drought gate compare against a normalized, case-folded key, so
`"Flooding Likely "` with a trailing space, a non-breaking space, or a doubled inner space cannot
walk past them. The *displayed* label is never case-folded — an unmapped label renders verbatim.

---

## 2. No-risk floors — `NO_RISK_FLOOR`

The gate that answers **"is this an active claim?"** A reading that fails its floor is still
recorded as *reported* (the source answered, and is healthy), but contributes no hazard entry and
does not set `summary.anyHazard`. This is the distinction that keeps a quiet day from looking like
an outage.

### SPC convective

Two floors, because SPC covers days 1–8 with two different value domains.

**Days 1–3 — categorical.** Floor is `value > 1`:

| Tier | Value | Above floor? |
|---|---|---|
| `NONE` | 0 | no |
| `TSTM` General Thunderstorms | **1** | **no — this is the floor** |
| `MRGL` Marginal | 2 | yes |
| `SLGT` Slight | 3 | yes |
| `ENH` Enhanced | 4 | yes |
| `MDT` Moderate | 5 | yes |
| `HIGH` High | 6 | yes |

> **General Thunderstorms never renders.** TSTM *is* the floor, not something above it. There is
> no flag to surface it — the drop happens at the backend floor, before an entry is ever created,
> so a display flag could not reach it. On a day when TSTM is the only thing drawn over you, the
> module shows `No Hazards Forecast`. The reasoning: a TSTM area covers a large fraction of CONUS
> on most warm-season days, so surfacing it would put a row on the mirror nearly every day
> carrying almost no decision value.

**Days 4–8 — probabilistic.** Floor is `risk !== "NONE"`, where the percentage maps:

| Probability | Tier |
|---|---|
| 0.45 | `MDT` if significant, else `ENH` |
| 0.30 | `ENH` |
| 0.15 | `SLGT` |
| 0.05 | `MRGL` |
| anything else (incl. 0) | `NONE` — below floor |

"Predictability Too Low" and no-area both land on `NONE`.

### SPC fire weather

Floor is `value > 0`. There is no sub-`ELEV` rung to exclude — presence of a polygon is activity.

| Tier | Value | Text |
|---|---|---|
| — | 0 | no polygon covered the location |
| `ELEV` | 1 | Elevated |
| `CRIT` | 2 | Critical |
| `EXTM` | 3 | Extremely Critical |

The upstream `DN` attribute uses `5 → 1`, `8 → 2`, `10 → 3`. Note this is a *different* field
from ERO's lowercase `dn`; conflating them maps every ERO feature to 0 and silently reports "no
risk" everywhere.

### The three prebaked floors

`wpc-ero`, `wpc-wssi` and `wpc-hazards` carry the sentinel `FLOOR_PREBAKED` — their filtering
already happened at fetch time, so anything reaching the payload is above floor by construction.

**WPC ERO** — filtered at `val > 0`:

| `dn` | Value | Tier | Text |
|---|---|---|---|
| — | 0 | `NONE` | None — filtered |
| 1 | 1 | `MRGL` | Marginal |
| 2 | 2 | `SLGT` | Slight |
| 3 | 3 | `MDT` | Moderate |
| 4 | 4 | `HIGH` | High |

**WPC WSSI** — filtered at `val >= 2`:

| Raw | Value | Tier | Text | Renders? |
|---|---|---|---|---|
| — | 0 | `NONE` | None | no |
| `WINTER WEATHER AREA` | 1 | `WWA` | Winter Weather Area | **no — filtered** |
| `MINOR` | 2 | `MINOR` | Minor | yes |
| `MODERATE` | 3 | `MODERATE` | Moderate | yes |
| `MAJOR` | 4 | `MAJOR` | Major | yes |
| `EXTREME` | 5 | `EXTREME` | Extreme | yes |

`WINTER WEATHER AREA` is WSSI's equivalent of TSTM — the always-on background tier — and is
dropped for the same reason. There is no flag for it.

**WPC/CPC Hazards Outlook** — this service has **no severity ladder anywhere in its schema**. The
floor is simply "the label survived the exclusion and drought gates and is present in this day's
match set."

### NWS HeatRisk

Floor is `category !== null && category >= 1`.

| Category | Text | Above floor? | Renders at default config? |
|---|---|---|---|
| `null` | no reading | no | no |
| 0 | Little to No Risk | no | no |
| 1 | Minor | **yes** | **no** — display floor is 2 unless `showMinorHeat: true` |
| 2 | Moderate | yes | yes |
| 3 | Major | yes | yes |
| 4 | Extreme | yes | yes |

HeatRisk is the one source where the no-risk floor and the display floor differ. Minor clears the
backend floor (so the merge stage can tell "HeatRisk said Minor" from "HeatRisk had no reading")
but is hidden by the frontend unless you opt in. `null` and `0` both fail the floor — a quiet
source must never erase another source's warning.

---

## 3. Precedence

When two sources map to the same dimension on the same day, one wins and the others are marked
`suppressedBy`. Suppressed entries stay in the payload and render as `also:` lines in detail mode
— they are not filtered, just demoted. Precedence is resolved **per grid day, independently**;
winning days 1–8 never erases a source on days 9–14 where it does not report.

---

## 4. Display filters

Applied in `getDom()`, after everything above.

- **`showMinorHeat`** — the HeatRisk floor of 2 (or 1 when true), described above.
- **"No survivor, no row"** — a day with nothing above floor renders *no line at all*, not a
  placeholder. The day list is therefore intentionally non-contiguous: you may see Day 1, Day 3,
  Day 6 with nothing between. The one exception is `proximityWeighting: true`, where a
  would-be-empty day still renders its proximity badge alone.
- **Empty states** — three, and they are distinct on purpose:
  - `No Products Enabled (edit config.js to turn one on)` — nothing was ever asked.
  - `No Hazards Forecast` — everything was asked and everything came back quiet.
  - `⚠` badge + `No Hazards Forecast (unconfirmed)` — the read was degraded. Staleness
    disqualifies the confident all-clear entirely; a degraded read must never present as a
    confident clear.

---

## 5. Significance floors — `SIGNIFICANCE_FLOOR`

**This gate hides nothing.** It answers only: is this day serious enough to open into its
dimension sub-rows without the user setting `dayReportDetail: true`? A day below significance
still renders its compact line.

| Source | Auto-expands at | Tier |
|---|---|---|
| `spc-convective` | `>= 4` | ENH or above |
| `spc-fire` | `>= 2` | CRIT or above |
| `wpc-ero` | `>= 3` | MDT or above |
| `wpc-wssi` | `>= 4` | MAJOR or above |
| `heatrisk` | `>= 3` | Major or above |
| `wpc-hazards` | **never alone** | presence-only source, no severity ladder exists |

Accepted cost of the `wpc-hazards` rule: the dimensions **cold**, **wind** and **heavy-precip**
have no other source, so they can never auto-expand a day on their own. Chosen deliberately over
making auto-expand near-permanent on busy long-range days.

### The second condition

Clearing the significance floor is necessary but **not sufficient**. Because an expanded day
restates its compact header verbatim, a single-source day with no extra detail would spend three
lines to add one word — the source name. So the expansion must also deliver something the header
cannot already show, by either of:

- **two or more distinct sources** contribute to the day (counted over winners *and* suppressed
  competitors, since a suppressed competitor is exactly what renders as an `also:` row); **or**
- **the day carries a convective `detail` sub-object** — the probabilistic tornado/hail/wind
  breakdown and proximity badge, which have no compact-line representation at all. Note this is
  genuinely "there is breakdown data here", not "this is convective": the detail object is
  omitted entirely when every probabilistic field is null/zero/false.

The second clause is why a single high-end convective day — the most serious display this module
produces — still auto-expands on its own.

---

## Day spans

| Source | Days | Notes |
|---|---|---|
| `spc-convective` | 1–8 | categorical 1–3, probabilistic 4–8; 4–8 need `extended: true` |
| `spc-fire` | 1–8 | 1–2 always, 3–8 need `extended: true` |
| `wpc-ero` | 1–5 | |
| `wpc-wssi` | 1–3 | |
| `wpc-hazards` | 3–14 | WPC 3–7, CPC 8–14 |
| `heatrisk` | 1–7 | |

The unified grid is 14 days (`GRID_DAY_COUNT`). **Day 1 is today.**

Non-day-scoped content — Mesoscale Discussions, MPDs, and Hazards Outlook entries spanning a
whole nominal window — renders in one band *below* all day blocks. A Hazards Outlook feature
covering its layer's entire nominal window is treated as window-level information rather than
being repeated on every day, which would advertise a daily resolution the data does not have.

---

## Quick diagnosis

**"NWS shows something over me and the mirror doesn't."** Work down the gates:

1. Is the product's flag on? All except `showSPCMD` default to `false`.
2. Is it day 4+ for SPC convective, or day 3+ for fire weather, with `extended: false`?
3. Is it one of the always-filtered background tiers — **TSTM**, **WINTER WEATHER AREA**, HeatRisk
   **Minor**, ERO/HeatRisk **0**?
4. Is it a drought label with `showDrought: false`?
5. Is it a `Flooding *` label? Those are excluded unconditionally.
6. Did another source win that dimension for that day? Turn on `dayReportDetail: true` and look
   for an `also:` line.

**"The day is there but won't expand."** That is significance, not filtering — see §5. A day
expands only when something clears its source's significance floor *and* the expansion would add
something the header does not already say.
