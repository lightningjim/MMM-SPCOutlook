---
phase: 02-cig-tier-support
verified: 2026-03-11T21:03:30Z
status: passed
score: 5/5 must-haves verified
re_verification: false
---

# Phase 2: CIG Tier Support Verification Report

**Phase Goal:** The module understands and displays the SPC's tiered SIGN severity levels (CIG1, CIG2, CIG3) as distinct risk indicators
**Verified:** 2026-03-11T21:03:30Z
**Status:** PASSED
**Re-verification:** No — initial verification (delayed; authored in Phase 6)

---

## Goal Achievement

### Observable Truths (from ROADMAP.md Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | Backend correctly parses CIG1, CIG2, and CIG3 as distinct severity tiers from SPC GeoJSON | VERIFIED | node_helper.js:396 — `cigToTier = { CIG1: 1, CIG2: 2, CIG3: 3 }`; node_helper.js:397-400 — `cigComparator` uses `Math.max(best, val)` to select highest tier across all matching polygons |
| 2 | The display renders each CIG tier visually distinct (not identical icons/colors) | VERIFIED | MMM-SPCOutlook.js:40-45 — `cigLabel()` returns `"③ "` for tier 3, `"② "` for tier 2, `"① "` for tier 1, and `""` for tier 0 (no SIGN) |
| 3 | CIG tiers behave correctly on both Days 1 and 2 convective outlooks | VERIFIED | node_helper.js:470-481 (Day 1) and 509-521 (Day 2) — 6 `fetchAndEvaluateHazard` call sites (3×Day1: tor/hail/wind, 3×Day2: tor/hail/wind) each pass a dedicated CIG URL and `cigComparator` |

### Required Artifacts

| Artifact | File | Lines | Evidence of Presence |
|----------|------|-------|----------------------|
| `cigToTier` mapping | node_helper.js | 396 | `const cigToTier = { CIG1: 1, CIG2: 2, CIG3: 3 };` |
| `cigComparator` object | node_helper.js | 397-400 | `{ initial: 0, comparator: (best, val) => Math.max(best, val) }` |
| `cigLabel()` display helper | MMM-SPCOutlook.js | 40-45 | Arrow function returning ③/②/① for tiers 3/2/1, `""` for tier 0 |
| Integer CIG return fields (non-extended) | node_helper.js | 648, 650, 652, 671 | `torCig`, `hailCig`, `windCig` in day1 object; `cig` in day3 object |
| Integer CIG return fields (extended) | node_helper.js | 804, 806, 808 | `torCig`, `hailCig`, `windCig` in day1 object of extended return path |

### Key Link Verification

| From | Via | To | Evidence |
|------|-----|----|----------|
| CIG URL endpoints (cigtorn/cighail/cigwind) | `fetchAndEvaluateHazard` parameter `cigUrl` | Per-hazard CIG tier value | node_helper.js:311 — function signature `async fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator, cigToTier)` |
| Day 1 tor call site | destructuring `{ risk, cig }` | `day1TorCig` integer | node_helper.js:470-471 — `const { risk: day1TorRisk, cig: day1TorCig, stale: s1Tor } = await this.fetchAndEvaluateHazard(day1TorURL, day1CigTorURL, ...)` |
| Day 1 hail call site | destructuring `{ risk, cig }` | `day1HailCig` integer | node_helper.js:475-476 — `const { risk: day1HailRisk, cig: day1HailCig, stale: s1Hail } = await this.fetchAndEvaluateHazard(day1HailURL, day1CigHailURL, ...)` |
| Day 1 wind call site | destructuring `{ risk, cig }` | `day1WindCig` integer | node_helper.js:480-481 — `const { risk: day1WindRisk, cig: day1WindCig, stale: s1Wind } = await this.fetchAndEvaluateHazard(day1WindURL, day1CigWindURL, ...)` |
| Day 2 tor call site | destructuring `{ risk, cig }` | `day2TorCig` integer | node_helper.js:509-510 — `const { risk: day2TorRisk, cig: day2TorCig, stale: s2Tor } = await this.fetchAndEvaluateHazard(day2TorURL, day2CigTorURL, ...)` |
| Day 2 hail call site | destructuring `{ risk, cig }` | `day2HailCig` integer | node_helper.js:514-515 — `const { risk: day2HailRisk, cig: day2HailCig, stale: s2Hail } = await this.fetchAndEvaluateHazard(day2HailURL, day2CigHailURL, ...)` |
| Day 2 wind call site | destructuring `{ risk, cig }` | `day2WindCig` integer | node_helper.js:519-520 — `const { risk: day2WindRisk, cig: day2WindCig, stale: s2Wind } = await this.fetchAndEvaluateHazard(day2WindURL, day2CigWindURL, ...)` |
| Day 3 CIG fetch | `fetchGeoJsonCached(day3CigUrl)` → `cigToTier` | `day3Cig` integer | node_helper.js:562-572 — `let day3Cig = 0; ... cigPolys = extractPolygons(... cigToTier[label] || 0 ...); day3Cig = evaluatePolygons(cigPolys, loc, cigComparator)` |
| `fetchAndEvaluateHazard` return | `return { risk, cig, stale }` | destructured at all 6 call sites | node_helper.js:359 — explicit return object with integer `cig` field |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| SPC-01 | 02-01-PLAN | SIGN risk supports CIG1/CIG2/CIG3 tiered severity levels | SATISFIED | node_helper.js:396 (`cigToTier`), :397-400 (`cigComparator`), :311 (`fetchAndEvaluateHazard` signature), :359 (`return { risk, cig, stale }`); integer cig values stored in return objects at :648/:650/:652/:671 (non-extended) and :804/:806/:808 (extended) |
| SPC-02 | 02-02-PLAN | Module display renders CIG1/CIG2/CIG3 SIGN tiers visually distinct | SATISFIED | MMM-SPCOutlook.js:40-45 (`cigLabel()` helper); 7 call sites: :73 (Day1 tor), :74 (Day1 hail), :75 (Day1 wind — fixed in Phase 6 plan 01), :84 (Day2 tor), :85 (Day2 hail), :86 (Day2 wind — fixed in Phase 6 plan 01), :91 (Day3 trailing `cigLabel(this.spcrisk.day3.cig)`). Wind lines corrected: icon now leads per tor/hail structural pattern. |

