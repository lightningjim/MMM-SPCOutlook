// hazardTaxonomy.js — the single static artifact mapping every (source, label) pair,
// across ALL eight products including SPC, to one of D-05's eight hazard dimensions, plus
// the precedence table (D-06 — "the precedence table beside the map" is the load-bearing
// design choice) and the no-risk floor table for every day-scoped source.
//
// Dimension is a merge concern; a PRODUCT_REGISTRY row is a fetch-and-colour concern
// (14 D-08, 15 D-02). This file does not move, reference, or refactor any PRODUCT_REGISTRY
// row — it only reads productRegistry.js's already-published label/day-span fields so this
// table never restates a value declared there.
//
// Maintainer note: HeatRisk's day mapping needs NO interval-overlap logic — its
// `idp_validtime` is already a point sample at exactly 12:00Z. `wpc-hazards`'
// `start_date`/`end_date` describe a genuine 00Z-00Z interval that must be reconciled
// against the 12Z grid instead. Do not "fix" HeatRisk into matching `wpc-hazards`.
//
// Pure static configuration, same discipline as productRegistry.js: plain object literals
// and arrow functions closing only over module constants. No `this`, no network call, no
// `Date` reads.

const { PRODUCT_REGISTRY } = require("./productRegistry");

// D-05's roster, verbatim, in order. Entries whose dimension is `null` (D-07 unmapped) sort
// after every listed dimension, alphabetically by label — the same `labelRank` convention
// node_helper.js:806-816 already uses for same-day co-occurring hazards.
const DIMENSIONS = Object.freeze([
  "convective", "flash-flood", "winter", "heat", "cold", "wind", "fire", "heavy-precip"
]);

// D-15's fixed category order. Derived from DIMENSIONS (spread, not retyped) so there is
// exactly one declaration of the roster's order — the "never restate a derived value" rule
// productRegistry.js:34-74 exists to enforce.
const DIMENSION_ORDER = Object.freeze([...DIMENSIONS]);

// D-08's canonical source id list. hazardTaxonomy.js owns this list; nothing else in the
// codebase restates it.
const DAY_SOURCE_IDS = Object.freeze([
  "spc-convective", "spc-fire", "wpc-ero", "wpc-wssi", "wpc-hazards", "heatrisk"
]);
const ADVISORY_SOURCE_IDS = Object.freeze(["spc-md", "wpc-mpd"]);
const SOURCE_IDS = Object.freeze([...DAY_SOURCE_IDS, ...ADVISORY_SOURCE_IDS]);

// Source day spans, for the reader only — PRECEDENCE below does NOT gate on day range.
// Per D-08/D-14 the day-range differences fall out for free from per-day source presence:
// a source that did not report for a grid day simply has no entry to win or lose with.
// Encoding spans here would be a second declaration of every product's span, exactly the
// drift daySpanOf's comment in productRegistry.js condemns.
//   spc-convective 1-8, spc-fire 1-8, wpc-ero 1-5, wpc-wssi 1-3, wpc-hazards 3-14,
//   heatrisk 1-N where N = PRODUCT_REGISTRY.heatRisk.days (read the registry row's own
//   field below rather than retyping this number).
const HEATRISK_DAY_SPAN_END = PRODUCT_REGISTRY.heatRisk.days;
void HEATRISK_DAY_SPAN_END; // documentation-only reference; PRECEDENCE never gates on spans

// wpc-hazards label -> dimension. Keyed only by label text; the KEY SET itself is derived
// below from PRODUCT_REGISTRY.hazardsOutlook.displayColor, not restated as a literal list,
// so a label the registry already renders a colour for can never silently go unmapped here.
//
// "Significant Waves" -> "wind" is [ASSUMED] per RESEARCH.md assumption A2: a marine wave
// hazard competing against SPC's thunderstorm-driven wind data.
//
// "Severe Drought" / "Rapid Onset Drought Risk" are deliberately ABSENT from this map:
// D-05's roster has no `drought` dimension, so they take D-07's `dimension: null`
// pass-through path via PRODUCT_REGISTRY.hazardsOutlook.droughtLabelKeys. This is the
// correct outcome, not an oversight to fix.
//
// The `Flooding *` labels are hard-excluded by the registry (hazardsExcludedLabels, 16 D-09)
// and never reach extractPolygons, so they never reach this table either.
//
// `heavy-precip` is deliberately kept separate from `flash-flood`: ERO's tiers are a
// forecaster-issued Flash Flood Guidance exceedance probability; `Heavy Rain` /
// `Heavy Precipitation` carry no FFG semantics and no probability tier. Merging them is
// Pitfall 10's exact over-merge trap — it would silently upgrade a generic rain flag into a
// flash-flood claim. This overrides FEATURES.md Part B2's pre-D-05 proposal.
const hazardsOutlookDimensionByLabel = {
  "Frost/Freeze": "cold",
  "Hazardous Heat": "heat",
  "Hazardous Cold": "cold",
  "High Winds": "wind",
  "Significant Waves": "wind", // [ASSUMED: RESEARCH.md A2]
  "Freezing Rain": "winter",
  "Heavy Precipitation": "heavy-precip",
  "Heavy Rain": "heavy-precip",
  "Heavy Snow": "winter",
  "Severe Weather": "convective",
  "Heavy Ice": "winter",
  "Critical Wildfire Risk": "fire",
  "Excessive Heat": "heat",
  "Much Above Normal Temperatures": "heat",
  "Much Below Normal Temperatures": "cold"
};

