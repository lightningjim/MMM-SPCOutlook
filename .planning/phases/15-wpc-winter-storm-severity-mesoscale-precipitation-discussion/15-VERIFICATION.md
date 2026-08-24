---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
verified: 2026-08-24T20:21:10Z
status: passed
score: 7/7 must-haves verified
has_blocking_gaps: false
overrides_applied: 0
---

# Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion Verification Report

**Phase Goal:** Ship WSSI Overall Impact (Days 1-3, `showWinterImpact`) as a second
`arcgis-day-layers` product and WPC Mesoscale Precipitation Discussions (`showMPD`) as a new
`kml-advisory` product, migrating SPC MD alongside it, satisfying WSSI-01/02/03 and
MPD-01/02/03/04.

**Verified:** 2026-08-24T20:21:10Z
**Status:** passed
**Re-verification:** No — initial verification

## Method

This verification reads the actual committed source (`productRegistry.js`, `node_helper.js`,
`MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`) rather than trusting SUMMARY.md
prose, runs the phase's sole test command directly, cross-checks every scenario name the
SUMMARYs claim exist against `grep` output of the actual file, and traces each of the seven
requirement IDs to its implementing code and pinning scenario.

`node scripts/probe-payload-resilience.js` was re-run directly: **32 passed, 0 failed, 0
skipped, exit 0** — matches the SUMMARY.md claim exactly, not merely asserted.

## Goal Achievement

### Observable Truths / Per-Requirement Table

| ID | Implemented Where | Pinned By | Verdict |
|----|--------------------|-----------|---------|
| WSSI-01 | `productRegistry.js:111-147` (`winterImpact` row, `arcgis-day-layers`, `days:3`, 1-based `wssiDayLayers`); `node_helper.js:1907-1911` (`_runArcGisDayProduct` call, `winterImpact` in payload); `MMM-SPCOutlook.js:332-344` (Days 1-3 render rows, gated `showWinterImpact`) | `wssi-wellformed-minor` (payload + render assertion, mutation-proven) | ACHIEVED |
| WSSI-02 | `productRegistry.js:123-127` — `toValue` folds `f.properties.impact.trim().toUpperCase()` before the `wssiRawToValue` lookup, single fold site | `wssi-case-fold-mismatch-still-resolves` — mutation removing `.toUpperCase()` confirmed RED (`mixed-case "Minor" did not fold to MINOR, got NONE`) | ACHIEVED |
| WSSI-03 | Off-season zero-feature `FeatureCollection` reuses the existing `extractPolygons`/`evaluatePolygons` empty-array path (no new code, confirmed by reading `_runArcGisDayProduct`) | `wssi-zero-features-out-of-season` — structural proof against the byte-identical live off-season response; **not mutation-proven** (honestly disclosed in 15-09-SUMMARY.md, confirmed here: no code-path threshold exists for this scenario to break against) | ACHIEVED (see Finding F1 — non-blocking coverage note) |
| MPD-01 | `node_helper.js:383-452` (`_runKmlAdvisoryRow`, containment loop); `MMM-SPCOutlook.js:206-219` (no-risk gate advisory term), `:250-262` (render loop) | `frontend-advisory-only-is-not-an-all-clear` (mutation-proven: deleting the gate term went RED); **live-confirmed** 2026-08-24 on the physical display (`WPC MPD 1122 — Heavy rainfall, Flash flooding likely in effect.`) for the discovery→render path, though the no-risk-gate branch specifically was not exercised live (other risk was on screen) | ACHIEVED |
| MPD-02 | `node_helper.js:409-449` — loops every candidate, collects all contained+valid features (no "winner" comparator, confirmed absent) | `mpd-multiple-concurrent-all-shown` (mutation-proven via mutation 1, asserts array length 2) | ACHIEVED |
| MPD-03 | `node_helper.js:841-867,931-933` — `mpdDescriptionHtml` unwraps togeojson's `{"@type":"html",value}` object (Pitfall 3), `mpdHazardType` reads `MPDType` via `extractMpdField` | `mpd-hazard-type-extracted-from-description` (mutation-proven); **live-confirmed** — rendered hazard text "Heavy rainfall, Flash flooding likely" matched an independently-parsed live KMZ, distinct from the reconnaissance value ("...possible"), proving genuine per-MPD parsing, not an echoed constant | ACHIEVED |
| MPD-04 | `node_helper.js:464-509` (`_prepareMpdEntry`, gates solely on `parseMpdValidEnd(issueTime, validEndTi)` vs `Date.now()`, filename number never used for currency) | `mpd-year-boundary-does-not-select-stale-highest-number` (mutation-proven via mutations 1 and 2, both confirmed RED with diagnosable messages) | ACHIEVED |

