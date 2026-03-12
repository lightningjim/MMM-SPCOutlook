# Phase 7: Fix QUAL-02/QUAL-03 Residuals - Research

**Researched:** 2026-03-11
**Domain:** JavaScript code cleanup — implicit global elimination and dead code removal in node_helper.js
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Implicit global fix (QUAL-02)**
- `node_helper.js` line 104: `result =` → `const result =`
- This is the only implicit global in the production call path
- `minDistTest` (line 165 in `evaluatePolygonsContinuous`) is also an implicit global but disappears automatically when the dead method is removed

**Dead method removal (QUAL-03)**
- Remove `evaluatePolygonsWeighted` (lines 120–147) and `evaluatePolygonsContinuous` (lines 157–180) — neither is called anywhere in production; both are prototype/exploratory code that was never activated
- Remove JSDoc block comments for both deleted methods
- Remove commented-out `checkDayCat`, `checkDayPerc`, and `checkDaySign` blocks (lines 896–967)

**Sweep scope**
- Fix the 3 precisely identified defects (no broad scan requested)
- Success criteria are the authoritative checklist: line 104 fix, lines 896–967 removal, evaluatePolygonsWeighted + evaluatePolygonsContinuous removal

### Claude's Discretion

- Verification approach — run grep-based QUAL checks after fixes to confirm no remaining implicit globals or var declarations (consistent with Phase 5 verification pattern)

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| QUAL-02 | All variable declarations use `const` or `let`; no implicit globals or `var` | One remaining implicit global confirmed at line 104 (`result =`); `minDistTest` at line 165 self-resolves on dead method removal |
| QUAL-03 | Dead/commented-out code blocks removed from `node_helper.js` | Three targets confirmed: `evaluatePolygonsWeighted` (lines 112–147 including JSDoc), `evaluatePolygonsContinuous` (lines 149–180 including JSDoc), and commented-out blocks (lines 896–967) |
</phase_requirements>

---

## Summary

Phase 7 is a surgical three-fix cleanup of `node_helper.js` with no behavior changes. Phase 5 addressed the bulk of QUAL-02 and QUAL-03 but left three specific defects behind: one implicit global in the active production call path (`result =` at line 104 inside `evaluatePolygons`), two dead prototype methods that were never activated (`evaluatePolygonsWeighted` and `evaluatePolygonsContinuous`), and three commented-out method bodies (`checkDayCat`, `checkDayPerc`, `checkDaySign`) at the end of the module object.

All three defects are confirmed present in the current source by direct file inspection. The line numbers cited in CONTEXT.md are accurate for the current state of `node_helper.js` (967 lines total). No `var` declarations remain — Phase 5 cleared all of them. The only remaining implicit global in the production call path is the single `result =` at line 104.

The second implicit global (`minDistTest` at line 165) sits inside `evaluatePolygonsContinuous`, which is being deleted. It requires no separate fix — the deletion eliminates it for free. The JSDoc block comments preceding each dead method (lines 112–119 for `evaluatePolygonsWeighted` and 149–156 for `evaluatePolygonsContinuous`) must also be removed since they document code that will no longer exist.

**Primary recommendation:** One plan, two tasks: Task 1 fixes line 104 (QUAL-02) and removes the two dead methods with their JSDoc headers (QUAL-03). Task 2 removes the commented-out blocks at lines 896–967 (QUAL-03) and runs grep verification. Alternatively, all three fixes are small enough to combine into a single task.

---

## Complete Defect Inventory

All findings sourced from direct file read of `node_helper.js` (967 lines, read 2026-03-11).

### QUAL-02: Remaining Implicit Global

| Line | Current Code | Fix |
|------|-------------|-----|
| 104 | `result = turf.booleanPointInPolygon(loc, poly);` | `const result = turf.booleanPointInPolygon(loc, poly);` |

**Verification:** `grep -n "result =" node_helper.js` currently returns line 104 (implicit global) and line 219 (`const result = await fetch(url)` — already correct, do not touch).

