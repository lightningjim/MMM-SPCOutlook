---
status: complete
phase: 19-unified-day-report-getdom-rewrite
requirement: RPT-06
source: [19-PARITY-CHECKLIST.md, 19-08-PLAN.md]
started: 2026-09-07T17:57:00Z
updated: 2026-09-07T00:00:00Z
---

# Phase 19 RPT-06 Human UAT

This record follows `18-HUMAN-UAT.md`'s format. It documents the two mandatory manual runs
required by `19-PARITY-CHECKLIST.md`, the checkpoint fixes they surfaced, and the two
supplementary runs the operator ran beyond the mandatory pair. Per-row `PASS`/`NOT OBSERVABLE`
verdicts live in `19-PARITY-CHECKLIST.md` itself (the `Run A`/`Run B` columns and each row's
`Notes` cell); this document is the narrative evidence those verdicts cite back to.

## Session Metadata

- **Session date:** 2026-09-07 (survey at 17:57Z; runs conducted afterward the same session)
- **Host:** deployed Raspberry Pi 4 Model B, MagicMirror, reached as `ssh mm`
  (`magicmirror.creasey.lan`). Module region: `top_right`.
- **Node version:** not independently re-measured this session. Phase 18's cold-start
  measurement on this same host (2026-09-06, `18-HUMAN-UAT.md`) recorded Node v24.13.1 on
  Raspberry Pi 4 Model B Rev 1.5 (aarch64) — cited as the last-known figure for this host, not a
  fresh measurement.
- **Coordinate selection method:** point-in-polygon survey of the live upstream feeds
  (not bounding-box) at 2026-09-07T17:57Z, ahead of picking any run's coordinate. Full survey:
  - SPC day1 categorical: `TSTM | MRGL | SLGT` nationwide (no ENH/MDT/HIGH anywhere); day2/day3:
    `TSTM | MRGL` only; days 4-8: "Predictability Too Low" everywhere (no probRisk content
    reachable this session).
  - `spc-fire`: `ELEV` only (day1/day2 windrh); "No Areas" on dryt.
  - `wpc-ero`: `dn=1` and `dn=2` only, nationwide.
  - `wpc-wssi`: a single tiny MINOR/MODERATE area near 46.0,-110.3 — not sampled by either run
    (seasonal; same disposition as the Phase 15 out-of-season close).
  - `wpc-hazards`: High Winds, Hazardous Heat, Heavy Rain, Severe Drought, Flooding Possible,
    Rapid Onset Drought Risk.
  - SPC MD: MD 2262 (north-central Montana, Severe Tstm Watch 662) EXPIRED at 070715Z.
    `ActiveMD.kmz` read "No Active MDs as of Mon Sep 7 07:15:02 UTC 2026" at survey time.
  - WPC MPD: none active.

## Coordinate Restore — NOT CONFIRMED in the operator record

Task 2's `how-to-verify` step 7 requires restoring `lat`/`lon` and the original config after the
session. **The operator record handed to this Task 3 agent does not state that the restore was
performed** for any of the four coordinates used (Run A's Eureka CA, Run B's Minot ND, the
Casper WY fire-weather supplementary run, or the detail-mode/HeatRisk supplementary run). This is
flagged here per T-19-36 rather than assumed. The deployed MagicMirror should be checked and, if
still pointed at a substitute coordinate, restored to its production `lat`/`lon` before this is
considered closed operationally. See `## Deferred Items — for STATE.md` at the end of this
document.

## Run A — "no risk anywhere"

**Coordinate:** Eureka, CA — `lat: 40.80, lon: -124.16`.

**Why chosen:** zero hits on every polygon layer surveyed above, with the nearest live polygon
edge 289 km away (a `wpc-ero` Marginal area), so it could not flip mid-run. HeatRisk there read
`1 1 1 1 0 0 0` (Minor on days 1-4, none on days 5-7) — all below the display floor
(`showMinorHeat` defaults false, floor `>= 2`), so this is a "reported but below floor" all-clear,
not a "never reported" one — a stronger test of the floor than a location with zero HeatRisk data
at all.

**Config used** (verbatim from `19-PARITY-CHECKLIST.md`):

```js
{
  module: "MMM-SPCOutlook",
  position: "top_left",
  config: {
    lat: 40.80,
    lon: -124.16,
    extended: true,
    updateInterval: 60,
    proximityWeighting: false,
    dayReportDetail: false,
    showExcessiveRain: true,
    showWinterImpact: true,
    showMPD: true,
    showHazardsOutlook: true,
    showHeatRisk: true,
    showSPCMD: true
  }
}
```

