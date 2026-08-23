// module-stubs.js — dependency-free loader for node_helper.js.
//
// Payload-integrity probes need to require node_helper.js and exercise its
// getSpcOutlook path with zero third-party packages installed, because
// executor git worktrees never carry an untracked node_modules directory.
// This file patches Node's module resolver so every third-party require in
// node_helper.js resolves to a minimal in-memory stub instead of touching
// disk or the network — it never edits node_helper.js itself. Future
// product rows (WSSI, MPD, Hazards Outlook, HeatRisk) reuse this same
// loader for their own scenario probes.

const Module = require("module");
const path = require("path");

const logCalls = [];

function resetLogs() {
  logCalls.length = 0;
}

const loggerStub = {
  info: (...args) => { logCalls.push(args.join(" ")); },
  error: (...args) => { logCalls.push(args.join(" ")); },
  warn: (...args) => { logCalls.push(args.join(" ")); },
  log: (...args) => { logCalls.push(args.join(" ")); }
};

const nodeHelperStub = {
  create: (obj) => obj
};

// WR-08: real turf.polygon/multiPolygon throw on a ring with fewer than four positions,
// on a ring whose first and last positions differ, and on non-array coordinates — with
// these exact messages (verified against @turf/turf directly). A stub that accepts any
// coordinates at all cannot exercise the containment those throws demand, so it silently
// certified a code path that collapses the whole payload in production.
function assertRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) {
    throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
  }
  const first = ring[0];
  const last = ring[ring.length - 1];
  if (!Array.isArray(first) || !Array.isArray(last) ||
      first[0] !== last[0] || first[1] !== last[1]) {
    throw new Error("First and last Position are not equivalent.");
  }
}

const turfStub = {
  point: (coords) => ({ type: "Point", coordinates: coords }),
  polygon: (coords) => {
    if (!Array.isArray(coords)) throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
    coords.forEach(assertRing);
    return { __stubPoly: coords };
  },
  multiPolygon: (coords) => {
    if (!Array.isArray(coords)) throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
    coords.forEach((poly) => {
      if (!Array.isArray(poly)) throw new Error("Each LinearRing of a Polygon must have 4 or more Positions.");
      poly.forEach(assertRing);
    });
    return { __stubPoly: coords };
  },
  // Delegates rather than hardcoding a result — scenarios flip
  // turfStub.pointInPolygon to simulate the user standing inside a polygon.
  pointInPolygon: () => false,
  booleanPointInPolygon: (pt, poly) => turfStub.pointInPolygon(pt, poly),
  flatten: (feature) => ({ features: [feature] }),
  polygonToLine: (_poly) => ({ type: "Feature", __stubLine: true }),
  // 999 km is far outside the 40 km proximity cutoff, so proximity math
  // never perturbs a scenario's expected values.
  pointToLineDistance: (_pt, _line, _opts) => 999
};

function inertThrow(specifier) {
  return (..._args) => {
    throw new Error(`probe stub called: ${specifier}`);
  };
}

class AdmZipStub {
  constructor(..._args) {
    throw new Error("probe stub called: adm-zip");
  }
}

class DOMParserStub {
  constructor(..._args) {
    throw new Error("probe stub called: @xmldom/xmldom");
  }
}

const xmldomStub = { DOMParser: DOMParserStub };

const togeojsonStub = { kml: inertThrow("@tmcw/togeojson") };

// node_helper.js calls xpath.useNamespaces({...}) at module scope, so this
// must succeed and return a function; only the returned selector throws.
const xpathStub = { useNamespaces: (_ns) => inertThrow("xpath") };

const STUBS = {
  node_helper: nodeHelperStub,
  logger: loggerStub,
  "@turf/turf": turfStub,
  "adm-zip": AdmZipStub,
  "@xmldom/xmldom": xmldomStub,
  "@tmcw/togeojson": togeojsonStub,
  xpath: xpathStub
};

const syntheticPaths = {};
let installed = false;

function installStubs() {
  if (installed) return;
  installed = true;

  const originalResolveFilename = Module._resolveFilename;

  for (const specifier of Object.keys(STUBS)) {
    const syntheticPath = path.join(__dirname, "__stub__", specifier.replace(/[@/]/g, "_") + ".js");
    syntheticPaths[specifier] = syntheticPath;
    require.cache[syntheticPath] = {
      id: syntheticPath,
      filename: syntheticPath,
      loaded: true,
      exports: STUBS[specifier],
      children: [],
      paths: []
    };
  }

  // Node's argument count for _resolveFilename has varied across versions,
  // so forward via `arguments` rather than a fixed-arity wrapper.
  Module._resolveFilename = function (request) {
    if (Object.prototype.hasOwnProperty.call(syntheticPaths, request)) {
      return syntheticPaths[request];
    }
    return originalResolveFilename.apply(this, arguments);
  };
}

// WR-09: the real implementations of the two members scenarios stub, captured before any
// scenario can replace them. helper.start() resets helper-global *state*, but a stub
// written onto the helper object is not state — it survived every later resetHelper, so a
// scenario that stubbed the HTTP seam still ran against the previous scenario's
// fetchGeoJsonCached stub and never reached the code it meant to test.
const ORIGINAL_SEAMS = new WeakMap();

function loadNodeHelper() {
  installStubs();
  const nodeHelperPath = path.join(__dirname, "..", "..", "node_helper.js");
  const helper = require(nodeHelperPath);
  ORIGINAL_SEAMS.set(helper, {
    fetchGeoJsonCached: helper.fetchGeoJsonCached,
    _fetch: helper._fetch
  });
  helper.start();
  return helper;
}

// WR-09: delegate rather than duplicate. A hand-maintained copy of start()'s field
// list drifts the moment a phase adds helper-global state (an in-flight guard, a
// per-product cache, a rate-limit token): the new field is never reset, scenario N's
// state bleeds into scenario N+1, and the failure surfaces as an unrelated flaky
// assertion. start() is the single source of truth for helper-global initialisation.
// Note this emits start()'s own log line — every scenario calls resetLogs() after
// resetHelper(), so log assertions still see only their own scenario's output.
function resetHelper(helper) {
  const originals = ORIGINAL_SEAMS.get(helper);
  if (originals) {
    helper.fetchGeoJsonCached = originals.fetchGeoJsonCached;
    helper._fetch = originals._fetch;
  }
  helper.start();
}

module.exports = {
  installStubs,
  loadNodeHelper,
  resetHelper,
  resetLogs,
  turfStub,
  logCalls
};
