---
phase: 1
slug: bug-fixes
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-04
---

# Phase 1 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test framework exists in this project |
| **Config file** | none |
| **Quick run command** | Manual inspection / `node -e "require('./node_helper.js')"` syntax check |
| **Full suite command** | Manual MagicMirror run on test system |
| **Estimated runtime** | ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** Syntax check — `node --check node_helper.js`
- **After every plan wave:** Manual review of affected logic paths
- **Before `/gsd:verify-work`:** Full manual test with MagicMirror running
- **Max feedback latency:** ~30 seconds for syntax check

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 1-01-01 | 01 | 1 | BUG-01 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |
| 1-01-02 | 01 | 1 | BUG-02 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |
| 1-01-03 | 01 | 1 | BUG-03 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |
| 1-01-04 | 01 | 1 | BUG-04 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test framework to install. Existing files cover all phase requirements.

*Existing infrastructure covers all phase requirements (syntax check via node --check).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| SIGN indicators show for Days 1-2 Tornado/Hail/Wind | BUG-01 | No test framework; requires live SPC data or mock | Load module when Day 1/2 SIGN risk is active; verify indicators appear |
| Day 8 shows correct risk value | BUG-02 | Requires extended mode + live/mock Day 8 data | Enable extended=true; verify Day 8 displays Day 8 (not Day 7) risk |
| Day 4-8 aggregate indicator activates | BUG-03 | Requires mock data for days 4-8 | Set any day4-8 risk; verify aggregate indicator shows |
| All overlapping MDs appear | BUG-04 | Requires location with multiple active MDs | Position in multi-MD area; verify all listed |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
