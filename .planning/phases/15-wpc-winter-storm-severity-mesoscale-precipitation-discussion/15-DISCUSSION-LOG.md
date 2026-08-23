# Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in 15-CONTEXT.md — this log preserves how they were reached.

**Date:** 2026-08-23
**Phase:** 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
**Mode:** discuss (default, interactive)
**Areas offered:** MPD plumbing vs the registry; SPC MDs vs WPC MPDs on screen; Unverifiable MPD
validity; WSSI labels and palette
**Areas selected:** MPD plumbing vs the registry; SPC MDs vs WPC MPDs on screen; WSSI labels and
palette
**Not selected:** Unverifiable MPD validity (MPD-04) — recorded as Claude's Discretion with
guidance in CONTEXT.md

---

## Pre-discussion findings

Scouting established the fact that shaped the whole session: **Phase 15 ships two structurally
different products.** WSSI is ArcGIS MapServer with Day 1–3 layers and drops into the Phase 14
registry unchanged. WPC MPD is KMZ/KML polygons + text and does not — the registry's
`buildArcGisQuery`/`dayLayers` shape assumes ArcGIS day layers.

Also surfaced: the module **already ships** a complete KMZ advisory pipeline for SPC convective
Mesoscale Discussions, hardened hours earlier by the Phase 14 CR-02/WR-06 fixes.

---

## Area 1 — MPD plumbing vs the registry

### Q1. How should MPDs be plumbed relative to the D-07 registry?
| Option | Description |
|---|---|
| Widen registry: `kind` per row | Each row declares its kind; `buildArcGisQuery` becomes what the arcgis kind uses |
| Generalize the existing MD pipeline | Registry stays ArcGIS-only; `getMesoscaleDiscussion` takes a source descriptor |
| Separate WPC MPD path | Standalone fetcher; lowest regression risk, duplicates KMZ/allowlist/containment |

**Response:** No option selected. Note given:
> "IF we are onboard MPD this way, might as well migrate SPC MDs into the register."

Read as endorsing the widened registry **plus** an expansion beyond the offered options.

### Q1b. How far should the SPC MD migration go? *(follow-up prompted by the note)*
Claude surfaced the tension: Phase 14's **D-08** deliberately kept existing code out of the
registry, but its stated rationale was scoped to "the foundation phase." Supporting evidence for
migrating was 14-REVIEW.md **WR-06** — the `features[0]` bug survived in the MD path precisely
because the equivalent ERO fix "was applied to the new product and not to the existing one."

| Option | Description |
|---|---|
| **Migrate SPC MDs only** ✓ | Advisory products share one path; categorical/fire-weather stay out |
| Migrate MDs + revise D-08 formally | Same change, plus a superseding rule for Phases 16-19 |
| Defer MD migration to Phase 19 | Keeps Phase 15 narrow; accepts parallel paths through 16-18 |
| Migrate MDs + fire weather too | Most consistent end state; largest regression surface |

**Selected:** Migrate SPC MDs only → **D-01, D-02**

### Q2. Where should advisory products live in the payload?
Context given: advisories are variable-length lists, so Phase 14's D-05 "full block with zero
values" doesn't map cleanly; and Phase 18's RPT-07 already names an `advisories` key.

| Option | Description |
|---|---|
| **`advisories` block inside outlook** ✓ | Retires the `md` socket element; borrows only RPT-07's key |
| Keep `md`, add `mpd` element | Least disruptive; grows the positional array again |
| Flat array with source tag | One list, per-entry source tag; more frontend filtering |

**Selected:** `advisories` block inside outlook → **D-03**

Claude flagged the resulting migration hazard unprompted: CR-03 put `seq` at socket index 2;
retiring `md` moves it to index 1.

### Q3. How should an advisory fetch failure differ from a genuine "none active"?
| Option | Description |
|---|---|
| **Failure sets stale, empty does not** ✓ | Quiet day + broken feed renders the CR-01 outage state |
| Failure sets stale, and name the product | More precise; reopens D-04's deferred per-product UX |
| Advisories never touch `anyStale` | Badge stays tied to outlook data; silent feed failure |

**Selected:** Failure sets stale, empty does not → **D-04**

---

## Area 2 — SPC MDs vs WPC MPDs on screen

Grounding read before questions: MDs currently render as `MD 0123 in effect.` in blue
(`#0059E0`) **above** the day rows, from the raw escaped KML `name`.

