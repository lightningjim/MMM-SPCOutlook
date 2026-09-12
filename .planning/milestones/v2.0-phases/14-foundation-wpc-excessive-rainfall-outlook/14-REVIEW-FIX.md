---
phase: 14-foundation-wpc-excessive-rainfall-outlook
fixed_at: 2026-08-23T00:00:00Z
review_path: .planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW.md
iteration: 1
findings_in_scope: 14
fixed: 14
skipped: 0
status: all_fixed
probe_suite:
  baseline: 8 passed, 0 failed (8 scenarios, 5 load-bearing per the review)
  final: 15 passed, 0 failed (15 scenarios, all 15 mutation-proven load-bearing)
supersedes: >-
  This file replaces the round-1 fix report (commit e4e3fa9), which covered a different,
  earlier review. That content is preserved in git history.
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-08-23
**Source review:** `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW.md` (round 3, deep)
**Iteration:** 1

**Summary:**
- Findings in scope: 14 (CR-01..CR-03, WR-01..WR-11)
- Fixed: 14
- Skipped: 0
- Out of scope and untouched: IN-01..IN-08; round-2 CR-01 (URL-keyed `_geoJsonCache`) and
  round-2 CR-02's multi-instance route, both DEFERRED-BY-OWNER. No cache re-keying, no
  removal of `_cachedLat`/`_cachedLon`/`locationChanged`, no `instanceId` routing.

**Probe suite:** baseline 8 passed / 0 failed → final **15 passed, 0 failed**
(`node scripts/probe-payload-resilience.js`, exit 0). Every one of the 15 scenarios is
mutation-proven: for each there is at least one targeted source mutation that turns it RED.

Every finding below was verified by execution, RED before and GREEN after. No finding is
reported fixed on inspection alone.

---

## Fixed Issues

### CR-01: a total outage rendered as a confident "No Severe Weather Risk"

**Files modified:** `MMM-SPCOutlook.js`
**Commit:** `0964f1c`

`_stale` is now the first term of `getDom`'s no-risk gate, so a degraded payload always
takes the detail branch and always renders the ⚠ badge. A stale payload with nothing
renderable under it appends `No Severe Weather Risk (unconfirmed)` rather than leaving a
bare warning.

**Deviation from the review's suggested text, deliberately:** the review proposed
`No Severe Weather Risk (last known good)`. At the render site the two cases are not
distinguishable — the values may be a still-fresh cached reading served by `rejectBody`'s
stale fallback, or the no-risk defaults left by a hard failure with nothing to fall back
to. "unconfirmed" is the only thing the display can honestly assert about both.

Proven at the **render** level, driving the real `getSpcOutlook` with every layer
hard-failing and then the real `getDom`:

```
RED    payload._stale = true, payload._staleAsOf age(ms) = 2
       rendered              = "No Severe Weather Risk"
       no-risk branch taken  = true
       carries stale signal  = false

GREEN  rendered              = "<span style="color:#FFCC00">⚠ Stale</span><br/>No Severe Weather Risk (unconfirmed)"
       no-risk branch taken  = false
       carries stale signal  = true
```

No regression: a non-stale all-clear still renders exactly `No Severe Weather Risk`, and a
fresh SLGT day 1 renders unchanged.

### CR-02: one expired or unreachable MD URL discarded every active Mesoscale Discussion

**Files modified:** `node_helper.js`
**Commit:** `550b922`

Per-MD `try/catch`; `checkInPolygon` returns the containing `Feature` (or `null`) instead
of a boolean, gains an `Array.isArray(geojson.features)` guard and a per-element null
guard; the name is read off the winning polygon with every dereference guarded. Its one
caller was confirmed by grep across the repo.

Verified by driving the real `getMesoscaleDiscussion` with stubbed transport:

| case | RED | GREEN |
|---|---|---|
| one 404 among three MDs | `THREW: Failed to fetch .../md0001.kmz: 404` → caller reports "no active MDs" | `["MD 0002 CORRECT","MD 0003"]` |
| `features[0]` is not the containing polygon | `["MD 0002 WRONG-FEATURE"]` | `["MD 0002 CORRECT"]` |
| features-less body, then a good MD | `THREW: geojson.features is not iterable` | `["MD 0003"]` |

### CR-03: a slow poll could overwrite a newer, higher risk (single instance, single location)

**Files modified:** `node_helper.js`, `MMM-SPCOutlook.js`
**Commit:** `09af950`

