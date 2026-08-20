---
phase: 14-foundation-wpc-excessive-rainfall-outlook
verified: 2026-08-20T00:17:58Z
status: gaps_found
score: 9/10 must-haves verified
has_blocking_gaps: true
overrides_applied: 0
gaps:
  - truth: "excessiveRain (and the rest of the payload) survives an ArcGIS error-shaped ERO response without collapsing to `{ error }` — the D-05 'one payload shape regardless of configuration' guarantee this foundation phase exists to establish"
    status: failed
    severity: blocking
    reason: >
      ArcGIS REST returns most ERO failures (invalid layer id, service
      restart, throttling, token errors) as HTTP 200 with a JSON body shaped
      like `{"error":{"code":400,...}}` and no `features` array.
      `fetchGeoJsonCached` treats any `res.ok` (200) as success and returns
      that body as `data` with no shape validation. The ERO loop then calls
      `extractPolygons(fetchResult.data, ...)`, which unconditionally does
      `geojson.features.forEach(...)` — independently reproduced here with a
      standalone Node script: `TypeError: Cannot read properties of
      undefined (reading 'forEach')`. That throw is not caught locally (no
      try/catch around the ERO fetch loop); it propagates to
      `getSpcOutlook`'s single outer catch (node_helper.js ~1152-1155), which
      returns `{ error: err.toString() }` — a payload with no `day1`-`day8`,
      no `fireWeather`, and no `excessiveRain`. An optional, default-off
      product can therefore take the module's entire SPC/fire-weather
      display offline whenever the new third-party WPC ArcGIS host has a
      transient hiccup, for as long as that hiccup lasts. This is exactly
      the failure mode D-05 ("a product toggle being off/on never changes
      the payload shape... Phase 18's merge logic must never null-check for
      a missing product key") and the phase's own "establishing the
      fetch/cache/toggle conventions every later product reuses" goal
      clause were meant to prevent — and because it lives in the shared
      `getSpcOutlook` try/catch and the unvalidated `fetchGeoJsonCached`
      helper, Phases 15-17 will inherit the identical hazard for every future
      registry row. Neither the phase's own live probes nor the human UAT
      pass exercised this path (WPC's ArcGIS endpoint was healthy throughout
      this phase), so it stayed latent through both verification gates.
    artifacts:
      - path: "node_helper.js"
        issue: "ERO fetch loop (~line 989-1013) calls extractPolygons on fetchResult.data with no validation that the body is a FeatureCollection (no features array), and has no local try/catch to contain a failure to the ERO block; the throw is caught only by the function-wide catch at ~1152, which nulls the entire getSpcOutlook payload."
    missing:
      - "Validate fetchResult.data has an Array features before calling extractPolygons (e.g. `if (gj.error || !Array.isArray(gj.features)) { ...continue, leave eroTiers[d] at NONE... }`)."
      - "Wrap the per-day ERO fetch/evaluate body in its own try/catch so an ERO failure can never propagate to the shared getSpcOutlook catch and null out day1-8/fireWeather."
      - "Harden extractPolygons itself (used by every product, not just ERO) with a guard on geojson.features and f.properties, per the code review's suggested fix."
deferred: []
---

# Phase 14: Foundation & WPC Excessive Rainfall Outlook Verification Report

**Phase Goal:** Users can enable per-product toggles on a payload shape that no longer forks on `extended`, and see their location's WPC Excessive Rainfall Outlook risk for Days 1-5 — establishing the fetch/cache/toggle conventions every later product reuses.

**Verified:** 2026-08-20T00:17:58Z
**Status:** gaps_found
**Re-verification:** No — initial verification

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | With `extended: false` and `showExcessiveRain: true`, ERO rows still render — payload no longer forks on `extended` (ROADMAP SC1 / CFG-02) | VERIFIED | `MMM-SPCOutlook.js:204-212` gates the ERO render block on `showExcessiveRain`/`excessiveRain` only, never on `this.config.extended`. `node_helper.js`: the `if (this._products.showExcessiveRain)` ERO fetch loop (~989) sits entirely outside the `if (extended)` block; `getSpcOutlook` has exactly one `return` (confirmed by direct read, ~line 1019). 14-03-SUMMARY.md live probe Run B (`extended:false, showExcessiveRain:true`) shows a populated `excessiveRain` block with non-null `valid_time`. Human UAT Scenario 1 approved. |
| 2 | `showExcessiveRain` toggles independently of every other flag and defaults to `false` out of the box (ROADMAP SC2 / CFG-01) | VERIFIED | `MMM-SPCOutlook.js:8` — `showExcessiveRain: false` in `defaults:`. Nothing in the render gate, the socket payload, or `node_helper.js`'s re-default (`products?.showExcessiveRain === true`, line 49) reads or depends on `extended`. Human UAT Scenarios 2/3 approved (toggle omitted -> 0 ERO lines; `extended:true` + toggle on -> same 5 ERO lines as Scenario 1). |
| 3 | Correct ERO tier label (MRGL/SLGT/MDT/HIGH) for Days 1-5, derived from ERO's own `dn` domain, not fire weather's `DN` (ROADMAP SC3 / ERO-01, ERO-02) | VERIFIED | `productRegistry.js`: `eroDnToValue` (lowercase `dn`, values 1-4) is a table structurally separate from `node_helper.js`'s `dnToFireValue` (uppercase `DN`, values 5/8/10) — never referenced from ERO code (confirmed by reading both files; `dnToFireValue` appears only in the pre-existing fire-weather block, line 752). 14-03-SUMMARY.md's inside-polygon live probe (real coordinates) returned SLGT/MRGL tiers matching independently-computed expected values; 14-UAT-FIXTURES.md's fixture table matches. Human UAT Scenario 1/3 approved against NOAA's public map. |
| 4 | A day where the location falls outside every ERO polygon shows no ERO row — not empty, not an error row (ROADMAP SC4 / ERO-03) | VERIFIED | `MMM-SPCOutlook.js:204-212` — value gate `dayNRisk != "NONE"` (never an existence gate), so a NONE day emits zero output for that day. 14-03-SUMMARY.md outside-all-polygons probe (Seattle) returned all 5 days `NONE` with zero rendered lines when hand-simulated against the committed render code (14-04-SUMMARY.md "Not verified this task" section + Node simulation). Human UAT Scenario 4 approved. |
| 5 | ERO requests always carry `f=geojson`, never `f=json`; the same query string repeats across polls so the ETag/hash cache hits instead of re-running turf (ROADMAP SC5 / DATA-01, PERF-02) | VERIFIED | `productRegistry.js buildArcGisQuery` hardcodes `f=geojson` as a template literal with no format parameter exposed — independently confirmed by reading the function (no `format`/`f` argument exists to override it). `buildUrl(d)` is a pure closure over two module constants, producing 5 fixed strings. 14-01-SUMMARY.md live-verified all 5 URLs return stable ETags across repeat requests; 14-03-SUMMARY.md's repeat in-process call confirmed `cache hit (ETag)` for all 5 layers and byte-identical `excessiveRain` output on the second call. Human UAT Scenario 5 (network trace) approved. |
| 6 | `excessiveRain` (and the rest of the payload) is always present, regardless of the toggle — including when an ERO fetch fails or returns a malformed body (D-05 foundation guarantee; generalizes plan 14-03's "the excessiveRain block is always present" must-have and the goal's "establishing the ... conventions every later product reuses" clause) | **FAILED** | See `gaps` in frontmatter (CR-01). Independently reproduced: an ArcGIS error-shaped 200 body (`{"error":{...}}`, no `features`) makes `extractPolygons`'s `geojson.features.forEach` throw; the throw is uncaught locally and propagates to `getSpcOutlook`'s single outer `catch`, which returns `{ error: ... }` with **no** `day1`-`day8`, `fireWeather`, or `excessiveRain`. Confirmed by direct code read (`node_helper.js:989-1013`, `fetchGeoJsonCached` at 265-320 which validates only HTTP status, not body shape) and by a standalone reproduction script (see Behavioral Spot-Checks). |
| 7 | With `extended: false`, existing SPC Day 1-3 and fire weather Day 1-2 values are unchanged from before this plan (plan 14-02 must-have, CFG-02 back-compat) | VERIFIED | `git diff d1cf259 HEAD -- node_helper.js` shows only the deleted `if (!extended) { return {...} }` early-return fork (whose day1/2/3/fireWeather object literals reappear unchanged at the bottom, single-return version) and hoisted-with-defaults Day 4-8 blocks — no day1-3 field was altered, added, or removed. |
| 8 | ERO's `dn`->tier vocabulary is structurally unable to reference the fire weather `dnToFireValue` map (plan 14-01 must-have, ERO-02) | VERIFIED | `productRegistry.js` defines and closes over its own `eroDnToValue`/`eroValueToTier`/`eroTierToText`/`eroTierToColor` tables; `dnToFireValue` is declared and used only inside `node_helper.js`'s pre-existing fire-weather block (line 752), never imported into or referenced by `productRegistry.js`. |
| 9 | `extractPolygons`, `evaluatePolygons`, `fetchGeoJsonCached`, and every existing SPC/fire-weather URL constant and label map are unmodified by this phase (plan 14-03 must-have, D-08) | VERIFIED | Confirmed via `git diff d1cf259 HEAD -- node_helper.js`: no removed/changed lines inside those function bodies or the pre-existing URL constant declarations — only additive lines (the `products` var, the ERO block, hoisted Day 4-8 locals). Note: this is also *why* CR-01 is reachable — `fetchGeoJsonCached` was deliberately left unmodified and never validated response body shape even before this phase; Phase 14 is the first caller whose upstream (ArcGIS) is known to return error bodies inside HTTP 200 responses. |
| 10 | A cached ERO day yields the same tier string as a freshly-fetched one — the numeric-to-tier conversion happens once, downstream of the cache-hit/fresh-data branch (plan 14-03 must-have, PERF-02) | VERIFIED | `node_helper.js` ~1010-1013: `eroTiers[d] = ero.valueToTier[eroValue] || "NONE"` sits after the `if (fetchResult.data === null ...) {...} else if (fetchResult.data !== null) {...}` branch closes, executed exactly once regardless of which branch ran. 14-03-SUMMARY.md's repeat-call probe empirically confirmed `JSON.stringify(firstCall.excessiveRain) === JSON.stringify(secondCall.excessiveRain)` -> `true` with a live `cache hit (ETag)` on the second call. |

**Score:** 9/10 truths verified (1 blocking failure: CR-01)

### Required Artifacts

| Artifact | Expected | Status | Details |
|----------|----------|--------|---------|
| `productRegistry.js` | `buildArcGisQuery` + `PRODUCT_REGISTRY.excessiveRain`, `f=geojson` hardcoded, ≥45 lines | VERIFIED | 91 lines. `module.exports = { buildArcGisQuery, PRODUCT_REGISTRY }` (confirmed). `f=geojson` is a literal in the template string with no override path. |
| `node_helper.js` | Single unconditional `getSpcOutlook` return; `products` socket contract; ERO fetch/evaluate loop; unconditional `excessiveRain` block | VERIFIED (with CR-01 caveat) | All structural must-haves present and wired (single return, `=== true` re-default, ERO loop gated only on the toggle, `excessiveRain` sibling to `fireWeather`). The block *is* unconditionally emitted on every successful return path — but a specific upstream failure shape can prevent that return path from being reached at all (see truth 6 / CR-01). |
| `MMM-SPCOutlook.js` | `showExcessiveRain` default, `products` socket field (both send sites), ERO render block, extended no-risk gate | VERIFIED | `defaults.showExcessiveRain: false` (line 8); `products: { showExcessiveRain: ... }` present on both the `start()` call (line 17) and the `setInterval` callback (line 19); ERO render block (lines 204-212) value-gated per day; no-risk gate conjunct (lines 116-122) confirmed correct against the plan's 4-case truth table by direct read. |
| `.planning/phases/14.../14-UAT-FIXTURES.md` | Inside/outside coordinates, expected tiers, config scenarios, ≥30 lines | VERIFIED | 195 lines. Turf-confirmed inside (5/5 days non-NONE) and outside (5/5 days NONE) coordinates, 4 ready-to-paste scenarios, all referencing real `defaults:` keys. |

### Key Link Verification

| From | To | Via | Status | Details |
|------|-----|-----|--------|---------|
| `productRegistry.js` | `mapservices.weather.noaa.gov/.../wpc_precip_hazards/MapServer` | `ERO_BASE_URL` consumed by `buildArcGisQuery` | WIRED | Confirmed literal constant and its use inside `buildUrl`. |
| `PRODUCT_REGISTRY.excessiveRain.buildUrl` | `buildArcGisQuery` | arrow closure over `ERO_BASE_URL`/`eroDayLayers` | WIRED | Confirmed by direct read; `buildUrl: (day) => buildArcGisQuery(ERO_BASE_URL, eroDayLayers[day])`. |
| `PRODUCT_REGISTRY.excessiveRain.toValue` | `eroDnToValue` | `f.properties.dn` lookup | WIRED | Confirmed; also independently smoke-tested by the code reviewer (`toValue("", {properties:{DN:8}})` -> `0`, `toValue("", {properties:{dn:2}})` -> `2`). |
| `node_helper.js` | `productRegistry.js` | `require("./productRegistry")` | WIRED | `const { PRODUCT_REGISTRY } = require("./productRegistry");` at top of file. |
| ERO fetch loop | `fetchGeoJsonCached` | unmodified reuse of the ETag/hash cache helper | WIRED (but see CR-01) | Reused as-is; the loop calls it correctly, but the helper itself never validates response body shape, which is the root cause enabling CR-01. |
| ERO parse | `extractPolygons` | registry row's `toValue`/`includesFeat` callbacks | WIRED (but see CR-01) | Correctly wired for well-formed responses; unguarded against a features-less body. |
| socket payload `products` | `this._products` | `products?.showExcessiveRain === true` | WIRED | `node_helper.js:49`. |
| `MMM-SPCOutlook.js defaults` | `GET_SPC_DATA products object` | `products: { showExcessiveRain: this.config.showExcessiveRain }` on both send sites | WIRED | Confirmed identical on lines 17 and 19. |
| `getDom` ERO render block | `this.spcrisk.excessiveRain` | per-day `!= "NONE"` value gate | WIRED | Confirmed lines 204-212. |
| no-risk gate | `this.spcrisk.excessiveRain` | additional negated-disjunction conjunct, days 1-5 | WIRED | Confirmed lines 116-122; matches the plan's 4-case truth table by hand-evaluation. |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
|----------|---------------|--------|---------------------|--------|
| `MMM-SPCOutlook.js` ERO render block | `this.spcrisk.excessiveRain` | `SPC_DATA_RESULT` socket notification <- `getSpcOutlook`'s ERO fetch/evaluate loop <- live `mapservices.weather.noaa.gov` ArcGIS query | Yes, under normal upstream conditions | FLOWING (live-verified in 14-03-SUMMARY.md with real coordinates producing real SLGT/MRGL tiers; NONE for genuinely outside coordinates, not a stub default) |
| — (failure path) | same variable | same source, but an ArcGIS error-shaped 200 response | No — the entire `spcrisk` object becomes `{ error: ... }` | DISCONNECTED under the CR-01 condition — not a hardcoded-empty stub, but a genuine failure that removes the data path entirely for that poll cycle |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
|----------|---------|--------|--------|
| All three phase-14 source files are syntactically valid | `node --check node_helper.js && node --check MMM-SPCOutlook.js && node --check productRegistry.js` | `ALL SYNTAX OK` | PASS |
| `productRegistry.js` exports load and `PRODUCT_REGISTRY.excessiveRain` is well-formed | `node -e 'require("./productRegistry.js")'` (via the reproduction script below) | Loaded without error | PASS |
| CR-01 reproduction: an ArcGIS error-shaped 200 body breaks `extractPolygons`'s unconditional `.features.forEach` | `node -e '...; malformed.features.forEach(() => {})'` simulating the exact dereference `extractPolygons` performs on `fetchResult.data` | `TypeError: Cannot read properties of undefined (reading 'forEach')` | FAIL (confirms the gap — this is expected/desired output for the spot-check, i.e. it proves the defect is real) |
| `fetchGeoJsonCached` validates only HTTP status, not response body shape | Direct read of `node_helper.js:265-320` | No `features`/`error` key check anywhere in the function; `JSON.parse(rawText)` result is returned as-is on any 200 | Confirmed by inspection (not independently executable without a live malformed response) |
| No new debt markers (`TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER`) introduced by Phase 14 | `grep -n -E "TBD\|FIXME\|XXX\|TODO\|HACK\|PLACEHOLDER"` across the 3 modified/created files | No matches | PASS |

### Probe Execution

SKIPPED — no committed `scripts/*/tests/probe-*.sh` (or any path matching that convention) exists in this repository, and no plan/summary declares one. All "probe" evidence referenced in the SUMMARYs (14-01, 14-02, 14-03) was an ad-hoc Node harness built and run entirely in the executor's session scratchpad, never committed to the repo — consistent with the SUMMARYs' own description ("harness lived entirely in the session scratchpad... nothing added to the repository"). That network-dependent live evidence could not be independently re-run by this verifier (no live network probing performed here); the code-level and diff-level evidence above stands in its place, matching the project's manual-UAT-plus-static-analysis verification strategy.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
|-------------|-------------|--------------|--------|----------|
| CFG-01 | 14-03, 14-04 | User enables each new product independently via its own boolean, defaulting to false | SATISFIED | `defaults.showExcessiveRain: false`; independent of `extended` and every other flag; human UAT Scenario 2/3 approved. `REQUIREMENTS.md`'s checkbox and Traceability table still show this `[ ]`/"Pending" — stale tracking, not a functional gap (see Gaps Summary). |
| CFG-02 | 14-02, 14-04 | Existing SPC/fire weather config continues to work; `extended` no longer gates payload shape | SATISFIED | Single-return `getSpcOutlook`, diff-confirmed no regression to day1-3/fireWeather fields; human UAT Scenario 1/3 approved. `REQUIREMENTS.md` shows `[ ]`/"Pending" — stale tracking. |
| DATA-01 | 14-01, 14-03 | Coordinates always evaluated against WGS84 geometry; `f=geojson` on every ArcGIS endpoint | SATISFIED | `buildArcGisQuery` hardcodes `f=geojson` non-overridably; live-verified on the wire (14-01-SUMMARY.md). `REQUIREMENTS.md` already shows `[x]`/"Complete" — consistent. |
| PERF-02 | 14-01, 14-03 | ETag/SHA256 cache stays effective; no cache-key multiplication | SATISFIED | Byte-stable `buildUrl`; live-verified single cache entry per layer, cache-hit tier identical to fresh fetch. `REQUIREMENTS.md` already shows `[x]`/"Complete" — consistent. |
| ERO-01 | 14-01 (groundwork), 14-03, 14-04, 14-05 | User sees their ERO risk tier for Days 1-5 when `showExcessiveRain` is enabled | SATISFIED under normal conditions; see CR-01 caveat | Render block + live/human-verified tiers. CR-01 means this requirement's guarantee is not resilient to a malformed upstream response (see gap). `REQUIREMENTS.md` shows `[ ]`/"Pending" — stale tracking. |
| ERO-02 | 14-01, 14-03 | Correct tier label from ERO's own `dn` domain, not fire weather `DN` | SATISFIED | Structurally isolated tables, smoke-tested by code review, live-verified tiers. `REQUIREMENTS.md` already shows `[x]`/"Complete" — consistent. |
| ERO-03 | 14-04 | No ERO row for a day outside all ERO polygons | SATISFIED | Value-gated render loop; Seattle probe + human UAT. `REQUIREMENTS.md` shows `[ ]`/"Pending" — stale tracking. |

No orphaned requirements: the 7 IDs declared across the 5 plans' `requirements:` frontmatter exactly match the 7 IDs REQUIREMENTS.md's Traceability table maps to Phase 14.

### Anti-Patterns Found

| File | Line(s) | Pattern | Severity | Impact |
|------|---------|---------|----------|--------|
| `node_helper.js` | ~989-1013, ~265-320 | Unvalidated upstream response body shape feeding an unguarded `.features.forEach` inside the phase's single shared try/catch | Blocker (CR-01, see gaps) | An optional, default-off product can null out the entire payload on a transient upstream hiccup |
| `node_helper.js` | ~45-53 (pre-existing, unmodified by Phase 14) | `await this.getMesoscaleDiscussion(...)` / `await this.getSpcOutlook(...)` in `socketNotificationReceived` with no try/catch around either call | Warning, PRE-EXISTING (CR-02) | An MD-fetch failure (network/KMZ/KML error) becomes an unhandled promise rejection; the frontend never receives `SPC_DATA_RESULT` and stays on "Loading..." indefinitely. This predates Phase 14 (confirmed via `git show d1cf259:node_helper.js`, identical unguarded shape at the pre-phase commit) and Phase 14 did not modify this code path or make it more consequential — it only added an unrelated line (`products` destructuring) to the same function. Not a Phase 14 gap; flagged per instructions for visibility. |
| `node_helper.js` | 1002-1003 | `valid_time` read from `features[0]` (arbitrary server-serialized order), not the polygon actually containing the user's location; also populated even on a NONE (outside-polygon) day | Warning (review WR-01) | Not currently visible to the end user (valid_time isn't rendered in Phase 14's UI) but is carried into the payload for Phase 18's future MERGE-01 logic per D-03 — a latent data-quality issue for that later phase, not a Phase 14 display defect. |
| `node_helper.js` / `productRegistry.js` | multiple | `exceededTransferLimit` never checked (WR-02); half the registry row unused with a comment asserting an unimplemented contract (WR-03); ERO day count hardcoded as `5` in 2+ places instead of driven by `ero.days` (WR-04); no fetch timeout (WR-05, pre-existing pattern); `this._products` is helper-global, colliding across multi-instance/overlapping polls (WR-07); location-change cache invalidation preserves stale ETags (WR-08, pre-existing pattern, replicated into new ERO code); `products` payload literal duplicated across two send sites (WR-09) | Warning (non-blocking) | Real, review-confirmed robustness/maintainability defects that do not, on their own, break any of the 5 ROADMAP success criteria under normal single-instance operation. Recommended for backlog per the review's own suggested fixes; not independently re-litigated here since the code-review-note only asked for judgment on CR-01/CR-02. |
| `MMM-SPCOutlook.js` | 97, 143 (pre-existing sinks) | Remote-derived strings (`this.spcrisk.error`, mesoscale discussion `MD` text) concatenated unescaped into `innerHTML` | Warning, PRE-EXISTING sink / new source via CR-01's error path (WR-06) | Pre-existing XSS-shaped sink; Phase 14 does not touch these lines, but CR-01 firing routes a JSON.parse SyntaxError (which can embed a short attacker-positionable window of a MITM'd response body) into `this.spcrisk.error`, which lands in this sink. Confirmed: the ERO render block itself (lines 204-212) is NOT affected — its color/text values are clamped through closed lookup tables, not raw remote strings. |
| `productRegistry.js` / `node_helper.js` | various | 4 convention-level findings (IN-01..IN-04): loose `!=` vs the file's newer `===` convention; stale JSDoc for `toValue`'s 2-arg contract; mutable registry exports; contradictory/stale phase-reference comments | Info | Cosmetic; no functional impact. |

