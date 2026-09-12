---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
reviewed: 2026-08-25T00:59:14Z
depth: deep
iteration: 3
files_reviewed: 7
files_reviewed_list:
  - MMM-SPCOutlook.js
  - node_helper.js
  - productRegistry.js
  - scripts/probe-lib/module-stubs.js
  - scripts/probe-payload-resilience.js
  - package.json
  - README.md
findings:
  critical: 2
  warning: 13
  info: 5
  total: 20
status: issues_found
---

# Phase 15: Code Review Report (iteration 3)

**Reviewed:** 2026-08-25T00:59:14Z
**Depth:** deep
**Files Reviewed:** 7
**Status:** issues_found

## Summary

This pass re-derived every finding from current source and, per the brief, spent most of its
budget on the question "do iteration 2's fixes hold, and did they introduce regressions?"

**Method.** Beyond reading, I built an isolated copy of the source tree (real `node_modules`
symlinked) and ran 25 targeted mutations — deleting or reverting each iteration-2 fix and
several iteration-1 fixes one at a time — to see whether any scenario turns red. Baseline
reproduces at 48 passed / 0 failed / 0 skipped in 1.9 s. I also read the installed
`adm-zip@0.5.16` source directly rather than trusting the source comments about it.

**Verdict on the iteration-2 fixes.** They hold. Every one of them is genuinely pinned:

| Fix | Mutation | Result |
|---|---|---|
| CR-01 window | `STALE_WINDOW_INTERVALS` 2 → 1 | RED |
| CR-01 refresh | delete 304 `entry.timestamp = Date.now()` | RED |
| CR-02 resync | delete frontend epoch block | RED |
| WR-01 KMZ bound | delete `declared > KMZ_MAX_KML_BYTES` | RED |
| WR-02 zero-size | delete `declared <= 0` refusal | RED |
| WR-03 day span | hardcode `days: 6` | RED (5 scenarios) |
| WR-04 addressing | delete frontend address check | RED |
| WR-04 addressing | delete `_noteRequestLocation` call | RED |
| WR-05 leak check | revert `ORIGINAL_SEAMS` to curated list | RED |
| WR-07 MD ordering | delete `urls.sort(mdNumberOf)` | RED |
| WR-08 XSS | `escapeHtml` → `String(value)` | RED |

The adm-zip reasoning is also correct as written: `methods/inflater.js:4` gates
`maxOutputLength` on `expectedLength > 0`, and `zipEntry.js:103` allocates
`Buffer.alloc(_centralHeader.size)`, so the zero-declared hole is real, the
`declared <= 0` refusal genuinely closes it, and the post-read length check genuinely is
unreachable. Deleting the refusal produces `ADM-ZIP: CRC32 checksum failed` — i.e. the bomb
detonates first — and the scenario catches exactly that.

**What this pass found instead.** Two BLOCKERs, neither of them a regression from iteration
2 — both are pre-existing defects that iteration 2's work walked past:

1. A `kml-advisory` discovery run that fetches its index successfully but produces **zero
   usable candidates** reports `failed: false`. Empirically verified for all three shapes
   (every href refused, index format changed, listing format changed): the result is
   `{ entries: [], anyStale: false }`, which is byte-identical to "no advisories active".
   This is the *exact* silence that let the previously-shipped `startsWith("https://…")`
   allowlist bug — which node_helper.js:41-47 documents as "a live, currently-shipping
   availability defect" — run undetected. Iteration 2's WR-07 fixed the matcher inside this
   function and left the silence in place.
2. README.md, `_noteRequestLocation`'s JSDoc and the helper's own operator-facing warning all
   assert "only the first location is polled" and "the second instance … stays on Loading".
   Driven directly, the helper polls **both** locations alternately, both instances render,
   and `_geoJsonCache.clear()` fires on **every** poll — which silently disables the stale
   fallback CR-01 was just written to make reachable.

**Probe-suite assessment.** The suite is genuinely strong — vacuity guards, positive controls
and negative controls are used consistently and the mutation results above show they bite.
But the mutation sweep found five live guards that can be deleted with the suite fully green,
including the whole of iteration-1's WR-05 `updateInterval` validation at **both** ends, and
two of the three timestamp-refresh sites CR-01 added. Those are recorded below because "a fix
that passes only because its own scenario is too weak" is precisely the pattern this phase has
already hit twice.

---

## Critical Issues

### CR-01: A discovery run that yields zero usable candidates reports `failed: false` — every advisory vanishes with no ⚠ signal

