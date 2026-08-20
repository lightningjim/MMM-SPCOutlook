---
phase: 14-foundation-wpc-excessive-rainfall-outlook
plan: 06
subsystem: testing
tags: [probe, module-resolution, offline-test, node-helper, product-registry]

# Dependency graph
requires:
  - phase: 14-foundation-wpc-excessive-rainfall-outlook (plans 14-01 through 14-05)
    provides: node_helper.js ERO fetch/evaluate loop, productRegistry.js excessiveRain row, CR-01 gap identified by 14-VERIFICATION.md
provides:
  - scripts/probe-lib/module-stubs.js — dependency-free Module._resolveFilename patch that lets node_helper.js load and run start() with zero third-party packages installed
  - scripts/probe-payload-resilience.js — six-scenario offline probe reproducing CR-01 (payload collapse to `{ error }`) with a committed RED baseline
affects: [14-07]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Module._resolveFilename interception to stub third-party requires without touching node_modules or source files"
    - "fetchGeoJsonCached replacement as the single I/O seam for offline scenario probes"

key-files:
  created:
    - scripts/probe-lib/module-stubs.js
    - scripts/probe-payload-resilience.js
  modified: []

key-decisions:
  - "Golden snapshot (GOLDEN_DAY1, GOLDEN_FIRE_WEATHER) captured from an actual run against unmodified node_helper.js, not hand-authored"
  - "SPC route matchers in scenario 6 use the full https://www.spc.noaa.gov URLs (read from node_helper.js line 472/744) rather than filename suffixes, so the probe never touches the network yet still contains the literal URL substrings the acceptance grep expects"

patterns-established:
  - "Product-agnostic probe harness: adding a Phase 15-17 registry row means adding one scenario object to scripts/probe-payload-resilience.js, no loader changes"

requirements-completed: [CFG-01, CFG-02, ERO-01]

# Metrics
duration: 5min
completed: 2026-08-19
---

# Phase 14 Plan 06: Offline Payload-Resilience Probe Summary

**Committed, dependency-free Node probe (`scripts/probe-lib/module-stubs.js` + `scripts/probe-payload-resilience.js`) that reproduces CR-01 offline in one command — exit 1, three named failing scenarios, zero network calls, zero installed packages.**

## Performance

- **Duration:** ~5 min (task execution; excludes context-loading time)
- **Started:** 2026-08-19T21:24:00-05:00 (approx, first commit 21:26)
- **Completed:** 2026-08-19T21:29:12-05:00
- **Tasks:** 2 completed
- **Files modified:** 2 created, 0 existing files touched

## Accomplishments
- Built a `Module._resolveFilename` patch that lets `node_helper.js` load and run `start()` with zero third-party packages installed — proven both in-tree and inside a `git archive` export with no `node_modules`
- Built a six-scenario probe that reproduces CR-01 (ArcGIS error-shaped HTTP-200 body collapsing the entire `getSpcOutlook` payload to `{ error }`) offline, with a committed RED baseline
- Captured a real, non-hand-authored golden snapshot for the well-formed SPC baseline scenario, giving plan 14-07 a byte-comparable regression gate

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the dependency-free node_helper loader (scripts/probe-lib/module-stubs.js)** - `5bfc95a` (feat)
2. **Task 2: Build the six-scenario payload-resilience probe and capture the pre-fix RED baseline** - `2afd3d5` (feat)

## Files Created/Modified
- `scripts/probe-lib/module-stubs.js` - Stubs `node_helper`, `logger`, `@turf/turf`, `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson`, and `xpath` via a patched `Module._resolveFilename`; exports `installStubs`, `loadNodeHelper`, `resetHelper`, `resetLogs`, `turfStub`, `logCalls`
- `scripts/probe-payload-resilience.js` - Six named scenarios (`ero-arcgis-error-body`, `ero-fetch-throws`, `ero-malformed-feature`, `ero-wellformed-slgt`, `ero-toggle-off`, `spc-wellformed-baseline`), a `fetchGeoJsonCached` route stubbing helper, `assertPayloadIntact` contract checker, and a golden snapshot for the well-formed SPC path

