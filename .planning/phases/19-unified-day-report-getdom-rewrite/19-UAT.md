---
status: complete
phase: 19-unified-day-report-getdom-rewrite
source: [19-01-SUMMARY.md, 19-02-SUMMARY.md, 19-03-SUMMARY.md, 19-04-SUMMARY.md, 19-05-SUMMARY.md, 19-06-SUMMARY.md, 19-07-SUMMARY.md, 19-08-SUMMARY.md, 19-09-SUMMARY.md]
started: 2026-09-09T00:00:00Z
updated: 2026-09-09T12:00:00Z
---

## Current Test

[testing complete]

## Tests

### 1. Deployed Coordinate Restore
expected: Deployed config.js carries your production lat/lon and normal flags — not a leftover substitute coordinate or `dayReportDetail: true` from the 2026-09-07 manual runs. (19-08 flagged this restore as NOT CONFIRMED in the operator record.)
result: pass
reported: "Pass on my local, not on the latter though that is because I intended to leave dayReportDetail enabled for the moment."
note: "lat/lon restored — 19-08's NOT CONFIRMED deferred item is discharged. dayReportDetail:true is deliberately left on by the operator, not leftover state; session resequenced so detail-mode tests (5) run first, then one flip to false covers tests 3 and 6." 

### 2. Cold Start Smoke Test
expected: Restart MagicMirror from scratch on the Pi. The module boots with no errors in the MM log, the first poll completes, and the module paints live SPC/WPC content (or a legitimate all-clear) rather than staying blank or stuck on the loading state.
result: pass
note: "First cold boot on the current tree (21 commits since the 2026-09-07 hardware run)." 

### 3. Day Rows Render — Compact Mode
expected: One line per active day, newest-first by day number, each showing the day's weekday, its dimension/label text in the source's color, and a proximity badge where applicable. Long labels truncate at 60 characters of the entry's own text (not counting the dimension prefix), with no run-together or mid-word visual break.
result: pass
note: "Re-run on a89e981 with dayReportDetail:false. Operator: 'yes it works fine'. Compact rows read cleanly — weekday, colored label text, entries separated by the middot."


### 4. All-Clear States Read Honestly
expected: With nothing active at your location, the module shows plain "No Hazards Forecast". If you switch off every hazard display flag while data IS present, it instead reads "No Hazards Forecast (filtered by settings)" — blaming your config, not the data. Neither state ever appears while real hazard content exists.
result: skipped
reason: "NOT OBSERVABLE at the deployed coordinates (35.4432156, -97.595822) this session — no active SPC MD or WPC MPD, no window-band entry, no proximity-only day, nothing stale, and live hazards present so no all-clear state. Same disposition the 19-08 run applied to 30 of its 35 parity rows. Forcing these requires a substitute coordinate; deferred rather than fabricated." 

### 5. Detail Mode Sub-Rows and Column Alignment
expected: With `dayReportDetail: true`, each day expands into per-dimension sub-rows. Winner rows and their `also:` competitor lines line up in the same column — the em dashes form a straight vertical line — including for a long/unmapped dimension name. Two co-equal hazards in one dimension (e.g. Heavy Snow + Freezing Rain on a winter day) render as peers, not with one demoted to `also:`.
result: issue
reported: "Yes [width still pushes into the center column, confirmed on a89e981 with dayReportDetail genuinely enabled]"
severity: major
also_confirmed_passing: "Detail flag now reaches the renderer — Days 2/3/5/6/7 expand into sub-rows, not just the auto-expanded Days 1/4. No extra chrome distinguishes an auto-expanded day from a globally-expanded one (D-04 holds). Source-attribution em dashes form a straight vertical column."
prior_reported: "This still seems to have a huge left-expansion on it. Actually goes into the Center column on the display itself"
prior_severity: major
invalidated_because: "Observed against deployed ca2a3f3 (21 commits behind main) AND with global detail mode never actually active — config carried the misspelled key dayReportDetails, so every expanded day came from autoExpand alone. Re-observing on a89e981 with dayReportDetail: true genuinely set." 
partial_pass: "Em dash column alignment confirmed straight in the operator screenshot; co-equal hazards (Flash Flood Marginal / Heat Extreme on Day 1) confirmed rendering as peers, not as `also:` competitors. The alignment and co-winner fixes hold; the defect is block width."
evidence: "Operator screenshots, before (loading state, narrow region) vs after (rendered, region expands leftward into the center column). Compact rows are also displaced left, not only detail sub-rows." 