**File:** `node_helper.js:320-365` (`spc-active-index`), `node_helper.js:371-486` (`wpc-mpd-listing`), consumed at `node_helper.js:516-517`

**Issue:** Neither discovery strategy treats "the index was fetched and parsed, but nothing
survived" as a degrade. `failed` is set only when the fetch/parse *throws* or when the
candidate list is *truncated*. A total refusal, a changed index format, or a changed listing
format all fall through to `return { urls: [], failed: false }`, and `_runKmlAdvisoryRow` then
returns `{ entries: [], anyStale: false }` — indistinguishable from the legitimate "no
advisories active" state that holds most of the year.

Verified by driving the real code paths (not asserted from reading):

```
A: every href refused (host changed) -> {"entries":[],"anyStale":false}
B: index format changed (no NetworkLinks) -> {"entries":[],"anyStale":false}
C: WPC listing format changed (no anchors matched) -> {"entries":[],"anyStale":false}
```

Because `anyStale` stays false, `getSpcOutlook` emits no `_stale`, the frontend's no-risk
short-circuit is *not* disqualified, and a location sitting inside an active tornado-precursor
MD or a flash-flood MPD renders the literal string **"No Severe Weather Risk"**. That is the
false-negative class the whole product exists to prevent, and it is reachable today without any
code change — SPC or WPC changing an href host, an anchor shape, or a NetworkLink wrapper is
enough.

This is not hypothetical. `node_helper.js:41-47` records that the previous
`startsWith("https://www.spc.noaa.gov/")` allowlist refused *100% of live hrefs* and shipped
that way: "a live, currently-shipping availability defect … not merely a bug in theory." It
shipped undetected precisely because of this silence. Iteration 2's WR-07 changed the sort
order in this same function and left the silence unaddressed.

Note the two cases must be distinguished carefully: for `spc-active-index`, an index that
legitimately contains **zero** NetworkLinks *is* the normal quiet state and must stay silent.
The unambiguous degrade is "candidates were found and all of them were discarded".

**Fix:**

```js
// spc-active-index, after the normalize loop (node_helper.js ~line 335)
if (hrefs.length > 0 && urls.length === 0) {
  Log.error(`MMM-SPCOutlook ${row.id}: all ${hrefs.length} NetworkLink hrefs were refused by ` +
            `the allowlist — treating as a degrade, not as "no active discussions"`);
  return { urls: [], failed: true };
}

// wpc-mpd-listing, before the truncation block (node_helper.js ~line 458)
// The live directory holds 1000+ entries year-round, so a 200 that yields nothing is a
// format break, never a quiet day.
let failed = false;
if (urls.length === 0) {
  Log.error(`MMM-SPCOutlook ${row.id}: a 200 listing produced zero candidates — the anchor ` +
            `format is no longer understood`);
  failed = true;
}
```

Add a scenario per strategy asserting `anyStale === true` for the total-refusal case, or this
regresses the same way twice.

---

### CR-02: README, JSDoc and the operator warning all describe multi-instance behaviour the code does not implement — and the real behaviour disables the stale fallback

**File:** `README.md:6-16`, `node_helper.js:659-690`, `node_helper.js:1622-1635`, `MMM-SPCOutlook.js:96-115`

**Issue:** All three texts state the same two claims:

- README.md:10-12 — "only the first location is polled: the second instance discards the
  payloads it receives … and stays on 'Loading SPC Outlook...'"
- node_helper.js:687-689 (the log line an operator actually sees) — "only the first location is
  polled; the other instance will not update"
- node_helper.js:670-674 (JSDoc) — "the in-flight guard drops the second instance's request
  outright, so that instance receives nothing rather than something wrong"

Nothing in the code enforces any of that. `_noteRequestLocation` **records** the first location
and warns; it never **rejects** a request for a different one. `_inFlight` is a concurrency
guard, not a location guard — it drops the second request only when it happens to arrive during
an in-flight chain. Driving the real handler with sequential requests:

```
after A:  cache entries = 19  cachedLat = 35.22
after B:  cache entries = 19  cachedLat = 42.36
after A2: cache entries = 19  cachedLat = 35.22
emissions addressed to: [ '35.22,-97.44', '42.36,-71.06', '35.22,-97.44' ]
"location changed — cache results invalidated" log lines: 3
boston instance rendered a payload? true
```

Both locations are polled, the Boston instance **does** render, and — the part that matters —
`getSpcOutlook`'s `locationChanged` branch calls `this._geoJsonCache.clear()` on **every** poll.
That has three consequences the docs do not mention:

