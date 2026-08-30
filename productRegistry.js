// productRegistry.js — product-descriptor table for WPC/CPC hazard products (D-07)
// and the single shared ArcGIS query builder (D-09).
//
// This file covers new WPC/CPC products only. It does not move, reference, or
// refactor the existing SPC URL constants, riskToValue, fireRiskToValue, or
// dnToFireValue defined in node_helper.js (D-08) — those stay exactly where
// they are.

const ERO_BASE_URL = "https://mapservices.weather.noaa.gov/vector/rest/services/hazards/wpc_precip_hazards/MapServer";

// f=geojson is hardcoded here per D-09 and must never become a parameter —
// the raw JSON output format (Esri's default) returns Web Mercator
// meter-scale coordinates that would silently corrupt turf point-in-polygon
// math (DATA-01, RESEARCH.md Pitfall 2).
// where is mandatory on this endpoint — omitting it returns HTTP 400,
// live-verified.
// outSR and returnGeometry are intentionally omitted because the ArcGIS
// defaults are already correct (f=geojson reprojects server-side to WGS84;
// geometry is returned by default) and every extra parameter is another
// chance for cache-key drift (PERF-02).
// This builder deliberately departs from the static `.lyr.geojson` URL
// constants used for SPC/fire weather in node_helper.js — do not collapse
// the two styles (D-08).
function buildArcGisQuery(baseUrl, layerId) {
  if (!(Number.isInteger(layerId) && layerId >= 0)) {
    throw new Error("buildArcGisQuery: layerId must be a non-negative integer");
  }
  if (!(typeof baseUrl === "string" && baseUrl.startsWith("https://mapservices.weather.noaa.gov/"))) {
    throw new Error("buildArcGisQuery: baseUrl must be an https mapservices.weather.noaa.gov URL");
  }
  return `${baseUrl}/${layerId}/query?where=1%3D1&outFields=*&f=geojson`;
}

// The number of display days a `arcgis-day-layers` row covers, derived from the row's own
// day -> layer map and validated at module load.
//
// A row used to state its span twice — `days: 5` beside a five-key `dayLayers` — with
// nothing tying the two together. That mismatch is not a cosmetic duplication: `buildUrl`
// reads `dayLayers[day]` and hands it to `buildArcGisQuery`, which throws on `undefined`;
// node_helper's `_runArcGisDayProduct` calls `buildUrl` INSIDE its per-day try, and that
// catch sets the payload's staleness flag. So a row whose `days` runs one past its
// `dayLayers` does not fail loudly or even intermittently — it flags every payload stale on
// every poll forever, which shows a permanent ⚠ Stale badge and, because staleness disables
// the frontend's no-risk short-circuit, renders "No Severe Weather Risk (unconfirmed)"
// indefinitely on quiet days. Raising `days` from 5 to 7 is the exact edit four separate
// comments in this codebase use to illustrate a one-line span change.
//
// Deriving the span makes that state unrepresentable: adding a Day 6 is one edit, in the
// one place the registry's own rule says a span is declared. Throwing here rather than
// degrading at poll time is deliberate — the registry is static source, so an invalid map
// is a bug that exists before the process ever polls, and a load-time throw surfaces it on
// the first run instead of turning it into a permanent silent degrade in the field.
function daySpanOf(dayLayers) {
  if (!dayLayers || typeof dayLayers !== "object") {
    throw new Error("productRegistry: dayLayers must be an object, got " + JSON.stringify(dayLayers));
  }
  const days = Object.keys(dayLayers).map(Number).sort((a, b) => a - b);
  if (days.length === 0) {
    throw new Error("productRegistry: dayLayers must name at least one day");
  }
  for (let i = 0; i < days.length; i++) {
    if (days[i] !== i + 1) {
      throw new Error("productRegistry: dayLayers must be a contiguous 1..N map, got " + JSON.stringify(days));
    }
    // The precondition buildArcGisQuery enforces, checked here so a bad layer id is a
    // load-time failure rather than a per-day throw the staleness catch would swallow.
    const layerId = dayLayers[days[i]];
    if (!(Number.isInteger(layerId) && layerId >= 0)) {
      throw new Error("productRegistry: dayLayers[" + days[i] + "] must be a non-negative integer layer id, got " +
                      JSON.stringify(layerId));
    }
  }
  return days.length;
}

