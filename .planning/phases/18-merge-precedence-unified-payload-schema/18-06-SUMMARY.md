---
phase: 18-merge-precedence-unified-payload-schema
plan: 06
subsystem: perf-instrumentation
tags: [perf-03, timing, cold-start, node.js, frontend]

# Dependency graph
requires:
  - phase: 18-05
    provides: the completed days/summary/sources payload shape, unaffected by this plan
provides:
  - "backendIntervalMs bracket around the existing _inFlight span in socketNotificationReceived (node_helper.js)"
  - "memberTimings extended with a single spc-inline entry covering the SPC convective + fire-weather serial chain"
  - "this._lastPollTimings helper-global (memberTimings + named slowest source), read in-process, never added to the payload"
  - "once-per-process cold-start timing summary log, guarded by _loggedColdStartTiming, no config flag"
  - "frontend module-start -> first-accepted-payload wall-clock log, guarded by _loggedFirstPayloadMs, in MMM-SPCOutlook.js"
affects: [19]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Once-per-process boolean-guarded logging (_loggedColdStartTiming / _loggedFirstPayloadMs), copying the existing _loggedIntervalFallback idiom exactly."
    - "Timing figures held on a helper-global (_lastPollTimings) read in-process rather than added to the payload, preserving PERF-02's byte-identity cache-comparison intent."

key-files:
  created: []
  modified:
    - node_helper.js
    - MMM-SPCOutlook.js

key-decisions:
  - "SPC convective and fire-weather timing is recorded as a single `spc-inline` memberTimings entry, not two per-source entries. Reading the actual code (node_helper.js) shows three chunks in file order: convective days 1-3, then fire-weather days 1-8, then convective days 4-8 (gated by `extended`) -- fire-weather sits BETWEEN the two convective ranges rather than after them. A two-key split would need to sum two disjoint code regions under one `spc-convective` key, which this file has no established idiom for; `spc-inline` covers the whole chain as one entry instead, per the plan's explicit fallback branch for genuinely interleaved code."
  - "The cold-start log fires after every non-in-flight-skipped poll's sendSocketNotification call, regardless of whether getSpcOutlook's own try succeeded or fell into its catch (which returns { error }) -- 'a result was actually sent' is read as 'sendSocketNotification was reached', not 'the outlook fetch itself succeeded'. A defensive fallback (`this._lastPollTimings || { memberTimings: {}, slowest: null }`) covers the case where the very first poll fails before _lastPollTimings is ever set."

requirements-completed: [PERF-03]

# Metrics
duration: ~25min
completed: 2026-09-05
---

# Phase 18 Plan 06: PERF-03 Timing Instrumentation Summary

**A permanent, always-on, logged-once-per-cold-start measurement of both PERF-03 figures -- the backend interval (with a per-product breakdown naming the slowest source, extended to the previously-untimed SPC/fire-weather inline chain) and the frontend module-start-to-first-accepted-payload wall clock -- shipped with local cold-start evidence captured below; the Raspberry Pi figure remains a UAT item per D-19.**

## Performance

- **Duration:** ~25 min
- **Started:** 2026-09-05T18:26:21Z (following 18-05)
- **Completed:** 2026-09-05T18:38:28Z
- **Tasks:** 3 completed
- **Files modified:** 2 (`node_helper.js`, `MMM-SPCOutlook.js`)

## Accomplishments

