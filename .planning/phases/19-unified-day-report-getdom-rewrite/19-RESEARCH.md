# Phase 19: Unified Day Report — getDom() Rewrite - Research

**Researched:** 2026-09-06
**Domain:** Vanilla-JS MagicMirror² frontend rendering (no build step, no framework, no test framework); consuming a backend-precomputed merge payload
**Confidence:** HIGH (payload shape, code inventory, probe-harness mechanics — all read directly from source/live artifacts) / MEDIUM (UX judgment calls: row-budget policy, auto-expand tier thresholds, band ordering — these are design decisions research can inform but not verify against an external standard)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

- **D-01: day blocks are labeled `Day N (Weekday)`** (e.g. `Day 3 (Thu)`). Weekday derived from the payload's resolved UTC `date`, **never** `dowToText(dow + N)` (Pitfall 9). `windowStart`/`windowEnd` are on every day entry.
- **D-02: compact hazards are worded `<Dimension> <Label>`** (`Convective Enhanced · Flash Flood Slight · Heat Major`), dot-separated, each in its payload color. Dimension comes from 18 D-05's resolved taxonomy field.
- **D-03: days with no surviving hazard are skipped entirely** (`suppressedBy === null` — matches today's NONE-skip). Non-contiguous rendered day list, no marker for skipped days. Interacts with D-08 (a proximity-only day is *not* quiet).
- **D-04: `dayReportDetail` is a global config boolean, plus per-day auto-expand.** No per-day click-to-expand (no pointer/keyboard on a mirror). Auto-expand must NOT require a cross-dimension severity ranking (18 D-15 rejected building one).
- **D-05: expanded days group sub-rows by dimension** — resolved entry first, competing entries indented as `also:`. All entries render (18 D-03). Frames suppression as competing claims resolved, never one source silencing another (carries 18 D-13 forward).
- **D-06: an expanded day keeps its compact line as a header**, sub-rows beneath. Every hazard restated once (accepted cost).
- **D-07: proximity badges and the SPC probabilistic breakdown are detail-only.** Categorical badge on the convective sub-row; tornado/hail/wind icon line (percentages, CIG ①②③ markers, per-type proximity badges) as a sub-line beneath it, matching 18 D-05's `detail` sub-object treatment. Accepted cost: default config shows neither, recorded on the RPT-06 checklist as a deliberate relocation, not a removal.
- **D-08: `proximityWeighting: true` makes proximity content** — a proximity-only day renders in compact, badge alone (`0.3 (near Marginal)`). Deliberate exception to D-03 and D-07, scoped to a flag that defaults false.
- **D-09: the stale indicator stays exactly as it is today** — one global `⚠ Stale — <ago>` line off `_stale`/`_staleAsOf`, CR-01 guard retained. Positioned relative to the new day blocks; content/guard unchanged. Per-source staleness stays unrendered (out of scope for v2.0 per PROJECT.md).
- **Folded todo — legacy HeatRisk day-7 drop: no fix needed.** The unified `days[]` grid already carries all seven days correctly; the defect retires with the legacy block. Obligation: confirm the unified path is the sole reader before the legacy block retires.

### Claude's Discretion

- **Row budget / compact-line truncation** — 18 D-15 emits every survivor uncapped; pick a policy from the real worst-case survivor count. Any cut must be deterministic (taxonomy-order-based, not width-dependent).
- **The auto-expand trigger for D-04** — hard constraint: no cross-dimension severity ranking. A per-dimension significance floor declared beside `hazardTaxonomy.js`'s precedence table satisfies this; a hazard-count trigger or a priority-source list also satisfy it.
- **Render mechanism** — `innerHTML +=` string concatenation (today) vs. `createElement`/`textContent`. Not discussed; Claude's call. Weigh that `textContent` makes WR-02's defect class structurally impossible, against diff size during a parity-gated phase. No CSS file ships today — every color is inline `style="color:#..."`.
- **Legacy block retirement timing** — outcome is fixed (unified report is the sole path); whether backend emission is deleted in this phase or after parity sign-off is a sequencing call. The reference must exist while the checklist is being worked.
- **Empty-state copy for RPT-05** — 18 D-16 locks the mechanism (`summary.anyHazard` + `sources[]` to separate all-quiet/all-failed/all-disabled). Carried-in item 2 (`wpc-hazards` `reporting: false`) must be fixed before keying display off `sources[id].reporting`.
- **Band layout for RPT-04** — ordering of MDs, MPDs, and window-spanning Hazards Outlook entries; whether visually separated; multi-day span wording. Carried-in IN-01 is fixed here.
- **RPT-06 parity-run mechanics** — how the two mandatory states are produced, and whether the old renderer stays runnable side-by-side to diff against.
- Internal function decomposition and file placement.

### Deferred Ideas (OUT OF SCOPE)

- Per-product staleness UX (data already emitted by 18 D-04; display work only, explicitly out of scope for v2.0).
- Runtime `dayReportDetail` toggling via socket notification (no runtime control surface exists today).
- Cross-dimension severity ranking (18 D-15 rejected building one; nothing has derived it since).

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| RPT-01 | One block per day merging all enabled sources; no per-product row sections remain | "The Actual Payload Shape" + "Architecture Patterns" give the exact `days[]`/`sources[]` fields to drive one renderer off; "Don't Hand-Roll" flags the WR-08 day-span class this structurally retires |
| RPT-02 | Compact single line per day by default | "Worst-Case Survivor Count" gives the real max (8, structurally bounded) that a compact line must accommodate; "Row Budget" recommendation |
| RPT-03 | Detail-mode source-labeled sub-rows | "The `detail` Sub-Object Is Not Uniform" finding — day 1-2, day 3, and days 4-8 convective entries carry three *different* `detail` shapes; sub-row rendering must branch on shape, not assume uniformity |
| RPT-04 | Non-day-scoped items (MD/MPD/window-spanning) in a separate band below day blocks | "Band Layout for RPT-04" — today MD/MPD render *above* the day rows; this requirement is a genuine reordering, not a parity target. IN-01 fix scoped here |
| RPT-05 | Correct empty state when nothing active | "Carried-In Item 2" — the exact root cause and fix shape for `sources['wpc-hazards'].reporting`/`unmappedLabels` before keying empty-state wording off `sources[id].reporting` |
| RPT-06 | Full behavior-parity checklist against 4 milestones of `getDom()` history | "The RPT-06 Behavior-Parity Checklist" — the single most load-bearing artifact in this document: every distinct branch in the current `getDom()`, its defect-ID provenance (verified against PROJECT.md's changelog, not inferred), and its source line |

</phase_requirements>

## Summary

Phase 18 shipped a fully-resolved, always-complete payload (`days["1".."14"]`, `summary`, `sources`, `advisories`, plus the byte-for-byte-preserved legacy blocks). Phase 19's job is narrower than it looks: **read that payload and lay it out** — no new fetch, no new precedence logic, no new merge decision. The actual risk is almost entirely in *not silently dropping* one of the ~25 independently-shipped display behaviors accumulated across four milestones (v1.0 BUG-01..04, v1.1 FWXT-01..05, v1.2 PROX-01..06/PROXUI-01..05, plus the Phase 14-18 WR-*/T-16-*/CR-* frontend guards), while simultaneously satisfying nine locked layout decisions that *deliberately* change where several of those behaviors appear (D-07 relocates proximity/probabilistic detail; RPT-04 relocates MD/MPD from above the day rows to a band below them).

Three findings materially change how this phase should be planned. First, the payload's `detail` sub-object on a `convective` entry is **not one shape** — days 1-2 carry `{probRisk, torRisk, torCig, hailRisk, hailCig, windRisk, windCig}`, day 3 carries only `{probRisk, cig}` (a single combined CIG, no per-hazard-type breakdown), and days 4-8 carry `{probRisk, sign}` (no CIG/percentages at all, and `sign` has never been rendered by any shipped `getDom()`). D-07's `🌀② 10% ⬚① 30% 💨 15%` sub-line is only ever renderable for days 1-2; the renderer must branch on which fields are present, not assume every convective entry supports the full breakdown. Second, the maximum number of compact-line survivors on any single day is a **structural fact, not an estimate**: exactly 8 (one per `DIMENSIONS` entry), achievable only on grid days 3-5 (the only days where all six day-scoped sources' coverage windows overlap). This closes the row-budget question with a proof rather than a live-data guess. Third, the project already has a working, dependency-free mechanism for driving `getDom()` outside a browser (`scripts/probe-lib/module-stubs.js`'s `loadFrontendModule`/`renderDom`, used by 15+ existing probe scenarios) — but its `document` stub is a flat object with no real element tree, so it only supports the current `innerHTML +=` string-concatenation style. Switching to `createElement`/`appendChild` would require rewriting that stub before any of the existing frontend probe scenarios (or new RPT-06 ones) could run against the new code.

**Primary recommendation:** Keep `wrapper.innerHTML += ...` string concatenation as the render mechanism (matches the existing probe harness, keeps this already-highest-regression-risk phase from also carrying a parallel test-infrastructure rewrite), and close WR-02 by disciplined `validHazardColor()`/`escapeHtml()` application to every remote-influenced field in the new unified renderer — not by a mechanism change. Build the RPT-06 checklist (below) as a literal task-tracking artifact before writing any new render code, per Pitfall 9's explicit instruction.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Day-block layout, compact/detail rendering, band placement | Browser / Client (`MMM-SPCOutlook.js:getDom()`) | — | Pure presentation over an already-resolved payload; no new computation |
| Precedence resolution, dimension merge, `summary`/`sources` rollup | Backend (`node_helper.js`, Phase 18) | — | Out of scope for this phase — RPT-07 already holds; the renderer must never recompute this |
| `sources['wpc-hazards']` metadata correction (carried-in item 2) | Backend (`node_helper.js:_addHazardsOutlookGridEntries`) | Browser (consumes the corrected field) | The bug is in backend bookkeeping (`notes.noteReported`/`noteUnmapped` never called for window-band-routed matches), not in the renderer; fixing it in the renderer would be papering over a wrong signal |
| Window-band dedupe key hygiene (IN-01) | Backend (`node_helper.js:939`) | — | Key construction, not a display concern; RPT-04's band is only where a dropped entry would be *observed* |
| WR-02 guard closure (`validHazardColor`/`escapeHtml` on every interpolated field) | Browser (`getDom()`) | — | The vulnerable interpolation pattern is a renderer-side omission; closing it is entirely a `getDom()`-side change |
| Auto-expand significance floor (D-04) | Static config (`hazardTaxonomy.js`, new table beside `PRECEDENCE`) | Browser (consumes the floor per entry) | Per-dimension/per-source thresholds are taxonomy data, same tier as `NO_RISK_FLOOR`/`PRECEDENCE`; keeping it there (not hardcoded in `getDom()`) matches D-06's "precedence table beside the map" precedent and keeps the frontend a pure reader |

## Standard Stack

### Core

No new runtime dependencies. This is a display-only phase against a vanilla-JS, no-build-step, no-framework MagicMirror module. `package.json` has no dependency this phase should touch (`@tmcw/togeojson`, `@turf/turf`, `@xmldom/xmldom`, `adm-zip`, `node-fetch`, `weather-icons`, `xpath` are all backend/fetch concerns already installed for prior phases).

**Installation:** none required.

### Package Legitimacy Audit

Not applicable — this phase introduces no new packages. `git status` at research time shows an uncommitted `node_modules/` and `pnpm-lock.yaml` in the working tree; these predate this phase's scope and are not something this research evaluated or recommends acting on (flag for the planner only if they turn out to be an accidental commit candidate — not this phase's concern).

## The Actual Payload Shape (read from source, not paraphrased)

Read directly from `node_helper.js:2595-2610` (`_buildGridDays`), `:3408-3489` (`_resolveGridDayPrecedence`), `:3525-3576` (`_buildGridSummary`), `:3613-3686` (`_buildSourceHealth`), `:5199-5213` (final assembly), and `18-LIVE-CAPTURE.md` (real captured values). `[VERIFIED: node_helper.js source read 2026-09-06]` for every field below.

```
payload = {
  // Legacy blocks — byte-for-byte preserved (18 D-01), still populated every poll:
  day1..day8, fireWeather, excessiveRain, winterImpact, hazardsOutlook, heatRisk,

  advisories: { spcMD: [...], mpd: [...] },   // unchanged by Phase 18

  days: {                                      // ALWAYS 14 keys, "1".."14", never fewer
    "<n>": {
      date: "YYYY-MM-DD",                      // resolved UTC date, nominal-start-anchored
      windowStart: ISO string,                  // day 1 uses the ACTUAL (possibly truncated)
      windowEnd: ISO string,                    //   anchor window; days 2-14 use the nominal
                                                 //   12Z-aligned window (D-11)
      hazards: [
        {
          dimension: string | null,             // one of DIMENSIONS, or null (D-07 unmapped)
          source: string,                       // one of DAY_SOURCE_IDS
          label: string,                        // source's own token/label (SLGT, MRGL, "3", "Heavy Rain"...)
          text: string,                         // human-facing text (valueToFullRisk-style)
          value: number | null,                 // source's own numeric scale, or null (wpc-hazards has none)
          color: string,                        // 6-hex-digit string, NO leading '#'
          suppressedBy: string | null,           // null = compact-line survivor; else the winning source id
          detail?: {...}                        // OPTIONAL, convective-only, THREE DIFFERENT SHAPES — see below
        }, ...
      ]
    }, ...
  },

  summary: {
    anyHazard: boolean,           // UNION of day survivors + windowBand + both advisory arrays — decides RPT-05 in one read
    dimensions: string[],         // DIMENSION_ORDER-filtered, only dimensions with a live survivor anywhere
    activeDays: number[],         // grid day numbers with >=1 survivor
    windowStart: ISO string,      // gridDays["1"].windowStart
    windowEnd: ISO string,        // gridDays["14"].windowEnd
    enabledSourceCount: number,
    reportingSourceCount: number,
    bandDiagnostics: { windowBandCount: number, advisoryCount: number }
  },

  sources: {                       // ALWAYS 8 keys — hazardTaxonomy.SOURCE_IDS, regardless of toggle
    "<sourceId>": {
      id, displayName, enabled, reporting, stale, idpFiledate,
      reportedDays: number[],      // ascending grid-day numbers this source produced ANY reading for
      activeDays: number[],        // subset of reportedDays that cleared the no-risk floor
      unmappedLabels: string[],    // D-07 pass-through diagnostic ledger, capped/deduped per source
      gridAnchor?: "observed"|"estimated"   // spc-convective ONLY
    }, ...  // all 8: spc-convective, spc-fire, wpc-ero, wpc-wssi, wpc-hazards, heatrisk, spc-md, wpc-mpd
  }
}
```

**Where the live capture disagrees with the documented contract:** `sources['wpc-hazards']` under-reports (`reporting: false`, `unmappedLabels: []`) on a poll where the source's window band carried two real spans including a genuinely unmapped label — see "Carried-In Item 2" below for the traced root cause. Nothing else in `18-LIVE-CAPTURE.md` disagrees with 18-CONTEXT.md's documented shape; the 14-key `days[]` invariant, the `detail` sub-object's presence on convective entries, and the `summary`/`sources` field lists all match verbatim.

### The `detail` Sub-Object Is Not Uniform (RPT-03/D-07 load-bearing finding)

Read from `node_helper.js:3159-3167` (`_addSpcGridEntries`), `[VERIFIED: node_helper.js source read]`:

```js
const detail = d === 3
  ? { probRisk: day.probRisk, cig: day.cig }
  : {
      probRisk: day.probRisk, torRisk: day.torRisk, torCig: day.torCig,
      hailRisk: day.hailRisk, hailCig: day.hailCig, windRisk: day.windRisk, windCig: day.windCig
    };
```

Three distinct `detail` shapes exist on a `convective` entry, and only one of them supports D-07's icon/percentage sub-line:

| Grid days | `detail` shape | Can render D-07's `🌀② 10% ⬚① 30% 💨 15%` sub-line? |
|---|---|---|
| 1-2 | `{probRisk, torRisk, torCig, hailRisk, hailCig, windRisk, windCig}` | Yes — full per-hazard-type breakdown |
| 3 | `{probRisk, cig}` — one combined CIG, no per-type risk/CIG | No — only a single combined CIG marker is available (matches today's day-3 rendering, which appends `cigLabel(cig)` to the risk text with no icon line at all) |
| 4-8 (extended only) | `{probRisk, sign}` | No — `sign` (the BUG-01 double-arrow-trend fix) has never been rendered by any shipped `getDom()`; it is a payload field with zero historical consumers |

`cigLabel(cig)` (numeric domain, `MMM-SPCOutlook.js:190-195`) and `cigLabelFromTierString(tier)` (string `"CIG1"/"CIG2"/"CIG3"` domain, `:198-203`) are two separate functions for two separate input shapes and both must survive into the new renderer: `detail.cig`/`detail.torCig`/etc. are numbers (feed `cigLabel`), while a proximity entry's `nextTier` is a string like `"CIG2"` (feeds `cigLabelFromTierString`).

**Planning implication:** the D-07 sub-line renderer must branch on which `detail` fields are present (`torRisk` family present → full breakdown; only `cig` present → single combined marker matching today's day-3 look; only `sign` present or `detail` absent → no sub-line at all), not assume every day's convective entry supports the same sub-line. This is not documented in CONTEXT.md's D-07 example (which only shows the days-1-2 shape) and is exactly the class of thing Pitfall 9 warns will be silently dropped by a rewrite.

## Worst-Case Survivor Count Per Day (Row Budget — proof, not estimate)

`hazardTaxonomy.js:25-27` declares exactly 8 dimensions: `convective, flash-flood, winter, heat, cold, wind, fire, heavy-precip`. `_resolveGridDayPrecedence` (`node_helper.js:3408-3459`) resolves **exactly one winner per dimension per day** — every other same-dimension entry gets `suppressedBy` set to the winner's source id. Since the compact line renders only `suppressedBy === null` entries (18 D-03), **the maximum possible compact-line segment count on any single day is bounded by the number of dimensions: 8.** `[VERIFIED: hazardTaxonomy.js + node_helper.js source read]` — this is a structural ceiling, not a live-data observation.

Per-dimension day coverage (source day spans, `[VERIFIED: productRegistry.js + hazardTaxonomy.js]`):

| Dimension | Sources (day span) | Days reachable |
|---|---|---|
| convective | spc-convective (1-8), wpc-hazards (3-14) | 1-14 |
| flash-flood | wpc-ero (1-5) only | **1-5 only** |
| winter | wpc-wssi (1-3), wpc-hazards (3-14) | 1-14 |
| heat | heatrisk (1-7), wpc-hazards (3-14) | 1-14 |
| cold | wpc-hazards (3-14) only | **3-14 only** |
| wind | wpc-hazards (3-14) only | **3-14 only** |
| fire | spc-fire (1-8), wpc-hazards (3-14) | 1-14 |
| heavy-precip | wpc-hazards (3-14) only | **3-14 only** |

All 8 dimensions can only simultaneously have an eligible source on a day inside the intersection of `[1-5]` (flash-flood's only window) and `[3-14]` (cold/wind/heavy-precip's only window) — **grid days 3, 4, and 5**. Outside that window the real ceiling is lower: days 1-2 max out at 5 dimensions (no cold/wind/heavy-precip, since wpc-hazards hasn't started); days 6-14 max out at 7 (no flash-flood, since wpc-ero has ended).

| Day range | Structural max compact-line segments |
|---|---|
| 1-2 | 5 |
| **3-5** | **8 (absolute maximum)** |
| 6-14 | 7 |

**Recommendation:** given the true ceiling is 8 and D-15 already fixes a deterministic taxonomy order, no truncation is structurally necessary — 8 dot-separated `<Dimension> <Label>` segments is a bounded, known worst case, not an open-ended one. If a width-based cut is still wanted for cosmetic reasons on the smallest mirror displays, cut at a fixed position in `DIMENSION_ORDER` (e.g., keep the first 6, note the rest are present in detail mode) rather than any severity heuristic — this is what D-15's fixed order already makes reproducible, and it requires no cross-dimension comparison.

## Architecture Patterns

### System Architecture Diagram

```
 node_helper.js (Phase 18, unchanged this phase)
        │
        │  sendSocketNotification("SPC_DATA_RESULT", [payload, seq, meta])
        ▼
 MMM-SPCOutlook.js: socketNotificationReceived()
        │  (foreign-instance / epoch / out-of-order guards — unchanged)
        │  this.spcrisk = payload[0]; this.updateDom();
        ▼
 MMM-SPCOutlook.js: getDom()  ◄── THIS PHASE'S ENTIRE SCOPE
        │
        ├─► [no this.spcrisk]        → "Loading SPC Outlook..."
        ├─► [this.spcrisk.error]     → "Error: " + error   (textContent, unchanged)
        │
        ├─► empty-state check: summary.anyHazard === false
        │      (18 D-16 — ONE read, replaces the old ~15-term boolean gate)
        │      └─► consult sources[] to pick all-quiet / all-failed / all-disabled wording
        │
        └─► [anyHazard === true] render path:
               │
               ├─► stale badge (D-09, unchanged: _stale/_staleAsOf, CR-01 guard)
               │
               ├─► FOR day = 1..14:
               │       skip if no survivor in days[day].hazards (D-03)
               │         (exception: D-08 proximity-only day still renders)
               │       ├─► compact line: "Day N (Weekday)  <Dim> <Label> · ..." (D-01/D-02)
               │       └─► IF dayReportDetail OR auto-expand floor cleared (D-04):
               │              sub-rows grouped by dimension, winner first,
               │              competing entries as "also:" (D-05), compact line
               │              retained as header (D-06); proximity badge +
               │              probabilistic sub-line here only (D-07, shape-
               │              dependent per the `detail` finding above)
               │
               └─► non-day-scoped band, BELOW the day blocks (RPT-04 — a
                     reordering from today's above-the-days MD/MPD placement):
                       advisories (spcMD, then mpd — D-05's existing order)
                       window-spanning Hazards Outlook entries (D-07's existing
                       span-start order), IN-01's dedupe-key fix applied
```

### Recommended Project Structure

No new files are structurally required — this is a single-file (`MMM-SPCOutlook.js`) rewrite. If internal decomposition is wanted (Claude's discretion per CONTEXT), a reasonable split keeps `getDom()` as an orchestrator calling named local functions (matching the existing style of `renderHazardsDays`/`renderHazardsWindowBand`/`enabledAdvisories` as closures inside `getDom()`), rather than extracting to new module files — this project has no build step, and a new frontend-only module file would need its own `<script>` inclusion wiring MagicMirror does not automate.

### Pattern: driving `getDom()` outside a browser (already exists — reuse it)

`scripts/probe-lib/module-stubs.js:263-298` already loads `MMM-SPCOutlook.js` into a Node `vm` context and calls the real `getDom()`:

```js
// Source: scripts/probe-lib/module-stubs.js:263-298 (existing project code)
function loadFrontendModule() {
  const source = fs.readFileSync(...MMM-SPCOutlook.js, "utf-8");
  let captured = null;
  const sandbox = {
    Module: { register: (_name, definition) => { captured = definition; } },
    Log: loggerStub,
    moment: (_ts) => ({ fromNow: () => "PROBE_AGE" }),
    // A plain object, not a DOM node: nothing parses what is assigned to
    // innerHTML, so a scenario can only assert on the concatenated string.
    document: { createElement: () => ({ innerHTML: "", textContent: "" }) },
    setInterval: () => 0,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "MMM-SPCOutlook.js" });
  return captured;
}

function renderDom(frontend, { config, spcrisk }) {
  const ctx = Object.create(frontend);
  ctx.config = config;
  ctx.spcrisk = spcrisk;
  ctx.updateDom = () => {};
  const wrapper = frontend.getDom.call(ctx);
  return wrapper.innerHTML || wrapper.textContent || "";
}
```

Already used by 15+ scenarios in `scripts/probe-payload-resilience.js` (e.g. `frontend-escapes-remote-advisory-text`). **This is the answer to "how to produce the two RPT-06 test states cheaply and honestly":** construct a synthetic `spcrisk` object shaped like the payload above (all-quiet: every source's `days[]` empty, `summary.anyHazard: false`, every `sources[].reporting` reflecting its enabled state; everything-active: every dimension populated on every reachable day, every advisory populated, proximity populated) and drive it through `renderDom`. This does not replace the ROADMAP's two *mandatory manual* test runs (a live human check against the real rendered mirror is still required for RPT-06 sign-off), but it is the correct mechanism for (a) iterating during development without a browser, and (b) building individually mutation-proven probe scenarios per 15 D-10, which the manual runs alone cannot satisfy.

**Constraint this mechanism imposes on the render-mechanism decision:** the `document` stub returns a flat plain object (`{ innerHTML: "", textContent: "" }`) with no `appendChild`, no `style` object, no child-node tree. It works today only because `getDom()` exclusively does `wrapper.innerHTML += "..."`. If Phase 19 switches to `createElement`/`appendChild`, every one of the 15+ existing `renderDom`-based scenarios (and any new RPT-06 scenarios built the same way) breaks immediately unless this stub is rewritten to support a minimal real element tree (children arrays, nested `appendChild`, a `style` property object per node, `textContent` setters that don't get "flattened" until a final serialization pass). That is new test infrastructure, not a renderer-only change, and it is not accounted for anywhere in CONTEXT.md's discretion note on render mechanism.

### Anti-Patterns to Avoid

- **Treating every convective `detail` object as if it always has `torRisk`/`hailRisk`/`windRisk`.** Day 3's `detail` has only `{probRisk, cig}`; days 4-8's has only `{probRisk, sign}`. A renderer that reads `detail.torRisk` unconditionally will render `undefined%` or throw on those days.
- **Keying the empty-state decision, or any "is this source silent" UI, off `sources[id].reporting` before fixing carried-in item 2.** `wpc-hazards.reporting` is currently `false` even when its window band has real content — a display that trusts it will call a reporting source silent.
- **Re-deriving weekday via `dowToText(dow + N)` for a unified-grid day.** RPT-07/18 already resolved this; the payload's own `date` field is authoritative (D-01). WPC's day boundary differs from SPC's (Pitfall 9), so offset arithmetic against "today" drifts.
- **Assuming the current MD/MPD-above-days placement is the parity target for RPT-04.** It is not — RPT-04 explicitly requires the band **below** the day blocks, a genuine, roadmap-mandated reordering that must be called out on the RPT-06 checklist as an intentional change, not investigated as a regression.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|--------------|-----|
| Weekday-from-date | New date-math helper | The payload's own `date` field + a `dowToText`-style lookup keyed off `new Date(dateStr + "T00:00:00Z").getUTCDay()` (already exists as `hazardsWeekdayFromDate`, `MMM-SPCOutlook.js:643-646`) | Re-deriving from `dow + N` is Pitfall 9's exact trap; the existing UTC-date-string helper is already correct and reusable verbatim |
| Color validation | A new regex or trust-the-payload | `validHazardColor` (`MMM-SPCOutlook.js:636-638`, `/^[0-9a-fA-F]{6}$/` else `"aaaaaa"`) | Already the project's one guard for this; WR-02's whole finding is that one call site skipped it — don't introduce a second, differently-written copy |
| HTML escaping | A new escape function | `escapeHtml` (`MMM-SPCOutlook.js:245-247`) | Same rationale — one canonical implementation, reused everywhere remote text reaches a string that becomes `innerHTML` |
| Label length bounding | A new truncation rule | `truncateHazardLabel` / `HAZARDS_LABEL_MAX_CHARS = 60` (`:623-631`) | WR-06 already names "a fix applied to one twin and not the other" as this codebase's recurring defect shape; the unified renderer collapses what were two hazard-render call sites into one, which structurally retires that specific twin-drift risk if this shared helper is kept as the one and only truncation point |
| CIG glyph rendering | A new marker function | `cigLabel(numeric)` and `cigLabelFromTierString(string)` (`:190-203`) | Two different input domains (payload `detail.cig`/`torCig`/etc. are numbers; proximity `nextTier` is a string like `"CIG2"`) — both existing functions are needed, not one merged replacement |
| Proximity renderability / badge text | New predicates | `hasRenderableProximity`, `hasAnyRenderableProximity`, `proximityBadge` (`:209-238`), `PROX_MIN_WEIGHT = 0.1` | These already encode the PROXUI-01..05 noise-floor and inside/outside-mode contract; a rewrite that reimplements this from the PROXUI requirement text alone risks missing the exact `weight.toFixed(1)` rounding and the CIG-string-vs-plain-tier branch already proven correct |

**Key insight:** almost every "don't hand-roll" item here is not a third-party library gap — it is this project's own already-correct, already-battle-tested helper functions. The dominant risk in this phase is re-deriving something that already exists correctly, under time pressure from the new layout requirements, and getting a subtly different (wrong) answer. Carry every one of these functions into the new `getDom()` verbatim rather than rewriting them "to fit" the new structure.

## Common Pitfalls

### Pitfall 1: Assuming `detail` is uniform across convective entries (RPT-03)
**What goes wrong:** A sub-row renderer built and tested against day 1/2 data (the shape shown in CONTEXT.md's own D-07 example) silently breaks or misrenders on day 3 (single `cig`, no per-type breakdown) or days 4-8 (`sign` only, no CIG at all).
**Why it happens:** SPC's own product genuinely has three different levels of granularity across its 8-day window; the payload's `detail` sub-object faithfully reflects that asymmetry rather than smoothing it over.
**How to avoid:** Branch explicitly on which `detail` fields are present; write a probe scenario for each of the three shapes.
**Warning signs:** A day-3 or extended-day sub-line rendering `undefined%` or an icon with no attached risk/CIG value.

### Pitfall 2: Trusting `sources['wpc-hazards'].reporting` before the carried-in fix lands
**What goes wrong:** A display that shows "no data from WPC Hazards" or similar off `reporting: false` while the window band beneath it is actively rendering that same source's entries — a visible, self-contradicting UI.
**Why it happens:** `_addHazardsOutlookGridEntries` only calls `notes.noteReported`/`noteUnmapped` for matches that reach the per-day grid (Precipitation group, non-full-window); window-band-routed matches (Temperature/Wildfire/Drought groups, or a full-nominal-window Precipitation feature) skip straight past those calls via an early `continue` (`node_helper.js:2866-2872`).
**How to avoid:** Fix carried-in item 2 before wiring any display logic to `sources[id].reporting` for `wpc-hazards` specifically — see "Carried-In Item 2" below for the traced fix shape.
**Warning signs:** A live poll where the window band has entries but `sources['wpc-hazards'].reportedDays` is `[]`.

### Pitfall 3: Reordering MD/MPD without flagging it as intentional
**What goes wrong:** RPT-06's parity reviewer (human or checklist) flags "advisories moved from top to bottom" as a regression, when RPT-04 explicitly requires it.
**How to avoid:** Record this specific relocation on the RPT-06 checklist under its own line item, cross-referenced to RPT-04, so it reads as a verified intentional change rather than an unreviewed diff.

### Pitfall 4: The ten proximity mode call sites (Pitfall 9's own top finding)
**What goes wrong:** Today's code computes `"inside"` vs `"outside"` mode from a *different local condition per call site* — `day1.risk == "NONE"` for the categorical badge, `day1.torCig === 0` for the tornado CIG badge, etc. (10 total sites across days 1-3). A rewrite that centralizes this into one shared "is this hazard active" check, without checking each site's actual condition, will silently flip some badges' inside/outside wording.
**How to avoid:** Enumerate all 10 sites (Day1: categorical, torCig, hailCig, windCig; Day2: same 4; Day3: categorical, cig) with their exact source condition before generalizing.

### Pitfall 5: Losing the `windowBand`/day-grid full-nominal-window guard's effect on carried-in item 2's twin
**What goes wrong:** A fix for `reporting`/`unmappedLabels` that adds `notes.noteReported`/`noteUnmapped` calls naively inside `_addHazardsOutlookGridEntries`'s window-routing branch, using a day number, corrupts `reportedDays`'s per-day-grid semantics (window-band entries have no day-grid association by design — RPT-04 requires this).
**How to avoid:** See "Carried-In Item 2" recommendation below — this needs a day-independent reporting signal, not a fabricated day key.

## Carried-In Item 2 — `sources['wpc-hazards']` metadata (RPT-05 dependency)

**Root cause, traced to source** (`[VERIFIED: node_helper.js source read]`):

- `_runHazardsOutlookProduct`'s legacy path (`node_helper.js:894-970`) builds the window band via its own `resolveStyle` closure, which logs an unmapped label to `Log.info` but has no connection to Phase 18's `notes` accumulator at all.
- The Phase 18 grid-rebucket path, `_addHazardsOutlookGridEntries` (`node_helper.js:2842-2963`), receives `gridMatches` — **every** match from every layer, window-eligible or not. For a match that routes to the window band (`match.group !== "precipitation"` — Temperature/Wildfire/Drought — or a full-nominal-window Precipitation feature), the function hits `continue` at line 2872 **before** reaching the `notes.noteReported`/`notes.noteUnmapped`/`notes.noteActive` calls (lines 2916, 2934-2935), which only execute for matches that actually land on the per-day grid.
- Result: a poll where `wpc-hazards`' *only* live content is window-band entries (Temperature/Wildfire/Drought — the common case, since only the Precipitation group can ever reach the day grid at all) produces `reportedDays: []` → `reporting: false` (per `_buildSourceHealth`'s `(reportedDays[sourceId] ? size : 0) > 0` derivation, `node_helper.js:3663-3665`) and `unmappedLabels: []`, even though the source genuinely answered and genuinely found an unmapped label.

**Fix shape (recommendation, not yet implemented):** `reportedDays`/`activeDays` are inherently day-grid-keyed `Set<number>` structures consumed by `_resolveGridDayPrecedence`'s absent-vs-below-floor distinction (D-14) — do not overload them with a day-independent "window band reported" signal, which would corrupt that distinction. Instead:
1. **`unmappedLabels`** — trivial, no semantic conflict: call `notes.noteUnmapped("wpc-hazards", match.label)` for a window-routed match too (before or alongside the existing `continue`, when `dimensionOf("wpc-hazards", match.label) === null`), mirroring the day-grid branch's own call. This alone fixes the live-observed "Severe Drought" gap.
2. **`reporting`** — needs a day-independent signal. Recommend threading a new boolean accumulator (e.g. `notes.noteWindowBandReported(sourceId)`, set whenever *any* match for that source routes to the window band, day-grid-eligible or not) and OR-ing it into `_buildSourceHealth`'s `reporting` derivation specifically for sources capable of producing a window band (today, only `wpc-hazards`). This keeps `reportedDays`'s day-keyed meaning untouched while making `reporting` reflect "this source answered in *any* form."

This is backend code (`node_helper.js`) landing inside a display phase — keep the change small and isolated to `_addHazardsOutlookGridEntries` and `_buildSourceHealth`; do not touch the precedence resolver or any other source's health derivation.

## Band Layout for RPT-04

Today's `getDom()` renders MD/MPD advisories **immediately after** the stale badge and **before** every day row (`MMM-SPCOutlook.js:513-540`); the Hazards Outlook window band renders **after every day row**, at the very end (`:678-730`, deliberately kept separate from the advisory band per 15 D-05 — "in effect" nowcast wording doesn't fit a 5-14-day forecast window). RPT-04 requires **all** of MD, MPD, and window-spanning Hazards Outlook entries to render in **one band below the day blocks** — this is a genuine reordering of MD/MPD (from above to below), not merely a parity target.

**Recommendation:** keep the semantic split 15 D-05 established (nowcast "in effect" advisories vs. forecast-window hazard entries read differently) rather than merging them into one undifferentiated list, but place both sub-sections together, below the day blocks: advisories first (SPC MD then WPC MPD, D-05's existing order), then the Hazards Outlook window band (span-start order, D-07's existing order), each keeping its own existing internal wording. This satisfies RPT-04's "separate band below the day blocks" literally while not discarding the semantic distinction 15 D-05 was written to preserve. **Record the MD/MPD relocation explicitly on the RPT-06 checklist** (Pitfall 3, above) so it reads as verified-intentional.

IN-01 (window-band dedupe key `label + "|" + offsetStart + "|" + offsetEnd` colliding on a `|`-containing label, `node_helper.js:939`) is fixed by replacing string concatenation with an array-tuple key (e.g. `JSON.stringify([entry.label, entry.offsetStart, entry.offsetEnd])`, or a `Map` keyed by a composite object via a two-level `Map<label, Map<offsetStart+","+offsetEnd>>`) — low blast radius, bounded already by `HAZARDS_MAX_WINDOW_ENTRIES = 40`, one-line fix at the one call site.

## Auto-Expand Trigger for D-04 (per-dimension significance floor)

`hazardTaxonomy.js`'s existing `NO_RISK_FLOOR` table (`:185-219`) is already fully consumed upstream (18-03/18-04) to decide whether an entry reaches the payload *at all* — every entry present in `days[].hazards` has, by construction, already cleared its own source's presence floor. D-04 needs something *above* that: a "this is serious enough to auto-expand" signal, which does not exist in the codebase today and must be newly declared. It can be built **without any cross-dimension comparison** by reading each entry's own `value` against a **new**, source-scoped table (structurally identical in shape to `NO_RISK_FLOOR`, placed beside `PRECEDENCE` per D-06's own precedent), because precedence has already resolved exactly one winning source per dimension by the time this check runs.

Concrete value domains, `[VERIFIED: productRegistry.js + node_helper.js source read]`:

| Source | Value domain reaching the payload (floor already applied) | Top tier |
|---|---|---|
| spc-convective | 2 (MRGL) – 6 (HIGH) | HIGH=6 |
| spc-fire | 1 (ELEV) – 3 (EXTM) | EXTM=3 |
| wpc-ero | 1 (MRGL) – 4 (HIGH) | HIGH=4 |
| wpc-wssi | 2 (MINOR) – 5 (EXTREME) | EXTREME=5 |
| heatrisk | 1 (Minor) – 4 (Extreme) | Extreme=4 |
| wpc-hazards | always `null` (`FLOOR_PREBAKED` — no severity ladder exists anywhere in this service's schema) | — |

**Recommendation:** declare a new `SIGNIFICANCE_FLOOR` table, one predicate per day-scoped source with a value ladder (5 of the 6), each set to roughly "second-from-top tier or higher" (e.g. `spc-convective: value >= 4` [ENH+], `spc-fire: value >= 2` [CRIT+], `wpc-ero: value >= 3` [MDT+], `wpc-wssi: value >= 4` [MAJOR+], `heatrisk: category >= 3` [Major+]). **This exact tier choice is a UX judgment, not something verified against a NOAA or WPC documented threshold in this research session — tag it `[ASSUMED]`** and treat it as needing user confirmation, same as any other assumed threshold. `wpc-hazards` structurally cannot participate in a graduated floor (its only signal is presence) — the open question below (Open Question 1) is what to do when `wpc-hazards` alone wins a dimension: either it never independently triggers auto-expand, or its mere presence always triggers it. Auto-expand for a day is then `OR` across every winning entry's own source/value against this table — no cross-dimension comparison is needed, satisfying the hard constraint.

**Simpler alternatives that also satisfy the constraint** (both explicitly named as acceptable in CONTEXT.md, neither picked over the other): a flat "day has ≥3 distinct surviving dimensions" count trigger (no per-source table needed at all), or a fixed priority-source list (e.g. "auto-expand if `spc-convective` or `heatrisk` won any dimension today, regardless of value"). The per-source value-floor approach above is finer-grained and reuses already-existing value domains without inventing a new source list; recommend it as primary, with the count-trigger as a lower-effort fallback if the per-source thresholds prove contentious in review.

## The RPT-06 Behavior-Parity Checklist

This is the phase's real acceptance gate. Enumerated directly from `MMM-SPCOutlook.js:184-784` (full read) and cross-verified against `PROJECT.md`'s own changelog (lines 22-40) for defect-ID provenance — not inferred by function alone where the changelog gives an exact mapping.

| # | Req/Defect ID | Observable behavior | Source line(s) |
|---|---|---|---|
| 1 | (loading) | `!this.spcrisk` → literal `"Loading SPC Outlook..."` via `innerHTML` (not escaped — hardcoded string, safe) | `:419-420` |
| 2 | (error) | `this.spcrisk.error` → `"Error: " + error` via `textContent` (never `innerHTML`) | `:421-422` |
| 3 | BUG-03 | No-risk gate term: `!(extended && day48Risk)` | `:437` |
| 4 | CR-01 | Staleness (`!this.spcrisk._stale`) disqualifies the whole no-risk short-circuit — a degraded read is never an all-clear | `:430` |
| 5 | FWXT-03 | No-risk gate extended for fire weather days 1-2 (unconditional) and days 3-8 (extended-gated) | `:438-446` |
| 6 | WR-08 (Phase 19 regression target per its own comment) | ERO/WSSI/HazardsOutlook/HeatRisk no-risk gate terms all derive their day span from the block's own keys, never a literal count | `:453-476` |
| 7 | WR-09 | Advisory no-risk gate term is per-toggle (`enabledAdvisories().length > 0`), not unconditional | `:488` |
| 8 | WR-04 | `_staleAsOf` renders real cached-reading age via `moment(asOf).fromNow()`; omits the age suffix (not the badge) when `asOf` isn't a finite number | `:494-505` |
| 9 | CR-01 | `contentMarker` pattern: if nothing renders after the stale badge, fall back to `"No Severe Weather Risk (unconfirmed)"`, distinct from the confident all-clear | `:512`, `:778-780` |
| 10 | D-05/D-06 (15) | Advisory band: SPC MD then WPC MPD, in that concatenation order; each line `label [+ " — " + hazardType] + " in effect."` | `:513-540` |
| 11 | WR-12 | Advisory `label`/`hazardType` pass through `escapeHtml` before reaching `innerHTML` | `:532`, `:537` |
| 12 | PROXUI-01/02 | Day 1/Day 2 rows: colored risk text + `proximityBadge(categorical, mode)`, mode = `risk=="NONE" ? "outside" : "inside"` | `:541-561` |
| 13 | FWXT (implicit, pre-ID) | Day 1/Day 2 probabilistic breakdown line (tornado/hail/wind icons + `cigLabel` + percentage), only emitted when `probRisk` is true, only per-hazard-type when that type's risk > 0 | `:544-561` |
| 14 | PROXUI-03/04 | Day 1/2 per-hazard-type proximity badges: `torCig`/`hailCig`/`windCig`, mode = `own CIG === 0 ? "outside" : "inside"` (independent per hazard type, NOT tied to the day's categorical mode) | `:546-548`, `:557-559` |
| 15 | PROXUI-04 | Day 3 dual badge: categorical AND cig badges both computed; joined with `";"` **only if both are non-empty** (`day3DualSep`) | `:562-569` |
| 16 | (day 3, no per-ID) | Day 3 appends `cigLabel(day3.cig)` directly into the risk-text span (no separate icon breakdown line — day 3 has no tornado/hail/wind percentages at all) | `:567` |
| 17 | (extended days, no per-ID) | Days 4-8 gate is `probRisk` (not `risk != NONE`), plain colored text only, **no proximity badges at all** for this range (asymmetry vs. days 1-3) | `:570-577` |
| 18 | FWXT-01/02/03/04 | Fire weather days 1-2 unconditional, days 3-8 `extended`-gated; `fireRiskToColor` lookup (`{0:"aaaaaa",1:"FF7F00",2:"FF0000",3:"FF00FF"}`); gate is `day{N}Risk > 0` | `:578-598` |
| 19 | WR-08 | `renderDayBlock` (ERO/WSSI): day span from `dayRiskCount` (counts `day{N}Risk` keys), strict `!== "NONE"` | `:604-614` |
| 20 | WR-02 | `renderDayBlock` interpolates `day{N}Color`/`day{N}Text` into `innerHTML` with **no** `validHazardColor`/`escapeHtml` — not exploitable today (module-authored lookup tables: `riskToColor` sourced from SPC's own CSS, `[VERIFIED: node_helper.js:4168-4170]`), but the new unified renderer must not repeat this omission for any field, since `wpc-hazards`' color/label CAN carry pass-through remote text (D-07 unmapped labels) | `:604-614` |
| 21 | T-16-19/IN-08 | `validHazardColor`: strict 6-hex-digit regex, default `"aaaaaa"`; guards both the `color:#undefined` class and attribute injection | `:636-638` |
| 22 | T-16-20/T-16-22 | `truncateHazardLabel`/`HAZARDS_LABEL_MAX_CHARS=60`, truncated **before** escaping (bounds source chars, not entity expansions) | `:623-631` |
| 23 | D-01 (16) | Hazards Outlook weekday from `hazardsWeekdayFromDate(entry.date)` — resolved payload date, never `dowToText(dow+N)` | `:639-646` |
| 24 | WR-01 (16) | `HAZARDS_EXCLUDED_LABELS`/`HAZARDS_DROUGHT_LABELS`, folded via `hazardsLabelKey` (trim + collapse whitespace incl. U+00A0 + uppercase) — a second, fail-safe-only filter mirroring the backend's own exclusion | `:312-331` |
| 25 | D-02 (16) | Hazards day-grid: multiple same-day hazards joined `", "` in payload array order (no re-sort) | `:666-676` |
| 26 | WR-04 (16) | Window-band heading `"Extended Hazards:"` written **once**, only if ≥1 renderable entry exists, from inside the loop after the first entry passes | `:686-703` |
| 27 | D-06/D-08 (16) | Window-band entry: own observed span (never the layer's nominal window); weekday pair omitted (not NaN) if either date is unparseable; single-day `"(D3)"` vs. range `"(D3–7)"` formatting | `:704-729` |
| 28 | WR-06 (16) | Window-band `offsetStart`/`offsetEnd` coerced defensively (`off()` helper), falling back to `"?"` on non-finite | `:722-725` |
| 29 | D-03 (17) | HeatRisk render loop and no-risk gate term share **one** derivation (`heatRiskDaysToRender`), so a below-floor day can never disagree between gate and render | `:381-398`, `:750-763` |
| 30 | D-01/D-02 (17) | `showMinorHeat` floor: 1 (minor+) vs. 2 (moderate+) default; `null` category never renders (distinct from category 0) | `:383-393` |
| 31 | HEAT (17) | HeatRisk row: `validHazardColor`/`escapeHtml` both applied (the one legacy render site that already does this correctly) | `:759-761` |
| 32 | (placement, no per-ID) | HeatRisk rendered after Winter Impact, before Hazards Outlook — deliberate near-term-then-longer-range grouping | `:743-750` |
| 33 | PROXUI-05 | `PROX_MIN_WEIGHT = 0.1` noise floor; `weight.toFixed(1)` rounding in badge text | `:197`, `:213-214`, `:232` |
| 34 | (day2-none bug, pre-ID) | `hasRenderableProximity`/`hasAnyRenderableProximity` predicates prevent a bare `(Day N): None` line from a sub-noise-floor proximity value | `:204-229` |
| 35 | ADVISORY_SOURCES (WR-09/CV-03) | `{spcMD: "showSPCMD", mpd: "showMPD"}` — the one place the frontend names `kml-advisory` registry rows; cannot be derived (browser context) | `:254` |

**Not directly in `getDom()` but payload-adjacent, worth a checklist footnote:** BUG-01 (SIGN detection), BUG-02 (day 8 shape), BUG-04 (`checkInPolygon` full iteration), FWXT-05 (URL/parsing), PROX-01/02/05 (proximity computation) are backend concerns whose *effects* getDom() consumes but whose fixes live entirely in `node_helper.js` — no `getDom()` behavior exists to preserve for these beyond "the field they produce is still read correctly," which items 3, 12-15, and 18 above already cover.

## Render Mechanism Tradeoff

MagicMirror's module contract requires `getDom()` to return a DOM node **synchronously** (async work belongs in `start()`, before the DOM is ever built) `[CITED: docs.magicmirror.builders/module-development/core-module-file.html]`. Both `wrapper.innerHTML += "..."` and `createElement`/`appendChild` satisfy this contract equally; MagicMirror itself has no preference. This project ships **no CSS file** — `getStyles()` returns only `weather-icons.min.css`; every color today is an inline `style="color:#..."` string.

The deciding factor found in this research is **not** MagicMirror's contract but this project's own existing test infrastructure: `scripts/probe-lib/module-stubs.js`'s `document` stub (`{ createElement: () => ({ innerHTML: "", textContent: "" }) }`) has no `appendChild`, no `style` object, no child-node tree — it only works because every existing call is `innerHTML +=`. Switching render mechanism breaks all 15+ existing `renderDom`-based probe scenarios (and any new RPT-06 scenarios built the same way) until that stub is rewritten into a minimal real element tree. That rewrite is itself nontrivial new infrastructure, layered onto a phase STATE.md already flags as "the milestone's highest regression risk."

**Recommendation:** keep `innerHTML +=` string concatenation. Close WR-02 (the actual, real defect) through discipline — apply `validHazardColor()`/`escapeHtml()` to every remote-influenced field in the new renderer, exactly as `renderHazardsDays`/`renderHazardsWindowBand`/the HeatRisk loop already do correctly today — rather than through a mechanism change whose main structural benefit (text nodes can't inject markup) is achievable more cheaply by disciplined function reuse (see "Don't Hand-Roll" above) than by a parallel infrastructure rewrite. If `createElement`/`textContent` is still preferred at planning time, budget explicit time for rewriting `module-stubs.js`'s DOM stub as its own task, not as a side effect of the renderer change.

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | The specific significance tiers recommended for D-04's auto-expand floor (e.g. spc-convective `value >= 4`/ENH+, heatrisk `category >= 3`/Major+) are a reasonable UX threshold | "Auto-Expand Trigger for D-04" | If too low, auto-expand fires too often and D-04's value (surfacing genuinely serious days without reconfiguration) is diluted; if too high, a genuinely serious day (e.g. MDT convective) never auto-expands at default config. Needs user confirmation before becoming a locked plan decision — this is exactly the kind of threshold CONTEXT.md flags as Claude's discretion, not user-locked |
| A2 | `wpc-hazards` winning a dimension alone should either never independently trigger auto-expand, or always trigger it (structurally cannot be graduated) | "Auto-Expand Trigger for D-04" / Open Question 1 | Affects how often a `wpc-hazards`-only day (common for cold/wind/heavy-precip, which have no other source) auto-expands; a wrong default either over- or under-surfaces those days |
| A3 | The recommended band ordering (advisories, then window-spanning hazards, both below the day blocks, keeping their existing internal orders) satisfies RPT-04's intent without a fresh UX round | "Band Layout for RPT-04" | If the user actually wanted a single interleaved list or a different sub-ordering, this recommendation would need revision before locking |

**None of the payload-shape, defect-provenance, or worst-case-count claims above are assumed** — those are tagged `[VERIFIED]` throughout because they were confirmed by direct source read or the live capture artifact, not training-data recall.

## Open Questions (RESOLVED during planning — see per-question markers below)

> All three were carried into the Phase 19 plan set rather than left open. Two became blocking
> operator checkpoints (an executor cannot silently resolve them); one became a recorded
> intentional no-change. Resolution sites are named inline.

1. **Should a `wpc-hazards`-only winning entry ever independently trigger D-04's auto-expand?**
   - What we know: `wpc-hazards` has no severity ladder (`FLOOR_PREBAKED`); presence is its only signal. It is the *sole* source for the `cold`, `wind`, and `heavy-precip` dimensions.
   - What's unclear: whether "any wpc-hazards entry auto-expands" is too aggressive (it would auto-expand every day with, say, a routine "High Winds" entry) or "wpc-hazards never independently auto-expands" under-serves those three dimensions (they could never auto-expand at all, regardless of real severity, since no other source ever wins them).
   - **RESOLVED → plan 19-03, Task 1 (blocking `checkpoint:decision`).** The `SIGNIFICANCE_FLOOR` thresholds are `[ASSUMED]` here and were NOT quietly adopted; 19-03 halts for an explicit operator decision before locking them.
   - Recommendation: default to "never independently triggers" (conservative — matches D-04's own framing of auto-expand as being about days that are unusually *serious*, and a presence-only source has no way to distinguish routine from serious), but confirm with the user before locking, since PRODUCT_REGISTRY intentionally has no severity data to appeal to here — this is a genuine gap, not a research oversight.

2. **Does the legacy block retirement happen inside this phase, or after RPT-06 sign-off?**
   - What we know: 18 D-01 kept all 8 legacy blocks byte-for-byte specifically so this phase has an old-vs-new reference for the parity checklist; PROJECT.md fixes the eventual outcome (unified report is the sole path, no legacy fallback).
   - What's unclear: whether deleting the legacy backend emission code is a task inside this phase's plan or a follow-up once the human UAT sign-off completes.
   - **RESOLVED → plan 19-09, Task 2 (blocking `checkpoint:decision`), sequenced after RPT-06 sign-off.** Costed during planning: deleting the legacy backend emission forces migration of 156 `assertPayloadIntact` call sites and 180 legacy-field assertions across 124 probe scenarios. 19-09 recommends deferring the emission deletion as a costed backlog item — PROJECT.md's "sole render path" outcome is already satisfied by 19-06. The operator decides.
   - Recommendation: sequence it as a final task, gated on the RPT-06 checklist being fully checked off — deleting the reference before the checklist is verified removes the only tool available for catching a silent parity break.

3. **Is `sign` (day 4-8 convective trend indicator, from BUG-01) meant to ever surface in the new unified renderer?**
   - What we know: it has never been rendered by any shipped `getDom()`, in any milestone, despite existing in the payload since v1.0.
   - What's unclear: whether this is a deliberate omission (trend indicator judged not worth a UI element) or a genuinely dead field nobody revisited.
   - **RESOLVED → plan 19-05, recorded as the `SIGN-NOOP` intentional-change entry.** Confirmed out of scope: `sign` is neither rendered today nor introduced by this phase, and the no-change is recorded explicitly so a later reader does not read its absence as a rewrite regression.
   - Recommendation: treat as out of scope for RPT-06 parity (nothing to preserve, since nothing was ever shown) and do not add new rendering for it without an explicit user decision — adding new UI surface is outside this phase's "display-only, no new anything" framing.

## Sources

### Primary (HIGH confidence)
- `MMM-SPCOutlook.js:1-784` — full read, current `getDom()` and every helper it defines
- `node_helper.js` — targeted reads: `:152` (`GRID_DAY_COUNT`), `:855-976` (`_runHazardsOutlookProduct`'s legacy window-band/day-block assembly), `:2595-2610` (`_buildGridDays`), `:2842-2963` (`_addHazardsOutlookGridEntries`), `:3112-3260` (`_addSpcGridEntries`, the `detail` shape finding), `:3408-3489` (`_resolveGridDayPrecedence`), `:3525-3576` (`_buildGridSummary`), `:3613-3686` (`_buildSourceHealth`), `:4162-4170`/`:4506` (color constant provenance), `:4940-5080` (main assembly, accumulator wiring), `:5155-5213` (final payload shape)
- `hazardTaxonomy.js` — full read (339 lines): `DIMENSIONS`, `PRECEDENCE`, `NO_RISK_FLOOR`, source day-span comments
- `productRegistry.js` — targeted reads: `:85-116` (ERO/fire value domains), `:295-335` (ERO/WSSI registry rows, day spans), `:415-430` (Hazards Outlook `dayRangeTotal`), `:490-502` (HeatRisk `days: 7`)
- `scripts/probe-lib/module-stubs.js:255-298` — `loadFrontendModule`/`renderDom`, the existing frontend-probe mechanism
- `scripts/probe-payload-resilience.js` — grep-surveyed for `renderDom`/`loadFrontendModule` call sites (15+ found) and DOM-stub-limitation comment (`:4146-4151`)
- `.planning/phases/18-merge-precedence-unified-payload-schema/18-LIVE-CAPTURE.md` — full read; real captured payload values, the carried-in item 2 defect's original live observation
- `.planning/phases/19-unified-day-report-getdom-rewrite/19-CONTEXT.md` — full read (binding contract)
- `.planning/REQUIREMENTS.md`, `.planning/ROADMAP.md` §Phase 19, `.planning/STATE.md` — full read
- `.planning/PROJECT.md` lines 22-40 — defect-ID-to-behavior changelog, used to verify RPT-06 checklist provenance rather than inferring it

### Secondary (MEDIUM confidence)
- `docs.magicmirror.builders/module-development/core-module-file.html` — MagicMirror's `getDom()` return-type contract, confirmed via WebSearch summary of official docs (not directly fetched in full)

### Tertiary (LOW confidence)
- None used as load-bearing for any recommendation in this document.

## Metadata

**Confidence breakdown:**
- Payload shape / defect provenance / worst-case counts: HIGH — every claim traced to a specific source line or the live capture artifact, no training-data guessing
- Auto-expand significance tiers, band-ordering sub-choice: MEDIUM — the mechanism is derived from verified data (value domains), but the specific tier cutoffs are a UX judgment flagged `[ASSUMED]`
- Render mechanism recommendation: HIGH on the *tradeoff facts* (probe harness limitation, MagicMirror contract), MEDIUM on the *recommendation itself* since it is a judgment call CONTEXT.md explicitly leaves open

**Research date:** 2026-09-06
**Valid until:** No external volatility (no third-party library, no upstream API) — valid until this project's own source changes. Re-check only if `hazardTaxonomy.js`, `node_helper.js`'s payload-assembly functions, or `scripts/probe-lib/module-stubs.js` are modified before planning begins.

---
*Phase: 19-unified-day-report-getdom-rewrite*
*Context gathered: 2026-09-06*
