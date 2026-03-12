# Phase 5: Code Quality - Research

**Researched:** 2026-03-07
**Domain:** JavaScript code cleanup — DRY refactor, variable declarations, dead code removal, logging hygiene
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Comment Handling**
- Remove all commented-out code blocks — this includes disabled evaluator calls (`// var day1RiskCont = ...`), commented-out `//Log.info(...)` lines, and any other lines that are code-as-comment rather than prose
- Preserve explanatory prose comments that describe intent or non-obvious logic
- Where prose comments exist, consider upgrading them to JSDoc format (`/** */`) on public-facing and utility functions rather than inline `//` comments

**JSDoc Coverage**
- Add JSDoc to: `fetchGeoJsonCached`, `extractPolygons`, `evaluatePolygons`, `evaluatePolygonsWeighted`, `evaluatePolygonsContinuous`, `getSpcOutlook`, `getMesoscaleDiscussion`, and the new `fetchAndEvaluateHazard` shared function
- Depth: `@param` + `@returns` + one-line description — no verbose TypeScript-style `{type}` annotations
- `getSpcOutlook()` should include a `@returns` block documenting the shape of the result object (day1, day2, etc. with nested risk/color/cig fields) — this is the most complex return shape in the codebase

**DRY Refactor (QUAL-01)**
- Extract Day 1 and Day 2 Tor/Hail/Wind logic into a single shared function named `fetchAndEvaluateHazard`
- The function handles: fetch GeoJSON (via fetchGeoJsonCached), evaluate probability polygons, conditionally fetch and evaluate CIG tier (if prob > 0), update the cache entry, return a structured result object `{ risk, cig }`
- Call sites destructure: `const { risk: day1TorRisk, cig: day1TorCig } = await this.fetchAndEvaluateHazard(...)`
- Fire weather (fw1/fw2) duplication is out of scope — Day 1/Day 2 only per QUAL-01
- CIG fetching is inside `fetchAndEvaluateHazard`, not at the caller

**Error and Logging Standard (QUAL-04)**
- `console.error` in the getSpcOutlook top-level catch block → `Log.error`
- `console.log` in MMM-SPCOutlook.js (module start lat/lon/extended, SPC_DATA_RESULT receipt) → `Log.info`
- `console.log` in getMesoscaleDiscussion() MD trace → remove entirely (noisy in production, not needed)

### Claude's Discretion
- Exact signature of `fetchAndEvaluateHazard` (parameters for URL, cigURL, loc, cache, comparators)
- Order of const/let cleanup operations
- Specific wording of JSDoc descriptions

### Deferred Ideas (OUT OF SCOPE)
- Fire weather DRY refactor (fw1/fw2 WindRH + DryT) — discussed but deferred; out of QUAL-01 scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-01 | Repeated Day 1/Day 2 Tornado/Hail/Wind fetch-and-process logic extracted into shared reusable function | Full audit of the 6 duplicate blocks completed; signature design documented below |
| QUAL-02 | All variable declarations use `const` or `let`; no implicit globals or `var` | Full audit of every `var` and undeclared variable in both files documented below |
| QUAL-03 | Dead/commented-out code blocks removed from `node_helper.js` | Complete inventory of all commented-out lines documented below |
| QUAL-04 | Debug `console.log` calls removed from production code paths; errors use `Log.error` | All instances located and classified in both files |
</phase_requirements>

---

## Summary

Phase 5 is a pure cleanup pass over two files (`node_helper.js` and `MMM-SPCOutlook.js`) with no behavior changes. The work divides into four independent concerns: DRY-refactoring the six near-identical Day 1/Day 2 hazard evaluation blocks (QUAL-01), converting all `var` and undeclared variable assignments to `const`/`let` (QUAL-02), removing every commented-out code line (QUAL-03), and replacing `console.log`/`console.error` calls with the MagicMirror `Log` API (QUAL-04).

The audit below is exhaustive — every instance of every problem was found by reading the live source files. The planner can create tasks mechanically from this inventory without re-reading the source files. No library research was required; all findings are sourced directly from the codebase (HIGH confidence).

**Primary recommendation:** Plan three sequential tasks in node_helper.js — (1) DRY refactor, (2) var/implicit-global cleanup, (3) dead code + logging — then a single short task for MMM-SPCOutlook.js. Each task has a clear, enumerable diff with no behavior risk.

---

## Complete Bug Inventory

### QUAL-01: Duplicate Hazard Blocks to Replace

