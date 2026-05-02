---
phase: 12-proximity-backend-foundation
plan: 02
subsystem: backend
tags: [magicmirror, socket-payload, config-flag, proximity]

# Dependency graph
requires:
  - phase: 11-stale-data-indicator
    provides: updateInterval frontend → backend payload threading pattern (commit 88121c2 + node_helper destructure lines 30-47)
  - phase: 12-proximity-backend-foundation/12-01
    provides: computeProximity helper at node_helper.js:140 (Plan 12-03 will call it)
provides:
  - proximityWeighting config flag in MMM-SPCOutlook.js defaults (default false)
  - proximityWeighting threaded through both GET_SPC_DATA payload sites (start + setInterval)
  - destructure of proximityWeighting in node_helper.js socketNotificationReceived
  - persistence on this._proximityWeighting with strict-true coerce (=== true)
  - default-off invariant: this._proximityWeighting === false on backend start and when payload omits the field
affects: [12-03-call-site-wiring, 13-proximity-rendering]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Frontend → backend config-flag threading via existing GET_SPC_DATA channel (mirror of Phase 11 updateInterval pattern)"
    - "Strict-true coerce (=== true) at trust boundary for boolean payload fields (mitigates T-12-03)"

key-files:
  created: []
  modified:
    - MMM-SPCOutlook.js
    - node_helper.js

key-decisions:
  - "Strict-true coerce at destructure boundary: this._proximityWeighting = proximityWeighting === true (D-11). undefined/null/0/'false'/false all resolve to false; only literal true enables the feature."
  - "Deliberate omission of _loggedProximityFallback log. updateInterval log existed because a missing interval means stale-window misconfig; proximityWeighting undefined just means 'feature off,' which is the legitimate default state. Logging on every default-off message would flood the journal."
  - "Cross-file invariant honored: both GET_SPC_DATA payload sites (start + setInterval) updated together — never one without the other."

patterns-established:
  - "Config-flag threading template: defaults entry (false) → both payload literals → backend destructure → strict-true coerce persist on this._<flag>. Reusable for future boolean config flags."

requirements-completed: [PROX-02]

# Metrics
duration: 1min
completed: 2026-04-26
---

# Phase 12 Plan 02: Proximity Weighting Config-Flag Threading Summary

