---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 04
subsystem: api
tags: [node-helper, kmz, kml, ssrf-allowlist, spc-md, wpc-mpd]

# Dependency graph
requires:
  - phase: 15-01
    provides: PRODUCT_REGISTRY rows (spcMD, mpd) of kind kml-advisory with configFlag/allowedHost/discovery/toEntry
  - phase: 15-03
    provides: the _runArcGisDayProduct shared-runner pattern this plan mirrors for kml-advisory rows
provides:
  - normalizeAdvisoryUrl(rawHref, allowedHost) — hostname-parsed https allowlist, replaces the prefix-startsWith check
  - extractSoleKmlEntry(buffer) — hardened "find the sole .kml archive member" primitive
  - _advisoryDiscovery["spc-active-index"] — index-KMZ discovery strategy
  - _runKmlAdvisoryRow(row, lat, lon, productToggles) — shared kml-advisory runner (discovery, allowlist, decode, per-candidate containment, D-04 staleness)
  - getMesoscaleDiscussion reduced to a thin wrapper over _runKmlAdvisoryRow(PRODUCT_REGISTRY.spcMD, ...)
affects: [15-06, 15-07, 15-08]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "kml-advisory shared runner: _runKmlAdvisoryRow(row, lat, lon, productToggles) drives any registry row of kind kml-advisory through one discovery/allowlist/decode/containment pipeline, mirroring _runArcGisDayProduct's registry-row-driven dispatch discipline from 15-03"
    - "URL allowlisting via new URL() + exact hostname match, never substring/prefix matching on the raw string"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "normalizeAdvisoryUrl accepts http:// or https:// input but always normalizes the scheme to https:// before return, because fetchBinBuffer uses redirect: \"error\" and would otherwise throw on SPC's own 301 for the http:// URL it actually serves (RESEARCH.md Pitfall 1 fix)"
  - "extractSoleKmlEntry scans for the sole .kml archive member instead of relying on a URL-derived filename, since WPC MPD's KMZ member is a fixed doc.kml unlike SPC MD's URL-derived stem"
  - "getMesoscaleDiscussion kept as a transitional thin wrapper (not deleted) so socketNotificationReceived's call site is untouched; plan 15-07 performs the socket migration"

patterns-established:
  - "kml-advisory registry rows are driven end-to-end by _runKmlAdvisoryRow + _advisoryDiscovery[row.discovery], keyed purely off row fields (allowedHost, discoveryUrl, toEntry) — a new advisory product needs only a new registry row and discovery strategy, not a new fetch/allowlist/decode loop"

requirements-completed: [MPD-01]

# Metrics
duration: 25min
completed: 2026-08-24
---

# Phase 15 Plan 04: Shared kml-advisory Pipeline + SPC MD Migration Summary

**Hostname-parsed `normalizeAdvisoryUrl` allowlist and registry-driven `_runKmlAdvisoryRow` runner replace SPC MD's hand-rolled fetch loop, fixing the live `http://`-vs-`https://` prefix-match defect that zeroed every SPC MD poll.**

## Performance

- **Duration:** 25 min
- **Started:** 2026-08-24T01:36:00Z
- **Completed:** 2026-08-24T02:01:18Z
- **Tasks:** 2
- **Files modified:** 1

## Accomplishments
- Replaced the `MD_HOST_PREFIX` raw-string `startsWith` allowlist with `normalizeAdvisoryUrl(rawHref, allowedHost)`, which parses with `new URL`, matches hostname exactly, rejects userinfo/non-default-port/non-http(s) schemes, and normalizes the accepted URL's scheme to `https:` — fixing the live defect where SPC's `http://` hrefs were always refused (RESEARCH.md Pitfall 1)
- Added `extractSoleKmlEntry(buffer)`, a hardened "scan for the sole `.kml` archive member" primitive (entry-count cap, zip-slip name rejection, oversized-entry rejection) that reads WPC MPD's fixed `doc.kml` member without relying on a URL-derived filename
- Added `_advisoryDiscovery["spc-active-index"]` and `_runKmlAdvisoryRow(row, lat, lon, productToggles)`, a registry-row-driven runner performing discovery, allowlisting, KMZ decode and per-candidate containment (CR-02) for any `kml-advisory` row, with D-04 staleness semantics (fetch failure sets `anyStale`; a genuine zero-advisory result does not)
- Reduced `getMesoscaleDiscussion` to a thin wrapper over `_runKmlAdvisoryRow(PRODUCT_REGISTRY.spcMD, ...)`, preserving its string-array-or-false contract so `socketNotificationReceived` needed no change

