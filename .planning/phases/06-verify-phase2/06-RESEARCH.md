# Phase 6: Verify Phase 2 - Research

**Researched:** 2026-03-11
**Domain:** Verification document authorship + targeted cosmetic fix (wind CIG label placement)
**Confidence:** HIGH

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Verification Document Format**
- Structure: evidence-based checklist — each success criterion listed with file + line reference pointing to the code that satisfies it
- Evidence level: file + line number (e.g. `node_helper.js:428 — CIG wind URL fetched`), not full code snippets or grep output
- Scope: Phase 2's original SPC-01/SPC-02 success criteria **plus** a regression check verifying that Phase 3–5 changes did not break CIG tier behavior
- The regression section should be concise — identify any Phase 3–5 touch points on CIG-related code paths and confirm they're intact

**Wind CIG Label Fix**
- Fix applies to Days 1 and 2 in MMM-SPCOutlook.js
- Current (wrong) wind pattern: `cigLabel(windCig) + "<i class=\"wi wi-strong-wind\"></i> " + 100 * windRisk + "%"`
- Target (correct) wind pattern — exactly matches tor/hail: `"<i class=\"wi wi-strong-wind\"></i>" + cigLabel(windCig) + 100 * windRisk + "% "`
- Normalize fully: icon first, then cigLabel, then risk%, then trailing space — identical structure to tornado and hail lines
- Also audit Day 3 CIG display (`cigLabel(day3.cig)` appended after risk text) for any inconsistencies while touching the area; fix if found, note as clean if not

