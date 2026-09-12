---
phase: 18-merge-precedence-unified-payload-schema
verified: 2026-09-06T15:10:00Z
status: passed
score: 6/6 roadmap criteria verified (criterion 6 measured on target hardware 2026-09-06, after this report was first written)
has_blocking_gaps: false
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: "2/6 roadmap criteria fully verified (3 failed, 1 uncertain/not-observable)"
  gaps_closed:
    - "Criterion 1 / MERGE-01 (CR-03): _addHazardsOutlookGridEntries now reads the Hazards Outlook end_date endpoint INCLUSIVELY (lastGridDay = gridEnd, D-21), closed by 18-13"
    - "Criterion 1 / MERGE-01 (CR-04): _spcGridAnchor now rejects an already-elapsed EXPIRE_ISO (expireMs > this._nowMs()), closed by 18-14"
    - "Criterion 3 / MERGE-03 (CR-02): _addHeatRiskGridEntries bounded by GRID_DAY_COUNT alone, no more row.days unit-mismatch, closed by 18-15"
    - "Criterion 5 / RPT-07 (CR-01): three unguarded reads of a nullable Promise.allSettled payload now guarded (node_helper.js:4923, :3293, :5076), closed by 18-16"
  gaps_remaining: []
  regressions: []
human_verification_resolved: 2026-09-06 — see 18-HUMAN-UAT.md (status complete, passed 1). PERF-03 was measured on the target Raspberry Pi 4 Model B via `ssh mm`: three cold starts with all seven product toggles enabled gave backend intervals 4094 / 2159 / 2303 ms (median 2303 ms), wall clock to first result 4096 / 2161 / 2305 ms, slowest source `spc-inline` every run at ~55% of total. Pi is not slower than the x86 dev baseline (4004 ms). The item below is retained verbatim as the original finding.
human_verification:
  - test: "Run the module on the target Raspberry Pi hardware with every product toggle enabled, starting from a fresh process (cold in-memory cache), and record the logged backend-interval and wall-clock startup figures (ROADMAP criterion 6 / PERF-03)."
    expected: "A measured cold-cache latency figure from the actual target hardware is recorded (in STATE.md or a UAT record) before the v2.0 milestone closes."
    why_human: "No Raspberry Pi hardware is reachable from this verification environment. The instrumentation exists and was exercised locally (18-06-SUMMARY.md: backend interval 4004ms, slowest source spc-inline 2914ms), but that is a local baseline, not the target-hardware figure ROADMAP criterion 6 and PERF-03 require. This is deliberately scoped to milestone close, not phase close, per locked decision D-19 (18-CONTEXT.md), and remains an open blocker in STATE.md's carried-forward items list — confirmed present at STATE.md:94 ('Phase 18 PERF-03 requires a real cold-cache latency measurement on target Raspberry Pi hardware before the milestone can close.'). Marking this VERIFIED without the actual hardware figure would be guessing; marking it FAILED would contradict the project's own explicit, operator-approved scoping decision. It genuinely needs a human with physical access to the Pi."
---

# Phase 18: Merge, Precedence & Unified Payload Schema Verification Report

**Phase Goal:** Every hazard is attributed to the day its valid-time window actually covers,
duplicate or superseded hazards across sources collapse correctly, and the backend emits one
precomputed payload the display can consume without recomputing precedence — backed by a real
cold-cache latency measurement.

**Verified:** 2026-09-06T15:10:00Z
**Status:** human_needed
**Re-verification:** Yes — after gap closure (4 plans: 18-13, 18-14, 18-15, 18-16)

## Re-verification Summary

The prior `18-VERIFICATION.md` (2026-09-06T02:00:00Z) found 3 blocking gaps (CR-01, CR-02,
CR-03+CR-04) across criteria 1, 3, and 5, all independently confirmed by direct source read.
Four gap-closure plans have since executed. I re-read every cited line myself against current
`HEAD` rather than trusting the SUMMARYs' narration, and independently ran the full probe suite
and the concurrency-invariant script.

**All three previously-blocking gaps are closed, confirmed at the source line level:**