Six near-identical patterns exist in `getSpcOutlook()`. Each pattern is 10–14 lines handling: fetch, stale/cache branch, extractPolygons, evaluatePolygons, cache.set, then optionally a CIG sub-fetch if risk > 0.

| Variable pair | Hazard URL variable | CIG URL variable |
|---|---|---|
| `day1TorRisk` / `day1TorCig` | `day1TorURL` | `day1CigTorURL` |
| `day1HailRisk` / `day1HailCig` | `day1HailURL` | `day1CigHailURL` |
| `day1WindRisk` / `day1WindCig` | `day1WindURL` | `day1CigWindURL` |
| `day2TorRisk` / `day2TorCig` | `day2TorURL` | `day2CigTorURL` |
| `day2HailRisk` / `day2HailCig` | `day2HailURL` | `day2CigHailURL` |
| `day2WindRisk` / `day2WindCig` | `day2WindURL` | `day2CigWindURL` |

**Shared function signature (discretionary — recommended):**
```javascript
/**
 * Fetch and evaluate a hazard probability GeoJSON, with conditional CIG tier fetch.
 * @param url - GeoJSON endpoint for hazard probability
 * @param cigUrl - GeoJSON endpoint for CIG tiers (fetched only if risk > 0)
 * @param loc - turf point for the user location
 * @param percComparator - comparator for probability evaluation
 * @param cigComparator - comparator for CIG tier evaluation
 * @returns {{ risk: number, cig: number }} probability risk value and CIG tier
 */
async fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator) { ... }
```

**Call site pattern:**
```javascript
const { risk: day1TorRisk, cig: day1TorCig } =
  await this.fetchAndEvaluateHazard(day1TorURL, day1CigTorURL, loc, percComparator, cigComparator);
```

**Internal structure of `fetchAndEvaluateHazard`:**
1. Call `this.fetchGeoJsonCached(url)`; set `anyStale` if stale (NOTE: stale tracking must remain in getSpcOutlook — see Pitfall 1 below)
2. Branch on `fetchResult.data === null && cachedResult !== null` → return cached risk
3. Branch on `fetchResult.data === null` → return `{ risk: 0, cig: 0 }`
4. Otherwise: `extractPolygons` with `label => label === "" ? 0 : parseFloat(label)`, evaluate, cache.set
5. If `risk > 0`: repeat the same fetch/extract/evaluate/cache.set pattern for `cigUrl`
6. Return `{ risk, cig }`

**Problem with `anyStale`:** The flag lives in `getSpcOutlook` scope; `fetchAndEvaluateHazard` cannot write to it directly. Options:
- Return a stale flag as part of the result: `{ risk, cig, stale }`
- Or accept a callback/accumulator. Recommended: return `{ risk, cig, stale }` and let the caller do `if (result.stale) anyStale = true`.

---

### QUAL-02: Complete `var` and Implicit Global Inventory

#### node_helper.js — `var` declarations

| Line | Statement | Fix |
|------|-----------|-----|
| 159 | `var ActiveURL = "..."` in `getMesoscaleDiscussion` | `const ActiveURL` |
| 352 | `var day1RiskResult;` inside block | `let day1RiskResult` |
| 363 | `var day1Risk = ...` inside block | `const day1Risk` (used read-only after assignment) |
| 367 | `var day1TorRisk;` before block | `let day1TorRisk` |
| 396 | `var day1HailRisk;` before block | `let day1HailRisk` |
| 425 | `var day1WindRisk;` before block | `let day1WindRisk` |
| 454 | `var day1ProbRisk = false;` | `const day1ProbRisk` |
| 463 | `var day2RiskResult;` inside block | `let day2RiskResult` |
| 474 | `var day2Risk = ...` inside block | `const day2Risk` |
| 478 | `var day2TorRisk;` | `let day2TorRisk` |
| 507 | `var day2HailRisk;` | `let day2HailRisk` |
| 536 | `var day2WindRisk;` | `let day2WindRisk` |
| 565 | `var day2ProbRisk = false;` | `const day2ProbRisk` |
| 573 | `var day3RiskResult;` inside block | `let day3RiskResult` |
| 584 | `var day3Risk = ...` inside block | `const day3Risk` |
| 588 | `var day3ProbRisk;` | `let day3ProbRisk` |
| 724 | `var day4ProbRisk, day4Sign;` | `let day4ProbRisk, day4Sign` |
| 743 | `var day4Risk = ...` | `const day4Risk` |
| 746 | `var day5ProbRisk, day5Sign;` | `let day5ProbRisk, day5Sign` |
| 765 | `var day5Risk = ...` | `const day5Risk` |
| 768 | `var day6ProbRisk, day6Sign;` | `let day6ProbRisk, day6Sign` |
| 787 | `var day6Risk = ...` | `const day6Risk` |
| 790 | `var day7ProbRisk, day7Sign;` | `let day7ProbRisk, day7Sign` |
| 809 | `var day7Risk = ...` | `const day7Risk` |
| 812 | `var day8ProbRisk, day8Sign;` | `let day8ProbRisk, day8Sign` |
| 831 | `var day8Risk = ...` | `const day8Risk` |

