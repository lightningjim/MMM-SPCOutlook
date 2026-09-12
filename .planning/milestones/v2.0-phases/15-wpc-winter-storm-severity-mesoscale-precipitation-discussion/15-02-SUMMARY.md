---
phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion
plan: 02
subsystem: probe-harness
tags: [testing, kmz, kml, adm-zip, xmldom, togeojson, xpath]
dependency-graph:
  requires: []
  provides:
    - "module-stubs.js: hasRealKmlDeps, missingKmlDeps, makeKmzBuffer"
    - "probe-payload-resilience.js: skip accounting (requires: 'kml-deps'), httpResponse buffer option"
  affects:
    - "scripts/probe-lib/module-stubs.js"
    - "scripts/probe-payload-resilience.js"
tech-stack:
  added: []
  patterns:
    - "opportunistic real-dependency resolution with a throwing-stub fallback (require.resolve pinned to repo root)"
    - "skip-as-failure: a scenario that cannot run forces a non-zero exit rather than being silently omitted"
key-files:
  created: []
  modified:
    - scripts/probe-lib/module-stubs.js
    - scripts/probe-payload-resilience.js
decisions:
  - "adm-zip sorts entries alphabetically on write/read by default; makeKmzBuffer and the scenario's read-back both pass { noSort: true } to preserve fixture-authored entry order (undocumented in the plan, discovered during Task 3)."
metrics:
  duration: "~15 minutes (985266a to 38aa845)"
  completed: 2026-08-23
---

# Phase 15 Plan 02: Real KML/ZIP dependency resolution in the probe harness Summary

Gave the probe harness the ability to drive the real `adm-zip` / `@xmldom/xmldom` /
`@tmcw/togeojson` / `xpath` chain against an in-memory KMZ buffer, with a loud, exit-code-visible
skip when those packages are unavailable, so every future MPD/SPC-MD scenario in this phase has
a mechanism to reach real KMZ-layer defects instead of a throwing stub.

## What Was Built

1. **`scripts/probe-lib/module-stubs.js`** — `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson` and
   `xpath` are now resolved from the repo root via `require.resolve(specifier, { paths: [repoRoot] })`
   at module load. On success the real module is registered on the harness's synthetic-path
   resolver; on failure (each specifier tried independently, one failure does not disable the
   others) today's throwing stub is registered unchanged. `hasRealKmlDeps` (boolean) and
   `missingKmlDeps` (string[]) are computed once at load and exported. `node_helper`, `logger`
   and `@turf/turf` stay mapped to their hand-written stubs unconditionally — the turf stub's
   `pointInPolygon` delegation and WR-08's ring-validation throws were untouched.
2. **`scripts/probe-payload-resilience.js` runner** — imports `hasRealKmlDeps`/`missingKmlDeps`.
   A scenario declaring `requires: "kml-deps"` is skipped (not run) when the real libraries are
   unavailable: it prints `SKIP <name> (requires real <specifiers>; run npm ci)`, increments a
   `skipped` counter, and the summary line becomes
   `PROBE RESULT: N passed, M failed, K skipped`. Exit is `0` only when `failed === 0 && skipped
   === 0` — a missing dependency can never read as a green run.
3. **`makeKmzBuffer(entries)`** in `module-stubs.js` — builds a real KMZ archive from the resolved
   `adm-zip`, preserving entry insertion order (see Deviations). Throws a clear error naming
   `hasRealKmlDeps` if called while the real `adm-zip` is unavailable.
4. **`httpResponse` buffer option** — `probe-payload-resilience.js`'s HTTP-seam response stand-in
   now accepts a `buffer` option; when present, `arrayBuffer()` resolves to that Buffer and
   `text()` resolves to its `toString()`. Existing `body`/`text` behaviour is untouched.
5. **`harness-real-kml-deps-round-trip` scenario** (`requires: "kml-deps"`) — builds a KMZ with a
   non-`.kml` entry first and `doc.kml` second (containing the live MPD hazard-table text verbatim
   from RESEARCH.md, wrapped in a CDATA description on one Polygon Placemark), serves it over the
   `_fetch` seam, drives the real `helper.fetchBinBuffer(url)`, opens the returned buffer with the
   real `adm-zip` to read the `doc.kml` entry, passes it through the real `helper.kmlToGeoJson(...)`,
   and asserts: `fetchBinBuffer` returned a `Buffer` of the expected byte length, the archive's
   first entry name is not `doc.kml` (proving the fixture didn't accidentally coincide with
   alphabetical order), `doc.kml` is present, and the converted feature's
   `properties.description` is an **object** with a `.value` string containing `<td>MPDType</td>`
   — pinning RESEARCH.md Pitfall 3 (togeojson wraps HTML description as `{ "@type": "html", value
   }`, not a plain string) as executable ground truth.

