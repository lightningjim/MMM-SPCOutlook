---
phase: 7
slug: fix-qual-residuals
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 7 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | None — no test infrastructure (Out of Scope per REQUIREMENTS.md) |
| **Config file** | None |
| **Quick run command** | See grep spot-checks below |
| **Full suite command** | See grep spot-checks below |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Run the grep spot-checks for that task's requirement
- **After every plan wave:** Run all grep checks + `node --check node_helper.js`
- **Before `/gsd:verify-work`:** All grep checks return no output; `node --check` passes
- **Max feedback latency:** ~5 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 7-01-01 | 01 | 1 | QUAL-02 | manual grep | `grep -n 'result =' node_helper.js` — confirm no bare assignment at line 104 | N/A | ⬜ pending |
| 7-01-02 | 01 | 1 | QUAL-03 | manual grep | `grep -n 'evaluatePolygonsWeighted\|evaluatePolygonsContinuous' node_helper.js` — should return no output | N/A | ⬜ pending |
| 7-01-03 | 01 | 1 | QUAL-03 | manual grep | `grep -n 'checkDayCat\|checkDayPerc\|checkDaySign' node_helper.js` — should return no output | N/A | ⬜ pending |
| 7-01-04 | 01 | 1 | QUAL-02/03 | manual | `node --check node_helper.js` — must exit 0 (valid JS) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test infrastructure is planned for this project. All verification is grep spot-checks and syntax validation.

*Existing infrastructure covers all phase requirements.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| `result =` fixed to `const result =` at line 104 | QUAL-02 | No test framework | `grep -n 'result =' node_helper.js` — confirm no bare assignment without `const`/`let` |
| No implicit globals remain in production path | QUAL-02 | No test framework | `grep -n '\bvar\b' node_helper.js` — should return no output |
| `evaluatePolygonsWeighted` absent | QUAL-03 | No test framework | `grep -n 'evaluatePolygonsWeighted' node_helper.js` — should return no output |
| `evaluatePolygonsContinuous` absent | QUAL-03 | No test framework | `grep -n 'evaluatePolygonsContinuous' node_helper.js` — should return no output |
| `checkDayCat/checkDayPerc/checkDaySign` blocks absent | QUAL-03 | No test framework | `grep -n 'checkDayCat\|checkDayPerc\|checkDaySign' node_helper.js` — should return no output |
| Module closing `});` intact (valid JS) | QUAL-03 | No test framework | `node --check node_helper.js` — must exit 0 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
