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

## Milestone: v1.2 — QoL Enhancements

**Shipped:** 2026-05-03
**Phases:** 3 | **Plans:** 8 | **Duration:** ~8 days (2026-04-25 → 2026-05-03)

### What Was Built

- **Stale data indicator** (Phase 11): Backend `_isWithinStaleWindow` corrected to honor user-configured `updateInterval` via `GET_SPC_DATA` payload threading (fixed latent 60-min default bug); frontend `⚠ Stale — N minutes ago` indicator at top of module wrapper sourcing relative time from `_staleAsOf` via vendored `moment` global with `isFinite` guard and clock-skew short-circuit.
- **Proximity backend** (Phase 12): `computeProximity()` distance-weighted helper with linear 40 km falloff and boundary-safe strict cap via `turf.booleanPointInPolygon` pre-check; polygon→line cache memoization (`deriveLinesIfMissing`) for amortized O(1) per-render cost; additive `dayN.proximity` subtree emission for Day 1–3 categorical + per-hazard CIG, gated by `proximityWeighting` (default false) with strict-true coerce at destructure boundary.
- **Proximity frontend** (Phase 13): Inside-tier `→ ENH 0.7`, outside-tier `0.6 (near SLGT)`, per-hazard CIG glyphs (`①②③`), Day 3 dual-badge with semicolon separator inside colored span, noise-floor flicker suppression at `PROX_MIN_WEIGHT = 0.1`. All 10 wiring sites route through one `proximityBadge(prox, mode)` helper.
- **Default-off byte-identity invariant**: With `proximityWeighting: false` (default), DOM and payload shape are byte-identical to pre-v1.2; verified end-to-end via static analysis, behavioral simulation, and live MagicMirror² UAT.

### What Worked

- **Backend before frontend sequencing** (Phase 12 → 13) meant the frontend had a stable contract to render against. No payload-shape thrashing during Phase 13 wiring.
- **Stale phase shipped first** (Phase 11) closed a latent bug independently of the larger proximity work, delivering value standalone and decoupling the two efforts.
- **One centralizing helper for badge formatting** (`proximityBadge`) — 10 frontend call sites all route through one function, so noise floor (D-13), 1-decimal rounding (D-04), CIG glyph mapping, and inside/outside form selection live in one place.
- **Explicit default-off byte-identity invariant** as a verification target meant every change was scrutinized for whether it preserved pre-v1.2 behavior. Caught the subtle issue where `buildProximitySubtree({all-null})` had to return `{}` not `{proximity: {}}` to keep the spread structurally inert.
- **`/gsd-audit-milestone` integration checker** re-verified all 6 cross-phase boundaries WIRED and all 5 E2E flows PASS without re-running the per-phase verifiers.
- **`/gsd-verify-work` for Phase 13** confirmed the human_needed live items (default-off DOM byte-identity, on-mode badge readability, noise-floor flicker suppression) in a single conversational session.

### What Was Inefficient

- **Phase 11 shipped without VERIFICATION.md** — same root-cause as v1.0's Phase 2 retroactive verification. The post-execute verifier wasn't yet in the standard chain when Phase 11 ran. Caught by `/gsd-audit-milestone`, backfilled retroactively via direct `gsd-verifier` invocation (no slash command exists for that operation).
- **Bookkeeping debt at session interruption** — Phase 13 finished implementation cleanly but the session ran out of credits during the wrap-up step. ROADMAP.md progress table, REQUIREMENTS.md checkboxes, SUMMARY frontmatter `requirements_completed`, and `13-VERIFICATION.md` commit all accumulated as drift. `/gsd-progress` and `/gsd-audit-milestone` surfaced the gaps cleanly, but each one was a separate manual fix.
- **`SUMMARY.md` `requirements_completed: []` empty for all three Phase 13 plans** — the executor agent didn't populate the frontmatter even though the plan-level `<requirements>` were stated. This is a small lint-level gap that the milestone audit caught only via 3-source cross-reference.
- **Nyquist validation gate was on but not applicable** — `workflow.nyquist_validation: true` (default) flagged 3 phases as MISSING during the audit, but REQUIREMENTS.md explicitly out-of-scopes automated test framework. Resolved by setting the project config to `false`. Should have been disabled at project init given the manual-UAT-only verification strategy.

