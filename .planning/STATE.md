---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: WPC & CPC Integration + Unified Day Report
status: planning
stopped_at: Phase 18 context gathered
last_updated: "2026-09-05T14:26:27.648Z"
last_activity: 2026-09-01
progress:
  total_phases: 7
  completed_phases: 4
  total_plans: 33
  completed_plans: 33
  percent: 57
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15 after v2.0 scoping)

**Core value:** Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.
**Current focus:** Phase 18 — merge, precedence & unified payload schema

## Current Position

Phase: 18
Plan: Not started
Status: Ready to plan
Last activity: 2026-09-01

Progress: [████▓░░░░░] 43%

## Performance Metrics

**Velocity (v1.0 + v1.1 + v1.2 baseline):**

- Total plans completed: 44
- v1.0: 7 phases, 13 plans (8 days)
- v1.1: 3 phases, 3 plans (1 day)
- v1.2: 3 phases, 8 plans, 17 tasks (~8 days, 36 commits)

**By Phase:** v2.0 Phase 14 — 7 plans (5 execution + 2 gap-closure), 3 code-review rounds, 34 fix commits across 2 fix passes.

v2.0 Phase 15 — 9 plans, 7 waves, 2 sessions. Probe suite 15 → 32 scenarios. Verifier PASSED 7/7
requirements, 3 Info findings, 0 blocking. Two live production defects found and fixed: the SPC MD
`http://` allowlist outage and the `getDom` no-risk gate that made MPD invisible.

**Recent Trend:** Phase 15 converged with zero rollbacks across 7 waves — worktree isolation plus a post-merge probe gate before any tracking write. Phase 14 needed three review rounds to converge. Rounds 1-2 reviewed at `standard` depth and each missed cross-file defects; round 3 at `deep` depth found the highest-severity issue in the phase (a total outage rendering as a confident all-clear). Use `--depth=deep` for phases that span node_helper.js and MMM-SPCOutlook.js together.

