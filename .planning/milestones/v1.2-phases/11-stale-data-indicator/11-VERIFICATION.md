---
phase: 11-stale-data-indicator
verified: 2026-05-03T00:00:00Z
status: human_needed
score: 4/4 success criteria verified
overrides_applied: 0
re_verification: false
note: "Retroactive verification — phase shipped 2026-04-25 before /gsd-verify-phase was part of the standard chain. Code already on main; this is a post-merge audit. Cross-references the 2026-05-03 v1.2 milestone-level UAT (`13-UAT.md`, commit `0ce81ec`) whose Test 1 (Cold Start) and Test 2 (Default-off DOM byte-identity) implicitly exercised the Phase 11 stale render block on a live MagicMirror²."
human_verification:
  - test: "Stale window honors a non-default updateInterval (e.g. updateInterval: 30) end-to-end"
    expected: "With `updateInterval: 30` configured: simulate the network-error path (e.g. drop the SPC endpoints in /etc/hosts or yank the wifi briefly). Within 29 minutes of the last successful fetch, the cache-fallback returns `_stale: false` (still within the user-configured window). After 31 minutes without a successful refresh, the next fetch attempt yields `_stale: true` and the indicator renders. Pre-fix behavior would have stayed `_stale: false` until 61 minutes."
    why_human: "Requires deliberately introducing a network failure on a running MagicMirror² Pi and observing behavior across the configured interval — cannot be reproduced statically. v1.2 UAT (13-UAT.md) did NOT exercise a non-default `updateInterval`."
  - test: "Clock-skew negative-delta path (D-12) renders ' — just now' rather than 'in X minutes'"
    expected: "With backend forced (or system clock advanced/rewound) so `_staleAsOf > Date.now()` at render time, the indicator reads `⚠ Stale — just now` — no future-tense moment string."
    why_human: "Requires either a backend stub that emits a future timestamp, or NTP-skew on the Pi. Static analysis confirms the `delta < 0` branch is reached (line 100), but the visual outcome on a live display was not exercised in v1.2 UAT."
  - test: "Invalid/missing _staleAsOf path (D-11) renders bare '⚠ Stale' with no time suffix"
    expected: "With backend forced to emit `_stale: true` but `_staleAsOf` absent, NaN, Infinity, or non-number: indicator reads exactly `⚠ Stale` (no em-dash, no time)."
    why_human: "The `typeof asOf === 'number' && isFinite(asOf)` guard at line 98 blocks the suffix branch. Behavioral simulation by this verifier passes 7/7 (undefined/null/NaN/Infinity/string all yield empty suffix), but live confirmation on a Pi is the only way to confirm browser-level rendering of the bare span. v1.2 UAT cold-start tested the indicator's normal path only."
  - test: "Stale indicator inert during Loading…/Error:/No Severe Weather Risk early branches"
    expected: "When the module is still loading, in error state, or showing 'No Severe Weather Risk', the `⚠ Stale` indicator does NOT appear (those branches are not data-bearing and have no `_stale` to inspect — by design per ROADMAP success criterion 4 + CONTEXT.md `<code_context>`)."
    why_human: "v1.2 UAT Test 1 (Cold Start) implicitly verified module boots cleanly through these branches without a stale indicator appearing, but did not deliberately force each early branch with `_stale: true` payload contamination."
---

# Phase 11: Stale Data Indicator — Verification Report

**Phase Goal:** User can tell at a glance when displayed risk data is stale, with an accurate stale window honoring their configured update interval.

**Verified:** 2026-05-03 (retroactive — phase shipped 2026-04-25)
**Status:** human_needed (4/4 automated success criteria PASS in code; live runtime sub-cases pending)
**Re-verification:** No — initial verification (this file did not previously exist)

