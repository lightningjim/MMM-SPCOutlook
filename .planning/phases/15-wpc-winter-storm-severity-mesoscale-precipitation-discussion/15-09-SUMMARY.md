---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 09
subsystem: probe-harness
tags: [testing, mpd, wssi, mutation-testing, offline-verification, d-10, checkpoint]
status: complete

# Dependency graph
requires:
  - phase: 15-06
    provides: "MPD CDATA field parsing, parseMpdValidEnd, wpc-mpd-listing discovery, the per-candidate MPD-04 validity gate (_prepareMpdEntry)"
  - phase: 15-08
    provides: "mdKml/mpdKml/activeIndexKml/kmzOf/advisoryRoutes/noRiskPayloadWithAdvisory shared KMZ/KML fixture builders"
  - phase: 15-02
    provides: "makeKmzBuffer and the real-dependency probe harness (adm-zip/@xmldom/xmldom/@tmcw/togeojson/xpath resolution)"
provides:
  - "Six mutation-proven mpd-* scenarios covering MPD-02, MPD-03, MPD-04, D-04, D-06, and the fail-open no-false-negatives guarantee"
  - "mpdWindowFields/mpdListingHtml fixture helpers (Date.now()-relative, no hardcoded absolute dates)"
  - "The phase-wide D-10 mutation inventory covering all 17 scenarios added across plans 15-02, 15-05, 15-08, 15-09"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "mpdWindowFields derives a live-shaped IssueTime/ValidEndTi pair from a single target UTC instant by delegating to the same tz-offset table the code under test uses, computed relative to Date.now() rather than hardcoded"
    - "MPD-04's fixture gives every listing candidate a FRESH Last-Modified timestamp so only the authoritative ValidEndTi gate — never the 48h pre-filter — can be what rejects a stale candidate"

key-files:
  created: []
  modified:
    - scripts/probe-payload-resilience.js

key-decisions:
  - "Mutation 1 (highest-filename-number selection) was applied at the _runKmlAdvisoryRow candidate-selection level rather than by editing _prepareMpdEntry's internals, since the plan's anti-pattern (\"select candidates by sorting filenames numerically and taking the highest\") is a selection strategy, not a currency-check rewrite; this also, as a side effect, bypassed _prepareMpdEntry's D-06 log line and put mpd-missing-hazard-type-renders-without-it-logs-miss into an unanticipated third RED — recorded honestly below rather than treated as a third predicted target."
  - "Mutation 5 produced zero RED scenarios against the five delivered mpd-* scenarios, exactly as the plan's contingency anticipated. Added the sixth scenario mpd-unparseable-validity-is-kept-not-dropped (an MPD whose IssueTime carries AKST, a real US timezone abbreviation absent from parseMpdValidEnd's fixed CONUS table) and re-ran mutation 5 against it, confirming RED."
  - "Live MPD reconnaissance (read-only HTTPS GET against WPC's own listing and MPD_latest.kmz) was performed directly, since it requires no destructive or config-mutating action and de-risks the human checkpoint. Deciding whether the live MPD covers the operator's actual deployed lat/lon and confirming the physical display, however, requires the human — that part of Task 3 could not be completed from this worktree and the plan was paused at that checkpoint."
  - "Task 3's checkpoint was resolved by the human: lat/lon was temporarily set to 36.17/-115.14 (Las Vegas NV, inside MPD_1122's live polygon, confirmed by an independent point-in-polygon test), MagicMirror restarted, the row visually confirmed, and the coordinate restored afterward. Live confirmation covers the 15-07 socket migration end-to-end, MPD-03's hazard-type extraction, and D-05's single advisory band. It does NOT cover MPD-01's no-risk gate or MPD-02's concurrent-MPD rendering, since only one MPD covered the test point and other risk was on screen — both remain fixture-verified only, recorded honestly below rather than claimed as live-proven."

