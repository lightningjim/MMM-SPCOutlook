---
plan: "05-01"
phase: "05-code-quality"
status: complete
completed: 2026-03-08
commits:
  - hash: "0a5969b"
    message: "refactor(05-01): extract fetchAndEvaluateHazard and add JSDoc to node_helper.js"
---

# Plan 05-01: Refactor Duplicate Hazard Fetch Blocks

## What Was Built

Extracted six near-identical Day 1/Day 2 Tor/Hail/Wind fetch-and-evaluate blocks from `getSpcOutlook()` into a single shared `fetchAndEvaluateHazard()` method on NodeHelper. Added JSDoc to all 8 key functions.

## Key Changes

### node_helper.js
- Added `fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator, cigToTier)` method returning `{ risk, cig, stale }`
- Replaced 6 ~13-line duplicate blocks with 2-line destructured call sites
- Added JSDoc (`/**`) to 8 functions: `fetchAndEvaluateHazard`, `fetchGeoJsonCached`, `extractPolygons`, `evaluatePolygons`, `evaluatePolygonsWeighted`, `evaluatePolygonsContinuous`, `getSpcOutlook`, `getMesoscaleDiscussion`
- `anyStale` propagation preserved at each call site via `if (sNXxx) anyStale = true`

## Verification

- `grep -c "fetchAndEvaluateHazard" node_helper.js` → **7** (1 def + 6 calls) ✓
- `grep -c "/\*\*" node_helper.js` → **8** JSDoc blocks ✓
- No standalone `var` declarations for the 6 refactored pairs ✓

## Self-Check: PASSED

All must-haves from the plan satisfied. No behavior change — only structural refactoring.
