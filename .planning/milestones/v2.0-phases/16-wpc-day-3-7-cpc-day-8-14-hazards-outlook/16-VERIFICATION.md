---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
verified: 2026-08-27T00:00:00Z
status: human_needed
score: 5/5 must-haves verified (code + mutation-proof); 2/5 fully live-confirmed, 1/5 half-confirmed, 2/5 not live-observable for documented, non-fabricated reasons
has_blocking_gaps: false
overrides_applied: 0
deferred:
  - truth: "HAZ-01 — live confirmation of per-day Precipitation bucketing"
    addressed_in: "Not deferred to a later phase — carried in STATE.md Deferred Items as an ongoing live-observation gap, closable on any day the Precipitation layers (4, 6) carry live features"
    evidence: "16-08-SUMMARY.md UAT table, C1 = NOT OBSERVABLE, confirmed on both 2026-08-26 and 2026-08-27 (zero features nationwide on both dates)"
  - truth: "HAZ-04 Flooding half — live confirmation of Flooding-label suppression"
    addressed_in: "Same root cause as HAZ-01 — Flooding labels ride inside the empty Precipitation layers"
    evidence: "16-08-SUMMARY.md UAT table, C4 Flooding half = NOT OBSERVABLE; mutation-proven `hazards-flooding-labels-never-appear-under-any-toggle` stands as synthetic evidence"
  - truth: "DATA-02 — live confirmation across an actual weekend cadence gap"
    addressed_in: "Not observable on a Thursday; can be closed on any weekend by inspecting idp_filedate drift live"
    evidence: "16-08-SUMMARY.md UAT table, C5 = NOT OBSERVABLE (Thursday); negative case (21h age, no false badge) was confirmed live"
human_verification:
  - test: "Observe a live day where WPC Precipitation layers (4, 6) carry features, and confirm a per-day Days-3-14 hazard row renders and matches the feature's own start/end date span (HAZ-01)."
    expected: "A `Hazards (Weekday, Day N):` row appears for every day the feature's date span covers, using the payload date, not the polling day."
    why_human: "Both Precipitation layers returned zero features nationwide on two separate observation dates (2026-08-26, 2026-08-27); the underlying data condition to exercise this path does not currently exist and cannot be manufactured without live WPC issuance."
  - test: "Observe a live weekend poll (Saturday or Sunday) of this product and confirm no false ⚠ Stale badge fires for the Hazards Outlook block, using Friday's still-fresh idp_filedate."
    expected: "No stale badge attributable to Hazards Outlook appears across the weekend gap, consistent with the 84h maxDataAgeHours budget."
    why_human: "Verification was performed on a Thursday; the weekend cadence case is not observable same-day. Mutation-proven synthetic coverage exists (`hazards-weekend-poll-of-fridays-file-is-not-stale`) but a live weekend observation has not yet been made."
  - test: "Observe the Hazards-Outlook-only no-risk-gate path live: a location inside an active window-band hazard polygon (e.g. Hazardous Heat) with every other product (SPC categorical, ERO, WSSI, advisories) reading NONE."
    expected: "The module renders the window-band hazard line, not the literal 'No Severe Weather Risk' short-circuit."
    why_human: "Every 2026-08-27 UAT location carried other on-screen risk; an SPC-quiet coordinate was identified and geometrically verified but the observation itself was not made. The two gate terms are mutation-proven in the probe suite, but the live end-to-end path (real payload -> real DOM) for this specific case remains unexercised."
---

# Phase 16: WPC Day 3-7 / CPC Day 8-14 Hazards Outlook Verification Report

**Phase Goal:** Users see per-day hazard entries for Days 3-14 from the Precipitation layer and a
separate window-labeled band for Temperature/Wildfire hazards that carry no per-day resolution,
without Flooding/Drought noise, and the stale indicator understands this product's weekday-only
cadence.

