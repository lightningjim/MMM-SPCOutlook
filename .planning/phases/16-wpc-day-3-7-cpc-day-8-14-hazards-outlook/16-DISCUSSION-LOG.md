# Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-26
**Phase:** 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
**Areas discussed:** Day bucketing & payload shape, Window band for Temp/Wildfire, Label filtering & vocabulary, Weekday-only staleness (DATA-02)
**Mode:** discuss (interactive), `--chain`

---

## Day bucketing & payload shape

### Q1 — How should Days 3–14 be keyed in the payload?

| Option | Description | Selected |
|--------|-------------|----------|
| day3..day14 offset keys | Own sibling block, N = forecast-day offset; reuses `dowToText(dow + N)`. Pitfall 9 drift risk. | |
| Date-keyed entries | Keyed by the feature's UTC calendar date. No drift; new frontend labeling path. | |
| Both — offset keys + a date stamp | Familiar block shape, weekday labeled from the real date. Mirrors 14 D-03. | ✓ |

**User's choice:** Both — offset keys + a date stamp → D-01

### Q2 — What does a single day carry when several hazards cover the location at once?

| Option | Description | Selected |
|--------|-------------|----------|
| All hazards, registry-declared order | Array, deterministic across polls, no invented severity. Needs a collect-all evaluator. | ✓ |
| All hazards, source order | No invented ordering, but render order flips between polls; defeats PERF-02 byte-identity. | |
| One hazard, project priority ladder | Keeps the tier-string shape but invents a ranking the product lacks (Pitfall 1) and hides co-occurring hazards. | |

**User's choice:** All hazards, registry-declared order → D-02

### Q3 — Which calendar should start_date/end_date be bucketed against?

| Option | Description | Selected |
|--------|-------------|----------|
| UTC calendar, source-native | Zero conversion; "Day 5" means what WPC means. Diverges from SPC's 12Z–12Z. | ✓ |
| Local calendar at configured lat/lon | Weekday matches what the viewer sees; but 00Z is ~6–7pm local prior evening, and no timezone source exists. | |
| Align to SPC's 12Z–12Z | Internally consistent, but re-cuts polygons against a boundary they weren't drawn to. | |

**User's choice:** UTC calendar, source-native → D-03

### Q4 — How should a multi-day Precipitation feature be placed?

| Option | Description | Selected |
|--------|-------------|----------|
| On every day in its span, with a full-window guard | Day grid answers "hazard on this day?"; guard routes full-window features to the band, avoiding the Pitfall 3 spread. | ✓ |
| Once, on its first day, with a span suffix | Compact, but a viewer scanning to day two sees nothing — false negative by layout. | |
| Any multi-day feature goes to the window band | Simplest rule, but discards genuine day resolution HAZ-01 asks for. | |

**User's choice:** On every day in its span, with a full-window guard → D-04

**Continue check:** "Next area."

---

## Window band for Temp/Wildfire

### Q1 — Where should window-spanning hazards render?

| Option | Description | Selected |
|--------|-------------|----------|
| Own labeled region, below the day rows | Keeps forecast windows separate from "in effect" nowcasts. Phase 19 relocates two blocks. | ✓ |
| Fold into the existing advisory band | Reuses 15 D-05's single band; but mixes a Day-7 forecast with 1–6h nowcasts. | |
| At the head of the Hazards Outlook section | Keeps one source together, but implies the window scopes the day rows below it. | |

**User's choice:** Own labeled region, below the day rows → D-05

### Q2 — How to label a hazard whose span is narrower than the nominal window?

| Option | Description | Selected |
|--------|-------------|----------|
| Band, labeled with the observed span | Honest to the data; satisfies HAZ-02 without inflating a 2-day feature to 7. | ✓ |
| Band, labeled with the nominal window | Stable heading matching WPC's product naming, but overstates duration. | |
| Route by span width | Uses all available resolution, but reads against roadmap criterion 2 and needs an amendment. | |

**User's choice:** Band, labeled with the observed span → D-06

### Q3 — When both day ranges carry window hazards, how should the band organize them?

