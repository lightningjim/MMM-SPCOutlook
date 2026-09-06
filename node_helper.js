const NodeHelper = require("node_helper");
const fetch = (...args) => import('node-fetch').then(({ default: f }) => f(...args));
// WR-11: node-fetch has no default timeout and getSpcOutlook is a fully serial ~25-hop
// await chain that socketNotificationReceived awaits before emitting anything, so a single
// hung socket would block the entire payload indefinitely — and with no in-flight guard the
// next interval tick stacks another chain behind it. Every fetch in this file therefore
// carries an abort signal. The AbortError lands in each call site's existing catch, which
// already routes it to the stale-fallback / hard-failure path.
const FETCH_TIMEOUT_MS = 15000;
const withTimeout = (options = {}) => {
  if (typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function") {
    return { ...options, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) };
  }
  return options;   // Node < 17.3 — no core AbortSignal.timeout; behaviour is unchanged
};
const turf = require("@turf/turf"); // or another geometry librarykmz-
const Log = require("logger");
const crypto = require("crypto");
const ZIP = require("adm-zip");
const { DOMParser } = require("@xmldom/xmldom");
const KMLtoGJ = require("@tmcw/togeojson");
const xpath    = require("xpath");
const select = xpath.useNamespaces({
  k: "http://www.opengis.net/kml/2.2"
});
const { PRODUCT_REGISTRY, MPD_FILENAME_PATTERN, hazardLabelKey } = require("./productRegistry");
// hazardTaxonomy.js's first and only consumer (D-06). Destructured to only what this file
// actually reads: dimensionOf resolves a (source, label) pair to D-05's dimension roster;
// NO_RISK_FLOOR is read directly by the HeatRisk and registry-day grid-entry builders to
// decide whether a reading is an active claim or a quiet one; FLOOR_PREBAKED is the
// sentinel _addRegistryDayGridEntries checks against rather than hardcoding the comparison.
const {
  dimensionOf, NO_RISK_FLOOR, FLOOR_PREBAKED, PRECEDENCE, DIMENSION_ORDER,
  SOURCE_IDS, ADVISORY_SOURCE_IDS
} = require("./hazardTaxonomy");
// WR-16 / D-10: `showDrought` is NOT a product flag in the `configFlag` sense — it does
// not gate a fetch, it gates which labels within an already-fetched product (Hazards
// Outlook) are displayable — so it cannot be derived from `PRODUCT_REGISTRY` and needs
// this explicit, single-source path. A future sub-toggle appends one string here and
// nothing else.
const SUB_TOGGLES = ["showDrought"];
const valueToFullRisk = {
  NONE: "None", TSTM: "General Thunderstorms", MRGL: "Marginal", SLGT: "Slight", ENH: "Enhanced", MDT: "Moderate", HIGH: "High"
};
const valueToRisk = {
        1: "TSTM", 2: "MRGL", 3: "SLGT", 4: "ENH", 5: "MDT", 6: "HIGH"
      };
