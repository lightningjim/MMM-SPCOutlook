---
phase: 4
slug: performance
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-07
---

# Phase 4 — Validation Strategy

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

- **After every task commit:** Code review — confirm no regression in polygon evaluation logic
- **After every plan wave:** Manual log inspection via MagicMirror console output
- **Before `/gsd:verify-work`:** Manual verification of both PERF-01 and PERF-02 behaviors
- **Max feedback latency:** N/A (manual only)

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| PERF-01 cache | TBD | TBD | PERF-01 | manual | N/A | ❌ | ⬜ pending |
| PERF-02 dedup | TBD | TBD | PERF-02 | manual | N/A | ❌ | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

None required — no test infrastructure will be added in this phase per project scope.

*Existing infrastructure covers all phase requirements (manual verification only).*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Cache hit on consecutive identical GeoJSON | PERF-01 | No test infra (out of scope) | 1. Enable cache-hit Log.info in node_helper. 2. Trigger two consecutive update cycles without SPC issuing a new outlook. 3. Confirm second cycle logs "cache hit" and does not call evaluatePolygons. |
| No duplicate turf calls per cycle | PERF-02 | No test infra (out of scope) | 1. Code review: confirm extractPolygons called once per GeoJSON URL per getSpcOutlook() invocation. 2. Inspect Days 4-8 block — each day should call extractPolygons once for both risk and SIGN from a single pass. |
| sigComparator defined before use | Bug fix | Static analysis | Code review: confirm sigComparator is defined before the Days 4-8 SIGN evaluation branches that reference it. |
| Stale fallback served on fetch failure | PERF-01 behavioral | No test infra | Temporarily point a URL to an invalid endpoint. Confirm the module serves the last cached result with a staleness indicator, not a blank/error. |
| Location change invalidates cache | PERF-01 behavioral | No test infra | Change lat/lon in config, restart module. Confirm first cycle runs full turf (no cache hit). |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < N/A (manual)
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
