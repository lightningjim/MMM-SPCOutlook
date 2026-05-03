---
phase: 13-proximity-frontend-render
plan: 02
subsystem: frontend-render
tags: [proximity, frontend, render, day1, day2, categorical, cig, umbrella]
requires:
  - "Plan 13-01 helpers: PROX_MIN_WEIGHT, cigLabelFromTierString, proximityBadge"
provides:
  - "Umbrella `No Severe Weather Risk` extension — 3 new !dayN.proximity conjuncts (D-06)"
  - "Day 1 row gate relaxation — || day1.proximity?.categorical (D-05)"
  - "Day 1 categorical inline proximity badge (D-02/D-03)"
  - "Day 1 per-hazard CIG proximity badges on tor/hail/wind rows (D-09)"
  - "Day 2 row gate relaxation — || day2.proximity?.categorical (D-05)"
  - "Day 2 categorical inline proximity badge (mirror of Day 1)"
  - "Day 2 per-hazard CIG proximity badges (mirror of Day 1)"
affects:
  - "Plan 13-03 will mirror these changes for Day 3 (single-row dual-badge per D-10) and run final phase verification"
tech-stack:
  added: []
  patterns:
    - "Optional-chaining for optional payload fields (proximity?.categorical, proximity?.<hazard>Cig)"
    - "String concatenation only — no template literals introduced"
    - "Loose equality (`==`/`!=`) preserved for risk-string compares"
    - "Inline `style=...` only — no CSS file, no getStyles() extension (D-08)"
    - "Inside-tier vs. outside-tier mode selection at call site, single proximityBadge helper consumes"
key-files:
  created:
    - ".planning/phases/13-proximity-frontend-render/13-02-SUMMARY.md"
  modified:
    - "MMM-SPCOutlook.js (168 → 171 lines, +3 net)"
decisions:
  - "Format chosen: dropped explicit `+ \" \"` before percent on per-hazard rows to preserve byte-identical default-off DOM. Trade-off accepted per plan step 6 final recommendation."
  - "Mode selector for categorical: `(dayN.risk == \"NONE\") ? \"outside\" : \"inside\"` — uses loose equality to match file convention."
  - "Mode selector for per-hazard CIG: `(dayN.<hazard>Cig === 0) ? \"outside\" : \"inside\"` — uses strict equality (integer compare, not risk-string)."
  - "Umbrella conjuncts placed between `day3.risk == \"NONE\"` and `!( extended && day48Risk )` per plan step 2 — groups convective concerns together."
metrics:
  duration: "~3min"
  tasks: 3
  files_modified: 1
  completed: "2026-05-02T00:00:00Z"
---

# Phase 13 Plan 02: Day 1/2 Wiring + Umbrella Extension Summary

**One-liner:** Wired the Plan 01 `proximityBadge` helper into Day 1 and Day 2 categorical and per-hazard (tor/hail/wind) CIG render sites in `getDom()`, relaxed both row gates with `|| dayN.proximity?.categorical`, and extended the `No Severe Weather Risk` umbrella check with three `!dayN.proximity` conjuncts (Day 1/2/3) to keep outside-but-near users on the data-bearing render path. Eight new `proximityBadge` call sites in total; Day 3 reserved for Plan 03.

## What Was Built

### Task 1 — Umbrella check extension (D-06)

Three new `&&` conjuncts inserted between `day3.risk == "NONE"` and `!( this.config.extended && this.spcrisk.day48Risk )`:

```js
} else if (
  this.spcrisk.day1.risk == "NONE" &&
  this.spcrisk.day2.risk == "NONE" &&
  this.spcrisk.day3.risk == "NONE" &&
  !this.spcrisk.day1.proximity &&
  !this.spcrisk.day2.proximity &&
  !this.spcrisk.day3.proximity &&
  !( this.config.extended && this.spcrisk.day48Risk ) &&
  /* ... fire-weather conjuncts unchanged ... */
) {
  wrapper.innerHTML = "No Severe Weather Risk"
}
```