> **Retroactive context.** Phase 11 was completed on 2026-04-25, before `/gsd-verify-phase` was incorporated into the standard plan-execute-summary-verify chain. Code is already on `main` (commits `316ab10`, `88121c2`, `fd5458e`). This audit verifies the goal post-merge against the source files. The v1.2 milestone-level UAT performed on 2026-05-03 (`.planning/phases/13-proximity-frontend-render/13-UAT.md`, commit `0ce81ec`) implicitly exercised the Phase 11 stale render path: Test 1 (Cold Start) booted the module through the indicator-bearing else-branch in `getDom`, and Test 2 (Default-off DOM byte-identity) confirmed the stale indicator continues to fire under the same conditions as v1.1. UAT did NOT exercise a non-default `updateInterval`, the clock-skew D-12 path, or the missing/invalid `_staleAsOf` D-11 path — those remain in the human_verification list below.

---

## Goal Achievement

### Observable Truths (4 ROADMAP Success Criteria)

| #   | Truth (ROADMAP Success Criterion) | Status     | Evidence                                                                                                                                                                                                                                                                                                                                       |
| --- | --------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | When the user sets a non-default `updateInterval`, the backend's stale window matches that interval (no silent 60-minute fallback). | ✓ VERIFIED | `MMM-SPCOutlook.js:14` and `:16` both include `updateInterval: this.config.updateInterval` (`grep -cF` = 2). `node_helper.js:33` destructures the field; `:41` persists it on `this._updateInterval`; `:269` and `:284` pass `this._updateInterval` into `_isWithinStaleWindow(entry.timestamp, this._updateInterval)` (`grep -cE` = 2). Helper at `:246-249` consumes `intervalMinutes` directly. The buggy `this.config?.updateInterval ?? 60` literal is gone (`grep -cE 'this\.config\?\.updateInterval'` = 0). Behavioral test of `_isWithinStaleWindow` logic by this verifier: 5/5 PASS (within/outside @ 30min, undefined fallback to 60, null fallback to 60). |
| 2   | When the backend reports `_stale === true`, a compact warning indicator is visible at the top of the module wrapper. | ✓ VERIFIED | `MMM-SPCOutlook.js:95` `if (this.spcrisk._stale)` guard inside the data-bearing else-branch (line 92). Indicator span at `:106` `<span style="color:#FFCC00">⚠ Stale...</span><br/>` is appended via `+=` immediately after the `wrapper.innerHTML = ""` reset on line 94 and BEFORE the MD-in-effect loop at `:108-112` (so it sits at the top of the wrapper). Backend emits `_stale: true, _staleAsOf: Date.now()` at `node_helper.js:835` (!extended return) and `:1018` (extended return) via the conditional spread `...(anyStale ? { _stale: true, _staleAsOf: Date.now() } : {})`. |
| 3   | The stale indicator displays a relative last-fresh-fetch time (e.g. "12 minutes ago") sourced from `_staleAsOf`. | ✓ VERIFIED | `MMM-SPCOutlook.js:103` `staleSuffix = " — " + moment(asOf).fromNow();` — uses MagicMirror²-vendored `moment` global (no `require`/`import`). `:97` reads `asOf = this.spcrisk._staleAsOf`. Defensive type guard at `:98` `typeof asOf === "number" && isFinite(asOf)` rejects undefined/NaN/Infinity/string before reaching `moment()`. D-12 fallback at `:100-101` `if (delta < 0) staleSuffix = " — just now";` short-circuits the future-timestamp case. Behavioral simulation of suffix logic by this verifier: 7/7 PASS (valid past, future delta, undefined, NaN, Infinity, string, null). |
| 4   | When the backend reports `_stale === false` (or omits it), no stale indicator is rendered. | ✓ VERIFIED | `if (this.spcrisk._stale)` guard at `MMM-SPCOutlook.js:95` short-circuits on falsy values (`false`, `undefined`, `0`, `null`, `""`, `NaN`). Indicator rendering and suffix computation only run inside the truthy branch. The indicator is also lexically scoped inside the data-bearing else-branch (line 92), so the `Loading…`/`Error:`/`No Severe Weather Risk` early branches at `:69-91` cannot render it. v1.2 UAT Test 2 (Default-off DOM byte-identity) confirmed live that the umbrella message still fires for quiet days and the stale indicator behaves identically to v1.1 baseline. |

