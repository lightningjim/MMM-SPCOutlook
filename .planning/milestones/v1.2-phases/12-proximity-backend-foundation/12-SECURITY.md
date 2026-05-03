---
phase: 12
slug: proximity-backend-foundation
status: verified
threats_open: 0
asvs_level: 1
created: 2026-05-02
---

# Phase 12 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| frontend → node_helper (socket) | `proximityWeighting` flag arrives over the existing `GET_SPC_DATA` channel — same surface as `lat/lon/extended/updateInterval`. No new attack surface introduced by this phase. | Boolean flag (non-sensitive) |
| SPC GeoJSON network → polys/lines cache | Polygon coordinates from the SPC GeoJSON endpoint are already trusted (existing surface from prior phases). Adding `polys` + `lines` to the cache entry does not change the threat model. | Public-source polygon geometry |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-12-01 | T (Tampering) | `computeProximity` weight calculation | mitigate | Strict cap below 1 enforced by **two** belt-and-suspenders gates: `booleanPointInPolygon` early-return at `node_helper.js:152` and `if (!(dKm > 0)) return;` at `node_helper.js:163`. Both fire before `weight = Math.max(0, 1 - dKm / 40)` at line 165 — weight=1 unreachable. | closed |
| T-12-02 | D (DoS) | per-render turf cost (helper) | mitigate | `computeProximity` body (`node_helper.js:142-176`) contains **no** `turf.polygonToLine` call. Helper consumes pre-derived `item.line` via `turf.pointToLineDistance` only (line 158). Per-render cost is O(n_higher_tier) point-to-line calls. | closed |
| T-12-03 | T (Tampering) | `proximityWeighting` payload field | mitigate | Strict-true coerce at `node_helper.js:43`: `this._proximityWeighting = proximityWeighting === true;` inside the `GET_SPC_DATA` branch of `socketNotificationReceived`. Rejects all truthy non-boolean values (string, number, object, `1`). Only literal `true` enables proximity. | closed |
| T-12-04 | I (Information disclosure) | `proximityWeighting` flag value | accept | Flag value is not sensitive; subtree presence reveals only feature-on state. No PII / no auth surface. | closed (accepted) |
| T-12-05 | T (Tampering) | crafted polygon producing weight = 1 | mitigate | Inherits T-12-01's two gates from the same helper body (`node_helper.js:152, 163`). Verified all 10 `this.computeProximity` call sites (lines 364, 382, 511, 528, 575, 592, 638, 655, 696, 710): each assigns the return directly to a per-hazard local; consumed only by `buildProximitySubtree` (lines 485-492), which preserves `{value, nextTier}` verbatim. No `Math.max(weight, 1)` or upward post-processing anywhere. | closed |
| T-12-06 | D (DoS) | per-render turf cost (cache amortization) | mitigate | `deriveLinesIfMissing` defined at `node_helper.js:187-197` (1 def + 5 cache-hit invocations at lines 363, 510, 574, 637, 695 — `grep -c` = 6). Helper writes `entry.lines` back to the cache; subsequent hits short-circuit on `if (entry.lines) return entry.lines;`. All 5 `polygonToLine` calls outside the helper sit in cache-MISS branches (lines 380, 526, 590, 653, 708) — none on the cache-hit path. PROX-05 O(1)-per-render after warmup satisfied. | closed |
| T-12-07 | I (Information disclosure) | proximity subtree in payload | accept | `dayN.proximity` only emitted when `this._proximityWeighting === true`; `buildProximitySubtree` returns `{}` when no resolved hazards exist (`node_helper.js:485-492`). Same-origin frontend; subtree contains no PII. | closed (accepted) |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-12-01 | T-12-04 | The `proximityWeighting` flag value is non-sensitive and reveals only that the feature is enabled. No PII, no auth surface, no exfiltration vector. | kcreasey (phase author) | 2026-05-02 |
| AR-12-02 | T-12-07 | The `dayN.proximity` payload subtree contains no PII (only weight value 0..<1 and nextTier label) and is gated behind the user-set `proximityWeighting` flag. Receiver is the same-origin MagicMirror frontend. | kcreasey (phase author) | 2026-05-02 |

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-05-02 | 7 | 7 | 0 | gsd-security-auditor (initial verification) |

### 2026-05-02 — Initial verification

Spawned `gsd-security-auditor` against the 7-threat register parsed from PLAN.md threat models (Plans 12-01, 12-02, 12-03). All 5 `mitigate` threats verified CLOSED with file:line evidence in `node_helper.js`; both `accept` threats logged. Plan-specified verification counters all pass (`computeProximity` count 13 ≥ 10, `_proximityWeighting` 17 ≥ 11, `deriveLinesIfMissing` 6 ≥ 6, `polys:` 5 ≥ 5, `lines:` 5 ≥ 5, `...buildProximitySubtree` 6 ≥ 6, `proximityWeighting` in `MMM-SPCOutlook.js` == 3). No SUMMARY.md `## Threat Flags` sections present — no unregistered surface. Robustness note: the strict cap on T-12-01/T-12-05 is enforced by *both* `booleanPointInPolygon` and `d_km > 0` rather than only the planned `d_km > 0`, hardening against turf's spherical-distance epsilon on boundary points.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-05-02
