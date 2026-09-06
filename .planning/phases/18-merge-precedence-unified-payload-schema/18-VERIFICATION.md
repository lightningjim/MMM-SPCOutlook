---
phase: 18-merge-precedence-unified-payload-schema
verified: 2026-09-06T02:00:00Z
status: gaps_found
score: 2/6 roadmap criteria fully verified (3 failed, 1 uncertain/not-observable)
has_blocking_gaps: true
overrides_applied: 0
gaps:
  - truth: "A hazard near a day boundary is placed using strict UTC time-window overlap, reconciling SPC 12Z-12Z / Hazards Outlook 00Z-00Z / ERO 01Z-12Z conventions (MERGE-01, ROADMAP criterion 1)"
    status: failed
    severity: blocking
    reason: >
      ROADMAP records criterion 1 as PASS on the strength of 18-10's fix and its
      18-LIVE-CAPTURE.md re-validation, but that re-validation replays only the single-day
      / zero-duration wpc-hazards case (start_date === end_date). Two independently
      source-confirmed defects remain outside that replay's coverage:
      (CR-03) node_helper.js:2884 `const lastGridDay = Math.max(gridStart, gridEnd - 1);`
      still treats a multi-day span's end_date exclusively. 18-LIVE-CAPTURE.md's own
      Criterion 1 section records that the Precipitation group -- the only group that
      reaches the unified day grid at all (Temperature and Wildfire/Drought route
      unconditionally to the window band) -- was observed emitting the INCLUSIVE form live.
      A Sep 8 -> Sep 10 inclusive span now emits grid days 4-5 (drops Sep 10) where the
      legacy `_bucketHazardMatch` (node_helper.js:2812-2813, an inclusive `d <=
      Math.min(offsetEnd, lastDay)` loop) emits 3-4-5. Phase 19 deletes the legacy block,
      turning this into an outright hazard-day loss on the only surviving representation.
      The probe suite does not merely fail to cover this -- `merge-grid-hazards-multi-day-
      exclusive-span-still-ends-on-its-last-covered-day` (scripts/probe-payload-
      resilience.js:9585) actively asserts grid day 8 must stay EMPTY for a Sep10->Sep12
      span ("an always-inclusive bound would populate this day, got..."), pinning the
      exclusive-only interpretation as correct and locking the gap in place.
      (CR-04) node_helper.js:2532-2547 `_spcGridAnchor` accepts any finite `expireMs`
      without checking it against the current clock. SPC's day-1 categorical layer is not
      replaced instantaneously at 12Z (this phase's own research comment records a live
      VALID 13:00Z / EXPIRE 12:00Z-next-day / ISSUE 12:54Z observation), and this module
      serves cached bodies for up to 2x the update interval besides. During that window the
      served EXPIRE_ISO is already in the past; `_spcGridAnchor` accepts it anyway, shifts
      the entire 14-day grid one day early, and reports `gridAnchor: "observed"` -- actively
      asserting the shifted anchor is trustworthy. This fires specifically for users
      standing inside an active day-1 SPC polygon (the only case where
      `_validTimeOfWinner` finds a value to anchor on), i.e. exactly the users for whom
      correct day attribution matters most. Both defects independently falsify the
      phase's own headline goal statement ("every hazard is attributed to the day its
      valid-time window actually covers"), not merely a corner of it.
    artifacts:
      - path: "node_helper.js:2884"
        issue: "lastGridDay = Math.max(gridStart, gridEnd - 1) drops the final day of any multi-day INCLUSIVE span; the fix only rescues the zero-duration degenerate case"
      - path: "node_helper.js:2532-2547"
        issue: "_spcGridAnchor never checks day1EndMs (derived from EXPIRE_ISO) against this._nowMs() before trusting it, so an already-elapsed EXPIRE_ISO anchors the whole grid a day early while reporting anchor: \"observed\""
    missing:
      - "Read the Hazards Outlook end_date endpoint inclusively for multi-day spans (or otherwise reconcile the two live-observed conventions), matching _bucketHazardMatch's own inclusive loop, so days[] and the legacy block agree"
      - "Reject an EXPIRE_ISO whose window (day1EndMs) has already elapsed in _spcGridAnchor and fall through to the clock-estimate branch, which is already correct for this case"
      - "A probe scenario for a genuinely inclusive multi-day Precipitation span (not just the zero-duration case), and a scenario feeding _spcGridAnchor a past-elapsed EXPIRE_ISO asserting anchor becomes \"estimated\""

  - truth: "HeatRisk's full registry-declared 7-day span reaches the unified days[] grid every poll, so its 5-level category is available wherever MERGE-03's precedence rule needs to compare it against WPC's binary flag"
    status: failed
    severity: blocking
    reason: >
      CR-02, confirmed by direct source read at node_helper.js:2986:
      `if (gridDay < 1 || gridDay > GRID_DAY_COUNT || gridDay > row.days) continue;`
      compares two incompatible day-numbering systems: `gridDay` is computed against the
      SPC-12Z grid anchor, while `row.days` (7) is HeatRisk's own span expressed in
      product-day units anchored at UTC midnight (`_todayUtcMs`). The two numbering systems
      differ by exactly one during the entire 00Z-12Z half of every UTC day, because
      `_spcGridAnchor`'s clock fallback resolves `nominalStartMs` to yesterday 12Z whenever
      `getUTCHours() < 12`. The `gridDay > row.days` term then silently discards the
      seventh (outermost) HeatRisk tile from `days[]` -- and, because the drop happens
      before `notes.noteReported` is ever called for that day, it also drops out of
      `sources.heatrisk.reportedDays`, so `_resolveGridDayPrecedence` takes its
      "absent" branch rather than "reported below floor": a genuine Extreme-heat reading is
      indistinguishable from HeatRisk never having covered that day at all. This is a
      heat-safety false negative on the project's own no-false-negative rule, on the NEW
      grid path this phase built (distinct from the already-filed, differently-shaped
      Phase 17 legacy `heatRisk.day1..day7` defect, which drops the near day, not the far
      one, and which the operator explicitly routed to Phase 19). It also means a WPC
      "Hazardous Heat" entry landing on that same dropped day would NOT be suppressed
      (nothing to suppress it with), so the user could see WPC's binary flag exactly where
      MERGE-03 requires HeatRisk's granular category to win. No probe scenario exercises
      this: every one of the 37 new merge-* scenarios pins `now` at or after 12:00Z
      (`MERGE_NOW_MS = Date.UTC(2026, 8, 5, 13, 0)`), so the 00Z-12Z branch this defect
      lives in is never reached by the suite.
    artifacts:
      - path: "node_helper.js:2986"
        issue: "gridDay > row.days compares a grid-day number against a differently-anchored product-day count"
    missing:
      - "Drop the `gridDay > row.days` term; GRID_DAY_COUNT is already the only bound expressed in grid-day units, and _addHazardsOutlookGridEntries correctly clamps to GRID_DAY_COUNT alone"
      - "A probe scenario pinned to a `now` inside 00Z-12Z (e.g. 06:00Z) supplying all 7 HeatRisk tiles and asserting all 7 land in days[]"

  - truth: "The backend emits one precomputed days/summary/sources/advisories payload the display can consume, degrading a single failed source rather than the whole response (criterion 5 / RPT-07, and the file's own documented Promise.allSettled per-member-degrade contract)"
    status: failed
    severity: blocking
    reason: >
      CR-01, confirmed by direct source read at all three cited sites. node_helper.js's own
      comment (lines ~4750-4761) states the contract explicitly: a rejected allSettled
      member substitutes `payload: null`, and every downstream consumer must guard against
      that so one product's failure degrades silently rather than throwing. Phase 18 added
      three reads that violate this contract with no guard:
      (1) node_helper.js:4887 `JSON.stringify(eroPayload.day1ValidTime)` -- no null check;
      fires on the first poll of every process.
      (2) node_helper.js:5013/5016 `_addRegistryDayGridEntries(gridDays, "wpc-ero",
      eroPayload, ...)` / `(..., wssiPayload, ...)` -- confirmed by reading
      `_addRegistryDayGridEntries` itself (node_helper.js:3261 onward): the function's only
      early return is the toggle gate (`productToggles[row.configFlag] !== true`), which
      does NOT fire when the product is enabled but its runner rejected; the day loop then
      does `payload[\`day${d}Risk\`]` on a null payload, throwing.
      (3) node_helper.js:5035 `_buildGridSummary(gridDays, hazardsPayload.windowBand, ...)`
      -- the property read happens at the call site, before `_buildGridSummary`'s internal
      `Array.isArray` guard ever runs; fires on every poll.
      Any one of the six allSettled members rejecting therefore throws a TypeError that
      escapes to `getSpcOutlook`'s outer catch, which returns `{ error: ... }`.
      MMM-SPCOutlook.js:421-422 confirmed: `wrapper.textContent = "Error: " +
      this.spcrisk.error` -- the entire display goes blank/error, including SPC convective
      and HeatRisk data that fetched cleanly in the same poll. This is precisely the "total
      outage rendering as a confident all-clear" shape the surrounding comment names and was
      written to prevent, now reintroduced by this phase for the identical reason. None of
      the 119 passing probe scenarios (verified by running `node scripts/probe-payload-
      resilience.js` at HEAD: 119 passed, 0 failed, 0 skipped) exercises the allSettled
      rejection branch, so this regression is invisible to the phase's own test suite.
    artifacts:
      - path: "node_helper.js:4887"
        issue: "JSON.stringify(eroPayload.day1ValidTime) with no null/falsy guard"
      - path: "node_helper.js:5013-5017"
        issue: "_addRegistryDayGridEntries has no guard for a null/rejected payload before its day loop dereferences it"
      - path: "node_helper.js:5035"
        issue: "hazardsPayload.windowBand dereferenced at the call site, ahead of _buildGridSummary's own internal Array.isArray guard"
    missing:
      - "Guard node_helper.js:4887 with eroPayload && before reading day1ValidTime"
      - "Add `if (!payload || typeof payload !== \"object\") return;` at the head of _addRegistryDayGridEntries, before the toggle gate, so both call sites are covered by one check"
      - "Pass hazardsPayload && hazardsPayload.windowBand into _buildGridSummary rather than the unguarded property read"
      - "A probe scenario that forces one allSettled member to reject (not merely fail its fetch) and asserts assertPayloadIntact(out) still holds -- the review notes none of the 119 existing scenarios covers this branch"
