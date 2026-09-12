---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
verified: 2026-09-01T00:00:00Z
status: passed
score: 6/6 must-haves verified
has_blocking_gaps: false
overrides_applied: 0
---

# Phase 17: NWS/WPC HeatRisk & Parallelized Fetching Verification Report

**Phase Goal:** Users see their location's correct HeatRisk category for each of the next 7 days,
and the module's cold-start fetch time no longer grows linearly as more products are enabled.

**Verified:** 2026-09-01
**Status:** passed
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | HEAT-01/02: With `showHeatRisk: true`, user sees a HeatRisk category (0-4) for each of Days 1-7, attributed to the correct day by `idp_validtime` sort, never array order | VERIFIED | `node_helper.js:890-1064` `_runHeatRiskProduct` sorts tuples by `idpValidtime` ascending, derives day key exclusively via `_heatRiskDayOffset` offset arithmetic (never array position). `MMM-SPCOutlook.js:361-378` `heatRiskDaysToRender` is the sole gate/render predicate, distinguishing `category: null` from `category: 0`. Probe scenarios `heatrisk-day-order-follows-validtime-not-array-order`, `heatrisk-identify-body-survives-the-shared-fetch-validator` PASS (verified live: 82/82). Live UAT (operator, established fact): HeatRisk rows Days 1-7 rendered, categories matched WPC map, Day 1 = today. |
| 2 | HEAT-03: The identify call reprojects to Web Mercator before querying and returns a real category rather than `NoData` | VERIFIED | `productRegistry.js:279-296` `buildHeatRiskIdentifyUrl` declares `wkid:102100`; `node_helper.js:923-925` reprojects via `turf.toMercator(loc)` immediately before URL construction, and the same reprojection produces both the URL's `x`/`y` and its declared `spatialReference.wkid`. Confirmed real `@turf/turf.toMercator` is loaded at runtime (`node -e "require('@turf/turf').toMercator"` → function). Probe scenario `heatrisk-geometry-uses-mercator-not-raw-degrees` PASS. Live UAT (established fact): real categories rendered; production identify URL confirmed `sr=102100`, `wkid:102100`, `returnCatalogItems=true`. |
| 3 | HEAT-04: A response with duplicate `idp_validtime` entries displays the current mosaic tile's value (greatest `idp_filedate`), not a stale duplicate | VERIFIED | `node_helper.js:2264-2283` `_dedupeHeatRiskByValidTime` keeps the tuple with the greatest `idp_filedate` per distinct `idp_validtime`, explicitly not using `catalogItemVisibilities` (documented as unreliable). Probe scenario `heatrisk-duplicate-validtime-keeps-latest-filedate` PASS, including a dedicated visibility-independence proof (loser tile's visibility flag flipped, winner unchanged). Live UAT (established fact, fixture-only basis, explicitly accepted by operator as sufficient — no live duplicate has ever been served by upstream). |
| 4 | PERF-01: With all six new product toggles enabled, backend logs show the new product fetches issued concurrently rather than sequentially | VERIFIED | `node_helper.js:3404-3449` builds a 6-member array (excessiveRain, winterImpact, hazardsOutlook, heatRisk, spcMD, mpd) and issues them via `Promise.allSettled(members.map(...))` with per-member timing captured in a `finally` and logged as `"new-product batch settled in <n>ms {...}"`. `scripts/check-concurrency-invariant.sh` mechanically confirms all 4 shared-state write sites (`_unusableFeatureCount` x3, `_oldestStaleAt` x1) are synchronous with no `await` inside the mutation — exits 0, "all sites clean" (re-run live). Probe scenario `new-product-batch-fetches-issue-before-siblings-resolve` proves issue-order overlap without wall-clock dependence, PASS. Live UAT (established fact): production log `new-product batch settled in 2275ms {...}` sum 4392ms vs wall 2275ms, held across 10 observed batches. Roadmap wording says "via `Promise.all`"; implementation deliberately uses `Promise.allSettled` for per-member failure containment (D-08) — judged against intent per task guidance; flagged as a documentation nit only, not a gap. |
| 5 | DATA-03: No label-to-value mapping is reused between any of the six new products | VERIFIED | `productRegistry.js:537-558` `assertNoSharedRegistryMaps` walks `MAP_FIELDS` across all `PRODUCT_REGISTRY` rows and throws (naming both row ids) on any shared object reference; runs at module load. `node -e "require('./productRegistry')"` exits 0 (live re-run). `17-DATA03-SPOTCHECK.md` is a substantive, re-derived-from-current-source artifact: enumerates all 22 label-to-value tables (11 registry-scoped + 7 pre-registry + 4 exempt), proves `MAP_FIELDS` diff-empty against the actual per-row map-shaped fields, walks every `toValue` closure by hand for the ERO-dn/fire-weather-DN foreign-reference blind spot D-11 names, and honestly discloses a second blind spot (pre-registry SPC/fire-weather tables sit outside the registry's reach entirely, a documented scope boundary, not a phase-17 regression). Probe scenario `registry-rejects-shared-label-maps-at-load-time` PASS. Live UAT (established fact): assertion held through a 3h15m clean production run. |
| 6 | Phase 15 D-10 obligation: every scenario added this phase has a recorded mutation, RED message, and restore | VERIFIED | `17-MUTATION-INVENTORY.md` contains 16 rows (15 probe scenarios + `check-concurrency-invariant.sh`'s own proof), each with exact mutation, verbatim RED message, and restore confirmation; reconciles scenario count arithmetic (67 baseline -> 72 -> 78 -> 82, +15 this phase) and explicitly corrects the stale "79/79" figure some plan `<verification>` blocks cited. Live-verified independently: `node scripts/probe-payload-resilience.js` → 82 passed, 0 failed, 0 skipped, matching the inventory's claimed final count exactly. |

**Score:** 6/6 truths verified

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `productRegistry.js` | `HEATRISK_BASE_URL`, `buildHeatRiskIdentifyUrl`, `PRODUCT_REGISTRY.heatRisk`, `MAP_FIELDS`, `assertNoSharedRegistryMaps` | VERIFIED | All present (lines 266, 279-296, 482-519, 537-539, 540-558); load-time assertion runs (line 558); confirmed via `node -e "require('./productRegistry')"` exit 0 |
| `node_helper.js` | `fetchGeoJsonCached(url, isValidBody)`, `_isHeatRiskIdentifyResponse`, `_zipHeatRiskCatalog`, `_dedupeHeatRiskByValidTime`, `_heatRiskDayOffset`, `_cacheHeatRiskTuples`, `_heatRiskTuplesFromCache`, `_runHeatRiskProduct`, 6-member `Promise.allSettled` batch | VERIFIED | All present and wired into `getSpcOutlook`; `heatRisk: heatRiskPayload` sibling key present (line 3588) |
| `MMM-SPCOutlook.js` | `showHeatRisk`/`showMinorHeat` defaults, `products.showHeatRisk`, `heatRiskDaysToRender`, one gate term, one render block | VERIFIED | Defaults at lines 18/32, payload wiring at line 73, shared predicate at 361-378, gate term at 456, render block at 730-743, `escapeHtml`/`validHazardColor` applied to every rendered field (line 739-741) |
| `scripts/check-concurrency-invariant.sh` | Mutation-proven guard over all `_unusableFeatureCount`/`_oldestStaleAt` write sites | VERIFIED | Exists, executable via `bash`, live-run exits 0, covers 4 sites (3 `_unusableFeatureCount`, 1 `_oldestStaleAt`), including the third write site (`checkInPolygon`) discovered mid-phase and not named by the original plan/research |
| `scripts/probe-payload-resilience.js` | 15 new `heatrisk-*`/`frontend-heatrisk-*` scenarios plus supporting fixture/route infrastructure | VERIFIED | Live run: 82 passed, 0 failed, 0 skipped (67 baseline + 15 new, matches inventory) |
| `17-MUTATION-INVENTORY.md` | One row per phase-17 scenario: mutation, RED, restore | VERIFIED | 16 substantive rows (15 scenarios + script proof), cross-referenced against actual scenario names in the probe source, no placeholders |
| `17-DATA03-SPOTCHECK.md` | Enumerated label-to-value table inventory and identity-blind-spot analysis | VERIFIED | Substantive, re-derived from current source this session (not copied from stale docs); enumerates 22 tables, walks every closure, discloses two blind spots honestly |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `productRegistry.js PRODUCT_REGISTRY.heatRisk.configFlag` | `node_helper.js _productToggles` | registry iteration, no SUB_TOGGLES edit | WIRED | `configFlag: "showHeatRisk"` present; no edit to toggle plumbing needed since iteration is registry-driven |
| `node_helper.js fetchGeoJsonCached` | `isValidBody` parameter | defaulted parameter | WIRED | `async fetchGeoJsonCached(url, isValidBody = (body) => this._isFeatureCollection(body))` (line 2446); HeatRisk call site passes `(body) => this._isHeatRiskIdentifyResponse(body)` (line 927) |
| `MMM-SPCOutlook.js getDom no-risk gate` | `heatRiskDaysToRender` | one gate term, same predicate render loop calls | WIRED | Line 456 gate term and line 731 render loop both call the identical `heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat)` expression — confirmed structurally impossible to diverge (also independently confirmed by 17-08's scenario 13 finding that the plan's primary mutation was inexpressible) |
| `node_helper.js _runHeatRiskProduct` | `turf.toMercator` + `PRODUCT_REGISTRY.heatRisk.buildUrl` | reprojection immediately before URL construction | WIRED | Lines 923-925 |
| `node_helper.js getSpcOutlook member closures` | `Promise.allSettled(members.map(...))` | closures built but not invoked until the batch | WIRED | Lines 3404-3430; per-member timing captured independent of resolve order |
| `17-MUTATION-INVENTORY.md` | `scripts/probe-payload-resilience.js` scenario names | one row per scenario, names matching exactly | WIRED | Verified: all 15 scenario names in the inventory match `grep` output from the probe source exactly (cross-checked independently in this verification) |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Full probe suite passes with the expected count | `node scripts/probe-payload-resilience.js` | `PROBE RESULT: 82 passed, 0 failed, 0 skipped` | PASS |
| Concurrency invariant guard is clean | `bash scripts/check-concurrency-invariant.sh` | exit 0, 4/4 sites `OK` | PASS |
| Registry loads without throwing (D-11 assertion holds) | `node -e "require('./productRegistry')"` | exit 0 | PASS |
| Real turf library provides `toMercator` at runtime | `node -e "require('@turf/turf').toMercator"` | `function` | PASS |
| No sibling instance of the 17-08 false-green (`unref()`) bug remains | `grep -n "unref" scripts/probe-payload-resilience.js` | Only the one already-fixed comment referencing the resolved deviation; no live `unref()` call anywhere in the file | PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/probe-payload-resilience.js` (full suite) | `node scripts/probe-payload-resilience.js` | 82 passed, 0 failed, 0 skipped | PASS |
| `scripts/check-concurrency-invariant.sh` | `bash scripts/check-concurrency-invariant.sh` | exit 0 | PASS |

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|-------------|--------|----------|
| HEAT-01 | 17-01, 17-03, 17-04, 17-06, 17-07, 17-08, 17-09 | User sees HeatRisk category (0-4) for Days 1-7 when `showHeatRisk` enabled | SATISFIED | Code + probe + live UAT |
| HEAT-02 | 17-02, 17-04, 17-06, 17-09 | Category attributed to correct day via `idp_validtime` sort | SATISFIED | Code + probe + live UAT |
| HEAT-03 | 17-01, 17-04, 17-06, 17-09 | Real value via Web Mercator reprojection, not `NoData` | SATISFIED | Code + probe + live UAT (production identify URL confirmed) |
| HEAT-04 | 17-02, 17-04, 17-06, 17-07, 17-09 | Duplicate `idp_validtime` resolves to greatest `idp_filedate` | SATISFIED | Code + mutation-proven probe; accepted by operator on fixture-only basis (recorded, not upgraded to live observation) |
| PERF-01 | 17-05, 17-08, 17-09 | New product fetches issued concurrently, bounding cold-start latency | SATISFIED | Code (`Promise.allSettled`) + concurrency guard + probe + live production timing log |
| DATA-03 | 17-01, 17-08, 17-09 | Each product's own label-to-value vocabulary, no cross-product reuse | SATISFIED | Load-time assertion + spot-check document + probe + live 3h15m clean run |

No orphaned requirements: all 6 IDs declared across the 9 plans' `requirements` frontmatter match REQUIREMENTS.md's Phase 17 mapping exactly (`HEAT-01..04, PERF-01, DATA-03`, all marked Complete).

### Anti-Patterns Found

Scanned all phase-17-modified files (`productRegistry.js`, `node_helper.js`, `MMM-SPCOutlook.js`,
`scripts/check-concurrency-invariant.sh`, `scripts/probe-payload-resilience.js`,
`scripts/probe-lib/module-stubs.js`) for debt markers, empty implementations, and hardcoded stubs.

| File | Line | Pattern | Severity | Impact |
|------|------|---------|----------|--------|
| `productRegistry.js` | 469 | comment: "`{layerId}` in the URL is a placeholder for..." | Info | Literal URL-template terminology, not a code stub |
| `node_helper.js` | 3160 | comment: "placeholders for index alignment" | Info | Pre-existing fire-weather array-index comment, unrelated to phase-17 code, not a stub |
| `scripts/probe-lib/module-stubs.js` | 8, 89 | comments explicitly stating code is NOT a placeholder | Info | Documentation reinforcing the real-formula implementation, no debt |

No `TBD`/`FIXME`/`XXX`/`TODO`/`HACK` markers found in any phase-17-modified file. No unreferenced debt markers — debt marker gate clear.

**Deviation review (per task instructions):**
- 17-04's turfStub gap (no `toMercator` at all) — fixed within-phase with a real spherical formula; confirmed present and correct (see spot-check above).
- 17-05's third `_unusableFeatureCount` write site (`checkInPolygon`) — confirmed covered by `check-concurrency-invariant.sh`'s live-verified 4-site list.
- 17-08's `installDeferredHttp` false-green bug (`unref()` + single `releaseAll()`) — confirmed fixed (no `unref()` present; `driveToCompletion` loop present); confirmed no sibling instance exists elsewhere in the probe file (only one `installDeferredHttp` call site, using the fixed pattern).
- 17-08 scenario 13's structurally-impossible primary mutation — confirmed as a genuine positive D-03 finding (gate and render loop are the literal same expression), fallback mutation correctly applied and mutation-proven.
- 17-02's undeclared touch of `scripts/probe-payload-resilience.js` — cosmetic (log-string assertion updates required by the plan's own change), no functional concern.

None of these deviations constitute a gap; all were resolved within the phase and independently re-confirmed here.

### Human Verification Required

None outstanding. The phase's single `<human-check>` block (17-09-PLAN.md, the ROADMAP success-criteria UAT checkpoint) has already been completed by the operator against the live deployed MagicMirror, per the established-fact evidence provided for this verification: HEAT-01/02/03 PASS (live observation), HEAT-04 PASS (accepted on fixture-only basis, explicitly recorded as such), PERF-01 PASS (live production timing), DATA-03 PASS (live 3h15m clean run). No further human verification items were identified during this codebase audit.

### Gaps Summary

No gaps found. All 6 observable truths verified against actual code (not SUMMARY claims), all required artifacts exist, are substantive, and are wired end-to-end; all key links confirmed; the phase's blocking Phase 15 D-10 mutation-proof obligation is fully discharged and independently re-verified (82/82 probe scenarios passing, matching the mutation inventory's claimed count exactly); the DATA-03 spot-check artifact is substantive and honestly discloses its own blind spots rather than overstating coverage; the one known deviation class worth independent scrutiny (17-08's false-green `unref()` bug) was confirmed fixed with no sibling instance remaining. The single documentation nit (ROADMAP's "`Promise.all`" wording vs. the implemented, functionally superior `Promise.allSettled`) does not block the phase goal and is noted for a future ROADMAP wording pass only.

---

_Verified: 2026-09-01_
_Verifier: Claude (gsd-verifier)_
