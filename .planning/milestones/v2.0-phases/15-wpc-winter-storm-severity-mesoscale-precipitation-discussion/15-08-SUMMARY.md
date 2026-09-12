---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 08
subsystem: probe-harness
tags: [testing, kmz, kml, ssrf-allowlist, spc-md, socket-contract, mpd-01]

# Dependency graph
requires:
  - phase: 15-04
    provides: "normalizeAdvisoryUrl (hostname-parsed https allowlist) and the kml-advisory shared runner this plan's SPC MD scenarios drive"
  - phase: 15-07
    provides: "the [outlook, seq] two-element socket contract at payload[1] and the no-risk gate's advisory term this plan pins"
  - phase: 15-02
    provides: "makeKmzBuffer and the real-dependency probe harness design this plan's kmzOf wrapper extends"
provides:
  - "mdKml/mpdKml/activeIndexKml/kmzOf/advisoryRoutes/noRiskPayloadWithAdvisory — shared KMZ/KML fixture builders for plan 15-09"
  - "four mutation-proven scenarios pinning Pitfall 1's fix, the off-host refusal control, CR-03's socket-index discard, and the MPD-01 no-risk gate"
affects: [15-09]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "fixture builders parameterised for reuse across plans (mdKml/mpdKml/activeIndexKml/kmzOf/advisoryRoutes), rather than one-off literals per scenario"
    - "frontend socket-contract scenarios drive the real socketNotificationReceived via Object.create(frontend) + .call(ctx, ...), the same instantiation pattern renderDom already uses for getDom"

key-files:
  created: []
  modified: [scripts/probe-payload-resilience.js]

key-decisions:
  - "kmzOf places its filler non-.kml entry via Object.assign onto a target object that already owns the 'style.xsl' key, relying on JS's first-insertion-position ordering guarantee rather than array-based entry ordering, so a caller's entries object can never accidentally displace it to the front"
  - "frontend-seq-discard-survives-socket-index-migration uses bare marker objects ({marker:'A'}) rather than full outlook payload shapes, since socketNotificationReceived only assigns payload[0] to this.spcrisk and never reads its shape — keeping the scenario's only variable the seq value under test"

requirements-completed: [MPD-01]

# Metrics
duration: ~35min
completed: 2026-08-24
---

# Phase 15 Plan 08: SPC MD Allowlist and Frontend-Contract Scenarios Summary

**Added shared KMZ/KML fixture builders plus four mutation-proven probe scenarios that pin the `http://` SPC MD allowlist fix, its off-host-refusal control, CR-03's out-of-order discard at the new `payload[1]` socket index, and the MPD-01 advisory-only no-risk-gate guard — closing the phase's last-identified coverage gap where nothing in the suite drove `socketNotificationReceived` or the real allowlist.**

## Performance

- **Duration:** ~35 min
- **Started:** 2026-08-24 (approx)
- **Completed:** 2026-08-24
- **Tasks:** 3 completed
- **Files modified:** 1 (scripts/probe-payload-resilience.js)

## Accomplishments