### Patterns Established

- **Retroactive VERIFICATION.md backfill via direct agent invocation** — when a phase ships without one, spawning `gsd-verifier` directly with explicit context (existing PLANs/SUMMARYs, integration-checker findings from milestone audit) produces a faithful artifact. No slash command exists for this operation; the agent is invoked through `Task()` directly.
- **Audit-then-cleanup-then-close cycle** — `/gsd-audit-milestone` first surfaces every gap, manual cleanup commits each fix atomically, then `/gsd-complete-milestone` runs against a clean tree. Better than trying to close with drift outstanding.
- **Default-off byte-identity as an opt-in feature invariant** — for any new opt-in feature, pin "with flag false, output is byte-identical to pre-feature" as a first-class verification target. Drives helpers to handle `undefined`/`null` cleanly via short-circuit, prevents structural payload changes from leaking into the disabled path.
- **`gsd-integration-checker`'s value scales with cross-phase work** — for v1.2's 3 tightly-coupled phases (11 stale, 12 backend, 13 frontend with shape contract), the integration checker re-verified contract compatibility, default-off invariance, and STALE×PROX coexistence in one pass. For v1.1's 3 sequential phases (8 verify → 9 backend → 10 display), it had less to add.
- **Live UAT can implicitly verify prior phases** — Phase 13's UAT (cold-start + module-loads-cleanly tests) implicitly exercised the Phase 11 stale render path on the live Pi. Acknowledged in `11-VERIFICATION.md` as lowering but not eliminating residual `human_needed` items.

### Key Lessons

1. **Disable Nyquist at project init when verification strategy is manual-UAT-only.** REQUIREMENTS.md should drive the `workflow.nyquist_validation` config; if "automated test framework" is in Out of Scope, set the gate to `false`. Otherwise every milestone audit flags MISSING phantom gaps.
2. **Make verifier the last task of every execute-phase, not an optional follow-up.** Phase 11 shipped without VERIFICATION.md because the post-execute verifier wasn't standard at the time. Required a direct agent invocation (no slash command) to backfill retroactively.
3. **Session-credit-loss recovery has a known shape: bookkeeping drift > code defects.** When a session is cut off during wrap-up, the code is usually fine; what's stale is the documentation/state files. `/gsd-progress` is the right first move, then a quick audit, then targeted cleanup commits.
4. **Pin "no slash command exists" gaps when discovered.** Backfilling VERIFICATION.md required raw `Task()` invocation. If this is a recurring need, consider proposing a `/gsd-backfill-verification <phase>` skill — but only if it stops being a one-off.
5. **Default-off byte-identity is the right invariant for opt-in features in long-lived modules.** Existing users on `proximityWeighting:false` (the vast majority) saw zero change. New users opting in get all the new behavior. This invariant let v1.2 ship without any compatibility shim.

### Cost Observations

- Model mix: Sonnet 4.6 (executor + verifier + integration checker + plan-checker); Opus 4.6 (planner)
- Sessions: ~3-4 (Phase 11 quick, Phase 12 single session, Phase 13 split across 2 sessions due to credit exhaustion mid-wrap-up)
- Notable: The post-credit-loss recovery (audit + 11-VERIFICATION backfill + UAT + cleanup commits + milestone close) was lighter than expected because the v1.2 work was already verified — the second session was almost entirely artifact reconciliation, not fresh verification.

---

## Cross-Milestone Trends

| Milestone | Phases | Plans | Unplanned Gaps | Nyquist Compliant |
|-----------|--------|-------|----------------|-------------------|
| v1.0 | 7 (5 planned + 2 gap-closure) | 13 | 2 (Ph6, Ph7) | 1/7 |
| v1.1 | 3 (all planned) | 3 | 0 | 0/3 |
| v1.2 | 3 (all planned) | 8 | 0 | n/a (gate disabled mid-milestone — manual UAT is the project's strategy) |
