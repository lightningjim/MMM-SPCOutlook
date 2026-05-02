---
phase: 13-proximity-frontend-render
plan: 01
subsystem: frontend-render
tags: [proximity, frontend, helpers, render, magicmirror]
requires: []
provides:
  - "PROX_MIN_WEIGHT constant (top-of-getDom, MMM-SPCOutlook.js line 48)"
  - "cigLabelFromTierString(tier) helper (Option B sibling — MMM-SPCOutlook.js lines 49–54)"
  - "proximityBadge(prox, mode) helper (top-of-getDom — MMM-SPCOutlook.js lines 55–67)"
affects:
  - "Plans 13-02 and 13-03 will consume these helpers at every Day 1/2/3 categorical and per-hazard CIG render site"
tech-stack:
  added: []
  patterns:
    - "Defensive type-check + edge-case fallback (Phase 11 stale-indicator analog)"
    - "Top-of-getDom const arrow helpers (cigLabel/dowToText analog)"
    - "Concatenation, not template literals (file-wide convention)"
    - "Color inheritance from surrounding span (no <span style=...> wrapping in helper output, D-14)"
key-files:
  created: []
  modified:
    - "MMM-SPCOutlook.js (148 -> 168 lines, +20 helper lines at top of getDom)"
decisions:
  - "Option B (sibling helper) chosen over Option A (extending cigLabel) — leaves existing cigLabel byte-identical, preserves trailing-space form for 7 existing call sites at Day 1/2/3 hazard rows and Day 3 cig"
  - "startsWith(\"CIG\") used over indexOf(\"CIG\") === 0 for clarity — modern Node and all MagicMirror² target browsers support it"
metrics:
  duration: "2min"
  tasks: 2
  files_modified: 1
  completed: "2026-05-02T23:36:26Z"
---

# Phase 13 Plan 01: Top-of-getDom Helpers Summary

**One-liner:** Three foundational helpers added to `MMM-SPCOutlook.js getDom()` — `PROX_MIN_WEIGHT = 0.1` noise-floor constant, `cigLabelFromTierString(tier)` sibling helper for `CIG1/CIG2/CIG3 → ①/②/③` mapping, and `proximityBadge(prox, mode)` formatter for inside-tier (`" → ENH 0.7"`) and outside-tier (`" 0.6 (near SLGT)"`) badges with weight derivation, rounding, and noise-floor short-circuit centralized in one place. No call sites wired — Plans 02/03 consume.

## What Was Built

### Task 1 — `PROX_MIN_WEIGHT` constant + `cigLabelFromTierString` helper

Added immediately after the existing `fireRiskToColor` declaration in `getDom()`:

```js
const fireRiskToColor = { 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" };
const PROX_MIN_WEIGHT = 0.1;
const cigLabelFromTierString = (tier) => {
  if (tier === "CIG3") return "③";
  if (tier === "CIG2") return "②";
  if (tier === "CIG1") return "①";
  return "";
};
```

**Lines:** 47 (existing, unchanged) → 48 (new constant) → 49–54 (new sibling helper).

**Option B chosen** per D-12 — the sibling-helper approach leaves the existing `cigLabel(integer)` byte-identical and isolates the new tier-string-keyed mapping. The new helper returns glyphs **without** trailing space because `proximityBadge` controls spacing via concatenation (`" → " + tierLabel + " " + weight.toFixed(1)`).

**Commit:** `7e99dda` — `feat(13-01): add PROX_MIN_WEIGHT constant and cigLabelFromTierString helper`

### Task 2 — `proximityBadge(prox, mode)` helper

Added immediately after `cigLabelFromTierString`:

```js
const proximityBadge = (prox, mode) => {
  if (!prox) return "";
  if (typeof prox.value !== "number" || !isFinite(prox.value)) return "";
  if (typeof prox.nextTier !== "string" || prox.nextTier.length === 0) return "";
  const weight = prox.value - Math.trunc(prox.value);
  if (weight < PROX_MIN_WEIGHT) return "";
  const tierLabel = prox.nextTier.startsWith("CIG")
    ? cigLabelFromTierString(prox.nextTier)
    : prox.nextTier;
  if (tierLabel === "") return "";
  if (mode === "outside") return " " + weight.toFixed(1) + " (near " + tierLabel + ")";
  return " → " + tierLabel + " " + weight.toFixed(1);
};
```