**Lines (post-edit):** 73–87 (umbrella `else if` block).

**Why no `?.` chaining on `dayN`:** Phase 12 backend always populates `day1`/`day2`/`day3` on `this.spcrisk` (per the return-object spreads in `node_helper.js`). Only `proximity` is the optional sibling. `!day1.proximity` evaluates `true` for `undefined` (default-off OR no-resolution) and `false` for the populated object — covers every contract case.

**Default-off invariant:** With `proximityWeighting: false`, no day carries a `proximity` field, all three conjuncts evaluate `true`, and the umbrella message fires exactly as before.

**Commit:** `db634a1` — `feat(13-02): extend umbrella check with proximity-subtree absence conjuncts (D-06)`

### Task 2 — Day 1 wiring (PROXUI-02, PROXUI-03 partial, PROXUI-04 partial)

#### Day 1 row gate (line 110 post-edit)

```js
if(this.spcrisk.day1.risk != "NONE" || this.spcrisk.day1.proximity?.categorical)
```

#### Day 1 categorical badge (line 112 post-edit)

```js
wrapper.innerHTML += dowToText(dow) + " (Day 1): <span style=\"color:#" + this.spcrisk.day1.color + "\">" + this.spcrisk.day1.text + "</span>" + proximityBadge(this.spcrisk.day1.proximity?.categorical, this.spcrisk.day1.risk == "NONE" ? "outside" : "inside") + "<br/>";
```

#### Day 1 per-hazard CIG badges (lines 115–117 post-edit)

```js
if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day1.torCig) + proximityBadge(this.spcrisk.day1.proximity?.torCig, this.spcrisk.day1.torCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day1.torRisk + "% ";
if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day1.hailCig) + proximityBadge(this.spcrisk.day1.proximity?.hailCig, this.spcrisk.day1.hailCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day1.hailRisk + "% ";
if (this.spcrisk.day1.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day1.windCig) + proximityBadge(this.spcrisk.day1.proximity?.windCig, this.spcrisk.day1.windCig === 0 ? "outside" : "inside") + 100 * this.spcrisk.day1.windRisk + "% ";
```

**D-07 suppression:** Each per-hazard CIG badge sits inside the existing `if (dayN.<hazard>Risk > 0)` arm — when the underlying probability row is suppressed, the badge is too. No extra gate needed.

**Commit:** `7121372` — `feat(13-02): wire Day 1 proximity badges (categorical + per-hazard CIG)`

### Task 3 — Day 2 wiring (mirror of Day 1)

#### Day 2 row gate (line 121 post-edit)

```js
if(this.spcrisk.day2.risk != "NONE" || this.spcrisk.day2.proximity?.categorical)
```

#### Day 2 categorical badge (line 123 post-edit, double-space `+=  ` preserved)

```js
wrapper.innerHTML +=  dowToText(dow+1) + " (Day 2): <span style=\"color:#" + this.spcrisk.day2.color + "\">" + this.spcrisk.day2.text + "</span>" + proximityBadge(this.spcrisk.day2.proximity?.categorical, this.spcrisk.day2.risk == "NONE" ? "outside" : "inside") + "<br/>";
```

#### Day 2 per-hazard CIG badges (lines 126–128 post-edit)

Identical pattern to Day 1, with `day1 → day2` substitution. Pre-existing `dow → dow+1` offset (already in line 123) untouched.

**Commit:** `8c0a3e6` — `feat(13-02): wire Day 2 proximity badges (mirror of Day 1)`

## Modified Line Ranges