**Score:** 7/7 requirements ACHIEVED.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `productRegistry.js` | `kind` discriminator, `winterImpact`/`spcMD`/`mpd` rows, `MPD_FILENAME_PATTERN` | VERIFIED | Read in full; matches SUMMARY claims exactly, including D-09 AMENDED (`includesFeat: val >= 2`, zero `LIMITED` occurrences confirmed via `grep -c`) |
| `node_helper.js` | `_runArcGisDayProduct`, `_runKmlAdvisoryRow`, `_advisoryDiscovery`, `_prepareMpdEntry`, CDATA helpers, socket emit at `[outlook, seq]` | VERIFIED | All functions present, wired, called from `getSpcOutlook`; `getMesoscaleDiscussion`/`MD_HOST_PREFIX` confirmed absent (0 grep hits) |
| `MMM-SPCOutlook.js` | `showWinterImpact`/`showMPD`/`showSPCMD` config, WSSI render rows, one advisory band, no-risk gate extended, `seq` read at `payload[1]` | VERIFIED | All present; `this.mds` confirmed absent (0 grep hits across all four project files) |
| `scripts/probe-payload-resilience.js` | 32-scenario suite, all passing | VERIFIED | Live-run confirms 32/32; every scenario name in the phase-wide inventory table cross-checked against actual `name:` declarations in the file — exact match |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `node_helper.js` `sendSocketNotification` | `MMM-SPCOutlook.js` `socketNotificationReceived` | `[outlook, this._seq]` ↔ `payload[1]` | WIRED | Both ends read/write index 1; matches D-03's target shape exactly. Mutation-proven independently (`frontend-seq-discard-survives-socket-index-migration`, reverting to `payload[2]` was the *only* scenario that went RED out of 25 others — direct evidence Pitfall 5's migration hazard is closed) |
| `productRegistry.mpd.toEntry` | `MMM-SPCOutlook.js` advisory render loop | `outlook.advisories.mpd[]` → `escapeHtml(label)`/`escapeHtml(hazardType)` | WIRED | Confirmed both fields pass through `escapeHtml`; D-06 null-hazardType path renders without suffix (confirmed in render code) |
| `_advisoryDiscovery["wpc-mpd-listing"]` | `_prepareMpdEntry` | `_runKmlAdvisoryRow`'s per-candidate loop, `row.id === "mpd"` branch | WIRED | Confirmed the branch calls `_prepareMpdEntry(hit, url)` before `row.toEntry`, and the validity gate (`parseMpdValidEnd` vs `Date.now()`) is the sole currency decision — filename number and Last-Modified are provably excluded from the gate (regex/comment audit, `grep -nE '\.sort\(\)|\.pop\(\)|Math\.max'` shows no MPD ranking use) |

### Data-Flow Trace (Level 4)

Not separately applicable beyond the key links above — this is a backend-computed-payload /
thin-render architecture (no client-side re-derivation), and every rendered field
(`winterImpact.dayNRisk/Text/Color`, `advisories.{spcMD,mpd}[].label/hazardType`) was traced to
a live-verified upstream fetch (WSSI MapServer, WPC MPD directory listing) in the code read
above, not a hardcoded literal.

