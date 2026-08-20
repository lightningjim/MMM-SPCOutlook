---
phase: 14-foundation-wpc-excessive-rainfall-outlook
fixed_at: 2026-08-20T00:00:00Z
review_path: .planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW.md
iteration: 1
findings_in_scope: 20
fixed: 20
skipped: 0
status: all_fixed
---

# Phase 14: Code Review Fix Report

**Fixed at:** 2026-08-20
**Source review:** `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 20 (4 Critical + 16 Warning; the 6 Info findings were out of scope)
- Fixed: 20
- Skipped: 0

All work was done in an isolated git worktree on a temporary branch, then fast-forwarded
onto `main`. 18 commits, one per finding except WR-03/WR-04 (shared hunks) and WR-10
(same code change as CR-01). Probe: **8 passed, 0 failed** at the final tree.

## Verification method

Every fix was verified by execution, not by inspection. Three offline harnesses were built
in scratch space (never committed):

| Harness | What it drives |
|---|---|
| `repro.js` | ERO loop through the stub loader with a routed `fetchGeoJsonCached` |
| `repro-fetch.js` | The **real** `fetchGeoJsonCached`, by redirecting `import('node-fetch')` to an in-memory stub via `module.registerHooks` — this is what makes CR-02/CR-03/WR-11/WR-14 testable at all |
| `repro-cr04.js`, `repro-wr12.js`, `repro-wr13.js`, `repro-wr14.js`, `repro-wr15.js` | Per-finding drivers, including a `vm`-sandboxed front-end harness for `getDom` |

For each finding the harness was run against the pre-fix tree first (RED) and the fixed
tree after (GREEN). Both quoted values below are real output.

The repo's own probe was additionally run against three trees: the fixed tree (8/8),
the pre-fix tree `4f0675b` (**5 passed, 3 failed** — the new assertions genuinely bite),
and the deep RED baseline `2afd3d5` (**3 passed, 5 failed**).

## Fixed Issues

### CR-01: A single feature missing `properties` suppresses an already-computed real ERO risk

**Files modified:** `node_helper.js`
**Commit:** `b0f046c`
**Applied fix:** `extractPolygons` now carries the source `feature` on each item, and a new
`_validTimeOfWinner` helper reads `valid_time` off the polygon the user is actually inside at
the winning tier. Every dereference is guarded, and the read is skipped entirely when
`eroValue === 0`.
**Proof:** feature 0 without `properties`, feature 1 `dn: 3` covering the point —
RED `day1Risk = NONE, validTime = null` + a swallowed `TypeError`; GREEN `day1Risk = MDT,
validTime = "VT-MDT"`, no exception logged.

**Note:** this went beyond the review's suggested patch (which kept `features[0]` and only
gated it). Taking the time from the winning feature closes WR-10's first defect in the same
change rather than leaving it open.

### CR-02: `extractPolygons` hardening turned a loud SPC failure into a cached silent false negative

**Files modified:** `node_helper.js`
**Commit:** `0108715`
**Applied fix:** rather than editing twelve near-identical SPC/fire-weather call sites, the
shape gate was hoisted into `fetchGeoJsonCached`: a parsed 200 body that is not a usable
FeatureCollection is never returned as `data`, so no call site can evaluate or cache it. It
falls back to a still-fresh cached result (marked `stale`) and always logs the URL. A throwing
`JSON.parse` is contained the same way instead of nulling the whole payload.
**Proof:** ArcGIS error body on `day1otlk_cat` — RED cached `{result: 0, etag: "E1"}` and the
next 304 poll returned `NONE` forever; GREEN cache entry `undefined`, `_stale = true`, one
URL-qualified `Log.error`. A cached SLGT now survives a later bad body (`SLGT`, `_stale: true`,
original ETag retained). An HTML error page no longer collapses the payload to `{ error }`.

**Note:** this is the "durable form" the review preferred (a shared helper), one level higher
than it suggested — in `fetchGeoJsonCached` rather than a new `fetchEvaluateAndCache`, because
that is the single point every one of the ~25 layers already passes through.

### CR-03: A non-2xx or network ERO failure degrades to no-risk with zero observability

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `23d7e5f`
**Applied fix:** both silent hard-failure returns now emit a URL-qualified `Log.error` (with
HTTP status or network message) and carry `failed: true`. All 19 stale-propagation sites —
every SPC layer, both hazard fetches, Days 4-8, and all five ERO days — now set `anyStale` on
`failed`, so the frontend renders the ⚠ badge. Adds probe scenario `ero-hard-fail-is-flagged`.
**Proof:** all layers 503 — RED `_stale = undefined`, 0 relevant log lines; GREEN `_stale = true`,
14 `unrecoverable fetch failure` lines. ERO-only variant: RED 1 unrelated log line and no flag;
GREEN 20 lines and `_stale = true`. The new scenario fails against `4f0675b`.

### CR-04: An SPC Mesoscale Discussion outage permanently strands the module on "Loading…"

**Files modified:** `node_helper.js`
**Commit:** `ca55c30`
**Applied fix:** `socketNotificationReceived` wraps both awaits individually — a failed MD fetch
degrades to `false` (the documented "no active MDs" value) and the outlook is still delivered;
a failed outlook is delivered as `{ error }`.
**Proof:** `getMesoscaleDiscussion` throwing `'KMZ downloaded has no KML'` — RED the handler
rejected and **no notification was ever sent**; GREEN 1 `SPC_DATA_RESULT` with `md: false`, an
intact `day1`, and the full 20-key `excessiveRain` block.

### WR-01: `spc-wellformed-baseline`'s fire-weather fixture can never produce a non-zero value

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `a9c2f20`
**Applied fix:** new `FIRE_CRIT_BODY` fixture (`LABEL: "CRIT"`), `GOLDEN_FIRE_WEATHER`
re-captured at `day1Risk: 2 / "Critical"`, plus `assertGoldenPinsSomething` run before the
scenarios so an all-defaults golden aborts the probe.
**Proof:** three ways — probe green; the old all-default golden now aborts with the vacuity
error; and deleting the fire-weather route now **fails** the golden, where it was previously
byte-identical.

### WR-02: No scenario asserts that SPC values survive an ERO failure

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `2b23057`
**Applied fix:** `ero-arcgis-error-body` now also routes the day1 categorical layer to a real
SLGT body and asserts `out.day1.risk === "SLGT"` plus its text/color, alongside the existing
ERO assertions.
**Proof:** mutation-tested — forcing `day1Risk = "NONE"` while keeping the payload shape fails
the scenario (`an ERO failure destroyed the SPC day1 value`), which the pre-fix assertions
could not detect.

### WR-03: `ero-malformed-feature` passes through the crash path, not the guard path

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `5352d80` (shared with WR-04)
**Applied fix:** the scenario now additionally asserts `forbidLog("TypeError")` and
`forbidLog("fetch/parse/evaluate failed")`, so `NONE` only counts when it comes from the shape
guard. A new scenario `ero-leading-bad-feature-preserves-risk` covers CR-01's exact shape.
**Proof:** against pre-fix `4f0675b` both fail loudly (`day1 resolved to NONE via an exception,
not via the per-feature guard`); green on the fixed tree.

### WR-04: The log-capture apparatus is wired but never asserted on

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `5352d80` (shared with WR-03)
**Applied fix:** imports `logCalls` and adds `requireLog` / `forbidLog`. Every rejected ERO body
and every contained throw must now emit its per-day diagnostic (asserted for all five days in
both failure scenarios).

**Note:** WR-03 and WR-04 share one mechanism and edit the same hunks, so splitting them into
two commits would have meant an artificial half-change. They are committed together with both
IDs in the subject.

### WR-05: The probe's rejection handler discards the error and reports a fabricated tally

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `5508338`
**Applied fix:** prints `PROBE ABORTED before scenarios completed: <stack>`.
**Proof:** simulated loader failure prints the real message and stack, exit 1.

### WR-06: A fresh-but-rejected ERO body discards a still-valid cached risk

**Files modified:** `node_helper.js`
**Commit:** `42c126a`
**Applied fix:** the ERO rejection path falls back to `_geoJsonCache`'s result when it is inside
the stale window and sets `anyStale`; only with nothing good to fall back to does the day stay
at the no-risk default. The bad body is still never cached.
**Proof:** poll 1 caches HIGH, poll 2 returns an error body — RED `NONE`, `_stale: undefined`;
GREEN `HIGH`, `_stale: true`.

**Note:** the review's snippet fell through into the evaluate path and would have overwritten
the recovered value; the fix restructures the branch into if/else instead. This commit also
re-indents the try-block body (Info finding IN-04) because the same lines were being rewritten.

### WR-07: `extractPolygons`' rejection log identifies neither the URL nor the product

**Files modified:** `node_helper.js`
**Commit:** `732d8d9`
**Applied fix:** added a `context` parameter (default `"unidentified layer"`) and passed the
layer URL at all 24 call sites, with a `" (SIGN)"` qualifier on the Day 4-8 significant-severe
pass.
**Proof:** the log line now ends with the URL; the defaulted call still logs safely.

### WR-08: `_isFeatureCollection` blesses a truncated ArcGIS response

**Files modified:** `node_helper.js`
**Commit:** `27e1144`
**Applied fix:** the predicate now also requires `exceededTransferLimit !== true`.
**Proof:** `_isFeatureCollection({exceededTransferLimit: true, features: []})` — RED `true`,
GREEN `false`.

### WR-09: `resetHelper` duplicates `start()`'s field list

**Files modified:** `scripts/probe-lib/module-stubs.js` (with `node_helper.js`, committed in `9dd6b4c`)
**Commit:** `5297c0a`
**Applied fix:** `resetHelper` delegates to `helper.start()`. `_loggedIntervalFallback`, which
was in neither list, is now initialised in `start()` so the delegation covers it.
**Proof:** every helper-global field including `_loggedIntervalFallback` returns to its initial
value after `resetHelper`; probe unaffected (scenarios call `resetLogs()` after `resetHelper`).

### WR-10: ERO `valid_time` is read from `features[0]` and set even on the no-risk path

**Files modified:** `node_helper.js`
**Commit:** `b0f046c` (same change as CR-01)
**Applied fix:** both defects closed by `_validTimeOfWinner` plus the `eroValue > 0` gate.
**Proof:** a user outside every polygon — RED `{day1Risk: "NONE", validTime: "VT"}`;
GREEN `{day1Risk: "NONE", validTime: null}`.

### WR-11: No request timeout on any fetch

**Files modified:** `node_helper.js`
**Commit:** `ee321ce`
**Applied fix:** module-level `withTimeout()` attaches `AbortSignal.timeout(15000)` at all three
fetch call sites, with a no-op fallback on Node < 17.3.
**Proof:** the stubbed `node-fetch` confirms an abortable `signal` reaches every call
(`fetchGeoJsonCached` with headers, and `fetchBinBuffer`), and an `AbortError` routes to the
hard-failure shape `{failed: true}` with the `unrecoverable fetch failure` log.

### WR-12: Remote-controlled strings are concatenated into `innerHTML` unescaped

**Files modified:** `MMM-SPCOutlook.js`
**Commit:** `6c765f1`
**Applied fix:** the error branch uses `textContent`; MD names go through a local `escapeHtml`
before concatenation.
**Proof:** an `<img src=x onerror=...>` payload — RED reached `innerHTML` verbatim in both
places; GREEN the error text is `textContent` only and the MD markup contains `&lt;img`, never
`<img`.

**Note:** the review suggested `createElement`/`textContent` for the MD spans. Escaping was used
instead because the surrounding code accumulates markup with `innerHTML +=`; mixing appended
nodes into that pattern is fragile, while escaping is equally sound and a much smaller blast
radius.

### WR-13: Helper-global `this._products` is read ~twenty awaits after it is written

**Files modified:** `node_helper.js`
**Commit:** `93203ea`
**Applied fix:** `socketNotificationReceived` snapshots the toggles and passes them to
`getSpcOutlook(lat, lon, extended, products)`; the helper-global field remains only as a
fallback for callers that pass nothing (which keeps existing probe scenarios valid).
**Proof:** request A starts with the toggle on, request B overwrites `_products` mid-flight —
RED A produced `day1Risk = NONE` and fetched 0 ERO URLs; GREEN A produced `HIGH` and fetched all 5.

### WR-14: Location-change invalidation keeps the ETag

**Files modified:** `node_helper.js`
**Commit:** `6fc7375`
**Applied fix:** `_geoJsonCache.clear()` on location change, and the 304 branch returns the
hard-failure shape (with a log) instead of dereferencing an absent `entry`.
**Proof:** after a location change — RED the next request still sent `If-None-Match`; GREEN it
does not. A spurious 304 against an empty cache — RED collapsed the payload to
`{error: TypeError...}`; GREEN returns an intact payload.

### WR-15: The `products` notification payload literal is duplicated

**Files modified:** `MMM-SPCOutlook.js`
**Commit:** `e3eff97`
**Applied fix:** extracted `buildRequestPayload()`, called from both `start()` and the interval.
**Proof:** driving `start()` and then firing the interval callback yields byte-identical payloads
from a single source.

### WR-16: Registry fields unconsumed and the ERO day count hardcoded in two places

**Files modified:** `node_helper.js`
**Commit:** `9dd6b4c`
**Applied fix:** new `_productToggles()` builds the toggle map from every registry row's
`configFlag` (making the row's own comment true), the ERO gate reads
`productToggles[ero.configFlag]`, and `ero.days` now drives the loop bound, the seed objects and
a generated payload block — both five-day literals are gone. ERO log lines are qualified with
`ero.id`.
**Proof:** payload key order and the 20-key count are unchanged (byte-compatible with the
goldens); setting `ero.days = 3` at runtime yields a 12-key payload ending at `day3ValidTime`,
proving the registry is now the single source for the product's span.

## Deviations and residual risk

Worth a human glance before this phase is signed off:

1. **D-04 was deliberately refined.** The ERO block's comment previously stated that a rejected
   body "deliberately does not set `anyStale`". CR-03 and WR-06 both require the opposite, so
   the behaviour and the comment were changed together. If D-04 is a binding design decision
   recorded elsewhere in the phase docs, that document should be updated to match.
2. **`_stale` is now reachable without cached data.** A hard failure sets `_stale: true` with
   `_staleAsOf: Date.now()`, so the badge reads "⚠ Stale — a few seconds ago". This is the
   review's own prescribed behaviour, but the wording is a little odd for a failure that is not
   really "stale data"; a distinct `_degraded` flag would read better and is worth considering.
3. **`_cachedLat` / `_cachedLon` still race.** WR-13 fixed the toggle snapshot; the same
   multi-instance concern applies to the cached location, and with `_geoJsonCache.clear()` from
   WR-14 two instances at different locations will now clear each other's cache every poll
   rather than silently mis-serving it. Louder and safer, but still not correct — that is a
   pre-existing architectural issue (one helper per module type) beyond this review's findings.
4. **`baseUrl` / `dayLayers` remain read only inside `productRegistry.js`**, because `buildUrl`
   is an arrow closure over the module constants by deliberate design (so a destructured row
   still works). WR-16's other three parts are done; this one is unchanged on purpose.
5. **The six Info findings (IN-01…IN-06) were out of scope** and are untouched, except IN-04
   (try-block indentation), which was fixed incidentally in `42c126a` because the same lines
   were being rewritten. IN-06 in particular still stands: the probe is not reachable from
   `package.json`, so nothing runs these eight scenarios automatically.

---

_Fixed: 2026-08-20_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 1_