**Verified:** 2026-08-27
**Status:** human_needed (all 5 success criteria hold at the code/mutation-proof level; 2/5 items
identified in Step 8 require live observation this verification pass cannot perform, and are
already correctly disclosed by the phase itself rather than silently claimed)
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths (ROADMAP Success Criteria)

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HAZ-01: per-day hazard entries Days 3-14, bucketed from Precipitation layer date stamps | VERIFIED (code + mutation-proof); live confirmation NOT OBSERVABLE | `_bucketHazardMatch` day-span loop (`node_helper.js:1833` per REVIEW; day-clamp `Math.max(offsetStart,3)..Math.min(offsetEnd,14)` read directly) is exercised by `hazards-precip-spread-buckets-every-day-in-span` (mutation-proven, MUTATION-INVENTORY row 16-06). Live: both Precipitation layers (4, 6) returned 0 features nationwide on 2026-08-26 AND 2026-08-27 (16-08-SUMMARY.md, C1=NOT OBSERVABLE) — an honestly disclosed, reproducible-on-both-dates gap, not a silent omission. |
| 2 | HAZ-02: Temperature/Wildfire hazards appear once in a labeled window band, never repeated per day | VERIFIED (code + mutation-proof + live UAT PASS) | `frontend-hazards-window-hazard-appears-once-not-per-day` mutation-proven (M5, MUTATION-INVENTORY). Live: C2 PASS — `Sun–Wed (D3–6): Hazardous Heat` rendered once as a single band line at the deployed Pi (16-08-SUMMARY.md UAT table). |
| 3 | HAZ-03: a feature keyed on lowercase `label` (not `LABEL`) is displayed, not silently dropped | VERIFIED (code + mutation-proof + live UAT PASS) | `hazardsOutlook.toValue` reads `f.properties.label` directly (`productRegistry.js:347`, confirmed by direct read), with `hazards-lowercase-label-is-read-not-dropped` mutation-proven (16-06). Live: C3 PASS — three real labels rendered (`Severe Drought`, `Hazardous Heat`, `Extreme Heat`); confirmed by inspection that an uppercase-`LABEL` read yields `""` for this service and would have been dropped by `includesFeat` (16-08-SUMMARY.md). |
| 4 | HAZ-04: Flooding and Drought sub-labels never appear in the display (Drought is opt-in only) | VERIFIED (code + mutation-proof); Drought half live UAT PASS; Flooding half live NOT OBSERVABLE | `includesFeat` in `_runArcGisHazardWindowProduct` hard-excludes `row.excludedLabels` (Flooding) unconditionally and gates `row.droughtLabels` on `productToggles.showDrought !== true` (`node_helper.js:503-511`, confirmed by direct read). Mutation-proven: `hazards-flooding-labels-never-appear-under-any-toggle`, `hazards-drought-is-hidden-at-the-default-and-shown-only-on-opt-in`, `hazards-frontend-renders-no-flooding-or-drought-at-the-default`. Live: C4 Drought half PASS (toggled on/off live, corroborated in backend log); Flooding half NOT OBSERVABLE (rides inside the same empty Precipitation layers as HAZ-01). WR-02 (open, not fixed) notes the exact-string match is defeated by a trailing space or case change — a genuine robustness gap, but not observed to manifest against real WPC label values in this UAT session; tracked as a warning, not a blocker. |
| 5 | DATA-02: the stale indicator understands the weekday-only (Mon-Fri) cadence and does not false-alarm on weekends | VERIFIED (code + mutation-proof, including the CR-01 remediation); live weekend case NOT OBSERVABLE | `maxDataAgeHours: 84` (`productRegistry.js:359`) designed for the Fri-17Z-to-Mon-05Z gap; per-layer freshness checked against each layer's own `idp_filedate`, confirmed independent of whether any feature contains the user after the CR-01 fix (`_hazardLayerFiledate` reads the raw body before containment filtering — see Cache Contract section below). Mutation-proven: `hazards-weekend-poll-of-fridays-file-is-not-stale`, `hazards-idp-filedate-is-evaluated-per-layer-not-shared`, `hazards-stale-layer-ages-out-even-when-nothing-contains-the-user` (the CR-01 addendum scenario). Live: C5 NOT OBSERVABLE (2026-08-27 is a Thursday, weekend gap not exercisable same-day) but the negative case (21h age, no false badge against the 84h budget) was confirmed live (16-08-SUMMARY.md). |

