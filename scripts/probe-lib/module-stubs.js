// module-stubs.js — loader for node_helper.js that prefers the real ZIP/KML
// libraries and falls back to in-memory stubs.
//
// Payload-integrity probes need to require node_helper.js and exercise its
// getSpcOutlook path without a network call. `node_helper`, `logger` and
// `@turf/turf` stay mapped to hand-written stubs unconditionally — the turf
// stub's `pointInPolygon` delegation and its ring-validation throws are
// load-bearing scenario controls, not a placeholder for the real library.
//
// `adm-zip`, `@xmldom/xmldom`, `@tmcw/togeojson` and `xpath` are different:
// stubbing them unconditionally made every KMZ-layer defect unreachable by
// any scenario (WR-09's "do not stub too high a layer") — three confirmed
// silent-miss defects live inside those libraries' output shape:
// `extractSoleKmlEntry`'s entry selection (MPD's KMZ member is a fixed
// `doc.kml`, not the URL-derived filename), `@tmcw/togeojson` wrapping
// `description` as `{ "@type": "html", value }` rather than a plain string,
// and `fetchBinBuffer`'s real `arrayBuffer() -> Buffer` path. So this loader
// resolves those four specifiers from the repo root at install time: when
// resolution succeeds the real module is registered and the KMZ chain
// executes for real; when it fails, today's throwing stub is registered and
// the shipped scenarios run exactly as before. A scenario that needs the
// real chain declares `requires: "kml-deps"` and the runner turns a missing
// dependency into a loud SKIP rather than a silent pass — see
// probe-payload-resilience.js.

const Module = require("module");
const path = require("path");
const fs = require("fs");
const vm = require("vm");

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
  pointToLineDistance: (_pt, _line, _opts) => 999,
  // HEAT-03: the real spherical Web Mercator (EPSG:3857) formula, not a placeholder —
  // needed so a HeatRisk scenario can assert on Mercator-MAGNITUDE x/y (the load-bearing
  // proof that a degree-scale coordinate never reaches the URL under a Mercator
  // spatialReference declaration) rather than on an arbitrary stub value. Accepts either
  // this stub's own bare `{ type: "Point", coordinates }` (turfStub.point's own shape) or
  // a proper Point Feature, and always returns a Feature with `.geometry.coordinates` —
  // the shape `_runHeatRiskProduct` reads off the real `turf.toMercator`'s return value.
  toMercator: (point) => {
    const coords = (point && point.geometry && point.geometry.coordinates) ||
                   (point && point.coordinates);
    if (!Array.isArray(coords) || coords.length < 2) {
      throw new Error("toMercator stub: expected a Point or Point Feature with coordinates");
    }
    const [lon, lat] = coords;
    const EARTH_RADIUS_M = 6378137;
    const x = ((lon * Math.PI) / 180) * EARTH_RADIUS_M;
    const y = Math.log(Math.tan(Math.PI / 4 + (lat * Math.PI) / 360)) * EARTH_RADIUS_M;
    return { type: "Feature", properties: {}, geometry: { type: "Point", coordinates: [x, y] } };
  }
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
// This exact fallback shape (a working useNamespaces whose returned
// selector throws) is preserved when the real xpath package is unavailable,
// so node_helper.js still loads.
const xpathStub = { useNamespaces: (_ns) => inertThrow("xpath") };

const THROWING_FALLBACKS = {
  "adm-zip": AdmZipStub,
  "@xmldom/xmldom": xmldomStub,
  "@tmcw/togeojson": togeojsonStub,
  xpath: xpathStub
};

// T-15-06: resolution is pinned to the repository root rather than the
// ambient NODE_PATH/cwd, so the harness cannot be steered to a package
// outside the project tree. Only these four fixed, hardcoded specifiers are
// resolved; the list is not data-driven.
const REPO_ROOT = path.join(__dirname, "..", "..");
const missingKmlDeps = [];
const REAL_KML_DEPS = {};

for (const specifier of Object.keys(THROWING_FALLBACKS)) {
  try {
    const resolved = require.resolve(specifier, { paths: [REPO_ROOT] });
    REAL_KML_DEPS[specifier] = require(resolved);
  } catch (_err) {
    missingKmlDeps.push(specifier);
  }
}

const hasRealKmlDeps = missingKmlDeps.length === 0;