| Concern                                       | Lines (post-edit) |
| --------------------------------------------- | ----------------- |
| Umbrella `No Severe Weather Risk` check       | 73–87 (3 new lines inserted) |
| Day 1 row gate (`if(...)`)                    | 110               |
| Day 1 categorical badge concat                | 112               |
| Day 1 tor/hail/wind hazard rows (CIG badges)  | 115, 116, 117     |
| Day 2 row gate (`if(...)`)                    | 121               |
| Day 2 categorical badge concat                | 123 (preserves existing `+=  ` double-space) |
| Day 2 tor/hail/wind hazard rows (CIG badges)  | 126, 127, 128     |
| **Day 3 untouched (Plan 03 territory)**       | 131–135 (read-only this plan) |

## Decisions Made

1. **Per-hazard format: drop explicit `+ " "` before percent (plan step 6 final recommendation).** This preserves byte-identical default-off behavior because when both `cigLabel` and `proximityBadge` return `""`, the row degenerates to its pre-Phase-13 form (`<i...></i>5% `). Trade-off: when both CIG and inside-tier prox are present, the rendered output has a double-space artifact between the CIG glyph and the proximity arrow (e.g., `②  → ③ 0.7`), and there is no space before the percent. Plan accepts these visual artifacts and defers re-tuning to UAT/v1.3 per CONTEXT.md `<deferred>` "Visual treatment alternatives".

2. **Mode selector for categorical uses loose `==`.** Matches file convention for risk-string compares (file uses `==`/`!=` everywhere for `dayN.risk` comparisons).

3. **Mode selector for per-hazard CIG uses strict `===`.** Compares an integer field (`dayN.<hazard>Cig`) — strict equality is the JS convention for non-string compares and matches the existing `cigLabel(integer)` arm at lines 41–46.

4. **Umbrella conjuncts grouped between convective NONE checks and extended-day check.** Plan recommended this ordering for readability; followed verbatim.

5. **No `?.` chaining on `dayN` itself in the umbrella check.** Day 1/2/3 are always present per Phase 12 contract (verified in 12-03-SUMMARY). Optional-chaining reserved for `proximity` only, but here we use leading `!` instead — cheaper, idiomatic, matches PATTERNS.md Site 2.

## Deviations from Plan

None — plan executed exactly as written. All three tasks followed the recommended Option B path (final-step format choice for per-hazard rows that drops explicit `+ " "`).

## Verification

### Automated (`grep` + `node --check`)

- `node --check MMM-SPCOutlook.js` → exits 0 ✓
- `grep -c "proximityBadge(" MMM-SPCOutlook.js` → **8** (4 Day 1 + 4 Day 2) ✓
- `grep -Ec "!this\.spcrisk\.day[123]\.proximity" MMM-SPCOutlook.js` → **3** ✓
- `grep -Ec "this\.spcrisk\.day[12]\.proximity\?\.categorical" MMM-SPCOutlook.js` → **4** (2 gate uses + 2 badge uses) ✓
- `grep -Ec "this\.spcrisk\.day[12]\.proximity\?\.(tor|hail|wind)Cig" MMM-SPCOutlook.js` → **6** (3 hazards × 2 days) ✓
- `grep -c "proximityBadge(this.spcrisk.day3" MMM-SPCOutlook.js` → **0** ✓ (Day 3 untouched)
- `grep -Ec "cigLabel\(this\.spcrisk\.day[12]" MMM-SPCOutlook.js` → **6** ✓ (existing callers preserved)
- `grep -F 'wrapper.innerHTML = "No Severe Weather Risk"' MMM-SPCOutlook.js` → matches (umbrella body unchanged) ✓
- `grep -F 'this.spcrisk.fireWeather.day1Risk > 0 || this.spcrisk.fireWeather.day2Risk > 0' MMM-SPCOutlook.js` → matches (fire-weather conjunct preserved byte-identical) ✓
- `grep -F '+=  dowToText(dow+1)' MMM-SPCOutlook.js` → matches (Day 2 line double-space preserved) ✓
- `grep -F 'MMM-SPCOutlook.css' MMM-SPCOutlook.js` → no match ✓ (no CSS file introduced)
- `grep -nE 'getStyles' MMM-SPCOutlook.js | wc -l` → **1** ✓ (existing `getStyles` only)
- `grep -c '`' MMM-SPCOutlook.js` → **1** ✓ (only the existing `start` log line at line 12)

