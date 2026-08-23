# Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation Discussion - Context

**Gathered:** 2026-08-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Ship two WPC products, each behind its own toggle:

1. **WSSI Overall Impact** for Days 1–3 (`showWinterImpact`) — an ArcGIS MapServer product,
   structurally the same shape as Phase 14's ERO.
2. **Mesoscale Precipitation Discussions** (`showMPD`) — every concurrently active MPD covering
   the user's location. NOT an ArcGIS product: KMZ index → member KMZs → polygon containment.

Requirements: WSSI-01, WSSI-02, WSSI-03, MPD-01, MPD-02, MPD-03, MPD-04.

**Not in this phase:** Hazards Outlook (Phase 16), HeatRisk + parallelized fetching (Phase 17),
cross-source merge/precedence (Phase 18), the getDom() rewrite (Phase 19).

</domain>

<decisions>
## Implementation Decisions

### Registry shape & product plumbing

- **D-01:** Widen `PRODUCT_REGISTRY` with a **`kind` per row**. Two kinds this phase:
  `"arcgis-day-layers"` (ERO, WSSI) and `"kml-advisory"` (SPC MD, WPC MPD). `buildArcGisQuery`
  is untouched and stays non-overridable per Phase 14 D-09 — it simply becomes what the
  `arcgis-day-layers` kind uses. This leaves a declared slot for Phase 17's raster-identify
  HeatRisk instead of forcing a third product against an ArcGIS-shaped table.