`minDistTest` at line 165 inside `evaluatePolygonsContinuous` is also an implicit global but will be eliminated by the dead method removal — no independent fix needed.

### QUAL-03: Dead Methods to Remove

**Method 1: `evaluatePolygonsWeighted`**

Lines to delete: 112–147 (JSDoc block comment + method body)

```
Lines 112–119: JSDoc block (/** ... */)
Line 120:       evaluatePolygonsWeighted(items, loc, comparator, transitionDistance = 30){
Lines 121–146:  method body
Line 147:       },
```

This method is never called anywhere in the file. It also contains a secondary implicit global at line 126 (`result` referenced without declaration — it reads the global `result` written by `evaluatePolygons`) that makes it semantically broken in addition to being dead.

**Method 2: `evaluatePolygonsContinuous`**

Lines to delete: 149–180 (JSDoc block comment + method body)

```
Lines 149–156: JSDoc block (/** ... */)
Line 157:       evaluatePolygonsContinuous(items, loc, comparator, transitionDistance = 30){
Lines 158–179:  method body (includes implicit global `minDistTest` at line 165)
Line 180:       },
```

This method is also never called anywhere in the file.

**Method 3: Commented-out blocks (checkDayCat / checkDayPerc / checkDaySign)**

Lines to delete: 896–967 (the last block before the closing `});`)

```
Lines 896–921:  // checkDayCat block
Lines 923–947:  // checkDayPerc block
Lines 949–967:  // checkDaySign block (with closing `// }`)
Line 968:       }); ← module object close — DO NOT DELETE
```

**CRITICAL BOUNDARY:** Line 968 is `});` — the closing of the `NodeHelper.register(...)` module object call. The commented-out block ends at line 967 with `// }`. After deletion, the `});` on line 968 must remain intact.

---

## Architecture Patterns

### Recommended Project Structure (unchanged)

No structural changes to the file. This phase is line-level deletion and a single keyword insertion.

### Pattern: Surgical Line Deletion

The three deletions are contiguous blocks. Each is self-contained — no surrounding code references these methods. Deletion order does not matter; all three are independent.

After deleting `evaluatePolygonsWeighted` and `evaluatePolygonsContinuous` (approximately 69 lines removed), line numbers below line 180 will shift down by 69 positions. This means the commented-out blocks will no longer be at lines 896–967 after the first deletion — the planner/implementer should apply both deletions in a single editing session or account for the shift.

Practical approach: make all edits in one pass, reading the file at the start of the task before applying any changes.

### Pattern: Phase 5 Verification Grep Commands

Phase 5 established this set of verification grep commands. Phase 7 reuses the same checks:

```bash
# QUAL-02: No var declarations (should return no output)
grep -n '\bvar\b' node_helper.js

# QUAL-02: Implicit globals check — spot-check the specific fix
grep -n 'result =' node_helper.js
# Expected: only line with `const result =` (production call path fixed) and `const result = await fetch` (already correct)
# NOT expected: bare `result =` without keyword

# QUAL-03: Dead methods removed — should return no output
grep -n 'evaluatePolygonsWeighted\|evaluatePolygonsContinuous' node_helper.js

# QUAL-03: Commented-out blocks removed — should return no output
grep -n 'checkDayCat\|checkDayPerc\|checkDaySign' node_helper.js

# QUAL-03: No commented-out code lines remain — should return no output (prose comments excluded)
grep -n '//   ' node_helper.js
# Note: the commented-out blocks all use '//   ' (with 3 spaces) as their prefix
```

### Anti-Patterns to Avoid