## Task Commits

Each task was committed atomically:

1. **Task 1: Replace the prefix allowlist with a parsed-URL host allowlist, and add extractSoleKmlEntry** - `7d607a7` (fix)
2. **Task 2: Generalize getMesoscaleDiscussion into the registry-driven kml-advisory runner** - `547eb42` (feat)

**Plan metadata:** committed separately per orchestrator instructions (STATE.md/ROADMAP.md not touched by this executor)

## Files Created/Modified
- `node_helper.js` - Added `normalizeAdvisoryUrl`, `ADVISORY_MAX_CANDIDATES`, `extractSoleKmlEntry`, `_advisoryDiscovery`, `_runKmlAdvisoryRow`; deleted `MD_HOST_PREFIX`; reduced `getMesoscaleDiscussion` to a thin wrapper; `extractKmlFromKmz`/`kmzToKmlfilename` and `socketNotificationReceived` left untouched

## Decisions Made
- `normalizeAdvisoryUrl` normalizes scheme to `https:` after allowlisting rather than rejecting `http://` outright, because `fetchBinBuffer` sends `redirect: "error"` and SPC's live index publishes `http://` hrefs that 301 to `https://` — rejecting them outright would still be the availability defect this plan exists to fix.
- `normalizeAdvisoryUrl` is defined as a module-scope function (per plan) but also exposed as a plain (non-`this`-bound) property on the exported helper object so it stays independently testable by offline probes without changing how in-file callers invoke it.
- `getMesoscaleDiscussion` was kept in place as a documented transitional wrapper rather than removed, per the plan's explicit instruction that plan 15-07 performs the socket-path migration atomically.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Fixed the leftover `MD_HOST_PREFIX` reference inside `getMesoscaleDiscussion` during Task 1**
- **Found during:** Task 1
- **Issue:** The plan's Task 1 action deletes `MD_HOST_PREFIX` but explicitly forbids changing `getMesoscaleDiscussion`'s behavior in that same task (Task 2's job). Deleting the constant without touching its one call site would leave a `ReferenceError` at runtime and a literal `MD_HOST_PREFIX` string still in the file, failing Task 1's own acceptance criterion (`grep -c 'MD_HOST_PREFIX' node_helper.js` returns 0).
- **Fix:** Updated `getMesoscaleDiscussion`'s NetworkLink filter to call `normalizeAdvisoryUrl(u, "www.spc.noaa.gov")` in place of the raw prefix check, preserving the existing log wording and behavior (and, as an inherent side effect, fixing Pitfall 1 one task earlier than the full Task 2 rewrite). Task 2 subsequently replaced the whole function body with the thin wrapper, so this interim code no longer exists in the final state.
- **Files modified:** node_helper.js
- **Verification:** Task 1's `node -e` check and `node scripts/probe-payload-resilience.js` (16 passed, 0 failed, 0 skipped) both passed with this fix in place.
- **Committed in:** `7d607a7` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking)
**Impact on plan:** Necessary to keep Task 1 self-consistent and independently verifiable; fully superseded by Task 2's rewrite. No scope creep — the plan's own acceptance criteria required `MD_HOST_PREFIX` to have zero occurrences after Task 1.

## Issues Encountered
None.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness
- `_runKmlAdvisoryRow` and `_advisoryDiscovery` are ready for plan 15-06 to add a `"wpc-mpd-listing"` discovery strategy for the `mpd` registry row and supply its `ctx.number`/`ctx.hazardType`.
- `getMesoscaleDiscussion` remains a documented transitional wrapper; plan 15-07 migrates `socketNotificationReceived` off it directly onto `_runKmlAdvisoryRow` for both `spcMD` and `mpd`.
- Plan 15-08 can turn Task 1's Pitfall-1 regression assertion (`http://www.spc.noaa.gov/...` normalizes rather than being refused) into a probe scenario, as noted in the plan's threat register (T-15-14).
- No blockers.

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Completed: 2026-08-24*

## Self-Check: PASSED
