# Phase 13: Proximity Frontend Render - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-05-02
**Phase:** 13-proximity-frontend-render
**Areas discussed:** Number displayed (weight vs value), Outside-tier render policy, CIG badge primitive + placement
**Areas skipped:** Noise threshold + visual treatment (folded into Claude's Discretion D-13/D-14)

---

## Number displayed (weight vs value)

### Q1 — What number does the badge actually display?

| Option | Description | Selected |
|--------|-------------|----------|
| Weight only | Render `SLGT → ENH 0.7`. Matches PROJECT.md `EHN → MDT 0.75` example and ROADMAP success criterion 5. Frontend derives via `value - Math.trunc(value)`. | ✓ |
| Full value | Render `SLGT → ENH 2.7`. Direct read of `proximity.categorical.value`. Conflicts with PROJECT.md example. | |
| Both | Render `SLGT → ENH (2.7 / +0.7)`. Most informative, busiest visually. | |

**User's choice:** Weight only.
**Notes:** Resolves the contradiction between Phase 12 D-02 (which emits `value`) and ROADMAP/PROJECT.md examples (which show `weight`). Frontend math: `weight = value - Math.trunc(value)`.

### Q2 — Inside-tier text format?

| Option | Description | Selected |
|--------|-------------|----------|
| `→ ENH 0.7` | Drop CURR — colored risk text immediately before already names current tier. Compact. | ✓ |
| `SLGT → ENH 0.7` | Mirror ROADMAP `CURR → NEXT W.W` literally. Slightly redundant. | |
| `(→ ENH 0.7)` | Parenthesized form to clearly separate badge from risk text. | |

**User's choice:** `→ ENH 0.7`.

### Q3 — Outside-tier text format?

| Option | Description | Selected |
|--------|-------------|----------|
| `0.6 (near SLGT)` | Literal match for PROJECT.md and ROADMAP success criterion 3. | ✓ |
| `near SLGT 0.6` | Mirror inside-tier badge structure. Diverges from spec. | |
| `→ SLGT 0.6` | Reuse inside-tier arrow primitive. Loses 'near' verbal cue. | |

**User's choice:** `0.6 (near SLGT)`.

---

## Outside-tier render policy

### Q1 — Render Day N row when `risk === "NONE"` but `proximity.categorical` present?

| Option | Description | Selected |
|--------|-------------|----------|
| Yes — render the row | Required to satisfy PROXUI-03. Gate becomes `risk != 'NONE' \|\| dayN.proximity?.categorical`. | ✓ |
| No — only enrich existing rows | Conservative. Would explicitly violate PROXUI-03. | |
| Yes, but only when weight ≥ threshold | Couples row-rendering to noise threshold. | |

**User's choice:** Yes — render the row.

### Q2 — Outside-tier row visual?

| Option | Description | Selected |
|--------|-------------|----------|
| Label + badge, no colored text | `Mon (Day 1): 0.6 (near SLGT)`. Plain. | |
| Color the badge with near-tier's color | Visually consistent with risk rows. Trade: could read as "you're in this risk." | |
| Render with explicit 'no risk' marker | `Mon (Day 1): <span color>None</span> 0.6 (near SLGT)`. Explicit baseline. | ✓ |

**User's choice:** Render with explicit 'no risk' marker.
**Notes:** Implementation reuses existing backend-emitted `dayN.text` ("None") and `dayN.color` (`#afddf6` light blue) — no new color logic.

### Q3 — Umbrella check interaction?

| Option | Description | Selected |
|--------|-------------|----------|
| Extend the check | Add `&& !day1.proximity && !day2.proximity && !day3.proximity` to the umbrella gate. Most spec-faithful. | ✓ |
| Leave umbrella as-is | Trade: badges hidden whenever user is outside-but-near. | |
| Replace umbrella with proximity summary | New UX surface. More copy decisions. | |

**User's choice:** Extend the check.

### Q4 — Per-hazard CIG badge with zero hazard probability?

| Option | Description | Selected |
|--------|-------------|----------|
| Suppress badge — needs a row to live on | Per-hazard CIG only renders when `dayN.torRisk > 0` etc. PROXUI-04 implies row exists. | ✓ |
| Force-render the hazard row | Most informative. Trade: noisy when sig polygons are far from prob polygons. | |
| Roll up into the categorical row | Mixes categorical and CIG semantics on one line. | |

**User's choice:** Suppress badge — needs a row to live on.

---

## CIG badge primitive + placement

### Q1 — CIG primitive: text or circled-number?

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse circled-number `①②③` | Inside: `→ ② 0.7`. Outside: `0.6 (near ①)`. Mirrors v1.0 visual primitive. | ✓ |
| Use text label `CIG1/CIG2/CIG3` | Renders backend label verbatim. Less elegant; text-readable on low-DPI. | |
| Hybrid (circled inside, text outside) | Split convention adds cognitive load. | |

**User's choice:** Reuse circled-number `①②③`. Frontend extends `cigLabel` (or adds a sibling helper) to map `nextTier: "CIG2"` → `②`.

### Q2 — Per-hazard placement?

| Option | Description | Selected |
|--------|-------------|----------|
| Between cigLabel and percent | `<i></i>② → ③ 0.7 5%` (inside) / `<i></i>0.6 (near ①) 5%` (outside). Groups CIG-tier info before prob. | ✓ |
| After percent | `<i></i>② 5% → ③ 0.7`. Reads "what is + what's nearby." | |
| Parenthesized after cigLabel | `<i></i>② (→ ③ 0.7) 5%`. Extra visual weight. | |

**User's choice:** Between cigLabel and percent.

### Q3 — Day 3 dual-badge layout?

| Option | Description | Selected |
|--------|-------------|----------|
| Inline, semicolon-separated | `Wed (Day 3): Slight Risk② → ENH 0.5; → ③ 0.7`. Disambiguates two arrows. | ✓ |
| Categorical inline, CIG on a new sub-row | Adds vertical space; new sub-row pattern. | |
| Both inside the colored span, space-separated | Most compact; two arrows on one line read ambiguously. | |

**User's choice:** Inline, semicolon-separated.

---

## Claude's Discretion

Areas user delegated to Claude (skipped from selection or implicit):

- **Noise threshold value (PROXUI-05)** — recommend `PROX_MIN_WEIGHT = 0.1` (~36 km cutoff). Lives in code; defer to config knob until real-world feedback indicates `0.1` is wrong.
- **Badge color treatment** — recommend inheriting surrounding span color (no new yellow/grey override; the stale-indicator yellow `#FFCC00` stays reserved for staleness).
- **Helper structure** — extract `proximityBadge(prox, mode)` helper if used 4+ times; otherwise inline format strings.
- **`cigLabel` extension shape** — extend in place to accept tier-string OR add parallel `cigLabelFromTierString` helper. Either is fine.
- **PROXUI-01 verification** — flag plumbing already done in Phase 12 plan 12-02; phase plan should include a one-line verification step rather than a code change.

## Deferred Ideas

- User-configurable `proximityMaxKm` / `proximityMinWeight` knobs — REQUIREMENTS.md "Future Requirements".
- Proximity for Days 4–8, Fire Weather, Mesoscale Discussions — explicitly out of scope per PROJECT.md.
- Replacing umbrella "No Severe Weather Risk" message with a proximity summary — interesting UX but new surface; revisit if real-world usage shows umbrella+proximity-present is common.
- Trend / predictive proximity — REQUIREMENTS.md "Future."
- Promoting `PROX_MIN_WEIGHT` to a config knob — defer until real-world feedback.
- Alternative visual treatments (dim grey, accent, italic) — defer until display testing shows readability issues.