1. `fetchGeoJsonCached` finds no `entry` on any poll, so **the stale fallback never fires**.
   Every transient upstream blip becomes a hard failure resolving to `"NONE"` — the precise
   outcome iteration 2's CR-01 was written to make unreachable at the shipping cadence.
2. No `If-None-Match` is ever sent, so all ~19-25 layers are re-fetched cold every poll for
   every location: double the upstream volume against `www.spc.noaa.gov` and
   `mapservices.weather.noaa.gov`, with the 304 path — the thing CR-01's timestamp refresh
   exists for — never taken.
3. The two instances' `_updateInterval` and `_products` overwrite each other on every poll,
   which is the very hazard WR-13's per-request snapshot was introduced to contain (the
   snapshot protects an in-flight chain, not `_isWithinStaleWindow`, which reads the global).

The behaviour is timing-dependent, which makes it worse than a plain bug: with both instances
on the same `updateInterval` and started in the same tick the README's description usually
holds, and with different intervals or a fast first chain it does not.

**Fix (cheapest, makes the docs true):**

```js
// node_helper.js, socketNotificationReceived, right after _noteRequestLocation(payload)
if (this._requestLocation !== null && this._requestLocation !== payload.lat + "," + payload.lon) {
  // The documented contract: one node_helper per module type means one polled location.
  // Serving the second one alternately wipes the shared cache on every poll and takes the
  // stale fallback offline for BOTH instances.
  return;
}
```

Otherwise correct all three texts to describe alternating service and its cache cost — but
that is the worse option, because the alternating behaviour is not one anybody wants.

---

## Warnings

### WR-01: Two of CR-01's three timestamp-refresh sites are pinned by nothing

**File:** `node_helper.js:1459`, `node_helper.js:1474`

**Issue:** `an-hour-old-reading-still-survives-a-hiccup-but-a-day-old-one-does-not` (step 2,
probe line 3230) drives only the **304** branch. Deleting the ETag-match refresh (line 1459)
and the hash-match refresh (line 1474) leaves the suite at **48 passed / 0 failed** — verified.
Those are the two paths that carry the confirmation when a server ignores `If-None-Match` and
answers 200 with an unchanged ETag, or serves no ETag at all (hash mode). Both are ordinary
production shapes for SPC's `.lyr.geojson` layers.

**Fix:** extend the same scenario with two more legs — a 200 whose ETag equals the cached one,
and a no-ETag 200 whose body bytes are identical — each asserting
`Date.now() - entry.timestamp < 60_000` after the poll, exactly as the 304 leg does.

---

### WR-02: WR-05's `updateInterval` validation can be deleted at BOTH ends with the suite green

**File:** `node_helper.js:720-730`, `MMM-SPCOutlook.js:24-35`

**Issue:** Two mutations, both leaving 48/48 green:

- reverting the helper's validation to the pre-fix `if (updateInterval !== undefined) this._updateInterval = updateInterval;`
- reducing `resolveUpdateInterval` to `return this.config.updateInterval;`

Every scenario passes `updateInterval: 60`. No scenario passes `0`, a negative, a string, or
omits the field. This is a guard whose own comment (node_helper.js:714-719) states the stakes:
a non-numeric value makes `_isWithinStaleWindow` compute `NaN`, `x < NaN` is always false, and
**every stale fallback in the file is silently disabled** — which is CR-01's entire subject
matter. On the frontend side the same value reaches `setInterval`, which clamps `NaN`/`0` to
~1 ms: an unbounded poll loop against NOAA from a Raspberry Pi.

The code is correct today. The finding is that nothing would notice if it stopped being.

**Fix:** one scenario driving `socketNotificationReceived` with `updateInterval: "hourly"`,
`0` and `-5`, asserting `helper._updateInterval === 60` and that the fallback warning was
logged; one frontend scenario asserting `resolveUpdateInterval.call({ config: { updateInterval: 0 } }) === 60`.

---

### WR-03: The stale window has no absolute ceiling

**File:** `node_helper.js:126`, `node_helper.js:1305-1308`

**Issue:** `_isWithinStaleWindow` is purely relative:
`(Date.now() - timestamp) < intervalMinutes * 60_000 * STALE_WINDOW_INTERVALS`. Nothing bounds
`intervalMinutes` above. A user configuring `updateInterval: 1440` ("check once a day") — which
`resolveUpdateInterval` accepts, since it only rejects `< 1` — gets a **48-hour** stale window
on SPC **Day 1** categorical outlooks, which SPC reissues five times a day. `updateInterval: 360`
gives 12 hours. The badge does render the age via `moment().fromNow()`, which is the mitigation,
but the design's own justification ("Serving an old reading is safe here precisely because it
is never presented as current") is doing a lot of work for a 2-day-old tornado outlook.