// Derives HAZARD_TAXONOMY["wpc-hazards"]'s key set from the registry's own displayColor
// keys, rather than retyping the label list a second time. Throws at require() time — not
// at poll time — if the registry ever renders a colour for a label this table doesn't know
// how to dimension, catching Pitfall 8's false-negative shape before it ships.
function buildWpcHazardsMap() {
  const map = {};
  for (const label of Object.keys(PRODUCT_REGISTRY.hazardsOutlook.displayColor)) {
    if (!Object.prototype.hasOwnProperty.call(hazardsOutlookDimensionByLabel, label)) {
      throw new Error(
        "hazardTaxonomy: wpc-hazards displayColor label \"" + label + "\" has no entry in " +
        "hazardsOutlookDimensionByLabel — every label the registry renders a colour for must " +
        "be mapped to a dimension here."
      );
    }
    map[label] = { dimension: hazardsOutlookDimensionByLabel[label] };
  }
  return map;
}

// (source, label) -> { dimension }, covering every product including SPC (D-06).
const HAZARD_TAXONOMY = {
  // Days 4-8 carry no LABEL field — percToRisk (node_helper.js:2236) maps a raw percent to
  // these same six tier names, so the same keys serve both day ranges. SPC's
  // tornado/hail/wind CIG breakdown rides as D-05's optional `detail` sub-object on this
  // single `convective` entry and is deliberately NOT three separate dimensions.
  "spc-convective": {
    TSTM: { dimension: "convective" },
    MRGL: { dimension: "convective" },
    SLGT: { dimension: "convective" },
    ENH: { dimension: "convective" },
    MDT: { dimension: "convective" },
    HIGH: { dimension: "convective" }
  },
  "spc-fire": {
    ELEV: { dimension: "fire" },
    CRIT: { dimension: "fire" },
    EXTM: { dimension: "fire" }
  },
  // The High row is [ASSUMED] per RESEARCH.md assumption A1: schema-verified in the
  // registry legend, never observed live.
  "wpc-ero": {
    "Marginal (At Least 5%)": { dimension: "flash-flood" },
    "Slight (At Least 15%)": { dimension: "flash-flood" },
    "Moderate (At Least 40%)": { dimension: "flash-flood" },
    "High (At Least 70%)": { dimension: "flash-flood" } // [ASSUMED: RESEARCH.md A1]
  },
  // WINTER WEATHER AREA is filtered by the registry's includesFeat (productRegistry.js:352)
  // before it can ever reach this table, so it is deliberately absent here.
  "wpc-wssi": {
    MINOR: { dimension: "winter" },
    MODERATE: { dimension: "winter" },
    MAJOR: { dimension: "winter" },
    EXTREME: { dimension: "winter" }
  },
  "wpc-hazards": buildWpcHazardsMap(),
  // Numeric keys, matching the registry's own numeric-keyed valueToText/valueToColor
  // convention rather than synthesising label strings (RESEARCH.md "Dimension Roster
  // Rationale" item 3). Keyed as strings because dimensionOf() coerces a numeric label with
  // String(label) before lookup.
  heatrisk: {
    "0": { dimension: "heat" },
    "1": { dimension: "heat" },
    "2": { dimension: "heat" },
    "3": { dimension: "heat" },
    "4": { dimension: "heat" }
  },
  // spc-md's hazardType is always null (productRegistry.js:386-390) and wpc-mpd's is free
  // forecaster prose with no fixed vocabulary — string-matching either into the roster would
  // be a second instance of Pitfall 10. Both carry `dimension: null` unconditionally and
  // never participate in day-level suppression, matching 15 D-03/D-05's separate advisories
  // array outside the day blocks.
  "spc-md": {},
  "wpc-mpd": {}
};

