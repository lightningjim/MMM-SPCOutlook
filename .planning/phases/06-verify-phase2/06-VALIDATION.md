---
phase: 6
slug: verify-phase2
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-11
---

# Phase 6 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test infrastructure in project |
| **Config file** | none |
| **Quick run command** | manual inspection |
| **Full suite command** | manual inspection |
| **Estimated runtime** | ~1 minute |

---

## Sampling Rate

- **After every task commit:** Grep verification (see Per-Task map below)
- **After every plan wave:** Manual review of changed files
- **Before `/gsd:verify-work`:** All manual verifications complete
- **Max feedback latency:** ~30 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 6-01-01 | 01 | 1 | SPC-02 (INTEG-04) | grep | `grep -n "windCig\|wi-strong-wind" MMM-SPCOutlook.js` | ✅ | ⬜ pending |
| 6-02-01 | 02 | 2 | SPC-01, SPC-02 | manual | inspect .planning/phases/02-cig-tier-support/02-VERIFICATION.md | ✅ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/phases/02-cig-tier-support/02-VERIFICATION.md` — must be created by Plan 02

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Wind CIG label appears after icon, not before | SPC-02 / INTEG-04 | No test framework | grep MMM-SPCOutlook.js lines 75, 86 — confirm icon tag precedes cigLabel call |
| 02-VERIFICATION.md confirms SPC-01 satisfied | SPC-01 | Doc creation task | Read file, confirm SPC-01 checklist items pass with file+line evidence |
| 02-VERIFICATION.md confirms SPC-02 satisfied | SPC-02 | Doc creation task | Read file, confirm SPC-02 checklist items pass with file+line evidence |
| Regression: Phase 3–5 CIG wiring intact | SPC-01, SPC-02 | Doc creation task | Verify regression section of 02-VERIFICATION.md cites fetchAndEvaluateHazard and cache integration |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
