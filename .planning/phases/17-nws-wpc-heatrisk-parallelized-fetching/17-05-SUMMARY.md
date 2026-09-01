---
phase: 17-nws-wpc-heatrisk-parallelized-fetching
plan: 05
subsystem: backend
tags: [node_helper, promise-allsettled, concurrency, parallelized-fetching, staleness]

# Dependency graph
requires:
  - phase: 17-nws-wpc-heatrisk-parallelized-fetching
    plan: 04
    provides: "_runHeatRiskProduct(row, loc, productToggles) returning { payload, anyStale }, wired as heatRiskResult in getSpcOutlook"
provides:
  - "One Promise.allSettled batch of six members (excessiveRain, winterImpact, hazardsOutlook, heatRisk, spcMD, mpd) replacing three named sequential awaits and the kml-advisory for-loop in getSpcOutlook"
  - "Per-run Log.info timing line ('new-product batch settled in <n>ms {...}') carrying each member's elapsed ms and the batch wall clock — the instrument Phase 18's PERF-03 Pi measurement consumes"
  - "scripts/check-concurrency-invariant.sh — a mutation-proven, self-failing guard over _unusableFeatureCount's three write sites and _oldestStaleAt's one write site"
affects: [18]

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Flat member-array + Promise.allSettled fan-out: closures built but not invoked until Promise.allSettled(members.map(...)), each member normalized to a { payload, anyStale }-or-{ entries, anyStale } shape, folded into a results-by-id object after settlement — the first Promise.allSettled batch in this codebase"
    - "Per-member elapsed-time capture via _nowMs() inside a finally, keyed by member id, independent of resolve order — proves issue-order overlap for a future probe scenario"
    - "Grep/sed-based self-failing invariant guard: locate a mutation by a unique anchor string, find the nearest enclosing block's opening brace by scanning backward for a line ending in '{', and fail if 'await' appears in that window — proven RED under its own injected mutation, then restored"

key-files:
  created: [scripts/check-concurrency-invariant.sh]
  modified: [node_helper.js]

key-decisions:
  - "Corrected the concurrency-safety audit to THREE _unusableFeatureCount write sites, not the two the phase plan and 17-RESEARCH.md named. checkInPolygon (reached only through _runKmlAdvisoryRow, one of this batch's own members) is a third synchronous increment site discovered while writing the guard script's anchor list. It shares the same safety properties (synchronous, no await inside the mutation) as the other two, but omitting it from the audit and the guard would have understated what the guard actually protects and left one of the batch's own members unaudited."
  - "Used the anchor-to-mutation-line window (not the raw block-brace-to-mutation window) as the primary lookup mechanism, then independently re-derived the actual enclosing block's opening line via a backward scan for a line ending in '{', per the plan's literal 'block's opening brace' wording — the anchor is only used to disambiguate which of the three identical increment statements is being checked."
  - "Reworded three explanatory comments (D-08 rationale, D-10 mechanics) that initially repeated the literal string 'Promise.allSettled' three additional times beyond the actual code line, tripping the acceptance criterion's 'grep -c returns 1' check — reworded to 'the batch below' / 'the batch call below' without losing the substantive point, rather than accepting a mismatch and documenting it as a tension (this one was avoidable without losing content, unlike 17-01/17-04's precedent tensions)."

requirements-completed: [PERF-01]

# Metrics
duration: ~35min
completed: 2026-09-01
---

# Phase 17 Plan 05: Six-Member Promise.allSettled Batch + Concurrency Invariant Guard Summary

**Replaced `getSpcOutlook`'s three named new-product awaits and its `kml-advisory` for-loop with one six-member `Promise.allSettled` batch carrying a per-member timing log, then backed the shared-state concurrency-safety claim with a mutation-proven guard script covering all three `_unusableFeatureCount` write sites (one more than the phase plan named).**

## Performance

- **Duration:** ~35 min
- **Completed:** 2026-09-01
- **Tasks:** 2/2 completed
- **Files modified:** 2 (`node_helper.js`, new `scripts/check-concurrency-invariant.sh`)

## Accomplishments