// dimension -> ordered array of source ids, rank 1 first. Day ranges are deliberately NOT
// encoded here as gates — see the "Source day spans" comment above.
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

// String sentinel for a source whose no-risk floor is already applied at fetch time, via the
// registry's own includesFeat gate, so any entry that reaches the payload is above floor by
// construction.
const FLOOR_PREBAKED = "prebaked-at-fetch-time";

// source id -> no-risk-floor predicate, keyed by the six day-scoped sources.
const NO_RISK_FLOOR = {
  // Two named predicates: SPC convective covers days 1-8, categorical on 1-3 and
  // probabilistic-only on 4-8 (D-14's fact correction), so it has two raw value domains and
  // therefore two floors.
  "spc-convective": {
    // TSTM maps to 1 in valueToRisk (node_helper.js:36-38); per D-13's own wording, General
    // Thunderstorms IS the floor and must not itself count as active.
    categorical: (value) => value > 1,
    // percToRisk (node_helper.js:2236-2242) returns "NONE" only when the percent is exactly
    // 0 — the "no probabilistic area / predictability too low" floor.
    probabilistic: (risk) => risk !== "NONE"
  },
  // fireRiskToValue (node_helper.js:3274) has exactly three tiers (ELEV/CRIT/EXTM), all >= 1,
  // with 0 meaning "no fire weather polygon covered this location" — presence at all is
  // activity, there is no sub-ELEV rung to exclude. RESEARCH.md Open Question 2 is a
  // low-priority spot-check, not a blocker, on this predicate.
  "spc-fire": (value) => value > 0,
  // includesFeat: (label, val) => val > 0 (productRegistry.js:315) already applied this at
  // extractPolygons time, so any non-"NONE" tier in the existing excessiveRain block is above
  // floor by construction.
  "wpc-ero": FLOOR_PREBAKED,
  // includesFeat: (label, val) => val >= 2 (productRegistry.js:352) filters WINTER WEATHER
  // AREA before evaluatePolygons ever sees it.
  "wpc-wssi": FLOOR_PREBAKED,
  // This service has no severity ladder anywhere in its schema — the registry row
  // deliberately carries no valueToTier/includesFeat — so the floor is "the label survived
  // the exclusion and drought gates and is present in this day's match set".
  "wpc-hazards": FLOOR_PREBAKED,
  // Matches D-13's "HeatRisk >= 1" exactly. 0 ("Little to No Risk") and null ("no reading")
  // BOTH fail the floor — D-13's rule that a quiet source never erases another source's
  // warning. 17 D-02's raw-category-preservation still stands and is what this predicate
  // reads; D-13 revises 17 D-02's stated rationale (the null-vs-0 split is not what makes
  // MERGE-03 decidable — the floor test is) without retiring the distinction.
  heatrisk: (category) => category !== null && category >= 1
};

// Returns the mapped dimension string, or null when the source or the label is unknown.
// Both lookups are hasOwnProperty-guarded — the same idiom node_helper.js:822 already uses
// for row.displayColor — so an upstream label of "__proto__" or "constructor" cannot resolve
// through Object.prototype (T-18-01). A numeric label (HeatRisk) is coerced with
// String(label) before lookup so the numeric and string forms agree.
function dimensionOf(sourceId, label) {
  if (!Object.prototype.hasOwnProperty.call(HAZARD_TAXONOMY, sourceId)) return null;
  const sourceMap = HAZARD_TAXONOMY[sourceId];
  const key = String(label);
  if (!Object.prototype.hasOwnProperty.call(sourceMap, key)) return null;
  return sourceMap[key].dimension;
}