- Added six shared fixture/payload builders (`mdKml`, `mpdKml`, `activeIndexKml`, `kmzOf`, `advisoryRoutes`, `noRiskPayloadWithAdvisory`) to the probe harness, all parameterised for reuse by plan 15-09 rather than hardcoded to one scenario's values.
- `spc-md-http-href-not-rejected-by-allowlist` drives a real `http://` SPC MD href — the exact scheme SPC's live `ActiveMD.kmz` serves — through the real `normalizeAdvisoryUrl` allowlist, discovery strategy and KMZ/KML decode chain, and asserts it resolves to a fetched, contained, correctly-labelled SPC MD entry.
- `spc-md-off-host-href-still-refused` is its control: an `http://evil.test/x.kmz` href in the same index is refused, never reaches the network (asserted against the `_fetch` call log), and the refusal is logged with the offending value.
- `frontend-seq-discard-survives-socket-index-migration` drives the real `MMM-SPCOutlook.js` `socketNotificationReceived` through an in-order → out-of-order → higher-order sequence at the new `payload[1]` index, closing the gap RESEARCH.md Pitfall 5 flagged: no prior scenario exercised the socket handler at all.
- `frontend-advisory-only-is-not-an-all-clear` proves an advisory-only payload (every day/fireWeather/ERO/WSSI value at its no-risk default) does not short-circuit to `"No Severe Weather Risk"`, with an empty-advisories control proving the gate still fires normally otherwise.
- All four new scenarios were individually mutation-proven per the phase's blocking anti-pattern requirement (D-10): each was broken by a targeted source mutation, ran RED with a diagnosable message, then restored to green.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add KML/KMZ fixture builders for advisory scenarios** - `6416833` (feat) — `scripts/probe-payload-resilience.js`
2. **Task 2: Add the SPC MD allowlist scenarios and the frontend contract scenarios** - `a4c48ce` (feat) — `scripts/probe-payload-resilience.js`
3. **Task 3: Mutation-prove the four new scenarios** - no commit. Every mutation applied during this task was reverted via `git checkout --` before task completion (per the plan's own action), so there is no residual source change to commit; `git diff --exit-code node_helper.js MMM-SPCOutlook.js scripts/probe-payload-resilience.js` confirmed a clean tree at task end. The mutation record and RED output are captured below.

_Note: this plan has no plan-metadata commit here — this executor runs in worktree mode; the orchestrator makes the final metadata commit after merge (per its explicit instruction not to update STATE.md/ROADMAP.md)._

## Files Created/Modified

- `scripts/probe-payload-resilience.js` — Added `mdKml`, `mpdKml`, `activeIndexKml`, `kmzOf`, `advisoryRoutes`, `noRiskPayloadWithAdvisory` (Task 1), and four new scenarios: `spc-md-http-href-not-rejected-by-allowlist`, `spc-md-off-host-href-still-refused`, `frontend-seq-discard-survives-socket-index-migration`, `frontend-advisory-only-is-not-an-all-clear` (Task 2). Suite grew from 22 to 26 scenarios; existing 22 unchanged.

## Mutation Proofs (D-10 / blocking anti-pattern requirement)

Each row is a source mutation applied to a committed file, the suite run, the failure observed, then the file restored via `git checkout --` and the suite re-run to confirm green. `git diff --exit-code node_helper.js MMM-SPCOutlook.js scripts/probe-payload-resilience.js` was clean after every mutation was reverted.

| # | Mutation | File | Scenario expected RED | Result |
|---|----------|------|------------------------|--------|
| 1 | Restrict `normalizeAdvisoryUrl`'s accepted protocol to `https:` only (remove the `http:` branch) | `node_helper.js` | `spc-md-http-href-not-rejected-by-allowlist` | RED: `Pitfall 1 regression: expected 1 SPC MD entry from an http:// href, got 0. Against the pre-fix MD_HOST_PREFIX startsWith(...) check this scenario would report zero entries, which was the live production behaviour on every poll.` Side effect (expected, same function under test): `spc-md-off-host-href-still-refused` also went RED (`expected exactly 1 SPC MD entry (the legit host), got 0`), since that scenario's legitimate href is also `http://`. |
| 2 | Drop the hostname-equality check in `normalizeAdvisoryUrl` while keeping the scheme check | `node_helper.js` | `spc-md-off-host-href-still-refused` | RED: `the off-host href reached the network: [..., "https://evil.test/x.kmz"]` — the full recorded `_fetch` call log naming `evil.test`. No other scenario went RED. |
| 3 | Change `MMM-SPCOutlook.js`'s sequence read from `payload[1]` back to `payload[2]` | `MMM-SPCOutlook.js` | `frontend-seq-discard-survives-socket-index-migration` | RED: `CR-03 at the new socket index: an out-of-order payload (seq 3 after seq 5) was not discarded — spcrisk={"marker":"B"}, updateDomCalls=2`. Blast radius recorded explicitly: this was the **only** scenario that went RED (24 others stayed PASS) — direct evidence for RESEARCH.md Pitfall 5's claim that nothing else in the suite can detect this regression. |
| 4 | Delete the advisory term (`!((this.spcrisk.advisories?.spcMD?.length > 0) \|\| ...)`) from `MMM-SPCOutlook.js`'s no-risk short-circuit gate | `MMM-SPCOutlook.js` | `frontend-advisory-only-is-not-an-all-clear` | RED: `MPD-01: an advisory-only payload (every day/fireWeather/ERO/WSSI value no-risk, no _stale) short-circuited to the plain no-risk line — before Phase 15 the gate had no advisory term at all, so this rendered as a confident all-clear while the user was inside an active discussion.` No other scenario went RED. |

Final state after all four mutations were applied-then-reverted: `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 26 passed, 0 failed, 0 skipped`, exit 0 (re-confirmed at the end of Task 3, and again at self-check time below).

## Decisions Made

- `kmzOf` builds its "non-.kml entry first" guarantee on `Object.assign({"style.xsl": "<xsl/>"}, entries)`. JS objects preserve a string key's *first* insertion position even when a later `Object.assign` call updates its value, so a caller's `entries` object — even one that happens to also carry a `style.xsl` key — can never push the filler entry to a later position. Verified directly against the real `adm-zip` (`noSort: true`) round-trip: `kmzOf({"MD2108.kml": mdKml("MD 2108")})` produces entry order `["style.xsl", "MD2108.kml"]`.
- `frontend-seq-discard-survives-socket-index-migration` drives `socketNotificationReceived` with bare marker objects (`{marker: "A"}`) rather than realistic outlook payload shapes, since the function under test only ever assigns `payload[0]` to `this.spcrisk` — using a marker keeps the only meaningful variable in the scenario the `seq` value at `payload[1]`.
- `advisoryRoutes` and `noRiskPayloadWithAdvisory` were built as shared, parameterised helpers (not scenario-local literals) per the plan's explicit instruction that Task 1's builders are "shared by this plan and plan 15-09."

## Deviations from Plan

None — plan executed exactly as written. All four fixture builders, the route helper, the payload builder, and the four scenarios match the plan's action text; the mutation-proof mechanism (break → RED with diagnosable message → revert → green) was followed per-scenario as the blocking anti-pattern section requires.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required. `node_modules` (real `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson`, `xpath`) resolved successfully from the repository root (the worktree nests under the main repo checkout, so Node's directory-walking module resolution found the main repo's `node_modules`); `hasRealKmlDeps` was `true` throughout, so no scenario was skipped.

## Next Phase Readiness

- `scripts/probe-payload-resilience.js` now drives every layer this phase's D-03/D-04/MPD-01 guarantees depend on: the real allowlist (both accept and refuse paths), the real socket handler at its post-migration index, and the advisory term of the no-risk gate.
- The six shared fixture builders (`mdKml`, `mpdKml`, `activeIndexKml`, `kmzOf`, `advisoryRoutes`, `noRiskPayloadWithAdvisory`) are available for plan 15-09 to build its own WPC MPD scenarios without re-deriving KML/KMZ construction from scratch.
- No blockers.

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Completed: 2026-08-24*

## Self-Check: PASSED

- FOUND: scripts/probe-payload-resilience.js
- FOUND: .planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-08-SUMMARY.md
- FOUND commit: 6416833 (Task 1)
- FOUND commit: a4c48ce (Task 2)
- FOUND commit: bfea00c (SUMMARY.md)
- `node scripts/probe-payload-resilience.js` re-run at self-check time: 26 passed, 0 failed, 0 skipped, exit 0