Constraint surfaced: Phase 19's **RPT-04** already commits advisories to a separate band
**below** the day blocks, so current placement is temporary either way — which argued against
over-investing in layout, while leaving the labelling question live.

### Q1. How should the two sources be distinguished?
| Option | Description |
|---|---|
| **One band, source-prefixed labels** ✓ | `SPC MD 0123` / `WPC MPD 0456 — Heavy Rain` |
| Two labeled groups | Clearest separation; Phase 19 must merge two blocks into RPT-04's one |
| One band, colour-coded by source | Most compact; colour alone fails at distance and for colour-blind viewers |

**Selected:** One band, source-prefixed labels → **D-05**

### Q2. What renders when MPD-03's CDATA hazard parse yields nothing?
| Option | Description |
|---|---|
| **Show the MPD without a hazard type** ✓ | Degrades to today's MD behaviour; logs the miss |
| Show with an explicit unknown marker | More honest; noisier if the CDATA format changes broadly |
| Drop the MPD entirely | Cleanest display; hides an active hazard — the WR-06 failure shape |

**Selected:** Show without hazard type → **D-06**

### Q3. Should the advisory band be capped?
| Option | Description |
|---|---|
| **No cap — show every one** ✓ | MPD-02 satisfied structurally; containment bounds the count |
| No cap, but collapse past N | Bounds display; likely duplicated by Phase 19 RPT-02/RPT-03 |
| Cap with a hard limit | Layout stability at the cost of silently omitting active hazards |

**Selected:** No cap → **D-07**

---

## Area 3 — WSSI labels and palette

### Q1. Where should WSSI's impact colours come from?
Context given: 14-REVIEW.md **IN-01** flagged ERO's palette as reusing the SPC severe-thunderstorm
colours with no cited source. Claude noted the ArcGIS MapServer exposes the layer's own renderer
via its legend endpoint, making an authoritative citation possible rather than eyeballed.

| Option | Description |
|---|---|
| **WPC's own palette, cited** ✓ | Source URL recorded in the registry row; closes IN-01 for this product |
| WPC palette, and backfill ERO's citation | Also resolves IN-01 for ERO; revisits a shipped product |
| Reuse the project's existing tier palette | Visually consistent; repeats the uncited-palette pattern |

**Selected:** WPC's own palette, cited → **D-08**
(Backfilling ERO's citation declined → deferred.)

### Q2. Which WSSI impact levels render a row?
Context given: unlike ERO, a location can sit *inside* a WSSI polygon at the lowest level, and in
winter much of the country sits there for days.

| Option | Description |
|---|---|
| **Limited and above** ✓ | Matches ERO-03's absence-is-silence precedent; Limited is a real impact |
| Minor and above | Quieter mirror; a deliberate false negative on Limited forecasts |
| Limited and above, de-emphasised | Preserves information; Phase 19's toggle is the better home |

**Selected:** Limited and above → **D-09**

### Q3. How should Phase 15 be verified, given WSSI is out of season?
Context given: it is August, WSSI returns zero features, ROADMAP SC1 cannot be exercised live.
STATE.md already carries this as a blocker with structural verification as the documented
fallback. The out-of-season path (WSSI-03) is the one criterion verifiable *now*.

| Option | Description |
|---|---|
| **Probe scenarios + live MPD UAT** ✓ | Mutation-proven WSSI fixtures; live WSSI deferred in-season |
| Probe scenarios from a captured real payload | Stronger fixtures; depends on finding an archive |
| Hold the phase open until winter | Highest confidence; stalls Phases 16-19 for months |

**Selected:** Probe scenarios + live MPD UAT → **D-10**

---

## Deferred Ideas Captured

- Backfilling ERO's palette citation (IN-01) — declined at Area 3 Q1
- Migrating fire-weather / SPC categorical layers into the registry — declined at Area 1 Q1b
- Per-product staleness UX — declined at Area 1 Q3; reopens Phase 14 D-04 early
- Collapsing a long advisory band — declined at Area 2 Q3
- Live in-season WSSI verification — deferred by D-10

## Claude's Discretion Recorded

- MPD-04 tie-break across the year boundary (area offered, not selected — guidance given)
- WSSI-02 case normalisation mechanism
- Exact WSSI row label wording
- Physical location and form of the `kind` dispatch
- Whether the retired `md` socket element leaves a compatibility shim
