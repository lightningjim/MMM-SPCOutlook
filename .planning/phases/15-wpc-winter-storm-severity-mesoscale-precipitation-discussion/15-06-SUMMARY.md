---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 06
subsystem: api
tags: [node-helper, wpc, mpd, kmz, kml, apache-directory-listing, ssrf-hardening]

# Dependency graph
requires:
  - phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion (plan 15-04)
    provides: shared kml-advisory pipeline (_advisoryDiscovery, _runKmlAdvisoryRow, normalizeAdvisoryUrl, extractSoleKmlEntry)
  - phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion (plan 15-01)
    provides: PRODUCT_REGISTRY.mpd row and MPD_FILENAME_PATTERN in productRegistry.js
provides:
  - MPD CDATA field parsing (extractMpdField, mpdDescriptionHtml, mpdHazardType, mpdNumber)
  - MPD validity-window resolution (parseMpdValidEnd) with month/year rollover handling
  - wpc-mpd-listing discovery strategy parsing WPC's Apache directory listing
  - Per-candidate MPD-04 validity gate wired into _runKmlAdvisoryRow via _prepareMpdEntry
affects: [15-07 (socket migration / display), 18-merge-precedence]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "row.id-keyed branch inside a shared runner for one product's extra behavior, in place of a per-row hook function, when the plan scopes files_modified to node_helper.js only"
    - "Fail-open null propagation through a parsing pipeline (unparseable -> null -> keep, never drop)"

key-files:
  created: []
  modified:
    - node_helper.js

key-decisions:
  - "Implemented the MPD-04/MPD-03/D-06 logic as a row.id === \"mpd\" branch inside _runKmlAdvisoryRow (the plan's explicitly offered alternative to a prepareEntry hook on the registry row), because the plan's files_modified frontmatter scopes this plan to node_helper.js only and a hook would require editing productRegistry.js."
  - "48h Last-Modified pre-filter drops a candidate only when its timestamp both parses and is genuinely stale; absent/unparseable timestamps always fail open, matching Open Question 2's resolution."
  - "Degenerate-listing truncation (format-changed listings) truncates to the LAST ADVISORY_MAX_CANDIDATES entries in document order (Apache's alphabetical listing puts highest-numbered entries last), distinct from _runKmlAdvisoryRow's own generic slice(0, N) truncation."

requirements-completed: [MPD-02, MPD-03, MPD-04]

# Metrics
duration: ~15min
completed: 2026-08-24
---

# Phase 15 Plan 06: WPC MPD Discovery and Validity-Gated Parsing Summary

**WPC MPD candidates are discovered from WPC's raw Apache directory listing (no ActiveMD.kmz-equivalent index exists), pre-filtered on Last-Modified for fetch cost only, and each candidate's own `ValidEndTi` — never its filename number — decides whether it is still active, so `MPD_1281_final.kmz` (a live-reproduced 8-month-stale straggler) is rejected while every genuinely concurrent MPD is kept and labelled with its number and hazard type.**

## Performance

- **Duration:** ~15 min
- **Started:** 2026-08-24T02:00Z (approx)
- **Completed:** 2026-08-24T02:15Z (approx)
- **Tasks:** 3
- **Files modified:** 1 (`node_helper.js`)

## Accomplishments
- Added three MPD description-CDATA parsing helpers (`extractMpdField`, `mpdDescriptionHtml`, `parseMpdValidEnd`) plus two thin readers (`mpdHazardType`, `mpdNumber`), all guarded against togeojson's object-wrapped `description` (Pitfall 3) and against malformed/out-of-range input.
- Added the `wpc-mpd-listing` discovery strategy: parses WPC's flat Apache "Index of" HTML listing for `MPD_<n>_final.kmz` candidates, re-validates every captured filename against the exported `MPD_FILENAME_PATTERN` before it is ever joined to a URL, and bounds both the listing body (4 MB) and the candidate set (falls back to the last 60 in document order with `failed: true` if the pre-filter cannot reduce a format-changed listing).
- Wired MPD-04's per-candidate validity gate into `_runKmlAdvisoryRow` via a new `_prepareMpdEntry` hook keyed on `row.id === "mpd"`: a candidate is dropped only when its own resolved `ValidEndTi` has passed; an unresolvable window fails open (kept, logged); `MPDType`/`MPDNumber` are read into `ctx` with D-06's null-hazard-type fail-open behavior and a filename-number fallback that is a label of last resort only.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the MPD CDATA field and validity-window parsing helpers** - `21e21aa` (feat)
2. **Task 2: Add the wpc-mpd-listing discovery strategy** - `8f757c8` (feat)
3. **Task 3: Apply the per-candidate validity gate and hazard-type labelling in the advisory runner** - `de55c20` (feat)

