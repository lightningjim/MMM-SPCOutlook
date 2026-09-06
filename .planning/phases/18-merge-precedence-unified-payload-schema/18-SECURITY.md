---
phase: 18
slug: merge-precedence-unified-payload-schema
status: verified
threats_open: 0
asvs_level: 1
created: 2026-09-06
---

# Phase 18 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

Read-only public NOAA endpoints on a single-user Raspberry Pi. No auth, no PII, no writes, no
inbound network surface. The realistic adversary is a malformed or hostile **upstream response**
(NOAA/ArcGIS/CPC payloads) plus resource-exhaustion from unbounded upstream-controlled counts and
strings. This audit verifies each of the 79 threat-register rows (54 unique IDs) authored across
the phase's 16 plans by its own declared disposition — mitigate rows are verified by direct code
inspection at the cited (or current, drifted) line; accept rows are judged on whether the stated
reasoning still holds; transfer rows are verified to carry an actual, findable hand-off. No new
scan for undeclared vulnerabilities was performed beyond one required cross-check (WR-02, below)
and the SUMMARY `## Threat Flags` sweep.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| NOAA/ArcGIS upstream numeric fields (`start_date`/`end_date`/`idp_validtime`/`VALID_ISO`/`EXPIRE_ISO`) → grid loop bounds and anchor | Upstream-controlled numbers/date-strings drive loop iteration counts and the fourteen-day grid anchor | Untrusted epoch ms / ISO strings |
| Upstream free-text labels → taxonomy lookup keys → `days[].hazards[].label` / `sources[].unmappedLabels[]` | Object-key lookups on attacker-shaped strings; unmapped labels pass through verbatim into the new unified payload | Untrusted strings, capped/truncated on the unmapped path |
| Six independent NOAA fetches → `Promise.allSettled` → one shared payload | A fault (rejection, malformed body) in any one member must not corrupt the structure every other member also writes | `payload: null` substitution on rejection |
| `node_helper.js` payload → `MMM-SPCOutlook.js` DOM | `MMM-SPCOutlook.js:421-422` renders `"Error: " + this.spcrisk.error` in place of the entire display whenever the payload carries an `error` key; sibling renderers interpolate `color`/`text` into `innerHTML` | Structured JSON payload only — no markup emitted by the backend (D-03) |
| MagicMirror `config.js` product toggles (operator-supplied, non-schema-validated) → `_addRegistryDayGridEntries`/`_buildSourceHealth` gates | A non-boolean truthy toggle value must not read as "enabled" | Local config object, not network-facing |

---

## Threat Register

79 rows / 54 unique IDs across 16 plans (18-01..18-16). `T-18-SC` (supply chain — zero new
dependencies, confirmed: `package.json` unchanged since before Phase 18) repeats once per plan and
is collapsed to a single row below. Rows sharing an ID across plans with distinct components (e.g.
`T-18-03`, `T-18-27`, `T-18-43`) are listed once per distinct component.

