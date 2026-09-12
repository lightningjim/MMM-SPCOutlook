# Roadmap: MMM-SPCOutlook

## Milestones

- ✅ **v1.0 Refactor and Feature Update** — Phases 1–7 (shipped 2026-03-12)
- ✅ **v1.1 Fire Wx Outlook Expansion** — Phases 8–10 (shipped 2026-03-21)
- ✅ **v1.2 QoL Enhancements** — Phases 11–13 (shipped 2026-05-03)
- ✅ **v2.0 WPC & CPC Integration + Unified Day Report** — Phases 14–19.1 (shipped 2026-09-12)

## Phases

<details>
<summary>✅ v1.0 Refactor and Feature Update (Phases 1–7) — SHIPPED 2026-03-12</summary>

- [x] Phase 1: Bug Fixes (2/2 plans) — completed 2026-03-04
- [x] Phase 2: CIG Tier Support (2/2 plans) — completed 2026-03-05
- [x] Phase 3: Fire Weather (2/2 plans) — completed 2026-03-05
- [x] Phase 4: Performance (1/1 plan) — completed 2026-03-08
- [x] Phase 5: Code Quality (4/4 plans) — completed 2026-03-09
- [x] Phase 6: Verify Phase 2 (1/1 plan) — completed 2026-03-11
- [x] Phase 7: Fix QUAL-02/QUAL-03 Residuals (1/1 plan) — completed 2026-03-11

Full details: `.planning/milestones/v1.0-ROADMAP.md`

</details>

<details>
<summary>✅ v1.1 Fire Wx Outlook Expansion (Phases 8–10) — SHIPPED 2026-03-21</summary>

- [x] Phase 8: URL Verification (1/1 plan) — completed 2026-03-21
- [x] Phase 9: Backend Implementation (1/1 plan) — completed 2026-03-21
- [x] Phase 10: Display Implementation (1/1 plan) — completed 2026-03-21

Full details: `.planning/milestones/v1.1-ROADMAP.md`

</details>

<details>
<summary>✅ v1.2 QoL Enhancements (Phases 11–13) — SHIPPED 2026-05-03</summary>

- [x] Phase 11: Stale Data Indicator (2/2 plans) — completed 2026-04-25
- [x] Phase 12: Proximity Backend Foundation (3/3 plans) — completed 2026-05-02
- [x] Phase 13: Proximity Frontend Render (3/3 plans) — completed 2026-05-03

Full details: `.planning/milestones/v1.2-ROADMAP.md`

</details>

<details>
<summary>✅ v2.0 WPC & CPC Integration + Unified Day Report (Phases 14–19.1) — SHIPPED 2026-09-12</summary>

- [x] Phase 14: Foundation & WPC Excessive Rainfall Outlook (7/7 plans) — completed 2026-08-23
- [x] Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion (9/9 plans) — completed 2026-08-24
- [x] Phase 16: WPC Day 3–7 / CPC Day 8–14 Hazards Outlook (8/8 plans) — completed 2026-08-27
- [x] Phase 17: NWS/WPC HeatRisk & Parallelized Fetching (9/9 plans) — completed 2026-09-01
- [x] Phase 18: Merge, Precedence & Unified Payload Schema (16/16 plans) — completed 2026-09-06
- [x] Phase 19: Unified Day Report — getDom() Rewrite (9/9 plans) — completed 2026-09-07
- [x] Phase 19.1: Day Report Render Width, Product-Neutral Copy & Config Key Validation (INSERTED) (9/9 plans) — completed 2026-09-12

Full details: `.planning/milestones/v2.0-ROADMAP.md`

</details>

### 📋 Next Milestone (Not Yet Defined)

Run `/bm:new-milestone` to scope the next version.

## Progress

| Phase | Milestone | Plans Complete | Status | Completed |
|-------|-----------|----------------|--------|-----------|
| 1–7 | v1.0 | 13/13 | Complete | 2026-03-12 |
| 8–10 | v1.1 | 3/3 | Complete | 2026-03-21 |
| 11–13 | v1.2 | 8/8 | Complete | 2026-05-03 |
| 14–19.1 | v2.0 | 67/67 | Complete | 2026-09-12 |

## Backlog

*Empty. The two prior entries were cleared on 2026-09-06 via `/bm:review-backlog`:*

- *999.1 (Phase 16 follow-ups) — nine of its ten findings were verified closed in current source by Phases 17/18 (evidence is in the `/bm:review-backlog` commit message and each fix's own source comments); the surviving finding, IN-01, was folded into Phase 19's carried-in scope.*
- *999.2 (Phase 18 payload-metadata + renderer follow-ups) — folded into Phase 19's carried-in scope, since Phase 19 is the first consumer of both items.*