---

# Phase 18: Merge, Precedence & Unified Payload Schema Verification Report

**Phase Goal:** Every hazard is attributed to the day its valid-time window actually covers,
duplicate or superseded hazards across sources collapse correctly, and the backend emits one
precomputed payload the display can consume without recomputing precedence — backed by a real
cold-cache latency measurement.

**Verified:** 2026-09-06T02:00:00Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Summary Verdict

The phase's *construction* is real and substantial: `hazardTaxonomy.js` is a genuine static
artifact wired into `node_helper.js` and `assertTaxonomyIntegrity()` runs at `require()` time;
the fourteen-day grid, per-source grid-entry builders, dimension-keyed precedence resolver, and
`summary`/`sources` rollups all exist, are non-trivial, and are backed by 119 passing,
individually mutation-proven probe scenarios (confirmed by running the suite directly). Two
prior gap-closure waves (18-10, 18-11) genuinely fixed real live-capture-discovered defects.

However, an independent deep code review (`18-REVIEW.md`, commit `645673e`) found four Critical
issues in the code this phase shipped. I independently re-derived all four by reading the exact
cited source lines myself rather than trusting the review's narrative, and all four are real,
present in the shipped code today, and uncovered by the 119-scenario probe suite. Three of them
directly falsify a ROADMAP success criterion or the phase's own headline goal statement:

- **Criterion 1 / MERGE-01** — recorded PASS in ROADMAP.md, but that PASS rests on a replay that
  covers only the single-day/zero-duration case. A genuine multi-day inclusive span (the
  live-observed convention for the only hazards group that reaches the grid) still loses its
  last day (CR-03), and the grid anchor can shift an entire day early during SPC's daily
  re-issuance gap for users standing in an active severe-weather polygon (CR-04).
- **MERGE-03 / the unified grid's completeness** — HeatRisk's 7th day is silently dropped from
  `days[]` for half of every UTC day due to a unit-mismatched bound comparison (CR-02), a
  heat-safety false negative on the phase's own new grid path.
- **Criterion 5 / RPT-07's own documented resilience contract** — three unguarded reads Phase 18
  added convert a single rejected product fetch into a TypeError that destroys the ENTIRE
  payload, rendering `"Error: ..."` in place of every product including ones that fetched
  cleanly (CR-01).

Under this project's stated "no false negatives" value, a hazard silently disappearing (CR-02,
CR-03) or the entire display going blank on any transient product failure (CR-01) are the most
severe defect class this project defines. None of the four is covered by the probe suite; one
(CR-03) is actively locked in as "correct" by an existing scenario that pins the exclusive-only
convention.

The taxonomy artifact, the precedence resolver's dimension-keyed (never label-string) design,
and the under-merge behavior are all independently confirmed correct and well-tested. The gaps
below are narrow, specific, and each has an already-identified one-line-to-few-line fix — this is
a gap-closure situation, not a redesign.