| Option | Description | Selected |
|--------|-------------|----------|
| One band, sorted by span start | One loop, chronological read; entries self-label their span. | ✓ |
| Two sub-bands, split by day range | Explicit provenance, but a second region and repeated span info. | |
| One band, grouped by hazard dimension | Pre-stages Phase 18's taxonomy — a phase early, unvalidated. | |

**User's choice:** One band, sorted by span start → D-07

### Q4 — How should a window band entry be worded?

| Option | Description | Selected |
|--------|-------------|----------|
| Day offsets: "D3–7: Hazardous Heat" | Unambiguous, matches roadmap vocabulary; reads as jargon beside weekday rows. | |
| Weekdays: "Thu–Mon: Hazardous Heat" | Consistent and fast to scan, but a D8–14 span wraps and becomes ambiguous. | |
| Both: "Thu–Mon (D3–7): Hazardous Heat" | Resolves the wrap ambiguity while staying scannable; longest line. | ✓ |

**User's choice:** Both → D-08

**Continue check:** "Next area."

---

## Label filtering & vocabulary

**Detour — user asked why HAZ-04 exists at all.** Traced to `FEATURES.md:190/198/258` and
`SUMMARY.md:57`. Two distinct rationales surfaced: Flooding labels originate from the **National
Flood Outlook**, a seventh unresearched product riding in the Precipitation layer's attributes
(a provenance problem); Drought is slow-onset and its filtering is the mechanism that isolates
wildfire content from a multiplexed layer (an actionability problem).

**Assistant correction made during this area:** an earlier claim that "filtering drought guts the
Wildfire layer" was wrong — it was reasoned off the single August live pull. The MapServer legend
(FEATURES.md:22, :46, HIGH confidence, fetched directly) contains `Critical Wildfire Risk` in both
day ranges. The August sample returned 7 of ~15 legend labels. This reframed Q2 below.

**Cadence conflict noted for the next area:** FEATURES says "twice daily, 7 days/week";
STACK's live `serviceDescription` says "Daily Monday-Friday at 17:00Z".

### Q1 — Where should HAZ-04's exclusion list live?

*(First posed as whitelist-vs-blacklist; user asked "where is this configured — code or config?",
and the question was reformulated around placement, which conditioned the rest.)*

| Option | Description | Selected |
|--------|-------------|----------|
| Registry row, code-only — no user override | Matches 14 D-07/D-06; no re-enable path for flooding. | partial |
| Registry row, plus a `showDrought` boolean now | Flooding stays a hard provenance boundary; drought becomes a flat toggle. | partial |
| User-configurable exclusion list in config.js | Max flexibility; first non-boolean product config, typo could un-filter flooding. | |

**User's choice (free text):** *"Hard code the Flood for now, add phase for onboarding National
Flood Outlook as a 7th source this milestone as I was not aware of it, and keep drought as
preference."* → D-09, D-10, plus a new roadmap phase (see Deferred Ideas).

**Notes:** The user had not previously known the Flooding labels came from a separate product.
Rather than accept the filter as final, they scoped the National Flood Outlook as its own phase
this milestone — making D-09 an interim measure with a known successor.

### Q2 — What happens to a label neither excluded nor in the display map?

| Option | Description | Selected |
|--------|-------------|----------|
| Render verbatim, default style, log once | Unobserved legend labels appear when they fire; unstyled but visible. | ✓ |
| Drop it, log once | Consistent styling, but a new label is invisible until logs are read (Pitfall 8 shape). | |
| Render verbatim and set the stale flag | Strongest signal, but overloads a flag meaning "may be old" with "may be unmodeled". | |

**User's choice:** Render verbatim, default style, log once → D-11

### Q3 — How should the Precipitation layer's "Severe Weather" label be handled?

| Option | Description | Selected |
|--------|-------------|----------|
| Render verbatim; Phase 18 owns suppression | Avoids inventing a precedence rule research warned against. May read as an SPC duplicate for two phases. | ✓ |
| Render with a dimension-disambiguating label | Resolves on-screen ambiguity now, but invents vocabulary WPC doesn't publish. | |
| Suppress it this phase | Cleanest display, but Pitfall 10 says this over-merges and can hide flood signal. | |