**Operator observation (verbatim substance):** the all-clear renders, and after gap-closure
commit `87b2a96` it reads **"No Hazards Forecast"** — the confident form, not the
`"(unconfirmed)"` form. Operator confirmed this reads correctly.

**Not separately confirmed:** whether a bare `⚠` badge with nothing beneath it was checked for
(CR-01's specific concern); the stale/unconfirmed variant was never induced this session (`_stale`
was never true), so the disqualification behavior itself and the real
`moment().fromNow()` age string remain untested this session.

**What this run actually exercised, precisely:** the early short-circuit gate
(`summaryOk && summary.anyHazard === false && !this.spcrisk._stale`, `MMM-SPCOutlook.js:699`)
fired directly, producing `NO_HAZARD_TEXT` at line 701. This is a *different* code path from the
`contentMarker` fallback (line 726/851-852) — the fallback branch was never reached this run, so
checklist row 9 (the fallback pattern itself) is recorded `NOT OBSERVABLE`, not `PASS`, despite
the correct string appearing on screen. The HeatRisk floor calibration (row 30) *is* directly
exercised — Eureka's live Minor-only HeatRisk data correctly produced zero content.

## Run B — "everything active at once"

**Coordinate:** Minot, ND — `lat: 48.23, lon: -101.30`.

**Why chosen:** live content confirmed via point-in-polygon check against the live KMZ/GeoJSON
(not a bounding-box approximation): `spc-convective` day-1 SLGT categorical; day-1 probabilistic
torn 0.02, hail 0.05, wind 0.05, plus `cighail` CIG1; `wpc-ero` day-1 `dn=1` (Marginal);
`wpc-hazards` temp d3-7 High Winds (`start_date = end_date = 2026-09-09`, a zero-duration
single-day shape).

**Config used** (verbatim from `19-PARITY-CHECKLIST.md`):

```js
{
  module: "MMM-SPCOutlook",
  position: "top_left",
  config: {
    lat: 48.23,
    lon: -101.30,
    extended: true,
    updateInterval: 60,
    proximityWeighting: true,
    dayReportDetail: true,
    showExcessiveRain: true,
    showWinterImpact: true,
    showMPD: true,
    showHazardsOutlook: true,
    showHeatRisk: true,
    showSPCMD: true
  }
}
```

**Operator observation (screenshot, verbatim substance):** a single day block reading

```
Day 1 (Mon)  Convective Slight · Flash Flood Marginal
```

followed by

```
Extended Hazards:
Wed (D2): High Winds        <- BEFORE gap-closure commit fb18000
```

and after `fb18000` the same line reads `Wed (D3): High Winds`. Operator confirmed correct.

**Directly supported by this observation:**
- the compact line renders with its two-space gap after `Day 1 (Mon)`
- the ` · ` separator between segments (checklist row 25 `PASS`)
- `<Dimension> <Label>` wording for both segments (checklist row 25 `PASS`)
- per-segment colors
- the `Extended Hazards:` heading written once (checklist row 26 `PASS`)
- the band rendering BELOW the day block (Intentional Change `RPT-04-RELOC` — CONFIRMED)
- a non-contiguous day list — only Day 1 rendered, no placeholder rows for other days
  (Intentional Change `D-03-SKIP` — CONFIRMED)
- no proximity badge / no probabilistic breakdown on the compact line
  (Intentional Change `D-07-RELOC` — CONFIRMED, at least the "absent from compact" half)
- correct weekday derivation: "Day 1 (Mon)" for 2026-09-07 (a Monday) and "Wed (D3)" for
  2026-09-09 (a Wednesday) — checklist row 23 `PASS`
- the window-band single-day `"(D3)"` format, post-`fb18000` — checklist row 27 `PASS`

