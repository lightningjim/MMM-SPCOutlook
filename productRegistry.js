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

const PRODUCT_REGISTRY = {
  excessiveRain: {
    id: "excessiveRain",
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
  }
  // Future rows (WSSI, MPD, Hazards Outlook, HeatRisk) land in Phases 15-17
  // (D-08) — not added here.
};

module.exports = { buildArcGisQuery, PRODUCT_REGISTRY };