**Score:** 4/4 truths verified

### Locked Design Decisions (D-01 through D-14)

| Decision | Status     | Evidence                                                                                                                                                                                                                                                  |
| -------- | ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D-01 — Thread `updateInterval` through `GET_SPC_DATA` payload (both `start` + `setInterval` literals) | ✓ VERIFIED | `MMM-SPCOutlook.js:14, :16` both carry `updateInterval: this.config.updateInterval`. `grep -cF 'updateInterval: this.config.updateInterval'` = 2. Cross-File Invariant per PATTERNS.md satisfied. |
| D-02 — `_isWithinStaleWindow(timestamp, intervalMinutes)` signature with explicit interval parameter | ✓ VERIFIED | `node_helper.js:246` `_isWithinStaleWindow(timestamp, intervalMinutes) { ... }`. `:247` `(intervalMinutes ?? 60) * 60 * 1000` — belt-and-suspenders parameter fallback per spec. |
| D-03 — Cache latest interval on `this._updateInterval` at `socketNotificationReceived` time | ✓ VERIFIED | `node_helper.js:41` `this._updateInterval = updateInterval;` (success path). `:39` `this._updateInterval = 60;` (defensive fallback). `:26` initializes the field to `60` in `start()` so it has a defined default before the first `GET_SPC_DATA`. |
| D-04 — Default to 60 minutes if `updateInterval` missing from payload; log once at info | ✓ VERIFIED | `node_helper.js:34-39` — `if (updateInterval === undefined)` branch. `:35-38` log-once gating via `this._loggedIntervalFallback` flag (relies on `undefined !== true`, so the first fallback both logs and sets the flag — no explicit init needed). Log message: `"MMM-SPCOutlook: GET_SPC_DATA missing updateInterval, defaulting to 60 minutes"` (matches plan spec verbatim). |
| D-05 / D-06 / D-07 — Inline icon-and-text style: `⚠ Stale — 12 minutes ago` in warning yellow `#FFCC00` | ✓ VERIFIED | `MMM-SPCOutlook.js:106` `"<span style=\"color:#FFCC00\">⚠ Stale" + staleSuffix + "</span><br/>"`. Unicode `⚠` (U+26A0) present (line 106 grep). Em-dash `—` (U+2014) used in suffix at lines `:101, :103`. |
| D-08 — Inline `style` only; no `MMM-SPCOutlook.css`, no `getStyles()` extension | ✓ VERIFIED | `getStyles` count in `MMM-SPCOutlook.js` = 1 (the pre-existing weather-icons registration at lines 29-33, unchanged). `grep -F 'MMM-SPCOutlook.css' MMM-SPCOutlook.js` returns nothing. |
| D-09 — Compute relative-time at `getDom()` time; no new `setInterval` ticking the indicator | ✓ VERIFIED | The indicator block `:95-107` runs only inside `getDom`. There is no new `setInterval` introduced in `MMM-SPCOutlook.js` (the only `setInterval` is the pre-existing `:16` data-fetch loop, unchanged). |
| D-10 — Use `moment(_staleAsOf).fromNow()` from MagicMirror² vendored global | ✓ VERIFIED | `MMM-SPCOutlook.js:103`. No `require('moment')` or `import` — uses the runtime global directly. |
| D-11 — Missing/invalid `_staleAsOf` renders `⚠ Stale` without a time suffix | ✓ VERIFIED | `MMM-SPCOutlook.js:98` `typeof asOf === "number" && isFinite(asOf)` guard. When false, `staleSuffix` stays `""` (initialized at `:96`), so the rendered string is exactly `⚠ Stale`. Behavioral test: 5/5 invalid-input cases (undefined, null, NaN, Infinity, string) yield empty suffix. Plan acceptance specified `isFinite(asOf)` rather than `!isNaN(asOf)` to also reject `Infinity` — implementation matches. |
| D-12 — Negative delta (clock skew, future timestamp) coerces to ` — just now` rather than moment's "in X minutes" | ✓ VERIFIED | `MMM-SPCOutlook.js:100-102` `if (delta < 0) { staleSuffix = " — just now"; } else { staleSuffix = " — " + moment(asOf).fromNow(); }`. The branch short-circuits BEFORE reaching `moment()`, so no future-tense string can leak through. Behavioral simulation: future timestamp → ` — just now` PASS. |
| D-13 — When `_stale` is false or omitted, render no indicator | ✓ VERIFIED | `MMM-SPCOutlook.js:95` `if (this.spcrisk._stale)` truthy guard handles all falsy values (false/undefined/0/null/empty string/NaN). |
| D-14 — Same UI path for cache-fallback and interval-bounded staleness; no `reason` field on payload | ✓ VERIFIED | Backend has only one `_stale: true, _staleAsOf: Date.now()` emission shape, used by both the network-error fallback (`node_helper.js:269-272`) and the non-ok HTTP fallback (`:284-287`). Frontend reads only `_stale`/`_staleAsOf` — no reason discrimination. |

