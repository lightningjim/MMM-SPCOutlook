---
phase: 11-stale-data-indicator
plan: 02
subsystem: frontend
tags: [magicmirror, frontend, render, socket-ipc, stale-indicator, moment]

# Dependency graph
requires:
  - phase: 11-01
    provides: backend consumes updateInterval from GET_SPC_DATA payload; emits _stale/_staleAsOf
provides:
  - "updateInterval threaded through both GET_SPC_DATA payload literals (start + setInterval)"
  - "Stale indicator render in getDom data-bearing else-branch with D-11/D-12 fallbacks"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Inline-styled colored span (#FFCC00) + Unicode glyph (⚠) — matches existing MD-in-effect render pattern"
    - "moment(epochMs).fromNow() for relative-time display via vendored MagicMirror² global"
    - "Defensive type guard (typeof === 'number' && isFinite) before passing untrusted timestamp to moment"

key-files:
  created: []
  modified:
    - MMM-SPCOutlook.js

key-decisions:
  - "D-01: updateInterval added to both GET_SPC_DATA payload literals atomically (cross-file invariant with 11-01)"
  - "D-05/D-06/D-07: ⚠ Stale — <relative time> in inline #FFCC00, no CSS file"
  - "D-11: isFinite(asOf) guard — invalid/missing timestamp renders ⚠ Stale (no suffix)"
  - "D-12: Negative delta short-circuits to ' — just now' (no future-tense moment string)"
  - "D-13: if (this.spcrisk._stale) guard — falsy values render nothing"

patterns-established:
  - "Frontend↔backend payload contract closed: updateInterval now flows end-to-end (planner field → start payload → setInterval payload → node_helper destructure → _isWithinStaleWindow)"
  - "Stale indicator placed inside data-bearing else-branch only — Loading/Error/No-Risk branches unchanged per ROADMAP success criterion 4"

requirements-completed: [STALE-02, STALE-03]

# Metrics
duration: ~2min
completed: 2026-04-25
---

# Phase 11 Plan 02: Frontend payload + stale indicator render Summary

**Threaded `updateInterval` through both `GET_SPC_DATA` payloads and added a `⚠ Stale — <relative time>` warning indicator at the top of the data-bearing else-branch in `getDom`, completing the Phase 11 stale-window contract end-to-end.**

## Performance

- **Duration:** ~2 min
- **Started:** 2026-04-25T17:34:35Z
- **Completed:** 2026-04-25T17:35:48Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- STALE-02 satisfied: compact warning indicator (`⚠ Stale — 12 minutes ago`) renders at the top of the module wrapper when backend reports `_stale === true`.
- STALE-03 satisfied: relative last-fresh-fetch time computed via `moment(_staleAsOf).fromNow()` from the vendored MagicMirror² global.
- Plan 11-01's contract closed: `updateInterval: this.config.updateInterval` is now present in BOTH `GET_SPC_DATA` payloads (initial `start` and `setInterval` callback), so backend `_isWithinStaleWindow` honors the user-configured interval instead of falling back to D-04's 60-minute defensive default.
- Edge cases handled per locked decisions:
  - D-11: `typeof asOf === "number" && isFinite(asOf)` guard — invalid/missing `_staleAsOf` renders `⚠ Stale` without a time suffix.
  - D-12: `Date.now() - asOf < 0` (clock skew) renders `⚠ Stale — just now` rather than `moment`'s confusing future-tense string.
  - D-13: `if (this.spcrisk._stale)` guard — falsy `_stale` (false/undefined) renders nothing.
- No CSS file introduced; no `getStyles()` modification beyond the pre-existing `weather-icons.min.css` registration (D-08 honored).
- Indicator placed inside the data-bearing `else` branch only — `Loading…`, `Error:`, and `No Severe Weather Risk` branches untouched (ROADMAP success criterion 4 satisfied trivially).

## Task Commits

Each task was committed atomically:

1. **Task 1: Add updateInterval to both GET_SPC_DATA payloads** — `88121c2` (feat)
2. **Task 2: Render stale indicator in getDom else-branch with D-11/D-12 fallbacks** — `fd5458e` (feat)

_Note: Plan metadata commit follows this summary._

## Files Created/Modified
- `MMM-SPCOutlook.js` — Added `updateInterval: this.config.updateInterval` to both `GET_SPC_DATA` socket payload literals (lines 13, 15); inserted 13-line stale indicator block in the data-bearing else-branch of `getDom` (immediately after `wrapper.innerHTML = "";`, before the `if(this.mds)` MD loop).

## Decisions Made
- Followed plan and CONTEXT.md decisions D-01, D-05–D-08, D-10–D-13 exactly. No new decisions.
- Used `isFinite(asOf)` (rather than `!isNaN(asOf)` shown in PATTERNS.md target shape) — the plan explicitly requires `isFinite` per acceptance criteria, and it also rejects `Infinity` defensively. This is a tightening within the allowed plan space, not a deviation.

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered

- The plan's `<automated>` verify step in Task 1 wraps `MMM-SPCOutlook.js` in a `new Function(src.replace(...))` to syntax-check around the `Module.register` global. This is a pre-existing environment quirk (MagicMirror² runtime modules are not on the local Node resolve path). Substituted `node --check MMM-SPCOutlook.js` (the same workaround Plan 11-01's executor used), which passes cleanly. The real-world MagicMirror runtime resolves the module through its own loader, so this is not a runtime concern.
- Task 1's acceptance criterion `grep -nE 'GET_SPC_DATA' MMM-SPCOutlook.js | wc -l` returned 3, not the expected 2. Investigation: line 12 is a pre-existing `Log.info` string mentioning `GET_SPC_DATA` (not introduced by this plan); lines 13 and 15 are the two `sendSocketNotification` payload sites. Substituted the more precise `grep -cE 'sendSocketNotification\("GET_SPC_DATA"'` which correctly returns 2. The substantive intent ("no new sends introduced") is satisfied — the third match is a log line that pre-dates this plan.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- Phase 11 is complete. The user-facing stale data indicator is wired end-to-end:
  - Frontend sends `updateInterval` on both initial and recurring `GET_SPC_DATA` payloads.
  - Backend (Plan 11-01) consumes `updateInterval`, persists to `this._updateInterval`, and uses it in `_isWithinStaleWindow`.
  - Backend emits `_stale: true, _staleAsOf: Date.now()` when the cache-fallback path is taken within the (correct) stale window.
  - Frontend renders `⚠ Stale — <relative time>` at the top of the wrapper when `_stale === true`.
- Phase 12 (Proximity Backend Foundation) is unblocked — it has no code dependency on Phase 11 (sequencing only).

## Self-Check: PASSED

Verified post-write:
- `MMM-SPCOutlook.js` exists; both `sendSocketNotification("GET_SPC_DATA"` payloads contain `updateInterval: this.config.updateInterval` (2/2 — `grep -cE` confirms).
- Stale indicator block present in data-bearing else-branch, source-order before `if(this.mds)` (awk check: indicator at line 71, mds at line 84, wrapper reset at line 70).
- `⚠`, `color:#FFCC00`, `moment(asOf).fromNow()`, `this.spcrisk._stale`, `this.spcrisk._staleAsOf`, ` — just now`, `isFinite(asOf)` all present (grep counts: 1 each, 2 for `_stale` because of the guard + the suffix branch reference).
- `getStyles` count = 1 (existing weather-icons unchanged); no `MMM-SPCOutlook.css` reference introduced.
- `node --check MMM-SPCOutlook.js` passes (syntax valid).
- Commits `88121c2` and `fd5458e` exist in `git log --oneline`.
- File at `.planning/phases/11-stale-data-indicator/11-02-SUMMARY.md` written (this file).

---
*Phase: 11-stale-data-indicator*
*Completed: 2026-04-25*