### Source structural integrity

- File line count: **171** (was 168 pre-Plan-02; +3 net — three new umbrella conjunct lines; Day 1/2 edits are net-0 because they replace 5 lines with 5 lines per task) ✓
- Umbrella placement check (`day3.risk == "NONE"` < `!day3.proximity` < `extended && day48Risk`): **OK** (awk-validated) ✓
- D-07 nesting: `proximityBadge(day1.proximity?.torCig...)` line ALSO contains `if (this.spcrisk.day1.torRisk > 0)`: **OK** ✓
- D-07 nesting Day 2: same — **OK** ✓
- No new `?.` introduced on `day[123]` (excluding `proximity?.`): **0 leakage** ✓

### Default-off byte-identity check (manual reasoning)

With `proximityWeighting: false` (the shipped default):
- Backend Phase 12 emits `dayN` objects WITHOUT a `proximity` key.
- **Umbrella check:** Each new `!dayN.proximity` evaluates to `!undefined === true` → conjunct contributes nothing → umbrella fires exactly when it did pre-Phase-13.
- **Day 1/2 row gates:** `dayN.proximity?.categorical` evaluates to `undefined`, `||` short-circuits → gate behaves identically to historical `dayN.risk != "NONE"`.
- **Day 1/2 categorical inline badge:** `proximityBadge(undefined, ...)` returns `""` (Plan 01 helper guard `if (!prox) return ""`) → concat is no-op → DOM byte-identical.
- **Day 1/2 per-hazard CIG badges:** `dayN.proximity?.<hazard>Cig` is `undefined`, `proximityBadge(undefined, ...)` returns `""` → concat is no-op. Format string with the badge omitted: `cigLabel(N) + "" + percent + "% "` matches pre-Phase-13 byte-for-byte.

**Conclusion:** Default-off DOM is byte-identical to pre-Phase-13. Documented for UAT verification in Plan 03.

### On-mode synthetic check (manual reasoning)

For `proximityWeighting: true` and a synthetic payload `day1.proximity = { categorical: { value: 2.7, nextTier: "ENH" } }` with `day1.risk = "SLGT"`:
- Row gate: `"SLGT" != "NONE"` → `true`, gate passes.
- Categorical badge: `proximityBadge({value:2.7,nextTier:"ENH"}, "inside")` → `" → ENH 0.7"`.
- Rendered DOM segment: `Mon (Day 1): <span style="color:#f7f690">Slight Risk</span> → ENH 0.7<br/>` ✓ (matches CONTEXT.md `<specifics>` and PROJECT.md UX target).

For outside-tier with `day1.risk = "NONE"`, `day1.color = "afddf6"`, `day1.text = "None"`, `proximity.categorical = { value: 0.6, nextTier: "SLGT" }`:
- Row gate: `"NONE" != "NONE" || {...}` → `true` (proximity disjunct), gate passes.
- Categorical badge: `proximityBadge({value:0.6,nextTier:"SLGT"}, "outside")` → `" 0.6 (near SLGT)"`.
- Rendered DOM segment: `Mon (Day 1): <span style="color:#afddf6">None</span> 0.6 (near SLGT)<br/>` ✓ (matches CONTEXT.md `<specifics>` D-03).

For per-hazard inside-tier with `day1.torRisk = 0.05`, `day1.torCig = 2`, `day1.proximity.torCig = { value: 1.7, nextTier: "CIG3" }`:
- Hazard arm enters: `0.05 > 0`.
- Concat: `<i class="wi wi-tornado"></i>` + `cigLabel(2)` (`"② "`) + `proximityBadge({value:1.7,nextTier:"CIG3"}, "inside")` (`" → ③ 0.7"`) + `5` + `"% "`.
- Result: `<i class="wi wi-tornado"></i>②  → ③ 0.75% ` — note the documented double-space artifact (`②` trailing space + `→` leading space) and missing space before `5%`. Plan accepts.

