# Phase 14: Foundation & WPC Excessive Rainfall Outlook - Context

**Gathered:** 2026-08-16 (payload decoupling) / 2026-08-17 (config toggles)
**Status:** Ready for planning

<domain>
## Phase Boundary

Decouple the backend payload shape from the `extended` flag, establish the per-product toggle / fetch / cache / vocabulary conventions that Phases 15–17 reuse, and ship the WPC Excessive Rainfall Outlook for Days 1–5.

Requirements in scope: CFG-01, CFG-02, DATA-01, PERF-02, ERO-01, ERO-02, ERO-03.

Not in scope: any other WPC/CPC product (Phases 15–17), cross-source merge or precedence logic (Phase 18), the `getDom()` unified day report rewrite (Phase 19). ERO's data is added to the existing display shape — the display restructure is Phase 19's job.

</domain>

<decisions>
## Implementation Decisions

### Payload decoupling shape

- **D-01:** `extended` gates **fetching only**. The payload always carries `day4`–`day8` and `day48Risk` keys; when `extended: false` those keys hold zero/no-risk values and Days 4–8 are not fetched. The frontend keeps using `config.extended` to decide rendering. This is the concrete satisfaction of CFG-02 — the payload shape no longer forks on `extended`.
- **D-02:** ERO data sits as a sibling block mirroring `fireWeather`: `excessiveRain: { day1Risk, day1Text, … day5Risk, day5Text }`. Do **not** pre-emptively adopt Phase 18's `days`/`summary`/`sources` structure — Phase 18 migrates this block.
- **D-03:** Carry the raw `valid_time` string per day into the payload even though nothing displays it, so Phase 18's MERGE-01 inherits real captured window data rather than re-deriving ERO Day 1's partial 01Z–12Z window from documentation.
- **D-04:** ERO fetch results roll into the existing global `anyStale` flag exactly like SPC layers. Per-row / per-product staleness UX is out of scope for this phase.

### Config toggle convention

- **D-05:** A product toggle being off never changes the payload shape. When `showExcessiveRain: false`, the payload still carries the full `excessiveRain` block populated with zero/no-risk values — the same rule as D-01, extended from `extended` to all six product flags. One payload shape regardless of configuration; the frontend gates rendering on the flag. Phase 18's merge logic must never null-check for a missing product key.
- **D-06:** User-facing config stays flat booleans per CFG-01 (`showExcessiveRain: true`, each new product flag defaulting to `false`). The **socket payload** groups them into a nested `products: { … }` object rather than adding six more top-level fields to the `GET_SPC_DATA` notification. This keeps the wire contract from growing to 11+ flat fields and gives Phase 17's `Promise.all` parallelization a single list to iterate.
- **D-07:** New products are defined in a **product registry table** — one row per product carrying: product id, its config flag, URL builder, parser function, and its own label→value map. ERO is row one; Phases 15–17 add rows. The per-row label map is the structural mechanism that satisfies DATA-03 (no vocabulary reuse across products) and prevents ERO's `dn` domain from being fed through the fire weather `DN` table (ERO-02).
- **D-08:** The registry covers **new WPC/CPC products only**. Existing SPC and fire-weather URL constants and mappings are left untouched this phase — migrating working v1.x code into the registry would stack regression risk onto the foundation phase, and Phase 19 already carries the milestone's display-rewrite risk.
- **D-09:** All ArcGIS URLs are built by a single shared `buildArcGisQuery(layer, opts)` helper with a **fixed parameter order** and `f=geojson` **hardcoded and non-overridable** — callers cannot inject or override params. This makes DATA-01 structurally unsatisfiable to violate (no code path can emit `f=json`) and makes PERF-02 hold by construction: the query string is byte-identical on every poll, so the existing ETag/SHA256 cache hits instead of re-running turf on unchanged data.

### Claude's Discretion

Two items were surfaced and explicitly left to planning/implementation judgment:

- Where toggle defaults are defensively applied — frontend `defaults:` block only, or also node_helper-side fallbacks in the style of today's `_updateInterval` / `_proximityWeighting` handling (`node_helper.js:34–43`).
- Whether a product that is toggled off is excluded from the `anyStale` roll-up. D-04 establishes that ERO *when fetched* feeds `anyStale`; a disabled product is not fetched, so the natural reading is that it contributes nothing — confirm this rather than letting a never-fetched product register as stale.

Also at Claude's discretion: the registry's exact shape (object map vs array of descriptors), the ERO tier→color mapping values, and where the registry module physically lives.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Milestone requirements and scope
- `.planning/REQUIREMENTS.md` — v2.0 requirement definitions; Phase 14 owns CFG-01, CFG-02, DATA-01, PERF-02, ERO-01, ERO-02, ERO-03. Also carries the "Out of Scope" table, which explains *why* several tempting additions are excluded.
- `.planning/ROADMAP.md` §"Phase 14" — goal statement and the five success criteria this phase is verified against.
- `.planning/PROJECT.md` — project vision, key decisions table, and the core value statement ("no false negatives, no unnecessary CPU burn on the RPi") that the caching decisions serve.

