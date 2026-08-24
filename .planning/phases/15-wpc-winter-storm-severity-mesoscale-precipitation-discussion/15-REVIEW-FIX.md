---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
fixed_at: 2026-08-24T23:05:00Z
review_path: .planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-REVIEW.md
iteration: 2
findings_in_scope: 10
fixed: 10
skipped: 0
status: all_fixed
---

# Phase 15: Code Review Fix Report (iteration 2)

**Fixed at:** 2026-08-24T23:05:00Z
**Source review:** `.planning/phases/15-wpc-winter-storm-severity-mesoscale-precipitation-discussion/15-REVIEW.md`
**Iteration:** 2

**Summary:**
- Findings in scope: 10 (2 Critical, 8 Warning; 11 Info and 3 Convention findings out of scope)
- Fixed: 10
- Skipped: 0
- Probe suite: 43 passed / 0 failed before this pass, **48 passed / 0 failed / 0 skipped** after

**Method note.** Every new scenario was verified RED against the pre-fix source before the
fix was accepted, and most were additionally mutation-tested (the fix removed one piece at a
time, each time confirming the scenario names the right failure). The specific verification
for each finding is recorded below. No fix was accepted on the strength of a green suite
alone, because two of the blockers were invisible to the suite by construction.

---

## Fixed Issues

### CR-01: the stale-fallback window is unreachable at the shipping poll cadence

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `54df2a2`

Two separate defects made the fallback unreachable, and both had to be fixed:

1. The window was exactly one poll interval. A cache entry is written when a poll produces
   a reading, and the next poll reaches that same URL one full interval later, so the
   window had always expired at the only moment it was ever consulted. Widened to two
   intervals (`STALE_WINDOW_INTERVALS = 2`), the smallest window that survives one missed
   poll.
2. `entry.timestamp` was written only on a body *change*, so a layer that had been
   304-confirmed hourly for a quiet week carried a week-old timestamp — no finite window
   would have helped. All three confirmation paths (304, ETag match on a 200, hash match)
   now stamp the confirmation, which is what `_noteStaleEntry`'s own comment already said
   an ETag/hash hit means.

Serving an older reading is safe here only because every path that returns one also sets
`stale`, so it is rendered behind the badge with its real age; the badge's age is asserted
against the served entry's timestamp.

**Verification.** New scenario `an-hour-old-reading-still-survives-a-hiccup-but-a-day-old-one-does-not`
advances the clock by ageing the cache entry directly rather than relying on wall-clock
elapsed time — a real-elapsed-time test cannot observe this class in a sub-second suite,
which is exactly why the existing "WPC hiccup" scenarios all passed against the broken code.
Three independent mutations each turn it red: reverting the window width, reverting the
timestamp restamp, and making the window unbounded (the negative control, which keeps the
fix from degrading into "serve any cached reading forever").

### CR-02: a node_helper restart permanently freezes the frontend

**Files modified:** `node_helper.js`, `MMM-SPCOutlook.js`, `scripts/probe-payload-resilience.js`
**Commit:** `f0b13b3`

The helper now stamps each broadcast with the generation its counter belongs to
(`payload[2].epoch`), and the frontend resets `_lastSeq` when the generation changes,
applying the out-of-order guard unchanged within a generation.

Two deliberate choices differ from the review's suggested fix:

- **Explicit generation, not a backwards-jump heuristic.** The review's alternative
  (`last - seq > 1` means a restart) conflicts with an existing asserted guarantee:
  `frontend-seq-discard-survives-socket-index-migration` replays 5/3/6 and requires seq 3 to
  be discarded, and that is a delta of 2. Comparing generations explicitly avoids guessing
  how large a backwards jump is "really" a restart, and leaves that scenario passing
  untouched.
- **A random generation id, not `Date.now()`.** The frontend only compares it for equality,
  and a clock is the one thing not reliably distinct across a restart on this project's
  target hardware — a Raspberry Pi has no RTC and boots with a persisted time. Two boots
  stamping the same millisecond would have left the display frozen exactly as before, with
  nothing saying so.

