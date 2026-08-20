// probe-payload-resilience.js — offline, dependency-free proof that
// getSpcOutlook's payload survives a hostile WPC ERO response.
//
// Run with: node scripts/probe-payload-resilience.js
//
// Each scenario feeds getSpcOutlook a controlled fetchGeoJsonCached
// replacement (never the real network) and assert the D-05 payload
// contract: no `error` key, day1-day8, fireWeather, and a full 20-key
// excessiveRain block, regardless of what the upstream host returns.
// Future product rows add one scenario object here — the loader and
// contract assertion are product-agnostic.

const { PRODUCT_REGISTRY } = require("../productRegistry.js");
const { loadNodeHelper, resetHelper, resetLogs, turfStub } = require("./probe-lib/module-stubs.js");

// ---------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------

// The documented ArcGIS REST failure shape returned inside an HTTP 200 —
// no `features` key at all.
const ARCGIS_ERROR_BODY = {
  error: { code: 400, message: "Unable to complete operation", details: [] }
};

// Structurally a FeatureCollection, but the one feature it carries is
// individually hostile (null properties/geometry).
const MALFORMED_FEATURE_BODY = {
  type: "FeatureCollection",
  features: [{ type: "Feature", properties: null, geometry: null }]
};

const SAMPLE_RING = [
  [-77.1, 38.8],
  [-76.9, 38.8],
  [-76.9, 39.0],
  [-77.1, 39.0],
  [-77.1, 38.8]
];

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

// Fixed for every scenario so getSpcOutlook's location-change cache
// invalidation never fires mid-suite.
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
// Payload contract assertion
// ---------------------------------------------------------------------

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
  const eroKeyCount = Object.keys(out.excessiveRain).length;
  if (eroKeyCount !== 20) {
    throw new Error(`assertPayloadIntact: excessiveRain has ${eroKeyCount} keys, expected 20`);
  }
  for (let d = 1; d <= 5; d++) {
    for (const suffix of ["Risk", "Text", "Color", "ValidTime"]) {
      const key = `day${d}${suffix}`;
      if (!(key in out.excessiveRain)) {
        throw new Error(`assertPayloadIntact: excessiveRain.${key} missing`);
      }
    }
  }
  const validTiers = Object.keys(PRODUCT_REGISTRY.excessiveRain.tierToText);
  for (let d = 1; d <= 5; d++) {
    const riskKey = `day${d}Risk`;
    const val = out.excessiveRain[riskKey];
    if (!validTiers.includes(val)) {
      throw new Error(`assertPayloadIntact: excessiveRain.${riskKey} is not a valid tier (got ${JSON.stringify(val)})`);
    }
  }
}

// ---------------------------------------------------------------------
// Golden snapshot for spc-wellformed-baseline (scenario 6)
//
// Captured from a real run against the unmodified pre-fix node_helper.js
// (see 14-06-SUMMARY.md RED baseline). Any later diff against these two
// constants is a regression in plan 14-07's shared-code changes, not an
// improvement — they pin the exact day1/fireWeather shape produced when
// only the day1 categorical and day1 fire-weather wind/RH layers return a
// well-formed SLGT feature and every other layer hard-fails.
// ---------------------------------------------------------------------

const GOLDEN_DAY1 = '{"risk":"SLGT","text":"Slight","color":"f7f690","probRisk":false,"torRisk":0,"torCig":0,"hailRisk":0,"hailCig":0,"windRisk":0,"windCig":0}';
const GOLDEN_FIRE_WEATHER = '{"day1Risk":0,"day1Text":"None","day2Risk":0,"day2Text":"None","day3Risk":0,"day3Text":"None","day4Risk":0,"day4Text":"None","day5Risk":0,"day5Text":"None","day6Risk":0,"day6Text":"None","day7Risk":0,"day7Text":"None","day8Risk":0,"day8Text":"None"}';

// ---------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------

const scenarios = [
  {
    name: "ero-arcgis-error-body",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, [
        [ERO_URLS[1], freshFetch(ARCGIS_ERROR_BODY)],
        [ERO_URLS[2], freshFetch(ARCGIS_ERROR_BODY)],
        [ERO_URLS[3], freshFetch(ARCGIS_ERROR_BODY)],
        [ERO_URLS[4], freshFetch(ARCGIS_ERROR_BODY)],
        [ERO_URLS[5], freshFetch(ARCGIS_ERROR_BODY)]
      ]);
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
      assertPayloadIntact(out);
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
      const out = await helper.getSpcOutlook(PROBE_LAT, PROBE_LON, false);
      assertPayloadIntact(out);
      if (out.excessiveRain.day1Risk !== "NONE") {
        throw new Error(`day1Risk expected NONE, got ${out.excessiveRain.day1Risk}`);
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
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: true };
      installFetch(helper, []);
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
    name: "spc-wellformed-baseline",
    run: async (helper) => {
      resetHelper(helper);
      resetLogs();
      helper._products = { showExcessiveRain: false };
      installFetch(helper, [
        ["https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson", freshFetch(SPC_SLGT_BODY)],
        ["https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson", freshFetch(SPC_SLGT_BODY)]
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
  }
];

// ---------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------

async function main() {
  let passed = 0;
  let failed = 0;
  const helper = loadNodeHelper();

  for (const scenario of scenarios) {
    try {
      await scenario.run(helper);
      console.log(`PASS ${scenario.name}`);
      passed++;
    } catch (err) {
      console.log(`FAIL ${scenario.name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`PROBE RESULT: ${passed} passed, ${failed} failed`);
  process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
  console.log(`PROBE RESULT: 0 passed, ${scenarios.length} failed`);
  process.exitCode = 1;
});