// Throws (never warns, never degrades) on a structurally invalid taxonomy — a bad edit fails
// loudly at process start instead of silently mis-attributing hazards at poll time (T-18-06).
// Each throw message names the offending key, in the style of productRegistry.js's
// daySpanOf messages (productRegistry.js:53-74).
function assertTaxonomyIntegrity() {
  for (const dimension of Object.keys(PRECEDENCE)) {
    if (!DIMENSIONS.includes(dimension)) {
      throw new Error(
        "hazardTaxonomy: PRECEDENCE key \"" + dimension + "\" is not one of DIMENSIONS " +
        JSON.stringify(DIMENSIONS)
      );
    }
  }
  for (const dimension of DIMENSIONS) {
    if (!Object.prototype.hasOwnProperty.call(PRECEDENCE, dimension)) {
      throw new Error("hazardTaxonomy: DIMENSIONS entry \"" + dimension + "\" has no PRECEDENCE key");
    }
  }
  for (const [dimension, sourceIds] of Object.entries(PRECEDENCE)) {
    const seen = new Set();
    for (const sourceId of sourceIds) {
      if (!DAY_SOURCE_IDS.includes(sourceId)) {
        throw new Error(
          "hazardTaxonomy: PRECEDENCE[\"" + dimension + "\"] names source \"" + sourceId +
          "\", which is not in DAY_SOURCE_IDS " + JSON.stringify(DAY_SOURCE_IDS)
        );
      }
      if (seen.has(sourceId)) {
        throw new Error(
          "hazardTaxonomy: PRECEDENCE[\"" + dimension + "\"] lists source \"" + sourceId +
          "\" more than once: " + JSON.stringify(sourceIds)
        );
      }
      seen.add(sourceId);
    }
  }
  for (const [sourceId, labelMap] of Object.entries(HAZARD_TAXONOMY)) {
    for (const [label, entry] of Object.entries(labelMap)) {
      const dimension = entry && entry.dimension;
      if (dimension !== null && dimension !== undefined && !DIMENSIONS.includes(dimension)) {
        throw new Error(
          "hazardTaxonomy: HAZARD_TAXONOMY[\"" + sourceId + "\"][\"" + label + "\"].dimension \"" +
          dimension + "\" is neither null nor a member of DIMENSIONS " + JSON.stringify(DIMENSIONS)
        );
      }
      if (dimension && !PRECEDENCE[dimension].includes(sourceId)) {
        throw new Error(
          "hazardTaxonomy: HAZARD_TAXONOMY[\"" + sourceId + "\"][\"" + label + "\"] maps to dimension \"" +
          dimension + "\", but \"" + sourceId + "\" does not appear in PRECEDENCE[\"" + dimension + "\"] " +
          JSON.stringify(PRECEDENCE[dimension]) + " — this source can never win or lose that dimension"
        );
      }
    }
  }
  for (const sourceId of DAY_SOURCE_IDS) {
    if (!Object.prototype.hasOwnProperty.call(NO_RISK_FLOOR, sourceId)) {
      throw new Error("hazardTaxonomy: DAY_SOURCE_IDS entry \"" + sourceId + "\" has no NO_RISK_FLOOR key");
    }
    const floor = NO_RISK_FLOOR[sourceId];
    const isValidShape =
      typeof floor === "function" ||
      floor === FLOOR_PREBAKED ||
      (sourceId === "spc-convective" && floor && typeof floor === "object" &&
       typeof floor.categorical === "function" && typeof floor.probabilistic === "function");
    if (!isValidShape) {
      throw new Error(
        "hazardTaxonomy: NO_RISK_FLOOR[\"" + sourceId + "\"] must be a function, FLOOR_PREBAKED, or " +
        "(spc-convective only) a { categorical, probabilistic } function pair — got " + JSON.stringify(floor)
      );
    }
  }
  for (const sourceId of ADVISORY_SOURCE_IDS) {
    if (Object.prototype.hasOwnProperty.call(NO_RISK_FLOOR, sourceId)) {
      throw new Error(
        "hazardTaxonomy: ADVISORY_SOURCE_IDS entry \"" + sourceId + "\" must not have a NO_RISK_FLOOR key, " +
        "since advisories never participate in day-level suppression"
      );
    }
  }
  const dimensionOrderSorted = [...DIMENSION_ORDER].sort();
  const dimensionsSorted = [...DIMENSIONS].sort();
  const isPermutation = dimensionOrderSorted.length === dimensionsSorted.length &&
    dimensionOrderSorted.every((d, i) => d === dimensionsSorted[i]);
  if (!isPermutation) {
    throw new Error(
      "hazardTaxonomy: DIMENSION_ORDER " + JSON.stringify(DIMENSION_ORDER) +
      " is not a permutation of DIMENSIONS " + JSON.stringify(DIMENSIONS)
    );
  }
}

assertTaxonomyIntegrity(); // called at module load, same as productRegistry.js:568

module.exports = {
  HAZARD_TAXONOMY,
  PRECEDENCE,
  NO_RISK_FLOOR,
  FLOOR_PREBAKED,
  DIMENSIONS,
  DIMENSION_ORDER,
  SOURCE_IDS,
  DAY_SOURCE_IDS,
  ADVISORY_SOURCE_IDS,
  dimensionOf,
  assertTaxonomyIntegrity
};