A payload carrying no metadata keeps today's strict behaviour, so version skew with an older
helper is unchanged. Residual, recorded honestly: an *older* helper (one that predates the
epoch) still freezes the display on restart. Both ends ship in this repo, so a partial
upgrade is not a supported state.

**Verification.** New scenario `frontend-resyncs-after-a-node_helper-restart` replays 47
polls, restarts the producer, and asserts the display advances; RED against the pre-fix
frontend. It also drives the **real emit** and asserts the wire shape, because the two ends
of this socket contract were otherwise pinned only by a comment and the frontend's guard
fails *open* on a shape it does not recognise — a helper that stopped sending the stamp
would have silently restored the freeze. Mutation-tested two ways: a constant epoch, and the
epoch dropped from the emit.

### WR-01: the "only unforgeable" post-read bound is dead code, and its scenario asserted nothing

**Files modified:** `node_helper.js`, `package.json`, `scripts/probe-payload-resilience.js`
**Commit:** `df43188`

Confirmed the review's claim structurally rather than only empirically: adm-zip's
`zipEntry.js` allocates `Buffer.alloc(centralHeader.size)` and copies the inflated result
into it, so the returned buffer is *always* exactly the declared size — a number check 1 has
already bounded. The post-read length check cannot fire with this library.

Chose the review's second option (keep it, make the scenario name the layer that refused)
over deleting it, because unreachability is a property of *this library version*, not of
ZIP: a reader that returns whatever inflated would make this the only bound. The comment now
says plainly that it is unreachable and why it is kept, `adm-zip` is pinned to an exact
version so an upgrade is a deliberate act, and case 3 asserts the refusal is adm-zip's
declared-size clamp by message.

**Verification.** Ran the suite with `zlib.inflateRawSync` patched to ignore
`maxOutputLength` — simulating a library that stops clamping — and the scenario fails with
exactly the diagnostic that says the post-read check has just become load-bearing.

### WR-02: the 200:1 compression-ratio threshold

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `d6bfdfd`

**Assessment as requested: the correct fix was removing the heuristic, not tuning it — and
removing it exposed a real unbounded-inflation hole that the heuristic never covered.**

The ratio is computed from two central-directory fields the archive's author chooses freely,
so it bounds nothing: a larger declaration is refused by the declared-size check, and a
declaration small enough to pass is what adm-zip then clamps inflation to (it passes the
declared size to zlib as `maxOutputLength`). Raising the number to 1000:1 would have kept
100% of the false-rejection surface and added 0% of security.

Independently re-measured the false-rejection claim (`zlib.deflateRaw` level 9, NetworkLink
index KML): 2.8:1 at 3 links, 10:1 at 20, **20:1 at 100**, 25:1 at 1000, 27:1 at 20 000, and
**66:1** for the same 1000-link index indented. So the comment's stated basis ("live KML
compresses at well under 20:1") is already false at 100 links, and the margin to 200:1 is a
factor of three, not the orders of magnitude the comment implied. That is a secondary
argument, though — the primary one is that the check constrains nothing.

**The real bound.** Removing the ratio surfaced the input that genuinely is unbounded:
adm-zip applies `maxOutputLength` **only when the declared size is greater than zero**
(`methods/inflater.js`), so an entry declaring **zero** bytes is inflated with no clamp at
all — and a zero declaration passes any ratio test too, since its ratio is zero. Measured
against the installed adm-zip: a **199 KB** archive (comfortably inside the 8 MB body cap)
whose sole member declares 0 bytes **inflated 200 MB into memory** before the library
rejected it on a checksum; at the full body cap the same shape reaches gigabytes, which on a
Raspberry Pi is the process and with it the whole mirror. A `.kml` member declaring no
content is useless to us in any case. So the ratio check was replaced by
`declared <= 0 -> refuse`, which is the bound that actually binds.

Implementing our own bounded inflate was considered and rejected: `maxOutputLength` is
already a true streaming bound on actual inflated bytes, so a hand-rolled
`zlib.inflateRawSync` would duplicate the library's behaviour while adding a second
decompression path with its own compression-method, encryption-flag and STORED-entry edge
cases. With the lower bound in place, peak inflation is bounded by the declared size, which
check 1 caps at 8 MB.

