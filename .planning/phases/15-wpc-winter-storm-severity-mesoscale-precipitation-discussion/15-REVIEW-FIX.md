---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
fixed_at: 2026-08-24T22:14:00Z
review_path: .planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report

**Fixed at:** 2026-08-24T22:14:00Z
**Source review:** `.planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (3 Critical + 10 Warning; Info and CV-* excluded by `fix_scope: critical_warning`)
- Fixed: 13
- Skipped: 0

**Probe suite:** 32 passed / 0 failed / 0 skipped at start → **43 passed / 0 failed / 0 skipped** after the fixes. 11 new scenarios were added and every one of them was verified RED against the pre-fix source before being accepted (see per-finding "Proof" lines). The three findings whose defect the suite already covered but did not assert (CR-01/WR-06, WR-05) were additionally mutation-tested: re-introducing the defect now turns the suite red.

## Fixed Issues

### CR-01: `_runArcGisDayProduct`'s per-day catch degrades to no-risk without setting `anyStale`

**Files modified:** `node_helper.js`
**Commit:** `3622e19`
**Applied fix:** Set `anyStale = true` in the per-day catch, independently of the `fetchResult.stale || fetchResult.failed` line above it (the throw can occur before that line runs). Follows the dominant pattern at the other seven degrade sites.
**Proof:** Mutation-tested. With WR-06's tightened scenario in place, removing this one line turns `ero-fetch-throws` red with "five contained ERO throws produced an unflagged no-risk payload".

### CR-02: response body read outside `fetchGeoJsonCached`'s error containment

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `7756cdc`
**Applied fix:** Wrapped `await res.text()` in its own try/catch that takes the same stale-fallback → hard-failure path the network-error branch already owns. Added `httpBodyReadFailure()` to the harness (a response whose headers arrive and whose body then rejects — a shape no existing fixture could produce, since every prior failure fixture rejects at connect or answers non-2xx) and the scenario `body-read-abort-is-contained-not-a-payload-collapse`.
**Proof:** The review's PoC reproduced verbatim against the real `getSpcOutlook` — pre-fix, a day-1 categorical layer rejecting on `text()` yielded `payload keys: error / error: Error: ECONNRESET while reading body`; post-fix the full 15-key payload survives with `_stale: true`. The new scenario is RED pre-fix.

### CR-03: an empty `MPDNumber` cell silently drops an active MPD covering the user

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `26821dd`
**Applied fix:** Changed `_prepareMpdEntry`'s guard from `number === null` to "not a string, or blank after trim" — the condition `toEntry`'s `if (!number) return null` actually applies — and used the exported `MPD_FILENAME_PATTERN` for the filename fallback rather than a second inline copy of the same regex. Added the probe fixture the review noted was missing (`mpdKml({ number: "" })` emits `<td>MPDNumber</td><td></td>`; the builder previously only ever omitted the row).
**Beyond the review's fix snippet:** also set `anyStale = true` on `_runKmlAdvisoryRow`'s "covers the location but carries no name" drop. The review's Issue text names this as part of the harm ("and does not set `anyStale`, so the user sees no advisory and no ⚠") but its Fix section did not include it. An advisory that *does* contain the user and is then discarded is a degrade by the same reasoning as the seven other sites; leaving it silent keeps it indistinguishable from "none active". This also affects the `spcMD` row, which shares the code path.
**Proof:** New scenario `mpd-empty-number-cell-falls-back-to-filename-not-dropped` is RED pre-fix ("an active MPD covering the user was dropped for an empty MPDNumber cell, got 0 entries"). Its control half drives a genuinely unlabellable candidate and asserts the drop now sets `_stale`.
**Status:** fixed: requires human verification — specifically the added `anyStale` on the unlabellable-advisory drop, which is a deliberate extension beyond the review's stated fix and changes when the ⚠ badge appears for `spcMD` as well as `mpd`.

### WR-01: the MPD listing's degraded truncation kept the oldest candidates

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `67d608a`
**Applied fix:** Sort numerically on the captured MPD filename number before `slice(-N)` in `wpc-mpd-listing`'s degraded-truncation branch, and corrected the comment that claimed alphabetical document order puts the highest numbers last. Added a note at the sibling `slice(0, N)` in `_runKmlAdvisoryRow` explaining why the two ends no longer contradict each other (each discovery strategy now owns its own ordering; for `mpd` the generic cap is a no-op).
**Proof:** PoC against the real discovery strategy with a 1200-entry alphabetically sorted listing — pre-fix it kept numbers **9 … 999** (the oldest MPDs of the season); post-fix it keeps **1141 … 1200**. New scenario `mpd-listing-truncation-keeps-the-newest-not-the-alphabetical-tail` is RED pre-fix.

### WR-02: `fetchBinBuffer` had no response-size bound; the listing's bound ran post-hoc

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `4c45744`
**Applied fix:** `fetchBinBuffer(url, maxBytes = ADVISORY_MAX_BODY_BYTES)` now passes node-fetch's streaming `size` cap (the only layer that bounds *memory*), refuses an oversized declared `Content-Length` before reading, and re-checks the buffer that actually arrived. Passed `size: ADVISORY_MAX_LISTING_BYTES` on the listing fetch too. Hoisted both limits to named module constants next to `ADVISORY_MAX_CANDIDATES`, carrying their justification comments (also closes part of IN-09, which was out of scope on its own).
**Proof:** New scenario `advisory-member-body-is-size-bounded` asserts all three layers plus a positive control, and is RED pre-fix.

### WR-03: the KMZ 8 MB bound trusted an attacker-declared header field

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `c0dfa1e`
**Applied fix:** `extractSoleKmlEntry` now checks the declared size, then the declared/compressed ratio against `KMZ_MAX_COMPRESSION_RATIO` (200:1), then the length of the buffer that actually inflated — the only unforgeable one. Both limits hoisted to named constants.
**Proof:** New scenario `kmz-decompression-bomb-is-refused` asserts three refusals against real adm-zip archives plus a round-trip control; RED pre-fix on the ratio case ("a 4 MB entry inflating from a few KB — under the byte cap, ~1000:1 — was accepted").
**Correction to the review's threat model, recorded for the reader:** the review states that with a forged `size: 100` header, "`ZIPper.readFile(entry)` inflates it anyway". Verified against the installed adm-zip 0.5.16, that is **not** the case — it sizes its output buffer from the declared value and throws `Cannot create a Buffer larger than 100 bytes`. So the pre-fix code was already contained (by luck, via the library) against the *lying*-header bomb, and genuinely exposed to the *honest* high-ratio bomb under the byte cap. The fix covers both and the scenario pins the library behaviour so a future adm-zip upgrade that drops it turns the suite red rather than silently reopening the hole.
**Status:** fixed: requires human verification — the 200:1 ratio threshold is a judgement call. Live KML compresses well under 20:1 so there is an order of magnitude of headroom, but a future legitimately-large, highly-repetitive KML is the shape that would trip it.

### WR-04: `checkInPolygon` built turf geometry unguarded

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `ccd325f`
**Applied fix:** Per-feature try/catch around `turf.polygon`/`turf.multiPolygon`, logging and incrementing `_unusableFeatureCount` (so the drop surfaces as ⚠ through `getSpcOutlook`'s existing sampling) then continuing — matching `extractPolygons`.
**Proof:** New scenario `checkinpolygon-contains-unusable-geometry-per-feature` is RED pre-fix ("one malformed feature aborted the whole scan (Each LinearRing of a Polygon must have 4 or more Positions.)").
**Reachability note recorded in the scenario comment:** I could not construct an end-to-end KML fixture that reaches this throw. `@tmcw/togeojson` normalises rings on the way out — it auto-closes a 4-position ring and emits `geometry: null` for anything shorter (both verified directly), so the existing `!feature.geometry` guard catches every malformed-ring KML today. The finding is therefore a genuine containment gap in a helper documented as accepting "anything, including junk", but not a currently-reachable production path through the MPD/MD chain. The scenario asserts against the primitive for that reason, and says so.

### WR-05: the shared payload oracle validated only the ERO block

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `ff6bdd2`
**Applied fix:** `assertPayloadIntact` now iterates `PRODUCT_REGISTRY`: every `arcgis-day-layers` row's block is checked for presence, exact key count (`row.days × ERO_SUFFIXES.length`), per-day key presence and tier validity; `advisories` must be an object carrying an array per `kml-advisory` row. `ERO_SUFFIXES` stays literal as the independent oracle.
**Proof:** Mutation-tested. Deleting `winterImpact: wssiPayload` from `getSpcOutlook`'s return object took the suite from 43/0 to 7 passed / 31 failed; deleting `advisories: advisories` did the same. Both mutations passed the pre-fix oracle.

### WR-06: `ero-fetch-throws` asserted the log but not the staleness

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `bd616e3`
**Applied fix:** Added the `out._stale !== true` assertion, the render-layer proof via `loadFrontendModule`/`renderDom`, and a toggle-off negative control. **Also corrected the scenario's routing**, which was the more important half: it routed only the ERO URLs, so every SPC/fire-weather layer fell through `installFetch`'s hard-failure default and set `anyStale` before the ERO loop ran — a `_stale` assertion added on top of that routing would have been vacuous. Non-ERO layers now answer 200-empty, so `anyStale` can only originate in the contained throw (WR-02's trap, applied here).
**Proof:** Mutation-tested both ways. With the original routing, removing CR-01's `anyStale = true` still passed 38/38; with the corrected routing it fails with the intended message.

### WR-07: the frontend spread `advisories.spcMD`/`advisories.mpd` unguarded

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `12d01fe` (later folded into `enabledAdvisories()` by WR-09's commit `cfd98d1`)
**Applied fix:** Guarded each key with `Array.isArray` so an absent or junk inner key contributes nothing, matching the tolerance the no-risk gate 30 lines above already documented.
**Proof:** New scenario `frontend-tolerates-a-half-populated-advisories-object` reproduces the review's PoC exactly — RED pre-fix with `TypeError: advisories.mpd is not iterable` — and also covers the mirror shape and a non-array value.

### WR-08: registry-driven backend, hardcoded frontend

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `57d57dc`
**Applied fix:** Took the review's option (b) — derive the span from the block's own keys — so no backend payload change was needed. Added `dayRiskCount(block)` and `blockHasRisk(block)`; the five ERO and three WSSI terms in the no-risk gate collapse to one call each, and the two hardcoded render loops collapse to a single `renderDayBlock(label, block)`. No literal day count remains in the frontend. The new helpers use strict `!==` against `"NONE"`, which incidentally closes IN-08's `color:#undefined` trap for these blocks.
**Proof:** New scenario `frontend-follows-the-payload-day-span-not-a-hardcoded-one` drives a 7-day ERO block with the risk on day 7 and asserts it both disqualifies the no-risk short-circuit and renders; RED pre-fix. Additionally verified end-to-end by flipping `PRODUCT_REGISTRY.excessiveRain.days` from 5 to 7 and re-running: the three resulting failures are all fixture-side (the probe's own route lists and the layer-id map only define 5 ERO days) — no failure came from the frontend, and the generalised `assertPayloadIntact` accepted the 28-key payload.

### WR-09: advisory rows rendered without consulting their config toggles

**Files modified:** `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `cfd98d1`
**Applied fix:** Added `ADVISORY_SOURCES = { spcMD: "showSPCMD", mpd: "showMPD" }` — the single place the frontend names the registry's `kml-advisory` rows, since a browser-context module cannot `require` the registry — and `enabledAdvisories()`, which filters by toggle and by `Array.isArray`. Both the no-risk gate term and the render band now call it, so the two can no longer disagree about either the toggle or the version-skew tolerance.
**Proof:** New scenario `frontend-advisory-band-respects-its-config-toggles` is RED pre-fix ("advisories rendered with both toggles off"), and asserts the gate agrees with the render (both off ⇒ a genuine `"No Severe Weather Risk"`, not a band-less "(unconfirmed)").
**Behaviour change worth noting to the user:** a payload carrying advisories that the *frontend* config disables is now neither rendered nor counted by the gate. This is the intended defence-in-depth for the multi-instance `_products` overwrite the review describes, but it is a user-visible change in that scenario.

### WR-10: probe harness state bled between scenarios

**Files modified:** `scripts/probe-lib/module-stubs.js`, `scripts/probe-payload-resilience.js`
**Commit:** `4880b37`
**Applied fix:** `ORIGINAL_SEAMS` now snapshots the whole helper surface (`{ ...helper }`) and `resetHelper` restores it wholesale with `Object.assign`; added `TURF_DEFAULTS` so `resetHelper` also resets `turfStub.pointInPolygon`. The 20 hand-rolled `try/finally` pairs were **left in place** rather than deleted as the review suggests — they now restore to the same default, so they are harmless belt-and-braces, and removing 20 blocks across the file is churn with no behavioural gain and real merge risk.
**Proof:** A deliberate pair of scenarios (`harness-leak-setup-deliberately-dirties-the-seams` / `harness-leak-check-resethelper-restores-every-seam`) — the only way to test a leak that by definition escapes its own scenario. The check scenario is RED pre-fix ("a previous scenario's fetchBinBuffer stub survived resetHelper").

## Skipped Issues

None.

## Out of scope (not attempted)

`fix_scope` was `critical_warning`, so the 9 Info findings (IN-01 … IN-09) and the 3 convention findings (CV-01 … CV-03) were not addressed as such. Three were incidentally closed or partly closed by in-scope work:

- **CV-01** is the same line as CR-01 and is now resolved.
- **IN-09** (inline magic numbers) is partly closed: `ADVISORY_MAX_BODY_BYTES`, `ADVISORY_MAX_LISTING_BYTES`, `KMZ_MAX_KML_BYTES` and `KMZ_MAX_COMPRESSION_RATIO` are now named module constants. `KMZ_MAX_ENTRIES` (32), `MPD_DESCRIPTION_MAX_BYTES` (512 KB) and `MPD_LISTING_FRESH_WINDOW_MS` (48 h) remain inline.
- **IN-08** (loose equality) is closed for the ERO/WSSI blocks via WR-08's `renderDayBlock`/`blockHasRisk`, which use `!==`. The `day1`/`day2`/`day3` and proximity comparisons elsewhere in `getDom` still use `==`/`!=`.

---

_Fixed: 2026-08-24T22:14:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
