# Phase 17: NWS/WPC HeatRisk & Parallelized Fetching - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-30
**Phase:** 17-nws-wpc-heatrisk-parallelized-fetching
**Mode:** discuss (default, interactive)
**Areas offered:** HeatRisk display floor, NoData / missing-day semantics, Parallel failure
containment, Concurrency bound on the Pi
**Areas discussed:** HeatRisk display floor, NoData / missing-day semantics, Parallel failure
containment
**Areas declined:** Concurrency bound on the Pi (→ Claude's Discretion)

---

## HeatRisk display floor

### Q1 — Which HeatRisk categories should render a row?

| Option | Description | Selected |
|--------|-------------|----------|
| Floor at 2 (Moderate) — Recommended | 0 and 1 render nothing. Mirrors 15 D-09 AMENDED's WSSI tier filter. Cost: heat-sensitive user loses the Level 1 heads-up. | |
| Floor at 1 (Minor) | Any non-zero renders; maximum visibility per the 16 D-11/D-12/D-16 tiebreaker. Cost: plausibly 7 yellow rows daily for months. | |
| Floor at 2, with a `showMinorHeat` sub-toggle | Default floor 2; flat boolean (default false) drops it to 1. Cost: a second sub-toggle in a codebase with exactly one. | ✓ |

**User's choice:** Floor at 2, with a `showMinorHeat` sub-toggle → **D-01**

### Q2 — Where does the display floor get applied?

Framed with the Phase 18 consequence: MERGE-03 needs to distinguish "HeatRisk said Minor" from
"HeatRisk had no reading."

| Option | Description | Selected |
|--------|-------------|----------|
| Frontend-only — Recommended | Backend emits the full day1–day7 block with raw 0–4; `getDom()` applies the floor. `showMinorHeat` never reaches node_helper. Phase 18 inherits every category. | ✓ |
| Backend applies it | `showMinorHeat` joins SUB_TOGGLES and the products object, mirroring `showDrought`. Cost: destroys MERGE-03's input. | |
| Full block + precomputed render flag | Both raw category and a per-day boolean. Cost: a new payload idiom, two fields that can disagree. | |

**User's choice:** Frontend-only → **D-02**

### Q3 — What does HeatRisk contribute to the no-risk short-circuit?

| Option | Description | Selected |
|--------|-------------|----------|
| One shared predicate — Recommended | A single helper is the sole source of both the render loop and the gate term. A Level 1 day with the toggle off renders nothing AND does not suppress the all-clear. | ✓ |
| Gate on any non-zero category | Any day ≥ 1 suppresses the all-clear. Cost: a blank module with no message all summer. | |
| HeatRisk does not participate | Cost: contradicts 16's finding and re-opens the Phase 15 defect class. | |

**User's choice:** One shared predicate → **D-03**

**Continue gate:** "Next area" — declined follow-ups on row wording, heat-wave row count,
palette source of truth, and block placement relative to the SPC day rows.

---

## NoData / missing-day semantics

### Q1 — How should NoData be treated?

| Option | Description | Selected |
|--------|-------------|----------|
| Partial silent, all-NoData stale — Recommended | Any resolved day proves the call and reprojection work → other NoData is genuine absence. All-NoData sets `anyStale` and logs once. Cost: permanent ⚠ for a truly out-of-coverage location. | ✓ |
| All NoData is silence | Simplest, consistent with 15 D-04. Cost: a reprojection regression reads as "no heat risk, forever" — the exact HEAT-03 failure mode. | |
| Any NoData sets stale | Most conservative. Cost: guaranteed noise from routine tail gaps; a badge usually wrong trains the user to ignore it. | |

**User's choice:** Partial silent, all-NoData stale → **D-04**

### Q2 — How should a missing day in the 1–7 grid be handled?

Framed on the live-observed response: 7 catalog items, 6 distinct `idp_validtime` values.

| Option | Description | Selected |
|--------|-------------|----------|
| Position-aware — Recommended | Tail gap = silence; Day 1 or interior gap = `anyStale` + log once. Cost: a compound condition needing mutation-proof in both branches. | ✓ |
| Any gap sets stale | One branch, trivially mutation-proven. Cost: the live-observed response would have fired the badge. | |
| Any gap is silence | Consistent with absence-is-silence. Cost: a missing Day 1 in a heat wave renders as no heat risk — violates "no false negatives". | |

**User's choice:** Position-aware → **D-05**

### Q3 — What happens when `Values` and `catalogItems` can't be safely paired?

| Option | Description | Selected |
|--------|-------------|----------|
| Zip first, then guard — Recommended | Build `{item, value}` tuples before any sort so desync is unrepresentable; precondition guard on absent/mismatched `Values` abandons the poll. | ✓ |
| Zip to the shorter length | Degrades rather than discards. Cost: front-truncation silently mis-attributes every surviving pair. | |
| Guard, then fall back to top-level `value` | Something rather than nothing. Cost: STACK live-observed that field tracking `catalogItemVisibilities`, not "today". | |

**User's choice:** Zip first, then guard → **D-06**

### Q4 — What `maxDataAgeHours` should the HeatRisk row declare?

Pre-answered without asking: 16 D-15's asymmetry carries forward unchanged (`anyStale` yes,
`_staleAsOf` no).

| Option | Description | Selected |
|--------|-------------|----------|
| 12h, per surviving item — Recommended | ~11 missed hourly cycles of slack; per-item mirrors 16 D-14's per-layer application and catches a partial rotation stall. | ✓ |
| 6h | Better detection on a fast-moving Day 1 event. Cost: closer to normal publishing jitter. | |
| 26h | Near-zero false positives. Cost: a stalled feed reads fresh for over a day — the hole DATA-02 exists to close. | |

