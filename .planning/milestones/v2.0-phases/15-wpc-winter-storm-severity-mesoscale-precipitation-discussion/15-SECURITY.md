---
phase: 15
slug: wpc-winter-storm-severity-mesoscale-precipitation-discussion
status: verified
threats_open: 0
asvs_level: 1
created: 2026-08-25
---

# Phase 15 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| registry config -> outbound fetch URL | Every WPC/CPC URL is built from constants in `productRegistry.js` | outbound host/URL |
| remote KML/directory markup -> fetch target | `MPD_FILENAME_PATTERN` / `normalizeAdvisoryUrl` decide which remote-supplied strings become a fetch target | outbound host/URL (SSRF surface) |
| remote KMZ bytes -> `adm-zip` | Attacker-influenceable archive is opened and decompressed | binary archive bytes |
| remote CDATA/KML text -> `innerHTML` | `label`/`hazardType` from remote KML reach the DOM | untrusted display text (XSS surface) |
| backend -> frontend socket contract | `node_helper.js` <-> `MMM-SPCOutlook.js`, no compile-time contract | payload array shape |
| test harness -> module resolver | `installStubs` patches `Module._resolveFilename` process-wide | which code a probe scenario actually exercises |

---

## Threat Register

| Threat ID | Category | Component | Disposition | Mitigation | Status |
|-----------|----------|-----------|-------------|------------|--------|
| T-15-01 | Spoofing | `winterImpact.buildUrl` | mitigate | `buildArcGisQuery` refuses any `baseUrl` not prefixed `https://mapservices.weather.noaa.gov/` — `productRegistry.js:28` | closed |
| T-15-02 | Tampering | `allowedHost` (both advisory rows) | mitigate | Stored as bare hostname, no scheme/path — `productRegistry.js:206,224`; compared via exact `hostname` match in `normalizeAdvisoryUrl` — `node_helper.js:68` | closed |
| T-15-03 | Tampering | `MPD_FILENAME_PATTERN` | mitigate | Anchored `^MPD_(\d+)_final\.kmz$` — `productRegistry.js:123` | closed |
| T-15-04 | Information disclosure | `paletteSource` URL | accept | Confirmed never fetched at runtime — only reference in the codebase is the citation string in `productRegistry.js:190`; no caller reads it | closed (accepted) |
| T-15-05 | Repudiation | probe runner exit code | mitigate | Missing `kml-deps` scenarios counted as `skipped`; exit code is 1 when `skipped > 0` — `scripts/probe-payload-resilience.js:3672,3688-3691` | closed |
| T-15-06 | Tampering | `require.resolve(specifier, { paths: [repoRoot] })` | mitigate | Resolution pinned to `REPO_ROOT`, fixed 4-specifier list — `scripts/probe-lib/module-stubs.js:131-142` | closed |
| T-15-07 | Denial of service | `makeKmzBuffer` fixtures | accept | Confirmed `makeKmzBuffer`/`kmzOf` build archives only from in-process literal fixture entries, never remote input — `scripts/probe-lib/module-stubs.js:288-304`, `scripts/probe-payload-resilience.js:433` | closed (accepted) |
| T-15-08 | Spoofing | real libraries replacing stubs | mitigate | `@turf/turf` mapped unconditionally to `turfStub`, never to `REAL_KML_DEPS` — `scripts/probe-lib/module-stubs.js:149` | closed |
| T-15-09 | Spoofing | `winterImpact.buildUrl` -> `fetchGeoJsonCached` | mitigate | Same `buildArcGisQuery` guard as T-15-01; no remote value contributes to the URL | closed |
| T-15-10 | Tampering (XSS) | WSSI row -> `innerHTML` | mitigate | `renderDayBlock` reads only `tierToText`/`tierToColor` closed lookup maps keyed by registry-produced tier strings — `MMM-SPCOutlook.js:427-437`; `toValue` maps unrecognised `impact` to 0 — `productRegistry.js:167-171` | closed |
| T-15-11 | Denial of service | 3 added fetches/poll | mitigate | `updateInterval` validated/clamped both ends — `node_helper.js:720-730`, `MMM-SPCOutlook.js:24-35`; `_inFlight` guard — `node_helper.js:707-711`; 15s `withTimeout` abort — `node_helper.js:9-15` | closed |
| T-15-12 | Information disclosure | degraded WSSI read as all-clear | mitigate | `_runArcGisDayProduct`'s `anyStale` ORed into `getSpcOutlook` — `node_helper.js:2202` | closed |
| T-15-13 | Spoofing / SSRF | `normalizeAdvisoryUrl` | mitigate | `new URL` parse; protocol in {http:,https:}; exact hostname match; empty username/password/port — `node_helper.js:55-74` | closed |
| T-15-14 | Availability defect (over-tight allowlist) | `MD_HOST_PREFIX` scheme mismatch | mitigate | `http://` normalized to `https://` rather than refused — `node_helper.js:72`; live scenario `spc-md-http-href-not-rejected-by-allowlist` | closed |
| T-15-15 | Tampering | post-allowlist redirect | mitigate | `fetchBinBuffer` sends `redirect: "error"` — `node_helper.js:837` | closed |
| T-15-16 | Denial of service | `adm-zip` on remote archives | mitigate | `extractSoleKmlEntry` refuses >32 entries, unsafe entry names (`..`, leading `/`, drive letter), declared size outside `(0, 8MB]` — `node_helper.js:874-937`; proven by `kmz-decompression-bomb-is-refused` | closed |
| T-15-17 | Denial of service | unbounded candidate list | mitigate | `ADVISORY_MAX_CANDIDATES = 60` — `node_helper.js:79`; truncation logged and `anyStale`/`failed` set in both strategies — `node_helper.js:355-359,473-483,533-538` | closed |
| T-15-18 | Information disclosure | total advisory outage as "none active" | mitigate | Index failure, unknown strategy, truncation, per-candidate failure all set `anyStale`; clean zero-result run does not — `node_helper.js:505-588` | closed |
| T-15-19 | Repudiation | vacuous WSSI scenarios | mitigate | `LIMITED` tier explicitly forbidden in fixtures (comment + no occurrence) — `scripts/probe-payload-resilience.js:200-203`; mutation-proof comments recorded | closed |
| T-15-20 | Tampering | fixture drift from live schema | mitigate | `WSSI_URLS` derived from `PRODUCT_REGISTRY.winterImpact.buildUrl` — `scripts/probe-payload-resilience.js:298-301`; fixtures carry live-captured values, off-season body cited as live-captured — line 82 | closed |
| T-15-21 | Information disclosure | degraded WSSI read as no-impact | mitigate | `wssi-hard-fail-is-flagged` asserts `_stale === true` and a diagnostic naming `WSSI_URLS[1]` — `scripts/probe-payload-resilience.js:1425-1449` | closed |
| T-15-22 | Spoofing | probe reaching real network | mitigate | Every scenario installs `installHttp`, which overrides `helper._fetch`; unrouted URL defaults to 503 — `scripts/probe-payload-resilience.js:663-670` | closed |
| T-15-23 | Spoofing / SSRF | `wpc-mpd-listing` href parsing | mitigate | Bare filename captured, re-validated against anchored `MPD_FILENAME_PATTERN`, joined with `new URL(name, base)`, re-checked by `normalizeAdvisoryUrl` — `node_helper.js:413,424,440-455` | closed |
| T-15-24 | Denial of service | catastrophic regex backtracking | mitigate | `extractMpdField` returns null above 512KB — `node_helper.js:1104`; listing body refused above `ADVISORY_MAX_LISTING_BYTES` (4MB) — `node_helper.js:87,400-404` | closed |
| T-15-25 | Denial of service | 1000+ candidate fetches | mitigate | Fail-open on timestamp but capped at `ADVISORY_MAX_CANDIDATES`, `failed: true` set — `node_helper.js:473-483` | closed |
| T-15-26 | Tampering | `new RegExp` from `label` | mitigate | Regex metacharacters escaped before pattern construction — `node_helper.js:1105` | closed |
| T-15-27 | Information disclosure | expired MPD shown / active hidden | mitigate | Currency decided only by `parseMpdValidEnd` against candidate's own fields; Last-Modified pre-filter explicitly non-authoritative, fails open — `node_helper.js:428-437,600-621` | closed |
| T-15-28 | Tampering (XSS) | `MPDType`/`MPDNumber` -> `innerHTML` | transfer | Carried as data only in plan 15-06; receiving control T-15-29 verified present (see below) | closed (transfer verified) |
| T-15-29 | Tampering (XSS) | advisory band `innerHTML` | mitigate | `escapeHtml` applied to both `label` (line 355) and `hazardType` (line 360) before concatenation into `innerHTML` — `MMM-SPCOutlook.js:205-207,355-361`; proven by `frontend-escapes-remote-advisory-text` | closed |
| T-15-30 | Tampering | silent loss of out-of-order discard | mitigate | Both socket ends changed together; `seq`/`epoch` guard present — `node_helper.js:786-788`, `MMM-SPCOutlook.js:116-132`; proven by `frontend-seq-discard-survives-socket-index-migration` | closed |
| T-15-31 | Information disclosure | active advisory hidden by no-risk short-circuit | mitigate | Gate includes `!(enabledAdvisories().length > 0)` term — `MMM-SPCOutlook.js:311`; proven by `frontend-advisory-only-is-not-an-all-clear` | closed |
| T-15-32 | Denial of service | unbounded advisory band length | accept | No display cap present (verified: `allAdvisories` loop at `MMM-SPCOutlook.js:350-363` renders every entry, no `.slice`); fetch volume separately capped by `ADVISORY_MAX_CANDIDATES` (T-15-17) | closed (accepted) |
| T-15-33 | Spoofing | degraded advisory fetch as "none active" | mitigate | `_runKmlAdvisoryRow`'s `anyStale` ORed into `getSpcOutlook` — `node_helper.js:2216` | closed |
| T-15-34 | Repudiation | allowlist scenario that cannot fail | mitigate | `spc-md-http-href-not-rejected-by-allowlist` and `spc-md-off-host-href-still-refused` independently assert accept and refuse paths; latter also asserts `evil.test` never reaches `fetchFn.calls` — `scripts/probe-payload-resilience.js:1866-1949` | closed |
| T-15-35 | Spoofing | fixture hrefs reaching real network | mitigate | `installHttp` on every scenario; `evil.test` asserted absent from call log — `scripts/probe-payload-resilience.js:1943-1947` | closed |
| T-15-36 | Tampering | silent socket-contract regression | mitigate | `frontend-seq-discard-survives-socket-index-migration` drives real frontend handler through in-order/out-of-order/higher-order sequence — `scripts/probe-payload-resilience.js:1955-1998` | closed |
| T-15-37 | Information disclosure | advisory-only outage as all-clear | mitigate | `frontend-advisory-only-is-not-an-all-clear` asserts both positive and empty-advisory control — `scripts/probe-payload-resilience.js:1999-2043` | closed |
| T-15-38 | Repudiation | MPD-04 scenario passing via pre-filter | mitigate | `mpd-year-boundary-does-not-select-stale-highest-number` gives all listing entries FRESH Last-Modified timestamps so only the `ValidEndTi` gate can reject the stale-numbered entry — `scripts/probe-payload-resilience.js:2044-2056` | closed |
| T-15-39 | Tampering | silent reversal of fail-open direction | mitigate | `mpd-unparseable-validity-is-kept-not-dropped` asserts unresolvable window is kept, not dropped — `scripts/probe-payload-resilience.js:2401-2410+` | closed |
| T-15-40 | Information disclosure | broken MPD feed as "none active" | mitigate | `mpd-fetch-failure-is-stale-but-zero-results-is-not` asserts `_stale===true` on failure half and its absence on clean zero-result half — `scripts/probe-payload-resilience.js:2333-2397` | closed |
| T-15-41 | Denial of service | fixtures pinned to absolute dates | accept | Fixture times computed relative to `Date.now()` — verified throughout `scripts/probe-payload-resilience.js` (e.g. line 298+, `mpdWindowFields` calls) | closed (accepted) |
| T-15-42 | Spoofing | live UAT against spoofed feed | accept | Checkpoint directs user to `https://www.wpc.ncep.noaa.gov/kml/mpd/` (WPC's own HTTPS site) — `15-09-PLAN.md:219` | closed (accepted) |

*Status: open · closed*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-15-01 | T-15-04 | `paletteSource` is a public NOAA metadata citation URL, never fetched at runtime (verified: no caller reads `row.paletteSource`) | Plan 15-01 author | 2026-08-25 |
| AR-15-02 | T-15-07 | `makeKmzBuffer` archives are built in-process from literals authored in the repo, never from remote input (verified: sole callers pass hardcoded fixture entries) | Plan 15-02 author | 2026-08-25 |
| AR-15-03 | T-15-32 | D-07 forbids a display cap on the advisory band; polygon containment bounds the realistic count; fetch volume is separately capped by `ADVISORY_MAX_CANDIDATES` (T-15-17); rendering N spans is a local cost with no amplification | Plan 15-07 author | 2026-08-25 |
| AR-15-04 | T-15-41 | Fixture times are computed relative to `Date.now()` so the suite does not decay; residual risk is a future timezone-table change, which mutation coverage (T-15-39) would surface as RED rather than a silent pass | Plan 15-09 author | 2026-08-25 |
| AR-15-05 | T-15-42 | The UAT checkpoint directs the user to WPC's own HTTPS site (`https://www.wpc.ncep.noaa.gov/kml/mpd/`); a compromised upstream is out of scope for a single-user mirror and is the residual risk already accepted for every product in this module | Plan 15-09 author | 2026-08-25 |

*Accepted risks do not resurface in future audit runs.*

---

## Transfer Verification

| Threat ID | Transferred To | Receiving Control Verified | Status |
|-----------|-----------------|------------------------------|--------|
| T-15-28 | T-15-29 (render site, plan 15-07) | `escapeHtml` applied to both `label` and `hazardType` before `innerHTML` concatenation — `MMM-SPCOutlook.js:355,360` | verified — not a gap |

---

## Unregistered Flags

None. The only `## Threat Flags` section across all 9 plan summaries (15-02-SUMMARY.md) reports explicitly: "None — the four packages resolved are the same fixed, hardcoded specifiers named in the plan's threat model (T-15-06)... `makeKmzBuffer` only ever builds archives from in-process literals (T-15-07, accepted per plan)." No new attack surface was flagged during implementation with no threat mapping.

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-08-25 | 42 | 42 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-08-25
