# Phase 19: Unified Day Report — getDom() Rewrite - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in `19-CONTEXT.md` — this log preserves how they were reached.

**Date:** 2026-09-06
**Phase:** 19-unified-day-report-getdom-rewrite
**Mode:** discuss (default, interactive) — `--chain`
**Areas offered:** Render mechanism, Compact line composition, Detail mode semantics, Legacy
block retirement, Empty state copy, Badge placement, Band layout, Parity run mechanics
**Areas selected:** Compact line composition, Detail mode semantics, Badge placement

## Area: Compact line composition

| Question | Options presented | Selected |
|---|---|---|
| How is each day block labeled? | Weekday only / Weekday + date / Day N + weekday / You decide | **Day N + weekday — `Day 3 (Thu)`** |
| How are hazards worded on the compact line? | Bare label hazard-colored / Dimension prefix / Short source tag / You decide | **Dimension prefix — `Convective Enhanced · Flash Flood Slight`** |
| What happens to a day with no surviving hazards? | Skip quiet days / Render every covered day / Contiguous through last active / You decide | **Skip quiet days entirely** |
| What bounds the compact line (18 D-15 deferred truncation here)? | No cap let it wrap / Cap inline + overflow counter / No cap single-line clip / You decide | **You decide** → Claude's Discretion |

Notes: the label question was framed with the consequence that under 18 D-09's 12Z–12Z grid a
day labeled `Thu` means 12Z Thu → 12Z Fri. The Day-N choice was made partly for RPT-06 parity
diff readability against the old renderer's `(Day N)` vocabulary.

## Area: Detail mode semantics

| Question | Options presented | Selected |
|---|---|---|
| What form does `dayReportDetail` take (no input device)? | Global config boolean / Global + auto-expand / Global + socket notification / You decide | **Global boolean + auto-expand** |
| What triggers auto-expand, with no cross-dimension ranking available? | Per-dimension threshold table / Hazard count / Priority sources / You decide | **You decide** → Claude's Discretion, with the no-cross-dimension-ranking constraint locked |
| How are suppressed entries distinguished? | Dimmed + attribution note / Dimmed only / Grouped under dimension / You decide | **Grouped under dimension** (resolved first, competitors as `also:`) |
| Does an expanded day keep its compact line? | Keep as header / Day label only / Header only when auto-expanded / You decide | **Keep it as a header** |

Notes: the auto-expand choice created an immediate tension — 18 D-15 explicitly rejected
building a cross-dimension severity ranking. A follow-up question surfaced trigger shapes that
avoid one; the user delegated the choice while the constraint was carried into CONTEXT.md.

## Area: Badge placement

| Question | Options presented | Selected |
|---|---|---|
| Where does the categorical proximity badge attach? | Convective hazard compact + detail / Detail sub-rows only / Day-level badge strip / You decide | **Detail sub-rows only** |
| Where does the SPC probabilistic breakdown render? | Detail only under convective / Compact appended / One sub-row per hazard type / You decide | **Detail only, under convective** |
| Where does the stale badge sit? | Global unchanged (recommended) / Global + per-source in detail / Global repositioned to band / You decide | **Global badge, unchanged** |
| What renders for a proximity-only day (no hazard)? | Proximity opt-in makes it content / Detail mode only / Never render it / You decide | **Proximity opt-in makes it content** |

Notes: the fourth question was not planned. It was raised because the first two answers
combined with the compact-area decision to skip quiet days would have silently dropped PROXUI's
outside-mode line at default config — an RPT-06 parity break that would otherwise have surfaced
during execution. The per-source staleness option was presented explicitly flagged as
out-of-scope UX per PROJECT.md, and was not chosen.

## Scope guardrail

No scope creep was raised by the user. The one out-of-scope option Claude presented (per-source
staleness marks in detail) was labeled as such at the point of asking and declined; it is
recorded in `<deferred>`.

## Claude's discretion (delegated during discussion)

- Compact-line row budget / truncation
- The auto-expand trigger, subject to requiring no cross-dimension severity ranking

## Areas offered but not selected

Render mechanism, Legacy block retirement, Empty state copy, Band layout, Parity run mechanics.
All five are recorded in `<decisions>` under Claude's Discretion with the prior-phase
constraints that bound each, rather than dropped.
