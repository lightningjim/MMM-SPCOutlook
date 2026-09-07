# Phase 19: Unified Day Report — getDom() Rewrite - Pattern Map

**Mapped:** 2026-09-06
**Files analyzed:** 6 (1 full rewrite-in-place, 3 targeted backend edits, 1 new taxonomy table, 1 test-surface addition)
**Analogs found:** 6 / 6 — but note this phase's analogs are almost entirely **intra-file** (the file being rewritten already contains its own best patterns) rather than cross-file. See "Phase shape" note below before reading the table.

## Phase shape note (read first)

This is a rewrite-in-place, not new-file construction. `MMM-SPCOutlook.js`'s `getDom()`
(verified lines 184–784, ~600 lines) is being replaced wholesale, but the replacement must
carry forward ~20 existing helper functions and ~35 distinct preserved behaviors (RESEARCH.md's
RPT-06 checklist). The single most useful "pattern source" for the new renderer is **the
function it is replacing** — every helper below is a verbatim-reuse candidate, not a
reference to imitate. Line numbers below are freshly verified against the current working
tree (2026-09-06) and differ by roughly +15 to +17 from the numbers cited in some CONTEXT.md/
RESEARCH.md prose (those were written against an earlier revision) — use the numbers in this
document, they are current.

## File Classification