**Lines:** 55–67.

**Behavior:**
- Inside-tier mode (`{value: 2.7, nextTier: "ENH"}, "inside"`) → `" → ENH 0.7"` (D-02)
- Outside-tier mode (`{value: 0.6, nextTier: "SLGT"}, "outside"`) → `" 0.6 (near SLGT)"` (D-03)
- CIG inside (`{value: 1.7, nextTier: "CIG2"}, "inside"`) → `" → ② 0.7"` (D-09)
- CIG outside (`{value: 0.6, nextTier: "CIG1"}, "outside"`) → `" 0.6 (near ①)"` (D-09)
- Suppressed (returns `""`):
  - `prox` falsy/null/undefined
  - `prox.value` not finite number
  - `prox.nextTier` empty or non-string
  - `weight < PROX_MIN_WEIGHT` (D-13 noise floor — PROXUI-05)
  - `tierLabel === ""` defensive (CIG-prefixed but no glyph match)

**Weight derivation:** `prox.value - Math.trunc(prox.value)` works uniformly for inside (`2.7 - 2 = 0.7`) and outside (`0.6 - 0 = 0.6`) because Phase 12 D-07 strictly caps `weight < 1` (D-01).

**Rounding:** `weight.toFixed(1)` per D-04 / ROADMAP success criterion 5.

**Color treatment:** Helper returns plain text only — no `<span style=...>` wrapping per D-14. Caller embeds the badge inside (or after) an existing colored span; the badge inherits surrounding color naturally.

**Commit:** `954af71` — `feat(13-01): add proximityBadge(prox, mode) helper for inside/outside tier formatting`

## Decisions Made

1. **Option B (sibling helper) over Option A (extending `cigLabel`).** Plan recommended Option B for cleanliness; chosen accordingly. Existing `cigLabel(integer)` arrow at lines 41–46 is byte-identical to pre-plan state. The 7 existing call sites (Day 1 tor/hail/wind = 3, Day 2 tor/hail/wind = 3, Day 3 cig = 1) continue to receive the trailing-space form (`"③ "`/`"② "`/`"① "`) without modification.

2. **`prox.nextTier.startsWith("CIG")` over `prox.nextTier.indexOf("CIG") === 0`.** Both equivalent for the valid Phase 12 `nextTier` enum (`"TSTM"|"MRGL"|"SLGT"|"ENH"|"MDT"|"HIGH"|"CIG1"|"CIG2"|"CIG3"`). `startsWith` is supported in Node 4+ and all MagicMirror² target browsers; reads more clearly. Plan called this out as the recommended form.

3. **Strict triple-equality (`===`/`!==`) inside the new helpers.** The file uses loose equality (`==`/`!=`) only for risk-string comparisons in the existing umbrella check and row gates (lines 54–56, 90, 101, 111). The new helpers do not touch risk-string compares — they are type guards (`typeof === "string"`, etc.) where strict equality is the JS convention. This is consistent with the existing `cigLabel` helper at lines 41–46 which also uses `===` for integer matching.

4. **No `mode === "inside"` explicit branch — fall through.** The helper has an `if (mode === "outside")` early-return for the outside form; any other `mode` value (including `"inside"` and the typed call sites Plans 02/03 will write) returns the inside-tier form. This matches the plan's recommended shape and keeps the function shorter; if a future caller passes a typo for `mode`, the inside form renders, which is a defensible safe default given the contract (the badge is only suppressed via the four `return ""` short-circuits above, not via mode validation).

## Deviations from Plan

None — plan executed exactly as written. Both tasks followed the recommended Option B path and the recommended `proximityBadge` shape verbatim.

## Verification

