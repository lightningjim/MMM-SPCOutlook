---
phase: 17
slug: nws-wpc-heatrisk-parallelized-fetching
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-01
---

# Phase 17 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

**Register origin:** `register_authored_at_plan_time: true` — the 26 unique threats below were
declared across nine `<threat_model>` blocks (17-01-PLAN.md through 17-09-PLAN.md) at plan-authoring
time, before implementation. This audit verifies each declared mitigation exists in the *current*
implementation — it does not scan for new vulnerabilities and does not accept a plan's stated intent
as evidence.

**Critical context:** a standard code review (`17-REVIEW.md`, 2026-09-01T20:02:30Z) found that one of
this register's `mitigate` claims (T-17-16) was **false** at authoring time: the CR-01 defect let
`Number("")`, `Number(null)`, `Number("  ")`, `Number(false)` all coerce to category 0, defeating the
exact all-NoData safeguard the threat entry claimed. That finding, plus 12 further findings (CR-02,
WR-01…WR-11) touching nine other threats in this register, were fixed in commits `1992ae2`..`b4aa991`
per `17-REVIEW-FIX.md`. Every mitigation below was re-verified against the **current** working tree —
sha/line citations, not the plan's original claim — including live re-execution of the probe suite and
the concurrency guard.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| NOAA/WPC HTTPS response body → `JSON.parse` → validator | Untrusted remote input; ArcGIS returns most failures as HTTP 200 with an `error` body | Raster category data, catalog metadata |
| `buildHeatRiskIdentifyUrl` → outbound HTTPS | The only place this phase constructs a new remote URL | Reprojected point coordinates only |
| identify body → `_geoJsonCache` | A cached value is reused across polls; a clock-dependent value cached here becomes a silent, badgeless misdating | Parsed category tuples |
| six concurrent runners → shared helper-global state | `_unusableFeatureCount`, `_oldestStaleAt`, `_geoJsonCache` written by multiple `Promise.allSettled` batch members | Counters, cache entries |
| a rejecting batch member → `getSpcOutlook`'s outer catch | Under `Promise.all` semantics one throw would collapse the entire payload; `allSettled` is the boundary control | Whole-payload availability |
| helper socket payload → `getDom()` → innerHTML | Payload-derived strings reach the DOM | Rendered category/text/color |
| user `config.js` → `this.config` | Unvalidated by the MagicMirror host | `showMinorHeat`, `showHeatRisk` toggles |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-17-01 | Tampering | `_isHeatRiskIdentifyResponse` | mitigate | `node_helper.js:1882-1885` rejects any body lacking `properties.Values`/`catalogItems.features` as arrays or carrying `error`; WR-06 fix removed the unused `value` field gate without weakening the floor (negative controls in probe suite) | closed |
| T-17-02 | Spoofing | `buildHeatRiskIdentifyUrl` host allowlist | mitigate | `productRegistry.js:280-283` — literal `https://mapservices.weather.noaa.gov/` prefix check, throws with offending value serialized | closed |
| T-17-04 | Tampering (data integrity) | `PRODUCT_REGISTRY` shared maps | mitigate | `productRegistry.js:546-568` `assertNoSharedRegistryMaps`, called at module load (`:571` region); WR-07 fix added `dayLayers`/`layers` to `MAP_FIELDS` (confirmed present in live source, superseding the pre-fix `17-DATA03-SPOTCHECK.md` 11-field snapshot) | closed |
| T-17-05 | Tampering (XSS) | HeatRisk render block | mitigate | `MMM-SPCOutlook.js:739-741` — `escapeHtml`/`validHazardColor` applied to every rendered field, mirroring `renderHazardsDays` | closed |
| T-17-06 | Denial of Service | once-only log flags | mitigate | Five fixed boolean flags (`_loggedHeatRiskAllNoData`, `_loggedHeatRiskValuesMismatch`, `_loggedHeatRiskSequenceGap`, `_loggedHeatRiskDataAge`, `_loggedHeatRiskDayCollision`), not a remote-keyed ledger — unbounded growth is unrepresentable by construction | closed |
| T-17-07 | Spoofing (false all-clear) | batch settlement | mitigate | `node_helper.js:3634-3660` `Promise.allSettled` + per-member rejection branch sets `anyStale` and substitutes only that member's block | closed |
| T-17-08 | Tampering | `buildHeatRiskIdentifyUrl` geometry / shared `loc` mutation | mitigate | `productRegistry.js:280-283` `Number.isFinite` guard; WR-08 fix at `node_helper.js:923` projects a structural clone (`JSON.parse(JSON.stringify(loc))`) rather than the shared point object, closing the review's finding that the review's own suggested fix was insufficient | closed |
| T-17-09 | Denial of Service (accept) | query-string construction | accept | Fixed key/parameter order; only two `Number.isFinite`-guarded numeric coordinates enter the URL — no user-controlled string | accepted (see log) |
| T-17-10 | Tampering | validator regression on existing callers | mitigate | `node_helper.js:2574` defaulted `isValidBody` parameter; live re-run: `91 passed, 0 failed, 0 skipped` | closed |
| T-17-11 | Denial of Service | `_zipHeatRiskCatalog` / `_dedupeHeatRiskByValidTime` | mitigate | `node_helper.js:2368-2409` — bounded arrays, malformed items dropped with `continue`, never thrown | closed |
| T-17-12 | Spoofing (false all-clear) | frontend no-risk gate | mitigate | `MMM-SPCOutlook.js:361-380,456` — one shared predicate `heatRiskDaysToRender` feeds both the gate and the render loop | closed |
| T-17-13 | Tampering | version-skew / malformed payload | mitigate | `MMM-SPCOutlook.js:362` — predicate returns `[]` for a falsy/non-object block | closed |
| T-17-14 | Information disclosure | `showMinorHeat` crossing the wire | mitigate | Grep-confirmed absent from `buildRequestPayload` (`MMM-SPCOutlook.js:59-75`), `SUB_TOGGLES`, `node_helper.js`, `productRegistry.js` | closed |
| T-17-15 | Tampering (data integrity) | `_geoJsonCache` HeatRisk entry | mitigate | `node_helper.js:552-605` — explicit field whitelist, throws on any `day\d+`/`dayOffset` key; day offset recomputed against `_todayUtcMs()` on every poll (cache-hit path confirmed at `:988`) | closed |
| T-17-16 | Spoofing (false all-clear) | all-NoData response | mitigate | **CR-01 fix** at `node_helper.js:590-593` — allow-list-then-coerce (`isIntegerString`/`typeof === "number"` only); `""`, `null`, `"  "`, `false`, `[]` now resolve to `null`, never `0`. New scenario `heatrisk-falsy-values-are-absence-never-category-zero` mutation-proven RED against the pre-fix code (`17-REVIEW-FIX.md`). D-04's all-NoData branch (`node_helper.js:1109-1117`) now genuinely fires | closed |
| T-17-17 | Tampering (data integrity) | `_unusableFeatureCount` / `_oldestStaleAt` under concurrency | mitigate | Synchronous mutation, no `await` inside; mechanically enforced by `scripts/check-concurrency-invariant.sh`, itself mutation-proven (see T-17-20/CR-02 below) and re-run live: exit 0, all 4 sites `OK`, self-test `OK` | closed |
| T-17-18 | Denial of Service (accept) | concurrent socket/CPU load on a single-core Pi | accept | Fan-out bounded at six members (`node_helper.js:3618-3627`); each runner's internal loop stays sequential | accepted (see log) |
| T-17-19 | Repudiation | absent per-run timing evidence | mitigate | `node_helper.js:3629-3637` — `memberTimings`/`settleStart`, logged via `Log.info("...batch settled in..." )`; corroborated live in production logs per `17-09-SUMMARY.md` (2275ms/734ms wall-clock observations) | closed |
| T-17-20 | Repudiation (false confidence) | probe scenario evidence / concurrency guard | mitigate | **CR-02 fix**: `check-concurrency-invariant.sh` rewritten to anchor on the enclosing method (not the nearest `{`), with a permanent self-test proving it can fail (live re-run confirms `OK(self-test)`). All 15 phase scenarios + 9 review-fix scenarios (24 total) individually mutation-proven RED per `17-MUTATION-INVENTORY.md` and `17-REVIEW-FIX.md`; live probe run: `91 passed, 0 failed, 0 skipped` | closed |
| T-17-21 | Tampering (vacuous fixture) | `heatRiskIdentifyResponse` / `assertPayloadIntact` | mitigate | **WR-05 fix**: `scripts/probe-payload-resilience.js:1017-1099` `assertPayloadIntact` now dispatches on `row.kind` for all four registry kinds and **throws** on an unrecognised kind — verified by the fix's own destructive test (deleting `heatRisk` from the payload produced 64 failures; restored byte-identical) | closed |
| T-17-22 | Denial of Service (cross-contamination) | route builders | mitigate | `scripts/probe-payload-resilience.js:407-431` — `heatRiskRoutes` quiets every other product URL and every pre-existing route builder quiets HeatRisk's URL (WR-02's trap in both directions) | closed |
| T-17-23 | Repudiation (misattributed staleness) | `_staleAsOf` | mitigate | D-07 age check (`node_helper.js` per-item `maxDataAgeHours` loop) deliberately excluded from `_staleAsOf`; scenario 10 (`heatrisk-stale-item-sets-badge-not-staleAsOf`) carries two control arms per `17-MUTATION-INVENTORY.md` row 10, live-passing | closed |
| T-17-24 | Denial of Service | deferred stub hang | mitigate | `scripts/probe-payload-resilience.js:854-903` `installDeferredHttp` — unrouted URL resolves immediately (503); a refed (not unref'd) safety timer rejects naming pending URLs, so an abandoned request cannot hang the suite silently | closed |
| T-17-25 | Information disclosure (accept) | UAT config change | accept | Operator's temporary `showHeatRisk: true` edit to local MagicMirror config only; no credentials involved, deployment coordinate already in repo defaults — confirmed in `17-09-SUMMARY.md` "User Setup Required" section | accepted (see log) |
| T-17-SC | Tampering (supply chain) | npm/pip/cargo installs | mitigate | N/A this phase — confirmed zero package.json/lockfile changes since phase start (`git diff 4fc2d9e..HEAD -- package.json` empty; no package.json in this project at all) | closed |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-17-01 | T-17-03 | Oversized identify body: existing `GEOJSON_MAX_BODY_BYTES` (16 MiB, `node_helper.js:175`) declared/actual size checks (`:2718`, `:2747`) apply uniformly to every `fetchGeoJsonCached` caller, HeatRisk included, regardless of which body validator is injected. No new bound needed. | 17-02-PLAN.md (plan-time) | 2026-09-01 |
| AR-17-02 | T-17-09 | Query-string DoS: fixed key/parameter order, and the only inputs are two `Number.isFinite`-guarded numeric coordinates — no user-controlled string enters the URL beyond that. | 17-01-PLAN.md (plan-time) | 2026-09-01 |
| AR-17-03 | T-17-18 | Concurrent socket/CPU load on a single-core Pi: product-level fan-out bounded at six members with each runner's internal loop kept sequential (D-09); a semaphore cap and further flattening were surfaced and deliberately not pursued. PROJECT.md's "avoid blocking the event loop" constraint holds at this depth. | 17-05-PLAN.md (plan-time) | 2026-09-01 |
| AR-17-04 | T-17-25 | UAT config change: the operator temporarily edits local MagicMirror config only (`showHeatRisk: true`); no credentials involved, and the deployment coordinate is already present in the repo's own defaults. | 17-09-PLAN.md (plan-time); operator-executed and verdict recorded in 17-09-SUMMARY.md | 2026-09-01 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-01 | 26 | 26 | 0 | gsd-security-auditor |

**Live re-verification performed during this audit** (not inherited from prior artifacts):
- `node scripts/probe-payload-resilience.js` → `91 passed, 0 failed, 0 skipped`, exit 0
- `bash scripts/check-concurrency-invariant.sh` → `OK(self-test)` + all 4 sites `OK`, exit 0
- `node -e "require('./productRegistry')"` → exit 0
- `productRegistry.js` `MAP_FIELDS` inspected directly: confirmed to include `dayLayers`/`layers`
  (post-WR-07), superseding the pre-fix 11-field list recorded in `17-DATA03-SPOTCHECK.md`
- `git diff 4fc2d9e..HEAD -- package.json` → empty (T-17-SC N/A confirmed, not merely asserted)

**Findings incorporated from `17-REVIEW.md`/`17-REVIEW-FIX.md`:** CR-01 (T-17-16), CR-02 (T-17-17,
T-17-20), WR-01/WR-02/WR-03 (T-17-06, T-17-15, T-17-16 family), WR-05 (T-17-04, T-17-21), WR-06
(T-17-01), WR-07 (T-17-04), WR-08 (T-17-08), WR-09 (T-17-15, T-17-17), WR-10 (T-17-12 coverage),
WR-11 (T-17-17, T-17-20) — all 13 in-scope findings verified fixed in the current working tree, not
merely reported fixed in `17-REVIEW-FIX.md`.

**Noted, not treated as open threats** (product-judgment calls per task instructions): WR-03, WR-06,
WR-09 are flagged in `17-REVIEW-FIX.md` as "requires human verification" — all three are green and
mutation-proven; the flag concerns policy/product judgment (e.g., WR-09's choice of `Log.error` over
a lock or throw for cache-key contention), not code correctness. No corresponding threat is left open
on this basis.

**Unregistered flags:** none. No `## Threat Flags` section was present in any of the nine
17-0X-SUMMARY.md files, so no new attack surface was flagged by the executor outside this register.

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-09-01