No new `TBD`/`FIXME`/`XXX`/`TODO`/`HACK`/`PLACEHOLDER` markers were introduced by Phase 14 in any of the 3 touched/created files.

### Human Verification Required

None outstanding. Per `<execution_facts>`, the developer already ran the blocking human-verify checkpoint (plan 14-05, Task 2) against `14-UAT-FIXTURES.md` on 2026-08-19 and returned the plan's "approved" resume-signal, covering all five ROADMAP success criteria as a single sign-off (not five individually narrated observations). That sign-off is treated as ground truth for truths 1-5 above per the escalation-gate contract already exercised for this phase. It does **not** cover CR-01: the review itself notes (and this verifier's independent reproduction confirms) that the ArcGIS-error-response path was never triggered during either the live probes or the human UAT session, because the WPC ArcGIS host was healthy throughout — the gap is real but was structurally unobservable through the verification path this phase used.

### Gaps Summary

**One blocking gap (CR-01):** the WPC ERO fetch loop in `node_helper.js` has no defense against ArcGIS's documented HTTP-200-with-error-body failure shape. An unguarded `extractPolygons(fetchResult.data, ...)` call throws when the body has no `features` array, and that throw is caught only by `getSpcOutlook`'s single shared catch, which returns `{ error: ... }` in place of the entire payload — `day1`-`day8`, `fireWeather`, and `excessiveRain` all disappear together. This was independently reproduced by this verifier (not just taken from the code review) and traced through the exact call chain in the committed code. It directly contradicts the D-05 "one payload shape regardless of configuration" guarantee this foundation phase exists to establish, and because the defect lives in shared, unmodified helper code (`fetchGeoJsonCached`) and the phase's own shared-catch pattern, it will be inherited by every future registry-driven product in Phases 15-17 unless fixed here. All 5 ROADMAP success criteria and every other plan-level must-have were independently verified as met under normal (non-error) conditions, including via direct code reading, `git diff` regression checks, live-probe evidence recorded in the SUMMARYs, and the developer's own UAT sign-off — this is the one exception.

**One pre-existing, non-blocking finding surfaced for visibility (CR-02):** `socketNotificationReceived`'s unguarded `await this.getMesoscaleDiscussion(...)`/`await this.getSpcOutlook(...)` calls predate Phase 14 (confirmed via the pre-phase commit) and were not modified or made more consequential by this phase. Not counted as a Phase 14 gap.

**This looks like a fixable bug, not an intentional deviation** — no override is suggested. If the developer judges the risk acceptable for this milestone stage (e.g., because Phase 19 will touch this same error-handling surface, or because WPC's ArcGIS endpoint has historically been reliable), the appropriate path is an explicit override entry, not silent acceptance:

```yaml
overrides:
  - must_have: "excessiveRain block survives an ArcGIS error-shaped response without collapsing the entire payload"
    reason: "<developer's stated reason, e.g. deferred hardening to Phase 19 / accepted risk given WPC uptime history>"
    accepted_by: "<name>"
    accepted_at: "<ISO timestamp>"
```

---

_Verified: 2026-08-20T00:17:58Z_
_Verifier: Claude (gsd-verifier)_