- **D-02:** **Migrate SPC Mesoscale Discussions into the registry** as a `kml-advisory` row
  alongside WPC MPD, so both advisory products share one fetch path, one containment helper,
  and one host allowlist.
  *Rationale (evidence-backed):* 14-REVIEW.md WR-06 found the `features[0]` anti-pattern alive
  in the MD path while ERO had already been fixed via `_validTimeOfWinner` — "the fix was
  applied to the new product and not to the existing one." One shared path makes that
  divergence structurally impossible rather than a thing reviewers must catch.
  **Scope limit:** SPC categorical/probabilistic and fire-weather layers stay OUT. Phase 14's
  D-08 continues to govern those — its stated rationale ("stack regression risk onto the
  foundation phase") was scoped to Phase 14, but the underlying risk for those ~11 cache-write
  call sites is real and unchanged.

- **D-03:** Advisories move **inside the outlook payload** as
  `advisories: { spcMD: [...], mpd: [...] }`. The separate `md` socket element is retired.
  This borrows only the `advisories` key that Phase 18's RPT-07 already commits to, so Phase 18
  reshapes in place rather than relocating. Phase 14's D-02 still holds — do **not** pre-adopt
  the `days`/`summary`/`sources` structure.

  Target shape:
  ```
  socket: [outlook, seq]          // md element retired
  outlook = {
    day1..day8, fireWeather, excessiveRain,
    winterImpact: { day1..day3 },
    advisories: { spcMD: [...], mpd: [...] },
    _stale, _staleAsOf
  }
  ```

- **D-04:** An advisory **fetch failure** rolls into the global `anyStale` flag (per Phase 14
  D-04). A **successful fetch returning zero advisories does not** — "none active" is the normal
  state most of the year and is a real answer, not staleness. Consequence: a quiet day with a
  broken MPD feed renders the CR-01 outage state ("⚠ Stale … No Severe Weather Risk
  (unconfirmed)") rather than a confident all-clear. Per-product staleness UX stays deferred
  per Phase 14 D-04.

### Advisory display

- **D-05:** **One advisory band**, each entry prefixed with its issuing source, MPDs suffixed
  with hazard type:
  ```
  SPC MD 0123 in effect.
  WPC MPD 0456 — Heavy Rain in effect.
  ```
  Single loop, single colour. Chosen to match Phase 19 RPT-04's eventual single band below the
  day blocks, so Phase 19 relocates one block instead of merging two. Source prefix carries
  meaning that a bare number cannot; colour alone was rejected as unreadable at mirror distance
  and inaccessible to colour-blind viewers.

- **D-06:** If MPD-03's description-CDATA parse yields **no hazard type** for an MPD the user is
  inside, render the MPD **without** the hazard type and log the parse miss. Never drop it —
  the user is inside an active precipitation discussion, and omitting it is the same
  false-negative class as WR-06. Degrades to exactly today's MD behaviour.

- **D-07:** **No cap** on the advisory band; render every concurrently active MPD per MPD-02.
  Polygon containment already bounds the realistic count. No silent truncation.

### WSSI presentation

- **D-08:** WSSI impact colours come from **WPC's own published renderer** (the WSSI layer's
  MapServer legend / `drawingInfo`), with the **source URL recorded in the registry row**.
  Users see the same colours as WPC's public WSSI map, and the citation closes 14-REVIEW.md
  IN-01's complaint ("ERO tier colours reuse the SPC severe-thunderstorm palette with no cited
  source") for this product rather than repeating the pattern. Researcher confirms exact values.

- **D-09:** **Limited and above renders a row.** `None` and no-polygon render nothing, matching
  the ERO-03 precedent that absence is silence — not an empty row, not a "None" row. Limited is
  a genuine WPC-issued impact level; suppressing it would hide a real active forecast.

### Verification approach

- **D-10:** Phase 15 is verified by **probe scenarios plus live MPD UAT**, not by live WSSI UAT.
  Extend the probe suite (now 15 scenarios, all mutation-proven) with WSSI fixtures covering:
  each impact level, the ALL-CAPS vs mixed-case mismatch (WSSI-02), and the zero-feature
  out-of-season path (WSSI-03). Every new scenario must be mutation-proven load-bearing — break
  the line it covers, confirm RED, restore — per the standard set in 14-REVIEW-FIX.md.
  Verify MPD against live data if any fire during the phase.
  **Live WSSI confirmation carries forward as a deferred in-season item**, following the
  existing v1.1 fire-weather precedent already recorded in STATE.md Deferred Items.

### Claude's Discretion

- **MPD-04 tie-break** (numbering resets at the year boundary, so "highest number" stops meaning
  "most recent"). This gray area was offered and not selected. Guidance, not a locked decision:
  if the feed publishes an active index (as SPC's `ActiveMD.kmz` does), MPD-04 is largely moot —
  prefer trusting the index over number-sorting. Where validity genuinely cannot be established,
  the project's no-false-negatives core value favours showing over hiding. Researcher should
  establish what WPC actually publishes before planning locks this.
- WSSI-02 case normalisation mechanism (where and how the ALL-CAPS fold happens).
- Exact row label wording for WSSI rows (e.g. "Winter Impact (Day 1): Moderate").
- Where the `kind` dispatch physically lives, and whether it is a switch, a per-kind handler
  map, or per-row function references.
- Whether the retired `md` socket element leaves a compatibility shim or is removed outright.

</decisions>

<specifics>
## Specific Ideas

- On migrating SPC MDs into the registry: *"IF we are onboard MPD this way, might as well migrate
  SPC MDs into the register."* — the driver for D-02. The user's reasoning matches the
  independent WR-06 evidence: two near-identical advisory paths are how a fix lands on one
  product and not the other.
- Deployment reality that shapes severity throughout: **one module instance, one fixed
  location.** This is why Phase 14's round-2 CR-01/CR-02 are DEFERRED-BY-OWNER. Any Phase 15
  design that would only break under multiple instances or multiple locations is correspondingly
  low priority — but must not make the deferred defects *worse* or harder to fix later.

</specifics>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

ROADMAP.md declares no `Canonical refs:` line for Phase 15; the list below was assembled during
discussion and codebase scouting.

### Phase scope and requirements
- `.planning/ROADMAP.md` § "Phase 15: WPC Winter Storm Severity & Mesoscale Precipitation
  Discussion" — goal, 5 success criteria, dependencies
- `.planning/REQUIREMENTS.md` — WSSI-01/02/03 (lines ~17-19), MPD-01/02/03/04 (lines ~23-26)
- `.planning/ROADMAP.md` § "Phase 19" RPT-04 — commits advisories to a separate band **below**
  the day blocks; constrains D-05's layout choice
- `.planning/ROADMAP.md` § "Phase 18" RPT-07 — names the `days`/`summary`/`sources`/`advisories`
  payload that D-03 borrows the `advisories` key from

### Locked prior decisions (do not re-litigate)
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-CONTEXT.md` — D-01 through
  D-09. Especially **D-05** (toggle off still emits a full zero-valued block), **D-06** (nested
  `products` object on the wire), **D-07** (registry row per product with its own label→value
  map, satisfying DATA-03), **D-08** (scope limit on migrating existing code), **D-09**
  (`buildArcGisQuery`, `f=geojson` hardcoded and non-overridable)

### Defect history that shapes this phase
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW.md` — **WR-06** is the
  direct evidence for D-02; **IN-01** (uncited ERO palette) motivates D-08; **IN-02** (unused
  `dayNValidTime`) is context for Phase 18
- `.planning/phases/14-foundation-wpc-excessive-rainfall-outlook/14-REVIEW-FIX.md` — the CR-03
  sequence contract and the mutation-proof standard D-10 requires
- `.planning/STATE.md` § Blockers/Concerns — the in-season verification constraint behind D-10,
  and the two DEFERRED-BY-OWNER Phase 14 defects

### Code
- `productRegistry.js` — the table D-01 widens; current ERO row is the template
- `node_helper.js` — `getMesoscaleDiscussion` (~:439), `fetchBinBuffer` (~:184),
  `kmlToGeoJson` (~:217), `checkInPolygon` (~:1565), `MD_HOST_PREFIX` (:40),
  `_inFlight`/`_seq` (~:53-56, :93-97, :157-160)
- `MMM-SPCOutlook.js` — advisory render block (~:210-214), `socketNotificationReceived` (~:74)
- `scripts/probe-payload-resilience.js` + `scripts/probe-lib/module-stubs.js` — the 15-scenario
  suite D-10 extends
- `.planning/codebase/CONVENTIONS.md`, `.planning/codebase/ARCHITECTURE.md` — house style

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **The whole KMZ advisory pipeline already exists** and was hardened days ago:
  `fetchBinBuffer` → `extractKmlFromKmz` → `kmlToGeoJson` → `checkInPolygon`, plus the
  `MD_HOST_PREFIX` allowlist and per-MD failure containment. WPC MPDs are the same kind of
  product, so D-02's migration is a like-for-like move, not a rewrite.
- `checkInPolygon` now returns **the containing feature** (not `features[0]`) after the CR-02
  fix — exactly the discipline `_validTimeOfWinner` applies for ERO. MPD inherits it free.
- `PRODUCT_REGISTRY.excessiveRain` is a working template for a day-indexed row: `dayLayers`,
  `days`, per-product label→value maps (`eroDnToValue`, `eroValueToTier`, `eroTierToText`,
  `eroTierToColor`). WSSI's row mirrors this with `days: 3`.
- `buildArcGisQuery` — host allowlist + non-negative-integer layer guard already in place.
- The probe harness gained a `_fetch(url, options)` seam (WR-09 fix) that makes the real
  `fetchGeoJsonCached` path — `rejectBody`, the 304 guard, `parseBody`, `_isWithinStaleWindow` —
  drivable offline. New WSSI/MPD scenarios should use it rather than stubbing wholesale.

### Established Patterns
- Absence is silence: outside every polygon produces **no row** — not blank, not "None"
  (ERO-03). D-09 extends this to WSSI.
- Remote strings reaching `innerHTML` are escaped via `escapeHtml` (advisory names are unbounded
  remote KML text). MPD hazard strings are equally remote and must be escaped.
- Per-item containment: one bad item must never discard its siblings (the CR-02 lesson).
- `redirect: "error"` and a 15s abort timeout apply to every fetch, `fetchBinBuffer` included.

### Integration Points
- **`socketNotificationReceived` payload indices — MIGRATION HAZARD.** CR-03 made the socket
  `[outlook, md, seq]` with `seq` at index **2**. Retiring `md` per D-03 moves `seq` to index
  **1**. The frontend's recency guard and the `this.mds` assignment must change **together**, or
  the guard reads a payload object where it expects a number and silently stops discarding
  late payloads. Plans must treat this as one atomic change.
- `getDom`'s no-risk short-circuit (`MMM-SPCOutlook.js:161`) is now gated on `!this.spcrisk._stale`
  (the CR-01 fix). New WSSI/advisory values participate in the risk test that decides that
  branch — adding a product means auditing that condition, and the
  `frontend-total-outage-still-shows-the-outage` probe scenario guards it.
- `_unusableFeatureCount` and `_oldestStaleAt` are helper-globals sampled per run, safe only
  while CR-03's `_inFlight` guard holds. Phase 15 must not introduce a second concurrent chain.

</code_context>

<deferred>
## Deferred Ideas

- **Backfill ERO's palette citation (IN-01).** Offered as part of D-08 and not taken — resolving
  ERO's uncited colours stays an open Info finding rather than being bundled into this phase.
- **Migrating fire-weather and SPC categorical/probabilistic layers into the registry.** Offered
  and declined; D-08's scope limit holds. Natural candidate for Phase 19, which already touches
  this rendering path.
- **Per-product staleness UX** (e.g. "⚠ MPD unavailable" instead of one global badge) — would
  reopen Phase 14's D-04 a phase early. Revisit no earlier than Phase 18.
- **Collapsing a long advisory band** ("+3 more in effect") — declined per D-07; Phase 19's
  RPT-02/RPT-03 compact-vs-detail toggle is the right home if it's ever wanted.
- **Live in-season WSSI verification** — deferred by D-10, following the v1.1 fire-weather
  precedent. Must be recorded in STATE.md Deferred Items at phase close.

</deferred>

---

*Phase: 15-wpc-winter-storm-severity-mesoscale-precipitation-discussion*
*Context gathered: 2026-08-23*