| Gap (prior gap #) | Fix | Confirmed at |
|---|---|---|
| CR-03 (multi-day inclusive Hazards Outlook span loses its last day) | `const lastGridDay = gridEnd;` (D-21) | `node_helper.js:2899` |
| CR-04 (`_spcGridAnchor` trusts an elapsed `EXPIRE_ISO`) | `if (Number.isFinite(expireMs) && expireMs > this._nowMs())` | `node_helper.js:2541` |
| CR-02 (HeatRisk's 7th tile dropped for 00Z-12Z of every UTC day) | `if (gridDay < 1 \|\| gridDay > GRID_DAY_COUNT) continue;` (row.days term removed) | `node_helper.js:3007` |
| CR-01 (unguarded nullable-payload reads collapse the whole payload to `{ error }`) | Three guards: `eroPayload &&`, head-of-function `!payload \|\| typeof payload !== "object"` return, `hazardsPayload &&` | `node_helper.js:4923`, `:3293`, `:5076` |

No regressions: `node scripts/probe-payload-resilience.js` run directly at `HEAD` →
`PROBE RESULT: 123 passed, 0 failed, 0 skipped` (up from the prior verification's 119; the four
gap-closure plans added 4 net new scenarios, all passing). `bash
scripts/check-concurrency-invariant.sh` also passes clean (all 4 mutation-write sites clean).

**One item remains open and is reclassified here** (was marked "✓ VERIFIED (deferred by design)"
in the prior verification; that classification undersold what's actually missing): criterion 6 /
PERF-03's target-hardware Raspberry Pi figure. This is not a code gap — it is explicitly and
correctly scoped to milestone close rather than phase close per locked decision D-19, approved by
the operator at the time. But no agent, including this verification pass, can produce a real
hardware measurement from this environment, and the actual figure does not yet exist as recorded
evidence anywhere in the phase artifacts or STATE.md (only a local-cold-start baseline does).
Silently marking it VERIFIED would be inaccurate; marking it FAILED would contradict the project's
own explicit scoping decision. It is routed to human verification, which is the correct
classification for "real, defined behavior confirmable only by running it on hardware this
environment does not have."

## Goal Achievement

### Observable Truths (mapped to ROADMAP Phase 18 Success Criteria)

| # | Truth (ROADMAP criterion) | Status | Evidence |
|---|---|---|---|
| 1 | Hazard placed on the day its valid-time window actually covers, incl. a real near-boundary case (MERGE-01) | ✓ VERIFIED | Both CR-03 and CR-04 confirmed fixed at the cited source lines (see table above). `merge-grid-hazards-multi-day-span-covers-through-its-end-date`, `merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block`, and `merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated` all pass in the live suite run. Each fix is mutation-proven (18-13's M1/M2/M4, 18-14's M1/M2) with verbatim RED failure text recorded in the SUMMARYs and independently plausible against the guard logic read directly. |
| 2 | SPC's granular tier suppresses WPC's derived Severe Weather flag, dimension-keyed not label-matched (MERGE-02) | ✓ VERIFIED (code path) / ? UNCERTAIN (payload, `unverifiable_runtime`) | `_resolveGridDayPrecedence` (node_helper.js:3379-3437) re-inspected directly: unchanged by any of the four gap-closure plans (none touch this function). No `label ===`/`.includes(`/`indexOf(` in the decision block. Live payload comparison remains genuinely NOT OBSERVABLE — no live "Severe Weather"-labeled feature exists anywhere in the country per 18-LIVE-CAPTURE.md, unchanged since the prior verification. Honest abstention, not a code gap; non-blocking. |
| 3 | HeatRisk's 5-level category displays instead of WPC's binary Hazardous Heat flag (MERGE-03) | ✓ VERIFIED | CR-02 confirmed fixed at `node_helper.js:3007`: the `gridDay > row.days` unit-mismatch term is gone, bound is `GRID_DAY_COUNT` alone. `merge-grid-heatrisk-all-seven-tiles-land-under-a-sub-12z-clock` (the suite's first sub-12Z scenario, `HEATRISK_MORNING_NOW_MS` = 06:00Z) passes live, proving all 7 tiles now land in `days[]` and `sources['heatrisk'].reportedDays` during the previously-affected half of every UTC day. Mutation-proven (18-15's M1 restores the term and reproduces the exact prior failure naming grid day 8; M2 proves the scenario genuinely depends on the sub-12Z anchor branch). |
| 4 | Two distinct hazards both appear; over-merge does not falsely hide one (MERGE-04) | ✓ VERIFIED (under-merge, live) / ? UNCERTAIN (over-merge, `unverifiable_runtime`) | Unchanged since the prior verification (no gap-closure plan touches merge/precedence dimension logic or re-runs a live capture). Under-merge: live Florence, SC capture shows 3 concurrent distinct-dimension entries all `suppressedBy: null` (18-LIVE-CAPTURE.md). Over-merge: honestly recorded NOT OBSERVABLE — no live coordinate currently carries both a flash-flood and a heavy-precip entry (the only candidate feature, Kotzebue AK "Heavy Rain", was valid through 2026-09-10 and is not guaranteed to still exist upstream); `merge-flash-flood-and-heavy-precip-never-cross-suppress` stands in as mutation-proven synthetic coverage. Legitimate abstention, not a hidden defect; non-blocking. |
| 5 | Backend emits one `days`/`summary`/`sources`/`advisories` payload; no precedence left to recompute downstream (RPT-07) | ✓ VERIFIED | CR-01 confirmed fixed at all three cited sites (see table above). `18-REVIEW.md`'s independent re-derivation agrees. `rpt07-rejected-runner-degrades-alone-not-the-whole-payload` (new in 18-16) forces two different runner rejections and asserts `out.error === undefined` while every non-rejected product's block stays intact — this is the exact scenario class the prior verification found the suite lacked. Mutation-proven: each of the three guards independently reverted reproduces the `{ error }` collapse (verbatim `TypeError` messages recorded in 18-16-SUMMARY.md), confirming all three are load-bearing rather than redundant. `MMM-SPCOutlook.js:421` (`wrapper.textContent = "Error: " + this.spcrisk.error`) is unchanged, but the payload no longer reaches that branch on a single rejected member — the display-side blast radius that made CR-01 severe no longer triggers on this input class. |
| 6 | Cold-cache run on target Raspberry Pi hardware produces a measured startup latency figure (PERF-03) | ? HUMAN NEEDED | See Human Verification Required below. Instrumentation exists and is exercised (local baseline: backend interval 4004ms, slowest source spc-inline 2914ms — 18-06-SUMMARY.md), but the actual target-hardware figure does not exist as recorded evidence anywhere in this repo. STATE.md:94 still carries the open blocker verbatim, confirming the project itself has not yet closed this. |

**Score:** 5/6 criteria fully VERIFIED (2 of those 5 carry a non-blocking, honestly-abstained
UNCERTAIN sub-case each — MERGE-02's payload half, MERGE-04's over-merge half — both unchanged
live-data-availability limitations, not code gaps). 1 criterion routed to human verification
(cannot be satisfied from this environment).

### Required Artifacts

| Artifact | Expected | Status | Details |
|---|---|---|---|
| `hazardTaxonomy.js` | Dimension map, precedence table, no-risk floor table, `assertTaxonomyIntegrity` | ✓ VERIFIED | Unchanged by the four gap-closure plans (none touch this file); previously confirmed 339 lines, all 11 documented exports present, `assertTaxonomyIntegrity()` called at module load. |
| `node_helper.js` grid machinery | `_spcGridAnchor`, `_buildGridDays`, `_gridDayOf`, `_addSpcGridEntries`, `_addRegistryDayGridEntries`, `_addHazardsOutlookGridEntries`, `_addHeatRiskGridEntries`, `_resolveGridDayPrecedence`, `_buildGridSummary`, `_buildSourceHealth` | ✓ VERIFIED, substantive, wired, and — per the four gap-closure fixes — no longer hollow under the previously-identified input classes | Every function re-read directly at current `HEAD`. `_addHazardsOutlookGridEntries` (D-21 inclusive bound), `_spcGridAnchor` (elapsed-EXPIRE_ISO guard), `_addHeatRiskGridEntries` (GRID_DAY_COUNT-only bound), and `_addRegistryDayGridEntries` (head-of-function null guard) all confirmed corrected in place. |
| `scripts/probe-payload-resilience.js` merge-* scenarios | Mutation-proven coverage for the four fixed defects, plus prior 37 MERGE-* scenarios | ✓ VERIFIED (existence + passing) | `node scripts/probe-payload-resilience.js` run directly: `123 passed, 0 failed, 0 skipped`. 4 new scenarios since the prior verification (up from 119): `merge-grid-hazards-multi-day-inclusive-span-matches-the-legacy-block`, `merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated`, `merge-grid-heatrisk-all-seven-tiles-land-under-a-sub-12z-clock`, `rpt07-rejected-runner-degrades-alone-not-the-whole-payload`. |
| `MMM-SPCOutlook.js` | PERF-03 wall-clock instrument | ✓ VERIFIED | Unchanged by the four gap-closure plans. `_startedAtMs`/first-populated-payload log present; new payload keys still not rendered (correctly out of Phase 18 scope). |

### Key Link Verification

| From | To | Via | Status | Details |
|---|---|---|---|---|
| `getSpcOutlook` allSettled batch | `eroPayload`/`hazardsPayload`/`_addRegistryDayGridEntries` consumers | per-member null guard | ✓ WIRED (was NOT WIRED at 3 sites) | All three sites now guard against a `null` payload before the first dereference: `eroPayload && eroPayload.day1ValidTime` (:4923), head-of-function `if (!payload \|\| typeof payload !== "object") return;` in `_addRegistryDayGridEntries` (:3293, covers both its call sites at :5049/:5052), `hazardsPayload && hazardsPayload.windowBand` (:5076). |
| `_addHazardsOutlookGridEntries` | `days[].hazards` | inclusive `end_date` bound | ✓ WIRED, correctly implemented | `lastGridDay = gridEnd` (D-21), clamp still enforced at the loop header (`Math.min(lastGridDay, GRID_DAY_COUNT)`), confirmed unchanged and non-negotiable per the plan's own decision record. |
| `_spcGridAnchor` | `anchor: "observed" | "estimated"` | elapsed-window check | ✓ WIRED, correctly implemented | `expireMs > this._nowMs()` gates the observed branch; an elapsed `EXPIRE_ISO` now correctly falls through to the clock estimate. |
| `_addHeatRiskGridEntries` | `days[].hazards` / `sources['heatrisk'].reportedDays` | `GRID_DAY_COUNT`-only bound | ✓ WIRED, correctly implemented | `row.days` unit-mismatch term removed; confirmed by direct read and the new sub-12Z scenario passing. |
| MMM-SPCOutlook.js | new `days`/`summary`/`sources` payload keys | rendering | N/A — not yet wired | Correctly out of scope; Phase 19's job per ROADMAP. Confirmed no `suppressedBy`/`PRECEDENCE`/`days[` reference exists in `MMM-SPCOutlook.js` (27 unrelated hits on `windowBand`/`_addRegistryDayGridEntries`-adjacent tokens, none of them frontend precedence recomputation). |

### Data-Flow Trace (Level 4)

Not applicable in the conventional sense — Phase 18 remains backend-only; the new `days`/
`summary`/`sources` keys are still not rendered by any component. The relevant "flow" to trace
is runner-rejection → payload-null → grid-assembly, previously found disconnected (CR-01) and now
confirmed reconnected: a `null` payload from a rejected `Promise.allSettled` member now flows
through the three guarded sites and degrades to the documented empty/null block rather than
throwing, confirmed both by direct source read and by the `rpt07-rejected-runner-degrades-alone-
not-the-whole-payload` scenario forcing the actual rejection and asserting the rest of the payload
survives.

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|---|---|---|---|
| Full probe suite passes at HEAD | `node scripts/probe-payload-resilience.js` | `PROBE RESULT: 123 passed, 0 failed, 0 skipped` | ✓ PASS |
| Concurrency invariant holds | `bash scripts/check-concurrency-invariant.sh` | `check-concurrency-invariant: all sites clean` | ✓ PASS |
| CR-03 fix present | `sed -n '2895,2899p' node_helper.js` | `const lastGridDay = gridEnd;` with D-21 comment naming 18-10 as superseded | ✓ PASS |
| CR-04 fix present | `sed -n '2532,2543p' node_helper.js` | `if (Number.isFinite(expireMs) && expireMs > this._nowMs())` | ✓ PASS |
| CR-02 fix present | `sed -n '2995,3007p' node_helper.js` | `if (gridDay < 1 \|\| gridDay > GRID_DAY_COUNT) continue;` — no `row.days` term | ✓ PASS |
| CR-01 fix present (3 sites) | `sed -n '4920,4924p;3286,3293p;5073,5077p' node_helper.js` | All three guards present exactly as SUMMARYs describe | ✓ PASS |
| WR-02/renderDayBlock still unguarded (disclosed, not required to be fixed by any of the 4 plans) | `sed -n '604,614p' MMM-SPCOutlook.js` | `block["day"+d+"Color"]`/`block["day"+d+"Text"]` interpolated into `innerHTML` with no `validHazardColor()`/`escapeHtml()` | Confirmed present as disclosed — see Anti-Patterns |
| M3 coverage hole still open (disclosed, not required to be closed) | grep for an `end_date`-past-day-14 probe scenario | none found; 18-13-SUMMARY.md's own disclosure stands | Confirmed still open — see Anti-Patterns |

### Probe Execution

No dedicated `scripts/*/tests/probe-*.sh` shell probes exist for this project; the probe surface
is `scripts/probe-payload-resilience.js`, run above under Behavioral Spot-Checks (123 passed, 0
failed, 0 skipped, run directly by me at HEAD).

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|---|---|---|---|---|
| MERGE-01 | 18-02, 18-03, 18-04, 18-07, 18-09, 18-10, 18-12, 18-13, 18-14 | Hazard placed on the day its valid-time window covers | ✓ SATISFIED | Both CR-03 (18-13) and CR-04 (18-14) confirmed fixed at source; probe suite green. |
| MERGE-02 | 18-01, 18-05, 18-08, 18-09 | SPC's granular tier over WPC's derived flag, dimension-keyed | ✓ SATISFIED (code path); payload-level confirmation genuinely unavailable today | `_resolveGridDayPrecedence` unchanged, correct. |
| MERGE-03 | 18-01, 18-05, 18-08, 18-15 | HeatRisk's 5-level scale over WPC's binary flag | ✓ SATISFIED | CR-02 confirmed fixed; sub-12Z scenario passes. |
| MERGE-04 | 18-01, 18-03, 18-04, 18-05, 18-08, 18-09, 18-12 | No over-merge, no under-merge | ✓ SATISFIED (under-merge, live-verified); over-merge honestly NOT OBSERVABLE | Unchanged since prior verification; legitimate abstention. |
| RPT-07 | 18-02, 18-05, 18-06, 18-08, 18-09, 18-11, 18-16 | Frontend renders both detail levels from one backend payload, no recompute | ✓ SATISFIED | CR-01 confirmed fixed at all three sites; forced-rejection scenario passes. |
| PERF-03 | 18-06, 18-09 | Measured cold-cache latency figure | ? NEEDS HUMAN | Instrumentation shipped and locally verified; target-hardware figure does not exist as recorded evidence, per D-19's explicit milestone-close scoping. |

No orphaned requirements: every ID REQUIREMENTS.md maps to "Phase 18" (MERGE-01..04, RPT-07,
PERF-03) appears in at least one plan's `requirements:` frontmatter field, and vice versa
(confirmed by grepping every `18-*-PLAN.md`/`18-*-SUMMARY.md` `requirements`/
`requirements-completed` field).

### Anti-Patterns Found

Carried forward from `18-REVIEW.md` (commit `cfd13af`, post-gap-closure re-review: 0 critical, 1
warning) plus the disclosed, intentionally-unclosed coverage hole from 18-13. Neither is blocking
— both are known, documented, and either non-exploitable today or a coverage gap over an
already-correctly-clamped invariant.

| File | Line | Pattern | Severity | Impact |
|---|---|---|---|---|
| `MMM-SPCOutlook.js` | 604-614 | `renderDayBlock`'s `day{N}Color`/`day{N}Text` interpolate into `innerHTML` without `validHazardColor()`/`escapeHtml()`, unlike every sibling renderer in the same file | ⚠ Warning | Not currently exploitable — both fields are sourced from closed, module-authored lookup tables (`productRegistry.js`), never raw upstream strings. But the invariant is unenforced locally at this call site, and `renderDayBlock` is a shared renderer that will land future `arcgis-day-layers` rows too. `18-REVIEW.md` provides the exact one-line fix (route both fields through `validHazardColor()`/`escapeHtml()`); not addressed by any of the 4 gap-closure plans, correctly out of their scope. |
| `node_helper.js` | ~2895 (the `Math.min(lastGridDay, GRID_DAY_COUNT)` clamp) | The fourteen-day bound-overflow path in `_addHazardsOutlookGridEntries` has zero probe coverage (18-13's M3 mutation produced 0 RED scenarios) | ⚠ Warning | The clamp itself is present and correct (confirmed by direct read); this is a coverage gap, not a code defect. Deliberately disclosed rather than closed, per the 18-13 plan's own explicit instruction not to add a scenario for it in that plan. |
| `node_helper.js` | 3115, 3216, 3301 (per 18-REVIEW.md) | `sources[].reportedDays` fetch-FAILURE half of WR-01 still records a hard fetch failure as "the source answered no risk" for `wpc-ero`/`wpc-wssi`/`spc-convective`/`spc-fire` | ⚠ Warning | Diagnostic-accuracy issue (`summary.reportingSourceCount` can over-count on a fetch failure), not a display/precedence-correctness issue — no ROADMAP criterion or requirement wording depends on this field's failure-vs-answered distinction. 18-16 closed the TOGGLE-OFF half (18-11) and the runner-REJECTION half (18-16); the FETCH-FAILURE half is explicitly tracked open in `deferred-items.md` with a named future fix. |

### Human Verification Required

### 1. Cold-cache latency measurement on target Raspberry Pi hardware (PERF-03 / ROADMAP criterion 6)

**Test:** Start the module on the target Raspberry Pi hardware from a fresh process (no
in-memory cache — this module's only cache, per `node_helper.js:186`, is cleared by any process
restart) with every product toggle enabled. Let the instrumentation already shipped in Phase 18
(18-06) log its once-per-cold-start figures: the backend interval (`GET_SPC_DATA` received →
`SPC_DATA_RESULT` emitted, with the per-product breakdown naming the slowest fetch) and the
frontend wall-clock figure (module start → first populated render).

**Expected:** A measured cold-cache latency figure from the actual target hardware, recorded
somewhere durable (STATE.md, a UAT record, or a phase artifact) before the v2.0 milestone closes.

**Why human:** No Raspberry Pi is reachable from this verification environment. This is not a
code gap — the instrumentation exists, is wired correctly, and was exercised against a local cold
start (18-06-SUMMARY.md: backend interval 4004ms, slowest source spc-inline 2914ms). But that
local figure is explicitly NOT the target-hardware figure ROADMAP criterion 6 requires, and the
project's own locked decision D-19 (18-CONTEXT.md) deliberately scoped the real Pi measurement to
milestone close rather than phase close, with the open item still tracked verbatim in
`.planning/STATE.md` ("Phase 18 PERF-03 requires a real cold-cache latency measurement on target
Raspberry Pi hardware before the milestone can close."). This can only be resolved by a human with
physical access to the target hardware.

### Gaps Summary

No blocking gaps remain. All three gaps the prior verification found (MERGE-01/criterion 1,
MERGE-03/criterion 3, RPT-07/criterion 5) are closed and independently re-confirmed at the exact
source lines by direct inspection, not by trusting the SUMMARYs. The probe suite grew from 119 to
123 passing scenarios with zero regressions, and each of the four fixes carries its own mutation
proof recorded verbatim in the relevant SUMMARY and spot-checked here.

One item is routed to human verification rather than silently passed or failed: criterion 6 /
PERF-03's actual target-hardware measurement, which genuinely cannot be produced from this
environment and does not yet exist as recorded evidence, though it is correctly and deliberately
scoped to milestone close (not phase close) per the project's own D-19 decision.

Two non-blocking, disclosed items remain open by design and are carried forward rather than
re-litigated here: `renderDayBlock`'s missing defense-in-depth guards (WR-02, not currently
exploitable), and the fourteen-day bound-overflow coverage hole in `_addHazardsOutlookGridEntries`
(a correct clamp with no probe scenario exercising it). Neither blocks the phase goal; both are
candidates for a future backlog item if the team wants closure before Phase 19 removes the legacy
code paths they're adjacent to.

---

_Verified: 2026-09-06T15:10:00Z_
_Verifier: Claude (gsd-verifier)_