Backend `_inFlight` guard skips an overlapping tick; every broadcast carries a monotonic
`this._seq` as `payload[2]`; the frontend discards any payload whose seq is not greater
than the last accepted one. A payload with no seq is still accepted, so the check can only
reject a provably older result. Solved **without** instance correlation, as instructed.

```
RED    chains started = ["A(slow, reads SLGT)","B(fast, reads MDT)"]
       broadcasts = 2, risks = ["MDT","SLGT"], seq = [null,null], in-flight skip logged = false
       frontend after late A = SLGT          <- the silent downgrade
GREEN  chains started = ["A(slow, reads SLGT)"]
       broadcasts = 1, risks = ["SLGT"], seq = [1], in-flight skip logged = true
       frontend after late A = MDT
       frontend after newer (seq 3) = HIGH; frontend seqless = ENH  (both still accepted)
```

Also verified the guard cannot wedge polling: a tick that throws before its awaits leaves
`_inFlight === false` and the next tick runs and broadcasts.

### WR-05: `updateInterval` accepted from config unvalidated

**Files modified:** `node_helper.js`, `MMM-SPCOutlook.js`
**Commits:** `cc0d18d`, `f6debc9` (comment placement follow-up)

Both ends coerce, range-check and fall back to 60 minutes. The frontend resolves once in
`resolveUpdateInterval()` and uses it for both the timer and `buildRequestPayload`, so the
timer and the value the helper is told about cannot disagree.

```
backend  _updateInterval / "is a 60 s-old cache entry still inside the stale window"
  RED    0 -> 0 false | -5 -> -5 false | "hourly" -> "hourly" false | null -> null false
  GREEN  all four -> 60 true;  30 -> 30 true and "30" -> 30 true unchanged
frontend ms handed to setInterval
  RED    0 -> 0 | -5 -> -300000 | "hourly" -> NaN | undefined -> NaN   (host clamps to ~1 ms)
  GREEN  all four -> 3600000;  30 -> 1800000 unchanged
```

### WR-08: `extractPolygons` had no per-feature containment around `turf.polygon`

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`, `scripts/probe-lib/module-stubs.js`
**Commit:** `11c4d25`

Per-feature `try/catch`; dropped features are logged with their layer and counted, and
`getSpcOutlook` turns any drop during a run into `anyStale` (a counter, so ~25 call sites
stay untouched; it can only ever over-report staleness). The probe's turf stub now rejects
the same three coordinate shapes real turf rejects, with turf's own messages, verified
against `@turf/turf` directly.

```
RED    payload.error = "Error: Each LinearRing of a Polygon must have 4 or more Positions."
       day1.risk = undefined, _stale = undefined
GREEN  payload.error = undefined, day1.risk = SLGT, _stale = true, skip logged = true
```

### WR-01: the ERO loop's `_isFeatureCollection` branch and its stale fallback were dead code

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `80bb24c`

Branch deleted; the single `rejectBody` policy owns the stale fallback.
`ero-arcgis-error-body` no longer stubs `fetchGeoJsonCached` with a shape the real function
cannot emit — it serves the same body over the HTTP seam and asserts the line production
really emits (`rejected an unusable response body for <url> (not a usable FeatureCollection)`),
plus `_stale`. Its round-2 SPC-value assertion is preserved.

Deadness confirmed by execution: with the `_isFeatureCollection` gates removed from
`fetchGeoJsonCached`, the old branch's log line appears; with them in place, no scenario
can produce it.

### WR-02: `ero-hard-fail-is-flagged` was vacuous

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `5a108ec`

Every non-ERO layer now succeeds with an empty FeatureCollection, so `anyStale` can only
originate in the ERO loop, plus a negative control with the toggle off.

### WR-03: `ero-malformed-feature` was vacuous

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `f0657b9`

Fixture given a real geometry (so `properties: null` is the only defect) and
`pointInPolygon` set true, plus a positive control proving the ERO loop is live.

### WR-09: the probe stubbed `fetchGeoJsonCached` wholesale

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`, `scripts/probe-lib/module-stubs.js`
**Commit:** `50e66cd`

A production seam was required: `fetch` is a module-scoped const wrapping a dynamic import,
so nothing outside the module could replace it. Every outbound request now goes through
`_fetch(url, options)`; `installHttp` routes over it. Two further harness defects fixed:
`resetHelper` now restores both seams (a stub written onto the helper object survived into
every later scenario), and the false comment about location-change invalidation is
corrected. Three new scenarios drive the real `fetchGeoJsonCached`.