// ERO display day -> MapServer layer id. Live-verified: layers 0 through 4
// are Excessive Rainfall Day 1 through Day 5.
const eroDayLayers = { 1: 0, 2: 1, 3: 2, 4: 3, 5: 4 };

// ERO's OWN dn field (lowercase), values 1-4. This is completely distinct
// from fire weather's DN (uppercase) field, whose values are 5/8/10 and are
// mapped by node_helper.js's separate dnToFireValue table. Referencing that
// fire weather table here would map every ERO feature to undefined || 0 and
// silently report "no risk" everywhere (ERO-02, RESEARCH.md Pitfall 1).
const eroDnToValue = { 1: 1, 2: 2, 3: 3, 4: 4 };

const eroValueToTier = { 0: "NONE", 1: "MRGL", 2: "SLGT", 3: "MDT", 4: "HIGH" };
const eroTierToText = { NONE: "None", MRGL: "Marginal", SLGT: "Slight", MDT: "Moderate", HIGH: "High" };

// Hex strings with no leading #, matching how node_helper.js riskToColor
// stores them and how MMM-SPCOutlook.js interpolates them (color:#" + ... + ").
const eroTierToColor = { NONE: "afddf6", MRGL: "7ac687", SLGT: "f7f690", MDT: "eb7e82", HIGH: "ff81f8" };

const WSSI_BASE_URL = "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer";

// WSSI display day -> MapServer layer id. Live-verified: layer 0 is a Group
// Layer (not a feature layer) and layer 4 is the Days 1-3 composite — neither
// is a per-day feature layer, so the per-day map is 1-based, unlike ERO's
// 0-based eroDayLayers.
const wssiDayLayers = { 1: 1, 2: 2, 3: 3 };

// Live renderer raw values (field `impact`), verbatim and ALL CAPS.
const wssiRawToValue = { "WINTER WEATHER AREA": 1, MINOR: 2, MODERATE: 3, MAJOR: 4, EXTREME: 5 };

const wssiValueToTier = { 0: "NONE", 1: "WWA", 2: "MINOR", 3: "MODERATE", 4: "MAJOR", 5: "EXTREME" };
const wssiTierToText = {
  NONE: "None", WWA: "Winter Weather Area", MINOR: "Minor",
  MODERATE: "Moderate", MAJOR: "Major", EXTREME: "Extreme"
};

// Hex, no leading "#" (matches eroTierToColor convention). Values and their
// provenance are also cited on the winterImpact row's paletteSource member
// per D-08.
const wssiTierToColor = {
  NONE: "afddf6", WWA: "d2dfe7", MINOR: "faf5a3",
  MODERATE: "f7962f", MAJOR: "e61f26", EXTREME: "7853a1"
};

// Bounds which remote directory-listing filenames may become a fetch target
// (plan 15-06's discovery step). Anchored at both ends so a hostile listing
// cannot inject a traversal segment, an absolute URL, or an alternate
// extension into the candidate set.
const MPD_FILENAME_PATTERN = /^MPD_(\d+)_final\.kmz$/;

// Same allowlisted host buildArcGisQuery already permits — no allowlist
// change needed.
const HAZARDS_BASE_URL = "https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer";

// The six hazards-outlook layers, in a fixed declared order. `group` drives
// window-band-vs-day-bucket routing (HAZ-01/HAZ-02). `dayRange` is consumed
// ONLY by D-04's full-window guard on `precipitation` layers — `temperature`
// and `wildfireDrought` route to the window band unconditionally regardless
// of observed span (HAZ-02, and RESEARCH's live finding that Temperature
// spans are 1/4/5 days within one layer in one poll).
const hazardsOutlookLayers = [
  { id: 1, group: "temperature",     dayRange: [3, 7] },
  { id: 4, group: "precipitation",   dayRange: [3, 7] },
  { id: 7, group: "wildfireDrought", dayRange: [3, 7] },
  { id: 3, group: "temperature",     dayRange: [8, 14] },
  { id: 6, group: "precipitation",   dayRange: [8, 14] },
  { id: 8, group: "wildfireDrought", dayRange: [8, 14] }
];