- `getSpcOutlook`'s new-product section (`node_helper.js:~3320-3465`) restructured into `kmlRows` (built once via `.filter((row) => row.kind === "kml-advisory")`) + a flat `members` array of six `{ id, run }` closures, issued as one `Promise.allSettled(members.map(...))` batch rather than three sequential `await`s plus a `kml-advisory` for-loop.
- A rejected member degrades to `{ payload: null, entries: [], anyStale: true }` and is logged by member id (`Log.error("MMM-SPCOutlook " + id + ": runner rejected unexpectedly", ...)`) without discarding its five siblings' payloads — proven live against a synthetic rejection (see Behaviour Proofs below).
- A per-run `Log.info` line (`"MMM-SPCOutlook: new-product batch settled in <n>ms {...}"`) carries all six members' elapsed ms, captured via `_nowMs()` inside a `finally` so issue order is observable independent of resolve order (D-10).
- `advisories[row.id]` assignment moved from inside the fetch loop to after settlement (D-09); `eroPayload`/`wssiPayload`/`hazardsPayload`/`heatRiskPayload` all read `results.<id>.payload` and remain the exact same variable names the downstream payload assembly (`:~3540+`) already consumes.
- A load-bearing comment block above the batch documents the concurrency-safety invariant with all four mutation sites named by function and (approximate, drift-prone) line, and states the limit of the claim in one grep-checkable sentence.
- `scripts/check-concurrency-invariant.sh` — new, executable, grep/sed-based — locates each of the four mutation sites by a unique anchor string, finds the nearest enclosing block's opening brace, and fails loudly (naming the field, function, and reason) if an `await` token appears between them. Proven to fail under its own injected mutation and to pass again after restoration.

## Task Commits

1. **Task 1: Six-member Promise.allSettled batch with per-member timing** - `3e225bc` (feat)
2. **Task 2: Mechanically verify the shared-mutable-state safety invariant** - `ec232a8` (test)

**Plan metadata:** pending (this commit, made by the orchestrator after merge)

## Files Created/Modified

- `node_helper.js` — replaced the three named awaits (`eroResult`, `wssiResult`, `hazardsResult`) and the `kml-advisory` for-loop with `kmlRows`, `members`, the `Promise.allSettled` batch, the `results` fold, the timing log, and the four downstream payload locals reading off `results.<id>`. Extended and corrected the concurrency-safety comment block above the batch.
- `scripts/check-concurrency-invariant.sh` (new, executable) — the self-failing guard described above.

## Decisions Made

See `key-decisions` in frontmatter: (1) corrected the write-site count for `_unusableFeatureCount` from two to three after finding `checkInPolygon` during guard construction; (2) used an anchor+backward-brace-scan design for the guard rather than a literal block-name lookup, to handle `_noteStaleEntry`'s `if`-block site as well as the three `catch`-block sites uniformly; (3) reworded three comments to avoid an avoidable `Promise.allSettled` grep-count mismatch rather than documenting it as an accepted tension.

## Mechanical Acceptance Checks — Verbatim Results

- `node scripts/probe-payload-resilience.js` → **67 passed, 0 failed, 0 skipped**, unchanged from the pre-plan baseline, both after Task 1 and after Task 2. (The plan's own verification text cites "79/79"; per 17-02/17-04's already-recorded assumption drift, the live baseline on this branch is 67 scenarios — the hard bar, 0 failed/0 skipped/exit 0, is met at every checkpoint.)
- `grep -c 'Promise.all(' node_helper.js` → **0**.
- `grep -c 'Promise.allSettled' node_helper.js` → **1** (the actual code line; three explanatory-comment repeats were reworded away to hit this exactly).
- `grep -n 'row.kind !== "kml-advisory"' node_helper.js` → **no matches** — the `continue`-guard loop is gone.
- `grep -cE 'const (eroPayload|wssiPayload|hazardsPayload|heatRiskPayload) =' node_helper.js` → **4**.
- `git diff -U0 4a5bef3f0bb260076b2f4860ed9e9a49c5bfe9db..HEAD -- node_helper.js | grep '^@@'`:
  ```
  @@ -3334,6 +3334 @@ module.exports = NodeHelper.create({
  @@ -3346,26 +3341,9 @@ module.exports = NodeHelper.create({
  @@ -3377,2 +3355,108 @@ module.exports = NodeHelper.create({
  @@ -3380,5 +3464,3 @@ module.exports = NodeHelper.create({
  ```
  Every hunk starts at line 3334 or later — no hunk below line 2900 (in fact none below 3334) — confirming the ~25-hop sequential SPC/fire-weather chain was untouched.