### WR-04: the "⚠ Stale" badge always read "a few seconds ago"

**Files modified:** `node_helper.js`, `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `41f662e`

`_staleAsOf` is now the oldest cached reading that contributed to the payload, recorded by
`_noteStaleEntry` on the paths that return `stale: true` only (an ETag/hash hit is upstream
confirming freshness, not staleness). Null on a hard failure. The unreachable `delta < 0`
"just now" branch is deleted.

```
RED    reported data age = 0 ms       true data age = 1503 ms
       hard failure with nothing cached reported _staleAsOf = 1787496512120 ("now")
GREEN  reported data age = 1503 ms    true data age = 1503 ms
       hard failure reports _staleAsOf = null
```

### WR-06: MD URLs fetched from a remote KML with no host allowlist

**Files modified:** `node_helper.js`
**Commit:** `d09e541`

Hrefs must start with `https://www.spc.noaa.gov/`; refusals are logged. `fetchBinBuffer`
passes `redirect: "error"` so a 302 cannot walk off the allowlist. `parseNetworkLinks` no
longer calls `.trim()` on a possibly absent `nodeValue`.

```
RED    URLs fetched = ["...ActiveMD.kmz", "http://192.168.1.1/admin.kmz", "...md0003.kmz"]
GREEN  URLs fetched = ["...ActiveMD.kmz", "...md0003.kmz"]   (legitimate MD still returned)
       refusals logged for http://192.168.1.1/admin.kmz, https://evil.example.com/x.kmz, ""
       every request carries redirect: "error"
```

### WR-07: `_validTimeOfWinner` aborted the scan instead of continuing

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `ec2433a`

Both terminal `return null`s are now `continue`. The unreachable properties guard is kept
as a `continue` rather than deleted — it costs nothing and the helper is shared.

```
RED    FAIL ero-same-tier-null-valid-time-falls-through: day1ValidTime expected the second
       winning polygon's window, got null
GREEN  PASS
```

### WR-10: `assertPayloadIntact` hardcoded the ERO day and key counts

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `dcf0ab3`

Day count derived from `PRODUCT_REGISTRY.excessiveRain.days`; the four per-day suffixes stay
literal as the independent oracle.

```
RED (registry days 5 -> 7)   every scenario: "excessiveRain has 28 keys, expected 20"
GREEN (same change)          key-count assertion passes; the only remaining failure names
                             the real cause — "buildArcGisQuery: layerId must be a
                             non-negative integer" for days 6-7, i.e. IN-08's undeclared
                             second half, which is Info-tier and left alone
```
Registry restored to `days: 5`.

### WR-11: `sigComparator` ignored its arguments; SIGN `toValue` returned a string

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `03e6dfd`

All five Day 4-8 blocks map SIGN to `1` and filter on `val > 0`; the comparator is
`(best, val) => best || val === 1`.

```
value type             as-written: string    numeric: number
Math.max(0, value)     as-written: NaN       numeric: 1
_validTimeOfWinner     as-written: null      numeric: "2026-08-20T12:00:00Z"
comparator(false, 0)   as-written: true      numeric: false
```
No behaviour moves on the real path, which is the point: day4 inside a SIGN polygon is
`0.45 / true / MDT`, outside is `0 / false / NONE`, no SIGN feature is `0.45 / false / ENH`
— identical before and after.

### CR-01 regression scenario (mandated addition)

**Files modified:** `scripts/probe-lib/module-stubs.js`, `scripts/probe-payload-resilience.js`
**Commit:** `632f285`

`loadFrontendModule`/`renderDom` evaluate `MMM-SPCOutlook.js` in a `vm` context with
`Module`/`Log`/`moment`/`document` supplied (still dependency-free: `vm` and `fs` are core).
`frontend-total-outage-still-shows-the-outage` drives the real `getSpcOutlook` with every
layer failing, then the real `getDom`, and asserts the render carries the degrade signal —
with a control asserting a genuine all-clear still renders exactly
`No Severe Weather Risk`.

---

## Mutation evidence — every scenario is load-bearing

Each row is a source mutation applied, the suite run, then the source restored. `PROBE
RESULT: 15 passed, 0 failed` was re-confirmed after every restore.