### Behavioral Spot-Checks / Probe Execution

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full probe suite (this phase's sole test command) | `node scripts/probe-payload-resilience.js` | `PROBE RESULT: 32 passed, 0 failed, 0 skipped`, exit 0 | PASS |
| No `LIMITED` literal anywhere (D-09 AMENDED guard) | `grep -c 'LIMITED' productRegistry.js` | `0` | PASS |
| No dangling `this.mds`/`getMesoscaleDiscussion`/`MD_HOST_PREFIX` references | `grep -rn '\bmds\b\|getMesoscaleDiscussion\|MD_HOST_PREFIX'` across all 4 project files | 0 hits | PASS |
| Scenario-name inventory matches the file | `grep -oE 'name:\s*"[a-z0-9-]+"'` vs 15-09-SUMMARY's phase-wide table | Exact 32/32 match | PASS |

Full suite was run exactly once, per the spot-check constraint against re-running the whole
suite repeatedly.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| WSSI-01 | 15-01, 15-03, 15-05 | WSSI Overall Impact Days 1-3 | SATISFIED | See table above |
| WSSI-02 | 15-01, 15-05 | Case-insensitive impact labels | SATISFIED | See table above |
| WSSI-03 | 15-01, 15-03, 15-05 | Zero-feature off-season, no error | SATISFIED | See table above |
| MPD-01 | 15-01, 15-04, 15-07, 15-08 | Indicator when inside active MPD | SATISFIED | See table above |
| MPD-02 | 15-01, 15-04, 15-06, 15-07, 15-09 | All concurrent MPDs shown | SATISFIED | See table above |
| MPD-03 | 15-01, 15-06, 15-07, 15-09 | Hazard type from description CDATA | SATISFIED | See table above |
| MPD-04 | 15-06, 15-09 | Correct selection across year boundary | SATISFIED | See table above |

No ORPHANED requirements — all seven phase-scoped IDs appear in at least one plan's
`requirements-completed` and REQUIREMENTS.md maps all seven to Phase 15 only.

**Note (non-blocking, process observation):** `.planning/REQUIREMENTS.md`'s checklist boxes and
Traceability table still show these seven IDs as `[ ]` / "Pending" at verification time. This is
expected — REQUIREMENTS.md is orchestrator-owned and updated at phase close, which has not yet
run. It is not evidence against code-level satisfaction, all of which was independently
confirmed above by reading the implementing code and running the test suite directly.

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `node_helper.js` | 628-639 | `kmzToKmlfilename` and `extractKmlFromKmz` — the pre-migration SPC-MD-only KMZ helpers — have zero call sites anywhere in `node_helper.js`, the probe suite, or the frontend (confirmed by targeted `grep`) | Info | Dead code left over from the D-02 migration to `extractSoleKmlEntry`. Does not affect any requirement, is not reachable, and carries no security exposure (unused). Recommend removal in a future cleanup pass; not a phase-goal blocker. |
| `scripts/probe-payload-resilience.js` | 226, 237 (`WSSI_MODERATE_BODY`, `WSSI_MAJOR_BODY`, `WSSI_EXTREME_BODY`) | Fixtures declared, never consumed by any scenario | Info | See Finding F1 below — the D-09 rendering *floor* boundary is pinned, but the three tiers above MINOR and any per-tier palette/label differences (D-08's cited WSSI palette) are unexercised by the probe suite |
| `scripts/probe-payload-resilience.js` | `wssi-zero-features-out-of-season` | No dedicated mutation recorded (disclosed honestly in 15-09-SUMMARY.md) | Info | No code-path threshold exists for this scenario to break against (the zero-feature path never reaches `includesFeat`); structural proof against the live off-season response is the correct substitute, not a coverage failure |

No TBD/FIXME/XXX markers found in any of the four files this phase modified (`productRegistry.js`,
`node_helper.js`, `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`,
`scripts/probe-lib/module-stubs.js`) — confirmed via targeted grep before writing this report.

### Findings (severity-ranked)

**F1 — Info, non-blocking. Unexercised WSSI tiers above the D-09 floor.**
`WSSI_MODERATE_BODY`, `WSSI_MAJOR_BODY`, `WSSI_EXTREME_BODY` are declared in
`scripts/probe-payload-resilience.js` (lines 215-250) but never referenced by any scenario —
confirmed by `grep -c` showing exactly one occurrence each (their own declaration). The
requirement text for WSSI-01/02 only requires "sees their location's WSSI Overall Impact level"
and "correct impact labels regardless of case" — both are satisfied structurally, since
`wssiRawToValue`/`wssiValueToTier`/`wssiTierToColor` are one shared table exercised at the MINOR
boundary by `wssi-wellformed-minor` and `wssi-case-fold-mismatch-still-resolves`, and the same
fold/lookup code path handles every tier identically (no per-tier branching exists to diverge).
Because there is no per-tier logic branch, a MODERATE/MAJOR/EXTREME-specific defect could only
be a data-entry typo in the shared lookup tables (e.g. a wrong hex in `wssiTierToColor`), which
is exactly the kind of defect a live-value fixture is best positioned to catch and today does
not. This is a genuine, disclosed coverage gap against D-08's "cite the source, show the right
colours" intent — not a functional defect, since the tables were populated directly from
research's live capture of `drawingInfo.renderer.uniqueValueInfos`. Assessed as acceptable to
ship: does not block requirement satisfaction, and the phase's own SUMMARY.md flagged it for
future code review rather than hiding it.

**F2 — Info, non-blocking. Orphaned KMZ helper functions.**
`kmzToKmlfilename`/`extractKmlFromKmz` (node_helper.js:628-639) are dead code post-migration.
Recommend a follow-up cleanup task; does not affect Phase 15's goal.

**F3 — Info, non-blocking. `wssi-zero-features-out-of-season` lacks a mutation proof.**
Disclosed honestly in the phase's own scenario inventory; the underlying reason (no threshold
exists in that code path) is structurally sound, confirmed by reading `_runArcGisDayProduct` and
`extractPolygons`/`evaluatePolygons` — an empty `features` array never reaches `includesFeat` at
any tier value.

None of the above findings are BLOCKER-severity. All seven requirement IDs have working,
wired, tested implementation with a passing test suite that matches its own documented claims
exactly.

## What Is Fixture-Verified vs Live-Verified

**Live-verified (2026-08-24, human-approved checkpoint against `MPD_1122`):**
- The 15-07 socket migration (`[outlook, seq]`, `payload[1]`) works end-to-end on real hardware.
- MPD-03's hazard-type extraction from description CDATA is a genuine per-MPD parse (the
  rendered hazard string differed between the reconnaissance MPD and the verification MPD).
