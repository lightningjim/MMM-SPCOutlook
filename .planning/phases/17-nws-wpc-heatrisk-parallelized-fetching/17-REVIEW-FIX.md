---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
fixed_at: 2026-09-01T23:43:37Z
review_path: .planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 17: Code Review Fix Report

**Fixed at:** 2026-09-01T23:43:37Z
**Source review:** `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (CR-01, CR-02, WR-01 … WR-11)
- Fixed: 13
- Skipped: 0
- Out of scope, untouched: IN-01 … IN-07, CV-01, CV-02

**Baseline movement:**

| Artifact | Before | After |
|---|---|---|
| `node scripts/probe-payload-resilience.js` | 82 passed, 0 failed, 0 skipped | **91 passed, 0 failed, 0 skipped** (exit 0) |
| `bash scripts/check-concurrency-invariant.sh` | exit 0 | exit 0 (now with a self-test and two count checks) |
| `node --check` on every edited `.js` | clean | clean |

Nine new scenarios; no scenario or assertion was weakened anywhere. The suite was
additionally run with the process clock shifted **−2 days** and **+400 days**: 91/0/0 in
both cases (it was 81/1 at −2 days before WR-04).

---

## Fixed Issues

### CR-01: Malformed `Values` entries coerced to category 0

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `1992ae2`

Replaced coerce-then-range-check with allow-list-then-coerce. Only a bare non-negative
integer string (the live shape) or a real number is a category candidate; `""`, `null`,
`"  "`, `false`, `[]`, `"1.5"`, `"NoData"` are all absence → `null`. `"NoData"` is no
longer a privileged sentinel, which is the point: it was never the only absence shape a
degraded upstream can emit.

New scenario `heatrisk-falsy-values-are-absence-never-category-zero` drives all five
zeroing shapes as separate sub-cases (so a partial regression names the offender), asserts
`_stale` and the D-04 log fire, and carries an integer-string control so a fix that simply
nulled everything cannot pass. **RED against the old code:**

```
FAIL heatrisk-falsy-values-are-absence-never-category-zero: CR-01: Values entry empty
string ("") was coerced to category 0 ("Little to No Risk") on day1 — absence must be
null, never 0. This renders an affirmative all-clear on a heat-safety product from a
degraded payload.
```

### CR-02: Concurrency guard did not audit the block it claimed

**Files modified:** `scripts/check-concurrency-invariant.sh`, `node_helper.js`
**Commit:** `6235086`

The window is now anchored on the declaration of the method named in `SITE`, and a missing
declaration is a `FAIL` rather than a fallback to something narrower. The window is the
whole method prefix — a superset of the true enclosing block, so it errs over-strict, which
is the safe direction; under-strictness is what shipped. Real windows moved from 2 lines to
whole methods (`_noteStaleEntry` 2163→2179, `extractPolygons` 1803→1796 at the time).

Added a **permanent self-test** that runs before the audit on every invocation: it injects
an `await` into a copy of `_noteStaleEntry` and requires the audit to flag it.

**Demonstrated capable of failing** (the manual proof, against the real `node_helper.js`):

```
FAIL: _oldestStaleAt @ _noteStaleEntry:2184 — a future edit introduced an `await` between
_noteStaleEntry()'s opening line (2179) and a mutation that Promise.allSettled's safety
argument requires to be unreachable-by-interleaving
check-concurrency-invariant: FAILED — see above
exit=1
```

The old script printed `OK` and exit 0 for this exact injection. Injection reverted;
`node_helper.js` sha256 confirmed byte-identical (`4e9a5ead…8dd38e` before and after).

Also corrected the overstated citation at the batch comment: "verified, not assumed —
mechanically enforced" now separates what the script checks from the reasoned,
non-machine-checked parts.

### WR-01: Freshness evaluated over tuples that never reach the payload

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `46f716e`

Bucket loop collects `inSpan`; the D-07 age loop iterates it instead of `sorted`.

New scenario `heatrisk-out-of-span-tile-does-not-age-the-badge` (seven fresh in-span tiles
plus one 40 h-old offset-0 leftover) with a control moving the aged filedate in-span.
**RED against the old code:**

```
FAIL heatrisk-out-of-span-tile-does-not-age-the-badge: WR-01: an out-of-span (day offset 0)
tile with a 40h-old idp_filedate raised _stale=true, but nothing from that tile reaches the
payload — the freshness badge must describe the data the user is shown, not tuples the
bucket loop discarded
```

### WR-02: Transient fetch failure burned the all-NoData log guard

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `3d6d40a`

Added `fetchUnavailable`, set on the no-body-and-no-cache arm, and gated the D-04 branch on
it. A hard failure still raises the badge; only the misattributed diagnosis and the spent
one-shot budget are separated out.

New scenario `heatrisk-fetch-failure-does-not-burn-the-all-nodata-log-guard` runs J-1 (503,
nothing cached — with a precondition guard that nothing was cached) then J-2 (genuine
all-NoData) on the same helper, plus a control that the guard is still one-shot.
**RED against the old code:**

```
FAIL heatrisk-fetch-failure-does-not-burn-the-all-nodata-log-guard: WR-02: a hard fetch
failure emitted the all-NoData data-content diagnosis 1 time(s) — it diagnoses the wrong
cause AND consumes the one-shot guard that the genuine all-NoData case depends on
```

### WR-03: Two validtimes on one day key silently discarded a reading — **requires human verification**

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `de8eb29`

The bucket loop now tracks the validtime already bucketed into each day. A second, different
validtime raises `anyStale` and logs once (fifth one-shot guard,
`_loggedHeatRiskDayCollision`); the surviving category is the **maximum**, not the last.

**RED against the old code**, reproducing the review's exact finding:

```
FAIL heatrisk-same-day-key-collision-keeps-max-and-signals: WR-03: two distinct
idp_validtime values rounded to day key 1 and the LATER, LOWER reading won —
day1.category=0 ("Little to No Risk"), expected 4 (Extreme). A silent overwrite by arrival
order must never downgrade a severity.
```

**Flagged for human confirmation** — two product decisions, not just a bug fix:
1. The badge fires on **any** second distinct validtime, even when both readings agree. I
   judged the alignment assumption itself to be what has broken (every day key in the block
   is attributed by it), matching D-05's interior-gap trade, which explicitly accepts a
   permanent badge. If upstream ever routinely ships e.g. 06Z and 18Z tiles this becomes a
   permanent badge — the same accepted cost, but worth a conscious sign-off.
2. Keeping the **max** rather than the newest is the no-false-negatives reading of the
   review's suggestion; it is a real semantic choice about which reading wins.

### WR-04: Wall-clock-dependent scenario

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `dade8e2`

Both sites (the HeatRisk one at the review's `:6104` and the Phase 16 twin it was copied
from) now derive from `HEATRISK_NOW_MS` / `HAZARDS_NOW_MS`.

Added the lint gate the review suggested: `harness-no-raw-clock-in-a-clock-pinned-scenario`
strips comments from its own source, chunks the scenario array by `name:`, and fails any
scenario that both pins `_nowMs` and calls `Date.now()`. Scenarios that never pin the seam
are untouched — the pre-Phase-16 cache-ageing scenarios use the real clock consistently and
correctly, so a blanket ban would have been wrong.

**Reproduced the original failure** with `Date.now()` shifted back 2 days:

```
FAIL heatrisk-stale-item-sets-badge-not-staleAsOf: control 1: a genuine fetch failure did
not leave a numeric _staleAsOf — got null, which would make the primary assertion above
vacuous
PROBE RESULT: 85 passed, 1 failed, 0 skipped
```

**Gate proven RED** by reintroducing the leak:

```
FAIL harness-no-raw-clock-in-a-clock-pinned-scenario: WR-04: these scenarios pin
helper._nowMs and then also read the real machine clock via Date.now() …
heatrisk-stale-item-sets-badge-not-staleAsOf (1 raw Date.now() use(s))
```

Amusing side-note recorded in the code: on first run the gate flagged **itself**, because
its own synthetic control fixture was literal source text. The fixture is now assembled
from fragments.

### WR-05: D-05 payload oracle skipped the new product kind

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `2ed6d7c`

`assertPayloadIntact` now dispatches on `row.kind` (all four kinds) and **throws** on an
unrecognised one. The trailing throw is the load-bearing part.

**Verified by actually deleting the payload key**, as instructed:

```
# with `heatRisk: heatRiskPayload` deleted from getSpcOutlook's return object
FAIL ero-arcgis-error-body: assertHeatRiskBlockIntact: heatRisk missing or not an object
PROBE RESULT: 23 passed, 64 failed, 0 skipped
```

It previously passed. `node_helper.js` restored, sha256 byte-identical.
The trailing throw was proven separately with a synthetic fifth registry kind:

```
FAIL ero-arcgis-error-body: assertPayloadIntact: registry row "__probeFifthKind" has an
uncovered kind "some-new-kind" …
```

`productRegistry.js` restored, sha256 byte-identical.

### WR-06: Validator gated on a field the pipeline refuses to read — **requires human verification**

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `53bf3ba`

Dropped `typeof body.value === "string"` from `_isHeatRiskIdentifyResponse`; it now asserts
exactly `properties.Values` and `catalogItems.features`.

New scenario `heatrisk-unused-top-level-value-does-not-gate-usability` drives `value` as
`null`, `1`, `0` and `"NoData"`, plus **controls** requiring the validator to still refuse a
body with no `properties.Values`, no `catalogItems.features`, or an ArcGIS `error` object —
so the loosening cannot slide into "accepts everything". **RED against the old code:**

```
FAIL heatrisk-unused-top-level-value-does-not-gate-usability: WR-06: an otherwise-healthy
body carrying top-level value=null (point outside the raster) failed to populate day1
(expected category 1, got null) — the validator is gating the product on a field the
pipeline deliberately never reads
```

**Flagged for human confirmation:** this deliberately *loosens* a validator. I believe it is
right (the removed check gated the product on data the pipeline documents it must never
trust) and the negative controls pin the floor, but relaxing an input guard deserves an
explicit sign-off rather than an implicit one.

### WR-07: `MAP_FIELDS` omitted `dayLayers` and `layers`

**Files modified:** `productRegistry.js`, `scripts/probe-payload-resilience.js`
**Commit:** `2219e22`

Both added. `registry-rejects-shared-label-maps-at-load-time` extended with a
`dayLayers`-sharing fixture and a `layers`-sharing fixture (proving identity comparison
works on an array), asserted separately since a `MAP_FIELDS` entry can be dropped one at a
time; Control 1 gained both fields so distinct-but-identical structures still must not throw.

**RED with the two entries removed:**

```
FAIL registry-rejects-shared-label-maps-at-load-time: WR-07: expected
assertNoSharedRegistryMaps to throw naming `dayLayers` on two rows sharing one dayLayers
object by reference, got: no throw
```

### WR-08: `turf.toMercator(loc)` non-mutation unstated and unpinned

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `1cc4f78`

**The review's literal suggested fix does not work**, and I verified that rather than
applying it. `turf.toMercator(turf.point(loc.geometry.coordinates))` passes the *same
coordinate array by reference*, so a mutating implementation still writes through to `loc`.
With that form in place the new scenario still failed identically. The call site now
projects a structural clone, which also stays agnostic to whether `loc` is a Feature or a
bare geometry.

New scenario `heatrisk-mercator-projection-never-mutates-the-shared-point` supplies the two
halves that were missing: a deliberately **mutating** `toMercator` stub (what
`{ mutate: true }` would do — the old stub always built a fresh object, so no scenario
*could* observe this), and a real ERO polygon so a **sibling batch member** runs containment
in the same batch. Both preconditions are guarded. **RED against the old code:**

```
FAIL heatrisk-mercator-projection-never-mutates-the-shared-point: WR-08: a turf Point built
this poll was mutated to Web Mercator metres ([-8571600.791082066,4707357.536267922]).
`loc` is shared by every product's containment check and by five concurrent batch members …
```

### WR-09: Batch audit omitted `_geoJsonCache` — **requires human verification**

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `d7dfa75`

**Which option I chose, and why.** The review offered "extend the guard to cover
`_geoJsonCache`, or make the disjoint-URL premise explicit and enforced". I chose
**enforcement**, because extending `check-concurrency-invariant.sh` is impossible *in kind*:
that script asserts "no `await` in the window", and for `_geoJsonCache` the await **is** the
pattern (read entry → await fetch → write entry). Pointing it at this site would produce a
guaranteed FAIL, not a check. The safety argument for this structure is a different kind of
argument — key disjointness, not mutation synchronicity — so it needed a different kind of
enforcement.

`fetchGeoJsonCached` now tracks in-flight cache keys and logs loudly if two fetches for one
key are ever in flight at once. I enforced **the condition that actually tears an entry**
rather than member identity, which is both simpler and strictly broader: it also covers a
second module instance and a discovery tree that starts emitting a sibling's URL, neither of
which a per-member URL-prefix comparison would catch. The body was split into
`_fetchGeoJsonCachedInner` only so the wrapper can do its bookkeeping in a `finally` across
the many return points. The batch comment now names `_geoJsonCache`, states the premise, and
its LIMIT sentence covers three structures.

New scenario `geojson-cache-concurrent-same-key-fetches-are-reported` drives two overlapping
fetches (precondition-guarded to be genuinely concurrent), with controls that sequential
fetches are silent, that **the shipped six-member batch does not trip it** — the
disjointness premise asserted rather than assumed — and that the report is one-shot.
**RED with the check disabled:**

```
FAIL geojson-cache-concurrent-same-key-fetches-are-reported: WR-09: two concurrent fetches
for the same _geoJsonCache key produced 0 contention reports, expected exactly 1.
```

**Flagged for human confirmation:** detection is a `Log.error`, not a lock or a throw. I
judged serialising to be papering over a bug that should be fixed, and throwing to be
turning a latent correctness risk into an immediate outage — but "log and carry on" is a
policy choice about a data-integrity hazard and should be endorsed explicitly.

### WR-10: No coverage for HeatRisk with the toggle off

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `fc4b26e`

Coverage only; behaviour was already correct.
`heatrisk-toggle-off-emits-the-full-block-and-fetches-nothing` mirrors the hazards scenario
and routes a **healthy** body deliberately, so an implementation that fetched and parsed it
would be caught by the category assertions rather than passing against an empty fixture. It
also asserts D-04's diagnosis does not fire, and carries a toggle-on control.

**RED** with the payload seeding moved below the toggle check:

```
FAIL heatrisk-toggle-off-emits-the-full-block-and-fetches-nothing:
assertHeatRiskBlockIntact: heatRisk has 0 keys, expected 7 (day1..day7)
PROBE RESULT: 42 passed, 49 failed, 0 skipped
```

(49 failures, because WR-05 now routes every `assertPayloadIntact` call through the HeatRisk
block check — the two fixes reinforce each other.) `node_helper.js` restored byte-identical.

### WR-11: Guard audits four hand-enumerated sites and cannot see a fifth

**Files modified:** `scripts/check-concurrency-invariant.sh`, `node_helper.js`
**Commit:** `b4aa991`

Both halves of the finding closed. `check_site_count` derives each field's occurrence count
from the file and fails if it differs from the number of enumerated sites; the mutation
search is bounded to 8 lines below the anchor (every real distance is ≤ 5), so a deleted
mutation is a FAIL rather than a silent re-target onto the next identical site.

**Verified both directions:**

```
# deleting checkInPolygon's increment
FAIL: _unusableFeatureCount has 2 write site(s) matching the audited mutation text, but
this script enumerates 3 …
FAIL: _unusableFeatureCount @ checkInPolygon:3843 — mutation text not found within 8 lines
of its anchor (deleted, moved, or reworded?) …
exit=1