const STUBS = {
  node_helper: nodeHelperStub,
  logger: loggerStub,
  "@turf/turf": turfStub,
  "adm-zip": REAL_KML_DEPS["adm-zip"] || THROWING_FALLBACKS["adm-zip"],
  "@xmldom/xmldom": REAL_KML_DEPS["@xmldom/xmldom"] || THROWING_FALLBACKS["@xmldom/xmldom"],
  "@tmcw/togeojson": REAL_KML_DEPS["@tmcw/togeojson"] || THROWING_FALLBACKS["@tmcw/togeojson"],
  xpath: REAL_KML_DEPS.xpath || THROWING_FALLBACKS.xpath
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

// WR-09: the real implementations of the members scenarios stub, captured before any
// scenario can replace them. helper.start() resets helper-global *state*, but a stub
// written onto the helper object is not state — it survived every later resetHelper, so a
// scenario that stubbed the HTTP seam still ran against the previous scenario's
// fetchGeoJsonCached stub and never reached the code it meant to test.
//
// WR-10: this used to capture a curated two-entry list — `fetchGeoJsonCached` and `_fetch`
// — which is exactly the hand-maintained copy resetHelper's own comment below argues
// against, applied to the seams instead of to the state. Every member of the helper is a
// stubbable seam (`fetchBinBuffer`, `checkInPolygon`, `extractSoleKmlEntry`,
// `_advisoryDiscovery`, `_prepareMpdEntry`, ...), and a scenario stubbing any of them bled
// into every later scenario exactly as that comment describes, surfacing as an unrelated
// flaky assertion somewhere further down the file. A shallow copy of the whole surface
// needs no maintenance and cannot drift. Own enumerable properties only, which is what a
// stub assignment creates — the prototype chain is untouched either way.
const ORIGINAL_SEAMS = new WeakMap();

function loadNodeHelper() {
  installStubs();
  const nodeHelperPath = path.join(__dirname, "..", "..", "node_helper.js");
  const helper = require(nodeHelperPath);
  ORIGINAL_SEAMS.set(helper, { ...helper });
  helper.start();
  return helper;
}

// WR-10: the turf stub's `pointInPolygon` is module-global mutable state that scenarios
// flip to simulate the user standing inside a polygon. Twenty scenarios save and restore it
// by hand in a `finally`; one omission bleeds `() => true` into every later scenario and
// silently makes every polygon contain the user — a whole-suite false positive that no
// assertion would name. resetHelper owning the reset makes the leak unreachable regardless
// of what any individual scenario forgets. The hand-rolled pairs are left in place as
// belt-and-braces: they now restore to the same default this does.
const TURF_DEFAULTS = { pointInPolygon: () => false };

// WR-09: delegate rather than duplicate. A hand-maintained copy of start()'s field
// list drifts the moment a phase adds helper-global state (an in-flight guard, a
// per-product cache, a rate-limit token): the new field is never reset, scenario N's
// state bleeds into scenario N+1, and the failure surfaces as an unrelated flaky
// assertion. start() is the single source of truth for helper-global initialisation.
// Note this emits start()'s own log line. 19-REVIEW WR-06(a): the RUNNER clears it, calling
// resetLogs() immediately after resetHelper() in probe-payload-resilience.js's scenario loop.
// This comment used to say "every scenario calls resetLogs() after resetHelper()" — a contract
// the WR-07(b) runner change had already made false, and one that left log isolation depending
// on each scenario remembering (173 calls across 189 entries). The surviving per-scenario calls
// are redundant at the top of a scenario but stay load-bearing MID-scenario, where a control
// needs a clean log slate.
function resetHelper(helper) {
  const originals = ORIGINAL_SEAMS.get(helper);
  if (originals) Object.assign(helper, originals);
  Object.assign(turfStub, TURF_DEFAULTS);
  helper.start();
}

// CR-01: the suite asserted on the payload and stopped there, which is exactly how a
// total outage came to render as a confident "No Hazards Forecast" while
// ero-hard-fail-is-flagged reported the guarantee as met — `_stale: true` was in the
// payload and the branch that renders it was unreachable. MMM-SPCOutlook.js is a browser
// module: it calls Module.register at top level and reads Log, moment and document off
// the global scope, so it is loaded into a vm context with those four supplied rather
// than required. Still dependency-free: vm and fs are core.
function loadFrontendModule() {
  const source = fs.readFileSync(path.join(__dirname, "..", "..", "MMM-SPCOutlook.js"), "utf-8");
  let captured = null;
  const sandbox = {
    Module: { register: (_name, definition) => { captured = definition; } },
    Log: loggerStub,
    // Deterministic: the badge's exact wording is MagicMirror's business, its presence
    // is the probe's.
    moment: (_ts) => ({ fromNow: () => "PROBE_AGE" }),
    // A plain object, not a DOM node: nothing here parses what is assigned to `innerHTML`.
    // 19-REVIEW WR-07(a): that used to mean every "escapes hostile text" scenario was a bare
    // `String.includes("<img")` assertion, and CR-01 is the concrete consequence — an
    // unescaped remote-controlled tier token reached innerHTML at one of four call sites and
    // survived 157 green scenarios, because inertness was only ever checked where a scenario
    // happened to look. `renderDom` below now runs EVERY render through `assertInertMarkup`,
    // a tag-level allowlist over the whole output, so a hostile fragment reaching innerHTML
    // anywhere fails the scenario that produced it whether or not that scenario was looking
    // for one. It is a lexical check rather than a parsed tree (no jsdom/linkedom dependency
    // — this harness stays on core `vm`/`fs`), which is strictly weaker than parsing but
    // strictly stronger than the per-scenario substring checks it backstops.
    // `style` is a bare property bag, present so assignments like `wrapper.style.textAlign`
    // do not throw. It is NOT evidence of anything visual: nothing here lays out, measures or
    // renders, so a scenario can assert only that a property was assigned, never that the
    // resulting screen is aligned. Alignment, whitespace collapsing and column layout remain
    // MANUAL ONLY rows in 19-PARITY-CHECKLIST.md's Probe Coverage.
    document: { createElement: () => ({ innerHTML: "", textContent: "", style: {} }) },
    setInterval: () => 0,
    console
  };
  vm.createContext(sandbox);
  vm.runInContext(source, sandbox, { filename: "MMM-SPCOutlook.js" });
  if (!captured) {
    throw new Error("MMM-SPCOutlook.js did not call Module.register — the frontend probe cannot run");
  }
  return captured;
}

// 19-REVIEW WR-07(a): the complete set of tags MMM-SPCOutlook.js's getDom() is allowed to
// emit into innerHTML, as literal shapes rather than a general HTML grammar. Every one is
// module-authored; nothing payload-derived may ever become a tag, because every payload
// string reaching innerHTML goes through the module's own escapeHtml first (its WR-12 rule).
// So an allowlist violation IS an escaping defect, with no judgement call in between.
//
// Attribute values are bounded by `[^"<>]*` deliberately: an injected `"` (the attribute-
// escape vector T-16-19's validHazardColor exists to stop) breaks the match rather than
// sliding past it, and an injected `<`/`>` cannot hide inside a value either.
const INERT_MARKUP_ALLOWLIST = [
  /^<br\/>$/,
  /^<\/(?:span|i)>$/,
  /^<span style="[^"<>]*">$/,
  /^<i class="[^"<>]*">$/
];

