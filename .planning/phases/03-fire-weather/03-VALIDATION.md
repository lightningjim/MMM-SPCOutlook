---
phase: 3
slug: fire-weather
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-05
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — no automated test framework exists in this project |
| **Config file** | none |
| **Quick run command** | `node --check node_helper.js && node --check MMM-SPCOutlook.js` |
| **Full suite command** | Manual MagicMirror run with fire weather zone configured |
| **Estimated runtime** | ~5 seconds (syntax), ~5 minutes (manual) |

---

## Sampling Rate

- **After every task commit:** `node --check node_helper.js && node --check MMM-SPCOutlook.js`
- **After every plan wave:** Manual review of Log.info output for fire weather fetch URLs and polygon evaluation
- **Before `/gsd:verify-work`:** Full manual test with MagicMirror running and lat/lon in known fire risk zone
- **Max feedback latency:** ~5 seconds for syntax check

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 3-01-01 | 03-01 | 1 | FIRE-01 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |
| 3-01-02 | 03-01 | 1 | FIRE-01, FIRE-02 | syntax + manual | `node --check node_helper.js` | ✅ | ⬜ pending |
| 3-02-01 | 03-02 | 2 | FIRE-03 | syntax + manual | `node --check node_helper.js && node --check MMM-SPCOutlook.js` | ✅ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None — no test framework to install. Existing files cover all phase requirements.

*Existing infrastructure covers all phase requirements (syntax check via node --check).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| GeoJSON fetched from SPC fire weather endpoints on update | FIRE-01 | No test framework; requires live network call | Check MagicMirror Log.info output for fire weather fetch URLs (day1fw_windrh, day1fw_dryt, day2fw_windrh, day2fw_dryt) |
| Point-in-polygon correctly fires for location in risk zone | FIRE-02 | Requires live SPC data or known-coordinates test | Configure lat/lon to a known fire risk area; verify console output shows non-zero fire weather risk |
| Fire weather risk visible on display when active | FIRE-03 | Requires MagicMirror display running with active fire zone | Confirm "Fire Wx" row appears on module with correct risk level (Elevated/Critical/Extreme) |
| No false negative when only fire weather is active (no convective risk) | FIRE-01, FIRE-03 | Requires specific data conditions | Confirm module does NOT show "No Severe Weather Risk" when fire weather is active but no convective risk exists |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 30s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