After the QUAL-01 refactor, `var day1TorRisk`, `var day1HailRisk`, `var day1WindRisk`, `var day2TorRisk`, `var day2HailRisk`, `var day2WindRisk` will be replaced by destructuring assignments — so those six `var` entries disappear automatically. The remaining `var` items above still need to be fixed.

#### node_helper.js — implicit globals (no keyword at all)

| Line | Statement | Fix |
|------|-----------|-----|
| 167 | `MDArray = [];` in `getMesoscaleDiscussion` | `const MDArray = []` |
| 314 | `day1CatURL = "..."` | `const day1CatURL` |
| 315 | `day1TorURL = "..."` | `const day1TorURL` |
| 316 | `day1HailURL = "..."` | `const day1HailURL` |
| 317 | `day1WindURL = "..."` | `const day1WindURL` |
| 319 | `day2CatURL = "..."` | `const day2CatURL` |
| 320 | `day2TorURL = "..."` | `const day2TorURL` |
| 321 | `day2HailURL = "..."` | `const day2HailURL` |
| 322 | `day2WindURL = "..."` | `const day2WindURL` |
| 332 | `day3CatURL = "..."` | `const day3CatURL` |
| 333 | `day3ProbURL = "..."` | `const day3ProbURL` |
| 335 | `day4URL = "..."` | `const day4URL` |
| 336 | `day5URL = "..."` | `const day5URL` |
| 337 | `day6URL = "..."` | `const day6URL` |
| 338 | `day7URL = "..."` | `const day7URL` |
| 339 | `day8URL = "..."` | `const day8URL` |
| 342 | `loc = turf.point(...)` | `const loc` |
| 833 | `day48Risk = false;` | `let day48Risk` |

Note: Lines 314–342 all land inside `getSpcOutlook()` — these are implicit globals because they have no `const`/`let`/`var` keyword. The `const day1CigTorURL` through `day3CigUrl` constants (lines 324–330) already use `const` correctly — do not touch those.

#### MMM-SPCOutlook.js — implicit globals

| Line | Statement | Fix |
|------|-----------|-----|
| 35 | `dowToText = (day) => { ... }` inside `getDom()` | `const dowToText` |
| 61 | `dow = new Date().getDay();` inside `getDom()` | `const dow` |
| 72 | `probRiskHTML = ""` (Day 1 block) | `let probRiskHTML` |
| 83 | `probRiskHTML = ""` (Day 2 block) | `let probRiskHTML` |

Note: `probRiskHTML` is declared twice with no keyword in two separate `if` blocks. Each declaration is in its own block scope, so declaring both as `let probRiskHTML` in their respective blocks is correct. No hoisting issue.

---

### QUAL-03: Commented-Out Code Inventory (node_helper.js)

All of these are code-as-comment, not explanatory prose — remove entirely.

| Lines | Content |
|-------|---------|
| 31 | `//Log.info("SPC Outlook: GET_SPC_DATA GET")` |
| 33 | `//Log.info("SPC-Outlook - intermediate payload" + lat + " " + lon + " " + extended);` |
| 57 | `//Log.info("SPC-Outlook: " + ZIPper.readFile(entry))` |
| 63 | `//Log.info("SPC-Outlook: Parsed DOM" + doc);` |
| 65 | `//Log.info("SPC‑Outlook: Nodes –", JSON.stringify(MDS));` (note Unicode dash) |
| 79 | `//Log.info(geojson);` |
| 299 | `//Log.info("SPC-Outlook: I'M IN")` |
| 300 | `//Log.info("SPC-Outlook: Day 4-8 extended - " + extended)` |