// 16-REVIEW WR-02: the single place a raw upstream `label` is canonicalized,
// so every downstream consumer — the D-09 exclusion, the D-10 drought gate,
// the D-02 order lookup and the display-colour map — sees one value.
//
// Both gates were exact-string comparisons against the raw attribute, so
// `"Flooding Likely "` (one trailing space), a value carrying a non-breaking
// space, or `"Flooding  Likely"` (a doubled inner space) walked past D-09 and
// rendered — attributing the National Flood Outlook's data to the Hazards
// Outlook, which is the single thing D-09 exists to prevent. The same shape
// let `"Severe Drought "` bypass the showDrought default-off gate, which is a
// user-visible config violation rather than cosmetic drift. This is WSSI-02's
// trap (winterImpact.toValue below already folds before its lookup) landing on
// a second row.
//
// Whitespace only, never a case fold, because D-11 says an unmapped label
// renders VERBATIM — folding case here would change what the user reads.
// JS `\s` and `String.prototype.trim` both cover the Unicode space
// separators including U+00A0, so a non-breaking space is removed too.
const normalizeHazardLabel = (raw) =>
  (typeof raw === "string" ? raw.trim().replace(/\s+/g, " ") : "");

// The comparison key for the two gates: normalized AND case-folded. Splitting
// "what we display" from "what we compare" is the review's own remedy — it
// closes `"flooding likely"` as a D-09 bypass without touching D-11's verbatim
// contract, because only the KEY is folded and the label itself is untouched.
const hazardLabelKey = (raw) => normalizeHazardLabel(raw).toUpperCase();

// D-09: these three labels originate from the National Flood Outlook, a
// separate NOAA product outside v2.0 scope that rides inside the
// Precipitation layers' attributes; rendering them would attribute another
// product's data to the Hazards Outlook. Hard exclusion with no config
// override. This is an interim measure with a known successor — the
// National Flood Outlook is scoped as its own phase this milestone
// (CONTEXT.md Deferred Ideas).
const hazardsExcludedLabels = ["Flooding Likely", "Flooding Occurring or Imminent", "Flooding Possible"];

// D-10: gated by showDrought (default false), NOT excluded. "Critical
// Wildfire Risk" is not drought and is never gated — the Wildfire/Drought
// layers multiplex both families on the same `label` attribute.
const hazardsDroughtLabels = ["Severe Drought", "Rapid Onset Drought Risk"];

// WR-02: the gate sets, DERIVED from the display lists above rather than
// restated, so the comparison is symmetric — a stray space typed into either
// list cannot make one side stop matching the other.
const hazardsExcludedLabelKeys = new Set(hazardsExcludedLabels.map(hazardLabelKey));
const hazardsDroughtLabelKeys = new Set(hazardsDroughtLabels.map(hazardLabelKey));

// D-02: registry-declared order for same-day co-occurring hazards, because
// ArcGIS response order can flip between polls on an unchanged forecast,
// which reads as a change on a glanceable mirror. Labels absent from this
// list sort AFTER every listed label, alphabetically among themselves.
const hazardsOrder = [
  "Severe Weather", "Heavy Rain", "Heavy Precipitation", "Heavy Snow",
  "Freezing Rain", "Heavy Ice"
];

// D-11 default style for a label that is neither excluded, gated, nor
// present in the display map. Same neutral grey the frontend's
// fireRiskToColor[0] already uses, so an unmapped label renders visibly in
// the module's existing no-risk grey rather than being dropped.
const HAZARDS_DEFAULT_COLOR = "aaaaaa";

// Label -> hex, no leading "#" (matches eroTierToColor/wssiTierToColor
// convention). Values read from drawingInfo.renderer.uniqueValueGroups[]
// .classes[].symbol.color on all six layers, live 2026-08-26 (RESEARCH.md
// Colors table). This map is NOT a filter — an absent label still renders
// verbatim in HAZARDS_DEFAULT_COLOR per D-11. "Severe Weather" is present
// deliberately and renders rather than being suppressed (D-12 — the
// hazard-dimension taxonomy that could justify suppression is Phase 18's
// charter). "Heavy Ice" shares "ff00c5" with "Freezing Rain" in WPC's own
// legend and that is not a transcription error. Drought labels are
// intentionally absent because they are gated elsewhere.
const hazardsDisplayColor = {
  "Frost/Freeze": "c500ff", "Hazardous Heat": "a80000", "Hazardous Cold": "005ce6",
  "High Winds": "cdaa66", "Significant Waves": "ffd37f", "Freezing Rain": "ff00c5",
  "Heavy Precipitation": "00e6a9", "Heavy Rain": "267300", "Heavy Snow": "0084a8",
  "Severe Weather": "e69800", "Heavy Ice": "ff00c5", "Critical Wildfire Risk": "000000",
  "Excessive Heat": "a80000", "Much Above Normal Temperatures": "ff0000",
  "Much Below Normal Temperatures": "005ce6"
};

