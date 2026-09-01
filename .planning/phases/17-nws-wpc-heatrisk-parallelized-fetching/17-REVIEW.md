---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
reviewed: 2026-09-01T20:02:30Z
depth: standard
files_reviewed: 6
files_reviewed_list:
  - productRegistry.js
  - node_helper.js
  - MMM-SPCOutlook.js
  - scripts/probe-lib/module-stubs.js
  - scripts/check-concurrency-invariant.sh
  - scripts/probe-payload-resilience.js
findings:
  critical: 2
  warning: 11
  info: 7
  total: 20
status: issues_found
---

# Phase 17: Code Review Report

**Reviewed:** 2026-09-01T20:02:30Z
**Depth:** standard
**Files Reviewed:** 6
**Status:** issues_found

## Summary

Phase 17 adds the NWS/WPC HeatRisk product (`arcgis-identify-point`) and converts the
six new-product fetches into one `Promise.allSettled` batch. Baseline artifacts are green
(`node scripts/probe-payload-resilience.js` → 82/0/0; `bash scripts/check-concurrency-invariant.sh`
→ exit 0), and both were re-run as part of this review.

Every finding below that is marked **verified** was reproduced against the working tree,
not inferred. Highlights:

- **CR-01 is a live false negative.** `_cacheHeatRiskTuples` does the opposite of what its
  own comment promises: `""`, `null`, `"  "` and `false` in `properties.Values` all coerce
  to category **0 / "Little to No Risk"**, on all seven days, with **no ⚠ badge and no log**.
  This is exactly the confident-all-clear-during-a-hazard shape the project's value statement
  forbids.
- **CR-02: the concurrency guard does not verify what it claims.** `check-concurrency-invariant.sh`
  walks back to the nearest preceding line ending in `{`, not to the enclosing block. At
  `_noteStaleEntry` the audited window collapses to two lines; an `await` inserted at the top
  of that function passes the guard. Reproduced.
- The concurrency audit in `getSpcOutlook`'s batch comment enumerates two shared fields and
  omits `_geoJsonCache` — the largest shared mutable structure the batch touches, and the only
  one read-modify-written *across* an `await` (WR-09). It is safe today only because the six
  members' URL keyspaces happen to be disjoint; nothing states or enforces that.
- Four further HeatRisk data-handling defects were reproduced: out-of-span tiles poison the
  freshness badge (WR-01), a transient fetch failure permanently burns the all-NoData log guard
  (WR-02), and two validtimes rounding to the same day key silently discard an Extreme reading
  (WR-03).
- One new probe scenario is **wall-clock dependent**: with the machine clock set before
  2026-08-31T11:55Z the suite goes 81/1 (WR-04). Today's green is contingent, and the control
  it guards passes only because the computed age is negative.
- The standing D-05 payload oracle (`assertPayloadIntact`) claims to be registry-driven but
  skips the new `arcgis-identify-point` kind entirely (WR-05).

The pure transforms (`_zipHeatRiskCatalog`, `_dedupeHeatRiskByValidTime`, `_heatRiskDayOffset`),
the URL builder, the injected-validator default, the settlement/containment loop, and the
frontend gate/render shared predicate are otherwise sound. The injected-validator change
(priority 4) is behaviour-preserving for all 20 pre-existing callers; the only observable
delta is the `rejectBody` reason string, and both affected probe assertions were updated.

## Critical Issues

### CR-01: Malformed `Values` entries are coerced to category 0 — a confident false negative

**File:** `node_helper.js:556-562`
**Issue:** The comment directly above the code states the contract:

> D-06/HEAT-01: the literal "NoData" sentinel, and anything that is not an integer 0-4,
> becomes `category: null` — never thrown, **never coerced to 0**.

The implementation coerces to 0 for a whole family of malformed inputs, because
`Number("")`, `Number(null)`, `Number("  ")` and `Number(false)` are all `0`, and `0`
satisfies `Number.isInteger(0) && 0 >= 0 && 0 <= 4`:

```js
const parsedValue = Number(rawValue);
const category = (rawValue !== "NoData" && Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 4)
  ? parsedValue
  : null;
```

Consequence: an upstream response whose `Values` degrade to empty strings or nulls renders
seven days of an affirmative **"Little to No Risk"**, `resolvedDays.size` is non-zero so
D-04's all-NoData branch never fires, `anyStale` stays false, no ⚠ badge appears and no log
line is emitted. During a heat wave the module states there is no heat risk.

**Verified** (reproduced against the working tree via the probe stubs; day1 shown, all seven
identical):

| `Values` fixture | `heatRisk.day1` | `_stale` | all-NoData log |
|---|---|---|---|
| `["","","","","","",""]` | `{"category":0,"text":"Little to No Risk","color":"e8f9e7"}` | `undefined` | no |
| `[null,…]` | `{"category":0,"text":"Little to No Risk","color":"e8f9e7"}` | `undefined` | no |
| `["  ",…]` | `{"category":0,"text":"Little to No Risk","color":"e8f9e7"}` | `undefined` | no |
| `[false,…]` | `{"category":0,"text":"Little to No Risk","color":"e8f9e7"}` | `undefined` | no |
| `["NoData",…]` (control) | `{"category":null,"text":"","color":""}` | `true` | yes |

**Fix:** parse only inputs that are actually a category, never anything `Number()` will
silently zero:

```js
const rawValue = tuple.rawValue;
// Only a bare integer string (the live shape) or a real number is a category. Everything
// else — "NoData", "", "  ", null, false, [] — is absence, and absence is null, never 0.
const isIntegerString = typeof rawValue === "string" && /^\d+$/.test(rawValue.trim());
const parsedValue = (isIntegerString || typeof rawValue === "number") ? Number(rawValue) : NaN;
const category = (Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 4)
  ? parsedValue
  : null;
```

Add a probe scenario alongside `heatrisk-all-nodata-sets-stale` that drives `["", null, "  "]`
values and asserts `category === null` and `_stale === true` on every day.

---

### CR-02: `check-concurrency-invariant.sh` does not audit the enclosing block it claims to

**File:** `scripts/check-concurrency-invariant.sh:67-70` (and the header claim at `:16-21`)
**Issue:** The script's stated contract is that no `await` appears "between the enclosing
block's opening brace and the mutation itself." What it actually computes is the **last line
at or above the mutation that ends in `{`** — which is usually an *inner* construct, not the
enclosing block:

```bash
block_start=$(awk -v end="$mutation_line" 'NR<end && /\{[[:space:]]*$/{start=NR} END{print start+0}' "$FILE")
```