**Verification.** Scenario case 2 now forges a zero declaration onto a 200 MB deflate stream
and asserts the refusal comes from the size check and **not** from adm-zip's post-inflation
checksum — the difference between refusing the bomb and detonating it first. Mutation-tested:
removing the new lower bound turns it red with adm-zip's CRC error, proving the 200 MB was
materialised. Case 2b asserts a 1000-entry index still round-trips, with a vacuity guard
requiring the fixture to compress above 20:1 so it keeps standing for the shape a ratio
threshold would misfire on.

### WR-03: `PRODUCT_REGISTRY` declares each product's day span twice

**Files modified:** `productRegistry.js`, `scripts/probe-payload-resilience.js`
**Commit:** `efac5b1`

`daySpanOf(dayLayers)` derives the span and validates the map at module load (contiguous
1..N, non-negative integer layer ids), so the mismatched state is unrepresentable. Load-time
throw rather than poll-time degrade: the registry is static source, so an invalid map is a
bug that exists before the process ever polls, and failing on the first run is strictly
better than a permanent silent degrade in the field.

**On the prior pass's misdiagnosis.** Reproduced the 5→7 edit against the *pre-fix* registry
and read the failures instead of assuming: four scenarios fail, and
`ero-malformed-feature` fails with
`MMM-SPCOutlook excessiveRain day 6: fetch/parse/evaluate failed ... buildArcGisQuery: layerId must be a non-negative integer`.
That is the registry latching staleness, not a fixture problem. The other three
(`ero-rejected-body-serves-last-known-good`, `body-read-abort-is-contained-...`, and the new
CR-01 scenario) *are* fixture-side: the probe's `eroHttpRoutes` hardcodes five ERO days, so
days 6-7 hit the unrouted 503 default. Confirmed by re-running the same extension against the
*fixed* registry (extending `eroDayLayers` to seven entries): the `buildArcGisQuery` failure
is gone, only the three route-list failures remain. The probe's hardcoded five-day route
list is the same class as IN-05 and is out of scope for this pass.

**Verification.** New scenario `registry-day-span-is-derived-and-cannot-outrun-its-layer-map`
asserts `daySpanOf` rejects a gap, a map not starting at day 1, an empty map, and bad layer
ids, and asserts the shipped invariant directly (`buildUrl(d)` must not throw for any day a
row declares). RED pre-fix.

### WR-04: two configured module instances silently render each other's location

**Files modified:** `node_helper.js`, `MMM-SPCOutlook.js`, `README.md`, `scripts/probe-payload-resilience.js`
**Commit:** `d7e104c`

The helper echoes the requester's coordinates in the payload metadata and the frontend
discards a payload addressed elsewhere — checked *before* the generation/sequence
bookkeeping, so a foreign broadcast cannot advance this instance's guard and suppress its own
next result either. Both ends warn once, naming both locations.

**Deliberately not fixed, with reasoning.** The in-flight guard still drops the second
instance's request, so that instance stays on "Loading" rather than showing something wrong.
Making the guard per-location would let two chains interleave, and `_oldestStaleAt`,
`_unusableFeatureCount`, `_cachedLat`/`_cachedLon` and the shared cache the location change
clears are all correct *only* because the guard makes interleaving unreachable — several
in-file comments say so explicitly. Queuing the skipped request would either double the
network load in the degraded-network case CR-03's guard exists for (if it coalesces
same-location ticks) or reintroduce the cache thrash. Trading a silent wrong answer for a
visible non-answer plus two log warnings is the right direction for a product whose stated
purpose is preventing false negatives, and the review itself offers "declare it unsupported"
as an acceptable resolution. `README.md` now documents it.

**Verification.** New scenario `a-payload-is-only-rendered-by-the-instance-that-asked-for-it`
asserts the foreign payload is rejected, the own payload is accepted (positive control), a
foreign payload does not advance the sequence guard, an unaddressed payload still fails open,
and — driving the **real** helper — that the address is actually on the wire and that a
second distinct location is logged. RED against the pre-fix source and against dropping the
address from the emit.

### WR-05: `harness-leak-setup` / `harness-leak-check` are order-coupled

