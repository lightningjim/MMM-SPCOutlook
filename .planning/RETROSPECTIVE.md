# Project Retrospective

*A living document updated after each milestone. Lessons feed forward into future planning.*

---

## Milestone: v1.0 — Refactor and Feature Update

**Shipped:** 2026-03-12
**Phases:** 7 | **Plans:** 13 | **Duration:** 8 days (2026-03-04 → 2026-03-12)

### What Was Built

- Fixed 4 silent data bugs: SIGN double-arrow syntax, Day 8 return object, day48Risk OR condition, checkInPolygon early-return
- CIG1/CIG2/CIG3 tier support — SPC's new tiered SIGN severity displayed as ①②③
- Fire Weather Outlook detection and display — 4 NOAA endpoints, point-in-polygon, getDom() rows
- GeoJSON caching with ETag/SHA256 dual strategy — eliminates redundant turf calls on RPi
- `fetchAndEvaluateHazard` DRY refactor — 6 copy-paste blocks → 1 shared function
- Code quality pass: zero `var`, zero `console.`, dead code removed, JSDoc added

### What Worked

- **GSD verification workflow** caught a latent Phase 2 gap (no VERIFICATION.md) and two QUAL residuals post-Phase-5 that would have shipped silently. The multi-phase verify → audit → gap-closure loop worked exactly as designed.
- **Phased execution order** (bugs → features → performance → quality) meant each phase built on a known-good base. No feature rework needed because the bugs were fixed first.
- **ETag/SHA256 dual strategy** for caching was a clean design decision — leverages server infrastructure when available, falls back gracefully when not.
- **Integration checker** surfaced the stale-UI gap (backend produces `_stale` but frontend never consumes it) — a genuine observation neither the per-phase verifiers nor the phase plans would have caught in isolation.

### What Was Inefficient

- **Phase 6 was an unplanned gap closure** — Phase 2 completed without a VERIFICATION.md, only caught by the milestone audit at Phase 5. A verification gate per phase would prevent this.
- **Phase 7 was also unplanned** — QUAL-02/QUAL-03 residuals (implicit global, dead methods) in Phase 5 were not caught by Phase 5's own verification. The audit caught them post-facto. Root cause: verifier scanned for patterns stated in the plan but did not grep for all possible implicit globals beyond the planned targets.
- **Nyquist validation mostly skipped** — Only Phase 2 has `nyquist_compliant: true`. Writing validation strategies upfront but not executing them added document overhead without the testing benefit. Either skip the strategy docs or run them properly.
- **STATE.md was not kept current** — progress percent showed 50% despite all 7 phases being complete. The CLI tools update it, but manual edits during the workflow left stale values.

### Patterns Established

- **Decimal phases for gap closure**: Phases 6 and 7 were gap-closure phases triggered by the milestone audit. The GSD decimal-phase pattern would have been cleaner (e.g., `5.1` and `5.2`), but integer phases worked fine since they were added before the audit.
- **Integration checker as final gate**: Running the integration checker as part of audit (not execute-phase) correctly scoped it to cross-cutting concerns rather than per-phase correctness.
- **3-source requirements cross-reference** (VERIFICATION.md + SUMMARY.md frontmatter + REQUIREMENTS.md traceability) caught the SPC-01/SPC-02 orphan risk quickly.

### Key Lessons

1. **Write VERIFICATION.md during execute-phase, not retroactively.** Phase 2 shipping without one required an entire Phase 6 to close.
2. **Grep for all instances of a pattern, not just the ones in the plan.** Phase 5 verified its planned targets but missed `result =` at line 104 — an implicit global outside the original bug list.
3. **Stale data UI is a user-visible gap.** The backend correctly handles stale cache but never tells the user. Flag this early in requirements, not as a post-audit observation.
4. **Nyquist validation is all-or-nothing.** Writing draft strategies without executing them adds cost without value. Either commit to generating tests or skip the VALIDATION.md until ready.

### Cost Observations

- Model mix: Sonnet 4.6 throughout (executor + verifier + integration checker)
- Notable: Phase 6 (integration checker run) consumed the most tool calls (~33) due to full cross-file wiring trace across both JS files

---

## Milestone: v1.1 — Fire Wx Outlook Expansion

**Shipped:** 2026-03-21
**Phases:** 3 | **Plans:** 3 | **Duration:** 1 day

### What Was Built

- All 12 Day 3–8 SPC fire weather GeoJSON endpoints confirmed live; DN-based parsing strategy documented (LABEL encodes day ID, DN encodes risk level)
- `getSpcOutlook()` extended with fetch loop for Day 3–8 WindRH + DryT endpoints, populating `day3Risk`–`day8Risk` in both extended and non-extended return paths
- `getDom()` extended with per-day conditional rows via `for (let d = 3; d <= 8; d++)` loop; no-risk guard updated to cover all 8 fire weather days

### What Worked

- **Phase 8 URL verification before coding** was essential — the GeoJSON schema was non-obvious (DN encodes risk, not LABEL) and would have caused a silent data bug if discovered mid-implementation.
- **3-phase decomposition** (verify → backend → display) kept each phase's scope small and reviewable. Phase 9 had no UI concerns; Phase 10 had no fetch concerns.
- **Reusing existing patterns** (`fetchGeoJsonCached`, `fireRiskToColor`, `fireWeather` object shape) made v1.1 a pure extension — no structural changes, no regressions.

### What Was Inefficient

- **Human runtime verification not possible in off-season** — Phase 10 shipped with `human_needed` on the visual rendering check. Structural verification passed but live testing requires active fire weather polygons in the user's region.
- **Skipped research for Phase 10** — reasonable call given it was pure display code, but the discuss-phase context captured all necessary decisions upfront. The discuss-phase investment in Phase 9 paid for itself.

### Patterns Established

- **Verify schema before implementing** — URL verification as a standalone phase (not a task in Phase 9) surfaced the DN-vs-LABEL schema surprise before any code was written. This is a reusable pattern for any phase that consumes a new external API or data format.
- **discuss-phase locks decisions that would otherwise be re-litigated** — Phase 10 CONTEXT.md had 6 locked decisions (label format, color reuse, loop vs explicit, placement). None were revisited during execution.

### Key Lessons

1. **External API schema inspection is a phase, not a task.** Embedding URL verification inside the backend phase would have delayed the schema discovery. A dedicated phase with its own verification artifact is worth the overhead.
2. **Off-season features need synthetic test paths.** Day 3–8 fire weather rows are only visible when a polygon covers the user's location during active fire weather season. Static verification confirmed the code; live testing requires timing or a fixture.

### Cost Observations

- Model mix: Sonnet 4.6 (executor + verifier + plan-checker); Opus 4.6 (planner)
- Notable: v1.1 executed faster than any v1.0 phase — 3 phases in 1 day vs. 8 days for 7 phases. Smaller scope + prior codebase familiarity from v1.0 context.

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Unplanned Gaps | Nyquist Compliant |
|-----------|--------|-------|----------------|-------------------|
| v1.0 | 7 (5 planned + 2 gap-closure) | 13 | 2 (Ph6, Ph7) | 1/7 |
| v1.1 | 3 (all planned) | 3 | 0 | 0/3 |
