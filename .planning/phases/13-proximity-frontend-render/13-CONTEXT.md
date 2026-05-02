# Phase 13: Proximity Frontend Render - Context

**Gathered:** 2026-05-02
**Status:** Ready for planning

<domain>
## Phase Boundary

Render adjacent-tier proximity badges inline with existing risk text on Day 1/2/3 categorical and per-hazard CIG rows in `MMM-SPCOutlook.js getDom()`, gated on the new `proximityWeighting` config flag. The frontend consumes the `dayN.proximity` subtree that Phase 12 already emits — this phase is purely render-side.

In scope:
- Frontend rendering of inside-tier (`→ NEXT W.W`) and outside-tier (`W.W (near TIER)`) categorical proximity badges on Day 1/2/3 rows.
- Per-hazard CIG proximity badges (Day 1/2 tor/hail/wind, Day 3 cig) rendered alongside existing `cigLabel` output.
- Outside-tier render policy: relax `risk == "NONE"` row gate, extend the umbrella "No Severe Weather Risk" check, suppress per-hazard CIG when its underlying probability row is absent.
- Noise threshold + visual treatment defaults (Claude's discretion — see below).
- Verification that the existing `proximityWeighting` flag plumbing (added in Phase 12 plan 12-02) satisfies PROXUI-01.

Out of scope:
- Backend payload shape changes — Phase 12 sealed the contract `{ value: number, nextTier: string }`.
- Days 4–8 proximity, Fire Weather proximity, Mesoscale Discussion proximity (PROJECT.md "Active" scope explicitly limits to Convective Day 1–3 + CIG).
- New CSS file or `getStyles()` registration — repo pattern is inline `style="..."` (Phase 11 D-08).
- User-configurable `proximityMaxKm` / `proximityMinWeight` (deferred per REQUIREMENTS.md "Future").

</domain>

<decisions>
## Implementation Decisions

### Number displayed (PROXUI-02, PROXUI-03, PROXUI-05)
- **D-01:** Display **weight only** (not value). Render `→ ENH 0.7` inside-tier, `0.6 (near SLGT)` outside-tier. Matches PROJECT.md `EHN → MDT 0.75` and ROADMAP success criterion 5 ("weights are displayed rounded to one decimal"). The frontend derives weight from the backend's `proximity.<key>.value` via `weight = value - Math.trunc(value)` — works uniformly for inside (`2.7 → 0.7`) and outside (`0.6 → 0.6`) cases because Phase 12 D-07 strictly caps `weight < 1`, so `Math.trunc(value) === currentInt`.
- **D-02:** Inside-tier badge format: `→ ENH 0.7` (no CURR — the colored `dayN.text` span immediately preceding already names the current tier).
- **D-03:** Outside-tier badge format: `0.6 (near SLGT)` — literal match for ROADMAP success criterion 3 and the PROJECT.md example. Weight first, then parenthetical with the abbreviated tier label that backend emits in `nextTier`.
- **D-04:** Round display via `(weight).toFixed(1)`. PROXUI-05 noise-threshold suppression logic (see D-13) prevents rounded-to-`0.0` flicker.

### Outside-tier render policy (PROXUI-03)
- **D-05:** Day N row gate becomes `dayN.risk !== "NONE" || dayN.proximity?.categorical`. When `risk === "NONE"` but `proximity.categorical` is present, the row renders with the existing backend-emitted `dayN.text` ("None") and `dayN.color` (`#afddf6` light blue) followed by the outside-tier badge: `Mon (Day 1): <span style="color:#afddf6">None</span> 0.6 (near SLGT)`.
- **D-06:** Extend the umbrella "No Severe Weather Risk" check at lines 53–67 to also gate on absence of any `proximity` subtree across `day1`/`day2`/`day3`. New conjunct: `&& !this.spcrisk.day1.proximity && !this.spcrisk.day2.proximity && !this.spcrisk.day3.proximity`. Without this, an outside-but-near user would still see the umbrella message with proximity badges hidden underneath.
- **D-07:** Per-hazard CIG proximity (`torCig`/`hailCig`/`windCig`) only renders when its underlying hazard probability row already renders (`dayN.torRisk > 0`, etc.). The edge case (sig-tier polygon nearby but 0% hazard probability at user's point) is suppressed for display clarity. PROXUI-04 explicitly says "alongside existing cigLabel output" — implies the row exists.

### CIG badge primitive + placement (PROXUI-04)
- **D-08:** Reuse the circled-number primitive `①②③` for CIG proximity badges. Inside-tier: `→ ② 0.7`. Outside-tier: `0.6 (near ①)`. The frontend extends `cigLabel` (or adds a sibling `cigLabelFromTierString` helper) that maps backend `nextTier: "CIG2"` → `②`. Mirrors v1.0 visual vocabulary and avoids divergence between current-cig display (`①②③`) and proximity display.
- **D-09:** Per-hazard CIG badge sits **between `cigLabel` output and the prob percent**: `<i class="wi wi-tornado"></i>② → ③ 0.7 5%` (inside) or `<i class="wi wi-tornado"></i>0.6 (near ①) 5%` (outside). Groups all CIG-tier info together before the probability number.
- **D-10:** Day 3 (single-row categorical+cig today) renders both badges inline, semicolon-separated when both are present: `Wed (Day 3): <span color>Slight Risk② → ENH 0.5; → ③ 0.7</span>`. Outside-tier example: `Wed (Day 3): None 0.6 (near SLGT); 0.6 (near ①)`. The semicolon disambiguates the two arrows on a single line.

### Claude's Discretion
- **D-11:** Helper structure inside `getDom()` — extract a small `proximityBadge(prox, mode)` helper (where `mode === "inside" | "outside"`) for reuse across categorical and per-hazard CIG paths, OR inline the format strings at each site. Either is acceptable; helper is preferred for readability if it's used 4+ times.
- **D-12:** Whether to extend `cigLabel` to accept an optional `tierString` parameter or add a parallel `cigLabelFromTierString` helper for proximity. Either form fine.
- **D-13:** Noise threshold value (PROXUI-05). Recommend `0.1` (corresponding to `~36 km` from a higher-tier polygon). Below this, suppress the badge entirely (do NOT render `0.0`). Lives in code as a top-of-getDom constant `const PROX_MIN_WEIGHT = 0.1`. If real-world use shows it's too noisy/quiet, a future phase can promote it to a config knob (already noted as v2 deferred).
- **D-14:** Badge color treatment. Recommend the badge inherits the surrounding span's color (i.e., when nested inside the colored risk span, picks up the risk's color naturally; when standalone on outside-tier rows, renders in the wrapper's default color — same as the `(near SLGT)` text). No new yellow/grey override; the stale-indicator yellow `#FFCC00` is reserved for staleness signaling.
- **D-15:** PROXUI-01 verification only — no code change for flag plumbing. The flag is already in `defaults` (line 7) and threaded through both `GET_SPC_DATA` payload constructions (lines 14, 16) per Phase 12 plan 12-02. The phase plan should include a one-line verification step.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Phase requirements & roadmap
- `.planning/REQUIREMENTS.md` §Proximity Frontend (PROXUI) — PROXUI-01 through PROXUI-05 acceptance text
- `.planning/ROADMAP.md` §Phase 13: Proximity Frontend Render — goal and 5 success criteria
- `.planning/PROJECT.md` §Active Requirements — names the `EHN → MDT 0.75` and `0.6 (near SLGT)` UX targets that constrain D-02/D-03

### Phase 12 backend contract (locked, do NOT modify)
- `.planning/phases/12-proximity-backend-foundation/12-CONTEXT.md` §Implementation Decisions D-01 through D-04 — subtree shape `{ value, nextTier }` and null-omission semantics
- `.planning/phases/12-proximity-backend-foundation/12-03-SUMMARY.md` — final emitted shape, `'proximity' in dayN` guard truthiness
- `node_helper.js` lines 485–491 (`buildProximitySubtree`) — what the frontend actually receives
- `node_helper.js` lines 847–882 (`!extended` return branch) and 1031–1063 (`extended` return branch) — the day1/day2/day3 spreads

### Phase 11 reference (pattern parallel)
- `.planning/phases/11-stale-data-indicator/11-CONTEXT.md` §Indicator visual style D-08 — locks "no CSS file; inline `style=...` attributes" pattern that Phase 13 must also honor
- `MMM-SPCOutlook.js` lines 72–84 (existing stale-indicator render) — concrete template for "small inline render added to `getDom()` without CSS"

### Source files in scope
- `MMM-SPCOutlook.js` lines 14, 16 (`GET_SPC_DATA` payloads) — PROXUI-01 verification: confirm `proximityWeighting` is already present in both
- `MMM-SPCOutlook.js` line 7 (`defaults`) — confirm `proximityWeighting: false`
- `MMM-SPCOutlook.js` lines 41–46 (`cigLabel`) — extend to accept tier-string OR add sibling helper for proximity
- `MMM-SPCOutlook.js` lines 53–67 (umbrella "No Severe Weather Risk" check) — extend with proximity gate per D-06
- `MMM-SPCOutlook.js` lines 90–115 (Day 1/2/3 row rendering) — primary integration sites for inside-tier + outside-tier categorical badges and Day 3 dual-badge layout
- `MMM-SPCOutlook.js` lines 93–98, 104–109 (per-hazard tor/hail/wind probability rows) — placement for per-hazard CIG proximity badge per D-09
- `MMM-SPCOutlook.js` lines 111–115 (Day 3 single-row categorical+cig) — D-10 inline semicolon-separated dual badge

### Project-level
- `.planning/PROJECT.md` §Out of Scope — proximity for Days 4–8, Fire Weather, Mesoscale Discussions remain out of scope at the frontend just as backend
- `.planning/PROJECT.md` §Constraints — Raspberry Pi: keep render path light (no per-frame work, no setInterval ticks for the badge)
- `.planning/codebase/CONVENTIONS.md` — module render style (inline strings, `wrapper.innerHTML +=`)

### Backend label sources (already in `node_helper.js`)
- `node_helper.js` line 13 (`valueToFullRisk`) — `"None"` literal that the outside-tier row reuses
- `node_helper.js` line 16 (`valueToRisk`) — confirms abbreviated tier strings backend emits in `nextTier`
- `node_helper.js` line 447 (`riskToColor`) — `NONE: "afddf6"` confirms the light-blue color the outside-tier row inherits via the existing `dayN.color` field

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`cigLabel()`** (MMM-SPCOutlook.js 41–46): existing `cig: number → "①/②/③/"` mapping; extend to accept a tier-string ("CIG1"/"CIG2"/"CIG3") for proximity rendering, or add a parallel helper.
- **`dayN.text` + `dayN.color`** (already emitted by backend for ALL risk values including `"NONE"` → `"None"` + `"#afddf6"`): outside-tier rows reuse these directly — no new color logic needed.
- **`(value).toFixed(1)`**: standard JS rounding; no library needed.
- **Inline `style="color:#xxxxxx"` pattern**: every colored span in `getDom` today; no CSS file added (mirrors stale-indicator from Phase 11).

### Established Patterns
- Frontend builds output via `wrapper.innerHTML += "..."` accumulation. Badge rendering follows the same approach.
- Conditional row gates (`if(this.spcrisk.day1.risk != "NONE")`) — Phase 13 extends one of these (`||` proximity-present) and adds a new umbrella conjunct for the no-risk fallback.
- All severity/tier abbreviations come pre-resolved from backend (`dayN.text`, `proximity.<key>.nextTier`); frontend never re-derives risk strings.
- The stale-indicator render (lines 72–84) is the precedent template: inline-string accumulation with no CSS, defensive type checks (`typeof asOf === "number" && isFinite(asOf)`), and edge-case fallback ("just now" for negative deltas).

### Integration Points
- **Umbrella check (lines 53–67)**: extend with `&& !day1.proximity && !day2.proximity && !day3.proximity` per D-06.
- **Day 1 categorical row (line 92)**: append inside-tier badge `→ ENH 0.7` after the colored span when `day1.proximity?.categorical` is present and weight ≥ noise floor.
- **Day 1 hazard rows (lines 95–97)**: between `cigLabel(day1.torCig)` and `100 * day1.torRisk + "% "`, insert `proximityBadge(day1.proximity?.torCig, mode)` per D-09. Same for hail/wind.
- **Day 2 (lines 102–110)**: mirror Day 1 exactly — same structure.
- **Day 3 categorical+cig (lines 111–115)**: dual-badge inline layout per D-10 (`; `-separated when both present).
- **Day N row gate (lines 90, 101, 111)**: relax to `risk != "NONE" || proximity?.categorical` per D-05.
- **`cigLabel` (lines 41–46)**: extend to handle proximity tier strings — choice in D-12.

</code_context>

<specifics>
## Specific Ideas

- Inside-tier categorical example (Day 1, user in SLGT(2), ENH polygon 12 km away): `Mon (Day 1): <span style="color:#f7f690">Slight Risk</span> → ENH 0.7`.
- Outside-tier categorical example (Day 1, user outside all tiers, SLGT polygon 16 km away): `Mon (Day 1): <span style="color:#afddf6">None</span> 0.6 (near SLGT)`.
- Per-hazard CIG inside example (Day 1 tor with torCig=2, CIG3 polygon 12 km away, 5% tor probability): `<i class="wi wi-tornado"></i>② → ③ 0.7 5%`.
- Per-hazard CIG outside example (Day 2 hail with hailCig=0, CIG1 polygon 24 km away, 15% hail probability): `<i class="wi wi-meteor"></i>0.6 (near ①) 15%`.
- Day 3 dual-badge inside example (SLGT(2) with cig=2, ENH polygon 16km away, CIG3 polygon 12km away): `Wed (Day 3): <span style="color:#f7f690">Slight Risk② → ENH 0.6; → ③ 0.7</span>`.
- Day 3 dual-badge outside example (none tier, SLGT polygon 24 km, CIG1 polygon 28 km): `Wed (Day 3): <span style="color:#afddf6">None 0.4 (near SLGT); 0.3 (near ①)</span>`.
- Noise floor: `const PROX_MIN_WEIGHT = 0.1` near the top of `getDom()` (or above as a module constant if cleaner).

</specifics>

<deferred>
## Deferred Ideas

- User-configurable `proximityMaxKm` and `proximityMinWeight` knobs — already in REQUIREMENTS.md "Future Requirements"; revisit in v1.3+.
- Proximity for Day 4–8 categorical, Fire Weather, and Mesoscale Discussions — explicitly out of scope per PROJECT.md.
- Replacement of the umbrella "No Severe Weather Risk" message with a proximity summary (e.g., "No risk — nearest: SLGT 0.6 (Day 1)") — interesting UX but introduces new copy and a new UX surface; revisit if v1.2 real-world usage shows the umbrella + proximity-present case is common enough to warrant rewording.
- Trend / predictive proximity (requires payload history) — REQUIREMENTS.md "Future".
- Promoting `PROX_MIN_WEIGHT` to a config knob — defer until real-world feedback indicates `0.1` is wrong for some users.
- Visual treatment alternatives (dim grey, accent color, italic) — current decision is to inherit surrounding span color; revisit if real display testing shows readability issues.

</deferred>

---

*Phase: 13-proximity-frontend-render*
*Context gathered: 2026-05-02*
