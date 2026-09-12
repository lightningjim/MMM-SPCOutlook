---
phase: 19-unified-day-report-getdom-rewrite
plan: 09
artifact: legacy-render-path retirement record
measured_at: 2026-09-07
base_commit: 30a893c201a697a1a98342a7a2f2f20c46b0836b
---

# 19 Legacy Retirement Record

This artifact re-runs and re-measures the claims plan 19-09 was authored against, on the tree as
it stands after 19-06, 19-07, 19-08 and the four gap-closure commits (`a440b31`, `512a97e`,
`87b2a96`, `fb18000`). Nothing below is copied from planning-time text without being independently
re-checked against the current source.

## Sole-Reader Proof

**Claim:** `MMM-SPCOutlook.js` reads zero legacy payload blocks. The unified day report
(`spcrisk.days[]` / `spcrisk.windowBand`) is the sole render path.

**Command run:**

```
node -e "
const fs=require('fs');
const s=fs.readFileSync('MMM-SPCOutlook.js','utf8');
const t=s.split('\n').filter(l=>!l.trim().startsWith('//')&&!l.trim().startsWith('*')).join('\n');
const bad=['spcrisk.day1','spcrisk.day2','spcrisk.day3','spcrisk.day4','spcrisk.day5','spcrisk.day6','spcrisk.day7','spcrisk.day8','spcrisk.fireWeather','spcrisk.excessiveRain','spcrisk.winterImpact','spcrisk.hazardsOutlook','spcrisk.heatRisk'].filter(b=>t.includes(b));
if(bad.length) throw new Error('legacy read: '+bad.join(', '));
console.log('OK: zero legacy accessor strings in comment-stripped MMM-SPCOutlook.js');
"
```

**Output (verbatim):**

```
OK: zero legacy accessor strings in comment-stripped MMM-SPCOutlook.js
```

Comments were stripped **before** counting (trimmed lines starting `//` or `*` are dropped), so a
comment merely naming a legacy block cannot make this proof self-invalidating.

**Permanent enforcement.** This is not a one-time observation. Plan 19-06 added the identical
check as a permanent probe scenario, `rpt01-getdom-reads-no-legacy-payload-block`
(`scripts/probe-payload-resilience.js:12385-12409`), byte-identical in method to the command
above (same comment-stripping filter, same 13-string legacy-accessor list, plus a positive check
that `getDom` reads the promoted `spcrisk.windowBand`). It ran as part of the full suite below and
passed:

```
$ node scripts/probe-payload-resilience.js 2>&1 | grep rpt01
PASS rpt01-getdom-reads-no-legacy-payload-block
```

So the sole-reader property is enforced going forward — any future commit that reintroduces a
legacy read fails the suite, not merely a manual spot-check.

**Probe suite state at measurement time:**

```
$ node scripts/probe-payload-resilience.js 2>&1 | tail -1
PROBE RESULT: 157 passed, 0 failed, 0 skipped
```

Matches the count recorded in `19-PARITY-CHECKLIST.md` / `19-08-SUMMARY.md` (154 → 157 after the
19-08 gap-closure commits). No regression since RPT-06 sign-off.

## Folded Todo — Legacy HeatRisk Day-7 Drop

**Defect:** `node_helper.js:1152-1153`'s legacy day-offset filter in `_runHeatRiskProduct`
(`if (d < 1 || d > row.days) continue;`) drops day 7 from the legacy `heatRisk.day1..day7` block
for roughly 12 of every 24 hours (the 00Z-12Z UTC window), because HeatRisk's `idp_validtime` sits
at exactly 12:00Z while `_todayUtcMs()` anchors to UTC midnight — during the 00Z-12Z half of a UTC
day the oldest mosaic tile resolves to offset 0 and is discarded, so nothing maps to day 7.

**Provenance:** pre-existing `feat(17-04)` defect (confirmed by `git blame`), predates both Phase
18 and Phase 19. Not a regression introduced by either phase. Root-caused and live-observed
2026-09-05 during the Phase 18-12 checkpoint; full trace in
`.planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md`.

**Why the unified path is unaffected:** the unified `days[]` grid pushes every deduped HeatRisk
tuple (`gridTuples.push(...)`, `node_helper.js:1151`) **before** the `_todayUtcMs`-relative offset
filter runs, specifically to avoid this exact drop (18-03's design, documented inline at
`node_helper.js:1122-1149`). Live-captured evidence: `18-LIVE-CAPTURE.md` records
`"heatrisk": {..., "reportedDays":[1,2,3,4,5,6,7], ...}` — all seven days present.