- **Deleting line 968 (`});`):** The commented-out block at lines 896–967 ends with `// }` which is the commented-out closing brace of the last method. The actual module-closing `});` follows on the next line and must be preserved.
- **Removing JSDoc for live methods:** Only the JSDoc blocks for `evaluatePolygonsWeighted` and `evaluatePolygonsContinuous` are deleted. The JSDoc for `evaluatePolygons` (lines 95–100) must be preserved — it documents a live production method.
- **Touching any other line:** CONTEXT.md is explicit that the scope is exactly these three defects. No broad scan, no opportunistic cleanup.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead |
|---------|-------------|-------------|
| Verifying no implicit globals | Custom analysis script | `grep -n 'result =' node_helper.js` — simple grep spot-check per Phase 5 pattern |
| Verifying dead code removed | Diff review only | `grep -n 'evaluatePolygonsWeighted\|evaluatePolygonsContinuous'` — confirms absence |

---

## Common Pitfalls

### Pitfall 1: Deleting the Module-Closing `});`

**What goes wrong:** The commented-out `checkDaySign` block ends with `// }` on line 967 — a commented-out closing brace. The very next line (968) is `});` which closes the entire `NodeHelper.register(module, { ... })` call. Deleting lines 896–968 instead of 896–967 would break the module.

**Why it happens:** The visual similarity between `// }` (commented-out brace, delete it) and `});` (live module close, keep it) makes this an easy off-by-one error.

**How to avoid:** Read lines 965–970 before deleting to confirm the boundary. The line to preserve starts with `}` not `// }`.

**Warning signs:** After deletion, if `node_helper.js` throws a `SyntaxError: Unexpected end of input` or similar, the closing `});` was accidentally removed.

### Pitfall 2: Line Number Drift During Editing

**What goes wrong:** Deleting `evaluatePolygonsWeighted` (lines 112–147, ~36 lines) and `evaluatePolygonsContinuous` (lines 149–180, ~32 lines) shifts all subsequent line numbers down by ~69. If the editor/task applies changes sequentially using the original line numbers, the second deletion will target wrong lines.

**Why it happens:** CONTEXT.md documents original line numbers. Post-first-deletion, those numbers are stale.

**How to avoid:** Either (a) apply all deletions in a single Read-then-Write operation, or (b) search by content rather than line number for the second and third deletions.

### Pitfall 3: Implicit Global Check Misreading the grep Output

**What goes wrong:** After fixing line 104 to `const result =`, a grep for `result =` will still return a hit at the fetch call (`const result = await fetch(url)`). A reviewer might mistakenly flag this as an uncorrected implicit global.

**Why it happens:** The verification grep is not keyword-aware.

**How to avoid:** The verification step should confirm line 104 shows `const result =` (not bare `result =`). The other `const result =` hits are already correct and not a concern.

---

## Code Examples

### Fix for QUAL-02 (Line 104)

```javascript
// BEFORE (implicit global — result assigned without const/let):
  evaluatePolygons(items, loc, comparator){
    let best = comparator.initial;
    items.forEach(({label, value, poly}) => {
      result = turf.booleanPointInPolygon(loc, poly);   // line 104
      if(result){
        best = comparator.comparator(best, value);
      }
    });
    return best;
  },

// AFTER (const result — block-scoped, used only within this forEach callback):
  evaluatePolygons(items, loc, comparator){
    let best = comparator.initial;
    items.forEach(({label, value, poly}) => {
      const result = turf.booleanPointInPolygon(loc, poly);   // line 104 fixed
      if(result){
        best = comparator.comparator(best, value);
      }
    });
    return best;
  },
```

`result` is used only within the `forEach` callback body — declaring it `const` inside the callback is semantically correct and tighter than `let`.

### Module Boundary at End of File (lines 893–968)

```javascript
// Source: direct file read, lines 893–968

    return false;
  },                              // ← end of checkInPolygon (line 894)
                                  // ← blank line (line 895)
//   checkDayCat(geojson, ...) {  // ← line 896: DELETE FROM HERE
//     ...
//   },
//   checkDayPerc(geojson, ...) {
//     ...
//   },
//   checkDaySign(geojson, ...) {
//     ...
//   return false;
// }                              // ← line 967: TO HERE (inclusive)
});                               // ← line 968: KEEP — module object close
```