For `_oldestStaleAt @ _noteStaleEntry` the script's own output reports `block starts at line
2163` — the *continuation line of the `if` condition* (`entry.timestamp < this._oldestStaleAt) {`),
two lines above the mutation. The function opens at 2160. Everything between 2160 and 2163 is
unaudited.

**Verified.** Inserting `await this._fetch("http://evil");` as the first statement of
`_noteStaleEntry` (line 2161, inside the real enclosing block, before the mutation) still
yields:

```
OK: _oldestStaleAt @ _noteStaleEntry:2165 (block starts at line 2164) — no await between the enclosing block's start and the mutation
check-concurrency-invariant: all sites clean
exit=0
```

The guard does catch the narrow case of an `await` on the line immediately above the mutation
inside the same brace (verified separately at `extractPolygons`), but that is a much smaller
claim than the one `node_helper.js:3378-3379` cites it for ("verified, not assumed —
mechanically enforced by scripts/check-concurrency-invariant.sh").

**Fix:** anchor the window at the *function* rather than the nearest brace. The four sites all
live in a method whose name the caller already supplies as `SITE`, so use that:

```bash
# Walk back to the enclosing METHOD's opening line (`<site>(...) {` or `<site>: ...{`),
# not merely the nearest line ending in `{`.
block_start=$(awk -v end="$mutation_line" -v site="$site" \
  'NR<end && $0 ~ ("(^|[^A-Za-z_])" site "[[:space:]]*\\(") && /\{[[:space:]]*$/ {start=NR} END{print start+0}' "$FILE")
```

Add a self-test: a fixture file containing an `await` at the top of a method whose mutation is
nested inside an `if`, asserted to make the script exit non-zero. Without that, the guard's own
coverage is untested.

## Warnings

### WR-01: Freshness is evaluated over tuples that never reach the payload

**File:** `node_helper.js:1042-1058`
**Issue:** The `maxDataAgeHours` loop iterates `sorted` — *every* deduped tuple — while the
bucketing loop above it (`node_helper.js:977`) discards any tuple whose day offset falls
outside `1..row.days`. A leftover catalog item (yesterday's tile, offset 0) with an old
`idp_filedate` therefore raises `anyStale` for data the user never sees. At HeatRisk's 12 h
tolerance and hourly cadence, one un-rotated tile lights the ⚠ badge on every poll, forever.

**Verified:** with all seven in-span tiles carrying a filedate 1 h old and one extra day-offset-0
tile carrying a filedate 40 h old:

```
out-of-span stale tile -> _stale: true | day1..7 all rendered: true | age log fired: true
control (fresh out-of-span tile) -> _stale: undefined
```

**Fix:** collect the filedates of tuples that actually landed in the block, and age-check only
those:

```js
const inSpan = [];
for (const t of sorted) {
  const d = this._heatRiskDayOffset(t.idpValidtime, todayUtcMs);
  if (d < 1 || d > row.days) continue;
  inSpan.push(t);
  // ... existing presentDays / resolvedDays / payload work
}
// ...
for (const t of inSpan) { /* existing maxDataAgeHours check */ }
```

---

### WR-02: A transient fetch failure permanently burns the all-NoData log guard

**File:** `node_helper.js:962-964` and `node_helper.js:1001-1009`
**Issue:** On a hard fetch failure (`data === null && cachedResult === null`) the runner falls
into `else { tuples = []; }`, `resolvedDays` is empty, and the D-04 branch fires — emitting
`"no day in this poll resolved a real category (every present day was NoData, or no tile
resolved to a valid day at all)"` and setting `this._loggedHeatRiskAllNoData = true`. Two
problems: the message diagnoses a data-content condition for a network failure, and the
once-per-process flag is consumed, so a subsequent *genuine* all-NoData response — the
condition the guard exists to report, and HEAT-03's systemic-break signal — logs nothing for
the remaining life of the process.

**Verified:**

```
J-1 fetch-failure         _stale: true | allNoData log fired: true
J-2 genuine all-NoData    _stale: true | allNoData log fired: false   <-- guard burned
```

**Fix:** distinguish the two causes before entering the D-04 branch, e.g.

```js
} else {
  tuples = [];
  fetchUnavailable = true;   // set in the data===null && cachedResult===null arm
}
// ...
if (resolvedDays.size === 0 && !fetchUnavailable) {
  // D-04 branch, log guard as today
} else if (resolvedDays.size === 0) {
  anyStale = true;           // fetchGeoJsonCached already logged the URL and the cause
}
```

---

### WR-03: Two validtimes rounding to the same day key silently discard a reading