# adding a fourth increment
FAIL: _unusableFeatureCount has 4 write site(s) matching the audited mutation text, but
this script enumerates 3 …
exit=1
```

`node_helper.js` sha256 byte-identical after each restore. The batch comment's claim that
the script proves "THREE write sites" is now true, and the residual gap (a wholly new shared
field) is stated as a reasoned obligation rather than a mechanical one.

---

## Skipped Issues

None. All 13 in-scope findings were fixed.

---

## New and extended coverage

Nine new scenarios (82 → 91), each mutation-proven RED before its fix and green after:

| Scenario | Finding |
|---|---|
| `heatrisk-falsy-values-are-absence-never-category-zero` | CR-01 |
| `heatrisk-out-of-span-tile-does-not-age-the-badge` | WR-01 |
| `heatrisk-fetch-failure-does-not-burn-the-all-nodata-log-guard` | WR-02 |
| `heatrisk-same-day-key-collision-keeps-max-and-signals` | WR-03 |
| `harness-no-raw-clock-in-a-clock-pinned-scenario` | WR-04 |
| `heatrisk-unused-top-level-value-does-not-gate-usability` | WR-06 |
| `heatrisk-mercator-projection-never-mutates-the-shared-point` | WR-08 |
| `geojson-cache-concurrent-same-key-fetches-are-reported` | WR-09 |
| `heatrisk-toggle-off-emits-the-full-block-and-fetches-nothing` | WR-10 |

Extended in place: `assertPayloadIntact` (WR-05, now covers all four registry kinds and
throws on a fifth), `registry-rejects-shared-label-maps-at-load-time` (WR-07), and
`check-concurrency-invariant.sh`'s own self-test and count checks (CR-02, WR-11).

## Notes for the verifier

- **CR-01 is the one to sanity-check first in a live run.** It changes what a real degraded
  upstream payload renders, and it is the finding the existing 82-scenario suite could not
  see.
- Three fixes are flagged **requires human verification** above (WR-03, WR-06, WR-09). All
  three are green and mutation-proven; the flag is about product/policy judgment, not about
  whether the code works.
- The review's suggested fix for **WR-08 was insufficient** and was not applied as written;
  the reasoning and the empirical check are recorded in the commit and above.
- Out-of-scope findings IN-01 … IN-07 and CV-01/CV-02 were deliberately left untouched.
  IN-02 is worth a glance in a future pass: it observes that `_cacheHeatRiskTuples`'s
  `/^day\d+$/` guard is unreachable on the current call graph, and that guard now sits
  directly above the CR-01 code that was reachable and wrong.

---

_Fixed: 2026-09-01T23:43:37Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