### 6. Auto-Expand Matches Global Detail
expected: With `dayReportDetail: false`, a day carrying a significant-enough hazard expands on its own into sub-rows, and that expanded day looks byte-identical to how it renders with global detail on — no extra heading, badge, or chrome marking it as auto-expanded.
result: pass
note: "Days 1 and 4 (Heat Extreme / Heat Major) expand on their own with the flag false, while Days 2/3/5/6/7 stay compact. With the flag true all seven expand and Days 1/4 carry no distinguishing chrome. D-04 'No Chrome for Auto-Expand' holds in both directions." 

### 7. Advisory and Window Bands Sit Below the Days
expected: SPC MD / WPC MPD advisories render as a combined band BELOW all day rows (not above them, not interleaved), immediately followed by the Hazards Outlook window band. The Extended Hazards heading appears exactly once, and only when an entry actually renders under it.
result: skipped
reason: "NOT OBSERVABLE at the deployed coordinates (35.4432156, -97.595822) this session — no active SPC MD or WPC MPD, no window-band entry, no proximity-only day, nothing stale, and live hazards present so no all-clear state. Same disposition the 19-08 run applied to 30 of its 35 parity rows. Forcing these requires a substitute coordinate; deferred rather than fabricated." 

### 8. Window Band Day Labels Agree With the Grid
expected: A window-band entry's day range never names a day the grid doesn't show. A window that started before today renders open at the low end (e.g. "through Fri (→D4)") rather than claiming a day-0 or a past start.
result: skipped
reason: "NOT OBSERVABLE at the deployed coordinates (35.4432156, -97.595822) this session — no active SPC MD or WPC MPD, no window-band entry, no proximity-only day, nothing stale, and live hazards present so no all-clear state. Same disposition the 19-08 run applied to 30 of its 35 parity rows. Forcing these requires a substitute coordinate; deferred rather than fabricated." 

### 9. Proximity-Only Day Renders
expected: A day with no hazard of its own but a nearby-risk proximity badge still renders — the badge alone on its row, with the two-space gap — rather than that day silently vanishing from the report.
result: skipped
reason: "NOT OBSERVABLE at the deployed coordinates (35.4432156, -97.595822) this session — no active SPC MD or WPC MPD, no window-band entry, no proximity-only day, nothing stale, and live hazards present so no all-clear state. Same disposition the 19-08 run applied to 30 of its 35 parity rows. Forcing these requires a substitute coordinate; deferred rather than fabricated." 

### 10. Stale Badge
expected: When a feed goes stale (kill network to the Pi briefly, or wait past the poll interval with the source unreachable), a stale badge renders FIRST, above all content, and the day content beneath it still displays rather than being replaced by an all-clear.
result: skipped
reason: "NOT OBSERVABLE at the deployed coordinates (35.4432156, -97.595822) this session — no active SPC MD or WPC MPD, no window-band entry, no proximity-only day, nothing stale, and live hazards present so no all-clear state. Same disposition the 19-08 run applied to 30 of its 35 parity rows. Forcing these requires a substitute coordinate; deferred rather than fabricated." 

### 11. Loading and Header Copy Names Only SPC
expected: User-facing strings describe what the module actually aggregates. Observed: loading text reads "Loading SPC Outlook..." and the section header reads "SPC FORECAST", but the module now renders SPC convective/fire, WPC ERO, WPC WSSI, WPC hazards and HeatRisk.
result: issue
reported: "Also this is old text, too, since this is now a colleciton of NOAA Outlooks"
severity: minor

### 12. First Paint Blocked by Serial Feed Timeouts
expected: The module reaches a painted state promptly after restart, or shows partial content as feeds resolve. Observed: every feed times out to a stale fallback at ~15s, serially across ~40 feeds, leaving "Loading SPC Outlook..." on screen for ~10 minutes with intervening ticks logged as "poll already in flight, skipping this tick".
result: issue
reported: "Stuck at \"Loading SPC Outlook...\""
severity: minor
note: "Reframed after diagnosis. Cause was upstream feed degradation: every source timing out to a stale fallback at ~15s, serially across ~40 feeds. NOT a defect in this phase's work and NOT reproducible under a healthy network — after redeploy, cold start measured 9166ms then 4388ms backend interval. Downgraded from major to minor; the standing recommendation (overall poll deadline or progressive render) remains valid as resilience work, not a phase-19 regression." 

