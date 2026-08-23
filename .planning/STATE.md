---
gsd_state_version: 1.0
milestone: v2.0
milestone_name: WPC & CPC Integration + Unified Day Report
status: executing
stopped_at: Phase 14 complete
last_updated: "2026-08-23T00:00:00.000Z"
last_activity: 2026-08-23 -- Phase 14 closed (3 review rounds, 14 findings fixed, probe 15/15)
progress:
  total_phases: 6
  completed_phases: 1
  total_plans: 7
  completed_plans: 7
  percent: 17
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-08-15 after v2.0 scoping)

**Core value:** Accurately and efficiently tell the user if they're in a weather risk zone right now — no false negatives, no unnecessary CPU burn on the RPi.
**Current focus:** Phase 15 — wpc-winter-storm-severity-and-mesoscale-precipitation-discussion

## Current Position

Phase: 15 (wpc-winter-storm-severity-and-mesoscale-precipitation-discussion) — NOT STARTED
Plan: 0 of ? (Phase 14 closed 7/7)
Status: Phase 14 complete — ready to discuss Phase 15
Last activity: 2026-08-23 -- Phase 14 closed (3 review rounds, 14 findings fixed, probe 15/15)

Progress: [█▓░░░░░░░░] 17%

## Performance Metrics

**Velocity (v1.0 + v1.1 + v1.2 baseline):**

- Total plans completed: 27
- v1.0: 7 phases, 13 plans (8 days)
- v1.1: 3 phases, 3 plans (1 day)
- v1.2: 3 phases, 8 plans, 17 tasks (~8 days, 36 commits)

**By Phase:** v2.0 Phase 14 — 7 plans (5 execution + 2 gap-closure), 3 code-review rounds, 34 fix commits across 2 fix passes.

**Recent Trend:** Phase 14 needed three review rounds to converge. Rounds 1-2 reviewed at `standard` depth and each missed cross-file defects; round 3 at `deep` depth found the highest-severity issue in the phase (a total outage rendering as a confident all-clear). Use `--depth=deep` for phases that span node_helper.js and MMM-SPCOutlook.js together.

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table. Recent decisions affecting current work:

- v2.0 scoping: data sources widened to SPC + WPC + CPC; unified day report is the sole render path (no legacy fallback); default-off byte-identity invariant does not carry forward.
- Roadmap sequencing (binding, from research + user decisions): CFG-02 payload-shape decoupling precedes all data-source phases; data sources land ERO → WSSI/MPD → Hazards Outlook → HeatRisk; merge/precedence logic (Phase 18) follows all data sources and is validated against live captured payloads; getDom() rewrite (Phase 19) is strictly last and single-purpose.

### Pending Todos

- Phase 14 IN-01..IN-08 (8 Info/CONVENTION findings) left unfixed — ERO palette sourcing, unused `dayNValidTime`, unescaped `innerHTML` (traced: no live XSS, bounded by the `includesFeat` filter), mutable registry exports, loose vs strict equality, duplicated day-indexed idioms, and two places the ERO day span is declared outside the registry. See 14-REVIEW.md.

### Blockers/Concerns

- Phase 15 WSSI-03 (out-of-season empty-result handling) and Phase 16/17 live seasonal data (fire weather, HeatRisk) may only be fully UAT-verifiable in-season — structural verification is the fallback per REQUIREMENTS.md quality notes.
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
| Quality | Phase 14 IN-01..IN-08 (Info/CONVENTION findings) | Accepted | Phase 14 close |

## Session Continuity

Last session: 2026-08-23T00:00:00.000Z
Stopped at: Phase 14 complete — ready to discuss Phase 15
Resume file: .planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW-FIX.md