**User's choice:** 12h, per surviving item → **D-07**

**Continue gate:** "Next area" — declined follow-ups on log-key bounding (WR-06 shape), whether
all-NoData should suppress the block entirely, and the mutation-proof design for D-05's branches.

---

## Parallel failure containment

Opened with an analysis result rather than a question: STATE.md's warning that
`_unusableFeatureCount` / `_oldestStaleAt` "must be revisited if `_inFlight` is bypassed in
Phase 17's `Promise.all`" does not land — `_inFlight` serializes across
`socketNotificationReceived` invocations, not within one, and both fields are order-independent
under intra-run concurrency (monotone counter sampled start-vs-end; min-reduce). Recorded in
CONTEXT.md as a verify-don't-assume note for planning.

### Q1 — `Promise.all` or `Promise.allSettled`?

| Option | Description | Selected |
|--------|-------------|----------|
| allSettled — Recommended | Each product settles independently; a rejection loses only its own payload. Avoids re-creating Phase 14 round-3's "total outage as confident all-clear". | ✓ |
| `Promise.all` | Simpler; the no-throw invariant genuinely holds. Cost: converts a comment-level invariant into a load-bearing one. | |
| `Promise.all` with per-call `.catch()` | Functionally equivalent, explicit per product. Cost: six near-identical catch blocks — the WR-06 divergence shape. | |

**User's choice:** allSettled → **D-08**

### Q2 — Which calls join the concurrent batch?

| Option | Description | Selected |
|--------|-------------|----------|
| All six, flat — Recommended | ERO, WSSI, hazards, HeatRisk, spcMD, mpd as one batch; the kml-advisory for-loop becomes a map. MPD's chain is the longest, so overlapping it is where the win is. | ✓ |
| Four data products; advisories stay sequential | Keeps the always-on `showSPCMD` path off the diff. Cost: leaves the longest chain serialized. | |
| Advisories join as one unit | Middle ground. Cost: mpd waits on spcMD for no reason; inherits D-08's complexity without its benefit. | |

**User's choice:** All six, flat → **D-09**

### Q3 — How is PERF-01 proven?

| Option | Description | Selected |
|--------|-------------|----------|
| Probe scenario + timing log — Recommended | Overlap asserted through the `_fetch` seam, mutation-provable per 15 D-10; plus per-member elapsed ms and batch wall clock — the instrument Phase 18's PERF-03 needs. | ✓ |
| Probe scenario only | Smallest diff. Cost: Phase 18 starts by building instrumentation; "timing" in the criterion unaddressed. | |
| Timing log only | Matches the criterion's literal wording, produces a real number. Cost: nothing pins the behavior against a future revert. | |

**User's choice:** Probe scenario + timing log → **D-10**

### Q4 — How should DATA-03 be enforced?

Raised because DATA-03 is a Phase 17 requirement (success criterion 5) that no offered area
covered.

| Option | Description | Selected |
|--------|-------------|----------|
| Load-time assertion + recorded spot check — Recommended | A fourth validator beside `daySpanOf` asserting no two rows share map object identity, plus a verification table for what identity cannot see (a `toValue` closure reading a foreign constant). | ✓ |
| Load-time assertion only | Consistent with the file's three validators. Cost: overstates its own coverage. | |
| Recorded spot check only | Literally what the criterion asks; covers closure bodies. Cost: a point-in-time artifact with nothing enforcing it afterward. | |

**User's choice:** Load-time assertion + recorded spot check → **D-11**

**Continue gate:** "Wrap up" — declined follow-ups on flattening concurrency inside the runners,
log-flood interaction, and a semaphore-based concurrency cap.

---

## Claude's Discretion

- Whether HeatRisk gets a `PRODUCT_REGISTRY` row at all, and if so its `kind` name and dispatch
  shape (15 D-01 left the slot open deliberately).
- Concurrency depth — offered as a gray area and not selected. D-09's shape implies ≤6
  product-level chains with internal loops sequential; that is the default.
- Row wording, per-day row layout, and the HeatRisk block's placement relative to the SPC day
  rows for the two phases before Phase 19.
- Palette source of truth (ImageServer rendering rule vs NWS documentation), with provenance
  cited either way per 15 D-08.
- Bounding of the once-only log keys introduced by D-04, D-05, D-06.
- Physical location of the parse/sort/dedupe helper, and whether the day-offset computation
  reuses `_utcMidnight()`.

## Deferred Ideas

- Flattening concurrency inside the runners (~20 concurrent sockets) — revisit only if Phase
  18's PERF-03 Pi measurement shows the batch is still the bottleneck.
- Parallelizing the existing ~25-hop SPC/fire-weather chain — largest available win, explicitly
  out of scope for PERF-01; candidate for v2.x.
- A semaphore-based concurrency cap on the batch — worth revisiting at a seventh product.
- Smoothing/hysteresis for HeatRisk's ~2540 m pixel boundary jitter — research says no
  turf-side fix; the v1.2 `PROX_MIN_WEIGHT` noise-floor precedent is the model if live flicker
  appears.
- HeatRisk row density during a sustained 7-day heat wave — superseded by Phase 19's rewrite.
- A startup control-query against a known-hot reference point to disambiguate D-04's
  all-NoData case — rejected as over-engineering for a fixed-location module.

## Notes

- No scope creep arose; every option considered stayed inside the phase boundary.
- No new canonical refs were introduced by the user mid-discussion; the refs list in CONTEXT.md
  was assembled from ROADMAP/REQUIREMENTS, the research set, prior CONTEXT files, and codebase
  scouting.
- `bm-sdk query todo.match-phase 17` returned zero matches — no todos folded or reviewed.
