# Phase 1: Bug Fixes - Research

**Researched:** 2026-03-04
**Domain:** JavaScript bug fixing in MagicMirror node_helper.js — arrow function syntax, variable assignment, and polygon iteration logic
**Confidence:** HIGH

## Summary

Phase 1 fixes four discrete bugs in `node_helper.js` that cause silent data failures. All four bugs were directly verified in the source code and precisely match the descriptions in CONCERNS.md. No external library research is needed — the fixes are pure JavaScript logic corrections within the existing codebase.

The bugs fall into two categories: (1) logic errors in data processing (wrong variable referenced, repeated variable name instead of iterating different variables, return-on-first-match instead of collect-all), and (2) a JavaScript syntax error in arrow function callbacks that causes SIGN detection to silently fail. None of the fixes require adding new dependencies, changing architecture, or modifying the frontend.

**Primary recommendation:** Fix all four bugs in `node_helper.js` with minimal, targeted edits. Touch only the specific lines identified. Do not refactor or reorganize code in this phase — that is Phase 5's scope.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| BUG-01 | SIGN detection works correctly for Tornado/Hail/Wind on Days 1-2 (fix double-arrow syntax error) | Arrow function syntax confirmed broken at lines 272, 283, 294, 317, 327, 329, 339, 361, 408, 419, 430, 441, 452 — `label => label => label` must be `label => label` |
| BUG-02 | Day 8 displays Day 8 risk (not Day 7) when extended mode is enabled | Lines 521-527 confirmed: all five fields (risk, probRisk, sign, color) reference `day7` variables; text references `day8Risk` — all must reference `day8` equivalents |
| BUG-03 | Day 4-8 aggregate risk (day48Risk) correctly reflects any risk across all five days | Line 458 confirmed: checks `day4ProbRisk` five times instead of checking days 4-8; assigns `day4ProbRisk = true` instead of `day48Risk = true` |
| BUG-04 | Mesoscale Discussion detection collects all overlapping active MDs, not just the first | Lines 543-549 in `checkInPolygon()` confirmed: `return` inside for-loop exits on the first feature match — must collect all matches, not return early |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node_helper.js | (existing) | Backend processing module | Already integrated — no new libraries needed for these fixes |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| None needed | — | — | All fixes are JavaScript logic corrections |

### Alternatives Considered
None — these are targeted bug fixes, not design decisions.

**Installation:** No new packages needed.

## Architecture Patterns

### Affected Code Locations

All four bugs are in `node_helper.js`. The frontend (`MMM-SPCOutlook.js`) is untouched by this phase.

```
node_helper.js
├── getSpcOutlook()       — BUG-01, BUG-02, BUG-03
│   ├── lines 271-295     — BUG-01: Day 1 Tor/Hail/Wind SIGN double-arrow
│   ├── lines 316-341     — BUG-01: Day 2 Tor/Hail/Wind SIGN double-arrow
│   ├── lines 361         — BUG-01: Day 3 SIGN double-arrow
│   ├── lines 407-452     — BUG-01: Day 4-8 SIGN double-arrow (×5)
│   ├── lines 457-458     — BUG-03: day48Risk logic error
│   └── lines 521-527     — BUG-02: Day 8 return object uses day7 variables
└── checkInPolygon()      — BUG-04
    └── lines 543-549     — returns on first match instead of collecting all
```

### Pattern 1: SIGN Arrow Function Fix (BUG-01)

**What:** The `toValue` callback passed to `extractPolygons()` for SIGN detection is written as `label => label => label` (a curried function that returns a function). The outer arrow function returns another arrow function, not the label string. When `evaluatePolygons` then calls `sigComparator.comparator(best, value)` where value is now a function, `val === "SIGN"` will always be `false`.

**Broken pattern (all 11+ call sites):**
```javascript
// Source: node_helper.js lines 272, 283, 294, 317, 327, 329, 339, 361, 408, 419, 430, 441, 452
this.extractPolygons(geojson, label => label => label, (label,val) => label === "SIGN");
//                            ^^^^^^^^^^^^^^^^^^^^
//                            This returns a FUNCTION, not the label string
```

**Correct pattern:**
```javascript
this.extractPolygons(geojson, label => label, (label,val) => label === "SIGN");
//                            ^^^^^^^^^^^^
//                            Identity function — returns the label string
```