## Verification

- `node scripts/probe-payload-resilience.js` → `PROBE RESULT: 16 passed, 0 failed, 0 skipped`,
  exit 0 (observed directly).
- Task 1 `node -e` command (checks `hasRealKmlDeps === true`, `loadNodeHelper()` works, real
  `adm-zip` usable) → printed `OK`.
- Forced-skip check: temporarily added `requires: "kml-deps"` to `spc-wellformed-baseline` and ran
  under a preload script that forces `Module._resolveFilename` to throw for the four specifiers →
  printed `SKIP spc-wellformed-baseline (requires real adm-zip, @xmldom/xmldom, @tmcw/togeojson,
  xpath; run npm ci)`, `PROBE RESULT: 14 passed, 0 failed, 1 skipped`, process exit code `1`
  (captured via `$?` after a non-piped run, not through a pipeline). Both edits reverted; `diff`
  against a pre-edit backup confirmed the file returned to its committed state, and the suite
  returned to `15 passed, 0 failed, 0 skipped`, exit 0.
- Dependency-absent check: ran the full suite under the same forced-resolution-failure preload
  with no `requires` edit → still loaded `node_helper.js`, still reported 15 scenario results (no
  `PROBE ABORTED`), `PROBE RESULT: 15 passed, 0 failed, 0 skipped`.
- Mutation proof for the new scenario: temporarily changed
  `typeof description !== "object"` to `typeof description !== "string"` → scenario failed with
  `RESEARCH.md Pitfall 3 regressed: expected properties.description to be an object, got object`.
  Reverted; scenario passed again and the full suite returned to `16 passed, 0 failed, 0 skipped`.
- `grep -n 'turfStub' scripts/probe-lib/module-stubs.js` still shows `@turf/turf: turfStub` — the
  turf stub was not replaced by the real library.
- `git diff scripts/probe-payload-resilience.js`: the only removed lines are the import list and
  the `httpResponse` function signature/body (both infrastructure) — none of the 15 shipped
  scenario bodies were touched.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking issue] adm-zip sorts entries alphabetically; insertion order was silently lost**
- **Found during:** Task 3, first run of `harness-real-kml-deps-round-trip`
- **Issue:** The plan requires `makeKmzBuffer` to preserve entry insertion order "so a fixture can
  place a non-`.kml` entry first and prove `extractSoleKmlEntry` scans rather than taking the
  first entry." `adm-zip`'s default `toBuffer()`/read-back round trip sorts entries
  alphabetically by `entryName` (confirmed by inspecting `adm-zip`'s `zipFile.js` `sortEntries()`
  and by a direct reproduction: two entries named so alphabetical order differs from insertion
  order came back in alphabetical order). Because `"doc.kml" < "style.xsl"` alphabetically, the
  first scenario run silently produced `doc.kml` first — exactly the vacuous-coverage case the
  plan calls out.
- **Fix:** `adm-zip` exposes a `noSort` constructor option that disables the sort on both the
  writing (`new AdmZip(undefined, { noSort: true })`) and reading (`new AdmZip(buffer, { noSort:
  true })`) sides. `makeKmzBuffer` now constructs with `{ noSort: true }`; the scenario's
  read-back (`new AdmZip(fetched, { noSort: true })`) does the same. Verified: with `noSort`,
  entries named so alphabetical and insertion order differ round-trip in insertion order.
- **Files modified:** `scripts/probe-lib/module-stubs.js`, `scripts/probe-payload-resilience.js`
- **Commit:** 38aa845

## Threat Flags

None — the four packages resolved are the same fixed, hardcoded specifiers named in the plan's
threat model (T-15-06), resolution stays pinned to the repo root, and no new network endpoint,
auth path, or schema change was introduced. `makeKmzBuffer` only ever builds archives from
in-process literals (T-15-07, accepted per plan).

## Self-Check: PASSED

- FOUND: scripts/probe-lib/module-stubs.js
- FOUND: scripts/probe-payload-resilience.js
- FOUND: 985266a (feat(15-02): resolve real KML/ZIP deps in probe harness with throwing fallback)
- FOUND: 48d99d4 (feat(15-02): add skip accounting to the probe runner)
- FOUND: 38aa845 (feat(15-02): add makeKmzBuffer and a harness real-KML round-trip scenario)