**NOT observed despite `dayReportDetail: true` being configured:** no detail sub-row appeared in
the operator's transcript for Day 1 — only the compact line and the band. `getDom()`'s own logic
(`this.config.dayReportDetail === true || day.autoExpand === true` at `MMM-SPCOutlook.js:790`)
means a sub-row *should* render for any day with survivors when `dayReportDetail: true` is set,
regardless of auto-expand. The operator's accompanying note attributes the non-expansion to the
day's own **auto-expand** significance floor not clearing (SLGT is value 3 against
`spc-convective`'s `>= 4` significance floor; ERO Marginal is value 1 against `wpc-ero`'s `>= 3`
floor) — but that reasoning describes the *auto-expand* gate specifically, not the
`dayReportDetail` global override, and the transcript handed to this Task 3 agent does not
independently confirm a detail sub-row rendered at all. This Task 3 agent did not have access to
re-run or re-inspect the live render (per "Do NOT re-litigate Task 2"), so this is recorded as
disclosed uncertainty rather than resolved either way. Practical effect: checklist rows 12-17 (the
detail-mode-specific convective content: categorical badge relocation, probabilistic breakdown
line, per-hazard-type proximity badges, day-3 dual badge, day-3 CIG glyph, days 4-8 asymmetry) are
all recorded `NOT OBSERVABLE` for Run B — the compact-line *absence* of this content is confirmed
(`D-07-RELOC`), but the detail-mode *presence* at its new site was not confirmed by anything in
the transcript provided.

**Intentional changes not exercised this session:**
- `D-08-EXC` (a proximity-only badge-alone day at `proximityWeighting: true`) — no day without a
  surviving hazard appeared in the transcript, so this exception's own render path never fired.
- `SIGN-NOOP` (days 4-8 `sign` stays unrendered) — no live SPC convective days 4-8 probRisk
  content existed nationwide this session ("Predictability Too Low" everywhere per the survey), so
  there was no `sign` data to confirm remained unrendered.

## Supplementary Run — Fire Weather

**Coordinate:** Casper, WY — `lat: 42.85, lon: -106.31`. Not one of the two mandatory runs;
recorded here as corroborating evidence, cited by checklist rows 5/18's `Notes` cells but **not**
used to upgrade either row's `Run A`/`Run B` verdict, since it occurred outside the Eureka
CA/Minot ND procedures those columns specifically name.

**Operator observation (screenshot):**

```
Day 1 (Mon)  Fire Elevated
Day 2 (Tue)  Fire Elevated
```

and nothing else. Confirms fire-weather content flows through the same generic compact-segment
call site as every other dimension (checklist row 18's retirement claim), and that consecutive
days render contiguously.

## Supplementary Run — Detail Mode / HeatRisk

**Coordinate:** the operator's own home location (not recorded in the session notes handed to
this Task 3 agent; the operator states HeatRisk is already covered by their own location). Not
one of the two mandatory runs; recorded as corroborating evidence only.

**Before the alignment fix (`a440b31`):** detail sub-rows rendered with `Heat`/`Extreme` flung to
the far LEFT edge and `— HeatRisk` at the far RIGHT, the sub-row extending past the left edge of
its own day header — inverted indentation, sub-rows reading as siblings of the day headers rather
than children. Operator reported this as the confusing behavior that prompted the investigation.

**After `a440b31`:** operator stated **"That looks better."** — the detail column grid holds,
sub-rows sit under their headers. This is a qualitative confirmation, not a character-level
measurement; per honesty constraints it is **not** upgraded to a claim of precise column
alignment or a two-space-gap measurement — the MANUAL ONLY whitespace/alignment disclosures in
`19-PARITY-CHECKLIST.md`'s Probe Coverage section stand as written, with this qualitative note
added as context, not proof.

