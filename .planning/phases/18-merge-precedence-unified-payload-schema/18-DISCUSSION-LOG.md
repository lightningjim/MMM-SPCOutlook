# Phase 18: Merge, Precedence & Unified Payload Schema - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-09-05
**Phase:** 18-merge-precedence-unified-payload-schema
**Mode:** chain (interactive discussion, automatic hand-off to plan-phase)
**Areas offered:** Payload schema & migration, Hazard-dimension taxonomy, Day-window
normalization, Suppression & compact summary
**Areas discussed:** all four, plus a fifth added by Claude at the end — PERF-03 measurement
protocol (deferred to the end because it needs the user at the Pi)
**Areas declined:** none

---

## Payload schema & migration

### Q1 — How do the unified block and the eight legacy blocks coexist?

| Option | Description | Selected |
|--------|-------------|----------|
| Additive — Recommended | Add `days`/`summary`/`sources`; leave legacy blocks byte-for-byte. Display keeps working, PERF-03 measurable, Phase 19 keeps a parity reference. Cost: two representations can drift. | ✓ |
| Legacy derived from unified via adapters | Single source of truth immediately. Cost: inverts the risk — a merge bug becomes a display regression before Phase 19 exists. | |
| Replace outright | Cleanest end state. Cost: module unrenderable for a phase; PERF-03 unmeasurable. | |

**User's choice:** Additive → **D-01**

Noted at the time as a constraint rather than a decision: drift is bounded only if both
representations are assembled from the same in-memory values.

### Q2 — What shape is `days`?

| Option | Description | Selected |
|--------|-------------|----------|
| Keyed `"1"`–`"14"`, all present — Recommended | Extends 14 D-05's shape invariant; Phase 19 renders one loop with no key-existence branching. Dates resolved per 16 D-01. | ✓ |
| Sparse map, only days with data | Smaller payload. Cost: key-existence checks land in the renderer. | |
| Ordered array | Natural iteration. Cost: index-vs-day-number confusion at every call site. | |

**User's choice:** Keyed, all fourteen present → **D-02**

### Q3 — How are a day's hazards represented?

| Option | Description | Selected |
|--------|-------------|----------|
| One annotated list with `suppressedBy` — Recommended | Compact reads survivors, detail reads all. Suppressed entries survive so MERGE-02/04 are inspectable against a captured payload — which is how criteria 2 and 4 are worded. | ✓ |
| Two lists (`visible` / `suppressed`) | Explicit. Cost: doubles the shape, loses the pairing between an entry and what suppressed it. | |
| `summary` as a pre-rendered string | Simplest for the renderer. Cost: per-hazard color forces backend markup — Phase 14's IN-03 already flagged unescaped `innerHTML` here. | |

**User's choice:** One annotated list → **D-03**

### Q4 — What sits at the payload root beside `days`?

| Option | Description | Selected |
|--------|-------------|----------|
| Both `summary` and `sources` — Recommended | `summary` makes RPT-05 decidable in one read, retiring Pitfall 9's ~15-input gate here. `sources` carries per-product health. | ✓ |
| `summary` only | Smaller. Cost: no place for fetch outcome or `idp_filedate`. | |
| `sources` only | Health without a verdict. Cost: leaves the no-risk gate for Phase 19. | |

**User's choice:** Both → **D-04**

**Continuation gate:** Next area.

---

## Hazard-dimension taxonomy

### Q1 — How granular are the dimensions?

| Option | Description | Selected |
|--------|-------------|----------|
| Coarse + nested detail — Recommended | ~8 flat dimensions; precedence is string equality. SPC's tor/hail/wind rides as `detail` on the single convective entry. | ✓ |
| Fine-grained flat dimensions | Precise. Cost: needs a second family map to answer "do these compete?" | |
| Two-level `{family, subtype}` | Expressive. Cost: every precedence comparison becomes a two-field match. | |

**User's choice:** Coarse + nested detail → **D-05**

### Q2 — Where does the label→dimension mapping live?

