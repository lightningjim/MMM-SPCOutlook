---
phase: 14-foundation-wpc-excessive-rainfall-outlook
verified: 2026-09-11T00:00:00Z
status: passed
score: 13/13 must-haves verified
has_blocking_gaps: false
overrides_applied: 0
re_verification:
  previous_status: gaps_found
  previous_score: 10/13
  previous_verified: 2026-08-19
  gaps_closed:
    - "CR-01 residual — a real non-NONE ERO tier silently reported as NONE when the winning polygon is not `features[0]` and feature 0 lacks `properties`. Closed at node_helper.js:391-394 (`value > 0 ? this._validTimeOfWinner(polys, loc, value, row.validTimeField) : null`) plus the never-throwing helper at node_helper.js:2167-2187. Zero live `features[0]` dereferences remain anywhere in the file (all six remaining occurrences are comments). Mutation-proven by this verifier: restoring the old `fetchResult.data.features[0]` deref turned `ero-leading-bad-feature-preserves-risk` RED with the exact prior symptom — `day1Risk expected MDT, got NONE`."
    - "CR-02 — a malformed body on any SPC/fire-weather layer writing a `0`/NONE result into `_geoJsonCache` under the bad body's ETag. Closed at the SOURCE rather than per call site: `rejectBody` (node_helper.js:4041-4050) returns `data: null` for every unusable body. Enumerated all 22 `return` sites in `_fetchGeoJsonCachedInner`; exactly two carry non-null `data` (node_helper.js:4118, :4134) and both are immediately preceded by an `isValidBody(...)` gate. All 22 `_geoJsonCache.set` call sites sit inside a `fetchResult.data !== null` branch, so no caller can receive — let alone cache — a rejected body. Mutation-proven: deleting the two `isValidBody` gates turned `ero-arcgis-error-body` RED with `a rejected ArcGIS error body was written to _geoJsonCache`."
    - "CR-03 — non-2xx/network hard failure producing no `Log.error` and no `_stale` flag. Closed on both halves: the producer emits `Log.error` + `failed: true` at node_helper.js:3988-3990 (network/DNS) and :4025-4026 (non-2xx), plus :3999-4000 (304 with no entry) and :4078-4079 (body-read failure); the consumer side reads it at all 25 `fetchResult.stale || fetchResult.failed` call sites (node_helper.js:365, 764, 1071, 4155, 4178, and the twenty legacy SPC/fire-weather sites at :4472-:4920). Mutation-proven twice: removing `failed: true` from the non-2xx branch turned `wssi-hard-fail-is-flagged` and `an-hour-old-reading-still-survives-a-hiccup-but-a-day-old-one-does-not` RED; making the ERO runner ignore `.failed` turned five scenarios RED including `ero-hard-fail-is-flagged`."
  gaps_remaining: []
  regressions: []
  what_changed: >-
    The 2026-08-19 report was written against the tree at plan 14-07. The tree has since
    moved through an 18-commit round-3 review-fix wave (14-REVIEW.md / 14-REVIEW-FIX.md,
    14 findings, 14 fixed, 0 skipped) and phases 15-19.1. All three blocking gaps are
    closed in source at HEAD and each is pinned by at least one mutation-proven probe
    scenario. The probe suite grew from 6 scenarios to 191. The prior report's findings are
    preserved verbatim below under "Superseded findings (2026-08-19)".
gaps: []
deferred:
  - truth: "UAT test 2 — ERO off by default observed on live hardware (CFG-01)"
    addressed_in: "Not scheduled — owner deferral"
    evidence: "14-UAT.md test 2 result `skipped`: no active Excessive Rain forecast at the home location, so absence of rows cannot distinguish 'toggle off' from 'no risk'. Re-testable at the test-3 inside fixture (36.3123, -111.0937) with the key removed. Structural evidence stands: MMM-SPCOutlook.js:8 `showExcessiveRain: false` default, MMM-SPCOutlook.js:173 per-flag snapshot, probe `ero-toggle-off` and `cr03-day-rows-honor-every-per-product-toggle`."
  - truth: "UAT test 9 — two instances at two locations each show their own location's result"
    addressed_in: "Not scheduled — DEFERRED-BY-OWNER"
    evidence: "14-UAT.md test 9 result `skipped`; STATE.md Deferred Items rows 'Multi-instance cache/broadcast isolation (round-2 CR-01/CR-02) — Deferred — unreachable single-instance | Phase 14 close' and 'UAT test 9 (two instances, two locations) — Skipped — not a realistic config for this deployment | Phase 14 close'. Unreachable in a single-instance deployment; the single-instance-reachable variant (overlapping polls) was fixed, not deferred (commit 09af950, `_inFlight` guard + monotonic `_seq`)."
