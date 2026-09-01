# Phase 17 Mutation Inventory

Consolidated from `17-05-SUMMARY.md` through `17-08-SUMMARY.md`. Every row is transcribed from
those SUMMARYs, not re-run: no mutation in this document was re-applied during this plan's
execution (`git status --short` was clean at the start of this plan and remains clean — this
plan touches only `.planning/` files). RED messages are copied verbatim from the source SUMMARY.

**Reconciliation:** the phase added 15 scenarios to the probe suite across three plans —
5 (17-06) + 6 (17-07) + 4 (17-08) = **15**, matching the baseline arithmetic (67 → 72 → 78 → 82).
Plus `scripts/check-concurrency-invariant.sh`'s own mutation proof from 17-05, which is not a
probe-suite scenario but carries its own dedicated mutation/RED/restore cycle and is the
mechanical proof behind PERF-01's concurrency-safety claim. **16 rows total below: 15 scenarios
+ 1 script proof. 0 missing, 0 invented.**

Note on the stale "79/79" figure some plans' own verification text cites (17-01, 17-02, 17-04,
17-05 SUMMARYs all record this as an assumption-drift/tension item): the true baseline this
phase started from, live on this branch, was **67**, and the true final count, live-verified as
part of this plan's own precondition check, is **82** (`node scripts/probe-payload-resilience.js`
→ `82 passed, 0 failed, 0 skipped`). The 79 figure was a stale planning-time estimate and is not
repeated as fact anywhere in this document.

## Mutation Inventory