**Discharge.** 19-CONTEXT.md's Folded Todos section states this phase's only stated obligation is
"confirm the unified path is the sole reader before the legacy block is retired" — no code fix is
required. The Sole-Reader Proof above satisfies that obligation directly: `getDom()` never reads
`spcrisk.heatRisk` (the legacy block), so the legacy filter at `:1152-1153` cannot reach the
screen through any render path that exists today. The code at `:1152-1153` still exists in
`node_helper.js` — it has not been deleted — but it is now **inert**: it still runs on every poll,
still drops day 7 from the *legacy `heatRisk` block it populates*, but that block has no reader.
The defect disappears entirely (not just becomes unreachable) the moment the backend emission is
deleted, per the Measured Cost section below.

**Precision on what "discharged" means:** unreachable **on screen**, not absent from the **emitted
payload**. `node_helper.js:1152-1153` still executes every poll and the legacy `heatRisk` block it
produces (with day 7 dropped roughly half the time) still crosses the backend->frontend socket
inside the payload object — it is simply never read by `getDom()`. See T-19-37 in the plan's
threat model, which accepts this residual transit as low-risk (same-process socket, no new
recipient, no new content beyond what the unified payload already carries).

The todo file
`.planning/todos/pending/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md`
has been moved to `.planning/todos/done/` with a resolution note appended (see that file).

## Folded Defect — Legacy `hazardsOutlook.dayN` Offset Labelling

A second pre-existing defect in the same retiring block, documented but explicitly **not fixed**
by 19-08's gap-closure commit `fb18000` (per that commit's own note and the matching STATE.md
deferred-items row: "Documented, not fixed — 19-09 retires the legacy block").

**Defect:** the legacy `hazardsOutlook.dayN` keys are built directly from `row.dayRangeTotal`'s raw
0-based day-offset span, not the 1-based NWS day the entry actually represents:

```
node_helper.js:915-916, 920
const block = {};
for (let d = row.dayRangeTotal[0]; d <= row.dayRangeTotal[1]; d++) {
  const date = this._utcDateString(todayUtcMs + d * MS_PER_DAY);
  ...
  block["day" + d] = { date, hazards };
```

`assertHazardsBlockIntact` (`scripts/probe-payload-resilience.js:1275-1298`) independently confirms
the shape this produces: keys `day3` through `day14` (13 keys total: `day3..day14` + `windowBand`).
Because the key is the raw offset rather than the NWS day number, this block cannot represent an
offset-2 (NWS Day 3) feature at all — that offset falls below the block's own `day3` floor, one day
lower than the range the legacy block claims to start covering.

**Why the unified `days[]` grid is unaffected:** the grid's day-bucket assignment
(`_addHazardsOutlookGridEntries` / `_bucketHazardMatch`, `node_helper.js:2790-2870`) resolves grid
day membership independently of this block-construction loop and is not implicated by this defect.

**Discharge — same precision as above.** This defect is unreachable **on screen** for the identical
reason as the HeatRisk drop: the Sole-Reader Proof shows `getDom()` never reads
`spcrisk.hazardsOutlook`. It is **not discharged from the emitted payload** — `node_helper.js`
still builds and emits this mislabelled block on every poll, and it will keep doing so until the
emission is deleted. Both folded defects share one discharge mechanism (no reader) and one
remaining live-payload status (present, mislabelled/lossy, until deletion) — this record treats
them as a matched pair for that reason, not as separately-resolved items.

## What the RPT-06 Sign-Off Did and Did Not Establish

19-08 closed RPT-06 with **5 PASS, 30 NOT OBSERVABLE, 0 FAIL** across the 35-row parity checklist
(`19-PARITY-CHECKLIST.md`, `19-HUMAN-UAT.md`). Three rows — **1, 2, and 8** — carry **no evidence
from either verification leg**: `MANUAL ONLY` in Probe Coverage (no scenario constructs an
unset-`spcrisk` render, an `{error}` render, or a real `moment().fromNow()` age string, which the
harness stubs to a constant) **and** `NOT OBSERVABLE` in both live-run columns.

