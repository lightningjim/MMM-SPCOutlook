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

const PRODUCT_REGISTRY = {};

module.exports = { buildArcGisQuery, PRODUCT_REGISTRY };
