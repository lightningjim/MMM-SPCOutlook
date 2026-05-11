---
slug: day2-none-still-displays
status: resolved
trigger: "Day 2 displays with risk=NONE even though NONE should mean Day 2 is hidden entirely"
created: 2026-05-11
updated: 2026-05-11
---

# Debug: day2-none-still-displays

## Symptoms

- **Expected behavior:** When a day's risk is `NONE`, the day row should be hidden from the SPC FORECAST display (not rendered at all).
- **Actual behavior:** Day 2 is rendering in the UI as "Tue (Day 2): None" instead of being hidden. Day 4, Day 5, Day 7, Day 8 also have risk=NONE but appear to be correctly hidden in the screenshot (only Day 2, Day 3, Day 6 are shown).
- **Error messages:** No console errors. Console log shows:
  ```
  SPC_DATA_RESULT Received - [{"day48Risk":true,"day1":{"risk":"NONE",...},
  "day2":{"risk":"NONE","text":"None","color":"afddf6","probRisk":false,
    "torRisk":0,"torCig":0,"hailRisk":0,"hailCig":0,"windRisk":0,"windCig":0,
    "proximity":{"categorical":{"value":0.09783106911253747,"nextTier":"TSTM"}}},
  "day3":{"risk":"TSTM",...},
  "day4":{"risk":"NONE",...},
  "day5":{"risk":"NONE",...},
  "day6":{"risk":"SLGT",...},
  "day7":{"risk":"NONE",...},
  "day8":{"risk":"NONE",...},
  ...]
  ```
- **Timeline:** Unknown — user reports this as current behavior.
- **Reproduction:** Module loads SPC data; Day 2 outlook has no risk areas (NONE) but Day 2 has proximity data (`proximity.categorical.value: 0.0978`, `nextTier: TSTM`).

## Key Clue

Day 2 differs from Days 4/5/7/8 in one way: it has a `proximity` field attached:
```json
"proximity": {"categorical": {"value": 0.09783106911253747, "nextTier": "TSTM"}}
```

Days 4, 5, 7, 8 are NONE without proximity data — they are hidden correctly.
Day 2 is NONE *with* proximity data — it is shown incorrectly (or maybe shown intentionally for proximity, but rendering the wrong text).

This strongly suggests:
- The Day 2 visibility filter checks for `risk !== "NONE"` OR proximity data,
- But the display path renders "None" instead of a proximity-aware label.

## Current Focus

- **hypothesis:** Day 2 visibility test in `MMM-SPCOutlook.js:124` checks `this.spcrisk.day2.proximity?.categorical` truthy-presence, but `proximityBadge()` in lines 55-67 suppresses the badge when the post-decimal weight is below `PROX_MIN_WEIGHT = 0.1` (noise-floor flicker suppression, PROXUI-05). The visibility test and the badge renderer disagree on what counts as a "renderable" proximity, leaving a bare "(Day N): None" row when weight is below noise floor.
- **next_action:** Done — confirmed via direct code inspection.
- **test:** Day 2 with `proximity.categorical.value: 0.0978` (weight = 0.0978 < 0.1) reproduces the bug; same payload after fix should be hidden entirely.
- **expecting:** Day 2 row hidden when weight < PROX_MIN_WEIGHT, identical to Days 4/5/7/8.

## Evidence

- timestamp: 2026-05-11 (session-manager direct inspection)
  - file: MMM-SPCOutlook.js
  - finding: Lines 113, 124, 134 — visibility tests for Day 1/2/3 use `risk != "NONE" || day.proximity?.categorical` (and `|| day.proximity?.cig` for Day 3). Truthy presence — does not check weight.
- timestamp: 2026-05-11
  - file: MMM-SPCOutlook.js
  - finding: Lines 55–67 — `proximityBadge(prox, mode)` returns `""` when `weight < PROX_MIN_WEIGHT (0.1)`. Weight is computed as `prox.value - Math.trunc(prox.value)`.
- timestamp: 2026-05-11
  - file: node_helper.js
  - finding: Lines 142–176 — `computeProximity()` emits `{value: currentValue + weight, nextTier}` for any weight > 0; no noise-floor filter applied backend-side. For risk=NONE (currentValue=0), value equals the raw weight.
- timestamp: 2026-05-11
  - file: .planning/MILESTONES.md, .planning/PROJECT.md
  - finding: PROXUI-05 explicitly documents `PROX_MIN_WEIGHT = 0.1` as "noise-floor flicker suppression". Intent is to hide visual noise; current code only hides the *badge*, not the *row*.
- timestamp: 2026-05-11
  - data: Day 2 payload `proximity.categorical.value = 0.09783106911253747`, `nextTier = "TSTM"`
  - calculation: `weight = 0.0978 - Math.trunc(0.0978) = 0.0978 - 0 = 0.0978`. Since `0.0978 < 0.1` → badge returns `""`. Row still renders because line 124's `||` clause sees `proximity.categorical` as truthy.
- timestamp: 2026-05-11
  - file: MMM-SPCOutlook.js
  - finding: Same bug present in lines 73–91 (No-Severe-Weather-Risk early-return short-circuit). Conditions `!this.spcrisk.day1.proximity`, `!this.spcrisk.day2.proximity`, `!this.spcrisk.day3.proximity` only check existence, not renderable weight. A sub-noise-floor proximity prevents the "No Severe Weather Risk" short-circuit.

## Eliminated

- "Visibility filter forgot to keep hiding when risk=NONE regardless of proximity" — eliminated. Visibility filter intentionally shows NONE+proximity (design intent confirmed in PROJECT.md and v1.2 phase docs). The bug is that "proximity" presence and "renderable proximity" diverge below the 0.1 noise floor.
- "Label renderer falls through to None text" — partially eliminated. Label IS the raw `text` ("None") by design; the badge is meant to ADD the proximity hint. When the badge is empty, the design assumed the row would also not render — but it does, because the visibility test is too permissive.

## Root Cause

`proximityBadge()` and the day-visibility predicates disagree on what counts as a renderable proximity. The visibility tests on lines 113, 124, 134 (and the no-risk short-circuit on lines 73–91) check only for the *presence* of `proximity.categorical`/`proximity.cig`, while `proximityBadge()` (lines 55–67) suppresses output when the post-decimal weight is below `PROX_MIN_WEIGHT = 0.1`. When the backend emits a proximity with weight ∈ (0, 0.1), the day row renders with no badge — exhibiting as bare "(Day N): None".

Day 2's payload `value=0.09783, nextTier=TSTM` produces weight=0.09783, which is below the 0.1 noise floor — so the badge is suppressed but the row is still shown.

## Resolution

**Fix:** Introduce a single source of truth `hasRenderableProximity(prox)` helper that mirrors the gates in `proximityBadge()` (presence + value/nextTier shape + `weight >= PROX_MIN_WEIGHT`). Use it for:
1. The three day-visibility predicates (lines 113, 124, 134).
2. The "No Severe Weather Risk" short-circuit (lines 73–91).

This collapses the divergence: anywhere a proximity must be considered "renderable" goes through one function. The badge renderer itself keeps its existing gate as a redundant safety check.

**Commit:** see git log.

**Verification:** With Day 2 payload `proximity.categorical = {value: 0.0978, nextTier: "TSTM"}`, weight = 0.0978 < 0.1 → `hasRenderableProximity` returns false → Day 2 row hidden, matching Days 4/5/7/8. With a payload `value: 0.6` (above noise floor) → renders badge "(near TSTM)" as designed.