human_verification: []
---

# Phase 14: Foundation & WPC Excessive Rainfall Outlook Verification Report

**Phase Goal:** Users can enable per-product toggles on a payload shape that no longer forks on `extended`, and see their location's WPC Excessive Rainfall Outlook risk for Days 1–5 — establishing the fetch/cache/toggle conventions every later product reuses.

**Verified:** 2026-09-11
**Status:** passed
**Re-verification:** Yes — third pass. Supersedes the 2026-08-19 report (`gaps_found`, 10/13, three blocking gaps), which was written before the round-3 review-fix wave and was flagged by the v2.0 milestone audit (2026-09-11) as the milestone's single stale artifact.

## Method and claim strength

Every claim below is graded. I did not accept SUMMARY, UAT, review, or milestone-audit assertions as evidence for any structural claim:

- **PROVEN (source)** — read at HEAD, cited `file:line`.
- **PROVEN (mutation)** — I broke the guard in `node_helper.js`, re-ran the probe, observed the named scenario turn RED, then `git checkout -- node_helper.js`. This is the only thing that distinguishes a load-bearing scenario from a vacuous one. Five mutations were run; results are in the Mutation Proofs table.
- **ACCEPTED (UAT)** — human observation on live hardware, recorded in `14-UAT.md` (status `complete`, 2026-08-23, 9 tests / 7 pass / 0 issues / 2 skipped). Used only for things no offline probe can assert (real WPC tiers matching the public map, real network traces).
- **NOT OBSERVABLE** — no ground truth available; recorded as deferred, never as a pass.