This matters directly to the safety of deleting the legacy blocks. The eight legacy payload blocks
are, by 18 D-01's own design, the **only old-versus-new reference** available for catching a
silent parity break between the retired render path and the unified one — they were kept
byte-for-byte specifically so RPT-06 would have something to diff against. With 30/35 rows
resting on probe-suite mechanism-proof rather than live observation, and 3 rows resting on
neither, the legacy blocks remain the single artifact that could still surface a parity
regression the checklist itself could not directly observe. Deleting them removes that reference
permanently — this is exactly the tradeoff Task 2 asks the operator to weigh, not a reason to
avoid deletion, but a reason the timing question is real rather than a formality.

## Backend-Emission Deletion — Measured Cost

Planning-time figures quoted in this plan's `<objective>`: **156** `assertPayloadIntact` call
sites, **180** assertions reading `out.day1..day8` / `.fireWeather` / `.excessiveRain` /
`.winterImpact` / `.hazardsOutlook` / `.heatRisk`, across **124** scenarios. All three were
re-measured against the current tree, not copied.

**1. `assertPayloadIntact` call sites**

```
$ grep -c "assertPayloadIntact" scripts/probe-payload-resilience.js
172
```

**Delta: 156 → 172 (+16, +10.3%)** since planning time — consistent with 19-06/19-07/19-08 adding
new scenarios that each call this shared oracle.

**2. Legacy-field assertions**

```
$ grep -c "out\.\(day[1-8]\|fireWeather\|excessiveRain\|winterImpact\|hazardsOutlook\|heatRisk\)\b" scripts/probe-payload-resilience.js
198
```

**Delta: 180 → 198 (+18, +10.0%)**, tracking the call-site growth proportionally.

**3. Scenario count**

```
$ grep -c "^    name:" scripts/probe-payload-resilience.js
158
```

**Delta as literally run: 124 → 158 (+34, +27.4%)**. This command counts every scenario-name
declaration in the file, and it was cross-checked against the actual run output rather than
trusted blind: `node scripts/probe-payload-resilience.js` reports **157** scenario results
(157 passed, 0 failed, 0 skipped), one fewer than the grep count. The discrepancy is a real
false-positive in the literal grep pattern, not a suite miscount — `scripts/probe-payload-resilience.js:400`
contains `name: "Pixel",` inside the `heatRiskIdentifyResponse` fixture helper (an ArcGIS
identify-response builder, unrelated to the `scenarios` array), which coincidentally matches the
4-space-indented `name:` pattern. **Corrected scenario count: 157**, delta **124 → 157 (+33,
+26.6%)**. This growth is plausible and traceable: 19-08's own SUMMARY records the suite growing
154→157 in that plan alone, and 19-06/19-07 each added scenarios of their own before that,
consistent with a 124-at-planning-time baseline that predates all three plans landing.

**What `assertPayloadIntact` itself asserts** (`scripts/probe-payload-resilience.js:1148-1270`),
by dispatching on each `PRODUCT_REGISTRY` row's `kind`:

| Legacy key(s) | Registry `kind` | Assertion |
|---|---|---|
| `day1`..`day8` (top level) | — (hardcoded loop) | each present and an object |
| `day48Risk` | — (hardcoded) | boolean |
| `fireWeather.day1Risk..day8Risk`, `.day1Text..day8Text` | — (hardcoded) | all 16 keys present |
| `excessiveRain.day1..day5` × {Risk,Text,...} | `arcgis-day-layers` | key count == `row.days * ERO_SUFFIXES.length`; per-day keys present; `dayNRisk` is a valid tier |
| `winterImpact.day1..day5` × {Risk,Text,...} | `arcgis-day-layers` | same shape check as `excessiveRain` |
| `heatRisk.day1..day7` | `arcgis-identify-point` | delegates to `assertHeatRiskBlockIntact` — 7 keys, each `{category,color,text}` |
| `hazardsOutlook.day3..day14` + `windowBand` | `arcgis-hazard-window` | delegates to `assertHazardsBlockIntact` — exactly 13 keys, each day entry `{date,hazards[]}` |
| `advisories.{spcMD,mpd}` | `kml-advisory` | each an array |

