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

const { PRODUCT_REGISTRY, daySpanOf } = require("../productRegistry.js");
const {
  loadNodeHelper, loadFrontendModule, renderDom, resetHelper, resetLogs, turfStub, logCalls,
  hasRealKmlDeps, missingKmlDeps, makeKmzBuffer
} = require("./probe-lib/module-stubs.js");

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
    [".lyr.geojson", okEmpty]
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
    [".lyr.geojson", okEmpty]
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
    [".lyr.geojson", okEmpty]
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
  // The loop below is registry-driven for the same reason node_helper's is: a Phase 16/17
  // row is covered the moment it is declared, with no edit here. The registry uses
  // `id: "excessiveRain"` / `"winterImpact"` and the payload uses those same key names, so
  // `out[row.id]` is already the correct lookup.
  for (const row of Object.values(PRODUCT_REGISTRY)) {
    if (row.kind !== "arcgis-day-layers") continue;
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
  // D-05 again, for the advisory half: `advisories` and one array per kml-advisory row are
  // present whether or not the product is toggled on. This is what the frontend's
  // `[...advisories.spcMD, ...advisories.mpd]` spread relies on (WR-07), and it was
  // asserted nowhere in the suite.
  if (typeof out.advisories !== "object" || out.advisories === null) {
    throw new Error("assertPayloadIntact: advisories missing or not an object");
  }
  for (const row of Object.values(PRODUCT_REGISTRY)) {
    if (row.kind !== "kml-advisory") continue;
    if (!Array.isArray(out.advisories[row.id])) {
      throw new Error(
        `assertPayloadIntact: advisories.${row.id} is not an array ` +
        `(got ${JSON.stringify(out.advisories[row.id])})`
      );
    }
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
          ["rejected an unusable response body for", ERO_URLS[d], "not a usable FeatureCollection"],
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
          ["rejected an unusable response body for", ERO_URLS[1], "not a usable FeatureCollection"],
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