| Option | Description | Selected |
|--------|-------------|----------|
| Standalone `hazardTaxonomy.js` — Recommended | Pitfall 10's required explicit artifact. Dimension is a merge concern; registry rows are fetch/color config (15 D-02), and 14 D-08 scoped the registry to new products only. | ✓ |
| Registry rows plus an SPC side table | Reuses existing structure. Cost: two mechanisms for one concept. | |
| Extend the registry to cover SPC | One table. Cost: reopens 14 D-08, drags fetch config into a merge artifact. | |

**User's choice:** Standalone module → **D-06**

### Q3 — What happens to a label with no taxonomy entry?

| Option | Description | Selected |
|--------|-------------|----------|
| Pass through + record in `sources` — Recommended | Renders always, never suppresses or is suppressed, logs once (16 D-11), listed in `sources[p].unmappedLabels[]` so it is diagnosable from a captured payload (15 D-10). | ✓ |
| Log only | Minimal. Cost: invisible in a captured payload. | |
| Drop from the unified block | Clean output. Cost: silently loses a real hazard — MERGE-04's exact failure mode. | |

**User's choice:** Pass through + record → **D-07**

### Q4 — What is the source-id vocabulary?

| Option | Description | Selected |
|--------|-------------|----------|
| One id per product, SPC included — Recommended | One vocabulary across taxonomy, precedence table and `sources`. Day-range differences fall out free. Cost: `spc-md`/`wpc-mpd` live outside PRODUCT_REGISTRY. | ✓ |
| One id per agency | Fewer ids. Cost: `flash-flood: ["wpc","wpc"]` is unexpressible. | |
| Registry ids, SPC lumped | Reuses existing ids. Cost: one health state for two independent fetches. | |

**User's choice:** One id per product → **D-08**

**Continuation gate:** Next area.

---

## Day-window normalization

### Q1 — What is the canonical grid?

**Asked twice.** The user selected the UTC 00Z option, then interrupted: *"Redo last question, I
didn't think it throgh enough."* The first framing had recommended UTC on the weak ground that it
extends 16 D-03. The re-ask opened by conceding that was the wrong argument, established that
**both grids give a clean 1:1 mapping and the only difference is where the unavoidable 12-hour
phase error lands**, and flipped the recommendation. The user reversed their answer.

| Option | Description | Selected (1st) | Selected (2nd) |
|--------|-------------|----------------|----------------|
| UTC calendar day, 00Z–00Z | Extends 16 D-03; keeps shipped Hazards Outlook bucketing. Cost: phase error lands on SPC convective. | ✓ | |
| SPC 12Z–12Z — convective exact | Phase error lands on the Day 3–14 broad-brush outlook, inside its own precision. Cost: reverses 16 D-03; re-derives shipped, live-validated bucketing; `date` becomes "the date the window starts." | | ✓ |
| No normalization | Each source on its own grid. Cost: MERGE-01 exists to stop this. | | |

**User's choice:** SPC 12Z–12Z grid → **D-09**

### Q2 — How does a 00Z–00Z source day map onto the 12Z grid?

Framed with the degeneracy stated up front: the offset is exactly half a day, so a 00Z–00Z day
overlaps two grid days by exactly 12 hours each — majority-overlap and midpoint rules **tie by
construction**. There is no rule that avoids picking a direction.

| Option | Description | Selected |
|--------|-------------|----------|
| Forward-align on the diurnal peak — Recommended | Source day D maps to the grid day starting 12Z on D. The 18Z–06Z peak sits wholly inside it. Deterministic, one entry per source day. | ✓ |
| Duplicate onto both grid days | 16 D-04's precedent. Cost: overstates duration, inflates `summary.activeDays`, doubles entries. | |
| Backward-align | Symmetric alternative. Cost: splits the diurnal peak onto the next displayed day. | |

**User's choice:** Forward-align → **D-10**

### Q3 — What does day 1 anchor to?

Reframed during the area. While preparing an ERO-Day-1-specific question, Claude recognised that
SPC's own 01Z Day 1 update has the same 01Z–12Z partial shape — so the partial issuance is a
shared 12Z-product convention, not an ERO quirk, and the real question is what day 1 anchors to.
That reframing dissolved the ERO Day 1 problem entirely.

