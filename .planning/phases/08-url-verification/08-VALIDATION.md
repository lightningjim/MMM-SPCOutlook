---
phase: 8
slug: url-verification
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-21
---

# Phase 8 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | none — verification phase (HTTP checks + file inspection) |
| **Config file** | none |
| **Quick run command** | `curl -s -o /dev/null -w "%{http_code}" <url>` |
| **Full suite command** | manual HTTP checks per PLAN.md task |
| **Estimated runtime** | ~2 minutes |

---

## Sampling Rate

- **After every task commit:** Review HTTP response codes and documented findings
- **After every plan wave:** Verify artifact written to phase directory
- **Before `/gsd:verify-work`:** Findings file must exist with all 12 URLs documented
- **Max feedback latency:** immediate (HTTP checks are synchronous)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 8-01-01 | 01 | 1 | FWXT-05 | manual | `curl -s -o /dev/null -w "%{http_code}" https://www.spc.noaa.gov/products/exper/fire_wx/day3fw_windrhcat.lyr.geojson` | ✅ | ⬜ pending |
| 8-01-02 | 01 | 1 | FWXT-05 | manual | inspect GeoJSON properties | ✅ | ⬜ pending |
| 8-01-03 | 01 | 1 | FWXT-05 | file | `test -f .planning/phases/08-url-verification/08-URL-FINDINGS.md` | ❌ W0 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `.planning/phases/08-url-verification/08-URL-FINDINGS.md` — created by executor with all 12 URL results and schema findings

*If none: "Existing infrastructure covers all phase requirements."*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| All 12 Day 3–8 URLs return HTTP 200 | FWXT-05 | Live HTTP check against SPC servers | `curl -s -o /dev/null -w "%{http_code}" <url>` for each |
| GeoJSON LABEL property confirmed as "D3"–"D8" | FWXT-05 | Requires live data inspection | `curl <url> | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['features'][0]['properties'])"` |
| DN property confirmed (5=Elevated, 8=Critical, 10=Extremely Critical) | FWXT-05 | Requires live data with active fire wx | Inspect any active fire weather day GeoJSON |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 120s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