These prose/section comments are NOT code — preserve them:
- Line 28: `// Called when the front-end (MMM-SPCOutlook.js) sends a socket notification`
- Line 76: `// Polygons`
- Line 182: `//Day3+ % => risk`
- Line 229: `// 304 Not Modified — ETag cache hit...`
- Line 235: `// Non-ok HTTP response (not 304)`
- Line 244: `// HTTP 200 — read raw text`
- Lines describing Day sections (`//Day 1`, `// Day 1 Torn`, etc.)
- Line 296: `// Part B: sigComparator — fixes latent ReferenceError in extended mode`
- Line 723: `// Day 4 — PERF-02: single-pass extractPolygons...`

Also in MMM-SPCOutlook.js lines 92–94: a commented-out code block (day3 prob/sign display). The CONTEXT.md scope says `node_helper.js` for QUAL-03, but this is a code-as-comment in the frontend. Treat as in scope for cleanup since QUAL-02 and QUAL-04 touch MMM-SPCOutlook.js anyway.

---

### QUAL-04: console.log / console.error Inventory

#### node_helper.js

| Line | Statement | Action |
|------|-----------|--------|
| 173 | `console.log("SPC-Outlook MD Test:" + ...)` in `getMesoscaleDiscussion` | **Remove entirely** (per CONTEXT: noisy MD trace not needed in production) |
| 914 | `console.error("Error fetching or parsing SPC data", err)` in `getSpcOutlook` catch | **→ `Log.error(...)`** |

#### MMM-SPCOutlook.js

| Line | Statement | Action |
|------|-----------|--------|
| 12 | `console.log("SPC-Outlook: GET_SPC_DATA - " + lat + "," + lon + "," + extended)` | **→ `Log.info(...)`** |
| 21 | `console.log("SPC Outlook: SPC_DATA_RESULT Received - " + JSON.stringify(payload))` | **→ `Log.info(...)`** |

`Log` is already imported at the top of node_helper.js (`const Log = require("logger")`). In MMM-SPCOutlook.js, `Log` is a MagicMirror global available in all module files — no import needed.

---

## Architecture Patterns

### Recommended Task Structure

The four QUAL requirements are nearly independent but have one sequencing constraint: QUAL-01 (the DRY refactor) should happen first because it eliminates the six `var` declarations for `day1TorRisk`, etc. — touching those lines twice (once for DRY, once for `var` cleanup) wastes effort and risks merge conflicts.

Recommended order within node_helper.js:
1. QUAL-01: Add `fetchAndEvaluateHazard`, replace six blocks with six calls
2. QUAL-02: Fix all remaining `var`/implicit globals in node_helper.js (Day1/Day2 vars gone; fix URL vars, cat/prob vars, day3–day8 vars, MDArray)
3. QUAL-03 + QUAL-04 together: Remove commented-out lines and fix console calls (low-risk line deletions)
4. Separate task for MMM-SPCOutlook.js: `dowToText`, `dow`, `probRiskHTML` implicit globals; two console.log → Log.info; commented block on lines 92–94

### Pattern: Cache.set Inside the Shared Function

The cache update in the shared function must mirror the existing pattern exactly:
```javascript
this._geoJsonCache.set(url, {
  mode: fetchResult.mode,
  etag: fetchResult.newEtag ?? null,
  hash: fetchResult.newHash ?? null,
  result: riskValue,
  timestamp: Date.now()
});
```
The CIG URL cache update uses the same structure but stores the CIG integer as `result`.

### Pattern: Stale Flag Propagation

`anyStale` is a local variable in `getSpcOutlook`. After extracting `fetchAndEvaluateHazard`, the method must communicate staleness back to the caller. The cleanest approach consistent with the existing code style: include `stale` in the return object.

```javascript
// Inside fetchAndEvaluateHazard:
if (fetchResult.stale) stale = true;
// ...
return { risk, cig, stale };

// At each call site in getSpcOutlook:
const { risk: day1TorRisk, cig: day1TorCig, stale: s1 } =
  await this.fetchAndEvaluateHazard(...);
if (s1) anyStale = true;
```

Alternative: accept a mutable object `{ anyStale: false }` and mutate it inside the function. Either works — use whichever reads more clearly.

### Anti-Patterns to Avoid

- **Touching Day 3 or fire weather blocks during QUAL-01:** Only the six Day 1/2 Tor/Hail/Wind hazard blocks are in scope. Day 3 CIG, fire weather, and categorical blocks have different shapes and are explicitly out of scope.
- **Changing `var` to `const` when the variable is mutated:** `day1RiskResult`, `day3RiskResult` are assigned inside a block then referenced outside — they must be `let`, not `const`. Only truly read-only assignments get `const`.
- **Over-removing comments:** Section headings like `// Day 1 Cat` and `// Fire Weather Day 1` orient the reader — preserve them. Only remove lines that are commented-out executable code.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Logging | Custom log wrapper | `Log.info()` / `Log.error()` from MagicMirror's `logger` module — already imported |
| JSDoc types | TypeScript annotations or inline type comments | Plain `@param` with name and description only, per CONTEXT decision |