| Option | Description | Selected |
|--------|-------------|----------|
| The period in progress — rolls at 12Z — Recommended | Includes the shortened 01Z–12Z form, real window on the entry. Every 12Z product's native index equals the grid index at every hour. Cost: day 1 is shorter than 24h for part of the day. | ✓ |
| The next full 12Z–12Z period | Always a full day. Cost: the in-progress period has no slot during 00Z–12Z, plus an off-by-one on every 12Z product. | |
| A separate day `"0"` for the partial | Explicit. Cost: breaks D-02's fourteen-key invariant. | |

**User's choice:** The period in progress → **D-11**

### Q4 — What sets the grid boundary?

| Option | Description | Selected |
|--------|-------------|----------|
| SPC's own valid times, clock fallback — Recommended | Anchor from VALID/EXPIRE; on failure use a clock rule and mark `gridAnchor: 'estimated'`. Each day carries `windowStart`/`windowEnd` so nothing re-derives a boundary. | ✓ |
| Wall clock only | Simple. Cost: silently wrong during a delayed or off-cycle issuance. | |
| Each source anchors itself | No coupling. Cost: that is the absence of a canonical grid. | |

**User's choice:** SPC's valid times with clock fallback → **D-12**

Flagged as a planning prerequisite: confirm the fetched SPC layer actually exposes VALID/EXPIRE.

**Continuation gate:** Next area.

---

## Suppression & compact summary

### Q1 — What threshold makes a higher-ranked source suppress a lower-ranked one?

**Asked twice.** The user interrupted the first answer with *"No, go back, selected the wrong
one."* Read as a misclick rather than a framing complaint, so the question was re-presented with
identical option labels in identical order — no re-argument, no reordering — with parity previews
added. The second answer differed.

| Option | Description | Selected (1st) | Selected (2nd) |
|--------|-------------|----------------|----------------|
| Any reading suppresses, including explicit no-risk — Recommended | A present reading resolves the dimension. Cost: a quiet source erases another's warning. | ✓ | |
| Only an active hazard suppresses | Suppression requires a value above the source's no-risk floor. `null` and `0` both leave the lower-ranked entry visible. Cost: WPC anomaly labels render more often. | | ✓ |
| Source presence alone suppresses | Simplest. Cost: the exact failure 17 D-02 preserved the raw category to prevent. | | |

**User's choice:** Only an active hazard suppresses → **D-13**

Recorded at the time: under this choice `null` and `0` behave identically for suppression, so 17
D-02's null-vs-0 framing is no longer what makes MERGE-03 decidable. The raw category is still
required — it is what the floor test reads.

### Q2 — Does precedence resolve per-day or once across the window?

**Reframed after a user correction.** The first framing used "SPC covers days 1–3 only" in its
example. The user corrected it: *"SPC does not cover Days 1-3 only. There is a Day4-8 that is
basically just the % version of what the risks mean."* The question was re-asked with the coverage
boundary moved to day 8, and with a sharper in-coverage case — an SPC day 4–8 with no probabilistic
area is a no-risk reading, which under D-13 does not suppress.

| Option | Description | Selected |
|--------|-------------|----------|
| Per-day, independently — Recommended | Each day resolves from only the sources reporting that day; `summary` rolls up resolved days. Days 9–14 keep `convective` from wpc-hazards. | ✓ |
| Whole-window, one resolution | One winner per dimension. Cost: suppresses entries on days the winner never covered — days 9–14 lose convective entirely. | |
| Per-day plus a separate window-level pass | Independent days, second pass for `summary`. Cost: `summary` and the day list can disagree about what is present. | |

**User's choice:** Per-day, independently → **D-14**

### Q3 — What does the backend hand the compact renderer on a multi-hazard day?

| Option | Description | Selected |
|--------|-------------|----------|
| Fully ordered list, no cap — Recommended | Every survivor in taxonomy category order. Ordering is a merge concern; row budget is layout. Truncation is not a precedence decision, so RPT-07 holds. | ✓ |
| Ordered list + a `primary` flag | One-glance headline. Cost: requires a cross-dimension severity ranking (Enhanced convective vs Slight ERO) the precedence table does not contain. | |
| Backend emits a capped `compact[]` | Most RPT-07-pure. Cost: bakes N into the payload before any layout exists. | |