**Fix:**

```js
const STALE_WINDOW_INTERVALS = 2;
// Absolute ceiling. SPC reissues the Day 1 categorical outlook five times a day, so a
// reading older than this is not a degraded answer, it is a wrong one — no badge makes it
// safe to render a tier from two days ago beside today's date.
const STALE_WINDOW_MAX_MS = 3 * 60 * 60 * 1000;

_isWithinStaleWindow(timestamp, intervalMinutes) {
  const intervalMs = (intervalMinutes ?? 60) * 60 * 1000;
  const window = Math.min(intervalMs * STALE_WINDOW_INTERVALS, STALE_WINDOW_MAX_MS);
  return (Date.now() - timestamp) < window;
}
```

---

### WR-04: `_staleAsOf` ages only the cached contributors, so a mixed payload reports the age of its freshest failure

**File:** `node_helper.js:1329-1335`, `node_helper.js:2227`, `MMM-SPCOutlook.js:317-330`

**Issue:** `_noteStaleEntry` is called only from the three stale-fallback returns. A layer that
**hard-fails** (no cache entry, `failed: true`) contributes to `anyStale` but contributes
nothing to `_oldestStaleAt`. So a payload in which the day-1 categorical layer served a
5-minute-old cached reading while the ERO layers hard-failed to `"NONE"` renders
`⚠ Stale — 5 minutes ago`. The suffix asserts a data age for layers that have no data at all,
and it is the only quantitative signal on screen. The comment at node_helper.js:2225-2226 calls
this "the oldest cached reading that contributed to this payload", which is accurate about the
implementation and misleading about what the user reads.

**Fix:** suppress the age suffix whenever any contributor hard-failed, or carry both facts:

```js
// node_helper.js — alongside _oldestStaleAt
if (fetchResult.failed && fetchResult.cachedResult === null) this._hadHardFailure = true;
...
...(anyStale ? { _stale: true, _staleAsOf: this._hadHardFailure ? null : this._oldestStaleAt } : {})
```

The frontend already omits the suffix on `null`, so no frontend change is needed.

---

### WR-05: `socketNotificationReceived` destructures `payload` outside any catch — the exact "stuck on Loading forever" failure CR-04 claims to have closed

**File:** `node_helper.js:713`

**Issue:** `_noteRequestLocation` guards `if (!payload) return;` (line 677). Two lines later,
`const { lat, lon, extended, updateInterval, proximityWeighting, products } = payload;` runs
with no such guard, inside a `try { … } finally { this._inFlight = false; }` that has **no
catch**. A null or undefined payload therefore throws an unhandled rejection out of a handler
MagicMirror does not await. Node 16+ terminates the process on unhandled rejections by default;
if it does not, `sendSocketNotification` is never reached and the frontend sits on "Loading SPC
Outlook..." forever — verbatim the failure mode node_helper.js:746-751 says CR-04 fixed. The
containment was applied to `getSpcOutlook` but not to the seven lines above it.

**Fix:**

```js
if (!payload || typeof payload !== "object") {
  Log.error("MMM-SPCOutlook: GET_SPC_DATA with no payload, ignoring");
  return;
}
```
placed with `_noteRequestLocation`'s guard, before `this._inFlight = true`.

---

### WR-06: `helper.normalizeAdvisoryUrl` is exported "so offline probes can exercise the allowlist directly" — no probe does, and the guards it holds are unpinned

**File:** `node_helper.js:129-133`, `node_helper.js:67-73`

**Issue:** The member is placed on the helper object with an explicit justification: "Exposed on
the helper object (rather than kept purely module-private) so offline probes can exercise the
allowlist directly against the module-scope implementation above." Grepping the entire probe
suite for `normalizeAdvisoryUrl` returns exactly one hit — a comment. No scenario calls it. It
is a dead export whose reason for existing is stated and false.

Consistent with that, mutation confirms the guards inside it are only partly covered: deleting
both the userinfo check and the port check (lines 69-70) leaves the suite at 48/48. Those are
defence-in-depth against the very attack the surrounding comment names
(`https://www.spc.noaa.gov@evil.test/`), and the exact-hostname check happens to catch that
particular payload — but nothing in the suite records which layer is doing the work, which is
the same "asserting only that *some* refusal happened" weakness `kmz-decompression-bomb-is-refused`
was rewritten to eliminate.