**Occurrences to fix (all in node_helper.js):**
- Line 272: Day 1 Tor SIGN
- Line 283: Day 1 Hail SIGN
- Line 294: Day 1 Wind SIGN
- Line 317: Day 2 Tor SIGN
- Line 327: Day 2 Hail SIGN (note: line 329 also has a duplicate call — both must be fixed)
- Line 339: Day 2 Wind SIGN
- Line 361: Day 3 SIGN
- Line 408: Day 4 SIGN
- Line 419: Day 5 SIGN
- Line 430: Day 6 SIGN
- Line 441: Day 7 SIGN
- Line 452: Day 8 SIGN

### Pattern 2: Day 8 Return Object Fix (BUG-02)

**What:** The `day8` object in the return statement at the bottom of `getSpcOutlook()` (lines 521-527) uses `day7` variable references for `risk`, `probRisk`, `sign`, and `color`. Only the `text` field correctly uses `day8Risk`. The fix is to replace all four `day7` references with the corresponding `day8` variables.

**Broken code (lines 521-527):**
```javascript
// Source: node_helper.js lines 521-527
day8: {
  "risk": day7Risk,       // BUG: should be day8Risk
  "probRisk": day7ProbRisk, // BUG: should be day8ProbRisk
  "sign": day7Sign,       // BUG: should be day8Sign
  "color": riskToColor[day7Risk],  // BUG: should be riskToColor[day8Risk]
  "text": valueToFullRisk[day8Risk], // correct
}
```

**Correct code:**
```javascript
day8: {
  "risk": day8Risk,
  "probRisk": day8ProbRisk,
  "sign": day8Sign,
  "color": riskToColor[day8Risk],
  "text": valueToFullRisk[day8Risk],
}
```

### Pattern 3: day48Risk Logic Fix (BUG-03)

**What:** Line 458 has two separate logic errors. First, the condition checks `day4ProbRisk` five times instead of ORing all five days. Second, the assignment sets `day4ProbRisk = true` instead of `day48Risk = true`, meaning `day48Risk` is always left as `false` (set on line 457) and `day4ProbRisk` gets corrupted.

**Broken code (line 457-458):**
```javascript
// Source: node_helper.js lines 457-458
day48Risk = false;
if(day4ProbRisk > 0 || day4ProbRisk > 0 || day4ProbRisk > 0 || day4ProbRisk > 0 || day4ProbRisk > 0) day4ProbRisk = true;
//         ^^^^ repeated 5x, never checks days 5-8               ^^^^ wrong variable assigned
```

**Correct code:**
```javascript
day48Risk = false;
if(day4ProbRisk > 0 || day5ProbRisk > 0 || day6ProbRisk > 0 || day7ProbRisk > 0 || day8ProbRisk > 0) day48Risk = true;
```

### Pattern 4: checkInPolygon Collect-All Fix (BUG-04)

**What:** `checkInPolygon()` is called once per MD URL, passed a GeoJSON with one or more features, and returns `true` or `false`. The loop in `getMesoscaleDiscussion()` correctly pushes to `MDArray` when the result is truthy. The bug is inside `checkInPolygon()` itself: it issues a `return` statement immediately on the first polygon match (or first polygon non-match for Polygon types), rather than evaluating all features. This is not about collecting multiple MDs — the outer loop in `getMesoscaleDiscussion()` already handles that correctly — it is about correctly evaluating whether the user's location is inside *any* feature in a given MD's GeoJSON, rather than returning the result of only the first feature.

**Broken code (lines 536-552):**
```javascript
// Source: node_helper.js lines 536-552
checkInPolygon(geojson, lat, lon){
  const pt = turf.point([lon, lat]);
  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    const geomType = feature.geometry.type;
    if (geomType === "Polygon") {
      const poly = turf.polygon(feature.geometry.coordinates);
      return turf.booleanPointInPolygon(pt, poly);  // BUG: returns on first feature regardless of result
    }
    else if (geomType === "MultiPolygon") {
      const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
      return turf.booleanPointInPolygon(pt, multiPoly);  // BUG: same
    }
  }
}
```

**Correct pattern:** Only return `true` immediately when a match is found. Continue the loop when no match is found on a feature. Return `false` after exhausting all features.

```javascript
checkInPolygon(geojson, lat, lon){
  const pt = turf.point([lon, lat]);
  for (const feature of geojson.features) {
    if (!feature.geometry) continue;
    const geomType = feature.geometry.type;
    if (geomType === "Polygon") {
      const poly = turf.polygon(feature.geometry.coordinates);
      if (turf.booleanPointInPolygon(pt, poly)) return true;
    }
    else if (geomType === "MultiPolygon") {
      const multiPoly = turf.multiPolygon(feature.geometry.coordinates);
      if (turf.booleanPointInPolygon(pt, multiPoly)) return true;
    }
  }
  return false;
}
```