**User's choice:** Fully ordered, no cap → **D-15**

### Q4 — What does root `summary` contain?

Framed around the fact that "no hazard active" has three distinct causes — all reported and quiet,
all failed to fetch, all toggled off — and that `sources` already carries the latter two.

| Option | Description | Selected |
|--------|-------------|----------|
| Verdict + inventory, `sources` for the rest — Recommended | `{anyHazard, dimensions, activeDays, windowStart, windowEnd, enabledSourceCount, reportingSourceCount}`. No hazard values duplicated out of `days`. | ✓ |
| Full per-dimension window rollup | Window headline without walking `days`. Cost: peak values in two places — D-01's drift exposure inside one payload. | |
| Verdict + explicit `emptyReason` enum | Zero downstream derivation, even for wording. Cost: fixes the empty-state taxonomy before Phase 19 knows what copy it needs. | |

**User's choice:** Verdict + inventory → **D-16**

**Continuation gate:** Next area.

---

## PERF-03 measurement protocol

Added by Claude as a fifth, smaller area, promised at the start of the discussion and deferred to
the end because it needs the user at the Pi. Opened by establishing a fact rather than asking about
it: `node_helper.js:186` holds the only cache — an in-memory `Map` keyed by URL, no disk cache and
no cache directory — so "cold cache" means exactly "a fresh process," with no setup ambiguity.

### Q1 — What interval does the figure measure?

| Option | Description | Selected |
|--------|-------------|----------|
| Both, as two numbers — Recommended | Backend interval (`GET_SPC_DATA` → `SPC_DATA_RESULT`, with a per-product breakdown) plus process-start → first populated render. D-01 keeps the legacy render working, so end-to-end is measurable now and becomes a Phase 19 baseline. | ✓ |
| Backend interval only | Clean attribution to code this phase owns. Cost: does not answer "how long before the mirror shows outlooks." | |
| End-to-end wall clock only | Matches the requirement's wording most literally. Cost: slow fetch, slow boot and slow render collapse into one unattributable number. | |

**User's choice:** Both → **D-17**

### Q2 — Does the instrumentation stay in the shipped module?

| Option | Description | Selected |
|--------|-------------|----------|
| Permanent, logged once per cold start — Recommended | ~4 lines per boot, never repeated. A gate figure reproducible only by re-adding scaffolding cannot be re-checked in Phase 19 or v2.1. Cost: 4 lines of log noise. | ✓ |
| Permanent behind a `perfLog` flag | No noise for normal installs. Cost: a 16th independently-toggleable boolean; Pitfall 9 already counts ~15. | |
| Temporary scaffold, reverted | Zero permanent surface. Cost: PERF-03 becomes a one-time observation with no regression detection. | |

**User's choice:** Permanent, logged once → **D-18**

### Q3 — When is PERF-03 satisfied, given it needs human-operated hardware?

| Option | Description | Selected |
|--------|-------------|----------|
| Phase ships the instrument; the number is a UAT item — Recommended | Phase completes on a verified local cold start. The Pi figure rides the existing STATE.md milestone blocker. Chained execution stays unblocked. | ✓ |
| Phase blocks until the Pi run is recorded | Most literal reading of criterion 6. Cost: halts chained execution on a step no agent can perform; Phase 19 waits on a measurement, not code. | |
| No threshold at all — observation only | Honest about the absent target. Cost: a 40s cold start would be "recorded" and pass. | |

**User's choice:** Ship the instrument, Pi figure as UAT → **D-19**

**Continuation gate:** All areas complete.

---

## Notes for future discussions

Two corrections in this session are worth carrying forward as method, not just as facts:

- When the user says they *"didn't think it through,"* the useful response is to re-frame the
  question around the genuinely decisive argument, not to re-present the same one. Doing so
  reversed D-09 — a decision that in turn reverses shipped 16 D-03 behavior.
- When the user says they *"selected the wrong one,"* that is a misclick. Re-present identical
  options in identical order without re-arguing or reordering.