// WR-06: the MD/MPD member URLs are not ours — they are hrefs harvested from a KML we
// downloaded, so anyone able to influence that document (an upstream compromise, a
// transparent proxy, a hostile DNS answer, a captive portal) chooses what this host
// fetches next, including RFC1918 addresses, which from a home-network Pi is the
// interesting target. productRegistry.js already refuses any baseUrl that is not
// https://mapservices.weather.noaa.gov/ (buildArcGisQuery); this applies an equivalent
// rule to the KML-advisory path that feeds SPC MD and WPC MPD (D-02).
//
// The former allowlist was a raw `startsWith("https://www.spc.noaa.gov/")` prefix check.
// SPC's own `ActiveMD.kmz` publishes its member hrefs as `http://`, not `https://`, so
// `"http://…".startsWith("https://…")` was always false and every live href was refused —
// a live, currently-shipping availability defect (RESEARCH.md Pitfall 1), not merely a
// bug in theory. Prefix matching on the raw string is also the wrong tool for the SSRF
// control it exists to be: a lookalike host (`www.spc.noaa.gov.evil.test`) or a userinfo
// trick (`https://www.spc.noaa.gov@evil.test/`) both satisfy a naive prefix test.
//
// `normalizeAdvisoryUrl` replaces it: parse with `new URL`, match the hostname exactly
// against the row's `allowedHost`, and normalize the scheme to `https:` before ever
// fetching — `fetchBinBuffer` sends `redirect: "error"`, so fetching the `http://` URL
// SPC actually serves would throw on SPC's own 301 rather than follow it. Scheme is
// normalized; host is matched exactly. One allowlist function now serves every
// `kml-advisory` registry row (D-02), each supplying its own `allowedHost`.
function normalizeAdvisoryUrl(rawHref, allowedHost) {
  if (typeof rawHref !== "string") return null;
  const trimmed = rawHref.trim();
  if (trimmed === "") return null;

  let url;
  try {
    url = new URL(trimmed);
  } catch (_err) {
    return null;
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (typeof allowedHost !== "string" || url.hostname.toLowerCase() !== allowedHost.toLowerCase()) return null;
  if (url.username !== "" || url.password !== "") return null;
  if (url.port !== "") return null;

  url.protocol = "https:";
  return url.toString();
}

// T-15-17: bounds how many member KMZs one `kml-advisory` row fetches per poll. A
// hostile or malfunctioning index could otherwise turn one poll into an unbounded
// fetch burst; 60 is comfortably above any observed SPC MD / WPC MPD candidate count.
const ADVISORY_MAX_CANDIDATES = 60;

// WR-02: byte bounds on the two remote bodies the kml-advisory path pulls. Both are
// security controls, not tidiness — the listing is remote HTML parsed for outbound fetch
// targets, and the member bodies are fetched up to ADVISORY_MAX_CANDIDATES times per poll
// from URLs whose paths a remote document chose. Live sizes are ~139 KB (listing) and
// single-digit KB (member), so both carry orders of magnitude of headroom.
const ADVISORY_MAX_BODY_BYTES = 8 * 1024 * 1024;
const ADVISORY_MAX_LISTING_BYTES = 4 * 1024 * 1024;

// Bound on a KMZ's sole .kml member. Live samples are ~3 KB, so this is three orders of
// magnitude of headroom. It is also, with adm-zip, a bound on PEAK memory and not merely
// on what is retained: adm-zip passes the entry's declared uncompressed size to
// zlib.inflateRawSync as `maxOutputLength`, so inflation aborts at the declared size
// rather than running to completion — verified against a forged archive (a 16 MB deflate
// stream declaring 100 bytes throws "Cannot create a Buffer larger than 100 bytes"). See
// extractSoleKmlEntry for the one input that switches that library bound off.
//
// A previous companion constant capped the declared:compressed ratio at 200:1 as "the
// half that actually bounds a decompression bomb". It bounded nothing: both operands are
// central-directory fields the archive's author chooses freely, and an attacker who wants
// a larger inflation simply declares one — at which point the declared-size check below
// refuses it, and if it is small enough to pass, adm-zip has clamped inflation to that
// same small number. What the ratio did add was false-rejection surface against a
// threshold measured on the wrong sample: it cited "live KML compresses at well under
// 20:1", which is true of the ~3 KB member polygons but not of the SPC ActiveMD.kmz INDEX
// this same function parses, whose sole member is a run of near-identical <NetworkLink>
// blocks — measured here with zlib.deflateRaw level 9, 100 links is 20:1, 1000 links is
// 25:1, and the same 1000-link index indented for readability is 66:1. A refusal there
// throws out of the spc-active-index strategy, which returns { urls: [], failed: true } —
// i.e. every active SPC MD disappears for that poll behind a ⚠ badge, a whole-product
// false negative caused by upstream growth or pretty-printing rather than by an attack.
const KMZ_MAX_KML_BYTES = 8 * 1024 * 1024;

// How many poll intervals a cached reading may be old and still be served in place of a
// failed fetch. It must be MORE than one: an entry is written when a poll produces a
// reading, and the next poll reaches that same URL one full interval later (later still —
// getSpcOutlook is a ~30-hop serial chain), so a window of exactly one interval has always
// expired by the only moment it is ever consulted. At the documented 60-minute default that
// made the stale fallback unreachable in production: a single upstream hiccup during an
// active HIGH resolved the day to "NONE" and rendered "No Severe Weather Risk
// (unconfirmed)" for a location that was HIGH minutes earlier — the false negative this
// product exists to prevent, and the exact opposite of the guarantee the fallback was
// written to deliver. Two intervals is the smallest window that survives one missed poll.
// Serving an old reading is safe here precisely because it is never presented as current:
// every path that returns one also sets `stale`, which raises the ⚠ badge and renders the
// reading's real age.
const STALE_WINDOW_INTERVALS = 2;

// The Hazards Outlook's day-bucketing arithmetic (`_hazardDayOffset`) divides an
// epoch-ms span by this to get a day count — no date library is used anywhere in this
// file, so this is the one place that fact is spelled out.
const MS_PER_DAY = 24 * 60 * 60 * 1000;

// D-02: the Phase 18 unified `days` block is fixed at fourteen keys, always — the union
// of the Hazards Outlook's day-14 reach and D-02's fourteen-key shape invariant. This is
// the sole declaration of the number 14 in the merge code (WR-03's `daySpanOf` rule); no
// other constant or loop bound restates it.
const GRID_DAY_COUNT = 14;

// 16-REVIEW WR-06: two remote-controlled COUNTS in the Hazards Outlook path, bounded for
// the same reason ADVISORY_MAX_CANDIDATES is — this runs on a Raspberry Pi and every value
// below originates upstream. T-16-20 bounded label LENGTH at the render boundary; these
// bound how many of them can accumulate.
//
// The unmapped-label ledger (`_loggedUnmappedHazardLabels`) is a process-LIFETIME Set
// keyed by raw upstream label strings: D-11 says an unmapped label renders verbatim and
// logs once per process, so a feed serving many distinct junk labels grew it forever, and
// it stored the label UNTRUNCATED (truncation happens only at the frontend render
// boundary), so a 1 MB hostile label was retained in full, permanently, per distinct
// value. The key is truncated because the ledger's whole job is deduping a LOG LINE, and
// 60 characters is exactly what the frontend will ever display of it.
const HAZARDS_MAX_LOGGED_UNMAPPED_LABELS = 64;
const HAZARDS_LOG_LABEL_MAX_CHARS = 60;

// D-07: the per-source unmapped-label ledger recorded in the Phase 18 payload's
// `sources[id].unmappedLabels[]`. Defined in terms of the existing process-lifetime
// Hazards Outlook ledger cap above rather than as an independent number, since both
// bound the same class of upstream-controlled-count risk (T-18-05). Labels recorded
// here are additionally truncated to HAZARDS_LOG_LABEL_MAX_CHARS.
const UNMAPPED_LABELS_MAX_PER_SOURCE = HAZARDS_MAX_LOGGED_UNMAPPED_LABELS;

// The window band had no entry cap at all: its dedupe key is `label|offsetStart|offsetEnd`,
// which bounds nothing when the labels vary, and every surviving entry becomes a DOM line
// appended with `wrapper.innerHTML +=` — which re-parses the whole subtree on each append.
// 40 is an order of magnitude above the largest live band observed (six layers, ~27
// features each, almost all of them day-grid or duplicate spans). Like the advisory cap,
// exceeding it is LOGGED rather than silently absorbed.
const HAZARDS_MAX_WINDOW_ENTRIES = 40;

// 16-REVIEW WR-07: a byte bound on the GeoJSON transport, the sibling of
// ADVISORY_MAX_BODY_BYTES on the KML transport. `fetchGeoJsonCached` had none: it buffered
// the entire body into a string and then JSON.parse'd it, doubling peak memory, so a
// hostile or corrupted multi-hundred-MB response was an OOM on a Pi rather than a rejected
// body. The deleted `fetchGeoJson`'s tombstone comment in this file names "no body bound"
// as one of the reasons that function was dangerous — this is that same control, applied
// to the path that survived. Inherited rather than introduced by Phase 16, but Phase 16
// added six endpoints to it.
//
// 16 MB, larger than ADVISORY_MAX_BODY_BYTES because this path carries full-layer ArcGIS
// `outFields=*&f=geojson` responses rather than single-digit-KB KMZ members; the largest
// body any shipped row has produced is under 5 MB, so this is comfortable headroom while
// still bounding the failure to something a Pi survives.
const GEOJSON_MAX_BODY_BYTES = 16 * 1024 * 1024;

module.exports = NodeHelper.create({
  // Exposed on the helper object (rather than kept purely module-private) so offline
  // probes can exercise the allowlist directly against the module-scope implementation
  // above; every in-file caller still invokes the bare module-scope function, not
  // `this.normalizeAdvisoryUrl`.
  normalizeAdvisoryUrl,

  start: function() {
    Log.info("Starting node_helper for MMM-SPCOutlook...");
    this._geoJsonCache = new Map();  // keyed by URL string
    this._cachedLat = null;
    this._cachedLon = null;
    this._updateInterval = 60;
    this._proximityWeighting = false;
    this._loggedIntervalFallback = false;
    // D-12: guards the once-per-process log line when the SPC grid anchor falls back to
    // the clock estimate (no usable VALID_ISO/EXPIRE_ISO from the day-1 outlook).
    this._loggedGridAnchorFallback = false;
    // PERF-03/D-18: guards the once-per-process cold-start timing summary, logged right
    // after the first successful SPC_DATA_RESULT is sent. No config flag — D-18 rejected
    // one explicitly as a sixteenth independently-toggleable boolean input.
    this._loggedColdStartTiming = false;
    // PERF-03/D-17: the process-start end of the wall-clock bracket. node_helper.js's only
    // cache is the in-memory `_geoJsonCache` Map above, so a fresh process IS a cold cache
    // and needs no other setup.
    this._processStartMs = this._nowMs();
    // MERGE-01: excessiveRain.day1ValidTime has had no consumer since 14 D-03 and is
    // unexercised end-to-end until this plan first reads it — guards a single logged
    // sample per process so a null/malformed field surfaces now rather than in Phase 19.
    this._loggedEroValidTimeSample = false;
    // CR-03: overlapping polls. socketNotificationReceived is async and MagicMirror does
    // not await it, so nothing stopped a second GET_SPC_DATA from starting while the first
    // ~25-hop serial chain was still running. _inFlight prevents the overlap; _seq stamps
    // every broadcast so the frontend can reject a chain that finishes out of order.
    this._inFlight = false;
    this._seq = 0;
    // The generation this counter belongs to. MagicMirror restarts node_helpers when the
    // server process restarts, but socket.io reconnects the browser WITHOUT reloading the
    // page — the normal behaviour for serveronly/remote-browser deployments and for any
    // pm2/systemd restart. `_seq` then starts over at 0 while the frontend still holds the
    // highest number it saw before the restart, so every payload the new helper sends looks
    // out-of-order and is discarded forever: the display freezes on an arbitrarily old
    // payload, presented as current, with no badge, no error and no self-heal. The frontend
    // resets its guard when this stamp changes, because a new generation's numbers have no
    // relationship to the old generation's.
    //
    // A random id rather than Date.now(): the frontend only ever compares this for
    // equality, and a clock is the one thing that is NOT reliably distinct across a
    // restart on this project's target hardware — a Raspberry Pi has no RTC, so it boots
    // with whatever time was last persisted and NTP corrects it seconds later. Two boots
    // that stamped the same millisecond would leave the display frozen exactly as before,
    // and nothing would say so.
    this._epoch = Math.floor(Math.random() * Number.MAX_SAFE_INTEGER);
    // The first location this helper was asked about, and whether a second distinct one
    // has already been reported. MagicMirror runs ONE node_helper per module *type*, so two
    // configured MMM-SPCOutlook instances share this object and this cache. See
    // _noteRequestLocation.
    this._requestLocation = null;
    this._loggedMultiInstance = false;
    // WR-08: monotonic count of features dropped because turf could not build their
    // geometry. getSpcOutlook samples it across a run to decide whether the payload was
    // assembled from complete layers.
    this._unusableFeatureCount = 0;
    // WR-04: oldest cached timestamp contributing to the payload under assembly.
    this._oldestStaleAt = null;
    // D-11: an unmapped Hazards Outlook label must render verbatim and be logged
    // *once*, not once per feature/poll. This Set is that once-per-process ledger.
    // Initialised here (not lazily) so resetHelper clears it between probe scenarios —
    // otherwise a log assertion in one scenario could be satisfied by a previous
    // scenario's entry.
    this._loggedUnmappedHazardLabels = new Set();
    // D-04/D-05/D-06/D-07: HeatRisk's four once-per-process log guards. A FIXED
    // cardinality of four booleans, deliberately not a keyed ledger — 16-REVIEW WR-06's
    // unbounded-growth class (a remote-controlled key set that grows forever) is
    // unrepresentable here rather than bounded after the fact, because none of these four
    // conditions is keyed by anything upstream-controlled.
    this._loggedHeatRiskValuesMismatch = false;
    this._loggedHeatRiskAllNoData = false;
    this._loggedHeatRiskSequenceGap = false;
    this._loggedHeatRiskDataAge = false;
    // WR-03: the fifth. The comment above says "a FIXED cardinality of four booleans" —
    // it is five now, and the property that matters is unchanged: none of these is keyed
    // by anything upstream-controlled, so 16-REVIEW WR-06's unbounded-growth class stays
    // unrepresentable rather than merely bounded.
    this._loggedHeatRiskDayCollision = false;
    // WR-09: cache keys currently being fetched, url -> in-flight count. `_geoJsonCache` is
    // the largest shared mutable structure PERF-01's batch touches and the only one whose
    // access pattern is a read-modify-write SPANNING an await (read the entry, await the
    // fetch, write the entry back). Its safety rests entirely on the six members' URL
    // keyspaces being disjoint, which was an unstated, unenforced premise. This makes the
    // premise observable: see fetchGeoJsonCached.
    this._inFlightCacheKeys = new Map();
    this._loggedCacheKeyContention = false;
    this._products = this._productToggles();
  },

  /**
   * Build the per-product toggle map from the registry (WR-16).
   * @param products - the frontend's optional `products` payload object
   * @returns an object with one boolean per registry row, keyed by that row's `configFlag`
   *   and defaulted to false. Driving this from PRODUCT_REGISTRY rather than a hand-written
   *   literal is what makes the row's own "used by node_helper as this._products[configFlag]"
   *   comment true, and means a Phase 15-17 row needs no edit here (CFG-01, D-06).
   */
  _productToggles(products){
    const toggles = {};
    for (const row of Object.values(PRODUCT_REGISTRY)) {
      toggles[row.configFlag] = products?.[row.configFlag] === true;
    }
    // WR-16 / D-10: sub-toggles gate behavior WITHIN an already-fetched product (here,
    // which Hazards Outlook labels are displayable) rather than gating a fetch, so they
    // cannot be derived from a registry row's `configFlag`. Copied through here — the
    // one place `_productToggles` is called from every path (start(), the socket
    // handler, getSpcOutlook's own fallback) — with the same strict-`=== true`
    // defaulting the row loop above uses, so a future sub-toggle needs no edit at any of
    // those call sites. Threading this here rather than reading `this._products` inside
    // the runner keeps the runner pure with respect to helper-global state, exactly as
    // `_runArcGisDayProduct`'s `productToggles` parameter already does (WR-13).
    for (const flag of SUB_TOGGLES) {
      toggles[flag] = products?.[flag] === true;
    }
    return toggles;
  },

  /**
   * Fetch, cache and evaluate one `arcgis-day-layers` registry row (ERO, WSSI, ...) across its
   * full day span, returning the same flat `day{N}Risk/Text/Color/ValidTime` payload shape
   * every arcgis-day-layers product shares. Extracted from the original ERO-only day-loop so a
   * fix applied to one arcgis-day-layers product structurally cannot skip its twin (D-02).
   * @param row - a PRODUCT_REGISTRY row of kind "arcgis-day-layers"
   * @param loc - turf point representing the query location
   * @param comparator - { initial, comparator(best, val) } shape, e.g. catComparator
   * @param productToggles - this request's own toggle snapshot (WR-13); the row's own
   *   configFlag is read from here rather than from this._products, so the method stays pure
   *   with respect to helper-global state and never touches the caller's `anyStale` local
   *   directly.
   * @returns { payload, anyStale } — payload always carries the full day1..dayN block
   *   regardless of the toggle (Phase 14 D-05); anyStale is the boolean OR of every
   *   fetchResult.stale || fetchResult.failed seen while the toggle was on.
   */
  async _runArcGisDayProduct(row, loc, comparator, productToggles) {
    // WR-16: the day count, the seed objects, the loop bound and the payload block are all
    // driven by `row.days` — no literal day count survives outside the registry, so the row is
    // the single place a product's span is declared.
    const days = row.days;
    const tiers = {};
    const validTimes = {};
    for (let d = 1; d <= days; d++) {
      tiers[d] = "NONE";
      validTimes[d] = null;
    }

    let anyStale = false;

    if (productToggles[row.configFlag]) {
      for (let d = 1; d <= days; d++) {
        try {
          const url = row.buildUrl(d);
          const fetchResult = await this.fetchGeoJsonCached(url);
          // A rejected body is deliberately never written to the cache (it would pin a bad
          // result behind a future 304), but it DOES set `anyStale` — refining D-04, which
          // bound ERO staleness to `fetchResult.stale` alone. A degrade the user cannot see
          // is indistinguishable from a genuine all-clear, and that false negative is the
          // one outcome this product exists to prevent (CR-03, WR-06).
          if (fetchResult.stale || fetchResult.failed) anyStale = true;

          let value = 0;
          let validTime = null;

          if (fetchResult.data === null && fetchResult.cachedResult !== null) {
            value = fetchResult.cachedResult.value;
            validTime = fetchResult.cachedResult.validTime;
          } else if (fetchResult.data !== null) {
            // WR-01: no second shape check here. fetchGeoJsonCached has twelve
            // `return { data ... }` sites and exactly two carry a non-null `data`,
            // each immediately preceded by an `_isFeatureCollection` gate, so
            // `data !== null` already implies a usable FeatureCollection. The branch
            // that used to sit here could not execute in production, and it was a
            // second, divergent implementation of a policy rejectBody already owns:
            // rejectBody requires `entry.result !== null && !== undefined`, this copy
            // required `cached.result` to be truthy, so a legitimately cached `{ value: 0 }`
            // would have been treated differently by the two. The stale-fallback
            // guarantee ("a WPC hiccup during an active HIGH must not blank the
            // display") is delivered by rejectBody at the fetch layer, which is where
            // ero-rejected-body-serves-last-known-good now exercises it.
            const polys = this.extractPolygons(fetchResult.data, row.toValue, row.includesFeat, url);
            value = this.evaluatePolygons(polys, loc, comparator);
            // CR-01/WR-10: read the row's valid-time field off the winning polygon — the
            // one the user is actually inside at the resolved tier — never off
            // `features[0]`, and never at all on the no-risk path (a risk-free day must
            // not advertise a valid window).
            validTime = value > 0
              ? this._validTimeOfWinner(polys, loc, value, row.validTimeField)
              : null;
            this._geoJsonCache.set(url, {
              mode: fetchResult.mode,
              etag: fetchResult.newEtag ?? null,
              hash: fetchResult.newHash ?? null,
              result: { value, validTime },
              timestamp: this._nowMs()
            });
          }

          // Convert exactly once, after the branch closes — never inside either
          // branch — so a cache hit produces the identical tier string as a fresh
          // fetch (PERF-02, D-03).
          tiers[d] = row.valueToTier[value] || "NONE";
          validTimes[d] = validTime;
        } catch (err) {
          // CR-01: a contained throw is a degrade, not a clean read. The day resolves to
          // "NONE", which is byte-identical to a genuine all-clear, so the payload must
          // carry the staleness signal or the frontend renders a confident "No Severe
          // Weather Risk" with no ⚠. Raised independently of the
          // `fetchResult.stale || fetchResult.failed` line above, because the throw can
          // happen before that line ever runs (D-04, CV-01).
          anyStale = true;
          Log.error(`MMM-SPCOutlook ${row.id} day ${d}: fetch/parse/evaluate failed, leaving day at no risk`, err);
        }
      }
    }

    // WR-16: built from `row.days` rather than a hand-written literal, so the registry
    // row is the only place the product's day span is declared. Key insertion order
    // (dayNRisk, dayNText, dayNColor, dayNValidTime) is deliberate — the probe's golden
    // snapshots compare serialised payloads byte for byte.
    const payload = {};
    for (let d = 1; d <= days; d++) {
      payload[`day${d}Risk`] = tiers[d];
      payload[`day${d}Text`] = row.tierToText[tiers[d]];
      payload[`day${d}Color`] = row.tierToColor[tiers[d]];
      payload[`day${d}ValidTime`] = validTimes[d];
    }

    return { payload, anyStale };
  },

  /**
   * Pure normalizer for the Hazards Outlook: maps each hit from
   * `evaluatePolygonsCollectAll` to exactly the four-field clock-independent match shape
   * and nothing else — `{ label, startDate, endDate, idpFiledate }`. `label` is
   * `hit.value` (already the lowercase `label` string, per the registry's own `toValue`).
   * `idpFiledate` normalizes a missing/non-finite `idp_filedate` to `null` rather than
   * `undefined`, so downstream freshness checks can test it with a single `typeof`.
   *
   * Per-item containment (the CR-02 lesson, extended to normalization): a hit whose
   * `label` is not a non-empty string, or whose `start_date`/`end_date` is not a finite
   * number, is dropped rather than thrown on — one malformed feature must not lose its
   * siblings' matches.
   * @param hits - array of { label, value, poly, feature } from evaluatePolygonsCollectAll
   * @returns array of { label, startDate, endDate, idpFiledate }
   */
  _hazardMatchesFromHits(hits) {
    const matches = [];
    for (const hit of hits) {
      const label = hit && hit.value;
      if (typeof label !== "string" || label.length === 0) continue;

      const props = hit.feature && hit.feature.properties;
      const startDate = props ? props.start_date : undefined;
      const endDate = props ? props.end_date : undefined;
      if (typeof startDate !== "number" || !Number.isFinite(startDate) ||
          typeof endDate !== "number" || !Number.isFinite(endDate)) {
        continue;
      }

      const rawFiledate = props ? props.idp_filedate : undefined;
      const idpFiledate = (typeof rawFiledate === "number" && Number.isFinite(rawFiledate))
        ? rawFiledate
        : null;

      matches.push({ label, startDate, endDate, idpFiledate });
    }
    return matches;
  },

  /**
   * Read a Hazards Outlook layer's own publish timestamp off its RAW GeoJSON body, before
   * any containment or `includesFeat` filtering has been applied.
   *
   * This exists because the D-13 age check must not depend on the user's location. Reading
   * `idp_filedate` off the post-containment match array (the original shape) meant a layer
   * carrying 27 five-day-old features raised no staleness signal whenever none of them
   * contained the user — so the user who saw content got a correct badge and the user who
   * saw nothing got a confident, unbadged all-clear off stale data. That is the
   * false-negative class this module exists to prevent, and it is the common case rather
   * than an edge one: most locations sit outside most hazard polygons most of the time.
   *
   * A genuinely zero-feature layer still returns null and still ages out of the check.
   * That case is deliberate and unchanged — an empty layer is a real answer from WPC, not
   * a staleness signal (the WSSI-03 precedent this codebase already ships).
   *
   * `idp_filedate` is a REMOTE publish timestamp, not a value derived from our clock, so it
   * is clock-INDEPENDENT and safe to carry through the cache under this product's contract.
   * @param geojson - the parsed layer body from fetchGeoJsonCached
   * @returns the first finite numeric `idp_filedate` found, or null
   */
  _hazardLayerFiledate(geojson) {
    const features = geojson && Array.isArray(geojson.features) ? geojson.features : [];
    for (const f of features) {
      const v = f && f.properties ? f.properties.idp_filedate : undefined;
      if (typeof v === "number" && Number.isFinite(v)) return v;
    }
    return null;
  },

  /**
   * The ONLY place the Hazards Outlook product writes to `_geoJsonCache`.
   *
   * `_runArcGisDayProduct` (above) caches a final, already-resolved day-keyed value
   * (`result: { value, validTime }`) and that is correct for ERO/WSSI, because their day
   * key is a property of the URL — `dayLayers[1]` is always Day 1, and WPC republishes
   * fresh Day-1 content under that same URL. This product's day key is a property of the
   * CLOCK: a feature fixed at Aug 29 00:00Z is day3 on Aug 26 and day2 on Aug 27, with
   * unchanged bytes and an ETag that never fires. With the confirmed Mon–Fri-only
   * cadence, every weekend poll is exactly that scenario. Copying the analog would
   * silently shift every hazard one day earlier per elapsed day, with no error, no ⚠, and
   * no failing assertion — the existing cache-hit probe scenarios assert byte-identical
   * output across a hit, which is the correct invariant for ERO and the wrong one here.
   * This function therefore caches only clock-INDEPENDENT data. The field-by-field
   * whitelist (not a spread) is deliberate: it makes a day key or an offset physically
   * unable to enter the cache, rather than relying on a future maintainer reading this
   * comment.
   * @param url - the layer's own URL, from row.buildUrl(layer.id)
   * @param fetchResult - this layer's fetchGeoJsonCached() result (a cache miss)
   * @param matches - the clock-independent match array from _hazardMatchesFromHits
   * @param layerFiledate - the layer's own `idp_filedate` from _hazardLayerFiledate, read
   *   off the raw body rather than the matches so the age check survives a poll where
   *   nothing contained the user. Clock-independent (a remote publish timestamp), so it
   *   does not weaken the contract this function enforces.
   */
  _cacheHazardMatches(url, fetchResult, matches, layerFiledate) {
    const whitelisted = [];
    for (const match of matches) {
      // Defensive assertion: the whitelist below already makes a clock-dependent field
      // structurally unable to enter the cache. This converts a future refactor that
      // bypasses the whitelist (e.g. a spread added here later) from a silent misdating
      // bug into a loud, immediate failure.
      for (const key of Object.keys(match)) {
        if (/^day\d+$/.test(key) || key === "offsetStart" || key === "offsetEnd" || key === "dayOffset") {
          throw new Error("MMM-SPCOutlook _cacheHazardMatches: refusing to cache a clock-dependent field: " + key);
        }
      }
      whitelisted.push({
        label: match.label,
        startDate: match.startDate,
        endDate: match.endDate,
        idpFiledate: match.idpFiledate
      });
    }

    // Normalized here rather than trusted from the caller, so a malformed upstream value
    // cannot become a NaN comparison that silently reads as "fresh" downstream.
    const filedate = (typeof layerFiledate === "number" && Number.isFinite(layerFiledate))
      ? layerFiledate
      : null;

    this._geoJsonCache.set(url, {
      mode: fetchResult.mode,
      etag: fetchResult.newEtag ?? null,
      hash: fetchResult.newHash ?? null,
      // `{ matches, layerFiledate }`, not a bare array — the filedate must survive a cache
      // hit on a poll where nothing contains the user, which is exactly the case the old
      // bare-array shape could not express. Both fields are clock-independent.
      result: { matches: whitelisted, layerFiledate: filedate },
      timestamp: this._nowMs()
    });
  },

  /**
   * The ONLY place the HeatRisk product writes to `_geoJsonCache`. Sibling to
   * `_cacheHazardMatches` (above), NOT to `_runArcGisDayProduct`'s cache write
   * (`result: { value, validTime }`) — that shape is safe for ERO/WSSI only because their
   * day key is a property of the URL (`dayLayers[1]` is always "Day 1"). HeatRisk's day
   * key is derived by comparing a STATIC `idp_validtime` against TODAY'S LIVE CLOCK, from
   * ONE URL that covers all seven days. Caching an already-bucketed dayN-keyed result the
   * way `_runArcGisDayProduct` legitimately does would silently misdate every category by
   * one day per elapsed day, with no error, no warning badge, and no failing assertion.
   * Phase 16 discovered this exact defect class for the Hazards Outlook; HeatRisk is the
   * second product with the property. The field-by-field whitelist (never a spread) makes
   * a clock-dependent field physically unable to enter the cache, rather than relying on a
   * future maintainer reading this comment.
   * @param url - the HeatRisk identify URL, from row.buildUrl(mercatorX, mercatorY)
   * @param fetchResult - this poll's fetchGeoJsonCached() result (a cache miss)
   * @param tuples - Array<{ attrs, rawValue }> from `_dedupeHeatRiskByValidTime` (17-02) —
   *   raw, unparsed catalog tuples, not yet in the cached shape
   * @returns Array<{ idpValidtime, category, idpFiledate }> — the exact array written to
   *   the cache, so the caller can bucket over it directly rather than re-parsing a second
   *   time (the "convert exactly once" discipline `_runArcGisDayProduct` established,
   *   applied here to a whitelist build rather than a valueToTier lookup)
   */
  _cacheHeatRiskTuples(url, fetchResult, tuples) {
    const whitelisted = [];
    for (const tuple of tuples) {
      // Defensive assertion: the whitelist below already makes a clock-dependent field
      // structurally unable to enter the cache. This converts a future refactor that
      // hands this function an already-bucketed tuple from a silent misdating bug into a
      // loud, immediate failure — the same instinct `_cacheHazardMatches` applies.
      for (const key of Object.keys(tuple || {})) {
        if (/^day\d+$/.test(key) || key === "dayOffset" || key === "offsetStart" || key === "offsetEnd") {
          throw new Error("MMM-SPCOutlook _cacheHeatRiskTuples: refusing to cache a clock-dependent field: " + key);
        }
      }

      const attrs = tuple && tuple.attrs;
      const idpValidtime = attrs && attrs.idp_validtime;
      if (typeof idpValidtime !== "number" || !Number.isFinite(idpValidtime)) continue; // malformed, drop

      // D-06/HEAT-01: the literal "NoData" sentinel, and anything that is not an integer
      // 0-4, becomes category: null — never thrown, never coerced to 0.
      //
      // 17-REVIEW CR-01: an earlier form of this read `Number(rawValue)` first and then
      // range-checked the result, which inverted the contract above for a whole family of
      // inputs — `Number("")`, `Number(null)`, `Number("  ")`, `Number(false)` and
      // `Number([])` are ALL exactly 0, and 0 passes `Number.isInteger(v) && v >= 0 &&
      // v <= 4`. A degraded `properties.Values` therefore rendered seven affirmative days
      // of "Little to No Risk", and because `resolvedDays` was then non-empty, D-04's
      // all-NoData branch never fired: no badge, no log, no signal. On a heat-SAFETY
      // product that is the exact confident-all-clear-during-a-hazard shape this project
      // exists to prevent.
      //
      // So the parse is now allow-list first, coerce second: ONLY a bare non-negative
      // integer string (the live-observed shape — properties.Values carries strings) or a
      // real JS number is even a candidate. Everything else — "NoData", "", "  ", null,
      // false, [], {}, "1.5", "1e0", " 1 " with junk — is ABSENCE, and absence is null.
      // The old explicit `rawValue !== "NoData"` guard is subsumed: "NoData" fails the
      // integer-string test like every other non-numeric string, so there is no longer a
      // privileged sentinel that alone means absence.
      const rawValue = tuple.rawValue;
      const isIntegerString = typeof rawValue === "string" && /^\d+$/.test(rawValue.trim());
      const parsedValue = (isIntegerString || typeof rawValue === "number") ? Number(rawValue) : NaN;
      const category = (Number.isInteger(parsedValue) && parsedValue >= 0 && parsedValue <= 4)
        ? parsedValue
        : null;

      const rawFiledate = attrs && attrs.idp_filedate;
      const idpFiledate = (typeof rawFiledate === "number" && Number.isFinite(rawFiledate)) ? rawFiledate : null;

      whitelisted.push({ idpValidtime, category, idpFiledate });
    }

    this._geoJsonCache.set(url, {
      mode: fetchResult.mode,
      etag: fetchResult.newEtag ?? null,
      hash: fetchResult.newHash ?? null,
      result: { tuples: whitelisted },
      timestamp: this._nowMs()
    });

    return whitelisted;
  },

  /**
   * Read HeatRisk's clock-independent cache entry back, tolerant of a missing or
   * malformed shape — never throws. Returns `[]` for a missing entry, a non-object entry,
   * or a non-array `entry.tuples`; otherwise returns `entry.tuples` verbatim, already in
   * `{ idpValidtime, category, idpFiledate }` shape.
   *
   * The caller MUST recompute the day offset from these tuples against THIS poll's own
   * `_todayUtcMs()`, on the cache-hit path exactly as on the cache-miss path — the cached
   * tuples deliberately carry no day key at all, which is what makes forgetting that
   * impossible rather than merely undocumented.
   * @param entry - `fetchResult.cachedResult` (the `_geoJsonCache` entry's `result` field,
   *   i.e. the exact `{ tuples }` object `_cacheHeatRiskTuples` wrote)
   * @returns Array<{ idpValidtime, category, idpFiledate }>
   */
  _heatRiskTuplesFromCache(entry) {
    if (!entry || !Array.isArray(entry.tuples)) return [];
    return entry.tuples;
  },

  /**
   * Fetch, filter, cache and re-bucket the `arcgis-hazard-window` registry row (Hazards
   * Outlook) across all six layers, returning the `{ payload, anyStale }` shape every
   * runner in this file shares.
   *
   * This signature deliberately does NOT accept a `todayUtcMs` — the runner computes its
   * own, once per poll, so no caller can hand it a stale value. `_cacheHazardMatches`
   * (above) makes a clock-dependent cache entry unwritable; this signature makes a
   * clock-dependent input unpassable. Together they are the structural half of the
   * phase's highest-risk mitigation (16-RESEARCH.md "Freshness Integration" — day-offset
   * drift on a cache hit).
   * @param row - PRODUCT_REGISTRY.hazardsOutlook
   * @param loc - turf point representing the query location
   * @param productToggles - this request's own toggle snapshot (WR-13), including the
   *   `showDrought` sub-toggle
   * @returns { payload, anyStale, gridMatches, idpFiledate } — payload always carries the
   *   full day3..day14 + windowBand block regardless of the toggle (Phase 14 D-05).
   *   `gridMatches` and `idpFiledate` are Phase 18 D-01 additive side-channels: the SAME
   *   normalized match objects the legacy bucketer above already consumed (never a second
   *   read of `fetchResult.data`, never a second `extractPolygons`/layer loop) and the
   *   newest per-layer publish timestamp, so the Phase 18 merge stage (18-03) can re-anchor
   *   this product's day-scoped labels onto the SPC 12Z grid (D-09) without a second fetch,
   *   while `payload` stays on its own `_todayUtcMs`-anchored day3..day14 keys, untouched,
   *   under D-01.
   */
  async _runArcGisHazardWindowProduct(row, loc, productToggles) {
    const todayUtcMs = this._todayUtcMs();

    // Phase 14 D-05: accumulators are seeded before the toggle check, so a toggle-off
    // poll still returns the full day3..day14 + windowBand block, just empty.
    const dayBuckets = {};
    const windowEntries = [];
    // Phase 18 D-01 side-channel: the raw, clock-independent match objects the legacy
    // bucketer below already consumes, handed to the Phase 18 merge stage (18-03) so it
    // can re-bucket onto the SPC grid without a second fetch or a second layer loop.
    // Seeded before the toggle check, same as dayBuckets/windowEntries, so a toggle-off
    // poll still returns an array (never undefined) — every 18-05 consumer iterates it.
    const gridMatches = [];
    // The newest idp_filedate observed across all layers this poll, ignoring null
    // (16 D-13's per-layer publish timestamp; a genuinely empty layer contributes none).
    let newestFiledate = null;
    let anyStale = false;

    // `extractPolygons` calls `includesFeat(label, value)` where `label` is the
    // always-empty uppercase `LABEL` read (HAZ-03/Pitfall 8 — this service has no LABEL
    // field, only lowercase `label`) and `value` is what `row.toValue` returned, so the
    // check below is against `val`, never `label`. A `""` value means a missing or
    // non-string upstream label, which is a malformed feature and is dropped here.
    //
    // 16-REVIEW WR-01: this closure USED to carry D-09's exclusion and D-10's drought
    // gate too, and `extractPolygons` applies it on the cache-MISS path only. The
    // surviving matches were then written to `_geoJsonCache` keyed by URL ALONE, so the
    // drought decision made at cache-fill time was replayed verbatim on every later hit
    // (304, ETag match, hash match, stale fallback) and `includesFeat` was never
    // consulted again. MagicMirror runs ONE node_helper per module TYPE — a fact this
    // file documents at length — so two configured instances with different
    // `showDrought` values share one cache: whichever polled first decided for both, and
    // the other rendered drought labels its own config disabled (or missed drought it
    // enabled) until the upstream bytes changed, which at this product's Mon-Fri cadence
    // and 84-hour age tolerance can be days. Only the STRUCTURAL check stays here,
    // because it is a property of the FEATURE and is therefore safe to bake into a
    // cached unit; the two label gates move to `displayable` below.
    const includesFeat = (label, val) => Boolean(val);

    // D-09 + D-10, applied per POLL at bucket time rather than per cache fill (WR-01) —
    // deliberately in the same place, and for the same reason, as re-bucketing: it runs
    // identically on a cache hit and a cache miss, against THIS request's own toggle
    // snapshot, so no cached reading can carry another instance's toggle decision.
    // D-02 (15's registry-row-is-pure-static-config convention) is why this closure is
    // built here at call time rather than carried on the row: `showDrought` is request
    // state, not static configuration a row can hold.
    const displayable = (label) => {
      // WR-02: compare on the registry's FOLDED key, never on the raw string. These were
      // exact-string `Array.includes` checks, so `"Flooding Likely "`, `"flooding likely"`
      // or a value carrying a non-breaking space walked past D-09 and rendered the
      // National Flood Outlook's data under the Hazards Outlook's name — the one thing
      // D-09 exists to prevent — and `"Severe Drought "` bypassed D-10's default-off gate.
      // Only the KEY is folded; `label` itself is untouched, so D-11's verbatim-render
      // contract still holds for whatever survives.
      const key = hazardLabelKey(label);
      // D-09: unconditional, no config path re-enables Flooding.
      if (row.excludedLabelKeys.has(key)) return false;
      // D-10: strict `!== true` so an absent or non-boolean `showDrought` (a string,
      // `1`) behaves exactly like `false`, per CFG-01's default.
      if (row.droughtLabelKeys.has(key) && productToggles.showDrought !== true) return false;
      return true;
    };

    if (productToggles[row.configFlag]) {
      for (const layer of row.layers) {
        try {
          const url = row.buildUrl(layer.id);
          const fetchResult = await this.fetchGeoJsonCached(url);
          if (fetchResult.stale || fetchResult.failed) anyStale = true;

          let matches;
          let layerFiledate = null;
          if (fetchResult.data === null && fetchResult.cachedResult !== null) {
            // Already the clock-independent unit _cacheHazardMatches wrote — do NOT
            // re-extract, do NOT re-evaluate. The polygons are gone on a cache hit, and
            // that is fine: this match array is exactly what re-bucketing needs. The
            // bare-array branch tolerates an entry written by an older shape (or by a
            // probe fixture that hand-builds one) rather than throwing on it.
            const cached = fetchResult.cachedResult;
            if (Array.isArray(cached)) {
              matches = cached;
            } else {
              matches = Array.isArray(cached.matches) ? cached.matches : [];
              layerFiledate = typeof cached.layerFiledate === "number" ? cached.layerFiledate : null;
            }
          } else if (fetchResult.data !== null) {
            const polys = this.extractPolygons(fetchResult.data, row.toValue, includesFeat, url);
            const hits = this.evaluatePolygonsCollectAll(polys, loc);
            matches = this._hazardMatchesFromHits(hits);
            // Read off the RAW body, before containment filtering — see
            // _hazardLayerFiledate. This is what makes the age check below independent of
            // whether anything contained the user.
            layerFiledate = this._hazardLayerFiledate(fetchResult.data);
            this._cacheHazardMatches(url, fetchResult, matches, layerFiledate);
          } else {
            matches = [];
          }

          // Freshness (D-13/D-14/D-15), after the branch above closes, using this
          // layer's own publish timestamp.
          {
            // 16-REVIEW CR-01: this used to be guarded by `matches.length > 0`, and
            // `matches` is POST-containment. A layer of 27 five-day-old features raised no
            // staleness signal whenever none of them contained the user — the majority
            // case — so the user who saw nothing got an unbadged all-clear off stale data.
            // The guard is now the filedate's own existence, which is a property of the
            // layer rather than of the user's location. `_hazardLayerFiledate` returns null
            // for a genuinely empty layer, so comment (c) below still holds.
            const filedate = layerFiledate;
            if (typeof filedate === "number" &&
                (this._nowMs() - filedate) > row.maxDataAgeHours * 60 * 60 * 1000) {
              // (a) D-15's deliberate asymmetry: this sets `anyStale` so the ⚠ badge
              //     fires, but does NOT call `this._noteStaleEntry(...)` — `_staleAsOf`
              //     renders as "N minutes ago" and describes FETCH/network recency
              //     (Phase 14 D-04's global-only rule), not WPC's own publish age.
              //     Without this omission a 60-hour-old hazards file would make the
              //     badge speak for SPC data fetched five minutes ago, training the user
              //     to distrust a badge that is usually right.
              // (b) D-13: `idp_filedate` is PER LAYER, not per service — live
              //     2026-08-26 recorded three distinct filedates across the six layers
              //     in one poll, one ~23h staler than its siblings. Reading the FIRST
              //     feature's value is safe because it is uniform WITHIN a layer, but a
              //     row-level shared timestamp does not exist.
              // (c) A layer that is GENUINELY zero-feature has no `idp_filedate` to read,
              //     so `_hazardLayerFiledate` returns null and this check is skipped —
              //     deliberate (the WSSI-03 precedent this codebase already ships): an
              //     empty layer is a real answer, not a staleness signal. Note this is
              //     zero FEATURES, not zero MATCHES; conflating the two was CR-01.
              // (d) This runs on a cache HIT too, because `idpFiledate` travels inside
              //     the cached match array — a feed that stalls while still serving
              //     304s must still age out.
              anyStale = true;
            }
          }

          // Phase 18 D-01/D-04: track the newest publish timestamp across all layers,
          // ignoring null — this is 16 D-13's `idp_filedate`, surfaced in `sources` by a
          // later plan. Runs on both the cache-hit and fresh-fetch branches, same as the
          // freshness check above, since `layerFiledate` is populated on both.
          if (typeof layerFiledate === "number" && (newestFiledate === null || layerFiledate > newestFiledate)) {
            newestFiledate = layerFiledate;
          }

          // Re-bucket, every poll, cache hit or miss — deliberately outside and after
          // the cache branch above. It runs identically on a hit and a miss, against
          // THIS poll's `todayUtcMs`; moving it inside the miss branch would reintroduce
          // the day-offset drift the cache contract exists to prevent.
          for (const match of matches) {
            // WR-01: the label gate runs HERE, beside re-bucketing, for the same reason —
            // both are decisions the cache must not be allowed to freeze.
            if (!displayable(match.label)) continue;
            // Phase 18 D-01: push the SAME match object the legacy bucketer below
            // consumes, from the same loop iteration — the shared-in-memory-values
            // constraint made concrete. No second read of `fetchResult.data`, no second
            // `extractPolygons`, no second loop over `layers`. `18-03` re-anchors this
            // onto the SPC 12Z grid without ever re-fetching or re-parsing.
            gridMatches.push({
              label: match.label,
              startDate: match.startDate,
              endDate: match.endDate,
              group: layer.group,
              dayRange: layer.dayRange
            });
            // WR-03: hand the bucketer the row's own span, so its day-grid clamp and the
            // payload-assembly loop below read ONE declaration of this product's range.
            this._bucketHazardMatch(match, layer, todayUtcMs, dayBuckets, windowEntries,
                                    row.dayRangeTotal);
          }
        } catch (err) {
          // CR-01: a contained throw is a degrade, not a clean read, and it can happen
          // before the `fetchResult.stale || fetchResult.failed` line ever runs.
          anyStale = true;
          Log.error(
            "MMM-SPCOutlook " + row.id + " layer " + layer.id +
            ": fetch/parse/evaluate failed, leaving this layer empty", err
          );
        }
      }
    }

    // D-02: registry-declared order for same-day co-occurring hazards, because ArcGIS
    // response order can flip between polls on an unchanged forecast, which reads as a
    // change on a glanceable mirror and defeats PERF-02's byte-identity intent. Labels
    // absent from `row.order` sort after every listed label, alphabetically among
    // themselves.
    const labelRank = (label) => {
      const idx = row.order.indexOf(label);
      return idx === -1 ? row.order.length : idx;
    };
    const compareLabels = (labelA, labelB) => {
      const rankDiff = labelRank(labelA) - labelRank(labelB);
      if (rankDiff !== 0) return rankDiff;
      return labelA.localeCompare(labelB);
    };

    // D-11: dropping an unknown label would make a mid-season WPC addition invisible
    // until someone read the logs (the Pitfall 8 false-negative shape). The MapServer
    // legend carries ~15 labels; visibility beats silence. Logged once per process
    // (`_loggedUnmappedHazardLabels`) so a 27-feature layer does not flood the log every
    // poll. Applied to both the day hazards and the window entries below.
    const resolveStyle = (label) => {
      const mapped = Object.prototype.hasOwnProperty.call(row.displayColor, label);
      const color = mapped ? row.displayColor[label] : row.defaultColor;
      // WR-06: dedupe on a TRUNCATED key and stop growing the ledger at a fixed size. The
      // ledger exists only to keep one log line from repeating, so neither bound can cost
      // information the operator would otherwise have had: past the cap the label still
      // renders verbatim (D-11 is untouched — this is the LOG's memory, not a filter), it
      // simply stops being remembered as already-logged.
      const logKey = String(label).slice(0, HAZARDS_LOG_LABEL_MAX_CHARS);
      if (!mapped && !this._loggedUnmappedHazardLabels.has(logKey) &&
          this._loggedUnmappedHazardLabels.size < HAZARDS_MAX_LOGGED_UNMAPPED_LABELS) {
        this._loggedUnmappedHazardLabels.add(logKey);
        Log.info(
          "MMM-SPCOutlook hazardsOutlook: unmapped hazard label rendered verbatim in the default style: " + logKey
        );
      }
      return { color, mapped };
    };

    const block = {};
    for (let d = row.dayRangeTotal[0]; d <= row.dayRangeTotal[1]; d++) {
      // D-01: every day carries its resolved UTC `date` so the frontend labels weekdays
      // from the real date instead of `dowToText(dow + N)` — WPC's "Day N" boundary
      // differs from SPC's and offset arithmetic drifts by one (Pitfall 9).
      const date = this._utcDateString(todayUtcMs + d * MS_PER_DAY);
      // Dedupe by label — two layers can contribute the same label to the same day.
      const seenLabels = new Set();
      const hazards = [];
      for (const item of (dayBuckets[d] || [])) {
        if (seenLabels.has(item.label)) continue;
        seenLabels.add(item.label);
        const { color, mapped } = resolveStyle(item.label);
        hazards.push({ label: item.label, color, mapped });
      }
      hazards.sort((a, b) => compareLabels(a.label, b.label));
      block["day" + d] = { date, hazards };
    }

    // D-07: one band, sorted by span start, each entry self-labeling. D-06: the entry
    // carries its OWN observed span, never the layer's nominal window — live 2026-08-26
    // a D8-14 feature spanned 2 days inside a nominal 7-day bucket, and labeling it
    // "D8-14" would advertise 7 days of heat where the data says 2.
    const seenWindowKeys = new Set();
    const windowBand = [];
    for (const entry of windowEntries) {
      const key = entry.label + "|" + entry.offsetStart + "|" + entry.offsetEnd;
      if (seenWindowKeys.has(key)) continue;
      seenWindowKeys.add(key);
      const { color, mapped } = resolveStyle(entry.label);
      windowBand.push({
        label: entry.label,
        color,
        mapped,
        startDate: entry.startDate,
        endDate: entry.endDate,
        offsetStart: entry.offsetStart,
        offsetEnd: entry.offsetEnd
      });
    }
    windowBand.sort((a, b) => {
      const diff = a.offsetStart - b.offsetStart;
      if (diff !== 0) return diff;
      return compareLabels(a.label, b.label);
    });
    // WR-06: bound the band AFTER sorting, so what survives is the head of a meaningfully
    // ordered list (earliest span start first) rather than whatever order ArcGIS emitted —
    // the same contract `_runKmlAdvisoryRow`'s ADVISORY_MAX_CANDIDATES cap states for its
    // own truncation. Logged, never silent: a band this long is an upstream anomaly the
    // operator should see, not a display quirk.
    if (windowBand.length > HAZARDS_MAX_WINDOW_ENTRIES) {
      Log.error(
        "MMM-SPCOutlook " + row.id + ": " + windowBand.length + " window-band entries; " +
        "keeping the " + HAZARDS_MAX_WINDOW_ENTRIES + " earliest-starting"
      );
      windowBand.length = HAZARDS_MAX_WINDOW_ENTRIES;
    }
    block.windowBand = windowBand;

    // D-16: a data-age trip is an age signal, not a false negative. `rejectBody`'s
    // serve-last-known-good precedent exists precisely so a WPC hiccup during an active
    // hazard does not blank the display — rows are never suppressed when `anyStale` is
    // true.
    return { payload: block, anyStale, gridMatches, idpFiledate: newestFiledate };
  },

  /**
   * Fetch, reproject, zip/sort/dedupe/bucket and freshness-check the `arcgis-identify-point`
   * registry row (HeatRisk), returning the `{ payload, anyStale }` shape every runner in
   * this file shares. Unlike `_runArcGisDayProduct`'s per-day URL loop, this is ONE HTTP
   * round-trip covering all seven days — every day attribution comes from sorting each
   * catalog item's `idp_validtime`, never from array order or the response's top-level
   * `value` (live capture shows that scalar tracking whichever tile ArcGIS considers
   * visible, not "today").
   * @param row - PRODUCT_REGISTRY.heatRisk
   * @param loc - a turf Point Feature (built once via turf.point([lon, lat])); reprojected
   *   to Web Mercator here, immediately before the URL is built
   * @param productToggles - this request's own toggle snapshot (WR-13)
   * @returns { payload, anyStale, gridTuples, idpFiledate } — payload always carries the
   *   full day1..dayN block (row.days), regardless of the toggle (Phase 14 D-05/D-02);
   *   anyStale is never raised by the toggle-off path, only by a genuine fetch/data
   *   problem. `gridTuples` and `idpFiledate` are Phase 18 D-01 additive side-channels:
   *   every deduped catalog tuple this poll saw (unfiltered by this runner's own
   *   `_todayUtcMs`-relative span, which the Phase 18 merge stage must NOT apply — see the
   *   comment at the push site) and the newest per-tuple publish timestamp, so 18-03 can
   *   re-anchor onto the SPC 12Z grid without a second fetch, while `payload` stays on its
   *   own day1..dayN keys, untouched, under D-01.
   */
  async _runHeatRiskProduct(row, loc, productToggles) {
    // Phase 14 D-05/D-02: seed the full block BEFORE anything else, so a toggle-off poll
    // or a mid-pipeline throw still emits a complete, well-shaped block. WR-16: driven by
    // row.days, never a literal 7 — the registry row is the sole declaration of this
    // product's span.
    const payload = {};
    for (let d = 1; d <= row.days; d++) {
      payload["day" + d] = { category: null, text: "", color: "" };
    }

    // Phase 18 D-01 side-channels: declared before every return path, including the
    // toggle-off one below, so a consumer never sees `undefined` — every 18-05 consumer
    // iterates `gridTuples` unconditionally.
    const gridTuples = [];
    let newestFiledate = null;

    // D-02: this all-null block is a "no reading taken" state, NOT the D-04
    // all-NoData failure state — the toggle being off must never raise anyStale.
    if (productToggles[row.configFlag] !== true) {
      return { payload, anyStale: false, gridTuples, idpFiledate: newestFiledate };
    }

    let anyStale = false;

    // CR-01: "a contained throw is a degrade, not a clean read." The whole pipeline below
    // is wrapped so a throw at ANY point — reprojection, fetch, parse, bucket, freshness —
    // degrades this product alone rather than escaping to getSpcOutlook's shared catch.
    // Independent of the `fetchResult.stale || fetchResult.failed` check a few lines down,
    // because a throw can happen before that line ever runs.
    try {
      // HEAT-03: `loc` is ALREADY a turf Point Feature (built once at this product's call
      // site as `turf.point([lon, lat])`) — it has no `.lat`/`.lon` properties, so it is
      // reprojected directly rather than rebuilt from fields it lacks. The projected x/y
      // and the URL's declared `spatialReference.wkid: 102100` (inside row.buildUrl)
      // originate from this ONE reprojection. Live testing isolated `NoData`'s actual cause
      // as a coordinate/spatialReference UNIT MISMATCH — degree-scale numbers declared
      // under a Mercator spatial reference, not the choice of geographic reference system
      // itself; this reprojection keeps the declared coordinates and the declared
      // spatialReference in agreement.
      //
      // WR-08: never hand `loc` ITSELF to toMercator. `loc` is the single turf Point built
      // once per poll and used by EVERY product's containment check, now shared across five
      // concurrently-running batch members. turf.toMercator accepts a `{ mutate: true }`
      // option; turf 7.3.4 defaults to mutate:false, so passing `loc` directly happens to be
      // correct today — by inheritance, not by statement. If that option were ever added
      // here, or a future turf changed the default, every other product would evaluate
      // point-in-polygon against Web Mercator metres and report NO RISK ANYWHERE, with no
      // badge and no error, because of one line in a fifth product. A structural clone costs
      // one two-element array per poll and removes the dependency on a default entirely:
      // there is no longer anything to mutate that anyone else can observe. Cloning rather
      // than reading `loc.geometry.coordinates` keeps this agnostic to whether `loc` is a
      // Feature or a bare geometry, and cannot alias the coordinate array the way rebuilding
      // a point from that same array reference would.
      const projected = turf.toMercator(JSON.parse(JSON.stringify(loc)));
      const [mercatorX, mercatorY] = projected.geometry.coordinates;
      const url = row.buildUrl(mercatorX, mercatorY);

      const fetchResult = await this.fetchGeoJsonCached(url, (body) => this._isHeatRiskIdentifyResponse(body));
      if (fetchResult.stale || fetchResult.failed) anyStale = true;

      // Obtain tuples by one of two paths, converging on ONE downstream shape —
      // { idpValidtime, category, idpFiledate } — so a cache hit and a fresh fetch produce
      // byte-identical output from here on (the "convert exactly once" discipline
      // `_runArcGisDayProduct` established).
      let tuples;
      // WR-01/WR-02: true only on the hard-failure arm below — no fresh body AND no cached
      // body to fall back on. It distinguishes "the fetch did not happen" from "the fetch
      // happened and every day came back NoData", which produce an identical empty
      // `resolvedDays` but are entirely different diagnoses and must not share the D-04
      // branch's one-shot log budget.
      let fetchUnavailable = false;
      if (fetchResult.data === null && fetchResult.cachedResult !== null) {
        tuples = this._heatRiskTuplesFromCache(fetchResult.cachedResult);
      } else if (fetchResult.data !== null) {
        const raw = this._zipHeatRiskCatalog(fetchResult.data);
        if (raw === null) {
          // D-06: a Values/features length mismatch abandons HeatRisk for this poll — the
          // seeded all-null block is left untouched, never partially filled.
          const body = fetchResult.data;
          const featuresLen = body && body.catalogItems && Array.isArray(body.catalogItems.features)
            ? body.catalogItems.features.length : "unknown";
          const valuesLen = body && body.properties && Array.isArray(body.properties.Values)
            ? body.properties.Values.length : "unknown";
          anyStale = true;
          if (!this._loggedHeatRiskValuesMismatch) {
            this._loggedHeatRiskValuesMismatch = true;
            Log.error(
              "MMM-SPCOutlook _runHeatRiskProduct: Values/features length mismatch " +
              "(features=" + featuresLen + ", Values=" + valuesLen + "); abandoning HeatRisk for this poll"
            );
          }
          return { payload, anyStale, gridTuples, idpFiledate: newestFiledate };
        }
        const deduped = this._dedupeHeatRiskByValidTime(raw);
        // _cacheHeatRiskTuples both writes the clock-independent cache entry AND returns
        // the exact whitelisted array it wrote, so this branch and the cache-hit branch
        // above converge on the identical shape without a second parsing pass.
        tuples = this._cacheHeatRiskTuples(url, fetchResult, deduped);
      } else {
        // Hard failure: no fresh body, no cached body. fetchGeoJsonCached has already
        // logged the URL and the cause, and has already set fetchResult.failed (so
        // anyStale is set above) — there is nothing this runner can add except a wrong
        // diagnosis.
        tuples = [];
        fetchUnavailable = true;
      }

      // HEAT-01/HEAT-02: bucket by idp_validtime, sorted ascending first so the mapping is
      // deterministic and reviewable — the day key itself comes from the offset
      // arithmetic, never from array position. Under no circumstance is the response's
      // top-level scalar reading, the first element of its per-day array, or its
      // tile-visibility flags read here to identify a day.
      const todayUtcMs = this._todayUtcMs();
      const sorted = tuples.slice().sort((a, b) => a.idpValidtime - b.idpValidtime);
      const presentDays = new Set();
      const resolvedDays = new Set();
      // WR-01: the tuples that actually landed inside this product's declared 1..row.days
      // span, collected here so the D-07 freshness check below can iterate THEM rather
      // than every deduped tuple. A leftover catalog item — yesterday's tile, day offset
      // 0, not yet rotated out of the mosaic — contributes nothing to the payload, so its
      // idp_filedate must not raise a badge about data the user is never shown. At an
      // hourly cadence and a 12h tolerance one un-rotated tile would otherwise light the
      // warning on every poll, permanently, which teaches the operator to ignore the one
      // indicator that is supposed to mean something.
      const inSpan = [];
      // WR-03: the idp_validtime already bucketed into each day key, so a SECOND, DIFFERENT
      // validtime landing on the same day is detectable. HEAT-04's dedupe only collapses
      // items sharing an EXACT idp_validtime; two distinct validtimes that round to one day
      // key (a 12:00Z tile and an 18:00Z tile, say) survive it and used to collide here
      // under last-write-wins by ascending validtime — silently replacing an Extreme with a
      // Little to No Risk. `_heatRiskDayOffset`'s own docstring names the 12:00Z alignment
      // this depends on and warns that a midnight-aligned validtime breaks it; the break is
      // no longer silent.
      const validtimeByDay = new Map();
      for (const t of sorted) {
        // Phase 18 D-01/MERGE-01: push every deduped tuple BEFORE the
        // `_todayUtcMs`-relative span filter below, and track its filedate. That filter
        // is relative to THIS runner's own clock anchor, but the Phase 18 grid's day 1
        // can start twelve hours before `_todayUtcMs` (during the 00Z-12Z part of a UTC
        // day, grid day 1 started at 12Z YESTERDAY) — so the exact tile that covers grid
        // day 1 is the one this filter discards as day offset 0. Dropping it here would
        // leave grid day 1 with no HeatRisk reading for twelve hours out of every
        // twenty-four: a false negative on a heat-safety product this project's value
        // statement forbids outright. 18-03 re-derives its own grid day from
        // `idpValidtime` against the SPC anchor instead of reusing `d` below.
        gridTuples.push({ idpValidtime: t.idpValidtime, category: t.category, idpFiledate: t.idpFiledate });
        if (typeof t.idpFiledate === "number" && Number.isFinite(t.idpFiledate) &&
            (newestFiledate === null || t.idpFiledate > newestFiledate)) {
          newestFiledate = t.idpFiledate;
        }

        const d = this._heatRiskDayOffset(t.idpValidtime, todayUtcMs);
        if (d < 1 || d > row.days) continue; // outside this product's declared span
        inSpan.push(t);
        presentDays.add(d);

        const priorValidtime = validtimeByDay.get(d);
        if (priorValidtime === undefined) {
          validtimeByDay.set(d, t.idpValidtime);
        } else if (priorValidtime !== t.idpValidtime) {
          // The alignment assumption that produced EVERY day key in this block has just
          // been shown not to hold, so the badge is about the whole block's attribution,
          // not only about this day. Flagged even when the two readings agree: the rule is
          // unreliable either way, and the next collision may not be so harmless.
          anyStale = true;
          if (!this._loggedHeatRiskDayCollision) {
            this._loggedHeatRiskDayCollision = true;
            Log.warn(
              "MMM-SPCOutlook _runHeatRiskProduct: two catalog items with different " +
              "idp_validtime values resolved to day " + d + " — the 12:00Z alignment " +
              "_heatRiskDayOffset depends on no longer holds; keeping the higher category"
            );
          }
        }

        if (typeof t.category === "number") {
          resolvedDays.add(d);
          // On a collision keep the MAXIMUM category, never the last written. Arrival
          // order is not evidence, and this project does not downgrade a severity on
          // its say-so: a false negative on a heat-safety product is the one outcome
          // the value statement forbids outright. Absent a collision `existing` is
          // always null and this is a plain assignment.
          const existing = payload["day" + d].category;
          const kept = (typeof existing === "number" && existing > t.category) ? existing : t.category;
          payload["day" + d] = {
            category: kept,
            text: row.valueToText[kept],
            color: row.valueToColor[kept]
          };
        }
        // A tuple with category: null leaves that day's seeded all-null entry in place —
        // D-04's "a NoData day is silence" applies automatically here, no extra branch.
      }

      // D-04/D-05: `resolvedDays.size === 0` covers BOTH "presentDays is empty" (no tile at
      // all resolved to a valid day — a total absence) and "presentDays is non-empty but
      // every present day is NoData" — D-05 explicitly folds the total-absence case into
      // this same D-04 branch and log guard, firing no separate gap log for it. If any day
      // resolved to a real 0-4, the identify call and the Mercator reprojection are
      // demonstrably working, so a NoData elsewhere is genuine data absence (15 D-04); if
      // NO day resolved, the module cannot distinguish an out-of-coverage location from a
      // systemic break — precisely HEAT-03's failure mode reading as "no heat risk
      // anywhere, forever" — and both warrant a signal. Accepted cost: a permanent warning
      // badge for a genuinely out-of-coverage deployment, the same trade 16 D-14 took.
      //
      // WR-02: gated on `!fetchUnavailable`. A hard fetch failure produces the same empty
      // `resolvedDays` as a genuine all-NoData response, and the branch used to fire for
      // both — emitting a data-CONTENT diagnosis for a NETWORK error, and worse, spending
      // `_loggedHeatRiskAllNoData` on it. The one-shot guard was then burned for the life
      // of the process, so the next genuine all-NoData poll — the systemic-break signal
      // this log exists to raise — logged nothing at all. A transient 503 permanently
      // disarming a safety diagnostic is the worst available trade, because the event that
      // disarms it is the one guaranteed to occur. The badge still goes up on both paths;
      // only the diagnosis and the budget are separated.
      if (resolvedDays.size === 0 && !fetchUnavailable) {
        anyStale = true;
        if (!this._loggedHeatRiskAllNoData) {
          this._loggedHeatRiskAllNoData = true;
          Log.warn(
            "MMM-SPCOutlook _runHeatRiskProduct: no day in this poll resolved a real category " +
            "(every present day was NoData, or no tile resolved to a valid day at all)"
          );
        }
      } else if (resolvedDays.size === 0) {
        // Hard fetch failure. Badge yes, diagnosis no: fetchGeoJsonCached already named the
        // URL and the cause, and the D-04 log above would misattribute it to data content.
        anyStale = true;
      } else {
        // D-05: gapDays are days 1..row.days that received no tuple at all (distinct from a
        // day that received a NoData tuple, which is D-04's silence above — a tile existing
        // with a NoData pixel and no tile existing at all are DIFFERENT causes, deliberately
        // not collapsed). A gap past the highest present day is a TAIL gap — silence, no
        // badge, consistent with routine mosaic rotation where the newest tile has not
        // landed yet. A gap before the highest present day (including Day 1) is an INTERIOR
        // gap — the sequence itself is broken, and a day is being attributed by a rule that
        // has just demonstrated it is unreliable; a missing Day 1 during a heat wave
        // rendering identically to a Day 1 with no heat risk violates this project's core
        // value statement ("no false negatives") directly.
        const maxPresent = Math.max(...presentDays);
        const interiorGaps = [];
        for (let d = 1; d < maxPresent; d++) {
          if (!presentDays.has(d)) interiorGaps.push(d);
        }
        if (interiorGaps.length > 0) {
          anyStale = true;
          if (!this._loggedHeatRiskSequenceGap) {
            this._loggedHeatRiskSequenceGap = true;
            Log.warn(
              "MMM-SPCOutlook _runHeatRiskProduct: interior or Day-1 gap in the day sequence " +
              "at day(s) " + interiorGaps.join(",") + " (a tail gap past the last present day is not flagged)"
            );
          }
        }
      }

      // D-07: maxDataAgeHours applied PER surviving deduped item, never off a single
      // idp_filedate read from the first item — live capture shows a ~15-minute spread
      // across the seven items in one poll, unlike the Hazards Outlook where idp_filedate
      // is uniform within a layer. WR-01: over `inSpan`, not `sorted` — see the comment on
      // inSpan's declaration above.
      for (const t of inSpan) {
        if (typeof t.idpFiledate === "number" && Number.isFinite(t.idpFiledate) &&
            (this._nowMs() - t.idpFiledate) > row.maxDataAgeHours * 60 * 60 * 1000) {
          anyStale = true;
          if (!this._loggedHeatRiskDataAge) {
            this._loggedHeatRiskDataAge = true;
            // 16 D-15's asymmetry, carried forward verbatim: this raises anyStale but is
            // deliberately EXCLUDED from _staleAsOf (never routed through the oldest-stale-entry tracker)
            // — _staleAsOf describes fetch age, not data age, and an hours-old WPC file
            // must not make the badge speak for SPC data fetched minutes ago.
            Log.warn(
              "MMM-SPCOutlook _runHeatRiskProduct: a surviving item exceeded maxDataAgeHours=" +
              row.maxDataAgeHours + "h; _staleAsOf intentionally not updated (fetch age, not data age)"
            );
          }
        }
      }

      return { payload, anyStale, gridTuples, idpFiledate: newestFiledate };
    } catch (err) {
      anyStale = true;
      Log.error(
        "MMM-SPCOutlook _runHeatRiskProduct: fetch/parse/evaluate failed, leaving the day block at no reading",
        err
      );
      return { payload, anyStale, gridTuples, idpFiledate: newestFiledate };
    }
  },

  /**
   * Discovery strategies for `kml-advisory` registry rows, keyed by `row.discovery`.
   * Each strategy fetches whatever index document names the row's candidate member
   * KMZs and returns `{ urls, failed }` — `urls` normalized and allowlisted, `failed`
   * true when the index itself could not be fetched or parsed. A strategy never
   * throws; a failure is reported through `failed` so `_runKmlAdvisoryRow` can fold it
   * into D-04's staleness signal.
   */
  _advisoryDiscovery: {
    // SPC's ActiveMD.kmz is itself a KMZ whose sole .kml member is an index of
    // NetworkLink hrefs, one per active Mesoscale Discussion.
    async "spc-active-index"(row) {
      try {
        const buffer = await this.fetchBinBuffer(row.discoveryUrl);
        const kml = this.extractSoleKmlEntry(buffer);
        const hrefs = this.parseNetworkLinks(kml);
        const urls = [];
        for (const href of hrefs) {
          const normalized = normalizeAdvisoryUrl(href, row.allowedHost);
          if (normalized === null) {
            // WR-06: keep the exact wording an operator's existing log expectations
            // and any log grep already match.
            Log.error("MMM-SPCOutlook: refusing off-host NetworkLink href " + JSON.stringify(href));
            continue;
          }
          urls.push(normalized);
        }
        // The generic cap in _runKmlAdvisoryRow keeps the HEAD of whatever order a strategy
        // returns, and states as a contract that "each strategy is responsible for handing
        // back a meaningfully ordered list". This one did not satisfy it: NetworkLink
        // document order is whatever SPC's index happens to emit, so the cap kept an
        // arbitrary 60 and silently dropped the rest — a contract asserted by comment
        // against code that did not meet it, which is the shape that lets the next reader
        // trust it wrongly. Sorting by MD number and truncating here mirrors
        // wpc-mpd-listing, so the cap downstream is a no-op for this strategy rather than a
        // second, contradictory heuristic, and what survives a truncation is the newest
        // discussions rather than the ones SPC listed first. An href whose filename carries
        // no parseable number sorts to -1, i.e. is dropped first.
        //
        // Practical exposure is low (SPC rarely has more than ~15 concurrent MDs) — the
        // point is that the contract and the code now say the same thing.
        const mdNumberOf = (u) => {
          const m = /md(\d{1,6})\.kmz$/i.exec(u.split("/").pop() || "");
          return m ? Number(m[1]) : -1;
        };
        urls.sort((a, b) => mdNumberOf(a) - mdNumberOf(b));
        if (urls.length > ADVISORY_MAX_CANDIDATES) {
          Log.error(`MMM-SPCOutlook ${row.id}: ${urls.length} NetworkLink candidates; keeping the ` +
                    `${ADVISORY_MAX_CANDIDATES} highest-numbered`);
          return { urls: urls.slice(-ADVISORY_MAX_CANDIDATES), failed: true };
        }
        return { urls, failed: false };
      } catch (err) {
        Log.error(`MMM-SPCOutlook ${row.id}: discovery index fetch/parse failed`, err);
        return { urls: [], failed: true };
      }
    },

    // WPC publishes no ActiveMD.kmz-equivalent index for MPD (RESEARCH.md Pitfall 2) — only a
    // flat, unfiltered Apache "Index of" listing of every MPD issued this year (1000+ entries),
    // including prior-year stragglers. Discovery here parses the raw directory-listing HTML into
    // candidate URLs instead of following NetworkLinks.
    async "wpc-mpd-listing"(row) {
      let res;
      try {
        // WR-02: `size` is the only bound here that constrains *memory*. The length check
        // below runs after res.text() has already materialised the whole body, so on its
        // own it bounds the regex scan and nothing else; node-fetch's streaming cap rejects
        // an oversized listing before it is ever fully read. The post-hoc check is kept as
        // the fallback for a runtime that ignores `size`.
        res = await this._fetch(row.discoveryUrl, withTimeout({
          redirect: "error", size: ADVISORY_MAX_LISTING_BYTES
        }));
      } catch (err) {
        Log.error(`MMM-SPCOutlook ${row.id}: discovery listing fetch failed`, err);
        return { urls: [], failed: true };
      }
      if (!res.ok) {
        Log.error(`MMM-SPCOutlook ${row.id}: discovery listing fetch failed: ${res.status}`);
        return { urls: [], failed: true };
      }

      let text;
      try {
        text = await res.text();
      } catch (err) {
        Log.error(`MMM-SPCOutlook ${row.id}: discovery listing body could not be read`, err);
        return { urls: [], failed: true };
      }
      // This is remote HTML being parsed for outbound fetch targets, so the body bound is
      // a security control, not tidiness (T-15-24). The live listing is ~139 KB.
      if (typeof text !== "string" || text.length > ADVISORY_MAX_LISTING_BYTES) {
        Log.error(`MMM-SPCOutlook ${row.id}: discovery listing body exceeds the ` +
                  `${ADVISORY_MAX_LISTING_BYTES}-byte bound, refusing`);
        return { urls: [], failed: true };
      }

      const now = Date.now();
      const FRESH_WINDOW_MS = 48 * 60 * 60 * 1000;
      // Captures a bare filename (re-validated against MPD_FILENAME_PATTERN below) plus its
      // optional Last-Modified timestamp column. `MPD_latest.kmz` (a single pointer, insufficient
      // for MPD-02 on its own) and the yearly archive folder (e.g. "2025/", by definition not
      // current) never match this href shape and are excluded structurally — do not widen this
      // pattern to admit them.
      const ANCHOR_RE = /<a\s+href="(MPD_\d+_final\.kmz)"[^>]*>[^<]*<\/a>\s*(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})?/gi;

      const seen = new Set();
      let urls = [];
      let match;
      while ((match = ANCHOR_RE.exec(text)) !== null) {
        const filename = match[1];
        const timestamp = match[2];
        // Defence in depth: the capture group above is already anchored, but a hostile listing
        // could still smuggle a value the regex over-accepted; re-check against the exported
        // pattern before this filename is ever joined to a URL.
        if (!MPD_FILENAME_PATTERN.test(filename)) continue;
        if (seen.has(filename)) continue;
        seen.add(filename);

        // Fetch-count optimization ONLY (Open Question 2) — never the sole inclusion/exclusion
        // gate. A candidate is dropped here only when its listing timestamp both parses AND is
        // genuinely outside the 48h window; an absent or unparseable timestamp always fails OPEN
        // (kept). Tightening this to "no timestamp = excluded" would reintroduce the exact
        // false-negative class this project exists to prevent — the authoritative currency
        // decision is always each candidate's own ValidEndTi, applied unconditionally in
        // `_runKmlAdvisoryRow`'s mpd prepareEntry hook, never this pre-filter.
        if (timestamp) {
          const parsedMs = Date.parse(timestamp.replace(" ", "T") + "Z");
          if (Number.isFinite(parsedMs) && (now - parsedMs) > FRESH_WINDOW_MS) continue;
        }

        // T-15-23: the href is never treated as a URL. Only a filename already re-validated
        // against MPD_FILENAME_PATTERN is joined to the row's own known discoveryUrl, so a
        // remote-supplied absolute URL or a `../` traversal segment can never become a fetch
        // target. normalizeAdvisoryUrl re-checks the joined result anyway, as defence in depth.
        let joined;
        try {
          joined = new URL(filename, row.discoveryUrl).toString();
        } catch (_err) {
          continue;
        }
        const normalized = normalizeAdvisoryUrl(joined, row.allowedHost);
        if (normalized === null) {
          Log.error(`MMM-SPCOutlook ${row.id}: refusing unroutable listing candidate ` + JSON.stringify(filename));
          continue;
        }
        urls.push(normalized);
      }

      let failed = false;
      // Degenerate case: the live directory holds 1000+ entries. If WPC's listing format ever
      // changes, every timestamp becomes unparseable and the fail-open rule above would otherwise
      // queue 1000+ KMZ fetches in one poll. This is an explicitly degraded heuristic, not a
      // selection rule, and the run is flagged stale so a truncated answer surfaces as ⚠ rather
      // than as a confident list.
      //
      // WR-01: the tail of *document* order is not the newest. Apache sorts the listing as
      // text, and MPD numbers run 1..1200+ within a season, so across a digit-count boundary
      // "MPD_999_final.kmz" sorts AFTER "MPD_1200_final.kmz" — the old `slice(-N)` on document
      // order therefore fetched the 60 LOWEST-numbered files, the oldest MPDs of the season,
      // and never the currently active ones, in the exact scenario this branch exists for.
      // Sorting numerically on the captured filename number first makes the tail mean what the
      // comment always claimed. A filename that somehow reaches here without a parseable number
      // sorts to -1, i.e. is dropped first.
      if (urls.length > ADVISORY_MAX_CANDIDATES) {
        Log.error(`MMM-SPCOutlook ${row.id}: listing format not understood, ${urls.length} ` +
                  `candidates survived the pre-filter; truncating to the ${ADVISORY_MAX_CANDIDATES} ` +
                  `highest-numbered`);
        const numberOf = (u) => {
          const m = MPD_FILENAME_PATTERN.exec(u.split("/").pop());
          return m ? Number(m[1]) : -1;
        };
        urls = urls.sort((a, b) => numberOf(a) - numberOf(b)).slice(-ADVISORY_MAX_CANDIDATES);
        failed = true;
      }

      return { urls, failed };
    }
  },

  /**
   * Fetch, allowlist, decode and contain-test every candidate member KMZ for one
   * `kml-advisory` registry row (spcMD, mpd), returning the rows that cover the
   * location and whether the run degraded.
   * @param row - a PRODUCT_REGISTRY row of kind "kml-advisory"
   * @param lat - latitude of the user location
   * @param lon - longitude of the user location
   * @param productToggles - this request's own toggle snapshot (WR-13), read via
   *   `row.configFlag` rather than the helper-global `this._products`
   * @returns { entries, anyStale } — `entries` is `row.toEntry(...)`'s non-null
   *   results; D-04's two halves both apply: a failed index fetch, an unroutable
   *   `row.discovery`, a truncated candidate list, or any per-candidate fetch/parse
   *   failure sets `anyStale = true`, but a clean run that legitimately finds zero
   *   advisories does NOT — "none active" is the normal state most of the year and
   *   is a real answer, not staleness.
   */
  async _runKmlAdvisoryRow(row, lat, lon, productToggles) {
    if (!productToggles[row.configFlag]) {
      return { entries: [], anyStale: false };
    }

    const strategy = this._advisoryDiscovery[row.discovery];
    if (typeof strategy !== "function") {
      Log.error(`MMM-SPCOutlook ${row.id}: unknown discovery strategy "${row.discovery}"`);
      return { entries: [], anyStale: true };
    }

    const { urls, failed } = await strategy.call(this, row);
    let anyStale = failed;

    // ADVISORY_MAX_CANDIDATES bounds how many KMZs are *fetched* per poll — a resource control
    // only. It must never be repurposed into a cap on how many entries are *returned*: per D-07
    // there is no cap on the advisory band, so every candidate that is fetched, contains the
    // location and is still valid is returned below.
    let candidates = urls;
    // WR-01: this generic cap keeps the HEAD of whatever order the discovery strategy
    // returned, which is only defensible because each strategy is responsible for handing
    // back a meaningfully ordered list. Both shipped strategies now sort numerically and
    // truncate to ADVISORY_MAX_CANDIDATES themselves — `wpc-mpd-listing` on the listing's
    // filename number, `spc-active-index` on the MD number — so for both of them this
    // slice is a no-op rather than a second, contradictory heuristic. It stays as the
    // backstop for a future strategy, which must do the same; note that keeping the HEAD
    // here and the TAIL there is not a contradiction, because a strategy hands back a list
    // it has already truncated to its own most-relevant end.
    if (candidates.length > ADVISORY_MAX_CANDIDATES) {
      Log.error(`MMM-SPCOutlook ${row.id}: ${candidates.length} candidates exceeds the ` +
                `${ADVISORY_MAX_CANDIDATES}-candidate cap; truncating`);
      candidates = candidates.slice(0, ADVISORY_MAX_CANDIDATES);
      anyStale = true;
    }

    const entries = [];
    // CR-02: contain per candidate. An index is fetched, then its member KMZs are
    // fetched seconds to minutes later, so a member that expires in that window
    // 404s. One unreadable advisory must never discard its siblings. Looping over every
    // candidate here (rather than stopping at the first hit) is what satisfies MPD-02's "all
    // concurrently active" requirement — checkInPolygon's single containing-feature return per
    // candidate is sufficient because the live MPD KMZ carries a single Polygon Placemark; the
    // multi-advisory collection happens at this loop's level, not inside checkInPolygon.
    for (const url of candidates) {
      try {
        const buffer = await this.fetchBinBuffer(url);
        const kml = this.extractSoleKmlEntry(buffer);
        const gj = this.kmlToGeoJson(kml);
        // The containing feature, not features[0] — see checkInPolygon.
        const hit = this.checkInPolygon(gj, lat, lon);
        if (!hit) continue;

        // MPD-04/MPD-03/D-06: mpd is the only kml-advisory row needing a per-candidate validity
        // gate and description-CDATA labelling; spcMD supplies no ctx and keeps today's
        // behaviour unchanged (its toEntry reads feature.properties.name directly).
        let ctx = {};
        if (row.id === "mpd") {
          const prepared = this._prepareMpdEntry(hit, url);
          if (prepared.drop) continue;
          ctx = prepared.ctx;
        }

        const entry = row.toEntry(hit, ctx);
        if (entry === null) {
          // CR-03: dropping an advisory that DOES cover the location is a degrade, not a
          // quiet day — the user is inside it and sees nothing. Same reasoning as the
          // per-candidate catch below and the seven other degrade sites in this file:
          // silence here is indistinguishable from "no advisories active" (D-04, CV-01).
          Log.error(`MMM-SPCOutlook: ${row.id} covers the location but carries no name: ${url}`);
          anyStale = true;
          continue;
        }
        entries.push(entry);
      } catch (err) {
        Log.error(`MMM-SPCOutlook: skipping unreadable ${row.id} ${url}`, err);
        // A candidate fetch/parse failure is a degrade, not a quiet day (D-04) — the
        // current code logged and continued with no staleness signal, so a run in
        // which every member KMZ 404s was indistinguishable from a genuine all-clear.
        anyStale = true;
      }
    }

    return { entries, anyStale };
  },

  /**
   * MPD-only hook for `_runKmlAdvisoryRow`'s per-candidate loop: applies MPD-04's validity gate
   * and reads MPD-03's hazard-type/number labels out of the description CDATA. `row.id ===
   * "mpd"` branches into this rather than every `kml-advisory` row carrying it, so `spcMD` is
   * structurally unaffected.
   * @param feature - the containing feature `checkInPolygon` returned for this candidate
   * @param url - the candidate's fetch URL, used only for diagnostic logging
   * @returns `{ drop: true, reason }` to discard the candidate, or `{ ctx }` where `ctx.number`
   *   and `ctx.hazardType` feed `PRODUCT_REGISTRY.mpd.toEntry(feature, ctx)`.
   */
  _prepareMpdEntry(feature, url) {
    const html = this.mpdDescriptionHtml(feature);
    const issueTime = this.extractMpdField(html, "IssueTime");
    const validEndTi = this.extractMpdField(html, "ValidEndTi");
    const validEnd = (issueTime !== null && validEndTi !== null)
      ? this.parseMpdValidEnd(issueTime, validEndTi)
      : null;

    // MPD-04: this is the ONLY mechanism that decides currency. The filename number and the
    // discovery listing's Last-Modified timestamp must never appear anywhere in this decision —
    // both are cost/label conveniences, never selection criteria.
    if (validEnd instanceof Date && validEnd.getTime() <= Date.now()) {
      return { drop: true, reason: "expired" };
    }
    if (validEnd === null) {
      // Fail open per this plan's decision record: IssueTime/ValidEndTi could not be resolved
      // (unparseable IssueTime, unknown timezone abbreviation, malformed/missing ValidEndTi), so
      // the candidate is kept rather than discarded — showing an expired MPD is a minor
      // annoyance, hiding an active one is the false-negative class this project exists to
      // prevent.
      Log.error(`MMM-SPCOutlook: mpd validity window unparseable, keeping candidate: ${url}`);
    }

    const hazardType = this.mpdHazardType(feature);
    if (hazardType === null) {
      // D-06: the user is inside an active precipitation discussion; omitting it for a missing
      // MPDType would be the same false-negative class WR-06 already fixed for SPC MD's "covers
      // the location but carries no name" case.
      Log.error(`MMM-SPCOutlook: mpd covers the location but has no parseable hazard type: ${url}`);
    }

    let number = this.mpdNumber(feature);
    // CR-03: "unreadable" is any value toEntry will refuse, not just `null`. extractMpdField
    // returns `""` — a successful match on an empty trimmed <td> — for a present-but-blank
    // `<td>MPDNumber</td><td></td>`, and `"" !== null` skipped this fallback entirely, so
    // toEntry's `if (!number) return null` silently dropped an MPD covering the user. The
    // guard now matches the condition the consumer actually applies.
    if (typeof number !== "string" || number.trim() === "") {
      // The filename number is acceptable as a *label* of last resort so a covering MPD is
      // never dropped merely for an unreadable MPDNumber field — it remains forbidden as a
      // *selection* criterion, which is why this fallback runs only after the ValidEndTi gate
      // above has already decided currency.
      const m = MPD_FILENAME_PATTERN.exec(url.split("/").pop());
      if (m) {
        number = m[1];
        Log.error(`MMM-SPCOutlook: mpd MPDNumber unparseable, falling back to filename number: ${url}`);
      } else {
        number = null;
      }
    }

    return { ctx: { number, hazardType } };
  },

  /**
   * Record which location this helper is serving, and say so loudly the first time a
   * second distinct one appears.
   * @param payload - the GET_SPC_DATA payload, whose lat/lon are the requester's config
   *
   *   MagicMirror runs one node_helper per module TYPE and sendSocketNotification
   *   broadcasts to every frontend instance of that type, so two configured
   *   MMM-SPCOutlook instances share this object, this _geoJsonCache and this in-flight
   *   guard. Both ends now carry the requester's coordinates (see the emit below and the
   *   frontend's address check) so a payload computed for Boston can no longer be
   *   rendered by an instance configured for Norman — a user watching the wrong city's
   *   tornado risk has no way to tell, which makes it the worst failure this module has.
   *
   *   What the address check cannot fix is that the in-flight guard drops the second
   *   instance's request outright, so that instance receives nothing rather than
   *   something wrong. Making the guard per-location would let two chains interleave, and
   *   several helper-globals (_oldestStaleAt, _unusableFeatureCount, _cachedLat/_cachedLon
   *   and the shared cache the location change clears) are correct only because the guard
   *   makes interleaving unreachable. So multiple instances at distinct coordinates are
   *   not supported, it is said here in the log and in README.md, and this warning is what
   *   turns a silently wrong display into a diagnosable configuration error.
   */
  _noteRequestLocation(payload) {
    if (!payload) return;
    const key = payload.lat + "," + payload.lon;
    if (this._requestLocation === null || this._requestLocation === undefined) {
      this._requestLocation = key;
      return;
    }
    if (this._requestLocation !== key && !this._loggedMultiInstance) {
      this._loggedMultiInstance = true;
      Log.warn("MMM-SPCOutlook: a second MMM-SPCOutlook instance is configured for " + key +
               " while this helper is already serving " + this._requestLocation +
               ". MagicMirror runs one node_helper per module type, so only the first location is " +
               "polled; the other instance will not update. Multiple instances at distinct " +
               "coordinates are not supported.");
    }
  },

  // Called when the front-end (MMM-SPCOutlook.js) sends a socket notification
  socketNotificationReceived: async function(notification, payload) {
    if (notification === "GET_SPC_DATA") {
      // PERF-03/D-17: the backend-interval bracket — GET_SPC_DATA received to
      // SPC_DATA_RESULT emitted. Captured before the in-flight guard so the elapsed value
      // for the poll that actually runs is measured from the instant this notification
      // arrived, not from whenever the guard happened to let it through. An early return on
      // an in-flight poll never reaches the elapsed computation below, so it correctly
      // contributes nothing — no result is emitted on that path.
      const t0 = this._nowMs();
      // Before the in-flight guard, which would otherwise drop a second instance's request
      // without ever seeing where it was for.
      this._noteRequestLocation(payload);
      // CR-03: the in-flight guard the withTimeout comment above already identified as
      // missing. Without it a poll whose wall-time exceeds updateInterval — roughly
      // (20-26 product fetches + 1 MD index + N MD fetches) x 15 s on a degraded network —
      // stacks a second chain behind the first. The chains then finish in whatever order
      // the network decides, and the frontend accepted whichever landed last, so a slow
      // chain that read SLGT at 15:58 could overwrite a fast chain that read MDT at 16:03.
      // Nothing marks that payload stale (every fetch in it succeeded, just earlier), so
      // the downgrade is silent — the false-negative class this project exists to prevent.
      if (this._inFlight) {
        Log.info("MMM-SPCOutlook: poll already in flight, skipping this tick");
        return;
      }
      this._inFlight = true;
      try {
        const { lat, lon, extended, updateInterval, proximityWeighting, products } = payload;
        // WR-05: the only check used to be `=== undefined`, so anything else was stored
        // verbatim. `0` makes _isWithinStaleWindow compute intervalMs = 0, so
        // `(Date.now() - timestamp) < 0` is never true and no stale fallback ever fires —
        // every transient blip becomes a hard failure. A non-numeric value yields NaN, and
        // `x < NaN` is likewise always false: the same silent disablement, from a typo.
        // Validate the type and the range, and fall back to the documented default.
        const requestedInterval = Number(updateInterval);
        if (!Number.isFinite(requestedInterval) || requestedInterval < 1) {
          if (!this._loggedIntervalFallback) {
            Log.warn("MMM-SPCOutlook: invalid updateInterval " + JSON.stringify(updateInterval) +
                     ", defaulting to 60 minutes");
            this._loggedIntervalFallback = true;
          }
          this._updateInterval = 60;
        } else {
          this._updateInterval = requestedInterval;
        }
        this._proximityWeighting = proximityWeighting === true;
        // Defensive re-default for per-product toggles (CFG-01, D-06), mirroring the
        // _updateInterval / _proximityWeighting handling above — Phases 15-17 add one
        // `=== true` line per new registry row here.
        // WR-16: every registry row contributes its own `configFlag`, so a new product row
        // needs no edit here — this is the read the row's own comment documents.
        // WR-13: snapshot the toggles into a local and pass them down the chain. The
        // helper-global field is written here but was not read until ~20 awaits later at the
        // ERO gate; with no in-flight guard, a second GET_SPC_DATA arriving mid-flight made
        // the first chain read the second request's toggles — and because MagicMirror shares
        // one node_helper per module *type*, two configured instances overwrote each other's
        // on every poll. The field is still assigned for callers that reach getSpcOutlook
        // without an explicit snapshot.
        const productToggles = this._productToggles(products);
        this._products = productToggles;
        // CR-04: MagicMirror does not await this handler, so an unhandled rejection here
        // means sendSocketNotification is never reached and the frontend stays on
        // "Loading SPC Outlook..." forever — every later interval tick takes the identical
        // path, so it never self-heals. Advisory fetches (SPC MD, WPC MPD) now run inside
        // getSpcOutlook's own try/catch via `_runKmlAdvisoryRow`, which never throws, so no
        // separate containment is needed here for them.
        let outlook;
        try {
          outlook = await this.getSpcOutlook(lat, lon, extended, productToggles);
        } catch (err) {
          Log.error("MMM-SPCOutlook: outlook fetch failed", err);
          outlook = { error: err.toString() };
        }
        // Send the results back to your front-end module. The second element is a
        // monotonic sequence number (CR-03): it is what lets the frontend discard a
        // chain that finished after a newer one, so a late payload can never overwrite
        // a fresher risk. The increment is guarded so a caller that reaches this handler
        // without start() (offline probes) still emits a usable number.
        //
        // Phase 15 (D-03): the socket used to carry a third `md` element with the
        // separate mesoscale-discussion list; that element is retired now that
        // advisories live inside `outlook.advisories.{spcMD,mpd}`, so `seq` moved from
        // index 2 to index 1. Index 2 now carries a metadata object rather than a list.
        // The two ends of this contract — this emit and MMM-SPCOutlook.js's
        // `socketNotificationReceived` — must always change together: the frontend's guard
        // fails open (accepts everything) when it reads a non-number, so a mismatch between
        // the two is silent, not a crash.
        //
        // `epoch` is the generation `seq` belongs to (see start()). Without it a helper
        // restart, which resets the counter to 0 under a browser that never reloaded,
        // froze the display permanently. `?? null` keeps a caller that reaches this handler
        // without start() (offline probes) emitting a well-formed payload.
        //
        // `lat`/`lon` are the REQUESTER's coordinates, echoed verbatim from the request that
        // produced this outlook. sendSocketNotification broadcasts to every frontend
        // instance of this module type, and the sequence guard is location-agnostic, so
        // without this an instance configured for one city accepted and rendered the
        // outlook computed for another — silently, with no way for the viewer to tell.
        // Echoed rather than reformatted so the frontend's comparison is against the exact
        // values it sent (see _noteRequestLocation).
        this._seq = (this._seq || 0) + 1;
        // PERF-03/D-17: the backend-interval bracket's other end. The existing `_inFlight`
        // try/finally above already brackets exactly this span; no new try/finally is added.
        const backendIntervalMs = this._nowMs() - t0;
        this.sendSocketNotification("SPC_DATA_RESULT",
                                    [outlook, this._seq, { epoch: this._epoch ?? null, lat, lon }]);
        // PERF-03/D-18: the cold-start timing summary, logged exactly once per process
        // right after the first result was actually sent — never on an in-flight skip
        // (which returns above and never reaches this line at all), so that path can never
        // consume this guard on a poll that measured nothing. No config flag (D-18).
        if (!this._loggedColdStartTiming) {
          this._loggedColdStartTiming = true;
          const wallClockMs = this._nowMs() - (this._processStartMs ?? this._nowMs());
          // A hard failure inside getSpcOutlook's own catch never reaches its
          // `_lastPollTimings` assignment (D-17's helper-global), so this first poll can
          // still fall through here with nothing recorded yet — fall back to an empty
          // breakdown rather than throwing on a null read.
          const timings = this._lastPollTimings || { memberTimings: {}, slowest: null };
          Log.info("MMM-SPCOutlook: cold-start timing -- backend interval " + backendIntervalMs +
                   "ms (GET_SPC_DATA received -> SPC_DATA_RESULT emitted); " + wallClockMs +
                   "ms since process start (module-load to first result sent)");
          Log.info("MMM-SPCOutlook: cold-start per-product breakdown " + JSON.stringify(timings.memberTimings));
          Log.info("MMM-SPCOutlook: cold-start slowest source " +
                   (timings.slowest ? timings.slowest.id + " (" + timings.slowest.ms + "ms)" : "none"));
          Log.info("MMM-SPCOutlook: cold-start timing is logged once per process start (D-18), gated by " +
                   "no config flag; the target-hardware (Raspberry Pi) figure is a UAT item tracked " +
                   "separately from this phase (D-19)");
        }
      } finally {
        this._inFlight = false;
      }
    }
  },

  /**
   * The single transport seam for every outbound request in this file.
   * @param url - the URL to fetch
   * @param options - fetch options, normally the result of withTimeout()
   * @returns the fetch Response
   *
   *   WR-09: `fetch` above is a module-scoped const wrapping a dynamic import, so nothing
   *   outside this module could replace it. The offline probe therefore had to stub
   *   `fetchGeoJsonCached` wholesale, which meant the 304-with-no-entry guard, rejectBody's
   *   stale fallback, parseBody's contained JSON.parse, the ETag/hash mode split and
   *   _isWithinStaleWindow — this phase's headline resilience work — were executed by no
   *   scenario at all, and the only branch the probe could reach was one the real function
   *   cannot emit. Routing every request through one overridable method puts the seam at
   *   the HTTP response instead of at the function that interprets it.
   */
  _fetch(url, options){
    return fetch(url, options);
  },

  /**
   * Fetch a binary body (an advisory member KMZ) under a hard byte bound.
   * @param url - an already-allowlisted advisory member URL
   * @param maxBytes - refusal threshold; live MPD/MD KMZs are single-digit KB, so
   *   ADVISORY_MAX_BODY_BYTES is three orders of magnitude of headroom
   *
   *   WR-02: this had no size bound at all, while its sibling listing fetch documents the
   *   equivalent control as "a security control, not tidiness". It is called up to
   *   ADVISORY_MAX_CANDIDATES times per poll on URLs whose *paths* come from remote
   *   documents (a NetworkLink href, a directory listing), so a hostile or malfunctioning
   *   upstream serving a multi-gigabyte body OOM-kills the MagicMirror process on a Pi.
   *
   *   Three layers, because each is defeatable alone: `size` is node-fetch's own streaming
   *   cap and the only one that bounds *memory* (it rejects mid-stream, so an oversized body
   *   is never fully materialised); the Content-Length check refuses an honestly declared
   *   oversized body before any byte is read; the post-read length check catches a runtime
   *   whose fetch ignores `size`, so the bound can never be silently absent. Every refusal
   *   throws, and the throw is contained per candidate by _runKmlAdvisoryRow's catch.
   */
  async fetchBinBuffer(url, maxBytes = ADVISORY_MAX_BODY_BYTES){
    // WR-06: node-fetch follows redirects by default, so a 302 on an allowlisted URL
    // would walk straight off the allowlist. Refuse instead — the throw is contained per
    // candidate by _runKmlAdvisoryRow's per-iteration catch.
    const res = await this._fetch(url, withTimeout({ redirect: "error", size: maxBytes }));
    if(!res.ok) throw new Error(`Failed to fetch ${url}: ${res.status}`);
    const declared = res.headers && typeof res.headers.get === "function"
      ? Number(res.headers.get("content-length"))
      : NaN;
    if (Number.isFinite(declared) && declared > maxBytes) {
      throw new Error(`Refusing oversized body for ${url}: declared ${declared} > ${maxBytes} bytes`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > maxBytes) {
      throw new Error(`Refusing oversized body for ${url}: read ${buf.length} > ${maxBytes} bytes`);
    }
    return buf;
  },

  /**
   * Read the sole `.kml` member out of a remote KMZ archive, without relying on the member
   * name being derivable from the URL. SPC MD's member KMZ and KML share the URL-derived
   * stem (MD2108.kmz -> MD2108.kml), but WPC MPD's member is always named `doc.kml`
   * regardless of the URL, so a shared `kml-advisory` runner needs a "find the sole `.kml`
   * entry" primitive rather than a filename guess. A pair of helpers that did guess the
   * name (`kmzToKmlfilename` and `extractKmlFromKmz`) lived here until this function
   * superseded them; they were deleted once they had no caller left.
   * @param buffer - the downloaded KMZ bytes, remote and attacker-influenceable
   * @returns the `.kml` entry's contents as a string
   *
   *   Hardened against a hostile archive, since the buffer is remote: refuses an archive
   *   reporting more than 32 entries, refuses an entry whose name contains a `..` segment
   *   or begins with `/` or a drive letter (zip-slip shape — the selected name is logged
   *   downstream and could otherwise be used to forge a log line), and refuses an entry
   *   whose declared uncompressed size is outside (0, 8 MB] — the upper bound because live
   *   samples are ~3 KB, so it is three orders of magnitude of headroom, and the lower
   *   bound because a declared size of zero is what switches adm-zip's inflation clamp
   *   off (see the block comment at the size checks). Each refusal throws with a message
   *   naming the reason, so the caller's per-candidate catch (CR-02) logs it and moves on
   *   to the next candidate rather than losing the whole run.
   */
  extractSoleKmlEntry(buffer){
    const ZIPper = new ZIP(buffer);
    const entries = ZIPper.getEntries();
    if (entries.length > 32) {
      throw new Error(`KMZ downloaded has too many entries (${entries.length} > 32)`);
    }
    const entry = entries.find((e) => /\.kml$/i.test(e.entryName));
    if (!entry) throw new Error("KMZ downloaded has no .kml entry");

    const name = entry.entryName;
    if (name.includes("..") || name.startsWith("/") || /^[A-Za-z]:/.test(name)) {
      throw new Error(`KMZ downloaded has an unsafe entry name: ${JSON.stringify(name)}`);
    }
    // `entry.header.size` is the DECLARED uncompressed size from the ZIP central
    // directory, a field a hostile archive sets independently of what its deflate stream
    // actually inflates to — but with adm-zip it is also the number the library clamps
    // inflation to (`maxOutputLength`, see KMZ_MAX_KML_BYTES above), so bounding it bounds
    // peak memory rather than merely bounding what is kept. Declaring a small size does
    // not buy the attacker an unbounded inflation; it buys a refusal from zlib.
    //
    // With ONE exception, which is why the lower bound below exists rather than being
    // tidiness: adm-zip applies `maxOutputLength` only when the declared size is greater
    // than zero (methods/inflater.js), so an entry declaring ZERO bytes is inflated with
    // no bound at all. That input passes an upper-bound check trivially, and it also
    // passes any declared:compressed ratio test, since the ratio is zero. Measured against
    // the installed adm-zip: a 199 KB archive — comfortably inside ADVISORY_MAX_BODY_BYTES
    // — whose sole member declares 0 bytes inflated 200 MB into memory before adm-zip
    // rejected it on a checksum, and at the full 8 MB body cap the same shape reaches
    // gigabytes. On this project's target hardware (a Raspberry Pi) that is the process,
    // and with it the whole mirror. A .kml member that declares no content is useless to
    // us in any case: there is no KML to parse.
    const declared = entry.header && typeof entry.header.size === "number" ? entry.header.size : 0;
    if (declared > KMZ_MAX_KML_BYTES) {
      throw new Error(`KMZ downloaded has an oversized .kml entry: ${declared} bytes`);
    }
    if (declared <= 0) {
      throw new Error(`KMZ .kml entry declares ${declared} uncompressed bytes; refusing to ` +
                      `inflate an entry whose declared size cannot bound the inflation`);
    }

    // This post-read length check is UNREACHABLE with the pinned adm-zip and is retained
    // deliberately, not by oversight. A previous revision described it as "the length of
    // the buffer that actually came out, which no header field can lie about" and as the
    // only unforgeable one of the three; it is neither, and stating so plainly is the
    // point of this comment. adm-zip allocates its output buffer as
    // `Buffer.alloc(centralHeader.size)` and copies the inflated result into it
    // (zipEntry.js), so what comes back is always exactly `declared` bytes — a number the
    // checks above have already bounded. It cannot be longer, whatever the deflate stream
    // contains.
    //
    // It stays because that is a property of THIS library version, not of ZIP: a reader
    // that returns whatever inflated (a growing buffer, a streaming reader) would make
    // this the only thing standing between a forged header and an unbounded string
    // downstream. adm-zip is pinned to an exact version in package.json so an upgrade is a
    // deliberate act, and kmz-decompression-bomb-is-refused asserts on the exact refusal
    // adm-zip's own clamp produces — so a version that stops clamping turns the suite red
    // here rather than silently promoting this line from dead code to load-bearing.
    const buf = ZIPper.readFile(entry);
    if (!buf) throw new Error("KMZ .kml entry could not be inflated");
    if (buf.length > KMZ_MAX_KML_BYTES) {
      throw new Error(`KMZ .kml entry inflated to ${buf.length} bytes, beyond the ` +
                      `${KMZ_MAX_KML_BYTES}-byte bound (its header declared ${declared})`);
    }
    return buf.toString();
  },

  parseNetworkLinks(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");
    const nodes = select("//k:NetworkLink/k:Link/k:href/text()", doc);
    // WR-06: a text node with no nodeValue threw here and, before the per-MD containment,
    // took every active MD with it.
    const MDS = nodes
      .map(n => (n && typeof n.nodeValue === "string" ? n.nodeValue.trim() : ""))
      .filter(href => href !== "");
    return MDS;
  },

  kmlToGeoJson(kmlText) {
    const doc = new DOMParser().parseFromString(kmlText, "text/xml");
    const gj  = KMLtoGJ.kml(doc);
    return gj;
  },

  // Polygons
  /**
   * Determine whether a fetched body is a usable GeoJSON FeatureCollection.
   * @param body - the parsed response body from any SPC/WPC/CPC product fetch
   * @returns boolean, true only when `body` is a truthy object with no `error`
   *   key, no ArcGIS truncation flag, and an array-typed `features` field. This is
   *   the shared response-shape gate every WPC/CPC product fetch loop calls before
   *   handing a body to `extractPolygons`; Phases 15-17 registry rows reuse it
   *   verbatim. A `false` result means the caller must skip that fetch entirely —
   *   not cache it, not evaluate it — and leave its day at the no-risk default.
   *
   *   `exceededTransferLimit` (WR-08): buildArcGisQuery emits no resultRecordCount
   *   and does no paging, so ArcGIS caps every query at the layer's maxRecordCount
   *   and signals the truncation with this top-level flag on an otherwise
   *   structurally valid FeatureCollection. If the user's polygon was among the
   *   dropped features, evaluating such a body reports "NONE" with full confidence
   *   and caches it — a silent false negative. A partial answer is not an answer.
   */
  _isFeatureCollection(body){
    return !!body && typeof body === "object" && !body.error &&
           body.exceededTransferLimit !== true && Array.isArray(body.features);
  },
  /**
   * Body-shape validator for the HeatRisk ImageServer `identify` response, passed to
   * `fetchGeoJsonCached` as its `isValidBody` argument. This response has no top-level
   * `features` array at all — its features live at `body.catalogItems.features`, and its
   * per-day values live at `body.properties.Values` — so it is a structurally different
   * shape from `_isFeatureCollection`'s GeoJSON FeatureCollection contract, not a variant
   * of it. Mirrors `_isFeatureCollection`'s `!body.error` guard: ArcGIS REST returns most
   * failures as HTTP 200 with an `error` body, never a non-2xx status.
   * @param body - the parsed identify response body
   *
   * 17-REVIEW WR-06: this used to also require `typeof body.value === "string"` — the one
   * field `_runHeatRiskProduct` documents that it must NEVER read, because live capture
   * showed that scalar tracking `catalogItemVisibilities` rather than "today". Gating the
   * whole product's usability on a field the pipeline refuses to consume meant a benign
   * upstream change (`value: null` for a point outside the raster, or a numeric `value`)
   * would route every poll through `rejectBody`: a permanent, total product outage caused
   * by data the module had already decided was untrustworthy, signalled only by one log
   * line and the ⚠ badge. A validator should assert exactly what the consumer consumes —
   * no less, or an unparseable body slips through; no more, or the product can be taken
   * down by a field that does not matter.
   * @returns true only when body is a non-null object with an array `properties.Values`
   *   and an array `catalogItems.features`, and carries no `error` key
   */
  _isHeatRiskIdentifyResponse(body) {
    return !!body && typeof body === "object" && !body.error &&
           !!body.properties && Array.isArray(body.properties.Values) &&
           !!body.catalogItems && Array.isArray(body.catalogItems.features);
  },
  /**
   * Extract polygon features from a GeoJSON object, mapping labels to numeric values.
   * @param geojson - GeoJSON FeatureCollection containing Polygon and/or MultiPolygon features
   * @param toValue - function mapping a feature's LABEL string to a numeric value
   * @param includesFeat - predicate (label, value) => boolean; feature is included when true
   * @param context - human-readable identifier for the layer being extracted (normally its
   *   URL). This helper is shared by ~25 call sites across the categorical,
   *   hazard-probability, CIG, Day 4-8, fire-weather and ERO layers, so a rejection log
   *   without it cannot tell an operator which layer degraded (WR-07).
   * @returns array of { label, value, poly, feature } objects for features that pass the
   *   predicate. `feature` is the source GeoJSON feature, retained so callers can read
   *   product-specific properties (e.g. the ERO's `valid_time`) off the polygon the user
   *   is actually inside rather than off `features[0]` (CR-01/WR-10).
   *   Returns an empty array rather than throwing when `geojson` is not a usable
   *   FeatureCollection (see `_isFeatureCollection`), and skips individual features
   *   lacking `properties` or `geometry`, or carrying geometry turf cannot build
   *   (WR-08) — the latter is logged and counted, never thrown.
   */
  extractPolygons(geojson, toValue, includesFeat, context = "unidentified layer"){
    if (!this._isFeatureCollection(geojson)) {
      Log.error("MMM-SPCOutlook extractPolygons: rejected a response body with no usable features array for " + context);
      return [];
    }
    const polygons = [];
    geojson.features.forEach(f =>{
      if (!f || typeof f.properties !== "object" || f.properties === null || !f.geometry) return;
      const label = f.properties.LABEL || "";
      const value = toValue(label, f);
      if (!includesFeat(label, value)) return;

      // WR-08: _isFeatureCollection validates that `features` is an array and never
      // inspects geometry, but turf.polygon throws on a ring with fewer than four
      // positions, on a ring whose first and last positions differ, and on non-array
      // coordinates. An HTTP 200 that parses as JSON and carries one truncated ring — a
      // partial write at the origin, a truncated proxy response, a corrupted CDN object —
      // therefore threw past every per-layer guard into getSpcOutlook's shared catch and
      // turned the whole payload into { error }: days 1-8, fire weather and the ERO gone
      // together, over one bad ring in one layer. Contain at the feature level, which is
      // what this function's own doc comment already promises.
      let poly;
      try {
        if (f.geometry.type === "Polygon") { poly = turf.polygon(f.geometry.coordinates);}
        else if (f.geometry.type === "MultiPolygon") { poly = turf.multiPolygon(f.geometry.coordinates);}
        else return;
      } catch (err) {
        // A dropped polygon is a potential false negative, not a clean read, so the layer
        // must not present as confidently evaluated: count it, and let getSpcOutlook turn
        // the count into the same ⚠ stale signal a failed fetch raises.
        Log.error("MMM-SPCOutlook extractPolygons: skipping a feature with unusable geometry in " + context, err);
        this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
        return;
      }
      polygons.push({ label, value, poly, feature: f });
    });
    return polygons;
  },
  /**
   * Evaluate a list of polygon items against a location, returning the best comparator result.
   * @param items - array of { label, value, poly } from extractPolygons
   * @param loc - turf point representing the query location
   * @param comparator - object with { initial, comparator(best, value) } shape
   * @returns the accumulated best value after testing all polygons containing loc
   */
  evaluatePolygons(items, loc, comparator){
    let best = comparator.initial;
    items.forEach(({label, value, poly}) => {
      const result = turf.booleanPointInPolygon(loc, poly);
      if(result){
        best = comparator.comparator(best, value);
      }
    });
    return best;
  },

  /**
   * Evaluate a list of polygon items against a location, returning every item whose
   * polygon contains it — not the single best. A sibling to `evaluatePolygons`, never a
   * replacement: the Hazards Outlook has no severity ladder to reduce to a winner (D-02),
   * so a day must carry every co-occurring hazard as a set.
   *
   * `evaluatePolygons` never wrapped `turf.booleanPointInPolygon` in a try/catch because
   * `extractPolygons` already screens geometry *construction* — but the containment call
   * can still throw independently (e.g. a self-intersecting ring). Under
   * `evaluatePolygons`'s single-value reduce an uncaught throw there would have discarded
   * the whole product's evaluation anyway; under collect-all it must not discard sibling
   * hazards that share the same day (CR-02, extended one level — D-02 makes a day a set,
   * so containment now needs per-item isolation).
   *
   * Incrementing `_unusableFeatureCount` on a caught throw matters beyond logging:
   * `getSpcOutlook` samples that counter across a run and sets `anyStale` when it grew, so
   * a dropped polygon surfaces as a ⚠ rather than as a confident partial answer.
   *
   * @param items - array of { label, value, poly, feature } from extractPolygons
   * @param loc - turf point representing the query location
   * @returns the full array of containing items (never a single winner)
   */
  evaluatePolygonsCollectAll(items, loc) {
    const hits = [];
    items.forEach((item) => {
      let contains;
      try {
        contains = turf.booleanPointInPolygon(loc, item.poly);
      } catch (err) {
        Log.error("MMM-SPCOutlook evaluatePolygonsCollectAll: containment check failed for " +
                  (item.label || item.value || "unlabeled feature"), err);
        this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
        return;
      }
      if (contains) hits.push(item);
    });
    return hits;
  },

  /**
   * Read a validity-window property off the polygon that produced the winning tier.
   * @param items - array of { label, value, poly, feature } from extractPolygons
   * @param loc - turf point representing the query location
   * @param winningValue - the tier value evaluatePolygons resolved for `loc`
   * @param field - the feature property to read (e.g. the ERO registry row's validTimeField)
   * @returns the property value from the first item whose value equals `winningValue` and
   *   whose polygon contains `loc`, or null when there is no such item or it carries no
   *   usable `properties`. Never throws: a malformed feature yields null rather than
   *   discarding an already-resolved risk tier (CR-01), and `features[0]` is never
   *   consulted, since it is whichever polygon the server serialised first, not the one
   *   the user is standing in (WR-10).
   */
  _validTimeOfWinner(items, loc, winningValue, field){
    if (!Array.isArray(items) || !field) return null;
    for (const item of items) {
      if (!item || item.value !== winningValue || !item.poly) continue;
      if (!turf.booleanPointInPolygon(loc, item.poly)) continue;
      const props = item.feature && item.feature.properties;
      // WR-07: both of these used to be `return null`, which ended the scan. When the user
      // is inside two polygons of the same winning tier — routine at a tier boundary, and
      // the ArcGIS layer does return multi-part tiers — and the first-serialised one
      // carries `valid_time: null` (ArcGIS emits null-valued fields freely), the second
      // polygon's real window was never consulted. That is exactly the `features[0]`
      // ordering dependence this function exists to eliminate. Keep looking instead.
      // The properties check is unreachable today (extractPolygons already drops any
      // feature whose properties is not a non-null object) but is kept as a guard rather
      // than removed, because `continue` costs nothing and the helper is shared.
      if (!props || typeof props !== "object") continue;
      const v = props[field];
      if (v !== undefined && v !== null) return v;
    }
    return null;
  },

  /**
   * Read one field's value out of an MPD's description-CDATA HTML table.
   * @param descriptionValue - the already-unwrapped HTML string, e.g. `mpdDescriptionHtml`'s
   *   return value. Returns null immediately when this is not a string, so a caller that forgets
   *   to unwrap `@tmcw/togeojson`'s `{ "@type": "html", value }` object gets null rather than a
   *   throw (RESEARCH.md Pitfall 3).
   * @param label - a field name (`ValidEndTi`, `IssueTime`, `MPDNumber`, `MPDType`). Regex
   *   metacharacters in `label` are escaped before the pattern is built (T-15-26) — every call
   *   site today passes a compile-time constant, but building a `RegExp` from an unescaped
   *   argument is a foot-gun worth closing at the source rather than trusting future callers.
   * @returns the trimmed inner text of the `<td>` following `<td>LABEL</td>`, or null when the
   *   field is absent, `descriptionValue` is not a string, or it exceeds 512 KB (T-15-24 — bounds
   *   the lazy `(.*?)` match against a hostile multi-megabyte CDATA block on a Raspberry Pi).
   */
  extractMpdField(descriptionValue, label) {
    if (typeof descriptionValue !== "string") return null;
    if (descriptionValue.length > 512 * 1024) return null;
    const escapedLabel = String(label).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Live samples separate <td>LABEL</td> from its value <td> by whitespace/newlines only —
    // the `s` flag lets `.*?` survive that.
    const m = descriptionValue.match(new RegExp(`<td>${escapedLabel}</td>\\s*<td>(.*?)</td>`, "s"));
    return m ? m[1].trim() : null;
  },

  /**
   * Unwrap an MPD feature's `description` property into a plain HTML string.
   * @param feature - a GeoJSON feature from `kmlToGeoJson`'s output
   * @returns `desc.value` when `@tmcw/togeojson` wrapped the description as
   *   `{ "@type": "html", value }` (RESEARCH.md Pitfall 3, live-verified), `desc` when it is
   *   already a plain string, or null otherwise. Reading `properties.description` directly and
   *   regexing it either throws or, if merely guarded by a `typeof === "string"` check, silently
   *   takes the "no hazard type" branch on every single MPD — a 100% parse-miss rate against a
   *   fixture that structurally contains the field is the diagnostic signature of skipping this
   *   unwrap, distinguishable from a genuine missing-field case only by that rate.
   */
  mpdDescriptionHtml(feature) {
    const desc = feature && feature.properties && feature.properties.description;
    if (desc && typeof desc === "object") return typeof desc.value === "string" ? desc.value : null;
    if (typeof desc === "string") return desc;
    return null;
  },

  /**
   * Resolve an MPD's bare `ValidEndTi` (`DDHHMM`, no month/year) against its `IssueTime` (full
   * date plus a US timezone abbreviation) into a UTC instant. This is MPD-04's sole currency
   * decision — the filename number must never substitute for it.
   * @param issueTimeStr - e.g. "734 PM EDT Sun Aug 23 2026". Native `Date` parsing of this shape
   *   fails (`new Date("734 PM EDT Sun Aug 23 2026")` is `Invalid Date`, verified live).
   * @param validEndTi - e.g. "240515" (day, hour, minute)
   * @returns a UTC `Date`, or null when `IssueTime` cannot be parsed, its timezone abbreviation
   *   falls outside the fixed 8-entry CONUS table, or `validEndTi` is not a well-formed 6-digit
   *   day/hour/minute in range. Callers must fail open on null per this plan's decision record —
   *   an unresolvable window is kept, never treated as expired.
   */
  parseMpdValidEnd(issueTimeStr, validEndTi) {
    if (typeof issueTimeStr !== "string" || typeof validEndTi !== "string") return null;
    if (!/^\d{6}$/.test(validEndTi)) return null;

    const m = issueTimeStr.match(/([A-Z]{2,4})\s+\w{3}\s+(\w{3})\s+(\d{1,2})\s+(\d{4})/);
    if (!m) return null;
    const [, tz, monthAbbr, issueDayStr, yearStr] = m;

    // Bounded 8-value CONUS domain (RESEARCH.md "Don't Hand-Roll") — a full timezone library is
    // disproportionate weight for a Raspberry Pi module whose core value explicitly calls out
    // "no unnecessary CPU burn."
    const TZ_OFFSET_HOURS = { EST: -5, EDT: -4, CST: -6, CDT: -5, MST: -7, MDT: -6, PST: -8, PDT: -7 };
    const offset = TZ_OFFSET_HOURS[tz];
    if (offset === undefined) return null;

    const day = Number(validEndTi.slice(0, 2));
    const hour = Number(validEndTi.slice(2, 4));
    const minute = Number(validEndTi.slice(4, 6));
    if (!(day >= 1 && day <= 31)) return null;
    if (!(hour >= 0 && hour <= 23)) return null;
    if (!(minute >= 0 && minute <= 59)) return null;

    const MONTH_ABBRS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    let monthIdx = MONTH_ABBRS.indexOf(monthAbbr);
    if (monthIdx === -1) return null;
    const issueDay = Number(issueDayStr);
    let year = Number(yearStr);
    if (!Number.isFinite(issueDay) || !Number.isFinite(year)) return null;

    // MPD-04 correctness edge case: when the end-day is less than the issue-day, the validity
    // window crosses into the next month (e.g. issued 23:33 on the 31st with a ValidEndTi of
    // 010515). Without this roll, that instant resolves a month in the past and is discarded as
    // expired — a false negative at exactly the moment MPD-04 cares about.
    if (day < issueDay) {
      monthIdx += 1;
      if (monthIdx > 11) {
        monthIdx = 0;
        year += 1;
      }
    }

    return new Date(Date.UTC(year, monthIdx, day, hour - offset, minute));
  },

  /**
   * Read the `MPDType` field out of an MPD feature's description CDATA.
   * @param feature - a GeoJSON feature from `kmlToGeoJson`'s output
   * @returns the hazard type string, or null when absent. Per D-06 a null hazard type is a
   *   normal, renderable state and must never cause the MPD to be dropped.
   */
  mpdHazardType(feature) {
    return this.extractMpdField(this.mpdDescriptionHtml(feature), "MPDType");
  },

  /**
   * Read the `MPDNumber` field out of an MPD feature's description CDATA.
   * @param feature - a GeoJSON feature from `kmlToGeoJson`'s output
   * @returns the number string, or null when absent. This is a display/fallback-label reader
   *   only — it must never be used to decide currency (MPD-04); `parseMpdValidEnd` alone decides
   *   that.
   */
  mpdNumber(feature) {
    return this.extractMpdField(this.mpdDescriptionHtml(feature), "MPDNumber");
  },

  /**
   * computeProximity — distance-weighted proximity to higher-tier polygons via linear falloff (40 km cutoff).
   * @param items - array of { label, value, poly, line } — `line` is pre-derived by caller
   *                via turf.polygonToLine and memoized on _geoJsonCache entries (Plan 12-03)
   * @param loc - turf point representing the query location
   * @param currentValue - the user's current tier value (e.g. result of evaluatePolygons against same items)
   * @param comparator - object with { initial, comparator(best, value) } shape; used to identify "higher tier" items
   * @returns { value: number, nextTier: string } when a higher-tier polygon is within 40 km, else null
   *
   * value = currentValue + weight, where weight = max(0, 1 - d_km/40), strictly capped below 1.
   * When two or more higher-tier polygons are within 40 km, the polygon producing the max weight wins;
   * nextTier is that winning polygon's label. Strict cap is enforced by gating on d_km > 0 (per D-07):
   * weight = 1 only at d = 0, which is excluded — a user on a higher-tier boundary is treated as inside it.
   *
   * IMPORTANT: this helper does NOT call turf.polygonToLine. Each item must carry a pre-derived `line`
   * (Feature<LineString> for Polygon source, FeatureCollection<LineString> for MultiPolygon source).
   * Memoization of `line` per cache entry is owned by Plan 12-03's call sites.
   */
  computeProximity(items, loc, currentValue, comparator){
    let best = null;
    items.forEach(({label, value, poly, line}) => {
      // D-08: comparator-driven "higher tier" check — uniform across catComparator and cigComparator
      if (comparator.comparator(currentValue, value) === currentValue) return;

      // D-07: strict cap below 1. If the user is inside (or on the boundary of) the higher-tier
      // polygon, treat as already inside that tier and skip — no proximity contribution. This
      // covers both d_km === 0 and the practical case where turf's spherical distance reports a
      // tiny epsilon for points on a straight (but spherically curved) polygon edge.
      if (poly && turf.booleanPointInPolygon(loc, poly)) return;

      // Normalise line to an array of Feature<LineString>.
      // turf.polygonToLine returns Feature<LineString> (simple Polygon),
      // Feature<MultiLineString> (Polygon with holes), or FeatureCollection (MultiPolygon —
      // and entries can themselves be MultiLineString when a constituent polygon has holes).
      // turf.flatten collapses all three shapes into single-part LineString features in one pass.
      const lineFeatures = line ? turf.flatten(line).features : [];
      let dKm = Infinity;
      for (const lf of lineFeatures) {
        const d = turf.pointToLineDistance(loc, lf, { units: "kilometers" });
        if (d < dKm) dKm = d;
      }

      // Belt-and-suspenders d_km > 0 gate (per D-07 simplest-implementation note)
      if (!(dKm > 0)) return;

      const weight = Math.max(0, 1 - dKm / 40);
      if (weight <= 0) return;

      if (best === null || weight > best.weight) {
        best = { weight, label };
      }
    });

    // PROX-06 / D-14: null when no higher-tier polygon contributed within 40 km
    if (best === null) return null;
    return { value: currentValue + best.weight, nextTier: best.label };
  },

  /**
   * Ensure a _geoJsonCache entry has a `lines` array of items annotated with pre-derived
   * line geometry. If `entry.lines` already exists, return it. Otherwise derive lines from
   * `entry.polys` via turf.polygonToLine, write the array back to the entry, and return it.
   * Used by Plan 12-03 cache-hit branches so that proximity weighting toggled false→true
   * lazily fills `lines` on first hit; subsequent hits are O(1). PROX-05.
   * @param entry - cache entry from this._geoJsonCache.get(url); must have a `polys` field
   * @returns array of { label, value, poly, line } items ready for computeProximity, or null
   */
  deriveLinesIfMissing(entry) {
    if (entry.lines) return entry.lines;
    if (!entry.polys) return null;
    entry.lines = entry.polys.map(item => ({
      label: item.label,
      value: item.value,
      poly: item.poly,
      line: turf.polygonToLine(item.poly)
    }));
    return entry.lines;
  },


  
  //Day3+ % => risk
  percToRisk(pct, isSig){
    if (pct == 0.45) return isSig ? "MDT" : "ENH";
    if (pct == 0.30) return "ENH";
    if (pct == 0.15) return "SLGT";
    if (pct == 0.05) return "MRGL";
    return "NONE";
  },

  // A second, caller-less `fetchGeoJson` sat here: a divergent transport that bypassed
  // every control on this path — no body bound, no _isFeatureCollection gate, no stale
  // fallback, no `failed` flag, swallowing errors into a bare `return null` that is
  // indistinguishable from "no risk". It was deleted rather than left as a convenience,
  // because the danger was its NAME: a future caller reaching for the obviously-named
  // fetchGeoJson instead of fetchGeoJsonCached would have reintroduced the whole
  // silent-degradation class in one line. If a plain fetch is ever wanted, route it
  // through fetchGeoJsonCached rather than duplicating the transport.
  //
  // 16-REVIEW WR-05: reads the clock through `_nowMs()`, not `Date.now()`. The seam's own
  // doc comment states its purpose is to make the day-offset-drift regression — the
  // phase's highest-risk item — testable, yet the timestamps that decide whether a cached
  // reading may be SERVED sat outside it, so a probe that pinned `_nowMs` to a fixture
  // date still measured the stale window against the wall clock. The consequence was a
  // clock-dependent harness: `HAZARDS_NOW_MS` is a fixed 2026-08-26, so any hazards
  // scenario warming the cache and then hitting a network error, a non-ok status or
  // `rejectBody` computed a difference that GREW with real elapsed time and eventually
  // took the hard-failure branch where it was authored to take the stale-fallback one.
  // In production both are `Date.now()`, so this changes no user-facing behaviour; it
  // makes the seam actually cover what it claims to.
  _isWithinStaleWindow(timestamp, intervalMinutes) {
    const intervalMs = (intervalMinutes ?? 60) * 60 * 1000;
    return (this._nowMs() - timestamp) < intervalMs * STALE_WINDOW_INTERVALS;
  },

  /**
   * Record the age of a cached reading that is being served in place of a fresh fetch.
   * @param entry - the _geoJsonCache entry whose `result` is about to be returned
   *
   *   WR-04: `_staleAsOf: Date.now()` recorded when the payload was *assembled*, not how
   *   old the data in it is — measured against the real getSpcOutlook with every layer
   *   failing, `Date.now() - _staleAsOf` was 1 ms, so `moment(asOf).fromNow()` rendered
   *   "a few seconds ago" on every stale render whether the reading was two minutes or
   *   fifty-nine minutes old. A freshness indicator that always reports maximum freshness
   *   while flagging staleness is worse than none. Keeping the OLDEST contributing
   *   timestamp is the honest summary of a payload assembled from several layers.
   *
   *   Called only from the paths that return `stale: true`; an ETag/hash cache hit is
   *   upstream confirming the bytes are unchanged, which is a fresh reading, not a stale
   *   one — and each of those three hit paths now stamps `entry.timestamp` with that
   *   confirmation, so the age this reports is time-since-last-confirmed rather than
   *   time-since-last-edit. A hard failure has no entry to age, so the field stays null and
   *   the frontend's existing `typeof asOf === "number"` guard omits the suffix.
   */
  _noteStaleEntry(entry) {
    if (!entry || typeof entry.timestamp !== "number") return;
    if (this._oldestStaleAt === null || this._oldestStaleAt === undefined ||
        entry.timestamp < this._oldestStaleAt) {
      this._oldestStaleAt = entry.timestamp;
    }
  },

  /**
   * The current time in epoch milliseconds — a seam, in the same spirit as `_fetch(url,
   * options)`. The Hazards Outlook's day keys are derived by comparing a static remote
   * date (a feature's own `start_date`/`end_date`) against a live clock; a probe cannot
   * advance the system clock, so without this seam the day-offset-drift regression (the
   * phase's highest-risk item — 16-RESEARCH.md "Freshness Integration") is untestable.
   * `resetHelper` restores it automatically via `ORIGINAL_SEAMS` — no harness change
   * needed.
   * @returns epoch milliseconds
   */
  //   16-REVIEW WR-05: the seam now covers the WHOLE caching layer, not just the day-key
  //   arithmetic — `_isWithinStaleWindow`, every `_geoJsonCache` timestamp write and the
  //   three cache-hit timestamp refreshes all read it. They must move together: a mix of
  //   `_nowMs()` and `Date.now()` inside the cache means a probe that pins this seam to a
  //   fixture date compares a pinned reading against the wall clock, which silently flips
  //   which branch (stale fallback vs hard failure) a warm-cache degrade scenario takes —
  //   and flips it differently on every day the suite is run. Any new clock read added to
  //   the caching layer belongs here too.
  _nowMs() {
    return Date.now();
  },

  /**
   * UTC midnight of the current day, derived from `_nowMs()` so a probe overriding that
   * seam moves this too. Only `getUTC*` getters and `Date.UTC` are permitted here —
   * `getFullYear()`/`getMonth()`/`getDate()` or `new Date(y, m, d)` would silently
   * reintroduce a timezone bug on a Raspberry Pi whose system clock is not UTC, and
   * there is no date library on this backend to enforce it, so this is enforced by
   * review and by the grep gate in the Hazards Outlook plan's acceptance criteria.
   * @returns epoch milliseconds of today's UTC midnight
   */
  _todayUtcMs() {
    const d = new Date(this._nowMs());
    return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  },

  /**
   * Phase 18 grid-anchor rule (resolves 18-RESEARCH.md Open Question 1): callers
   * anchoring this function to the SPC 12Z-14Z grid MUST pass the NOMINAL grid-day-1
   * start, derived as EXPIRE_ISO minus 24 hours — never the raw VALID_ISO. SPC
   * truncates `VALID` to the re-issuance time when the nominal period is already in
   * progress (live 2026-09-05: VALID 13:00Z, EXPIRE 12:00Z next day, ISSUE 12:54Z),
   * while `EXPIRE` is never truncated. Feeding the truncated start into this rounding
   * math can move a 00Z-aligned Hazards Outlook feature onto the wrong grid day.
   * `_todayUtcMs` and the existing Hazards Outlook/HeatRisk callers are unaffected —
   * they anchor to UTC midnight, not the SPC grid, and stay exactly as they are.
   *
   * Empirical check (script since deleted; see 18-02-SUMMARY.md for the full table):
   * for a `wpc-hazards` feature with `start_date = 2026-09-06T00:00:00Z`, which D-10
   * requires to land on grid day 2 (the grid day starting 12Z Sep 6):
   *   - Case A, clean anchor `2026-09-05T12:00:00Z` (= nominal): offset 1 -> grid day 2. Correct.
   *   - Case B, live-observed truncated anchor `2026-09-05T13:00:00Z` (raw VALID_ISO):
   *     offset 0 -> grid day 1. WRONG — this is the exact failure this rule prevents.
   *   - Case C, heavily truncated anchor `2026-09-05T01:00:00Z` (raw VALID_ISO):
   *     offset 1 -> grid day 2. Coincidentally correct — refuting the assumption that
   *     every truncated anchor fails the same way. The coincidence is not a reason to
   *     skip the rule: only the nominal anchor is correct unconditionally, regardless
   *     of how far VALID drifts from EXPIRE minus 24 hours.
   * HeatRisk's two `idp_validtime` samples (Sep 5 12Z -> day 1, Sep 6 12Z -> day 2)
   * landed correctly in all three cases, because they are already 12Z-aligned and the
   * anchor shift never crosses their own half-day tie.
   *
   * Open Question 1 resolution: REUSE VERBATIM with the nominal anchor. No
   * interval-overlap math is needed — the existing `Math.round` division is exactly
   * right once it is handed EXPIRE_ISO minus 24 hours instead of raw VALID_ISO.
   */
  /**
   * The signed day offset of an epoch-ms value relative to today's UTC midnight. Every
   * `start_date`/`end_date` observed live on 2026-08-26 across 32 Hazards Outlook
   * features was exact UTC midnight, so this division is exact; `Math.round` is a
   * defensive guard against a future WPC payload that is not midnight-aligned, not a
   * workaround for a known case.
   * @param epochMs - a feature's start_date/end_date, epoch milliseconds
   * @param todayUtcMs - this poll's `_todayUtcMs()` value
   * @returns integer day offset (0 = today, negative = past, positive = future)
   */
  _hazardDayOffset(epochMs, todayUtcMs) {
    return Math.round((epochMs - todayUtcMs) / MS_PER_DAY);
  },

  /**
   * D-12: derive the Phase 18 grid anchor from SPC's own day-1 categorical outlook
   * VALID_ISO/EXPIRE_ISO properties, with a marked clock fallback. Never throws (T-18-02)
   * — `new Date(str)` on a malformed string yields `Invalid Date`, not a throw, so every
   * parse is gated with `Number.isFinite(d.getTime())` before use, same containment
   * discipline used elsewhere in this file (e.g. `_bucketHazardMatch`).
   *
   * The raw fields are read fresh on every call — `T12:00:00Z` is never hardcoded as a
   * parsed constant on the observed path, since the whole point of D-12 is that SPC's
   * real re-issuance time is read every poll, not assumed.
   *
   * @param validIso - the winning day-1 polygon's VALID_ISO property, or null
   * @param expireIso - the winning day-1 polygon's EXPIRE_ISO property, or null
   * @returns {
   *   nominalStartMs: epoch ms of grid day 1's NOMINAL 12Z start (EXPIRE_ISO minus 24h,
   *     or the clock-derived estimate),
   *   day1StartMs: epoch ms of grid day 1's ACTUAL start (the truncated VALID_ISO when
   *     it is finite and falls inside [nominalStartMs, day1EndMs], else nominalStartMs),
   *   day1EndMs: epoch ms of grid day 1's end (EXPIRE_ISO, or nominalStartMs + 24h),
   *   anchor: "observed" when EXPIRE_ISO was usable, "estimated" when it fell back to
   *     the clock rule — which fires when EXPIRE_ISO was absent, unparseable, OR already
   *     elapsed (its window has already ended)
   * }
   */
  _spcGridAnchor(validIso, expireIso) {
    const expireMs = typeof expireIso === "string" && expireIso ? new Date(expireIso).getTime() : NaN;
    // D-11/T-18-03: an EXPIRE_ISO in the past is a stale or not-yet-reissued outlook (SPC's
    // 12Z replacement is not instantaneous — live 2026-09-05 ISSUE was 12:54Z — and this
    // module serves cached bodies for up to 2 * _updateInterval). Accepting it anchors the
    // entire fourteen-day grid one day early while still reporting anchor: "observed". The
    // clock fallback below is already correct for this case, so rejecting it here is the
    // whole fix.
    if (Number.isFinite(expireMs) && expireMs > this._nowMs()) {
      const nominalStartMs = expireMs - MS_PER_DAY;
      const day1EndMs = expireMs;
      const validMs = typeof validIso === "string" && validIso ? new Date(validIso).getTime() : NaN;
      // A nonsensical VALID_ISO (outside the nominal 24h window) is rejected rather than
      // producing an inverted or overlong day-1 window (T-18-03) — falls back to the
      // nominal start instead.
      const day1StartMs = (Number.isFinite(validMs) && validMs >= nominalStartMs && validMs <= day1EndMs)
        ? validMs
        : nominalStartMs;
      return { nominalStartMs, day1StartMs, day1EndMs, anchor: "observed" };
    }
    // Clock fallback (D-11): day 1 is the outlook period currently in progress, and the
    // grid rolls at 12Z. Only UTC-getter and Date.UTC forms are used here, matching the
    // timezone-bug guard `_todayUtcMs` already documents — the local-time equivalents
    // would reintroduce that bug on a Pi whose system clock is not UTC.
    const now = new Date(this._nowMs());
    const todayMidnightMs = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    const nominalStartMs = now.getUTCHours() >= 12
      ? todayMidnightMs + 12 * 60 * 60 * 1000
      : todayMidnightMs - MS_PER_DAY + 12 * 60 * 60 * 1000;
    const day1EndMs = nominalStartMs + MS_PER_DAY;
    return { nominalStartMs, day1StartMs: nominalStartMs, day1EndMs, anchor: "estimated" };
  },

  /**
   * The 1-based Phase 18 grid day number of an epoch-ms value, relative to the grid's
   * NOMINAL 12Z start (see the nominal-anchor rule above `_hazardDayOffset`). Delegates
   * to `_hazardDayOffset` verbatim rather than restating its rounding division — the
   * only difference from that function's existing callers is which anchor is passed in.
   * Not clamped to 1..14: an out-of-range value is returned as-is so a caller-side bug
   * is visible rather than silently folded onto an edge day; `_buildGridDays` below
   * never calls this outside that range, so clamping here would only hide a defect.
   * @param epochMs - epoch milliseconds
   * @param nominalStartMs - the grid anchor's nominalStartMs (from `_spcGridAnchor`)
   * @returns integer grid day number, 1-based, unclamped
   */
  _gridDayOf(epochMs, nominalStartMs) {
    return this._hazardDayOffset(epochMs, nominalStartMs) + 1;
  },

  /**
   * D-02/D-03: build the fourteen-key `days` skeleton every later Phase 18 plan
   * populates. All fourteen keys `"1"`..`"14"` are always present, with empty
   * `hazards` arrays — this plan lands the shape, not the content.
   *
   * Day 1 uses the anchor's ACTUAL (possibly truncated) window; days 2-14 use the
   * NOMINAL 12Z-aligned window derived from `anchorInfo.nominalStartMs`. `date` always
   * uses the NOMINAL start for every day, including day 1, so day 1's calendar-date
   * label does not shift when SPC truncates its re-issuance (D-11) — only its
   * `windowStart` does.
   * @param anchorInfo - the object `_spcGridAnchor` returns
   * @returns { "1": { date, windowStart, windowEnd, hazards: [] }, ... "14": {...} }
   */
  _buildGridDays(anchorInfo) {
    const days = {};
    for (let n = 1; n <= GRID_DAY_COUNT; n++) {
      const nominalStartForDay = anchorInfo.nominalStartMs + (n - 1) * MS_PER_DAY;
      const nominalEndForDay = anchorInfo.nominalStartMs + n * MS_PER_DAY;
      const windowStartMs = n === 1 ? anchorInfo.day1StartMs : nominalStartForDay;
      const windowEndMs = n === 1 ? anchorInfo.day1EndMs : nominalEndForDay;
      days[String(n)] = {
        date: this._utcDateString(nominalStartForDay),
        windowStart: new Date(windowStartMs).toISOString(),
        windowEnd: new Date(windowEndMs).toISOString(),
        hazards: []
      };
    }
    return days;
  },

  /**
   * D-06's zip-before-sort: build `{ attrs, rawValue }` tuples from the HeatRisk identify
   * response's `catalogItems.features` and `properties.Values` arrays BEFORE any sort, so
   * no positional index survives into the sort and a `catalogItems`/`Values` desync
   * becomes unrepresentable rather than something later code must guard against. This
   * function does NOT sort — sorting by `idp_validtime` happens in the runner, after
   * dedupe.
   *
   * Precondition guard: if `values` is not an array, or its length differs from
   * `features.length`, returns `null` — D-06's abandon signal. Two alternatives were
   * considered and rejected: zipping to the shorter length front-truncates and silently
   * mis-attributes every surviving pair (a confidently wrong category on the wrong day,
   * strictly worse than showing nothing); falling back to the top-level `value` as Day 1
   * is wrong because that field tracks `catalogItemVisibilities`, which live capture on
   * 2026-08-31 showed pointing at the Day-2 tile, not Day 1.
   *
   * @param body - a body that has already passed `_isHeatRiskIdentifyResponse`, but this
   *   function must not throw even if a body somehow slipped through with a mismatched
   *   or missing shape
   * @returns Array<{ attrs, rawValue }> in RAW response order, or null on a Values/features
   *   length mismatch
   */
  _zipHeatRiskCatalog(body) {
    const features = body && body.catalogItems && body.catalogItems.features;
    const values = body && body.properties && body.properties.Values;
    if (!Array.isArray(features) || !Array.isArray(values) || values.length !== features.length) {
      return null;
    }
    return features.map((f, i) => ({ attrs: f && f.attributes, rawValue: values[i] }));
  },

  /**
   * HEAT-04: two catalog items sharing an `idp_validtime` collapse to the one with the
   * greatest `idp_filedate` (most recently ingested). `catalogItemVisibilities` is
   * deliberately NOT used for this tiebreak: live capture confirms it marks only the
   * single tile behind the top-level scalar `value`, so for a duplicate pair that is not
   * also the globally visible tile both members read `0` — an unreliable per-pair signal.
   * `idp_filedate` is present and independently varying on every item (a ~15-minute
   * spread observed across 7 items in one poll), so it is the tiebreak instead. A tuple
   * whose `idp_validtime` is not a finite number is dropped (`continue`), contained,
   * never thrown — the same per-item containment discipline `_hazardMatchesFromHits`
   * already applies to a malformed hit. Does not sort.
   *
   * @param tuples - Array<{ attrs, rawValue }> from `_zipHeatRiskCatalog`
   * @returns Array<{ attrs, rawValue }>, at most one entry per distinct `idp_validtime`
   */
  _dedupeHeatRiskByValidTime(tuples) {
    const byValidTime = new Map();
    for (const t of tuples) {
      const vt = t && t.attrs && t.attrs.idp_validtime;
      if (typeof vt !== "number" || !Number.isFinite(vt)) continue;
      const existing = byValidTime.get(vt);
      const filedate = (t.attrs && typeof t.attrs.idp_filedate === "number" && Number.isFinite(t.attrs.idp_filedate))
        ? t.attrs.idp_filedate
        : -Infinity;
      const existingFiledate = existing
        ? ((existing.attrs && typeof existing.attrs.idp_filedate === "number" && Number.isFinite(existing.attrs.idp_filedate))
          ? existing.attrs.idp_filedate
          : -Infinity)
        : -Infinity;
      if (!existing || filedate > existingFiledate) {
        byValidTime.set(vt, t);
      }
    }
    return Array.from(byValidTime.values());
  },

  /**
   * HEAT-01/02: the HeatRisk-specific day-offset wrapper. Delegates to `_hazardDayOffset`
   * rather than restating its day-offset division a second time — a second copy of that
   * formula is exactly the two-places-declare-one-rule defect 16-REVIEW WR-03 filed. This
   * wrapper exists purely so HeatRisk call sites read
   * HeatRisk-specific and so the 12:00Z rationale below has one home.
   *
   * No `+1` adjustment is needed: every observed `idp_validtime` sits at exactly
   * `12:00:00.000Z` (14/14 features across two live sessions), half a day past UTC
   * midnight, so `Math.round(0.5) === 1` places today's tile at day key 1 — and because
   * `_todayUtcMs()` only changes at midnight, that mapping is stable across an entire UTC
   * calendar day, not just at the moment of capture. This depends on the 12:00Z alignment
   * holding; if a future response ever carries a midnight-aligned `idp_validtime`, this
   * assumption breaks and this wrapper is where to fix it. Routes through its caller's
   * `_todayUtcMs()`/`_nowMs()` seams — never reads the raw system clock directly.
   *
   * @param idpValidTimeMs - a catalog item's `idp_validtime`, epoch milliseconds
   * @param todayUtcMs - this poll's `_todayUtcMs()` value
   * @returns integer day key (1 == today)
   */
  _heatRiskDayOffset(idpValidTimeMs, todayUtcMs) {
    return this._hazardDayOffset(idpValidTimeMs, todayUtcMs);
  },

  /**
   * The `YYYY-MM-DD` UTC calendar date for an epoch-ms value. This is the Hazards
   * Outlook's per-day `date` field, and the `startDate`/`endDate` its window band
   * carries. The frontend derives the weekday from this string rather than computing
   * `dowToText(dow + N)`, because WPC's "Day N" boundary differs from SPC's and offset
   * arithmetic drifts by one.
   * @param epochMs - epoch milliseconds
   * @returns "YYYY-MM-DD", or null for a non-finite input
   */
  _utcDateString(epochMs) {
    if (typeof epochMs !== "number" || !Number.isFinite(epochMs)) return null;
    const d = new Date(epochMs);
    const year = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  },

  /**
   * The LOCKED reading of the Hazards Outlook's full-nominal-window guard: "full
   * nominal window" means exact offset alignment to the layer's own `[first, last]`
   * (`[3,7]` / `[8,14]`), NOT merely "same duration, any position." A 5-day feature
   * positioned off-window is genuinely day-resolved information and belongs in the day
   * rows, not the window band — do not "fix" this into a duration check.
   * @param offsetStart - a feature's start offset (from _hazardDayOffset)
   * @param offsetEnd - a feature's end offset (from _hazardDayOffset)
   * @param dayRange - the layer's own [first, last] nominal window
   * @returns true only on exact alignment to dayRange
   */
  _isFullNominalWindow(offsetStart, offsetEnd, dayRange) {
    return offsetStart === dayRange[0] && offsetEnd === dayRange[1];
  },

  /**
   * Route one normalized Hazards Outlook match into either the per-day bucket grid or
   * the window band, mutating both accumulators in place. Performs no fetching and no
   * ordering — ordering is owned by the runner that assembles the final payload.
   *
   * `match` is this product's clock-independent unit — the same shape a fresh fetch and
   * a cache-hit replay both produce, so bucketing cannot diverge between the two paths:
   *   { label: string, startDate: number, endDate: number, idpFiledate: number|null }
   * `startDate`/`endDate` are the feature's raw epoch-ms `start_date`/`end_date`. It
   * carries no day key and no offset — a cached unit must never contain a value whose
   * correctness depends on an external clock (16-RESEARCH.md "Freshness Integration").
   *
   * @param match - the normalized match (see shape above)
   * @param layer - { id, group, dayRange } — the registry row's layer descriptor
   * @param todayUtcMs - this poll's `_todayUtcMs()` value
   * @param dayBuckets - { [offset]: [{label}] } accumulator, mutated in place
   * @param windowEntries - [] accumulator for window-band entries, mutated in place
   * @param dayRangeTotal - the row's own `[firstDay, lastDay]` grid span, threaded in by
   *   the runner (WR-03). This used to be the literals `3` and `14` written into the day
   *   loop's clamp while the payload-assembly loop was already registry-driven, so the
   *   two ends could not be tied together — and this function was not even given `row`.
   *   Changing the row's span to `[3, 21]` produced a correct 19-key payload whose days
   *   15-21 rendered empty forever, with no error at either end: the exact defect
   *   `daySpanOf`'s comment in productRegistry.js condemns.
   */
  _bucketHazardMatch(match, layer, todayUtcMs, dayBuckets, windowEntries, dayRangeTotal) {
    // A malformed match is contained here so its siblings' day and window entries
    // survive (CR-02 lesson, extended to the bucketing step). Nothing is logged — a
    // per-feature date miss is not actionable and would be noisy at ~27 features/layer.
    if (!match || typeof match.startDate !== "number" || typeof match.endDate !== "number" ||
        !Number.isFinite(match.startDate) || !Number.isFinite(match.endDate)) {
      return;
    }

    const offsetStart = this._hazardDayOffset(match.startDate, todayUtcMs);
    const offsetEnd = this._hazardDayOffset(match.endDate, todayUtcMs);
    // An inverted span from a malformed upstream feature — contained, not thrown.
    if (offsetEnd < offsetStart) return;

    const entry = {
      label: match.label,
      startDate: this._utcDateString(match.startDate),
      endDate: this._utcDateString(match.endDate),
      offsetStart,
      offsetEnd
    };

    if (layer.group !== "precipitation") {
      // HAZ-02: Temperature and Wildfire/Drought carry no per-day resolution and route
      // to the window band unconditionally, regardless of observed span. Live
      // 2026-08-26 the Temperature layer alone produced 1-day, 4-day and 5-day spans in
      // one poll, so any "these always span the whole window" assumption is empirically
      // false (refines Pitfall 3). The entry carries its own observed span, never the
      // layer's nominal window.
      windowEntries.push(entry);
      return;
    }

    if (this._isFullNominalWindow(offsetStart, offsetEnd, layer.dayRange)) {
      // D-04's guard: a Precipitation feature spanning its layer's entire nominal
      // window is window-level information, and repeating it identically on every day
      // would advertise a daily resolution the data does not have (Pitfall 3's spread
      // failure). LOCKED reading: exact offset alignment to [3,7]/[8,14], not
      // duration-only.
      windowEntries.push(entry);
      return;
    }

    // D-04: a 2-day "Heavy Rain" renders on both days, because the day grid answers "is
    // there a hazard on this day" and on day two the answer is yes. Clamp the loop
    // bounds at the header (Math.max/Math.min) rather than filtering inside the body,
    // so a hostile [-1e9, 1e9] span cannot produce an unbounded iteration (T-16-05).
    //
    // WR-03: the clamp is the ROW's declared span, passed in, not the literals 3 and 14.
    // A caller that omits it gets nothing bucketed rather than a silently wrong grid —
    // an unclamped fallback here would be the unbounded iteration T-16-05 closed, and a
    // guessed default would be the hardcoded span this parameter exists to delete.
    if (!Array.isArray(dayRangeTotal) ||
        !Number.isInteger(dayRangeTotal[0]) || !Number.isInteger(dayRangeTotal[1])) {
      Log.error("MMM-SPCOutlook _bucketHazardMatch: called without a valid dayRangeTotal (" +
                JSON.stringify(dayRangeTotal) + "); dropping the day-grid contribution");
      return;
    }
    const [firstDay, lastDay] = dayRangeTotal;
    for (let d = Math.max(offsetStart, firstDay); d <= Math.min(offsetEnd, lastDay); d++) {
      if (!dayBuckets[d]) dayBuckets[d] = [];
      dayBuckets[d].push({ label: match.label });
    }
  },

  /**
   * Re-bucket the Hazards Outlook's `gridMatches` side-channel (Task 1) onto the Phase 18
   * SPC 12Z grid and append the resulting hazard entries to `gridDays[N].hazards` in place.
   * MERGE-01/D-10.
   *
   * Does not sort — plan 18-05 owns final ordering (D-15's taxonomy category order).
   *
   * @param gridDays - the fourteen-key `days` skeleton from `_buildGridDays`, mutated in place
   * @param gridMatches - the raw `{ label, startDate, endDate, group, dayRange }` array from
   *   `_runArcGisHazardWindowProduct`'s Task 1 side-channel — the SAME objects the legacy
   *   `hazardsOutlook` block was built from, never re-fetched or re-derived (D-01)
   * @param anchorInfo - the object `_spcGridAnchor` returns
   * @param notes - `{ noteReported, noteActive, noteUnmapped }`, declared by 18-02 in
   *   `getSpcOutlook`'s scope and passed in explicitly so this method stays pure over its
   *   arguments rather than reaching for `this`
   */
  _addHazardsOutlookGridEntries(gridDays, gridMatches, anchorInfo, notes) {
    const row = PRODUCT_REGISTRY.hazardsOutlook;
    const todayUtcMs = this._todayUtcMs();

    for (const match of gridMatches) {
      // T-18-04: contain a malformed match here so its siblings still land (the CR-02
      // lesson, extended to this grid pass) — the SAME containment `_bucketHazardMatch`
      // applies to the legacy block.
      if (!match || typeof match.startDate !== "number" || typeof match.endDate !== "number" ||
          !Number.isFinite(match.startDate) || !Number.isFinite(match.endDate)) {
        continue;
      }

      // D-04's window-band-vs-day-grid routing decision is made on the LEGACY
      // `_todayUtcMs`-anchored offsets, unchanged by this phase's grid re-anchor — D-09
      // moves WHICH grid day a day-scoped entry lands on, not WHETHER it is day-scoped.
      // CONTEXT.md's Deferred section already flags "how 16 D-04's multi-day span
      // features re-map onto the 12Z grid" as an open item; this plan deliberately
      // leaves band membership on its existing rule, since re-deciding it on the shifted
      // anchor would silently move entries between the day grid and the band.
      const legacyOffsetStart = this._hazardDayOffset(match.startDate, todayUtcMs);
      const legacyOffsetEnd = this._hazardDayOffset(match.endDate, todayUtcMs);
      if (legacyOffsetEnd < legacyOffsetStart) continue; // inverted span, contained

      if (match.group !== "precipitation" ||
          this._isFullNominalWindow(legacyOffsetStart, legacyOffsetEnd, match.dayRange)) {
        // HAZ-02: Temperature and Wildfire/Drought carry no per-day resolution and route
        // to the window band unconditionally; D-04's full-nominal-window guard routes a
        // Precipitation feature spanning its layer's entire nominal window there too.
        // Neither case reaches the day grid.
        continue;
      }

      // D-10: re-anchor onto the SPC 12Z grid using the NOMINAL start, never
      // `anchorInfo.day1StartMs` — 18-02 established that a truncated start shifts a
      // 00Z-aligned feature one grid day early.
      const gridStart = this._gridDayOf(match.startDate, anchorInfo.nominalStartMs);
      const gridEnd = this._gridDayOf(match.endDate, anchorInfo.nominalStartMs);

      // D-21 (supersedes 18-10's `Math.max(gridStart, gridEnd - 1)`): the Hazards
      // Outlook `end_date` endpoint is read INCLUSIVELY, matching `_bucketHazardMatch`'s
      // own day loop (`d <= Math.min(offsetEnd, lastDay)`, both ends inclusive). The
      // upstream feed is not internally consistent about this endpoint — a live
      // 2026-09-05 poll returned a Precipitation feature (objectid 7917, "Heavy Rain")
      // with `start_date === end_date` (inclusive/zero-duration) alongside a Temperature
      // feature ("High Winds") with `end_date = start_date + 86400000` (exclusive) — see
      // 18-LIVE-CAPTURE.md's "Criterion 1" section. Only the Precipitation group reaches
      // this grid (every other group routes to the window band above), and Precipitation
      // is the group observed using the inclusive form, so inclusive reading matches the
      // one live sample that actually exercises this code path. 18-10's exclusive-leaning
      // expression tolerated both conventions only for a span confined to a single grid
      // day; for any longer span it silently lost the final day, which is the defect
      // MERGE-01/D-01 parity with the legacy block (whose loop is inclusive on both ends)
      // exists to close, and which this project's no-false-negative rule breaks the tie
      // toward. Clamp stays at the loop header (T-18-03/T-16-05), never in the body, so a
      // hostile span still cannot iterate past fourteen days — widening this bound to
      // `gridEnd` does not touch that clamp.
      const lastGridDay = gridEnd;
      const clampedStart = Math.max(gridStart, 1);
      const clampedEnd = Math.min(lastGridDay, GRID_DAY_COUNT);
      if (clampedEnd < clampedStart) continue; // clamped range is empty; skip entirely

      // D-11/resolveStyle's convention, reused rather than reimplemented: a label present
      // in the registry's own displayColor map is "mapped"; every mapped label is
      // guaranteed a HAZARD_TAXONOMY entry (hazardTaxonomy.js derives its key set from
      // this same map at require() time), so `dimension === null` and `!mapped` agree.
      const mapped = Object.prototype.hasOwnProperty.call(row.displayColor, match.label);
      const color = mapped ? row.displayColor[match.label] : row.defaultColor;
      const dimension = dimensionOf("wpc-hazards", match.label);

      if (dimension === null) {
        // D-07: record the pass-through label once per source (capped, deduped) so it is
        // diagnosable from a captured payload, reusing the existing process-lifetime
        // ledger and truncation (16 D-11's pattern) rather than a second one.
        notes.noteUnmapped("wpc-hazards", match.label);
        const logKey = String(match.label).slice(0, HAZARDS_LOG_LABEL_MAX_CHARS);
        if (!this._loggedUnmappedHazardLabels.has(logKey) &&
            this._loggedUnmappedHazardLabels.size < HAZARDS_MAX_LOGGED_UNMAPPED_LABELS) {
          this._loggedUnmappedHazardLabels.add(logKey);
          Log.info(
            "MMM-SPCOutlook hazardsOutlook: unmapped hazard label rendered verbatim in the default style: " + logKey
          );
        }
      }

      for (let d = clampedStart; d <= clampedEnd; d++) {
        // NO_RISK_FLOOR["wpc-hazards"] is FLOOR_PREBAKED: this service has no severity
        // ladder anywhere in its schema (no valueToTier/includesFeat on the registry
        // row), so a label reaching the day grid at all IS an above-floor claim — for
        // THIS product only, "reported" and "active" coincide. That does NOT hold for
        // the other five sources; a reader who assumes it generally will misread
        // `sources[].reporting`.
        notes.noteReported("wpc-hazards", d);
        notes.noteActive("wpc-hazards", d);

        const dayEntry = gridDays[String(d)];
        if (!dayEntry) continue; // defensive; unreachable given the clamp above

        // Dedupe by label within a grid day — two layers can contribute the same label
        // to the same day, matching the legacy block's `seenLabels` behaviour.
        if (dayEntry.hazards.some((h) => h.source === "wpc-hazards" && h.label === match.label)) {
          continue;
        }

        dayEntry.hazards.push({
          dimension,
          source: "wpc-hazards",
          label: match.label,
          // This service's label IS its display text — there is no separate text map to
          // look for.
          text: match.label,
          // This service has no severity ladder anywhere in its schema, so presence is
          // the only signal.
          value: null,
          color,
          suppressedBy: null
        });
      }
      // Sorting is plan 18-05's job (D-15's taxonomy category order) — do not add a
      // second sort here.
    }
  },

  /**
   * Re-bucket the HeatRisk `gridTuples` side-channel (Task 1) onto the Phase 18 SPC 12Z
   * grid and append the resulting hazard entries to `gridDays[N].hazards` in place.
   * MERGE-01/D-10/D-13.
   *
   * HeatRisk's `idp_validtime` is a point sample observed at exactly 12:00:00Z on every
   * sample to date, so mapping it onto the grid is a near-identity — the raw timestamp
   * already sits on a grid boundary. This function therefore needs NO interval-overlap
   * logic, unlike `_addHazardsOutlookGridEntries`'s span-clamped loop; do not "fix" this
   * into matching that one (hazardTaxonomy.js's own maintainer note makes the same point).
   *
   * @param gridDays - the fourteen-key `days` skeleton from `_buildGridDays`, mutated in place
   * @param gridTuples - the raw `{ idpValidtime, category, idpFiledate }` array from
   *   `_runHeatRiskProduct`'s Task 1 side-channel — every deduped catalog tuple this poll
   *   saw, UNFILTERED by that runner's own `_todayUtcMs`-relative span (D-01)
   * @param anchorInfo - the object `_spcGridAnchor` returns
   * @param notes - `{ noteReported, noteActive, noteUnmapped }`, declared by 18-02 in
   *   `getSpcOutlook`'s scope and passed in explicitly so this method stays pure over its
   *   arguments rather than reaching for `this`
   */
  _addHeatRiskGridEntries(gridDays, gridTuples, anchorInfo, notes) {
    const row = PRODUCT_REGISTRY.heatRisk;
    const hazardsRow = PRODUCT_REGISTRY.hazardsOutlook;
    const floor = NO_RISK_FLOOR.heatrisk;

    for (const tuple of gridTuples) {
      // Contain a malformed tuple here so its siblings still land (CR-02 lesson).
      if (!tuple || typeof tuple.idpValidtime !== "number" || !Number.isFinite(tuple.idpValidtime)) {
        continue;
      }

      const gridDay = this._gridDayOf(tuple.idpValidtime, anchorInfo.nominalStartMs);
      // CR-02: GRID_DAY_COUNT is the only bound here expressed in grid-day units.
      // `row.days` states HeatRisk's span in its own UTC-midnight-anchored product-day
      // numbering, and cannot be compared against a grid day: the two numbering systems
      // differ by exactly one for the whole 00Z-12Z half of every UTC day, because
      // `_spcGridAnchor`'s `getUTCHours() < 12` clock fallback resolves `nominalStartMs`
      // to YESTERDAY 12Z during that half. Comparing against `row.days` dropped the
      // outermost tile BEFORE `noteReported` ran below, which also erased that day from
      // `sources['heatrisk'].reportedDays` and collapsed D-14's absent-versus-below-floor
      // distinction. `_addHazardsOutlookGridEntries` clamps the same grid the same way,
      // by GRID_DAY_COUNT alone.
      if (gridDay < 1 || gridDay > GRID_DAY_COUNT) continue;

      const dayEntry = gridDays[String(gridDay)];
      if (!dayEntry) continue; // defensive; unreachable given the range check above

      // D-04/D-16: recorded for EVERY tuple that survives the range checks above, before
      // any category test — including a tuple whose category is `null` or `0`. This is
      // the load-bearing call: `reportedDays` means "this source produced a reading for
      // that grid day", which is what keeps "HeatRisk said Little to No Risk"
      // distinguishable from "HeatRisk had nothing for that day" in a captured payload.
      // HeatRisk is rank 1 for the `heat` dimension, so this is the one non-SPC dimension
      // where the absent-versus-below-floor distinction actually decides a suppression
      // outcome. Omitting this call also leaves `sources['heatrisk'].reporting`
      // permanently `false` and silently undercounts `summary.reportingSourceCount`.
      notes.noteReported("heatrisk", gridDay);

      // D-13: `category: null` means "no reading" — a non-reading must leave lower-ranked
      // sources visible rather than create an entry that could suppress them. 17 D-02's
      // raw-category preservation still stands and is exactly what the floor predicate
      // below reads; D-13 revises 17 D-02's stated rationale (the null-vs-0 split is not
      // what makes MERGE-03 decidable — the floor test is) without retiring the
      // distinction itself.
      if (typeof tuple.category !== "number") continue;

      // On a collision (two tuples resolving to the same grid day) keep the MAXIMUM
      // category, mirroring `_runHeatRiskProduct`'s own rule: arrival order is not
      // evidence, and this project does not downgrade a severity on its say-so.
      const existing = dayEntry.hazards.find((h) => h.source === "heatrisk");
      if (existing && typeof existing.value === "number" && existing.value >= tuple.category) {
        continue; // an equal-or-higher heatrisk entry already won this day
      }

      // D-13: a below-floor reading (category 0) is not an active hazard and must not
      // become a renderable entry — plan 18-05 records that the source nonetheless
      // REPORTED for that day (via noteReported above), which is how "HeatRisk said
      // Little to No Risk" stays distinguishable from "HeatRisk had nothing" in a
      // captured payload. `existing` is never above-floor-then-erased here: an entry only
      // ever exists once it has already passed this same floor test (below), and the
      // collision check above already retired any candidate that could not beat it.
      if (!floor(tuple.category)) continue;

      notes.noteActive("heatrisk", gridDay);

      const category = tuple.category;
      const hasText = Object.prototype.hasOwnProperty.call(row.valueToText, category);
      const hasColor = Object.prototype.hasOwnProperty.call(row.valueToColor, category);
      const dimension = dimensionOf("heatrisk", category);

      const entry = hasText && hasColor
        ? {
            dimension,
            source: "heatrisk",
            label: String(category),
            text: row.valueToText[category],
            value: category,
            color: row.valueToColor[category],
            suppressedBy: null
          }
        : {
            // D-07: a category outside 0-4 is exactly the upstream schema change this
            // pass-through path exists to keep visible.
            dimension: null,
            source: "heatrisk",
            label: String(category),
            text: "HeatRisk " + category,
            value: category,
            color: hazardsRow.defaultColor,
            suppressedBy: null
          };

      if (!hasText || !hasColor) {
        notes.noteUnmapped("heatrisk", String(category));
      }

      if (existing) {
        const idx = dayEntry.hazards.indexOf(existing);
        dayEntry.hazards.splice(idx, 1, entry);
      } else {
        dayEntry.hazards.push(entry);
      }
    }
    // Sorting is plan 18-05's job (D-15's taxonomy category order) — do not add a second
    // sort here.
  },

  /**
   * MERGE-01/D-01/D-05/D-11/D-13/D-14: re-bucket SPC convective (grid days 1-8) and SPC
   * fire weather (grid days 1-8) onto the Phase 18 grid, reading the SAME inline locals
   * the legacy `day1`..`day8`/`fireWeather` blocks below are built from — no second
   * fetch, no second evaluation. `spc-convective` and `spc-fire` predate the registry
   * (14 D-08), so unlike `_addHazardsOutlookGridEntries`/`_addHeatRiskGridEntries` there
   * is no `results.<id>.payload` to iterate; `spcLocals` is a plain object built at the
   * call site from the existing named locals (D-01's shared-in-memory-values constraint
   * made concrete).
   *
   * D-11: every 12Z product's native day index equals the grid index at every hour, so
   * SPC day N maps to grid day N directly. This function never calls `_gridDayOf` —
   * reaching for it here would reintroduce the exact off-by-one D-11 exists to prevent.
   *
   * @param gridDays - the fourteen-key `days` skeleton from `_buildGridDays`, mutated in place
   * @param spcLocals - { extended, riskToValue, valueToFullRisk, riskToColor,
   *   fireRiskToValue, fireValueToFull, fireRiskToColor, categorical: { 1..3: {...} },
   *   probabilistic: { 4..8: {...} }, fire: { 1..8: number } } — see call site
   * @param notes - `{ noteReported, noteActive, noteUnmapped }`
   */
  _addSpcGridEntries(gridDays, spcLocals, notes) {
    const {
      extended, riskToValue, valueToFullRisk, riskToColor,
      fireRiskToValue, fireValueToFull, fireRiskToColor
    } = spcLocals;
    const floor = NO_RISK_FLOOR["spc-convective"];
    const fireFloor = NO_RISK_FLOOR["spc-fire"];

    // D-05: reversed out of fireRiskToValue rather than a second hardcoded token table —
    // no existing local already holds a value->token map for fire weather.
    const fireValueToRisk = {};
    for (const token of Object.keys(fireRiskToValue)) {
      fireValueToRisk[fireRiskToValue[token]] = token;
    }

    // Convective, grid days 1-3: categorical plus each day's own probabilistic breakdown.
    // Days 1-3 are fetched unconditionally — no `extended` gate here (D-14).
    for (let d = 1; d <= 3; d++) {
      const day = spcLocals.categorical[d];
      // T-18-04 containment: a malformed local (never observed live; evaluatePolygons'
      // domain is bounded 0-6 by construction) must not take its sibling days down with it.
      if (typeof day.risk !== "string") continue;

      // A day-1/2/3 categorical fetch always runs, and a clean "NONE" answer IS a report —
      // that is what keeps "SPC forgot to report" distinguishable from "SPC reported
      // below-floor" (D-14's nuance).
      notes.noteReported("spc-convective", d);

      const value = day.risk === "NONE"
        ? 0
        : (Object.prototype.hasOwnProperty.call(riskToValue, day.risk) ? riskToValue[day.risk] : undefined);
      if (value === undefined) {
        // D-07: an unrecognised categorical token (never observed live; risk is always
        // "NONE" or one of riskToValue's own keys) passes through verbatim rather than
        // emitting `undefined` into the payload.
        notes.noteUnmapped("spc-convective", day.risk);
        const dayEntry = gridDays[String(d)];
        if (dayEntry) {
          dayEntry.hazards.push({
            dimension: null, source: "spc-convective", label: day.risk, text: day.risk,
            value: null, color: null, suppressedBy: null
          });
        }
        continue;
      }

      // D-13: TSTM (General Thunderstorms) and NONE both fail the floor — neither is an
      // active claim. `reportedDays` already recorded this day above.
      if (!floor.categorical(value)) continue;

      notes.noteActive("spc-convective", d);

      // D-05: SPC's own tornado/hail/wind (days 1-2) or probRisk/cig (day 3) breakdown
      // rides as an optional `detail` sub-object on this single `convective` entry, never
      // as separate dimensions. Omitted entirely when every field is null/zero/false, so
      // the payload does not carry an empty sub-object on every day.
      const detail = d === 3
        ? { probRisk: day.probRisk, cig: day.cig }
        : {
            probRisk: day.probRisk, torRisk: day.torRisk, torCig: day.torCig,
            hailRisk: day.hailRisk, hailCig: day.hailCig, windRisk: day.windRisk, windCig: day.windCig
          };
      const hasDetail = Object.values(detail).some((v) => !!v);

      const dayEntry = gridDays[String(d)];
      if (dayEntry) {
        dayEntry.hazards.push({
          dimension: dimensionOf("spc-convective", day.risk),
          source: "spc-convective",
          label: day.risk,
          text: valueToFullRisk[day.risk],
          value,
          color: riskToColor[day.risk],
          suppressedBy: null,
          ...(hasDetail ? { detail } : {})
        });
      }
    }

    // Convective, grid days 4-8: probabilistic-only (D-14's fact correction — SPC covers
    // days 1-8, not 1-3; the coverage boundary that matters for `convective` precedence
    // is day 8, not day 3). Fetched only when `extended` is true — with `extended: false`
    // these locals hold the zero/no-risk defaults from a fetch that never happened, so
    // `noteReported` must not fire for them (a false "answered" claim in the one field
    // that exists to distinguish "no answer" from "answered no risk").
    for (let d = 4; d <= 8; d++) {
      if (!extended) continue;

      const day = spcLocals.probabilistic[d];
      if (typeof day.risk !== "string") continue; // T-18-04 containment; unreachable today

      notes.noteReported("spc-convective", d);

      // percToRisk returns "NONE" only when the percent is exactly 0 — the "no
      // probabilistic area / predictability too low" floor for this day range.
      if (!floor.probabilistic(day.risk)) continue;

      notes.noteActive("spc-convective", d);

      const dayEntry = gridDays[String(d)];
      if (dayEntry) {
        dayEntry.hazards.push({
          dimension: dimensionOf("spc-convective", day.risk),
          source: "spc-convective",
          label: day.risk,
          text: valueToFullRisk[day.risk],
          value: riskToValue[day.risk],
          color: riskToColor[day.risk],
          suppressedBy: null,
          detail: { probRisk: day.probRisk, sign: day.sign }
        });
      }
    }

    // Fire weather, grid days 1-8. Three reachable states per day: ACTIVE (value > 0,
    // reported and active), ANSWERED-NO-AREA (value === 0 on a fetched day — reported,
    // not active, a real "no fire weather area covers this location" reading), and
    // ABSENT (grid days 9-14 always, plus days 3-8 under extended: false — not reported
    // at all). fireRiskToValue's three tiers are all >= 1 with no sub-ELEV rung, so the
    // floor test is `value > 0` rather than a tier comparison (NO_RISK_FLOOR["spc-fire"]).
    // Days 1-2 are fetched unconditionally; days 3-8 only when `extended` is true.
    for (let d = 1; d <= 8; d++) {
      if (d >= 3 && !extended) continue;

      const value = spcLocals.fire[d];
      if (typeof value !== "number") continue; // T-18-04 containment; unreachable today

      notes.noteReported("spc-fire", d);

      if (!fireFloor(value)) continue; // value === 0: ANSWERED-NO-AREA, reported but not active

      notes.noteActive("spc-fire", d);

      const label = fireValueToRisk[value];
      const dayEntry = gridDays[String(d)];
      if (dayEntry) {
        dayEntry.hazards.push({
          dimension: dimensionOf("spc-fire", label),
          source: "spc-fire",
          label,
          text: fireValueToFull[value],
          value,
          color: fireRiskToColor[value],
          suppressedBy: null
        });
      }
    }
    // Sorting is plan 18-05's job (D-15's taxonomy category order) — do not add a second
    // sort here.
  },

  /**
   * MERGE-01/D-01/D-05/D-11/D-13: re-bucket one `arcgis-day-layers` registry product
   * (`wpc-ero` via `excessiveRain`, `wpc-wssi` via `winterImpact`) onto the Phase 18 grid,
   * reading the SAME flat `day{N}Risk/Text/Color/ValidTime` payload
   * `_runArcGisDayProduct` already built — no second fetch, no re-derivation. Both
   * products are 12Z-native, so D-11's straight-through rule applies: payload day N is
   * grid day N. This function never calls `_gridDayOf`.
   * @param gridDays - the fourteen-key `days` skeleton from `_buildGridDays`, mutated in place
   * @param sourceId - "wpc-ero" or "wpc-wssi"
   * @param payload - eroPayload or wssiPayload, the existing flat day{N}Risk/Text/Color block
   * @param row - PRODUCT_REGISTRY.excessiveRain or .winterImpact — WR-16: the row's own
   *   `days` is the sole iteration bound, never a literal 5 or 3
   * @param notes - `{ noteReported, noteActive, noteUnmapped }`
   * @param productToggles - this request's own toggle snapshot (WR-13); the row's own
   *   `configFlag` is read from here, never from `this._products`, so this function stays
   *   pure with respect to helper-global state. Needed because `_runArcGisDayProduct`
   *   seeds every `day{N}Risk` to the string `"NONE"` BEFORE its own fetch gate (Phase 14
   *   D-05's payload-shape invariant) — a string tier is present whether or not a fetch
   *   ever ran, so without this gate `reportedDays` would claim an answer the product was
   *   never asked for (see `deferred-items.md`'s first entry).
   */
  _addRegistryDayGridEntries(gridDays, sourceId, payload, row, notes, productToggles) {
    const floor = NO_RISK_FLOOR[sourceId];

    // MERGE-01/deferred-items.md fix: mirror _runArcGisDayProduct's own fetch gate. The
    // toggle being off never changes payload shape (Phase 14 D-05), but it must mean this
    // function reports nothing — skipping the whole day loop, including noteReported,
    // noteActive and entry assembly together, rather than adding a second, differently
    // shaped gate. Strict `!== true` matches T-18-14/_buildSourceHealth's own `=== true`
    // idiom so a non-boolean config value can never read as enabled.
    if (productToggles[row.configFlag] !== true) return;

    // ERO's `dayNRisk` payload field carries the short tier ("MRGL"), not the long
    // "outlook" vocabulary hazardTaxonomy.js's wpc-ero map is keyed on ("Marginal (At
    // Least 5%)", live-verified in 18-RESEARCH.md/STACK.md). No registry map carries that
    // long form — ERO's own `toValue` only reads the numeric `dn` field — so this
    // translates the SAME tier value the payload field was already built from
    // (row.valueToTier) into the taxonomy's own label vocabulary, rather than declaring a
    // second (source, label) -> dimension map. WSSI needs no translation: row.valueToTier's
    // tiers (MINOR/MODERATE/MAJOR/EXTREME) are already the taxonomy's raw uppercase
    // `impact` vocabulary verbatim.
    const eroTierToOutlookLabel = {
      MRGL: "Marginal (At Least 5%)",
      SLGT: "Slight (At Least 15%)",
      MDT: "Moderate (At Least 40%)",
      HIGH: "High (At Least 70%)"
    };

    // The numeric tier `_runArcGisDayProduct` already resolved, reversed out of the SAME
    // registry map the payload's tier string was built from — never a second value table.
    const valueByTier = {};
    for (const numericValue of Object.keys(row.valueToTier)) {
      valueByTier[row.valueToTier[numericValue]] = Number(numericValue);
    }

    for (let d = 1; d <= row.days; d++) {
      const tier = payload[`day${d}Risk`];
      // T-18-04 containment; unreachable today — _runArcGisDayProduct always seeds every
      // day with a string tier before this function ever runs.
      if (typeof tier !== "string") continue;

      notes.noteReported(sourceId, d);

      if (floor !== FLOOR_PREBAKED) {
        // Both callers' floor is prebaked at fetch-evaluate time by their own registry
        // row's `includesFeat` gate; a non-prebaked floor here means this function was
        // wired to a source it was never designed for.
        throw new Error(
          "_addRegistryDayGridEntries: NO_RISK_FLOOR[\"" + sourceId + "\"] is not FLOOR_PREBAKED"
        );
      }
      // FLOOR_PREBAKED: "NONE" is this product's only below-floor tier — ERO's
      // `includesFeat: (label, val) => val > 0` and WSSI's `includesFeat: (label, val) =>
      // val >= 2` (which filters WINTER WEATHER AREA out before evaluatePolygons ever
      // sees it) already applied the floor at extractPolygons time.
      if (tier === "NONE") continue;

      notes.noteActive(sourceId, d);

      const label = sourceId === "wpc-ero"
        ? (Object.prototype.hasOwnProperty.call(eroTierToOutlookLabel, tier) ? eroTierToOutlookLabel[tier] : tier)
        : tier;
      const dimension = dimensionOf(sourceId, label);

      if (dimension === null) {
        // D-07: a label with no taxonomy entry passes through verbatim rather than being
        // dropped or emitting `undefined`.
        notes.noteUnmapped(sourceId, label);
      }

      const dayEntry = gridDays[String(d)];
      if (dayEntry) {
        dayEntry.hazards.push({
          dimension,
          source: sourceId,
          label,
          text: payload[`day${d}Text`],
          value: Object.prototype.hasOwnProperty.call(valueByTier, tier) ? valueByTier[tier] : null,
          color: payload[`day${d}Color`],
          suppressedBy: null
        });
      }
    }
    // Sorting is plan 18-05's job (D-15's taxonomy category order) — do not add a second
    // sort here.
  },

  /**
   * MERGE-02/MERGE-03/MERGE-04/D-13/D-14/D-15: resolve cross-source precedence for ONE
   * grid day, in place, and order that day's `hazards` array. Pure — no I/O, no clock
   * read, no second fetch or re-derivation of any raw source value.
   *
   * Per dimension present among this day's entries, the winner is the FIRST source id in
   * `PRECEDENCE[dimension]` that has an entry on this day. Every entry that survives to
   * `day.hazards` already passed its own source's no-risk floor at creation time
   * (18-03/18-04's entry-creation-time floor test), so "has an entry" already means "made
   * an active claim" — this method never re-consults `NO_RISK_FLOOR`. The winner's
   * entries keep `suppressedBy: null`; every other entry on that dimension is marked
   * `suppressedBy: <winner's source id>`. Read (and log, if a caller ever logs this) as
   * "dimension X resolved to source Y for grid day N" — resolving a competing claim,
   * never one source silencing another (D-13's specifics note).
   *
   * `dimension: null` entries (D-07 unmapped) never participate: they are excluded from
   * resolution entirely and always keep the `suppressedBy: null` they were created with.
   *
   * @param day - one entry of `gridDays`, `{ date, windowStart, windowEnd, hazards }`,
   *   mutated in place
   * @param dayNumber - this day's 1-based grid day number
   * @param reportedDays - `{ [sourceId]: Set<number> }`, lazily keyed; used ONLY to keep
   *   "rank source absent for this grid day" and "rank source reported but fell below its
   *   own floor" as two distinct, individually commented code paths below (D-14's
   *   RESEARCH.md requirement) — it never changes which source wins, since a source with
   *   no entry cannot win either way. The distinction itself is not written to the
   *   payload; it stays inspectable via `sources[].reportedDays` vs `.activeDays` (Task 3).
   */
  _resolveGridDayPrecedence(day, dayNumber, reportedDays) {
    const byDimension = {};
    for (const entry of day.hazards) {
      if (entry.dimension === null) continue; // D-07: never suppresses, never suppressed
      if (!byDimension[entry.dimension]) byDimension[entry.dimension] = [];
      byDimension[entry.dimension].push(entry);
    }

    for (const dimension of Object.keys(byDimension)) {
      const rankOrder = PRECEDENCE[dimension];
      if (!Array.isArray(rankOrder)) {
        // assertTaxonomyIntegrity rejects an unresolvable dimension at module load time,
        // so this branch is unreachable in practice (T-18-15 containment anyway): this
        // one dimension's entries degrade to their creation-time `suppressedBy: null`
        // rather than throwing past the rest of the day's hazards list.
        continue;
      }

      const entriesBySource = {};
      for (const entry of byDimension[dimension]) {
        entriesBySource[entry.source] = entry;
      }

      let winnerSourceId = null;
      for (const sourceId of rankOrder) {
        if (entriesBySource[sourceId]) {
          winnerSourceId = sourceId;
          break;
        }
        // This rank position made no claim on this dimension for this day. Two distinct
        // facts produce the identical visible outcome here (the walk simply continues to
        // the next rank) but must never be conflated by a future reader:
        const reportedForDay = !!(reportedDays[sourceId] && reportedDays[sourceId].has(dayNumber));
        if (reportedForDay) {
          // Path A — "reported below floor": this source produced a reading for this
          // grid day (present in `reportedDays`) but it did not clear its own no-risk
          // floor at entry-creation time, so no entry exists here to have won with. The
          // floor was already consulted upstream (18-03/18-04); this method does not
          // re-consult it.
        } else {
          // Path B — "absent": this source never produced a reading for this grid day at
          // all (no `reportedDays` key, or no entry for this day number). The no-risk
          // floor is never consulted for an absent source — there is nothing to test.
        }
      }
      // Every entry in `entriesBySource` names a source that HAZARD_TAXONOMY maps to this
      // dimension, and `assertTaxonomyIntegrity` guarantees every such source appears in
      // `PRECEDENCE[dimension]` — so `winnerSourceId` is always resolved once this
      // dimension has at least one entry.
      for (const entry of byDimension[dimension]) {
        entry.suppressedBy = entry.source === winnerSourceId ? null : winnerSourceId;
      }
    }

    // D-15: fixed taxonomy category order, survivors before suppressed within one
    // dimension, then `PRECEDENCE` rank, then label — a total, deterministic order so two
    // polls over an unchanged forecast produce byte-identical arrays, the same reason
    // `compareLabels` exists (node_helper.js:872-876). Unmapped (`dimension: null`)
    // entries sort after every dimensioned entry, alphabetically by label, matching that
    // same convention.
    const dimensionIndex = (entry) => {
      if (entry.dimension === null) return DIMENSION_ORDER.length;
      const idx = DIMENSION_ORDER.indexOf(entry.dimension);
      return idx === -1 ? DIMENSION_ORDER.length : idx;
    };
    const rankIndex = (entry) => {
      if (entry.dimension === null) return 0;
      const order = PRECEDENCE[entry.dimension];
      if (!Array.isArray(order)) return 0;
      const idx = order.indexOf(entry.source);
      return idx === -1 ? order.length : idx;
    };
    day.hazards.sort((a, b) => {
      const dimDiff = dimensionIndex(a) - dimensionIndex(b);
      if (dimDiff !== 0) return dimDiff;
      const survivorDiff = (a.suppressedBy === null ? 0 : 1) - (b.suppressedBy === null ? 0 : 1);
      if (survivorDiff !== 0) return survivorDiff;
      const rankDiff = rankIndex(a) - rankIndex(b);
      if (rankDiff !== 0) return rankDiff;
      return a.label.localeCompare(b.label);
    });
  },

  /**
   * D-16/D-20/RPT-05: roll up the fourteen already-resolved grid days, the Hazards
   * Outlook window band, and the two advisory arrays into the single `summary` object
   * Phase 19 reads to decide the empty state in one read. This is a ROLLUP of
   * already-resolved results, never a second precedence pass (D-14): it never calls
   * `_resolveGridDayPrecedence`, never consults `PRECEDENCE` or `NO_RISK_FLOOR`, and
   * never reads a raw source value. Whole-window resolution would let a source suppress
   * entries on days it never covered — SPC winning days 1-8 must not erase `convective`
   * on days 9-14, where SPC never reports — and a second pass over the raw sources is
   * exactly what would let `summary` and `days` disagree about what is present.
   *
   * `anyHazard` is a UNION over three independent signals (day-scoped survivors, the
   * window band, and both advisory arrays), not a day-scoped-only derivative. This union
   * is D-16's own stated purpose — make RPT-05 decidable in one read — not an extension
   * of it: a day-scoped-only `anyHazard` reproduces Phase 15's `getDom` no-risk gate that
   * made an advisory-only MPD state read as an all-clear, and the still-unexercised
   * Phase 16 case where a window-band entry with every other product NONE must not
   * render "No Severe Weather Risk" either.
   *
   * @param gridDays - the resolved fourteen-key `days` object; every entry has already
   *   passed through `_resolveGridDayPrecedence`
   * @param windowBand - `hazardsPayload.windowBand`, the non-day-scoped Hazards Outlook band
   * @param advisories - `{ spcMD: [...], mpd: [...] }`
   * @param sourceHealth - the `sources` object `_buildSourceHealth` returns (Task 3);
   *   this method only counts over it, never rebuilds it
   * @param anchorInfo - accepted for the parameter contract Task 3's call site fills in;
   *   unused here — `windowStart`/`windowEnd` are read from `gridDays` itself (D-12) so
   *   `summary` and `days` can never disagree about a boundary the anchor would
   *   otherwise have to re-derive
   * @returns { anyHazard, dimensions, activeDays, windowStart, windowEnd,
   *   enabledSourceCount, reportingSourceCount, bandDiagnostics: { windowBandCount,
   *   advisoryCount } } — D-16's seven fields flat and exactly as locked, plus D-20's
   *   nested `bandDiagnostics` extension
   */
  _buildGridSummary(gridDays, windowBand, advisories, sourceHealth, anchorInfo) {
    void anchorInfo; // parameter-contract only; see JSDoc above

    const dimensionsSeen = new Set();
    const activeDaysList = [];
    let anyDayHazard = false;

    for (let d = 1; d <= GRID_DAY_COUNT; d++) {
      const day = gridDays[String(d)];
      let dayHasSurvivor = false;
      for (const entry of day.hazards) {
        if (entry.suppressedBy !== null) continue;
        dayHasSurvivor = true;
        // D-07: an unmapped survivor counts toward `anyHazard` without inventing a
        // dimension string for `dimensions`.
        if (entry.dimension !== null) dimensionsSeen.add(entry.dimension);
      }
      if (dayHasSurvivor) {
        anyDayHazard = true;
        activeDaysList.push(d);
      }
    }

    const windowBandCount = Array.isArray(windowBand) ? windowBand.length : 0;
    const advisoryCount =
      (Array.isArray(advisories && advisories.spcMD) ? advisories.spcMD.length : 0) +
      (Array.isArray(advisories && advisories.mpd) ? advisories.mpd.length : 0);

    const anyHazard = anyDayHazard || windowBandCount > 0 || advisoryCount > 0;

    // D-15's fixed taxonomy order, never Object.keys() of a Set (which is
    // insertion-ordered, not taxonomy-ordered).
    const dimensions = DIMENSION_ORDER.filter((dimension) => dimensionsSeen.has(dimension));

    let enabledSourceCount = 0;
    let reportingSourceCount = 0;
    for (const sourceId of Object.keys(sourceHealth)) {
      if (sourceHealth[sourceId].enabled) enabledSourceCount++;
      if (sourceHealth[sourceId].reporting) reportingSourceCount++;
    }

    return {
      anyHazard,
      dimensions,
      activeDays: activeDaysList,
      windowStart: gridDays["1"].windowStart,
      windowEnd: gridDays[String(GRID_DAY_COUNT)].windowEnd,
      enabledSourceCount,
      reportingSourceCount,
      bandDiagnostics: { windowBandCount, advisoryCount }
    };
  },

  /**
   * D-01/D-04/D-08/D-12: per-product health for every id in `hazardTaxonomy.SOURCE_IDS`,
   * all eight always present regardless of any toggle — the same shape invariant D-02
   * gives `days`.
   *
   * `reporting` means "we got an answer this poll", NEVER "it found a hazard" — that is
   * `activeDays`. For the six day-scoped sources this reads `reportedDays[id]` (lazily
   * keyed; an absent key is a legitimate "reported nothing", not an error). For the two
   * advisory sources, whose entries never live in `reportedDays` (they are not
   * day-scoped), it is "the row's fetch completed without being marked stale, while its
   * toggle is on" — `_runKmlAdvisoryRow` itself never fetches at all when its toggle is
   * off (node_helper.js:1475-1478), so gating on `enabled` here mirrors that same rule
   * rather than inventing a second one.
   *
   * `reportedDays`/`activeDays` is the SAME absent-vs-below-floor distinction
   * `_resolveGridDayPrecedence` reads (D-14): a grid day absent from `reportedDays` means
   * the source never covered that day at all; a day present in `reportedDays` but absent
   * from `activeDays` means the source reported and its own reading fell below its floor.
   * This is what makes that distinction diagnosable from a captured payload without a
   * dedicated payload field for it.
   *
   * @param productToggles - this request's own toggle snapshot (WR-13)
   * @param reportedDays / activeDays / unmappedLabels - the lazily-keyed accumulators
   *   `getSpcOutlook` declares immediately before the grid-entry-assembly calls
   * @param staleBySource - `{ [sourceId]: boolean }`, lazily keyed; an absent key reads
   *   as `false`
   * @param gridAnchorInfo - the object `_spcGridAnchor` returned this poll
   * @param results - the settled runner-results object, read only for
   *   `results.hazardsOutlook.idpFiledate` / `results.heatRisk.idpFiledate` — 16 D-13:
   *   only these two products publish an `idp_filedate`, so every other source's field is
   *   `null`, meaning "this product has no such field", not "unknown"
   * @returns object keyed by every `SOURCE_IDS` entry, `{ id, displayName, enabled,
   *   reporting, stale, idpFiledate, reportedDays, activeDays, unmappedLabels,
   *   gridAnchor? }` — `gridAnchor` present only on `spc-convective` (D-12)
   */
  _buildSourceHealth(productToggles, reportedDays, activeDays, unmappedLabels, staleBySource, gridAnchorInfo, results) {
    const displayNames = {
      "spc-convective": "SPC Convective Outlook",
      "spc-fire": "SPC Fire Weather Outlook",
      "wpc-ero": "WPC Excessive Rainfall Outlook",
      "wpc-wssi": "WPC Winter Storm Severity Index",
      "wpc-hazards": "WPC/CPC Hazards Outlook",
      heatrisk: "NWS HeatRisk",
      "spc-md": "SPC Mesoscale Discussion",
      "wpc-mpd": "WPC Mesoscale Precipitation Discussion"
    };

    // The registry `configFlag` each toggled source reads its `enabled` bit from.
    // spc-convective/spc-fire predate the registry (14 D-08) and have no toggle at all —
    // they are the module's always-on core, handled as a special case below rather than
    // looked up here.
    const configFlagBySource = {
      "wpc-ero": PRODUCT_REGISTRY.excessiveRain.configFlag,
      "wpc-wssi": PRODUCT_REGISTRY.winterImpact.configFlag,
      "wpc-hazards": PRODUCT_REGISTRY.hazardsOutlook.configFlag,
      heatrisk: PRODUCT_REGISTRY.heatRisk.configFlag,
      "spc-md": PRODUCT_REGISTRY.spcMD.configFlag,
      "wpc-mpd": PRODUCT_REGISTRY.mpd.configFlag
    };

    const toAscendingArray = (setsBySource, sourceId) => {
      const set = setsBySource[sourceId];
      return set ? Array.from(set).sort((a, b) => a - b) : [];
    };

    const sources = {};
    for (const sourceId of SOURCE_IDS) {
      const isAlwaysOn = sourceId === "spc-convective" || sourceId === "spc-fire";
      // T-18-14: strict `=== true`, the same idiom node_helper.js:295/307 already use for
      // every other `configFlag` read, so a non-boolean config value can never read as
      // enabled.
      const enabled = isAlwaysOn ? true : productToggles[configFlagBySource[sourceId]] === true;

      // Rule 1 fix (now redundant, kept as defense-in-depth): `wpc-ero`/`wpc-wssi`'s
      // toggle-off default ("NONE" on every day, seeded by `_runArcGisDayProduct` before
      // its own `productToggles[row.configFlag]` fetch gate) used to make
      // `_addRegistryDayGridEntries` call `noteReported` for every day even when the
      // toggle never let a fetch happen. That over-population is now fixed at its source —
      // `_addRegistryDayGridEntries` itself skips the whole day loop when its own toggle
      // reads off, so `reportedDays` is correctly empty before `reporting` is ever derived
      // from it. Gating `reporting` on `enabled` here (for every source, not only the
      // advisory two) still stands independently and is the invariant 18-05's own
      // acceptance criteria pinned; a reader must be able to trust `enabled: false` to
      // mean `reporting` is also `false` even if a future source's own gate regresses.
      const isAdvisory = ADVISORY_SOURCE_IDS.includes(sourceId);
      const reporting = !enabled ? false : (isAdvisory
        ? staleBySource[sourceId] !== true
        : (reportedDays[sourceId] ? reportedDays[sourceId].size : 0) > 0);

      const idpFiledate =
        sourceId === "wpc-hazards" ? (results.hazardsOutlook.idpFiledate ?? null) :
        sourceId === "heatrisk" ? (results.heatRisk.idpFiledate ?? null) :
        null;

      sources[sourceId] = {
        id: sourceId,
        displayName: displayNames[sourceId],
        enabled,
        reporting,
        stale: staleBySource[sourceId] === true,
        idpFiledate,
        reportedDays: toAscendingArray(reportedDays, sourceId),
        activeDays: toAscendingArray(activeDays, sourceId),
        unmappedLabels: unmappedLabels[sourceId] || [],
        ...(sourceId === "spc-convective" ? { gridAnchor: gridAnchorInfo.anchor } : {})
      };
    }
    return sources;
  },

  /**
   * Fetch a GeoJSON URL with ETag/hash caching, returning parsed data or cached result on hit/error.
   * @param url - GeoJSON endpoint URL to fetch
   * @param isValidBody - body-shape validator for the cache-miss branches; defaults to
   *   `_isFeatureCollection` so every caller before this phase (SPC, fire weather, ERO,
   *   WSSI, Hazards Outlook) is byte-identical in behavior. HeatRisk is the first caller to
   *   pass a different validator: its identify response has no top-level `features` array at
   *   all (features live at `body.catalogItems.features`), so `_isFeatureCollection` would
   *   reject every single HeatRisk response as an unusable body, permanently. Phase 14's
   *   WR-08/CR-02 hardening is what put a shape check inside this function in the first
   *   place — this parameter generalizes that check rather than special-casing HeatRisk
   *   inside `_isFeatureCollection` or forking a second copy of this ~170-line function.
   * @returns object with { data, cachedResult, stale, mode, newEtag, newHash } — data is null on cache hit or error
   */
  async fetchGeoJsonCached(url, isValidBody = (body) => this._isFeatureCollection(body)) {
    // WR-09: `_geoJsonCache` is helper-global mutable state that four of PERF-01's six
    // concurrent batch members write, and unlike `_unusableFeatureCount` and
    // `_oldestStaleAt` its access pattern is a read-modify-write that SPANS an await —
    // `_geoJsonCachedInner` reads the entry, awaits `_fetch`, then writes the entry back.
    // check-concurrency-invariant.sh cannot express that invariant: the interleave point is
    // inherent to the pattern rather than an accident to be forbidden, so "no await in the
    // window" would be a guaranteed failure rather than a check. The safety argument here is
    // a different KIND of argument — it rests on the six members' URL keyspaces being
    // DISJOINT (four static base URLs, one lat/lon-derived identify URL, two host-scoped
    // discovery trees), so no two concurrent readers ever address the same cache entry.
    //
    // That premise was previously neither stated nor enforced. It is enforced here, and it
    // is enforced on the condition that actually matters rather than on member identity: a
    // torn entry requires two fetches for the SAME key to be in flight at the same time,
    // whoever issued them. A future product reusing a sibling's URL, a second module
    // instance polling a different location, or a discovery tree that starts emitting a
    // sibling's URL all produce exactly that, and all of them would otherwise be silent.
    // Detection is deliberately a loud log rather than a throw or a lock: serialising the
    // fetch would change behaviour to work around a bug that should be fixed, and throwing
    // would turn a latent correctness risk into an immediate outage.
    if (!this._inFlightCacheKeys) this._inFlightCacheKeys = new Map();
    const inFlightForUrl = this._inFlightCacheKeys.get(url) || 0;
    if (inFlightForUrl > 0 && !this._loggedCacheKeyContention) {
      this._loggedCacheKeyContention = true;
      Log.error(
        "MMM-SPCOutlook fetchGeoJsonCached: two fetches are in flight for the SAME _geoJsonCache key at " +
        "once (" + url + "). The concurrency-safety argument for _geoJsonCache in getSpcOutlook's batch " +
        "comment assumes every concurrent member addresses a DISJOINT set of URLs; that assumption no " +
        "longer holds, and the read-modify-write around the fetch can now produce a torn cache entry."
      );
    }
    this._inFlightCacheKeys.set(url, inFlightForUrl + 1);
    try {
      return await this._fetchGeoJsonCachedInner(url, isValidBody);
    } finally {
      const remaining = (this._inFlightCacheKeys.get(url) || 1) - 1;
      if (remaining <= 0) {
        this._inFlightCacheKeys.delete(url);
      } else {
        this._inFlightCacheKeys.set(url, remaining);
      }
    }
  },

  /**
   * The body of `fetchGeoJsonCached`, split out only so the wrapper above can do its
   * in-flight-key bookkeeping in a `finally` without threading one through this function's
   * many return points. Never call this directly — the wrapper is the contract.
   */
  async _fetchGeoJsonCachedInner(url, isValidBody = (body) => this._isFeatureCollection(body)) {
    const entry = this._geoJsonCache.get(url);

    const headers = {};
    if (entry && entry.mode === 'etag' && entry.etag) {
      headers['If-None-Match'] = entry.etag;
    }

    let res;
    try {
      // WR-07: `size` is node-fetch's own STREAMING cap and the only one of the three
      // bounds below that limits memory — it rejects mid-stream, so an oversized body is
      // never fully materialised. A runtime whose fetch ignores it still hits the
      // content-length precheck and the post-read check.
      res = await this._fetch(url, withTimeout({ headers, size: GEOJSON_MAX_BODY_BYTES }));
    } catch (err) {
      // Network error
      if (entry && this._isWithinStaleWindow(entry.timestamp, this._updateInterval)) {
        Log.info('MMM-SPCOutlook: stale fallback for ' + url);
        this._noteStaleEntry(entry);
        return { data: null, cachedResult: entry.result, stale: true };
      }
      // CR-03: with no usable cache entry this layer silently becomes "no risk". That is
      // indistinguishable from a genuine all-clear, so it must be loud in the log AND
      // flagged to the caller, which surfaces the ⚠ badge instead of a confident all-clear.
      Log.error('MMM-SPCOutlook: unrecoverable fetch failure for ' + url + ' (network error: ' +
                (err && err.message ? err.message : err) + ')');
      return { data: null, cachedResult: null, stale: false, failed: true };
    }

    // 304 Not Modified — ETag cache hit (no body, must check before res.text())
    if (res.status === 304) {
      // WR-14: a proxy can answer 304 to a request that carried no If-None-Match. Without
      // this guard the `entry.result` dereference throws into getSpcOutlook's shared catch
      // and nulls the entire payload over one layer.
      if (!entry) {
        Log.error('MMM-SPCOutlook: received 304 with no cache entry for ' + url + '; treating as a fetch failure');
        return { data: null, cachedResult: null, stale: false, failed: true };
      }
      Log.info('MMM-SPCOutlook: cache hit (ETag) for ' + url);
      // Upstream has just confirmed these bytes are unchanged, so this reading is as fresh
      // as a 200 carrying the same body. The entry's timestamp used to be written only on a
      // body CHANGE, which made it the age of the last edit rather than of the last
      // successful reading: an SPC layer that has been 304-confirmed hourly for a quiet
      // week carried a week-old timestamp, so the stale window (above) rejected it and the
      // next hiccup blanked the layer. Stamping the confirmation is what makes that window
      // mean "how long since we last heard from upstream", which is the question both it
      // and _noteStaleEntry's age badge are actually asking.
      // WR-05: through the `_nowMs()` seam, so it is comparable with _isWithinStaleWindow.
      entry.timestamp = this._nowMs();
      return { data: null, cachedResult: entry.result, stale: false };
    }

    // Non-ok HTTP response (not 304)
    if (!res.ok) {
      if (entry && this._isWithinStaleWindow(entry.timestamp, this._updateInterval)) {
        Log.info('MMM-SPCOutlook: stale fallback for ' + url);
        this._noteStaleEntry(entry);
        return { data: null, cachedResult: entry.result, stale: true };
      }
      // CR-03: see the network-error branch above — a 5xx/4xx with no usable cache entry
      // is the most likely production failure and must never degrade silently.
      Log.error('MMM-SPCOutlook: unrecoverable fetch failure for ' + url + ' (HTTP ' + res.status + ')');
      return { data: null, cachedResult: null, stale: false, failed: true };
    }

    // CR-02: an HTTP 200 whose body is unusable (ArcGIS REST returns most failures as a
    // 200 carrying an `error` object and no `features`; SPC can return an HTML error page)
    // must never reach extractPolygons and must never be written to _geoJsonCache. Caching
    // the resulting `0` under the bad body's ETag pins that layer to "no risk" behind every
    // later 304 — a silent, self-perpetuating false negative. Instead fall back to a
    // still-fresh cached result when one exists, exactly like the network-error path, and
    // always name the URL that degraded.
    //
    // WR-07: declared HERE, above the body read rather than below it, because the
    // over-limit body checks route through it — an oversized response is a degraded read
    // that must inherit the same stale-fallback and `failed` semantics as an unparseable
    // one, not a throw that escapes into getSpcOutlook's shared catch.
    const rejectBody = (reason) => {
      Log.error('MMM-SPCOutlook: rejected an unusable response body for ' + url + ' (' + reason + '); not caching');
      if (entry && entry.result !== null && entry.result !== undefined &&
          this._isWithinStaleWindow(entry.timestamp, this._updateInterval)) {
        this._noteStaleEntry(entry);
        return { data: null, cachedResult: entry.result, stale: true, failed: true };
      }
      return { data: null, cachedResult: null, stale: false, failed: true };
    };

    // WR-07: refuse an HONESTLY declared oversized body before a single byte is read.
    // Note `Number(null)` is 0, not NaN, so a response with no content-length header
    // passes this check and is caught by `size` and the post-read bound instead.
    const declaredBytes = res.headers && typeof res.headers.get === "function"
      ? Number(res.headers.get('content-length'))
      : NaN;
    if (Number.isFinite(declaredBytes) && declaredBytes > GEOJSON_MAX_BODY_BYTES) {
      return rejectBody('declared body of ' + declaredBytes + ' bytes exceeds the ' +
                        GEOJSON_MAX_BODY_BYTES + '-byte bound');
    }

    // HTTP 200 — read raw text. CR-02: the body read has to be contained by the same
    // branch that owns network-failure policy. A connection reset, a truncated chunked
    // response, or the 15 s AbortSignal firing *after* headers arrived all reject here,
    // not at the connect above — and an escape from this line reaches getSpcOutlook's
    // shared catch and collapses the entire payload to `{ error }` over one layer, while
    // discarding a still-fresh cached reading the stale-fallback path would have served.
    let rawText;
    try {
      rawText = await res.text();
    } catch (err) {
      if (entry && this._isWithinStaleWindow(entry.timestamp, this._updateInterval)) {
        Log.info('MMM-SPCOutlook: stale fallback for ' + url);
        this._noteStaleEntry(entry);
        return { data: null, cachedResult: entry.result, stale: true };
      }
      Log.error('MMM-SPCOutlook: unrecoverable fetch failure for ' + url +
                ' (body read failed: ' + (err && err.message ? err.message : err) + ')');
      return { data: null, cachedResult: null, stale: false, failed: true };
    }
    // WR-07: the third layer, for a runtime whose fetch ignores `size` — so the bound can
    // never be silently absent. `rawText.length` counts UTF-16 code units rather than
    // bytes, which for UTF-8 input is never MORE than the byte count, so exceeding it here
    // proves the byte bound was exceeded too; `size` above remains the authoritative byte
    // limit and the only one that bounds peak memory.
    if (rawText.length > GEOJSON_MAX_BODY_BYTES) {
      return rejectBody('body of ' + rawText.length + ' characters exceeds the ' +
                        GEOJSON_MAX_BODY_BYTES + '-byte bound');
    }
    const newEtag = res.headers.get('etag');

    // JSON.parse on a remote body throws on any non-JSON response; letting that escape
    // would reach getSpcOutlook's shared catch and null the entire payload for one bad
    // layer (the containment CR-01 established for the ERO, applied to every layer).
    const parseBody = () => {
      try {
        return { ok: true, value: JSON.parse(rawText) };
      } catch (err) {
        return { ok: false, reason: 'unparseable body: ' + err.message };
      }
    };

    if (newEtag) {
      // ETag mode — skip hash computation
      // If same ETag as cached, it's a hit (server didn't send 304, but ETag matches)
      if (entry && entry.mode === 'etag' && entry.etag === newEtag) {
        Log.info('MMM-SPCOutlook: cache hit (ETag) for ' + url);
        // A matching ETag is the same confirmation the 304 branch above records; see there
        // for why an unrefreshed timestamp made the stale window unreachable.
        // WR-05: through the `_nowMs()` seam, so it is comparable with _isWithinStaleWindow.
        entry.timestamp = this._nowMs();
        return { data: null, cachedResult: entry.result, stale: false };
      }
      // Cache miss — parse, validate the shape, and return new data
      const parsed = parseBody();
      if (!parsed.ok) return rejectBody(parsed.reason);
      if (!isValidBody(parsed.value)) return rejectBody('not a usable body');
      return { data: parsed.value, rawText, newEtag, newHash: null, mode: 'etag' };
    } else {
      // Hash mode — compute SHA256 of raw text
      const newHash = crypto.createHash('sha256').update(rawText).digest('hex');
      if (entry && entry.mode === 'hash' && entry.hash === newHash) {
        Log.info('MMM-SPCOutlook: cache hit (hash) for ' + url);
        // Identical body bytes are the same confirmation the 304 branch above records; see
        // there for why an unrefreshed timestamp made the stale window unreachable.
        // WR-05: through the `_nowMs()` seam, so it is comparable with _isWithinStaleWindow.
        entry.timestamp = this._nowMs();
        return { data: null, cachedResult: entry.result, stale: false };
      }
      // Cache miss — parse, validate the shape, and return new data
      const parsed = parseBody();
      if (!parsed.ok) return rejectBody(parsed.reason);
      if (!isValidBody(parsed.value)) return rejectBody('not a usable body');
      return { data: parsed.value, rawText, newEtag: null, newHash, mode: 'hash' };
    }
  },

  /**
   * Fetch and evaluate a hazard probability GeoJSON, with conditional CIG tier fetch if risk > 0.
   * @param url - GeoJSON endpoint URL for the hazard probability layer
   * @param cigUrl - GeoJSON endpoint URL for the CIG tier layer (fetched only when risk > 0)
   * @param loc - turf point representing the user's location
   * @param percComparator - comparator object for probability polygon evaluation
   * @param cigComparator - comparator object for CIG tier polygon evaluation
   * @param cigToTier - mapping of CIG label strings to integer tier values (e.g. { CIG1: 1, CIG2: 2, CIG3: 3 })
   * @returns {{ risk: number, cig: number, stale: boolean }} hazard probability, CIG tier, and stale flag
   */
  async fetchAndEvaluateHazard(url, cigUrl, loc, percComparator, cigComparator, cigToTier) {
    let risk = 0;
    let cig = 0;
    let stale = false;
    let cigProximity = null;

    const fetchResult = await this.fetchGeoJsonCached(url);
    if (fetchResult.stale || fetchResult.failed) stale = true;

    if (fetchResult.data === null && fetchResult.cachedResult !== null) {
      risk = fetchResult.cachedResult;
    } else if (fetchResult.data !== null) {
      const poly = this.extractPolygons(
        fetchResult.data,
        label => label === "" ? 0 : parseFloat(label),
        (label, val) => val > 0,
        url
      );
      risk = this.evaluatePolygons(poly, loc, percComparator);
      this._geoJsonCache.set(url, {
        mode: fetchResult.mode,
        etag: fetchResult.newEtag ?? null,
        hash: fetchResult.newHash ?? null,
        result: risk,
        timestamp: this._nowMs()
      });
    }

    if (risk > 0) {
      const cigFetch = await this.fetchGeoJsonCached(cigUrl);
      if (cigFetch.stale || cigFetch.failed) stale = true;
      if (cigFetch.data === null && cigFetch.cachedResult !== null) {
        cig = cigFetch.cachedResult;
        if (this._proximityWeighting) {
          const cachedEntry = this._geoJsonCache.get(cigUrl);
          if (cachedEntry && cachedEntry.polys) {
            const lines = this.deriveLinesIfMissing(cachedEntry);
            cigProximity = this.computeProximity(lines, loc, cig, cigComparator);
          }
        }
      } else if (cigFetch.data !== null) {
        const cigPolys = this.extractPolygons(
          cigFetch.data,
          label => cigToTier[label] || 0,
          (label, val) => val > 0,
          cigUrl
        );
        cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
        let cigLines = null;
        if (this._proximityWeighting) {
          cigLines = cigPolys.map(item => ({
            label: item.label,
            value: item.value,
            poly: item.poly,
            line: turf.polygonToLine(item.poly)
          }));
          cigProximity = this.computeProximity(cigLines, loc, cig, cigComparator);
        }
        this._geoJsonCache.set(cigUrl, {
          mode: cigFetch.mode,
          etag: cigFetch.newEtag ?? null,
          hash: cigFetch.newHash ?? null,
          result: cig,
          timestamp: this._nowMs(),
          ...(this._proximityWeighting ? { polys: cigPolys, lines: cigLines } : {})
        });
      }
    }

    return { risk, cig, stale, cigProximity };
  },

  /**
   * Fetch and evaluate all SPC outlook layers for the given location, returning structured risk data.
   * The returned object always carries day1 through day8, day48Risk, and the full eight-day
   * fireWeather block, regardless of the `extended` argument. `extended` controls only whether
   * Day 4-8 SPC outlook and Day 3-8 fire weather data are fetched — it never changes which keys
   * are present.
   * @param lat - latitude of the user location
   * @param lon - longitude of the user location
   * @param extended - when true, also fetch Days 4-8 SPC outlook and Days 3-8 fire weather data
   * @param products - optional snapshot of the per-product toggles for THIS request (WR-13);
   *   falls back to the helper-global this._products when omitted
   * @returns object with day1 through day8 outlook data, day48Risk, and fireWeather, each containing:
   *   risk (string), text (string), color (hex string), probRisk (boolean),
   *   torRisk (number), torCig (number), hailRisk (number), hailCig (number),
   *   windRisk (number), windCig (number) for days 1-2;
   *   probRisk (number) and cig (number) for day3;
   *   probRisk (number), sign (boolean), risk (string), color, text for days 4-8
   *   (zero/no-risk defaults when `extended` is false);
   *   day48Risk (boolean, always false when `extended` is false);
   *   fireWeather with day1Risk/day1Text through day8Risk/day8Text
   *   (day3-8 zero/"None" defaults when `extended` is false);
   *   excessiveRain with per-day Risk/Text/Color/ValidTime fields for days 1
   *   through 5 (always present, regardless of this._products.showExcessiveRain
   *   — "NONE"/"None"/no-data color/null defaults when the toggle is off, D-05);
   *   winterImpact with per-day Risk/Text/Color/ValidTime fields for days 1 through 3
   *   (always present, regardless of this._products.showWinterImpact — "NONE"/"None"/
   *   no-data color/null defaults when the toggle is off, D-05);
   *   hazardsOutlook: { day3..day14: { date: "YYYY-MM-DD", hazards: [{ label, color,
   *   mapped }] }, windowBand: [{ label, color, mapped, startDate, endDate, offsetStart,
   *   offsetEnd }] } — always present, regardless of this._products.showHazardsOutlook
   *   (empty hazards/windowBand arrays when the toggle is off, D-05). day9..day14 are
   *   the first keys in this module past day8 and live INSIDE this block, not at the
   *   payload's top level, so no existing day-bounded loop or assertion is affected;
   *   heatRisk: { day1..dayN: { category, text, color } } (day span from
   *   PRODUCT_REGISTRY.heatRisk.days, never a literal 7) — always present, regardless of
   *   this._products.showHeatRisk (all-null defaults when the toggle is off, D-05/D-02).
   *   category is the raw 0-4 the service reported, or null when that day had no resolved
   *   reading; null and 0 are DELIBERATELY DISTINCT because Phase 18's MERGE-03 must tell
   *   "no reading" apart from "Little to No Risk was reported";
   *   advisories: { spcMD: [...], mpd: [...] } — one { label, hazardType } entry per
   *   active SPC Mesoscale Discussion / WPC Mesoscale Precipitation Discussion covering
   *   the location (D-03). Both keys are always arrays, empty when the row's toggle is
   *   off or nothing is active — never omitted, matching the day-block toggle-off
   *   guarantee above;
   *   days: { "1".."14": { date, windowStart, windowEnd, hazards: [{ dimension, source,
   *   label, text, value, color, suppressedBy, detail? }] } } — the Phase 18 unified day
   *   grid (D-01), an ADDITIVE sibling of the eight legacy blocks above for this phase
   *   only; both representations are built from the same in-memory values, never a
   *   second pass over the raw sources. All fourteen keys are always present (D-02).
   *   `windowStart`/`windowEnd` are ISO-8601 UTC strings so nothing downstream
   *   re-derives a boundary (D-12/RPT-07). Grid day 1 may be shorter than 24 hours when
   *   SPC truncated its re-issuance (D-11) — its `windowStart` reflects the real
   *   (possibly truncated) start while its `date` still reflects the NOMINAL 12Z start,
   *   so the label does not shift. Each `hazards` entry's `suppressedBy` is a source id
   *   or `null`, already resolved per grid day (MERGE-02/MERGE-03/MERGE-04, D-13/D-14):
   *   compact rendering is "the entries where `suppressedBy === null`, in array order"
   *   and detailed rendering is "all of them, with `sources[entry.source].displayName`"
   *   (D-03). The array already carries the taxonomy's fixed category order
   *   (D-15) — survivors before suppressed within a dimension — so no downstream sort
   *   is ever needed (RPT-07). `spc-convective` entries optionally carry a `detail`
   *   sub-object (tornado/hail/wind on days 1-2, probRisk/cig or probRisk/sign
   *   elsewhere) per D-05;
   *   summary: { anyHazard, dimensions, activeDays, windowStart, windowEnd,
   *   enabledSourceCount, reportingSourceCount, bandDiagnostics: { windowBandCount,
   *   advisoryCount } } — D-16's seven fields, flat and exactly as locked, plus D-20's
   *   nested `bandDiagnostics` extension (only the two counters were ever an addition).
   *   `anyHazard` is a UNION over every grid day's surviving entries, the Hazards
   *   Outlook window band, and both advisory arrays — this is D-16's own stated purpose
   *   (make RPT-05 decidable in one read), not an extension of it, since a
   *   day-scoped-only `anyHazard` would reproduce Phase 15's MPD-invisible `getDom` gate
   *   and the still-unexercised Phase 16 band-only case. `summary` is a ROLLUP of the
   *   already-resolved `days`, never a second precedence pass (D-14) — it never
   *   re-consults `PRECEDENCE` or `NO_RISK_FLOOR`;
   *   sources: { [id]: { id, displayName, enabled, reporting, stale, idpFiledate,
   *   reportedDays, activeDays, unmappedLabels, gridAnchor? } } — all eight
   *   `hazardTaxonomy.SOURCE_IDS` always present, regardless of any toggle (D-01/D-08).
   *   `reporting` means "this source produced any reading this poll", NEVER "it found a
   *   hazard" (that is `activeDays`). `reportedDays` vs `activeDays` is the SAME
   *   absent-vs-below-floor distinction `days[].hazards` resolves on: a grid day absent
   *   from `reportedDays` means the source never covered that day at all, while a day
   *   present in `reportedDays` but absent from `activeDays` means the source reported
   *   and its own reading fell below its no-risk floor — two different facts that must
   *   never be conflated (D-14). `idpFiledate` is non-null only for `wpc-hazards` and
   *   `heatrisk`, the two products that publish one (16 D-13); `gridAnchor` appears only
   *   on `spc-convective` (D-12);
   *   and optional _stale (boolean) and _staleAsOf (timestamp) when serving cached data.
   *
   *   D-01 invariant, for this phase only: the eight legacy blocks above and this
   *   unified `days`/`summary`/`sources` block are two representations of the SAME
   *   poll, built from the same in-memory values — nothing in this return statement
   *   re-fetches or re-derives one representation from the other. Phase 19 removes the
   *   legacy blocks.
   */
  async getSpcOutlook(lat, lon, extended, products) {
    try {
      // WR-13: prefer this request's own toggle snapshot; the helper-global field is only
      // a fallback for callers (e.g. offline probes) that do not pass one.
      const productToggles = products ?? this._products ?? this._productToggles();

      // WR-08: sample extractPolygons' dropped-feature counter across this run. Reading a
      // counter rather than threading a return value avoids touching ~25 call sites, and
      // the only way it can misreport under an overlapping run is by attributing another
      // run's dropped polygon to this payload — i.e. an extra ⚠ badge, never a missing
      // one. (CR-03's in-flight guard makes that overlap unreachable from the socket path
      // anyway.) Erring toward "degraded" is the safe direction for this product.
      const unusableFeaturesAtStart = this._unusableFeatureCount || 0;

      // WR-04: reset per run, then let every stale/cached acceptance inside
      // fetchGeoJsonCached lower it via _noteStaleEntry. Same reasoning as the counter
      // above for why this is helper state rather than a value threaded through ~25 call
      // sites; the in-flight guard (CR-03) is what keeps a second run from interleaving.
      this._oldestStaleAt = null;

      // Part A: Location change invalidation
      const locationChanged = (lat !== this._cachedLat || lon !== this._cachedLon);
      if (locationChanged) {
        // WR-14: clear outright rather than nulling `result` in place. Keeping mode/etag/hash
        // meant the next request still sent If-None-Match, the server answered 304, and the
        // 304 path returned cachedResult: null — which every caller's
        // `data === null && cachedResult !== null` branch skips, falling through to the
        // no-risk default. Because the 304 path never rewrites the entry, that pinned every
        // product to "no risk" until the upstream bytes changed. Nothing in an entry is
        // location-independent once `result` is dropped.
        this._geoJsonCache.clear();
        this._cachedLat = lat;
        this._cachedLon = lon;
        Log.info('MMM-SPCOutlook: location changed — cache results invalidated');
      }

      const catComparator = {
        initial: 0,
        comparator: (best, val) => Math.max(best, val)
      };

      const percComparator = catComparator;

      const cigToTier = { CIG1: 1, CIG2: 2, CIG3: 3 };
      const cigComparator = {
        initial: 0,
        comparator: (best, val) => Math.max(best, val)
      };
      // Part B: sigComparator — fixes latent ReferenceError in extended mode.
      // WR-11: the comparator used to be `(best, val) => true`, discarding both of its
      // arguments. It produced the right answer only because evaluatePolygons happens to
      // invoke the comparator solely inside its booleanPointInPolygon hit branch — an
      // incidental property of the caller, not a stated contract. It now honours its own
      // accumulator, and the SIGN lists it consumes carry numeric values (below), so
      // `value` is a number at every extractPolygons call site as computeProximity
      // (comparator.comparator(currentValue, value)) and _validTimeOfWinner
      // (item.value !== winningValue) both assume.
      const sigComparator = { initial: false, comparator: (best, val) => best || val === 1 };

      // The Python script has “risk_to_value” and “value_to_risk” logic:
      const riskToValue = {
        TSTM: 1, MRGL: 2, SLGT: 3, ENH: 4, MDT: 5, HIGH: 6
      };
      
      

      const riskToColor = {
        NONE: "afddf6", TSTM: "d2ffa6", MRGL: "7ac687", SLGT: "f7f690", ENH: "e9c188", MDT: "eb7e82", HIGH: "ff81f8"
      }; // https://www.spc.noaa.gov/new/css/SPCmain.css
      // Then repeat for day2, day3, etc.

      const day1CatURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cat.lyr.geojson"
      const day1TorURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_torn.lyr.geojson";
      const day1HailURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_hail.lyr.geojson";
      const day1WindURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_wind.lyr.geojson";

      const day2CatURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_cat.lyr.geojson"
      const day2TorURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_torn.lyr.geojson";
      const day2HailURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_hail.lyr.geojson";
      const day2WindURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_wind.lyr.geojson";

      const day1CigTorURL  = "https://www.spc.noaa.gov/products/outlook/day1otlk_cigtorn.lyr.geojson";
      const day1CigHailURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cighail.lyr.geojson";
      const day1CigWindURL = "https://www.spc.noaa.gov/products/outlook/day1otlk_cigwind.lyr.geojson";
      const day2CigTorURL  = "https://www.spc.noaa.gov/products/outlook/day2otlk_cigtorn.lyr.geojson";
      const day2CigHailURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_cighail.lyr.geojson";
      const day2CigWindURL = "https://www.spc.noaa.gov/products/outlook/day2otlk_cigwind.lyr.geojson";
      const day3CigUrl     = "https://www.spc.noaa.gov/products/outlook/day3otlk_cigprob.lyr.geojson";

      const day3CatURL = "https://www.spc.noaa.gov/products/outlook/day3otlk_cat.lyr.geojson";
      const day3ProbURL = "https://www.spc.noaa.gov/products/outlook/day3otlk_prob.lyr.geojson";

      const day4URL = "https://www.spc.noaa.gov/products/exper/day4-8/day4prob.lyr.geojson";
      const day5URL = "https://www.spc.noaa.gov/products/exper/day4-8/day5prob.lyr.geojson";
      const day6URL = "https://www.spc.noaa.gov/products/exper/day4-8/day6prob.lyr.geojson";
      const day7URL = "https://www.spc.noaa.gov/products/exper/day4-8/day7prob.lyr.geojson";
      const day8URL = "https://www.spc.noaa.gov/products/exper/day4-8/day8prob.lyr.geojson";


      const loc = turf.point([lon, lat]);

      // Assemble dayN.proximity from per-hazard locals; omits null entries (D-04).
      // Returns {} when all entries are null (subtree omitted entirely),
      // else { proximity: {<resolved keys only>} } — spreadable into a day literal.
      const buildProximitySubtree = (entries) => {
        const resolved = {};
        for (const [key, val] of Object.entries(entries)) {
          if (val !== null && val !== undefined) resolved[key] = val;
        }
        if (Object.keys(resolved).length === 0) return {};
        return { proximity: resolved };
      };

      let anyStale = false;

      // D-04: per-source degrade attribution for the two SPC inline products
      // (spc-convective, spc-fire), which predate the registry (14 D-08) and so share this
      // one `anyStale` accumulator today with no way to tell them apart. Keyed lazily —
      // an absent key reads as `false` — for the same reason plan 18-02 keys
      // `reportedDays` lazily: seeding every source id here would restate the roster
      // hazardTaxonomy.js already owns (D-08). Plan 18-05 iterates SOURCE_IDS when it
      // assembles `sources[]` and treats a missing key as healthy.
      //
      // Deliberately does NOT feed `_stale`: WR-08's payload-wide degrade rule is
      // unchanged by this plan, and per-product staleness UX remains out of scope per
      // PROJECT.md — D-04 emits the data only.
      const staleBySource = {};
      const noteStale = (sourceId) => {
        anyStale = true;
        staleBySource[sourceId] = true;
      };

      // PERF-03/D-17: brackets the SPC convective + fire-weather inline chain that runs
      // serially before the Promise.allSettled batch below (see the elapsed assignment
      // near the end of this block for why it is recorded as one `spc-inline` entry
      // rather than two per-source entries).
      const spcInlineStart = this._nowMs();

      //Day 1

      //Day 1 Cat
      let day1RiskResult;
      let day1Risk;
      let day1CatProximity = null;
      // D-12 grid anchor: hoisted alongside day1CatProximity because day1RiskPoly (below)
      // is block-scoped to the fresh-fetch branch only and does not survive past this
      // block's closing brace. Each branch assigns these independently, same as
      // day1CatProximity; both stay null when no polygons are available, which
      // _spcGridAnchor treats as "fall back to the clock estimate."
      let day1ValidIso = null;
      let day1ExpireIso = null;
      {
        const fetchResult = await this.fetchGeoJsonCached(day1CatURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-convective");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day1RiskResult = fetchResult.cachedResult;
          if (this._proximityWeighting) {
            const cachedEntry = this._geoJsonCache.get(day1CatURL);
            if (cachedEntry && cachedEntry.polys) {
              const lines = this.deriveLinesIfMissing(cachedEntry);
              day1CatProximity = this.computeProximity(lines, loc, day1RiskResult, catComparator);
              // A cache hit still carries the polygons that produced this result when
              // proximity weighting is on, so the grid anchor can be read here too.
              day1ValidIso = this._validTimeOfWinner(cachedEntry.polys, loc, day1RiskResult, "VALID_ISO");
              day1ExpireIso = this._validTimeOfWinner(cachedEntry.polys, loc, day1RiskResult, "EXPIRE_ISO");
            }
            // else: a cache hit with proximity weighting off carries no polygons at
            // all, so the anchor legitimately degrades to the clock fallback below.
          }
        } else if (fetchResult.data === null) {
          day1RiskResult = 0;
          // Hard failure with nothing cached: no polygons exist anywhere, so both stay
          // null and _spcGridAnchor falls back to the clock estimate.
        } else {
          const gj = fetchResult.data;
          const day1RiskPoly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0, day1CatURL);
          day1RiskResult = this.evaluatePolygons(day1RiskPoly, loc, catComparator);
          // D-12: read VALID_ISO/EXPIRE_ISO off the winning polygon here, using
          // day1RiskResult (the numeric winning value) — NOT day1Risk (the string label,
          // not assigned until after this block closes). RESEARCH.md's code example
          // passes day1Risk; that would fail this helper's internal winning-value
          // comparison every time, and the anchor would silently stay null forever.
          day1ValidIso = this._validTimeOfWinner(day1RiskPoly, loc, day1RiskResult, "VALID_ISO");
          day1ExpireIso = this._validTimeOfWinner(day1RiskPoly, loc, day1RiskResult, "EXPIRE_ISO");
          let day1RiskLines = null;
          if (this._proximityWeighting) {
            day1RiskLines = day1RiskPoly.map(item => ({
              label: item.label,
              value: item.value,
              poly: item.poly,
              line: turf.polygonToLine(item.poly)
            }));
            day1CatProximity = this.computeProximity(day1RiskLines, loc, day1RiskResult, catComparator);
          }
          this._geoJsonCache.set(day1CatURL, {
            mode: fetchResult.mode,
            etag: fetchResult.newEtag ?? null,
            hash: fetchResult.newHash ?? null,
            result: day1RiskResult,
            timestamp: this._nowMs(),
            ...(this._proximityWeighting ? { polys: day1RiskPoly, lines: day1RiskLines } : {})
          });
        }
        day1Risk = day1RiskResult === 0 ? "NONE" : valueToRisk[day1RiskResult];
      }
      const gridAnchorInfo = this._spcGridAnchor(day1ValidIso, day1ExpireIso);
      if (gridAnchorInfo.anchor === "estimated" && !this._loggedGridAnchorFallback) {
        Log.info("MMM-SPCOutlook: SPC grid anchor unavailable (VALID_ISO/EXPIRE_ISO from the " +
                 "day-1 categorical outlook were absent/unparseable, or EXPIRE_ISO had already " +
                 "elapsed); falling back to the clock-derived estimate.");
        this._loggedGridAnchorFallback = true;
      }
  
      // Day 1 Torn
      const { risk: day1TorRisk, cig: day1TorCig, stale: s1Tor, cigProximity: day1TorCigProximity } =
        await this.fetchAndEvaluateHazard(day1TorURL, day1CigTorURL, loc, percComparator, cigComparator, cigToTier);
      if (s1Tor) noteStale("spc-convective");

      // Day 1 Hail
      const { risk: day1HailRisk, cig: day1HailCig, stale: s1Hail, cigProximity: day1HailCigProximity } =
        await this.fetchAndEvaluateHazard(day1HailURL, day1CigHailURL, loc, percComparator, cigComparator, cigToTier);
      if (s1Hail) noteStale("spc-convective");

      // Day 1 Wind
      const { risk: day1WindRisk, cig: day1WindCig, stale: s1Wind, cigProximity: day1WindCigProximity } =
        await this.fetchAndEvaluateHazard(day1WindURL, day1CigWindURL, loc, percComparator, cigComparator, cigToTier);
      if (s1Wind) noteStale("spc-convective");

      // If Day 1 Risk at all
      const day1ProbRisk = day1TorRisk > 0 || day1HailRisk > 0 || day1WindRisk > 0;

      // Day 2

      //Day 2 Cat
      let day2RiskResult;
      let day2Risk;
      let day2CatProximity = null;
      {
        const fetchResult = await this.fetchGeoJsonCached(day2CatURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-convective");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day2RiskResult = fetchResult.cachedResult;
          if (this._proximityWeighting) {
            const cachedEntry = this._geoJsonCache.get(day2CatURL);
            if (cachedEntry && cachedEntry.polys) {
              const lines = this.deriveLinesIfMissing(cachedEntry);
              day2CatProximity = this.computeProximity(lines, loc, day2RiskResult, catComparator);
            }
          }
        } else if (fetchResult.data === null) {
          day2RiskResult = 0;
        } else {
          const gj = fetchResult.data;
          const day2RiskPoly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0, day2CatURL);
          day2RiskResult = this.evaluatePolygons(day2RiskPoly, loc, catComparator);
          let day2RiskLines = null;
          if (this._proximityWeighting) {
            day2RiskLines = day2RiskPoly.map(item => ({
              label: item.label,
              value: item.value,
              poly: item.poly,
              line: turf.polygonToLine(item.poly)
            }));
            day2CatProximity = this.computeProximity(day2RiskLines, loc, day2RiskResult, catComparator);
          }
          this._geoJsonCache.set(day2CatURL, {
            mode: fetchResult.mode,
            etag: fetchResult.newEtag ?? null,
            hash: fetchResult.newHash ?? null,
            result: day2RiskResult,
            timestamp: this._nowMs(),
            ...(this._proximityWeighting ? { polys: day2RiskPoly, lines: day2RiskLines } : {})
          });
        }
        day2Risk = day2RiskResult === 0 ? "NONE" : valueToRisk[day2RiskResult];
      }

      // Day 2 Torn
      const { risk: day2TorRisk, cig: day2TorCig, stale: s2Tor, cigProximity: day2TorCigProximity } =
        await this.fetchAndEvaluateHazard(day2TorURL, day2CigTorURL, loc, percComparator, cigComparator, cigToTier);
      if (s2Tor) noteStale("spc-convective");

      // Day 2 Hail
      const { risk: day2HailRisk, cig: day2HailCig, stale: s2Hail, cigProximity: day2HailCigProximity } =
        await this.fetchAndEvaluateHazard(day2HailURL, day2CigHailURL, loc, percComparator, cigComparator, cigToTier);
      if (s2Hail) noteStale("spc-convective");

      // Day 2 Wind
      const { risk: day2WindRisk, cig: day2WindCig, stale: s2Wind, cigProximity: day2WindCigProximity } =
        await this.fetchAndEvaluateHazard(day2WindURL, day2CigWindURL, loc, percComparator, cigComparator, cigToTier);
      if (s2Wind) noteStale("spc-convective");

      // If Day 2 Risk at all
      const day2ProbRisk = day2TorRisk > 0 || day2HailRisk > 0 || day2WindRisk > 0;

      //DAY 3
      //Day 3 Cat
      let day3RiskResult;
      let day3Risk;
      let day3CatProximity = null;
      {
        const fetchResult = await this.fetchGeoJsonCached(day3CatURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-convective");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day3RiskResult = fetchResult.cachedResult;
          if (this._proximityWeighting) {
            const cachedEntry = this._geoJsonCache.get(day3CatURL);
            if (cachedEntry && cachedEntry.polys) {
              const lines = this.deriveLinesIfMissing(cachedEntry);
              day3CatProximity = this.computeProximity(lines, loc, day3RiskResult, catComparator);
            }
          }
        } else if (fetchResult.data === null) {
          day3RiskResult = 0;
        } else {
          const gj = fetchResult.data;
          const day3RiskPoly = this.extractPolygons(gj, label => riskToValue[label] || 0, (label, val) => val > 0, day3CatURL);
          day3RiskResult = this.evaluatePolygons(day3RiskPoly, loc, catComparator);
          let day3RiskLines = null;
          if (this._proximityWeighting) {
            day3RiskLines = day3RiskPoly.map(item => ({
              label: item.label,
              value: item.value,
              poly: item.poly,
              line: turf.polygonToLine(item.poly)
            }));
            day3CatProximity = this.computeProximity(day3RiskLines, loc, day3RiskResult, catComparator);
          }
          this._geoJsonCache.set(day3CatURL, {
            mode: fetchResult.mode,
            etag: fetchResult.newEtag ?? null,
            hash: fetchResult.newHash ?? null,
            result: day3RiskResult,
            timestamp: this._nowMs(),
            ...(this._proximityWeighting ? { polys: day3RiskPoly, lines: day3RiskLines } : {})
          });
        }
        day3Risk = day3RiskResult === 0 ? "NONE" : valueToRisk[day3RiskResult];
      }

      // Day 3 Prob
      let day3ProbRisk;
      {
        const fetchResult = await this.fetchGeoJsonCached(day3ProbURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-convective");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day3ProbRisk = fetchResult.cachedResult;
        } else if (fetchResult.data === null) {
          day3ProbRisk = 0;
        } else {
          const gj = fetchResult.data;
          const poly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0, day3ProbURL);
          day3ProbRisk = this.evaluatePolygons(poly, loc, percComparator);
          this._geoJsonCache.set(day3ProbURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: day3ProbRisk, timestamp: this._nowMs() });
        }
      }
      let day3Cig = 0;
      let day3CigProximity = null;
      if (day3ProbRisk > 0) {
        const fetchResult = await this.fetchGeoJsonCached(day3CigUrl);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-convective");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day3Cig = fetchResult.cachedResult;
          if (this._proximityWeighting) {
            const cachedEntry = this._geoJsonCache.get(day3CigUrl);
            if (cachedEntry && cachedEntry.polys) {
              const lines = this.deriveLinesIfMissing(cachedEntry);
              day3CigProximity = this.computeProximity(lines, loc, day3Cig, cigComparator);
            }
          }
        } else if (fetchResult.data !== null) {
          const cigPolys = this.extractPolygons(fetchResult.data, label => cigToTier[label] || 0, (label, val) => val > 0, day3CigUrl);
          day3Cig = this.evaluatePolygons(cigPolys, loc, cigComparator);
          let cigLines = null;
          if (this._proximityWeighting) {
            cigLines = cigPolys.map(item => ({
              label: item.label,
              value: item.value,
              poly: item.poly,
              line: turf.polygonToLine(item.poly)
            }));
            day3CigProximity = this.computeProximity(cigLines, loc, day3Cig, cigComparator);
          }
          this._geoJsonCache.set(day3CigUrl, {
            mode: fetchResult.mode,
            etag: fetchResult.newEtag ?? null,
            hash: fetchResult.newHash ?? null,
            result: day3Cig,
            timestamp: this._nowMs(),
            ...(this._proximityWeighting ? { polys: cigPolys, lines: cigLines } : {})
          });
        }
      }

      // Fire Weather constants
      const day1FwWindRHURL = "https://www.spc.noaa.gov/products/fire_wx/day1fw_windrh.lyr.geojson";
      const day1FwDryTURL   = "https://www.spc.noaa.gov/products/fire_wx/day1fw_dryt.lyr.geojson";
      const day2FwWindRHURL = "https://www.spc.noaa.gov/products/fire_wx/day2fw_windrh.lyr.geojson";
      const day2FwDryTURL   = "https://www.spc.noaa.gov/products/fire_wx/day2fw_dryt.lyr.geojson";
      const fireRiskToValue = { ELEV: 1, CRIT: 2, EXTM: 3 };
      const fireValueToFull = { 0: "None", 1: "Elevated", 2: "Critical", 3: "Extremely Critical" };
      // D-05: mirrors MMM-SPCOutlook.js's own render-path fireRiskToColor map exactly — the
      // frontend and this backend run in separate processes with no shared module, so this
      // palette is declared once per side, the same way riskToColor's SPC palette above is.
      const fireRiskToColor = { 0: "aaaaaa", 1: "FF7F00", 2: "FF0000", 3: "FF00FF" };
      const fireComparator  = { initial: 0, comparator: (best, val) => Math.max(best, val) };
      // Day 3-8 fire weather (extended) — "exper" path, "cat" suffix per Phase 8 verification
      const dnToFireValue = { 5: 1, 8: 2, 10: 3 };

      // Fire Weather Day 1
      let day1FireRisk = 0;
      {
        const fetchResult = await this.fetchGeoJsonCached(day1FwWindRHURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-fire");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day1FireRisk = Math.max(day1FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0, day1FwWindRHURL);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day1FireRisk = Math.max(day1FireRisk, val);
          this._geoJsonCache.set(day1FwWindRHURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: this._nowMs() });
        }
      }
      {
        const fetchResult = await this.fetchGeoJsonCached(day1FwDryTURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-fire");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day1FireRisk = Math.max(day1FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0, day1FwDryTURL);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day1FireRisk = Math.max(day1FireRisk, val);
          this._geoJsonCache.set(day1FwDryTURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: this._nowMs() });
        }
      }

      // Fire Weather Day 2
      let day2FireRisk = 0;
      {
        const fetchResult = await this.fetchGeoJsonCached(day2FwWindRHURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-fire");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day2FireRisk = Math.max(day2FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0, day2FwWindRHURL);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day2FireRisk = Math.max(day2FireRisk, val);
          this._geoJsonCache.set(day2FwWindRHURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: this._nowMs() });
        }
      }
      {
        const fetchResult = await this.fetchGeoJsonCached(day2FwDryTURL);
        if (fetchResult.stale || fetchResult.failed) noteStale("spc-fire");
        if (fetchResult.data === null && fetchResult.cachedResult !== null) {
          day2FireRisk = Math.max(day2FireRisk, fetchResult.cachedResult);
        } else if (fetchResult.data !== null) {
          const polys = this.extractPolygons(fetchResult.data, label => fireRiskToValue[label] || 0, (label, val) => val > 0, day2FwDryTURL);
          const val = this.evaluatePolygons(polys, loc, fireComparator);
          day2FireRisk = Math.max(day2FireRisk, val);
          this._geoJsonCache.set(day2FwDryTURL, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: this._nowMs() });
        }
      }

      // Fire Weather Days 3-8 (extended only)
      let day3FireRisk = 0, day4FireRisk = 0, day5FireRisk = 0,
          day6FireRisk = 0, day7FireRisk = 0, day8FireRisk = 0;
      if (extended) {
        const dayFireRisks = [null, null, null]; // placeholders for index alignment (0,1,2 unused)
        for (let d = 3; d <= 8; d++) {
          let dayRisk = 0;
          const windRHUrl = `https://www.spc.noaa.gov/products/exper/fire_wx/day${d}fw_windrhcat.lyr.geojson`;
          const dryTUrl = `https://www.spc.noaa.gov/products/exper/fire_wx/day${d}fw_drytcat.lyr.geojson`;

          {
            const fetchResult = await this.fetchGeoJsonCached(windRHUrl);
            if (fetchResult.stale || fetchResult.failed) noteStale("spc-fire");
            if (fetchResult.data === null && fetchResult.cachedResult !== null) {
              dayRisk = Math.max(dayRisk, fetchResult.cachedResult);
            } else if (fetchResult.data !== null) {
              const polys = this.extractPolygons(fetchResult.data, (label, f) => dnToFireValue[f.properties.DN] || 0, (label, val) => val > 0, windRHUrl);
              const val = this.evaluatePolygons(polys, loc, fireComparator);
              dayRisk = Math.max(dayRisk, val);
              this._geoJsonCache.set(windRHUrl, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: this._nowMs() });
            }
          }
          {
            const fetchResult = await this.fetchGeoJsonCached(dryTUrl);
            if (fetchResult.stale || fetchResult.failed) noteStale("spc-fire");
            if (fetchResult.data === null && fetchResult.cachedResult !== null) {
              dayRisk = Math.max(dayRisk, fetchResult.cachedResult);
            } else if (fetchResult.data !== null) {
              const polys = this.extractPolygons(fetchResult.data, (label, f) => dnToFireValue[f.properties.DN] || 0, (label, val) => val > 0, dryTUrl);
              const val = this.evaluatePolygons(polys, loc, fireComparator);
              dayRisk = Math.max(dayRisk, val);
              this._geoJsonCache.set(dryTUrl, { mode: fetchResult.mode, etag: fetchResult.newEtag ?? null, hash: fetchResult.newHash ?? null, result: val, timestamp: this._nowMs() });
            }
          }
          dayFireRisks.push(dayRisk);
        }
        day3FireRisk = dayFireRisks[3];
        day4FireRisk = dayFireRisks[4];
        day5FireRisk = dayFireRisks[5];
        day6FireRisk = dayFireRisks[6];
        day7FireRisk = dayFireRisks[7];
        day8FireRisk = dayFireRisks[8];
      }

      // `extended` gates Day 4-8 fetching only — the payload shape never forks on it (CFG-02, D-01).
      // Mirrors the fire-weather Day 3-8 block above: locals declared and defaulted to
      // zero/no-risk before any gate, only the fetch blocks below are wrapped in `if (extended)`.
      let day4ProbRisk = 0, day4Sign = false;
      let day5ProbRisk = 0, day5Sign = false;
      let day6ProbRisk = 0, day6Sign = false;
      let day7ProbRisk = 0, day7Sign = false;
      let day8ProbRisk = 0, day8Sign = false;

      // Day 4-8 — PERF-02: single-pass extractPolygons for both risk and SIGN before evaluatePolygons
      if (extended) {
        // Day 4
        {
          const fetch4 = await this.fetchGeoJsonCached(day4URL);
          if (fetch4.stale || fetch4.failed) noteStale("spc-convective");
          if (fetch4.data === null && fetch4.cachedResult !== null) {
            day4ProbRisk = fetch4.cachedResult.probRisk;
            day4Sign = fetch4.cachedResult.sign;
          } else if (fetch4.data === null) {
            day4ProbRisk = 0;
            day4Sign = false;
          } else {
            const gj = fetch4.data;
            const day4RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0, day4URL);
            const day4SignPoly  = this.extractPolygons(gj, (label) => (label === "SIGN" ? 1 : 0), (label, val) => val > 0, day4URL + " (SIGN)");
            day4ProbRisk = this.evaluatePolygons(day4RiskPoly, loc, percComparator);
            day4Sign = day4ProbRisk > 0 ? this.evaluatePolygons(day4SignPoly, loc, sigComparator) : false;
            this._geoJsonCache.set(day4URL, { mode: fetch4.mode, etag: fetch4.newEtag ?? null, hash: fetch4.newHash ?? null, result: { probRisk: day4ProbRisk, sign: day4Sign }, timestamp: this._nowMs() });
          }
        }

        // Day 5
        {
          const fetch5 = await this.fetchGeoJsonCached(day5URL);
          if (fetch5.stale || fetch5.failed) noteStale("spc-convective");
          if (fetch5.data === null && fetch5.cachedResult !== null) {
            day5ProbRisk = fetch5.cachedResult.probRisk;
            day5Sign = fetch5.cachedResult.sign;
          } else if (fetch5.data === null) {
            day5ProbRisk = 0;
            day5Sign = false;
          } else {
            const gj = fetch5.data;
            const day5RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0, day5URL);
            const day5SignPoly  = this.extractPolygons(gj, (label) => (label === "SIGN" ? 1 : 0), (label, val) => val > 0, day5URL + " (SIGN)");
            day5ProbRisk = this.evaluatePolygons(day5RiskPoly, loc, percComparator);
            day5Sign = day5ProbRisk > 0 ? this.evaluatePolygons(day5SignPoly, loc, sigComparator) : false;
            this._geoJsonCache.set(day5URL, { mode: fetch5.mode, etag: fetch5.newEtag ?? null, hash: fetch5.newHash ?? null, result: { probRisk: day5ProbRisk, sign: day5Sign }, timestamp: this._nowMs() });
          }
        }

        // Day 6
        {
          const fetch6 = await this.fetchGeoJsonCached(day6URL);
          if (fetch6.stale || fetch6.failed) noteStale("spc-convective");
          if (fetch6.data === null && fetch6.cachedResult !== null) {
            day6ProbRisk = fetch6.cachedResult.probRisk;
            day6Sign = fetch6.cachedResult.sign;
          } else if (fetch6.data === null) {
            day6ProbRisk = 0;
            day6Sign = false;
          } else {
            const gj = fetch6.data;
            const day6RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0, day6URL);
            const day6SignPoly  = this.extractPolygons(gj, (label) => (label === "SIGN" ? 1 : 0), (label, val) => val > 0, day6URL + " (SIGN)");
            day6ProbRisk = this.evaluatePolygons(day6RiskPoly, loc, percComparator);
            day6Sign = day6ProbRisk > 0 ? this.evaluatePolygons(day6SignPoly, loc, sigComparator) : false;
            this._geoJsonCache.set(day6URL, { mode: fetch6.mode, etag: fetch6.newEtag ?? null, hash: fetch6.newHash ?? null, result: { probRisk: day6ProbRisk, sign: day6Sign }, timestamp: this._nowMs() });
          }
        }

        // Day 7
        {
          const fetch7 = await this.fetchGeoJsonCached(day7URL);
          if (fetch7.stale || fetch7.failed) noteStale("spc-convective");
          if (fetch7.data === null && fetch7.cachedResult !== null) {
            day7ProbRisk = fetch7.cachedResult.probRisk;
            day7Sign = fetch7.cachedResult.sign;
          } else if (fetch7.data === null) {
            day7ProbRisk = 0;
            day7Sign = false;
          } else {
            const gj = fetch7.data;
            const day7RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0, day7URL);
            const day7SignPoly  = this.extractPolygons(gj, (label) => (label === "SIGN" ? 1 : 0), (label, val) => val > 0, day7URL + " (SIGN)");
            day7ProbRisk = this.evaluatePolygons(day7RiskPoly, loc, percComparator);
            day7Sign = day7ProbRisk > 0 ? this.evaluatePolygons(day7SignPoly, loc, sigComparator) : false;
            this._geoJsonCache.set(day7URL, { mode: fetch7.mode, etag: fetch7.newEtag ?? null, hash: fetch7.newHash ?? null, result: { probRisk: day7ProbRisk, sign: day7Sign }, timestamp: this._nowMs() });
          }
        }

        // Day 8
        {
          const fetch8 = await this.fetchGeoJsonCached(day8URL);
          if (fetch8.stale || fetch8.failed) noteStale("spc-convective");
          if (fetch8.data === null && fetch8.cachedResult !== null) {
            day8ProbRisk = fetch8.cachedResult.probRisk;
            day8Sign = fetch8.cachedResult.sign;
          } else if (fetch8.data === null) {
            day8ProbRisk = 0;
            day8Sign = false;
          } else {
            const gj = fetch8.data;
            const day8RiskPoly = this.extractPolygons(gj, label => label === "" ? 0 : parseFloat(label), (label, val) => val > 0, day8URL);
            const day8SignPoly  = this.extractPolygons(gj, (label) => (label === "SIGN" ? 1 : 0), (label, val) => val > 0, day8URL + " (SIGN)");
            day8ProbRisk = this.evaluatePolygons(day8RiskPoly, loc, percComparator);
            day8Sign = day8ProbRisk > 0 ? this.evaluatePolygons(day8SignPoly, loc, sigComparator) : false;
            this._geoJsonCache.set(day8URL, { mode: fetch8.mode, etag: fetch8.newEtag ?? null, hash: fetch8.newHash ?? null, result: { probRisk: day8ProbRisk, sign: day8Sign }, timestamp: this._nowMs() });
          }
        }
      }

      // PERF-03/D-17: the inline chain's other end. Its own code is genuinely interleaved
      // rather than cleanly separated by source — convective days 1-3 run first, then
      // fire-weather days 1-8, then convective days 4-8 (this block, gated by `extended`)
      // — so a per-source split would need to sum two disjoint code regions under the
      // `spc-convective` key, which this file has no established idiom for. Recorded as a
      // single `spc-inline` entry covering the whole chain instead, merged into
      // `memberTimings` below. This span runs BEFORE the `Promise.allSettled` batch, so its
      // time ADDS to the poll's wall time rather than overlapping with the batch members.
      const spcInlineElapsedMs = this._nowMs() - spcInlineStart;

      const day4Risk = this.percToRisk(day4ProbRisk, day4Sign);
      const day5Risk = this.percToRisk(day5ProbRisk, day5Sign);
      const day6Risk = this.percToRisk(day6ProbRisk, day6Sign);
      const day7Risk = this.percToRisk(day7ProbRisk, day7Sign);
      const day8Risk = this.percToRisk(day8ProbRisk, day8Sign);

      let day48Risk = false;
      if(day4ProbRisk > 0 || day5ProbRisk > 0 || day6ProbRisk > 0 || day7ProbRisk > 0 || day8ProbRisk > 0) day48Risk = true;

      // WPC arcgis-day-layers products (ERO, WSSI, ...) share one fetch/cache/evaluate
      // runner (_runArcGisDayProduct, above) so a fix applied to one structurally cannot
      // skip its twin (D-02) — exactly the divergence 14-REVIEW.md WR-06 found between ERO
      // and the (then-separate) MD path. Each call only runs its row's fetch loop when the
      // row's own configFlag is on, yet always returns the row's full day-span payload
      // block (Phase 14 D-05); `anyStale` is written only when a call reports it (D-04).
      // ERO's `dn` map is the registry row's own (`ero.toValue`) and must never be fed
      // through fire weather's uppercase-DN-keyed value map (ERO-02). Every URL comes from
      // the row's own `buildUrl` so the query string is byte-stable across polls (PERF-02,
      // D-09). ArcGIS REST returns most failures as HTTP 200 with an `error` body and no
      // `features`, so each day is validated and fetch/parse/evaluate is wrapped in its own
      // try/catch inside the runner — a failed day degrades to no risk instead of reaching
      // this function's own catch and losing the whole payload.
      //
      // WSSI Overall Impact (winterImpact). Off-season, the live layer responds with a
      // literal `{"type":"FeatureCollection","features":[]}` — the shape
      // `_isFeatureCollection` and `extractPolygons` already handle unchanged (zero
      // features -> value 0 -> tier NONE -> no row), so no additional guard belongs here
      // (WSSI-03). D-09 AMENDED's MINOR floor lives entirely in the registry row's
      // `includesFeat`, not in this call site.
      //
      // hazardsOutlook and heatRisk are each a direct named member below, not a `kind`-loop
      // — each row is singular (unlike the kml-advisory rows, which join the batch via a
      // `.filter(...)` a few lines down). hazardsOutlook's `anyStale` folds into the same
      // shared local every other product uses (Phase 14 D-04, global-only staleness); per
      // D-15 it can raise `anyStale` from a data-age trip without contributing to
      // `_oldestStaleAt`, so `_staleAsOf` may legitimately be `null` or older-than-this-
      // product while the badge is on.
      //
      // `kml-advisory` rows (SPC MD, WPC MPD) are driven here, inside getSpcOutlook, rather
      // than as a separate top-level fetch in socketNotificationReceived, so that an advisory
      // fetch failure folds into this run's own `anyStale` exactly like a product-layer
      // failure (D-04) — the old top-level `md` path could not do that; its failure was
      // caught and silently downgraded to "no active MDs" with no staleness signal at all.
      // Both keys are seeded with empty arrays before settlement so `advisories.{spcMD,mpd}`
      // is always a complete, array-shaped object even when a toggle is off (D-03, Phase 14
      // D-05).
      //
      // PERF-01: all six of the above join ONE settlement batch (see below) rather than
      // three named sequential awaits plus a kml-advisory for-loop, so cold-start fetch time
      // stops growing linearly per enabled product. The batch settles every member
      // independently (D-08) rather than short-circuiting on the first rejection: every
      // runner above is only DOCUMENTED to never throw past its own internal per-item
      // try/catch — a fail-fast batch would convert that comment into a load-bearing
      // invariant and let one throw discard five healthy payloads into this function's own
      // outer catch, the "total outage rendering as a confident all-clear" shape 14-REVIEW's
      // round-3 deep review found as that phase's highest-severity finding. A per-call-site
      // `.catch()` was rejected too: six near-identical catch blocks are exactly WR-06's
      // divergence shape (a fix applied to one twin and not the other). Member closures are
      // built but not invoked until the batch call below runs, so nothing awaits
      // sequentially before the batch issues. A rejected member's `payload`/`entries`
      // downstream consumers (`eroPayload`, `wssiPayload`, `hazardsPayload`,
      // `heatRiskPayload`, and `advisories[row.id]`) all guard on a falsy/non-object block
      // before reading into it (see `dayRiskCount`, `hazardsOutlookHasAnyDay`,
      // `heatRiskDaysToRender` in MMM-SPCOutlook.js), so a substituted `payload: null` on
      // rejection degrades that one product to a silent no-risk render rather than a throw.
      //
      // Concurrency-safety invariant. ONE mechanical half and one reasoned half; 17-REVIEW
      // CR-02 found this comment claiming the mechanical half covered more than it did, so
      // the split is now stated explicitly rather than compressed into "verified, not
      // assumed". MECHANICAL: scripts/check-concurrency-invariant.sh asserts, for each of
      // the four write sites enumerated below, that no `await` token appears between the
      // opening line of the method containing it and the mutation itself — nothing more.
      // It is a grep/awk textual check over four hand-named anchors, not a data-flow
      // analysis. WR-11: it additionally asserts that the NUMBER of occurrences of each
      // audited mutation text in this file equals the number of sites it enumerates, so
      // adding or deleting a write site for one of these two fields is a loud failure
      // rather than a silent subset — but a wholly NEW shared field, written with text no
      // one has enumerated there, remains invisible to it (see the LIMIT paragraph at the
      // end). It also carries a self-test that proves on every run that it can fail. REASONED (not machine-checked): that the
      // increments are commutative and the min-reduce idempotent, and that the enumeration
      // is complete. Those parts are argued here and must be re-argued, not inherited, by
      // anyone adding a field. `_unusableFeatureCount` has THREE write
      // sites — `extractPolygons`, `evaluatePolygonsCollectAll`, and `checkInPolygon` (the
      // last reached only through `_runKmlAdvisoryRow`, one of this batch's own members —
      // audited here because it shares the field, not because it predates the batch) —
      // each a synchronous increment inside a `.forEach()`/`for` loop's `catch` block with
      // no `await` between the read and the write. The count of three is itself checked by
      // the script rather than merely asserted here (WR-11). `_oldestStaleAt` has one write site,
      // `_noteStaleEntry`, a synchronous min-reduce with no `await` inside it. All four
      // mutation sites are read at this function's own start (`unusableFeaturesAtStart`,
      // above) and end (below) / reset (above). JavaScript is single-threaded with
      // run-to-completion semantics: two concurrently-running async functions can only
      // interleave at an `await` boundary, and none of these six sites (the three
      // increments, the min-reduce, and their two read sites) contains one — a synchronous
      // statement inside one runner's loop body cannot be preempted by another runner's
      // continuation. `_unusableFeatureCount` is a monotone counter sampled start-vs-end,
      // so the final count equals the sum of every member's own increments regardless of
      // interleaving order; `_oldestStaleAt` is a commutative min-reduce, so there is no
      // race to win. `_inFlight` (declared near the top of this file, guarded inside
      // `socketNotificationReceived`) is confirmed to never enter this function's own call
      // graph — it is read/written only inside `socketNotificationReceived`, so a batch
      // built entirely inside `getSpcOutlook` cannot observe or bypass it.
      //
      // A THIRD shared structure, argued differently (WR-09): `_geoJsonCache` is the largest
      // shared mutable structure this batch touches — four of the six members write it — and
      // it is the only one whose access pattern is a read-modify-write that SPANS an await:
      // `fetchGeoJsonCached` reads `_geoJsonCache.get(url)`, awaits `_fetch(url)`, and then
      // the runners write `_geoJsonCache.set(url, ...)`. The synchronous-mutation argument
      // above therefore does NOT apply to it, and check-concurrency-invariant.sh cannot
      // audit it: the interleave point is inherent to the pattern, not an accident to
      // forbid. Its safety rests on a different premise entirely — that the six members'
      // URL keyspaces are DISJOINT (four static base URLs, one lat/lon-derived identify URL,
      // two host-scoped discovery trees), so no two concurrent readers ever address the same
      // cache entry and there is no read-modify-write to interleave. That premise was
      // previously unstated here and unenforced anywhere. It is now enforced at runtime by
      // the in-flight-key check at the top of `fetchGeoJsonCached`, which logs loudly if two
      // fetches for one key are ever in flight at once — the condition that actually tears
      // an entry, independent of which member issued them.
      //
      // LIMIT OF THIS CLAIM (does not generalise beyond the three structures named above):
      // a future helper-global field lacking either the synchronous-write properties
      // (synchronous write, no `await` inside the mutation, commutative reduce) or an
      // enforced key-disjointness premise needs this audit repeated, not inherited.
      const kmlRows = Object.values(PRODUCT_REGISTRY).filter((row) => row.kind === "kml-advisory");

      const members = [
        { id: "excessiveRain", run: () => this._runArcGisDayProduct(PRODUCT_REGISTRY.excessiveRain, loc, catComparator, productToggles) },
        { id: "winterImpact", run: () => this._runArcGisDayProduct(PRODUCT_REGISTRY.winterImpact, loc, catComparator, productToggles) },
        { id: "hazardsOutlook", run: () => this._runArcGisHazardWindowProduct(PRODUCT_REGISTRY.hazardsOutlook, loc, productToggles) },
        { id: "heatRisk", run: () => this._runHeatRiskProduct(PRODUCT_REGISTRY.heatRisk, loc, productToggles) },
        ...kmlRows.map((row) => ({
          id: row.id,
          run: async () => {
            const r = await this._runKmlAdvisoryRow(row, lat, lon, productToggles);
            return { entries: r.entries, anyStale: r.anyStale };
          }
        }))
      ];

      // D-10: each member's own start time is captured BEFORE its await, with elapsed
      // recorded in a `finally`, so an overlap probe can observe issue order independently
      // of resolve order — the instrument Phase 18's PERF-03 Pi measurement consumes.
      // PERF-03/D-17: seeded with the inline SPC/fire-weather chain's own elapsed time
      // (spcInlineElapsedMs, captured above) rather than a parallel timing structure — the
      // per-product breakdown extends this SAME object PERF-01 already built. `spc-inline`
      // is NOT one of the members the batch below settles; it ran serially before this
      // point, so its time ADDS to the poll's wall time rather than overlapping with any
      // batch member.
      const memberTimings = { "spc-inline": spcInlineElapsedMs };
      const settleStart = this._nowMs();
      const settled = await Promise.allSettled(members.map(async (m) => {
        const t0 = this._nowMs();
        try {
          return await m.run();
        } finally {
          memberTimings[m.id] = this._nowMs() - t0;
        }
      }));

      const results = {};
      for (let i = 0; i < members.length; i++) {
        const outcome = settled[i];
        if (outcome.status === "fulfilled") {
          results[members[i].id] = outcome.value;
        } else {
          // A runner is documented to never throw past its own internal try/catch;
          // reaching here means that documented invariant broke. Degrade this member
          // alone — never let it discard its five siblings (D-08) — rather than letting
          // the rejection propagate into this function's own outer catch and collapse the
          // whole payload the way `Promise.all` would.
          Log.error("MMM-SPCOutlook " + members[i].id + ": runner rejected unexpectedly", outcome.reason);
          anyStale = true;
          results[members[i].id] = { payload: null, entries: [], anyStale: true };
        }
      }
      Log.info("MMM-SPCOutlook: new-product batch settled in " + (this._nowMs() - settleStart) +
               "ms " + JSON.stringify(memberTimings));

      const eroPayload = results.excessiveRain.payload;
      if (results.excessiveRain.anyStale) anyStale = true;
      // D-04: attribute this registry product's own already-computed anyStale to its
      // hazardTaxonomy source id, beside (not instead of) the payload-wide read above.
      if (results.excessiveRain.anyStale) staleBySource["wpc-ero"] = true;
      // MERGE-01: excessiveRain.day1ValidTime has had no consumer since 14 D-03 and is
      // unexercised end-to-end until this read — a single sample logged once per process
      // catches a null/malformed field now. D-11 makes ERO straight-through and
      // `valid_time` is a composite display string, not a machine anchor, so day
      // attribution is never built on it.
      if (!this._loggedEroValidTimeSample) {
        Log.info("MMM-SPCOutlook: excessiveRain.day1ValidTime sample: " +
                 JSON.stringify(eroPayload.day1ValidTime));
        this._loggedEroValidTimeSample = true;
      }

      const wssiPayload = results.winterImpact.payload;
      if (results.winterImpact.anyStale) anyStale = true;
      if (results.winterImpact.anyStale) staleBySource["wpc-wssi"] = true;

      const hazardsPayload = results.hazardsOutlook.payload;
      if (results.hazardsOutlook.anyStale) anyStale = true;
      if (results.hazardsOutlook.anyStale) staleBySource["wpc-hazards"] = true;

      const heatRiskPayload = results.heatRisk.payload;
      if (results.heatRisk.anyStale) anyStale = true;
      if (results.heatRisk.anyStale) staleBySource["heatrisk"] = true;

      const advisories = { spcMD: [], mpd: [] };
      // D-04: PRODUCT_REGISTRY's kml-advisory row ids ("spcMD", "mpd") are not
      // hazardTaxonomy.js's source ids ("spc-md", "wpc-mpd") — this two-entry map is the
      // one place that translation happens, read only by the staleBySource write below.
      const kmlRowSourceId = { spcMD: "spc-md", mpd: "wpc-mpd" };
      for (const row of kmlRows) {
        advisories[row.id] = results[row.id].entries;
        if (results[row.id].anyStale) anyStale = true;
        if (results[row.id].anyStale) staleBySource[kmlRowSourceId[row.id]] = true;
      }

      // WR-08: a layer that lost one or more polygons to unusable geometry produced a
      // partial answer, and a partial answer is not an answer — flag it exactly as a
      // failed fetch is flagged, so the user sees ⚠ rather than a confident reading.
      if ((this._unusableFeatureCount || 0) > unusableFeaturesAtStart) anyStale = true;

      const gridDays = this._buildGridDays(gridAnchorInfo);

      // Phase 18 merge accumulators (D-01's shared-in-memory-values constraint): declared
      // here, in the wave-1 shape plan, so plan 18-03 (wpc-hazards, heatrisk) and plan
      // 18-04 (the remaining four sources) never write into a structure the other plan
      // has not yet created. Not emitted in the payload by this plan; plan 18-05 owns
      // `sources`. Per-source Sets are created lazily on first write — seeding one key
      // per source id here would restate the source-id roster hazardTaxonomy.js already
      // owns (D-08), exactly the two-places-declare-one-rule drift WR-03 condemns.
      const reportedDays = {};
      const activeDays = {};
      const unmappedLabels = {};

      // Record that `sourceId` produced ANY reading for `gridDay` (present, whether or
      // not it was above that source's no-risk floor).
      const noteReported = (sourceId, gridDay) => {
        if (!reportedDays[sourceId]) reportedDays[sourceId] = new Set();
        reportedDays[sourceId].add(gridDay);
      };

      // Record that `sourceId` produced an ABOVE-floor reading for `gridDay`.
      const noteActive = (sourceId, gridDay) => {
        if (!activeDays[sourceId]) activeDays[sourceId] = new Set();
        activeDays[sourceId].add(gridDay);
      };

      // D-07: record a pass-through label with no taxonomy entry, deduped per source and
      // capped at UNMAPPED_LABELS_MAX_PER_SOURCE. This is a diagnostic ledger, not a
      // filter (WR-06) — past the cap the label still RENDERS verbatim in `days[].hazards`,
      // it is simply no longer additionally recorded here.
      const noteUnmapped = (sourceId, label) => {
        if (!unmappedLabels[sourceId]) unmappedLabels[sourceId] = [];
        const truncated = String(label).slice(0, HAZARDS_LOG_LABEL_MAX_CHARS);
        if (unmappedLabels[sourceId].includes(truncated)) return;
        if (unmappedLabels[sourceId].length >= UNMAPPED_LABELS_MAX_PER_SOURCE) return;
        unmappedLabels[sourceId].push(truncated);
      };

      const gridNotes = { noteReported, noteActive, noteUnmapped };

      // MERGE-01/D-01: re-bucket the two wave-2 sources onto the SPC grid, reading the
      // SAME in-memory values (`gridMatches`/`gridTuples`) their legacy blocks were built
      // from — no second fetch, no second parse. `results.hazardsOutlook`/`results.heatRisk`
      // are always well-shaped objects here (Promise.allSettled's rejection branch above
      // substitutes `{ payload: null, entries: [], anyStale: true }` on an unexpected
      // throw, which has no `gridMatches`/`gridTuples` key — `|| []` degrades that case to
      // an empty array rather than throwing here too).
      this._addHazardsOutlookGridEntries(
        gridDays, results.hazardsOutlook.gridMatches || [], gridAnchorInfo, gridNotes
      );
      this._addHeatRiskGridEntries(
        gridDays, results.heatRisk.gridTuples || [], gridAnchorInfo, gridNotes
      );

      // MERGE-01/D-01: spc-convective and spc-fire predate the registry (14 D-08), so
      // there is no results.<id>.payload for them — spcLocals is built here from the
      // exact same named locals the legacy day1..day8/fireWeather literals below read,
      // never a second fetch or re-derivation.
      const spcLocals = {
        extended,
        riskToValue, valueToFullRisk, riskToColor,
        fireRiskToValue, fireValueToFull, fireRiskToColor,
        categorical: {
          1: {
            risk: day1Risk, probRisk: day1ProbRisk,
            torRisk: day1TorRisk, torCig: day1TorCig,
            hailRisk: day1HailRisk, hailCig: day1HailCig,
            windRisk: day1WindRisk, windCig: day1WindCig
          },
          2: {
            risk: day2Risk, probRisk: day2ProbRisk,
            torRisk: day2TorRisk, torCig: day2TorCig,
            hailRisk: day2HailRisk, hailCig: day2HailCig,
            windRisk: day2WindRisk, windCig: day2WindCig
          },
          3: { risk: day3Risk, probRisk: day3ProbRisk, cig: day3Cig }
        },
        probabilistic: {
          4: { risk: day4Risk, probRisk: day4ProbRisk, sign: day4Sign },
          5: { risk: day5Risk, probRisk: day5ProbRisk, sign: day5Sign },
          6: { risk: day6Risk, probRisk: day6ProbRisk, sign: day6Sign },
          7: { risk: day7Risk, probRisk: day7ProbRisk, sign: day7Sign },
          8: { risk: day8Risk, probRisk: day8ProbRisk, sign: day8Sign }
        },
        fire: {
          1: day1FireRisk, 2: day2FireRisk, 3: day3FireRisk, 4: day4FireRisk,
          5: day5FireRisk, 6: day6FireRisk, 7: day7FireRisk, 8: day8FireRisk
        }
      };
      this._addSpcGridEntries(gridDays, spcLocals, gridNotes);

      // MERGE-01/D-01: wpc-ero and wpc-wssi are the two 12Z-native registry-driven
      // sources, reading the SAME eroPayload/wssiPayload blocks the legacy
      // excessiveRain/winterImpact keys below are built from.
      this._addRegistryDayGridEntries(
        gridDays, "wpc-ero", eroPayload, PRODUCT_REGISTRY.excessiveRain, gridNotes, productToggles
      );
      this._addRegistryDayGridEntries(
        gridDays, "wpc-wssi", wssiPayload, PRODUCT_REGISTRY.winterImpact, gridNotes, productToggles
      );

      // MERGE-02/MERGE-03/MERGE-04/D-14: resolve precedence per grid day, independently —
      // AFTER all five entry-assembly calls above, so every source's entries for this day
      // exist before any dimension is resolved, and BEFORE the return statement, so
      // nothing downstream (including `_buildGridSummary`) ever needs a second pass.
      for (let d = 1; d <= GRID_DAY_COUNT; d++) {
        this._resolveGridDayPrecedence(gridDays[String(d)], d, reportedDays);
      }

      // D-04: sourceHealth first — _buildGridSummary counts over it (`enabledSourceCount`/
      // `reportingSourceCount`).
      const sourceHealth = this._buildSourceHealth(
        productToggles, reportedDays, activeDays, unmappedLabels, staleBySource,
        gridAnchorInfo, results
      );
      const gridSummary = this._buildGridSummary(
        gridDays, hazardsPayload.windowBand, advisories, sourceHealth, gridAnchorInfo
      );

      // PERF-03/D-17: name the slowest source explicitly (the key with the maximum
      // elapsed value) rather than leaving a reader to scan the JSON blob the batch-settled
      // log line above already prints. Held on a helper-global read in-process by
      // `socketNotificationReceived`, NOT added as a payload key — a timing figure that
      // varies every poll would defeat PERF-02's byte-identity intent for cache comparison,
      // and the socket handler runs in the same process so it needs no transport for this.
      let slowestId = null, slowestMs = -1;
      for (const [id, ms] of Object.entries(memberTimings)) {
        if (ms > slowestMs) { slowestId = id; slowestMs = ms; }
      }
      this._lastPollTimings = {
        memberTimings,
        slowest: slowestId === null ? null : { id: slowestId, ms: slowestMs }
      };

      return {
        // WR-04: the oldest cached reading that contributed to this payload, or null when
        // the degrade was a hard failure with nothing cached to age.
        ...(anyStale ? { _stale: true, _staleAsOf: this._oldestStaleAt } : {}),
        "day48Risk": day48Risk,
          day1: {
           "risk": day1Risk,
           "text": valueToFullRisk[day1Risk],
           "color": riskToColor[day1Risk],
           "probRisk": day1ProbRisk,
           "torRisk": day1TorRisk,
           "torCig": day1TorCig,
           "hailRisk": day1HailRisk,
           "hailCig": day1HailCig,
           "windRisk": day1WindRisk,
           "windCig": day1WindCig,
           ...buildProximitySubtree({
             categorical: day1CatProximity,
             torCig: day1TorCigProximity,
             hailCig: day1HailCigProximity,
             windCig: day1WindCigProximity
           })
          },
          day2: {
            "risk": day2Risk,
            "text": valueToFullRisk[day2Risk],
            "color": riskToColor[day2Risk],
            "probRisk": day2ProbRisk,
            "torRisk": day2TorRisk,
            "torCig": day2TorCig,
            "hailRisk": day2HailRisk,
            "hailCig": day2HailCig,
            "windRisk": day2WindRisk,
            "windCig": day2WindCig,
            ...buildProximitySubtree({
              categorical: day2CatProximity,
              torCig: day2TorCigProximity,
              hailCig: day2HailCigProximity,
              windCig: day2WindCigProximity
            })
          },
          day3: {
          "risk": day3Risk,
          "text": valueToFullRisk[day3Risk],
          "color": riskToColor[day3Risk],
          "probRisk": day3ProbRisk,
          "cig": day3Cig,
          ...buildProximitySubtree({
            categorical: day3CatProximity,
            cig: day3CigProximity
          })
          },
        day4: {
          "risk": day4Risk,
          "probRisk": day4ProbRisk,
          "sign": day4Sign,
          "color": riskToColor[day4Risk],
          "text": valueToFullRisk[day4Risk],
        },
        day5: {
          "risk": day5Risk,
          "probRisk": day5ProbRisk,
          "sign": day5Sign,
          "color": riskToColor[day5Risk],
          "text": valueToFullRisk[day5Risk],
        },
        day6: {
          "risk": day6Risk, 
          "probRisk": day6ProbRisk,
          "sign": day6Sign,
          "color": riskToColor[day6Risk],
          "text": valueToFullRisk[day6Risk],
        },
        day7: {
          "risk": day7Risk, 
          "probRisk": day7ProbRisk,
          "sign": day7Sign,
          "color": riskToColor[day7Risk],
          "text": valueToFullRisk[day7Risk],
        },
        day8: {
          "risk": day8Risk,
          "probRisk": day8ProbRisk,
          "sign": day8Sign,
          "color": riskToColor[day8Risk],
          "text": valueToFullRisk[day8Risk],
        },
        fireWeather: {
          day1Risk: day1FireRisk,
          day1Text: fireValueToFull[day1FireRisk],
          day2Risk: day2FireRisk,
          day2Text: fireValueToFull[day2FireRisk],
          day3Risk: day3FireRisk,
          day3Text: fireValueToFull[day3FireRisk],
          day4Risk: day4FireRisk,
          day4Text: fireValueToFull[day4FireRisk],
          day5Risk: day5FireRisk,
          day5Text: fireValueToFull[day5FireRisk],
          day6Risk: day6FireRisk,
          day6Text: fireValueToFull[day6FireRisk],
          day7Risk: day7FireRisk,
          day7Text: fireValueToFull[day7FireRisk],
          day8Risk: day8FireRisk,
          day8Text: fireValueToFull[day8FireRisk]
        },
        excessiveRain: eroPayload,
        winterImpact: wssiPayload,
        // Sibling block per Phase 14 D-02 — Phase 18 owns the merged schema; do not
        // pre-adopt it here.
        hazardsOutlook: hazardsPayload,
        // heatRisk is its own sibling block for the same reason — Phase 14 D-02, not
        // Phase 18's unified schema. day1..dayN each carry { category, text, color };
        // category is the raw 0-4 the service reported, or null for no reading (Phase 18
        // MERGE-03 must tell those two apart).
        heatRisk: heatRiskPayload,
        advisories: advisories,
        days: gridDays,
        summary: gridSummary,
        sources: sourceHealth
      };

    } catch (err) {
      Log.error("Error fetching or parsing SPC data", err);
      return { error: err.toString() };
    }
  },

  /**
   * Find the feature whose polygon contains the given location.
   * @param geojson - a GeoJSON FeatureCollection (or anything, including junk)
   * @param lat - latitude of the user location
   * @param lon - longitude of the user location
   * @returns the FIRST feature whose geometry contains the point, or null when the body
   *   is unusable or no feature contains it.
   *
   *   CR-02: this returns the containing feature rather than a boolean because its one
   *   caller needs the *winning* polygon's `name`, not `features[0]`'s — `features[0]` is
   *   whichever polygon the server serialised first, which is precisely the anti-pattern
   *   `_validTimeOfWinner` exists to eliminate for the ERO. It also no longer iterates
   *   `geojson.features` unguarded: a body carrying no features array threw
   *   "geojson.features is not iterable" out of the MD loop and discarded every other
   *   active MD, and a null array element threw on `.geometry`.
   */
  checkInPolygon(geojson, lat, lon){
    const pt = turf.point([lon, lat]);
    if (!geojson || !Array.isArray(geojson.features)) return null;
    for (const feature of geojson.features) {
      if (!feature || !feature.geometry) continue;

      // WR-04: turf.polygon/multiPolygon throw on a ring with fewer than four positions,
      // on an unclosed ring, and on non-array coordinates — the same throws extractPolygons
      // is already hardened against. Unguarded here, one malformed Placemark aborted the
      // whole feature scan for that candidate, and the caller's per-candidate catch then
      // discarded the entire advisory. When the malformed Placemark is serialised BEFORE a
      // valid one that does contain the user, that is a false negative produced by document
      // order alone. Containing it per feature matches extractPolygons, and reusing
      // _unusableFeatureCount makes the drop surface as ⚠ through getSpcOutlook's existing
      // sampling rather than vanishing.
      const geomType = feature.geometry.type;
      let poly;
      try {
        if (geomType === "Polygon") poly = turf.polygon(feature.geometry.coordinates);
        else if (geomType === "MultiPolygon") poly = turf.multiPolygon(feature.geometry.coordinates);
        else continue;
      } catch (err) {
        Log.error("MMM-SPCOutlook checkInPolygon: skipping a feature with unusable geometry", err);
        this._unusableFeatureCount = (this._unusableFeatureCount || 0) + 1;
        continue;
      }
      if (turf.booleanPointInPolygon(pt, poly)) return feature;
    }
    return null;
  },

});