// Sibling to daySpanOf, NOT a modification of it — daySpanOf asserts a
// contiguous 1..N map and this product's grid is a [3,14] range, a
// different shape. Same "make the invalid state unrepresentable, throw at
// load time" instinct as daySpanOf.
function dayRangeOf([first, last]) {
  if (!(Number.isInteger(first) && Number.isInteger(last) && last > first)) {
    throw new Error("productRegistry: dayRangeOf requires [first, last] integers with last > first, got " +
                    JSON.stringify([first, last]));
  }
  return [first, last];
}

// 16-REVIEW WR-03: the total span DERIVED from the layers that make it up, rather
// than restated beside them.
//
// `dayRangeTotal: dayRangeOf([3, 14])` stated a span that `hazardsOutlookLayers`
// already implies (min of the layers' `dayRange[0]`, max of their `dayRange[1]`),
// and the per-layer `[3,7]`/`[8,14]` literals never passed through `dayRangeOf` at
// all — so the validator that exists to make an invalid span unrepresentable guarded
// only the one value that was itself redundant. This is exactly the restatement
// `daySpanOf`'s comment above condemns and calls "not a cosmetic duplication": a
// `dayRangeTotal` that runs past the layers produces a correct-looking payload whose
// extra day keys render empty forever, with no error at either end.
//
// Validating every layer's own range on the way through is the other half: a typo in
// a layer literal is now a load-time throw rather than a silently mis-routed feature
// (`_isFullNominalWindow` compares against `layer.dayRange` directly).
function dayRangeSpanning(layers) {
  if (!Array.isArray(layers) || layers.length === 0) {
    throw new Error("productRegistry: dayRangeSpanning requires a non-empty layer array, got " +
                    JSON.stringify(layers));
  }
  // `|| []` so a layer missing its dayRange reaches dayRangeOf's own named error rather
  // than a bare "undefined is not iterable" out of the destructuring.
  const ranges = layers.map((layer) => dayRangeOf((layer && layer.dayRange) || []));
  return dayRangeOf([
    Math.min(...ranges.map((r) => r[0])),
    Math.max(...ranges.map((r) => r[1]))
  ]);
}

