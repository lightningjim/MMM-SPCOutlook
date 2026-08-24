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

const { PRODUCT_REGISTRY } = require("../productRegistry.js");
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
  if (typeof out.excessiveRain !== "object" || out.excessiveRain === null) {
    throw new Error("assertPayloadIntact: excessiveRain missing or not an object");
  }
  // WR-10: node_helper derives every ERO day count from PRODUCT_REGISTRY.excessiveRain.days
  // so that "no literal day count survives outside the registry", but this assertion
  // hardcoded 5 days and 20 keys — so changing the single declared knob from 5 to 7 failed
  // the probe with "excessiveRain has 28 keys, expected 20", a message that points at the
  // payload rather than at the probe. The day count now comes from the registry; the
  // SUFFIX list stays literal on purpose, because it is the independent oracle and must
  // not come from the same source as the thing under test.
  const eroDays = PRODUCT_REGISTRY.excessiveRain.days;
  const eroKeyCount = Object.keys(out.excessiveRain).length;
  const expectedKeys = eroDays * ERO_SUFFIXES.length;
  if (eroKeyCount !== expectedKeys) {
    throw new Error(
      `assertPayloadIntact: excessiveRain has ${eroKeyCount} keys, expected ${expectedKeys} ` +
      `(${eroDays} days x ${ERO_SUFFIXES.length} fields)`
    );
  }
  for (let d = 1; d <= eroDays; d++) {
    for (const suffix of ERO_SUFFIXES) {
      const key = `day${d}${suffix}`;
      if (!(key in out.excessiveRain)) {
        throw new Error(`assertPayloadIntact: excessiveRain.${key} missing`);
      }
    }
  }
  const validTiers = Object.keys(PRODUCT_REGISTRY.excessiveRain.tierToText);
  for (let d = 1; d <= eroDays; d++) {
    const riskKey = `day${d}Risk`;
    const val = out.excessiveRain[riskKey];
    if (!validTiers.includes(val)) {
      throw new Error(`assertPayloadIntact: excessiveRain.${riskKey} is not a valid tier (got ${JSON.stringify(val)})`);
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
      installFetch(helper, [
        [ERO_URLS[1], throwingFetch()],
        [ERO_URLS[2], throwingFetch()],
        [ERO_URLS[3], throwingFetch()],
        [ERO_URLS[4], throwingFetch()],
        [ERO_URLS[5], throwingFetch()]
      ]);
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
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
