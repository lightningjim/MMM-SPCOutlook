---
phase: 5
slug: code-quality
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-08
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — automated testing explicitly out of scope per REQUIREMENTS.md |
| **Config file** | none |
| **Quick run command** | N/A |
| **Full suite command** | N/A |
| **Estimated runtime** | N/A |

---

## Sampling Rate

- **After every task commit:** Run grep verification commands below to confirm no regressions
- **After every plan wave:** Full manual code review
- **Before `/gsd:verify-work`:** All grep checks must return empty output
- **Max feedback latency:** N/A (manual only)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| QUAL-01 task | TBD | TBD | QUAL-01 | grep | `grep -n "day1TorRisk\|day2TorRisk" node_helper.js \| grep -v "const\|fetchAndEvaluateHazard"` | N/A | ⬜ pending |
| QUAL-02 task | TBD | TBD | QUAL-02 | grep | `grep -n '\bvar\b' node_helper.js MMM-SPCOutlook.js` | N/A | ⬜ pending |
| QUAL-03 task | TBD | TBD | QUAL-03 | grep | `grep -n '^\s*//Log\|^\s*// var\|^\s*//var' node_helper.js` | N/A | ⬜ pending |
| QUAL-04 task | TBD | TBD | QUAL-04 | grep | `grep -n 'console\.' node_helper.js MMM-SPCOutlook.js` | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None required — no test infrastructure will be added in this phase per project scope.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| fetchAndEvaluateHazard replaces 6 duplicate blocks | QUAL-01 | Code review | Search node_helper.js for the 6 call sites; confirm each returns { risk, cig }; confirm no standalone Day1/Day2 hazard fetch blocks remain |
| No implicit globals | QUAL-02 | No static analysis tool | Code review: scan node_helper.js for declarations without const/let/var (bare assignments at function scope) |
| No commented-out code blocks remain | QUAL-03 | Code review | Read through node_helper.js; confirm only prose/JSDoc comments remain — no disabled code |
| Log.info in MMM-SPCOutlook.js displays correctly | QUAL-04 | Runtime | Start MagicMirror; confirm Log.info lines appear in MagicMirror console (not missing, not erroring) |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < N/A (manual + grep)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
