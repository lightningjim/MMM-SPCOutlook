# Phase 19 — Security Audit (unified-day-report-getdom-rewrite)

**Audited:** 2026-09-07
**ASVS Level:** 1 (default, no `workflow.security_asvs` configured)
**block_on:** high (default, no `workflow.security_block_on` configured)
**Register source:** `19-01..09-PLAN.md` `<threat_model>` blocks (register authored at plan time, complete — this audit verifies each declared mitigation against the implementation; it does not scan for new threats)

## Method

For each threat, disposition determined verification method:
- `mitigate` → grep/read the implementation file(s) named in the mitigation plan; CLOSED only on a concrete code citation, never on the plan's own claim.
- `accept` → verify a written rationale exists in the plan/retirement doc; recorded below as accepted risk.
- doc-only threats (repudiation/process threats about sign-off artifacts) → verified against the `.planning/` artifact named in the mitigation plan, not code.

Probe suite re-run live during this audit: `node scripts/probe-payload-resilience.js` → **157 passed, 0 failed, 0 skipped** (matches the phase's own final sign-off number).

## Threat Verification

| Threat ID | Category | Component | Disposition | Status | Evidence |
|-----------|----------|-----------|-------------|--------|----------|
| T-19-01 | Repudiation | 19-PARITY-CHECKLIST.md sign-off | mitigate | CLOSED | `19-PARITY-CHECKLIST.md:290-295` — Sign-Off section records `node scripts/probe-payload-resilience.js` result (`157 passed, 0 failed, 0 skipped`), operator name ("Kyle (via Claude Code executor...)") and date (2026-09-07) |
| T-19-02 | Tampering | package installs | mitigate | CLOSED | `19-RESEARCH.md:83-85` Package Legitimacy Audit states zero new packages; `git log --oneline` across every 19-0N commit touches no `package.json`/lockfile |
| T-19-03 | Tampering | `days[n].proximity.nextTier` → `proximityBadge` → innerHTML | mitigate | CLOSED | `MMM-SPCOutlook.js:225-236` `hasRenderableProximity` rejects non-string/empty `nextTier`; escaping applied at every 19-05 call site (see T-19-18) |
| T-19-04 | Info disclosure | proximity subtree present when `proximityWeighting` false | mitigate | CLOSED | `node_helper.js:4405` `day1CatProximity = null` initializer, only reassigned inside `if (this._proximityWeighting)` guards (e.g. `:4418,4447`); `buildProximitySubtree` (`:4366-4372`) returns `{}` (no `proximity` key) when all entries stay null |
| T-19-05 | DoS | malformed `spcLocals.categorical[d]` taking grid down | mitigate | CLOSED | `node_helper.js:3189` `if (typeof day.risk !== "string") continue;` inside `_addSpcGridEntries`; `gridDays[String(d)]` existence pattern used consistently (`:2991,3203,3215,3243`) |
| T-19-06 | Spoofing | legacy vs unified proximity disagreeing | mitigate | CLOSED | `node_helper.js:5190-5203` — exactly 3 `buildProximitySubtree({` invocations (day1/day2/day3), single derivation spread into both the legacy literals and the unified grid |
| T-19-07 | DoS | `_resolveGridDayAutoExpand` throwing on null/non-numeric `entry.value` | mitigate | CLOSED | `node_helper.js:3582` `hasOwnProperty` gate, `:3586` `SIGNIFICANCE_NEVER` continue, `:3588` `if (typeof entry.value !== "number") continue;` before any predicate call |
| T-19-08 | Tampering | `SIGNIFICANCE_FLOOR` drifting from `DAY_SOURCE_IDS` | mitigate | CLOSED | `hazardTaxonomy.js:268` `assertTaxonomyIntegrity()`, called at module load `hazardTaxonomy.js:375` |
| T-19-09 | EoP | unknown/injected `entry.source` selecting unintended predicate | mitigate | CLOSED | `node_helper.js:3582` `Object.prototype.hasOwnProperty.call(SIGNIFICANCE_FLOOR, entry.source)` — no prototype-chain lookup possible; unknown source `continue`s (not-significant) |
| T-19-10 | Info disclosure | auto-expand surfacing source attribution | accept | CLOSED (accepted risk) | Recorded below in Accepted Risks |
| T-19-11 | Tampering | remote `hazard.text`/`label` → innerHTML in compact segment | mitigate | CLOSED | `MMM-SPCOutlook.js:778-779` `escapeHtml(truncateHazardLabel(segmentText))`; probe `wr02-unified-compact-segment-escapes-hostile-label-and-rejects-hostile-color` (`scripts/probe-payload-resilience.js:11621`) asserts `<img` never reaches render and the escaped `&lt;img` form does — verified passing live |
| T-19-12 | Tampering | remote `hazard.color` breaking out of style attribute | mitigate | CLOSED | `MMM-SPCOutlook.js:259-261` `validHazardColor` strict `/^[0-9a-fA-F]{6}$/` regex, fallback `aaaaaa`; same wr02 scenario asserts `color:#aaaaaa` on a hostile color |
| T-19-13 | DoS | unbounded remote label inflating render | mitigate | CLOSED | `MMM-SPCOutlook.js:269-274` `HAZARDS_LABEL_MAX_CHARS = 60`, `truncateHazardLabel` applied before `escapeHtml` at every call site; wr02 scenario's 200-char assertion (`scripts/probe-payload-resilience.js:~11649`) |
| T-19-14 | Spoofing | degraded/all-failed payload presenting as confident all-clear | mitigate | CLOSED | `MMM-SPCOutlook.js:683-701` — `enabledSourceCount === 0` branch precedes the `anyHazard === false && !_stale` all-clear branch; `_stale` disqualifies the shortcut; `contentMarker` (`:726`) is defense in depth |
| T-19-15 | Info disclosure | `this.spcrisk.error` rendering attacker-influenced markup | mitigate | CLOSED | `MMM-SPCOutlook.js:682` `wrapper.textContent = "Error: " + this.spcrisk.error;` — never `innerHTML` |
| T-19-16 | DoS | malformed/absent `summary`/`days` throwing out of `getDom()` | mitigate | CLOSED | `MMM-SPCOutlook.js:677-678` guarded `summary`/`summaryOk` reads; `:733,749` `if (!day \|\| typeof day !== "object") continue;` — no unguarded throw path found |
| T-19-17 | Tampering | remote label reaching `also:` line and detail label field | mitigate | CLOSED | `MMM-SPCOutlook.js:334-338` `detailColoredSpan` applies `escapeHtml(truncateHazardLabel(...))`; used at both the winner row (`:478`) and the competitor `also:` row (`:492`); literal `"also: "` text (`:491`) sits outside the colored/escaped span |
| T-19-18 | Tampering | `prox.nextTier` concatenated into markup by `proximityBadge` | mitigate | CLOSED | `MMM-SPCOutlook.js:382,391,400` — `escapeHtml(proximityBadge(prox.torCig/hailCig/windCig, mode))` on every probabilistic sub-line segment (post-Task-3 fix, `19-05-SUMMARY.md:64,95-96,154`); categorical/day-3 badges flow through `detailColoredSpan`'s own escaping (`:410,421,478`). Live-verified: `wr02-detail-sub-line-proximity-badge-escapes-a-hostile-tier-token` PASSED in this audit's probe run |
| T-19-19 | DoS | non-numeric `detail` fields producing NaN%/throwing | mitigate | CLOSED | `MMM-SPCOutlook.js:375,387,396` — each of torRisk/hailRisk/windRisk guarded with `typeof === "number" && isFinite(...) && > 0` before contributing a segment |
| T-19-20 | Info disclosure | detail mode surfacing per-source staleness/attribution scoped out | mitigate | CLOSED | `grep -c "sources\[.*\]\.stale" MMM-SPCOutlook.js` → `0` (verified live); only `SOURCE_SHORT_NAMES` attribution renders (`:307-310,326-328`) |
| T-19-21 | Repudiation | proximity badge silently changing inside/outside wording | mitigate | CLOSED | `MMM-SPCOutlook.js:358,376,388,397,416` — five independently-evaluated mode expressions (categorical shared across days 1-3 by construction, tor/hail/wind/day-3-cig each their own), each comment-tagged with its RPT-06 checklist row; documented rationale in `19-05-SUMMARY.md` key-decisions; probe `proxui-per-type-badge-modes-are-independent-of-the-day-categorical-mode` PASSED |
| T-19-22 | Tampering | advisory `label`/`hazardType` → innerHTML in relocated band | mitigate | CLOSED | `MMM-SPCOutlook.js:827,832` `escapeHtml(entry.label)` / `escapeHtml(entry.hazardType)`; probe `rpt04-band-escapes-remote-advisory-and-window-band-text` PASSED |
| T-19-23 | Tampering | window-band `label`/`color` → innerHTML | mitigate | CLOSED | `MMM-SPCOutlook.js:612-613` `validHazardColor(entry.color)` + `escapeHtml(truncateHazardLabel(entry.label))` |
| T-19-24 | DoS | non-finite/absent window-band offset producing NaN | mitigate | CLOSED | `MMM-SPCOutlook.js:608` `off()` `typeof n === "number" && isFinite(n)` coercion with `"?"` fallback; `:589-592` weekday pair omitted (not NaN) when either date is unparseable |
| T-19-25 | Spoofing | band-only payload rendering as confident all-clear | mitigate | CLOSED | `node_helper.js:3689` `const anyHazard = anyDayHazard \|\| windowBandCount > 0 \|\| advisoryCount > 0;`; probe `rpt04-band-only-payload-is-not-an-all-clear` PASSED |
| T-19-26 | DoS | unbounded window-band growth | mitigate | CLOSED | `node_helper.js:184` `HAZARDS_MAX_WINDOW_ENTRIES = 40`; cap applied at assembly `:975-980`; no second sort/re-cap found elsewhere |
| T-19-27 | Repudiation | RPT-04 relocation later investigated as regression | mitigate | CLOSED | `19-PARITY-CHECKLIST.md:281-282` — `RPT-04-RELOC` recorded CONFIRMED with authority (ROADMAP Phase 19 success criterion 4 / RPT-04 / UI-SPEC) in Sign-Off |
| T-19-28 | Tampering | remote label with `\|` colliding in window-band dedupe key | mitigate | CLOSED | `node_helper.js:951` `const key = JSON.stringify([entry.label, entry.offsetStart, entry.offsetEnd]);` |
| T-19-29 | Spoofing | `sources['wpc-hazards'].reporting === false` while band renders that source's entries | mitigate | CLOSED | `node_helper.js:3816-3819` `reporting` OR's the day-grid signal with `windowBandReported[sourceId] === true`; probe scenario at `scripts/probe-payload-resilience.js:10001` (`expected sources['wpc-hazards'].reporting true on a window-band-only poll`) PASSED |
| T-19-30 | Repudiation | unmapped remote label rendered verbatim but absent from ledger | mitigate | CLOSED | `node_helper.js:2924` `notes.noteUnmapped("wpc-hazards", match.label);` called on the window-routed branch, mirroring the day-grid twin at `:2970` |
| T-19-31 | DoS | unbounded ledger or band growth | mitigate | CLOSED | `node_helper.js:176` `UNMAPPED_LABELS_MAX_PER_SOURCE`, `:184` `HAZARDS_MAX_WINDOW_ENTRIES = 40` — both untouched by 19-07's changes (confirmed via diff of the relevant hunks) |
| T-19-32 | Info disclosure | duplicate `Log.info` emissions of remote label text | mitigate | CLOSED | `node_helper.js:2919-2926` — window-routed branch explicitly calls only `noteUnmapped`, with a comment (`:2917-2919`) stating the `Log.info` emission is NOT duplicated because the legacy build already logged it once |
| T-19-33 | Repudiation | parity row marked verified on a scenario that cannot observe it | mitigate | CLOSED | `19-PARITY-CHECKLIST.md:127-129` `## Probe Coverage` — every scenario cited was grep-verified present; `MANUAL ONLY` used for rows the harness cannot observe (7 occurrences) |
| T-19-34 | Spoofing | `NOT OBSERVABLE` row later read as PASS | mitigate | CLOSED | `19-PARITY-CHECKLIST.md` uses distinct verdict vocabulary (`PASS`/`NOT OBSERVABLE`/`MANUAL ONLY`, 43 `NOT OBSERVABLE` occurrences, each with a Notes reason); carried forward into `.planning/STATE.md:132-140` Deferred Items table |
| T-19-35 | Tampering | green probe run cited as proof while scenarios were skipped | mitigate | CLOSED | `19-PARITY-CHECKLIST.md:290-292` transcribes `157 passed, 0 failed, 0 skipped`; independently re-run during this audit with identical result |
| T-19-36 | Info disclosure | temporary lat/lon left in place after session | mitigate | CLOSED | Initially flagged `NOT CONFIRMED` in `19-08-SUMMARY.md` and `19-HUMAN-UAT.md:42-49`, then resolved by commit `30a893c` (`docs(phase-19): mark the deployed-coordinate restore resolved`) — `.planning/STATE.md` Deferred Items row now reads `RESOLVED 2026-09-07 — operator confirmed the deployed config is back on the OKC production coordinate` |
| T-19-37 | Info disclosure | 8 unrendered payload blocks continuing to traverse the socket | accept | CLOSED (accepted risk) | Recorded below in Accepted Risks |
| T-19-38 | Repudiation | future maintainer treating legacy block as live render path | mitigate | CLOSED | `19-LEGACY-RETIREMENT.md:55` sole-reader enforcement statement + `:261` sole-reader proof against current tree; probe `rpt01-getdom-reads-no-legacy-payload-block` PASSED live |
| T-19-39 | Tampering | legacy HeatRisk day-7 filter "fixed" later assuming it affects display | mitigate | CLOSED | `19-LEGACY-RETIREMENT.md:136-140` discharge section states the defect is inert (unreachable on screen, not absent from the emitted payload); todo moved to `done`: `.planning/todos/done/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md` |
| T-19-40 | DoS | attempting the ~180-assertion probe migration inside this plan | mitigate | CLOSED | `19-09-PLAN.md:175` "this plan does not attempt the migration"; `19-09-SUMMARY.md` records no migration attempted; `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md` exists, routing it to a fresh planning pass |
| T-19-SC (×8, one per sub-plan) | Tampering | npm/pip/cargo installs | mitigate | CLOSED | `git log --oneline` for every 19-0N commit touches no `package.json`/lockfile; only unrelated pre-phase-19 commits appear in `git log -- package.json package-lock.json` |

**Totals: 40/40 threats CLOSED (0 open). 2 accepted risks (T-19-10, T-19-37), both documented below.**

## Accepted Risks (documented per constraint, not blockers)

| Threat ID | Risk | Rationale | Source |
|-----------|------|-----------|--------|
| T-19-10 | Auto-expand surfaces source attribution (e.g. "SPC", "WPC Hazards") the user did not explicitly opt into via `dayReportDetail` | Attribution text is module-authored display-name text describing public NOAA products, not user or location data. D-04's own design intent is that a serious day surfaces its attribution without reconfiguration. | `19-03-PLAN.md` threat_model; `hazardTaxonomy.js` significance predicates |
| T-19-37 | Eight unrendered legacy payload blocks (`day1..day8`, `fireWeather`, `excessiveRain`, `winterImpact`, `hazardsOutlook`, `heatRisk`) continue to traverse the `node_helper` ↔ module IPC socket every poll, unrendered | Same-process socket between `node_helper` and the frontend module on a single device; carries the same public NOAA data the unified `days[]` payload already carries — no new recipient, no new content, no cross-network exposure. | `19-LEGACY-RETIREMENT.md` (full rationale); `19-09-PLAN.md` threat_model |

## Unregistered Flags (new attack surface with no threat mapping)

None. `## Threat Flags` sections exist only in `19-08-SUMMARY.md` and `19-09-SUMMARY.md` (both explicitly state "None — this plan modified only `.planning/` documentation artifacts"). Plans `19-01` through `19-07`'s SUMMARY files carry no `## Threat Flags` heading at all — no deviation in any SUMMARY (`## Deviations from Plan` sections) introduced a new network endpoint, auth path, file-access pattern, or schema change outside what its own plan's `<threat_model>` already registered.

## Notes / Observations (non-blocking)

- `git status` at audit time shows an untracked `node_modules/` and `pnpm-lock.yaml` in the working tree. `19-RESEARCH.md:83-85` explicitly disclaims these as pre-dating this phase's scope and not evaluated by it. Not a phase 19 threat-model item; flagged here only for visibility, not as an open threat.
- Probe suite independently re-run during this audit (not merely re-cited from the phase's own artifacts): `157 passed, 0 failed, 0 skipped`, matching `19-PARITY-CHECKLIST.md`'s sign-off number exactly.
