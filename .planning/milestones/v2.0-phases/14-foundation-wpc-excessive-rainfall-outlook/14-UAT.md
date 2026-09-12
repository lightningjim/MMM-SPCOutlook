---
status: complete
phase: 14-foundation-wpc-excessive-rainfall-outlook
source: [14-01-SUMMARY.md, 14-02-SUMMARY.md, 14-03-SUMMARY.md, 14-04-SUMMARY.md, 14-05-SUMMARY.md, 14-06-SUMMARY.md, 14-07-SUMMARY.md]
started: 2026-08-21T22:59:28Z
updated: 2026-08-23T00:00:00Z
---

## Why this session exists

Plan 14-05 recorded a human UAT sign-off on 2026-08-19. Since that sign-off the tree
has moved by ~20 commits: gap-closure plans 14-06/14-07, then an 18-commit code-review
fix round. That sign-off no longer describes the code that runs today, so the five
ROADMAP success criteria are being re-tested against the current tree.

## Fixtures (regenerated live 2026-08-21T22:5x Z — supersedes 14-UAT-FIXTURES.md)

The 2026-08-19 fixtures are stale: the southern-Arizona inside-point (31.883, -111.540)
is no longer covered by any ERO polygon on any day. Use the coordinates below.

| Role | lat | lon | Expected |
|---|---|---|---|
| Inside, all 5 days | `36.312325788164685` | `-111.09371264072709` | Days 1-5 all MRGL / Marginal / `7ac687` |
| Inside, Day 1 only | `35.634839028576025` | `-79.24125163428263` | Day 1 SLGT / Slight / `f7f690`; Days 2-5 NONE |
| Outside, all 5 days | `47.61` | `-122.33` | Days 1-5 NONE (Seattle) |

Live `dn` domain today: Days 1-2 carry `dn` 1 and 2; Days 3-5 carry `dn` 1 only.
No MDT/HIGH polygon exists anywhere in CONUS today, so those two tiers cannot be
exercised in this pass.

## Pre-test evidence (automated, already collected)

- `node scripts/probe-payload-resilience.js` → **8 passed, 0 failed**, exit 0
- All three `14-VERIFICATION.md` blocking gaps are structurally closed in the current tree:
  - Gap 1 (winning polygon not first feature) — `firstFeature.properties[...]` is gone,
    replaced by `_validTimeOfWinner(...)` gated on `eroValue > 0`; probe scenario
    `ero-leading-bad-feature-preserves-risk` passes
  - Gap 2 (degraded `0` cached with bad ETag) — fixed at the source in
    `fetchGeoJsonCached`: `rejectBody()` returns `data: null`, so every cache-write
    branch is skipped for an unusable body
  - Gap 3 (silent non-2xx / network failure) — both branches now `Log.error` and
    return `failed: true`, which sets `stale` at every call site

## Current Test

None — session closed 2026-08-23.

## Tests

### 1. Cold Start — module loads and renders
expected: Module renders normal SPC/fire-weather rows after a full restart; no error box, no uncaught exception in console.
result: pass

### 2. ERO Off By Default (CFG-01)
expected: With no `showExcessiveRain` key in your module config, zero "Excessive Rain" rows appear — the product is off out of the box.
result: skipped
reason: "User: skip, no active Excessive Rain is forecast for my area — absence of rows at the home location cannot distinguish 'toggle off' from 'no risk'. Re-testable at the test-3 inside-point fixture (36.3123, -111.0937) with the key removed."


### 3. ERO Tier Correct, All Five Days (ERO-01, ERO-02)
expected: Set lat `36.312325788164685`, lon `-111.09371264072709`, `showExcessiveRain: true`. Five rows appear — "Excessive Rain (Day 1..5): Marginal" — all in the green `#7ac687`. Cross-check against WPC's public ERO map; the tiers must match.
result: pass

### 4. Selective Days — Absence, Not Empty Rows (ERO-03)
expected: Set lat `35.634839028576025`, lon `-79.24125163428263`. Exactly ONE ERO row appears — "Excessive Rain (Day 1): Slight" in yellow `#f7f690`. Days 2-5 produce no row at all — not a blank row, not "None".
result: pass