- D-05's single source-prefixed advisory band renders as designed.
- The full MPD discovery path (directory listing → `MPD_FILENAME_PATTERN` → allowlist → KMZ
  fetch → KML parse → polygon containment → render) works against live WPC data.

**Fixture-verified only (explicitly, honestly disclosed in 15-09-SUMMARY.md, confirmed accurate
by this verification):**
- MPD-01's no-risk short-circuit gate (advisory-only payload defeating the no-risk line) — other
  risk was on screen during the live check, so this branch never fired live. Guarded only by
  `frontend-advisory-only-is-not-an-all-clear`, which is itself mutation-proven.
- MPD-02's "two concurrently active MPDs both render" — only one MPD covered the live test
  point. Guarded only by `mpd-multiple-concurrent-all-shown`, mutation-proven.
- All of WSSI-01/02/03 — D-10 explicitly deferred live WSSI UAT to in-season (winter), following
  the v1.1 fire-weather precedent already carried in STATE.md. Verified this phase via 6
  mutation-proven `wssi-*` scenarios plus a byte-identical live off-season response captured
  during RESEARCH.md (structural proof for WSSI-03).
- MPD-04's year-boundary rejection (`MPD_1281` vs current MPDs) — reproduced with real captured
  field values from RESEARCH.md's live reconnaissance, but the specific stale/current pairing is
  a fixture, not an on-demand live reproduction (not realistically reproducible from a live
  check, since the stale straggler observed during research may since have been archived).

Both limitations are stated honestly in 15-09-SUMMARY.md's "What this does NOT prove" section,
and this verification confirms the corresponding fixtures (`frontend-advisory-only-is-not-an-all-clear`,
`mpd-multiple-concurrent-all-shown`) genuinely exist, are mutation-proven, and pass.

## Overall Phase Verdict

**PASSED.** All seven requirement IDs (WSSI-01, WSSI-02, WSSI-03, MPD-01, MPD-02, MPD-03, MPD-04)
have working, wired, code-level implementations traced directly to source, backed by a
32-scenario probe suite that was re-run independently during this verification (32 passed, 0
failed, 0 skipped, matching the SUMMARY.md claim exactly) and cross-checked scenario-by-name
against the actual file contents rather than trusted from prose. The phase's own designated
blocking anti-pattern — vacuous test coverage — was specifically checked: the 32-scenario
inventory in 15-09-SUMMARY.md is complete and accurate (32/32 names verified against the source
file), with the sole non-mutation-proven scenario honestly disclosed and structurally sound. The
socket migration (Pitfall 5, this phase's highest-flagged cross-file risk) is independently
mutation-proven as the *only* scenario sensitive to a `payload[2]`-vs-`payload[1]` regression.
Cross-file consistency between `node_helper.js` and `MMM-SPCOutlook.js` is clean — no `mds`
stragglers, matching socket contract at both ends. Two Info-level, non-blocking findings are
recorded (unexercised WSSI tiers above the D-09 floor; two orphaned pre-migration KMZ helper
functions) for future cleanup, neither of which affects requirement satisfaction or goal
achievement. No human verification items remain outstanding — the phase's own D-10-mandated live
MPD checkpoint was already completed and human-approved before this verification ran, and its
explicitly-disclosed live-unverified items (WSSI in-season, MPD-02 concurrency, MPD-01 gate) are
already recorded as deferred-to-STATE.md items in the SUMMARY, not open verification gaps.

---

*Verified: 2026-08-24T20:21:10Z*
*Verifier: Claude (gsd-verifier)*