requirements-completed: [MPD-02, MPD-03, MPD-04]

# Metrics
duration: ~50min (Tasks 1-2, offline structural work) + Task 3 resumed and completed 2026-08-24 via live human verification
completed: 2026-08-24
---

# Phase 15 Plan 09: MPD Scenario Family, Phase-Wide Mutation Inventory, and Live Verification Checkpoint Summary

**Six `mpd-*` probe scenarios drive WPC's real Apache-listing discovery, per-candidate `ValidEndTi` validity gate, and description-CDATA hazard-type/number parsing end to end — proving MPD-04's headline requirement (a stale, higher-numbered `MPD_1281` cannot beat two genuinely current MPDs even when every listing timestamp is fresh), MPD-02's "all concurrently active" contract, MPD-03's togeojson-object hazard-type unwrap, D-06's never-drop-for-missing-hazard-type behavior, D-04's stale/not-stale distinction, and the fail-open no-false-negatives guarantee on an unparseable validity window — closing the suite at 32 scenarios, all mutation-proven — and Task 3's live-MPD human checkpoint is now resolved: the human verified `WPC MPD 1122 — Heavy rainfall, Flash flooding likely` rendering on the physical MagicMirror display against a live, independently-parsed WPC KMZ.**

## Performance

- **Duration:** ~50 min for Tasks 1-2 (structural work, committed); Task 3 paused, then resumed and completed 2026-08-24 upon human live verification
- **Started:** 2026-08-24 (worktree base `aeffd82`, corrected from a stale start per the `worktree_branch_check` protocol)
- **Completed:** All three tasks complete — Task 3's `checkpoint:human-verify` gate was approved by the human 2026-08-24 ~20:12Z
- **Tasks:** 3/3 completed
- **Files modified:** 1 (`scripts/probe-payload-resilience.js`)

## Accomplishments

- Added `mpdWindowFields`/`mpdListingHtml` fixture helpers: derive a live-shaped `IssueTime`/`ValidEndTi` pair from a single target UTC instant (delegating to the same 8-entry CONUS timezone-offset table `parseMpdValidEnd` uses) and build WPC's real Apache "Index of" listing HTML shape — both computed relative to `Date.now()`, per the plan's explicit instruction, so the suite does not decay on a future run date.
- Added five `mpd-*` scenarios (Task 1) covering MPD-04 (year-boundary rejection, all listing entries deliberately fresh so only the `ValidEndTi` gate can reject the stale candidate), MPD-02 (length-2 concurrent assertion at payload and display layer), MPD-03 (hazard-type CDATA extraction, payload and display layer), D-06 (missing hazard type renders without suffix and logs the parse-miss), and D-04 (listing-fetch failure sets `_stale`; a clean zero-result run does not).
- Mutation-proved all five (Task 2), discovered mutation 5 produced no RED as the plan anticipated, added the sixth scenario `mpd-unparseable-validity-is-kept-not-dropped` to close that gap, and confirmed RED under mutation 5 against it — the fail-open no-false-negatives direction is now guarded, not merely commented.
- Compiled the phase-wide D-10 mutation inventory below, covering all 17 scenarios added across plans 15-02, 15-05, 15-08 and this plan.
- Performed read-only live reconnaissance against WPC's real endpoints (see Live Verification section) to de-risk the human checkpoint, then paused at Task 3 exactly as the plan requires — visually confirming the physical MagicMirror display and the operator's actual deployed coordinates cannot be done from this worktree.

## Task Commits