**User's choice:** Render verbatim; Phase 18 owns suppression → D-12

**Continue check:** "Next area."

---

## Weekday-only staleness (DATA-02)

**Finding presented before questioning:** `_isWithinStaleWindow` measures time since last
successful *fetch*, not data age — so today's code produces no weekend false alarm. DATA-02 is
about how to add a data-age check safely, not about repairing an existing misfire.

### Q1 — How should this product's freshness be judged?

| Option | Description | Selected |
|--------|-------------|----------|
| Flat widened data-age window on idp_filedate | Catches a stalled-yet-serving feed; robust to the unresolved cadence conflict. | ✓ |
| Weekend-aware expected-issuance calculator | Tightest detection, but hardcodes the disputed cadence and mishandles holidays. | |
| No data-age check — fetch failure only | Zero new mechanism, but a stalled feed reads fresh indefinitely. | |

**User's choice:** Flat widened data-age window on idp_filedate → D-13

### Q2 — When the check trips, what carries the signal?

| Option | Description | Selected |
|--------|-------------|----------|
| Global anyStale, excluded from `_staleAsOf` | Badge fires, but "N minutes ago" isn't dragged by this product's 84h window. | ✓ |
| Global anyStale, feeding `_staleAsOf` normally | Fully uniform, but badge reads "3 days ago" on a mirror whose SPC data is current. | |
| Product-local marker on the Hazards block | Most precise, but reopens per-product staleness UX deferred to Phase 18. | |

**User's choice:** Global anyStale, excluded from `_staleAsOf` → D-15

### Q3 — What should `maxDataAgeHours` be?

| Option | Description | Selected |
|--------|-------------|----------|
| 84h — covers the weekend with margin | Fri 17Z + 84h = Mon 05Z, ~12h slack; false-alarms on holiday Mondays (~10 days/yr). | ✓ |
| 100h — covers holiday weekends too | Badge effectively never fires on cadence alone; a Monday stall goes unflagged until Friday. | |
| 72h — tightest that clears a normal weekend | Fastest detection, but lands exactly on Monday's issuance — recurring false alarm. | |

**User's choice:** 84h → D-14

---

## Claude's Discretion

Decided rather than asked (reported inline to the user with an offer to change):

- **D-16 — stale rows still render their content.** Settled by precedent: `rejectBody` serves
  last-known-good so "a WPC hiccup during an active HIGH must not blank the display," and CR-01
  already made staleness disable the confident all-clear rather than suppress data. Offering
  suppression would have been offering a false negative.

Left open for planning/implementation (detailed in CONTEXT.md `<decisions>` § Claude's Discretion):

- The new registry `kind` name and dispatch shape — neither `arcgis-day-layers` nor
  `kml-advisory` fits a one-URL-per-hazard-family product
- Collect-all evaluator placement; date-bucketing helper location
- One registry row with a layer list vs two rows sharing constants
- Per-day row wording and multi-hazard separator
- Color treatment (legend is PNG swatches, not machine-readable hex)
- Whether `showHazardsOutlook` / `showDrought` defaults are re-applied node_helper-side

## Deferred Ideas

- **National Flood Outlook as a 7th data source — its own phase, this milestone** (user-requested)
- Color treatment pending visual verification against `wpc.ncep.noaa.gov/threats/threats.php`
- Whether `Much Above/Below Normal Temperatures` are actionable enough to render
- Resolving the cadence conflict with a live `idp_filedate` observation across a weekend
- Per-product staleness UX — still deferred to Phase 18 or later
- `Severe Weather` suppression — explicitly Phase 18's

## Assistant Corrections Logged

Recorded here because both changed the framing of live questions:

1. **"Filtering drought guts the Wildfire layer"** — wrong; derived from one August sample rather
   than the MapServer legend. `Critical Wildfire Risk` exists in both day ranges. Q2 of the label
   area was reformulated after this.
2. **User characterization** — described as "a storm spotter," corrected by the user to a
   meteorologist, then further clarified: holds a meteorology degree, not employed in the field,
   and wants the full technical detail. Saved to session memory.