---

## Common Pitfalls

### Pitfall 1: Block-Scoped `var` Variables Referenced Outside the Block

Several `var` declarations are inside braces `{ }` (not functions) but are used after the block. For example:

```javascript
{
  var day1RiskResult;
  // ... set day1RiskResult
  var day1Risk = day1RiskResult === 0 ? "NONE" : valueToRisk[day1RiskResult];
}
// day1Risk is used below
```

Because `var` is function-scoped, this works today. If these are changed to `let`/`const`, they must be declared **before** the block (for `let`) or the block structure must be adjusted. The inventory above already accounts for this: `day1RiskResult` → `let` declared before block; `day1Risk` → `const` declared inside block if only read after, or `let` outside if needed. Verify each case before committing.

### Pitfall 2: `anyStale` Becomes Unreachable Inside Extracted Function

The `anyStale` variable is in `getSpcOutlook` scope. If `fetchAndEvaluateHazard` is defined as a method on the NodeHelper object (not a closure), it cannot write to `anyStale` directly. The return object must carry the stale flag — don't forget this or staleness tracking silently breaks.

### Pitfall 3: Two `probRiskHTML` Declarations in MMM-SPCOutlook.js

Lines 72 and 83 in MMM-SPCOutlook.js each say `probRiskHTML = ""` with no keyword, inside different `if` blocks. Adding `let probRiskHTML = ""` to each independently (within each `if` block's scope) is correct and avoids a `let` re-declaration error. Do not hoist a single `let probRiskHTML` to `getDom` scope — that would work but is unnecessary and introduces a larger diff.

### Pitfall 4: `dowToText` Function Declaration vs. Arrow Assignment

Line 35 in MMM-SPCOutlook.js: `dowToText = (day) => { ... }` — the `getDom` function is not strict mode, so this silently becomes a global. Fixing it to `const dowToText = (day) => { ... }` is the correct targeted fix. Do not change it to a regular function declaration — the arrow form is idiomatic here.

---

## Code Examples

### fetchAndEvaluateHazard Skeleton (Recommended Implementation Pattern)
```javascript
// Source: derived from existing cache pattern in getSpcOutlook (lines 369–393)
async fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator) {
  let risk = 0;
  let cig = 0;
  let stale = false;

  const fetchResult = await this.fetchGeoJsonCached(url);
  if (fetchResult.stale) stale = true;

  if (fetchResult.data === null && fetchResult.cachedResult !== null) {
    risk = fetchResult.cachedResult;
  } else if (fetchResult.data !== null) {
    const poly = this.extractPolygons(
      fetchResult.data,
      label => label === "" ? 0 : parseFloat(label),
      (label, val) => val > 0
    );
    risk = this.evaluatePolygons(poly, loc, percComparator);
    this._geoJsonCache.set(url, {
      mode: fetchResult.mode,
      etag: fetchResult.newEtag ?? null,
      hash: fetchResult.newHash ?? null,
      result: risk,
      timestamp: Date.now()
    });
  }

  if (risk > 0) {
    const cigFetch = await this.fetchGeoJsonCached(cigUrl);
    if (cigFetch.stale) stale = true;
    if (cigFetch.data === null && cigFetch.cachedResult !== null) {
      cig = cigFetch.cachedResult;
    } else if (cigFetch.data !== null) {
      const cigPolys = this.extractPolygons(
        cigFetch.data,
        label => cigToTier[label] || 0,
        (label, val) => val > 0
      );
      cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
      this._geoJsonCache.set(cigUrl, {
        mode: cigFetch.mode,
        etag: cigFetch.newEtag ?? null,
        hash: cigFetch.newHash ?? null,
        result: cig,
        timestamp: Date.now()
      });
    }
  }

  return { risk, cig, stale };
},
```

Note: `cigToTier` is defined in `getSpcOutlook` scope. Either pass it as a parameter or move the definition to module scope. Passing as a parameter keeps the function self-contained and testable.

### Revised Call Site Pattern
```javascript
// Replaces ~13 lines of duplicated code for each hazard
const { risk: day1TorRisk, cig: day1TorCig, stale: s1Tor } =
  await this.fetchAndEvaluateHazard(day1TorURL, day1CigTorURL, loc, percComparator, cigComparator);
if (s1Tor) anyStale = true;
```

### JSDoc Template (for reference — exact wording is discretionary)
```javascript
/**
 * Fetch and evaluate a hazard probability GeoJSON with conditional CIG tier fetch.
 * @param url - Hazard probability GeoJSON endpoint URL
 * @param cigUrl - CIG tier GeoJSON endpoint URL (only fetched if risk > 0)
 * @param loc - turf point representing the user's location
 * @param percComparator - comparator object for probability evaluation
 * @param cigComparator - comparator object for CIG tier evaluation
 * @returns {{ risk: number, cig: number, stale: boolean }} hazard evaluation result
 */
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no test infrastructure exists (documented in REQUIREMENTS.md as Out of Scope) |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-01 | fetchAndEvaluateHazard replaces 6 duplicate blocks | manual — code review | N/A — no test framework | N/A |
| QUAL-02 | No `var` / no implicit globals in either file | manual — grep verification: `grep -n '\bvar\b' node_helper.js MMM-SPCOutlook.js` | N/A | N/A |
| QUAL-03 | No commented-out code lines remain | manual — code review | N/A | N/A |
| QUAL-04 | No `console.log`/`console.error` in production paths | manual — grep verification: `grep -n 'console\.' node_helper.js MMM-SPCOutlook.js` | N/A | N/A |

### Sampling Rate

Testing for this phase is entirely manual. The verification commands that can be run mechanically:

```bash
# QUAL-02 check — should return no output
grep -n '\bvar\b' node_helper.js MMM-SPCOutlook.js

# QUAL-02 implicit globals — hard to grep for; code review required
# QUAL-04 check — should return no output
grep -n 'console\.' node_helper.js MMM-SPCOutlook.js

# QUAL-03 check — should return only prose comments, no disabled code
grep -n '//Log\.' node_helper.js
```

### Wave 0 Gaps

None — no test infrastructure is planned for this project. All verification is manual code review plus the grep spot-checks listed above.

---

## State of the Art

No library research required — this phase is entirely internal code cleanup using patterns already established in the codebase.

| Pattern | Current State | Post-Phase State |
|---------|--------------|-----------------|
| Day 1/2 hazard evaluation | 6 copy-paste blocks (~80 lines) | 6 calls to shared function (~12 lines) |
| Variable declarations | Mix of `var`, `const`, `let`, and implicit globals | All `const` or `let`, zero `var`, zero implicit globals |
| Commented code | 8 commented-out Log.info lines in node_helper.js | Zero |
| Console calls | 4 total across both files | Zero |

---

## Open Questions

1. **cigToTier closure vs. parameter**
   - What we know: `cigToTier` is currently defined inside `getSpcOutlook()` scope
   - What's unclear: Whether to pass it as a parameter to `fetchAndEvaluateHazard` or move it to module scope
   - Recommendation: Pass as parameter — keeps the function self-contained and makes the dependency explicit. Alternatively, the method can just inline `{ CIG1: 1, CIG2: 2, CIG3: 3 }` since it's a stable constant.

2. **Day 1 Cat blocks — are they in scope for DRY?**
   - What we know: The Day 1 Cat and Day 2 Cat blocks share a different (but also duplicated) structure — they use `riskToValue` not `parseFloat` and return a category string, not a probability
   - What's unclear: QUAL-01 says "Tornado/Hail/Wind" — cat blocks are out of scope
   - Recommendation: Leave the cat blocks as-is; only refactor the six hazard blocks explicitly listed

---

## Sources

### Primary (HIGH confidence)
- Direct source code read of `node_helper.js` (all 935 lines) — all findings
- Direct source code read of `MMM-SPCOutlook.js` (120 lines) — all findings
- `.planning/phases/05-code-quality/05-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` — requirement definitions and scope

### Secondary (MEDIUM confidence)
- None required — no external library research needed for this phase

### Tertiary (LOW confidence)
- None

---

## Metadata

**Confidence breakdown:**
- Bug inventory (QUAL-01 through QUAL-04): HIGH — sourced from direct file reads
- Recommended function signature: MEDIUM — discretionary per CONTEXT; exact form left to planner/implementer
- Pitfall analysis: HIGH — derived from code structure observation

**Research date:** 2026-03-07
**Valid until:** Until node_helper.js or MMM-SPCOutlook.js is modified (code audit is point-in-time)