**Score:** 5/5 truths hold at the code + mutation-proof level. 2/5 fully live-confirmed (HAZ-02,
HAZ-03), 1/5 half live-confirmed (HAZ-04 Drought half), 2/5 not live-observable for reasons that
are genuine data-availability constraints, not gaps in the implementation itself (HAZ-01, DATA-02
weekend case), and independently re-confirmed as reproducible on two separate calendar dates
rather than a one-off excuse.

### Cache Contract Verification (Phase's #1 Stated Risk)

Read directly from `node_helper.js` (not summarized from SUMMARY.md):

- `_cacheHazardMatches` (`node_helper.js:432-468`) is the sole writer to `_geoJsonCache` for this
  product. It whitelists exactly four fields per match (`label`, `startDate`, `endDate`,
  `idpFiledate`) via explicit property construction — never a spread — and carries a defensive
  assertion (`node_helper.js:439-443`) that throws if any source key matches `/^day\d+$/`,
  `offsetStart`, `offsetEnd`, or `dayOffset`. No day key or day offset can physically enter the
  cache.
- Re-bucketing (`_bucketHazardMatch` calls at `node_helper.js:589-591`) runs unconditionally after
  the cache-read/cache-write branch closes, on every poll, against that poll's own `todayUtcMs`
  (`node_helper.js:489`, computed once per call and never accepted as a parameter — confirmed by
  reading the function signature at `node_helper.js:488`).
- **Post-CR-01-remediation check (explicitly requested):** the cached unit is now
  `{ matches: whitelisted, layerFiledate: filedate }` (`node_helper.js:458-467`), not a bare
  array. `layerFiledate` is read off the raw GeoJSON body via `_hazardLayerFiledate`
  (`node_helper.js:398-405`) BEFORE containment filtering, so it survives a cache hit
  independent of whether the polygon test matched. `layerFiledate` is `idp_filedate`, a remote
  WPC publish timestamp — not derived from the local clock — so its presence in the cached unit
  does not reintroduce a clock-dependent field; the same defensive whitelist assertion still
  applies to the `matches` array and was not loosened to admit it. On a cache hit
  (`node_helper.js:522-534`), `layerFiledate` is read back from `cached.layerFiledate` (with a
  bare-array/older-shape tolerance fallback to `null`), and the freshness check
  (`node_helper.js:550-583`) runs identically on hit and miss, against `this._nowMs() - filedate`.
  **The clock-independent cache contract holds after remediation** — confirmed by direct code
  reading, not by re-trusting the SUMMARY's claim.
