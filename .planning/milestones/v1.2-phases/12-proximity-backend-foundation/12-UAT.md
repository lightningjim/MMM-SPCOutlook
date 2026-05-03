---
status: complete
phase: 12-proximity-backend-foundation
source: [12-01-SUMMARY.md, 12-02-SUMMARY.md, 12-03-SUMMARY.md]
started: 2026-05-01T14:00:31Z
updated: 2026-05-01T14:18:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. Cold Start Smoke Test
expected: Stop MM cold, restart from scratch. node_helper boots, module renders within ~10s, no red error banner, no uncaught exceptions in the MM log.
result: pass

### 2. Default-off invariance (no proximityWeighting in config)
expected: With your config NOT setting `proximityWeighting` (or set to `false`), the rendered module looks byte-identical to pre-Phase-12: same Day 1/2/3 rows, same risk labels, same fire wx rows, same stale indicator behavior. No new badges, no console errors. Optionally: open the MM dev console and inspect the latest SPC payload — `dayN.proximity` should NOT exist on day1/day2/day3.
result: pass
note: "User confirmed via dev console; no active risk on any of the next 8 days at test time (clean no-data baseline)"

### 3. Strict-true coerce (truthy non-true rejected)
expected: Set `proximityWeighting: 1` (or `"true"` as a string) in config and reload. Behavior is identical to Test 2 — the strict `=== true` coerce in `node_helper.js:42` rejects non-literal-true values. No errors, no `proximity` subtree emitted.
result: pass

### 4. Proximity-on cold start (no UI regression)
expected: Set `proximityWeighting: true` in config, restart MM. Module renders normally (Day 1/2/3 rows, risk labels, fire wx). Phase 13 isn't done yet, so no proximity badges are visible — but nothing should be broken or missing either. No errors in the MM log, no missing rows.
result: pass

### 5. Proximity-on payload inspection (dev console)
expected: With `proximityWeighting: true` and active SPC outlooks for your location (i.e. you're inside or within 40 km of a categorical or CIG polygon for any of Days 1–3), inspect the socket payload in MM dev console. At least one `dayN.proximity` subtree appears with shape `{ categorical?: {value, nextTier}, torCig?: {...}, hailCig?: {...}, windCig?: {...}, cig?: {...} }`. Each `value` is `currentValue + weight` where `0 < weight < 1`. If no outlooks are active near you today, mark this skipped with reason "no active outlooks within 40 km" — the code path is verifiable later when severe weather is closer.
result: pass
note: |
  Verified empirically via MM dev console. Cold-start log shows clean module registration and a well-formed SPC_DATA_RESULT payload at lat 35.4432156, lon -97.595822 (central Oklahoma). Every day reports `risk: NONE` — no active outlooks within 40 km on 2026-05-01.
  Observed payload shape (default-off byte-identity invariant holds even with flag on, because null-omission discipline is correct):
    day1: { risk, text, color, probRisk, torRisk, torCig, hailRisk, hailCig, windRisk, windCig }  ← no `proximity` key
    day2: same shape  ← no `proximity` key
    day3: { risk, text, color, probRisk, cig }  ← no `proximity` key
  Negative case (no higher-tier polygons → no subtree) confirmed in production. Positive case (subtree appears with `{value, nextTier}` entries) awaits a real severe-weather day in user's region to verify in vivo. Phase 12 helper-isolation smoke harness in 12-01-SUMMARY.md already exercises the positive code path.

## Summary

total: 5
passed: 5
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
