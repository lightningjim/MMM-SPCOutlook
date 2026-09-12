# Phase 14: Foundation & WPC Excessive Rainfall Outlook - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-08-16 (session 1) / 2026-08-17 (session 2, resumed from checkpoint)
**Phase:** 14-foundation-wpc-excessive-rainfall-outlook
**Areas discussed:** Payload decoupling shape, Config toggle convention

---

## Payload decoupling shape

*Discussed 2026-08-16; session was interrupted after this area and resumed from `14-DISCUSS-CHECKPOINT.json` on 2026-08-17.*

### Q1 — After the payload stops forking, what should the `extended` flag still control?

| Option | Selected |
|--------|----------|
| Gates fetching only — payload always carries day4–day8 + day48Risk keys with zero/no-risk values when `extended: false`; Days 4–8 not fetched; frontend keeps using `config.extended` to decide rendering | ✓ |
| Gates nothing in the backend | |
| Retire `extended` entirely | |

**User's choice:** Gates fetching only.

### Q2 — How should ERO's data sit in the payload, given Phase 18 will restructure into days/summary/sources?

| Option | Selected |
|--------|----------|
| Mirror the fireWeather block — `excessiveRain: { day1Risk, day1Text, … day5Risk, day5Text }` as a sibling block; Phase 18 migrates it | ✓ |
| New products go day-keyed from the start | |
| Full `days{}` collapse now | |

**User's choice:** Mirror the fireWeather block.

### Q3 — What should Phase 14 do about ERO Day 1's partial 01Z–12Z valid window vs SPC's 12Z–12Z?

| Option | Selected |
|--------|----------|
| Carry raw `valid_time` string per day into the payload (unused by display) so Phase 18's MERGE-01 inherits real captured window data | ✓ |
| Ignore it entirely this phase | |
| Annotate the row now | |

**User's choice:** Carry `valid_time` into payload.

### Q4 — Should ERO feed the existing global `anyStale` flag?

| Option | Selected |
|--------|----------|
| Yes — ERO fetch results roll into `anyStale` exactly like SPC layers; per-row staleness UX stays out of scope | ✓ |
| No, keep `anyStale` SPC-only | |

**User's choice:** Yes, ERO feeds `anyStale`.

---

## Config toggle convention

*Discussed 2026-08-17.*

### Q5 — When a product toggle is off, what should the payload do with that product's block?

| Option | Description | Selected |
|--------|-------------|----------|
| Always carry the block (Recommended) | Payload always includes `excessiveRain` with zero/no-risk values when disabled — mirrors the `extended` decision. One shape regardless of config; frontend gates rendering. Phase 18 never null-checks for missing product keys. | ✓ |
| Omit the key entirely | Smaller payload, but shape now forks on 6 toggles instead of 1 — reintroduces the class of problem CFG-02 exists to kill. | |
| Carry the key as null | Shape stable, but consumers still branch on null, and "no risk" vs "not fetched" become indistinguishable. | |

**User's choice:** Always carry the block.
**Notes:** Resolves identically to the `extended` decision (D-01) by design — config gates fetching and rendering, never payload structure.

### Q6 — How should the six new product toggles travel from frontend config to `node_helper`?

| Option | Description | Selected |
|--------|-------------|----------|
| Nested `products` object (Recommended) | User config stays flat booleans per CFG-01; socket payload carries `products: { … }`. Keeps the wire payload from growing to 11+ flat fields; gives Phase 17's `Promise.all` a single list to iterate. | ✓ |
| Flat fields, enumerated | Matches current convention (`MMM-SPCOutlook.js:14`) exactly; costs a 6-field addition now and another edit per future product. | |
| Send whole `this.config` | Zero plumbing per toggle, but node_helper loses its explicit consumption contract. | |

**User's choice:** Nested `products` object.

### Q7 — How should new product definitions (config flag → endpoint → parser → label vocabulary) be organized?

| Option | Description | Selected |
|--------|-------------|----------|
| Registry, new products only (Recommended) | Registry table with per-row product id, config flag, URL builder, parser, and its own label→value map (satisfying DATA-03). ERO is row one; Phases 15–17 add rows. Existing SPC/fire-weather code untouched. | ✓ |
| Registry + migrate SPC now | Cleaner end state, but rewrites working v1.x code before Phase 19's display rewrite — stacks regression risk into the foundation phase. | |
| Inline consts per product | Least new abstraction; each of Phases 15–17 then re-derives its own conventions, which CFG-01/DATA-03 exist to prevent. | |

**User's choice:** Registry, new products only.

### Q8 — How should ArcGIS URLs be built, given DATA-01 (`f=geojson`, no fallback) and PERF-02 (byte-stable query string)?

| Option | Description | Selected |
|--------|-------------|----------|
| Shared builder, params locked (Recommended) | One `buildArcGisQuery(layer, opts)`: fixed param order, `f=geojson` hardcoded and non-overridable, no caller param injection. Identical string every poll by construction; no code path can emit `f=json`. | ✓ |
| Shared builder with overrides | More flexible for Phases 15–17's differing services; every override risks key-order drift multiplying cache keys. | |
| Full URL constants per product | Matches existing SPC const style; duplicates the boilerplate 6 times with no single enforcement point. | |

**User's choice:** Shared builder, params locked.

### Continuation check

Offered two follow-ups (where toggle defaults are defensively applied; whether a disabled product is excluded from the `anyStale` roll-up). User chose **"Next — write context"**, leaving both to Claude's discretion during planning.

---

## Claude's Discretion

- Where toggle defaults are defensively applied — frontend `defaults:` only vs node_helper-side fallbacks in the style of `_updateInterval` / `_proximityWeighting` (`node_helper.js:34–43`).
- Whether a toggled-off product is excluded from the `anyStale` roll-up.
- Registry's exact shape (object map vs array of descriptors), ERO tier→color mapping values, and the registry module's physical location.

## Deferred Ideas

- Migrating existing SPC / fire-weather endpoints and mappings into the product registry — declined for this phase; possible v2.x cleanup after Phase 19 settles.
- Per-product / per-row staleness UX — `anyStale` stays global this milestone.

## Notes

- No pending todos matched Phase 14 (`todo.match-phase` returned 0).
- No spikes or sketches pending.
- No prior-phase CONTEXT.md files exist — Phase 14 is the first phase of v2.0 and prior milestone phases are archived.
- `.planning/codebase/INTEGRATIONS.md` was found stale on caching (dated 2026-03-04, predates v1.2's ETag/SHA256 cache). Noted in CONTEXT.md canonical refs rather than silently trusted.
