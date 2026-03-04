---
phase: 2
slug: cig-tier-support
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 2 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test framework exists in this project |
| **Config file** | none |
| **Quick run command** | `node --check node_helper.js && node --check MMM-SPCOutlook.js` |
| **Full suite command** | Manual MagicMirror run on test system |
| **Estimated runtime** | ~5 seconds (syntax), ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** `node --check node_helper.js && node --check MMM-SPCOutlook.js`
- **After every plan wave:** Manual review of affected logic paths
- **Before `/gsd:verify-work`:** Full manual test with MagicMirror running
- **Max feedback latency:** ~5 seconds for syntax check

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 2-01-01 | 02-01 | 1 | SPC-01 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |
| 2-01-02 | 02-01 | 1 | SPC-01 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |
| 2-02-01 | 02-02 | 2 | SPC-02 | syntax + manual | `node --check node_helper.js && node --check MMM-SPCOutlook.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test framework to install. Existing files cover all phase requirements.

*Existing infrastructure covers all phase requirements (syntax check via node --check).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Backend parses CIG1/CIG2/CIG3 as distinct tiers | SPC-01 | No test framework; requires live SPC data or mock | Check node_helper.js logs when CIG data is active; verify torCig/hailCig/windCig return 1, 2, or 3 |
| Display renders CIG tiers visually distinct | SPC-02 | Requires MagicMirror display running | Confirm CIG1/CIG2/CIG3 show distinct visual indicators on module |
| Days 1 and 2 both work correctly | SPC-01 | Requires data for both days | Verify CIG parsing works identically for day1 and day2 endpoints |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
