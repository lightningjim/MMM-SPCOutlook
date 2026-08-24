---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 09
subsystem: probe-harness
tags: [testing, mpd, wssi, mutation-testing, offline-verification, d-10, checkpoint]
status: paused

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
  - "Live MPD reconnaissance (read-only HTTPS GET against WPC's own listing and MPD_latest.kmz) was performed directly, since it requires no destructive or config-mutating action and de-risks the human checkpoint. Deciding whether the live MPD covers the operator's actual deployed lat/lon and confirming the physical display, however, requires the human — that part of Task 3 could not be completed from this worktree and the plan is paused at that checkpoint."

requirements-completed: [MPD-02, MPD-03, MPD-04]

# Metrics
duration: ~50min (Tasks 1-2; Task 3 paused awaiting human)
completed: 2026-08-24
---

# Phase 15 Plan 09: MPD Scenario Family, Phase-Wide Mutation Inventory, and Live Verification Checkpoint Summary

**Six `mpd-*` probe scenarios drive WPC's real Apache-listing discovery, per-candidate `ValidEndTi` validity gate, and description-CDATA hazard-type/number parsing end to end — proving MPD-04's headline requirement (a stale, higher-numbered `MPD_1281` cannot beat two genuinely current MPDs even when every listing timestamp is fresh), MPD-02's "all concurrently active" contract, MPD-03's togeojson-object hazard-type unwrap, D-06's never-drop-for-missing-hazard-type behavior, D-04's stale/not-stale distinction, and the fail-open no-false-negatives guarantee on an unparseable validity window — closing the suite at 32 scenarios, all mutation-proven, and pausing at Task 3's live-MPD human checkpoint with reconnaissance already gathered.**

## Performance

- **Duration:** ~50 min for Tasks 1-2 (structural work, committed); Task 3 paused
- **Started:** 2026-08-24 (worktree base `aeffd82`, corrected from a stale start per the `worktree_branch_check` protocol)
- **Completed:** Tasks 1-2 complete; Task 3 (live MPD checkpoint) paused awaiting the human
- **Tasks:** 2/3 completed, 1 paused at a `checkpoint:human-verify` gate
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
3. **Task 3: Live MPD verification and deferred in-season WSSI record** - PAUSED at the `checkpoint:human-verify` gate (see below)

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

**What could not be completed from this worktree:** confirming whether MPD_1120 (or any concurrently active MPD) covers the operator's *actual deployed* `lat`/`lon` — that value lives in the runtime `config.js` on the physical MagicMirror/Raspberry Pi, not in this repository — and visually confirming the rendered `WPC MPD 1120 — Heavy rainfall, Flash flooding possible in effect.` row on the physical display both require the human. `MMM-SPCOutlook.js`'s own shipped default (`lat: 35.22, lon: -97.44`, Norman OK) is well outside this polygon's longitude range, but that default is not evidence about the operator's real configured location.