**File:** `node_helper.js:975-989`
**Issue:** `_dedupeHeatRiskByValidTime` collapses items sharing an *exact* `idp_validtime`
using a documented `idp_filedate` tiebreak (HEAT-04). Two *distinct* validtimes that round to
the same day key survive dedupe and then collide in the bucket loop, where last-write-wins by
ascending validtime — no tiebreak, no log, no badge. The `_heatRiskDayOffset` doc
(`node_helper.js:2292-2298`) names this exact dependency ("if a future response ever carries a
midnight-aligned `idp_validtime`, this assumption breaks") but the break is silent, and it
loses the *higher* severity rather than keeping it.

**Verified:** two items at 12:00Z (category 4, Extreme) and 18:00Z (category 0) — both round
to day key 1:

```
day1.category = 0 | _stale = undefined | HeatRisk logs: []
```

An Extreme reading was replaced by "Little to No Risk" with no signal.

**Fix:** detect the collision in the bucket loop rather than overwriting blind:

```js
if (payload["day" + d].category !== null && payload["day" + d].category !== t.category) {
  anyStale = true;
  if (!this._loggedHeatRiskDayCollision) {
    this._loggedHeatRiskDayCollision = true;
    Log.warn("MMM-SPCOutlook _runHeatRiskProduct: two catalog items with different " +
             "idp_validtime values resolved to day " + d + " — the 12:00Z alignment " +
             "_heatRiskDayOffset depends on no longer holds");
  }
}
```

Keeping the *maximum* category on collision (rather than the last) would also match this
project's no-false-negatives posture.

---

### WR-04: A new probe scenario is wall-clock dependent — today's 82/0/0 is contingent

**File:** `scripts/probe-payload-resilience.js:6104`
**Issue:** `heatrisk-stale-item-sets-badge-not-staleAsOf`'s Control 1 writes
`entry.timestamp = Date.now() - 65 * 60 * 1000;` while `helper._nowMs` is pinned to
`HEATRISK_NOW_MS` (2026-08-31T13:00Z). `_isWithinStaleWindow` compares against `_nowMs()`, so
the computed age is `HEATRISK_NOW_MS - (realNow - 65min)`. This mixes the real system clock
with the pinned seam the file's own header (`:322-327`, citing 16-REVIEW WR-05) says every
HeatRisk scenario must use.

Two consequences. Today the age is *negative*, so the control passes without ever exercising
the 2×-interval stale-fallback window it claims to. And on any machine whose clock reads
earlier than ~2026-08-31T11:55Z the age exceeds the window and the scenario fails.

**Verified** — running the suite with the process clock shifted to 2026-08-30T13:00Z:

```
FAIL heatrisk-stale-item-sets-badge-not-staleAsOf: control 1: a genuine fetch failure did not
leave a numeric _staleAsOf — got null, which would make the primary assertion above vacuous
PROBE RESULT: 81 passed, 1 failed, 0 skipped
```

**Fix:** derive the timestamp from the pinned seam, exactly as the rest of the file does:

```js
entry.timestamp = HEATRISK_NOW_MS - 65 * 60 * 1000; // within the 2x-interval stale-fallback window
```

Note `scripts/probe-payload-resilience.js:5261` carries the identical pattern from Phase 16
(`HAZARDS_NOW_MS`); Phase 17 copied it. Fix both, and consider a lint/grep gate banning raw
`Date.now()` in scenario bodies.

---

### WR-05: The standing D-05 payload oracle silently skips the new product kind

**File:** `scripts/probe-payload-resilience.js:1060-1061`
**Issue:** `assertPayloadIntact` iterates `PRODUCT_REGISTRY` but opens with
`if (row.kind !== "arcgis-day-layers") continue;`, and its comment claims:

> The loop below is registry-driven for the same reason node_helper's is: **a Phase 16/17 row
> is covered the moment it is declared, with no edit here.**

That is false for Phase 17's row. `heatRisk.kind === "arcgis-identify-point"` is skipped, so
the ~60 scenarios that call `assertPayloadIntact` without also calling
`assertHeatRiskBlockIntact` would still pass if `heatRisk: heatRiskPayload`
(`node_helper.js:3588`) were deleted from the return object — the same regression the comment
says was found for `winterImpact` and `advisories`. (`arcgis-hazard-window` has the same gap,
covered separately by `assertHazardsBlockIntact`.)

**Fix:** either correct the comment to state which kinds it covers, or dispatch on kind so
every declared row is genuinely covered:

```js
for (const row of Object.values(PRODUCT_REGISTRY)) {
  if (row.kind === "arcgis-day-layers") { /* existing ERO/WSSI checks */ continue; }
  if (row.kind === "arcgis-identify-point") { assertHeatRiskBlockIntact(out); continue; }
  if (row.kind === "arcgis-hazard-window") { assertHazardsBlockIntact(out); continue; }
  if (row.kind === "kml-advisory") { /* existing advisory checks */ continue; }
  throw new Error(`assertPayloadIntact: registry row "${row.id}" has an uncovered kind "${row.kind}"`);
}
```

The trailing `throw` is what makes a fifth kind a loud failure rather than a silent skip.

---

### WR-06: The identify validator gates on a field the pipeline explicitly refuses to use

**File:** `node_helper.js:1753-1758`
**Issue:** `_isHeatRiskIdentifyResponse` requires `typeof body.value === "string"`. The
top-level `value` is precisely the field `_runHeatRiskProduct` documents that it must never
read (`node_helper.js:966-970`, "Under no circumstance is the response's top-level scalar
reading... read here"), because live capture showed it tracking `catalogItemVisibilities`
rather than "today". Coupling the whole product's usability to that field means a benign
upstream change — `value: null` for a point outside the raster, or a numeric `value` — routes
every poll through `rejectBody`, producing a permanent, silent product outage whose only
signal is a `rejected an unusable response body` log and the ⚠ badge.

**Fix:** validate only what the pipeline consumes:

```js
_isHeatRiskIdentifyResponse(body) {
  return !!body && typeof body === "object" && !body.error &&
         !!body.properties && Array.isArray(body.properties.Values) &&
         !!body.catalogItems && Array.isArray(body.catalogItems.features);
}
```

Add a scenario driving `value: null` and `value: 1` with an otherwise-healthy body, asserting
the seven days still populate.

---

### WR-07: `MAP_FIELDS` omits the two remaining cross-row-shareable maps

**File:** `productRegistry.js:537-539`
**Issue:** `assertNoSharedRegistryMaps` is presented as making DATA-03's failure shape
unrepresentable, but `MAP_FIELDS` lists eleven fields and omits `dayLayers` and `layers` —
both objects that are shared by reference across rows in exactly the way the assertion
describes. Two `arcgis-day-layers` rows sharing `eroDayLayers` would send WSSI's Day-2 request
to ERO's layer id: a well-formed 200, a plausible payload, and no error anywhere. That is the
same "confidently wrong, silently" outcome the row's own docstring says the check exists to
prevent, and the docstring's stated coverage limit (closures reading a foreign constant by
name) does not cover it.

**Fix:**

```js
const MAP_FIELDS = ["valueToTier", "tierToText", "tierToColor", "displayColor",
                    "excludedLabels", "droughtLabels", "excludedLabelKeys", "droughtLabelKeys",
                    "toValue", "valueToText", "valueToColor",
                    "dayLayers", "layers"];
```

Extend `registry-rejects-shared-label-maps-at-load-time` with a `dayLayers`-sharing fixture.

---

### WR-08: `turf.toMercator(loc)` non-mutation is an unstated, unpinned safety-critical invariant

**File:** `node_helper.js:923`
**Issue:** `loc` (`node_helper.js:2848`, `turf.point([lon, lat])`) is the single point object
used by *every* product's containment check and is now shared across five concurrently-running
batch members. `_runHeatRiskProduct` passes it to `turf.toMercator`, which accepts a
`{ mutate: true }` option. Turf 7.3.4 defaults to `mutate: false` (verified: the original
coordinates are `[-97.4, 35.2]` after the call, and `m !== p`), so today this is correct —
but if that option were ever added, or a future turf changed the default, every other product
would evaluate point-in-polygon against Web Mercator metres and report **no risk everywhere,
with no badge**. Neither the code, the batch's concurrency comment, nor the probe suite pins
this: `turfStub.toMercator` (`scripts/probe-lib/module-stubs.js:96-107`) always builds a fresh
object, so no scenario can observe a mutating implementation, and every HeatRisk scenario
routes the other products to empty FeatureCollections so no containment runs concurrently.

**Fix:** make the non-mutation explicit at the call site and pin it with an assertion:

```js
// loc is shared by every other concurrent batch member's containment check — never let this
// call mutate it. turf defaults to mutate:false; state it rather than inherit it.
const projected = turf.toMercator(turf.point(loc.geometry.coordinates));
```

and add a scenario asserting `loc`'s coordinates are still degree-scale after a HeatRisk poll,
with at least one other product's containment exercised in the same batch.

---

### WR-09: The batch's concurrency audit omits `_geoJsonCache`

**File:** `node_helper.js:3378-3401`
**Issue:** The audit enumerates two shared fields (`_unusableFeatureCount`, `_oldestStaleAt`)
and closes with "LIMIT OF THIS CLAIM (does not generalise beyond these two fields)". But
`this._geoJsonCache` is helper-global mutable state that four of the six concurrent members
write, and — unlike the two audited fields — its access pattern *is* a read-modify-write that
spans an `await`:

```js
const entry = this._geoJsonCache.get(url);   // fetchGeoJsonCached:2447
res = await this._fetch(url, ...);           // :2460  <-- interleave point
entry.timestamp = this._nowMs();             // :2495 / :2594 / :2610
this._geoJsonCache.set(url, { ... });        // :343 / :505 / :570 (in the runners)
```

This is safe today only because the six members' URL keyspaces are disjoint (four static base
URLs, one lat/lon-derived identify URL, two host-scoped discovery trees). That invariant is
neither stated in the comment nor enforceable by `check-concurrency-invariant.sh`, which
audits fixed anchors. A future product reusing a sibling's URL, or a second module instance
polling a different location, would produce a torn entry with no diagnostic.