| File | Role | Data Flow | Closest Analog | Match Quality |
|------|------|-----------|-----------------|---------------|
| `MMM-SPCOutlook.js` (`getDom()`, rewrite in place) | component/renderer | request-response (render an already-resolved payload) | itself — `getDom()`'s own current helpers and guarded render sites | exact (intra-file) |
| `scripts/probe-lib/module-stubs.js` (`loadFrontendModule`/`renderDom`, NOT modified under the recommended render mechanism) | test harness / DOM stub | request-response | itself — already drives `getDom()` synchronously | exact, and load-bearing constraint |
| `scripts/probe-payload-resilience.js` (new RPT-06 + carried-in-fix scenarios) | test/probe scenario | event-driven (mutation-proof, RED/GREEN) | existing `frontend-*` scenarios (rendering) and existing `hazards-*`/`ero-*` scenarios (backend payload) | exact |
| `node_helper.js: _addHazardsOutlookGridEntries` (carried-in item 2 fix) | service / backend accumulator | transform (grid-match → payload notes) | itself — the day-grid branch of the same function (lines 2934–2935) already calls the accumulator this fix is missing | exact (intra-function twin) |
| `node_helper.js: _buildSourceHealth` (`reporting` derivation extension) | service / rollup | transform | itself — existing `reporting` derivation (lines 3663–3665) | exact (extend, don't replace) |
| `node_helper.js:939` (IN-01 dedupe key) | utility (key builder) | transform | none safe exists elsewhere in this file — see "No Analog Found" | none |
| `hazardTaxonomy.js` (new `SIGNIFICANCE_FLOOR` table, D-04 discretion) | config / static data table | transform (lookup table) | `PRECEDENCE` / `NO_RISK_FLOOR` in the same file | exact (same file, same shape) |

---

## Pattern Assignments

### `MMM-SPCOutlook.js` — helpers to carry forward verbatim

Every function below is inside the current `getDom()` closure and must survive into the new
renderer unchanged (RESEARCH.md's "Don't Hand-Roll" table; WR-06's "fix applied to one twin
and not the other" is this codebase's recurring defect, so **relocate, never reimplement**).

**`escapeHtml`** (verified lines 245–247) — the one canonical escape function:
```javascript
const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => (
  { "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;", "'": "&#39;" }[ch]
));
```
Contract: every remote-influenced string that reaches `innerHTML` goes through this first.
Keep verbatim; do not write a second escaper.

**`validHazardColor`** (verified lines 636–638) — the one color guard:
```javascript
const validHazardColor = (color) => (
  typeof color === "string" && /^[0-9a-fA-F]{6}$/.test(color) ? color : "aaaaaa"
);
```
Contract: strict 6-hex-digit regex, `"aaaaaa"` fallback. This is exactly what WR-02's site
(below) omits. Every new unified renderer color interpolation must call this, no exceptions —
`wpc-hazards` can carry a pass-through unmapped label/color (18 D-07), so "module-authored,
therefore safe" no longer holds anywhere in the new payload.

**`truncateHazardLabel` / `HAZARDS_LABEL_MAX_CHARS`** (verified lines 623, 627–632):
```javascript
const HAZARDS_LABEL_MAX_CHARS = 60;
const truncateHazardLabel = (label) => {
  const text = String(label);
  return text.length > HAZARDS_LABEL_MAX_CHARS
    ? text.slice(0, HAZARDS_LABEL_MAX_CHARS) + "…"
    : text;
};
```
Contract: truncate BEFORE escaping (bounds source chars, not entity expansions). The unified
renderer collapses what were two hazard call sites (`renderHazardsDays` +
`renderHazardsWindowBand`) into one — keep it that way: **one shared helper, one call-site
class**, per WR-06's own comment at line 624–626.

**`cigLabel` (numeric) / `cigLabelFromTierString` (string)** (verified lines 190–195,
198–203) — two functions, two input domains, both required (RESEARCH.md's finding: payload
`detail.cig`/`torCig`/etc. are numbers; a proximity entry's `nextTier` is a string like
`"CIG2"`):
```javascript
const cigLabel = (cig) => {
  if (cig === 3) return "③ ";
  if (cig === 2) return "② ";
  if (cig === 1) return "① ";
  return "";
};
const cigLabelFromTierString = (tier) => {
  if (tier === "CIG3") return "③";
  if (tier === "CIG2") return "②";
  if (tier === "CIG1") return "①";
  return "";
};
```

**`hasRenderableProximity` / `hasAnyRenderableProximity` / `proximityBadge`** (verified lines
209–220, 222–229, 230–238) — the PROXUI contract, `PROX_MIN_WEIGHT = 0.1`:
```javascript
const PROX_MIN_WEIGHT = 0.1;
const hasRenderableProximity = (prox) => {
  if (!prox) return false;
  if (typeof prox.value !== "number" || !isFinite(prox.value)) return false;
  if (typeof prox.nextTier !== "string" || prox.nextTier.length === 0) return false;
  const weight = prox.value - Math.trunc(prox.value);
  if (weight < PROX_MIN_WEIGHT) return false;
  const tierLabel = prox.nextTier.startsWith("CIG")
    ? cigLabelFromTierString(prox.nextTier)
    : prox.nextTier;
  if (tierLabel === "") return false;
  return true;
};
const proximityBadge = (prox, mode) => {
  if (!hasRenderableProximity(prox)) return "";
  const weight = prox.value - Math.trunc(prox.value);
  const tierLabel = prox.nextTier.startsWith("CIG")
    ? cigLabelFromTierString(prox.nextTier)
    : prox.nextTier;
  if (mode === "outside") return " " + weight.toFixed(1) + " (near " + tierLabel + ")";
  return " → " + tierLabel + " " + weight.toFixed(1);
};
```
UI-SPEC.md's D-08 compact exception and D-07 inside-mode badge both require this function's
**exact, unmodified return value** including its embedded leading space — do not re-derive or
reformat. WR-06 names this predicate pair explicitly as the recurring "fix one twin, not the
other" risk; both call sites (`hasRenderableProximity` itself is the shared twin-preventer)
must keep reading it, not a locally reimplemented copy.

**`ADVISORY_SOURCES`** (verified line 254):
```javascript
const ADVISORY_SOURCES = { spcMD: "showSPCMD", mpd: "showMPD" };
```
The one frontend-side statement of `kml-advisory` registry rows (cannot be derived — browser
context, no `require`). RPT-04's band inherits this mapping unchanged.

**`dowToText`** (verified lines 185–189) — retained ONLY for `hazardsWeekdayFromDate` below.
**Do not** call `dowToText(dow + N)` anywhere in the new per-day renderer — that arithmetic is
Pitfall 9 / D-01's explicit rejection. The correct pattern is `hazardsWeekdayFromDate`:
```javascript
// verified lines 643-646
const hazardsWeekdayFromDate = (dateStr) => {
  const dt = new Date(String(dateStr) + "T00:00:00Z");
  return isFinite(dt.getTime()) ? dowToText(dt.getUTCDay()) : null;
};
```
This already reads a payload's own resolved date string — the unified renderer's `Day N
(Weekday)` label (D-01) is `hazardsWeekdayFromDate(days[n].date)`, reusing this exact function
against the new `days[n].date` field instead of `entry.date`.

---

### WR-02 fix — copy the guarded sibling, not the vulnerable one

**The vulnerable site** (verified lines 604–614, `renderDayBlock`):
```javascript
const renderDayBlock = (label, block) => {
  const days = dayRiskCount(block);
  for (let d = 1; d <= days; d++) {
    if (block["day" + d + "Risk"] !== "NONE") {
      wrapper.innerHTML += label + " (Day " + d + "): <span style=\"color:#" +
        block["day" + d + "Color"] + "\">" +
        block["day" + d + "Text"] + "</span><br/>";
    }
  }
};
```
No `validHazardColor()`, no `escapeHtml()` on `Color`/`Text`. Not exploitable today only
because these particular blocks are module-authored lookup tables — a fact that does **not**
hold for the new unified payload's `wpc-hazards` entries.

**The already-correct sibling to copy** (verified lines 750–763, the HeatRisk render loop —
the one legacy site RESEARCH.md's checklist item #31 flags as already doing this right):
```javascript
const text = day.text ? escapeHtml(day.text) : escapeHtml(String(day.category));
wrapper.innerHTML += "Heat Risk (Day " + d + "): <span style=\"color:#" +
  validHazardColor(day.color) + "\">" + text + "</span><br/>";
```

**The strongest analog for the new per-day hazard segment** (verified lines 669–673,
`renderHazardsDays`'s per-hazard span builder — this is the one existing call site that
already combines all three guards for exactly the kind of remote-influenced `{color, label}`
pair the new unified renderer will render 8-per-day at most):
```javascript
const hazardSpans = renderableHazards
  .map((h) => (
    "<span style=\"color:#" + validHazardColor(h.color) + "\">" +
    escapeHtml(truncateHazardLabel(h.label)) + "</span>"
  ));
wrapper.innerHTML += "Hazards (" + weekdaySegment + "Day " + d + "): " +
  hazardSpans.join(", ") + "<br/>";
```
**This is the pattern to copy for D-02's compact `<Dimension> <Label>` segment** and for D-05's
detail sub-row label field — one `<span style="color:#{validHazardColor}">` wrapping
`escapeHtml(truncateHazardLabel(...))`, applied uniformly, per-entry.

---

### The rendering idiom — and the harness that constrains it

**Every existing row is built by string concatenation**, never `createElement`/`appendChild`:
```javascript
wrapper.innerHTML += "<span style=\"color:#RRGGBB\">…</span><br/>";
```
No CSS file exists (`getStyles()` returns only `weather-icons.min.css`); every color is an
inline `style="color:#..."` attribute.

**The deciding constraint: `scripts/probe-lib/module-stubs.js`'s DOM stub** (verified lines
263–298):
```javascript
// Source: scripts/probe-lib/module-stubs.js:263-298
function loadFrontendModule() {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "MMM-SPCOutlook.js"), "utf-8");
  let captured = null;
  const sandbox = {
    Module: { register: (_name, definition) => { captured = definition; } },
    Log: loggerStub,
    moment: (_ts) => ({ fromNow: () => "PROBE_AGE" }),
    // A plain object, not a DOM node: nothing parses what is assigned to `innerHTML`, so a
    // scenario can only assert on the concatenated markup string, never on a parsed tree.
    document: { createElement: () => ({ innerHTML: "", textContent: "" }) },
    setInterval: () => 0,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "MMM-SPCOutlook.js" });
  if (!captured) {
    throw new Error("MMM-SPCOutlook.js did not call Module.register — the frontend probe cannot run");
  }
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
`document.createElement()` returns a flat `{ innerHTML: "", textContent: "" }` object — no
`appendChild`, no `style` object, no child-node tree. It works today only because every call
site does `innerHTML +=`. **15+ existing scenarios depend on this exact shape.** If the
planner chooses `createElement`/`appendChild` for the new renderer, every one of those
scenarios (and any new RPT-06 scenario built the same way) breaks until this stub gains a real
element tree — that is new test infrastructure, not a side effect of the renderer rewrite, and
should be its own planned task if chosen. Recommendation carried from RESEARCH.md: **keep
`innerHTML +=`**, close WR-02 through the guard-application pattern above instead of a
mechanism change.

---

### Representative probe scenarios (pattern for new RPT-06 scenarios)

**Frontend-rendering scenario** — `frontend-escapes-remote-advisory-text`
(`scripts/probe-payload-resilience.js:4154–4189`), the shape every new frontend-rendering
scenario should copy: build a config, build a synthetic `spcrisk` payload with a hostile
value, `renderDom()` it, assert both a negative (`<img` never reaches output) and a **vacuity
guard** (a positive assertion that the content actually rendered, not just that the absence-
assertion is trivially satisfied by nothing rendering at all):
```javascript
// Source: scripts/probe-payload-resilience.js:4154-4189
name: "frontend-escapes-remote-advisory-text",
run: async (_helper) => {
  const frontend = loadFrontendModule();
  const config = { lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
    proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
    showMPD: true, showSPCMD: true };
  const hostile = `<img src=x onerror="alert(1)&'">`;
  const payload = noRiskPayloadWithAdvisory({
    spcMD: [{ label: `SPC MD ${hostile}`, hazardType: null }],
    mpd: [{ label: `WPC MPD ${hostile}`, hazardType: `Heavy rainfall ${hostile}` }]
  });
  const out = renderDom(frontend, { config, spcrisk: payload });
  if (out.includes("<img")) { throw new Error(`remote advisory text reached innerHTML unescaped: ${out}`); }
  const escapes = (out.match(/&lt;img/g) || []).length;
  if (escapes !== 3) { throw new Error(`expected all three hostile fields ... found ${escapes}`); }
  // ... plus per-entity assertions for ", ', &
}
```
This is the direct template for a new WR-02-closure scenario against the unified renderer
(feed a hostile label/color through a `days[n].hazards[]` entry, assert escaped, assert the
segment still rendered).

**A closely-adjacent scenario for carried-in item 2 / D-03's day-vs-band interaction** —
`frontend-hazards-window-band-only-is-not-an-all-clear`
(`scripts/probe-payload-resilience.js:4928–4986`) is the template for RPT-06's "everything
active at once" / "no risk anywhere" pair: it builds an intentionally narrow fixture (empty day
grid, one populated `windowBand` entry), asserts a **precondition** before the real assertion
(so a broken fixture can't pass vacuously), asserts the positive behavior, then runs two
**controls** — an all-quiet variant and a toggle-disabled variant — proving the gate/render
pair agree in both directions:
```javascript
// Source: scripts/probe-payload-resilience.js:4928-4986 (abbreviated)
const windowOnlyBlock = emptyHazardsBlock();
windowOnlyBlock.windowBand = [{ label: "Hazardous Heat", color: "a80000", mapped: true,
  startDate: "2026-08-29", endDate: "2026-09-02", offsetStart: 3, offsetEnd: 7 }];
// precondition: every day3..day14 hazards array is empty AND windowBand.length === 1
const payload = noRiskPayloadWithHazards(windowOnlyBlock);
const rendered = renderDom(frontend, { config, spcrisk: payload });
if (rendered === "No Severe Weather Risk") { throw new Error("HAZ-02: ..."); }
if (!rendered.includes("Hazardous Heat")) { throw new Error(`expected the window-band hazard to render, got: ${rendered}`); }
// Control 1: same shape with an EMPTY windowBand must render exactly the plain no-risk line
// Control 2 (WR-09): same populated payload with the toggle OFF must still short-circuit
```
ROADMAP's warning that **no fixture currently has a windowBand-only span with empty day
arrays** refers to exactly this pattern's payload shape applied to the NEW unified `days[]` —
a new scenario is needed pairing an empty `days[]` grid with a populated `sources['wpc-
hazards']`/band to reproduce carried-in item 2's live-observed gap.

**Backend-payload scenario** — `ero-wellformed-slgt`
(`scripts/probe-payload-resilience.js:1618–1652`), the template for any new backend-side
scenario (e.g. testing the `_addHazardsOutlookGridEntries` / `_buildSourceHealth` fix): reset
helper + logs, install a fetch/HTTP stub, call `getSpcOutlook` directly, assert exact field
values:
```javascript
// Source: scripts/probe-payload-resilience.js:1618-1652 (abbreviated)
name: "ero-wellformed-slgt",
run: async (helper) => {
  resetHelper(helper);
  resetLogs();
  helper._products = { showExcessiveRain: true };
  installFetch(helper, [[ERO_URLS[1], freshFetch(ERO_SLGT_BODY)]]);
  const originalPointInPolygon = turfStub.pointInPolygon;
  turfStub.pointInPolygon = () => true;
  try {
    const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
    assertPayloadIntact(out);
    if (out.excessiveRain.day1Risk !== "SLGT") { throw new Error(`day1Risk expected SLGT, got ${out.excessiveRain.day1Risk}`); }
    // ... exact field assertions
  } finally { turfStub.pointInPolygon = originalPointInPolygon; }
}
```
The carried-in item 2 fix needs a scenario in this shape asserting
`out.sources["wpc-hazards"].reporting === true` and `unmappedLabels` containing the injected
unmapped label, for a fixture whose only content is a window-band-routed match (mirroring
`hazards-precip-spread-buckets-every-day-in-span` at line 4224 for fixture-construction style,
but routed to Temperature/Wildfire/Drought instead of Precipitation so it takes the window-band
branch).

---

### Carried-in item 2 — `sources['wpc-hazards']` metadata fix site

**The day-grid branch that already does this correctly** (verified lines 2927–2935, inside
`_addHazardsOutlookGridEntries`):
```javascript
// Source: node_helper.js:2927-2935
for (let d = clampedStart; d <= clampedEnd; d++) {
  notes.noteReported("wpc-hazards", d);
  notes.noteActive("wpc-hazards", d);
  const dayEntry = gridDays[String(d)];
  ...
}
```

**The window-band branch that skips past it** (verified lines 2866–2873, the `continue` that
RESEARCH.md traces as root cause):
```javascript
// Source: node_helper.js:2866-2873
if (match.group !== "precipitation" ||
    this._isFullNominalWindow(legacyOffsetStart, legacyOffsetEnd, match.dayRange)) {
  // HAZ-02: Temperature and Wildfire/Drought carry no per-day resolution and route
  // to the window band unconditionally; D-04's full-nominal-window guard routes a
  // Precipitation feature spanning its layer's entire nominal window there too.
  // Neither case reaches the day grid.
  continue;
}
```
The `notes.noteUnmapped(...)` call (verified line 2916, inside the `if (dimension === null)`
block at line 2912) sits AFTER the routing `continue` at line 2866–2873 shown above — so a
window-routed match (`match.group !== "precipitation"`, or a full-nominal-window Precipitation
feature) exits the loop iteration before ever reaching the `dimension === null` check, and
`notes.noteUnmapped` is never called for it. Only a match that survives to the day-grid branch
(lines 2927–2935) gets its unmapped label recorded. **Fix shape** (RESEARCH.md's
recommendation, not yet implemented): call `notes.noteUnmapped("wpc-hazards", match.label)` for
a window-routed match too, mirroring the day-grid branch's own call; thread a new
day-independent `notes.noteWindowBandReported(sourceId)` accumulator and OR it into
`_buildSourceHealth`'s `reporting` derivation (verified lines 3663–3665):
```javascript
// Source: node_helper.js:3663-3665 — the site to extend, not replace
const reporting = !enabled ? false : (isAdvisory
  ? staleBySource[sourceId] !== true
  : (reportedDays[sourceId] ? reportedDays[sourceId].size : 0) > 0);
```
Keep `reportedDays`/`activeDays` day-grid-keyed and untouched (D-14's absent-vs-below-floor
distinction depends on that); the new signal is additive, `wpc-hazards`-specific.

---

### IN-01 — window-band dedupe key (`node_helper.js:939`)

```javascript
// Source: node_helper.js:936-941 (verified)
const seenWindowKeys = new Set();
const windowBand = [];
for (const entry of windowEntries) {
  const key = entry.label + "|" + entry.offsetStart + "|" + entry.offsetEnd;
  if (seenWindowKeys.has(key)) continue;
  ...
```
A `|`-containing remote `label` can collide with a different real span. **No existing dedupe
site in `node_helper.js` already handles a multi-field composite key safely** — every other
`Set`-based dedupe in this file keys on a single field (the day-grid's own `seenLabels` at
line 920 uses raw `item.label`; `_inFlightCacheKeys`/`_geoJsonCache` key on a single URL
string; the MPD listing's `seen` at line 1396 is single-field too). There is nothing to copy
here; RESEARCH.md's recommended fix (`JSON.stringify([entry.label, entry.offsetStart,
entry.offsetEnd])` as the key, or a nested `Map`) is a new pattern, not a relocation. Keep the
blast radius to this one call site — `HAZARDS_MAX_WINDOW_ENTRIES = 40` already bounds it.

---

### Legacy HeatRisk day-7 drop (folded todo, `node_helper.js:1153`)

```javascript
// Source: node_helper.js:1152-1153 (verified)
const d = this._heatRiskDayOffset(t.idpValidtime, todayUtcMs);
if (d < 1 || d > row.days) continue; // outside this product's declared span
```
This is the LEGACY block's own day-bucketing (unrelated to the Phase 18 grid re-anchor). No
fix needed per CONTEXT.md — confirm only that the unified `days[]` reader never calls through
this path. The unified grid path re-derives its own day offset independently (18-03, per
RESEARCH.md's citation of `node_helper.js:1130-1153`'s surrounding comment), so this legacy
bucketing function retires with the legacy `heatRisk` block, untouched by this phase.

---

### Backend payload assembly — `days[String(n)]` vs the legacy blocks

**The unified grid skeleton the new renderer reads** (verified lines 2595–2610,
`_buildGridDays`):
```javascript
// Source: node_helper.js:2595-2610
_buildGridDays(anchorInfo) {
  const days = {};
  for (let n = 1; n <= GRID_DAY_COUNT; n++) {
    const nominalStartForDay = anchorInfo.nominalStartMs + (n - 1) * MS_PER_DAY;
    const nominalEndForDay = anchorInfo.nominalStartMs + n * MS_PER_DAY;
    const windowStartMs = n === 1 ? anchorInfo.day1StartMs : nominalStartForDay;
    const windowEndMs = n === 1 ? anchorInfo.day1EndMs : nominalEndForDay;
    days[String(n)] = {
      date: this._utcDateString(nominalStartForDay),
      windowStart: new Date(windowStartMs).toISOString(),
      windowEnd: new Date(windowEndMs).toISOString(),
      hazards: []
    };
  }
  return days;
}
```
This coexists with the eight legacy blocks (`day1`..`day8`, `fireWeather`, `excessiveRain`,
`winterImpact`, `hazardsOutlook`, `heatRisk`) which 18 D-01 kept byte-for-byte specifically as
this phase's RPT-06 parity reference. **Sequencing for the planner:** the new renderer reads
`this.spcrisk.days`/`.summary`/`.sources` exclusively; the legacy blocks stay populated (and
unread by the new code) until RPT-06 sign-off, then their backend emission is deleted as a
final task (CONTEXT.md's open sequencing call — RESEARCH.md Open Question 2 recommends
gating the deletion on the checklist being fully checked off).

---

### `hazardTaxonomy.js` — where a new `SIGNIFICANCE_FLOOR` table belongs (D-04 discretion)

**The shape to copy** — `PRECEDENCE` and `NO_RISK_FLOOR` (verified lines 168–177, 184–219):
```javascript
// Source: hazardTaxonomy.js:168-177
const PRECEDENCE = {
  convective: ["spc-convective", "wpc-hazards"],
  fire: ["spc-fire", "wpc-hazards"],
  heat: ["heatrisk", "wpc-hazards"],
  winter: ["wpc-wssi", "wpc-hazards"],
  cold: ["wpc-hazards"],
  wind: ["wpc-hazards"],
  "flash-flood": ["wpc-ero"],
  "heavy-precip": ["wpc-hazards"]
};

// Source: hazardTaxonomy.js:182-219 (abbreviated)
const FLOOR_PREBAKED = "prebaked-at-fetch-time";
const NO_RISK_FLOOR = {
  "spc-convective": { categorical: (value) => value > 1, probabilistic: (risk) => risk !== "NONE" },
  "spc-fire": (value) => value > 0,
  "wpc-ero": FLOOR_PREBAKED,
  "wpc-wssi": FLOOR_PREBAKED,
  "wpc-hazards": FLOOR_PREBAKED,
  heatrisk: (category) => category !== null && category >= 1
};
```
A new `SIGNIFICANCE_FLOOR` table (RESEARCH.md's recommendation for D-04's auto-expand trigger)
is same-file, same-shape: one predicate per `DAY_SOURCE_IDS` entry with a value ladder,
declared beside `PRECEDENCE` (D-06's own precedent of "one table per file, not scattered
constants"). `assertTaxonomyIntegrity()` (verified starting line 238) is the existing pattern
for validating a new table's key coverage against `DAY_SOURCE_IDS`/`DIMENSIONS` at module-load
time — extend it, rather than adding an unvalidated table that can silently drift out of sync
with the source-id roster the way `PRECEDENCE`/`NO_RISK_FLOOR` are guarded against doing.
`DIMENSIONS` itself (verified lines 25–27):
```javascript
const DIMENSIONS = Object.freeze([
  "convective", "flash-flood", "winter", "heat", "cold", "wind", "fire", "heavy-precip"
]);
```

---

## Shared Patterns

### Escaping / color / truncation (apply to every new renderer call site)
**Source:** `MMM-SPCOutlook.js:245-247` (`escapeHtml`), `:636-638` (`validHazardColor`),
`:623/627-632` (`truncateHazardLabel`)
**Apply to:** every colored/labeled segment the new unified renderer emits — compact hazard
segments (D-02), detail sub-row labels (D-05), `also:` competitor labels (D-05), the band's
advisory/window-hazard lines (RPT-04, unchanged wording but same guard requirement).
```javascript
"<span style=\"color:#" + validHazardColor(entry.color) + "\">" +
escapeHtml(truncateHazardLabel(entry.label)) + "</span>"
```

### CIG glyphs — two domains, two functions
**Source:** `MMM-SPCOutlook.js:190-195` (numeric `cigLabel`), `:198-203` (string
`cigLabelFromTierString`)
**Apply to:** D-07's probabilistic sub-line (`detail.cig`/`torCig`/`hailCig`/`windCig` are
numbers) and D-07/D-08's proximity badges (`prox.nextTier` is a string like `"CIG2"`). Do not
merge these into one function — the input domains never overlap and merging risks silently
mis-branching on `typeof`.

### Proximity renderability / badge — one shared predicate pair
**Source:** `MMM-SPCOutlook.js:209-238`
**Apply to:** D-07's convective sub-row badge, D-08's compact exception. Both must call
`hasRenderableProximity`/`proximityBadge` unmodified — this is WR-06's named twin-drift risk
made concrete: the predicate and the badge renderer must never independently reimplement the
`PROX_MIN_WEIGHT` floor or the CIG-string-vs-plain-tier branch.

### "No literal day count survives outside the registry" (WR-08/CV-03)
**Source:** `MMM-SPCOutlook.js:265-268` (`dayRiskCount`), `:649-656` (`renderHazardsDays`'s
`Object.keys(block).filter(/^day\d+$/)` span derivation)
**Apply to:** the new renderer must loop `for (let n = 1; n <= 14; n++)` keyed off the
payload's own 14 always-present `days` keys (18 D-02's invariant) — never a literal derived
from a registry knob the frontend cannot read. This is structurally easier to satisfy than the
legacy code (the loop bound is a payload-shape guarantee now, not a per-product span to
enumerate), but the anti-pattern this history warns against (a hardcoded day count silently
diverging from the actual span) is exactly what a rewrite under time pressure could
reintroduce for a *sub-range* (e.g. hardcoding "flash-flood only shows on days 1-5" instead of
reading `suppressedBy === null` presence).

### Gate-and-render share one predicate (WR-04's rule, CR-01's mirror)
**Source:** `MMM-SPCOutlook.js:359` (`hazardsOutlookHasWindowEntries` calling the same
`renderableWindowEntries` the renderer calls), `:381-398`/`:750-763` (`heatRiskDaysToRender`
shared by gate and render loop)
**Apply to:** 18 D-16 already collapses the empty-state gate to `summary.anyHazard` (one read),
which structurally retires most of this risk class — but D-03's day-skip rule and D-08's
proximity-only exception are new predicates this phase introduces, and they must be written
once and called from both "does this day render at all" and "what does this day render",
never as two independently-maintained boolean expressions.

---

## No Analog Found

| File / Site | Role | Data Flow | Reason |
|---|---|---|---|
| `node_helper.js:939` (IN-01 dedupe key) | utility | transform | No other dedupe site in this file uses a multi-field composite key over remote-controlled input; every existing `Set`-keyed dedupe (day-grid `seenLabels` at :920, MPD listing `seen` at :1396, `_inFlightCacheKeys`/`_geoJsonCache`) keys on one field only. RESEARCH.md's `JSON.stringify([label, offsetStart, offsetEnd])` recommendation is a new pattern for this codebase, not a relocation. |
| D-04's auto-expand significance floor (new `SIGNIFICANCE_FLOOR` table) | config / static data | transform | Genuinely new — `NO_RISK_FLOOR` answers "does this reach the payload at all", not "is this serious enough to auto-expand"; no existing table answers the second question. Use `PRECEDENCE`/`NO_RISK_FLOOR`'s *shape* (see above) but the content/thresholds are new, `[ASSUMED]` per RESEARCH.md, and need confirmation before locking. |
| RPT-04's band-below-day-blocks placement | layout | request-response | Today's code has an above-the-days advisory band (`:513-540`) and a below-the-days window-hazard band (`:682-730`) — but never both together, below, in one place. There is no existing "combined band below" render site to copy; the planner is composing two existing, independently-correct loops into a new relative position, not copying a placement pattern. Record as verified-intentional on the RPT-06 checklist (Pitfall 3), not a regression. |
| `detail.sign` field (day 4-8 convective trend) | — | — | Present in the payload since v1.0, never rendered by any shipped `getDom()`. No render pattern exists anywhere to copy; RESEARCH.md Open Question 3 recommends treating it as out of scope for this phase rather than inventing new UI. |
| `scripts/probe-lib/module-stubs.js`'s DOM stub, IF `createElement`/`appendChild` is chosen | test harness | — | No existing minimal-real-element-tree stub exists in this codebase to copy from; this would be new infrastructure (children arrays, nested `appendChild`, per-node `style` object, deferred `textContent` serialization), not a relocation of an existing pattern. Only relevant if the planner overrides the `innerHTML +=` recommendation. |

---

## Conventions

Derived via the shared deterministic module (`bm/4.6.0/bin/gsd-tools.cjs verify conventions
--derive --scope .`) against the whole repo (small codebase — sample sizes below are the
entire relevant file population, not a subset).

| Axis | Dominant | Share | Entropy | Status |
|------|----------|-------|---------|--------|
| File-name casing | — | — | — | insufficient data (4 files: 2 camel, 1 snake, 1 other) |
| Identifier casing | camel | 100% | 0 | named contract |
| Export style | — | — | — | insufficient data (3 files, all `module.exports`/CJS, but sample too small to certify) |
| Import style | — | — | — | insufficient data (3 files: 2 CJS `require`, 1 ESM-flavored) |

**Contested hotspots (author's choice).** This plugin's own prototype for an intentional,
never-to-be-unified contested split is the CJS↔SDK dual resolver (`bin/lib/**` is CJS
`module.exports`/`require`; `sdk/src/**` is ESM `export`/`import`) — each half is internally
consistent per-directory, contested only when compared repo-wide, and a reviewer/planner
should match whichever directory they're editing rather than trying to reconcile the two. This
repository has no analogous directory split (`node_helper.js`, `MMM-SPCOutlook.js`,
`hazardTaxonomy.js`, `productRegistry.js` are all CJS, all camelCase identifiers, at the repo
root) — the axes above read "insufficient data" rather than "contested" simply because the
file population is small, not because of a real per-directory style fork. Nothing in this
phase's file list crosses a style boundary; write new code matching `node_helper.js`'s and
`MMM-SPCOutlook.js`'s existing camelCase/CJS/`module.exports` convention throughout.

---

## Metadata

**Analog search scope:** `MMM-SPCOutlook.js` (full read, 784 lines), `node_helper.js`
(targeted reads: :900-980, :1130-1170, :2580-2620, :2830-2970, :3400-3500, :3520-3690),
`hazardTaxonomy.js` (targeted reads: :20-52, :160-230), `scripts/probe-lib/module-stubs.js`
(:240-338), `scripts/probe-payload-resilience.js` (grep survey of all `name:` scenario
declarations + targeted reads of 3 representative scenarios)
**Files scanned:** 5 source files + 1 test/probe file
**Pattern extraction date:** 2026-09-06
