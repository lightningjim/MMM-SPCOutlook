# DATA-03 Recorded Spot Check

D-11 (`.planning/phases/17-nws-wpc-heatrisk-parallelized-fetching/17-CONTEXT.md`) requires this
recorded spot check ALONGSIDE `productRegistry.js`'s load-time `assertNoSharedRegistryMaps`
assertion — "assertion alone" was explicitly rejected as overstating its own coverage, because
object-identity checks cannot see a closure that reads a *foreign* constant by name rather than
sharing an object by reference. This document is that paired artifact. It is self-contained: no
reader needs to open a plan SUMMARY to audit this phase's DATA-03 claim.

Every table below and every file:line citation was re-derived by reading the CURRENT source
(`productRegistry.js`, `node_helper.js`, `MMM-SPCOutlook.js`) during this plan's execution
(2026-09-01), not copied from `17-PATTERNS.md`, which was written before this phase's own edits
(the HeatRisk row, the D-11 assertion) landed.

## 1. Every label-to-value / tier / text / colour map, enumerated

| # | Product | Table | File:line | Shape |
|---|---|---|---|---|
| 1 | ERO (excessiveRain) | `eroDnToValue` | `productRegistry.js:85` | `{ 1: 1, 2: 2, 3: 3, 4: 4 }` — ERO's own lowercase `dn` field |
| 2 | ERO | `eroValueToTier` | `productRegistry.js:87` | `{ 0: "NONE", 1: "MRGL", 2: "SLGT", 3: "MDT", 4: "HIGH" }` |
| 3 | ERO | `eroTierToText` | `productRegistry.js:88` | `{ NONE: "None", MRGL: "Marginal", SLGT: "Slight", MDT: "Moderate", HIGH: "High" }` |
| 4 | ERO | `eroTierToColor` | `productRegistry.js:92` | `{ NONE: "afddf6", MRGL: "7ac687", SLGT: "f7f690", MDT: "eb7e82", HIGH: "ff81f8" }` |
| 5 | WSSI (winterImpact) | `wssiRawToValue` | `productRegistry.js:103` | `{ "WINTER WEATHER AREA": 1, MINOR: 2, MODERATE: 3, MAJOR: 4, EXTREME: 5 }` |
| 6 | WSSI | `wssiValueToTier` | `productRegistry.js:105` | `{ 0: "NONE", 1: "WWA", 2: "MINOR", 3: "MODERATE", 4: "MAJOR", 5: "EXTREME" }` |
| 7 | WSSI | `wssiTierToText` | `productRegistry.js:106-109` | `{ NONE: "None", WWA: "Winter Weather Area", MINOR: "Minor", MODERATE: "Moderate", MAJOR: "Major", EXTREME: "Extreme" }` |
| 8 | WSSI | `wssiTierToColor` | `productRegistry.js:114-117` | `{ NONE: "afddf6", WWA: "d2dfe7", MINOR: "faf5a3", MODERATE: "f7962f", MAJOR: "e61f26", EXTREME: "7853a1" }` |
| 9 | Fire weather (Days 1-2/3-8) | `fireRiskToValue` | `node_helper.js:3096` | `{ ELEV: 1, CRIT: 2, EXTM: 3 }` — function-local, recreated per call, pre-registry (Phase 3/9) |
| 10 | Fire weather | `dnToFireValue` | `node_helper.js:3100` | `{ 5: 1, 8: 2, 10: 3 }` — fire weather's own UPPERCASE `DN` field, function-local, pre-registry |
| 11 | Fire weather | `fireRiskToColor` | `MMM-SPCOutlook.js:176` | `{ 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" }` — function-local, pre-registry |
| 12 | SPC categorical (Day 1-8) | `valueToRisk` | `node_helper.js:36-38` | `{ 1: "TSTM", 2: "MRGL", 3: "SLGT", 4: "ENH", 5: "MDT", 6: "HIGH" }` — module-level, pre-registry |
| 13 | SPC categorical | `valueToFullRisk` | `node_helper.js:33-35` | `{ NONE: "None", TSTM: "General Thunderstorms", MRGL: "Marginal", SLGT: "Slight", ENH: "Enhanced", MDT: "Moderate", HIGH: "High" }` — module-level, pre-registry |
| 14 | SPC categorical | `riskToValue` | `node_helper.js:2809-2811` | `{ TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6 }` — function-local, recreated per call |
| 15 | SPC categorical | `riskToColor` | `node_helper.js:2815-2817` | `{ NONE: "afddf6", TSTM: "d2ffa6", MRGL: "7ac687", SLGT: "f7f690", ENH: "e9c188", MDT: "eb7e82", HIGH: "ff81f8" }` — function-local |
| 16 | Hazards Outlook | `hazardsExcludedLabels` / `hazardsExcludedLabelKeys` | `productRegistry.js:178`, `:188` | `["Flooding Likely", "Flooding Occurring or Imminent", "Flooding Possible"]` and its folded-key `Set` |
| 17 | Hazards Outlook | `hazardsDroughtLabels` / `hazardsDroughtLabelKeys` | `productRegistry.js:183`, `:189` | `["Severe Drought", "Rapid Onset Drought Risk"]` and its folded-key `Set` |
| 18 | Hazards Outlook | `hazardsOrder` | `productRegistry.js:195-198` | ordered array, not a value map — "labels absent from this list sort AFTER every listed label" |
| 19 | Hazards Outlook | `hazardsDisplayColor` | `productRegistry.js:216-223` | 15-entry `{ label: hex }` map — no severity ladder anywhere in this row's schema (Pitfall 1) |
| 20 | MPD / spcMD (`kml-advisory` rows) | **none** | `productRegistry.js:386-390` (spcMD `toEntry`), `:405-410` (mpd `toEntry`) | Each `toEntry(feature, ctx)` composes a `{ label, hazardType }` pair directly from the feature/ctx — no numeric ladder, no value/tier/text/colour map of any kind. **Confirmed exempt from `MAP_FIELDS` by construction**, not by oversight. |
| 21 | **HeatRisk (new, this phase)** | `heatRisk.valueToText` | `productRegistry.js:505` | `{ 0: "Little to No Risk", 1: "Minor", 2: "Moderate", 3: "Major", 4: "Extreme" }` — module-authored text keyed by the raw 0-4 category the service returns directly |
| 22 | HeatRisk | `heatRisk.valueToColor` | `productRegistry.js:511` | `{ 0: "e8f9e7", 1: "f4f257", 2: "f69632", 3: "e22f33", 4: "7a0e7f" }` — palette decoded from the ImageServer's own `/legend?f=json` swatches, cross-confirmed against its `/?f=json` serviceDescription HTML (both live-retrieved 2026-09-01, per 17-01-SUMMARY.md) |