| Threat ID | Category | Component | Disposition | Evidence | Status |
|-----------|----------|-----------|-------------|----------|--------|
| T-18-01 | Tampering | `dimensionOf`/`riskToValue`/`valueToFullRisk`/`displayColor`/`valueToText`/`valueToColor` object-key lookups on upstream tokens | mitigate | `Object.prototype.hasOwnProperty.call(...)` guards confirmed at `hazardTaxonomy.js:98,227,230,248,289,306` and `node_helper.js:895,2908,3051,3052,3142,3353,3370` | closed |
| T-18-02 | Denial of Service | `_spcGridAnchor` datetime parsing | mitigate | `Number.isFinite(d.getTime())`-style gating confirmed throughout `_spcGridAnchor`; scenario `merge-grid-anchor-malformed-valid-iso-degrades-to-estimated` present at `scripts/probe-payload-resilience.js:7924` | closed |
| T-18-03 | Denial of Service | (a) `_spcGridAnchor` day-1 window derivation; (b) `_addHazardsOutlookGridEntries` loop bounds | mitigate | (a) range check `Number.isFinite(validMs) && validMs >= nominalStartMs && validMs <= day1EndMs` at `node_helper.js:2548`; (b) `Math.max(gridStart,1)`/`Math.min(lastGridDay, GRID_DAY_COUNT)` clamp at header, `node_helper.js:2900-2901` | closed |
| T-18-04 | Denial of Service | per-match/per-tuple processing | mitigate | `continue`-past-one-item containment confirmed via the `Number.isFinite` guards paired with `continue` throughout `_addHazardsOutlookGridEntries`/`_addHeatRiskGridEntries` | closed |
| T-18-05 | Denial of Service | `sources[].unmappedLabels[]` growth | mitigate | `UNMAPPED_LABELS_MAX_PER_SOURCE` (= `HAZARDS_MAX_LOGGED_UNMAPPED_LABELS`) cap and `HAZARDS_LOG_LABEL_MAX_CHARS` (60) truncation confirmed at `node_helper.js:4986-4990` | closed |
| T-18-06 | Denial of Service | module load / `assertTaxonomyIntegrity()` | mitigate | Called unconditionally at module load, `hazardTaxonomy.js:325` | closed |
| T-18-07 | Repudiation | taxonomy provenance (`[ASSUMED]` rows) | accept | Reasoning holds: low-severity display/competition-oddity risk, inline-marked assumptions; entered in Accepted Risks Log below | closed (accepted) |
| T-18-08 | Tampering | `days[].date`/`windowStart`/`windowEnd` | mitigate | All derived via `_utcDateString(...)`/`new Date(...).toISOString()`, never an echoed upstream string — confirmed at `node_helper.js:918,2603-2605,2712,2777-2778` | closed |
| T-18-09 | Information Disclosure | estimated-anchor-fallback `Log.info` | mitigate | Guarded by `this._loggedGridAnchorFallback` (once per process), message content confirmed to name only the anchor cause, no coordinates/body — `node_helper.js:4307-4313` | closed |
| T-18-10 | Tampering | verbatim upstream label reaching the frontend under D-07 | transfer | Backend emits data only (no markup); hand-off to Phase 19 recorded explicitly in both citing PLAN.md threat models (18-03, 18-05) and reinforced by the length cap (T-18-05) as defence-in-depth. **See WR-02 cross-check below — this transfer covers the NEW `days[].hazards[].label` field only, not the pre-existing `renderDayBlock` renderer** | closed (transfer, scoped) |
| T-18-11 | Spoofing | quiet source appearing to suppress an active one | mitigate | `NO_RISK_FLOOR` entry-creation-time floor test confirmed at `hazardTaxonomy.js:185-217,289-306`; below-floor readings produce no entry | closed |
| T-18-12 | Repudiation | SPC/fire degrade indistinguishable from a healthy read | mitigate | `noteStale(sourceId)` calls confirmed at every SPC/fire block, `node_helper.js:4255,4318,4323,4328,4341,4382,4387,4392,4404,4446,4462` | closed |
| T-18-13 | Spoofing | suppression drifting to a label-string match | mitigate | `_resolveGridDayPrecedence` (`node_helper.js:3379-3437`) read in full: keys off `entry.dimension`/`PRECEDENCE[dimension]` only; no `includes`/`indexOf`/`label ===` anywhere in the function, confirmed by direct grep | closed |
| T-18-14 | Elevation of Privilege | non-boolean `showX` reading as enabled | mitigate | Strict `productToggles.showDrought !== true` (line 753) and `=== true` idiom at `_buildSourceHealth`, `node_helper.js:3649` | closed |
| T-18-15 | Denial of Service | `_resolveGridDayPrecedence`/`_buildGridSummary` on malformed entries | mitigate | Unresolvable-dimension branch degrades via `continue` (`node_helper.js:3421-3423`) rather than throwing; function body confirmed free of I/O/clock reads | closed |
| T-18-16 | Repudiation | suppressed hazard vanishing from the record | mitigate | `entry.suppressedBy = entry.source === winnerSourceId ? null : winnerSourceId` (`node_helper.js:3458`) — losing entries stay in `day.hazards`, tagged with the winner's id, never deleted | closed |
| T-18-17 | Denial of Service | log volume from timing instrumentation | mitigate | `this._loggedColdStartTiming` once-per-process guard confirmed, `node_helper.js:1784-1799` | closed |
| T-18-18 | Information Disclosure | timing figures crossing the socket | mitigate | `sendSocketNotification("SPC_DATA_RESULT", [outlook, this._seq, {epoch, lat, lon}])` — confirmed `_lastPollTimings` never appears in the emitted array, `node_helper.js:1778-1779` | closed |
| T-18-19 | Repudiation | wall-clock figure attributed to an unseen render | mitigate | Frontend `_loggedFirstPayloadMs` log confirmed to fire only after the foreign-instance/epoch/sequence guards, `MMM-SPCOutlook.js:124-171` | closed |
| T-18-20 | Tampering | frontend driving repeated `GET_SPC_DATA` to skew timings | accept | `_inFlight` guard confirmed present, `node_helper.js:1695-1699,1803`; single-instance local-socket deployment reasoning holds | closed (accepted) |
| T-18-21 | Repudiation | scenario that passes while proving nothing | mitigate | `precondition failed:`/`control:` assertion pairs confirmed present throughout `scripts/probe-payload-resilience.js` (spot-checked at multiple scenario sites) | closed |
| T-18-22 | Tampering | mutation left in the working tree | mitigate | `git status --porcelain` confirms no pending diff on `node_helper.js`/`hazardTaxonomy.js` at audit time | closed |
| T-18-23 | Tampering | over-merge collapsing two distinct hazards | mitigate | Scenario `merge-flash-flood-and-heavy-precip-never-cross-suppress` present, `scripts/probe-payload-resilience.js:8889` | closed |
| T-18-24 | Repudiation | false all-clear over a real hazard | mitigate | `merge-summary-band-only-is-not-an-all-clear`, `merge-summary-advisory-only-is-not-an-all-clear`, `merge-summary-all-quiet-is-an-all-clear` confirmed present | closed |
| T-18-25 | Information Disclosure | operator coordinates in a committed artifact | mitigate | `18-LIVE-CAPTURE.md:20-21` states raw capture lives only in the session scratchpad and cites the `git status --porcelain` acceptance check | closed |
| T-18-26 | Repudiation | fixture result recorded as a live observation | mitigate | PASS/NOT OBSERVABLE/FAIL verdict discipline confirmed in use throughout `18-LIVE-CAPTURE.md` and `STATE.md` | closed |
| T-18-27 | Tampering / Denial of Service | (a) 18-09: pasted upstream label text in markdown; (b) 18-10: non-numeric/NaN/absent `start_date`/`end_date` reaching `_gridDayOf` | (a) accept, (b) mitigate | (a) markdown not rendered as HTML anywhere in project — reasoning holds; (b) `typeof === "number" && Number.isFinite` containment preserved verbatim ahead of the changed expression, confirmed at `node_helper.js:2851` region | closed |
| T-18-28 | Denial of Service | absurdly large `end_date` (e.g. `1e15`) producing unbounded emission loop | mitigate | **See dedicated analysis below** — CLOSED by direct code inspection, with a disclosed regression-coverage caveat (WARNING, non-blocking) | closed (see caveat) |
| T-18-29 | Denial of Service | negative/inverted `end_date` span | mitigate | `legacyOffsetEnd < legacyOffsetStart` guard unchanged at `node_helper.js:2857` region; `Math.max(gridStart, ...)` mathematically cannot lower the bound below `gridStart` — confirmed by direct read of the expression | closed |
| T-18-30 | Elevation of Privilege | crafted `end_date` widening coverage beyond the source's claim | mitigate | Scenario at `scripts/probe-payload-resilience.js:9899-9920` asserts `days["9"]` stays empty for a span ending on grid day 8, with a `control:` assertion on the three populated days' dates | closed |
| T-18-31 | Repudiation | probe scenario passing forever while proving nothing | mitigate | Mutation-proof discipline (`precondition failed:`/`control:` pairs, verbatim `FAIL` text) confirmed as the project-wide pattern; 18-10's MERGE-01 fix specifically cited as "pinned by two mutation-proven scenarios" in `deferred-items.md:94-104` | closed |
| T-18-32 | Spoofing | non-boolean config value read as enabled/disabled | mitigate | `productToggles[row.configFlag] !== true` strict gate confirmed at `node_helper.js:1019, 3301` | closed |
| T-18-33 | Repudiation | `reportedDays` claiming a product answered when no fetch ran (TOGGLE-OFF half) | mitigate | Head-of-function gate at `node_helper.js:3293,3303` (`if (productToggles[row.configFlag] !== true) return;`); scenario `merge-sources-disabled-registry-source-reports-no-days`; observed on/off arrays confirmed in `deferred-items.md:41-51` | closed |
| T-18-34 | Tampering | fix shifting which source wins a dimension | mitigate | Full 123/123 probe suite (including every `merge-precedence-*` scenario) passes with zero regressions, per independently-run `node scripts/probe-payload-resilience.js` | closed |
| T-18-35 | Denial of Service | gate skipping entry assembly for an enabled toggle | mitigate | On-run control (toggle-on) arrays `[1,2,3,4,5]`/`[1,2,3]` confirmed unchanged in `deferred-items.md:47-49` | closed |
| T-18-36 | Repudiation | fixture replay presented as fresh live observation | mitigate | `18-LIVE-CAPTURE.md:169` carries the `(re-validated; **FAIL** at 2026-09-05 capture time)` qualifier; `:230-241` explicitly names it "a replay," "not... a fresh live poll" | closed |
| T-18-37 | Repudiation | overwriting the original FAIL trace | mitigate | Original `clampedEnd (5) < clampedStart (6)` trace preserved verbatim at `18-LIVE-CAPTURE.md:201`, cross-referenced again at `:273` | closed |
| T-18-38 | Repudiation | silently upgrading/deleting MERGE-04's deferral row | mitigate | Both `Phase 18-09` deferral rows retained in `STATE.md:128-129`, only rationale text updated for the over-merge row | closed |
| T-18-39 | Tampering | quietly relaxing the D-19 PERF-03 milestone blocker | mitigate | PERF-03 bullet preserved verbatim at `STATE.md:77`, unchanged by 18-12 | closed |
| T-18-40 | Elevation of Privilege | self-approving the operator's checkpoint | mitigate | `18-12-SUMMARY.md`'s Task 3 records the operator's verbatim reply ("APPROVED") under a `checkpoint:human-verify gate="blocking"`/`autonomous: false` plan; `status: paused` retained until the real reply arrived | closed |
| T-18-41 | Denial of Service | `_addHazardsOutlookGridEntries` day loop (widened `lastGridDay`) | mitigate | Header clamp unchanged: `clampedStart = Math.max(gridStart, 1)`, `clampedEnd = Math.min(lastGridDay, GRID_DAY_COUNT)`, `node_helper.js:2900-2901` | closed |
| T-18-42 | Tampering | `match.startDate`/`match.endDate` type gate | mitigate | `!Number.isFinite(match.startDate) \|\| !Number.isFinite(match.endDate)` containment confirmed present, unmodified | closed |
| T-18-43 | Denial of Service | probe fixture `mergeGridWindow` change | accept | Test-only fixture, no production reachability — trivially true by inspection of `files_modified` scope | closed (accepted) |
| T-18-44 | Spoofing | remote `EXPIRE_ISO` anchoring `days[1..14]` | mitigate | `if (Number.isFinite(expireMs) && expireMs > this._nowMs())` confirmed at `node_helper.js:2541`; scenario `merge-grid-anchor-elapsed-expire-iso-degrades-to-estimated` in the passing 123-scenario suite | closed |
| T-18-45 | Tampering | `new Date(expireIso)` on unbounded remote string | mitigate | `Number.isFinite(expireMs)` gates the parse before any arithmetic, no regex/iteration/length amplification — confirmed at `node_helper.js:2541` | closed |
| T-18-46 | Repudiation | once-per-process anchor-fallback log misattributing cause | mitigate | Message reworded to name both causes ("absent/unparseable, or EXPIRE_ISO had already elapsed"), confirmed at `node_helper.js:4308-4312` | closed |
| T-18-47 | Denial of Service | `_addHeatRiskGridEntries` tuple loop | mitigate | Loop iterates the runner's own tuples (not a date-derived range); `gridDay < 1 \|\| gridDay > GRID_DAY_COUNT` per-tuple bound confirmed at `node_helper.js:3007-3008` | closed |
| T-18-48 | Tampering | `tuple.idpValidtime` type gate | mitigate | `!tuple \|\| typeof tuple.idpValidtime !== "number" \|\| !Number.isFinite(tuple.idpValidtime)` confirmed unmodified at `node_helper.js:2992-2994` | closed |
| T-18-49 | Repudiation | `sources['heatrisk'].reportedDays` under-reporting | mitigate | `row.days` unit-mismatch term confirmed removed; bound is `GRID_DAY_COUNT` alone, `node_helper.js:2996-3008`; scenario `merge-grid-heatrisk-all-seven-tiles-land-under-a-sub-12z-clock` passing | closed |
| T-18-50 | Denial of Service | post-settle assembly null guards | mitigate | Three guards independently confirmed: `eroPayload &&` (`:4923`), head-of-function `!payload \|\| typeof payload !== "object"` return (`:3293`), `hazardsPayload &&` (`:5076`) | closed |
| T-18-51 | Tampering | `_addRegistryDayGridEntries` reading a non-object payload | mitigate | Head-of-function gate `if (!payload \|\| typeof payload !== "object") return;` confirmed at `node_helper.js:3293` | closed |
| T-18-52 | Information Disclosure | `Log.error(... outcome.reason)` for a rejected member | accept | Confirmed at `node_helper.js:4901` — local `Error` object from this module's own runners, single-user device console, no remote sink; reasoning holds | closed (accepted) |
| T-18-53 | Repudiation | `sources[].reportedDays` after a rejection/failure | **mitigate (partial)** | Rejection half CLOSED: head guard at `node_helper.js:3293` stops a rejected runner from claiming it answered. **Fetch-FAILURE half OPEN**, independently re-confirmed: `_runArcGisDayProduct` (`node_helper.js:339-413`) still seeds `tiers[d] = "NONE"` before any fetch and, on a caught fetch/parse exception, sets `anyStale = true` but leaves `tiers[d]` at the seeded `"NONE"` — the payload is non-null, so `_addRegistryDayGridEntries`'s guard does not fire, and `noteReported` is still called for `wpc-ero`/`wpc-wssi`. Same pattern applies to the SPC inline chain (`spc-convective`/`spc-fire`). Documented, not silently missing: `deferred-items.md`'s "fetch FAILURE half" section, with a named future fix (`answeredDays`/`answered` side-channel) | **OPEN (documented, non-blocking)** |
| T-18-SC | Tampering | npm/pip/cargo installs (repeated per plan, 16x) | accept | `package.json` unchanged since before Phase 18 (`git log -- package.json` shows no Phase-18 commit); zero new dependencies confirmed | closed (accepted) |