## Decisions Made
- Golden snapshot constants (`GOLDEN_DAY1`, `GOLDEN_FIRE_WEATHER`) were captured verbatim from a real `node scripts/probe-payload-resilience.js` run against the unmodified pre-fix `node_helper.js`, per the plan's explicit prohibition on hand-authoring them
- Scenario 6's route matchers use the full `https://www.spc.noaa.gov/...` URL strings (not filename suffixes) so the "probe never touches the network" acceptance grep (`https?://(www\.spc|mapservices)` count > 0, sourced only from route-matching substrings, never from an actual `fetch(`/`require("node-fetch")` call) is unambiguously satisfied while still keeping all I/O severed through the replaced `fetchGeoJsonCached`

## Deviations from Plan

None - plan executed exactly as written. No source file (`node_helper.js`, `productRegistry.js`, `MMM-SPCOutlook.js`, `package.json`) was read-written; both new files are additive.

## RED Baseline (required by plan `<output>`)

Command: `node scripts/probe-payload-resilience.js`

Verbatim stdout:
```
FAIL ero-arcgis-error-body: payload collapsed to { error }: TypeError: Cannot read properties of undefined (reading 'forEach')
FAIL ero-fetch-throws: payload collapsed to { error }: Error: simulated fetchGeoJsonCached failure
FAIL ero-malformed-feature: payload collapsed to { error }: TypeError: Cannot read properties of null (reading 'LABEL')
PASS ero-wellformed-slgt
PASS ero-toggle-off
PASS spc-wellformed-baseline
PROBE RESULT: 3 passed, 3 failed
```

Exit code: `1`

This matches the plan's expected pre-fix outcome exactly — no discrepancy to flag. Plan 14-07's fix must turn `ero-arcgis-error-body`, `ero-fetch-throws`, and `ero-malformed-feature` GREEN without disturbing the three scenarios already passing.

## Golden Snapshot (required by plan `<output>`)

Captured from the `spc-wellformed-baseline` scenario's real run against the unmodified pre-fix `node_helper.js` (same run as the RED baseline above). Plan 14-07's regression gate depends on these two constants remaining byte-identical unless a change is an intentional, reviewed diff:

```
GOLDEN_DAY1 = '{"risk":"SLGT","text":"Slight","color":"f7f690","probRisk":false,"torRisk":0,"torCig":0,"hailRisk":0,"hailCig":0,"windRisk":0,"windCig":0}'

GOLDEN_FIRE_WEATHER = '{"day1Risk":0,"day1Text":"None","day2Risk":0,"day2Text":"None","day3Risk":0,"day3Text":"None","day4Risk":0,"day4Text":"None","day5Risk":0,"day5Text":"None","day6Risk":0,"day6Text":"None","day7Risk":0,"day7Text":"None","day8Risk":0,"day8Text":"None"}'
```

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- Plan 14-07 has a re-runnable, offline RED gate (`node scripts/probe-payload-resilience.js`, currently exit 1) to fix against and a golden snapshot to avoid regressing the working SPC path
- The harness is product-agnostic: Phases 15-17 add one scenario object per new registry row, reusing `loadNodeHelper()`/`resetHelper()`/`installFetch()`/`assertPayloadIntact()` unchanged
- No blockers

---
*Phase: 14-foundation-wpc-excessive-rainfall-outlook*
*Completed: 2026-08-19*

## Self-Check: PASSED

- FOUND: scripts/probe-lib/module-stubs.js
- FOUND: scripts/probe-payload-resilience.js
- FOUND: .planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-06-SUMMARY.md
- FOUND: 5bfc95a (Task 1 commit)
- FOUND: 2afd3d5 (Task 2 commit)
- FOUND: 2ee21b4 (SUMMARY commit)