Working tree was clean for `node_helper.js`, `productRegistry.js`, `MMM-SPCOutlook.js` and `scripts/` before and after every mutation.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With `extended: false` and `showExcessiveRain: true`, ERO rows still render — payload no longer forks on `extended` (ROADMAP SC1 / CFG-02) | VERIFIED | **PROVEN (source + probe).** Every ERO probe scenario calls `helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true })` — the third argument IS `extended: false` — and `ero-wellformed-slgt` / `ero-leading-bad-feature-preserves-risk` still resolve `SLGT` / `MDT`. Frontend gate is per-product, not `extended`-derived: `MMM-SPCOutlook.js:1099-1104` `DAY_SOURCE_FLAGS = { "wpc-ero": "showExcessiveRain", ... }`. In `node_helper.js`, `extended` survives only at :3274, :3331, :4785, :4836 — all legacy SPC day-4-8 / fire-weather fetch decisions, none of them payload-shape forks (`getSpcOutlook` docstring, node_helper.js:4223-4240, states the block is always emitted with zero defaults). **ACCEPTED (UAT)** test 6 `pass`. |
| 2 | `showExcessiveRain` toggles independently of every other flag and defaults to `false` out of the box (ROADMAP SC2 / CFG-01) | VERIFIED | **PROVEN (source + probe).** `MMM-SPCOutlook.js:8` — `showExcessiveRain: false, // every new product flag defaults to false`; `MMM-SPCOutlook.js:171-179` builds an independent per-flag `products` snapshot (7 flags, no coupling); `productRegistry.js:303` `configFlag: "showExcessiveRain"`; `node_helper.js:355` gates the whole ERO loop on `productToggles[row.configFlag]`. Probe: `ero-toggle-off`, `cr03-day-rows-honor-every-per-product-toggle` PASS. Live confirmation deferred — see `deferred` (UAT test 2 skipped, documented reason). |
| 3 | Correct ERO tier label (MRGL/SLGT/MDT/HIGH) for Days 1-5, from ERO's own `dn` domain (ROADMAP SC3 / ERO-01, ERO-02) | VERIFIED | **ACCEPTED (UAT) for the live half + PROVEN (probe) for the rest.** UAT test 3 `pass` — five Marginal rows in `#7ac687` at (36.3123, -111.0937), cross-checked against WPC's public ERO map; UAT test 4 `pass` — Day-1 Slight `#f7f690` at (35.6348, -79.2413). Registry mapping read at HEAD: `productRegistry.js:85` `eroDnToValue = {1:1,2:2,3:3,4:4}`, :87 `eroValueToTier = {0:"NONE",1:"MRGL",2:"SLGT",3:"MDT",4:"HIGH"}`, :314 `toValue: (label, f) => eroDnToValue[f.properties.dn] \|\| 0`. MDT proven offline only (`ero-leading-bad-feature-preserves-risk` asserts `MDT`); HIGH (`dn: 4`) remains schema-only — `productRegistry.js:321-324` records that no live `dn: 4` feature has ever been observed. That is a data-availability limit, not a code gap. |
| 4 | A day where the location falls outside every ERO polygon shows no ERO row — not empty, not an error row (ROADMAP SC4 / ERO-03) | VERIFIED | **ACCEPTED (UAT) + PROVEN (source).** UAT test 4 `pass` (exactly one row; Days 2-5 produce no row at all) and test 5 `pass` (zero rows, clean absence, no error row, no "None" row — validated at the home location rather than the Seattle fixture, noted in the UAT). Value-gated render survives the Phase 19 `getDom` rewrite: `MMM-SPCOutlook.js:1099-1104` day-source flags plus the shared displayable predicate. |
| 5 | ERO requests always carry `f=geojson`, never `f=json`; the same query string repeats across polls so the ETag/hash cache hits (ROADMAP SC5 / DATA-01, PERF-02) | VERIFIED | **PROVEN (source) + ACCEPTED (UAT).** `productRegistry.js:31` — `return \`${baseUrl}/${layerId}/query?where=1%3D1&outFields=*&f=geojson\`` — a single non-parameterized builder (`productRegistry.js:11` "must never become a parameter"); ERO row builds through it at :311. Regression-checked: `grep -c -E "mapservices\.weather\.noaa\.gov\|f=geojson\|f=json" node_helper.js` → `0`, so no URL or format literal has leaked into the helper. The one `f=json` in the repo is HeatRisk's ImageServer `identify` (`productRegistry.js:270-272`), a different endpoint kind, not an ERO fallback. UAT test 8 `pass` (two poll cycles, byte-identical query strings, cache-hit lines on cycle 2). |
| 6 | `excessiveRain` (and the rest of the payload) survives an ArcGIS error-shaped ERO response without collapsing to `{ error }` (the original CR-01) | VERIFIED | **PROVEN (mutation).** `ero-arcgis-error-body` PASS; deleting both `isValidBody` gates (mutation M2) turns it RED. Still closed — no regression from the later waves. |
| 7 | **Gap 1 — ERO tier is correct when the winning polygon is not `features[0]` and `features[0]` lacks `properties`** | **VERIFIED — CLOSED** | **PROVEN (source + mutation).** `node_helper.js:388-394`: `validTime = value > 0 ? this._validTimeOfWinner(polys, loc, value, row.validTimeField) : null;` — the valid-time read is now (a) off the *winning* polygon, (b) gated on a resolved risk, so it can no longer discard an already-computed tier. `_validTimeOfWinner` (node_helper.js:2167-2187) cannot throw: it guards `Array.isArray(items)`, `!item`, `!item.poly`, and `!props \|\| typeof props !== "object"`, and `continue`s rather than `return null`s on each (WR-07). `grep -n "features\[0\]" node_helper.js` returns six hits, **all six inside comments** (:390, :1546, :2044, :2163, :2177, :5479) — zero live dereferences. Mutation M1: restoring `const firstFeature = fetchResult.data.features[0]; validTime = firstFeature ? firstFeature.properties[row.validTimeField] : null;` turned three scenarios RED, including the exact prior symptom `day1Risk expected MDT, got NONE — a property-less leading feature discarded a real risk`. |
| 8 | **Gap 2 — the `extractPolygons` hardening does not let a malformed body poison `_geoJsonCache` on the pre-existing SPC/fire-weather layers** | **VERIFIED — CLOSED** | **PROVEN (source enumeration + mutation).** The fix is at the source, which is strictly stronger than the ~11 per-call-site guards the prior report asked for: `rejectBody` (node_helper.js:4041-4050) logs, optionally serves a still-fresh cached reading, and always returns `data: null`. I enumerated every `return` in `_fetchGeoJsonCachedInner` (22 sites, lines 3983-4134): exactly two carry non-null `data` — :4118 and :4134 — and each is immediately preceded by `if (!isValidBody(parsed.value)) return rejectBody('not a usable body');` (:4117, :4133). I then enumerated all 22 `_geoJsonCache.set` call sites (:395, :557, :641, :4167, :4206, :4513, :4584, :4647, :4672, :4702, :4739, :4751, :4766, :4778, :4801, :4813, :4853, :4873, :4893, :4913, :4933) and confirmed each sits in a `fetchResult.data !== null` branch (spot-read the legacy day-1 categorical at :4487-:4520 — the `set` is in the final `else`, unreachable when `data === null`). A rejected body therefore cannot reach *any* cache-write site, ERO or legacy. Mutation M2 (delete both `isValidBody` gates): `ero-arcgis-error-body` RED with `a rejected ArcGIS error body was written to _geoJsonCache` and `ero-rejected-body-serves-last-known-good` RED with `a WPC hiccup blanked an active tier`. |
| 9 | **Gap 3 — a non-2xx/network hard failure is observable: `Log.error` is emitted and the payload carries the degrade signal** | **VERIFIED — CLOSED** (one non-blocking coverage caveat) | **PROVEN (source + mutation).** Producer: `node_helper.js:3986-3990` (network/DNS catch) and `:4023-4026` (non-2xx) each emit `Log.error('MMM-SPCOutlook: unrecoverable fetch failure for ' + url + ...)` and return `failed: true`; the same treatment now also covers 304-with-no-entry (:3998-4000) and a mid-body read failure (:4076-4079); `rejectBody` (:4042) logs `rejected an unusable response body for ... not caching`. Consumer: **all 25** fetch call sites read the flag — `if (fetchResult.stale \|\| fetchResult.failed) anyStale = true` at :365 (ERO/arcgis-day runner), :764, :1071, :4155, :4178, and `noteStale(...)` at the twenty legacy SPC/fire-weather sites :4472-:4920. Mutation M3 (drop `failed`+log on the non-2xx branch) → `wssi-hard-fail-is-flagged` and `an-hour-old-reading-still-survives-a-hiccup-but-a-day-old-one-does-not` RED. Mutation M5 (ERO runner ignores `.failed`) → five scenarios RED including `ero-hard-fail-is-flagged`. **Caveat (WARNING, not blocking):** mutation M4 — deleting `Log.error` + `failed: true` from the *network-error* branch specifically — left the suite at 191/191 green. See Mutation Proofs and Anti-Patterns. The behavior is correct in source at HEAD; only its regression pin is missing. |
| 10 | With `extended: false`, existing SPC Day 1-3 and fire weather Day 1-2 values are unchanged (CFG-02 back-compat) | VERIFIED | **PROVEN (source + probe) + ACCEPTED (UAT).** The legacy SPC/fire-weather paths still run their own code (node_helper.js:4460-4940) and all twenty of their fetch sites now consume `.failed` (previously none did). UAT test 1 `pass` (cold start, normal SPC/fire rows, no error box) and test 7 `pass` (no-risk gate shows "No Severe Weather Risk" exactly once, at the corrected San Diego fixture). Probe carries `spc-*`, `merge-*` and `frontend-*` scenarios across the same paths; full suite 191/191. |
| 11 | ERO's `dn`→tier vocabulary remains structurally isolated from fire weather's `DN` map (ERO-02 / DATA-03) | VERIFIED | **PROVEN (source).** `productRegistry.js:80-87` declares `eroDnToValue` (lowercase `dn`, values 1-4) with an explicit comment that the fire-weather `DN` table is uppercase with values 5/8/10. `productRegistry.js:522-545` is a load-time assertion (D-11) that no two registry rows share object identity on any value/tier/text/colour map — including `dayLayers` and `layers` after 17-REVIEW WR-07. The docstring honestly states its own limit (a closure reading a foreign constant by name would pass), which is why the paired spot-check inventory in `17-PATTERNS.md §9` exists. |
| 12 | The probe is real regression tooling — it would catch these regressions rather than pass vacuously | VERIFIED | **PROVEN (mutation).** `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 191 passed, 0 failed, 0 skipped`, `EXIT=0`. I ran five independent source mutations; four turned the suite RED with scenario-specific, on-target messages (see Mutation Proofs). The gap-pinning scenarios carry explicit anti-vacuity machinery I read in full: `ero-malformed-feature` now adds `forbidLog("TypeError", ...)` and a *positive control* re-running the same helper at the same location with a good body to prove the loop is live (probe:1605-1623); `ero-hard-fail-is-flagged` adds a *negative control* with the ERO toggle off to prove the staleness originated in the ERO (probe:1721-1731); `ero-rejected-body-serves-last-known-good` warms the cache over the real `_fetch` transport, changes the ETag so the cache-hit short-circuit cannot mask the test, then asserts the cached value survived (`entry.result.value !== 2`), `_stale === true`, `_staleAsOf === entry.timestamp`, and the exact log text (probe:2026-2075). None of these can pass vacuously. |
| 13 | A cached ERO day yields the same tier string as a freshly-fetched one (PERF-02) | VERIFIED | **PROVEN (source).** `node_helper.js:405-409`: `tiers[d] = row.valueToTier[value] \|\| "NONE"` sits *after* the cache-hit/fresh-fetch branch closes, with the comment "Convert exactly once, after the branch closes — never inside either branch". **ACCEPTED (UAT)** test 8 `pass` (cycle-2 cache hits with identical rendering). |

