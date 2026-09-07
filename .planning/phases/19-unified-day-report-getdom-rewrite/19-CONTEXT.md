# Phase 19: Unified Day Report — getDom() Rewrite - Context

**Gathered:** 2026-09-06
**Status:** Ready for planning

<domain>
## Phase Boundary

Replace the entire `getDom()` render path (`MMM-SPCOutlook.js:184–784`) with one merged block
per day driven by Phase 18's unified `days` / `summary` / `sources` payload — compact by
default, expandable via `dayReportDetail`, non-day-scoped items in a separate band below the
day blocks, correct empty state, and zero regressions against BUG-01..04, FWXT-01..05,
PROX-01..06, PROXUI-01..05.

Requirements: RPT-01, RPT-02, RPT-03, RPT-04, RPT-05, RPT-06.

This phase is display-only. It introduces no new product, no new fetch, and no new merge
logic. The payload it renders was built and live-validated in Phase 18; RPT-07 holds because
this renderer reads resolved fields and never recomputes precedence.

**Secondary, explicitly droppable scope** (ROADMAP: cut back to backlog rather than let these
compete with behavior parity), ordered by dependence:
1. **WR-02** — `renderDayBlock` (`MMM-SPCOutlook.js:604–614`) interpolates `day{N}Color` /
   `day{N}Text` into `innerHTML` without `validHazardColor()` / `escapeHtml()`. Not
   exploitable today (closed module-authored lookup tables) and covered by no threat-model
   row in any of Phase 18's 16 plans. **Must close before any new row routes through this
   renderer** — which happens inside this phase.
2. **`sources['wpc-hazards']` metadata under-reports** — observed on the target Pi 2026-09-06:
   fetch succeeded with two real `windowBand` spans, yet `reporting: false` and
   `unmappedLabels: []` despite logging "unmapped hazard label rendered verbatim: Severe
   Drought". The empty `days[]` is correct by design (RPT-04 routes window spans to the band);
   only the two metadata fields are wrong. Matters here because a display keying off
   `sources[id].reporting` would call the source silent while the band renders its entries.
3. **IN-01** — window-band dedupe key (`node_helper.js:939`) is
   `label + "|" + offsetStart + "|" + offsetEnd` over a remote-controlled label, so a label
   containing `|` can collide and silently drop a band entry. Key hygiene, not a resource
   risk (bounded by `HAZARDS_MAX_WINDOW_ENTRIES = 40`).

</domain>

<decisions>
## Implementation Decisions

### Compact line composition

- **D-01: day blocks are labeled `Day N (Weekday)`** — e.g. `Day 3 (Thu)`. Preserves the
  "Day N" vocabulary the current display and SPC's own products use, which keeps the RPT-06
  parity diff against the old renderer readable; the weekday disambiguates days 8–14, where a
  weekday-only label would repeat. The weekday is derived from the payload's resolved UTC
  `date` (18 D-02 / 16 D-01), **never** from `dowToText(dow + N)` — that arithmetic is
  Pitfall 9 and is wrong under 18 D-09's 12Z–12Z grid.
  - Note for downstream copy: under 18 D-09 a day labeled `Thu` means 12Z Thu → 12Z Fri, not
    a calendar day. `windowStart`/`windowEnd` are on every day entry if the display ever needs
    to state the real span.
  - Rejected: weekday only (`Thu` appears twice across a 14-day window with nothing separating
    the two); weekday + date (unambiguous but costs ~6 characters on every row and abandons
    the Day-N vocabulary the parity diff leans on).