**Plan metadata:** (this commit) `docs(15-06): complete WPC MPD discovery plan`

## Files Created/Modified
- `node_helper.js` - Added `extractMpdField`, `mpdDescriptionHtml`, `parseMpdValidEnd`, `mpdHazardType`, `mpdNumber`, the `wpc-mpd-listing` discovery strategy, and the `_prepareMpdEntry` hook wired into `_runKmlAdvisoryRow`; imports `MPD_FILENAME_PATTERN` from `productRegistry.js`.

## Decisions Made
- **Hook implementation choice:** the plan offered a choice between a `prepareEntry(feature, helper)` hook attached to the registry row, or an equivalent `row.id === "mpd"` branch inside `_runKmlAdvisoryRow`. Chose the branch because the plan's `files_modified` frontmatter lists only `node_helper.js` — attaching a hook function to `PRODUCT_REGISTRY.mpd` would require editing `productRegistry.js`, which is out of this plan's declared scope. `spcMD` is structurally unaffected either way.
- **Pre-filter semantics:** a candidate's Last-Modified timestamp excludes it from fetching only when the timestamp both parses AND is more than 48h old; an absent or unparseable timestamp always fails open (kept), so a WPC listing-format change degrades to "fetch more than needed and flag stale" rather than "silently drop everything."
- **Truncation direction:** the degenerate-listing truncation path keeps the *last* `ADVISORY_MAX_CANDIDATES` (60) entries in document order, not the first — Apache lists alphabetically, so the tail is the highest-numbered (most recent) entries. This differs intentionally from `_runKmlAdvisoryRow`'s own generic `slice(0, N)` truncation, which this strategy's internal truncation makes structurally unreachable for `mpd` in the normal case since the strategy already caps its own output at 60.

## Deviations from Plan

None - plan executed exactly as written. The hook-vs-branch choice above was an explicit either/or the plan itself offered, not a deviation.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- `PRODUCT_REGISTRY.mpd` candidates are now discovered, validity-gated, and labelled end to end through `_runKmlAdvisoryRow`; `getMesoscaleDiscussion`'s existing thin-wrapper shape (from plan 15-04) is unaffected since `mpd` is invoked separately via `_runKmlAdvisoryRow(PRODUCT_REGISTRY.mpd, ...)` in a later plan's socket wiring.
- Plan 15-07 (socket migration / display) can now consume `mpd` entries with `{ label: "WPC MPD <n>", hazardType }` shape, including the `hazardType === null` case that must render without a suffix per D-06.
- No blockers. The probe suite remains at `22 passed, 0 failed, 0 skipped` after all three tasks.

## Self-Check: PASSED

- `node_helper.js` — FOUND (modified, exists)
- Commit `21e21aa` — FOUND in `git log --oneline --all`
- Commit `8f757c8` — FOUND in `git log --oneline --all`
- Commit `de55c20` — FOUND in `git log --oneline --all`
- `node scripts/probe-payload-resilience.js` — 22 passed, 0 failed, 0 skipped (re-run after all three tasks)
- `grep -nE '\.sort\(\)|\.pop\(\)|Math\.max' node_helper.js` — all matches are pre-existing proximity/fire-weather comparators, none rank MPD candidates by number
- `grep -n 'MPD_FILENAME_PATTERN' node_helper.js` — used only in the `wpc-mpd-listing` discovery strategy (import + filename re-validation), never in the currency decision

---
*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Completed: 2026-08-24*
