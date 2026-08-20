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

const turfStub = {
  point: (coords) => ({ type: "Point", coordinates: coords }),
  polygon: (coords) => ({ __stubPoly: coords }),
  multiPolygon: (coords) => ({ __stubPoly: coords }),
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

function loadNodeHelper() {
  installStubs();
  const nodeHelperPath = path.join(__dirname, "..", "..", "node_helper.js");
  const helper = require(nodeHelperPath);
  helper.start();
  return helper;
}

function resetHelper(helper) {
  helper._geoJsonCache = new Map();
  helper._cachedLat = null;
  helper._cachedLon = null;
  helper._updateInterval = 60;
  helper._proximityWeighting = false;
  helper._products = { showExcessiveRain: false };
}

module.exports = {
  installStubs,
  loadNodeHelper,
  resetHelper,
  resetLogs,
  turfStub,
  logCalls
};
