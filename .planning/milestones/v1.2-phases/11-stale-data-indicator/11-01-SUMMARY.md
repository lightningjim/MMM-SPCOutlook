---
phase: 11-stale-data-indicator
plan: 01
subsystem: backend
tags: [magicmirror, node_helper, cache, socket-ipc, stale-window]

# Dependency graph
requires:
  - phase: prior
    provides: existing fetchGeoJsonCached + _stale/_staleAsOf emission contract
provides:
  - "_isWithinStaleWindow(timestamp, intervalMinutes) signature with explicit interval parameter"
  - "this._updateInterval persistence in node_helper, sourced from GET_SPC_DATA payload"
  - "Defensive 60-minute fallback with one-shot info log when payload omits updateInterval"
affects: [11-02-stale-indicator-frontend]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Thread frontend config through socket payload + persist on node_helper instance field for backend reuse"
    - "One-shot info-log gating via boolean instance flag (_loggedIntervalFallback)"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "D-01: Thread updateInterval through GET_SPC_DATA payload (frontend wiring deferred to Plan 02)"
  - "D-02: _isWithinStaleWindow takes intervalMinutes as explicit parameter (not via this.config)"
  - "D-03: Cache latest interval on this._updateInterval at socketNotificationReceived time"
  - "D-04: Default to 60 minutes if updateInterval missing from payload; log once via _loggedIntervalFallback"

patterns-established:
  - "Socket-payload → instance-field persistence: backend reads frontend config via the socket payload and caches it on the instance for reuse across helper call sites"
  - "One-shot info logging via boolean flag: avoids log flooding when a misconfigured caller repeatedly omits an expected field"

requirements-completed: [STALE-01]

# Metrics
duration: ~5min
completed: 2026-04-25
---

# Phase 11 Plan 01: Backend stale-window interval fix Summary

**Corrected `_isWithinStaleWindow` to use the user-configured `updateInterval` threaded via `GET_SPC_DATA` payload, replacing the always-undefined `this.config?.updateInterval` fallback.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-04-25T17:27:00Z (approx)
- **Completed:** 2026-04-25T17:32:00Z
- **Tasks:** 1
- **Files modified:** 1

## Accomplishments
- Fixed STALE-01 latent bug: backend stale window now matches the user's configured `updateInterval` instead of silently defaulting to 60 minutes.
- New helper signature `_isWithinStaleWindow(timestamp, intervalMinutes)` with belt-and-suspenders `?? 60` parameter fallback.
- `socketNotificationReceived` now destructures `updateInterval` from payload and persists it on `this._updateInterval`; `start()` initializes the field to 60 so it is always defined before the first fetch.
- Defensive D-04 fallback: if `GET_SPC_DATA` arrives without `updateInterval`, default to 60 minutes and log once via `_loggedIntervalFallback` flag.
- Both call sites in `fetchGeoJsonCached` (network-error path and non-ok HTTP path) updated to pass `this._updateInterval` explicitly.

## Task Commits

Each task was committed atomically:

1. **Task 1: Fix _isWithinStaleWindow signature, persist interval, update all call sites** — `316ab10` (fix)

_Note: Plan metadata commit follows this summary._

## Files Created/Modified
- `node_helper.js` — Updated `start()` initializer, `socketNotificationReceived` destructure + interval-capture block, `_isWithinStaleWindow` signature, and both call sites in `fetchGeoJsonCached`.

## Decisions Made
- Followed plan and CONTEXT.md decisions D-01 through D-04 exactly. No new decisions.
- The Plan-02-side of the contract (frontend payload wiring in `MMM-SPCOutlook.js`) is deliberately out of scope here per the plan's `<scope>` directive; until Plan 02 ships, the defensive D-04 fallback keeps the backend safe (60-minute fallback with a one-shot info log).

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- `node -e "require('./node_helper.js')"` (the `<automated>` verify step) fails with `Cannot find module 'node_helper'` — but this fails identically on the pre-edit `HEAD` commit, so it is a pre-existing environment issue (the project relies on MagicMirror²'s vendored runtime, which is not on the local Node `require` resolution path). Substituted `node --check node_helper.js` (passes) to confirm the file parses cleanly. The real-world MagicMirror runtime resolves `node_helper` through its own loader, so this is not a runtime concern.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- STALE-01 backend half is complete. Plan 11-02 owns the frontend half: adding `updateInterval` to the two `GET_SPC_DATA` payload literals in `MMM-SPCOutlook.js` and rendering the stale indicator.
- Until Plan 11-02 ships, the backend silently uses the 60-minute D-04 fallback (with a one-shot info log), preserving current behavior.

## Self-Check: PASSED

Verified post-write:
- `node_helper.js` exists and contains the new `_isWithinStaleWindow(timestamp, intervalMinutes)` signature.
- Commit `316ab10` exists in `git log --oneline`.
- Both call sites in `fetchGeoJsonCached` use `this._isWithinStaleWindow(entry.timestamp, this._updateInterval)`.
- `_stale: true, _staleAsOf: Date.now()` emission lines untouched (still 2 occurrences at original locations).
- `node --check node_helper.js` passes (syntax valid).

---
*Phase: 11-stale-data-indicator*
*Completed: 2026-04-25*