### Anti-Patterns to Avoid

- **Refactoring during bug fixes:** Phase 5 handles code quality. Do not extract SIGN detection into a shared function in this phase — that is QUAL-01. Touch only the specific broken lines.
- **Fixing non-phase bugs:** BUG-01 through BUG-04 only. Do not fix the `evaluatePolygonsWeighted` uninitialized `result` variable (it is unused) in this phase.
- **Adding `const`/`let` declarations:** QUAL-02 is Phase 5. In this phase, preserve existing variable declaration style to minimize diff.
- **Removing commented code:** QUAL-03 is Phase 5. Do not remove the commented block at lines 554-627.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Point-in-polygon test | Custom geometric math | `turf.booleanPointInPolygon()` (already used) | Already integrated; handles edge cases (antimeridian, ring winding) |

**Key insight:** These are pure JavaScript logic bugs with no library gaps. The fixes are one-line or few-line corrections.

## Common Pitfalls

### Pitfall 1: Missing the Duplicate Day 2 Hail SIGN Call
**What goes wrong:** Lines 327 and 329 both contain the double-arrow error for Day 2 Hail SIGN. Line 327 runs unconditionally (outside the `if(day2HailRisk > 0)` guard), and line 329 runs inside it. Both must be fixed.
**Why it happens:** Copy-paste error left an extra extractPolygons call outside the guard.
**How to avoid:** When fixing Day 2 Hail SIGN, fix both line 327 and 329. Both lines share the same double-arrow bug.
**Warning signs:** If only one line is fixed, Day 2 Hail SIGN may still fail for edge cases.

### Pitfall 2: Fixing day48Risk But Breaking day4ProbRisk
**What goes wrong:** Line 458's correct fix changes `day4ProbRisk = true` to `day48Risk = true`. The leftover `day4ProbRisk` was being corrupted. After the fix, `day4ProbRisk` retains its correct numeric value from `evaluatePolygons()`, which is used in the Day 4 return object. Do not introduce a `day4ProbRisk = true` elsewhere.
**Why it happens:** Developer may try to "preserve" the old assignment while adding the new one.
**How to avoid:** Replace the entire line; do not add to it.

### Pitfall 3: Confusing BUG-04 Scope
**What goes wrong:** Thinking BUG-04 means the outer `getMesoscaleDiscussion` loop needs changing. It does not. The outer loop correctly iterates all MD URLs and collects matches into `MDArray`. The bug is inside `checkInPolygon()` which evaluates a single MD's GeoJSON — it returns too early on the first feature.
**Why it happens:** The architecture documentation describes the fix as "collect all overlapping MDs" which sounds like it's about the outer loop.
**How to avoid:** Read `checkInPolygon()` at lines 536-552 directly. The fix is inside this single function.

### Pitfall 4: Day 8 text Field Already Correct
**What goes wrong:** Over-fixing. The `text` field in the Day 8 object (line 526) already correctly references `day8Risk`. Only `risk`, `probRisk`, `sign`, and `color` are broken.
**Why it happens:** Treating the whole block as uniformly wrong.
**How to avoid:** Fix only the four `day7` references, leave `text: valueToFullRisk[day8Risk]` untouched.

## Code Examples

### How extractPolygons Uses the toValue Callback

```javascript
// Source: node_helper.js lines 73-88
extractPolygons(geojson, toValue, includesFeat){
  const polygons = [];
  geojson.features.forEach(f => {
    const label = f.properties.LABEL || "";
    const value = toValue(label);         // toValue is called with the label string
    if (!includesFeat(label, value)) return;
    // ... build poly ...
    polygons.push({ label, value, poly });
  });
  return polygons;
}
```

The `toValue` callback receives a string (the LABEL property) and must return a comparable value. With the double-arrow bug, `toValue("SIGN")` returns a function — not `"SIGN"`. The `sigComparator` then gets `val` as a function, so `val === "SIGN"` is always `false`.

### How sigComparator Evaluates Values

```javascript
// Source: node_helper.js lines 209-212
const sigComparator = {
  initial: false,
  comparator: (_, val) => val === "SIGN" || Boolean(val)
};
```

With the corrected `label => label` toValue, `val` will be `"SIGN"` for SIGN features and `""` for others. `"SIGN" === "SIGN"` is `true`. `Boolean("")` is `false`. This works correctly once the arrow fix is applied.

