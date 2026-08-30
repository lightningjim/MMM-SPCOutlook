---
phase: 16-wpc-day-3-7-cpc-day-8-14-hazards-outlook
fixed_at: 2026-08-30T00:00:00Z
review_path: .planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-REVIEW.md
iteration: 1
findings_in_scope: 10
fixed: 8
already_resolved: 2
skipped: 0
status: all_fixed
---

# Phase 16: Code Review Fix Report

**Fixed at:** 2026-08-30
**Source review:** `.planning/phases/16-wpc-day-3-7-cpc-day-8-14-hazards-outlook/16-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope (Critical + Warning): 10
- Already resolved in the prior remediation pass, verified in code this run: 2 (CR-01, WR-04)
- Fixed this run: 8 (WR-01, WR-02, WR-03, WR-05, WR-06, WR-07, WR-08, WR-09)
- Skipped: 0
- Out of scope (`fix_scope: critical_warning`): IN-01, IN-02

**Suite:** `scripts/probe-payload-resilience.js` was 67/67 before the first fix and 67/67
after every one of the eight commits, run individually. No scenario was added or modified.

## Already Resolved (verified, not re-fixed)

### CR-01: A stalled Hazards Outlook feed produces a silent all-clear whenever no polygon contains the user

**Verified present:** `_hazardLayerFiledate` (node_helper.js) reads the first finite
`idp_filedate` off the raw body before containment filtering; `_cacheHazardMatches` stores
`{ matches, layerFiledate }`; the D-13 age check is guarded on the filedate's own existence
rather than on `matches.length > 0`. Pinned by the shipped scenario
`hazards-stale-layer-ages-out-even-when-nothing-contains-the-user`.

### WR-04: The window-band no-risk gate does not apply the renderer's elapsed-entry filter

**Verified present:** `renderableWindowEntries` / `renderableDayHazards` are shared
predicates in MMM-SPCOutlook.js, read by both the no-risk gate and both renderers. Pinned by
`frontend-hazards-elapsed-band-is-not-a-false-staleness-signal`.

## Fixed Issues

### WR-01: `showDrought` baked into a URL-keyed cache with no toggle dimension

**Files modified:** `node_helper.js`, `MMM-SPCOutlook.js`
**Commit:** `faf5263`
**Status:** fixed: requires human verification (behaviour change on the cache-hit path)

`includesFeat` is now the structural check only (`Boolean(val)`), so nothing config-derived
is baked into a cached unit. The D-09 exclusion and the D-10 drought gate moved to a new
`displayable(label)` closure applied per poll in the bucket loop — deliberately beside
re-bucketing, since both are decisions the URL-keyed cache must not be allowed to freeze. It
runs identically on a hit and a miss against this request's own `productToggles` snapshot,
so two module instances with different `showDrought` values can no longer inherit each
other's decision.

Second line of defence added at the frontend: `hazardsLabelDisplayable` now filters both
`renderableWindowEntries` and `renderableDayHazards`. The label lists are restated in
MMM-SPCOutlook.js because it runs in the browser and cannot `require` productRegistry.js;
the restatement is documented as fail-safe in one direction (a registry label missing from
the frontend list is a no-op — the backend still drops it) with an explicit rule that
nothing may be added there that is not already in the registry.

**Human verification wanted:** the cache now stores flooding/drought matches that were
previously filtered out at fill time. This is intended (they are clock-independent and the
gate runs downstream), but no shipped scenario warms the cache under one `showDrought` value
and polls under another — the review asks for exactly that scenario and it was not added.

### WR-02: D-09's hard exclusion defeated by a trailing space or a case change

**Files modified:** `productRegistry.js`, `node_helper.js`, `MMM-SPCOutlook.js`, `scripts/hazards-at.js`
**Commit:** `c647ee7`
**Status:** fixed

`normalizeHazardLabel` (trim + inner-whitespace collapse, covering U+00A0 via `trim`/`\s`)
is applied in the row's own `toValue`, so canonicalization happens once — the same placement
`winterImpact.toValue` uses for WSSI-02's fold. `hazardLabelKey` adds the case fold and is
used only for COMPARISON, so D-11's verbatim-render contract is untouched. The registry now
derives `excludedLabelKeys` / `droughtLabelKeys` from the display lists (symmetric by
construction) and exports both helpers; `displayable`, the frontend gate and
`scripts/hazards-at.js` all compare on the key.

Directly exercised: `"Flooding Likely  "` normalizes to `"Flooding Likely"`, and
`"flooding  likely "` keys to `FLOODING LIKELY` and matches `excludedLabelKeys`.
`scripts/hazards-at.js` was included beyond the review's stated file list because it carried
the identical raw-string comparison and would otherwise have kept misreporting the gate.

### WR-03: `_bucketHazardMatch` hardcodes the day span `3`/`14`

**Files modified:** `productRegistry.js`, `node_helper.js`
**Commit:** `b5fe4ed`
**Status:** fixed: requires human verification (clamp semantics)

`dayRangeSpanning(layers)` derives `dayRangeTotal` from the layers' own `dayRange` values
and validates each of them through `dayRangeOf` on the way — so the per-layer `[3,7]`/`[8,14]`
literals now pass the validator too, which they never did. `dayRangeTotal` still evaluates
to `[3, 14]` (verified). `_bucketHazardMatch` takes the range as a parameter and clamps on
`[firstDay, lastDay]`; a caller that omits it logs an error and drops the day-grid
contribution rather than falling back to an unclamped loop (which would reopen T-16-05) or
to a guessed default (which would be the hardcoded span this parameter exists to delete).

**Human verification wanted:** the no-`dayRangeTotal` guard is a new refusal path with no
in-tree caller, so it is unexercised.

### WR-05: The `_nowMs()` clock seam is bypassed by `_isWithinStaleWindow` and the cache timestamp writes

**Files modified:** `node_helper.js`
**Commit:** `19a9e12`
**Status:** fixed: requires human verification (branch selection under a pinned clock)

`_isWithinStaleWindow` and all three cache-hit `entry.timestamp` refreshes now read
`this._nowMs()`. Scope was widened beyond the review's four named sites to all 19
`timestamp: Date.now()` writes into `_geoJsonCache` (each confirmed to be a
`this._geoJsonCache.set(...)` call inside a helper method, so `this` was already bound):
leaving them on `Date.now()` while the comparison moved to `_nowMs()` would have inverted
the same asymmetry — a probe pinning the seam would then have read every non-hazards cached
entry as permanently fresh. The `_nowMs` doc comment now records that the seam covers the
whole caching layer and that these must move together. Production is unchanged (both are
`Date.now()`).

**Human verification wanted:** this changes which branch a warm-cache degrade takes under a
pinned clock. The review notes the stale-fallback path is entirely unexercised for
`arcgis-hazard-window`; that scenario was not added, so the corrected behaviour has no test.

### WR-06: Remote-controlled unbounded growth — label ledger, window-band count, untyped offsets

**Files modified:** `node_helper.js`, `MMM-SPCOutlook.js`
**Commit:** `df83e5d`
**Status:** fixed: requires human verification (new cap paths unexercised)

Three bounds, all with new named constants:
- `HAZARDS_MAX_LOGGED_UNMAPPED_LABELS = 64` and `HAZARDS_LOG_LABEL_MAX_CHARS = 60` —
  `_loggedUnmappedHazardLabels` now dedupes on a truncated key and stops growing at the cap.
  D-11 is untouched: past the cap the label still renders verbatim, it just stops being
  remembered as already-logged. This also closes the "1 MB hostile label retained in full,
  permanently" case the review names.
- `HAZARDS_MAX_WINDOW_ENTRIES = 40` — applied AFTER the sort, so what survives is the head
  of a meaningfully ordered list (earliest span start), matching the contract
  `ADVISORY_MAX_CANDIDATES` states for its own truncation. Logged via `Log.error`, never
  silent.
- Frontend `off()` coerces `offsetStart`/`offsetEnd` to `String(Math.trunc(n))` or `"?"`,
  closing the only place in either hazards renderer where a payload-sourced value reached
  `innerHTML` skipping both `escapeHtml` and a type guard.

**Human verification wanted:** neither cap has a scenario that trips it.

### WR-07: `fetchGeoJsonCached` reads an unbounded response body

**Files modified:** `node_helper.js`
**Commit:** `9ef373e`
**Status:** fixed: requires human verification (new refusal paths unexercised)

`GEOJSON_MAX_BODY_BYTES = 16 MB` (larger than `ADVISORY_MAX_BODY_BYTES` because this path
carries full-layer `outFields=*&f=geojson` responses rather than single-digit-KB KMZ
members). `fetchBinBuffer`'s three-layer guard shape applied to the GeoJSON path:
`size: GEOJSON_MAX_BODY_BYTES` on the fetch (node-fetch's streaming cap, the only one that
bounds peak memory), a `content-length` precheck before any byte is read, and a post-read
length check for a runtime that ignores `size`. `rejectBody` was hoisted above the body read
so both over-limit refusals route through it and inherit the existing stale-fallback and
`failed` semantics instead of throwing into `getSpcOutlook`'s shared catch.

**Human verification wanted:** none of the three bounds is tripped by a scenario. The
`content-length` precheck relies on `Number(null) === 0` for a header-less response (noted
in-code); the probe's `httpResponse` stub returns `null` for `content-length`, which is why
the 67 scenarios still pass through it unchanged.

### WR-08: `scripts/hazards-at.js` misreports routing for the case D-04 exists to handle

**Files modified:** `scripts/hazards-at.js`
**Commit:** `17de760`
**Status:** fixed

`route` now mirrors `_isFullNominalWindow`: non-precipitation goes to the window band
unconditionally (HAZ-02), precipitation goes to the band only on exact alignment to its
layer's `dayRange` (D-04), and otherwise to the day grid — where the report distinguishes
"per-day grid" from "per-day grid (clamped out of D3-14 — renders nothing)". Both bounds
come from `row.dayRangeTotal`, which WR-03 made derived, so a span change cannot leave a
stale literal in the script.

Directly exercised offline against the real registry with a stubbed `fetch`: an exact
`[3,7]` Precipitation feature reports "window band"; a `[4,5]` one reports "per-day grid"; a
`[-5,-3]` one reports "clamped out"; a Temperature `[3,5]` reports "window band".

The review's stronger suggestion — export `_hazardDayOffset`/`_utcDateString`/
`_isFullNominalWindow` from a shared module consumed by both node_helper.js and this script
— was NOT done. `node_helper.js` is a `NodeHelper.create(...)` module that cannot be
required from a bare script without stubbing MagicMirror's globals, so extracting the shared
module is a real refactor rather than a review fix. The duplication is now at least pinned
to the registry for both bounds.

### WR-09: `scripts/hazards-at.js` reports "fresh (no warning)" when `idp_filedate` is missing

**Files modified:** `scripts/hazards-at.js`
**Commit:** `5fc1c4f`
**Status:** fixed

`age` is now a number or `null`, never the string `"NaN"`. Hits with no usable
`idp_filedate` are counted and named on their own line, print `filed age UNKNOWN` rather
than `NaNh ago`, and — when NO hit carries one — the summary reads
`UNKNOWN (treat as stale)` instead of `fresh (no warning)`. The two adjacent gaps the review
names are closed in the same pass: `res.ok` is checked, `.json()` is wrapped, and the fetch
carries `AbortSignal.timeout(15000)`; a layer that cannot be read is named on stderr and
skipped with an explicit "results below are INCOMPLETE" note rather than aborting the run.

Directly exercised offline: an HTTP 503 layer is named and skipped, a feature with no
`idp_filedate` reports `filed age UNKNOWN (no idp_filedate)`, and the summary emits the
"1 of 6 hit(s) carry no usable idp_filedate" line.

## Not In Scope

`IN-01` (window-band dedupe key concatenates a remote-controlled label with `|`) and `IN-02`
(hazards-at.js diverges from the codebase's transport and naming conventions) were excluded
by `fix_scope: critical_warning` and are untouched. Note that WR-02's normalization does not
close IN-01: a label containing a literal `|` still collides in the dedupe key.

## Residual Work The Review Asked For And This Pass Did Not Do

Every finding's *source* fix is applied; what remains are the probe scenarios the review
requests alongside them. None was added, because adding scenarios is test authorship rather
than fix application and each would need its own mutation proof to be worth having:

1. WR-01 — warm the cache with `showDrought: true`, poll with `showDrought: false`, assert
   no drought label survives.
2. WR-01 — a matching frontend assertion that the two label lists cannot silently diverge
   (the probe can `require` both productRegistry.js and the frontend module, so this is the
   cheap way to make the restatement drift-proof).
3. WR-05 — a hazards warm-cache + network-error scenario; the stale-fallback path is still
   entirely unexercised for `arcgis-hazard-window`.
4. WR-06 — scenarios that trip both caps.
5. WR-07 — scenarios for the `content-length` precheck and the post-read bound.

Also unaddressed by design: `eslint` cannot run in this repo (`eslint.config.js` is absent
even though `eslint@9` is a devDependency). That is pre-existing and unrelated to these
fixes; verification here was `node -c` per file plus the full 67-scenario probe suite after
each commit.

---

_Fixed: 2026-08-30_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