**Score:** 13/13 truths verified. Previous: 10/13.

### Deferred Items

| # | Item | Addressed In | Evidence |
|---|------|-------------|----------|
| 1 | UAT test 2 — ERO off by default, observed live | Owner deferral, not scheduled | `14-UAT.md` test 2 `skipped`: no live ERO risk at the home location, so absence of rows cannot distinguish "toggle off" from "no risk". Structural evidence (truth 2) stands. **NOT OBSERVABLE, not a pass.** |
| 2 | UAT test 9 — two instances, two locations | Owner deferral (DEFERRED-BY-OWNER), not scheduled | `14-UAT.md` test 9 `skipped`; `STATE.md` Deferred Items rows "Multi-instance cache/broadcast isolation (round-2 CR-01/CR-02) — Deferred — unreachable single-instance \| Phase 14 close" and "UAT test 9 … \| Phase 14 close". The single-instance-reachable variant (overlapping polls) was **fixed**, not deferred (`_inFlight` guard + monotonic `_seq`, commit 09af950). **NOT OBSERVABLE in this deployment, not a pass.** |

Neither deferral blocks a ROADMAP success criterion: SC2's code path is proven structurally and by probe, and multi-instance isolation is not a ROADMAP SC for this phase.

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `node_helper.js` | Winning-polygon valid-time read, source-level body rejection, observable hard failures | VERIFIED | `_validTimeOfWinner` :2167; `_isFeatureCollection` :2000; `extractPolygons` entry + per-feature guards :2050-2070; `rejectBody` :4041; hard-failure `Log.error` + `failed: true` at :3990, :4000, :4026, :4079; generic `_runArcGisDayProduct` runner :341-435. Wired and data-flowing, not stub. |
| `productRegistry.js` | ERO row with its own `dn` vocabulary and a non-parameterized `f=geojson` builder | VERIFIED | `buildArcGisQuery` :31; `excessiveRain` row :299-325; D-11 cross-row identity assertion :522-545. |
| `MMM-SPCOutlook.js` | Per-product toggle defaulting false, value-gated ERO rendering | VERIFIED | Default :8; per-flag snapshot :171-179; `DAY_SOURCE_FLAGS` :1099-1104. |
| `scripts/probe-payload-resilience.js` | Offline probe pinning the three gaps, non-vacuously | VERIFIED | 191 scenarios, exit 0. Fifteen ERO/WSSI-family scenarios including the three named gap pins. Anti-vacuity controls read in source (truth 12). |
| `scripts/probe-lib/module-stubs.js` | Dependency-free loader | VERIFIED | Used by the live run; `installHttp` stubs at the `_fetch` transport seam so scenarios drive the *real* `fetchGeoJsonCached` (probe:3288-3302) rather than a fabricated return shape — this is what makes M2/M3 detectable at all. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| ERO/arcgis-day runner | `_validTimeOfWinner` | `value > 0 ? ... : null` | WIRED | node_helper.js:391-394. Replaces the `features[0]` deref entirely. |
| `_fetchGeoJsonCachedInner` | `rejectBody` | `isValidBody` gate on both data-bearing returns | WIRED | :4117/:4118 and :4133/:4134 — the only two paths that can emit non-null `data`. |
| `rejectBody` | every `_geoJsonCache.set` site | `data: null` ⇒ the cache-write branch is unreachable | WIRED | 22 set sites, all inside `data !== null` branches. This is the source-level form of gap 2's fix. |
| `fetchGeoJsonCached` hard failures | caller staleness signal | `failed: true` → `anyStale` / `noteStale(...)` | WIRED | 25 call sites, enumerated above. Previously NOT WIRED. |
| `anyStale` | user-visible ⚠ badge | `_stale` in the payload, first term of `getDom`'s no-risk gate | WIRED | `14-REVIEW-FIX.md` CR-01 (commit `0964f1c`); probe `cr02-a-summary-that-contradicts-the-render-is-never-a-confident-all-clear`, `wr01-empty-render-distinguishes-unconfirmed-from-filtered-from-genuinely-clear` PASS. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| ERO render block | `excessiveRain.dayNRisk` | live ArcGIS query → `_runArcGisDayProduct` | Yes — live MRGL×5 and SLGT×1 observed at two fixtures (14-UAT tests 3, 4) | FLOWING |
| ERO render block (feature-ordering edge case) | same | multi-feature body, winner not first, feature 0 property-less | Yes — `MDT` survives | FLOWING (was HOLLOW) |
| SPC categorical / fire weather | `out.day1`, `out.fireWeather` | `fetchGeoJsonCached` + `_geoJsonCache` | Yes — a rejected body can no longer enter the cache | FLOWING (was DISCONNECTED) |
| `excessiveRain.dayNValidTime` | same | `_validTimeOfWinner` | Correct, but had **no consumer** until Phase 18's MERGE-01 | FLOWING (noted in STATE.md; informational) |