- Sequential-await inventory inside the restructured block (read, not just grepped): line `~3420` (`await Promise.allSettled(...)`), line `~3423` (`await m.run()` inside the mapped closure — one member's own work), and line `~3409` (`await this._runKmlAdvisoryRow(...)` inside a kml-advisory member's own `run()` closure — also member-internal work, not a sequential await blocking the batch). No other `await` exists between `kmlRows` and the `advisories` fold.
- `grep -c 'does not generalise\|does not generalize' node_helper.js` → **1**.
- `bash scripts/check-concurrency-invariant.sh` → exits **0**, printing an `OK` verdict line with file:line for all four mutation sites (`extractPolygons:1808`, `evaluatePolygonsCollectAll:1864`, `checkInPolygon:3637`, `_noteStaleEntry:2164`).
- Mutation proof of the guard itself: inserted `await Promise.resolve();` immediately before `extractPolygons`'s `_unusableFeatureCount` increment, re-ran the script — exited **1**, first line: `FAIL: _unusableFeatureCount @ extractPolygons:1809 — a future edit introduced an \`await\`...` — naming both the field and the function. Restored the file, re-ran — exited **0** again. `git status --short` after restoration showed no pending change to `extractPolygons`, confirmed by `git diff -U3 node_helper.js | grep -A3 -B3 "extractPolygons: skipping"` returning no output.

## Behaviour Proofs — Verbatim Results

Run via a scratch script (`/tmp/.../scratchpad/proof-batch.js`, not committed) through `loadNodeHelper()`, stubbing `_fetch` to answer a quiet empty `FeatureCollection` for every ArcGIS/kml-advisory URL and a minimal well-formed identify body for the HeatRisk URL, with all six product toggles on:

**Proof 1 — timing log line, all six member ids present:**
```
MMM-SPCOutlook: new-product batch settled in 2ms {"heatRisk":1,"mpd":1,"spcMD":1,"winterImpact":2,"excessiveRain":2,"hazardsOutlook":2}
payload has excessiveRain? true winterImpact? true hazardsOutlook? true heatRisk? true advisories? ["spcMD","mpd"]
```