---

## Dedicated Analysis: T-18-28 (Requested Call)

**Question:** does the zero-RED-scenario result from 18-13's M3 mutation (removing `Math.min(lastGridDay, GRID_DAY_COUNT)`) make T-18-28 CLOSED or OPEN?

**Verdict: CLOSED**, with a disclosed, non-blocking coverage caveat.

**Reasoning:** T-18-28's disposition is `mitigate`, and the verification method for `mitigate` is
"does the mitigation pattern exist in the cited code," not "is the mitigation's absence provably
detected by the test suite." I independently re-read the clamp at `node_helper.js:2899-2902`:

```js
const lastGridDay = gridEnd;
const clampedStart = Math.max(gridStart, 1);
const clampedEnd = Math.min(lastGridDay, GRID_DAY_COUNT);
if (clampedEnd < clampedStart) continue;
```

`Math.min(lastGridDay, GRID_DAY_COUNT)` is an *unconditional* bound — its correctness does not
depend on any particular input value; for any `lastGridDay` (including `1e15`), `clampedEnd` is
mathematically guaranteed `<= GRID_DAY_COUNT` (14). This is a property of the expression itself,
verifiable by inspection, not something that requires a passing/failing test to be true today. The
mutation hole (M3 produced 0 RED) is a **regression-detection gap**, not a currently-open
vulnerability: if a future edit deletes or weakens this line, no scenario in the current suite
would catch it. That is a real, disclosed process risk — carried forward here as a WARNING, not
folded into `threats_open` — because the code, as it stands today, is sound by direct
mathematical inspection, independently confirmed rather than inferred from the SUMMARY's own
narration.