### Mutation Proofs

The load-bearing test. Each mutation was applied to `node_helper.js`, the probe re-run, then `git checkout -- node_helper.js`.

| # | Mutation | Target gap | Suite result | Verdict |
|---|----------|-----------|--------------|---------|
| M1 | Restore `const firstFeature = fetchResult.data.features[0]; validTime = firstFeature ? firstFeature.properties[row.validTimeField] : null;` | Gap 1 | `188 passed, 3 failed` — `ero-leading-bad-feature-preserves-risk: day1Risk expected MDT, got NONE`; `ero-malformed-feature: day1 resolved to NONE via an exception … TypeError: Cannot read properties of null (reading 'valid_time')`; `ero-same-tier-null-valid-time-falls-through` | Guard is load-bearing; the probe reproduces the *exact* 2026-08-19 symptom |
| M2 | Delete both `if (!isValidBody(parsed.value)) return rejectBody(...)` gates | Gap 2 | `189 passed, 2 failed` — `ero-arcgis-error-body: a rejected ArcGIS error body was written to _geoJsonCache`; `ero-rejected-body-serves-last-known-good: a WPC hiccup blanked an active tier: expected the cached SLGT, got NONE` | Guard is load-bearing; the failure message names cache poisoning directly |
| M3 | Drop `Log.error` + `failed: true` from the **non-2xx** hard-failure return | Gap 3 (producer) | `189 passed, 2 failed` — `wssi-hard-fail-is-flagged`; `an-hour-old-reading-still-survives-a-hiccup-but-a-day-old-one-does-not` | Load-bearing |
| M4 | Drop `Log.error` + `failed: true` from the **network-error** hard-failure return | Gap 3 (producer) | `191 passed, 0 failed` — **survivor** | **Not pinned.** Root cause: `installFetch`'s unrouted default hand-fabricates `{ failed: true }` at the `fetchGeoJsonCached` level (probe:934-941) and `installHttp`'s unrouted default is a **503** (probe:3299), so no scenario ever makes `helper._fetch` *reject*. `throwingFetch` (probe:870-874) throws at the `fetchGeoJsonCached` seam, not the transport seam. Behavior is correct in source (node_helper.js:3986-3990); only its regression pin is absent. Non-blocking — see Anti-Patterns. |
| M5 | ERO runner ignores `.failed` (`if (fetchResult.stale)` only) | Gap 3 (consumer) | `186 passed, 5 failed` — incl. `ero-hard-fail-is-flagged`, `ero-arcgis-error-body`, `ero-304-with-no-cache-entry-is-a-hard-failure` | Load-bearing |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| Probe suite runs clean at HEAD | `node scripts/probe-payload-resilience.js` | `PROBE RESULT: 191 passed, 0 failed, 0 skipped`, `EXIT=0` | PASS |
| All three gap-pinning scenarios present and green | filter of the same run | `PASS ero-leading-bad-feature-preserves-risk`, `PASS ero-rejected-body-serves-last-known-good`, `PASS ero-hard-fail-is-flagged` | PASS |
| Zero live `features[0]` dereferences | `grep -n "features\[0\]" node_helper.js` | 6 hits, all in comments | PASS |
| No URL/format literal leaked into the helper (DATA-01) | `grep -c -E "mapservices\.weather\.noaa\.gov\|f=geojson\|f=json" node_helper.js` | `0` | PASS |
| No debt markers in the phase's files | `grep -E "TBD\|FIXME\|XXX"` then `TODO\|HACK\|PLACEHOLDER` over `node_helper.js`, `productRegistry.js`, `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`, `scripts/probe-lib/*.js` | zero matches in both passes | PASS |
| Tree unmodified by this verification | `git status --porcelain node_helper.js scripts/ productRegistry.js MMM-SPCOutlook.js` | empty, before and after all five mutations | PASS |