- Mutation-proven for the drift risk itself: `hazards-day-keys-shift-on-a-cache-hit-when-the-day-
  advances` (M1-M4, MUTATION-INVENTORY 16-07) and, for the CR-01 extension specifically,
  `hazards-stale-layer-ages-out-even-when-nothing-contains-the-user` (M1, M4, MUTATION-INVENTORY
  addendum).

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `productRegistry.js` `hazardsOutlook` row | Registry row: 6 layers, Flooding/Drought vocabularies, live palette, `maxDataAgeHours` | VERIFIED | Confirmed by direct read (`productRegistry.js:135-166, 318-376`): `hazardsOutlookLayers` (6 entries, correct IDs/groups/dayRanges), `hazardsExcludedLabels`, `hazardsDroughtLabels`, `hazardsOrder`, `hazardsDisplayColor`, `maxDataAgeHours: 84`, `kind: "arcgis-hazard-window"`. |
| `node_helper.js` `_runArcGisHazardWindowProduct` + helpers | Runner: fetch/filter/cache/bucket six layers, per-layer freshness | VERIFIED, WIRED | Dispatched at `node_helper.js:2783` (`const hazardsResult = await this._runArcGisHazardWindowProduct(...)`); result assembled into payload at `node_helper.js:2916` (`hazardsOutlook: hazardsPayload`). |
| `MMM-SPCOutlook.js` gate terms + renderers | Two independent no-risk gate terms, day-grid and window-band renderers | VERIFIED, WIRED | Gate terms at `MMM-SPCOutlook.js:357-358`; renderers `renderHazardsDays`/`renderHazardsWindowBand` called at `MMM-SPCOutlook.js:621-623`, gated on `this.config.showHazardsOutlook`, day-grid rendered before window-band (D-05 ordering, confirmed). |
| `scripts/probe-payload-resilience.js` hazards scenarios | 17 hazards-specific probe scenarios, mutation-proven | VERIFIED | 67 passed / 0 failed / 0 skipped, independently re-run for this verification (not taken from SUMMARY.md). 27 hazards-related scenario names present in the pass list. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|----|----|--------|---------|
| `productRegistry.js` `hazardsOutlook.kind` | `node_helper.js` dispatch | Direct named call (not kind-loop) | WIRED | `node_helper.js:2783` calls `_runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook, ...)` directly. |
| `_runArcGisHazardWindowProduct` | `_bucketHazardMatch` | Recomputed every poll from normalized matches | WIRED | `node_helper.js:589-591`, outside and after the cache branch, confirmed by direct read. |
| `getSpcOutlook` payload | `MMM-SPCOutlook.js` gate/render | `hazardsOutlook` payload key | WIRED | `node_helper.js:2916` assembles the key; `MMM-SPCOutlook.js:357-358, 621-623` consume it. |
| No-risk gate terms | Shared render predicates | `renderableWindowEntries` / `renderableDayHazards` | WIRED (post-WR-04-fix) | Both gate terms (`MMM-SPCOutlook.js:357-358`) and both renderers (`:543, :568/581`) read the same two predicate functions defined once at `:263-287` — confirmed by direct read, closing the WR-04 gate/renderer drift the review found. |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Probe suite runs clean and includes all 17 hazards scenarios | `node scripts/probe-payload-resilience.js` | `67 passed, 0 failed, 0 skipped` (independently re-run) | PASS |
| No debt markers (TBD/FIXME/XXX) in phase-touched files | `grep -n "TBD\|FIXME\|XXX" node_helper.js MMM-SPCOutlook.js productRegistry.js scripts/hazards-at.js scripts/probe-payload-resilience.js` | No matches | PASS |
| Requirements coverage — no orphaned Phase 16 requirement | `grep -n "requirements:" .../16-*-PLAN.md` | HAZ-01, HAZ-02, HAZ-03, HAZ-04, DATA-02 all claimed across the 8 plans | PASS |

### Probe Execution

No dedicated `scripts/*/tests/probe-*.sh` files exist in this project; the harness is
`node scripts/probe-payload-resilience.js`, run directly above. Not applicable as a separate
Step-7c artifact beyond the run already recorded.

### Requirements Coverage

| Requirement | Source Plan(s) | Description | Status | Evidence |
|--------------|-----------------|--------------|--------|----------|
| HAZ-01 | 16-01, 16-02, 16-03, 16-04, 16-05, 16-06, 16-08 | Per-day hazard entries Days 3-14 from Precipitation layer | SATISFIED (code+test); live NOT OBSERVABLE (documented, see Deferred) | See Truth #1 above |
| HAZ-02 | 16-01, 16-02, 16-04, 16-05, 16-07 | Temperature/Wildfire in non-day-scoped window band | SATISFIED, live PASS | See Truth #2 above |
| HAZ-03 | 16-01, 16-03, 16-05, 16-06, 16-08 | Lowercase `label` field read, not dropped | SATISFIED, live PASS | See Truth #3 above |
| HAZ-04 | 16-01, 16-03, 16-05, 16-06, 16-08 | No Flooding/Drought sub-labels displayed | SATISFIED (code+test); Drought live PASS, Flooding live NOT OBSERVABLE | See Truth #4 above |
| DATA-02 | 16-01, 16-03, 16-06, 16-07, 16-08 | Stale indicator accounts for weekday-only cadence | SATISFIED (code+test, including CR-01 fix); live weekend case NOT OBSERVABLE | See Truth #5 above |

No orphaned requirements: REQUIREMENTS.md maps HAZ-01/02/03/04 and DATA-02 to Phase 16 and all
five appear in at least one plan's `requirements:` frontmatter.

### Anti-Patterns Found

None blocking. No TBD/FIXME/XXX markers, no placeholder/stub renderers, no empty implementations
in the phase's touched files. The 10 open review findings below are pre-existing, disclosed
technical debt, not anti-patterns hidden from this verification.