**Proof 2 — rejection containment:** monkey-patched `helper._runArcGisDayProduct` to throw synthetically for the `excessiveRain` row only, then re-ran `getSpcOutlook`:
```
out2._stale: true
out2.excessiveRain: null
out2.winterImpact present? true {"day1Risk":"NONE","day1Text":"None","day1Color":"afddf6","day1ValidTime":null,"
out2.hazardsOutlook present? true
out2.heatRisk present? true
out2.advisories present? true {"spcMD":[],"mpd":[]}
rejection log line: ERROR MMM-SPCOutlook excessiveRain: runner rejected unexpectedly synthetic
```
`_stale` is `true`, the error was logged naming the member id (`excessiveRain`), and every other product's payload block survived intact — exactly the property `Promise.all` would have destroyed. `winterImpact`/`hazardsOutlook`/`heatRisk`/`advisories` all guard on a falsy/non-object block before reading into it downstream (`dayRiskCount`, `hazardsOutlookHasAnyDay`, `heatRiskDaysToRender` in `MMM-SPCOutlook.js`, all confirmed via direct read to open with `if (!block || typeof block !== "object") return ...`), which is why a substituted `payload: null` on rejection was sufficient without needing a toggle-off-shaped substitute.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 2 - Missing critical functionality] `_unusableFeatureCount` has a third write site the phase plan and 17-RESEARCH.md did not name**
- **Found during:** Task 2, while enumerating anchor strings for the guard script.
- **Issue:** The plan's `<read_first>` and 17-RESEARCH.md's "Concurrency Safety, Verified" section both name exactly two `_unusableFeatureCount` write sites (`extractPolygons`, `evaluatePolygonsCollectAll`). A `grep -n '_unusableFeatureCount' node_helper.js` sweep during guard construction found a third: `checkInPolygon` (`node_helper.js:~3637`), reached only through `_runKmlAdvisoryRow` — one of this batch's own six members. It shares the identical safety shape (a synchronous increment inside a `for`-loop's `catch` block, no `await` between the read and the write), so the safety conclusion is unchanged, but the plan's documented sites and the guard's protected sites would have been incomplete without it — leaving one of the batch's own members' write path unaudited and unguarded.
- **Fix:** Added `checkInPolygon` as a third audited site in both the batch's own explanatory comment (naming "THREE write sites" and explaining why `checkInPolygon` is in scope despite predating the batch) and in `scripts/check-concurrency-invariant.sh`'s `check_site` calls.
- **Files modified:** `node_helper.js` (comment), `scripts/check-concurrency-invariant.sh` (new file, includes the site from creation)
- **Verification:** `bash scripts/check-concurrency-invariant.sh` prints an `OK` line for `checkInPolygon` alongside the other three sites; probe suite unchanged (67/0/0).
- **Committed in:** `ec232a8` (Task 2's commit)

### Acceptance-Criteria Tensions (not code deviations, resolved without a tension)

**2. `Promise.allSettled` grep count initially 4, not the required 1**
- **Found during:** Task 1's mechanical acceptance check.
- **Issue:** Three explanatory comments (D-08 rationale, D-10 mechanics) repeated the literal string `Promise.allSettled` in prose, in addition to the one actual code line, so `grep -c 'Promise.allSettled' node_helper.js` returned 4 against the plan's required 1.
- **Resolution:** Unlike 17-01/17-04's precedent tensions (where the mandated comment content and the literal count were genuinely in conflict), this one was avoidable: reworded the three comment mentions to "the batch below" / "the batch call below" without losing the substantive D-08/D-10 explanation, since the comments' own point (allSettled-not-all semantics, timing capture mechanics) does not require repeating the API name itself. No code deviation — resolved before commit.
- **Committed in:** `3e225bc` (Task 1's commit; the reword happened before the commit)

---

**Total deviations:** 1 auto-fixed (Rule 2, a missing write site found during the mechanical audit this task itself performs — the exact kind of gap Task 2 exists to close), 1 acceptance-criteria wording adjustment resolved by rewording rather than documented as an accepted tension.
**Impact on plan:** The Rule 2 addition strengthens the audit's completeness without changing its conclusion (`checkInPolygon`'s site has the identical safety shape as the other two) and without touching any runner's actual logic. No scope creep.

## Issues Encountered

None beyond the deviations above, both resolved before their respective task's commit.

## User Setup Required

None — no external service configuration required. This plan is backend-only code, exercised through the existing probe harness and a scratch behavior-proof script.

## Next Phase Readiness

- The six-member `Promise.allSettled` batch is live, exercised by the full existing probe suite (67/0/0 at every checkpoint) and by this plan's own mandated behavior/rejection/timing proofs.
- Phase 18's PERF-03 Pi measurement has its instrument ready: the `"new-product batch settled in <n>ms {...}"` log line, carrying every member's elapsed time, needs no further construction.
- `scripts/check-concurrency-invariant.sh` is a permanent, mutation-proven regression guard against a future edit accidentally introducing an `await` into one of the four mutation sites it covers — no manual re-audit needed unless a NEW helper-global field is added without the same three properties (synchronous write, no `await` inside the mutation, commutative reduce), per the batch comment's own stated limit.
- No blockers identified for downstream plans. Live in-season UAT of the parallelized batch against real NOAA endpoints remains untested by this plan (structural/probe verification only, matching this project's established quality-notes fallback), unchanged from prior phases' disclosed gap.

---
*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Completed: 2026-09-01*

## Self-Check: PASSED

- FOUND: `node_helper.js`
- FOUND: `scripts/check-concurrency-invariant.sh` (executable)
- FOUND: `.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-05-SUMMARY.md`
- FOUND: commit `3e225bc` (Task 1)
- FOUND: commit `ec232a8` (Task 2)
