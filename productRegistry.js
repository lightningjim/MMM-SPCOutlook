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

const PRODUCT_REGISTRY = {
  excessiveRain: {
    id: "excessiveRain",
    kind: "arcgis-day-layers",
    // Frontend config flag name, used by node_helper as this._products[row.configFlag].
    configFlag: "showExcessiveRain",
    baseUrl: ERO_BASE_URL,
    dayLayers: eroDayLayers,
    days: 5,
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
    days: 3,
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
  }
  // Future rows (Hazards Outlook, HeatRisk) land in Phases 16-17 (D-08) —
  // not added here.
};

module.exports = { buildArcGisQuery, MPD_FILENAME_PATTERN, PRODUCT_REGISTRY };