After deletion, the file should end:

```javascript
    return false;
  },

});
```

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no test infrastructure (documented as Out of Scope in REQUIREMENTS.md) |
| Config file | None |
| Quick run command | N/A |
| Full suite command | N/A |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| QUAL-02 | `result =` at line 104 uses `const` keyword | manual — grep spot-check | `grep -n 'result =' node_helper.js` (confirm no bare assignment without keyword) | N/A |
| QUAL-02 | No implicit globals remain in production call path | manual — grep | `grep -n '\bvar\b' node_helper.js` (should return no output) | N/A |
| QUAL-03 | `evaluatePolygonsWeighted` method absent | manual — grep | `grep -n 'evaluatePolygonsWeighted' node_helper.js` (should return no output) | N/A |
| QUAL-03 | `evaluatePolygonsContinuous` method absent | manual — grep | `grep -n 'evaluatePolygonsContinuous' node_helper.js` (should return no output) | N/A |
| QUAL-03 | `checkDayCat/checkDayPerc/checkDaySign` blocks absent | manual — grep | `grep -n 'checkDayCat\|checkDayPerc\|checkDaySign' node_helper.js` (should return no output) | N/A |
| QUAL-03 | Module file still valid JS (closing `});` intact) | manual — syntax check | `node --check node_helper.js` | N/A |

### Sampling Rate

- **Per task commit:** Run the grep spot-checks listed above
- **Per wave merge:** Same grep checks + `node --check node_helper.js` syntax validation
- **Phase gate:** All grep checks return no output; `node --check` passes

### Wave 0 Gaps

None — no test infrastructure is planned for this project. All verification is grep spot-checks and syntax validation.

---

## State of the Art

| Before Phase 7 | After Phase 7 |
|----------------|---------------|
| 1 implicit global in production call path (`result =` line 104) | Zero implicit globals in production call path |
| 2 dead prototype methods in module object (never called, ~69 lines) | Dead methods removed |
| 3 commented-out method bodies at end of file (~72 lines) | Commented-out blocks removed |
| QUAL-02: open (1 implicit global remaining) | QUAL-02: closed |
| QUAL-03: open (dead + commented-out code remaining) | QUAL-03: closed |

**Post-phase file size:** Approximately 967 − 69 (dead methods + JSDoc) − 72 (commented blocks) = ~826 lines

---

## Open Questions

No open questions. The scope is unambiguous, the line numbers are confirmed, and all three defects are verified present in the current source.

---

## Sources

### Primary (HIGH confidence)

- Direct file read of `/node_helper.js` (all 967 lines, read 2026-03-11) — all defect locations confirmed
- `.planning/phases/07-fix-qual-residuals/07-CONTEXT.md` — locked decisions
- `.planning/REQUIREMENTS.md` — QUAL-02 and QUAL-03 requirement definitions
- `.planning/phases/05-code-quality/05-VERIFICATION.md` — Phase 5 grep verification pattern and confirmation that all Phase 5 items were resolved
- `.planning/phases/05-code-quality/05-RESEARCH.md` — original QUAL-02/03 inventory (confirms what Phase 5 addressed and what remained)

### Secondary (MEDIUM confidence)

None required — all findings sourced directly from codebase.

### Tertiary (LOW confidence)

None.

---

## Metadata

**Confidence breakdown:**
- Defect inventory: HIGH — all three defects verified by direct grep and file read; line numbers confirmed accurate
- Fix patterns: HIGH — trivial keyword insertion and line deletion with no logic change
- Boundary analysis (line 968): HIGH — confirmed by direct read of lines 880–968
- Pitfall analysis: HIGH — derived from direct code structure observation

**Research date:** 2026-03-11
**Valid until:** Until `node_helper.js` is modified (audit is point-in-time; line numbers will shift after any edit)