**Day blocks observed there:** Days 1-3 `Heat Extreme`, Day 4 `Heat Moderate` (compact, no
sub-row), Days 5-7 `Heat Major`, plus a band reading `Extended Hazards:` /
`Wed–Sat (D2–5): Hazardous Heat` (the D-number bug — since fixed by `fb18000`; this specific
range-format screenshot predates the fix and was not independently re-captured post-fix this
session, so the post-fix range format `"(D3–6)"` is a computed expectation, not a fresh
observation — see checklist row 27's note).

## Gap-Closure Commits (found during Task 2's checkpoint)

Four defects were found and fixed inline during the Task 2 checkpoint. None were pre-existing —
all four surfaced from Run A/Run B/the supplementary runs themselves. All are on this plan's base.

| Commit | What it fixed | Hardware re-confirmation |
|---|---|---|
| `a440b31` | Anchors the module's text stream left (`wrapper.style.textAlign = "left"`) so the detail-mode column grid holds. UI-SPEC's column contract measures offsets "from the left margin of the day block"; in a right-aligned MagicMirror region the wrapper inherited `text-align: right` and padded sub-rows extended past their header's left edge, inverting indentation. | YES — operator re-confirmed ("That looks better.") in the Supplementary Run — Detail Mode/HeatRisk above. |
| `512a97e` | Requires an auto-expand to add something the compact header cannot show — narrows `autoExpand` to also require either (a) >= 2 distinct sources on the day, or (b) a convective `detail` sub-object, so a single-source day with no detail no longer spends three lines to add one word. This AMENDS the locked 19-03 decision. | NOT independently re-confirmed live this session (operator-observed on a HeatRisk-only Extreme day per the commit's own description, prior to this checkpoint's transcript). 3 new probe scenarios landed with the fix and pass (see below). |
| `87b2a96` | Renames the all-clear string from `"No Severe Weather Risk"` to `"No Hazards Forecast"` — v1.x was SPC-convective-only and the old wording asserted something narrower than v2.0's merged gate (ERO, WSSI, MPD, CPC Hazards Outlook, HeatRisk) actually checks. | YES — operator re-confirmed on hardware at Run A ("No Hazards Forecast", confident form). |
| `fb18000` | Makes the hazards band speak the same day numbering as the grid — `_hazardDayOffset` is 0-based ("0 = today") but `Day N`/NWS product names are 1-based. DISPLAY: the band printed the raw offset ("Wed (D2)" under a Day-1-is-Monday list). ROUTING: `_isFullNominalWindow` compared 0-based offsets against 1-based `dayRange`, so D-04's full-window guard could never fire — closing the Phase 16 deferred row "live confirmation of D-04's full-window guard" from the code end (the guard was never observed firing because it could not). | YES — operator re-confirmed on hardware at Run B ("Wed (D3)", corrected from "Wed (D2)"). |

**Documented but not fixed** (per `fb18000`'s own commit message, carried here rather than
silently dropped): the LEGACY `hazardsOutlook.dayN` keys in `node_helper.js` are labelled by RAW
OFFSET — `day3.date` is `todayUtc + 3 days` (`node_helper.js:920`), i.e. NWS Day 4 — so that block
sits one higher than the NWS day it holds and cannot represent an offset-2 (NWS Day 3) feature at
all, its keys starting at `day3`. The unified `days[]` grid is unaffected. 19-09 retires the
legacy block, which is why this is documented rather than fixed here.

## Probe Suite Re-run (post gap-closure)

```
node scripts/probe-payload-resilience.js
PROBE RESULT: 157 passed, 0 failed, 0 skipped
```

157 vs. the pre-checkpoint 154: 3 new scenarios landed alongside the gap-closure fixes with no
failures or skips —
`haz-full-nominal-window-routes-to-the-band-and-an-off-window-span-does-not`,
`rpt02-autoexpand-requires-a-second-source-when-the-day-carries-no-detail`, and
`rpt04-band-day-numbers-are-1-based-like-every-day-block-above-them` (verified present via
`grep -n "name: \"<scenario>\"" scripts/probe-payload-resilience.js`).

## Intentional Changes — Verdicts

| ID | Change | Verdict | Evidence |
|---|---|---|---|
| `RPT-04-RELOC` | SPC MD/WPC MPD and the Hazards Outlook window band move to a combined band below all day blocks | **CONFIRMED** | Run B: band rendered below the Day 1 block |
| `D-07-RELOC` | Categorical proximity badge and SPC probabilistic breakdown move from compact line to detail mode only | **CONFIRMED (compact-absence half only)** | Run B: no badge/breakdown on the compact line. The detail-mode presence half was not independently confirmed — see Run B notes above |
| `D-03-SKIP` | Days with no surviving hazard render no row and no marker (non-contiguous list) | **CONFIRMED** | Run B: only Day 1 rendered, no placeholder rows |
| `D-08-EXC` | With `proximityWeighting: true`, a would-be-empty day renders badge alone | **NOT OBSERVABLE** | No day without a surviving hazard appeared in either mandatory run's transcript |
| `SIGN-NOOP` | `detail.sign` (days 4-8) stays unrendered | **NOT OBSERVABLE** | No live SPC convective days 4-8 probRisk content existed nationwide this session |

## Row Disposition Summary

Full per-row verdicts and reasons live in `19-PARITY-CHECKLIST.md`'s `Run A`/`Run B` columns and
`Notes` cells (each row's own `**Run A/B (19-08 Task 3)**` note). Summary:

- **PASS in at least one column:** 5 of 35 rows — row 23 (weekday derivation), row 25 (day-grid
  order/separator), row 26 (Extended Hazards heading, both columns), row 27 (window-band entry
  format), row 30 (HeatRisk `showMinorHeat` floor).
- **NOT OBSERVABLE in both columns:** 30 of 35 rows.
- **FAIL:** 0 rows.

Zero `FAIL` verdicts. The high `NOT OBSERVABLE` ratio is discussed directly in
`19-08-SUMMARY.md`'s reasoning about whether it makes sign-off dishonest — short answer: no, for
reasons stated there (probe suite proves mechanism for every one of these; the two runs proved the
renderer end-to-end against real live data and caught/confirmed four real defects; every
`NOT OBSERVABLE` has a specific, non-generic reason tied either to code-structure invisibility or
to what NOAA was actually reporting that day, not a shortfall in verification effort).

## Deferred Items — for STATE.md

(Ready-to-paste rows; the orchestrator applies these to `.planning/STATE.md`'s deferred table
after merge — see the parallel_execution note in this plan's launch prompt.)

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| Verification | Live confirmation of detail-mode convective sub-row content (checklist rows 12-17: categorical/probabilistic/per-hazard-type proximity badges, day-3 dual badge/CIG glyph, days 4-8 asymmetry) | Not confirmed — Run B's Day 1 (SLGT/Marginal) never independently confirmed a rendered detail sub-row in the operator's transcript despite `dayReportDetail: true`; probe suite (`rpt03-*` scenarios) stands as mechanism-level evidence | Phase 19-08 |
| Verification | Live confirmation of SPC MD / WPC MPD advisory band content in the new relocated band (checklist rows 10, 11, 35) | Deferred — no live MD or MPD was active during the 2026-09-07 session (`ActiveMD.kmz`: "No Active MDs"; WPC MPD: none); same disposition class as the Phase 15 MPD-01/MPD-02 rows | Phase 19-08 |
| Verification | Live confirmation of HeatRisk render/escaping content above the display floor in the new renderer (checklist rows 29, 31, 32) | Deferred — no above-floor HeatRisk content at either mandatory-run coordinate this session; qualitatively observed at the operator's home location in a supplementary run outside the two mandatory procedures | Phase 19-08 |
| Verification | Live confirmation of fire-weather day-span/color content within the two mandatory runs specifically (checklist rows 5, 18) | Deferred — neither Eureka CA nor Minot ND carried live fire weather; directly confirmed instead at Casper WY in a supplementary run outside the two mandatory procedures | Phase 19-08 |
| Verification | Live confirmation of the proximity noise-floor/badge-alone `D-08-EXC` exception and rounding (checklist rows 33, 34) | Deferred — no day without a surviving hazard appeared with `proximityWeighting: true` this session | Phase 19-08 |
| Verification | Live confirmation of `SIGN-NOOP` (days 4-8 `sign` stays unrendered) | Deferred — no live SPC convective days 4-8 probRisk content existed nationwide this session ("Predictability Too Low" everywhere) | Phase 19-08 |
| Verification | Live confirmation of hostile/oversized remote label handling (`validHazardColor`/`truncateHazardLabel`/`escapeHtml` guards at the shared compact-segment call site, checklist rows 20-22, 24) against real adversarial or oversized input | Deferred — only benign, short, well-formed live labels were observed; guard correctness is probe-mutation-proven only | Phase 19-08 |
| Verification | Live confirmation of the staleness-disqualifies-the-shortcut branch and the `contentMarker` unconfirmed-fallback string (checklist rows 4, 8, 9), including the real `moment().fromNow()` age string | Deferred — `_stale` was never true during the 2026-09-07 session; only the non-stale/confident-string path was exercised | Phase 19-08 |
| Verification | Live confirmation of the retired-construct rows' absence-of-regression beyond the composite all-clear outcome (checklist rows 3, 6, 19) | Deferred — these are code-structural claims about deleted legacy paths, not independently distinguishable on screen from any implementation producing the same outcome; probe-mutation-proven only | Phase 19-08 |
| Operational | Restore the deployed MagicMirror's `lat`/`lon` and config to production values after the Run A/Run B/supplementary substitute-coordinate testing on 2026-09-07 | **NOT CONFIRMED as done** — the operator record handed to this Task 3 agent does not state the restore occurred; verify on `ssh mm` before treating the live mirror as production-configured again | Phase 19-08 |
| Correctness | Legacy `hazardsOutlook.dayN` keys are labelled by raw (0-based) offset rather than the 1-based NWS day they hold (`node_helper.js:920`) — cannot represent an offset-2 (NWS Day 3) feature at all; the unified `days[]` grid is unaffected | Documented, not fixed — 19-09 retires the legacy block | Phase 19-08 (gap-closure commit `fb18000`) |