## Goal Achievement

### Observable Truths (mapped to ROADMAP Phase 18 Success Criteria)

| # | Truth (ROADMAP criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Hazard placed on the day its valid-time window actually covers, incl. a real near-boundary case (MERGE-01) | ✗ FAILED | ROADMAP records PASS from 18-10/18-12's re-validation, but that replay covers only the zero-duration case. CR-03 (multi-day inclusive span still loses its last day, node_helper.js:2884) and CR-04 (`_spcGridAnchor` accepts an elapsed EXPIRE_ISO, node_helper.js:2532-2547) both independently falsify this for cases the replay never exercised. Source-verified directly. |
| 2 | SPC's granular tier suppresses WPC's derived Severe Weather flag, dimension-keyed not label-matched (MERGE-02) | ✓ VERIFIED (code path) / ? UNCERTAIN (payload, `unverifiable_runtime`) | `_resolveGridDayPrecedence` (node_helper.js:3356-3437) inspected directly: the suppression decision walks `PRECEDENCE[dimension]` against `entry.source`/`entry.dimension` only; no `label ===`, `.includes(`, or `indexOf(` appears in the decision block (only in the later D-15 sort comparator, on already-resolved ids). Live payload comparison is genuinely NOT OBSERVABLE today — zero `"Severe Weather"`-labeled features exist anywhere in the country per 18-LIVE-CAPTURE.md's fresh nationwide layer check — an honest abstention, not a code gap. |
| 3 | HeatRisk's 5-level category displays instead of WPC's binary Hazardous Heat flag (MERGE-03) | ✗ FAILED (see gap 2 above) | Precedence *rule* is correct and probe-verified (`merge-precedence-heatrisk-suppresses-wpc-hazardous-heat` and its zero/null siblings pass). But CR-02 means HeatRisk's day-7 reading can be entirely absent from the grid for half of every day, so the rule has nothing to suppress WPC's flag with on that day — a genuine HeatRisk reading silently disappears instead of displaying. |
| 4 | Two distinct hazards both appear; over-merge does not falsely hide one (MERGE-04) | ✓ VERIFIED (under-merge, live) / ? UNCERTAIN (over-merge, `unverifiable_runtime`) | Under-merge: live Florence, SC capture shows 3 concurrent distinct-dimension entries all `suppressedBy: null`, confirmed in 18-LIVE-CAPTURE.md. Over-merge: honestly recorded NOT OBSERVABLE — no live coordinate currently carries both a flash-flood and a heavy-precip feature (CONUS-only ERO vs. Alaska-reaching wpc-hazards coverage mismatch); mutation-proven synthetic scenario stands in as the only available evidence. This is a legitimate abstention, not a hidden defect. |
| 5 | Backend emits one `days`/`summary`/`sources`/`advisories` payload; no precedence left to recompute downstream (RPT-07) | ✗ FAILED | Structurally the shape is correct and the frontend does not reimplement any precedence logic (grep for `suppressedBy`/`PRECEDENCE` in MMM-SPCOutlook.js returns nothing — the new keys aren't rendered yet at all). But CR-01's three unguarded reads mean this "one payload" guarantee does not hold under a single product's fetch rejection: the whole payload collapses into `{ error }` and the display renders `"Error: ..."` for everything, confirmed by reading MMM-SPCOutlook.js:421-422. |
| 6 | Cold-cache run on target Raspberry Pi hardware produces a measured startup latency figure (PERF-03) | ✓ VERIFIED (deferred by design, per D-19) | Deliberately deferred to milestone close; a local cold-cache baseline (backend interval 4004ms, slowest source spc-inline at 2914ms) was recorded in 18-09-SUMMARY.md as the phase-scoped substitute, per this project's own D-19 decision. Not a gap. |

**Score:** 2/6 criteria fully VERIFIED, 3 FAILED (blocking), 1 UNCERTAIN in two places (both legitimate live-data abstentions, not code gaps).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `hazardTaxonomy.js` | Dimension map, precedence table, no-risk floor table, `assertTaxonomyIntegrity` | ✓ VERIFIED | 339 lines; all 11 documented exports present (`HAZARD_TAXONOMY, PRECEDENCE, NO_RISK_FLOOR, FLOOR_PREBAKED, DIMENSIONS, DIMENSION_ORDER, SOURCE_IDS, DAY_SOURCE_IDS, ADVISORY_SOURCE_IDS, dimensionOf, assertTaxonomyIntegrity`); `require("./productRegistry")` confirmed at line 20; `assertTaxonomyIntegrity()` confirmed called at module load, line 325. |
| `node_helper.js` grid machinery | `_spcGridAnchor`, `_buildGridDays`, `_gridDayOf`, `_addSpcGridEntries`, `_addRegistryDayGridEntries`, `_addHazardsOutlookGridEntries`, `_addHeatRiskGridEntries`, `_resolveGridDayPrecedence`, `_buildGridSummary`, `_buildSourceHealth` | ✓ VERIFIED, substantive, wired — but ⚠ HOLLOW under specific inputs | All functions exist, are non-trivial, and are called from `getSpcOutlook`'s return-assembly path (confirmed by direct read of lines 2500-3437, 4880-5040). CR-01/02/03/04 are correctness defects within otherwise-real implementations, not stubs. |
| `scripts/probe-payload-resilience.js` merge-* scenarios | 37 new mutation-proven scenarios per plans 18-07/18-08/18-10/18-11 | ✓ VERIFIED (existence + passing) / ⚠ one scenario locks in a gap | `node scripts/probe-payload-resilience.js` run directly: 119 passed, 0 failed, 0 skipped. `merge-grid-hazards-multi-day-exclusive-span-still-ends-on-its-last-covered-day` (line 9585) explicitly asserts the exclusive-only interpretation CR-03 identifies as wrong for the live-observed Precipitation convention. |
| `MMM-SPCOutlook.js` | PERF-03 wall-clock instrument | ✓ VERIFIED | `_startedAtMs`/first-populated-payload log present; new payload keys not yet rendered (correctly out of Phase 18's scope — Phase 19's job). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `hazardTaxonomy.js` | `productRegistry.js` | `require` | ✓ WIRED | Line 20. |
| `hazardTaxonomy.js` | `assertTaxonomyIntegrity` | module-load self-check | ✓ WIRED | Line 325, mirrors `productRegistry.js:568`. |
| `node_helper.js` | `hazardTaxonomy.js` | `require` | ✓ WIRED | Line 35, all 7+ names destructured and used (`dimensionOf`, `PRECEDENCE`, `NO_RISK_FLOOR`, etc.). |
| `getSpcOutlook` SPC inline locals | `days[N].hazards` | `_addSpcGridEntries` | ✓ WIRED | Confirmed direct read of in-memory `spcLocals`, no refetch. |
| `_resolveGridDayPrecedence` | `PRECEDENCE[dimension]` | dimension-keyed rank lookup | ✓ WIRED, correctly implemented | No label-string matching in the decision block (verified by targeted grep over the exact line range, per 18-LIVE-CAPTURE.md's own methodology, independently re-run). |
| `getSpcOutlook` allSettled batch | `eroPayload`/`hazardsPayload` consumers | per-member null guard | ✗ **NOT WIRED at 3 of the sites this phase added** | See CR-01 gap above — this is the single most consequential broken link in the phase. |
| MMM-SPCOutlook.js | new `days`/`summary`/`sources` payload keys | rendering | N/A — not yet wired | Correctly out of scope; Phase 19's job per ROADMAP. |

### Data-Flow Trace (Level 4)

Not applicable in the conventional sense — Phase 18 is backend-only, and the new `days`/`summary`/
`sources` keys are not yet rendered by any component (confirmed: no `suppressedBy`/`PRECEDENCE`/
`days\[` reference exists in `MMM-SPCOutlook.js`). The relevant "flow" to trace is
runner-rejection → payload-null → grid-assembly, traced above under CR-01: a null payload from a
rejected `Promise.allSettled` member flows unguarded into `_addRegistryDayGridEntries` and two other
sites, terminating in a thrown `TypeError` rather than the documented degrade-to-empty. This is a
disconnected/HOLLOW data path for the specific rejection case, not the happy path.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full probe suite passes at HEAD | `node scripts/probe-payload-resilience.js` | `PROBE RESULT: 119 passed, 0 failed, 0 skipped` | ✓ PASS (but does not cover CR-01/02/03/04 — confirmed by grepping the suite for an allSettled-rejection scenario and an inclusive multi-day / sub-12Z-clock scenario: none exist) |
| `_addRegistryDayGridEntries` has a null-payload guard | `sed -n '3261,3270p' node_helper.js` | Only guard present is the toggle gate; no `!payload` check | ✗ FAIL (confirms CR-01) |
| `_bucketHazardMatch`'s legacy loop treats end_date inclusively | `sed -n '2805,2816p' node_helper.js` | `for (let d = Math.max(offsetStart, firstDay); d <= Math.min(offsetEnd, lastDay); d++)` | Confirms the legacy/new-grid divergence CR-03 describes |
| `_spcGridAnchor` checks EXPIRE_ISO against the current clock | `sed -n '2528-2548p' node_helper.js` | Only checks `Number.isFinite(expireMs)`; no comparison against `this._nowMs()` | ✗ FAIL (confirms CR-04) |
| Frontend renders total error string on any payload error | `sed -n '418-423p' MMM-SPCOutlook.js` | `wrapper.textContent = "Error: " + this.spcrisk.error` | Confirms CR-01's blast radius |

### Probe Execution

No dedicated `scripts/*/tests/probe-*.sh` shell probes exist for this project; the probe surface is
`scripts/probe-payload-resilience.js`, run above under Behavioral Spot-Checks (119 passed, 0 failed,
0 skipped, run directly by me at HEAD — not taken from SUMMARY.md's narration).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| MERGE-01 | 18-02, 18-03, 18-04, 18-07, 18-09, 18-10 | Hazard placed on the day its valid-time window covers | ✗ **BLOCKED** | REQUIREMENTS.md marks Complete; CR-03 and CR-04 both directly contradict this for cases outside the 18-10 replay's coverage. |
| MERGE-02 | 18-01, 18-05, 18-08 | SPC's granular tier over WPC's derived flag, dimension-keyed | ✓ SATISFIED (code path); payload-level confirmation genuinely unavailable today | `_resolveGridDayPrecedence` inspected directly; correct. |
| MERGE-03 | 18-01, 18-05, 18-08 | HeatRisk's 5-level scale over WPC's binary flag | ⚠ **PARTIALLY BLOCKED** | Precedence rule itself is correct and probe-verified; CR-02 can remove HeatRisk's data from the comparison entirely for one day per poll cycle. |
| MERGE-04 | 18-01, 18-03, 18-04, 18-05, 18-08, 18-09, 18-12 | No over-merge, no under-merge | ✓ SATISFIED (under-merge, live-verified); over-merge honestly NOT OBSERVABLE | 18-LIVE-CAPTURE.md; legitimate abstention. |
| RPT-07 | 18-02, 18-05, 18-06, 18-08, 18-09, 18-11 | Frontend renders both detail levels from one backend payload, no recompute | ✗ **BLOCKED** | Shape and non-recompute property are correct; CR-01 breaks the "one payload" availability guarantee on any single-source rejection. |
| PERF-03 | 18-06, 18-09 | Measured cold-cache latency figure | ✓ SATISFIED (per D-19's deliberate scoping to a local baseline pending Pi hardware) | 18-09-SUMMARY.md: backend interval 4004ms, slowest source spc-inline 2914ms. |

No orphaned requirements: every ID REQUIREMENTS.md maps to "Phase 18" (MERGE-01..04, RPT-07,
PERF-03) appears in at least one plan's `requirements:` frontmatter field, and vice versa.

### Anti-Patterns Found

Full detail in `18-REVIEW.md` (commit `645673e`); summarized here, not restated in full. The four
Criticals are carried into Gaps above. Selected Warnings worth flagging for the eventual
gap-closure plan (not blocking on their own, but adjacent to the same code):

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `node_helper.js` | 3115, 3216, 3301 | `reportedDays` derived from a seeded default rather than a real fetch success signal | ⚠ Warning | Undercounts/overcounts `summary.reportingSourceCount`; a fetch failure reads as "answered, no risk" for 4 of 6 day-scoped sources |
| `node_helper.js` | 2919-2920 | `wpc-hazards` `reporting` only set true on days it finds a hazard | ⚠ Warning | Contradicts the field's own documented contract; undercounts on quiet polls |
| `node_helper.js` | 3303-3310 | Static taxonomy invariant re-asserted with a `throw` inside the per-day hot loop | ⚠ Warning | Same total-outage shape as CR-01 if it ever fires; should move to `assertTaxonomyIntegrity()` |
| `node_helper.js` | 3146-3152 | `detail.probRisk` is a boolean on days 1-2, a number on days 3-8 under one field name | ⚠ Warning | A Phase 19 renderer doing a numeric comparison silently mis-renders days 1-2 |
| `scripts/probe-payload-resilience.js` | 1294 | Every merge-* scenario pins `now >= 12:00Z` | ⚠ Warning | The entire 00Z-12Z behavior space (where CR-02 lives) is untested by the suite |

### Human Verification Required

None. All findings above were resolved by direct source inspection (I independently re-read every
cited line myself rather than trusting `18-REVIEW.md`'s narrative) and by running the probe suite
directly. No visual, real-time, or external-service behavior is in question — Phase 18 does not yet
render anything new to a human.

### Gaps Summary

Three blocking gaps, all confirmed by direct source inspection against the exact line numbers
cited, none covered by the 119-scenario probe suite:

1. **MERGE-01 / criterion 1** — the recorded PASS covers only the single-day case; a multi-day
   inclusive Precipitation span still loses its last day (CR-03), and the grid anchor can accept
   an already-elapsed `EXPIRE_ISO` and shift the whole grid a day early for users in an active
   severe-weather polygon (CR-04).
2. **MERGE-03 / grid completeness** — HeatRisk's 7th day is silently dropped from the unified grid
   for half of every UTC day due to a day-numbering unit mismatch (CR-02), a heat-safety false
   negative.
3. **RPT-07 / the payload's own documented resilience contract** — three unguarded reads convert
   any single rejected product fetch into a total payload failure rendered as `"Error: ..."`,
   destroying every other product's data in the same poll (CR-01).

All three have narrow, already-identified fixes (a few lines each, matching `18-REVIEW.md`'s
proposed patches, which I independently re-derived rather than copied verbatim) and are well
suited to a Phase 18 gap-closure plan (18-13) before Phase 19 begins, since Phase 19's own plan
explicitly assumes "the payload Phase 18 already validated" and performs no new-product or
correctness work of its own.

---

_Verified: 2026-09-06T02:00:00Z_
_Verifier: Claude (gsd-verifier)_