1. **Task 1: Add the mpd-* scenario family** - `a982da2` (feat)
2. **Task 2: Mutation-prove the MPD scenarios and record the phase scenario inventory** - `0fd5889` (test — the sixth scenario `mpd-unparseable-validity-is-kept-not-dropped`, a permanent addition closing mutation 5's coverage gap; the five mutation-apply/revert cycles themselves left no residual diff, confirmed by `git diff --exit-code`)
3. **Task 3: Live MPD verification and deferred in-season WSSI record** - COMPLETE, record-only (no code changes); human live-verified against MPD_1122 on the physical display, approved 2026-08-24 (see below)

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — Added `mpdWindowFields`, `mpdListingHtml`, and six `mpd-*` scenarios: `mpd-year-boundary-does-not-select-stale-highest-number`, `mpd-multiple-concurrent-all-shown`, `mpd-hazard-type-extracted-from-description`, `mpd-missing-hazard-type-renders-without-it-logs-miss`, `mpd-fetch-failure-is-stale-but-zero-results-is-not`, `mpd-unparseable-validity-is-kept-not-dropped`. Suite grew from 26 to 32 scenarios; existing 26 unchanged.

## Mutation Proofs (D-10 / blocking anti-pattern requirement, this plan's own scenarios)

Each mutation was applied to `node_helper.js` only, the suite run, the failure observed, then reverted via `git checkout -- node_helper.js` and the suite re-run to confirm green before the next mutation. Final state: `git diff --exit-code node_helper.js MMM-SPCOutlook.js productRegistry.js scripts/probe-payload-resilience.js scripts/probe-lib/module-stubs.js` reports no residual changes; `node scripts/probe-payload-resilience.js` exits 0 with `32 passed, 0 failed, 0 skipped`.

| # | Mutation | Expected RED | Result |
|---|----------|---------------|--------|
| 1 | Replace the per-candidate validity gate with "sort candidates by filename number, keep only the highest" | `mpd-year-boundary-does-not-select-stale-highest-number`, `mpd-multiple-concurrent-all-shown` | RED on both, exactly as predicted: `MPD-04: expected 2 active MPDs (1118, 1119) after the stale MPD_1281 was rejected, got 1: [{"label":"WPC MPD 1281",...}]` and `MPD-02: "all concurrently active" requires both MPDs, got length 1: [{"label":"WPC MPD 2202",...}]`. **Unanticipated third RED**, recorded honestly: `mpd-missing-hazard-type-renders-without-it-logs-miss` also failed (`no log line matched [mpd covers the location but has no parseable hazard type, ...]`) because this mutation bypassed `_prepareMpdEntry` entirely (the simplest faithful implementation of "select by highest filename number"), losing its D-06 log-emission side effect along with the currency decision. The two scenarios the plan named going RED, with the exact predicted messages, is the load-bearing proof; the third is a byproduct of this mutation's scope, not evidence against D-06's own guard (mutation coverage for D-06's log line is mutation-3's territory, confirmed clean there). Suite: 28 passed, 3 failed, 0 skipped. |
| 2 | Delete only the `ValidEndTi` expiry comparison, keep the 48h Last-Modified pre-filter | `mpd-year-boundary-does-not-select-stale-highest-number` | RED: `MPD-04: expected 2 active MPDs (1118, 1119) after the stale MPD_1281 was rejected, got 3: [{"label":"WPC MPD 1281",...},{"label":"WPC MPD 1118",...},{"label":"WPC MPD 1119",...}]` — this is the exact vacuity trap the plan's critical-context note exists to catch, and the fixture's fresh listing timestamps are what let this mutation (not the pre-filter) be the one thing standing between green and red. Suite: 30 passed, 1 failed, 0 skipped. |
| 3 | In `mpdDescriptionHtml`, remove the object unwrap so `description` is read as a plain string | `mpd-hazard-type-extracted-from-description` RED, `mpd-missing-hazard-type-renders-without-it-logs-miss` GREEN | Confirmed exactly as predicted: `MPD-03 / Pitfall 3: expected hazardType "Heavy rainfall, Flash flooding possible", got null`, while `mpd-missing-hazard-type-renders-without-it-logs-miss` PASSed — the two D-06 branches (a real hazard type vs. a genuinely absent one) remain distinguishable. **Side effect, recorded honestly**: `mpd-year-boundary-does-not-select-stale-highest-number` also went RED (`got 3` including 1281), because `mpdDescriptionHtml` is shared infrastructure — breaking it also breaks `IssueTime`/`ValidEndTi` extraction, so every candidate fails open (kept) under this mutation. This is a real, informative coupling in the production code, not a fixture defect. Suite: 29 passed, 2 failed, 0 skipped. |
| 4 | Remove the advisory `anyStale` accumulation line from `getSpcOutlook`'s kml-advisory loop | `mpd-fetch-failure-is-stale-but-zero-results-is-not` (first half) | RED: `D-04: a failed MPD listing fetch (503) did not set _stale — a broken feed must show ⚠ rather than a confident "none active". Payload: {"spcMD":[],"mpd":[]}`. No other scenario affected. Suite: 30 passed, 1 failed, 0 skipped. |
| 5 | Change the fail-open branch in `_prepareMpdEntry` to drop candidates whose `parseMpdValidEnd` returns `null` | none (against the five Task 1 scenarios) | Confirmed: `32 passed, 0 failed, 0 skipped` — zero RED, exactly the plan's anticipated contingency. Added the sixth scenario `mpd-unparseable-validity-is-kept-not-dropped` (IssueTime carrying `AKST`, absent from the 8-entry CONUS table) and re-ran mutation 5 against it: RED — `fail-open regression: an MPD with an unmapped timezone abbreviation (AKST) in IssueTime was dropped instead of kept, got 0 entries`. Reverted; suite returned to `32 passed, 0 failed, 0 skipped`. |

## Phase-Wide Scenario Inventory (D-10 evidence)

Phase 14 closed with 15 baseline scenarios (per `14-REVIEW-FIX.md`). This phase (15) added 17 new scenarios across four plans — 15-02 (+1), 15-05 (+6), 15-08 (+4), 15-09/this plan (+6) — bringing the suite to the current 32. Every scenario below has a recorded mutation → RED-message pair; the two exceptions are noted explicitly rather than silently omitted.

| Scenario | Plan | Requirement/Decision | Proving mutation (RED result) |
|----------|------|----------------------|-------------------------------|
| `harness-real-kml-deps-round-trip` | 15-02 | RESEARCH.md Pitfall 3 (togeojson description-object shape) | Changed `typeof description !== "object"` to `typeof description !== "string"` → RED: `RESEARCH.md Pitfall 3 regressed: expected properties.description to be an object, got object` |
| `wssi-wellformed-minor` | 15-05 | WSSI-01; extended with a render assertion for the no-risk-gate term | Wrong-registry-row mutation → RED (`day1Risk expected MINOR, got NONE`); no-risk-gate-term deletion (mutation 5, closing an anticipated coverage gap) → RED (`a genuine MINOR winter impact with no convective risk short-circuited to "No Severe Weather Risk"`) |
| `wssi-case-fold-mismatch-still-resolves` | 15-05 | WSSI-02 (case fold) | Dropped `.toUpperCase()` from the fold → RED: `mixed-case "Minor" did not fold to MINOR, got NONE` |
| `wssi-winter-weather-area-renders-nothing` | 15-05 | D-09 AMENDED (MINOR floor) | Relaxed `includesFeat` from `val >= 2` to `val > 0` → RED: `WINTER WEATHER AREA must render nothing, got day1Risk WWA` |
| `wssi-zero-features-out-of-season` | 15-05 | WSSI-03 (structural, deferred-live-check substitute) | No dedicated mutation recorded in `15-05-SUMMARY.md` — proven structurally by reusing the byte-identical live off-season `EMPTY_FEATURE_COLLECTION` shape rather than by a targeted break, since the zero-feature path never reaches `includesFeat` regardless of its threshold. Recorded here as a known gap in mutation coverage, not silently omitted. |
| `wssi-toggle-off` | 15-05 | Phase 14 D-05 (toggle-off full payload block) | Collateral RED under the wrong-registry-row mutation (mutation 4): `key-count mismatch: 20 keys, expected 12 — ERO's 5-day shape leaked into the WSSI slot` |
| `wssi-hard-fail-is-flagged` | 15-05 | CR-03/CR-01 (hard-fail flagged, diagnosable) | Dropped `if (fetchResult.stale \|\| fetchResult.failed) anyStale = true;` from `_runArcGisDayProduct` → RED: `a hard-failed WSSI fetch produced an unflagged no-risk payload (_stale !== true)` |
| `spc-md-http-href-not-rejected-by-allowlist` | 15-08 | Pitfall 1 fix (http:// scheme accepted) | Restricted `normalizeAdvisoryUrl` to `https:` only → RED: `Pitfall 1 regression: expected 1 SPC MD entry from an http:// href, got 0` |
| `spc-md-off-host-href-still-refused` | 15-08 | Allowlist host-check control | Dropped the hostname-equality check → RED: `the off-host href reached the network: [..., "https://evil.test/x.kmz"]` |
| `frontend-seq-discard-survives-socket-index-migration` | 15-08 | CR-03 at the new `payload[1]` socket index | Changed the sequence read from `payload[1]` back to `payload[2]` → RED: `CR-03 at the new socket index: an out-of-order payload (seq 3 after seq 5) was not discarded` |
| `frontend-advisory-only-is-not-an-all-clear` | 15-08 | MPD-01 (advisory-only no-risk gate) | Deleted the advisory term from the no-risk short-circuit gate → RED: `MPD-01: an advisory-only payload ... short-circuited to the plain no-risk line` |
| `mpd-year-boundary-does-not-select-stale-highest-number` | 15-09 | MPD-04 | Mutations 1 and 2 above |
| `mpd-multiple-concurrent-all-shown` | 15-09 | MPD-02 | Mutation 1 above (collateral) |
| `mpd-hazard-type-extracted-from-description` | 15-09 | MPD-03 | Mutation 3 above |
| `mpd-missing-hazard-type-renders-without-it-logs-miss` | 15-09 | D-06 | Mutation 1 above (collateral; the log line's dedicated coverage) |
| `mpd-fetch-failure-is-stale-but-zero-results-is-not` | 15-09 | D-04 | Mutation 4 above |
| `mpd-unparseable-validity-is-kept-not-dropped` | 15-09 | Fail-open no-false-negatives guarantee (T-15-39) | Mutation 5 above |

**16 of 17 new-in-Phase-15 scenarios have a directly recorded mutation → RED-message pair.** The one exception, `wssi-zero-features-out-of-season`, is flagged above rather than hidden — it is proven structurally (byte-identical to WPC's live off-season response, verified in `15-05-SUMMARY.md`), not by a targeted mutation, because no code path threshold exists for it to break against. This is disclosed as a known coverage gap, not claimed as mutation-proven.

## Live Verification (Task 3, checkpoint reconnaissance)

Per the plan's explicit instruction ("Do the structural/fixture work FIRST and get it committed. Only then attempt live verification"), Tasks 1-2 were completed and committed before any live check was attempted.

**Read-only reconnaissance performed** (safe: no config change, no restart, no write):
- `GET https://www.wpc.ncep.noaa.gov/kml/mpd/` (live at check time, 2026-08-24 ~13:00 UTC) confirms the exact live shape the critical-context note describes: `MPD_1281_final.kmz` (Last-Modified `2026-01-23 16:07`, a January straggler) sorts alphabetically **after** `MPD_1120_final.kmz` (Last-Modified `2026-08-24 11:03`, the current season). A "highest number wins" implementation would pick the stale one today, live-reproducing this plan's fixture design.
- `GET https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_latest.kmz` returned `content-length: 3152`, `last-modified: Mon, 24 Aug 2026 11:03:12 GMT` — matching `MPD_1120`. Its `doc.kml` decodes to: `IssueTime` "700 AM EDT Mon Aug 24 2026", `ValidEndTi` "241700" (resolves to 2026-08-24T21:00:00Z), `MPDNumber` 1120, `MPDType` "Heavy rainfall, Flash flooding possible", `WFO` "JAN, LZK, MEG, TSA" (Jackson MS / Little Rock AR / Memphis TN / Tulsa OK), polygon roughly spanning lon -90.6 to -93.4, lat 33.3 to 36.5 (Arkansas / northern Mississippi / western Tennessee / eastern Oklahoma border area). As of this check, MPD_1120 is genuinely active with roughly 8 hours remaining in its validity window.

**What could not be completed from this worktree at the time of the previous pause:** confirming whether MPD_1120 (or any concurrently active MPD) covers the operator's *actual deployed* `lat`/`lon` — that value lives in the runtime `config.js` on the physical MagicMirror/Raspberry Pi, not in this repository — and visually confirming the rendered row on the physical display both require the human.

### Human live verification (Task 3, resolved)

The human performed the live check and **approved** it. By the time verification occurred, `MPD_1120` (the MPD found during the earlier read-only reconnaissance above) had expired; a different MPD, `MPD_1122`, was active and used instead — WPC issues these on a rolling few-hour cadence, so this is expected drift between reconnaissance time and verification time, not a discrepancy.

**Live check performed, 2026-08-24 ~20:12Z:**
- **Configuration used:** `lat: 36.17, lon: -115.14` (Las Vegas NV — inside `MPD_1122`'s polygon, confirmed by an independent point-in-polygon test run against the live KMZ), `showMPD: true`, MagicMirror restarted. **This is not the operator's real deployed coordinate** — it was set temporarily for this verification and restored afterward.
- **Rendered on the physical display, verbatim:**
  ```
  WPC MPD 1122 — Heavy rainfall, Flash flooding likely in effect.
  ```
  alongside `Mon (Day 1): General Thunderstorms`, `Wed (Day 3): None 0.4 (near TSTM)`, and `Excessive Rain (Day 1): Marginal`.
- **Live product details** (parsed independently from the live KMZ, not from the rendered display, as a cross-check): `MPD_1122`, source `https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1122_final.kmz`; `ValidStart` `241834`, `ValidEndTi` `250030` → active 2026-08-24T18:34Z to 2026-08-25T00:30Z; `MPDType` `Heavy rainfall, Flash flooding likely`; `WFO` FGZ, GJT, PSR, SGX, SLC, VEF (Desert Southwest / Great Basin); Forecaster Wegman. The rendered row matches the independently-parsed number and hazard type exactly.

**Confirmed end-to-end on real data:**
1. **The 15-07 socket migration works in production.** The advisory reached the frontend inside `outlook.advisories` and rendered, so `[outlook, seq]` on the wire and the `payload[1]` seq read are both correct on real hardware — this was the phase's designated migration hazard (see 15-CONTEXT.md's "MIGRATION HAZARD" integration-point note) and is now live-confirmed, not merely fixture-proven.
2. **MPD-03's hazard-type extraction from the description CDATA is real.** The rendered string "Heavy rainfall, Flash flooding likely" differs from the earlier reconnaissance's `MPD_1120` value ("...possible"), so this is a genuinely parsed, per-MPD field, not an echoed constant.
3. **D-05's single source-prefixed advisory band renders as designed.**
4. **The full discovery path works live end to end:** directory listing → `MPD_FILENAME_PATTERN` → `normalizeAdvisoryUrl` allowlist → KMZ fetch → KML parse → polygon hit → render.

**What this does NOT prove — recorded explicitly so the successful screenshot is not read as broader than it is:**
- Other risk was present on screen (General Thunderstorms, Marginal ERO), so `getDom`'s no-risk short-circuit never fired during this check. **MPD-01 (the frontend's advisory-only no-risk gate, 15-07 Task 2's fix for the false-negative where an advisory-only payload short-circuited to the plain no-risk line) was NOT exercised by this live render.** It remains guarded only by the fixture scenario `frontend-advisory-only-is-not-an-all-clear`.
- **MPD-02 (two concurrently active MPDs both rendering) was not observed live** — only `MPD_1122` covered the test point. It remains guarded only by the fixture scenario `mpd-multiple-concurrent-all-shown`.

**A live finding worth recording as a durable note on the discovery design:** `MPD_1122` was active at the moment of verification and its filename is `MPD_1122_final.kmz`. WPC appends `_final` when the graphic is finalized, NOT when the discussion expires — an active, currently-in-force MPD can carry `_final` in its filename. `MPD_FILENAME_PATTERN` (`/^MPD_(\d+)_final\.kmz$/`) requiring `_final` is therefore confirmed correct, and `MPD_latest.kmz` correctly failing to match the same pattern (so the same MPD is never double-counted under two filenames) is confirmed correct. Had the pattern instead been implemented on the mistaken assumption that "`_final` means expired," MPD discovery would have found nothing, ever, while still appearing healthy (empty result, no error) — this live check rules that out.

### Deferred items for STATE.md (orchestrator to record at phase close)

The orchestrator, not this executor, writes STATE.md. The following belong in STATE.md's Deferred Items table:

1. **Live in-season WSSI confirmation** — explicitly deferred per D-10 (15-CONTEXT.md), following the v1.1 fire-weather precedent already in STATE.md. WSSI is a winter product; this verification occurred in August and is not exercisable now. Structural verification via the six `wssi-*` probe scenarios stands as the evidence in the interim.
2. **Live MPD-02 (two concurrently active MPDs both rendering)** — not observable on demand; only one MPD covered the verification point. Fixture-verified only (`mpd-multiple-concurrent-all-shown`).
3. **Live MPD-01 (frontend advisory-only no-risk-gate behavior)** — requires an advisory-only location with every other product reading NONE; not observed live because other risk was present on screen throughout this check. Fixture-verified only (`frontend-advisory-only-is-not-an-all-clear`).

**Operational finding that corrects an optimistic assumption in D-10:** for a fixed-point module, waiting for an MPD to appear over the operator's actual configured location is NOT a viable verification strategy. MPDs are regional and live only 3-6 hours; four were issued on 2026-08-24 and none covered the operator's real location. The realistic procedure — and the one used here — is to temporarily move `lat`/`lon` into an active polygon (confirmed via an independent point-in-polygon check against the live KMZ before restarting), confirm the render, and restore the real coordinate afterward. Recommend this be documented as the standard procedure for future live checks of location-gated products (MPD, SPC MD, and any future advisory-band product).

**Unused-fixture observation for code review (not fixed in this plan):** `WSSI_MODERATE_BODY`, `WSSI_MAJOR_BODY`, and `WSSI_EXTREME_BODY` are declared in `scripts/probe-payload-resilience.js` but consumed by no scenario (each has exactly one occurrence — its own declaration). D-09's rendering-floor boundary IS pinned (`wssi-winter-weather-area-renders-nothing` proves `MINOR` renders and `WINTER WEATHER AREA` does not), so this is not a hole in the floor logic itself — but the three tiers above the floor (`MODERATE`, `MAJOR`, `EXTREME`) and any per-tier palette/label differences (D-08) are unexercised by any scenario. Flagged for the phase code review; intentionally not fixed here, as Task 3 is record-keeping only and this plan's `files_modified` scope does not include adding new scenarios.

## Decisions Made

- **Mutation 1's scope choice:** implemented "select by highest filename number" as a pre-loop candidate filter inside `_runKmlAdvisoryRow` (bypassing `_prepareMpdEntry` entirely for the mpd row) rather than rewriting `_prepareMpdEntry`'s internal comparison, since this is the most direct, faithful expression of the anti-pattern research names ("sort filenames numerically and take the highest") — a selection strategy applied before any currency check runs, not a currency-check rewrite. This is why it also incidentally broke D-06's log line (documented above as an honest side effect, not hidden).
- **`mpdWindowFields`'s IssueTime format:** matches the live-captured shape exactly (`"<h><mm> <AM/PM> <TZ> <DOW> <MON> <DAY> <YEAR>"`, e.g. `"700 AM EDT Mon Aug 24 2026"`), reusing `parseMpdValidEnd`'s own regex contract rather than reimplementing timezone math, so a fixture and the code under test can never silently drift apart.

## Deviations from Plan

None beyond what the plan itself anticipated as contingencies (mutation 5's coverage gap, explicitly planned for) and the honestly-recorded mutation-1/mutation-3 side effects above, which are observations about the production code's real structure, not corrections to it.

## Issues Encountered

- Worktree HEAD was found on the correct per-agent branch (`worktree-agent-a88af149d23c30898`) but pointed at a stale commit (`28845fa`, prior to plans 15-07/15-08 merging) rather than the expected wave-7 base (`aeffd82`). Per the `worktree_branch_check` protocol, confirmed a clean working tree via `git status --short`, then ran `git reset --hard aeffd82901dbd6dd5d6dc4758795038512c8c553` and confirmed HEAD landed correctly before any file read. Resolved before any plan work began; no impact.

## User Setup Required

None for Tasks 1-2 (fully offline, zero network, `node_modules` real KML deps resolved successfully — `hasRealKmlDeps` was `true` throughout). Task 3 required the operator to temporarily change `lat`/`lon` and `showMPD` in their runtime config and restart MagicMirror to observe the live render, then restore their real coordinate afterward — completed by the operator 2026-08-24.

## Next Phase Readiness

- The probe suite (`scripts/probe-payload-resilience.js`) is the complete Phase 15 verification standard per D-10: 32 scenarios, 0 failed, 0 skipped, offline and zero-network.
- MPD-02, MPD-03, MPD-04, D-04, and D-06 are all structurally proven and mutation-guarded; MPD-03 and the 15-07 socket migration are now additionally live-confirmed against `MPD_1122` on the physical display.
- Task 3 (live MPD checkpoint) is resolved: human-approved. Three items remain live-unverified and are handed to the orchestrator for STATE.md Deferred Items (see "Deferred items for STATE.md" above): live in-season WSSI, live MPD-02, live MPD-01 no-risk-gate.
- STATE.md/ROADMAP.md are intentionally NOT updated by this executor (worktree mode); the orchestrator updates them after the wave completes.

## Self-Check: PASSED

- `scripts/probe-payload-resilience.js` — FOUND (modified, exists)
- Commit `a982da2` — FOUND in `git log --oneline --all`
- Commit `0fd5889` — FOUND in `git log --oneline --all`
- `node scripts/probe-payload-resilience.js` — re-run at self-check time (post Task 3 record-keeping, no source changes made): `32 passed, 0 failed, 0 skipped`, exit 0
- `git diff --exit-code node_helper.js MMM-SPCOutlook.js productRegistry.js scripts/probe-lib/module-stubs.js` — clean, no residual mutation state
- Live reconnaissance (`curl` against `wpc.ncep.noaa.gov`) — confirmed reproducible, not fabricated: MPD_1281 (Jan 2026) sorts after MPD_1120 (Aug 2026) in the live listing exactly as the critical-context note describes
- Human live verification of `MPD_1122` on the physical MagicMirror display — recorded above per the human's approved checkpoint response; this executor did not and could not independently observe the physical display, and reports the human's verbatim account rather than claiming direct observation

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Status: COMPLETE — Task 3 checkpoint approved by human 2026-08-24*