**Fix:** extend the batch comment to name `_geoJsonCache` and state the disjoint-URL premise
explicitly, and add a guarded assertion at the batch site, e.g. collect each member's issued
URL prefixes and `Log.error` if any two members share one. At minimum the "LIMIT OF THIS
CLAIM" sentence should not read as if only two fields are shared.

---

### WR-10: No scenario covers HeatRisk with the toggle off (D-02 / D-05)

**File:** `scripts/probe-payload-resilience.js` (absence; all 23 `assertHeatRiskBlockIntact`
call sites run with `showHeatRisk: true`)
**Issue:** D-02/D-05 specify that a toggle-off poll must still emit the full seven-day block,
must not raise `anyStale`, and must issue no identify request. Every other product has such a
scenario (`hazards-toggle-off-emits-the-full-block-and-fetches-nothing`); HeatRisk has none.
I verified the behaviour manually and it is correct today —
`toggle-off heatRisk block keys: 7 | _stale: undefined | identify fetched: false` — but a
regression (for example moving the `payload` seeding below the toggle check at
`node_helper.js:895-904`) would be caught by no assertion, and WR-05 means `assertPayloadIntact`
would not catch a missing block either.

**Fix:** add `heatrisk-toggle-off-emits-the-full-block-and-fetches-nothing`, mirroring the
hazards scenario: run with `{}` toggles, call `assertHeatRiskBlockIntact`, assert every day is
`{ category: null, text: "", color: "" }`, assert `_stale` is unset, and assert
`helper._fetch.calls.every((c) => !c.url.includes(HEATRISK_URL))`.