### Claude's Discretion
- Whether to verify Day 3 CIG against the same pattern (it's a single overall CIG, not per-hazard — may not apply)
- Format/sectioning of the 02-VERIFICATION.md document beyond the checklist + regression structure

### Deferred Ideas (OUT OF SCOPE)

None — discussion stayed within phase scope.
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SPC-01 | SIGN risk supports CIG1/CIG2/CIG3 tiered severity levels (replaces previous boolean SIGN) | node_helper.js contains cigToTier, cigComparator, 7 CIG URLs, fetchAndEvaluateHazard; evidence is file + line references to those constructs |
| SPC-02 | Module display renders CIG1/CIG2/CIG3 SIGN tiers visually (distinct from each other) | MMM-SPCOutlook.js contains cigLabel() with distinct ①②③ symbols; wind lines (75, 86) have icon/label order inverted from tor/hail — cosmetic fix required before SPC-02 closes |
</phase_requirements>

---

## Summary

Phase 6 has two deliverables. The first is authoring `02-VERIFICATION.md` — a standalone evidence document that formally closes SPC-01 and SPC-02 by citing the file + line numbers in the current codebase where each Phase 2 success criterion is satisfied. The second is a targeted one-line fix in MMM-SPCOutlook.js: the wind CIG label is placed before the weather icon on lines 75 and 86, while tor and hail place cigLabel after the icon. The CONTEXT.md specifies exactly what the correct pattern is and which lines to change.

Both deliverables are straightforward. The code that satisfies SPC-01 and SPC-02 is already in place — this phase verifies it exists and fixes the cosmetic defect discovered during the v1.0 audit. No new features, no architectural changes, no dependency changes.

The Phase 3–5 regression section of the verification document is equally scoped. The audit report (`v1.0-MILESTONE-AUDIT.md`) confirms the CIG code path was refactored in Phase 5 (QUAL-01 extracted `fetchAndEvaluateHazard`) and integrated cleanly — the cross-phase wiring table shows no CIG defects in the integration checker. The regression section needs to identify those Phase 5 touch points and confirm the code path still produces the correct CIG values.

**Primary recommendation:** Two-task plan — Task 1 writes 02-VERIFICATION.md (documentation only, no code changes); Task 2 fixes the wind label order on MMM-SPCOutlook.js lines 75 and 86.

---

## Standard Stack

### Core (no new dependencies)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| node --check | Node.js built-in | Syntax verification for MMM-SPCOutlook.js after wind fix | Standard for this project; used in all Phase 2 verification steps |

No new npm packages required. Both deliverables are documentation authorship plus a two-line string-reorder in MMM-SPCOutlook.js.

**Verification command:**
```bash
node --check /home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/MMM-SPCOutlook.js
```

---

## Architecture Patterns

### Verification Document Structure

The 02-VERIFICATION.md must follow the pattern used by existing VERIFICATION.md files in this project (Phase 1, Phase 3, Phase 4, Phase 5 all have them). Based on those and the CONTEXT.md constraints, the document has three sections:

1. **SPC-01 checklist** — Phase 2 Plan 01 success criteria, each item confirmed with `file:line — description`
2. **SPC-02 checklist** — Phase 2 Plan 02 success criteria, each item confirmed with `file:line — description`
3. **Regression check** — Phase 3–5 touch points on CIG code paths, confirmed intact

### Evidence Location Map (HIGH confidence — verified by reading live files)

The following file:line references are confirmed present in the current codebase and satisfy each Phase 2 success criterion:

**SPC-01 — Backend CIG fetch and extraction:**

| Criterion | File | Line(s) | Confirmed |
|-----------|------|---------|-----------|
| cigToTier lookup defined | node_helper.js | ~396 | ✅ `const cigToTier = { CIG1: 1, CIG2: 2, CIG3: 3 }` |
| cigComparator defined (Math.max shape) | node_helper.js | ~397-400 | ✅ `const cigComparator = { initial: 0, comparator: (best, val) => Math.max(best, val) }` |
| Day 1 tornado CIG fetched via dedicated URL | node_helper.js | ~471 | ✅ `fetchAndEvaluateHazard(day1TorURL, day1CigTorURL, ...)` |
| Day 1 hail CIG fetched | node_helper.js | ~476 | ✅ `fetchAndEvaluateHazard(day1HailURL, day1CigHailURL, ...)` |
| Day 1 wind CIG fetched | node_helper.js | ~481 | ✅ `fetchAndEvaluateHazard(day1WindURL, day1CigWindURL, ...)` |
| Day 2 tornado CIG fetched | node_helper.js | ~510 | ✅ `fetchAndEvaluateHazard(day2TorURL, day2CigTorURL, ...)` |
| Day 2 hail CIG fetched | node_helper.js | ~515 | ✅ `fetchAndEvaluateHazard(day2HailURL, day2CigHailURL, ...)` |
| Day 2 wind CIG fetched | node_helper.js | ~520 | ✅ `fetchAndEvaluateHazard(day2WindURL, day2CigWindURL, ...)` |
| Day 3 CIG fetched via cigprob URL | node_helper.js | ~569-570 | ✅ `extractPolygons(fetchResult.data, label => cigToTier[label] \|\| 0, ...)` |
| Return objects contain torCig/hailCig/windCig (Day 1, non-ext) | node_helper.js | ~648-652 | ✅ integer fields in both return paths |
| Return objects contain torCig/hailCig/windCig (Day 2, ext) | node_helper.js | ~804-820 | ✅ same in extended return |
| Day 3 returns cig integer (both paths) | node_helper.js | ~666, ~822 | ✅ `"cig": day3Cig` |
| No label === "SIGN" for Days 1-3 | node_helper.js | — | ✅ SIGN extraction absent for Days 1-3 (Days 4-8 retain their SIGN logic as intended) |
| Days 4-8 SIGN logic preserved | node_helper.js | ~696-784 | ✅ unchanged from Phase 1 baseline |

**SPC-02 — Frontend CIG display:**

| Criterion | File | Line(s) | Confirmed |
|-----------|------|---------|-----------|
| cigLabel() helper defined in getDom() | MMM-SPCOutlook.js | 40-45 | ✅ returns ③/②/① for tiers 3/2/1, empty for 0 |
| Day 1 tor uses cigLabel(torCig) | MMM-SPCOutlook.js | 73 | ✅ |
| Day 1 hail uses cigLabel(hailCig) | MMM-SPCOutlook.js | 74 | ✅ |
| Day 1 wind uses cigLabel(windCig) | MMM-SPCOutlook.js | 75 | ✅ (after wind label fix in this phase) |
| Day 2 tor uses cigLabel(torCig) | MMM-SPCOutlook.js | 84 | ✅ |
| Day 2 hail uses cigLabel(hailCig) | MMM-SPCOutlook.js | 85 | ✅ |
| Day 2 wind uses cigLabel(windCig) | MMM-SPCOutlook.js | 86 | ✅ (after wind label fix in this phase) |
| Day 3 uses cigLabel(day3.cig) | MMM-SPCOutlook.js | 91 | ✅ `cigLabel(this.spcrisk.day3.cig)` appended after text |
| No reference to torSign/hailSign/windSign | MMM-SPCOutlook.js | — | ✅ absent |

### Wind CIG Label Fix — Exact Change

**Current state (lines 75 and 86) — WRONG order:**
```javascript
// Line 75 (Day 1 wind):
if (this.spcrisk.day1.windRisk > 0) probRiskHTML += cigLabel(this.spcrisk.day1.windCig) + "<i class=\"wi wi-strong-wind\"></i> " + 100 * this.spcrisk.day1.windRisk + "%";

// Line 86 (Day 2 wind):
if (this.spcrisk.day2.windRisk > 0) probRiskHTML += cigLabel(this.spcrisk.day2.windCig) + "<i class=\"wi wi-strong-wind\"></i> " + 100 * this.spcrisk.day2.windRisk + "%";
```

**Target state — matches tor/hail pattern exactly:**
```javascript
// Line 75 (Day 1 wind) — FIXED:
if (this.spcrisk.day1.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day1.windCig) + 100 * this.spcrisk.day1.windRisk + "% ";

// Line 86 (Day 2 wind) — FIXED:
if (this.spcrisk.day2.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day2.windCig) + 100 * this.spcrisk.day2.windRisk + "% ";
```

**Three differences per line (all must change together):**
1. Icon moves to the front (before cigLabel)
2. Space removed from after `</i>` (no `</i> ` — just `</i>"`)
3. Trailing space added after `%` (from `+ "%"` to `+ "% "`)

**Note on spacing:** cigLabel() already returns a trailing space for non-zero tiers (e.g., `"① "`), and empty string for tier 0. The tor/hail pattern therefore produces `<icon>① 15% ` (icon, space from cigLabel, number, explicit trailing space) or `<icon>15% ` (icon, empty from cigLabel, number, explicit trailing space). After the fix, wind matches this exactly.

### Day 3 CIG Pattern Assessment

Day 3 currently uses: `this.spcrisk.day3.text + cigLabel(this.spcrisk.day3.cig)` (line 91).

Day 3 has no per-hazard breakdown — it displays a single risk text line with an overall CIG indicator appended. This pattern is intentionally different from Days 1-2 (where CIG is per-hazard, inline with icon and percentage). The Day 3 pattern is correct as-is — the CONTEXT.md notes this explicitly as acceptable ("may not apply"). No change required; note as clean in verification.

### Regression Check Scope (Phase 3-5 Touch Points)

The QUAL-01 refactor (Phase 5) extracted the Day 1–2 per-hazard fetch-evaluate logic into `fetchAndEvaluateHazard()`. This is the key Phase 3–5 touch point for CIG. The evidence to confirm in the regression section:

| Touch Point | What Changed | Evidence to Cite |
|-------------|-------------|-----------------|
| Phase 5 QUAL-01: `fetchAndEvaluateHazard()` | Extracted Days 1-2 per-hazard fetch+evaluate into shared function; CIG URL and cigComparator now passed as parameters | node_helper.js: function signature at ~311 accepts `cigUrl`, `cigComparator`, `cigToTier`; return `{ risk, cig, stale }` |
| Phase 5 QUAL-01: Day 1-2 call sites | 6 call sites (3×Day1, 3×Day2) each pass the correct CIG URL alongside the prob URL | node_helper.js: ~469-521, each destructures `{ risk: day1TorRisk, cig: day1TorCig, ... }` |
| Phase 4 caching: `fetchGeoJsonCached()` | CIG fetches now go through cache; stale-flag mechanism added | node_helper.js: `fetchAndEvaluateHazard` uses `fetchGeoJsonCached` at ~338; CIG cache written at ~349 |
| Phase 3 fire weather | No CIG interaction (fireWeather paths are separate from hazard paths) | Confirm: no cigLabel/cigToTier reference in fireWeather sections |

The v1.0-MILESTONE-AUDIT.md cross-phase wiring table already confirms these are all wired correctly with no CIG defects. The regression section cites the relevant line numbers.

### Anti-Patterns to Avoid

- **Writing verification claims without file:line evidence:** The document must be citable. Every "satisfied" claim needs a specific file + line number.
- **Claiming SPC-02 satisfied before fixing wind label:** The audit found INTEG-04 specifically affects SPC-02. The wind fix must precede or accompany the verification document.
- **Treating Day 3 as broken:** Day 3's different CIG placement is intentional and documented in both the Phase 2 plan and CONTEXT.md.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Verification format | Novel format | Follow the Phase 2 plan success_criteria sections verbatim as the checklist items | Those criteria are the source of truth for what SPC-01/SPC-02 require |
| Wind fix verification | Manual visual inspection | `node --check MMM-SPCOutlook.js` for syntax + grep to confirm new pattern | Consistent with all prior Phase 2 verification steps |

---

## Common Pitfalls

### Pitfall 1: Line Numbers Drift After Phase 5 Refactor
**What goes wrong:** Phase 2 plans cited original line numbers that Phase 5 moved.
**Why it happens:** QUAL-01 extracted ~100+ lines of per-hazard logic into `fetchAndEvaluateHazard()`, shifting everything below it.
**How to avoid:** Cite current line numbers (from reading the live file), not the line numbers in Phase 2 plans. The PLAN files reference pre-Phase-5 lines (e.g., "lines 368-399" for return objects) — those are now at different positions. Read node_helper.js directly to find current line numbers before writing verification evidence.

### Pitfall 2: Incomplete Wind Fix (Missing Trailing Space)
**What goes wrong:** Fix icon order but forget to add trailing `% ` space, leaving wind line without consistent spacing separator.
**Why it happens:** There are three changes per line (icon position, space-after-icon removal, trailing space addition) — easy to miss the third.
**How to avoid:** After the fix, grep to confirm both wind lines match the tor/hail pattern exactly including the `"% "` trailing space.

### Pitfall 3: SPC-02 Closed Before Wind Fix Applied
**What goes wrong:** Verification document says SPC-02 is satisfied, but the cosmetic defect is still present.
**Why it happens:** Writing the document before fixing the code.
**How to avoid:** Apply the wind label fix first (or in the same plan wave), then write the verification citing the fixed line numbers.

### Pitfall 4: Regression Section Becomes Too Large
**What goes wrong:** Planner adds too many regression checks, scope-creeps into re-verifying all of Phase 3-5.
**Why it happens:** Misinterpreting "regression check" as full re-verification.
**How to avoid:** The regression section should be 3-5 items covering only CIG-specific code paths touched by Phase 3-5. The audit already confirmed there are no CIG defects — cite the audit findings as supporting evidence.

---

## Code Examples

### Correct Tor/Hail Pattern (Day 1 reference — DO NOT CHANGE)
```javascript
// Source: MMM-SPCOutlook.js lines 73-74 (current, correct)
if (this.spcrisk.day1.torRisk > 0) probRiskHTML += "<i class=\"wi wi-tornado\"></i>" + cigLabel(this.spcrisk.day1.torCig) + 100 * this.spcrisk.day1.torRisk + "% ";
if (this.spcrisk.day1.hailRisk > 0) probRiskHTML += "<i class=\"wi wi-meteor\"></i>" + cigLabel(this.spcrisk.day1.hailCig) + 100 * this.spcrisk.day1.hailRisk + "% ";
```

### Wind Lines After Fix (target state)
```javascript
// Source: CONTEXT.md — target pattern for lines 75 and 86
if (this.spcrisk.day1.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day1.windCig) + 100 * this.spcrisk.day1.windRisk + "% ";
if (this.spcrisk.day2.windRisk > 0) probRiskHTML += "<i class=\"wi wi-strong-wind\"></i>" + cigLabel(this.spcrisk.day2.windCig) + 100 * this.spcrisk.day2.windRisk + "% ";
```

### fetchAndEvaluateHazard Signature (Phase 5 refactor — for regression evidence)
```javascript
// Source: node_helper.js ~311 (current)
async fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator, cigToTier) {
  // returns { risk: number, cig: number, stale: boolean }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Phase 2 plans as proof of completion | VERIFICATION.md with file:line evidence | Phase 6 adds | Formally closes SPC-01/SPC-02 |
| Per-hazard inline CIG fetch in getSpcOutlook() | `fetchAndEvaluateHazard()` shared helper | Phase 5 QUAL-01 | CIG URLs are now parameters, not inline constants — regression check must confirm wiring |
| Wind CIG label before icon | Wind CIG label after icon (matches tor/hail) | Phase 6 fix | Structural consistency across all 6 hazard display lines on Days 1-2 |

---

## Open Questions

1. **Exact current line numbers for node_helper.js evidence**
   - What we know: Phase 2 plans cited pre-Phase-5 line numbers. Phase 5 QUAL-01 refactored getSpcOutlook() significantly.
   - What's unclear: Exact current line numbers for cigToTier (~396), return objects (~648/802), etc. — approximate ranges confirmed from grep output.
   - Recommendation: When authoring 02-VERIFICATION.md, read node_helper.js directly and use exact current line numbers. The grep output in this research provides approximate ranges that will be close enough to find the exact lines.

2. **Day 3 CIG pattern — document as-is or standardize?**
   - What we know: CONTEXT.md explicitly says Day 3 pattern (cigLabel appended after text) may be acceptable as-is because Day 3 has no per-hazard breakdown.
   - What's unclear: Whether the planner should include a Day 3 audit task.
   - Recommendation: Include a brief Day 3 audit step in the wind-fix task (read line 91, confirm it follows the established Day 3 pattern from Phase 2 Plan 02, note as clean if unchanged). No fix expected.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | None — no automated test framework (Out of Scope per REQUIREMENTS.md) |
| Config file | none |
| Quick run command | `node --check /home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/MMM-SPCOutlook.js` |
| Full suite command | `node --check /home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/MMM-SPCOutlook.js && node --check /home/kcreasey/OneDrive/Projects/weather/MMM-SPCOutlook/node_helper.js` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SPC-01 | Backend CIG fetch/extract/return verified via evidence document | documentation | n/a — no code changes for SPC-01 | ✅ node_helper.js exists |
| SPC-02 | Wind CIG label order matches tor/hail pattern; cigLabel() present | syntax + grep | `node --check MMM-SPCOutlook.js && grep -n "wi-strong-wind" MMM-SPCOutlook.js` | ✅ MMM-SPCOutlook.js exists |

### Sampling Rate
- **Per task commit:** `node --check MMM-SPCOutlook.js`
- **Per wave merge:** Full syntax check on both files
- **Phase gate:** Both files syntax-clean + 02-VERIFICATION.md authored before `/gsd:verify-work`

### Wave 0 Gaps
None — existing test infrastructure covers all phase requirements.

---

## Sources

### Primary (HIGH confidence)
- `MMM-SPCOutlook.js` — read directly; lines 40-91 confirmed; wind label defect on lines 75/86 confirmed
- `node_helper.js` — grep confirmed; cigToTier, cigComparator, fetchAndEvaluateHazard, all 6 call sites, both return objects confirmed present
- `.planning/phases/02-cig-tier-support/02-01-PLAN.md` — Phase 2 Plan 01 success_criteria (source of truth for SPC-01 verification checklist)
- `.planning/phases/02-cig-tier-support/02-02-PLAN.md` — Phase 2 Plan 02 success_criteria (source of truth for SPC-02 verification checklist)
- `.planning/phases/02-cig-tier-support/02-01-SUMMARY.md` — confirms Plan 01 tasks executed and SPC-01 requirement completed
- `.planning/phases/02-cig-tier-support/02-02-SUMMARY.md` — confirms Plan 02 tasks executed and SPC-02 requirement completed
- `.planning/v1.0-MILESTONE-AUDIT.md` — confirms INTEG-04 wind label defect; cross-phase wiring table confirms no CIG defects elsewhere

### Secondary (MEDIUM confidence)
- `.planning/phases/06-verify-phase2/06-CONTEXT.md` — user-locked exact target pattern for wind fix

---

## Metadata

**Confidence breakdown:**
- Wind fix target pattern: HIGH — CONTEXT.md specifies exact before/after strings; current code confirmed via file read
- Verification document evidence: HIGH — all file:line references confirmed by direct file reads and grep
- Regression scope: HIGH — v1.0 audit already ran integration checker; cross-phase wiring confirmed clean
- Day 3 assessment: HIGH — both CONTEXT.md and Phase 2 Plan 02 document the pattern as intentional

**Research date:** 2026-03-11
**Valid until:** 2026-04-11 — file line numbers drift as code changes; re-verify before writing VERIFICATION.md if any edits occur to MMM-SPCOutlook.js or node_helper.js between research and planning
