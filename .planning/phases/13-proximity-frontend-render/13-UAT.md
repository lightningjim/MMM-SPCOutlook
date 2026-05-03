---
status: complete
phase: 13-proximity-frontend-render
source: [13-01-SUMMARY.md, 13-02-SUMMARY.md, 13-03-SUMMARY.md]
started: 2026-05-03T13:52:12Z
updated: 2026-05-03T13:52:12Z
---

## Current Test

[testing complete]

## Tests

### 1. Cold Start — MagicMirror² boots with module
expected: |
  MagicMirror² restart with the v1.2 build loaded. Module registers without errors;
  `getDom()` runs through the data-bearing branch on the first SPC fetch tick. No
  console errors related to `proximityBadge`, `cigLabelFromTierString`, or
  `PROX_MIN_WEIGHT` symbols. Pre-existing `weather-icons` glyphs still render.
result: pass
note: "User confirmed live: all UAT verified."

### 2. Default-off DOM byte-identity (PROXUI-01)
expected: |
  With `proximityWeighting` absent (or explicitly `false`) in module config: no
  proximity badges anywhere. Day 1/2/3 categorical rows render exactly as in v1.1
  (no `→ ENH 0.7` suffix, no `0.6 (near SLGT)` suffix). Per-hazard CIG rows render
  unchanged (no glyph between `cigLabel` and percent). Day 3 dual-badge produces
  a row identical to pre-Phase-13 (no semicolon, no extra badge). Stale indicator
  (Phase 11) and umbrella "no severe weather" message still fire under the same
  conditions as v1.1.
result: pass
note: "User confirmed live: all UAT verified."

### 3. Inside-tier categorical badge (PROXUI-02)
expected: |
  With `proximityWeighting: true` and a location inside an SLGT polygon when an
  ENH polygon is within 40 km: Day 1/2/3 categorical rows show ` → ENH 0.7`
  (1-decimal weight) appended after the colored risk-name span. Color of badge
  inherits from the surrounding wrapper. Same behavior on Day 2/3 rows when a
  higher tier is nearby.
result: pass
note: "User confirmed live: all UAT verified."

### 4. Outside-tier categorical badge + umbrella suppression (PROXUI-03)
expected: |
  With `proximityWeighting: true` and a location outside all SPC categorical
  polygons but with a tier polygon (e.g. MRGL or SLGT) within 40 km: the
  Day 1/2/3 row is admitted (instead of being suppressed by the historical
  `risk != "NONE"` gate) and shows ` 0.6 (near SLGT)` (1-decimal weight + tier
  label). The umbrella "No Severe Weather Risk" message does NOT fire — the
  proximity-only signal correctly inhibits it.
result: pass
note: "User confirmed live: all UAT verified."

### 5. Per-hazard CIG proximity badges (PROXUI-04)
expected: |
  With `proximityWeighting: true`: per-hazard rows on Day 1 and Day 2 (tornado,
  hail, wind) show a CIG proximity glyph (`①`/`②`/`③`) between the existing
  `cigLabel` glyph and the prob percent — e.g. `tornado-icon ② → ③ 0.7 5%`. Day 3
  cig badge appears inside the dual-badge layout (see test 6). Documented visual
  artifacts (double-space `②  →`, missing space before `5%`) are present but
  acceptable per CONTEXT.md deferred section.
result: pass
note: "User confirmed live: all UAT verified."

### 6. Day 3 dual-badge with semicolon separator (PROXUI-02 + PROXUI-04)
expected: |
  With `proximityWeighting: true` on a day where both Day 3 categorical and CIG
  proximity entries are emitted: the row renders both badges INSIDE the colored
  risk span, separated by `;` — e.g. `Wed (Day 3): Slight Risk② → ENH 0.6; → ③ 0.7`.
  When only one of the two badges is present, the separator is suppressed (no
  trailing `;`).
result: pass
note: "User confirmed live: all UAT verified."

### 7. Noise-floor flicker suppression (PROXUI-05)
expected: |
  With `proximityWeighting: true` and a real SPC outlook scenario where the
  user's distance produces a weight near 0.05–0.10 (close to but below
  `PROX_MIN_WEIGHT = 0.1`): badge stays suppressed across multiple update cycles
  (~60 minutes minimum). Does NOT flicker on/off due to floating-point noise in
  `turf.pointToLineDistance`. Weights ≥ 0.1 display rounded to 1 decimal.
result: pass
note: "User confirmed live: all UAT verified."

## Summary

total: 7
passed: 7
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none — all live UAT items confirmed passing by user]