### 13. Misspelled Config Key Silently Ignored
expected: A config key the module does not recognise is surfaced to the operator. Observed: deployed config.js carried `dayReportDetails: false` (plural) while the module defines and reads `dayReportDetail` (singular, MMM-SPCOutlook.js:39, read at :1142 and :1219). MagicMirror merges unknown keys silently, so the flag was never read and the operator believed detail mode was enabled when it never was. Cost real debugging time during this session.
result: issue
reported: "I can't tell a difference between dayReportDetails enabled or disabled"
severity: minor
resolution: "Operator config corrected on the Pi to `dayReportDetail: true` (backup at ~/MagicMirror/config/config.js.bak-19uat). Not a phase-19 code defect; recorded as a product gap — the module could warn on unrecognised keys in its own config block."

## Summary

total: 13
passed: 4
issues: 4
pending: 0
skipped: 5
blocked: 0

## Gaps

- truth: "Detail-mode day report renders within the MagicMirror region it is assigned, without widening the region or overlapping neighbouring columns"
  status: failed
  reason: "User reported: This still seems to have a huge left-expansion on it. Actually goes into the Center column on the display itself"
  severity: major
  test: 5
  hypothesis: "19-05 pads the dimension and label fields to DIMENSION_FIELD_WIDTH / DETAIL_LABEL_FIELD_WIDTH with literal space runs inside white-space:pre-wrap monospace spans. The space-run padding sets a large min-content width and MagicMirror sizes the region to its content, so the block claims horizontal space instead of wrapping. Compact rows are displaced too, which implicates the shared field padding rather than renderDaySubRows alone."
  root_cause: ""
  artifacts: []
  missing: []
  debug_session: ""
  reconfirmed: "Re-observed 2026-09-09 on a89e981 with dayReportDetail:true genuinely in effect. Width defect persists; the also:-column fix (84895f6) did not address it."
  root_cause: "Detail rows buy the UI-SPEC em-dash column alignment with literal space padding inside white-space:pre-wrap monospace spans. MMM-SPCOutlook.js:644 builds paddedFieldContent = dimensionField + labelContent.padEnd(DETAIL_LABEL_FIELD_WIDTH), with DETAIL_LABEL_FIELD_WIDTH = 23 (:391) and DIMENSION_FIELD_WIDTH derived from the longest DIMENSION_LABELS entry (:385). Every row therefore carries a minimum of 2 + DIMENSION_FIELD_WIDTH + 23 monospace characters that pre-wrap forbids collapsing, setting a hard min-content width. MagicMirror sizes the region to its content, so the module claims more width than its neighbours and overlaps the centre column. An 8-char label such as 'Moderate' emits 15 trailing spaces before the attribution — the visible gap on Day 3 (Fri)."
  artifacts:
    - path: "MMM-SPCOutlook.js:385-391"
      issue: "DIMENSION_FIELD_WIDTH / DETAIL_LABEL_FIELD_WIDTH define the column grid in literal characters"
    - path: "MMM-SPCOutlook.js:644-648"
      issue: "Winner row pads label content with literal spaces inside a pre-wrap monospace span"
    - path: "MMM-SPCOutlook.js:665-674"
      issue: "also: rows use the same literal-space indent strategy"
  missing:
    - "Achieve the em-dash column alignment with CSS (inline-block ch widths or a grid/table) instead of literal space padding, so min-content width is not inflated"
    - "UI-SPEC amendment: DETAIL_LABEL_FIELD_WIDTH = 23 is spec-locked as an exact character count ('do not round or approximate it'); a CSS-column approach changes that contract and needs the same kind of spec update BL-03 made"
    - "A regression guard that pins rendered block width, not just character alignment — the existing probes assert column indices and so pass while the layout overflows"
  debug_session: ""

- truth: "User-facing copy names the products the module actually aggregates"
  status: failed
  reason: "User reported: Also this is old text, too, since this is now a colleciton of NOAA Outlooks"
  severity: minor
  test: 11
  artifacts:
    - path: "MMM-SPCOutlook.js"
      issue: "Loading string 'Loading SPC Outlook...' and header 'SPC FORECAST' name only SPC; module renders SPC convective/fire, WPC ERO, WPC WSSI, WPC hazards, HeatRisk"
  missing: []

- truth: "Module reaches a painted state promptly after restart, or paints progressively as feeds resolve"
  status: failed
  reason: "User reported: Stuck at 'Loading SPC Outlook...'. Log shows serial ~15s stale-fallback timeouts across ~40 feeds (~10 min to first paint); ticks skipped as 'poll already in flight'."
  severity: major
  test: 12
  evidence: "mm-out.log 2026-09-09 11:26:38 -> 11:28:23, one stale fallback per ~15s"
  artifacts: []
  missing:
    - "Overall poll deadline, or progressive render as sources resolve, so a degraded network does not hold first paint for minutes"