### Probe Execution

| Probe | Command | Result | Status |
|-------|---------|--------|--------|
| `scripts/probe-payload-resilience.js` | `node scripts/probe-payload-resilience.js` | `PROBE RESULT: 191 passed, 0 failed, 0 skipped`, exit 0 | PASS — run by this verifier, not quoted from any SUMMARY |

The probe does not live under `scripts/*/tests/probe-*.sh`, but it is the project's conventional probe and is treated as the phase's runnable gate.

### Requirements Coverage

| Requirement | Description | Status | Evidence |
|-------------|-------------|--------|----------|
| CFG-01 | Each new product enabled independently via its own boolean, defaulting to false | SATISFIED | Truth 2. Live confirmation deferred (UAT test 2). |
| CFG-02 | Existing SPC/fire weather config keeps working; `extended` no longer gates payload shape | SATISFIED | Truths 1 and 10. The 2026-08-19 caveat ("no longer unconditionally true" because of cache poisoning) is **removed** — gap 2 is closed at the source. |
| DATA-01 | WGS84 geometry, `f=geojson` on every ArcGIS endpoint, no raw `f=json` fallback | SATISFIED | Truth 5. |
| PERF-02 | ETag/SHA256 cache stays effective, no cache-key multiplication | SATISFIED | Truths 5, 13. The 2026-08-19 "confidently wrong cache" caveat is removed; `ero-rejected-body-serves-last-known-good` asserts the cached reading survives a hiccup rather than being overwritten. |
| ERO-01 | User sees their ERO tier for Days 1-5 when `showExcessiveRain` is enabled | SATISFIED | Truths 3, 7. Previously BLOCKED by gap 1. |
| ERO-02 | Correct tier from ERO's own `dn` domain, not fire weather `DN` | SATISFIED | Truths 3, 11. Previously BLOCKED by gap 1. |
| ERO-03 | No ERO row for a day outside all ERO polygons | SATISFIED | Truth 4. The 2026-08-19 concern that a false `NONE` is observationally identical to a genuine one is resolved: a degrade now always raises `_stale`, and `_stale` is the first term of the no-risk gate, so "no risk" and "unconfirmed" render differently. |

