// probe-payload-resilience.js — offline proof that getSpcOutlook's payload
// survives a hostile WPC/SPC response.
//
// Run with: node scripts/probe-payload-resilience.js
//
// The suite drives two seams: `installFetch` replaces helper.fetchGeoJsonCached
// directly for ArcGIS-shaped products, and `installHttp` replaces the lower
// `_fetch` transport seam so a scenario can drive the real fetchGeoJsonCached
// (and, for KMZ/binary products, fetchBinBuffer) against a controlled HTTP
// response. Each scenario asserts the D-05 payload contract: no `error` key,
// day1-day8, fireWeather, and a full 20-key excessiveRain block, regardless of
// what the upstream host returns.
//
// A scenario may declare `requires: "kml-deps"` when it needs the real
// adm-zip/@xmldom/xmldom/@tmcw/togeojson/xpath libraries that module-stubs.js
// resolves opportunistically. When those libraries are unavailable the
// scenario is SKIPPED rather than silently omitted: a skip is a missing proof,
// not a pass, and the run exits non-zero whenever any scenario did not run —
// D-10 makes this suite the verification standard for the phase, so a run
// that could not execute a scenario must never be reportable as green.

const { PRODUCT_REGISTRY, daySpanOf, assertNoSharedRegistryMaps } = require("../productRegistry.js");
const {
  loadNodeHelper, loadFrontendModule, renderDom, resetHelper, resetLogs, turfStub, logCalls,
  hasRealKmlDeps, missingKmlDeps, makeKmzBuffer
} = require("./probe-lib/module-stubs.js");
// Plan 18-08: read DIMENSION_ORDER off the real taxonomy artifact so the ordering
// control in merge-distinct-hazards-on-one-day-both-survive never restates a value
// hazardTaxonomy.js already owns.
const { DIMENSION_ORDER } = require("../hazardTaxonomy.js");

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

// The documented ArcGIS REST failure shape returned inside an HTTP 200 —
// no `features` key at all.
const ARCGIS_ERROR_BODY = {
  error: { code: 400, message: "Unable to complete operation", details: [] }
};

const SAMPLE_RING = [
  [-77.1, 38.8],
  [-76.9, 38.8],
  [-76.9, 39.0],
  [-77.1, 39.0],
  [-77.1, 38.8]
];

// Structurally a FeatureCollection, but its one feature has `properties: null`.
// WR-03: this fixture used to carry `geometry: null` as well, which made the scenario
// vacuous — the `!f.geometry` clause of node_helper.js's per-feature guard dropped the
// feature before the `properties` clause it claims to test was ever the reason for the
// rejection. Deleting the properties half of that guard left the scenario green. The
// geometry is real and the scenario sets pointInPolygon true, so `properties: null` is
// now the only thing wrong with this feature and the only thing that can reject it.
const MALFORMED_FEATURE_BODY = {
  type: "FeatureCollection",
  features: [{
    type: "Feature",
    properties: null,
    geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
  }]
};

// A hostile leading feature (no `properties` at all) in front of a real MDT polygon.
// The tier is resolved before the bad feature is ever dereferenced, so the correct
// answer is MDT with the *second* feature's valid_time (CR-01, WR-10).
const LEADING_BAD_FEATURE_BODY = {
  type: "FeatureCollection",
  features: [
    { type: "Feature", geometry: { type: "Polygon", coordinates: [SAMPLE_RING] } },
    {
      type: "Feature",
      properties: { dn: 3, valid_time: "2026-08-19T18:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// A structurally valid, empty FeatureCollection. Routing every SPC/fire-weather layer
// to this is how a scenario isolates the layer it is actually testing: each unrouted
// layer otherwise takes installFetch's hard-failure default, which sets anyStale and
// makes any `_stale` assertion pass for reasons that have nothing to do with the
// scenario's subject (WR-02).
// WSSI-03: this is also byte-identical to the live off-season response captured from the
// WSSI MapServer — `{"type":"FeatureCollection","features":[]}` — so the same constant
// doubles as the WSSI out-of-season fixture rather than a duplicate being added for it.
const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };

// WR-08: an HTTP 200 that parses as JSON and has a `features` array — so
// _isFeatureCollection accepts it — but whose leading feature carries a ring of two
// positions. turf.polygon throws on it ("Each LinearRing of a Polygon must have 4 or
// more Positions."), which is the shape a partial write at the origin or a truncated
// proxy response produces. The trailing feature is a real SLGT polygon in the same
// layer, so the correct outcome is a degraded-but-populated layer, never { error }.
const TRUNCATED_RING_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { LABEL: "MDT" },
      geometry: { type: "Polygon", coordinates: [[[-77.1, 38.8], [-76.9, 38.8]]] }
    },
    {
      type: "Feature",
      properties: { LABEL: "SLGT" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// A well-formed ERO feature: lowercase `dn` (2 -> SLGT per productRegistry's
// eroDnToValue/eroValueToTier) plus a `valid_time` field.
const ERO_SLGT_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { dn: 2, valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// WR-07: two polygons of the SAME winning tier both containing the user — routine at a
// tier boundary, and the ArcGIS layer does return multi-part tiers. The first-serialised
// one carries `valid_time: null`, which ArcGIS emits freely. The correct answer is the
// second polygon's window; reporting null is the very `features[0]`-ordering dependence
// _validTimeOfWinner exists to eliminate.
const ERO_SAME_TIER_NULL_VALID_TIME_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { dn: 2, valid_time: null },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    },
    {
      type: "Feature",
      properties: { dn: 2, valid_time: "2026-08-20T00:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// A well-formed SPC categorical/fire-weather feature — exercises the
// shared extractPolygons on the pre-existing LABEL-keyed path.
const SPC_SLGT_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { LABEL: "SLGT" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// WR-11: a Day 4-8 probability layer carrying both a 45% polygon and a SIGN polygon.
// percToRisk promotes 45% from ENH to MDT only when `sign` is true, so this is the one
// place the SIGN list's value type and its comparator change the user-visible answer.
const DAY4_45PCT_SIGN_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { LABEL: "0.45" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    },
    {
      type: "Feature",
      properties: { LABEL: "SIGN" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// The same layer with no SIGN polygon: 45% must stay ENH.
const DAY4_45PCT_NO_SIGN_BODY = {
  type: "FeatureCollection",
  features: [DAY4_45PCT_SIGN_BODY.features[0]]
};

// A well-formed fire-weather feature. WR-01: the fire-weather path maps labels
// through node_helper's fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 }, so routing
// this layer to SPC_SLGT_BODY (LABEL "SLGT") produced toValue 0, dropped the feature
// before evaluatePolygons, and made the fire-weather golden byte-identical to the
// output with the route removed entirely — it pinned key order and nothing else.
// "CRIT" is a label the product actually recognises, so the golden now pins a value
// the fire-weather code path computed.
const FIRE_CRIT_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { LABEL: "CRIT" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// D-09 AMENDED / WSSI-02: live WPC WSSI features carry ALL-CAPS `impact` values with no
// `LIMITED` tier — the real, live-verified domain is WINTER WEATHER AREA -> MINOR ->
// MODERATE -> MAJOR -> EXTREME. No fixture below may assert on the literal string
// "LIMITED": that tier does not exist in the live payload, so a scenario written against
// it could never go RED and would be permanently vacuous (RESEARCH.md Pitfall 4).
const WSSI_MINOR_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { impact: "MINOR", valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

const WSSI_MODERATE_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { impact: "MODERATE", valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

const WSSI_MAJOR_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { impact: "MAJOR", valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

const WSSI_EXTREME_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { impact: "EXTREME", valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// WSSI-02: WPC's prose documentation writes tier names in mixed case ("Minor") even
// though the live renderer's `impact` field is always ALL-CAPS; the registry's case fold
// must resolve this exactly like the ALL-CAPS fixture above.
const WSSI_MIXED_CASE_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { impact: "Minor", valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// D-09 AMENDED: WPC's own non-impact tier — its service description states this tier is
// "not anticipated to impact daily life." The registry's includesFeat filters this out
// before evaluatePolygons ever sees it, so it must render nothing, exactly like no-polygon.
const WSSI_WWA_BODY = {
  type: "FeatureCollection",
  features: [
    {
      type: "Feature",
      properties: { impact: "WINTER WEATHER AREA", valid_time: "2026-08-19T12:00:00Z" },
      geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
    }
  ]
};

// WR-09: this pair used to be documented as "fixed for every scenario so getSpcOutlook's
// location-change cache invalidation never fires mid-suite", which was false and hid a
// coverage hole. resetHelper delegates to helper.start(), which sets _cachedLat = null,
// so locationChanged is true on the FIRST getSpcOutlook call of every scenario and the
// cache is cleared there. What the fixed coordinates actually buy is that a scenario's
// SECOND and later calls do not invalidate — which is what makes a warm-cache scenario
// (ero-rejected-body-serves-last-known-good) possible at all.
const PROBE_LAT = 38.9;
const PROBE_LON = -77.0;

// Never hardcode an ERO URL — keying off buildUrl keeps the probe's own
// dependency chain honoring the URL byte-stability contract (PERF-02, D-09).
const ERO_URLS = {
  1: PRODUCT_REGISTRY.excessiveRain.buildUrl(1),
  2: PRODUCT_REGISTRY.excessiveRain.buildUrl(2),
  3: PRODUCT_REGISTRY.excessiveRain.buildUrl(3),
  4: PRODUCT_REGISTRY.excessiveRain.buildUrl(4),
  5: PRODUCT_REGISTRY.excessiveRain.buildUrl(5)
};

// Never hardcode a WSSI query URL — keying off buildUrl keeps the probe's own dependency
// chain honoring the URL byte-stability contract (PERF-02, D-09), exactly like ERO_URLS.
const WSSI_URLS = {
  1: PRODUCT_REGISTRY.winterImpact.buildUrl(1),
  2: PRODUCT_REGISTRY.winterImpact.buildUrl(2),
  3: PRODUCT_REGISTRY.winterImpact.buildUrl(3)
};

// Never hardcode a hazards URL — derived by iterating PRODUCT_REGISTRY.hazardsOutlook.layers
// and calling its own buildUrl, exactly like ERO_URLS/WSSI_URLS, so a layer-id change in
// productRegistry.js cannot leave a stale literal here (Pitfall 11, cache-key drift).
const HAZARDS_URLS = {};
for (const layer of PRODUCT_REGISTRY.hazardsOutlook.layers) {
  HAZARDS_URLS[layer.id] = PRODUCT_REGISTRY.hazardsOutlook.buildUrl(layer.id);
}

// The pinned "now" for every Hazards Outlook scenario in this file — Wed Aug 26 2026
// 13:00Z, matching 16-RESEARCH.md's live pull. Every hazards scenario overrides
// helper._nowMs with this constant as its first act after resetHelper, so day offsets are
// deterministic and the suite cannot go red at a date boundary (T-16-26).
const HAZARDS_NOW_MS = Date.UTC(2026, 7, 26, 13, 0);

// ---------------------------------------------------------------------
// HeatRisk fixture/route builders (plan 17-06)
// ---------------------------------------------------------------------

// The pinned "now" for every HeatRisk scenario in this file — Mon Aug 31 2026 13:00Z,
// matching 17-RESEARCH.md's live pull (the same session that captured the out-of-order
// catalog and the exact idp_validtime/idp_filedate values used below). Every HeatRisk
// scenario sets helper._nowMs to this constant as its first act after resetHelper, so
// _todayUtcMs() derives from it and day offsets are deterministic — 16-REVIEW WR-05's
// pinned-clock precedent, applied to a fourth product.
const HEATRISK_NOW_MS = Date.UTC(2026, 7, 31, 13, 0);

// idp_validtime sits at exactly 12:00:00.000Z on every live-observed feature
// (17-RESEARCH.md's Day-Offset Arithmetic section) — half a day past UTC midnight, so
// Math.round(0.5) === 1 places day 1's tile at that exact instant. This is the single place
// every fixture in this file derives a day's idp_validtime, so no scenario can drift from
// that alignment by hand-copying an offset.
function heatRiskValidtimeForDay(d) {
  return Date.UTC(2026, 7, 31, 12, 0) + (d - 1) * 86400000;
}

// Never hand-copy the HeatRisk identify URL — deriving it from the registry's OWN buildUrl,
// against the exact reprojection the runner itself performs (turf.toMercator on a turf.point
// built from PROBE_LON/PROBE_LAT), keeps this probe's dependency chain honoring the same
// byte-stability contract ERO_URLS/WSSI_URLS/HAZARDS_URLS already honor (PERF-02, D-09). A
// hand-copied literal would make this route silently miss the moment buildHeatRiskIdentifyUrl
// changes, and every heatrisk-* scenario would then be testing installHttp's 503 default
// instead of the product it claims to. turfStub is the SAME object node_helper.js's own
// `@turf/turf` require resolves to under loadNodeHelper(), so this computation is guaranteed
// byte-identical to the runner's own reprojection, not merely similar.
const HEATRISK_LOC = turfStub.point([PROBE_LON, PROBE_LAT]);
const HEATRISK_MERCATOR = turfStub.toMercator(HEATRISK_LOC);
const [HEATRISK_MERCATOR_X, HEATRISK_MERCATOR_Y] = HEATRISK_MERCATOR.geometry.coordinates;
const HEATRISK_URL = PRODUCT_REGISTRY.heatRisk.buildUrl(HEATRISK_MERCATOR_X, HEATRISK_MERCATOR_Y);

let heatRiskObjectIdSeq = 90000000;

// One catalogItems.features[] entry, live-observed field names. `filedate` defaults to
// HEATRISK_NOW_MS (fresh) so a freshness/D-07 scenario must opt into staleness explicitly,
// mirroring hazardsFeature's own defaulting note. `category` inside `attributes` here is the
// mosaic dataset's own per-item attribute — live-observed constant 1 on every feature, NOT
// the risk value (the actual per-day risk category lives in properties.Values[i], zipped in
// separately by heatRiskIdentifyResponse below) — so it is not parameterised here.
function heatRiskCatalogItem({ name, validtime, filedate, ingestdate }) {
  const resolvedFiledate = filedate !== undefined ? filedate : HEATRISK_NOW_MS;
  return {
    attributes: {
      objectid: heatRiskObjectIdSeq++,
      name,
      category: 1,
      idp_ingestdate: ingestdate !== undefined ? ingestdate : resolvedFiledate,
      idp_filedate: resolvedFiledate,
      idp_validtime: validtime
    }
  };
}

// Builds a full identify-shaped body. `values` may be a DIFFERENT LENGTH from `items`
// (D-06's mismatched-length scenario needs exactly that) or omitted entirely — `properties`
// then carries no Values key at all, not an empty array, so _isHeatRiskIdentifyResponse's
// Array.isArray(body.properties.Values) check rejects it the same way a genuinely absent
// field would. `value`/`visibilities` default to a shape deliberately WRONG for "today" —
// the live-observed [1,0,0,0,0,0,0] with index 0 pointing at the Day-2 tile, not Day 1 — so
// any implementation that ever reads either field fails a scenario rather than passing by
// luck (17-RESEARCH.md's confirmed-not-"today" finding).
function heatRiskIdentifyResponse({ items = [], values, value, visibilities } = {}) {
  const properties = {};
  if (values !== undefined) properties.Values = values;
  return {
    objectId: 0,
    name: "Pixel",
    value: value !== undefined ? value : "1",
    location: { x: 0, y: 0, spatialReference: { wkid: 102100, latestWkid: 3857 } },
    properties,
    catalogItems: { objectIdFieldName: "objectid", features: items },
    catalogItemVisibilities: visibilities !== undefined ? visibilities : [1, 0, 0, 0, 0, 0, 0]
  };
}

// A complete, healthy 7-item HeatRisk identify body in canonical day1..day7 order.
function healthyHeatRiskItems() {
  const items = [];
  for (let d = 1; d <= 7; d++) {
    items.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
  }
  return items;
}

// WR-02's trap, reciprocal direction: once a scenario turns on all six products, an
// UNROUTED HeatRisk identify URL would take installHttp's 503 default and corrupt a
// scenario about something else entirely — this is what (f) adds to every pre-existing
// route builder below (eroHttpRoutes, wssiRoutes, hazardsRoutes, advisoryRoutes). A quiet,
// healthy 200 here is the fix.
function okEmptyHeatRisk() {
  const items = healthyHeatRiskItems();
  return httpResponse({
    body: heatRiskIdentifyResponse({ items, values: items.map(() => "1") }),
    etag: "heatrisk-healthy-v1"
  });
}

// Routes for HeatRisk HTTP-seam scenarios, mirroring hazardsRoutes: HEATRISK_URL is the
// subject (a healthy default unless `overrides.heatRisk` supplies its own handler), and
// every ERO/WSSI/hazards layer plus the ".lyr.geojson" catch-all answers 200-empty by
// default — WR-02's trap in its usual direction: without routing every OTHER product, an
// unrouted URL takes installHttp's 503 default, sets anyStale, and any `_stale` assertion in
// a HeatRisk scenario would pass for a reason that has nothing to do with its subject.
function heatRiskRoutes(overrides = {}) {
  const okEmpty = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "heatrisk-quiet-v1" });
  const routes = [[HEATRISK_URL, overrides.heatRisk || okEmptyHeatRisk]];
  for (const url of Object.values(ERO_URLS)) routes.push([url, okEmpty]);
  for (const url of Object.values(WSSI_URLS)) routes.push([url, okEmpty]);
  for (const url of Object.values(HAZARDS_URLS)) routes.push([url, okEmpty]);
  routes.push([".lyr.geojson", okEmpty]);
  return routes;
}

// The live MPD hazard-type table, verbatim from RESEARCH.md's MPD_1118_final.kmz sample.
// Used by harness-real-kml-deps-round-trip to pin togeojson's description-object shape
// (RESEARCH.md Pitfall 3) as executable ground truth before any product code depends on it.
const MPD_DESCRIPTION_TABLE_HTML =
  "<table>" +
  "<tr><td>FID</td><td>0</td></tr>" +
  "<tr bgcolor=\"#D4E4F3\"><td>ValidStart</td><td>232333</td></tr>" +
  "<tr><td>ValidEndTi</td><td>240515</td></tr>" +
  "<tr bgcolor=\"#D4E4F3\"><td>IssueTime</td><td>734 PM EDT Sun Aug 23 2026</td></tr>" +
  "<tr><td>MPDNumber</td><td>1118</td></tr>" +
  "<tr bgcolor=\"#D4E4F3\"><td>Forecaster</td><td>Otto</td></tr>" +
  "<tr><td>MPDType</td><td>Heavy rainfall, Flash flooding possible</td></tr>" +
  "<tr bgcolor=\"#D4E4F3\"><td>WFO</td><td>PSR, TWC</td></tr>" +
  "</table>";

const MPD_KML_DOC = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<Placemark>
<name>MPD 1118</name>
<description><![CDATA[${MPD_DESCRIPTION_TABLE_HTML}]]></description>
<Polygon>
<outerBoundaryIs>
<LinearRing>
<coordinates>-77.1,38.8,0 -76.9,38.8,0 -76.9,39.0,0 -77.1,39.0,0 -77.1,38.8,0</coordinates>
</LinearRing>
</outerBoundaryIs>
</Polygon>
</Placemark>
</Document>
</kml>
`;

// ---------------------------------------------------------------------
// Shared KMZ/KML fixture builders (plan 15-08 / 15-09)
//
// Give these explicit parameters rather than hardcoding one scenario's values, since
// both this plan and plan 15-09 build fixtures from them.
// ---------------------------------------------------------------------

// SPC MD's shape: a single Placemark whose <name> is already a clean "MD 2108"-style
// label (toEntry reads feature.properties.name directly, unlike MPD which reads its
// label out of the description CDATA), with a Polygon using SAMPLE_RING.
function mdKml(name) {
  const ring = SAMPLE_RING.map(([lon, lat]) => `${lon},${lat},0`).join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<Placemark>
<name>${name}</name>
<Polygon>
<outerBoundaryIs>
<LinearRing>
<coordinates>${ring}</coordinates>
</LinearRing>
</outerBoundaryIs>
</Polygon>
</Placemark>
</Document>
</kml>
`;
}

// WPC MPD's shape: a single Placemark whose <description> is a CDATA HTML table
// carrying the live row set (ValidStart, ValidEndTi, IssueTime, MPDNumber, Forecaster,
// MPDType, WFO). When hazardType is null the MPDType row is omitted entirely — a
// genuinely absent row, not an empty cell — so D-06's "no hazard type" branch is
// exercised against the real shape it must handle. The Placemark <name> is a raw DTG
// string like the live samples (not "MPD <number>"), so code that mistakenly labels an
// MPD from the Placemark name instead of the description's MPDNumber field produces a
// visibly wrong label rather than a plausible one.
function mpdKml({ number, issueTime, validEndTi, hazardType }) {
  const rows = [
    ["ValidStart", "232333"],
    ["ValidEndTi", validEndTi],
    ["IssueTime", issueTime],
    ["MPDNumber", number],
    ["Forecaster", "Otto"]
  ];
  if (hazardType !== null && hazardType !== undefined) {
    rows.push(["MPDType", hazardType]);
  }
  rows.push(["WFO", "PSR, TWC"]);
  const tableRows = rows
    .map(([label, value], i) => `<tr${i % 2 === 1 ? " bgcolor=\"#D4E4F3\"" : ""}><td>${label}</td><td>${value}</td></tr>`)
    .join("");
  const description = `<table>${tableRows}</table>`;
  const ring = SAMPLE_RING.map(([lon, lat]) => `${lon},${lat},0`).join(" ");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
<Placemark>
<name>232333</name>
<description><![CDATA[${description}]]></description>
<Polygon>
<outerBoundaryIs>
<LinearRing>
<coordinates>${ring}</coordinates>
</LinearRing>
</outerBoundaryIs>
</Polygon>
</Placemark>
</Document>
</kml>
`;
}

// SPC's ActiveMD.kmz shape: one NetworkLink/Link/href per supplied string, verbatim and
// unmodified — fixtures pass http:// hrefs deliberately (Pitfall 1), and this builder
// must not "fix" them on the way in.
function activeIndexKml(hrefs) {
  const networkLinks = hrefs
    .map((href) => `<NetworkLink><Link><href>${href}</href></Link></NetworkLink>`)
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2">
<Document>
${networkLinks}
</Document>
</kml>
`;
}

// Thin wrapper over makeKmzBuffer that places a non-.kml entry first by default, so
// every advisory fixture exercises extractSoleKmlEntry's scan-for-the-sole-.kml-entry
// behaviour rather than letting a first-entry implementation pass by luck. `entries` is
// merged onto a target object that already has "style.xsl" as its first key; because
// Object.assign preserves each key's first-seen insertion position, a caller-supplied
// entries object cannot displace it to a later position.
function kmzOf(entries) {
  const merged = Object.assign({ "style.xsl": "<xsl/>" }, entries);
  return makeKmzBuffer(merged);
}

// Builds an installHttp route list for a kml-advisory scenario: the discovery index URL
// to a Buffer response, each member KMZ URL to its Buffer, the listing URL (WPC MPD's
// directory listing) to a text response, and .lyr.geojson plus every ERO/WSSI query URL
// to 200-empty JSON. Routing every unrelated layer to 200-empty is WR-02's trap again —
// otherwise an unrouted layer takes installHttp's hard-failure (503) default, sets
// anyStale, and any `_stale` assertion in the scenario passes for a reason that has
// nothing to do with the scenario's subject.
function advisoryRoutes({ index, members = [], listing } = {}) {
  const routes = [];
  if (index) {
    routes.push([index.url, () => httpResponse({ buffer: index.buffer, etag: "advisory-index-v1" })]);
  }
  for (const member of members) {
    routes.push([member.url, () => httpResponse({ buffer: member.buffer, etag: "advisory-member-v1" })]);
  }
  if (listing) {
    routes.push([listing.url, () => httpResponse({ text: listing.text, etag: "advisory-listing-v1" })]);
  }
  const okEmpty = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" });
  routes.push([".lyr.geojson", okEmpty]);
  for (const url of Object.values(ERO_URLS)) routes.push([url, okEmpty]);
  for (const url of Object.values(WSSI_URLS)) routes.push([url, okEmpty]);
  // (f): the reciprocal of heatRiskRoutes' own quiet defaults — a sixth product cannot
  // silently 503 the moment an advisory scenario enables it too.
  routes.push([HEATRISK_URL, okEmptyHeatRisk]);
  return routes;
}

// ---------------------------------------------------------------------
// MPD-specific fixture helpers (plan 15-09)
//
// Fixture times are computed relative to Date.now() rather than hardcoded absolute
// dates, so the suite does not start failing on a future run date.
// ---------------------------------------------------------------------

function pad2(n) {
  return String(n).padStart(2, "0");
}

const MPD_MONTH_ABBRS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MPD_DOW_ABBRS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MPD_TZ_OFFSET_HOURS = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7 };

// Derives a live-shaped { issueTimeStr, validEndTi } pair whose ValidEndTi resolves —
// through node_helper.js's own parseMpdValidEnd — to validEndUtcMs, with an IssueTime
// issueBeforeMs earlier. Mirrors parseMpdValidEnd's read contract (IssueTime carries the
// tz/month/day/year, ValidEndTi carries a bare day/hour/minute resolved against it)
// without duplicating that parser's logic here, so a fixture and the code under test can
// never silently drift apart.
function mpdWindowFields(validEndUtcMs, { issueBeforeMs = 3 * 60 * 60 * 1000, tz = "EDT" } = {}) {
  const offset = MPD_TZ_OFFSET_HOURS[tz];
  const toLocal = (utcMs) => new Date(utcMs + offset * 60 * 60 * 1000);
  const validLocal = toLocal(validEndUtcMs);
  const issueLocal = toLocal(validEndUtcMs - issueBeforeMs);

  const validEndTi = pad2(validLocal.getUTCDate()) + pad2(validLocal.getUTCHours()) + pad2(validLocal.getUTCMinutes());

  let hour12 = issueLocal.getUTCHours() % 12;
  if (hour12 === 0) hour12 = 12;
  const ampm = issueLocal.getUTCHours() < 12 ? "AM" : "PM";
  const issueTimeStr =
    `${hour12}${pad2(issueLocal.getUTCMinutes())} ${ampm} ${tz} ${MPD_DOW_ABBRS[issueLocal.getUTCDay()]} ` +
    `${MPD_MONTH_ABBRS[issueLocal.getUTCMonth()]} ${issueLocal.getUTCDate()} ${issueLocal.getUTCFullYear()}`;

  return { issueTimeStr, validEndTi };
}

// WPC's Apache "Index of /kml/mpd/" listing shape: one <a href="MPD_<n>_final.kmz">...</a>
// per entry, followed by its Last-Modified column — the exact shape wpc-mpd-listing's
// ANCHOR_RE parses. `lastModified` is a Date; omit it on an entry to exercise the
// fail-open "no timestamp" branch (never used by this plan's scenarios, but kept general).
function mpdListingHtml(entries) {
  const rows = entries.map(({ filename, lastModified }) => {
    const ts = lastModified
      ? `${lastModified.getUTCFullYear()}-${pad2(lastModified.getUTCMonth() + 1)}-${pad2(lastModified.getUTCDate())} ` +
        `${pad2(lastModified.getUTCHours())}:${pad2(lastModified.getUTCMinutes())}`
      : "";
    return `<a href="${filename}">${filename}</a>             ${ts}`;
  });
  return `<html><head><title>Index of /kml/mpd/</title></head><body><h1>Index of /kml/mpd/</h1><pre>\n${rows.join("\n")}\n</pre></body></html>\n`;
}

// A payload shape in which every day/fireWeather/ERO/winterImpact value is the
// no-risk/none default and `_stale` is absent, parameterised only by `advisories` — used
// by frontend-advisory-only-is-not-an-all-clear to isolate the advisory term of the
// no-risk gate from every other term. Day 4-8 carry minimal fields only: with
// config.extended false, getDom never reads them (the `&&` chain short-circuits on
// `this.config.extended` before evaluating anything on `this.spcrisk.day48Risk` or
// `this.spcrisk.fireWeather.day3Risk`-`day8Risk`).
function noRiskPayloadWithAdvisory(advisories) {
  const dayNone = { risk: "NONE", text: "None", color: "afddf6", probRisk: false, torRisk: 0, torCig: 0, hailRisk: 0, hailCig: 0, windRisk: 0, windCig: 0 };
  const day3None = { risk: "NONE", text: "None", color: "afddf6", probRisk: false, cig: 0 };
  const day48None = { risk: "NONE", probRisk: false, sign: false, color: "afddf6", text: "None" };
  const eroDay = { Risk: "NONE", Text: "None", Color: "afddf6", ValidTime: null };
  const excessiveRain = {};
  const winterImpact = {};
  for (let d = 1; d <= 5; d++) {
    excessiveRain[`day${d}Risk`] = eroDay.Risk;
    excessiveRain[`day${d}Text`] = eroDay.Text;
    excessiveRain[`day${d}Color`] = eroDay.Color;
    excessiveRain[`day${d}ValidTime`] = eroDay.ValidTime;
  }
  for (let d = 1; d <= 3; d++) {
    winterImpact[`day${d}Risk`] = eroDay.Risk;
    winterImpact[`day${d}Text`] = eroDay.Text;
    winterImpact[`day${d}Color`] = eroDay.Color;
    winterImpact[`day${d}ValidTime`] = eroDay.ValidTime;
  }
  return {
    day48Risk: false,
    day1: { ...dayNone },
    day2: { ...dayNone },
    day3: { ...day3None },
    day4: { ...day48None },
    day5: { ...day48None },
    day6: { ...day48None },
    day7: { ...day48None },
    day8: { ...day48None },
    fireWeather: {
      day1Risk: 0, day1Text: "None", day2Risk: 0, day2Text: "None",
      day3Risk: 0, day3Text: "None", day4Risk: 0, day4Text: "None",
      day5Risk: 0, day5Text: "None", day6Risk: 0, day6Text: "None",
      day7Risk: 0, day7Text: "None", day8Risk: 0, day8Text: "None"
    },
    excessiveRain,
    winterImpact,
    advisories
  };
}

// The same isolation noRiskPayloadWithAdvisory gives the advisory term of the no-risk
// gate, applied to the Hazards Outlook terms: every other value is the no-risk/none
// default, `advisories` is empty, `_stale` is absent, and `hazardsOutlook` is whatever
// the caller supplies — used by frontend-hazards-window-band-only-is-not-an-all-clear and
// its sibling to isolate hazardsOutlookHasAnyDay/hazardsOutlookHasWindowEntries from every
// other gate term.
function noRiskPayloadWithHazards(hazardsBlock) {
  return { ...noRiskPayloadWithAdvisory({ spcMD: [], mpd: [] }), hazardsOutlook: hazardsBlock };
}

// The full day3..day14 + windowBand shape with everything empty — assertHazardsBlockIntact's
// own 13-key contract, satisfied trivially. Used as the base for a fixture that populates
// only the window band (HAZ-02's day-grid-vs-window-band isolation) or only specific days.
function emptyHazardsBlock() {
  const block = {};
  for (let d = 3; d <= 14; d++) {
    block[`day${d}`] = { date: "2026-08-26", hazards: [] };
  }
  block.windowBand = [];
  return block;
}

// ---------------------------------------------------------------------
// Fetch stubbing
// ---------------------------------------------------------------------

// Yields the fresh-fetch shape fetchGeoJsonCached returns on a cache miss.
function freshFetch(body) {
  return () => ({
    data: body,
    rawText: JSON.stringify(body),
    newEtag: "probe-etag",
    newHash: null,
    mode: "etag"
  });
}

// Stands in for the real fetchGeoJsonCached's unguarded JSON.parse throwing
// a SyntaxError on an HTML error page — a live failure mode this probe
// cannot otherwise reach through the fresh-fetch shape.
function throwingFetch() {
  return () => {
    throw new Error("simulated fetchGeoJsonCached failure");
  };
}

// Replaces helper.fetchGeoJsonCached with a router over URL-substring
// routes. Any URL matching no route returns the hard-failure shape, which
// drives every unstubbed SPC/fire-weather value to its zero/no-risk
// default. `failed: true` mirrors what the real fetchGeoJsonCached returns
// for a non-2xx or network error with no usable cache entry (CR-03) — the
// flag every caller turns into the user-visible ⚠ stale badge, so a
// no-risk reading is never mistaken for a confident all-clear.
// Records every URL passed so scenarios can assert on call counts.
function installFetch(helper, routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    for (const [matcher, handler] of routes) {
      if (url.includes(matcher)) {
        return handler(url);
      }
    }
    return { data: null, cachedResult: null, stale: false, failed: true };
  };
  fn.calls = calls;
  helper.fetchGeoJsonCached = fn;
  return fn;
}

// ---------------------------------------------------------------------
// HTTP stubbing (WR-09)
//
// installFetch above replaces fetchGeoJsonCached itself, which means everything
// *inside* it — the 304-with-no-entry guard, rejectBody's stale fallback, parseBody's
// contained JSON.parse, the ETag/hash mode split, _isWithinStaleWindow — is executed by
// no scenario at all. Those are the phase's headline fixes, and the only branch that
// seam could reach was one the real function cannot emit (WR-01). installHttp stubs one
// layer lower, at node_helper's _fetch transport seam, so scenarios drive the real
// fetchGeoJsonCached against a controlled HTTP response.
// ---------------------------------------------------------------------

// Minimal stand-in for a node-fetch Response: only the members fetchGeoJsonCached and
// fetchBinBuffer actually touch. `buffer` is for KMZ/binary scenarios: when supplied,
// arrayBuffer() resolves to that Buffer and text() resolves to its toString(). The
// existing body/text behaviour is untouched when buffer is absent, so no shipped
// scenario changes.
function httpResponse({ status = 200, body, text, buffer, etag = null }) {
  const rawText = buffer !== undefined ? buffer.toString() : (text !== undefined ? text : JSON.stringify(body));
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => rawText,
    arrayBuffer: async () => (buffer !== undefined ? buffer : Buffer.from(rawText)),
    headers: { get: (name) => (String(name).toLowerCase() === "etag" ? etag : null) }
  };
}

// CR-02: a response whose headers arrived cleanly and whose BODY then fails — a
// connection reset, a truncated chunked response, or the 15 s AbortSignal firing after
// the connect phase succeeded. This is the shape no scenario could produce while
// httpResponse only ever resolved text(): every existing failure fixture rejects at the
// connect (installFetch's throwingFetch) or answers a non-2xx, and both of those take
// branches that were already contained. Only this shape reaches the unguarded
// `await res.text()`.
function httpBodyReadFailure({ status = 200, etag = null, message = "ECONNRESET while reading body" } = {}) {
  const reject = async () => { throw new Error(message); };
  return {
    ok: status >= 200 && status < 300,
    status,
    text: reject,
    arrayBuffer: reject,
    headers: { get: (name) => (String(name).toLowerCase() === "etag" ? etag : null) }
  };
}

// Router over URL-substring routes, installed on helper._fetch. A URL matching no route
// gets a 503, which is the real function's "unrecoverable fetch failure" path rather
// than a fabricated return shape. Records the request headers so a scenario can prove an
// If-None-Match was actually sent.
function installHttp(helper, routes) {
  const calls = [];
  helper._fetch = async (url, options) => {
    calls.push({ url, headers: (options && options.headers) || {} });
    for (const [matcher, handler] of routes) {
      if (url.includes(matcher)) return handler(url, options);
    }
    return httpResponse({ status: 503, text: "service unavailable" });
  };
  helper._fetch.calls = calls;
  return helper._fetch;
}

// PERF-01 / D-10: no existing helper in this file can hold a request open — every route
// above resolves synchronously or via a plain async function that resolves immediately.
// Holding a request open until the SCENARIO explicitly releases it is the only way to
// observe concurrent issuance (a later member's request issued before an earlier
// member's response resolves) without depending on wall-clock timing, which would be
// flaky on a Raspberry Pi and would not be a proof of structure at all. Placed here,
// beside installHttp, rather than in module-stubs.js: it is a per-scenario network stub
// built on the exact same httpResponse/route-matching conventions installHttp already
// establishes in this file, not a node_helper-loading or global-seam concern the way
// everything module-stubs.js owns (turf, kml-deps resolution, the frontend vm loader) is.
//
// Matches installHttp's routing/recording contract exactly (substring match against
// `routes`, `{ url, headers }` recorded synchronously at call time, an unrouted URL takes
// the same 503 default) but returns a PENDING promise for every matched route instead of
// resolving immediately. Control surface, all live on `helper._fetch`:
//   `pending`         — array of `{ url, release(), reject(err) }`, in issue order
//   `releaseAll()`    — resolves every currently pending request
//   `releaseMatching(substring)` — resolves only pending requests whose URL matches
// A bounded safety timer (default 3000ms, well under this suite's sub-second runtime)
// rejects any request never explicitly released, naming every URL still pending at that
// moment — so a mis-written scenario fails loudly with a diagnosable message instead of
// hanging the whole suite forever.
function installDeferredHttp(helper, routes, { timeoutMs = 3000 } = {}) {
  const calls = [];
  const pending = [];
  helper._fetch = (url, options) => {
    calls.push({ url, headers: (options && options.headers) || {}, at: calls.length });
    let handler = null;
    for (const [matcher, candidate] of routes) {
      if (url.includes(matcher)) { handler = candidate; break; }
    }
    if (!handler) {
      // Unrouted: the same hard-failure default installHttp uses, resolved IMMEDIATELY
      // (never held) — an unrouted URL must fail loudly, not hang the scenario.
      return Promise.resolve(httpResponse({ status: 503, text: "service unavailable" }));
    }
    let settleResolve, settleReject;
    const promise = new Promise((resolve, reject) => {
      settleResolve = resolve;
      settleReject = reject;
    });
    const removeFromPending = () => {
      const idx = pending.indexOf(entry);
      if (idx !== -1) pending.splice(idx, 1);
    };
    const entry = {
      url,
      release: () => {
        clearTimeout(timer);
        removeFromPending();
        settleResolve(handler(url, options));
      },
      reject: (err) => {
        clearTimeout(timer);
        removeFromPending();
        settleReject(err);
      }
    };
    // Deliberately NOT unref()'d: an unref'd timer lets Node treat "nothing else keeping
    // the event loop alive" as "the process is done" and exit silently — abandoning this
    // promise forever with zero diagnostic and a misleading exit code 0, exactly the
    // hang-with-no-diagnostic failure mode this timer exists to prevent. Refed, a
    // genuinely abandoned request keeps the process alive until this fires and rejects
    // loudly; on the happy path every request is released long before this ever fires.
    const timer = setTimeout(() => {
      removeFromPending();
      settleReject(new Error(
        `installDeferredHttp: safety timeout (${timeoutMs}ms) — request to ${url} was never ` +
        `released. Still-pending URLs at timeout: ${pending.map((p) => p.url).join(", ") || "(none other)"}`
      ));
    }, timeoutMs);
    pending.push(entry);
    return promise;
  };
  helper._fetch.calls = calls;
  helper._fetch.pending = pending;
  helper._fetch.releaseAll = () => {
    for (const entry of [...pending]) entry.release();
  };
  helper._fetch.releaseMatching = (substring) => {
    for (const entry of [...pending]) {
      if (entry.url.includes(substring)) entry.release();
    }
  };
  return helper._fetch;
}

// Routes for the HTTP-seam scenarios: ERO day 1 is the subject, every other ERO day and
// every SPC/fire-weather layer answers 200 with an empty collection. Nothing else may
// hard-fail, or anyStale would be set by a layer the scenario is not testing and its
// `_stale` assertion would be vacuous (WR-02's trap).
function eroHttpRoutes(day1Handler) {
  const okEmpty = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" });
  return [
    [ERO_URLS[1], day1Handler],
    [ERO_URLS[2], okEmpty],
    [ERO_URLS[3], okEmpty],
    [ERO_URLS[4], okEmpty],
    [ERO_URLS[5], okEmpty],
    [".lyr.geojson", okEmpty],
    // (f): a sixth product cannot silently 503 the moment an ERO scenario enables it too.
    [HEATRISK_URL, okEmptyHeatRisk]
  ];
}

// Routes for the WSSI HTTP-seam scenarios, mirroring eroHttpRoutes: WSSI day 1 is the
// subject, WSSI days 2-3, every ERO day, and every SPC/fire-weather layer answer 200 with
// an empty collection. This is WR-02's trap applied to WSSI — without routing every other
// layer, an unrouted layer takes the hard-failure default, sets anyStale, and any `_stale`
// assertion passes for a reason that has nothing to do with the scenario's subject.
function wssiRoutes(day1Handler) {
  const okEmpty = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" });
  return [
    [WSSI_URLS[1], day1Handler],
    [WSSI_URLS[2], okEmpty],
    [WSSI_URLS[3], okEmpty],
    [ERO_URLS[1], okEmpty],
    [ERO_URLS[2], okEmpty],
    [ERO_URLS[3], okEmpty],
    [ERO_URLS[4], okEmpty],
    [ERO_URLS[5], okEmpty],
    [".lyr.geojson", okEmpty],
    // (f): a sixth product cannot silently 503 the moment a WSSI scenario enables it too.
    [HEATRISK_URL, okEmptyHeatRisk]
  ];
}

// Routes for the Hazards Outlook HTTP-seam scenarios, mirroring eroHttpRoutes/wssiRoutes:
// ALL SIX hazards URLs answer 200 with an empty collection by default, plus every ERO/WSSI
// URL and the SPC/fire-weather ".lyr.geojson" catch-all — nothing outside the scenario's
// subject may hard-fail, or anyStale is set by a layer the scenario is not testing and its
// `_stale` assertion becomes vacuous (WR-02's trap, T-16-25). `overrides` is keyed by layer
// id (1, 3, 4, 6, 7, 8, per hazardsOutlookLayers); a layer id present there gets its own
// handler instead of the quiet default.
function hazardsRoutes(overrides = {}) {
  const okEmpty = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "hazards-empty-v1" });
  const routes = [];
  for (const layer of PRODUCT_REGISTRY.hazardsOutlook.layers) {
    routes.push([HAZARDS_URLS[layer.id], overrides[layer.id] || okEmpty]);
  }
  routes.push(
    [ERO_URLS[1], okEmpty], [ERO_URLS[2], okEmpty], [ERO_URLS[3], okEmpty],
    [ERO_URLS[4], okEmpty], [ERO_URLS[5], okEmpty],
    [WSSI_URLS[1], okEmpty], [WSSI_URLS[2], okEmpty], [WSSI_URLS[3], okEmpty],
    [".lyr.geojson", okEmpty],
    // (f): a sixth product cannot silently 503 the moment a Hazards Outlook scenario
    // enables it too.
    [HEATRISK_URL, okEmptyHeatRisk]
  );
  return routes;
}

// Builds one Hazards Outlook GeoJSON feature. 16-RESEARCH.md live-verified every
// start_date/end_date on this service is exact UTC midnight epoch ms, so fixtures must
// match that shape — startDate/endDate are epoch ms, not date strings. HAZ-03 / Pitfall 8
// (T-16-24): carries ONLY a lowercase `label` property, deliberately NO uppercase `LABEL`
// — a fixture that also carried `LABEL` could satisfy extractPolygons's hardcoded
// uppercase read and mask a HAZ-03 regression. `filedate` defaults to `startDate` when
// omitted, which is safe against every pinned-clock scenario in this file (a future
// startDate is never stale relative to HAZARDS_NOW_MS).
function hazardsFeature({ label, startDate, endDate, filedate }) {
  return {
    type: "Feature",
    properties: {
      label,
      start_date: startDate,
      end_date: endDate,
      idp_filedate: filedate !== undefined ? filedate : startDate
    },
    geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
  };
}

function hazardsCollection(features) {
  return { type: "FeatureCollection", features };
}

// ---------------------------------------------------------------------
// Payload contract assertion
// ---------------------------------------------------------------------

// The four fields a product row's payload block emits per day. Deliberately literal —
// this is the probe's independent statement of the contract (WR-10).
const ERO_SUFFIXES = ["Risk", "Text", "Color", "ValidTime"];

function assertPayloadIntact(out) {
  if (out === null || typeof out !== "object") {
    throw new Error("assertPayloadIntact: out is not an object");
  }
  if (out.error !== undefined) {
    throw new Error(`payload collapsed to { error }: ${out.error}`);
  }
  for (let d = 1; d <= 8; d++) {
    const key = `day${d}`;
    if (typeof out[key] !== "object" || out[key] === null) {
      throw new Error(`assertPayloadIntact: ${key} missing or not an object`);
    }
  }
  if (typeof out.day48Risk !== "boolean") {
    throw new Error("assertPayloadIntact: day48Risk is not a boolean");
  }
  if (typeof out.fireWeather !== "object" || out.fireWeather === null) {
    throw new Error("assertPayloadIntact: fireWeather missing or not an object");
  }
  for (let d = 1; d <= 8; d++) {
    if (!(`day${d}Risk` in out.fireWeather)) {
      throw new Error(`assertPayloadIntact: fireWeather.day${d}Risk missing`);
    }
    if (!(`day${d}Text` in out.fireWeather)) {
      throw new Error(`assertPayloadIntact: fireWeather.day${d}Text missing`);
    }
  }
  // WR-10: node_helper derives every ERO day count from PRODUCT_REGISTRY.excessiveRain.days
  // so that "no literal day count survives outside the registry", but this assertion
  // hardcoded 5 days and 20 keys — so changing the single declared knob from 5 to 7 failed
  // the probe with "excessiveRain has 28 keys, expected 20", a message that points at the
  // payload rather than at the probe. The day count now comes from the registry; the
  // SUFFIX list stays literal on purpose, because it is the independent oracle and must
  // not come from the same source as the thing under test.
  //
  // WR-05: and it checked ONLY excessiveRain. Phase 15 added two more payload blocks that
  // D-05 declares "always present, regardless of the toggle" — `winterImpact` and
  // `advisories.{spcMD,mpd}` — and 25 scenarios called this function as "the D-05 payload
  // contract" while asserting nothing about either. Deleting `winterImpact: wssiPayload`
  // from getSpcOutlook's return object passed this oracle; so did deleting `advisories`.
  //
  // 17-REVIEW WR-05: the loop below used to open `if (row.kind !== "arcgis-day-layers")
  // continue;` while its comment claimed "a Phase 16/17 row is covered the moment it is
  // declared, with no edit here." That was false for two of the four declared kinds.
  // `arcgis-identify-point` (HeatRisk) and `arcgis-hazard-window` (Hazards Outlook) were
  // skipped outright, so the ~60 scenarios that call this function without ALSO calling
  // assertHeatRiskBlockIntact/assertHazardsBlockIntact by hand would have passed with
  // `heatRisk: heatRiskPayload` deleted from getSpcOutlook's return object — the exact
  // regression the paragraph above says was caught for winterImpact and advisories.
  //
  // It now DISPATCHES on kind rather than filtering to one, and an unrecognised kind is a
  // throw. That trailing throw is the load-bearing part: it is what makes declaring a
  // fifth product kind a loud failure here instead of a silent skip, which is the only
  // way the "covered the moment it is declared" claim can be true rather than aspirational.
  // The registry uses `id: "excessiveRain"` / `"winterImpact"` and the payload uses those
  // same key names, so `out[row.id]` is already the correct lookup.
  for (const row of Object.values(PRODUCT_REGISTRY)) {
    if (row.kind === "arcgis-identify-point") {
      assertHeatRiskBlockIntact(out);
      continue;
    }
    if (row.kind === "arcgis-hazard-window") {
      assertHazardsBlockIntact(out);
      continue;
    }
    if (row.kind === "kml-advisory") {
      // D-05's advisory half, checked per row below in the same pass.
      if (typeof out.advisories !== "object" || out.advisories === null) {
        throw new Error("assertPayloadIntact: advisories missing or not an object");
      }
      if (!Array.isArray(out.advisories[row.id])) {
        throw new Error(
          `assertPayloadIntact: advisories.${row.id} is not an array ` +
          `(got ${JSON.stringify(out.advisories[row.id])})`
        );
      }
      continue;
    }
    if (row.kind !== "arcgis-day-layers") {
      throw new Error(
        `assertPayloadIntact: registry row "${row.id}" has an uncovered kind "${row.kind}" — this oracle ` +
        "claims every declared row is covered the moment it is declared, so a new kind must be given a " +
        "check here rather than silently skipped (17-REVIEW WR-05)"
      );
    }
    const block = out[row.id];
    if (typeof block !== "object" || block === null) {
      throw new Error(`assertPayloadIntact: ${row.id} missing or not an object`);
    }
    const keyCount = Object.keys(block).length;
    const expectedKeys = row.days * ERO_SUFFIXES.length;
    if (keyCount !== expectedKeys) {
      throw new Error(
        `assertPayloadIntact: ${row.id} has ${keyCount} keys, expected ${expectedKeys} ` +
        `(${row.days} days x ${ERO_SUFFIXES.length} fields)`
      );
    }
    for (let d = 1; d <= row.days; d++) {
      for (const suffix of ERO_SUFFIXES) {
        const key = `day${d}${suffix}`;
        if (!(key in block)) {
          throw new Error(`assertPayloadIntact: ${row.id}.${key} missing`);
        }
      }
    }
    const validTiers = Object.keys(row.tierToText);
    for (let d = 1; d <= row.days; d++) {
      const riskKey = `day${d}Risk`;
      const val = block[riskKey];
      if (!validTiers.includes(val)) {
        throw new Error(`assertPayloadIntact: ${row.id}.${riskKey} is not a valid tier (got ${JSON.stringify(val)})`);
      }
    }
  }
  // D-05 again, for the advisory half: `advisories` is present whether or not the product
  // is toggled on. This is what the frontend's `[...advisories.spcMD, ...advisories.mpd]`
  // spread relies on (WR-07). The per-row array check now happens inside the kind dispatch
  // above, so it cannot drift out of step with the registry; this is the container check,
  // which must hold even if no kml-advisory row were declared at all.
  if (typeof out.advisories !== "object" || out.advisories === null) {
    throw new Error("assertPayloadIntact: advisories missing or not an object");
  }
}

// Phase 14 D-05: one payload shape always — a toggle being off never changes it.
// assertPayloadIntact deliberately covers only the top-level day1..day8, so this is the
// Hazards Outlook block's own shape gate, exercised by every hazards-* scenario.
function assertHazardsBlockIntact(out) {
  const block = out && out.hazardsOutlook;
  if (typeof block !== "object" || block === null) {
    throw new Error("assertHazardsBlockIntact: hazardsOutlook missing or not an object");
  }
  const keys = Object.keys(block);
  if (keys.length !== 13) {
    throw new Error(
      `assertHazardsBlockIntact: hazardsOutlook has ${keys.length} keys, expected 13 (day3..day14 + windowBand)`
    );
  }
  for (let d = 3; d <= 14; d++) {
    const key = `day${d}`;
    const entry = block[key];
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`assertHazardsBlockIntact: ${key} missing or not an object`);
    }
    if (typeof entry.date !== "string") {
      throw new Error(`assertHazardsBlockIntact: ${key}.date is not a string (got ${JSON.stringify(entry.date)})`);
    }
    if (!Array.isArray(entry.hazards)) {
      throw new Error(`assertHazardsBlockIntact: ${key}.hazards is not an array`);
    }
  }
  if (!Array.isArray(block.windowBand)) {
    throw new Error("assertHazardsBlockIntact: windowBand is not an array");
  }
}

// (g): the probe's own independent statement of the HeatRisk payload contract (WR-10) —
// exactly day1..day7, each an object with exactly category/text/color, category either null
// or an integer 0..4, text/color always strings, and a null category paired with empty
// text/color. The day count is written as a literal 7 here deliberately: this is the probe
// stating the contract independently of the registry, so a change to
// PRODUCT_REGISTRY.heatRisk.days fails loudly here instead of silently agreeing with itself.
function assertHeatRiskBlockIntact(out) {
  const block = out && out.heatRisk;
  if (typeof block !== "object" || block === null) {
    throw new Error("assertHeatRiskBlockIntact: heatRisk missing or not an object");
  }
  const keys = Object.keys(block);
  if (keys.length !== 7) {
    throw new Error(`assertHeatRiskBlockIntact: heatRisk has ${keys.length} keys, expected 7 (day1..day7)`);
  }
  for (let d = 1; d <= 7; d++) {
    const key = "day" + d;
    const entry = block[key];
    if (typeof entry !== "object" || entry === null) {
      throw new Error(`assertHeatRiskBlockIntact: ${key} missing or not an object`);
    }
    const entryKeys = Object.keys(entry).sort();
    const expectedKeys = ["category", "color", "text"];
    if (entryKeys.length !== 3 || entryKeys.join(",") !== expectedKeys.join(",")) {
      throw new Error(
        `assertHeatRiskBlockIntact: ${key} has keys ${JSON.stringify(entryKeys)}, expected exactly category/text/color`
      );
    }
    const { category, text, color } = entry;
    if (category !== null && !(Number.isInteger(category) && category >= 0 && category <= 4)) {
      throw new Error(`assertHeatRiskBlockIntact: ${key}.category is not null or an integer 0..4 (got ${JSON.stringify(category)})`);
    }
    if (typeof text !== "string") {
      throw new Error(`assertHeatRiskBlockIntact: ${key}.text is not a string (got ${JSON.stringify(text)})`);
    }
    if (typeof color !== "string") {
      throw new Error(`assertHeatRiskBlockIntact: ${key}.color is not a string (got ${JSON.stringify(color)})`);
    }
    if (category === null && (text !== "" || color !== "")) {
      throw new Error(
        `assertHeatRiskBlockIntact: ${key} has category null but text/color not empty ` +
        `(text=${JSON.stringify(text)}, color=${JSON.stringify(color)})`
      );
    }
  }
}

// ---------------------------------------------------------------------
// Log assertions (WR-04)
//
// loggerStub records every Log.info/Log.error into logCalls and every scenario
// calls resetLogs(), but nothing ever read the result — so the harness looked
// like it verified the observability guarantee while verifying nothing about
// logging at all. These two helpers are what make a degrade path assertable:
// requireLog proves the diagnostic an operator needs was emitted, and
// forbidLog proves a day reached its value through the intended guard rather
// than through a swallowed exception.
// ---------------------------------------------------------------------

function requireLog(fragments, why) {
  const hit = logCalls.some((line) => fragments.every((f) => line.includes(f)));
  if (!hit) {
    throw new Error(`${why} — no log line matched [${fragments.join(", ")}]. Captured: ${JSON.stringify(logCalls)}`);
  }
}

function forbidLog(fragment, why) {
  const offenders = logCalls.filter((line) => line.includes(fragment));
  if (offenders.length > 0) {
    throw new Error(`${why}: ${offenders.join(" | ")}`);
  }
}

// ---------------------------------------------------------------------
// Golden snapshot for spc-wellformed-baseline (last scenario)
//
// Captured from a real run against the unmodified pre-fix node_helper.js
// (see 14-06-SUMMARY.md RED baseline). Any later diff against these two
// constants is a regression in plan 14-07's shared-code changes, not an
// improvement — they pin the exact day1/fireWeather shape produced when the
// day1 categorical layer returns a well-formed SLGT feature, the day1
// fire-weather wind/RH layer returns a well-formed CRIT feature, and every
// other layer hard-fails. GOLDEN_FIRE_WEATHER was re-captured when its fixture
// was corrected from SLGT (a label the fire-weather path maps to 0) to CRIT.
// ---------------------------------------------------------------------

const GOLDEN_DAY1 = '{"risk":"SLGT","text":"Slight","color":"f7f690","probRisk":false,"torRisk":0,"torCig":0,"hailRisk":0,"hailCig":0,"windRisk":0,"windCig":0}';
const GOLDEN_FIRE_WEATHER = '{"day1Risk":2,"day1Text":"Critical","day2Risk":0,"day2Text":"None","day3Risk":0,"day3Text":"None","day4Risk":0,"day4Text":"None","day5Risk":0,"day5Text":"None","day6Risk":0,"day6Text":"None","day7Risk":0,"day7Text":"None","day8Risk":0,"day8Text":"None"}';

// WR-01: a golden whose every field is the zero/no-risk default pins key order and
// nothing else — it is satisfied just as well by deleting the fixture that was supposed
// to produce it, which is exactly how GOLDEN_FIRE_WEATHER came to guard nothing. This
// self-check runs before the scenarios so that class of vacuity cannot recur silently.
const NO_RISK_VALUES = new Set([0, false, null, "NONE", "None", "afddf6"]);

function assertGoldenPinsSomething(name, goldenJson) {
  const parsed = JSON.parse(goldenJson);
  const informative = Object.entries(parsed).filter(([, value]) => !NO_RISK_VALUES.has(value));
  if (informative.length === 0) {
    throw new Error(
      `golden snapshot ${name} is entirely zero/no-risk defaults, so it pins key order and ` +
      "nothing the product computed — give its fixture a label/value the product recognises"
    );
  }
}

// ---------------------------------------------------------------------
// Phase 18 / MERGE-02, MERGE-03, MERGE-04, RPT-07 fixtures (plan 18-08)
// ---------------------------------------------------------------------

// The pinned "now" for every merge-precedence-*/merge-flash-flood-*/merge-distinct-*/
// merge-unmapped-*/merge-summary-*/merge-sources-*/merge-parity-* scenario below:
// 2026-09-05T13:00Z, inside the 00Z-12Z-past window so _spcGridAnchor's clock fallback
// (no VALID_ISO/EXPIRE_ISO routed) resolves a nominal 12Z start of
// 2026-09-05T12:00:00Z -- the SAME anchor arithmetic 18-07's merge-grid-* family already
// exercises, reused here rather than re-derived.
const MERGE_NOW_MS = Date.UTC(2026, 8, 5, 13, 0);
const MERGE_NOMINAL_MS = Date.UTC(2026, 8, 5, 12, 0);

// The epoch-ms [start, end) window a single-calendar-day wpc-hazards feature must carry
// to land squarely on Phase 18 grid day `n` under MERGE_NOMINAL_MS, per _gridDayOf's
// offset+1 rule (D-10/D-11). A single-day span never satisfies _isFullNominalWindow's
// exact-alignment check against any layer's dayRange, so every fixture built from this
// always reaches the day grid rather than the window band.
function mergeGridWindow(n) {
  return { start: MERGE_NOMINAL_MS + (n - 1) * 86400000, end: MERGE_NOMINAL_MS + n * 86400000 };
}

// ---------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------

const scenarios = [
  {
    // WR-02: this is the scenario that actually states CR-01's contract — an optional,
    // default-off product must not take the primary product offline. Registering only ERO
    // routes could not show that: every SPC layer hard-failed too, so day1.risk was "NONE"
    // whether or not the containment worked, and a regression that preserved the key shape
    // while zeroing every SPC value would have passed. The day1 categorical layer is
    // therefore routed to a real SLGT body and its *value* is asserted.
    name: "ero-arcgis-error-body",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      // WR-01: this scenario used to stub fetchGeoJsonCached and hand the ERO loop
      // `{ data: ARCGIS_ERROR_BODY }` — a shape the real function cannot emit, because
      // both of its data-bearing returns are gated by _isFeatureCollection. It therefore
      // asserted a log line production never produces, and it pinned the dead branch in
      // place: deleting that branch turned this scenario red for the wrong reason. It now
      // serves the same body over the HTTP seam, so the rejection happens where it really
      // happens (rejectBody) and the assertion names the line production really emits.
      const arcgisError = () => httpResponse({ body: ARCGIS_ERROR_BODY, etag: "ero-err" });
      installHttp(helper, [
        ["day1otlk_cat.lyr.geojson", () => httpResponse({ body: SPC_SLGT_BODY, etag: "spc-v1" })],
        [ERO_URLS[1], arcgisError],
        [ERO_URLS[2], arcgisError],
        [ERO_URLS[3], arcgisError],
        [ERO_URLS[4], arcgisError],
        [ERO_URLS[5], arcgisError],
        [".lyr.geojson", () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })]
      ]);
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.day1.risk !== "SLGT") {
        throw new Error(`an ERO failure destroyed the SPC day1 value: expected SLGT, got ${out.day1.risk}`);
      }
      if (out.day1.text !== "Slight" || out.day1.color !== "f7f690") {
        throw new Error(`SPC day1 presentation fields did not survive the ERO failure: ${JSON.stringify(out.day1)}`);
      }
      for (let d = 1; d <= 5; d++) {
        if (out.excessiveRain[`day${d}Risk`] !== "NONE") {
          throw new Error(`day${d}Risk expected NONE, got ${out.excessiveRain[`day${d}Risk`]}`);
        }
        if (out.excessiveRain[`day${d}ValidTime`] !== null) {
          throw new Error(`day${d}ValidTime expected null, got ${JSON.stringify(out.excessiveRain[`day${d}ValidTime`])}`);
        }
      }
      if (helper._geoJsonCache.has(ERO_URLS[1])) {
        throw new Error("a rejected ArcGIS error body was written to _geoJsonCache");
      }
      if (out._stale !== true) {
        throw new Error("five rejected ERO bodies produced an unflagged payload (_stale !== true)");
      }
      // WR-04: the degrade must be diagnosable from the log, per day. WR-01: this is the
      // line the real fetchGeoJsonCached emits for this body, named per URL.
      for (let d = 1; d <= 5; d++) {
        requireLog(
          ["rejected an unusable response body for", ERO_URLS[d], "not a usable body"],
          `a rejected ERO body on day ${d} produced no diagnostic log line`
        );
      }
      // WR-03: NONE must come from the shape guard, never from a swallowed exception.
      forbidLog("TypeError", "an ERO day resolved to NONE via an exception, not via the shape guard");
    }
  },
  {
    name: "ero-fetch-throws",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      // WR-06/WR-02's trap: this used to route ONLY the ERO URLs, so every SPC categorical,
      // hazard, CIG and fire-weather layer fell through to installFetch's hard-failure
      // default and set anyStale long before the ERO loop ran. Any `_stale` assertion here
      // would then have passed for a reason having nothing to do with the contained throw.
      // Every non-ERO layer now succeeds with an empty collection — the ERO URLs are ArcGIS
      // query URLs and carry no ".lyr.geojson", so they alone throw.
      installFetch(helper, [
        [ERO_URLS[1], throwingFetch()],
        [ERO_URLS[2], throwingFetch()],
        [ERO_URLS[3], throwingFetch()],
        [ERO_URLS[4], throwingFetch()],
        [ERO_URLS[5], throwingFetch()],
        [".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]
      ]);
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      assertPayloadIntact(out);
      for (let d = 1; d <= 5; d++) {
        if (out.excessiveRain[`day${d}Risk`] !== "NONE") {
          throw new Error(`day${d}Risk expected NONE, got ${out.excessiveRain[`day${d}Risk`]}`);
        }
        // WR-04: a contained throw is only acceptable if it is also reported.
        requireLog(
          [`excessiveRain day ${d}`, "fetch/parse/evaluate failed"],
          `a contained ERO throw on day ${d} produced no diagnostic log line`
        );
      }
      // WR-06: "reported" meant reported to the LOG, and the log is not where the user
      // looks. This was the only scenario exercising _runArcGisDayProduct's catch and it
      // stopped one assertion short of the one that matters, so the suite reported PASS on
      // a payload presenting five silently-failed ERO days as a confident all-clear — the
      // exact outcome ero-hard-fail-is-flagged, wssi-hard-fail-is-flagged and
      // mpd-fetch-failure-is-stale-but-zero-results-is-not all exist to prevent.
      if (out._stale !== true) {
        throw new Error("five contained ERO throws produced an unflagged no-risk payload (_stale !== true)");
      }
      // And the render-layer half, because _stale in the payload proves nothing on its own
      // when the branch that renders it is unreachable (CR-01's original lesson).
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: true, showWinterImpact: false
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (rendered === "No Severe Weather Risk") {
        throw new Error("a silently-degraded ERO run rendered as a confident all-clear");
      }

      // Negative control: identical routing with the ERO toggle off. If _stale is still
      // set, the staleness came from a layer this scenario is not testing and the
      // assertion above is vacuous no matter what it says (WR-02's trap).
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: false };
      installFetch(helper, [[".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]]);
      const off = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: false });
      assertPayloadIntact(off);
      if (off._stale) {
        throw new Error("staleness came from a non-ERO layer — the _stale assertion above is vacuous");
      }
    }
  },
  {
    name: "ero-malformed-feature",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, [
        [ERO_URLS[1], freshFetch(MALFORMED_FEATURE_BODY)]
      ]);
      // WR-03: the feature carries a real geometry and the user is inside it, so if the
      // per-feature `properties` guard did not reject it the tier would resolve rather
      // than staying NONE. Without this the fixture's null geometry decided the outcome.
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.excessiveRain.day1Risk !== "NONE") {
        throw new Error(`day1Risk expected NONE, got ${out.excessiveRain.day1Risk}`);
      }
      // WR-03: "NONE" alone does not distinguish the guard path from the crash path — the
      // pre-fix code reached this same value by throwing on features[0].properties and
      // having the catch swallow it, so this scenario reported PASS on crashing code.
      forbidLog("TypeError", "day1 resolved to NONE via an exception, not via the per-feature guard");
      forbidLog("fetch/parse/evaluate failed", "day1 resolved to NONE via the catch-all, not via the per-feature guard");
      // WR-03: every assertion above is negative, so all of them are satisfied just as
      // well by the ERO product not existing — disabling the whole ERO loop left this
      // scenario green. This positive control, run against the same helper and the same
      // location so nothing else changes, proves the loop that rejected the malformed
      // feature is the same live loop that resolves a good one.
      installFetch(helper, [[ERO_URLS[1], freshFetch(ERO_SLGT_BODY)]]);
      turfStub.pointInPolygon = () => true;
      let control;
      try {
        control = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      if (control.excessiveRain.day1Risk !== "SLGT") {
        throw new Error(`control: a well-formed ERO body resolved to ${control.excessiveRain.day1Risk}, not SLGT — the ERO loop is not running, so the rejection above proved nothing`);
      }
    }
  },
  {
    // CR-01: the exact shape that made the crash path indistinguishable from the guard
    // path — a leading feature with no `properties` followed by a real MDT polygon
    // containing the user. The tier is already resolved by the time the bad feature is
    // touched, so it must survive; reporting NONE here is a false negative.
    name: "ero-leading-bad-feature-preserves-risk",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, [
        [ERO_URLS[1], freshFetch(LEADING_BAD_FEATURE_BODY)]
      ]);
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(out);
        if (out.excessiveRain.day1Risk !== "MDT") {
          throw new Error(`day1Risk expected MDT, got ${out.excessiveRain.day1Risk} — a property-less leading feature discarded a real risk`);
        }
        if (out.excessiveRain.day1ValidTime !== "2026-08-19T18:00:00Z") {
          throw new Error(`day1ValidTime expected the winning polygon's window, got ${JSON.stringify(out.excessiveRain.day1ValidTime)}`);
        }
        forbidLog("TypeError", "the MDT tier survived by luck, not by guarding the dereference");
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // WR-07: the winning-polygon scan must not abort on the first same-tier polygon that
    // carries no usable valid_time. Both polygons here are the winning tier and both
    // contain the user; only the second has a window.
    name: "ero-same-tier-null-valid-time-falls-through",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, [[ERO_URLS[1], freshFetch(ERO_SAME_TIER_NULL_VALID_TIME_BODY)]]);
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.excessiveRain.day1Risk !== "SLGT") {
        throw new Error(`day1Risk expected SLGT, got ${out.excessiveRain.day1Risk}`);
      }
      if (out.excessiveRain.day1ValidTime !== "2026-08-20T00:00:00Z") {
        throw new Error(
          `day1ValidTime expected the second winning polygon's window, got ${JSON.stringify(out.excessiveRain.day1ValidTime)} — ` +
          "the scan aborted on the first polygon's null valid_time instead of trying the next"
        );
      }
    }
  },
  {
    // CR-03: an ERO day that hard-fails (non-2xx / network error, no usable cache
    // entry) resolves to "NONE". That reading must never be presentable as a
    // confident all-clear — the payload has to carry the degrade signal the
    // frontend renders as ⚠ Stale.
    name: "ero-hard-fail-is-flagged",
    run: async (helper) => {
      // WR-02: `installFetch(helper, [])` routed EVERY url to the hard-failure shape, so
      // every SPC categorical, hazard, CIG and fire-weather layer set anyStale long before
      // the ERO loop ran and the closing assertion said nothing about the ERO. Deleting
      // the ERO's own `if (fetchResult.stale || fetchResult.failed) anyStale = true` left
      // the suite at 8 passed, 0 failed; so did disabling the ERO loop entirely. Every
      // non-ERO layer now succeeds with an empty collection, so anyStale can only
      // originate in the ERO loop — the ERO URLs are ArcGIS query URLs and carry no
      // ".lyr.geojson", so they alone fall through to the hard-failure default.
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, [[".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]]);
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      assertPayloadIntact(out);
      for (let d = 1; d <= 5; d++) {
        if (out.excessiveRain[`day${d}Risk`] !== "NONE") {
          throw new Error(`day${d}Risk expected NONE, got ${out.excessiveRain[`day${d}Risk`]}`);
        }
      }
      if (out._stale !== true) {
        throw new Error("a hard-failed ERO fetch produced an unflagged no-risk payload (_stale !== true)");
      }
      // WR-04: a hard failure has no cached reading to age, so the payload must say so
      // rather than claim the data is as fresh as the moment of assembly.
      if (out._staleAsOf !== null) {
        throw new Error(`a hard failure with nothing cached reported _staleAsOf ${JSON.stringify(out._staleAsOf)}, expected null`);
      }

      // Negative control: identical routing, ERO toggle off. If _stale is still set, the
      // staleness came from somewhere other than the ERO and the assertion above is
      // vacuous no matter what it says.
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: false };
      installFetch(helper, [[".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]]);
      const off = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: false });
      assertPayloadIntact(off);
      if (off._stale) {
        throw new Error("staleness came from a non-ERO layer — the ERO assertion above is vacuous");
      }
    }
  },
  {
    name: "ero-wellformed-slgt",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, [
        [ERO_URLS[1], freshFetch(ERO_SLGT_BODY)]
      ]);
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
        assertPayloadIntact(out);
        if (out.excessiveRain.day1Risk !== "SLGT") {
          throw new Error(`day1Risk expected SLGT, got ${out.excessiveRain.day1Risk}`);
        }
        if (out.excessiveRain.day1Text !== PRODUCT_REGISTRY.excessiveRain.tierToText.SLGT) {
          throw new Error(`day1Text mismatch: ${out.excessiveRain.day1Text}`);
        }
        if (out.excessiveRain.day1Color !== PRODUCT_REGISTRY.excessiveRain.tierToColor.SLGT) {
          throw new Error(`day1Color mismatch: ${out.excessiveRain.day1Color}`);
        }
        if (out.excessiveRain.day1ValidTime !== "2026-08-19T12:00:00Z") {
          throw new Error(`day1ValidTime mismatch: ${out.excessiveRain.day1ValidTime}`);
        }
        for (let d = 2; d <= 5; d++) {
          if (out.excessiveRain[`day${d}Risk`] !== "NONE") {
            throw new Error(`day${d}Risk expected NONE, got ${out.excessiveRain[`day${d}Risk`]}`);
          }
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    name: "ero-toggle-off",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: false };
      const fetchFn = installFetch(helper, []);
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
      assertPayloadIntact(out);
      for (let d = 1; d <= 5; d++) {
        if (out.excessiveRain[`day${d}Risk`] !== "NONE") {
          throw new Error(`day${d}Risk expected NONE, got ${out.excessiveRain[`day${d}Risk`]}`);
        }
      }
      const eroUrlValues = Object.values(ERO_URLS);
      if (fetchFn.calls.some((url) => eroUrlValues.includes(url))) {
        throw new Error("fetchGeoJsonCached was called with an ERO URL while the toggle was off");
      }
    }
  },
  {
    // D-10: WSSI's headline well-formed case. Days 2-3 are routed to an empty collection
    // (via wssiRoutes) rather than left unrouted, so their NONE reading proves the
    // empty-routed days are unaffected by day 1's real body, not that the harness never
    // reached them at all.
    name: "wssi-wellformed-minor",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showWinterImpact: true, showExcessiveRain: false };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        installHttp(helper, wssiRoutes(() => httpResponse({ body: WSSI_MINOR_BODY, etag: "wssi-v1" })));
        const out = await helper.getSpcOutlook(
          PROBE_LAT, PROBE_LON, false, { showWinterImpact: true, showExcessiveRain: false }
        );
        assertPayloadIntact(out);
        if (out.winterImpact.day1Risk !== "MINOR") {
          throw new Error(`day1Risk expected MINOR, got ${out.winterImpact.day1Risk}`);
        }
        if (out.winterImpact.day1Text !== "Minor") {
          throw new Error(`day1Text expected Minor, got ${out.winterImpact.day1Text}`);
        }
        if (out.winterImpact.day1Color !== "faf5a3") {
          throw new Error(`day1Color expected faf5a3, got ${out.winterImpact.day1Color}`);
        }
        if (out.winterImpact.day1ValidTime !== "2026-08-19T12:00:00Z") {
          throw new Error(`day1ValidTime mismatch: ${JSON.stringify(out.winterImpact.day1ValidTime)}`);
        }
        if (out.winterImpact.day2Risk !== "NONE" || out.winterImpact.day3Risk !== "NONE") {
          throw new Error(
            `day2/day3Risk expected NONE, got ${out.winterImpact.day2Risk}/${out.winterImpact.day3Risk} ` +
            "— the empty-routed days were affected by day 1's body"
          );
        }
        // D-10 mutation proof (Task 3, mutation 5): the WSSI extension of getDom's no-risk
        // gate lives in a different file (MMM-SPCOutlook.js) from the payload logic above,
        // so a payload-only assertion cannot catch its deletion. Render the payload and
        // prove a genuine MINOR day does not short-circuit to the plain no-risk line.
        const frontend = loadFrontendModule();
        const config = {
          lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
          proximityWeighting: false, showExcessiveRain: false, showWinterImpact: true
        };
        const rendered = renderDom(frontend, { config, spcrisk: out });
        if (rendered === "No Severe Weather Risk") {
          throw new Error(
            "a genuine MINOR winter impact with no convective risk short-circuited to " +
            "\"No Severe Weather Risk\" — the WSSI term of the no-risk gate is unguarded"
          );
        }
        if (!rendered.includes("Winter Impact")) {
          throw new Error(`a genuine MINOR winter impact rendered with no Winter Impact row: ${rendered}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // WSSI-02: the direct guard for the registry's case fold. WPC's prose documentation
    // writes tier names in mixed case even though the live renderer's `impact` field is
    // always ALL-CAPS; this must fail if the registry's toValue stops folding case.
    name: "wssi-case-fold-mismatch-still-resolves",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showWinterImpact: true, showExcessiveRain: false };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        installHttp(helper, wssiRoutes(() => httpResponse({ body: WSSI_MIXED_CASE_BODY, etag: "wssi-v1" })));
        const out = await helper.getSpcOutlook(
          PROBE_LAT, PROBE_LON, false, { showWinterImpact: true, showExcessiveRain: false }
        );
        assertPayloadIntact(out);
        if (out.winterImpact.day1Risk !== "MINOR") {
          throw new Error(
            `WSSI-02: mixed-case "Minor" did not fold to MINOR, got ${out.winterImpact.day1Risk}`
          );
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // D-09 AMENDED: WINTER WEATHER AREA is a deliberate exclusion below the MINOR floor,
    // not a degrade — it must render nothing at both the payload layer (day1Risk) and the
    // render layer (no "Winter Impact" row), and it must never be flagged stale.
    name: "wssi-winter-weather-area-renders-nothing",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showWinterImpact: true, showExcessiveRain: false };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        installHttp(helper, wssiRoutes(() => httpResponse({ body: WSSI_WWA_BODY, etag: "wssi-v1" })));
        out = await helper.getSpcOutlook(
          PROBE_LAT, PROBE_LON, false, { showWinterImpact: true, showExcessiveRain: false }
        );
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.winterImpact.day1Risk !== "NONE") {
        throw new Error(
          `D-09 AMENDED: WINTER WEATHER AREA must render nothing, got day1Risk ${out.winterImpact.day1Risk}`
        );
      }
      if (out._stale === true) {
        throw new Error("D-09 AMENDED's floor is a deliberate exclusion, not a degrade — _stale must not be true");
      }
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: true
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (rendered.includes("Winter Impact")) {
        throw new Error(`WINTER WEATHER AREA rendered a Winter Impact row: ${rendered}`);
      }
    }
  },
  {
    // WSSI-03: the structural proof that substitutes for the deferred in-season live
    // check. Off-season, the live WSSI layer answers with a literal zero-feature
    // FeatureCollection on every day, and that must resolve to a clean, unflagged
    // all-clear at both the payload and render layers, never { error } and never stale.
    name: "wssi-zero-features-out-of-season",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showWinterImpact: true, showExcessiveRain: false };
      installHttp(helper, wssiRoutes(() => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "wssi-empty" })));
      const out = await helper.getSpcOutlook(
        PROBE_LAT, PROBE_LON, false, { showWinterImpact: true, showExcessiveRain: false }
      );
      assertPayloadIntact(out);
      for (let d = 1; d <= 3; d++) {
        if (out.winterImpact[`day${d}Risk`] !== "NONE") {
          throw new Error(`WSSI-03: day${d}Risk expected NONE out of season, got ${out.winterImpact[`day${d}Risk`]}`);
        }
      }
      if (out.error !== undefined) {
        throw new Error(`WSSI-03: an all-empty off-season response collapsed the payload to { error }: ${out.error}`);
      }
      if (out._stale === true) {
        throw new Error("WSSI-03: a well-formed zero-feature off-season response must not be flagged stale");
      }
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: true
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (rendered.includes("Winter Impact")) {
        throw new Error(`an out-of-season zero-feature response rendered a Winter Impact row: ${rendered}`);
      }
    }
  },
  {
    // Phase 14 D-05: the toggle off must still emit the full zero-valued winterImpact
    // block, and the WSSI day 1 URL must never be requested while the toggle is off.
    name: "wssi-toggle-off",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showWinterImpact: false, showExcessiveRain: false };
      const fetchFn = installHttp(helper, wssiRoutes(() => httpResponse({ body: WSSI_MINOR_BODY, etag: "wssi-v1" })));
      const out = await helper.getSpcOutlook(
        PROBE_LAT, PROBE_LON, false, { showWinterImpact: false, showExcessiveRain: false }
      );
      assertPayloadIntact(out);
      for (let d = 1; d <= 3; d++) {
        if (out.winterImpact[`day${d}Risk`] !== "NONE") {
          throw new Error(`D-05: day${d}Risk expected NONE with the toggle off, got ${out.winterImpact[`day${d}Risk`]}`);
        }
        if (out.winterImpact[`day${d}Text`] !== "None") {
          throw new Error(`D-05: day${d}Text expected "None" with the toggle off, got ${out.winterImpact[`day${d}Text`]}`);
        }
      }
      const wssiKeyCount = Object.keys(out.winterImpact).length;
      if (wssiKeyCount !== 12) {
        throw new Error(`D-05: winterImpact toggle-off block has ${wssiKeyCount} keys, expected 12 (3 days x 4 fields)`);
      }
      if (fetchFn.calls.some((call) => call.url === WSSI_URLS[1])) {
        throw new Error("the WSSI day 1 URL was requested while the toggle was off");
      }
    }
  },
  {
    // CR-03 for WSSI: a day-1 hard fail (non-2xx, no usable cache entry) must resolve to
    // NONE but never be presentable as a confident all-clear — the payload must carry the
    // degrade signal, and the degrade must be diagnosable from the log (CR-01's lesson:
    // a degraded winter read must never be indistinguishable from a genuine no-impact day).
    name: "wssi-hard-fail-is-flagged",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showWinterImpact: true, showExcessiveRain: false };
      installHttp(helper, wssiRoutes(() => httpResponse({ status: 503, text: "service unavailable" })));
      const out = await helper.getSpcOutlook(
        PROBE_LAT, PROBE_LON, false, { showWinterImpact: true, showExcessiveRain: false }
      );
      assertPayloadIntact(out);
      if (out.winterImpact.day1Risk !== "NONE") {
        throw new Error(`a hard-failed WSSI day 1 fetch produced a tier out of nothing: ${out.winterImpact.day1Risk}`);
      }
      if (out._stale !== true) {
        throw new Error("a hard-failed WSSI fetch produced an unflagged no-risk payload (_stale !== true)");
      }
      // The real fetchGeoJsonCached names the failing URL, and WSSI_URLS[1] is derived
      // from the registry's own winterImpact day-1 buildUrl — the same URL-as-identifier
      // pattern ero-304-with-no-cache-entry-is-a-hard-failure already uses to name a day.
      requireLog(
        ["unrecoverable fetch failure for", WSSI_URLS[1]],
        "a hard-failed WSSI day 1 fetch produced no diagnostic naming the winterImpact day-1 URL"
      );
    }
  },
  {
    // WR-09: the phase's stated CR-02/WR-06 guarantee — "a WPC hiccup during an active
    // HIGH must not blank the display" — is delivered by rejectBody's stale fallback
    // inside the real fetchGeoJsonCached, which until now no scenario executed. This
    // drives the real function through the _fetch seam: warm the cache from a genuine
    // HTTP 200, then serve the documented ArcGIS failure (an error object inside a 200)
    // under a different ETag so the cache-hit short-circuit cannot mask the test.
    name: "ero-rejected-body-serves-last-known-good",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        installHttp(helper, eroHttpRoutes(() => httpResponse({ body: ERO_SLGT_BODY, etag: "ero-v1" })));
        const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(warm);
        if (warm.excessiveRain.day1Risk !== "SLGT") {
          throw new Error(`warm-up: a well-formed ERO body over real HTTP resolved to ${warm.excessiveRain.day1Risk}, not SLGT`);
        }
        if (warm._stale) {
          throw new Error("warm-up: an all-200 poll was flagged stale, so the degrade assertion below would be vacuous");
        }
        resetLogs();

        installHttp(helper, eroHttpRoutes(() => httpResponse({ body: ARCGIS_ERROR_BODY, etag: "ero-v2" })));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(out);
        if (out.excessiveRain.day1Risk !== "SLGT") {
          throw new Error(`a WPC hiccup blanked an active tier: expected the cached SLGT, got ${out.excessiveRain.day1Risk}`);
        }
        if (out._stale !== true) {
          throw new Error("last-known-good was served without the stale flag");
        }
        requireLog(
          ["rejected an unusable response body for", ERO_URLS[1], "not a usable body"],
          "the degrade was not diagnosable from the log"
        );
        const entry = helper._geoJsonCache.get(ERO_URLS[1]);
        if (!entry || entry.result.value !== 2) {
          throw new Error(`the rejected body overwrote the cached reading: ${JSON.stringify(entry && entry.result)}`);
        }
        // WR-04: the badge has to age the DATA, not the payload object. _staleAsOf must be
        // the timestamp of the cached reading being served, not the moment of assembly.
        if (out._staleAsOf !== entry.timestamp) {
          throw new Error(
            `_staleAsOf is not the age of the served reading: got ${out._staleAsOf}, cached reading is from ${entry.timestamp} ` +
            `(off by ${out._staleAsOf - entry.timestamp} ms — stamping assembly time makes the badge read "a few seconds ago" forever)`
          );
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // WR-09: parseBody's contained JSON.parse. SPC and WPC both answer with HTML error
    // pages under a 200 during an outage; an uncontained JSON.parse there reaches
    // getSpcOutlook's shared catch and nulls the entire payload.
    name: "ero-unparseable-body-serves-last-known-good",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        installHttp(helper, eroHttpRoutes(() => httpResponse({ body: ERO_SLGT_BODY, etag: "ero-v1" })));
        await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        resetLogs();

        installHttp(helper, eroHttpRoutes(() => httpResponse({
          text: "<html><body>503 Service Unavailable</body></html>",
          etag: "ero-v2"
        })));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(out);
        if (out.excessiveRain.day1Risk !== "SLGT") {
          throw new Error(`an HTML error page blanked an active tier: expected the cached SLGT, got ${out.excessiveRain.day1Risk}`);
        }
        if (out._stale !== true) {
          throw new Error("last-known-good was served without the stale flag");
        }
        requireLog(
          ["rejected an unusable response body for", ERO_URLS[1], "unparseable body"],
          "an unparseable body produced no diagnostic naming the URL"
        );
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // CR-02: the body read sat outside fetchGeoJsonCached's error containment, so a
    // mid-body reset/abort — exactly what the 15 s AbortSignal produces when headers
    // arrive and the body then stalls — escaped every per-layer guard. Two consequences,
    // both asserted here: a still-fresh cached reading was discarded instead of served,
    // and for the SPC layers (which have no per-layer try) the throw reached
    // getSpcOutlook's shared catch and collapsed the whole payload to { error }.
    name: "body-read-abort-is-contained-not-a-payload-collapse",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        // Part 1 — a cached reading exists, so a body-read failure must take the same
        // stale-fallback path a failed connect takes, not blank the tier.
        installHttp(helper, eroHttpRoutes(() => httpResponse({ body: ERO_SLGT_BODY, etag: "ero-v1" })));
        const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        if (warm.excessiveRain.day1Risk !== "SLGT" || warm._stale) {
          throw new Error(`warm-up did not establish a clean cached SLGT: ${warm.excessiveRain.day1Risk} / _stale ${warm._stale}`);
        }
        resetLogs();

        installHttp(helper, eroHttpRoutes(() => httpBodyReadFailure({ etag: "ero-v2" })));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(out);
        if (out.excessiveRain.day1Risk !== "SLGT") {
          throw new Error(`a mid-body abort blanked an active tier: expected the cached SLGT, got ${out.excessiveRain.day1Risk}`);
        }
        if (out._stale !== true) {
          throw new Error("last-known-good was served after a body-read failure without the stale flag");
        }
        requireLog(
          ["stale fallback for", ERO_URLS[1]],
          "a body-read failure did not take the stale-fallback path the network-error branch owns"
        );

        // Part 2 — no cached reading, and the failing layer is the SPC day 1 categorical
        // one, which has no per-layer try. Pre-fix this returned { error } and every
        // other product went dark with it; assertPayloadIntact fails loudly on that.
        resetHelper(helper);
        resetLogs();
        helper._products = { showExcessiveRain: true };
        const day1Cat = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson";
        installHttp(helper, [
          [day1Cat, () => httpBodyReadFailure({ etag: "spc-v1" })],
          [".lyr.geojson", () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[1], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[2], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[3], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[4], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[5], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })]
        ]);
        const solo = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(solo);
        if (solo.day1.risk !== "NONE") {
          throw new Error(`the failing layer should resolve to NONE, got ${solo.day1.risk}`);
        }
        if (solo._stale !== true) {
          throw new Error("a body-read hard failure produced an unflagged no-risk payload (_stale !== true)");
        }
        requireLog(
          ["unrecoverable fetch failure for", day1Cat, "body read failed"],
          "a body-read hard failure produced no diagnostic naming the URL"
        );
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // WR-09 / WR-14: a proxy can answer 304 to a request that carried no If-None-Match.
    // Without the guard the entry.result dereference throws into getSpcOutlook's shared
    // catch and nulls the whole payload over one layer. No scenario could reach this
    // while fetchGeoJsonCached itself was the seam.
    name: "ero-304-with-no-cache-entry-is-a-hard-failure",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installHttp(helper, eroHttpRoutes(() => httpResponse({ status: 304, text: "" })));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      assertPayloadIntact(out);
      if (out.excessiveRain.day1Risk !== "NONE") {
        throw new Error(`a bodyless 304 with no cache entry produced a tier out of nothing: ${out.excessiveRain.day1Risk}`);
      }
      if (out._stale !== true) {
        throw new Error("an unusable 304 was presented as a confident reading (_stale !== true)");
      }
      requireLog(
        ["received 304 with no cache entry for", ERO_URLS[1]],
        "the 304-with-no-entry guard did not report itself"
      );
      if (helper._geoJsonCache.has(ERO_URLS[1])) {
        throw new Error("an unusable 304 was written to _geoJsonCache");
      }
    }
  },
  {
    // WR-08: one truncated ring in one layer must not take the whole payload down.
    // extractPolygons handed coordinates straight to turf, which throws, and the throw
    // escaped every per-layer guard into getSpcOutlook's shared catch — days 1-8, fire
    // weather and the ERO disappeared together. The good polygon in the same layer must
    // still resolve, and because a dropped polygon is a potential false negative rather
    // than a clean read, the payload must carry the degrade signal.
    name: "spc-truncated-ring-degrades-one-layer-not-the-payload",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: false };
      // Every other layer succeeds with an empty collection, so anyStale cannot come
      // from a hard-failed fetch — the only thing that can raise it here is the dropped
      // polygon this scenario is about (WR-02's vacuity trap, avoided deliberately).
      installFetch(helper, [
        ["https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson", freshFetch(TRUNCATED_RING_BODY)],
        [".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]
      ]);
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: false });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.day1.risk !== "SLGT") {
        throw new Error(`a truncated ring discarded the usable polygon in its own layer: expected SLGT, got ${out.day1.risk}`);
      }
      if (out._stale !== true) {
        throw new Error("a layer that silently lost a polygon was presented as a confident reading (_stale !== true)");
      }
      requireLog(
        ["unusable geometry", "day1otlk_cat.lyr.geojson"],
        "a dropped polygon produced no diagnostic naming the layer that degraded"
      );
    }
  },
  {
    // WR-11: the Day 4-8 SIGN lists now carry numeric values and sigComparator honours
    // its accumulator. Nothing about the user-visible answer may move: SIGN present and
    // containing the user promotes 45% from ENH to MDT, SIGN absent leaves it ENH.
    name: "spc-day4-sign-promotes-45pct-to-mdt",
    run: async (helper) => {
      const runDay4 = async (body) => {
        resetHelper(helper);
        resetLogs();
        helper._products = { showExcessiveRain: false };
        installFetch(helper, [
          ["day4prob.lyr.geojson", freshFetch(body)],
          [".lyr.geojson", freshFetch(EMPTY_FEATURE_COLLECTION)]
        ]);
        const originalPointInPolygon = turfStub.pointInPolygon;
        turfStub.pointInPolygon = () => true;
        try {
          return await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, true, { showExcessiveRain: false });
        } finally {
          turfStub.pointInPolygon = originalPointInPolygon;
        }
      };

      const withSign = await runDay4(DAY4_45PCT_SIGN_BODY);
      assertPayloadIntact(withSign);
      if (withSign.day4.probRisk !== 0.45) {
        throw new Error(`day4 probRisk expected 0.45, got ${withSign.day4.probRisk}`);
      }
      if (withSign.day4.sign !== true) {
        throw new Error(`a SIGN polygon containing the user did not set day4.sign (got ${JSON.stringify(withSign.day4.sign)})`);
      }
      if (withSign.day4.risk !== "MDT") {
        throw new Error(`45% with SIGN must promote to MDT, got ${withSign.day4.risk}`);
      }

      const withoutSign = await runDay4(DAY4_45PCT_NO_SIGN_BODY);
      if (withoutSign.day4.sign !== false) {
        throw new Error(`day4.sign is true with no SIGN polygon in the layer (got ${JSON.stringify(withoutSign.day4.sign)}) — a false positive on the extended outlook`);
      }
      if (withoutSign.day4.risk !== "ENH") {
        throw new Error(`45% without SIGN must stay ENH, got ${withoutSign.day4.risk}`);
      }
    }
  },
  {
    // CR-01: the regression that survived two review rounds because the suite asserted on
    // the payload and stopped before the render. Every layer fails, so every value is
    // "NONE" — the same value a genuine all-clear produces — and getDom's no-risk
    // short-circuit used to win, putting "No Severe Weather Risk" on the wall during a
    // total NOAA/DNS/Wi-Fi outage with no visible difference from a quiet day. The
    // payload half of this guarantee is asserted by ero-hard-fail-is-flagged and was
    // already true then; only the render tells you whether the user can see it.
    name: "frontend-total-outage-still-shows-the-outage",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, []);   // every layer hard-fails
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
      assertPayloadIntact(out);
      if (out._stale !== true) {
        throw new Error("precondition: a total outage produced an unflagged payload, so the render assertion below proves nothing");
      }

      const frontend = loadFrontendModule();
      const config = { lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
                       proximityWeighting: false, showExcessiveRain: true };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (rendered === "No Severe Weather Risk") {
        throw new Error("a total outage rendered as a confident all-clear — the degrade signal never reached the screen");
      }
      if (!rendered.includes("Stale")) {
        throw new Error(`a degraded payload rendered with no stale badge: ${rendered}`);
      }

      // Control: a genuine all-clear must still short-circuit to the plain line, or the
      // assertion above is satisfied by the gate simply never firing.
      const allClear = Object.assign({}, out);
      delete allClear._stale;
      delete allClear._staleAsOf;
      const cleanRender = renderDom(frontend, { config, spcrisk: allClear });
      if (cleanRender !== "No Severe Weather Risk") {
        throw new Error(`control: a genuine all-clear no longer renders the no-risk line, it rendered: ${cleanRender}`);
      }
    }
  },
  {
    name: "spc-wellformed-baseline",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: false };
      installFetch(helper, [
        ["https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson", freshFetch(SPC_SLGT_BODY)],
        ["https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson", freshFetch(FIRE_CRIT_BODY)]
      ]);
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
        assertPayloadIntact(out);
        const day1Str = JSON.stringify(out.day1);
        const fireWeatherStr = JSON.stringify(out.fireWeather);
        if (day1Str !== GOLDEN_DAY1) {
          throw new Error(`day1 diverged from golden snapshot: ${day1Str}`);
        }
        if (fireWeatherStr !== GOLDEN_FIRE_WEATHER) {
          throw new Error(`fireWeather diverged from golden snapshot: ${fireWeatherStr}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // D-10 / RESEARCH.md Pitfall 3: pins togeojson's description-object shape as
    // executable ground truth before any MPD/SPC-MD code depends on it, and proves
    // makeKmzBuffer's KMZ round-trips through the real fetchBinBuffer -> adm-zip ->
    // xmldom -> togeojson chain. The description assertion is the point of the
    // scenario — a future togeojson upgrade that flattens description back to a plain
    // string fails here with a clear message rather than silently turning every MPD
    // hazard type into D-06's "no hazard type" parse-miss branch.
    name: "harness-real-kml-deps-round-trip",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      // A non-.kml entry deliberately comes first: MPD's real KMZ member is a fixed
      // doc.kml, not the first entry in the archive, so a fixture that only ever put
      // the .kml entry first could not prove entry selection scans past it.
      const kmzBuffer = makeKmzBuffer({
        "style.xsl": "<xsl/>",
        "doc.kml": MPD_KML_DOC
      });
      const url = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1118_final.kmz";
      installHttp(helper, [[url, () => httpResponse({ buffer: kmzBuffer, etag: "mpd-v1" })]]);

      const fetched = await helper.fetchBinBuffer(url);
      if (!Buffer.isBuffer(fetched)) {
        throw new Error("fetchBinBuffer did not return a Buffer");
      }
      if (fetched.length !== kmzBuffer.length) {
        throw new Error(`fetchBinBuffer returned ${fetched.length} bytes, expected ${kmzBuffer.length}`);
      }

      // extractSoleKmlEntry does not exist in node_helper.js yet (it lands in a later
      // plan) — this scenario proves the KMZ layer itself, opening the archive with the
      // same real adm-zip module-stubs.js resolved.
      const RealZip = require("adm-zip");
      const zip = new RealZip(fetched, { noSort: true });
      const entryNames = zip.getEntries().map((e) => e.entryName);
      if (entryNames[0] === "doc.kml") {
        throw new Error("fixture ordering broken: doc.kml is first, so entry-scan coverage is vacuous");
      }
      if (!entryNames.includes("doc.kml")) {
        throw new Error(`KMZ round-trip lost the doc.kml entry: ${JSON.stringify(entryNames)}`);
      }
      const kmlText = zip.readFile(zip.getEntry("doc.kml")).toString();

      const gj = helper.kmlToGeoJson(kmlText);
      if (!gj || !Array.isArray(gj.features) || gj.features.length !== 1) {
        throw new Error(`kmlToGeoJson did not return one feature: ${JSON.stringify(gj)}`);
      }
      const feature = gj.features[0];
      const description = feature.properties && feature.properties.description;
      if (typeof description !== "object" || description === null) {
        throw new Error(
          `RESEARCH.md Pitfall 3 regressed: expected properties.description to be an object, got ${typeof description} ` +
          `(${JSON.stringify(description)})`
        );
      }
      if (typeof description.value !== "string" || !description.value.includes("<td>MPDType</td>")) {
        throw new Error(`description.value did not contain the MPDType row: ${JSON.stringify(description)}`);
      }
    }
  },
  {
    // Pitfall 1's regression guard. SPC's own ActiveMD.kmz serves member hrefs as
    // http://, not https:// — the old MD_HOST_PREFIX = "https://www.spc.noaa.gov/"
    // startsWith check refused every one of them, so getMesoscaleDiscussion reported
    // zero active MDs on every single poll in production, even with MDs genuinely
    // active. normalizeAdvisoryUrl replaced it with a scheme-normalizing, hostname-exact
    // allowlist; this scenario proves the http:// href it actually serves resolves to a
    // fetched, contained SPC MD through the real allowlist, discovery and KMZ chain.
    name: "spc-md-http-href-not-rejected-by-allowlist",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: true, showMPD: false, showExcessiveRain: false, showWinterImpact: false };
      const memberUrl = "https://www.spc.noaa.gov/products/md/MD2108.kmz";
      const indexBuffer = kmzOf({
        "activemd.kml": activeIndexKml(["http://www.spc.noaa.gov/products/md/MD2108.kmz"])
      });
      const memberBuffer = kmzOf({ "MD2108.kml": mdKml("MD 2108") });
      installHttp(helper, advisoryRoutes({
        index: { url: PRODUCT_REGISTRY.spcMD.discoveryUrl, buffer: indexBuffer },
        members: [{ url: memberUrl, buffer: memberBuffer }]
      }));
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: true, showMPD: false, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.spcMD.length !== 1) {
        throw new Error(
          `Pitfall 1 regression: expected 1 SPC MD entry from an http:// href, got ` +
          `${out.advisories.spcMD.length}. Against the pre-fix MD_HOST_PREFIX startsWith(...) ` +
          "check this scenario would report zero entries, which was the live production " +
          "behaviour on every poll."
        );
      }
      if (out.advisories.spcMD[0].label !== "SPC MD 2108") {
        throw new Error(`spcMD entry label mismatch: expected "SPC MD 2108", got ${JSON.stringify(out.advisories.spcMD[0].label)}`);
      }
      forbidLog("refusing off-host", "an http:// href that matches the allowed host was refused by the allowlist");
    }
  },
  {
    // The control for the scenario above: proves the Pitfall 1 fix loosened the scheme
    // check without loosening the host check. An off-host href in the same index must
    // still be refused and diagnosable from the log, and — since the fetch happens only
    // after the allowlist decision — it must never reach the network at all.
    name: "spc-md-off-host-href-still-refused",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: true, showMPD: false, showExcessiveRain: false, showWinterImpact: false };
      const legitUrl = "https://www.spc.noaa.gov/products/md/MD2108.kmz";
      const indexBuffer = kmzOf({
        "activemd.kml": activeIndexKml([
          "http://www.spc.noaa.gov/products/md/MD2108.kmz",
          "http://evil.test/x.kmz"
        ])
      });
      const memberBuffer = kmzOf({ "MD2108.kml": mdKml("MD 2108") });
      const fetchFn = installHttp(helper, advisoryRoutes({
        index: { url: PRODUCT_REGISTRY.spcMD.discoveryUrl, buffer: indexBuffer },
        members: [{ url: legitUrl, buffer: memberBuffer }]
      }));
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: true, showMPD: false, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.spcMD.length !== 1) {
        throw new Error(`expected exactly 1 SPC MD entry (the legit host), got ${out.advisories.spcMD.length}`);
      }
      if (fetchFn.calls.some((call) => call.url.includes("evil.test"))) {
        throw new Error(`the off-host href reached the network: ${JSON.stringify(fetchFn.calls.map((c) => c.url))}`);
      }
      requireLog(
        ["refusing off-host NetworkLink href", "evil.test"],
        "the off-host href was refused with no diagnostic naming it"
      );
    }
  },
  {
    // T-15-36 / RESEARCH.md Pitfall 5: drives the real frontend socketNotificationReceived
    // through an in-order, out-of-order, then higher-order sequence at the new payload[1]
    // index. With the old payload[2] read against this two-element payload, `seq` is
    // undefined, `typeof seq === "number"` is false, and the discard guard fails open —
    // silently becoming a no-op with no error, no log, and no other failing test.
    name: "frontend-seq-discard-survives-socket-index-migration",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const ctx = Object.create(frontend);
      let updateDomCalls = 0;
      ctx.updateDom = () => { updateDomCalls++; };
      const outlookA = { marker: "A" };
      const outlookB = { marker: "B" };
      const outlookC = { marker: "C" };

      frontend.socketNotificationReceived.call(ctx, "SPC_DATA_RESULT", [outlookA, 5]);
      if (ctx.spcrisk !== outlookA || updateDomCalls !== 1) {
        throw new Error(
          `the first in-order payload was not accepted: spcrisk=${JSON.stringify(ctx.spcrisk)}, ` +
          `updateDomCalls=${updateDomCalls}`
        );
      }

      frontend.socketNotificationReceived.call(ctx, "SPC_DATA_RESULT", [outlookB, 3]);
      if (ctx.spcrisk !== outlookA || updateDomCalls !== 1) {
        throw new Error(
          "CR-03 at the new socket index: an out-of-order payload (seq 3 after seq 5) was " +
          `not discarded — spcrisk=${JSON.stringify(ctx.spcrisk)}, updateDomCalls=${updateDomCalls}`
        );
      }

      frontend.socketNotificationReceived.call(ctx, "SPC_DATA_RESULT", [outlookC, 6]);
      if (ctx.spcrisk !== outlookC || updateDomCalls !== 2) {
        throw new Error(
          `a genuinely newer payload (seq 6) was not accepted after a discard: ` +
          `spcrisk=${JSON.stringify(ctx.spcrisk)}, updateDomCalls=${updateDomCalls}`
        );
      }
    }
  },
  {
    // MPD-01: before Phase 15 the no-risk short-circuit gate had no advisory term at all,
    // so a location inside an active discussion with every other value at its no-risk
    // default rendered the literal "No Severe Weather Risk" and the advisory never
    // displayed. Dormant for SPC MDs (which usually accompany convective risk), fatal for
    // MPD-01, since a WPC MPD routinely fires with zero SPC convective risk.
    name: "frontend-advisory-only-is-not-an-all-clear",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false, showMPD: true
      };

      const withAdvisory = noRiskPayloadWithAdvisory({
        spcMD: [],
        mpd: [{ label: "WPC MPD 1118", hazardType: "Heavy rainfall, Flash flooding possible" }]
      });
      const rendered = renderDom(frontend, { config, spcrisk: withAdvisory });
      if (rendered === "No Severe Weather Risk") {
        throw new Error(
          "MPD-01: an advisory-only payload (every day/fireWeather/ERO/WSSI value no-risk, " +
          "no _stale) short-circuited to the plain no-risk line — before Phase 15 the gate had " +
          "no advisory term at all, so this rendered as a confident all-clear while the user " +
          "was inside an active discussion."
        );
      }
      if (!rendered.includes("WPC MPD 1118")) {
        throw new Error(`an advisory-only payload rendered with no MPD label: ${rendered}`);
      }

      // Control: the same shape with empty advisory arrays must still short-circuit, or the
      // positive assertion above is satisfied by the gate simply never firing.
      const noAdvisory = noRiskPayloadWithAdvisory({ spcMD: [], mpd: [] });
      const controlRendered = renderDom(frontend, { config, spcrisk: noAdvisory });
      if (controlRendered !== "No Severe Weather Risk") {
        throw new Error(`control: a genuine all-clear with no advisories no longer renders the plain no-risk line, it rendered: ${controlRendered}`);
      }
    }
  },
  {
    // MPD-04, the phase's headline requirement and this plan's critical-context note:
    // WPC's live listing sorts alphabetically, so a prior-year straggler with a HIGHER
    // number (MPD_1281) can sort after the current season's files (MPD_1118, MPD_1119) —
    // live-reproduced on 2026-08-24, where MPD_1281_final.kmz sorted after MPD_1120. A
    // "highest number wins" selection would pick the stale one. All three listing entries
    // below carry FRESH Last-Modified timestamps, deliberately: they neutralise the 48h
    // pre-filter so only node_helper.js's per-candidate ValidEndTi gate can be what rejects
    // MPD_1281 — if the fixture instead gave MPD_1281 a stale listing timestamp, the
    // pre-filter alone would reject it and this scenario would prove nothing about the
    // authoritative gate (mutation 2 exists to catch exactly that vacuity trap).
    name: "mpd-year-boundary-does-not-select-stale-highest-number",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const now = Date.now();
      const stale = mpdWindowFields(now - 48 * 60 * 60 * 1000, { issueBeforeMs: 3 * 60 * 60 * 1000 });
      const activeLow = mpdWindowFields(now + 3 * 60 * 60 * 1000, { issueBeforeMs: 60 * 60 * 1000 });
      const activeHigh = mpdWindowFields(now + 4 * 60 * 60 * 1000, { issueBeforeMs: 30 * 60 * 1000 });
      // Fresh for ALL three candidates — see the comment above.
      const freshListingTime = new Date(now - 30 * 60 * 1000);

      const listingText = mpdListingHtml([
        { filename: "MPD_1281_final.kmz", lastModified: freshListingTime },
        { filename: "MPD_1118_final.kmz", lastModified: freshListingTime },
        { filename: "MPD_1119_final.kmz", lastModified: freshListingTime }
      ]);
      const staleUrl = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1281_final.kmz";
      const lowUrl = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1118_final.kmz";
      const highUrl = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1119_final.kmz";
      const staleBuffer = kmzOf({
        "doc.kml": mpdKml({
          number: "1281", issueTime: stale.issueTimeStr, validEndTi: stale.validEndTi,
          hazardType: "Heavy rainfall, Flash flooding possible"
        })
      });
      const lowBuffer = kmzOf({
        "doc.kml": mpdKml({
          number: "1118", issueTime: activeLow.issueTimeStr, validEndTi: activeLow.validEndTi,
          hazardType: "Heavy rainfall, Flash flooding possible"
        })
      });
      const highBuffer = kmzOf({
        "doc.kml": mpdKml({
          number: "1119", issueTime: activeHigh.issueTimeStr, validEndTi: activeHigh.validEndTi,
          hazardType: "Heavy snow"
        })
      });

      installHttp(helper, advisoryRoutes({
        listing: { url: PRODUCT_REGISTRY.mpd.discoveryUrl, text: listingText },
        members: [
          { url: staleUrl, buffer: staleBuffer },
          { url: lowUrl, buffer: lowBuffer },
          { url: highUrl, buffer: highBuffer }
        ]
      }));

      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.mpd.length !== 2) {
        throw new Error(
          `MPD-04: expected 2 active MPDs (1118, 1119) after the stale MPD_1281 was rejected, ` +
          `got ${out.advisories.mpd.length}: ${JSON.stringify(out.advisories.mpd)}`
        );
      }
      if (out.advisories.mpd.some((e) => e.label.includes("1281"))) {
        throw new Error(
          `MPD-04 regression: the stale highest-numbered MPD_1281 (expired ValidEndTi, ` +
          `fresh Last-Modified) was selected: ${JSON.stringify(out.advisories.mpd)}`
        );
      }
      if (!out.advisories.mpd.some((e) => e.label.includes("1118")) ||
          !out.advisories.mpd.some((e) => e.label.includes("1119"))) {
        throw new Error(`MPD-04: expected both 1118 and 1119 present, got ${JSON.stringify(out.advisories.mpd)}`);
      }
    }
  },
  {
    // MPD-02: "all concurrently active" MPDs must be returned, not just one. An assertion
    // of `>= 1` would pass against a most-recent-only implementation, so this asserts the
    // exact length. Also renders through the real getDom so MPD-02 is proven at the
    // display layer, not only in the payload — a display-layer regression (e.g. a cap
    // added inside the render loop) would not be caught by the payload assertion alone.
    name: "mpd-multiple-concurrent-all-shown",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const now = Date.now();
      const first = mpdWindowFields(now + 2 * 60 * 60 * 1000, { issueBeforeMs: 45 * 60 * 1000 });
      const second = mpdWindowFields(now + 5 * 60 * 60 * 1000, { issueBeforeMs: 90 * 60 * 1000 });
      const listingTime = new Date(now - 20 * 60 * 1000);

      const listingText = mpdListingHtml([
        { filename: "MPD_2201_final.kmz", lastModified: listingTime },
        { filename: "MPD_2202_final.kmz", lastModified: listingTime }
      ]);
      const url1 = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_2201_final.kmz";
      const url2 = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_2202_final.kmz";
      const buf1 = kmzOf({
        "doc.kml": mpdKml({
          number: "2201", issueTime: first.issueTimeStr, validEndTi: first.validEndTi,
          hazardType: "Heavy rainfall, Flash flooding possible"
        })
      });
      const buf2 = kmzOf({
        "doc.kml": mpdKml({
          number: "2202", issueTime: second.issueTimeStr, validEndTi: second.validEndTi,
          hazardType: "Excessive snowfall rates"
        })
      });

      installHttp(helper, advisoryRoutes({
        listing: { url: PRODUCT_REGISTRY.mpd.discoveryUrl, text: listingText },
        members: [
          { url: url1, buffer: buf1 },
          { url: url2, buffer: buf2 }
        ]
      }));

      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.mpd.length !== 2) {
        throw new Error(
          `MPD-02: "all concurrently active" requires both MPDs, got length ` +
          `${out.advisories.mpd.length}: ${JSON.stringify(out.advisories.mpd)}`
        );
      }

      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false, showMPD: true
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (!rendered.includes("WPC MPD 2201") || !rendered.includes("WPC MPD 2202")) {
        throw new Error(`MPD-02: expected both MPD labels rendered at the display layer, got: ${rendered}`);
      }
    }
  },
  {
    // MPD-03 / RESEARCH.md Pitfall 3: the hazard type must be read out of the description
    // CDATA through togeojson's object-wrapped shape. If node_helper.js instead reads
    // feature.properties.description as a plain string, mpdDescriptionHtml's typeof guard
    // returns null for every MPD, and hazardType is null here even though the fixture
    // structurally carries MPDType — a 100% parse-miss rate rather than a legitimate
    // absent field, exactly the failure this scenario is built to catch.
    name: "mpd-hazard-type-extracted-from-description",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const now = Date.now();
      const window = mpdWindowFields(now + 3 * 60 * 60 * 1000, { issueBeforeMs: 45 * 60 * 1000 });
      const hazardType = "Heavy rainfall, Flash flooding possible";
      const listingText = mpdListingHtml([
        { filename: "MPD_1305_final.kmz", lastModified: new Date(now - 15 * 60 * 1000) }
      ]);
      const url = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1305_final.kmz";
      const buffer = kmzOf({
        "doc.kml": mpdKml({
          number: "1305", issueTime: window.issueTimeStr, validEndTi: window.validEndTi, hazardType
        })
      });

      installHttp(helper, advisoryRoutes({
        listing: { url: PRODUCT_REGISTRY.mpd.discoveryUrl, text: listingText },
        members: [{ url, buffer }]
      }));

      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.mpd.length !== 1) {
        throw new Error(`expected exactly 1 MPD entry, got ${out.advisories.mpd.length}`);
      }
      if (out.advisories.mpd[0].hazardType !== hazardType) {
        throw new Error(
          `MPD-03 / Pitfall 3: expected hazardType ${JSON.stringify(hazardType)}, got ` +
          `${JSON.stringify(out.advisories.mpd[0].hazardType)} — check mpdDescriptionHtml's ` +
          "object-unwrap of togeojson's description shape"
        );
      }

      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false, showMPD: true
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (!rendered.includes(hazardType)) {
        throw new Error(`MPD-03: expected the hazard type rendered at the display layer, got: ${rendered}`);
      }
    }
  },
  {
    // D-06: an MPD with no parseable MPDType must still render — dropping it would repeat
    // the false-negative class WR-06 already fixed for SPC MD's "covers the location but
    // carries no name" case, and the user is inside an active precipitation discussion.
    // The fixture omits the MPDType row entirely (a genuine absent field, not an empty
    // cell), asserts the rendered row carries no " — " hazard-type suffix, and proves the
    // parse-miss diagnostic naming the candidate URL was actually logged.
    name: "mpd-missing-hazard-type-renders-without-it-logs-miss",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const now = Date.now();
      const window = mpdWindowFields(now + 3 * 60 * 60 * 1000, { issueBeforeMs: 45 * 60 * 1000 });
      const listingText = mpdListingHtml([
        { filename: "MPD_1409_final.kmz", lastModified: new Date(now - 15 * 60 * 1000) }
      ]);
      const url = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1409_final.kmz";
      const buffer = kmzOf({
        "doc.kml": mpdKml({
          number: "1409", issueTime: window.issueTimeStr, validEndTi: window.validEndTi, hazardType: null
        })
      });

      installHttp(helper, advisoryRoutes({
        listing: { url: PRODUCT_REGISTRY.mpd.discoveryUrl, text: listingText },
        members: [{ url, buffer }]
      }));

      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.mpd.length !== 1) {
        throw new Error(`expected exactly 1 MPD entry, got ${out.advisories.mpd.length}`);
      }
      if (out.advisories.mpd[0].hazardType !== null) {
        throw new Error(
          `D-06: expected hazardType null for an MPD with no MPDType row, got ` +
          `${JSON.stringify(out.advisories.mpd[0].hazardType)}`
        );
      }

      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false, showMPD: true
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (!rendered.includes("WPC MPD 1409 in effect.")) {
        throw new Error(`D-06: expected "WPC MPD 1409 in effect." with no hazard-type suffix, got: ${rendered}`);
      }
      if (rendered.includes("WPC MPD 1409 — ")) {
        throw new Error(`D-06: rendered row carries an em-dash hazard-type suffix it should not have: ${rendered}`);
      }
      requireLog(
        ["mpd covers the location but has no parseable hazard type", url],
        "D-06: no parse-miss diagnostic named the candidate URL for a covering MPD with no hazard type"
      );
    }
  },
  {
    // D-04's two halves for the MPD advisory path specifically: a broken feed must show
    // ⚠, and a clean run that legitimately finds nothing active must not. Run twice in one
    // scenario so both halves share the same setup shape and only the one variable
    // (whether the listing fetch succeeds) differs between them.
    name: "mpd-fetch-failure-is-stale-but-zero-results-is-not",
    requires: "kml-deps",
    run: async (helper) => {
      // First half: the listing fetch itself fails (503, installHttp's default for an
      // unrouted URL) — a broken feed must never present as a confident "none active".
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      installHttp(helper, advisoryRoutes({}));
      let failureOut;
      try {
        failureOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        // no pointInPolygon override needed: the listing fetch fails before any candidate
        // is ever fetched or checked for containment.
      }
      assertPayloadIntact(failureOut);
      if (failureOut._stale !== true) {
        throw new Error(
          `D-04: a failed MPD listing fetch (503) did not set _stale — a broken feed must ` +
          `show ⚠ rather than a confident "none active". Payload: ${JSON.stringify(failureOut.advisories)}`
        );
      }
      if (!Array.isArray(failureOut.advisories.mpd) || failureOut.advisories.mpd.length !== 0) {
        throw new Error(`D-04: expected an empty mpd array on a failed listing fetch, got ${JSON.stringify(failureOut.advisories.mpd)}`);
      }

      // Second half: the listing parses cleanly, one candidate is fetched and is currently
      // valid, but pointInPolygon is left at its default false — nothing contains the
      // user. This is the normal state most of the year and must NOT be flagged stale.
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const now = Date.now();
      const window = mpdWindowFields(now + 3 * 60 * 60 * 1000, { issueBeforeMs: 45 * 60 * 1000 });
      const listingText = mpdListingHtml([
        { filename: "MPD_1512_final.kmz", lastModified: new Date(now - 15 * 60 * 1000) }
      ]);
      const url = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1512_final.kmz";
      const buffer = kmzOf({
        "doc.kml": mpdKml({
          number: "1512", issueTime: window.issueTimeStr, validEndTi: window.validEndTi,
          hazardType: "Heavy snow"
        })
      });
      installHttp(helper, advisoryRoutes({
        listing: { url: PRODUCT_REGISTRY.mpd.discoveryUrl, text: listingText },
        members: [{ url, buffer }]
      }));
      // turfStub.pointInPolygon defaults to () => false — deliberately not overridden here.
      const cleanOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
        showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
      });
      assertPayloadIntact(cleanOut);
      if (!Array.isArray(cleanOut.advisories.mpd) || cleanOut.advisories.mpd.length !== 0) {
        throw new Error(`D-04: expected an empty mpd array when nothing contains the user, got ${JSON.stringify(cleanOut.advisories.mpd)}`);
      }
      if (cleanOut._stale === true) {
        throw new Error(
          "D-04: a clean run that legitimately found zero active MPDs was flagged _stale — " +
          "\"none active\" is the normal state most of the year and must not read as a degrade."
        );
      }
    }
  },
  {
    // T-15-39 / D-10 mutation 5: the fail-open direction on an unresolvable validity window
    // is a deliberate no-false-negatives choice (showing an expired MPD is a minor annoyance;
    // hiding an active one is the class of bug this project exists to prevent) and must not be
    // silently reversible. This scenario's IssueTime carries AKST — a real US timezone
    // abbreviation absent from parseMpdValidEnd's fixed 8-entry CONUS table — so
    // parseMpdValidEnd resolves to null. The candidate must still be kept and the parse-miss
    // logged, never dropped.
    name: "mpd-unparseable-validity-is-kept-not-dropped",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const now = Date.now();
      const window = mpdWindowFields(now + 3 * 60 * 60 * 1000, { issueBeforeMs: 45 * 60 * 1000 });
      const issueTimeStr = window.issueTimeStr.replace(/\bEDT\b/, "AKST");
      const listingText = mpdListingHtml([
        { filename: "MPD_1617_final.kmz", lastModified: new Date(now - 15 * 60 * 1000) }
      ]);
      const url = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1617_final.kmz";
      const buffer = kmzOf({
        "doc.kml": mpdKml({
          number: "1617", issueTime: issueTimeStr, validEndTi: window.validEndTi,
          hazardType: "Heavy snow"
        })
      });

      installHttp(helper, advisoryRoutes({
        listing: { url: PRODUCT_REGISTRY.mpd.discoveryUrl, text: listingText },
        members: [{ url, buffer }]
      }));

      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.mpd.length !== 1) {
        throw new Error(
          `fail-open regression: an MPD with an unmapped timezone abbreviation (AKST) in ` +
          `IssueTime was dropped instead of kept, got ${out.advisories.mpd.length} entries`
        );
      }
      if (!out.advisories.mpd[0].label.includes("1617")) {
        throw new Error(`expected the kept candidate labelled 1617, got ${JSON.stringify(out.advisories.mpd[0])}`);
      }
      requireLog(
        ["mpd validity window unparseable, keeping candidate", url],
        "an unresolvable validity window (unmapped timezone abbreviation) did not log its parse-miss diagnostic"
      );
    }
  },
  {
    // CR-03: `<td>MPDNumber</td><td></td>` — a present but empty cell. extractMpdField
    // matches it and returns "" (its trimmed inner text), not null, so the filename-number
    // fallback was skipped, toEntry's `if (!number) return null` fired, and an MPD covering
    // the user was dropped with no entry and no ⚠. The existing mpdKml fixtures only ever
    // OMIT a row, never emit it empty, so this shape was untested. The label must come
    // from the filename — a *label* of last resort, never a selection criterion, which is
    // why this runs only after the ValidEndTi gate has already decided currency.
    name: "mpd-empty-number-cell-falls-back-to-filename-not-dropped",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const now = Date.now();
      const window = mpdWindowFields(now + 3 * 60 * 60 * 1000, { issueBeforeMs: 45 * 60 * 1000 });
      const listingText = mpdListingHtml([
        { filename: "MPD_1733_final.kmz", lastModified: new Date(now - 15 * 60 * 1000) }
      ]);
      const url = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1733_final.kmz";
      const buffer = kmzOf({
        "doc.kml": mpdKml({
          number: "", issueTime: window.issueTimeStr, validEndTi: window.validEndTi,
          hazardType: "Heavy snow"
        })
      });
      installHttp(helper, advisoryRoutes({
        listing: { url: PRODUCT_REGISTRY.mpd.discoveryUrl, text: listingText },
        members: [{ url, buffer }]
      }));

      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      assertPayloadIntact(out);
      if (out.advisories.mpd.length !== 1) {
        throw new Error(
          `an active MPD covering the user was dropped for an empty MPDNumber cell, got ` +
          `${out.advisories.mpd.length} entries — the exact false negative MPD-01/MPD-04 exist to prevent`
        );
      }
      if (!out.advisories.mpd[0].label.includes("1733")) {
        throw new Error(`expected the filename-number label 1733, got ${JSON.stringify(out.advisories.mpd[0])}`);
      }
      // D-06: an unrelated field's absence must not be collateral damage of the fallback.
      if (out.advisories.mpd[0].hazardType !== "Heavy snow") {
        throw new Error(`the hazard type was lost alongside the number: ${JSON.stringify(out.advisories.mpd[0])}`);
      }
      requireLog(
        ["mpd MPDNumber unparseable, falling back to filename number", url],
        "the empty-cell fallback produced no diagnostic naming the URL"
      );
      // The entry was recovered, so this is not a degrade — nothing was hidden from the user.
      if (out._stale === true) {
        throw new Error("a recovered MPD label was reported as a degrade (_stale true)");
      }

      // Control: a URL whose filename carries no MPD number leaves the entry genuinely
      // unlabellable. It is then dropped — and that drop is a degrade the user must see.
      resetHelper(helper);
      resetLogs();
      helper._products = { showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false };
      const originalDiscovery = helper._advisoryDiscovery;
      helper._advisoryDiscovery = Object.assign({}, originalDiscovery, {
        "wpc-mpd-listing": async () => ({
          urls: ["https://www.wpc.ncep.noaa.gov/kml/mpd/unlabelled.kmz"], failed: false
        })
      });
      installHttp(helper, advisoryRoutes({
        members: [{ url: "https://www.wpc.ncep.noaa.gov/kml/mpd/unlabelled.kmz", buffer }]
      }));
      turfStub.pointInPolygon = () => true;
      let dropped;
      try {
        dropped = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showSPCMD: false, showMPD: true, showExcessiveRain: false, showWinterImpact: false
        });
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
        helper._advisoryDiscovery = originalDiscovery;
      }
      assertPayloadIntact(dropped);
      if (dropped.advisories.mpd.length !== 0) {
        throw new Error(`control: an unlabellable MPD was expected to drop, got ${JSON.stringify(dropped.advisories.mpd)}`);
      }
      if (dropped._stale !== true) {
        throw new Error(
          "an advisory that covers the location and was dropped for having no name produced " +
          "an unflagged payload — the user sees neither the advisory nor a ⚠ (D-04)"
        );
      }
    }
  },
  {
    // WR-01: the degraded-truncation branch justified `slice(-N)` with "Apache lists
    // alphabetically, so the tail of document order is the highest-numbered entries". That
    // is false across a digit-count boundary, which is the directory's normal state — text
    // order puts MPD_999 after MPD_1200. So in the exact scenario the branch exists for
    // (listing format changed, every timestamp unparseable, 1000+ candidates admitted
    // fail-open) it fetched the OLDEST MPDs of the season and never the active ones. The
    // fixture below is that listing: alphabetically sorted, timestamp column absent.
    name: "mpd-listing-truncation-keeps-the-newest-not-the-alphabetical-tail",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const filenames = [];
      for (let n = 1; n <= 1200; n++) filenames.push(`MPD_${n}_final.kmz`);
      filenames.sort();
      const html = "<html><body>" +
        filenames.map((f) => `<a href="${f}">${f}</a>`).join("\n") +
        "</body></html>";
      installHttp(helper, [[PRODUCT_REGISTRY.mpd.discoveryUrl, () => httpResponse({ text: html })]]);
      const result = await helper._advisoryDiscovery["wpc-mpd-listing"].call(helper, PRODUCT_REGISTRY.mpd);
      if (result.urls.length !== 60) {
        throw new Error(`expected truncation to the 60-candidate cap, got ${result.urls.length}`);
      }
      if (result.failed !== true) {
        throw new Error("a truncated candidate list was not flagged, so the ⚠ never reaches the user");
      }
      const numbers = result.urls.map((u) => Number(/MPD_(\d+)_final\.kmz$/.exec(u)[1]));
      const lowest = Math.min(...numbers);
      if (lowest !== 1141) {
        throw new Error(
          `truncation kept the wrong end of the list: lowest kept number is ${lowest}, expected 1141 ` +
          `(the 60 highest of 1..1200). Alphabetical document order yields 9..999 — the oldest ` +
          `MPDs of the season, none of them currently active.`
        );
      }
    }
  },
  {
    // WR-02: fetchBinBuffer had no byte bound while its sibling listing fetch documented
    // the equivalent control as "a security control, not tidiness". It runs up to 60 times
    // per poll on URLs a remote document chose, so an unbounded body is an OOM on a Pi.
    // Both halves are asserted: an honestly declared oversized Content-Length is refused
    // before the body is read at all, and a body that is oversized despite its headers is
    // refused after the read (the fallback for a runtime that ignores node-fetch's `size`).
    name: "advisory-member-body-is-size-bounded",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const url = "https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1900_final.kmz";
      const MAX = 8 * 1024 * 1024;

      let sawSizeOption = false;
      let bodyWasRead = false;
      helper._fetch = async (_url, options) => {
        sawSizeOption = options && options.size === MAX;
        return {
          ok: true,
          status: 200,
          arrayBuffer: async () => { bodyWasRead = true; return Buffer.alloc(8); },
          headers: { get: (n) => (String(n).toLowerCase() === "content-length" ? String(MAX + 1) : null) }
        };
      };
      let declaredErr = null;
      try {
        await helper.fetchBinBuffer(url);
      } catch (err) {
        declaredErr = err;
      }
      if (!declaredErr || !/Refusing oversized body/.test(declaredErr.message)) {
        throw new Error(`a body declaring ${MAX + 1} bytes was accepted: ${declaredErr && declaredErr.message}`);
      }
      if (bodyWasRead) {
        throw new Error("an oversized Content-Length was read into memory before being refused");
      }
      if (!sawSizeOption) {
        throw new Error(
          "fetchBinBuffer did not pass node-fetch's `size` cap — the Content-Length and " +
          "post-read checks bound nothing while the body streams into memory"
        );
      }

      // A runtime that ignores `size` and a server that lies about Content-Length: the
      // post-read length check is the only thing left, and it must still refuse.
      helper._fetch = async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.alloc(MAX + 1),
        headers: { get: () => null }
      });
      let readErr = null;
      try {
        await helper.fetchBinBuffer(url);
      } catch (err) {
        readErr = err;
      }
      if (!readErr || !/Refusing oversized body/.test(readErr.message)) {
        throw new Error(`an undeclared oversized body was accepted: ${readErr && readErr.message}`);
      }

      // Positive control: a normal-sized body still round-trips, so the assertions above
      // are not satisfied by fetchBinBuffer refusing everything.
      helper._fetch = async () => ({
        ok: true,
        status: 200,
        arrayBuffer: async () => Buffer.from("kmz-bytes"),
        headers: { get: () => "9" }
      });
      const ok = await helper.fetchBinBuffer(url);
      if (ok.toString() !== "kmz-bytes") {
        throw new Error(`control: a well-sized body did not survive the bound, got ${JSON.stringify(ok.toString())}`);
      }
    }
  },
  {
    // WR-03: the 8 MB entry bound read `entry.header.size` — the DECLARED uncompressed
    // size, a field a hostile archive sets independently of its deflate stream. The
    // comment presented it as bounding a decompression bomb; it bounded only an honestly
    // declared one. Three refusals are asserted against real adm-zip archives, plus a
    // control so none of them is satisfied by refusing everything.
    name: "kmz-decompression-bomb-is-refused",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();

      // 1. Honest and oversized: refused on the declared size, before any inflation.
      const oversized = makeKmzBuffer({ "doc.kml": Buffer.alloc(16 * 1024 * 1024, 0x41).toString("latin1") });
      let oversizedErr = null;
      try { helper.extractSoleKmlEntry(oversized); } catch (err) { oversizedErr = err; }
      if (!oversizedErr || !/oversized \.kml entry/.test(oversizedErr.message)) {
        throw new Error(`an honestly-declared 16 MB .kml entry was accepted: ${oversizedErr && oversizedErr.message}`);
      }

      // 2. The one shape the declared size does NOT bound. adm-zip clamps inflation to the
      //    declared uncompressed size (zlib's maxOutputLength) — but only when that size is
      //    greater than zero, so an entry declaring ZERO inflates with no bound at all. The
      //    fixture below is 200 KB on the wire, well inside ADVISORY_MAX_BODY_BYTES, and
      //    inflates to 200 MB; adm-zip does eventually reject it on a checksum, but only
      //    AFTER materialising all 200 MB, which on a Raspberry Pi is the whole process.
      //    A ratio test does not see this either: the ratio of a zero declaration is zero.
      //    Asserting the message is what proves the refusal came from the size check rather
      //    than from adm-zip's post-inflation checksum — the difference between refusing
      //    the bomb and detonating it first.
      const zeroDeclared = Buffer.from(
        makeKmzBuffer({ "doc.kml": Buffer.alloc(200 * 1024 * 1024, 0x41).toString("latin1") })
      );
      const zeroCd = zeroDeclared.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      if (zeroCd < 0) throw new Error("fixture is not a well-formed zip: no central directory header");
      zeroDeclared.writeUInt32LE(0, zeroCd + 24);
      let zeroErr = null;
      try { helper.extractSoleKmlEntry(zeroDeclared); } catch (err) { zeroErr = err; }
      if (!zeroErr || !/declares 0 uncompressed bytes/.test(zeroErr.message)) {
        throw new Error(
          "a 200 KB archive declaring a 0-byte .kml member was not refused before inflation: " +
          `${zeroErr && zeroErr.message}. A zero declaration switches adm-zip's maxOutputLength ` +
          "clamp off, so the 200 MB it actually inflates to is allocated in full first."
        );
      }

      // 2b. The converse, and the reason no declared:compressed RATIO test belongs here:
      //     the SPC ActiveMD.kmz index this same function parses is a run of near-identical
      //     <NetworkLink> blocks and compresses far harder than the ~3 KB member polygons a
      //     ratio threshold would be sized against. Refusing it would empty
      //     spc-active-index's candidate list — every active MD gone for that poll, behind a
      //     ⚠ badge, from upstream growth rather than an attack.
      const bigIndex = kmzOf({
        "activemd.kml": activeIndexKml(
          Array.from({ length: 1000 }, (_, i) => `http://www.spc.noaa.gov/products/md/MD${2000 + i}.kmz`)
        )
      });
      const RealZip = require("adm-zip");
      const indexEntry = new RealZip(bigIndex).getEntries().find((e) => /\.kml$/i.test(e.entryName));
      const indexRatio = indexEntry.header.size / indexEntry.header.compressedSize;
      // Vacuity guard: if the fixture stops compressing hard, it stops standing for the
      // shape a ratio threshold would misfire on and this assertion proves nothing.
      if (!(indexRatio > 20)) {
        throw new Error(
          `the index fixture compresses at only ${indexRatio.toFixed(1)}:1, so it no longer represents ` +
          "the high-ratio-but-legitimate archive this assertion exists to protect"
        );
      }
      if (!helper.extractSoleKmlEntry(bigIndex).includes("NetworkLink")) {
        throw new Error("a legitimate 1000-entry NetworkLink index did not round-trip");
      }

      // 3. A header that LIES: same deflate stream, central-directory uncompressed size
      //    forged down to 100 bytes so the size checks above see a tiny, plausible entry.
      //    Something must still refuse it, and WHICH layer refuses is the whole point —
      //    asserting only "some error was thrown" is what let the previous version of this
      //    case pass against every possible implementation, including one with no bound at
      //    all, since adm-zip's own error satisfied it.
      //
      //    The refusal must come from adm-zip clamping inflation to the declared size
      //    (zlib's maxOutputLength). extractSoleKmlEntry's post-read length check cannot
      //    be what fires: adm-zip returns a buffer of exactly the declared size, so that
      //    check is unreachable while this library behaves this way, and it is documented
      //    as such. If this assertion ever fails, the library has stopped bounding
      //    inflation, that post-read check has just become the only thing that does, and
      //    the version pin in package.json needs re-examining — which is precisely the
      //    event a green suite must not hide.
      const forged = Buffer.from(oversized);
      const cdOffset = forged.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
      if (cdOffset < 0) throw new Error("fixture is not a well-formed zip: no central directory header");
      forged.writeUInt32LE(100, cdOffset + 24);
      let forgedErr = null;
      try { helper.extractSoleKmlEntry(forged); } catch (err) { forgedErr = err; }
      if (!forgedErr) {
        throw new Error("a forged 100-byte declaration on a 16 MB deflate stream was accepted and inflated");
      }
      if (/oversized \.kml entry|declares 0 uncompressed bytes/.test(forgedErr.message)) {
        throw new Error(
          `the forged fixture was refused by a HEADER check (${forgedErr.message}), so it does not ` +
          "prove the inflation itself is bounded — the forge did not take effect"
        );
      }
      if (!/Cannot create a Buffer larger than/.test(forgedErr.message)) {
        throw new Error(
          `the forged fixture was not refused by adm-zip's declared-size clamp (${forgedErr.message}). ` +
          "The installed adm-zip passes the declared uncompressed size to zlib as maxOutputLength; if it " +
          "no longer does, inflation is unbounded up to whatever the deflate stream produces and " +
          "extractSoleKmlEntry's post-read length check — documented there as unreachable — is now the " +
          "only bound on it."
        );
      }

      // 4. Control: a live-shaped archive still round-trips, so the three refusals above
      //    are not just "extractSoleKmlEntry refuses everything".
      const good = kmzOf({
        "doc.kml": mpdKml({
          number: "1", issueTime: "734 PM EDT Sun Aug 23 2026",
          validEndTi: "240515", hazardType: "Heavy snow"
        })
      });
      if (!helper.extractSoleKmlEntry(good).includes("MPDNumber")) {
        throw new Error("control: a well-formed KMZ no longer round-trips through extractSoleKmlEntry");
      }
    }
  },
  {
    // WR-04: checkInPolygon built its turf geometry unguarded, so ONE malformed feature
    // aborted the whole scan for that candidate and _runKmlAdvisoryRow's catch then
    // discarded the entire advisory. The shape that makes this a false negative rather
    // than a wash is a malformed feature serialised BEFORE a valid one containing the
    // user: the covering advisory is lost to document order alone. extractPolygons was
    // hardened against exactly these turf throws (WR-08); checkInPolygon was not.
    //
    // Asserted against the primitive rather than end-to-end on purpose: @tmcw/togeojson
    // normalises rings on the way out (it auto-closes a 4-position ring and emits
    // `geometry: null` for anything shorter), so no KML fixture can currently deliver a
    // ring-invalid Polygon through the MPD chain. checkInPolygon is a generic helper over
    // "anything, including junk" — its own doc comment — and its containment must not
    // depend on one upstream parser's normalisation staying as it is today.
    name: "checkinpolygon-contains-unusable-geometry-per-feature",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const before = helper._unusableFeatureCount || 0;
      const covering = {
        type: "Feature", properties: { name: "covering" },
        geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
      };
      const collection = {
        type: "FeatureCollection",
        features: [
          // Fewer than four positions: turf's "Each LinearRing of a Polygon must have 4 or
          // more Positions.", reproduced verbatim by the turf stub (module-stubs.js).
          { type: "Feature", properties: { name: "malformed" },
            geometry: { type: "Polygon", coordinates: [[[-97, 35], [-96, 35]]] } },
          covering
        ]
      };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let hit;
      let scanErr = null;
      try {
        hit = helper.checkInPolygon(collection, PROBE_LAT, PROBE_LON);
      } catch (err) {
        scanErr = err;
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      if (scanErr) {
        throw new Error(
          `one malformed feature aborted the whole scan (${scanErr.message}) — the caller ` +
          "discards the entire advisory, so a covering polygon behind it is never seen"
        );
      }
      if (!hit || hit.properties.name !== "covering") {
        throw new Error(`expected the covering feature behind the malformed one, got ${JSON.stringify(hit)}`);
      }
      requireLog(
        ["checkInPolygon", "unusable geometry"],
        "a feature dropped for unusable geometry produced no diagnostic"
      );
      // Reusing the shared counter is what makes the drop surface as ⚠ through
      // getSpcOutlook's existing sampling instead of vanishing.
      if ((helper._unusableFeatureCount || 0) !== before + 1) {
        throw new Error(
          `the dropped feature was not counted (${before} -> ${helper._unusableFeatureCount}), so ` +
          "getSpcOutlook's sampling cannot flag the payload as assembled from incomplete layers"
        );
      }

      // Control: with no malformed feature the same call still finds the covering one, so
      // nothing above is satisfied by checkInPolygon simply bailing out early.
      turfStub.pointInPolygon = () => true;
      let control;
      try {
        control = helper.checkInPolygon(
          { type: "FeatureCollection", features: [covering] }, PROBE_LAT, PROBE_LON
        );
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      if (!control || control.properties.name !== "covering") {
        throw new Error("control: checkInPolygon no longer finds a plain covering feature");
      }
    }
  },
  {
    // WR-07: getDom's no-risk gate tolerates a missing `advisories` key AND a missing inner
    // key — its own comment says so ("version skew") — while the render thirty lines later
    // spread `advisories.spcMD` and `advisories.mpd` unguarded. `advisories || {...}` guards
    // only the outer object, so a payload carrying `advisories` with one key absent threw
    // "advisories.mpd is not iterable" INSIDE getDom, which takes down the module's entire
    // render, not just the advisory band. Two disagreeing guards, and the harsher one won.
    name: "frontend-tolerates-a-half-populated-advisories-object",
    run: async (_helper) => {
      resetLogs();
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showSPCMD: true, showMPD: true
      };
      const noRisk = { risk: "NONE", text: "None", color: "afddf6" };
      const base = () => ({
        day1: { ...noRisk }, day2: { ...noRisk }, day3: { ...noRisk },
        day4: { ...noRisk }, day5: { ...noRisk }, day6: { ...noRisk },
        day7: { ...noRisk }, day8: { ...noRisk },
        day48Risk: false,
        fireWeather: { day1Risk: 0, day2Risk: 0 },
        excessiveRain: {}, winterImpact: {}
      });

      // The version-skew shape: a helper that predates the mpd row ships advisories with
      // only spcMD. The band must still render the entries that ARE present.
      const skewed = { ...base(), advisories: { spcMD: [{ label: "SPC MD 2108", hazardType: null }] } };
      let rendered;
      try {
        rendered = renderDom(frontend, { config, spcrisk: skewed });
      } catch (err) {
        throw new Error(
          `a payload whose advisories object is missing one key threw inside getDom ` +
          `(${err.message}) — that breaks the whole module render, not just the advisory band`
        );
      }
      if (!rendered.includes("SPC MD 2108")) {
        throw new Error(`the advisory that WAS present did not render: ${JSON.stringify(rendered)}`);
      }

      // The mirror shape, and a junk value in the key's place — neither may throw.
      for (const advisories of [
        { mpd: [{ label: "WPC MPD 1118", hazardType: "Heavy snow" }] },
        { spcMD: null, mpd: [{ label: "WPC MPD 1118", hazardType: "Heavy snow" }] },
        { spcMD: "not-an-array", mpd: [{ label: "WPC MPD 1118", hazardType: "Heavy snow" }] }
      ]) {
        let out;
        try {
          out = renderDom(frontend, { config, spcrisk: { ...base(), advisories } });
        } catch (err) {
          throw new Error(
            `advisories ${JSON.stringify(advisories)} threw inside getDom (${err.message}) — ` +
            "the gate above it tolerates exactly this shape"
          );
        }
        if (!out.includes("WPC MPD 1118")) {
          throw new Error(`the usable half of ${JSON.stringify(advisories)} did not render: ${JSON.stringify(out)}`);
        }
      }
    }
  },
  {
    // WR-09: ERO and WSSI rows are gated on their own config toggles; the advisory band was
    // not, at either the render or the no-risk gate. That was safe only while the backend
    // and frontend toggles agreed — and node_helper's `_products` is shared across
    // MagicMirror module INSTANCES of the same type, so two configured instances with
    // different showMPD values overwrite each other's toggles on every poll and the losing
    // instance renders advisories its own config disabled. The payloads below are exactly
    // what that losing instance receives: populated arrays its config says not to show.
    name: "frontend-advisory-band-respects-its-config-toggles",
    run: async (_helper) => {
      resetLogs();
      const frontend = loadFrontendModule();
      const noRisk = { risk: "NONE", text: "None", color: "afddf6" };
      const payload = {
        day1: { ...noRisk }, day2: { ...noRisk }, day3: { ...noRisk },
        day4: { ...noRisk }, day5: { ...noRisk }, day6: { ...noRisk },
        day7: { ...noRisk }, day8: { ...noRisk },
        day48Risk: false,
        fireWeather: { day1Risk: 0, day2Risk: 0 },
        excessiveRain: {}, winterImpact: {},
        advisories: {
          spcMD: [{ label: "SPC MD 2108", hazardType: null }],
          mpd: [{ label: "WPC MPD 1118", hazardType: "Heavy snow" }]
        }
      };
      const cfg = (over) => ({
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showSPCMD: true, showMPD: true, ...over
      });

      const bothOff = renderDom(frontend, { config: cfg({ showSPCMD: false, showMPD: false }), spcrisk: payload });
      if (bothOff.includes("SPC MD 2108") || bothOff.includes("WPC MPD 1118")) {
        throw new Error(`advisories rendered with both toggles off: ${JSON.stringify(bothOff)}`);
      }
      // The gate must agree with the render: with nothing displayable and no other risk,
      // this is a genuine all-clear, not a band-less "(unconfirmed)" or a bare page.
      if (bothOff !== "No Severe Weather Risk") {
        throw new Error(
          `the no-risk gate did not agree with the render — advisories the config disabled ` +
          `still disqualified the short-circuit: ${JSON.stringify(bothOff)}`
        );
      }

      const mpdOnly = renderDom(frontend, { config: cfg({ showSPCMD: false }), spcrisk: payload });
      if (mpdOnly.includes("SPC MD 2108")) {
        throw new Error(`showSPCMD:false still rendered the SPC MD: ${JSON.stringify(mpdOnly)}`);
      }
      if (!mpdOnly.includes("WPC MPD 1118")) {
        throw new Error(`showMPD:true dropped the MPD: ${JSON.stringify(mpdOnly)}`);
      }

      const mdOnly = renderDom(frontend, { config: cfg({ showMPD: false }), spcrisk: payload });
      if (mdOnly.includes("WPC MPD 1118")) {
        throw new Error(`showMPD:false still rendered the MPD: ${JSON.stringify(mdOnly)}`);
      }
      if (!mdOnly.includes("SPC MD 2108")) {
        throw new Error(`showSPCMD:true dropped the SPC MD: ${JSON.stringify(mdOnly)}`);
      }
    }
  },
  {
    // WR-08/CV-03: node_helper derives every day span from PRODUCT_REGISTRY (`row.days`)
    // and states the rule outright — "no literal day count survives outside the registry" —
    // while the frontend enumerated five ERO terms and three WSSI terms by hand in four
    // places. Raising the single declared knob therefore produced a correct, longer payload
    // whose extra days never rendered AND never disqualified the no-risk short-circuit,
    // with no error at either end. The block below is what a `days: 7` ERO ships; the
    // frontend must follow it without an edit of its own.
    name: "frontend-follows-the-payload-day-span-not-a-hardcoded-one",
    run: async (_helper) => {
      resetLogs();
      const frontend = loadFrontendModule();
      const noRisk = { risk: "NONE", text: "None", color: "afddf6" };
      const eroBlock = {};
      for (let d = 1; d <= 7; d++) {
        eroBlock[`day${d}Risk`] = d === 7 ? "MDT" : "NONE";
        eroBlock[`day${d}Text`] = d === 7 ? "Moderate" : "None";
        eroBlock[`day${d}Color`] = d === 7 ? "e06666" : "afddf6";
        eroBlock[`day${d}ValidTime`] = null;
      }
      const payload = {
        day1: { ...noRisk }, day2: { ...noRisk }, day3: { ...noRisk },
        day4: { ...noRisk }, day5: { ...noRisk }, day6: { ...noRisk },
        day7: { ...noRisk }, day8: { ...noRisk },
        day48Risk: false,
        fireWeather: { day1Risk: 0, day2Risk: 0 },
        excessiveRain: eroBlock,
        winterImpact: {},
        advisories: { spcMD: [], mpd: [] }
      };
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: true, showWinterImpact: false,
        showSPCMD: true, showMPD: true
      };
      const rendered = renderDom(frontend, { config, spcrisk: payload });
      if (rendered === "No Severe Weather Risk") {
        throw new Error(
          "a day beyond the frontend's hardcoded span did not disqualify the no-risk " +
          "short-circuit — a real MDT excessive-rain day rendered as a confident all-clear"
        );
      }
      if (!rendered.includes("Excessive Rain (Day 7)") || !rendered.includes("Moderate")) {
        throw new Error(
          `a day beyond the frontend's hardcoded span never rendered: ${JSON.stringify(rendered)}. ` +
          "The backend derives the span from PRODUCT_REGISTRY.excessiveRain.days; the frontend must too."
        );
      }

      // Control: the shorter, currently-shipping span still renders exactly its own days
      // and no phantom ones, so the derivation is not just "render everything".
      const shortBlock = {};
      for (let d = 1; d <= 3; d++) {
        shortBlock[`day${d}Risk`] = d === 2 ? "MDT" : "NONE";
        shortBlock[`day${d}Text`] = d === 2 ? "Moderate" : "None";
        shortBlock[`day${d}Color`] = d === 2 ? "e06666" : "afddf6";
        shortBlock[`day${d}ValidTime`] = null;
      }
      const shortRender = renderDom(frontend, {
        config, spcrisk: { ...payload, excessiveRain: shortBlock }
      });
      if (!shortRender.includes("Excessive Rain (Day 2)")) {
        throw new Error(`control: a 3-day block did not render its own risk day: ${JSON.stringify(shortRender)}`);
      }
      if (shortRender.includes("Excessive Rain (Day 4)") || shortRender.includes("undefined")) {
        throw new Error(`control: a 3-day block rendered days it does not carry: ${JSON.stringify(shortRender)}`);
      }
    }
  },
  {
    // WR-04 (17-REVIEW): the mechanical half of the pinned-clock discipline. Two scenarios
    // pinned `helper._nowMs` and then wrote `entry.timestamp = Date.now() - 65 * 60 * 1000`
    // — mixing the pinned seam with the machine clock, so the computed age was
    // `PINNED_NOW - (realNow - 65min)`. Today that was NEGATIVE, so the control passed
    // without ever exercising the 2x-interval stale-fallback window it claimed to; and on
    // any machine whose clock read earlier than ~2026-08-31T11:55Z the suite went 81/1.
    // A green suite that is green because of what day it is proves nothing, and the
    // failure is invisible on the machine that introduced it.
    //
    // The rule this enforces: a scenario that PINS the clock seam must read the clock ONLY
    // through that seam. Scenarios that never pin `_nowMs` are unaffected — they use the
    // real clock consistently, which is self-consistent and fine (the pre-Phase-16
    // cache-ageing scenarios do exactly that, deliberately).
    //
    // Comments are stripped before scanning, so a comment ABOUT Date.now() — this one
    // included — cannot trip the gate, and equally cannot hide a real use.
    // Mutation to prove RED: put `Date.now()` back into any scenario that sets _nowMs.
    name: "harness-no-raw-clock-in-a-clock-pinned-scenario",
    run: async () => {
      const source = require("fs").readFileSync(__filename, "utf-8");

      // Strip line comments (not the `//` inside a URL scheme) and block comments, so the
      // scan sees code only.
      const code = source
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .split("\n")
        .map((line) => line.replace(/(^|[^:"'`\\])\/\/.*$/, "$1"))
        .join("\n");

      // Split the scenario array into per-scenario chunks at each `name:` declaration.
      // Everything from one `name:` to the next is that scenario's own body.
      const nameRe = /^ {4}name: "([^"]+)",$/gm;
      const marks = [];
      let m;
      while ((m = nameRe.exec(code)) !== null) {
        marks.push({ name: m[1], index: m.index });
      }

      // Precondition guard: the chunker must actually find the scenarios. If a formatting
      // change broke the pattern this gate would silently pass while checking nothing —
      // the exact failure mode it exists to prevent, one level up.
      if (marks.length < 50) {
        throw new Error(
          `precondition failed: the scenario chunker found only ${marks.length} scenario names in this ` +
          "file, so this gate is scanning almost nothing — has the `    name: \"...\",` formatting changed?"
        );
      }
      if (!marks.some((mark) => mark.name === "harness-no-raw-clock-in-a-clock-pinned-scenario")) {
        throw new Error("precondition failed: the chunker did not even find this scenario's own name");
      }

      const offenders = [];
      for (let i = 0; i < marks.length; i++) {
        const body = code.slice(marks[i].index, i + 1 < marks.length ? marks[i + 1].index : code.length);
        const pinsClock = /helper\._nowMs\s*=/.test(body);
        if (!pinsClock) continue;
        const rawClock = body.match(/\bDate\.now\(\)/g);
        if (rawClock) {
          offenders.push(`${marks[i].name} (${rawClock.length} raw Date.now() use(s))`);
        }
      }

      if (offenders.length > 0) {
        throw new Error(
          "WR-04: these scenarios pin helper._nowMs and then also read the real machine clock via " +
          "Date.now(), so what they measure depends on what day the suite is run — derive the value " +
          "from the pinned constant (HAZARDS_NOW_MS / HEATRISK_NOW_MS) instead: " + offenders.join("; ")
        );
      }

      // Control: the gate is capable of detecting the pattern at all. A synthetic chunk in
      // exactly the offending shape must be flagged by the same predicates used above —
      // without this, "no offenders" could mean "the predicates match nothing".
      // Assembled from fragments on purpose: written out whole, this fixture would be
      // literal source text in this scenario's own body and the gate above would flag
      // ITSELF as an offender. (It did, on first run — which is a pleasant demonstration
      // that the detection works.)
      const pinFragment = "helper._now" + "Ms = () => HEATRISK_NOW_MS;";
      const rawClockFragment = "entry.timestamp = Date" + ".now()" + " - 65 * 60 * 1000;";
      const syntheticOffender = '    name: "synthetic",\n    run: async (helper) => {\n' +
        "      " + pinFragment + "\n      " + rawClockFragment + "\n    }\n";
      if (!/helper\._nowMs\s*=/.test(syntheticOffender) || !/\bDate\.now\(\)/.test(syntheticOffender)) {
        throw new Error(
          "control: this gate's own predicates do not flag a synthetic scenario written in exactly the " +
          "offending shape — the gate cannot fail, so its green result means nothing"
        );
      }
    }
  },
  {
    // WR-10: ORIGINAL_SEAMS captured a curated two-entry list while its own neighbouring
    // comment argued that hand-maintained lists drift, and the turf stub's module-global
    // pointInPolygon was reset by nobody — twenty scenarios save and restore it by hand, and
    // one omission bleeds `() => true` into every later scenario, silently making every
    // polygon contain the user. Neither leak had an assertion; both surfaced, if at all, as
    // an unrelated flaky failure elsewhere in the file.
    //
    // This used to be two scenarios: a setup one that dirtied the seams and asserted
    // nothing (so it always passed, and inflated the reported count by one) and this one,
    // which depended on being IMMEDIATELY next. Nothing enforced or recorded that ordering.
    // Any scenario inserted between them calls resetHelper at its own start, cleans both
    // leaks, and leaves this one passing vacuously — it never asserted that the seams were
    // dirty on entry, which is the same vacuity class the rest of the suite guards against
    // deliberately, left unguarded where it is structurally hardest to see. Dirtying the
    // seams here, and asserting the dirt is present before cleaning it, makes the scenario
    // self-contained: no ordering assumption is load-bearing and no assertion can pass
    // because the thing it tests never happened.
    name: "harness-leak-check-resethelper-restores-every-seam",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();

      // A seam outside the old curated list, plus the turf stub left flipped exactly as a
      // missing `finally` would leave it.
      helper.fetchBinBuffer = async () => { throw new Error("LEAKED fetchBinBuffer stub"); };
      helper.checkInPolygon = () => { throw new Error("LEAKED checkInPolygon stub"); };
      turfStub.pointInPolygon = () => true;

      // Precondition: the dirt is actually present. Without this the assertions below pass
      // whenever the stubbing silently failed to take — the vacuity the two-scenario
      // arrangement could not rule out.
      let dirtied = null;
      try { await helper.fetchBinBuffer("https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1_final.kmz"); }
      catch (err) { dirtied = err; }
      if (!dirtied || !/LEAKED fetchBinBuffer stub/.test(dirtied.message)) {
        throw new Error("setup did not dirty fetchBinBuffer, so the restoration assertion below proves nothing");
      }
      dirtied = null;
      try { helper.checkInPolygon({ type: "FeatureCollection", features: [] }, PROBE_LAT, PROBE_LON); }
      catch (err) { dirtied = err; }
      if (!dirtied || !/LEAKED checkInPolygon stub/.test(dirtied.message)) {
        throw new Error("setup did not dirty checkInPolygon, so the restoration assertion below proves nothing");
      }
      if (turfStub.pointInPolygon({}, {}) !== true) {
        throw new Error("setup did not dirty the turf stub, so the restoration assertion below proves nothing");
      }

      resetHelper(helper);
      resetLogs();
      // 1. The seams stubbed above must be the real implementations again.
      let leaked = null;
      try {
        await helper.fetchBinBuffer("https://www.wpc.ncep.noaa.gov/kml/mpd/MPD_1_final.kmz");
      } catch (err) {
        leaked = err;
      }
      if (leaked && /LEAKED fetchBinBuffer stub/.test(leaked.message)) {
        throw new Error(
          "a fetchBinBuffer stub survived resetHelper — every seam outside the old curated " +
          "two-entry list bleeds into every later scenario"
        );
      }
      let hit;
      try {
        hit = helper.checkInPolygon({ type: "FeatureCollection", features: [] }, PROBE_LAT, PROBE_LON);
      } catch (err) {
        throw new Error(`a checkInPolygon stub survived resetHelper: ${err.message}`);
      }
      if (hit !== null) {
        throw new Error(`checkInPolygon on an empty collection returned ${JSON.stringify(hit)}, not null`);
      }

      // 2. The turf stub must be back at its documented default. Left leaked, every
      //    containment check in every later scenario silently answers "the user is inside".
      if (turfStub.pointInPolygon({}, {}) !== false) {
        throw new Error(
          "turfStub.pointInPolygon leaked `() => true` past resetHelper — every polygon in " +
          "every later scenario contains the user, and no assertion in the suite would say so"
        );
      }
    }
  }
  ,{
    // The stale fallback is the mechanism behind the phase's stated guarantee — "a WPC
    // hiccup during an active HIGH must not blank the display" — and every scenario that
    // claims to prove it (ero-rejected-body-serves-last-known-good,
    // ero-unparseable-body-serves-last-known-good, body-read-abort-is-contained-...) runs
    // its warm-up poll and its failure poll milliseconds apart. At the shipping
    // 60-minute cadence a cached reading is ALWAYS at least one interval old by the time
    // the next poll can fail, so a window of exactly one interval had expired at the only
    // moment it was ever consulted and the fallback was unreachable in production: the
    // day resolved to NONE and the display rendered "No Severe Weather Risk
    // (unconfirmed)" for a location that was SLGT an hour earlier.
    //
    // A real-elapsed-time test cannot observe this — the whole suite runs in under a
    // second — so this scenario advances the clock by ageing the cache entry directly,
    // which is the same state a poll an hour later sees. The negative control at the end
    // is what keeps the fix from degrading into "serve any cached reading forever".
    name: "an-hour-old-reading-still-survives-a-hiccup-but-a-day-old-one-does-not",
    run: async (helper) => {
      const INTERVAL_MIN = 60;
      // Ages the cached reading for `url` by `minutes`, standing in for a poll that
      // happens that much later. Asserts the entry exists first, so a routing change that
      // stops populating the cache fails loudly here rather than making the ageing a no-op
      // and every assertion below vacuous.
      const ageEntry = (url, minutes) => {
        const entry = helper._geoJsonCache.get(url);
        if (!entry) throw new Error(`no cache entry to age for ${url} — the warm-up poll did not populate the cache`);
        entry.timestamp = Date.now() - minutes * 60 * 1000;
        return entry;
      };
      const warmUp = async () => {
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._updateInterval = INTERVAL_MIN;
        installHttp(helper, eroHttpRoutes(() => httpResponse({ body: ERO_SLGT_BODY, etag: "ero-v1" })));
        const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        if (warm.excessiveRain.day1Risk !== "SLGT" || warm._stale) {
          throw new Error(
            `warm-up did not establish an unflagged SLGT reading: risk=${warm.excessiveRain.day1Risk}, _stale=${warm._stale}`
          );
        }
        resetLogs();
      };

      try {
        // 1. One poll interval has passed (plus the seconds a ~30-hop serial chain takes to
        //    reach this layer) and upstream now fails. The cached SLGT must still be served.
        await warmUp();
        const aged = ageEntry(ERO_URLS[1], INTERVAL_MIN + 5);
        const agedTimestamp = aged.timestamp;
        installHttp(helper, eroHttpRoutes(() => httpResponse({ status: 503, text: "service unavailable" })));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(out);
        if (out.excessiveRain.day1Risk !== "SLGT") {
          throw new Error(
            `a hiccup ${INTERVAL_MIN + 5} minutes after the last reading blanked an active tier: expected the ` +
            `cached SLGT, got ${out.excessiveRain.day1Risk}. At the shipping poll cadence EVERY cached reading ` +
            "is at least one interval old, so a one-interval window means the fallback never fires in production."
          );
        }
        if (out._stale !== true) {
          throw new Error("the cached reading was served without the stale flag, so it renders as a confident current reading");
        }
        if (out._staleAsOf !== agedTimestamp) {
          throw new Error(
            `the ⚠ badge would report the wrong age: _staleAsOf=${out._staleAsOf}, served reading is from ${agedTimestamp}`
          );
        }

        // 2. A 304 is upstream confirming the bytes are unchanged — a successful reading,
        //    not a body edit. Unless it restamps the entry, the entry's age is the age of
        //    the last CHANGE, and a layer that is 304-confirmed hourly for a quiet week
        //    falls out of any finite window no matter how wide it is.
        await warmUp();
        ageEntry(ERO_URLS[1], INTERVAL_MIN + 5);
        installHttp(helper, eroHttpRoutes(() => httpResponse({ status: 304, etag: "ero-v1" })));
        const confirmed = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        if (confirmed.excessiveRain.day1Risk !== "SLGT" || confirmed._stale) {
          throw new Error(
            `a 304 confirmation did not serve the cached reading cleanly: risk=${confirmed.excessiveRain.day1Risk}, ` +
            `_stale=${confirmed._stale}`
          );
        }
        const afterConfirm = helper._geoJsonCache.get(ERO_URLS[1]);
        const ageAfterConfirm = Date.now() - afterConfirm.timestamp;
        if (ageAfterConfirm > 60 * 1000) {
          throw new Error(
            `a 304 confirmation left the entry dated ${Math.round(ageAfterConfirm / 60000)} minutes ago — the entry ` +
            "records the age of the last body CHANGE, not of the last successful reading, so an unchanged layer " +
            "ages out of the stale window while upstream is answering perfectly"
          );
        }

        // 3. Negative control. The window has to END somewhere: a reading from yesterday
        //    must be a loud hard failure, not a silently-served all-clear. Without this,
        //    "serve any cached reading forever" passes assertion 1.
        await warmUp();
        ageEntry(ERO_URLS[1], 24 * 60);
        installHttp(helper, eroHttpRoutes(() => httpResponse({ status: 503, text: "service unavailable" })));
        const expired = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true });
        assertPayloadIntact(expired);
        if (expired.excessiveRain.day1Risk !== "NONE") {
          throw new Error(
            `control: a day-old reading was served as current (${expired.excessiveRain.day1Risk}); the stale window is unbounded`
          );
        }
        if (expired._stale !== true) {
          throw new Error("control: an expired-cache hard failure was not flagged stale");
        }
        requireLog(
          ["unrecoverable fetch failure for", ERO_URLS[1]],
          "control: an expired-cache hard failure produced no diagnostic naming the URL"
        );
      } finally {
        resetHelper(helper);
      }
    }
  }
  ,{
    // A node_helper restart used to freeze the display permanently. MagicMirror restarts
    // node_helpers with the server process, but socket.io reconnects the browser without
    // reloading the page, so `_seq` began again at 1 while the frontend still held
    // `_lastSeq` from before the restart — every subsequent payload was discarded, the
    // display sat on an arbitrarily old reading presented as current, and nothing self-
    // healed on any later tick. frontend-seq-discard-survives-socket-index-migration
    // replays a single monotonic 5/3/6 run and cannot see this by construction.
    name: "frontend-resyncs-after-a-node_helper-restart",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const ctx = Object.create(frontend);
      let updateDomCalls = 0;
      ctx.updateDom = () => { updateDomCalls++; };
      const bootA = 1700000000000;
      const bootB = bootA + 3600000;
      const send = (marker, seq, epoch) => {
        const meta = epoch === undefined ? undefined : { epoch };
        frontend.socketNotificationReceived.call(ctx, "SPC_DATA_RESULT", [{ marker }, seq, meta]);
      };

      // 47 polls under the first helper generation.
      for (let n = 1; n <= 47; n++) send("boot-a-" + n, n, bootA);
      if (ctx.spcrisk.marker !== "boot-a-47" || updateDomCalls !== 47) {
        throw new Error(
          `warm-up: 47 in-order payloads did not all render (spcrisk=${JSON.stringify(ctx.spcrisk)}, ` +
          `updateDomCalls=${updateDomCalls})`
        );
      }

      // The server restarts. The counter starts over; the browser did not reload.
      for (let n = 1; n <= 10; n++) send("boot-b-" + n, n, bootB);
      if (ctx.spcrisk.marker !== "boot-b-10") {
        throw new Error(
          `the display froze after a node_helper restart: still showing ${JSON.stringify(ctx.spcrisk)} after ten ` +
          "polls from the restarted helper. Every payload it sends carries a sequence number below the one the " +
          "browser last saw, so all of them are discarded — an arbitrarily old reading, rendered as current, forever."
        );
      }
      if (updateDomCalls !== 57) {
        throw new Error(`expected all ten post-restart payloads to render, got ${updateDomCalls - 47}`);
      }

      // Negative control: WITHIN one generation the guard must still discard a late chain,
      // or the fix above has simply deleted it. bootB is at seq 10; a stray seq 4 from the
      // same generation is a chain that finished out of order.
      send("late-boot-b-4", 4, bootB);
      if (ctx.spcrisk.marker !== "boot-b-10" || updateDomCalls !== 57) {
        throw new Error(
          `control: an out-of-order payload within one helper generation was accepted ` +
          `(spcrisk=${JSON.stringify(ctx.spcrisk)}) — the resync swallowed the guard it was supposed to preserve`
        );
      }

      // Control: a payload carrying no metadata at all (version skew with a helper that
      // predates the epoch) must still be accepted rather than dropped for lacking it.
      send("no-metadata", 99, undefined);
      if (ctx.spcrisk.marker !== "no-metadata") {
        throw new Error("a payload with no metadata object was rejected; the guard no longer fails open on version skew");
      }

      // The two ends of the socket contract are otherwise pinned only by a comment saying
      // they must change together, and the frontend's guard fails OPEN on a shape it does
      // not recognise — so a helper that stopped emitting the generation stamp would put
      // the display straight back into the permanent freeze above with nothing turning red.
      // Drive the real emit and assert the shape the frontend reads.
      const emitted = [];
      const realGetSpcOutlook = helper.getSpcOutlook;
      try {
        helper.sendSocketNotification = (_notification, payload) => { emitted.push(payload); };
        helper.getSpcOutlook = async () => ({ marker: "emit-probe" });
        helper.start();
        const firstEpoch = helper._epoch;
        await helper.socketNotificationReceived("GET_SPC_DATA", {
          lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
          proximityWeighting: false, products: {}
        });
        // A restart, as MagicMirror performs it: the helper is re-started under a browser
        // that never reloaded.
        helper.start();
        await helper.socketNotificationReceived("GET_SPC_DATA", {
          lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
          proximityWeighting: false, products: {}
        });
        if (emitted.length !== 2) {
          throw new Error(`expected two SPC_DATA_RESULT emissions, got ${emitted.length}`);
        }
        for (const [i, sent] of emitted.entries()) {
          if (typeof sent[1] !== "number") {
            throw new Error(`emission ${i}: payload[1] is not a sequence number (${JSON.stringify(sent[1])})`);
          }
          if (!sent[2] || typeof sent[2].epoch !== "number") {
            throw new Error(
              `emission ${i}: payload[2] carries no numeric generation stamp (${JSON.stringify(sent[2])}) — the ` +
              "frontend's resync fails open on an unrecognised shape, so a helper restart would freeze the display " +
              "again with nothing in this suite turning red"
            );
          }
        }
        if (emitted[0][2].epoch !== firstEpoch) {
          throw new Error("the emitted generation stamp is not the one start() established");
        }
        if (emitted[0][2].epoch === emitted[1][2].epoch) {
          throw new Error(
            "two helper generations emitted the SAME stamp, so the frontend cannot tell them apart and the " +
            "post-restart freeze is unfixed"
          );
        }
        // And the frontend, driven by the REAL emissions, must advance across them.
        const liveCtx = Object.create(frontend);
        liveCtx.config = { lat: PROBE_LAT, lon: PROBE_LON };
        liveCtx.updateDom = () => {};
        frontend.socketNotificationReceived.call(liveCtx, "SPC_DATA_RESULT", emitted[0]);
        frontend.socketNotificationReceived.call(liveCtx, "SPC_DATA_RESULT", emitted[1]);
        if (liveCtx.spcrisk !== emitted[1][0]) {
          throw new Error("the frontend did not advance across two real helper generations");
        }
      } finally {
        helper.getSpcOutlook = realGetSpcOutlook;
        delete helper.sendSocketNotification;
        resetHelper(helper);
      }
    }
  }
  ,{
    // A registry row used to state its day span twice — `days: 5` beside a five-key
    // `dayLayers` — with nothing tying them together. The failure mode of a mismatch is
    // not a loud one: buildUrl throws on the missing layer id INSIDE _runArcGisDayProduct's
    // per-day try, whose catch raises the payload's staleness flag, so the product flags
    // every payload stale on every poll forever — a permanent ⚠ Stale badge and, because
    // staleness disables the frontend's no-risk short-circuit, a permanent
    // "No Severe Weather Risk (unconfirmed)" on quiet days. The span is derived now; this
    // asserts the derivation refuses the shapes that would reintroduce it.
    name: "registry-day-span-is-derived-and-cannot-outrun-its-layer-map",
    run: async (helper) => {
      if (typeof daySpanOf !== "function") {
        throw new Error(
          "productRegistry exports no daySpanOf: the day span is still stated separately from the layer map " +
          "it has to agree with, and nothing checks that it does"
        );
      }
      if (daySpanOf({ 1: 0, 2: 1, 3: 2 }) !== 3) {
        throw new Error("daySpanOf did not return the number of days its layer map names");
      }
      const mustThrow = [
        ["a gap in the middle", { 1: 0, 3: 2 }],
        ["a map that does not start at day 1", { 2: 1, 3: 2 }],
        ["an empty map", {}],
        ["a non-integer layer id", { 1: 0, 2: "1" }],
        ["a negative layer id", { 1: -1 }]
      ];
      for (const [what, map] of mustThrow) {
        let err = null;
        try { daySpanOf(map); } catch (e) { err = e; }
        if (!err) {
          throw new Error(`daySpanOf accepted ${what} (${JSON.stringify(map)}) — a row built on it would throw ` +
                          "inside the per-day catch and latch the payload stale on every poll");
        }
      }

      // The invariant itself, asserted against the shipped rows: every day a row declares
      // must be one its own buildUrl can actually serve. This is the assertion that goes
      // red if a future edit reintroduces a hand-written span.
      for (const row of Object.values(PRODUCT_REGISTRY)) {
        if (row.kind !== "arcgis-day-layers") continue;
        if (row.days !== Object.keys(row.dayLayers).length) {
          throw new Error(
            `${row.id} declares ${row.days} days but its dayLayers names ${Object.keys(row.dayLayers).length}`
          );
        }
        for (let d = 1; d <= row.days; d++) {
          try {
            row.buildUrl(d);
          } catch (err) {
            throw new Error(
              `${row.id} declares day ${d} but buildUrl(${d}) throws (${err.message}) — every poll would set ` +
              "anyStale here and the display would sit on a permanent ⚠ Stale badge"
            );
          }
        }
      }
    }
  }
  ,{
    // MagicMirror runs ONE node_helper per module type and sendSocketNotification
    // broadcasts to EVERY frontend instance of that type, while the sequence guard is
    // location-agnostic — so an instance configured for one city accepted and rendered the
    // outlook computed for another, with nothing on screen saying so. The in-flight guard
    // made it deterministic rather than occasional: the second instance's request at the
    // same tick is dropped, so it only ever receives the other instance's answer.
    name: "a-payload-is-only-rendered-by-the-instance-that-asked-for-it",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const norman = Object.create(frontend);
      norman.config = { lat: PROBE_LAT, lon: PROBE_LON };
      let normanRenders = 0;
      norman.updateDom = () => { normanRenders++; };

      const boston = { lat: 42.36, lon: -71.06 };
      const ownEpoch = 12345;

      // The other instance's outlook, broadcast to this one.
      frontend.socketNotificationReceived.call(norman, "SPC_DATA_RESULT",
        [{ marker: "boston" }, 1, { epoch: ownEpoch, lat: boston.lat, lon: boston.lon }]);
      if (norman.spcrisk !== undefined || normanRenders !== 0) {
        throw new Error(
          `an outlook computed for ${boston.lat},${boston.lon} was rendered by an instance configured for ` +
          `${PROBE_LAT},${PROBE_LON}: ${JSON.stringify(norman.spcrisk)}. The viewer is watching another ` +
          "city's tornado risk with nothing on screen saying so."
        );
      }

      // Positive control: its OWN payload must still arrive, or the check above is
      // satisfied by rejecting everything.
      frontend.socketNotificationReceived.call(norman, "SPC_DATA_RESULT",
        [{ marker: "norman" }, 2, { epoch: ownEpoch, lat: PROBE_LAT, lon: PROBE_LON }]);
      if (!norman.spcrisk || norman.spcrisk.marker !== "norman" || normanRenders !== 1) {
        throw new Error(`an instance rejected its own payload: ${JSON.stringify(norman.spcrisk)}`);
      }

      // A foreign payload must not advance this instance's sequence bookkeeping either —
      // if it did, a broadcast for another location could silently suppress this
      // instance's own next result.
      frontend.socketNotificationReceived.call(norman, "SPC_DATA_RESULT",
        [{ marker: "boston-ahead" }, 99, { epoch: ownEpoch, lat: boston.lat, lon: boston.lon }]);
      frontend.socketNotificationReceived.call(norman, "SPC_DATA_RESULT",
        [{ marker: "norman-next" }, 3, { epoch: ownEpoch, lat: PROBE_LAT, lon: PROBE_LON }]);
      if (norman.spcrisk.marker !== "norman-next") {
        throw new Error(
          "a foreign broadcast advanced this instance's sequence guard, so its own next payload was discarded: " +
          JSON.stringify(norman.spcrisk)
        );
      }

      // A payload with no address at all (version skew with a helper that predates this)
      // must still be accepted rather than dropped for lacking one.
      frontend.socketNotificationReceived.call(norman, "SPC_DATA_RESULT",
        [{ marker: "unaddressed" }, 4, { epoch: ownEpoch }]);
      if (norman.spcrisk.marker !== "unaddressed") {
        throw new Error("an unaddressed payload was rejected; the address check no longer fails open on version skew");
      }

      // And the helper must actually put the requester's coordinates on the wire, plus say
      // so when a second distinct location appears — the two ends of this are otherwise
      // pinned only by a comment, and the frontend's check fails OPEN on a missing address.
      const emitted = [];
      const realGetSpcOutlook = helper.getSpcOutlook;
      try {
        resetHelper(helper);
        resetLogs();
        helper.sendSocketNotification = (_n, sent) => { emitted.push(sent); };
        helper.getSpcOutlook = async () => ({ marker: "emit-probe" });
        const request = (lat, lon) => helper.socketNotificationReceived("GET_SPC_DATA", {
          lat, lon, extended: false, updateInterval: 60, proximityWeighting: false, products: {}
        });
        await request(PROBE_LAT, PROBE_LON);
        if (!emitted[0] || !emitted[0][2] || emitted[0][2].lat !== PROBE_LAT || emitted[0][2].lon !== PROBE_LON) {
          throw new Error(
            `the helper emitted no requester address (${JSON.stringify(emitted[0] && emitted[0][2])}), so every ` +
            "frontend instance accepts every payload again"
          );
        }
        await request(boston.lat, boston.lon);
        requireLog(
          ["a second MMM-SPCOutlook instance is configured for", "42.36,-71.06"],
          "a second configured location produced no warning — the second instance simply never updates, " +
          "and nothing in the log says why"
        );
      } finally {
        helper.getSpcOutlook = realGetSpcOutlook;
        delete helper.sendSocketNotification;
        resetHelper(helper);
      }
    }
  }
  ,{
    // The generic candidate cap in _runKmlAdvisoryRow keeps the HEAD of whatever order a
    // discovery strategy returns, and documents that as a contract each strategy must
    // satisfy by handing back a meaningfully ordered list. wpc-mpd-listing satisfies it;
    // spc-active-index returned raw NetworkLink document order, so the cap kept an
    // arbitrary 60 and dropped the rest — the contract was asserted by a comment against
    // code that did not meet it. This drives the strategy directly, past the outlook
    // assembly, because the failure is entirely in which candidates survive.
    name: "spc-active-index-truncation-keeps-the-newest-not-the-document-order-head",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const row = PRODUCT_REGISTRY.spcMD;
      const numbers = Array.from({ length: 70 }, (_, i) => 2001 + i);
      const hrefs = numbers.map((n) => `https://www.spc.noaa.gov/products/md/MD${n}.kmz`);
      const numberIn = (u) => Number(/MD(\d+)\.kmz$/.exec(u)[1]);

      helper.fetchBinBuffer = async () => kmzOf({ "activemd.kml": activeIndexKml(hrefs) });
      const result = await helper._advisoryDiscovery["spc-active-index"].call(helper, row);

      if (result.urls.length !== 60) {
        throw new Error(`expected the 60-candidate cap to apply, got ${result.urls.length} candidates`);
      }
      if (result.failed !== true) {
        throw new Error("a truncated candidate list was not reported as a degrade, so the drop is invisible");
      }
      const kept = result.urls.map(numberIn);
      const newest = numbers.slice(-60);
      if (kept.join(",") !== newest.join(",")) {
        throw new Error(
          `truncation kept ${kept[0]}..${kept[kept.length - 1]} rather than the 60 highest-numbered ` +
          `(${newest[0]}..${newest[newest.length - 1]}). Document order is whatever SPC's index emits, so keeping ` +
          "its head drops active discussions arbitrarily — the same defect wpc-mpd-listing was fixed for."
        );
      }
      requireLog(
        ["70 NetworkLink candidates", "keeping the 60 highest-numbered"],
        "a truncated SPC MD candidate list produced no diagnostic saying how many were dropped"
      );

      // Control: an ordinary index is neither truncated nor flagged, so the assertions
      // above are not satisfied by the strategy degrading everything.
      resetLogs();
      const few = [2108, 2106, 2107].map((n) => `https://www.spc.noaa.gov/products/md/MD${n}.kmz`);
      helper.fetchBinBuffer = async () => kmzOf({ "activemd.kml": activeIndexKml(few) });
      const small = await helper._advisoryDiscovery["spc-active-index"].call(helper, row);
      if (small.failed !== false || small.urls.length !== 3) {
        throw new Error(
          `control: a 3-candidate index was reported as failed=${small.failed} with ${small.urls.length} candidates`
        );
      }
      if (small.urls.map(numberIn).join(",") !== "2106,2107,2108") {
        throw new Error(`control: an untruncated list was not ordered by MD number: ${small.urls.map(numberIn)}`);
      }
      resetHelper(helper);
    }
  }
  ,{
    // MMM-SPCOutlook.js states the threat model outright: advisory labels and hazard types
    // are unbounded remote KML text that reaches innerHTML, and escapeHtml is the sole
    // control. No scenario fed a label containing <, >, &, " or ' through renderDom, so
    // replacing escapeHtml's body with `(value) => String(value)` left the suite fully
    // green — the one security guarantee the frontend makes, asserted by nothing.
    //
    // The DOM stub returns a plain object whose innerHTML is never parsed, so this can only
    // assert on the concatenated string rather than on a parsed tree. That is still enough
    // to catch the deletion, which is what matters: the escape either happened in the
    // string or it did not.
    name: "frontend-escapes-remote-advisory-text",
    run: async (_helper) => {
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showMPD: true, showSPCMD: true
      };
      // Every character escapeHtml claims to handle: < > " ' &
      const hostile = `<img src=x onerror="alert(1)&'">`;
      const payload = noRiskPayloadWithAdvisory({
        spcMD: [{ label: `SPC MD ${hostile}`, hazardType: null }],
        mpd: [{ label: `WPC MPD ${hostile}`, hazardType: `Heavy rainfall ${hostile}` }]
      });
      const out = renderDom(frontend, { config, spcrisk: payload });

      if (out.includes("<img")) {
        throw new Error(`remote advisory text reached innerHTML unescaped: ${out}`);
      }
      // Vacuity guard: if the advisory did not render at all, the assertion above is
      // satisfied by an empty string and proves nothing. All three hostile fields — the SPC
      // label, the MPD label and the MPD hazard type — must be present AND escaped.
      const escapes = (out.match(/&lt;img/g) || []).length;
      if (escapes !== 3) {
        throw new Error(
          `expected all three hostile fields (SPC label, MPD label, MPD hazard type) to render escaped, ` +
          `found ${escapes} in: ${out}`
        );
      }
      for (const [raw, escaped] of [['"', "&quot;"], ["'", "&#39;"], ["&", "&amp;"]]) {
        if (!out.includes(escaped)) {
          throw new Error(`remote text containing ${raw} did not render as ${escaped}: ${out}`);
        }
      }
    }
  },
  {
    // T-16-25: hazardsRoutes()'s default table must itself be quiet — installed via
    // installHttp with zero overrides, it must not set anyStale on its own. This is pinned
    // separately from every other hazards-* scenario (which override one or more layers)
    // because a quiet-by-default regression in an UNoverridden layer could hide behind an
    // override elsewhere; this scenario overrides nothing.
    name: "hazards-routes-are-quiet-by-default",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      helper._products = { showHazardsOutlook: true };
      installHttp(helper, hazardsRoutes());
      const out = await helper.getSpcOutlook(
        PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true }
      );
      assertPayloadIntact(out);
      assertHazardsBlockIntact(out);
      const keyCount = Object.keys(out.hazardsOutlook).length;
      if (keyCount !== 13) {
        throw new Error(`hazardsRoutes()'s default table produced ${keyCount} hazardsOutlook keys, expected 13`);
      }
      if (out._stale) {
        throw new Error("hazardsRoutes()'s default (all-quiet) table set anyStale — WR-02's trap");
      }
    }
  },
  {
    // HAZ-01, D-04: the day-bucketing arithmetic has no live example to validate against —
    // both live Precipitation layers returned zero features on 2026-08-26 — so this
    // synthetic fixture carries that weight. Layer 4 (precipitation, dayRange [3,7]) is
    // given a two-day "Heavy Rain" span (offsets 3-4, NOT the full [3,7] nominal window, so
    // it must bucket per-day rather than route to the window band) and a one-day "Heavy
    // Snow" (offset 5).
    name: "hazards-precip-spread-buckets-every-day-in-span",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      helper._products = { showHazardsOutlook: true };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        const layer4Body = hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 30) }),
          hazardsFeature({ label: "Heavy Snow", startDate: Date.UTC(2026, 7, 31), endDate: Date.UTC(2026, 7, 31) })
        ]);
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: layer4Body, etag: "hazards-precip-v1" })
        }));
        const out = await helper.getSpcOutlook(
          PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true }
        );
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);

        // Precondition guard: prove the fixture actually reached the payload before
        // asserting on emptiness elsewhere, so a fixture that never reached the runner
        // cannot pass by rendering nothing everywhere.
        const reachedCount = out.hazardsOutlook.day3.hazards.length + out.hazardsOutlook.day5.hazards.length;
        if (reachedCount !== 2) {
          throw new Error(
            `precondition failed: expected the fixture's two features to reach day3/day5, ` +
            `got day3=${out.hazardsOutlook.day3.hazards.length} day5=${out.hazardsOutlook.day5.hazards.length}`
          );
        }

        if (!out.hazardsOutlook.day3.hazards.some((h) => h.label === "Heavy Rain")) {
          throw new Error(`day3 expected to contain Heavy Rain, got ${JSON.stringify(out.hazardsOutlook.day3.hazards)}`);
        }
        if (!out.hazardsOutlook.day4.hazards.some((h) => h.label === "Heavy Rain")) {
          throw new Error(`day4 expected to contain Heavy Rain, got ${JSON.stringify(out.hazardsOutlook.day4.hazards)}`);
        }
        if (!out.hazardsOutlook.day5.hazards.some((h) => h.label === "Heavy Snow")) {
          throw new Error(`day5 expected to contain Heavy Snow, got ${JSON.stringify(out.hazardsOutlook.day5.hazards)}`);
        }
        for (let d = 6; d <= 14; d++) {
          if (out.hazardsOutlook[`day${d}`].hazards.length !== 0) {
            throw new Error(`day${d} expected empty, got ${JSON.stringify(out.hazardsOutlook[`day${d}`].hazards)}`);
          }
        }
        if (out.hazardsOutlook.windowBand.length !== 0) {
          throw new Error(`windowBand expected empty, got ${JSON.stringify(out.hazardsOutlook.windowBand)}`);
        }
        if (out.hazardsOutlook.day3.date !== "2026-08-29") {
          throw new Error(`day3.date expected 2026-08-29, got ${out.hazardsOutlook.day3.date}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // HAZ-03 / Pitfall 8: extractPolygons hardcodes f.properties.LABEL (uppercase) at
    // node_helper.js:1005, so this service's row.toValue must read f.properties.label
    // (lowercase) directly off the feature. The control feature carries ONLY the
    // uppercase LABEL — no lowercase label — and must produce NO entry, proving the row
    // reads the lowercase field specifically rather than falling back to whatever the
    // positional parameter happens to carry.
    name: "hazards-lowercase-label-is-read-not-dropped",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      helper._products = { showHazardsOutlook: true };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        const lowercaseFeature = hazardsFeature({
          label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29)
        });
        // Control: ONLY an uppercase LABEL, no lowercase label at all.
        const uppercaseOnlyFeature = {
          type: "Feature",
          properties: {
            LABEL: "Heavy Snow",
            start_date: Date.UTC(2026, 7, 29),
            end_date: Date.UTC(2026, 7, 29),
            idp_filedate: Date.UTC(2026, 7, 29)
          },
          geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
        };
        const layer4Body = hazardsCollection([lowercaseFeature, uppercaseOnlyFeature]);
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: layer4Body, etag: "hazards-label-v1" })
        }));
        const out = await helper.getSpcOutlook(
          PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true }
        );
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);

        if (!out.hazardsOutlook.day3.hazards.some((h) => h.label === "Heavy Rain")) {
          throw new Error(
            `expected day3.hazards to contain Heavy Rain (the lowercase-label feature), ` +
            `got ${JSON.stringify(out.hazardsOutlook.day3.hazards)}`
          );
        }
        if (out.hazardsOutlook.day3.hazards.some((h) => h.label === "Heavy Snow")) {
          throw new Error(
            `control failed: the LABEL-only feature (Heavy Snow) produced an entry — ` +
            `the row is reading the uppercase positional parameter instead of f.properties.label`
          );
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // D-02: same-day co-occurring hazards must render in the registry's declared order,
    // never the ArcGIS response order, because that order can flip between polls on an
    // unchanged forecast. Two runs with two different WRONG response orders must produce
    // the SAME output order — proving the ordering comes from the registry, not the
    // response, which a single-order fixture cannot show.
    name: "hazards-day-order-follows-the-registry-not-the-response",
    run: async (helper) => {
      const registryOrder = PRODUCT_REGISTRY.hazardsOutlook.order;
      const rank = (label) => {
        const idx = registryOrder.indexOf(label);
        return idx === -1 ? registryOrder.length : idx;
      };
      const labels = ["Heavy Ice", "Heavy Rain", "Severe Weather"];
      const expectedOrder = [...labels].sort((a, b) => rank(a) - rank(b) || a.localeCompare(b));

      const runWithOrder = async (orderedLabels) => {
        resetHelper(helper);
        resetLogs();
        helper._nowMs = () => HAZARDS_NOW_MS;
        helper._products = { showHazardsOutlook: true };
        const originalPointInPolygon = turfStub.pointInPolygon;
        turfStub.pointInPolygon = () => true;
        try {
          const layer4Body = hazardsCollection(
            orderedLabels.map((label) => hazardsFeature({
              label, startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29)
            }))
          );
          installHttp(helper, hazardsRoutes({
            4: () => httpResponse({ body: layer4Body, etag: "hazards-order-v1" })
          }));
          const out = await helper.getSpcOutlook(
            PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true }
          );
          assertPayloadIntact(out);
          assertHazardsBlockIntact(out);
          return out.hazardsOutlook.day3.hazards.map((h) => h.label);
        } finally {
          turfStub.pointInPolygon = originalPointInPolygon;
        }
      };

      const firstRun = await runWithOrder(["Heavy Ice", "Heavy Rain", "Severe Weather"]);
      if (JSON.stringify(firstRun) !== JSON.stringify(expectedOrder)) {
        throw new Error(
          `first response order: expected day3 order ${JSON.stringify(expectedOrder)}, got ${JSON.stringify(firstRun)}`
        );
      }

      // Control: a DIFFERENT wrong response order must produce the SAME output order.
      const secondRun = await runWithOrder(["Heavy Rain", "Severe Weather", "Heavy Ice"]);
      if (JSON.stringify(secondRun) !== JSON.stringify(expectedOrder)) {
        throw new Error(
          `control (second response order): expected day3 order ${JSON.stringify(expectedOrder)}, ` +
          `got ${JSON.stringify(secondRun)}`
        );
      }
    }
  },
  {
    // D-11: an unmapped label must render verbatim in the default style AND be logged
    // exactly once per process, not once per feature — the runner's
    // `_loggedUnmappedHazardLabels` ledger is what makes that possible. The control is a
    // mapped label in the same run, which must produce no log line at all — proving the
    // log fires on the unmapped condition specifically, not on every feature.
    // Assumption drift (advisory): the plan names "Frost/Freeze" as the never-observed-live
    // unmapped label, but PRODUCT_REGISTRY.hazardsOutlook.displayColor already maps it
    // ("c500ff") in the current registry — using it here would make this a mapped-label
    // scenario, not an unmapped one. "Dense Fog" is used instead: confirmed absent from
    // both displayColor and every other label set (excludedLabels/droughtLabels/order) at
    // the time this scenario was written.
    name: "hazards-unmapped-label-renders-verbatim-and-logs-once",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      helper._products = { showHazardsOutlook: true };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        const layer4Body = hazardsCollection([
          hazardsFeature({ label: "Dense Fog", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29) }),
          hazardsFeature({ label: "Dense Fog", startDate: Date.UTC(2026, 7, 31), endDate: Date.UTC(2026, 7, 31) }),
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 30), endDate: Date.UTC(2026, 7, 30) })
        ]);
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: layer4Body, etag: "hazards-unmapped-v1" })
        }));
        const out = await helper.getSpcOutlook(
          PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true }
        );
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);

        const fogDay3 = out.hazardsOutlook.day3.hazards.find((h) => h.label === "Dense Fog");
        const fogDay5 = out.hazardsOutlook.day5.hazards.find((h) => h.label === "Dense Fog");
        if (!fogDay3 || fogDay3.mapped !== false || fogDay3.color !== PRODUCT_REGISTRY.hazardsOutlook.defaultColor) {
          throw new Error(`day3 Dense Fog expected mapped:false, color:${PRODUCT_REGISTRY.hazardsOutlook.defaultColor}, got ${JSON.stringify(fogDay3)}`);
        }
        if (!fogDay5 || fogDay5.mapped !== false || fogDay5.color !== PRODUCT_REGISTRY.hazardsOutlook.defaultColor) {
          throw new Error(`day5 Dense Fog expected mapped:false, color:${PRODUCT_REGISTRY.hazardsOutlook.defaultColor}, got ${JSON.stringify(fogDay5)}`);
        }

        // Control: a mapped label in the same run must have mapped:true, its registry
        // color, and produce NO log line.
        const heavyRain = out.hazardsOutlook.day4.hazards.find((h) => h.label === "Heavy Rain");
        const expectedHeavyRainColor = PRODUCT_REGISTRY.hazardsOutlook.displayColor["Heavy Rain"];
        if (!heavyRain || heavyRain.mapped !== true || heavyRain.color !== expectedHeavyRainColor) {
          throw new Error(`day4 Heavy Rain expected mapped:true, color:${expectedHeavyRainColor}, got ${JSON.stringify(heavyRain)}`);
        }

        const fogLogLines = logCalls.filter((line) => line.includes("Dense Fog"));
        if (fogLogLines.length !== 1) {
          throw new Error(`expected exactly one log line naming Dense Fog, got ${fogLogLines.length}: ${JSON.stringify(logCalls)}`);
        }
        const heavyRainLogLines = logCalls.filter((line) => line.includes("Heavy Rain"));
        if (heavyRainLogLines.length !== 0) {
          throw new Error(`control failed: the mapped label Heavy Rain produced a log line: ${JSON.stringify(heavyRainLogLines)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // WSSI-03 precedent, DATA-02: all six layers return a genuinely empty
    // FeatureCollection. This must resolve to a clean, unflagged all-clear, and the
    // precondition guard proves the six URLs were actually requested — otherwise "no
    // rows and not stale" would be satisfied by the runner never having run at all.
    name: "hazards-zero-feature-layers-render-nothing-and-are-not-stale",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      helper._products = { showHazardsOutlook: true };
      const fetchFn = installHttp(helper, hazardsRoutes());
      const out = await helper.getSpcOutlook(
        PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true }
      );
      assertPayloadIntact(out);
      assertHazardsBlockIntact(out);

      for (const layer of PRODUCT_REGISTRY.hazardsOutlook.layers) {
        const url = HAZARDS_URLS[layer.id];
        if (!fetchFn.calls.some((c) => c.url === url)) {
          throw new Error(`precondition failed: hazards layer ${layer.id}'s URL was never requested (${url})`);
        }
      }
      for (let d = 3; d <= 14; d++) {
        if (out.hazardsOutlook[`day${d}`].hazards.length !== 0) {
          throw new Error(`day${d} expected empty, got ${JSON.stringify(out.hazardsOutlook[`day${d}`].hazards)}`);
        }
      }
      if (out.hazardsOutlook.windowBand.length !== 0) {
        throw new Error(`windowBand expected empty, got ${JSON.stringify(out.hazardsOutlook.windowBand)}`);
      }
      if (out._stale) {
        throw new Error("a zero-feature response on every layer must not be flagged stale");
      }
    }
  },
  {
    // Phase 14 D-05: the toggle off must still emit the full zero-valued hazardsOutlook
    // block, and no hazards URL may ever be requested while the toggle is off — real
    // (non-empty) bodies are routed on every layer specifically to prove the toggle, not
    // an empty-body coincidence, is what keeps the block empty.
    name: "hazards-toggle-off-emits-the-full-block-and-fetches-nothing",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      helper._products = { showHazardsOutlook: false };
      const realBody = () => httpResponse({
        body: hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29) })
        ]),
        etag: "hazards-toggle-off-v1"
      });
      const fetchFn = installHttp(helper, hazardsRoutes({ 1: realBody, 3: realBody, 4: realBody, 6: realBody, 7: realBody, 8: realBody }));
      const out = await helper.getSpcOutlook(
        PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: false }
      );
      assertPayloadIntact(out);
      assertHazardsBlockIntact(out);
      for (let d = 3; d <= 14; d++) {
        if (out.hazardsOutlook[`day${d}`].hazards.length !== 0) {
          throw new Error(`day${d} expected empty with the toggle off, got ${JSON.stringify(out.hazardsOutlook[`day${d}`].hazards)}`);
        }
      }
      if (out.hazardsOutlook.windowBand.length !== 0) {
        throw new Error(`windowBand expected empty with the toggle off, got ${JSON.stringify(out.hazardsOutlook.windowBand)}`);
      }
      if (out._stale) {
        throw new Error("the toggle-off block must not be flagged stale");
      }
      const hazardsUrlValues = Object.values(HAZARDS_URLS);
      const fetchedHazardsUrl = fetchFn.calls.find((c) => hazardsUrlValues.includes(c.url));
      if (fetchedHazardsUrl) {
        throw new Error(`fetchGeoJsonCached was called with a hazards URL while the toggle was off: ${fetchedHazardsUrl.url}`);
      }
    }
  },
  {
    // D-09: these three labels originate from the National Flood Outlook, a separate NOAA
    // product outside v2.0's scope that rides inside the Precipitation layers' attributes;
    // rendering them would attribute another product's data to the Hazards Outlook. There is
    // deliberately no config path that re-enables them. Three runs — bare toggle-on,
    // showDrought:true, and a truthy non-boolean showDrought — prove a truthy showDrought
    // cannot become an accidental un-filter for a completely unrelated exclusion (HAZ-04).
    // Control (this is what makes the scenario non-vacuous): Heavy Rain must be present in
    // all three runs — without it, "no Flooding" would be satisfied by the fixture never
    // reaching the runner at all.
    name: "hazards-flooding-labels-never-appear-under-any-toggle",
    run: async (helper) => {
      // T-16-23 / Phase 15 D-10: the three labels are literals here (RESEARCH.md's Colors
      // table), NOT read from PRODUCT_REGISTRY.hazardsOutlook.excludedLabels for FIXTURE
      // construction. Building the fixture that tests a filter from the exact mutable field
      // that filter reads is the "fixture that cannot express its own condition" vacuity
      // mode: emptying the registry's excludedLabels would silently empty this fixture too,
      // and the scenario would pass while proving nothing (confirmed live against this exact
      // mutation while writing this scenario). The registry is still consulted immediately
      // below, as a staleness guard on the literals, not as the fixture's input.
      const floodingLabels = ["Flooding Likely", "Flooding Occurring or Imminent", "Flooding Possible"];
      const registryLabels = PRODUCT_REGISTRY.hazardsOutlook.excludedLabels;
      if (JSON.stringify([...floodingLabels].sort()) !== JSON.stringify([...registryLabels].sort())) {
        throw new Error(
          `this scenario's literal Flooding label set has drifted from the registry's excludedLabels — ` +
          `update both: literal=${JSON.stringify(floodingLabels)}, registry=${JSON.stringify(registryLabels)}`
        );
      }

      const runWithToggles = async (toggles) => {
        resetHelper(helper);
        resetLogs();
        helper._nowMs = () => HAZARDS_NOW_MS;
        helper._products = toggles;
        const originalPointInPolygon = turfStub.pointInPolygon;
        turfStub.pointInPolygon = () => true;
        try {
          const layer4Body = hazardsCollection([
            ...floodingLabels.map((label) => hazardsFeature({
              label, startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29)
            })),
            hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29) })
          ]);
          installHttp(helper, hazardsRoutes({
            4: () => httpResponse({ body: layer4Body, etag: "hazards-flooding-v1" })
          }));
          const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
          assertPayloadIntact(out);
          assertHazardsBlockIntact(out);
          return out;
        } finally {
          turfStub.pointInPolygon = originalPointInPolygon;
        }
      };

      for (const toggles of [
        { showHazardsOutlook: true },
        { showHazardsOutlook: true, showDrought: true },
        { showHazardsOutlook: true, showDrought: "yes" }
      ]) {
        const out = await runWithToggles(toggles);
        const serialized = JSON.stringify(out.hazardsOutlook);
        if (serialized.includes("Flooding")) {
          throw new Error(`toggles=${JSON.stringify(toggles)}: a Flooding label reached the payload: ${serialized}`);
        }
        if (!out.hazardsOutlook.day3.hazards.some((h) => h.label === "Heavy Rain")) {
          throw new Error(
            `toggles=${JSON.stringify(toggles)}: control failed — Heavy Rain did not reach the payload, ` +
            `so "no Flooding" proves nothing`
          );
        }
      }
    }
  },
  {
    // D-10: Drought is gated by showDrought (strict === true), NOT excluded — it must be
    // hidden at the shipped default and shown only on explicit opt-in. The truthy
    // non-boolean run ("yes") proves the gate is strict-true, not merely truthy. The
    // control in every run is "Critical Wildfire Risk": the Wildfire/Drought layer
    // multiplexes both families on the same `label` attribute, so a filter that removed the
    // WHOLE layer rather than just the drought labels would pass a naive "no drought" check.
    // Live finding (2026-08-26): layer 7 returned 26x Severe Drought and zero Critical
    // Wildfire Risk, so at the shipped default this layer currently renders nothing — a
    // correct outcome, not a bug, and not what this scenario is pinning (this fixture drives
    // both labels synthetically to prove the gate, independent of what is live today).
    // ROADMAP criterion 4 is verified at the shipped default (showDrought: false), which
    // this satisfies — drought display is an explicit user opt-in, not a violation, so a
    // verifier reading criterion 4 as an absolute prohibition would fail a correct
    // implementation.
    name: "hazards-drought-is-hidden-at-the-default-and-shown-only-on-opt-in",
    run: async (helper) => {
      const layer7Body = hazardsCollection([
        hazardsFeature({ label: "Severe Drought", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 8, 2) }),
        hazardsFeature({ label: "Critical Wildfire Risk", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 8, 2) })
      ]);
      const layer8Body = hazardsCollection([
        hazardsFeature({ label: "Rapid Onset Drought Risk", startDate: Date.UTC(2026, 8, 3), endDate: Date.UTC(2026, 8, 9) })
      ]);

      const runWithToggles = async (toggles) => {
        resetHelper(helper);
        resetLogs();
        helper._nowMs = () => HAZARDS_NOW_MS;
        helper._products = toggles;
        const originalPointInPolygon = turfStub.pointInPolygon;
        turfStub.pointInPolygon = () => true;
        try {
          installHttp(helper, hazardsRoutes({
            7: () => httpResponse({ body: layer7Body, etag: "hazards-drought-7-v1" }),
            8: () => httpResponse({ body: layer8Body, etag: "hazards-drought-8-v1" })
          }));
          const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
          assertPayloadIntact(out);
          assertHazardsBlockIntact(out);
          return out;
        } finally {
          turfStub.pointInPolygon = originalPointInPolygon;
        }
      };

      const atDefault = await runWithToggles({ showHazardsOutlook: true });
      const defaultBand = JSON.stringify(atDefault.hazardsOutlook.windowBand);
      if (defaultBand.includes("Severe Drought") || defaultBand.includes("Rapid Onset Drought Risk")) {
        throw new Error(`default toggles: a drought label reached windowBand: ${defaultBand}`);
      }
      if (!atDefault.hazardsOutlook.windowBand.some((e) => e.label === "Critical Wildfire Risk")) {
        throw new Error(`default toggles: control failed — Critical Wildfire Risk did not reach windowBand: ${defaultBand}`);
      }

      // Truthy non-boolean opt-in must NOT unlock drought — D-10's strict `=== true` gate.
      const truthyNonBoolean = await runWithToggles({ showHazardsOutlook: true, showDrought: "yes" });
      const truthyBand = JSON.stringify(truthyNonBoolean.hazardsOutlook.windowBand);
      if (truthyBand.includes("Severe Drought") || truthyBand.includes("Rapid Onset Drought Risk")) {
        throw new Error(`showDrought:"yes" (truthy non-boolean): a drought label reached windowBand: ${truthyBand}`);
      }
      if (!truthyNonBoolean.hazardsOutlook.windowBand.some((e) => e.label === "Critical Wildfire Risk")) {
        throw new Error(`showDrought:"yes": control failed — Critical Wildfire Risk did not reach windowBand: ${truthyBand}`);
      }

      const optedIn = await runWithToggles({ showHazardsOutlook: true, showDrought: true });
      const bandLabels = optedIn.hazardsOutlook.windowBand.map((e) => e.label);
      for (const label of PRODUCT_REGISTRY.hazardsOutlook.droughtLabels) {
        if (!bandLabels.includes(label)) {
          throw new Error(`showDrought:true: expected ${label} in windowBand, got ${JSON.stringify(bandLabels)}`);
        }
      }
      if (!bandLabels.includes("Critical Wildfire Risk")) {
        throw new Error(`showDrought:true: control failed — Critical Wildfire Risk missing from windowBand: ${JSON.stringify(bandLabels)}`);
      }
    }
  },
  {
    // HAZ-04, end to end: CR-01's lesson — the suite asserted on the payload and stopped
    // there, which is how a total outage came to render as a confident all-clear while a
    // payload assertion reported the guarantee as met. HAZ-04 is a *display* requirement;
    // it must be proven at the display, not just in the payload.
    name: "hazards-frontend-renders-no-flooding-or-drought-at-the-default",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      const toggles = { showHazardsOutlook: true };
      helper._products = toggles;
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        const layer4Body = hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29) }),
          hazardsFeature({
            label: PRODUCT_REGISTRY.hazardsOutlook.excludedLabels[0],
            startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29)
          })
        ]);
        const layer7Body = hazardsCollection([
          hazardsFeature({ label: "Severe Drought", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 8, 2) }),
          hazardsFeature({ label: "Critical Wildfire Risk", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 8, 2) })
        ]);
        const layer8Body = hazardsCollection([
          hazardsFeature({ label: "Rapid Onset Drought Risk", startDate: Date.UTC(2026, 8, 3), endDate: Date.UTC(2026, 8, 9) })
        ]);
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: layer4Body, etag: "hazards-e2e-4-v1" }),
          7: () => httpResponse({ body: layer7Body, etag: "hazards-e2e-7-v1" }),
          8: () => httpResponse({ body: layer8Body, etag: "hazards-e2e-8-v1" })
        }));
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }

      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showHazardsOutlook: true, showDrought: false
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (rendered.includes("Flooding")) {
        throw new Error(`rendered markup contains Flooding at the shipped default: ${rendered}`);
      }
      if (rendered.includes("Drought")) {
        throw new Error(`rendered markup contains Drought at the shipped default: ${rendered}`);
      }
      if (!rendered.includes("Heavy Rain")) {
        throw new Error(`control failed: Heavy Rain missing from rendered markup: ${rendered}`);
      }
      if (!rendered.includes("Critical Wildfire Risk")) {
        throw new Error(`control failed: Critical Wildfire Risk missing from rendered markup: ${rendered}`);
      }
    }
  },
  {
    // 16-RESEARCH.md "Newly identified pitfall: day-offset drift on a cache hit" — the
    // phase's highest-risk item. This product's day key is a property of the CLOCK: a
    // feature fixed at Aug 29 00:00Z is day3 on Aug 26 and day2 on Aug 27, with unchanged
    // bytes and an ETag that never fires. ero-rejected-body-serves-last-known-good's
    // warm/degrade two-phase structure is the model to COPY; its
    // `out.excessiveRain.day1Risk !== "SLGT"` assertion of BYTE-IDENTICAL output across a
    // cache hit is exactly INVERTED here — ERO's day key lives in the URL and cannot move
    // on a hit; this product's day key lives in the clock and MUST move on a hit. With the
    // confirmed Mon-Fri-only cadence, every weekend poll and every between-issuance poll is
    // exactly this state.
    name: "hazards-day-keys-shift-on-a-cache-hit-when-the-day-advances",
    run: async (helper) => {
      const originalPointInPolygon = turfStub.pointInPolygon;
      try {
        // --- Steps 1-6: the headline negative case — the hazard falls OFF the grid ---
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
        helper._nowMs = () => HAZARDS_NOW_MS; // Wed Aug 26 2026 13:00Z
        helper._products = { showHazardsOutlook: true };
        const singleFeature = hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29) })
        ]);
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: singleFeature, etag: "hazards-v1" })
        }));

        const wed = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(wed);
        assertHazardsBlockIntact(wed);
        if (wed.hazardsOutlook.day3.hazards.length !== 1 || wed.hazardsOutlook.day3.hazards[0].label !== "Heavy Rain") {
          throw new Error(`warm-up: expected day3 to carry one Heavy Rain hazard, got ${JSON.stringify(wed.hazardsOutlook.day3.hazards)}`);
        }
        if ("day2" in wed.hazardsOutlook) {
          throw new Error("warm-up: hazardsOutlook unexpectedly carries a day2 key — the grid must start at day3");
        }
        if (wed.hazardsOutlook.day4.hazards.length !== 0) {
          throw new Error(`warm-up: day4 expected empty, got ${JSON.stringify(wed.hazardsOutlook.day4.hazards)}`);
        }

        // Precondition guard — the cache must actually be warm and clock-independent, or
        // the drift assertions below cannot distinguish a correct re-bucketing from a
        // lucky replay (the exact vacuity mode that made Phase 15's 15-05 mutation yield
        // zero RED scenarios).
        const entry = helper._geoJsonCache.get(HAZARDS_URLS[4]);
        if (!entry) {
          throw new Error("precondition failed: no cache entry for the hazards layer-4 URL — the warm-up poll did not populate the cache");
        }
        const cachedJson = JSON.stringify(entry.result);
        if (/day\d|offsetStart|offsetEnd|dayOffset/.test(cachedJson)) {
          throw new Error(
            "precondition failed: the cached entry carries a clock-dependent field, so the drift assertion below " +
            `cannot distinguish a correct re-bucketing from a lucky replay: ${cachedJson}`
          );
        }

        // Advance the clock 24h with NO upstream change — the SAME body, the SAME ETag, so
        // the fetch legitimately hash/ETag-hits and the runner takes the cache path. Do not
        // change a single byte of the fixture.
        helper._nowMs = () => Date.UTC(2026, 7, 27, 13, 0); // Thursday
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: singleFeature, etag: "hazards-v1" })
        }));

        const thu = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(thu);
        assertHazardsBlockIntact(thu);
        if (thu.hazardsOutlook.day2 !== undefined) {
          throw new Error("thu: hazardsOutlook unexpectedly carries a day2 key — the grid must still start at day3");
        }
        for (let d = 3; d <= 14; d++) {
          if (thu.hazardsOutlook[`day${d}`].hazards.length !== 0) {
            throw new Error(
              "day-offset drift: a cache hit replayed the previous day's bucketing — Heavy Rain fixed at Aug 29 " +
              "is day3 on Aug 26 and day2 on Aug 27 (offset 2, outside the 3..14 grid, so it must render on NO " +
              `day), and the ETag never fires because the bytes did not change. Found a hazard surviving on ` +
              `day${d}: ${JSON.stringify(thu.hazardsOutlook[`day${d}`].hazards)}`
            );
          }
        }
        if (thu.hazardsOutlook.day3.date !== "2026-08-30") {
          throw new Error(`D-01: thu.hazardsOutlook.day3.date expected 2026-08-30 (the date labels advance too), got ${thu.hazardsOutlook.day3.date}`);
        }

        // --- Step 7: the positive half — proves re-bucketing actually RECOMPUTES rather
        // than merely emptying. Warm on a Monday (Aug 29 is offset 5), advance to the
        // following Wednesday (offset 3) with the same bytes/etag, and the hazard must MOVE
        // from day5 to day3, not simply vanish from day5.
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
        helper._nowMs = () => Date.UTC(2026, 7, 24); // Monday
        helper._products = { showHazardsOutlook: true };
        const fetchFn = installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: singleFeature, etag: "hazards-v1" })
        }));

        const mon = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(mon);
        assertHazardsBlockIntact(mon);
        if (mon.hazardsOutlook.day5.hazards.length !== 1 || mon.hazardsOutlook.day5.hazards[0].label !== "Heavy Rain") {
          throw new Error(`positive-half warm-up: expected day5 (Monday + 5 = Aug 29) to carry Heavy Rain, got ${JSON.stringify(mon.hazardsOutlook.day5.hazards)}`);
        }
        if (mon.hazardsOutlook.day3.hazards.length !== 0) {
          throw new Error(`positive-half warm-up: expected day3 empty, got ${JSON.stringify(mon.hazardsOutlook.day3.hazards)}`);
        }

        helper._nowMs = () => Date.UTC(2026, 7, 26); // Wednesday, 2 days later — a cache hit
        const wed2 = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(wed2);
        assertHazardsBlockIntact(wed2);
        if (wed2.hazardsOutlook.day3.hazards.length !== 1 || wed2.hazardsOutlook.day3.hazards[0].label !== "Heavy Rain") {
          throw new Error(
            `expected day key 3 (Wednesday + 3 = Aug 29) after a cache hit, got day3=${JSON.stringify(wed2.hazardsOutlook.day3.hazards)}, ` +
            `day5=${JSON.stringify(wed2.hazardsOutlook.day5.hazards)} — a cache hit must re-derive the day key against the new clock, not replay the old one`
          );
        }
        if (wed2.hazardsOutlook.day5.hazards.length !== 0) {
          throw new Error(`expected day5 now empty (the hazard moved to day3), got ${JSON.stringify(wed2.hazardsOutlook.day5.hazards)}`);
        }

        // Step 9: the cache path taken on the second poll above is a real conditional
        // request against a warm cache entry, not a skipped fetch and not "recompute from
        // scratch every poll" (the vacuity M4 proves against) — "the day keys changed"
        // cannot be explained by the second poll never having run, and the second
        // request's If-None-Match proves a real cache entry was written and consulted.
        const layer4Requests = fetchFn.calls.filter((c) => c.url === HAZARDS_URLS[4]);
        if (layer4Requests.length !== 2) {
          throw new Error(`expected the layer-4 URL requested on both polls of the positive half, got ${layer4Requests.length} calls`);
        }
        if (layer4Requests[1].headers["If-None-Match"] !== "hazards-v1") {
          throw new Error(
            "expected the second poll's request to carry If-None-Match: hazards-v1, proving a real cache entry " +
            `was written by the first poll and consulted by the second, got headers=${JSON.stringify(layer4Requests[1].headers)}`
          );
        }

        // --- Step 8: control — with the clock held FIXED across two polls and the same
        // bytes, the two payloads' hazardsOutlook blocks must be deep-equal. Without this,
        // the drift assertions above would be satisfied by an implementation that simply
        // discards its cache and produces arbitrary-but-correct output on every poll — the
        // fix degrading into "never cache anything".
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
        helper._nowMs = () => Date.UTC(2026, 7, 24);
        helper._products = { showHazardsOutlook: true };
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: singleFeature, etag: "hazards-v1" })
        }));
        const controlA = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        const controlB = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        if (JSON.stringify(controlA.hazardsOutlook) !== JSON.stringify(controlB.hazardsOutlook)) {
          throw new Error(
            "control failed: two polls with the clock held fixed and identical bytes produced different " +
            `hazardsOutlook blocks — the fix degraded into "never cache anything": ` +
            `${JSON.stringify(controlA.hazardsOutlook)} vs ${JSON.stringify(controlB.hazardsOutlook)}`
          );
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // HAZ-02 / T-16-28: Temperature and Wildfire/Drought hazards route to the window band
    // unconditionally (HAZ-02), independent of the day3..day14 grid — a location inside a
    // live "Hazardous Heat" window can have every day array empty. Before this scenario the
    // no-risk gate's day-grid term alone would let exactly this payload short-circuit to a
    // confident "No Severe Weather Risk" — the Phase 15 getDom regression class, which
    // shipped live once (the MPD-invisible defect).
    name: "frontend-hazards-window-band-only-is-not-an-all-clear",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showHazardsOutlook: true, showDrought: false
      };

      const windowOnlyBlock = emptyHazardsBlock();
      windowOnlyBlock.windowBand = [{
        label: "Hazardous Heat", color: "a80000", mapped: true,
        startDate: "2026-08-29", endDate: "2026-09-02", offsetStart: 3, offsetEnd: 7
      }];

      // Precondition guard: prove the fixture actually produced an empty day grid before
      // asserting anything about the window-band term — otherwise this scenario would pass
      // through the day-grid gate term and prove nothing about the window-band term.
      for (let d = 3; d <= 14; d++) {
        if (windowOnlyBlock[`day${d}`].hazards.length !== 0) {
          throw new Error(`precondition failed: day${d} is not empty, so this scenario would pass through the day-grid gate term and prove nothing about the window-band term`);
        }
      }
      if (windowOnlyBlock.windowBand.length !== 1) {
        throw new Error(`precondition failed: expected exactly one windowBand entry, got ${windowOnlyBlock.windowBand.length}`);
      }

      const payload = noRiskPayloadWithHazards(windowOnlyBlock);
      const rendered = renderDom(frontend, { config, spcrisk: payload });
      if (rendered === "No Severe Weather Risk") {
        throw new Error(
          "HAZ-02: a window-band-only payload short-circuited to a confident all-clear — a location inside a " +
          "Hazardous Heat polygon with no day-resolved hazards. This is the Phase 15 getDom regression class, " +
          "which shipped live once."
        );
      }
      if (!rendered.includes("Hazardous Heat")) {
        throw new Error(`expected the window-band hazard to render, got: ${rendered}`);
      }

      // Control 1: the same shape with an empty windowBand must render exactly the plain
      // no-risk line, or the positive assertion above is satisfied by the gate simply
      // never firing.
      const controlPayload = noRiskPayloadWithHazards(emptyHazardsBlock());
      const controlRendered = renderDom(frontend, { config, spcrisk: controlPayload });
      if (controlRendered !== "No Severe Weather Risk") {
        throw new Error(`control: an empty-windowBand payload no longer short-circuits, it rendered: ${controlRendered}`);
      }

      // Control 2 (WR-09): the same populated payload with showHazardsOutlook: false must
      // still short-circuit — content the config disabled must not disqualify the gate for
      // a band that will not render.
      const disabledConfig = { ...config, showHazardsOutlook: false };
      const disabledRendered = renderDom(frontend, { config: disabledConfig, spcrisk: payload });
      if (disabledRendered !== "No Severe Weather Risk") {
        throw new Error(`control: a populated windowBand payload with showHazardsOutlook:false no longer short-circuits, it rendered: ${disabledRendered}`);
      }
    }
  },
  {
    // 16-REVIEW WR-04 regression target — the mirror image of CR-01, on the frontend.
    // The no-risk gate counted every windowBand entry while renderHazardsWindowBand
    // dropped entries whose window had already elapsed (`offsetEnd < 0`). A payload whose
    // band held ONLY elapsed entries therefore disqualified the short-circuit, rendered
    // nothing at all (the "Extended Hazards:" heading is written inside the loop, AFTER
    // the `continue`), fell through to the contentMarker comparison, and printed the
    // "(unconfirmed)" variant on data that was neither stale nor degraded — a FALSE
    // staleness signal. The fix is one shared `renderableWindowEntries` predicate read by
    // both the gate and the renderer, so the two cannot drift again.
    name: "frontend-hazards-elapsed-band-is-not-a-false-staleness-signal",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showHazardsOutlook: true, showDrought: false
      };

      // A wholly-elapsed window. Reachable: _bucketHazardMatch rejects an inverted span but
      // imposes no lower bound on the band path, so a backfill, a correction, or a
      // multi-day upstream stall can put a past window here.
      const elapsedBlock = emptyHazardsBlock();
      elapsedBlock.windowBand = [{
        label: "Hazardous Heat", color: "a80000", mapped: true,
        startDate: "2026-08-20", endDate: "2026-08-24", offsetStart: -6, offsetEnd: -2
      }];
      for (let d = 3; d <= 14; d++) {
        if (elapsedBlock[`day${d}`].hazards.length !== 0) {
          throw new Error(`precondition failed: day${d} is not empty, so the day-grid term would carry this scenario`);
        }
      }

      const rendered = renderDom(frontend, { config, spcrisk: noRiskPayloadWithHazards(elapsedBlock) });
      if (rendered.includes("unconfirmed")) {
        throw new Error(
          "WR-04: a band of only-elapsed entries produced the \"(unconfirmed)\" staleness variant on data that " +
          `is neither stale nor degraded — a false staleness signal. Rendered: ${rendered}`
        );
      }
      if (rendered !== "No Severe Weather Risk") {
        throw new Error(
          "WR-04: a band whose every entry has already elapsed has nothing to say, so the plain confident " +
          `all-clear is the correct render. Got: ${rendered}`
        );
      }
      if (rendered.includes("Extended Hazards")) {
        throw new Error(`WR-04: an orphaned "Extended Hazards:" heading was written for a band with no renderable entries: ${rendered}`);
      }

      // Control: the SAME label and shape with a live (non-negative) offsetEnd must still
      // render the band and must NOT short-circuit — otherwise the assertion above is
      // satisfied by the band having stopped working entirely.
      const liveBlock = emptyHazardsBlock();
      liveBlock.windowBand = [{
        label: "Hazardous Heat", color: "a80000", mapped: true,
        startDate: "2026-08-29", endDate: "2026-09-02", offsetStart: 3, offsetEnd: 7
      }];
      const liveRendered = renderDom(frontend, { config, spcrisk: noRiskPayloadWithHazards(liveBlock) });
      if (liveRendered === "No Severe Weather Risk" || !liveRendered.includes("Hazardous Heat")) {
        throw new Error(`control: a live window-band entry no longer renders, it produced: ${liveRendered}`);
      }

      // Control 2: a MIXED band — one elapsed, one live — must render only the live entry
      // and must not short-circuit. This pins the filter to per-entry granularity rather
      // than an all-or-nothing band check.
      const mixedBlock = emptyHazardsBlock();
      mixedBlock.windowBand = [
        { label: "Heavy Snow", color: "0084a8", mapped: true, startDate: "2026-08-20", endDate: "2026-08-24", offsetStart: -6, offsetEnd: -2 },
        { label: "Hazardous Heat", color: "a80000", mapped: true, startDate: "2026-08-29", endDate: "2026-09-02", offsetStart: 3, offsetEnd: 7 }
      ];
      const mixedRendered = renderDom(frontend, { config, spcrisk: noRiskPayloadWithHazards(mixedBlock) });
      if (mixedRendered.includes("Heavy Snow")) {
        throw new Error(`control: an elapsed entry rendered alongside a live one: ${mixedRendered}`);
      }
      if (!mixedRendered.includes("Hazardous Heat")) {
        throw new Error(`control: the live entry in a mixed band did not render: ${mixedRendered}`);
      }
    }
  },
  {
    // HAZ-02's second half: a window-band hazard must appear exactly once in the rendered
    // markup, never repeated across the days of its window — the window band and the day
    // grid are two different renderers, and a window-band entry must never also emit a
    // day-row.
    name: "frontend-hazards-window-hazard-appears-once-not-per-day",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showHazardsOutlook: true, showDrought: false
      };

      const windowOnlyBlock = emptyHazardsBlock();
      windowOnlyBlock.windowBand = [{
        label: "Hazardous Heat", color: "a80000", mapped: true,
        startDate: "2026-08-29", endDate: "2026-09-02", offsetStart: 3, offsetEnd: 7
      }];
      const payload = noRiskPayloadWithHazards(windowOnlyBlock);
      const rendered = renderDom(frontend, { config, spcrisk: payload });
      const occurrences = (rendered.match(/Hazardous Heat/g) || []).length;
      if (occurrences !== 1) {
        throw new Error(`expected "Hazardous Heat" to appear exactly once (the window band, not once per day in its span), got ${occurrences}: ${rendered}`);
      }
      for (let d = 3; d <= 7; d++) {
        if (rendered.includes(`Day ${d})`)) {
          throw new Error(`expected no day-grid row for Day ${d}, but one appears: ${rendered}`);
        }
      }

      // Control: the same label appearing on three separate DAYS in the day grid must
      // render three times — proving the count assertion above is measuring something
      // real, not a renderer that emits nothing for this label.
      const perDayBlock = emptyHazardsBlock();
      for (const d of [3, 4, 5]) {
        perDayBlock[`day${d}`] = {
          date: "2026-08-26",
          hazards: [{ label: "Hazardous Heat", color: "a80000", mapped: true }]
        };
      }
      const perDayPayload = noRiskPayloadWithHazards(perDayBlock);
      const perDayRendered = renderDom(frontend, { config, spcrisk: perDayPayload });
      const perDayOccurrences = (perDayRendered.match(/Hazardous Heat/g) || []).length;
      if (perDayOccurrences !== 3) {
        throw new Error(`control: expected "Hazardous Heat" on three separate days to render three times, got ${perDayOccurrences}: ${perDayRendered}`);
      }
    }
  },
  {
    // DATA-02's headline requirement: a weekend poll's freshest available file is
    // Friday's, aged by the Sat/Sun gap the confirmed Mon-Fri-only cadence produces.
    // T-16-23 / Phase 15 D-10: FRIDAY_FILEDATE/WEDNESDAY_FILEDATE below are literal
    // absolute timestamps (not derived from maxDataAgeHours), chosen to sit inside/outside
    // the CURRENT 84h budget with margin on both sides of a plausible retune (e.g. 48h) —
    // deriving them proportionally from maxDataAgeHours would make M4 (retuning the
    // constant) unable to ever flip the primary assertion, the exact vacuity this file's
    // Flooding-labels scenario already caught once. The guard immediately below instead
    // validates the literals against the live registry value, so a future D-14 retune that
    // invalidates them fails loudly rather than silently.
    name: "hazards-weekend-poll-of-fridays-file-is-not-stale",
    run: async (helper) => {
      const maxAgeHours = PRODUCT_REGISTRY.hazardsOutlook.maxDataAgeHours;
      const SUNDAY_POLL_MS = Date.UTC(2026, 7, 30, 19, 0); // Sunday, 7pm UTC
      const FRIDAY_FILEDATE = Date.UTC(2026, 7, 28, 0, 0); // Friday, midnight UTC issuance
      const WEDNESDAY_FILEDATE = Date.UTC(2026, 7, 26, 0, 0); // the prior Wednesday, midnight UTC

      const fridayAgeHours = Math.round((SUNDAY_POLL_MS - FRIDAY_FILEDATE) / (60 * 60 * 1000));
      const wednesdayAgeHours = Math.round((SUNDAY_POLL_MS - WEDNESDAY_FILEDATE) / (60 * 60 * 1000));
      if (fridayAgeHours >= maxAgeHours) {
        throw new Error(
          `fixture drift: the Friday-file scenario's elapsed ${fridayAgeHours}h is not inside the current ` +
          `maxDataAgeHours budget (${maxAgeHours}h) — update FRIDAY_FILEDATE/SUNDAY_POLL_MS`
        );
      }
      if (wednesdayAgeHours <= maxAgeHours) {
        throw new Error(
          `fixture drift: the control's elapsed ${wednesdayAgeHours}h is not outside the current ` +
          `maxDataAgeHours budget (${maxAgeHours}h) — update WEDNESDAY_FILEDATE`
        );
      }

      const originalPointInPolygon = turfStub.pointInPolygon;
      const runWithFiledate = async (filedate) => {
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
        helper._nowMs = () => SUNDAY_POLL_MS;
        helper._products = { showHazardsOutlook: true };
        const fixture = () => httpResponse({
          body: hazardsCollection([
            hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 8, 2), endDate: Date.UTC(2026, 8, 2), filedate })
          ]),
          etag: "hazards-weekend-v1"
        });
        installHttp(helper, hazardsRoutes({ 1: fixture, 3: fixture, 4: fixture, 6: fixture, 7: fixture, 8: fixture }));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        return out;
      };

      try {
        const fridayOut = await runWithFiledate(FRIDAY_FILEDATE);
        if (fridayOut._stale) {
          throw new Error(
            `DATA-02: a weekend poll of Friday's ${fridayAgeHours}h-old file (inside the ${maxAgeHours}h budget) ` +
            "was flagged stale — today's _isWithinStaleWindow measures time since the last successful FETCH, so " +
            "this false alarm can only come from a newly added data-age check that does not yet account for the " +
            "weekend gap"
          );
        }

        // Control: without this, "not stale on a weekend" would be satisfied by an
        // implementation that never checks age at all — precisely the "no age check"
        // option D-13 rejected.
        const wednesdayOut = await runWithFiledate(WEDNESDAY_FILEDATE);
        if (wednesdayOut._stale !== true) {
          throw new Error(
            `control: a ${wednesdayAgeHours}h-old file (outside the ${maxAgeHours}h budget) was not flagged stale — ` +
            "without a working age check, the primary assertion above proves nothing"
          );
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // D-13: idp_filedate is PER LAYER, not per service — live 2026-08-26 recorded three
    // distinct filedates across six layers in one poll, one ~23h staler than its siblings.
    // A row-level shared timestamp does not exist for this product; "any layer aged out"
    // is the rule. Layer 3 (D8-14 Temperature) carries the aged-out feature here, matching
    // the live finding.
    name: "hazards-idp-filedate-is-evaluated-per-layer-not-shared",
    run: async (helper) => {
      const maxAgeHours = PRODUCT_REGISTRY.hazardsOutlook.maxDataAgeHours;
      const nowMs = HAZARDS_NOW_MS;
      const freshFiledate = nowMs - 1 * 60 * 60 * 1000; // 1h old, comfortably fresh
      const staleFiledate = nowMs - (maxAgeHours + 5) * 60 * 60 * 1000; // 5h past budget

      const freshBody = () => httpResponse({
        body: hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29), filedate: freshFiledate })
        ]),
        etag: "hazards-freshness-fresh-v1"
      });

      const originalPointInPolygon = turfStub.pointInPolygon;
      const runWithLayer3Filedate = async (layer3Filedate) => {
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
        helper._nowMs = () => nowMs;
        helper._products = { showHazardsOutlook: true };
        const layer3Body = () => httpResponse({
          body: hazardsCollection([
            hazardsFeature({
              label: "Much Above Normal Temperatures",
              startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 8, 2), filedate: layer3Filedate
            })
          ]),
          etag: "hazards-freshness-layer3-v1"
        });
        installHttp(helper, hazardsRoutes({
          1: freshBody, 4: freshBody, 6: freshBody, 7: freshBody, 8: freshBody,
          3: layer3Body
        }));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        return out;
      };

      try {
        const staleOut = await runWithLayer3Filedate(staleFiledate);
        // Precondition guard: layer 3's feature actually reached the payload — "stale"
        // cannot be explained by layer 3 having failed to parse.
        const staleBandLabels = staleOut.hazardsOutlook.windowBand.map((e) => e.label);
        if (!staleBandLabels.includes("Much Above Normal Temperatures")) {
          throw new Error(`precondition failed: layer 3's feature did not reach windowBand: ${JSON.stringify(staleBandLabels)}`);
        }
        if (staleOut._stale !== true) {
          throw new Error(
            `D-13: layer 3's idp_filedate is ${maxAgeHours + 5}h old (past the ${maxAgeHours}h budget) while ` +
            "every other layer is fresh, and _stale was not set — a row-level shared timestamp does not exist " +
            "for this product; any layer aged out must trip the badge"
          );
        }

        // Control: the identical fixture with layer 3's filedate fresh must produce a
        // falsy _stale, proving the trip came from layer 3's own timestamp and not from
        // anything else in the run.
        const freshOut = await runWithLayer3Filedate(freshFiledate);
        if (freshOut._stale) {
          throw new Error("control: with every layer's idp_filedate fresh, _stale was still set — the earlier trip is not attributable to layer 3 specifically");
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // 16-REVIEW CR-01 regression target. The D-13 age check used to be guarded by
    // `matches.length > 0`, and `matches` is POST-containment. A layer carrying features
    // with a five-day-old `idp_filedate` therefore raised no staleness signal whenever
    // none of those features contained the user — the MAJORITY case, since most locations
    // sit outside most hazard polygons most of the time. The user who saw content got a
    // correct badge; the user who saw nothing got a confident, unbadged all-clear off
    // stale data. That is the false-negative class this module exists to prevent.
    //
    // `hazards-zero-feature-layers-render-nothing-and-are-not-stale` does NOT cover this:
    // it routes genuinely empty collections, which is the sanctioned case comment (c)
    // describes. This scenario is its complement — features PRESENT, containment FALSE.
    name: "hazards-stale-layer-ages-out-even-when-nothing-contains-the-user",
    run: async (helper) => {
      const maxAgeHours = PRODUCT_REGISTRY.hazardsOutlook.maxDataAgeHours;
      const nowMs = HAZARDS_NOW_MS;
      const staleFiledate = nowMs - (maxAgeHours + 5) * 60 * 60 * 1000; // 5h past budget
      const freshFiledate = nowMs - 1 * 60 * 60 * 1000;

      const originalPointInPolygon = turfStub.pointInPolygon;
      const runWithFiledate = async (filedate) => {
        resetHelper(helper);
        resetLogs();
        // The whole point: features exist and are well-formed, but NOTHING contains the
        // user. resetHelper already defaults this to false; set it explicitly so the
        // scenario states its own precondition rather than inheriting it.
        turfStub.pointInPolygon = () => false;
        helper._nowMs = () => nowMs;
        helper._products = { showHazardsOutlook: true };
        const body = () => httpResponse({
          body: hazardsCollection([
            hazardsFeature({
              label: "Hazardous Heat",
              startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 8, 2), filedate
            })
          ]),
          etag: "hazards-cr01-v1"
        });
        installHttp(helper, hazardsRoutes({ 1: body, 3: body, 4: body, 6: body, 7: body, 8: body }));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        return out;
      };

      try {
        const staleOut = await runWithFiledate(staleFiledate);

        // Precondition guard: prove nothing reached the payload, so "stale" cannot be
        // explained by a match having been found after all. If a future change makes the
        // stub contain the user, this scenario would silently degrade into a duplicate of
        // hazards-data-age-sets-the-badge-but-not-the-age-figure and prove nothing new.
        if (staleOut.hazardsOutlook.windowBand.length !== 0) {
          throw new Error(
            "precondition failed: windowBand is not empty, so nothing about the " +
            "no-containment path is being proven: " + JSON.stringify(staleOut.hazardsOutlook.windowBand)
          );
        }
        for (let d = 3; d <= 14; d++) {
          if (staleOut.hazardsOutlook[`day${d}`].hazards.length !== 0) {
            throw new Error(`precondition failed: day${d} is not empty, so this is not the no-containment path`);
          }
        }

        if (staleOut._stale !== true) {
          throw new Error(
            `CR-01: every layer's idp_filedate is ${maxAgeHours + 5}h old (past the ${maxAgeHours}h budget) ` +
            "but no feature contains the user, and _stale was not set. A stalled feed must age out on its own " +
            "timestamp — the age check must not depend on the user's location, or the majority of users get a " +
            "silent, unbadged all-clear off stale data."
          );
        }

        // Control: the identical fixture — same features, same non-containment — with a
        // fresh filedate must NOT set _stale, proving the trip came from the age check and
        // not from the empty result itself or from some unrelated degrade in the run.
        const freshOut = await runWithFiledate(freshFiledate);
        if (freshOut._stale) {
          throw new Error(
            "control: with every layer's idp_filedate fresh and still nothing containing the user, _stale was " +
            "set anyway — the earlier trip is not attributable to the data age"
          );
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // D-15's deliberate asymmetry: a data-age trip sets the ⚠ badge (`_stale`) but must
    // NOT drag `_staleAsOf` along with it — that field describes FETCH/network recency
    // (Phase 14 D-04), not WPC's own publish age, and a 60+ hour-old hazards file must not
    // make the badge speak for SPC data fetched five minutes ago.
    name: "hazards-data-age-sets-the-badge-but-not-the-age-figure",
    run: async (helper) => {
      const maxAgeHours = PRODUCT_REGISTRY.hazardsOutlook.maxDataAgeHours;
      const nowMs = HAZARDS_NOW_MS;
      const staleFiledate = nowMs - (maxAgeHours + 5) * 60 * 60 * 1000;

      const originalPointInPolygon = turfStub.pointInPolygon;
      try {
        // Every OTHER product quiet — ERO/WSSI toggles omitted (falsy) skip their fetch
        // loops entirely, and SPC MD/MPD's configFlags are likewise omitted, so
        // _runKmlAdvisoryRow returns immediately — nothing else in this run can write
        // _oldestStaleAt, isolating the data-age trip's own effect on _staleAsOf.
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
        helper._nowMs = () => nowMs;
        helper._products = { showHazardsOutlook: true };
        const agedBody = () => httpResponse({
          body: hazardsCollection([
            hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29), filedate: staleFiledate })
          ]),
          etag: "hazards-d15-v1"
        });
        installHttp(helper, hazardsRoutes({ 4: agedBody }));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        if (out._stale !== true) {
          throw new Error(`precondition failed: expected the aged-out layer to set _stale, got ${out._stale}`);
        }
        if (out._staleAsOf !== null && out._staleAsOf !== undefined) {
          throw new Error(
            "D-15: a data-age trip dragged _staleAsOf along with it — this would make the badge speak for SPC " +
            `data fetched moments ago while describing a WPC file up to ${maxAgeHours}h old, got _staleAsOf=${out._staleAsOf}`
          );
        }

        // Control: a genuine fetch failure (warm, then fail within the stale-fallback
        // window) must leave a NUMERIC _staleAsOf via _noteStaleEntry's stale-fallback
        // path — proving the assertion above measures D-15's deliberate omission and not a
        // _staleAsOf this harness simply never populates under any condition.
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true; // resetHelper defaults this to false
        helper._nowMs = () => nowMs;
        helper._products = { showHazardsOutlook: true };
        const freshBody = () => httpResponse({
          body: hazardsCollection([
            hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29) })
          ]),
          etag: "hazards-d15-control-v1"
        });
        installHttp(helper, hazardsRoutes({ 4: freshBody }));
        const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        if (warm._stale) {
          throw new Error("control warm-up: an all-fresh poll was unexpectedly flagged stale");
        }
        helper._updateInterval = 60;
        const entry = helper._geoJsonCache.get(HAZARDS_URLS[4]);
        if (!entry) throw new Error("control warm-up: no cache entry for the hazards layer-4 URL");
        // 17-REVIEW WR-04: derived from the PINNED seam, never Date.now(). This scenario
        // overrides helper._nowMs, and _isWithinStaleWindow compares against _nowMs() — so
        // a raw-clock timestamp made the computed age `HAZARDS_NOW_MS - (realNow - 65min)`,
        // a mix of the pinned seam and the machine clock. It happened to be negative today
        // (so the control passed without ever exercising the 2x-interval window it claims
        // to) and went out of range entirely on a machine whose clock read earlier.
        entry.timestamp = HAZARDS_NOW_MS - 65 * 60 * 1000; // within the 2x-interval stale-fallback window
        installHttp(helper, hazardsRoutes({ 4: () => httpResponse({ status: 503, text: "service unavailable" }) }));
        const failed = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        if (typeof failed._staleAsOf !== "number") {
          throw new Error(
            `control: a genuine fetch failure did not leave a numeric _staleAsOf — got ${failed._staleAsOf}, ` +
            "which would make the primary assertion above vacuous (this harness would never populate " +
            "_staleAsOf under any condition)"
          );
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // D-16, end to end: a data-age trip is an age signal, not a false negative.
    // rejectBody's serve-last-known-good precedent exists precisely so a WPC hiccup during
    // an active hazard does not blank the display; suppressing rows on `_stale` would
    // convert an age signal into exactly that false negative.
    name: "hazards-stale-data-still-renders-its-rows",
    run: async (helper) => {
      const maxAgeHours = PRODUCT_REGISTRY.hazardsOutlook.maxDataAgeHours;
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HAZARDS_NOW_MS;
      helper._products = { showHazardsOutlook: true };
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      let out;
      try {
        const staleFiledate = HAZARDS_NOW_MS - (maxAgeHours + 5) * 60 * 60 * 1000;
        const layer4Body = hazardsCollection([
          hazardsFeature({ label: "Heavy Rain", startDate: Date.UTC(2026, 7, 29), endDate: Date.UTC(2026, 7, 29), filedate: staleFiledate })
        ]);
        installHttp(helper, hazardsRoutes({
          4: () => httpResponse({ body: layer4Body, etag: "hazards-d16-v1" })
        }));
        out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
      if (out._stale !== true) {
        throw new Error(`precondition failed: expected the aged-out layer to set _stale, got ${out._stale}`);
      }
      if (!out.hazardsOutlook.day3.hazards.some((h) => h.label === "Heavy Rain")) {
        throw new Error(`precondition failed: Heavy Rain did not reach day3: ${JSON.stringify(out.hazardsOutlook.day3.hazards)}`);
      }

      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showHazardsOutlook: true, showDrought: false
      };
      const rendered = renderDom(frontend, { config, spcrisk: out });
      if (!rendered.includes("⚠")) {
        throw new Error(`D-16: expected the stale badge to render alongside the hazard, got: ${rendered}`);
      }
      if (!rendered.includes("Heavy Rain")) {
        throw new Error(`D-16: a data-age trip suppressed the hazard row instead of just badging it: ${rendered}`);
      }
      if (rendered === "No Severe Weather Risk" || rendered.endsWith("No Severe Weather Risk (unconfirmed)")) {
        throw new Error(`D-16: stale hazard content rendered as an all-clear instead of its actual rows: ${rendered}`);
      }
    }
  },
  {
    // 17-RESEARCH.md's headline finding: fetchGeoJsonCached's pre-17-02 hardcoded
    // _isFeatureCollection check would reject every HeatRisk response permanently — a silent
    // fetch failure (an HTTP 200 body the shared validator rejects, producing
    // { data: null, failed: true }), never a throw — because the identify response has no
    // top-level `features` array at all. This pins the generalized isValidBody parameter
    // (17-02) as load-bearing infrastructure, not incidental plumbing.
    // Mutation to prove RED: revert BOTH fetchGeoJsonCached call sites from
    // `isValidBody(parsed.value)` back to `this._isFeatureCollection(parsed.value)`.
    name: "heatrisk-identify-body-survives-the-shared-fetch-validator",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      installHttp(helper, heatRiskRoutes());
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      // Precondition guard: prove the fetch actually happened, so nothing below can be
      // mistaken for the validator accepting the body when nothing reached it at all.
      if (!helper._fetch.calls.some((c) => c.url.includes(HEATRISK_URL))) {
        throw new Error(
          "precondition failed: the HeatRisk identify URL was never fetched — every " +
          "assertion below would observe nothing"
        );
      }

      // Primary assertion: a rejected body would leave all seven days null AND set _stale.
      // The failure mode is a well-formed HTTP 200 body the shared validator rejects, never a
      // throw — exactly why "the fetch resolved" alone would not catch a regression here.
      const hasNumericCategory = Object.keys(out.heatRisk).some(
        (k) => typeof out.heatRisk[k].category === "number"
      );
      if (!hasNumericCategory) {
        throw new Error(`expected at least one day with a numeric category, got ${JSON.stringify(out.heatRisk)}`);
      }
      if (out._stale) {
        throw new Error(`expected _stale unset on a healthy identify response, got ${out._stale}`);
      }

      // Control: a body missing catalogItems entirely must be rejected by the shared
      // validator — proving the validator does reject something, so the primary assertion
      // above is not simply "this harness never fails HeatRisk".
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const noCatalogBody = { objectId: 0, name: "Pixel", value: "1", properties: { Values: ["1"] } };
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({ body: noCatalogBody, etag: "heatrisk-no-catalog-v1" })
      }));
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      for (let d = 1; d <= 7; d++) {
        if (controlOut.heatRisk["day" + d].category !== null) {
          throw new Error(
            `control: expected all seven days null on a rejected body, got day${d}=` +
            JSON.stringify(controlOut.heatRisk["day" + d])
          );
        }
      }
      if (controlOut._stale !== true) {
        throw new Error(`control: expected _stale set when the shared validator rejects the body, got ${controlOut._stale}`);
      }
    }
  },
  {
    // Pins HEAT-01/HEAT-02: category is attributed by idp_validtime, not by the catalog's
    // own (arbitrary) array order. Fixture order matches 17-RESEARCH.md's live-observed
    // out-of-order catalog (HeatRisk_2, HeatRisk_4, HeatRisk_5, HeatRisk_7, HeatRisk_1,
    // HeatRisk_3, HeatRisk_6) — Values travels in the SAME array order as items, so the zip
    // itself is correct and only the sort/bucket step is under test.
    // Mutation to prove RED: remove the ascending sort AND bucket by array index instead of
    // idp_validtime — i.e. `const sorted = tuples.slice();` (no .sort) and
    // `const d = sorted.indexOf(t) + 1;` in place of the `_heatRiskDayOffset` call.
    name: "heatrisk-day-order-follows-validtime-not-array-order",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      // Day -> category, distinct enough that a mis-attribution is observable.
      const categoryForDay = {};
      for (let d = 1; d <= 7; d++) categoryForDay[d] = d % 5;

      // Out-of-order catalog: item[i] carries the day named in scrambledDayOrder[i].
      const scrambledDayOrder = [2, 4, 5, 7, 1, 3, 6];
      const items = scrambledDayOrder.map((d) =>
        heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) })
      );
      // Values travels in the SAME (scrambled) array order as items — the zip is correct;
      // only the sort/bucket step is under test.
      const values = scrambledDayOrder.map((d) => String(categoryForDay[d]));

      // Precondition guard: the fixture must not happen to be pre-sorted, or this scenario
      // proves nothing about the sort at all.
      const validtimes = items.map((it) => it.attributes.idp_validtime);
      if (validtimes[0] === Math.min(...validtimes)) {
        throw new Error(
          `precondition failed: features[0]'s idp_validtime is already the smallest (${validtimes[0]}) — ` +
          "the fixture is not exercising the sort"
        );
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-order-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);

      // Control: a healthy run, proving the day values came from a real evaluation and not
      // from the seeded all-null block.
      assertHeatRiskBlockIntact(out);
      if (out._stale) {
        throw new Error(`expected _stale unset on a healthy out-of-order response, got ${out._stale}`);
      }

      // Primary assertion: each day carries the category belonging to the item whose
      // idp_validtime is the Nth smallest — never the array-order value.
      for (let d = 1; d <= 7; d++) {
        const actual = out.heatRisk["day" + d].category;
        const expected = categoryForDay[d];
        if (actual !== expected) {
          throw new Error(
            `day${d}: expected category ${expected} (attributed by idp_validtime), got ${actual} ` +
            "— category is following array order instead of the sort"
          );
        }
      }
      // The inequality is the whole point: day1's category must not equal the FIRST raw
      // Values[] entry (which belongs to the scrambled catalog's first item, day2).
      if (out.heatRisk.day1.category === Number(values[0])) {
        throw new Error(
          `day1.category (${out.heatRisk.day1.category}) unexpectedly equals raw Values[0] ` +
          `(${values[0]}) — this fixture cannot distinguish sort-by-validtime from array order`
        );
      }
    }
  },
  {
    // Pins HEAT-03: the URL actually issued declares Web Mercator (wkid 102100) with
    // Mercator-magnitude coordinates, not raw degrees under a mismatched declaration — the
    // live-reproduced root cause of a "NoData" response is a coordinate/spatialReference
    // UNIT MISMATCH (17-RESEARCH.md Common Pitfalls #2), not sr=4326 per se; a well-formed
    // sr=4326 request works just as well. Do not restate the superseded framing here.
    // Mutation to prove RED: pass raw lon/lat (loc.geometry.coordinates) into row.buildUrl
    // instead of turf.toMercator(loc)'s output.
    name: "heatrisk-geometry-uses-mercator-not-raw-degrees",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      installHttp(helper, heatRiskRoutes());
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      const identifyCalls = helper._fetch.calls.filter((c) => c.url.includes("NWS_HeatRisk/ImageServer/identify"));
      // Precondition guard: exactly one identify call, or the geometry assertion below
      // would be vacuous (reading a call that doesn't represent this poll, or none at all).
      if (identifyCalls.length !== 1) {
        throw new Error(`precondition failed: expected exactly one HeatRisk identify call, got ${identifyCalls.length}`);
      }

      const issuedUrl = identifyCalls[0].url;
      const geometryMatch = /geometry=([^&]+)/.exec(issuedUrl);
      if (!geometryMatch) {
        throw new Error(`no geometry query parameter found in the issued URL: ${issuedUrl}`);
      }
      const geometry = JSON.parse(decodeURIComponent(geometryMatch[1]));
      if (!geometry.spatialReference || geometry.spatialReference.wkid !== 102100) {
        throw new Error(`expected spatialReference.wkid 102100, got ${JSON.stringify(geometry.spatialReference)}`);
      }
      if (!(Math.abs(geometry.x) > 1e6 && Math.abs(geometry.y) > 1e6)) {
        throw new Error(`expected Mercator-magnitude coordinates (|x|,|y| > 1e6), got x=${geometry.x} y=${geometry.y}`);
      }
      // Control: the magnitudes must not merely coincide with the raw PROBE_LON/PROBE_LAT —
      // proving this did not pass on a coincidence of magnitudes.
      if (Math.abs(geometry.x) === Math.abs(PROBE_LON) || Math.abs(geometry.y) === Math.abs(PROBE_LAT)) {
        throw new Error(`geometry coordinates coincide with raw degrees: x=${geometry.x} y=${geometry.y}`);
      }
    }
  },
  {
    // Pins HEAT-04: two catalog items sharing one idp_validtime collapse to the one with
    // the GREATEST idp_filedate. Both duplicates' catalogItemVisibilities are 0 — proving
    // the implementation is not using visibility as the discriminator, which live evidence
    // (17-RESEARCH.md) shows would be unreliable for a duplicate pair that is not also the
    // globally-visible tile.
    // Mutation to prove RED: flip the dedupe tiebreak in _dedupeHeatRiskByValidTime from
    // `filedate > existingFiledate` to `filedate < existingFiledate` (keep the OLDER item).
    name: "heatrisk-duplicate-validtime-keeps-latest-filedate",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const HOUR = 60 * 60 * 1000;
      const loserFiledate = HEATRISK_NOW_MS - 2 * HOUR;
      const winnerFiledate = HEATRISK_NOW_MS - 1 * HOUR; // greater (more recent) than loser

      const day3Loser = heatRiskCatalogItem({
        name: "HeatRisk_3_Mercator_stale", validtime: heatRiskValidtimeForDay(3), filedate: loserFiledate
      });
      const day3Winner = heatRiskCatalogItem({
        name: "HeatRisk_3_Mercator", validtime: heatRiskValidtimeForDay(3), filedate: winnerFiledate
      });
      const otherDays = [1, 2, 4, 5, 6, 7].map((d) =>
        heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) })
      );
      // Items order: day1, day2, day3(loser), day3(winner), day4..day7 — 8 total.
      const items = [otherDays[0], otherDays[1], day3Loser, day3Winner, otherDays[2], otherDays[3], otherDays[4], otherDays[5]];
      const categoryForItem = [1, 2, 4, 1, 3, 0, 2, 1]; // index-aligned to `items` above
      const values = categoryForItem.map(String);
      // Both duplicate pair entries (index 2, 3) get visibility 0 — the live-observed
      // unreliable-signal case; index 0 is the only "visible" tile, arbitrarily.
      const visibilities = [1, 0, 0, 0, 0, 0, 0, 0];

      // Precondition guard: the fixture must actually contain a duplicate idp_validtime, or
      // this scenario is vacuous (Phase 15's KMZ lesson — a fixture unable to express its
      // own condition).
      const validtimes = items.map((it) => it.attributes.idp_validtime);
      if (new Set(validtimes).size === validtimes.length) {
        throw new Error(
          `precondition failed: no duplicate idp_validtime in the fixture ` +
          `(${new Set(validtimes).size} distinct of ${validtimes.length} total)`
        );
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values, visibilities }),
          etag: "heatrisk-dupe-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      // Primary assertion: day3 carries the WINNER's category (idx3, greatest filedate) and
      // NOT the loser's (idx2) — both halves asserted.
      const winnerCategory = categoryForItem[3];
      const loserCategory = categoryForItem[2];
      if (out.heatRisk.day3.category !== winnerCategory) {
        throw new Error(
          `HEAT-04: expected day3 to carry the winning (greatest idp_filedate) category ` +
          `${winnerCategory}, got ${out.heatRisk.day3.category}`
        );
      }
      if (out.heatRisk.day3.category === loserCategory) {
        throw new Error(`HEAT-04: day3 carries the LOSER's category ${loserCategory} — dedupe picked the wrong item`);
      }

      // Control: a different, non-duplicated day carries its own expected category, proving
      // the dedupe collapsed only the duplicate pair and did not drop or shift every day.
      if (out.heatRisk.day5.category !== categoryForItem[5]) {
        throw new Error(
          `control: expected day5 (non-duplicated) to carry ${categoryForItem[5]}, got ${out.heatRisk.day5.category}`
        );
      }
      if (out._stale) {
        throw new Error(`expected _stale unset on a healthy (if duplicated) response, got ${out._stale}`);
      }
    }
  },
  {
    // Pins D-06's precondition guard: a Values/features length mismatch abandons HeatRisk
    // for this poll entirely — never zips to the shorter length (a front-truncation would
    // silently mis-attribute every surviving pair, a confidently wrong category on the wrong
    // day, strictly worse than showing nothing) and never falls back to the top-level
    // `value` as Day 1 (that field tracks catalogItemVisibilities, live-observed pointing at
    // the Day-2 tile, not "today").
    // Mutation to prove RED: remove the length check from _zipHeatRiskCatalog so it zips
    // positionally to features.length regardless of a shorter Values array.
    name: "heatrisk-mismatched-values-length-abandons-poll",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const items = [];
      for (let d = 1; d <= 7; d++) {
        items.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      }
      const mismatchedValues = ["1", "2", "3", "4", "0", "1"]; // six, one short of seven features

      // Precondition guard: the fixture itself must actually carry the mismatch.
      if (mismatchedValues.length === items.length) {
        throw new Error(
          `precondition failed: Values (${mismatchedValues.length}) and features ` +
          `(${items.length}) are the same length — this fixture does not express D-06's condition`
        );
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values: mismatchedValues }),
          etag: "heatrisk-mismatch-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      // Primary assertion: all seven days null AND _stale set — the poll was abandoned, not
      // truncated. A front-truncating zip would produce six populated days; explicitly
      // assert NO day carries a numeric category.
      for (let d = 1; d <= 7; d++) {
        if (out.heatRisk["day" + d].category !== null) {
          throw new Error(
            `D-06: expected day${d}.category null on a length-mismatched body (poll should be ` +
            `abandoned, not truncated), got ${out.heatRisk["day" + d].category}`
          );
        }
      }
      if (out._stale !== true) {
        throw new Error(`D-06: expected _stale set when Values/features lengths mismatch, got ${out._stale}`);
      }

      // Control: an otherwise-identical, MATCHED 7/7 body populates every day and leaves
      // _stale unset — proving the all-null result above is the guard firing, not the
      // harness simply never populating HeatRisk under any condition.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const matchedValues = ["1", "2", "3", "4", "0", "1", "2"];
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values: matchedValues }),
          etag: "heatrisk-mismatch-control-v1"
        })
      }));
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      const controlHasAllCategories = [1, 2, 3, 4, 5, 6, 7].every(
        (d) => typeof controlOut.heatRisk["day" + d].category === "number"
      );
      if (!controlHasAllCategories) {
        throw new Error(
          `control: expected every day populated on a matched 7/7 body, got ${JSON.stringify(controlOut.heatRisk)}`
        );
      }
      if (controlOut._stale) {
        throw new Error(`control: expected _stale unset on a matched, healthy body, got ${controlOut._stale}`);
      }
    }
  },
  {
    // D-04: if any day resolves to a real 0-4, the identify call and the Mercator
    // reprojection are demonstrably working, so a "NoData" elsewhere is genuine data
    // absence — no row, no badge (15 D-04's "a clean zero-result is not stale").
    // Mutation to prove RED: make any NoData day set anyStale (the blanket rule).
    name: "heatrisk-partial-nodata-is-silent",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const items = [];
      for (let d = 1; d <= 7; d++) {
        items.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      }
      // Days 2, 4, 6 are "NoData" (interior, so this is not accidentally a tail case);
      // the rest carry real 0-4 categories.
      const noDataDays = new Set([2, 4, 6]);
      const values = [];
      for (let d = 1; d <= 7; d++) values.push(noDataDays.has(d) ? "NoData" : String(d % 5));

      // Precondition guard: the fixture must carry BOTH at least one "NoData" and at
      // least one parseable 0-4 value, or this scenario is accidentally testing the
      // all-NoData branch (the next scenario) instead of the partial branch.
      const hasNoData = values.some((v) => v === "NoData");
      const hasReal = values.some((v) => v !== "NoData");
      if (!hasNoData || !hasReal) {
        throw new Error(
          `precondition failed: fixture must carry both a NoData day and a real 0-4 day, got Values=${JSON.stringify(values)}`
        );
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-partial-nodata-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      // Primary assertion: silence AND no badge — both halves. NoData days null, real
      // days carry their numeric categories.
      if (out._stale) {
        throw new Error(`D-04: expected _stale unset on a partial-NoData response, got ${out._stale}`);
      }
      for (let d = 1; d <= 7; d++) {
        const category = out.heatRisk["day" + d].category;
        if (noDataDays.has(d)) {
          if (category !== null) throw new Error(`D-04: expected day${d} (NoData) to be null, got ${category}`);
        } else if (typeof category !== "number") {
          throw new Error(`D-04: expected day${d} (real) to carry a numeric category, got ${JSON.stringify(category)}`);
        }
      }

      // Control: an otherwise-identical fixture where EVERY Values entry is "NoData"
      // must set _stale — proving the "no badge" above is a real branch, not a harness
      // that never badges HeatRisk at all.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const allNoDataValues = values.map(() => "NoData");
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values: allNoDataValues }),
          etag: "heatrisk-partial-nodata-control-v1"
        })
      }));
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      if (controlOut._stale !== true) {
        throw new Error(`control: expected _stale set when every day is NoData, got ${controlOut._stale}`);
      }
    }
  },
  {
    // D-04's total-absence branch: every day resolves to "NoData" — the module cannot
    // distinguish an out-of-coverage location from a systemic break, and both warrant a
    // signal (HEAT-03's failure mode reading as "no heat risk anywhere, forever"). This
    // is precisely the false-negative shape this project exists to prevent. Accepted
    // cost: a permanent badge for a genuinely out-of-coverage deployment, the same trade
    // 16 D-14 took. Norman, OK sits solidly inside HeatRisk's CONUS coverage, so for this
    // deployment the badge is a break signal, not a coverage signal.
    // Mutation to prove RED: remove the all-NoData check so the branch never fires.
    name: "heatrisk-all-nodata-sets-stale",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const items = [];
      for (let d = 1; d <= 7; d++) {
        items.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      }
      const values = items.map(() => "NoData");

      // Precondition guard: every entry must be exactly "NoData".
      if (!values.every((v) => v === "NoData")) {
        throw new Error(`precondition failed: fixture is not all-NoData, got Values=${JSON.stringify(values)}`);
      }

      const bodyFn = () => httpResponse({
        body: heatRiskIdentifyResponse({ items, values }),
        etag: "heatrisk-all-nodata-v1"
      });
      installHttp(helper, heatRiskRoutes({ heatRisk: bodyFn }));

      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);
      if (out._stale !== true) {
        throw new Error(`D-04: expected _stale set on an all-NoData response, got ${out._stale}`);
      }
      for (let d = 1; d <= 7; d++) {
        if (out.heatRisk["day" + d].category !== null) {
          throw new Error(`D-04: expected day${d} null on an all-NoData response, got ${out.heatRisk["day" + d].category}`);
        }
      }

      // Second assertion, D-04's own reason for existing: the log fires exactly ONCE
      // across two consecutive getSpcOutlook runs with the same fixture — the one-shot
      // guard works. resetHelper is deliberately NOT called between the two runs, so
      // _loggedHeatRiskAllNoData persists.
      installHttp(helper, heatRiskRoutes({ heatRisk: bodyFn }));
      await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      const matches = logCalls.filter((line) => line.includes("no day in this poll resolved a real category"));
      if (matches.length !== 1) {
        throw new Error(
          `expected the all-NoData log to fire exactly once across two consecutive runs, got ${matches.length}: ` +
          JSON.stringify(logCalls)
        );
      }

      // Control: a healthy all-real-values run leaves _stale unset — proving the badge
      // above is this branch firing, not a permanently-tripped flag.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      installHttp(helper, heatRiskRoutes());
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      if (controlOut._stale) {
        throw new Error(`control: expected _stale unset on a healthy all-real-values response, got ${controlOut._stale}`);
      }
    }
  },
  {
    // CR-01 (17-REVIEW): D-06/HEAT-01's contract is "anything that is not an integer 0-4
    // becomes category: null — never coerced to 0". `Number("")`, `Number(null)`,
    // `Number("  ")`, `Number(false)` and `Number([])` are ALL exactly 0, and 0 satisfies
    // `Number.isInteger(0) && 0 >= 0 && 0 <= 4` — so a degraded `properties.Values` used to
    // render seven affirmative days of "Little to No Risk" (category 0), with resolvedDays
    // non-empty so D-04's all-NoData branch never fired: no ⚠ badge, no log, no signal of
    // any kind. That is the confident-all-clear-during-a-heat-wave shape this project's
    // value statement forbids, on a heat-SAFETY product. "NoData" alone was never the only
    // absence sentinel a degraded upstream can emit.
    //
    // Each falsy-but-Number-zeroing shape is driven as its own sub-case so a partial
    // regression (e.g. handling "" but not null) names the exact offender rather than
    // failing anonymously.
    // Mutation to prove RED: restore `const parsedValue = Number(rawValue);` with the
    // `rawValue !== "NoData"` guard in _cacheHeatRiskTuples.
    name: "heatrisk-falsy-values-are-absence-never-category-zero",
    run: async (helper) => {
      // Every one of these is a value some degraded upstream can put in Values[i], and
      // every one of them is `0` after Number(). None of them is a category.
      const zeroingShapes = [
        { label: "empty string", value: "" },
        { label: "null", value: null },
        { label: "whitespace-only string", value: "  " },
        { label: "boolean false", value: false },
        { label: "empty array", value: [] }
      ];

      // Precondition guard: this scenario is only meaningful if Number() really does zero
      // every shape above. If a future JS engine changed that, the scenario would be
      // asserting nothing and must say so rather than pass quietly.
      for (const shape of zeroingShapes) {
        if (Number(shape.value) !== 0) {
          throw new Error(
            `precondition failed: Number(${JSON.stringify(shape.value)}) is ${Number(shape.value)}, not 0 — ` +
            "this scenario exists to prove those exact shapes are not coerced to category 0"
          );
        }
      }

      for (const shape of zeroingShapes) {
        resetHelper(helper);
        resetLogs();
        helper._nowMs = () => HEATRISK_NOW_MS;
        helper._products = { showHeatRisk: true };

        const items = [];
        for (let d = 1; d <= 7; d++) {
          items.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
        }
        const values = items.map(() => shape.value);

        installHttp(helper, heatRiskRoutes({
          heatRisk: () => httpResponse({
            body: heatRiskIdentifyResponse({ items, values }),
            etag: `heatrisk-falsy-${zeroingShapes.indexOf(shape)}-v1`
          })
        }));

        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
        assertPayloadIntact(out);
        assertHeatRiskBlockIntact(out);

        for (let d = 1; d <= 7; d++) {
          const entry = out.heatRisk["day" + d];
          if (entry.category !== null) {
            throw new Error(
              `CR-01: Values entry ${shape.label} (${JSON.stringify(shape.value)}) was coerced to ` +
              `category ${entry.category} ("${entry.text}") on day${d} — absence must be null, never 0. ` +
              "This renders an affirmative all-clear on a heat-safety product from a degraded payload."
            );
          }
        }

        // A degraded payload must also SIGNAL. With every day null, resolvedDays is empty,
        // so D-04's branch fires: badge plus a one-shot log. Without this half, a fix that
        // nulled the categories but left the poll looking healthy would still hide the
        // degradation behind a blank block.
        if (out._stale !== true) {
          throw new Error(
            `CR-01: an all-${shape.label} Values payload left _stale=${out._stale} — a payload that ` +
            "resolved no category at all must raise the staleness badge (D-04)"
          );
        }
        const matches = logCalls.filter((line) => line.includes("no day in this poll resolved a real category"));
        if (matches.length !== 1) {
          throw new Error(
            `CR-01: expected exactly one all-NoData-class log for an all-${shape.label} payload, got ` +
            `${matches.length}: ${JSON.stringify(logCalls)}`
          );
        }
      }

      // Control: the real integer-string shape the live service emits still parses, and
      // category 0 itself is still a legitimate reading when it arrives as "0". Without
      // this, a fix that simply nulled everything would pass the assertions above while
      // destroying the product.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const controlItems = [];
      for (let d = 1; d <= 7; d++) {
        controlItems.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      }
      const controlValues = ["0", "1", "2", "3", "4", "0", "2"];
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: controlItems, values: controlValues }),
          etag: "heatrisk-falsy-control-v1"
        })
      }));
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      for (let d = 1; d <= 7; d++) {
        const expected = Number(controlValues[d - 1]);
        if (controlOut.heatRisk["day" + d].category !== expected) {
          throw new Error(
            `control: a genuine integer-string category was rejected — expected day${d} category ` +
            `${expected}, got ${controlOut.heatRisk["day" + d].category}. A fix must reject absence, ` +
            "not real readings (category 0 from a real \"0\" is a legitimate Little to No Risk)."
          );
        }
      }
      if (controlOut._stale) {
        throw new Error(`control: a healthy integer-string payload was flagged stale (${controlOut._stale})`);
      }
    }
  },
  {
    // WR-01 (17-REVIEW): D-07's maxDataAgeHours check must describe the data the user is
    // actually shown. The bucket loop discards any tuple whose computed day offset falls
    // outside 1..row.days, but the age loop used to iterate every deduped tuple — so a
    // leftover catalog item (yesterday's tile, offset 0) carrying an old idp_filedate
    // raised the badge for data that never reaches the payload. At HeatRisk's hourly
    // cadence and 12h tolerance, one un-rotated tile lights the ⚠ badge on every poll
    // forever, which trains the operator to ignore the one indicator that is supposed to
    // mean something.
    // Mutation to prove RED: iterate `sorted` instead of `inSpan` in the maxDataAgeHours
    // loop in _runHeatRiskProduct.
    name: "heatrisk-out-of-span-tile-does-not-age-the-badge",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const HOUR = 60 * 60 * 1000;
      const maxAgeHours = PRODUCT_REGISTRY.heatRisk.maxDataAgeHours;
      const freshFiledate = HEATRISK_NOW_MS - 1 * HOUR;
      const agedFiledate = HEATRISK_NOW_MS - (maxAgeHours + 28) * HOUR;

      // Seven healthy, in-span, FRESH tiles...
      const items = [];
      for (let d = 1; d <= 7; d++) {
        items.push(heatRiskCatalogItem({
          name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d), filedate: freshFiledate
        }));
      }
      // ...plus one leftover tile at day offset 0 (yesterday's, not rotated out of the
      // mosaic catalog yet) carrying a filedate well past the tolerance.
      const leftover = heatRiskCatalogItem({
        name: "HeatRisk_0_Mercator_leftover", validtime: heatRiskValidtimeForDay(0), filedate: agedFiledate
      });
      items.push(leftover);
      const values = [...items.slice(0, 7).map((_, i) => String((i + 1) % 5)), "3"];

      // Precondition guard: the leftover really does compute to day offset 0 (out of the
      // 1..7 span), the seven others really do compute to 1..7, and the leftover's
      // filedate really does exceed the tolerance. Without all three this scenario would
      // pass for reasons unrelated to its subject.
      const todayUtcMsForGuard = Date.UTC(2026, 7, 31);
      const offsets = items.map((it) => Math.round((it.attributes.idp_validtime - todayUtcMsForGuard) / 86400000));
      if (JSON.stringify(offsets) !== JSON.stringify([1, 2, 3, 4, 5, 6, 7, 0])) {
        throw new Error(`precondition failed: expected day offsets [1..7, 0], computed ${JSON.stringify(offsets)}`);
      }
      if ((HEATRISK_NOW_MS - agedFiledate) <= maxAgeHours * HOUR) {
        throw new Error(`precondition failed: the leftover tile's filedate is not actually past maxDataAgeHours=${maxAgeHours}h`);
      }
      if ((HEATRISK_NOW_MS - freshFiledate) > maxAgeHours * HOUR) {
        throw new Error("precondition failed: the seven in-span tiles are not actually fresh");
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-out-of-span-age-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      if (out._stale) {
        throw new Error(
          `WR-01: an out-of-span (day offset 0) tile with a ${maxAgeHours + 28}h-old idp_filedate raised ` +
          `_stale=${out._stale}, but nothing from that tile reaches the payload — the freshness badge must ` +
          "describe the data the user is shown, not tuples the bucket loop discarded"
        );
      }
      const ageLogs = logCalls.filter((line) => line.includes("exceeded maxDataAgeHours"));
      if (ageLogs.length !== 0) {
        throw new Error(
          `WR-01: an out-of-span tile fired the data-age log ${ageLogs.length} time(s): ${JSON.stringify(ageLogs)}`
        );
      }
      // The seven in-span days must all still be rendered — the leftover must be ignored,
      // not allowed to abandon the poll.
      for (let d = 1; d <= 7; d++) {
        const expected = Number(values[d - 1]);
        if (out.heatRisk["day" + d].category !== expected) {
          throw new Error(`expected day${d} category ${expected}, got ${out.heatRisk["day" + d].category}`);
        }
      }

      // Control: move that same aged filedate onto an IN-SPAN tile (day 3) and the badge
      // MUST fire. Without this, "no badge" above could be a freshness check that has
      // simply stopped working.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const controlItems = [];
      for (let d = 1; d <= 7; d++) {
        controlItems.push(heatRiskCatalogItem({
          name: `HeatRisk_${d}_Mercator`,
          validtime: heatRiskValidtimeForDay(d),
          filedate: d === 3 ? agedFiledate : freshFiledate
        }));
      }
      controlItems.push(heatRiskCatalogItem({
        name: "HeatRisk_0_Mercator_leftover", validtime: heatRiskValidtimeForDay(0), filedate: freshFiledate
      }));
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: controlItems, values }),
          etag: "heatrisk-out-of-span-age-control-v1"
        })
      }));
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      if (controlOut._stale !== true) {
        throw new Error(
          `control: an IN-SPAN tile ${maxAgeHours + 28}h past maxDataAgeHours=${maxAgeHours}h left ` +
          `_stale=${controlOut._stale} — the age check itself has stopped working, making the primary ` +
          "assertion above vacuous"
        );
      }
    }
  },
  {
    // WR-02 (17-REVIEW): a hard fetch failure and a genuine all-NoData response are
    // DIFFERENT causes and must not share one diagnosis or one one-shot log budget. On a
    // hard failure the runner falls through to `tuples = []`, resolvedDays is empty, and
    // the D-04 branch used to fire — emitting "every present day was NoData" for what was
    // actually a network error, and consuming `_loggedHeatRiskAllNoData` for the life of
    // the process. The next GENUINE all-NoData poll — HEAT-03's systemic-break signal, the
    // exact condition that log exists to report — then logged nothing at all, forever.
    // A transient 503 permanently disarming a safety diagnostic is the worst possible
    // trade, because the failure that disarms it is the one guaranteed to happen.
    //
    // Both halves are asserted: the failure must NOT spend the budget, and the genuine
    // all-NoData poll that follows it must still fire. Staleness is asserted in both, so
    // no diagnosis is being traded away for silence.
    // Mutation to prove RED: drop the fetchUnavailable guard so the D-04 branch fires on a
    // hard fetch failure again.
    name: "heatrisk-fetch-failure-does-not-burn-the-all-nodata-log-guard",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      // J-1: a hard fetch failure with NOTHING in the cache to fall back on.
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({ status: 503, text: "service unavailable" })
      }));
      const failedOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(failedOut);
      assertHeatRiskBlockIntact(failedOut);

      // Precondition guard: the failure really did leave nothing cached, so this is the
      // data===null && cachedResult===null arm and not a stale-cache replay.
      if (helper._geoJsonCache.get(HEATRISK_URL)) {
        throw new Error(
          "precondition failed: the 503 left a cache entry for the HeatRisk URL, so this is not the " +
          `hard-failure arm this scenario exists to exercise: ${JSON.stringify(helper._geoJsonCache.get(HEATRISK_URL))}`
        );
      }
      if (failedOut._stale !== true) {
        throw new Error(`J-1: a hard HeatRisk fetch failure must still raise the badge, got _stale=${failedOut._stale}`);
      }
      const failureLogs = logCalls.filter((line) => line.includes("no day in this poll resolved a real category"));
      if (failureLogs.length !== 0) {
        throw new Error(
          `WR-02: a hard fetch failure emitted the all-NoData data-content diagnosis ${failureLogs.length} ` +
          `time(s) — it diagnoses the wrong cause AND consumes the one-shot guard that the genuine ` +
          `all-NoData case depends on: ${JSON.stringify(failureLogs)}`
        );
      }

      // J-2: now a GENUINE all-NoData response, on the SAME helper — resetHelper is
      // deliberately not called, so _loggedHeatRiskAllNoData carries over from J-1. This
      // is the assertion the whole scenario exists for.
      const items = [];
      for (let d = 1; d <= 7; d++) {
        items.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      }
      const values = items.map(() => "NoData");
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-wr02-nodata-v1"
        })
      }));
      const nodataOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(nodataOut);
      assertHeatRiskBlockIntact(nodataOut);
      if (nodataOut._stale !== true) {
        throw new Error(`J-2: a genuine all-NoData response must raise the badge, got _stale=${nodataOut._stale}`);
      }
      const nodataLogs = logCalls.filter((line) => line.includes("no day in this poll resolved a real category"));
      if (nodataLogs.length !== 1) {
        throw new Error(
          `WR-02: after a preceding transient fetch failure, a genuine all-NoData poll fired the D-04 log ` +
          `${nodataLogs.length} time(s), expected exactly 1 — the one-shot guard was burned by the network ` +
          `error, so HEAT-03's systemic-break signal is silent for the life of the process: ${JSON.stringify(logCalls)}`
        );
      }

      // Control: the one-shot guard is still a ONE-shot guard — a second genuine
      // all-NoData poll must not log again. Proving the fix did not simply remove the
      // budget and turn a diagnostic into a per-poll spam source.
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-wr02-nodata-v1"
        })
      }));
      await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      const afterSecond = logCalls.filter((line) => line.includes("no day in this poll resolved a real category"));
      if (afterSecond.length !== 1) {
        throw new Error(
          `control: the D-04 log is meant to fire once per process, got ${afterSecond.length} across two ` +
          `consecutive genuine all-NoData polls: ${JSON.stringify(logCalls)}`
        );
      }
    }
  },
  {
    // WR-03 (17-REVIEW): HEAT-04's dedupe collapses items sharing an EXACT idp_validtime
    // with a documented idp_filedate tiebreak. Two DISTINCT validtimes that round to the
    // same day key survive that dedupe and then collide in the bucket loop, where
    // last-write-wins by ascending validtime silently overwrote the earlier reading — no
    // tiebreak, no log, no badge. _heatRiskDayOffset's own docstring names this exact
    // dependency ("if a future response ever carries a midnight-aligned idp_validtime,
    // this assumption breaks"), but the break was silent, and it lost the HIGHER severity:
    // an Extreme (4) at 12:00Z replaced by a Little to No Risk (0) at 18:00Z, rendered as
    // an affirmative all-clear.
    //
    // Two independent guarantees are asserted. (1) The surviving category is the MAXIMUM,
    // not the last — this project does not trade a false negative for arrival order.
    // (2) The collision itself raises the badge and logs once, because the day-attribution
    // rule has just demonstrated it is unreliable and every day in the block is now
    // attributed by it.
    // Mutation to prove RED: restore last-write-wins in the bucket loop (drop the max and
    // the collision detection).
    name: "heatrisk-same-day-key-collision-keeps-max-and-signals",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      // Day 1's tile at the live-observed 12:00Z alignment, carrying Extreme...
      const day1Extreme = heatRiskCatalogItem({
        name: "HeatRisk_1_Mercator_12Z", validtime: heatRiskValidtimeForDay(1)
      });
      // ...and a second, DIFFERENT validtime six hours later that rounds to the same day
      // key, carrying Little to No Risk. Ascending-validtime order puts this one last.
      const day1Late = heatRiskCatalogItem({
        name: "HeatRisk_1_Mercator_18Z", validtime: heatRiskValidtimeForDay(1) + 6 * 60 * 60 * 1000
      });
      const otherDays = [2, 3, 4, 5, 6, 7].map((d) =>
        heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) })
      );
      const items = [day1Extreme, day1Late, ...otherDays];
      const values = ["4", "0", "1", "1", "2", "2", "1", "1"];

      // Precondition guard: the two day-1 items must have DIFFERENT idp_validtime values
      // (so HEAT-04's exact-match dedupe cannot collapse them) that nonetheless round to
      // the SAME day key. Without both halves this scenario tests the dedupe, not the
      // collision.
      const todayUtcMsForGuard = Date.UTC(2026, 7, 31);
      const offsetOf = (it) => Math.round((it.attributes.idp_validtime - todayUtcMsForGuard) / 86400000);
      if (day1Extreme.attributes.idp_validtime === day1Late.attributes.idp_validtime) {
        throw new Error("precondition failed: the two day-1 items share an exact idp_validtime, so HEAT-04's dedupe would collapse them before the bucket loop ever sees a collision");
      }
      if (offsetOf(day1Extreme) !== 1 || offsetOf(day1Late) !== 1) {
        throw new Error(
          `precondition failed: the two day-1 items do not both round to day key 1, computed ` +
          `${offsetOf(day1Extreme)} and ${offsetOf(day1Late)}`
        );
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-day-collision-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      if (out.heatRisk.day1.category !== 4) {
        throw new Error(
          `WR-03: two distinct idp_validtime values rounded to day key 1 and the LATER, LOWER reading won — ` +
          `day1.category=${out.heatRisk.day1.category} ("${out.heatRisk.day1.text}"), expected 4 (Extreme). ` +
          "A silent overwrite by arrival order must never downgrade a severity."
        );
      }
      if (out.heatRisk.day1.text !== PRODUCT_REGISTRY.heatRisk.valueToText[4] ||
          out.heatRisk.day1.color !== PRODUCT_REGISTRY.heatRisk.valueToColor[4]) {
        throw new Error(
          `WR-03: day1 kept category 4 but its text/colour describe something else — ` +
          `text=${JSON.stringify(out.heatRisk.day1.text)}, color=${JSON.stringify(out.heatRisk.day1.color)}`
        );
      }
      if (out._stale !== true) {
        throw new Error(
          `WR-03: a same-day-key collision left _stale=${out._stale} — the 12:00Z alignment every day key in ` +
          "this block depends on has just been shown not to hold, and the whole block is attributed by it"
        );
      }
      const collisionLogs = logCalls.filter((line) => line.includes("resolved to day"));
      if (collisionLogs.length !== 1) {
        throw new Error(
          `WR-03: expected exactly one day-collision log, got ${collisionLogs.length}: ${JSON.stringify(logCalls)}`
        );
      }

      // Control 1: the collision log is one-shot across polls, like its three siblings.
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-day-collision-v1"
        })
      }));
      await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      const afterSecond = logCalls.filter((line) => line.includes("resolved to day"));
      if (afterSecond.length !== 1) {
        throw new Error(
          `control 1: the day-collision log fired ${afterSecond.length} times across two polls, expected 1`
        );
      }

      // Control 2: the ordinary, live-observed one-tile-per-day response must NOT trip any
      // of this — no badge, no collision log — proving the detection keys on a genuine
      // second validtime and not merely on a day being written.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      installHttp(helper, heatRiskRoutes());
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      if (controlOut._stale) {
        throw new Error(`control 2: a healthy one-tile-per-day response was flagged stale (${controlOut._stale})`);
      }
      const controlLogs = logCalls.filter((line) => line.includes("resolved to day"));
      if (controlLogs.length !== 0) {
        throw new Error(`control 2: a healthy response fired the collision log: ${JSON.stringify(controlLogs)}`);
      }
    }
  },
  {
    // WR-06 (17-REVIEW): _isHeatRiskIdentifyResponse gated the whole product's usability on
    // `typeof body.value === "string"` — the ONE field _runHeatRiskProduct documents that
    // it must never read ("Under no circumstance is the response's top-level scalar reading
    // ... read here"), because live capture showed it tracking catalogItemVisibilities
    // rather than "today". Coupling usability to a field the pipeline refuses to consume
    // means a benign upstream change — `value: null` for a point outside the raster, or a
    // numeric `value` — routes every poll through rejectBody. That is a permanent, total
    // product outage whose only signal is one log line and the ⚠ badge, caused by data the
    // module had already decided was untrustworthy.
    //
    // A validator should assert exactly what the consumer consumes: properties.Values and
    // catalogItems.features. Nothing more, because everything more is a way to fail for a
    // reason that does not matter; nothing less, because everything less is a way to
    // succeed on a body that cannot be parsed.
    // Mutation to prove RED: restore `typeof body.value === "string" &&` in
    // _isHeatRiskIdentifyResponse.
    name: "heatrisk-unused-top-level-value-does-not-gate-usability",
    run: async (helper) => {
      const items = healthyHeatRiskItems();
      const values = ["1", "2", "3", "4", "0", "1", "2"];

      // Every shape a benign upstream change could put in the field the pipeline ignores.
      const irrelevantValues = [
        { label: "null (point outside the raster)", value: null },
        { label: "a number rather than a string", value: 1 },
        { label: "a numeric zero", value: 0 },
        { label: "the literal NoData sentinel", value: "NoData" }
      ];

      for (const shape of irrelevantValues) {
        resetHelper(helper);
        resetLogs();
        helper._nowMs = () => HEATRISK_NOW_MS;
        helper._products = { showHeatRisk: true };

        installHttp(helper, heatRiskRoutes({
          heatRisk: () => httpResponse({
            body: heatRiskIdentifyResponse({ items, values, value: shape.value }),
            etag: `heatrisk-value-${irrelevantValues.indexOf(shape)}-v1`
          })
        }));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
        assertPayloadIntact(out);
        assertHeatRiskBlockIntact(out);

        for (let d = 1; d <= 7; d++) {
          const expected = Number(values[d - 1]);
          if (out.heatRisk["day" + d].category !== expected) {
            throw new Error(
              `WR-06: an otherwise-healthy body carrying top-level value=${shape.label} failed to populate ` +
              `day${d} (expected category ${expected}, got ${out.heatRisk["day" + d].category}) — the ` +
              "validator is gating the product on a field the pipeline deliberately never reads"
            );
          }
        }
        if (out._stale) {
          throw new Error(
            `WR-06: an otherwise-healthy body carrying top-level value=${shape.label} raised _stale=${out._stale}`
          );
        }
        const rejectLogs = logCalls.filter((line) => line.includes("rejected an unusable"));
        if (rejectLogs.length !== 0) {
          throw new Error(
            `WR-06: top-level value=${shape.label} routed a healthy body through rejectBody: ` +
            JSON.stringify(rejectLogs)
          );
        }
      }

      // Control: the validator still REJECTS a body missing what the pipeline actually
      // consumes. Loosening a validator is only safe if it still refuses the shapes that
      // would make the parse silently wrong — without this, "accepts everything" would
      // pass the assertions above.
      const unusableBodies = [
        { label: "no properties.Values array", body: heatRiskIdentifyResponse({ items }) },
        {
          label: "no catalogItems.features array",
          body: (() => {
            const b = heatRiskIdentifyResponse({ items, values });
            b.catalogItems = {};
            return b;
          })()
        },
        {
          label: "an ArcGIS error body",
          body: { error: { code: 400, message: "Unable to complete operation" } }
        }
      ];
      for (const unusable of unusableBodies) {
        resetHelper(helper);
        resetLogs();
        helper._nowMs = () => HEATRISK_NOW_MS;
        helper._products = { showHeatRisk: true };
        installHttp(helper, heatRiskRoutes({
          heatRisk: () => httpResponse({
            body: unusable.body,
            etag: `heatrisk-unusable-${unusableBodies.indexOf(unusable)}-v1`
          })
        }));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
        assertPayloadIntact(out);
        assertHeatRiskBlockIntact(out);
        for (let d = 1; d <= 7; d++) {
          if (out.heatRisk["day" + d].category !== null) {
            throw new Error(
              `control: a body with ${unusable.label} still populated day${d} with category ` +
              `${out.heatRisk["day" + d].category} — the validator has been loosened past the point of ` +
              "refusing bodies the pipeline cannot parse"
            );
          }
        }
        if (out._stale !== true) {
          throw new Error(
            `control: a body with ${unusable.label} left _stale=${out._stale} — an unusable body must ` +
            "raise the badge, not degrade silently"
          );
        }
      }
    }
  },
  {
    // WR-08 (17-REVIEW): `loc` is the ONE turf Point Feature built per poll
    // (turf.point([lon, lat])) and used by EVERY product's containment check. PERF-01 now
    // shares it across five concurrently-running batch members. _runHeatRiskProduct hands
    // it to turf.toMercator, which accepts a `{ mutate: true }` option; turf 7.3.4 defaults
    // to mutate:false, so this is correct today — by inheritance, not by statement. If that
    // option were ever added, or a future turf changed the default, every OTHER product
    // would evaluate point-in-polygon against Web Mercator metres and report no risk
    // anywhere, with no badge and no error: a total, silent, all-products false negative
    // caused by one line in a fifth product.
    //
    // Nothing pinned it. turfStub.toMercator always built a fresh object, so no scenario
    // COULD observe a mutating implementation, and every HeatRisk scenario routed the other
    // products to empty collections so no containment ran concurrently to be corrupted.
    // This scenario supplies both missing halves: a deliberately MUTATING toMercator, and a
    // real polygon for a sibling batch member to evaluate containment against.
    // Mutation to prove RED: pass `loc` straight to turf.toMercator in _runHeatRiskProduct
    // instead of a fresh point built from its coordinates.
    name: "heatrisk-mercator-projection-never-mutates-the-shared-point",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true, showExcessiveRain: true };

      const originalToMercator = turfStub.toMercator;
      const originalPointInPolygon = turfStub.pointInPolygon;
      const originalPoint = turfStub.point;
      try {
        // Every Point built this poll, so the shared `loc` can be inspected directly after
        // the run rather than inferred.
        const builtPoints = [];
        turfStub.point = (coords) => {
          const pt = originalPoint(coords);
          builtPoints.push(pt);
          return pt;
        };

        // A toMercator that mutates its argument in place — exactly what turf would do
        // under `{ mutate: true }`, and what a future default change would make of every
        // existing call. The correct call site is unaffected by this because it hands over
        // a throwaway point; an incorrect one hands over `loc` itself.
        turfStub.toMercator = (point) => {
          const target = (point && point.geometry) ? point.geometry : point;
          const coords = target && target.coordinates;
          if (!Array.isArray(coords) || coords.length < 2) {
            throw new Error("mutating toMercator stub: expected a Point or Point Feature with coordinates");
          }
          const [lon, lat] = coords;
          const EARTH_RADIUS_M = 6378137;
          coords[0] = ((lon * Math.PI) / 180) * EARTH_RADIUS_M;
          coords[1] = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * EARTH_RADIUS_M;
          return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [coords[0], coords[1]] } };
        };

        // Record the coordinates every containment check is actually handed. A sibling
        // batch member evaluating Mercator metres against a degree-space polygon is the
        // observable consequence this scenario exists to catch.
        const containmentPoints = [];
        turfStub.pointInPolygon = (pt) => {
          const coords = (pt && pt.geometry && pt.geometry.coordinates) || (pt && pt.coordinates);
          if (Array.isArray(coords)) containmentPoints.push([coords[0], coords[1]]);
          return true;
        };

        // ERO day 1 carries a real polygon so a SIBLING batch member runs containment in
        // the same batch as the HeatRisk reprojection — the concurrency half of the claim.
        installHttp(helper, [
          [ERO_URLS[1], () => httpResponse({ body: ERO_SLGT_BODY, etag: "ero-wr08-v1" })],
          [ERO_URLS[2], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[3], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[4], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [ERO_URLS[5], () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })],
          [HEATRISK_URL, okEmptyHeatRisk],
          [".lyr.geojson", () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "empty-v1" })]
        ]);

        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {
          showHeatRisk: true, showExcessiveRain: true
        });
        assertPayloadIntact(out);
        assertHeatRiskBlockIntact(out);

        // Precondition guard 1: the shared point really was built, and we can identify it
        // as the one carrying the probe's own degree coordinates.
        const isDegreeScale = ([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90;
        if (builtPoints.length === 0) {
          throw new Error("precondition failed: no turf.point was built during the poll, so there is nothing to check");
        }
        // Precondition guard 2: a sibling product's containment actually ran. Without this
        // the concurrency half of the assertion below would be vacuous.
        if (containmentPoints.length === 0) {
          throw new Error(
            "precondition failed: no containment check ran during the poll, so this scenario cannot observe " +
            "a sibling batch member being corrupted by the reprojection"
          );
        }

        for (const pt of builtPoints) {
          const coords = pt.coordinates || (pt.geometry && pt.geometry.coordinates);
          if (!Array.isArray(coords)) continue;
          if (!isDegreeScale(coords)) {
            throw new Error(
              `WR-08: a turf Point built this poll was mutated to Web Mercator metres ` +
              `(${JSON.stringify(coords)}). \`loc\` is shared by every product's containment check and by ` +
              "five concurrent batch members — mutating it makes every other product evaluate " +
              "point-in-polygon in the wrong units and report no risk anywhere, with no badge."
            );
          }
        }

        for (const coords of containmentPoints) {
          if (!isDegreeScale(coords)) {
            throw new Error(
              `WR-08: a sibling batch member ran its containment check against Web Mercator metres ` +
              `(${JSON.stringify(coords)}) instead of degrees — the HeatRisk reprojection mutated the ` +
              "shared point out from under it"
            );
          }
        }

        // The sibling product must also still produce its real answer, not merely
        // degree-scale coordinates.
        if (out.excessiveRain.day1Risk === "NONE") {
          throw new Error(
            "WR-08: the sibling ERO product resolved to NONE while standing inside its polygon — the " +
            "shared point was corrupted, which is the user-visible form of this defect"
          );
        }
      } finally {
        turfStub.toMercator = originalToMercator;
        turfStub.pointInPolygon = originalPointInPolygon;
        turfStub.point = originalPoint;
      }
    }
  },
  {
    // WR-09 (17-REVIEW): getSpcOutlook's concurrency audit enumerated two shared fields and
    // closed with "LIMIT OF THIS CLAIM (does not generalise beyond these two fields)" —
    // omitting `_geoJsonCache`, the largest shared mutable structure the batch touches, and
    // the ONLY one whose access pattern is a read-modify-write spanning an await. Four of
    // the six concurrent members write it. It is safe today only because their URL
    // keyspaces happen to be disjoint, which was stated nowhere and enforced nowhere.
    //
    // Extending check-concurrency-invariant.sh to cover it is not possible in kind: that
    // script asserts "no await in the window", and here the await IS the pattern. So the
    // premise is enforced instead, on the condition that actually tears an entry — two
    // fetches for the SAME cache key in flight at once, whoever issued them. This scenario
    // drives that condition directly, because no current pair of registry rows can produce
    // it (which is the point: the check exists for the future row that can).
    // Mutation to prove RED: remove the in-flight-key check from fetchGeoJsonCached.
    name: "geojson-cache-concurrent-same-key-fetches-are-reported",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;

      const url = ERO_URLS[1];
      const fetchFn = installDeferredHttp(helper, [
        [url, () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "wr09-v1" })]
      ]);

      // Two concurrent fetches for ONE key: both enter, both read the (absent) entry, and
      // both will write it back after their awaits resolve. Neither is released until both
      // are in flight, so the overlap is guaranteed rather than raced for.
      const first = helper.fetchGeoJsonCached(url);
      const second = helper.fetchGeoJsonCached(url);

      // Precondition guard: both really are in flight simultaneously. If the harness ever
      // serialised them this scenario would assert nothing.
      if (fetchFn.pending.length !== 2) {
        fetchFn.releaseAll();
        await Promise.allSettled([first, second]);
        throw new Error(
          `precondition failed: expected 2 concurrently-pending fetches for one cache key, got ` +
          `${fetchFn.pending.length} — the two calls did not overlap, so no read-modify-write could interleave`
        );
      }

      fetchFn.releaseAll();
      await Promise.allSettled([first, second]);

      const contention = logCalls.filter((line) => line.includes("two fetches are in flight for the SAME"));
      if (contention.length !== 1) {
        throw new Error(
          `WR-09: two concurrent fetches for the same _geoJsonCache key produced ${contention.length} ` +
          `contention reports, expected exactly 1. The batch's safety argument for _geoJsonCache assumes ` +
          `every concurrent member addresses a disjoint URL set; nothing observes a violation of it: ` +
          JSON.stringify(logCalls)
        );
      }
      if (!contention[0].includes(url)) {
        throw new Error(`WR-09: the contention report does not name the offending URL: ${contention[0]}`);
      }

      // Control 1: SEQUENTIAL fetches of the same key — the ordinary poll-after-poll case,
      // and by far the most common thing this code does — must NOT report contention. A
      // detector that fires on normal operation is noise, and noise is how a real report
      // gets ignored.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      installHttp(helper, [[url, () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "wr09-seq-v1" })]]);
      await helper.fetchGeoJsonCached(url);
      await helper.fetchGeoJsonCached(url);
      await helper.fetchGeoJsonCached(url);
      const seqContention = logCalls.filter((line) => line.includes("two fetches are in flight for the SAME"));
      if (seqContention.length !== 0) {
        throw new Error(
          `control 1: three SEQUENTIAL fetches of one key reported contention ${seqContention.length} ` +
          `time(s) — the in-flight key was not released: ${JSON.stringify(seqContention)}`
        );
      }

      // Control 2: the six real batch members, all enabled, must not trip it either. This
      // is the disjoint-keyspace premise itself, asserted rather than assumed — and it is
      // what turns the check from a tripwire for a hypothetical into a live statement about
      // the product set as it actually ships.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      const allProducts = {
        showExcessiveRain: true, showWinterImpact: true, showHazardsOutlook: true,
        showHeatRisk: true, showSpcMD: true, showMpd: true
      };
      helper._products = allProducts;
      installHttp(helper, heatRiskRoutes());
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, allProducts);
      assertPayloadIntact(out);
      const batchContention = logCalls.filter((line) => line.includes("two fetches are in flight for the SAME"));
      if (batchContention.length !== 0) {
        throw new Error(
          "control 2: the shipped six-member batch violates its own disjoint-URL premise — two members " +
          `address the same _geoJsonCache key concurrently: ${JSON.stringify(batchContention)}`
        );
      }

      // Control 3: the detector is one-shot per process, like the HeatRisk log guards, so a
      // genuine violation cannot flood the log on every poll.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      const fetchFn3 = installDeferredHttp(helper, [
        [url, () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "wr09-oneshot-v1" })]
      ]);
      const a = helper.fetchGeoJsonCached(url);
      const b = helper.fetchGeoJsonCached(url);
      const c = helper.fetchGeoJsonCached(url);
      fetchFn3.releaseAll();
      await Promise.allSettled([a, b, c]);
      const oneShot = logCalls.filter((line) => line.includes("two fetches are in flight for the SAME"));
      if (oneShot.length !== 1) {
        throw new Error(
          `control 3: expected the contention report to be one-shot, got ${oneShot.length} reports from ` +
          "three concurrent same-key fetches"
        );
      }
    }
  },
  {
    // WR-10 (17-REVIEW): D-02/D-05 specify that a toggle-off poll must still emit the full
    // seven-day block, must not raise anyStale, and must issue no identify request. Every
    // other product has such a scenario; HeatRisk had none — all 23 assertHeatRiskBlockIntact
    // call sites ran with showHeatRisk: true. The behaviour was correct, but a regression
    // (moving the payload seeding below the toggle check, say) would have been caught by no
    // assertion at all, and before WR-05 assertPayloadIntact would not have caught a missing
    // block either. Mirrors hazards-toggle-off-emits-the-full-block-and-fetches-nothing.
    // Mutation to prove RED: move the `payload` seeding loop in _runHeatRiskProduct below
    // the `productToggles[row.configFlag]` check.
    name: "heatrisk-toggle-off-emits-the-full-block-and-fetches-nothing",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: false };

      // A HEALTHY, fully-populated body is routed deliberately: if the toggle-off path ever
      // fetched and parsed it, the categories below would be non-null and this scenario
      // would say so. Routing an empty body instead would let a fetching implementation
      // pass.
      const fetchFn = installHttp(helper, heatRiskRoutes());

      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: false });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      for (let d = 1; d <= 7; d++) {
        const entry = out.heatRisk["day" + d];
        if (entry.category !== null || entry.text !== "" || entry.color !== "") {
          throw new Error(
            `D-02/D-05: with the toggle off day${d} must be the "no reading taken" shape ` +
            `{ category: null, text: "", color: "" }, got ${JSON.stringify(entry)}`
          );
        }
      }

      // D-02: an all-null block from a toggle being OFF is "no reading taken", NOT D-04's
      // all-NoData failure state. The two are shape-identical and must be distinguished by
      // the badge alone, which is exactly why this assertion matters.
      if (out._stale) {
        throw new Error(`D-02: the toggle-off block must not be flagged stale, got _stale=${out._stale}`);
      }
      const nodataLogs = logCalls.filter((line) => line.includes("no day in this poll resolved a real category"));
      if (nodataLogs.length !== 0) {
        throw new Error(
          `D-02: a toggle-off poll emitted D-04's all-NoData diagnosis — it is a "no reading taken" state, ` +
          `not a failure: ${JSON.stringify(nodataLogs)}`
        );
      }

      const identifyCalls = fetchFn.calls.filter((c) => c.url.includes(HEATRISK_URL));
      if (identifyCalls.length !== 0) {
        throw new Error(
          `D-02: ${identifyCalls.length} identify request(s) were issued with the toggle off: ` +
          JSON.stringify(identifyCalls.map((c) => c.url))
        );
      }

      // Control: the very same routes with the toggle ON do populate the block and do issue
      // exactly one identify request — proving the assertions above measure the toggle and
      // not a harness that never fetches anything.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const controlFetchFn = installHttp(helper, heatRiskRoutes());
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      const controlIdentifyCalls = controlFetchFn.calls.filter((c) => c.url.includes(HEATRISK_URL));
      if (controlIdentifyCalls.length !== 1) {
        throw new Error(
          `control: expected exactly one identify request with the toggle on, got ${controlIdentifyCalls.length}`
        );
      }
      let populated = 0;
      for (let d = 1; d <= 7; d++) {
        if (controlOut.heatRisk["day" + d].category !== null) populated++;
      }
      if (populated !== 7) {
        throw new Error(
          `control: expected all seven days populated with the toggle on, got ${populated} — the toggle-off ` +
          "assertions above would then be vacuous"
        );
      }
    }
  },
  {
    // D-05: a gap at the TAIL of the 1-7 grid (nothing resolved beyond the highest
    // present day) is silence with no badge — consistent with routine mosaic rotation,
    // where the newest tile has not yet landed. Live capture shows 7 catalog items
    // spanning only 6 distinct idp_validtime values; a blanket gap-is-stale rule would
    // badge that routine response.
    // Mutation to prove RED: make any gap set anyStale (the blanket rule).
    name: "heatrisk-tail-gap-is-silent",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const days = [1, 2, 3, 4, 5];
      const items = days.map((d) => heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      const values = days.map((d) => String(d % 5));

      // Precondition guard: exactly five items present, their computed day offsets
      // against HEATRISK_NOW_MS are 1,2,3,4,5, and nothing buckets to 6 or 7.
      const todayUtcMsForGuard = Date.UTC(2026, 7, 31);
      const offsets = items.map((it) => Math.round((it.attributes.idp_validtime - todayUtcMsForGuard) / 86400000));
      if (items.length !== 5 || JSON.stringify(offsets) !== JSON.stringify([1, 2, 3, 4, 5])) {
        throw new Error(`precondition failed: expected exactly items at day offsets [1,2,3,4,5], computed ${JSON.stringify(offsets)}`);
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-tail-gap-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      if (out._stale) {
        throw new Error(`D-05: expected _stale unset on a tail-gap (days 6-7 missing) response, got ${out._stale}`);
      }
      for (const d of days) {
        if (typeof out.heatRisk["day" + d].category !== "number") {
          throw new Error(`D-05: expected day${d} to carry a numeric category, got ${JSON.stringify(out.heatRisk["day" + d])}`);
        }
      }
      for (const d of [6, 7]) {
        if (out.heatRisk["day" + d].category !== null) {
          throw new Error(`D-05: expected day${d} (tail gap) null, got ${out.heatRisk["day" + d].category}`);
        }
      }

      // Control: the same fixture with the day-3 item REMOVED (making it an interior
      // gap) DOES set _stale — proving the "no badge" above is the tail branch and not a
      // gap check that never fires.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const interiorDays = [1, 2, 4, 5];
      const interiorItems = interiorDays.map((d) => heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      const interiorValues = interiorDays.map((d) => String(d % 5));
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: interiorItems, values: interiorValues }),
          etag: "heatrisk-tail-gap-control-v1"
        })
      }));
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      if (controlOut._stale !== true) {
        throw new Error(`control: expected _stale set when day3 is missing (an interior gap), got ${controlOut._stale}`);
      }
    }
  },
  {
    // D-05: a gap at DAY 1, or any INTERIOR gap (resolved days on both sides), sets
    // anyStale and logs once — the sequence itself is broken, and a day is being
    // attributed by a rule that has just demonstrated it is unreliable. A missing Day 1
    // during a heat wave rendering identically to a Day 1 with no heat risk would
    // violate this project's core value statement ("no false negatives") directly.
    // Mutation to prove RED: invert the `d < maxPresent` comparison, or drop the
    // interior branch so all gaps are treated as tail gaps.
    name: "heatrisk-day1-gap-sets-stale",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      // Arm 1: Day 1 missing, days 2-7 present.
      const arm1Days = [2, 3, 4, 5, 6, 7];
      const arm1Items = arm1Days.map((d) => heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      const arm1Values = arm1Days.map((d) => String(d % 5));

      // Precondition guard: no item buckets to day 1, and days 2-7 are all present.
      if (arm1Items.length !== 6) {
        throw new Error(`precondition failed: expected 6 items in arm 1, got ${arm1Items.length}`);
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: arm1Items, values: arm1Values }),
          etag: "heatrisk-day1-gap-v1"
        })
      }));
      const out1 = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out1);
      assertHeatRiskBlockIntact(out1);

      if (out1._stale !== true) {
        throw new Error(`D-05: expected _stale set when Day 1 is missing, got ${out1._stale}`);
      }
      if (out1.heatRisk.day1.category !== null) {
        throw new Error(`D-05: expected day1 null when Day 1 is missing, got ${out1.heatRisk.day1.category}`);
      }
      // Assert days 2-7 are populated explicitly — a badge with an empty block would
      // mean the whole poll was abandoned, which is a different branch (D-06).
      for (const d of arm1Days) {
        if (typeof out1.heatRisk["day" + d].category !== "number") {
          throw new Error(`D-05: expected day${d} populated (not the whole poll abandoned), got ${JSON.stringify(out1.heatRisk["day" + d])}`);
        }
      }

      // Arm 2: Day 3 missing (an INTERIOR gap), days 1,2,4,5,6,7 present — both arms
      // exercise the `d < maxPresent` branch; asserting both is what proves the branch
      // is position-aware rather than a "day 1 specifically" special case.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const arm2Days = [1, 2, 4, 5, 6, 7];
      const arm2Items = arm2Days.map((d) => heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      const arm2Values = arm2Days.map((d) => String(d % 5));
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: arm2Items, values: arm2Values }),
          etag: "heatrisk-day1-gap-arm2-v1"
        })
      }));
      const out2 = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out2);
      assertHeatRiskBlockIntact(out2);

      if (out2._stale !== true) {
        throw new Error(`D-05: expected _stale set when day3 (interior) is missing, got ${out2._stale}`);
      }
      if (out2.heatRisk.day3.category !== null) {
        throw new Error(`D-05: expected day3 null on an interior gap, got ${out2.heatRisk.day3.category}`);
      }
      for (const d of arm2Days) {
        if (typeof out2.heatRisk["day" + d].category !== "number") {
          throw new Error(`D-05: expected day${d} populated on the interior-gap arm, got ${JSON.stringify(out2.heatRisk["day" + d])}`);
        }
      }

      // Control: the tail-gap fixture from the previous scenario (days 1-5 present, 6-7
      // missing) leaves _stale unset — proving this scenario's badge is the interior
      // branch firing.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const tailDays = [1, 2, 3, 4, 5];
      const tailItems = tailDays.map((d) => heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      const tailValues = tailDays.map((d) => String(d % 5));
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: tailItems, values: tailValues }),
          etag: "heatrisk-day1-gap-control-v1"
        })
      }));
      const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
      if (controlOut._stale) {
        throw new Error(`control: expected _stale unset on a tail-gap-only fixture, got ${controlOut._stale}`);
      }
    }
  },
  {
    // D-07 / 16 D-15: a per-item data-age trip sets the badge but is excluded from
    // _staleAsOf — that field describes fetch/network recency, not WPC's own publish
    // age, and an hours-old HeatRisk tile must not make the badge speak for SPC data
    // fetched moments ago. Applied PER item surviving HEAT-04's dedupe — live capture
    // shows idp_filedate varying by ~15 minutes across the seven items, unlike the
    // Hazards Outlook's per-layer uniformity, so an implementation reading only the
    // first item's filedate must fail here.
    // Mutation to prove RED: remove the per-item age check.
    name: "heatrisk-stale-item-sets-badge-not-staleAsOf",
    run: async (helper) => {
      const maxAgeHours = PRODUCT_REGISTRY.heatRisk.maxDataAgeHours;
      const HOUR = 60 * 60 * 1000;
      const agedFiledate = HEATRISK_NOW_MS - (maxAgeHours + 5) * HOUR;

      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const items = [];
      for (let d = 1; d <= 7; d++) {
        items.push(heatRiskCatalogItem({
          name: `HeatRisk_${d}_Mercator`,
          validtime: heatRiskValidtimeForDay(d),
          filedate: d === 5 ? agedFiledate : HEATRISK_NOW_MS
        }));
      }
      const values = items.map((_, i) => String((i + 1) % 5));

      // Precondition guard: exactly one item older than maxAgeHours, the rest fresh.
      const ages = items.map((it) => (HEATRISK_NOW_MS - it.attributes.idp_filedate) / HOUR);
      const agedCount = ages.filter((a) => a > maxAgeHours).length;
      if (agedCount !== 1) {
        throw new Error(`precondition failed: expected exactly one item older than ${maxAgeHours}h, computed ages(h)=${JSON.stringify(ages)}`);
      }

      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items, values }),
          etag: "heatrisk-stale-item-v1"
        })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      if (out._stale !== true) {
        throw new Error(`D-07: expected _stale set when one surviving item exceeds maxDataAgeHours=${maxAgeHours}h, got ${out._stale}`);
      }
      if (out._staleAsOf !== null && out._staleAsOf !== undefined) {
        throw new Error(
          `D-07/16 D-15: a data-age trip dragged _staleAsOf along with it — this would make the badge speak for ` +
          `SPC data fetched moments ago while describing a WPC file up to ${maxAgeHours}h old, got _staleAsOf=${out._staleAsOf}`
        );
      }

      // Control 1: a genuine fetch failure (warm, then fail within the stale-fallback
      // window) must leave a NUMERIC _staleAsOf — proving the primary assertion
      // measures a deliberate omission, not a _staleAsOf this harness never populates
      // for HeatRisk.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const freshItems = [];
      for (let d = 1; d <= 7; d++) {
        freshItems.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      }
      const freshValues = freshItems.map((_, i) => String((i + 1) % 5));
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: freshItems, values: freshValues }),
          etag: "heatrisk-stale-item-control1-v1"
        })
      }));
      const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      if (warm._stale) {
        throw new Error("control 1 warm-up: an all-fresh poll was unexpectedly flagged stale");
      }
      helper._updateInterval = 60;
      const entry = helper._geoJsonCache.get(HEATRISK_URL);
      if (!entry) throw new Error("control 1 warm-up: no cache entry for the HeatRisk URL");
      // 17-REVIEW WR-04: derived from the PINNED seam, never Date.now() — see the twin
      // comment in the hazards D-15 control above. Phase 17 inherited this line from
      // Phase 16 verbatim, including the defect.
      entry.timestamp = HEATRISK_NOW_MS - 65 * 60 * 1000; // within the 2x-interval stale-fallback window
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({ status: 503, text: "service unavailable" })
      }));
      const failed = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      if (typeof failed._staleAsOf !== "number") {
        throw new Error(
          `control 1: a genuine fetch failure did not leave a numeric _staleAsOf — got ${failed._staleAsOf}, ` +
          "which would make the primary assertion above vacuous"
        );
      }

      // Control 2: the aged idp_filedate lands on a DEDUPED-AWAY LOSER — _stale must NOT
      // be set, proving the age check runs on surviving items only (D-07's "applied per
      // item surviving HEAT-04's dedupe").
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };
      const day3Loser = heatRiskCatalogItem({
        name: "HeatRisk_3_Mercator_loser", validtime: heatRiskValidtimeForDay(3), filedate: agedFiledate
      });
      const day3Winner = heatRiskCatalogItem({
        name: "HeatRisk_3_Mercator", validtime: heatRiskValidtimeForDay(3), filedate: HEATRISK_NOW_MS
      });
      const otherDays = [1, 2, 4, 5, 6, 7].map((d) =>
        heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) })
      );
      const dedupeItems = [otherDays[0], otherDays[1], day3Loser, day3Winner, otherDays[2], otherDays[3], otherDays[4], otherDays[5]];
      const dedupeValues = [1, 2, 4, 1, 3, 0, 2, 1].map(String);
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({
          body: heatRiskIdentifyResponse({ items: dedupeItems, values: dedupeValues }),
          etag: "heatrisk-stale-item-control2-v1"
        })
      }));
      const controlOut2 = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(controlOut2);
      assertHeatRiskBlockIntact(controlOut2);
      if (controlOut2._stale) {
        throw new Error(
          `control 2: an aged idp_filedate on a deduped-away loser unexpectedly set _stale=${controlOut2._stale} — ` +
          "the age check must run on surviving items only"
        );
      }
    }
  },
  {
    // Pins the day-offset-cache-staleness class Phase 16 discovered ("day-offset drift
    // on a cache hit") and this phase inherits: HeatRisk's day key is derived by
    // comparing a STATIC idp_validtime against TODAY'S LIVE CLOCK, from ONE URL covering
    // all seven days. Caching an already-bucketed day-keyed result would silently
    // misdate every category by one day per elapsed day, with no error and no badge.
    // Mutation to prove RED: change _cacheHeatRiskTuples to store the bucketed
    // { day1: ..., day2: ... } result and the runner to return it directly on a hit —
    // i.e. adopt _runArcGisDayProduct's cache shape.
    name: "heatrisk-day-offset-recomputed-on-cache-hit",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      helper._products = { showHeatRisk: true };

      const items = [];
      for (let d = 1; d <= 7; d++) {
        items.push(heatRiskCatalogItem({ name: `HeatRisk_${d}_Mercator`, validtime: heatRiskValidtimeForDay(d) }));
      }
      const values = items.map((_, i) => String((i + 1) % 5));
      const bodyFn = () => httpResponse({
        body: heatRiskIdentifyResponse({ items, values }),
        etag: "heatrisk-day-offset-v1"
      });
      const fetchFn = installHttp(helper, heatRiskRoutes({ heatRisk: bodyFn }));

      const warm = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(warm);
      assertHeatRiskBlockIntact(warm);
      for (let d = 1; d <= 7; d++) {
        const expected = Number(values[d - 1]);
        if (warm.heatRisk["day" + d].category !== expected) {
          throw new Error(`warm-up: expected day${d} category ${expected}, got ${warm.heatRisk["day" + d].category}`);
        }
      }

      // Precondition guard: the cache entry exists and its stored tuples carry NO key
      // matching /^day\d+$/ and no dayOffset key — the clock-independent whitelist
      // actually held. Without this, the assertion below could not distinguish a
      // correct re-bucketing from a lucky replay.
      const entry = helper._geoJsonCache.get(HEATRISK_URL);
      if (!entry || !entry.result || !Array.isArray(entry.result.tuples)) {
        throw new Error(`precondition failed: no cache entry (or malformed tuples) for the HeatRisk URL: ${JSON.stringify(entry)}`);
      }
      for (const tuple of entry.result.tuples) {
        const keys = Object.keys(tuple);
        const badKey = keys.find((k) => /^day\d+$/.test(k) || k === "dayOffset" || k === "offsetStart" || k === "offsetEnd");
        if (badKey) {
          throw new Error(`precondition failed: cached tuple carries a clock-dependent key "${badKey}": ${JSON.stringify(entry.result.tuples)}`);
        }
      }

      // Advance the clock by exactly one day and re-run with the SAME body/etag, so the
      // fetch takes the cache-hit path. The route is deliberately NOT reinstalled here —
      // fetchFn's own call log must accumulate across both polls for the control below.
      helper._nowMs = () => HEATRISK_NOW_MS + 86400000;
      const advanced = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(advanced);
      assertHeatRiskBlockIntact(advanced);

      // Control: the second poll actually took the cache-hit path — a matching ETag on
      // the second request. Without this the scenario could pass by simply refetching,
      // which proves nothing about the cache contract.
      const identifyCalls = fetchFn.calls.filter((c) => c.url.includes(HEATRISK_URL));
      if (identifyCalls.length !== 2) {
        throw new Error(`control failed: expected exactly two HeatRisk identify requests, got ${identifyCalls.length}`);
      }
      if (identifyCalls[1].headers["If-None-Match"] !== "heatrisk-day-offset-v1") {
        throw new Error(
          `control failed: expected the second poll's request to carry If-None-Match: heatrisk-day-offset-v1, ` +
          `proving a real cache entry was written and consulted, got headers=${JSON.stringify(identifyCalls[1].headers)}`
        );
      }

      // Primary assertion: every category has shifted DOWN one day — what was day2 on
      // the first run is day1 on the second, and day7 is now null (its tile is now
      // yesterday's, falling outside 1..7). At least two specific correspondences are
      // asserted so a partial shift is caught.
      const expectedDay1 = Number(values[1]); // was day2's value
      const expectedDay6 = Number(values[6]); // was day7's value
      if (advanced.heatRisk.day1.category !== expectedDay1) {
        throw new Error(
          `day-offset drift: expected day1 to now carry the value formerly attributed to day2 (${expectedDay1}), ` +
          `got ${advanced.heatRisk.day1.category} — a cached bucketed result would return the identical day mapping`
        );
      }
      if (advanced.heatRisk.day6.category !== expectedDay6) {
        throw new Error(
          `day-offset drift: expected day6 to now carry the value formerly attributed to day7 (${expectedDay6}), ` +
          `got ${advanced.heatRisk.day6.category}`
        );
      }
      if (advanced.heatRisk.day7.category !== null) {
        throw new Error(
          `day-offset drift: expected day7 null (its tile is now yesterday's, outside the 1..7 span), got ` +
          `${advanced.heatRisk.day7.category}`
        );
      }
    }
  },
  {
    // D-03's gate term, pinned directly: a HeatRisk-only day above the floor must render
    // its own row AND must not suppress the all-clear at the same time — the "gate speaks,
    // render is silent" defect class Phase 15 shipped for MPD (MPD-01). Direct sibling of
    // frontend-advisory-only-is-not-an-all-clear / frontend-hazards-window-band-only-is-
    // not-an-all-clear, applied to HeatRisk.
    name: "frontend-heatrisk-only-is-not-an-all-clear",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const config = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showHazardsOutlook: false, showHeatRisk: true, showMinorHeat: false
      };
      const allNullHeatRisk = () => {
        const block = {};
        for (let d = 1; d <= 7; d++) block["day" + d] = { category: null, text: "", color: "" };
        return block;
      };

      // Precondition guard: the SAME otherwise-all-quiet payload with heatRisk carrying
      // no reading at all must render the plain all-clear. If it does not, some OTHER
      // term in the payload is already disqualifying the gate and this scenario proves
      // nothing about HeatRisk.
      const controlPayload = { ...noRiskPayloadWithAdvisory({ spcMD: [], mpd: [] }), heatRisk: allNullHeatRisk() };
      const controlRendered = renderDom(frontend, { config, spcrisk: controlPayload });
      if (controlRendered !== "No Severe Weather Risk") {
        throw new Error(
          "precondition failed: the otherwise-all-quiet control payload (heatRisk all null) did not " +
          `render the plain all-clear — some other term is already disqualifying the gate: ${controlRendered}`
        );
      }

      const heatRiskBlock = allNullHeatRisk();
      heatRiskBlock.day3 = { category: 3, text: "Major", color: "e22f33" };
      const payload = { ...noRiskPayloadWithAdvisory({ spcMD: [], mpd: [] }), heatRisk: heatRiskBlock };
      const rendered = renderDom(frontend, { config, spcrisk: payload });
      if (rendered.includes("No Severe Weather Risk")) {
        throw new Error(
          "D-03: a HeatRisk-only day above the floor (category 3, showMinorHeat false) suppressed the " +
          `all-clear was not the outcome; instead it rendered the all-clear anyway: ${rendered}`
        );
      }
      if (!rendered.includes("Heat Risk (Day 3)")) {
        throw new Error(`D-03: a HeatRisk-only day above the floor did not render its own row: ${rendered}`);
      }
    }
  },
  {
    // D-03's shared-predicate discipline plus D-01's floor — the scenario that would have
    // caught Phase 15's MPD-invisible defect class. Arm A: a Minor (category 1) day with
    // showMinorHeat off must render NEITHER its own row NOR nothing — a blank module is
    // exactly the failure this pins, and it is what a gate reading the raw category while
    // the render loop reads the floored one would produce. Arm B: the identical payload
    // with showMinorHeat on flips to the opposite outcome, driven purely by the frontend
    // flag (D-02: showMinorHeat never crosses the wire, so this payload is byte-identical
    // in both arms).
    name: "frontend-heatrisk-minor-floor-is-not-a-blank-module",
    run: async (helper) => {
      const frontend = loadFrontendModule();
      const baseConfig = {
        lat: PROBE_LAT, lon: PROBE_LON, extended: false, updateInterval: 60,
        proximityWeighting: false, showExcessiveRain: false, showWinterImpact: false,
        showHazardsOutlook: false, showHeatRisk: true
      };
      const allNullHeatRisk = () => {
        const block = {};
        for (let d = 1; d <= 7; d++) block["day" + d] = { category: null, text: "", color: "" };
        return block;
      };

      const minorBlock = allNullHeatRisk();
      minorBlock.day3 = { category: 1, text: "Minor", color: "f4f257" };
      const payload = { ...noRiskPayloadWithAdvisory({ spcMD: [], mpd: [] }), heatRisk: minorBlock };

      // Arm A: showMinorHeat off. A blank module (neither the row nor the all-clear) is
      // exactly the failure D-03 exists to make unrepresentable.
      const armA = renderDom(frontend, { config: { ...baseConfig, showMinorHeat: false }, spcrisk: payload });
      if (armA.includes("Heat Risk (Day 3)")) {
        throw new Error(`Arm A (showMinorHeat false): expected the Minor row filtered out by the floor, got: ${armA}`);
      }
      if (!armA.includes("No Severe Weather Risk")) {
        throw new Error(`Arm A (showMinorHeat false): expected the all-clear restored, got a blank module: ${armA}`);
      }

      // Arm B: the SAME payload object, showMinorHeat on — the opposite outcome, driven
      // only by the frontend flag.
      const armB = renderDom(frontend, { config: { ...baseConfig, showMinorHeat: true }, spcrisk: payload });
      if (!armB.includes("Heat Risk (Day 3)")) {
        throw new Error(`Arm B (showMinorHeat true): expected the Minor row to render, got: ${armB}`);
      }
      if (armB.includes("No Severe Weather Risk")) {
        throw new Error(`Arm B (showMinorHeat true): expected the all-clear suppressed by the rendered row, got: ${armB}`);
      }

      // Control: a category-2 (Moderate) day with showMinorHeat off DOES render — proving
      // Arm A's non-render is the D-01 floor at work, not a renderer that never renders.
      const moderateBlock = allNullHeatRisk();
      moderateBlock.day3 = { category: 2, text: "Moderate", color: "ffc700" };
      const controlPayload = { ...noRiskPayloadWithAdvisory({ spcMD: [], mpd: [] }), heatRisk: moderateBlock };
      const controlRendered = renderDom(frontend, { config: { ...baseConfig, showMinorHeat: false }, spcrisk: controlPayload });
      if (!controlRendered.includes("Heat Risk (Day 3)")) {
        throw new Error(
          `control: a category-2 day with showMinorHeat false did not render (${controlRendered}) — Arm A's ` +
          "non-render would then prove nothing about the floor specifically"
        );
      }
    }
  },
  {
    // DATA-03 / D-11: a unit-style test of the validator itself, run once against a
    // scenario-local fixture registry — never the real PRODUCT_REGISTRY — unlike every
    // other entry in this file, which drives a poll through getSpcOutlook/getDom.
    name: "registry-rejects-shared-label-maps-at-load-time",
    run: async (helper) => {
      // The shipped state is clean: this already ran once at productRegistry.js's own
      // module-load call (or loadNodeHelper() could never have succeeded). Re-running it
      // explicitly here means a future regression fails THIS scenario with a diagnosable
      // message, rather than only ever crashing module load for the whole suite.
      assertNoSharedRegistryMaps(PRODUCT_REGISTRY);

      // A scenario-local fixture with two rows sharing the SAME valueToTier object by
      // reference. Built fresh, sharing no object with the real PRODUCT_REGISTRY, so
      // nothing below can mutate it.
      const sharedMap = { 1: "A" };
      const fixtureShared = {
        rowOne: { valueToTier: sharedMap },
        rowTwo: { valueToTier: sharedMap }
      };
      let threw = null;
      try {
        assertNoSharedRegistryMaps(fixtureShared);
      } catch (err) {
        threw = err;
      }
      if (!threw) {
        throw new Error(
          "expected assertNoSharedRegistryMaps to throw on two rows sharing the same valueToTier " +
          "object by reference, it did not throw"
        );
      }
      if (!threw.message.includes("rowOne") || !threw.message.includes("rowTwo") || !threw.message.includes("valueToTier")) {
        throw new Error(`expected the throw message to name both row ids and the field, got: ${threw.message}`);
      }

      // 17-REVIEW WR-07: the same fixture for `dayLayers`, the field the list used to omit.
      // Two arcgis-day-layers rows sharing one dayLayers map would send one product's
      // Day-N request to the other's layer id — a well-formed 200 carrying a plausible
      // payload, with no error anywhere. Driven separately from valueToTier because a
      // MAP_FIELDS entry can be dropped one at a time, and a shared assertion over one
      // field proves nothing about another.
      const sharedDayLayers = { 1: 10, 2: 11 };
      let dayLayersThrew = null;
      try {
        assertNoSharedRegistryMaps({
          rowOne: { dayLayers: sharedDayLayers },
          rowTwo: { dayLayers: sharedDayLayers }
        });
      } catch (err) {
        dayLayersThrew = err;
      }
      if (!dayLayersThrew || !dayLayersThrew.message.includes("dayLayers")) {
        throw new Error(
          "WR-07: expected assertNoSharedRegistryMaps to throw naming `dayLayers` on two rows sharing one " +
          `dayLayers object by reference, got: ${dayLayersThrew ? dayLayersThrew.message : "no throw"}`
        );
      }

      // ...and for `layers`, the hazard-window rows' array of layer descriptors. Identity
      // comparison must work on an array exactly as it does on a plain object.
      const sharedLayers = [{ id: 4 }, { id: 5 }];
      let layersThrew = null;
      try {
        assertNoSharedRegistryMaps({
          rowOne: { layers: sharedLayers },
          rowTwo: { layers: sharedLayers }
        });
      } catch (err) {
        layersThrew = err;
      }
      if (!layersThrew || !layersThrew.message.includes("layers")) {
        throw new Error(
          "WR-07: expected assertNoSharedRegistryMaps to throw naming `layers` on two rows sharing one " +
          `layers array by reference, got: ${layersThrew ? layersThrew.message : "no throw"}`
        );
      }

      // Control 1: distinct-but-structurally-identical objects must NOT throw — the check
      // is object identity, not deep equality.
      const fixtureDistinct = {
        rowOne: { valueToTier: { 1: "A" }, dayLayers: { 1: 10 }, layers: [{ id: 4 }] },
        rowTwo: { valueToTier: { 1: "A" }, dayLayers: { 1: 10 }, layers: [{ id: 4 }] }
      };
      assertNoSharedRegistryMaps(fixtureDistinct); // must not throw

      // Control 2: a row whose map field is undefined/null is skipped without throwing.
      const fixtureMissing = {
        rowOne: { valueToTier: sharedMap },
        rowTwo: { valueToTier: undefined },
        rowThree: { valueToTier: null }
      };
      assertNoSharedRegistryMaps(fixtureMissing); // must not throw

      // Coverage limit (D-11's own documented gap, restated here rather than only in the
      // validator's own comment): identity cannot see a toValue closure that reads a
      // foreign constant BY NAME rather than sharing the object by reference.
      // 17-PATTERNS.md §9's enumerated label-to-value table is the paired recorded
      // spot-check artifact D-11 requires alongside this assertion — D-11 explicitly
      // rejected the assertion alone as overstating its own coverage.

      // The real PRODUCT_REGISTRY must remain provably unmutated by everything above —
      // re-run the exact same call this scenario opened with and confirm it still does
      // not throw. (The suite's own self-check additionally re-requires productRegistry.js
      // fresh, out of process, after the full run — see the plan's SUMMARY.)
      assertNoSharedRegistryMaps(PRODUCT_REGISTRY);
    }
  },
  {
    // PERF-01 / D-10: proves the six-member Promise.allSettled batch genuinely overlaps in
    // flight — a later member's request issued before an earlier member's response
    // resolves — the structural difference sequential awaits cannot produce. Drives the
    // real path through the _fetch transport seam via installDeferredHttp (Task 2's new
    // harness infrastructure), since no other stub in this suite can hold a request open
    // long enough to observe simultaneous issuance without depending on wall-clock timing.
    //
    // The existing ~25-hop sequential SPC/fire-weather chain (PERF-01 out of scope,
    // unchanged) runs BEFORE the new-product batch inside getSpcOutlook and shares this
    // same _fetch seam, so this scenario must drain it first — releasing only its own
    // requests, one at a time as they appear, via `.lyr.geojson`'s existing catch-all
    // substring — before the six-member batch's own requests can even be issued. The
    // moment a batch-member URL appears pending, draining stops so the overlap can be
    // observed undisturbed. Uses adm-zip (via kmzOf) for a genuinely empty spcMD index
    // KMZ, so it is gated on kml-deps like every other advisory-chain scenario.
    name: "new-product-batch-fetches-issue-before-siblings-resolve",
    requires: "kml-deps",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;

      // Member id -> the one representative URL that identifies that member's own FIRST
      // request, matching node_helper.js's own `members` array order exactly (excessiveRain
      // is member 1, heatRisk is member 4).
      const BATCH_MARKERS = [
        { id: "excessiveRain", url: ERO_URLS[1] },
        { id: "winterImpact", url: WSSI_URLS[1] },
        { id: "hazardsOutlook", url: HAZARDS_URLS[PRODUCT_REGISTRY.hazardsOutlook.layers[0].id] },
        { id: "heatRisk", url: HEATRISK_URL },
        { id: "spcMD", url: PRODUCT_REGISTRY.spcMD.discoveryUrl },
        { id: "mpd", url: PRODUCT_REGISTRY.mpd.discoveryUrl }
      ];
      const isBatchUrl = (url) => BATCH_MARKERS.some((m) => url.includes(m.url));
      const pendingBatchIds = (fetchFn) => {
        const found = new Set();
        for (const p of fetchFn.pending) {
          for (const m of BATCH_MARKERS) {
            if (p.url.includes(m.url)) found.add(m.id);
          }
        }
        return found;
      };
      const quietFeatures = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "batch-quiet-v1" });
      const quietSpcMdIndex = () => httpResponse({
        buffer: kmzOf({ "activemd.kml": activeIndexKml([]) }),
        etag: "batch-spcmd-quiet-v1"
      });
      const quietMpdListing = () => httpResponse({ text: mpdListingHtml([]), etag: "batch-mpd-quiet-v1" });
      const healthyHeatRisk = () => {
        const items = healthyHeatRiskItems();
        return httpResponse({
          body: heatRiskIdentifyResponse({ items, values: items.map(() => "1") }),
          etag: "batch-heatrisk-quiet-v1"
        });
      };
      const buildRoutes = () => [
        [".lyr.geojson", quietFeatures],
        ...Object.values(ERO_URLS).map((u) => [u, quietFeatures]),
        ...Object.values(WSSI_URLS).map((u) => [u, quietFeatures]),
        ...Object.values(HAZARDS_URLS).map((u) => [u, quietFeatures]),
        [HEATRISK_URL, healthyHeatRisk],
        [PRODUCT_REGISTRY.spcMD.discoveryUrl, quietSpcMdIndex],
        [PRODUCT_REGISTRY.mpd.discoveryUrl, quietMpdListing]
      ];

      // Drains every currently pending request that is NOT one of the six batch-member
      // URLs above, a small number of event-loop turns at a time (setImmediate, never a
      // wall-clock sleep), stopping the instant `minDistinctMembers` batch members are
      // simultaneously pending — so a batch-member request is never accidentally released
      // by this scenario's own draining before it can be observed.
      const MAX_TICKS = 400;
      async function drainOldChainUntil(fetchFn, minDistinctMembers) {
        let ticks = 0;
        while (pendingBatchIds(fetchFn).size < minDistinctMembers && ticks < MAX_TICKS) {
          for (const entry of fetchFn.pending.filter((p) => !isBatchUrl(p.url))) entry.release();
          await new Promise((resolve) => setImmediate(resolve));
          ticks++;
        }
        return ticks;
      }

      // Releases EVERY currently pending request, repeatedly, until `promise` itself
      // settles — a single releaseAll() only releases what is pending at that instant, but
      // each product's own per-day/per-layer/per-candidate internal loop issues further
      // requests as each prior one resolves (ERO's days 2-5, WSSI's days 2-3, every other
      // Hazards layer, every spcMD/mpd candidate KMZ), each of which this same deferred
      // stub holds pending in turn. Without continuous draining those later requests are
      // never released, `promise` never settles, and — since nothing else is scheduled —
      // the process would eventually run out of other work and either wait on the safety
      // timers (real time, one 3000ms tick per still-open request) or, if a caller had
      // unref()'d them, exit silently with no diagnostic at all.
      async function driveToCompletion(fetchFn, promise) {
        let settled = false;
        promise.then(() => { settled = true; }, () => { settled = true; });
        let ticks = 0;
        while (!settled && ticks < MAX_TICKS) {
          fetchFn.releaseAll();
          await new Promise((resolve) => setImmediate(resolve));
          ticks++;
        }
        if (!settled) {
          throw new Error(
            `driveToCompletion: outlook promise did not settle after ${MAX_TICKS} drain ticks — ` +
            `still pending: ${fetchFn.pending.map((p) => p.url).join(", ") || "(none)"}`
          );
        }
        return ticks;
      }

      const allSixToggles = {
        showExcessiveRain: true, showWinterImpact: true, showHazardsOutlook: true,
        showHeatRisk: true, showSPCMD: true, showMPD: true
      };
      helper._products = allSixToggles;
      installDeferredHttp(helper, buildRoutes());
      const outlookPromise = helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, allSixToggles);

      const ticksUsed = await drainOldChainUntil(helper._fetch, 2);

      // PRECONDITION GUARD: at least two different batch members pending — otherwise
      // either the batch is sequential (the thing under test) or the fixture failed to
      // enable multiple products. Distinguish the two in the message.
      const pendingIds = pendingBatchIds(helper._fetch);
      if (pendingIds.size < 2) {
        throw new Error(
          `precondition failed: expected at least two different batch members pending after ` +
          `${ticksUsed} drain ticks, got ${pendingIds.size} (${[...pendingIds].join(", ") || "none"}). ` +
          `Pending URLs: ${helper._fetch.pending.map((p) => p.url).join(", ") || "(none)"}. ` +
          `Enabled toggles: ${JSON.stringify(allSixToggles)}`
        );
      }

      // PRIMARY ASSERTION: member 4 (HeatRisk)'s request has been ISSUED (present in
      // `calls`) while member 1 (ERO)'s day-1 request is STILL PENDING — i.e. HeatRisk was
      // issued before ERO's response resolved. Under sequential awaits member 4 cannot
      // even be issued until member 1's entire per-day loop completes, so this is exactly
      // the structural difference a reversion to sequential awaits collapses.
      const heatRiskIssued = helper._fetch.calls.some((c) => c.url.includes(HEATRISK_URL));
      const eroDay1StillPending = helper._fetch.pending.some((p) => p.url.includes(ERO_URLS[1]));
      if (!heatRiskIssued || !eroDay1StillPending) {
        throw new Error(
          `PERF-01: expected the HeatRisk identify URL (member 4) to be issued while the ERO day-1 URL ` +
          `(member 1) is still pending, got heatRiskIssued=${heatRiskIssued} eroDay1StillPending=${eroDay1StillPending}. ` +
          `Calls so far: ${helper._fetch.calls.map((c) => c.url).join(", ")}. ` +
          `Pending: ${helper._fetch.pending.map((p) => p.url).join(", ")}`
        );
      }

      // Release everything and let the poll complete. Concurrency must not have cost
      // correctness.
      await driveToCompletion(helper._fetch, outlookPromise);
      const out = await outlookPromise;
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);
      if (out._stale) {
        throw new Error(`expected _stale unset after a fully successful concurrent batch, got ${out._stale}`);
      }
      for (const key of ["excessiveRain", "winterImpact", "hazardsOutlook", "heatRisk", "advisories"]) {
        if (out[key] === undefined) {
          throw new Error(`expected ${key} present in the settled payload, got no such key: ${Object.keys(out).join(", ")}`);
        }
      }

      // SECOND ASSERTION (D-10's log): the per-run timing line carries a numeric timing
      // for every one of the six member ids.
      const timingLine = logCalls.find((line) => line.includes("new-product batch settled in"));
      if (!timingLine) {
        throw new Error(`expected a "new-product batch settled in <n>ms" log line, got: ${JSON.stringify(logCalls)}`);
      }
      const jsonStart = timingLine.indexOf("{");
      if (jsonStart === -1) {
        throw new Error(`expected the timing log line to carry a JSON payload, got: ${timingLine}`);
      }
      const timings = JSON.parse(timingLine.slice(jsonStart));
      for (const m of BATCH_MARKERS) {
        if (typeof timings[m.id] !== "number") {
          throw new Error(`expected a numeric timing for member "${m.id}", got ${JSON.stringify(timings)}`);
        }
      }

      // CONTROL ASSERTION: with only ONE product toggle enabled, exactly one batch member's
      // request is pending at the same yield point — proving the multi-pending observation
      // above is caused by the batch, not by the harness issuing spurious requests.
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => HEATRISK_NOW_MS;
      const singleToggle = { showHeatRisk: true };
      helper._products = singleToggle;
      installDeferredHttp(helper, buildRoutes());
      const controlPromise = helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, singleToggle);
      await drainOldChainUntil(helper._fetch, 1);
      const controlPendingIds = pendingBatchIds(helper._fetch);
      if (controlPendingIds.size !== 1) {
        throw new Error(
          `control: expected exactly one batch member pending with a single toggle enabled, got ` +
          `${controlPendingIds.size} (${[...controlPendingIds].join(", ")}). Pending URLs: ` +
          `${helper._fetch.pending.map((p) => p.url).join(", ")}`
        );
      }
      await driveToCompletion(helper._fetch, controlPromise);
      const controlOut = await controlPromise;
      assertPayloadIntact(controlOut);
      assertHeatRiskBlockIntact(controlOut);
    }
  },

  // -----------------------------------------------------------------
  // Phase 18 / MERGE-01: grid-anchor, day-window and precedence scenarios
  // (plan 18-07). Each entry below pins one of 18-CONTEXT.md's D-09..D-14
  // day-window normalization decisions as an executable, mutation-proven
  // proof against the real `days`/`sources` merge output.
  // -----------------------------------------------------------------

  {
    // D-12: the observed branch of _spcGridAnchor — SPC's own VALID_ISO/EXPIRE_ISO,
    // read straight off the winning day-1 categorical polygon. This exact VALID_ISO/
    // EXPIRE_ISO pair is 18-02's live-observed Case B, reused verbatim here and by
    // merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day below.
    // Mutation to prove RED: change _spcGridAnchor to derive nominalStartMs from the
    // VALID parse instead of EXPIRE_ISO minus MS_PER_DAY.
    name: "merge-grid-anchor-observed-reads-spc-valid-and-expire",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._products = {};
        installHttp(helper, [
          ["day1otlk_cat.lyr.geojson", () => httpResponse({
            body: {
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                properties: {
                  LABEL: "SLGT",
                  VALID_ISO: "2026-09-05T13:00:00Z",
                  EXPIRE_ISO: "2026-09-06T12:00:00Z"
                },
                geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
              }]
            },
            etag: "merge-grid-anchor-observed-v1"
          })],
          ...hazardsRoutes()
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {});
        assertPayloadIntact(out);

        // Precondition guard: the fixture actually produced a winning, non-"NONE" day1
        // reading, so an anchor of null/"estimated" cannot be explained by the polygon
        // never winning at all.
        if (out.day1.risk === "NONE") {
          throw new Error(
            "precondition failed: day1.risk is NONE, so the fixture's polygon never won and this scenario proves nothing about the anchor"
          );
        }

        if (out.sources["spc-convective"].gridAnchor !== "observed") {
          throw new Error(`D-12: expected "observed" with a usable EXPIRE_ISO, got ${JSON.stringify(out.sources["spc-convective"].gridAnchor)}`);
        }
        if (out.days["1"].windowStart !== "2026-09-05T13:00:00.000Z") {
          throw new Error(`day1.windowStart should carry the truncated VALID_ISO, got ${out.days["1"].windowStart}`);
        }
        if (out.days["1"].windowEnd !== "2026-09-06T12:00:00.000Z") {
          throw new Error(`day1.windowEnd should equal EXPIRE_ISO, got ${out.days["1"].windowEnd}`);
        }
        if (out.days["1"].date !== "2026-09-05") {
          throw new Error(`day1.date should stay on the NOMINAL start's calendar date, unshifted by the VALID_ISO truncation, got ${out.days["1"].date}`);
        }

        // Control: day 2's window uses the NOMINAL 12Z grid, proving day 1's truncation
        // did not bleed into a second truncated read.
        if (out.days["2"].windowStart !== "2026-09-06T12:00:00.000Z") {
          throw new Error(`control: day2.windowStart should be the nominal 12Z boundary, got ${out.days["2"].windowStart}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // T-18-02/D-12: the clock-fallback branch of _spcGridAnchor, exercised by a genuine
    // hard fetch failure on the day-1 categorical layer with nothing cached.
    // Mutation to prove RED: make _spcGridAnchor return anchor: "observed" unconditionally.
    name: "merge-grid-anchor-estimated-on-spc-day1-hard-failure",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._nowMs = () => Date.UTC(2026, 8, 5, 13, 0);
      helper._products = {};
      installHttp(helper, [
        ["day1otlk_cat.lyr.geojson", () => httpResponse({ status: 503, text: "service unavailable" })],
        ...hazardsRoutes()
      ]);
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {});
      assertPayloadIntact(out);

      // Precondition guard: the estimated anchor is attributable to the hard failure
      // itself, not to a fixture that silently produced a below-floor answer.
      if (out.day1.risk !== "NONE") {
        throw new Error(`precondition failed: day1.risk is ${JSON.stringify(out.day1.risk)}, expected NONE on a hard fetch failure with nothing cached`);
      }

      if (out.sources["spc-convective"].gridAnchor !== "estimated") {
        throw new Error(`D-12: expected the clock fallback ("estimated") on a hard day-1 fetch failure with nothing cached, got ${JSON.stringify(out.sources["spc-convective"].gridAnchor)}`);
      }
      const dayKeys = Object.keys(out.days);
      if (dayKeys.length !== 14) {
        throw new Error(`expected all fourteen grid days present under the clock fallback, got ${dayKeys.length}: ${JSON.stringify(dayKeys)}`);
      }
      for (let d = 1; d <= 14; d++) {
        const entry = out.days[String(d)];
        if (typeof entry.windowStart !== "string" || Number.isNaN(new Date(entry.windowStart).getTime())) {
          throw new Error(`day ${d}: windowStart is not a well-formed ISO string: ${JSON.stringify(entry.windowStart)}`);
        }
        if (typeof entry.windowEnd !== "string" || Number.isNaN(new Date(entry.windowEnd).getTime())) {
          throw new Error(`day ${d}: windowEnd is not a well-formed ISO string: ${JSON.stringify(entry.windowEnd)}`);
        }
      }

      // control: merge-grid-anchor-observed-reads-spc-valid-and-expire proves the same
      // _spcGridAnchor function can also resolve "observed" from a real VALID_ISO/
      // EXPIRE_ISO pair, so this scenario's "estimated" is a genuine second path, not
      // the only value the field can ever take under two names.
    }
  },
  {
    // T-18-02/T-18-03: _spcGridAnchor's Number.isFinite guard, exercised directly. A
    // malformed (non-ISO) VALID_ISO/EXPIRE_ISO pair must degrade to the clock fallback
    // rather than leak an Invalid Date into the grid, and the parse must never throw.
    // Mutation to prove RED: remove the Number.isFinite(expireMs) guard in _spcGridAnchor.
    name: "merge-grid-anchor-malformed-valid-iso-degrades-to-estimated",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._nowMs = () => Date.UTC(2026, 8, 5, 13, 0);
        helper._products = {};
        installHttp(helper, [
          ["day1otlk_cat.lyr.geojson", () => httpResponse({
            body: {
              type: "FeatureCollection",
              features: [{
                type: "Feature",
                properties: { LABEL: "SLGT", VALID_ISO: "not-a-date", EXPIRE_ISO: "also-not-a-date" },
                geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
              }]
            },
            etag: "merge-grid-anchor-malformed-v1"
          })],
          ...hazardsRoutes()
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, {});
        assertPayloadIntact(out);

        // Precondition guard: the polygon still won — the malformed VALID_ISO/EXPIRE_ISO
        // fields are the ONLY thing wrong with this feature — so this exercises the
        // parse guard rather than a feature rejected upstream for an unrelated reason.
        if (out.day1.risk !== "SLGT") {
          throw new Error(`precondition failed: day1.risk is ${JSON.stringify(out.day1.risk)}, expected SLGT — the polygon must win for this to exercise the parse guard`);
        }

        if (out.sources["spc-convective"].gridAnchor !== "estimated") {
          throw new Error(`T-18-02: a malformed VALID_ISO/EXPIRE_ISO pair should degrade to "estimated", got ${JSON.stringify(out.sources["spc-convective"].gridAnchor)}`);
        }
        for (let d = 1; d <= 14; d++) {
          const entry = out.days[String(d)];
          if (Number.isNaN(new Date(entry.windowStart).getTime()) || Number.isNaN(new Date(entry.windowEnd).getTime())) {
            throw new Error(`day ${d}: a malformed anchor leaked an Invalid Date into the grid: ${JSON.stringify(entry)}`);
          }
        }

        // control: this scenario's control is the companion observed-branch scenario
        // above (merge-grid-anchor-observed-reads-spc-valid-and-expire), whose
        // well-formed VALID_ISO/EXPIRE_ISO pair proves the SAME code path resolves
        // "observed" cleanly — so this scenario's "estimated" is the parse guard
        // rejecting bad input, not the only value the function can ever produce.
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-01's near-boundary case (D-10): a 00Z-00Z wpc-hazards Precipitation feature
    // forward-aligns onto the SPC 12Z grid day that STARTS at 12Z on its own calendar
    // date, never the grid day before it. Reuses 18-02's live-observed VALID_ISO/
    // EXPIRE_ISO anchor pair (Case B) so the anchor under test here is the SAME
    // truncated-to-13:00Z anchor 18-02 measured, not a clean, non-representative one.
    // Mutation to prove RED (the highest-value mutation in this phase): pass
    // anchorInfo.day1StartMs instead of anchorInfo.nominalStartMs into the _gridDayOf
    // call in _addHazardsOutlookGridEntries — this reproduces the exact divergence
    // plan 18-02 Task 1 measured, so a green result here would mean MERGE-01 is
    // unverified.
    name: "merge-grid-hazards-00z-feature-forward-aligns-to-next-grid-day",
    run: async (helper) => {
      const day1Fixture = () => httpResponse({
        body: {
          type: "FeatureCollection",
          features: [{
            type: "Feature",
            properties: {
              LABEL: "SLGT",
              VALID_ISO: "2026-09-05T13:00:00Z",
              EXPIRE_ISO: "2026-09-06T12:00:00Z"
            },
            geometry: { type: "Polygon", coordinates: [SAMPLE_RING] }
          }]
        },
        etag: "merge-grid-hazards-day1-v1"
      });
      // Fixed well before the Sep 5/6 source days under test, so both features' legacy
      // offsets land inside the Hazards Outlook's own [3,14] day-grid span rather than
      // being clamped out — the precondition guard below needs the label to actually
      // reach the legacy block.
      const NOW_MS = Date.UTC(2026, 8, 2, 13, 0);

      const originalPointInPolygon = turfStub.pointInPolygon;
      const runWithFeature = async (feature) => {
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._nowMs = () => NOW_MS;
        helper._products = { showHazardsOutlook: true };
        const layer4Fixture = () => httpResponse({
          body: hazardsCollection([feature]),
          etag: "merge-grid-hazards-layer4-v1"
        });
        installHttp(helper, [
          ["day1otlk_cat.lyr.geojson", day1Fixture],
          ...hazardsRoutes({ 4: layer4Fixture })
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHazardsOutlook: true });
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        return out;
      };

      try {
        const testFeature = hazardsFeature({
          label: "Heavy Rain", startDate: Date.UTC(2026, 8, 6), endDate: Date.UTC(2026, 8, 7)
        });
        const primaryOut = await runWithFeature(testFeature);

        // Precondition guard: the label actually reached the legacy hazardsOutlook day
        // grid, so a missing Phase 18 grid entry cannot be explained by the feature
        // having been filtered out somewhere upstream of the grid-entry builder.
        let reachedLegacy = false;
        for (let d = 3; d <= 14; d++) {
          if (primaryOut.hazardsOutlook[`day${d}`].hazards.some((h) => h.label === "Heavy Rain")) {
            reachedLegacy = true;
            break;
          }
        }
        if (!reachedLegacy) {
          throw new Error(
            "precondition failed: \"Heavy Rain\" never reached the legacy hazardsOutlook day grid, so a missing Phase 18 grid entry cannot be attributed to D-10's forward-align rule"
          );
        }

        const day2Entries = primaryOut.days["2"].hazards.filter((h) => h.source === "wpc-hazards" && h.label === "Heavy Rain");
        if (day2Entries.length !== 1 || day2Entries[0].dimension !== "heavy-precip") {
          throw new Error(`D-10: expected exactly one wpc-hazards "Heavy Rain" entry on grid day 2 with dimension heavy-precip, got ${JSON.stringify(primaryOut.days["2"].hazards)}`);
        }
        const day1TestEntries = primaryOut.days["1"].hazards.filter((h) => h.source === "wpc-hazards" && h.label === "Heavy Rain");
        if (day1TestEntries.length !== 0) {
          throw new Error(`D-10: a Sep 6 00Z-00Z feature forward-aligned onto grid day 1 instead of grid day 2 — got ${JSON.stringify(day1TestEntries)}`);
        }

        // Control: an adjacent source day (Sep 5 00Z-00Z) lands on grid day 1 and not
        // grid day 2, proving the gate distinguishes the two adjacent source days
        // rather than placing everything on one.
        const controlFeature = hazardsFeature({
          label: "Heavy Rain", startDate: Date.UTC(2026, 8, 5), endDate: Date.UTC(2026, 8, 6)
        });
        const controlOut = await runWithFeature(controlFeature);
        const controlDay1 = controlOut.days["1"].hazards.filter((h) => h.source === "wpc-hazards" && h.label === "Heavy Rain");
        const controlDay2 = controlOut.days["2"].hazards.filter((h) => h.source === "wpc-hazards" && h.label === "Heavy Rain");
        if (controlDay1.length !== 1 || controlDay2.length !== 0) {
          throw new Error(`control: expected the Sep 5 00Z-00Z feature on grid day 1 only, got day1=${JSON.stringify(controlDay1)} day2=${JSON.stringify(controlDay2)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // D-10/D-13: HeatRisk's idp_validtime point sample maps onto its OWN Phase 18 grid
    // day — no interval-overlap or broadcast logic, matching _addHeatRiskGridEntries's
    // own maintainer note that this function must never be "fixed" to match
    // _addHazardsOutlookGridEntries's span-clamped loop.
    // Mutation to prove RED: add 1 to the grid day computed in _addHeatRiskGridEntries.
    name: "merge-grid-heatrisk-12z-sample-maps-to-its-own-grid-day",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      // SPC anchor nominal at 2026-09-05T12:00:00Z via the clock fallback (no SPC layer
      // is routed with a real VALID_ISO/EXPIRE_ISO here — this scenario is about
      // HeatRisk's own mapping, not the anchor source).
      const NOW_MS = Date.UTC(2026, 8, 5, 13, 0);
      helper._nowMs = () => NOW_MS;
      helper._products = { showHeatRisk: true };
      const items = [
        heatRiskCatalogItem({ name: "HeatRisk_1_Mercator", validtime: Date.UTC(2026, 8, 5, 12), filedate: NOW_MS - 30 * 60 * 1000 }),
        heatRiskCatalogItem({ name: "HeatRisk_2_Mercator", validtime: Date.UTC(2026, 8, 6, 12), filedate: NOW_MS - 30 * 60 * 1000 })
      ];
      const values = ["3", "1"];
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({ body: heatRiskIdentifyResponse({ items, values }), etag: "merge-grid-heatrisk-day-v1" })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      // Precondition guard: the legacy heatRisk block actually resolved non-null
      // categories, so an empty Phase 18 grid cannot be blamed on the fetch itself.
      if (out.heatRisk.day1.category !== 3 || out.heatRisk.day2.category !== 1) {
        throw new Error(`precondition failed: legacy heatRisk day1/day2 categories are ${out.heatRisk.day1.category}/${out.heatRisk.day2.category}, expected 3/1`);
      }
      if (out.sources["spc-convective"].gridAnchor !== "estimated") {
        throw new Error(`fixture check: expected the clock-fallback anchor at 2026-09-05T12:00:00Z, got gridAnchor=${JSON.stringify(out.sources["spc-convective"].gridAnchor)}`);
      }

      const day1Heat = out.days["1"].hazards.find((h) => h.source === "heatrisk");
      if (!day1Heat || day1Heat.value !== 3) {
        throw new Error(`D-10: expected a heatrisk entry with value 3 on grid day 1, got ${JSON.stringify(out.days["1"].hazards)}`);
      }
      const day2Heat = out.days["2"].hazards.find((h) => h.source === "heatrisk");
      if (!day2Heat || day2Heat.value !== 1) {
        throw new Error(`D-10: expected a heatrisk entry with value 1 on grid day 2, got ${JSON.stringify(out.days["2"].hazards)}`);
      }

      // Control: day 3 carries no heatrisk entry, proving the mapping is per-sample and
      // not a broadcast across the window.
      if (out.days["3"].hazards.some((h) => h.source === "heatrisk")) {
        throw new Error(`control: expected no heatrisk entry on grid day 3, got ${JSON.stringify(out.days["3"].hazards)}`);
      }
    }
  },
  {
    // D-10/18-03: the false-negative-on-a-heat-safety-product case. During the 00Z-12Z
    // window the legacy _todayUtcMs-relative span filter discards HeatRisk's
    // yesterday-noon tile as "day offset 0", but that exact tile is the one that covers
    // Phase 18 grid day 1 (which started 12Z yesterday) — dropping it would leave grid
    // day 1 with no HeatRisk reading for twelve hours out of every twenty-four.
    // Mutation to prove RED: move the gridTuples.push(...) call in _runHeatRiskProduct
    // to AFTER the `if (d < 1 || d > row.days) continue;` span filter.
    name: "merge-grid-heatrisk-yesterday-noon-tile-still-covers-grid-day-1",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      // Inside the 00Z-12Z window: grid day 1 (clock fallback) started 12Z Sep 5,
      // while _todayUtcMs is Sep 6's midnight.
      const NOW_MS = Date.UTC(2026, 8, 6, 6, 0);
      helper._nowMs = () => NOW_MS;
      helper._products = { showHeatRisk: true };
      const items = [
        heatRiskCatalogItem({ name: "HeatRisk_1_Mercator", validtime: Date.UTC(2026, 8, 5, 12), filedate: NOW_MS - 30 * 60 * 1000 }),
        heatRiskCatalogItem({ name: "HeatRisk_2_Mercator", validtime: Date.UTC(2026, 8, 6, 12), filedate: NOW_MS - 30 * 60 * 1000 })
      ];
      const values = ["3", "1"];
      installHttp(helper, heatRiskRoutes({
        heatRisk: () => httpResponse({ body: heatRiskIdentifyResponse({ items, values }), etag: "merge-grid-heatrisk-yesterday-v1" })
      }));
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showHeatRisk: true });
      assertPayloadIntact(out);
      assertHeatRiskBlockIntact(out);

      // Precondition guard: the legacy span filter really did discard the
      // yesterday-noon tile — legacy day1 resolves to the Sep 6 12Z sample (category 1),
      // not the Sep 5 12Z yesterday-noon tile (category 3) — proving this scenario tests
      // the side-channel rather than a value the legacy block happened to expose anyway.
      if (out.heatRisk.day1.category === 3) {
        throw new Error(
          "precondition failed: legacy heatRisk.day1.category is 3 (the yesterday-noon tile) — the legacy span filter did not discard it, so this scenario proves nothing about the side-channel"
        );
      }

      const day1Heat = out.days["1"].hazards.find((h) => h.source === "heatrisk");
      if (!day1Heat || day1Heat.value !== 3) {
        throw new Error(`D-10/18-03: expected the yesterday-noon tile (value 3) to still cover Phase 18 grid day 1, got ${JSON.stringify(out.days["1"].hazards)}`);
      }

      // control: merge-grid-heatrisk-12z-sample-maps-to-its-own-grid-day proves the same
      // fixture shape resolves cleanly when the clock sits inside the day rather than
      // straddling the 00Z-12Z boundary, so this scenario's recovered day-1 entry is the
      // side-channel doing real work, not a fixture that always lands on day 1 regardless.
    }
  },
  {
    // D-11: every 12Z-native product's native day index equals the grid index at every
    // hour — SPC convective, wpc-ero and wpc-wssi all map straight through with no
    // _gridDayOf call and no off-by-one, unlike the two 00Z-native sources above.
    // Mutation to prove RED: in _addRegistryDayGridEntries, emit on grid day N + 1
    // instead of N.
    name: "merge-grid-12z-products-map-straight-through",
    run: async (helper) => {
      const originalPointInPolygon = turfStub.pointInPolygon;
      const NOW_MS = Date.UTC(2026, 8, 5, 13, 0);
      const quietEro = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "merge-grid-ero-empty-v1" });
      const quietWssi = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "merge-grid-wssi-empty-v1" });
      const quietSpc = () => httpResponse({ body: EMPTY_FEATURE_COLLECTION, etag: "merge-grid-spc-empty-v1" });

      const buildRoutes = ({ day2Cat } = {}) => {
        const routes = [
          ["day1otlk_cat.lyr.geojson", () => httpResponse({ body: SPC_SLGT_BODY, etag: "merge-grid-spc-day1-v1" })],
          [ERO_URLS[1], () => httpResponse({ body: ERO_SLGT_BODY, etag: "merge-grid-ero-day1-v1" })],
          [ERO_URLS[2], quietEro], [ERO_URLS[3], quietEro], [ERO_URLS[4], quietEro], [ERO_URLS[5], quietEro],
          [WSSI_URLS[1], () => httpResponse({ body: WSSI_MINOR_BODY, etag: "merge-grid-wssi-day1-v1" })],
          [WSSI_URLS[2], quietWssi], [WSSI_URLS[3], quietWssi],
          [".lyr.geojson", quietSpc]
        ];
        if (day2Cat) {
          routes.unshift(["day2otlk_cat.lyr.geojson", () => httpResponse({ body: SPC_SLGT_BODY, etag: "merge-grid-spc-day2-v1" })]);
        }
        return routes;
      };

      const runWithRoutes = async (opts) => {
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._nowMs = () => NOW_MS;
        helper._products = { showExcessiveRain: true, showWinterImpact: true };
        installHttp(helper, buildRoutes(opts));
        const result = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, { showExcessiveRain: true, showWinterImpact: true });
        assertPayloadIntact(result);
        return result;
      };

      try {
        const out = await runWithRoutes();

        // Precondition guard: all three legacy blocks carry their non-NONE values, so an
        // absent Phase 18 grid entry cannot be explained by a fetch that produced nothing.
        if (out.day1.risk !== "SLGT" || out.excessiveRain.day1Risk !== "SLGT" || out.winterImpact.day1Risk !== "MINOR") {
          throw new Error(`precondition failed: expected SLGT/SLGT/MINOR on day 1, got ${out.day1.risk}/${out.excessiveRain.day1Risk}/${out.winterImpact.day1Risk}`);
        }

        const bySource = (day, sourceId) => out.days[day].hazards.find((h) => h.source === sourceId);
        const spcDay1 = bySource("1", "spc-convective");
        const eroDay1 = bySource("1", "wpc-ero");
        const wssiDay1 = bySource("1", "wpc-wssi");
        if (!spcDay1 || spcDay1.dimension !== "convective") {
          throw new Error(`D-11: expected an spc-convective entry with dimension convective on grid day 1, got ${JSON.stringify(spcDay1)}`);
        }
        if (!eroDay1 || eroDay1.dimension !== "flash-flood") {
          throw new Error(`D-11: expected a wpc-ero entry with dimension flash-flood on grid day 1, got ${JSON.stringify(eroDay1)}`);
        }
        if (!wssiDay1 || wssiDay1.dimension !== "winter") {
          throw new Error(`D-11: expected a wpc-wssi entry with dimension winter on grid day 1, got ${JSON.stringify(wssiDay1)}`);
        }
        if (bySource("2", "spc-convective") || bySource("2", "wpc-ero") || bySource("2", "wpc-wssi")) {
          throw new Error(`D-11: expected none of the three day-1 sources to also appear on grid day 2, got ${JSON.stringify(out.days["2"].hazards)}`);
        }

        // Control: the same fixture with the SPC day-2 categorical also set produces the
        // SPC entry on grid day 2 and not grid day 3, proving day indexing tracks the
        // source's own day number (D-11) rather than being pinned to day 1.
        const controlOut = await runWithRoutes({ day2Cat: true });
        if (controlOut.day2.risk !== "SLGT") {
          throw new Error(`control precondition failed: expected day2.risk SLGT, got ${controlOut.day2.risk}`);
        }
        const spcControlDay2 = controlOut.days["2"].hazards.find((h) => h.source === "spc-convective");
        if (!spcControlDay2) {
          throw new Error(`control: expected an spc-convective entry on grid day 2 once the day-2 categorical also reports SLGT, got ${JSON.stringify(controlOut.days["2"].hazards)}`);
        }
        if (controlOut.days["3"].hazards.some((h) => h.source === "spc-convective")) {
          throw new Error(`control: expected no spc-convective entry on grid day 3, got ${JSON.stringify(controlOut.days["3"].hazards)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },

  // -----------------------------------------------------------------
  // Phase 18 / MERGE-02, MERGE-03, MERGE-04, RPT-07 scenarios (plan 18-08).
  // Each entry below pins one of the merge/precedence/summary behaviors
  // 18-05 built, individually mutation-proven per 15 D-10.
  // -----------------------------------------------------------------

  {
    // MERGE-02/D-13: SPC above-floor SLGT suppresses WPC's "Severe Weather" on the SAME
    // grid day, keyed by dimension (convective), never a label match.
    // Mutation to prove RED: reverse PRECEDENCE.convective.
    name: "merge-precedence-spc-suppresses-wpc-severe-weather",
    run: async (helper) => {
      const { start, end } = mergeGridWindow(1);
      const originalPointInPolygon = turfStub.pointInPolygon;
      const runWithFeature = async (includeWpc) => {
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showHazardsOutlook: true };
        helper._products = toggles;
        const layer4 = includeWpc
          ? () => httpResponse({
              body: hazardsCollection([hazardsFeature({ label: "Severe Weather", startDate: start, endDate: end })]),
              etag: "merge-precedence-spc-wpc-v1"
            })
          : undefined;
        installHttp(helper, [
          ["day1otlk_cat.lyr.geojson", () => httpResponse({ body: SPC_SLGT_BODY, etag: "merge-precedence-spc-day1-v1" })],
          ...hazardsRoutes(layer4 ? { 4: layer4 } : {})
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        return out;
      };

      try {
        const out = await runWithFeature(true);

        // Precondition guard: a suppression cannot be claimed proven if the WPC entry
        // never reached the day at all -- both competing entries must be present first.
        const spc = out.days["1"].hazards.find((h) => h.source === "spc-convective");
        const wpc = out.days["1"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Severe Weather");
        if (!spc || !wpc) {
          throw new Error(`precondition failed: expected both spc-convective and wpc-hazards entries on day 1, got ${JSON.stringify(out.days["1"].hazards)}`);
        }

        if (spc.suppressedBy !== null) {
          throw new Error(`MERGE-02: expected spc-convective entry suppressedBy null, got ${JSON.stringify(spc.suppressedBy)}`);
        }
        if (wpc.suppressedBy !== "spc-convective") {
          throw new Error(`MERGE-02: expected wpc-hazards Severe Weather suppressedBy "spc-convective" (dimension-keyed, never a label match), got ${JSON.stringify(wpc.suppressedBy)}`);
        }

        // Control: with the WPC feature removed, SPC's entry is STILL suppressedBy
        // null -- proving the field is not merely always-null-for-SPC.
        const controlOut = await runWithFeature(false);
        const controlSpc = controlOut.days["1"].hazards.find((h) => h.source === "spc-convective");
        if (!controlSpc || controlSpc.suppressedBy !== null) {
          throw new Error(`control: expected spc-convective suppressedBy null with no competitor, got ${JSON.stringify(controlSpc)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-02/D-13/D-14: SPC's real "reported below floor" reading (TSTM) must NOT
    // suppress WPC's Severe Weather -- a quiet source never erases another source's
    // warning.
    // Mutation to prove RED: change NO_RISK_FLOOR['spc-convective'].categorical to
    // `value > 0`, so TSTM becomes active.
    name: "merge-precedence-spc-below-floor-does-not-suppress-wpc",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showHazardsOutlook: true };
        helper._products = toggles;
        const { start, end } = mergeGridWindow(1);
        const SPC_TSTM_BODY = {
          type: "FeatureCollection",
          features: [{ type: "Feature", properties: { LABEL: "TSTM" }, geometry: { type: "Polygon", coordinates: [SAMPLE_RING] } }]
        };
        installHttp(helper, [
          ["day1otlk_cat.lyr.geojson", () => httpResponse({ body: SPC_TSTM_BODY, etag: "merge-precedence-spc-tstm-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({
            body: hazardsCollection([hazardsFeature({ label: "Severe Weather", startDate: start, endDate: end })]),
            etag: "merge-precedence-tstm-wpc-v1"
          }) })
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);

        // Precondition guard: SPC genuinely reported for day 1 -- this is the
        // below-floor path, not the absent path.
        if (!out.sources["spc-convective"].reportedDays.includes(1)) {
          throw new Error(`precondition failed: sources['spc-convective'].reportedDays does not include day 1: ${JSON.stringify(out.sources["spc-convective"].reportedDays)}`);
        }
        if (out.day1.risk !== "TSTM") {
          throw new Error(`precondition failed: day1.risk is ${JSON.stringify(out.day1.risk)}, expected TSTM`);
        }

        const spc = out.days["1"].hazards.find((h) => h.source === "spc-convective");
        if (spc) {
          throw new Error(`D-13: expected NO spc-convective entry on day 1 (TSTM is below floor), got ${JSON.stringify(spc)}`);
        }
        const wpc = out.days["1"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Severe Weather");
        if (!wpc || wpc.suppressedBy !== null) {
          throw new Error(`D-13: expected wpc-hazards Severe Weather to survive with suppressedBy null via the reported-below-floor path, got ${JSON.stringify(wpc)}`);
        }

        // Control: activeDays does NOT contain day 1, distinguishing "reported below
        // floor" from "reported and won".
        if (out.sources["spc-convective"].activeDays.includes(1)) {
          throw new Error(`control: expected sources['spc-convective'].activeDays to NOT include day 1, got ${JSON.stringify(out.sources["spc-convective"].activeDays)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-02/D-14: the ABSENT path (SPC never covers this grid day at all), kept as a
    // separate scenario from the below-floor path above so a future conflation of the
    // two turns the suite red.
    // Mutation to prove RED: make _addSpcGridEntries record reportedDays for all
    // fourteen grid days regardless of coverage.
    name: "merge-precedence-spc-absent-day-is-not-the-floor-path",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showHazardsOutlook: true };
        helper._products = toggles;
        const { start, end } = mergeGridWindow(9);
        installHttp(helper, hazardsRoutes({ 6: () => httpResponse({
          body: hazardsCollection([hazardsFeature({ label: "Severe Weather", startDate: start, endDate: end })]),
          etag: "merge-precedence-spc-absent-v1"
        }) }));
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);

        // Precondition guard: SPC never reported for grid day 9 at all -- proving this
        // is the absent path, not a below-floor reading.
        if (out.sources["spc-convective"].reportedDays.includes(9)) {
          throw new Error(`precondition failed: sources['spc-convective'].reportedDays includes day 9: ${JSON.stringify(out.sources["spc-convective"].reportedDays)}`);
        }

        const wpc = out.days["9"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Severe Weather");
        if (!wpc || wpc.suppressedBy !== null) {
          throw new Error(`D-14: expected wpc-hazards Severe Weather to survive with suppressedBy null via the absent path, got ${JSON.stringify(wpc)}`);
        }

        // Control: SPC reported normally on days 1-3 (always-fetched, unconditional of
        // `extended`) in this SAME run, so day 9's absence is not a fetch that failed
        // altogether -- quoting both arrays makes a future conflation of "SPC never
        // answered anything" with "SPC never covers day 9" impossible to miss.
        for (const d of [1, 2, 3]) {
          if (!out.sources["spc-convective"].reportedDays.includes(d)) {
            throw new Error(`control: expected sources['spc-convective'].reportedDays (${JSON.stringify(out.sources["spc-convective"].reportedDays)}) to include always-fetched day ${d}, distinct from day 9's absence`);
          }
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-03/D-13: HeatRisk category 2 (above floor) suppresses WPC's Hazardous Heat
    // on the same grid day.
    // Mutation to prove RED: reverse PRECEDENCE.heat.
    name: "merge-precedence-heatrisk-suppresses-wpc-hazardous-heat",
    run: async (helper) => {
      const { start, end } = mergeGridWindow(3);
      const originalPointInPolygon = turfStub.pointInPolygon;
      const runWithFeature = async (includeWpc) => {
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showHeatRisk: true, showHazardsOutlook: true };
        helper._products = toggles;
        const items = [heatRiskCatalogItem({ name: "HeatRisk_3_Mercator", validtime: MERGE_NOMINAL_MS + 2 * 86400000, filedate: MERGE_NOW_MS - 30 * 60 * 1000 })];
        const heatRoute = () => httpResponse({ body: heatRiskIdentifyResponse({ items, values: ["2"] }), etag: "merge-precedence-heat-v1" });
        const layer4 = includeWpc
          ? () => httpResponse({ body: hazardsCollection([hazardsFeature({ label: "Hazardous Heat", startDate: start, endDate: end })]), etag: "merge-precedence-heat-wpc-v1" })
          : undefined;
        installHttp(helper, [
          [HEATRISK_URL, heatRoute],
          ...hazardsRoutes(layer4 ? { 4: layer4 } : {})
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        assertHeatRiskBlockIntact(out);
        return out;
      };

      try {
        const out = await runWithFeature(true);

        // Precondition guard: both competing entries actually reached day 3.
        const heat = out.days["3"].hazards.find((h) => h.source === "heatrisk");
        const wpc = out.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Hazardous Heat");
        if (!heat || !wpc) {
          throw new Error(`precondition failed: expected both heatrisk and wpc-hazards entries on day 3, got ${JSON.stringify(out.days["3"].hazards)}`);
        }

        if (heat.suppressedBy !== null) {
          throw new Error(`MERGE-03: expected heatrisk entry suppressedBy null, got ${JSON.stringify(heat.suppressedBy)}`);
        }
        if (wpc.suppressedBy !== "heatrisk") {
          throw new Error(`MERGE-03: expected wpc-hazards Hazardous Heat suppressedBy "heatrisk", got ${JSON.stringify(wpc.suppressedBy)}`);
        }

        // Control: the same fixture with the WPC feature removed still yields
        // suppressedBy null on the HeatRisk entry.
        const controlOut = await runWithFeature(false);
        const controlHeat = controlOut.days["3"].hazards.find((h) => h.source === "heatrisk");
        if (!controlHeat || controlHeat.suppressedBy !== null) {
          throw new Error(`control: expected heatrisk suppressedBy null with no competitor, got ${JSON.stringify(controlHeat)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-03/D-13: HeatRisk category 0 (a real, explicit no-risk reading) fails the
    // floor and must not suppress WPC's Hazardous Heat -- kept SEPARATE from the null
    // scenario below, since D-13 makes them behave identically and a single scenario
    // covering both could pass while one of the two paths is broken.
    // Mutation to prove RED: change NO_RISK_FLOOR.heatrisk to `category !== null`.
    name: "merge-precedence-heatrisk-zero-does-not-suppress-wpc-heat",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showHeatRisk: true, showHazardsOutlook: true };
        helper._products = toggles;
        const { start, end } = mergeGridWindow(3);
        const items = [heatRiskCatalogItem({ name: "HeatRisk_3_Mercator", validtime: MERGE_NOMINAL_MS + 2 * 86400000, filedate: MERGE_NOW_MS - 30 * 60 * 1000 })];
        installHttp(helper, [
          [HEATRISK_URL, () => httpResponse({ body: heatRiskIdentifyResponse({ items, values: ["0"] }), etag: "merge-precedence-heat-zero-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({ body: hazardsCollection([hazardsFeature({ label: "Hazardous Heat", startDate: start, endDate: end })]), etag: "merge-precedence-heat-zero-wpc-v1" }) })
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        assertHeatRiskBlockIntact(out);

        // Precondition guard: the legacy block expressed the raw category 0, not null --
        // 17 D-02 preserved this distinction precisely so this case is representable.
        if (out.heatRisk.day3.category !== 0) {
          throw new Error(`precondition failed: heatRisk.day3.category is ${JSON.stringify(out.heatRisk.day3.category)}, expected 0`);
        }

        const heat = out.days["3"].hazards.find((h) => h.source === "heatrisk");
        if (heat) {
          throw new Error(`D-13: expected NO heatrisk entry on day 3 (category 0 is below floor), got ${JSON.stringify(heat)}`);
        }
        const wpc = out.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Hazardous Heat");
        if (!wpc || wpc.suppressedBy !== null) {
          throw new Error(`D-13: expected wpc-hazards Hazardous Heat to survive with suppressedBy null, got ${JSON.stringify(wpc)}`);
        }

        // Control: the same fixture with the category raised to 1 suppresses -- proving
        // the gate fires at the documented floor and is not simply never firing.
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._nowMs = () => MERGE_NOW_MS;
        helper._products = toggles;
        installHttp(helper, [
          [HEATRISK_URL, () => httpResponse({ body: heatRiskIdentifyResponse({ items, values: ["1"] }), etag: "merge-precedence-heat-one-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({ body: hazardsCollection([hazardsFeature({ label: "Hazardous Heat", startDate: start, endDate: end })]), etag: "merge-precedence-heat-one-wpc-v1" }) })
        ]);
        const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(controlOut);
        const controlWpc = controlOut.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Hazardous Heat");
        if (!controlWpc || controlWpc.suppressedBy !== "heatrisk") {
          throw new Error(`control: expected wpc-hazards Hazardous Heat suppressedBy "heatrisk" once category is 1, got ${JSON.stringify(controlWpc)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-03/D-13: HeatRisk category null (no reading) fails the floor exactly like
    // category 0, kept SEPARATE from the zero scenario above.
    // Mutation to prove RED: change NO_RISK_FLOOR.heatrisk to `category !== undefined`.
    name: "merge-precedence-heatrisk-null-does-not-suppress-wpc-heat",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showHeatRisk: true, showHazardsOutlook: true };
        helper._products = toggles;
        const { start, end } = mergeGridWindow(3);
        const items = [heatRiskCatalogItem({ name: "HeatRisk_3_Mercator", validtime: MERGE_NOMINAL_MS + 2 * 86400000, filedate: MERGE_NOW_MS - 30 * 60 * 1000 })];
        installHttp(helper, [
          [HEATRISK_URL, () => httpResponse({ body: heatRiskIdentifyResponse({ items, values: ["9"] }), etag: "merge-precedence-heat-null-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({ body: hazardsCollection([hazardsFeature({ label: "Hazardous Heat", startDate: start, endDate: end })]), etag: "merge-precedence-heat-null-wpc-v1" }) })
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);
        assertHeatRiskBlockIntact(out);

        // Precondition guard: the legacy block expressed null, not 0 -- the mirror of
        // the zero scenario's own guard.
        if (out.heatRisk.day3.category !== null) {
          throw new Error(`precondition failed: heatRisk.day3.category is ${JSON.stringify(out.heatRisk.day3.category)}, expected null`);
        }

        const heat = out.days["3"].hazards.find((h) => h.source === "heatrisk");
        if (heat) {
          throw new Error(`D-13: expected NO heatrisk entry on day 3 (category null is below floor), got ${JSON.stringify(heat)}`);
        }
        const wpc = out.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Hazardous Heat");
        if (!wpc || wpc.suppressedBy !== null) {
          throw new Error(`D-13: expected wpc-hazards Hazardous Heat to survive with suppressedBy null, got ${JSON.stringify(wpc)}`);
        }

        // Control: the category-1 case suppresses, proving the null path is a real
        // below-floor branch and not the only outcome this fixture can produce.
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._nowMs = () => MERGE_NOW_MS;
        helper._products = toggles;
        installHttp(helper, [
          [HEATRISK_URL, () => httpResponse({ body: heatRiskIdentifyResponse({ items, values: ["1"] }), etag: "merge-precedence-heat-null-control-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({ body: hazardsCollection([hazardsFeature({ label: "Hazardous Heat", startDate: start, endDate: end })]), etag: "merge-precedence-heat-null-control-wpc-v1" }) })
        ]);
        const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(controlOut);
        const controlWpc = controlOut.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Hazardous Heat");
        if (!controlWpc || controlWpc.suppressedBy !== "heatrisk") {
          throw new Error(`control: expected wpc-hazards Hazardous Heat suppressedBy "heatrisk" once category is 1, got ${JSON.stringify(controlWpc)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-04 (over-merge half)/Pitfall 10: flash-flood (ERO) and heavy-precip
    // (wpc-hazards) never cross-suppress, even on the same grid day. The control adds a
    // real convective pair on the SAME day to prove the suppression machinery itself is
    // live in this fixture, not globally inert.
    // Mutation to prove RED (the single highest-value mutation for MERGE-04): map
    // "Heavy Rain" to "flash-flood" in hazardsOutlookDimensionByLabel.
    name: "merge-flash-flood-and-heavy-precip-never-cross-suppress",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showExcessiveRain: true, showHazardsOutlook: true };
        helper._products = toggles;
        const { start, end } = mergeGridWindow(3);
        installHttp(helper, [
          [ERO_URLS[3], () => httpResponse({ body: ERO_SLGT_BODY, etag: "merge-flash-flood-ero-day3-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({
            body: hazardsCollection([hazardsFeature({ label: "Heavy Rain", startDate: start, endDate: end })]),
            etag: "merge-flash-flood-wpc-v1"
          }) })
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);

        const ero = out.days["3"].hazards.find((h) => h.source === "wpc-ero");
        const wpcHeavy = out.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Heavy Rain");
        // Precondition guard: if the taxonomy ever merged these dimensions, this guard
        // fails first and names the merge, rather than the scenario silently proving
        // nothing.
        if (!ero || ero.dimension !== "flash-flood") {
          throw new Error(`precondition failed: expected a wpc-ero entry with dimension flash-flood on day 3, got ${JSON.stringify(ero)}`);
        }
        if (!wpcHeavy || wpcHeavy.dimension !== "heavy-precip") {
          throw new Error(`precondition failed: expected a wpc-hazards Heavy Rain entry with dimension heavy-precip on day 3, got ${JSON.stringify(wpcHeavy)}`);
        }

        if (ero.suppressedBy !== null) {
          throw new Error(`MERGE-04: expected wpc-ero (flash-flood) suppressedBy null, got ${JSON.stringify(ero.suppressedBy)}`);
        }
        if (wpcHeavy.suppressedBy !== null) {
          throw new Error(`MERGE-04: expected wpc-hazards Heavy Rain (heavy-precip) suppressedBy null, got ${JSON.stringify(wpcHeavy.suppressedBy)}`);
        }

        // Control: the SAME day also carries an above-floor SPC convective tier and a
        // Severe Weather WPC feature -- proving the suppression machinery is live in
        // this fixture and that flash-flood/heavy-precip survival is a real dimension
        // separation, not suppression being globally inert.
        resetHelper(helper);
        resetLogs();
        turfStub.pointInPolygon = () => true;
        helper._nowMs = () => MERGE_NOW_MS;
        helper._products = toggles;
        installHttp(helper, [
          [ERO_URLS[3], () => httpResponse({ body: ERO_SLGT_BODY, etag: "merge-flash-flood-ero-day3-v2" })],
          ["day3otlk_cat.lyr.geojson", () => httpResponse({ body: SPC_SLGT_BODY, etag: "merge-flash-flood-spc-day3-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({
            body: hazardsCollection([
              hazardsFeature({ label: "Heavy Rain", startDate: start, endDate: end }),
              hazardsFeature({ label: "Severe Weather", startDate: start, endDate: end })
            ]),
            etag: "merge-flash-flood-wpc-control-v1"
          }) })
        ]);
        const controlOut = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(controlOut);
        const controlEro = controlOut.days["3"].hazards.find((h) => h.source === "wpc-ero");
        const controlHeavy = controlOut.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Heavy Rain");
        const controlSevere = controlOut.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "Severe Weather");
        if (!controlEro || controlEro.suppressedBy !== null || !controlHeavy || controlHeavy.suppressedBy !== null) {
          throw new Error(`control: flash-flood/heavy-precip must still survive alongside an active convective pair, got ero=${JSON.stringify(controlEro)} heavy=${JSON.stringify(controlHeavy)}`);
        }
        if (!controlSevere || controlSevere.suppressedBy !== "spc-convective") {
          throw new Error(`control: expected wpc-hazards Severe Weather suppressedBy "spc-convective" on the same day, proving suppression is live, got ${JSON.stringify(controlSevere)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  },
  {
    // MERGE-04 (under-merge half)/D-15: three genuinely distinct hazards on one grid
    // day all survive, and the day's hazards array is ordered by the taxonomy's fixed
    // DIMENSION_ORDER, read from hazardTaxonomy.js itself rather than a hardcoded list.
    // Mutation to prove RED: make _resolveGridDayPrecedence suppress every entry after
    // the first, ignoring dimension.
    name: "merge-distinct-hazards-on-one-day-both-survive",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      const originalPointInPolygon = turfStub.pointInPolygon;
      turfStub.pointInPolygon = () => true;
      try {
        helper._nowMs = () => MERGE_NOW_MS;
        const toggles = { showExcessiveRain: true, showHazardsOutlook: true };
        helper._products = toggles;
        const { start, end } = mergeGridWindow(3);
        installHttp(helper, [
          ["day3otlk_cat.lyr.geojson", () => httpResponse({ body: SPC_SLGT_BODY, etag: "merge-distinct-spc-day3-v1" })],
          [ERO_URLS[3], () => httpResponse({ body: ERO_SLGT_BODY, etag: "merge-distinct-ero-day3-v1" })],
          ...hazardsRoutes({ 4: () => httpResponse({
            body: hazardsCollection([hazardsFeature({ label: "High Winds", startDate: start, endDate: end })]),
            etag: "merge-distinct-wpc-v1"
          }) })
        ]);
        const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false, toggles);
        assertPayloadIntact(out);
        assertHazardsBlockIntact(out);

        const spc = out.days["3"].hazards.find((h) => h.source === "spc-convective");
        const ero = out.days["3"].hazards.find((h) => h.source === "wpc-ero");
        const wpc = out.days["3"].hazards.find((h) => h.source === "wpc-hazards" && h.label === "High Winds");
        if (!spc || !ero || !wpc) {
          throw new Error(`precondition failed: expected all three entries present on day 3, got ${JSON.stringify(out.days["3"].hazards)}`);
        }
        if (spc.suppressedBy !== null || ero.suppressedBy !== null || wpc.suppressedBy !== null) {
          throw new Error(`MERGE-04: expected all three distinct-dimension entries to survive, got ${JSON.stringify(out.days["3"].hazards)}`);
        }
        for (const dim of ["convective", "flash-flood", "wind"]) {
          if (!out.summary.dimensions.includes(dim)) {
            throw new Error(`MERGE-04: expected summary.dimensions to include "${dim}", got ${JSON.stringify(out.summary.dimensions)}`);
          }
        }
        if (!out.summary.activeDays.includes(3)) {
          throw new Error(`MERGE-04: expected summary.activeDays to include day 3, got ${JSON.stringify(out.summary.activeDays)}`);
        }

        // Control: the day's hazards array is ordered by hazardTaxonomy's own
        // DIMENSION_ORDER, never a hardcoded list here.
        const observedDimensions = out.days["3"].hazards.map((h) => h.dimension).filter((d) => d !== null);
        const expectedOrder = DIMENSION_ORDER.filter((d) => observedDimensions.includes(d));
        if (JSON.stringify(observedDimensions) !== JSON.stringify(expectedOrder)) {
          throw new Error(`control: expected day 3's hazards ordered by DIMENSION_ORDER ${JSON.stringify(expectedOrder)}, got ${JSON.stringify(observedDimensions)}`);
        }
      } finally {
        turfStub.pointInPolygon = originalPointInPolygon;
      }
    }
  }
];

// ---------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------

async function main() {
  let passed = 0;
  let failed = 0;
  let skipped = 0;
  assertGoldenPinsSomething("GOLDEN_DAY1", GOLDEN_DAY1);
  assertGoldenPinsSomething("GOLDEN_FIRE_WEATHER", GOLDEN_FIRE_WEATHER);
  const helper = loadNodeHelper();

  for (const scenario of scenarios) {
    // D-10 / T-15-05: a scenario that cannot run is counted as skipped and
    // forces a non-zero exit below, so an environment missing node_modules
    // can never produce a green run that is later cited as proof the phase
    // was verified. A skip is a missing proof, not a pass.
    if (scenario.requires === "kml-deps" && !hasRealKmlDeps) {
      console.log(`SKIP ${scenario.name} (requires real ${missingKmlDeps.join(", ")}; run npm ci)`);
      skipped++;
      continue;
    }
    try {
      await scenario.run(helper);
      console.log(`PASS ${scenario.name}`);
      passed++;
    } catch (err) {
      console.log(`FAIL ${scenario.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`PROBE RESULT: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  if (skipped > 0) {
    console.log(`REMEDIATE: run npm ci to install ${missingKmlDeps.join(", ")} and re-run the suite`);
  }
  process.exit(failed === 0 && skipped === 0 ? 0 : 1);
}

// WR-05: report what actually went wrong. A failure before the scenario loop — most
// importantly loadNodeHelper() throwing because a stub no longer matches a require in
// node_helper.js after a dependency change — is not a scenario result, and printing a
// fabricated per-scenario tally hid the only diagnostic the runner had.
main().catch((err) => {
  console.log(`PROBE ABORTED before scenarios completed: ${err && err.stack ? err.stack : err}`);
  process.exitCode = 1;
});