### Open Review Findings — Assessed Against the Phase Goal

Ten `16-REVIEW.md` findings remain open (`WR-01, WR-02, WR-03, WR-05, WR-06, WR-07, WR-08, WR-09,
IN-01, IN-02`). None of them was found to invalidate any of the five ROADMAP success criteria as
currently implemented:

- **WR-01** (showDrought cache has no toggle dimension across module instances) — only reachable
  with a second module instance/second `showDrought` config at one location; this deployment is
  single-instance (matches the existing accepted Phase 14 CR pattern). Not blocking.
- **WR-02** (exact-string label match defeated by trailing space/case) — a real robustness gap
  against HAZ-04's "no override" guarantee, but not observed to manifest against real WPC label
  values during live UAT (labels observed exactly matched the registry's literals). Flagged as a
  genuine follow-up risk, not a proven present-day failure.
- **WR-03** (day span `3`/`14` hardcoded rather than derived from `dayRangeTotal`) — current
  registry values agree with the hardcoded clamp; a latent drift risk on a future registry change,
  not a current defect.
- **WR-05** (`_isWithinStaleWindow`/cache-hit timestamp refreshes bypass the `_nowMs()` seam) —
  both paths use `Date.now()` in production, so there is no live discrepancy today; the defect is
  test-harness clock-independence, not production behavior, and does not touch DATA-02's actual
  weekend-cadence guarantee (which is enforced entirely inside `_runArcGisHazardWindowProduct`'s
  own freshness check, which IS routed through `_nowMs()`).
- **WR-06, WR-07** (unbounded remote-controlled growth / body size) — hostile-input hardening gaps
  extended from pre-existing code, not specific to whether the five success criteria hold under
  normal operation.
- **WR-08, WR-09, IN-01, IN-02** — operator tooling (`scripts/hazards-at.js`) misreporting and a
  dedupe-key collision edge case; neither touches the production render or fetch path the success
  criteria depend on.

**Verdict: none of the ten open findings are BLOCKERs against this phase's stated goal.** They are
correctly disclosed follow-up work, not silently hidden defects.

### Human Verification Required

See YAML frontmatter `human_verification` for the three items requiring live observation this
verification could not itself perform: HAZ-01's live per-day bucketing (blocked on WPC issuing
Precipitation features, which it has not done on either observed date), DATA-02's live weekend
case (blocked on today being a Thursday), and the Hazards-Outlook-only no-risk-gate path (an
SPC-quiet coordinate was identified but the observation itself was not made during UAT). All three
are pre-existing, transparently disclosed in STATE.md's Deferred Items table and 16-08-SUMMARY.md
— this verification independently confirms those disclosures are honest and adequately evidenced,
not a cover for missing implementation. Code-level and mutation-proof evidence exists for all
three; none is a case of "absence of implementation observable in the codebase."

### Gaps Summary

No blocking gaps. All five ROADMAP success criteria are implemented, wired, and mutation-proven in
the probe suite (independently re-run at 67/0/0 for this verification). The phase's stated #1 risk
(clock-independent cache contract) was verified to hold by direct code reading, including after the
CR-01 remediation that extended the cached unit with `layerFiledate` — the extension is itself
clock-independent (a remote publish timestamp) and did not weaken the existing defensive whitelist
assertion. The one CRITICAL review finding (CR-01) and the WR-04 gate/renderer-drift warning are
both fixed and mutation-proven with dedicated new scenarios (67 vs. the pre-remediation 65).

Status is `human_needed` rather than `passed` strictly because Step 8 surfaced three items requiring
live observation that this verification pass cannot itself perform (per the decision tree: "passed
is ONLY valid when the human verification section is empty"). These are not implementation gaps —
they are honestly disclosed live-observation gaps already recorded in STATE.md's Deferred Items
table before this verification began, and this verification's independent review confirms those
disclosures are accurate, reproducible on separate dates where claimed, and not a substitute for
missing code.

The ten open (non-fixed) review findings are real follow-up work but do not block the phase goal;
recommend parking them to backlog rather than blocking phase close, since `has_blocking_gaps: false`.

---

*Verified: 2026-08-27*
*Verifier: Claude (gsd-verifier)*