**Fix:** add a table-driven scenario calling `helper.normalizeAdvisoryUrl(input, "www.spc.noaa.gov")`
over `[http→https upgrade, exact host, lookalike host, userinfo, explicit port, non-http scheme,
relative, empty, non-string]` and asserting the exact `null`/normalized result for each. That
also makes the export's own justification true.

---

### WR-07: Three KMZ / listing security controls can each be deleted with the suite green

**File:** `node_helper.js:877-879` (32-entry cap), `node_helper.js:883-886` (zip-slip entry name), `node_helper.js:424` (MPD filename re-validation)

**Issue:** Individually mutated, each leaves 48 passed / 0 failed:

- `if (entries.length > 32) throw …` — deleted, green.
- `if (name.includes("..") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) throw …` — deleted, green.
- `if (!MPD_FILENAME_PATTERN.test(filename)) continue;` — deleted, green.

All three are documented as deliberate hardening against a remote, attacker-influenceable
archive/listing, and `extractSoleKmlEntry`'s own doc comment (node_helper.js:864-872) advertises
the first two as guarantees. They currently hold only because nobody has edited them.

**Fix:** three assertions inside the existing `kmz-decompression-bomb-is-refused` scenario
(the fixture builder `makeKmzBuffer` already gives you everything needed):

```js
const many = makeKmzBuffer(Object.fromEntries(
  Array.from({ length: 33 }, (_, i) => [`f${i}.txt`, "x"]).concat([["doc.kml", "<kml/>"]])));
mustThrow(() => helper.extractSoleKmlEntry(many), /too many entries/);
const slip = makeKmzBuffer({ "../../etc/evil.kml": "<kml/>" });
mustThrow(() => helper.extractSoleKmlEntry(slip), /unsafe entry name/);
```
plus one `wpc-mpd-listing` case whose anchor text passes `ANCHOR_RE` but not
`MPD_FILENAME_PATTERN`.

---

### WR-08: No lockfile, no `engines`, and the `npm ci` both the harness and the runner prescribe cannot run

**File:** `package.json:15-29`, `scripts/probe-lib/module-stubs.js:292`, `scripts/probe-payload-resilience.js:3689`

**Issue:** Verified against this repo:

- No `package-lock.json` or `npm-shrinkwrap.json` is tracked (`git ls-files` shows none, and
  `.gitignore` lists only GSD pause artifacts). `pnpm-lock.yaml` exists in the working tree but
  is untracked **and not ignored** — a `git add -A` commits it, and would also commit
  `node_modules/`, which `.gitignore` likewise does not list.
- `npm ci` fails here with `EUSAGE: The npm ci command can only install with an existing
  package-lock.json`. Both the harness's error text ("Run npm ci.") and the runner's
  `REMEDIATE:` line instruct a user to run a command that cannot succeed — precisely in the
  situation where the suite has just SKIPPED scenarios and the operator most needs the
  instruction to work.
- `npm audit` is likewise unusable (`ENOLOCK`).
- No `engines` field.

This also undercuts the adm-zip pin's stated purpose. `"adm-zip": "0.5.16"` is exact, but
`@turf/turf`, `@tmcw/togeojson`, `@xmldom/xmldom`, `node-fetch` and `xpath` all float on `^`,
and with no lockfile every transitive dependency floats too. Meanwhile adm-zip's current
`latest` is **0.6.0**, so the exact pin is already a security-patch blind spot on the single
dependency in the tree that parses attacker-supplied archives — and there is no audit path to
notice.