**Recommendation:** add the one deliberately-deferred scenario (an `end_date` far beyond day 14,
asserting `days["15"]` does not exist and iteration count stays ≤ 14) before this clamp is next
touched, closing the regression-detection gap while the code-level mitigation itself remains sound.

---

## Cross-Check: WR-02 vs. the Threat Register (Requested)

**Finding (18-REVIEW.md WR-02):** `MMM-SPCOutlook.js:604-614`'s `renderDayBlock` — the shared
renderer this phase introduced for the `excessiveRain` (ERO) and new `winterImpact` (WSSI) day
blocks — interpolates `day{N}Color`/`day{N}Text` into `innerHTML` without the `validHazardColor()`
(`/^[0-9a-fA-F]{6}$/` allowlist) / `escapeHtml()` guards every sibling renderer in the same file
applies (`renderHazardsDays`, `renderHazardsWindowBand`, the HeatRisk renderer).

**Verdict: WR-02 is an uncovered gap — new attack surface with no threat-ID mapping, not
already-covered by T-18-10 or any other register row.** Reported as an `unregistered_flag`
(WARNING), not folded into `threats_open`, because it is not currently exploitable.

**Reasoning:** T-18-10 (transfer) covers *verbatim upstream label text* reaching the frontend
through the **new** `days[].hazards[].label` schema this phase introduces — its own trust-boundary
row is explicit ("Upstream `label` strings → `days[].hazards[].label` / `sources[].unmappedLabels[]`
→ socket → frontend"). `renderDayBlock`'s `day{N}Color`/`day{N}Text` fields are a **different** data
path: the pre-existing `excessiveRain`/`winterImpact` legacy blocks, populated by
`eroTierToColor`/`eroTierToText`/`wssiTierToColor`/`wssiTierToText` — closed, module-authored
lookup tables in `productRegistry.js`, keyed off a closed tier-token vocabulary, never a raw
upstream string. No threat-model row in any of the 16 plans names `renderDayBlock`,
`day{N}Color`/`day{N}Text`, or the ERO/WSSI legacy-block renderer specifically. `renderDayBlock`
itself is new attack surface introduced during this phase's implementation (per 18-REVIEW.md, "the
shared renderer this phase introduced for both... and the new `winterImpact`... blocks") that
generalizes across products — exactly the shape the register's own IN-03/T-18-10 boundary language
warns about — yet it carries none of the local defense-in-depth every sibling renderer in the same
file enforces. Confirmed non-exploitable **today** only because both feeding lookup tables are
closed vocabularies; the closed-vocabulary invariant is enforced nowhere at this call site, unlike
every sibling renderer.

**No SUMMARY's `## Threat Flags` section disclosed this.** Only `18-12-SUMMARY.md` carries a
`## Threat Flags` section at all, and it correctly reports "None" (that plan touched no source
file). WR-02 was found by the code reviewer reading the diff, not disclosed by any executor's
self-report — exactly the failure mode the audit brief warns against trusting blindly.

---

## Unregistered Flags

| Finding | Source | Why unregistered | Severity | Blocking? |
|---------|--------|-------------------|----------|-----------|
| WR-02 — `renderDayBlock` (`MMM-SPCOutlook.js:604-614`) interpolates `day{N}Color`/`day{N}Text` into `innerHTML` without `validHazardColor()`/`escapeHtml()`, unlike every sibling renderer this phase touched | `18-REVIEW.md`, independently re-confirmed at `MMM-SPCOutlook.js:604-614` | No threat-model row in any of the 16 Phase-18 plans names this renderer or these fields; T-18-10's transfer covers only the new `days[].hazards[].label` path | WARNING (not currently exploitable — inputs are closed-vocabulary today; becomes exploitable the moment a future row feeds `renderDayBlock` from an upstream-derived color/text string) | No — non-blocking. Recommend a backlog item before Phase 19 adds any new row through this renderer. |

No other unregistered flags found. `18-12-SUMMARY.md`'s `## Threat Flags: None` verified accurate
(git diff for that plan touches only `.planning/` files).

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|--------------|------|
| AR-01 | T-18-07 | `[ASSUMED]` taxonomy rows are inline-marked with their RESEARCH.md assumption id; a wrong assumption is a display/competition oddity, not a false-negative safety failure | Plan 18-01 (author-time disposition) | 2026-09-06 |
| AR-02 | T-18-20 | `_inFlight` guard (CR-03) already drops overlapping polls; single-instance, local-socket deployment has no adversarial frontend | Plan 18-06 (author-time disposition) | 2026-09-06 |
| AR-03 | T-18-27 (18-09) | Markdown planning documents are not rendered as HTML anywhere in this project; excerpt is trimmed and human-reviewed | Plan 18-09 (author-time disposition) | 2026-09-06 |
| AR-04 | T-18-43 | Probe-fixture-only change (`mergeGridWindow`); no production reachability | Plans 18-10, 18-13 (author-time disposition) | 2026-09-06 |
| AR-05 | T-18-52 | `Log.error(... outcome.reason)` logs a local `Error` from this module's own runners to the MagicMirror console on a single-user device; no remote sink, no user data | Plan 18-16 (author-time disposition) | 2026-09-06 |
| AR-07 | T-18-53 (fetch-failure half) | **Operator-accepted 2026-09-06.** On a caught fetch/parse exception in `_runArcGisDayProduct` (`node_helper.js:339-413`) `tiers[d]` stays at its pre-fetch `"NONE"` seed, so `noteReported` still runs and a hard fetch failure reads as "answered, no risk" for `wpc-ero`/`wpc-wssi`/`spc-convective`/`spc-fire`. Accepted because: (a) no ROADMAP criterion or REQUIREMENTS.md item depends on the answered-vs-never-asked distinction, per `18-VERIFICATION.md`'s Requirements Coverage table; (b) `sources[id].reporting` — the field the JSDoc and `summary.reportingSourceCount` both use — is gated on `enabled` and stays correct, so only a caller reading the raw `reportedDays` array directly is misled; (c) the fix is named and scoped in `deferred-items.md` (an `answeredDays`/`answered` side-channel). Revisit when Phase 19 removes the adjacent legacy code paths, or if any consumer begins reading raw `reportedDays`. | Operator (kcreasey), via /bm:secure-phase 18 | 2026-09-06 |
| AR-06 | T-18-SC | Zero new dependencies across all 16 plans; independently confirmed `package.json` unchanged since before Phase 18 | All 16 plans (author-time disposition) | 2026-09-06 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-09-06 | 54 unique (79 rows) | 53 | 1 (T-18-53, documented/deferred, non-blocking to ROADMAP) | gsd-security-auditor |
| 2026-09-06 | 54 unique (79 rows) | 54 | 0 | operator disposition — T-18-53 converted `mitigate (partial)` -> `accept` (AR-07) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer / mitigate-partial)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` — **confirmed after operator disposition.** T-18-53's fetch-failure
      half was the sole open threat; on 2026-09-06 the operator reviewed it and converted it
      from `mitigate (partial)` to `accept`, recorded as AR-07 in the Accepted Risks Log with
      full rationale and a named revisit trigger. No threat remains without a disposition.
- [x] `status: verified` — verification performed; one open item carried forward by design, not
      by omission

**Approval:** verified 2026-09-06 — 54/54 threats disposed (53 CLOSED by verified mitigation, 1 ACCEPTED as AR-07),
1 WARNING (WR-02, unregistered flag, non-exploitable today), 1 WARNING (T-18-28 regression-coverage
caveat, code itself sound).