v2.0 Phase 17 P09 (2026-09-01) — mutation inventory + DATA-03 spot check + human UAT, 2 tasks, 3 files, ~45min plus an operator UAT window on live production hardware. Closes out Phase 17's plan-level work (9/9 plans executed); phase-level close remains the orchestrator's responsibility.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- v2.0 scoping: data sources widened to SPC + WPC + CPC; unified day report is the sole render path (no legacy fallback); default-off byte-identity invariant does not carry forward.
- **Mutation-proof every probe scenario individually (Phase 15 D-10, blocking).** A scenario can pass forever while proving nothing. Two distinct mechanisms produced this in Phase 15 and they present identically: (a) an assertion that observes nothing — 15-05's mutation yielded zero RED scenarios because the fixture never reached the render path; (b) a fixture that cannot express its own condition — 15-02's KMZ round-trip was vacuous because `adm-zip` sorts entries alphabetically, so the out-of-order entry under test never existed in the bytes. Required mechanism: break the exact line a scenario covers, confirm RED **with a diagnosable message**, restore. A scenario green under its own mutation is a fixture defect, not a pass. Cheap preventatives now proven in this suite: a **precondition guard** that throws if setup didn't produce the state under test, and a **control assertion** proving the gate isn't simply never firing.
- **Live verification of location-gated products requires temporarily moving `lat`/`lon`.** Waiting for a product to appear over the deployed coordinate is not viable: MPDs are regional and live 3–6h, and on 2026-08-24 four were issued and none covered the operator. Documented procedure: move the coordinate into an active polygon (verify with a point-in-polygon test against the live KMZ — a bounding-box check is not sufficient, Phoenix fell inside MPD_1122's bbox but outside its polygon), confirm the render, restore. This corrects an optimistic assumption in D-10.
- **WPC's `_final` filename suffix means "graphic finalized", NOT "expired".** Live-confirmed 2026-08-24: `MPD_1122_final.kmz` was active until 00:30Z while already named `_final`. `MPD_FILENAME_PATTERN` (`/^MPD_(\d+)_final\.kmz$/`) correctly requires it, and `MPD_latest.kmz` correctly fails to match so the same MPD isn't double-counted. Implementing `_final` as an expiry marker would have made MPD find nothing, ever, while appearing healthy.
- Roadmap sequencing (binding, from research + user decisions): CFG-02 payload-shape decoupling precedes all data-source phases; data sources land ERO → WSSI/MPD → Hazards Outlook → HeatRisk; merge/precedence logic (Phase 18) follows all data sources and is validated against live captured payloads; getDom() rewrite (Phase 19) is strictly last and single-purpose.
- [Phase 17-09]: HEAT-04 UAT accepted on fixture evidence (heatrisk-duplicate-validtime-keeps-latest-filedate) rather than live observation — upstream has never served a duplicate idp_validtime to observe
- [Phase 17-09]: PERF-01 corroborated live on deployed hardware: 10 consecutive new-product batch settled-in log lines over 3h15m uptime, wall clock tracking the slowest member (2275ms) rather than the summed member time (4392ms)

### Pending Todos

- Phase 14 IN-01..IN-08 (8 Info/CONVENTION findings) left unfixed — ERO palette sourcing, unused `dayNValidTime`, unescaped `innerHTML` (traced: no live XSS, bounded by the `includesFeat` filter), mutable registry exports, loose vs strict equality, duplicated day-indexed idioms, and two places the ERO day span is declared outside the registry. See 14-REVIEW.md.

### Blockers/Concerns

- RESOLVED (Phase 15 close): WSSI-03 out-of-season handling verified structurally and accepted. Phase 16/17 live seasonal data (fire weather, HeatRisk) still may only be fully UAT-verifiable in-season — structural verification remains the fallback per REQUIREMENTS.md quality notes.
- Phase 18 PERF-03 requires a real cold-cache latency measurement on target Raspberry Pi hardware before the milestone can close.
- Phase 14 left two defects deliberately unfixed as DEFERRED-BY-OWNER (single-instance deployment): `_geoJsonCache` is keyed by URL while storing location-resolved risk, and `SPC_DATA_RESULT` carries no instance correlation. Deep review independently confirmed neither is reachable with one instance at one fixed location. **Both become live defects the moment a second module instance or a second location is configured** — revisit before any multi-location work.
- Phase 14 introduced two helper-global fields sampled per run (`_unusableFeatureCount`, `_oldestStaleAt`) rather than threading values through ~25 call sites. They are safe only because CR-03's `_inFlight` guard makes chain overlap unreachable. If that guard is removed or bypassed in Phase 17's `Promise.all` parallelization, these must be revisited — PERF-01 is exactly the requirement that touches this.
- Phase 18 MERGE-01 (UTC valid-time window attribution) will consume `excessiveRain.dayNValidTime`, which has no consumer today. WR-07 made its winning-polygon scan correct, but the field is unexercised end-to-end until Phase 18.
- Phase 19 carries the milestone's highest regression risk (getDom() rewrite with no legacy fallback, no automated tests) — requires a full per-requirement-ID behavior-parity checklist per research's Display-Rewrite Risk finding.

## Deferred Items

Items acknowledged and carried forward from previous milestone close:

| Category | Item | Status | Deferred At |
|----------|------|--------|-------------|
| UX | Double-space/missing-space visual artifacts on proximity badge rows | Accepted, revisit if complaints arise | v1.2 close |
| Verification | Human runtime verification for extended fire weather rows (needs live fire season data) | Pending | v1.1 close |
| Scope | WSSI 4-component breakdown (WSSIX-01) | Deferred to v2.x | v2.0 scoping |
| Scope | Precedence-rule configurability, proximity for new products (MERGEX-01/02) | Deferred to v2.x | v2.0 scoping |
| Scope | National Flood Outlook (COVX-01) | Deferred to v2.x | v2.0 scoping |
| Correctness | Multi-instance cache/broadcast isolation (round-2 CR-01/CR-02) | Deferred — unreachable single-instance | Phase 14 close |
| Verification | UAT test 9 (two instances, two locations) | Skipped — not a realistic config for this deployment | Phase 14 close |
| Verification | Live in-season confirmation of HAZ-01's per-day Precipitation bucketing | Deferred — both Precipitation layers (4, 6) returned zero features nationwide on 2026-08-26; the 10 mutation-proven `hazards-*` scenarios built on synthetic fixtures stand as evidence | Phase 16 close |
| Verification | Live confirmation of D-04's full-window guard (a Precipitation feature spanning its layer's exact nominal window routes to the window band, not the day grid) | Deferred — same root cause: no live Precipitation feature exists to observe the guard against | Phase 16 close |
| Verification | Live observation of `idp_filedate` across a weekend, to settle the STACK/FEATURES cadence conflict and potentially tighten D-14's 84h threshold | Deferred — not observable mid-week (2026-08-26 is a Wednesday) | Phase 16 close |
| Verification | Phase 16 human UAT (ROADMAP success criteria C1–C5) on deployed MagicMirror hardware | APPROVED 2026-08-27 — C2, C3 and C4's Drought half observed PASS on the Pi; C1, C4's Flooding half and C5 recorded NOT OBSERVABLE (rows below) | Phase 16 close |
| Verification | Live confirmation of HAZ-04's Flooding half (Flooding labels present in a live payload and suppressed) | Deferred — Flooding labels ride inside the Precipitation layers, which returned zero features nationwide on both 2026-08-26 and 2026-08-27; `hazards-flooding-labels-never-appear-under-any-toggle` stands as evidence | Phase 16 close |
| Verification | Live Hazards-Outlook no-risk-gate behaviour (a window-band entry with every other product NONE must not render 'No Severe Weather Risk') | Not exercised — the 2026-08-27 UAT locations all carried other on-screen risk, and the SPC-quiet coordinate offered late in the session was not run; pinned by the two gate terms' mutation-proven probe scenarios. Same shape as the Phase 15 MPD-01 row above | Phase 16 close |
| Quality | Phase 14 IN-01..IN-08 (Info/CONVENTION findings) | Accepted | Phase 14 close |
| Verification | Live in-season WSSI confirmation (winter product, verified Aug) | Deferred in-season per D-10; 6 `wssi-*` scenarios stand as evidence | Phase 15 close |
| Verification | Live MPD-02 (two concurrent MPDs both rendering) | Not observable on demand; fixture-verified | Phase 15 close |
| Verification | Live MPD-01 no-risk-gate behaviour (advisory-only, all else NONE) | Not exercised by the 2026-08-24 live check — other risk was on screen; pinned by `frontend-advisory-only-is-not-an-all-clear` | Phase 15 close |
| Quality | Phase 15 F1: WSSI tiers above the D-09 floor unexercised (`WSSI_MODERATE/MAJOR/EXTREME_BODY` declared, unconsumed) | Accepted — floor boundary IS pinned, no per-tier branching exists | Phase 15 close |
| Quality | Phase 15 F2: dead helpers `kmzToKmlfilename` / `extractKmlFromKmz` (zero call sites) | Remove in a cleanup pass | Phase 15 close |
| Quality | Phase 15 F3: `wssi-zero-features-out-of-season` structurally-proven, not mutation-proven (no threshold exists to break) | Accepted, disclosed | Phase 15 close |

## Session Continuity

Last session: 2026-09-05T14:26:27.639Z
Stopped at: Phase 18 context gathered
Resume file: .planning/phases/18-merge-precedence-unified-payload-schema/18-CONTEXT.md