const PRODUCT_REGISTRY = {
  excessiveRain: {
    id: "excessiveRain",
    kind: "arcgis-day-layers",
    // Frontend config flag name, used by node_helper as this._products[row.configFlag].
    configFlag: "showExcessiveRain",
    baseUrl: ERO_BASE_URL,
    dayLayers: eroDayLayers,
    // Derived, never restated — see daySpanOf.
    days: daySpanOf(eroDayLayers),
    // Arrow closure over the module constants (not a method using `this`) so
    // a destructured row still works.
    buildUrl: (day) => buildArcGisQuery(ERO_BASE_URL, eroDayLayers[day]),
    // Matches extractPolygons's toValue(label, f) contract; reads lowercase
    // f.properties.dn through ERO's own map above. `label` is intentionally
    // unused — ERO features carry no LABEL field.
    toValue: (label, f) => eroDnToValue[f.properties.dn] || 0,
    includesFeat: (label, val) => val > 0,
    valueToTier: eroValueToTier,
    tierToText: eroTierToText,
    tierToColor: eroTierToColor,
    // The ERO feature property node_helper carries into the payload per D-03.
    validTimeField: "valid_time"
    // The HIGH tier (dn: 4) is schema-verified from the layer's own
    // drawingInfo.renderer legend but no live dn: 4 feature has been
    // observed in either research session, so its correctness is asserted
    // structurally rather than by live observation (RESEARCH.md Open
    // Question 1).
  },
  winterImpact: {
    id: "winterImpact",
    kind: "arcgis-day-layers",
    configFlag: "showWinterImpact",
    baseUrl: WSSI_BASE_URL,
    dayLayers: wssiDayLayers,
    // Derived, never restated — see daySpanOf.
    days: daySpanOf(wssiDayLayers),
    buildUrl: (day) => buildArcGisQuery(WSSI_BASE_URL, wssiDayLayers[day]),
    // WSSI-02: fold BEFORE the lookup — raw field values are ALL CAPS
    // regardless of WPC's mixed-case documentation, and this is the single
    // place the case fold happens. `label` is unused, matching ERO's
    // signature contract. Reads lowercase f.properties.impact.
    toValue: (label, f) => {
      const raw = f.properties.impact;
      const folded = typeof raw === "string" ? raw.trim().toUpperCase() : "";
      return wssiRawToValue[folded] || 0;
    },
    // D-09 AMENDED: MINOR (value 2) and above renders a row; WINTER WEATHER
    // AREA (value 1) is filtered out here, at exactly the point a no-risk
    // feature is, so it can never reach evaluatePolygons and can never
    // produce a row. WPC's own service description states this tier is "not
    // anticipated to impact daily life." Value 1 is retained in
    // wssiValueToTier only to document the real domain — it can never
    // surface in a payload once this filter runs.
    includesFeat: (label, val) => val >= 2,
    valueToTier: wssiValueToTier,
    tierToText: wssiTierToText,
    tierToColor: wssiTierToColor,
    // Live field list carries both valid_time and issue_time; valid_time is
    // the window, matching ERO's choice.
    validTimeField: "valid_time",
    // D-08: cite the palette's provenance in the row rather than leaving it
    // uncited (14-REVIEW.md IN-01's complaint about ERO's palette).
    // wssiTierToColor's hex values were read from this endpoint's
    // drawingInfo.renderer.uniqueValueInfos.
    paletteSource: "https://mapservices.weather.noaa.gov/vector/rest/services/outlooks/wpc_wssi/MapServer/1?f=json"
  },
  // Pure static configuration (D-02): no `this`, no network call, no
  // `require`. Candidate discovery needs the _fetch transport seam and
  // therefore lives in node_helper.js (plan 15-04); these rows only name
  // the strategy they want by string.
  spcMD: {
    id: "spcMD",
    kind: "kml-advisory",
    // Unlike every other product flag in this registry, showSPCMD defaults
    // to true, not false. Phase 14's CFG-01 rule ("every new product flag
    // defaults to false") governs new products; SPC MD is a shipping,
    // always-on feature being migrated under D-02, and defaulting it false
    // would silently delete a live capability. The default itself is set in
    // MMM-SPCOutlook.js (plan 15-03), not here.
    configFlag: "showSPCMD",
    allowedHost: "www.spc.noaa.gov",
    discovery: "spc-active-index",
    discoveryUrl: "https://www.spc.noaa.gov/products/md/ActiveMD.kmz",
    // SPC publishes its Placemark <name> already formatted as "MD 2108";
    // the composed label matches D-05's "SPC MD 0123 in effect." example.
    // Returns null (rather than a label carrying `undefined`) when the name
    // is missing or not a non-empty string, so the caller can log it.
    toEntry: (feature, ctx) => {
      const name = feature && feature.properties && feature.properties.name;
      if (typeof name !== "string" || name.length === 0) return null;
      return { label: "SPC " + name, hazardType: null };
    }
  },
  mpd: {
    id: "mpd",
    kind: "kml-advisory",
    // Genuinely new product; defaults to false per CFG-01.
    configFlag: "showMPD",
    allowedHost: "www.wpc.ncep.noaa.gov",
    discovery: "wpc-mpd-listing",
    discoveryUrl: "https://www.wpc.ncep.noaa.gov/kml/mpd/",
    // number and hazardType come from the description-CDATA table
    // (MPDNumber, MPDType), which only node_helper.js can parse, so the
    // caller supplies them on ctx. Returns null when ctx.number is absent.
    // Per D-06 a null hazardType is normal and must never cause the entry
    // to be dropped.
    toEntry: (feature, ctx) => {
      const number = ctx && ctx.number;
      if (!number) return null;
      const hazardType = (ctx && ctx.hazardType) || null;
      return { label: "WPC MPD " + number, hazardType };
    }
  },
  hazardsOutlook: {
    id: "hazardsOutlook",
    // Third kind, beside "arcgis-day-layers" and "kml-advisory" — a
    // node_helper.js sibling runner dispatches on it (15 D-01 left this slot
    // open deliberately).
    kind: "arcgis-hazard-window",
    configFlag: "showHazardsOutlook",
    baseUrl: HAZARDS_BASE_URL,
    layers: hazardsOutlookLayers,
    // WR-03: DERIVED from `layers` above, never restated — see dayRangeSpanning.
    // This is also the clamp `_bucketHazardMatch` applies, threaded in by the runner,
    // so changing this row's span cannot leave a hardcoded 3/14 behind in node_helper.
    dayRangeTotal: dayRangeSpanning(hazardsOutlookLayers),
    excludedLabels: hazardsExcludedLabels,
    droughtLabels: hazardsDroughtLabels,
    // WR-02: what the two gates actually compare against. The `*Labels` arrays
    // above stay for display/diagnostic use; these are the folded keys, so a
    // whitespace or case variant of an excluded or drought label cannot slip
    // through. Consumers pass a label through the exported `hazardLabelKey`.
    excludedLabelKeys: hazardsExcludedLabelKeys,
    droughtLabelKeys: hazardsDroughtLabelKeys,
    order: hazardsOrder,
    displayColor: hazardsDisplayColor,
    defaultColor: HAZARDS_DEFAULT_COLOR,
    // Argument is a LAYER ID, not a day — the inverse of
    // excessiveRain.buildUrl(day). This product's day lives inside each
    // feature's start_date/end_date, not in the URL. Every hazards URL must
    // come from here (Pitfall 11, cache-key drift) — no inline
    // buildArcGisQuery call at a second site.
    buildUrl: (layerId) => buildArcGisQuery(HAZARDS_BASE_URL, layerId),
    // HAZ-03 / Pitfall 8: extractPolygons hardcodes f.properties.LABEL
    // (uppercase, SPC-only, node_helper.js:1005), so the `label` positional
    // parameter is ALWAYS "" for this service. Read f.properties.label
    // (lowercase) directly off `f` — the same idiom eroDnToValue and
    // wssiRawToValue already use to route around this trap. A non-string
    // label yields "" so a malformed feature is dropped by includesFeat
    // rather than rendering `undefined`.
    //
    // WR-02: normalized HERE, in the row's own toValue, so canonicalization
    // happens once and every downstream consumer sees the same string —
    // exactly the placement winterImpact.toValue uses for WSSI-02's fold.
    toValue: (label, f) => normalizeHazardLabel(f && f.properties && f.properties.label),
    // D-13/D-14: 84 hours = Fri 17Z + 84h -> Mon 05Z, clearing a normal
    // weekend with ~12h of slack before Monday's 17:00Z issuance and
    // catching a mid-week stall within about a day. Live serviceDescription
    // re-confirmed 2026-08-26: "Update Frequency: Daily Monday-Friday at
    // 17:00Z". Known limitation: a federal-holiday Monday pushes the real
    // gap to 96h, so the badge fires on roughly 10 days a year, where it is
    // technically correct that nothing new has published. Applied against
    // each layer's OWN idp_filedate — live evidence 2026-08-26 recorded
    // three distinct filedates across the six layers in one poll, one ~23h
    // staler than its siblings, so a single shared row-level timestamp does
    // not exist.
    maxDataAgeHours: 84,
    // D-08 precedent (winterImpact above) and 14-REVIEW IN-01. Every hex in
    // hazardsDisplayColor was read from
    // drawingInfo.renderer.uniqueValueGroups[].classes[].symbol.color on all
    // six layers, live 2026-08-26. {layerId} in the URL is a placeholder for
    // 1|3|4|6|7|8. This supersedes FEATURES.md's "PNG swatches only, LOW
    // confidence" claim — no visual verification against wpc.ncep.noaa.gov
    // is needed.
    paletteSource: "https://mapservices.weather.noaa.gov/vector/rest/services/hazards/cpc_weather_hazards/MapServer/{layerId}?f=json"
    // Deliberately NO includesFeat here: D-10's Drought gate is
    // request-scoped (productToggles.showDrought) and registry rows are pure
    // static configuration with no `this` and no closure over request state
    // (15 D-02), so the runner builds that closure at call time over
    // excludedLabels + droughtLabels. Also no valueToTier/tierToText/
    // tierToColor: this product has no severity ladder anywhere in its
    // schema (Pitfall 1), so a max-comparator is meaningless (D-02).
  }
  // Future row (HeatRisk) lands in Phase 17 (D-08) — not added here.
};

module.exports = {
  buildArcGisQuery, daySpanOf, dayRangeOf, hazardLabelKey, normalizeHazardLabel,
  MPD_FILENAME_PATTERN, PRODUCT_REGISTRY
};