### 5. Outside Every Polygon (ERO-03)
expected: Set lat `47.61`, lon `-122.33` (Seattle) with `showExcessiveRain: true`. Zero ERO rows — clean absence, no error row and no "None" row.
result: pass
note: "User validated the equivalent case during test 2 — home location falls outside every ERO polygon today and produced zero ERO rows (clean absence, no error row, no 'None' row). Seattle fixture not separately exercised.\"

### 6. Payload No Longer Forks On `extended` (CFG-02)
expected: Set `extended: false` AND `showExcessiveRain: true` at the inside point from test 3. The five ERO rows still render — proving ERO no longer rides on the `extended` flag.
result: pass

### 7. No-Risk Gate Intact (RPT-06 regression target)
expected: At a location where every product is quiet, the module shows "No Severe Weather Risk" exactly once, with no stray leftover rows above or below it.
fixture_correction: |
  The Seattle fixture (47.61, -122.33) is invalid for this test today — user
  observed Fire Wx Elevated Day 1 there, and a live sweep of all 25 layers the
  module fetches confirms Seattle also sits inside an SPC Day-2 TSTM area.
  Replaced with San Diego, CA (32.7157, -117.1611), verified quiet across SPC
  categorical Day 1-3, SPC probabilistic Day 4-8, fire weather Day 1-8
  (dryt + windrh, base and extended), and ERO Day 1-5.
result: pass
note: "Verified at the corrected San Diego fixture (32.7157, -117.1611), not the stale Seattle one.\"

### 8. `f=geojson` Every Poll, Cache Hits On Second Cycle (DATA-01, PERF-02)
expected: Watch the MagicMirror log across two poll cycles. Every ERO request carries `f=geojson` (never `f=json`), the query string is byte-identical between cycles, and the second cycle logs "cache hit (ETag)" lines rather than re-fetching bodies.
result: pass

### 9. Two Instances, Two Locations (targets open review CR-01/CR-02)
expected: Configure two MMM-SPCOutlook instances at clearly different locations — e.g. the inside point (`36.3123`, `-111.0937`) and Seattle (`47.61`, `-122.33`) — both with `showExcessiveRain: true`. Each instance shows ITS OWN location's result: the first shows five Marginal rows, the second shows none. Neither instance displays the other's answer.
result: skipped
reason: |
  User: not a realistic configuration for this deployment — one instance of the
  module drives the display, so only one location is ever used. The two defects
  this test targeted (round-2 CR-01 URL-keyed cache, round-2 CR-02 uncorrelated
  broadcast) are recorded as DEFERRED-BY-OWNER in STATE.md Deferred Items.
  The round-3 deep review independently confirmed neither is reachable with a
  single instance at a single location.
  NOTE: the same unconditional payload accept IS reachable single-instance via
  overlapping polls — that was raised as round-3 CR-03 and FIXED (commit 09af950,
  _inFlight guard + monotonic _seq), not deferred.

## Summary

total: 9
passed: 7
issues: 0
pending: 0
skipped: 2
blocked: 0

## Gaps

None blocking. Two tests skipped by user decision (2 and 9), both recorded above with rationale.

## Post-UAT change notice

After this UAT session signed off, a third code-review round (deep depth, 14-REVIEW.md
2026-08-23) found 3 Critical + 11 Warning findings, all fixed in 16 commits
(0964f1c..f6debc9). Those fixes changed `getDom`'s branch order, the Mesoscale
Discussion path, and the poll loop. The 7 passes above were recorded against the
PRE-FIX tree and were not re-run by hand.

Coverage rationale for closing anyway: the probe suite grew from 8 scenarios
(5 load-bearing) to 15, all mutation-proven, and now includes
`frontend-total-outage-still-shows-the-outage` — a render-level regression test for
the exact defect the manual passes could not have caught, because it only appears
during a total upstream outage.
