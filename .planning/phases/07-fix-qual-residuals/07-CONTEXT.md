# Phase 7: Fix QUAL-02/QUAL-03 Residuals - Context

**Gathered:** 2026-03-11
**Status:** Ready for planning

<domain>
## Phase Boundary

Eliminate the two remaining code quality defects discovered post-Phase-5 audit: one implicit global in the production call path (`evaluatePolygons`), and three dead/commented-out code blocks. Closes QUAL-02 and QUAL-03. No new functionality; no changes to logic, behavior, or output.

</domain>

<decisions>
## Implementation Decisions

### Implicit global fix (QUAL-02)
- `node_helper.js` line 104: `result =` → `const result =`
- This is the only implicit global in the production call path
- `minDistTest` (line 165 in `evaluatePolygonsContinuous`) is also an implicit global but disappears automatically when the dead method is removed

### Dead method removal (QUAL-03)
- Remove `evaluatePolygonsWeighted` (lines 120–147) and `evaluatePolygonsContinuous` (lines 157–180) — neither is called anywhere in production; both are prototype/exploratory code that was never activated
- Remove JSDoc block comments for both deleted methods
- Remove commented-out `checkDayCat`, `checkDayPerc`, and `checkDaySign` blocks (lines 896–967)

### Sweep scope
- Fix the 3 precisely identified defects (no broad scan requested)
- Success criteria are the authoritative checklist: line 104 fix, lines 896–967 removal, evaluatePolygonsWeighted + evaluatePolygonsContinuous removal

### Claude's Discretion
- Verification approach — run grep-based QUAL checks after fixes to confirm no remaining implicit globals or var declarations (consistent with Phase 5 verification pattern)

</decisions>

<specifics>
## Specific Ideas

No specific requirements — phase goal and success criteria are unambiguous.

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- No reusable assets needed — this is pure deletion/fix work

### Established Patterns
- Phase 5 verification pattern: grep for `\bvar\b`, implicit globals, `console\.log` — reuse same checks here for QUAL-02/03 sign-off
- MagicMirror logging: `Log.error()` for errors — already applied in prior phases; no changes needed here

### Integration Points
- `evaluatePolygons` is the core polygon evaluation method called throughout `getSpcOutlook()` — the `const result =` fix is the only change to this method; no call sites change
- The three deleted commented-out methods are at the end of the module object (lines 896–967) — removal doesn't affect any surrounding code
- `evaluatePolygonsWeighted` and `evaluatePolygonsContinuous` are defined in the module object but never called — safe to delete without updating any call sites

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 07-fix-qual-residuals*
*Context gathered: 2026-03-11*