| Scenario | Mutation that turns it RED | Observed failure |
|---|---|---|
| ero-arcgis-error-body | zero the SPC day1 value | "an ERO failure destroyed the SPC day1 value: expected SLGT, got NONE" |
| ero-arcgis-error-body | strip url/reason from `rejectBody`'s log | 3 scenarios FAIL |
| ero-fetch-throws | ERO per-day `catch` rethrows | FAIL ero-fetch-throws |
| ero-malformed-feature | guard → `if (!f \|\| !f.geometry) return;` | "day1 resolved to NONE via an exception … TypeError: Cannot read properties of null (reading 'LABEL')" |
| ero-malformed-feature | ERO loop → `if (false)` | "control: a well-formed ERO body resolved to NONE, not SLGT" |
| ero-leading-bad-feature-preserves-risk | same properties-guard mutation | "day1Risk expected MDT, got NONE" |
| ero-same-tier-null-valid-time-falls-through | revert `_validTimeOfWinner` to `return props[field] ?? null` | "day1ValidTime expected the second winning polygon's window, got null" |
| ero-hard-fail-is-flagged | delete the ERO `anyStale` line (the review's own mutation, previously green) | "a hard-failed ERO fetch produced an unflagged no-risk payload" |
| ero-hard-fail-is-flagged | ERO loop → `if (false)`; also `_staleAsOf` → `Date.now()` | same assertion; "reported _staleAsOf …, expected null" |
| ero-wellformed-slgt | tier conversion pinned to "NONE" | FAIL ero-wellformed-slgt |
| ero-toggle-off | toggle gate → `if (true)` | FAIL ero-toggle-off |
| ero-rejected-body-serves-last-known-good | `rejectBody` stale fallback disabled | "a WPC hiccup blanked an active tier: expected the cached SLGT, got NONE" |
| ero-rejected-body-serves-last-known-good | `_isWithinStaleWindow` → 0; `_isFeatureCollection` gates removed; `_staleAsOf` → `Date.now()` | blanked to NONE / "degrade was not diagnosable" / "_staleAsOf is not the age of the served reading" |
| ero-unparseable-body-serves-last-known-good | `parseBody` containment removed | blanked to NONE |
| ero-304-with-no-cache-entry-is-a-hard-failure | WR-14 304 guard removed | "an unusable 304 was presented as a confident reading" |
| spc-truncated-ring-degrades-one-layer-not-the-payload | per-feature `try/catch` removed | "payload collapsed to { error }" |
| spc-truncated-ring-degrades-one-layer-not-the-payload | `anyStale` pairing removed; diagnostic removed | "presented as a confident reading" / "no diagnostic naming the layer that degraded" |
| spc-day4-sign-promotes-45pct-to-mdt | SIGN `toValue` → 0 | "a SIGN polygon containing the user did not set day4.sign" |
| spc-day4-sign-promotes-45pct-to-mdt | old argument-ignoring comparator + a filter admitting a value-0 feature | "day4.sign is true with no SIGN polygon in the layer" (the same permissive filter with the NEW comparator PASSES — that is the point) |
| frontend-total-outage-still-shows-the-outage | remove `!this.spcrisk._stale &&` (reintroduce CR-01) | "a total outage rendered as a confident all-clear" |
| frontend-total-outage-still-shows-the-outage | make the gate never short-circuit | "control: a genuine all-clear no longer renders the no-risk line" |
| spc-wellformed-baseline | zero the SPC day1 value | "day1 diverged from golden snapshot" |

---

## Skipped Issues

None. All 14 in-scope findings were fixed and verified by execution.

## Notes for the next reviewer

- **Production seam added for testability.** `node_helper._fetch` exists so the probe can
  stub HTTP rather than `fetchGeoJsonCached`. It is a one-line delegation; every call site
  in the file routes through it.
- **Two helper-global fields are sampled per run** rather than threaded through ~25 call
  sites: `_unusableFeatureCount` (WR-08) and `_oldestStaleAt` (WR-04). Both err toward
  reporting "degraded", never toward hiding it, and CR-03's in-flight guard makes an
  overlapping run unreachable from the socket path. If a future change removes that guard,
  revisit these two.
- **IN-08 is now visible from the probe.** With `days` raised past 5, the suite fails with
  `buildArcGisQuery: layerId must be a non-negative integer` rather than a misleading
  key-count message. The registry's `days`/`dayLayers` pair still has no consistency check
  (IN-08, Info-tier, deliberately not fixed here).
- **`redirect: "error"`** now applies to `fetchBinBuffer`, which also fetches
  `ActiveMD.kmz`. If SPC ever starts serving that URL via a redirect, MDs will stop
  resolving and the refusal will be visible in the log.

---

_Fixed: 2026-08-23_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