**proximityWeighting boolean threaded end-to-end from frontend defaults through both GET_SPC_DATA payloads into node_helper.js with strict-true coerce, default-off, no call-site wiring (12-03's job).**

## Performance

- **Duration:** ~1 min
- **Started:** 2026-04-26T02:09:07Z
- **Completed:** 2026-04-26T02:10:14Z
- **Tasks:** 2
- **Files modified:** 2

## Accomplishments
- `proximityWeighting: false` added to MMM-SPCOutlook.js `defaults` (line 7)
- Both `GET_SPC_DATA` payload literals (lines 14, 16 — start + setInterval) carry `proximityWeighting: this.config.proximityWeighting`
- `node_helper.js` `start()` initializes `this._proximityWeighting = false` (line 27)
- `socketNotificationReceived` destructures `proximityWeighting` from payload (line 32) and persists with strict-true coerce: `this._proximityWeighting = proximityWeighting === true;` (line 42, after the existing updateInterval block, before the await calls)

## Task Commits

Each task was committed atomically:

1. **Task 1: Add proximityWeighting to MMM-SPCOutlook.js defaults + both GET_SPC_DATA payloads** — `f121d6a` (feat)
2. **Task 2: Destructure proximityWeighting in node_helper.js + persist on this._proximityWeighting** — `ed5c8a4` (feat)

**Plan metadata:** _pending docs commit (SUMMARY + STATE + ROADMAP)_

## Files Created/Modified
- `MMM-SPCOutlook.js` — defaults entry (line 7) + both payload literals (lines 14, 16)
- `node_helper.js` — start init (line 27) + destructure (line 32) + persist (line 42)

### Exact lines edited

**MMM-SPCOutlook.js:**
- Line 7: added `proximityWeighting: false` (sibling of `updateInterval: 60`, after trailing comma added)
- Line 14: appended `, proximityWeighting: this.config.proximityWeighting` to the start payload literal
- Line 16: appended `, proximityWeighting: this.config.proximityWeighting` to the setInterval payload literal

**node_helper.js:**
- Line 27: added `this._proximityWeighting = false;` (sibling of `this._updateInterval = 60;`)
- Line 32: extended destructure to `const { lat, lon, extended, updateInterval, proximityWeighting } = payload;`
- Line 42: added `this._proximityWeighting = proximityWeighting === true;` (after the updateInterval block, before the `await this.getMesoscaleDiscussion` call)

### Cross-file invariant

The "both payload sites must change together" invariant from STATE.md (v1.2 execution decisions, Phase 11 entry) is satisfied: `grep -c "proximityWeighting: this.config.proximityWeighting" MMM-SPCOutlook.js` outputs `2`. Adjacency check `updateInterval: this.config.updateInterval, proximityWeighting: this.config.proximityWeighting` matches in both literals.

### Strict-true coerce decision (D-11)

`this._proximityWeighting = proximityWeighting === true;` rejects all non-literal-true values:

| Input value          | Result  | Reason                                 |
|----------------------|---------|----------------------------------------|
| `true`               | `true`  | Only path that enables the feature     |
| `false`              | `false` | Explicit disable                       |
| `undefined`          | `false` | Frontend version mismatch / default-off |
| `null`               | `false` | Defensive against null payload         |
| `0`                  | `false` | Numeric type confusion                 |
| `1`                  | `false` | Numeric type confusion (would be truthy under `Boolean()`) |
| `"true"`             | `false` | String type confusion                  |
| `"false"`            | `false` | String type confusion (would be truthy under `Boolean()`) |
| `{}`                 | `false` | Object type confusion (would be truthy under `Boolean()`) |

This mitigates T-12-03 (Tampering) at the trust boundary: only literal `true` from a properly-typed config enables proximity computation. No tests run as part of this plan (the plan's verify block is grep-based); behavior is provable by inspection of the `=== true` operator semantics.

### Deliberate omission of _loggedProximityFallback

No log is emitted when `proximityWeighting` is undefined in the payload. Rationale (per plan body):
- `updateInterval` undefined indicates a stale-window misconfig that affects correctness — Phase 11 logged it once (latched by `_loggedIntervalFallback`) so the operator could see it.
- `proximityWeighting` undefined just means the feature is off, which is the legitimate default state for users who haven't opted in. Logging on every cold-start tick would be noise.
- D-14 §Claude's Discretion explicitly notes the proximity log is optional.

## Decisions Made

See `key-decisions` in frontmatter:
1. Strict-true coerce (`=== true`) — D-11.
2. No `_loggedProximityFallback` — operational-noise rationale above.
3. Both payload sites updated together — cross-file invariant.

All three were specified in the plan; no novel runtime decisions.

## Deviations from Plan

None — plan executed exactly as written. Both grep verifications and `node --check` passed on first edit. No bugs, no missing critical functionality, no blocking issues, no architectural surprises.

## Issues Encountered

None.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

Ready for Plan 12-03 (call-site wiring):
- `this._proximityWeighting` is available at all hazard-fetch sites in `getSpcOutlook` (read-only on the backend instance — the assignment runs before any `await` in `socketNotificationReceived`)
- `computeProximity` helper from 12-01 is at `node_helper.js:140`, no calls yet (`grep "computeProximity" node_helper.js` shows only the docstring at line 125 and the definition at line 142)
- Plan 12-03 will gate proximity calls on `if (this._proximityWeighting) { ... }` at each Day 1/2/3 hazard site

No blockers.

## Self-Check: PASSED

Verified post-write:
- FOUND: MMM-SPCOutlook.js (modified — `proximityWeighting` count = 3, `proximityWeighting: false` present, threading count = 2, adjacency match)
- FOUND: node_helper.js (modified — start init present, destructure present, strict-true coerce present, assignment count = 2, no new computeProximity calls)
- FOUND commit: f121d6a (Task 1 — frontend)
- FOUND commit: ed5c8a4 (Task 2 — backend)
- `node --check` passed both files
- Regression: `grep -c "updateInterval" MMM-SPCOutlook.js` = 3, `grep -c "this._updateInterval" node_helper.js` = 5 — Phase 11 threading unchanged

---
*Phase: 12-proximity-backend-foundation*
*Plan: 02*
*Completed: 2026-04-26*