### Visual artifacts (documented per plan output spec)

The chosen call-site format produces two readability quirks when both CIG and proximity render:

1. **Double-space `②  →`** between the existing CIG glyph (which carries a trailing space from `cigLabel`) and the proximity arrow (which carries a leading space from `proximityBadge`).
2. **Missing space `0.75%`** between the proximity weight and the percent number, because the per-hazard format dropped the explicit `+ " "` to preserve default-off byte-identity.

Both are accepted per CONTEXT.md `<deferred>` "Visual treatment alternatives — revisit if real display testing shows readability issues" and per the plan's chosen-format trade-off rationale (step 6 final recommendation). UAT in Plan 03 will confirm whether these warrant a follow-up plan.

## Backward Compatibility Confirmed

- Existing `cigLabel(this.spcrisk.day[12]...)` callers: **6** preserved (3 Day 1 + 3 Day 2) ✓
- Pre-Phase-13 row-gate `if(this.spcrisk.day3.risk != "NONE")` Day 3 unchanged ✓
- Phase 11 stale-indicator block (lines 92–104 post-edit) unchanged ✓
- Phase 11 MD render block (lines 105–109 post-edit) unchanged ✓
- Day 4–8 extended block unchanged ✓
- Fire-weather block (lines 144–164 post-edit) unchanged ✓
- `getStyles` (line 29) unchanged — no CSS file introduced ✓
- All `defaults` (lines 2–8) unchanged ✓
- No template literals introduced (only the existing `start` log line at line 12 has backticks) ✓

## Commits

| Task | Commit    | Description                                                                  |
| ---- | --------- | ---------------------------------------------------------------------------- |
| 1    | `db634a1` | `feat(13-02): extend umbrella check with proximity-subtree absence conjuncts (D-06)` |
| 2    | `7121372` | `feat(13-02): wire Day 1 proximity badges (categorical + per-hazard CIG)`     |
| 3    | `8c0a3e6` | `feat(13-02): wire Day 2 proximity badges (mirror of Day 1)`                  |

## Threat Surface Scan

No new security-relevant surface introduced. All proximity rendering is routed through the Plan 01 `proximityBadge` helper, which carries the centralized type-guards (T-13-01/T-13-02 mitigations from the phase threat model). The `nextTier` enum values (`TSTM/MRGL/SLGT/ENH/MDT/HIGH/CIG1/CIG2/CIG3`) come from closed enums in `node_helper.js` lines 16 and 432 — not user input. Same-process IPC payload, no network exposure.

No threat flags raised.

## Next

Plan 13-03 (Day 3 dual-badge + final phase verification) consumes the same helpers:

- Will relax Day 3 row gate at line 131 to `|| dayN.proximity?.categorical || dayN.proximity?.cig` (D-05 + D-10).
- Will render dual badges inline-with-semicolon-separator inside the colored span per D-10.
- Will run the final phase-level verification including PROXUI-01 confirmation (no code change — config flag plumbing already shipped in Phase 12).

Plan 13-02 leaves the workspace in a consistent state: all Day 1/2 wiring is byte-correct, default-off preserved, on-mode renders the documented format, and Day 3 is unmodified for Plan 03 to take over cleanly.

## Self-Check: PASSED

**Created files verified:**
- `.planning/phases/13-proximity-frontend-render/13-02-SUMMARY.md` — this file (verified after write).

**Commits verified (`git log --oneline | grep`):**
- `db634a1` — found ✓ (`feat(13-02): extend umbrella check ...`)
- `7121372` — found ✓ (`feat(13-02): wire Day 1 proximity badges ...`)
- `8c0a3e6` — found ✓ (`feat(13-02): wire Day 2 proximity badges ...`)

**Modified file verified:**
- `MMM-SPCOutlook.js` — 171 lines, `node --check` passes, all phase-level grep counts match plan success criteria ✓