Rows 1-8, 16-22 (11 rows across 5 products: ERO, WSSI, Hazards Outlook, spcMD/mpd-exempt, HeatRisk)
live inside `PRODUCT_REGISTRY` and are within `assertNoSharedRegistryMaps`'s reach. Rows 9-15 (SPC
categorical and fire weather, 7 tables across 2 products) predate the registry (Phases 1-10) and
live as constants inside `node_helper.js`/`MMM-SPCOutlook.js` directly — **outside `PRODUCT_REGISTRY`
and outside D-11's identity assertion entirely**. This is a deliberate, documented scope boundary
(`productRegistry.js:4-7`: "This file covers new WPC/CPC products only. It does not move,
reference, or refactor the existing SPC URL constants, riskToValue, fireRiskToValue, or
dnToFireValue defined in node_helper.js (D-08)"), not a phase-17 gap — but it is a genuine second
blind spot beyond the one D-11's own comment names, and is recorded honestly in Section 3 below
rather than left implicit.

## 2. No two rows share a map object by reference

**Mechanical proof:** `assertNoSharedRegistryMaps(PRODUCT_REGISTRY)` runs at module load
(`productRegistry.js:558`) and walks every row's `MAP_FIELDS` entries (Section 4), recording
object identity in a `Map` and throwing — naming both offending row ids and the field — on any
collision. Live-verified at this plan's execution:

```
$ node -e "require('./productRegistry')"
$ echo $?
0
$ node -e "const {PRODUCT_REGISTRY, assertNoSharedRegistryMaps} = require('./productRegistry'); assertNoSharedRegistryMaps(PRODUCT_REGISTRY);"
$ echo $?
0
```

No throw on either invocation — every one of the 11 registry-scoped map objects in Section 1
(rows 1-8, 16-22, minus spcMD/mpd which contribute none) is a distinct object reference. This
covers the mechanical half of DATA-03 for the six `PRODUCT_REGISTRY` rows: `excessiveRain`,
`winterImpact`, `spcMD`, `mpd`, `hazardsOutlook`, `heatRisk`.

**Per-product statement:**
- **excessiveRain**: `toValue`, `valueToTier`, `tierToText`, `tierToColor` are all objects unique
  to this row — confirmed by the identity assertion's clean pass.
- **winterImpact**: same four field kinds, all unique — confirmed.
- **spcMD / mpd**: contribute zero fields to the identity check by construction (no ladder).
- **hazardsOutlook**: `excludedLabels`, `droughtLabels`, `excludedLabelKeys`, `droughtLabelKeys`,
  `displayColor`, `toValue` are all unique — confirmed.
- **heatRisk**: `valueToText`, `valueToColor` are both freshly-authored object literals declared
  inline in this row (`productRegistry.js:505`, `:511`) — confirmed unique, and structurally
  cannot collide with any prior row's table since they were never assigned from an existing
  constant.

The pre-registry SPC-categorical/fire-weather tables (Section 1, rows 9-15) are **not** covered
by this mechanical proof — see Section 3's second finding.

## 3. Blind-spot analysis — what identity CANNOT see

### 3a. The blind spot D-11's own comment names: a closure reading a foreign constant by name

`assertNoSharedRegistryMaps`'s own comment (`productRegistry.js:530-536`) states this precisely:
*"a `toValue`/`includesFeat` closure that reads a foreign constant directly... would pass this
check while still being wrong — this is a point-in-time structural check on object identity, not
a data-flow analysis."* This section is the closure-by-closure read that check cannot perform
mechanically.

**Every `toValue` closure walked, confirmed by direct read to reference only its own table:**

| Row | Closure | File:line | What it reads | Confirmed distinct from |
|---|---|---|---|---|
| excessiveRain | `toValue: (label, f) => eroDnToValue[f.properties.dn] \|\| 0` | `productRegistry.js:314` | lowercase `f.properties.dn`, indexes ONLY the module-local `eroDnToValue` (`:85`) | No reference to `dnToFireValue` (fire weather's table) anywhere in this closure body |
| winterImpact | `toValue: (label, f) => { const raw = f.properties.impact; const folded = ...toUpperCase(); return wssiRawToValue[folded] \|\| 0; }` | `productRegistry.js:340-344` | `f.properties.impact`, indexes ONLY `wssiRawToValue` (`:103`) | No reference to any other row's table |
| hazardsOutlook | `toValue: (label, f) => normalizeHazardLabel(f && f.properties && f.properties.label)` | `productRegistry.js:453` | `f.properties.label` (lowercase, HAZ-03's own trap), returns a normalized STRING | Deliberately has NO numeric ladder anywhere in its own schema (Pitfall 1) — there is no table for this closure to misreference in the first place, and no `valueToTier` exists on this row for a foreign closure to target either |
| heatRisk | **none declared** | `productRegistry.js:515-518` (comment states this explicitly) | n/a | HeatRisk has no `toValue`/`includesFeat` at all — its "value" is the raw 0-4 category straight off the service, so there is nothing here to check |
| Fire weather (Day 1-2 / 3-8, pre-registry) | `(label, f) => dnToFireValue[f.properties.DN] \|\| 0` | `node_helper.js:3172`, `:3184` | UPPERCASE `f.properties.DN`, indexes ONLY the function-local `dnToFireValue` (`:3100`) | Confirmed by direct read to never reference `eroDnToValue` — the two closures are textually adjacent to their OWN tables' declarations in both cases, not to each other's |

**Special attention: the ERO `dn` / fire weather `DN` pair, per DATA-03's own wording.** ERO's
`eroDnToValue` (`productRegistry.js:85`, keys `{1,2,3,4}`) and fire weather's `dnToFireValue`
(`node_helper.js:3100`, keys `{5,8,10}`) are the exact pair DATA-03's own requirement text names
as the canonical failure shape ("ERO's `dn` is never fed through the fire weather `DN` table").
Read directly this session: **the two closures are declared in different files, at different
scopes (one a registry-row arrow function closing over a module-level `const`, the other a
function-local closure inside `node_helper.js`'s Day 1-2/3-8 fire-weather evaluation), each
indexing only the constant declared in its own immediate lexical scope.** Their key sets do not
even numerically overlap (`{1,2,3,4}` vs `{5,8,10}`) in the current source, but key-set overlap
is not the property being guarded against — the risk DATA-03 names is a closure being written to
close over the WRONG table by name, which would silently produce a plausible-looking-but-wrong
1-4 severity value regardless of whether the key domains happen to overlap. Confirmed by reading
both closures directly: neither references the other's table identifier anywhere in its body.

### 3b. A second, genuine blind spot: pre-registry tables are entirely outside D-11's reach

Beyond the closure-reads-a-foreign-constant blind spot D-11's own comment already discloses, this
spot check surfaces a second, structurally distinct gap: **rows 9-15 in Section 1 (the SPC
categorical and fire-weather tables) are not `PRODUCT_REGISTRY` rows at all**, so
`assertNoSharedRegistryMaps` never iterates them — there is no mechanism, mechanical or otherwise,
protecting these seven tables from a future edit that accidentally aliases two of them. This is a
deliberate scope boundary stated at the top of `productRegistry.js` (lines 4-7: this file, and by
extension its load-time validators, "covers new WPC/CPC products only"), not an oversight this
phase introduced or is responsible for closing — but it means DATA-03's "no label-to-value mapping
reused between products" guarantee is enforced by the load-time assertion **only** for the six
`PRODUCT_REGISTRY` rows, not for the pre-registry SPC/fire-weather constants. Two mitigating facts,
confirmed by direct read: (1) `riskToValue`/`riskToColor`/`fireRiskToValue`/`dnToFireValue` are all
function-local `const` declarations, recreated fresh on every call — a hypothetical future bug that
assigned one row's local constant to another would be caught immediately by ordinary code review of
a single function body, not silently propagated across module lifetime the way a shared
module-level object reference would be; (2) none of the seven pre-registry tables have been touched
by any phase since v1.1 (Fire Wx Outlook Expansion) or v1.0 — this is disclosed as a scope boundary
worth carrying forward, not a live defect.

### 3c. HeatRisk introduces no label vocabulary — cannot be a DATA-03 violation source

HeatRisk's raw output is a numeric 0-4 category returned directly by the ImageServer identify call
— there is no upstream label string, tier code, or intermediate vocabulary for this product to
translate at all (`productRegistry.js:515-518`'s own comment states this explicitly: "Deliberately
NO toValue, includesFeat, valueToTier... HeatRisk has no label vocabulary at all"). It therefore
cannot itself be a source of the "one product's map fed through another's" failure DATA-03 names —
there is no map on the INPUT side to feed anywhere. Its OUTPUT-side maps (`valueToText`,
`valueToColor`, rows 21-22 above) are display-only translations of its own already-resolved 0-4
category, and ARE covered by `assertNoSharedRegistryMaps` like every other row's maps — confirmed
by their presence in `MAP_FIELDS` (Section 4) and by the clean identity-assertion pass in Section 2.

## 4. `MAP_FIELDS` — every map-shaped registry field is covered, diff empty

`MAP_FIELDS` as declared at `productRegistry.js:537-539` (11 names):

```
valueToTier, tierToText, tierToColor, displayColor,
excludedLabels, droughtLabels, excludedLabelKeys, droughtLabelKeys,
toValue, valueToText, valueToColor
```

**Per-row map-shaped field inventory, re-derived from the current 6-row registry:**

| Row | Map-shaped fields present |
|---|---|
| excessiveRain | `toValue`, `valueToTier`, `tierToText`, `tierToColor` |
| winterImpact | `toValue`, `valueToTier`, `tierToText`, `tierToColor` |
| spcMD | none |
| mpd | none |
| hazardsOutlook | `excludedLabels`, `droughtLabels`, `excludedLabelKeys`, `droughtLabelKeys`, `displayColor`, `toValue` |
| heatRisk | `valueToText`, `valueToColor` |

**Union of all rows' map-shaped fields** (11 names): `valueToTier, tierToText, tierToColor,
excludedLabels, droughtLabels, excludedLabelKeys, droughtLabelKeys, displayColor, toValue,
valueToText, valueToColor`.

**Diff against `MAP_FIELDS`: empty.** Both sets are the identical 11 names. Fields deliberately
excluded from `MAP_FIELDS` as out-of-scope structural/dispatch config, not value/tier/text/colour
maps (re-confirmed by reading every registry row this session): `dayLayers` (day→layerId
scheduling, per-row distinct, never a shareable ladder), `layers`/`dayRangeTotal`
(hazardsOutlook's own layer/span config), `order` (display sort priority, not a value translation),
`includesFeat`/`buildUrl`/`toEntry` (dispatch/predicate functions, not label-to-value tables),
`baseUrl`/`configFlag`/`id`/`kind`/`days`/`maxDataAgeHours`/`validTimeField`/`paletteSource`
(scalar/string configuration, not maps of any kind).

This confirms every actual map-shaped field on every one of the six `PRODUCT_REGISTRY` rows is
named in `MAP_FIELDS` and therefore reachable by `assertNoSharedRegistryMaps` — no map-shaped
field silently escapes the load-time check by not being listed.

---

*Phase: 17-nws-wpc-heatrisk-parallelized-fetching*
*Spot check performed: 2026-09-01, against the current `main` branch source*