No orphaned requirements — the IDs declared across plans 14-01..14-07 match REQUIREMENTS.md's Phase 14 traceability rows exactly.

**Tracking discrepancy (documentation, non-blocking):** `REQUIREMENTS.md` still lists CFG-01, CFG-02, ERO-01 and ERO-03 as unchecked `[ ]` / `Pending` (lines 11, 13, 61-62, 109-115) while their implementations verify here. This is the same stale-tracking observation both prior verifications made, and it matches `v2.0-MILESTONE-AUDIT.md` finding at line 35 ("11 REQUIREMENTS.md traceability rows still read `Pending`"). Code is correct; the checkbox is not. Left for the milestone-close step, not counted as a phase gap.

### Anti-Patterns Found

| File | Line(s) | Pattern | Severity | Impact |
|------|---------|---------|----------|--------|
| `scripts/probe-payload-resilience.js` | probe:870-874 (`throwingFetch`), :934-941 (`installFetch` default), :3299 (`installHttp` default) | **Mutation survivor M4** — no scenario drives `helper._fetch` to *reject*, so `fetchGeoJsonCached`'s network-error branch (node_helper.js:3986-3990) is unpinned. `throwingFetch` throws one layer too high; `installHttp`'s fallback is a 503, which takes the *other* branch. | Warning | A future edit could silently delete the `Log.error` + `failed: true` on the network/DNS path — the dominant real-world failure — and the suite would stay green. The behavior is correct today (source-verified), so this is a coverage debt, not a defect. Suggested fix: an `installHttp` route whose handler rejects, asserting `_stale === true` and the `(network error:` log line. Recommend backlog. |
| `node_helper.js` | `getSpcOutlook`'s helper-global `_unusableFeatureCount`, `_oldestStaleAt` | Per-run helper-global sampling instead of threading values through ~25 call sites | Warning, known | Documented in `STATE.md` Notes: safe only because the `_inFlight` guard makes chain overlap unreachable. Must be revisited if that guard is ever removed. Carried forward, not a Phase 14 gap. |
| `node_helper.js` / `productRegistry.js` / `MMM-SPCOutlook.js` | various | Phase 14 IN-01..IN-08 (Info/CONVENTION findings: ERO palette sourcing, unescaped `innerHTML` traced to no live XSS, mutable registry exports, loose equality, duplicated day-indexed idioms) | Info, accepted | Recorded as `Quality \| Phase 14 IN-01..IN-08 \| Accepted \| Phase 14 close` in STATE.md's Deferred Items and as a Pending Todo. Not blocking. |

Zero `TBD`/`FIXME`/`XXX` and zero `TODO`/`HACK`/`PLACEHOLDER` markers in any of the phase's files.

**Every blocker-severity anti-pattern from the 2026-08-19 report is gone:** the unguarded `firstFeature.properties` deref, the ~11 unguarded SPC cache-write sites, and the two silent hard-failure returns.

### Human Verification Required

None outstanding. `14-UAT.md` (status `complete`, 2026-08-23) re-tested all five ROADMAP success criteria against the post-fix tree: 9 tests, 7 pass, 0 issues, 2 skipped with recorded owner rationale. The two skips are recorded above as **deferred / NOT OBSERVABLE**, not as passes.

### Gaps Summary