**Files modified:** `scripts/probe-payload-resilience.js`
**Commit:** `246f2ae`

The check now dirties the seams itself and asserts the dirt is present before cleaning it, so
no ordering assumption is load-bearing and no assertion can pass because the thing it tests
never happened. The assertion-free setup scenario is deleted (it always passed and inflated
the count by one).

**Verification.** Mutation-tested twice: removing `resetHelper`'s seam restore and removing
its turf restore each turn it red, with the diagnostic naming which leak survived.

### WR-06: three unreachable helper methods

**Files modified:** `node_helper.js`
**Commit:** `0578bd2`

`kmzToKmlfilename`, `extractKmlFromKmz` and `fetchGeoJson` deleted after confirming no caller
anywhere in the repository (including the probe suite). A comment at each site records what
was removed and why — for `fetchGeoJson` the danger was its *name*: a future caller reaching
for the obviously-named function instead of `fetchGeoJsonCached` would reintroduce the whole
silent-degradation class in one line. `extractSoleKmlEntry`'s docblock no longer refers to a
function that no longer exists.

**Verification.** Re-grepped for callers across all non-`node_modules` `.js` files; full
suite green. No new scenario: a "this method does not exist" assertion would go red on a
legitimate future re-introduction routed through `fetchGeoJsonCached`, which is exactly what
the comment invites.

### WR-07: `spc-active-index` violates the ordering contract the truncation cap depends on

**Files modified:** `node_helper.js`, `scripts/probe-payload-resilience.js`
**Commit:** `ac43a10`

The strategy now sorts by MD number and truncates to the highest-numbered itself, mirroring
`wpc-mpd-listing`, so the downstream cap is a no-op for both shipped strategies. The contract
comment is restated to match what the code does, including why keeping the head there and the
tail here is not a contradiction.

**Verification.** New scenario drives the strategy with a 70-entry index in ascending
document order and asserts the surviving set is the 60 *highest*-numbered, flagged
`failed: true`, with a diagnostic naming the drop count; plus a control that an ordinary
3-entry index is neither truncated nor flagged and comes back ordered. RED pre-fix (all 70
candidates survived, unflagged).

### WR-08: the XSS-escaping guarantee is asserted by no scenario

**Files modified:** `scripts/probe-payload-resilience.js`, `scripts/probe-lib/module-stubs.js`
**Commit:** `348fab7`

New scenario renders hostile text through all three remote-sourced fields (SPC label, MPD
label, MPD hazard type) and asserts each of the five characters `escapeHtml` claims to
handle, with a count guard so it cannot pass because the advisory failed to render at all.
The DOM stub's limitation is now recorded where the stub is defined: it is a plain object
whose `innerHTML` is never parsed, so the assertion is string-level and cannot prove that
what reaches a real browser is inert — closing that gap needs a real DOM.

**Verification.** Mutation-tested: replacing `escapeHtml`'s body with `(value) => String(value)`
turns it red, which is the exact mutation the review showed leaves the suite at 43/0.

---

## Skipped Issues

None.

---

## Notes for the verifier

- **Requires human verification (logic, not syntax):** `CR-01`'s widened window is a policy
  choice — two intervals tolerates exactly one missed poll. The reading is always rendered
  behind the stale badge with its true age, and the negative control pins that the window
  still ends, but whether two intervals is the right tolerance for this product is a
  judgement call worth confirming.
- **`WR-04` is a partial fix by design.** The dangerous half (wrong location rendered
  silently) is closed; the starvation half (second instance never updates) is now documented
  as unsupported rather than fixed. See the reasoning above before treating it as complete.
- **Out of scope but observed while working:** the probe's `eroHttpRoutes` / `wssiRoutes`
  hardcode five- and three-day route lists, the same class as IN-05. Any future day-span
  extension will produce three spurious failures there until those are registry-driven.
- **`package.json` now pins `adm-zip` to an exact `0.5.16`.** The repo has no committed
  lockfile, and `WR-01`'s comment and scenario both depend on that version's inflation
  clamp; the scenario turns red if a future version stops clamping.

---

_Fixed: 2026-08-24T23:05:00Z_
_Fixer: Claude (gsd-code-fixer)_
_Iteration: 2_