**Assessment of the exact pin as a tradeoff:** the pin itself is the right call, because
`kmz-decompression-bomb-is-refused` asserts on `adm-zip`'s specific `Cannot create a Buffer
larger than` message, and a silent minor bump that changed the clamp would promote a documented
dead line to load-bearing. But a pin without a lockfile, without `engines`, and without a
working `npm audit` is a pin that only *looks* like supply-chain discipline.

**Fix:** commit `package-lock.json`; add `node_modules/` and the unused `pnpm-lock.yaml` to
`.gitignore` (or commit one lockfile and delete the other); add `"engines": { "node": ">=20" }`;
add `"scripts": { "probe": "node scripts/probe-payload-resilience.js" }`; and record the
adm-zip pin's review cadence next to the pin rather than only in node_helper.js:924-930.

---

### WR-09: The adm-zip inflation clamp is also gated on `process.versions.node >= 15`, which nothing states and nothing enforces

**File:** `node_helper.js:887-912`, `node_helper.js:914-930`; `node_modules/adm-zip/methods/inflater.js:1-5`

**Issue:** The comments correctly identify `expectedLength > 0` as the switch that disables the
clamp. They omit the other half of the same expression:

```js
const version = +(process.versions ? process.versions.node : "").split(".")[0] || 0;
const option = version >= 15 && expectedLength > 0 ? { maxOutputLength: expectedLength } : {};
```

On Node < 15 the clamp is **never** applied regardless of the declared size, so the entire
"declaring a small size buys a refusal from zlib, not an unbounded inflation" argument
(node_helper.js:890-892) does not hold, and `extractSoleKmlEntry`'s post-read length check —
documented as unreachable — becomes reachable only *after* the bomb has been fully materialised,
which is the one moment it is useless on a Pi. There is no `engines` field (WR-08) and no
runtime assertion, so nothing prevents that deployment.

**Fix:** add `"engines": { "node": ">=20" }`, amend the comment at node_helper.js:890-892 to
state both conditions, and consider a one-line load-time assertion in `extractSoleKmlEntry`'s
module scope so an unsupported runtime is loud rather than silently unprotected.

---

### WR-10: The entire proximity-weighting feature is exercised by zero scenarios, and the turf stub makes it untestable as written

**File:** `node_helper.js:1225-1284`, `node_helper.js:1544-1552`, `node_helper.js:1741-1749` (and six sibling call sites); `MMM-SPCOutlook.js:157-198`, `MMM-SPCOutlook.js:364-392`; `scripts/probe-lib/module-stubs.js:84-88`

**Issue:** `grep -c "proximityWeighting: true"` over the probe returns **0**; so does
`computeProximity|proximityBadge|hasRenderableProximity|nextTier`. `computeProximity`,
`deriveLinesIfMissing`, every `turf.polygonToLine` call site, the `polys`/`lines` cache-entry
shape, and roughly 40 lines of frontend badge rendering are executed by no scenario. This is a
user-facing feature with its own dedicated debug artifact in `.planning/debug/` and a
regression history (`day2-none-still-displays`, `turf-multilinestring-input`).

It is also untestable in the current harness: `turfStub.pointToLineDistance` returns a constant
`999`, well outside the 40 km cutoff, so `computeProximity` returns `null` for every input by
construction. The stub comment states this as a feature ("proximity math never perturbs a
scenario's expected values") — which is right for the other 48 scenarios and is exactly what
blocks a 49th.

**Fix:** make the stub's distance overridable the way `pointInPolygon` already is
(`pointToLineDistance: (...args) => turfStub.lineDistance(...args)` with a default of `999`),
add `pointToLineDistance` to `TURF_DEFAULTS`, then add one backend scenario
(`proximityWeighting: true`, a higher-tier polygon at ~20 km → `{ value, nextTier }`) and one
frontend scenario asserting the badge text and the `PROX_MIN_WEIGHT` noise floor.

---

### WR-11: `resetHelper`'s `Object.assign` cannot remove properties a scenario ADDS, contradicting the comment that says it needs no maintenance

**File:** `scripts/probe-lib/module-stubs.js:196-235`

**Issue:** The comment at lines 199-202 argues the curated seam list was wrong because
hand-maintained lists drift, and concludes: "A shallow copy of the whole surface needs no
maintenance and cannot drift." `Object.assign(helper, originals)` restores every seam a
scenario **overwrote**, but silently keeps every property a scenario **added** — `ORIGINAL_SEAMS`
has no key for it, so there is nothing to assign back.

`sendSocketNotification` is exactly such a property: `nodeHelperStub.create` returns the raw
object literal, so the real helper has no `sendSocketNotification` member at all, and the two
scenarios that drive `socketNotificationReceived` add one and then hand-`delete` it in a
`finally` (probe lines 3392, 3543). That is the hand-maintained cleanup the comment says is
unnecessary, and `harness-leak-check-resethelper-restores-every-seam` cannot catch an omission
because it only dirties two members that already exist.

**Fix:**

```js
function resetHelper(helper) {
  const originals = ORIGINAL_SEAMS.get(helper);
  if (originals) {
    for (const key of Object.keys(helper)) {
      if (!Object.prototype.hasOwnProperty.call(originals, key)) delete helper[key];
    }
    Object.assign(helper, originals);
  }
  Object.assign(turfStub, TURF_DEFAULTS);
  helper.start();
}
```

(`start()` runs after, so its own fields are re-established.) Then extend the leak-check
scenario to add a brand-new member and assert it is gone, and drop the two manual `delete`s.

---

### WR-12: `new ZIP(buffer)` materialises every central-directory entry before the 32-entry cap is consulted

**File:** `node_helper.js:874-879`

**Issue:** `extractSoleKmlEntry` refuses an archive with more than 32 entries — but only after
`new ZIP(buffer)` and `getEntries()` have already parsed the whole central directory.
`adm-zip/zipFile.js` bounds `diskEntries` only by `inBuffer.length / CENHDR` (46 bytes), so an
8 MB body (the `ADVISORY_MAX_BODY_BYTES` ceiling) can legitimately declare ~180 000 entries and
adm-zip will allocate a `ZipEntry` object plus name/extra/comment slices for each before
`extractSoleKmlEntry` gets a word in. Multiplied by `ADVISORY_MAX_CANDIDATES` = 60 fetches per
poll, on a Raspberry Pi, from URLs a remote document chose — the same threat model the
surrounding hardening was written against.

**Fix:** read the declared entry count before constructing the reader, or lower the archive
ceiling for the advisory path:

```js
extractSoleKmlEntry(buffer){
  // The entry cap has to bind BEFORE the central directory is parsed: adm-zip bounds the
  // entry count only by buffer length / 46, so an 8 MB body can declare ~180k entries.
  if (buffer.length > KMZ_MAX_ARCHIVE_BYTES) {  // e.g. 1 MB; live samples are ~3 KB
    throw new Error(`KMZ downloaded is ${buffer.length} bytes, beyond the archive bound`);
  }
  const ZIPper = new ZIP(buffer);
  ...
```

---

### WR-13: Remote advisory label and hazard-type text reach the DOM with no length bound

**File:** `node_helper.js:1102-1110`, `MMM-SPCOutlook.js:350-363`

**Issue:** `extractMpdField` bounds only the *input* CDATA at 512 KB; the captured
`m[1].trim()` is unbounded within it, and `MPD_FILENAME_PATTERN`'s `(\d+)` fallback number is
likewise unbounded. `PRODUCT_REGISTRY.mpd.toEntry` concatenates it into `label`, and the
frontend appends it to `wrapper.innerHTML` with no cap (D-07 explicitly forbids capping the
*count* of advisories, which is a different question from capping the *length* of one). The text
is correctly escaped, so this is not XSS — but a malformed or hostile MPD renders a
half-megabyte string into the mirror and takes the display with it, on the module the user
relies on for severe-weather awareness.

**Fix:** truncate at the parse boundary, where the provenance is visible:

```js
const MPD_FIELD_MAX_CHARS = 120;   // live MPDNumber is 4 chars, MPDType ~40
return m ? m[1].trim().slice(0, MPD_FIELD_MAX_CHARS) : null;
```

---

## Info

### IN-01: `buildArcGisQuery` is exported but has no consumer outside its own module

**File:** `productRegistry.js:243`

**Issue:** `module.exports = { buildArcGisQuery, daySpanOf, MPD_FILENAME_PATTERN, PRODUCT_REGISTRY }`.
The probe imports only `PRODUCT_REGISTRY` and `daySpanOf`; node_helper imports only
`PRODUCT_REGISTRY` and `MPD_FILENAME_PATTERN`. `buildArcGisQuery` is reached only through each
row's own `buildUrl` closure.

**Fix:** either drop it from the export list, or add the direct scenario its argument validation
(`layerId` non-negative integer, `baseUrl` host allowlist) currently lacks — it is a URL-construction
allowlist and deserves the same treatment WR-06 asks for on `normalizeAdvisoryUrl`.

---

### IN-02: Stale comment claims `extractSoleKmlEntry` does not exist yet

**File:** `scripts/probe-payload-resilience.js:1827-1829`

**Issue:** "extractSoleKmlEntry does not exist in node_helper.js yet (it lands in a later plan)
— this scenario proves the KMZ layer itself, opening the archive with the same real adm-zip".
It has existed since plan 15-05 (node_helper.js:874). A future reader reasonably concludes the
scenario's `new RealZip(fetched)` detour is still necessary.

**Fix:** update the comment to say why the scenario opens the archive directly *now* (it pins
`@tmcw/togeojson`'s description shape independent of `extractSoleKmlEntry`'s entry selection,
which `kmz-decompression-bomb-is-refused` covers separately).

---

### IN-03: The generic `ADVISORY_MAX_CANDIDATES` cap in `_runKmlAdvisoryRow` is now unreachable

**File:** `node_helper.js:524-538`

**Issue:** Both shipped strategies truncate to exactly `ADVISORY_MAX_CANDIDATES` themselves, so
`candidates.length > ADVISORY_MAX_CANDIDATES` is never true and the `anyStale = true` inside it
never runs. The comment says so and keeps it as "the backstop for a future strategy", which is a
defensible call — but it is currently dead code that no mutation can turn red, sitting next to a
`Log.error` that can never fire.

**Fix:** no change required; if kept, consider a comment marking it explicitly unreachable in the
same style as node_helper.js:914-930's post-read check, which does this well.

---

### IN-04: `npm start` runs a script that cannot work, and the probe suite has no npm script

**File:** `package.json:6-8`

**Issue:** `"start": "node node_helper.js"` executes `require("node_helper")`, a module supplied
by the MagicMirror host and absent from `dependencies` — running it outside MagicMirror throws
`MODULE_NOT_FOUND` immediately. Meanwhile the 3701-line probe suite that every plan in this
phase treats as the verification gate has no entry point in `package.json` at all; it is invoked
only by path.

**Fix:** replace with `"probe": "node scripts/probe-payload-resilience.js"` and drop `start`.

---

### IN-05: ESLint is a declared devDependency with no configuration file

**File:** `package.json:24-29`

**Issue:** `eslint`, `@eslint/js`, `globals` and `typescript-eslint` are all declared, but there
is no `eslint.config.js`/`.mjs` and no `.eslintrc*` anywhere in the tree, so `npx eslint .`
cannot run. `.planning/codebase/CONVENTIONS.md` recorded this same gap on 2026-03-04 ("ESLint is
included but not actively configured") and it is unchanged five phases later, while the file
count under review has grown past 6 000 lines.

**Fix:** add a minimal flat config (`@eslint/js` recommended + `globals.node` for the helper and
`globals.browser` for the frontend) and an `"lint"` script; several findings above
(unused exports, an unreachable branch) are things a linter would have surfaced for free.

---

## Convention

_The shared `gsd-tools.cjs verify conventions` rule packs were not available in this environment
(`CLAUDE_PLUGIN_ROOT` unset and no plugin cache found), so no findings are emitted from them.
The items below are derived at review time from `.planning/codebase/CONVENTIONS.md` and from the
dominant style in the files under review. All are advisory and none gates a merge._

### CV-01: `.gitignore` omits `node_modules/`

**File:** `.gitignore`

**Deviation:** `git status` reports `?? node_modules/` and `?? pnpm-lock.yaml` — both untracked
and both un-ignored, in a repo whose only `.gitignore` entries are GSD pause artifacts.
**Convention:** every Node project in this stack (per `.planning/codebase/STACK.md`) keeps
`node_modules` out of version control.
**Suggested fix:** add `node_modules/` to `.gitignore`, and either commit or ignore the lockfile
(see WR-08).

### CV-02: `helper._products` is set to partial toggle literals in 30+ scenarios, a shape the production path never produces

**File:** `scripts/probe-payload-resilience.js` (e.g. lines 888, 1019, 1235, 1653)

**Deviation:** `helper._products = { showExcessiveRain: true }` omits the other three flags,
whereas `_productToggles()` always emits one key per registry row.
**Convention:** node_helper.js:189-195 establishes the registry-derived toggle map as the single
shape; assertPayloadIntact was rewritten (probe lines 764, 802) to be registry-driven for exactly
this reason.
**Suggested fix:** route these through a `toggles({ showExcessiveRain: true })` helper that calls
`helper._productToggles(...)`, so a Phase 16/17 row is covered without touching 30 literals.

### CV-03: `getDom` mixes `innerHTML` string concatenation with a `textContent` branch

**File:** `MMM-SPCOutlook.js:258-262`, `MMM-SPCOutlook.js:456-458`

**Deviation:** the error branch uses `wrapper.textContent`, every other branch builds an
`innerHTML` string; `wrapper.innerHTML === contentMarker` then compares a string that may have
been produced by either mechanism.
**Convention:** the dominant style in this function is `innerHTML +=` with `escapeHtml` at every
remote-text boundary (documented at MMM-SPCOutlook.js:199-207).
**Suggested fix:** use `escapeHtml` + `innerHTML` in the error branch too, so the
`contentMarker` comparison has one mechanism to reason about — and note the probe's DOM stub
(`module-stubs.js:259`) already returns a plain object with both fields, so `renderDom`'s
`innerHTML || textContent` fallback exists solely to paper over this split.

---

_Reviewed: 2026-08-25T00:59:14Z_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep — 25 mutation experiments run against an isolated copy of the tree; adm-zip 0.5.16 source read directly_