The `arcgis-day-layers`/`arcgis-hazard-window`/`arcgis-identify-point`/`kml-advisory` dispatch is
unconditional and throws on any undeclared `kind` (17-REVIEW WR-05's "covered the moment it is
declared" guarantee) — which is exactly why deleting any one legacy block fails essentially every
scenario that calls `assertPayloadIntact` at once, rather than failing only the scenarios that
target that block specifically.

**Scope of the resulting work**, stated explicitly per the plan's requirement: deleting the eight
legacy payload blocks (`day1..day8`, `fireWeather`, `excessiveRain`, `winterImpact`,
`hazardsOutlook`, `heatRisk`, `advisories`) from `node_helper.js`'s emitted payload requires, at
minimum:

1. Rewriting `assertPayloadIntact` (and its two delegate functions,
   `assertHeatRiskBlockIntact`/`assertHazardsBlockIntact`) to assert against the unified
   `days[]`/`windowBand` shape instead of the eight legacy blocks.
2. Re-pointing every one of the (corrected) 198 legacy-field assertions across the (corrected) 157
   scenarios at the unified payload's equivalent field.
3. Re-establishing 15 D-10 mutation proof (break the exact line, confirm RED with a diagnosable
   message, restore) for each re-pointed scenario — the real cost, since a scenario that stays
   green after its target assertion is rewritten but was never re-verified to catch a real
   regression is a fixture defect per the standing D-10 rule, not evidence of correctness.

A scoped backlog item for this work has been written to
`.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`,
carrying these measured counts, naming the three affected surfaces, and noting that plans 19-02
and 19-06 already removed the two reasons the legacy blocks were still load-bearing (proximity and
the window band both now live in the unified payload).

## Decision

**Selected: option-a — defer the emission deletion to its own follow-up.**
**Decided by:** the operator, at plan 19-09's Task 2 blocking decision checkpoint.
**Date:** 2026-09-07.

Verbatim selection: *"Defer to its own pass (Recommended)"*.

### What this means concretely

Phase 19 closes having met PROJECT.md's v2.0 end state: the unified day report is the sole
**render** path with no legacy fallback. That was achieved by plan 19-06 and is held in place by
the permanent gate scenario `rpt01-getdom-reads-no-legacy-payload-block`, re-verified against the
current tree in this artifact's sole-reader proof above.

`node_helper.js` continues to build and emit the eight legacy payload blocks on every poll. Nothing
reads them, so nothing on screen is affected, and the probe suite stays exactly as it is — 157
passed, 0 failed, 0 skipped, every scenario still individually mutation-proven under 15 D-10.

### What remains broken, stated plainly

Deferring is not the same as discharging. Both folded defects are unreachable **on screen** but
remain live **in the emitted payload** until the follow-up lands:

- Legacy `heatRisk.day1..day7` still drops day 7 for roughly 12 of every 24 hours (the 00Z-12Z UTC
  window), the pre-existing `feat(17-04)` defect. `node_helper.js:1152-1153`.
- Legacy `hazardsOutlook.dayN` keys are still labelled by raw 0-based offset rather than the 1-based
  NWS day they hold, and still cannot represent an offset-2 (NWS Day 3) feature at all.
  `node_helper.js:915-920`. Documented but deliberately not fixed by 19-08's `fb18000`.

The unified `days[]` grid is unaffected by both.

### Why this was the right call with the measured numbers in hand

The cost measured at Task 1 came in materially above the plan's planning-time estimate — 172
`assertPayloadIntact` call sites (from 156), 198 legacy-field assertions (from 180), 157 scenarios
(from 124), and still growing plan over plan. `assertPayloadIntact` dispatches unconditionally on
every `PRODUCT_REGISTRY` row kind and throws on an undeclared kind, so deleting any single legacy
block fails essentially every scenario that calls it: there is no incremental path, only a
whole-suite migration.

The decisive consideration is not size, though. The legacy blocks are the only old-versus-new
reference left that could still catch a silent parity break, and RPT-06 signed off at 5 PASS /
30 NOT OBSERVABLE / 0 FAIL, with checklist rows 1, 2 and 8 carrying no evidence from either
verification leg. Removing the last reference immediately after a sign-off resting that heavily on
mechanism proof rather than live confirmation is exactly the moment a silent break would be
hardest to attribute. Deferring keeps the reference available for the follow-up to check against.

### Carried forward

- Backlog item: `.planning/todos/pending/2026-09-07-delete-legacy-payload-block-emission-and-migrate-probe-suite.md`,
  carrying the measured counts as scope input.
- A matching row in `.planning/STATE.md`'s deferred-items table citing this artifact.