**No gaps. All three 2026-08-19 blocking gaps are closed in source at HEAD, and each is pinned by at least one mutation-proven probe scenario.**

The most important thing to say about gap 2 is that the fix is *better* than the one the prior report prescribed. That report asked for the ERO loop's `_isFeatureCollection` guard to be replicated at each of the ~11 legacy SPC/fire-weather cache-write sites — eleven copies of one policy, eleven places to forget it. What shipped instead moved the policy into `fetchGeoJsonCached` itself: `rejectBody` returns `data: null`, and since only two of the function's 22 return sites can emit non-null `data` and both are `isValidBody`-gated, *no* caller can receive a rejected body, so no caller can cache one. The property is now structural rather than conventional, which also means phases 15-19 inherited the guarantee for free rather than inheriting the defect.

Gap 1 is closed by removing the failing construct outright rather than guarding it — there is not one live `features[0]` dereference left in `node_helper.js`. Gap 3 is closed on both halves, producer and consumer, with all 25 call sites now reading the `failed` flag where previously none did; the follow-on `14-REVIEW-FIX.md` CR-01 change made `_stale` the first term of `getDom`'s no-risk gate, so the degrade is not merely logged but rendered ("No Severe Weather Risk (unconfirmed)").

**The one honest caveat**, stated rather than smoothed over: mutation M4 survived. Deleting the `Log.error` and the `failed: true` from `fetchGeoJsonCached`'s *network-error* catch left the suite 191/191 green, because every probe failure fixture either short-circuits `fetchGeoJsonCached` entirely or answers a non-2xx status — nothing ever makes the transport reject. The code at HEAD is correct (node_helper.js:3986-3990, read directly), so this is not a functional gap and does not block the phase; it is a regression-coverage hole on exactly the branch CR-03 was raised about. It is recorded as a WARNING and recommended for backlog, not as a blocker.

Phase goal achieved. The milestone audit's characterization — "Phase 14's verification is stale, not failing" — is confirmed by independent verification rather than accepted on its word.

---

## Superseded findings (2026-08-19)

Preserved per this project's amend-and-mark-superseded convention. **All three are CLOSED as of 2026-09-11**; they are retained for auditability, not as live findings.

- **Gap #7 (CR-01 residual) — SUPERSEDED/CLOSED.** Was: `node_helper.js:1027-1029` did `const firstFeature = fetchResult.data.features[0]; eroValidTime = firstFeature ? firstFeature.properties[ero.validTimeField] : null;` with no guard on `firstFeature.properties`. With `features[0].properties === null` and `features[1] = { dn: 3 }` containing the user, this threw `TypeError`, the per-day catch swallowed it, and the already-correct `MDT` was discarded as `NONE`. Closed by `_validTimeOfWinner` (truth 7); the prior report's *own* reproduction is now the probe's `ero-leading-bad-feature-preserves-risk` fixture, and I re-created the defect by mutation to confirm the scenario detects it.
- **Gap #8 (CR-02, SPC cache poisoning) — SUPERSEDED/CLOSED.** Was: none of the ~11 SPC/fire-weather `_geoJsonCache.set` sites (then at lines 571, 635, 698, 723, 753, 786, 798, 813, 825, 848, 860, 900) checked `_isFeatureCollection` before writing a degraded `0` with the bad body's ETag, pinning a false all-clear across every later 304. Closed at the fetch layer instead of per-site (truth 8).
- **Gap #9 (CR-03, silent hard failure) — SUPERSEDED/CLOSED.** Was: `fetchGeoJsonCached`'s hard-failure returns (then ~298-304 and ~314-319) emitted no log and carried no `failed` flag, so a 503 or DNS blip was indistinguishable from a genuine all-clear. Closed on both halves (truth 9), with the residual coverage caveat recorded above under M4.
- **Pre-existing, still open, still non-blocking (prior CR-04 / round-2 CR-02):** unguarded `await` on `getMesoscaleDiscussion`/`getSpcOutlook` in `socketNotificationReceived`. Predates Phase 14; not counted as a Phase 14 gap in any of the three verification passes.
- **Prior probe-quality warnings (WR-02/WR-03/WR-04) — RESOLVED.** The 2026-08-19 report noted that `ero-malformed-feature` passed via the crash path it claimed to test, that no scenario asserted SPC values survive an ERO failure, and that `logCalls` was captured but never asserted on. All three are fixed: `forbidLog`/`requireLog` are now used, positive and negative controls are in place, and `installHttp` drives the real `fetchGeoJsonCached` through the transport seam. Suite grew 6 → 191 scenarios.

---

_Verified: 2026-09-11_
_Verifier: Claude (gsd-verifier), re-verification pass 3, superseding the 2026-08-19 report_