**All 14 locked decisions verified in code.**

### Required Artifacts

| Artifact                                  | Expected                                                                              | Status     | Details                                                                                                                                                                                       |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `node_helper.js::_isWithinStaleWindow`    | Signature `(timestamp, intervalMinutes)`, ?? 60 fallback, `(Date.now() - timestamp) < intervalMs` | ✓ VERIFIED | Lines 246-249. Signature exact. `intervalMinutes ?? 60` belt-and-suspenders fallback present.                                                                                                |
| `node_helper.js::start` initializer       | `this._updateInterval = 60` set before any socket message                            | ✓ VERIFIED | Line 26 `this._updateInterval = 60;` (alongside the existing `_geoJsonCache`/`_cachedLat`/`_cachedLon` init). `_proximityWeighting = false` was added later by Phase 12 — unrelated, line 27.    |
| `node_helper.js::socketNotificationReceived` | Destructure `updateInterval` from payload + persist on `this._updateInterval` + log-once defensive fallback | ✓ VERIFIED | Lines 31-49. Destructure at `:33` (now also includes `proximityWeighting` post-Phase-12, but that's additive — `updateInterval` extraction is intact). Persistence + log-once at `:34-42`. |
| `node_helper.js` call sites (× 2)         | Both `fetchGeoJsonCached` call sites pass `this._updateInterval` as second arg       | ✓ VERIFIED | Lines 269 (network-error path) and 284 (non-ok HTTP path). `grep -cE 'this\._isWithinStaleWindow\(entry\.timestamp,\s*this\._updateInterval\)'` = 2.                                          |
| `node_helper.js` stale emission contract  | Both `getSpcOutlook` return branches emit `_stale: true, _staleAsOf: Date.now()` via conditional spread | ✓ VERIFIED | Lines 835 (!extended) and 1018 (extended). `grep -cF '_stale: true, _staleAsOf: Date.now()'` = 2 — both untouched by Phase 11 (existing contract from prior phase, consumed by Plan 11-02). |
| `MMM-SPCOutlook.js` socket payloads (× 2) | Both initial (start) and recurring (setInterval) `GET_SPC_DATA` payloads carry `updateInterval: this.config.updateInterval` | ✓ VERIFIED | Lines 14 and 16. `grep -cF 'updateInterval: this.config.updateInterval'` = 2. `grep -cE 'sendSocketNotification\("GET_SPC_DATA"'` = 2 (no new sends introduced, only field added to existing payloads). |
| `MMM-SPCOutlook.js::getDom` indicator block | 12-line render block at top of data-bearing else-branch with D-11/D-12 fallbacks | ✓ VERIFIED | Lines 95-107. Sits between `wrapper.innerHTML = ""` reset (line 94) and the `if(this.mds)` MD-in-effect loop (line 108). Source-order check: reset(94) < indicator(95) < mds(108) — confirmed in this verifier's read. |

### Key Link Verification

| From                                | To                                          | Via                                              | Status     | Details                                                                                                                                              |
| ----------------------------------- | ------------------------------------------- | ------------------------------------------------ | ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MMM-SPCOutlook.js` start payload   | `node_helper.js` socketNotificationReceived | `GET_SPC_DATA` payload field `updateInterval`    | ✓ WIRED    | `MMM-SPCOutlook.js:14` → `node_helper.js:33` destructure. Both ends agree on field name.                                                              |
| `MMM-SPCOutlook.js` setInterval payload | `node_helper.js` socketNotificationReceived | `GET_SPC_DATA` payload field `updateInterval`    | ✓ WIRED    | `MMM-SPCOutlook.js:16` → `node_helper.js:33`. Same destructure consumes both — atomic Cross-File Invariant satisfied.                                |
| `socketNotificationReceived`        | `this._updateInterval`                      | persistence `this._updateInterval = updateInterval` (or 60 fallback) | ✓ WIRED | `node_helper.js:41` (success), `:39` (fallback), `:26` (start init).                                                                                  |
| `fetchGeoJsonCached` (network error path) | `_isWithinStaleWindow`                  | `this._isWithinStaleWindow(entry.timestamp, this._updateInterval)` | ✓ WIRED | `node_helper.js:269`. Stale-true branch returns `{cachedResult, stale: true}` (`:271`) which feeds `anyStale` aggregation.                            |
| `fetchGeoJsonCached` (non-ok HTTP path) | `_isWithinStaleWindow`                    | `this._isWithinStaleWindow(entry.timestamp, this._updateInterval)` | ✓ WIRED | `node_helper.js:284`. Same pattern as network-error.                                                                                                  |
| Backend `_stale` / `_staleAsOf` emission | Frontend `getDom` indicator             | `SPC_DATA_RESULT` socket → `this.spcrisk._stale` / `._staleAsOf` | ✓ WIRED | Backend writes both fields conditionally (`node_helper.js:835`, `:1018`); frontend reads via `this.spcrisk._stale` (`MMM-SPCOutlook.js:95`) and `this.spcrisk._staleAsOf` (`:97`). Contract symmetric. |
| `getDom` indicator block            | `moment` (vendored MagicMirror² global)     | `moment(asOf).fromNow()` direct call             | ✓ WIRED    | `MMM-SPCOutlook.js:103`. No `require`/`import` — relies on host runtime as documented in CONTEXT.md D-10.                                            |
| Indicator block edge-case fallbacks | constants + `Date.now()` only               | `typeof asOf === "number" && isFinite(asOf)` guard at `:98`; negative-delta short-circuit at `:100` | ✓ WIRED | Both D-11 and D-12 fallback branches lexically reachable; behavioral simulation by this verifier confirms each branch fires for its target input. |

### Data-Flow Trace (Level 4)

| Artifact                              | Data Variable                  | Source                                                    | Produces Real Data                                                         | Status     |
| ------------------------------------- | ------------------------------ | --------------------------------------------------------- | -------------------------------------------------------------------------- | ---------- |
| `⚠ Stale [— time]` indicator span     | `this.spcrisk._stale`          | Backend conditional spread at `node_helper.js:835, :1018` based on `anyStale` | ✓ Yes — `anyStale` is set by real cache-fallback hits in `fetchGeoJsonCached` (lines 269-272, 284-287); not a static empty | ✓ FLOWING  |
| Relative-time string                  | `this.spcrisk._staleAsOf`      | Same emission sites — `Date.now()` at the moment the stale fallback was returned | ✓ Yes — real epoch milliseconds; `moment().fromNow()` consumes it          | ✓ FLOWING  |
| Stale-window decision                 | `this._updateInterval` cached on backend instance | Frontend `this.config.updateInterval` (defaulted to `60` in `MMM-SPCOutlook.js:6`) → `GET_SPC_DATA` payload → backend destructure → instance field | ✓ Yes — the very plumbing this phase exists to fix; pre-fix the value never made it past the frontend | ✓ FLOWING  |

All three data variables trace back to real runtime values, not stub/static empties.

### Behavioral Spot-Checks

| Behavior                                                | Command                                                                  | Result                                              | Status     |
| ------------------------------------------------------- | ------------------------------------------------------------------------ | --------------------------------------------------- | ---------- |
| `node --check MMM-SPCOutlook.js`                        | `node --check MMM-SPCOutlook.js`                                         | exit 0 (clean parse)                                | ✓ PASS     |
| `node --check node_helper.js`                           | `node --check node_helper.js`                                            | exit 0 (clean parse)                                | ✓ PASS     |
| Both payload sites threaded                             | `grep -cF 'updateInterval: this.config.updateInterval' MMM-SPCOutlook.js`| `2`                                                 | ✓ PASS     |
| Both call sites updated to new signature                | `grep -cE 'this\._isWithinStaleWindow\(entry\.timestamp,\s*this\._updateInterval\)' node_helper.js` | `2`                       | ✓ PASS     |
| Buggy `this.config?.updateInterval` literal removed     | `grep -cE 'this\.config\?\.updateInterval' node_helper.js`               | `0`                                                 | ✓ PASS     |
| Stale emission contract intact (2 sites)                | `grep -cF '_stale: true, _staleAsOf: Date.now()' node_helper.js`         | `2`                                                 | ✓ PASS     |
| `_isWithinStaleWindow` correctness — 5-case suite       | inline node test (within 30/30, outside 30/30, undefined→60, undefined 61min outside, null→60) | 5/5 PASS                                           | ✓ PASS     |
| Stale-suffix logic — 7-case edge-case suite             | inline node test (valid past, future delta, undefined, null, NaN, Infinity, string) | 7/7 PASS                                            | ✓ PASS     |
| Indicator before MD loop in source order                | manual read: line 94 (reset) < line 95 (indicator) < line 108 (mds loop) | order confirmed                                     | ✓ PASS     |
| No new `getStyles` registration / no CSS file added     | `grep -cE 'getStyles' MMM-SPCOutlook.js` = 1; `grep -F 'MMM-SPCOutlook.css' MMM-SPCOutlook.js` = ∅ | both confirmed                                       | ✓ PASS     |
| Phase 11 commits exist on main                          | `git log --oneline 316ab10 88121c2 fd5458e`                              | all three commits resolve                           | ✓ PASS     |

**Total: 11/11 spot-checks PASS.**

### Requirements Coverage (STALE-01 .. STALE-03)

| Requirement | Source Plan | Description                                                                                                              | Status      | Evidence                                                                                                                                                                                                                                                          |
| ----------- | ----------- | ------------------------------------------------------------------------------------------------------------------------ | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| STALE-01    | 11-01       | `node_helper`'s `_isWithinStaleWindow` reads the user-configured `updateInterval` (threaded through `GET_SPC_DATA` socket payload) instead of silently defaulting to 60 minutes | ✓ SATISFIED | Helper signature `(timestamp, intervalMinutes)` at `node_helper.js:246`; `this._updateInterval` cached at `:41`; both call sites at `:269` and `:284` pass it; buggy `this.config?.updateInterval` literal absent. Frontend threads via `MMM-SPCOutlook.js:14, 16`. |
| STALE-02    | 11-02       | Display surfaces a compact warning indicator at top of the module wrapper when backend reports `_stale === true`         | ✓ SATISFIED | `MMM-SPCOutlook.js:95-107`. Indicator span at line 106 sits at top of the data-bearing else-branch (immediately after `wrapper.innerHTML = ""` reset, before MD loop). Visible visual cue: warning yellow `#FFCC00` with Unicode `⚠`. |
| STALE-03    | 11-02       | Stale indicator includes a relative last-fresh-fetch time (e.g. "12 minutes ago") sourced from `_staleAsOf` via the MagicMirror²-vendored `moment` global | ✓ SATISFIED | `moment(asOf).fromNow()` at `MMM-SPCOutlook.js:103`. Source: `this.spcrisk._staleAsOf` (line 97). D-11 invalid-input fallback (no time suffix) at line 98. D-12 future-timestamp fallback (` — just now`) at lines 100-101. |

**No orphaned requirements.** REQUIREMENTS.md maps STALE-01/02/03 to Phase 11; STALE-01 is claimed by 11-01-PLAN's `requirements:` frontmatter, STALE-02 and STALE-03 by 11-02-PLAN's. All three are checked `[x]` in REQUIREMENTS.md (lines 13-16).

### Anti-Patterns Found

| File                | Line | Pattern                                              | Severity   | Impact                                                                                                                                |
| ------------------- | ---- | ---------------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| (none)              | —    | —                                                    | —          | —                                                                                                                                     |

`grep -nE 'TODO|FIXME|XXX|HACK|PLACEHOLDER' MMM-SPCOutlook.js node_helper.js` returns no matches. No empty-return stubs introduced (`_isWithinStaleWindow` returns a real boolean from a real arithmetic comparison; the indicator block always assigns concrete strings). No console.log-only handlers. No hardcoded empty data flowing to the indicator — every variable is sourced from real backend payload fields or `Date.now()`.

### Default-Off / Edge-Case Behavior

The `_stale === false` (or omitted) branch is structurally protected at three layers:

1. **Backend conditional spread (lines 835, 1018):** `_stale`/`_staleAsOf` keys are present in the payload only when `anyStale` is truthy. When the network path succeeds across all hazard fetches, the keys are absent.
2. **Frontend guard (`MMM-SPCOutlook.js:95`):** `if (this.spcrisk._stale)` short-circuits on falsy values — undefined, false, 0, null, empty string, NaN.
3. **Lexical scope:** The indicator block lives inside the data-bearing else-branch only. The `Loading…` (line 70), `Error:` (line 72), and `No Severe Weather Risk` (line 91) early branches do not enter the indicator's lexical scope at all.

**v1.2 UAT cross-reference:** `13-UAT.md` Test 1 (Cold Start) booted the module through `getDom` cleanly with no console errors related to the stale indicator. Test 2 (Default-off DOM byte-identity) explicitly confirmed the stale indicator and umbrella message "still fire under the same conditions as v1.1." This implicitly validates that the Phase 11 indicator block coexists with the Phase 12/13 proximity additions without regressions.

### Human Verification Required

Four items remain that the v1.2 milestone-level UAT did NOT explicitly exercise. None block goal achievement (the code is correct by static analysis + behavioral simulation), but each represents a runtime sub-case that has not been live-confirmed.

#### 1. Non-default `updateInterval` end-to-end

**Test:** Configure the module with `updateInterval: 30` (or any non-60 value). Force a network failure for the SPC endpoints (e.g. `sudo iptables -A OUTPUT -d www.spc.noaa.gov -j REJECT` for a few minutes, or unplug ethernet). Observe the cache-fallback behavior at the 29-minute mark vs the 31-minute mark relative to the last successful fetch.
**Expected:** At t=29min the cache returns `_stale: false` (within window). At t=31min the cache returns `_stale: true` and the indicator renders. Pre-fix, the threshold would have been 60 minutes — confirming this requires watching across a configured non-60 interval.
**Why human:** Requires deliberate network failure on a running Pi and observation across the configured interval. Cannot be reproduced statically, and the v1.2 UAT used the default 60-minute interval throughout.

#### 2. Clock-skew / future-timestamp D-12 path

**Test:** Force the backend to emit `_staleAsOf` slightly in the future (either by stubbing `node_helper.js` temporarily to add a positive delta, or by skewing the system clock between the cache-write and the render). Observe the rendered indicator.
**Expected:** Indicator reads exactly `⚠ Stale — just now`. No `in 5 minutes` or similar future-tense moment string.
**Why human:** Static analysis confirms the `delta < 0` branch at line 100 is reachable and well-formed; behavioral simulation passed. But the visual outcome on a live Pi display has not been exercised.

#### 3. Missing/invalid `_staleAsOf` D-11 path

**Test:** Force the backend to emit `_stale: true` with `_staleAsOf` absent, NaN, Infinity, or a non-number string.
**Expected:** Indicator reads exactly `⚠ Stale` with no em-dash and no time suffix.
**Why human:** The `typeof asOf === "number" && isFinite(asOf)` guard at line 98 has been verified by behavioral simulation (5/5 invalid-input cases), but live DOM rendering of the bare span on a Pi was not exercised in v1.2 UAT.

#### 4. Indicator inert during early render branches

**Test:** Verify deliberately that the indicator does NOT appear during the `Loading…`, `Error:`, or `No Severe Weather Risk` branches even if `_stale: true` were somehow contaminated into the payload during those states.
**Expected:** No `⚠` indicator visible during any of those three branches.
**Why human:** The lexical-scope argument is structural and effectively bulletproof, but a deliberate UAT pass through each branch would close the loop. v1.2 UAT Test 1 (Cold Start) implicitly exercised the loading/data-bearing transition cleanly.

### Gaps Summary

**No code-level gaps.** All 4 ROADMAP success criteria, all 14 locked decisions (D-01 through D-14), and all 3 STALE-XX requirements verify as PASS in static analysis and behavioral simulation. The integration checker referenced in `.planning/v1.2-MILESTONE-AUDIT.md` independently re-verified the wiring (frontend → socket → backend → helper → render) end-to-end.

The `human_needed` status reflects four runtime sub-cases listed above that complement (rather than duplicate) the implicit v1.2-milestone-level UAT coverage. They are confidence checks, not implementation gaps.

---

## Verification Method Summary

- **Read all required files:** `11-CONTEXT.md`, `11-DISCUSSION-LOG.md`, `11-PATTERNS.md`, `11-01-PLAN.md`, `11-01-SUMMARY.md`, `11-02-PLAN.md`, `11-02-SUMMARY.md`, `REQUIREMENTS.md`, `ROADMAP.md` (Phase 11 section), `MMM-SPCOutlook.js` (full read, 174 lines), `node_helper.js` (relevant slices: lines 1-50, 240-300, 820-840, 1005-1030).
- **Static checks:** `node --check` on both source files (clean exit). 11+ targeted greps for each truth/decision/key-link.
- **Behavioral simulation:**
  - `_isWithinStaleWindow(timestamp, intervalMinutes)` 5-case test suite (within/outside @ 30min, undefined→60 fallback, undefined 61min outside, null→60) — 5/5 PASS.
  - Stale-suffix logic 7-case edge-case suite (valid past, future delta, undefined, null, NaN, Infinity, string) — 7/7 PASS.
- **Cross-references:**
  - `.planning/v1.2-MILESTONE-AUDIT.md` Phase 11 entry confirms integration-checker re-verified the wiring; flags this VERIFICATION.md as the missing artifact (now created).
  - `.planning/phases/13-proximity-frontend-render/13-UAT.md` Test 1 (Cold Start) and Test 2 (Default-off DOM byte-identity) implicitly exercised the Phase 11 stale render block on a live MagicMirror² instance; both `result: pass`.
- **Commit traceability:** All three Phase 11 implementation commits (`316ab10` fix backend, `88121c2` feat thread payloads, `fd5458e` feat render indicator) exist in `git log --oneline`.

---

_Verified: 2026-05-03_
_Verifier: Claude (gsd-verifier)_
_Note: Retroactive verification — file is intentionally left untracked for user review before commit._