**This plan is PAUSED at Task 3's `checkpoint:human-verify` gate**, per the plan's own instruction. There IS an active MPD right now — the checkpoint cannot be pre-answered as "no active MPD" on the operator's behalf. The reconnaissance above is handed off so the operator's own verification (steps 2-6 of the plan's `<how-to-verify>`) can proceed directly to setting `lat`/`lon` inside `MPD_1120`'s polygon (e.g. `lat: 35.0, lon: -91.5`), restarting MagicMirror, and confirming the rendered row, rather than first having to rediscover whether anything is active.

### Awaiting

Reply with one of:
- **`approved`** (optionally noting what was seen) — after confirming the `WPC MPD 1120 — Heavy rainfall, Flash flooding possible in effect.` row (or whichever MPD is active by the time you check) renders correctly, including all concurrently active MPDs if more than one covers your test point, and that any active SPC MD also renders via the `http://` allowlist fix.
- **`no active MPD`** — if by the time you check, `MPD_1120`'s validity window (`2026-08-24T21:00:00Z`) has passed and nothing else is active. Structural verification via the 32-scenario probe suite stands in, per the v1.1 fire-weather precedent.
- **A defect description** — any mismatch between the rendered row and the live MPD's number/hazard type.

Once you respond, a fresh executor should be spawned to: (1) record your response in this file's Task 3 section, (2) if you replied `no active MPD`, add BOTH deferred items (live in-season WSSI verification and live MPD verification) to STATE.md Deferred Items at phase close, or if you replied `approved`, add only the WSSI item; (3) if you reported a defect, apply the appropriate deviation rule and re-verify.

## Decisions Made

- **Mutation 1's scope choice:** implemented "select by highest filename number" as a pre-loop candidate filter inside `_runKmlAdvisoryRow` (bypassing `_prepareMpdEntry` entirely for the mpd row) rather than rewriting `_prepareMpdEntry`'s internal comparison, since this is the most direct, faithful expression of the anti-pattern research names ("sort filenames numerically and take the highest") — a selection strategy applied before any currency check runs, not a currency-check rewrite. This is why it also incidentally broke D-06's log line (documented above as an honest side effect, not hidden).
- **`mpdWindowFields`'s IssueTime format:** matches the live-captured shape exactly (`"<h><mm> <AM/PM> <TZ> <DOW> <MON> <DAY> <YEAR>"`, e.g. `"700 AM EDT Mon Aug 24 2026"`), reusing `parseMpdValidEnd`'s own regex contract rather than reimplementing timezone math, so a fixture and the code under test can never silently drift apart.

## Deviations from Plan

None beyond what the plan itself anticipated as contingencies (mutation 5's coverage gap, explicitly planned for) and the honestly-recorded mutation-1/mutation-3 side effects above, which are observations about the production code's real structure, not corrections to it.

## Issues Encountered

- Worktree HEAD was found on the correct per-agent branch (`worktree-agent-a88af149d23c30898`) but pointed at a stale commit (`28845fa`, prior to plans 15-07/15-08 merging) rather than the expected wave-7 base (`aeffd82`). Per the `worktree_branch_check` protocol, confirmed a clean working tree via `git status --short`, then ran `git reset --hard aeffd82901dbd6dd5d6dc4758795038512c8c553` and confirmed HEAD landed correctly before any file read. Resolved before any plan work began; no impact.

## User Setup Required

None yet for Tasks 1-2 (fully offline, zero network, `node_modules` real KML deps resolved successfully — `hasRealKmlDeps` was `true` throughout). Task 3 requires the operator's action described above.

## Next Phase Readiness

- The probe suite (`scripts/probe-payload-resilience.js`) is the complete Phase 15 verification standard per D-10: 32 scenarios, 0 failed, 0 skipped, offline and zero-network.
- MPD-02, MPD-03, MPD-04, D-04, and D-06 are all structurally proven and mutation-guarded.
- Task 3 (live MPD checkpoint) is paused, not abandoned — resume with the reconnaissance above once the operator responds.
- STATE.md/ROADMAP.md are intentionally NOT updated by this executor (worktree mode); the orchestrator updates them after the wave completes, and Task 3's resolution (once available) determines whether one or two items land in STATE.md Deferred Items.

## Self-Check: PASSED

- `scripts/probe-payload-resilience.js` — FOUND (modified, exists)
- Commit `a982da2` — FOUND in `git log --oneline --all`
- Commit `0fd5889` — FOUND in `git log --oneline --all`
- `node scripts/probe-payload-resilience.js` — re-run at self-check time: `32 passed, 0 failed, 0 skipped`, exit 0
- `git diff --exit-code node_helper.js MMM-SPCOutlook.js productRegistry.js scripts/probe-lib/module-stubs.js` — clean, no residual mutation state
- Live reconnaissance (`curl` against `wpc.ncep.noaa.gov`) — confirmed reproducible, not fabricated: MPD_1281 (Jan 2026) sorts after MPD_1120 (Aug 2026) in the live listing exactly as the critical-context note describes

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Status: PAUSED at Task 3 (checkpoint:human-verify) — 2026-08-24*