- **D-02: compact hazards are worded `<Dimension> <Label>`** — `Convective Enhanced ·
  Flash Flood Slight · Heat Major`, dot-separated, each entry in its payload color. The
  dimension comes from 18 D-05's resolved taxonomy field, already in the payload. This
  disambiguates the real collisions (SPC and ERO both emit "Slight"; WSSI and HeatRisk both
  emit "Moderate") without naming a product, so RPT-03's source attribution stays exclusive to
  detail mode. Reads as what the hazard *is* rather than who said it.
  - Rejected: bare colored labels (`Slight · Slight` on one day is genuinely ambiguous, and
    color alone does not disambiguate on a mirror read from across a room); short source tags
    (`Slight (ERO)` — disambiguates exactly but duplicates what RPT-03's sub-rows exist for).

- **D-03: days with no surviving hazard are skipped entirely.** Only days carrying at least one
  survivor (`suppressedBy === null`) render a block — matching today's renderer, which skips
  any day whose risk is `NONE`. The rendered day list is therefore non-contiguous
  (Day 3, Day 6, Day 9) with no marker for the checked-and-clear days between.
  - Interacts with D-08: a proximity-only day is *not* quiet for this rule.
  - Rejected: render every covered day with an explicit clear marker (unambiguous — a missing
    day would mean "not covered" rather than "unchecked" — but costs up to 14 rows on an
    all-quiet mirror); contiguous through the last active day (no interior gaps, empty tail
    dropped).

### Detail mode semantics

- **D-04: `dayReportDetail` is a global config boolean, plus per-day auto-expand.** MagicMirror
  has no keyboard or pointer, so there is no per-day click-to-expand. The global flag sets the
  baseline for every day (defaults false, matching every other flag in this module's `defaults`
  block); on top of that, an individual day expands on its own when it is significant enough,
  so a serious day shows its attribution without the user having reconfigured anything.
  - Rejected: global boolean only (simplest, but a Moderate-risk day looks identical to a
    General Thunderstorms day at default config); global boolean plus a runtime socket
    notification (reachable without a restart, but a new surface to define and secure for a
    module with no other runtime control channel).

- **D-05: expanded days group sub-rows by dimension** — the resolved entry first, competing
  entries indented beneath it as `also:`. The competing-claims structure *is* the layout,
  rather than a per-row dim treatment or an inline "superseded by" annotation. This carries
  18 D-13's framing (suppression resolves competing claims; it must never read as one source
  silencing another) into the layout itself. All entries render, per 18 D-03.
  ```
  Day 1 (Tue)  Convective Enhanced · Heat Major
    Convective   Enhanced        — SPC
    Heat         Major           — HeatRisk
                   also: Hazardous Heat — WPC Hazards
  ```
  - Rejected: dimmed rows plus an attribution note (most informative, widest, and the most
    wording to get wrong); dimmed only (no wording risk, but the viewer never learns why the
    WPC entry sits below).

- **D-06: an expanded day keeps its compact line as a header**, with sub-rows beneath. The
  at-a-glance scan survives at any viewing distance, and compact and detail stay one layout
  with an added tier rather than two layouts — which keeps the RPT-06 parity diff simple.
  Accepted cost: every hazard is restated once.
  - Rejected: day label only (no duplication, more vertical room for attribution, but a fully
    expanded 14-day mirror loses the one-line scan entirely); header only when auto-expanded
    (two layouts to maintain and two paths for RPT-06 to check).

### Badge placement

- **D-07: proximity badges and the SPC probabilistic breakdown are detail-only.** The
  categorical proximity badge attaches to the convective sub-row (`Enhanced → Moderate 0.4`),
  and the tornado/hail/wind icon line — percentages, CIG ①②③ markers, and per-type proximity
  badges — renders as a sub-line beneath that same convective sub-row, matching 18 D-05's
  treatment of the breakdown as an optional `detail` sub-object on the single `convective`
  entry. The compact line stays one uniform hazard list.
  ```
  Day 1 (Tue)  Convective Enhanced · Heat Major
    Convective   Enhanced → Moderate 0.4   — SPC
       🌀② 10%  ⬚① 30%  💨 15%
    Heat         Major                     — HeatRisk
  ```
  - **Accepted cost, must be recorded on the RPT-06 checklist:** at default config a user sees
    neither the proximity badge nor the probabilistic breakdown they see today. This is a
    deliberate deviation in *where* those render, not a removal — both are fully present in
    detail mode, and D-04's auto-expand surfaces them without reconfiguration on the days that
    matter most. D-08 restores the one case where the deviation would lose information rather
    than relocate it.
  - Rejected: badges on the compact line (strictest parity, but stacks the most width onto the
    days that are already busiest); a day-level badge strip (one home for the badge regardless
    of source count, but severs the badge from the convective entry it describes); one sub-row
    per hazard type (most uniform columns, but turns one day into up to six sub-rows).