- `socketNotificationReceived` now brackets `t0 = this._nowMs()` immediately after the `GET_SPC_DATA` check (before the `_inFlight` guard) and computes `backendIntervalMs` immediately before `sendSocketNotification("SPC_DATA_RESULT", ...)`, reusing the existing `_inFlight` try/finally span with no new try/finally added.
- `memberTimings` (PERF-01's existing object) is seeded with a `spc-inline` entry covering the whole SPC convective + fire-weather serial chain that runs before the `Promise.allSettled` batch, so the printed object is a superset of the six batch member ids plus `spc-inline`.
- The slowest source is derived by scanning `memberTimings` for its maximum value and named explicitly, held on the new helper-global `this._lastPollTimings = { memberTimings, slowest }`, set immediately before `getSpcOutlook`'s return statement -- never added as a payload key, preserving PERF-02's byte-identity cache-comparison intent.
- A once-per-process cold-start summary (`_loggedColdStartTiming`, declared in `start()` beside `_loggedIntervalFallback`) logs four lines after the first successful `SPC_DATA_RESULT` emit: the backend interval + wall-clock-since-`_processStartMs` header, the per-product breakdown, the named slowest source, and a note that this fires once per process with no config flag. A second poll never repeats it.
- `MMM-SPCOutlook.js` captures `this._startedAtMs = Date.now()` as the first statement of `start()` and logs the module-start-to-first-accepted-payload delta once (`_loggedFirstPayloadMs`), placed AFTER every existing guard that can reject a payload (foreign-instance lat/lon, epoch change, out-of-order sequence) so a rejected payload can never consume the guard or report a figure the user never saw.
- All 91 pre-existing probe scenarios pass after every task; `git diff MMM-SPCOutlook.js` touches only `start()` and the `SPC_DATA_RESULT` branch -- `getDom()`, `buildRequestPayload()` and `resolveUpdateInterval()` are byte-unchanged.

## Task Commits

1. **Task 1: Bracket the backend interval and extend the per-product breakdown to all eight sources** - `94378da` (feat)
2. **Task 2: Log the cold-start timing summary exactly once per process** - `de64d46` (feat)
3. **Task 3: Log the frontend wall-clock figure from module start to first populated payload** - `9143705` (feat)

## Files Created/Modified

- `node_helper.js` -- backend-interval bracket (`t0`/`backendIntervalMs`) in `socketNotificationReceived`; `spcInlineStart`/`spcInlineElapsedMs` bracket around the SPC convective + fire-weather inline chain; `memberTimings` seeded with the new `spc-inline` entry; slowest-source derivation and `this._lastPollTimings` assignment before `getSpcOutlook`'s return; `_loggedColdStartTiming`/`_processStartMs` declared in `start()`; the four-line cold-start summary log guarded by `_loggedColdStartTiming`.
- `MMM-SPCOutlook.js` -- `this._startedAtMs`/`this._loggedFirstPayloadMs` declared as the first statements of `start()`; the wall-clock log guarded by `_loggedFirstPayloadMs`, placed after the foreign-instance/epoch/sequence guards in `socketNotificationReceived`'s `SPC_DATA_RESULT` branch.

## Chosen Shape: `spc-inline` vs. `spc-convective`/`spc-fire`

Read directly from `node_helper.js` (getSpcOutlook body), the SPC convective and fire-weather fetch code runs in this file order:

1. SPC convective, days 1-3 (categorical + CIG + probabilistic day-3) -- `//Day 1` through the end of the day-3 CIG block
2. Fire weather, days 1-8 -- `// Fire Weather constants` through `day8FireRisk = dayFireRisks[8];`
3. SPC convective, days 4-8 (probabilistic-only, gated by `extended`) -- the `if (extended)` block ending just before `const day4Risk = this.percToRisk(...)`

Fire-weather code sits BETWEEN the two convective code regions rather than after them -- confirmed by reading the source directly (`grep -n` for `//Day 1`, `// Fire Weather constants`, and `const day4Risk = this.percToRisk` all in one file, in that order). This is genuine interleaving, not a false alarm: attributing time correctly to `spc-convective` alone would require summing two disjoint code regions under one key, split by the fire-weather block landing in between them, and this codebase has no established idiom for that (the `Promise.allSettled` batch's own `memberTimings[m.id]` assignment is always a single contiguous `t0`-to-`finally` span per member). Per the plan's explicit fallback branch for genuinely interleaved code, this plan records a single `spc-inline` entry spanning from immediately before the SPC day-1 block begins to immediately after the fire-weather day-8 block ends (i.e., stopping at the end of chunk 2 above, per the plan's own literal boundary wording -- "immediately after the fire-weather inline block ends"). The Day 4-8 SPC probabilistic block (chunk 3, `extended`-gated) therefore falls outside this specific bracket's measured span and is not separately named in `memberTimings`; its time is still fully covered by the outer `backendIntervalMs` bracket (GET_SPC_DATA receipt to SPC_DATA_RESULT emit), so PERF-03's headline backend-interval figure is unaffected -- only the per-product breakdown's attribution of that last chunk is not broken out. Documented here as a known instrumentation gap consistent with the plan's stated end boundary, not a bug.

## Scratch Harness Evidence

All harnesses were run via `node <script>` from outside the repo (session scratchpad directory), against the real `node_helper.js`/`MMM-SPCOutlook.js` through the probe suite's `loadNodeHelper`/`resetHelper`/`loadFrontendModule`/`logCalls` seams (`scripts/probe-lib/module-stubs.js`), plus minimal local `installHttp`/`httpResponse` helpers matching the probe file's own conventions. Scripts lived under the session scratchpad directory, never inside the repo, and were not committed; the working tree carries no leftover scratch files.

### Task 1: `memberTimings` superset + named slowest (full pipeline, all routes quiet)

```
payload has 'timings' key on return object: false
_lastPollTimings: {
  "memberTimings": {
    "spc-inline": 165,
    "excessiveRain": 35,
    "winterImpact": 35,
    "hazardsOutlook": 35,
    "heatRisk": 30,
    "spcMD": 30,
    "mpd": 30
  },
  "slowest": {
    "id": "spc-inline",
    "ms": 165
  }
}
memberTimings keys: [ 'spc-inline', 'excessiveRain', 'winterImpact', 'hazardsOutlook', 'heatRisk', 'spcMD', 'mpd' ]
missing six-member ids: []
has spc-inline key: true
slowest: { id: 'spc-inline', ms: 165 }
```
`grep -c "new Date()\|Date.now()" node_helper.js` unchanged (10, matching the pre-task baseline count -- no new raw-clock read was added; every new timestamp goes through `this._nowMs()`). `grep -n "timings:"` node_helper.js -> no matches (no timing key in the payload return literal). `git diff node_helper.js` for Task 1 shows no new `try`/`finally` inside `socketNotificationReceived`.

Probe suite after Task 1: `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0.

### Task 2: cold-start block fires exactly once across two polls (verbatim log lines)

```
sent count: 2
header lines: 1 [
  'MMM-SPCOutlook: cold-start timing -- backend interval 6ms (GET_SPC_DATA received -> SPC_DATA_RESULT emitted); 6ms since process start (module-load to first result sent)'
]
breakdown lines: 1 [
  'MMM-SPCOutlook: cold-start per-product breakdown {"spc-inline":2,"excessiveRain":1,"winterImpact":1,"hazardsOutlook":1,"heatRisk":1,"spcMD":1,"mpd":0}'
]
slowest lines: 1 [ 'MMM-SPCOutlook: cold-start slowest source spc-inline (2ms)' ]
note lines: 1 [
  'MMM-SPCOutlook: cold-start timing is logged once per process start (D-18), gated by no config flag; the target-hardware (Raspberry Pi) figure is a UAT item tracked separately from this phase (D-19)'
]
PASS: header appears exactly once across two polls: true
```
`this._loggedColdStartTiming = false;` and `this._processStartMs = this._nowMs();` both appear in `start()` (`grep -n` confirmed at lines 220 and 224). `grep -c "perfLog\|config.perf" node_helper.js MMM-SPCOutlook.js` -> 0 for both files (no config flag).

Probe suite after Task 2: `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0.

### Task 3: frontend wall-clock line, rejected-then-accepted delivery (verbatim log output)

```
all log lines:
  Starting module: undefined
  SPC-Outlook: GET_SPC_DATA - 38.9,-77,undefined
  SPC Outlook: SPC_DATA_RESULT Received - [{"some":"stale"},-5,{"epoch":1,"lat":38.9,"lon":-77}]
  SPC Outlook: discarding out-of-order SPC_DATA_RESULT (seq -5 <= undefined)
  SPC Outlook: SPC_DATA_RESULT Received - [{"some":"fresh"},1,{"epoch":1,"lat":38.9,"lon":-77}]
  MMM-SPCOutlook: first accepted payload 0ms after module start (wall clock; module-start -> first accepted SPC_DATA_RESULT -> updateDom(), the practical proxy for first populated render; see node_helper.js for this measurement's backend-interval half)
  SPC Outlook: SPC_DATA_RESULT Received - [{"some":"fresh2"},2,{"epoch":1,"lat":38.9,"lon":-77}]
---
wall-clock lines count: 1
PASS: exactly one wall-clock line across reject+2-accepts: true
```
The first delivery (seq -5) is discarded by the pre-existing out-of-order guard before `this.spcrisk` is ever assigned, and produces no wall-clock line. The second delivery (seq 1) is accepted and produces the wall-clock line exactly once; a third delivery (seq 2, also accepted) does not repeat it. `grep -n "_startedAtMs" MMM-SPCOutlook.js` shows the assignment as the first statement of `start()` (line 84) and exactly one read inside `socketNotificationReceived` (line 169). `git diff MMM-SPCOutlook.js` shows exactly two hunks, one inside `start()` (lines 76-82) and one inside the `SPC_DATA_RESULT` branch after the sequence/epoch/foreign-instance guards and before `this.updateDom()` (lines 151-169) -- `getDom`, `buildRequestPayload`, and `resolveUpdateInterval` are untouched.

Probe suite after Task 3: `PROBE RESULT: 91 passed, 0 failed, 0 skipped`, exit 0.

## Decisions Made

See `key-decisions` in the frontmatter. In brief: SPC convective and fire-weather inline timing is recorded as one `spc-inline` `memberTimings` entry rather than two per-source entries, because the code is genuinely interleaved (fire-weather runs between two convective code regions, not after them); the cold-start log's "a result was actually sent" is read as "sendSocketNotification was reached" (fires even when `getSpcOutlook` itself returned `{ error }`), with a defensive fallback for the case where `_lastPollTimings` was never set because the very first poll failed before reaching it.

## Deviations from Plan

### Auto-fixed Issues

None. No bugs, missing critical functionality, or blocking issues were encountered; every deviation from a literal first draft (see the "Chosen Shape" section above) was resolved by directly reading the source and following the plan's own stated decision branches, not by an unplanned code change.

**Total deviations:** 0
**Impact on plan:** None -- executed as written, with the `spc-inline`-vs-two-keys decision resolved from the source per the plan's own explicit instruction to do so.

## Assumption Drift (advisory)

None material. The plan's initial framing ("capture `_nowMs()` before day-1 begins and after fire-weather ends, record under two keys") reads, on a literal first pass, as if it always produces two keys; the plan's own very next sentence corrects this ("measure the two spans that actually exist... record a single `spc-inline` entry" if not contiguous), and the actual source confirms the not-contiguous branch applies. This is the plan resolving its own ambiguity via its stated fallback, not a drift from an assumption the plan or CONTEXT.md fixed -- recorded here only for transparency about which branch was taken and why.

## Issues Encountered

- An early version of the Task 2 scratch harness pinned `helper._nowMs` AFTER calling `loadNodeHelper()` (which already ran `start()` under the real system clock), producing a nonsensical negative wall-clock figure purely as a test artifact of pinning the clock too late — not a product bug. Fixed by calling `resetHelper(helper)` (which re-runs `start()`) after pinning the clock, so `_processStartMs` and every later `_nowMs()` call agree on the same fixture clock. No production code was affected; this was caught and fixed entirely within the scratch harness before recording evidence.

## User Setup Required

None -- no external service configuration required.

## Next Phase Readiness

- Both PERF-03 figures (backend interval with a per-product breakdown naming the slowest source, and the frontend module-start-to-first-accepted-payload wall clock) are permanent, always-on, and logged once per process/module-start with no config flag (D-18).
- Local cold-start evidence is captured verbatim above (D-19's "verified against a LOCAL cold start" requirement). The Raspberry Pi figure remains an open milestone-close UAT item per the existing STATE.md blocker, unaffected by and not blocking this phase's completion.
- `days`/`summary`/`sources` (18-05) are unmodified by this plan; `git diff` for both files confirms no changes outside `socketNotificationReceived`'s bracket, the SPC-inline chain's bracket, `memberTimings`'s seed, the pre-return `_lastPollTimings` assignment, `start()`'s new guards, and the frontend's `start()`/`SPC_DATA_RESULT` branch.
- No blockers. `node scripts/probe-payload-resilience.js` remains at `91 passed, 0 failed, 0 skipped`.

---
*Phase: 18-merge-precedence-unified-payload-schema*
*Completed: 2026-09-05*