// Throws unless every `<...>` in `html` is one of the module's own tags. Called on every
// render (see renderDom) so no scenario has to remember to ask.
function assertInertMarkup(html, label) {
  const tags = String(html).match(/<[^<>]*>?/g) || [];
  for (const tag of tags) {
    if (INERT_MARKUP_ALLOWLIST.some((allowed) => allowed.test(tag))) continue;
    throw new Error(
      `assertInertMarkup${label ? ` (${label})` : ""}: ${JSON.stringify(tag)} is not a tag ` +
      "MMM-SPCOutlook.js emits. Every payload-derived string reaching innerHTML must pass " +
      `through escapeHtml first, so this is an escaping defect. Full markup: ${html}`
    );
  }
}

// Render a payload through the real getDom and return the resulting markup/text.
function renderDom(frontend, { config, spcrisk }) {
  const ctx = Object.create(frontend);
  ctx.config = config;
  ctx.spcrisk = spcrisk;
  ctx.updateDom = () => {};
  const wrapper = frontend.getDom.call(ctx);
  // Only `innerHTML` is checked. The error branch writes `textContent`, which is inert by
  // construction — asserting an allowlist against it would reject the very thing that makes
  // it safe (a verbatim, unescaped remote error string that never becomes markup).
  if (wrapper.innerHTML) assertInertMarkup(wrapper.innerHTML, "getDom innerHTML");
  return wrapper.innerHTML || wrapper.textContent || "";
}

// Builds a real KMZ archive in memory from `entries` (entry name -> file
// contents) using the resolved real `adm-zip`, and returns the resulting
// Buffer. Entry insertion order is preserved as given — a fixture can place
// a non-.kml entry first to prove extractSoleKmlEntry scans the archive
// rather than taking the first entry. Throws a clear error naming
// hasRealKmlDeps when called while the real adm-zip is unavailable, so a
// misuse is a loud failure rather than a confusing stub throw.
function makeKmzBuffer(entries) {
  if (!hasRealKmlDeps) {
    throw new Error(
      "makeKmzBuffer requires the real adm-zip package; hasRealKmlDeps is false " +
      `(missing: ${missingKmlDeps.join(", ")}). Run npm ci.`
    );
  }
  // adm-zip sorts entries alphabetically by entryName unless noSort is set; without it
  // the write/read round trip silently reorders entries and a fixture cannot prove
  // entry-scan behaviour at all.
  const RealZip = REAL_KML_DEPS["adm-zip"];
  const zip = new RealZip(undefined, { noSort: true });
  for (const [entryName, contents] of Object.entries(entries)) {
    zip.addFile(entryName, Buffer.from(contents));
  }
  return zip.toBuffer();
}

module.exports = {
  installStubs,
  loadNodeHelper,
  loadFrontendModule,
  renderDom,
  assertInertMarkup,
  resetHelper,
  resetLogs,
  turfStub,
  hasRealKmlDeps,
  missingKmlDeps,
  makeKmzBuffer,
  logCalls
};