- **D-08: `proximityWeighting: true` makes proximity content — a proximity-only day renders,
  in compact, badge alone.** This is the deliberate exception to D-03 and D-07. Today a day at
  no risk still renders `0.3 (near Marginal)` (PROXUI outside mode); under D-03 + D-07 alone
  that day would vanish at default config, which is a parity break rather than a relocation.
  A user who set `proximityWeighting: true` explicitly asked for near-miss awareness, so the
  flag being on is what makes the day worth a row. The exception is scoped to a flag that
  defaults false, so most users never encounter it.
  ```
  Day 1 (Tue)  Convective Enhanced · Heat Major
  Day 2 (Wed)  0.3 (near Marginal)
  Day 4 (Fri)  Flash Flood Slight
  ```
  - Rejected: detail-mode only (keeps D-07 exception-free, at the price of a documented
    RPT-06 deviation that loses a shipped v1.2 behavior at default config); never render it
    (simplest renderer rule, retires PROXUI's outside mode outright).

- **D-09: the stale indicator stays exactly as it is today** — one global `⚠ Stale — <ago>`
  line driven by `_stale` / `_staleAsOf`, retaining the CR-01 guard that a stale payload with
  no renderable risk must never present as a bare `⚠` badge, and 16 D-15's rule that a
  data-age trip sets `anyStale` but is excluded from `_staleAsOf`. Positioned relative to the
  new day blocks; content and guard unchanged. The per-source staleness 18 D-04 emits stays
  unrendered — **PROJECT.md puts per-product staleness UX out of scope for v2.0.**
  - Rejected: per-source staleness marks in detail (the data exists, but this is exactly the
    out-of-scope UX — captured in Deferred instead); relocating the badge to the band (parity
    in content, changed in placement, needing a checklist note for no gain).

### Folded Todos

- **Legacy HeatRisk day-7 drop** (`.planning/todos/pending/2026-09-05-fix-legacy-heatrisk-day1-7-block-dropping-day-7-during-00z-1.md`,
  `resolves_phase: 19`, `node_helper.js:1153`). The legacy `heatRisk.day1..day7` block renders
  only 6 of 7 days during the 00Z–12Z window. **No fix is needed** — the unified `days[]` grid
  already carries all seven days correctly (18-LIVE-CAPTURE.md: `reportedDays:[1..7]`), and the
  defect retires with the legacy block. The phase's obligation is only to confirm the unified
  path is the sole reader before the legacy block is retired. If Phase 19 were descoped, this
  reverts to a standalone backend fix.

### Claude's Discretion

- **Row budget / compact-line truncation** (deferred to this phase by 18 D-15, which emits
  every survivor uncapped). Pick from the worst-case survivor count the live payload and probe
  fixtures actually produce. Constraint: 18 D-15 fixes taxonomy order, so any cut is
  deterministic and drops the least-severe first; a width-dependent clip is not reproducible
  and cannot be checked off against RPT-06.
- **The auto-expand trigger for D-04.** Hard constraint: it must not require a cross-dimension
  severity ranking — 18 D-15 explicitly rejected building one ("is Enhanced convective worse
  than a Slight ERO?"), and nothing has since derived it. The shape that satisfies this is a
  per-dimension significance floor declared in `hazardTaxonomy.js` beside the precedence table
  (18 D-06's artifact), where each dimension answers "is *my* reading significant?"
  independently. A hazard-count trigger or a priority-source list also satisfy the constraint;
  both were presented and neither was chosen over the other.
- **Render mechanism** — `wrapper.innerHTML +=` string concatenation (today) versus
  `createElement`/`textContent` DOM construction. Not discussed; Claude's call at planning
  time. Weigh that a `textContent` rewrite makes the WR-02 class of defect structurally
  impossible rather than fixed once, against it being the larger diff during a phase whose
  gate is behavior parity. Note the module ships **no CSS file** — `getStyles()` returns only
  weather-icons and every color is an inline `style="color:#..."` — so introducing one is part
  of this decision.
- **Legacy block retirement timing.** PROJECT.md fixes the outcome (unified day report is the
  sole render path, no legacy fallback); 18 D-01 kept the eight legacy blocks byte-for-byte
  expressly so this phase has an old-vs-new reference for the RPT-06 checklist. Whether the
  backend emission is deleted in this phase or after parity sign-off is a sequencing call.
  The reference must still exist while the checklist is being worked.
- **Empty-state copy for RPT-05.** 18 D-16 locks the mechanism: read `summary.anyHazard` for
  the verdict, consult `sources[]` to separate all-quiet from all-failed from all-disabled —
  three causes needing different wording. Today's strings are `No Severe Weather Risk` and
  `No Severe Weather Risk (unconfirmed)`. Carried-in item 2 (`wpc-hazards` `reporting: false`)
  lands here: fix the metadata before keying display off `sources[id].reporting`.
- **Band layout for RPT-04** — ordering of MDs, MPDs and window-spanning Hazards Outlook
  entries, whether the three are visually separated, and how a multi-day span is worded.
  Carried-in IN-01 is fixed here.
- **RPT-06 parity-run mechanics** — how the two mandatory states ("no risk anywhere",
  "everything active at once") are produced, and whether the old renderer is kept runnable
  side-by-side to diff against.
- Internal function decomposition and file placement.

</decisions>

<specifics>
## Specific Ideas

- The compact line the user selected, verbatim, as the target shape:
  ```
  Day 3 (Thu)  Convective Enhanced · Flash Flood Slight · Heat Major
  Day 4 (Fri)  Convective Slight · Flash Flood Marginal
  ```
- The expanded shape, verbatim:
  ```
  Day 1 (Tue)  Convective Enhanced · Heat Major
    Convective   Enhanced → Moderate 0.4   — SPC
       🌀② 10%  ⬚① 30%  💨 15%
    Heat         Major                     — HeatRisk
                   also: Hazardous Heat    — WPC Hazards
  ```
- The user consistently traded compact-line width away for uniformity: proximity, the
  probabilistic breakdown, and source attribution all moved to detail. The single place they
  overrode that instinct (D-08) was where the alternative would have *lost* information at
  default config rather than relocated it. That distinction — relocation is acceptable,
  silent loss is not — is the rule to apply to any layout question this discussion did not
  cover.
- 18 D-13's framing carried forward and made structural in D-05: suppression is competing
  claims being resolved, never one source silencing another. Applies to the wording of the
  `also:` sub-rows.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

ROADMAP.md carries no `Canonical refs:` line for this phase; this list is assembled from
REQUIREMENTS.md, PROJECT.md, the prior phase CONTEXT files, and the research artifacts.

### Phase scope and requirements
- `.planning/ROADMAP.md` §"Phase 19: Unified Day Report — getDom() Rewrite" — goal, the six
  success criteria, and the three carried-in secondary items with their full rationale and
  droppability rule
- `.planning/REQUIREMENTS.md` — RPT-01..06 (lines 51–56); RPT-07 (line 57, complete in Phase 18
  — the frontend renders both detail levels without re-deriving precedence); the Out of Scope
  list
- `.planning/PROJECT.md` — v2.0 framing: unified day report is the sole render path with no
  legacy fallback; **per-product staleness UX is out of scope** (constrains D-09)

### The payload this phase renders
- `.planning/phases/18-merge-precedence-unified-payload-schema/18-CONTEXT.md` — the whole file
  is the contract. Load-bearing here: **D-02** (all fourteen day keys always present, each with
  a resolved UTC `date`), **D-03** (`{dimension, source, label, value, color, suppressedBy}`;
  compact renders `suppressedBy === null`, detail renders all with source labels), **D-05**
  (coarse dimension set; SPC's tornado/hail/wind probabilistic breakdown rides as an optional
  `detail` sub-object on the single `convective` entry), **D-09** (12Z–12Z canonical grid — a
  day labeled Thu is 12Z Thu → 12Z Fri), **D-13** (only an active hazard suppresses; competing
  claims framing), **D-15** (uncapped ordered survivor list; truncation deferred to Phase 19),
  **D-16 + D-20** (`summary` shape; `anyHazard` decides RPT-05 in one read; `sources[]`
  separates all-quiet / all-failed / all-disabled), **D-01** (legacy blocks preserved
  byte-for-byte as this phase's parity reference)
- `.planning/phases/18-merge-precedence-unified-payload-schema/18-LIVE-CAPTURE.md` — a real
  captured payload; the ground truth for what the renderer will actually receive
- `.planning/phases/18-merge-precedence-unified-payload-schema/18-REVIEW.md` — origin of WR-02
- `.planning/phases/18-merge-precedence-unified-payload-schema/18-SECURITY.md` — confirms WR-02
  is covered by no threat-model row; AR-07 / T-18-53 is the same answered-vs-never-asked
  ambiguity as carried-in item 2
- `.planning/phases/18-merge-precedence-unified-payload-schema/deferred-items.md` — full trace
  of the legacy HeatRisk day-7 drop
- `.planning/phases/16-*/16-REVIEW.md` — origin of IN-01

### Prior display decisions this phase must preserve or knowingly change
- `.planning/phases/16-*/16-CONTEXT.md` — D-01 (weekday labels from the resolved date, never
  day arithmetic), D-11 (unmapped label renders verbatim, logs once), D-15 (data-age trip sets
  `anyStale` but is excluded from `_staleAsOf` — constrains D-09)
- `.planning/phases/17-*/17-CONTEXT.md` — D-01/D-02 (`showMinorHeat` is a frontend-only display
  floor; the backend emits every day including filtered-out ones, so this renderer owns the
  filter)
- `.planning/phases/15-*/15-CONTEXT.md` — D-03/D-05 (advisories live in one band outside the
  day blocks — the precedent RPT-04 extends), **D-10 (every probe scenario must be individually
  mutation-proven — blocking)**

### Research this phase must not re-derive
- `.planning/research/PITFALLS.md` — **Pitfall 9 is this phase's central hazard**: display-rewrite
  regressions; the `getDom()` no-risk gate has ~15+ independently-toggleable boolean inputs.
  18 D-16 retired the combinatorial gate into `summary.anyHazard`, but every other Pitfall 9
  regression class is live here
- `.planning/research/FEATURES.md` Part C — fixed category order, MD/MPD placement, and the
  finding that both detail levels share one data model

### Code contract
- `MMM-SPCOutlook.js:184–784` — the `getDom()` being replaced. Read in full before planning:
  every inline comment is a prior defect's tombstone (WR-04/06/08/09/12, CR-01/03, T-16-19/20/22,
  IN-08). Specifically: `:604–614` `renderDayBlock` (WR-02), `:209–241`
  `hasRenderableProximity`/`proximityBadge` (the PROXUI gate contract, whose predicates must
  stay mirrored), `:245` `escapeHtml`, `:653` `validHazardColor`, `:625` `truncateHazardLabel`
  (`HAZARDS_LABEL_MAX_CHARS = 60`), `:253` `ADVISORY_SOURCES`, `:490`/`:779` the two empty-state
  strings, `:494–506` the stale badge and its CR-01 guard
- `MMM-SPCOutlook.js:2–32` — `defaults`, where `dayReportDetail` joins. Note the documented
  CFG-01 deviation for `showSPCMD` and the `showMinorHeat` rationale
- `node_helper.js:2602` — where `days[String(n)]` is assembled
- `node_helper.js:939` — the window-band dedupe key (IN-01)
- `node_helper.js:1153` — the legacy HeatRisk day filter (folded todo; retires with the block)
- `hazardTaxonomy.js` — 18 D-06's artifact: `(source, label)` map plus the precedence table.
  Where D-04's per-dimension significance floor belongs if that shape is chosen
- `scripts/probe-payload-resilience.js` — the only executable verification surface in the
  project; new scenarios go here under 15 D-10's mutation-proof standard

### Note on staleness
`.planning/codebase/ARCHITECTURE.md` is dated 2026-03-04, predates v2.0, and is **partially
stale**. Prefer the phase CONTEXT files and the source itself.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`escapeHtml`** (`:245`) and **`validHazardColor`** (`:653`) — the two guards WR-02's
  renderer skips. Whatever render mechanism D-01 lands on, these are the existing contract for
  remote-sourced text and color.
- **`truncateHazardLabel`** / `HAZARDS_LABEL_MAX_CHARS = 60` (`:625`) — the render-boundary
  bound on unbounded remote labels (T-16-20). Applies before escaping, so the bound counts
  source characters. Still needed: 18 D-07 renders unmapped labels verbatim.
- **`hasRenderableProximity` / `hasAnyRenderableProximity` / `proximityBadge`** (`:209–241`) —
  the PROXUI visibility contract, including `PROX_MIN_WEIGHT = 0.1` and the inside/outside mode
  split. The predicates deliberately mirror the badge renderer's internal gates; WR-06 records
  that a fix applied to one twin and not the other is this codebase's recurring defect shape.
- **`cigLabel` / `cigLabelFromTierString`** (`:189`, `:200`) — the ①②③ markers, needed by
  D-07's probabilistic sub-line.
- **`ADVISORY_SOURCES = { spcMD: "showSPCMD", mpd: "showMPD" }`** (`:253`) — the one place the
  frontend names `kml-advisory` registry rows. The frontend cannot `require` the registry, so
  this mapping is stated, not derived. RPT-04's band inherits it.
- **`scripts/probe-payload-resilience.js`** — 32+ scenarios; the only executable verification
  surface. Note the ROADMAP's warning that no probe fixture currently has a windowBand-only
  span with empty day arrays, which is why 123 green scenarios and the phase verifier both
  missed carried-in item 2.

### Established Patterns
- **Rendering is `wrapper.innerHTML += "<span style=\"color:#RRGGBB\">…</span><br/>"` string
  concatenation throughout.** There is no CSS file — `getStyles()` returns only
  `weather-icons.min.css`. Every color is inline.
- **No literal day count survives outside the registry** (WR-08/CV-03). `node_helper` derives
  every day span from `PRODUCT_REGISTRY.<row>.days`; the old frontend hand-enumerated ERO and
  WSSI terms in four places, so raising a registry `days` knob produced a correct payload whose
  new days never rendered *and never disqualified the no-risk short-circuit*, with no error at
  either end. 18 D-02's fourteen always-present keys make this structurally impossible in the
  new renderer — the loop must key off the payload, never a literal.
- **No automated test framework** (out of scope). Verification is manual UAT, static analysis,
  and the probe script. `workflow.nyquist_validation` is disabled in `.planning/config.json`.
- **15 D-10 is blocking**: every probe scenario must be individually mutation-proven — break
  the exact line it covers, confirm RED with a diagnosable message, restore.

### Integration Points
- `socketNotificationReceived` (`:94`) stores the payload on `this.spcrisk` and calls
  `updateDom()`. The new renderer reads `this.spcrisk.days` / `.summary` / `.sources` instead
  of the eight legacy blocks. The notification contract is unchanged.
- `buildRequestPayload` (`:59`) — `dayReportDetail` does **not** belong here. Like
  `showMinorHeat` (17 D-01/D-02) it is frontend-only: it filters a payload the backend has
  already fully emitted, so it goes in neither the products object nor `node_helper`'s
  `SUB_TOGGLES`.
- `getStyles` (`:178`) — the hook if D-01's render mechanism introduces a stylesheet.

</code_context>

<deferred>
## Deferred Ideas

- **Per-product staleness UX** — marking *which* source's reading was stale in expanded days.
  The data is already emitted by 18 D-04 (per-source staleness plus `idp_filedate`), so this is
  display work only. Explicitly out of scope for v2.0 per PROJECT.md; a natural v2.1 item.
- **Runtime `dayReportDetail` toggling via socket notification** — would let detail be reached
  without editing `config.js` and restarting. Presented and not chosen; it needs a runtime
  control surface this module does not otherwise have.
- **Cross-dimension severity ranking** — would enable a single "worst hazard today" and a
  severity-ordered compact line. 18 D-15 rejected building one and nothing has derived it since.
  Any future feature needing "is Enhanced convective worse than a Slight ERO?" starts here.

</deferred>

---

*Phase: 19-unified-day-report-getdom-rewrite*
*Context gathered: 2026-09-06*