| # | Scenario | Requirement / Decision | Exact mutation applied | RED message observed (verbatim) | Restored green | Precondition guard proven capable of firing | Control assertion proven non-vacuous |
|---|---|---|---|---|---|---|---|
| 1 | `heatrisk-identify-body-survives-the-shared-fetch-validator` | HEAT-01/02/03/04 enabling infrastructure (17-RESEARCH.md headline finding: `fetchGeoJsonCached`'s generalized `isValidBody` parameter) | `node_helper.js` — reverted both `fetchGeoJsonCached` call sites from `isValidBody(parsed.value)` back to `this._isFeatureCollection(parsed.value)` | `FAIL heatrisk-identify-body-survives-the-shared-fetch-validator: expected at least one day with a numeric category, got {"day1":{"category":null,"text":"","color":""},...}` | yes (`git diff` on `node_helper.js` showed no residual change) | Yes — Guard 1 ("fetch-never-happened") proven to fire under a broken toggle-off setup, per 17-06's "Precondition-guard firing proofs" | Yes — scenario carries "a control arm exercising a body missing `catalogItems` entirely" (17-06 Accomplishments) |
| 2 | `heatrisk-day-order-follows-validtime-not-array-order` | HEAT-01, HEAT-02 | `node_helper.js` — removed `.sort((a,b) => a.idpValidtime - b.idpValidtime)` (bare `.slice()`) AND replaced `_heatRiskDayOffset(t.idpValidtime, todayUtcMs)` with `sorted.indexOf(t) + 1` (two coupled edits — see Deviation note below) | `FAIL heatrisk-day-order-follows-validtime-not-array-order: day1: expected category 1 (attributed by idp_validtime), got 2 — category is following array order instead of the sort` | yes | Yes — Guard 2 ("fixture-pre-sorted") proven to fire on a pre-sorted fixture | Yes — the live-observed scrambled catalog order (`5,7,1,4,6,2,3`-shaped fixture) is itself the anti-vacuity device; 17-04-SUMMARY independently confirms an already-sorted fixture would let a positional bug pass unnoticed |
| 3 | `heatrisk-geometry-uses-mercator-not-raw-degrees` | HEAT-03 | `node_helper.js` — replaced `const [mercatorX, mercatorY] = projected.geometry.coordinates;` with `const [mercatorX, mercatorY] = loc.coordinates;` (raw lon/lat, no reprojection) | `FAIL heatrisk-geometry-uses-mercator-not-raw-degrees: expected Mercator-magnitude coordinates (\|x\|,\|y\| > 1e6), got x=-77 y=38.9` | yes (`git diff --stat` showed only the probe script modified) | Yes — Guard 3 ("not-exactly-one-identify-call") proven to fire when the toggle is off, count=0 | Yes — decodes the actually-issued identify URL's `geometry` parameter and asserts Mercator magnitude under a `wkid:102100` declaration, rather than trusting an opaque stub |
| 4 | `heatrisk-duplicate-validtime-keeps-latest-filedate` | HEAT-04 | `node_helper.js` — flipped `_dedupeHeatRiskByValidTime`'s tiebreak from `filedate > existingFiledate` to `filedate < existingFiledate` (keep the OLDER item) | `FAIL heatrisk-duplicate-validtime-keeps-latest-filedate: HEAT-04: expected day3 to carry the winning (greatest idp_filedate) category 1, got 4` | yes | Yes — Guard 4 ("no-duplicate-in-fixture") proven to fire on a non-duplicated fixture | Yes — a dedicated **visibility-independence proof** re-ran the fixture with the duplicate pair's `catalogItemVisibilities` flipped to mark the LOSER tile visible: `Visibility-independence result: PASS (winner unchanged, decided by idp_filedate not visibility)` — proves the tiebreak is genuinely `idp_filedate`, not an accidental correlation with visibility |
| 5 | `heatrisk-mismatched-values-length-abandons-poll` | D-06 | `node_helper.js` — removed the length-mismatch check from `_zipHeatRiskCatalog`, leaving only the `Array.isArray` guards (zips positionally to `features.length` regardless of a shorter `Values` array) | `FAIL heatrisk-mismatched-values-length-abandons-poll: D-06: expected day1.category null on a length-mismatched body (poll should be abandoned, not truncated), got 1` | yes (`git status --short` showed only the probe script modified) | Yes — Guard 5 ("values-features-matched") proven to fire on a matched (non-mismatched) fixture | Yes — the D-06 precondition guard itself doubles as the non-vacuity proof: a fixture that isn't actually length-mismatched would fail the guard before the primary assertion runs |
| 6 | `heatrisk-partial-nodata-is-silent` | D-04 (partial-NoData branch) | `node_helper.js` — added `else { anyStale = true; }` to the per-tuple bucket loop (blanket "any NoData sets stale") | `FAIL heatrisk-partial-nodata-is-silent: D-04: expected _stale unset on a partial-NoData response, got true` | yes | Yes — `guard6 THROW: precondition failed: fixture must carry both a NoData day and a real 0-4 day, got Values=[...]` | Yes — scenario's own control re-exercises the all-NoData condition (see Cross-Branch Independence Matrix below); non-vacuity demonstrated by Mutation 7 reddening this control without touching the primary |
| 7 | `heatrisk-all-nodata-sets-stale` | D-04 (total-NoData branch) | `node_helper.js` — replaced `if (resolvedDays.size === 0)` with `if (false)` (removed the all-NoData check) | `FAIL heatrisk-partial-nodata-is-silent: control: expected _stale set when every day is NoData, got undefined` / `FAIL heatrisk-all-nodata-sets-stale: D-04: expected _stale set on an all-NoData response, got undefined` | yes | Yes — `guard7 THROW: precondition failed: fixture is not all-NoData, got Values=["NoData","1","NoData",...]` | Yes — also asserts the one-shot log guard (`_loggedHeatRiskAllNoData`) fires exactly once across two consecutive polls with the same fixture |
| 8 | `heatrisk-tail-gap-is-silent` | D-05 (tail-gap branch) | `node_helper.js` — changed the interior-gap condition to `if (interiorGaps.length > 0 \|\| presentDays.size < row.days)` (any gap, including tail, sets stale) | `FAIL heatrisk-tail-gap-is-silent: D-05: expected _stale unset on a tail-gap (days 6-7 missing) response, got true` / `FAIL heatrisk-day1-gap-sets-stale: control: expected _stale unset on a tail-gap-only fixture, got true` | yes | Yes — `guard8 THROW: precondition failed: expected exactly items at day offsets [1,2,3,4,5], computed [1,2,3,4,6]` | Yes — sibling scenario's control re-exercises this exact tail-gap fixture (see matrix below) |
| 9 | `heatrisk-day1-gap-sets-stale` | D-05 (Day-1 / interior-gap branch) | `node_helper.js` — inverted the interior-gap loop's comparison (`for (let d = 1; d > maxPresent; d++)`, never iterates) | `FAIL heatrisk-tail-gap-is-silent: control: expected _stale set when day3 is missing (an interior gap), got undefined` / `FAIL heatrisk-day1-gap-sets-stale: D-05: expected _stale set when Day 1 is missing, got undefined` | yes | Yes — `guard9 THROW: precondition failed: expected 6 items in arm 1, got 5` | Yes — covers BOTH the Day-1-missing arm and a second interior arm (day 3 missing, days present on both sides), proving the branch is position-aware (`d < maxPresent`), not a Day-1 special case |
| 10 | `heatrisk-stale-item-sets-badge-not-staleAsOf` | D-07 (16 D-15's `_staleAsOf` asymmetry) | `node_helper.js` — short-circuited the per-item age check (`if (false && ...)`) | `FAIL heatrisk-stale-item-sets-badge-not-staleAsOf: D-07: expected _stale set when one surviving item exceeds maxDataAgeHours=12h, got undefined` | yes (only this scenario failed — full isolation from every other scenario) | Implicit — `maxDataAgeHours` is read from `PRODUCT_REGISTRY.heatRisk.maxDataAgeHours` at scenario build time rather than hardcoded, so a registry retune cannot silently make the fixture non-representative | Yes — TWO control arms: (1) a genuine fetch failure leaves a numeric `_staleAsOf` (proving the primary assertion is a deliberate omission, not harness vacuity); (2) an aged `idp_filedate` placed on a HEAT-04 dedupe LOSER leaves `_stale` unset (proving the age check runs on surviving items only) |
| 11 | `heatrisk-day-offset-recomputed-on-cache-hit` | Day-offset-cache-staleness contract (Phase 16's headline pitfall, applied to HeatRisk) | `node_helper.js` — two-site mutation adopting `_runArcGisDayProduct`'s (wrong-for-this-product) cache shape: (a) `_cacheHeatRiskTuples` buckets `whitelisted` by day offset AT WRITE TIME and stores that day-keyed object as `result`; (b) `_runHeatRiskProduct`'s cache-hit branch reads the day-keyed value directly, bypassing recompute | `FAIL heatrisk-day-offset-recomputed-on-cache-hit: precondition failed: no cache entry (or malformed tuples) for the HeatRisk URL: {"mode":"etag","etag":"heatrisk-day-offset-v1","hash":null,"result":{"day1":1,"day2":2,...},"timestamp":1788181200000}` | yes | Yes, but via a different mechanism than the plan anticipated — see disclosed finding below | Yes — cache-path control confirmed live: second poll's request carried `If-None-Match: heatrisk-day-offset-v1`, and `fetchFn.calls` recorded exactly two HeatRisk identify requests, proving the second poll genuinely took the cache-hit path |
| 12 | `frontend-heatrisk-only-is-not-an-all-clear` | D-03 (gate term) | `MMM-SPCOutlook.js` — deleted the HeatRisk gate term from `getDom`'s no-risk short-circuit | `FAIL frontend-heatrisk-only-is-not-an-all-clear: D-03: a HeatRisk-only day above the floor (category 3, showMinorHeat false) suppressed the all-clear was not the outcome; instead it rendered the all-clear anyway: No Severe Weather Risk` | yes (`git status --short MMM-SPCOutlook.js` clean) | Yes — verified by code inspection of the guard's own throw path (a control payload with `heatRisk` all-null must render the plain all-clear before the primary assertion is trusted); no live fault currently exists to trigger it, so this is a structural, not a live-fired, proof | Yes — the guard doubles as the control: proves the otherwise-all-quiet payload genuinely renders the plain all-clear when HeatRisk carries no reading |
| 13 | `frontend-heatrisk-minor-floor-is-not-a-blank-module` | D-01, D-03 | `MMM-SPCOutlook.js` — the plan's PRIMARY mutation ("gate reads raw category, loop keeps floor") is **structurally impossible**: both call sites are the literal same expression `heatRiskDaysToRender(this.spcrisk.heatRisk, this.config.showMinorHeat)` — a positive D-03 finding. Fallback mutation applied instead: `showMinorHeat === true ? 1 : 2` → `showMinorHeat === true ? 1 : 1` inside `heatRiskDaysToRender` | `FAIL frontend-heatrisk-minor-floor-is-not-a-blank-module: Arm A (showMinorHeat false): expected the Minor row filtered out by the floor, got: Heat Risk (Day 3): <span style="color:#f4f257">Minor</span><br/>` | yes (only this scenario failed under the fallback mutation — S12 stayed green, confirming isolation) | Two-arm design (showMinorHeat off/on) serves as its own guard — Arm B (`showMinorHeat: true`) independently failed under Mutation A (the gate-term deletion), confirming both arms depend on the shared gate | Yes — "a category-2 control proving Arm A's non-render is the floor at work, not a renderer that never renders" |
| 14 | `registry-rejects-shared-label-maps-at-load-time` | DATA-03, D-11 | `productRegistry.js` — removed `"valueToTier"` from the `MAP_FIELDS` array | `FAIL registry-rejects-shared-label-maps-at-load-time: expected assertNoSharedRegistryMaps to throw on two rows sharing the same valueToTier object by reference, it did not throw` | yes (`git status --short productRegistry.js` clean) | N/A — unit-style scenario against a scenario-local fixture registry, not a live-path setup; no distinct precondition to guard beyond fixture construction | Yes — two controls, both proven live on every green run: (1) distinct-but-structurally-equal objects (`{1:"A"}` vs a separate `{1:"A"}`) do NOT throw, proving the check is object identity, not deep equality; (2) a row whose map field is `undefined`/`null` is skipped without throwing |
| 15 | `new-product-batch-fetches-issue-before-siblings-resolve` | PERF-01 | `node_helper.js` — reverted `Promise.allSettled(members.map(...))` to a sequential `for` loop awaiting each member one at a time, preserving the identical downstream `settled`/`results` shape | `FAIL new-product-batch-fetches-issue-before-siblings-resolve: precondition failed: expected at least two different batch members pending after 400 drain ticks, got 1 (excessiveRain). Pending URLs: https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer/0/query?...` | yes (`node --check node_helper.js` exits 0; `git status --short node_helper.js` clean) | Yes — with 5 of 6 toggles forced off, the same guard fires under a broken setup: `precondition failed: expected at least two different batch members pending after 400 drain ticks, got 1 (heatRisk)...` | Yes — single-toggle control case: exactly one member pending (`controlPendingIds.size === 1`), proving the guard genuinely counts CONCURRENT pending members rather than merely "any member pending" |
| 16 | `scripts/check-concurrency-invariant.sh` (own mutation proof, 17-05; not a probe-suite scenario) | PERF-01 concurrency-safety invariant (D-08/D-09 — the shared-mutable-state analysis behind the batch) | Inserted `await Promise.resolve();` immediately before `extractPolygons`'s `_unusableFeatureCount` increment (`node_helper.js:~1809`) | `FAIL: _unusableFeatureCount @ extractPolygons:1809 — a future edit introduced an \`await\`...` (script exit code 1) | yes — restored, script re-run exits 0 again; `git diff -U3 node_helper.js \| grep -A3 -B3 "extractPolygons: skipping"` returned no output after restore | N/A — the script IS itself a precondition-style guard (locates each of the four mutation sites by a unique anchor string and fails if an `await` token appears in the enclosing block) | N/A — the guard's four-site coverage (`extractPolygons:1808`, `evaluatePolygonsCollectAll:1864`, `checkInPolygon:3637`, `_noteStaleEntry:2164`) is itself the anti-vacuity device: a script that could only ever pass would prove nothing, and this one is shown capable of failing |

**Live re-verification at this plan's execution (2026-09-01):** `node scripts/probe-payload-resilience.js`
→ `82 passed, 0 failed, 0 skipped`; `bash scripts/check-concurrency-invariant.sh` → exits 0, all
four sites `OK`; `node -e "require('./productRegistry')"` → exits 0. `git status --short` at the
start of this plan showed no pending changes to any source file — every mutation recorded above
was applied-and-restored within its own originating plan, never left in the working tree.

### Disclosed finding: scenario 11's defensive throw did not fire as the plan anticipated

The plan's action text for scenario 11 states the defensive throw inside `_cacheHeatRiskTuples`
"should ALSO fire" under the day-keyed-cache-shape mutation. As implemented (bucketing into a
SEPARATELY COMPUTED `dayKeyedAtWrite` object rather than mutating any individual tuple's own
keys), the per-tuple guard (`for (const key of Object.keys(tuple || {}))`) has nothing to inspect
and does not fire. This is a genuine, disclosed boundary of that defensive throw — it protects
against a CALLER handing `_cacheHeatRiskTuples` an already-bucketed tuple, not against
`_cacheHeatRiskTuples` itself internally computing a day-keyed value from otherwise-clean input.
The scenario's OWN precondition guard produced the required RED independent of that throw (see
row 11 above), and the throw's live-fire capability was separately and independently proven via a
`day1`-carrying tuple passed directly to `_cacheHeatRiskTuples` through `loadNodeHelper()`:
`THROW MESSAGE: MMM-SPCOutlook _cacheHeatRiskTuples: refusing to cache a clock-dependent field: day1`.
Scenario 11 is fully mutation-proven; the specific mechanism that catches the mutation is not the
one the plan's action text named.

### Disclosed finding: scenario 2's mutation required two coupled edits, not one

17-04-SUMMARY.md established that `_runHeatRiskProduct`'s `.sort()` call has no effect on
correctness by design — the day key comes from `_heatRiskDayOffset(idp_validtime, todayUtcMs)`,
never from array position. Removing only the sort produces zero observable change. The mutation
recorded in row 2 above applies both parts of the plan's own mutation description together
(remove the sort AND replace the offset-based day key with array-index), which is the actual
"array-order bug" HEAT-02 exists to prevent, fully consistent with 17-04's finding.

## Cross-Branch Independence Matrices (from 17-07)

Per this plan's `<action>` requirement: the two compound-condition pairs (D-04's partial/total
NoData split, D-05's tail/interior gap split) plus the explicit D-04-vs-D-05 non-collapse check,
transcribed from 17-07-SUMMARY.md's full 6×6 sweep (which also covered D-07 and the cache-offset
scenario, omitted below as out of scope for this section — see the full matrix in 17-07-SUMMARY.md
if needed).

**D-04's pair** (S6 = `heatrisk-partial-nodata-is-silent`, S7 = `heatrisk-all-nodata-sets-stale`):

| Mutation applied | S6 | S7 |
|---|---|---|
| Mutation 6 (blanket NoData→stale) | **FAIL** (primary) | pass |
| Mutation 7 (remove all-NoData check) | FAIL (control only) | **FAIL** (primary) |

**D-05's pair** (S8 = `heatrisk-tail-gap-is-silent`, S9 = `heatrisk-day1-gap-sets-stale`):

| Mutation applied | S8 | S9 |
|---|---|---|
| Mutation 8 (blanket gap→stale) | **FAIL** (primary) | FAIL (control only) |
| Mutation 9 (invert interior-gap loop) | FAIL (control only) | **FAIL** (primary) |

**D-04-vs-D-05 non-collapse check** (the load-bearing cross-pair result): applying D-05's
Mutation 9 (invert the interior-gap loop) left S6 and S7 (D-04's scenarios) **both GREEN** —
verbatim from 17-07-SUMMARY.md: *"Under this mutation, scenarios 6 and 7 (D-04) both stayed GREEN,
confirming D-04 and D-05 do not collapse into each other."* Symmetrically, D-04's Mutations 6/7
never touch S8/S9's PRIMARY assertions (only S8's/S9's own required control, per the by-design
overlap explained in 17-07-SUMMARY.md's "Reading the matrix" note) — every mutation reds exactly
one scenario's PRIMARY assertion, and no mutation ever crosses a D-04 primary into a D-05 primary
or vice versa, in either direction.

**Why the off-diagonal control marks exist and are not a defect:** the plan's own literal Task 1/
Task 2 action text requires scenario 6's control to re-run the exact all-NoData fixture scenario
7 tests as its primary (proving "the no-badge assertion is a real branch, not a harness that never
badges HeatRisk at all"), and requires scenario 8's/9's controls to swap each other's fixture for
the identical reason. Satisfying those literal control-assertion instructions necessarily produces
the recorded off-diagonal marks. This is itself confirmatory evidence the branches are genuinely
separate code paths (D-04's `resolvedDays.size === 0` check vs. D-05's `interiorGaps`/tail check),
not collapsed into one rule a single mutation could red uniformly.

## Not Mutation-Proven

None. All 15 probe-suite scenarios added this phase have a dedicated mutation, a verbatim RED
message, and a confirmed restore (rows 1–15 above). `scripts/check-concurrency-invariant.sh`'s
own mutation proof (row 16) likewise has a dedicated mutation, RED, and restore. Unlike Phase 15's
`wssi-zero-features-out-of-season` (F3, structurally-proven only, no threshold existed to break),
every HeatRisk scenario this phase added has a real threshold, branch, comparator, or gate to
break — no scenario needed a structural-only fallback.

The one item that is NOT mutation-proven and cannot be, by its nature, is **live in-season UAT of
HeatRisk and the parallelized batch against the real NOAA/WPC endpoints** — this is exactly what
Task 2 of this plan (the human-verify checkpoint) exists to obtain, and is not a probe-suite gap.