- `node --check MMM-SPCOutlook.js` → exits 0 ✓
- `grep -c "PROX_MIN_WEIGHT" MMM-SPCOutlook.js` → 2 (declaration + reference inside `proximityBadge`) ✓
- `grep -c "proximityBadge" MMM-SPCOutlook.js` → 1 (declaration only — no call sites yet) ✓
- `grep -c "cigLabelFromTierString" MMM-SPCOutlook.js` → 2 (declaration + reference inside `proximityBadge`) ✓
- `grep -F "Math.trunc(prox.value)" MMM-SPCOutlook.js` → matches (D-01) ✓
- `grep -F "weight.toFixed(1)" MMM-SPCOutlook.js` → matches (D-04) ✓
- `grep -F '" → "' MMM-SPCOutlook.js` → matches (inside-tier arrow fragment, U+2192) ✓
- `grep -F "(near " MMM-SPCOutlook.js` → matches (outside-tier fragment) ✓
- `grep -F "isFinite" MMM-SPCOutlook.js` → matches both stale-indicator (line ~75) and `proximityBadge` (line ~57) ✓
- Backward-compat: `grep -c '"③ "' / '"② "' / '"① "'` all return 1 (existing `cigLabel` integer arms preserved) ✓
- Existing `cigLabel(this.spcrisk.day...)` callers: `grep -c` returns 7 (≥ 4 plan threshold) ✓
- `getStyles` count = 1 (no new registration, weather-icons line 31 untouched) ✓
- `MMM-SPCOutlook.css` count = 0 (no CSS file introduced — D-08 from Phase 11 preserved) ✓
- Helper-block ordering in `getDom()`: `dowToText` → `cigLabel` → `fireRiskToColor` → `PROX_MIN_WEIGHT` → `cigLabelFromTierString` → `proximityBadge` (declaration sequence ensures `proximityBadge` can reference both `PROX_MIN_WEIGHT` and `cigLabelFromTierString`) ✓
- File line count: 148 → 168 (+20 lines, within plan estimate ~12–15 — extended slightly by formatting; well below the 170 watermark) ✓
- No `<span style=...>` wrapping inside `proximityBadge` body (D-14 — color inheritance from surrounding span) ✓

## Backward Compatibility Confirmed

- `cigLabel(integer)` arrow at lines 41–46 is byte-identical to pre-plan state.
- The 7 existing call sites that consume `cigLabel(integer)` (Day 1 tor/hail/wind at lines 95–97, Day 2 tor/hail/wind at lines 106–108, Day 3 cig at line 113) are unmodified and continue to receive the trailing-space form (`"③ "`/`"② "`/`"① "`).
- No other render paths in `getDom()` were touched.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | `7e99dda` | `feat(13-01): add PROX_MIN_WEIGHT constant and cigLabelFromTierString helper` |
| 2 | `954af71` | `feat(13-01): add proximityBadge(prox, mode) helper for inside/outside tier formatting` |

## Next

Plan 13-02 (Day 1/2 categorical + per-hazard CIG wiring) and Plan 13-03 (Day 3 dual-badge + umbrella check + row gate relaxation) consume these helpers. They will:

- Increase `grep -c "PROX_MIN_WEIGHT"` from 2 → still 2 (callers don't reference the constant directly; they use `proximityBadge` which references it).
- Increase `grep -c "proximityBadge"` from 1 → 1 + N (where N is the number of call sites added).
- Possibly increase `grep -c "cigLabelFromTierString"` if a Day 3 site needs a glyph outside the `proximityBadge` path (unlikely — current design routes all CIG rendering through the badge helper).
- Extend the umbrella "No Severe Weather Risk" check at lines 53–67 with `&& !day1.proximity && !day2.proximity && !day3.proximity` (D-06).
- Relax row gates at lines 90, 101, 111 to `|| dayN.proximity?.categorical` (D-05; Day 3 also `|| dayN.proximity?.cig`).

## Self-Check: PASSED

**Created files verified:**
- `.planning/phases/13-proximity-frontend-render/13-01-SUMMARY.md` — this file (verified after write).

**Commits verified (`git log --oneline | grep`):**
- `7e99dda` — found ✓
- `954af71` — found ✓

**Files modified verified:**
- `MMM-SPCOutlook.js` — 168 lines (was 148; +20 lines confirmed via `wc -l`) ✓