---

### WR-11: The concurrency guard audits four hand-enumerated sites and cannot see a fifth

**File:** `scripts/check-concurrency-invariant.sh:88-102`
**Issue:** The four `check_site` invocations are hardcoded literals. Adding a new
`this._unusableFeatureCount` or `this._oldestStaleAt` write site — or a new shared field — is
invisible to the script, which will still print "all sites clean". The header partially
acknowledges this ("good enough to catch a future edit that drops an `await` into one of
these specific mutations"), but the *enumeration* gap is distinct from the acknowledged parser
gap, and `node_helper.js:3379` cites the script as proof that the field "has THREE write sites".

There is a second, quieter failure mode: `check_site` locates the mutation with
`tail -n "+$anchor_line" | grep -F "$mutation" | head -1`. Since all three
`_unusableFeatureCount` mutations are byte-identical, deleting one site's increment causes its
check to silently latch onto the *next* site's line and still report OK — so a site can drop
out of coverage without the script noticing.

**Fix:** derive the site list instead of restating it. Assert the total occurrence count
matches the enumerated sites, and fail if it does not:

```bash
expected=3
actual=$(grep -c -F "this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;" "$FILE")
if [ "$actual" -ne "$expected" ]; then
  echo "FAIL: _unusableFeatureCount has $actual write sites, this script audits $expected — re-run the audit"
  FAIL=1
fi
```

Same for `_oldestStaleAt`. Additionally bound the mutation search to a small window after the
anchor (e.g. `sed -n "${anchor_line},$((anchor_line + 5))p"`) so a deleted mutation is a FAIL
rather than a silent re-target.

## Info

### IN-01: `buildHeatRiskIdentifyUrl`'s base-URL guard is tautological

**File:** `productRegistry.js:280-283`
**Issue:** The guard validates `HEATRISK_BASE_URL`, a module `const` declared 14 lines above
at `:266`. It cannot fail at runtime. This differs from `buildArcGisQuery:28-30`, whose
identical-looking check validates a *parameter*. Dead defensive code invites the reader to
believe the host allowlist is enforced per call when it is fixed at authoring time.
**Fix:** either delete it, or hoist it to a module-load assertion beside
`assertNoSharedRegistryMaps(PRODUCT_REGISTRY)` so it reads as the load-time invariant it is.

### IN-02: The clock-dependent-key check and its probe guard are unreachable by construction

**File:** `node_helper.js:546-550`; `scripts/probe-payload-resilience.js:6196-6202`
**Issue:** `_cacheHeatRiskTuples` iterates `Object.keys(tuple)` looking for `/^day\d+$/`, but
`tuple` always arrives from `_dedupeHeatRiskByValidTime` with exactly the keys `attrs` and
`rawValue`, so the regex can never match on the current call graph. Symmetrically, the probe's
"precondition guard" inspects `entry.result.tuples`, which `_cacheHeatRiskTuples:567` builds
from the object literal `{ idpValidtime, category, idpFiledate }` — it also cannot fail. Both
are cheap and harmless, but neither currently proves anything; the *primary* assertion in
`heatrisk-day-offset-recomputed-on-cache-hit` is real and does the work.
**Fix:** keep them, but note in each comment that they guard a *future* shape change rather
than the present one, so a reader does not mistake them for active coverage.

### IN-03: `heatRiskDaysToRender` returns a `category` field no caller reads

**File:** `MMM-SPCOutlook.js:374`, `MMM-SPCOutlook.js:731`
**Issue:** The predicate returns `{ d, category }`, but the render loop destructures only
`{ d }` and re-reads `this.spcrisk.heatRisk["day" + d]` for the category, text and colour.
The gate at `:456` reads only `.length`. The extra field is dead, and the double read means
the predicate and the renderer read the block twice rather than once.
**Fix:** return the resolved entry and consume it — `days.push({ d, day })`, then
`for (const { d, day } of heatRiskDaysToRender(...))` — which also removes the second lookup.

### IN-04: `_runHeatRiskProduct`'s toggle check is stricter than its three siblings'

**File:** `node_helper.js:902`
**Issue:** `if (productToggles[row.configFlag] !== true)` versus
`if (productToggles[row.configFlag])` at `:303`, `:672` and `:1268`. Equivalent when the
toggles came through `_productToggles` (which normalizes with `=== true`), but
`getSpcOutlook:2753` accepts a caller-supplied `products` object un-normalized, so a raw
`{ showHeatRisk: "yes", showExcessiveRain: "yes" }` would fetch ERO and skip HeatRisk.
**Fix:** normalize once — `const productToggles = this._productToggles(products ?? this._products);`
— or make all four runners use `=== true`.

### IN-05: HeatRisk rows render "(Day N)" with no date, over a UTC-derived day key

**File:** `MMM-SPCOutlook.js:732-734`
**Issue:** `_heatRiskDayOffset` derives the day key from `_todayUtcMs()`, so for US time zones
the key advances at UTC midnight — 5-8 hours before local midnight. Between local evening and
local midnight "Heat Risk (Day 1)" is the next local calendar day's tile. This matches the
existing ERO/WSSI `renderDayBlock` convention (`:589`), so it is consistent rather than novel,
but Hazards Outlook resolves the ambiguity by rendering a real date; HeatRisk gives the user
nothing to check against.
**Fix (optional):** carry `date: this._utcDateString(t.idpValidtime)` in each HeatRisk day
entry — `_utcDateString` already exists at `node_helper.js:2318` — and render the weekday the
way `hazardsWeekdayFromDate` does.

### IN-06: `installDeferredHttp`'s safety timer cannot fire for a request the scenario never awaits

**File:** `scripts/probe-payload-resilience.js:890-902`
**Issue:** The refed-timer reasoning is correct and is a genuine improvement over `unref()`.
It closes the case where an abandoned request blocks the scenario. It does not close the case
where a scenario leaves a request pending *without* awaiting it: `main()` reaches
`process.exit()` well under `timeoutMs = 3000`, killing every armed timer before it fires, so
the abandonment is invisible. Narrow, but the comment reads as an unconditional guarantee.
**Fix:** after the scenario loop and before `process.exit`, assert that no deferred stub still
holds pending entries — e.g. have `installDeferredHttp` register itself in a module-level
registry and have `main()` fail the run if any registry member's `pending` array is non-empty.

### IN-07: `rejectBody`'s reason string lost its shape-specific detail

**File:** `node_helper.js:2600`, `node_helper.js:2616`
**Issue:** `'not a usable FeatureCollection'` became `'not a usable body'` so one message can
serve two validators. The URL is still named, so the layer is identifiable, but an operator can
no longer tell *which* contract was violated from the log alone. The two probe assertions that
depended on the old literal were correctly updated.
**Fix (optional):** have the validator name itself —
`if (!isValidBody(parsed.value)) return rejectBody('body failed ' + (isValidBody.name || 'the shape validator'))`
— or pass a short label alongside the validator.

## Conventions

_Advisory only — these never block a merge._

### CV-01: `productRegistry.js` filename casing

**File:** `productRegistry.js:1`
**Deviation:** file name casing is camel (`productRegistry`).
**Convention:** repository `file-name-casing` should be kebab.
**Suggested fix:** rename to a kebab-cased basename (`product-registry.js`). Recommend-fix
only, and out of Phase 17's scope: the file predates this phase and every import site would
change.

### CV-02: `node_helper.js` filename casing

**File:** `node_helper.js:1`
**Deviation:** file name casing is snake (`node_helper`).
**Convention:** repository `file-name-casing` should be kebab.
**Suggested fix:** none recommended — `node_helper.js` is the filename MagicMirror's module
loader requires. Recording the deviation for completeness; do not act on it.

---

_Reviewed: 2026-09-01T20:02:30Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: standard_