---

## Phase 3–5 Regression Check

| Phase | Touch Point | What Changed | Current Evidence | Status |
|-------|-------------|--------------|------------------|--------|
| Phase 5 (QUAL-01) | `fetchAndEvaluateHazard()` | Extracted Days 1-2 per-hazard fetch+evaluate into shared function; CIG URL and `cigComparator` now passed as parameters | node_helper.js:311 — function signature `async fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator, cigToTier)`; :359 — `return { risk, cig, stale }` | INTACT |
| Phase 5 (QUAL-01) | Day 1-2 call sites | 6 call sites each destructure `{ risk, cig }` from `fetchAndEvaluateHazard` | node_helper.js:470-481 (Day 1 tor/hail/wind) and :509-520 (Day 2 tor/hail/wind) — all 6 call sites confirmed present; each destructures `cig` | INTACT |
| Phase 4 (PERF-01) | `fetchGeoJsonCached()` | CIG fetches now go through ETag/hash cache via `fetchAndEvaluateHazard` | node_helper.js:316 — `fetchAndEvaluateHazard` calls `this.fetchGeoJsonCached(url)`; :338 — CIG URL also goes through `this.fetchGeoJsonCached(cigUrl)` when `risk > 0` | INTACT |
| Phase 3 (FIRE-01/02/03) | Fire weather paths | Fire weather is a separate code path with no CIG interaction | `cigLabel`/`cigToTier` references do not appear in fireWeather sections (node_helper.js:576-635); fire weather uses its own `fireToTier` mapping | NO IMPACT |

Supporting reference: `.planning/v1.0-MILESTONE-AUDIT.md` cross-phase wiring table confirms no CIG defects in integration checker output.

---

## Wind CIG Label Fix Note

Before this verification could be certified, a cosmetic defect was found in `MMM-SPCOutlook.js` lines 75 and 86 (Day 1 and Day 2 wind). The wind lines had `cigLabel()` before the icon element and lacked a trailing space after `%`, inconsistent with the established tor/hail pattern. This was corrected in Phase 6 plan 01, Task 1 (commit c1efc7c). The evidence for SPC-02 above cites the corrected lines.

---

## Gaps Summary

No gaps. SPC-01 is formally closed: the backend CIG fetch pipeline (`cigToTier`, `cigComparator`, `fetchAndEvaluateHazard`, integer return fields) is fully wired and confirmed at exact file:line references. SPC-02 is formally closed: `cigLabel()` is defined at MMM-SPCOutlook.js:40-45 and called at all 7 expected sites with correct structural ordering after the wind label fix. Phase 3-5 changes did not break the CIG code path.