### How getMesoscaleDiscussion Uses checkInPolygon

```javascript
// Source: node_helper.js lines 164-174
for(const MDURL of MDURLs){
  const MDKMZ = await this.fetchBinBuffer(MDURL);
  const MDKML = this.extractKmlFromKmz(MDKMZ, this.kmzToKmlfilename(MDURL));
  const MDgj = this.kmlToGeoJson(MDKML);
  const MDApplies = this.checkInPolygon(MDgj, lat, lon);
  if(MDApplies) MDArray.push(MDgj.features[0].properties.name);
}
```

The outer loop handles collecting all matching MDs. `checkInPolygon()` just needs to correctly answer "is the user's location inside any polygon in this GeoJSON?" The fix to `checkInPolygon()` makes it correctly evaluate all features before returning false.

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Return on first polygon match | Check all polygons, return true only on match | This fix (Phase 1) | checkInPolygon correctly handles multi-feature GeoJSON |
| Double-arrow curried toValue | Identity arrow toValue | This fix (Phase 1) | SIGN indicators appear when SPC issues significant risk |
| day48Risk always false | Correctly ORs days 4-8 | This fix (Phase 1) | Extended forecast aggregate indicator works |
| Day 8 shows Day 7 data | Day 8 return object uses day8 variables | This fix (Phase 1) | Correct risk shown for Day 8 |

## Open Questions

1. **Day 2 Hail SIGN orphaned call at line 327**
   - What we know: Line 327 runs `extractPolygons` with the SIGN double-arrow bug unconditionally, before the `if(day2HailRisk > 0)` guard at line 328. Its result is assigned back to `day2HailRiskPoly` but immediately overwritten at line 329.
   - What's unclear: The orphaned call at 327 appears to be dead code (result immediately overwritten). It is safe to remove it entirely when fixing line 327, or it can simply be corrected in place. Either approach is valid.
   - Recommendation: Fix in place (correct the arrow syntax) rather than remove it — removing is a cleanup concern for Phase 5.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | None — no test infrastructure exists (see REQUIREMENTS.md: "Automated testing framework — not added in this pass") |
| Config file | none |
| Quick run command | manual inspection |
| Full suite command | manual inspection |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| BUG-01 | SIGN indicator appears when SPC issues significant risk for Tor/Hail/Wind Days 1-2 | manual-only | N/A | N/A |
| BUG-02 | Day 8 shows Day 8 risk value when extended=true | manual-only | N/A | N/A |
| BUG-03 | day48Risk is true when any day 4-8 has risk > 0 | manual-only | N/A | N/A |
| BUG-04 | Multiple overlapping MDs all appear on display | manual-only | N/A | N/A |

**Manual-only justification:** The project explicitly excludes automated testing from v1 scope (REQUIREMENTS.md). The module depends on live NOAA GeoJSON endpoints and MagicMirror runtime — no test harness exists and none is added in this phase. Verification is done via code review of the specific line changes (all bugs are single-line logic errors that are verifiable by reading the corrected code).

### Sampling Rate
- **Per task commit:** Code review of changed lines against the correct patterns documented above
- **Per wave merge:** Code review of all four fixes together
- **Phase gate:** All four line-level fixes verified correct before `/gsd:verify-work`

### Wave 0 Gaps
None — no test infrastructure is expected or required for this phase.

## Sources

### Primary (HIGH confidence)
- `node_helper.js` (direct source inspection) — all four bugs confirmed at specific line numbers
- `.planning/codebase/CONCERNS.md` — bug descriptions and line numbers cross-referenced and verified against source
- `.planning/codebase/ARCHITECTURE.md` — confirmed checkInPolygon usage pattern and data flow
- `.planning/REQUIREMENTS.md` — requirement IDs and scope confirmed
- `.planning/config.json` — nyquist_validation: true confirmed

### Secondary (MEDIUM confidence)
- `.planning/codebase/CONVENTIONS.md` — coding style guidance for minimal-touch approach

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Bug identification: HIGH — all four bugs directly verified in source code at specific line numbers
- Fix patterns: HIGH — fixes are standard JavaScript corrections with no ambiguity
- Scope boundaries: HIGH — CONCERNS.md, REQUIREMENTS.md, and ARCHITECTURE.md consistently confirm what is and is not in scope
- Pitfalls: HIGH — derived directly from reading the actual broken code

**Research date:** 2026-03-04
**Valid until:** Stable indefinitely — these are static source file bugs, not API or library concerns