### v2.0 research (produced during milestone scoping)
- `.planning/research/PITFALLS.md` — **critical.** Documents the per-product traps this milestone's requirements were written against, including the ERO `dn` vs fire weather `DN` vocabulary collision behind ERO-02/DATA-03.
- `.planning/research/SUMMARY.md` — consolidated research findings and the sequencing rationale for Phases 14–19.
- `.planning/research/STACK.md` — endpoint/service inventory for the WPC and CPC products, including ArcGIS query conventions relevant to D-09.
- `.planning/research/ARCHITECTURE.md` — proposed structure for the multi-source backend.
- `.planning/research/FEATURES.md` — per-product feature breakdown.

### Existing codebase maps
- `.planning/codebase/CONVENTIONS.md` — naming, error handling, and logging conventions the new registry and builder must match.
- `.planning/codebase/ARCHITECTURE.md` — current backend structure.
- `.planning/codebase/INTEGRATIONS.md` — external integration inventory. **Note:** dated 2026-03-04 and stale on caching — it states "no caching detected", but v1.2 shipped ETag/SHA256 caching (`node_helper.js:256–318`). Trust the code over this doc.
- `.planning/codebase/CONCERNS.md` — known code-quality concerns (implicit globals, oversized `getSpcOutlook`) that constrain how much refactoring belongs in this phase.

### No external specs or ADRs
This project keeps no `docs/decisions/` or `docs/features/` tree — requirements live entirely in `.planning/`. Everything downstream agents need is listed above.

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- **`fetchGeoJson` with ETag/hash caching** (`node_helper.js:256–318`): already implements conditional requests (`If-None-Match`), 304 handling, SHA256 fallback for ETag-less endpoints, and a stale-window check. ERO reuses this as-is — D-09's byte-stable query string is precisely what makes its URL-keyed cache effective.
- **`fireWeather` payload block**: the structural template D-02 mirrors for `excessiveRain`.
- **`_isWithinStaleWindow` / `anyStale` plumbing**: the staleness mechanism D-04 hooks ERO into.
- **`evaluatePolygons` / `checkInPolygon` + turf point-in-polygon**: the existing location-vs-polygon evaluation path ERO's tier lookup follows.

### Established Patterns
- **Explicitly enumerated socket contract**: `MMM-SPCOutlook.js:14` sends `{ lat, lon, extended, updateInterval, proximityWeighting }`; `node_helper.js:33` destructures the identical list. D-06 extends this contract with one nested `products` key rather than six flat ones.
- **Static URL constants**: SPC endpoints are literal `.lyr.geojson` strings (`node_helper.js:456–481`). ERO is different in kind — an ArcGIS query endpoint — which is why D-09 introduces a builder rather than another literal.
- **Defensive backend defaults**: node_helper re-defaults `_updateInterval` and `_proximityWeighting` on receipt (`node_helper.js:34–43`) rather than trusting the frontend. Whether to mirror this for product flags is flagged under Claude's Discretion.
- **No automated tests**: verification is manual UAT plus static analysis (`workflow.nyquist_validation` disabled). Plans should assume UAT-based verification.
- **Vanilla JS, 2-space indent, no formatter, `Log.info`/`Log.error` with a `MMM-SPCOutlook` prefix.**

### Integration Points
- `MMM-SPCOutlook.js:2–8` — `defaults:` block gains the six `show*` booleans, all defaulting to `false` (CFG-01).
- `MMM-SPCOutlook.js:14,16` — both the startup and `setInterval` `sendSocketNotification` calls must carry the new `products` object.
- `node_helper.js:33` — destructuring site for the new `products` key.
- `node_helper.js:45` — `getSpcOutlook(lat, lon, extended)` call site; the new product fetches attach around this (Phase 17 parallelizes them).
- `MMM-SPCOutlook.js:95–113` — the combinatorial "No Severe Weather Risk" gate. ERO rows must participate in this predicate, or a location with only an ERO risk renders the no-risk message. This gate is also RPT-06's regression target in Phase 19.
- `MMM-SPCOutlook.js:172–192` — the `fireWeather` render block, the display analog ERO rows sit alongside this phase.

</code_context>

<specifics>
## Specific Ideas

- Both toggle-shape decisions (D-01, D-05) resolve the same way on purpose: **one payload shape, always**. The recurring theme across this discussion is that config flags gate *fetching and rendering*, never payload structure. Downstream phases should treat any proposal to fork the payload on a config flag as a regression against CFG-02.
- The preference throughout was for structural enforcement over convention: a non-overridable `f=geojson` (D-09) and a per-product label map owned by the registry row (D-07), rather than rules that reviewers have to remember to check.
- Regression risk is deliberately kept out of the foundation phase (D-08) — the milestone already concentrates its highest risk in Phase 19's `getDom()` rewrite.

</specifics>

<deferred>
## Deferred Ideas

- **Migrating existing SPC / fire-weather endpoints and mappings into the product registry** — deliberately declined for this phase (D-08). A reasonable v2.x cleanup once Phase 19's rewrite has settled; not currently in the backlog.
- Per-product / per-row staleness UX — out of scope per D-04; `anyStale` stays global this milestone.
- Everything already recorded in `.planning/REQUIREMENTS.md` §"Future Requirements" (WSSIX-01, MERGEX-01/02, COVX-01) and §"Out of Scope" remains deferred; nothing in this discussion changed those.

</deferred>

---

*Phase: 14-foundation-wpc-excessive-rainfall-outlook*
*Context gathered: 2026-08-17*
